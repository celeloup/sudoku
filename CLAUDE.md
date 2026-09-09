# Sudoku generator

Dependency-free TypeScript engine that generates uniquely-solvable sudoku puzzles at a
requested difficulty, plus a browser harness for playing and inspecting them.

Design spec: `docs/superpowers/specs/2026-09-08-sudoku-generator-design.md`. It is the
contract — read it before changing behaviour, and update it when behaviour changes.

## Commands

```bash
npm run dev        # Vite dev server for the browser harness
npm run verify     # typecheck -> lint -> format:check -> test. THE gate.
npm test           # vitest run
npm run build      # tsc --noEmit && vite build
npm run bench      # per-tier generation timings (several seconds; not part of verify)
```

`npm run verify` must pass before any commit. Never weaken a test, a lint rule, or a
tsconfig flag to get it green.

## Architecture

`src/engine/` is pure: zero runtime dependencies, no DOM, no ambient randomness.
`src/ui/` is a thin harness holding no puzzle logic. The boundary is what keeps the
deferred library packaging a config change rather than a refactor.

```
src/engine/
  types.ts          Difficulty, TIER_ORDER, Deduction, SolvePath, Puzzle
  errors.ts         GenerationError, InvalidMixError, InvalidGridError
  grid.ts           Grid, unit/peer tables, bitmask helpers, gridFromValues
  rng.ts            seeded PRNG; the ONLY sanctioned Math.random call site
  solver-brute.ts   solveValues, countSolutions (uniqueness checks)
  techniques/       six modules, thirteen techniques, one shared contract
  grader.ts         the cost-ordered ladder; decides difficulty
  generator.ts      full-grid fill, symmetric digging, generatePuzzle
  batch.ts          generateSet across a percentage mix of tiers
  index.ts          THE public surface
src/ui/             board.ts (PlayState + rendering), explainer.ts, main.ts
```

## Invariants

Four of these are enforced by ESLint, not by convention. Do not work around them.

1. **Engine purity.** `src/engine/` never touches `document`/`window`, never imports
   from `src/ui/`, and has zero runtime dependencies.
2. **Seeded determinism.** Nothing calls `Math.random` except `randomSeed()` in
   `rng.ts`. The same seed yields a byte-identical puzzle.
3. **Single public surface.** `src/engine/index.ts` is it. `src/ui/` imports from
   `'../engine'`, never from a submodule. Tests may import submodules directly.
4. **The technique contract.** Every technique is `(grid: Grid) => Deduction[] | null`
   and never mutates the grid. It returns every deduction it can see in one pass.
5. **Clue count is an output, never an input.** There are no per-tier clue targets, and
   adding one would break the difficulty model. Counts land at ~27-28 for every tier.

## How difficulty works

A puzzle's tier is the hardest technique it _requires_, not its clue count. The grader
walks a cost-ordered ladder, applies every deduction the cheapest firing technique
found, and restarts. If nothing fires and the grid is incomplete the outcome is
`stalled` — never promoted to a harder tier. That is what guarantees every generated
puzzle is solvable by logic alone.

Costs, which `grader.ts`'s LADDER is keyed on: naked-single 1, hidden-single 2,
naked-pair 5, pointing 6, claiming 6, naked-triple 8, hidden-pair 10, naked-quad 12,
hidden-triple 12, x-wing 15, swordfish 22, xy-wing 24, xyz-wing 26.

**Hard is ~20x rarer than its neighbours, and rarer than Expert.** XY-Wing sits in
Expert, so any puzzle needing one grades Expert instead, leaving Hard a narrow band.
`MAX_ATTEMPTS` is 3000 because of this. It was measured, escalated, and deliberately
accepted; the spec records the rejected alternative. Do not "fix" it by rebalancing
tiers without revisiting that decision.

## Gotchas

- **`generatePuzzle` blocks synchronously.** Hard has a ~365 ms median and a ~4 s tail.
  A browser consumer showing Hard puzzles needs a Web Worker; the engine is
  worker-compatible by construction, but shipping one is deliberately deferred.
- **`GradeResult.difficulty` is meaningless unless `outcome === 'solved'`.** Otherwise
  it reports the hardest tier used so far, defaulting to `'easy'` — so ignoring
  `outcome` yields `'easy'` for a grid that cannot be solved by logic at all.
- **`toGrid` throws `InvalidGridError`** when the player's position is contradictory.
  The explainer catches it; that is deliberate, so the caller that can report it does.
- **`noUncheckedIndexedAccess` is on**, so `!` on an indexed read is the codebase idiom
  and `no-non-null-assertion` is deliberately off. `!` papering over a genuinely
  nullable value is still wrong.

## Testing

Every test must be able to fail. Before adding one, name the mutation of the
implementation that would break it — if you cannot, the test is worthless. Thirteen
tests that could not fail were found and fixed while building this; the failure mode is
real and easy to reproduce.

For a test guarding a specific branch, verify it by actually deleting that branch and
confirming the test fails. Synthetic sudoku fixtures in particular have emergent
properties that are easy to get wrong by hand — several fixtures written from reasoning
alone turned out to admit extra deductions, or to assert something true for the wrong
reason.

`renderBoard` is intentionally not unit-tested; it is verified by hand in a browser.
