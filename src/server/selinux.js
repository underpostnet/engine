/**
 * SELinux policy, labeling, and enforcement command helpers.
 *
 * @module src/server/selinux.js
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
   * @param {{sudo?: boolean}} [options]
   * @returns {string}
   */
  static selinuxPackagesCommandFactory({ sudo = true } = {}) {
    return `${sudo ? 'sudo ' : ''}dnf install -y policycoreutils policycoreutils-python-utils selinux-policy-targeted audit`;
  }

  /**
   * Builds commands that make Enforcing mode persistent and active.
   * @param {{sudo?: boolean, restorePaths?: string[]}} [options]
   * @returns {string[]}
   */
  static selinuxEnforcingCommandsFactory({ sudo = true, restorePaths = [] } = {}) {
    const prefix = sudo ? 'sudo ' : '';
    return [
      `if [ -f /etc/selinux/config ]; then ${prefix}sed -i -E 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config; fi`,
      // A host running with SELinux Disabled has an unlabeled filesystem, so the
      // config flip alone would boot it into Enforcing with nothing labeled.
      // `setenforce` cannot activate the mode from Disabled either: the switch
      // completes on the next boot, and only after this relabel pass.
      `if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Disabled" ]; then ${prefix}touch /.autorelabel; fi`,
      ...(restorePaths.length > 0
        ? [SELinuxService.selinuxRestoreconCommandFactory(restorePaths, { sudo })]
        : []),
      `if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then ${prefix}setenforce 1; fi`,
    ];
  }

  /**
   * Builds a command that restores policy-defined file contexts.
   * @param {string|string[]} paths - Files or directories to label.
   * @param {{recursive?: boolean, sudo?: boolean}} [options]
   * @returns {string}
   */
  static selinuxRestoreconCommandFactory(paths, { recursive = true, sudo = true } = {}) {
    const values = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    if (values.length === 0) throw new TypeError('selinuxRestoreconCommandFactory requires at least one path');
    const operations = values
      .map(SELinuxService.shellArgumentFactory)
      .map(
        (path) =>
          `{ [ ! -e ${path} ] || ${sudo ? 'sudo ' : ''}restorecon ${recursive ? '-RF ' : ''}${path}; }`,
      )
      .join(' && ');
    return `if command -v restorecon >/dev/null 2>&1; then ${operations}; fi`;
  }

  /**
   * Builds an idempotent persistent file context mapping.
   * @param {string} path - Directory or file prefix to map.
   * @param {{type: string, sudo?: boolean}} options
   * @returns {string}
   */
  static selinuxFileContextCommandFactory(path, { type, sudo = true } = {}) {
    if (!path) throw new TypeError('selinuxFileContextCommandFactory requires a path');
    if (!type) throw new TypeError('selinuxFileContextCommandFactory requires a type');
    const prefix = sudo ? 'sudo ' : '';
    const expression = SELinuxService.shellArgumentFactory(`${path}(/.*)?`);
    return `if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then command -v semanage >/dev/null 2>&1 || { echo 'semanage is required for persistent file contexts' >&2; exit 1; }; ${prefix}semanage fcontext -a -t ${type} ${expression} 2>/dev/null || ${prefix}semanage fcontext -m -t ${type} ${expression}; fi`;
  }

  /**
   * Builds persistent labeling commands for host paths bind-mounted into
   * unprivileged containers. `container_t` cannot read the policy defaults of
   * those trees (`kubernetes_file_t`, `var_lib_t`), and the mapping is
   * registered before the files exist so entries created later inherit the
   * shared label instead of requiring another relabel pass.
   * @param {string|string[]} paths - Files or directories to share.
   * @param {{sudo?: boolean}} [options]
   * @returns {string[]}
   */
  static selinuxContainerSharedContextCommandsFactory(paths, { sudo = true } = {}) {
    const values = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    if (values.length === 0)
      throw new TypeError('selinuxContainerSharedContextCommandsFactory requires at least one path');
    return [
      ...values.map((path) =>
        SELinuxService.selinuxFileContextCommandFactory(path, { type: SELinuxService.SHARED_CONTAINER_TYPE, sudo }),
      ),
      SELinuxService.selinuxRestoreconCommandFactory(values, { sudo }),
    ];
  }

  /**
   * Builds persistent labeling commands for an SSH directory.
   * Standard /root and /home locations already have policy mappings; custom
   * home locations receive an explicit ssh_home_t mapping.
   * @param {{sshDirectory: string, sudo?: boolean}} options
   * @returns {string[]}
   */
  static selinuxSshContextCommandsFactory({ sshDirectory, sudo = true } = {}) {
    if (!sshDirectory) throw new TypeError('selinuxSshContextCommandsFactory requires sshDirectory');
    const prefix = sudo ? 'sudo ' : '';
    const standard = sshDirectory === '/root/.ssh' || /^\/home\/[^/]+\/\.ssh$/.test(sshDirectory);
    const commands = [];
    if (!standard) {
      const expression = SELinuxService.shellArgumentFactory(`${sshDirectory}(/.*)?`);
      commands.push(
        `if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then command -v semanage >/dev/null 2>&1 || { echo 'semanage is required for a custom SSH home' >&2; exit 1; }; ${prefix}semanage fcontext -a -t ssh_home_t ${expression} 2>/dev/null || ${prefix}semanage fcontext -m -t ssh_home_t ${expression}; fi`,
      );
    }
    commands.push(SELinuxService.selinuxRestoreconCommandFactory(sshDirectory, { sudo }));
    return commands;
  }

  /**
   * Builds an idempotent ssh_port_t assignment for a custom SSH port.
   * @param {{port?: number|string, sudo?: boolean}} [options]
   * @returns {string[]}
   */
  static selinuxSshPortCommandsFactory({ port = 22, sudo = true } = {}) {
    const value = Number(port);
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new RangeError('SSH port must be 1-65535');
    if (value === 22) return [];
    const prefix = sudo ? 'sudo ' : '';
    return [
      `if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then command -v semanage >/dev/null 2>&1 || { echo 'semanage is required for a custom SSH port' >&2; exit 1; }; ${prefix}semanage port -a -t ssh_port_t -p tcp ${value} 2>/dev/null || ${prefix}semanage port -m -t ssh_port_t -p tcp ${value}; fi`,
    ];
  }

  /**
   * Executes a generated command list.
   * @param {string[]} [commands]
   * @param {{execute: Function}} options
   * @returns {*[]}
   */
  static runSELinuxCommands(commands = [], { execute } = {}) {
    if (typeof execute !== 'function') throw new TypeError('runSELinuxCommands requires an executor');
    return commands.map((command) => execute(command));
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
