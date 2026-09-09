# Annotation, Undo, and Erase UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the browser harness NYT-quality solving ergonomics: annotate by hovering positions inside the selected cell, undo any board change, and erase that steps a cell back through its own history.

**Architecture:** A three-state model per cell (Empty / Annotating / Filled) with a new `shadow` layer remembering annotations displaced by a placed digit. Undo is a stack of full state snapshots — the state is 405 bytes, so there is no inverse-operation logic to get wrong. The pure model moves out of `board.ts`, leaving that file as a renderer.

**Tech Stack:** TypeScript (strict), Vite, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-annotation-undo-ux-design.md`

## Global Constraints

- **This is entirely UI-side.** Do not modify anything under `src/engine/` or `tests/` outside the UI test directories. No new engine exports.
- `src/ui/` imports the engine only through the barrel `'../engine'`, never a submodule. ESLint enforces this and will fail the build.
- `toGrid` must continue to ignore `marks`, and must ignore `shadow` too. A hint can never depend on the player's annotations.
- TypeScript `strict` plus `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`. No `any`.
- ESLint typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`.
- **Never suppress a diagnostic to make the build green.** No `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` without a comment explaining why the rule is wrong there — and report every one.
- `@typescript-eslint/no-non-null-assertion` is OFF by design; `!` on an indexed read is the codebase idiom under `noUncheckedIndexedAccess`.
- **`npm run verify` and `npm run build` must both pass before every commit.** Never weaken a test, a lint rule, or a tsconfig flag to get green.
- **Every test must be able to fail.** Before writing one, name the mutation of the implementation that would break it. If you cannot, the test is worthless.
- Each task leaves the app working. Do not leave a task half-migrated.

## File Structure

| File                          | Responsibility                                                                                               | Task                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `src/ui/play-state.ts`        | `PlayState` (+ `shadow`), the three transitions, `isAnnotatable`, and the pure helpers moved from `board.ts` | 1                      |
| `src/ui/history.ts`           | Snapshot stack: `createHistory`, `commit`, `undo`, `canUndo`, `clear`                                        | 2                      |
| `src/ui/board.ts`             | `renderBoard` only, including the 3×3 slot buttons                                                           | 1 (shrinks), 4 (slots) |
| `src/ui/main.ts`              | Wiring: keyboard, Undo/Erase buttons, generation                                                             | 1, 3, 4                |
| `src/ui/explainer.ts`         | Unchanged behaviour; import moves to `play-state`                                                            | 1                      |
| `src/index.html`              | Undo/Erase buttons replace the notes toggle                                                                  | 3                      |
| `src/styles.css`              | Slot grid and hover reveal                                                                                   | 4                      |
| `tests/ui/play-state.test.ts` | State machine + the moved model tests                                                                        | 1                      |
| `tests/ui/history.test.ts`    | Snapshot stack, including the deep-copy guard                                                                | 2                      |
| `tests/ui/board.test.ts`      | **Deleted** — its contents move to `play-state.test.ts`                                                      | 1                      |

---

### Task 1: The cell state machine

Moves the pure model out of `board.ts`, adds the `shadow` layer, and replaces `setEntry`/`toggleMark` with three named transitions. `board.ts` is left holding only `renderBoard`.

**Files:**

- Create: `src/ui/play-state.ts`, `tests/ui/play-state.test.ts`
- Modify: `src/ui/board.ts` (delete lines 13-91, import what it needs), `src/ui/explainer.ts` (import path), `src/ui/main.ts` (call sites)
- Delete: `tests/ui/board.test.ts`

**Interfaces:**

- Consumes: `CELLS`, `PEERS`, `SIZE`, `bit`, `cellName`, `colOf`, `rowOf`, `gridFromValues`, `Grid`, `Puzzle` from `'../engine'`.
- Produces: `PlayState` (now with `shadow: Uint16Array`); `createPlayState(puzzle): PlayState`; `isGiven(state, cell): boolean`; `isAnnotatable(state, cell): boolean`; `placeDigit(state, cell, digit): void`; `toggleAnnotation(state, cell, digit): void`; `erase(state, cell): void`; `toGrid(state): Grid`; `conflicts(state): Set<number>`; `isComplete(state): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/play-state.test.ts`. Start by copying the whole of `tests/ui/board.test.ts`, then change its imports to `'../../src/ui/play-state'`, rename `setEntry(state, c, 0)` calls to `erase(state, c)`, `setEntry(state, c, d)` to `placeDigit(state, c, d)`, and `toggleMark` to `toggleAnnotation`. Then add the new tests below.

