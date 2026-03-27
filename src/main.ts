import Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants';
import { BootScene } from './scenes/BootScene';
import { TitleScene }   from './scenes/TitleScene';
import { StoryScene }   from './scenes/StoryScene';
import { MechSelectScene } from './scenes/MechSelectScene';
import { PrologueScene } from './scenes/PrologueScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { UpgradeCardScene } from './scenes/UpgradeCardScene';
import { UpgradeTreeScene } from './scenes/UpgradeTreeScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#030318',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 600 },
      debug: false,
    },
  },
  scene: [BootScene, TitleScene, StoryScene, MechSelectScene, PrologueScene, GameScene, UIScene, UpgradeCardScene, UpgradeTreeScene],
  pixelArt: true,
  roundPixels: true,
};

new Phaser.Game(config);
