import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The publication and restore of a client bundle through a real object store: the `file:` driver.
// The client build is a stand-in that writes what `client --build-zip` writes, except where the test
// drives the managed client build itself; there the runner is replaced and the host is fixed.
const host = vi.hoisted(() => ({ availableBytes: 8 * 1024 ** 3 }));
const workload = vi.hoisted(() => ({ calls: [], run: null }));
vi.mock('../../../src/server/runtime/resource-governor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  hostCapacityFactory: () => ({
    hostMemoryBytes: 16 * 1024 ** 3,
    cgroupMemoryBytes: null,
    totalMemoryBytes: 16 * 1024 ** 3,
    availableMemoryBytes: host.availableBytes,
    cpus: 4,
    cgroupCpus: null,
  }),
}));
vi.mock('../../../src/server/runtime/linux-resources.js', async (importOriginal) => ({
  ...(await importOriginal()),
  systemdScopeSupport: () => ({ available: false, reason: 'fixture host' }),
}));
vi.mock('../../../src/server/runtime/managed-process.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runManagedProcess: async (params) => {
    workload.calls.push(params);
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      cancelled: '',
      overBudget: '',
      stoppedFor: '',
      oomKilled: false,
      durationMs: 1000,
      limits: null,
      diagnostics: { peakBytes: 300 * 1024 ** 2, peakSource: 'sampled', peakRssBytes: 300 * 1024 ** 2, cpuMs: 900 },
      ...(await workload.run(params)),
    };
  },
}));

const { pruneClientBundles, pullClientBundle, pushClientBundle, verifyServedClientBundle } =
  await import('../../../src/client-builder/client-bundle.js');
const { objectStore } = await import('../../../src/server/storage/object-store.js');
const { zipFromLocalFiles } = await import('../../../src/server/storage/zip.js');
const { BUILD_MANIFEST_FILE } = await import('../../../src/client/components/core/BuildManifest.js');

const ENGINE = process.cwd();
const VERSION = '3.5.0';
const ROUTES = [
  { publicPath: 'public/a.com', bundleId: 'a.com-', documented: true },
  { publicPath: 'public/a.com/peer', bundleId: 'a.com-peer', documented: false },
  { publicPath: 'public/b.com', bundleId: 'b.com-', documented: false },
];
const DOCS_ENTRY = `docs/engine/${VERSION}/index.html`;

