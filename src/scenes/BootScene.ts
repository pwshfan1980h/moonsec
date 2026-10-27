import { pal } from '../render/palette';
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { devParams } from '../dev/devParams';
import { HARROW_BODY } from '../entities/Player';
import { buildUiTextures } from '../ui/kit/uiTextures';
import { buildWorldTextures } from '../world/worldTextures';
import { SegBar, icon } from '../ui/kit/widgets';
import { loadMuted } from '../systems/audioPrefs';
import { audioUrls, loadSfx, voKey } from '../systems/audioAssets';
import type { RadioLineId } from '../data/radioScript';

const BOOT_VOICE: RadioLineId[] = ['sys-online', 'tut-intro', 'tut-jump', 'tut-dash', 'tut-target', 'tut-complete'];

// Dev-only: `?level=N` skips the title and jumps straight to level N (0-indexed, clamped).
function bootLevel(): number {
  const n = devParams().level ?? 0;
  return Phaser.Math.Clamp(n, 0, LEVEL_CONFIGS.length - 1);
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // Fonts, icons and panels are procedural, so the loading screen can use them.
    buildUiTextures(this);
    buildWorldTextures(this);
    const w = 480, x = (GAME_W - w) / 2, y = Math.round(GAME_H * 0.5 / 2) * 2;
    icon(this, GAME_W / 2, y - 64, 'armor', 4, 'accent');
    const bar = new SegBar(this, x, y, w, 16, 12);
    bar.set(0, 'accent');
    this.load.on('progress', (v: number) => bar.set(v, 'accent'));

    // ElevenLabs renders: every effect, loop and ambience bed, plus the opening radio calls so
    // training starts without a load hitch. Other voice lines and music stream in on demand.
    loadSfx(this.load);
    for (const id of BOOT_VOICE) this.load.audio(voKey(id), audioUrls('vo', id));

    // Rigged bodies: every part of every rig in one atlas (tools/rig/build.ts)
    this.load.atlas('rig', 'assets/rig.png', 'assets/rig.json');


    // Tilemap tilesets
    this.load.image('industrial-tileset',        'assets/industrial-tileset.png');
    this.load.image('industrial-tileset-blue',   'assets/industrial-tileset-blue.png');
    this.load.image('industrial-tileset-violet', 'assets/industrial-tileset-violet.png');

    // Collectables spritesheet (16x16 tiles, 8×6 grid)

    // Flare sprite for particles
    this.load.svg('flare', `assets/flare.svg?v=${__APP_VERSION__}`, { width: 32, height: 32 });
  }

  create(): void {


    // Procedural bullet/effect textures
    this.makeTextures();

    this.registry.set('firstBoot', true);
    if (devParams().rigtest === 'world') {
      void import('../dev/WorldKitGallery').then(({ WorldKitGallery }) => {
        this.scene.add('WorldKit', WorldKitGallery, true);
        this.scene.stop();
      });
      return;
    }
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
    this.sound.mute = loadMuted();
    const dev = devParams();
    if (dev.ui === 'map') {
      this.scene.start('Overworld', { currentNode: 1, completedNodes: [0], totalScore: 4200 });
      return;
    }
    if (dev.level === undefined || dev.ui === 'title') {
      this.scene.start('Title');
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
      gfx.fillStyle(pal('cyan2'), 1);
      gfx.fillCircle(4, 4, 3);
      gfx.fillStyle(pal('cyan3'), 0.8);
      gfx.fillCircle(4, 4, 1.5);
    }, 'bullet-rapid');

    // Turret bullet: orange rect with hot core
    g(14, 6, (gfx) => {
      gfx.fillStyle(pal('hostile1'), 1);
      gfx.fillRect(0, 1, 14, 4);
      gfx.fillStyle(pal('amber1'), 1);
      gfx.fillRect(2, 2, 8, 2);
    }, 'bullet-turret');

    // Missile: yellow with nose
    g(14, 6, (gfx) => {
      gfx.fillStyle(pal('green1'), 1);
      gfx.fillRect(0, 1, 12, 4);
      gfx.fillStyle(pal('cyan3'), 1);
      gfx.fillRect(10, 2, 4, 2);
    }, 'bullet-missile');

    // Drone bullet: small red orb
    g(8, 8, (gfx) => {
      gfx.fillStyle(pal('hostile1'), 1);
      gfx.fillCircle(4, 4, 3);
      gfx.fillStyle(pal('hostile1'), 0.8);
      gfx.fillCircle(4, 4, 1.5);
    }, 'bullet-drone');

    // Particle pixel (for trails + explosions)
    g(4, 4, (gfx) => {
      gfx.fillStyle(pal('cyan3'), 1);
      gfx.fillRect(0, 0, 4, 4);
    }, 'pixel');

    // HARROW's physics body: an invisible texture the size of the hitbox (the rig draws the mech)
    g(HARROW_BODY.w, HARROW_BODY.h, () => undefined, 'harrow-hitbox');

    // Ground tile (dark)
    g(32, 8, (gfx) => {
      gfx.fillStyle(pal('hull1'), 1);
      gfx.fillRect(0, 0, 32, 8);
      gfx.fillStyle(pal('cold2'), 1);
      gfx.fillRect(0, 0, 32, 2);
    }, 'ground-tile');
  }
}
