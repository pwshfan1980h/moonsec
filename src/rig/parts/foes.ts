import type { DrawApi, PartSet } from './types';

/**
 * Enemy parts — one rig set ('foe') shared by every hostile so they batch on one atlas.
 * Palette rule: hull ramp for bodies, hostile red for eyes/sensors, amber only for
 * ordnance and warning trim. Parts face +x; limbs and guns run along +x from the pivot.
 */

const bar = (len: number, h: number, fill: 'hull2' | 'hull3', light: 'hull3' | 'hull4' = 'hull4') => (d: DrawApi) => {
  d.R(0, 0, len, h, fill); d.R(0, 0, len, 1, light);
};

export const FOE_PARTS: PartSet = {
  // ── WASP: pod-thruster squad flyer ────────────────────────────────────────
  wasp_body: {
    w: 20, h: 11, px: 10, py: 6,
    sockets: { gun: [13, 9], podTop: [6, 2], podBottom: [6, 9], tail: [1, 5], eye: [15, 4] },
    draw: (d) => {
      d.P([[2, 3], [6, 1], [15, 1], [19, 4], [19, 7], [15, 10], [6, 10], [1, 7]], 'hull3');
      d.R(6, 1, 9, 1, 'hull5'); d.R(4, 2, 12, 1, 'hull4'); d.R(4, 8, 12, 2, 'hull2');
      d.R(13, 4, 5, 2, 'hostile1'); d.R(13, 6, 5, 1, 'hostile0'); d.px(8, 5, 'hull2'); d.px(10, 5, 'hull2');
    },
  },
  wasp_pod: {
    w: 8, h: 5, px: 4, py: 2, sockets: { nozzle: [4, 5] },
    draw: (d) => { d.R(0, 0, 8, 5, 'hull2'); d.R(0, 0, 8, 1, 'hull3'); d.R(1, 4, 6, 1, 'hull0'); d.px(6, 2, 'hostile0'); },
  },
  wasp_gun: {
    w: 11, h: 3, px: 1, py: 1, sockets: { muzzle: [11, 1] },
    draw: (d) => { d.D(1, 1, 1.5, 'hull3'); d.R(1, 0, 9, 3, 'hull2'); d.R(1, 0, 9, 1, 'hull4'); d.px(10, 1, 'hull0'); },
  },
  wasp_tail: {
    w: 5, h: 2, px: 0, py: 1,
    draw: (d) => { d.R(0, 0, 4, 2, 'hull2'); d.px(4, 0, 'hostile0'); },
  },

  // ── HORNET: swept-wing harrier ────────────────────────────────────────────
  hornet_body: {
    w: 27, h: 9, px: 13, py: 4, sockets: { gun: [20, 7], wing: [11, 4], wingFar: [12, 3], exhaust: [0, 4] },
    draw: (d) => {
      d.P([[0, 3], [8, 1], [22, 2], [27, 4.5], [22, 7], [8, 8], [0, 6]], 'hull3');
      d.R(8, 1, 14, 1, 'hull4'); d.R(8, 6, 14, 2, 'hull2'); d.R(18, 3, 4, 2, 'hostile1');
      d.R(6, 4, 8, 1, 'hull2'); d.R(0, 3, 2, 3, 'amber0');
    },
  },
  hornet_wing: {
    w: 19, h: 5, px: 15, py: 2,
    draw: (d) => { d.P([[0, 0], [14, 1], [18, 2.5], [14, 4], [2, 5]], 'hull4'); d.R(3, 2, 11, 1, 'hull2'); d.px(1, 2, 'hostile0'); },
  },
  hornet_gun: { w: 9, h: 2, px: 0, py: 1, sockets: { muzzle: [9, 1] }, draw: bar(9, 2, 'hull2') },

  // ── HERON: long-boom hover sniper ─────────────────────────────────────────
  heron_body: {
    w: 16, h: 12, px: 8, py: 6, sockets: { gun: [10, 7], podL: [3, 10], podR: [12, 10], lens: [11, 5] },
    draw: (d) => {
      d.P([[3, 1], [12, 1], [15, 5], [13, 11], [3, 11], [1, 6]], 'hull3');
      d.R(4, 1, 8, 1, 'hull4'); d.R(3, 9, 10, 2, 'hull2');
      d.D(11, 5, 2.5, 'hostile0'); d.D(11, 5, 1.2, 'hostile1');
    },
  },
  heron_boom: {
    w: 32, h: 3, px: 2, py: 1, sockets: { muzzle: [32, 1] },
    draw: (d) => { d.R(0, 0, 30, 3, 'hull2'); d.R(0, 0, 30, 1, 'hull4'); d.R(27, 0, 4, 3, 'hull3'); d.px(12, 1, 'hostile0'); },
  },
  heron_pod: {
    w: 6, h: 4, px: 3, py: 0, sockets: { nozzle: [3, 4] },
    draw: (d) => { d.R(0, 0, 6, 4, 'hull2'); d.R(0, 0, 6, 1, 'hull3'); d.R(1, 3, 4, 1, 'hull0'); },
  },

  // ── JACKAL: EMP dart pack ─────────────────────────────────────────────────
  jackal_body: {
    w: 18, h: 7, px: 9, py: 3, sockets: { fin: [6, 3], finFar: [7, 2], nose: [18, 3] },
    draw: (d) => {
      d.P([[0, 3], [5, 1], [14, 2], [18, 3.5], [14, 5], [5, 6]], 'hull3');
      d.R(5, 1, 9, 1, 'hull4'); d.R(12, 3, 3, 1, 'hostile1'); d.R(7, 3, 3, 1, 'cyan1'); d.R(0, 2, 2, 3, 'hull1');
    },
  },
  jackal_fin: { w: 8, h: 3, px: 6, py: 1, draw: (d) => { d.P([[0, 0], [6, 1], [8, 2], [1, 3]], 'hull4'); } },

  // ── MITE: swarm biter ─────────────────────────────────────────────────────
  mite_body: {
    w: 7, h: 5, px: 3, py: 2, sockets: { wing: [3, 1] },
    draw: (d) => { d.D(3, 2, 2.4, 'hull3'); d.px(5, 2, 'hostile1'); d.px(2, 1, 'hull4'); d.R(0, 4, 2, 1, 'hull2'); d.R(5, 4, 2, 1, 'hull2'); },
  },
  mite_wing: { w: 5, h: 2, px: 4, py: 1, draw: (d) => { d.R(0, 0, 5, 1, 'hull5'); d.R(1, 1, 3, 1, 'hull4'); } },

  // ── BROODMOTHER: carrier ──────────────────────────────────────────────────
  brood_hull: {
    w: 46, h: 18, px: 23, py: 9,
    sockets: { door: [16, 15], bay: [23, 17], podFN: [38, 15], podBN: [9, 15], podFF: [36, 3], podBF: [11, 3], eye: [41, 7] },
    draw: (d) => {
      d.P([[2, 6], [8, 2], [38, 2], [45, 7], [44, 12], [38, 16], [8, 16], [1, 11]], 'hull3');
      d.R(8, 2, 30, 2, 'hull4'); d.R(9, 2, 28, 1, 'hull5'); d.R(6, 12, 34, 4, 'hull2');
      d.R(16, 14, 14, 2, 'hull0'); d.R(39, 6, 4, 2, 'hostile1'); d.px(40, 6, 'amber1');
      d.R(4, 7, 1, 4, 'hull1'); d.R(6, 7, 1, 4, 'hull1'); d.R(22, 4, 1, 8, 'hull2'); d.R(23, 4, 1, 8, 'hull4');
      for (let x = 10; x < 20; x += 3) d.R(x, 9, 2, 1, 'hostile0');
    },
  },
  brood_door: {
    w: 15, h: 3, px: 0, py: 1,
    draw: (d) => { d.R(0, 0, 15, 3, 'hull4'); d.R(0, 0, 15, 1, 'hull5'); for (let x = 1; x < 14; x += 4) d.R(x, 1, 2, 1, 'amber0'); },
  },
  brood_pod: {
    w: 8, h: 6, px: 4, py: 1, sockets: { nozzle: [4, 6] },
    draw: (d) => { d.R(0, 0, 8, 6, 'hull2'); d.R(0, 0, 8, 1, 'hull3'); d.R(1, 5, 6, 1, 'hull0'); d.px(6, 2, 'hostile0'); },
  },

  // ── MANTA: dive bomber ────────────────────────────────────────────────────
  manta_body: {
    w: 30, h: 8, px: 15, py: 4, sockets: { wing: [13, 4], wingFar: [15, 3], bay: [15, 8], eye: [26, 3] },
    draw: (d) => {
      d.P([[0, 4], [6, 1], [24, 1], [30, 4], [24, 7], [6, 7]], 'hull3');
      d.R(6, 1, 18, 1, 'hull4'); d.R(11, 6, 8, 2, 'hull0'); d.R(25, 3, 3, 1, 'hostile1'); d.R(4, 4, 6, 1, 'hull2');
    },
  },
  manta_wing: {
    w: 23, h: 5, px: 18, py: 2,
    draw: (d) => { d.P([[0, 2], [4, 0], [22, 1], [22, 4], [4, 5]], 'hull4'); d.R(5, 3, 16, 1, 'hull2'); d.px(1, 2, 'hostile0'); },
  },
  manta_bomb: {
    w: 5, h: 7, px: 2, py: 3,
    draw: (d) => { d.P([[1, 0], [4, 0], [5, 4], [2.5, 7], [0, 4]], 'hull2'); d.R(1, 1, 3, 1, 'amber1'); d.px(2, 5, 'hostile1'); },
  },
};
