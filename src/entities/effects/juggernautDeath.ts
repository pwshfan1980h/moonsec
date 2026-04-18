import Phaser from 'phaser';
import type { GameScene } from '../../scenes/GameScene';

export interface ChunkSpec {
  offX: number; offY: number;
  vx: number; vy: number;
  w: number; h: number;
  detonateDelay: number;
}

export interface DetonationSpec {
  delay: number;
  dx: number;
  dy: number;
}

export interface JuggernautDeathOpts {
  scale?: number;
  chunks?: ChunkSpec[];
  detonations?: DetonationSpec[];
  fadeDelayMs?: number;
  fadeDurationMs?: number;
  deathEvent?: string | null;
  tumble?: boolean;
}

const DEFAULT_CHUNKS: ChunkSpec[] = [
  { offX: -40, offY: -10, vx: -180, vy: -140, w: 30, h: 40, detonateDelay: 500 },
  { offX:  40, offY: -10, vx:  180, vy: -140, w: 30, h: 40, detonateDelay: 750 },
];

const DEFAULT_DETONATIONS: DetonationSpec[] = [
  { delay:    0, dx:   0, dy:   0 },
  { delay:  320, dx: -50, dy:  20 },
  { delay:  640, dx:  45, dy: -25 },
  { delay:  960, dx: -20, dy:  35 },
  { delay: 1280, dx:  55, dy:  10 },
  { delay: 1650, dx: -35, dy: -15 },
  { delay: 2050, dx:   0, dy:   0 },
];

export function playJuggernautDeath(
  scene: GameScene,
  sprite: Phaser.Physics.Arcade.Sprite,
  opts: JuggernautDeathOpts = {},
): void {
  const scale = opts.scale ?? 1;
  const chunks = opts.chunks ?? DEFAULT_CHUNKS.map(c => ({
    offX: c.offX * scale, offY: c.offY * scale,
    vx: c.vx * scale, vy: c.vy * scale,
    w: Math.max(6, Math.round(c.w * scale)),
    h: Math.max(6, Math.round(c.h * scale)),
    detonateDelay: c.detonateDelay,
  }));
  const detonations = opts.detonations ?? DEFAULT_DETONATIONS.map(d => ({
    delay: d.delay, dx: d.dx * scale, dy: d.dy * scale,
  }));
  const fadeDelay = opts.fadeDelayMs ?? 2400;
  const fadeDuration = opts.fadeDurationMs ?? 700;
  const doTumble = opts.tumble ?? true;
  const deathEvent = opts.deathEvent ?? null;

  sprite.stop();

  if (doTumble) {
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setCollideWorldBounds(false);
      body.setAllowGravity(true);
      body.setVelocity(Phaser.Math.Between(-40, 40), -60);
      body.setAngularVelocity(Phaser.Math.Between(80, 140) * (Math.random() < 0.5 ? 1 : -1));
    }
  }

  for (const c of chunks) spawnChunk(scene, sprite, c, scale);

  detonations.forEach(({ delay, dx, dy }, i) => {
    scene.time.delayedCall(delay, () => {
      if (!scene?.sys.isActive() || !sprite.active) return;
      const isFinal = i === detonations.length - 1;
      scene.spawnExplosion(sprite.x + dx, sprite.y + dy);
      scene.audio.playAt('explosion', {
        rate:   0.38 + i * 0.06,
        detune: -600 + i * 80,
        volume: isFinal ? 1.0 : 0.85,
      });
      scene.cameras.main.shake(
        isFinal ? 280 : 90,
        isFinal ? 0.018 : 0.007,
      );
    });
  });

  scene.time.delayedCall(400, () => {
    if (scene?.sys.isActive()) {
      scene.audio.playAt('death', { rate: 0.4, detune: -400, volume: 0.7 });
    }
  });

  scene.time.delayedCall(fadeDelay, () => {
    if (!scene?.sys.isActive() || !sprite.active) return;
    scene.tweens.add({
      targets: sprite,
      alpha: 0,
      duration: fadeDuration,
      onComplete: () => {
        if (deathEvent) scene.events.emit(deathEvent, sprite.x, sprite.y);
        sprite.destroy();
      },
    });
  });
}

function spawnChunk(
  scene: GameScene,
  sprite: Phaser.Physics.Arcade.Sprite,
  spec: ChunkSpec,
  scale: number,
): void {
  const chunk = scene.add.rectangle(
    sprite.x + spec.offX, sprite.y + spec.offY, spec.w, spec.h, 0x45475a,
  );
  chunk.setStrokeStyle(2, 0x14141e);
  chunk.setDepth(10);
  scene.physics.add.existing(chunk);
  const body = chunk.body as Phaser.Physics.Arcade.Body;
  body.setAllowGravity(true);
  body.setVelocity(spec.vx, spec.vy);
  body.setAngularVelocity(Phaser.Math.Between(80, 140) * (Math.random() < 0.5 ? 1 : -1));

  scene.time.delayedCall(spec.detonateDelay, () => {
    if (!scene?.sys.isActive() || !chunk.active) return;
    scene.spawnExplosion(chunk.x, chunk.y);
    scene.audio.playAt('explosion', { rate: 0.5, detune: -300, volume: 0.8 });
    scene.cameras.main.shake(120 * scale, 0.008 * scale);
    scene.tweens.add({
      targets: chunk, alpha: 0, duration: 220,
      onComplete: () => chunk.destroy(),
    });
  });
}
