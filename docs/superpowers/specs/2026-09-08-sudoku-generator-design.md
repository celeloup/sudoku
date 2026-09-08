# Sudoku Generator — Design

**Date:** 2026-09-08
**Status:** Approved, ready for implementation planning

## Purpose

Generate correct, uniquely-solvable sudoku puzzles at a requested difficulty, so a
later stage can lay them out as a printable notebook. This spec covers the
generation engine and a browser harness for playing and inspecting puzzles. Print
layout and PDF output are out of scope.

## Scope

In scope:

- A dependency-free TypeScript engine: full-grid generation, symmetric clue
  removal, brute-force solving, human-technique grading.
- Four difficulty tiers, decided by which solving techniques a puzzle requires.
- Seeded, reproducible generation.
- A batch API that generates N puzzles across a percentage mix of tiers.
- A browser test page: playable grid with pencil marks, and a step-by-step
  explainer.

Out of scope for this pass:

- Print layout, pagination, PDF export.
- A batch report UI. The batch API is covered by unit tests only.
- Puzzle persistence, accounts, sharing.
- **Library packaging.** See below.

### Deferred: packaging the engine for reuse

The engine is intended to be reused by a personal web portfolio, from this
repository, kept separate. Packaging is deliberately deferred until that
portfolio exists and its needs are known.

Nothing is lost by waiting, because the expensive half is already done: the
engine is pure, dependency-free, and DOM-free, so it is extractable — and
Web Worker-compatible — by construction. What remains is configuration:

- a Vite library build target emitting ESM from `src/engine/index.ts`
- `tsc --emitDeclarationOnly` for `.d.ts` output
- `package.json` `exports`, `files`, `types`, `sideEffects: false`
- relocating `src/index.html` so the app and library builds stop sharing a root

Two decisions already made, so they do not have to be revisited:

- **The package will export the synchronous engine only.** No worker wrapper.
  Worker bundling differs across Vite, Next.js, and plain script tags, so the
  consumer that knows its own toolchain should own that ~30 lines. `generatePuzzle`
  stays `(opts) => Puzzle`, never `Promise<Puzzle>`.
- **Consumption will be by git tag** (`"sudoku-engine": "github:…#v0.1.0"`) rather
  than an npm publish, unless that proves awkward.

The known cost of deferring: Expert generation can block for seconds, so the
portfolio will need its own worker before showing an Expert puzzle. The engine
requires no change for that.

**What keeps this cheap:** `src/engine/` must never import from `src/ui/`, and
`src/engine/index.ts` must stay the single public surface. Both are already
enforced as constraints in the implementation plan. Breaking either turns a
config change into a refactor.

## Architecture

The system splits into a pure engine and a thin harness. The engine touches no
DOM and has no runtime dependencies. The harness holds no puzzle logic.

```
src/
  engine/
    grid.ts          # Grid representation, candidate bitmasks
    rng.ts           # Seeded PRNG (mulberry32) + string -> seed hash
    solver-brute.ts  # Backtracking solver, countSolutions(grid, cap)
    techniques/      # One module per human technique
      singles.ts
      pairs.ts
      intersections.ts
      fish.ts
      wings.ts
    grader.ts        # Runs the technique ladder -> SolvePath + Difficulty
    generator.ts     # Full-grid generation, symmetric digging, generatePuzzle
    batch.ts         # generateSet
    index.ts         # Public API surface
  ui/
    board.ts         # Grid rendering, input, pencil marks, conflicts
    explainer.ts     # Next-step panel
    main.ts          # Wiring
  index.html
```

Stack: TypeScript, Vite for the dev server and build, Vitest for tests. No runtime
dependencies in the engine.

### Module boundaries

`grader.ts` is the sole authority on difficulty. `generator.ts` consumes it as a
black box and never reasons about difficulty itself.

Every technique module exports a function of one shape:

```ts
type Technique = (grid: Grid) => Deduction[] | null;
```

