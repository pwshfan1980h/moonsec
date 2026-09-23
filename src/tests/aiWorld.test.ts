import { describe, expect, it } from 'vitest';
import { AiWorld } from '../ai/AiWorld';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { buildMap } from '../data/levelData';
import { TerrainProbe } from '../fx/terrain';
import { FlightNavigation } from '../systems/FlightNavigation';

describe('AiWorld on real mission maps', () => {
  for (const cfg of LEVEL_CONFIGS) {
    it(`${cfg.label}: builds navigation, cover and ground spans quickly`, () => {
      const tiles = buildMap(cfg.template, 1234);
      const t0 = performance.now();
      const world = new AiWorld(new TerrainProbe(tiles, cfg.template.tileK.EMPTY), new FlightNavigation(tiles));
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(150);
      if (cfg.template.hasGround) {
        expect(world.ground.spans.length).toBeGreaterThan(0);
        expect(world.cover.cover.length + world.cover.perches.length).toBeGreaterThan(0);
      }
    });
  }

  it('hears noise briefly, then forgets it', () => {
    const cfg = LEVEL_CONFIGS[0];
    const tiles = buildMap(cfg.template, 1);
    const world = new AiWorld(new TerrainProbe(tiles, cfg.template.tileK.EMPTY), new FlightNavigation(tiles));
    world.noise(100, 100, 1);
    expect(world.noises).toHaveLength(1);
    world.update(0.3);
    expect(world.noises).toHaveLength(0);
  });
});
