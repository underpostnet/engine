'use strict';

import { expect } from 'chai';
import { EventEmitter } from 'node:events';
import nodeFs from 'node:fs';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { watchRunnerFactory } from '../../../src/server/runtime/watch-runner.js';
import { alive } from '../../support/process.js';

// The runner watches a real directory and restarts a real child script, so what is asserted is the
// file system events Linux delivers and the processes that run. The script appends one JSON line
// per start and keeps a grandchild alive, which shows whether a stop reaches the process group.
const CHILD_SCRIPT = `
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const [log, mode, ...args] = process.argv.slice(2);
const grandchild = spawn('sleep', ['300'], { stdio: 'ignore' });
fs.appendFileSync(log, JSON.stringify({ pid: process.pid, grandchild: grandchild.pid, args }) + '\\n');
const behaviour = fs.readFileSync(mode, 'utf8').trim();
if (behaviour === 'exit') process.exit(0);
if (behaviour === 'crash') process.exit(3);
if (behaviour === 'runtime') {
  process.on('SIGTERM', () => {});
  process.on('SIGINT', () => setTimeout(() => process.exit(130), 200));
}
if (behaviour === 'stubborn') for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {});
setInterval(() => {}, 1000);
`;
const ARGS = ['dd-fixture', 'local-dev-client', 'fixture.test', '/'];
const WAIT = { timeout: 8000, interval: 50 };

const fixture = (watched = 'src/client') => {
  const root = nodeFs.realpathSync(nodeFs.mkdtempSync(path.join(os.tmpdir(), 'underpost-watch-runner-')));
  const directory = path.join(root, watched);
  fs.mkdirpSync(path.join(directory, 'components', 'core'));
  fs.writeFileSync(path.join(directory, 'components', 'core', 'App.js'), 'export default 1;\n');
  fs.writeFileSync(path.join(root, 'child.mjs'), CHILD_SCRIPT);
  fs.writeFileSync(path.join(root, 'mode'), 'run');
  const log = path.join(root, 'starts.log');
  return {
    root,
    directory,
    starts: () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [],
    mode: (value) => fs.writeFileSync(path.join(root, 'mode'), value),
    write: (relative, content = `export default ${Date.now()};\n`) => {
      fs.mkdirpSync(path.dirname(path.join(directory, relative)));
      fs.writeFileSync(path.join(directory, relative), content);
    },
    file: (relative) => path.join(directory, relative),
    runnerOptions: (overrides = {}) => ({
      script: path.join(root, 'child.mjs'),
      args: [log, path.join(root, 'mode'), ...ARGS],
      directory,
      debounceMs: 50,
      killTimeoutMs: 2000,
      rearmDelayMs: 50,
      ...overrides,
    }),
  };
};