A technique never mutates the grid. It reports what it found, or `null` if it does
not apply. This makes each technique independently unit-testable and lets the
explainer and the grader share one implementation of the rules.

### Data model

- Values: `Uint8Array(81)`, row-major, `0` for empty.
- Candidates: `Uint16Array(81)`, bit `n` set means digit `n + 1` is possible.

Bitmasks make pair, triple, and fish detection cheap bit arithmetic. This matters
because the grader runs after every candidate clue removal during generation.

### Grid vs. Puzzle vs. PlayState

Three types carry cell values and are easy to confuse. They have distinct jobs:

| Type | Mutability | Lifetime | Knows givens vs. filled? | Carries candidates? |
|---|---|---|---|---|
| `Grid` | mutable | during one solve or grade | no | yes |
| `Puzzle` | immutable | the artifact | yes (it is all givens) | no |
| `PlayState` | mutable | one browser session | yes | pencil marks only |

- **`Grid` is the solver's scratchpad.** Techniques mutate it step by step as they
  fire. It has no notion of which cells were given and which were deduced, because
  no solving technique needs that distinction. It exists only inside a computation;
  it is in the public API solely because `grade` and `solve` accept one.
- **`Puzzle` is the finished record.** Givens, solution, and provenance (seed, tier,
  score, clue count). It deliberately carries no candidates — those are derived
  state and meaningless to persist. This is what `generatePuzzle` emits and what the
  print layer will later consume.
- **`PlayState` is harness-only** and lives in `ui/board.ts`, never in the engine.
  It exists because playing a puzzle needs a distinction neither engine type makes:
  locked givens, erasable player entries, and pencil marks.

A single puzzle produces many grids over its lifetime. `gridFromValues` is the only
bridge between them:

```ts
gridFromValues(values: Uint8Array): Grid;  // exported from grid.ts, public
```

It allocates a fresh `Grid` and computes candidates from scratch. Grading a puzzle
is therefore `grade(gridFromValues(puzzle.givens))`. The harness calls it on every
*Next step* press, projecting current play state into a throwaway grid:

```ts
interface PlayState {
  puzzle: Puzzle;
  entries: Uint8Array;   // 81, player-entered digits, 0 where untouched
  marks: Uint16Array;    // 81, player pencil marks as bitmasks
}

// givens win over entries; a given cell can never be overwritten
toGrid(state: PlayState): Grid;
```

`marks` are the player's own annotations and are never fed to the engine — the
explainer computes real candidates from `gridFromValues`, so a wrong pencil mark
cannot mislead a hint.

## Public API

```ts
type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface Grid {
  values: Uint8Array;      // 81, 0 = empty
  candidates: Uint16Array; // 81, bit n set = digit n+1 possible
}

interface Deduction {
  technique: string;       // e.g. 'hidden-single'
  cost: number;
  cell?: number;           // 0..80, set when a digit is placed
  value?: number;          // 1..9, set when a digit is placed
  eliminations?: Array<{ cell: number; value: number }>;
  because: number[];       // supporting cells, for explainer highlighting
  text: string;            // human-readable, for the explainer
}

type SolvePath = Deduction[];

interface Puzzle {
  givens: Uint8Array;    // 81, 0 = empty
  solution: Uint8Array;  // 81
  difficulty: Difficulty;
  score: number;
  clueCount: number;
  seed: string;          // regenerates this exact puzzle
}

generatePuzzle(opts: { difficulty: Difficulty; seed?: string }): Puzzle;

generateSet(opts: {
  count: number;
  mix: Partial<Record<Difficulty, number>>;  // percentages, must sum to 100
  seed?: string;
}): Puzzle[];

grade(
  grid: Grid,
  opts?: { maxTier?: Difficulty },
): {
  difficulty: Difficulty;
  score: number;
  path: SolvePath;
  outcome: 'solved' | 'stalled' | 'exceeded-max-tier';
};

solve(grid: Grid): Grid | null;

gridFromValues(values: Uint8Array): Grid;
```

