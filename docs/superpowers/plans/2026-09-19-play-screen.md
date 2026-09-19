# Play Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the engine harness with the Play screen from the design system, built on one grid component shared with the printed page.

**Architecture:** `renderGrid` becomes the single grid renderer for `play`, `static` and `print`, drawing both line weights as explicit CSS grid tracks on a flat row-major DOM. Play wires it to a number pad and to puzzle generation running in a Web Worker. `play-state.ts` and `history.ts` are untouched — the existing state machine already models what the design system describes.

**Tech Stack:** TypeScript 6, Vite 8, vitest 4 (node environment), plain DOM, zero runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-19-play-screen-design.md`

## Global Constraints

- **Never commit without asking.** The user's `CLAUDE.md` requires presenting work and waiting for review. Every "Commit" step below means: show what changed, ask, then commit once approved. One commit per task, folded — no fixup commits.
- **`npm run verify` must pass before every commit.** It runs typecheck → lint → format:check → test. Never weaken a test, a lint rule or a tsconfig flag to make it pass.
- **The engine is untouched.** No file under `src/engine/` changes in this plan.
- **`src/ui/**` imports from `'../engine'` only**, never an engine submodule. ESLint enforces it.
- **No raw values outside `src/tokens.css`.** Components reference custom properties. Structural integers written by a renderer (grid line numbers, loop bounds) are not design values and are exempt.
- **`noUncheckedIndexedAccess` is on**, so `!` on an indexed typed-array read is the codebase idiom; `no-non-null-assertion` is deliberately off.
- **`exactOptionalPropertyTypes` is on.** Never pass `seed: undefined`; omit the key entirely.
- **`verbatimModuleSyntax` is on.** Type-only imports must use `import type`.
- **`tseslint.configs.strictTypeChecked` is on.** No `any` may escape into typed code; unsafe assignment and unsafe member access are errors.
- **Tests live in `tests/`, mirroring `src/`.** The vitest environment is `node` with no jsdom, so nothing that touches `document` can be unit-tested. Renderers are verified by hand in a browser, as `renderBoard` was.
- **Every test must be able to fail.** Each test below names the mutation that breaks it. If you cannot name one, the test is worthless.
- Prettier formats everything; run `npx prettier --write` on files you create before `verify`.

---

### Task 1: Verify `display: contents` on `role="row"`

The whole grid design rests on nine `display: contents` row elements keeping their `row` role in the accessibility tree. Browsers once dropped such elements from that tree. Verify before building on it.

**Files:**

- Create: scratchpad only. Nothing in this task is committed.

**Interfaces:**

- Consumes: nothing.
- Produces: a yes/no answer that Task 3 depends on. If no, Task 3 drops the row elements and puts `aria-rowindex` and `aria-colindex` on the cells instead.

- [ ] **Step 1: Write a probe page in the scratchpad**

Save as `probe.html` in the scratchpad directory:

```html
<!doctype html>
<html lang="en">
  <body>
    <div role="grid" aria-label="probe" style="display: grid">
      <div role="row" style="display: contents">
        <div role="gridcell">1</div>
      </div>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Dump the accessibility tree**

Node 22 has a global `WebSocket`, so the Chrome DevTools Protocol needs no dependency. Save as `axtree.mjs` in the scratchpad:

```js
const [target] = await (await fetch('http://localhost:9222/json')).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
const send = (id, method) => ws.send(JSON.stringify({ id, method }));
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id === 2) {
    for (const node of msg.result.nodes) {
      console.log(node.role?.value, JSON.stringify(node.name?.value ?? ''));
    }
    ws.close();
  }
});
send(1, 'Accessibility.enable');
send(2, 'Accessibility.getFullAXTree');
```

Run Chrome headless with remote debugging pointed at the probe file, then run the script with `node axtree.mjs`.

- [ ] **Step 3: Read the result**

Expected: a node with role `row` appears between the `grid` and the `gridcell`.

- If `row` is present, record it and continue to Task 2 unchanged.
- If `row` is absent, stop and tell the user. Task 3 then uses the fallback: no row elements, `aria-rowindex` and `aria-colindex` on each cell, and the spec's Risks section gets updated to record what was observed.

- [ ] **Step 4: Delete the scratchpad files**

Nothing from this task is kept. No commit.

---

### Task 2: Grid geometry

Two pure functions, extracted so the renderer's arithmetic is testable without a DOM.

**Files:**

- Create: `src/ui/grid.ts`
- Create: `tests/ui/grid.test.ts`

**Interfaces:**

- Consumes: `boxOf` from `'../engine'`.
- Produces: `trackLine(index: number): number` and `isTintedBox(cell: number): boolean`, both used by `renderGrid` in Task 3.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/grid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isTintedBox, trackLine } from '../../src/ui/grid';

describe('trackLine', () => {
  it('places the first cell after the outer frame track', () => {
    expect(trackLine(0)).toBe(2);
  });

  it('leaves exactly one line track between neighbouring cells', () => {
    expect(trackLine(1) - trackLine(0)).toBe(2);
  });

  it('places the last cell before the closing frame track', () => {
    expect(trackLine(8)).toBe(18);
  });
});

describe('isTintedBox', () => {
  it('tints the four edge-centre boxes', () => {
    expect(isTintedBox(4)).toBe(true); // row 0, col 4 -> box 1, top centre
    expect(isTintedBox(27)).toBe(true); // row 3, col 0 -> box 3, centre left
    expect(isTintedBox(33)).toBe(true); // row 3, col 6 -> box 5, centre right
    expect(isTintedBox(76)).toBe(true); // row 8, col 4 -> box 7, bottom centre
  });

  it('leaves the corners and the centre on paper', () => {
    expect(isTintedBox(0)).toBe(false); // box 0
    expect(isTintedBox(8)).toBe(false); // box 2
    expect(isTintedBox(40)).toBe(false); // box 4, the centre
    expect(isTintedBox(72)).toBe(false); // box 6
    expect(isTintedBox(80)).toBe(false); // box 8
  });
});
```

Mutations these catch: `2 * index + 1` instead of `+ 2` breaks the first and third tests; a parity flip in `isTintedBox` breaks both of its tests.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/ui/grid.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/grid`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/grid.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/ui/grid.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify a test can actually fail**

Temporarily change `2 * index + 2` to `2 * index + 1`, re-run, confirm two tests fail, then change it back.

- [ ] **Step 6: Format, verify, ask, commit**

```bash
npx prettier --write src/ui/grid.ts tests/ui/grid.test.ts
npm run verify
```

Then ask the user before committing:

```bash
git add src/ui/grid.ts tests/ui/grid.test.ts
git commit -m "feat: add grid track geometry"
```

---

### Task 3: The grid component, and the print page on top of it

The component, its CSS, and the print refactor land together: the print page's committed measurements are the proof that the track model is equivalent to the gap model it replaces. A reviewer cannot sensibly accept one without the other.

**Files:**

- Modify: `src/ui/grid.ts` (add `renderGrid`)
- Create: `src/grid.css`
- Modify: `src/print.css` (delete its grid rules, import `grid.css`)
- Modify: `src/ui/print.ts` (delete its private grid, call `renderGrid`)
- Modify: `src/tokens.css` (remove `--print-cell`, now superseded by `--cell`)

**Interfaces:**

- Consumes: `trackLine`, `isTintedBox` from Task 2.
- Produces: `renderGrid(root: HTMLElement, opts: GridOptions): void` and the exported `GridVariant` and `GridOptions` types, used by Task 7.

- [ ] **Step 1: Add the renderer to `src/ui/grid.ts`**

Append to `src/ui/grid.ts`:

```ts
import { CELLS, SIZE, bit, boxOf, cellName, colOf, rowOf } from '../engine';

export type GridVariant = 'play' | 'static' | 'print';

export interface GridOptions {
  variant: GridVariant;
  /** 81 givens, 0 where empty. */
  givens: Uint8Array;
  /** Player digits, play only. */
  entries?: Uint8Array;
  /** Candidate bitmasks, play only. */
  marks?: Uint16Array;
  selected?: number | null;
  conflicts?: ReadonlySet<number>;
  /** Cells drawn in the peer state. `static` only. */
  highlight?: ReadonlySet<number>;
  onSelect?: (cell: number) => void;
  onToggleAnnotation?: (cell: number, digit: number) => void;
  label: string;
}

