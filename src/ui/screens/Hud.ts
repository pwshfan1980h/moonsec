import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../constants';
import type { IconName } from '../icons';
import { DEPTH, tc, type Role } from '../theme';
import { pad } from '../kit/logic';
import { IconButton, Keycap, SegBar, TickRing, icon, label, panel, setLabel, setPanelLook, type Label } from '../kit/widgets';
import type { PanelLook } from '../kit/uiTextures';

/** One ability in the dock: big icon, tick-ring cooldown, key-cap, optional number. */
class AbilityCard {
  readonly bg: Phaser.GameObjects.NineSlice;
  readonly glyph: Phaser.GameObjects.Image;
  readonly ring: TickRing;
  readonly cap: Keycap;
  readonly value: Label;
  private look: PanelLook = 'panel';

  constructor(scene: Phaser.Scene, readonly x: number, readonly y: number, name: IconName, key: string) {
    const W = AbilityCard.W, H = AbilityCard.H;
    this.bg = panel(scene, x, y, W, H, 'panel').setDepth(DEPTH.hud);
    const cx = x + W / 2, cy = y + 36;
    this.ring = new TickRing(scene, cx, cy, 28, 16, 4);
    this.ring.g.setDepth(DEPTH.hud + 1);
    this.glyph = icon(scene, cx, cy, name, 3, 'accent').setDepth(DEPTH.hud + 1);
    this.cap = new Keycap(scene, 0, 0, key, 'inkDim');
    this.cap.setPosition(x + 6 + this.cap.capW / 2, y + H - 16).setDepth(DEPTH.hud + 2);
    this.value = label(scene, x + W - 6, y + H - 16, '', 'small', 'ink').setOrigin(1, 0.5).setDepth(DEPTH.hud + 2);
  }

  static readonly W = 84;
  static readonly H = 96;

  /** Everything the card draws. */
  get parts(): { setVisible(v: boolean): unknown }[] {
    return [this.bg, this.glyph, this.ring.g, this.cap, this.value];
  }

  set(progress: number, role: Role, opts: { icon?: Role; value?: string; valueRole?: Role; look?: PanelLook; ringOff?: Role } = {}): void {
    this.ring.set(progress, role, opts.ringOff ?? 'edgeDim');
    this.glyph.setTint(tc(opts.icon ?? role));
    setLabel(this.value, opts.value ?? '', opts.valueRole ?? role);
    const look = opts.look ?? 'panel';
    if (look !== this.look) { this.look = look; setPanelLook(this.bg, look); }
  }
}

export interface HudOptions {
  surface: boolean;
  onHelp: () => void;
  onPause: () => void;
}

/**
 * The in-mission HUD, icons first:
 *  - top-left: armor + fuel bars (armor number, bar blinks hostile at ≤10)
 *  - top-centre: wave glyph + wave count, hostile glyph + count, segmented wave progress
 *  - top-right: score, help + pause buttons
 *  - bottom: ability dock (turret, gatling, missile, repair, surge)
 *  - surface ops: objective chip + distance beacon, Warden bar
 */
export class CombatHud {
  private armorBar: SegBar;
  private armorValue: Label;
  private armorIcon: Phaser.GameObjects.Image;
  private fuelBar: SegBar;
  private fuelIcon: Phaser.GameObjects.Image;
  private waveLabel: Label;
  private waveIcon: Phaser.GameObjects.Image;
  private hostileLabel: Label;
  private hostileIcon: Phaser.GameObjects.Image;
  private waveBar: SegBar;
  private scoreLabel: Label;
  readonly turret: AbilityCard;
  readonly gatling: AbilityCard;
  readonly missile: AbilityCard;
  readonly repair: AbilityCard;
  readonly surge: AbilityCard;
  private objective?: { chip: Phaser.GameObjects.NineSlice; text: Label; beaconIcon: Phaser.GameObjects.Image; arrow: Phaser.GameObjects.Image; dist: Label; targetX: number };
  private boss?: { bar: SegBar; icon: Phaser.GameObjects.Image; core: Phaser.GameObjects.Image };
  private relay?: TickRing;
  /** Screen rect of the ability dock; it fades when the mech walks behind it. */
  private readonly dock: Phaser.Geom.Rectangle;
  private dockGhost = false;
  private visible = true;
  private readonly all: { setVisible(v: boolean): unknown }[] = [];

