import Phaser from 'phaser';
import { repairStatus, type RepairPhase } from '../ui/repairStatus';
import { MinimapRenderer } from '../ui/MinimapRenderer';
import type { MissionObjective } from '../systems/SurfaceMission';
import type { GameScene } from './GameScene';
import type { PlayerUpgradeId } from '../entities/Player';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { GAME_W, GAME_H, RADAR_X, RADAR_Y, RADAR_SCREEN_RADIUS } from '../constants';

// ── Tactical HUD design tokens ────────────────────────────────────────────
const FONT_MONO     = '"Share Tech Mono", monospace';
const FONT_READOUT  = '"Share Tech Mono", VT323, monospace';

const COL = {
  // chrome
  panelFill:    0x02111e,
  panelFillA:   0.92,
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
  inkDim:       '#8aa6b8',
  inkFaint:     '#688799',
  label:        '#6de3ff',
  // danger / alert
  red:          0xff3a4a,
  redHex:       '#ff6272',
  amber:        0xffb347,
  amberHex:     '#ffb347',
  green:        0x56e39f,
  greenHex:     '#56e39f',
};

// All HUD coordinates use the fixed 1920 × 1080 game canvas.
const BAR_W = 244;
const BAR_H_PRI = 10;
const BAR_H_SEC = 10;
const BR = 10;

export class UIScene extends Phaser.Scene {
  private objectiveText?: Phaser.GameObjects.Text;
  private objectiveDetail?: Phaser.GameObjects.Text;
  private objectiveBeacon?: Phaser.GameObjects.Text;
  private objectiveTarget = 650;
  private bossReadout?: Phaser.GameObjects.Text;
  private bossHealthFill?: Phaser.GameObjects.Graphics;
  private surgeFill!: Phaser.GameObjects.Graphics;
  private surgeState!: Phaser.GameObjects.Text;
  private surgeRect = { x: 0, y: 0, w: BAR_W, h: 6 };
  private repairCue!: Phaser.GameObjects.Graphics;
  private repairHint!: Phaser.GameObjects.Text;
  private healthFill!: Phaser.GameObjects.Graphics;
  private fuelFill!: Phaser.GameObjects.Graphics;
  private healthValue!: Phaser.GameObjects.Text;
  private fuelValue!: Phaser.GameObjects.Text;
  private healthRect = { x: 56, y: 116, w: 320, h: 12 };
  private fuelRect = { x: 56, y: 171, w: 320, h: 8 };
  private radioPanel: Phaser.GameObjects.Container | null = null;
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
  private repairPulseTween: Phaser.Tweens.Tween | null = null;
  private nanitePulseTween: Phaser.Tweens.Tween | null = null;
  private naniteProgress = 1;
  private missileProgress = 1;
  private turretProgress = 1;
  private curHp = 0;
  private curMaxHp = 1;
  private curAmmo = 0;
  private curAmmoMax = 1;

  private levelCompleteActive = false;
  private upgradeOpen = false;
  private upgradeObjs: Phaser.GameObjects.GameObject[] = [];
  private upgradeKeyUnsubs: Array<() => void> = [];

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
    this.upgradeOpen = false;
    this.upgradeObjs = [];
    this.upgradeKeyUnsubs = [];
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
    this.repairPulseTween = null;
    this.waveTotalDrones = 0;
    this.waveKilled = 0;
    this.waveLastRemaining = 0;
    this.bossPhaseActive = false;
    this.missileReloadActive = false;

    this.buildCombatHud();

