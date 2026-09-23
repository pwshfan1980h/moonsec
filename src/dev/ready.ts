import type Phaser from 'phaser';
import { devParams } from './devParams';

/**
 * Dev harness hook (tools/shots): after `?freeze=ms`, pause the scene's clock, tweens and
 * physics, then set window.__moonsecReady so the screenshot is deterministic.
 */
export function markDevReady(scene: Phaser.Scene): void {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __moonsecReady?: boolean };
  w.__moonsecReady = false;
  const freeze = devParams().freeze;
  if (freeze === undefined) { w.__moonsecReady = true; return; }
  scene.time.delayedCall(freeze, () => {
    (scene as Phaser.Scene & { physics?: Phaser.Physics.Arcade.ArcadePhysics }).physics?.world?.pause();
    scene.tweens.pauseAll();
    scene.time.timeScale = 0;
    scene.sys.pause();
    w.__moonsecReady = true;
  });
}
