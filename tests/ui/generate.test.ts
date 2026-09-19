import { describe, expect, it } from 'vitest';
import { parseReply } from '../../src/ui/generate';

describe('parseReply', () => {
  it('passes a success reply through', () => {
    const puzzle = { seed: 'abc' };
    expect(parseReply({ ok: true, puzzle })).toEqual({ ok: true, puzzle });
  });

  it('passes a failure reply through', () => {
    expect(parseReply({ ok: false, message: 'no luck' })).toEqual({
      ok: false,
      message: 'no luck',
    });
  });

  it('refuses a failure reply with no message rather than treating it as success', () => {
    const reply = parseReply({ ok: false });
    expect(reply.ok).toBe(false);
    expect(!reply.ok && reply.message.length > 0).toBe(true);
  });

  it('refuses a success reply with no puzzle', () => {
    expect(parseReply({ ok: true }).ok).toBe(false);
  });

  it('refuses something that is not a reply at all', () => {
    expect(parseReply(null).ok).toBe(false);
    expect(parseReply('boom').ok).toBe(false);
  });
});
