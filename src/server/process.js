// https://nodejs.org/api/process

import shell from 'shelljs';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import clipboard from 'clipboardy';
import UnderpostRootEnv from '../cli/env.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const getRootDirectory = () => process.cwd().replace(/\\/g, '/');

const ProcessController = {
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
  init: function (logger) {
    this.logger = logger;
    process.on('exit', (...args) => {
      this.logger.info(`process on exit`, args);
    });
    this.onSigListen();
    UnderpostRootEnv.API.delete('await-deploy');
  },
};

const shellExec = (cmd, options = { silent: false, async: false, stdout: false, disableLog: false }) => {
  if (!options.disableLog) logger.info(`cmd`, cmd);
  return options.stdout ? shell.exec(cmd, options).stdout : shell.exec(cmd, options);
};

const shellCd = (cd, options = { disableLog: false }) => {
  if (!options.disableLog) logger.info(`cd`, cd);
  return shell.cd(cd);
};

const openTerminal = (cmd, options = { single: false }) => {
  if (options.single === true) {
    shellExec(`setsid gnome-terminal -- bash -ic "${cmd}; exec bash" >/dev/null 2>&1 &`);
    return;
  }
  shellExec(`gnome-terminal -- bash -c "${cmd}; exec bash" & disown`, {
    async: true,
    stdout: true,
  });
};

const daemonProcess = (cmd) => `exec bash -c '${cmd}; exec tail -f /dev/null'`;

// list all terminals: pgrep gnome-terminal
// list last terminal: pgrep -n gnome-terminal
const getTerminalPid = () => JSON.parse(shellExec(`pgrep -n gnome-terminal`, { stdout: true, silent: true }));

function pbcopy(data) {
  clipboard.writeSync(data || '🦄');
  logger.info(`copied to clipboard`, clipboard.readSync());
}

export { ProcessController, getRootDirectory, shellExec, shellCd, pbcopy, openTerminal, getTerminalPid, daemonProcess };
