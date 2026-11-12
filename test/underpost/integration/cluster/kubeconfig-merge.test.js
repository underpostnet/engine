// Needs kubectl: the merge is kubectl's own. A stand-in `kind` prints the cluster kubeconfig, sudo grants it as
// it does an operator with sudo rights, and the user the command acts for lives in a scratch home, so no real
// kubeconfig is read or written.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import childProcess, { execFileSync } from 'node:child_process';
import Underpost from '../../../../src/index.js';
import { findBinary } from '../../../support/binary.js';

const kubeconfig = (name, server) => `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: ${server}
  name: ${name}
contexts:
- context:
    cluster: ${name}
    user: ${name}
  name: ${name}
current-context: ${name}
users:
- name: ${name}
  user:
    token: token-of-${name}
`;

const KIND = `#!/bin/sh
[ "$1 $2" = "get kubeconfig" ] && cat "$KIND_KUBECONFIG"
`;

describe.skipIf(!findBinary('kubectl'))('the kubeconfig of a cluster', () => {
  let scratch;
  let home;
  let saved;
  const target = () => nodePath.join(home, '.kube', 'config');
  const view = (jsonpath) =>
    execFileSync('kubectl', ['config', 'view', '--kubeconfig', target(), '-o', `jsonpath=${jsonpath}`], {
      encoding: 'utf8',
    });

  beforeAll(() => {
    scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-kubeconfig-test-'));
    fs.ensureDirSync(nodePath.join(scratch, 'bin'));
    fs.writeFileSync(nodePath.join(scratch, 'bin', 'kind'), KIND, { mode: 0o755 });
    fs.writeFileSync(nodePath.join(scratch, 'kind.yaml'), kubeconfig('kind-kind', 'https://127.0.0.1:40001'));
    saved = {
      PATH: process.env.PATH,
      KIND_KUBECONFIG: process.env.KIND_KUBECONFIG,
      SUDO_USER: process.env.SUDO_USER,
    };
    process.env.PATH = `${nodePath.join(scratch, 'bin')}:${process.env.PATH}`;
    process.env.KIND_KUBECONFIG = nodePath.join(scratch, 'kind.yaml');
    // Under sudo, SUDO_USER names the real user the command acts for.
    delete process.env.SUDO_USER;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    fs.removeSync(scratch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(home);
  });

  const actingAs = () => {
    home = fs.mkdtempSync(nodePath.join(scratch, 'home-'));
    const spawn = childProcess.spawn;
    vi.spyOn(childProcess, 'spawn').mockImplementation((command, args, options) => {
      if (command !== 'sudo') return spawn(command, args, options);
      const program = args.indexOf('--') + 1;
      return spawn(args[program], args.slice(program + 1), options);
    });
    vi.spyOn(os, 'userInfo').mockReturnValue({
      username: 'operator',
      uid: process.getuid(),
      gid: process.getgid(),
      homedir: home,
      shell: '/bin/sh',
    });
  };

  it('merges the cluster context into an existing kubeconfig and keeps its contexts and its current context', async () => {
    actingAs();
    fs.outputFileSync(target(), kubeconfig('production', 'https://192.168.1.85:6443'), { mode: 0o644 });
    expect(await Underpost.cluster.chown('kind')).toEqual({ context: 'kind-kind', written: [target()] });
    expect(view('{.contexts[*].name}').split(' ').sort()).toEqual(['kind-kind', 'production']);
    expect(view('{.current-context}')).toBe('production');
    expect(fs.statSync(target()).mode & 0o777).toBe(0o600);

    // A rerun takes the new credentials of the cluster and adds no copy.
    fs.writeFileSync(process.env.KIND_KUBECONFIG, kubeconfig('kind-kind', 'https://127.0.0.1:40002'));
    await Underpost.cluster.chown('kind');
    expect(view('{.contexts[*].name}').split(' ').sort()).toEqual(['kind-kind', 'production']);
    expect(view('{.clusters[?(@.name=="kind-kind")].cluster.server}')).toBe('https://127.0.0.1:40002');
    expect(view('{.current-context}')).toBe('production');
  });

  it('writes a new kubeconfig with the cluster context as its current context', async () => {
    actingAs();
    await Underpost.cluster.chown('kind');
    expect(view('{.current-context}')).toBe('kind-kind');
    expect(fs.statSync(nodePath.dirname(target())).mode & 0o777).toBe(0o700);
  });
});
