import Phaser from 'phaser';

const MAX_LINES = 16;
const X         = 12;
const Y         = 100;
const W         = 500;
const LINE_H    = 17;

export class DebugLog {
  enabled = false;
  private lines: string[] = [];
  private bg: Phaser.GameObjects.Rectangle;
  private textObj: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add
      .rectangle(X - 4, Y - 4, W, MAX_LINES * LINE_H + 8, 0x000000, 0.70)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(199)
      .setVisible(false);

    this.textObj = scene.add
      .text(X, Y, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#00ff88',
        lineSpacing: 3,
      })
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false);
  }

  /** Toggle visibility. Shows buffered history when enabling. */
  toggle(): void {
    this.enabled = !this.enabled;
    this.bg.setVisible(this.enabled);
    this.textObj.setVisible(this.enabled);
    if (this.enabled) this.textObj.setText(this.lines.join('\n'));
  }

  /** Append a message. Always buffered; display updates only when visible. */
  log(msg: string): void {
    const t  = performance.now();
    const s  = Math.floor(t / 1000) % 100;
    const ms = Math.floor(t % 1000);
    const ts = `${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    this.lines.push(`${ts} ${msg}`);
    if (this.lines.length > MAX_LINES) this.lines.shift();
    if (this.enabled) this.textObj.setText(this.lines.join('\n'));
  }

  destroy(): void {
    this.bg.destroy();
    this.textObj.destroy();
  }
}
