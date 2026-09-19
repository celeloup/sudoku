import { GenerationError, generatePuzzle } from '../engine';
import type { GenerateReply, GenerateRequest } from './generate';

/**
 * `lib: DOM` types the worker global as a Window, so one deliberate cast gives
 * it the shape it actually has. Everything below it stays fully typed.
 */
interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<GenerateRequest>) => void): void;
  postMessage(reply: GenerateReply): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const { difficulty, seed } = event.data;
  try {
    // exactOptionalPropertyTypes forbids an explicit `seed: undefined`, so the
    // key is omitted entirely rather than set to undefined.
    const puzzle = generatePuzzle(seed === undefined ? { difficulty } : { difficulty, seed });
    scope.postMessage({ ok: true, puzzle });
  } catch (err) {
    scope.postMessage({
      ok: false,
      message:
        err instanceof GenerationError
          ? `No ${difficulty} puzzle came out in time. Try again, or pick another difficulty.`
          : 'The puzzle generator failed. Try again.',
    });
  }
});
