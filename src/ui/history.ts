import type { PlayState } from './play-state';

interface Snapshot {
  entries: Uint8Array;
  marks: Uint16Array;
  shadow: Uint16Array;
}

export interface History {
  stack: Snapshot[];
}

export function createHistory(): History {
  return { stack: [] };
}

/**
 * Copies every array. Aliasing them instead would make undo restore the
 * present — the one bug this design admits, so it has its own test.
 */
function snapshot(state: PlayState): Snapshot {
  return {
    entries: Uint8Array.from(state.entries),
    marks: Uint16Array.from(state.marks),
    shadow: Uint16Array.from(state.shadow),
  };
}

function same(a: Uint8Array | Uint16Array, b: Uint8Array | Uint16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Runs `mutate`, recording an undo step only if it actually changed the board.
 * Returns whether anything changed, so a caller can skip a redraw.
 */
export function commit(history: History, state: PlayState, mutate: () => void): boolean {
  const before = snapshot(state);
  mutate();
  if (
    same(before.entries, state.entries) &&
    same(before.marks, state.marks) &&
    same(before.shadow, state.shadow)
  ) {
    return false;
  }
  history.stack.push(before);
  return true;
}

export function canUndo(history: History): boolean {
  return history.stack.length > 0;
}

/** Restores the most recent snapshot. Returns false when there is nothing to undo. */
export function undo(history: History, state: PlayState): boolean {
  const last = history.stack.pop();
  if (!last) return false;
  state.entries.set(last.entries);
  state.marks.set(last.marks);
  state.shadow.set(last.shadow);
  return true;
}

export function clear(history: History): void {
  history.stack.length = 0;
}