```ts
import { describe, expect, it } from 'vitest';
import {
  createPlayState,
  erase,
  isAnnotatable,
  placeDigit,
  toGrid,
  toggleAnnotation,
} from '../../src/ui/play-state';
import { bit } from '../../src/engine';
import type { Puzzle } from '../../src/engine';
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

/** Cell 2 (r1c3) is empty in the fixture; cell 0 (r1c1) is a given holding 5. */
const FREE = 2;
const GIVEN = 0;

describe('the worked example from the spec', () => {
  it('steps Annotating -> Filled -> Annotating -> Empty -> Empty', () => {
    const s = createPlayState(puzzle());

    toggleAnnotation(s, FREE, 3);
    toggleAnnotation(s, FREE, 5);
    expect(s.marks[FREE]).toBe(bit(3) | bit(5));
    expect(s.entries[FREE]).toBe(0);

    placeDigit(s, FREE, 5);
    expect(s.entries[FREE]).toBe(5);
    expect(s.marks[FREE]).toBe(0);
    expect(s.shadow[FREE]).toBe(bit(3) | bit(5));

    erase(s, FREE);
    expect(s.entries[FREE]).toBe(0);
    expect(s.marks[FREE]).toBe(bit(3) | bit(5));
    expect(s.shadow[FREE]).toBe(0);

    erase(s, FREE);
    expect(s.marks[FREE]).toBe(0);

    erase(s, FREE);
    expect(s.entries[FREE]).toBe(0);
    expect(s.marks[FREE]).toBe(0);
    expect(s.shadow[FREE]).toBe(0);
  });
});

describe('placeDigit', () => {
  it('from Empty leaves no shadow', () => {
    const s = createPlayState(puzzle());
    placeDigit(s, FREE, 7);
    expect(s.entries[FREE]).toBe(7);
    expect(s.shadow[FREE]).toBe(0);
  });

  it('from Annotating moves the annotations into the shadow', () => {
    const s = createPlayState(puzzle());
    toggleAnnotation(s, FREE, 1);
    placeDigit(s, FREE, 7);
    expect(s.marks[FREE]).toBe(0);
    expect(s.shadow[FREE]).toBe(bit(1));
  });

  it('from Filled keeps the ORIGINAL shadow, so a change of mind is safe', () => {
    const s = createPlayState(puzzle());
    toggleAnnotation(s, FREE, 3);
    toggleAnnotation(s, FREE, 5);
    placeDigit(s, FREE, 5);
    placeDigit(s, FREE, 7);
    expect(s.entries[FREE]).toBe(7);
    expect(s.shadow[FREE]).toBe(bit(3) | bit(5));
    erase(s, FREE);
    expect(s.marks[FREE]).toBe(bit(3) | bit(5));
  });

  it('refuses to touch a given', () => {
    const s = createPlayState(puzzle());
    placeDigit(s, GIVEN, 9);
    expect(s.entries[GIVEN]).toBe(0);
  });
});

describe('toggleAnnotation', () => {
  it('adds then removes', () => {
    const s = createPlayState(puzzle());
    toggleAnnotation(s, FREE, 4);
    expect(s.marks[FREE]! & bit(4)).not.toBe(0);
    toggleAnnotation(s, FREE, 4);
    expect(s.marks[FREE]! & bit(4)).toBe(0);
  });

  it('is a no-op on a Filled cell — erase first', () => {
    const s = createPlayState(puzzle());
    placeDigit(s, FREE, 7);
    toggleAnnotation(s, FREE, 4);
    expect(s.marks[FREE]).toBe(0);
    expect(s.entries[FREE]).toBe(7);
  });

  it('refuses to touch a given', () => {
    const s = createPlayState(puzzle());
    toggleAnnotation(s, GIVEN, 4);
    expect(s.marks[GIVEN]).toBe(0);
  });
});

describe('erase', () => {
  it('from Filled with no shadow lands on Empty, not Annotating', () => {
    const s = createPlayState(puzzle());
    placeDigit(s, FREE, 7);
    erase(s, FREE);
    expect(s.entries[FREE]).toBe(0);
    expect(s.marks[FREE]).toBe(0);
  });

  it('refuses to touch a given', () => {
    const s = createPlayState(puzzle());
    erase(s, GIVEN);
    expect(s.puzzle.givens[GIVEN]).toBe(5);
  });
});

describe('isAnnotatable', () => {
  it('is false for a given', () => {
    expect(isAnnotatable(createPlayState(puzzle()), GIVEN)).toBe(false);
  });

  it('is true for an empty cell and false once it is filled', () => {
    const s = createPlayState(puzzle());
    expect(isAnnotatable(s, FREE)).toBe(true);
    placeDigit(s, FREE, 7);
    expect(isAnnotatable(s, FREE)).toBe(false);
    erase(s, FREE);
    expect(isAnnotatable(s, FREE)).toBe(true);
  });
});

describe('toGrid', () => {
  it('ignores shadow as well as marks', () => {
    const a = createPlayState(puzzle());
    const b = createPlayState(puzzle());
    toggleAnnotation(b, FREE, 1);
    placeDigit(b, FREE, 4);
    erase(b, FREE);
    erase(b, FREE);
    expect(toGrid(a).values).toEqual(toGrid(b).values);
    expect(toGrid(a).candidates).toEqual(toGrid(b).candidates);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui/play-state.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/play-state"`.

