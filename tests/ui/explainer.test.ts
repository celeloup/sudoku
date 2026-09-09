import { describe, expect, it } from 'vitest';
import { describeNextStep } from '../../src/ui/explainer';
import { createPlayState, placeDigit } from '../../src/ui/play-state';
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

/**
 * A mid-solve snapshot of a medium puzzle (seed 'explainer-fixture-1'), advanced
 * by hand past every naked/hidden single so the cheapest remaining ladder entry
 * is naked-pair: `{ because: [3, 5], eliminations: [{ cell: 4, ... }] }`. The
 * elimination cell (4) is not one of the `because` cells (3, 5), which is what
 * distinguishes this fixture from the naked-single one above.
 */
const PAIR_SNAPSHOT =
  '068000302052003060413267598645001209297056003831902650174629835089100726026008941';

function pairPuzzle(): Puzzle {
  return {
    givens: valuesFrom(PAIR_SNAPSHOT),
    solution: new Uint8Array(81),
    difficulty: 'medium',
    score: 0,
    clueCount: valuesFrom(PAIR_SNAPSHOT).filter((v) => v !== 0).length,
    seed: 'explainer-fixture-1',
  };
}

describe('describeNextStep', () => {
  it('reports a contradictory position without throwing', () => {
    const state = createPlayState(puzzle());
    // Bypass placeDigit to write a conflicting digit directly into entries,
    // as toGrid would reject via placeDigit's given-cell guard.
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
      if (state.puzzle.givens[c] === 0) placeDigit(state, c, state.puzzle.solution[c]!);
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

  it('highlights elimination cells even when they are not among the "because" cells', () => {
    const state = createPlayState(pairPuzzle());
    const result = describeNextStep(state);
    expect(result.text).toBe(
      'Naked pair: r1c4, r1c6 hold only {4, 5}, so those digits are removed from r1c5.',
    );
    // The pattern cells ("because").
    expect(result.highlighted.has(3)).toBe(true);
    expect(result.highlighted.has(5)).toBe(true);
    // The elimination target cell, which is not in "because" — only reached by
    // the `for (const e of step.eliminations ?? [])` merge line.
    expect(result.highlighted.has(4)).toBe(true);
  });
});
