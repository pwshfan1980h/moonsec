import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import { NODE_GRAPH, NODE_SUBTITLES } from '../data/levelConfigs';

type MechType = 'mech' | 'mech4';

interface NodeDef {
  x: number;
  y: number;
  label: string;
  nextNodes:      number[];   // nodes this unlocks on completion
  requiredNodes:  number[];   // OR logic — any one completed unlocks this node
}

const MOON_X = 960;
const MOON_Y = 610;
const MOON_R  = 305;

const NODES: NodeDef[] = [
  { x: 430,  y: 820, label: 'SURFACE OPS',    ...NODE_GRAPH[0] },
  { x: 660,  y: 560, label: 'TRADE LANES',    ...NODE_GRAPH[1] },
  { x: 800,  y: 758, label: 'DEEP FACILITY',  ...NODE_GRAPH[2] },
  { x: 1150, y: 490, label: 'ORBITAL STATION',...NODE_GRAPH[3] },
  { x: 1490, y: 760, label: 'NEXUS CORE',     ...NODE_GRAPH[4] },
];

// Edge list for path rendering: [fromIndex, toIndex]
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 3], [3, 4],
];

export class OverworldScene extends Phaser.Scene {
  private currentNode:    number   = 0;
  private completedNodes: number[] = [];
  private totalScore:     number   = 0;
  private mechType:       MechType = 'mech4';

  // selectableNodes = available nodes not yet completed (cursor can move among these)
  private selectableNodes: number[] = [];
  private selectIdx = 0;  // index into selectableNodes

  private cursorGfx!: Phaser.GameObjects.Graphics;
  private cursorPulseTween: Phaser.Tweens.Tween | null = null;
  private nodeSubtitles: Phaser.GameObjects.Text[] = [];

  constructor() { super('Overworld'); }

  init(data: {
    currentNode?:    number;
    completedNodes?: number[];
    totalScore?:     number;
    mechType?:       MechType;
  }): void {
    this.currentNode    = data.currentNode    ?? 0;
    this.completedNodes = data.completedNodes ?? [];
    this.totalScore     = data.totalScore     ?? ((this.registry.get('totalScore') as number) ?? 0);
    this.mechType       = data.mechType       ?? ((this.registry.get('mechType')   as MechType) ?? 'mech4');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#010110');

    this.selectableNodes = this.getSelectableNodes();
    // Place cursor on currentNode if selectable, else first selectable
    this.selectIdx = Math.max(0, this.selectableNodes.indexOf(this.currentNode));

    this.buildStarfield();
    this.buildDebris();
    this.buildMoon();
    this.buildPaths();
    this.buildNodes();
    this.buildCursor();
    this.buildUI();
    this.setupInput();

    this.cameras.main.fadeIn(700, 0, 0, 0);
  }

  // ── Node availability ──────────────────────────────────────────────────────

  /** Nodes accessible to the player (requiredNodes satisfied, not necessarily completed). */
  private getAvailableNodes(): number[] {
    return NODES.map((_, i) => i).filter(i => {
      const { requiredNodes } = NODES[i];
      if (requiredNodes.length === 0) return true;
      return requiredNodes.some(r => this.completedNodes.includes(r));
    });
  }

  /** Available nodes that have not yet been completed (cursor targets). */
  private getSelectableNodes(): number[] {
    return this.getAvailableNodes().filter(i => !this.completedNodes.includes(i));
  }

  // ── Starfield ─────────────────────────────────────────────────────────────

