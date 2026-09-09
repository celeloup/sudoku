# Annotation, Undo, and Erase UX — Design

**Date:** 2026-09-09
**Status:** Approved, ready for implementation planning

## Purpose

Bring the browser harness closer to the interaction quality of the New York Times
sudoku app, so the puzzles this project generates are pleasant to actually solve.
Three changes: annotate by hovering positions inside the selected cell, undo any board
change, and make erase step a cell back through its own history rather than wiping it.

## Scope

In scope:

- A three-state model per cell, with annotations remembered underneath a placed digit.
- Modeless annotation: hover a position inside the selected cell and click, or
  `Shift`+digit from the keyboard.
- Undo of every board change, unlimited within a puzzle.
- Erase that steps Filled to Annotating to Empty.
- Undo and Erase buttons.

Out of scope:

- A number pad. Placing a definitive digit stays keyboard-only, by choice — see
  [Rejected alternatives](#rejected-alternatives).
- Redo.
- Any change to `src/engine/`. This is entirely UI-side.
- Persistence of play state across reloads.

## The cell state machine

This is the whole model. Every non-given cell is in exactly one of three states:

| State          | `entries[c]` | `marks[c]` | `shadow[c]`                                         |
| -------------- | ------------ | ---------- | --------------------------------------------------- |
| **Empty**      | 0            | 0          | 0                                                   |
| **Annotating** | 0            | non-zero   | 0                                                   |
| **Filled**     | the digit    | 0          | annotations displaced when it was filled (may be 0) |

`shadow` is new. It holds the annotations that were displaced when a digit was placed,
so erase can restore them.

**Undo cannot do this job.** A player may place a 5, work elsewhere for ten moves, then
return and erase, and still expect the annotations back. That is a forward action, not a
reversal, so the memory has to live in the state rather than in the history.

### Transitions

**`placeDigit(state, cell, d)`** — no-op on a given.

| From       | Effect                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------- |
| Annotating | `shadow ← marks`, `marks ← 0`, `entries ← d`                                              |
| Filled     | `entries ← d`; **shadow untouched**, so the original annotations survive a change of mind |
| Empty      | `shadow ← 0`, `entries ← d`                                                               |

**`toggleAnnotation(state, cell, a)`** — no-op on a given, and **no-op when Filled**. A
cell showing a definitive digit offers no annotation affordance at all; erase it first.

| From                | Effect                     |
| ------------------- | -------------------------- |
| Empty or Annotating | `marks ← marks XOR bit(a)` |

**`erase(state, cell)`** — no-op on a given.

| From       | Effect                                        | Resulting state                      |
| ---------- | --------------------------------------------- | ------------------------------------ |
| Filled     | `entries ← 0`, `marks ← shadow`, `shadow ← 0` | Annotating, or Empty if shadow was 0 |
| Annotating | `marks ← 0`                                   | Empty                                |
| Empty      | nothing                                       | Empty                                |

### The worked example

Annotate 3 and 5, place a definitive 5, then erase twice:

```
Empty          →  Annotating {3,5}   toggleAnnotation 3, toggleAnnotation 5
Annotating     →  Filled 5           placeDigit 5     — shadow = {3,5}
Filled 5       →  Annotating {3,5}   erase            — annotations come back
Annotating     →  Empty              erase            — annotations cleared
Empty          →  Empty              erase            — nothing happens
```

## Undo

A stack of full state snapshots. Push a copy of `{ entries, marks, shadow }` before
every mutation; undo pops and restores. 405 bytes per snapshot; a long puzzle of 300
actions costs under 125 KB.

**Why snapshots rather than inverse operations.** `erase` does three things at once —
clears the digit, restores the remembered annotations, and empties the shadow. Compound
actions are where hand-written inverses break. Snapshots have no inverse logic to get
wrong, and at this state size the memory argument for inverses does not apply.

- One snapshot per action. Toggling three annotations takes three undos.
- Unlimited depth within a puzzle. Generating a new puzzle clears the history.
- `Cmd/Ctrl+Z` and an Undo button, disabled when the stack is empty.
- Undo on an empty stack is a no-op, never an error.
- Undo restores board state only. The selected cell is not part of the snapshot, so
  undoing does not move the selection.
- **Snapshots must deep-copy the typed arrays.** Aliasing them would make undo restore
  the present — the one bug this design admits.

No redo. Recovering from an over-undo means retyping a digit, which is cheap enough that
a second stack and its invalidation rules are not worth the failure modes they add.

## Interaction

### Annotating

When the selected cell is annotatable — not a given, not Filled — it renders nine slot
buttons in a 3×3 layout at the pencil-mark positions. Clicking a slot toggles that
annotation.

Each slot is a real button carrying an accessible label naming what it does — for
example "toggle note 5 in r4c7" — so the grid stays operable by screen reader and the
slots are reachable without a mouse.

Set annotations render solid and are always visible. Unset slots are transparent until
the cell is hovered, then faint:

```css
.cell.selected .slot {
  opacity: 0;
}
.cell.selected:hover .slot {
  opacity: 0.35;
}
.cell .slot.set {
  opacity: 1;
}
```

**No JavaScript hover tracking.** No `mousemove` listener, no re-render on hover. Cells
that are given, Filled, or unselected render as they do today.

### Keyboard

| Key                          | Action                                           |
| ---------------------------- | ------------------------------------------------ |
| `1`–`9`                      | place a definitive digit                         |
| `Shift`+`1`–`9`              | toggle that annotation (no-op when Filled)       |
| `Backspace` / `Delete` / `0` | erase                                            |
| arrows                       | move the selection, without wrapping across rows |
| `Cmd/Ctrl`+`Z`               | undo                                             |

The `N` notes toggle is removed along with the mode it controlled.

The existing focus guard stays: keystrokes are ignored when focus is inside an
`input`, `select`, or `textarea`, so typing a seed cannot edit the board.

### Buttons

Undo and Erase, below the grid. Erase is the action that most needs a mouse path, since
it is how a Filled cell returns to Annotating. The "Pencil marks" toggle is removed.

Erase acts on the currently selected cell and is disabled when nothing is selected or
the selection is a given. Undo is disabled when the history is empty.

## Structure

Entirely UI-side. `toGrid` already ignores `marks` and will ignore `shadow` the same
way, so hints still derive candidates from placed digits alone. No engine change, no new
engine export, nothing to re-verify in the generator or grader.

`src/ui/board.ts` currently holds two unrelated jobs — the pure play-state model and the
DOM renderer. Adding a state machine, a shadow layer, and slot rendering would leave
neither easy to read, so the pure half moves out:

```
src/ui/
  play-state.ts   PlayState (+ shadow), the three transitions, and the pure helpers
                  moved from board.ts: createPlayState, isGiven, toGrid, conflicts,
                  isComplete
  history.ts      snapshot stack: createHistory, push, undo, canUndo, clear
  board.ts        renderBoard only, including the 3×3 slot buttons
  main.ts         wiring: keyboard, Undo and Erase buttons, generation
  explainer.ts    unchanged; imports toGrid from play-state
```

`setEntry` and `toggleMark` are replaced by `placeDigit`, `toggleAnnotation`, and
`erase` — three named transitions rather than two functions plus the
`setEntry(state, cell, 0)` idiom that currently means "erase".

## Testing

The pure modules carry the coverage. `renderBoard` stays hand-verified in a browser, as
established.

**`tests/ui/play-state.test.ts`**

- Table-driven across all three transitions × all three cell states, so every arrow in
  the state machine is pinned rather than sampled.
- The worked example above as a single named test, asserting each intermediate state.
- Givens are immune to all three transitions.
- The moved `toGrid` / `conflicts` / `isComplete` tests, unchanged in substance.
- `toGrid` ignores `shadow` as well as `marks`.

**`tests/ui/history.test.ts`**

- Undo on an empty stack is a no-op.
- Property: N actions followed by N undos returns byte-identical state.
- **Snapshots deep-copy the typed arrays** — mutating the live state after a push must
  not alter the snapshot. This is the one bug the design admits, so it gets an explicit
  test rather than relying on the property test to catch it.

Every test must be able to fail: name the mutation of the implementation that would
break it before writing it.

## Rejected alternatives

- **A number pad.** Rejected in favour of hover annotation, which is modeless. The
  consequence is that placing a definitive digit is keyboard-only; Undo and Erase get
  buttons because those are the actions worth reaching by mouse. Revisit if this is ever
  used on a touch screen, where the pad becomes necessary rather than merely convenient.
- **Annotating a Filled cell drops the digit automatically.** Rejected: it makes one
  gesture do two things and risks losing a placed digit to a stray click. Erase first.
- **Inverse-operation undo.** Rejected; see [Undo](#undo).
- **Redo.** Not requested, and cheap to live without.

## Open questions

None.
