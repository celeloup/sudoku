import { describe, expect, it } from 'vitest';
import { countSolutions, solveValues } from '../src/engine/solver-brute';
import { valuesFrom } from './helpers';

const WIKI_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const WIKI_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

interface Rectangle {
  i: number;
  j: number;
  p: number;
  q: number;
}

/**
 * Finds two rows i < j sharing a box-row (band) and two columns p < q in
 * different box-columns (stacks), such that s[i][p] === s[j][q] and
 * s[i][q] === s[j][p]. Those four cells form an unavoidable rectangle in a
 * completed grid: blanking them leaves exactly two consistent fillings (the
 * original, and the 2x2 diagonal swap).
 *
 * Both constraints are required, not just the column one: with the swap
 * a/b -> b/a at (i,p)/(i,q)/(j,p)/(j,q), a box that contains only one of the
 * four cells would gain a duplicate digit. Column p and column q are forced
 * into different boxes so that box(i,p) !== box(i,q); requiring i and j to
 * share a box-row then forces box(i,p) === box(j,p) and box(i,q) === box(j,q),
 * so every affected box contains exactly two of the four cells and the swap
 * stays valid. Without the shared box-row, the swap can break box uniqueness
 * (this was confirmed empirically: dropping the row constraint below yields a
 * "rectangle" whose blanked grid has only 1 solution, not 2).
 */
function findRectangle(s: string): Rectangle | undefined {
  for (let i = 0; i < 9; i++) {
    for (let j = i + 1; j < 9; j++) {
      if (Math.floor(i / 3) !== Math.floor(j / 3)) continue;
      for (let p = 0; p < 9; p++) {
        for (let q = p + 1; q < 9; q++) {
          if (Math.floor(p / 3) === Math.floor(q / 3)) continue;
          if (s[i * 9 + p] === s[j * 9 + q] && s[i * 9 + q] === s[j * 9 + p]) {
            return { i, j, p, q };
          }
        }
      }
    }
  }
  return undefined;
}

describe('solveValues', () => {
  it('solves a known puzzle to the known solution', () => {
    expect(solveValues(valuesFrom(WIKI_PUZZLE))).toEqual(valuesFrom(WIKI_SOLUTION));
  });

  it('returns an already-solved grid unchanged', () => {
    expect(solveValues(valuesFrom(WIKI_SOLUTION))).toEqual(valuesFrom(WIKI_SOLUTION));
  });

  it('solves the empty grid', () => {
    const solved = solveValues(new Uint8Array(81));
    expect(solved).not.toBeNull();
    for (let c = 0; c < 81; c++) expect(solved![c]).toBeGreaterThan(0);
  });

  it('returns null for an unsolvable grid', () => {
    // Two 5s in row 1 makes the grid contradictory.
    const bad = new Uint8Array(81);
    bad[0] = 5;
    bad[1] = 5;
    expect(solveValues(bad)).toBeNull();
  });

  it('does not mutate its input', () => {
    const input = valuesFrom(WIKI_PUZZLE);
    solveValues(input);
    expect(input).toEqual(valuesFrom(WIKI_PUZZLE));
  });
});

describe('countSolutions', () => {
  it('finds exactly one solution for a proper puzzle', () => {
    expect(countSolutions(valuesFrom(WIKI_PUZZLE), 2)).toBe(1);
  });

  it('finds zero for a contradictory grid', () => {
    const bad = new Uint8Array(81);
    bad[0] = 5;
    bad[1] = 5;
    expect(countSolutions(bad, 2)).toBe(0);
  });

  it('stops at the cap for a grid with many solutions', () => {
    expect(countSolutions(new Uint8Array(81), 2)).toBe(2);
    expect(countSolutions(new Uint8Array(81), 5)).toBe(5);
  });

  it('detects a puzzle with exactly two solutions via an unavoidable rectangle', () => {
    // Locate an unavoidable rectangle in the solved grid (see findRectangle),
    // blank its four cells, and assert the resulting puzzle has exactly two
    // solutions: the original and the 2x2 diagonal swap. This is constructed,
    // not guessed, so the test can actually fail against a solver that always
    // reports 1.
    const rect = findRectangle(WIKI_SOLUTION);
    expect(rect).toBeDefined();

    const values = valuesFrom(WIKI_SOLUTION);
    const { i, j, p, q } = rect!;
    values[i * 9 + p] = 0;
    values[i * 9 + q] = 0;
    values[j * 9 + p] = 0;
    values[j * 9 + q] = 0;

    expect(countSolutions(values, 3)).toBe(2);
  });

  it('does not mutate its input', () => {
    const input = valuesFrom(WIKI_PUZZLE);
    countSolutions(input, 2);
    expect(input).toEqual(valuesFrom(WIKI_PUZZLE));
  });
});
