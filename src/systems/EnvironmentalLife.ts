import Phaser from 'phaser';
import { GAME_H, GAME_W, GROUND_Y, WORLD_WIDTH } from '../constants';
import type { LevelConfig } from '../data/levelConfigs';

type Palette = {
  activity: number;
  warning: number;
  cabin: number;
  hull: number;
};

const PALETTES: Palette[] = [
  { activity: 0x66ccff, warning: 0xff6633, cabin: 0xffd68a, hull: 0x314865 },
  { activity: 0x66eeff, warning: 0xffaa33, cabin: 0xb8f4ff, hull: 0x254b70 },
  { activity: 0xcc77ff, warning: 0xff4466, cabin: 0xe8b8ff, hull: 0x513060 },
  { activity: 0x88ddff, warning: 0xffcc55, cabin: 0xe8fbff, hull: 0x29445d },
  { activity: 0xff5533, warning: 0xffdd44, cabin: 0xffb070, hull: 0x5d2929 },
];

/**
 * Non-combat movement that makes each mission feel like part of a working colony.
 * All objects are decorative, deterministic, and owned by the scene lifecycle.
 */
export class EnvironmentalLife {
  private readonly palette: Palette;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: LevelConfig,
  ) {
    this.palette = PALETTES[config.nodeIndex] ?? PALETTES[0];
  }

  create(): void {
    this.createHabitatLights();
    this.createNavigationBeacons();
    this.createMaintenanceDrones();
    this.createCargoTraffic();
    this.createForegroundDust();
  }

  private createHabitatLights(): void {
    const { scene, palette } = this;
    for (let i = 0; i < 34; i++) {
      const x = 120 + i * 190;
      const y = GROUND_Y - 58 - (i % 4) * 13;
      const window = scene.add.rectangle(x, y, 5 + (i % 3) * 2, 2, palette.cabin, 0.35)
        .setDepth(2.25)
        .setScrollFactor(0.22);
      scene.tweens.add({
        targets: window,
        alpha: { from: 0.18, to: 0.8 },
        duration: 1400 + (i % 5) * 430,
        delay: (i % 7) * 180,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
  }

  private createNavigationBeacons(): void {
    const { scene, palette } = this;
    for (let i = 0; i < 22; i++) {
      const x = 260 + i * 285;
      const mast = scene.add.rectangle(x, GROUND_Y - 20, 2, 24, palette.hull, 0.85)
        .setDepth(3.65);
      const lamp = scene.add.circle(x, GROUND_Y - 34, 3, i % 4 === 0 ? palette.warning : palette.activity, 0.9)
        .setDepth(3.7);
      const halo = scene.add.circle(x, GROUND_Y - 34, 9, lamp.fillColor, 0.08)
        .setDepth(3.65);
      scene.tweens.add({
        targets: [lamp, halo],
        alpha: { from: 0.1, to: 1 },
        duration: 240,
        delay: (i % 6) * 170,
        hold: 120,
        yoyo: true,
        repeat: -1,
        repeatDelay: 1200 + (i % 3) * 260,
      });
      mast.setData('ambient', true);
    }
  }

  private createMaintenanceDrones(): void {
    const { scene, palette } = this;
    const droneCount = this.config.nodeIndex === 4 ? 5 : 9;
    for (let i = 0; i < droneCount; i++) {
      const startX = 420 + i * 650;
      const startY = GROUND_Y - 110 - (i % 3) * 55;
      const drone = scene.add.container(startX, startY).setDepth(3.25);
      const shadow = scene.add.ellipse(0, 9, 30, 5, 0x000000, 0.25);
      const body = scene.add.rectangle(0, 0, 22, 8, palette.hull, 0.95)
        .setStrokeStyle(1, palette.activity, 0.55);
      const armL = scene.add.rectangle(-15, 0, 9, 2, palette.hull, 0.9);
      const armR = scene.add.rectangle(15, 0, 9, 2, palette.hull, 0.9);
      const lamp = scene.add.circle(0, 0, 2, i % 3 === 0 ? palette.warning : palette.activity, 1);
      drone.add([shadow, body, armL, armR, lamp]);
      scene.tweens.add({
        targets: drone,
        x: startX + 150 + (i % 3) * 55,
        y: startY - 10 - (i % 2) * 12,
        duration: 5200 + (i % 4) * 900,
        delay: i * 220,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      scene.tweens.add({
        targets: lamp,
        alpha: 0.15,
        duration: 360,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private createCargoTraffic(): void {
    const { scene, palette } = this;
    const trafficCount = this.config.nodeIndex === 2 ? 3 : 5;
    for (let i = 0; i < trafficCount; i++) {
      const y = 95 + (i % 4) * 65;
      const craft = scene.add.container((i / trafficCount) * WORLD_WIDTH, y)
        .setDepth(1.9)
        .setScrollFactor(0.12 + (i % 2) * 0.04)
        .setScale(0.7 + (i % 3) * 0.18);
      const hull = scene.add.polygon(0, 0, [-28, 0, -12, -7, 20, -5, 30, 0, 20, 5, -12, 7], palette.hull, 0.8)
        .setStrokeStyle(1, palette.activity, 0.35);
      const cabin = scene.add.rectangle(7, -1, 11, 3, palette.cabin, 0.75);
      const engine = scene.add.rectangle(-30, 0, 10, 3, palette.activity, 0.7);
      craft.add([engine, hull, cabin]);
      scene.tweens.add({
        targets: engine,
        scaleX: { from: 0.55, to: 1.45 },
        alpha: { from: 0.25, to: 0.9 },
        duration: 180,
        yoyo: true,
        repeat: -1,
      });
      scene.tweens.add({
        targets: craft,
        x: WORLD_WIDTH + GAME_W,
        duration: 52000 - i * 4200,
        repeat: -1,
      });
    }
  }

  private createForegroundDust(): void {
    const { scene, palette } = this;
    if (!scene.textures.exists('ambient-speck')) {
      const gfx = scene.make.graphics({ x: 0, y: 0 }, false);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(0, 0, 2, 2);
      gfx.generateTexture('ambient-speck', 2, 2);
      gfx.destroy();
    }
    scene.add.particles(0, 0, 'ambient-speck', {
      x: { min: 0, max: WORLD_WIDTH },
      y: { min: 80, max: GAME_H - 60 },
      speedX: { min: 4, max: 18 },
      speedY: { min: -3, max: 5 },
      lifespan: { min: 5000, max: 9000 },
      frequency: this.config.nodeIndex === 3 ? 80 : 145,
      quantity: 1,
      alpha: { start: 0.22, end: 0 },
      scale: { min: 0.5, max: 1.3 },
      tint: [palette.activity, palette.cabin, 0xffffff],
    }).setDepth(3.3);
  }
}
