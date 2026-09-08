import { describe, expect, it } from 'vitest';
import { hashSeed, makeRng, randomSeed, shuffle } from '../src/engine/rng';

describe('hashSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
  });

  it('separates similar strings', () => {
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    expect(hashSeed('abc')).not.toBe(hashSeed('cba'));
  });

  it('returns a non-negative 32-bit integer', () => {
    for (const s of ['', 'a', 'seed:0', 'seed:1', 'a very long seed string indeed']) {
      const h = hashSeed(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('makeRng', () => {
  it('produces values in [0, 1)', () => {
    const rng = makeRng('seed');
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces the same sequence for the same seed', () => {
    const a = makeRng('same');
    const b = makeRng('same');
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makeRng('one');
    const b = makeRng('two');
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('does not repeat immediately', () => {
    const rng = makeRng('variety');
    const values = new Set(Array.from({ length: 200 }, () => rng()));
    expect(values.size).toBeGreaterThan(190);
  });
});

describe('shuffle', () => {
  it('preserves every element', () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    const result = shuffle([...items], makeRng('s'));
    expect([...result].sort((x, y) => x - y)).toEqual(items);
  });

  it('is deterministic for a given seed', () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    const a = shuffle([...items], makeRng('s'));
    const b = shuffle([...items], makeRng('s'));
    expect(a).toEqual(b);
  });

  it('actually reorders', () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    expect(shuffle([...items], makeRng('s'))).not.toEqual(items);
  });

  it('mutates and returns the same array', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(items, makeRng('s'))).toBe(items);
  });
});

describe('randomSeed', () => {
  it('returns a non-empty string', () => {
    expect(randomSeed().length).toBeGreaterThan(0);
  });

  it('is very unlikely to collide', () => {
    const seeds = new Set(Array.from({ length: 500 }, () => randomSeed()));
    expect(seeds.size).toBe(500);
  });
});
