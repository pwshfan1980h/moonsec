import Phaser from 'phaser';
import { MinimapRenderer } from '../ui/MinimapRenderer';
import type { GameScene } from './GameScene';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { GAME_W, GAME_H, RADAR_X, RADAR_Y, RADAR_SCREEN_RADIUS } from '../constants';

// ── Tactical HUD design tokens ────────────────────────────────────────────
const FONT_MONO     = 'VT323, "Share Tech Mono", monospace';
const FONT_READOUT  = '"Share Tech Mono", VT323, monospace';

const COL = {
  // chrome
  panelFill:    0x02111e,
  panelFillA:   0.78,
  rail:         0x18456e,
  railDim:      0x0d2a42,
  hair:         0x0f2638,
  // primary readouts
  cyan:         0x6de3ff,
  cyanHex:      '#6de3ff',
  cyanDim:      0x2a6b88,
  cyanDimHex:   '#3a7a96',
  // text inks
  ink:          '#cfe9ff',
  inkDim:       '#5d85a3',
  inkFaint:     '#2e4a62',
  label:        '#6de3ff',
  // danger / alert
  red:          0xff3a4a,
  redHex:       '#ff6272',
  amber:        0xffb347,
  amberHex:     '#ffb347',
  green:        0x56e39f,
  greenHex:     '#56e39f',
};

// Panel geometry
const BAR_W     = 260;                      // bar width
const BAR_H_PRI = 18;                       // HP, MSL
const BAR_H_SEC = 12;                       // JP, TRT, Nanoheal, Ammo
const PAD_EDGE  = 18;                       // outer margin
const PAD_IN    = 14;                       // panel internal padding
const ROW_GAP   = 10;
const LABEL_H   = 18;
const PANEL_W   = PAD_IN + BAR_W + PAD_IN;  // 288

// Bracket corner size (the [ ] marks at each panel corner)
const BR = 12;

export class UIScene extends Phaser.Scene {
  private missileFill!: Phaser.GameObjects.Graphics;
  private turretFill!: Phaser.GameObjects.Graphics;
  private naniteFill!: Phaser.GameObjects.Graphics;
  private ammoFill!: Phaser.GameObjects.Graphics;

  // bar geometry captured for redraws
  private missileRect = { x: 0, y: 0, w: BAR_W, h: BAR_H_PRI };
  private turretRect = { x: 0, y: 0, w: BAR_W, h: BAR_H_SEC };
  private naniteRect = { x: 0, y: 0, w: BAR_W, h: BAR_H_SEC };
  private ammoRect = { x: 0, y: 0, w: BAR_W, h: BAR_H_SEC };

  // labels
  private missileLabel!: Phaser.GameObjects.Text;
  private missileState!: Phaser.GameObjects.Text;
  private turretLabel!: Phaser.GameObjects.Text;
  private turretState!: Phaser.GameObjects.Text;
  private naniteLabel!: Phaser.GameObjects.Text;
  private naniteState!: Phaser.GameObjects.Text;
  private ammoLabel!: Phaser.GameObjects.Text;
  private ammoValue!: Phaser.GameObjects.Text;

  // score / wave / radar header
  private scoreText!: Phaser.GameObjects.Text;
  private scoreCaption!: Phaser.GameObjects.Text;
  private waveCounter!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private waveSubText!: Phaser.GameObjects.Text;
  private dronesRemainingText!: Phaser.GameObjects.Text;

  // nanite state tracking
  private naniteActive = false;
  private naniteReady = true;
  private lowHpPrompt: Phaser.GameObjects.Text | null = null;
  private lowHpPulseTween: Phaser.Tweens.Tween | null = null;
  private nanitePulseTween: Phaser.Tweens.Tween | null = null;
  private naniteProgress = 1;
  private missileProgress = 1;
  private turretProgress = 1;
  private curHp = 0;
  private curMaxHp = 1;
  private curAmmo = 0;
  private curAmmoMax = 1;

  private levelCompleteActive = false;

  // Boss telegraph
  private telegraphLabel: Phaser.GameObjects.Text | null = null;
  private telegraphMoveLabel: Phaser.GameObjects.Text | null = null;
  private telegraphBg: Phaser.GameObjects.Graphics | null = null;

  // Pause elements
  private pauseBg!: Phaser.GameObjects.Rectangle;
  private pauseFrame!: Phaser.GameObjects.Graphics;
  private pauseText!: Phaser.GameObjects.Text;
  private pauseSub!: Phaser.GameObjects.Text;
  private paused = false;

  // Game-over state
  private gameOverActive = false;
  private currentWave = 0;
  private currentScore = 0;
  private lastHp = 0;

  private minimap!: MinimapRenderer;
  private radarFrame!: Phaser.GameObjects.Graphics;
  private radarCaption!: Phaser.GameObjects.Text;
  private radarTicks!: Phaser.GameObjects.Graphics;

  // Wave progress bar
  private waveProgressFrame!: Phaser.GameObjects.Graphics;
  private waveProgressFill!: Phaser.GameObjects.Graphics;
  private waveProgressRect = { x: 0, y: 0, w: 0, h: 6 };
  private waveTotalCount = 5;
  private waveTotalDrones = 0;       // expected drones this wave (from spawner)
  private waveKilled = 0;            // kills counted this wave
  private waveLastRemaining = 0;     // last dronesRemaining seen — used to detect kills
  private bossPhaseActive = false;

  // Missile icon + audio state
  private missileIcon!: Phaser.GameObjects.Graphics;
  private missileIconCx = 0;
  private missileIconCy = 0;
  private missileReloadActive = false;

  private gameEventUnsubs: Array<() => void> = [];
  private keyboardEventUnsubs: Array<() => void> = [];