export function renderGrid(root: HTMLElement, opts: GridOptions): void {
  root.className = 'sdp-grid';
  root.dataset.variant = opts.variant;
  // A printed or illustrative grid is a picture of a puzzle, not a widget.
  root.setAttribute('role', opts.variant === 'play' ? 'grid' : 'img');
  root.setAttribute('aria-label', opts.label);
  root.replaceChildren();

  for (let r = 0; r < SIZE; r++) {
    const row = document.createElement('div');
    row.className = 'sdp-row';
    if (opts.variant === 'play') row.setAttribute('role', 'row');
    for (let c = 0; c < SIZE; c++) {
      row.append(renderCell(r * SIZE + c, opts));
    }
    root.append(row);
  }
}
```

- [ ] **Step 2: Add `renderCell` to `src/ui/grid.ts`**

```ts
function renderCell(cell: number, opts: GridOptions): HTMLElement {
  const given = opts.givens[cell]!;
  const entry = opts.entries?.[cell] ?? 0;
  const annotating =
    opts.variant === 'play' && cell === opts.selected && given === 0 && entry === 0;

  // A <button> may not contain <button> children, so the annotating cell --
  // which holds nine slot buttons -- is a <div> instead.
  const node = document.createElement(opts.variant === 'play' && !annotating ? 'button' : 'div');
  if (node instanceof HTMLButtonElement) node.type = 'button';
  node.className = 'sdp-cell';

  // Rows are display: contents, so every cell places itself explicitly.
  node.style.gridColumn = String(trackLine(colOf(cell)));
  node.style.gridRow = String(trackLine(rowOf(cell)));
  if (isTintedBox(cell)) node.dataset.box = 'tint';

  if (opts.variant !== 'play') {
    fillStatic(node, given, entry, opts, cell);
    return node;
  }

  if (given !== 0) {
    node.dataset.state = 'given';
    node.setAttribute('aria-readonly', 'true');
    node.textContent = String(given);
  } else if (entry !== 0) {
    node.dataset.state = 'entered';
    node.textContent = String(entry);
  } else if (annotating) {
    node.dataset.state = 'notes';
    appendSlots(node, cell, opts);
  } else if ((opts.marks?.[cell] ?? 0) !== 0) {
    node.dataset.state = 'notes';
    node.append(renderMarks(opts.marks![cell]!));
  }

  if (cell === opts.selected) node.setAttribute('aria-selected', 'true');
  if (opts.conflicts?.has(cell)) node.setAttribute('aria-invalid', 'true');
  node.setAttribute('aria-label', describeCell(cell, given, entry, opts));
  node.addEventListener('click', () => {
    opts.onSelect?.(cell);
  });
  return node;
}

