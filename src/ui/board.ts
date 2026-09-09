import { CELLS, SIZE, bit, colOf, rowOf } from '../engine';
import { conflicts, type PlayState } from './play-state';

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

    cell.addEventListener('click', () => {
      opts.onSelect(c);
    });
    root.append(cell);
  }
}
