import { describe, expect, it } from 'vitest';
import {
  conflicts,
  createPlayState,
  erase,
  isAnnotatable,
  isComplete,
  placeDigit,
  toGrid,
  toggleAnnotation,
} from '../../src/ui/play-state';
import { bit } from '../../src/engine';
import type { Puzzle } from '../../src/engine';
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

/** Cell 2 (r1c3) is empty in the fixture; cell 0 (r1c1) is a given holding 5. */
const FREE = 2;
const GIVEN = 0;

describe('createPlayState', () => {
  it('starts with no entries, marks, or shadow', () => {
    const state = createPlayState(puzzle());
    expect([...state.entries].every((v) => v === 0)).toBe(true);
    expect([...state.marks].every((v) => v === 0)).toBe(true);
    expect([...state.shadow].every((v) => v === 0)).toBe(true);
  });
});

describe('the worked example from the spec', () => {
  it('steps Annotating -> Filled -> Annotating -> Empty -> Empty', () => {
    const s = createPlayState(puzzle());

    toggleAnnotation(s, FREE, 3);
    toggleAnnotation(s, FREE, 5);
    expect(s.marks[FREE]).toBe(bit(3) | bit(5));
    expect(s.entries[FREE]).toBe(0);

    placeDigit(s, FREE, 5);
    expect(s.entries[FREE]).toBe(5);
    expect(s.marks[FREE]).toBe(0);
    expect(s.shadow[FREE]).toBe(bit(3) | bit(5));

    erase(s, FREE);
    expect(s.entries[FREE]).toBe(0);
    expect(s.marks[FREE]).toBe(bit(3) | bit(5));
    expect(s.shadow[FREE]).toBe(0);

    erase(s, FREE);
    expect(s.marks[FREE]).toBe(0);

    erase(s, FREE);
    expect(s.entries[FREE]).toBe(0);
    expect(s.marks[FREE]).toBe(0);
    expect(s.shadow[FREE]).toBe(0);
  });
});

describe('placeDigit', () => {
  it('records a digit in an empty cell', () => {
    const state = createPlayState(puzzle());
    placeDigit(state, FREE, 4);
    expect(state.entries[FREE]).toBe(4);
  });

  it('from Empty leaves no shadow', () => {
    const s = createPlayState(puzzle());
    placeDigit(s, FREE, 7);
    expect(s.entries[FREE]).toBe(7);
    expect(s.shadow[FREE]).toBe(0);
  });

  it('from Annotating moves the annotations into the shadow', () => {
    const s = createPlayState(puzzle());
    toggleAnnotation(s, FREE, 1);
    placeDigit(s, FREE, 7);
    expect(s.marks[FREE]).toBe(0);
    expect(s.shadow[FREE]).toBe(bit(1));
  });

  it('from Filled keeps the ORIGINAL shadow, so a change of mind is safe', () => {
    const s = createPlayState(puzzle());
    toggleAnnotation(s, FREE, 3);
    toggleAnnotation(s, FREE, 5);
    placeDigit(s, FREE, 5);
    placeDigit(s, FREE, 7);
    expect(s.entries[FREE]).toBe(7);
    expect(s.shadow[FREE]).toBe(bit(3) | bit(5));
    erase(s, FREE);
    expect(s.marks[FREE]).toBe(bit(3) | bit(5));
  });

  it('refuses to touch a given', () => {
    const s = createPlayState(puzzle());
    placeDigit(s, GIVEN, 9);
    expect(s.entries[GIVEN]).toBe(0);
  });
});

describe('toggleAnnotation', () => {
  it('adds then removes', () => {
    const s = createPlayState(puzzle());
    toggleAnnotation(s, FREE, 4);
    expect(s.marks[FREE]! & bit(4)).not.toBe(0);
    toggleAnnotation(s, FREE, 4);
    expect(s.marks[FREE]! & bit(4)).toBe(0);
  });

  it('is a no-op on a Filled cell — erase first', () => {
    const s = createPlayState(puzzle());
    placeDigit(s, FREE, 7);
    toggleAnnotation(s, FREE, 4);
    expect(s.marks[FREE]).toBe(0);
    expect(s.entries[FREE]).toBe(7);
  });

  it('refuses to touch a given', () => {
    const s = createPlayState(puzzle());
    toggleAnnotation(s, GIVEN, 4);
    expect(s.marks[GIVEN]).toBe(0);
  });
});

