// Bakes the rig mockup into Aseprite-ready PNGs: one image per part (with pivots) and
// fixed-timestep animation frames per action. Assemble them with tools/*.lua.
//
//   PLAYWRIGHT_CORE=/path/to/playwright-core CHROME=/path/to/chrome-headless-shell \
//     node art/mech-redesign/tools/bake.cjs <outDir>
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const OUT = path.resolve(process.argv[2] || 'art/mech-redesign/.bake');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'mockup.html');
const FPS = 15;
const CROP = { left: 44, right: 72, up: 78, down: 6 };

// Each tag: recorded duration, keys held (optionally until holdUntil), one-shot taps by time.
const TAGS = [
  { name: 'idle', dur: 2.0 },
  { name: 'walk', pre: 0.6, dur: 1.09, hold: ['right'] },
  { name: 'backpedal', pre: 0.6, dur: 1.09, hold: ['left'], aimDx: 90 },
  { name: 'dash', dur: 0.8, taps: { 0: 'dash' } },
  { name: 'jump', dur: 2.6, taps: { 0: 'jump' }, hold: ['jump'], holdUntil: 1.0 },
  { name: 'cannon', dur: 1.0, taps: { 0: 'lmb', 0.5: 'lmb' } },
  { name: 'gatling', dur: 1.8, hold: ['rmb'], holdUntil: 1.2 },
  { name: 'missile', dur: 1.0, taps: { 0: 'e' } },
  { name: 'hurt', dur: 0.7, taps: { 0: 'hit' } },
  { name: 'repair', dur: 4.4, taps: { 0: 'q' } },
  { name: 'relay', dur: 1.6, hold: ['f'], relay: true },
  { name: 'emp', dur: 2.6, taps: { 0: 'emp' } },
  { name: 'death', dur: 2.2, taps: { 0: 'kill' } },
  { name: 'dropin', dur: 1.8, dropIn: true },
];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__mechPaused = true; window.__mech.setBare(true); });

  for (const concept of ['harrow', 'bastion']) {
    const dir = path.join(OUT, concept);
    fs.mkdirSync(path.join(dir, 'parts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });

    // ── parts ──
    const parts = await page.evaluate((concept) => {
      const set = concept === 'harrow' ? window.__mech.H : window.__mech.B;
      return Object.entries(set).map(([name, p]) => ({ name, w: p.w + 2, h: p.h + 2, px: p.px + 1, py: p.py + 1, png: p.n.toDataURL() }));
    }, concept);
    for (const p of parts) fs.writeFileSync(path.join(dir, 'parts', p.name + '.png'), Buffer.from(p.png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(dir, 'parts', 'parts.json'), JSON.stringify(parts.map(({ png, ...rest }) => rest), null, 2));

    // ── animation frames ──
    const manifest = { fps: FPS, w: CROP.left + CROP.right, h: CROP.up + CROP.down, tags: [] };
    for (const tag of TAGS) {
      const frames = await page.evaluate(({ concept, tag, FPS, CROP }) => {
        const api = window.__mech;
        api.setConcept(concept);
        api.resetMech(!!tag.dropIn);
        const M = api.M, I = api.I;
        M.x = tag.relay ? api.relay.x + 38 : 150;
        if (tag.relay) api.relay.done = 0;
        I.mouseIn = true;
        const aim = () => { I.mx = M.x + (tag.aimDx || 90); I.my = M.y - 44; };
        const step = (t, record) => {
          aim();
          for (const k of ['left', 'right', 'jump', 'rmb', 'f']) I[k] = false;
          if (tag.hold && t < (tag.holdUntil ?? 99)) for (const k of tag.hold) I[k] = true;
          api.update(1 / 60);
        };
        if (!tag.dropIn) for (let i = 0; i < 40; i++) step(-1);
        if (tag.pre) for (let i = 0; i < tag.pre * 60; i++) step(0);
        const out = [], per = 60 / FPS, total = Math.round(tag.dur * FPS);
        const tapTimes = Object.keys(tag.taps || {}).map(Number);
        const crop = document.createElement('canvas');
        crop.width = CROP.left + CROP.right; crop.height = CROP.up + CROP.down;
        const cg = crop.getContext('2d');
        let n = 0;
        for (let f = 0; f < total; f++) {
          for (let k = 0; k < per; k++, n++) {
            const t = n / 60;
            for (const tt of tapTimes) if (Math.abs(t - tt) < 0.5 / 60) api.pressed.add(tag.taps[tt]);
            step(t);
          }
          api.render();
          cg.clearRect(0, 0, crop.width, crop.height);
          cg.drawImage(api.cv, api.sx(M.x) - CROP.left, api.sy(M.y) - CROP.up, crop.width, crop.height, 0, 0, crop.width, crop.height);
          out.push(crop.toDataURL());
        }
        return out;
      }, { concept, tag, FPS, CROP });
      frames.forEach((png, i) => fs.writeFileSync(path.join(dir, 'frames', `${tag.name}_${String(i).padStart(3, '0')}.png`), Buffer.from(png.split(',')[1], 'base64')));
      manifest.tags.push({ name: tag.name, count: frames.length });
      console.log(concept, tag.name, frames.length);
    }
    fs.writeFileSync(path.join(dir, 'frames', 'manifest.json'), JSON.stringify(manifest, null, 2));
  }
  await browser.close();
})();
