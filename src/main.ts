import Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { OverworldScene } from './scenes/OverworldScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { FilterRetroNode, RETRO_NODE } from './render/filters/RetroFilter';
import { palCss } from './render/palette';

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
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: palCss('void'),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
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
  scene: [BootScene, TitleScene, OverworldScene, GameScene, UIScene],
  pixelArt: true,
  roundPixels: true,
  render: {
    // Phaser's RenderNodesConfig typing describes {key, function}, but the manager passes each
    // value straight to addNodeConstructor (core/Config.js, RenderNodeManager.js), so a constructor is correct.
    renderNodes: { [RETRO_NODE]: FilterRetroNode as unknown as Phaser.Types.Core.RenderNodesConfig },
  },
};

const game = new Phaser.Game(config);

if (import.meta.env.DEV) {
  (window as unknown as { __moonsec?: { game: Phaser.Game } }).__moonsec = { game };
}

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('playtest')) {
  void import('./dev/playtest').then(({ mountPlaytest }) => mountPlaytest(game));
}
