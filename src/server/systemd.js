/**
 * General-purpose systemd unit rendering and service lifecycle helpers.
 *
 * Command construction is deterministic and separate from execution. Callers
 * can execute commands explicitly or pass a list to {@link runSystemdCommands}.
 *
 * @module src/server/systemd.js
 * @namespace SystemdService
 */
'use strict';

/**
 * Main systemd service utility.
 * @class SystemdService
 * @memberof SystemdService
 */
class SystemdService {
  /**
   * System-wide Node locations a unit can execute, in preference order.
   * @type {ReadonlyArray<string>}
   */
  static NODE_PATHS = Object.freeze(['/usr/bin/node', '/usr/local/bin/node', '/bin/node']);

  static #valuesFactory(value) {
    return Array.isArray(value) ? value : [value];
  }

  static #sectionFactory(name, directives = {}) {
    const lines = Object.entries(directives).flatMap(([directive, value]) =>
      SystemdService.#valuesFactory(value)
        .filter((entry) => entry !== undefined && entry !== null && `${entry}` !== '')
        .map((entry) => `${directive}=${entry}`),
    );
    return lines.length > 0 ? [`[${name}]`, ...lines].join('\n') : '';
  }

  static #daemonReloadCommandFactory({ sudo = true } = {}) {
    return SystemdService.systemctlCommandFactory({ action: 'daemon-reload', sudo });
  }

  /**
   * Checks whether a path is inside a user home directory.
   * @param {string} path - Candidate path.
   * @returns {boolean}
   */
  static homeDirectoryPathFactory(path) {
    return /^\/root(\/|$)|^\/home\//.test(`${path || ''}`.trim());
  }

  /**
   * Renders a systemd unit from named sections and directives.
   * @param {{header?: string, sections?: Object<string, Object<string, *>>}} [options]
   * @returns {string}
   */
  static systemdUnitFactory({ header = '', sections = {} } = {}) {
    const rendered = Object.entries(sections)
      .map(([name, directives]) => SystemdService.#sectionFactory(name, directives))
      .filter(Boolean);
    return [...(`${header}`.trim() ? [`${header}`.trim()] : []), ...rendered].join('\n\n') + '\n';
  }

  /**
   * Builds a systemctl command.
   * @param {{action?: string, name?: string, sudo?: boolean, stderr?: boolean, allowFailure?: boolean}} [options]
   * @returns {string}
   */
  static systemctlCommandFactory({ action, name = '', sudo = true, stderr = false, allowFailure = false } = {}) {
    return [
      sudo ? 'sudo' : '',
      'systemctl',
      `${action || ''}`.trim(),
      `${name || ''}`.trim(),
      stderr ? '2>/dev/null' : '',
      allowFailure ? '|| true' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** @returns {string} Command that checks whether systemd-run is available. */
  static systemdAvailableCommandFactory() {
    return 'command -v systemd-run';
  }

  /**
   * Builds a journalctl command for a service.
   * @param {{name: string, lines?: number, follow?: boolean}} options
   * @returns {string}
   */
  static journalctlCommandFactory({ name, lines, follow = false } = {}) {
    return ['journalctl', '-u', name, lines ? `-n ${lines}` : '', follow ? '-f' : ''].filter(Boolean).join(' ');
  }

  /**
   * Builds a transient systemd-run command.
   * @param {{command?: string, user?: string, properties?: Object<string, *>, quiet?: boolean, collect?: boolean, wait?: boolean, sudo?: boolean}} [options]
   * @returns {string}
   */
  static systemdRunCommandFactory({
    command,
    user,
    properties = {},
    quiet = true,
    collect = true,
    wait = true,
    sudo = true,
  } = {}) {
    return [
      sudo ? 'sudo' : '',
      'systemd-run',
      quiet ? '--quiet' : '',
      collect ? '--collect' : '',
      wait ? '--wait' : '',
      user ? `--uid=${user}` : '',
      ...Object.entries(properties).map(([name, value]) => `--property=${name}=${value}`),
      `${command || ''}`.trim(),
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Builds convergent ensure and remove command lists for a service.
   * @param {{changed?: boolean, name: string, unitPath: string}} options
   * @returns {{ensure: string[], remove: string[]}}
   */
  static systemdServiceCommandsFactory({ changed = false, name, unitPath } = {}) {
    return {
      ensure: [
        ...(changed ? [SystemdService.#daemonReloadCommandFactory()] : []),
        SystemdService.systemctlCommandFactory({ action: 'enable', name, allowFailure: true }),
        SystemdService.systemctlCommandFactory({
          action: changed ? 'restart' : 'start',
          name,
          allowFailure: true,
        }),
      ],
      remove: [
        SystemdService.systemctlCommandFactory({
          action: 'disable --now',
          name,
          stderr: true,
          allowFailure: true,
        }),
        `sudo rm -f ${unitPath}`,
        SystemdService.#daemonReloadCommandFactory(),
      ],
    };
  }

  /**
   * Builds service status and log commands.
   * @param {string} name - Service name.
   * @returns {{active: string, enabled: string, logs: string}}
   */
  static systemdStatusCommandsFactory(name) {
    return {
      active: SystemdService.systemctlCommandFactory({ action: 'is-active', name, sudo: false }),
      enabled: SystemdService.systemctlCommandFactory({ action: 'is-enabled', name, sudo: false }),
      logs: SystemdService.journalctlCommandFactory({ name }),
    };
  }

  /**
   * Builds a guarded reload command.
   * @param {string} name - Service name.
   * @returns {string}
   */
  static systemdReloadIfActiveCommandFactory(name) {
    return `sudo sh -c 'systemctl is-active --quiet ${name} && systemctl reload ${name} || true'`;
  }

  /**
   * Orders Node executable candidates for a service probe.
   *
   * A binary under `/root` or `/home` is tried last: systemd refuses to execute
   * one on an SELinux host, so a unit pointing at it restarts on 203/EXEC.
   * @param {{execPath?: string, systemPaths?: string[]}} [options]
   * @returns {string[]} Ordered, unique executable paths.
   */
  static nodeCandidatesFactory({ execPath = process.execPath, systemPaths = SystemdService.NODE_PATHS } = {}) {
    const own = `${execPath || ''}`.trim();
    const inHome = SystemdService.homeDirectoryPathFactory(own);
    return [...new Set([...(own && !inHome ? [own] : []), ...systemPaths, ...(own && inHome ? [own] : [])])];
  }

  /**
   * Builds a transient command that probes a Node executable.
   * @param {string} nodePath - Candidate Node executable path.
   * @param {string} [user] - User that will own the service.
   * @returns {string} systemd-run command.
   */
  static nodeProbeCommandFactory(nodePath, user) {
    return SystemdService.systemdRunCommandFactory({
      command: `${nodePath} --version`,
      user,
      properties: { Type: 'oneshot' },
    });
  }

  /**
   * Builds a transient command that probes a script under the unit's own
   * constraints, which is what catches a checkout a unit cannot read.
   * @param {{nodePath: string, scriptPath?: string, user?: string, workingDirectory?: string}} options
   * @returns {string} systemd-run command.
   */
  static scriptProbeCommandFactory({ nodePath, scriptPath, user, workingDirectory }) {
    return SystemdService.systemdRunCommandFactory({
      command: `${nodePath} ${scriptPath} --version`,
      user,
      properties: { Type: 'oneshot', WorkingDirectory: workingDirectory },
    });
  }

  /**
   * Executes or reports a sequence of generated commands.
   * @param {string[]} [commands]
   * @param {{dryRun?: boolean, execute?: Function, onDryRun?: Function}} [options]
   * @returns {*[]}
   */
  static runSystemdCommands(commands = [], { dryRun = false, execute, onDryRun = () => {} } = {}) {
    if (!dryRun && typeof execute !== 'function') throw new TypeError('runSystemdCommands requires an executor');
    return commands.map((command) => (dryRun ? onDryRun(command) : execute(command)));
  }
}

const {
  homeDirectoryPathFactory,
  journalctlCommandFactory,
  nodeCandidatesFactory,
  nodeProbeCommandFactory,
  runSystemdCommands,
  scriptProbeCommandFactory,
  systemctlCommandFactory,
  systemdAvailableCommandFactory,
  systemdReloadIfActiveCommandFactory,
  systemdRunCommandFactory,
  systemdServiceCommandsFactory,
  systemdStatusCommandsFactory,
  systemdUnitFactory,
} = SystemdService;

export default SystemdService;

export {
  homeDirectoryPathFactory,
  journalctlCommandFactory,
  nodeCandidatesFactory,
  nodeProbeCommandFactory,
  runSystemdCommands,
  scriptProbeCommandFactory,
  systemctlCommandFactory,
  systemdAvailableCommandFactory,
  systemdReloadIfActiveCommandFactory,
  systemdRunCommandFactory,
  systemdServiceCommandsFactory,
  systemdStatusCommandsFactory,
  systemdUnitFactory,
};
