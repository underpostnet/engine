import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Underpost from '../../../src/index.js';
import {
  ReleaseWorkspace,
  pruneReleaseStore,
  stageReleaseEngine,
} from '../../../src/server/release/release-workspace.js';
import { mirrorRevision } from '../../../src/server/release/source-mirror.js';

// The source repositories are local bare repositories reached over `file://`.
const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.email=release@test', '-c', 'user.name=release', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

describe('the release store, the checkout origin and the source mirror', () => {
  let base;
  let root;
  let work;
  const remote = (name) => ({ url: `file://${path.join(base, 'remotes', `${name}.git`)}`, env: process.env });

  /** Commits a file to the work tree, pushes it to a repository, and returns the commit. */
  const commit = (text, to = 'widget-private') => {
    fs.writeFileSync(path.join(work, 'README.md'), `${text}\n`);
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', text);
    git(work, 'push', '-q', remote(to).url, 'HEAD:refs/heads/main');
    return git(work, 'rev-parse', 'HEAD');
  };

  const materialize = (releaseId, sourceRevision) =>
    ReleaseWorkspace.materialize({
      root,
      releaseId,
      record: { sourceRepository: 'acme/widget-private', sourceRevision, channel: 'private' },
      remote: remote('widget-private'),
    });

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'source-release-it-'));
    root = path.join(base, 'store');
    work = path.join(base, 'work');
    for (const name of ['widget-private', 'widget'])
      git(base, 'init', '-q', '--bare', '-b', 'main', path.join(base, 'remotes', `${name}.git`));
    git(base, 'init', '-q', '-b', 'main', work);
    // A sealed workspace is read only: the write bits come back before removal.
    return () => {
      execFileSync('chmod', ['-R', 'u+w', base]);
      fs.removeSync(base);
    };
  });

  describe('the release workspace', () => {
    it('holds exactly the revision, sealed, with no remote and no credential', () => {
      const first = commit('first');
      commit('second');
      const workspace = materialize('r1', first);
      expect(fs.readFileSync(path.join(workspace.sourceDir, 'README.md'), 'utf8')).toBe('first\n');
      expect(workspace.record()).toMatchObject({ releaseId: 'r1', sourceRevision: first, channel: 'private' });
      expect(fs.readFileSync(path.join(workspace.sourceDir, '.git/config'), 'utf8')).not.toMatch(/\[remote/);
      // The seal is the file mode: root writes through it, so the mode is what holds for every user.
      expect(fs.statSync(path.join(workspace.sourceDir, 'README.md')).mode & 0o777).toBe(0o444);
      expect(() => workspace.verify()).not.toThrow();
    });

    it('opens the store and its workspaces to another user, as a Release Job reads them', () => {
      fs.mkdirpSync(root, { mode: 0o750 });
      fs.chmodSync(root, 0o750);
      const workspace = materialize('r1', commit('first'));
      for (const dir of [root, workspace.dir, workspace.sourceDir]) expect(fs.statSync(dir).mode & 0o005).toBe(0o005);
      expect(fs.statSync(path.join(workspace.sourceDir, 'README.md')).mode & 0o777).toBe(0o444);
    });

    it('is reused for the same revision on a retry, and refused for another one', () => {
      const first = commit('first');
      const second = commit('second');
      materialize('r1', first);
      expect(materialize('r1', first).record().sourceRevision).toBe(first);
      expect(() => materialize('r1', second)).toThrow(/holds another revision/);
    });

    it('fails, and leaves nothing behind, when the repository does not hold the revision', () => {
      commit('first');
      expect(() => materialize('r2', 'f'.repeat(40))).toThrow(/acme\/widget-private holds no revision f{40}/);
      expect(fs.existsSync(path.join(root, 'r2'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'r2.partial'))).toBe(false);
    });

    it('takes only an exact revision, and cleans up only its own release', () => {
      const first = commit('first');
      expect(() => materialize('r3', 'main')).toThrow(/exact 40-character/);
      const kept = materialize('r4', first);
      const removed = materialize('r5', first);
      removed.cleanup();
      expect(removed.exists()).toBe(false);
      expect(kept.exists()).toBe(true);
    });

    it('is pruned on the host: every sealed workspace but the kept one, a partial fetch included', () => {
      const first = commit('first');
      for (const releaseId of ['r1', 'r2', 'r3']) materialize(releaseId, first);
      fs.mkdirpSync(path.join(root, 'r4.partial', 'source'));
      fs.mkdirpSync(path.join(root, '.engine'));
      expect(pruneReleaseStore({ root, keep: ['r2'] })).toEqual(['r1', 'r3', 'r4']);
      expect(fs.readdirSync(root).sort()).toEqual(['.engine', 'r2']);
      expect(new ReleaseWorkspace({ root, releaseId: 'r2' }).record().sourceRevision).toBe(first);
      expect(pruneReleaseStore({ root, keep: ['r2'] })).toEqual([]);
    });
  });

  describe('the engine a Release Job runs', () => {
    /** An engine checkout with one tracked file, one file it never committed, and a deploy conf. */
    const engineFactory = () => {
      const engine = path.join(base, 'engine');
      const conf = path.join(engine, 'engine-private/conf/dd-widget');
      git(base, 'init', '-q', '-b', 'main', engine);
      fs.outputFileSync(path.join(engine, 'bin/cli.js'), 'v1\n');
      fs.outputFileSync(path.join(engine, 'package.json'), '{"name":"engine"}\n');
      git(engine, 'add', 'bin', 'package.json');
      git(engine, 'commit', '-q', '-m', 'v1');
      fs.outputFileSync(path.join(engine, 'scratch.txt'), 'not committed\n');
      fs.outputFileSync(path.join(conf, 'conf.server.json'), '{}\n');
      fs.outputFileSync(path.join(conf, 'package.json'), '{"name":"dd-widget"}\n');
      fs.outputFileSync(path.join(conf, '.env.production'), 'DB_PASSWORD=secret\n');
      return engine;
    };

    it('holds the committed engine, the deploy conf and manifest, no env file, sealed', () => {
      const engine = engineFactory();
      const { revision, dir } = stageReleaseEngine({ root, engineRoot: engine, deployId: 'dd-widget' });
      expect(dir).toBe(path.join(root, '.engine'));
      expect(revision).toBe(git(engine, 'rev-parse', 'HEAD'));
      expect(fs.readFileSync(path.join(dir, 'bin/cli.js'), 'utf8')).toBe('v1\n');
      expect(fs.readJsonSync(path.join(dir, 'package.json'))).toEqual({ name: 'dd-widget' });
      expect(fs.existsSync(path.join(dir, 'engine-private/conf/dd-widget/conf.server.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'engine-private/conf/dd-widget/.env.production'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'scratch.txt'))).toBe(false);
      expect(fs.statSync(dir).mode & 0o777).toBe(0o555);
      expect(fs.statSync(path.join(dir, 'bin/cli.js')).mode & 0o777).toBe(0o444);
    });

    it('reopens a stage of the deployed revision that another user cannot read', () => {
      const engine = engineFactory();
      const { dir } = stageReleaseEngine({ root, engineRoot: engine, deployId: 'dd-widget' });
      execFileSync('chmod', ['-R', 'o-rx', root]);
      stageReleaseEngine({ root, engineRoot: engine, deployId: 'dd-widget' });
      for (const entry of [root, dir, path.join(dir, 'bin')]) expect(fs.statSync(entry).mode & 0o005).toBe(0o005);
    });

    it('is reused for the deployed revision, and replaced when the engine moves', () => {
      const engine = engineFactory();
      const first = stageReleaseEngine({ root, engineRoot: engine, deployId: 'dd-widget' });
      expect(stageReleaseEngine({ root, engineRoot: engine, deployId: 'dd-widget' })).toEqual(first);
      fs.outputFileSync(path.join(engine, 'bin/cli.js'), 'v2\n');
      git(engine, 'commit', '-q', '-am', 'v2');
      const second = stageReleaseEngine({ root, engineRoot: engine, deployId: 'dd-widget' });
      expect(second.revision).not.toBe(first.revision);
      expect(fs.readFileSync(path.join(second.dir, 'bin/cli.js'), 'utf8')).toBe('v2\n');
      expect(fs.readFileSync(path.join(second.dir, '.revision'), 'utf8')).toBe(`${second.revision}\n`);
    });
  });

  describe('the checkout origin', () => {
    const origin = () => git(work, 'remote', 'get-url', 'origin');
    const setOrigin = (repository) => Underpost.repo.setOrigin({ path: work, repository });

    it('follows the repository a checkout is published to, in the transport the origin uses', () => {
      setOrigin('acme/widget');
      expect(origin()).toBe('https://github.com/acme/widget.git');
      setOrigin('acme/widget-private');
      expect(origin()).toBe('https://github.com/acme/widget-private.git');
      git(work, 'remote', 'set-url', 'origin', 'git@github.com:acme/widget-private.git');
      setOrigin('acme/widget');
      expect(origin()).toBe('git@github.com:acme/widget.git');
    });

    it('replaces an origin that names no GitHub repository', () => {
      git(work, 'remote', 'add', 'origin', `file://${base}/remotes/widget.git`);
      setOrigin('acme/widget');
      expect(origin()).toBe('https://github.com/acme/widget.git');
    });

    it('leaves an origin that already names the repository as it is', () => {
      git(work, 'remote', 'add', 'origin', 'https://github.com/acme/widget');
      setOrigin('acme/widget');
      expect(origin()).toBe('https://github.com/acme/widget');
    });
  });

  describe('the source mirror', () => {
    const mirror = (revision) =>
      mirrorRevision({ revision, from: remote('widget-private'), to: remote('widget'), branch: 'main' });

    it('publishes the exact revision, fast-forward, and leaves a public repository that holds it alone', () => {
      const first = commit('first');
      expect(mirror(first)).toEqual({ revision: first, branch: 'main', moved: true });
      expect(git(base, 'ls-remote', remote('widget').url, 'refs/heads/main').split(/\s+/)[0]).toBe(first);
      const second = commit('second');
      expect(mirror(second).moved).toBe(true);
      expect(mirror(first)).toEqual({ revision: first, branch: 'main', moved: false });
      expect(git(base, 'ls-remote', remote('widget').url, 'refs/heads/main').split(/\s+/)[0]).toBe(second);
    });

    it('never rewrites public history that has diverged, and says so', () => {
      commit('public only', 'widget');
      git(work, 'reset', '-q', '--hard', 'HEAD');
      const other = fs.mkdtempSync(path.join(base, 'other-'));
      git(other, 'init', '-q', '-b', 'main');
      fs.writeFileSync(path.join(other, 'OTHER'), 'x');
      git(other, 'add', '.');
      git(other, 'commit', '-q', '-m', 'private only');
      git(other, 'push', '-q', remote('widget-private').url, 'HEAD:refs/heads/main');
      const diverged = git(other, 'rev-parse', 'HEAD');
      const before = git(base, 'ls-remote', remote('widget').url, 'refs/heads/main');
      expect(() => mirror(diverged)).toThrow(/Mirror of .* not published: .*has diverged/);
      expect(git(base, 'ls-remote', remote('widget').url, 'refs/heads/main')).toBe(before);
    });
  });
});
