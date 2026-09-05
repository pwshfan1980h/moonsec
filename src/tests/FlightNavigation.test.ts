import { describe, expect, it } from 'vitest';
import { FlightNavigation, FlightRoute } from '../systems/FlightNavigation';
import { buildMap, TMPL_TRADE_LANES } from '../data/levelData';

const nav = () => new FlightNavigation(buildMap(TMPL_TRADE_LANES, 0));

describe('Trade Lanes flight navigation', () => {
  it('places arrivals below the ceiling and outside the cargo decks and walls', () => {
    const n = nav();
    for (const p of [{ x: 20, y: -150 }, { x: 1300, y: 512 }, { x: 2128, y: 500 }, { x: 4224, y: 710 }, { x: 6700, y: 900 }]) {
      const spawn = n.nearestOpen(p);
      expect(spawn).toBeDefined();
      expect(n.isOpen(spawn!)).toBe(true);
      expect(spawn!.y).toBeGreaterThanOrEqual(200);
    }
  });

  it('routes a drone over a vertical bulkhead instead of driving into it', () => {
    const n = nav(), start = { x: 1904, y: 592 }, goal = { x: 2416, y: 592 };
    expect(n.lineClear(start, goal)).toBe(false);
    const path = n.findPath(start, goal);
    expect(path.length).toBeGreaterThan(1);
    expect(path.some(p => p.y < 280)).toBe(true);
    for (let i = 1; i < path.length; i++) expect(n.lineClear(path[i - 1], path[i])).toBe(true);
  });

  it('escapes below a deck through its edge and reaches the upper flight lane without crossing tiles', () => {
    const n = nav(), route = new FlightRoute(n);
    const p = { x: 1520, y: 848 }, goal = { x: 1520, y: 592 };
    for (let time = 0; time < 20000; time += 16) {
      const v = route.steer(p, goal, 180, time);
      p.x += v.x * 0.016; p.y += v.y * 0.016;
      expect(n.isOpen(p)).toBe(true);
    }
    expect(Math.hypot(p.x - goal.x, p.y - goal.y)).toBeLessThan(40);
  });

  it('selects a firing position with an unobstructed shot to the player', () => {
    const n = nav(), target = { x: 1280, y: 644 };
    const firing = n.firingPosition({ x: 1200, y: 420 }, target, 280);
    expect(n.isOpen(firing)).toBe(true);
    expect(n.lineClear(firing, target, 3, 3)).toBe(true);
  });

  it('stops safely if no navigable space exists', () => {
    const n = new FlightNavigation(Array.from({ length: 5 }, () => Array(5).fill(1)));
    expect(n.nearestOpen({ x: 60, y: 60 })).toBeUndefined();
    expect(new FlightRoute(n).steer({ x: 60, y: 60 }, { x: 100, y: 100 }, 180, 0)).toEqual({ x: 0, y: 0 });
  });
});
