// https://nodejs.org/api/process

import shell from 'shelljs';
import dotenv from 'dotenv';
import fs from 'fs';

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
      'SIGKILL',
      'SIGSTOP',
      'SIGBUS',
      'SIGFPE',
      'SIGSEGV',
      'SIGILL',
    ],
    onListen: function () {
      return this.data.map((sig) =>
        process.on(sig, (...args) => {
          logger.info(`process on ${sig}`, args);
        })
      );
    },
  },
  init: function () {
    process.on('exit', (...args) => {
      logger.info(`process on exit`, args);
    });
    this.SIG.onListen();
  },
};

const shellExec = (cmd) => {
  logger.info(`cmd`, cmd);
  return shell.exec(cmd);
};

const shellCd = (cd) => {
  logger.info(`cd`, cd);
  return shell.cd(cd);
};

const envController = async () => {
  const confPrivateServerPath = `./engine-private/conf.server.private.json`;
  const confBuildServerPath = `./src/conf.server.json`;
  if (fs.existsSync(confPrivateServerPath))
    fs.writeFileSync(confBuildServerPath, fs.readFileSync(confPrivateServerPath, 'utf8'), 'utf8');
  else if (!fs.existsSync(confBuildServerPath))
    fs.writeFileSync(
      confBuildServerPath,
      JSON.stringify(
        JSON.parse({
          'example1.com': {
            '/docs': {
              client: 'doc',
              runtime: 'xampp',
              origins: [],
              disabled: false,
              proxy: [80, 443],
            },
            '/': {
              client: 'test',
              runtime: 'nodejs',
              origins: [],
              disabled: false,
              proxy: [80, 443],
            },
          },
          'www.example2.com': {
            '/cyberia': {
              client: 'cyberia',
              runtime: 'nodejs',
              origins: [],
              disabled: false,
              proxy: [80, 443],
            },
            '/': {
              client: 'test',
              runtime: 'nodejs',
              origins: [],
              disabled: false,
              proxy: [80, 443],
            },
          },
        }),
        null,
        4
      ),
      'utf8'
    );

  const confPrivateDnsPath = `./engine-private/conf.dns.private.json`;
  const confBuildDnsPath = `./src/conf.dns.json`;
  if (fs.existsSync(confPrivateDnsPath))
    fs.writeFileSync(confBuildDnsPath, fs.readFileSync(confPrivateDnsPath, 'utf8'), 'utf8');
  else if (!fs.existsSync(confBuildDnsPath))
    fs.writeFileSync(
      confBuildDnsPath,
      JSON.stringify(
        {
          ipDaemon: {
            ip: null,
            minutesTimeInterval: 3,
          },
          records: {
            A: [
              {
                host: 'example.com',
                dns: 'dondominio',
                api_key: '???',
                user: '???',
              },
            ],
          },
        },
        null,
        4
      ),
      'utf8'
    );
};

export { ProcessController, getRootDirectory, shellExec, shellCd, envController };