function fillStatic(
  node: HTMLElement,
  given: number,
  entry: number,
  opts: GridOptions,
  cell: number,
): void {
  if (given !== 0) {
    node.dataset.state = 'given';
    node.textContent = String(given);
  } else if (entry !== 0) {
    node.dataset.state = 'entered';
    node.textContent = String(entry);
  }
  if (opts.highlight?.has(cell)) node.dataset.peer = '';
}

function appendSlots(node: HTMLElement, cell: number, opts: GridOptions): void {
  for (let d = 1; d <= SIZE; d++) {
    const isSet = ((opts.marks?.[cell] ?? 0) & bit(d)) !== 0;
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = isSet ? 'sdp-slot sdp-slot--set' : 'sdp-slot';
    slot.textContent = String(d);
    slot.dataset.digit = String(d);
    slot.setAttribute('aria-label', `toggle note ${String(d)} in ${cellName(cell)}`);
    slot.setAttribute('aria-pressed', String(isSet));
    slot.addEventListener('click', (event) => {
      event.stopPropagation();
      opts.onToggleAnnotation?.(cell, d);
    });
    node.append(slot);
  }
}

function renderMarks(mask: number): HTMLElement {
  const marks = document.createElement('span');
  marks.className = 'sdp-marks';
  for (let d = 1; d <= SIZE; d++) {
    const slot = document.createElement('span');
    slot.textContent = mask & bit(d) ? String(d) : '';
    marks.append(slot);
  }
  return marks;
}

function describeCell(cell: number, given: number, entry: number, opts: GridOptions): string {
  const where = `Row ${String(rowOf(cell) + 1)}, column ${String(colOf(cell) + 1)}`;
  if (given !== 0) return `${where}, ${String(given)}, given`;
  if (entry !== 0) {
    return opts.conflicts?.has(cell)
      ? `${where}, ${String(entry)}, conflict`
      : `${where}, ${String(entry)}`;
  }
  return `${where}, empty`;
}
```

`CELLS` and `boxOf` are imported by Task 2's code already; drop any import that ends up unused, because `noUnusedLocals` is on.

- [ ] **Step 3: Write `src/grid.css`**

Create `src/grid.css`. Note that the `font` shorthand **resets `font-size-adjust`**, so the longhands are used deliberately — do not "tidy" them into a shorthand.

```css
/* The one grid component: play, static and print. Lines are grid tracks, so
   every cell pitch is identical; see the Play screen design doc. */

.sdp-grid {
  --tracks: var(--line-box) 1fr var(--line-cell) 1fr var(--line-cell) 1fr var(--line-box) 1fr
    var(--line-cell) 1fr var(--line-cell) 1fr var(--line-box) 1fr var(--line-cell) 1fr
    var(--line-cell) 1fr var(--line-box);

  display: grid;
  grid-template-columns: var(--tracks);
  grid-template-rows: var(--tracks);
  aspect-ratio: 1;
  container-type: inline-size;
  background: var(--ink);
  print-color-adjust: exact;
}

.sdp-row {
  display: contents;
}

.sdp-cell {
  /* Declared on the cell, never on the grid: container query units resolve
     against the nearest ANCESTOR container, so on .sdp-grid itself this would
     measure whatever encloses the grid. */
  --cell: calc(100cqi / 9);

  position: relative;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: var(--paper);
  font-family: var(--font-text);
  font-weight: var(--weight-bold);
  font-size: calc(var(--cell) * var(--digit-scale));
  font-size-adjust: cap-height var(--cap-ratio);
  font-variant-numeric: tabular-nums lining-nums;
  line-height: 1;
  color: var(--ink-strong);
}

.sdp-cell[data-box='tint'] {
  background: var(--tint);
}

/* States, in priority order: peer, same digit, hint, conflict, selected. All
   have equal specificity, so source order is what decides. */

.sdp-cell[data-state='entered'] {
  font-weight: var(--weight-regular);
  color: var(--pencil);
}

.sdp-cell[data-peer] {
  background-image: linear-gradient(var(--overlay-peer), var(--overlay-peer));
}

.sdp-cell[data-same] {
  box-shadow: inset 0 calc(var(--line-ring) * -1) 0 var(--ink);
}

.sdp-cell[data-hint] {
  box-shadow: inset 0 0 0 var(--line-ui) var(--ink-deep);
}

.sdp-cell[aria-invalid='true'] {
  color: var(--correction);
}

/* The non-color cue for a conflict. */
.sdp-cell[aria-invalid='true']::after {
  content: '';
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
  width: calc(var(--cell) * 0.18);
  aspect-ratio: 1;
  background: var(--correction);
  clip-path: polygon(100% 0, 100% 100%, 0 0);
}

.sdp-cell[aria-selected='true'] {
  box-shadow: inset 0 0 0 var(--line-ring) var(--ink);
}

/* Notes: digit n always sits in position n. */
.sdp-marks,
.sdp-cell[data-state='notes'] {
  display: grid;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  width: 100%;
  height: 100%;
}

.sdp-marks > span,
.sdp-slot {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--font-text);
  font-weight: var(--weight-medium);
  font-size: calc(var(--cell) * var(--note-scale));
  color: var(--pencil-soft);
}

.sdp-slot--set {
  color: var(--pencil);
}

/* Variants */

.sdp-grid[data-variant='play'] {
  width: min(100%, var(--size-grid-max));
}

