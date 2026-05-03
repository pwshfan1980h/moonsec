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
  { x: 775,  y: 790, label: 'SURFACE OPS',    ...NODE_GRAPH[0] },  // lower-left  — dist ≈ 258
  { x: 790,  y: 510, label: 'TRADE LANES',    ...NODE_GRAPH[1] },  // upper-left  — dist ≈ 197
  { x: 965,  y: 760, label: 'DEEP FACILITY',  ...NODE_GRAPH[2] },  // lower-center— dist ≈ 150
  { x: 1130, y: 490, label: 'ORBITAL STATION',...NODE_GRAPH[3] },  // upper-right — dist ≈ 208
  { x: 1155, y: 730, label: 'NEXUS CORE',     ...NODE_GRAPH[4] },  // right-center— dist ≈ 229
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
  private keyboardEventUnsubs: Array<() => void> = [];

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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.keyboardEventUnsubs = [];
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
    // Shared geometry mask — clips everything inside the moon disc cleanly.
    const maskGfx = this.add.graphics().setVisible(false);
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillCircle(MOON_X, MOON_Y, MOON_R);
    const moonMask = maskGfx.createGeometryMask();

    // ── 1. Atmospheric glow (unmasked — extends beyond rim) ─────────────────
    const glowGfx = this.add.graphics().setDepth(2);
    for (let i = 5; i >= 1; i--) {
      glowGfx.fillStyle(0x6699dd, 0.013 * i);
      glowGfx.fillCircle(MOON_X, MOON_Y, MOON_R + i * 22);
    }
    // Electric blue rim
    glowGfx.lineStyle(2, 0x2255bb, 0.30);
    glowGfx.strokeCircle(MOON_X, MOON_Y, MOON_R + 5);
    glowGfx.lineStyle(1, 0x4488ff, 0.12);
    glowGfx.strokeCircle(MOON_X, MOON_Y, MOON_R + 14);

    // ── 2. Base body + terrain detail (masked) ───────────────────────────────
    const moonGfx = this.add.graphics().setDepth(2).setMask(moonMask);

    // Base — cool industrial blue-grey
    moonGfx.fillStyle(0x6a7080, 1.0);
    moonGfx.fillCircle(MOON_X, MOON_Y, MOON_R);

    // Highland / lit region upper-left (subtle — surface texture, not a sphere)
    moonGfx.fillStyle(0x8a95a8, 0.55);
    moonGfx.fillEllipse(MOON_X - 75, MOON_Y - 85, 195, 150);
    moonGfx.fillStyle(0x9aaabb, 0.22);
    moonGfx.fillEllipse(MOON_X - 110, MOON_Y - 120, 100, 80);

    // Survey grid — latitude/longitude lines projected as chords
    for (let dy = -290; dy <= 290; dy += 38) {
      const hw = Math.sqrt(Math.max(0, MOON_R * MOON_R - dy * dy));
      if (hw < 4) continue;
      moonGfx.lineStyle(1, 0x3a6aaa, 0.14);
      moonGfx.beginPath();
      moonGfx.moveTo(MOON_X - hw, MOON_Y + dy);
      moonGfx.lineTo(MOON_X + hw, MOON_Y + dy);
      moonGfx.strokePath();
    }
    for (let dx = -290; dx <= 290; dx += 38) {
      const hh = Math.sqrt(Math.max(0, MOON_R * MOON_R - dx * dx));
      if (hh < 4) continue;
      moonGfx.lineStyle(1, 0x3a6aaa, 0.14);
      moonGfx.beginPath();
      moonGfx.moveTo(MOON_X + dx, MOON_Y - hh);
      moonGfx.lineTo(MOON_X + dx, MOON_Y + hh);
      moonGfx.strokePath();
    }

    // Colonised facility sectors — double-ring zones with fill
    // Positioned clear of all mission nodes
    const zones = [
      { dx: -115, dy:   55, r: 40 },  // left-mid
      { dx:   75, dy:  -85, r: 30 },  // upper-center
      { dx:  -35, dy:  195, r: 22 },  // lower-left  (was 25,125 — moved clear of node 2)
      { dx:  -50, dy: -150, r: 20 },  // upper-left
      { dx:  160, dy:   20, r: 22 },  // right
      { dx: -220, dy: -140, r: 14 },  // far upper-left (was -175,-95 — moved clear of node 1)
    ];
    for (const z of zones) {
      moonGfx.fillStyle(0x2277aa, 0.11);
      moonGfx.fillCircle(MOON_X + z.dx, MOON_Y + z.dy, z.r);
      moonGfx.lineStyle(1, 0x44aadd, 0.40);
      moonGfx.strokeCircle(MOON_X + z.dx, MOON_Y + z.dy, z.r);
      moonGfx.lineStyle(1, 0x3388bb, 0.18);
      moonGfx.strokeCircle(MOON_X + z.dx, MOON_Y + z.dy, z.r + 9);
    }

    // Infrastructure corridors connecting facility sectors
    const corridors: [number, number][] = [[0,1],[1,3],[0,2],[1,4],[3,5],[4,5]];
    for (const [a, b] of corridors) {
      moonGfx.lineStyle(1, 0x3399bb, 0.22);
      moonGfx.beginPath();
      moonGfx.moveTo(MOON_X + zones[a].dx, MOON_Y + zones[a].dy);
      moonGfx.lineTo(MOON_X + zones[b].dx, MOON_Y + zones[b].dy);
      moonGfx.strokePath();
    }

    // Impact craters — smaller / sparser (colonised surface); sensor marker at rim
    const craters = [
      { dx: -100, dy: -170, r: 28, da: 0.20, la: 0.15 },
      { dx:  140, dy:   70, r: 20, da: 0.16, la: 0.12 },
      { dx:  -80, dy:  200, r: 30, da: 0.22, la: 0.16 },
      { dx:  220, dy: -150, r: 15, da: 0.12, la: 0.09 },
      { dx: -195, dy:   75, r: 18, da: 0.14, la: 0.11 },
      { dx:  -55, dy: -215, r: 10, da: 0.10, la: 0.08 },
      { dx:  -62, dy:  212, r: 16, da: 0.13, la: 0.10 },
      { dx:   93, dy:  193, r: 12, da: 0.11, la: 0.09 },
      { dx: -238, dy:  -40, r: 11, da: 0.10, la: 0.08 },
    ];
    for (const c of craters) {
      moonGfx.fillStyle(0x454a56, c.da * 2.2);
      moonGfx.fillCircle(MOON_X + c.dx, MOON_Y + c.dy, c.r);
      moonGfx.fillStyle(0x8a96a4, c.la);
      moonGfx.fillCircle(MOON_X + c.dx + c.r * 0.28, MOON_Y + c.dy - c.r * 0.28, c.r * 0.60);
      // Sensor/salvage station pixel at crater rim
      moonGfx.fillStyle(0x55aacc, 0.55);
      moonGfx.fillRect(MOON_X + c.dx + c.r - 2, MOON_Y + c.dy - 1, 4, 3);
    }

    // ── 3. Night-side shadow + city lights (masked, on top of terrain) ───────
    const shadowGfx = this.add.graphics().setDepth(3).setMask(moonMask);

    // Terminator shadow — offset so it clips cleanly inside the moon disc
    shadowGfx.fillStyle(0x000b1e, 0.52);
    shadowGfx.fillCircle(MOON_X + 155, MOON_Y + 45, MOON_R);

    // City lights visible on the dark side — warm amber pixels with glow halo
    const lights = [
      { dx:  85, dy:  65 }, { dx: 125, dy: -28 }, { dx: 155, dy:  98 },
      { dx: 195, dy: -18 }, { dx: 155, dy: 148 }, { dx: 248, dy:  75 },
      { dx:  95, dy: -98 }, { dx: 218, dy: -98 }, { dx: 135, dy: -148 },
      { dx: 258, dy:  28 }, { dx: 182, dy:  68 }, { dx: 230, dy: 145 },
      { dx: 112, dy: 162 }, { dx: 270, dy: -45 },
    ];
    for (const l of lights) {
      shadowGfx.fillStyle(0xffbb33, 0.80);
      shadowGfx.fillRect(MOON_X + l.dx - 1, MOON_Y + l.dy - 1, 2, 2);
      shadowGfx.fillStyle(0xff9900, 0.18);
      shadowGfx.fillCircle(MOON_X + l.dx, MOON_Y + l.dy, 5);
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
        fontFamily: 'VT323, "Share Tech Mono", monospace', fontSize: '22px',
        color: isCompleted ? '#000814' : isSelectable ? '#000814' : '#334455',
      }).setOrigin(0.5).setDepth(6);

      // Level name below
      this.add.text(x, y + 38, label, {
        fontFamily:      'VT323, "Share Tech Mono", monospace', fontSize: '18px',
        color:           isCompleted ? '#ffcc22' : isSelectable ? '#ffe866' : '#2a3a55',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(6);

      // Flavour subtitle (cosmetic, random pick per session)
      const subs = NODE_SUBTITLES[i] ?? [];
      const sub  = subs[Math.floor(Math.random() * subs.length)] ?? '';
      const subTxt = this.add.text(x, y + 58, sub, {
        fontFamily: 'VT323, "Share Tech Mono", monospace', fontSize: '14px',
        color:      isAvailable ? '#6de3ff' : '#1a2535',
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
    // Title strip with corner brackets
    const title = this.add.text(GAME_W / 2, 44, '[ MISSION  SELECT ]', {
      fontFamily: 'VT323, "Share Tech Mono", monospace', fontSize: '42px', color: '#6de3ff',
      stroke: '#001122', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // Subtitle
    this.add.text(GAME_W / 2, 76, 'GDI TACTICAL NETWORK // MOONBASE THETA', {
      fontFamily: 'VT323, "Share Tech Mono", monospace', fontSize: '16px', color: '#3a7a96',
    }).setOrigin(0.5).setDepth(10);

    if (this.totalScore > 0) {
      this.add.text(GAME_W / 2, 104, `SCORE  ${this.totalScore.toLocaleString()}`, {
        fontFamily: '"Share Tech Mono", VT323, monospace', fontSize: '18px', color: '#ffb347',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(10);
    }

    const hasChoice = this.selectableNodes.length > 1;
    const hint = hasChoice
      ? '◄ ►  CHOOSE MISSION     [ ENTER / SPACE ]  DEPLOY'
      : '[ ENTER / SPACE ]  DEPLOY';
    this.add.text(GAME_W / 2, GAME_H - 30, hint, {
      fontFamily: 'VT323, "Share Tech Mono", monospace', fontSize: '20px', color: '#6de3ff',
    }).setOrigin(0.5).setDepth(10);

    // Bracketed corner frame
    const g = this.add.graphics().setDepth(10);
    g.lineStyle(2, 0x6de3ff, 0.9);
    const b = 28, s = 36;
    g.lineBetween(b, b, b + s, b); g.lineBetween(b, b, b, b + s);
    g.lineBetween(GAME_W - b, b, GAME_W - b - s, b); g.lineBetween(GAME_W - b, b, GAME_W - b, b + s);
    g.lineBetween(b, GAME_H - b, b + s, GAME_H - b); g.lineBetween(b, GAME_H - b, b, GAME_H - b - s);
    g.lineBetween(GAME_W - b, GAME_H - b, GAME_W - b - s, GAME_H - b);
    g.lineBetween(GAME_W - b, GAME_H - b, GAME_W - b, GAME_H - b - s);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    const kb = this.input.keyboard!;

    const onEnter = () => this.launchLevel();
    const onSpace = () => this.launchLevel();
    const onLeft  = () => this.shiftCursor(-1);
    const onRight = () => this.shiftCursor(1);
    const onA     = () => this.shiftCursor(-1);
    const onD     = () => this.shiftCursor(1);

    kb.on('keydown-ENTER', onEnter);
    kb.on('keydown-SPACE', onSpace);
    kb.on('keydown-LEFT',  onLeft);
    kb.on('keydown-RIGHT', onRight);
    kb.on('keydown-A',     onA);
    kb.on('keydown-D',     onD);

    this.keyboardEventUnsubs.push(
      () => kb.off('keydown-ENTER', onEnter),
      () => kb.off('keydown-SPACE', onSpace),
      () => kb.off('keydown-LEFT',  onLeft),
      () => kb.off('keydown-RIGHT', onRight),
      () => kb.off('keydown-A',     onA),
      () => kb.off('keydown-D',     onD),
    );

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

  shutdown(): void {
    for (const unsub of this.keyboardEventUnsubs.splice(0)) unsub();
    this.cursorPulseTween?.stop();
    this.cursorPulseTween = null;
  }
}
