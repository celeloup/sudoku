import { describe, expect, it } from 'vitest';
import { claiming, pointing } from '../../src/engine/techniques/intersections';
import { bit } from '../../src/engine/grid';
import { emptyGrid } from '../helpers';

/** Remove `digit` as a candidate from every listed cell. */
function strip(g: ReturnType<typeof emptyGrid>, digit: number, cells: number[]): void {
  for (const c of cells) g.candidates[c]! &= ~bit(digit);
}

describe('pointing', () => {
  it('eliminates along a row when a box confines a digit to that row', () => {
    const g = emptyGrid();
    // Box 0 is cells 0,1,2,9,10,11,18,19,20. Confine 7 to row 0 within box 0.
    strip(g, 7, [9, 10, 11, 18, 19, 20]);
    const found = pointing(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 3));
    expect(d).toBeDefined();
    expect(d).toMatchObject({ technique: 'pointing', cost: 6 });
    // 7 must be removed from the rest of row 0 (cells 3..8), not from box 0.
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('eliminates along a column when a box confines a digit to that column', () => {
    const g = emptyGrid();
    // Confine 7 to column 0 within box 0.
    strip(g, 7, [1, 2, 10, 11, 19, 20]);
    const found = pointing(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 27));
    expect(d).toBeDefined();
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([27, 36, 45, 54, 63, 72]);
  });

  it('does not fire when the digit is spread across the box', () => {
    const g = emptyGrid();
    expect(pointing(g)).toBeNull();
  });

  it('fires the pointing-pair form: two cells (not three) confine the digit', () => {
    const g = emptyGrid();
    // Box 0 is cells 0,1,2,9,10,11,18,19,20. Strip 7 from cell 2 as well as
    // the rest of the box, so only cells 0 and 1 -- a pair, not a triple --
    // still carry it, both in row 0.
    strip(g, 7, [2, 9, 10, 11, 18, 19, 20]);
    const found = pointing(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 3));
    expect(d).toBeDefined();
    expect(d).toMatchObject({ technique: 'pointing', cost: 6, because: [0, 1] });
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('does not fire when there is nothing left to eliminate', () => {
    const g = emptyGrid();
    strip(g, 7, [9, 10, 11, 18, 19, 20]);
    strip(g, 7, [3, 4, 5, 6, 7, 8]);
    const found = pointing(g) ?? [];
    expect(found.some((d) => d.eliminations?.some((e) => e.value === 7))).toBe(false);
    // Guards against a regression that pushes a deduction with an empty
    // eliminations array once the confined row/column has nothing left to
    // strip: every reported deduction must eliminate at least one candidate.
    expect(found.every((d) => (d.eliminations?.length ?? 0) > 0)).toBe(true);
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    strip(g, 7, [9, 10, 11, 18, 19, 20]);
    const before = Uint16Array.from(g.candidates);
    pointing(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('claiming', () => {
  it('eliminates within a box when a row confines a digit to that box', () => {
    const g = emptyGrid();
    // In row 0, confine 7 to box 0 (cells 0,1,2) by stripping it from 3..8.
    strip(g, 7, [3, 4, 5, 6, 7, 8]);
    const found = claiming(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 9));
    expect(d).toBeDefined();
    expect(d).toMatchObject({ technique: 'claiming', cost: 6 });
    // 7 is removed from the rest of box 0 (rows 1 and 2 of that box).
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([9, 10, 11, 18, 19, 20]);
  });

  it('eliminates within a box when a column confines a digit to that box', () => {
    const g = emptyGrid();
    // In column 0, confine 7 to box 0 (cells 0,9,18) by stripping 27..72.
    strip(g, 7, [27, 36, 45, 54, 63, 72]);
    const found = claiming(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 1));
    expect(d).toBeDefined();
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([1, 2, 10, 11, 19, 20]);
  });

  it('does not fire on an untouched grid', () => {
    expect(claiming(emptyGrid())).toBeNull();
  });

  it('fires the claiming-pair form: two cells (not three) confine the digit', () => {
    const g = emptyGrid();
    // In row 0, strip 7 from cells 2..8 so only cells 0 and 1 -- a pair, not
    // a triple -- still carry it, both inside box 0.
    strip(g, 7, [2, 3, 4, 5, 6, 7, 8]);
    const found = claiming(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 9));
    expect(d).toBeDefined();
    expect(d).toMatchObject({ technique: 'claiming', cost: 6, because: [0, 1] });
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([9, 10, 11, 18, 19, 20]);
  });

  it('does not fire when there is nothing left to eliminate', () => {
    const g = emptyGrid();
    // Confine 7 to box 0 within row 0, then also strip 7 from the rest of
    // box 0 directly, leaving nothing for claiming to eliminate.
    strip(g, 7, [3, 4, 5, 6, 7, 8]);
    strip(g, 7, [9, 10, 11, 18, 19, 20]);
    const found = claiming(g) ?? [];
    expect(found.some((d) => d.eliminations?.some((e) => e.value === 7))).toBe(false);
    expect(found.every((d) => (d.eliminations?.length ?? 0) > 0)).toBe(true);
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    strip(g, 7, [3, 4, 5, 6, 7, 8]);
    const before = Uint16Array.from(g.candidates);
    claiming(g);
    expect(g.candidates).toEqual(before);
  });
});
