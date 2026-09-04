import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { SurfaceEnemy } from '../entities/SurfaceEnemy';
import { SurfaceWarden } from '../entities/SurfaceWarden';
import { EncounterSchedule, SURFACE_ENCOUNTERS, SURFACE_MAX_ATTACKERS, type SurfaceEnemyRole } from '../data/surfaceMission';

export type SurfacePhase = 'training' | 'travel' | 'combat' | 'relay' | 'upgrade' | 'boss-travel' | 'boss' | 'complete';
export interface MissionObjective { title: string; detail: string; x: number; progress: number; }

/** Owns the first mission's sequence; other campaign nodes retain their existing spawner. */
export class SurfaceMission {
  phase: SurfacePhase = 'training';
  encounter = 0;
  objective: MissionObjective = { title: '', detail: '', x: 650, progress: 0 };
  private actions = new Set<string>();
  private targetDown = false;
  private attackers = new Set<SurfaceEnemy>();
  private schedule?: EncounterSchedule;
  private interact: Phaser.Input.Keyboard.Key;
  private relayProgress = 0;
  private markers: Phaser.GameObjects.Graphics;
  private relayLabels: Phaser.GameObjects.Text[] = [];
  private readonly unsubs: (() => void)[] = [];
  private readonly onAction = (action: string) => { this.actions.add(action); };

