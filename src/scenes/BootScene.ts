import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { devParams } from '../dev/devParams';
import { HARROW_BODY } from '../entities/Player';

// Dev-only: `?level=N` jumps straight to level N on boot (0-indexed, clamped).
function bootLevel(): number {
  const n = devParams().level ?? 0;
  return Phaser.Math.Clamp(n, 0, LEVEL_CONFIGS.length - 1);
}

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

    this.add.text(GAME_W / 2, Math.round(GAME_H * 0.43), 'M O O N S E C  / /  L O A D I N G', {
      fontFamily: 'VT323, "Share Tech Mono", monospace', fontSize: '22px', color: '#6de3ff',
    }).setOrigin(0.5);

    // One-shot sound effects (loops handled procedurally in AudioSystem)
    const sounds = [
      'rapid','turret','hit','hurt','jump','death',
      'drone-shoot','explosion','missile-impact',
      'nanite-heal','nanite-tick','pickup',
      'ui-nav','ui-confirm','level-complete',
      'eject', // bullet-on-geometry ricochet
      'surge', // mecha flyby — sped up + enveloped at runtime
    ];
    for (const s of sounds) {
      this.load.audio(s, `audio/${s}.wav`);
    }

    // Title screen music loop
    this.load.audio('music-title', 'audio/music-title.ogg');

    // Rigged bodies: every part of every rig in one atlas (tools/rig/build.ts)
    this.load.atlas('rig', 'assets/rig.png', 'assets/rig.json');


    // Tilemap tilesets
    this.load.image('industrial-tileset',        'assets/industrial-tileset.png');
    this.load.image('industrial-tileset-blue',   'assets/industrial-tileset-blue.png');
    this.load.image('industrial-tileset-violet', 'assets/industrial-tileset-violet.png');

    // Collectables spritesheet (16x16 tiles, 8×6 grid)
    this.load.spritesheet('collectables', `assets/collectables.png?v=${__APP_VERSION__}`, { frameWidth: 16, frameHeight: 16 });

    // Load new SVG assets for visual upgrades
    this.load.svg('logo', `assets/logo.svg?v=${__APP_VERSION__}`, { width: 600, height: 150 });
    this.load.svg('flare', `assets/flare.svg?v=${__APP_VERSION__}`, { width: 32, height: 32 });
  }

  create(): void {


    // Procedural bullet/effect textures
    this.makeTextures();

    this.registry.set('firstBoot', true);
    if (devParams().rigtest === 'foes') {
      void import('../dev/FoeGallery').then(({ FoeGallery }) => {
        this.scene.add('FoeGallery', FoeGallery, true);
        this.scene.stop();
      });
      return;
    }
    if (devParams().rigtest) {
      void import('../dev/RigTestScene').then(({ RigTestScene }) => {
        this.scene.add('RigTest', RigTestScene, true);
        this.scene.stop();
      });
      return;
    }
    this.scene.start('Game', { level: bootLevel(), totalScore: 0, completedNodes: [] });
    this.scene.launch('UI');
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

    // HARROW's physics body: an invisible texture the size of the hitbox (the rig draws the mech)
    g(HARROW_BODY.w, HARROW_BODY.h, () => undefined, 'harrow-hitbox');

    // Ground tile (dark)
    g(32, 8, (gfx) => {
      gfx.fillStyle(0x1a1a3a, 1);
      gfx.fillRect(0, 0, 32, 8);
      gfx.fillStyle(0x3333aa, 1);
      gfx.fillRect(0, 0, 32, 2);
    }, 'ground-tile');
  }
}
