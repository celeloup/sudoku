import { describe, expect, it } from 'vitest';
import { nakedPair, nakedQuad, nakedTriple } from '../../src/engine/techniques/naked-subsets';
import { emptyGrid, only } from '../helpers';

describe('nakedPair', () => {
  it('fires when two cells in a unit share the same two candidates', () => {
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    const found = nakedPair(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('naked-pair');
    expect(d.cost).toBe(5);
    // 3 and 7 are removed from the other cells of row 0 and box 0.
    for (const e of d.eliminations!) {
      expect([3, 7]).toContain(e.value);
      expect([0, 1]).not.toContain(e.cell);
    }
    expect(d.eliminations!.some((e) => e.cell === 2 && e.value === 3)).toBe(true);
  });

  it('does not fire when the two cells hold three digits between them', () => {
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 1, [3, 9]);
    // Every other cell on the board is still fully open (9 candidates), so no
    // pair of cells anywhere shares an exact 2-digit union: nothing fires at all.
    expect(nakedPair(g)).toBeNull();
  });

  it('does not fire when the two cells are in different units', () => {
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 80, [3, 7]);
    expect(nakedPair(g)).toBeNull();
  });

  it('does not fire when there is nothing to eliminate', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    expect(nakedPair(g)).toBeNull();
  });

  it('finds a subset whose digits are already absent from the rest of the unit', () => {
    // Row 0 (= box 0): cells 0 and 1 form a genuine pair {3,7}; cell 2 is a
    // third open cell but holds unrelated digits {1,2}. The pair is found,
    // but since no other open cell in row 0 or box 0 carries 3 or 7, there is
    // nothing left to eliminate. open.length (3) exceeds size (2), so this
    // exercises the `if (!eliminations.length) continue;` branch on a unit
    // that the size guard does not skip.
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    only(g, 2, [1, 2]);
    expect(nakedPair(g)).toBeNull();
  });

  it('ignores cells with a single candidate', () => {
    const g = emptyGrid();
    only(g, 0, [3]);
    only(g, 1, [3, 7]);
    // Cell 0 has only one candidate so it can never join a pair; cell 1 is the
    // only cell anywhere with exactly two candidates, so no pair exists at all.
    expect(nakedPair(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    const before = Uint16Array.from(g.candidates);
    nakedPair(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('nakedTriple', () => {
  it('fires on three cells covering exactly three digits', () => {
    const g = emptyGrid();
    only(g, 0, [1, 2]);
    only(g, 1, [2, 3]);
    only(g, 2, [1, 3]);
    const found = nakedTriple(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('naked-triple');
    expect(d.cost).toBe(8);
    expect(d.eliminations!.some((e) => e.cell === 3 && [1, 2, 3].includes(e.value))).toBe(true);
  });

  it('does not fire when the three cells cover four digits', () => {
    const g = emptyGrid();
    only(g, 0, [1, 2]);
    only(g, 1, [2, 3]);
    only(g, 2, [1, 4]);
    // Every other cell on the board is fully open, so any triple that includes
    // one of them covers all 9 digits; the only restricted-only triple covers
    // four digits, not three. Nothing fires anywhere.
    expect(nakedTriple(g)).toBeNull();
  });
});

describe('nakedQuad', () => {
  it('fires on four cells covering exactly four digits', () => {
    const g = emptyGrid();
    only(g, 0, [1, 2]);
    only(g, 1, [2, 3]);
    only(g, 2, [3, 4]);
    only(g, 3, [1, 4]);
    const found = nakedQuad(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('naked-quad');
    expect(d.cost).toBe(12);
    expect(d.eliminations!.some((e) => e.cell === 4 && [1, 2, 3, 4].includes(e.value))).toBe(true);
  });

  it('does not fire when the four cells cover five digits', () => {
    const g = emptyGrid();
    only(g, 0, [1, 2]);
    only(g, 1, [2, 3]);
    only(g, 2, [3, 4]);
    only(g, 3, [1, 5]);
    // As above: the only restricted-only quad covers five digits, and every
    // other cell is fully open, so no quad fires anywhere on this board.
    expect(nakedQuad(g)).toBeNull();
  });
});
