// The cluster target at the subprocess boundary: a refused target refuses each cluster command that names
// no context of its own, the first change verifies and prints the cluster it reaches once per process tree,
// a cluster other than the declared one refuses the change, and `sudo` carries the target. The shell
// harness answers every command; nothing runs on the host.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setExecutionTarget } from '../../../src/server/build/execution.js';
import { runCommand, shellExec, shellSpawn } from '../../../src/server/runtime/process.js';
import { shellHarness } from '../../support/shell-harness.js';

const REFUSED = { environment: 'production', context: '', source: '', override: false, refusal: 'name a context' };
const PINNED = {
  environment: 'production',
  context: 'admin@prod',
  source: 'environments.production.context',
  override: false,
  blockers: [],
  refusal: '',
};
const UID = '0f3c2a1b-1111-4222-8333-444455556666';
const DECLARED = { ...PINNED, cluster: { fingerprint: UID, servers: ['https://10.0.0.1:6443'] } };
const LIVE = [
  { match: 'config view', stdout: 'https://10.0.0.1:6443' },
  { match: 'get namespace kube-system', stdout: UID },
];

let harness;
let written;
beforeEach(() => {
  written = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((text) => written.push(`${text}`));
  vi.stubEnv('UNDERPOST_CLUSTER_VERIFIED', '');
});
afterEach(() => {
  harness?.restore();
  setExecutionTarget(null);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('a refused cluster target', () => {
  it('refuses each executor before any command runs, unless the command names its context', async () => {
    harness = shellHarness();
    setExecutionTarget(REFUSED);
    expect(() => shellExec('kubectl get pods', { silentOnError: true })).toThrow('name a context');
    await expect(runCommand('kubectl', ['apply', '-f', '-'])).rejects.toMatchObject({ expected: true });
    expect(() => shellSpawn('kubectl exec -i mongodb-0 -- mongorestore')).toThrow('name a context');
    expect(harness.calls).toEqual([]);
    shellExec('kubectl --context admin@prod get pods');
    await runCommand('kubectl', ['config', 'current-context']);
    expect(harness.calls).toEqual(['kubectl --context admin@prod get pods', 'kubectl config current-context']);
  });
});

describe('a resolved cluster target', () => {
  it('verifies and prints the environment, context, cluster and profile once, at the first change', () => {
    harness = shellHarness(LIVE);
    setExecutionTarget(DECLARED);
    shellExec('kubectl get pods');
    expect(written).toEqual([]);
    shellExec('kubectl apply -f x.yaml');
    shellExec('kubectl apply -f y.yaml');
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('Environment  production');
    expect(written[0]).toContain('Context      admin@prod (environments.production.context)');
    expect(written[0]).toContain(`Cluster      https://10.0.0.1:6443 (kube-system ${UID}), verified`);
    expect(written[0]).toContain('Profile      LIVE_CLUSTER');
    expect(harness.calls.filter((call) => call.includes("--context 'admin@prod'"))).toHaveLength(2);
    expect(JSON.parse(process.env.UNDERPOST_CLUSTER_VERIFIED)).toEqual({
      context: 'admin@prod',
      server: 'https://10.0.0.1:6443',
      fingerprint: UID,
    });
  });

  it('refuses the change before it runs when the context reaches another cluster', async () => {
    harness = shellHarness([
      { match: 'config view', stdout: 'https://10.0.0.1:6443' },
      { match: 'get namespace kube-system', stdout: 'aaaaaaaa-0000-4000-8000-000000000000' },
    ]);
    setExecutionTarget(DECLARED);
    expect(() => shellExec('kubectl apply -f x.yaml')).toThrow(
      `admin@prod reaches the cluster aaaaaaaa-0000-4000-8000-000000000000, and environments.production.cluster declares ${UID}`,
    );
    await expect(runCommand('helm', ['upgrade', '--install', 'x', 'y'])).rejects.toMatchObject({ expected: true });
    expect(harness.calls.some((call) => call.startsWith('kubectl apply') || call.startsWith('helm'))).toBe(false);
    expect(process.env.UNDERPOST_CLUSTER_VERIFIED).toBe('');
  });

  it('verifies a context once per process tree, and again for another context', () => {
    vi.stubEnv('UNDERPOST_CLUSTER_VERIFIED', JSON.stringify({ context: 'admin@prod', fingerprint: UID }));
    harness = shellHarness(LIVE);
    setExecutionTarget(DECLARED);
    shellExec('kubectl apply -f x.yaml');
    expect(harness.calls).toEqual(['kubectl apply -f x.yaml']);
    setExecutionTarget({ ...DECLARED, context: 'admin@other' });
    shellExec('kubectl apply -f x.yaml');
    expect(
      harness.calls.filter((call) => call.includes("--context 'admin@other' get namespace kube-system")),
    ).toHaveLength(1);
  });

  it('refuses a change through a target with blockers, and lets a read through', () => {
    harness = shellHarness();
    setExecutionTarget({ ...PINNED, blockers: ['environments.production.routing names no provider'] });
    expect(() => shellExec('kubectl apply -f x.yaml')).toThrow(
      'The production target refuses a change: environments.production.routing names no provider',
    );
    shellExec('kubectl get pods');
    expect(harness.calls).toEqual(['kubectl get pods']);
  });

  it('passes the target and its verification through sudo with the context pin', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(1000);
    vi.stubEnv('KUBECONFIG', '/tmp/pin.json');
    vi.stubEnv('UNDERPOST_CLUSTER_VERIFIED', JSON.stringify({ context: 'admin@prod' }));
    harness = shellHarness();
    setExecutionTarget(PINNED);
    await runCommand('cat', ['/etc/kubernetes/admin.conf'], { privileged: 'reads the kubeconfig of kubeadm' });
    expect(harness.calls[0]).toBe(
      `sudo -n -- env KUBECONFIG=/tmp/pin.json UNDERPOST_CLUSTER_TARGET=${JSON.stringify(PINNED)} ` +
        `UNDERPOST_CLUSTER_VERIFIED={"context":"admin@prod"} cat /etc/kubernetes/admin.conf`,
    );
  });
});
