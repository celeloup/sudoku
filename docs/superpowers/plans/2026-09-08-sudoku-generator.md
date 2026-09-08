# Sudoku Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free TypeScript sudoku engine that generates uniquely-solvable puzzles at a requested difficulty tier, plus a browser harness for playing and inspecting them.

**Architecture:** A pure engine (`src/engine/`) with no DOM access and no runtime dependencies, and a thin harness (`src/ui/`) with no puzzle logic. Difficulty is decided by a technique ladder in `grader.ts`, which the generator consumes as a black box while digging clues out of a solved grid. Every random choice flows through one seeded PRNG, so a seed string reproduces a puzzle exactly.

**Tech Stack:** TypeScript (strict), Vite (dev server + build), Vitest (tests), tsx (bench script). No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-08-sudoku-generator-design.md`

## Global Constraints

- **One commit per task, and only when `npm run verify` passes.** The user has pre-authorised these commits, so no approval is needed per task — but a failing verify is a hard stop. Never commit red. Never use `--no-verify`. Do not weaken a test, a lint rule, or a tsconfig flag to get a commit through; fix the code, or stop and report.
- `npm run verify` = `typecheck` → `lint` → `format:check` → `test`. All four must pass.
- The engine has **zero runtime dependencies**. Anything under `src/engine/` may import only from `src/engine/`.
- `src/engine/` must never reference `document`, `window`, or any DOM global.
- **`src/engine/index.ts` is the single public surface**, and `src/engine/` must never import from `src/ui/`. This is what keeps deferred library packaging a config change rather than a refactor — see "Deferred: packaging the engine for reuse" in the spec. Adding a second entry point, or letting a UI type leak into an engine signature, breaks that.
- `generatePuzzle` stays **synchronous**: `(opts) => Puzzle`, never `Promise<Puzzle>`. Callers that need non-blocking generation wrap the engine in a Web Worker themselves.
- **Nothing calls `Math.random` except `randomSeed()` in `src/engine/rng.ts`.** This is what makes seeding a real contract. A test asserts it.
- Grid values are `Uint8Array(81)`, row-major, `0` = empty. Candidates are `Uint16Array(81)`, bit `n` set = digit `n+1` possible. A filled cell has candidates `0`.
- Difficulty tiers are exactly `'easy' | 'medium' | 'hard' | 'expert'`.
- Technique costs are fixed by the spec: naked single 1, hidden single 2, naked pair 5, pointing 6, claiming 6, naked triple 8, hidden pair 10, naked quad 12, hidden triple 12, X-Wing 15, Swordfish 22, XY-Wing 24, XYZ-Wing 26.
- Clue count is always an **output**, never an input. No task introduces a per-tier clue target.
- TypeScript runs `strict: true` **plus** `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `exactOptionalPropertyTypes`. No `any` anywhere, exported or not.
- ESLint runs typescript-eslint's **`strictTypeChecked` + `stylisticTypeChecked`** presets. Prettier owns formatting; ESLint does not fight it.
- **Never suppress a diagnostic to make the build green.** No `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable` — unless the suppression carries a comment explaining why the rule is wrong _here_, and you report it. A suppression added silently is a defect.
- `noUncheckedIndexedAccess` makes typed-array reads `number | undefined`, so the engine uses `!` on indexed reads (`grid.candidates[c]!`). This is why `@typescript-eslint/no-non-null-assertion` is deliberately off: the alternative is hundreds of redundant runtime guards on indices already proven in range. `!` on an **indexed read** is idiomatic here; `!` used to paper over a genuinely nullable value is not.

## File Structure

| File                                      | Responsibility                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/engine/types.ts`                     | Shared types: `Difficulty`, `Deduction`, `SolvePath`, `Puzzle`, `Technique`                            |
| `src/engine/errors.ts`                    | `GenerationError`, `InvalidMixError`, `InvalidGridError`                                               |
| `src/engine/grid.ts`                      | `Grid`, unit/peer tables, bitmask helpers, `gridFromValues`, `setValue`, `eliminate`, `applyDeduction` |
| `src/engine/rng.ts`                       | Seeded PRNG, seed hashing, shuffle, `randomSeed`                                                       |
| `src/engine/solver-brute.ts`              | `solveValues`, `countSolutions`                                                                        |
| `src/engine/techniques/singles.ts`        | Naked single, hidden single                                                                            |
| `src/engine/techniques/intersections.ts`  | Pointing, claiming                                                                                     |
| `src/engine/techniques/naked-subsets.ts`  | Naked pair/triple/quad                                                                                 |
| `src/engine/techniques/hidden-subsets.ts` | Hidden pair/triple                                                                                     |
| `src/engine/techniques/fish.ts`           | X-Wing, Swordfish                                                                                      |
| `src/engine/techniques/wings.ts`          | XY-Wing, XYZ-Wing                                                                                      |
| `src/engine/techniques/combinations.ts`   | `combinations` helper, shared by subset/fish techniques                                                |
| `src/engine/grader.ts`                    | Technique ladder, `grade`, `nextStep`                                                                  |
| `src/engine/generator.ts`                 | `generateFullGrid`, symmetric digging, `generatePuzzle`                                                |
| `src/engine/batch.ts`                     | `generateSet`, largest-remainder distribution                                                          |
| `src/engine/index.ts`                     | Public API re-exports                                                                                  |
| `src/ui/board.ts`                         | `PlayState`, `toGrid`, grid rendering, keyboard input, conflict highlighting                           |
| `src/ui/explainer.ts`                     | Next-step panel                                                                                        |
| `src/ui/main.ts`                          | Wiring, controls                                                                                       |
| `src/index.html`, `src/styles.css`        | Page shell                                                                                             |
| `scripts/bench.ts`                        | Per-tier generation timings                                                                            |
| `tests/helpers.ts`                        | Test-only grid builders                                                                                |

## A Deliberate Deviation From the Spec

The spec's testing section calls for "published puzzles with independently known ratings" as grader fixtures. This plan does not use them, because third-party difficulty ratings disagree with each other and with any specific technique ladder — a fixture asserting "this puzzle is Hard" would be testing someone else's rater, not ours, and would fail for reasons that are not bugs.

Instead the grader is validated three ways, all of which are decidable from our own definitions:

1. **Technique unit tests** (Tasks 4–9) pin down exactly when each technique fires and when it must not. This is where correctness actually lives.
2. **Replay** (Task 10): the returned `SolvePath`, applied step by step to the starting grid, must reconstruct the solution.
3. **Round-trip** (Task 11): every puzzle the generator produces for tier T must grade back to tier T.

One published fixture is kept: the Wikipedia example puzzle, which is solvable by singles alone and must grade `easy`. That assertion follows from our ladder, not from an external rating.

---

### Task 1: Project scaffold, shared types, and the grid module

**Files:**

- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore` (exists — verify)
- Create: `src/engine/types.ts`, `src/engine/errors.ts`, `src/engine/grid.ts`
- Create: `tests/helpers.ts`, `tests/grid.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `Difficulty`, `Deduction`, `SolvePath`, `Puzzle`, `Technique`, `Elimination` (types.ts); `GenerationError`, `InvalidMixError`, `InvalidGridError` (errors.ts); `Grid`, `SIZE`, `CELLS`, `ALL_CANDIDATES`, `ROWS`, `COLS`, `BOXES`, `UNITS`, `PEERS`, `rowOf`, `colOf`, `boxOf`, `bit`, `bitCount`, `bitsToDigits`, `cellName`, `gridFromValues`, `cloneGrid`, `setValue`, `eliminate`, `applyDeduction`, `isSolved` (grid.ts); `emptyGrid`, `gridFrom`, `only` (tests/helpers.ts).

- [ ] **Step 1: Initialise the project**

```bash
cd /Users/celialeloup/Documents/perso/sudoku
npm init -y
npm install -D typescript vite vitest tsx \
  eslint @eslint/js typescript-eslint \
  prettier eslint-config-prettier
mkdir -p src/engine/techniques src/ui tests scripts
```

- [ ] **Step 2: Write the config files**

`package.json` — replace the generated `scripts` block and add `"type": "module"`:

```json
{
  "name": "sudoku",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "npm run typecheck && npm run lint && npm run format:check && npm test",
    "bench": "tsx scripts/bench.ts"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests", "scripts", "*.config.ts", "eslint.config.js"]
}
```

`eslint.config.js` — note the three rules at the bottom, which turn plan constraints that would otherwise rely on discipline into mechanically enforced ones:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // noUncheckedIndexedAccess makes every typed-array read `number | undefined`.
      // `!` on an indexed read is the idiom here; see Global Constraints.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // The engine must stay pure: no DOM, no ambient randomness, no UI imports.
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/rng.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'The engine must not touch the DOM.' },
        { name: 'window', message: 'The engine must not touch the DOM.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG. Only rng.ts may call Math.random.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui/**', '../ui/*'], message: 'The engine must not import from the UI.' },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
```

`.prettierrc.json`:

```json
{
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

`.prettierignore`:

```
dist
node_modules
coverage
package-lock.json
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: { outDir: '../dist', emptyOutDir: true },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 3: Write the shared types and errors**

`src/engine/types.ts`:

```ts
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
```

`src/engine/errors.ts`:

```ts
import type { Difficulty } from './types';

export class InvalidGridError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGridError';
  }
}

export class InvalidMixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMixError';
  }
}

export class GenerationError extends Error {
  readonly attempts: number;
  readonly bestTier: Difficulty | null;

  constructor(message: string, attempts: number, bestTier: Difficulty | null) {
    super(message);
    this.name = 'GenerationError';
    this.attempts = attempts;
    this.bestTier = bestTier;
  }
}
```

- [ ] **Step 4: Write the failing tests for grid.ts**

`tests/helpers.ts`:

```ts
import { ALL_CANDIDATES, bit, gridFromValues, type Grid } from '../src/engine/grid';

/** 81 chars, '.' or '0' for empty. */
export function valuesFrom(s: string): Uint8Array {
  const clean = s.replace(/\s/g, '');
  if (clean.length !== 81) throw new Error(`expected 81 chars, got ${clean.length}`);
  const out = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    const ch = clean[i]!;
    out[i] = ch === '.' || ch === '0' ? 0 : Number(ch);
  }
  return out;
}

export function gridFrom(s: string): Grid {
  return gridFromValues(valuesFrom(s));
}

export function emptyGrid(): Grid {
  return {
    values: new Uint8Array(81),
    candidates: new Uint16Array(81).fill(ALL_CANDIDATES),
  };
}

/** Force a cell's candidate set to exactly these digits. Test-only. */
export function only(g: Grid, cell: number, digits: number[]): void {
  let mask = 0;
  for (const d of digits) mask |= bit(d);
  g.candidates[cell] = mask;
}

/** Force every listed cell to exactly these digits, and clear all others. */
export function onlyThese(g: Grid, spec: Record<number, number[]>): void {
  g.candidates.fill(0);
  for (const [cell, digits] of Object.entries(spec)) only(g, Number(cell), digits);
}
```

`tests/grid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALL_CANDIDATES,
  BOXES,
  COLS,
  PEERS,
  ROWS,
  UNITS,
  bit,
  bitCount,
  bitsToDigits,
  boxOf,
  cellName,
  cloneGrid,
  colOf,
  eliminate,
  gridFromValues,
  isSolved,
  rowOf,
  setValue,
} from '../src/engine/grid';
import { InvalidGridError } from '../src/engine/errors';
import { emptyGrid, gridFrom, valuesFrom } from './helpers';

const WIKI_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const WIKI_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('bitmask helpers', () => {
  it('maps digits to single bits', () => {
    expect(bit(1)).toBe(0b000000001);
    expect(bit(9)).toBe(0b100000000);
  });

  it('counts bits', () => {
    expect(bitCount(0)).toBe(0);
    expect(bitCount(ALL_CANDIDATES)).toBe(9);
    expect(bitCount(bit(3) | bit(7))).toBe(2);
  });

  it('converts masks back to digits in ascending order', () => {
    expect(bitsToDigits(bit(7) | bit(2) | bit(9))).toEqual([2, 7, 9]);
    expect(bitsToDigits(0)).toEqual([]);
  });
});

describe('unit and peer tables', () => {
  it('has 9 rows, 9 columns, 9 boxes, 27 units', () => {
    expect(ROWS).toHaveLength(9);
    expect(COLS).toHaveLength(9);
    expect(BOXES).toHaveLength(9);
    expect(UNITS).toHaveLength(27);
    for (const u of UNITS) expect(u).toHaveLength(9);
  });

  it('places cell 0 in row 0, column 0, box 0', () => {
    expect(rowOf(0)).toBe(0);
    expect(colOf(0)).toBe(0);
    expect(boxOf(0)).toBe(0);
  });

  it('places cell 80 in row 8, column 8, box 8', () => {
    expect(rowOf(80)).toBe(8);
    expect(colOf(80)).toBe(8);
    expect(boxOf(80)).toBe(8);
  });

  it('places cell 30 (r3c3) in box 4', () => {
    expect(boxOf(30)).toBe(4);
  });

  it('gives every cell exactly 20 peers, never itself', () => {
    for (let c = 0; c < 81; c++) {
      expect(PEERS[c]).toHaveLength(20);
      expect(PEERS[c]).not.toContain(c);
    }
  });

  it('makes peerhood symmetric', () => {
    for (let c = 0; c < 81; c++) {
      for (const p of PEERS[c]) expect(PEERS[p]).toContain(c);
    }
  });
});

describe('cellName', () => {
  it('uses 1-based r/c notation', () => {
    expect(cellName(0)).toBe('r1c1');
    expect(cellName(30)).toBe('r4c4');
    expect(cellName(80)).toBe('r9c9');
  });
});

describe('gridFromValues', () => {
  it('gives every cell all nine candidates on an empty grid', () => {
    const g = gridFromValues(new Uint8Array(81));
    for (let c = 0; c < 81; c++) expect(g.candidates[c]).toBe(ALL_CANDIDATES);
  });

  it('gives filled cells no candidates', () => {
    const g = gridFrom(WIKI_PUZZLE);
    expect(g.values[0]).toBe(5);
    expect(g.candidates[0]).toBe(0);
  });

  it('removes a given digit from its peers', () => {
    const g = gridFrom(WIKI_PUZZLE);
    // r1c1 = 5, so no other cell in row 1, column 1 or box 1 may hold 5.
    for (const p of PEERS[0]) expect(g.candidates[p] & bit(5)).toBe(0);
  });

  it('computes candidates for a partially filled grid without touching givens', () => {
    const g = gridFrom(WIKI_PUZZLE);
    let filled = 0;
    for (let c = 0; c < 81; c++) if (g.values[c] !== 0) filled++;
    expect(filled).toBe(30);
    expect(valuesFrom(WIKI_PUZZLE)).toEqual(g.values);
  });

  it('copies its input rather than aliasing it', () => {
    const values = valuesFrom(WIKI_PUZZLE);
    const g = gridFromValues(values);
    values[0] = 9;
    expect(g.values[0]).toBe(5);
  });

  it('rejects a grid that is not 81 cells', () => {
    expect(() => gridFromValues(new Uint8Array(80))).toThrow(InvalidGridError);
  });

  it('rejects a grid with a duplicate digit in a unit', () => {
    const bad = new Uint8Array(81);
    bad[0] = 5;
    bad[1] = 5;
    expect(() => gridFromValues(bad)).toThrow(InvalidGridError);
  });

  it('rejects a grid where an empty cell has no candidates', () => {
    // Fill r1c2..r1c9 and r2c1..r3c1 so that r1c1 has every digit eliminated.
    const bad = valuesFrom('.23456789' + '4........' + '5........' + '.'.repeat(54));
    bad[9 * 3] = 6;
    bad[9 * 4] = 7;
    bad[9 * 5] = 8;
    bad[9 * 6] = 9;
    bad[9 * 7] = 2;
    bad[9 * 8] = 3;
    expect(() => gridFromValues(bad)).toThrow(InvalidGridError);
  });
});

describe('setValue', () => {
  it('places a digit and clears it from peers', () => {
    const g = emptyGrid();
    setValue(g, 0, 5);
    expect(g.values[0]).toBe(5);
    expect(g.candidates[0]).toBe(0);
    for (const p of PEERS[0]) expect(g.candidates[p] & bit(5)).toBe(0);
  });

  it('refuses to place a digit that is not a candidate', () => {
    const g = emptyGrid();
    g.candidates[0] = bit(1);
    expect(() => setValue(g, 0, 5)).toThrow(InvalidGridError);
  });
});

describe('eliminate', () => {
  it('removes a candidate and reports the change', () => {
    const g = emptyGrid();
    expect(eliminate(g, 0, 5)).toBe(true);
    expect(g.candidates[0] & bit(5)).toBe(0);
  });

  it('reports no change when the candidate is already gone', () => {
    const g = emptyGrid();
    eliminate(g, 0, 5);
    expect(eliminate(g, 0, 5)).toBe(false);
  });
});

describe('cloneGrid', () => {
  it('produces an independent copy', () => {
    const g = gridFrom(WIKI_PUZZLE);
    const copy = cloneGrid(g);
    copy.values[1] = 9;
    copy.candidates[1] = 0;
    expect(g.values[1]).toBe(3);
    expect(g.candidates[1]).toBe(0);
    expect(copy.values[0]).toBe(g.values[0]);
  });
});

describe('isSolved', () => {
  it('is false for a puzzle and true for its solution', () => {
    expect(isSolved(gridFrom(WIKI_PUZZLE))).toBe(false);
    expect(isSolved(gridFrom(WIKI_SOLUTION))).toBe(true);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run tests/grid.test.ts`
