import { describe, expect, it } from 'vitest';
import {
  conflicts,
  createPlayState,
  isComplete,
  setEntry,
  toGrid,
  toggleMark,
} from '../../src/ui/board';
import { bit } from '../../src/engine/grid';
import type { Puzzle } from '../../src/engine/types';
import { valuesFrom } from '../helpers';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function puzzle(): Puzzle {
  return {
    givens: valuesFrom(GIVENS),
    solution: valuesFrom(SOLUTION),
    difficulty: 'easy',
    score: 42,
    clueCount: 30,
    seed: 'test',
  };
}

describe('createPlayState', () => {
  it('starts with no entries and no marks', () => {
    const state = createPlayState(puzzle());
    expect([...state.entries].every((v) => v === 0)).toBe(true);
    expect([...state.marks].every((v) => v === 0)).toBe(true);
  });
});

describe('setEntry', () => {
  it('records a digit in an empty cell', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 4);
    expect(state.entries[2]).toBe(4);
  });

  it('refuses to overwrite a given', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 0, 9);
    expect(state.entries[0]).toBe(0);
  });

  it('clears an entry when given 0', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 4);
    setEntry(state, 2, 0);
    expect(state.entries[2]).toBe(0);
  });
});

describe('toggleMark', () => {
  it('adds and removes a pencil mark', () => {
    const state = createPlayState(puzzle());
    toggleMark(state, 2, 4);
    expect(state.marks[2]! & bit(4)).not.toBe(0);
    toggleMark(state, 2, 4);
    expect(state.marks[2]! & bit(4)).toBe(0);
  });

  it('refuses to mark a given', () => {
    const state = createPlayState(puzzle());
    toggleMark(state, 0, 4);
    expect(state.marks[0]).toBe(0);
  });
});

describe('toGrid', () => {
  it('gives givens precedence over entries', () => {
    const state = createPlayState(puzzle());
    state.entries[0] = 9; // bypass setEntry to prove toGrid also guards
    expect(toGrid(state).values[0]).toBe(5);
  });

  it('includes player entries', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 4);
    expect(toGrid(state).values[2]).toBe(4);
  });

  it('ignores pencil marks entirely', () => {
    const a = createPlayState(puzzle());
    const b = createPlayState(puzzle());
    toggleMark(b, 2, 1);
    toggleMark(b, 2, 9);
    expect(toGrid(a).values).toEqual(toGrid(b).values);
    expect(toGrid(a).candidates).toEqual(toGrid(b).candidates);
  });

  it('computes real candidates rather than trusting marks', () => {
    const state = createPlayState(puzzle());
    toggleMark(state, 2, 5); // 5 is impossible at r1c3: r1c1 is 5
    expect(toGrid(state).candidates[2]! & bit(5)).toBe(0);
  });
});

describe('conflicts', () => {
  it('is empty for a fresh puzzle', () => {
    expect(conflicts(createPlayState(puzzle())).size).toBe(0);
  });

  it('flags both cells when a player entry duplicates a peer', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 5); // r1c3 = 5, but r1c1 is already 5
    const bad = conflicts(state);
    expect(bad.has(2)).toBe(true);
    expect(bad.has(0)).toBe(true);
  });

  it('does not flag a correct entry', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 4);
    expect(conflicts(state).has(2)).toBe(false);
  });
});

describe('isComplete', () => {
  it('is false for a fresh puzzle', () => {
    expect(isComplete(createPlayState(puzzle()))).toBe(false);
  });

  it('is true once every cell matches the solution', () => {
    const state = createPlayState(puzzle());
    for (let c = 0; c < 81; c++) {
      if (state.puzzle.givens[c] === 0) setEntry(state, c, state.puzzle.solution[c]!);
    }
    expect(isComplete(state)).toBe(true);
  });

  it('is false when the grid is full but wrong', () => {
    const state = createPlayState(puzzle());
    for (let c = 0; c < 81; c++) {
      if (state.puzzle.givens[c] === 0) setEntry(state, c, state.puzzle.solution[c]!);
    }
    const firstEmpty = [...state.puzzle.givens].findIndex((v) => v === 0);
    setEntry(state, firstEmpty, state.puzzle.solution[firstEmpty] === 1 ? 2 : 1);
    expect(isComplete(state)).toBe(false);
  });
});
