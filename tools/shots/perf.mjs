// Frame-time benchmark. Use a real (headed) Chrome — software WebGL timings are meaningless.
//
//   PLAYWRIGHT_CORE=/path/to/playwright-core CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     node tools/shots/perf.mjs [--levels 0,1,2,3,4] [--gfx crunchy] [--seconds 20]
//
// Reports p50 / p95 frame time and the count of frames over 20 ms per level.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const LEVELS = opt('levels', '0,1,2,3,4').split(',');
const GFX = opt('gfx', '');
const SECONDS = Number(opt('seconds', '20'));
const PORT = Number(opt('port', '5392'));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/moonsec/`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: false });
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const level of LEVELS) {
    const q = new URLSearchParams({ level, seed: '1234', perf: '1' });
    if (GFX) q.set('gfx', GFX);
    await page.goto(`http://localhost:${PORT}/moonsec/?${q}`);
    await page.waitForFunction(() => window.__moonsecReady === true, null, { timeout: 30000 });
    await page.waitForTimeout(2000); // let the first wave settle
    const deltas = await page.evaluate((ms) => new Promise((resolve) => {
      const out = [];
      let last = performance.now();
      const end = last + ms;
      const tick = (now) => {
        out.push(now - last); last = now;
        if (now < end) requestAnimationFrame(tick); else resolve(out);
      };
      requestAnimationFrame(tick);
    }), SECONDS * 1000);
    deltas.sort((a, b) => a - b);
    const pct = (p) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))];
    rows.push({ level, frames: deltas.length, p50: pct(0.5).toFixed(2), p95: pct(0.95).toFixed(2), over20: deltas.filter((d) => d > 20).length });
  }
} finally {
  await browser.close();
  vite.kill();
}
console.table(rows);