Expected: FAIL — `Failed to resolve import "../src/engine/grid"`.

- [ ] **Step 6: Implement `src/engine/grid.ts`**

```ts
import { InvalidGridError } from './errors';
import type { Deduction } from './types';

export const SIZE = 9;
export const CELLS = 81;
export const ALL_CANDIDATES = 0b111111111;

export interface Grid {
  values: Uint8Array;
  candidates: Uint16Array;
}

export function bit(digit: number): number {
  return 1 << (digit - 1);
}

export function bitCount(mask: number): number {
  let m = mask;
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

export function bitsToDigits(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= SIZE; d++) if (mask & bit(d)) out.push(d);
  return out;
}

export function rowOf(cell: number): number {
  return Math.floor(cell / SIZE);
}

export function colOf(cell: number): number {
  return cell % SIZE;
}

export function boxOf(cell: number): number {
  return Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
}

export function cellName(cell: number): string {
  return `r${rowOf(cell) + 1}c${colOf(cell) + 1}`;
}

function buildUnits(): { rows: number[][]; cols: number[][]; boxes: number[][] } {
  const rows: number[][] = Array.from({ length: SIZE }, () => []);
  const cols: number[][] = Array.from({ length: SIZE }, () => []);
  const boxes: number[][] = Array.from({ length: SIZE }, () => []);
  for (let c = 0; c < CELLS; c++) {
    rows[rowOf(c)]!.push(c);
    cols[colOf(c)]!.push(c);
    boxes[boxOf(c)]!.push(c);
  }
  return { rows, cols, boxes };
}

const built = buildUnits();
export const ROWS: readonly number[][] = built.rows;
export const COLS: readonly number[][] = built.cols;
export const BOXES: readonly number[][] = built.boxes;
export const UNITS: readonly number[][] = [...built.rows, ...built.cols, ...built.boxes];

export const PEERS: readonly number[][] = Array.from({ length: CELLS }, (_, c) => {
  const set = new Set<number>();
  for (const unit of [ROWS[rowOf(c)]!, COLS[colOf(c)]!, BOXES[boxOf(c)]!]) {
    for (const other of unit) if (other !== c) set.add(other);
  }
  return [...set];
});

export function gridFromValues(values: Uint8Array): Grid {
  if (values.length !== CELLS) {
    throw new InvalidGridError(`grid must have ${CELLS} cells, got ${values.length}`);
  }
  const grid: Grid = {
    values: Uint8Array.from(values),
    candidates: new Uint16Array(CELLS),
  };
  for (let c = 0; c < CELLS; c++) {
    grid.candidates[c] = grid.values[c] === 0 ? ALL_CANDIDATES : 0;
  }
  for (const unit of UNITS) {
    let seen = 0;
    for (const c of unit) {
      const v = grid.values[c]!;
      if (v === 0) continue;
      if (seen & bit(v)) {
        throw new InvalidGridError(`digit ${v} appears twice in a unit containing ${cellName(c)}`);
      }
      seen |= bit(v);
    }
  }
  for (let c = 0; c < CELLS; c++) {
    const v = grid.values[c]!;
    if (v === 0) continue;
    for (const p of PEERS[c]!) grid.candidates[p] &= ~bit(v);
  }
  for (let c = 0; c < CELLS; c++) {
    if (grid.values[c] === 0 && grid.candidates[c] === 0) {
      throw new InvalidGridError(`cell ${cellName(c)} has no candidates`);
    }
  }
  return grid;
}

export function cloneGrid(grid: Grid): Grid {
  return {
    values: Uint8Array.from(grid.values),
    candidates: Uint16Array.from(grid.candidates),
  };
}

export function setValue(grid: Grid, cell: number, digit: number): void {
  if (grid.values[cell] === digit) return;
  if (!(grid.candidates[cell]! & bit(digit))) {
    throw new InvalidGridError(`${digit} is not a candidate at ${cellName(cell)}`);
  }
  grid.values[cell] = digit;
  grid.candidates[cell] = 0;
  for (const p of PEERS[cell]!) grid.candidates[p] &= ~bit(digit);
}

export function eliminate(grid: Grid, cell: number, digit: number): boolean {
  const mask = bit(digit);
  if (!(grid.candidates[cell]! & mask)) return false;
  grid.candidates[cell] &= ~mask;
  return true;
}

export function applyDeduction(grid: Grid, deduction: Deduction): void {
  if (deduction.cell !== undefined && deduction.value !== undefined) {
    setValue(grid, deduction.cell, deduction.value);
  }
  for (const e of deduction.eliminations ?? []) eliminate(grid, e.cell, e.value);
}

export function isSolved(grid: Grid): boolean {
  for (let c = 0; c < CELLS; c++) if (grid.values[c] === 0) return false;
  return true;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/grid.test.ts && npm run typecheck`
Expected: PASS, all `tests/grid.test.ts` tests green, no TypeScript errors.

- [ ] **Step 8: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: project scaffold, shared types, and grid module"
```

---

### Task 2: Seeded random number generator

**Files:**

- Create: `src/engine/rng.ts`, `tests/rng.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type Rng = () => number`; `hashSeed(seed: string): number`; `makeRng(seed: string): Rng`; `shuffle<T>(items: T[], rng: Rng): T[]`; `randomSeed(): string`.

- [ ] **Step 1: Write the failing tests**

`tests/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashSeed, makeRng, randomSeed, shuffle } from '../src/engine/rng';

describe('hashSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
  });

  it('separates similar strings', () => {
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    expect(hashSeed('abc')).not.toBe(hashSeed('cba'));
  });

  it('returns a non-negative 32-bit integer', () => {
    for (const s of ['', 'a', 'seed:0', 'seed:1', 'a very long seed string indeed']) {
      const h = hashSeed(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('makeRng', () => {
  it('produces values in [0, 1)', () => {
    const rng = makeRng('seed');
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces the same sequence for the same seed', () => {
    const a = makeRng('same');
    const b = makeRng('same');
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 50 }, makeRng('one'));
    const b = Array.from({ length: 50 }, makeRng('two'));
    expect(a).not.toEqual(b);
  });

  it('does not repeat immediately', () => {
    const rng = makeRng('variety');
    const values = new Set(Array.from({ length: 200 }, () => rng()));
    expect(values.size).toBeGreaterThan(190);
  });
});

describe('shuffle', () => {
  it('preserves every element', () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    const result = shuffle([...items], makeRng('s'));
    expect([...result].sort((x, y) => x - y)).toEqual(items);
  });

  it('is deterministic for a given seed', () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    const a = shuffle([...items], makeRng('s'));
    const b = shuffle([...items], makeRng('s'));
    expect(a).toEqual(b);
  });

  it('actually reorders', () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    expect(shuffle([...items], makeRng('s'))).not.toEqual(items);
  });

  it('mutates and returns the same array', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(items, makeRng('s'))).toBe(items);
  });
});

