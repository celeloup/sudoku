import { InvalidGridError } from './errors';
import type { Deduction } from './types';

export const SIZE = 9;
export const CELLS = 81;
export const ALL_CANDIDATES = 0b111111111;

export interface Grid {
  values: Uint8Array;
  candidates: Uint16Array;
}

export function bit(digit: number): number {
  return 1 << (digit - 1);
}

export function bitCount(mask: number): number {
  let m = mask;
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

export function bitsToDigits(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= SIZE; d++) if (mask & bit(d)) out.push(d);
  return out;
}

export function rowOf(cell: number): number {
  return Math.floor(cell / SIZE);
}

export function colOf(cell: number): number {
  return cell % SIZE;
}

export function boxOf(cell: number): number {
  return Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
}

export function cellName(cell: number): string {
  return `r${rowOf(cell) + 1}c${colOf(cell) + 1}`;
}

function buildUnits(): { rows: number[][]; cols: number[][]; boxes: number[][] } {
  const rows: number[][] = Array.from({ length: SIZE }, () => []);
  const cols: number[][] = Array.from({ length: SIZE }, () => []);
  const boxes: number[][] = Array.from({ length: SIZE }, () => []);
  for (let c = 0; c < CELLS; c++) {
    rows[rowOf(c)]!.push(c);
    cols[colOf(c)]!.push(c);
    boxes[boxOf(c)]!.push(c);
  }
  return { rows, cols, boxes };
}

const built = buildUnits();
export const ROWS: readonly number[][] = built.rows;
export const COLS: readonly number[][] = built.cols;
export const BOXES: readonly number[][] = built.boxes;
export const UNITS: readonly number[][] = [...built.rows, ...built.cols, ...built.boxes];

export const PEERS: readonly number[][] = Array.from({ length: CELLS }, (_, c) => {
  const set = new Set<number>();
  for (const unit of [ROWS[rowOf(c)]!, COLS[colOf(c)]!, BOXES[boxOf(c)]!]) {
    for (const other of unit) if (other !== c) set.add(other);
  }
  return [...set];
});

export function gridFromValues(values: Uint8Array): Grid {
  if (values.length !== CELLS) {
    throw new InvalidGridError(`grid must have ${CELLS} cells, got ${values.length}`);
  }
  const grid: Grid = {
    values: Uint8Array.from(values),
    candidates: new Uint16Array(CELLS),
  };
  for (let c = 0; c < CELLS; c++) {
    grid.candidates[c] = grid.values[c] === 0 ? ALL_CANDIDATES : 0;
  }
  for (const unit of UNITS) {
    let seen = 0;
    for (const c of unit) {
      const v = grid.values[c]!;
      if (v === 0) continue;
      if (seen & bit(v)) {
        throw new InvalidGridError(`digit ${v} appears twice in a unit containing ${cellName(c)}`);
      }
      seen |= bit(v);
    }
  }
  for (let c = 0; c < CELLS; c++) {
    const v = grid.values[c]!;
    if (v === 0) continue;
    for (const p of PEERS[c]!) grid.candidates[p]! &= ~bit(v);
  }
  for (let c = 0; c < CELLS; c++) {
    if (grid.values[c] === 0 && grid.candidates[c] === 0) {
      throw new InvalidGridError(`cell ${cellName(c)} has no candidates`);
    }
  }
  return grid;
}

export function cloneGrid(grid: Grid): Grid {
  return {
    values: Uint8Array.from(grid.values),
    candidates: Uint16Array.from(grid.candidates),
  };
}

export function setValue(grid: Grid, cell: number, digit: number): void {
  if (grid.values[cell] === digit) return;
  if (!(grid.candidates[cell]! & bit(digit))) {
    throw new InvalidGridError(`${digit} is not a candidate at ${cellName(cell)}`);
  }
  grid.values[cell] = digit;
  grid.candidates[cell] = 0;
  for (const p of PEERS[cell]!) grid.candidates[p]! &= ~bit(digit);
}

export function eliminate(grid: Grid, cell: number, digit: number): boolean {
  const mask = bit(digit);
  if (!(grid.candidates[cell]! & mask)) return false;
  grid.candidates[cell]! &= ~mask;
  return true;
}

export function applyDeduction(grid: Grid, deduction: Deduction): void {
  if (deduction.cell !== undefined && deduction.value !== undefined) {
    setValue(grid, deduction.cell, deduction.value);
  }
  for (const e of deduction.eliminations ?? []) eliminate(grid, e.cell, e.value);
}

export function isSolved(grid: Grid): boolean {
  for (let c = 0; c < CELLS; c++) if (grid.values[c] === 0) return false;
  return true;
}
