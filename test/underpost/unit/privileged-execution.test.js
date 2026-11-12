// The privilege boundary of the process executors: a privileged command runs as it is in a root process,
// else through sudo, which asks for a password only on an interactive terminal outside CI. The shell harness
// answers every command, and the file operations of root write only in a scratch directory.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import childProcess from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import {
  chownHostPath,
  linkHostPath,
  makeHostDirectory,
  moveHostPath,
  removeHostPath,
  runCommand,
  shellExec,
  writeHostFile,
} from '../../../src/server/runtime/process.js';
import { withExecutionProfile } from '../../../src/server/build/execution.js';
import { shellHarness } from '../../support/shell-harness.js';

const HOME_KUBECONFIG = nodePath.join(os.homedir(), '.kube', 'config');

let harness;
const nonInteractive = () => vi.stubEnv('CI', 'true');
const terminals = [];
const interactive = () => {
  vi.stubEnv('CI', '');
  for (const stream of [process.stdin, process.stderr]) {
    terminals.push([stream, Object.getOwnPropertyDescriptor(stream, 'isTTY')]);
    Object.defineProperty(stream, 'isTTY', { value: true, configurable: true });
  }
};

beforeEach(() => vi.stubEnv('KUBECONFIG', ''));
afterEach(() => {
  harness?.restore();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const [stream, descriptor] of terminals.splice(0))
    if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
    else delete stream.isTTY;
});

describe('a privileged command of a root process', () => {
  it('runs as it is, and nothing elevates again', async () => {
    harness = shellHarness([], { uid: 0 });
    shellExec('sysctl -w net.core.rmem_max=7500000', { privileged: 'raises the UDP buffers' });
    await runCommand('cat', ['/etc/kubernetes/admin.conf'], { privileged: 'reads the kubeconfig of kubeadm' });
    expect(harness.calls).toEqual(['sysctl -w net.core.rmem_max=7500000', 'cat /etc/kubernetes/admin.conf']);
  });

  it('keeps the exit code and the output of a failure', async () => {
    harness = shellHarness([{ match: 'dnf', code: 1, stderr: 'No match for argument: nope' }], { uid: 0 });
    expect(() => shellExec('dnf -y install nope', { privileged: 'installs nope' })).toThrow(
      expect.objectContaining({ code: 1, stderr: 'No match for argument: nope' }),
    );
    await expect(runCommand('dnf', ['-y', 'install', 'nope'], { privileged: 'installs nope' })).rejects.toMatchObject({
      code: 1,
    });
  });

  it('reports the signal that stopped it', async () => {
    harness = shellHarness([{ match: 'kubeadm', signal: 'SIGTERM' }], { uid: 0 });
    await expect(runCommand('kubeadm', ['reset', '--force'], { privileged: 'resets kubeadm' })).rejects.toMatchObject({
      code: -1,
      stderr: 'stopped by SIGTERM',
    });
  });
});

