/**
 * The user API against a real MongoDB and the real user router: public profiles, the mailer and
 * recovery links, the administrator's views, the login lockout, profile updates and deletion.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { authMiddlewareFactory, jwtSign } from '../../../src/server/security/auth.js';
import { apiPathOf } from '../../../src/server/domain/api-contract.js';
import { UserRouter } from '../../../src/api/user/user.router.js';
import { MailerProvider } from '../../../src/mailer/MailerProvider.js';
import { resolveHostKeyContext } from '../../../src/server/runtime/conf.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const CONTEXT = { host: 'users.test', path: '/' };
const API = apiPathOf('/');
const PASSWORD = 'Str0ng!Passw0rd';
const ENV = {
  JWT_SECRET: 'user-api-test-jwt-secret',
  ACCESS_EXPIRE_MINUTES: '60',
  REFRESH_EXPIRE_MINUTES: '60',
  DISABLE_API_RATE_LIMIT: 'true',
  DEFAULT_ADMIN_EMAIL: 'root@users.test',
  DEFAULT_ADMIN_PASSWORD: PASSWORD,
};
const saved = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));

/** A browser that keeps its cookies and its access token. */
const browser = (origin) => {
  const cookies = new Map();
  let token = '';
  const request = async (path, { body, headers, ...init } = {}) => {
    const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const res = await fetch(`${origin}${path}`, {
      ...init,
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: {
        'user-agent': 'user-api-test',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
    }
    return res;
  };
  const json = async (path, init) => {
    const res = await request(path, init);
    return { status: res.status, body: await res.json() };
  };
  const logIn = async (email, password = PASSWORD) => {
    const result = await json(`${API}/user/auth`, { method: 'POST', body: { email, password } });
    if (result.status === 200) token = result.body.data.token;
    return result;
  };
  return { request, json, logIn };
};

describe.skipIf(!mongodBinary)('user API', () => {
  let mongod;
  let server;
  let origin;
  let User;
  let File;

  const register = async (username, email) => {
    const res = await browser(origin).request(`${API}/user`, {
      method: 'POST',
      body: { username, email, password: PASSWORD },
    });
    expect(res.status).toBe(200);
    return User.findOne({ email });
  };

  const signedIn = async (username, email) => {
    const user = await register(username, email);
    const client = browser(origin);
    expect((await client.logIn(email)).status).toBe(200);
    return { client, user };
  };

  const admin = async () => {
    const client = browser(origin);
    expect((await client.logIn(ENV.DEFAULT_ADMIN_EMAIL)).status).toBe(200);
    return client;
  };

  const png = async (path) => {
    const res = await browser(origin).request(path);
    expect(res.headers.get('content-type')).toBe('image/png');
    return Buffer.from(await res.arrayBuffer());
  };

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    Object.assign(process.env, ENV);
    mongod = await startMongod('user-api');
    await DataBaseProviderService.load({
      apis: ['user', 'file'],
      ...CONTEXT,
      db: { provider: 'mongoose', host: mongod.host, name: 'user-api' },
    });
    User = DataBaseProviderService.getModel('User', CONTEXT);
    File = DataBaseProviderService.getModel('File', CONTEXT);
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
    // The router creates the first administrator in the background.
    await vi.waitFor(async () => expect(await User.findOne({ role: 'admin' })).toBeTruthy(), { timeout: 15000 });
  });

  afterAll(async () => {
    server?.close();
    await mongod?.stop();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('serves a public profile only, and the same answer for an invalid and an unknown username', async () => {
    await register('hidden', 'hidden@users.test');
    const shown = await register('shown', 'shown@users.test');
    await User.updateOne({ _id: shown._id }, { publicProfile: true, briefDescription: 'Maker' });
    const client = browser(origin);

    expect((await client.json(`${API}/user/username/not a name!`)).status).toBe(404);
    expect((await client.json(`${API}/user/username/nobody`)).status).toBe(404);
    expect(await client.json(`${API}/user/username/hidden`)).toMatchObject({
      status: 403,
      body: { message: 'Public profile is private' },
    });
    const profile = await client.json(`${API}/user/username/shown`);
    expect(profile.status).toBe(200);
    expect(profile.body.data).toMatchObject({ username: 'shown', briefDescription: 'Maker' });
    expect(profile.body.data.password).toBeUndefined();
  });

  it('serves the mailer images: an asset, a recovery link and an email confirmation', async () => {
    const avatar = await png(`${API}/user/assets/avatar`);
    expect(avatar.length).toBeGreaterThan(0);
    const invalid = await png(`${API}/user/recover/not-a-token`);
    expect(await png(`${API}/user/mailer/not-a-token`)).toEqual(invalid);
    // A valid token for an address no account holds answers like an invalid one.
    expect(await png(`${API}/user/recover/${jwtSign({ email: 'nobody@users.test' }, CONTEXT, 15)}`)).toEqual(invalid);
    expect(await png(`${API}/user/mailer/${jwtSign({ email: 'nobody@users.test' }, CONTEXT, 15)}`)).toEqual(invalid);

    const user = await register('linker', 'linker@users.test');
    const recover = await png(`${API}/user/recover/${jwtSign({ email: user.email }, CONTEXT, 15)}`);
    expect(recover).not.toEqual(invalid);
    expect((await User.findById(user._id)).recoverTimeOut.getTime()).toBeGreaterThan(Date.now());

    const check = await png(`${API}/user/mailer/${jwtSign({ email: user.email }, CONTEXT, 15)}`);
    expect(check).not.toEqual(invalid);
    expect((await User.findById(user._id)).emailConfirmed).toBe(true);
  });

  it('sends the recovery and the verification mails through the host mailer', async () => {
    const id = resolveHostKeyContext(CONTEXT);
    const words = { H1: { en: 'Title' }, P1: { en: 'Body' }, BTN_LABEL: { en: 'Go' } };
    MailerProvider.instance[id] = {
      translateTemplates: { recoverEmail: words, confirmEmail: words },
      templates: { userRecoverEmail: '{{H1}} {{TOKEN}} {{RECOVER_WEB_URL}}', userVerifyEmail: '{{H1}} {{TOKEN}}' },
    };
    const send = vi.spyOn(MailerProvider, 'send').mockResolvedValue(true);
    try {
      const { client } = await signedIn('mailed', 'mailed@users.test');
      const recovery = await client.json(`${API}/user/recover-verify-email`, {
        method: 'POST',
        body: { email: 'mailed@users.test', hostname: 'users.test', proxyPath: '/' },
      });
      expect(recovery).toMatchObject({ status: 200, body: { data: { message: 'email send successfully' } } });
      expect(send.mock.calls[0][0].sendOptions.html).toContain('https://users.test/recover?payload=');

      expect(
        (await client.json(`${API}/user/mailer/verify-email`, { method: 'POST', body: { email: 'not-an-email' } })).body
          .message,
      ).toBe('invalid email');
      const verify = await client.json(`${API}/user/mailer/verify-email`, {
        method: 'POST',
        body: { email: 'renamed@users.test', hostname: 'users.test' },
      });
      expect(verify.status).toBe(200);
      expect(send.mock.calls.at(-1)[0].sendOptions.to).toBe('renamed@users.test');
      expect((await User.findOne({ username: 'mailed' })).email).toBe('renamed@users.test');

      await User.updateOne({ username: 'mailed' }, { emailConfirmed: true });
      expect(
        (
          await client.json(`${API}/user/mailer/verify-email`, {
            method: 'POST',
            body: { email: 'renamed@users.test' },
          })
        ).body.message,
      ).toBe('email already confirmed');

      send.mockResolvedValue(false);
      expect(
        (
          await client.json(`${API}/user/recover-verify-email`, {
            method: 'POST',
            body: { email: 'renamed@users.test', hostname: 'users.test', proxyPath: '/' },
          })
        ).body.message,
      ).toBe('email send error');
    } finally {
      send.mockRestore();
      delete MailerProvider.instance[id];
    }
  });

  it('lets an administrator list, read, update and delete any account, and a user only their own', async () => {
    const { client, user } = await signedIn('plain', 'plain@users.test');
    const other = await register('other', 'other@users.test');
    const root = await admin();

    const all = await root.json(`${API}/user/all?limit=2&page=1`);
    expect(all.status).toBe(200);
    expect(all.body.data).toMatchObject({ page: 1, limit: 2 });
    expect(all.body.data.data).toHaveLength(2);
    expect(all.body.data.total).toBeGreaterThanOrEqual(3);
    expect((await client.json(`${API}/user/all`)).body.message).toBe('Invalid token user id');

    expect((await client.json(`${API}/user/${user._id}`)).body.data.username).toBe('plain');
    expect((await client.json(`${API}/user/${other._id}`)).body.message).toBe('Invalid token user id');
    expect((await root.json(`${API}/user/${other._id}`)).body.data.username).toBe('other');
    expect((await root.json(`${API}/user/email/other@users.test`)).body.data.username).toBe('other');

    const updated = await client.json(`${API}/user/${user._id}`, {
      method: 'PUT',
      body: { username: 'plainer', publicProfile: true, briefDescription: 'Writer', password: 'ignored' },
    });
    expect(updated.body.data).toMatchObject({ username: 'plainer', publicProfile: true, briefDescription: 'Writer' });
    expect((await client.json(`${API}/user/${user._id}`, { method: 'PUT', body: { username: 'other' } })).status).toBe(
      409,
    );
    expect(
      (await client.json(`${API}/user/${other._id}`, { method: 'PUT', body: { username: 'taken' } })).body.message,
    ).toBe('Invalid token user id');
    expect(
      (await root.json(`${API}/user/${other._id}`, { method: 'PUT', body: { briefDescription: 'Edited' } })).status,
    ).toBe(200);
    expect((await User.findById(other._id)).briefDescription).toBe('Edited');

    expect((await client.json(`${API}/user/${other._id}`, { method: 'DELETE' })).body.message).toBe(
      'Invalid token user id',
    );
    expect((await root.json(`${API}/user/${other._id}`, { method: 'DELETE' })).status).toBe(200);
    expect(await User.findById(other._id)).toBeNull();
    expect((await client.json(`${API}/user/${user._id}`, { method: 'DELETE' })).body.data.username).toBe('plainer');
    expect(await User.findById(user._id)).toBeNull();
  });

  it('counts failed logins, locks the account at the limit and lifts an expired lock', async () => {
    const user = await register('locked', 'locked@users.test');
    const client = browser(origin);
    expect((await client.logIn('nobody@users.test')).body.message).toBe('Invalid credentials');
    expect((await client.logIn(user.email, 'Wr0ng!Passw0rd')).body.message).toBe(
      'Invalid credentials. Remaining attempts: 5',
    );

    await User.updateOne({ _id: user._id }, { failedLoginAttempts: 5 });
    expect((await client.logIn(user.email, 'Wr0ng!Passw0rd')).body.message).toBe(
      'Account locked. Please try again in: 15 min.',
    );
    expect((await client.logIn(user.email, 'Wr0ng!Passw0rd')).body.message).toMatch(
      /^Account locked\. Please try again in: \d+ min\.$/,
    );
    // The right password does not open a locked account either.
    expect((await client.logIn(user.email)).body.message).toMatch(/^Account locked/);

    await User.updateOne({ _id: user._id }, { failedLoginAttempts: -(Date.now() + 30 * 1000) });
    expect((await client.logIn(user.email, 'Wr0ng!Passw0rd')).body.message).toMatch(
      /^Account locked\. Please try again in: \d+ s\.$/,
    );

    await User.updateOne({ _id: user._id }, { failedLoginAttempts: -(Date.now() - 1000) });
    expect((await client.logIn(user.email, 'Wr0ng!Passw0rd')).body.message).toBe(
      'Invalid credentials. Remaining attempts: 5',
    );
    expect((await User.findById(user._id)).failedLoginAttempts).toBe(1);
  });

  it('drops a profile image whose file is gone when the account logs in', async () => {
    const user = await register('pictured', 'pictured@users.test');
    const kept = await File.create({ name: 'kept.png', data: Buffer.from('png'), size: 3, mimetype: 'image/png' });
    await User.updateOne({ _id: user._id }, { profileImageId: kept._id.toString() });
    expect((await browser(origin).logIn(user.email)).body.data.user.profileImageId).toBe(kept._id.toString());

    await File.deleteOne({ _id: kept._id });
    expect((await browser(origin).logIn(user.email)).body.data.user.profileImageId).toBeNull();
    expect((await User.findById(user._id)).profileImageId).toBeNull();
  });

  it('refuses a token whose session does not match the request, the account or the clock', async () => {
    const user = await register('guarded', 'guarded@users.test');
    expect((await browser(origin).logIn(user.email)).status).toBe(200);
    // The address and the agent the server records for this client.
    const [{ ip, userAgent }] = (await User.findById(user._id)).activeSessions;
    const session = (values = {}) => ({
      _id: new mongoose.Types.ObjectId(),
      tokenHash: 'unused',
      ip,
      userAgent,
      host: CONTEXT.host,
      path: CONTEXT.path,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ...values,
    });
    const sessions = {
      ip: session({ ip: '10.9.9.9' }),
      agent: session({ userAgent: 'another-agent' }),
      host: session({ host: 'elsewhere.test' }),
      expired: session({ expiresAt: new Date(Date.now() - 1000) }),
      valid: session(),
    };
    await User.updateOne({ _id: user._id }, { $push: { activeSessions: { $each: Object.values(sessions) } } });
    const read = async (claims) => {
      const token = jwtSign({ _id: user._id.toString(), role: 'user', ...CONTEXT, ...claims }, CONTEXT);
      return (await browser(origin).json(`${API}/user/${user._id}`, { headers: { authorization: `Bearer ${token}` } }))
        .body.message;
    };

    expect(await read({ jwtid: new mongoose.Types.ObjectId().toString() })).toBe('unauthorized: invalid session');
    expect(await read({ jwtid: sessions.ip._id.toString() })).toBe('unauthorized: ip mismatch');
    expect(await read({ jwtid: sessions.agent._id.toString() })).toBe('unauthorized device');
    expect(await read({ jwtid: sessions.host._id.toString() })).toBe('unauthorized: host or path mismatch');
    expect(await read({ jwtid: sessions.expired._id.toString() })).toBe('unauthorized: session expired');
    expect(await read({ jwtid: sessions.valid._id.toString(), ip: '10.1.1.1' })).toBe('unauthorized: ip mismatch');
    expect(await read({ jwtid: sessions.valid._id.toString(), userAgent: 'another-agent' })).toBe(
      'unauthorized device',
    );

    const admin = await User.findOne({ role: 'admin' });
    await User.updateOne(
      { _id: user._id },
      {
        restriction: {
          kind: 'lock',
          reason: 'review',
          by: admin._id,
          at: new Date(),
          until: new Date(Date.now() + 3600000),
        },
      },
    );
    const restricted = await browser(origin).json(`${API}/user/${user._id}`, {
      headers: {
        authorization: `Bearer ${jwtSign({ _id: user._id.toString(), role: 'user', ...CONTEXT, jwtid: sessions.valid._id.toString() }, CONTEXT)}`,
      },
    });
    expect(restricted.status).toBe(403);

    const client = browser(origin);
    expect((await client.json(`${API}/user/${user._id}`)).body.message).toBe('unauthorized: token missing');
    expect(
      (await client.json(`${API}/user/${user._id}`, { headers: { authorization: 'Bearer not-a-token' } })).body.message,
    ).toBe('unauthorized');
  });
});
