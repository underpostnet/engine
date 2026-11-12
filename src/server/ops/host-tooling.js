/**
 * The software of a Kubernetes host: package repositories, packages, services, configuration files and
 * pinned release binaries, with the cluster runtimes that use each tool. A change of the host runs as root
 * through the privilege boundary; a download, a checksum and a version check run as the invoking user.
 *
 * @module src/server/ops/host-tooling.js
 * @namespace HostTooling
 */

import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import nodePath from 'node:path';
import os from 'node:os';
import { loggerFactory } from './logger.js';
import {
  installHostFile,
  linkHostPath,
  removeHostPath,
  shellArgumentFactory,
  shellExec,
  writeHostFile,
} from '../runtime/process.js';

const logger = loggerFactory(import.meta);

/** The Kubernetes minor release of the Kubernetes and CRI-O package repositories. */
const KUBERNETES_MINOR = 'v1.33';

/**
 * @constant DOCKER_PRIVILEGE
 * @description The `privileged` reason of a command that reaches the Docker daemon, which runs as root. Membership
 * of the `docker` group grants the same access, so it is no alternative.
 * @memberof HostTooling
 */
const DOCKER_PRIVILEGE = 'reaches the rootful Docker daemon';

/** Where a release binary is installed. */
const BINARY_DIRECTORY = '/usr/local/bin';

/** Where a release binary is linked: the secure_path of `sudo` does not hold {@link BINARY_DIRECTORY}. */
const BINARY_LINK_DIRECTORY = '/bin';

/** A yum repository that pkgs.k8s.io and the CRI-O project serve: its file, its content and its excludes. */
const yumRepository = ({ id, name, baseurl, exclude = '' }) => ({
  path: `/etc/yum.repos.d/${id}.repo`,
  exclude,
  content: [
    `[${id}]`,
    `name=${name}`,
    `baseurl=${baseurl}`,
    'enabled=1',
    'gpgcheck=1',
    `gpgkey=${baseurl}repodata/repomd.xml.key`,
    ...(exclude ? [`exclude=${exclude}`] : []),
    '',
  ].join('\n'),
});

/**
 * @constant HOST_REPOSITORIES
 * @description Each package repository: its file, and its content or the URL that serves it. `exclude` names
 * the packages only an install that disables the excludes of the repository receives.
 * @memberof HostTooling
 */
const HOST_REPOSITORIES = Object.freeze({
  docker: { path: '/etc/yum.repos.d/docker-ce.repo', url: 'https://download.docker.com/linux/rhel/docker-ce.repo' },
  kubernetes: yumRepository({
    id: 'kubernetes',
    name: 'Kubernetes',
    baseurl: `https://pkgs.k8s.io/core:/stable:/${KUBERNETES_MINOR}/rpm/`,
    exclude: 'kubelet kubeadm kubectl cri-tools kubernetes-cni',
  }),
  'cri-o': yumRepository({
    id: 'cri-o',
    name: 'CRI-O',
    baseurl: `https://download.opensuse.org/repositories/isv:/cri-o:/stable:/${KUBERNETES_MINOR}/rpm/`,
  }),
  'nvidia-container-toolkit': {
    path: '/etc/yum.repos.d/nvidia-container-toolkit.repo',
    url: 'https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo',
  },
});

const NVIDIA_CONTAINER_TOOLKIT_VERSION = '1.17.8-1';

/** What the iPXE build compiles with, besides its compiler. */
const IPXE_BUILD_PACKAGES = ['git', 'make', 'binutils-devel', 'xz-devel', 'perl'];

/**
 * @constant HOST_TOOLS
 * @description Each tool of a host, in install order: the cluster runtimes that use it, its repositories,
 * packages, services and files, or its pinned release binary. A release is checked against its SHA-256
 * pin before it is installed, and `version` is what the installed binary reports.
 * @memberof HostTooling
 */
