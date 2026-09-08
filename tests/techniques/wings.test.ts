import { describe, expect, it } from 'vitest';
import { xyWing, xyzWing } from '../../src/engine/techniques/wings';
import { emptyGrid, only } from '../helpers';

describe('xyWing', () => {
  it('eliminates the shared digit from cells seeing both pincers', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    // Pivot r1c1 {1,2}; pincers r1c4 {1,3} (same row) and r4c1 {2,3} (same column).
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 27, [2, 3]);
    // r4c4 sees both pincers, and holds 3.
    only(g, 30, [3, 9]);
    const found = xyWing(g);
    expect(found).not.toBeNull();
    expect(found).toHaveLength(1);
    const d = found![0]!;
    expect(d.technique).toBe('xy-wing');
    expect(d.cost).toBe(24);
    expect(d.eliminations).toEqual([{ cell: 30, value: 3 }]);
  });

  it('does not fire when the pincers share the same pivot digit', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 27, [1, 3]);
    only(g, 30, [3, 9]);
    expect(xyWing(g)).toBeNull();
  });

  it('does not fire when no cell sees both pincers', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 27, [2, 3]);
    // Nothing else holds 3.
    expect(xyWing(g)).toBeNull();
  });

  it('does not fire when a pincer is not a peer of the pivot', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 40, [2, 3]);
    only(g, 30, [3, 9]);
    expect(xyWing(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 27, [2, 3]);
    only(g, 30, [3, 9]);
    const before = Uint16Array.from(g.candidates);
    xyWing(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('xyzWing', () => {
  it('eliminates the shared digit from cells seeing pivot and both pincers', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    // Pivot r1c1 {1,2,3}; pincers r1c2 {1,3} and r1c3 {2,3} — all in box 0 and row 0.
    only(g, 0, [1, 2, 3]);
    only(g, 1, [1, 3]);
    only(g, 2, [2, 3]);
    // r1c4 sees all three (same row) and holds 3.
    only(g, 3, [3, 9]);
    const found = xyzWing(g);
    expect(found).not.toBeNull();
    expect(found).toHaveLength(1);
    const d = found![0]!;
    expect(d.technique).toBe('xyz-wing');
    expect(d.cost).toBe(26);
    expect(d.eliminations).toEqual([{ cell: 3, value: 3 }]);
  });

  it('does not fire when the pincers do not cover the pivot exactly', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2, 3]);
    only(g, 1, [1, 3]);
    only(g, 2, [1, 3]);
    only(g, 3, [3, 9]);
    expect(xyzWing(g)).toBeNull();
  });

  it('does not fire when no other cell holds the shared digit', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2, 3]);
    only(g, 1, [1, 3]);
    only(g, 2, [2, 3]);
    // No cell besides the pivot and pincers has any candidates at all, so
    // there is nothing for the shared digit to be eliminated from.
    expect(xyzWing(g)).toBeNull();
  });

  it('does not fire when a cell sees both pincers but not the pivot', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    // Pivot r1c1 {1,2,3}; pincers r1c4 {1,3} (same row) and r4c1 {2,3} (same
    // column) — same layout as the xyWing fixture, but the pivot now holds
    // three candidates.
    only(g, 0, [1, 2, 3]);
    only(g, 3, [1, 3]);
    only(g, 27, [2, 3]);
    // r4c4 sees both pincers (row with r4c1, column with r1c4) but is not a
    // peer of the pivot r1c1 (different row, column, and box). It holds the
    // shared digit 3, which a buggy implementation that forgot the extra
    // "sees the pivot" requirement would wrongly eliminate.
    only(g, 30, [3, 9]);
    expect(xyzWing(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2, 3]);
    only(g, 1, [1, 3]);
    only(g, 2, [2, 3]);
    only(g, 3, [3, 9]);
    const beforeCandidates = Uint16Array.from(g.candidates);
    const beforeValues = Uint8Array.from(g.values);
    xyzWing(g);
    expect(g.candidates).toEqual(beforeCandidates);
    expect(g.values).toEqual(beforeValues);
  });
});