- [ ] **Step 3: Create `src/ui/play-state.ts`**

Move lines 13-91 of `src/ui/board.ts` here verbatim, then apply the changes below. Keep the existing doc comments on `toGrid`, `mergedValues`, and `conflicts` — especially `toGrid`'s note that it can throw `InvalidGridError`, which the explainer relies on.

```ts
import { CELLS, PEERS, bit, gridFromValues, type Grid, type Puzzle } from '../engine';

export interface PlayState {
  puzzle: Puzzle;
  /** Player-entered digits, 0 where untouched. Givens are never stored here. */
  entries: Uint8Array;
  /** Player pencil marks as candidate bitmasks. Never read by the engine. */
  marks: Uint16Array;
  /**
   * Annotations displaced when a digit was placed, so `erase` can restore them.
   * Undo cannot do this job: a player may place a digit, work elsewhere for ten
   * moves, then return and erase, and still expect the annotations back.
   */
  shadow: Uint16Array;
}

export function createPlayState(puzzle: Puzzle): PlayState {
  return {
    puzzle,
    entries: new Uint8Array(CELLS),
    marks: new Uint16Array(CELLS),
    shadow: new Uint16Array(CELLS),
  };
}

export function isGiven(state: PlayState, cell: number): boolean {
  return state.puzzle.givens[cell] !== 0;
}

/** A cell holds annotations only while it is neither a given nor filled. */
export function isAnnotatable(state: PlayState, cell: number): boolean {
  return !isGiven(state, cell) && state.entries[cell] === 0;
}

/**
 * Empty or Annotating -> Filled, remembering any displaced annotations.
 * Filled -> Filled leaves the shadow alone, so changing your mind about the
 * digit does not lose the annotations you started from.
 */
export function placeDigit(state: PlayState, cell: number, digit: number): void {
  if (isGiven(state, cell)) return;
  if (state.entries[cell] === 0) {
    state.shadow[cell] = state.marks[cell]!;
    state.marks[cell] = 0;
  }
  state.entries[cell] = digit;
}

/** Toggles one annotation. A Filled cell offers no annotation affordance. */
export function toggleAnnotation(state: PlayState, cell: number, digit: number): void {
  if (!isAnnotatable(state, cell)) return;
  state.marks[cell]! ^= bit(digit);
}

/** Filled -> Annotating (restoring the shadow) -> Empty -> nothing. */
export function erase(state: PlayState, cell: number): void {
  if (isGiven(state, cell)) return;
  if (state.entries[cell] !== 0) {
    state.entries[cell] = 0;
    state.marks[cell] = state.shadow[cell]!;
    state.shadow[cell] = 0;
    return;
  }
  state.marks[cell] = 0;
}
```

