export class WaveHostileCounter {
  private alive = 0;

  get count(): number { return this.alive; }

  add(count = 1): number {
    this.alive += count;
    return this.alive;
  }

  remove(count = 1): number {
    this.alive = Math.max(0, this.alive - count);
    return this.alive;
  }
}
