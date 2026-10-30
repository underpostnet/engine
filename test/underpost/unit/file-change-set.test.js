'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { withExecutionProfile } from '../../../src/server/build/execution.js';
import {
  applyChangeSet,
  fileChange,
  jsonFileChange,
  recoverChangeSets,
} from '../../../src/server/storage/file-change-set.js';

describe('file change set', () => {
  const cwd = process.cwd();
  let root;

  const tree = () =>
    fs
      .readdirSync(root, { recursive: true })
      .map((entry) => `${entry}`)
      .filter((entry) => fs.statSync(path.join(root, entry)).isFile())
      .sort();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-change-set-'));
    process.chdir(root);
    fs.outputFileSync('conf/a.json', '{"a":1}');
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('plans each change against the tree and writes the whole set', () => {
    const changes = [
      jsonFileChange('conf/a.json', { a: 2 }, 'update a'),
      fileChange('conf/new/b.txt', 'b', 'create b'),
      fileChange('conf/a.json', '{"a":1}'),
    ];
    const { applied, plan } = applyChangeSet(changes.slice(0, 2));
    expect(applied).to.equal(true);
    expect(plan.map(({ action }) => action)).to.deep.equal(['update', 'create']);
    expect(fs.readJsonSync('conf/a.json')).to.deep.equal({ a: 2 });
    expect(fs.readFileSync('conf/new/b.txt', 'utf8')).to.equal('b');
    expect(tree()).to.deep.equal(['conf/a.json', 'conf/new/b.txt']);
    expect(applyChangeSet(changes.slice(0, 2)).plan.map(({ action }) => action)).to.deep.equal([
      'unchanged',
      'unchanged',
    ]);
  });

  it('writes nothing on a dry run or under a profile without filesystem writes', () => {
    const changes = [fileChange('conf/a.json', 'x'), fileChange('conf/c.txt', 'c')];
    expect(applyChangeSet(changes, { dryRun: true }).applied).to.equal(false);
    expect(withExecutionProfile('OFFLINE_DRY_RUN', () => applyChangeSet(changes)).applied).to.equal(false);
    expect(tree()).to.deep.equal(['conf/a.json']);
    expect(fs.readFileSync('conf/a.json', 'utf8')).to.equal('{"a":1}');
  });

  it('restores every file when a write fails part way', () => {
    const rename = fs.renameSync;
    let renames = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (++renames === 3) throw new Error('disk full');
      return rename(from, to);
    });
    expect(() =>
      applyChangeSet([fileChange('conf/a.json', 'x'), fileChange('conf/c.txt', 'c'), fileChange('conf/d.txt', 'd')]),
    ).to.throw('disk full');
    vi.restoreAllMocks();
    expect(tree()).to.deep.equal(['conf/a.json']);
    expect(fs.readFileSync('conf/a.json', 'utf8')).to.equal('{"a":1}');
  });

  it('rolls back the change set an interrupted process left', () => {
    const id = 'interrupted';
    fs.renameSync('conf/a.json', `conf/a.json.backup-${id}`);
    fs.outputFileSync('conf/a.json', 'half written');
    fs.outputFileSync('conf/c.txt', 'created');
    fs.outputFileSync(`conf/d.txt.stage-${id}`, 'staged');
    fs.outputJsonSync(`.underpost/change-sets/${id}.json`, [
      { path: 'conf/a.json', stage: `conf/a.json.stage-${id}`, backup: `conf/a.json.backup-${id}`, created: false },
      { path: 'conf/c.txt', stage: `conf/c.txt.stage-${id}`, backup: `conf/c.txt.backup-${id}`, created: true },
      { path: 'conf/d.txt', stage: `conf/d.txt.stage-${id}`, backup: `conf/d.txt.backup-${id}`, created: true },
    ]);
    expect(recoverChangeSets()).to.deep.equal(['conf/a.json', 'conf/c.txt', 'conf/d.txt']);
    expect(tree()).to.deep.equal(['conf/a.json']);
    expect(fs.readFileSync('conf/a.json', 'utf8')).to.equal('{"a":1}');
  });
});
