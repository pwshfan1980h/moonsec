import { OpeningGate } from './OpeningGate';
import { icon as uiIcon, label as uiLabel } from '../ui/kit/draw';
import { tc } from '../ui/theme';
import Phaser from 'phaser';
import { GAME_W } from '../constants';
import type { GameScene } from '../scenes/GameScene';
import { EncounterSchedule, SURFACE_ENCOUNTERS, SURFACE_MAX_ATTACKERS, type SurfaceEnemyRole } from '../data/surfaceMission';
import type { RiggedHostile } from '../entities/RiggedHostile';
import { Burrower, Prowler, Ram, Spotter, Stilt, TrainingTarget } from '../entities/foes/surface';
import { Warden } from '../entities/foes/bosses';
import { HEAL } from '../balance/armor';
import { pal } from '../render/palette';
import { placeProp } from '../world/worldTextures';
import { surfaceY } from '../level/levelMap';
import { RELAY_SCREEN, WORLD_PROPS } from '../world/props';
import { FIELD_CHATTER, type RadioLineId } from '../data/radioScript';

export type SurfacePhase = 'training' | 'travel' | 'combat' | 'relay' | 'upgrade' | 'boss-travel' | 'boss' | 'complete';
export interface MissionObjective { title: string; detail: string; x: number; progress: number; }

type TrainingStep = 'jump' | 'dash' | 'target' | 'done';
const STEP_LINES: Record<Exclude<TrainingStep, 'done'>, RadioLineId> = { jump: 'tut-jump', dash: 'tut-dash', target: 'tut-target' };
const CONTACT_LINES: RadioLineId[] = ['surf-contact-1', 'surf-contact-2', 'surf-contact-3'];
const RELAY_LINES: RadioLineId[] = ['surf-relay-1', 'surf-relay-2', 'surf-relay-3'];
/** Repeat a training instruction if the player hasn't done it after this long (at most twice). */
const NUDGE_MS = 25000;
/** Field crews chime in once per leg of travel, after this much quiet walking. */
const CHATTER_AFTER_MS = 9000;

/** Owns the first mission's sequence; other campaign nodes retain their existing spawner. */
export class SurfaceMission {
  phase: SurfacePhase = 'training';
  encounter = 0;
  objective: MissionObjective = { title: '', detail: '', x: 650, progress: 0 };
  private openingGate?: OpeningGate;
  private actions = new Set<string>();
  private targetDown = false;
  private schedule?: EncounterSchedule;
  private interact: Phaser.Input.Keyboard.Key;
  private relayProgress = 0;
  private markers: Phaser.GameObjects.Graphics;
  private relayLabels: { glyph: Phaser.GameObjects.Image; num: Phaser.GameObjects.BitmapText }[] = [];
  private readonly unsubs: (() => void)[] = [];
  private step: TrainingStep = 'jump';
  private stepMs = 0;
  private nudges = 0;
  private gateLine = 0;
  private travelMs = 0;
  private chattered = false;
  private chatterIndex = 0;
  private readonly onAction = (action: string) => { this.actions.add(action); };

  constructor(private readonly scene: GameScene, startAtBoss = false, startAtEncounter?: number) {
    this.interact = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.markers = scene.add.graphics().setDepth(6);
    scene.events.on('pilotAction', this.onAction);
    this.unsubs.push(() => scene.events.off('pilotAction', this.onAction));
    const onUpgrade = () => {
      if (this.phase !== 'upgrade') return;
      this.encounter++;
      this.enterTravel();
      scene.radio.say('sys-module');
      this.updateObjective();
    };
    scene.events.on('upgradeChosen', onUpgrade);
    this.unsubs.push(() => scene.events.off('upgradeChosen', onUpgrade));
    const onBossKilled = () => {
      if (this.phase !== 'boss') return;
      this.phase = 'complete';
      this.updateObjective();
      scene.events.emit('levelComplete');
    };
    scene.events.on('bossKilled', onBossKilled);
    this.unsubs.push(() => scene.events.off('bossKilled', onBossKilled));
    const onExposed = () => { scene.radio.once('surf-core', { priority: 'critical' }); };
    scene.events.on('bossExposed', onExposed);
    this.unsubs.push(() => scene.events.off('bossExposed', onExposed));
    if (scene.ai) Object.assign(scene.ai.tokens.pools, { ranged: SURFACE_MAX_ATTACKERS, melee: 1, artillery: 1 });
    SURFACE_ENCOUNTERS.forEach((e, i) => {
      const lift = this.floorAt(e.relayX) - 960;
      placeProp(scene, 'relay', e.relayX, this.floorAt(e.relayX), 5.9); // under the status markers
      const glyph = uiIcon(scene, e.relayX - 20, 780 + lift, 'relay', 2, 'inkDim').setDepth(7);
      const num = uiLabel(scene, e.relayX + 4, 780 + lift, String(i + 1).padStart(2, '0'), 'small', 'inkDim').setOrigin(0, 0.5).setDepth(7);
      this.relayLabels.push({ glyph, num });
    });
    scene.audio.play('mech-boot');
    scene.radio.say('sys-online', { priority: 'critical' });
    if (startAtBoss) {
      scene.player.setPosition(5200, this.floorAt(5200) - 10);
      this.encounter = 3;
      this.startBoss();
    } else if (startAtEncounter !== undefined) {
      this.encounter = Phaser.Math.Clamp(startAtEncounter, 0, SURFACE_ENCOUNTERS.length - 1);
      this.phase = 'travel';
      const x = SURFACE_ENCOUNTERS[this.encounter].x - 150;
      scene.player.setPosition(x, this.floorAt(x) - 10);
    } else {
      this.openingGate = new OpeningGate(scene, () => {
        scene.radio.say(this.gateLine++ % 2 === 0 ? 'tut-gate-1' : 'tut-gate-2', { tag: 'gate' });
      });
      this.spawnUnit('target', 1450, 800, () => { this.targetDown = true; });
      scene.radio.say('tut-intro', { priority: 'critical' });
      scene.radio.say(STEP_LINES.jump, { priority: 'critical', tag: 'tut' });
    }
    this.updateObjective();
  }

