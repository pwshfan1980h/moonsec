import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MechSelectScene } from './scenes/MechSelectScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#030318',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 600 },
      debug: false,
    },
  },
  scene: [BootScene, MechSelectScene, GameScene, UIScene],
  pixelArt: true,
  roundPixels: true,
};

new Phaser.Game(config);
