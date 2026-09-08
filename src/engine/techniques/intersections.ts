import { BOXES, COLS, ROWS, SIZE, bit, boxOf, cellName, colOf, rowOf } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';

function names(eliminations: Elimination[]): string {
  return [...new Set(eliminations.map((e) => cellName(e.cell)))].join(', ');
}

/** A digit confined to one row or column inside a box is removed from the rest of that line. */
export const pointing: Technique = (grid) => {
  const out: Deduction[] = [];
  for (let b = 0; b < SIZE; b++) {
    const box = BOXES[b]!;
    for (let value = 1; value <= SIZE; value++) {
      const mask = bit(value);
      const cells = box.filter((c) => grid.values[c] === 0 && grid.candidates[c]! & mask);
      if (cells.length < 2) continue;

      const row = rowOf(cells[0]!);
      const col = colOf(cells[0]!);
      const sameRow = cells.every((c) => rowOf(c) === row);
      const sameCol = cells.every((c) => colOf(c) === col);
      if (!sameRow && !sameCol) continue;

      const line = sameRow ? ROWS[row]! : COLS[col]!;
      const eliminations: Elimination[] = line
        .filter((c) => boxOf(c) !== b && grid.values[c] === 0 && grid.candidates[c]! & mask)
        .map((c) => ({ cell: c, value }));
      if (!eliminations.length) continue;

      out.push({
        technique: 'pointing',
        cost: 6,
        eliminations,
        because: cells,
        text: `Pointing: in box ${b + 1}, ${value} can only go in ${sameRow ? 'row' : 'column'} ${(sameRow ? row : col) + 1}, so ${value} is removed from ${names(eliminations)}.`,
      });
    }
  }
  return out.length ? out : null;
};

/** A digit confined to one box inside a row or column is removed from the rest of that box. */
export const claiming: Technique = (grid) => {
  const out: Deduction[] = [];
  const lines = [
    ...ROWS.map((cells, i) => ({ cells, kind: 'row', index: i })),
    ...COLS.map((cells, i) => ({ cells, kind: 'column', index: i })),
  ];
  for (const line of lines) {
    for (let value = 1; value <= SIZE; value++) {
      const mask = bit(value);
      const cells = line.cells.filter((c) => grid.values[c] === 0 && grid.candidates[c]! & mask);
      if (cells.length < 2) continue;

      const b = boxOf(cells[0]!);
      if (!cells.every((c) => boxOf(c) === b)) continue;

      const inLine = new Set(line.cells);
      const eliminations: Elimination[] = BOXES[b]!.filter(
        (c) => !inLine.has(c) && grid.values[c] === 0 && grid.candidates[c]! & mask,
      ).map((c) => ({ cell: c, value }));
      if (!eliminations.length) continue;

      out.push({
        technique: 'claiming',
        cost: 6,
        eliminations,
        because: cells,
        text: `Claiming: in ${line.kind} ${line.index + 1}, ${value} only appears inside box ${b + 1}, so ${value} is removed from ${names(eliminations)}.`,
      });
    }
  }
  return out.length ? out : null;
};
