import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertCookieOrigin, clearRefreshCookie, cookieOptionsFactory } from '../../../src/server/security/auth.js';

const request = ({ protocol = 'https', forwarded, origin, host = 'services.fixture.test' } = {}) => ({
  protocol,
  secure: protocol === 'https',
  headers: { ...(forwarded && { 'x-forwarded-proto': forwarded }), ...(origin && { origin }) },
  get: (name) => (name.toLowerCase() === 'host' ? host : undefined),
});

describe('refresh session cookie', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is host-only, HttpOnly and on the whole host', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACCESS_EXPIRE_MINUTES', '15');
    const options = cookieOptionsFactory(request({ protocol: 'http', forwarded: 'https' }));
    expect(options).toEqual({ httpOnly: true, secure: true, sameSite: 'None', path: '/', maxAge: 15 * 60 * 1000 });
    expect(options).not.toHaveProperty('domain');
  });

  it('is Lax and not Secure on a plain request', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(cookieOptionsFactory(request({ protocol: 'http' }))).toMatchObject({ secure: false, sameSite: 'Lax' });
    vi.stubEnv('NODE_ENV', 'development');
    expect(cookieOptionsFactory(request({ protocol: 'http', forwarded: 'https' }))).toMatchObject({ secure: false });
  });

  it('is cleared with the attributes it was set with', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const req = request({ protocol: 'http', forwarded: 'https' });
    const res = { clearCookie: vi.fn() };
    clearRefreshCookie(req, res);
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', cookieOptionsFactory(req));
  });
});

describe('cookie origin check', () => {
  const origins = ['https://client.fixture.test'];

  it('admits a call without Origin, from the host itself, or from an allowed origin', () => {
    expect(() => assertCookieOrigin(request(), origins)).not.toThrow();
    expect(() => assertCookieOrigin(request({ origin: 'https://services.fixture.test' }), origins)).not.toThrow();
    expect(() => assertCookieOrigin(request({ origin: 'https://client.fixture.test' }), origins)).not.toThrow();
  });

  it('refuses any other origin with 403', () => {
    for (const origin of ['https://evil.fixture.test', 'https://services.fixture.test.evil.test', 'null']) {
      let error;
      try {
        assertCookieOrigin(request({ origin }), origins);
      } catch (thrown) {
        error = thrown;
      }
      expect(error, origin).toMatchObject({ status: 403, message: 'Origin not allowed' });
    }
  });
});
