import fs from 'fs';
import read from 'read';
import dotenv from 'dotenv';
import { getRootDirectory, pbcopy, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { Cmd, loadConf } from '../src/server/conf.js';
import { buildSSL } from '../src/server/ssl.js';

dotenv.config();

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

const [exe, dir, deployId, hosts] = process.argv;

try {
  let cmd;
  await loadConf(deployId);
  shellExec(Cmd.conf(deployId));
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  for (const host of hosts.split(',')) {
    if (host in confServer) {
      const directory = confServer[host]['/']?.['directory'] ? confServer[host]['/']['directory'] : undefined;
      cmd = `sudo certbot certonly --webroot --webroot-path ${
        directory ? directory : `${getRootDirectory()}/public/${host}`
      } --cert-name ${host} -d ${host}`;
      // directory ? directory : `${getRootDirectory()}/public/${host}`
      // directory ? directory : `${getRootDirectory()}/public/www.${host.split('.').slice(-2).join('.')}`

      // You can get multi domain cert by specifying (extra) -d
      // For example
      // certbot -d example.com -d example.net -d www.example.org

      // delete all file (no increment live folder)
      // certbot delete --cert-name <domain>

      logger.info(`Run the following command`, cmd);
      try {
        await pbcopy(cmd);
        await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
      } catch (error) {
        logger.error(error);
      }
      // Certificate
      if (process.argv.includes('build')) await buildSSL(host);
      logger.info('Certificate saved', host);
    } else throw new Error(`host not found: ${host}`);
  }
  // check for renewal conf:
  // /etc/letsencrypt/renewal
  // /etc/letsencrypt/live
  cmd = `sudo certbot renew --dry-run`;
  try {
    await pbcopy(cmd);
  } catch (error) {
    logger.error(error);
  }
  logger.info(`run the following command for renewal. Command copy to clipboard`, cmd);
  logger.info(`success install SLL`, hosts);
} catch (error) {
  logger.error(error, error.stack);
}
