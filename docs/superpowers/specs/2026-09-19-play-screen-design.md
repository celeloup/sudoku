# Play Screen — Design

**Date:** 2026-09-19
**Status:** Approved, ready for implementation planning

## Purpose

Rebuild the Play screen from the design system, and replace the engine harness with it.
Today `src/index.html` is a developer tool: a difficulty select, a seed box, a Generate
button, a status line reporting score and clue count, and a next-step explainer. The
design system describes something else entirely — the printed page rearranged on a
screen, with nothing on it but the puzzle.

This is also the first screen built from the tokens. The 18 Sep audit lists "proof" as
the largest open item: no token had been used in a real screen, and the theme model had
never run end to end. Play is that proof.

## Scope

In scope:

- One grid component with three variants, replacing `board.ts` and the print grid's
  private renderer.
- The number pad, as the default way to enter a digit on every device.
- The Play layout: puzzle number, difficulty tag, grid, seed, one quiet button.
- Generation moved into a Web Worker, with the empty and error states around it.
- Deleting the harness: `board.ts`, `styles.css`, and the generation controls.

Out of scope:

- Any change to `src/engine/`. This is entirely UI-side, as the annotation work was.
- The hint. `explainer.ts` stays on disk and tested, but nothing on Play calls it.
- Timer, theme picker, seed entry UI, persistence across reloads.
- The Learn area and the Print screen — meaning the composer UI with its swatch picker
  and stepper. The printed page itself is already built and is refactored here only so
  it calls the shared grid. The `static` variant is built because Play's own empty state
  needs it, not because Learn is being started.

## Decisions taken before this spec

| #   | Question                                                   | Outcome                                                                                                                                 |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Does Play replace the harness or sit beside it?            | Replaces it. One screen to maintain, and the design system gets proven on the real thing.                                               |
| 2   | Pad, or the modeless annotation the 2026-09-09 spec chose? | Both. The pad is the default and is visible on every device; hover annotation and the keyboard remain as extras where a pointer exists. |
| 3   | What does the puzzle number show?                          | Static `001` for now. Deferred until it can be seen on screen.                                                                          |
| 4   | Where does the hint live?                                  | Nowhere, for now.                                                                                                                       |
| 5   | What is behind the quiet button?                           | New game with a difficulty choice. Nothing else.                                                                                        |
| 6   | How is the grid drawn?                                     | One renderer, lines as grid tracks. See below.                                                                                          |
| 7   | Synchronous generation or a worker?                        | A worker.                                                                                                                               |

Decision 2 supersedes the "Rejected alternatives" entry in
`2026-09-09-annotation-undo-ux-design.md`, which rejected a number pad but recorded the
condition for revisiting it: "if this is ever used on a touch screen, where the pad
becomes necessary rather than merely convenient." The design system's pocket test makes
the phone a target, so the condition is met. Modeless annotation is not withdrawn; the
pad is added alongside it.

## The grid component

`src/ui/grid.ts` exports one function. It replaces `renderBoard` and the private grid
inside `ui/print.ts`, so the screen and the notebook cannot drift apart — the reason the
design system asks for one component in the first place.

```ts
export type GridVariant = 'play' | 'static' | 'print';

export interface GridOptions {
  variant: GridVariant;
  /** 81 givens, 0 for empty. */
  givens: Uint8Array;
  /** Player digits, play only. */
  entries?: Uint8Array;
  /** Candidate bitmasks, play only. */
  marks?: Uint16Array;
  selected?: number | null;
  conflicts?: ReadonlySet<number>;
  /** Cells drawn in the peer state, `static` only. */
  highlight?: ReadonlySet<number>;
  onSelect?: (cell: number) => void;
  onToggleAnnotation?: (cell: number, digit: number) => void;
  label: string;
}

export function renderGrid(root: HTMLElement, opts: GridOptions): void;
```

It takes typed arrays rather than a `PlayState`. Print and Learn have no play state, and
a component that demanded one would force them to fake it.

### Lines are grid tracks

The print grid committed on 19 Sep draws its lines as gaps between nested 3×3 boxes.
That structure is box-major, and an ARIA `grid` needs `row` children, so it cannot carry
the roles the design system's Accessibility section requires for Play.

Both weights become explicit tracks instead, on a flat row-major DOM. With `L` for
`--line-cell` and `B` for `--line-box`, the template is nineteen tracks, used for both
columns and rows:

```
B 1fr L 1fr L 1fr B 1fr L 1fr L 1fr B 1fr L 1fr L 1fr B
```

Nine `1fr` cells, six cell lines, four box lines — the two outer frame lines are tracks
like any other, so the grid needs no padding and no border. The container's `--ink`
background shows through every line track.

Cells are placed explicitly, `grid-column: 2 * col + 2` and `grid-row: 2 * row + 2`,
written as computed integers by the renderer. Those integers are structural indices, not
design values; the no-raw-values rule is about the second kind.

