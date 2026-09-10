'use strict';

/**
 * @module client-bundle.test
 * @description Covers the client bundle transport: the route set push and pull agree on, the
 * uniform host filter and split option both runners parse, and the pull path that merges split
 * parts, extracts them in-process, and installs the result under the served public directory.
 *
 * The shell boundary is mocked so the deterministic parts — route selection, artifact
 * resolution, and the local zip round trip — run for real.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';
import { vi } from 'vitest';

const shellCommands = [];
vi.mock('../../src/server/runtime/process.js', async (importOriginal) => ({
  ...(await importOriginal()),
  shellExec: (command) => {
    shellCommands.push(command);
    return '';
  },
}));

const {
  CLIENT_BUNDLE_DIRECTORY,
  clientBundleTrackedKeys,
  clientBundleManifestKey,
  clientBundleArtifactPaths,
  clientBundleEntriesFactory,
  clientBundleHostFilter,
  clientBundleSplitFlag,
  clientBundleStorageFilePath,
  pullClientBundle,
  pushClientBundle,
} = await import('../../src/client-builder/client-bundle.js');
const { zipFromLocalFiles } = await import('../../src/server/storage/zip.js');
const { program } = await import('../../src/cli/index.js');

const CONF_SERVER = {
  'a.com': {
    '/': { client: 'A' },
    '/peer': { client: 'P' },
    '/old': { redirect: '/' },
    '/frozen': { disabledRebuild: true },
    '/multi': { client: 'M', replicas: ['/multi-1', '/multi-2'] },
    '/single': { client: 'S', singleReplica: true, replicas: ['/single-1'] },
  },
  'b.com': { '/': { client: 'B' } },
};

describe('client bundle runner input', () => {
  it('parses the comma-separated host filter both runners share', () => {
    expect(clientBundleHostFilter(' a.com , b.com ,, ')).to.deep.equal(['a.com', 'b.com']);
    expect(clientBundleHostFilter('')).to.deep.equal([]);
    expect(clientBundleHostFilter(undefined)).to.deep.equal([]);
  });

  it('resolves the split option, defaulting an unusable value rather than failing the build', () => {
    expect(clientBundleSplitFlag(undefined)).to.equal('--split 8');
    expect(clientBundleSplitFlag('16')).to.equal('--split 16');
    expect(clientBundleSplitFlag('none')).to.equal('');
    expect(clientBundleSplitFlag('0')).to.equal('--split 8');
    expect(clientBundleSplitFlag('abc')).to.equal('--split 8');
  });

  it('names one storage manifest per deployment', () => {
    expect(clientBundleStorageFilePath('dd-test')).to.equal('engine-private/conf/dd-test/storage.bundle.json');
  });
});

describe('client bundle route selection', () => {
  let fixturePath;
  let previousCwd;

  beforeEach(() => {
    previousCwd = process.cwd();
    fixturePath = fs.mkdtempSync('/tmp/engine-client-bundle-');
    process.chdir(fixturePath);
    fs.mkdirSync('engine-private/conf/dd-test', { recursive: true });
    fs.writeFileSync('engine-private/conf/dd-test/conf.server.json', JSON.stringify(CONF_SERVER), 'utf8');
    shellCommands.length = 0;
  });

  afterEach(() => {
    process.chdir(previousCwd);
    fs.removeSync(fixturePath);
  });

  const buildIds = (options) => clientBundleEntriesFactory(options).map((entry) => entry.buildId);

  it('selects every route the client build emits a bundle for, replicas included', () => {
    expect(buildIds({ deployId: 'dd-test' })).to.deep.equal([
      'a.com-',
      'a.com-peer',
      'a.com-multi',
      'a.com-multi-1',
      'a.com-multi-2',
      'b.com-',
    ]);
  });

  it('skips the routes the client build skips', () => {
    const selected = buildIds({ deployId: 'dd-test' });
    expect(selected).to.not.include('a.com-old');
    expect(selected).to.not.include('a.com-frozen');
    expect(selected).to.not.include('a.com-single');
    expect(selected).to.not.include('a.com-single-1');
  });

  it('maps a route to its served public directory', () => {
    const entries = clientBundleEntriesFactory({ deployId: 'dd-test', hosts: ['a.com'] });
    const byId = Object.fromEntries(entries.map((entry) => [entry.buildId, entry.publicPath]));
    expect(byId['a.com-']).to.equal('public/a.com');
    expect(byId['a.com-peer']).to.equal('public/a.com/peer');
  });

  it('applies the host filter, and resolves nothing for an unknown host or deployment', () => {
    expect(buildIds({ deployId: 'dd-test', hosts: ['b.com'] })).to.deep.equal(['b.com-']);
    expect(buildIds({ deployId: 'dd-test', hosts: ['absent.com'] })).to.deep.equal([]);
    expect(buildIds({ deployId: 'dd-absent' })).to.deep.equal([]);
  });

  it('resolves split parts ahead of a single zip, and nothing when neither is present', () => {
    fs.mkdirSync(CLIENT_BUNDLE_DIRECTORY, { recursive: true });
    for (const part of ['001', '002']) fs.writeFileSync(`${CLIENT_BUNDLE_DIRECTORY}/a.com-.zip.part${part}`, 'x');
    fs.writeFileSync(`${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip`, 'y');

    expect(clientBundleArtifactPaths(`${CLIENT_BUNDLE_DIRECTORY}/a.com-.zip`).artifactPaths).to.have.lengthOf(2);
    expect(clientBundleArtifactPaths(`${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip`).artifactPaths).to.deep.equal([
      `${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip`,
    ]);
    expect(clientBundleArtifactPaths(`${CLIENT_BUNDLE_DIRECTORY}/absent-.zip`).artifactPaths).to.deep.equal([]);
    expect(clientBundleArtifactPaths('./no-such-dir/x.zip').artifactPaths).to.deep.equal([]);
  });

  it('uploads every artifact of every resolved route, and reports the routes with none', () => {
    fs.mkdirSync(CLIENT_BUNDLE_DIRECTORY, { recursive: true });
    for (const part of ['001', '002']) fs.writeFileSync(`${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip.part${part}`, 'x');

    const result = pushClientBundle({ deployId: 'dd-test', hosts: ['b.com'], split: '4' });

    expect(result).to.deep.equal({ pushed: 1, skipped: 0 });
    expect(shellCommands.some((command) => command.includes('--build-zip --split 4'))).to.equal(true);
    const uploads = shellCommands.filter((command) => command.includes(' fs '));
    expect(uploads).to.have.lengthOf(2);
    expect(uploads.every((command) => command.includes('--storage-id bundle') && command.includes('--force'))).to.equal(
      true,
    );

    shellCommands.length = 0;
    expect(pushClientBundle({ deployId: 'dd-test', hosts: ['a.com'] })).to.deep.equal({ pushed: 0, skipped: 5 });
  });

  it('shells out only to subcommands the CLI still registers', async () => {
    // Regression: both directions called `underpost env`, a deprecated alias removed when the
    // env and config commands were folded into the host configuration store. Nothing failed at
    // import time, so bundle mode stayed broken until a deployment ran it.
    fs.mkdirSync(CLIENT_BUNDLE_DIRECTORY, { recursive: true });
    fs.writeFileSync('bundled.html', '<h1>bundled</h1>', 'utf8');
    fs.writeFileSync(
      `${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip`,
      await zipFromLocalFiles([{ localPath: 'bundled.html', entryName: 'index.html' }]),
    );
    pushClientBundle({ deployId: 'dd-test', hosts: ['b.com'] });
    await pullClientBundle({ deployId: 'dd-test', hosts: ['b.com'] });

    const pull = shellCommands.find((command) => command.includes(' fs ') && command.includes('--pull'));
    expect(pull).to.include('--tracked').and.to.include('--storage-id bundle');
    expect(pull).not.to.include('--storage-file-path');

    const registered = program.commands.map((command) => command.name());
    const invoked = [
      ...new Set(
        shellCommands
          .map((command) => /(?:^|\s)(?:node\s+\S*bin\S*|underpost)\s+([a-z-]+)/.exec(command)?.[1])
          .filter(Boolean),
      ),
    ];

    expect(invoked).to.not.be.empty;
    for (const subcommand of invoked) expect(registered, subcommand).to.include(subcommand);
  });

  it('untracks bundle parts a smaller build no longer produces', async () => {
    const manifest = {
      'build/b.com-.zip.part001': { bytes: 1 },
      'build/b.com-.zip.part002': { bytes: 1 },
      'build/b.com-.zip.part003': { bytes: 1 },
      'build/other.com-.zip.part003': { bytes: 1 },
    };
    expect(clientBundleTrackedKeys(manifest, 'b.com-')).to.deep.equal([
      'build/b.com-.zip.part001',
      'build/b.com-.zip.part002',
      'build/b.com-.zip.part003',
    ]);

    fs.mkdirSync(CLIENT_BUNDLE_DIRECTORY, { recursive: true });
    for (const part of ['001', '002']) fs.writeFileSync(`${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip.part${part}`, 'x');
    fs.writeFileSync('engine-private/conf/dd-test/storage.bundle.json', JSON.stringify(manifest), 'utf8');

    shellCommands.length = 0;
    expect(fs.existsSync('build/b.com-.zip.part003')).to.equal(false);
    expect(pushClientBundle({ deployId: 'dd-test', hosts: ['b.com'] })).to.deep.equal({ pushed: 1, skipped: 0 });

    const removals = shellCommands.filter((command) => command.includes(' --rm'));
    expect(removals, 'exactly the part this build did not produce').to.have.lengthOf(1);
    expect(removals[0]).to.include(" fs --tracked --key 'build/b.com-.zip.part003'");
    expect(removals[0]).to.include('--deploy-id dd-test --storage-id bundle --rm');
    expect(removals[0]).to.not.include('other.com');
    const uploads = shellCommands.filter((command) => command.includes(' fs ') && command.includes('--force'));
    expect(uploads).to.have.lengthOf(2);
    expect(shellCommands.indexOf(removals[0])).to.be.greaterThan(shellCommands.indexOf(uploads[1]));
  });

  it('merges, extracts, and installs a split bundle into the public directory', async () => {
    fs.mkdirSync('source/nested', { recursive: true });
    fs.writeFileSync('source/index.html', '<h1>bundle</h1>'.repeat(100), 'utf8');
    fs.writeFileSync('source/nested/app.js', 'console.log(1);'.repeat(100), 'utf8');
    const archive = await zipFromLocalFiles([
      { localPath: 'source/index.html', entryName: 'index.html' },
      { localPath: 'source/nested/app.js', entryName: 'nested/app.js' },
    ]);

    fs.mkdirSync(CLIENT_BUNDLE_DIRECTORY, { recursive: true });
    const partSize = Math.ceil(archive.length / 3);
    for (let offset = 0, index = 1; offset < archive.length; offset += partSize, index++) {
      const name = `${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip.part${String(index).padStart(3, '0')}`;
      fs.writeFileSync(name, archive.subarray(offset, offset + partSize));
    }

    const result = await pullClientBundle({ deployId: 'dd-test', hosts: ['b.com'] });

    expect(result).to.deep.equal({ pulled: 1, skipped: 0 });
    expect(fs.readFileSync('public/b.com/nested/app.js', 'utf8')).to.equal(
      fs.readFileSync('source/nested/app.js', 'utf8'),
    );
    expect(fs.existsSync(`${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip`)).to.equal(false);
    expect(fs.readdirSync(CLIENT_BUNDLE_DIRECTORY).filter((name) => name.includes('.part'))).to.deep.equal([]);
  });

  it('maps a pulled part back to the storage key that produced it', () => {
    // A pull keeping the downloaded archive writes `<key>.zip`; an unwrapped part is the key.
    expect(clientBundleManifestKey('build/a.com-.zip.part001.zip')).to.equal('build/a.com-.zip.part001');
    expect(clientBundleManifestKey('./build/a.com-.zip.part001.zip')).to.equal('build/a.com-.zip.part001');
    expect(clientBundleManifestKey('build/a.com-.zip.part001')).to.equal('build/a.com-.zip.part001');
  });

  it('refuses a bundle that reassembles to a different size than was pushed', async () => {
    // Regression: one part's upload failed silently, so the store kept the previous build's copy.
    // The parts merged without complaint and only the assembled archive was corrupt, 190MB later.
    fs.writeFileSync('source.html', '<h1>bundle</h1>'.repeat(100), 'utf8');
    const archive = await zipFromLocalFiles([{ localPath: 'source.html', entryName: 'index.html' }]);
    fs.mkdirSync(CLIENT_BUNDLE_DIRECTORY, { recursive: true });

    const partSize = Math.ceil(archive.length / 2);
    const partPaths = [];
    for (let offset = 0, index = 1; offset < archive.length; offset += partSize, index++) {
      const name = `${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip.part${String(index).padStart(3, '0')}`;
      fs.writeFileSync(name, archive.subarray(offset, offset + partSize));
      partPaths.push(name.replace(/^\.\//, ''));
    }

    // The manifest records a larger second part, as a build whose last part never replaced the
    // previous one would.
    fs.writeFileSync(
      'engine-private/conf/dd-test/storage.bundle.json',
      JSON.stringify({
        [partPaths[0]]: { bytes: fs.statSync(partPaths[0]).size },
        [partPaths[1]]: { bytes: fs.statSync(partPaths[1]).size + 4096 },
      }),
      'utf8',
    );

    let thrown;
    await pullClientBundle({ deployId: 'dd-test', hosts: ['b.com'] }).catch((error) => (thrown = error));

    expect(thrown?.message).to.match(/reassembled to \d+ bytes, expected \d+/);
    expect(fs.existsSync('public/b.com'), 'a bundle that failed verification must not be installed').to.equal(false);
  });

  it('installs a bundle whose parts match the pushed sizes', async () => {
    fs.writeFileSync('source.html', '<h1>bundle</h1>'.repeat(100), 'utf8');
    const archive = await zipFromLocalFiles([{ localPath: 'source.html', entryName: 'index.html' }]);
    fs.mkdirSync(CLIENT_BUNDLE_DIRECTORY, { recursive: true });

    const partSize = Math.ceil(archive.length / 2);
    const manifest = {};
    for (let offset = 0, index = 1; offset < archive.length; offset += partSize, index++) {
      const name = `${CLIENT_BUNDLE_DIRECTORY}/b.com-.zip.part${String(index).padStart(3, '0')}`;
      fs.writeFileSync(name, archive.subarray(offset, offset + partSize));
      manifest[name.replace(/^\.\//, '')] = { bytes: fs.statSync(name).size };
    }
    fs.writeFileSync('engine-private/conf/dd-test/storage.bundle.json', JSON.stringify(manifest), 'utf8');

    expect(await pullClientBundle({ deployId: 'dd-test', hosts: ['b.com'] })).to.deep.equal({ pulled: 1, skipped: 0 });
    expect(fs.existsSync('public/b.com/index.html')).to.equal(true);
  });

  it('skips a route whose bundle never arrived rather than clearing its public directory', async () => {
    fs.mkdirSync('public/b.com', { recursive: true });
    fs.writeFileSync('public/b.com/index.html', 'live', 'utf8');

    const result = await pullClientBundle({ deployId: 'dd-test', hosts: ['b.com'] });

    expect(result).to.deep.equal({ pulled: 0, skipped: 1 });
    expect(fs.readFileSync('public/b.com/index.html', 'utf8')).to.equal('live');
    expect(shellCommands.some((command) => command.startsWith('sudo rm -rf'))).to.equal(false);
  });
});
