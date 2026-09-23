/**
 * HARROW always faces the cursor. A dead zone around the mech and a short hold-time
 * stop the facing from flickering when the cursor crosses its centre line; moving
 * against the facing plays the backpedal gait instead of turning around.
 */
export const FACING_DEAD_ZONE = 12;   // world units either side of the mech
export const FACING_HOLD_MS = 120;

export interface FacingState {
  facing: 1 | -1;
  /** How long the cursor has asked for the other side. */
  heldMs: number;
}

export function nextFacing(state: FacingState, cursorDx: number, dtMs: number): FacingState {
  const wanted: 1 | -1 = cursorDx > FACING_DEAD_ZONE ? 1 : cursorDx < -FACING_DEAD_ZONE ? -1 : state.facing;
  if (wanted === state.facing) return { facing: state.facing, heldMs: 0 };
  const heldMs = state.heldMs + dtMs;
  return heldMs >= FACING_HOLD_MS ? { facing: wanted, heldMs: 0 } : { facing: state.facing, heldMs };
}

/** Surge goes where you steer; with no direction held, it goes where you face. */
export function surgeDirection(left: boolean, right: boolean, facing: 1 | -1): 1 | -1 {
  if (left && !right) return -1;
  if (right && !left) return 1;
  return facing;
}
