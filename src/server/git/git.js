/**
 * The Git runtime: the one execution boundary of every Git operation Underpost runs, and the
 * operations themselves, for any repository Git reaches.
 *
 * Git runs as a program with an argument vector, never through a shell, so no path, ref or
 * message reaches a parser. A remote is authenticated through its child environment only
 * (`GIT_CONFIG_COUNT`), and only when it is an HTTPS URL of a GitHub host: the GitHub credential
 * becomes an `Authorization` header scoped to that host, and the credential helpers of that host
 * are reset so no other stored account answers in its place. SSH remotes and other hosts keep
 * their own authentication. Nothing is written to a remote URL, to `.git/config` or to an argument.
 *
 * Each operation logs one trace record (see {@link traceOperation}); a failure throws a
 * {@link GitError} whose `reason` classifies it.
 * @module src/server/git/git.js
 * @namespace Git
 */

import fs from 'fs-extra';
import nodePath from 'node:path';
import { ShellExecError, runCommandSync, shellArgumentFactory } from '../runtime/process.js';
import { loggerFactory, redactSensitiveText, traceOperation } from '../ops/logger.js';
import { githubCredential, isGithubHttpsUrl } from '../github/github-credential.js';

const logger = loggerFactory(import.meta);

/** What a failed Git command says, classified; the first match wins. */
const GIT_FAILURES = Object.freeze([
  [
    'authentication',
    /Authentication failed|could not read (Username|Password)|terminal prompts disabled|Permission denied \(publickey|Invalid username or password|returned error: 40[13]|Write access to repository not granted/i,
  ],
  ['not-found', /Repository not found|does not appear to be a git repository|returned error: 404/i],
  [
    'network',
    /Could not resolve host|Failed to connect|Connection (timed out|refused|reset)|Operation timed out|SSL|unable to access/i,
  ],
  ['protected-branch', /protected branch|GH006|pre-receive hook declined/i],
  ['stale-lease', /stale info/i],
  ['non-fast-forward', /non-fast-forward|\(fetch first\)|Not possible to fast-forward|diverg/i],
  [
    'missing-ref',
    /couldn't find remote ref|unknown revision|invalid reference|not a valid object name|did not match any/i,
  ],
  ['conflict', /CONFLICT|would be overwritten|Your local changes/i],
  ['locked', /\.lock'?: File exists|Unable to create '.*\.lock'|Another git process/i],
  ['dubious-ownership', /dubious ownership/i],
  ['not-a-repository', /not a git repository/i],
  ['destination-exists', /already exists and is not an empty directory/i],
]);

/**
 * A Git operation that failed. `reason` is one of the {@link GIT_FAILURES} classes, `timeout`, or
 * `error`; the message holds the meaningful line of what Git said, redacted.
 * @memberof Git
 */
class GitError extends Error {
  constructor(message, { reason = 'error', code = -1 } = {}) {
    super(redactSensitiveText(message));
    this.name = 'GitError';
    this.reason = reason;
    this.code = code;
  }
}

const failureReason = (output) => GIT_FAILURES.find(([, pattern]) => pattern.test(output))?.[0] ?? 'error';

const meaningfulLine = (output) => {
  const lines = `${output ?? ''}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => /^(error|fatal|remote: error|CONFLICT|!)/i.test(line)) ?? lines.pop() ?? 'no output';
};

/**
 * The URL a repository reference names. An `owner/repo` slug names a GitHub repository over HTTPS;
 * a URL, an scp-like SSH address and a local path stay as given, without the user info of an
 * HTTP(S) URL, so a credential embedded in a reference never travels further.
 * @param {string} reference - `owner/repo`, a clone URL, an SSH address or a path.
 * @returns {string}
 * @throws {Error} When the reference names nothing Git can reach.
 * @memberof Git
 */
const remoteUrlFactory = (reference) => {
  const value = `${reference ?? ''}`.trim();
  if (/^https?:\/\//i.test(value)) return value.replace(/^(https?:\/\/)[^/@\s]*@/i, '$1');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^[^/\s:@]+@[^:\s]+:\S/.test(value)) return value;
  if (value && (nodePath.isAbsolute(value) || value.startsWith('./') || value.startsWith('../'))) return value;
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) return `https://github.com/${value}`;
  throw new Error(`[git] '${value}' is not an owner/repo reference or a clone URL`);
};

/**
 * The `owner/repo` of a GitHub remote, over HTTPS or SSH.
 * @param {string} url - A remote URL.
 * @returns {string} The slug, or '' when the remote is not on GitHub.
 * @memberof Git
 */
const githubSlug = (url) => {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(
      `${url ?? ''}`.trim(),
    );
  return match ? `${match[1]}/${match[2]}` : '';
};

/** How a URL is reported: its GitHub slug, or the URL without user info. */
const remoteLabel = (url) => githubSlug(url) || redactSensitiveText(`${url ?? ''}`);

/** The host part of a remote, for the trace. */
const remoteHost = (url) => {
  const value = `${url ?? ''}`;
  try {
    return new URL(value).hostname;
  } catch {
    return /^[^@\s]+@([^:\s]+):/.exec(value)?.[1] ?? 'local';
  }
};

/** The SSH forms of a GitHub remote. */
const GITHUB_SSH_PREFIXES = Object.freeze(['git@github.com:', 'ssh://git@github.com/']);

/**
 * The variables that authenticate Git to a remote, appended after the `GIT_CONFIG_*` entries of
 * `env` so none of those is replaced. With a credential, a GitHub remote is reached over HTTPS, an
 * SSH one included, for this command only. Without a GitHub remote and a credential, they only keep
 * Git from prompting.
 * @param {string} [url] - The remote the command reaches.
 * @param {object} [options]
 * @param {string} [options.token] - A token for this operation only.
 * @param {NodeJS.ProcessEnv} [options.env] - The environment the variables extend.
 * @returns {{credential: string, variables: Object<string, string>}} `credential` names the source of the
 *   credential, or `none`.
 * @memberof Git
 */
const gitAuth = (url, { token, env = process.env } = {}) => {
  const ssh = GITHUB_SSH_PREFIXES.some((prefix) => `${url ?? ''}`.startsWith(prefix));
  const credential = url && (ssh || isGithubHttpsUrl(url)) ? githubCredential({ token }) : null;
  const variables = { GIT_TERMINAL_PROMPT: '0' };
  if (!credential) return { credential: 'none', variables };
  const origin = ssh ? 'https://github.com' : new URL(url).origin;
  const offset = Number.parseInt(env.GIT_CONFIG_COUNT, 10) || 0;
  const entries = [
    ...(ssh ? GITHUB_SSH_PREFIXES.map((prefix) => [`url.${origin}/.insteadOf`, prefix]) : []),
    [`credential.${origin}.helper`, ''],
    [`http.${origin}/.extraheader`, ''],
    [
      `http.${origin}/.extraheader`,
      `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${credential.token}`).toString('base64')}`,
    ],
  ];
  entries.forEach(([key, value], index) => {
    variables[`GIT_CONFIG_KEY_${offset + index}`] = key;
    variables[`GIT_CONFIG_VALUE_${offset + index}`] = value;
  });
  variables.GIT_CONFIG_COUNT = `${offset + entries.length}`;
  return { credential: credential.source, variables };
};

/**
 * Runs Git with an argument vector through the process boundary.
 * @param {string[]} args
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string} [options.remote] - The remote URL the command reaches; it selects the credential.
 * @param {string} [options.token] - A token for this operation only.
 * @param {NodeJS.ProcessEnv} [options.env] - The environment of Git; this process's by default.
 * @param {string} [options.input] - Written to the stdin of Git.
 * @param {boolean} [options.allowFailure] - Return a failed result instead of throwing.
 * @param {number} [options.timeoutMs]
 * @returns {{code:number, stdout:string, stderr:string}}
 * @throws {GitError}
 * @memberof Git
 */
const runGit = (args, { cwd, remote, token, env: base = process.env, input, allowFailure = false, timeoutMs } = {}) => {
  const env = { ...base, ...gitAuth(remote, { token, env: base }).variables };
  let result;
  try {
    result = runCommandSync('git', args, { cwd, env, input, timeoutMs, silentOnError: true, disableLog: true });
  } catch (error) {
    if (!(error instanceof ShellExecError)) throw error;
    throw new GitError(`git ${args[0]}: ${meaningfulLine(error.stderr || error.message)}`, {
      reason: /timeout/.test(error.stderr || error.message) ? 'timeout' : 'error',
    });
  }
  if (result.code === 0 || allowFailure) return result;
  const output = `${result.stderr}\n${result.stdout}`;
  throw new GitError(`git ${args[0]}: ${meaningfulLine(output)}`, { reason: failureReason(output), code: result.code });
};

/** The trimmed output of a Git command; '' when it fails and `allowFailure` is set. */
const gitOutput = (args, options) => {
  const result = runGit(args, options);
  return result.code === 0 ? result.stdout.trim() : '';
};

/** A branch name Git accepts, never read as an option. */
const refName = (name, what = 'branch') => {
  const value = `${name ?? ''}`.trim();
  if (!value || value.startsWith('-') || /\.\.|[\s~^:?*[\\]|@\{|\.lock$|\/$/.test(value))
    throw new GitError(`[git] '${value}' is not a valid ${what} name`, { reason: 'invalid-ref' });
  return value;
};

const remoteName = (name) => {
  const value = `${name ?? ''}`.trim();
  if (!/^[A-Za-z0-9][\w.-]*$/.test(value)) throw new GitError(`[git] '${value}' is not a valid remote name`);
  return value;
};

const trace = (operation, context, run) => traceOperation(logger, `git ${operation}`, context, run);

/**
 * The root of the work tree a path belongs to.
 * @param {string} [dir='.']
 * @returns {string}
 * @throws {GitError} `not-a-repository` when the path is in none.
 * @memberof Git
 */
const repositoryRoot = (dir = '.') => gitOutput(['rev-parse', '--show-toplevel'], { cwd: dir });

/** The checked out branch, or '' on a detached HEAD. */
const currentBranch = (dir = '.') => gitOutput(['branch', '--show-current'], { cwd: dir });

/** The commit HEAD names, or '' before the first commit. */
const headRevision = (dir = '.') =>
  gitOutput(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: dir, allowFailure: true });

const configValue = (dir, key) => gitOutput(['config', '--get', key], { cwd: dir, allowFailure: true });

/**
 * The configured URL of a remote, as `.git/config` holds it.
 * @param {string} [dir='.']
 * @param {string} [remote='origin']
 * @returns {string} '' when the remote is not configured.
 * @memberof Git
 */
const remoteUrl = (dir = '.', remote = 'origin') => configValue(dir, `remote.${remoteName(remote)}.url`);

/** The remote and branch the current branch tracks, each '' when not configured. */
const upstreamOf = (dir, branch) => ({
  remote: branch ? configValue(dir, `branch.${branch}.remote`) : '',
  branch: branch ? configValue(dir, `branch.${branch}.merge`).replace(/^refs\/heads\//, '') : '',
});

/** The configured remote whose URL is exactly `url`, or ''. */
const remoteFor = (dir, url) => {
  const listed = gitOutput(['config', '--get-regexp', '^remote\\..*\\.url$'], { cwd: dir, allowFailure: true });
  for (const line of listed.split('\n').filter(Boolean)) {
    const [key, ...value] = line.split(' ');
    if (value.join(' ') === url) return key.slice('remote.'.length, -'.url'.length);
  }
  return '';
};

const isEmptyDirectory = (target) => fs.statSync(target).isDirectory() && fs.readdirSync(target).length === 0;

/**
 * Clones a repository into a directory that does not exist or is empty. An existing directory is
 * replaced only when `replace` is set: the clone lands beside it first and takes its place once it
 * succeeded, so a failed clone leaves the directory as it was.
 * @param {object} params
 * @param {string} params.repository - `owner/repo`, a clone URL or a path.
 * @param {string} [params.destination] - The checkout; the repository name (`<name>.git` when bare) in `cwd` by default.
 * @param {string} [params.cwd] - Where a relative destination resolves.
 * @param {string} [params.branch] - The branch to check out instead of the default one.
 * @param {boolean} [params.bare]
 * @param {number} [params.depth] - Shallow history depth.
 * @param {string[]} [params.sparse] - Only these directories are checked out.
 * @param {boolean} [params.replace] - Replace an existing destination.
 * @param {string} [params.token] - A token for this operation only.
 * @returns {{path: string, revision: string}}
 * @memberof Git
 */
const cloneRepository = ({
  repository,
  destination = '',
  cwd = process.cwd(),
  branch = '',
  bare = false,
  depth = 0,
  sparse = [],
  replace = false,
  token,
}) => {
  const url = remoteUrlFactory(repository);
  const name = nodePath.basename(url.replace(/[/:]+$/, '')).replace(/\.git$/, '');
  const target = nodePath.resolve(cwd, destination || (bare ? `${name}.git` : name));
  return trace(
    'clone',
    { repository: remoteLabel(url), path: target, remoteHost: remoteHost(url), ref: branch },
    (record) => {
      const existed = fs.existsSync(target);
      const occupied = existed && !isEmptyDirectory(target);
      if (occupied && !replace)
        throw new GitError(`[git] clone refuses ${target}: it exists; replace it explicitly`, {
          reason: 'destination-exists',
        });
      if (
        occupied &&
        (target === nodePath.parse(target).root ||
          `${process.cwd()}${nodePath.sep}`.startsWith(`${target}${nodePath.sep}`))
      )
        throw new GitError(`[git] clone refuses to replace ${target}: it is the root or holds the working directory`);
      const staging = occupied ? `${target}.clone-${process.pid}-${Date.now()}` : target;
      fs.mkdirpSync(nodePath.dirname(target));
      record.credential = gitAuth(url, { token }).credential;
      try {
        runGit(
          [
            'clone',
            '--quiet',
            ...(bare ? ['--bare'] : []),
            ...(branch ? ['--branch', refName(branch)] : []),
            ...(depth ? ['--depth', `${Number.parseInt(depth, 10)}`] : []),
            ...(sparse.length ? ['--no-checkout'] : []),
            '--',
            url,
            staging,
          ],
          { remote: url, token },
        );
        if (sparse.length) {
          runGit(['sparse-checkout', 'set', '--', ...sparse], { cwd: staging });
          runGit(['checkout', '--quiet'], { cwd: staging });
        }
      } catch (error) {
        if (staging !== target || !existed) fs.removeSync(staging);
        throw error;
      }
      if (staging !== target) {
        const previous = `${target}.replaced-${process.pid}-${Date.now()}`;
        fs.renameSync(target, previous);
        fs.renameSync(staging, target);
        fs.removeSync(previous);
        record.replaced = true;
      }
      record.to = gitOutput(['rev-parse', 'HEAD'], { cwd: target, allowFailure: true });
      return { path: target, revision: record.to };
    },
  );
};

/**
 * Fetches a remote of a checkout into its remote-tracking refs. The working tree and the branches
 * stay as they are.
 * @param {object} [params]
 * @param {string} [params.path='.']
 * @param {string} [params.remote='origin']
 * @param {string} [params.branch] - Only this branch.
 * @param {boolean} [params.prune] - Drop the tracking refs of branches the remote no longer has.
 * @param {string} [params.token]
 * @returns {{remote: string, branch: string}}
 * @memberof Git
 */
const fetchRepository = ({ path: dir = '.', remote = 'origin', branch = '', prune = false, token } = {}) => {
  const name = remoteName(remote);
  const url = remoteUrl(dir, name);
  return trace(
    'fetch',
    { repository: remoteLabel(url), path: nodePath.resolve(dir), remoteHost: remoteHost(url), ref: branch },
    (record) => {
      if (!url) throw new GitError(`[git] ${dir} has no remote '${name}'`, { reason: 'missing-remote' });
      record.credential = gitAuth(url, { token }).credential;
      runGit(['fetch', '--quiet', ...(prune ? ['--prune'] : []), name, ...(branch ? [refName(branch)] : [])], {
        cwd: dir,
        remote: url,
        token,
      });
      return { remote: name, branch };
    },
  );
};

/**
 * The fetch source of a checkout: a repository it names, else the remote it tracks.
 * @returns {{url: string, source: string, branch: string}} `source` is the remote name, or the URL.
 */
const fetchSource = (dir, { repository, remote, branch }) => {
  const current = currentBranch(dir);
  const upstream = upstreamOf(dir, current);
  if (repository) {
    const url = remoteUrlFactory(repository);
    return { url, source: remoteFor(dir, url) || url, branch: refName(branch || upstream.branch || current) };
  }
  const name = remoteName(remote || upstream.remote || 'origin');
  const url = remoteUrl(dir, name);
  if (!url) throw new GitError(`[git] ${dir} has no remote '${name}': name a repository`, { reason: 'missing-remote' });
  const target = branch || (name === upstream.remote ? upstream.branch : '') || current;
  if (!target) throw new GitError(`[git] ${dir} is on no branch: name one`, { reason: 'missing-ref' });
  return { url, source: name, branch: refName(target) };
};

/**
 * Fast-forwards the current branch to a remote branch. It never merges, never rebases and never
 * replaces: a diverged history fails as `non-fast-forward`, and local changes the update would
 * overwrite fail as `conflict`, both leaving the checkout as it was.
 *
 * The source is `repository` when given, else the remote the branch tracks (`remote` overrides
 * it). The branch is `branch`, else the upstream branch, else the current branch name.
 * @param {object} [params]
 * @param {string} [params.path='.']
 * @param {string} [params.repository]
 * @param {string} [params.remote]
 * @param {string} [params.branch]
 * @param {string} [params.token]
 * @returns {{from: string, to: string, updated: boolean}}
 * @memberof Git
 */
const pullRepository = ({ path: dir = '.', repository = '', remote = '', branch = '', token } = {}) =>
  trace('pull', { path: nodePath.resolve(dir) }, (record) => {
    if (!currentBranch(dir))
      throw new GitError(`[git] ${dir} is on a detached HEAD: check out the branch to update`, {
        reason: 'missing-ref',
      });
    const source = fetchSource(dir, { repository, remote, branch });
    Object.assign(record, {
      repository: remoteLabel(source.url),
      remoteHost: remoteHost(source.url),
      ref: source.branch,
      credential: gitAuth(source.url, { token }).credential,
      from: headRevision(dir),
    });
    runGit(['fetch', '--quiet', source.source, source.branch], { cwd: dir, remote: source.url, token });
    runGit(['merge', '--ff-only', '--quiet', 'FETCH_HEAD'], { cwd: dir });
    record.to = headRevision(dir);
    return { from: record.from, to: record.to, updated: record.from !== record.to };
  });

/**
 * Publishes HEAD to a branch of a remote and returns the published commit. It never forces unless
 * asked: `forceWithLease` replaces the remote branch only while it still holds what the
 * remote-tracking ref last saw, and `force` replaces it whatever it holds.
 *
 * The destination is `repository` when given (a configured remote with exactly that URL is used by
 * name, so its tracking refs follow), else `remote`, else the remote the branch tracks, else
 * `origin`. The branch is `branch`, else the current branch name.
 * @param {object} [params]
 * @param {string} [params.path='.']
 * @param {string} [params.repository]
 * @param {string} [params.remote]
 * @param {string} [params.branch]
 * @param {boolean} [params.force]
 * @param {boolean} [params.forceWithLease]
 * @param {string} [params.delete] - Delete this branch of the remote instead.
 * @param {string} [params.token]
 * @returns {{remote: string, branch: string, revision: string}} `revision` is '' for a deletion.
 * @memberof Git
 */
const pushRepository = ({
  path: dir = '.',
  repository = '',
  remote = '',
  branch = '',
  force = false,
  forceWithLease = false,
  delete: deleted = '',
  token,
} = {}) =>
  trace('push', { path: nodePath.resolve(dir) }, (record) => {
    if (force && forceWithLease) throw new GitError('[git] push takes force or forceWithLease, not both');
    const current = currentBranch(dir);
    let url;
    let destination;
    if (repository) {
      url = remoteUrlFactory(repository);
      destination = remoteFor(dir, url) || url;
    } else {
      destination = remoteName(remote || upstreamOf(dir, current).remote || 'origin');
      url = remoteUrl(dir, destination);
      if (!url)
        throw new GitError(`[git] ${dir} has no remote '${destination}': name a repository`, {
          reason: 'missing-remote',
        });
    }
    if (!deleted && !branch && !current)
      throw new GitError(`[git] ${dir} is on a detached HEAD: name the branch to push`, { reason: 'missing-ref' });
    const target = refName(deleted || branch || current);
    Object.assign(record, {
      repository: remoteLabel(url),
      remoteHost: remoteHost(url),
      ref: target,
      credential: gitAuth(url, { token }).credential,
      mode: deleted ? 'delete' : force ? 'force' : forceWithLease ? 'force-with-lease' : 'fast-forward',
    });
    if (deleted) {
      runGit(['push', '--porcelain', destination, '--delete', target], { cwd: dir, remote: url, token });
      if (destination !== url)
        runGit(['update-ref', '-d', `refs/remotes/${destination}/${target}`], { cwd: dir, allowFailure: true });
      return { remote: remoteLabel(url), branch: target, revision: '' };
    }
    let lease = [];
    if (forceWithLease) {
      if (destination === url)
        throw new GitError(
          `[git] force-with-lease needs a configured remote for ${remoteLabel(url)}; its tracking ref is the lease`,
          {
            reason: 'stale-lease',
          },
        );
      const seen = gitOutput(['rev-parse', '--verify', '-q', `refs/remotes/${destination}/${target}`], {
        cwd: dir,
        allowFailure: true,
      });
      lease = [`--force-with-lease=refs/heads/${target}:${seen}`];
    }
    record.to = headRevision(dir);
    runGit(['push', '--porcelain', ...(force ? ['--force'] : []), ...lease, destination, `HEAD:refs/heads/${target}`], {
      cwd: dir,
      remote: url,
      token,
    });
    if (githubSlug(url)) record.commitUrl = `https://github.com/${githubSlug(url)}/commit/${record.to}`;
    return { remote: remoteLabel(url), branch: target, revision: record.to };
  });

/**
 * The default branch of a remote repository, read from the remote itself.
 * @param {string} repository - `owner/repo`, a clone URL or a path.
 * @param {object} [options]
 * @param {string} [options.token]
 * @returns {string}
 * @throws {GitError} When the remote names none: empty, unreachable or refused.
 * @memberof Git
 */
const defaultBranch = (repository, { token } = {}) => {
  const url = remoteUrlFactory(repository);
  const result = runGit(['ls-remote', '--symref', '--', url, 'HEAD'], { remote: url, token, allowFailure: true });
  const branch = /^ref:\s*refs\/heads\/(\S+)\tHEAD$/m.exec(result.stdout)?.[1];
  if (!branch)
    throw new GitError(
      `[git] cannot read the default branch of ${remoteLabel(url)}; it may be empty, unreachable, or need credentials: ${meaningfulLine(result.stderr)}`,
      { reason: result.code === 0 ? 'missing-ref' : failureReason(result.stderr) },
    );
  return branch;
};

/**
 * Whether a remote repository answers with at least one ref.
 * @param {string} repository
 * @returns {boolean}
 * @memberof Git
 */
const isReachable = (repository) => {
  let url;
  try {
    url = remoteUrlFactory(repository);
  } catch {
    return false;
  }
  return /^[0-9a-f]{40}\t/m.test(runGit(['ls-remote', '--', url, 'HEAD'], { remote: url, allowFailure: true }).stdout);
};

/**
 * The commit a branch of a checkout's remote points at, read from the remote, so a push that left no
 * remote-tracking ref still counts.
 * @param {object} params
 * @param {string} [params.path='.']
 * @param {string} params.branch
 * @param {string} [params.remote='origin']
 * @returns {string} '' when the remote is unreachable or has no such branch.
 * @memberof Git
 */
const remoteHead = ({ path: dir = '.', branch, remote = 'origin' }) => {
  const url = remoteUrl(dir, remote);
  if (!url) return '';
  const { stdout } = runGit(['ls-remote', '--', remote, `refs/heads/${refName(branch)}`], {
    cwd: dir,
    remote: url,
    allowFailure: true,
  });
  return /^([0-9a-f]{40})\t/m.exec(stdout)?.[1] ?? '';
};

/**
 * The steps that point a checkout's `origin` at a repository and replace its working tree with the
 * tip of a branch: tracked changes and untracked files go, ignored files stay. Each step is an
 * argument vector with an optional `fallback`; {@link syncRepository} runs them here and
 * {@link syncScript} renders them for a host that runs plain Git.
 * @returns {Array<{args: string[], fallback?: string[]}>}
 */
const syncSteps = ({ url, branch }) => [
  { args: ['remote', 'set-url', 'origin', url], fallback: ['remote', 'add', 'origin', url] },
  { args: ['fetch', '--quiet', '--force', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`] },
  { args: ['checkout', '--quiet', '--force', '-B', branch, '--track', `refs/remotes/origin/${branch}`] },
  { args: ['clean', '--quiet', '-f', '-d'] },
];

/** What replacing a checkout with `target` discards: commits no longer on the branch, changes and untracked files. */
const syncLoss = (dir, target) => {
  const head = headRevision(dir);
  const status = runGit(['status', '--porcelain', '--untracked-files=all'], { cwd: dir })
    .stdout.split('\n')
    .filter(Boolean);
  return {
    commits: head
      ? Number(gitOutput(['rev-list', '--count', `${target}..HEAD`], { cwd: dir, allowFailure: true }) || 0)
      : 0,
    changed: status.filter((line) => !line.startsWith('??')).length,
    untracked: status.filter((line) => line.startsWith('??')).length,
  };
};

/**
 * Brings a managed checkout to the tip of a repository branch, whatever state it is in: clones it
 * when the path holds no checkout, and otherwise replaces the working tree. A managed checkout is a
 * projection of its remote, never a place work is authored; for a working repository use
 * {@link pullRepository}.
 *
 * What the replacement discards is reported before it happens (`dryRun` stops there): the commits
 * of the checked out branch the target does not hold, changed tracked files and untracked files.
 * Ignored files stay. The checkout is verified to stand at the fetched tip afterwards.
 * @param {object} params
 * @param {string} params.path
 * @param {string} params.repository
 * @param {string} [params.branch] - The default branch of the repository otherwise.
 * @param {boolean} [params.dryRun]
 * @param {string} [params.token]
 * @returns {{action: 'cloned'|'replaced'|'planned', branch: string, revision: string, discarded?: object}}
 * @memberof Git
 */
const syncRepository = ({ path: dir, repository, branch = '', dryRun = false, token }) => {
  const url = remoteUrlFactory(repository);
  const target = nodePath.resolve(dir);
  return trace('sync', { repository: remoteLabel(url), path: target, remoteHost: remoteHost(url) }, (record) => {
    record.credential = gitAuth(url, { token }).credential;
    record.ref = refName(branch || defaultBranch(url, { token }));
    if (!fs.existsSync(nodePath.join(target, '.git'))) {
      if (fs.existsSync(target) && !isEmptyDirectory(target))
        throw new GitError(`[git] sync refuses ${target}: it holds files but no checkout`, {
          reason: 'not-a-repository',
        });
      if (dryRun) return { action: 'planned', branch: record.ref, revision: '', discarded: null };
      const { revision } = cloneRepository({ repository: url, destination: target, branch: record.ref, token });
      record.to = revision;
      return { action: 'cloned', branch: record.ref, revision };
    }
    // Git refuses a checkout another user owns; a sync trusts the checkout it replaces.
    if ([target, nodePath.join(target, '.git')].some((entry) => fs.statSync(entry).uid !== process.getuid()))
      declareSafeDirectory(target);
    record.from = headRevision(target);
    if (dryRun) {
      runGit(['fetch', '--quiet', '--', url, `refs/heads/${record.ref}`], { cwd: target, remote: url, token });
      record.discarded = syncLoss(target, 'FETCH_HEAD');
      return {
        action: 'planned',
        branch: record.ref,
        revision: gitOutput(['rev-parse', 'FETCH_HEAD'], { cwd: target }),
        discarded: record.discarded,
      };
    }
    const [setOrigin, fetch, ...replace] = syncSteps({ url, branch: record.ref });
    for (const step of [setOrigin, fetch]) runStep(step, { cwd: target, remote: url, token });
    const tip = `refs/remotes/origin/${record.ref}`;
    record.discarded = syncLoss(target, tip);
    if (record.discarded.commits || record.discarded.changed || record.discarded.untracked)
      logger.warn('git sync discards', { path: target, ...record.discarded });
    for (const step of replace) runStep(step, { cwd: target });
    record.to = headRevision(target);
    const expected = gitOutput(['rev-parse', tip], { cwd: target });
    if (record.to !== expected) throw new GitError(`[git] ${target} stands at ${record.to}, not ${expected}`);
    return { action: 'replaced', branch: record.ref, revision: record.to, discarded: record.discarded };
  });
};

const runStep = ({ args, fallback }, options) => {
  const result = runGit(args, { ...options, allowFailure: Boolean(fallback) });
  if (result.code !== 0) runGit(fallback, options);
};

/**
 * Merges every `dependabot/*` branch of a remote into a branch of the checkout, one at a time, with Git
 * alone: nothing is pushed and no branch of the remote is deleted.
 *
 * Local changes are stashed first, untracked files included. A merge that fails is aborted before the
 * next one starts. A merged branch that also exists locally is deleted. The original branch, or the
 * detached commit, and the stash come back on every path, failures included; a stash that does not
 * come back stays in the stash list, and the result names it.
 * @param {object} [params]
 * @param {string} [params.path='.'] - The repository, or a directory inside it.
 * @param {string} [params.base] - The branch to merge into; the default branch of the remote by default.
 * @param {string} [params.remote='origin']
 * @param {string} [params.token]
 * @returns {{root: string, base: string, branches: Array<{branch: string, status: 'ok'|'failed', reason?: string}>,
 *   restored: boolean, ok: boolean, error?: string, stash?: string}} `ok` is false when a merge or a step
 *   failed, or the checkout did not come back.
 * @memberof Git
 */
const mergeDependabot = ({ path: dir = '.', base = '', remote = 'origin', token } = {}) => {
  const root = repositoryRoot(dir);
  const name = remoteName(remote);
  const url = remoteUrl(root, name);
  const git = (args) => runGit(args, { cwd: root, allowFailure: true });
  return trace(
    'merge-dependabot',
    { repository: remoteLabel(url), path: root, remoteHost: remoteHost(url) },
    (record) => {
      fetchRepository({ path: root, remote: name, prune: true, token });
      record.ref = refName(base || defaultBranch(url, { token }));
      const result = { root, base: record.ref, branches: [], restored: true };
      const branches = gitOutput(['for-each-ref', '--format=%(refname:lstrip=3)', `refs/remotes/${name}/dependabot/`], {
        cwd: root,
      })
        .split('\n')
        .filter(Boolean);
      if (branches.length) {
        const original = currentBranch(root) || headRevision(root);
        const label = `underpost-merge-dependabot-${Date.now()}`;
        runGit(['stash', 'push', '--quiet', '--include-untracked', '--message', label], { cwd: root });
        const stash = gitOutput(['stash', 'list', '--format=%gd %s'], { cwd: root })
          .split('\n')
          .find((line) => line.endsWith(label))
          ?.split(' ')[0];
        try {
          runGit(['checkout', '--quiet', record.ref], { cwd: root });
          runGit(['merge', '--quiet', '--ff-only', `refs/remotes/${name}/${record.ref}`], { cwd: root });
          for (const branch of branches) {
            const merge = git(['merge', '--no-edit', `${name}/${branch}`]);
            if (merge.code === 0) {
              result.branches.push({ branch, status: 'ok' });
              if (git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).code === 0)
                git(['branch', '--quiet', '-D', branch]);
              continue;
            }
            result.branches.push({
              branch,
              status: 'failed',
              reason: meaningfulLine(`${merge.stdout}\n${merge.stderr}`),
            });
            if (git(['rev-parse', '--quiet', '--verify', 'MERGE_HEAD']).code === 0)
              runGit(['merge', '--abort'], { cwd: root });
          }
        } catch (error) {
          result.error = error.message;
        }
        if (original !== record.ref) result.restored = git(['checkout', '--quiet', original]).code === 0;
        if (result.restored && stash) result.restored = git(['stash', 'pop', '--quiet', stash]).code === 0;
        if (stash && !result.restored) result.stash = stash;
      }
      result.ok = !result.error && result.restored && result.branches.every(({ status }) => status === 'ok');
      record.merged = result.branches.filter(({ status }) => status === 'ok').length;
      record.failed = result.branches.length - record.merged;
      return result;
    },
  );
};

/**
 * The shell command that runs the {@link syncSteps} on a host with plain Git, where no Underpost of
 * a known version runs: the authentication variables live in a subshell no later step inherits.
 * The variables carry the GitHub credential when one resolves, so the command is a secret.
 * @param {object} params
 * @param {string} params.repository
 * @param {string} params.path - The checkout on that host.
 * @param {string} params.branch
 * @returns {string}
 * @memberof Git
 */
const syncScript = ({ repository, path: dir, branch }) => {
  const url = remoteUrlFactory(repository);
  const git = `git -C ${shellArgumentFactory(dir)}`;
  const render = (args) => `${git} ${args.map(shellArgumentFactory).join(' ')}`;
  const variables = Object.entries(gitAuth(url, { env: {} }).variables)
    .map(([key, value]) => `${key}=${shellArgumentFactory(value)}`)
    .join(' ');
  const steps = syncSteps({ url, branch: refName(branch) }).map(({ args, fallback }) =>
    fallback ? `{ ${render(args)} || ${render(fallback)}; }` : render(args),
  );
  return `( export ${variables} && ${steps.join(' && ')} )`;
};

/**
 * Discards the changes under a path of a work tree: staged and unstaged changes of tracked files,
 * and untracked files; ignored files only with `ignored`. Without `force` nothing changes and the
 * result is the plan. The repository root and the scope inside it are reported with every path.
 * @param {object} params
 * @param {string} params.path - A repository root, or a directory inside one.
 * @param {boolean} [params.force] - Discard; otherwise only report.
 * @param {boolean} [params.ignored] - Discard ignored files too.
 * @param {boolean} [params.root] - Refuse a path that is not the root of its repository.
 * @returns {{root: string, scope: string, entries: Array<{status: string, path: string}>, discarded: boolean}}
 * @memberof Git
 */
const discardChanges = ({ path: target, force = false, ignored = false, root: atRoot = false }) => {
  const dir = nodePath.resolve(`${target ?? ''}`.trim());
  return trace('discard', { path: dir }, (record) => {
    if (!fs.existsSync(dir))
      throw new GitError(`[git] discard refuses ${dir}: it does not exist`, { reason: 'not-a-repository' });
    const root = repositoryRoot(dir);
    const scope = nodePath.relative(root, fs.realpathSync(dir)) || '.';
    if (atRoot && scope !== '.')
      throw new GitError(`[git] discard refuses ${dir}: the repository root is ${root}`, {
        reason: 'not-a-repository',
      });
    const status = () => {
      // Untrimmed: the first record may begin with the space of an unstaged status.
      const fields = runGit(
        ['status', '--porcelain=v1', '-z', '--untracked-files=all', ...(ignored ? ['--ignored'] : []), '--', scope],
        { cwd: root },
      ).stdout.split('\0');
      const entries = [];
      // A rename or a copy is followed by the field of its source path.
      for (let index = 0; index < fields.length; index++) {
        if (!fields[index]) continue;
        const entry = { status: fields[index].slice(0, 2), path: fields[index].slice(3) };
        if (/[RC]/.test(entry.status)) entry.from = fields[++index];
        entries.push(entry);
      }
      return entries;
    };
    const entries = status();
    Object.assign(record, { root, scope, entries: entries.length, dryRun: !force });
    if (!force || entries.length === 0) return { root, scope, entries, discarded: false };
    runGit(['reset', '--quiet', '--', scope], { cwd: root });
    if (gitOutput(['diff', '--name-only', '--', scope], { cwd: root }))
      runGit(['checkout', '--quiet', '--', scope], { cwd: root });
    runGit(['clean', '--quiet', '-f', '-d', ...(ignored ? ['-x'] : []), '--', scope], { cwd: root });
    const left = status();
    if (left.length)
      throw new GitError(`[git] ${root} still holds ${left.length} changes under ${scope}`, { reason: 'conflict' });
    return { root, scope, entries, discarded: true };
  });
};

/**
 * Commits the staged changes. The index is never changed.
 * @param {object} params
 * @param {string} [params.path='.']
 * @param {string} [params.message] - Required unless `amend`.
 * @param {boolean} [params.empty] - Commit with nothing staged.
 * @param {boolean} [params.amend] - Amend the last commit, keeping its message.
 * @returns {{revision: string}}
 * @memberof Git
 */
const commitChanges = ({ path: dir = '.', message = '', empty = false, amend = false }) =>
  trace('commit', { path: nodePath.resolve(dir), mode: amend ? 'amend' : empty ? 'empty' : 'staged' }, (record) => {
    if (!amend && !`${message}`.trim()) throw new GitError('[git] a commit needs a message');
    runGit(
      [
        'commit',
        '--quiet',
        ...(empty ? ['--allow-empty'] : []),
        ...(amend ? ['--amend', '--no-edit'] : ['--file', '-']),
      ],
      { cwd: dir, ...(amend ? {} : { input: message }) },
    );
    record.to = headRevision(dir);
    return { revision: record.to };
  });

/**
 * Moves the current branch back by `count` commits, keeping their changes staged.
 * @param {object} params
 * @param {string} [params.path='.']
 * @param {number} [params.count=1]
 * @returns {{from: string, to: string}}
 * @memberof Git
 */
const undoCommits = ({ path: dir = '.', count = 1 }) =>
  trace('undo', { path: nodePath.resolve(dir), commits: count }, (record) => {
    const commits = Number.parseInt(count, 10);
    if (!(commits > 0)) throw new GitError(`[git] '${count}' is not a number of commits`);
    record.from = headRevision(dir);
    runGit(['reset', '--quiet', '--soft', `HEAD~${commits}`], { cwd: dir });
    record.to = headRevision(dir);
    return { from: record.from, to: record.to };
  });

/**
 * The latest commits, newest first.
 * @param {object} [params]
 * @param {string} [params.path='.']
 * @param {number} [params.count] - Every commit when not set.
 * @param {number} [params.skip]
 * @returns {Array<{revision: string, shortRevision: string, subject: string, date: string}>}
 * @memberof Git
 */
const commitHistory = ({ path: dir = '.', count = 0, skip = 0 } = {}) =>
  gitOutput(
    [
      'log',
      '-z',
      '--format=%H%x1f%h%x1f%s%x1f%ci',
      ...(count ? ['-n', `${Number.parseInt(count, 10)}`] : []),
      ...(skip ? [`--skip=${Number.parseInt(skip, 10)}`] : []),
    ],
    { cwd: dir, allowFailure: true },
  )
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const [revision, shortRevision, subject, date] = record.split('\x1f');
      return { revision, shortRevision, subject, date };
    });

/**
 * The commits of HEAD that no branch of a remote holds, after fetching it, so a branch the remote
 * does not have yet counts from where it forks.
 * @param {object} [params]
 * @param {string} [params.path='.']
 * @param {string} [params.remote='origin']
 * @returns {{count: number, branch: string, error?: string}} `error` tells why the remote could not be compared.
 * @memberof Git
 */
const unpushedCommits = ({ path: dir = '.', remote = 'origin' } = {}) => {
  const branch = currentBranch(dir);
  if (!branch) return { count: 0, branch, error: 'detached HEAD' };
  try {
    fetchRepository({ path: dir, remote, prune: true });
  } catch (error) {
    return { count: 0, branch, error: error.message };
  }
  const count = Number(
    gitOutput(['rev-list', '--count', 'HEAD', '--not', `--remotes=${remoteName(remote)}`], { cwd: dir }),
  );
  return { count, branch };
};

/**
 * The paths of the index under a directory, absolute.
 * @param {string} [dir='.']
 * @returns {string[]}
 * @memberof Git
 */
const trackedFiles = (dir = '.') => {
  const root = repositoryRoot(dir);
  return gitOutput(['ls-files', '--cached', '--full-name', '-z', '--', '.'], { cwd: dir })
    .split('\0')
    .filter(Boolean)
    .map((file) => nodePath.resolve(root, file));
};

/**
 * Declares a path safe for Git once: a document root chowned to a web server user is refused
 * until it is.
 * @param {string} dir - The repository; a relative path resolves against the working directory.
 * @memberof Git
 */
const declareSafeDirectory = (dir) => {
  const target = nodePath.resolve(dir);
  const declared = gitOutput(['config', '--global', '--get-all', 'safe.directory'], { allowFailure: true });
  if (declared.split('\n').some((entry) => entry.trim() === target)) return;
  runGit(['config', '--global', '--add', 'safe.directory', target]);
};

/**
 * Points `origin` at a repository, keeping SSH when a GitHub origin uses SSH, and HTTPS otherwise.
 * An origin that already names the repository stays as it is.
 * @param {object} params
 * @param {string} [params.path='.']
 * @param {string} params.repository - `owner/repo` or a GitHub URL.
 * @memberof Git
 */
const setOrigin = ({ path: dir = '.', repository }) => {
  const slug = githubSlug(remoteUrlFactory(repository));
  if (!slug) throw new GitError(`[git] '${repository}' names no GitHub repository`);
  const current = remoteUrl(dir);
  if (githubSlug(current) === slug) return;
  const url = current.startsWith('git@github.com:') ? `git@github.com:${slug}.git` : `https://github.com/${slug}.git`;
  runGit(['remote', current ? 'set-url' : 'add', 'origin', url], { cwd: dir });
  logger.info('git origin', { path: dir, repository: slug });
};

export {
  GitError,
  cloneRepository,
  commitChanges,
  commitHistory,
  currentBranch,
  declareSafeDirectory,
  defaultBranch,
  discardChanges,
  fetchRepository,
  gitAuth,
  gitOutput,
  githubSlug,
  headRevision,
  isReachable,
  mergeDependabot,
  pullRepository,
  pushRepository,
  remoteHead,
  remoteUrl,
  remoteUrlFactory,
  repositoryRoot,
  runGit,
  setOrigin,
  syncRepository,
  syncScript,
  trackedFiles,
  undoCommits,
  unpushedCommits,
};
