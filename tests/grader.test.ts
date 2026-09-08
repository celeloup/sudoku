import { describe, expect, it } from 'vitest';
import { LADDER, grade, nextStep } from '../src/engine/grader';
import { applyDeduction, cloneGrid, gridFromValues, isSolved } from '../src/engine/grid';
import { TIER_ORDER } from '../src/engine/types';
import { emptyGrid, gridFrom, only, valuesFrom } from './helpers';

const WIKI_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const WIKI_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('LADDER', () => {
  it('is ordered by non-decreasing cost', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i]!.cost).toBeGreaterThanOrEqual(LADDER[i - 1]!.cost);
    }
  });

  it('is ordered by non-decreasing tier', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(TIER_ORDER[LADDER[i]!.tier]).toBeGreaterThanOrEqual(TIER_ORDER[LADDER[i - 1]!.tier]);
    }
  });

  it('uses the exact costs from the spec', () => {
    const costs = Object.fromEntries(LADDER.map((e) => [e.name, e.cost]));
    expect(costs).toEqual({
      'naked-single': 1,
      'hidden-single': 2,
      'naked-pair': 5,
      pointing: 6,
      claiming: 6,
      'naked-triple': 8,
      'hidden-pair': 10,
      'naked-quad': 12,
      'hidden-triple': 12,
      'x-wing': 15,
      swordfish: 22,
      'xy-wing': 24,
      'xyz-wing': 26,
    });
  });
});

describe('grade', () => {
  it('grades a singles-only puzzle as easy and solves it', () => {
    const result = grade(gridFrom(WIKI_PUZZLE));
    expect(result.outcome).toBe('solved');
    expect(result.difficulty).toBe('easy');
    expect(result.score).toBeGreaterThan(0);
    expect(result.path.every((d) => ['naked-single', 'hidden-single'].includes(d.technique))).toBe(
      true,
    );
  });

  it('grades an already-solved grid as easy with an empty path', () => {
    const result = grade(gridFrom(WIKI_SOLUTION));
    expect(result.outcome).toBe('solved');
    expect(result.difficulty).toBe('easy');
    expect(result.path).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('replays its path back to the solution', () => {
    const start = gridFrom(WIKI_PUZZLE);
    const result = grade(start);
    const replay = cloneGrid(start);
    for (const deduction of result.path) applyDeduction(replay, deduction);
    expect(isSolved(replay)).toBe(true);
    expect(replay.values).toEqual(valuesFrom(WIKI_SOLUTION));
  });

  it('does not mutate the grid it is given', () => {
    const g = gridFrom(WIKI_PUZZLE);
    const before = Uint8Array.from(g.values);
    grade(g);
    expect(g.values).toEqual(before);
  });

  it('scores the sum of the applied deduction costs', () => {
    const result = grade(gridFrom(WIKI_PUZZLE));
    const expected = result.path.reduce((sum, d) => sum + d.cost, 0);
    expect(result.score).toBe(expected);
  });

  it('reports stalled on a grid no technique can advance', () => {
    // Only two givens: nothing is forced, so the ladder cannot move.
    const values = new Uint8Array(81);
    values[0] = 1;
    values[1] = 2;
    const result = grade(gridFromValues(values));
    expect(result.outcome).toBe('stalled');
  });

  it('reports exceeded-max-tier when a harder technique is required', () => {
    // Cells 0 and 1 both hold exactly {3,7}; every other cell keeps all nine
    // candidates. No cell has one candidate, so nakedSingle cannot fire. No
    // digit is confined to a single cell in any unit, so hiddenSingle cannot
    // fire. nakedPair does fire on cells 0 and 1 (they share row 0 and box 0,
    // and cells 2-8 of that row still carry 3 and 7 to eliminate); its tier
    // is 'medium', which exceeds the 'easy' ceiling before any deduction is
    // applied.
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    const result = grade(g, { maxTier: 'easy' });
    expect(result.outcome).toBe('exceeded-max-tier');
    expect(result.path).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('honours maxTier by refusing techniques above it', () => {
    // Same two-cell fixture as above, but with maxTier raised to 'medium' so
    // the ladder is allowed to proceed. nakedPair fires once per unit
    // containing both cells (row 0 and box 0), eliminating 3 and 7 from the
    // rest of that row and box. After that pass nothing else can fire: no
    // cell reaches a single candidate, no digit is confined to one cell in
    // any unit, no further naked subset unions to a matching size (every
    // other cell shares an identical wide candidate set), and there are only
    // two bivalue cells in the whole grid (both {3,7}), too few to form an
    // XY-Wing and none tri-valued for an XYZ-Wing. So the grid stalls with
    // exactly the two medium-tier naked-pair deductions applied.
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    const result = grade(g, { maxTier: 'medium' });
    expect(result.outcome).toBe('stalled');
    expect(result.path.length).toBeGreaterThan(0);
    for (const d of result.path) {
      const entry = LADDER.find((e) => e.name === d.technique);
      expect(entry).toBeDefined();
      expect(TIER_ORDER[entry!.tier]).toBeLessThanOrEqual(TIER_ORDER.medium);
    }
  });
});

describe('nextStep', () => {
  it('returns the cheapest available deduction', () => {
    const step = nextStep(gridFrom(WIKI_PUZZLE));
    expect(step).not.toBeNull();
    expect(['naked-single', 'hidden-single']).toContain(step!.technique);
    expect(step!.text.length).toBeGreaterThan(0);
  });

  it('returns null on a solved grid', () => {
    expect(nextStep(gridFrom(WIKI_SOLUTION))).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = gridFrom(WIKI_PUZZLE);
    const before = Uint16Array.from(g.candidates);
    nextStep(g);
    expect(g.candidates).toEqual(before);
  });
});
