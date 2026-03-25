import Phaser from 'phaser';
import { CARD_POOL, type UpgradeCard } from '../data/upgradeCards';
import type { Player } from '../entities/Player';
import type { AudioSystem } from '../systems/AudioSystem';

interface CardSceneData {
  wave: number;
  audio: AudioSystem;
  player: Player;
}

const CARD_W   = 160;
const CARD_H   = 220;
const CARD_GAP = 40;
const TOTAL_W  = CARD_W * 3 + CARD_GAP * 2;

export class UpgradeCardScene extends Phaser.Scene {
  private audio!: AudioSystem;
  private player!: Player;

  constructor() {
    super({ key: 'UpgradeCards' });
  }

  init(data: CardSceneData): void {
    this.audio  = data.audio;
    this.player = data.player;
  }

  create(data: CardSceneData): void {
    const { wave } = data;
    const W = 1280, H = 720;

    // Dark overlay
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85).setDepth(70);

    // Header
    this.add.text(W / 2, 120, `// WAVE ${wave} COMPLETE — SELECT UPGRADE //`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#00ccff',
    } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5).setDepth(71);

    // Pick 3 random cards (excluding already-applied oneTime cards)
    const runUpgrades = (this.registry.get('runUpgrades') ?? []) as string[];
    const available = CARD_POOL.filter(c => !(c.oneTime && runUpgrades.includes(c.id)));
    const picks = Phaser.Utils.Array.Shuffle([...available]).slice(0, 3) as UpgradeCard[];

    const startX = W / 2 - TOTAL_W / 2 + CARD_W / 2;
    const cardY   = H / 2 + 20;

    picks.forEach((card, i) => {
      const x = startX + i * (CARD_W + CARD_GAP);
      this.createCard(x, cardY, card, i, runUpgrades);
    });

    // Keyboard shortcuts
    const keys = [
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
    ];
    keys.forEach((key, i) => {
      key.once('down', () => { if (picks[i]) this.pickCard(picks[i], runUpgrades); });
    });
  }

  private createCard(x: number, y: number, card: UpgradeCard, index: number, runUpgrades: string[]): void {
    const startY = y + 40;
    const depth  = 72 + index;

    const bg     = this.add.rectangle(x, startY, CARD_W, CARD_H, 0x0a1a2a).setDepth(depth);
    const border = this.add.rectangle(x, startY, CARD_W, CARD_H, 0x000000, 0)
      .setStrokeStyle(1, 0x00ccff, 0.5).setDepth(depth);

    this.add.text(x, startY - 72, card.icon, { fontSize: '32px' }).setOrigin(0.5).setDepth(depth + 0.1);
    this.add.text(x, startY - 28, card.name, {
      fontFamily: 'monospace', fontSize: '12px', color: '#00ccff',
    }).setOrigin(0.5).setDepth(depth + 0.1);
    this.add.text(x, startY + 10, card.desc, {
      fontFamily: 'monospace', fontSize: '10px', color: '#5588aa',
      wordWrap: { width: CARD_W - 20 }, align: 'center',
    }).setOrigin(0.5).setDepth(depth + 0.1);
    this.add.text(x, startY + 70, card.statLine, {
      fontFamily: 'monospace', fontSize: '11px', color: '#00ff88',
    }).setOrigin(0.5).setDepth(depth + 0.1);

    // Keyboard hint
    this.add.text(x, startY + 92, `[${index + 1}]`, {
      fontFamily: 'monospace', fontSize: '10px', color: '#334455',
    }).setOrigin(0.5).setDepth(depth + 0.1);

    // Interactive hit area
    const hitArea = this.add.rectangle(x, startY, CARD_W, CARD_H, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 0.2);

    hitArea.on('pointerover', () => {
      border.setStrokeStyle(1, 0x00ffcc, 1);
      this.tweens.add({ targets: [bg, border], y: startY - 8, duration: 120, ease: 'Sine.easeOut' });
    });
    hitArea.on('pointerout', () => {
      border.setStrokeStyle(1, 0x00ccff, 0.5);
      this.tweens.add({ targets: [bg, border], y: startY, duration: 120, ease: 'Sine.easeOut' });
    });
    hitArea.on('pointerdown', () => { this.pickCard(card, runUpgrades); });

    // Entry animation
    this.tweens.add({
      targets: [bg, border, hitArea],
      y: { from: startY + 40, to: startY },
      alpha: { from: 0, to: 1 },
      duration: 220,
      delay: index * 80,
      ease: 'Sine.easeOut',
    });
  }

  private pickCard(card: UpgradeCard, runUpgrades: string[]): void {
    card.apply(this.player);
    const updated = [...runUpgrades, card.id];
    this.registry.set('runUpgrades', updated);
    this.audio.play('upgrade-pick');
    this.scene.stop();
  }
}
