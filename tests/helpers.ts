import { ALL_CANDIDATES, bit, gridFromValues, type Grid } from '../src/engine/grid';

/** 81 chars, '.' or '0' for empty. */
export function valuesFrom(s: string): Uint8Array {
  const clean = s.replace(/\s/g, '');
  if (clean.length !== 81) throw new Error(`expected 81 chars, got ${clean.length}`);
  const out = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    const ch = clean[i]!;
    out[i] = ch === '.' || ch === '0' ? 0 : Number(ch);
  }
  return out;
}

export function gridFrom(s: string): Grid {
  return gridFromValues(valuesFrom(s));
}

export function emptyGrid(): Grid {
  return {
    values: new Uint8Array(81),
    candidates: new Uint16Array(81).fill(ALL_CANDIDATES),
  };
}

/** Force a cell's candidate set to exactly these digits. Test-only. */
export function only(g: Grid, cell: number, digits: number[]): void {
  let mask = 0;
  for (const d of digits) mask |= bit(d);
  g.candidates[cell] = mask;
}

/** Force every listed cell to exactly these digits, and clear all others. */
export function onlyThese(g: Grid, spec: Record<number, number[]>): void {
  g.candidates.fill(0);
  for (const [cell, digits] of Object.entries(spec)) only(g, Number(cell), digits);
}
