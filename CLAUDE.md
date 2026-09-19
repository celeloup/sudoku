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

## Design system

The design system for Sudoku de poche lives in `docs/design/`. It is the authority for every visual decision.

- `docs/design/design-system.md`: principles, tokens, components, patterns, print spec. Read it before writing or changing any UI.
- `docs/design/print-production.md`: how the printed A7 notebook is produced and checked.
- `docs/design/project-log.md`: decisions already made, the last audit, and the build order.

Rules when working on UI:

- Never invent a color, font, size, radius, shadow or duration. Use a token from `design-system.md`. If no token fits, stop and propose a new token instead of hardcoding a value.
- No raw values outside the token file. Components reference CSS custom properties only.
- Fonts are fixed: Agdasima, Akatab, Inter, JetBrains Mono, self-hosted. Do not substitute or add fonts.
- Identity is fixed: flat ink, hard offset shadows, no gradients, no blur, one ink per surface. Do not add a new aesthetic direction.
- Follow the build order in `project-log.md`. Start with the tokens file, then the grid component.
- When a component is built or changed, update its entry in `design-system.md` in the same change.
- When the code and the doc disagree, say so and ask which one is right. Do not silently pick one.
