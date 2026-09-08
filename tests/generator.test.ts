import { describe, expect, it } from 'vitest';
import { SYMMETRIC_UNITS, generateFullGrid, generatePuzzle } from '../src/engine/generator';
import { GenerationError } from '../src/engine/errors';
import { grade } from '../src/engine/grader';
import { gridFromValues } from '../src/engine/grid';
import { countSolutions } from '../src/engine/solver-brute';
import { makeRng } from '../src/engine/rng';
import type { Difficulty } from '../src/engine/types';

const TIERS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

describe('SYMMETRIC_UNITS', () => {
  it('covers all 81 cells exactly once across 41 units', () => {
    expect(SYMMETRIC_UNITS).toHaveLength(41);
    const seen = new Set<number>();
    for (const unit of SYMMETRIC_UNITS) for (const c of unit) seen.add(c);
    expect(seen.size).toBe(81);
  });

  it('pairs each cell with its 180-degree partner', () => {
    for (const unit of SYMMETRIC_UNITS) {
      if (unit.length === 1) {
        expect(unit[0]).toBe(40);
      } else {
        expect(unit).toHaveLength(2);
        expect(unit[0]! + unit[1]!).toBe(80);
      }
    }
  });
});

describe('generateFullGrid', () => {
  it('produces a complete, valid grid', () => {
    const values = generateFullGrid(makeRng('full'));
    expect(values).toHaveLength(81);
    for (let c = 0; c < 81; c++) expect(values[c]).toBeGreaterThan(0);
    expect(() => gridFromValues(values)).not.toThrow();
  });

  it('produces the same grid for the same seed', () => {
    expect(generateFullGrid(makeRng('same'))).toEqual(generateFullGrid(makeRng('same')));
  });

  it('produces different grids for different seeds', () => {
    expect(generateFullGrid(makeRng('one'))).not.toEqual(generateFullGrid(makeRng('two')));
  });
});

describe('generatePuzzle', () => {
  for (const difficulty of TIERS) {
    describe(`tier ${difficulty}`, () => {
      it('produces a puzzle that grades back to the requested tier', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `tier-${difficulty}` });
        expect(puzzle.difficulty).toBe(difficulty);
        expect(grade(gridFromValues(puzzle.givens)).difficulty).toBe(difficulty);
      });

      it('produces a puzzle with exactly one solution', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `unique-${difficulty}` });
        expect(countSolutions(puzzle.givens, 2)).toBe(1);
      });

      it('is 180-degree rotationally symmetric in its givens', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `sym-${difficulty}` });
        for (let c = 0; c < 81; c++) {
          expect(puzzle.givens[c] !== 0).toBe(puzzle.givens[80 - c] !== 0);
        }
      });

      it('carries a solution that matches its givens', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `sol-${difficulty}` });
        for (let c = 0; c < 81; c++) {
          if (puzzle.givens[c] !== 0) expect(puzzle.solution[c]).toBe(puzzle.givens[c]);
        }
        expect(() => gridFromValues(puzzle.solution)).not.toThrow();
        for (let c = 0; c < 81; c++) expect(puzzle.solution[c]).toBeGreaterThan(0);
      });

      it('reports a clue count matching its givens', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `clues-${difficulty}` });
        const actual = [...puzzle.givens].filter((v) => v !== 0).length;
        expect(puzzle.clueCount).toBe(actual);
        expect(puzzle.clueCount).toBeGreaterThan(16);
        expect(puzzle.clueCount).toBeLessThan(81);
      });
    });
  }

  it('is deterministic: the same seed gives byte-identical givens', () => {
    const a = generatePuzzle({ difficulty: 'medium', seed: 'repeat-me' });
    const b = generatePuzzle({ difficulty: 'medium', seed: 'repeat-me' });
    expect(a.givens).toEqual(b.givens);
    expect(a.solution).toEqual(b.solution);
    expect(a.score).toBe(b.score);
    expect(a.clueCount).toBe(b.clueCount);
  });

  it('gives different puzzles for different seeds', () => {
    const a = generatePuzzle({ difficulty: 'medium', seed: 'seed-a' });
    const b = generatePuzzle({ difficulty: 'medium', seed: 'seed-b' });
    expect(a.givens).not.toEqual(b.givens);
  });

  it('records the seed it used when none was supplied', () => {
    const puzzle = generatePuzzle({ difficulty: 'easy' });
    expect(puzzle.seed.length).toBeGreaterThan(0);
    const again = generatePuzzle({ difficulty: 'easy', seed: puzzle.seed });
    expect(again.givens).toEqual(puzzle.givens);
  });

  it('reports a positive score', () => {
    expect(generatePuzzle({ difficulty: 'medium', seed: 'score' }).score).toBeGreaterThan(0);
  });

  it('throws GenerationError carrying diagnostics when the budget is exhausted', () => {
    // A budget of zero milliseconds cannot succeed.
    expect(() =>
      generatePuzzle({ difficulty: 'expert', seed: 'x', budgetMs: 0, maxAttempts: 0 }),
    ).toThrow(GenerationError);
    try {
      generatePuzzle({ difficulty: 'expert', seed: 'x', budgetMs: 0, maxAttempts: 0 });
    } catch (err) {
      expect(err).toBeInstanceOf(GenerationError);
      expect((err as GenerationError).attempts).toBe(0);
    }
  });

  it('reports a null bestTier diagnostic when the budget expires before any attempt', () => {
    // budgetMs: 0 with maxAttempts > 0 exercises the budget half of the while
    // condition (rather than the maxAttempts half covered above), and still
    // never runs the loop body, so bestTier stays null.
    expect(() =>
      generatePuzzle({ difficulty: 'expert', seed: 'y', budgetMs: 0, maxAttempts: 5 }),
    ).toThrow(GenerationError);
    try {
      generatePuzzle({ difficulty: 'expert', seed: 'y', budgetMs: 0, maxAttempts: 5 });
    } catch (err) {
      expect(err).toBeInstanceOf(GenerationError);
      expect((err as GenerationError).attempts).toBe(0);
      expect((err as GenerationError).bestTier).toBeNull();
    }
  });
});

describe('no unseeded randomness', () => {
  it('never calls Math.random during seeded generation', () => {
    const original = Math.random;
    let called = 0;
    Math.random = () => {
      called++;
      return original();
    };
    try {
      generatePuzzle({ difficulty: 'medium', seed: 'no-math-random' });
    } finally {
      Math.random = original;
    }
    expect(called).toBe(0);
  });
});
