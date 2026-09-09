import { CELLS, PEERS, bit, gridFromValues, type Grid, type Puzzle } from '../engine';

export interface PlayState {
  puzzle: Puzzle;
  /** Player-entered digits, 0 where untouched. Givens are never stored here. */
  entries: Uint8Array;
  /** Player pencil marks as candidate bitmasks. Never read by the engine. */
  marks: Uint16Array;
  /**
   * Annotations displaced when a digit was placed, so `erase` can restore them.
   * Undo cannot do this job: a player may place a digit, work elsewhere for ten
   * moves, then return and erase, and still expect the annotations back.
   */
  shadow: Uint16Array;
}

export function createPlayState(puzzle: Puzzle): PlayState {
  return {
    puzzle,
    entries: new Uint8Array(CELLS),
    marks: new Uint16Array(CELLS),
    shadow: new Uint16Array(CELLS),
  };
}

export function isGiven(state: PlayState, cell: number): boolean {
  return state.puzzle.givens[cell] !== 0;
}

/** A cell holds annotations only while it is neither a given nor filled. */
export function isAnnotatable(state: PlayState, cell: number): boolean {
  return !isGiven(state, cell) && state.entries[cell] === 0;
}

/**
 * Empty or Annotating -> Filled, remembering any displaced annotations.
 * Filled -> Filled leaves the shadow alone, so changing your mind about the
 * digit does not lose the annotations you started from.
 */
export function placeDigit(state: PlayState, cell: number, digit: number): void {
  if (isGiven(state, cell)) return;
  if (state.entries[cell] === 0) {
    state.shadow[cell] = state.marks[cell]!;
    state.marks[cell] = 0;
  }
  state.entries[cell] = digit;
}

/** Toggles one annotation. A Filled cell offers no annotation affordance. */
export function toggleAnnotation(state: PlayState, cell: number, digit: number): void {
  if (!isAnnotatable(state, cell)) return;
  state.marks[cell]! ^= bit(digit);
}

/** Filled -> Annotating (restoring the shadow) -> Empty -> nothing. */
export function erase(state: PlayState, cell: number): void {
  if (isGiven(state, cell)) return;
  if (state.entries[cell] !== 0) {
    state.entries[cell] = 0;
    state.marks[cell] = state.shadow[cell]!;
    state.shadow[cell] = 0;
    return;
  }
  state.marks[cell] = 0;
}

/** Givens where present, otherwise the player's entry. Shared by `toGrid` and `conflicts`. */
function mergedValues(state: PlayState): Uint8Array {
  const values = new Uint8Array(CELLS);
  for (let c = 0; c < CELLS; c++) {
    values[c] = state.puzzle.givens[c] !== 0 ? state.puzzle.givens[c]! : state.entries[c]!;
  }
  return values;
}

/**
 * Projects play state into an engine Grid. Givens win over entries, and pencil
 * marks are ignored: candidates are recomputed from the values, so a wrong mark
 * can never mislead a hint.
 *
 * Note: a player can type a digit that duplicates a peer, producing a grid
 * `gridFromValues` considers contradictory — it throws `InvalidGridError` in
 * that case. Callers driving live play state (Task 14's explainer) must catch it;
 * this function does not swallow the throw so the caller that can report the
 * problem is the one that sees it.
 */
export function toGrid(state: PlayState): Grid {
  return gridFromValues(mergedValues(state));
}

/** Cells whose digit duplicates a peer's. Both sides of a clash are reported. */
export function conflicts(state: PlayState): Set<number> {
  const values = mergedValues(state);
  const bad = new Set<number>();
  for (let c = 0; c < CELLS; c++) {
    const v = values[c]!;
    if (v === 0) continue;
    for (const p of PEERS[c]!) {
      if (values[p] === v) {
        bad.add(c);
        bad.add(p);
      }
    }
  }
  return bad;
}

export function isComplete(state: PlayState): boolean {
  const values = mergedValues(state);
  for (let c = 0; c < CELLS; c++) {
    if (values[c] !== state.puzzle.solution[c]) return false;
  }
  return true;
}
