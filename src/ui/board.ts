import { CELLS, SIZE, bit, cellName, colOf, rowOf } from '../engine';
import { conflicts, isAnnotatable, type PlayState } from './play-state';

export interface BoardOptions {
  selected: number | null;
  highlighted?: Set<number>;
  onSelect: (cell: number) => void;
  onToggleAnnotation: (cell: number, digit: number) => void;
}

export function renderBoard(root: HTMLElement, state: PlayState, opts: BoardOptions): void {
  const bad = conflicts(state);
  root.replaceChildren();
  root.classList.add('board');

  for (let c = 0; c < CELLS; c++) {
    const annotating = c === opts.selected && isAnnotatable(state, c);
    // A <button> may not legally contain <button> children, so the annotating
    // cell — which holds nine slot buttons — is a <div> instead.
    const cell = document.createElement(annotating ? 'div' : 'button');
    if (cell instanceof HTMLButtonElement) cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.cell = String(c);
    if (annotating) cell.classList.add('annotating');

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

    cell.addEventListener('click', () => {
      opts.onSelect(c);
    });
    root.append(cell);
  }
}
