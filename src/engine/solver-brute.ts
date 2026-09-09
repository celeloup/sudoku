import { ALL_CANDIDATES, CELLS, PEERS, SIZE, bit, bitCount } from './grid';

interface State {
  values: Uint8Array;
  candidates: Uint16Array;
}

function initState(values: Uint8Array): State | null {
  const state: State = {
    values: new Uint8Array(CELLS),
    candidates: new Uint16Array(CELLS).fill(ALL_CANDIDATES),
  };
  for (let c = 0; c < CELLS; c++) {
    const v = values[c]!;
    if (v === 0) continue;
    if (!place(state, c, v)) return null;
  }
  return state;
}

function place(state: State, cell: number, digit: number): boolean {
  if (!(state.candidates[cell]! & bit(digit))) return false;
  state.values[cell] = digit;
  state.candidates[cell] = 0;
  const mask = ~bit(digit);
  for (const p of PEERS[cell]!) {
    if (state.values[p] !== 0) continue;
    state.candidates[p]! &= mask;
    if (state.candidates[p] === 0) return false;
  }
  return true;
}

function cloneState(state: State): State {
  return {
    values: Uint8Array.from(state.values),
    candidates: Uint16Array.from(state.candidates),
  };
}

/** Minimum-remaining-values heuristic: pick the most constrained empty cell. */
function pickCell(state: State): number {
  let best = -1;
  let bestCount = SIZE + 1;
  for (let c = 0; c < CELLS; c++) {
    if (state.values[c] !== 0) continue;
    const n = bitCount(state.candidates[c]!);
    if (n < bestCount) {
      best = c;
      bestCount = n;
      if (n === 1) break;
    }
  }
  return best;
}

function search(state: State, cap: number, found: Uint8Array[]): number {
  const cell = pickCell(state);
  if (cell === -1) {
    found.push(Uint8Array.from(state.values));
    return 1;
  }
  let count = 0;
  const mask = state.candidates[cell]!;
  for (let d = 1; d <= SIZE; d++) {
    if (!(mask & bit(d))) continue;
    const next = cloneState(state);
    if (!place(next, cell, d)) continue;
    count += search(next, cap - count, found);
    if (count >= cap) return count;
  }
  return count;
}

export function solveValues(values: Uint8Array): Uint8Array | null {
  const state = initState(values);
  if (!state) return null;
  const found: Uint8Array[] = [];
  search(state, 1, found);
  return found[0] ?? null;
}

/** Counts solutions, stopping as soon as `cap` have been found. */
export function countSolutions(values: Uint8Array, cap: number): number {
  // search()'s leaf pushes a found solution before consulting `cap`, so a
  // cap of 0 (or less) must be rejected here rather than passed through.
  if (cap <= 0) return 0;
  const state = initState(values);
  if (!state) return 0;
  return search(state, cap, []);
}
