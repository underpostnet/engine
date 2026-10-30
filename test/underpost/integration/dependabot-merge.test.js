'use strict';

import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import UnderpostRepository from '../../../src/cli/repository.js';

// Every repository is a fixture under a temporary root: an origin, a seed that publishes branches, a work clone.
describe('dependabot merge', () => {
  let root;
  let work;

  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const commit = (cwd, file, content, message) => {
    fs.outputFileSync(path.join(cwd, file), content);
    git(cwd, 'add', file);
    git(cwd, 'commit', '-q', '-m', message);
  };
  const identity = (cwd) => {
    git(cwd, 'config', 'user.name', 'fixture');
    git(cwd, 'config', 'user.email', 'fixture@example.invalid');
  };
  const publish = (seed, branch, file, content) => {
    git(seed, 'checkout', '-q', '-b', branch, 'master');
    commit(seed, file, content, branch);
    git(seed, 'push', '-q', 'origin', branch);
    git(seed, 'checkout', '-q', 'master');
  };
  const merge = () => UnderpostRepository.API.mergeDependabot({ path: work });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-dependabot-'));
    const origin = path.join(root, 'origin.git');
    const seed = path.join(root, 'seed');
    work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'master', origin);
    git(root, 'clone', '-q', origin, seed);
    identity(seed);
    git(seed, 'checkout', '-q', '-b', 'master');
    commit(seed, 'README.md', 'base\n', 'base');
    commit(seed, 'deps.txt', 'lib 1\n', 'deps');
    git(seed, 'push', '-q', 'origin', 'master');
    publish(seed, 'dependabot/npm_and_yarn/lib-a', 'deps.txt', 'lib 2\n');
    publish(seed, 'dependabot/npm_and_yarn/lib-c', 'deps.txt', 'lib 3\n');
    git(root, 'clone', '-q', origin, work);
    identity(work);
    git(work, 'checkout', '-q', '-b', 'topic');
    fs.writeFileSync(path.join(work, 'README.md'), 'local edit\n');
    fs.writeFileSync(path.join(work, 'notes.txt'), 'untracked\n');
    git(work, 'branch', '-q', 'dependabot/npm_and_yarn/lib-a', 'origin/dependabot/npm_and_yarn/lib-a');
  });

  afterEach(() => fs.removeSync(root));

  it('merges each branch in turn, aborts a conflict, and restores the branch and the stash', () => {
    expect(merge()).to.deep.equal({
      ok: false,
      merged: ['dependabot/npm_and_yarn/lib-a'],
      failed: ['dependabot/npm_and_yarn/lib-c'],
      restored: true,
    });
    expect(git(work, 'show', 'master:deps.txt')).to.equal('lib 2');
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD')).to.equal('topic');
    expect(fs.readFileSync(path.join(work, 'README.md'), 'utf8')).to.equal('local edit\n');
    expect(fs.readFileSync(path.join(work, 'notes.txt'), 'utf8')).to.equal('untracked\n');
    expect(git(work, 'stash', 'list')).to.equal('');
    expect(git(work, 'branch', '--list', 'dependabot/*')).to.equal('');
    expect(git(work, 'ls-remote', '--heads', 'origin', 'dependabot/*').split('\n')).to.have.length(2);
  });

  it('stops before any merge when the base branch cannot fast-forward, and restores the workspace', () => {
    git(work, 'stash', '-q', '--include-untracked');
    git(work, 'checkout', '-q', 'master');
    commit(work, 'local.txt', 'diverged\n', 'local');
    git(path.join(root, 'seed'), 'checkout', '-q', 'master');
    commit(path.join(root, 'seed'), 'remote.txt', 'remote\n', 'remote');
    git(path.join(root, 'seed'), 'push', '-q', 'origin', 'master');
    git(work, 'checkout', '-q', 'topic');
    git(work, 'stash', 'pop', '-q');

    expect(merge()).to.deep.equal({
      ok: false,
      merged: [],
      failed: [],
      restored: true,
      error: 'master cannot fast-forward to origin/master',
    });
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD')).to.equal('topic');
    expect(fs.readFileSync(path.join(work, 'README.md'), 'utf8')).to.equal('local edit\n');
    expect(git(work, 'stash', 'list')).to.equal('');
  });

  it('changes nothing when origin has no Dependabot branch', () => {
    for (const branch of ['lib-a', 'lib-c'])
      git(path.join(root, 'seed'), 'push', '-q', 'origin', '--delete', `dependabot/npm_and_yarn/${branch}`);
    expect(merge()).to.deep.equal({ ok: true, merged: [], failed: [], restored: true });
    expect(git(work, 'status', '--porcelain')).to.include('README.md');
  });
});