const git = (...args) =>
  execFileSync('git', ['-c', 'user.email=bundle@test', '-c', 'user.name=bundle', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const filesOf = (root) =>
  fs.existsSync(root)
    ? fs
        .readdirSync(root, { recursive: true })
        .filter((file) => fs.statSync(`${root}/${file}`).isFile())
        .sort()
    : [];

/** Every served file with the SHA-256 of its bytes. */
const snapshot = () =>
  Object.fromEntries(
    filesOf('public').map((file) => [
      file,
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(`public/${file}`))
        .digest('hex'),
    ]),
  );

/** Writes what one client build writes: every route tree, then its zip or its parts. */
const writeBuild = async ({ splitMb, marker, publishedAt = new Date().toISOString() }) => {
  for (const { publicPath, documented } of ROUTES) {
    fs.outputFileSync(`${publicPath}/index.html`, `<!doctype html><title>${marker}</title>`);
    fs.outputFileSync(`${publicPath}/${BUILD_MANIFEST_FILE}`, JSON.stringify({ marker }));
    if (!documented) continue;
    const site = `${publicPath}/docs/engine/${VERSION}`;
    fs.outputFileSync(
      `${site}/index.html`,
      `<html><head><title>${marker}</title><link href="assets/style.css"></head></html>`,
    );
    for (const asset of ['style.css', 'main.js', 'search.js'])
      fs.outputFileSync(`${site}/assets/${asset}`, `${asset} ${marker}`);
    fs.outputJsonSync(`${publicPath}/docs/engine/.typedoc-run.json`, {
      history: { peak: { bytes: 1024 ** 3, source: 'kernel', at: publishedAt } },
      published: { version: VERSION, at: publishedAt },
    });
  }
  for (const { publicPath, bundleId } of ROUTES) {
    const zip = await zipFromLocalFiles(
      filesOf(publicPath).map((file) => ({ localPath: `${publicPath}/${file}`, entryName: file })),
    );
    const zipPath = `build/${bundleId}.zip`;
    if (!splitMb) {
      fs.outputFileSync(zipPath, zip);
      continue;
    }
    const size = Math.ceil(splitMb * 1024 * 1024);
    for (let offset = 0, index = 1; offset < zip.length; offset += size, index++)
      fs.outputFileSync(`${zipPath}.part${String(index).padStart(3, '0')}`, zip.subarray(offset, offset + size));
  }
};

/** A stand-in client build. */
const standIn =
  ({ reason = 'completed', marker = 'one', publishedAt } = {}) =>
  async ({ splitMb }) => {
    if (reason === 'completed') await writeBuild({ splitMb, marker, publishedAt });
    return { reason, detail: reason === 'completed' ? 'exit 0' : 'exit 1', command: ['client'], resources: {} };
  };

/** An object store that records its puts, and fails the put a test names. */
const recording = (store, { failAt = 0 } = {}) => {
  const puts = [];
  return {
    ...store,
    puts,
    put: async (key, bytes, options) => {
      puts.push(key);
      if (puts.length === failAt) throw new Error(`store refused ${key}`);
      return store.put(key, bytes, options);
    },
  };
};

describe('client bundle publication and restore', () => {
  let fixture;
  let storeRoot;
  let records;
  let store;

  const push = (options = {}) =>
    pushClientBundle({ deployId: 'dd-test', split: '0.0005', store, root: records, build: standIn(), ...options });
  const pull = (options = {}) => pullClientBundle({ deployId: 'dd-test', store, ...options });
  const stored = async () => (await store.list('underpost/client-bundles/')).map(({ key }) => key);

  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-client-bundle-'));
    storeRoot = `${fixture}/store`;
    records = `${fixture}/records`;
    store = objectStore(`file:${storeRoot}`);
    fs.mkdirpSync(`${fixture}/engine`);
    process.chdir(`${fixture}/engine`);
    fs.copySync(`${ENGINE}/typedoc.json`, 'typedoc.json');
    fs.symlinkSync(`${ENGINE}/node_modules`, 'node_modules');
    fs.outputJsonSync('package.json', { name: 'engine', version: VERSION });
    fs.outputJsonSync('engine-private/conf/dd-test/conf.server.json', {
      'a.com': { '/': { client: 'A' }, '/peer': { client: 'P' } },
      'b.com': { '/': { client: 'B' } },
    });
    fs.outputJsonSync('engine-private/conf/dd-test/conf.client.json', {
      A: { docs: { references: [] } },
      P: {},
      B: {},
    });
    fs.outputFileSync('.gitignore', 'node_modules\npublic\nbuild\nengine-private\n');
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'engine');
    workload.calls = [];
    host.availableBytes = 8 * 1024 ** 3;
  });

  afterEach(() => {
    process.chdir(ENGINE);
    fs.removeSync(fixture);
  });

  it('publishes one bundle, manifest last, and every restore of it gives the same trees', async () => {
    const recorded = recording(store);
    const { reference, manifest } = await push({
      store: recorded,
      releaseId: 'v3-5-0-test',
      image: 'engine@sha256:abc',
    });

    const [, releaseId, buildId, digest] = /^([a-z0-9-]+)\/(client-\d{17}-\d+)@sha256:([0-9a-f]{64})$/.exec(reference);
    expect(releaseId).toBe('v3-5-0-test');
    expect(recorded.puts.at(-1)).toBe(`underpost/client-bundles/dd-test/${releaseId}/${buildId}/manifest.json`);
    expect(
      crypto
        .createHash('sha256')
        .update(await store.get(recorded.puts.at(-1)))
        .digest('hex'),
    ).toBe(digest);
    expect(fs.readJsonSync('engine-private/conf/dd-test/client-bundle.json').reference).toBe(reference);
    expect(manifest.routes.map(({ bundle }) => bundle)).toEqual(['a.com-', 'a.com-peer', 'b.com-']);
    expect(manifest.routes[0].parts.length).toBeGreaterThan(1);
    expect(manifest.routes[0].docs).toEqual({
      version: VERSION,
      entry: DOCS_ENTRY,
      sha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(`public/a.com/${DOCS_ENTRY}`))
        .digest('hex'),
    });
    expect(manifest.engine).toEqual({ version: VERSION, commit: git('rev-parse', 'HEAD') });
    expect(manifest.image).toBe('engine@sha256:abc');
    expect(manifest.sources[0]).toMatchObject({ path: '.', remote: null, dirty: false });
    expect(fs.readdirSync('build')).toEqual([]);

    const record = fs.readJsonSync(`${records}/dd-test/${releaseId}/${buildId}/build.json`);
    expect(record).toMatchObject({ status: 'published', reference, store: `file:${storeRoot}`, manifest });
    expect(record.resources.typedoc).toEqual([
      { route: 'a.com/', peak: expect.objectContaining({ bytes: 1024 ** 3 }) },
    ]);
    expect(JSON.stringify(record)).not.toMatch(/password|secret|token/i);

    const built = snapshot();
    fs.removeSync('public');
    expect(await pull({ reference })).toEqual({ reference, restored: 3 });
    expect(snapshot()).toEqual(built);
    await pull({ reference });
    expect(snapshot()).toEqual(built);
    await pull();
    expect(snapshot()).toEqual(built);
    expect(fs.readdirSync('build')).toEqual([]);
  });

  it('keeps the bundles of two releases apart', async () => {
    const one = await push({ releaseId: 'release-one', build: standIn({ marker: 'one' }) });
    const builtOne = snapshot();
    const two = await push({ releaseId: 'release-two', build: standIn({ marker: 'two' }), split: 'none' });
    const builtTwo = snapshot();
    expect(builtOne).not.toEqual(builtTwo);

    fs.removeSync('public');
    await pull({ reference: one.reference });
    expect(snapshot()).toEqual(builtOne);
    await pull({ reference: two.reference });
    expect(snapshot()).toEqual(builtTwo);
    expect(two.manifest.routes.every(({ parts }) => parts.length === 1)).toBe(true);
  });

  it('publishes nothing when the build fails or ships a TypeDoc site an earlier build published', async () => {
    await expect(push({ build: standIn({ reason: 'failed' }) })).rejects.toThrow(/client build ended failed: exit 1/);
    await expect(push({ build: standIn({ publishedAt: new Date(Date.now() - 60000).toISOString() }) })).rejects.toThrow(
      /a\.com\/: docs\/engine\/3\.5\.0 was not published by this build/,
    );
    expect(await stored()).toEqual([]);
    expect(fs.existsSync('engine-private/conf/dd-test/client-bundle.json')).toBe(false);
    const failed = fs
      .readdirSync(`${records}/dd-test`, { recursive: true })
      .filter((file) => file.endsWith('build.json'))
      .map((file) => fs.readJsonSync(`${records}/dd-test/${file}`));
    expect(failed.map(({ status }) => status)).toEqual(['failed', 'failed']);
    expect(failed.every(({ error }) => error)).toBe(true);
  });

  it('removes what a failed upload stored, and leaves the published bundle as it was', async () => {
    const published = await push();
    const before = await stored();
    await expect(push({ store: recording(store, { failAt: 3 }) })).rejects.toThrow(/store refused/);
    expect(await stored()).toEqual(before);
    expect(fs.readJsonSync('engine-private/conf/dd-test/client-bundle.json').reference).toBe(published.reference);
    fs.removeSync('public');
    await pull({ reference: published.reference });
    expect(fs.existsSync(`public/a.com/${DOCS_ENTRY}`)).toBe(true);
  });

  it('refuses a restore that does not verify, and leaves the served trees as they were', async () => {
    const { reference, manifest } = await push();
    fs.outputFileSync('public/b.com/index.html', 'live');
    const [part] = manifest.routes[0].parts;
    const partFile = `${storeRoot}/${part.key}`;
    const original = fs.readFileSync(partFile);

    fs.writeFileSync(partFile, Buffer.concat([original.subarray(1), Buffer.from('x')]));
    await expect(pull({ reference })).rejects.toThrow(
      /part .* holds \d+ bytes with SHA-256 [0-9a-f]+, not its manifest's/,
    );
    fs.removeSync(partFile);
    await expect(pull({ reference })).rejects.toThrow(/part .* is missing/);
    fs.writeFileSync(partFile, original);

    await expect(pull({ reference: reference.replace(/[0-9a-f]{4}$/, '0000') })).rejects.toThrow(/the reference pins/);
    await expect(pull({ reference: reference.replace(/client-\d{17}/, 'client-20000101000000000') })).rejects.toThrow(
      /is not published/,
    );
    expect(fs.readFileSync('public/b.com/index.html', 'utf8')).toBe('live');
  });

  it('restores only a bundle that carries every route the deployment conf serves', async () => {
    const { reference } = await push({ hosts: ['b.com'] });
    await expect(pull({ reference })).rejects.toThrow(/carries no a\.com\//);
    await pull({ reference, hosts: ['b.com'] });
    expect(fs.existsSync('public/b.com/index.html')).toBe(true);
  });

  it('prunes what no deployment restores, keeping the newest published bundles', async () => {
    const references = [];
    for (const marker of ['one', 'two', 'three', 'four'])
      references.push((await push({ releaseId: `release-${marker}`, build: standIn({ marker }) })).reference);
    const orphan = 'underpost/client-bundles/dd-test/release-x/client-20000101000000000-1/parts/a.com-/0001';
    await store.put(orphan, Buffer.from('partial'));
    const id = (reference) => reference.split('@')[0];

    const { kept, removed } = await pruneClientBundles({
      deployId: 'dd-test',
      protect: [references[0]],
      store,
      root: records,
    });
    expect(kept.sort()).toEqual([references[0], references[2], references[3]].map(id).sort());
    expect(removed.sort()).toEqual([id(references[1]), id(`release-x/client-20000101000000000-1`)].sort());
    const keys = await stored();
    expect(keys.some((key) => key.includes(id(references[1])) || key === orphan)).toBe(false);
    expect(fs.existsSync(`${records}/dd-test/${id(references[1])}`)).toBe(false);
    expect(fs.existsSync(`${records}/dd-test/${id(references[0])}/build.json`)).toBe(true);

    fs.removeSync('public');
    await pull({ reference: references[0] });
    expect(fs.readFileSync('public/a.com/index.html', 'utf8')).toContain('one');
  });

  it('checks that each documented route serves the TypeDoc entry the bundle holds', async () => {
    const { reference } = await push();
    const entry = fs.readFileSync(`public/a.com/${DOCS_ENTRY}`);
    const requested = [];
    const answer = (status, body) => async (url) => {
      requested.push(url);
      return new Response(body, { status });
    };
    const verify = (request) => verifyServedClientBundle({ deployId: 'dd-test', reference, store, request });

    expect(await verify(answer(200, entry))).toEqual([requested[0]]);
    expect(requested[0]).toMatch(/^https:\/\/a\.com\/docs\/engine\/3\.5\.0\/index\.html\?bundle=client-\d{17}-\d+$/);
    await expect(verify(answer(200, 'cached'))).rejects.toThrow(/serves SHA-256 [0-9a-f]+, not [0-9a-f]+/);
    await expect(verify(answer(503, entry))).rejects.toThrow(/answered 503/);
    await expect(
      verify(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it('builds through the managed runner, with the documentation build a bundle requires', async () => {
    workload.run = async ({ args }) => {
      await writeBuild({ splitMb: Number(args[args.indexOf('--split') + 1]), marker: 'managed' });
      return {};
    };
    const { reference } = await pushClientBundle({ deployId: 'dd-test', store, root: records });
    const [{ command, args, budget, logPath }] = workload.calls;
    const buildId = /\/(client-\d{17}-\d+)@/.exec(reference)[1];
    expect(command).toBe(process.execPath);
    expect(args[0]).toBe(path.join(ENGINE, 'bin/index.js'));
    expect(args.slice(1)).toEqual([
      'client',
      'dd-test',
      '--env',
      'production',
      '--docs',
      'build',
      '--build-zip',
      '--split',
      '8',
      '--build-id',
      buildId,
    ]);
    expect(budget).toMatchObject({ profile: 'build', nice: 10 });
    expect(logPath).toBe(path.join(records, 'dd-test', reference.split('/')[0], buildId, 'build.log'));
    const record = fs.readJsonSync(path.join(path.dirname(logPath), 'build.json'));
    expect(record.resources).toMatchObject({ profile: 'build', peakBytes: 300 * 1024 ** 2 });
    expect(record.resources.limits.memory.enforcement).toBe('monitor');

    workload.run = async () => ({ exitCode: 1 });
    await expect(pushClientBundle({ deployId: 'dd-test', store, root: records })).rejects.toThrow(
      /client build ended failed: exit 1/,
    );
    host.availableBytes = 100 * 1024 ** 2;
    const calls = workload.calls.length;
    await expect(pushClientBundle({ deployId: 'dd-test', store, root: records })).rejects.toThrow(
      /client build ended rejected: the host has 100 MB available/,
    );
    expect(workload.calls.length).toBe(calls);
    expect((await stored()).filter((key) => key.endsWith('manifest.json'))).toHaveLength(1);
  });
});
