import { describe, expect, it } from 'vitest';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { buildMap } from '../data/levelData';

function distanceToStaticRoute(
  config: (typeof LEVEL_CONFIGS)[number],
  x: number,
  y: number,
  halfWidth: number,
): number {
  const routes = config.template.fixedPlatforms.map(platform => ({
    left: platform.col * 32,
    right: (platform.col + platform.width) * 32,
    y: platform.row * 32,
  }));
  if (config.template.hasGround) {
    routes.push({ left: 0, right: config.template.cols * 32, y: config.template.groundRow * 32 });
  }
  return Math.min(...routes.map(route => {
    const horizontal = Math.max(0, route.left - (x + halfWidth), (x - halfWidth) - route.right);
    return Math.hypot(horizontal, Math.abs(route.y - y));
  }));
}

describe('moving-platform campaign budget', () => {
  it('uses moving platforms only as authored set pieces', () => {
    expect(LEVEL_CONFIGS.map(config => config.movingPlatforms.length)).toEqual([0, 2, 1, 2, 0]);
  });

  it('never requires a narrow moving landing', () => {
    const platforms = LEVEL_CONFIGS.flatMap(config => config.movingPlatforms);
    expect(platforms).toHaveLength(5);
    expect(platforms.every(platform => platform.width >= 128)).toBe(true);
  });

  it('keeps moving-platform speeds predictable', () => {
    const platforms = LEVEL_CONFIGS.flatMap(config => config.movingPlatforms);
    expect(platforms.every(platform => platform.speed >= 80 && platform.speed <= 100)).toBe(true);
  });

  it('spawns every void mission on an authored deck', () => {
    const voidMissions = LEVEL_CONFIGS.filter(config => config.voidBottom);
    expect(voidMissions.every(config => config.spawnCol !== undefined && config.spawnRow !== undefined)).toBe(true);
  });

  it('does not use the global ground spawn for the raised Deep Facility floor', () => {
    expect(LEVEL_CONFIGS[2].spawnRow).toBe(25);
  });

  it('places every configured spawn immediately above solid authored terrain', () => {
    for (const config of LEVEL_CONFIGS) {
      const map = buildMap(config.template, 1);
      const col = config.spawnCol ?? 9;
      const rowAboveSurface = config.spawnRow ?? config.template.groundRow - 1;
      expect(map[rowAboveSurface][col], config.label).toBe(-1);
      expect(map[rowAboveSurface + 1][col], config.label).not.toBe(-1);
    }
  });

  it('gives every moving-platform endpoint a nearby static fallback', () => {
    for (const config of LEVEL_CONFIGS) {
      for (const platform of config.movingPlatforms) {
        const endpoints = platform.axis === 'x'
          ? [[platform.x, platform.y], [platform.x + platform.travel, platform.y]]
          : [[platform.x, platform.y], [platform.x, platform.y + platform.travel]];
        for (const [x, y] of endpoints) {
          expect(distanceToStaticRoute(config, x, y, platform.width / 2), config.label).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
