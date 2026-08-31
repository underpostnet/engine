/**
 * Host filesystem preparation for Kubernetes storage that unprivileged containers mount.
 *
 * Every node-local path a pod reaches through a `hostPath` PersistentVolume — or through a
 * dynamic provisioner that is itself backed by a node directory — must carry a type the
 * `container_t` domain can use. The base RHEL/Rocky policy has no mapping for the trees this
 * platform writes into, so a directory created there falls back to the policy default
 * (`default_t` under `/data`, `usr_t` under `/opt`, `user_home_t` under the operator's home) and
 * every read and write from a pod becomes an AVC denial.
 *
 * The mapping is registered with `semanage fcontext` rather than applied with `chcon` so it
 * survives a relabel, a policy update and `/.autorelabel`; the paths are then restored. Both
 * operations are idempotent, which is what lets deploy, redeploy and recovery flows all call
 * this without special-casing.
 *
 * @module src/server/security/container-storage.js
 * @namespace ContainerStorageService
 */
'use strict';

import SELinuxService, { runSELinuxCommands, shellArgumentFactory } from './selinux.js';
import { HOST_VOLUME_ROOT } from '../runtime/environment.js';

/**
 * Host storage preparation and SELinux labeling for container-mounted paths.
 * @class ContainerStorageService
 * @memberof ContainerStorageService
 */
class ContainerStorageService {
  /** Label every unprivileged container domain can read and write, at the empty category set. */
  static SHARED_CONTAINER_TYPE = SELinuxService.SHARED_CONTAINER_TYPE;

  /**
   * Mode used when this module is the one creating the directory. Existing directories keep the
   * mode, ownership and ACLs they already have — the workload's own init container owns that,
   * and resetting it would rewrite live data trees.
   */
  static DEFAULT_MODE = '0755';

  /** Upstream rancher local-path-provisioner defaults, used only when discovery finds nothing. */
  static LOCAL_PATH_DEFAULT_ROOT = '/opt/local-path-provisioner';
  static LOCAL_PATH_CONFIG_MAP = 'local-path-config';
  static LOCAL_PATH_NAMESPACES = ['local-path-storage', 'kube-system'];

  /**
   * Node directories this platform owns and hands to containers. `/data` covers the MongoDB
   * replica volumes, MariaDB, MySQL and PostgreSQL trees; `HOST_VOLUME_ROOT` covers every
   * `hostPath` PersistentVolume the deploy flow materializes, including the gateway's static tree.
   */
  static PLATFORM_STORAGE_ROOTS = ['/data', HOST_VOLUME_ROOT];

  /**
   * Kubernetes control-plane state bind-mounted into containers by kubeadm.
   */
  static CONTROL_PLANE_MOUNT_PATHS = ['/etc/kubernetes', '/var/lib/etcd', '/var/lib/calico'];

  /**
   * Directories that are a system location in their own right. A storage tree may live *under*
   * one of these (`/opt/local-path-provisioner`, `/var/lib/etcd`), but the directory itself never
   * becomes container storage.
   */
  static PROTECTED_EXACT_PATHS = [
    '/',
    '/boot',
    '/dev',
    '/etc',
    '/home',
    '/mnt',
    '/opt',
    '/proc',
    '/root',
    '/run',
    '/srv',
    '/sys',
    '/tmp',
    '/usr',
    '/var',
    '/var/lib',
    '/var/log',
    '/var/run',
  ];

  /**
   * Trees no container storage may live in at all.
   *
   * A host directory being mounted into a pod is not evidence that it holds workload data: the
   * CNI plugin directory, the runtime socket and `/proc` are all mounted into pods, and each has
   * a policy type that exists for a reason. Relabeling `/opt/cni/bin` would strip `bin_t` from
   * the calico executables the kubelet runs, which is a worse outcome than the denial it set out
   * to fix.
   */
  static PROTECTED_PATH_PREFIXES = [
    '/bin',
    '/boot',
    '/dev',
    '/etc',
    '/lib',
    '/lib64',
    '/opt/cni',
    '/proc',
    '/run',
    '/sbin',
    '/sys',
    '/usr',
  ];

