import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { SurfaceEnemyRole } from '../data/surfaceMission';

const APPEARANCE = {
  skirmisher: { key: 'drone-red', color: 0xffb347, hp: 3, scale: 2.1 },
  sniper: { key: 'sentinel', color: 0xff6272, hp: 3, scale: 2.3 },
  charger: { key: 'drone-green', color: 0x93e2bf, hp: 4, scale: 2.2 },
  target: { key: 'sentinel', color: 0x6de3ff, hp: 3, scale: 2 },
};

/** Fixed roles with aim-lock telegraphs, shared attack slots and bounded pursuit. */
export class SurfaceEnemy extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;
  private hp: number;
  private mode: 'approach' | 'warn' | 'recover' = 'approach';
  private timer = 1200;
  private aim = { x: 0, y: 0 };
  private marker: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private readonly config;

  constructor(scene: GameScene, x: number, y: number, readonly role: SurfaceEnemyRole,
    private readonly acquire: (enemy: SurfaceEnemy) => boolean,
    private readonly release: (enemy: SurfaceEnemy) => void,
    private readonly onDefeated: () => void,
  ) {
    const config = APPEARANCE[role];
    super(scene, x, y, config.key);
    this.config = config;
    this.hp = config.hp;
    scene.add.existing(this);
    scene.drones.add(this, true);
    this.setScale(config.scale).setDepth(9);
    this.play(`${config.key}-hover`);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setCollideWorldBounds(true).setSize(this.width * 0.8, this.height * 0.8, true);
    this.marker = scene.add.graphics().setDepth(8);
    this.label = scene.add.text(x, y - 60, role === 'target' ? 'TRAINING TARGET' : role.toUpperCase(), {
      fontFamily: '"Share Tech Mono", monospace', fontSize: '18px', color: '#aac3d0',
      stroke: '#020812', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);
    scene.spawnFloatingText(x, y - 75, 'INCOMING', '#ffb347', { fontSize: '20px' });
  }

  getState(): string { return this.mode === 'warn' ? 'ATTACK' : 'HOVER'; }

  update(_time: number, delta: number): void {
    if (!this.active) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.scene.isGameOverActive() || this.scene.player.hp <= 0) {
      body.stop();
      this.release(this);
      return;
    }
    const player = this.scene.player;
    this.marker.clear();
    this.label.setPosition(this.x, this.y - this.displayHeight / 2 - 22);
    this.setFlipX(player.x > this.x);
    if (this.role === 'target') return;
    this.timer -= delta;
    const distance = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y - 60);
    if (this.mode === 'approach') {
      const desiredX = player.x + (this.x < player.x ? -1 : 1) * (this.role === 'sniper' ? 500 : 330);
      const desiredY = player.y - (this.role === 'sniper' ? 220 : 140);
      body.setVelocity(Phaser.Math.Clamp((desiredX - this.x) * 0.8, -130, 130), Phaser.Math.Clamp(desiredY - this.y, -80, 80));
      if (this.timer <= 0 && distance < 750 && this.acquire(this)) {
        this.mode = 'warn';
        this.timer = this.role === 'sniper' ? 1200 : 900;
        this.aim = { x: player.x, y: player.y - 50 };
        body.setVelocity(0, 0);
        this.label.setText(this.role === 'charger' ? 'DASH INCOMING' : 'SHOT INCOMING').setColor('#ffb347');
      }
    } else if (this.mode === 'warn') {
      this.marker.lineStyle(2, this.config.color, 0.7);
      this.marker.lineBetween(this.x, this.y, this.aim.x, this.aim.y);
      this.marker.strokeCircle(this.aim.x, this.aim.y, this.role === 'charger' ? 48 : 22);
      this.marker.strokeCircle(this.x, this.y, this.displayWidth / 2 + 8);
      if (this.timer <= 0) {
        this.mode = 'recover';
        this.timer = this.role === 'charger' ? 900 : 1600;
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.aim.x, this.aim.y);
        if (this.role === 'charger') {
          body.setVelocity(Math.cos(angle) * 480, Math.sin(angle) * 480);
        } else {
          const bullet = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image | null;
          if (bullet) {
            bullet.setActive(true).setVisible(true).setDepth(12).setData('damage', 1);
            (bullet.body as Phaser.Physics.Arcade.Body).enable = true;
            const speed = this.role === 'sniper' ? 480 : 330;
            bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed).setTint(this.config.color);
            this.scene.audio.play('drone-shoot');
          }
          this.release(this);
        }
      }
    } else {
      if (this.role === 'charger' && distance < 75) this.scene.player.takeDamage(1, this.x);
      if (this.timer <= 0) {
        this.release(this);
        this.mode = 'approach';
        this.timer = 1600;
        this.label.setText(this.role.toUpperCase()).setColor('#aac3d0');
        body.setVelocity(0, 0);
      }
    }
  }

  takeDamage(amount: number): void {
    if (!this.active || this.hp <= 0) return;
    this.hp -= amount;
    if (this.hp > 0) {
      this.setTint(0xffffff);
      this.scene.time.delayedCall(90, () => { if (this.active) this.clearTint(); });
      return;
    }
    this.release(this);
    this.setActive(false).setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.spawnExplosion(this.x, this.y);
    this.onDefeated();
    this.scene.events.emit('droneKilled', this.x, this.y);
    this.destroy();
  }

  destroy(fromScene?: boolean): void {
    this.release?.(this);
    this.marker?.destroy();
    this.label?.destroy();
    super.destroy(fromScene);
  }
}
