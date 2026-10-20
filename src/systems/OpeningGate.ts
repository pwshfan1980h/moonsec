import Phaser from 'phaser';
import { WORLD_HEIGHT } from '../constants';
import { pal } from '../render/palette';
import { label, setLabel } from '../ui/kit/draw';
import type { GameScene } from '../scenes/GameScene';

/** A visible, full-height containment field: flight and surge cannot bypass the range check. */
export const OPENING_GATE_X = 1728;

export class OpeningGate {
  private field: Phaser.GameObjects.Rectangle;
  private housing: Phaser.GameObjects.Graphics;
  private sign: Phaser.GameObjects.BitmapText;
  private collider: Phaser.Physics.Arcade.Collider;
  private opened = false;
  private near = false;
  private remindAfter = 0;

  constructor(private readonly scene: GameScene, floor: number) {
    this.field = scene.add.rectangle(OPENING_GATE_X, WORLD_HEIGHT / 2, 32, WORLD_HEIGHT, pal('cyan2'), 0.7).setDepth(8);
    scene.physics.add.existing(this.field, true);
    this.collider = scene.physics.add.collider(scene.player, this.field);
    this.housing = scene.add.graphics().setDepth(8);
    const g = this.housing;
    g.fillStyle(pal('hull1')); g.fillRect(OPENING_GATE_X - 40, floor - 64, 80, 64);
    g.fillStyle(pal('hull3')); g.fillRect(OPENING_GATE_X - 32, floor - 56, 64, 12);
    g.fillStyle(pal('cyan3'));
    for (let y = 0; y < floor - 64; y += 32) g.fillRect(OPENING_GATE_X - 6, y, 12, 12);
    this.sign = label(scene, OPENING_GATE_X - 48, floor - 84, 'RANGE LOCK\nSYSTEMS CHECK', 'small', 'accent')
      .setOrigin(1, 1).setDepth(8);
  }

  /** Keep the range in view, accounting for the close-view zoom and camera's center origin. */
  cameraTarget(x: number, width: number, zoom: number): number {
    return this.opened ? x : Math.min(x, Math.max(width / (2 * zoom), OPENING_GATE_X + 96 - width / (2 * zoom)));
  }

  update(time: number, reminder: string): void {
    if (this.opened) return;
    const p = this.scene.player;
    const approaching = p.x >= OPENING_GATE_X - 180;
    if (approaching && !this.near && time >= this.remindAfter) {
      this.scene.spawnFloatingText(p.x - 80, p.y - 150, reminder, 'accent', { rise: 12, duration: 3200 });
      this.remindAfter = time + 10000;
    }
    // Hysteresis prevents repeated hints while pushing against the field.
    if (approaching) this.near = true;
    else if (p.x < OPENING_GATE_X - 300) this.near = false;
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.collider.destroy();
    (this.field.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.field.setVisible(false);
    this.housing.clear();
    this.housing.fillStyle(pal('hull1')).fillRect(OPENING_GATE_X - 40, this.sign.y + 20, 80, 64);
    setLabel(this.sign, 'RANGE CLEAR', 'repair');
  }

  destroy(): void {
    if (!this.opened) this.collider.destroy();
    this.field.destroy();
    this.housing.destroy();
    this.sign.destroy();
  }
}
