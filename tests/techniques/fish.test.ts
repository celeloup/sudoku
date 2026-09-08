import { describe, expect, it } from 'vitest';
import { swordfish, xWing } from '../../src/engine/techniques/fish';
import { bit } from '../../src/engine/grid';
import { emptyGrid } from '../helpers';

/** Leave `digit` as a candidate only in `keep`; strip it everywhere else. */
function confine(g: ReturnType<typeof emptyGrid>, digit: number, keep: number[]): void {
  const keepSet = new Set(keep);
  for (let c = 0; c < 81; c++) if (!keepSet.has(c)) g.candidates[c]! &= ~bit(digit);
}

describe('xWing', () => {
  it('fires on two rows sharing the same two columns', () => {
    const g = emptyGrid();
    // Digit 4 in rows 0 and 4 sits only in columns 1 and 7, plus decoys in
    // other rows of those columns that the X-Wing will eliminate. Cells 12
    // and 30 give rows 1 and 3 a third position each, which disqualifies
    // them as base rows (n > size), leaving rows 0 and 4 as the only usable
    // pair.
    confine(g, 4, [1, 7, 10, 12, 16, 28, 30, 34, 37, 43]);
    const found = xWing(g);
    expect(found).not.toBeNull();
    expect(found).toHaveLength(1);
    const d = found![0]!;
    expect(d.technique).toBe('x-wing');
    expect(d.cost).toBe(15);
    const cells = d.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([10, 16, 28, 34]);
    for (const e of d.eliminations!) expect(e.value).toBe(4);
  });

  it('does not fire when the two rows use three columns', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 7, 37, 44]);
    expect(xWing(g)).toBeNull();
  });

  it('does not fire when there is nothing to eliminate', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 7, 37, 43]);
    expect(xWing(g)).toBeNull();
  });

  it('finds column-based X-Wings too', () => {
    const g = emptyGrid();
    // Digit 4 in columns 0 and 4 sits only in rows 1 and 7, with decoys in
    // those rows that must be eliminated. Cells 28 and 29 give columns 1
    // and 2 a third position each, which disqualifies them as base
    // columns, leaving columns 0 and 4 as the only usable pair.
    confine(g, 4, [9, 13, 63, 67, 10, 11, 64, 65, 28, 29]);
    const found = xWing(g);
    expect(found).not.toBeNull();
    expect(found).toHaveLength(1);
    const d = found![0]!;
    expect(d.technique).toBe('x-wing');
    const cells = d.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([10, 11, 64, 65]);
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 7, 37, 43, 10, 16]);
    const before = Uint16Array.from(g.candidates);
    xWing(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('swordfish', () => {
  it('fires on three rows covering three columns', () => {
    const g = emptyGrid();
    // Rows 0, 3, 6 hold digit 4 only within columns 1, 4, 7, and column 1
    // carries a decoy in row 1 that the swordfish eliminates.
    confine(g, 4, [1, 4, 31, 34, 58, 61, 10]);
    const found = swordfish(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('swordfish');
    expect(d.cost).toBe(22);
    expect(d.eliminations!.some((e) => e.cell === 10 && e.value === 4)).toBe(true);
  });

  it('does not fire when the three rows use four columns', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 4, 31, 34, 58, 62, 10]);
    // Rows 0, 3, 6 now cover four columns (1, 4, 7, 8) so the row-oriented
    // combo is rejected, and the only usable columns (1 and 4) are one
    // short of a triple, so no swordfish exists anywhere on this board.
    expect(swordfish(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 4, 31, 34, 58, 61, 10]);
    const before = Uint16Array.from(g.candidates);
    swordfish(g);
    expect(g.candidates).toEqual(before);
  });
});
