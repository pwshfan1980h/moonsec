import type { PartSet } from './types';

/** Boss parts: the Warden fortress walker and the Nexus four-pod flyer. */
export const FOE_BOSS_PARTS: PartSet = {
  // ── WARDEN: four-legged fortress ──────────────────────────────────────────
  ward_hull: {
    w: 58, h: 28, px: 29, py: 25,
    sockets: {
      armN: [48, 13], armF: [10, 11], dish: [29, 2], core: [29, 14],
      h0: [44, 25], h1: [14, 25], h2: [40, 23], h3: [18, 23],
    },
    draw: (d) => {
      d.P([[3, 8], [12, 2], [46, 2], [55, 8], [57, 20], [52, 26], [6, 26], [1, 20]], 'hull3');
      d.R(12, 2, 34, 2, 'hull4'); d.R(13, 2, 32, 1, 'hull5'); d.R(4, 20, 50, 5, 'hull2');
      d.R(22, 9, 14, 10, 'hull1'); d.R(24, 11, 10, 6, 'hostile0'); d.R(26, 12, 6, 4, 'hostile1');
      for (let x = 6; x < 54; x += 6) d.px(x, 22, 'hull5');
      d.R(6, 10, 10, 2, 'amber0'); d.R(42, 10, 10, 2, 'amber0');
    },
  },
  ward_shutter: {
    w: 16, h: 12, px: 8, py: 6,
    draw: (d) => { d.R(0, 0, 16, 12, 'hull4'); d.R(0, 0, 16, 1, 'hull5'); d.R(0, 5, 16, 2, 'hull2'); d.R(0, 11, 16, 1, 'hull3'); },
  },
  ward_arm: {
    w: 32, h: 9, px: 4, py: 4, sockets: { muzzle: [32, 4] },
    draw: (d) => {
      d.D(4, 4, 4, 'hull4'); d.R(6, 1, 22, 7, 'hull3'); d.R(6, 1, 22, 1, 'hull4'); d.R(6, 7, 22, 1, 'hull2');
      d.R(27, 0, 5, 9, 'hull2'); d.R(12, 3, 12, 1, 'hostile0'); d.R(12, 5, 12, 1, 'hostile0');
    },
  },
  ward_dish: {
    w: 20, h: 11, px: 10, py: 10, sockets: { emitter: [10, 1] },
    draw: (d) => {
      d.P([[0, 2], [10, 7], [20, 2], [18, 5], [10, 10], [2, 5]], 'hull4'); d.R(9, 7, 2, 4, 'hull3');
      d.R(9, 0, 2, 3, 'hostile1'); d.px(10, 0, 'cyan3');
    },
  },
  ward_thigh: {
    w: 22, h: 9, px: 3, py: 4,
    draw: (d) => { d.R(2, 0, 18, 9, 'hull3'); d.R(2, 0, 18, 2, 'hull4'); d.R(2, 7, 18, 2, 'hull2'); d.D(3, 4, 4, 'hull4'); d.D(3, 4, 2, 'hull5'); },
  },
  ward_shin: {
    w: 24, h: 7, px: 2, py: 3,
    draw: (d) => { d.R(1, 0, 20, 7, 'hull3'); d.R(1, 0, 20, 1, 'hull4'); d.R(1, 6, 20, 1, 'hull2'); d.R(5, 3, 12, 1, 'hull5'); },
  },
  ward_foot: {
    w: 18, h: 6, px: 8, py: 0,
    draw: (d) => { d.P([[2, 0], [15, 0], [18, 6], [0, 6]], 'hull2'); d.R(2, 0, 13, 1, 'hull4'); },
  },

  // ── NEXUS: four-pod flyer with a turret head ──────────────────────────────
  nexus_hull: {
    w: 42, h: 22, px: 21, py: 11,
    sockets: { head: [26, 3], pFN: [36, 18], pBN: [6, 18], pFF: [34, 4], pBF: [8, 4], core: [21, 11] },
    draw: (d) => {
      d.P([[1, 8], [8, 2], [34, 2], [41, 8], [40, 16], [32, 21], [10, 21], [2, 16]], 'hull3');
      d.R(8, 2, 26, 2, 'hull4'); d.R(9, 2, 24, 1, 'hull5'); d.R(4, 15, 34, 5, 'hull2');
      d.R(15, 8, 12, 6, 'hull1'); d.R(17, 9, 8, 4, 'hostile0'); d.R(19, 10, 4, 2, 'hostile1');
      d.R(3, 9, 6, 1, 'amber0'); d.R(33, 9, 6, 1, 'amber0');
    },
  },
  nexus_head: {
    w: 20, h: 11, px: 5, py: 6, sockets: { muzzle: [20, 6] },
    draw: (d) => {
      d.P([[0, 6], [3, 1], [10, 0], [14, 3], [14, 10], [2, 10]], 'hull4'); d.R(4, 1, 6, 1, 'hull5');
      d.R(10, 4, 3, 2, 'hostile1'); d.R(13, 5, 7, 3, 'hull2'); d.R(13, 5, 7, 1, 'hull3');
    },
  },
  nexus_pod: {
    w: 12, h: 8, px: 6, py: 2, sockets: { nozzle: [6, 8] },
    draw: (d) => { d.R(0, 0, 12, 8, 'hull2'); d.R(0, 0, 12, 1, 'hull3'); d.R(2, 7, 8, 1, 'hull0'); d.R(8, 2, 2, 2, 'hostile0'); },
  },
};