.sdp-grid[data-variant='print'] {
  /* Line weights belong to the variant, not to @media print: a print grid
     previewed on a monitor has to measure the same. */
  --line-cell: 0.7pt;
  --line-box: 1.45pt;

  width: var(--print-grid);
}

/* Print takes the true ink; --ink-strong exists for screen contrast only. */
.sdp-grid[data-variant='print'] .sdp-cell {
  color: var(--ink);
}
```

- [ ] **Step 4: Point `print.css` at the component**

In `src/print.css`, add `@import './grid.css';` beside the existing `@import './tokens.css';`, and delete every rule whose selector begins `.sdp-grid[data-variant='print']` in the "The grid, print variant" section — the component now owns them.

- [ ] **Step 5: Delete `--print-cell` from `src/tokens.css`**

`--cell` supersedes it and evaluates to the same 65.4 mm ÷ 9. Two names for one measurement is how a print spec drifts. Update the `--print-cell` row in the design system's Print spec token table to `--cell` in the same change, per the `CLAUDE.md` rule that a component's entry is updated with it.

- [ ] **Step 6: Refactor `src/ui/print.ts`**

Delete the box-and-cell loop in `renderPage` and replace it with a call to the component:

```ts
const grid = document.createElement('div');
renderGrid(grid, {
  variant: 'print',
  givens: puzzle.givens,
  label: `Sudoku ${String(number)}, ${puzzle.difficulty}`,
});
```

Remove the now-unused `BOXES` import. Keep everything else in `print.ts` as it is.

- [ ] **Step 7: Re-measure the printed page**

This is the test for this task. Build, serve, screenshot and measure exactly as the print page was measured on 19 Sep:

```bash
npm run build
npx vite preview --port 4173 --outDir ../dist &
```

Then render `print.html?n=1&difficulty=medium&seed=proof` headless at a 4× device scale factor and measure the PNG.

Expected, from `docs/design/project-log.md`:

| Measurement                    | Expected          |
| ------------------------------ | ----------------- |
| Page                           | 73.95 × 104.97 mm |
| Grid width                     | 65.35 mm          |
| Left and right gap             | 4.30 mm each      |
| Bottom gap (seed to page edge) | 4.23 mm           |
| Top gap                        | 15.41 mm          |

Any movement means the track model is not equivalent to the gap model. Stop and report rather than adjusting the expected numbers.

- [ ] **Step 8: Check the page by eye**

Screenshot the print page and confirm: tinted boxes are the four edge-centre ones, box lines are visibly heavier than cell lines, digits are centred.

- [ ] **Step 9: Format, verify, ask, commit**

```bash
npx prettier --write src/grid.css src/print.css src/tokens.css src/ui/grid.ts src/ui/print.ts
npm run verify
```

Ask, then:

```bash
git add src/grid.css src/print.css src/tokens.css src/ui/grid.ts src/ui/print.ts docs/design/design-system.md
git commit -m "refactor: draw grid lines as tracks in one shared component"
```

---

### Task 4: Generation in a worker

**Files:**

- Create: `src/ui/generate.ts`
- Create: `src/ui/generate.worker.ts`
- Create: `tests/ui/generate.test.ts`

**Interfaces:**

- Consumes: `generatePuzzle`, `GenerationError` from `'../engine'`.
- Produces: `requestPuzzle(request: GenerateRequest): Promise<GenerateReply>`, plus the `GenerateRequest` and `GenerateReply` types, used by Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/generate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseReply } from '../../src/ui/generate';

describe('parseReply', () => {
  it('passes a success reply through', () => {
    const puzzle = { seed: 'abc' };
    expect(parseReply({ ok: true, puzzle })).toEqual({ ok: true, puzzle });
  });

  it('passes a failure reply through', () => {
    expect(parseReply({ ok: false, message: 'no luck' })).toEqual({
      ok: false,
      message: 'no luck',
    });
  });

  it('refuses a failure reply with no message rather than treating it as success', () => {
    const reply = parseReply({ ok: false });
    expect(reply.ok).toBe(false);
    expect(reply.ok === false && reply.message.length > 0).toBe(true);
  });

  it('refuses a success reply with no puzzle', () => {
    expect(parseReply({ ok: true }).ok).toBe(false);
  });

  it('refuses something that is not a reply at all', () => {
    expect(parseReply(null).ok).toBe(false);
    expect(parseReply('boom').ok).toBe(false);
  });
});
```

Mutations these catch: returning `data` unchecked makes the third, fourth and fifth tests fail; dropping the `message` check makes the third fail.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/ui/generate.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/generate`.

- [ ] **Step 3: Write `src/ui/generate.ts`**

```ts
import type { Difficulty, Puzzle } from '../engine';

export interface GenerateRequest {
  difficulty: Difficulty;
  seed?: string;
}

export type GenerateReply = { ok: true; puzzle: Puzzle } | { ok: false; message: string };

const UNREADABLE = 'The puzzle generator sent a reply we could not read. Try again.';
const STOPPED = 'The puzzle generator stopped unexpectedly. Try again.';

/**
 * Validates what came back over the worker boundary. A malformed reply must
 * never be mistaken for a puzzle: the screen would render an empty grid and
 * say nothing about why.
 */