  private buildStarfield(): void {
    const seed = Date.now() & 0xffff; // cosmetic variance each visit
    const rng  = new Phaser.Math.RandomDataGenerator([String(seed)]);
    const gfx  = this.add.graphics().setDepth(0);

    for (let i = 0; i < 280; i++) {
      const x      = rng.between(0, GAME_W);
      const y      = rng.between(0, GAME_H);
      const bright = rng.frac();
      const size   = bright > 0.92 ? 2 : 1;
      const alpha  = bright > 0.80 ? 1.0 : rng.realInRange(0.2, 0.7);
      gfx.fillStyle(0xffffff, alpha);
      gfx.fillRect(x, y, size, size);
    }

    const rng2 = new Phaser.Math.RandomDataGenerator([String(seed + 1)]);
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
        yoyo:     true, repeat: -1,
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
    let placed = 0, tries = 0;
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
    for (let i = 5; i >= 1; i--) {
      gfx.fillStyle(0xddddc8, 0.025 * i);
      gfx.fillCircle(MOON_X, MOON_Y, MOON_R + i * 22);
    }
    gfx.fillStyle(0xb8b4a0, 1.0);
    gfx.fillCircle(MOON_X, MOON_Y, MOON_R);
    gfx.fillStyle(0x00061a, 0.40);
    gfx.fillCircle(MOON_X + 150, MOON_Y + 50, MOON_R);
    gfx.fillStyle(0xd8d5c5, 0.50);
    gfx.fillEllipse(MOON_X - 95, MOON_Y - 100, MOON_R * 0.68, MOON_R * 0.52);

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

  // ── Paths ─────────────────────────────────────────────────────────────────

  private buildPaths(): void {
    const gfx       = this.add.graphics().setDepth(4);
    const available = this.getAvailableNodes();
    const rng       = new Phaser.Math.RandomDataGenerator([String(Date.now() & 0xff)]);
    const dashLen   = 8 + rng.between(-2, 2);  // cosmetic variance ±2px

    for (const [aIdx, bIdx] of EDGES) {
      const a = NODES[aIdx], b = NODES[bIdx];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.floor(dist / 16);

      // Edge is "lit" if both endpoints are available
      const lit = available.includes(aIdx) && available.includes(bIdx);
      // Gold if both endpoints are completed
      const done = this.completedNodes.includes(aIdx) && this.completedNodes.includes(bIdx);

      const color = done ? 0xffcc22 : lit ? 0x4499ff : 0x2a3a55;
      const alpha = done ? 0.9      : lit ? 0.6      : 0.35;

      for (let s = 0; s < steps; s += 2) {
        const t = (s + 0.5) / steps;
        const x = Math.round(a.x + dx * t);
        const y = Math.round(a.y + dy * t);
        gfx.fillStyle(color, alpha);
        gfx.fillRect(x - 2, y - 2, dashLen, 4);
      }
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  private buildNodes(): void {
    const available  = this.getAvailableNodes();
    const selectable = this.selectableNodes;
    this.nodeSubtitles = [];

    for (let i = 0; i < NODES.length; i++) {
      const { x, y, label } = NODES[i];
      const isAvailable  = available.includes(i);
      const isCompleted  = this.completedNodes.includes(i);
      const isSelectable = selectable.includes(i);
      const isCursor     = selectable[this.selectIdx] === i;

      const gfx = this.add.graphics().setDepth(5);

      if (isCompleted) {
        // Gold — done
        gfx.lineStyle(2, 0xffcc22, 0.85);
        gfx.strokeCircle(x, y, 25);
        gfx.fillStyle(0xffcc22, 1.0);
        gfx.fillCircle(x, y, 17);
      } else if (isSelectable) {
        // White/orange — playable
        gfx.lineStyle(2, isCursor ? 0xffffff : 0xffaa22, 0.75);
        gfx.strokeCircle(x, y, 25);
        gfx.fillStyle(isCursor ? 0xffffff : 0xff8800, 1.0);
        gfx.fillCircle(x, y, 17);
      } else if (isAvailable) {
        // Dim — unlocked but completed (shouldn't reach here normally)
        gfx.lineStyle(2, 0x3a4a66, 0.6);
        gfx.strokeCircle(x, y, 25);
        gfx.fillStyle(0x2a3a55, 1.0);
        gfx.fillCircle(x, y, 17);
      } else {
        // Locked
        gfx.lineStyle(2, 0x1a2535, 0.4);
        gfx.strokeCircle(x, y, 25);
        gfx.fillStyle(0x0e1520, 1.0);
        gfx.fillCircle(x, y, 17);
      }

      // Number label inside node
      this.add.text(x, y, `${i + 1}`, {
        fontFamily: 'monospace', fontSize: '16px',
        color: isCompleted ? '#000000' : isSelectable ? '#000000' : '#334455',
      }).setOrigin(0.5).setDepth(6);

      // Level name below
      this.add.text(x, y + 38, label, {
        fontFamily:      'monospace', fontSize: '13px',
        color:           isCompleted ? '#ffcc22' : isSelectable ? '#ffe866' : '#2a3a55',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(6);

      // Flavour subtitle (cosmetic, random pick per session)
      const subs = NODE_SUBTITLES[i] ?? [];
      const sub  = subs[Math.floor(Math.random() * subs.length)] ?? '';
      const subTxt = this.add.text(x, y + 56, sub, {
        fontFamily: 'monospace', fontSize: '10px',
        color:      isAvailable ? '#667799' : '#1a2535',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(6);
      this.nodeSubtitles.push(subTxt);

      // Passive idle pulse on available non-cursor nodes
      if (isAvailable && !isCursor) {
        this.tweens.add({
          targets:  gfx,
          alpha:    { from: 0.65, to: 1.0 },
          duration: 1400, yoyo: true, repeat: -1,
          delay:    i * 280, ease: 'Sine.easeInOut',
        });
      }
    }
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  private buildCursor(): void {
    const node = NODES[this.selectableNodes[this.selectIdx] ?? 0];
    this.cursorGfx = this.add.graphics().setDepth(7);
    this.cursorGfx.setPosition(node.x, node.y);
    this.redrawCursor();
    this.startCursorPulse();
  }

  private moveCursorTo(nodeIdx: number): void {
    const { x, y } = NODES[nodeIdx];
    this.cursorPulseTween?.stop();
    this.tweens.add({
      targets:  this.cursorGfx,
      x, y, duration: 200, ease: 'Quad.easeOut',
      onComplete: () => { this.redrawCursor(); this.startCursorPulse(); },
    });
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
      duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  private buildUI(): void {
    this.add.text(GAME_W / 2, 38, 'MISSION SELECT', {
      fontFamily: 'monospace', fontSize: '30px', color: '#aaccff',
      stroke: '#000011', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    if (this.totalScore > 0) {
      this.add.text(GAME_W / 2, 82, `SCORE  ${this.totalScore.toLocaleString()}`, {
        fontFamily: 'monospace', fontSize: '15px', color: '#ffee88',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(10);
    }

    const hasChoice = this.selectableNodes.length > 1;
    const hint = hasChoice
      ? '← → CHOOSE MISSION     ENTER / SPACE  —  DEPLOY'
      : 'ENTER / SPACE  —  DEPLOY';
    this.add.text(GAME_W / 2, GAME_H - 26, hint, {
      fontFamily: 'monospace', fontSize: '15px', color: '#445566',
    }).setOrigin(0.5).setDepth(10);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    const kb = this.input.keyboard!;

    kb.on('keydown-ENTER', () => this.launchLevel());
    kb.on('keydown-SPACE', () => this.launchLevel());

    kb.on('keydown-LEFT',  () => this.shiftCursor(-1));
    kb.on('keydown-RIGHT', () => this.shiftCursor(1));
    kb.on('keydown-A',     () => this.shiftCursor(-1));
    kb.on('keydown-D',     () => this.shiftCursor(1));

    // Click zones on each selectable node
    for (const nodeIdx of this.selectableNodes) {
      const { x, y } = NODES[nodeIdx];
      this.add.zone(x, y, 80, 80)
        .setInteractive().setDepth(9)
        .on('pointerdown', () => {
          // Select clicked node and launch
          const si = this.selectableNodes.indexOf(nodeIdx);
          if (si !== -1 && si !== this.selectIdx) {
            this.selectIdx = si;
            this.moveCursorTo(nodeIdx);
          }
          this.launchLevel();
        });
    }
  }

  private shiftCursor(dir: -1 | 1): void {
    if (this.selectableNodes.length <= 1) return;
    this.selectIdx = (this.selectIdx + dir + this.selectableNodes.length) % this.selectableNodes.length;
    this.moveCursorTo(this.selectableNodes[this.selectIdx]);
    if (this.sound.get('ui-nav')) this.sound.play('ui-nav');
  }

  private launchLevel(): void {
    if (this.selectableNodes.length === 0) return;
    const chosen = this.selectableNodes[this.selectIdx];
    this.currentNode = chosen;

    this.registry.set('totalScore', this.totalScore);
    this.registry.set('mechType',   this.mechType);

    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Game', {
        mechType:       this.mechType,
        level:          chosen,         // 0-indexed node
        totalScore:     this.totalScore,
        completedNodes: this.completedNodes,
      });
      this.scene.launch('UI');
    });
  }
}
