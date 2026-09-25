import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The browser modules the core service imports; only the answer handling is under test.
vi.mock('../../../src/client/components/core/Auth.js', () => ({ Auth: { getJWT: () => '' } }));
vi.mock('../../../src/client/components/core/Logger.js', () => ({
  loggerFactory: () => ({ info() {}, warn() {}, error() {} }),
}));
vi.mock('../../../src/client/components/core/Router.js', () => ({ getProxyPath: () => '/' }));
vi.mock('../../../src/client/services/user/guest.service.js', () => ({
  GuestService: { getAuthorizationHeader: () => '' },
}));

const { getApiBaseUrl, readResponse } = await import('../../../src/client/services/core/core.service.js');

const answer = (status, body, url = 'http://localhost:4017/api/v1/object-layer') =>
  Object.defineProperty(new Response(body, { status }), 'url', { value: url });

describe('a service answer in the browser', () => {
  it('passes a valid empty result as content', async () => {
    const body = { status: 'success', data: { data: [], total: 0 } };
    expect(await readResponse(answer(200, JSON.stringify(body)))).toEqual(body);
  });

  it('passes an API error on, so the caller sees a failure and its message', async () => {
    const body = { status: 'error', message: 'No object layer for key: sword' };
    expect(await readResponse(answer(404, JSON.stringify(body)))).toEqual(body);
  });

  it('refuses an answer that is not the API: it names the URL and the status', async () => {
    const edge = answer(503, '<html>Service Unavailable</html>');
    await expect(readResponse(edge)).rejects.toMatchObject({
      message: 'http://localhost:4017/api/v1/object-layer answered 503 without a JSON body',
      status: 503,
    });
  });
});

describe('the endpoint host a build injects', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { host: 'localhost:4014', protocol: 'http:' });
    vi.stubGlobal('window', {
      renderPayload: { apiBasePath: 'api/v1', apiHosts: { 'object-layer': 'localhost:4017' } },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads an owned service at its owner, and every other one at this host', () => {
    expect(getApiBaseUrl({ endpoint: 'object-layer' })).toBe('http://localhost:4017/api/v1/object-layer');
    expect(getApiBaseUrl({ endpoint: 'item-ledger', id: 'cid/x' })).toBe(
      'http://localhost:4014/api/v1/item-ledger/cid/x',
    );
  });
});