export function parseReply(data: unknown): GenerateReply {
  if (typeof data !== 'object' || data === null || !('ok' in data)) {
    return { ok: false, message: UNREADABLE };
  }
  const reply = data as Partial<Puzzle> & { ok: unknown; puzzle?: unknown; message?: unknown };
  if (reply.ok === true && typeof reply.puzzle === 'object' && reply.puzzle !== null) {
    return { ok: true, puzzle: reply.puzzle as Puzzle };
  }
  if (reply.ok === false && typeof reply.message === 'string' && reply.message !== '') {
    return { ok: false, message: reply.message };
  }
  return { ok: false, message: UNREADABLE };
}

let worker: Worker | null = null;

/**
 * Generates one puzzle off the main thread.
 *
 * A request arriving while one is in flight terminates the running worker.
 * Queueing would put an easy puzzle behind an expert's four-second tail, and
 * nobody wants the abandoned result.
 */
export function requestPuzzle(request: GenerateRequest): Promise<GenerateReply> {
  worker?.terminate();
  const current = new Worker(new URL('./generate.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker = current;

  return new Promise((resolve) => {
    current.addEventListener('message', (event) => {
      resolve(parseReply(event.data));
    });
    current.addEventListener('error', () => {
      resolve({ ok: false, message: STOPPED });
    });
    current.postMessage(request);
  });
}
```

- [ ] **Step 4: Write `src/ui/generate.worker.ts`**

```ts
import { GenerationError, generatePuzzle } from '../engine';
import type { GenerateReply, GenerateRequest } from './generate';

/**
 * `lib: DOM` types the worker global as a Window, so one deliberate cast gives
 * it the shape it actually has. Everything below it stays fully typed.
 */
interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<GenerateRequest>) => void): void;
  postMessage(reply: GenerateReply): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const { difficulty, seed } = event.data;
  try {
    // exactOptionalPropertyTypes forbids an explicit `seed: undefined`, so the
    // key is omitted entirely rather than set to undefined.
    const puzzle = generatePuzzle(seed === undefined ? { difficulty } : { difficulty, seed });
    scope.postMessage({ ok: true, puzzle });
  } catch (err) {
    scope.postMessage({
      ok: false,
      message:
        err instanceof GenerationError
          ? `No ${difficulty} puzzle came out in time. Try again, or pick another difficulty.`
          : 'The puzzle generator failed. Try again.',
    });
  }
});
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/ui/generate.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Verify a test can fail**

Temporarily make `parseReply` return `data as GenerateReply` unconditionally, re-run, confirm three tests fail, then restore it.

- [ ] **Step 7: Format, verify, ask, commit**

```bash
npx prettier --write src/ui/generate.ts src/ui/generate.worker.ts tests/ui/generate.test.ts
npm run verify
git add src/ui/generate.ts src/ui/generate.worker.ts tests/ui/generate.test.ts
git commit -m "feat: generate puzzles in a worker"
```

The worker is exercised for real in Task 7; `verify` only proves it typechecks and that replies are validated.

---

### Task 5: The number pad

**Files:**

- Create: `src/ui/number-pad.ts`
- Create: `tests/ui/number-pad.test.ts`
- Create: `src/number-pad.css`

**Interfaces:**

- Consumes: `CELLS`, `SIZE` from `'../engine'`.
- Produces: `remaining(givens, entries, digit): number` and `renderPad(root, opts): void` with `PadOptions`, used by Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/number-pad.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { remaining } from '../../src/ui/number-pad';
import { CELLS } from '../../src/engine';

function arrays(): { givens: Uint8Array; entries: Uint8Array } {
  return { givens: new Uint8Array(CELLS), entries: new Uint8Array(CELLS) };
}

describe('remaining', () => {
  it('starts at nine for a digit nobody has placed', () => {
    const { givens, entries } = arrays();
    expect(remaining(givens, entries, 5)).toBe(9);
  });

  it('counts givens, not just the player entries', () => {
    const { givens, entries } = arrays();
    givens[0] = 5;
    givens[10] = 5;
    expect(remaining(givens, entries, 5)).toBe(7);
  });

  it('counts givens and entries together', () => {
    const { givens, entries } = arrays();
    givens[0] = 5;
    entries[20] = 5;
    expect(remaining(givens, entries, 5)).toBe(7);
  });

  it('reaches zero when all nine are placed', () => {
    const { givens, entries } = arrays();
    for (let i = 0; i < 9; i++) entries[i * 9] = 5;
    expect(remaining(givens, entries, 5)).toBe(0);
  });

  it('ignores other digits', () => {
    const { givens, entries } = arrays();
    givens[0] = 4;
    entries[1] = 6;
    expect(remaining(givens, entries, 5)).toBe(9);
  });
});
```

Mutations these catch: counting entries only breaks the second and third tests; an off-by-one breaks the fourth; dropping the digit comparison breaks the fifth.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/ui/number-pad.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/number-pad`.

- [ ] **Step 3: Write `src/ui/number-pad.ts`**

