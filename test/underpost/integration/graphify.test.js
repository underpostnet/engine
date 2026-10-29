import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  GRAPHIFY_VERSION,
  GRAPH_STAMP,
  assertGraphDir,
  assertGraphFiles,
  checkGraph,
  graphPaths,
  graphifyEnabled,
  graphifyTool,
  releaseGraphs,
  staleGraphs,
  writeGraph,
} from '../../../src/server/release/graphify.js';
import { ENGINE_GRAPH } from '../../../src/projects/underpost/catalog-underpost.js';
import UnderpostGraphify from '../../../src/cli/graphify.js';

// The real boundary is git. A stand-in `graphify` on the PATH records each run and writes the graph files.
const OUT = 'docs/graphify-out';

const installedGraphify = (() => {
  try {
    return graphifyTool();
  } catch {
    return null;
  }
})();

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.email=graph@test', '-c', 'user.name=graph', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const STAND_IN = `#!/bin/sh
case "$1" in
  --version) echo "graphify \${STAND_IN_VERSION:-${GRAPHIFY_VERSION}}"; exit 0 ;;
  update) ;;
  *) exit 2 ;;
esac
echo "$(pwd)|$2|$GRAPHIFY_OUT|$GRAPHIFY_BACKEND|$GRAPHIFY_NO_AUTO_REFRESH" >> "$STAND_IN_LOG"
[ "$STAND_IN_MODE" = fail ] && { echo "extraction failed" >&2; exit 1; }
mkdir -p "$GRAPHIFY_OUT/cache"
echo cache > "$GRAPHIFY_OUT/cache/ast.json"
echo '<html></html>' > "$GRAPHIFY_OUT/graph.html"
if [ "$STAND_IN_MODE" = empty ]; then : > "$GRAPHIFY_OUT/GRAPH_REPORT.md"; else
  printf '# Graph Report\\n%s\\n' "$(find src -type f | sort)" > "$GRAPHIFY_OUT/GRAPH_REPORT.md"; fi
if [ "$STAND_IN_MODE" = invalid ]; then echo '{' > "$GRAPHIFY_OUT/graph.json"; else
  echo '{"nodes":[{"id":"a"},{"id":"b"}],"links":[{"source":"a","target":"b"}]}' > "$GRAPHIFY_OUT/graph.json"; fi
