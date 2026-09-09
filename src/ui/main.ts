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

/** The single undo sequence, shared by the button and the keyboard chord. */
function performUndo(): void {
  if (!state) return;
  if (undo(history, state)) {
    highlighted = new Set();
    draw();
    report();
  }
  syncButtons();
}

function draw(): void {
  if (!state) return;
  renderBoard(boardEl, state, {
    selected,
    highlighted,
    onSelect: (cell) => {
      selected = cell;
      draw();
      syncButtons();
    },
    onToggleAnnotation: (cell, digit) => {
      act(() => {
        toggleAnnotation(state!, cell, digit);
      });
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
  const seed = seedEl.value.trim();
  statusEl.textContent = 'Generating…';
  explanationEl.textContent = '';
  highlighted = new Set();
  selected = null;

  // Yield once so the "Generating…" message paints before the blocking work.
  setTimeout(() => {
    try {
      // exactOptionalPropertyTypes forbids passing `seed: undefined` explicitly,
      // so the key is omitted entirely rather than set to undefined.
      const puzzle = generatePuzzle(seed ? { difficulty, seed } : { difficulty });
      state = createPlayState(puzzle);
      seedEl.value = puzzle.seed;
      clear(history);
      draw();
      report();
      syncButtons();
    } catch (err) {
      state = null;
      boardEl.replaceChildren();
      statusEl.textContent =
        err instanceof GenerationError
          ? `${err.message} (best tier reached: ${err.bestTier ?? 'none'})`
          : `Unexpected error: ${String(err)}`;
      // The puzzle those snapshots described no longer exists, so a later
      // undo must not be able to restore state belonging to a gone puzzle.
      clear(history);
      syncButtons();
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

undoEl.addEventListener('click', () => {
  performUndo();
});

eraseEl.addEventListener('click', () => {
  if (selected === null) return;
  const cell = selected;
  act(() => {
    erase(state!, cell);
  });
});

document.addEventListener('keydown', (event) => {
  // Let ordinary form controls (the seed input, the difficulty select) handle
  // their own typing and caret movement instead of the board shortcuts below.
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) {
    return;
  }
  if (!state) return;

  const undoChord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z';
  if (undoChord) {
    event.preventDefault();
    performUndo();
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

generate();