  /**
   * The one set of paths allowed to break {@link PROTECTED_PATH_PREFIXES}: kubeadm bind-mounts
   * these into its control-plane containers, so they genuinely are container-visible state. They
   * are a hardcoded constant, never something discovery or an operator flag can widen.
   */
  static PROTECTED_PATH_EXCEPTIONS = ContainerStorageService.CONTROL_PLANE_MOUNT_PATHS;

  /**
   * Reports whether a path may be given the shared container label.
   * @param {string} path - Absolute path.
   * @returns {boolean}
   */
  static isSafeStoragePath(path) {
    if (typeof path !== 'string' || !path.startsWith('/')) return false;
    const normalized = path.replace(/\/+$/, '') || '/';
    if (ContainerStorageService.PROTECTED_PATH_EXCEPTIONS.includes(normalized)) return true;
    if (ContainerStorageService.PROTECTED_EXACT_PATHS.includes(normalized)) return false;
    return !ContainerStorageService.PROTECTED_PATH_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    );
  }

  /**
   * Throws unless every path may be labeled. Applied at the command-building boundary so no
   * caller — a discovery result, a CLI `extraPaths`, a future one — can route around it.
   * @param {string[]} paths - Absolute paths.
   * @returns {string[]} The same paths.
   */
  static assertSafeStoragePaths(paths = []) {
    const refused = paths.filter((path) => !ContainerStorageService.isSafeStoragePath(path));
    if (refused.length > 0)
      throw new RangeError(
        `refusing to apply the container storage label to a system path: ${refused.join(', ')}. ` +
          `A host directory mounted into a pod is not necessarily workload data; give the volume ` +
          `its own directory under a declared storage root instead.`,
      );
    return paths;
  }

  /**
   * Deduplicates and sorts a path list, keeping only absolute entries.
   * @param {string[]} [paths] - Candidate paths.
   * @returns {string[]} Absolute paths, parents before their descendants.
   */
  static absoluteStoragePaths(paths = []) {
    return [
      ...new Set(
        paths
          .filter((path) => typeof path === 'string')
          .map((path) => path.trim().replace(/\/+$/, ''))
          .filter((path) => path.startsWith('/') && path !== '/'),
      ),
    ].sort();
  }

  /**
   * Reduces a path list to the smallest set of roots that still covers every entry.
   *
   * A `semanage fcontext` mapping is the regular expression `<root>(/.*)?`, so a root already
   * covers all of its descendants; keeping both `/data` and `/data/mongodb` would add a redundant
   * rule and a second full `restorecon` pass over the same tree on every deploy.
   * @param {string[]} [paths] - Candidate absolute paths.
   * @returns {string[]} Non-overlapping, sorted roots.
   */
  static normalizeStorageRoots(paths = []) {
    const absolute = ContainerStorageService.absoluteStoragePaths(paths);
    return absolute.filter(
      (path) => !absolute.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`)),
    );
  }

  /**
   * Extracts the node directories a local-path provisioner writes into, from its `config.json`.
   *
   * Read rather than assumed: the provisioner's root is operator-configurable, and every
   * dynamically provisioned claim in this platform (Grafana, Prometheus, Alertmanager, IPFS,
   * MariaDB) becomes a subdirectory of it. Labeling the wrong root leaves those claims with the
   * `/opt` policy default (`usr_t`), which is exactly the shape of the Grafana denials.
   * @param {string} [configJson] - Contents of the provisioner ConfigMap's `config.json` key.
   * @returns {string[]} Configured node paths; empty when the config is absent or unparsable.
   */
  static localPathRootsFactory(configJson = '') {
    if (!configJson || !`${configJson}`.trim()) return [];
    let config;
    try {
      config = JSON.parse(configJson);
    } catch {
      return [];
    }
    const paths = [];
    if (Array.isArray(config?.nodePathMap))
      for (const entry of config.nodePathMap) if (Array.isArray(entry?.paths)) paths.push(...entry.paths);
    if (typeof config?.sharedFileSystemPath === 'string') paths.push(config.sharedFileSystemPath);
    return ContainerStorageService.normalizeStorageRoots(paths);
  }

  /**
   * Builds the command that creates a storage directory only when it is missing.
   *
   * Guarded rather than unconditional: `install -d -m` on an existing tree would rewrite the
   * mode a workload's init container set (MongoDB's `chown 999:999`, MariaDB's data dir), and
   * this runs on every redeploy.
   * @param {string} path - Absolute directory path.
   * @param {{mode?: string, owner?: string, sudo?: boolean}} [options]
   * @returns {string} Shell command.
   */
  static storageDirectoryCommandFactory(
    path,
    { mode = ContainerStorageService.DEFAULT_MODE, owner = '', sudo = true } = {},
  ) {
    if (!path) throw new TypeError('storageDirectoryCommandFactory requires a path');
    const prefix = sudo ? 'sudo ' : '';
    const quoted = shellArgumentFactory(path);
    const ownerFlag = owner
      ? ` -o ${shellArgumentFactory(`${owner}`.split(':')[0])}${
          `${owner}`.includes(':') ? ` -g ${shellArgumentFactory(`${owner}`.split(':')[1])}` : ''
        }`
      : '';
    return `[ -d ${quoted} ] || ${prefix}install -d -m ${mode}${ownerFlag} ${quoted}`;
  }

  /**
   * Builds the full idempotent preparation for one or more container-mounted storage roots:
   * create when missing, register the persistent `container_file_t` mapping, restore the tree.
   * @param {string|string[]} paths - Absolute directories.
   * @param {{mode?: string, owner?: string, sudo?: boolean}} [options]
   * @returns {string[]} Commands, in execution order.
   */
  static containerStorageCommandsFactory(paths, options = {}) {
    const requested = ContainerStorageService.absoluteStoragePaths(Array.isArray(paths) ? paths : [paths]);
    if (requested.length === 0)
      throw new TypeError('containerStorageCommandsFactory requires at least one absolute path');
    ContainerStorageService.assertSafeStoragePaths(requested);
    // Every requested path is created — a nested one (`/data/mysql`) is a real directory a PV
    // mounts. Mapping and restoring collapse to the covering roots: an fcontext expression is
    // `<root>(/.*)?`, so a nested entry would add a redundant rule to the local policy store and
    // a second full relabel pass over the same tree on every deploy.
    return [
      ...requested.map((path) => ContainerStorageService.storageDirectoryCommandFactory(path, options)),
      ...ContainerStorageService.containerStorageSubtreeCommandsFactory(requested, {
        sudo: options.sudo !== false,
      }),
    ];
  }

  /**
   * Resolves which declared storage root covers a path.
   * @param {string} path - Absolute path.
   * @param {string[]} [roots] - Candidate roots.
   * @returns {string} The covering root, or the path itself when none covers it.
   */
  static coveringRootFactory(path, roots = ContainerStorageService.PLATFORM_STORAGE_ROOTS) {
    const covering = ContainerStorageService.absoluteStoragePaths(roots)
      .filter((root) => path === root || path.startsWith(`${root}/`))
      .sort((a, b) => b.length - a.length)[0];
    return covering || path;
  }

  /**
   * Builds the preparation for one subtree of an already-declared storage root: the persistent
   * mapping is registered on the covering root, and only the subtree is restored.
   *
   * A per-volume mapping would grow the local policy store by one `semanage fcontext` rule for
   * every PersistentVolume the deploy flow has ever materialized, and every one of those rules is
   * then evaluated on each relabel. One rule on the root already covers all of them, and it is
   * what makes a volume created later — by kubelet's `DirectoryOrCreate`, or by the local-path
   * helper pod — inherit the right label without another pass.
   * @param {string|string[]} paths - Absolute subtrees to restore.
   * @param {{roots?: string[], mode?: string, owner?: string, sudo?: boolean}} [options]
   * @returns {string[]} Commands, in execution order.
   */
  static containerStorageSubtreeCommandsFactory(paths, { roots, ...options } = {}) {
    const subtrees = ContainerStorageService.absoluteStoragePaths(Array.isArray(paths) ? paths : [paths]);
    if (subtrees.length === 0)
      throw new TypeError('containerStorageSubtreeCommandsFactory requires at least one absolute path');
    const sudo = options.sudo !== false;
    ContainerStorageService.assertSafeStoragePaths(subtrees);
    const mapped = ContainerStorageService.normalizeStorageRoots(
      subtrees.map((path) => ContainerStorageService.coveringRootFactory(path, roots)),
    );
    // The mapped root is what the fcontext rule covers, so it is checked too: a subtree that is
    // itself safe must never resolve up into a root that is not.
    ContainerStorageService.assertSafeStoragePaths(mapped);
    return [
      ...mapped.map((root) =>
        SELinuxService.selinuxFileContextCommandFactory(root, {
          type: ContainerStorageService.SHARED_CONTAINER_TYPE,
          sudo,
        }),
      ),
      SELinuxService.selinuxRestoreconCommandFactory(ContainerStorageService.normalizeStorageRoots(subtrees), {
        sudo,
      }),
    ];
  }

  /**
   * Executes {@link containerStorageSubtreeCommandsFactory}.
   * @param {string|string[]} paths - Absolute subtrees.
   * @param {{execute: Function, roots?: string[], sudo?: boolean}} options
   * @returns {*[]} Executor results.
   */
  static ensureContainerStorageSubtree(paths, { execute, ...options } = {}) {
    return runSELinuxCommands(ContainerStorageService.containerStorageSubtreeCommandsFactory(paths, options), {
      execute,
    });
  }

  /**
   * Executes {@link containerStorageCommandsFactory}.
   * @param {string|string[]} paths - Absolute directories.
   * @param {{execute: Function, mode?: string, owner?: string, sudo?: boolean}} options
   * @returns {*[]} Executor results.
   */
  static ensureContainerStorage(paths, { execute, ...options } = {}) {
    return runSELinuxCommands(ContainerStorageService.containerStorageCommandsFactory(paths, options), { execute });
  }

  /**
   * Command that prints the local-path provisioner `config.json`, or nothing when absent.
   * @param {{namespace: string, configMap?: string}} options
   * @returns {string} Shell command.
   */
  static localPathConfigCommandFactory({ namespace, configMap = ContainerStorageService.LOCAL_PATH_CONFIG_MAP } = {}) {
    if (!namespace) throw new TypeError('localPathConfigCommandFactory requires a namespace');
    return `kubectl get configmap ${configMap} -n ${namespace} -o jsonpath='{.data.config\\.json}' 2>/dev/null || true`;
  }

  /**
   * Resolves every node directory that must carry the shared container label on this host.
   * @param {{localPathRoots?: string[], extraPaths?: string[], controlPlane?: boolean}} [options]
   * @returns {string[]} Non-overlapping roots.
   */
  static containerStorageRootsFactory({ localPathRoots = [], extraPaths = [], controlPlane = false } = {}) {
    return ContainerStorageService.normalizeStorageRoots([
      ...ContainerStorageService.PLATFORM_STORAGE_ROOTS,
      ...(controlPlane ? ContainerStorageService.CONTROL_PLANE_MOUNT_PATHS : []),
      ...(localPathRoots.length > 0 ? localPathRoots : [ContainerStorageService.LOCAL_PATH_DEFAULT_ROOT]),
      ...extraPaths,
    ]);
  }
}

const {
  absoluteStoragePaths,
  isSafeStoragePath,
  assertSafeStoragePaths,
  containerStorageCommandsFactory,
  containerStorageRootsFactory,
  containerStorageSubtreeCommandsFactory,
  coveringRootFactory,
  ensureContainerStorage,
  ensureContainerStorageSubtree,
  localPathConfigCommandFactory,
  localPathRootsFactory,
  normalizeStorageRoots,
  storageDirectoryCommandFactory,
} = ContainerStorageService;

export default ContainerStorageService;

export {
  absoluteStoragePaths,
  isSafeStoragePath,
  assertSafeStoragePaths,
  containerStorageCommandsFactory,
  containerStorageRootsFactory,
  containerStorageSubtreeCommandsFactory,
  coveringRootFactory,
  ensureContainerStorage,
  ensureContainerStorageSubtree,
  localPathConfigCommandFactory,
  localPathRootsFactory,
  normalizeStorageRoots,
  storageDirectoryCommandFactory,
};
