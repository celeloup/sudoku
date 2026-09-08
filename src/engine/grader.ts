import { applyDeduction, cloneGrid, isSolved, type Grid } from './grid';
import {
  TIER_ORDER,
  type Deduction,
  type Difficulty,
  type SolvePath,
  type Technique,
} from './types';
import { hiddenSingle, nakedSingle } from './techniques/singles';
import { claiming, pointing } from './techniques/intersections';
import { nakedPair, nakedQuad, nakedTriple } from './techniques/naked-subsets';
import { hiddenPair, hiddenTriple } from './techniques/hidden-subsets';
import { swordfish, xWing } from './techniques/fish';
import { xyWing, xyzWing } from './techniques/wings';

export interface TechniqueEntry {
  name: string;
  cost: number;
  tier: Difficulty;
  fn: Technique;
}

/** Ordered by cost. The grader always takes the first entry that fires. */
export const LADDER: readonly TechniqueEntry[] = [
  { name: 'naked-single', cost: 1, tier: 'easy', fn: nakedSingle },
  { name: 'hidden-single', cost: 2, tier: 'easy', fn: hiddenSingle },
  { name: 'naked-pair', cost: 5, tier: 'medium', fn: nakedPair },
  { name: 'pointing', cost: 6, tier: 'medium', fn: pointing },
  { name: 'claiming', cost: 6, tier: 'medium', fn: claiming },
  { name: 'naked-triple', cost: 8, tier: 'medium', fn: nakedTriple },
  { name: 'hidden-pair', cost: 10, tier: 'hard', fn: hiddenPair },
  { name: 'naked-quad', cost: 12, tier: 'hard', fn: nakedQuad },
  { name: 'hidden-triple', cost: 12, tier: 'hard', fn: hiddenTriple },
  { name: 'x-wing', cost: 15, tier: 'hard', fn: xWing },
  { name: 'swordfish', cost: 22, tier: 'expert', fn: swordfish },
  { name: 'xy-wing', cost: 24, tier: 'expert', fn: xyWing },
  { name: 'xyz-wing', cost: 26, tier: 'expert', fn: xyzWing },
];

export interface GradeResult {
  difficulty: Difficulty;
  score: number;
  path: SolvePath;
  outcome: 'solved' | 'stalled' | 'exceeded-max-tier';
}

const TIERS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export function grade(grid: Grid, opts?: { maxTier?: Difficulty }): GradeResult {
  const ceiling = opts?.maxTier ? TIER_ORDER[opts.maxTier] : TIER_ORDER.expert;
  const working = cloneGrid(grid);
  const path: SolvePath = [];
  let score = 0;
  let hardest = 0;

  for (;;) {
    if (isSolved(working)) {
      return { difficulty: TIERS[hardest]!, score, path, outcome: 'solved' };
    }

    let fired: { entry: TechniqueEntry; deductions: Deduction[] } | null = null;
    for (const entry of LADDER) {
      const deductions = entry.fn(working);
      if (!deductions || deductions.length === 0) continue;
      if (TIER_ORDER[entry.tier] > ceiling) {
        return { difficulty: TIERS[hardest]!, score, path, outcome: 'exceeded-max-tier' };
      }
      fired = { entry, deductions };
      break;
    }

    if (!fired) {
      return { difficulty: TIERS[hardest]!, score, path, outcome: 'stalled' };
    }

    hardest = Math.max(hardest, TIER_ORDER[fired.entry.tier]);
    for (const deduction of fired.deductions) {
      applyDeduction(working, deduction);
      path.push(deduction);
      score += deduction.cost;
    }
  }
}

/** The single cheapest deduction available, for the explainer. */
export function nextStep(grid: Grid): Deduction | null {
  if (isSolved(grid)) return null;
  for (const entry of LADDER) {
    const deductions = entry.fn(grid);
    if (deductions && deductions.length > 0) return deductions[0]!;
  }
  return null;
}
