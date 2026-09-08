import { describe, expect, it } from 'vitest';
import { combinations } from '../../src/engine/techniques/combinations';

describe('combinations', () => {
  it('produces every pair, in order', () => {
    expect(combinations([1, 2, 3], 2)).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it('produces the whole set when size equals length', () => {
    expect(combinations([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('produces nothing when size exceeds length', () => {
    expect(combinations([1, 2], 3)).toEqual([]);
  });

  it('produces nothing for size zero, not the empty combination', () => {
    expect(combinations([1, 2, 3], 0)).toEqual([]);
  });

  it('produces the expected count', () => {
    expect(combinations([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toHaveLength(84);
  });
});
