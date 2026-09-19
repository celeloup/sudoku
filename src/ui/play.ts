import { CELLS, SIZE, type Difficulty } from '../engine';
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

const playEl = document.querySelector<HTMLElement>('.sdp-play')!;
const gridEl = document.querySelector<HTMLDivElement>('#grid')!;
const padEl = document.querySelector<HTMLDivElement>('#pad')!;
const seedEl = document.querySelector<HTMLParagraphElement>('#seed')!;
const messageEl = document.querySelector<HTMLParagraphElement>('#message')!;
const difficultyEl = document.querySelector<HTMLSpanElement>('#difficulty')!;
const menuEl = document.querySelector<HTMLButtonElement>('#menu')!;
const dialogEl = document.querySelector<HTMLDialogElement>('#new-game')!;
const dialogFormEl = dialogEl.querySelector<HTMLFormElement>('form')!;

let state: PlayState | null = null;
let selected: number | null = null;
let notes = false;
const history = createHistory();

/** The empty grid behind the waiting state. `CELLS`, not 81: the engine owns that number. */
const EMPTY = new Uint8Array(CELLS);

const WAITING = 'Building a puzzle. Expert can take a few seconds.';
const SOLVED = 'Solved. Every digit is in place.';

/**
 * Records which annotation slot has focus, if any, so a re-render can restore
 * it. Only the selected cell ever renders slots, so the digit identifies the
 * slot on its own — the cell index the old harness also carried was redundant
 * the moment the grid stopped drawing slots in unselected cells.
 */
function describeFocus(): number | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !el.classList.contains('sdp-slot')) return null;
  const digit = Number(el.dataset.digit);
  return Number.isInteger(digit) ? digit : null;
}

function restoreFocus(digit: number | null): void {
  if (digit === null) return;
  gridEl.querySelector<HTMLButtonElement>(`.sdp-slot[data-digit="${String(digit)}"]`)?.focus();
}

/**
 * A solved grid is read-only. One guard covers it, because every way of adding
 * to the board — keyboard, pad, annotation slot — goes through `act`. Undo is
 * the deliberate exception: it does not pass here, so the one action that can
 * take a grid back out of the solved state still works.
 */
function locked(): boolean {
  return state !== null && isComplete(state);
}

/** Every board mutation goes through here, so undo can never miss one. */
function act(mutate: () => void): void {
  if (!state || locked()) return;
  const focused = describeFocus();
  if (commit(history, state, mutate)) {
    draw();
    restoreFocus(focused);
    syncSolved();
  }
}

/** The single undo sequence, shared by the pad button and the keyboard chord. */
function performUndo(): void {
  if (!state) return;
  if (undo(history, state)) {
    draw();
    syncSolved();
  }
}

/** The solved state is the sticker plus the live-region announcement. */
function syncSolved(): void {
  if (state && isComplete(state)) {
    playEl.dataset.solved = '';
    messageEl.textContent = SOLVED;
  } else {
    delete playEl.dataset.solved;
    messageEl.textContent = '';
  }
}

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
      if (locked()) return;
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
      eraseSelected();
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

function eraseSelected(): void {
  if (selected === null) return;
  const cell = selected;
  act(() => {
    erase(state!, cell);
  });
}

async function newGame(difficulty: Difficulty, seed?: string): Promise<void> {
  state = null;
  selected = null;
  clear(history);
  delete playEl.dataset.solved;
  difficultyEl.textContent = difficulty;
  seedEl.textContent = '';
  messageEl.textContent = WAITING;
  // An empty `static` grid is the empty state: the shape of what is coming,
  // with one sentence beside it. The worker keeps the tab responsive meanwhile.
  renderGrid(gridEl, { variant: 'static', givens: EMPTY, label: 'No puzzle yet' });
  padEl.replaceChildren();

  // exactOptionalPropertyTypes forbids passing `seed: undefined` explicitly,
  // so the key is omitted entirely rather than set to undefined.
  const reply = await requestPuzzle(seed === undefined ? { difficulty } : { difficulty, seed });
  if (!reply.ok) {
    // The generator's own message already says what happened and what to do.
    messageEl.textContent = reply.message;
    return;
  }
  messageEl.textContent = '';
  state = createPlayState(reply.puzzle);
  seedEl.textContent = reply.puzzle.seed;
  draw();
}

const DIFFICULTIES: readonly string[] = ['easy', 'medium', 'hard', 'expert'];

/** The radio value crosses a DOM boundary untyped, so it is checked, not cast. */
function toDifficulty(value: FormDataEntryValue | null): Difficulty {
  return typeof value === 'string' && DIFFICULTIES.includes(value)
    ? (value as Difficulty)
    : 'medium';
}

menuEl.addEventListener('click', () => {
  dialogEl.showModal();
});

dialogEl.addEventListener('close', () => {
  if (dialogEl.returnValue !== 'start') return;
  void newGame(toDifficulty(new FormData(dialogFormEl).get('difficulty')));
});

document.addEventListener('keydown', (event) => {
  // Let ordinary form controls (the difficulty radios) handle their own typing
  // and arrow movement instead of the board shortcuts below, and leave the
  // whole keyboard to the dialog while it is open.
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) {
    return;
  }
  if (dialogEl.open) return;
  if (!state) return;

  const undoChord =
    (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
  if (undoChord) {
    event.preventDefault();
    performUndo();
    return;
  }

  // Everything below moves the selection or adds to the board, and a solved
  // grid accepts neither. Undo, above, is what gets you back out of it.
  if (locked()) return;

  if (selected === null) return;

  const moves: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -SIZE,
    ArrowDown: SIZE,
  };
  const delta = moves[event.key];
  if (delta !== undefined) {
    event.preventDefault();
    const next = selected + delta;
    if (next >= 0 && next < CELLS) {
      // Horizontal moves must not wrap across rows.
      if (Math.abs(delta) === 1 && Math.floor(next / SIZE) !== Math.floor(selected / SIZE)) return;
      // The old cell's slot for this digit no longer exists after the move, so
      // restore focus to the same digit position in the newly selected cell
      // rather than the (now gone) element itself.
      const focused = describeFocus();
      selected = next;
      draw();
      restoreFocus(focused);
    }
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
    eraseSelected();
    return;
  }

  // Modifier chords (Cmd/Ctrl/Alt+digit) are browser or OS shortcuts (tab
  // switching, among others) that happen to overlap the digit keys. Never
  // treat them as board input — Shift is the only modifier digit entry uses.
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  // Shift+3 reports event.key as '#' on many layouts, so fall back to the
  // physical key. event.code is layout-independent: Digit3 stays Digit3
  // whether or not Shift is held. Gated on shiftKey so it only rescues that
  // case — applied unconditionally it would reinterpret an unshifted key on
  // layouts (e.g. AZERTY) where the physical digit row types punctuation.
  const codeDigit = event.shiftKey ? /^Digit([1-9])$/.exec(event.code)?.[1] : undefined;
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

const params = new URLSearchParams(location.search);
const seed = params.get('seed');
void newGame('medium', seed ?? undefined);
