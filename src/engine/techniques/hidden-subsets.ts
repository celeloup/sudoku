import { SIZE, UNITS, bit, bitsToDigits, cellName } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';
import { combinations } from './combinations';

const LABELS: Record<number, string> = { 2: 'pair', 3: 'triple' };

function hiddenSubset(size: number, cost: number): Technique {
  const technique = `hidden-${LABELS[size]}`;
  return (grid) => {
    const out: Deduction[] = [];
    for (const unit of UNITS) {
      const open = unit.filter((c) => grid.values[c] === 0);
      if (open.length <= size) continue;

      const live: number[] = [];
      for (let value = 1; value <= SIZE; value++) {
        if (open.some((c) => grid.candidates[c]! & bit(value))) live.push(value);
      }

      for (const combo of combinations(live, size)) {
        let keep = 0;
        for (const value of combo) keep |= bit(value);

        const cells = open.filter((c) => grid.candidates[c]! & keep);
        if (cells.length !== size) continue;

        const eliminations: Elimination[] = [];
        for (const c of cells) {
          for (const value of bitsToDigits(grid.candidates[c]! & ~keep)) {
            eliminations.push({ cell: c, value });
          }
        }
        if (!eliminations.length) continue;

        out.push({
          technique,
          cost,
          eliminations,
          because: cells,
          text: `Hidden ${LABELS[size]}: {${combo.join(', ')}} can only go in ${cells.map(cellName).join(', ')}, so every other candidate is removed from those cells.`,
        });
      }
    }
    return out.length ? out : null;
  };
}

export const hiddenPair = hiddenSubset(2, 10);
export const hiddenTriple = hiddenSubset(3, 12);
