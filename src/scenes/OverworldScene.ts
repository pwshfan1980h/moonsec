import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';

type MechType = 'mech' | 'mech4';

interface NodeDef {
  x: number;
  y: number;
  label: string;
}

const MOON_X = 960;
const MOON_Y = 610;
const MOON_R  = 305;

const NODES: NodeDef[] = [
  { x: 345,  y: 835, label: 'SECTOR I'   },
  { x: 600,  y: 628, label: 'SECTOR II'  },
  { x: 960,  y: 458, label: 'SECTOR III' },
  { x: 1320, y: 628, label: 'SECTOR IV'  },
  { x: 1575, y: 835, label: 'SECTOR V'   },
];

export class OverworldScene extends Phaser.Scene {
  // 0-indexed node the cursor sits on (= next level to play)
  private currentNode   = 0;
  // how many levels are accessible (1 = only sector I unlocked)
  private unlockedCount = 1;
  private totalScore    = 0;
  private mechType: MechType = 'mech4';

  private cursorGfx!: Phaser.GameObjects.Graphics;
  private cursorPulseTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super('Overworld');
  }

  init(data: { currentNode?: number; unlockedCount?: number; totalScore?: number; mechType?: MechType }): void {
    this.currentNode   = data.currentNode   ?? 0;
    this.unlockedCount = data.unlockedCount ?? 1;
    this.totalScore    = data.totalScore    ?? ((this.registry.get('totalScore') as number) ?? 0);
    this.mechType      = data.mechType      ?? ((this.registry.get('mechType')   as MechType) ?? 'mech4');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#010110');

    this.buildStarfield();
    this.buildDebris();
    this.buildMoon();
    this.buildPath();
    this.buildNodes();
    this.buildCursor();
    this.buildUI();
    this.setupInput();

    this.cameras.main.fadeIn(700, 0, 0, 0);
  }

  // ── Starfield ─────────────────────────────────────────────────────────────

  private buildStarfield(): void {
    const gfx = this.add.graphics().setDepth(0);
    const rng = new Phaser.Math.RandomDataGenerator(['overworld-stars-1']);

    for (let i = 0; i < 280; i++) {
      const x = rng.between(0, GAME_W);
      const y = rng.between(0, GAME_H);
      const bright = rng.frac();
      const size   = bright > 0.92 ? 2 : 1;
      const alpha  = bright > 0.80 ? 1.0 : rng.realInRange(0.2, 0.7);
      gfx.fillStyle(0xffffff, alpha);
      gfx.fillRect(x, y, size, size);
    }

    // Twinkling subset
    const rng2 = new Phaser.Math.RandomDataGenerator(['overworld-twinkle-2']);
    for (let i = 0; i < 38; i++) {
      const x    = rng2.between(0, GAME_W);
      const y    = rng2.between(0, GAME_H);
      const size = rng2.between(1, 2);
      const star = this.add.graphics().setDepth(1);
      star.fillStyle(0xffffff, 1);
      star.fillRect(x, y, size, size);
      this.tweens.add({
        targets:  star,
        alpha:    { from: rng2.realInRange(0.05, 0.35), to: 1.0 },
        duration: rng2.between(600, 2400),
        yoyo:     true,
        repeat:   -1,
        delay:    rng2.between(0, 2000),
        ease:     'Sine.easeInOut',
      });
    }
  }

  // ── Debris ────────────────────────────────────────────────────────────────

  private buildDebris(): void {
    const gfx  = this.add.graphics().setDepth(1);
    const rng  = new Phaser.Math.RandomDataGenerator(['overworld-debris-3']);
    const cols = [0x665544, 0x554433, 0x776655, 0x443322, 0x887766];
    let placed = 0;
    let tries  = 0;

    while (placed < 22 && tries < 300) {
      tries++;
      const x = rng.between(30, GAME_W - 30);
      const y = rng.between(30, GAME_H - 30);
      if (Phaser.Math.Distance.Between(x, y, MOON_X, MOON_Y) < MOON_R + 100) continue;

      const w = rng.between(5, 20);
      const h = rng.between(3, Math.max(4, Math.round(w * rng.realInRange(0.45, 0.9))));
      gfx.fillStyle(rng.pick(cols), rng.realInRange(0.45, 0.82));
      gfx.fillEllipse(x, y, w, h);
      placed++;
    }
  }

  // ── Moon ──────────────────────────────────────────────────────────────────

  private buildMoon(): void {
    const gfx = this.add.graphics().setDepth(2);

    // Atmospheric halo
    for (let i = 5; i >= 1; i--) {
      gfx.fillStyle(0xddddc8, 0.025 * i);
      gfx.fillCircle(MOON_X, MOON_Y, MOON_R + i * 22);
    }

    // Body
    gfx.fillStyle(0xb8b4a0, 1.0);
    gfx.fillCircle(MOON_X, MOON_Y, MOON_R);

    // Terminator shadow (night side, offset right)
    gfx.fillStyle(0x00061a, 0.40);
    gfx.fillCircle(MOON_X + 150, MOON_Y + 50, MOON_R);

    // Sunlit highlight (top-left bloom)
    gfx.fillStyle(0xd8d5c5, 0.50);
    gfx.fillEllipse(MOON_X - 95, MOON_Y - 100, MOON_R * 0.68, MOON_R * 0.52);

    // Craters
    const craters = [
      { dx: -135, dy:  -55, r: 50, da: 0.22, la: 0.18 },
      { dx:  165, dy:   75, r: 33, da: 0.17, la: 0.13 },
      { dx:  -22, dy:  155, r: 54, da: 0.24, la: 0.19 },
      { dx:  210, dy: -105, r: 21, da: 0.14, la: 0.11 },
      { dx: -215, dy:   95, r: 29, da: 0.17, la: 0.14 },
      { dx:   68, dy: -175, r: 17, da: 0.13, la: 0.10 },
      { dx:  -62, dy: -215, r: 13, da: 0.11, la: 0.09 },
      { dx:  -78, dy:  225, r: 24, da: 0.15, la: 0.12 },
      { dx:  115, dy:  200, r: 18, da: 0.13, la: 0.10 },
    ];

    for (const c of craters) {
      gfx.fillStyle(0x6a6858, c.da * 2);
      gfx.fillCircle(MOON_X + c.dx, MOON_Y + c.dy, c.r);
      gfx.fillStyle(0xcecab8, c.la);
      gfx.fillCircle(MOON_X + c.dx + c.r * 0.28, MOON_Y + c.dy - c.r * 0.28, c.r * 0.62);
    }
  }

  // ── Path ──────────────────────────────────────────────────────────────────

  private buildPath(): void {
    const gfx = this.add.graphics().setDepth(4);

    for (let i = 0; i < NODES.length - 1; i++) {
      const a        = NODES[i];
      const b        = NODES[i + 1];
      const dx       = b.x - a.x;
      const dy       = b.y - a.y;
      const dist     = Math.hypot(dx, dy);
      const steps    = Math.floor(dist / 16);
      const unlocked = i < this.unlockedCount - 1;

      for (let s = 0; s < steps; s += 2) {
        const t = (s + 0.5) / steps;
        const x = Math.round(a.x + dx * t);
        const y = Math.round(a.y + dy * t);
        gfx.fillStyle(unlocked ? 0xffe866 : 0x2a3a55, unlocked ? 0.9 : 0.45);
        gfx.fillRect(x - 2, y - 2, 4, 4);
      }
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  private buildNodes(): void {
    for (let i = 0; i < NODES.length; i++) {
      const { x, y, label } = NODES[i];
      const unlocked  = i < this.unlockedCount;
      const isCurrent = i === this.currentNode;

      const gfx = this.add.graphics().setDepth(5);

      if (unlocked) {
        gfx.lineStyle(2, isCurrent ? 0xffffff : 0xffaa22, 0.75);
        gfx.strokeCircle(x, y, 25);
        gfx.fillStyle(isCurrent ? 0xffffff : 0xffcc44, 1.0);
        gfx.fillCircle(x, y, 17);
      } else {
        gfx.lineStyle(2, 0x2a3a55, 0.5);
        gfx.strokeCircle(x, y, 25);
        gfx.fillStyle(0x1a2535, 1.0);
        gfx.fillCircle(x, y, 17);
      }

      this.add.text(x, y, `${i + 1}`, {
        fontFamily: 'monospace',
        fontSize:   '16px',
        color:      unlocked ? '#000000' : '#334455',
      }).setOrigin(0.5).setDepth(6);

      this.add.text(x, y + 38, label, {
        fontFamily:      'monospace',
        fontSize:        '13px',
        color:           unlocked ? (isCurrent ? '#ffe866' : '#ccaa44') : '#2a3a55',
        stroke:          '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(6);

      // Passive idle pulse on completed (non-current) nodes
      if (unlocked && !isCurrent) {
        this.tweens.add({
          targets:  gfx,
          alpha:    { from: 0.65, to: 1.0 },
          duration: 1400,
          yoyo:     true,
          repeat:   -1,
          delay:    i * 280,
          ease:     'Sine.easeInOut',
        });
      }
    }
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  private buildCursor(): void {
    const { x, y } = NODES[this.currentNode];
    this.cursorGfx  = this.add.graphics().setDepth(7);
    this.cursorGfx.setPosition(x, y);
    this.redrawCursor();
    this.startCursorPulse();
  }

  private redrawCursor(): void {
    this.cursorGfx.clear();
    this.cursorGfx.lineStyle(3, 0xffffff, 1.0);
    this.cursorGfx.strokeCircle(0, 0, 31);
    this.cursorGfx.lineStyle(1, 0xffffff, 0.35);
    this.cursorGfx.strokeCircle(0, 0, 40);
  }

  private startCursorPulse(): void {
    this.cursorPulseTween?.stop();
    this.cursorPulseTween = this.tweens.add({
      targets:  this.cursorGfx,
      alpha:    { from: 0.4, to: 1.0 },
      duration: 780,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  private buildUI(): void {
    this.add.text(GAME_W / 2, 38, 'MISSION SELECT', {
      fontFamily:      'monospace',
      fontSize:        '30px',
      color:           '#aaccff',
      stroke:          '#000011',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    if (this.totalScore > 0) {
      this.add.text(GAME_W / 2, 82, `SCORE  ${this.totalScore.toLocaleString()}`, {
        fontFamily:      'monospace',
        fontSize:        '15px',
        color:           '#ffee88',
        stroke:          '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(10);
    }

    this.add.text(GAME_W / 2, GAME_H - 26, 'ENTER / SPACE  —  DEPLOY', {
      fontFamily: 'monospace',
      fontSize:   '15px',
      color:      '#445566',
    }).setOrigin(0.5).setDepth(10);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.input.keyboard!.on('keydown-ENTER', () => this.launchLevel());
    this.input.keyboard!.on('keydown-SPACE', () => this.launchLevel());

    // Click zone over current node
    const { x, y } = NODES[this.currentNode];
    this.add.zone(x, y, 80, 80)
      .setInteractive()
      .setDepth(9)
      .on('pointerdown', () => this.launchLevel());
  }

  private launchLevel(): void {
    this.registry.set('totalScore', this.totalScore);
    this.registry.set('mechType',   this.mechType);

    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Game', {
        mechType:   this.mechType,
        level:      this.currentNode + 1,
        totalScore: this.totalScore,
      });
      this.scene.launch('UI');
    });
  }
}
