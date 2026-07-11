import type Phaser from 'phaser';
import type { GameScene } from '../../scenes/GameScene';

export type EnemyArrivalStyle = 'air' | 'sniper' | 'bomber' | 'heavy' | 'ground' | 'mine';

/** Visual-only spawn projection. Never changes scale, position, body, or AI state. */
export function presentEnemyArrival(
  scene: GameScene,
  target: Phaser.GameObjects.Sprite,
  color: number,
  style: EnemyArrivalStyle,
): void {
  target.setAlpha(0.25);
  scene.tweens.add({
    targets: target,
    alpha: 1,
    duration: style === 'heavy' ? 420 : 260,
    ease: 'Quad.easeOut',
  });

  const gfx = scene.add.graphics()
    .setPosition(target.x, target.y)
    .setDepth(Math.max(2, target.depth - 1))
    .setBlendMode('ADD');

  const radius = style === 'heavy' ? 48 : style === 'bomber' ? 40 : style === 'ground' ? 34 : 25;
  gfx.lineStyle(style === 'heavy' ? 3 : 2, color, 0.8);

  if (style === 'ground' || style === 'mine') {
    gfx.lineBetween(-radius, 2, radius, 2);
    gfx.lineBetween(-radius * 0.65, -5, radius * 0.65, -5);
  } else if (style === 'sniper') {
    const gap = 9;
    gfx.lineBetween(-radius, 0, -gap, 0);
    gfx.lineBetween(gap, 0, radius, 0);
    gfx.lineBetween(0, -radius, 0, -gap);
    gfx.lineBetween(0, gap, 0, radius);
  } else if (style === 'bomber') {
    gfx.strokeEllipse(0, 5, radius * 2, radius);
    gfx.lineBetween(-12, 18, 0, 34);
    gfx.lineBetween(12, 18, 0, 34);
  } else {
    gfx.strokeCircle(0, 0, radius);
    if (style === 'heavy') gfx.strokeCircle(0, 0, radius * 0.68);
  }

  scene.tweens.add({
    targets: gfx,
    alpha: 0,
    scaleX: 1.35,
    scaleY: 1.35,
    duration: style === 'heavy' ? 620 : 440,
    ease: 'Quad.easeOut',
    onComplete: () => gfx.destroy(),
  });
}

/** Consistent white-hot hit confirmation that safely restores the family tint. */
export function flashEnemyHit(
  scene: GameScene,
  target: Phaser.GameObjects.Sprite,
  baseTint?: number,
  duration = 120,
): void {
  const token = ((target.getData('_hitFlashToken') as number | undefined) ?? 0) + 1;
  target.setData('_hitFlashToken', token);
  target.setTintFill();
  scene.time.delayedCall(duration, () => {
    if (!target.active || target.getData('_hitFlashToken') !== token) return;
    if (baseTint === undefined) target.clearTint();
    else target.setTint(baseTint);
  });
}

export function presentEnemyBreakup(scene: GameScene, target: Phaser.GameObjects.Sprite, color: number, count = 3): void {
  scene.spawnEnemyChunks(target.x, target.y, color, count);
}
