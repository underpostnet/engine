// https://nodejs.org/api/process

import shell from 'shelljs';
import dotenv from 'dotenv';

import { loggerFactory } from './logger.js';

dotenv.config();

const logger = loggerFactory(import.meta);

// process.exit();

const getRootDirectory = () => process.cwd().replace(/\\/g, '/');

const ProcessController = {
  SIG: {
    data: [
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
    onListen: function () {
      return this.data.map((sig) =>
        process.on(sig, (...args) => {
          this.logger.info(`process on ${sig}`, args);
        }),
      );
    },
  },
  init: function (logger) {
    this.logger = logger;
    process.on('exit', (...args) => {
      this.logger.info(`process on exit`, args);
    });
    this.SIG.onListen();
  },
};

const shellExec = (cmd, options = { silent: false, async: false, stdout: false }) => {
  logger.info(`cmd`, cmd);
  return options.stdout ? shell.exec(cmd, options).stdout : shell.exec(cmd, options);
};

const shellCd = (cd) => {
  logger.info(`cd`, cd);
  return shell.cd(cd);
};

export { ProcessController, getRootDirectory, shellExec, shellCd };