Then append `mergedValues`, `toGrid`, `conflicts`, and `isComplete` exactly as they appear in `board.ts` lines 44-91.

- [ ] **Step 4: Shrink `src/ui/board.ts`**

Delete lines 13-91 (everything from `export interface PlayState` through `isComplete`). Replace the import block at the top with:

```ts
import { SIZE, bit, colOf, rowOf } from '../engine';
import { conflicts, type PlayState } from './play-state';
```

`BoardOptions` and `renderBoard` stay exactly as they are. `board.ts` should now be about 50 lines.

- [ ] **Step 5: Update the two consumers**

In `src/ui/explainer.ts`, change the `toGrid`/`PlayState` import from `'./board'` to `'./play-state'`.

In `src/ui/main.ts`, change the import block so `createPlayState`, `isComplete`, and the transitions come from `'./play-state'` while `renderBoard` still comes from `'./board'`, then update the three call sites:

```ts
// was: setEntry(state, selected, 0);
erase(state, selected);

// was: if (notesMode) toggleMark(state, selected, digit);
//      else setEntry(state, selected, digit);
if (notesMode) toggleAnnotation(state, selected, digit);
else placeDigit(state, selected, digit);
```

Leave `notesMode` in place for now — Task 3 removes it. This task must leave the app working exactly as it does today.

- [ ] **Step 6: Delete the old test file**

```bash
git rm tests/ui/board.test.ts
```

Its contents now live in `tests/ui/play-state.test.ts`. `board.ts` holds only `renderBoard`, which is hand-verified in a browser by long-standing decision.

- [ ] **Step 7: Verify**

