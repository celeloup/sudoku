/**
 * The engine's public surface. Every submodule under `src/engine/` is an
 * implementation detail; a consumer (the UI in this repo today, a future
 * portfolio package tomorrow) should only ever import from here. See the
 * `no-restricted-imports` rule for `src/ui/**` in `eslint.config.js`, which
 * enforces this boundary.
 *
 * Four guarantees hold for every `Puzzle` `generatePuzzle` and `generateSet`
 * produce:
 *
 * 1. It has exactly one solution.
 * 2. It is solvable by the technique ladder alone -- `grade` never needs to
 *    guess.
 * 3. It grades to exactly the tier requested.
 * 4. It is reproducible from its `seed`.
 *
 * Two caveats temper those guarantees in practice:
 *
 * - `generatePuzzle` blocks synchronously. Hard-tier generation has a
 *   measured worst-case tail of ~4.1 s against its 3000 ms budget (see the
 *   design spec's benchmark notes) -- a browser consumer should run it in a
 *   Web Worker rather than call it from the main thread.
 * - "Reproducible from its seed" means the same puzzle *or* a
 *   `GenerationError`, not always the same puzzle -- generation runs under a
 *   wall-clock time budget, and how many attempts fit in that budget varies
 *   with machine load. A seed that succeeds on one run can, rarely, time out
 *   on a slower or busier machine.
 */

export type { Deduction, Difficulty, Elimination, Puzzle, SolvePath, Technique } from './types';
export { TIER_ORDER } from './types';
export { GenerationError, InvalidGridError, InvalidMixError } from './errors';
export {
  ALL_CANDIDATES,
  BOXES,
  CELLS,
  COLS,
  PEERS,
  ROWS,
  SIZE,
  UNITS,
  bit,
  boxOf,
  cellName,
  colOf,
  gridFromValues,
  rowOf,
  type Grid,
} from './grid';
export { grade, nextStep, type GradeResult } from './grader';
export { generatePuzzle } from './generator';
export { generateSet } from './batch';

import { gridFromValues, type Grid } from './grid';
import { solveValues } from './solver-brute';

/**
 * Convenience wrapper: solve a Grid rather than a raw value array.
 *
 * This forwards only `grid.values` to the brute-force solver -- it discards
 * `grid.candidates` entirely. A caller who narrowed candidates by hand (e.g.
 * ruled out a digit the solver doesn't know about) can get back a solution
 * that contradicts those eliminations.
 */
export function solve(grid: Grid): Grid | null {
  const solved = solveValues(grid.values);
  return solved ? gridFromValues(solved) : null;
}
