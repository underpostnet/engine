/**
 * The Graphify adapter: the code graph of a repository, built by the pinned Graphify release from
 * the code alone, and checked against the revision a release ships.
 *
 *   <root>/<out>/GRAPH_REPORT.md   the architecture report
 *   <root>/<out>/graph.json        the graph
 *   <root>/<out>/graph.stamp.json  what the graph was built from: tool, inputs and file blobs
 *
 * A graph commits its stamp and the graph files it names; a graph file it does not name stays local.
 *
 * The inputs are the tracked files the root `.graphifyignore` keeps, outside `<out>`, plus the
 * scan configuration. Git's own ignore matcher reads `.graphifyignore`, and a temporary index holds
 * the tree, so the index and the work tree of the repository stay as they are.
 *
 * @module src/server/release/graphify.js
 * @namespace Graphify
 */
import crypto from 'node:crypto';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { shellArgumentFactory, shellExec } from '../runtime/process.js';
import { git } from './release-workspace.js';

/** The Graphify release every host and runner uses. */
export const GRAPHIFY_VERSION = '0.9.97';

/** The PyPI distribution of the `graphify` command. */
export const GRAPHIFY_PACKAGE = 'graphifyy';

/** The graph files a repository can commit in its graph directory; a graph commits all of them by default. */
export const GRAPH_FILES = Object.freeze(['GRAPH_REPORT.md', 'graph.json']);

/** The file that records what the committed graph was built from. */
export const GRAPH_STAMP = 'graph.stamp.json';

const STAMP_VERSION = 1;
const SCAN_CONFIG_FILES = Object.freeze(['.graphifyignore', '.graphifyrc']);
const INSTALL = `pipx install --force ${GRAPHIFY_PACKAGE}==${GRAPHIFY_VERSION}`;

const lastLine = (text) => `${text ?? ''}`.trim().split('\n').filter(Boolean).pop() ?? 'no output';

