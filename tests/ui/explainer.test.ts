import { describe, expect, it } from 'vitest';
import { describeNextStep } from '../../src/ui/explainer';
import { createPlayState, setEntry } from '../../src/ui/board';
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

/** A puzzle with a single given: too sparse for any ladder technique to fire. */
function sparsePuzzle(): Puzzle {
  const givens = new Uint8Array(81);
  givens[0] = 5;
  return {
    givens,
    solution: new Uint8Array(81),
    difficulty: 'easy',
    score: 0,
    clueCount: 1,
    seed: 'sparse',
  };
}

describe('describeNextStep', () => {
  it('reports a contradictory position without throwing', () => {
    const state = createPlayState(puzzle());
    // Bypass setEntry to write a conflicting digit directly into entries,
    // as toGrid would reject via setEntry's given-cell guard.
    state.entries[2] = 5; // r1c3 = 5, but r1c1 (a given) is already 5
    const result = describeNextStep(state);
    expect(result.text).toBe(
      'That position is contradictory — remove a conflicting digit before asking for a hint.',
    );
    expect(result.highlighted.size).toBe(0);
  });

  it('reports solved once every cell matches the solution', () => {
    const state = createPlayState(puzzle());
    for (let c = 0; c < 81; c++) {
      if (state.puzzle.givens[c] === 0) setEntry(state, c, state.puzzle.solution[c]!);
    }
    const result = describeNextStep(state);
    expect(result.text).toBe('Solved — nothing left to deduce.');
    expect(result.highlighted.size).toBe(0);
  });

  it('reports that no technique applies when the ladder stalls on an unsolved grid', () => {
    const state = createPlayState(sparsePuzzle());
    const result = describeNextStep(state);
    expect(result.text).toBe(
      'No technique in the ladder applies here. Either the position is wrong, or a digit you entered is incorrect.',
    );
    expect(result.highlighted.size).toBe(0);
  });

  it('describes and highlights the cheapest available deduction', () => {
    const state = createPlayState(puzzle());
    const result = describeNextStep(state);
    expect(result.text).toBe('Naked single: r5c5 = 5, the only digit that fits there.');
    expect(result.highlighted.has(40)).toBe(true);
  });
});
