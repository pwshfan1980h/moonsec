/**
 * Read-only queries over the level tile grid (32-unit tiles). Pure — used by FX (jet wash,
 * dust settling) and by the enemy AI (cover, perches, ground spans).
 */
export const TILE = 32;

export class TerrainProbe {
  readonly rows: number;
  readonly cols: number;

  constructor(private readonly tiles: readonly (readonly number[])[], private readonly empty: number) {
    this.rows = tiles.length;
    this.cols = tiles[0]?.length ?? 0;
  }

  solidCell(c: number, r: number): boolean {
    if (r < 0 || c < 0 || c >= this.cols) return false;
    if (r >= this.rows) return false;
    return this.tiles[r][c] !== this.empty;
  }

  solidAt(x: number, y: number): boolean {
    return this.solidCell(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Distance straight down from (x, y) to the first solid tile top, or null within `max`. */
  groundBelow(x: number, y: number, max: number): number | null {
    const c = Math.floor(x / TILE);
    let r = Math.floor(y / TILE);
    if (this.solidCell(c, r)) return 0;
    const limit = y + max;
    for (r = r + 1; r * TILE <= limit; r++) {
      if (this.solidCell(c, r)) return r * TILE - y;
    }
    return null;
  }

  /** World y of the surface under x at or below `fromY`, or null. */
  surfaceBelow(x: number, fromY: number, max = 2000): number | null {
    const d = this.groundBelow(x, fromY, max);
    return d === null ? null : fromY + d;
  }
}
