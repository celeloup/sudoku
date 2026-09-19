import { boxOf } from '../engine';

/**
 * The CSS grid line a row or column of cells starts on.
 *
 * The grid's track template alternates cells with line tracks, and track 1 is
 * the outer frame, so cell index i sits on line 2i + 2. Lines are drawn as
 * tracks rather than borders because a border takes its width from the column
 * it sits on, which leaves the three boxes unequal at print weights.
 */
export function trackLine(index: number): number {
  return 2 * index + 2;
}

/** The four edge-centre boxes are tinted; the corners and the centre are paper. */
export function isTintedBox(cell: number): boolean {
  return boxOf(cell) % 2 === 1;
}
