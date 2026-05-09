import type Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { PICKUP_LIFETIME_MS, RAPID_AMMO_PER_PICKUP } from '../constants';

export type PickupType = 'health' | 'fuel' | 'ammo' | 'score';

export const PICKUP_SIZE = 44;
export const CONTENT_PIXELS = 12;
export const FRAME_PADDING = (16 - CONTENT_PIXELS) / 2;
export const BODY_SIZE = PICKUP_SIZE * (CONTENT_PIXELS / 16);
export const PICKUP_MAGNET_RANGE = 160;
export const PICKUP_MAGNET_PULL = 520;

export interface PickupVisual {
  frame: number;
  tint: number | null;
  points?: number;
}

export function getPickupVisual(type: PickupType, roll: () => number = Math.random): PickupVisual {
  if (type === 'health') return { frame: roll() < 0.5 ? 36 : 44, tint: null };
  if (type === 'fuel') return { frame: roll() < 0.5 ? 32 : 40, tint: null };
  if (type === 'ammo') return { frame: roll() < 0.5 ? 9 : 17, tint: 0x00ffff };
  return { frame: roll() < 0.5 ? 4 : 12, tint: 0xffcc33, points: 100 };
}

export function randomIntBetween(min: number, max: number, roll: () => number = Math.random): number {
  return Math.floor(roll() * (max - min + 1)) + min;
}

type TintablePickup = {
  setTint?: (color: number) => unknown;
  setTintMode?: (mode: any) => unknown;
};

export function applyFillTintCompat(target: TintablePickup, color: number): void {
  target.setTint?.(color);
  const fillMode = (globalThis as unknown as { Phaser?: { TintModes?: { FILL?: unknown } } }).Phaser?.TintModes?.FILL;
  if (fillMode !== undefined) target.setTintMode?.(fillMode);
}

export function getPickupMagnetVelocity(
  pickupX: number,
  pickupY: number,
  targetX: number,
  targetY: number,
  range = PICKUP_MAGNET_RANGE,
  pull = PICKUP_MAGNET_PULL,
): { vx: number; vy: number } | null {
  const dx = targetX - pickupX;
  const dy = targetY - pickupY;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return null;
  const speed = pull * (0.55 + 0.45 * (1 - dist / range));
  const safeDist = dist || 1;
  return { vx: (dx / safeDist) * speed, vy: (dy / safeDist) * speed };
}

export class PickupSystem {
  constructor(private readonly scene: GameScene) {}

  registerCollectionOverlap(): void {
    this.scene.physics.add.overlap(
      this.scene.pickups,
      this.scene.player,
      (_player, pickup) => this.collect(pickup as Phaser.Physics.Arcade.Image),
    );
  }

  spawn(x: number, y: number, type: PickupType): void {
    const key = 'collectables';
    const { frame, tint, points } = getPickupVisual(type);

    const p = this.scene.pickups.get(x, y, key, frame) as Phaser.Physics.Arcade.Image;
    if (!p) return;

    // Crop out the transparent padding baked into each 16x16 frame so the
    // sprite hugs its artwork and sits flush on the ground.
    p.setCrop(FRAME_PADDING, FRAME_PADDING, CONTENT_PIXELS, CONTENT_PIXELS);
    p.setActive(true).setVisible(true).setDepth(12).setPosition(x, y).setAlpha(1)
      .setScale(1, 1).setDisplaySize(PICKUP_SIZE, PICKUP_SIZE);
    if (tint !== null) p.setTint(tint); else p.clearTint();
    p.setData('type', type);
    p.setData('landed', false);
    p.setData('hopped', false);
    if (points !== undefined) p.setData('points', points);

    if (p.body) {
      const pb = p.body as Phaser.Physics.Arcade.Body;
      pb.enable = true;
      // Body matches the cropped content so it lands flush with the ground.
      pb.setSize(BODY_SIZE, BODY_SIZE, true);
      pb.setAllowGravity(true);
      pb.setVelocity(
        randomIntBetween(-140, 140),
        randomIntBetween(-320, -200),
      );
      pb.setDrag(60, 0);
      pb.setBounce(0.25, 0.2);
    }

    this.playSpawnPop(p, tint);
    this.scheduleLifecycle(p);
  }

