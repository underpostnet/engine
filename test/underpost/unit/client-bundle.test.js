'use strict';

/**
 * @module client-bundle.test
 * @description Covers the deterministic parts of the client bundle transport: the runner input, the
 * reference that pins a bundle, the route set the build and a restore agree on, and the check of a
 * route tree before it is published or served.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';

const {
  CLIENT_BUNDLE_DIRECTORY,
  clientBundleArtifactPaths,
  clientBundleEntriesFactory,
  clientBundleHostFilter,
  clientBundleReferenceOf,
  clientBundleSplitMb,
  clientBundleTreeProblems,
} = await import('../../../src/client-builder/client-bundle.js');
const { BUILD_MANIFEST_FILE } = await import('../../../src/client/components/core/BuildManifest.js');

const CONF_SERVER = {
  'a.com': {
    '/peer': { client: 'P' },
    '/': { client: 'A' },
    '/old': { redirect: '/' },
    '/frozen': { client: 'A', disabledRebuild: true },
    '/multi': { client: 'M', replicas: ['/multi-1', '/multi-2'] },
    '/single': { client: 'S', singleReplica: true, replicas: ['/single-1'] },
  },
  'b.com': { '/': { client: 'B' } },
};
const CONF_CLIENT = { A: { docs: { references: [] } }, B: {}, P: {}, M: {}, S: {} };
const REFERENCE = `v3-5-0-abc1234/client-20261030151234567-4242@sha256:${'a'.repeat(64)}`;

/** Writes the client tree of one route, documented for `version` when one is given. */
const writeTree = (tree, { version, publishedAt = new Date().toISOString(), others = [] } = {}) => {
  fs.outputFileSync(`${tree}/index.html`, '<!doctype html><title>a</title>');
  fs.outputFileSync(`${tree}/${BUILD_MANIFEST_FILE}`, '{}');
  if (!version) return;
  const site = `${tree}/docs/engine/${version}`;
  fs.outputFileSync(`${site}/index.html`, '<html><head><title>API</title><link href="assets/style.css"></head></html>');
  for (const asset of ['style.css', 'main.js', 'search.js']) fs.outputFileSync(`${site}/assets/${asset}`, asset);
  for (const other of others) fs.outputFileSync(`${tree}/docs/engine/${other}/index.html`, 'old');
  fs.outputJsonSync(`${tree}/docs/engine/.typedoc-run.json`, { published: { version, at: publishedAt } });
};

describe('client bundle runner input', () => {
  it('parses the comma-separated host filter', () => {
    expect(clientBundleHostFilter(' a.com , b.com ,, ')).to.deep.equal(['a.com', 'b.com']);
    expect(clientBundleHostFilter('')).to.deep.equal([]);
    expect(clientBundleHostFilter(undefined)).to.deep.equal([]);
  });

  it('resolves the split option, defaulting an unusable value rather than failing the build', () => {
    expect(clientBundleSplitMb(undefined)).to.equal(8);
    expect(clientBundleSplitMb('16')).to.equal(16);
    expect(clientBundleSplitMb('none')).to.equal(null);
    expect(clientBundleSplitMb('0')).to.equal(8);
    expect(clientBundleSplitMb('abc')).to.equal(8);
  });

  it('parses a reference that pins one bundle, and refuses one that does not', () => {
    expect(clientBundleReferenceOf(REFERENCE)).to.deep.equal({
      releaseId: 'v3-5-0-abc1234',
      buildId: 'client-20261030151234567-4242',
      digest: 'a'.repeat(64),
    });
    for (const reference of [
      '',
      'v3-5-0-abc1234/client-20261030151234567-4242',
      `v3-5-0-abc1234/latest@sha256:${'a'.repeat(64)}`,
      `V3.5.0/client-20261030151234567-4242@sha256:${'a'.repeat(64)}`,
      `a/b/client-20261030151234567-4242@sha256:${'a'.repeat(64)}`,
      'v3-5-0-abc1234/client-20261030151234567-4242@sha256:abc',
    ])
      expect(() => clientBundleReferenceOf(reference), reference).to.throw(/client bundle reference|release id/);
  });
});