  constructor() {
    super({ key: 'UI', active: false });
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.gameEventUnsubs = [];
    this.keyboardEventUnsubs = [];

    const W = GAME_W, H = GAME_H;
    this.gameOverActive = false;
    this.levelCompleteActive = false;
    this.paused = false;
    this.naniteActive = false;
    this.currentWave = 0;
    this.currentScore = 0;
    this.lastHp = 0;
    this.naniteReady = true;
    this.curHp = 0;
    this.curMaxHp = 1;
    this.naniteProgress = 1;
    this.missileProgress = 1;
    this.turretProgress = 1;
    this.lowHpPrompt = null;
    this.lowHpPulseTween = null;
    this.waveTotalDrones = 0;
    this.waveKilled = 0;
    this.waveLastRemaining = 0;
    this.bossPhaseActive = false;
    this.missileReloadActive = false;

    // ── LEFT STAT PANEL (top-left) ────────────────────────────────
    // HP and Thruster Fuel are now drawn diegetically above the mech (PlayerHud);
    // this panel only carries Nanoheal + Rapid Ammo.
    const panelX = PAD_EDGE;
    const barX   = panelX + PAD_IN;

    const leftR0Lbl = PAD_EDGE + PAD_IN + 4;
    const leftR0Bar = leftR0Lbl + LABEL_H;
    const leftR1Lbl = leftR0Bar + BAR_H_SEC + ROW_GAP;
    const leftR1Bar = leftR1Lbl + LABEL_H;

    const panelH = (leftR1Bar + BAR_H_SEC + PAD_IN) - PAD_EDGE;

    this.drawPanel(panelX, PAD_EDGE, PANEL_W, panelH, 'L-01 · MECH STATUS');

    // Nanoheal row
    this.naniteLabel = this.add.text(barX, leftR0Lbl, 'NANOHEAL', {
      fontFamily: FONT_MONO, fontSize: '18px', color: COL.label,
    });
    this.naniteState = this.add.text(barX + BAR_W, leftR0Lbl, 'READY', {
      fontFamily: FONT_READOUT, fontSize: '16px', color: COL.greenHex,
    }).setOrigin(1, 0);
    this.naniteRect = { x: barX, y: leftR0Bar, w: BAR_W, h: BAR_H_SEC };
    this.naniteFill = this.add.graphics();
    this.drawBarFrame(this.naniteRect, 4);
    this.paintBar(this.naniteFill, this.naniteRect, 1, COL.green, 4);

    // Rapid ammo row
    this.ammoLabel = this.add.text(barX, leftR1Lbl, 'RAPID AMMO', {
      fontFamily: FONT_MONO, fontSize: '18px', color: COL.label,
    });
    this.ammoValue = this.add.text(barX + BAR_W, leftR1Lbl, '', {
      fontFamily: FONT_READOUT, fontSize: '16px', color: COL.cyanHex,
    }).setOrigin(1, 0);
    this.ammoRect = { x: barX, y: leftR1Bar, w: BAR_W, h: BAR_H_SEC };
    this.ammoFill = this.add.graphics();
    this.drawBarFrame(this.ammoRect, 5);
    this.paintBar(this.ammoFill, this.ammoRect, 1, COL.cyan, 5);

    // ── RIGHT STAT PANEL (top-right) ──────────────────────────────
    const panelRX  = W - PAD_EDGE - PANEL_W;
    const barRX    = panelRX + PAD_IN;
    // Right panel keeps its original 2-row layout (MSL=PRI, TRT=SEC) so weapon rows aren't shifted by the left panel changes
    const rightR0Lbl = PAD_EDGE + PAD_IN + 4;
    const rightR0Bar = rightR0Lbl + LABEL_H;
    const rightR1Lbl = rightR0Bar + BAR_H_PRI + ROW_GAP;
    const rightR1Bar = rightR1Lbl + LABEL_H;
    const rightPanelH = (rightR1Bar + BAR_H_SEC + PAD_IN) - PAD_EDGE;

    this.drawPanel(panelRX, PAD_EDGE, PANEL_W, rightPanelH, 'R-01 · WEAPONS');

    // MSL row
    this.missileIcon = this.add.graphics();
    this.missileIconCx = barRX + 10;
    this.missileIconCy = rightR0Lbl + 10;
    this.drawMissileIcon(this.missileIcon, this.missileIconCx, this.missileIconCy, COL.cyan);
    this.missileLabel = this.add.text(barRX + 24, rightR0Lbl, 'HOMING MISSILE', {
      fontFamily: FONT_MONO, fontSize: '18px', color: COL.label,
    });
    this.missileState = this.add.text(barRX + BAR_W, rightR0Lbl, 'READY', {
      fontFamily: FONT_READOUT, fontSize: '16px', color: COL.cyanHex,
    }).setOrigin(1, 0);
    this.missileRect = { x: barRX, y: rightR0Bar, w: BAR_W, h: BAR_H_PRI };
    this.missileFill = this.add.graphics();
    this.drawBarFrame(this.missileRect, 4);
    this.paintBar(this.missileFill, this.missileRect, 1, COL.cyan, 4);

    // TRT row
    this.turretLabel = this.add.text(barRX, rightR1Lbl, 'TURRET', {
      fontFamily: FONT_MONO, fontSize: '18px', color: COL.label,
    });
    this.turretState = this.add.text(barRX + BAR_W, rightR1Lbl, 'READY', {
      fontFamily: FONT_READOUT, fontSize: '16px', color: COL.cyanHex,
    }).setOrigin(1, 0);
    this.turretRect = { x: barRX, y: rightR1Bar, w: BAR_W, h: BAR_H_SEC };
    this.turretFill = this.add.graphics();
    this.drawBarFrame(this.turretRect, 4);
    this.paintBar(this.turretFill, this.turretRect, 1, COL.cyan, 4);

    // ── Score (top-center) — tactical readout ─────────────────────
    const scoreY = PAD_EDGE + 6;
    this.scoreCaption = this.add.text(W / 2, scoreY, '— SCORE —', {
      fontFamily: FONT_MONO, fontSize: '16px', color: COL.inkDim,
    }).setOrigin(0.5, 0);
    this.scoreText = this.add.text(W / 2, scoreY + 18, '0000000', {
      fontFamily: FONT_READOUT, fontSize: '42px', color: COL.ink,
    }).setOrigin(0.5, 0);

    this.waveCounter = this.add.text(W / 2, scoreY + 66, '', {
      fontFamily: FONT_MONO, fontSize: '18px', color: COL.cyanHex,
    }).setOrigin(0.5, 0);

    this.dronesRemainingText = this.add.text(W / 2, scoreY + 90, '', {
      fontFamily: FONT_MONO, fontSize: '18px', color: COL.redHex,
    }).setOrigin(0.5, 0).setAlpha(0);

    // ── Wave announcement (big, fades out) ────────────────────────
    this.waveText = this.add.text(W / 2, H / 2 - 48, '', {
      fontFamily: FONT_MONO, fontSize: '72px', color: COL.cyanHex,
      stroke: '#001a2a', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(30);
    this.waveSubText = this.add.text(W / 2, H / 2 + 10, '', {
      fontFamily: FONT_MONO, fontSize: '22px', color: COL.inkDim,
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(30);

    // ── Pause overlay ─────────────────────────────────────────────
    this.pauseBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000812, 0.72)
      .setDepth(50).setVisible(false);
    this.pauseFrame = this.add.graphics().setDepth(50).setVisible(false);
    this.pauseText = this.add.text(W / 2, H / 2 - 24, '[ PAUSED ]', {
      fontFamily: FONT_MONO, fontSize: '64px', color: COL.cyanHex,
    }).setOrigin(0.5).setDepth(51).setVisible(false);
    this.pauseSub = this.add.text(W / 2, H / 2 + 40, 'ESC TO RESUME     H FOR CONTROLS', {
      fontFamily: FONT_MONO, fontSize: '22px', color: COL.inkDim,
    }).setOrigin(0.5).setDepth(51).setVisible(false);

    // ── Radar frame (drawn once) ──────────────────────────────────
    this.drawRadarFrame();

    // ── Wave progress bar (top-center, thin, wide) ────────────────
    const wpW = 820;
    this.waveProgressRect = { x: (W - wpW) / 2, y: 6, w: wpW, h: 6 };
    this.waveProgressFrame = this.add.graphics().setDepth(20);
    this.waveProgressFill  = this.add.graphics().setDepth(21);
    this.drawWaveProgress();

    // ── Listen for events from GameScene ──────────────────────────
    this.attachGameEventListeners();

    // ── Keyboard handlers ─────────────────────────────────────────
    const onEsc = () => {
      if (this.gameOverActive) return;
      if (this.controlsOpen) { this.closeControlsOverlay(); return; }
      this.togglePause();
    };
    this.input.keyboard!.on('keydown-ESC', onEsc);
    this.keyboardEventUnsubs.push(() => this.input.keyboard?.off('keydown-ESC', onEsc));

    const onRestart = () => {
      if (!this.gameOverActive) return;
      const gameScene = this.scene.get('Game');
      gameScene.scene.restart();
      this.scene.restart();
    };
    this.input.keyboard!.on('keydown-R', onRestart);
    this.keyboardEventUnsubs.push(() => this.input.keyboard?.off('keydown-R', onRestart));

    // ── Radar minimap ─────────────────────────────────────────────
    this.minimap = new MinimapRenderer(this);

    // ── Controls overlay (toggleable with H) ──────────────────────
    const onControls = () => this.toggleControls();
    this.input.keyboard!.on('keydown-H', onControls);
    this.keyboardEventUnsubs.push(() => this.input.keyboard?.off('keydown-H', onControls));

    // ── First-boot onboarding: open the controls overlay. User must press
    //    SPACE / ENTER / H / ESC to dismiss it. The overlay pauses the game.
    if (this.registry.get('firstBoot') === true) {
      this.registry.set('firstBoot', false);
      this.openControlsOverlay();
    }
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────

  /** Tactical panel: dark fill, hair border, bracketed corners, title caption. */
  private drawPanel(x: number, y: number, w: number, h: number, title: string): void {
    const g = this.add.graphics();
    // Fill + inner stripe
    g.fillStyle(COL.panelFill, COL.panelFillA);
    g.fillRect(x, y, w, h);
    // Subtle horizontal scan lines
    g.fillStyle(0x0a1b2b, 0.18);
    for (let sy = y + 3; sy < y + h; sy += 4) g.fillRect(x + 2, sy, w - 4, 1);
    // Hair border
    g.lineStyle(1, COL.rail, 0.9);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // Inner track (double-line look)
    g.lineStyle(1, COL.hair, 0.6);
    g.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);

    // Bracketed corners — thicker cyan accents at 4 corners
    g.lineStyle(2, COL.cyan, 0.95);
    // top-left
    g.lineBetween(x, y + BR, x, y); g.lineBetween(x, y, x + BR, y);
    // top-right
    g.lineBetween(x + w - BR, y, x + w, y); g.lineBetween(x + w, y, x + w, y + BR);
    // bottom-left
    g.lineBetween(x, y + h - BR, x, y + h); g.lineBetween(x, y + h, x + BR, y + h);
    // bottom-right
    g.lineBetween(x + w - BR, y + h, x + w, y + h); g.lineBetween(x + w, y + h - BR, x + w, y + h);

    // Title caption — small offset label in a notch
    const capX = x + 14;
    const cap = this.add.text(capX, y - 1, title, {
      fontFamily: FONT_MONO, fontSize: '14px', color: COL.inkFaint,
    }).setOrigin(0, 0.5);
    // mask a little of the top border where the caption sits
    const maskG = this.add.graphics();
    maskG.fillStyle(COL.panelFill, 1);
    maskG.fillRect(capX - 4, y - 2, cap.width + 8, 4);
    maskG.setDepth(0);
    cap.setDepth(1);
  }

  /** Static bar frame (background well + tick marks + segment dividers). */
  private drawBarFrame(r: { x: number; y: number; w: number; h: number }, segments: number): void {
    const g = this.add.graphics();
    // Inset well
    g.fillStyle(0x050f19, 1);
    g.fillRect(r.x, r.y, r.w, r.h);
    // Hair border
    g.lineStyle(1, COL.rail, 0.7);
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    // Segment dividers — vertical hairlines dividing the bar
    if (segments > 1) {
      const step = r.w / segments;
      g.lineStyle(1, COL.hair, 0.95);
      for (let i = 1; i < segments; i++) {
        const xx = Math.round(r.x + step * i) + 0.5;
        g.lineBetween(xx, r.y + 2, xx, r.y + r.h - 2);
      }
    }
    // Tick marks below bar (every 25%)
    g.lineStyle(1, COL.rail, 0.85);
    for (let i = 0; i <= 4; i++) {
      const xx = Math.round(r.x + (r.w * i) / 4) + 0.5;
      g.lineBetween(xx, r.y + r.h + 2, xx, r.y + r.h + (i === 0 || i === 4 ? 5 : 3));
    }
  }

  /** Redraw the colored fill for a bar with segment-bleed styling. */
  private paintBar(
    gfx: Phaser.GameObjects.Graphics,
    r: { x: number; y: number; w: number; h: number },
    t: number,
    color: number,
    _segments: number,
  ): void {
    gfx.clear();
    const filled = Math.max(0, Math.min(r.w, Math.floor(r.w * t)));
    if (filled <= 0) return;
    gfx.fillStyle(color, 1);
    gfx.fillRect(r.x + 1, r.y + 1, filled - 1, r.h - 2);
    // Hot highlight row
    gfx.fillStyle(0xffffff, 0.28);
    gfx.fillRect(r.x + 1, r.y + 1, filled - 1, 1);
  }

  /** Draw the permanent radar bezel + ticks + caption. */
  private drawRadarFrame(): void {
    const g = this.add.graphics().setDepth(99);
    const rx = RADAR_X, ry = RADAR_Y, R = RADAR_SCREEN_RADIUS;

    // Outer ring — thick brushed steel look (2 rings)
    g.lineStyle(2, COL.rail, 0.95);
    g.strokeCircle(rx, ry, R + 8);
    g.lineStyle(1, COL.hair, 0.8);
    g.strokeCircle(rx, ry, R + 3);

    // Tick marks around outer bezel — N/E/S/W longer
    for (let i = 0; i < 24; i++) {
      const a = (Math.PI * 2 * i) / 24;
      const long = (i % 6) === 0;
      const r0 = R + 8;
      const r1 = R + (long ? 16 : 12);
      g.lineStyle(long ? 2 : 1, long ? COL.cyan : COL.rail, long ? 0.95 : 0.75);
      g.lineBetween(rx + Math.cos(a) * r0, ry + Math.sin(a) * r0,
                    rx + Math.cos(a) * r1, ry + Math.sin(a) * r1);
    }

    // Cardinal letters
    const card = (ch: string, dx: number, dy: number) => {
      this.add.text(rx + dx, ry + dy, ch, {
        fontFamily: FONT_MONO, fontSize: '16px', color: COL.cyanDimHex,
      }).setOrigin(0.5).setDepth(100);
    };
    card('N', 0, -(R + 28));
    card('S', 0,  (R + 28));
    card('E',  (R + 28), 0);
    card('W', -(R + 28), 0);

    // Caption chip above radar
    const capY = ry - R - 46;
    const capTxt = 'R-02 · RADAR';
    const cap = this.add.text(rx, capY, capTxt, {
      fontFamily: FONT_MONO, fontSize: '15px', color: COL.inkFaint,
    }).setOrigin(0.5).setDepth(100);
    // subtle underline
    const g2 = this.add.graphics().setDepth(99);
    g2.lineStyle(1, COL.rail, 0.7);
    g2.lineBetween(rx - cap.width / 2 - 6, capY + 10, rx + cap.width / 2 + 6, capY + 10);

    this.radarFrame = g;
    this.radarCaption = cap;
    this.radarTicks = g2;
  }

  /** Small stylised missile icon drawn to a graphics object. */
  private drawMissileIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number): void {
    g.clear();
    // Body — horizontal capsule
    g.fillStyle(color, 1);
    g.fillRect(cx - 8, cy - 2, 14, 4);
    // Nose cone — triangle pointing right
    g.fillTriangle(cx + 6, cy - 3, cx + 6, cy + 3, cx + 11, cy);
    // Tail fins
    g.fillTriangle(cx - 8, cy - 2, cx - 11, cy - 5, cx - 5, cy - 2);
    g.fillTriangle(cx - 8, cy + 2, cx - 11, cy + 5, cx - 5, cy + 2);
    // Inner highlight
    g.fillStyle(0xffffff, 0.55);
    g.fillRect(cx - 6, cy - 1, 2, 1);
  }

  /** Render the segmented wave progress bar at the top of the HUD. */
  private drawWaveProgress(): void {
    const { x, y, w, h } = this.waveProgressRect;
    const total = Math.max(1, this.waveTotalCount);
    const segments = total + 1;           // +1 for boss phase
    const segW = w / segments;

    const waveIdx = Math.max(0, this.currentWave);
    const inBoss  = this.bossPhaseActive || waveIdx > total;

    // Rail background
    const f = this.waveProgressFrame;
    f.clear();
    f.fillStyle(COL.railDim, 0.85);
    f.fillRect(x, y, w, h);
    f.lineStyle(1, COL.rail, 0.85);
    f.strokeRect(x - 1, y - 1, w + 2, h + 2);

    // Segment dividers (hairlines)
    f.lineStyle(1, COL.hair, 0.9);
    for (let i = 1; i < segments; i++) {
      f.lineBetween(x + i * segW, y - 2, x + i * segW, y + h + 2);
    }

    // Fill — completed segments full, active segment partial
    const fill = this.waveProgressFill;
    fill.clear();
    const fillColor = inBoss ? COL.red : COL.cyan;
    fill.fillStyle(fillColor, inBoss ? 0.9 : 1);

    // Completed waves (always fully filled)
    const completed = Math.max(0, Math.min(total, waveIdx - 1));
    if (completed > 0) {
      fill.fillRect(x + 1, y + 1, completed * segW - 2, h - 2);
    }

    // Active (current) segment — kill-based progress against the wave's total drone count
    if (!inBoss && waveIdx >= 1 && waveIdx <= total) {
      const prog = this.waveTotalDrones > 0
        ? Phaser.Math.Clamp(this.waveKilled / this.waveTotalDrones, 0, 1)
        : 0;
      const segX = x + (waveIdx - 1) * segW + 1;
      fill.fillRect(segX, y + 1, Math.max(0, segW * prog - 2), h - 2);
    }

    // Boss phase — entire bar filled red with a final segment highlight
    if (inBoss) {
      fill.fillRect(x + 1, y + 1, w - 2, h - 2);
      // brighter pulse tip on the boss segment
      fill.fillStyle(COL.amber, 0.7);
      fill.fillRect(x + total * segW + 1, y + 1, segW - 2, h - 2);
    }

    // Tick labels — only drawn once via text on first build; we keep geometry stable.
  }

  // ── Event listener attach (pulled out for readability) ────────────────────
  private attachGameEventListeners(): void {
    const game = this.scene.get('Game');
    const on = <T extends unknown[]>(ev: string, fn: (...a: T) => void): void => {
      const handler = (...a: T) => {
        if (!this.sys.isActive()) return;
        fn(...a);
      };
      game.events.on(ev, handler);
      this.gameEventUnsubs.push(() => game.events.off(ev, handler));
    };

    on('healthChange', (hp: number, maxHp: number) => {
      this.curHp = hp;
      this.curMaxHp = maxHp;
      // HP bar itself is rendered diegetically by PlayerHud — UI only handles ambient feedback
      if (hp < this.lastHp) this.cameras.main.flash(200, 220, 30, 30, false);
      this.lastHp = hp;
      this.updateLowHpPrompt();
    });

    on('missileCooldown', (progress: number) => {
      const prev = this.missileProgress;
      this.missileProgress = progress;

      // Fire transition: was ready (prev >= 1), now charging — start reload loop
      if (prev >= 1 && progress < 1 && !this.missileReloadActive) {
        this.missileReloadActive = true;
        const gs = this.scene.get('Game') as GameScene;
        gs?.audio?.startLoop('missile-reload');
      }

      // Ready transition: was charging, now at 1 — stop loop, play ready beep
      if (prev < 1 && progress >= 1 && this.missileReloadActive) {
        this.missileReloadActive = false;
        const gs = this.scene.get('Game') as GameScene;
        gs?.audio?.stopLoop('missile-reload');
        gs?.audio?.playMissileReady();
      }

      if (progress >= 1) {
        this.paintBar(this.missileFill, this.missileRect, 1, COL.cyan, 4);
        this.missileLabel.setColor(COL.cyanHex);
        this.missileState.setText('READY').setColor(COL.cyanHex);
        this.drawMissileIcon(this.missileIcon, this.missileIconCx, this.missileIconCy, COL.cyan);
      } else {
        this.paintBar(this.missileFill, this.missileRect, progress, 0xffb347, 4);
        this.missileLabel.setColor(COL.amberHex);
        this.missileState.setText(`CHG ${Math.floor(progress * 100).toString().padStart(2, '0')}%`).setColor('#8a7040');
        this.drawMissileIcon(this.missileIcon, this.missileIconCx, this.missileIconCy, COL.amber);
      }
    });

    on('turretCooldown', (progress: number) => {
      this.turretProgress = progress;
      if (progress >= 1) {
        this.paintBar(this.turretFill, this.turretRect, 1, COL.cyan, 4);
        this.turretLabel.setColor(COL.cyanHex);
        this.turretState.setText('READY').setColor(COL.cyanHex);
      } else {
        this.paintBar(this.turretFill, this.turretRect, progress, 0xffb347, 4);
        this.turretLabel.setColor(COL.amberHex);
        this.turretState.setText(`CHG ${Math.floor(progress * 100).toString().padStart(2, '0')}%`).setColor('#8a7040');
      }
    });

    // Thruster fuel bar is rendered diegetically by PlayerHud — UI no longer subscribes to jetpackFuel

    on('naniteChange', (state: string, progress: number) => {
      this.naniteProgress = progress;
      this.onNaniteChange(state, progress);
    });

    on('rapidAmmoChange', (ammo: number, max: number) => {
      this.curAmmo = ammo; this.curAmmoMax = max;
      const t = max > 0 ? ammo / max : 0;
      const color = t > 0.4 ? 0x6de3ff : t > 0.2 ? 0xffb347 : 0xff3a4a;
      this.paintBar(this.ammoFill, this.ammoRect, t, color, 5);
      const hex = t > 0.4 ? COL.cyanHex : t > 0.2 ? COL.amberHex : COL.redHex;
      this.ammoLabel.setColor(hex);
      this.ammoValue.setColor(hex);
      this.ammoValue.setText(`${String(ammo).padStart(3, '0')} / ${String(max).padStart(3, '0')}`);
    });

    on('scoreChange', (score: number) => {
      this.currentScore = score;
      this.scoreText.setText(String(score).padStart(7, '0'));
    });

    on('waveStart', (wave: number, totalWaves?: number, totalDrones?: number) => {
      this.currentWave = wave;
      if (typeof totalWaves === 'number' && totalWaves > 0) this.waveTotalCount = totalWaves;
      this.bossPhaseActive = wave > this.waveTotalCount;
      // Reset per-wave drone tracking
      this.waveTotalDrones = typeof totalDrones === 'number' && totalDrones > 0 ? totalDrones : 0;
      this.waveKilled = 0;
      this.waveLastRemaining = 0;
      this.drawWaveProgress();
      this.waveCounter.setText(this.bossPhaseActive ? 'BOSS  PHASE' : `WAVE  ${String(wave).padStart(2, '0')}`);

      const W = GAME_W, H = GAME_H;

      // Big announcement
      this.waveText.setText(this.bossPhaseActive ? '// BOSS PHASE //' : `// WAVE ${String(wave).padStart(2, '0')} //`).setAlpha(1);
      this.waveSubText.setText(this.bossPhaseActive ? 'NEXUS SIGNATURE DETECTED' : 'ENGAGE HOSTILES').setAlpha(1);
      this.tweens.add({
        targets: [this.waveText, this.waveSubText],
        alpha: 0, duration: 2000, delay: 1600, ease: 'Power2',
      });

      // Show level name on wave 1 only
      if (wave === 1) {
        const gs    = this.scene.get('Game') as GameScene;
        const label = LEVEL_CONFIGS[gs?.currentNode ?? 0]?.label ?? '';
        const t = this.add.text(W / 2, 160, `> ${label} <`, {
          fontFamily: FONT_MONO, fontSize: '30px',
          color: COL.cyanHex,
          stroke: '#001a2a', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(50).setAlpha(0);
        this.tweens.add({
          targets: t, alpha: 1, duration: 400, yoyo: true, hold: 1400,
          onComplete: () => t.destroy(),
        });
      }
    });

    on('dronesRemaining', (count: number) => {
      if (count > 0) {
        this.dronesRemainingText.setText(`-- ${String(count).padStart(2, '0')} HOSTILES REMAIN --`).setAlpha(1);
      } else {
        this.dronesRemainingText.setAlpha(0);
      }
      this.waveLastRemaining = count;
    });

    on('hostileKilled', () => {
      this.waveKilled += 1;
      this.drawWaveProgress();
    });

    on('killStreak', (count: number, bonus: number) => {
      const W = GAME_W, H = GAME_H;
      const t = this.add.text(W / 2, H / 2, `>>  ${count} KILL STREAK  <<\n+${bonus}`, {
        fontFamily: FONT_MONO, fontSize: '36px', color: COL.amberHex,
        align: 'center', stroke: '#1a1000', strokeThickness: 3,
      }).setOrigin(0.5, 0.5).setDepth(30);
      this.tweens.add({
        targets: t, y: H / 2 - 60, alpha: 0, duration: 1500, ease: 'Power2',
        onComplete: () => t.destroy(),
      });
    });

    on('gameOver', () => this.showGameOver());

    on('bossKilled', () => this.clearTelegraph());

    on('levelComplete', () => {
      if (this.levelCompleteActive) return;
      this.levelCompleteActive = true;
      this.clearTelegraph();
      this.showLevelComplete();
    });

    on('bossTelegraph', ({ side, duration }: { side: 'left' | 'right'; duration: number }) => {
      this.clearTelegraph();
      const W = GAME_W, H = GAME_H;
      const cx = side === 'left' ? W * 0.25 : W * 0.75;

      this.telegraphBg = this.add.graphics().setDepth(55).setScrollFactor(0);
      // Hazard bracket frame
      const bw = 380, bh = 110;
      const bx = cx - bw / 2, by = H / 2 - bh / 2;
      const g = this.telegraphBg;
      g.fillStyle(0x2a0007, 0.75);
      g.fillRect(bx, by, bw, bh);
      g.lineStyle(2, 0xff3a4a, 1);
      g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      // Corner brackets
      const cb = 14;
      g.lineStyle(3, 0xff3a4a, 1);
      g.lineBetween(bx, by + cb, bx, by); g.lineBetween(bx, by, bx + cb, by);
      g.lineBetween(bx + bw - cb, by, bx + bw, by); g.lineBetween(bx + bw, by, bx + bw, by + cb);
      g.lineBetween(bx, by + bh - cb, bx, by + bh); g.lineBetween(bx, by + bh, bx + cb, by + bh);
      g.lineBetween(bx + bw - cb, by + bh, bx + bw, by + bh); g.lineBetween(bx + bw, by + bh - cb, bx + bw, by + bh);

      this.telegraphLabel = this.add.text(cx, H / 2 - 18, '[!]  INCOMING  [!]', {
        fontFamily: FONT_MONO, fontSize: '34px', color: COL.redHex,
        stroke: '#1a0005', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(56).setScrollFactor(0);
      this.telegraphMoveLabel = this.add.text(cx, H / 2 + 22, 'EVADE', {
        fontFamily: FONT_MONO, fontSize: '22px', color: COL.amberHex,
      }).setOrigin(0.5).setDepth(56).setScrollFactor(0);

      // Pulse
      this.tweens.add({
        targets: [this.telegraphLabel, this.telegraphMoveLabel, this.telegraphBg],
        alpha: { from: 0.55, to: 1 }, duration: 280, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      this.time.delayedCall(duration, () => this.clearTelegraph());
    });

    on('bossTelegraphCancel', () => this.clearTelegraph());

    on('bossBlastFired', () => {
      this.clearTelegraph();
      this.cameras.main.flash(250, 255, 50, 0, false);
    });
  }

  update(time: number, _delta: number): void {
    if (this.gameOverActive) return;
    const game = this.scene.get('Game') as GameScene;
    if (!game || !game.sys.isActive()) return;
    this.minimap.draw(time, game);
  }

  private clearTelegraph(): void {
    if (this.telegraphLabel)     { this.tweens.killTweensOf(this.telegraphLabel);     this.telegraphLabel.destroy();     this.telegraphLabel = null; }
    if (this.telegraphMoveLabel) { this.tweens.killTweensOf(this.telegraphMoveLabel); this.telegraphMoveLabel.destroy(); this.telegraphMoveLabel = null; }
    if (this.telegraphBg)        { this.tweens.killTweensOf(this.telegraphBg);        this.telegraphBg.destroy();        this.telegraphBg = null; }
  }

  shutdown(): void {
    this.clearTelegraph();
    for (const unsub of this.gameEventUnsubs.splice(0)) unsub();
    for (const unsub of this.keyboardEventUnsubs.splice(0)) unsub();
    this.closeControlsOverlay(false);
    if (this.missileReloadActive) {
      const gs = this.scene.get('Game') as GameScene;
      gs?.audio?.stopLoop('missile-reload');
      this.missileReloadActive = false;
    }
    if (this.nanitePulseTween) { this.nanitePulseTween.stop(); this.nanitePulseTween = null; }
    if (this.lowHpPulseTween)  { this.lowHpPulseTween.stop();  this.lowHpPulseTween  = null; }
    this.lowHpPrompt?.destroy();
    this.lowHpPrompt = null;
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.scene.pause('Game');
      this.pauseBg.setVisible(true);
      this.pauseText.setVisible(true);
      this.pauseSub.setVisible(true);
      this.drawPauseFrame();
      this.pauseFrame.setVisible(true);
    } else {
      this.scene.resume('Game');
      this.pauseBg.setVisible(false);
      this.pauseText.setVisible(false);
      this.pauseSub.setVisible(false);
      this.pauseFrame.setVisible(false);
    }
  }

  private drawPauseFrame(): void {
    const g = this.pauseFrame;
    g.clear();
    const W = GAME_W, H = GAME_H;
    // Outer corner brackets
    g.lineStyle(3, COL.cyan, 0.9);
    const inset = 80, size = 60;
    // TL
    g.lineBetween(inset, inset, inset + size, inset); g.lineBetween(inset, inset, inset, inset + size);
    // TR
    g.lineBetween(W - inset, inset, W - inset - size, inset); g.lineBetween(W - inset, inset, W - inset, inset + size);
    // BL
    g.lineBetween(inset, H - inset, inset + size, H - inset); g.lineBetween(inset, H - inset, inset, H - inset - size);
    // BR
    g.lineBetween(W - inset, H - inset, W - inset - size, H - inset); g.lineBetween(W - inset, H - inset, W - inset, H - inset - size);
  }

  private onNaniteChange(state: string, progress: number): void {
    if (state === 'active') {
      this.naniteActive = true;
      // Mech-mounted HP bar glows green via PlayerHud's nanite hook
      this.paintBar(this.naniteFill, this.naniteRect, 1, COL.green, 4);
      this.naniteLabel.setColor(COL.greenHex);
      this.naniteState.setText('ACTIVE').setColor(COL.greenHex);
      if (!this.nanitePulseTween) {
        this.nanitePulseTween = this.tweens.add({
          targets: this.naniteFill,
          alpha: { from: 0.55, to: 1 },
          duration: 380, yoyo: true, repeat: -1,
        });
      }
    } else if (state === 'cooldown') {
      this.naniteActive = false;
      if (this.nanitePulseTween) { this.nanitePulseTween.stop(); this.nanitePulseTween = null; }
      this.naniteFill.setAlpha(1);
      this.paintBar(this.naniteFill, this.naniteRect, progress, 0x2a6b88, 4);
      this.naniteLabel.setColor(COL.cyanDimHex);
      this.naniteState.setText(`RECHARGING ${Math.floor(progress * 100)}%`).setColor('#5d85a3');
    } else if (state === 'ready') {
      this.naniteActive = false;
      if (this.nanitePulseTween) { this.nanitePulseTween.stop(); this.nanitePulseTween = null; }
      this.naniteFill.setAlpha(1);
      this.paintBar(this.naniteFill, this.naniteRect, 1, COL.green, 4);
      this.naniteLabel.setColor(COL.greenHex);
      this.naniteState.setText('READY').setColor(COL.greenHex);
    }
    this.naniteReady = (state === 'ready');
    this.updateLowHpPrompt();
  }

  private updateLowHpPrompt(): void {
    const hpRatio = this.curMaxHp > 0 ? this.curHp / this.curMaxHp : 1;
    const shouldShow = hpRatio < 0.25
      && this.curHp > 0
      && this.naniteReady
      && !this.gameOverActive
      && !this.levelCompleteActive
      && !this.controlsOpen;

    if (shouldShow && !this.lowHpPrompt) {
      this.lowHpPrompt = this.add.text(
        GAME_W / 2, GAME_H - 150,
        '<<  PRESS Q -- NANITE PROTOCOL  >>',
        {
          fontFamily: FONT_MONO, fontSize: '28px', color: COL.greenHex,
          stroke: '#001a12', strokeThickness: 3,
        },
      ).setOrigin(0.5).setDepth(45);
      this.lowHpPulseTween = this.tweens.add({
        targets: this.lowHpPrompt,
        alpha: { from: 0.35, to: 1.0 },
        duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else if (!shouldShow && this.lowHpPrompt) {
      this.lowHpPulseTween?.stop();
      this.lowHpPulseTween = null;
      this.lowHpPrompt.destroy();
      this.lowHpPrompt = null;
    }
  }

  private controlsOpen = false;
  private controlsObjs: Phaser.GameObjects.GameObject[] = [];
  private controlsDismissKeys: string[] = [];
  private controlsDismissFn: (() => void) | null = null;

  private toggleControls(): void {
    if (this.gameOverActive || this.levelCompleteActive || this.paused) return;
    if (this.controlsOpen) this.closeControlsOverlay();
    else                   this.openControlsOverlay();
  }

  private openControlsOverlay(): void {
    this.controlsOpen = true;
    this.scene.pause('Game');

    const W = GAME_W, H = GAME_H;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };

    push(this.add.rectangle(W / 2, H / 2, W, H, 0x000812, 0.94).setDepth(60).setScrollFactor(0));

    // scanline overlay
    const scanG = push(this.add.graphics()).setDepth(60).setScrollFactor(0) as Phaser.GameObjects.Graphics;
    scanG.fillStyle(0x0a1b2b, 0.35);
    for (let y = 0; y < H; y += 4) scanG.fillRect(0, y, W, 1);

    // Title strip
    push(this.add.text(W / 2, H * 0.12, 'MECH-IV // GDI TERMINAL', {
      fontFamily: FONT_MONO, fontSize: '16px', color: COL.inkFaint,
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));

    push(this.add.text(W / 2, H * 0.18, '[ CONTROLS ]', {
      fontFamily: FONT_MONO, fontSize: '64px', color: COL.cyanHex,
      stroke: '#002a3f', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));

    // Divider
    const divG = push(this.add.graphics()).setDepth(61).setScrollFactor(0) as Phaser.GameObjects.Graphics;
    divG.lineStyle(1, COL.rail, 0.8);
    divG.lineBetween(W * 0.2, H * 0.25, W * 0.8, H * 0.25);
    divG.lineStyle(2, COL.cyan, 0.9);
    divG.lineBetween(W * 0.48, H * 0.25, W * 0.52, H * 0.25);

    const cx      = W / 2;
    const prefX   = cx - 250;
    const keyX    = cx - 140;
    const sepX    = cx - 100;
    const actX    = cx - 40;
    const startY  = H * 0.32;
    const rowH    = 58;

    const bindings: [string, string, boolean?][] = [
      ['A / D',     'LOCOMOTION'],
      ['A·A / D·D', 'SURGE DASH',      true],
      ['SPACE',     'VERTICAL THRUST'],
      ['LMB',       'TURRET FIRE'],
      ['RMB',       'RAPID SUPPRESSION'],
      ['E',         'HOMING MISSILE',  true],
      ['Q',         'NANITE REPAIR',   true],
      ['H',         'TOGGLE HELP'],
      ['ESC',       'PAUSE / MENU'],
    ];

    bindings.forEach(([key, action, highlight], i) => {
      const y = startY + i * rowH;
      const keyCol = highlight ? COL.amberHex : COL.cyanHex;
      const actCol = highlight ? '#d69840'   : COL.ink;
      push(this.add.text(prefX, y, '>',      { fontFamily: FONT_MONO, fontSize: '22px', color: COL.inkFaint }).setOrigin(0, 0.5).setDepth(61).setScrollFactor(0));
      push(this.add.text(keyX,  y, key,      { fontFamily: FONT_MONO, fontSize: '24px', color: keyCol      }).setOrigin(1, 0.5).setDepth(61).setScrollFactor(0));
      push(this.add.text(sepX,  y, '──',     { fontFamily: FONT_MONO, fontSize: '22px', color: COL.inkFaint }).setOrigin(0, 0.5).setDepth(61).setScrollFactor(0));
      push(this.add.text(actX,  y, action,   { fontFamily: FONT_MONO, fontSize: '24px', color: actCol      }).setOrigin(0, 0.5).setDepth(61).setScrollFactor(0));
    });

    const dismissPrompt = push(this.add.text(W / 2, H * 0.92, '< PRESS SPACE / ENTER / H / ESC TO RESUME >', {
      fontFamily: FONT_MONO, fontSize: '20px', color: COL.cyanDimHex,
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));
    this.tweens.add({ targets: dismissPrompt, alpha: 0.25, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    push(this.add.text(W - 20, H - 20, `ALPHA  v${__APP_VERSION__}`, {
      fontFamily: FONT_MONO, fontSize: '16px', color: COL.inkFaint,
    }).setOrigin(1, 1).setDepth(61).setScrollFactor(0));

    // Extra dismiss keys — ESC and H are already bound at scene level
    const dismiss = (): void => this.closeControlsOverlay();
    this.controlsDismissKeys = ['keydown-SPACE', 'keydown-ENTER'];
    for (const ev of this.controlsDismissKeys) this.input.keyboard!.on(ev, dismiss);
    this.controlsDismissFn = dismiss;

    this.controlsObjs = objs;
  }

  private closeControlsOverlay(resumeGame = true): void {
    if (!this.controlsOpen) return;
    this.controlsOpen = false;
    for (const o of this.controlsObjs) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.controlsObjs = [];
    if (this.controlsDismissFn) {
      for (const ev of this.controlsDismissKeys) this.input.keyboard!.off(ev, this.controlsDismissFn);
      this.controlsDismissFn = null;
      this.controlsDismissKeys = [];
    }
    if (resumeGame) this.scene.resume('Game');
  }

  private showLevelComplete(): void {
    const gameScene = this.scene.get('Game') as GameScene;

    const W = GAME_W, H = GAME_H;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000812, 0.82).setDepth(60);

    // Frame
    const g = this.add.graphics().setDepth(60);
    g.lineStyle(2, COL.green, 0.85);
    const bw = 760, bh = 260;
    const bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
    g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    const cb = 22;
    g.lineStyle(3, COL.green, 1);
    g.lineBetween(bx, by + cb, bx, by); g.lineBetween(bx, by, bx + cb, by);
    g.lineBetween(bx + bw - cb, by, bx + bw, by); g.lineBetween(bx + bw, by, bx + bw, by + cb);
    g.lineBetween(bx, by + bh - cb, bx, by + bh); g.lineBetween(bx, by + bh, bx + cb, by + bh);
    g.lineBetween(bx + bw - cb, by + bh, bx + bw, by + bh); g.lineBetween(bx + bw, by + bh - cb, bx + bw, by + bh);

    this.add.text(W / 2, H / 2 - 70, 'OBJECTIVE COMPLETE', {
      fontFamily: FONT_MONO, fontSize: '54px', color: COL.greenHex,
    }).setOrigin(0.5).setDepth(61);
    this.add.text(W / 2, H / 2 - 10, '— ALL HOSTILES NEUTRALIZED —', {
      fontFamily: FONT_MONO, fontSize: '22px', color: COL.ink,
    }).setOrigin(0.5).setDepth(61);
    this.add.text(W / 2, H / 2 + 40, `SCORE  ${String(this.currentScore).padStart(7, '0')}`, {
      fontFamily: FONT_READOUT, fontSize: '30px', color: COL.cyanHex,
    }).setOrigin(0.5).setDepth(61);
    this.add.text(W / 2, H / 2 + 80, 'RETURNING TO MISSION SELECT...', {
      fontFamily: FONT_MONO, fontSize: '18px', color: COL.inkDim,
    }).setOrigin(0.5).setDepth(61);

    gameScene?.audio?.play('level-complete');

    this.time.delayedCall(2000, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (_cam: unknown, progress: number) => {
        if (progress === 1) {
          const gs       = this.scene.get('Game') as GameScene;
          const mechType = (this.registry.get('mechType') as string) ?? 'mech4';
          const completed = [...(gs?.completedNodes ?? []), gs?.currentNode ?? 0];
          const nextNode  = gs?.getDefaultNextNode() ?? 0;
          gameScene.scene.stop('UI');
          gameScene.scene.start('Overworld', {
            currentNode:    nextNode,
            completedNodes: completed,
            totalScore:     this.currentScore,
            mechType,
          });
        }
      });
    });
  }

  private showGameOver(): void {
    this.gameOverActive = true;

    const W = GAME_W, H = GAME_H;

    this.cameras.main.flash(1200, 200, 0, 0, false);
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a0008, 0.55).setDepth(59);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(60);

    const gs = this.scene.get('Game') as GameScene;
    gs?.audio?.startDeathAmbient();

    // Hazard frame
    const g = this.add.graphics().setDepth(60);
    const bw = 880, bh = 340;
    const bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
    g.lineStyle(2, COL.red, 0.85);
    g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    const cb = 26;
    g.lineStyle(3, COL.red, 1);
    g.lineBetween(bx, by + cb, bx, by); g.lineBetween(bx, by, bx + cb, by);
    g.lineBetween(bx + bw - cb, by, bx + bw, by); g.lineBetween(bx + bw, by, bx + bw, by + cb);
    g.lineBetween(bx, by + bh - cb, bx, by + bh); g.lineBetween(bx, by + bh, bx + cb, by + bh);
    g.lineBetween(bx + bw - cb, by + bh, bx + bw, by + bh); g.lineBetween(bx + bw, by + bh - cb, bx + bw, by + bh);

    this.add.text(W / 2, H / 2 - 120, 'SIGNAL LOST', {
      fontFamily: FONT_MONO, fontSize: '28px', color: COL.redHex,
    }).setOrigin(0.5).setDepth(61);

    this.add.text(W / 2, H / 2 - 60, 'MECH DESTROYED', {
      fontFamily: FONT_MONO, fontSize: '88px', color: COL.redHex,
      stroke: '#1a0005', strokeThickness: 4,
    }).setOrigin(0.5, 0.5).setDepth(61);

    this.add.text(W / 2, H / 2 + 10, `SCORE  ${String(this.currentScore).padStart(7, '0')}     WAVE  ${String(this.currentWave).padStart(2, '0')}`, {
      fontFamily: FONT_READOUT, fontSize: '26px', color: COL.ink,
    }).setOrigin(0.5, 0.5).setDepth(61);

    const restartText = this.add.text(W / 2, H / 2 + 90, '[ PRESS  R  TO RESTART ]', {
      fontFamily: FONT_MONO, fontSize: '28px', color: COL.cyanHex,
    }).setOrigin(0.5, 0.5).setDepth(61);

    this.tweens.add({
      targets: restartText,
      alpha: 0.35, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }
}
