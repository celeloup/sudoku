import { bit, boxOf, cellName, colOf, rowOf, SIZE } from '../engine';

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

  node.setAttribute('role', 'gridcell');
  // Roving tabindex: exactly one cell is in the tab order, so Tab enters and
  // leaves the whole grid once and the arrow keys move within it. With no
  // selection yet that is the first cell, or the grid would be unreachable.
  node.tabIndex = cell === (opts.selected ?? 0) ? 0 : -1;

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
    appendMarks(node, opts.marks![cell]!);
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

/**
 * The nine marks go straight into the cell, which is itself the 3x3 layout. A
 * wrapper element would be a single item in that layout and collapse into the
 * top-left ninth, which is exactly what it used to do.
 */
function appendMarks(node: HTMLElement, mask: number): void {
  for (let d = 1; d <= SIZE; d++) {
    const mark = document.createElement('span');
    mark.className = 'sdp-mark';
    mark.textContent = mask & bit(d) ? String(d) : '';
    node.append(mark);
  }
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
