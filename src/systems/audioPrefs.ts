const KEY = 'moonsec.mute';

/** Whether the player muted the game (persisted per browser). */
export function loadMuted(): boolean {
  try { return globalThis.localStorage?.getItem(KEY) === '1'; } catch { return false; }
}

export function saveMuted(muted: boolean): void {
  try { globalThis.localStorage?.setItem(KEY, muted ? '1' : '0'); } catch { /* storage blocked */ }
}
