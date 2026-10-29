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

describe('the Kubo and Cluster contract', () => {
  const CID = 'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy';
  const calls = [];
  let stub;
  let behaviour;

  beforeAll(async () => {
    stub = http.createServer(async (req, res) => {
      calls.push(`${req.method} ${req.url}`);
      const answer = behaviour(req);
      if (answer.stall) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.write('{"Hash":');
      }
      res
        .writeHead(answer.status ?? 200, { 'content-type': 'application/json' })
        .end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {}));
    });
    await new Promise((done) => stub.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${stub.address().port}`;
    Object.assign(process.env, { IPFS_API_URL: origin, IPFS_CLUSTER_API_URL: origin, IPFS_KUBO_TIMEOUT_MS: '300' });
  });

  afterAll(async () => {
    for (const name of ['IPFS_API_URL', 'IPFS_CLUSTER_API_URL', 'IPFS_KUBO_TIMEOUT_MS', 'IPFS_MFS_ENABLED'])
      delete process.env[name];
    stub.closeAllConnections();
    await new Promise((done) => stub.close(done));
  });

  it('answers the CID it stored and says when the Cluster did not take the pin', async () => {
    behaviour = (req) =>
      req.url.startsWith('/pins/') ? { status: 500, body: 'peer down' } : { body: { Hash: CID, Size: '9' } };
    expect(await IpfsClient.addToIpfs(Buffer.from('bytes'))).toMatchObject({
      cid: CID,
      size: 9,
      cluster: { status: 'failed' },
    });
    behaviour = () => ({ body: { Hash: 'not-a-cid' } });
    expect(await IpfsClient.addToIpfs(Buffer.from('bytes'))).toBeNull();
  });

  it('bounds a response body, not only its headers', async () => {
    behaviour = () => ({ stall: true });
    const started = Date.now();
    expect(await IpfsClient.addToIpfs(Buffer.from('bytes'))).toBeNull();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('counts a Cluster pin durable only when its replication factor is met', async () => {
    const peers = { a: { peername: 'p0', status: 'pinned' }, b: { peername: 'p1', status: 'pinning' } };
    behaviour = (req) =>
      req.url.startsWith('/allocations/')
        ? { body: { replication_factor_min: 2, allocations: ['a', 'b'] } }
        : { body: { peer_map: peers } };
    expect(await IpfsClient.clusterPinStatus(CID)).toEqual({
      cid: CID,
      tracked: true,
      pinnedPeers: 1,
      requiredPeers: 2,
      pendingPeers: ['p1'],
      durable: false,
    });
    peers.b.status = 'pinned';
    expect((await IpfsClient.clusterPinStatus(CID)).durable).toBe(true);
    behaviour = () => ({ status: 404 });
    expect(await IpfsClient.clusterPinStatus(CID)).toMatchObject({ tracked: false, durable: false });
    behaviour = () => ({ status: 503 });
    expect(await IpfsClient.clusterPinStatus(CID)).toBeNull();
  });

  it('makes no MFS request while MFS is off', async () => {
    delete process.env.IPFS_MFS_ENABLED;
    calls.length = 0;
    expect(await IpfsClient.copyToMfs(CID, '/object-layer/cid/x/atlas.png')).toBe(false);
    expect(await IpfsClient.statMfsPath('/object-layer/cid/x/atlas.png')).toBeNull();
    expect(await IpfsClient.listMfsDirectory('/object-layer/cid')).toBeNull();
    expect(await IpfsClient.removeMfsPath('/object-layer/cid/x')).toBe(true);
    expect(calls).toEqual([]);
  });

  it('keeps the listing a path holds until its replacement exists', async () => {
    process.env.IPFS_MFS_ENABLED = 'true';
    calls.length = 0;
    behaviour = (req) => (req.url.includes('/files/cp') ? { status: 500, body: 'no such block' } : { body: {} });
    expect(await IpfsClient.copyToMfs(CID, '/object-layer/cid/x/atlas.png')).toBe(false);
    expect(
      calls.some(
        (call) => call.includes('/files/rm') && call.includes(encodeURIComponent('/object-layer/cid/x/atlas.png&')),
      ),
    ).toBe(false);

    calls.length = 0;
    behaviour = () => ({ body: {} });
    expect(await IpfsClient.copyToMfs(CID, '/object-layer/cid/x/atlas.png')).toBe(true);
    expect(calls.map((call) => call.split('?')[0])).toEqual([
      'POST /api/v0/files/mkdir',
      'POST /api/v0/files/cp',
      'POST /api/v0/files/rm',
      'POST /api/v0/files/mv',
    ]);
  });

  it('tells a missing MFS path from a node that refuses', async () => {
    process.env.IPFS_MFS_ENABLED = 'true';
    behaviour = () => ({ status: 500, body: '{"Message":"file does not exist"}' });
    expect(await IpfsClient.removeMfsPath('/gone')).toBe(true);
    behaviour = () => ({ status: 403, body: 'forbidden' });
    expect(await IpfsClient.removeMfsPath('/kept')).toBe(false);
  });
});
