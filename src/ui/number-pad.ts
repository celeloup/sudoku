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