const HOST_TOOLS = Object.freeze({
  docker: {
    runtimes: ['kind', 'kubeadm'],
    repositories: ['docker'],
    packages: ['docker-ce', 'docker-ce-cli', 'containerd.io', 'docker-buildx-plugin', 'docker-compose-plugin'],
    services: ['docker', 'containerd'],
  },
  podman: { runtimes: ['kind', 'kubeadm', 'k3s'], packages: ['podman'] },
  crio: {
    runtimes: ['kubeadm'],
    repositories: ['cri-o', 'kubernetes'],
    packages: ['cri-o', 'cri-tools'],
    services: ['crio'],
    files: {
      '/etc/crio/crio.conf.d/20-underpost.conf': '[crio.runtime]\ncgroup_manager = "systemd"\n',
      '/etc/crictl.yaml': [
        'runtime-endpoint: unix:///var/run/crio/crio.sock',
        'image-endpoint: unix:///var/run/crio/crio.sock',
        'timeout: 10',
        'debug: false',
        '',
      ].join('\n'),
    },
  },
  kind: {
    runtimes: ['kind'],
    release: {
      version: 'v0.29.0',
      url: (arch) => `https://kind.sigs.k8s.io/dl/v0.29.0/kind-linux-${arch}`,
      sha256: {
        amd64: 'c72eda46430f065fb45c5f70e7c957cc9209402ef309294821978677c8fb3284',
        arm64: '03d45095dbd9cc1689f179a3e5e5da24b77c2d1b257d7645abf1b4174bebcf2a',
      },
      versionArgs: ['version'],
    },
  },
  kubernetes: {
    runtimes: ['kind', 'kubeadm'],
    repositories: ['kubernetes'],
    packages: ['kubelet', 'kubeadm', 'kubectl'],
    services: ['kubelet'],
  },
  helm: {
    runtimes: ['kind', 'kubeadm', 'k3s'],
    release: {
      version: 'v3.21.2',
      url: (arch) => `https://get.helm.sh/helm-v3.21.2-linux-${arch}.tar.gz`,
      sha256: {
        amd64: '0a745198de24545d0055cd8414bc8d2ba10363ef5f5d38369ea1b399671cc083',
        arm64: 'bbd559fc0547f1d96ccbc68fe4f1cb98f01808f36538139e669369066b781267',
      },
      member: (arch) => `linux-${arch}/helm`,
      versionArgs: ['version', '--short'],
    },
  },
  snapd: { runtimes: ['kind', 'kubeadm', 'k3s'], packages: ['snapd'], services: ['snapd.socket'] },
  'nvidia-container-toolkit': {
    runtimes: [],
    repositories: ['nvidia-container-toolkit'],
    packages: [
      'nvidia-container-toolkit',
      'nvidia-container-toolkit-base',
      'libnvidia-container-tools',
      'libnvidia-container1',
    ].map((name) => `${name}-${NVIDIA_CONTAINER_TOOLKIT_VERSION}`),
  },
  'nfs-root-build': {
    runtimes: [],
    packages: ['iptables-legacy', 'debootstrap', `kernel-modules-extra-${os.release()}`],
  },
  'grub-efi-modules': { runtimes: [], packages: ['grub2-efi-x64-modules', 'grub2-efi-aa64-modules'] },
  'ipxe-build': { runtimes: [], packages: [...IPXE_BUILD_PACKAGES, 'gcc'] },
  'ipxe-cross-build': { runtimes: [], packages: [...IPXE_BUILD_PACKAGES, 'gcc-aarch64-linux-gnu'] },
});

/**
 * The tools a host of a cluster runtime installs.
 * @param {string} [runtime] - 'kind', 'kubeadm' or 'k3s'; every runtime when empty.
 * @returns {string[]} Tool names, in install order.
 * @memberof HostTooling
 */
const hostToolsFor = (runtime = '') =>
  Object.keys(HOST_TOOLS).filter((name) =>
    runtime ? HOST_TOOLS[name].runtimes.includes(runtime) : HOST_TOOLS[name].runtimes.length > 0,
  );

const quoted = (values) => values.map(shellArgumentFactory).join(' ');

