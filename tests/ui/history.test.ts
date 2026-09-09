import { describe, expect, it } from 'vitest';
import { canUndo, clear, commit, createHistory, undo } from '../../src/ui/history';
import { createPlayState, erase, placeDigit, toggleAnnotation } from '../../src/ui/play-state';
import type { Puzzle } from '../../src/engine';
import { valuesFrom } from '../helpers';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function puzzle(): Puzzle {
  return {
    givens: valuesFrom(GIVENS),
    solution: valuesFrom(SOLUTION),
    difficulty: 'easy',
    score: 42,
    clueCount: 30,
    seed: 'test',
  };
}

const FREE = 2;
/** Also empty in the fixture. Cell 4 is a given (7) — do not use it here. */
const OTHER = 3;

describe('undo', () => {
  it('is a no-op on an empty history', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    expect(canUndo(h)).toBe(false);
    expect(undo(h, s)).toBe(false);
  });

  it('reverses a single placement', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    commit(h, s, () => {
      placeDigit(s, FREE, 7);
    });
    expect(s.entries[FREE]).toBe(7);
    expect(undo(h, s)).toBe(true);
    expect(s.entries[FREE]).toBe(0);
  });

  it('restores the shadow, not just the visible state', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    commit(h, s, () => {
      toggleAnnotation(s, FREE, 3);
    });
    commit(h, s, () => {
      placeDigit(s, FREE, 5);
    });
    commit(h, s, () => {
      erase(s, FREE);
    });
    // Erase restored the annotation and emptied the shadow. Undoing it must put
    // the digit back AND refill the shadow, or a second erase would misbehave.
    undo(h, s);
    expect(s.entries[FREE]).toBe(5);
    expect(s.marks[FREE]).toBe(0);
    expect(s.shadow[FREE]).not.toBe(0);
  });

  it('returns byte-identical state after N actions and N undos', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    const before = {
      entries: Uint8Array.from(s.entries),
      marks: Uint16Array.from(s.marks),
      shadow: Uint16Array.from(s.shadow),
    };

    const actions = [
      () => {
        toggleAnnotation(s, FREE, 1);
      },
      () => {
        toggleAnnotation(s, FREE, 9);
      },
      () => {
        placeDigit(s, FREE, 4);
      },
      () => {
        toggleAnnotation(s, OTHER, 2);
      },
      () => {
        erase(s, FREE);
      },
      () => {
        erase(s, FREE);
      },
    ];
    for (const a of actions) commit(h, s, a);
    // The last two actions erase FREE back to empty, so `entries` returns to
    // its starting value here — that array can't prove anything happened.
    // `marks` still differs: toggleAnnotation(OTHER, 2) left a mark nothing
    // later clears.
    expect(s.marks).not.toEqual(before.marks);

    actions.forEach(() => {
      expect(undo(h, s)).toBe(true);
    });

    expect(s.entries).toEqual(before.entries);
    expect(s.marks).toEqual(before.marks);
    expect(s.shadow).toEqual(before.shadow);
    expect(canUndo(h)).toBe(false);
  });
});

describe('commit', () => {
  it('does not record an action that changed nothing', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    // Erasing an already-empty cell must not consume an undo step.
    expect(
      commit(h, s, () => {
        erase(s, FREE);
      }),
    ).toBe(false);
    expect(canUndo(h)).toBe(false);
  });

  it('does not record a transition the state machine refuses', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    // Cell 0 is a given; every transition is a no-op there.
    expect(
      commit(h, s, () => {
        placeDigit(s, 0, 9);
      }),
    ).toBe(false);
    expect(canUndo(h)).toBe(false);
  });

  it('snapshots deep-copy the arrays', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    commit(h, s, () => {
      placeDigit(s, FREE, 7);
    });
    // Mutate the live state directly, bypassing commit. If the snapshot aliased
    // these arrays, undo would restore the present and this test would fail.
    s.entries[FREE] = 9;
    s.marks[OTHER] = 0b101;
    undo(h, s);
    expect(s.entries[FREE]).toBe(0);
    expect(s.marks[OTHER]).toBe(0);
  });
});

describe('clear', () => {
  it('drops the whole history', () => {
    const s = createPlayState(puzzle());
    const h = createHistory();
    commit(h, s, () => {
      placeDigit(s, FREE, 7);
    });
    clear(h);
    expect(canUndo(h)).toBe(false);
    expect(undo(h, s)).toBe(false);
  });
});