```ts
import { CELLS, SIZE } from '../engine';

export interface PadOptions {
  givens: Uint8Array;
  entries: Uint8Array;
  notes: boolean;
  canUndo: boolean;
  onDigit: (digit: number) => void;
  onErase: () => void;
  onToggleNotes: () => void;
  onUndo: () => void;
}

/**
 * How many of `digit` are still to place. Givens count: a digit the puzzle
 * handed you is as placed as one you typed.
 */
export function remaining(givens: Uint8Array, entries: Uint8Array, digit: number): number {
  let placed = 0;
  for (let c = 0; c < CELLS; c++) {
    if (givens[c] === digit || entries[c] === digit) placed++;
  }
  return SIZE - placed;
}

export function renderPad(root: HTMLElement, opts: PadOptions): void {
  root.className = 'sdp-pad';
  root.replaceChildren();

  for (let d = 1; d <= SIZE; d++) {
    const left = remaining(opts.givens, opts.entries, d);
    const key = button('sdp-key', String(d), () => {
      opts.onDigit(d);
    });
    key.disabled = left === 0;
    if (left === 0) key.dataset.state = 'exhausted';
    const count = document.createElement('span');
    count.className = 'sdp-key__count';
    count.textContent = String(left);
    key.append(count);
    key.setAttribute('aria-label', `${String(d)}, ${String(left)} left`);
    root.append(key);
  }

  root.append(button('sdp-key sdp-key--utility', 'Erase', opts.onErase));

  const notes = button('sdp-key sdp-key--utility', 'Notes', opts.onToggleNotes);
  notes.setAttribute('aria-pressed', String(opts.notes));
  root.append(notes);

  const undo = button('sdp-key sdp-key--utility', 'Undo', opts.onUndo);
  undo.disabled = !opts.canUndo;
  root.append(undo);
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  node.addEventListener('click', onClick);
  return node;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/ui/number-pad.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify a test can fail**

Temporarily drop `givens[c] === digit ||` from the condition, re-run, confirm two tests fail, then restore it.

- [ ] **Step 6: Write `src/number-pad.css`**

```css
/* Keys 1-9 plus erase, notes and undo. 3x3 under the grid on phones, a row
   beside it above --bp-wide. */

.sdp-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.sdp-key {
  position: relative;
  min-width: var(--size-key);
  min-height: var(--size-key);
  border: var(--line-ui) solid var(--ink);
  border-radius: var(--radius-sm);
  background: var(--paper);
  font-family: var(--font-text);
  font-weight: var(--weight-semibold);
  font-size: var(--text-lg);
  color: var(--ink-deep);
  cursor: pointer;
}

.sdp-key[data-state='exhausted'],
.sdp-key:disabled {
  opacity: var(--opacity-muted);
  cursor: default;
}

.sdp-key__count {
  position: absolute;
  inset-block-start: var(--space-1);
  inset-inline-end: var(--space-1);
  font-size: var(--text-xs);
  font-weight: var(--weight-regular);
}

.sdp-key--utility {
  font-size: var(--text-sm);
}

.sdp-key[aria-pressed='true'] {
  background: var(--ink);
  color: var(--tint);
}