  constructor(private readonly scene: Phaser.Scene, opts: HudOptions) {
    const D = DEPTH.hud;
    const keep = <T extends { setVisible(v: boolean): unknown }>(o: T): T => { this.all.push(o); return o; };

    // ── status ───────────────────────────────────────────────────────────
    keep(panel(scene, 32, 32, 392, 104, 'panel').setDepth(D));
    this.armorIcon = keep(icon(scene, 62, 62, 'armor', 2, 'repair').setDepth(D + 1));
    this.armorBar = keep(new SegBar(scene, 86, 52, 236, 20, 5, true).setDepth(D + 1));
    this.armorValue = keep(label(scene, 404, 62, '100', 'body', 'repair').setOrigin(1, 0.5).setDepth(D + 1));
    this.fuelIcon = keep(icon(scene, 62, 106, 'fuel', 2, 'accent').setDepth(D + 1));
    this.fuelBar = keep(new SegBar(scene, 86, 98, 318, 16, 4).setDepth(D + 1));
    this.fuelBar.set(1, 'accent');

    // ── wave / hostiles ──────────────────────────────────────────────────
    const cx = GAME_W / 2;
    this.waveIcon = keep(icon(scene, cx - 236, 52, opts.surface ? 'target' : 'wave', 2, 'accent').setDepth(D + 1));
    this.waveLabel = keep(label(scene, cx - 216, 52, '--', 'body', 'accent').setOrigin(0, 0.5).setDepth(D + 1));
    this.hostileLabel = keep(label(scene, cx + 250, 52, '00', 'body', 'warn').setOrigin(1, 0.5).setDepth(D + 1));
    this.hostileIcon = keep(icon(scene, cx + 250 - this.hostileLabel.width - 20, 52, 'hostile', 2, 'warn').setDepth(D + 1));
    this.waveBar = keep(new SegBar(scene, cx - 250, 76, 500, 12, 4).setDepth(D + 1));
    this.waveBar.set(0, 'accent');

    // ── score + system buttons ───────────────────────────────────────────
    this.scoreLabel = keep(label(scene, GAME_W - 32, 52, '0000000', 'body', 'ink').setOrigin(1, 0.5).setDepth(D + 1));
    keep(icon(scene, GAME_W - 32 - this.scoreLabel.width - 20, 52, 'score', 2, 'warn').setDepth(D + 1));
    const help = keep(new IconButton(scene, GAME_W - 32 - 56 - 12 - 56, 76, { icon: 'help', iconScale: 2, w: 56, h: 48, key: 'H', tip: 'CONTROLS', onClick: opts.onHelp }).setDepth(D + 2));
    const pause = keep(new IconButton(scene, GAME_W - 32 - 56, 76, { icon: 'pause', iconScale: 2, w: 56, h: 48, key: 'ESC', tip: 'PAUSE', onClick: opts.onPause }).setDepth(D + 2));
    void help; void pause;

    // ── ability dock (compact, bottom-left corner) ───────────────────────
    const gap = 8, n = 5, W = AbilityCard.W;
    const x0 = 32;
    const y0 = GAME_H - 24 - AbilityCard.H;
    this.dock = new Phaser.Geom.Rectangle(x0, y0, n * W + (n - 1) * gap, AbilityCard.H);
    const card = (i: number, name: IconName, key: string) => new AbilityCard(scene, x0 + i * (W + gap), y0, name, key);
    this.turret = card(0, 'turret', 'LMB');
    this.gatling = card(1, 'gatling', 'RMB');
    this.missile = card(2, 'missile', 'E');
    this.repair = card(3, 'repair', 'Q');
    this.surge = card(4, 'surge', 'SHIFT');
    for (const c of [this.turret, this.gatling, this.missile, this.repair, this.surge]) {
      for (const o of c.parts) keep(o);
    }
    this.turret.set(1, 'accent');
    this.missile.set(1, 'accent');
    this.surge.set(1, 'accent');

    if (opts.surface) {
      const chip = panel(scene, 32, 148, 392, 40, 'panel').setDepth(D);
      icon(scene, 56, 168, 'target', 2, 'accent').setDepth(D + 1);
      const text = label(scene, 80, 168, '', 'small', 'ink').setOrigin(0, 0.5).setDepth(D + 1);
      const beaconIcon = icon(scene, 0, 0, 'target', 2, 'accent').setDepth(DEPTH.beacon);
      const arrow = icon(scene, 0, 0, 'arrowR', 2, 'accent').setDepth(DEPTH.beacon);
      const dist = label(scene, 0, 0, '', 'small', 'accent').setOrigin(0.5, 0).setDepth(DEPTH.beacon);
      this.objective = { chip, text, beaconIcon, arrow, dist, targetX: 650 };
      this.relay = new TickRing(scene, 0, 0, 22, 12, 4);
      this.relay.g.setDepth(DEPTH.beacon).setVisible(false);
    }
  }

  setArmor(hp: number, maxHp: number, shown: number, stage: 'healthy' | 'light' | 'sparks' | 'critical'): void {
    const role: Role = stage === 'healthy' ? 'repair' : stage === 'light' ? 'warn' : 'danger';
    this.armorBar.segments = Math.max(1, Math.round(maxHp / 20));
    this.armorBar.set(maxHp > 0 ? hp / maxHp : 0, role, stage === 'critical');
    setLabel(this.armorValue, String(shown), role);
    this.armorIcon.setTint(tc(role));
  }

