/**
 * Guest identities: one Valkey key per guest in its own namespace, a name that concurrent creations
 * never share, no credential at rest, one lifetime for the identity and its token, and a clear
 * failure when Valkey is down. Valkey is a memory stand-in.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { memoryValkey } from '../../support/valkey-memory.js';

vi.mock('../../../src/db/valkey/Valkey.js', async () =>
  (await import('../../support/valkey-memory.js')).memoryValkeyModule(),
);

const { GuestService } = await import('../../../src/api/user/guest.service.js');

const CONTEXT = { host: 'guests.test', path: '/' };
const ENV = { JWT_SECRET: 'guest-service-test-secret', GUEST_SESSION_MINUTES: '30' };
const saved = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));
const request = (token) => ({
  ip: '10.0.0.1',
  headers: { 'user-agent': 'guest-test', ...(token ? { authorization: `Bearer ${token}` } : {}) },
});
const authOf = (token) => ({ ...request(token), auth: { user: jwt.decode(token) } });

describe('GuestService', () => {
  beforeAll(() => Object.assign(process.env, ENV));
  beforeEach(() => {
    memoryValkey.clear();
    memoryValkey.setDown(false);
  });
  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('gives concurrent guests distinct ids, names and keys', async () => {
    const guests = await Promise.all(Array.from({ length: 500 }, () => GuestService.create(request(), CONTEXT)));
    const ids = new Set(guests.map(({ user }) => user._id));
    const names = new Set(guests.map(({ user }) => user.username));
    expect(ids.size).toBe(500);
    expect(names.size).toBe(500);
    expect(new Set(memoryValkey.keys())).toEqual(new Set([...ids].map((id) => `guest:${id}`)));
  });

  it('stores no credential, email or token, for the configured lifetime', async () => {
    const { user, token } = await GuestService.create(request(), CONTEXT);
    const stored = await GuestService.find(user._id, CONTEXT);
    expect(stored).toMatchObject({ _id: user._id, username: user.username, role: 'guest' });
    expect(stored).not.toHaveProperty('password');
    expect(stored).not.toHaveProperty('email');
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(memoryValkey.ttlMs(`guest:${user._id}`)).toBeGreaterThan(29 * 60 * 1000);
    const claims = jwt.decode(token);
    expect(claims.exp - claims.iat).toBe(30 * 60);
    expect(claims).not.toHaveProperty('email');
  });

  it('renews the identity and its token together, and ends with them', async () => {
    const { user, token } = await GuestService.create(request(), CONTEXT);
    const renewed = await GuestService.auth(authOf(token), CONTEXT);
    expect(renewed.user._id).toBe(user._id);
    expect(jwt.decode(renewed.token)._id).toBe(user._id);

    memoryValkey.clear();
    await expect(GuestService.auth(authOf(token), CONTEXT)).rejects.toThrow('guest user expired');
    expect(await GuestService.find('not-a-guest', CONTEXT)).toBeNull();
  });

  it('fails a creation when Valkey is down', async () => {
    memoryValkey.setDown(true);
    await expect(GuestService.create(request(), CONTEXT)).rejects.toThrow('not connected');
  });
});
