/**
 * Refresh sessions and password recovery against a real MongoDB and the real user router: the
 * stored form of a refresh token, its rotation, the idle limit, the bound on sessions per user
 * (the default of 10), logout, and the end of every session when a recovery sets a new password.
 * Sign-up opens a session too.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { authMiddlewareFactory, hashToken, jwtSign } from '../../../src/server/security/auth.js';
import { apiPathOf } from '../../../src/server/domain/api-contract.js';
import { UserRouter } from '../../../src/api/user/user.router.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const CONTEXT = { host: 'sessions.test', path: '/' };
const API = apiPathOf('/');
const PASSWORD = 'Str0ng!Passw0rd';
const ENV = {
  JWT_SECRET: 'user-sessions-test-jwt-secret',
  ACCESS_EXPIRE_MINUTES: '60',
  REFRESH_EXPIRE_MINUTES: '5',
  DISABLE_API_RATE_LIMIT: 'true',
};
const saved = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));

/** A browser that keeps its cookies. */
const browser = (origin) => {
  const cookies = new Map();
  const request = async (path, { body, headers, ...init } = {}) => {
    const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const res = await fetch(`${origin}${path}`, {
      ...init,
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: {
        'user-agent': 'user-sessions-test',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
    }
    return res;
  };
  return { cookies, request };
};

describe.skipIf(!mongodBinary)('user sessions', () => {
  let mongod;
  let server;
  let origin;
  let User;

  const logIn = async (client, email) => {
    const res = await client.request(`${API}/user/auth`, { method: 'POST', body: { email, password: PASSWORD } });
    expect(res.status).toBe(200);
    return (await res.json()).data.token;
  };

  /** The refresh the portal runs: its access token and its refresh cookie. */
  const refresh = (client, token) =>
    client.request(`${API}/user/auth`, { headers: { authorization: `Bearer ${token}` } });

  const register = async (username, email) => {
    const res = await browser(origin).request(`${API}/user`, {
      method: 'POST',
      body: { username, email, password: PASSWORD },
    });
    expect(res.status).toBe(200);
  };

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    Object.assign(process.env, ENV);
    mongod = await startMongod('user-sessions');
    await DataBaseProviderService.load({
      apis: ['user', 'file'],
      ...CONTEXT,
      db: { provider: 'mongoose', host: mongod.host, name: 'user-sessions' },
    });
    User = DataBaseProviderService.getModel('User', CONTEXT);
    const app = express();
    app.use(express.json());
    app.use(cookieParser(process.env.JWT_SECRET));
    app.use(
      `${API}/user`,
      UserRouter.router({ ...CONTEXT, apiPath: API, authMiddleware: authMiddlewareFactory(CONTEXT) }),
    );
    origin = await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
  });

  afterAll(async () => {
    server?.close();
    await mongod?.stop();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('stores only the hash of a refresh token, and rotates it on refresh', async () => {
    await register('rotor', 'rotor@sessions.test');
    const client = browser(origin);
    const token = await logIn(client, 'rotor@sessions.test');
    const first = client.cookies.get('refreshToken');
    const hashes = (await User.findOne({ email: 'rotor@sessions.test' }).lean()).activeSessions.map((s) => s.tokenHash);
    expect(hashes).toContain(hashToken(first));
    expect(hashes).not.toContain(first);

    expect((await refresh(client, token)).status).toBe(200);
    const second = client.cookies.get('refreshToken');
    expect(second).not.toBe(first);
    const stale = browser(origin);
    stale.cookies.set('refreshToken', first);
    expect((await refresh(stale, token)).status).not.toBe(200);
  });

  it('ends a session idle past the life of its cookie', async () => {
    await register('sleeper', 'sleeper@sessions.test');
    const client = browser(origin);
    const token = await logIn(client, 'sleeper@sessions.test');
    await User.updateOne(
      { email: 'sleeper@sessions.test' },
      { $set: { 'activeSessions.$[].expiresAt': new Date(Date.now() - 2 * 60 * 60 * 1000) } },
    );
    expect((await refresh(client, token)).status).not.toBe(200);
    expect((await User.findOne({ email: 'sleeper@sessions.test' }).lean()).activeSessions).toHaveLength(1);
  });

  it('keeps the newest sessions of a user within the bound, and logs one out', async () => {
    await register('roamer', 'roamer@sessions.test');
    const clients = Array.from({ length: 11 }, () => browser(origin));
    const tokens = [];
    for (const client of clients) tokens.push(await logIn(client, 'roamer@sessions.test'));
    const sessions = (await User.findOne({ email: 'roamer@sessions.test' }).lean()).activeSessions;
    expect(sessions.map((s) => s.tokenHash)).toEqual(
      clients.slice(1).map((client) => hashToken(client.cookies.get('refreshToken'))),
    );

    const token = tokens[10];
    const logout = await clients[10].request(`${API}/user/logout`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.status).toBe(200);
    expect((await User.findOne({ email: 'roamer@sessions.test' }).lean()).activeSessions).toHaveLength(9);
  });

  it('checks the new password of a recovery and ends every session', async () => {
    await register('forgetful', 'forgetful@sessions.test');
    await logIn(browser(origin), 'forgetful@sessions.test');
    await User.updateOne({ email: 'forgetful@sessions.test' }, { recoverTimeOut: new Date(Date.now() + 60000) });
    const recover = (password) =>
      browser(origin).request(`${API}/user/recover/${jwtSign({ email: 'forgetful@sessions.test' }, CONTEXT, 15)}`, {
        method: 'PUT',
        body: { password },
      });
    expect((await recover('weak')).status).not.toBe(200);
    expect((await User.findOne({ email: 'forgetful@sessions.test' }).lean()).activeSessions).toHaveLength(2);

    expect((await recover('N3w!Passw0rd')).status).toBe(200);
    expect((await User.findOne({ email: 'forgetful@sessions.test' }).lean()).activeSessions).toEqual([]);
  });
});