describe('erase', () => {
  it('from Filled with no shadow lands on Empty, not Annotating', () => {
    const s = createPlayState(puzzle());
    placeDigit(s, FREE, 7);
    erase(s, FREE);
    expect(s.entries[FREE]).toBe(0);
    expect(s.marks[FREE]).toBe(0);
  });

  it('refuses to touch a given', () => {
    const s = createPlayState(puzzle());
    erase(s, GIVEN);
    expect(s.puzzle.givens[GIVEN]).toBe(5);
  });
});

describe('isAnnotatable', () => {
  it('is false for a given', () => {
    expect(isAnnotatable(createPlayState(puzzle()), GIVEN)).toBe(false);
  });

  it('is true for an empty cell and false once it is filled', () => {
    const s = createPlayState(puzzle());
    expect(isAnnotatable(s, FREE)).toBe(true);
    placeDigit(s, FREE, 7);
    expect(isAnnotatable(s, FREE)).toBe(false);
    erase(s, FREE);
    expect(isAnnotatable(s, FREE)).toBe(true);
  });
});

describe('toGrid', () => {
  it('gives givens precedence over entries', () => {
    const state = createPlayState(puzzle());
    state.entries[GIVEN] = 9; // bypass placeDigit to prove toGrid also guards
    expect(toGrid(state).values[GIVEN]).toBe(5);
  });

  it('includes player entries', () => {
    const state = createPlayState(puzzle());
    placeDigit(state, FREE, 4);
    expect(toGrid(state).values[FREE]).toBe(4);
  });

  it('ignores pencil marks entirely', () => {
    const a = createPlayState(puzzle());
    const b = createPlayState(puzzle());
    toggleAnnotation(b, FREE, 1);
    toggleAnnotation(b, FREE, 9);
    expect(toGrid(a).values).toEqual(toGrid(b).values);
    expect(toGrid(a).candidates).toEqual(toGrid(b).candidates);
  });

  it('computes real candidates rather than trusting marks', () => {
    const state = createPlayState(puzzle());
    toggleAnnotation(state, FREE, 5); // 5 is impossible at r1c3: r1c1 is 5
    expect(toGrid(state).candidates[FREE]! & bit(5)).toBe(0);
  });

  it('ignores shadow as well as marks', () => {
    const a = createPlayState(puzzle());
    const b = createPlayState(puzzle());
    toggleAnnotation(b, FREE, 1);
    placeDigit(b, FREE, 4);
    erase(b, FREE);
    erase(b, FREE);
    expect(toGrid(a).values).toEqual(toGrid(b).values);
    expect(toGrid(a).candidates).toEqual(toGrid(b).candidates);
  });
});

describe('conflicts', () => {
  it('is empty for a fresh puzzle', () => {
    expect(conflicts(createPlayState(puzzle())).size).toBe(0);
  });

  it('flags both cells when a player entry duplicates a peer', () => {
    const state = createPlayState(puzzle());
    placeDigit(state, FREE, 5); // r1c3 = 5, but r1c1 is already 5
    const bad = conflicts(state);
    expect(bad.has(FREE)).toBe(true);
    expect(bad.has(GIVEN)).toBe(true);
  });

  it('does not flag a correct entry', () => {
    const state = createPlayState(puzzle());
    placeDigit(state, FREE, 4);
    expect(conflicts(state).has(FREE)).toBe(false);
  });
});

describe('isComplete', () => {
  it('is false for a fresh puzzle', () => {
    expect(isComplete(createPlayState(puzzle()))).toBe(false);
  });

  it('is true once every cell matches the solution', () => {
    const state = createPlayState(puzzle());
    for (let c = 0; c < 81; c++) {
      if (state.puzzle.givens[c] === 0) placeDigit(state, c, state.puzzle.solution[c]!);
    }
    expect(isComplete(state)).toBe(true);
  });

  it('is false when the grid is full but wrong', () => {
    const state = createPlayState(puzzle());
    for (let c = 0; c < 81; c++) {
      if (state.puzzle.givens[c] === 0) placeDigit(state, c, state.puzzle.solution[c]!);
    }
    const firstEmpty = [...state.puzzle.givens].findIndex((v) => v === 0);
    placeDigit(state, firstEmpty, state.puzzle.solution[firstEmpty] === 1 ? 2 : 1);
    expect(isComplete(state)).toBe(false);
  });
});