  updateMagnet(): void {
    const tx = this.scene.player.x;
    const ty = this.scene.player.y - 50; // torso, not feet
    this.scene.pickups.getChildren().forEach((go) => {
      const p = go as Phaser.Physics.Arcade.Image;
      if (!p.active) return;
      const body = p.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;

      // First ground contact → squash tween for weight
      if (!p.getData('landed') && body.blocked.down) {
        p.setData('landed', true);
        const dx = p.displayWidth;
        const dy = p.displayHeight;
        this.scene.tweens.killTweensOf(p);
        this.scene.tweens.add({
          targets: p,
          displayWidth:  { from: dx * 1.12, to: dx },
          displayHeight: { from: dy * 0.78, to: dy },
          duration: 180,
          ease: 'Quad.easeOut',
        });
      }

      const velocity = getPickupMagnetVelocity(p.x, p.y, tx, ty);
      if (!velocity) return;
      body.setAllowGravity(false);
      body.setVelocity(velocity.vx, velocity.vy);
    });
  }

  private collect(pickup: Phaser.Physics.Arcade.Image): void {
    const pk = pickup;
    if (!pk.active) return;
    this.scene.tweens.killTweensOf(pk);
    pk.setAlpha(1);
    pk.setActive(false).setVisible(false);
    if (pk.body) (pk.body as Phaser.Physics.Arcade.Body).enable = false;

    const pickupType = pk.getData('type') as PickupType;
    // Distinct pitch per type makes the feedback readable without a new sample.
    let rate = 1;
    let label = '+ITEM';
    let color = '#ffffff';
    if (pickupType === 'health') {
      this.scene.player.heal(1);
      rate = 1.25;
      label = '+1 HP';
      color = '#5cff8a';
    } else if (pickupType === 'ammo') {
      this.scene.player.refillRapidAmmo(RAPID_AMMO_PER_PICKUP);
      rate = 0.85;
      label = `+${RAPID_AMMO_PER_PICKUP} AMMO`;
      color = '#6de3ff';
    } else if (pickupType === 'score') {
      const pts = (pk.getData('points') as number | undefined) ?? 100;
      this.scene.score += pts;
      this.scene.events.emit('scoreChange', this.scene.score);
      rate = 1.5;
      label = `+${pts}`;
      color = '#ffd744';
    } else {
      this.scene.player.restoreJetpackFuel(1000);
      rate = 0.95;
      label = '+FUEL';
      color = '#ffb347';
    }

    this.scene.audio.playAt('pickup', { rate });
    this.scene.spawnFloatingText(pk.x, pk.y - 8, label, color, {
      fontSize: '16px', rise: 44, duration: 750, stroke: '#000814',
    });
  }

  private playSpawnPop(p: Phaser.Physics.Arcade.Image, tint: number | null): void {
    // Spawn-pop: brief scale-up + white flash so drops read at the moment of birth.
    const popDx = p.displayWidth;
    const popDy = p.displayHeight;
    p.setDisplaySize(popDx * 0.6, popDy * 0.6);
    this.scene.tweens.add({
      targets: p,
      displayWidth:  popDx,
      displayHeight: popDy,
      duration: 180,
      ease: 'Back.easeOut',
    });
    applyFillTintCompat(p, 0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (!p.active) return;
      if (tint !== null) p.setTint(tint); else p.clearTint();
    });
  }

  private scheduleLifecycle(p: Phaser.Physics.Arcade.Image): void {
    // Start pulse warning 3s before despawn (at t=7s)
    this.scene.time.delayedCall(7000, () => {
      if (!p.active) return;
      this.scene.tweens.add({
        targets: p,
        alpha: { from: 1, to: 0.25 },
        duration: 350,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // Attention-grab hop at t=8s (2s before despawn) — small jump if still grounded.
    this.scene.time.delayedCall(8000, () => {
      if (!p.active || p.getData('hopped')) return;
      p.setData('hopped', true);
      const pb = p.body as Phaser.Physics.Arcade.Body | null;
      if (pb && pb.blocked.down) pb.setVelocityY(-240);
    });

    // Despawn after 10s
    this.scene.time.delayedCall(PICKUP_LIFETIME_MS, () => {
      if (p.active) {
        this.scene.tweens.killTweensOf(p);
        p.setAlpha(1);
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
      }
    });
  }
}
