/**
 * Module for process and shell command management.
 * Provides utilities for executing shell commands, managing signals, and handling environment details.
 * @module src/server/process.js
 * @namespace Process
 */

// https://nodejs.org/api/process

import shell from 'shelljs';
import dotenv from 'dotenv';
import { loggerFactory } from './logger.js';
import clipboard from 'clipboardy';
import Underpost from '../index.js';
import { getNpmRootPath } from './conf.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Gets the current working directory, replacing backslashes with forward slashes for consistency.
 * @memberof Process
 * @returns {string} The root directory path.
 */
const getRootDirectory = () => process.cwd().replace(/\\/g, '/');

/**
 * Controls and manages process-level events and signals.
 * @namespace ProcessController
 */
const ProcessController = {
  /**
   * List of signals to listen for for graceful shutdown/handling.
   * @memberof ProcessController
   * @type {string[]}
   */
  SIG: [
    'SIGPIPE',
    'SIGHUP',
    'SIGTERM',
    'SIGINT',
    'SIGBREAK',
    'SIGWINCH',
    // 'SIGKILL',
    // 'SIGSTOP',
    'SIGBUS',
    'SIGFPE',
    'SIGSEGV',
    'SIGILL',
  ],

  /**
   * Sets up listeners for various process signals defined in {@link ProcessController.SIG}.
   * Handles graceful exit on 'SIGINT' (Ctrl+C).
   * @memberof ProcessController
   * @returns {Array<process.Process>} An array of process listener handles.
   */
  onSigListen: function () {
    return this.SIG.map((sig) =>
      process.on(sig, (...args) => {
        this.logger.info(`process on ${sig}`, args);
        switch (sig) {
          case 'SIGINT':
            return process.exit();

          default:
            break;
        }
      }),
    );
  },

  /**
   * Initializes the ProcessController.
   * Sets up signal listeners, registers a listener for the 'exit' event, and cleans up temporary deployment environment variables.
   * @memberof ProcessController
   * @param {Object} logger - The logger instance to use for internal logging.
   * @returns {void}
   */
  init: function (logger) {
    this.logger = logger;
    process.on('exit', (...args) => {
      this.logger.info(`process on exit`, args);
    });
    this.onSigListen();
    Underpost.env.delete('await-deploy');
  },
};

/**
 * Executes a shell command using shelljs.
 * @memberof Process
 * @param {string} cmd - The command string to execute.
 * @param {Object} [options] - Options for execution.
 * @param {boolean} [options.silent=false] - Suppress output from shell commands.
 * @param {boolean} [options.async=false] - Run command asynchronously.
 * @param {boolean} [options.stdout=false] - Return stdout content (string) instead of shelljs result object.
 * @param {boolean} [options.disableLog=false] - Prevent logging of the command.
 * @param {Function} [options.callback=null] - Callback function for asynchronous execution.
 * @returns {string|shelljs.ShellString} The result of the shell command (string if `stdout: true`, otherwise a ShellString object).
 */
const shellExec = (
  cmd,
  options = { silent: false, async: false, stdout: false, disableLog: false, callback: null },
) => {
  if (!options.disableLog) logger.info(`cmd`, cmd);
  if (options.callback) return shell.exec(cmd, options, options.callback);
  return options.stdout ? shell.exec(cmd, options).stdout : shell.exec(cmd, options);
};

/**
 * Changes the current working directory using shelljs.
 * @memberof Process
 * @param {string} cd - The path to change the directory to.
 * @param {Object} [options] - Options for the CD operation.
 * @param {boolean} [options.disableLog=false] - Prevent logging of the CD command.
 * @returns {shelljs.ShellString} The result of the shelljs cd command.
 */
const shellCd = (cd, options = { disableLog: false }) => {
  if (!options.disableLog) logger.info(`cd`, cd);
  return shell.cd(cd);
};

/**
 * Opens a new GNOME terminal and executes a command.
 * Note: This function is environment-specific (GNOME/Linux).
 * @memberof Process
 * @param {string} cmd - The command to execute in the new terminal.
 * @param {Object} [options] - Options for the terminal opening.
 * @param {boolean} [options.single=false] - If true, execute as a single session process using `setsid`.
 * @param {string} [options.chown] - Path to change ownership to the target user.
 * @returns {void}
 */
const openTerminal = (cmd, options = { single: false }) => {
  // Find the graphical user's UID from /run/user (prefer non-root UID, usually 1000)
  const IDS = shellExec(`ls -1 /run/user`, { stdout: true, silent: true })
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);

  const nonRootIds = IDS.filter((id) => id !== '0');
  const ID = nonRootIds.length > 0 ? nonRootIds[0] : IDS[0];

  if (!options.chown) options.chown = `/home/dd ${getNpmRootPath()}/underpost`;

  shellExec(`chown -R ${ID}:${ID} ${options.chown}`);

  // Run the terminal as the graphical user and use THAT user's runtime dir/bus.
  const confCmd = `USER_GRAPHICAL=$(getent passwd "${ID}" | cut -d: -f1); \
sudo -u "$USER_GRAPHICAL" env DISPLAY="$DISPLAY" \
XDG_RUNTIME_DIR="/run/user/${ID}" \
DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${ID}/bus" \
PATH="$PATH" \
`;

  if (options.single === true) {
    // Run as a single session process
    shellExec(`${confCmd} setsid gnome-terminal -- bash -ic '${cmd}; exec bash' >/dev/null 2>&1 &`, {
      async: true,
    });
    return;
  }
  // Run asynchronously and disown
  shellExec(`${confCmd} gnome-terminal -- bash -c '${cmd}; exec bash' >/dev/null 2>&1 & disown`, {
    async: true,
    stdout: true,
  });
};

/**
 * Wraps a command to run it as a daemon process in a shell (keeping the process alive/terminal open).
 * @memberof Process
 * @param {string} cmd - The command to daemonize.
 * @returns {string} The shell command string for the daemon process.
 */
const daemonProcess = (cmd) => `exec bash -c '${cmd}; exec tail -f /dev/null'`;

/**
 * Retrieves the process ID (PID) of the most recently created gnome-terminal instance.
 * Note: This function is environment-specific (GNOME/Linux) and uses `pgrep -n`.
 * @memberof Process
 * @returns {number} The PID of the last gnome-terminal process.
 */
// list all terminals: pgrep gnome-terminal
// list last terminal: pgrep -n gnome-terminal
const getTerminalPid = () => JSON.parse(shellExec(`pgrep -n gnome-terminal`, { stdout: true, silent: true }));

/**
 * Copies text content to the system clipboard using clipboardy.
 * Logs the copied content for confirmation.
 * @memberof Process
 * @param {string} [data='🦄'] - The data to copy. Defaults to '🦄'.
 * @returns {void}
 */
function pbcopy(data) {
  clipboard.writeSync(data || '🦄');
  logger.info(`copied to clipboard`, clipboard.readSync());
}

export { ProcessController, getRootDirectory, shellExec, shellCd, pbcopy, openTerminal, getTerminalPid, daemonProcess };
