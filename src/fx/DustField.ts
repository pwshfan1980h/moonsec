/**
 * Volumetric regolith dust: a coarse density + velocity grid over the camera view.
 * Pure (no Phaser) so the simulation is unit-tested; DustFieldView draws it.
 *
 * Each step: velocity drags toward the ambient wind and slowly sinks (low lunar gravity),
 * density is advected semi-Lagrangian along the velocity, lightly diffused, and decays.
 * Sources deposit density with a push; jets add radial impulses that clear dust away.
 * The grid is anchored to world cells and scrolls with the camera, so dust stays put in
 * the world while the view moves.
 */
export interface DustFieldOptions {
  cols: number;
  rows: number;
  /** World units per cell. */
  cell: number;
  /** Fraction of density kept per second. */
  retain?: number;
  /** Diffusion strength 0..1 per step. */
  diffuse?: number;
  /** Velocity drag per second (fraction removed). */
  drag?: number;
  /** Settling speed (world units/s, +y = down). */
  sink?: number;
}

export class DustField {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  density: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  private tmp: Float32Array;
  /** World cell coordinates of grid cell (0, 0). */
  originX = 0;
  originY = 0;
  windX = 0;
  windY = 0;
  private readonly retain: number;
  private readonly diffuse: number;
  private readonly drag: number;
  private readonly sink: number;

  constructor(o: DustFieldOptions) {
    this.cols = o.cols; this.rows = o.rows; this.cell = o.cell;
    const n = o.cols * o.rows;
    this.density = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.tmp = new Float32Array(n);
    this.retain = o.retain ?? 0.55;
    this.diffuse = o.diffuse ?? 0.12;
    this.drag = o.drag ?? 1.6;
    this.sink = o.sink ?? 6;
  }

  private idx(c: number, r: number): number { return r * this.cols + c; }

  totalMass(): number {
    let m = 0;
    for (let i = 0; i < this.density.length; i++) m += this.density[i];
    return m;
  }

  /** Keeps the grid over the camera: shifts contents by whole cells when the view moves. */
  anchor(worldX: number, worldY: number): void {
    const ox = Math.floor(worldX / this.cell), oy = Math.floor(worldY / this.cell);
    const dx = ox - this.originX, dy = oy - this.originY;
    if (dx === 0 && dy === 0) return;
    this.originX = ox; this.originY = oy;
    for (const field of [this.density, this.vx, this.vy]) {
      if (Math.abs(dx) >= this.cols || Math.abs(dy) >= this.rows) { field.fill(0); continue; }
      this.tmp.fill(0);
      for (let r = 0; r < this.rows; r++) {
        const sr = r + dy;
        if (sr < 0 || sr >= this.rows) continue;
        for (let c = 0; c < this.cols; c++) {
          const sc = c + dx;
          if (sc < 0 || sc >= this.cols) continue;
          this.tmp[this.idx(c, r)] = field[this.idx(sc, sr)];
        }
      }
      field.set(this.tmp);
    }
  }

  private cellOf(wx: number, wy: number): [number, number] {
    return [wx / this.cell - this.originX, wy / this.cell - this.originY];
  }

  /** Adds dust around a world point, with an initial push (world units/s). */
  deposit(wx: number, wy: number, radius: number, amount: number, pushX = 0, pushY = 0): void {
    const [cx, cy] = this.cellOf(wx, wy);
    const rc = Math.max(0.75, radius / this.cell);
    const c0 = Math.max(0, Math.floor(cx - rc)), c1 = Math.min(this.cols - 1, Math.ceil(cx + rc));
    const r0 = Math.max(0, Math.floor(cy - rc)), r1 = Math.min(this.rows - 1, Math.ceil(cy + rc));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const d2 = ((c + 0.5 - cx) ** 2 + (r + 0.5 - cy) ** 2) / (rc * rc);
      if (d2 > 1) continue;
      const w = 1 - d2;
      const i = this.idx(c, r);
      this.density[i] += amount * w;
      this.vx[i] += pushX * w;
      this.vy[i] += pushY * w;
    }
  }

  /** Radial velocity impulse (jets, explosions): blows dust outward from a point. */
  blast(wx: number, wy: number, radius: number, strength: number): void {
    const [cx, cy] = this.cellOf(wx, wy);
    const rc = Math.max(0.75, radius / this.cell);
    const c0 = Math.max(0, Math.floor(cx - rc)), c1 = Math.min(this.cols - 1, Math.ceil(cx + rc));
    const r0 = Math.max(0, Math.floor(cy - rc)), r1 = Math.min(this.rows - 1, Math.ceil(cy + rc));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const dx = c + 0.5 - cx, dy = r + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > rc || d < 1e-3) continue;
      const w = (1 - d / rc) * strength;
      const i = this.idx(c, r);
      this.vx[i] += (dx / d) * w;
      this.vy[i] += (dy / d) * w;
    }
  }

  densityAt(wx: number, wy: number): number {
    const [cx, cy] = this.cellOf(wx, wy);
    const c = Math.floor(cx), r = Math.floor(cy);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 0;
    return this.density[this.idx(c, r)];
  }

  step(dt: number): void {
    const { cols, rows } = this;
    const dragK = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.vx.length; i++) {
      this.vx[i] = this.windX + (this.vx[i] - this.windX) * dragK;
      this.vy[i] = this.windY + this.sink + (this.vy[i] - this.windY - this.sink) * dragK;
    }
    // semi-Lagrangian advection (bilinear back-trace)
    const d = this.density, out = this.tmp;
    const inv = dt / this.cell;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let x = c - this.vx[i] * inv, y = r - this.vy[i] * inv;
      x = Math.min(cols - 1.001, Math.max(0, x));
      y = Math.min(rows - 1.001, Math.max(0, y));
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const a = d[y0 * cols + x0], b = d[y0 * cols + x0 + 1], e = d[(y0 + 1) * cols + x0], f = d[(y0 + 1) * cols + x0 + 1];
      out[i] = (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
    }
    // diffusion + decay
    const k = this.diffuse;
    const keep = Math.pow(this.retain, dt);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const l = c > 0 ? out[i - 1] : out[i], rt = c < cols - 1 ? out[i + 1] : out[i];
      const u = r > 0 ? out[i - cols] : out[i], dn = r < rows - 1 ? out[i + cols] : out[i];
      d[i] = (out[i] * (1 - k) + (l + rt + u + dn) * 0.25 * k) * keep;
    }
  }
}
