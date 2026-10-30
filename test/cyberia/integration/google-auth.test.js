/**
 * Google sign-in against a real MongoDB and the real Express routers, with Google played by
 * stubs of its token and userinfo endpoints. The authorization request, the state cookie, PKCE,
 * the account resolution and linking, the one-time ticket and the session it opens all run for real.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { OAuth2 } from 'oauth';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { authMiddlewareFactory } from '../../../src/server/security/auth.js';
import { apiPathOf } from '../../../src/server/domain/api-contract.js';
import { UserDto } from '../../../src/api/user/user.model.js';
import { UserRouter } from '../../../src/api/user/user.router.js';
import { GoogleAuthRouter } from '../../../src/api/google-auth/google-auth.router.js';
import { GoogleAuthService } from '../../../src/api/google-auth/google-auth.service.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const A = { host: 'a.test', path: '/' };
const B = { host: 'b.test', path: '/' };
const API = apiPathOf('/');
const PASSWORD = 'Str0ng!Passw0rd';
const MINUTE = 60 * 1000;

const ENV = {
  JWT_SECRET: 'google-auth-test-jwt-secret',
  ACCESS_EXPIRE_MINUTES: '60',
  REFRESH_EXPIRE_MINUTES: '60',
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALLBACK_URL: undefined,
  DISABLE_API_RATE_LIMIT: 'true',
};
const saved = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));
const setEnv = (values) => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

/** Google's side: one-time codes bound to a PKCE challenge, and the userinfo of each access token. */
const google = { codes: new Map(), userinfo: new Map(), exchanges: [] };

let nextSubject = 100000000000000000000n;
const subject = () => `${++nextSubject}`;
const claimsOf = (sub, email, extra = {}) => ({
  sub,
  email,
  email_verified: true,
  name: 'Ana López',
  given_name: 'Ana',
  ...extra,
});

const servers = [];
const listen = (context) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser(process.env.JWT_SECRET));
  const options = { ...context, apiPath: API, authMiddleware: authMiddlewareFactory(context) };
  app.use(`${API}/user`, UserRouter.router(options));
  app.use(`${API}/google-auth`, GoogleAuthRouter.router(options));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    servers.push(server);
  });
};

