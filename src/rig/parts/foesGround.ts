import type { DrawApi, PartSet, PartSpec } from './types';

/** Limb helpers: a tapered bone along +x with a joint disc at the pivot. */
function limb(len: number, thick: number, joint = true): PartSpec {
  const h = thick;
  return {
    w: len + 2, h, px: 1, py: Math.floor(h / 2),
    draw: (d: DrawApi) => {
      d.P([[0, 0], [len - 2, 0.5], [len + 1, h / 2], [len - 2, h - 0.5], [0, h]], 'hull3');
      d.R(1, 0, len - 3, 1, 'hull4');
      if (h > 3) d.R(1, h - 1, len - 3, 1, 'hull2');
      if (joint) d.D(1, h / 2 - 0.5, Math.max(1.2, h / 2), 'hull4');
    },
  };
}

function foot(w: number, h: number): PartSpec {
  return {
    w, h, px: Math.floor(w / 2) - 1, py: 0,
    draw: (d: DrawApi) => { d.P([[1, 0], [w - 2, 0], [w, h], [0, h]], 'hull2'); d.R(1, 0, w - 3, 1, 'hull4'); },
  };
}

export const FOE_GROUND_PARTS: PartSet = {
  // ── TICK: burrowing crawler mine ──────────────────────────────────────────
  tick_body: {
    w: 11, h: 7, px: 5, py: 5,
    sockets: { legFN: [8, 6], legBN: [2, 6], legFF: [7, 5], legBF: [3, 5], light: [5, 2], nub: [5, 0] },
    draw: (d) => {
      d.P([[0, 6], [1, 2], [5, 0], [9, 2], [10, 6]], 'hull3'); d.R(3, 1, 4, 1, 'hull4');
      d.R(4, 2, 3, 2, 'amber0'); d.px(5, 2, 'amber1'); d.R(0, 6, 11, 1, 'hull2');
    },
  },
  tick_leg_a: limb(5, 2, false),
  tick_leg_b: limb(6, 2, false),

  // ── LONGLEG: hexapod artillery spider ─────────────────────────────────────
  long_hull: {
    w: 28, h: 12, px: 14, py: 8,
    sockets: { h0: [6, 10], h1: [14, 11], h2: [22, 10], h3: [8, 9], h4: [14, 9], h5: [20, 9], gun: [20, 4], coil: [14, 4] },
    draw: (d) => {
      d.P([[1, 5], [6, 1], [22, 1], [27, 5], [25, 11], [3, 11]], 'hull3');
      d.R(6, 1, 16, 1, 'hull4'); d.R(3, 8, 22, 3, 'hull2'); d.R(23, 4, 3, 2, 'hostile1');
      d.R(10, 3, 8, 2, 'hull2'); d.px(12, 3, 'amber0'); d.px(15, 3, 'amber0');
    },
  },
  long_thigh: limb(14, 4),
  long_shin: limb(18, 3, false),
  long_gun: {
    w: 22, h: 5, px: 2, py: 2, sockets: { muzzle: [22, 2] },
    draw: (d) => {
      d.R(0, 1, 18, 3, 'hull2'); d.R(0, 1, 18, 1, 'hull4'); d.R(17, 0, 4, 5, 'hull3');
      d.px(6, 2, 'amber1'); d.px(10, 2, 'amber1'); d.px(14, 2, 'amber1');
    },
  },

  // ── BULWARK: shield walker tank ───────────────────────────────────────────
  bul_hull: {
    w: 26, h: 16, px: 12, py: 14,
    sockets: { hipN: [15, 14], hipF: [10, 13], shield: [25, 8], gun: [8, 3], eye: [21, 5] },
    draw: (d) => {
      d.P([[2, 4], [8, 1], [22, 2], [25, 6], [24, 14], [3, 14]], 'hull3');
      d.R(8, 1, 14, 2, 'hull4'); d.R(9, 1, 12, 1, 'hull5'); d.R(3, 11, 21, 3, 'hull2');
      d.R(19, 5, 4, 1, 'hostile1'); d.R(5, 9, 2, 1, 'amber1'); d.R(9, 9, 2, 1, 'amber1'); d.R(13, 9, 2, 1, 'amber1');
    },
  },
  bul_thigh: limb(13, 6),
  bul_shin: limb(15, 5, false),
  bul_foot: foot(12, 4),
  bul_shield: {
    w: 6, h: 24, px: 1, py: 12,
    draw: (d) => {
      d.R(0, 0, 6, 24, 'hull4'); d.R(0, 0, 1, 24, 'hull5'); d.R(4, 0, 2, 24, 'hull2');
      d.R(2, 4, 2, 2, 'hostile0'); d.R(2, 18, 2, 2, 'hostile0'); d.R(1, 11, 3, 2, 'hull3');
    },
  },
  bul_mortar: {
    w: 14, h: 5, px: 2, py: 2, sockets: { muzzle: [14, 2] },
    draw: (d) => { d.R(0, 0, 12, 5, 'hull2'); d.R(0, 0, 12, 1, 'hull4'); d.R(11, 1, 3, 3, 'hull3'); d.px(4, 2, 'amber0'); },
  },

  // ── PROWLER: cover-peeking skirmisher ─────────────────────────────────────
  prow_hull: {
    w: 14, h: 10, px: 7, py: 9, sockets: { hipN: [8, 9], hipF: [6, 8], gun: [9, 6], eye: [11, 3] },
    draw: (d) => {
      d.P([[1, 3], [4, 1], [11, 1], [13, 4], [12, 9], [2, 9]], 'hull3');
      d.R(4, 1, 7, 1, 'hull4'); d.R(10, 3, 3, 1, 'hostile1'); d.R(2, 7, 10, 2, 'hull2');
    },
  },
  prow_thigh: limb(9, 4),
  prow_shin: limb(11, 3, false),
  prow_foot: foot(7, 3),
  prow_gun: {
    w: 12, h: 3, px: 1, py: 1, sockets: { muzzle: [12, 1] },
    draw: (d) => { d.R(0, 0, 11, 3, 'hull2'); d.R(0, 0, 11, 1, 'hull4'); d.px(3, 1, 'hostile0'); },
  },

  // ── SPOTTER: tripod sniper ────────────────────────────────────────────────
  spot_body: {
    w: 12, h: 10, px: 6, py: 8, sockets: { l0: [3, 9], l1: [6, 10], l2: [9, 9], gun: [8, 4], lens: [9, 3] },
    draw: (d) => {
      d.P([[1, 4], [3, 1], [9, 1], [11, 4], [10, 9], [2, 9]], 'hull3');
      d.R(3, 1, 6, 1, 'hull4'); d.D(9, 3, 1.8, 'hostile0'); d.px(9, 3, 'hostile1'); d.R(2, 7, 8, 2, 'hull2');
    },
  },
  spot_leg: limb(13, 2),
  spot_leg2: limb(15, 2, false),
  spot_gun: {
    w: 27, h: 3, px: 1, py: 1, sockets: { muzzle: [27, 1] },
    draw: (d) => { d.R(0, 0, 25, 3, 'hull2'); d.R(0, 0, 25, 1, 'hull4'); d.R(23, 0, 3, 3, 'hull3'); },
  },

  // ── RAM: charging quad ────────────────────────────────────────────────────
  ram_hull: {
    w: 27, h: 12, px: 12, py: 9,
    sockets: { hFN: [18, 11], hBN: [5, 11], hFF: [17, 10], hBF: [6, 10], head: [23, 6], back: [3, 4] },
    draw: (d) => {
      d.P([[0, 4], [5, 1], [18, 1], [22, 4], [24, 9], [20, 11], [2, 11]], 'hull3');
      d.P([[20, 3], [27, 1], [25, 6]], 'hull5'); d.R(5, 1, 13, 1, 'hull4'); d.R(18, 5, 2, 1, 'hostile1');
      d.R(2, 8, 18, 3, 'hull2'); d.R(1, 3, 3, 3, 'amber0');
    },
  },
  ram_thigh: limb(9, 4),
  ram_shin: limb(11, 3, false),

  // ── STILT: tall stilt walker ──────────────────────────────────────────────
  stilt_gondola: {
    w: 18, h: 12, px: 9, py: 6, sockets: { hipN: [11, 11], hipF: [7, 10], gun: [9, 11], eye: [15, 5] },
    draw: (d) => {
      d.P([[1, 3], [5, 0], [13, 0], [17, 3], [16, 9], [11, 12], [7, 12], [2, 9]], 'hull3');
      d.R(5, 0, 8, 1, 'hull4'); d.R(14, 4, 3, 2, 'hostile1'); d.R(3, 8, 12, 2, 'hull2');
    },
  },
  stilt_thigh: limb(32, 3),
  stilt_shin: limb(36, 3, false),
  stilt_foot: foot(8, 3),
  stilt_gun: {
    w: 11, h: 4, px: 2, py: 2, sockets: { muzzle: [11, 2] },
    draw: (d) => { d.R(0, 0, 10, 4, 'hull2'); d.R(0, 0, 10, 1, 'hull4'); d.px(9, 2, 'hull0'); },
  },

  // ── SCUTTLER: segmented ceiling crawler ───────────────────────────────────
  scut_head: {
    w: 11, h: 7, px: 5, py: 4,
    draw: (d) => {
      d.P([[0, 1], [7, 0], [11, 3], [7, 7], [0, 6]], 'hull3'); d.R(1, 1, 6, 1, 'hull4');
      d.R(7, 2, 2, 1, 'hostile1'); d.R(7, 4, 2, 1, 'hostile1'); d.px(10, 1, 'hull5'); d.px(10, 5, 'hull5');
    },
  },
  scut_seg: {
    w: 8, h: 6, px: 4, py: 3,
    draw: (d) => { d.P([[0, 1], [7, 0], [8, 3], [7, 6], [0, 5]], 'hull3'); d.R(1, 1, 5, 1, 'hull4'); d.R(1, 4, 5, 1, 'hull2'); },
  },
  scut_leg: limb(5, 2, false),

  // ── BURROWER: surfacing drill ─────────────────────────────────────────────
  burr_body: {
    w: 16, h: 14, px: 8, py: 13, sockets: { drill: [8, 1], ring: [8, 6] },
    draw: (d) => {
      d.P([[0, 13], [1, 6], [4, 2], [12, 2], [15, 6], [16, 13]], 'hull3');
      d.R(4, 2, 8, 1, 'hull4'); d.R(2, 10, 12, 3, 'regolith1');
      for (let x = 3; x < 13; x += 3) d.px(x, 6, 'hostile1');
    },
  },
  burr_drill: {
    w: 8, h: 9, px: 4, py: 8,
    draw: (d) => { d.P([[0, 8], [4, 0], [8, 8]], 'hull4'); d.R(2, 5, 4, 1, 'hull2'); d.R(3, 2, 2, 1, 'hull2'); },
  },
};
