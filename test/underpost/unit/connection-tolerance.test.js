import { describe, it, expect, vi, beforeEach } from 'vitest';

// A live container: the status contract is writable, and each write is recorded.
const writes = vi.hoisted(() => []);
vi.mock('../../../src/index.js', () => ({
  default: { state: { isInsideContainer: () => true, set: (key, value) => writes.push([key, value]) } },
}));

const { CONNECTION_FAILURE_TOLERANCE, recordConnectionFailure, recordConnectionSuccess } =
  await import('../../../src/server/runtime/runtime-status.js');

describe('connection failure tolerance', () => {
  beforeEach(() => {
    writes.length = 0;
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    vi.stubEnv('VITEST_WORKER_ID', '');
    return () => vi.unstubAllEnvs();
  });

  it('latches the container as failed only once a connection fails five times in a row', () => {
    expect(CONNECTION_FAILURE_TOLERANCE).toBe(5);
    for (let failure = 1; failure < CONNECTION_FAILURE_TOLERANCE; failure++)
      expect(recordConnectionFailure('valkey:a/')).toBe(failure);
    expect(writes).toEqual([]);
    expect(recordConnectionFailure('valkey:a/')).toBe(5);
    expect(writes).toEqual([['container-status', 'error']]);
  });

  it('starts counting again after a connection answers, and counts each connection apart', () => {
    for (let failure = 1; failure < CONNECTION_FAILURE_TOLERANCE; failure++) recordConnectionFailure('mongoose:b/');
    recordConnectionSuccess('mongoose:b/');
    expect(recordConnectionFailure('mongoose:b/')).toBe(1);
    expect(recordConnectionFailure('valkey:b/')).toBe(1);
    expect(writes).toEqual([]);
  });
});