/**
 * Runs `systemctl` on this host, as root through the privilege boundary.
 * @param {string} action - The verb and its flags, such as `enable --now`.
 * @param {string} [unit] - The unit; none for `daemon-reload`.
 * @param {object} [options] - Other {@link shellExec} options.
 * @memberof HostTooling
 */
const controlHostService = (action, unit = '', options = {}) =>
  shellExec(`systemctl ${action}${unit ? ` ${shellArgumentFactory(unit)}` : ''}`, {
    ...options,
    privileged: unit ? `controls the ${unit} service of the host` : `runs systemctl ${action} on the host`,
  });

/**
 * Whether this host has a unit file for a unit. A name without a type is a service.
 * @param {string} unit
 * @returns {boolean}
 * @memberof HostTooling
 */
const hostServiceExists = (unit) =>
  shellExec(
    `systemctl list-unit-files --quiet ${shellArgumentFactory(/\.[a-z]+$/.test(unit) ? unit : `${unit}.service`)}`,
    {
      silent: true,
      silentOnError: true,
      disableLog: true,
    },
  ).code === 0;

/**
 * Inserts an iptables rule at the head of a chain, unless the chain holds it. A host without iptables keeps
 * going with a warning; a failed insertion fails.
 * @param {string} chain - Such as `INPUT` or `FORWARD`.
 * @param {string[]} rule - The rule specification, one argument per element.
 * @returns {boolean} True when the rule was inserted.
 * @memberof HostTooling
 */
const ensureIptablesRule = (chain, rule) => {
  if (shellExec('command -v iptables', { silent: true, silentOnError: true, disableLog: true }).code !== 0) {
    logger.warn(`iptables is not installed; the ${chain} rule is not set.`, { rule: rule.join(' ') });
    return false;
  }
  const privileged = `sets an iptables ${chain} rule of the host`;
  const present = shellExec(`iptables -C ${quoted([chain, ...rule])}`, {
    silent: true,
    silentOnError: true,
    privileged,
  });
  if (present.code === 0) return false;
  shellExec(`iptables -I ${quoted([chain, '1', ...rule])}`, { privileged });
  return true;
};

/**
 * Updates the base packages of a Rocky Linux host with `scripts/rocky-setup.sh`.
 * @param {{underpostRoot: string, dev?: boolean}} options - `dev` adds the Development Tools group.
 * @memberof HostTooling
 */
const updateHostPackages = ({ underpostRoot, dev = false }) =>
  shellExec(
    `bash ${shellArgumentFactory(nodePath.join(underpostRoot, 'scripts/rocky-setup.sh'))}${dev ? ' --install-dev' : ''}`,
    {
      privileged: 'updates the base packages of the host',
    },
  );

/**
 * Installs a binary for every user of the host, in {@link BINARY_DIRECTORY} and linked from
 * {@link BINARY_LINK_DIRECTORY}.
 * @param {string} source - The binary.
 * @param {string} name - Its command name.
 * @memberof HostTooling
 */
const installHostBinary = (source, name) => {
  const target = nodePath.join(BINARY_DIRECTORY, name);
  installHostFile({ source, target, mode: '0755' });
  linkHostPath(target, nodePath.join(BINARY_LINK_DIRECTORY, name), {
    reason: `links ${name} for every user of the host`,
  });
};

/** What the installed binary of a release reports, or '' when it is missing. */
const reportedVersion = (name, release) =>
  shellExec(quoted([nodePath.join(BINARY_DIRECTORY, name), ...release.versionArgs]), {
    stdout: true,
    silent: true,
    silentOnError: true,
    disableLog: true,
  }).trim();

/**
 * Installs the pinned release binary of a tool, unless the installed one already reports its version.
 * @throws {Error} When the download does not match its pin, or the installed binary does not report its version.
 */