`;

describe('the Graphify adapter', () => {
  let base;
  let root;
  let log;
  const saved = {};

  const write = (file, text) => {
    fs.outputFileSync(path.join(root, file), text);
  };
  const commit = (message, ...paths) => {
    git(root, 'add', '--', ...(paths.length ? paths : ['.']));
    git(root, 'commit', '-q', '-m', message);
    return git(root, 'rev-parse', 'HEAD');
  };
  const runs = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []);
  const status = () =>
    execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trimEnd();
  const graph = (revision) => checkGraph({ root, out: OUT, revision });
  const build = () => {
    const result = writeGraph({ root, out: OUT });
    return { result, revision: commit('Update the code graph', ...graphPaths(OUT)) };
  };

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-it-'));
    root = path.join(base, 'repo');
    log = path.join(base, 'runs.log');
    const bin = path.join(base, 'bin');
    fs.outputFileSync(path.join(bin, 'graphify'), STAND_IN, { mode: 0o755 });
    for (const key of ['PATH', 'STAND_IN_LOG', 'STAND_IN_MODE', 'STAND_IN_VERSION']) saved[key] = process.env[key];
    process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
    process.env.STAND_IN_LOG = log;
    delete process.env.STAND_IN_MODE;
    delete process.env.STAND_IN_VERSION;
    git(base, 'init', '-q', '-b', 'main', root);
    write('.graphifyignore', '/*\n!/src/\n/src/shell.html\n');
    write(
      '.gitignore',
      '*.log\n/docs/graphify-out/*\n!/docs/graphify-out/graph.json\n!/docs/graphify-out/GRAPH_REPORT.md\n!/docs/graphify-out/graph.stamp.json\n',
    );
    write('src/main.js', "import { run } from './run.js';\nrun();\n");
    write('src/run.js', 'export const run = () => 1;\n');
    write('src/shell.html', '<html></html>\n');
    write('README.md', '# repo\n');
    commit('init');
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    fs.removeSync(base);
  });

  describe('which graphs a release builds', () => {
    it('takes the flag, else the product setting, else off', () => {
      expect(graphifyEnabled(undefined, true)).toBe(true);
      expect(graphifyEnabled(undefined, undefined)).toBe(false);
      expect(graphifyEnabled(true, false)).toBe(true);
      expect(graphifyEnabled(false, true)).toBe(false);
    });

    it('names only the repositories that declare a graph directory, and none while off', () => {
      const repositories = [{ name: 'code', graph: 'docs/graphify-out/' }, { name: 'data' }];
      expect(releaseGraphs(repositories, true)).toEqual({ code: 'docs/graphify-out' });
      expect(releaseGraphs(repositories, false)).toEqual({});
    });

    it('keeps a graph directory inside its repository', () => {
      expect(assertGraphDir('./docs//graphify-out/')).toBe('docs/graphify-out');
      for (const out of ['', '.', '..', '../graphs', '/tmp/graphs', 'docs/../../graphs'])
        expect(() => assertGraphDir(out), out).toThrow(/not a graph directory/);
    });

    it('commits exactly the report, the graph and the stamp', () => {
      expect(graphPaths(OUT)).toEqual([`${OUT}/GRAPH_REPORT.md`, `${OUT}/graph.json`, `${OUT}/${GRAPH_STAMP}`]);
    });
  });

  describe('a build', () => {
    it('runs graphify update in the repository root, code only, with the graph directory', () => {
      const result = writeGraph({ root, out: OUT });
      expect(result).toMatchObject({ built: true, version: GRAPHIFY_VERSION, nodes: 2, links: 1 });
      expect(runs()).toEqual([`${root}|.|${OUT}|none|1`]);
      expect(fs.readJsonSync(path.join(root, OUT, GRAPH_STAMP))).toMatchObject({
        stampVersion: 1,
        graphify: GRAPHIFY_VERSION,
      });
      expect(graph()).toEqual({ fresh: true });
    });

    it('leaves a fresh graph as it is, and needs no Graphify for it', () => {
      build();
      const stamp = fs.readFileSync(path.join(root, OUT, GRAPH_STAMP), 'utf8');
      process.env.PATH = path.dirname(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim());
      expect(writeGraph({ root, out: OUT })).toEqual({ built: false, version: GRAPHIFY_VERSION });
      expect(runs()).toHaveLength(1);
      expect(fs.readFileSync(path.join(root, OUT, GRAPH_STAMP), 'utf8')).toBe(stamp);
    });

    it('builds again when a scanned file changes, and only then', () => {
      build();
      write('README.md', '# changed, but not scanned\n');
      write('src/shell.html', '<html>ignored</html>\n');
      write('src/debug.log', 'ignored by git\n');
      expect(writeGraph({ root, out: OUT }).built).toBe(false);
      write('src/new.js', 'export const added = 2;\n');
      expect(writeGraph({ root, out: OUT }).built).toBe(true);
      expect(runs()).toHaveLength(2);
    });

    it('builds again when the scan configuration changes', () => {
      build();
      write('.graphifyignore', '/*\n!/src/\n');
      expect(graph()).toEqual({ fresh: false, reason: 'is older than its sources' });
    });

    it('reports a missing Graphify, and another version, with the install command', () => {
      const gitDir = path.dirname(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim());
      process.env.PATH = gitDir;
      if (fs.existsSync(path.join(gitDir, 'graphify'))) return;
      expect(() => writeGraph({ root, out: OUT })).toThrow(
        `graphify is not on the PATH: run pipx install --force graphifyy==${GRAPHIFY_VERSION}`,
      );
      process.env.PATH = `${path.join(base, 'bin')}${path.delimiter}${gitDir}`;
      process.env.STAND_IN_VERSION = '0.9.1';
      expect(() => writeGraph({ root, out: OUT })).toThrow(`is graphify 0.9.1, not ${GRAPHIFY_VERSION}`);
      expect(runs()).toEqual([]);
    });

    it('fails on a non-zero exit, an empty report and an unreadable graph, and stamps none of them', () => {
      for (const [mode, message] of [
        ['fail', `graphify update failed in ${root} (exit 1): extraction failed`],
        ['empty', 'graphify wrote no'],
        ['invalid', 'graphify wrote no readable'],
      ]) {
        process.env.STAND_IN_MODE = mode;
        expect(() => writeGraph({ root, out: OUT }), mode).toThrow(message);
        expect(fs.existsSync(path.join(root, OUT, GRAPH_STAMP)), mode).toBe(false);
      }
    });

    it('changes nothing outside its graph directory', () => {
      write('src/run.js', 'export const run = () => 2;\n');
      git(root, 'add', 'src/run.js');
      write('README.md', '# work in progress\n');
      const staged = git(root, 'diff', '--cached');
      writeGraph({ root, out: OUT });
      expect(git(root, 'diff', '--cached')).toBe(staged);
      expect(
        status()
          .split('\n')
          .filter((line) => !line.includes(`${OUT}/`)),
      ).toEqual([' M README.md', 'M  src/run.js']);
    });

    it('leaves the transient Graphify files out of what a release commits', () => {
      writeGraph({ root, out: OUT });
      git(root, 'add', '--', ...graphPaths(OUT));
      expect(git(root, 'diff', '--cached', '--name-only').split('\n')).toEqual(graphPaths(OUT).sort());
      expect(status()).not.toMatch(/cache|graph\.html/);
    });
  });

  describe('a check at a revision', () => {
    it('is fresh at the commit of the build, and refuses a commit without a stamp', () => {
      const before = git(root, 'rev-parse', 'HEAD');
      const { revision } = build();
      expect(graph(revision)).toEqual({ fresh: true });
      expect(graph(before)).toEqual({ fresh: false, reason: `has no ${GRAPH_STAMP}: no release built it` });
    });

    it('refuses a revision whose sources changed after the build', () => {
      build();
      write('src/run.js', 'export const run = () => 3;\n');
      expect(graph(commit('change the code'))).toEqual({ fresh: false, reason: 'is older than its sources' });
    });

    it('refuses a revision whose graph files changed after the build', () => {
      const { revision } = build();
      write(`${OUT}/GRAPH_REPORT.md`, '# edited by hand\n');
      expect(graph(commit('edit the report'))).toEqual({
        fresh: false,
        reason: 'has a GRAPH_REPORT.md changed after its build',
      });
      git(root, 'checkout', revision, '--', `${OUT}/GRAPH_REPORT.md`);
      git(root, 'rm', '-q', `${OUT}/graph.json`);
      expect(graph(commit('drop the graph'))).toMatchObject({ fresh: false, reason: 'has no graph.json' });
    });

    it('refuses a stamp of another Graphify release, or no stamp at all', () => {
      const { revision } = build();
      const stamp = fs.readJsonSync(path.join(root, OUT, GRAPH_STAMP));
      write(`${OUT}/${GRAPH_STAMP}`, JSON.stringify({ ...stamp, graphify: '0.9.1' }));
      expect(graph(commit('older stamp'))).toEqual({
        fresh: false,
        reason: 'was built by graphify 0.9.1, not ' + GRAPHIFY_VERSION,
      });
      write(`${OUT}/${GRAPH_STAMP}`, '{');
      expect(graph(commit('broken stamp'))).toMatchObject({ reason: `has a ${GRAPH_STAMP} that is not a graph stamp` });
      expect(graph(revision)).toEqual({ fresh: true });
    });

    it('reads the revision, not the work tree, and writes nothing', () => {
      const { revision } = build();
      write('src/run.js', 'export const run = () => 4;\n');
      write(`${OUT}/GRAPH_REPORT.md`, '# dirty\n');
      const before = status();
      const index = fs.readFileSync(path.join(root, '.git/index'));
      expect(graph(revision)).toEqual({ fresh: true });
      expect(graph()).toMatchObject({ fresh: false });
      expect(fs.readFileSync(path.join(root, '.git/index')).equals(index)).toBe(true);
      expect(status()).toBe(before);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(revision);
    });

    it('carries one build through lock and publish: the locked revision stays fresh while HEAD moves on', () => {
      const { revision: locked } = build();
      expect(staleGraphs([{ name: 'code', root, out: OUT, revision: locked }])).toEqual([]);
      write('src/run.js', 'export const run = () => 5;\n');
      const head = commit('after the lock');
      expect(staleGraphs([{ name: 'code', root, out: OUT, revision: locked }])).toEqual([]);
      expect(staleGraphs([{ name: 'code', root, out: OUT, revision: head }])).toEqual([
        { name: 'code', root, out: OUT, revision: head, fresh: false, reason: 'is older than its sources' },
      ]);
      expect(runs()).toHaveLength(1);
    });
  });

  describe('the engine graph', () => {
    const { out, files } = ENGINE_GRAPH;
    const inRoot = (run) => {
      const cwd = process.cwd();
      process.chdir(root);
      try {
        return run();
      } finally {
        process.chdir(cwd);
      }
    };

    beforeEach(() => {
      write(
        '.gitignore',
        `*.log\n/${out}/*\n${graphPaths(out, files)
          .map((file) => `!/${file}`)
          .join('\n')}\n`,
      );
      commit('Track the engine report only');
    });

    it('commits the report and the stamp, and names only graph files', () => {
      expect(graphPaths(out, files)).toEqual([`${out}/GRAPH_REPORT.md`, `${out}/${GRAPH_STAMP}`]);
      expect(assertGraphFiles()).toEqual(['GRAPH_REPORT.md', 'graph.json']);
      for (const names of [[], ['graph.html'], ['GRAPH_REPORT.md', GRAPH_STAMP]])
        expect(() => assertGraphFiles(names), JSON.stringify(names)).toThrow(/names no graph files/);
    });

    it('stamps the report only, and keeps graph.json local', () => {
      expect(UnderpostGraphify.API.build({ root })).toMatchObject({ built: true, nodes: 2, links: 1 });
      expect(Object.keys(fs.readJsonSync(path.join(root, out, GRAPH_STAMP)).files)).toEqual(['GRAPH_REPORT.md']);
      git(root, 'add', '--', ...graphPaths(out, files));
      git(root, 'commit', '-q', '-m', 'Update the code graph');
      const revision = git(root, 'rev-parse', 'HEAD');
      expect(status()).toBe('');
      expect(git(root, 'ls-tree', '-r', '--name-only', revision, '--', out).split('\n')).toEqual(
        graphPaths(out, files),
      );
      expect(UnderpostGraphify.API.check({ root, revision })).toEqual({ fresh: true });
      expect(UnderpostGraphify.API.check({ root })).toEqual({ fresh: true });
      expect(UnderpostGraphify.API.build({ root }).built).toBe(false);
      expect(runs()).toHaveLength(1);
    });

    it('builds from the command, and fails a check of a stale graph with the command that builds it', () => {
      expect(() => inRoot(() => UnderpostGraphify.API.callback({ check: true }))).toThrow(
        `The code graph ${path.join(root, out)} has no ${GRAPH_STAMP}: no release built it: run underpost graphify`,
      );
      expect(inRoot(() => UnderpostGraphify.API.callback({})).built).toBe(true);
      expect(inRoot(() => UnderpostGraphify.API.callback({ check: true }))).toEqual({ fresh: true });
      expect(() => inRoot(() => UnderpostGraphify.API.callback({ revision: 'HEAD' }))).toThrow(
        /has no graph\.stamp\.json/,
      );
      write('src/run.js', 'export const run = () => 2;\n');
      expect(() => inRoot(() => UnderpostGraphify.API.callback({ check: true }))).toThrow(
        /is older than its sources: run underpost graphify$/,
      );
      expect(runs()).toHaveLength(1);
    });
  });

  // Runs only where the pinned Graphify is installed: see generate-code-graphs.md.
  describe.skipIf(!installedGraphify)('with the installed Graphify', () => {
    it('builds a code-only graph once, then leaves it fresh', () => {
      process.env.PATH = saved.PATH;
      const first = writeGraph({ root, out: OUT });
      expect(first).toMatchObject({ built: true, version: GRAPHIFY_VERSION });
      expect(first.nodes).toBeGreaterThan(0);
      expect(fs.statSync(path.join(root, OUT, 'GRAPH_REPORT.md')).size).toBeGreaterThan(0);
      expect(writeGraph({ root, out: OUT }).built).toBe(false);
      expect(graph(commit('Update the code graph', ...graphPaths(OUT)))).toEqual({ fresh: true });
      expect(status()).toBe('');
    });
  });
});