describe('a privileged command of an unprivileged process', () => {
  it('runs through sudo -n without a terminal, with the kubeconfig and the target of the caller', async () => {
    nonInteractive();
    vi.stubEnv('KUBECONFIG', '/tmp/pin.json:/home/operator/.kube/config');
    vi.stubEnv('UNDERPOST_CLUSTER_TARGET', '{"environment":"development","context":"kind-kind"}');
    harness = shellHarness();
    shellExec("install -d '/srv/volume'", { privileged: 'writes the node volume' });
    await runCommand('cat', ['/etc/kubernetes/admin.conf'], { privileged: 'reads the kubeconfig of kubeadm' });
    const carried = [
      'KUBECONFIG=/tmp/pin.json:/home/operator/.kube/config',
      'UNDERPOST_CLUSTER_TARGET={"environment":"development","context":"kind-kind"}',
    ];
    expect(harness.calls).toEqual([
      [
        "'sudo' '-n' '--' 'env'",
        ...carried.map((value) => `'${value}'`),
        "'/bin/sh' '-c' 'install -d '\\''/srv/volume'\\'''",
      ].join(' '),
      ['sudo -n -- env', ...carried, 'cat /etc/kubernetes/admin.conf'].join(' '),
    ]);
  });

  it('lets sudo ask for a password on an interactive terminal', () => {
    interactive();
    harness = shellHarness();
    shellExec('swapoff -a', { privileged: 'turns the swap off' });
    expect(harness.calls).toEqual([`'sudo' '--' 'env' 'KUBECONFIG=${HOME_KUBECONFIG}' '/bin/sh' '-c' 'swapoff -a'`]);
  });

  it('never prompts in CI, even on a terminal', () => {
    interactive();
    vi.stubEnv('CI', 'true');
    harness = shellHarness();
    shellExec('swapoff -a', { privileged: 'turns the swap off' });
    expect(harness.calls[0]).toMatch(/^'sudo' '-n' '--' /);
  });

  it('keeps the kubeconfig of the invoking user when KUBECONFIG is unset, never the one of root', async () => {
    nonInteractive();
    harness = shellHarness();
    await runCommand('kubectl', ['port-forward', 'svc/web', '80:8080'], { privileged: 'binds the host port 80' });
    expect(harness.calls).toEqual([
      `sudo -n -- env KUBECONFIG=${HOME_KUBECONFIG} kubectl port-forward svc/web 80:8080`,
    ]);
  });

  it('carries the environment the caller gives the command, not the one of this process', () => {
    nonInteractive();
    vi.stubEnv('KUBECONFIG', '/home/operator/.kube/config');
    harness = shellHarness();
    shellExec('true', { privileged: 'tests', env: { ...process.env, KUBECONFIG: '/tmp/other.json' } });
    expect(harness.calls[0]).toContain(`'KUBECONFIG=/tmp/other.json'`);
  });

  it('runs in the working directory of the caller', async () => {
    nonInteractive();
    const scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-privileged-cwd-'));
    let shellCwd = '';
    // A shell command runs in the directory of this process; a program gets the directory to spawn in.
    const record = (command) => command.startsWith("'sudo'") && (shellCwd = process.cwd()) && false;
    harness = shellHarness([{ match: record }]);
    const spawned = vi.spyOn(childProcess, 'spawn');
    try {
      shellExec('ls', { privileged: 'lists', cwd: scratch });
      await runCommand('ls', [], { privileged: 'lists', cwd: scratch });
      expect(shellCwd).toBe(fs.realpathSync(scratch));
      expect(spawned.mock.calls[0][2].cwd).toBe(scratch);
    } finally {
      fs.removeSync(scratch);
    }
  });

  it('never runs an ordinary command through sudo, and adds no password to the environment', async () => {
    nonInteractive();
    harness = shellHarness();
    const spawned = vi.spyOn(childProcess, 'spawn');
    shellExec('kubectl get pods');
    await runCommand('git', ['status']);
    await runCommand('cat', ['/etc/x'], { privileged: 'reads x' });
    expect(harness.calls.slice(0, 2)).toEqual(['kubectl get pods', 'git status']);
    for (const [program, args, options] of spawned.mock.calls) {
      expect([program, ...args]).not.toContain('-S');
      expect(Object.keys(options.env).filter((key) => !(key in process.env))).toEqual([]);
    }
  });
});

