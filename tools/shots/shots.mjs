// Headless screenshot harness. Starts a Vite dev server, loads each level with
// deterministic dev params, waits for window.__moonsecReady, and saves PNGs.
//
//   PLAYWRIGHT_CORE=/path/to/playwright-core CHROME=/path/to/chrome-headless-shell \
//     node tools/shots/shots.mjs [--out .shots/current] [--levels 0,1,2,3,4] [--gfx crunchy,clean]
//     [--extra "rigtest=all" --extra "ui=pause"] [--freeze 4000]
//
// Exits non-zero if the page reports errors (window.__moonsecErrors) or never becomes ready.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const multi = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const OUT = path.resolve(opt('out', '.shots/current'));
const LEVELS = opt('levels', '0,1,2,3,4').split(',').filter(Boolean);
const GFX = opt('gfx', '').split(',').filter(Boolean);
const FREEZE = Number(opt('freeze', '4000'));
const SEED = opt('seed', '1234');
const EXTRA = multi('extra');
const PORT = Number(opt('port', '5391'));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

mkdirSync(OUT, { recursive: true });

async function startVite() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/moonsec/`)).ok) return vite; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  vite.kill();
  throw new Error('vite did not start');
}

const jobs = [];
for (const level of LEVELS) {
  for (const gfx of GFX.length ? GFX : ['']) {
    const q = new URLSearchParams({ level, seed: SEED, freeze: String(FREEZE) });
    if (gfx) q.set('gfx', gfx);
    jobs.push({ name: `lvl${level}${gfx ? '-' + gfx : ''}`, query: q.toString() });
  }
}
for (const extra of EXTRA) {
  const q = new URLSearchParams(extra);
  if (!q.has('freeze')) q.set('freeze', String(FREEZE));
  if (!q.has('seed')) q.set('seed', SEED);
  jobs.push({ name: extra.replace(/[^a-z0-9]+/gi, '-'), query: q.toString() });
}

const vite = await startVite();
let failed = false;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const job of jobs) {
    await page.goto(`http://localhost:${PORT}/moonsec/?${job.query}`);
    try {
      await page.waitForFunction(() => window.__moonsecReady === true, null, { timeout: FREEZE + 30000 });
    } catch {
      console.error(`✗ ${job.name}: never became ready`);
      failed = true;
    }
    await page.waitForTimeout(250);
    const errors = await page.evaluate(() => window.__moonsecErrors ?? []);
    const file = path.join(OUT, `${job.name}.png`);
    await page.screenshot({ path: file });
    if (errors.length) { failed = true; console.error(`✗ ${job.name}:`, errors); }
    else console.log(`✓ ${job.name} → ${path.relative(process.cwd(), file)}`);
  }
} finally {
  await browser.close();
  vite.kill();
}
process.exit(failed ? 1 : 0);