describe('client bundle routes and trees', () => {
  let fixturePath;
  let previousCwd;

  beforeEach(() => {
    previousCwd = process.cwd();
    fixturePath = fs.mkdtempSync('/tmp/engine-client-bundle-');
    fs.copySync(`${previousCwd}/typedoc.json`, `${fixturePath}/typedoc.json`);
    process.chdir(fixturePath);
    fs.outputJsonSync('engine-private/conf/dd-test/conf.server.json', CONF_SERVER);
    fs.outputJsonSync('engine-private/conf/dd-test/conf.client.json', CONF_CLIENT);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    fs.removeSync(fixturePath);
  });

  it('selects every route the client build emits a bundle for, parents before nested routes', () => {
    const entries = clientBundleEntriesFactory({ deployId: 'dd-test' });
    expect(entries.map((entry) => entry.bundleId)).to.deep.equal([
      'a.com-',
      'a.com-peer',
      'a.com-multi',
      'a.com-multi-1',
      'a.com-multi-2',
      'b.com-',
    ]);
    const byId = Object.fromEntries(entries.map((entry) => [entry.bundleId, entry]));
    expect(byId['a.com-'].publicPath).to.equal('public/a.com');
    expect(byId['a.com-peer'].publicPath).to.equal('public/a.com/peer');
    expect(byId['a.com-'].zipPath).to.equal(`${CLIENT_BUNDLE_DIRECTORY}/a.com-.zip`);
  });

  it('documents a route whose client declares docs while TypeDoc has a config', () => {
    const documented = (deployId = 'dd-test') =>
      clientBundleEntriesFactory({ deployId })
        .filter((entry) => entry.documented)
        .map((entry) => entry.bundleId);
    expect(documented()).to.deep.equal(['a.com-']);
    fs.removeSync('typedoc.json');
    expect(documented()).to.deep.equal([]);
  });

  it('applies the host filter, and resolves nothing for an unknown host or deployment', () => {
    const ids = (options) => clientBundleEntriesFactory(options).map((entry) => entry.bundleId);
    expect(ids({ deployId: 'dd-test', hosts: ['b.com'] })).to.deep.equal(['b.com-']);
    expect(ids({ deployId: 'dd-test', hosts: ['absent.com'] })).to.deep.equal([]);
    expect(ids({ deployId: 'dd-absent' })).to.deep.equal([]);
  });

  it('resolves split parts ahead of a single zip, and nothing when neither is present', () => {
    for (const part of ['002', '001']) fs.outputFileSync(`${CLIENT_BUNDLE_DIRECTORY}/a.com-.zip.part${part}`, 'x');
    fs.outputFileSync(`${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip`, 'y');

    expect(clientBundleArtifactPaths(`${CLIENT_BUNDLE_DIRECTORY}/a.com-.zip`)).to.deep.equal([
      'build/a.com-.zip.part001',
      'build/a.com-.zip.part002',
    ]);
    expect(clientBundleArtifactPaths(`${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip`)).to.deep.equal([
      `${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip`,
    ]);
    expect(clientBundleArtifactPaths(`${CLIENT_BUNDLE_DIRECTORY}/absent-.zip`)).to.deep.equal([]);
    expect(clientBundleArtifactPaths('./no-such-dir/x.zip')).to.deep.equal([]);
  });

  it('accepts a complete tree, documented by this build for exactly its version', () => {
    const since = new Date(Date.now() - 1000).toISOString();
    writeTree('plain');
    writeTree('documented', { version: '3.5.0' });
    expect(clientBundleTreeProblems('plain', { documented: false, version: '3.5.0', since })).to.deep.equal([]);
    expect(clientBundleTreeProblems('documented', { documented: true, version: '3.5.0', since })).to.deep.equal([]);
  });

  it('names what a tree lacks', () => {
    const since = new Date(Date.now() - 1000).toISOString();
    fs.mkdirpSync('empty');
    expect(clientBundleTreeProblems('empty', { documented: true, version: '3.5.0', since })).to.deep.equal([
      `${BUILD_MANIFEST_FILE} is missing or empty`,
      'index.html is missing or empty',
      'docs/engine/3.5.0 is missing',
    ]);
    writeTree('broken', { version: '3.5.0' });
    fs.removeSync('broken/docs/engine/3.5.0/assets/search.js');
    expect(clientBundleTreeProblems('broken', { documented: true, version: '3.5.0', since })).to.deep.equal([
      'docs/engine/3.5.0: assets/search.js is missing or empty',
    ]);
  });

  it('refuses the TypeDoc site of another version, or one an earlier build published', () => {
    const since = new Date().toISOString();
    writeTree('older', { version: '3.4.0', publishedAt: since });
    expect(clientBundleTreeProblems('older', { documented: true, version: '3.5.0', since })).to.deep.equal([
      'docs/engine holds other versions: 3.4.0',
      'docs/engine/3.5.0 is missing',
    ]);
    writeTree('mixed', { version: '3.5.0', others: ['3.4.0'], publishedAt: since });
    expect(clientBundleTreeProblems('mixed', { documented: true, version: '3.5.0', since })).to.deep.equal([
      'docs/engine holds other versions: 3.4.0',
    ]);
    writeTree('stale', { version: '3.5.0', publishedAt: new Date(Date.parse(since) - 60000).toISOString() });
    expect(clientBundleTreeProblems('stale', { documented: true, version: '3.5.0', since })).to.deep.equal([
      'docs/engine/3.5.0 was not published by this build',
    ]);
  });
});
