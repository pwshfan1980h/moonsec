// Scripted playtest capture: drives the real game with keyboard/mouse and screenshots
// the area around the player after each step.
//
//   PLAYWRIGHT_CORE=... CHROME=... node tools/shots/playtest.mjs [--level 2] [--out .shots/playtest] [--query "armor=8"]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const args = process.argv.slice(2);
const opt = (n, f) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
const LEVEL = opt('level', '2');
const OUT = path.resolve(opt('out', '.shots/playtest'));
const EXTRA = opt('query', '');
const PORT = Number(opt('port', '5393'));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
mkdirSync(OUT, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/moonsec/`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const q = new URLSearchParams({ level: LEVEL, seed: '1234', noguide: '1' });
for (const [k, v] of new URLSearchParams(EXTRA)) q.set(k, v);
await page.goto(`http://localhost:${PORT}/moonsec/?${q}`);
await page.waitForFunction(() => window.__moonsecReady === true, null, { timeout: 30000 });

const player = () => page.evaluate(() => {
  const g = window.__moonsec.game.scene.getScene('Game');
  const cam = g.cameras.main;
  const p = g.player;
  return { sx: (p.x - cam.worldView.x) * cam.zoom, sy: (p.y - cam.worldView.y) * cam.zoom, hp: p.hp };
});
let n = 0;
async function snap(name) {
  const p = await player();
  const x = Math.max(0, Math.min(1920 - 640, p.sx - 320)), y = Math.max(0, Math.min(1080 - 400, p.sy - 280));
  await page.screenshot({ path: path.join(OUT, `${String(n++).padStart(2, '0')}-${name}.png`), clip: { x, y, width: 640, height: 400 } });
}
const aimAt = async (dx, dy) => { const p = await player(); await page.mouse.move(p.sx + dx, p.sy + dy); };
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

await page.waitForTimeout(1800); // drop-in
await snap('dropin-landed');
await aimAt(300, -60); await page.waitForTimeout(400); await snap('idle-aim');
await page.keyboard.down('d'); await page.waitForTimeout(500); await snap('walk'); await page.keyboard.up('d');
await aimAt(300, -60); await page.keyboard.down('a'); await page.waitForTimeout(500); await snap('backpedal'); await page.keyboard.up('a');
await aimAt(300, -200); await page.waitForTimeout(300);
await page.mouse.down({ button: 'left' }); await page.waitForTimeout(40); await snap('cannon-fire'); await page.mouse.up({ button: 'left' });
await page.mouse.down({ button: 'right' }); await page.waitForTimeout(500); await snap('gatling'); await page.mouse.up({ button: 'right' });
await page.keyboard.press('e'); await page.waitForTimeout(120); await snap('missile-hatch');
await page.keyboard.down(' '); await page.waitForTimeout(700); await snap('jets'); await page.keyboard.up(' ');
await page.waitForTimeout(900); await snap('landed');
await page.keyboard.press('Shift'); await page.waitForTimeout(150); await snap('surge');
await page.waitForTimeout(800);
await page.keyboard.press('q'); await page.waitForTimeout(600); await snap('repair');
await page.keyboard.down('d'); await page.waitForTimeout(700); await snap('walk-2'); await page.keyboard.up('d');
const errors = await page.evaluate(() => window.__moonsecErrors ?? []);
console.log(errors.length ? `errors: ${errors.join('\n')}` : `ok — ${n} frames in ${path.relative(process.cwd(), OUT)}`);
await browser.close();
vite.kill();
process.exit(errors.length ? 1 : 0);
