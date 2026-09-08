import { describe, expect, it } from 'vitest';
import { hiddenSingle, nakedSingle } from '../../src/engine/techniques/singles';
import { bit } from '../../src/engine/grid';
import { emptyGrid, gridFrom, only } from '../helpers';

describe('nakedSingle', () => {
  it('fires when a cell has exactly one candidate', () => {
    const g = emptyGrid();
    only(g, 40, [7]);
    const found = nakedSingle(g);
    expect(found).toHaveLength(1);
    expect(found![0]).toMatchObject({ technique: 'naked-single', cost: 1, cell: 40, value: 7 });
  });

  it('reports every naked single in one pass', () => {
    const g = emptyGrid();
    only(g, 0, [1]);
    only(g, 80, [9]);
    expect(nakedSingle(g)).toHaveLength(2);
  });

  it('does not fire when every cell has two or more candidates', () => {
    const g = emptyGrid();
    only(g, 40, [3, 7]);
    expect(nakedSingle(g)).toBeNull();
  });

  it('ignores already-filled cells', () => {
    const g = emptyGrid();
    g.values[40] = 7;
    g.candidates[40] = bit(7);
    expect(nakedSingle(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    only(g, 40, [7]);
    const before = Uint16Array.from(g.candidates);
    nakedSingle(g);
    expect(g.candidates).toEqual(before);
    expect(g.values[40]).toBe(0);
  });
});

describe('hiddenSingle', () => {
  it('fires when a digit fits only one cell in a unit', () => {
    const g = emptyGrid();
    // In row 0, only r1c5 can hold 4.
    for (const c of [0, 1, 2, 3, 5, 6, 7, 8]) g.candidates[c]! &= ~bit(4);
    const found = hiddenSingle(g);
    expect(found).not.toBeNull();
    expect(found!.some((d) => d.cell === 4 && d.value === 4)).toBe(true);
    expect(found![0]!.cost).toBe(2);
    expect(found![0]).toMatchObject({ technique: 'hidden-single', cost: 2, cell: 4, value: 4 });
  });

  it('does not fire on a fully open grid', () => {
    const g = emptyGrid();
    expect(hiddenSingle(g)).toBeNull();
  });

  it('does not fire for a digit already placed in the unit', () => {
    const g = emptyGrid();
    g.values[0] = 4;
    g.candidates[0] = 0;
    for (const c of [1, 2, 3, 5, 6, 7, 8]) g.candidates[c]! &= ~bit(4);
    // r1c5 is now the only *candidate* cell for 4 in row 0, but 4 is already
    // placed at r1c1, so the technique must not claim it again.
    expect(hiddenSingle(g)).toBeNull();
  });

  it('reports at most one deduction per cell', () => {
    const g = gridFrom(
      '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    );
    const found = hiddenSingle(g) ?? [];
    const cells = found.map((d) => d.cell);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    for (const c of [0, 1, 2, 3, 5, 6, 7, 8]) g.candidates[c]! &= ~bit(4);
    const beforeCandidates = Uint16Array.from(g.candidates);
    const beforeValues = Uint8Array.from(g.values);
    hiddenSingle(g);
    expect(g.candidates).toEqual(beforeCandidates);
    expect(g.values).toEqual(beforeValues);
  });
});