const sha256 = (text) => `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;

/**
 * Whether release stages build and check code graphs: the CLI flag, else the product setting, else off.
 * @param {boolean} [flag] - `--graphify` or `--no-graphify`.
 * @param {boolean} [configured] - The `graphify` setting of the product catalog.
 * @returns {boolean}
 * @memberof Graphify
 */
export const graphifyEnabled = (flag, configured = false) => flag ?? configured;

/**
 * A graph directory: relative, inside the repository, never its root.
 * @param {string} out
 * @returns {string} The normalized directory.
 * @memberof Graphify
 */
export const assertGraphDir = (out) => {
  const dir = path.posix.normalize(`${out ?? ''}`).replace(/\/+$/, '');
  if (!out || path.posix.isAbsolute(dir) || dir === '.' || dir === '..' || dir.startsWith('../'))
    throw new Error(`"${out}" is not a graph directory inside a repository`);
  return dir;
};

/**
 * The graph files a graph commits: graph files only, at least one.
 * @param {string[]} [files]
 * @returns {string[]}
 * @memberof Graphify
 */
export const assertGraphFiles = (files = GRAPH_FILES) => {
  if (!files.length || files.some((name) => !GRAPH_FILES.includes(name)))
    throw new Error(`${JSON.stringify(files)} names no graph files of ${JSON.stringify(GRAPH_FILES)}`);
  return [...files];
};

/**
 * The code graphs of a release: the graph directory of each repository that declares one, while enabled.
 * @param {Array<{name:string, graph?:string}>} repositories - The `releaseRepositories` of a catalog.
 * @param {boolean} enabled - See {@link graphifyEnabled}.
 * @returns {Object<string,string>} Graph directory by repository name.
 * @memberof Graphify
 */
export const releaseGraphs = (repositories, enabled) =>
  enabled
    ? Object.fromEntries(
        repositories.filter(({ graph }) => graph).map(({ name, graph }) => [name, assertGraphDir(graph)]),
      )
    : {};

/**
 * The paths a release commits for a graph, relative to the repository root.
 * @param {string} out
 * @param {string[]} [files] - The graph files it commits.
 * @returns {string[]}
 * @memberof Graphify
 */
export const graphPaths = (out, files = GRAPH_FILES) =>
  [...assertGraphFiles(files), GRAPH_STAMP].map((file) => `${assertGraphDir(out)}/${file}`);

/**
 * The installed Graphify, or an error that names the install command.
 * @returns {{executable:string, version:string}}
 * @memberof Graphify
 */
export const graphifyTool = () => {
  const executable =
    `${shellExec('command -v graphify', { stdout: true, silent: true, silentOnError: true, disableLog: true })}`.trim();
  if (!executable) throw new Error(`graphify is not on the PATH: run ${INSTALL}`);
  const result = shellExec(`${shellArgumentFactory(executable)} --version`, {
    silent: true,
    silentOnError: true,
    disableLog: true,
  });
  const version = `${result.stdout ?? ''}`.match(/^graphify (\S+)$/m)?.[1];
  if (version !== GRAPHIFY_VERSION)
    throw new Error(
      `${executable} is graphify ${version ?? 'of no known version'}, not ${GRAPHIFY_VERSION}: run ${INSTALL}`,
    );
  return { executable, version };
};

/** The child environment of a code-only run: no model backend and no change to the host's skills. */
const graphifyEnv = (out) => ({
  ...process.env,
  GRAPHIFY_OUT: out,
  GRAPHIFY_BACKEND: 'none',
  GRAPHIFY_NO_AUTO_REFRESH: '1',
  GRAPHIFY_NO_TIPS: '1',
});

/**
 * The inputs digest of a graph: each scanned path with its blob, at a revision or in the work tree.
 * @param {string} root
 * @param {string} out
 * @param {string} [revision] - A commit; the work tree, as a commit of it would hold it, when absent.
 * @returns {string} A sha256 digest.
 */
const graphInputs = (root, out, revision) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, 'index') };
  try {
    git(root, ['read-tree', revision ?? 'HEAD'], env);
    if (!revision) {
      const list = path.join(tmp, 'paths');
      fs.writeFileSync(list, `${git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], env)}\0`);
      shellExec(
        `git -c safe.directory=${shellArgumentFactory(path.resolve(root))} update-index -z --add --remove --info-only --stdin < ${shellArgumentFactory(list)}`,
        { cwd: root, env, silent: true, disableLog: true },
      );
    }
    const entries = git(root, ['ls-files', '-z', '--stage'], env)
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const [meta, file] = line.split('\t');
        return { blob: meta.split(' ')[1], file };
      });
    const ignore = entries.find(({ file }) => file === '.graphifyignore');
    let ignored = new Set();
    if (ignore) {
      // A work-tree index holds the blob ids of objects it never wrote: the patterns come from the file.
      const patterns = revision ? path.join(tmp, 'graphifyignore') : path.join(root, '.graphifyignore');
      if (revision) fs.writeFileSync(patterns, git(root, ['cat-file', 'blob', ignore.blob], env));
      ignored = new Set(
        git(root, ['ls-files', '-z', '--cached', '--ignored', `--exclude-from=${patterns}`], env).split('\0'),
      );
    }
    const scanned = entries.filter(
      ({ file }) =>
        SCAN_CONFIG_FILES.includes(file) || (!ignored.has(file) && file !== out && !file.startsWith(`${out}/`)),
    );
    return sha256(scanned.map(({ blob, file }) => `${blob} ${file}\n`).join(''));
  } finally {
    fs.removeSync(tmp);
  }
};

/**
 * The committed graph files and the stamp of a graph directory, by name: blob and size, at a revision or in the work tree.
 * @returns {Object<string,{blob:string, size:number}>} Present files only.
 */
const graphBlobs = (root, out, revision, files) => {
  const names = [...files, GRAPH_STAMP];
  if (revision)
    return Object.fromEntries(
      git(root, ['ls-tree', '-z', '-l', revision, '--', ...names.map((name) => `${out}/${name}`)])
        .split('\0')
        .filter(Boolean)
        .map((line) => {
          const [meta, file] = line.split('\t');
          const [, , blob, size] = meta.split(/\s+/);
          return [path.posix.basename(file), { blob, size: Number(size) }];
        }),
    );
  return Object.fromEntries(
    names
      .filter((name) => fs.existsSync(path.join(root, out, name)))
      .map((name) => [
        name,
        {
          blob: git(root, ['hash-object', '--', `${out}/${name}`]),
          size: fs.statSync(path.join(root, out, name)).size,
        },
      ]),
  );
};

/**
 * Checks a graph against the sources it describes, without Graphify and without a write.
 * @param {{root:string, out:string, files?:string[], revision?:string}} graph - The work tree when `revision` is absent.
 * @returns {{fresh:true}|{fresh:false, reason:string}} The reason completes "the code graph <dir> …".
 * @memberof Graphify
 */
export const checkGraph = ({ root, out, files = GRAPH_FILES, revision }) => {
  const dir = assertGraphDir(out);
  const committed = assertGraphFiles(files);
  const blobs = graphBlobs(root, dir, revision, committed);
  if (!blobs[GRAPH_STAMP]) return { fresh: false, reason: `has no ${GRAPH_STAMP}: no release built it` };
  let stamp;
  try {
    stamp = JSON.parse(
      revision
        ? git(root, ['cat-file', 'blob', blobs[GRAPH_STAMP].blob])
        : fs.readFileSync(path.join(root, dir, GRAPH_STAMP), 'utf8'),
    );
  } catch {
    stamp = null;
  }
  if (stamp?.stampVersion !== STAMP_VERSION || typeof stamp.inputs !== 'string' || !stamp.files)
    return { fresh: false, reason: `has a ${GRAPH_STAMP} that is not a graph stamp` };
  if (stamp.graphify !== GRAPHIFY_VERSION)
    return { fresh: false, reason: `was built by graphify ${stamp.graphify}, not ${GRAPHIFY_VERSION}` };
  for (const name of committed) {
    if (!blobs[name]) return { fresh: false, reason: `has no ${name}` };
    if (!blobs[name].size) return { fresh: false, reason: `has an empty ${name}` };
    if (blobs[name].blob !== stamp.files[name])
      return { fresh: false, reason: `has a ${name} changed after its build` };
  }
  if (graphInputs(root, dir, revision) !== stamp.inputs) return { fresh: false, reason: 'is older than its sources' };
  return { fresh: true };
};

/**
 * The graphs of a list that are not fresh.
 * @param {Array<{name:string, root:string, out:string, files?:string[], revision?:string}>} graphs
 * @returns {Array<{name:string, root:string, out:string, reason:string}>}
 * @memberof Graphify
 */
export const staleGraphs = (graphs) =>
  graphs.map((graph) => ({ ...graph, ...checkGraph(graph) })).filter(({ fresh }) => !fresh);

/**
 * Builds the graph of a work tree with `graphify update`, code only, then stamps it. A fresh graph
 * stays as it is, and needs no Graphify.
 * @param {{root:string, out:string, files?:string[]}} graph
 * @returns {{built:boolean, version:string, seconds?:number, nodes?:number, links?:number}}
 * @throws {Error} When Graphify is missing or fails, or writes no usable graph.
 * @memberof Graphify
 */
export const writeGraph = ({ root, out, files = GRAPH_FILES }) => {
  const dir = assertGraphDir(out);
  const committed = assertGraphFiles(files);
  if (checkGraph({ root, out: dir, files: committed }).fresh) return { built: false, version: GRAPHIFY_VERSION };
  const { executable, version } = graphifyTool();
  fs.mkdirpSync(path.join(root, dir));
  const started = Date.now();
  const result = shellExec(`${shellArgumentFactory(executable)} update .`, {
    cwd: root,
    env: graphifyEnv(dir),
    silentOnError: true,
  });
  if (result.code !== 0)
    throw new Error(
      `graphify update failed in ${root} (exit ${result.code}): ${lastLine(result.stderr || result.stdout)}`,
    );
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const report = path.join(root, dir, 'GRAPH_REPORT.md');
  if (!fs.existsSync(report) || !fs.statSync(report).size) throw new Error(`graphify wrote no ${report}`);
  let data;
  try {
    data = fs.readJsonSync(path.join(root, dir, 'graph.json'));
  } catch (error) {
    throw new Error(`graphify wrote no readable ${path.join(root, dir, 'graph.json')}: ${error.message}`);
  }
  if (!Array.isArray(data?.nodes) || !data.nodes.length || !Array.isArray(data.links))
    throw new Error(`${path.join(root, dir, 'graph.json')} holds no nodes and links`);
  const blobs = graphBlobs(root, dir, undefined, committed);
  const stamp = {
    stampVersion: STAMP_VERSION,
    graphify: version,
    inputs: graphInputs(root, dir),
    files: Object.fromEntries(committed.map((name) => [name, blobs[name].blob])),
  };
  fs.writeFileSync(path.join(root, dir, GRAPH_STAMP), `${JSON.stringify(stamp, null, 2)}\n`);
  return { built: true, version, seconds, nodes: data.nodes.length, links: data.links.length };
};
