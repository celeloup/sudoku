import { GenerationError } from './errors';
import { grade } from './grader';
import { ALL_CANDIDATES, CELLS, PEERS, bit, bitsToDigits, gridFromValues } from './grid';
import { makeRng, randomSeed, shuffle, type Rng } from './rng';
import { countSolutions } from './solver-brute';
import { TIER_ORDER, type Difficulty, type Puzzle } from './types';

/**
 * A single dig pass (one fresh full grid + one greedy symmetric-removal
 * sweep) lands exactly on 'hard' only about 0.3-0.7% of the time -- 'hard'
 * sits in a narrow gap between the medium and expert technique bands, far
 * rarer than either neighbour (measured: easy ~100%, medium ~13%, hard
 * ~0.3-0.7%, expert ~6% per attempt). 50 attempts (the brief's number)
 * fails for 'hard' far more often than not. 3000 attempts costs a few
 * seconds at ~3ms/attempt but keeps the failure probability negligible
 * (<0.1%) for every tier. See task-11-report.md for measurements.
 */
export const MAX_ATTEMPTS = 3000;
export const TIME_BUDGET_MS = 30_000;

/** 40 mirror pairs under 180-degree rotation, plus the centre cell. */
export const SYMMETRIC_UNITS: readonly number[][] = Array.from({ length: 41 }, (_, i) =>
  i === 40 ? [40] : [i, 80 - i],
);

export function generateFullGrid(rng: Rng): Uint8Array {
  const values = new Uint8Array(CELLS);
  const candidates = new Uint16Array(CELLS).fill(ALL_CANDIDATES);

  const place = (cell: number, digit: number): Uint16Array | null => {
    const undo = Uint16Array.from(candidates);
    values[cell] = digit;
    candidates[cell] = 0;
    const mask = ~bit(digit);
    for (const p of PEERS[cell]!) {
      if (values[p] !== 0) continue;
      candidates[p]! &= mask;
      if (candidates[p] === 0) {
        candidates.set(undo);
        values[cell] = 0;
        return null;
      }
    }
    return undo;
  };

  const fill = (cell: number): boolean => {
    if (cell === CELLS) return true;
    const digits = shuffle(bitsToDigits(candidates[cell]!), rng);
    for (const digit of digits) {
      const undo = place(cell, digit);
      if (!undo) continue;
      if (fill(cell + 1)) return true;
      candidates.set(undo);
      values[cell] = 0;
    }
    return false;
  };

  // Unreachable in practice: full backtracking over a 9x9 grid with at least
  // one legal digit per empty cell always finds a completion (a solved grid
  // always exists). This throw stays only as a defensive backstop against a
  // future change to `place`/`fill` that could otherwise return a
  // half-filled `values` silently. `GenerationError` (elsewhere documented
  // as budget exhaustion) is a slight misnomer here, but reusing it keeps
  // this from needing a whole new error class for a branch that should
  // never run.
  if (!fill(0)) throw new GenerationError('could not build a full grid', 0, null);
  return values;
}

interface Snapshot {
  values: Uint8Array;
  score: number;
}

interface DigResult {
  snapshot: Snapshot | null;
  bestTier: Difficulty;
}

/**
 * Removes symmetric clue pairs while the puzzle stays uniquely solvable and
 * logic-solvable within the target tier's ceiling. Difficulty climbs as
 * clues are removed, so a removal is kept whenever the puzzle is still
 * uniquely solvable by logic no harder than the target -- including when it
 * is still easier than the target, which is the normal state on the way up.
 * A snapshot is recorded every time the difficulty lands exactly on the
 * target; because each later removal has fewer clues, the last snapshot
 * recorded is the fewest-clue puzzle in the band.
 */
function dig(solution: Uint8Array, target: Difficulty, rng: Rng): DigResult {
  const values = Uint8Array.from(solution);
  const units = shuffle(
    SYMMETRIC_UNITS.map((u) => [...u]),
    rng,
  );
  let best: Snapshot | null = null;
  let bestTier: Difficulty = 'easy';

  for (const unit of units) {
    const removed = unit.map((c) => values[c]!);
    for (const c of unit) values[c] = 0;

    if (countSolutions(values, 2) !== 1) {
      unit.forEach((c, i) => (values[c] = removed[i]!));
      continue;
    }

    const result = grade(gridFromValues(values), { maxTier: target });

    // Not solvable by logic within the ceiling: it either stalled (would need
    // guessing) or needs a technique above the target tier. Put the clues back.
    if (result.outcome !== 'solved') {
      unit.forEach((c, i) => (values[c] = removed[i]!));
      continue;
    }

    // Safe to keep: unique, logic-solvable, no harder than the target. Keep it
    // even when the puzzle is still easier than the target -- that is how
    // difficulty climbs into the band.
    if (TIER_ORDER[result.difficulty] > TIER_ORDER[bestTier]) bestTier = result.difficulty;
    if (result.difficulty === target) {
      best = { values: Uint8Array.from(values), score: result.score };
    }
  }

  return { snapshot: best, bestTier };
}

export function generatePuzzle(opts: {
  difficulty: Difficulty;
  seed?: string;
  maxAttempts?: number;
  budgetMs?: number;
}): Puzzle {
  // TypeScript's Difficulty union does not stop a plain-JavaScript caller
  // (or a `as Difficulty` cast) from passing a value outside 'easy' |
  // 'medium' | 'hard' | 'expert'. Reject it immediately -- the dig loop
  // below cannot distinguish "no digging pass ever reaches this made-up
  // tier" from "this tier is legitimately just hard to hit," so without this
  // guard the bad value burns the entire attempt budget before failing.
  if (!(opts.difficulty in TIER_ORDER)) {
    throw new RangeError(`invalid difficulty: ${opts.difficulty}`);
  }
  const seed = opts.seed ?? randomSeed();
  const rng = makeRng(seed);
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const budgetMs = opts.budgetMs ?? TIME_BUDGET_MS;
  const startedAt = Date.now();

  let attempts = 0;
  let bestTier: Difficulty | null = null;

  while (attempts < maxAttempts && Date.now() - startedAt < budgetMs) {
    attempts++;
    const solution = generateFullGrid(rng);
    const { snapshot, bestTier: reached } = dig(solution, opts.difficulty, rng);

    if (!bestTier || TIER_ORDER[reached] > TIER_ORDER[bestTier]) bestTier = reached;

    if (snapshot) {
      return {
        givens: snapshot.values,
        solution,
        difficulty: opts.difficulty,
        score: snapshot.score,
        clueCount: snapshot.values.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0),
        seed,
      };
    }
  }

  throw new GenerationError(
    `could not generate a ${opts.difficulty} puzzle after ${attempts} attempt(s)`,
    attempts,
    bestTier,
  );
}
