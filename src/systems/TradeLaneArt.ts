import type Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { LevelTemplate } from '../data/levelData';

/** Background hull detail stays below the real landing surface; cyan marks traversable edges. */
export function drawTradeLaneArt(scene: GameScene, template: LevelTemplate): void {
  const g = scene.add.graphics().setDepth(2);
  const decks = template.fixedPlatforms;
  let bay = 0;
  for (const deck of decks) {
    const x = deck.col * 32, y = deck.row * 32, width = deck.width * 32;
    const main = deck.row === 22;
    const h = main ? 64 : 30;
    g.fillStyle(0x060f1b, 1).fillRect(x + 8, y + 32, width - 16, h);
    g.fillStyle(0x14283c, 1).fillRect(x + 14, y + 32, width - 28, h - 8);
    g.fillStyle(0x243e54, 1).fillRect(x + 14, y + 32, width - 28, 5);
    for (let at = x + 28; at < x + width - 28; at += 80) {
      g.fillStyle(0x0b1725, 1).fillRect(at, y + 44, 62, main ? 34 : 10);
      g.fillStyle(0x36536a, 1).fillRect(at, y + 44, 3, main ? 34 : 10);
      if (main) {
        g.lineStyle(3, 0x20384c, 1).lineBetween(at + 5, y + 75, at + 54, y + 47);
        g.fillStyle(0x537084, 1).fillRect(at + 52, y + 48, 3, 3);
      }
    }
    // Small guide lamps at both ends, kept on the deck rather than over the gap.
    for (const edge of [x + 12, x + width - 36]) {
      g.fillStyle(0x2b4d64, 1).fillRect(edge - 4, y - 12, 32, 12);
      g.fillStyle(0x69dcf5, 1).fillRect(edge, y - 9, 24, 4);
      g.fillStyle(0x65d8f0, 0.08).fillRect(edge - 8, y - 22, 40, 24);
    }
    if (main) {
      bay++;
      scene.add.text(x + 48, y + 82, `LUNAR FREIGHT  /  ${String(bay).padStart(2, '0')}`, {
        fontFamily: '"Share Tech Mono", monospace', fontSize: '18px', color: '#52768f',
      }).setDepth(3);
      // Hazard stripes identify the lip without filling the air route with UI.
      for (const edge of [x + 8, x + width - 62]) for (let i = 0; i < 4; i++) {
        g.fillStyle(i % 2 ? 0x152331 : 0xc79a57, 1).fillRect(edge + i * 14, y + 20, 12, 10);
      }
    }
  }
}

export function makeFreightLiftTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('freight-lift')) return;
  const g = scene.add.graphics();
  g.fillStyle(0x0b1421, 1).fillRect(0, 0, 128, 16);
  g.fillStyle(0x52697b, 1).fillRect(2, 1, 124, 3);
  g.fillStyle(0x2d4052, 1).fillRect(2, 4, 124, 8);
  g.fillStyle(0x92b5c4, 1).fillRect(8, 1, 112, 1);
  for (let x = 8; x < 120; x += 16) {
    g.fillStyle(0x152536, 1).fillRect(x, 6, 12, 4);
    g.fillStyle(0x6e91a4, 1).fillRect(x, 5, 2, 2);
  }
  for (const x of [2, 114]) {
    g.fillStyle(0xd9ab65, 1).fillRect(x, 4, 12, 7);
    g.fillStyle(0x263747, 1).fillRect(x + 4, 4, 4, 7);
  }
  g.fillStyle(0x1c536a, 1).fillRect(18, 12, 92, 3);
  g.fillStyle(0x6de3ff, 1).fillRect(24, 13, 24, 2).fillRect(80, 13, 24, 2);
  g.generateTexture('freight-lift', 128, 16);
  g.destroy();
}