/** A browser: it keeps its cookies and never follows a redirect. */
const browser = (origin) => {
  const cookies = new Map();
  const request = async (path, { body, headers, ...init } = {}) => {
    const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const res = await fetch(`${origin}${path}`, {
      redirect: 'manual',
      ...init,
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: {
        'user-agent': 'google-auth-test',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';');
      const name = pair.slice(0, pair.indexOf('='));
      if (attributes.some((attribute) => /^\s*expires=Thu, 01 Jan 1970/i.test(attribute))) cookies.delete(name);
      else cookies.set(name, pair.slice(pair.indexOf('=') + 1));
    }
    return res;
  };
  return { cookies, request };
};

const setCookieOf = (res, name) => res.headers.getSetCookie().find((line) => line.startsWith(`${name}=`));
const returnOf = (res) => new URL(res.headers.get('location'), 'http://pwa.test');
const outcomeOf = (res) => returnOf(res).searchParams.get('google-auth');
const decodeJwt = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

/** Starts a flow, then plays the consent on Google's page for the given claims. */
const authorize = async (client, claims, view) => {
  const start = await client.request(`${API}/google-auth${view ? `?view=${view}` : ''}`);
  const request = new URL(start.headers.get('location'));
  const code = `code-${crypto.randomUUID()}`;
  google.codes.set(code, request.searchParams.get('code_challenge'));
  google.userinfo.set(`access-${code}`, claims);
  return { start, request, code, flow: request.searchParams.get('state') };
};

const callback = (client, params) => client.request(`${API}/google-auth/callback?${new URLSearchParams(params)}`);
const exchange = (client, flow) => client.request(`${API}/google-auth/session`, { method: 'POST', body: { flow } });
const link = (client, flow, token) =>
  client.request(`${API}/google-auth/link`, {
    method: 'POST',
    body: { flow },
    headers: { authorization: `Bearer ${token}` },
  });

/** A whole Google flow up to the callback's return. */
const consent = async (client, claims, view) => {
  const { code, flow } = await authorize(client, claims, view);
  return { flow, returned: await callback(client, { state: flow, code }) };
};

const signIn = async (client, claims) => {
  const { flow, returned } = await consent(client, claims);
  const session = await exchange(client, flow);
  return { flow, returned, session, body: await session.json() };
};

const register = (client, username, email) =>
  client.request(`${API}/user`, { method: 'POST', body: { username, email, password: PASSWORD } });

const logIn = async (client, email) => {
  const res = await client.request(`${API}/user/auth`, { method: 'POST', body: { email, password: PASSWORD } });
  return (await res.json()).data.token;
};

describe.skipIf(!mongodBinary)('Google sign-in', () => {
  let mongod;
  let originA;
  let originB;
  let User;
  let GoogleAuth;

  /** A password account, as sign-up makes it, in the confirmation state given. */
  const account = async (username, email, emailConfirmed) => {
    expect((await register(browser(originA), username, email)).status).toBe(200);
    await User.updateOne({ email }, { emailConfirmed });
    return await User.findOne({ email }).lean();
  };

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    setEnv(ENV);
    vi.spyOn(OAuth2.prototype, 'getOAuthAccessToken').mockImplementation(function (code, params, done) {
      google.exchanges.push({ code, params });
      const challenge = google.codes.get(code);
      google.codes.delete(code);
      const verified =
        challenge && crypto.createHash('sha256').update(`${params.code_verifier}`).digest('base64url') === challenge;
      if (!verified) return done({ statusCode: 400, data: '{"error":"invalid_grant"}' });
      done(null, `access-${code}`, undefined, { token_type: 'Bearer' });
    });
    vi.spyOn(OAuth2.prototype, 'get').mockImplementation(function (url, accessToken, done) {
      const claims = url === 'https://www.googleapis.com/oauth2/v3/userinfo' && google.userinfo.get(accessToken);
      if (!claims) return done({ statusCode: 401, data: '{"error":"invalid_token"}' });
      done(null, JSON.stringify(claims));
    });

    mongod = await startMongod('google-auth');
    for (const [context, name] of [
      [A, 'google-auth-a'],
      [B, 'google-auth-b'],
    ])
      await DataBaseProviderService.load({
        apis: ['user', 'file', 'google-auth'],
        ...context,
        db: { provider: 'mongoose', host: mongod.host, name },
      });
    User = DataBaseProviderService.getModel('User', A);
    GoogleAuth = DataBaseProviderService.getModel('GoogleAuth', A);
    originA = await listen(A);
    originB = await listen(B);
    await vi.waitFor(async () => {
      expect((await GoogleAuth.collection.indexes()).map((index) => index.name)).toContain('subject_1');
      expect((await User.collection.indexes()).map((index) => index.name)).toEqual(
        expect.arrayContaining(['email_1', 'username_1']),
      );
    });
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    for (const context of [A, B]) {
      await DataBaseProviderService.getProvider(context).close();
      delete DataBaseProviderService.instance[`${context.host}${context.path}`];
    }
    await mongod?.stop();
    setEnv(saved);
  });

  afterEach(() => {
    google.exchanges.length = 0;
    vi.mocked(Date.now).mockRestore?.();
  });

  describe('the OAuth flow', () => {
    it('starts the authorization code flow with PKCE, the identity scopes and a state cookie of its own', async () => {
      const client = browser(originA);
      const { start, request, flow } = await authorize(client, claimsOf(subject(), 'start@gmail.com'));
      expect(start.status).toBe(302);
      expect(`${request.origin}${request.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(Object.fromEntries(request.searchParams)).toMatchObject({
        response_type: 'code',
        client_id: ENV.GOOGLE_CLIENT_ID,
        redirect_uri: 'https://a.test/api/v1/google-auth/callback',
        scope: 'openid email profile',
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      expect(request.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(flow).toMatch(/^[0-9a-f]{48}$/);
      expect(request.searchParams.has('access_type')).toBe(false);
      expect(request.searchParams.has('client_secret')).toBe(false);

      const stateCookie = setCookieOf(start, `googleAuthState-${flow}`);
      expect(stateCookie).toMatch(/HttpOnly/);
      expect(stateCookie).toMatch(/SameSite=Lax/);
      expect(stateCookie).toMatch(/Path=\/api\/v1\/google-auth/);
      expect(stateCookie).toMatch(/Max-Age=600/);
      expect(decodeURIComponent(stateCookie)).not.toContain(request.searchParams.get('code_challenge'));
    });

    it('rejects a callback from another browser, a forged state and an expired request, before the code exchange', async () => {
      const owner = browser(originA);
      const sub = subject();
      const { code, flow } = await authorize(owner, claimsOf(sub, 'state@gmail.com'));

      const otherBrowser = await callback(browser(originA), { state: flow, code });
      const forged = await callback(owner, { state: 'f'.repeat(48), code });

      const late = browser(originA);
      const expiring = await authorize(late, claimsOf(sub, 'state@gmail.com'));
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * MINUTE);
      const expired = await callback(late, { state: expiring.flow, code: expiring.code });
      vi.mocked(Date.now).mockRestore();

      for (const res of [otherBrowser, forged, expired]) {
        expect(outcomeOf(res)).toBe('error');
        expect(res.headers.getSetCookie().some((line) => line.startsWith('googleAuthTicket'))).toBe(false);
      }
      expect(google.exchanges).toEqual([]);
      expect(await GoogleAuth.exists({ subject: sub })).toBeNull();
    });

    it('rejects a replayed callback, even with the state cookie it once carried', async () => {
      const client = browser(originA);
      const { code, flow } = await authorize(client, claimsOf(subject(), 'replay@gmail.com'));
      const stateCookie = client.cookies.get(`googleAuthState-${flow}`);
      expect(outcomeOf(await callback(client, { state: flow, code }))).toBe('success');
      await exchange(client, flow);

      client.cookies.set(`googleAuthState-${flow}`, stateCookie);
      const replayed = await callback(client, { state: flow, code });
      expect(outcomeOf(replayed)).toBe('error');
      expect(setCookieOf(replayed, `googleAuthTicket-${flow}`)).toBeUndefined();
    });

    it('returns a cancelled consent to the view it started from, with no session', async () => {
      const client = browser(originA);
      const { flow } = await authorize(client, claimsOf(subject(), 'cancel@gmail.com'), 'sign-up');
      const cancelled = await callback(client, { error: 'access_denied', state: flow });
      expect(cancelled.headers.get('location')).toBe('/sign-up?google-auth=cancelled');
      expect(client.cookies.has(`googleAuthState-${flow}`)).toBe(false);
      expect((await exchange(client, flow)).status).toBe(401);
      expect(await User.exists({ email: 'cancel@gmail.com' })).toBeNull();
    });

    it('keeps parallel flows of one browser apart', async () => {
      const client = browser(originA);
      const first = await authorize(client, claimsOf(subject(), 'tab-one@gmail.com'));
      const second = await authorize(client, claimsOf(subject(), 'tab-two@gmail.com'));
      expect(outcomeOf(await callback(client, { state: first.flow, code: first.code }))).toBe('success');
      expect(outcomeOf(await callback(client, { state: second.flow, code: second.code }))).toBe('success');
      expect((await (await exchange(client, second.flow)).json()).data.user.email).toBe('tab-two@gmail.com');
      expect((await (await exchange(client, first.flow)).json()).data.user.email).toBe('tab-one@gmail.com');
    });

    it('exchanges a ticket once, and refuses an expired or missing one', async () => {
      const client = browser(originA);
      const sub = subject();
      const { flow } = await consent(client, claimsOf(sub, 'ticket@gmail.com'));
      const ticket = client.cookies.get(`googleAuthTicket-${flow}`);
      expect((await exchange(client, flow)).status).toBe(200);

      client.cookies.set(`googleAuthTicket-${flow}`, ticket);
      const replayed = await exchange(client, flow);
      expect(replayed.status).toBe(401);
      expect(await replayed.json()).toEqual({ status: 'error', message: 'The sign-in ticket is invalid or expired' });
      expect((await User.findOne({ email: 'ticket@gmail.com' }).lean()).activeSessions).toHaveLength(1);

      const late = browser(originA);
      const again = await consent(late, claimsOf(sub, 'ticket@gmail.com'));
      await GoogleAuth.updateOne({ subject: sub }, { ticketExpiresAt: new Date(Date.now() - 1000) });
      expect((await exchange(late, again.flow)).status).toBe(401);
      expect((await GoogleAuth.findOne({ subject: sub }).lean()).ticketHash).toBeUndefined();

      expect((await exchange(browser(originA), again.flow)).status).toBe(401);
    });

    it('keeps every step on the database of the host that serves it', async () => {
      const client = browser(originA);
      const { code, flow } = await authorize(client, claimsOf(subject(), 'host@gmail.com'));
      const returned = await callback(client, { state: flow, code, host: 'b.test', path: '/other' });
      expect(outcomeOf(returned)).toBe('success');
      expect(await User.exists({ email: 'host@gmail.com' })).not.toBeNull();
      expect(await DataBaseProviderService.getModel('User', B).exists({ email: 'host@gmail.com' })).toBeNull();

      const other = browser(originB);
      other.cookies.set(`googleAuthTicket-${flow}`, client.cookies.get(`googleAuthTicket-${flow}`));
      expect((await exchange(other, flow)).status).toBe(401);
      expect((await exchange(client, flow)).status).toBe(200);
    });

    it('refuses to mount on a host without OAuth credentials', () => {
      setEnv({ GOOGLE_CLIENT_ID: undefined });
      expect(() => GoogleAuthRouter.router({ ...A, apiPath: API })).toThrow(/key=GOOGLE_CLIENT_ID reason=missing/);
      setEnv(ENV);
    });

    it('keeps the OAuth client of each host apart', async () => {
      setEnv({ GOOGLE_CLIENT_ID: 'other-client.apps.googleusercontent.com' });
      const originOther = await listen(B);
      setEnv(ENV);
      const clientOf = async (origin) =>
        Object.fromEntries(
          (await authorize(browser(origin), claimsOf(subject(), 'apart@gmail.com'))).request.searchParams,
        );
      expect(await clientOf(originOther)).toMatchObject({
        client_id: 'other-client.apps.googleusercontent.com',
        redirect_uri: 'https://b.test/api/v1/google-auth/callback',
      });
      expect(await clientOf(originA)).toMatchObject({
        client_id: ENV.GOOGLE_CLIENT_ID,
        redirect_uri: 'https://a.test/api/v1/google-auth/callback',
      });
    });

    it('limits sign-in attempts per client', async () => {
      setEnv({ DISABLE_API_RATE_LIMIT: undefined });
      const origin = await listen(A);
      setEnv(ENV);
      const client = browser(origin);
      for (let attempt = 0; attempt < 30; attempt++)
        expect((await client.request(`${API}/google-auth`)).headers.get('location')).toMatch(
          /^https:\/\/accounts\.google\.com\//,
        );
      expect((await client.request(`${API}/google-auth`)).headers.get('location')).toBe('/log-in?google-auth=error');
      expect((await exchange(client, 'f'.repeat(48))).status).toBe(429);
    });
  });

  describe('account resolution', () => {
    it('creates a registered user on the first sign-in and answers the contract of a password log-in', async () => {
      const client = browser(originA);
      const sub = subject();
      const { flow, returned, session, body } = await signIn(
        client,
        claimsOf(sub, 'Zoe@Gmail.com', { name: 'Zoë Ray', given_name: 'Zoë' }),
      );

      expect(returned.headers.get('location')).toBe(`/?google-auth=success&google-auth-flow=${flow}`);
      expect(setCookieOf(returned, `googleAuthTicket-${flow}`)).toMatch(/HttpOnly/);
      expect(client.cookies.has(`googleAuthState-${flow}`)).toBe(false);
      const [{ params }] = google.exchanges;
      expect(params).toMatchObject({
        grant_type: 'authorization_code',
        redirect_uri: 'https://a.test/api/v1/google-auth/callback',
      });
      expect(params.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);

      expect(session.status).toBe(200);
      expect(Object.keys(body.data).sort()).toEqual(['token', 'user']);
      expect(Object.keys(body.data.user).every((key) => key in UserDto.select.get())).toBe(true);
      expect(body.data.user).toMatchObject({
        username: 'zoe',
        email: 'zoe@gmail.com',
        role: 'user',
        emailConfirmed: true,
      });
      expect(client.cookies.has('refreshToken')).toBe(true);

      const user = await User.findById(body.data.user._id).lean();
      expect(user.password).toBeUndefined();
      expect(user.lastLoginDate).toBeInstanceOf(Date);
      const payload = decodeJwt(body.data.token);
      expect(payload).toMatchObject({
        _id: `${user._id}`,
        role: 'user',
        email: 'zoe@gmail.com',
        host: 'a.test',
        path: '/',
      });
      expect(user.activeSessions.map((entry) => `${entry._id}`)).toEqual([payload.jwtid]);

      const identity = await GoogleAuth.findOne({ subject: sub }).lean();
      expect(`${identity.userId}`).toBe(`${user._id}`);
      expect(identity.ticketHash).toBeUndefined();
      expect(JSON.stringify(identity)).not.toContain('access-');
    });

    it('confirms the email of a new account only when Google is the authority for it', async () => {
      const { body } = await signIn(browser(originA), claimsOf(subject(), 'new@company.test'));
      expect(body.data.user).toMatchObject({ email: 'new@company.test', emailConfirmed: false });
    });

    it('serves the session like any other: authenticated requests, refresh and logout', async () => {
      const client = browser(originA);
      const { body } = await signIn(client, claimsOf(subject(), 'session@gmail.com'));
      const bearer = { authorization: `Bearer ${body.data.token}` };

      const refreshed = await client.request(`${API}/user/auth`, { headers: bearer });
      const refreshedBody = await refreshed.json();
      expect(refreshed.status).toBe(200);
      expect(refreshedBody.data.user._id).toBe(body.data.user._id);
      expect(decodeJwt(refreshedBody.data.token).jwtid).toBe(decodeJwt(body.data.token).jwtid);

      const out = await client.request(`${API}/user/logout`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${refreshedBody.data.token}` },
      });
      expect(out.status).toBe(200);
      expect((await User.findById(body.data.user._id).lean()).activeSessions).toEqual([]);
    });

    it('resolves a linked Google account by its subject, whatever its email is now', async () => {
      const sub = subject();
      const first = await signIn(browser(originA), claimsOf(sub, 'old@gmail.com'));
      const users = await User.countDocuments();
      const second = await signIn(browser(originA), claimsOf(sub, 'renamed@gmail.com'));
      expect(second.body.data.user).toMatchObject({ _id: first.body.data.user._id, email: 'old@gmail.com' });
      expect(await User.countDocuments()).toBe(users);
      expect((await GoogleAuth.findOne({ subject: sub })).email).toBe('renamed@gmail.com');
    });

    it('links a confirmed account whose Gmail address Google verified, and keeps the account as it was', async () => {
      // The reported case: a confirmed password account of a Gmail address, first time with Google.
      const before = await account('veteran', 'veteran.player@gmail.com', true);
      const users = await User.countDocuments();
      const { returned, body } = await signIn(browser(originA), claimsOf(subject(), 'Veteran.Player@gmail.com'));

      expect(outcomeOf(returned)).toBe('success');
      expect(body.data.user).toMatchObject({ _id: `${before._id}`, username: 'veteran', role: 'user' });
      expect(await User.countDocuments()).toBe(users);
      const after = await User.findById(before._id).lean();
      expect(after.password).toBe(before.password);
      expect(`${(await GoogleAuth.findOne({ userId: before._id })).userId}`).toBe(`${before._id}`);
      expect(await logIn(browser(originA), 'veteran.player@gmail.com')).toBeTruthy();
    });

    it('links a Workspace address when Google asserts its domain, and asks for a log-in otherwise', async () => {
      const workspace = await account('workspace', 'lead@studio.test', true);
      const asserted = await signIn(browser(originA), claimsOf(subject(), 'lead@studio.test', { hd: 'studio.test' }));
      expect(asserted.body.data.user._id).toBe(`${workspace._id}`);

      await account('outside', 'player@outside.test', true);
      const { returned } = await signIn(browser(originA), claimsOf(subject(), 'player@outside.test'));
      expect(outcomeOf(returned)).toBe('link');
    });

    it('asks the owner of an unconfirmed account to log in, then links and confirms it', async () => {
      const before = await account('pending', 'pending.owner@gmail.com', false);
      const users = await User.countDocuments();
      const client = browser(originA);
      const sub = subject();
      const { flow, returned } = await consent(client, claimsOf(sub, 'pending.owner@gmail.com'));

      expect(returned.headers.get('location')).toBe(`/log-in?google-auth=link&google-auth-flow=${flow}`);
      expect(setCookieOf(returned, `googleAuthLink-${flow}`)).toMatch(/HttpOnly/);
      expect(setCookieOf(returned, `googleAuthTicket-${flow}`)).toBeUndefined();
      expect(await GoogleAuth.exists({ subject: sub })).toBeNull();
      expect(await User.countDocuments()).toBe(users);
      expect((await exchange(client, flow)).status).toBe(401);

      expect((await client.request(`${API}/google-auth/link`, { method: 'POST', body: { flow } })).status).toBe(401);
      const linked = await link(client, flow, await logIn(client, 'pending.owner@gmail.com'));
      expect(linked.status).toBe(200);
      expect((await linked.json()).data.user).toMatchObject({ _id: `${before._id}`, emailConfirmed: true });
      expect((await User.findById(before._id).lean()).password).toBe(before.password);

      const again = await signIn(browser(originA), claimsOf(sub, 'pending.owner@gmail.com'));
      expect(again.body.data.user._id).toBe(`${before._id}`);
    });

    it('links only from a recent log-in, and a repeated link changes nothing', async () => {
      await account('stale', 'stale.session@gmail.com', false);
      const client = browser(originA);
      const token = await logIn(client, 'stale.session@gmail.com');

      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * MINUTE);
      const { flow } = await consent(client, claimsOf(subject(), 'stale.session@gmail.com'));
      const stale = await link(client, flow, token);
      vi.mocked(Date.now).mockRestore();
      expect(stale.status).toBe(401);
      expect((await stale.json()).message).toBe('Log in again to link your Google account');

      const freshSubject = subject();
      const fresh = await consent(client, claimsOf(freshSubject, 'stale.session@gmail.com'));
      const freshToken = await logIn(client, 'stale.session@gmail.com');
      const cookie = client.cookies.get(`googleAuthLink-${fresh.flow}`);
      expect((await link(client, fresh.flow, freshToken)).status).toBe(200);
      client.cookies.set(`googleAuthLink-${fresh.flow}`, cookie);
      expect((await link(client, fresh.flow, freshToken)).status).toBe(200);
      expect(await GoogleAuth.countDocuments({ subject: freshSubject })).toBe(1);
    });

    it('never moves a Google account between users, nor gives a user a second one', async () => {
      const owner = await account('owner', 'owner.one@gmail.com', true);
      await signIn(browser(originA), claimsOf(subject(), 'owner.one@gmail.com'));
      const second = await signIn(browser(originA), claimsOf(subject(), 'owner.one@gmail.com'));
      expect(outcomeOf(second.returned)).toBe('conflict');
      expect(await GoogleAuth.countDocuments({ userId: owner._id })).toBe(1);

      const other = await account('other', 'other.one@gmail.com', false);
      const third = await account('third', 'third.one@example.com', true);
      const client = browser(originA);
      const claimed = subject();
      const pending = await consent(client, claimsOf(claimed, 'other.one@gmail.com'));
      await GoogleAuth.create({
        subject: claimed,
        userId: third._id,
        email: 'third.one@example.com',
        emailVerified: true,
      });
      expect((await link(client, pending.flow, await logIn(client, 'other.one@gmail.com'))).status).toBe(409);
      expect(`${(await GoogleAuth.findOne({ subject: claimed })).userId}`).toBe(`${third._id}`);

      const again = await consent(client, claimsOf(subject(), 'other.one@gmail.com'));
      await GoogleAuth.create({
        subject: subject(),
        userId: other._id,
        email: 'other.one@gmail.com',
        emailVerified: true,
      });
      expect((await link(client, again.flow, await logIn(client, 'other.one@gmail.com'))).status).toBe(409);
      expect(await GoogleAuth.countDocuments({ userId: other._id })).toBe(1);
    });

    it('links nothing when several accounts hold one email', async () => {
      const UserB = DataBaseProviderService.getModel('User', B);
      await UserB.collection.dropIndex('email_1');
      await UserB.collection.insertMany([
        { username: 'twin-a', email: 'twin@gmail.com', emailConfirmed: true },
        { username: 'twin-b', email: 'twin@gmail.com', emailConfirmed: true },
      ]);
      const { returned } = await signIn(browser(originB), claimsOf(subject(), 'twin@gmail.com'));
      expect(outcomeOf(returned)).toBe('link');
      expect(await UserB.countDocuments({ email: 'twin@gmail.com' })).toBe(2);
      await UserB.deleteMany({ email: 'twin@gmail.com' });
      await UserB.createIndexes();
    });

    it('creates no account for an email that Google did not verify', async () => {
      const claims = claimsOf(subject(), 'unverified@gmail.com', { email_verified: false });
      const { returned, session } = await signIn(browser(originA), claims);
      expect(outcomeOf(returned)).toBe('unverified-email');
      expect(session.status).toBe(401);
      expect(await User.exists({ email: 'unverified@gmail.com' })).toBeNull();
    });

    it('gives a new user to a Google account whose user was deleted', async () => {
      const sub = subject();
      const first = await signIn(browser(originA), claimsOf(sub, 'deleted@gmail.com'));
      await User.deleteOne({ _id: first.body.data.user._id });
      const second = await signIn(browser(originA), claimsOf(sub, 'deleted@gmail.com'));
      expect(second.body.data.user._id).not.toBe(first.body.data.user._id);
      expect(await GoogleAuth.countDocuments({ subject: sub })).toBe(1);
    });

    it('makes one user of concurrent first sign-ins, and one link of concurrent automatic links', async () => {
      const profile = (id, email) => ({
        id,
        displayName: 'Race Runner',
        name: { givenName: 'Race' },
        emails: [{ value: email, verified: true }],
      });
      const fresh = profile(subject(), 'race@gmail.com');
      const created = await Promise.all(Array.from({ length: 8 }, () => GoogleAuthService.resolve(fresh, A)));
      expect(new Set(created.map(({ identity }) => `${identity.userId}`)).size).toBe(1);
      expect(await User.countDocuments({ email: 'race@gmail.com' })).toBe(1);

      const existing = await account('racer', 'racer@gmail.com', true);
      const linkedSub = subject();
      const linked = await Promise.all(
        Array.from({ length: 8 }, () => GoogleAuthService.resolve(profile(linkedSub, 'racer@gmail.com'), A)),
      );
      expect(linked.every(({ identity }) => `${identity.userId}` === `${existing._id}`)).toBe(true);
      expect(await GoogleAuth.countDocuments({ subject: linkedSub })).toBe(1);
      expect(await User.countDocuments({ email: 'racer@gmail.com' })).toBe(1);
    });

    it('gives a new account a free username when its name is taken', async () => {
      const { body } = await signIn(browser(originA), claimsOf(subject(), 'ana.two@gmail.com'));
      expect(body.data.user.username).toMatch(/^ana-[0-9a-f]{4}$/);
    });
  });

  describe('password accounts', () => {
    it('keeps sign-up and log-in, and refuses a password for a Google-only account', async () => {
      const client = browser(originA);
      const noPassword = await client.request(`${API}/user`, {
        method: 'POST',
        body: { username: 'nopassword', email: 'nopassword@example.com' },
      });
      expect(noPassword.status).toBe(400);
      expect((await noPassword.json()).message).toBe('Password is required');

      await account('localuser', 'local@example.com', false);
      expect(await logIn(client, 'local@example.com')).toBeTruthy();

      const googleOnly = await client.request(`${API}/user/auth`, {
        method: 'POST',
        body: { email: 'zoe@gmail.com', password: PASSWORD },
      });
      expect(googleOnly.status).toBe(400);
      expect((await googleOnly.json()).message).toMatch(/^Invalid credentials/);
    });

    it('keeps email and username unique, whatever the case of the email or the timing', async () => {
      const client = browser(originA);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) => register(client, `racer${index}`, `Same.Email@example.com`)),
      );
      expect(results.map(({ status }) => status).sort()).toEqual([200, 409, 409, 409, 409, 409]);
      expect(await User.countDocuments({ email: 'same.email@example.com' })).toBe(1);

      const duplicateEmail = await register(client, 'another', 'same.email@EXAMPLE.com');
      expect(duplicateEmail.status).toBe(409);
      expect((await duplicateEmail.json()).message).toBe('duplicate email');
      const duplicateName = await register(client, 'localuser', 'other.local@example.com');
      expect((await duplicateName.json()).message).toBe('duplicate username');
    });

    it('refuses a profile update to a taken username and keeps the profile', async () => {
      const client = browser(originA);
      const token = await logIn(client, 'local@example.com');
      const user = await User.findOne({ email: 'local@example.com' }).lean();
      const res = await client.request(`${API}/user/${user._id}`, {
        method: 'PUT',
        body: { username: 'veteran' },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(409);
      expect((await res.json()).message).toBe('duplicate username');
      expect((await User.findById(user._id).lean()).username).toBe('localuser');
    });
  });
});
