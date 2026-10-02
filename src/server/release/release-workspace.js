/**
 * The release workspace: the exact source revision of one release, fetched on the host into the
 * release store and read only from the moment it exists. It holds no credentials: the fetch
 * passes them in the child environment and configures no remote. A Release Job reads the store as
 * a user other than the host's, so every entry is readable by anyone and writable by no one.
 *
 *   <root>/<release-id>/release.json   what the release is built from
 *   <root>/<release-id>/source/        the source at exactly `sourceRevision`, with its history
 *   <root>/.engine/                    the engine a Release Job runs: see {@link stageReleaseEngine}
 *
 * @module src/server/release/release-workspace.js
 * @namespace ReleaseWorkspace
 */
import fs from 'fs-extra';
import path from 'node:path';
import { shellArgumentFactory, shellExec } from '../runtime/process.js';
import { RELEASE_ID_PATTERN, assertReleaseId, assertSourceRevision } from './source-release.js';

/** The release store of a node: `UNDERPOST_RELEASE_STORE`, else `/home/dd/release-store`. */
export const RELEASE_STORE_ROOT = process.env.UNDERPOST_RELEASE_STORE || '/home/dd/release-store';

/**
 * Runs git through the execution gate in a repository this module made, whoever owns it; the
 * arguments are quoted, never parsed by a shell.
 */
export const git = (cwd, args, env = process.env) =>
  `${shellExec(
    `git -c safe.directory=${shellArgumentFactory(path.resolve(cwd))} ${args.map(shellArgumentFactory).join(' ')}`,
    { cwd, env, silent: true, stdout: true, disableLog: true },
  )}`.trim();

/**
 * Fetches exactly one revision of a remote into `dir` and checks it out detached.
 * @param {string} dir - An empty directory.
 * @param {{url:string, env?:Object}} remote - Where to fetch from, with the credentials in `env`.
 * @param {string} revision - A commit, or `HEAD` for the default branch tip.
 * @memberof ReleaseWorkspace
 */
export const fetchRevision = (dir, remote, revision) => {
  git(dir, ['init', '-q']);
  git(dir, ['fetch', '-q', '--depth', '1', remote.url, revision], remote.env ?? process.env);
  git(dir, ['checkout', '-q', '--detach', 'FETCH_HEAD']);
};

const lastLine = (error) =>
  `${error?.stderr || error?.message || error}`.trim().split('\n').filter(Boolean).pop() ?? 'unknown error';

/** Seals a tree whatever the umask: anyone reads it and no one writes it. */
const seal = (target) => {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) for (const entry of fs.readdirSync(target)) seal(path.join(target, entry));
  fs.chmodSync(target, stat.isDirectory() || stat.mode & 0o111 ? 0o555 : 0o444);
};

/** Gives the owner back the write bits of a tree, then removes it. */
const removeTree = (target) => {
  const unseal = (entry) => {
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) for (const child of fs.readdirSync(entry)) unseal(path.join(entry, child));
    fs.chmodSync(entry, stat.mode | 0o200);
  };
  if (fs.existsSync(target)) unseal(target);
  fs.removeSync(target);
};

/** Creates the store root when absent and opens it to every reader. */
const openStore = (root) => {
  if (fs.existsSync(root) && !fs.lstatSync(root).isDirectory())
    throw new Error(`Release store ${root} is not a directory`);
  fs.mkdirpSync(root);
  fs.chmodSync(root, 0o755);
};

/**
 * One release's source snapshot in the release store.
 * @memberof ReleaseWorkspace
 */
export class ReleaseWorkspace {
  /**
   * @param {Object} params
   * @param {string} [params.root] - The release store.
   * @param {string} params.releaseId
   */
  constructor({ root = RELEASE_STORE_ROOT, releaseId }) {
    this.root = path.resolve(root);
    this.releaseId = assertReleaseId(releaseId);
    this.dir = path.join(this.root, this.releaseId);
  }

  /** The source snapshot, read only. */
  get sourceDir() {
    return path.join(this.dir, 'source');
  }

  /** What the release is built from, as `materialize` recorded it. */
  record() {
    return fs.readJsonSync(path.join(this.dir, 'release.json'));
  }

  exists() {
    return fs.existsSync(this.dir);
  }