describe('a refusal of sudo', () => {
  beforeEach(() => {
    nonInteractive();
  });

  it('names what needed root when sudo cannot ask for a password', async () => {
    harness = shellHarness([{ match: 'sudo', code: 1, stderr: 'sudo: a password is required' }]);
    expect(() => shellExec('rsync -a src/ dst/', { privileged: 'refreshes the engine mirror' })).toThrow(
      'refreshes the engine mirror: this needs root, and sudo cannot ask for a password in this session. ' +
        'Run it as root, on a terminal, or grant this user passwordless sudo for it.',
    );
    await expect(runCommand('cat', ['/etc/x'], { privileged: 'reads x' })).rejects.toThrow('reads x: this needs root');
  });

  it('names a user that sudo does not authorize', () => {
    harness = shellHarness([{ match: 'sudo', code: 1, stderr: 'operator is not in the sudoers file.' }]);
    expect(() => shellExec('swapoff -a', { privileged: 'turns the swap off' })).toThrow(
      'turns the swap off: this needs root, and sudo refuses this user.',
    );
  });

  it('names a host without sudo', async () => {
    harness = shellHarness([
      { match: /^'sudo'/, code: 127, stderr: '/bin/sh: line 1: sudo: command not found' },
      { match: /^sudo /, throws: new Error('spawn sudo ENOENT') },
    ]);
    expect(() => shellExec('swapoff -a', { privileged: 'turns the swap off' })).toThrow(
      'turns the swap off: this needs root, and sudo is not installed. Run it as root.',
    );
    await expect(runCommand('swapoff', ['-a'], { privileged: 'turns the swap off' })).rejects.toThrow(
      'sudo is not installed',
    );
  });

  it('keeps a failure of the command itself as it is', () => {
    harness = shellHarness([{ match: 'sudo', code: 1, stderr: 'dnf: No match for argument: nope' }]);
    expect(() => shellExec('dnf -y install nope', { privileged: 'installs nope' })).toThrow(/^shellExec failed/);
  });
});

describe('the decision on a privileged command', () => {
  it('counts it as a host write, so a hermetic build elides it', () => {
    harness = shellHarness();
    withExecutionProfile('HERMETIC_BUILD', () => {
      shellExec("install -m 0644 a '/etc/x'", { privileged: 'writes x' });
      shellExec('git status');
    });
    expect(harness.calls).toEqual(['git status']);
  });

  it('refuses kubectl, helm and lxc as root: RBAC and LXD authorization are not Linux root', async () => {
    harness = shellHarness([], { uid: 0 });
    expect(() => shellExec('kubectl apply -f x.yaml', { privileged: 'applies x' })).toThrow(
      'A privileged command never reaches the Kubernetes API',
    );
    await expect(runCommand('helm', ['upgrade', 'x', 'chart'], { privileged: 'upgrades x' })).rejects.toThrow(
      'never reaches the Kubernetes API',
    );
    expect(() => shellExec("lxc 'list'", { privileged: 'lists instances' })).toThrow(
      'A privileged command never runs the LXD client',
    );
    expect(harness.calls).toEqual([]);
  });
});

