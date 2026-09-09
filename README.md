# sudoku

A dependency-free TypeScript sudoku engine that generates uniquely-solvable puzzles at a
requested difficulty, plus a small browser page for playing and inspecting them.

Built to produce printable sudoku notebooks. Print layout is not part of this yet.

## What makes it different

**Difficulty is decided by which solving techniques a puzzle actually requires**, not by
how many digits are showing. A grader runs thirteen human techniques in cost order and a
puzzle's tier is the hardest one it genuinely needs:

| Tier   | Techniques it may require                        |
| ------ | ------------------------------------------------ |
| Easy   | naked single, hidden single                      |
| Medium | + naked pair, pointing, claiming, naked triple   |
| Hard   | + hidden pair, naked quad, hidden triple, X-Wing |
| Expert | + Swordfish, XY-Wing, XYZ-Wing                   |

A consequence worth knowing: clue counts land at roughly 27-28 for **every** tier. An
easy puzzle and an expert one look about equally sparse on the page.

## Guarantees

Every generated puzzle:

- has exactly one solution
- is solvable by the technique ladder alone, never requiring a guess
- grades to exactly the tier requested
- has a 180°-rotationally-symmetric pattern of givens
- is reproducible byte-for-byte from its seed

## Quick start

```bash
npm install
npm run dev      # browser harness at the printed URL
npm run verify   # typecheck, lint, format, tests
npm run bench    # per-tier generation timings
```

## Using the engine

```ts
import { generatePuzzle, generateSet, grade, gridFromValues } from './src/engine';

// One puzzle, reproducible from its seed
const puzzle = generatePuzzle({ difficulty: 'hard', seed: 'notebook-1' });
puzzle.givens; // Uint8Array(81), 0 = empty
puzzle.solution; // Uint8Array(81)
puzzle.clueCount; // an output, never an input
puzzle.score; // weighted sum of the steps required

// A notebook's worth, by percentage mix (must sum to 100)
const set = generateSet({ count: 30, mix: { medium: 60, hard: 40 } });

// Grade an arbitrary position
const result = grade(gridFromValues(puzzle.givens));
result.difficulty; // only meaningful when result.outcome === 'solved'
result.path; // every deduction, in order, with human-readable text
```

`src/engine/index.ts` is the single public surface and documents the caveats.

## The browser harness

`npm run dev` opens a page that generates a puzzle and lets you solve it. Click a cell
and type a digit; `N` toggles pencil marks; arrow keys move. Conflicting digits highlight
in red. **Next step** names the cheapest technique that applies, explains the deduction in
words, and highlights the cells involved — it calls the same code the grader uses, so if
the hint is wrong the grader is wrong.

The seed used is always written back into the field, so any puzzle can be regenerated.

## Performance

Measured on an M-series Mac, ten puzzles per tier:

| Tier   | Median | Worst   | Per-attempt hit rate |
| ------ | ------ | ------- | -------------------- |
| Easy   | 3 ms   | 9 ms    | ~100%                |
| Medium | 35 ms  | 67 ms   | ~13%                 |
| Hard   | 365 ms | 4097 ms | ~0.3–0.7%            |
| Expert | 30 ms  | 109 ms  | ~6%                  |

Hard is roughly 20× rarer than its neighbours — and rarer than Expert — because XY-Wing
sits in the Expert tier, so any puzzle needing one grades Expert instead. This was
measured and deliberately accepted rather than rebalanced; the [design
spec](docs/superpowers/specs/2026-09-08-sudoku-generator-design.md) records the reasoning
and the rejected alternative.

`generatePuzzle` is **synchronous**. Showing Hard puzzles in a browser means a visible
freeze on the tail; wrap it in a Web Worker. The engine is worker-compatible by
construction — no DOM, no globals, no shared state.

## Layout

```
src/engine/     the engine. Pure: no DOM, no dependencies, no ambient randomness.
  techniques/   six modules implementing thirteen solving techniques
  index.ts      the single public surface
src/ui/         browser harness. Holds no puzzle logic.
tests/          194 tests
scripts/bench.ts
docs/superpowers/specs/    the design spec — the contract
```

## Status

The engine and harness are complete. Not yet built: print layout and PDF export, and
library packaging for reuse from another repository. The spec records what packaging
would involve and the two constraints that keep it a config change rather than a
refactor.
