'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  cloneRepository,
  commitChanges,
  declareSafeDirectory,
  defaultBranch,
  discardChanges,
  fetchRepository,
  isReachable,
  mergeDependabot,
  pullRepository,
  pushRepository,
  remoteHead as remoteBranchHead,
  setOrigin,
  syncRepository,
  trackedFiles,
  undoCommits,
  unpushedCommits,
} from '../../../src/server/git/git.js';
import { changeSummaryFactory, changelogFactory, writeChangelog } from '../../../src/server/release/change-summary.js';

// Every Git process the runtime starts, as it starts it.
const started = vi.hoisted(() => []);
vi.mock('../../../src/server/runtime/process.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    runCommandSync: vi.fn((command, args, options) => {
      started.push({ command, args, env: options?.env ?? {} });
      return original.runCommandSync(command, args, options);
    }),
  };
});
// The Underpost env store holds no credential: each test sets the one it needs.
vi.mock('../../../src/server/runtime/environment.js', async (importOriginal) => ({
  ...(await importOriginal()),
  environmentValueFactory: () => '',
}));

const TOKEN = 'ghp_runtimefixturefixturefixture0001';

describe('the Git runtime', () => {
  let base;
  let url;
  let seed;

  // Repositories live under a temporary root: bare remotes reached over file://, and clones of them.
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, env: process.env, encoding: 'utf8', stdio: 'pipe' }).trim();
  const write = (dir, file, content) => fs.outputFileSync(path.join(dir, file), content);
  const commit = (dir, file, content, message = `change ${file}`) => {
    write(dir, file, content);
    git(dir, 'add', '--', file);
    git(dir, 'commit', '-q', '-m', message);
    return git(dir, 'rev-parse', 'HEAD');
  };
  const bare = (name) => {
    const dir = path.join(base, 'remotes', `${name}.git`);
    git(base, 'init', '-q', '--bare', '-b', 'main', dir);
    return `file://${dir}`;
  };
  const clone = (name, from = url) => {
    const dir = path.join(base, name);
    git(base, 'clone', '-q', from, dir);
    return dir;
  };
  const head = (dir, ref = 'HEAD') => git(dir, 'rev-parse', ref);
  const remoteHead = (remote, branch = 'main') => git(base, 'ls-remote', remote, `refs/heads/${branch}`).split('\t')[0];
  const failure = (run) => {
    try {
      run();
    } catch (error) {
      return error;
    }
    throw new Error('expected the operation to fail');
  };

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-git-runtime-'));
    const globalConfig = path.join(base, 'gitconfig');
    fs.writeFileSync(globalConfig, `[url "file://${base}/remotes/"]\n\tinsteadOf = https://github.com/acme/\n`);
    for (const [key, value] of Object.entries({
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'runtime',
      GIT_AUTHOR_EMAIL: 'runtime@example.test',
      GIT_COMMITTER_NAME: 'runtime',
      GIT_COMMITTER_EMAIL: 'runtime@example.test',
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
    }))
      vi.stubEnv(key, value);
    url = bare('app');
    seed = clone('seed');
    write(seed, '.gitignore', 'ignored.log\n');
    write(seed, 'conf/a/a.json', '{}\n');
    write(seed, 'conf/b/b.json', '{}\n');
    commit(seed, 'README.md', 'base\n', 'base');
    git(seed, 'add', '.');
    git(seed, 'commit', '-q', '-m', 'tree');
    git(seed, 'push', '-q', 'origin', 'main');
    started.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.removeSync(base);
  });

  describe('clone', () => {
    it('clones into a missing directory and reports the revision', () => {
      const target = path.join(base, 'work');
      expect(cloneRepository({ repository: url, destination: target })).to.deep.equal({
        path: target,
        revision: head(seed),
      });
      expect(git(target, 'remote', 'get-url', 'origin')).to.equal(url);
    });

    it('refuses an existing directory and leaves it as it was', () => {
      const target = path.join(base, 'work');
      write(target, 'keep.txt', 'mine');
      expect(failure(() => cloneRepository({ repository: url, destination: target })).reason).to.equal(
        'destination-exists',
      );
      expect(fs.readdirSync(target)).to.deep.equal(['keep.txt']);
    });

    it('replaces a directory only when asked, once the clone succeeded, leaving nothing beside it', () => {
      const target = path.join(base, 'work');
      write(target, 'keep.txt', 'mine');
      cloneRepository({ repository: url, destination: target, replace: true });
      expect(fs.existsSync(path.join(target, 'keep.txt'))).to.equal(false);
      expect(head(target)).to.equal(head(seed));
      expect(fs.readdirSync(base).filter((entry) => /\.(clone|replaced)-/.test(entry))).to.deep.equal([]);
    });

    it('leaves the directory as it was when the clone fails', () => {
      const target = path.join(base, 'work');
      write(target, 'keep.txt', 'mine');
      const error = failure(() =>
        cloneRepository({ repository: `file://${base}/remotes/missing.git`, destination: target, replace: true }),
      );
      expect(error.reason).to.equal('not-found');
      expect(fs.readdirSync(target)).to.deep.equal(['keep.txt']);
      expect(fs.readdirSync(base).filter((entry) => entry.startsWith('work.'))).to.deep.equal([]);
    });

    it('clones a git directory only, named after the repository', () => {
      const { path: target } = cloneRepository({ repository: url, cwd: base, bare: true });
      expect(target).to.equal(path.join(base, 'app.git'));
      expect(git(target, 'config', '--get', 'core.bare')).to.equal('true');
    });

    it('checks out a shallow history of only the directories asked for', () => {
      const target = path.join(base, 'work');
      cloneRepository({ repository: url, destination: target, depth: 1, sparse: ['conf/a'] });
      expect(fs.existsSync(path.join(target, 'conf/a/a.json'))).to.equal(true);
      expect(fs.existsSync(path.join(target, 'conf/b'))).to.equal(false);
      expect(git(target, 'rev-list', '--count', 'HEAD')).to.equal('1');
    });

    it('keeps the GitHub credential out of the URL, the git configuration and every argument', () => {
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      const target = path.join(base, 'work');
      cloneRepository({
        repository: 'https://x-access-token:stale-token@github.com/acme/app.git',
        destination: target,
      });
      expect(git(target, 'config', '--get', 'remote.origin.url')).to.equal('https://github.com/acme/app.git');
      const config = fs.readFileSync(path.join(target, '.git/config'), 'utf8');
      expect(config).to.not.include(TOKEN);
      expect(config).to.not.include('stale-token');
      expect(started.flatMap(({ args }) => args).join(' ')).to.not.include(TOKEN);
      const [cloned] = started.filter(({ args }) => args[0] === 'clone');
      expect(Object.values(cloned.env).some((value) => `${value}`.startsWith('AUTHORIZATION: basic '))).to.equal(true);
    });
  });

  describe('fetch', () => {
    it('updates the remote-tracking refs, prunes the branches the remote dropped, and leaves the work tree', () => {
      const work = clone('work');
      write(work, 'README.md', 'local edit\n');
      git(seed, 'push', '-q', 'origin', 'main:topic');
      fetchRepository({ path: work, prune: true });
      expect(git(work, 'branch', '-r')).to.include('origin/topic');
      git(seed, 'push', '-q', 'origin', '--delete', 'topic');
      fetchRepository({ path: work, prune: true });
      expect(git(work, 'branch', '-r')).to.not.include('origin/topic');
      expect(fs.readFileSync(path.join(work, 'README.md'), 'utf8')).to.equal('local edit\n');
    });

    it('names a remote the checkout does not have', () => {
      expect(failure(() => fetchRepository({ path: clone('work'), remote: 'upstream' })).reason).to.equal(
        'missing-remote',
      );
    });
  });

  describe('pull', () => {
    it('fast-forwards to the tracked branch, keeping local changes the update does not touch', () => {
      const work = clone('work');
      write(work, 'notes.txt', 'mine\n');
      const tip = commit(seed, 'README.md', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');
      const result = pullRepository({ path: work });
      expect(result).to.include({ to: tip, updated: true });
      expect(fs.readFileSync(path.join(work, 'notes.txt'), 'utf8')).to.equal('mine\n');
    });

    it('refuses a diverged history and leaves the branch where it was', () => {
      const work = clone('work');
      const local = commit(work, 'local.txt', 'local\n');
      commit(seed, 'remote.txt', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');
      expect(failure(() => pullRepository({ path: work })).reason).to.equal('non-fast-forward');
      expect(head(work)).to.equal(local);
    });

    it('refuses to overwrite a local change, and keeps it', () => {
      const work = clone('work');
      write(work, 'README.md', 'local edit\n');
      commit(seed, 'README.md', 'remote edit\n');
      git(seed, 'push', '-q', 'origin', 'main');
      expect(failure(() => pullRepository({ path: work })).reason).to.equal('conflict');
      expect(fs.readFileSync(path.join(work, 'README.md'), 'utf8')).to.equal('local edit\n');
    });

    it('pulls a named repository and branch into a branch that tracks none', () => {
      const work = clone('work');
      git(work, 'checkout', '-q', '-b', 'local');
      const tip = commit(seed, 'README.md', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');
      expect(pullRepository({ path: work, repository: url, branch: 'main' }).to).to.equal(tip);
    });

    it('needs a branch to update', () => {
      const work = clone('work');
      git(work, 'checkout', '-q', '--detach');
      expect(failure(() => pullRepository({ path: work })).reason).to.equal('missing-ref');
    });
  });

  describe('push', () => {
    it('publishes HEAD to the tracked branch and returns the published commit', () => {
      const work = clone('work');
      const local = commit(work, 'local.txt', 'local\n');
      expect(pushRepository({ path: work })).to.deep.equal({ remote: url, branch: 'main', revision: local });
      expect(remoteHead(url)).to.equal(local);
    });

    it('publishes a branch the remote does not have yet', () => {
      const work = clone('work');
      pushRepository({ path: work, branch: 'feature' });
      expect(remoteHead(url, 'feature')).to.equal(head(work));
    });

    it('refuses to replace a history it does not hold', () => {
      const work = clone('work');
      commit(seed, 'remote.txt', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');
      commit(work, 'local.txt', 'local\n');
      expect(failure(() => pushRepository({ path: work })).reason).to.equal('non-fast-forward');
    });

    it('replaces with a lease only what the checkout last saw', () => {
      const work = clone('work');
      const local = commit(work, 'local.txt', 'local\n');
      commit(seed, 'remote.txt', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');
      // The lease is the remote-tracking ref: unseen remote commits stay.
      expect(failure(() => pushRepository({ path: work, forceWithLease: true })).reason).to.equal('stale-lease');
      fetchRepository({ path: work });
      pushRepository({ path: work, forceWithLease: true });
      expect(remoteHead(url)).to.equal(local);
    });

    it('takes a lease from a configured remote only', () => {
      const work = clone('work');
      const other = bare('other');
      expect(failure(() => pushRepository({ path: work, repository: other, forceWithLease: true })).message).to.include(
        'needs a configured remote',
      );
      expect(() => pushRepository({ path: work, force: true, forceWithLease: true })).to.throw('not both');
    });

    it('replaces the remote branch whatever it holds when forced', () => {
      const work = clone('work');
      commit(seed, 'remote.txt', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');
      const local = commit(work, 'local.txt', 'local\n');
      pushRepository({ path: work, force: true });
      expect(remoteHead(url)).to.equal(local);
    });

    it('deletes a remote branch with its remote-tracking ref', () => {
      const work = clone('work');
      git(seed, 'push', '-q', 'origin', 'main:topic');
      fetchRepository({ path: work });
      pushRepository({ path: work, delete: 'topic' });
      expect(git(base, 'ls-remote', '--heads', url)).to.not.include('topic');
      expect(git(work, 'branch', '-r')).to.not.include('origin/topic');
    });
  });

  describe('merge-dependabot', () => {
    // A Dependabot branch on the remote, cut from the remote main.
    const dependabot = (name, file, content) => {
      const branch = `dependabot/npm_and_yarn/${name}`;
      git(seed, 'checkout', '-q', '-b', branch, 'main');
      commit(seed, file, content, `bump ${name}`);
      git(seed, 'push', '-q', 'origin', branch);
      git(seed, 'checkout', '-q', 'main');
      return branch;
    };

    it('merges each branch into the default branch, reports ok or failed, and returns the checkout as it was', () => {
      const clean = dependabot('a', 'a.txt', 'a\n');
      const conflicting = dependabot('b', 'README.md', 'b\n');
      const work = clone('work');
      git(work, 'branch', clean, `origin/${clean}`);
      const remoteMain = commit(seed, 'README.md', 'main\n');
      git(seed, 'push', '-q', 'origin', 'main');
      git(work, 'checkout', '-q', '-b', 'feature');
      write(work, 'conf/a/a.json', '{"local":true}\n');
      write(work, 'notes.txt', 'untracked');

      const result = mergeDependabot({ path: path.join(work, 'conf') });

      expect(result).to.deep.include({ root: work, base: 'main', restored: true, ok: false });
      expect(result.branches.map(({ branch, status }) => [branch, status])).to.deep.equal([
        [clean, 'ok'],
        [conflicting, 'failed'],
      ]);
      expect(result.branches[1].reason).to.match(/^CONFLICT .*README\.md/);
      expect(git(work, 'branch', '--show-current')).to.equal('feature');
      expect(fs.readFileSync(path.join(work, 'conf/a/a.json'), 'utf8')).to.equal('{"local":true}\n');
      expect(fs.readFileSync(path.join(work, 'notes.txt'), 'utf8')).to.equal('untracked');
      expect(git(work, 'stash', 'list')).to.equal('');
      // main holds the remote main and the clean branch, and no merge is left open.
      expect(git(work, 'show', 'main:a.txt')).to.equal('a');
      expect(git(work, 'show', 'main:README.md')).to.equal('main');
      expect(git(work, 'merge-base', '--is-ancestor', remoteMain, 'main')).to.equal('');
      expect(fs.existsSync(path.join(work, '.git/MERGE_HEAD'))).to.equal(false);
      expect(git(work, 'branch', '--list', clean)).to.equal('');
      // Nothing is pushed and no remote branch is deleted.
      expect(remoteHead(url)).to.equal(remoteMain);
      expect(remoteHead(url, conflicting)).to.not.equal('');
      expect(remoteHead(url, clean)).to.not.equal('');
    });

    it('merges into the branch asked for, and changes nothing without a Dependabot branch', () => {
      const work = clone('work');
      write(work, 'README.md', 'edited\n');
      expect(mergeDependabot({ path: work, base: 'main' })).to.deep.equal({
        root: work,
        base: 'main',
        branches: [],
        restored: true,
        ok: true,
      });
      expect(git(work, 'status', '--porcelain')).to.equal('M README.md');
    });

    it('stops before any merge when the base branch has diverged, and returns the checkout as it was', () => {
      dependabot('a', 'a.txt', 'a\n');
      const work = clone('work');
      const local = commit(work, 'local.txt', 'local\n');
      commit(seed, 'remote.txt', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');
      write(work, 'README.md', 'edited\n');

      const result = mergeDependabot({ path: work });

      expect(result).to.deep.include({ branches: [], restored: true, ok: false });
      expect(result.error).to.match(/^git merge: /);
      expect(head(work)).to.equal(local);
      expect(git(work, 'status', '--porcelain')).to.equal('M README.md');
    });
  });

  describe('sync', () => {
    it('clones a missing checkout at the default branch', () => {
      const target = path.join(base, 'managed');
      expect(syncRepository({ path: target, repository: url })).to.deep.equal({
        action: 'cloned',
        branch: 'main',
        revision: head(seed),
      });
    });

    it('replaces the work tree and reports what it discarded, keeping ignored files and other branches', () => {
      const work = clone('work');
      git(work, 'checkout', '-q', '-b', 'keep');
      const kept = commit(work, 'local.txt', 'local\n');
      git(work, 'checkout', '-q', 'main');
      commit(work, 'local.txt', 'local\n');
      write(work, 'README.md', 'edited\n');
      write(work, 'untracked.txt', 'x');
      write(work, 'ignored.log', 'log');
      const tip = commit(seed, 'remote.txt', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');

      const result = syncRepository({ path: work, repository: url });
      expect(result).to.deep.equal({
        action: 'replaced',
        branch: 'main',
        revision: tip,
        discarded: { commits: 1, changed: 1, untracked: 1 },
      });
      expect(git(work, 'status', '--porcelain')).to.equal('');
      expect(fs.existsSync(path.join(work, 'ignored.log'))).to.equal(true);
      expect(head(work, 'keep')).to.equal(kept);
      expect(git(work, 'rev-parse', '--abbrev-ref', '@{upstream}')).to.equal('origin/main');
    });

    it('reports without changing anything in a dry run', () => {
      const work = clone('work');
      const local = commit(work, 'local.txt', 'local\n');
      write(work, 'README.md', 'edited\n');
      commit(seed, 'remote.txt', 'remote\n');
      git(seed, 'push', '-q', 'origin', 'main');
      const other = bare('other');
      const result = syncRepository({ path: work, repository: other.replace('other', 'app'), dryRun: true });
      expect(result).to.include({ action: 'planned', branch: 'main' });
      expect(result.discarded).to.deep.equal({ commits: 1, changed: 1, untracked: 0 });
      expect(head(work)).to.equal(local);
      expect(fs.readFileSync(path.join(work, 'README.md'), 'utf8')).to.equal('edited\n');
    });

    it('repoints origin at another repository', () => {
      const work = clone('work');
      const other = bare('other');
      const elsewhere = clone('elsewhere', other);
      git(elsewhere, 'checkout', '-q', '-b', 'main');
      const tip = commit(elsewhere, 'other.txt', 'other\n');
      git(elsewhere, 'push', '-q', 'origin', 'main');
      expect(syncRepository({ path: work, repository: other }).revision).to.equal(tip);
      expect(git(work, 'remote', 'get-url', 'origin')).to.equal(other);
      expect(fs.existsSync(path.join(work, 'README.md'))).to.equal(false);
    });

    it('declares safe a checkout another user owns, and no checkout of its own user', () => {
      const work = clone('work');
      syncRepository({ path: work, repository: url });
      expect(git(base, 'config', '--global', '--default', '', '--get', 'safe.directory')).to.equal('');

      vi.spyOn(process, 'getuid').mockReturnValue(fs.statSync(work).uid + 1);
      try {
        syncRepository({ path: work, repository: url });
      } finally {
        vi.mocked(process.getuid).mockRestore();
      }
      expect(git(base, 'config', '--global', '--get-all', 'safe.directory')).to.equal(work);
    });

    it('lands on the branch asked for, leaving the branch it was on where it was', () => {
      const work = clone('work');
      git(work, 'checkout', '-q', '-b', 'feature');
      const feature = commit(work, 'feature.txt', 'feature\n');
      syncRepository({ path: work, repository: url, branch: 'main' });
      expect(git(work, 'branch', '--show-current')).to.equal('main');
      expect(head(work, 'feature')).to.equal(feature);
    });

    it('refuses a directory that holds files but no checkout', () => {
      const target = path.join(base, 'plain');
      write(target, 'file.txt', 'x');
      expect(failure(() => syncRepository({ path: target, repository: url })).message).to.include('no checkout');
    });
  });

  describe('discard', () => {
    let work;
    beforeEach(() => {
      work = clone('work');
      write(work, 'staged.txt', 'new\n');
      git(work, 'add', 'staged.txt');
      git(work, 'mv', 'conf/a/a.json', 'conf/a/renamed.json');
      write(work, 'README.md', 'edited\n');
      fs.removeSync(path.join(work, 'conf/b/b.json'));
      write(work, 'untracked.txt', 'x');
      write(work, 'ignored.log', 'log');
    });

    it('lists every change with its repository root, and changes nothing unless forced', () => {
      const before = git(work, 'status', '--porcelain');
      const { root, scope, entries, discarded } = discardChanges({ path: work });
      expect({ root, scope, discarded }).to.deep.equal({ root: work, scope: '.', discarded: false });
      expect(entries).to.deep.include.members([
        { status: 'A ', path: 'staged.txt' },
        { status: 'R ', path: 'conf/a/renamed.json', from: 'conf/a/a.json' },
        { status: ' M', path: 'README.md' },
        { status: ' D', path: 'conf/b/b.json' },
        { status: '??', path: 'untracked.txt' },
      ]);
      expect(git(work, 'status', '--porcelain')).to.equal(before);
    });

    it('discards staged, unstaged and untracked changes, and keeps ignored files', () => {
      expect(discardChanges({ path: work, force: true }).discarded).to.equal(true);
      expect(git(work, 'status', '--porcelain')).to.equal('');
      expect(fs.existsSync(path.join(work, 'ignored.log'))).to.equal(true);
      expect(fs.readFileSync(path.join(work, 'conf/b/b.json'), 'utf8')).to.equal('{}\n');
    });

    it('discards ignored files only when asked', () => {
      discardChanges({ path: work, force: true, ignored: true });
      expect(fs.existsSync(path.join(work, 'ignored.log'))).to.equal(false);
    });

    it('discards only under the directory it names', () => {
      const { root, scope } = discardChanges({ path: path.join(work, 'conf'), force: true });
      expect({ root, scope }).to.deep.equal({ root: work, scope: 'conf' });
      expect(git(work, 'status', '--porcelain', '--', 'conf')).to.equal('');
      expect(fs.readFileSync(path.join(work, 'README.md'), 'utf8')).to.equal('edited\n');
      expect(fs.existsSync(path.join(work, 'untracked.txt'))).to.equal(true);
    });

    it('refuses a directory inside a repository when the root is required, and a path in no repository', () => {
      expect(failure(() => discardChanges({ path: path.join(work, 'conf'), root: true })).message).to.include(
        `the repository root is ${work}`,
      );
      const plain = path.join(base, 'plain');
      fs.mkdirpSync(plain);
      expect(failure(() => discardChanges({ path: plain, force: true })).reason).to.equal('not-a-repository');
    });
  });

  describe('commits', () => {
    it('commits the staged changes only, leaving the rest of the index and the tree as they were', () => {
      const work = clone('work');
      write(work, 'staged.txt', 'staged\n');
      git(work, 'add', 'staged.txt');
      write(work, 'README.md', 'unstaged\n');
      const { revision } = commitChanges({ path: work, message: 'feat: ✨ add "staged" $HOME `x`\n\nbody' });
      expect(git(work, 'log', '-1', '--format=%B')).to.equal('feat: ✨ add "staged" $HOME `x`\n\nbody');
      expect(git(work, 'show', '--name-only', '--format=', revision)).to.equal('staged.txt');
      expect(git(work, 'status', '--porcelain')).to.equal('M README.md');
    });

    it('needs a message, and something staged unless an empty commit is asked for', () => {
      const work = clone('work');
      expect(() => commitChanges({ path: work, message: ' ' })).to.throw('needs a message');
      expect(failure(() => commitChanges({ path: work, message: 'x' })).message).to.include('git commit');
      expect(commitChanges({ path: work, message: 'x', empty: true }).revision).to.equal(head(work));
    });

    it('amends the last commit keeping its message, and undoes commits keeping their changes staged', () => {
      const work = clone('work');
      const first = commit(work, 'a.txt', 'a\n', 'first');
      write(work, 'b.txt', 'b\n');
      git(work, 'add', 'b.txt');
      const amended = commitChanges({ path: work, amend: true }).revision;
      expect(amended).to.not.equal(first);
      expect(git(work, 'log', '-1', '--format=%s')).to.equal('first');
      expect(undoCommits({ path: work, count: 1 })).to.deep.equal({ from: amended, to: head(seed) });
      expect(git(work, 'diff', '--cached', '--name-only').split('\n')).to.deep.equal(['a.txt', 'b.txt']);
      expect(() => undoCommits({ path: work, count: 'all' })).to.throw('is not a number of commits');
    });
  });

  describe('failures', () => {
    it('reports a checkout another Git process holds, and leaves it as it was', () => {
      const work = clone('work');
      write(work, 'a.txt', 'a\n');
      git(work, 'add', 'a.txt');
      fs.writeFileSync(path.join(work, '.git/index.lock'), '');
      expect(failure(() => commitChanges({ path: work, message: 'x' })).reason).to.equal('locked');
      expect(head(work)).to.equal(head(seed));
    });

    it('refuses a ref or a remote an argument parser would read as an option, before Git runs', () => {
      const work = clone('work');
      started.length = 0;
      expect(failure(() => pullRepository({ path: work, branch: '--upload-pack=touch x' })).reason).to.equal(
        'invalid-ref',
      );
      expect(() => fetchRepository({ path: work, remote: '-x' })).to.throw('is not a valid remote name');
      expect(started.some(({ args }) => args[0] === 'fetch')).to.equal(false);
    });

    it('classifies an unreachable remote as a network failure', () => {
      const unreachable = 'http://127.0.0.1:9/app.git';
      expect(
        failure(() => cloneRepository({ repository: unreachable, destination: path.join(base, 'x') })).reason,
      ).to.equal('network');
      expect(isReachable(unreachable)).to.equal(false);
      expect(failure(() => defaultBranch(unreachable)).reason).to.equal('network');
    });

    it('runs Git itself, never a shell', () => {
      const work = clone('work');
      pullRepository({ path: work });
      expect(started.length).to.be.greaterThan(0);
      expect(started.every(({ command }) => command === 'git')).to.equal(true);
    });
  });

  describe('remotes and inspection', () => {
    it('reads the default branch and the branch tips of a remote, and whether it answers', () => {
      const work = clone('work');
      expect(defaultBranch(url)).to.equal('main');
      expect(remoteBranchHead({ path: work, branch: 'main' })).to.equal(head(seed));
      expect(remoteBranchHead({ path: work, branch: 'absent' })).to.equal('');
      expect(remoteBranchHead({ path: work, branch: 'main', remote: 'upstream' })).to.equal('');
      expect(isReachable(url)).to.equal(true);
      expect(isReachable('engine')).to.equal(false);
    });

    it('names a checkout with no remote to pull from or push to, and a detached HEAD to push', () => {
      const work = clone('work');
      git(work, 'remote', 'remove', 'origin');
      expect(failure(() => pullRepository({ path: work })).reason).to.equal('missing-remote');
      expect(failure(() => pushRepository({ path: work })).reason).to.equal('missing-remote');
      git(work, 'remote', 'add', 'origin', url);
      git(work, 'checkout', '-q', '--detach');
      expect(failure(() => pushRepository({ path: work })).reason).to.equal('missing-ref');
      expect(unpushedCommits({ path: work })).to.deep.equal({ count: 0, branch: '', error: 'detached HEAD' });
    });

    it('publishes to a GitHub repository named by its slug, with no remote configured for it', () => {
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      const work = clone('work');
      const local = commit(work, 'local.txt', 'local\n');
      expect(pushRepository({ path: work, repository: 'acme/app', branch: 'published' })).to.deep.equal({
        remote: 'acme/app',
        branch: 'published',
        revision: local,
      });
      expect(remoteBranchHead({ path: work, branch: 'published' })).to.equal(local);
    });

    it('lists the paths of the index under a directory', () => {
      const work = clone('work');
      write(work, 'conf/untracked.json', '{}');
      expect(trackedFiles(path.join(work, 'conf'))).to.deep.equal([
        path.join(work, 'conf/a/a.json'),
        path.join(work, 'conf/b/b.json'),
      ]);
    });

    it('declares a directory safe once, by its absolute path', () => {
      const work = clone('work');
      declareSafeDirectory(path.relative(process.cwd(), work));
      declareSafeDirectory(work);
      expect(git(base, 'config', '--global', '--get-all', 'safe.directory')).to.equal(work);
    });

    it('points origin at a GitHub repository in the transport the origin uses', () => {
      const work = clone('work');
      setOrigin({ path: work, repository: 'acme/app' });
      expect(git(work, 'config', '--get', 'remote.origin.url')).to.equal('https://github.com/acme/app.git');
      expect(() => setOrigin({ path: work, repository: 'https://gitlab.com/acme/app' })).to.throw(
        'names no GitHub repository',
      );
    });

    it('plans a clone of a missing managed checkout without making it, and adds an origin a checkout lacks', () => {
      const target = path.join(base, 'managed');
      expect(syncRepository({ path: target, repository: url, dryRun: true })).to.deep.equal({
        action: 'planned',
        branch: 'main',
        revision: '',
        discarded: null,
      });
      expect(fs.existsSync(target)).to.equal(false);
      const work = clone('work');
      git(work, 'remote', 'remove', 'origin');
      expect(syncRepository({ path: work, repository: url }).revision).to.equal(head(seed));
      expect(git(work, 'remote', 'get-url', 'origin')).to.equal(url);
    });

    it('refuses to replace the root or a directory holding the working directory, and to discard a missing path', () => {
      expect(() => cloneRepository({ repository: url, destination: '/', replace: true })).to.throw('is the root');
      expect(failure(() => discardChanges({ path: path.join(base, 'absent') })).reason).to.equal('not-a-repository');
    });
  });

  describe('history', () => {
    it('summarizes the tagged commits of the latest commits, newest first, with their source', () => {
      const work = clone('work');
      git(work, 'remote', 'set-url', 'origin', 'https://github.com/acme/app.git');
      const one = commit(work, 'one.txt', '1', '[cli] one');
      commit(work, 'two.txt', '2', 'untagged');
      const three = commit(work, 'three.txt', '3', '[test] "three" with `code`');
      expect(changeSummaryFactory({ path: work, count: 3 })).to.deep.equal({
        schema: 1,
        source: { repository: 'acme/app', revision: three },
        entries: [
          { scope: 'test', subject: '"three" with `code`', revision: three },
          { scope: 'cli', subject: 'one', revision: one },
        ],
      });
      expect(changeSummaryFactory({ path: work }).entries).to.have.length(1);
    });

    it('writes the changelog of the changes since the last release, then of each release, down to a minimum', () => {
      const work = clone('work');
      git(work, 'remote', 'set-url', 'origin', 'https://github.com/acme/app.git');
      expect(changelogFactory({ path: work })).to.equal('No changelog entries found.\n');
      commit(work, 'a.txt', 'a', '[a] old');
      commit(work, 'r1.txt', 'r1', 'ci(package): ⚙️ New release v:1.0.0');
      const b = commit(work, 'b.txt', 'b', '[b] "quoted" new');
      commit(work, 'r2.txt', 'r2', 'ci(package): ⚙️ New release v:1.1.0');
      const c = commit(work, 'c.txt', 'c', '[c] next');
      const link = (revision) =>
        `([${git(work, 'rev-parse', '--short', revision)}](https://github.com/acme/app/commit/${revision}))`;
      const date = (version) => git(work, 'log', '-1', '--format=%ci', `--grep=New release v:${version}`).split(' ')[0];
      const today = new Date().toISOString().split('T')[0];
      expect(changelogFactory({ path: work, minVersion: '1.1.0' })).to.equal(
        `## ${today}\n\n### c\n\n- next ${link(c)}\n\n` +
          `## New release v:1.1.0 (${date('1.1.0')})\n\n### b\n\n- quoted new ${link(b)}\n\n`,
      );
      expect(changelogFactory({ path: work })).to.include(
        `## New release v:1.0.0 (${date('1.0.0')})\n\n### a\n\n- old`,
      );
      expect(fs.readFileSync(writeChangelog({ path: work }), 'utf8')).to.match(/^# Changelog\n\n## /);
    });
  });
});