**Why not borders.** A `--line-box` border takes its width from the column it sits on,
leaving the three box columns unequal by about 0.26 mm at print weights. A track takes
its width from the whole. This is decision 12 in the project log, unchanged — only the
mechanism that implements it changes, from gaps to tracks.

### `--cell`

`--cell` has been referenced by the design system since the first draft and never
defined; it was the first gap found when the token file was written. It is defined here:

```css
.sdp-grid {
  container-type: inline-size;
}
.sdp-cell {
  --cell: calc(100cqi / 9);
}
```

**It is declared on the cell, not on the grid, and that placement is load-bearing.**
Container query units resolve against the nearest _ancestor_ container, so `100cqi`
written on `.sdp-grid` — the container itself — would measure whatever container
encloses the grid, not the grid. Declared on the cell it unambiguously measures the
grid.

`100cqi` is the grid's own inline size, so `--cell` is the nominal cell pitch, which is
what the design system means when it says a digit is `--digit-scale` times "the cell
size". For the print variant that is 65.4 mm ÷ 9 = 7.2667 mm, identical to the
`--print-cell` it replaces, so digit and note sizes come out unchanged by the refactor.

The true ink width of a cell is smaller — `(65.4 − 6L − 4B) / 9`, about 6.88 mm in print
— because the lines take their width from the total. That is intended: a 4.2 mm digit
sits comfortably inside it, and the 7.3 mm the print spec quotes has always been the
pitch.

### Variants

| Variant  | Root role | Differences                                                               |
| -------- | --------- | ------------------------------------------------------------------------- |
| `play`   | `grid`    | Interactive, all states, keyboard and touch input                         |
| `static` | `img`     | Not focusable. Accepts `highlight`. Used by Play's own empty state        |
| `print`  | `img`     | Given digits in `--ink`, not `--ink-strong`. `L` and `B` in pt. No states |

The pt line weights stay a property of the variant rather than `@media print`, so a
print grid previewed on a monitor measures the same as one on paper.

### DOM

```html
<div class="sdp-grid" role="grid" data-variant="play" aria-label="Sudoku 001, medium">
  <div role="row">
    <div
      role="gridcell"
      class="sdp-cell"
      data-box="tint"
      data-state="given"
      aria-readonly="true"
      aria-label="Row 1, column 1, 2, given"
    >
      2
    </div>
    <!-- 8 more cells -->
  </div>
  <!-- 8 more rows -->
</div>
```

The row elements are `display: contents`, so the cells place directly into the grid
while the accessibility tree keeps its rows. In the `static` and `print` variants the
rows and cells carry no roles at all; the root's `role="img"` and label describe the
whole picture, which is what a printed grid is.

`data-box="tint"` is set when `boxOf(cell)` is odd, which tints the four edge-centre
boxes and leaves the corners and centre on paper, as the artwork does.

### Cell states

As specified in the design system, unchanged. Priority when they overlap: selected,
conflict, hint, same digit, peer. States are `data-state` or the matching ARIA
attribute, never a class.

The `hint` state is implemented in CSS because it is part of the component's contract,
but nothing on Play sets it in this version.

### Accessibility

One tab stop for the whole grid; the selected cell holds focus. Arrows move, `1`–`9`
enter, `Backspace`/`Delete`/`0` clear, `Escape` deselects. Given cells carry
`aria-readonly`, conflicts carry `aria-invalid`, and completion is announced through a
polite live region.

`N` toggling notes mode is listed in the design system. It is implemented here as a
toggle of the pad's notes key, so the keyboard and the pad drive one piece of state.

## The number pad

`src/ui/number-pad.ts`. Keys 1–9, erase, notes, undo, as the component table specifies.
Real `<button>` elements, so it is reachable by keyboard without any extra work.

- Each key shows the count still to place in `--text-xs`, and drops to
  `--opacity-muted` when all nine of that digit are placed. The count is derived from
  givens plus entries, not from entries alone.
- Keys are `--radius-sm`, at least `--size-key`.
- `3x3` below the grid under `--bp-wide`; `row` beside the grid above it.
- The notes key is a toggle and reports `aria-pressed`.

Pressing a digit key applies to the selected cell. With no selection, it does nothing —
it does not select a cell for you.

## Input

The pad is the default path on both devices. On a pointer device it is joined by, not
replaced by, what the 2026-09-09 spec built:

| Route      | Places a digit | Toggles a note                                      |
| ---------- | -------------- | --------------------------------------------------- |
| Number pad | Tap a key      | Notes on, then tap a key                            |
| Keyboard   | `1`–`9`        | `Shift` + digit, or `N` then digit                  |
| Pointer    | —              | Hover a position inside the selected cell and click |

Every route calls `placeDigit` or `toggleAnnotation`. There is one state machine
underneath, so the notes toggle is a second door into the same room rather than a second
model. `history.ts` wraps all of them, as it does today.

## Layout

The printed page rearranged, per the Play pattern:

