import Phaser from 'phaser';
import { repairStatus, type RepairPhase } from '../ui/repairStatus';
import { MinimapRenderer } from '../ui/MinimapRenderer';
import type { MissionObjective } from '../systems/SurfaceMission';
import type { GameScene } from './GameScene';
import type { PlayerUpgradeId } from '../entities/Player';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { devParams } from '../dev/devParams';
import { GAME_W, GAME_H } from '../constants';
import { installPipeline, graphics, setGraphics, type CameraPipeline } from '../render/RenderPipeline';
import { nextPreset, saveGraphicsSettings, toggleView, type GraphicsSettings } from '../render/GraphicsSettings';
import { damageStage, displayArmor } from '../balance/armor';
import { saveMuted } from '../systems/audioPrefs';
import { pad } from '../ui/kit/logic';
import { CombatHud } from '../ui/screens/Hud';
import { PilotGuide } from '../ui/screens/Guide';
import {
  PauseMenu, RadioPanel, ResultScreen, Telegraph, UpgradePicker, announce, callout, damageFlash,
  type UpgradeCard,
} from '../ui/screens/overlays';
import { drawRadarBezel } from '../ui/radarBezel';

const UPGRADES: Record<PlayerUpgradeId, UpgradeCard> = {
  'capacitor': { id: 'capacitor', icon: 'turret', title: 'CAPACITOR', role: 'accent', rows: [
    { icon: 'turret', text: 'DMG ×2', up: true }, { icon: 'turret', text: '0.65S', up: false }] },
  'missile-rack': { id: 'missile-rack', icon: 'missile', title: 'MISSILE RACK', role: 'warn', rows: [
    { icon: 'missile', text: '3S', up: true }, { icon: 'ammo', text: '-50', up: false }] },
  'repair-core': { id: 'repair-core', icon: 'repair', title: 'REPAIR CORE', role: 'repair', rows: [
    { icon: 'repair', text: '+40', up: true }, { icon: 'repair', text: '28S', up: false }] },
  'armor': { id: 'armor', icon: 'armor', title: 'PLATING', role: 'repair', rows: [
    { icon: 'armor', text: '+20 MAX', up: true }, { icon: 'repair', text: '+20', up: true }] },
  'ammo': { id: 'ammo', icon: 'ammo', title: 'AMMO FEED', role: 'accent', rows: [
    { icon: 'gatling', text: '+35', up: true }, { icon: 'ammo', text: 'REFILL', up: true }] },
  'fuel': { id: 'fuel', icon: 'fuel', title: 'JET CELLS', role: 'warn', rows: [
    { icon: 'fuel', text: '+500', up: true }, { icon: 'fuel', text: 'REFILL', up: true }] },
};

/**
 * Screen-space UI over the Game scene: HUD, radar, callouts and every modal screen.
 * Screens live in src/ui/screens; this scene wires Game events to them and owns
 * pause/modal state.
 */
export class UIScene extends Phaser.Scene {
  private hud!: CombatHud;
  private radio!: RadioPanel;
  private minimap!: MinimapRenderer;
  private uiPipeline?: CameraPipeline;

  private pauseMenu?: PauseMenu;
  private guide?: PilotGuide;
  private upgrade?: UpgradePicker;
  private result?: ResultScreen;
  private telegraph?: Telegraph;

  private paused = false;
  private gameOverActive = false;
  private levelCompleteActive = false;

  private currentWave = 0;
  private waveTotal = 5;
  private waveDrones = 0;
  private waveKilled = 0;
  private bossPhase = false;
  private kills = 0;
  private currentScore = 0;
  private lastHp = 0;
  private curHp = 0;
  private curMaxHp = 1;

  private naniteState: RepairPhase = 'ready';
  private naniteProgress = 1;
  private missileProgress = 1;
  private missileReloadActive = false;

  private gameEventUnsubs: Array<() => void> = [];
  private keyUnsubs: Array<() => void> = [];

  constructor() {
    super({ key: 'UI', active: false });
  }

