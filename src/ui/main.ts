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
  // Let ordinary form controls (the seed input, the difficulty select) handle
  // their own typing and caret movement instead of the board shortcuts below.
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) {
    return;
  }

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
