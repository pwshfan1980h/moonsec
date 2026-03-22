import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // Loading bar
    const bar = this.add.graphics();
    const w = 300, h = 12, x = (800 - w) / 2, y = 215;
    this.add.graphics().fillStyle(0x222244).fillRect(x - 2, y - 2, w + 4, h + 4);

    this.load.on('progress', (v: number) => {
      bar.clear().fillStyle(0x4488ff).fillRect(x, y, w * v, h);
    });

    this.add.text(400, 195, 'MOONSEC // LOADING', {
      fontFamily: 'monospace', fontSize: '13px', color: '#6688bb',
    }).setOrigin(0.5);

    // Player mech (Aseprite atlas for proper per-frame timing)
    this.load.aseprite('mech', 'assets/mech-sheet.png', 'assets/mech-sheet.json');

    // Enemy drones as spritesheets (fixed-size frames, simpler)
    this.load.spritesheet('drone-red', 'assets/Viper-sheet.png', {
      frameWidth: 34, frameHeight: 24,
    });
    this.load.spritesheet('drone-green', 'assets/Hornet-sheet.png', {
      frameWidth: 30, frameHeight: 25,
    });
  }

  create(): void {
    // Mech: createFromAseprite reads frameTags → creates idle/walk/run/shoot/jump_*/etc.
    this.anims.createFromAseprite('mech');

    // Drone animations (manual with prefixed keys to avoid conflicts)
    this.buildDroneAnims('drone-red');
    this.buildDroneAnims('drone-green');

    // Procedural bullet/effect textures
    this.makeTextures();

    this.scene.start('Game');
    this.scene.launch('UI');
  }

  private buildDroneAnims(key: string): void {
    const fps = (ms: number) => Math.round(1000 / ms);

    this.anims.create({
      key: `${key}-hover`,
      frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 2, 3, 2, 1] }),
      frameRate: fps(150),
      repeat: -1,
    });
    this.anims.create({
      key: `${key}-attack`,
      frames: this.anims.generateFrameNumbers(key, { start: 4, end: 7 }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: `${key}-hurt`,
      frames: this.anims.generateFrameNumbers(key, { start: 8, end: 9 }),
      frameRate: 12,
      repeat: 0,
    });
    this.anims.create({
      key: `${key}-death`,
      frames: this.anims.generateFrameNumbers(key, { start: 10, end: 14 }),
      frameRate: 8,
      repeat: 0,
    });
  }

  private makeTextures(): void {
    const g = (w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void, key: string) => {
      const gfx = this.add.graphics();
      draw(gfx);
      gfx.generateTexture(key, w, h);
      gfx.destroy();
    };

    // Rapid bullet: small cyan circle
    g(8, 8, (gfx) => {
      gfx.fillStyle(0x00ffff, 1);
      gfx.fillCircle(4, 4, 3);
      gfx.fillStyle(0xffffff, 0.8);
      gfx.fillCircle(4, 4, 1.5);
    }, 'bullet-rapid');

    // Turret bullet: orange rect with hot core
    g(14, 6, (gfx) => {
      gfx.fillStyle(0xff6600, 1);
      gfx.fillRect(0, 1, 14, 4);
      gfx.fillStyle(0xffdd00, 1);
      gfx.fillRect(2, 2, 8, 2);
    }, 'bullet-turret');

    // Missile: yellow with nose
    g(14, 6, (gfx) => {
      gfx.fillStyle(0xffff00, 1);
      gfx.fillRect(0, 1, 12, 4);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(10, 2, 4, 2);
    }, 'bullet-missile');

    // Drone bullet: small red orb
    g(8, 8, (gfx) => {
      gfx.fillStyle(0xff2222, 1);
      gfx.fillCircle(4, 4, 3);
      gfx.fillStyle(0xff8888, 0.8);
      gfx.fillCircle(4, 4, 1.5);
    }, 'bullet-drone');

    // Particle pixel (for trails + explosions)
    g(4, 4, (gfx) => {
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(0, 0, 4, 4);
    }, 'pixel');

    // Ground tile (dark)
    g(32, 8, (gfx) => {
      gfx.fillStyle(0x1a1a3a, 1);
      gfx.fillRect(0, 0, 32, 8);
      gfx.fillStyle(0x3333aa, 1);
      gfx.fillRect(0, 0, 32, 2);
    }, 'ground-tile');
  }
}
