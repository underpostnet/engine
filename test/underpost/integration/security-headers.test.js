/**
 * The HTTP hardening every application applies: the nonce CSP and the Swagger exception, HSTS with
 * preload in production, explicit CORS, and the rate limiter unless it is switched off.
 */
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { applySecurity } from '../../../src/server/security/auth.js';

const KEYS = ['NODE_ENV', 'DISABLE_API_RATE_LIMIT', 'JWT_SECRET'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

const serve = async (env, options) => {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, { JWT_SECRET: 'security-headers-secret', ...env });
  const app = express();
  app.use((req, res, next) => {
    if (req.path === '/swagger') res.locals.isSwagger = true;
    next();
  });
  applySecurity(app, options);
  app.get(['/page', '/swagger'], (req, res) => res.send(res.locals.nonce));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const get = (path, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers });
  return { server, get };
};

describe('HTTP hardening', () => {
  let server;

  afterEach(() => {
    server?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('allows only the scripts and styles that carry the nonce of the response', async () => {
    let get;
    ({ server, get } = await serve({ NODE_ENV: 'development', DISABLE_API_RATE_LIMIT: 'true' }));
    const res = await get('/page');
    const nonce = await res.text();
    const policy = res.headers.get('content-security-policy');
    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(policy).toContain(`style-src 'self' http: 'nonce-${nonce}'`);
    expect(policy).toContain("style-src-attr 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    // Helmet's default HSTS, without the preload production asks for.
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers.get('ratelimit-limit')).toBeNull();
  });

  it('lets the Swagger page run its inline scripts and styles', async () => {
    let get;
    ({ server, get } = await serve({ NODE_ENV: 'development', DISABLE_API_RATE_LIMIT: 'true' }));
    const policy = (await get('/swagger')).headers.get('content-security-policy');
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
  });

  it('pins HTTPS, answers the allowed origin and limits the rate in production', async () => {
    let get;
    ({ server, get } = await serve(
      { NODE_ENV: 'production' },
      { origin: ['https://app.test'], frameAncestors: ["'self'", 'https://host.test'] },
    ));
    const allowed = await get('/page', { origin: 'https://app.test' });
    expect(allowed.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains; preload');
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.test');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    expect(allowed.headers.get('content-security-policy')).toContain("frame-ancestors 'self' https://host.test");
    expect(allowed.headers.get('content-security-policy')).toContain("font-src 'self' https: data:");
    expect(allowed.headers.get('ratelimit-limit')).toBe('500');

    const other = await get('/page', { origin: 'https://other.test' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