  /** Top of the terrain under x (relays and teleports follow the ground; 960 is the main floor). */
  private floorAt(x: number): number {
    return this.scene.ai?.terrain.surfaceBelow(x, 0) ?? this.scene.getApproxGroundY();
  }

  /** Surface roles are rigged walkers sharing the mission's attack tokens (at most two attack at once). */
  private spawnUnit(role: SurfaceEnemyRole, x: number, _y: number, defeated: () => void): void {
    const s = this.scene;
    // snipers take whatever is highest (gantry decks); everyone else starts on the ground
    const map = s.levelTemplate.map;
    const floor = map && role !== 'sniper'
      ? surfaceY(map, Math.floor(x / 32))
      : s.ai?.terrain.surfaceBelow(x, 200) ?? s.getApproxGroundY();
    let unit: RiggedHostile;
    switch (role) {
      case 'skirmisher': unit = new Prowler(s, x, floor - 2); break;
      case 'sniper': unit = new Spotter(s, x, floor - 2); break;
      case 'charger': unit = new Ram(s, x, floor - 2); break;
      case 'stilt': unit = new Stilt(s, x, floor - 2); break;
      case 'burrower': unit = new Burrower(s, x, floor); break;
      default: unit = new TrainingTarget(s, x, floor - 2); break;
    }
    unit.onKilled = defeated;
    s.hostileCombat.register(unit);
    if (role !== 'target') s.spawnFloatingText(x, floor - 140, '', 'warn', { icon: 'hazard', rise: 40, duration: 900 });
  }

  cameraTargetX(x: number, width: number, zoom: number): number {
    return this.openingGate?.cameraTarget(x, width, zoom) ?? x;
  }