    // ── Wave announcement (big, fades out) ────────────────────────
    this.waveText = this.add.text(W / 2, H / 2 - 48, '', {
      fontFamily: FONT_MONO, fontSize: '56px', color: COL.cyanHex,
      stroke: '#001a2a', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(30);
    this.waveSubText = this.add.text(W / 2, H / 2 + 10, '', {
      fontFamily: FONT_MONO, fontSize: '22px', color: COL.inkDim,
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(30);

    // ── Pause overlay ─────────────────────────────────────────────
    this.pauseBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000812, 0.72)
      .setDepth(50).setVisible(false);
    this.pauseFrame = this.add.graphics().setDepth(50).setVisible(false);
    this.pauseText = this.add.text(W / 2, H / 2 - 46, 'MISSION PAUSED', {
      fontFamily: FONT_MONO, fontSize: '56px', color: COL.cyanHex,
    }).setOrigin(0.5).setDepth(51).setVisible(false);
    this.pauseSub = this.add.text(W / 2, H / 2 + 40, 'ESC TO RESUME     H FOR CONTROLS', {
      fontFamily: FONT_MONO, fontSize: '26px', color: COL.inkDim,
    }).setOrigin(0.5).setDepth(51).setVisible(false);

    // ── Radar frame (drawn once) ──────────────────────────────────
    this.drawRadarFrame();

    // ── Wave progress bar (top-center, thin, wide) ────────────────
    const wpW = 480;
    this.waveProgressRect = { x: (W - wpW) / 2, y: 148, w: wpW, h: 5 };
    this.waveProgressFrame = this.add.graphics().setDepth(20);
    this.waveProgressFill  = this.add.graphics().setDepth(21);
    this.drawWaveProgress();

    // ── Listen for events from GameScene ──────────────────────────
    this.attachGameEventListeners();
    const game = this.scene.get('Game') as GameScene;
    // Game.create can emit its initial values before the UI has subscribed.
    this.time.delayedCall(0, () => {
      game.events.emit('healthChange', game.player.hp, game.player.maxHp);
      game.events.emit('rapidAmmoChange', game.player.rapidAmmo, game.player.rapidAmmoMax);
      game.events.emit('scoreChange', (this.registry.get('totalScore') as number) ?? 0);
      if (game.surfaceMission) {
        game.events.emit('missionObjective', game.surfaceMission.objective);
        if (game.surfaceMission.phase === 'boss') {
          game.events.emit('waveStart', 4, 3, 1);
          game.events.emit('dronesRemaining', 1);
        }
      }
    });


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
      if (game.currentNode !== 0) this.openControlsOverlay();
    }
  }

  private buildCombatHud(): void {
    const game = this.scene.get('Game') as GameScene;
    const text = (x: number, y: number, value: string, size = 24, color = COL.ink) =>
      this.add.text(x, y, value, { fontFamily: FONT_READOUT, fontSize: `${size}px`, color });

    this.drawPanel(32, 32, 368, 168, '');
    text(56, 48, 'MECH / SYSTEM STATUS', 20, COL.inkDim);
    text(56, 84, 'INTEGRITY', 22);
    this.healthValue = text(376, 80, '', 28, COL.greenHex).setOrigin(1, 0);
    this.healthFill = this.add.graphics().setDepth(1);
    this.drawBarFrame(this.healthRect, 5);
    text(56, 140, 'SPACE / THRUST', 20, COL.inkDim);
    this.fuelValue = text(376, 138, '100%', 22, COL.cyanHex).setOrigin(1, 0);
    this.fuelFill = this.add.graphics().setDepth(1);
    this.drawBarFrame(this.fuelRect, 4);
    this.paintBar(this.fuelFill, this.fuelRect, 1, COL.cyan, 4);

    const mission = LEVEL_CONFIGS[game.currentNode]?.label ?? 'SURFACE OPS';
    text(GAME_W / 2, 32, `OPERATION ${String(game.currentNode + 1).padStart(2, '0')}`, 20, COL.inkDim).setOrigin(0.5, 0);
    text(GAME_W / 2, 62, mission, 34).setOrigin(0.5, 0);
    this.waveCounter = text(GAME_W / 2 - 240, 112, game.currentNode === 0 ? 'FIELD TRAINING' : 'STANDBY', 22, COL.cyanHex);
    this.dronesRemainingText = text(GAME_W / 2 + 240, 112, '', 22, COL.amberHex).setOrigin(1, 0);
    this.scoreCaption = text(1888, 36, 'MISSION SCORE', 20, COL.inkDim).setOrigin(1, 0);
    this.scoreText = text(1888, 64, '0000000', 44).setOrigin(1, 0);
    text(1680, 128, 'H  HELP', 20, COL.inkDim).setOrigin(1, 0)
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleControls());
    text(1888, 128, 'ESC  PAUSE', 20, COL.inkDim).setOrigin(1, 0)
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (!this.controlsOpen && !this.gameOverActive) this.togglePause();
      });

    // A single row of equal cards keeps every weapon's key and state together.
    const card = (index: number, key: string, title: string, color: string) => {
      const x = 32 + index * 292, y = 958;
      this.drawPanel(x, y, 280, 98, '');
      this.add.rectangle(x + 41, y + 25, 58, 28, 0x16303d);
      text(x + 41, y + 25, key, key === 'SHIFT' ? 16 : 20, COL.ink).setOrigin(0.5);
      const label = text(x + 82, y + 13, title, 22, color);
      const state = text(x + 18, y + 47, 'READY', 23, color);
      const rect = { x: x + 18, y: y + 80, w: BAR_W, h: 6 };
      this.drawBarFrame(rect, 4);
      const fill = this.add.graphics();
      this.paintBar(fill, rect, 1, Phaser.Display.Color.HexStringToColor(color).color, 4);
      return { label, state, rect, fill };
    };
    const turret = card(0, 'LMB', 'TURRET', COL.cyanHex);
    this.turretLabel = turret.label; this.turretState = turret.state;
    this.turretRect = turret.rect; this.turretFill = turret.fill;
    const rapid = card(1, 'RMB', 'RAPID FIRE', COL.cyanHex);
    this.ammoLabel = rapid.label; this.ammoValue = rapid.state;
    this.ammoRect = rapid.rect; this.ammoFill = rapid.fill;
    const missile = card(2, 'E', 'MISSILE', COL.amberHex);
    this.missileLabel = missile.label; this.missileState = missile.state;
    this.missileRect = missile.rect; this.missileFill = missile.fill;
    this.missileIcon = this.add.graphics();
    this.missileIconCx = missile.rect.x + missile.rect.w - 12;
    this.missileIconCy = missile.rect.y - 22;
    this.drawMissileIcon(this.missileIcon, this.missileIconCx, this.missileIconCy, COL.amber);
    const repair = card(3, 'Q', 'REPAIR', COL.greenHex);
    this.naniteLabel = repair.label; this.naniteState = repair.state;
    this.naniteRect = repair.rect; this.naniteFill = repair.fill;
    this.repairCue = this.add.graphics();
    this.repairCue.lineStyle(3, COL.green, 1);
    this.repairCue.strokeRect(908, 958, 280, 98);
    this.repairCue.setVisible(false);
    this.repairHint = text(1048, 928, 'Q  RESTORE ARMOR', 24, COL.greenHex).setOrigin(0.5).setVisible(false);
    this.repairHint.setStroke('#02111e', 5);
    const surge = card(4, 'SHIFT', 'SURGE DASH', COL.cyanHex);
    this.surgeState = surge.state.setText('SHIFT TO DASH').setFontSize(21);
    this.surgeRect = surge.rect; this.surgeFill = surge.fill;
    if (game.currentNode === 0) {
      this.drawPanel(32, 224, 480, 190, '');
      text(56, 244, 'CURRENT OBJECTIVE', 18, COL.cyanHex);
      this.objectiveText = text(56, 278, '', 24).setWordWrapWidth(432);
      this.objectiveDetail = text(56, 324, '', 20, COL.inkDim).setWordWrapWidth(432);
      this.objectiveBeacon = text(600, 780, '', 23, COL.cyanHex).setOrigin(0.5).setDepth(20).setStroke('#02111e', 5);
      this.bossReadout = text(GAME_W / 2, 190, '', 23, COL.amberHex).setOrigin(0.5).setDepth(20);
      this.bossHealthFill = this.add.graphics().setDepth(20);
    } else {
      this.objectiveText = undefined; this.objectiveDetail = undefined; this.objectiveBeacon = undefined;
      this.bossReadout = undefined; this.bossHealthFill = undefined;
    }
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────

  /** Tactical panel: dark fill, hair border, bracketed corners, title caption. */
  private drawPanel(x: number, y: number, w: number, h: number, title: string): void {
    const g = this.add.graphics();
    g.fillStyle(COL.panelFill, COL.panelFillA);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, COL.rail, 0.75);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Bracketed corners — thicker cyan accents at 4 corners
    g.lineStyle(2, COL.cyan, 0.5);
    // top-left
    g.lineBetween(x, y + BR, x, y); g.lineBetween(x, y, x + BR, y);
    // top-right
    g.lineBetween(x + w - BR, y, x + w, y); g.lineBetween(x + w, y, x + w, y + BR);
    // bottom-left
    g.lineBetween(x, y + h - BR, x, y + h); g.lineBetween(x, y + h, x + BR, y + h);
    // bottom-right
    g.lineBetween(x + w - BR, y + h, x + w, y + h); g.lineBetween(x + w, y + h - BR, x + w, y + h);

    if (!title) return;
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
    const innerW = r.w - 2;
    const filled = Math.round(innerW * Phaser.Math.Clamp(t, 0, 1));
    if (filled <= 0) return;
    // Preserve real gaps between segments, including partially filled segments.
    const step = innerW / _segments;
    gfx.fillStyle(color, 0.95);
    for (let i = 0; i < _segments; i++) {
      const start = Math.round(i * step);
      const width = Math.min(filled - start, Math.round(step) - 3);
      if (width > 0) gfx.fillRect(r.x + 1 + start, r.y + 1, width, r.h - 2);
    }
  }

  /** Draw the permanent radar bezel + ticks + caption. */
  private drawRadarFrame(): void {
    const g = this.add.graphics().setDepth(4);
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
      }).setOrigin(0.5).setDepth(5);
    };
    card('N', 0, -(R + 28));
    card('S', 0,  (R + 28));
    card('E',  (R + 28), 0);
    card('W', -(R + 28), 0);

    // Caption chip above radar
    const capY = ry - R - 46;
    const capTxt = 'LOCAL SCAN';
    const cap = this.add.text(rx, capY, capTxt, {
      fontFamily: FONT_MONO, fontSize: '20px', color: COL.inkDim,
    }).setOrigin(0.5).setDepth(5);
    // subtle underline
    const g2 = this.add.graphics().setDepth(4);
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

    on('missionObjective', (objective: MissionObjective) => {
      this.objectiveText?.setText(objective.title);
      this.objectiveDetail?.setText(objective.detail);
      if (this.objectiveText && this.objectiveDetail) this.objectiveDetail.y = this.objectiveText.y + this.objectiveText.height + 12;
      this.objectiveTarget = objective.x;
    });
    on('surfaceBossStatus', (hp: number, max: number, hint: string, exposed: boolean) => {
      this.bossReadout?.setText(`WARDEN  /  ${hint}`).setColor(exposed ? COL.amberHex : COL.cyanHex);
      const g = this.bossHealthFill;
      if (g) {
        g.clear().fillStyle(COL.panelFill, 1).fillRect(600, 226, 720, 12);
        g.fillStyle(exposed ? COL.amber : COL.cyan, 1).fillRect(600, 226, 720 * hp / max, 12);
      }
    });
    on('fieldUpgrade', (wave: number) => this.showUpgradeOverlay(wave));
    on('healthChange', (hp: number, maxHp: number) => {
      this.curHp = hp;
      this.curMaxHp = maxHp;
      const ratio = maxHp > 0 ? hp / maxHp : 0;
      const color = ratio > 0.5 ? COL.green : ratio > 0.25 ? COL.amber : COL.red;
      this.paintBar(this.healthFill, this.healthRect, ratio, color, Math.max(1, maxHp));
      this.healthValue.setText(`${Number(hp.toFixed(1))} / ${maxHp}`).setColor(ratio > 0.5 ? COL.greenHex : ratio > 0.25 ? COL.amberHex : COL.redHex);
      if (hp < this.lastHp) this.cameras.main.flash(200, 220, 30, 30, false);
      this.lastHp = hp;
      this.updateRepairAvailability();
    });

    on('playerDamaged', ({ amount, direction, x, y }: { amount: number; direction: -1 | 1; x: number; y: number }) => {
      this.showDamageFeedback(amount, direction, x, y);
    });

    on('missileCooldown', (progress: number) => {
      if (progress === this.missileProgress) return;
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
        this.missileState.setText(`RELOAD ${Math.floor(progress * 100)}%`).setColor(COL.amberHex);
        this.drawMissileIcon(this.missileIcon, this.missileIconCx, this.missileIconCy, COL.amber);
      }
    });

    on('turretCooldown', (progress: number) => {
      if (progress === this.turretProgress) return;
      this.turretProgress = progress;
      if (progress >= 1) {
        this.paintBar(this.turretFill, this.turretRect, 1, COL.cyan, 4);
        this.turretLabel.setColor(COL.cyanHex);
        this.turretState.setText('READY').setColor(COL.cyanHex);
      } else {
        this.paintBar(this.turretFill, this.turretRect, progress, 0xffb347, 4);
        this.turretLabel.setColor(COL.amberHex);
        this.turretState.setText(`RELOAD ${Math.floor(progress * 100)}%`).setColor(COL.amberHex);
      }
    });

    on('jetpackFuel', (fuel: number, max: number) => {
      const ratio = max > 0 ? Phaser.Math.Clamp(fuel / max, 0, 1) : 0;
      this.paintBar(this.fuelFill, this.fuelRect, ratio, ratio > 0.25 ? COL.cyan : COL.amber, 4);
      this.fuelValue.setText(`${Math.round(ratio * 100)}%`);
    });
    on('radioTransmission', (speaker: string, message: string, warning: boolean) => {
      this.showRadioTransmission(speaker, message, warning);
    });

    on('surgeChange', (state: string, progress: number) => {
      this.surgeState.setText(state === 'active' ? 'SURGING' : state === 'ready' ? 'SHIFT TO DASH' : 'RECHARGING');
      this.paintBar(this.surgeFill, this.surgeRect, progress, state === 'active' ? COL.amber : COL.cyan, 4);
    });
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
      this.ammoValue.setText(ammo === 0 ? 'EMPTY · FIND AMMO' : `${String(ammo).padStart(3, '0')} / ${String(max).padStart(3, '0')}`);
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
      const surface = (game as GameScene).currentNode === 0;
      this.waveCounter.setText(this.bossPhaseActive ? 'BOSS PHASE' : `${surface ? 'ENCOUNTER' : 'WAVE'} ${String(wave).padStart(2, '0')}`);

      const W = GAME_W, H = GAME_H;

      // Big announcement
      this.waveText.setText(this.bossPhaseActive ? '// BOSS PHASE //' : `${surface ? 'ENCOUNTER' : 'WAVE'} ${String(wave).padStart(2, '0')}`).setAlpha(1);
      this.waveSubText.setText(this.bossPhaseActive ? (surface ? 'WARDEN INBOUND' : 'NEXUS SIGNATURE DETECTED') : 'ENGAGE HOSTILES').setAlpha(1);
      this.tweens.add({
        targets: [this.waveText, this.waveSubText],
        alpha: 0, duration: surface ? 600 : 2000, delay: surface ? 600 : 1600, ease: 'Power2',
      });

    });

    on('dronesRemaining', (count: number) => {
      if (count > 0) {
        this.dronesRemainingText.setText(`${String(count).padStart(2, '0')} HOSTILES`).setAlpha(1);
      } else {
        this.dronesRemainingText.setText('SECTOR CLEAR').setAlpha(1);
      }
      this.waveLastRemaining = count;
    });

    on('hostileKilled', () => {
      this.waveKilled += 1;
      this.drawWaveProgress();
    });

    on('waveCleared', (wave: number) => {
      if ((game as GameScene).currentNode === 0 || wave >= this.waveTotalCount || this.gameOverActive || this.levelCompleteActive) return;
      this.showUpgradeOverlay(wave);
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
      this.updateRepairAvailability();
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
    if (this.gameOverActive || this.paused || this.controlsOpen || this.upgradeOpen) return;
    const game = this.scene.get('Game') as GameScene;
    if (!game || !game.sys.isActive()) return;
    this.minimap.draw(time, game);
    if (this.objectiveBeacon) {
      const camera = game.cameras.main;
      const rawX = (this.objectiveTarget - camera.worldView.x) * camera.zoom;
      const x = Phaser.Math.Clamp(rawX, 80, GAME_W - 80);
      const y = Phaser.Math.Clamp((780 - camera.worldView.y) * camera.zoom, 420, 840);
      const distance = Math.round(Math.abs(this.objectiveTarget - game.player.x) / 32);
      const arrow = rawX < 80 ? '◀ ' : rawX > GAME_W - 80 ? '▶ ' : '◇ ';
      this.objectiveBeacon.setPosition(x, y).setText(`${arrow}${distance}m`);
    }
  }

  private clearTelegraph(): void {
    if (this.telegraphLabel)     { this.tweens.killTweensOf(this.telegraphLabel);     this.telegraphLabel.destroy();     this.telegraphLabel = null; }
    if (this.telegraphMoveLabel) { this.tweens.killTweensOf(this.telegraphMoveLabel); this.telegraphMoveLabel.destroy(); this.telegraphMoveLabel = null; }
    if (this.telegraphBg)        { this.tweens.killTweensOf(this.telegraphBg);        this.telegraphBg.destroy();        this.telegraphBg = null; }
  }

  shutdown(): void {
    this.clearTelegraph();
    if (this.radioPanel) { this.tweens.killTweensOf(this.radioPanel); this.radioPanel.destroy(); this.radioPanel = null; }
    this.closeUpgradeOverlay(false);
    for (const unsub of this.gameEventUnsubs.splice(0)) unsub();
    for (const unsub of this.keyboardEventUnsubs.splice(0)) unsub();
    this.closeControlsOverlay(false);
    if (this.missileReloadActive) {
      const gs = this.scene.get('Game') as GameScene;
      gs?.audio?.stopLoop('missile-reload');
      this.missileReloadActive = false;
    }
    if (this.nanitePulseTween) { this.nanitePulseTween.stop(); this.nanitePulseTween = null; }
    if (this.repairPulseTween)  { this.repairPulseTween.stop();  this.repairPulseTween  = null; }
  }

  private togglePause(): void {
    if (this.upgradeOpen || this.levelCompleteActive) return;
    this.paused = !this.paused;
    this.updateRepairAvailability();
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
    g.fillStyle(COL.panelFill, 1);
    g.fillRect(W / 2 - 530, H / 2 - 180, 1060, 360);
    g.lineStyle(1, COL.rail, 1);
    g.strokeRect(W / 2 - 530, H / 2 - 180, 1060, 360);
    g.fillStyle(COL.cyan, 1);
    g.fillRect(W / 2 - 530, H / 2 - 180, 6, 360);
  }

  private onNaniteChange(state: string, progress: number): void {
    // Ready is emitted every frame; health changes already refresh availability.
    if (state === 'ready' && this.naniteReady && !this.naniteActive) return;
    const status = repairStatus(this.curHp, this.curMaxHp, state as RepairPhase, progress,
      (this.scene.get('Game') as GameScene).player.naniteCooldownMs);
    if (state === 'active') {
      this.naniteActive = true;
      // Mech-mounted HP bar glows green via PlayerHud's nanite hook
      this.paintBar(this.naniteFill, this.naniteRect, progress, COL.green, 4);
      this.naniteLabel.setColor(COL.greenHex);
      this.naniteState.setText(status.label).setColor(COL.greenHex);
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
      this.naniteState.setText(status.label).setColor(COL.inkDim);
    } else if (state === 'ready') {
      this.naniteActive = false;
      if (this.nanitePulseTween) { this.nanitePulseTween.stop(); this.nanitePulseTween = null; }
      this.naniteFill.setAlpha(1);
      this.paintBar(this.naniteFill, this.naniteRect, 1, COL.green, 4);
      this.naniteLabel.setColor(COL.greenHex);
    }
    this.naniteReady = (state === 'ready');
    this.updateRepairAvailability();
  }

  private updateRepairAvailability(): void {
    if (!this.repairCue) return;
    const status = repairStatus(this.curHp, this.curMaxHp, 'ready', 1, 0);
    const usable = status.usable && this.naniteReady && !this.naniteActive;
    const visible = usable && !this.gameOverActive && !this.levelCompleteActive
      && !this.upgradeOpen && !this.controlsOpen && !this.paused;
    this.repairCue.setVisible(visible);
    this.repairHint.setVisible(visible);
    if (this.naniteReady && !this.naniteActive) {
      this.naniteState.setText(status.label)
        .setColor(status.usable ? COL.greenHex : COL.inkDim);
      this.paintBar(this.naniteFill, this.naniteRect, 1, status.usable ? COL.green : COL.cyanDim, 4);
    }
    if (visible && !this.repairPulseTween) {
      this.repairPulseTween = this.tweens.add({
        targets: this.repairCue, alpha: { from: 0.45, to: 1 },
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else if (!visible && this.repairPulseTween) {
      this.repairPulseTween.stop();
      this.repairPulseTween = null;
      this.repairCue.setAlpha(1);
    }
  }

  private showRadioTransmission(speaker: string, message: string, warning: boolean): void {
    if (this.radioPanel) {
      this.tweens.killTweensOf(this.radioPanel);
      this.radioPanel.destroy();
    }
    const panel = this.add.container(GAME_W / 2, 224).setDepth(25).setAlpha(0);
    this.radioPanel = panel;
    const accent = warning ? COL.amberHex : COL.cyanHex;
    const body = this.add.text(-366, 0, message, {
      fontFamily: FONT_READOUT, fontSize: '24px', color: COL.ink,
      wordWrap: { width: 732 }, lineSpacing: 6,
    });
    const height = Math.max(100, body.height + 60);
    const back = this.add.rectangle(0, height / 2 - 36, 780, height, COL.panelFill, 0.95).setStrokeStyle(1, COL.rail);
    const tag = this.add.text(-366, -29, `${speaker} / INCOMING`, {
      fontFamily: FONT_READOUT, fontSize: '18px', color: accent,
    });
    panel.add([back, tag, body]);
    this.tweens.add({ targets: panel, alpha: 1, duration: 260, hold: 4400, yoyo: true,
      onComplete: () => { if (this.radioPanel === panel) this.radioPanel = null; panel.destroy(); },
    });
  }

  private showDamageFeedback(amount: number, direction: -1 | 1, x: number, y: number): void {
    const edgeX = direction < 0 ? 0 : GAME_W;
    const edge = this.add.graphics().setDepth(58).setScrollFactor(0);
    edge.fillStyle(COL.red, 0.22);
    edge.fillRect(direction < 0 ? 0 : GAME_W - 260, 0, 260, GAME_H);
    edge.lineStyle(4, COL.red, 0.75);
    edge.lineBetween(edgeX, 0, edgeX, GAME_H);
    this.tweens.add({
      targets: edge,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => edge.destroy(),
    });

    const marker = this.add.text(x, y, `-${amount}`, {
      fontFamily: FONT_READOUT, fontSize: '30px', color: COL.redHex,
      stroke: '#1a0005', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(59);
    this.tweens.add({
      targets: marker,
      x: marker.x + direction * 38,
      y: marker.y - 28,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.Out',
      onComplete: () => marker.destroy(),
    });
  }

  private showUpgradeOverlay(wave: number): void {
    if (this.upgradeOpen || this.controlsOpen || this.paused) return;
    const game = this.scene.get('Game') as GameScene;
    if (!game?.player?.active) return;

    this.upgradeOpen = true;
    this.updateRepairAvailability();
    this.scene.pause('Game');

    const W = GAME_W, H = GAME_H;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };

    push(this.add.rectangle(W / 2, H / 2, W, H, 0x000812, 0.72).setDepth(62).setScrollFactor(0));

    const frame = push(this.add.graphics().setDepth(63).setScrollFactor(0)) as Phaser.GameObjects.Graphics;
    const bw = 1450, bh = 560;
    const bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
    frame.fillStyle(0x02111e, 0.92);
    frame.fillRect(bx, by, bw, bh);
    frame.lineStyle(2, COL.rail, 0.9);
    frame.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    frame.lineStyle(3, COL.cyan, 1);
    const cb = 24;
    frame.lineBetween(bx, by + cb, bx, by); frame.lineBetween(bx, by, bx + cb, by);
    frame.lineBetween(bx + bw - cb, by, bx + bw, by); frame.lineBetween(bx + bw, by, bx + bw, by + cb);
    frame.lineBetween(bx, by + bh - cb, bx, by + bh); frame.lineBetween(bx, by + bh, bx + cb, by + bh);
    frame.lineBetween(bx + bw - cb, by + bh, bx + bw, by + bh); frame.lineBetween(bx + bw, by + bh - cb, bx + bw, by + bh);

    push(this.add.text(W / 2, by + 54, game.currentNode === 0 ? 'SURVEY RELAY ONLINE' : `WAVE ${String(wave).padStart(2, '0')} CLEARED`, {
      fontFamily: FONT_MONO, fontSize: '42px', color: COL.cyanHex,
      stroke: '#001a2a', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(64).setScrollFactor(0));
    push(this.add.text(W / 2, by + 96, 'SELECT FIELD UPGRADE', {
      fontFamily: FONT_MONO, fontSize: '22px', color: COL.inkDim,
    }).setOrigin(0.5).setDepth(64).setScrollFactor(0));

    const options: Array<{ id: PlayerUpgradeId; key: string; title: string; body: string; color: string }> = game.currentNode === 0 ? [
      { id: 'capacitor', key: '1', title: 'PULSE CAPACITOR', body: 'TURRET DAMAGE ×2\nSLOWER: 0.65s / SHOT', color: COL.cyanHex },
      { id: 'missile-rack', key: '2', title: 'MISSILE RACK', body: 'MISSILES EVERY 3s\n−50 RAPID AMMO CAP', color: COL.amberHex },
      { id: 'repair-core', key: '3', title: 'REPAIR CORE', body: 'HEAL 2 HP PER USE\nLONGER: 28s RECHARGE', color: COL.greenHex },
    ] : [
      { id: 'armor', key: '1', title: 'ARMOR PLATING', body: '+1 MAX HP\nREPAIR 1 HP', color: COL.greenHex },
      { id: 'ammo',  key: '2', title: 'AMMO FEED',     body: '+35 RAPID CAP\nREFILL RAPID AMMO', color: COL.cyanHex },
      { id: 'fuel',  key: '3', title: 'THRUSTER CELLS', body: '+500 JETPACK FUEL\nFULL FUEL REFILL', color: COL.amberHex },
    ];
    const startX = W / 2 - 440;
    options.forEach((opt, i) => {
      const x = startX + i * 440;
      const y = by + 230;
      const panel = push(this.add.graphics().setDepth(64).setScrollFactor(0)) as Phaser.GameObjects.Graphics;
      panel.fillStyle(0x050f19, 0.95);
      panel.fillRect(x - 200, y - 55, 400, 230);
      panel.lineStyle(1, COL.rail, 0.9);
      panel.strokeRect(x - 199.5, y - 54.5, 399, 229);
      panel.lineStyle(2, i === 0 ? COL.green : i === 1 ? COL.cyan : COL.amber, 0.9);
      panel.lineBetween(x - 200, y - 55, x - 160, y - 55);
      panel.lineBetween(x + 160, y + 175, x + 200, y + 175);

      push(this.add.text(x - 170, y - 20, `[${opt.key}]`, {
        fontFamily: FONT_READOUT, fontSize: '28px', color: opt.color,
      }).setOrigin(0, 0.5).setDepth(65).setScrollFactor(0));
      push(this.add.text(x, y + 42, opt.title, {
        fontFamily: FONT_MONO, fontSize: '28px', color: opt.color,
      }).setOrigin(0.5).setDepth(65).setScrollFactor(0));
      push(this.add.text(x, y + 108, opt.body, {
        fontFamily: FONT_MONO, fontSize: '26px', color: COL.ink,
        align: 'center',
      }).setOrigin(0.5).setDepth(65).setScrollFactor(0));
    });

    const footer = push(this.add.text(W / 2, by + bh - 46, 'CHOOSE A CARD OR PRESS 1 / 2 / 3', {
      fontFamily: FONT_MONO, fontSize: '20px', color: COL.cyanDimHex,
    }).setOrigin(0.5).setDepth(65).setScrollFactor(0));


    const choose = (idx: number): void => {
      if (!this.upgradeOpen) return;
      const opt = options[idx];
      if (!opt) return;
      game.player.applyUpgrade(opt.id);
      game.events.emit('upgradeChosen', opt.id);
      game.audio.play('ui-confirm');
      this.closeUpgradeOverlay(true);
    };
    options.forEach((_, i) => {
      const x = startX + i * 440;
      const hover = push(this.add.rectangle(x, by + 290, 400, 230, COL.cyan, 0).setDepth(65));
      const hit = push(this.add.zone(x, by + 290, 400, 230).setDepth(66).setInteractive({ useHandCursor: true }));
      hit.on('pointerover', () => hover.setFillStyle(COL.cyan, 0.08));
      hit.on('pointerout', () => hover.setFillStyle(COL.cyan, 0));
      hit.on('pointerdown', () => choose(i));
    });
    const keys: Array<[string, () => void]> = [
      ['keydown-ONE', () => choose(0)],
      ['keydown-TWO', () => choose(1)],
      ['keydown-THREE', () => choose(2)],
    ];
    for (const [ev, fn] of keys) {
      this.input.keyboard!.on(ev, fn);
      this.upgradeKeyUnsubs.push(() => this.input.keyboard?.off(ev, fn));
    }

    this.upgradeObjs = objs;
  }

  private closeUpgradeOverlay(resumeGame: boolean): void {
    if (!this.upgradeOpen && this.upgradeObjs.length === 0) return;
    this.upgradeOpen = false;
    for (const unsub of this.upgradeKeyUnsubs.splice(0)) unsub();
    for (const obj of this.upgradeObjs.splice(0)) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    if (resumeGame) this.scene.resume('Game');
    this.updateRepairAvailability();
  }

  private controlsOpen = false;
  private controlsObjs: Phaser.GameObjects.GameObject[] = [];
  private controlsDismissKeys: string[] = [];
  private controlsDismissFn: (() => void) | null = null;

  private toggleControls(): void {
    if (this.gameOverActive || this.levelCompleteActive || this.upgradeOpen) return;
    if (this.controlsOpen) this.closeControlsOverlay();
    else                   this.openControlsOverlay();
  }

  private openControlsOverlay(): void {
    this.controlsOpen = true;
    this.updateRepairAvailability();
    this.scene.pause('Game');

    const W = GAME_W, H = GAME_H;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };

    push(this.add.rectangle(W / 2, H / 2, W, H, 0x000812, 0.94).setDepth(60).setScrollFactor(0));

    const text = (x: number, y: number, value: string, size = 28, color = COL.ink) =>
      push(this.add.text(x, y, value, { fontFamily: FONT_READOUT, fontSize: `${size}px`, color }).setDepth(61));
    const frame = push(this.add.graphics().setDepth(60));
    frame.fillStyle(0x071622, 1);
    frame.fillRect(80, 80, 1760, 920);
    frame.lineStyle(1, 0x244353, 1);
    frame.strokeRect(80, 80, 1760, 920);
    frame.fillStyle(COL.cyan, 1);
    frame.fillRect(80, 80, 6, 920);
    frame.lineStyle(1, 0x244353, 1);
    frame.lineBetween(652, 120, 652, 946);
    text(128, 126, 'LUNAR DEFENSE DIVISION', 22, COL.cyanHex);
    text(122, 164, 'MOONSEC', 94);
    text(128, 278, 'PILOT FIELD GUIDE', 24, COL.inkDim);

    // Use the real pixel sprite as the visual anchor for the briefing.
    const game = this.scene.get('Game') as GameScene;
    const texture = game.player.texture.key;
    frame.lineStyle(1, 0x244353, 0.65);
    frame.strokeCircle(366, 562, 168);
    frame.strokeCircle(366, 562, 198);
    frame.lineBetween(148, 562, 584, 562);
    frame.lineBetween(366, 344, 366, 780);
    push(this.add.sprite(366, 692, texture, game.player.frame.name).setOrigin(0.5, 1).setScale(5).setDepth(61));
    text(128, 794, 'HOLD THE LINE.', 36);
    text(128, 850, 'Clear each wave. Upgrade your mech.\nKeep your armor and fuel in view.', 22, COL.inkDim).setLineSpacing(12);
    text(716, 128, 'KNOW YOUR MECH', 44);
    text(716, 192, 'Move, aim and manage your systems to survive.', 24, COL.inkDim);

    const row = (x: number, y: number, key: string, title: string, description: string, accent = COL.cyanHex) => {
      const keyWidth = key.length > 5 ? 190 : 94;
      push(this.add.rectangle(x + keyWidth / 2, y + 19, keyWidth, 40, 0x17313f).setDepth(61));
      text(x + keyWidth / 2, y + 19, key, 23, accent).setOrigin(0.5);
      text(x, y + 60, title, 29);
      text(x, y + 104, description, 22, COL.inkDim).setLineSpacing(8);
    };
    row(716, 274, 'A/D + SHIFT', 'Move & surge', 'A / D to move. Shift to dash.\nDouble-tap also triggers a dash.');
    row(1288, 274, 'SPACE', 'Jump & fly', 'Hold in the air to use thrust.\nLand to recharge your fuel.');
    row(716, 464, 'LMB / RMB', 'Aim & fire', 'Aim with the mouse. Left: turret.\nRight: rapid fire. Watch your ammo.');
    row(1288, 464, 'E', 'Homing missile', 'Tracks a nearby target.\nWait for READY to fire again.', COL.amberHex);
    row(716, 654, 'Q', 'Nanite repair', 'Restores damaged armor over time.\nThe Q card lights up when usable.', COL.greenHex);
    row(1288, 654, 'F / H / ESC', 'Relay & mission controls', 'Hold F at a cleared relay.\nH: this guide. Escape: pause.');

    const button = push(this.add.rectangle(1508, 919, 548, 70, COL.cyan).setDepth(61).setInteractive({ useHandCursor: true }));
    text(1508, 919, this.paused ? 'RETURN TO PAUSE  →' : 'ENTER  /  RESUME MISSION  →', 27, '#071622').setOrigin(0.5);
    button.on('pointerover', () => button.setFillStyle(0xb4f2ff));
    button.on('pointerout', () => button.setFillStyle(COL.cyan));
    button.on('pointerdown', () => this.closeControlsOverlay());
    text(716, 909, 'SYSTEMS ONLINE', 22, COL.greenHex);
    text(1800, 1040, `ALPHA / ${__APP_VERSION__}`, 18, COL.inkDim).setOrigin(1, 0.5);

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
    if (resumeGame && !this.paused) this.scene.resume('Game');
    this.updateRepairAvailability();
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
    this.updateRepairAvailability();

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