@media (width >= 900px) {
  /* --bp-wide; @media cannot read a custom property */
  .sdp-pad {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

- [ ] **Step 7: Format, verify, ask, commit**

```bash
npx prettier --write src/ui/number-pad.ts tests/ui/number-pad.test.ts src/number-pad.css
npm run verify
git add src/ui/number-pad.ts tests/ui/number-pad.test.ts src/number-pad.css
git commit -m "feat: add the number pad"
```

---

### Task 6: Share the puzzle number, difficulty tag and seed label

The print page styles these three components itself. Play needs the same components at screen sizes. Extract them once, before a second copy exists.

**Files:**

- Create: `src/components.css`
- Modify: `src/print.css` (delete its type rules, import `components.css`)
- Modify: `docs/design/design-system.md` (record the size variants)

**Interfaces:**

- Consumes: nothing.
- Produces: the classes `sdp-no`, `sdp-numberline`, `sdp-numeral`, `sdp-difficulty` and `sdp-seed`, sized by `data-size="md"` (screen) or `data-size="print"`, used by Task 7.

- [ ] **Step 1: Create `src/components.css`**

Move the `.sdp-no`, `.sdp-numberline`, `.sdp-numeral`, `.sdp-difficulty` and `.sdp-seed` rules out of `print.css` and into `src/components.css`, scoping the print measurements under `[data-size='print']` and adding the screen sizes:

```css
/* Puzzle number, difficulty tag and seed label. One set of components, two
   sizes: `md` on screen, `print` on paper. */

.sdp-no,
.sdp-numeral,
.sdp-difficulty,
.sdp-seed {
  line-height: 1;
  color: var(--ink);
}

.sdp-no,
.sdp-difficulty {
  font-family: var(--font-label);
  font-weight: var(--weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sdp-numberline {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.sdp-numeral {
  font-family: var(--font-numeral);
  font-weight: var(--weight-regular);
  font-variant-numeric: tabular-nums lining-nums;
}

.sdp-seed {
  font-family: var(--font-code);
  text-align: right;
}

/* Screen. Sizes come from the type scale, not from cap heights. */

[data-size='md'] .sdp-no,
[data-size='md'] .sdp-difficulty {
  font-size: var(--text-sm);
}

[data-size='md'] .sdp-numeral {
  font-size: var(--display-md);
}

[data-size='md'] .sdp-difficulty,
[data-size='md'] .sdp-seed {
  color: var(--ink-deep);
}

[data-size='md'] .sdp-seed {
  font-size: var(--text-xs);
}

/* Print. Sized by cap height, which is what a ruler measures. */

[data-size='print'] .sdp-no,
[data-size='print'] .sdp-numeral,
[data-size='print'] .sdp-difficulty,
[data-size='print'] .sdp-seed {
  text-box: trim-both cap alphabetic;
}

[data-size='print'] .sdp-no,
[data-size='print'] .sdp-difficulty {
  font-size: calc(var(--print-cap-label) / var(--cap-ratio));
  font-size-adjust: cap-height var(--cap-ratio);
}

[data-size='print'] .sdp-no {
  margin-bottom: calc(var(--print-gap) / 2);
}

[data-size='print'] .sdp-numeral {
  font-size: calc(var(--print-cap-number) / var(--cap-ratio));
  font-size-adjust: cap-height var(--cap-ratio);
}

[data-size='print'] .sdp-seed {
  /* Trimmed to the descender, not the baseline: the safe line is a clearance
     rule and the seed alphabet still contains p, q and y. */
  text-box: trim-both cap text;
  margin-top: var(--print-gap);
  font-size: var(--print-seed);
}
```

- [ ] **Step 2: Put `data-size="print"` on the page**

In `src/ui/print.ts`, add `page.dataset.size = 'print';` where `.sdp-page` is created, so the print sizes apply.

- [ ] **Step 3: Trim `print.css`**

Add `@import './components.css';` and delete the `.sdp-no`, `.sdp-numeral`, `.sdp-difficulty`, `.sdp-seed` and `.sdp-numberline` rules it now duplicates. Keep the page, sheet and layout rules.

- [ ] **Step 4: Re-measure the printed page**

The same measurements as Task 3, Step 7. The type moved between files; if any cap height or gap changed, the extraction was not faithful.

Expected: cap heights 10.60 mm and 2.00 mm, bottom gap 4.23 mm, top gap 15.41 mm.

- [ ] **Step 5: Format, verify, ask, commit**

```bash
npx prettier --write src/components.css src/print.css src/ui/print.ts
npm run verify
git add src/components.css src/print.css src/ui/print.ts docs/design/design-system.md
git commit -m "refactor: share the number, difficulty and seed components"
```

---

### Task 7: The Play screen

Everything lands here: the markup, the controller, the layout, and the removal of the harness.

**Files:**

- Modify: `src/index.html` (rewritten)
- Create: `src/play.css`
- Create: `src/ui/play.ts`
- Delete: `src/ui/main.ts`, `src/ui/board.ts`, `src/styles.css`

**Interfaces:**

- Consumes: `renderGrid` (Task 3), `requestPuzzle` (Task 4), `renderPad` (Task 5), the shared type components (Task 6), and the untouched `play-state.ts` and `history.ts`.
- Produces: the finished screen. Nothing imports it.

- [ ] **Step 1: Rewrite `src/index.html`**

```html
<!doctype html>
<html lang="en" data-theme="clementine">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sudoku de poche</title>
    <link rel="stylesheet" href="./play.css" />
  </head>
  <body>
    <main class="sdp-play" data-size="md">
      <header class="sdp-head">
        <div class="sdp-no">No.</div>
        <div class="sdp-numberline">
          <span class="sdp-numeral">001</span>
          <span class="sdp-difficulty" id="difficulty"></span>
        </div>
      </header>

      <div id="grid"></div>
      <p class="sdp-seed" id="seed"></p>
      <p class="sdp-message" id="message" role="status"></p>
      <div id="pad"></div>

      <button type="button" class="sdp-button sdp-button--quiet" id="menu">New game</button>

      <dialog id="new-game" class="sdp-dialog">
        <form method="dialog">
          <fieldset class="sdp-segmented">
            <legend>Difficulty</legend>
            <label><input type="radio" name="difficulty" value="easy" />Easy</label>
            <label> <input type="radio" name="difficulty" value="medium" checked />Medium </label>
            <label><input type="radio" name="difficulty" value="hard" />Hard</label>
            <label><input type="radio" name="difficulty" value="expert" />Expert</label>
          </fieldset>
          <button type="submit" class="sdp-button sdp-button--primary" value="start">Start</button>
          <button type="submit" class="sdp-button sdp-button--quiet" value="cancel">Cancel</button>
        </form>
      </dialog>
    </main>
    <script type="module" src="./ui/play.ts"></script>
  </body>
</html>
```

The puzzle number is the literal `001`. Its meaning is an open question in the spec; do not invent one.

- [ ] **Step 2: Write `src/ui/play.ts`**

Port the event handling from `main.ts` — arrows, digits, `Shift`+digit, `Backspace`/`Delete`/`0`, `Cmd+Z`, and the focus save/restore around slot buttons — unchanged in behaviour. The new parts are the pad, the worker and the empty state:

```ts
import type { Difficulty } from '../engine';
import { renderGrid } from './grid';
import { renderPad } from './number-pad';
import { requestPuzzle } from './generate';
import {
  conflicts,
  createPlayState,
  erase,
  isComplete,
  isGiven,
  placeDigit,
  toggleAnnotation,
  type PlayState,
} from './play-state';
import { canUndo, clear, commit, createHistory, undo } from './history';

const gridEl = document.querySelector<HTMLDivElement>('#grid')!;
const padEl = document.querySelector<HTMLDivElement>('#pad')!;
const seedEl = document.querySelector<HTMLParagraphElement>('#seed')!;
const messageEl = document.querySelector<HTMLParagraphElement>('#message')!;
const difficultyEl = document.querySelector<HTMLSpanElement>('#difficulty')!;
const menuEl = document.querySelector<HTMLButtonElement>('#menu')!;
const dialogEl = document.querySelector<HTMLDialogElement>('#new-game')!;

let state: PlayState | null = null;
let selected: number | null = null;
let notes = false;
const history = createHistory();

const EMPTY = new Uint8Array(81);

function draw(): void {
  if (!state) return;
  renderGrid(gridEl, {
    variant: 'play',
    givens: state.puzzle.givens,
    entries: state.entries,
    marks: state.marks,
    selected,
    conflicts: conflicts(state),
    label: `Sudoku 001, ${state.puzzle.difficulty}`,
    onSelect: (cell) => {
      selected = cell;
      draw();
    },
    onToggleAnnotation: (cell, digit) => {
      act(() => {
        toggleAnnotation(state!, cell, digit);
      });
    },
  });
  renderPad(padEl, {
    givens: state.puzzle.givens,
    entries: state.entries,
    notes,
    canUndo: canUndo(history),
    onDigit: (digit) => {
      enter(digit);
    },
    onErase: () => {
      if (selected !== null)
        act(() => {
          erase(state!, selected!);
        });
    },
    onToggleNotes: () => {
      notes = !notes;
      draw();
    },
    onUndo: () => {
      performUndo();
    },
  });
}

/** The one place the notes toggle decides which state transition runs. */
function enter(digit: number): void {
  if (!state || selected === null || isGiven(state, selected)) return;
  const cell = selected;
  act(() => {
    if (notes) toggleAnnotation(state!, cell, digit);
    else placeDigit(state!, cell, digit);
  });
}

async function newGame(difficulty: Difficulty, seed?: string): Promise<void> {
  state = null;
  selected = null;
  clear(history);
  difficultyEl.textContent = difficulty;
  seedEl.textContent = '';
  messageEl.textContent = 'Finding a puzzle that needs exactly these techniques…';
  renderGrid(gridEl, { variant: 'static', givens: EMPTY, label: 'No puzzle yet' });

  const reply = await requestPuzzle(seed === undefined ? { difficulty } : { difficulty, seed });
  if (!reply.ok) {
    messageEl.textContent = reply.message;
    return;
  }
  messageEl.textContent = '';
  state = createPlayState(reply.puzzle);
  seedEl.textContent = reply.puzzle.seed;
  draw();
}
```

`act` and `performUndo` come across from `main.ts` unchanged apart from calling `draw()` and dropping the explainer lines. On `isComplete(state)`, set `messageEl.textContent = 'Solved.'` and add a `data-solved` attribute to `.sdp-play` for the sticker.

Startup reads the URL once:

```ts
const params = new URLSearchParams(location.search);
const seed = params.get('seed');
void newGame('medium', seed ?? undefined);
```

- [ ] **Step 3: Write `src/play.css`**

Import the token, component, grid and pad stylesheets, then lay the screen out as the printed page rearranged: header, grid, seed right-aligned, pad below the grid and beside it above `900px` (`--bp-wide`). Give `.sdp-message` the `--text-md` body style. The SOLVED sticker is a `::after` on `.sdp-play[data-solved]` using `--tilt-sm`, `--ease-stamp` and `--dur-slow`, and must be wrapped in a `@media (prefers-reduced-motion: no-preference)` guard so it becomes a plain fade otherwise.

- [ ] **Step 4: Delete the harness**

```bash
git rm src/ui/main.ts src/ui/board.ts src/styles.css
```

`npm run typecheck` will name anything still importing them.

- [ ] **Step 5: Check it by hand in a browser**

`npm run dev`, then walk the list:

- Select a cell, type digits, place with the pad, toggle notes on and place notes both ways.
- Hover-annotate inside a selected cell; confirm it agrees with the pad's notes mode.
- Arrows move without wrapping rows. `Cmd+Z` undoes. Erase steps filled → notes → empty.
- A conflict shows the correction colour and the corner triangle.
- Tab reaches the pad; focus rings are visible on every control.
- New game with Expert: the screen shows the waiting sentence and stays responsive, and the grid arrives without the tab ever freezing.
- Narrow the window below 900px: the pad moves under the grid and the grid stays square.
- Solve a puzzle: the sticker lands.

- [ ] **Step 6: Format, verify, ask, commit**

```bash
npx prettier --write src/index.html src/play.css src/ui/play.ts
npm run verify
git add -A
git commit -m "feat: build the Play screen from the design system"
```

- [ ] **Step 7: Update the design system and the project log**

Per `CLAUDE.md`, a component's entry is updated in the same change as the component. Mark build-order step 3 done in `docs/design/project-log.md`, expand the Number pad and Button rows in `docs/design/design-system.md` to the grid's level of detail, and record that the theme model is now proven on a real screen — the audit's largest open item. Ask, then commit separately as `docs:`.

---

## Self-review

**Spec coverage.** Grid component → Tasks 2, 3. `--cell` → Task 3. Variants → Task 3. Cell states → Task 3. Accessibility → Tasks 1, 3, 7. Number pad → Task 5. Input model → Tasks 3, 5, 7. Layout → Tasks 6, 7. Generation → Tasks 4, 7. Files table → all tasks. Testing table → Tasks 2, 4, 5, and the print re-measurement in Tasks 3 and 6. Risks → Task 1, and the re-measurements.

**Open spec items deliberately not built:** the hint (`explainer.ts` stays unwired), the timer, the theme picker, seed entry UI, and persistence. The `hint` cell state is styled in Task 3 but nothing sets it, exactly as the spec says.

**Type consistency.** `GridOptions.givens`/`entries`/`marks` match `PlayState`'s field names. `remaining(givens, entries, digit)` is called with the same argument order in Task 5's renderer and Task 7. `GenerateReply` is the same discriminated union in `generate.ts`, the worker, and Task 7's `reply.ok` check. `trackLine` and `isTintedBox` keep their Task 2 names in Task 3.