describe('a host file operation', () => {
  let scratch;
  beforeEach(() => (scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-host-files-'))));
  afterEach(() => fs.removeSync(scratch));

  it('writes natively in a root process, owned by root at its mode, and only when the content changes', () => {
    const chown = vi.spyOn(fs, 'chownSync').mockImplementation(() => {});
    harness = shellHarness([], { uid: 0 });
    const target = nodePath.join(scratch, 'etc/yum.repos.d/x.repo');
    expect(writeHostFile({ target, content: '[x]\n', mode: '0600' })).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('[x]\n');
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    expect(chown).toHaveBeenCalledWith(expect.stringContaining(target), 0, 0);
    expect(writeHostFile({ target, content: '[x]\n', mode: '0600' })).toBe(false);
    expect(harness.calls).toEqual([]);
  });

  it('removes, creates and links natively in a root process, with the owner of the data', () => {
    const chown = vi.spyOn(fs, 'chownSync').mockImplementation(() => {});
    harness = shellHarness([], { uid: 0 });
    fs.outputFileSync(nodePath.join(scratch, 'cni/10-calico.conflist'), '{}');
    fs.outputFileSync(nodePath.join(scratch, 'cni/.hidden'), '');
    removeHostPath(nodePath.join(scratch, 'cni'), { contents: true, reason: 'resets the CNI' });
    expect(fs.readdirSync(nodePath.join(scratch, 'cni'))).toEqual([]);

    makeHostDirectory(nodePath.join(scratch, 'data/mongodb/v0'), {
      reason: 'creates a data path',
      mode: '0700',
      owner: { uid: 999, gid: 999 },
    });
    expect(fs.statSync(nodePath.join(scratch, 'data/mongodb/v0')).mode & 0o777).toBe(0o700);
    expect(chown).toHaveBeenCalledWith(nodePath.join(scratch, 'data/mongodb/v0'), 999, 999);

    fs.outputFileSync(nodePath.join(scratch, 'bin/helm'), 'old');
    linkHostPath('/usr/local/bin/helm', nodePath.join(scratch, 'bin/helm'), { reason: 'links helm' });
    expect(fs.readlinkSync(nodePath.join(scratch, 'bin/helm'))).toBe('/usr/local/bin/helm');

    removeHostPath(nodePath.join(scratch, 'data'), { reason: 'removes the data' });
    expect(fs.existsSync(nodePath.join(scratch, 'data'))).toBe(false);
    expect(harness.calls).toEqual([]);
  });

  it('runs each operation through sudo in an unprivileged process', () => {
    nonInteractive();
    harness = shellHarness();
    fs.ensureDirSync(nodePath.join(scratch, 'cni'));
    fs.ensureDirSync(nodePath.join(scratch, 'etcd'));
    writeHostFile({ target: nodePath.join(scratch, 'x.conf'), content: 'x = 1\n' });
    removeHostPath(nodePath.join(scratch, 'cni'), { contents: true, reason: 'resets the CNI' });
    removeHostPath(nodePath.join(scratch, 'etcd'), { reason: 'removes etcd' });
    makeHostDirectory(nodePath.join(scratch, 'data/v0'), {
      reason: 'creates a data path',
      owner: { uid: 999, gid: 999 },
    });
    linkHostPath('/usr/local/bin/helm', '/bin/helm', { reason: 'links helm' });
    expect(harness.calls.map((call) => call.replace(/^'sudo' '-n' '--' 'env' '[^']*' '\/bin\/sh' '-c' /, ''))).toEqual([
      expect.stringMatching(/^'install -D -m 0644 -o root -g root .*x\.conf'\\'''$/),
      `'[ ! -d '\\''${scratch}/cni'\\'' ] || find '\\''${scratch}/cni'\\'' -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'`,
      `'rm -rf -- '\\''${scratch}/etcd'\\'''`,
      `'install -d -m 0755 -o 999 -g 999 '\\''${scratch}/data/v0'\\'''`,
      `'ln -sfn -- '\\''/usr/local/bin/helm'\\'' '\\''/bin/helm'\\'''`,
    ]);
    expect(fs.existsSync(nodePath.join(scratch, 'x.conf'))).toBe(false);
  });

  it('elides a native host write under a profile without host writes', () => {
    harness = shellHarness([], { uid: 0 });
    const target = nodePath.join(scratch, 'x.conf');
    withExecutionProfile('OFFLINE_DRY_RUN', () => writeHostFile({ target, content: 'x = 1\n' }));
    expect(fs.existsSync(target)).toBe(false);
  });

  it('refuses to remove the root of the file system or a relative path', () => {
    expect(() => removeHostPath('/', { reason: 'x' })).toThrow('removeHostPath refuses /');
    expect(() => removeHostPath('var/lib', { reason: 'x' })).toThrow('removeHostPath refuses var/lib');
  });
});

describe('the checks of a recursive host file operation', () => {
  let scratch;
  beforeEach(() => {
    scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-host-tree-'));
    harness = shellHarness([], { uid: 0 });
  });
  afterEach(() => fs.removeSync(scratch));

  it('refuses an empty path, a system tree, and a path that leaves its root, before it runs anything', () => {
    const within = nodePath.join(scratch, 'nfs');
    fs.ensureDirSync(nodePath.join(within, 'node'));
    for (const target of ['', '/var/lib', '/usr/local/bin', '/etc', '/home'])
      expect(() => removeHostPath(target, { reason: 'x', contents: true }), target).toThrow(/removeHostPath refuses/);
    expect(() => removeHostPath(`${within}/../outside`, { reason: 'x', within })).toThrow(`it is outside ${within}`);
    expect(() => removeHostPath(within, { reason: 'x', within })).toThrow(`${within} stays`);
    expect(() => chownHostPath('/usr', { reason: 'x' })).toThrow('chownHostPath refuses /usr');
    expect(harness.calls).toEqual([]);
  });

  it('empties a directory, hidden entries included, and keeps the directory itself', () => {
    const within = nodePath.join(scratch, 'nfs');
    const root = nodePath.join(within, 'node');
    for (const file of ['.hidden', 'etc/os-release', 'usr/.cache/x']) fs.outputFileSync(nodePath.join(root, file), '');
    removeHostPath(root, { contents: true, within, reason: 'empties the NFS root' });
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('never follows a link: it refuses to empty one, and removes the link itself', () => {
    const outside = nodePath.join(scratch, 'outside');
    fs.outputFileSync(nodePath.join(outside, 'keep'), '');
    const link = nodePath.join(scratch, 'nfs', 'node');
    fs.ensureDirSync(nodePath.dirname(link));
    fs.symlinkSync(outside, link);
    expect(() => removeHostPath(link, { contents: true, reason: 'x' })).toThrow('it is a symbolic link');
    removeHostPath(link, { reason: 'x' });
    expect(fs.existsSync(link)).toBe(false);
    expect(fs.existsSync(nodePath.join(outside, 'keep'))).toBe(true);
  });

  it('gives a tree to its owner with the modes of its directories and files', () => {
    const chown = vi.spyOn(fs, 'lchownSync').mockImplementation(() => {});
    const root = nodePath.join(scratch, 'site');
    fs.outputFileSync(nodePath.join(root, 'wp-content', 'index.php'), '');
    chownHostPath(root, { owner: { uid: 2, gid: 2 }, modes: { directory: '0755', file: '0644' }, reason: 'x' });
    expect(chown.mock.calls.map(([path]) => nodePath.relative(root, path)).sort()).toEqual([
      '',
      'wp-content',
      'wp-content/index.php',
    ]);
    expect(fs.statSync(nodePath.join(root, 'wp-content')).mode & 0o777).toBe(0o755);
    expect(fs.statSync(nodePath.join(root, 'wp-content', 'index.php')).mode & 0o777).toBe(0o644);
  });

  it('moves a tree, and refuses a target that exists', () => {
    fs.outputFileSync(nodePath.join(scratch, 'wordpress', 'index.php'), 'wp');
    moveHostPath(nodePath.join(scratch, 'wordpress'), nodePath.join(scratch, 'site'), { reason: 'x' });
    expect(fs.readFileSync(nodePath.join(scratch, 'site', 'index.php'), 'utf8')).toBe('wp');
    fs.ensureDirSync(nodePath.join(scratch, 'other'));
    expect(() =>
      moveHostPath(nodePath.join(scratch, 'other'), nodePath.join(scratch, 'site'), { reason: 'x' }),
    ).toThrow('it exists');
  });

  it('runs the same checks through sudo for an unprivileged user', () => {
    harness.restore();
    harness = shellHarness();
    chownHostPath(nodePath.join(scratch, 'site'), {
      owner: { uid: 2, gid: 2 },
      modes: { directory: '0755', file: '0644' },
      reason: 'x',
    });
    expect(harness.calls[0]).toContain(
      `find '\\''${scratch}/site'\\'' -xdev -exec chown -h 2:2 {} + && find '\\''${scratch}/site'\\'' -xdev -type d -exec chmod 0755 {} +`,
    );
  });
});