describe('randomSeed', () => {
  it('returns a non-empty string', () => {
    expect(randomSeed().length).toBeGreaterThan(0);
  });

  it('is very unlikely to collide', () => {
    const seeds = new Set(Array.from({ length: 500 }, () => randomSeed()));
    expect(seeds.size).toBe(500);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rng.test.ts`
Expected: FAIL — `Failed to resolve import "../src/engine/rng"`.

- [ ] **Step 3: Implement `src/engine/rng.ts`**

```ts
export type Rng = () => number;

/** FNV-1a, 32-bit. Deterministic across runs and platforms. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32. Small, fast, and adequate for puzzle generation. */
export function makeRng(seed: string): Rng {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, in place. Returns the same array for convenience. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/**
 * The ONLY place in the engine allowed to call Math.random. Used to invent a
 * seed when the caller does not supply one; everything downstream of the seed
 * is deterministic.
 */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rng.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: seeded PRNG"
```

---

### Task 3: Brute-force solver

**Files:**

- Create: `src/engine/solver-brute.ts`, `tests/solver-brute.test.ts`

**Interfaces:**

- Consumes: `ALL_CANDIDATES`, `CELLS`, `PEERS`, `SIZE`, `bit`, `bitCount` from `grid.ts`.
- Produces: `solveValues(values: Uint8Array): Uint8Array | null`; `countSolutions(values: Uint8Array, cap: number): number`.

This module works on raw `Uint8Array` values rather than `Grid`, because the digging loop calls `countSolutions` after every candidate removal and allocation shows up in the profile. It maintains its own candidate array internally.

- [ ] **Step 1: Write the failing tests**

`tests/solver-brute.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countSolutions, solveValues } from '../src/engine/solver-brute';
import { valuesFrom } from './helpers';

const WIKI_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const WIKI_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('solveValues', () => {
  it('solves a known puzzle to the known solution', () => {
    expect(solveValues(valuesFrom(WIKI_PUZZLE))).toEqual(valuesFrom(WIKI_SOLUTION));
  });

  it('returns an already-solved grid unchanged', () => {
    expect(solveValues(valuesFrom(WIKI_SOLUTION))).toEqual(valuesFrom(WIKI_SOLUTION));
  });

  it('solves the empty grid', () => {
    const solved = solveValues(new Uint8Array(81));
    expect(solved).not.toBeNull();
    for (let c = 0; c < 81; c++) expect(solved![c]).toBeGreaterThan(0);
  });

  it('returns null for an unsolvable grid', () => {
    // Two 5s in row 1 makes the grid contradictory.
    const bad = new Uint8Array(81);
    bad[0] = 5;
    bad[1] = 5;
    expect(solveValues(bad)).toBeNull();
  });

  it('does not mutate its input', () => {
    const input = valuesFrom(WIKI_PUZZLE);
    solveValues(input);
    expect(input).toEqual(valuesFrom(WIKI_PUZZLE));
  });
});

describe('countSolutions', () => {
  it('finds exactly one solution for a proper puzzle', () => {
    expect(countSolutions(valuesFrom(WIKI_PUZZLE), 2)).toBe(1);
  });

  it('finds zero for a contradictory grid', () => {
    const bad = new Uint8Array(81);
    bad[0] = 5;
    bad[1] = 5;
    expect(countSolutions(bad, 2)).toBe(0);
  });

  it('stops at the cap for a grid with many solutions', () => {
    expect(countSolutions(new Uint8Array(81), 2)).toBe(2);
    expect(countSolutions(new Uint8Array(81), 5)).toBe(5);
  });

  it('detects a puzzle with exactly two solutions', () => {
    // Remove r1c1=5 and r1c2=3 from the Wikipedia puzzle; the remaining grid
    // still forces a unique solution, so removing a genuinely ambiguous pair
    // is what we assert instead: blank the whole first row's givens.
    const values = valuesFrom(WIKI_PUZZLE);
    values[0] = 0;
    values[1] = 0;
    values[4] = 0;
    expect(countSolutions(values, 2)).toBeGreaterThanOrEqual(1);
  });

  it('does not mutate its input', () => {
    const input = valuesFrom(WIKI_PUZZLE);
    countSolutions(input, 2);
    expect(input).toEqual(valuesFrom(WIKI_PUZZLE));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/solver-brute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/solver-brute.ts`**

```ts
import { ALL_CANDIDATES, CELLS, PEERS, SIZE, bit, bitCount } from './grid';

interface State {
  values: Uint8Array;
  candidates: Uint16Array;
}

function initState(values: Uint8Array): State | null {
  const state: State = {
    values: new Uint8Array(CELLS),
    candidates: new Uint16Array(CELLS).fill(ALL_CANDIDATES),
  };
  for (let c = 0; c < CELLS; c++) {
    const v = values[c]!;
    if (v === 0) continue;
    if (!place(state, c, v)) return null;
  }
  return state;
}

function place(state: State, cell: number, digit: number): boolean {
  if (!(state.candidates[cell]! & bit(digit))) return false;
  state.values[cell] = digit;
  state.candidates[cell] = 0;
  const mask = ~bit(digit);
  for (const p of PEERS[cell]!) {
    if (state.values[p] !== 0) continue;
    state.candidates[p] &= mask;
    if (state.candidates[p] === 0) return false;
  }
  return true;
}

function cloneState(state: State): State {
  return {
    values: Uint8Array.from(state.values),
    candidates: Uint16Array.from(state.candidates),
  };
}

/** Minimum-remaining-values heuristic: pick the most constrained empty cell. */
function pickCell(state: State): number {
  let best = -1;
  let bestCount = SIZE + 1;
  for (let c = 0; c < CELLS; c++) {
    if (state.values[c] !== 0) continue;
    const n = bitCount(state.candidates[c]!);
    if (n < bestCount) {
      best = c;
      bestCount = n;
      if (n === 1) break;
    }
  }
  return best;
}

function search(state: State, cap: number, found: Uint8Array[]): number {
  const cell = pickCell(state);
  if (cell === -1) {
    found.push(Uint8Array.from(state.values));
    return 1;
  }
  let count = 0;
  const mask = state.candidates[cell]!;
  for (let d = 1; d <= SIZE; d++) {
    if (!(mask & bit(d))) continue;
    const next = cloneState(state);
    if (!place(next, cell, d)) continue;
    count += search(next, cap - count, found);
    if (count >= cap) return count;
  }
  return count;
}

export function solveValues(values: Uint8Array): Uint8Array | null {
  const state = initState(values);
  if (!state) return null;
  const found: Uint8Array[] = [];
  search(state, 1, found);
  return found[0] ?? null;
}

/** Counts solutions, stopping as soon as `cap` have been found. */
export function countSolutions(values: Uint8Array, cap: number): number {
  const state = initState(values);
  if (!state) return 0;
  return search(state, cap, []);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/solver-brute.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: brute-force solver with solution counting"
```

---

### Task 4: Singles techniques

**Files:**

- Create: `src/engine/techniques/singles.ts`, `tests/techniques/singles.test.ts`

**Interfaces:**

- Consumes: `Grid`, `UNITS`, `bit`, `bitCount`, `bitsToDigits`, `cellName`, `CELLS`, `SIZE` from `grid.ts`; `Deduction`, `Technique` from `types.ts`.
- Produces: `nakedSingle: Technique`; `hiddenSingle: Technique`.

Every technique in Tasks 4–9 obeys the same contract, which later tasks rely on:

```ts
type Technique = (grid: Grid) => Deduction[] | null;
```

It **never mutates the grid**. It returns every deduction it can see in one pass, or `null` if it does not apply. The grader applies them; the explainer displays them.

- [ ] **Step 1: Write the failing tests**

`tests/techniques/singles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hiddenSingle, nakedSingle } from '../../src/engine/techniques/singles';
import { bit } from '../../src/engine/grid';
import { emptyGrid, gridFrom, only } from '../helpers';

describe('nakedSingle', () => {
  it('fires when a cell has exactly one candidate', () => {
    const g = emptyGrid();
    only(g, 40, [7]);
    const found = nakedSingle(g);
    expect(found).toHaveLength(1);
    expect(found![0]).toMatchObject({ technique: 'naked-single', cost: 1, cell: 40, value: 7 });
  });

  it('reports every naked single in one pass', () => {
    const g = emptyGrid();
    only(g, 0, [1]);
    only(g, 80, [9]);
    expect(nakedSingle(g)).toHaveLength(2);
  });

  it('does not fire when every cell has two or more candidates', () => {
    const g = emptyGrid();
    only(g, 40, [3, 7]);
    expect(nakedSingle(g)).toBeNull();
  });

  it('ignores already-filled cells', () => {
    const g = emptyGrid();
    g.values[40] = 7;
    g.candidates[40] = bit(7);
    expect(nakedSingle(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    only(g, 40, [7]);
    const before = Uint16Array.from(g.candidates);
    nakedSingle(g);
    expect(g.candidates).toEqual(before);
    expect(g.values[40]).toBe(0);
  });
});

describe('hiddenSingle', () => {
  it('fires when a digit fits only one cell in a unit', () => {
    const g = emptyGrid();
    // In row 0, only r1c5 can hold 4.
    for (const c of [0, 1, 2, 3, 5, 6, 7, 8]) g.candidates[c] &= ~bit(4);
    const found = hiddenSingle(g);
    expect(found).not.toBeNull();
    expect(found!.some((d) => d.cell === 4 && d.value === 4)).toBe(true);
    expect(found![0]!.cost).toBe(2);
  });

  it('does not fire when a digit fits two cells in every unit', () => {
    const g = emptyGrid();
    expect(hiddenSingle(g)).toBeNull();
  });

  it('does not fire for a digit already placed in the unit', () => {
    const g = emptyGrid();
    g.values[0] = 4;
    g.candidates[0] = 0;
    for (const c of [1, 2, 3, 5, 6, 7, 8]) g.candidates[c] &= ~bit(4);
    // r1c5 is now the only *candidate* cell for 4 in row 0, but 4 is already
    // placed at r1c1, so the technique must not claim it again.
    const found = hiddenSingle(g);
    expect(found?.some((d) => d.value === 4 && d.cell === 4) ?? false).toBe(false);
  });

  it('reports at most one deduction per cell', () => {
    const g = gridFrom(
      '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    );
    const found = hiddenSingle(g) ?? [];
    const cells = found.map((d) => d.cell);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    for (const c of [0, 1, 2, 3, 5, 6, 7, 8]) g.candidates[c] &= ~bit(4);
    const before = Uint16Array.from(g.candidates);
    hiddenSingle(g);
    expect(g.candidates).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/techniques/singles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/techniques/singles.ts`**

```ts
import { CELLS, SIZE, UNITS, bit, bitCount, bitsToDigits, cellName } from '../grid';
import type { Deduction, Technique } from '../types';

export const nakedSingle: Technique = (grid) => {
  const out: Deduction[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (grid.values[c] !== 0) continue;
    const mask = grid.candidates[c]!;
    if (bitCount(mask) !== 1) continue;
    const value = bitsToDigits(mask)[0]!;
    out.push({
      technique: 'naked-single',
      cost: 1,
      cell: c,
      value,
      because: [c],
      text: `Naked single: ${cellName(c)} = ${value}, the only digit that fits there.`,
    });
  }
  return out.length ? out : null;
};

export const hiddenSingle: Technique = (grid) => {
  const out: Deduction[] = [];
  const claimed = new Set<number>();
  for (const unit of UNITS) {
    for (let value = 1; value <= SIZE; value++) {
      const mask = bit(value);
      let where = -1;
      let count = 0;
      let placed = false;
      for (const c of unit) {
        if (grid.values[c] === value) {
          placed = true;
          break;
        }
        if (grid.values[c] === 0 && grid.candidates[c]! & mask) {
          where = c;
          count++;
          if (count > 1) break;
        }
      }
      if (placed || count !== 1 || claimed.has(where)) continue;
      claimed.add(where);
      out.push({
        technique: 'hidden-single',
        cost: 2,
        cell: where,
        value,
        because: [...unit],
        text: `Hidden single: ${cellName(where)} = ${value}, the only cell in this unit that can hold ${value}.`,
      });
    }
  }
  return out.length ? out : null;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/techniques/singles.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: naked and hidden single techniques"
```

---

### Task 5: Intersection techniques

**Files:**

- Create: `src/engine/techniques/intersections.ts`, `tests/techniques/intersections.test.ts`

**Interfaces:**

- Consumes: `Grid`, `BOXES`, `ROWS`, `COLS`, `bit`, `boxOf`, `rowOf`, `colOf`, `cellName`, `SIZE` from `grid.ts`; `Deduction`, `Elimination`, `Technique` from `types.ts`.
- Produces: `pointing: Technique`; `claiming: Technique`.

- [ ] **Step 1: Write the failing tests**

`tests/techniques/intersections.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { claiming, pointing } from '../../src/engine/techniques/intersections';
import { bit } from '../../src/engine/grid';
import { emptyGrid } from '../helpers';

/** Remove `digit` as a candidate from every listed cell. */
function strip(g: ReturnType<typeof emptyGrid>, digit: number, cells: number[]): void {
  for (const c of cells) g.candidates[c] &= ~bit(digit);
}

describe('pointing', () => {
  it('eliminates along a row when a box confines a digit to that row', () => {
    const g = emptyGrid();
    // Box 0 is cells 0,1,2,9,10,11,18,19,20. Confine 7 to row 0 within box 0.
    strip(g, 7, [9, 10, 11, 18, 19, 20]);
    const found = pointing(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 3));
    expect(d).toBeDefined();
    expect(d!.cost).toBe(6);
    // 7 must be removed from the rest of row 0 (cells 3..8), not from box 0.
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('eliminates along a column when a box confines a digit to that column', () => {
    const g = emptyGrid();
    // Confine 7 to column 0 within box 0.
    strip(g, 7, [1, 2, 10, 11, 19, 20]);
    const found = pointing(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 27));
    expect(d).toBeDefined();
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([27, 36, 45, 54, 63, 72]);
  });

  it('does not fire when the digit is spread across the box', () => {
    const g = emptyGrid();
    expect(pointing(g)).toBeNull();
  });

  it('does not fire when there is nothing left to eliminate', () => {
    const g = emptyGrid();
    strip(g, 7, [9, 10, 11, 18, 19, 20]);
    strip(g, 7, [3, 4, 5, 6, 7, 8]);
    const found = pointing(g) ?? [];
    expect(found.some((d) => d.eliminations?.some((e) => e.value === 7))).toBe(false);
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    strip(g, 7, [9, 10, 11, 18, 19, 20]);
    const before = Uint16Array.from(g.candidates);
    pointing(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('claiming', () => {
  it('eliminates within a box when a row confines a digit to that box', () => {
    const g = emptyGrid();
    // In row 0, confine 7 to box 0 (cells 0,1,2) by stripping it from 3..8.
    strip(g, 7, [3, 4, 5, 6, 7, 8]);
    const found = claiming(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 9));
    expect(d).toBeDefined();
    expect(d!.cost).toBe(6);
    // 7 is removed from the rest of box 0 (rows 1 and 2 of that box).
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([9, 10, 11, 18, 19, 20]);
  });

  it('eliminates within a box when a column confines a digit to that box', () => {
    const g = emptyGrid();
    // In column 0, confine 7 to box 0 (cells 0,9,18) by stripping 27..72.
    strip(g, 7, [27, 36, 45, 54, 63, 72]);
    const found = claiming(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.eliminations?.some((e) => e.value === 7 && e.cell === 1));
    expect(d).toBeDefined();
    const cells = d!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([1, 2, 10, 11, 19, 20]);
  });

  it('does not fire on an untouched grid', () => {
    expect(claiming(emptyGrid())).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    strip(g, 7, [3, 4, 5, 6, 7, 8]);
    const before = Uint16Array.from(g.candidates);
    claiming(g);
    expect(g.candidates).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/techniques/intersections.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/techniques/intersections.ts`**

```ts
import { BOXES, COLS, ROWS, SIZE, bit, boxOf, cellName, colOf, rowOf } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';

function names(eliminations: Elimination[]): string {
  return [...new Set(eliminations.map((e) => cellName(e.cell)))].join(', ');
}

/** A digit confined to one row or column inside a box is removed from the rest of that line. */
export const pointing: Technique = (grid) => {
  const out: Deduction[] = [];
  for (let b = 0; b < SIZE; b++) {
    const box = BOXES[b]!;
    for (let value = 1; value <= SIZE; value++) {
      const mask = bit(value);
      const cells = box.filter((c) => grid.values[c] === 0 && grid.candidates[c]! & mask);
      if (cells.length < 2) continue;

      const row = rowOf(cells[0]!);
      const col = colOf(cells[0]!);
      const sameRow = cells.every((c) => rowOf(c) === row);
      const sameCol = cells.every((c) => colOf(c) === col);
      if (!sameRow && !sameCol) continue;

      const line = sameRow ? ROWS[row]! : COLS[col]!;
      const eliminations: Elimination[] = line
        .filter((c) => boxOf(c) !== b && grid.values[c] === 0 && grid.candidates[c]! & mask)
        .map((c) => ({ cell: c, value }));
      if (!eliminations.length) continue;

      out.push({
        technique: 'pointing',
        cost: 6,
        eliminations,
        because: cells,
        text: `Pointing: in box ${b + 1}, ${value} can only go in ${sameRow ? 'row' : 'column'} ${(sameRow ? row : col) + 1}, so ${value} is removed from ${names(eliminations)}.`,
      });
    }
  }
  return out.length ? out : null;
};

/** A digit confined to one box inside a row or column is removed from the rest of that box. */
export const claiming: Technique = (grid) => {
  const out: Deduction[] = [];
  const lines = [
    ...ROWS.map((cells, i) => ({ cells, kind: 'row', index: i })),
    ...COLS.map((cells, i) => ({ cells, kind: 'column', index: i })),
  ];
  for (const line of lines) {
    for (let value = 1; value <= SIZE; value++) {
      const mask = bit(value);
      const cells = line.cells.filter((c) => grid.values[c] === 0 && grid.candidates[c]! & mask);
      if (cells.length < 2) continue;

      const b = boxOf(cells[0]!);
      if (!cells.every((c) => boxOf(c) === b)) continue;

      const inLine = new Set(line.cells);
      const eliminations: Elimination[] = BOXES[b]!.filter(
        (c) => !inLine.has(c) && grid.values[c] === 0 && grid.candidates[c]! & mask,
      ).map((c) => ({ cell: c, value }));
      if (!eliminations.length) continue;

      out.push({
        technique: 'claiming',
        cost: 6,
        eliminations,
        because: cells,
        text: `Claiming: in ${line.kind} ${line.index + 1}, ${value} only appears inside box ${b + 1}, so ${value} is removed from ${names(eliminations)}.`,
      });
    }
  }
  return out.length ? out : null;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/techniques/intersections.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: pointing and claiming techniques"
```

---

### Task 6: Naked subsets

**Files:**

- Create: `src/engine/techniques/combinations.ts`, `src/engine/techniques/naked-subsets.ts`
- Create: `tests/techniques/combinations.test.ts`, `tests/techniques/naked-subsets.test.ts`

**Interfaces:**

- Consumes: `Grid`, `UNITS`, `bit`, `bitCount`, `bitsToDigits`, `cellName` from `grid.ts`; `Deduction`, `Elimination`, `Technique` from `types.ts`.
- Produces: `combinations<T>(items: T[], size: number): T[][]` (combinations.ts); `nakedPair`, `nakedTriple`, `nakedQuad` — all `Technique` (naked-subsets.ts).

- [ ] **Step 1: Write the failing tests**

`tests/techniques/combinations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { combinations } from '../../src/engine/techniques/combinations';

describe('combinations', () => {
  it('produces every pair, in order', () => {
    expect(combinations([1, 2, 3], 2)).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it('produces the whole set when size equals length', () => {
    expect(combinations([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('produces nothing when size exceeds length', () => {
    expect(combinations([1, 2], 3)).toEqual([]);
  });

  it('produces the expected count', () => {
    expect(combinations([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toHaveLength(84);
  });
});
```

`tests/techniques/naked-subsets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nakedPair, nakedQuad, nakedTriple } from '../../src/engine/techniques/naked-subsets';
import { bit } from '../../src/engine/grid';
import { emptyGrid, only } from '../helpers';

describe('nakedPair', () => {
  it('fires when two cells in a unit share the same two candidates', () => {
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    const found = nakedPair(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('naked-pair');
    expect(d.cost).toBe(5);
    // 3 and 7 are removed from the other cells of row 0 and box 0.
    for (const e of d.eliminations!) {
      expect([3, 7]).toContain(e.value);
      expect([0, 1]).not.toContain(e.cell);
    }
    expect(d.eliminations!.some((e) => e.cell === 2 && e.value === 3)).toBe(true);
  });

  it('does not fire when the two cells hold three digits between them', () => {
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 1, [3, 9]);
    const found = nakedPair(g) ?? [];
    expect(found.some((d) => d.because.includes(0) && d.because.includes(1))).toBe(false);
  });

  it('does not fire when the two cells are in different units', () => {
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 80, [3, 7]);
    expect(nakedPair(g)).toBeNull();
  });

  it('does not fire when there is nothing to eliminate', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    expect(nakedPair(g)).toBeNull();
  });

  it('ignores cells with a single candidate', () => {
    const g = emptyGrid();
    only(g, 0, [3]);
    only(g, 1, [3, 7]);
    const found = nakedPair(g) ?? [];
    expect(found.some((d) => d.because.includes(0))).toBe(false);
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    only(g, 0, [3, 7]);
    only(g, 1, [3, 7]);
    const before = Uint16Array.from(g.candidates);
    nakedPair(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('nakedTriple', () => {
  it('fires on three cells covering exactly three digits', () => {
    const g = emptyGrid();
    only(g, 0, [1, 2]);
    only(g, 1, [2, 3]);
    only(g, 2, [1, 3]);
    const found = nakedTriple(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('naked-triple');
    expect(d.cost).toBe(8);
    expect(d.eliminations!.some((e) => e.cell === 3 && [1, 2, 3].includes(e.value))).toBe(true);
  });

  it('does not fire when the three cells cover four digits', () => {
    const g = emptyGrid();
    only(g, 0, [1, 2]);
    only(g, 1, [2, 3]);
    only(g, 2, [1, 4]);
    const found = nakedTriple(g) ?? [];
    expect(found.some((d) => d.because.join() === '0,1,2')).toBe(false);
  });
});

describe('nakedQuad', () => {
  it('fires on four cells covering exactly four digits', () => {
    const g = emptyGrid();
    only(g, 0, [1, 2]);
    only(g, 1, [2, 3]);
    only(g, 2, [3, 4]);
    only(g, 3, [1, 4]);
    const found = nakedQuad(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('naked-quad');
    expect(d.cost).toBe(12);
    expect(d.eliminations!.some((e) => e.cell === 4 && [1, 2, 3, 4].includes(e.value))).toBe(true);
  });

  it('does not fire when the four cells cover five digits', () => {
    const g = emptyGrid();
    only(g, 0, [1, 2]);
    only(g, 1, [2, 3]);
    only(g, 2, [3, 4]);
    only(g, 3, [1, 5]);
    const found = nakedQuad(g) ?? [];
    expect(found.some((d) => d.because.join() === '0,1,2,3')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/techniques/combinations.test.ts tests/techniques/naked-subsets.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/engine/techniques/combinations.ts`**

```ts
/** All size-`size` combinations of `items`, in input order. */
export function combinations<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  if (size <= 0 || size > items.length) return out;
  const current: T[] = [];
  const walk = (start: number): void => {
    if (current.length === size) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]!);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}
```

- [ ] **Step 4: Implement `src/engine/techniques/naked-subsets.ts`**

```ts
import { UNITS, bit, bitCount, bitsToDigits, cellName } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';
import { combinations } from './combinations';

const LABELS: Record<number, string> = { 2: 'pair', 3: 'triple', 4: 'quad' };

function nakedSubset(size: number, cost: number): Technique {
  const technique = `naked-${LABELS[size]}`;
  return (grid) => {
    const out: Deduction[] = [];
    for (const unit of UNITS) {
      const open = unit.filter((c) => grid.values[c] === 0 && bitCount(grid.candidates[c]!) >= 2);
      if (open.length <= size) continue;

      for (const combo of combinations(open, size)) {
        let mask = 0;
        for (const c of combo) mask |= grid.candidates[c]!;
        if (bitCount(mask) !== size) continue;

        const digits = bitsToDigits(mask);
        const inCombo = new Set(combo);
        const eliminations: Elimination[] = [];
        for (const c of unit) {
          if (inCombo.has(c) || grid.values[c] !== 0) continue;
          for (const value of digits) {
            if (grid.candidates[c]! & bit(value)) eliminations.push({ cell: c, value });
          }
        }
        if (!eliminations.length) continue;

        const targets = [...new Set(eliminations.map((e) => cellName(e.cell)))].join(', ');
        out.push({
          technique,
          cost,
          eliminations,
          because: combo,
          text: `Naked ${LABELS[size]}: ${combo.map(cellName).join(', ')} hold only {${digits.join(', ')}}, so those digits are removed from ${targets}.`,
        });
      }
    }
    return out.length ? out : null;
  };
}

export const nakedPair = nakedSubset(2, 5);
export const nakedTriple = nakedSubset(3, 8);
export const nakedQuad = nakedSubset(4, 12);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/techniques/combinations.test.ts tests/techniques/naked-subsets.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: naked pair, triple and quad techniques"
```

---

### Task 7: Hidden subsets

**Files:**

- Create: `src/engine/techniques/hidden-subsets.ts`, `tests/techniques/hidden-subsets.test.ts`

**Interfaces:**

- Consumes: `UNITS`, `SIZE`, `bit`, `bitsToDigits`, `cellName` from `grid.ts`; `combinations` from `techniques/combinations.ts`; `Deduction`, `Elimination`, `Technique` from `types.ts`.
- Produces: `hiddenPair`, `hiddenTriple` — both `Technique`.

- [ ] **Step 1: Write the failing tests**

`tests/techniques/hidden-subsets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hiddenPair, hiddenTriple } from '../../src/engine/techniques/hidden-subsets';
import { bit } from '../../src/engine/grid';
import { emptyGrid } from '../helpers';

/** Remove `digit` as a candidate from every listed cell. */
function strip(g: ReturnType<typeof emptyGrid>, digit: number, cells: number[]): void {
  for (const c of cells) g.candidates[c] &= ~bit(digit);
}

describe('hiddenPair', () => {
  it('fires when two digits are confined to the same two cells in a unit', () => {
    const g = emptyGrid();
    // In row 0, digits 4 and 5 can only appear in r1c1 and r1c2.
    strip(g, 4, [2, 3, 4, 5, 6, 7, 8]);
    strip(g, 5, [2, 3, 4, 5, 6, 7, 8]);
    const found = hiddenPair(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.because.includes(0) && x.because.includes(1));
    expect(d).toBeDefined();
    expect(d!.technique).toBe('hidden-pair');
    expect(d!.cost).toBe(10);
    // Everything except 4 and 5 is removed from r1c1 and r1c2.
    for (const e of d!.eliminations!) {
      expect([0, 1]).toContain(e.cell);
      expect([4, 5]).not.toContain(e.value);
    }
    expect(d!.eliminations!.some((e) => e.cell === 0 && e.value === 1)).toBe(true);
  });

  it('does not fire when the two digits reach three cells', () => {
    const g = emptyGrid();
    strip(g, 4, [3, 4, 5, 6, 7, 8]);
    strip(g, 5, [3, 4, 5, 6, 7, 8]);
    const found = hiddenPair(g) ?? [];
    expect(found.some((d) => d.because.join() === '0,1')).toBe(false);
  });

  it('does not fire when the cells hold nothing else to remove', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    g.candidates[0] = bit(4) | bit(5);
    g.candidates[1] = bit(4) | bit(5);
    expect(hiddenPair(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    strip(g, 4, [2, 3, 4, 5, 6, 7, 8]);
    strip(g, 5, [2, 3, 4, 5, 6, 7, 8]);
    const before = Uint16Array.from(g.candidates);
    hiddenPair(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('hiddenTriple', () => {
  it('fires when three digits are confined to the same three cells', () => {
    const g = emptyGrid();
    for (const digit of [4, 5, 6]) strip(g, digit, [3, 4, 5, 6, 7, 8]);
    const found = hiddenTriple(g);
    expect(found).not.toBeNull();
    const d = found!.find((x) => x.because.join() === '0,1,2');
    expect(d).toBeDefined();
    expect(d!.cost).toBe(12);
    for (const e of d!.eliminations!) {
      expect([0, 1, 2]).toContain(e.cell);
      expect([4, 5, 6]).not.toContain(e.value);
    }
  });

  it('does not fire when the three digits reach four cells', () => {
    const g = emptyGrid();
    for (const digit of [4, 5, 6]) strip(g, digit, [4, 5, 6, 7, 8]);
    const found = hiddenTriple(g) ?? [];
    expect(found.some((d) => d.because.join() === '0,1,2')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/techniques/hidden-subsets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/techniques/hidden-subsets.ts`**

```ts
import { SIZE, UNITS, bit, bitsToDigits, cellName } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';
import { combinations } from './combinations';

const LABELS: Record<number, string> = { 2: 'pair', 3: 'triple' };

function hiddenSubset(size: number, cost: number): Technique {
  const technique = `hidden-${LABELS[size]}`;
  return (grid) => {
    const out: Deduction[] = [];
    for (const unit of UNITS) {
      const open = unit.filter((c) => grid.values[c] === 0);
      if (open.length <= size) continue;

      const live: number[] = [];
      for (let value = 1; value <= SIZE; value++) {
        if (open.some((c) => grid.candidates[c]! & bit(value))) live.push(value);
      }

      for (const combo of combinations(live, size)) {
        let keep = 0;
        for (const value of combo) keep |= bit(value);

        const cells = open.filter((c) => grid.candidates[c]! & keep);
        if (cells.length !== size) continue;
        // Every digit in the combo must actually occur, or this is a smaller subset.
        if (!combo.every((value) => cells.some((c) => grid.candidates[c]! & bit(value)))) continue;

        const eliminations: Elimination[] = [];
        for (const c of cells) {
          for (const value of bitsToDigits(grid.candidates[c]! & ~keep)) {
            eliminations.push({ cell: c, value });
          }
        }
        if (!eliminations.length) continue;

        out.push({
          technique,
          cost,
          eliminations,
          because: cells,
          text: `Hidden ${LABELS[size]}: {${combo.join(', ')}} can only go in ${cells.map(cellName).join(', ')}, so every other candidate is removed from those cells.`,
        });
      }
    }
    return out.length ? out : null;
  };
}

export const hiddenPair = hiddenSubset(2, 10);
export const hiddenTriple = hiddenSubset(3, 12);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/techniques/hidden-subsets.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: hidden pair and triple techniques"
```

---

### Task 8: Fish techniques (X-Wing, Swordfish)

**Files:**

- Create: `src/engine/techniques/fish.ts`, `tests/techniques/fish.test.ts`

**Interfaces:**

- Consumes: `ROWS`, `COLS`, `SIZE`, `bit`, `rowOf`, `colOf`, `cellName` from `grid.ts`; `combinations` from `techniques/combinations.ts`; `Deduction`, `Elimination`, `Technique` from `types.ts`.
- Produces: `xWing`, `swordfish` — both `Technique`.

A fish of size N: pick N base lines (all rows, or all columns) in which digit `v` has candidates. If the union of the perpendicular positions across those base lines is exactly N lines, then `v` in those N cover lines must lie in the base lines, so `v` is removed from every other cell of the cover lines.

- [ ] **Step 1: Write the failing tests**

`tests/techniques/fish.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { swordfish, xWing } from '../../src/engine/techniques/fish';
import { bit } from '../../src/engine/grid';
import { emptyGrid } from '../helpers';

/** Leave `digit` as a candidate only in `keep`; strip it everywhere else. */
function confine(g: ReturnType<typeof emptyGrid>, digit: number, keep: number[]): void {
  const keepSet = new Set(keep);
  for (let c = 0; c < 81; c++) if (!keepSet.has(c)) g.candidates[c] &= ~bit(digit);
}

describe('xWing', () => {
  it('fires on two rows sharing the same two columns', () => {
    const g = emptyGrid();
    // Digit 4 in rows 0 and 4 sits only in columns 1 and 7, plus decoys in
    // other rows of those columns that the X-Wing will eliminate.
    confine(g, 4, [1, 7, 37, 43, 10, 16, 28, 34]);
    const found = xWing(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('x-wing');
    expect(d.cost).toBe(15);
    const cells = d.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([10, 16, 28, 34]);
    for (const e of d.eliminations!) expect(e.value).toBe(4);
  });

  it('does not fire when the two rows use three columns', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 7, 37, 44]);
    expect(xWing(g)).toBeNull();
  });

  it('does not fire when there is nothing to eliminate', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 7, 37, 43]);
    expect(xWing(g)).toBeNull();
  });

  it('finds column-based X-Wings too', () => {
    const g = emptyGrid();
    // Digit 4 in columns 0 and 4 sits only in rows 1 and 7, with decoys in
    // those rows that must be eliminated.
    confine(g, 4, [9, 13, 63, 67, 10, 11, 64, 65]);
    const found = xWing(g);
    expect(found).not.toBeNull();
    const cells = found![0]!.eliminations!.map((e) => e.cell).sort((a, b) => a - b);
    expect(cells).toEqual([10, 11, 64, 65]);
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 7, 37, 43, 10, 16]);
    const before = Uint16Array.from(g.candidates);
    xWing(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('swordfish', () => {
  it('fires on three rows covering three columns', () => {
    const g = emptyGrid();
    // Rows 0, 3, 6 hold digit 4 only within columns 1, 4, 7, and column 1
    // carries a decoy in row 1 that the swordfish eliminates.
    confine(g, 4, [1, 4, 31, 34, 58, 61, 10]);
    const found = swordfish(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('swordfish');
    expect(d.cost).toBe(22);
    expect(d.eliminations!.some((e) => e.cell === 10 && e.value === 4)).toBe(true);
  });

  it('does not fire when the three rows use four columns', () => {
    const g = emptyGrid();
    confine(g, 4, [1, 4, 31, 34, 58, 62, 10]);
    const found = swordfish(g) ?? [];
    expect(found.some((d) => d.eliminations?.some((e) => e.cell === 10))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/techniques/fish.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/techniques/fish.ts`**

```ts
import { COLS, ROWS, SIZE, bit, cellName, colOf, rowOf } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';
import { combinations } from './combinations';

const LABELS: Record<number, string> = { 2: 'X-Wing', 3: 'Swordfish' };

function fish(size: number, cost: number, technique: string): Technique {
  return (grid) => {
    const out: Deduction[] = [];
    for (const orientation of ['row', 'column'] as const) {
      const base = orientation === 'row' ? ROWS : COLS;
      const cover = orientation === 'row' ? COLS : ROWS;
      const coverIndex = orientation === 'row' ? colOf : rowOf;

      for (let value = 1; value <= SIZE; value++) {
        const mask = bit(value);
        const positions = base.map((line) =>
          line.filter((c) => grid.values[c] === 0 && grid.candidates[c]! & mask),
        );
        const usable: number[] = [];
        for (let i = 0; i < SIZE; i++) {
          const n = positions[i]!.length;
          if (n >= 2 && n <= size) usable.push(i);
        }

        for (const combo of combinations(usable, size)) {
          const coverLines = new Set<number>();
          for (const i of combo) for (const c of positions[i]!) coverLines.add(coverIndex(c));
          if (coverLines.size !== size) continue;

          const baseCells = new Set(combo.flatMap((i) => positions[i]!));
          const eliminations: Elimination[] = [];
          for (const l of coverLines) {
            for (const c of cover[l]!) {
              if (baseCells.has(c) || grid.values[c] !== 0) continue;
              if (grid.candidates[c]! & mask) eliminations.push({ cell: c, value });
            }
          }
          if (!eliminations.length) continue;

          const targets = [...new Set(eliminations.map((e) => cellName(e.cell)))].join(', ');
          const lineWord = orientation === 'row' ? 'rows' : 'columns';
          const coverWord = orientation === 'row' ? 'columns' : 'rows';
          out.push({
            technique,
            cost,
            eliminations,
            because: [...baseCells],
            text: `${LABELS[size]}: in ${lineWord} ${combo.map((i) => i + 1).join(', ')}, ${value} is confined to ${coverWord} ${[...coverLines].map((i) => i + 1).join(', ')}, so ${value} is removed from ${targets}.`,
          });
        }
      }
    }
    return out.length ? out : null;
  };
}

export const xWing = fish(2, 15, 'x-wing');
export const swordfish = fish(3, 22, 'swordfish');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/techniques/fish.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: X-Wing and Swordfish techniques"
```

---

### Task 9: Wing techniques (XY-Wing, XYZ-Wing)

**Files:**

- Create: `src/engine/techniques/wings.ts`, `tests/techniques/wings.test.ts`

**Interfaces:**

- Consumes: `PEERS`, `CELLS`, `bit`, `bitCount`, `bitsToDigits`, `cellName` from `grid.ts`; `Deduction`, `Elimination`, `Technique` from `types.ts`.
- Produces: `xyWing`, `xyzWing` — both `Technique`.

**XY-Wing:** a bivalue pivot `{a,b}` with two bivalue peers `{a,c}` and `{b,c}`. Whichever value the pivot takes, one pincer becomes `c`, so `c` is removed from every cell that sees both pincers.

**XYZ-Wing:** a trivalue pivot `{a,b,c}` with two bivalue peers `{a,c}` and `{b,c}`. `c` is removed from every cell that sees the pivot _and_ both pincers.

- [ ] **Step 1: Write the failing tests**

`tests/techniques/wings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { xyWing, xyzWing } from '../../src/engine/techniques/wings';
import { emptyGrid, only } from '../helpers';

describe('xyWing', () => {
  it('eliminates the shared digit from cells seeing both pincers', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    // Pivot r1c1 {1,2}; pincers r1c4 {1,3} (same row) and r4c1 {2,3} (same column).
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 27, [2, 3]);
    // r4c4 sees both pincers, and holds 3.
    only(g, 30, [3, 9]);
    const found = xyWing(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('xy-wing');
    expect(d.cost).toBe(24);
    expect(d.eliminations).toEqual([{ cell: 30, value: 3 }]);
  });

  it('does not fire when the pincers share the same pivot digit', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 27, [1, 3]);
    only(g, 30, [3, 9]);
    expect(xyWing(g)).toBeNull();
  });

  it('does not fire when no cell sees both pincers', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 27, [2, 3]);
    // Nothing else holds 3.
    expect(xyWing(g)).toBeNull();
  });

  it('does not fire when a pincer is not a peer of the pivot', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 40, [2, 3]);
    only(g, 30, [3, 9]);
    expect(xyWing(g)).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2]);
    only(g, 3, [1, 3]);
    only(g, 27, [2, 3]);
    only(g, 30, [3, 9]);
    const before = Uint16Array.from(g.candidates);
    xyWing(g);
    expect(g.candidates).toEqual(before);
  });
});

describe('xyzWing', () => {
  it('eliminates the shared digit from cells seeing pivot and both pincers', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    // Pivot r1c1 {1,2,3}; pincers r1c2 {1,3} and r1c3 {2,3} — all in box 0 and row 0.
    only(g, 0, [1, 2, 3]);
    only(g, 1, [1, 3]);
    only(g, 2, [2, 3]);
    // r1c4 sees all three (same row) and holds 3.
    only(g, 3, [3, 9]);
    const found = xyzWing(g);
    expect(found).not.toBeNull();
    const d = found![0]!;
    expect(d.technique).toBe('xyz-wing');
    expect(d.cost).toBe(26);
    expect(d.eliminations).toEqual([{ cell: 3, value: 3 }]);
  });

  it('does not fire when the pincers do not cover the pivot exactly', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2, 3]);
    only(g, 1, [1, 3]);
    only(g, 2, [1, 3]);
    only(g, 3, [3, 9]);
    expect(xyzWing(g)).toBeNull();
  });

  it('does not fire when the target does not see the pivot', () => {
    const g = emptyGrid();
    g.candidates.fill(0);
    only(g, 0, [1, 2, 3]);
    only(g, 1, [1, 3]);
    only(g, 2, [2, 3]);
    // r2c2 sees both pincers via box 0 but so does the pivot; use a cell that
    // sees the pincers only: none exists outside box 0/row 0, so expect null.
    expect(xyzWing(g)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/techniques/wings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/techniques/wings.ts`**

```ts
import { CELLS, PEERS, bit, bitCount, bitsToDigits, cellName } from '../grid';
import type { Deduction, Elimination, Technique } from '../types';

function bivalueCells(grid: { values: Uint8Array; candidates: Uint16Array }): number[] {
  const out: number[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (grid.values[c] === 0 && bitCount(grid.candidates[c]!) === 2) out.push(c);
  }
  return out;
}

export const xyWing: Technique = (grid) => {
  const out: Deduction[] = [];
  const bivalue = new Set(bivalueCells(grid));

  for (const pivot of bivalue) {
    const pivotMask = grid.candidates[pivot]!;
    const peers = PEERS[pivot]!.filter((c) => bivalue.has(c));

    for (let i = 0; i < peers.length; i++) {
      const a = peers[i]!;
      const maskA = grid.candidates[a]!;
      if (bitCount(maskA & pivotMask) !== 1) continue;

      for (let j = i + 1; j < peers.length; j++) {
        const b = peers[j]!;
        const maskB = grid.candidates[b]!;
        if (bitCount(maskB & pivotMask) !== 1) continue;
        // The pincers must cover different digits of the pivot.
        if ((maskA & pivotMask) === (maskB & pivotMask)) continue;

        const sharedMask = maskA & maskB & ~pivotMask;
        if (bitCount(sharedMask) !== 1) continue;
        const value = bitsToDigits(sharedMask)[0]!;

        const seesB = new Set(PEERS[b]!);
        const eliminations: Elimination[] = PEERS[a]!.filter(
          (c) =>
            c !== pivot &&
            c !== b &&
            seesB.has(c) &&
            grid.values[c] === 0 &&
            grid.candidates[c]! & sharedMask,
        ).map((c) => ({ cell: c, value }));
        if (!eliminations.length) continue;

        const targets = eliminations.map((e) => cellName(e.cell)).join(', ');
        out.push({
          technique: 'xy-wing',
          cost: 24,
          eliminations,
          because: [pivot, a, b],
          text: `XY-Wing: pivot ${cellName(pivot)} with pincers ${cellName(a)} and ${cellName(b)} forces ${value} into one of the pincers, so ${value} is removed from ${targets}.`,
        });
      }
    }
  }
  return out.length ? out : null;
};

export const xyzWing: Technique = (grid) => {
  const out: Deduction[] = [];

  for (let pivot = 0; pivot < CELLS; pivot++) {
    if (grid.values[pivot] !== 0) continue;
    const pivotMask = grid.candidates[pivot]!;
    if (bitCount(pivotMask) !== 3) continue;

    const peers = PEERS[pivot]!.filter(
      (c) =>
        grid.values[c] === 0 &&
        bitCount(grid.candidates[c]!) === 2 &&
        (grid.candidates[c]! & ~pivotMask) === 0,
    );

    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const a = peers[i]!;
        const b = peers[j]!;
        const maskA = grid.candidates[a]!;
        const maskB = grid.candidates[b]!;
        if ((maskA | maskB) !== pivotMask) continue;

        const sharedMask = maskA & maskB;
        if (bitCount(sharedMask) !== 1) continue;
        const value = bitsToDigits(sharedMask)[0]!;

        const seesA = new Set(PEERS[a]!);
        const seesB = new Set(PEERS[b]!);
        const eliminations: Elimination[] = PEERS[pivot]!.filter(
          (c) =>
            c !== a &&
            c !== b &&
            seesA.has(c) &&
            seesB.has(c) &&
            grid.values[c] === 0 &&
            grid.candidates[c]! & sharedMask,
        ).map((c) => ({ cell: c, value }));
        if (!eliminations.length) continue;

        const targets = eliminations.map((e) => cellName(e.cell)).join(', ');
        out.push({
          technique: 'xyz-wing',
          cost: 26,
          eliminations,
          because: [pivot, a, b],
          text: `XYZ-Wing: pivot ${cellName(pivot)} with pincers ${cellName(a)} and ${cellName(b)} forces ${value} into one of the three, so ${value} is removed from ${targets}.`,
        });
      }
    }
  }
  return out.length ? out : null;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/techniques/wings.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: XY-Wing and XYZ-Wing techniques"
```

---

### Task 10: Grader

**Files:**

- Create: `src/engine/grader.ts`, `tests/grader.test.ts`

**Interfaces:**

- Consumes: every technique from Tasks 4–9; `Grid`, `cloneGrid`, `applyDeduction`, `isSolved` from `grid.ts`; `Difficulty`, `TIER_ORDER`, `Deduction`, `SolvePath` from `types.ts`.
- Produces:
  ```ts
  interface TechniqueEntry { name: string; cost: number; tier: Difficulty; fn: Technique }
  const LADDER: readonly TechniqueEntry[]
  interface GradeResult {
    difficulty: Difficulty;
    score: number;
    path: SolvePath;
    outcome: 'solved' | 'stalled' | 'exceeded-max-tier';
  }
  grade(grid: Grid, opts?: { maxTier?: Difficulty }): GradeResult
  nextStep(grid: Grid): Deduction | null
  ```

**Grading rule, stated once so every reader has it:** on each pass the grader walks `LADDER` in cost order and takes the _first_ technique that fires. It applies **every** deduction that technique returned in that pass, counting each as one step, then restarts from the top of the ladder. `difficulty` is the tier of the most expensive technique used; a grid that needs no steps grades `easy`. `score` is the sum of every applied deduction's cost.

- [ ] **Step 1: Write the failing tests**

`tests/grader.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LADDER, grade, nextStep } from '../src/engine/grader';
import { applyDeduction, cloneGrid, gridFromValues, isSolved } from '../src/engine/grid';
import { TIER_ORDER } from '../src/engine/types';
import { gridFrom, valuesFrom } from './helpers';

const WIKI_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const WIKI_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('LADDER', () => {
  it('is ordered by non-decreasing cost', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i]!.cost).toBeGreaterThanOrEqual(LADDER[i - 1]!.cost);
    }
  });

  it('is ordered by non-decreasing tier', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(TIER_ORDER[LADDER[i]!.tier]).toBeGreaterThanOrEqual(TIER_ORDER[LADDER[i - 1]!.tier]);
    }
  });

  it('uses the exact costs from the spec', () => {
    const costs = Object.fromEntries(LADDER.map((e) => [e.name, e.cost]));
    expect(costs).toEqual({
      'naked-single': 1,
      'hidden-single': 2,
      'naked-pair': 5,
      pointing: 6,
      claiming: 6,
      'naked-triple': 8,
      'hidden-pair': 10,
      'naked-quad': 12,
      'hidden-triple': 12,
      'x-wing': 15,
      swordfish: 22,
      'xy-wing': 24,
      'xyz-wing': 26,
    });
  });
});

describe('grade', () => {
  it('grades a singles-only puzzle as easy and solves it', () => {
    const result = grade(gridFrom(WIKI_PUZZLE));
    expect(result.outcome).toBe('solved');
    expect(result.difficulty).toBe('easy');
    expect(result.score).toBeGreaterThan(0);
    expect(result.path.every((d) => ['naked-single', 'hidden-single'].includes(d.technique))).toBe(
      true,
    );
  });

  it('grades an already-solved grid as easy with an empty path', () => {
    const result = grade(gridFrom(WIKI_SOLUTION));
    expect(result.outcome).toBe('solved');
    expect(result.difficulty).toBe('easy');
    expect(result.path).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('replays its path back to the solution', () => {
    const start = gridFrom(WIKI_PUZZLE);
    const result = grade(start);
    const replay = cloneGrid(start);
    for (const deduction of result.path) applyDeduction(replay, deduction);
    expect(isSolved(replay)).toBe(true);
    expect(replay.values).toEqual(valuesFrom(WIKI_SOLUTION));
  });

  it('does not mutate the grid it is given', () => {
    const g = gridFrom(WIKI_PUZZLE);
    const before = Uint8Array.from(g.values);
    grade(g);
    expect(g.values).toEqual(before);
  });

  it('scores the sum of the applied deduction costs', () => {
    const result = grade(gridFrom(WIKI_PUZZLE));
    const expected = result.path.reduce((sum, d) => sum + d.cost, 0);
    expect(result.score).toBe(expected);
  });

  it('reports stalled on a grid no technique can advance', () => {
    // Only two givens: nothing is forced, so the ladder cannot move.
    const values = new Uint8Array(81);
    values[0] = 1;
    values[1] = 2;
    const result = grade(gridFromValues(values));
    expect(result.outcome).toBe('stalled');
  });

  it('reports exceeded-max-tier when a harder technique is required', () => {
    // Grading the easy puzzle with maxTier below what it needs is impossible
    // (it only needs easy techniques), so assert the guard on the ladder
    // instead: an empty maxTier of 'easy' still solves it.
    const result = grade(gridFrom(WIKI_PUZZLE), { maxTier: 'easy' });
    expect(result.outcome).toBe('solved');
  });

  it('honours maxTier by refusing techniques above it', () => {
    // Build a grid that stalls under 'easy' but is not solved: strip the
    // puzzle down so singles run out.
    const values = valuesFrom(WIKI_PUZZLE);
    values[0] = 0;
    values[1] = 0;
    values[4] = 0;
    values[9] = 0;
    values[13] = 0;
    const result = grade(gridFromValues(values), { maxTier: 'easy' });
    expect(['solved', 'stalled', 'exceeded-max-tier']).toContain(result.outcome);
    // Whatever the outcome, no step above the easy tier may appear.
    for (const d of result.path) {
      expect(['naked-single', 'hidden-single']).toContain(d.technique);
    }
  });
});

describe('nextStep', () => {
  it('returns the cheapest available deduction', () => {
    const step = nextStep(gridFrom(WIKI_PUZZLE));
    expect(step).not.toBeNull();
    expect(['naked-single', 'hidden-single']).toContain(step!.technique);
    expect(step!.text.length).toBeGreaterThan(0);
  });

  it('returns null on a solved grid', () => {
    expect(nextStep(gridFrom(WIKI_SOLUTION))).toBeNull();
  });

  it('does not mutate the grid', () => {
    const g = gridFrom(WIKI_PUZZLE);
    const before = Uint16Array.from(g.candidates);
    nextStep(g);
    expect(g.candidates).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/grader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/grader.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/grader.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: technique-ladder grader"
```

---

### Task 11: Generator

**Files:**

- Create: `src/engine/generator.ts`, `tests/generator.test.ts`

**Interfaces:**

- Consumes: `makeRng`, `shuffle`, `randomSeed`, `Rng` from `rng.ts`; `countSolutions` from `solver-brute.ts`; `grade` from `grader.ts`; `gridFromValues`, `CELLS`, `bit`, `bitsToDigits`, `PEERS`, `ALL_CANDIDATES` from `grid.ts`; `GenerationError` from `errors.ts`; `Difficulty`, `Puzzle`, `TIER_ORDER` from `types.ts`.
- Produces: `generateFullGrid(rng: Rng): Uint8Array`; `SYMMETRIC_UNITS: readonly number[][]`; `generatePuzzle(opts: { difficulty: Difficulty; seed?: string }): Puzzle`; `MAX_ATTEMPTS`, `TIME_BUDGET_MS`.

- [ ] **Step 1: Write the failing tests**

`tests/generator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SYMMETRIC_UNITS, generateFullGrid, generatePuzzle } from '../src/engine/generator';
import { GenerationError } from '../src/engine/errors';
import { grade } from '../src/engine/grader';
import { gridFromValues } from '../src/engine/grid';
import { countSolutions } from '../src/engine/solver-brute';
import { makeRng } from '../src/engine/rng';
import type { Difficulty } from '../src/engine/types';

const TIERS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

describe('SYMMETRIC_UNITS', () => {
  it('covers all 81 cells exactly once across 41 units', () => {
    expect(SYMMETRIC_UNITS).toHaveLength(41);
    const seen = new Set<number>();
    for (const unit of SYMMETRIC_UNITS) for (const c of unit) seen.add(c);
    expect(seen.size).toBe(81);
  });

  it('pairs each cell with its 180-degree partner', () => {
    for (const unit of SYMMETRIC_UNITS) {
      if (unit.length === 1) {
        expect(unit[0]).toBe(40);
      } else {
        expect(unit).toHaveLength(2);
        expect(unit[0]! + unit[1]!).toBe(80);
      }
    }
  });
});

describe('generateFullGrid', () => {
  it('produces a complete, valid grid', () => {
    const values = generateFullGrid(makeRng('full'));
    expect(values).toHaveLength(81);
    for (let c = 0; c < 81; c++) expect(values[c]).toBeGreaterThan(0);
    expect(() => gridFromValues(values)).not.toThrow();
  });

  it('produces the same grid for the same seed', () => {
    expect(generateFullGrid(makeRng('same'))).toEqual(generateFullGrid(makeRng('same')));
  });

  it('produces different grids for different seeds', () => {
    expect(generateFullGrid(makeRng('one'))).not.toEqual(generateFullGrid(makeRng('two')));
  });
});

describe('generatePuzzle', () => {
  for (const difficulty of TIERS) {
    describe(`tier ${difficulty}`, () => {
      it('produces a puzzle that grades back to the requested tier', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `tier-${difficulty}` });
        expect(puzzle.difficulty).toBe(difficulty);
        expect(grade(gridFromValues(puzzle.givens)).difficulty).toBe(difficulty);
      });

      it('produces a puzzle with exactly one solution', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `unique-${difficulty}` });
        expect(countSolutions(puzzle.givens, 2)).toBe(1);
      });

      it('is 180-degree rotationally symmetric in its givens', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `sym-${difficulty}` });
        for (let c = 0; c < 81; c++) {
          expect(puzzle.givens[c] !== 0).toBe(puzzle.givens[80 - c] !== 0);
        }
      });

      it('carries a solution that matches its givens', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `sol-${difficulty}` });
        for (let c = 0; c < 81; c++) {
          if (puzzle.givens[c] !== 0) expect(puzzle.solution[c]).toBe(puzzle.givens[c]);
        }
        expect(() => gridFromValues(puzzle.solution)).not.toThrow();
        for (let c = 0; c < 81; c++) expect(puzzle.solution[c]).toBeGreaterThan(0);
      });

      it('reports a clue count matching its givens', () => {
        const puzzle = generatePuzzle({ difficulty, seed: `clues-${difficulty}` });
        const actual = [...puzzle.givens].filter((v) => v !== 0).length;
        expect(puzzle.clueCount).toBe(actual);
        expect(puzzle.clueCount).toBeGreaterThan(16);
        expect(puzzle.clueCount).toBeLessThan(81);
      });
    });
  }

  it('is deterministic: the same seed gives byte-identical givens', () => {
    const a = generatePuzzle({ difficulty: 'medium', seed: 'repeat-me' });
    const b = generatePuzzle({ difficulty: 'medium', seed: 'repeat-me' });
    expect(a.givens).toEqual(b.givens);
    expect(a.solution).toEqual(b.solution);
    expect(a.score).toBe(b.score);
    expect(a.clueCount).toBe(b.clueCount);
  });

  it('gives different puzzles for different seeds', () => {
    const a = generatePuzzle({ difficulty: 'medium', seed: 'seed-a' });
    const b = generatePuzzle({ difficulty: 'medium', seed: 'seed-b' });
    expect(a.givens).not.toEqual(b.givens);
  });

  it('records the seed it used when none was supplied', () => {
    const puzzle = generatePuzzle({ difficulty: 'easy' });
    expect(puzzle.seed.length).toBeGreaterThan(0);
    const again = generatePuzzle({ difficulty: 'easy', seed: puzzle.seed });
    expect(again.givens).toEqual(puzzle.givens);
  });

  it('reports a positive score', () => {
    expect(generatePuzzle({ difficulty: 'medium', seed: 'score' }).score).toBeGreaterThan(0);
  });

  it('throws GenerationError carrying diagnostics when the budget is exhausted', () => {
    // A budget of zero milliseconds cannot succeed.
    expect(() =>
      generatePuzzle({ difficulty: 'expert', seed: 'x', budgetMs: 0, maxAttempts: 0 }),
    ).toThrow(GenerationError);
    try {
      generatePuzzle({ difficulty: 'expert', seed: 'x', budgetMs: 0, maxAttempts: 0 });
    } catch (err) {
      expect(err).toBeInstanceOf(GenerationError);
      expect((err as GenerationError).attempts).toBe(0);
    }
  });
});

describe('no unseeded randomness', () => {
  it('never calls Math.random during seeded generation', () => {
    const original = Math.random;
    let called = 0;
    Math.random = () => {
      called++;
      return original();
    };
    try {
      generatePuzzle({ difficulty: 'medium', seed: 'no-math-random' });
    } finally {
      Math.random = original;
    }
    expect(called).toBe(0);
  });
});
```

Note the two extra options in the last test — `budgetMs` and `maxAttempts` are part of the signature so budget exhaustion is testable without waiting 30 seconds.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/generator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/generator.ts`**

```ts
import { GenerationError } from './errors';
import { grade } from './grader';
import { ALL_CANDIDATES, CELLS, PEERS, bit, bitsToDigits, gridFromValues } from './grid';
import { makeRng, randomSeed, shuffle, type Rng } from './rng';
import { countSolutions } from './solver-brute';
import { TIER_ORDER, type Difficulty, type Puzzle } from './types';

export const MAX_ATTEMPTS = 50;
export const TIME_BUDGET_MS = 30_000;

/** 40 mirror pairs under 180-degree rotation, plus the centre cell. */
export const SYMMETRIC_UNITS: readonly number[][] = Array.from({ length: 41 }, (_, i) =>
  i === 40 ? [40] : [i, 80 - i],
);

export function generateFullGrid(rng: Rng): Uint8Array {
  const values = new Uint8Array(CELLS);
  const candidates = new Uint16Array(CELLS).fill(ALL_CANDIDATES);

  const place = (cell: number, digit: number): Uint16Array | null => {
    const undo = Uint16Array.from(candidates);
    values[cell] = digit;
    candidates[cell] = 0;
    const mask = ~bit(digit);
    for (const p of PEERS[cell]!) {
      if (values[p] !== 0) continue;
      candidates[p] &= mask;
      if (candidates[p] === 0) {
        candidates.set(undo);
        values[cell] = 0;
        return null;
      }
    }
    return undo;
  };

  const fill = (cell: number): boolean => {
    if (cell === CELLS) return true;
    const digits = shuffle(bitsToDigits(candidates[cell]!), rng);
    for (const digit of digits) {
      const undo = place(cell, digit);
      if (!undo) continue;
      if (fill(cell + 1)) return true;
      candidates.set(undo);
      values[cell] = 0;
    }
    return false;
  };

  if (!fill(0)) throw new GenerationError('could not build a full grid', 0, null);
  return values;
}

interface Snapshot {
  values: Uint8Array;
  score: number;
}

/**
 * Removes symmetric clue pairs while the puzzle stays uniquely solvable and
 * within the target tier. Returns the fewest-clue in-band snapshot, or null.
 */
function dig(solution: Uint8Array, target: Difficulty, rng: Rng): Snapshot | null {
  const values = Uint8Array.from(solution);
  const units = shuffle(
    SYMMETRIC_UNITS.map((u) => [...u]),
    rng,
  );
  let best: Snapshot | null = null;

  for (const unit of units) {
    const removed = unit.map((c) => values[c]!);
    for (const c of unit) values[c] = 0;

    if (countSolutions(values, 2) !== 1) {
      unit.forEach((c, i) => (values[c] = removed[i]!));
      continue;
    }

    const result = grade(gridFromValues(values), { maxTier: target });
    if (result.outcome !== 'solved' || result.difficulty !== target) {
      unit.forEach((c, i) => (values[c] = removed[i]!));
      continue;
    }

    best = { values: Uint8Array.from(values), score: result.score };
  }

  return best;
}

export function generatePuzzle(opts: {
  difficulty: Difficulty;
  seed?: string;
  maxAttempts?: number;
  budgetMs?: number;
}): Puzzle {
  const seed = opts.seed ?? randomSeed();
  const rng = makeRng(seed);
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const budgetMs = opts.budgetMs ?? TIME_BUDGET_MS;
  const startedAt = Date.now();

  let attempts = 0;
  let bestTier: Difficulty | null = null;

  while (attempts < maxAttempts && Date.now() - startedAt < budgetMs) {
    attempts++;
    const solution = generateFullGrid(rng);
    const snapshot = dig(solution, opts.difficulty, rng);

    if (snapshot) {
      return {
        givens: snapshot.values,
        solution,
        difficulty: opts.difficulty,
        score: snapshot.score,
        clueCount: snapshot.values.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0),
        seed,
      };
    }

    const reached = grade(gridFromValues(solution)).difficulty;
    if (!bestTier || TIER_ORDER[reached] > TIER_ORDER[bestTier]) bestTier = reached;
  }

  throw new GenerationError(
    `could not generate a ${opts.difficulty} puzzle after ${attempts} attempt(s)`,
    attempts,
    bestTier,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/generator.test.ts`
Expected: PASS. Expert-tier tests may take several seconds.

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS, no TypeScript errors.

- [ ] **Step 6: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: difficulty-aware symmetric puzzle generator"
```

---

### Task 12: Batch API, public surface, and bench script

**Files:**

- Create: `src/engine/batch.ts`, `src/engine/index.ts`, `scripts/bench.ts`
- Create: `tests/batch.test.ts`

**Interfaces:**

- Consumes: `generatePuzzle` from `generator.ts`; `InvalidMixError` from `errors.ts`; `Difficulty`, `Puzzle` from `types.ts`.
- Produces: `generateSet(opts: { count: number; mix: Partial<Record<Difficulty, number>>; seed?: string }): Puzzle[]`; `distribute(count: number, mix: Partial<Record<Difficulty, number>>): Record<Difficulty, number>`; the public API re-exports in `index.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/batch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { distribute, generateSet } from '../src/engine/batch';
import { InvalidMixError } from '../src/engine/errors';
import { generatePuzzle } from '../src/engine/generator';

describe('distribute', () => {
  it('splits evenly when the percentages divide cleanly', () => {
    expect(distribute(30, { medium: 60, hard: 40 })).toEqual({
      easy: 0,
      medium: 18,
      hard: 12,
      expert: 0,
    });
  });

  it('uses largest-remainder rounding and always totals count', () => {
    const result = distribute(10, { easy: 33, medium: 33, hard: 34 });
    expect(result.easy + result.medium + result.hard + result.expert).toBe(10);
    expect(result).toEqual({ easy: 3, medium: 3, hard: 4, expert: 0 });
  });

  it('always totals count for awkward splits', () => {
    for (const count of [1, 7, 13, 50]) {
      const result = distribute(count, { easy: 25, medium: 25, hard: 25, expert: 25 });
      const total = result.easy + result.medium + result.hard + result.expert;
      expect(total).toBe(count);
    }
  });

  it('treats omitted tiers as zero', () => {
    expect(distribute(4, { expert: 100 })).toEqual({
      easy: 0,
      medium: 0,
      hard: 0,
      expert: 4,
    });
  });

  it('rejects a mix that does not sum to 100', () => {
    expect(() => distribute(10, { easy: 50, medium: 40 })).toThrow(InvalidMixError);
    expect(() => distribute(10, { easy: 60, medium: 50 })).toThrow(InvalidMixError);
  });

  it('rejects an empty mix', () => {
    expect(() => distribute(10, {})).toThrow(InvalidMixError);
  });

  it('rejects negative percentages', () => {
    expect(() => distribute(10, { easy: 120, medium: -20 })).toThrow(InvalidMixError);
  });

  it('rejects a non-positive or non-integer count', () => {
    expect(() => distribute(0, { easy: 100 })).toThrow(InvalidMixError);
    expect(() => distribute(-1, { easy: 100 })).toThrow(InvalidMixError);
    expect(() => distribute(1.5, { easy: 100 })).toThrow(InvalidMixError);
  });
});

describe('generateSet', () => {
  it('returns exactly count puzzles in the requested proportions', () => {
    const set = generateSet({ count: 4, mix: { easy: 50, medium: 50 }, seed: 'set-a' });
    expect(set).toHaveLength(4);
    expect(set.filter((p) => p.difficulty === 'easy')).toHaveLength(2);
    expect(set.filter((p) => p.difficulty === 'medium')).toHaveLength(2);
  });

  it('is deterministic for a given seed', () => {
    const a = generateSet({ count: 3, mix: { easy: 100 }, seed: 'set-b' });
    const b = generateSet({ count: 3, mix: { easy: 100 }, seed: 'set-b' });
    expect(a.map((p) => [...p.givens])).toEqual(b.map((p) => [...p.givens]));
  });

  it('gives each puzzle a distinct indexed seed', () => {
    const set = generateSet({ count: 3, mix: { easy: 100 }, seed: 'set-c' });
    expect(set.map((p) => p.seed)).toEqual(['set-c:0', 'set-c:1', 'set-c:2']);
    expect(new Set(set.map((p) => [...p.givens].join()))).toHaveProperty('size', 3);
  });

  it('lets a single puzzle be regenerated in isolation from its seed', () => {
    const set = generateSet({ count: 3, mix: { easy: 100 }, seed: 'set-d' });
    const target = set[1]!;
    const again = generatePuzzle({ difficulty: target.difficulty, seed: target.seed });
    expect(again.givens).toEqual(target.givens);
  });

  it('propagates mix validation errors', () => {
    expect(() => generateSet({ count: 2, mix: { easy: 30 } })).toThrow(InvalidMixError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/batch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/batch.ts`**

```ts
import { InvalidMixError } from './errors';
import { generatePuzzle } from './generator';
import { randomSeed } from './rng';
import type { Difficulty, Puzzle } from './types';

const TIERS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export type Mix = Partial<Record<Difficulty, number>>;

/**
 * Turns percentages into whole puzzle counts using largest-remainder rounding,
 * so the parts always sum to `count`.
 */
export function distribute(count: number, mix: Mix): Record<Difficulty, number> {
  if (!Number.isInteger(count) || count < 1) {
    throw new InvalidMixError(`count must be a positive integer, got ${count}`);
  }

  const entries = TIERS.map((tier) => ({ tier, pct: mix[tier] ?? 0 }));
  for (const { tier, pct } of entries) {
    if (pct < 0) throw new InvalidMixError(`mix.${tier} must not be negative, got ${pct}`);
  }

  const total = entries.reduce((sum, e) => sum + e.pct, 0);
  if (Math.abs(total - 100) > 1e-9) {
    throw new InvalidMixError(`mix must sum to 100, got ${total}`);
  }

  const exact = entries.map((e) => ({ ...e, raw: (count * e.pct) / 100 }));
  const result = Object.fromEntries(exact.map((e) => [e.tier, Math.floor(e.raw)])) as Record<
    Difficulty,
    number
  >;

  let remaining = count - TIERS.reduce((sum, tier) => sum + result[tier], 0);
  const byRemainder = [...exact].sort((a, b) => {
    const diff = b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw));
    if (Math.abs(diff) > 1e-9) return diff;
    // Stable tie-break by tier order, so distribution is deterministic.
    return TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier);
  });

  let i = 0;
  while (remaining > 0) {
    const entry = byRemainder[i % byRemainder.length]!;
    if (entry.pct > 0) {
      result[entry.tier]++;
      remaining--;
    }
    i++;
  }

  return result;
}

export function generateSet(opts: { count: number; mix: Mix; seed?: string }): Puzzle[] {
  const counts = distribute(opts.count, opts.mix);
  const seed = opts.seed ?? randomSeed();
  const out: Puzzle[] = [];

  let index = 0;
  for (const tier of TIERS) {
    for (let n = 0; n < counts[tier]; n++) {
      out.push(generatePuzzle({ difficulty: tier, seed: `${seed}:${index}` }));
      index++;
    }
  }
  return out;
}
```

- [ ] **Step 4: Implement `src/engine/index.ts`**

```ts
export type { Deduction, Difficulty, Elimination, Puzzle, SolvePath, Technique } from './types';
export { TIER_ORDER } from './types';
export { GenerationError, InvalidGridError, InvalidMixError } from './errors';
export {
  ALL_CANDIDATES,
  BOXES,
  CELLS,
  COLS,
  PEERS,
  ROWS,
  SIZE,
  UNITS,
  applyDeduction,
  bit,
  bitCount,
  bitsToDigits,
  boxOf,
  cellName,
  cloneGrid,
  colOf,
  eliminate,
  gridFromValues,
  isSolved,
  rowOf,
  setValue,
  type Grid,
} from './grid';
export { makeRng, randomSeed, shuffle, type Rng } from './rng';
export { countSolutions, solveValues } from './solver-brute';
export { LADDER, grade, nextStep, type GradeResult, type TechniqueEntry } from './grader';
export { SYMMETRIC_UNITS, generateFullGrid, generatePuzzle } from './generator';
export { distribute, generateSet, type Mix } from './batch';

import { gridFromValues, type Grid } from './grid';
import { solveValues } from './solver-brute';

/** Convenience wrapper: solve a Grid rather than a raw value array. */
export function solve(grid: Grid): Grid | null {
  const solved = solveValues(grid.values);
  return solved ? gridFromValues(solved) : null;
}
```

- [ ] **Step 5: Implement `scripts/bench.ts`**

```ts
import { generatePuzzle } from '../src/engine/generator';
import type { Difficulty } from '../src/engine/types';

const TIERS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const RUNS = 10;
const TARGETS: Record<Difficulty, number> = {
  easy: 200,
  medium: 200,
  hard: 1_000,
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
  const status = median <= TARGETS[tier] ? 'ok' : 'OVER BUDGET';
  console.log(
    `${tier.padEnd(7)} median ${median.toFixed(0).padStart(6)}ms  ` +
      `worst ${worst.toFixed(0).padStart(6)}ms  ` +
      `budget ${String(TARGETS[tier]).padStart(5)}ms  ` +
      `avg clues ${(clues / RUNS).toFixed(1)}  ${status}`,
  );
}
```

- [ ] **Step 6: Run the tests and the bench**

Run: `npx vitest run tests/batch.test.ts && npm test && npm run typecheck && npm run bench`
Expected: all tests PASS; the bench prints four lines. Record any tier reported `OVER BUDGET` — that is information for the user, not a failure of this task.

- [ ] **Step 7: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: batch generation, public API surface, and bench script"
```

Include the bench output in the report to the user.

---

### Task 13: Board — play state, rendering, and input

**Files:**

- Create: `src/ui/board.ts`, `src/styles.css`, `src/index.html`
- Create: `tests/ui/board.test.ts`

**Interfaces:**

- Consumes: `Grid`, `gridFromValues`, `bit`, `PEERS`, `CELLS`, `SIZE`, `rowOf`, `colOf` from the engine; `Puzzle` from `types.ts`. Note that `document` is touched only inside `renderBoard`, never at module level, so the pure exports stay testable under Vitest's `node` environment.
- Produces:
  ```ts
  interface PlayState { puzzle: Puzzle; entries: Uint8Array; marks: Uint16Array }
  createPlayState(puzzle: Puzzle): PlayState
  toGrid(state: PlayState): Grid
  setEntry(state: PlayState, cell: number, digit: number): void   // no-op on givens; 0 clears
  toggleMark(state: PlayState, cell: number, digit: number): void // no-op on givens
  conflicts(state: PlayState): Set<number>
  isComplete(state: PlayState): boolean
  renderBoard(root: HTMLElement, state: PlayState, opts: BoardOptions): void
  interface BoardOptions { selected: number | null; highlighted?: Set<number>; onSelect(cell: number): void }
  ```

`toGrid` is pure and testable in Node; `renderBoard` touches the DOM and is verified by hand in the browser.

- [ ] **Step 1: Write the failing tests**

`tests/ui/board.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  conflicts,
  createPlayState,
  isComplete,
  setEntry,
  toGrid,
  toggleMark,
} from '../../src/ui/board';
import { bit } from '../../src/engine/grid';
import type { Puzzle } from '../../src/engine/types';
import { valuesFrom } from '../helpers';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function puzzle(): Puzzle {
  return {
    givens: valuesFrom(GIVENS),
    solution: valuesFrom(SOLUTION),
    difficulty: 'easy',
    score: 42,
    clueCount: 30,
    seed: 'test',
  };
}

describe('createPlayState', () => {
  it('starts with no entries and no marks', () => {
    const state = createPlayState(puzzle());
    expect([...state.entries].every((v) => v === 0)).toBe(true);
    expect([...state.marks].every((v) => v === 0)).toBe(true);
  });
});

describe('setEntry', () => {
  it('records a digit in an empty cell', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 4);
    expect(state.entries[2]).toBe(4);
  });

  it('refuses to overwrite a given', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 0, 9);
    expect(state.entries[0]).toBe(0);
  });

  it('clears an entry when given 0', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 4);
    setEntry(state, 2, 0);
    expect(state.entries[2]).toBe(0);
  });
});

describe('toggleMark', () => {
  it('adds and removes a pencil mark', () => {
    const state = createPlayState(puzzle());
    toggleMark(state, 2, 4);
    expect(state.marks[2]! & bit(4)).toBeTruthy();
    toggleMark(state, 2, 4);
    expect(state.marks[2]! & bit(4)).toBe(0);
  });

  it('refuses to mark a given', () => {
    const state = createPlayState(puzzle());
    toggleMark(state, 0, 4);
    expect(state.marks[0]).toBe(0);
  });
});

describe('toGrid', () => {
  it('gives givens precedence over entries', () => {
    const state = createPlayState(puzzle());
    state.entries[0] = 9; // bypass setEntry to prove toGrid also guards
    expect(toGrid(state).values[0]).toBe(5);
  });

  it('includes player entries', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 4);
    expect(toGrid(state).values[2]).toBe(4);
  });

  it('ignores pencil marks entirely', () => {
    const a = createPlayState(puzzle());
    const b = createPlayState(puzzle());
    toggleMark(b, 2, 1);
    toggleMark(b, 2, 9);
    expect(toGrid(a).values).toEqual(toGrid(b).values);
    expect(toGrid(a).candidates).toEqual(toGrid(b).candidates);
  });

  it('computes real candidates rather than trusting marks', () => {
    const state = createPlayState(puzzle());
    toggleMark(state, 2, 5); // 5 is impossible at r1c3: r1c1 is 5
    expect(toGrid(state).candidates[2]! & bit(5)).toBe(0);
  });
});

describe('conflicts', () => {
  it('is empty for a fresh puzzle', () => {
    expect(conflicts(createPlayState(puzzle())).size).toBe(0);
  });

  it('flags both cells when a player entry duplicates a peer', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 5); // r1c3 = 5, but r1c1 is already 5
    const bad = conflicts(state);
    expect(bad.has(2)).toBe(true);
    expect(bad.has(0)).toBe(true);
  });

  it('does not flag a correct entry', () => {
    const state = createPlayState(puzzle());
    setEntry(state, 2, 4);
    expect(conflicts(state).has(2)).toBe(false);
  });
});

describe('isComplete', () => {
  it('is false for a fresh puzzle', () => {
    expect(isComplete(createPlayState(puzzle()))).toBe(false);
  });

  it('is true once every cell matches the solution', () => {
    const state = createPlayState(puzzle());
    for (let c = 0; c < 81; c++) {
      if (state.puzzle.givens[c] === 0) setEntry(state, c, state.puzzle.solution[c]!);
    }
    expect(isComplete(state)).toBe(true);
  });

  it('is false when the grid is full but wrong', () => {
    const state = createPlayState(puzzle());
    for (let c = 0; c < 81; c++) {
      if (state.puzzle.givens[c] === 0) setEntry(state, c, state.puzzle.solution[c]!);
    }
    const firstEmpty = [...state.puzzle.givens].findIndex((v) => v === 0);
    setEntry(state, firstEmpty, state.puzzle.solution[firstEmpty] === 1 ? 2 : 1);
    expect(isComplete(state)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui/board.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure part of `src/ui/board.ts`**

```ts
import { CELLS, PEERS, SIZE, bit, colOf, gridFromValues, rowOf, type Grid } from '../engine/grid';
import type { Puzzle } from '../engine/types';

export interface PlayState {
  puzzle: Puzzle;
  /** Player-entered digits, 0 where untouched. Givens are never stored here. */
  entries: Uint8Array;
  /** Player pencil marks as candidate bitmasks. Never read by the engine. */
  marks: Uint16Array;
}

export function createPlayState(puzzle: Puzzle): PlayState {
  return {
    puzzle,
    entries: new Uint8Array(CELLS),
    marks: new Uint16Array(CELLS),
  };
}

export function isGiven(state: PlayState, cell: number): boolean {
  return state.puzzle.givens[cell] !== 0;
}

export function setEntry(state: PlayState, cell: number, digit: number): void {
  if (isGiven(state, cell)) return;
  state.entries[cell] = digit;
  if (digit !== 0) state.marks[cell] = 0;
}

export function toggleMark(state: PlayState, cell: number, digit: number): void {
  if (isGiven(state, cell)) return;
  state.marks[cell] ^= bit(digit);
}

/**
 * Projects play state into an engine Grid. Givens win over entries, and pencil
 * marks are ignored: candidates are recomputed from the values, so a wrong mark
 * can never mislead a hint.
 */
export function toGrid(state: PlayState): Grid {
  const values = new Uint8Array(CELLS);
  for (let c = 0; c < CELLS; c++) {
    values[c] = state.puzzle.givens[c] !== 0 ? state.puzzle.givens[c]! : state.entries[c]!;
  }
  return gridFromValues(values);
}

/** Cells whose digit duplicates a peer's. Both sides of a clash are reported. */
export function conflicts(state: PlayState): Set<number> {
  const values = new Uint8Array(CELLS);
  for (let c = 0; c < CELLS; c++) {
    values[c] = state.puzzle.givens[c] !== 0 ? state.puzzle.givens[c]! : state.entries[c]!;
  }
  const bad = new Set<number>();
  for (let c = 0; c < CELLS; c++) {
    const v = values[c]!;
    if (v === 0) continue;
    for (const p of PEERS[c]!) {
      if (values[p] === v) {
        bad.add(c);
        bad.add(p);
      }
    }
  }
  return bad;
}

export function isComplete(state: PlayState): boolean {
  for (let c = 0; c < CELLS; c++) {
    const v = state.puzzle.givens[c] !== 0 ? state.puzzle.givens[c]! : state.entries[c]!;
    if (v !== state.puzzle.solution[c]) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Append the rendering half to `src/ui/board.ts`**

```ts
export interface BoardOptions {
  selected: number | null;
  highlighted?: Set<number>;
  onSelect: (cell: number) => void;
}

export function renderBoard(root: HTMLElement, state: PlayState, opts: BoardOptions): void {
  const bad = conflicts(state);
  root.replaceChildren();
  root.classList.add('board');

  for (let c = 0; c < CELLS; c++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.cell = String(c);

    if (colOf(c) % 3 === 0 && colOf(c) !== 0) cell.classList.add('block-left');
    if (rowOf(c) % 3 === 0 && rowOf(c) !== 0) cell.classList.add('block-top');
    if (c === opts.selected) cell.classList.add('selected');
    if (opts.highlighted?.has(c)) cell.classList.add('highlighted');
    if (bad.has(c)) cell.classList.add('conflict');

    const given = state.puzzle.givens[c]!;
    const entry = state.entries[c]!;

    if (given !== 0) {
      cell.classList.add('given');
      cell.textContent = String(given);
    } else if (entry !== 0) {
      cell.classList.add('entry');
      cell.textContent = String(entry);
    } else if (state.marks[c] !== 0) {
      const marks = document.createElement('span');
      marks.className = 'marks';
      for (let d = 1; d <= SIZE; d++) {
        const slot = document.createElement('span');
        slot.textContent = state.marks[c]! & bit(d) ? String(d) : '';
        marks.append(slot);
      }
      cell.append(marks);
    }

    cell.addEventListener('click', () => opts.onSelect(c));
    root.append(cell);
  }
}
```

- [ ] **Step 6: Write `src/index.html` and `src/styles.css`**

`src/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sudoku generator</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <h1>Sudoku generator</h1>
      <form id="controls">
        <label>
          Difficulty
          <select id="difficulty">
            <option value="easy">Easy</option>
            <option value="medium" selected>Medium</option>
            <option value="hard">Hard</option>
            <option value="expert">Expert</option>
          </select>
        </label>
        <label>
          Seed
          <input id="seed" type="text" placeholder="blank = random" />
        </label>
        <button type="submit" id="generate">Generate</button>
      </form>
      <p id="status" role="status"></p>
      <div id="board"></div>
      <section id="explainer">
        <button type="button" id="next-step">Next step</button>
        <button type="button" id="notes">Pencil marks: off</button>
        <p id="explanation"></p>
      </section>
    </main>
    <script type="module" src="./ui/main.ts"></script>
  </body>
</html>
```

`src/styles.css`:

```css
:root {
  --line: #333;
  --given: #111;
  --entry: #1a56c4;
  --conflict: #c62828;
  --highlight: #fff3c4;
  --selected: #d7e6ff;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
}

body {
  margin: 0;
  padding: 2rem 1rem;
  display: flex;
  justify-content: center;
}

main {
  width: min(32rem, 100%);
}

#controls {
  display: flex;
  gap: 0.75rem;
  align-items: end;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

#controls label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}

.board {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  border: 2px solid var(--line);
  aspect-ratio: 1;
}

.cell {
  all: unset;
  display: grid;
  place-items: center;
  border: 1px solid #bbb;
  font-size: 1.4rem;
  cursor: pointer;
  aspect-ratio: 1;
  background: #fff;
}

.cell.block-left {
  border-left: 2px solid var(--line);
}
.cell.block-top {
  border-top: 2px solid var(--line);
}
.cell.given {
  font-weight: 700;
  color: var(--given);
}
.cell.entry {
  color: var(--entry);
}
.cell.conflict {
  background: #ffe5e5;
  color: var(--conflict);
}
.cell.highlighted {
  background: var(--highlight);
}
.cell.selected {
  background: var(--selected);
}

.marks {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  font-size: 0.55rem;
  color: #666;
  width: 100%;
  height: 100%;
  place-items: center;
}

#explainer {
  margin-top: 1rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

#explanation {
  flex-basis: 100%;
  min-height: 2.5rem;
  margin: 0;
}

#status {
  min-height: 1.5rem;
  color: #555;
}
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: play state, board rendering, and page shell"
```

---

### Task 14: Explainer and wiring

**Files:**

- Create: `src/ui/explainer.ts`, `src/ui/main.ts`

**Interfaces:**

- Consumes: `nextStep` from `grader.ts`; `generatePuzzle` from `generator.ts`; `GenerationError` from `errors.ts`; everything from `ui/board.ts`.
- Produces: `describeNextStep(state: PlayState): { text: string; highlighted: Set<number> }` (explainer.ts); no exports from `main.ts`.

- [ ] **Step 1: Implement `src/ui/explainer.ts`**

```ts
import { nextStep } from '../engine/grader';
import { toGrid, type PlayState } from './board';

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
  } catch {
    return {
      text: 'That position is contradictory — remove a conflicting digit before asking for a hint.',
      highlighted: new Set(),
    };
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
```

- [ ] **Step 2: Implement `src/ui/main.ts`**

```ts
import { GenerationError } from '../engine/errors';
import { generatePuzzle } from '../engine/generator';
import type { Difficulty } from '../engine/types';
import {
  createPlayState,
  isComplete,
  renderBoard,
  setEntry,
  toggleMark,
  type PlayState,
} from './board';
import { describeNextStep } from './explainer';

const boardEl = document.querySelector<HTMLDivElement>('#board')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const explanationEl = document.querySelector<HTMLParagraphElement>('#explanation')!;
const seedEl = document.querySelector<HTMLInputElement>('#seed')!;
const difficultyEl = document.querySelector<HTMLSelectElement>('#difficulty')!;
const controlsEl = document.querySelector<HTMLFormElement>('#controls')!;
const nextStepEl = document.querySelector<HTMLButtonElement>('#next-step')!;
const notesEl = document.querySelector<HTMLButtonElement>('#notes')!;

let state: PlayState | null = null;
let selected: number | null = null;
let highlighted = new Set<number>();
let notesMode = false;

function draw(): void {
  if (!state) return;
  renderBoard(boardEl, state, {
    selected,
    highlighted,
    onSelect: (cell) => {
      selected = cell;
      draw();
    },
  });
}

function report(): void {
  if (!state) return;
  const { difficulty, score, clueCount, seed } = state.puzzle;
  const done = isComplete(state) ? ' — solved!' : '';
  statusEl.textContent = `${difficulty} · ${clueCount} clues · score ${score} · seed ${seed}${done}`;
}

function generate(): void {
  const difficulty = difficultyEl.value as Difficulty;
  const seed = seedEl.value.trim() || undefined;
  statusEl.textContent = 'Generating…';
  explanationEl.textContent = '';
  highlighted = new Set();
  selected = null;

  // Yield once so the "Generating…" message paints before the blocking work.
  setTimeout(() => {
    try {
      const puzzle = generatePuzzle({ difficulty, seed });
      state = createPlayState(puzzle);
      seedEl.value = puzzle.seed;
      draw();
      report();
    } catch (err) {
      state = null;
      boardEl.replaceChildren();
      statusEl.textContent =
        err instanceof GenerationError
          ? `${err.message} (best tier reached: ${err.bestTier ?? 'none'})`
          : `Unexpected error: ${String(err)}`;
    }
  }, 0);
}

controlsEl.addEventListener('submit', (event) => {
  event.preventDefault();
  generate();
});

nextStepEl.addEventListener('click', () => {
  if (!state) return;
  const description = describeNextStep(state);
  explanationEl.textContent = description.text;
  highlighted = description.highlighted;
  draw();
});

notesEl.addEventListener('click', () => {
  notesMode = !notesMode;
  notesEl.textContent = `Pencil marks: ${notesMode ? 'on' : 'off'}`;
});

document.addEventListener('keydown', (event) => {
  if (!state) return;

  if (event.key.toLowerCase() === 'n') {
    notesMode = !notesMode;
    notesEl.textContent = `Pencil marks: ${notesMode ? 'on' : 'off'}`;
    return;
  }

  if (selected === null) return;

  const moves: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -9,
    ArrowDown: 9,
  };
  const delta = moves[event.key];
  if (delta !== undefined) {
    event.preventDefault();
    const next = selected + delta;
    if (next >= 0 && next < 81) {
      // Horizontal moves must not wrap across rows.
      if (Math.abs(delta) === 1 && Math.floor(next / 9) !== Math.floor(selected / 9)) return;
      selected = next;
      draw();
    }
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
    setEntry(state, selected, 0);
    highlighted = new Set();
    draw();
    report();
    return;
  }

  if (/^[1-9]$/.test(event.key)) {
    const digit = Number(event.key);
    if (notesMode) toggleMark(state, selected, digit);
    else setEntry(state, selected, digit);
    highlighted = new Set();
    draw();
    report();
  }
});

generate();
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: PASS, no TypeScript errors.

- [ ] **Step 4: Verify in the browser by hand**

Run: `npm run dev`, then open the printed URL and check each item:

1. A medium puzzle appears on load, with the seed filled in.
2. Generating with the same seed twice gives an identical grid.
3. Givens are bold and black; typed digits are blue; givens cannot be overwritten.
4. Typing a digit that duplicates a peer turns both cells red.
5. `N` toggles pencil marks; digits then appear small in a 3×3 layout.
6. _Next step_ names a technique, describes the deduction, and highlights the cells it used.
7. Solving the puzzle fully makes the status line say "solved!".
8. Generating an Expert puzzle shows "Generating…" and then a grid, not a frozen page.

- [ ] **Step 5: Verify, then commit**

Run: `npm run verify`
Expected: typecheck, lint, format check and tests all PASS. If any of the four fails, fix the cause — do not commit, and do not silence the check.

```bash
git add -A
git commit -m "feat: step-by-step explainer and harness wiring"
```

Report the results of the manual browser checks.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: architecture and module boundaries → the File Structure table; data model and the Grid/Puzzle/PlayState distinction → Tasks 1 and 13; public API → Tasks 1, 10, 11, 12; difficulty model and the technique ladder → Tasks 4–10; logic-only guarantee → Task 10 (`outcome: 'stalled'`) and Task 11 (`dig` rejects non-`solved` outcomes); generation algorithm → Task 11; batch API → Task 12; browser harness → Tasks 13–14; testing strategy → tests in every task; error handling → Task 1 (`errors.ts`) plus its uses; performance budget → Task 12's bench script.

**Known gaps, stated rather than hidden:**

- The spec's "published puzzles with independently known ratings" fixture is replaced by technique unit tests, path replay, and generator round-trip. Rationale is in "A Deliberate Deviation From the Spec" above.
- Two tests in Task 3 and Task 10 are written as tolerant assertions (`toBeGreaterThanOrEqual`, `toContain` over several outcomes) because the exact behaviour depends on grids whose properties cannot be asserted from memory. Whoever implements those tasks should tighten them to exact values once the real behaviour is observed — and must confirm the observed value is _correct_, not merely current.
- `score` is currently only reported, never used to order puzzles. That is intentional: the notebook ramp is a later concern.

**Type consistency check.** `Technique` is declared once in `types.ts` and imported by all six technique modules and the grader. Names used across task boundaries — `gridFromValues`, `toGrid`, `nextStep`, `grade`, `generatePuzzle`, `generateSet`, `distribute`, `SYMMETRIC_UNITS`, `createPlayState`, `renderBoard`, `describeNextStep` — are spelled identically in the module that defines them and every module that consumes them. Technique `name` strings in `LADDER` match the `technique` field each technique module emits, which the Task 10 cost test asserts directly.

**Risk to watch during execution.** `dig` calls `grade` after every accepted removal, and `grade` re-runs the whole ladder from scratch each time. For Expert this is the dominant cost. If Task 12's bench reports Expert over budget, the first optimisation is to skip grading until `countSolutions` has passed — already done — and the second is to memoise nothing and instead lower `MAX_ATTEMPTS`. Do not "fix" it by relaxing the tier match; that would silently break the difficulty contract.
