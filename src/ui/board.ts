import {
  CELLS,
  PEERS,
  SIZE,
  bit,
  colOf,
  gridFromValues,
  rowOf,
  type Grid,
  type Puzzle,
} from '../engine';

export interface PlayState {
  puzzle: Puzzle;
  /** Player-entered digits, 0 where untouched. Givens are never stored here. */
  entries: Uint8Array;
  /** Player pencil marks as candidate bitmasks. Never read by the engine. */
  marks: Uint16Array;
}

export function createPlayState(puzzle: Puzzle): PlayState {
  return {
    puzzle,
    entries: new Uint8Array(CELLS),
    marks: new Uint16Array(CELLS),
  };
}

export function isGiven(state: PlayState, cell: number): boolean {
  return state.puzzle.givens[cell] !== 0;
}

export function setEntry(state: PlayState, cell: number, digit: number): void {
  if (isGiven(state, cell)) return;
  state.entries[cell] = digit;
  if (digit !== 0) state.marks[cell] = 0;
}

export function toggleMark(state: PlayState, cell: number, digit: number): void {
  if (isGiven(state, cell)) return;
  state.marks[cell]! ^= bit(digit);
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
  for (let c = 0; c < CELLS; c++) {
    const v = state.puzzle.givens[c] !== 0 ? state.puzzle.givens[c]! : state.entries[c]!;
    if (v !== state.puzzle.solution[c]) return false;
  }
  return true;
}

export interface BoardOptions {
  selected: number | null;
  highlighted?: Set<number>;
  onSelect: (cell: number) => void;
}

export function renderBoard(root: HTMLElement, state: PlayState, opts: BoardOptions): void {
  const bad = conflicts(state);
  root.replaceChildren();
  root.classList.add('board');

  for (let c = 0; c < CELLS; c++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.cell = String(c);

    if (colOf(c) % 3 === 0 && colOf(c) !== 0) cell.classList.add('block-left');
    if (rowOf(c) % 3 === 0 && rowOf(c) !== 0) cell.classList.add('block-top');
    if (c === opts.selected) cell.classList.add('selected');
    if (opts.highlighted?.has(c)) cell.classList.add('highlighted');
    if (bad.has(c)) cell.classList.add('conflict');

    const given = state.puzzle.givens[c]!;
    const entry = state.entries[c]!;

    if (given !== 0) {
      cell.classList.add('given');
      cell.textContent = String(given);
    } else if (entry !== 0) {
      cell.classList.add('entry');
      cell.textContent = String(entry);
    } else if (state.marks[c] !== 0) {
      const marks = document.createElement('span');
      marks.className = 'marks';
      for (let d = 1; d <= SIZE; d++) {
        const slot = document.createElement('span');
        slot.textContent = state.marks[c]! & bit(d) ? String(d) : '';
        marks.append(slot);
      }
      cell.append(marks);
    }

    cell.addEventListener('click', () => {
      opts.onSelect(c);
    });
    root.append(cell);
  }
}
