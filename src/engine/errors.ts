import type { Difficulty } from './types';

export class InvalidGridError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGridError';
  }
}

export class InvalidMixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMixError';
  }
}

export class GenerationError extends Error {
  readonly attempts: number;
  readonly bestTier: Difficulty | null;

  constructor(message: string, attempts: number, bestTier: Difficulty | null) {
    super(message);
    this.name = 'GenerationError';
    this.attempts = attempts;
    this.bestTier = bestTier;
  }
}
