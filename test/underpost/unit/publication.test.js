'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import {
  publishDirectory,
  recoverPublication,
  recoverPublications,
  stagingDirectoryFactory,
} from '../../../src/server/build/publication.js';
import { clearDirectory } from '../../../src/client-builder/client-build.js';

describe('directory publication', () => {
  let root;
  let target;

  const write = (directory, content) => fs.outputFileSync(nodePath.join(directory, 'index.html'), content);
  const read = (directory) => fs.readFileSync(nodePath.join(directory, 'index.html'), 'utf8');

  beforeEach(() => {
    root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-publication-'));
    target = nodePath.join(root, '1.2.3');
  });

  afterEach(() => {
    fs.removeSync(root);
  });

  it('stages beside the target', () => {
    expect(nodePath.dirname(stagingDirectoryFactory(target))).to.equal(root);
    expect(nodePath.basename(stagingDirectoryFactory(target))).to.match(/^\.staging-1\.2\.3-\d+-\d+$/);
  });

  it('publishes a first version, then replaces it and leaves nothing beside it', () => {
    const first = stagingDirectoryFactory(target);
    write(first, 'first');
    expect(publishDirectory({ staging: first, target })).to.deep.equal({ replaced: false });
    const second = `${stagingDirectoryFactory(target)}-b`;
    write(second, 'second');
    expect(publishDirectory({ staging: second, target })).to.deep.equal({ replaced: true });
    expect(read(target)).to.equal('second');
    expect(fs.readdirSync(root)).to.deep.equal(['1.2.3']);
  });

  it('puts the published version back when the new one cannot move in', () => {
    write(target, 'published');
    expect(() => publishDirectory({ staging: nodePath.join(root, '.staging-missing'), target })).to.throw(/ENOENT/);
    expect(read(target)).to.equal('published');
    expect(fs.readdirSync(root)).to.deep.equal(['1.2.3']);
  });

  it('restores the backup an interrupted replacement left, and drops its staging directory', () => {
    write(nodePath.join(root, '.backup-1.2.3-1-1'), 'published');
    write(nodePath.join(root, '.staging-1.2.3-1-1'), 'half');
    expect(recoverPublication(target)).to.deep.equal({ restored: true, removed: ['.staging-1.2.3-1-1'] });
    expect(read(target)).to.equal('published');
    expect(fs.readdirSync(root)).to.deep.equal(['1.2.3']);
  });

  it('drops a backup once its target is back in place, and leaves other versions alone', () => {
    write(target, 'published');
    write(nodePath.join(root, '.backup-1.2.3-1-1'), 'older');
    write(nodePath.join(root, '.staging-0.9.0-1-1'), 'other');
    expect(recoverPublication(target)).to.deep.equal({ restored: false, removed: ['.backup-1.2.3-1-1'] });
    expect(read(target)).to.equal('published');
    expect(recoverPublication(nodePath.join(root, 'absent', 'x'))).to.deep.equal({ restored: false, removed: [] });
  });

  it('repairs only the target a leftover names, never one whose name it starts with', () => {
    write(nodePath.join(root, 'item'), 'item');
    write(nodePath.join(root, '.staging-item-ledger-1-1'), 'half');
    expect(recoverPublication(nodePath.join(root, 'item'))).to.deep.equal({ restored: false, removed: [] });
    expect(fs.existsSync(nodePath.join(root, '.staging-item-ledger-1-1'))).to.equal(true);
  });

  it('repairs every interrupted cycle of a directory, whatever version it left', () => {
    write(nodePath.join(root, '.backup-1.2.2-1-1'), 'older');
    write(nodePath.join(root, '.staging-1.2.2-1-1'), 'half');
    write(target, 'published');
    write(nodePath.join(root, '.backup-1.2.3-1-1'), 'replaced');
    write(nodePath.join(root, '.staging-item-ledger-7-7'), 'half');
    const result = recoverPublications(root);
    expect(result.restored).to.deep.equal(['1.2.2']);
    expect(result.removed.sort()).to.deep.equal([
      '.backup-1.2.3-1-1',
      '.staging-1.2.2-1-1',
      '.staging-item-ledger-7-7',
    ]);
    expect(read(nodePath.join(root, '1.2.2'))).to.equal('older');
    expect(read(target)).to.equal('published');
    expect(fs.readdirSync(root).sort()).to.deep.equal(['1.2.2', '1.2.3']);
    expect(recoverPublications(nodePath.join(root, 'absent'))).to.deep.equal({ restored: [], removed: [] });
  });
});

describe('client root clearing', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-client-root-'));
  });

  afterEach(() => {
    fs.removeSync(root);
  });

  it('removes the client build and keeps the published TypeDoc sites', () => {
    for (const file of ['index.html', 'components/core/A.js', 'docs/manifest.json', 'docs/engine/1.2.3/index.html'])
      fs.outputFileSync(nodePath.join(root, file), file);
    clearDirectory(root, ['docs/engine']);
    expect(fs.readdirSync(root)).to.deep.equal(['docs']);
    expect(fs.readdirSync(nodePath.join(root, 'docs'))).to.deep.equal(['engine']);
    expect(fs.existsSync(nodePath.join(root, 'docs/engine/1.2.3/index.html'))).to.equal(true);
    clearDirectory(nodePath.join(root, 'absent'), ['docs/engine']);
  });

  it('keeps the root of another client of the host below this one', () => {
    for (const file of ['index.html', 'wp/index.php', 'wp/docs/engine/1.0.0/index.html'])
      fs.outputFileSync(nodePath.join(root, file), file);
    clearDirectory(root, ['docs/engine', 'wp']);
    expect(fs.readdirSync(root)).to.deep.equal(['wp']);
    expect(fs.existsSync(nodePath.join(root, 'wp/docs/engine/1.0.0/index.html'))).to.equal(true);
  });
});