Run: `npx prettier --write . && npm run verify && npm run build`
Expected: all four gates pass; test count rises (the moved tests plus roughly 13 new ones).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: extract play-state module with shadow annotation layer"
```

---

### Task 2: Snapshot history

A standalone undo stack. Nothing wires it up yet — that is Task 3.

**Files:**

- Create: `src/ui/history.ts`, `tests/ui/history.test.ts`

**Interfaces:**

- Consumes: `PlayState` from `./play-state`.
- Produces: `History`; `createHistory(): History`; `commit(history, state, mutate: () => void): boolean`; `undo(history, state): boolean`; `canUndo(history): boolean`; `clear(history): void`.

**Note on `commit` versus the spec's "push before every mutation":** `commit` wraps the mutation so a no-op action never enters the history. Pressing Delete on an already-empty cell should not consume an undo step. This satisfies the spec's "one snapshot per action" — an action that changes nothing is not an action.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canUndo, clear, commit, createHistory, undo } from '../../src/ui/history';
import { createPlayState, erase, placeDigit, toggleAnnotation } from '../../src/ui/play-state';
import type { Puzzle } from '../../src/engine';
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

const FREE = 2;
/** Also empty in the fixture. Cell 4 is a given (7) — do not use it here. */
const OTHER = 3;

describe('undo', () => {
  it('is a no-op on an empty history', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    expect(canUndo(h)).toBe(false);
    expect(undo(h, s)).toBe(false);
  });

  it('reverses a single placement', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    commit(h, s, () => {
      placeDigit(s, FREE, 7);
    });
    expect(s.entries[FREE]).toBe(7);
    expect(undo(h, s)).toBe(true);
    expect(s.entries[FREE]).toBe(0);
  });

  it('restores the shadow, not just the visible state', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    commit(h, s, () => {
      toggleAnnotation(s, FREE, 3);
    });
    commit(h, s, () => {
      placeDigit(s, FREE, 5);
    });
    commit(h, s, () => {
      erase(s, FREE);
    });
    // Erase restored the annotation and emptied the shadow. Undoing it must put
    // the digit back AND refill the shadow, or a second erase would misbehave.
    undo(h, s);
    expect(s.entries[FREE]).toBe(5);
    expect(s.marks[FREE]).toBe(0);
    expect(s.shadow[FREE]).not.toBe(0);
  });

  it('returns byte-identical state after N actions and N undos', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    const before = {
      entries: Uint8Array.from(s.entries),
      marks: Uint16Array.from(s.marks),
      shadow: Uint16Array.from(s.shadow),
    };

    const actions = [
      () => {
        toggleAnnotation(s, FREE, 1);
      },
      () => {
        toggleAnnotation(s, FREE, 9);
      },
      () => {
        placeDigit(s, FREE, 4);
      },
      () => {
        toggleAnnotation(s, OTHER, 2);
      },
      () => {
        erase(s, FREE);
      },
      () => {
        erase(s, FREE);
      },
    ];
    for (const a of actions) commit(h, s, a);
    expect(s.entries).not.toEqual(before.entries);

    for (let i = 0; i < actions.length; i++) expect(undo(h, s)).toBe(true);

    expect(s.entries).toEqual(before.entries);
    expect(s.marks).toEqual(before.marks);
    expect(s.shadow).toEqual(before.shadow);
    expect(canUndo(h)).toBe(false);
  });
});

describe('commit', () => {
  it('does not record an action that changed nothing', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    // Erasing an already-empty cell must not consume an undo step.
    expect(
      commit(h, s, () => {
        erase(s, FREE);
      }),
    ).toBe(false);
    expect(canUndo(h)).toBe(false);
  });

  it('does not record a transition the state machine refuses', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    // Cell 0 is a given; every transition is a no-op there.
    expect(
      commit(h, s, () => {
        placeDigit(s, 0, 9);
      }),
    ).toBe(false);
    expect(canUndo(h)).toBe(false);
  });

  it('snapshots deep-copy the arrays', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    commit(h, s, () => {
      placeDigit(s, FREE, 7);
    });
    // Mutate the live state directly, bypassing commit. If the snapshot aliased
    // these arrays, undo would restore the present and this test would fail.
    s.entries[FREE] = 9;
    s.marks[OTHER] = 0b101;
    undo(h, s);
    expect(s.entries[FREE]).toBe(0);
    expect(s.marks[OTHER]).toBe(0);
  });
});

describe('clear', () => {
  it('drops the whole history', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    commit(h, s, () => {
      placeDigit(s, FREE, 7);
    });
    clear(h);
    expect(canUndo(h)).toBe(false);
    expect(undo(h, s)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui/history.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/history"`.

- [ ] **Step 3: Implement `src/ui/history.ts`**

```ts
import type { PlayState } from './play-state';

interface Snapshot {
  entries: Uint8Array;
  marks: Uint16Array;
  shadow: Uint16Array;
}

export interface History {
  stack: Snapshot[];
}

export function createHistory(): History {
  return { stack: [] };
}

/**
 * Copies every array. Aliasing them instead would make undo restore the
 * present — the one bug this design admits, so it has its own test.
 */
function snapshot(state: PlayState): Snapshot {
  return {
    entries: Uint8Array.from(state.entries),
    marks: Uint16Array.from(state.marks),
    shadow: Uint16Array.from(state.shadow),
  };
}

function same(a: Uint8Array | Uint16Array, b: Uint8Array | Uint16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Runs `mutate`, recording an undo step only if it actually changed the board.
 * Returns whether anything changed, so a caller can skip a redraw.
 */
export function commit(history: History, state: PlayState, mutate: () => void): boolean {
  const before = snapshot(state);
  mutate();
  if (
    same(before.entries, state.entries) &&
    same(before.marks, state.marks) &&
    same(before.shadow, state.shadow)
  ) {
    return false;
  }
  history.stack.push(before);
  return true;
}

export function canUndo(history: History): boolean {
  return history.stack.length > 0;
}

/** Restores the most recent snapshot. Returns false when there is nothing to undo. */
export function undo(history: History, state: PlayState): boolean {
  const last = history.stack.pop();
  if (!last) return false;
  state.entries.set(last.entries);
  state.marks.set(last.marks);
  state.shadow.set(last.shadow);
  return true;
}

export function clear(history: History): void {
  history.stack.length = 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/history.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify and commit**

Run: `npx prettier --write . && npm run verify && npm run build`
Expected: all gates pass.

```bash
git add -A
git commit -m "feat: snapshot-based undo history"
```

---

### Task 3: Wire undo, Shift-annotation, and the buttons

Removes notes mode, adds `Shift`+digit annotation, `Cmd/Ctrl+Z`, and the Undo and Erase buttons. After this task the whole feature works from the keyboard; Task 4 adds the mouse affordance.

**Files:**

- Modify: `src/index.html`, `src/ui/main.ts`

**Interfaces:**

- Consumes: everything from `./play-state` and `./history`.
- Produces: nothing importable — `main.ts` is wiring.

- [ ] **Step 1: Update `src/index.html`**

Delete the notes button and add an actions row between the board and the explainer:

```html
<div id="board"></div>
<div id="actions">
  <button type="button" id="undo" disabled>Undo</button>
  <button type="button" id="erase" disabled>Erase</button>