  private get game_(): GameScene { return this.scene.get('Game') as GameScene; }
  private get modalOpen(): boolean { return !!(this.guide || this.upgrade || this.result || this.paused); }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.gameEventUnsubs = [];
    this.keyUnsubs = [];
    Object.assign(this, {
      paused: false, gameOverActive: false, levelCompleteActive: false, currentWave: 0, waveTotal: 5,
      waveDrones: 0, waveKilled: 0, bossPhase: false, kills: 0, currentScore: 0, lastHp: 0, curHp: 0,
      curMaxHp: 1, naniteState: 'ready', naniteProgress: 1, missileProgress: 1, missileReloadActive: false,
    });
    this.pauseMenu = this.guide = this.upgrade = this.result = this.telegraph = undefined;

    const game = this.game_;
    this.uiPipeline = installPipeline(this, this.cameras.main, 'ui');
    this.hud = new CombatHud(this, {
      surface: game.currentNode === 0,
      onHelp: () => this.toggleGuide(),
      onPause: () => { if (!this.guide && !this.gameOverActive) this.togglePause(); },
    });
    this.radio = new RadioPanel(this);
    drawRadarBezel(this);
    this.minimap = new MinimapRenderer(this);

    this.attachGameEvents();
    this.bindKeys();

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

    const cfg = LEVEL_CONFIGS[game.currentNode];
    this.time.delayedCall(300, () => announce(this, 'target', `OP ${pad(game.currentNode + 1, 2)} ${cfg?.label ?? ''}`, 'ink', 1600));