  update(time: number, delta: number): void {
    const player = this.scene.player;
    const current = SURFACE_ENCOUNTERS[this.encounter];
    if (this.phase === 'training') {
      this.updateTraining(delta);
    } else if (this.phase === 'travel' && player.x >= current.x - 260) {
      this.phase = 'combat';
      this.scene.radio.say(CONTACT_LINES[this.encounter], { priority: 'critical', tag: 'objective' });
      this.schedule = new EncounterSchedule(current.roles.length);
      this.scene.events.emit('waveStart', this.encounter + 1, 3, current.roles.length);
      this.scene.events.emit('dronesRemaining', current.roles.length);
    } else if (this.phase === 'combat') {
      const schedule = this.schedule!;
      if (schedule.update(delta)) {
        const index = schedule.spawned - 1;
        const side = index % 2 === 0 ? 1 : -1;
        const spawnX = Phaser.Math.Clamp(player.x + side * 550, current.x - 550, current.relayX + 600);
        this.spawnUnit(current.roles[index], spawnX, 430 + (index % 2) * 100, () => {
          schedule.killed();
          this.scene.events.emit('hostileKilled');
          this.scene.events.emit('dronesRemaining', schedule.total - schedule.defeated);
        });
      }
      if (schedule.complete) {
        this.phase = 'relay';
        this.relayProgress = 0;
        this.scene.events.emit('encounterCleared');
        this.scene.radio.say('surf-clear', { priority: 'critical', tag: 'objective' });
      }
    } else if (this.phase === 'relay') {
      const near = Math.abs(player.x - current.relayX) < 130 && player.y > this.floorAt(current.relayX) - 180;
      this.relayProgress = near && this.interact.isDown ? Math.min(1, this.relayProgress + delta / 1800) : 0;
      this.scene.events.emit('relayProgress', this.relayProgress, near && this.interact.isDown);
      if (this.relayProgress > 0 && this.relayProgress < 1) this.scene.audio.startLoop('uplink');
      else this.scene.audio.stopLoop('uplink');
      if (this.relayProgress >= 1) {
        const relayTag = this.relayLabels[this.encounter];
        relayTag.glyph.setFrame('check').setTint(tc('repair'));
        relayTag.num.setTint(tc('repair'));
        player.heal(HEAL.relay);
        player.refillRapidAmmo(50);
        player.restoreJetpackFuel(player.jetpackMaxFuel);
        this.scene.audio.play('relay-online');
        this.scene.radio.say('sys-uplink');
        this.scene.radio.say(RELAY_LINES[this.encounter], { priority: 'critical', tag: 'objective' });
        if (this.encounter === 0) {
          this.phase = 'upgrade';
          this.scene.events.emit('fieldUpgrade', 1);
        } else {
          this.encounter++;
          if (this.encounter === SURFACE_ENCOUNTERS.length) this.phase = 'boss-travel'; else this.enterTravel();
        }
      }
    } else if (this.phase === 'boss-travel' && player.x >= 5150) {
      this.startBoss();
    }
    if (this.phase === 'travel') this.updateChatter(delta);
    if (this.phase === 'training') {
      const remaining = [
        ...(!this.actions.has('jump') ? ['SPACE TO JUMP'] : []),
        ...(!this.actions.has('dash') ? ['SHIFT TO DASH'] : []),
        ...(!this.targetDown ? ['AIM + FIRE AT THE TARGET'] : []),
      ];
      const reminder = 'COMPLETE TRAINING TO CONTINUE\n' + remaining.join('\n');
      this.openingGate?.update(time, reminder);
    }
    this.drawRelays();
    this.updateObjective();
  }

  /** Training is talked through: each completed check cues the next instruction over the radio. */
  private updateTraining(delta: number): void {
    const step: TrainingStep = !this.actions.has('jump') ? 'jump' : !this.actions.has('dash') ? 'dash' : !this.targetDown ? 'target' : 'done';
    const radio = this.scene.radio;
    if (step !== this.step) {
      this.step = step;
      this.stepMs = 0;
      this.nudges = 0;
      // a stale instruction is cut off by the next one
      radio.say(step === 'done' ? 'tut-complete' : STEP_LINES[step], { priority: 'critical', tag: 'tut', interrupt: true });
      if (step === 'done') {
        this.phase = 'travel';
        this.openingGate?.open();
        this.enterTravel();
      }
      return;
    }
    if (step === 'done') return;
    this.stepMs += delta;
    if (this.stepMs > NUDGE_MS && this.nudges < 2 && radio.isQuiet()) {
      this.stepMs = 0;
      this.nudges++;
      radio.say(STEP_LINES[step], { tag: 'tut' });
    }
  }

  private enterTravel(): void {
    this.phase = 'travel';
    this.travelMs = 0;
    this.chattered = false;
  }

  /** One line of field chatter per leg, only once the channel has been quiet for a while. */
  private updateChatter(delta: number): void {
    this.travelMs += delta;
    if (this.chattered || this.travelMs < CHATTER_AFTER_MS) return;
    if (this.scene.radio.say(FIELD_CHATTER[this.chatterIndex % FIELD_CHATTER.length], { priority: 'chatter' })) {
      this.chatterIndex++;
      this.chattered = true;
    }
  }

  private startBoss(): void {
    this.phase = 'boss';
    this.scene.physics.world.setBounds(4900, 0, 1500, 1280);
    // the arena ends at the world edge (6400); the camera needs a full screen of width to stop on it
    this.scene.cameras.main.setBounds(6400 - GAME_W, -960, GAME_W, 2040);
    const boss = new Warden(this.scene);
    this.scene.hostileCombat.register(boss);
    this.scene.events.emit('waveStart', 4, 3, 1);
    this.scene.events.emit('dronesRemaining', 1);
    this.scene.radio.say('surf-boss', { priority: 'critical', tag: 'objective' });
  }

