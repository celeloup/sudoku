import { describe, expect, it } from 'vitest';
import { remaining } from '../../src/ui/number-pad';
import { CELLS } from '../../src/engine';

function arrays(): { givens: Uint8Array; entries: Uint8Array } {
  return { givens: new Uint8Array(CELLS), entries: new Uint8Array(CELLS) };
}

describe('remaining', () => {
  it('starts at nine for a digit nobody has placed', () => {
    const { givens, entries } = arrays();
    expect(remaining(givens, entries, 5)).toBe(9);
  });

  it('counts givens, not just the player entries', () => {
    const { givens, entries } = arrays();
    givens[0] = 5;
    givens[10] = 5;
    expect(remaining(givens, entries, 5)).toBe(7);
  });

  it('counts givens and entries together', () => {
    const { givens, entries } = arrays();
    givens[0] = 5;
    entries[20] = 5;
    expect(remaining(givens, entries, 5)).toBe(7);
  });

  it('reaches zero when all nine are placed', () => {
    const { givens, entries } = arrays();
    for (let i = 0; i < 9; i++) entries[i * 9] = 5;
    expect(remaining(givens, entries, 5)).toBe(0);
  });

  it('ignores other digits', () => {
    const { givens, entries } = arrays();
    givens[0] = 4;
    entries[1] = 6;
    expect(remaining(givens, entries, 5)).toBe(9);
  });
});
