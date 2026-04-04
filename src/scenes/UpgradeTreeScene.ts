import Phaser from 'phaser';
import { TREE_NODES, type TreeNode } from '../data/upgradeTree';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { GAME_W, GAME_H } from '../constants';

const COL_X: Record<string, number> = { offense: 480, defense: 960, mobility: 1440 };
const TIER_Y = [200, 360, 520, 680];
const NODE_W = 200;
const NODE_H = 60;

interface Particle {
  angle: number;
  speed: number;
  baseR: number;
  freq: number;
  phase: number;
  size: number;
  color: number;
  alpha: number;
}

export class UpgradeTreeScene extends Phaser.Scene {
  private prog!: ProgressionSystem;
  private particles: Particle[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private scoreBankText!: Phaser.GameObjects.Text;
  private nodeObjects = new Map<string, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();
  private nodeLayerObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'UpgradeTree' });
  }

  create(): void {
    // Fade out title music if it carried through the transition
    for (const m of this.sound.getAll('music-title') as Phaser.Sound.WebAudioSound[]) {
      if (m.isPlaying) {
        this.tweens.add({ targets: m, volume: 0, duration: 800, ease: 'Linear',
          onComplete: () => m.stop() });
      }
    }

    const W = GAME_W, H = GAME_H;

    // Guard: ProgressionSystem may not be registered if player navigates here before playing
    if (!this.registry.get('progression')) {
      this.registry.set('progression', new ProgressionSystem());
    }
    this.prog = this.registry.get('progression') as ProgressionSystem;

    // Animated particle background
    this.gfx = this.add.graphics().setDepth(0);
    this.initParticles();

    // Dark base background
    this.add.rectangle(W / 2, H / 2, W, H, 0x03080f).setDepth(-1);

    // Column headers
    const colNames: Record<string, string> = { offense: 'OFFENSE', defense: 'DEFENSE', mobility: 'MOBILITY' };
    const colColors: Record<string, string> = { offense: '#ff6644', defense: '#4499ff', mobility: '#ffcc00' };
    for (const col of ['offense', 'defense', 'mobility']) {
      this.add.text(COL_X[col], 120, colNames[col], {
        fontFamily: 'monospace', fontSize: '12px', color: colColors[col],
      }).setOrigin(0.5).setDepth(10);
    }

    // Score bank display
    this.scoreBankText = this.add.text(W / 2, 60, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#00ff88',
    }).setOrigin(0.5).setDepth(10);
    this.updateScoreDisplay();

    // Title label (small, above score)
    this.add.text(W / 2, 28, 'UPGRADE TREE', {
      fontFamily: 'monospace', fontSize: '11px', color: '#334455',
    }).setOrigin(0.5).setDepth(10);

    // Nodes + connectors
    for (const node of TREE_NODES) {
      this.drawConnector(node);
      this.createNode(node);
    }

    // Back button
    const back = this.add.text(52, 52, '[ \u2190 BACK ]', {
      fontFamily: 'monospace', fontSize: '12px', color: '#336677',
    }).setDepth(10).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setStyle({ color: '#00ccff' }));
    back.on('pointerout',  () => back.setStyle({ color: '#336677' }));
    back.on('pointerdown', () => this.scene.start('Title'));

    // ESC key
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      .on('down', () => this.scene.start('Title'));
  }

  private initParticles(): void {
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.3,
        baseR: 120,
        freq: 0.5 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        size: 2,
        color: 0x00ccff,
        alpha: 0.8,
      });
    }
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        speed: -(0.2 + Math.random() * 0.3),
        baseR: 220,
        freq: 0.3 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
        size: 2,
        color: 0x6600ff,
        alpha: 0.6,
      });
    }
  }

  private drawConnector(node: TreeNode): void {
    if (node.tier === 0) return;
    const x  = COL_X[node.col];
    const y0 = TIER_Y[node.tier - 1] + NODE_H / 2;
    const y1 = TIER_Y[node.tier]     - NODE_H / 2;
    const owned = this.prog.ownedNodes.includes(node.id);
    const g = this.add.graphics()
      .lineStyle(1, owned ? 0x00ccff : 0x112233, 1)
      .beginPath().moveTo(x, y0).lineTo(x, y1).strokePath()
      .setDepth(9);
    this.nodeLayerObjects.push(g);
  }

  private createNode(node: TreeNode): void {
    const x   = COL_X[node.col];
    const y   = TIER_Y[node.tier];
    const owned = this.prog.ownedNodes.includes(node.id);
    const prereqMet = node.tier === 0 || this.prog.ownedNodes.includes(
      TREE_NODES.find(n => n.col === node.col && n.tier === (node.tier - 1 as 0|1|2|3))?.id ?? ''
    );
    const affordable = prereqMet && this.prog.scoreBank >= node.cost;

    const borderColor = owned ? 0x00ccff : prereqMet ? (affordable ? 0xaaaaaa : 0x444444) : 0x222222;
    const bgColor     = owned ? 0x0d2035 : 0x060f1a;
    const textColor   = owned ? '#00ccff' : prereqMet ? '#aaaaaa' : '#333333';
    const alpha       = prereqMet ? 1 : 0.4;

    const bg = this.add.rectangle(x, y, NODE_W, NODE_H, bgColor)
      .setStrokeStyle(1, borderColor).setAlpha(alpha).setDepth(10);

    const label = this.add.text(x, y - 8, node.name, {
      fontFamily: 'monospace', fontSize: '11px', color: textColor,
    }).setOrigin(0.5).setAlpha(alpha).setDepth(11);

    const costLabel = owned ? '\u2713' : `${node.cost} pts`;
    const costText = this.add.text(x, y + 10, costLabel, {
      fontFamily: 'monospace', fontSize: '9px',
      color: owned ? '#00ff88' : affordable ? '#00ff8877' : '#333333',
    }).setOrigin(0.5).setAlpha(alpha).setDepth(11);

    this.nodeObjects.set(node.id, { bg, label });
    this.nodeLayerObjects.push(bg, label, costText);

    if (owned) return;

    const hit = this.add.rectangle(x, y, NODE_W, NODE_H, 0, 0)
      .setInteractive({ useHandCursor: prereqMet }).setDepth(12);
    this.nodeLayerObjects.push(hit);

    if (!prereqMet) return;

    hit.on('pointerover', () => { bg.setStrokeStyle(1, 0x00ffcc); });
    hit.on('pointerout',  () => { bg.setStrokeStyle(1, borderColor); });
    hit.on('pointerdown', () => { this.attemptBuy(node); });
  }

  private attemptBuy(node: TreeNode): void {
    const ok = this.prog.buyNode(node.id);
    if (ok) {
      this.playSound('upgrade-buy');
      this.refreshNodes();
      this.updateScoreDisplay();
    } else {
      this.playSound('upgrade-denied');
      const obj = this.nodeObjects.get(node.id);
      if (obj) {
        this.tweens.add({
          targets: obj.bg,
          x: { from: obj.bg.x - 4, to: obj.bg.x },
          duration: 50,
          yoyo: true,
          repeat: 2,
        });
      }
    }
  }

  private playSound(id: string): void {
    try {
      this.sound.play(id, { volume: id === 'upgrade-buy' ? 0.65 : 0.40 });
    } catch { /* ignore */ }
  }

  private refreshNodes(): void {
    this.nodeLayerObjects.forEach(o => o.destroy());
    this.nodeLayerObjects = [];
    this.nodeObjects.clear();
    for (const node of TREE_NODES) {
      this.drawConnector(node);
      this.createNode(node);
    }
  }

  private updateScoreDisplay(): void {
    const bank = this.prog ? this.prog.scoreBank : 0;
    this.scoreBankText.setText(`\u2B21 SCORE BANK: ${bank.toLocaleString()}`);
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const cx = GAME_W / 2, cy = GAME_H / 2;
    this.gfx.clear();
    for (const p of this.particles) {
      p.angle += p.speed * dt;
      const r = p.baseR + Math.sin(time / 1000 * p.freq + p.phase) * 20;
      const px = cx + Math.cos(p.angle) * r;
      const py = cy + Math.sin(p.angle) * r;
      this.gfx.fillStyle(p.color, p.alpha);
      this.gfx.fillCircle(px, py, p.size);
    }
  }
}