  constructor(private readonly scene: GameScene, startAtBoss = false, startAtEncounter?: number) {
    this.interact = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.markers = scene.add.graphics().setDepth(6);
    scene.events.on('pilotAction', this.onAction);
    this.unsubs.push(() => scene.events.off('pilotAction', this.onAction));
    const onUpgrade = () => {
      if (this.phase !== 'upgrade') return;
      this.encounter++;
      this.phase = 'travel';
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
    SURFACE_ENCOUNTERS.forEach((e, i) => {
      this.relayLabels.push(scene.add.text(e.relayX, 780, `${String(i + 1).padStart(2, '0')} / ${e.name}`, {
        fontFamily: '"Share Tech Mono", monospace', fontSize: '20px', color: '#aac3d0',
        stroke: '#020812', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(7));
    });
    if (startAtBoss) {
      scene.player.setPosition(5200, 950);
      this.encounter = 3;
      this.startBoss();
    } else if (startAtEncounter !== undefined) {
      this.encounter = Phaser.Math.Clamp(startAtEncounter, 0, SURFACE_ENCOUNTERS.length - 1);
      this.phase = 'travel';
      scene.player.setPosition(SURFACE_ENCOUNTERS[this.encounter].x - 150, 950);
    } else {
      this.spawnUnit('target', 1450, 800, () => { this.targetDown = true; });
    }
    this.updateObjective();
  }

  private spawnUnit(role: SurfaceEnemyRole, x: number, y: number, defeated: () => void): void {
    const unit = new SurfaceEnemy(this.scene, x, y, role,
      enemy => {
        if (this.attackers.has(enemy)) return true;
        if (this.attackers.size >= SURFACE_MAX_ATTACKERS) return false;
        this.attackers.add(enemy); return true;
      }, enemy => this.attackers.delete(enemy), defeated,
    );
    this.connectDamage(unit);
  }

  private connectDamage(unit: SurfaceEnemy | SurfaceWarden): void {
    const scene = this.scene;
    const hit = (a: unknown, b: unknown, missile: boolean) => {
      const shot = (a === unit ? b : a) as Phaser.Physics.Arcade.Image;
      if (!shot.active || !unit.active) return;
      const x = shot.x, y = shot.y;
      shot.setActive(false).setVisible(false);
      if (shot.body) (shot.body as Phaser.Physics.Arcade.Body).enable = false;
      if (missile) shot.setData('hitTarget', true);
      const rapid = shot.texture.key === 'bullet-rapid';
      const damage = missile ? 4 : (shot.getData('damage') as number | undefined) ?? 1;
      unit.takeDamage(unit instanceof SurfaceWarden && rapid ? 0.5 : damage);
      scene.spawnBulletImpact(x, y, 'enemy');
      scene.audio.play(missile ? 'explosion' : 'hit');
      if (missile) scene.spawnMissileBlast(x, y, { primary: unit });
    };
    const bullets = scene.physics.add.overlap(scene.playerBullets, unit, (a, b) => hit(a, b, false));
    const missiles = scene.physics.add.overlap(scene.missiles, unit, (a, b) => hit(a, b, true));
    unit.once(Phaser.GameObjects.Events.DESTROY, () => { bullets.destroy(); missiles.destroy(); });
  }

  update(_time: number, delta: number): void {
    const player = this.scene.player;
    const current = SURFACE_ENCOUNTERS[this.encounter];
    if (this.phase === 'training') {
      if (this.actions.has('jump') && this.actions.has('dash') && this.targetDown) {
        this.phase = 'travel';
        this.scene.events.emit('radioTransmission', 'LUNAR CONTROL', 'Systems checked. Restore the survey relay ahead. Q repairs damaged armor; avoid fire while healing.', false);
      }
    } else if (this.phase === 'travel' && player.x >= current.x - 260) {
      this.phase = 'combat';
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
        this.scene.events.emit('radioTransmission', 'LUNAR CONTROL', 'Perimeter clear. Hold F at the relay to bring it online.', false);
      }
    } else if (this.phase === 'relay') {
      const near = Math.abs(player.x - current.relayX) < 130 && player.y > 780;
      this.relayProgress = near && this.interact.isDown ? Math.min(1, this.relayProgress + delta / 1800) : 0;
      if (this.relayProgress >= 1) {
        this.relayLabels[this.encounter].setText(`${current.name} / ONLINE`).setColor('#56e39f');
        player.heal(1);
        player.refillRapidAmmo(50);
        player.restoreJetpackFuel(player.jetpackMaxFuel);
        this.scene.audio.play('level-complete');
        if (this.encounter === 0) {
          this.phase = 'upgrade';
          this.scene.events.emit('fieldUpgrade', 1);
        } else {
          this.encounter++;
          this.phase = this.encounter === SURFACE_ENCOUNTERS.length ? 'boss-travel' : 'travel';
        }
      }
    } else if (this.phase === 'boss-travel' && player.x >= 5150) {
      this.startBoss();
    }
    this.drawRelays();
    this.updateObjective();
  }

  private startBoss(): void {
    this.phase = 'boss';
    this.scene.physics.world.setBounds(4900, 0, 1500, 1280);
    this.scene.cameras.main.setBounds(4800, -960, 1600, 2040);
    const boss = new SurfaceWarden(this.scene);
    this.connectDamage(boss);
    this.scene.events.emit('waveStart', 4, 3, 1);
    this.scene.events.emit('dronesRemaining', 1);
    this.scene.events.emit('radioTransmission', 'LUNAR CONTROL', 'Warden inbound. Jump the ground sweep, dash out of marked columns, then fire at its exposed core.', true);
  }

  private drawRelays(): void {
    const g = this.markers;
    g.clear();
    SURFACE_ENCOUNTERS.forEach((e, i) => {
      const online = i < this.encounter || (i === 0 && this.phase === 'upgrade');
      const color = online ? 0x56e39f : i === this.encounter ? 0x6de3ff : 0x365266;
      g.fillStyle(0x0b1e2a, 1); g.fillRect(e.relayX - 28, 850, 56, 110);
      g.lineStyle(3, color, 1); g.strokeRect(e.relayX - 28, 850, 56, 110);
      g.fillStyle(color, 1); g.fillRect(e.relayX - 18, 866, 36, 24);
      g.lineBetween(e.relayX, 850, e.relayX, 815);
      g.strokeCircle(e.relayX, 820, 12);
      if (i === this.encounter && this.phase === 'relay') {
        g.lineStyle(2, color, 0.4); g.strokeEllipse(e.relayX, 953, 250, 30);
        g.fillStyle(0x142a36, 1); g.fillRect(e.relayX - 100, 810, 200, 8);
        g.fillStyle(0x56e39f, 1); g.fillRect(e.relayX - 100, 810, 200 * this.relayProgress, 8);
      }
    });
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
    this.attackers.clear();
    this.markers.destroy();
    this.relayLabels.forEach(label => label.destroy());
  }
}
