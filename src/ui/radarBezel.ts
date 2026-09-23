import Phaser from 'phaser';
import { RADAR_SCREEN_RADIUS, RADAR_X, RADAR_Y } from '../constants';
import { tc } from './theme';
import { icon, label } from './kit/draw';

/** Static radar bezel: a stepped ring of ticks with a north marker. Drawn once. */
export function drawRadarBezel(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(4);
  const R = RADAR_SCREEN_RADIUS;
  const s2 = (v: number) => Math.round(v / 2) * 2;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 12 === 0;
    const r0 = R + 6, r1 = R + (long ? 16 : 10);
    g.fillStyle(tc(long ? 'accent' : i % 4 === 0 ? 'edge' : 'edgeDim'), 1);
    for (let r = r0; r <= r1; r += 2) g.fillRect(s2(RADAR_X + Math.cos(a) * r) - 1, s2(RADAR_Y + Math.sin(a) * r) - 1, 2, 2);
  }
  label(scene, RADAR_X, RADAR_Y - R - 28, 'N', 'small', 'accentDim').setOrigin(0.5).setDepth(5);
  icon(scene, RADAR_X - R - 8, RADAR_Y - R - 8, 'view', 2, 'accentDim').setDepth(5);
}
