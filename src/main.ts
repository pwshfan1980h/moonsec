import Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants';
import { BootScene } from './scenes/BootScene';
import { OverworldScene } from './scenes/OverworldScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

if (import.meta.env.DEV) {
  const debugWindow = window as unknown as { __moonsecErrors?: string[] };
  debugWindow.__moonsecErrors = [];
  window.addEventListener('error', (event) => {
    debugWindow.__moonsecErrors?.push(`${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    debugWindow.__moonsecErrors?.push(`unhandled rejection: ${String(event.reason)}`);
  });
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#030318',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
  loader: {
    maxParallelDownloads: 64,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 600 },
      debug: false,
    },
  },
  scene: [BootScene, OverworldScene, GameScene, UIScene],
  pixelArt: true,
  roundPixels: true,
};

const game = new Phaser.Game(config);

if (import.meta.env.DEV) {
  (window as unknown as { __moonsec?: { game: Phaser.Game } }).__moonsec = { game };
}
