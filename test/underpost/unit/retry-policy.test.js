import { describe, it, expect, vi } from 'vitest';
import {
  CircuitBreaker,
  isTransientError,
  retryAfterMs,
  retryDelayMs,
  withRetry,
} from '../../../src/server/runtime/retry.js';

describe('retry policy', () => {
  it('retries what never reached a decision and nothing else', () => {
    for (const error of [
      Object.assign(new Error('x'), { status: 503 }),
      Object.assign(new Error('x'), { http_code: 420 }),
      Object.assign(new Error('x'), { response: { status: 429 } }),
      Object.assign(new Error('x'), { code: 'ECONNRESET' }),
      Object.assign(new Error('x'), { code: 'EAI_AGAIN' }),
      Object.assign(new Error('x'), { name: 'MongoServerSelectionError' }),
      new Error('POST https://a/b timed out after 5000ms'),
    ])
      expect(isTransientError(error), error.message).toBe(true);
    for (const error of [
      Object.assign(new Error('x'), { status: 400 }),
      Object.assign(new Error('x'), { status: 409 }),
      new Error('Invalid content'),
      Object.assign(new Error('timed out'), { retryable: false }),
    ])
      expect(isTransientError(error)).toBe(false);
    expect(isTransientError(Object.assign(new Error('refused'), { status: 400, retryable: true }))).toBe(true);
  });

  it('reads Retry-After as seconds or a date, with a ceiling', () => {
    const now = Date.parse('2026-10-29T10:00:00Z');
    expect(retryAfterMs('3', now)).toBe(3000);
    expect(retryAfterMs('Thu, 29 Oct 2026 10:00:05 GMT', now)).toBe(5000);
    expect(retryAfterMs('999999', now)).toBe(600000);
    expect(retryAfterMs(null)).toBeUndefined();
    expect(retryAfterMs('soon')).toBeUndefined();
  });

  it('waits with full jitter under the ceiling, and never less than the dependency asked', () => {
    expect(retryDelayMs({ attempt: 1, baseDelayMs: 100, random: () => 0.5 })).toBe(50);
    expect(retryDelayMs({ attempt: 4, baseDelayMs: 100, random: () => 0.999 })).toBe(799);
    expect(retryDelayMs({ attempt: 20, baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 })).toBe(1000);
    expect(retryDelayMs({ attempt: 1, baseDelayMs: 100, retryAfter: 4000, random: () => 0 })).toBe(4000);
  });

  it('runs until success, a permanent failure, or the last attempt', async () => {
    const wait = vi.fn(async () => {});
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('busy'), { status: 503 });
      return 'ok';
    };
    expect(await withRetry(flaky, { attempts: 5, wait })).toBe('ok');
    expect(wait).toHaveBeenCalledTimes(2);

    const refused = vi.fn(async () => {
      throw Object.assign(new Error('bad'), { status: 400 });
    });
    await expect(withRetry(refused, { attempts: 5, wait })).rejects.toMatchObject({ attempts: 1 });
    expect(refused).toHaveBeenCalledTimes(1);

    const down = async () => {
      throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' });
    };
    await expect(withRetry(down, { attempts: 3, wait })).rejects.toMatchObject({ attempts: 3 });
  });

  it('opens after failures in a row, lets one call through after the cooldown, and closes on success', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 1000, now: () => now });
    breaker.failed();
    expect(breaker.waitMs).toBe(0);
    breaker.failed();
    expect(breaker.waitMs).toBe(1000);
    now = 1000;
    expect(breaker.waitMs).toBe(0);
    breaker.failed();
    expect(breaker.waitMs).toBe(1000);
    breaker.succeeded();
    expect(breaker.waitMs).toBe(0);
  });
});
