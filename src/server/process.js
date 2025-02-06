// https://nodejs.org/api/process

import shell from 'shelljs';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import { loggerFactory } from './logger.js';
import clipboard from 'clipboardy';

dotenv.config();

const logger = loggerFactory(import.meta);

// process.exit();

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
    if (fs.existsSync(`./tmp/await-deploy`)) fs.remove(`./tmp/await-deploy`);
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

function pbcopy(data) {
  switch (process.platform) {
    case 'linux':
      {
        // sudo dnf install xclip
        // sudo apt update
        // sudo apt install xclip
        // paste: xclip -o
        // copy:
        // shellExec(`echo "${data}" | xclip -sel clip`, { async: true });
      }

      break;

    default:
      break;
  }

  clipboard.writeSync(data || '🦄');

  logger.info(`copied to clipboard`, clipboard.readSync());
}

export { ProcessController, getRootDirectory, shellExec, shellCd, pbcopy };
