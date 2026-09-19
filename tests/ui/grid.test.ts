import { describe, expect, it } from 'vitest';
import { isTintedBox, trackLine } from '../../src/ui/grid';

describe('trackLine', () => {
  it('places the first cell after the outer frame track', () => {
    expect(trackLine(0)).toBe(2);
  });

  it('leaves exactly one line track between neighbouring cells', () => {
    expect(trackLine(1) - trackLine(0)).toBe(2);
  });

  it('places the last cell before the closing frame track', () => {
    expect(trackLine(8)).toBe(18);
  });
});

describe('isTintedBox', () => {
  it('tints the four edge-centre boxes', () => {
    expect(isTintedBox(4)).toBe(true); // row 0, col 4 -> box 1, top centre
    expect(isTintedBox(27)).toBe(true); // row 3, col 0 -> box 3, centre left
    expect(isTintedBox(33)).toBe(true); // row 3, col 6 -> box 5, centre right
    expect(isTintedBox(76)).toBe(true); // row 8, col 4 -> box 7, bottom centre
  });

  it('leaves the corners and the centre on paper', () => {
    expect(isTintedBox(0)).toBe(false); // box 0
    expect(isTintedBox(8)).toBe(false); // box 2
    expect(isTintedBox(40)).toBe(false); // box 4, the centre
    expect(isTintedBox(72)).toBe(false); // box 6
    expect(isTintedBox(80)).toBe(false); // box 8
  });
});