    if (this.registry.get('firstBoot') === true) {
      this.registry.set('firstBoot', false);
      if (game.currentNode !== 0 && !devParams().noGuide) this.openGuide();
    }
    this.openDevScreen(devParams().ui);
  }

  // ── keys ───────────────────────────────────────────────────────────────────
  private bindKeys(): void {
    const kb = this.input.keyboard!;
    const on = (ev: string, fn: () => void) => { kb.on(ev, fn); this.keyUnsubs.push(() => kb.off(ev, fn)); };
    on('keydown-ESC', () => {
      if (this.gameOverActive || this.levelCompleteActive) return;
      if (this.guide) { this.closeGuide(); return; }
      if (this.upgrade) return;
      this.togglePause();
    });
    on('keydown-H', () => this.toggleGuide());
    on('keydown-R', () => { if (this.gameOverActive) this.restart(); });
    on('keydown-G', () => { if (this.paused && !this.guide) this.changeGraphics(nextPreset); });
    on('keydown-V', () => { if (this.paused && !this.guide) this.changeGraphics(toggleView); });
    on('keydown-M', () => { if (this.paused && !this.guide) this.toggleAudio(); });
  }

  private changeGraphics(next: (s: GraphicsSettings) => GraphicsSettings): void {
    const s = next(graphics());
    setGraphics(s);
    saveGraphicsSettings(s);
    this.uiPipeline?.apply(s);
    this.game.events.emit('graphicsChanged', s);
    this.pauseMenu?.refresh();
  }

  private toggleAudio(): void {
    this.sound.mute = !this.sound.mute;
    saveMuted(this.sound.mute);
    this.pauseMenu?.refresh();
  }

  // ── game events ────────────────────────────────────────────────────────────
  private attachGameEvents(): void {
    const game = this.game_;
    const on = <T extends unknown[]>(ev: string, fn: (...a: T) => void): void => {
      const handler = (...a: T) => { if (this.sys.isActive()) fn(...a); };
      game.events.on(ev, handler);
      this.gameEventUnsubs.push(() => game.events.off(ev, handler));
    };

    on('missionObjective', (o: MissionObjective) => this.hud.setObjective(o.title, o.x));
    on('relayProgress', (p: number, holding: boolean) => this.hud.setRelay(p, holding));
    on('surfaceBossStatus', (hp: number, max: number, _hint: string, exposed: boolean) => this.hud.setBoss(hp, max, exposed));
    on('fieldUpgrade', (wave: number) => this.showUpgrade(wave));

    on('healthChange', (hp: number, maxHp: number) => {
      this.curHp = hp; this.curMaxHp = maxHp;
      this.hud.setArmor(hp, maxHp, displayArmor(hp), damageStage(hp));
      if (hp < this.lastHp) this.cameras.main.flash(120, 138, 26, 60, false);
      this.lastHp = hp;
      this.refreshRepair();
    });
    on('playerDamaged', ({ amount, direction, x, y }: { amount: number; direction: -1 | 1; x: number; y: number }) => damageFlash(this, amount, direction, x, y));

    on('missileCooldown', (p: number) => {
      if (p === this.missileProgress) return;
      const prev = this.missileProgress;
      this.missileProgress = p;
      if (prev >= 1 && p < 1 && !this.missileReloadActive) { this.missileReloadActive = true; game.audio?.startLoop('missile-reload'); }
      if (prev < 1 && p >= 1 && this.missileReloadActive) { this.missileReloadActive = false; game.audio?.stopLoop('missile-reload'); game.audio?.playMissileReady(); }
      this.hud.missile.set(p, p >= 1 ? 'accent' : 'warn');
    });
    on('turretCooldown', (p: number) => this.hud.turret.set(p, p >= 1 ? 'accent' : 'warn'));
    on('jetpackFuel', (fuel: number, max: number) => this.hud.setFuel(max > 0 ? Phaser.Math.Clamp(fuel / max, 0, 1) : 0));
    on('rapidAmmoChange', (ammo: number, max: number) => {
      const t = max > 0 ? ammo / max : 0;
      const role = t > 0.4 ? 'accent' : t > 0.2 ? 'warn' : 'danger';
      this.hud.gatling.set(t, role, { value: pad(ammo, 3), look: ammo === 0 ? 'alert' : 'panel' });
    });
    on('surgeChange', (state: string, p: number) => this.hud.surge.set(p, state === 'active' ? 'warn' : p >= 1 ? 'accent' : 'inkDim'));
    on('naniteChange', (state: RepairPhase, p: number) => {
      if (state === this.naniteState && state === 'ready') return;
      this.naniteState = state; this.naniteProgress = p;
      this.refreshRepair();
    });
    on('radioTransmission', (speaker: string, message: string, warning: boolean) => this.radio.show(speaker, message, warning));

    on('scoreChange', (score: number) => { this.currentScore = score; this.hud.setScore(score); });
    on('waveStart', (wave: number, totalWaves?: number, totalDrones?: number) => {
      this.currentWave = wave;
      if (typeof totalWaves === 'number' && totalWaves > 0) this.waveTotal = totalWaves;
      this.bossPhase = wave > this.waveTotal;
      this.waveDrones = typeof totalDrones === 'number' && totalDrones > 0 ? totalDrones : 0;
      this.waveKilled = 0;
      this.hud.setWave(wave, this.waveTotal, this.bossPhase);
      this.refreshWaveBar();
      if (this.bossPhase) announce(this, 'boss', 'BOSS', 'danger', 1600);
      else announce(this, game.currentNode === 0 ? 'target' : 'wave', pad(wave, 2), 'accent', game.currentNode === 0 ? 600 : 1400);
    });
    on('dronesRemaining', (count: number) => this.hud.setHostiles(count));
    on('hostileKilled', () => { this.waveKilled++; this.kills++; this.refreshWaveBar(); });
    on('waveCleared', (wave: number) => {
      if (game.currentNode === 0 || wave >= this.waveTotal || this.gameOverActive || this.levelCompleteActive) return;
      this.showUpgrade(wave);
    });
    on('killStreak', (count: number, bonus: number) => callout(this, GAME_W / 2, GAME_H / 2 - 120, 'star', `×${count} +${bonus}`, 'warn'));
    on('gameOver', () => this.showGameOver());
    on('bossKilled', () => this.clearTelegraph());
    on('levelComplete', () => this.showLevelComplete());
    on('bossTelegraph', ({ side, duration }: { side: 'left' | 'right'; duration: number }) => {
      this.clearTelegraph();
      this.telegraph = new Telegraph(this, side);
      this.time.delayedCall(duration, () => this.clearTelegraph());
    });
    on('bossTelegraphCancel', () => this.clearTelegraph());
    on('bossBlastFired', () => { this.clearTelegraph(); this.cameras.main.flash(250, 255, 179, 71, false); });
  }

  private refreshWaveBar(): void {
    const done = this.waveDrones > 0 ? Phaser.Math.Clamp(this.waveKilled / this.waveDrones, 0, 1) : 0;
    this.hud.setWaveProgress(done, this.waveTotal, this.currentWave, this.bossPhase);
  }

  private refreshRepair(): void {
    const game = this.game_;
    const s = repairStatus(this.curHp, this.curMaxHp, this.naniteState, this.naniteProgress, game.player?.naniteCooldownMs ?? 0);
    const cue = this.naniteState === 'ready' && s.usable && !this.modalOpen && !this.gameOverActive && !this.levelCompleteActive;
    if (this.naniteState === 'active') this.hud.repair.set(this.naniteProgress, 'repair', { look: 'repair' });
    else if (this.naniteState === 'cooldown') this.hud.repair.set(this.naniteProgress, 'inkDim', { icon: 'inkFaint', value: `${Math.ceil((1 - this.naniteProgress) * (game.player?.naniteCooldownMs ?? 0) / 1000)}S`, valueRole: 'inkDim' });
    else this.hud.repair.set(1, s.usable ? 'repair' : 'repairDim', { icon: s.usable ? 'repair' : 'inkFaint', look: cue ? 'repair' : 'panel' });
  }

  update(time: number, delta: number): void {
    this.guide?.tick(delta);
    if (this.gameOverActive || this.modalOpen) return;
    const game = this.game_;
    if (!game || !game.sys.isActive()) return;
    this.minimap.draw(time, game);
    this.hud.tick(time, delta / 1000, game.cameras.main, game.player.x);
    if (this.naniteState === 'cooldown') this.refreshRepair();
  }

  // ── pause ──────────────────────────────────────────────────────────────────
  private togglePause(): void {
    if (this.upgrade || this.levelCompleteActive || this.gameOverActive) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.scene.pause('Game');
      this.openPauseMenu();
    } else {
      this.pauseMenu?.destroy(); this.pauseMenu = undefined;
      this.scene.resume('Game');
    }
    this.refreshRepair();
  }

  private openPauseMenu(): void {
    this.pauseMenu?.destroy();
    this.pauseMenu = new PauseMenu(this, {
      resume: () => this.togglePause(),
      controls: () => this.openGuide(),
      cyclePreset: () => this.changeGraphics(nextPreset),
      toggleView: () => this.changeGraphics(toggleView),
      toggleAudio: () => this.toggleAudio(),
      exitToMap: () => this.exitToMap(),
      state: () => ({ preset: graphics().preset.toUpperCase(), view: graphics().view.toUpperCase(), muted: this.sound.mute }),
    });
  }

  private exitToMap(): void {
    const gs = this.game_;
    this.game.sound.stopAll();
    gs.scene.stop('UI');
    gs.scene.start('Overworld', { currentNode: gs.currentNode, completedNodes: gs.completedNodes ?? [], totalScore: (this.registry.get('totalScore') as number) ?? 0 });
  }

  // ── guide ──────────────────────────────────────────────────────────────────
  private toggleGuide(): void {
    if (this.gameOverActive || this.levelCompleteActive || this.upgrade) return;
    if (this.guide) this.closeGuide(); else this.openGuide();
  }

  private openGuide(): void {
    if (this.guide) return;
    const fromPause = this.paused;
    this.pauseMenu?.destroy(); this.pauseMenu = undefined;
    this.scene.pause('Game');
    this.hud.setVisible(false);
    this.guide = new PilotGuide(this, fromPause, () => this.closeGuide());
    this.refreshRepair();
  }

  private closeGuide(resume = true): void {
    if (!this.guide) return;
    this.guide.destroy();
    this.guide = undefined;
    this.hud.setVisible(true);
    if (this.paused) this.openPauseMenu();
    else if (resume) this.scene.resume('Game');
    this.refreshRepair();
  }

  // ── upgrades ───────────────────────────────────────────────────────────────
  private showUpgrade(wave: number): void {
    if (this.upgrade || this.guide || this.paused) return;
    const game = this.game_;
    if (!game?.player?.active) return;
    this.scene.pause('Game');
    const ids: PlayerUpgradeId[] = game.currentNode === 0 ? ['capacitor', 'missile-rack', 'repair-core'] : ['armor', 'ammo', 'fuel'];
    const header = game.currentNode === 0 ? { icon: 'relay' as const, text: 'RELAY ONLINE' } : { icon: 'check' as const, text: `WAVE ${pad(wave, 2)}` };
    this.upgrade = new UpgradePicker(this, header, ids.map((id) => UPGRADES[id]), (i) => {
      const id = ids[i];
      if (!id || !this.upgrade) return;
      game.player.applyUpgrade(id);
      game.events.emit('upgradeChosen', id);
      game.audio.play('ui-confirm');
      this.upgrade.destroy();
      this.upgrade = undefined;
      this.scene.resume('Game');
      this.refreshRepair();
    });
    this.refreshRepair();
  }

  // ── results ────────────────────────────────────────────────────────────────
  private restart(): void {
    const gs = this.scene.get('Game');
    gs.scene.restart();
    this.scene.restart();
  }

  private showLevelComplete(): void {
    if (this.levelCompleteActive) return;
    this.levelCompleteActive = true;
    this.clearTelegraph();
    const gameScene = this.game_;
    gameScene?.audio?.play('level-complete');
    let leaving = false;
    const proceed = () => {
      if (leaving) return;
      leaving = true;
      this.cameras.main.fade(500, 0, 0, 0, false, (_c: unknown, progress: number) => {
        if (progress < 1) return;
        const completed = [...(gameScene?.completedNodes ?? []), gameScene?.currentNode ?? 0];
        const nextNode = gameScene?.getDefaultNextNode() ?? 0;
        gameScene.scene.stop('UI');
        gameScene.scene.start('Overworld', { currentNode: nextNode, completedNodes: completed, totalScore: this.currentScore });
      });
    };
    this.result = new ResultScreen(this, 'won', { score: this.currentScore, wave: this.currentWave, kills: this.kills }, [
      { icon: 'map', text: 'CONTINUE', key: 'ENTER', onClick: proceed },
    ]);
    this.time.delayedCall(4000, proceed);
  }

  private showGameOver(): void {
    this.gameOverActive = true;
    this.cameras.main.flash(1200, 138, 26, 60, false);
    this.game_?.audio?.startDeathAmbient();
    this.result = new ResultScreen(this, 'lost', { score: this.currentScore, wave: this.currentWave, kills: this.kills }, [
      { icon: 'restart', text: 'RETRY', key: 'R', onClick: () => this.restart() },
      { icon: 'map', text: 'MAP', key: 'M', onClick: () => this.exitToMap() },
    ]);
    const onM = () => this.exitToMap();
    this.input.keyboard?.once('keydown-M', onM);
    this.keyUnsubs.push(() => this.input.keyboard?.off('keydown-M', onM));
  }

  private clearTelegraph(): void {
    this.telegraph?.destroy();
    this.telegraph = undefined;
  }

  /** `?ui=pause|upgrade|gameover|complete|guide` opens a screen for screenshots. */
  private openDevScreen(which: string | undefined): void {
    if (!which) return;
    // Opening a screen pauses Game before its freeze timer fires, so the UI signals readiness.
    const at = Math.max(400, (devParams().freeze ?? 1200) - 800);
    this.time.delayedCall(at + 500, () => { (window as unknown as { __moonsecReady?: boolean }).__moonsecReady = true; });
    this.time.delayedCall(at, () => {
      if (which === 'pause') this.togglePause();
      else if (which === 'guide') this.openGuide();
      else if (which === 'upgrade') this.showUpgrade(2);
      else if (which === 'gameover') { this.scene.pause('Game'); this.showGameOver(); }
      else if (which === 'complete') { this.scene.pause('Game'); this.levelCompleteActive = true; this.result = new ResultScreen(this, 'won', { score: 12450, wave: 5, kills: 42 }, [{ icon: 'map', text: 'CONTINUE', key: 'ENTER', onClick: () => undefined }]); }
    });
  }

  shutdown(): void {
    this.clearTelegraph();
    this.radio?.clear();
    this.pauseMenu?.destroy(); this.pauseMenu = undefined;
    this.guide?.destroy(); this.guide = undefined;
    this.upgrade?.destroy(); this.upgrade = undefined;
    this.result?.destroy(); this.result = undefined;
    for (const u of this.gameEventUnsubs.splice(0)) u();
    for (const u of this.keyUnsubs.splice(0)) u();
    if (this.missileReloadActive) {
      this.game_?.audio?.stopLoop('missile-reload');
      this.missileReloadActive = false;
    }
  }
}