</div>
<section id="explainer">
  <button type="button" id="next-step">Next step</button>
  <p id="explanation"></p>
</section>
```

The removed line was `<button type="button" id="notes">Pencil marks: off</button>`.

- [ ] **Step 2: Update the top of `src/ui/main.ts`**

Replace the element lookups and module state. Delete `notesEl` and `notesMode`; add `undoEl`, `eraseEl`, and the history.

```ts
import { GenerationError, generatePuzzle, type Difficulty } from '../engine';
import { renderBoard } from './board';
import {
  createPlayState,
  erase,
  isComplete,
  isGiven,
  placeDigit,
  toggleAnnotation,
  type PlayState,
} from './play-state';
import { canUndo, clear, commit, createHistory, undo } from './history';
import { describeNextStep } from './explainer';

const boardEl = document.querySelector<HTMLDivElement>('#board')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const explanationEl = document.querySelector<HTMLParagraphElement>('#explanation')!;
const seedEl = document.querySelector<HTMLInputElement>('#seed')!;
const difficultyEl = document.querySelector<HTMLSelectElement>('#difficulty')!;
const controlsEl = document.querySelector<HTMLFormElement>('#controls')!;
const nextStepEl = document.querySelector<HTMLButtonElement>('#next-step')!;
const undoEl = document.querySelector<HTMLButtonElement>('#undo')!;
const eraseEl = document.querySelector<HTMLButtonElement>('#erase')!;

let state: PlayState | null = null;
let selected: number | null = null;
let highlighted = new Set<number>();
const history = createHistory();
```

- [ ] **Step 3: Add the action helper and button state**

Add these above `draw()`. `act` is the single funnel every board mutation goes through, so nothing can change the board without an undo step.

```ts
function syncButtons(): void {
  undoEl.disabled = !canUndo(history);
  eraseEl.disabled = state === null || selected === null || isGiven(state, selected);
}

