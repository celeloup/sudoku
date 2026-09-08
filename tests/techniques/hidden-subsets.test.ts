import { describe, expect, it } from 'vitest';
import { hiddenPair, hiddenTriple } from '../../src/engine/techniques/hidden-subsets';
import { bit } from '../../src/engine/grid';
import { emptyGrid } from '../helpers';

/** Remove `digit` as a candidate from every listed cell. */
function strip(g: ReturnType<typeof emptyGrid>, digit: number, cells: number[]): void {
  for (const c of cells) g.candidates[c]! &= ~bit(digit);
}

describe('hiddenPair', () => {
  it('fires when two digits are confined to the same two cells in a unit', () => {
    const g = emptyGrid();
    // In row 0, digits 4 and 5 can only appear in r1c1 and r1c2.
    strip(g, 4, [2, 3, 4, 5, 6, 7, 8]);
    strip(g, 5, [2, 3, 4, 5, 6, 7, 8]);
    const found = hiddenPair(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.because.includes(0) && x.because.includes(1));
    expect(d).toBeDefined();
    expect(d!.technique).toBe('hidden-pair');
    expect(d!.cost).toBe(10);
    // Everything except 4 and 5 is removed from r1c1 and r1c2.
    for (const e of d!.eliminations!) {
      expect([0, 1]).toContain(e.cell);
      expect([4, 5]).not.toContain(e.value);
    }
    expect(d!.eliminations!.some((e) => e.cell === 0 && e.value === 1)).toBe(true);
  });

  it('does not fire when the two digits reach three cells', () => {
    const g = emptyGrid();
    strip(g, 4, [3, 4, 5, 6, 7, 8]);
    strip(g, 5, [3, 4, 5, 6, 7, 8]);
    expect(hiddenPair(g)).toBeNull();
  });

  it('does not fire when the cells hold nothing else to remove', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    g.candidates[0] = bit(4) | bit(5);
    g.candidates[1] = bit(4) | bit(5);
    expect(hiddenPair(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    strip(g, 4, [2, 3, 4, 5, 6, 7, 8]);
    strip(g, 5, [2, 3, 4, 5, 6, 7, 8]);
    const before = Uint16Array.from(g.candidates);
    hiddenPair(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('hiddenTriple', () => {
  it('fires when three digits are confined to the same three cells', () => {
    const g = emptyGrid();
    for (const digit of [4, 5, 6]) strip(g, digit, [3, 4, 5, 6, 7, 8]);
    const found = hiddenTriple(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.because.join() === '0,1,2');
    expect(d).toBeDefined();
    expect(d).toMatchObject({ technique: 'hidden-triple', cost: 12 });
    for (const e of d!.eliminations!) {
      expect([0, 1, 2]).toContain(e.cell);
      expect([4, 5, 6]).not.toContain(e.value);
    }
  });

  it('does not fire when the three digits reach four cells', () => {
    const g = emptyGrid();
    for (const digit of [4, 5, 6]) strip(g, digit, [4, 5, 6, 7, 8]);
    expect(hiddenTriple(g)).toBeNull();
  });
});