  /** Relay state on each cabinet's screen (dim, active cyan, online green) plus the uplink progress. */
  private drawRelays(): void {
    const g = this.markers;
    g.clear();
    const spec = WORLD_PROPS.relay;
    SURFACE_ENCOUNTERS.forEach((e, i) => {
      const online = i < this.encounter || (i === 0 && this.phase === 'upgrade');
      const floor = this.floorAt(e.relayX);
      const f = floor - 960;
      const color = online ? pal('green1') : i === this.encounter ? pal('cyan2') : pal('cyan0');
      const sx = e.relayX + (RELAY_SCREEN.x - spec.px) * 2, sy = floor + (RELAY_SCREEN.y - spec.py) * 2;
      g.fillStyle(color, 1); g.fillRect(sx, sy, RELAY_SCREEN.w * 2, RELAY_SCREEN.h * 2);
      g.fillStyle(pal('hull0'), 1); for (let y = sy + 2; y < sy + RELAY_SCREEN.h * 2; y += 4) g.fillRect(sx, y, RELAY_SCREEN.w * 2, 2);
      if (i === this.encounter && this.phase === 'relay') {
        g.lineStyle(2, color, 0.4); g.strokeEllipse(e.relayX, 953 + f, 250, 30);
        g.fillStyle(pal('hull2'), 1); g.fillRect(e.relayX - 100, 790 + f, 200, 8);
        g.fillStyle(pal('green1'), 1); g.fillRect(e.relayX - 100, 790 + f, 200 * this.relayProgress, 8);
        if (this.relayProgress > 0 && this.relayProgress < 1) this.drawUplinkBeam(g, e.relayX - 2, floor - 132);
      }
    });
  }

  /** Marching data dashes from HARROW's antenna to the relay dish while F is held. */
  private drawUplinkBeam(g: Phaser.GameObjects.Graphics, rx: number, ry: number): void {
    const tip = this.scene.player.socketWorld('antennaTip');
    const len = Math.hypot(rx - tip.x, ry - tip.y);
    const steps = Math.max(1, Math.floor(len / 8));
    const march = Math.floor(this.scene.time.now / 40);
    for (let k = 0; k < steps; k++) {
      if ((k + march) % 4 >= 2) continue;
      const t = k / steps;
      const x = tip.x + (rx - tip.x) * t;
      const y = tip.y + (ry - tip.y) * t - Math.sin(t * Math.PI) * 24;
      g.fillStyle((k + march) % 4 === 0 ? pal('cyan3') : pal('cyan2'), 1);
      g.fillRect(Math.round(x / 2) * 2 - 2, Math.round(y / 2) * 2 - 2, 4, 4);
    }
  }

  private updateObjective(): void {
    const e = SURFACE_ENCOUNTERS[this.encounter];
    let title = '', detail = '', x = 0, progress = this.encounter / 3;
    switch (this.phase) {
      case 'training':
        if (!this.actions.has('jump')) { title = 'CHECK YOUR THRUSTERS'; detail = 'A / D to move · SPACE to jump; hold in the air to fly'; x = 650; }
        else if (!this.actions.has('dash')) { title = 'TEST THE SURGE DRIVE'; detail = 'SHIFT to dash in your movement direction · double-tap A / D also works'; x = 980; }
        else { title = 'DESTROY THE TRAINING TARGET'; detail = 'Aim with the mouse · left click: precision turret · right click: rapid fire'; x = 1450; }
        break;
      case 'travel': title = `RESTORE ${e.name}`; detail = 'Follow the beacon · expect a small hostile patrol'; x = e.x; break;
      case 'combat': title = `SECURE ${e.name}`; detail = this.encounter === 1 ? 'Use the low roofs for a clear firing angle · SHIFT evades charges' : 'Move away from warning lines · Q repairs armor when you can avoid fire'; x = e.x; break;
      case 'relay': title = `HOLD F TO RESTORE ${e.name}`; detail = 'Stand inside the relay ring · repairs 1 armor and supplies 50 ammo'; x = e.relayX; break;
      case 'upgrade': title = 'CHOOSE YOUR SPECIALIZATION'; detail = 'One field module · changes your weapons or repair system'; x = 2100; break;
      case 'boss-travel': title = 'DEFEND THE FINAL UPLINK'; detail = 'All relays online · proceed east to intercept the Warden'; x = 5300; break;
      case 'boss': title = 'DESTROY THE WARDEN'; detail = 'Jump the ground sweep · dash out of orbital strikes · fire when the core opens'; x = 5650; break;
      case 'complete': title = 'UPLINK SECURED'; detail = 'Surface network restored · new missions available'; x = 5650; progress = 1; break;
    }
    const next = { title, detail, x, progress };
    if (next.title !== this.objective.title || next.detail !== this.objective.detail) {
      this.objective = next;
      this.scene.events.emit('missionObjective', next);
    }
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.scene.audio?.stopLoop('uplink');
    this.openingGate?.destroy();
    this.markers.destroy();
    this.relayLabels.forEach((l) => { l.glyph.destroy(); l.num.destroy(); });
  }
}
