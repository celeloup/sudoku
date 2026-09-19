import { generatePuzzle, type Difficulty, type Puzzle } from '../engine';
import { renderGrid } from './grid';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

/**
 * One printed puzzle page: number block, grid, seed. No states, no shadows,
 * one ink. `number` is the puzzle's position in the notebook, not its seed.
 */
export function renderPage(puzzle: Puzzle, number: number): HTMLElement {
  const page = document.createElement('article');
  page.className = 'sdp-page';

  const head = document.createElement('header');
  head.className = 'sdp-head';
  head.append(
    el('div', 'sdp-no', 'No.'),
    el(
      'div',
      'sdp-numberline',
      undefined,
      el('span', 'sdp-numeral', String(number).padStart(3, '0')),
      el('span', 'sdp-difficulty', puzzle.difficulty),
    ),
  );

  const grid = document.createElement('div');
  renderGrid(grid, {
    variant: 'print',
    givens: puzzle.givens,
    label: `Sudoku ${String(number)}, ${puzzle.difficulty}`,
  });

  page.append(head, grid, el('div', 'sdp-seed', puzzle.seed));
  return page;
}

/**
 * An A4 sheet holding `cols * rows` pages at true size.
 *
 * Imposing here rather than in the print dialog is deliberate: "pages per
 * sheet" scales pages down to fit, and a scaled page no longer measures
 * 65.4 mm, which voids the whole test-print checklist.
 */
export function renderSheet(pages: HTMLElement[], cols: number): HTMLElement {
  const sheet = document.createElement('section');
  sheet.className = 'sdp-sheet';

  const block = document.createElement('div');
  block.className = 'sdp-block';
  block.style.setProperty('--sheet-cols', String(cols));
  block.append(...pages);

  sheet.append(block);
  return sheet;
}

function el(tag: string, className: string, text?: string, ...children: Node[]): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  node.append(...children);
  return node;
}

function difficultyFrom(value: string | null): Difficulty {
  return DIFFICULTIES.find((d) => d === value) ?? 'medium';
}

// ponytail: generation blocks the main thread, so a run of hard pages freezes
// the tab for seconds. This is a proofing page; the Web Worker lands with the
// real Print screen.
const params = new URLSearchParams(location.search);
const difficulty = difficultyFrom(params.get('difficulty'));
const count = Math.min(Math.max(Number(params.get('n')) || 2, 1), 16);
const seed = params.get('seed') ?? undefined;

const pages = Array.from({ length: count }, (_, i) =>
  renderPage(
    generatePuzzle({ difficulty, ...(seed === undefined ? {} : { seed: `${seed}-${String(i)}` }) }),
    i + 1,
  ),
);

// `sheet` absent gives bare A7 pages: that is the file a print shop wants,
// and it is the only mode where the PDF's page size is the trim size.
const perSheet = Number(params.get('sheet'));
if (perSheet === 1 || perSheet === 4) {
  const cols = perSheet === 4 ? 2 : 1;
  const sheets = [];
  for (let i = 0; i < pages.length; i += perSheet) {
    sheets.push(renderSheet(pages.slice(i, i + perSheet), cols));
  }
  // @page cannot be conditioned on a class, so the sheet modes swap the paper
  // size here rather than in print.css.
  const style = document.createElement('style');
  style.textContent = '@page { size: 210mm 297mm; margin: 0 }'; /* --sheet-w --sheet-h */
  document.head.append(style);
  document.body.append(...sheets);
} else {
  document.body.append(...pages);
}