const installRelease = (name, { release }, arch) => {
  if (reportedVersion(name, release).includes(release.version))
    return logger.info(`${name} ${release.version} is installed.`);
  if (!release.sha256[arch]) throw new Error(`${name} ${release.version} has no SHA-256 pin for ${arch}`);
  const scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), `underpost-${name}-`));
  try {
    const download = nodePath.join(scratch, 'download');
    shellExec(`curl -fsSL --retry 3 -o ${quoted([download, release.url(arch)])}`);
    // A dry run elides the download, and the install with it.
    if (!fs.existsSync(download)) return;
    const digest = createHash('sha256').update(fs.readFileSync(download)).digest('hex');
    if (digest !== release.sha256[arch])
      throw new Error(`${release.url(arch)} has SHA-256 ${digest}, and the pin is ${release.sha256[arch]}`);
    if (release.member) shellExec(`tar -xzf ${quoted([download, '-C', scratch])}`);
    installHostBinary(release.member ? nodePath.join(scratch, release.member(arch)) : download, name);
  } finally {
    fs.removeSync(scratch);
  }
  const reported = reportedVersion(name, release);
  if (!reported.includes(release.version))
    throw new Error(`${name} is installed, and it reports '${reported}' instead of ${release.version}`);
  logger.info(`${name} ${release.version} installed.`, { reported });
};

/**
 * Installs one tool of {@link HOST_TOOLS}. Each step is idempotent, and a failed step fails the install.
 * @param {string} name - Tool name.
 * @param {{arch: string}} options - The `amd64` or `arm64` alias of the host architecture.
 * @memberof HostTooling
 */
const installHostTool = (name, { arch }) => {
  const tool = HOST_TOOLS[name];
  if (!tool) throw new Error(`Unknown host tool: ${name}`);
  logger.info(`Installing ${name}...`);
  for (const id of tool.repositories ?? []) {
    const repository = HOST_REPOSITORIES[id];
    writeHostFile({
      target: repository.path,
      content:
        repository.content ??
        shellExec(`curl -fsSL ${shellArgumentFactory(repository.url)}`, { stdout: true, silent: true }),
    });
  }
  if (tool.packages) {
    const unexcluded = (tool.repositories ?? []).filter((id) => HOST_REPOSITORIES[id].exclude);
    shellExec(`dnf -y install ${quoted([...unexcluded.map((id) => `--disableexcludes=${id}`), ...tool.packages])}`, {
      privileged: `installs the ${name} packages`,
    });
  }
  for (const [target, content] of Object.entries(tool.files ?? {})) writeHostFile({ target, content });
  if (tool.release) installRelease(name, tool, arch);
  for (const unit of tool.services ?? []) controlHostService('enable --now', unit);
};

/**
 * Removes one tool of {@link HOST_TOOLS}: its services, packages, files, repositories and release binary.
 * An absent part is skipped, so a removal reruns safely.
 * @param {string} name - Tool name.
 * @memberof HostTooling
 */
const uninstallHostTool = (name) => {
  const tool = HOST_TOOLS[name];
  if (!tool) throw new Error(`Unknown host tool: ${name}`);
  logger.info(`Removing ${name}...`);
  for (const unit of tool.services ?? []) if (hostServiceExists(unit)) controlHostService('disable --now', unit);
  if (tool.packages)
    shellExec(`dnf -y remove ${quoted(tool.packages)}`, { privileged: `removes the ${name} packages` });
  const reason = `removes the ${name} configuration of the host`;
  for (const target of Object.keys(tool.files ?? {})) removeHostPath(target, { reason });
  for (const id of tool.repositories ?? []) removeHostPath(HOST_REPOSITORIES[id].path, { reason });
  if (tool.release)
    for (const directory of [BINARY_LINK_DIRECTORY, BINARY_DIRECTORY])
      removeHostPath(nodePath.join(directory, name), { reason: `removes the ${name} binary` });
};

export {
  controlHostService,
  DOCKER_PRIVILEGE,
  ensureIptablesRule,
  HOST_REPOSITORIES,
  HOST_TOOLS,
  hostServiceExists,
  hostToolsFor,
  installHostBinary,
  installHostTool,
  uninstallHostTool,
  updateHostPackages,
};
