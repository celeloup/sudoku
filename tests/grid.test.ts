import { describe, expect, it } from 'vitest';
import {
  ALL_CANDIDATES,
  BOXES,
  COLS,
  PEERS,
  ROWS,
  UNITS,
  bit,
  bitCount,
  bitsToDigits,
  boxOf,
  cellName,
  cloneGrid,
  colOf,
  eliminate,
  gridFromValues,
  isSolved,
  rowOf,
  setValue,
} from '../src/engine/grid';
import { InvalidGridError } from '../src/engine/errors';
import { emptyGrid, gridFrom, valuesFrom } from './helpers';

const WIKI_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const WIKI_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('bitmask helpers', () => {
  it('maps digits to single bits', () => {
    expect(bit(1)).toBe(0b000000001);
    expect(bit(9)).toBe(0b100000000);
  });

  it('counts bits', () => {
    expect(bitCount(0)).toBe(0);
    expect(bitCount(ALL_CANDIDATES)).toBe(9);
    expect(bitCount(bit(3) | bit(7))).toBe(2);
  });

  it('converts masks back to digits in ascending order', () => {
    expect(bitsToDigits(bit(7) | bit(2) | bit(9))).toEqual([2, 7, 9]);
    expect(bitsToDigits(0)).toEqual([]);
  });
});

describe('unit and peer tables', () => {
  it('has 9 rows, 9 columns, 9 boxes, 27 units', () => {
    expect(ROWS).toHaveLength(9);
    expect(COLS).toHaveLength(9);
    expect(BOXES).toHaveLength(9);
    expect(UNITS).toHaveLength(27);
    for (const u of UNITS) expect(u).toHaveLength(9);
  });

  it('places cell 0 in row 0, column 0, box 0', () => {
    expect(rowOf(0)).toBe(0);
    expect(colOf(0)).toBe(0);
    expect(boxOf(0)).toBe(0);
  });

  it('places cell 80 in row 8, column 8, box 8', () => {
    expect(rowOf(80)).toBe(8);
    expect(colOf(80)).toBe(8);
    expect(boxOf(80)).toBe(8);
  });

  it('places cell 30 (r3c3) in box 4', () => {
    expect(boxOf(30)).toBe(4);
  });

  it('gives every cell exactly 20 peers, never itself', () => {
    for (let c = 0; c < 81; c++) {
      expect(PEERS[c]).toHaveLength(20);
      expect(PEERS[c]).not.toContain(c);
    }
  });

  it('makes peerhood symmetric', () => {
    for (let c = 0; c < 81; c++) {
      for (const p of PEERS[c]!) expect(PEERS[p]).toContain(c);
    }
  });
});

describe('cellName', () => {
  it('uses 1-based r/c notation', () => {
    expect(cellName(0)).toBe('r1c1');
    expect(cellName(30)).toBe('r4c4');
    expect(cellName(80)).toBe('r9c9');
  });
});

describe('gridFromValues', () => {
  it('gives every cell all nine candidates on an empty grid', () => {
    const g = gridFromValues(new Uint8Array(81));
    for (let c = 0; c < 81; c++) expect(g.candidates[c]).toBe(ALL_CANDIDATES);
  });

  it('gives filled cells no candidates', () => {
    const g = gridFrom(WIKI_PUZZLE);
    expect(g.values[0]).toBe(5);
    expect(g.candidates[0]).toBe(0);
  });

  it('removes a given digit from its peers', () => {
    const g = gridFrom(WIKI_PUZZLE);
    // r1c1 = 5, so no other cell in row 1, column 1 or box 1 may hold 5.
    for (const p of PEERS[0]!) expect(g.candidates[p]! & bit(5)).toBe(0);
  });

  it('computes candidates for a partially filled grid without touching givens', () => {
    const g = gridFrom(WIKI_PUZZLE);
    let filled = 0;
    for (let c = 0; c < 81; c++) if (g.values[c] !== 0) filled++;
    expect(filled).toBe(30);
    expect(valuesFrom(WIKI_PUZZLE)).toEqual(g.values);
  });

  it('copies its input rather than aliasing it', () => {
    const values = valuesFrom(WIKI_PUZZLE);
    const g = gridFromValues(values);
    values[0] = 9;
    expect(g.values[0]).toBe(5);
  });

  it('rejects a grid that is not 81 cells', () => {
    expect(() => gridFromValues(new Uint8Array(80))).toThrow(InvalidGridError);
  });

  it('rejects a grid with a duplicate digit in a unit', () => {
    const bad = new Uint8Array(81);
    bad[0] = 5;
    bad[1] = 5;
    expect(() => gridFromValues(bad)).toThrow(InvalidGridError);
  });

  it('rejects a grid where an empty cell has no candidates', () => {
    // Fill r1c2..r1c9 and r2c1..r3c1 so that r1c1 has every digit eliminated.
    const bad = valuesFrom('.23456789' + '4........' + '5........' + '.'.repeat(54));
    bad[9 * 3] = 6;
    bad[9 * 4] = 7;
    bad[9 * 5] = 8;
    bad[9 * 6] = 9;
    bad[9 * 7] = 2;
    bad[9 * 8] = 3;
    // Row and column peers alone only ever cover digits 2-9 (both sequences omit 1),
    // so r1c1 keeps candidate {1} without this. Box peer r2c2 = 1 closes the gap.
    bad[10] = 1;
    expect(() => gridFromValues(bad)).toThrow(InvalidGridError);
  });
});

describe('setValue', () => {
  it('places a digit and clears it from peers', () => {
    const g = emptyGrid();
    setValue(g, 0, 5);
    expect(g.values[0]).toBe(5);
    expect(g.candidates[0]).toBe(0);
    for (const p of PEERS[0]!) expect(g.candidates[p]! & bit(5)).toBe(0);
  });

  it('refuses to place a digit that is not a candidate', () => {
    const g = emptyGrid();
    g.candidates[0] = bit(1);
    expect(() => {
      setValue(g, 0, 5);
    }).toThrow(InvalidGridError);
  });
});

describe('eliminate', () => {
  it('removes a candidate and reports the change', () => {
    const g = emptyGrid();
    expect(eliminate(g, 0, 5)).toBe(true);
    expect(g.candidates[0]! & bit(5)).toBe(0);
  });

  it('reports no change when the candidate is already gone', () => {
    const g = emptyGrid();
    eliminate(g, 0, 5);
    expect(eliminate(g, 0, 5)).toBe(false);
  });
});

describe('cloneGrid', () => {
  it('produces an independent copy', () => {
    const g = gridFrom(WIKI_PUZZLE);
    const copy = cloneGrid(g);
    copy.values[1] = 9;
    copy.candidates[1] = 0;
    expect(g.values[1]).toBe(3);
    expect(g.candidates[1]).toBe(0);
    expect(copy.values[0]).toBe(g.values[0]);
  });
});

describe('isSolved', () => {
  it('is false for a puzzle and true for its solution', () => {
    expect(isSolved(gridFrom(WIKI_PUZZLE))).toBe(false);
    expect(isSolved(gridFrom(WIKI_SOLUTION))).toBe(true);
  });
});
