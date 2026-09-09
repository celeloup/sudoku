import { InvalidGridError, nextStep } from '../engine';
import { toGrid, type PlayState } from './play-state';

export interface StepDescription {
  text: string;
  highlighted: Set<number>;
}

/**
 * Runs the technique ladder against the player's current position and describes
 * the cheapest available deduction. Candidates are recomputed from the placed
 * digits, so the hint never depends on the player's pencil marks.
 */
export function describeNextStep(state: PlayState): StepDescription {
  let grid;
  try {
    grid = toGrid(state);
  } catch (err) {
    if (err instanceof InvalidGridError) {
      return {
        text: 'That position is contradictory — remove a conflicting digit before asking for a hint.',
        highlighted: new Set(),
      };
    }
    throw err;
  }

  const step = nextStep(grid);
  if (!step) {
    const done = grid.values.every((v) => v !== 0);
    return {
      text: done
        ? 'Solved — nothing left to deduce.'
        : 'No technique in the ladder applies here. Either the position is wrong, or a digit you entered is incorrect.',
      highlighted: new Set(),
    };
  }

  const highlighted = new Set<number>(step.because);
  if (step.cell !== undefined) highlighted.add(step.cell);
  for (const e of step.eliminations ?? []) highlighted.add(e.cell);

  return { text: step.text, highlighted };
}
