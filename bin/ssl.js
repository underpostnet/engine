import fs from 'fs';
import read from 'read';
import ncp from 'copy-paste';
import dotenv from 'dotenv';

import { getRootDirectory, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { Cmd, loadConf } from '../src/server/conf.js';
import { buildSSL } from '../src/server/ssl.js';

dotenv.config();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

// usage
// node bin/ssl windows <deploy-id> www.example.com

const [exe, dir, os, deployId, hosts] = process.argv;

try {
  let cmd;
  await loadConf(deployId);
  shellExec(Cmd.conf(deployId));
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  for (const host of hosts.split(',')) {
    if (host in confServer) {
      const directory = confServer[host]['/']?.['directory'] ? confServer[host]['/']['directory'] : undefined;
      cmd = `certbot certonly --webroot --webroot-path ${
        directory ? directory : `${getRootDirectory()}/public/${host}`
      } -d ${host}`;
      // directory ? directory : `${getRootDirectory()}/public/${host}`
      // directory ? directory : `${getRootDirectory()}/public/www.${host.split('.').slice(-2).join('.')}`

      // You can get multi domain cert by specifying (extra) -d
      // For example
      // certbot -d example.com -d example.net -d www.example.org

      // delete all file (no increment live folder)
      // certbot delete --cert-name <domain>

      logger.info(`Run the following command`, cmd);
      await ncp.copy(cmd);
      await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
      // Certificate
      switch (os) {
        case 'windows':
          await buildSSL(host);
          break;

        default:
          break;
      }
      logger.info('Certificate saved', host);
    } else throw new Error(`host not found: ${host}`);
  }

  cmd = `certbot renew --dry-run`;
  await ncp.copy(cmd);
  logger.info(`run the following command for renewal. Command copy to clipboard`, cmd);
  logger.info(`success install SLL`, hosts);
} catch (error) {
  logger.error(error, error.stack);
}