```
NO.
001                    MEDIUM     <- difficulty right-aligned to the grid edge
┌───────────────────┐
│       grid        │
└───────────────────┘
              7fk3m2  <- seed, right-aligned, with a copy action
[ pad ]               <- below the grid on phones, beside it above --bp-wide
```

The quiet button opens new game: the four tiers as a segmented control, then generate.
It is the screen's one primary button. Solving lands the SOLVED sticker over the grid
and makes it read-only — the single large animation on the screen, with every other
motion kept small.

## Generation

`src/ui/generate.worker.ts`, a long-lived module worker.

```
main  -> worker   { difficulty, seed? }
worker -> main    { ok: true, puzzle } | { ok: false, message, bestTier? }
```

`Puzzle` holds typed arrays, which survive structured clone unchanged.

**A new request while one is running terminates the worker and starts a fresh one.**
Queueing would put an easy puzzle behind an expert's four-second tail, and the result of
the abandoned request is of no interest to anyone. The worker is recreated lazily on the
next request.

While a request is in flight, the screen shows the empty state the patterns section
specifies: a `static` grid with no digits and one sentence. A `GenerationError` replaces
that sentence with what happened and what to do next, beside the grid that failed — not
an apology, and not a vague one.

Seed reproducibility returns as `?seed=` on the URL, read once at startup. No UI.

## Files

| File                                        | Change                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| `src/ui/grid.ts`                            | New. The one grid component                                   |
| `src/ui/number-pad.ts`                      | New                                                           |
| `src/ui/generate.worker.ts`                 | New                                                           |
| `src/ui/play.ts`                            | `main.ts` renamed and rewritten around the pad and the worker |
| `src/ui/print.ts`                           | Calls `renderGrid`; its private grid is deleted               |
| `src/grid.css`                              | New. The component, all three variants                        |
| `src/play.css`                              | New. The screen                                               |
| `src/print.css`                             | Keeps the page and sheet; its grid rules move to `grid.css`   |
| `src/index.html`                            | Rewritten. The generation controls go                         |
| `src/ui/board.ts`                           | Deleted                                                       |
| `src/styles.css`                            | Deleted                                                       |
| `src/ui/play-state.ts`, `src/ui/history.ts` | Unchanged                                                     |
| `src/ui/explainer.ts`                       | Unchanged, and no longer imported by a screen                 |

## Testing

`renderBoard` was deliberately never unit-tested, and `renderGrid` inherits that: it is
verified by hand in a browser. The project rule is that a test must be able to fail, so
the logic worth testing is extracted from the renderer rather than buried in it.

| Test                      | Mutation that must break it                                 |
| ------------------------- | ----------------------------------------------------------- |
| Cell → track placement    | `2 * col + 2` becomes `2 * col + 1`, or column and row swap |
| Box tinting               | Parity flips, tinting the corners and centre instead        |
| Remaining count per digit | Counts entries only, ignoring givens                        |
| Exhausted at nine placed  | Off-by-one at eight or ten                                  |
| Worker message shapes     | An error reply loses `message` and renders as a success     |

The print grid is re-measured after the refactor against the numbers in
`project-log.md`: page 73.95 × 104.97 mm, grid 65.35 mm centred with 4.30 mm each side,
cap heights 10.60 and 2.00 mm, seed clearing the safe line by 4.23 mm. Any movement
means the track model is not equivalent to the gap model, and the refactor is wrong.

`play-state.ts` and `history.ts` keep their existing tests untouched.

## Risks

- **`display: contents` on `role="row"`.** Browsers once dropped such elements from the
  accessibility tree. This is fixed, but it is load-bearing here, so it is verified in a
  real accessibility tree before anything is built on it. Fallback: drop the row
  elements and put `aria-rowindex` and `aria-colindex` on the cells.
- **Container query units.** `container-type` introduces containment, and `cqi` has the
  ancestor-resolution trap described above. The print measurements are the check for
  both: if `--cell` were measuring the wrong box, the given digits would come out the
  wrong height and the comparison would catch it.
- **The expert tail.** The worker stops the freeze but not the wait. The empty state has
  to be honest about a four-second generation rather than look broken.

## Rejected alternatives

- **Keeping the nested-box grid and dropping ARIA rows on Play.** Cheapest, and it
  contradicts the design system's own Accessibility section. Debt of a kind that does
  not get paid.
- **Two renderers sharing CSS.** Least work today; it is exactly the drift the shared
  component exists to prevent. The checkerboard rule alone would live in two places.
- **Synchronous generation with a yield.** What the harness does today. It paints a
  message and then freezes the tab for up to four seconds, on a screen whose only other
  control is the one that triggers it.
- **Queueing worker requests.** Rejected with the restart policy above.
- **A pad without a notes toggle, using long-press for notes.** Keeps modelessness on
  touch at the cost of a gesture nobody can see.

## Open questions

- What the puzzle number means. Static `001` until it can be judged on screen.
- Whether the hint returns, and where its sentence would go.
- Timer, theme picker, seed entry UI, persistence across reloads.
- Whether `static` grows the step caption the design system mentions, once Learn exists.
