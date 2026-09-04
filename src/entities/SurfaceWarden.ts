import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { SURFACE_BOSS_X, wardenDamage } from '../data/surfaceMission';
import { playJuggernautDeath } from './effects/juggernautDeath';

/** Alternates a jumpable ground sweep and a locked orbital strike, then vents its core. */
export class SurfaceWarden extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;
  readonly isBoss = true;
  readonly maxHp = 32;
  hp = this.maxHp;
  phase: 'shielded' | 'warning' | 'exposed' | 'dead' = 'shielded';
  private timer = 2000;
  private cycle = 0;
  private strikeX = SURFACE_BOSS_X;
  private shieldNoticeAt = 0;
  private graphics: Phaser.GameObjects.Graphics;
  private status: Phaser.GameObjects.Text;

  constructor(scene: GameScene) {
    super(scene, SURFACE_BOSS_X, 500, 'juggernaut');
    scene.add.existing(this);
    scene.drones.add(this, true);
    this.setScale(3.2).setDepth(11).play('juggernaut-hover');
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setImmovable(true).setSize(60, 46, true);
    this.graphics = scene.add.graphics().setDepth(10);
    this.status = scene.add.text(this.x, this.y + 150, '', {
      fontFamily: '"Share Tech Mono", monospace', fontSize: '22px', color: '#ffb347',
      stroke: '#020812', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(12);
    this.announce('SHIELD ONLINE · WATCH THE GROUND');
  }

  getState(): string { return this.phase === 'warning' ? 'ATTACK' : 'HOVER'; }

  private announce(hint: string): void {
    this.scene.events.emit('surfaceBossStatus', this.hp, this.maxHp, hint, this.phase === 'exposed');
    this.status.setText(this.phase === 'exposed' ? 'CORE OPEN' : this.phase === 'warning' ? (this.cycle % 2 === 0 ? 'JUMP THE SWEEP' : 'DASH CLEAR') : 'SHIELDED');
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.phase === 'dead' || this.scene.isGameOverActive()) return;
    this.timer -= delta;
    this.graphics.clear();
    const g = this.graphics;
    const floor = this.scene.getApproxGroundY();
    const lowSweep = this.cycle % 2 === 0;
    if (this.phase !== 'exposed') {
      g.lineStyle(4, 0x6de3ff, 0.7);
      g.strokeEllipse(this.x, this.y, 310, 265);
    } else {
      g.fillStyle(0xffb347, 0.8);
      g.fillCircle(this.x, this.y + 15, 18);
      g.lineStyle(3, 0xffd48b, 1);
      g.strokeCircle(this.x, this.y + 15, 34);
    }
    if (this.phase === 'shielded' && this.timer <= 0) {
      this.phase = 'warning';
      this.timer = 1700;
      this.strikeX = Phaser.Math.Clamp(this.scene.player.x, 5070, 6300);
      this.announce(lowSweep ? 'GROUND SWEEP · JUMP / SPACE' : 'ORBITAL STRIKE · DASH / SHIFT');
      this.scene.audio.playAt('ui-nav', { rate: 0.6, volume: 0.6 });
    } else if (this.phase === 'warning') {
      const alpha = 0.12 + (1 - Math.max(0, this.timer) / 1700) * 0.28;
      g.fillStyle(0xff6644, alpha);
      g.lineStyle(3, 0xffb347, 0.95);
      if (lowSweep) {
        g.fillRect(5000, floor - 58, 1380, 58);
        g.strokeRect(5000, floor - 58, 1380, 58);
        for (let x = 5000; x < 6380; x += 70) g.lineBetween(x, floor, x + 58, floor - 58);
      } else {
        g.fillRect(this.strikeX - 125, 220, 250, floor - 220);
        g.strokeRect(this.strikeX - 125, 220, 250, floor - 220);
      }
      if (this.timer <= 0) {
        const p = this.scene.player;
        const hit = lowSweep
          ? p.x >= 5000 && p.x <= 6380 && p.y > floor - 58
          : Math.abs(p.x - this.strikeX) < 125;
        if (hit) p.takeDamage(1, this.x);
        this.scene.spawnExplosion(lowSweep ? p.x : this.strikeX, floor - 30);
        this.scene.audio.play('explosion');
        this.phase = 'exposed';
        this.timer = this.hp <= this.maxHp / 2 ? 3200 : 4200;
        this.announce('CORE EXPOSED · FIRE NOW');
      }
    } else if (this.phase === 'exposed' && this.timer <= 0) {
      this.phase = 'shielded';
      this.cycle++;
      this.timer = 1800;
      this.announce('SHIELD ONLINE · REPOSITION');
    }
  }

  takeDamage(amount: number): void {
    if (this.phase === 'dead') return;
    const damage = wardenDamage(amount, this.phase === 'exposed');
    if (!damage) {
      if (this.scene.time.now > this.shieldNoticeAt) {
        this.shieldNoticeAt = this.scene.time.now + 900;
        this.scene.spawnFloatingText(this.x, this.y - 90, 'SHIELDED', '#6de3ff', { fontSize: '22px' });
      }
      return;
    }
    this.hp = Math.max(0, this.hp - damage);
    this.announce('CORE EXPOSED · FIRE NOW');
    if (this.hp > 0) return;
    this.phase = 'dead';
    this.graphics.clear();
    this.status.setText('WARDEN DISABLED');
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.events.emit('surfaceBossStatus', 0, this.maxHp, 'WARDEN DISABLED', false);
    playJuggernautDeath(this.scene, this, { deathEvent: 'bossKilled', tumble: false });
  }

  destroy(fromScene?: boolean): void {
    this.graphics?.destroy();
    this.status?.destroy();
    super.destroy(fromScene);
  }
}
