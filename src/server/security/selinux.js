/**
 * SELinux policy, labeling, and enforcement command helpers. The commands run as root: this host runs them
 * through the privilege boundary of its executor, and a provisioned host runs them as its root user.
 *
 * @module src/server/security/selinux.js
 * @namespace SELinuxService
 */
'use strict';

/**
 * Main SELinux utility.
 * @class SELinuxService
 * @memberof SELinuxService
 */
class SELinuxService {
  /** Shared container label every unprivileged container domain can read and write. */
  static SHARED_CONTAINER_TYPE = 'container_file_t';

  /**
   * Quotes one shell argument used by generated SELinux commands.
   * @param {*} value - Value to quote.
   * @returns {string}
   */
  static shellArgumentFactory(value) {
    return `'${`${value ?? ''}`.replaceAll("'", `'"'"'`)}'`;
  }

  /**
   * Builds the Rocky/RHEL SELinux userspace installation command.
   * @returns {string}
   */
  static selinuxPackagesCommandFactory() {
    return 'dnf install -y policycoreutils policycoreutils-python-utils selinux-policy-targeted audit';
  }

  /**
   * Builds commands that make Enforcing mode persistent and active.
   * @param {{restorePaths?: string[]}} [options]
   * @returns {string[]}
   */
  static selinuxEnforcingCommandsFactory({ restorePaths = [] } = {}) {
    return [
      `if [ -f /etc/selinux/config ]; then sed -i -E 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config; fi`,
      // A host running with SELinux Disabled has an unlabeled filesystem, so the
      // config flip alone would boot it into Enforcing with nothing labeled.
      // `setenforce` cannot activate the mode from Disabled either: the switch
      // completes on the next boot, and only after this relabel pass.
      `if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Disabled" ]; then touch /.autorelabel; fi`,
      ...(restorePaths.length > 0 ? [SELinuxService.selinuxRestoreconCommandFactory(restorePaths)] : []),
      `if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then setenforce 1; fi`,
    ];
  }

  /**
   * Builds a command that restores policy-defined file contexts.
   * @param {string|string[]} paths - Files or directories to label.
   * @param {{recursive?: boolean}} [options]
   * @returns {string}
   */
  static selinuxRestoreconCommandFactory(paths, { recursive = true } = {}) {
    const values = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    if (values.length === 0) throw new TypeError('selinuxRestoreconCommandFactory requires at least one path');
    const operations = values
      .map(SELinuxService.shellArgumentFactory)
      .map((path) => `{ [ ! -e ${path} ] || restorecon ${recursive ? '-RF ' : ''}${path}; }`)
      .join(' && ');
    return `if command -v restorecon >/dev/null 2>&1; then ${operations}; fi`;
  }

  /**
   * Builds an idempotent persistent file context mapping.
   * @param {string} path - Directory or file prefix to map.
   * @param {{type: string}} options
   * @returns {string}
   */
  static selinuxFileContextCommandFactory(path, { type } = {}) {
    if (!path) throw new TypeError('selinuxFileContextCommandFactory requires a path');
    if (!type) throw new TypeError('selinuxFileContextCommandFactory requires a type');
    const expression = SELinuxService.shellArgumentFactory(`${path}(/.*)?`);
    return `if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then command -v semanage >/dev/null 2>&1 || { echo 'semanage is required for persistent file contexts' >&2; exit 1; }; semanage fcontext -a -t ${type} ${expression} 2>/dev/null || semanage fcontext -m -t ${type} ${expression}; fi`;
  }

  /**
   * Builds persistent labeling commands for host paths bind-mounted into
   * unprivileged containers. `container_t` cannot read the policy defaults of
   * those trees (`kubernetes_file_t`, `var_lib_t`), and the mapping is
   * registered before the files exist so entries created later inherit the
   * shared label instead of requiring another relabel pass.
   * @param {string|string[]} paths - Files or directories to share.
   * @returns {string[]}
   */
  static selinuxContainerSharedContextCommandsFactory(paths) {
    const values = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    if (values.length === 0)
      throw new TypeError('selinuxContainerSharedContextCommandsFactory requires at least one path');
    return [
      ...values.map((path) =>
        SELinuxService.selinuxFileContextCommandFactory(path, { type: SELinuxService.SHARED_CONTAINER_TYPE }),
      ),
      SELinuxService.selinuxRestoreconCommandFactory(values),
    ];
  }

  /**
   * Builds persistent labeling commands for an SSH directory.
   * Standard /root and /home locations already have policy mappings; custom
   * home locations receive an explicit ssh_home_t mapping.
   * @param {{sshDirectory: string}} options
   * @returns {string[]}
   */
  static selinuxSshContextCommandsFactory({ sshDirectory } = {}) {
    if (!sshDirectory) throw new TypeError('selinuxSshContextCommandsFactory requires sshDirectory');
    const standard = sshDirectory === '/root/.ssh' || /^\/home\/[^/]+\/\.ssh$/.test(sshDirectory);
    const commands = [];
    if (!standard) {
      const expression = SELinuxService.shellArgumentFactory(`${sshDirectory}(/.*)?`);
      commands.push(
        `if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then command -v semanage >/dev/null 2>&1 || { echo 'semanage is required for a custom SSH home' >&2; exit 1; }; semanage fcontext -a -t ssh_home_t ${expression} 2>/dev/null || semanage fcontext -m -t ssh_home_t ${expression}; fi`,
      );
    }
    commands.push(SELinuxService.selinuxRestoreconCommandFactory(sshDirectory));
    return commands;
  }

  /**
   * Builds an idempotent ssh_port_t assignment for a custom SSH port.
   * @param {{port?: number|string}} [options]
   * @returns {string[]}
   */
  static selinuxSshPortCommandsFactory({ port = 22 } = {}) {
    const value = Number(port);
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new RangeError('SSH port must be 1-65535');
    if (value === 22) return [];
    return [
      `if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then command -v semanage >/dev/null 2>&1 || { echo 'semanage is required for a custom SSH port' >&2; exit 1; }; semanage port -a -t ssh_port_t -p tcp ${value} 2>/dev/null || semanage port -m -t ssh_port_t -p tcp ${value}; fi`,
    ];
  }

  /**
   * Runs a generated command list on this host. Each command needs root, so the executor gets the
   * `privileged` option with its reason.
   * @param {string[]} [commands]
   * @param {{execute: Function, privileged?: string}} options - The executor, such as `shellExec`, and the reason.
   * @returns {*[]}
   */
  static runSELinuxCommands(commands = [], { execute, privileged = 'applies SELinux policy' } = {}) {
    if (typeof execute !== 'function') throw new TypeError('runSELinuxCommands requires an executor');
    return commands.map((command) => execute(command, { privileged }));
  }
}

const {
  runSELinuxCommands,
  selinuxContainerSharedContextCommandsFactory,
  selinuxEnforcingCommandsFactory,
  selinuxFileContextCommandFactory,
  selinuxPackagesCommandFactory,
  selinuxRestoreconCommandFactory,
  selinuxSshContextCommandsFactory,
  selinuxSshPortCommandsFactory,
  shellArgumentFactory,
} = SELinuxService;

export default SELinuxService;

export {
  runSELinuxCommands,
  selinuxContainerSharedContextCommandsFactory,
  selinuxEnforcingCommandsFactory,
  selinuxFileContextCommandFactory,
  selinuxPackagesCommandFactory,
  selinuxRestoreconCommandFactory,
  selinuxSshContextCommandsFactory,
  selinuxSshPortCommandsFactory,
  shellArgumentFactory,
};
