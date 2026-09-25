import { describe, it, expect, afterEach } from 'vitest';
import { SERVER_API_KEY_HEADER, isServerApiKey, serverKeyGuard } from '../../../src/projects/cyberia/server-key.js';

// The guard of a route only a game server calls: it fails closed.
const call = (headers) => {
  const answer = {};
  const res = { status: (code) => ({ json: (body) => Object.assign(answer, { code, body }) }) };
  let passed = false;
  serverKeyGuard({ headers }, res, () => (passed = true));
  return { passed, ...answer };
};

afterEach(() => delete process.env.CYBERIA_SERVER_API_KEY);

describe('the server key guard', () => {
  it('accepts nothing while no key is configured', () => {
    expect(isServerApiKey('')).toBe(false);
    expect(call({ [SERVER_API_KEY_HEADER]: '' })).toMatchObject({ passed: false, code: 503 });
  });

  it('refuses a wrong or missing key', () => {
    process.env.CYBERIA_SERVER_API_KEY = 'secret-1';
    expect(call({})).toMatchObject({ passed: false, code: 401 });
    expect(call({ [SERVER_API_KEY_HEADER]: 'secret-2' })).toMatchObject({ passed: false, code: 401 });
    expect(call({ [SERVER_API_KEY_HEADER]: 'secret-10' })).toMatchObject({ passed: false, code: 401 });
  });

  it('passes the configured key on', () => {
    process.env.CYBERIA_SERVER_API_KEY = 'secret-1';
    expect(call({ [SERVER_API_KEY_HEADER]: 'secret-1' })).toEqual({ passed: true });
  });
});
