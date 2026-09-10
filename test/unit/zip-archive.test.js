'use strict';

/**
 * @module zip-archive.test
 * @description Covers the JSZip-backed archive helpers shared by the file-storage CLI and the
 * client builder: local-file archiving, full and single-entry extraction, entry lookup by
 * basename, and the guard that keeps an archive path from escaping the extraction root.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';
import JSZip from 'jszip';
import * as dir from 'path';
import {
  extractZipEntryTo,
  extractZipTo,
  findZipEntry,
  isZipBuffer,
  loadZip,
  readZipEntry,
  zipFromLocalFiles,
} from '../../src/server/storage/zip.js';

describe('zip archive helpers', () => {
  let fixturePath;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-zip-archive-');
    fs.mkdirSync(`${fixturePath}/src/nested`, { recursive: true });
    fs.writeFileSync(`${fixturePath}/src/index.html`, '<h1>index</h1>'.repeat(200), 'utf8');
    fs.writeFileSync(`${fixturePath}/src/nested/app.js`, 'console.log(1);'.repeat(200), 'utf8');
    fs.writeFileSync(`${fixturePath}/src/run.sh`, '#!/bin/sh\necho run\n', 'utf8');
    fs.chmodSync(`${fixturePath}/src/run.sh`, 0o755);
  });

  afterEach(() => {
    fs.removeSync(fixturePath);
  });

  const buildFixtureArchive = () =>
    zipFromLocalFiles([
      { localPath: `${fixturePath}/src/index.html`, entryName: 'index.html' },
      { localPath: `${fixturePath}/src/nested/app.js`, entryName: 'nested/app.js' },
      { localPath: `${fixturePath}/src/run.sh`, entryName: 'run.sh' },
    ]);

  it('writes a deflated archive that keeps the requested entry names', async () => {
    const archive = await buildFixtureArchive();
    const rawBytes = ['src/index.html', 'src/nested/app.js', 'src/run.sh'].reduce(
      (total, relativePath) => total + fs.statSync(`${fixturePath}/${relativePath}`).size,
      0,
    );

    expect(isZipBuffer(archive)).to.equal(true);
    expect(archive.length).to.be.below(rawBytes);
    const entries = Object.values((await loadZip(archive)).files);
    expect(entries.filter((entry) => entry.dir).map((entry) => entry.name)).to.deep.equal(['nested/']);
    expect(
      entries
        .filter((entry) => !entry.dir)
        .map((entry) => entry.name)
        .sort(),
    ).to.deep.equal(['index.html', 'nested/app.js', 'run.sh']);
  });

  it('round-trips an archive through extraction, preserving content and executable bits', async () => {
    const outputPath = `${fixturePath}/out`;
    await extractZipTo(await buildFixtureArchive(), outputPath);

    expect(fs.readFileSync(`${outputPath}/nested/app.js`, 'utf8')).to.equal(
      fs.readFileSync(`${fixturePath}/src/nested/app.js`, 'utf8'),
    );
    expect(fs.statSync(`${outputPath}/run.sh`).mode & 0o777).to.equal(0o755);
  });

  it('extracts from an archive path as well as from a buffer', async () => {
    const archivePath = `${fixturePath}/build.zip`;
    fs.writeFileSync(archivePath, await buildFixtureArchive());
    await extractZipTo(archivePath, `${fixturePath}/from-path`);

    expect(fs.existsSync(`${fixturePath}/from-path/nested/app.js`)).to.equal(true);
  });

  it('resolves an entry by exact name, by basename, and by single-entry fallback', async () => {
    const nested = await loadZip(await buildFixtureArchive());
    expect(findZipEntry(nested, 'nested/app.js').name).to.equal('nested/app.js');
    expect(findZipEntry(nested, 'app.js').name).to.equal('nested/app.js');
    expect(findZipEntry(nested, 'absent.js')).to.equal(null);

    const single = await loadZip(
      await zipFromLocalFiles([{ localPath: `${fixturePath}/src/index.html`, entryName: 'deep/path/index.html' }]),
    );
    expect(findZipEntry(single, 'absent.js').name).to.equal('deep/path/index.html');
  });

  it('reads a wrapped entry out of a single-file archive', async () => {
    const inner = await buildFixtureArchive();
    fs.writeFileSync(`${fixturePath}/inner.zip`, inner);
    const wrapper = await zipFromLocalFiles([
      { localPath: `${fixturePath}/inner.zip`, entryName: 'wrapped/inner.zip' },
    ]);

    expect(await readZipEntry(wrapper, 'inner.zip')).to.deep.equal(inner);
  });

  it('flattens a single extracted entry into the target directory', async () => {
    const archive = await zipFromLocalFiles([
      { localPath: `${fixturePath}/src/index.html`, entryName: 'deep/path/index.html' },
    ]);
    const targetDir = `${fixturePath}/pull`;
    const written = await extractZipEntryTo(archive, 'index.html', targetDir);

    expect(written).to.equal(dir.resolve(targetDir, 'index.html'));
    expect(fs.readFileSync(written, 'utf8')).to.equal(fs.readFileSync(`${fixturePath}/src/index.html`, 'utf8'));
  });

  it('rejects a missing entry rather than writing an empty file', async () => {
    const archive = await buildFixtureArchive();
    let thrown;
    await extractZipEntryTo(archive, 'index.html', `${fixturePath}/missing`).catch((error) => (thrown = error));
    expect(thrown).to.equal(undefined);

    await extractZipEntryTo(await buildFixtureArchive(), 'absent.js', `${fixturePath}/missing`).catch(
      (error) => (thrown = error),
    );
    expect(thrown?.message).to.match(/Zip entry not found/);
  });

  it('blocks an archive entry that resolves outside the extraction root', async () => {
    const escaping = new JSZip();
    escaping.file('../escaped.txt', 'escaped');
    const archive = await escaping.generateAsync({ type: 'nodebuffer' });

    let thrown;
    await extractZipTo(archive, `${fixturePath}/guarded`).catch((error) => (thrown = error));

    expect(thrown?.message).to.match(/Blocked zip entry outside extraction directory/);
    expect(fs.existsSync(`${fixturePath}/escaped.txt`)).to.equal(false);
  });
});
