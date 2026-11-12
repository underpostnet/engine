// The host tools of a cluster runtime, installed and removed through the privilege boundary, and the
// initHost orchestration over them. The shell harness answers every command, and each host file reads as
// missing, so nothing depends on the host that runs the test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import Underpost from '../../../src/index.js';
import {
  HOST_REPOSITORIES,
  hostToolsFor,
  installHostTool,
  uninstallHostTool,
} from '../../../src/server/ops/host-tooling.js';
import { privilegedCommand, shellHarness } from '../../support/shell-harness.js';

const elevated = (call) => /^'?sudo'? /.test(call);
const hostPath = (path) => /^\/(etc|usr\/local\/bin|bin)\//.test(`${path}`);

let harness;
const readFileSync = fs.readFileSync;
beforeEach(() => {
  vi.stubEnv('CI', 'true');
  vi.spyOn(fs, 'readFileSync').mockImplementation((path, ...rest) => {
    if (hostPath(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    return readFileSync(path, ...rest);
  });
});
afterEach(() => {
  harness?.restore();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** A curl route that writes `content` where the download goes. */
const download = (content) => ({
  match: (command) => {
    const target = /^curl .* -o '([^']+)'/.exec(command)?.[1];
    if (target) fs.writeFileSync(target, content);
    return false;
  },
});

describe('the host tools of a cluster runtime', () => {
  it('selects the tools each runtime uses, and those of every runtime by default', () => {
    expect(hostToolsFor('k3s')).toEqual(['podman', 'helm', 'snapd']);
    expect(hostToolsFor('kind')).toEqual(['docker', 'podman', 'kind', 'kubernetes', 'helm', 'snapd']);
    expect(hostToolsFor('kubeadm')).toEqual(['docker', 'podman', 'crio', 'kubernetes', 'helm', 'snapd']);
    expect(hostToolsFor()).toEqual(['docker', 'podman', 'crio', 'kind', 'kubernetes', 'helm', 'snapd']);
  });

  it('pins one Kubernetes minor release for the Kubernetes and CRI-O repositories', () => {
    expect(HOST_REPOSITORIES.kubernetes.content).toContain('baseurl=https://pkgs.k8s.io/core:/stable:/v1.33/rpm/');
    expect(HOST_REPOSITORIES.kubernetes.content).toContain('exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni');
    expect(HOST_REPOSITORIES['cri-o'].content).toContain('isv:/cri-o:/stable:/v1.33/rpm/');
  });

  it('installs repositories, packages, files and services as root, in that order', () => {
    harness = shellHarness();
    installHostTool('crio', { arch: 'amd64' });
    expect(harness.calls.every(elevated)).toBe(true);
    expect(harness.calls.map(privilegedCommand)).toEqual([
      expect.stringMatching(/^install -D -m 0644 -o root -g root '.*' '\/etc\/yum\.repos\.d\/cri-o\.repo'$/),
      expect.stringMatching(/^install -D -m 0644 -o root -g root '.*' '\/etc\/yum\.repos\.d\/kubernetes\.repo'$/),
      "dnf -y install '--disableexcludes=kubernetes' 'cri-o' 'cri-tools'",
      expect.stringMatching(/'\/etc\/crio\/crio\.conf\.d\/20-underpost\.conf'$/),
      expect.stringMatching(/'\/etc\/crictl\.yaml'$/),
      "systemctl enable --now 'crio'",
    ]);
  });

  it('fetches a served repository as the invoking user', () => {
    harness = shellHarness([{ match: /^curl/, stdout: '[docker-ce-stable]\n' }]);
    installHostTool('docker', { arch: 'amd64' });
    const fetch = harness.calls.find((call) => call.startsWith('curl'));
    expect(fetch).toBe("curl -fsSL 'https://download.docker.com/linux/rhel/docker-ce.repo'");
    expect(harness.calls.filter((call) => !elevated(call))).toEqual([fetch]);
  });

  it('downloads a release as the invoking user, and installs nothing that does not match its pin', () => {
    harness = shellHarness([download('not kind')]);
    expect(() => installHostTool('kind', { arch: 'amd64' })).toThrow(
      /kind-linux-amd64 has SHA-256 [0-9a-f]{64}, and the pin is c72eda46/,
    );
    expect(harness.calls.find((call) => call.startsWith('curl'))).toBeDefined();
    expect(harness.calls.some(elevated)).toBe(false);
  });

  it('keeps a release whose installed binary reports the pinned version', () => {
    harness = shellHarness([{ match: "'/usr/local/bin/helm' 'version' '--short'", stdout: 'v3.21.2+g1259634\n' }]);
    installHostTool('helm', { arch: 'arm64' });
    expect(harness.ran('curl')).toBe(false);
  });

  it('refuses a release without a pin for the architecture of the host', () => {
    harness = shellHarness();
    expect(() => installHostTool('kind', { arch: 'riscv64' })).toThrow('kind v0.29.0 has no SHA-256 pin for riscv64');
  });

  it('removes a tool as root, and skips a service the host does not have', () => {
    harness = shellHarness([{ match: 'list-unit-files', code: 1 }]);
    uninstallHostTool('crio');
    expect(harness.ran('disable --now')).toBe(false);
    expect(harness.calls.filter(elevated).map(privilegedCommand)).toEqual([
      "dnf -y remove 'cri-o' 'cri-tools'",
      "rm -rf -- '/etc/crio/crio.conf.d/20-underpost.conf'",
      "rm -rf -- '/etc/crictl.yaml'",
      "rm -rf -- '/etc/yum.repos.d/cri-o.repo'",
      "rm -rf -- '/etc/yum.repos.d/kubernetes.repo'",
    ]);
  });
});

describe('initHost', () => {
  const routes = () => [
    { match: 'command -v', stdout: 'exists\n' },
    { match: "'/usr/local/bin/helm' 'version' '--short'", stdout: 'v3.21.2+g1259634\n' },
  ];

  it('orchestrates the tools of the runtime, each host change through the privilege boundary', () => {
    harness = shellHarness(routes());
    Underpost.cluster.initHost({ underpostRoot: '/opt/underpost', runtime: 'k3s' });
    expect(harness.calls.filter(elevated).map(privilegedCommand)).toEqual([
      "bash '/opt/underpost/scripts/rocky-setup.sh'",
      "dnf -y install 'podman'",
      "dnf -y install 'snapd'",
      "systemctl enable --now 'snapd.socket'",
    ]);
    expect(harness.calls.filter((call) => !elevated(call)).every((call) => /version|command -v/.test(call))).toBe(true);
  });

  it('runs the same commands as they are in a root process', () => {
    harness = shellHarness(routes(), { uid: 0 });
    Underpost.cluster.initHost({ underpostRoot: '/opt/underpost', runtime: 'k3s' });
    expect(harness.calls.some((call) => call.includes('sudo'))).toBe(false);
    expect(harness.calls).toContain("dnf -y install 'podman'");
  });

  it('fails when a package install fails, and installs nothing after it', () => {
    harness = shellHarness([...routes(), { match: "install 'podman'", code: 1, stderr: 'No match for argument' }]);
    expect(() => Underpost.cluster.initHost({ underpostRoot: '/opt/underpost', runtime: 'k3s' })).toThrow(
      /shellExec failed/,
    );
    expect(harness.ran("install 'snapd'")).toBe(false);
  });
});
