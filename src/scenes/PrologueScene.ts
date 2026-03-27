import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import { Pilot } from '../entities/Pilot';

export class PrologueScene extends Phaser.Scene {
  private pilot!: Pilot;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private drones: Phaser.Physics.Arcade.Sprite[] = [];
  private dronesKilled = 0;
  private readonly DRONE_COUNT = 3;
  private mechPlatformX = 0;
  private mechPlatformY = 0;
  private mechSprite!: Phaser.GameObjects.Sprite;
  private pilotBullets!: Phaser.Physics.Arcade.Group;
  private promptText!: Phaser.GameObjects.Text;
  private boardPrompt!: Phaser.GameObjects.Text;
  private boardable = false;
  private inputLocked = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'Prologue' });
  }

  create(): void {
    const W = GAME_W, H = GAME_H;
    const groundY = H - 40;

    // Background
    this.add.rectangle(W / 2, H / 2, W, H, 0x030318).setDepth(0);
    if (this.textures.exists('title-stars-far')) {
      this.add.image(W / 2, H / 2, 'title-stars-far').setDepth(1).setAlpha(0.5);
    }
    if (this.textures.exists('title-stars-near')) {
      this.add.image(W / 2, H / 2, 'title-stars-near').setDepth(1).setAlpha(0.3);
    }

    // Moon surface tint line
    this.add.rectangle(W / 2, groundY + 1, W, 2, 0x4444cc).setDepth(5);
    this.add.rectangle(W / 2, groundY + 20, W, 40, 0x1a1a3a).setDepth(4);

    // Physics ground
    this.ground = this.physics.add.staticGroup();
    const groundRect = this.add.rectangle(W / 2, groundY + 20, W, 40) as unknown as Phaser.Physics.Arcade.Image;
    this.ground.add(groundRect as unknown as Phaser.GameObjects.GameObject, true);

    // Platforms
    this.platforms = this.physics.add.staticGroup();

    // Mech platform (raised right-side) — STRIDER sits here
    const mechPlatX = W - 220;
    const mechPlatH = 16;
    const mechPlatTopY = H - 175;
    this.mechPlatformX = mechPlatX;
    this.mechPlatformY = mechPlatTopY;
    this.add.rectangle(mechPlatX, mechPlatTopY + mechPlatH / 2, 180, mechPlatH, 0x223344).setDepth(4);
    this.add.rectangle(mechPlatX, mechPlatTopY + 1, 180, 2, 0x4488bb).setDepth(5);
    const mechPlatRect = this.add.rectangle(mechPlatX, mechPlatTopY + mechPlatH / 2, 180, mechPlatH) as unknown as Phaser.Physics.Arcade.Image;
    this.platforms.add(mechPlatRect as unknown as Phaser.GameObjects.GameObject, true);

    // Left low platform (NPC rests here)
    const npcPlatX = 240;
    const npcPlatTopY = H - 200;
    this.add.rectangle(npcPlatX, npcPlatTopY + 8, 100, 12, 0x1a2233).setDepth(4);
    this.add.rectangle(npcPlatX, npcPlatTopY + 1, 100, 2, 0x334466).setDepth(5);
    const npcPlatRect = this.add.rectangle(npcPlatX, npcPlatTopY + 8, 100, 12) as unknown as Phaser.Physics.Arcade.Image;
    this.platforms.add(npcPlatRect as unknown as Phaser.GameObjects.GameObject, true);

    // SCOUT NPC — silhouetted in background, slightly dimmed
    const npcSprite = this.add.sprite(npcPlatX, npcPlatTopY - 18, 'mech4')
      .setScale(1.0).setDepth(7).setAlpha(0.65).setTint(0x7799cc);
    npcSprite.play({ key: 'mech4-idle', repeat: -1 });

    // STRIDER mech on raised platform (right side)
    this.mechSprite = this.add.sprite(mechPlatX, mechPlatTopY - 30, 'mech')
      .setScale(2.0).setDepth(9);
    this.mechSprite.play({ key: 'idle', repeat: -1 });

    // Input
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Pilot bullet pool
    this.pilotBullets = this.physics.add.group({
      defaultKey: 'bullet-rapid',
      maxSize: 20,
      active: false,
      visible: false,
    });

    // Pilot spawns bottom-left
    this.pilot = new Pilot(this, 90, groundY - 20);
    this.physics.add.collider(this.pilot, this.ground);
    this.physics.add.collider(this.pilot, this.platforms);

    this.pilot.setFireCallback((bx, by, dirX) => {
      const b = this.pilotBullets.get(bx, by, 'bullet-rapid') as Phaser.Physics.Arcade.Image;
      if (!b) return;
      b.setActive(true).setVisible(true).setDepth(14);
      b.setBlendMode(Phaser.BlendModes.ADD);
      const body = b.body as Phaser.Physics.Arcade.Body;
      if (body) { body.enable = true; body.setAllowGravity(false); }
      b.setVelocity(dirX * 420, 0);
      this.sound.play('rapid', { volume: 0.3 });
    });

    // Spawn the 3 incoming drones
    this.spawnDrones(groundY);

    // Story subtitle
    this.add.text(W / 2, 28, 'NEXUS DRONES DETECTED — LUNAR BASE UNDER ATTACK', {
      fontFamily: 'monospace', fontSize: '14px', color: '#8899aa',
    }).setOrigin(0.5).setDepth(20);

    // Objective prompt (pulsing)
    this.promptText = this.add.text(W / 2, 60, 'NEUTRALIZE THE DRONES', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ff6666',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: this.promptText,
      alpha: { from: 0.6, to: 1 },
      duration: 600, yoyo: true, repeat: -1,
    });

    // Board prompt — hidden until drones cleared
    this.boardPrompt = this.add.text(W / 2, mechPlatTopY - 90, '[ E ]  BOARD STRIDER', {
      fontFamily: 'monospace', fontSize: '24px', color: '#00ff88',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    // Controls hint bottom
    this.add.text(W / 2, H - 12, 'A/D MOVE   SPACE JUMP/JETPACK   LMB SHOOT', {
      fontFamily: 'monospace', fontSize: '14px', color: '#334455',
    }).setOrigin(0.5, 1).setDepth(20);

    // E key to board
    kb.on('keydown-E', () => {
      if (!this.boardable || this.inputLocked) return;
      const dist = Phaser.Math.Distance.Between(
        this.pilot.x, this.pilot.y,
        this.mechPlatformX, this.mechPlatformY,
      );
      if (dist < 140) this.boardMech();
    });

    // Fade in
    this.cameras.main.setAlpha(0);
    this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 700, ease: 'Power2' });
  }

  private spawnDrones(groundY: number): void {
    const W = GAME_W;
    const positions = [
      { x: W * 0.50, y: groundY - 90 },
      { x: W * 0.63, y: groundY - 140 },
      { x: W * 0.74, y: groundY - 70 },
    ];
    for (const pos of positions) {
      const drone = this.physics.add.sprite(pos.x, pos.y, 'drone-red');
      drone.setScale(2.5).setDepth(10);
      drone.play({ key: 'drone-red-hover', repeat: -1 });
      (drone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      this.drones.push(drone);

      this.physics.add.overlap(this.pilotBullets, drone, (bulletObj) => {
        const bullet = bulletObj as Phaser.Physics.Arcade.Image;
        bullet.setActive(false).setVisible(false);
        (bullet.body as Phaser.Physics.Arcade.Body).enable = false;

        const idx = this.drones.indexOf(drone);
        if (idx === -1) return; // already dead
        this.drones.splice(idx, 1);
        this.dronesKilled++;

        drone.play('drone-red-death', true);
        this.sound.play('explosion', { volume: 0.4, rate: 1.5 });
        this.cameras.main.shake(80, 0.007);

        drone.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => drone.destroy());

        if (this.dronesKilled >= this.DRONE_COUNT) this.onAllDronesKilled();
      });
    }
  }

  private onAllDronesKilled(): void {
    this.promptText.setText('BOARD YOUR MECH').setStyle({
      fontFamily: 'monospace', fontSize: '22px', color: '#00ff88',
    });
    this.boardable = true;
    this.boardPrompt.setAlpha(1);
    this.tweens.add({
      targets: this.boardPrompt,
      alpha: { from: 0.4, to: 1 },
      duration: 500, yoyo: true, repeat: -1,
    });
    // Gentle bob on the mech to draw attention
    this.tweens.add({
      targets: this.mechSprite,
      y: this.mechSprite.y - 6,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.sound.play('level-complete', { volume: 0.4 });
  }

  private boardMech(): void {
    this.inputLocked = true;
    this.boardPrompt.setAlpha(0);
    this.promptText.setAlpha(0);
    this.cameras.main.flash(300, 0, 180, 80, false);
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Game', { mechType: 'mech', level: 1 });
      this.scene.launch('UI');
    });
  }

  update(_time: number, delta: number): void {
    if (this.inputLocked) return;

    this.pilot.update(this.cursors, this.spaceKey, delta);

    // Drones drift slowly toward the pilot
    for (const drone of this.drones) {
      if (!drone.active) continue;
      const dx = this.pilot.x - drone.x;
      (drone.body as Phaser.Physics.Arcade.Body).setVelocityX(Math.sign(dx) * 38);
      drone.setFlipX(dx < 0);
    }

    // Cull out-of-bounds bullets
    this.pilotBullets.getChildren().forEach((obj) => {
      const b = obj as Phaser.Physics.Arcade.Image;
      if (!b.active) return;
      if (b.x < -20 || b.x > GAME_W + 20) {
        b.setActive(false).setVisible(false);
        (b.body as Phaser.Physics.Arcade.Body).enable = false;
      }
    });
  }
}
