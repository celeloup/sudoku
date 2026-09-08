export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export const TIER_ORDER: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
  expert: 3,
};

export interface Elimination {
  cell: number;
  value: number;
}

export interface Deduction {
  technique: string;
  cost: number;
  /** Set when the deduction places a digit. */
  cell?: number;
  /** Set when the deduction places a digit. */
  value?: number;
  /** Set when the deduction removes candidates. */
  eliminations?: Elimination[];
  /** Supporting cells, for explainer highlighting. */
  because: number[];
  /** Human-readable description, shown by the explainer. */
  text: string;
}

export type SolvePath = Deduction[];

/**
 * Every technique obeys this contract. It never mutates the grid: it reports
 * every deduction it can see in one pass, or null if it does not apply.
 */
export type Technique = (grid: import('./grid').Grid) => Deduction[] | null;

export interface Puzzle {
  givens: Uint8Array;
  solution: Uint8Array;
  difficulty: Difficulty;
  score: number;
  clueCount: number;
  seed: string;
}