  setFuel(ratio: number): void {
    const role: Role = ratio > 0.25 ? 'accent' : 'warn';
    this.fuelBar.set(ratio, role);
    this.fuelIcon.setTint(tc(role));
  }

  setWave(wave: number, total: number, boss: boolean): void {
    this.waveBar.segments = total + 1;
    setLabel(this.waveLabel, boss ? 'BOSS' : `${pad(wave, 2)}/${pad(total, 2)}`, boss ? 'danger' : 'accent');
    this.waveIcon.setFrame(boss ? 'boss' : this.objective ? 'target' : 'wave').setTint(tc(boss ? 'danger' : 'accent'));
  }

  setWaveProgress(done: number, total: number, current: number, boss: boolean): void {
    const segs = total + 1;
    this.waveBar.set(boss ? 1 : (Math.max(0, current - 1) + done) / segs, boss ? 'danger' : 'accent');
  }

  setHostiles(n: number): void {
    setLabel(this.hostileLabel, n > 0 ? pad(n, 2) : '00', n > 0 ? 'warn' : 'repair');
    this.hostileIcon.setX(this.hostileLabel.x - this.hostileLabel.width - 20).setFrame(n > 0 ? 'hostile' : 'check').setTint(tc(n > 0 ? 'warn' : 'repair'));
  }

  setScore(n: number): void { setLabel(this.scoreLabel, pad(n, 7)); }

  setObjective(title: string, x: number): void {
    if (!this.objective) return;
    setLabel(this.objective.text, title.length > 24 ? title.slice(0, 23) + '.' : title);
    this.objective.targetX = x;
  }

  /** Relay uplink progress (hold F): a tick ring around the beacon. */
  setRelay(progress: number, holding: boolean): void {
    if (!this.relay) return;
    this.relay.g.setVisible(progress > 0 || holding);
    this.relay.set(progress, 'repair');
  }

  setBoss(hp: number, max: number, exposed: boolean): void {
    if (!this.boss) {
      const bar = new SegBar(this.scene, GAME_W / 2 - 360, 112, 720, 14, 8, true).setDepth(DEPTH.beacon);
      const ic = icon(this.scene, GAME_W / 2 - 384, 119, 'boss', 2, 'danger').setDepth(DEPTH.beacon);
      const core = icon(this.scene, GAME_W / 2 + 384, 119, 'target', 2, 'warn').setDepth(DEPTH.beacon);
      this.boss = { bar, icon: ic, core };
    }
    this.boss.bar.set(max > 0 ? hp / max : 0, exposed ? 'warn' : 'danger', exposed);
    this.boss.core.setVisible(exposed);
  }

  /** Per-frame: bar ghosts/blinks and the objective beacon. */
  tick(time: number, dt: number, cam: Phaser.Cameras.Scene2D.Camera, playerX: number, playerY: number): void {
    this.fadeDock((playerX - cam.worldView.x) * cam.zoom, (playerY - cam.worldView.y) * cam.zoom);
    this.armorBar.tick(time, dt);
    this.fuelBar.tick(time, dt);
    this.boss?.bar.tick(time, dt);
    const o = this.objective;
    if (!o) return;
    const rawX = (o.targetX - cam.worldView.x) * cam.zoom;
    const x = Math.round(Phaser.Math.Clamp(rawX, 80, GAME_W - 80) / 2) * 2;
    const y = Math.round(Phaser.Math.Clamp((780 - cam.worldView.y) * cam.zoom, 420, 840) / 2) * 2;
    const off = rawX < 80 ? -1 : rawX > GAME_W - 80 ? 1 : 0;
    o.beaconIcon.setPosition(x, y);
    o.arrow.setVisible(off !== 0).setFrame(off < 0 ? 'arrowL' : 'arrowR').setPosition(x + off * 28, y);
    setLabel(o.dist, `${Math.round(Math.abs(o.targetX - playerX) / 32)}M`);
    o.dist.setPosition(x, y + 20);
    this.relay?.g.setPosition(x - this.relay.cx, y - this.relay.cy);
  }

  /**
   * Ghost the dock while the mech (feet at sx, sy; ~120px tall on screen) is behind it: the card
   * panels drop out and only icons, rings and key-caps stay. (The UI camera uses binary alpha,
   * so a translucent fade would just vanish.)
   */
  private fadeDock(sx: number, sy: number): void {
    const behind = Phaser.Geom.Intersects.RectangleToRectangle(this.dock, new Phaser.Geom.Rectangle(sx - 40, sy - 120, 80, 120));
    if (behind === this.dockGhost || !this.visible) return;
    this.dockGhost = behind;
    for (const c of [this.turret, this.gatling, this.missile, this.repair, this.surge]) c.bg.setVisible(!behind);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.dockGhost = false;
    for (const o of this.all) o.setVisible(v);
  }
}
