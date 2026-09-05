import Phaser from 'phaser';
import { FlightRoute } from '../systems/FlightNavigation';
import type { GameScene } from '../scenes/GameScene';
import { Swarmling } from './Swarmling';
import { playJuggernautDeath } from './effects/juggernautDeath';
import { flashEnemyHit, presentEnemyArrival, presentEnemyBreakup } from './effects/enemyPresentation';
import type { DamageProfile, Hostile } from '../collisions/HostileCombat';

type CarrierState = 'PATROL' | 'DEPLOYING' | 'HARASS' | 'RECALL' | 'ROOST' | 'DEATH';

const HP_MAX          = 12;
const PATROL_SPEED    = 24;
const DEPLOY_COUNT    = 5;
const DEPLOY_STAGGER  = 162;   // ms between individual swarmling spawns
const HARASS_DURATION = 6750;  // ms from last deploy until recall
const ROOST_DURATION  = 8100;  // ms docked cooldown before next deploy
const TINT_BASE       = 0xdd7766;

// Slow-moving mothership that periodically disgorges a swarm of Swarmlings.
// States cycle: PATROL → DEPLOYING → HARASS → RECALL → ROOST → DEPLOYING.
export class Carrier extends Phaser.Physics.Arcade.Sprite implements Hostile {
  declare scene: GameScene;

  readonly damageProfile: DamageProfile = {
    fromRapid: 0.5, fromTurret: 1, fromMissile: 3,
    chunkTint: TINT_BASE, chunkChance: 0.5, chunkCount: 3,
    showDamageText: false, impactAudio: true,
  };

  private carrierState: CarrierState = 'PATROL';
  private hp = HP_MAX;
  private patrolDir = 1;
  private phaseTimer = 2970;            // time until next state transition (ms)
  private swarmlings: Swarmling[] = [];
  private flightRoute?: FlightRoute;
  private sinOffset = Math.random() * Math.PI * 2;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, 'juggernaut');
    this.scene = scene;
    if (scene.flightNavigation) this.flightRoute = new FlightRoute(scene.flightNavigation);

    this.setScale(0.6);
    this.setDepth(10);
    this.setTint(TINT_BASE);
    this.play('juggernaut-hover');
    this.patrolDir = Math.random() < 0.5 ? -1 : 1;
    presentEnemyArrival(scene, this, 0xffaa55, 'heavy');
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(54, 38, true);
  }

  getState(): CarrierState { return this.carrierState; }

  update(time: number, delta: number): void {
    if (!this.active || this.carrierState === 'DEATH') return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    // Drift + gentle bob regardless of state
    body.setVelocityX(this.patrolDir * PATROL_SPEED);
    body.setVelocityY(Math.sin(time * 0.0018 + this.sinOffset) * 18);
    this.setFlipX(this.patrolDir < 0);
    if (this.flightRoute && this.scene.flightNavigation) {
      const player = this.scene.getPlayerPos();
      const goal = this.scene.flightNavigation.firingPosition(this, { x: player.x, y: player.y - 60 }, 360);
      const v = this.flightRoute.steer(this, goal, 90, time);
      body.setVelocity(v.x, v.y);
    }

    // Turn around at world edges
    if ((this.x < 200 && this.patrolDir < 0) || (this.x > this.scene.physics.world.bounds.width - 200 && this.patrolDir > 0)) {
      this.patrolDir *= -1;
    }

    this.phaseTimer -= delta;

    switch (this.carrierState) {
      case 'PATROL':
        if (this.phaseTimer <= 0) this.enterDeploying();
        break;
      case 'HARASS':
        if (this.phaseTimer <= 0) this.enterRecall();
        break;
      case 'ROOST':
        if (this.phaseTimer <= 0) this.enterDeploying();
        break;
      case 'DEPLOYING':
      case 'RECALL':
        // Timer-less states — transitions driven by completion callbacks
        break;
    }
  }

  private enterDeploying(): void {
    this.carrierState = 'DEPLOYING';

    // Reuse any docked swarmlings; spawn fresh ones to top up to DEPLOY_COUNT
    const active = this.swarmlings.filter(s => s.active && !s.isDead());
    const needed = DEPLOY_COUNT - active.length;

    for (let i = 0; i < active.length; i++) {
      const swarmling = active[i];
      if (!swarmling.isDocked()) continue;
      this.scene.time.delayedCall(i * DEPLOY_STAGGER, () => {
        if (!this.active || this.carrierState === 'DEATH') return;
        swarmling.deployFrom(this.x, this.y);
      });
    }

    for (let i = 0; i < needed; i++) {
      this.scene.time.delayedCall((active.length + i) * DEPLOY_STAGGER, () => {
        if (!this.active || this.carrierState === 'DEATH') return;
        this.spawnSwarmling();
      });
    }

    // Move to HARASS after all have deployed
    const totalDelay = DEPLOY_COUNT * DEPLOY_STAGGER + 100;
    this.scene.time.delayedCall(totalDelay, () => {
      if (!this.active || this.carrierState !== 'DEPLOYING') return;
      this.carrierState = 'HARASS';
      this.phaseTimer = HARASS_DURATION;
    });
  }

  private spawnSwarmling(): void {
    const angle = Math.random() * Math.PI * 2;
    const sx = this.x + Math.cos(angle) * 20;
    const sy = this.y + Math.sin(angle) * 12;
    const swarmling = new Swarmling(this.scene, sx, sy, this);
    this.scene.add.existing(swarmling);
    this.scene.physics.add.existing(swarmling);
    this.scene.drones.add(swarmling);
    (swarmling.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.scene.events.emit('hostileSpawned', 1);

    // Player weapon hits — owned by HostileCombat
    this.scene.hostileCombat.register(swarmling);

    // Swarmling colliding with the player (player-facing) stays here
    this.scene.physics.add.overlap(this.scene.player, swarmling,
      (playerObj, _s) => {
        (_s as unknown as Swarmling).onHitPlayer(playerObj as Phaser.Physics.Arcade.Sprite & { takeDamage: (n: number) => void });
      });

    this.swarmlings.push(swarmling);
  }

  private enterRecall(): void {
    this.carrierState = 'RECALL';
    for (const s of this.swarmlings) {
      if (s.active && !s.isDead() && !s.isDocked()) s.recall();
    }
    // Safety — force state even if swarmlings never dock (e.g. all killed mid-recall)
    this.scene.time.delayedCall(3375, () => {
      if (this.carrierState === 'RECALL') this.enterRoost();
    });
  }

  notifyDocked(_s: Swarmling): void {
    if (this.carrierState !== 'RECALL') return;
    const stillOut = this.swarmlings.some(s => s.active && !s.isDead() && !s.isDocked());
    if (!stillOut) this.enterRoost();
  }

  notifyLost(s: Swarmling): void {
    this.swarmlings = this.swarmlings.filter(x => x !== s);
  }

  private enterRoost(): void {
    this.carrierState = 'ROOST';
    this.phaseTimer = ROOST_DURATION;
  }

  takeDamage(amount: number): void {
    if (this.carrierState === 'DEATH') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.die();
      return;
    }
    flashEnemyHit(this.scene, this, TINT_BASE);
  }

  private die(): void {
    this.carrierState = 'DEATH';

    // Release any docked swarmlings so the fight continues until they're cleared
    for (const s of this.swarmlings) {
      if (s.active && !s.isDead()) s.onCarrierDeath();
    }

    this.scene.events.emit('droneKilled', this.x, this.y);
    presentEnemyBreakup(this.scene, this, 0xffaa55, 5);
    playJuggernautDeath(this.scene, this, { scale: 0.65 });
  }
}
