import { UNITS, bit, bitCount, bitsToDigits, cellName } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';
import { combinations } from './combinations';

const LABELS: Record<number, string> = { 2: 'pair', 3: 'triple', 4: 'quad' };

function nakedSubset(size: number, cost: number): Technique {
  const technique = `naked-${LABELS[size]}`;
  return (grid) => {
    const out: Deduction[] = [];
    for (const unit of UNITS) {
      const open = unit.filter((c) => grid.values[c] === 0 && bitCount(grid.candidates[c]!) >= 2);
      if (open.length <= size) continue;

      for (const combo of combinations(open, size)) {
        let mask = 0;
        for (const c of combo) mask |= grid.candidates[c]!;
        if (bitCount(mask) !== size) continue;

        const digits = bitsToDigits(mask);
        const inCombo = new Set(combo);
        const eliminations: Elimination[] = [];
        for (const c of unit) {
          if (inCombo.has(c) || grid.values[c] !== 0) continue;
          for (const value of digits) {
            if (grid.candidates[c]! & bit(value)) eliminations.push({ cell: c, value });
          }
        }
        if (!eliminations.length) continue;

        const targets = [...new Set(eliminations.map((e) => cellName(e.cell)))].join(', ');
        out.push({
          technique,
          cost,
          eliminations,
          because: combo,
          text: `Naked ${LABELS[size]}: ${combo.map(cellName).join(', ')} hold only {${digits.join(', ')}}, so those digits are removed from ${targets}.`,
        });
      }
    }
    return out.length ? out : null;
  };
}

export const nakedPair = nakedSubset(2, 5);
export const nakedTriple = nakedSubset(3, 8);
export const nakedQuad = nakedSubset(4, 12);
