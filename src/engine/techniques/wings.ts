import { CELLS, PEERS, bitCount, bitsToDigits, cellName, type Grid } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';

function bivalueCells(grid: Grid): number[] {
  const out: number[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (grid.values[c] === 0 && bitCount(grid.candidates[c]!) === 2) out.push(c);
  }
  return out;
}

export const xyWing: Technique = (grid) => {
  const out: Deduction[] = [];
  const bivalue = new Set(bivalueCells(grid));

  for (const pivot of bivalue) {
    const pivotMask = grid.candidates[pivot]!;
    const peers = PEERS[pivot]!.filter((c) => bivalue.has(c));

    for (let i = 0; i < peers.length; i++) {
      const a = peers[i]!;
      const maskA = grid.candidates[a]!;
      if (bitCount(maskA & pivotMask) !== 1) continue;

      for (let j = i + 1; j < peers.length; j++) {
        const b = peers[j]!;
        const maskB = grid.candidates[b]!;
        if (bitCount(maskB & pivotMask) !== 1) continue;
        // The pincers must cover different digits of the pivot.
        if ((maskA & pivotMask) === (maskB & pivotMask)) continue;

        const sharedMask = maskA & maskB & ~pivotMask;
        if (bitCount(sharedMask) !== 1) continue;
        const value = bitsToDigits(sharedMask)[0]!;

        const peersOfB: number[] = PEERS[b]!;
        const seesB = new Set(peersOfB);
        const eliminations: Elimination[] = PEERS[a]!.filter(
          (c) =>
            c !== pivot &&
            c !== b &&
            seesB.has(c) &&
            grid.values[c] === 0 &&
            grid.candidates[c]! & sharedMask,
        ).map((c) => ({ cell: c, value }));
        if (!eliminations.length) continue;

        const targets = eliminations.map((e) => cellName(e.cell)).join(', ');
        out.push({
          technique: 'xy-wing',
          cost: 24,
          eliminations,
          because: [pivot, a, b],
          text: `XY-Wing: pivot ${cellName(pivot)} with pincers ${cellName(a)} and ${cellName(b)} forces ${value} into one of the pincers, so ${value} is removed from ${targets}.`,
        });
      }
    }
  }
  return out.length ? out : null;
};

export const xyzWing: Technique = (grid) => {
  const out: Deduction[] = [];

  for (let pivot = 0; pivot < CELLS; pivot++) {
    if (grid.values[pivot] !== 0) continue;
    const pivotMask = grid.candidates[pivot]!;
    if (bitCount(pivotMask) !== 3) continue;

    const peers = PEERS[pivot]!.filter(
      (c) =>
        grid.values[c] === 0 &&
        bitCount(grid.candidates[c]!) === 2 &&
        (grid.candidates[c]! & ~pivotMask) === 0,
    );

    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const a = peers[i]!;
        const b = peers[j]!;
        const maskA = grid.candidates[a]!;
        const maskB = grid.candidates[b]!;
        if ((maskA | maskB) !== pivotMask) continue;

        const sharedMask = maskA & maskB;
        if (bitCount(sharedMask) !== 1) continue;
        const value = bitsToDigits(sharedMask)[0]!;

        const peersOfA: number[] = PEERS[a]!;
        const peersOfB: number[] = PEERS[b]!;
        const seesA = new Set(peersOfA);
        const seesB = new Set(peersOfB);
        const eliminations: Elimination[] = PEERS[pivot]!.filter(
          (c) =>
            c !== a &&
            c !== b &&
            seesA.has(c) &&
            seesB.has(c) &&
            grid.values[c] === 0 &&
            grid.candidates[c]! & sharedMask,
        ).map((c) => ({ cell: c, value }));
        if (!eliminations.length) continue;

        const targets = eliminations.map((e) => cellName(e.cell)).join(', ');
        out.push({
          technique: 'xyz-wing',
          cost: 26,
          eliminations,
          because: [pivot, a, b],
          text: `XYZ-Wing: pivot ${cellName(pivot)} with pincers ${cellName(a)} and ${cellName(b)} forces ${value} into one of the three, so ${value} is removed from ${targets}.`,
        });
      }
    }
  }
  return out.length ? out : null;
};
