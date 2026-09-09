import { describe, expect, it } from 'vitest';
import { distribute, generateSet } from '../src/engine/batch';
import { InvalidMixError } from '../src/engine/errors';
import { generatePuzzle } from '../src/engine/generator';

describe('distribute', () => {
  it('splits evenly when the percentages divide cleanly', () => {
    expect(distribute(30, { medium: 60, hard: 40 })).toEqual({
      easy: 0,
      medium: 18,
      hard: 12,
      expert: 0,
    });
  });

  it('uses largest-remainder rounding and always totals count', () => {
    const result = distribute(10, { easy: 33, medium: 33, hard: 34 });
    expect(result.easy + result.medium + result.hard + result.expert).toBe(10);
    expect(result).toEqual({ easy: 3, medium: 3, hard: 4, expert: 0 });
  });

  it('always totals count for awkward splits', () => {
    for (const count of [1, 7, 13, 50]) {
      const result = distribute(count, { easy: 25, medium: 25, hard: 25, expert: 25 });
      const total = result.easy + result.medium + result.hard + result.expert;
      expect(total).toBe(count);
    }
  });

  it('treats omitted tiers as zero', () => {
    expect(distribute(4, { expert: 100 })).toEqual({
      easy: 0,
      medium: 0,
      hard: 0,
      expert: 4,
    });
  });

  it('rejects a mix that does not sum to 100', () => {
    expect(() => distribute(10, { easy: 50, medium: 40 })).toThrow(InvalidMixError);
    expect(() => distribute(10, { easy: 60, medium: 50 })).toThrow(InvalidMixError);
  });

  it('rejects an empty mix', () => {
    expect(() => distribute(10, {})).toThrow(InvalidMixError);
  });

  it('rejects negative percentages', () => {
    expect(() => distribute(10, { easy: 120, medium: -20 })).toThrow(InvalidMixError);
  });

  it('rejects a NaN percentage instead of silently passing it through', () => {
    // Math.abs(NaN - 100) > 1e-9 is false, so a naive range check on the sum
    // lets this slip past unnoticed -- the guard must reject non-finite
    // percentages explicitly, per-tier, before the sum check runs.
    expect(() => distribute(10, { easy: NaN, medium: 100 })).toThrow(InvalidMixError);
  });

  it('rejects an Infinity percentage', () => {
    expect(() => distribute(10, { easy: Infinity, medium: 100 })).toThrow(InvalidMixError);
    expect(() => distribute(10, { easy: -Infinity, medium: 100 })).toThrow(InvalidMixError);
  });

  it('rejects a non-positive or non-integer count', () => {
    expect(() => distribute(0, { easy: 100 })).toThrow(InvalidMixError);
    expect(() => distribute(-1, { easy: 100 })).toThrow(InvalidMixError);
    expect(() => distribute(1.5, { easy: 100 })).toThrow(InvalidMixError);
  });
});

describe('generateSet', () => {
  it('returns exactly count puzzles in the requested proportions', () => {
    const set = generateSet({ count: 4, mix: { easy: 50, medium: 50 }, seed: 'set-a' });
    expect(set).toHaveLength(4);
    expect(set.filter((p) => p.difficulty === 'easy')).toHaveLength(2);
    expect(set.filter((p) => p.difficulty === 'medium')).toHaveLength(2);
  });

  it('is deterministic for a given seed', () => {
    const a = generateSet({ count: 3, mix: { easy: 100 }, seed: 'set-b' });
    const b = generateSet({ count: 3, mix: { easy: 100 }, seed: 'set-b' });
    expect(a.map((p) => [...p.givens])).toEqual(b.map((p) => [...p.givens]));
  });

  it('gives each puzzle a distinct indexed seed', () => {
    const set = generateSet({ count: 3, mix: { easy: 100 }, seed: 'set-c' });
    expect(set.map((p) => p.seed)).toEqual(['set-c:0', 'set-c:1', 'set-c:2']);
    expect(new Set(set.map((p) => [...p.givens].join())).size).toBe(3);
  });

  it('lets a single puzzle be regenerated in isolation from its seed', () => {
    const set = generateSet({ count: 3, mix: { easy: 100 }, seed: 'set-d' });
    const target = set[1]!;
    const again = generatePuzzle({ difficulty: target.difficulty, seed: target.seed });
    expect(again.givens).toEqual(target.givens);
  });

  it('propagates mix validation errors', () => {
    expect(() => generateSet({ count: 2, mix: { easy: 30 } })).toThrow(InvalidMixError);
  });
});
