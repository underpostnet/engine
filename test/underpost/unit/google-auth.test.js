import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { isValidUsername } from '../../../src/client/components/core/CommonJs.js';

// A sliced tree ships only the APIs of its default conf.
const googleAuthApi = fs.existsSync('./src/api/google-auth');
const describeGoogleAuth = describe.skipIf(!googleAuthApi);
const { GOOGLE_AUTH_SCOPES, googleAuthConfig, googleClaims, returnPath, usernameCandidates } = googleAuthApi
  ? await import('../../../src/api/google-auth/google-auth.service.js')
  : {};

const options = { host: 'www.cyberiaonline.com', path: '/', apiPath: '/api/v1' };
const GOOGLE_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'];
const saved = Object.fromEntries(GOOGLE_ENV.map((key) => [key, process.env[key]]));

const setEnv = (values) => {
  for (const key of GOOGLE_ENV) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
};

afterEach(() => setEnv(saved));

describeGoogleAuth('Google sign-in configuration', () => {
  it('is off without a client id or a client secret', () => {
    setEnv({ GOOGLE_CLIENT_SECRET: 'secret' });
    expect(googleAuthConfig(options)).toBeNull();
    setEnv({ GOOGLE_CLIENT_ID: 'client' });
    expect(googleAuthConfig(options)).toBeNull();
  });

  it("defaults the callback to the host's own API route, the one the OAuth client lists", () => {
    setEnv({ GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' });
    expect(googleAuthConfig(options)).toEqual({
      clientID: 'client',
      clientSecret: 'secret',
      callbackURL: 'https://www.cyberiaonline.com/api/v1/google-auth/callback',
    });
  });

  it('takes the callback from GOOGLE_CALLBACK_URL, and is off for one that is not an http(s) URL', () => {
    setEnv({
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:4008/api/v1/google-auth/callback',
    });
    expect(googleAuthConfig(options).callbackURL).toBe('http://localhost:4008/api/v1/google-auth/callback');
    for (const GOOGLE_CALLBACK_URL of ['not a url', 'javascript:alert(1)', 'ftp://host/callback']) {
      setEnv({ GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_CALLBACK_URL });
      expect(googleAuthConfig(options), GOOGLE_CALLBACK_URL).toBeNull();
    }
  });

  it('asks Google for the identity scopes only', () => {
    expect([...GOOGLE_AUTH_SCOPES]).toEqual(['openid', 'email', 'profile']);
  });

  it('returns home after a sign-in, to the log-in view for a link, and to the starting view otherwise', () => {
    const flow = 'a'.repeat(48);
    expect(returnPath(options, 'success', { flow, view: 'sign-up' })).toBe(
      `/?google-auth=success&google-auth-flow=${flow}`,
    );
    expect(returnPath(options, 'link', { flow, view: 'sign-up' })).toBe(
      `/log-in?google-auth=link&google-auth-flow=${flow}`,
    );
    expect(returnPath(options, 'cancelled', { flow, view: 'sign-up' })).toBe('/sign-up?google-auth=cancelled');
    expect(returnPath(options, 'error', { view: 'https://evil.test' })).toBe('/log-in?google-auth=error');
    expect(returnPath({ ...options, path: '/cyberia' }, 'conflict')).toBe('/cyberia/log-in?google-auth=conflict');
  });
});

describeGoogleAuth('Google email authority', () => {
  const profile = (email, { verified = true, hd } = {}) => ({
    id: '1',
    emails: [{ value: email, verified }],
    _json: hd ? { hd } : {},
  });

  it('trusts a verified Gmail address and a verified address of the asserted Workspace domain', () => {
    expect(googleClaims(profile(' Player@Gmail.com ')).authoritative).toBe(true);
    expect(googleClaims(profile(' Player@Gmail.com ')).email).toBe('player@gmail.com');
    expect(googleClaims(profile('lead@studio.test', { hd: 'Studio.test' })).authoritative).toBe(true);
  });

  it('trusts no unverified address, and no other domain', () => {
    expect(googleClaims(profile('player@gmail.com', { verified: false })).authoritative).toBe(false);
    expect(googleClaims(profile('player@outside.test')).authoritative).toBe(false);
    expect(googleClaims(profile('player@outside.test', { hd: 'studio.test' })).authoritative).toBe(false);
    expect(googleClaims(profile('player@gmail.com.evil.test')).authoritative).toBe(false);
    expect(googleClaims(profile('player@sub.studio.test', { hd: 'studio.test' })).authoritative).toBe(false);
  });
});

describeGoogleAuth('Google sign-in usernames', () => {
  it('derives a valid username from the Google name', () => {
    expect(usernameCandidates('José Pérez')[0]).toBe('jose-perez');
    expect(usernameCandidates("Ana  O'Neil!")[0]).toBe('ana-o-neil');
    expect(usernameCandidates('Maximiliano Alejandro Fernández')[0]).toBe('maximiliano-ale');
  });

  it('falls back to a neutral stem for a name with no usable letters', () => {
    expect(usernameCandidates('李小龙')[0]).toBe('user');
    expect(usernameCandidates('')[0]).toBe('user');
    expect(usernameCandidates('-')[0]).toBe('user');
  });

  it('offers a bounded set of suffixed alternatives, each one a valid username', () => {
    const candidates = usernameCandidates('Maximiliano Alejandro Fernández');
    expect(candidates).toHaveLength(5);
    for (const candidate of candidates.slice(1)) expect(candidate).toMatch(/^maximiliano-ale-[0-9a-f]{4}$/);
    for (const name of ['José Pérez', '李小龙', 'Maximiliano Alejandro Fernández', 'a_b-c'])
      for (const candidate of usernameCandidates(name)) expect(isValidUsername(candidate), candidate).toBe(true);
  });
});