describe('development watch runner', () => {
  let context;
  let runner;
  let restarts;

  const startRunner = (overrides) => {
    restarts = [];
    runner = watchRunnerFactory(context.runnerOptions({ onRestart: (paths) => restarts.push(paths), ...overrides }));
    runner.start();
  };
  const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(() => {
    context = fixture();
  });

  afterEach(async () => {
    await runner?.close();
    runner = undefined;
    vi.restoreAllMocks();
    for (const start of context.starts())
      for (const pid of [start.pid, start.grandchild])
        try {
          process.kill(pid, 'SIGKILL');
        } catch (_) {}
    fs.removeSync(context.root);
  });

  it('starts the build once with the exact arguments and reports no change', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    expect(context.starts()[0].args).to.deep.equal(ARGS);
    await settle();
    expect(restarts).to.deep.equal([]);
  });

  it('restarts with the absolute path of a modified, created or deleted source', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    context.write('components/core/App.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
    expect(restarts[0]).to.deep.equal([context.file('components/core/App.js')]);
    expect(context.starts()[1].args).to.deep.equal(ARGS);

    context.write('services/core/core.service.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(3), WAIT);
    expect(restarts[1]).to.include(context.file('services/core/core.service.js'));

    fs.removeSync(context.file('services/core/core.service.js'));
    await vi.waitFor(() => expect(context.starts()).to.have.length(4), WAIT);
    expect(restarts[2]).to.include(context.file('services/core/core.service.js'));
  });

  it('follows a directory created after the watcher started', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    fs.mkdirpSync(context.file('components/new/deep'));
    await settle();
    context.write('components/new/deep/View.js');
    await vi.waitFor(() => expect(restarts.flat()).to.include(context.file('components/new/deep/View.js')), WAIT);
  });

  it('reports the target of an atomic save, never its temporary file', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    context.write('components/core/App.js.tmp-123', 'export default 2;\n');
    fs.renameSync(context.file('components/core/App.js.tmp-123'), context.file('components/core/App.js'));
    await vi.waitFor(() => expect(restarts).to.have.length(1), WAIT);
    expect(restarts[0]).to.deep.equal([context.file('components/core/App.js')]);
  });

  it('ignores other extensions and ignored directories', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    context.write('styles/app.css', 'body {}');
    context.write('node_modules/pkg/index.js');
    context.write('coverage/report.json', '{}');
    await settle(500);
    expect(restarts).to.deep.equal([]);
    expect(context.starts()).to.have.length(1);
  });

  it('coalesces a burst of changes into one restart with each path once', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    for (let index = 0; index < 10; index++) {
      context.write('components/core/App.js');
      context.write(`components/core/Part${index % 3}.js`);
    }
    await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
    await settle(500);
    expect(restarts).to.have.length(1);
    expect(restarts[0]).to.have.members([
      context.file('components/core/App.js'),
      context.file('components/core/Part0.js'),
      context.file('components/core/Part1.js'),
      context.file('components/core/Part2.js'),
    ]);
    expect(context.starts()).to.have.length(2);
  });

  it('carries the paths of an interrupted build until a build completes', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    context.write('components/core/A.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
    context.mode('exit');
    context.write('components/core/B.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(3), WAIT);
    expect(restarts[1]).to.have.members([context.file('components/core/A.js'), context.file('components/core/B.js')]);
    await settle();
    context.write('components/core/C.js');
    await vi.waitFor(() => expect(restarts).to.have.length(3), WAIT);
    expect(restarts[2]).to.deep.equal([context.file('components/core/C.js')]);
  });

  it('waits for a change after a crash instead of restarting in a loop', async () => {
    context.mode('crash');
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    await settle(500);
    expect(context.starts()).to.have.length(1);
    context.mode('run');
    context.write('components/core/App.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
  });

  it('leaves exactly one build and its children running after restarts', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    for (const expected of [2, 3]) {
      context.write('components/core/App.js');
      await vi.waitFor(() => expect(context.starts()).to.have.length(expected), WAIT);
    }
    const [first, second, third] = context.starts();
    await vi.waitFor(() => {
      for (const pid of [first.pid, first.grandchild, second.pid, second.grandchild])
        expect(alive(pid)).to.equal(false);
    }, WAIT);
    expect(alive(third.pid)).to.equal(true);
    expect(alive(third.grandchild)).to.equal(true);
  });

  it('stops the build and its children on close, and restarts nothing after', async () => {
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    await runner.close();
    const [start] = context.starts();
    await vi.waitFor(() => {
      expect(alive(start.pid)).to.equal(false);
      expect(alive(start.grandchild)).to.equal(false);
    }, WAIT);
    context.write('components/core/App.js');
    await settle(500);
    expect(context.starts()).to.have.length(1);
  });

  // Linux names the file of every inotify event; the stub reproduces a platform that does not,
  // and a watcher that fails while the build keeps running.
  it('asks for a full build when a change has no file name, and re-creates a failed watcher', async () => {
    const watchers = [];
    vi.spyOn(fs, 'watch').mockImplementation((root, options, listener) => {
      const watcher = Object.assign(new EventEmitter(), { listener, close: vi.fn() });
      watchers.push(watcher);
      return watcher;
    });
    startRunner();
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    watchers[0].listener('rename', null);
    await vi.waitFor(() => expect(restarts).to.deep.equal([null]), WAIT);
    watchers[0].emit('error', new Error('EMFILE'));
    await vi.waitFor(() => expect(watchers).to.have.length(2), WAIT);
    expect(watchers[0].close).toHaveBeenCalled();
  });

  // The API watcher excludes client sources.
  it('ignores a path prefix but not a directory of the same name elsewhere', async () => {
    fs.removeSync(context.root);
    context = fixture('src');
    startRunner({ ignoredPaths: ['client'] });
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    context.write('client/components/core/App.js');
    await settle(500);
    expect(restarts).to.deep.equal([]);
    context.write('server/client/adapter.js');
    context.write('api/user/user.service.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
    expect(restarts[0]).to.have.members([
      context.file('server/client/adapter.js'),
      context.file('api/user/user.service.js'),
    ]);
  });

  // The runtime ProcessController logs SIGTERM and keeps running; SIGINT is what it exits on.
  it('restarts a runtime that ignores SIGTERM without waiting for the kill timeout', async () => {
    context.mode('runtime');
    startRunner({ killTimeoutMs: 5000 });
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    const started = Date.now();
    context.write('components/core/App.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
    expect(Date.now() - started).to.be.below(3000);
    expect(alive(context.starts()[0].pid)).to.equal(false);
  });

  it('kills a run that ignores every stop signal once the kill timeout passes', async () => {
    context.mode('stubborn');
    startRunner({ killTimeoutMs: 300 });
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    context.write('components/core/App.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
    await vi.waitFor(() => expect(alive(context.starts()[0].pid)).to.equal(false), WAIT);
  });
});

describe.each(['src/server', 'src/api'])('development entry %s', (script) => {
  let context;
  let host;
  let exited;
  const settle = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(async () => {
    context = fixture('src');
    fs.writeFileSync(path.join(context.root, `${script}.js`), CHILD_SCRIPT);
    fs.writeJsonSync(path.join(context.root, 'package.json'), { type: 'module' });
    host = spawn(
      process.execPath,
      [
        path.resolve('src/dev.js'),
        script,
        path.join(context.root, 'starts.log'),
        path.join(context.root, 'mode'),
        ...ARGS,
      ],
      { cwd: context.root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    for (const stream of [host.stdout, host.stderr]) stream.on('data', (data) => (output += data));
    exited = new Promise((resolve) => host.once('exit', resolve));
    await vi.waitFor(() => expect(context.starts(), output).to.have.length(1), { ...WAIT, timeout: 15000 });
  });

  afterEach(async () => {
    host.kill('SIGINT');
    await exited;
    for (const start of context.starts())
      for (const pid of [start.pid, start.grandchild])
        try {
          process.kill(pid, 'SIGKILL');
        } catch (_) {}
    fs.removeSync(context.root);
  });

  it('restarts for API and shared sources with the same arguments', async () => {
    context.write('api/user/user.service.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
    context.write('server/runtime/conf.js');
    await vi.waitFor(() => expect(context.starts()).to.have.length(3), WAIT);
    for (const start of context.starts()) expect(start.args).to.deep.equal(ARGS);
  });

  it('watches client components only when the runtime builds the client', async () => {
    context.write('client/components/cyberia/InstanceSelectionView.js');
    if (script === 'src/server') {
      await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
      const [first] = context.starts();
      await vi.waitFor(() => {
        expect(alive(first.pid)).to.equal(false);
        expect(alive(first.grandchild)).to.equal(false);
      }, WAIT);
      context.write('api/user/user.service.js');
      await vi.waitFor(() => expect(context.starts()).to.have.length(3), WAIT);
    } else {
      await settle();
      expect(context.starts()).to.have.length(1);
      context.write('api/user/user.service.js');
      await vi.waitFor(() => expect(context.starts()).to.have.length(2), WAIT);
    }
    await settle();
    expect(context.starts()).to.have.length(script === 'src/server' ? 3 : 2);
  });
});

// A watcher host is the `src/dev` shape: a process that starts a runner and exits on signals.
const HOST_SCRIPT = `
import { exitOnSignals, watchRunnerFactory } from '${pathToFileURL(path.resolve('src/server/runtime/watch-runner.js')).href}';
const [directory, script, log, mode, hostMode] = process.argv.slice(2);
const runner = watchRunnerFactory({ script, args: [log, mode], directory });
runner.start();
exitOnSignals(runner);
if (hostMode === 'exit') setTimeout(() => process.exit(1), 1500);
`;

describe('development watch runner shutdown', () => {
  let context;
  let host;

  const startHost = (hostMode = '') => {
    fs.writeFileSync(path.join(context.root, 'host.mjs'), HOST_SCRIPT);
    host = spawn(
      process.execPath,
      [
        path.join(context.root, 'host.mjs'),
        context.directory,
        path.join(context.root, 'child.mjs'),
        path.join(context.root, 'starts.log'),
        path.join(context.root, 'mode'),
        hostMode,
      ],
      { stdio: 'ignore' },
    );
    return new Promise((resolve) => host.once('exit', resolve));
  };

  beforeEach(() => {
    context = fixture();
    context.mode('runtime');
  });

  afterEach(() => {
    for (const pid of [host?.pid, ...context.starts().flatMap((start) => [start.pid, start.grandchild])])
      try {
        process.kill(pid, 'SIGKILL');
      } catch (_) {}
    fs.removeSync(context.root);
  });

  // A terminal Ctrl+C signals the whole foreground group: npm, and the host npm runs.
  it('stops the script and its processes on a Ctrl+C through npm run', async () => {
    fs.writeFileSync(path.join(context.root, 'host.mjs'), HOST_SCRIPT);
    const hostArgs = [context.directory, 'child.mjs', 'starts.log', 'mode'].map((arg) => JSON.stringify(arg));
    fs.writeJsonSync(path.join(context.root, 'package.json'), {
      name: 'watch-runner-fixture',
      scripts: { dev: `node host.mjs ${hostArgs.join(' ')}` },
    });
    host = spawn('npm', ['run', 'dev'], { cwd: context.root, stdio: 'ignore', detached: true });
    const exited = new Promise((resolve) => host.once('exit', resolve));
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    process.kill(-host.pid, 'SIGINT');
    await exited;
    const [start] = context.starts();
    await vi.waitFor(() => {
      expect(alive(start.pid)).to.equal(false);
      expect(alive(start.grandchild)).to.equal(false);
    }, WAIT);
  });

  it('kills the script and its processes when the host exits by another path', async () => {
    const exited = startHost('exit');
    await vi.waitFor(() => expect(context.starts()).to.have.length(1), WAIT);
    expect(await exited).to.equal(1);
    const [start] = context.starts();
    await vi.waitFor(() => {
      expect(alive(start.pid)).to.equal(false);
      expect(alive(start.grandchild)).to.equal(false);
    }, WAIT);
  });
});
