import type { Difficulty, Puzzle } from '../engine';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

/**
 * A difficulty arriving from outside the type system — a query string, a form
 * field — checked rather than cast, falling back to the middle tier.
 */
export function toDifficulty(value: unknown): Difficulty {
  return DIFFICULTIES.find((d) => d === value) ?? 'medium';
}

export interface GenerateRequest {
  difficulty: Difficulty;
  seed?: string;
}

export type GenerateReply = { ok: true; puzzle: Puzzle } | { ok: false; message: string };

const UNREADABLE = 'The puzzle generator sent a reply we could not read. Try again.';
const STOPPED = 'The puzzle generator stopped unexpectedly. Try again.';

/**
 * Validates what came back over the worker boundary. A malformed reply must
 * never be mistaken for a puzzle: the screen would render an empty grid and
 * say nothing about why.
 */
export function parseReply(data: unknown): GenerateReply {
  if (typeof data !== 'object' || data === null || !('ok' in data)) {
    return { ok: false, message: UNREADABLE };
  }
  const reply = data as { ok: unknown; puzzle?: unknown; message?: unknown };
  if (reply.ok === true && typeof reply.puzzle === 'object' && reply.puzzle !== null) {
    return { ok: true, puzzle: reply.puzzle as Puzzle };
  }
  if (reply.ok === false && typeof reply.message === 'string' && reply.message !== '') {
    return { ok: false, message: reply.message };
  }
  return { ok: false, message: UNREADABLE };
}

let worker: Worker | null = null;

/**
 * Generates one puzzle off the main thread.
 *
 * A request arriving while one is in flight terminates the running worker.
 * Queueing would put an easy puzzle behind an expert's four-second tail, and
 * nobody wants the abandoned result.
 */
export function requestPuzzle(request: GenerateRequest): Promise<GenerateReply> {
  worker?.terminate();
  const current = new Worker(new URL('./generate.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker = current;

  return new Promise((resolve) => {
    current.addEventListener('message', (event) => {
      resolve(parseReply(event.data));
    });
    current.addEventListener('error', () => {
      resolve({ ok: false, message: STOPPED });
    });
    current.postMessage(request);
  });
}