/** Every board mutation goes through here, so undo can never miss one. */
function act(mutate: () => void): void {
  if (!state) return;
  if (commit(history, state, mutate)) {
    highlighted = new Set();
    draw();
    report();
  }
  syncButtons();
}
```

Then call `syncButtons()` at the end of `draw()`'s `onSelect` callback and at the end of `generate()`'s success path.

- [ ] **Step 4: Reset history when a puzzle is generated**

Inside `generate()`, after `state = createPlayState(puzzle);`, add:

```ts
clear(history);
```

- [ ] **Step 5: Replace the keyboard handler body**

Keep the existing focus guard at the top — it stops seed typing from editing the board. Replace everything after it:

```ts
document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) {
    return;
  }
  if (!state) return;

  const undoChord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z';
  if (undoChord) {
    event.preventDefault();
    if (undo(history, state)) {
      highlighted = new Set();
      draw();
      report();
    }
    syncButtons();
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
      if (Math.abs(delta) === 1 && Math.floor(next / 9) !== Math.floor(selected / 9)) return;
      selected = next;
      draw();
      syncButtons();
    }
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
    const cell = selected;
    act(() => {
      erase(state!, cell);
    });
    return;
  }

  // Shift+3 reports event.key as '#' on many layouts, so fall back to the
  // physical key. event.code is layout-independent: Digit3 stays Digit3
  // whether or not Shift is held.
  const codeDigit = /^Digit([1-9])$/.exec(event.code)?.[1];
  const digitKey = /^[1-9]$/.test(event.key) ? event.key : (codeDigit ?? '');

  if (digitKey !== '') {
    const digit = Number(digitKey);
    const cell = selected;
    if (event.shiftKey)
      act(() => {
        toggleAnnotation(state!, cell, digit);
      });
    else
      act(() => {
        placeDigit(state!, cell, digit);
      });
  }
});
```

- [ ] **Step 6: Wire the two buttons**

Add next to the existing `nextStepEl` listener, and delete the old `notesEl` listener entirely:

```ts
undoEl.addEventListener('click', () => {
  if (!state) return;
  if (undo(history, state)) {
    highlighted = new Set();
    draw();
    report();
  }
  syncButtons();
});

eraseEl.addEventListener('click', () => {
  if (selected === null) return;
  const cell = selected;
  act(() => {
    erase(state!, cell);
  });
});
```

- [ ] **Step 7: Verify**

Run: `npx prettier --write . && npm run verify && npm run build`
Expected: all gates pass. `npm run build` matters here — it is the only check that catches a stale `#notes` lookup after the HTML change.

- [ ] **Step 8: Manual smoke check**

Run `npm run dev` and confirm, reporting what you observed:

1. Typing a digit fills a cell; `Cmd/Ctrl+Z` removes it.
2. `Shift`+3 then `Shift`+5 annotates; typing 5 replaces them with a definitive 5; Delete brings `{3,5}` back; Delete again clears them; Delete a third time does nothing.
3. Undo walks back through all of that, one step per action.
4. The Erase button is disabled with nothing selected and enabled on a non-given cell.
5. Typing into the Seed field still does not touch the board.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: undo, Shift-annotation, and Undo/Erase buttons"
```

---

### Task 4: The hover annotation grid

Renders nine slot buttons inside the selected annotatable cell, revealed on hover.

**Files:**

- Modify: `src/ui/board.ts`, `src/styles.css`, `src/ui/main.ts`

**Interfaces:**

- Consumes: `isAnnotatable` from `./play-state`; `cellName`, `SIZE`, `bit` from `'../engine'`.
- Produces: `BoardOptions` gains `onToggleAnnotation: (cell: number, digit: number) => void`.

- [ ] **Step 1: Extend `BoardOptions` and the cell rendering in `src/ui/board.ts`**

Add `isAnnotatable` and `cellName` to the imports, then:

```ts
export interface BoardOptions {
  selected: number | null;
  highlighted?: Set<number>;
  onSelect: (cell: number) => void;
  onToggleAnnotation: (cell: number, digit: number) => void;
}
```

Inside the cell loop, replace the block that builds the cell element. A normal cell stays a `<button>`; the selected annotatable cell becomes a `<div>` holding nine slot buttons, because a button may not contain buttons.

```ts
const annotating = c === opts.selected && isAnnotatable(state, c);
const cell = document.createElement(annotating ? 'div' : 'button');
if (cell instanceof HTMLButtonElement) cell.type = 'button';
cell.className = 'cell';
cell.dataset.cell = String(c);
if (annotating) cell.classList.add('annotating');
```

Keep the existing `block-left` / `block-top` / `selected` / `highlighted` / `conflict` class logic unchanged. Then replace the content block:

```ts
const given = state.puzzle.givens[c]!;
const entry = state.entries[c]!;