`grade` reports `outcome` rather than throwing, because the digging loop treats
`stalled` and `exceeded-max-tier` as ordinary control flow. `maxTier` is the early-exit
hint described under [Generation algorithm](#step-2--symmetric-digging); omitting it
grades the puzzle to completion.

## Difficulty model

The grader runs techniques in strict cost order. It applies the cheapest technique
that fires, then restarts the ladder from the top — the way a person solves.

| Tier | Technique | Cost |
|---|---|---|
| Easy | Naked single | 1 |
| Easy | Hidden single | 2 |
| Medium | Naked pair | 5 |
| Medium | Pointing pair/triple | 6 |
| Medium | Claiming (box-line reduction) | 6 |
| Medium | Naked triple | 8 |
| Hard | Hidden pair | 10 |
| Hard | Naked quad | 12 |
| Hard | Hidden triple | 12 |
| Hard | X-Wing | 15 |
| Expert | Swordfish | 22 |
| Expert | XY-Wing | 24 |
| Expert | XYZ-Wing | 26 |

A grade produces two numbers, serving different purposes:

- `difficulty` — the tier of the hardest technique the puzzle actually required.
  This is the printed label and the value the digging loop matches against. Tier is
  primary because a single forced X-Wing makes a puzzle hard regardless of how many
  easy singles surround it.
- `score` — the weighted sum of every step taken. Orders puzzles within a tier and
  provides a continuous signal for a future gentle-ramp notebook ordering.

### Logic-only guarantee

If the ladder stalls — no technique fires and the grid is incomplete — the puzzle
is **rejected**, not promoted to Expert. No generated puzzle ever requires
guessing. This is why grading happens inside the digging loop rather than after it.

### Determinism caveat

Because the grader always applies the cheapest available technique, a given grid
always grades identically. This is not the only path a human might take — a solver
might spot an X-Wing before exhausting the singles — but it is a stable lower bound
on what the puzzle requires, which is the honest thing to label.

## Generation algorithm

One seeded `mulberry32` instance, seeded by hashing the seed string, is threaded
through every random choice: grid fill, dig order, retries. Nothing in the engine
calls `Math.random`.

### Step 1 — Full solved grid

Randomized backtracking fill. At each empty cell, try candidate digits in
RNG-shuffled order.

### Step 2 — Symmetric digging

Build the 41 removal units: 40 mirror pairs under 180 degree rotation, plus the
centre cell. Shuffle with the seeded RNG, then:

```
for each unit:
  remove it
  if countSolutions(grid, cap 2) !== 1   -> restore, next
  g = grade(grid, { maxTier: target })
  if g stalled (requires guessing)       -> restore, next
  if g.tier > target                     -> restore, next
  if g.tier === target                   -> record snapshot, keep digging
return last recorded snapshot, or null
```

Two deliberate choices:

- **Keep digging after entering the band.** Rather than stopping at first touch,
  continue removing while the tier holds and return the last in-band snapshot. Same
  loop cost, but yields the fewest-clue puzzle for that tier, which looks better on
  the page and gives the tier real teeth.
- **`maxTier` lets the grader bail early.** If a technique above the target tier
  fires, the grader stops immediately and reports overshoot. Since grading runs
  after every candidate removal, this early exit is the difference between
  comfortable and sluggish generation.

Difficulty rising as clues are removed is an empirical regularity, not a theorem.
The restore-on-overshoot branch makes the loop correct regardless.

Clue count is an output of this process, never an input. There are no per-tier clue
count targets.

### Step 3 — Retry

If digging never reaches the target tier from a given solution grid, discard it and
generate a new one. Cap at 50 attempts plus a wall-clock budget. On exhaustion,
throw `GenerationError` carrying the attempt count and the best tier actually
reached, so a failure explains itself.

### Batch generation

```ts
generateSet({ count: 30, mix: { medium: 60, hard: 40 } })  // 18 medium, 12 hard
```

- `mix` values are percentages and must sum to 100. Omitted tiers are 0.
- A `mix` that does not sum to 100 throws `InvalidMixError`. It is never normalised
  silently, so a typo surfaces immediately rather than quietly reshaping a notebook.
- Counts are distributed by largest-remainder rounding, so
  `count: 10, mix: { easy: 33, medium: 33, hard: 34 }` yields 3/3/4 and always
  exactly `count` puzzles.
- Each puzzle derives its seed as `` `${seed}:${index}` ``, so a single puzzle in a
  set can be regenerated in isolation.
- Results are returned in a deterministic order. Arranging a notebook's difficulty
  ramp belongs to the print layer, not the engine.

## Browser test harness

One page, three regions.

**Controls.** Tier selector, seed field (blank means random; the seed actually used
is always written back so it can be copied), Generate button.

**Grid.** Click to select a cell, digit keys to fill, `N` toggles pencil-mark mode,
arrow keys move the selection. Digits conflicting on row, column, or box highlight
red immediately. Player-entered digits are visually distinct from givens; givens are
locked.

The page holds one `PlayState`. Givens come from `puzzle.givens` and are locked;
typing writes to `entries`; pencil-mark mode writes to `marks`.

**Explainer.** A *Next step* button projects the current `PlayState` through
`toGrid`, runs the technique ladder against it, and reports the deduction in words — for example, "Hidden single: r4c7 =
8, the only cell in box 5 that can hold 8" — highlighting the cells involved. It
calls the same `techniques/` modules the grader uses. If the explainer is wrong, the
grader is wrong: one implementation, two consumers.

## Testing strategy

Vitest, organised by layer.

**Techniques.** The highest-value tests. Each technique gets hand-built grids where
it must fire with a known deduction, and near-miss grids where it must not. A
technique that fires spuriously silently corrupts every difficulty grade downstream,
so this coverage is exhaustive rather than token.

**Grid construction.** `gridFromValues` computes candidates correctly for a fresh
puzzle, for a partially filled grid, and for the empty grid (every cell holds all
nine candidates). `toGrid` gives givens precedence over entries and ignores `marks`
entirely — a deliberately wrong pencil mark must not change the resulting grid.

**Brute solver.** Known puzzles solve correctly. A puzzle with two solutions returns
exactly 2 from `countSolutions(cap 2)`. An over-constrained grid returns 0.

**Grader.** A fixture set of published puzzles with independently known ratings;
assert the tier, and assert that replaying the returned `SolvePath` reconstructs the
solution. Replay is the real check — it proves the path is genuine rather than a
plausible-looking list.

**Generator.** Property tests rather than golden values, since output is random. For
every tier, every generated puzzle:

- has exactly one solution
- grades to the tier requested
- has a 180 degree rotationally symmetric pattern of givens
- carries a `solution` that actually solves its `givens`

**Determinism.** The same seed produces byte-identical `givens` across separate
process runs. This catches accidental `Math.random` use.

**Batch.** Percentages distribute correctly, including the 33/33/34 case. A bad
`mix` throws. Per-index seeds are stable.

## Error handling

The engine throws typed errors and never returns a half-valid puzzle.

- `GenerationError` — budget exhausted; carries attempts made and best tier reached.
- `InvalidMixError` — `mix` does not sum to 100, or `count` is not a positive
  integer.
- `InvalidGridError` — input grid is malformed or already contradictory.

The harness catches these and displays the message rather than failing silently.

## Performance budget

Targets on the development machine, for a single puzzle:

| Tier | Target |
|---|---|
| Easy | < 200 ms |
| Medium | < 200 ms |
| Hard | < 1 s |
| Expert | < 5 s |

These are not asserted in unit tests, since they are machine-dependent and would be
flaky. A `bench` script reports them so a regression is visible.

## Open questions

None. All decisions above are settled.