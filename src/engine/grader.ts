import { applyDeduction, bit, cloneGrid, isSolved, type Grid } from './grid';
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
  /**
   * Only meaningful when `outcome === 'solved'`. Otherwise this reports the
   * hardest tier reached before the grader stopped, defaulting to `'easy'`
   * if nothing fired at all -- so a caller who ignores `outcome` sees
   * `'easy'` for a grid that cannot be solved by logic at all. Always check
   * `outcome` before trusting this field.
   */
  difficulty: Difficulty;
  score: number;
  path: SolvePath;
  outcome: 'solved' | 'stalled' | 'exceeded-max-tier';
}

/** Difficulty tiers in ascending order, derived from TIER_ORDER so there is one source of truth. */
export const TIERS: Difficulty[] = (Object.keys(TIER_ORDER) as Difficulty[]).sort(
  (a, b) => TIER_ORDER[a] - TIER_ORDER[b],
);

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

    // Every deduction in this pass was computed against one pre-pass
    // snapshot of `working`. Applying an earlier deduction can invalidate a
    // later one in the same batch (e.g. two placements that both resolve to
    // the same digit in the same unit) -- so re-check each placement against
    // the grid's *current* state immediately before applying it, and skip it
    // if it has gone stale rather than letting `applyDeduction` throw.
    let appliedAny = false;
    for (const deduction of fired.deductions) {
      if (
        deduction.cell !== undefined &&
        deduction.value !== undefined &&
        !(working.candidates[deduction.cell]! & bit(deduction.value))
      ) {
        continue;
      }
      applyDeduction(working, deduction);
      path.push(deduction);
      score += deduction.cost;
      appliedAny = true;
    }

    // If every deduction in the fired technique's batch went stale, nothing
    // changed this pass -- the same technique would fire identically next
    // pass, forever. Report stalled instead of looping.
    if (!appliedAny) {
      return { difficulty: TIERS[hardest]!, score, path, outcome: 'stalled' };
    }

    hardest = Math.max(hardest, TIER_ORDER[fired.entry.tier]);
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
