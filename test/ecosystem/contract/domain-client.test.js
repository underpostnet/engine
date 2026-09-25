import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DomainError, clearDomainCache, domainRead, domainWrite } from '../../../src/server/domain/domain-client.js';
import { API_BASE_PATH, DOMAIN_API_VERSION } from '../../../src/server/domain/api-contract.js';

const BASE = 'https://itemledger.test';
const answers = [];
let calls = [];

const respond = (status, body) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  calls = [];
  answers.length = 0;
  clearDomainCache();
  process.env.ITEM_LEDGER_API_ORIGIN = BASE;
  process.env.DOMAIN_API_RETRIES = '2';
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    const next = answers.shift();
    if (typeof next === 'function') return await next();
    return next ?? respond(200, { status: 'success', data: { ok: true } });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ITEM_LEDGER_API_ORIGIN;
  delete process.env.DOMAIN_API_SERVICE_KEY;
});

describe('cross-domain reads', () => {
  it('addresses the versioned contract of the domain and returns its data', async () => {
    answers.push(respond(200, { status: 'success', data: { tokenId: '42' } }));
    const data = await domainRead({ domain: 'item-ledger', path: 'item-ledger/cid/bafkrei', query: { page: 1 } });
    expect(data).toEqual({ tokenId: '42' });
    expect(calls[0].url).toBe(`${BASE}/${API_BASE_PATH}/item-ledger/cid/bafkrei?page=1`);
    expect(calls[0].init.headers['x-domain-api-version']).toBe(DOMAIN_API_VERSION);
  });

  it('answers a missing resource with null, not an exception', async () => {
    answers.push(respond(404, {}));
    expect(await domainRead({ domain: 'item-ledger', path: 'item-ledger/cid/ghost' })).toBe(null);
  });

  it('retries a transient failure and gives up with the domain context', async () => {
    answers.push(respond(503, {}), respond(503, {}), respond(503, {}));
    await expect(domainRead({ domain: 'item-ledger', path: 'item-ledger', cacheTtlMs: 0 })).rejects.toMatchObject({
      name: 'DomainError',
      status: 503,
      retryable: true,
      domain: 'item-ledger',
    });
    expect(calls).toHaveLength(3);
  });

  it('raises a refusal at once', async () => {
    answers.push(respond(403, {}));
    await expect(domainRead({ domain: 'item-ledger', path: 'item-ledger', cacheTtlMs: 0 })).rejects.toBeInstanceOf(DomainError);
    expect(calls).toHaveLength(1);
  });

  it('serves a repeated read from the cache until it expires', async () => {
    answers.push(respond(200, { status: 'success', data: { n: 1 } }), respond(200, { status: 'success', data: { n: 2 } }));
    const read = () => domainRead({ domain: 'item-ledger', path: 'item-ledger', cacheTtlMs: 10000 });
    expect(await read()).toEqual({ n: 1 });
    expect(await read()).toEqual({ n: 1 });
    expect(calls).toHaveLength(1);
    clearDomainCache();
    expect(await read()).toEqual({ n: 2 });
  });

  it('refuses a domain with no configured base URL: no database is a fallback', async () => {
    await expect(domainRead({ domain: 'cyberia', path: 'anything' })).rejects.toThrow(/No API origin/);
  });
});

describe('cross-domain writes', () => {
  it('carries the service key and is attempted once', async () => {
    process.env.DOMAIN_API_SERVICE_KEY = 'secret';
    answers.push(respond(500, {}));
    await expect(domainWrite({ domain: 'item-ledger', path: 'item-ledger', body: { a: 1 } })).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.headers.authorization).toBe('Bearer secret');
    expect(calls[0].init.method).toBe('POST');
  });

  it('refuses to write without a service key', async () => {
    await expect(domainWrite({ domain: 'item-ledger', path: 'item-ledger', body: {} })).rejects.toThrow(/SERVICE_KEY/);
  });
});
