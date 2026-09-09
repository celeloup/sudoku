import { generatePuzzle } from '../src/engine/generator';
import type { Difficulty } from '../src/engine/types';

const TIERS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const RUNS = 10;
const TARGETS: Record<Difficulty, number> = {
  easy: 200,
  medium: 200,
  hard: 3_000,
  expert: 5_000,
};

for (const tier of TIERS) {
  const timings: number[] = [];
  let clues = 0;
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const puzzle = generatePuzzle({ difficulty: tier, seed: `bench-${tier}-${i}` });
    timings.push(performance.now() - start);
    clues += puzzle.clueCount;
  }
  timings.sort((a, b) => a - b);
  const median = timings[Math.floor(RUNS / 2)]!;
  const worst = timings[RUNS - 1]!;
  const status =
    median > TARGETS[tier]
      ? 'OVER BUDGET'
      : worst > TARGETS[tier]
        ? 'ok (worst over budget)'
        : 'ok';
  console.log(
    `${tier.padEnd(7)} median ${median.toFixed(0).padStart(6)}ms  ` +
      `worst ${worst.toFixed(0).padStart(6)}ms  ` +
      `budget ${String(TARGETS[tier]).padStart(5)}ms  ` +
      `avg clues ${(clues / RUNS).toFixed(1)}  ${status}`,
  );
}
