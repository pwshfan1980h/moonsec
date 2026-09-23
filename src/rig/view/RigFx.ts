import Phaser from 'phaser';
import { pal, RAMPS, type PaletteName } from '../../render/palette';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

const tints = (names: readonly PaletteName[]) => names.map(pal);
const DEG = 180 / Math.PI;

/**
 * Pooled particle effects for rigs: jets, smoke, sparks, fire, dust, debris, nanites.
 * Every emitter uses the 4×4 'pixel' texture (2×2 virtual pixels) and palette tints, so
 * effects stay chunky and on-palette. Direction and speed are set per call through a
 * shared "shot" record that each emitter's onEmit callbacks read.
 */
export class RigFx {
  private readonly shot = { angle: 0, spread: 20, min: 40, max: 120 };
  private readonly emitters: Emitter[] = [];
  readonly jet: Emitter;
  readonly smoke: Emitter;
  readonly dust: Emitter;
  readonly sparks: Emitter;
  readonly fire: Emitter;
  readonly debris: Emitter;
  readonly nanites: Emitter;
  private arcs: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene, depthBack: number, depthFront: number) {
    const angle = { onEmit: () => this.shot.angle + (Math.random() - 0.5) * this.shot.spread };
    const speed = { onEmit: () => this.shot.min + Math.random() * (this.shot.max - this.shot.min) };
    const mk = (depth: number, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) => {
      const e = scene.add.particles(0, 0, 'pixel', { emitting: false, angle, speed, ...cfg }).setDepth(depth);
      this.emitters.push(e);
      return e;
    };
    this.jet = mk(depthBack, { lifespan: { min: 120, max: 240 }, scale: { start: 1, end: 0.5 }, tint: tints(RAMPS.jet) });
    this.smoke = mk(depthBack, { lifespan: { min: 700, max: 1400 }, scale: { start: 1, end: 2.5 }, alpha: { start: 0.7, end: 0 }, gravityY: -30, tint: tints(RAMPS.smoke) });
    this.dust = mk(depthBack, { lifespan: { min: 400, max: 900 }, scale: { start: 1, end: 2 }, alpha: { start: 0.8, end: 0 }, gravityY: -10, tint: tints(RAMPS.dust) });
    this.sparks = mk(depthFront, { lifespan: { min: 120, max: 320 }, scale: { start: 0.5, end: 0.5 }, gravityY: 600, tint: tints(['cyan3', 'amber1', 'amber1', 'amber0']) });
    this.fire = mk(depthFront, { lifespan: { min: 200, max: 460 }, scale: { start: 1.5, end: 0.25 }, gravityY: -160, tint: tints(RAMPS.fire) });
    this.debris = mk(depthFront, { lifespan: { min: 800, max: 1400 }, scale: { start: 1, end: 1 }, gravityY: 900, rotate: { min: 0, max: 360 }, tint: tints(['hull3', 'hull4', 'hull5', 'hull2']) });
    this.nanites = mk(depthFront, { lifespan: 520, speed: 0, scale: { start: 0.5, end: 0.5 }, tint: tints(['green1', 'green1', 'cyan3', 'green0']) });
    this.arcs = scene.add.graphics().setDepth(depthFront);
  }

  private burst(e: Emitter, x: number, y: number, count: number, angleRad: number, spreadRad: number, min: number, max: number): void {
    this.shot.angle = angleRad * DEG;
    this.shot.spread = spreadRad * DEG;
    this.shot.min = min;
    this.shot.max = max;
    e.emitParticleAt(x, y, count);
  }

  /** Jet flame from a nozzle; `power` 0..1.3 scales density and length. */
  jetFlame(x: number, y: number, angle: number, power: number, dtMs: number): void {
    const n = Math.max(1, Math.round(power * dtMs * 0.12));
    this.burst(this.jet, x, y, n, angle, 0.5, 100 * power, 240 * power);
    if (Math.random() < power * dtMs * 0.01) this.burst(this.smoke, x, y, 1, angle, 0.8, 40, 90);
  }

  puff(x: number, y: number, count = 1, angle = -Math.PI / 2, spread = 0.6): void {
    this.burst(this.smoke, x, y, count, angle, spread, 16, 44);
  }

  kickDust(x: number, y: number, count: number, force = 1): void {
    this.burst(this.dust, x, y, count, -Math.PI / 2, 2.6, 16 * force, 60 * force);
  }

  spark(x: number, y: number, count: number, angle = -Math.PI / 2, spread = 2.4): void {
    this.burst(this.sparks, x, y, count, angle, spread, 80, 240);
  }

  flame(x: number, y: number, count = 1): void {
    this.burst(this.fire, x, y, count, -Math.PI / 2, 0.9, 20, 70);
  }

  chips(x: number, y: number, count: number, angle = -Math.PI / 2): void {
    this.burst(this.debris, x, y, count, angle, 1.6, 120, 320);
  }

  /** Nanite swarm: an orbit of green motes around (x, y). */
  swarm(x: number, y: number, rx: number, ry: number, time: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = time * 5 + (i / count) * Math.PI * 2 + Math.random() * 0.3;
      this.nanites.emitParticleAt(x + Math.cos(a) * rx, y + Math.sin(a) * ry, 1);
    }
  }

  /** EMP lightning crawling over a box, redrawn each frame while active. */
  empArcs(active: boolean, x: number, y: number, w: number, h: number): void {
    const g = this.arcs.clear();
    if (!active) return;
    for (let k = 0; k < 3; k++) {
      if (Math.random() < 0.4) continue;
      g.lineStyle(2, pal(Math.random() < 0.5 ? 'cyan3' : 'cyan2'), 1);
      let px = x + (Math.random() - 0.5) * w, py = y - Math.random() * h;
      g.beginPath();
      g.moveTo(px, py);
      for (let i = 0; i < 5; i++) { px += (Math.random() - 0.5) * 24; py += (Math.random() - 0.5) * 24; g.lineTo(Math.round(px / 2) * 2, Math.round(py / 2) * 2); }
      g.strokePath();
    }
  }

  destroy(): void {
    for (const e of this.emitters) e.destroy();
    this.arcs.destroy();
  }
}
