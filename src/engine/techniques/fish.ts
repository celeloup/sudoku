import { COLS, ROWS, SIZE, bit, cellName, colOf, rowOf } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';
import { combinations } from './combinations';

const LABELS: Record<number, string> = { 2: 'X-Wing', 3: 'Swordfish' };

function fish(size: number, cost: number, technique: string): Technique {
  return (grid) => {
    const out: Deduction[] = [];
    for (const orientation of ['row', 'column'] as const) {
      const base = orientation === 'row' ? ROWS : COLS;
      const cover = orientation === 'row' ? COLS : ROWS;
      const coverIndex = orientation === 'row' ? colOf : rowOf;

      for (let value = 1; value <= SIZE; value++) {
        const mask = bit(value);
        const positions = base.map((line) =>
          line.filter((c) => grid.values[c] === 0 && grid.candidates[c]! & mask),
        );
        const usable: number[] = [];
        for (let i = 0; i < SIZE; i++) {
          const n = positions[i]!.length;
          if (n >= 2 && n <= size) usable.push(i);
        }

        for (const combo of combinations(usable, size)) {
          const coverLines = new Set<number>();
          for (const i of combo) for (const c of positions[i]!) coverLines.add(coverIndex(c));
          if (coverLines.size !== size) continue;

          const baseCells = new Set(combo.flatMap((i) => positions[i]!));
          const eliminations: Elimination[] = [];
          for (const l of coverLines) {
            for (const c of cover[l]!) {
              if (baseCells.has(c) || grid.values[c] !== 0) continue;
              if (grid.candidates[c]! & mask) eliminations.push({ cell: c, value });
            }
          }
          if (!eliminations.length) continue;

          const targets = [...new Set(eliminations.map((e) => cellName(e.cell)))].join(', ');
          const lineWord = orientation === 'row' ? 'rows' : 'columns';
          const coverWord = orientation === 'row' ? 'columns' : 'rows';
          out.push({
            technique,
            cost,
            eliminations,
            because: [...baseCells],
            text: `${LABELS[size]}: in ${lineWord} ${combo.map((i) => i + 1).join(', ')}, ${value} is confined to ${coverWord} ${[...coverLines].map((i) => i + 1).join(', ')}, so ${value} is removed from ${targets}.`,
          });
        }
      }
    }
    return out.length ? out : null;
  };
}

export const xWing = fish(2, 15, 'x-wing');
export const swordfish = fish(3, 22, 'swordfish');