  /**
   * Fetches exactly `record.sourceRevision` of `record.sourceRepository`, records `record` beside
   * it, and seals both. A workspace of the same revision is reused; one of another is refused.
   * @param {Object} params
   * @param {string} [params.root]
   * @param {string} params.releaseId
   * @param {{sourceRepository:string, sourceRevision:string}} params.record - What the release is built from.
   * @param {{url:string, env?:Object}} params.remote - Where the source repository is fetched from, with the credentials in `env`.
   * @returns {ReleaseWorkspace}
   * @throws {Error} When the repository does not hold the revision.
   */
  static materialize({ root = RELEASE_STORE_ROOT, releaseId, record, remote }) {
    const workspace = new ReleaseWorkspace({ root, releaseId });
    const revision = assertSourceRevision(record.sourceRevision);
    openStore(workspace.root);
    if (workspace.exists()) {
      if (workspace.record().sourceRevision !== revision)
        throw new Error(`Workspace ${releaseId} holds another revision; use a new release id`);
      workspace.verify();
      seal(workspace.dir);
      return workspace;
    }
    const partial = `${workspace.dir}.partial`;
    removeTree(partial);
    const source = path.join(partial, 'source');
    fs.mkdirpSync(source);
    try {
      fetchRevision(source, remote, revision);
    } catch (error) {
      removeTree(partial);
      throw new Error(`${record.sourceRepository} holds no revision ${revision}: ${lastLine(error)}`);
    }
    fs.writeJsonSync(path.join(partial, 'release.json'), { releaseId, ...record }, { spaces: 2 });
    fs.renameSync(partial, workspace.dir);
    workspace.verify();
    seal(workspace.dir);
    return workspace;
  }

  /**
   * Fails unless the source is exactly the recorded revision: HEAD is that commit and no tracked
   * file changed.
   * @throws {Error}
   */
  verify() {
    const { sourceRevision } = this.record();
    const head = git(this.sourceDir, ['rev-parse', 'HEAD']);
    if (head !== sourceRevision) throw new Error(`Workspace ${this.releaseId} is at ${head}, not ${sourceRevision}`);
    const changed = git(this.sourceDir, ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=no']);
    if (changed) throw new Error(`Workspace ${this.releaseId} changed a tracked file: ${changed.split('\n')[0]}`);
  }

  /** Removes the workspace. */
  cleanup() {
    removeTree(this.dir);
    removeTree(`${this.dir}.partial`);
  }
}

/**
 * Removes every release workspace of the store but the kept ones. A release that needs its
 * workspace again fetches the same exact revision.
 * @param {Object} params
 * @param {string} [params.root] - The release store.
 * @param {string[]} [params.keep] - The release ids whose workspaces stay.
 * @returns {string[]} The release ids whose workspaces were removed.
 * @memberof ReleaseWorkspace
 */
export function pruneReleaseStore({ root = RELEASE_STORE_ROOT, keep = [] }) {
  const store = path.resolve(root);
  if (!fs.existsSync(store)) return [];
  const kept = new Set(keep.map(assertReleaseId));
  const releaseIds = new Set(
    fs
      .readdirSync(store)
      .map((entry) => entry.replace(/\.partial$/, ''))
      .filter((releaseId) => RELEASE_ID_PATTERN.test(releaseId) && !kept.has(releaseId)),
  );
  for (const releaseId of releaseIds) new ReleaseWorkspace({ root: store, releaseId }).cleanup();
  return [...releaseIds].sort();
}

/**
 * Stages the engine a Release Job runs, at `<root>/.engine`: the tracked files of the engine checkout
 * at HEAD, with the deploy's `conf.*.json` files and its package manifest as `package.json`. It holds
 * no env file and no credential. A stage of the same revision is reused; another revision replaces it.
 * @param {Object} params
 * @param {string} [params.root] - The release store.
 * @param {string} [params.engineRoot='.'] - The engine checkout the deploy runs.
 * @param {string} params.deployId
 * @returns {{revision:string, dir:string}}
 * @memberof ReleaseWorkspace
 */
export function stageReleaseEngine({ root = RELEASE_STORE_ROOT, engineRoot = '.', deployId }) {
  const revision = git(engineRoot, ['rev-parse', 'HEAD']);
  const dir = path.join(path.resolve(root), '.engine');
  const record = path.join(dir, '.revision');
  openStore(path.resolve(root));
  if (fs.existsSync(record) && fs.readFileSync(record, 'utf8').trim() === revision) {
    seal(dir);
    return { revision, dir };
  }
  const partial = `${dir}.partial`;
  removeTree(partial);
  fs.mkdirpSync(partial);
  shellExec(`git archive HEAD | tar -x -C ${shellArgumentFactory(partial)}`, { cwd: engineRoot, disableLog: true });
  const conf = path.join(engineRoot, 'engine-private', 'conf', deployId);
  for (const file of fs.readdirSync(conf).filter((name) => /^conf\..+\.json$/.test(name)))
    fs.copySync(path.join(conf, file), path.join(partial, 'engine-private', 'conf', deployId, file));
  if (fs.existsSync(path.join(conf, 'package.json')))
    fs.copySync(path.join(conf, 'package.json'), path.join(partial, 'package.json'));
  fs.writeFileSync(path.join(partial, '.revision'), `${revision}\n`);
  removeTree(dir);
  fs.renameSync(partial, dir);
  seal(dir);
  return { revision, dir };
}
