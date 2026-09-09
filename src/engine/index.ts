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
  applyDeduction,
  bit,
  bitCount,
  bitsToDigits,
  boxOf,
  cellName,
  cloneGrid,
  colOf,
  eliminate,
  gridFromValues,
  isSolved,
  rowOf,
  setValue,
  type Grid,
} from './grid';
export { makeRng, randomSeed, shuffle, type Rng } from './rng';
export { countSolutions, solveValues } from './solver-brute';
export { LADDER, grade, nextStep, type GradeResult, type TechniqueEntry } from './grader';
export { SYMMETRIC_UNITS, generateFullGrid, generatePuzzle } from './generator';
export { distribute, generateSet, type Mix } from './batch';

import { gridFromValues, type Grid } from './grid';
import { solveValues } from './solver-brute';

/** Convenience wrapper: solve a Grid rather than a raw value array. */
export function solve(grid: Grid): Grid | null {
  const solved = solveValues(grid.values);
  return solved ? gridFromValues(solved) : null;
}
