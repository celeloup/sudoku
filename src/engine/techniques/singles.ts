import { CELLS, SIZE, UNITS, bit, bitCount, bitsToDigits, cellName } from '../grid';
import type { Deduction, Technique } from '../types';

export const nakedSingle: Technique = (grid) => {
  const out: Deduction[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (grid.values[c] !== 0) continue;
    const mask = grid.candidates[c]!;
    if (bitCount(mask) !== 1) continue;
    const value = bitsToDigits(mask)[0]!;
    out.push({
      technique: 'naked-single',
      cost: 1,
      cell: c,
      value,
      because: [c],
      text: `Naked single: ${cellName(c)} = ${value}, the only digit that fits there.`,
    });
  }
  return out.length ? out : null;
};

export const hiddenSingle: Technique = (grid) => {
  const out: Deduction[] = [];
  const claimed = new Set<number>();
  for (const unit of UNITS) {
    for (let value = 1; value <= SIZE; value++) {
      const mask = bit(value);
      let where = -1;
      let count = 0;
      let placed = false;
      for (const c of unit) {
        if (grid.values[c] === value) {
          placed = true;
          break;
        }
        if (grid.values[c] === 0 && grid.candidates[c]! & mask) {
          where = c;
          count++;
          if (count > 1) break;
        }
      }
      if (placed || count !== 1 || claimed.has(where)) continue;
      claimed.add(where);
      out.push({
        technique: 'hidden-single',
        cost: 2,
        cell: where,
        value,
        because: [...unit],
        text: `Hidden single: ${cellName(where)} = ${value}, the only cell in this unit that can hold ${value}.`,
      });
    }
  }
  return out.length ? out : null;
};