if (given !== 0) {
  cell.classList.add('given');
  cell.textContent = String(given);
} else if (entry !== 0) {
  cell.classList.add('entry');
  cell.textContent = String(entry);
} else if (annotating) {
  for (let d = 1; d <= SIZE; d++) {
    const isSet = (state.marks[c]! & bit(d)) !== 0;
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = isSet ? 'slot set' : 'slot';
    slot.textContent = String(d);
    slot.setAttribute('aria-label', `toggle note ${String(d)} in ${cellName(c)}`);
    slot.setAttribute('aria-pressed', String(isSet));
    slot.addEventListener('click', (event) => {
      event.stopPropagation();
      opts.onToggleAnnotation(c, d);
    });
    cell.append(slot);
  }
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
```

The click listener on the cell itself stays as it is.

- [ ] **Step 2: Add the slot styles to `src/styles.css`**

Append. The rule order matters and is commented, because specificity between the three opacity rules is what makes hover reveal work.

```css
/* The selected, annotatable cell becomes a 3x3 grid of toggle targets. */
.cell.annotating {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 0;
}

.cell.annotating .slot {
  all: unset;
  display: grid;
  place-items: center;
  font-size: 0.55rem;
  color: #666;
  cursor: pointer;
  opacity: 0;
}

/* Set annotations are always visible. */
.cell.annotating .slot.set {
  opacity: 1;
}

/* Hovering the cell reveals the unset positions faintly. */
.cell.annotating:hover .slot:not(.set) {
  opacity: 0.35;
}

/* The slot under the cursor. Ties on specificity with the rule above, so it
   must stay last to win. */
.cell.annotating .slot:hover {
  opacity: 0.85;
  color: var(--entry);
}
```

- [ ] **Step 3: Pass the callback from `src/ui/main.ts`**

In `draw()`, add to the `renderBoard` options:

```ts
    onToggleAnnotation: (cell, digit) => {
      act(() => { toggleAnnotation(state!, cell, digit); });
    },
```

- [ ] **Step 4: Verify**

Run: `npx prettier --write . && npm run verify && npm run build`
Expected: all gates pass.

- [ ] **Step 5: Manual verification**

Run `npm run dev` and confirm, reporting what you observed:

1. Selecting an empty cell and hovering it reveals nine faint digits in a 3×3 layout.
2. Clicking one turns it solid; clicking again removes it.
3. Set annotations stay visible when the mouse leaves the cell.
4. A cell holding a definitive digit shows no ghost grid — the digit stays visible and hovering does nothing.
5. Selecting a given shows no ghost grid.
6. Each slot click is one undo step.
7. Moving the selection with arrow keys moves the ghost grid with it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: hover annotation grid inside the selected cell"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: the cell state machine and `shadow` → Task 1; undo including the deep-copy guard → Task 2; keyboard bindings, the `N` removal, and the Undo/Erase buttons → Task 3; the hover slot grid, its CSS, and the accessible labels → Task 4; the file split → Task 1; the testing strategy → Tasks 1 and 2. The spec's "Erase acts on the selected cell and is disabled when nothing is selected or the selection is a given" is Task 3 Step 3's `syncButtons`. "Undo does not move the selection" holds because `selected` is not part of the snapshot.

**Known gaps, stated rather than hidden:**

- `renderBoard` remains untested by automation, as established. Tasks 3 and 4 each end with a manual checklist whose results the implementer must report — that is the only coverage the DOM gets.
- The `Shift`+digit handling uses `event.code` as a fallback because a shifted digit reports a punctuation `event.key` on many layouts. This is worth watching in Task 3's manual check; if `Shift`+3 does not annotate, that fallback is why.
- The three opacity rules in Task 4 Step 2 depend on source order. If a future edit reorders them, hovering will dim set annotations instead of revealing unset ones. The comment says so in the file.

**Type consistency.** `PlayState` gains `shadow` in Task 1 and every later task uses that name. The transitions are `placeDigit` / `toggleAnnotation` / `erase` throughout — `setEntry` and `toggleMark` appear only in Task 1's migration steps. `commit(history, state, mutate)` and `undo(history, state)` keep the same argument order in Tasks 2, 3 and 4. `onToggleAnnotation` is spelled identically in `BoardOptions` (Task 4 Step 1) and its caller (Step 3).
