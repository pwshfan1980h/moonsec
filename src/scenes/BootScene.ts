import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // Loading bar
    const bar = this.add.graphics();
    const w = 300, h = 12, x = (GAME_W - w) / 2, y = Math.round(GAME_H * 0.48);
    this.add.graphics().fillStyle(0x222244).fillRect(x - 2, y - 2, w + 4, h + 4);

    this.load.on('progress', (v: number) => {
      bar.clear().fillStyle(0x4488ff).fillRect(x, y, w * v, h);
    });

    this.add.text(GAME_W / 2, Math.round(GAME_H * 0.43), 'MOONSEC // LOADING', {
      fontFamily: 'monospace', fontSize: '13px', color: '#6688bb',
    }).setOrigin(0.5);

    // One-shot sound effects (loops handled procedurally in AudioSystem)
    const sounds = [
      'rapid','turret','hit','hurt','jump','death',
      'drone-shoot','explosion','footstep','missile-impact',
      'nanite-heal','nanite-tick','pickup','eject',
      'ui-nav','ui-confirm','level-complete',
    ];
    for (const s of sounds) {
      this.load.audio(s, `audio/${s}.wav`);
    }

    // Title screen music loop
    this.load.audio('music-title', 'audio/music-title.ogg');

    // Player mechs (Aseprite atlas for proper per-frame timing)
    this.load.aseprite('mech', 'assets/mech-sheet.png', 'assets/mech-sheet.json');
    this.load.aseprite('mech4', 'assets/mech4-sheet.png', 'assets/mech4-sheet.json');

    // Enemy drones as spritesheets (fixed-size frames, simpler)
    this.load.spritesheet('drone-red', 'assets/Viper-sheet.png', {
      frameWidth: 34, frameHeight: 24,
    });
    this.load.spritesheet('drone-green', 'assets/Hornet-sheet.png', {
      frameWidth: 30, frameHeight: 25,
    });
    this.load.spritesheet('kodiak', 'assets/Kodiak-sheet.png', {
      frameWidth: 37, frameHeight: 30,
    });
    this.load.spritesheet('sentinel', 'assets/Sentinel-sheet.png', {
      frameWidth: 37, frameHeight: 29,
    });
    this.load.spritesheet('nexus', 'assets/Nexus-sheet.png', {
      frameWidth: 25, frameHeight: 27,
    });
    this.load.spritesheet('dart', 'assets/Dart-sheet.png', {
      frameWidth: 28, frameHeight: 24,
    });

    // Tilemap tileset
    this.load.image('industrial-tileset', 'assets/industrial-tileset.png');

    // Collectables spritesheet (16x16 tiles, 8×6 grid)
    this.load.spritesheet('collectables', 'assets/collectables.png', { frameWidth: 16, frameHeight: 16 });

    // Load new SVG assets for visual upgrades
    this.load.svg('logo', 'assets/logo.svg', { width: 600, height: 150 });
    this.load.svg('flare', 'assets/flare.svg', { width: 32, height: 32 });
  }

  create(): void {
    // Mechs: build animations with prefix support for each mech type
    this.buildAsepriteAnims('mech', '');        // → 'idle', 'walk', etc. (unchanged)
    this.buildAsepriteAnims('mech4', 'mech4-'); // → 'mech4-idle', 'mech4-walk', etc.

    // Drone animations (manual with prefixed keys to avoid conflicts)
    this.buildDroneAnims('drone-red');
    this.buildDroneAnims('drone-green');
    this.buildDroneAnims('kodiak');

    // Sentinel — 4 standard animations (same layout as Viper/Hornet)
    this.buildDroneAnims('sentinel');

    // Dart — StunDart kamikaze (same 4-anim layout)
    this.buildDroneAnims('dart');

    // Nexus Boss — 5 animations, built inline (non-standard layout)
    const fps = (ms: number) => Math.round(1000 / ms);
    this.anims.create({
      key: 'nexus-hover',
      frames: this.anims.generateFrameNumbers('nexus', { start: 0, end: 3 }),
      frameRate: fps(120),
      repeat: -1,
      yoyo: true,
    });
    this.anims.create({
      key: 'nexus-charge',
      frames: this.anims.generateFrameNumbers('nexus', { start: 4, end: 6 }),
      frameRate: fps(100),
      repeat: -1,
      yoyo: true,
    });
    this.anims.create({
      key: 'nexus-attack',
      frames: this.anims.generateFrameNumbers('nexus', { start: 7, end: 10 }),
      frameRate: fps(80),
      repeat: 0,
    });
    this.anims.create({
      key: 'nexus-hurt',
      frames: this.anims.generateFrameNumbers('nexus', { start: 11, end: 12 }),
      frameRate: fps(100),
      repeat: 0,
    });
    this.anims.create({
      key: 'nexus-death',
      frames: this.anims.generateFrameNumbers('nexus', { start: 13, end: 17 }),
      frameRate: fps(120),
      repeat: 0,
    });

    // Procedural bullet/effect textures
    this.makeTextures();

    this.scene.start('Game', { mechType: 'mech4', level: 1 });
    this.scene.launch('UI');
  }

  private buildAsepriteAnims(textureKey: string, prefix: string): void {
    const atlas = this.cache.json.get(textureKey) as {
      frames: Record<string, { duration: number }>;
      meta: { frameTags: Array<{ name: string; from: number; to: number; direction: string }> };
    };

    if (!atlas) {
      console.warn(`[BootScene] No Aseprite data found for key: ${textureKey}`);
      return;
    }

    const frameKeys = Object.keys(atlas.frames);

    for (const tag of atlas.meta.frameTags) {
      const animFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = tag.from; i <= tag.to; i++) {
        const frameKey = frameKeys[i];
        animFrames.push({
          key: textureKey,
          frame: frameKey,
          duration: atlas.frames[frameKey].duration,
        });
      }

      if (tag.direction === 'reverse') animFrames.reverse();

      const isPingPong = tag.direction === 'pingpong';

      this.anims.create({
        key: prefix + tag.name,
        frames: animFrames,
        yoyo: isPingPong,
      });
    }
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
