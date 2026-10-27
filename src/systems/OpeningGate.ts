import Phaser from 'phaser';
import { WORLD_HEIGHT } from '../constants';
import type { GameScene } from '../scenes/GameScene';

/** Invisible opening boundary: flight and surge cannot bypass the training checks. */
export const OPENING_GATE_X = 1728;

export class OpeningGate {
  private field: Phaser.GameObjects.Zone;
  private collider: Phaser.Physics.Arcade.Collider;
  private opened = false;
  private contactPending = false;
  private remindedThisVisit = false;
  private remindAfter = 0;

  /** `onRemind` fires alongside the floating reminder (Lunar Control calls it out on the radio). */
  constructor(private readonly scene: GameScene, private readonly onRemind?: () => void) {
    this.field = scene.add.zone(OPENING_GATE_X, WORLD_HEIGHT / 2, 32, WORLD_HEIGHT);
    scene.physics.add.existing(this.field, true);
    this.collider = scene.physics.add.collider(scene.player, this.field, () => {
      this.contactPending = true;
    });
  }

  /** Keep the range in view, accounting for the close-view zoom and camera's center origin. */
  cameraTarget(x: number, width: number, zoom: number): number {
    return this.opened ? x : Math.min(x, Math.max(width / (2 * zoom), OPENING_GATE_X + 96 - width / (2 * zoom)));
  }

  update(time: number, reminder: string): void {
    if (this.opened) return;
    const p = this.scene.player;
    if (this.contactPending && !this.remindedThisVisit) {
      if (time >= this.remindAfter) {
        this.scene.spawnFloatingText(p.x - 120, p.y - 150, reminder, 'accent', { rise: 12, duration: 3200 });
        this.onRemind?.();
        this.remindAfter = time + 10000;
      }
      this.remindedThisVisit = true;
    }
    this.contactPending = false;
    // Backing away rearms the reminder; holding against the limit never repeats it.
    if ((p.body as Phaser.Physics.Arcade.Body).right < OPENING_GATE_X - 64) this.remindedThisVisit = false;
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.collider.destroy();
    (this.field.body as Phaser.Physics.Arcade.StaticBody).enable = false;
  }

  destroy(): void {
    if (!this.opened) this.collider.destroy();
    this.field.destroy();
  }
}
