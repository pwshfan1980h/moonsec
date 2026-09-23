import type { PartSet } from './types';

/**
 * HARROW — reverse-joint biped. Ported from art/mech-redesign/mockup.src.html.
 * Parts face +x; long parts (limbs, guns) run along +x from their pivot so a rotation
 * of the part is the bone's angle.
 */
export const HARROW_PARTS: PartSet = {
  torso: {
    w: 36, h: 23, px: 16, py: 21,
    sockets: {
      hipNear: [18, 20], hipFar: [13, 19], shoulderNear: [14, 16], shoulderFar: [12, 10],
      pod: [6, 6], plate: [10, 8], jetBack: [0, 15], vent: [6, 6], breach: [8, 11], chest: [18, 12],
    },
    draw: (d) => {
      d.R(3, 6, 11, 13, 'hull2'); d.R(3, 6, 11, 1, 'hull3'); d.R(4, 8, 1, 9, 'hull1');
      d.R(6, 9, 6, 1, 'hull1'); d.R(6, 11, 6, 1, 'hull1'); d.R(6, 13, 6, 1, 'hull1');
      d.R(0, 13, 3, 5, 'hull1'); d.R(1, 14, 2, 3, 'hull0'); d.R(3, 12, 2, 7, 'hull3');
      d.P([[9, 4], [25, 4], [29, 8], [29, 19], [24, 21], [11, 21], [8, 17]], 'hull3');
      d.R(10, 4, 15, 2, 'hull4'); d.R(11, 4, 13, 1, 'hull5');
      d.R(9, 17, 16, 1, 'hull2'); d.R(12, 19, 12, 2, 'hull2');
      d.R(18, 6, 1, 11, 'hull2'); d.R(19, 6, 1, 11, 'hull4');
      d.R(21, 14, 4, 1, 'amber1'); d.R(21, 16, 4, 1, 'amber0');
      d.P([[25, 5], [33, 8], [35, 11], [34, 14], [30, 18], [25, 18]], 'hull4');
      d.R(25, 5, 6, 1, 'hull5'); d.P([[25, 15], [33, 15], [30, 18], [25, 18]], 'hull3');
      d.P([[26, 7], [33, 8.5], [34.5, 12], [26, 12]], 'cyan2'); d.R(27, 8, 3, 1, 'cyan3'); d.R(27, 12, 7, 1, 'cyan1');
      d.px(32, 16, 'cyan2');
    },
  },
  thigh: {
    w: 19, h: 10, px: 4, py: 5, sockets: { knee: [19, 5] },
    draw: (d) => {
      d.P([[0, 1], [13, 2], [18, 3.5], [18, 6.5], [13, 8], [0, 9]], 'hull3');
      d.R(2, 2, 11, 2, 'hull4'); d.R(3, 2, 9, 1, 'hull5'); d.R(2, 7, 11, 1, 'hull2'); d.R(14, 4, 3, 2, 'hull2');
      d.D(4, 5, 3.4, 'hull4'); d.D(4, 5, 1.5, 'hull5'); d.px(4, 5, 'hull2');
    },
  },
  shin: {
    w: 23, h: 8, px: 2, py: 4, sockets: { ankle: [19, 4], calfJet: [9, 7] },
    draw: (d) => {
      d.D(2, 4, 3, 'hull3'); d.R(2, 1, 16, 6, 'hull3'); d.R(2, 1, 16, 1, 'hull4');
      d.R(4, 3, 11, 1, 'hull5'); d.R(2, 6, 16, 1, 'hull2'); d.R(17, 2, 4, 4, 'hull2');
      d.D(19, 4, 2.2, 'hull4'); d.R(7, 6, 5, 2, 'hull1'); d.R(8, 7, 3, 1, 'hull0');
    },
  },
  foot: {
    w: 15, h: 6, px: 6, py: 1, sockets: { toe: [13, 5], heel: [1, 5] },
    draw: (d) => {
      d.P([[2, 0], [10, 0], [14, 3], [14, 5], [0, 5], [0, 2]], 'hull3');
      d.R(3, 1, 7, 1, 'hull4'); d.R(0, 4, 15, 1, 'hull2'); d.R(11, 4, 3, 1, 'hull1'); d.D(6, 1, 1.8, 'hull4');
    },
  },
  cannon: {
    w: 25, h: 11, px: 4, py: 5, sockets: { barrel: [21, 5], eject: [14, 2], charge: [21, 4] },
    draw: (d) => {
      d.R(8, 2, 15, 7, 'hull3'); d.R(8, 2, 15, 1, 'hull4'); d.R(8, 8, 15, 1, 'hull2');
      d.R(12, 4, 1, 3, 'hull1'); d.R(14, 4, 1, 3, 'hull1'); d.R(16, 4, 1, 3, 'hull1'); d.px(21, 4, 'cyan2');
      d.P([[0, 0], [8, 0], [10, 3], [9, 10], [1, 10], [0, 7]], 'hull4');
      d.R(1, 1, 7, 1, 'hull5'); d.R(2, 4, 6, 1, 'amber1'); d.R(2, 6, 6, 1, 'amber0'); d.R(1, 9, 8, 1, 'hull3');
    },
  },
  barrel: {
    w: 24, h: 5, px: 0, py: 2, sockets: { muzzle: [23, 2] },
    draw: (d) => {
      d.R(0, 1, 20, 3, 'hull2'); d.R(0, 1, 20, 1, 'hull4'); d.R(19, 0, 4, 5, 'hull3'); d.R(19, 0, 4, 1, 'hull5');
      d.R(6, 2, 1, 1, 'hull1'); d.R(12, 2, 1, 1, 'hull1'); d.px(22, 2, 'hull0');
    },
  },
  gatling: {
    w: 20, h: 11, px: 4, py: 5, sockets: { barrels: [18, 5] },
    draw: (d) => {
      d.R(8, 2, 11, 7, 'hull4'); d.R(8, 2, 11, 1, 'hull5'); d.R(8, 8, 11, 1, 'hull2'); d.R(10, 4, 6, 1, 'hull3');
      d.R(0, 1, 9, 9, 'hull3'); d.R(0, 1, 9, 1, 'hull4'); d.R(2, 9, 5, 2, 'hull2');
    },
  },
  barrelsA: barrels(15, 'hull4', 'hull3', 'hull2'),
  barrelsB: barrels(15, 'hull3', 'hull4', 'hull3'),
  pod: {
    w: 14, h: 9, px: 0, py: 8, sockets: { lid: [0, 1], tube: [7, 0], top: [4, 1], leds: [2, 4] },
    draw: (d) => {
      d.R(0, 1, 13, 8, 'hull3'); d.R(0, 1, 13, 1, 'hull4'); d.R(0, 8, 13, 1, 'hull2');
      d.R(2, 0, 2, 1, 'amber1'); d.R(6, 0, 2, 1, 'amber1'); d.R(10, 0, 2, 1, 'amber1'); d.R(1, 6, 11, 1, 'hull2');
    },
  },
  lid: {
    w: 14, h: 3, px: 0, py: 2,
    draw: (d) => { d.R(0, 0, 14, 3, 'hull4'); d.R(0, 0, 14, 1, 'hull5'); d.R(0, 2, 14, 1, 'hull3'); d.R(11, 1, 2, 1, 'amber1'); },
  },
  plate: {
    w: 8, h: 7, px: 0, py: 0,
    draw: (d) => { d.R(0, 0, 8, 7, 'hull4'); d.R(0, 0, 8, 1, 'hull5'); d.R(0, 6, 8, 1, 'hull3'); d.px(2, 3, 'hull2'); d.px(5, 3, 'hull2'); },
  },
  core: {
    w: 7, h: 6, px: 0, py: 0,
    draw: (d) => { d.R(0, 0, 7, 6, 'green0'); d.R(1, 1, 5, 4, 'green1'); d.R(2, 2, 3, 2, 'cyan3'); },
  },
  antenna: {
    w: 3, h: 17, px: 1, py: 16, sockets: { tip: [1, 0] },
    draw: (d) => { d.R(1, 2, 1, 15, 'hull5'); d.R(0, 0, 3, 2, 'cyan2'); d.px(1, 0, 'cyan3'); },
  },
  flashBig: {
    w: 9, h: 7, px: 0, py: 3,
    draw: (d) => {
      d.P([[0, 1], [5, 0], [9, 3.5], [5, 7], [0, 6]], 'amber1');
      d.P([[0, 2], [6, 3.5], [0, 5]], 'cyan3'); d.px(7, 0, 'amber1'); d.px(7, 6, 'amber1');
    },
  },
  flashSmall: {
    w: 4, h: 3, px: 0, py: 1,
    draw: (d) => { d.R(0, 0, 3, 3, 'amber1'); d.R(0, 1, 4, 1, 'cyan3'); },
  },
};

function barrels(len: number, a: 'hull4' | 'hull3', b: 'hull4' | 'hull3', c: 'hull2' | 'hull3') {
  return {
    w: len, h: 7, px: 0, py: 3, sockets: { muzzle: [len - 1, 3] as const },
    draw: (d: Parameters<PartSet[string]['draw']>[0]) => {
      d.R(0, 1, len - 1, 1, a); d.R(0, 3, len - 1, 1, b); d.R(0, 5, len - 1, 1, c);
      d.R(0, 2, len - 1, 1, 'hull1'); d.R(0, 4, len - 1, 1, 'hull1');
      d.R(Math.floor(len * 0.4), 0, 2, 7, 'hull3'); d.R(len - 3, 0, 2, 7, 'hull3');
    },
  };
}
