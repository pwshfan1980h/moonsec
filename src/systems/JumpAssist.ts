/** Input buffering and coyote time share the scene clock, so pausing is safe. */
export class JumpAssist {
  private lastGrounded = -Infinity;
  private requestedAt = -Infinity;
  private spent = false;
  private wasGrounded = false;

  update(time: number, grounded: boolean, pressed: boolean): boolean {
    if (grounded) {
      this.lastGrounded = time;
      if (!this.wasGrounded) this.spent = false;
    }
    this.wasGrounded = grounded;
    if (pressed) this.requestedAt = time;
    if (this.spent || time - this.lastGrounded > 100 || time - this.requestedAt > 120) return false;
    this.spent = true;
    this.requestedAt = -Infinity;
    return true;
  }
}
