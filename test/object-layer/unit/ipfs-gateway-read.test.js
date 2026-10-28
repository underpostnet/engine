import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';

// The gateway read over a real HTTP server: a body over the limit is refused before it is buffered whole.
const bodies = new Map();
let server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const body = bodies.get(req.url.slice('/ipfs/'.length));
    if (!body) return res.writeHead(404).end();
    if (body.chunked) {
      res.writeHead(200, { 'transfer-encoding': 'chunked' });
      for (let at = 0; at < body.bytes.length; at += 1024) res.write(body.bytes.subarray(at, at + 1024));
      return res.end();
    }
    res.writeHead(200, { 'content-length': body.bytes.length }).end(body.bytes);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  process.env.IPFS_GATEWAY_URL = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  delete process.env.IPFS_GATEWAY_URL;
  await new Promise((done) => server.close(done));
});

const { IpfsClient } = await import('../../../src/api/ipfs/ipfs.client.js');

describe('a read from the IPFS gateway', () => {
  it('answers the bytes the gateway holds, within the limit', async () => {
    bodies.set('small', { bytes: Buffer.from('a small render') });
    expect((await IpfsClient.getFromIpfs('small', { maxBytes: 64 })).toString()).toBe('a small render');
    expect(await IpfsClient.getFromIpfs('absent', { maxBytes: 64 })).toBeNull();
  });

  it('refuses a body its length names over the limit, and a chunked body that grows over it', async () => {
    bodies.set('declared', { bytes: Buffer.alloc(8 * 1024) });
    bodies.set('chunked', { bytes: Buffer.alloc(8 * 1024), chunked: true });
    expect(await IpfsClient.getFromIpfs('declared', { maxBytes: 4096 })).toBeNull();
    expect(await IpfsClient.getFromIpfs('chunked', { maxBytes: 4096 })).toBeNull();
    expect((await IpfsClient.getFromIpfs('chunked', { maxBytes: 8192 })).length).toBe(8192);
  });
});
