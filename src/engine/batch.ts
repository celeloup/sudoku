import { InvalidMixError } from './errors';
import { generatePuzzle } from './generator';
import { randomSeed } from './rng';
import type { Difficulty, Puzzle } from './types';

const TIERS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export type Mix = Partial<Record<Difficulty, number>>;

/**
 * Turns percentages into whole puzzle counts using largest-remainder rounding,
 * so the parts always sum to `count`.
 */
export function distribute(count: number, mix: Mix): Record<Difficulty, number> {
  if (!Number.isInteger(count) || count < 1) {
    throw new InvalidMixError(`count must be a positive integer, got ${count}`);
  }

  const entries = TIERS.map((tier) => ({ tier, pct: mix[tier] ?? 0 }));
  for (const { tier, pct } of entries) {
    if (pct < 0) throw new InvalidMixError(`mix.${tier} must not be negative, got ${pct}`);
  }

  const total = entries.reduce((sum, e) => sum + e.pct, 0);
  if (Math.abs(total - 100) > 1e-9) {
    throw new InvalidMixError(`mix must sum to 100, got ${total}`);
  }

  const exact = entries.map((e) => ({ ...e, raw: (count * e.pct) / 100 }));
  const result = Object.fromEntries(exact.map((e) => [e.tier, Math.floor(e.raw)])) as Record<
    Difficulty,
    number
  >;

  let remaining = count - TIERS.reduce((sum, tier) => sum + result[tier], 0);
  const byRemainder = [...exact].sort((a, b) => {
    const diff = b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw));
    if (Math.abs(diff) > 1e-9) return diff;
    // Stable tie-break by tier order, so distribution is deterministic.
    return TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier);
  });

  let i = 0;
  while (remaining > 0) {
    const entry = byRemainder[i % byRemainder.length]!;
    if (entry.pct > 0) {
      result[entry.tier]++;
      remaining--;
    }
    i++;
  }

  return result;
}

export function generateSet(opts: { count: number; mix: Mix; seed?: string }): Puzzle[] {
  const counts = distribute(opts.count, opts.mix);
  const seed = opts.seed ?? randomSeed();
  const out: Puzzle[] = [];

  let index = 0;
  for (const tier of TIERS) {
    for (let n = 0; n < counts[tier]; n++) {
      out.push(generatePuzzle({ difficulty: tier, seed: `${seed}:${index}` }));
      index++;
    }
  }
  return out;
}
