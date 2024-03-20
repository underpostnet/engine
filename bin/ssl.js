import fs from 'fs';
import read from 'read';
import ncp from 'copy-paste';

import { getRootDirectory } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, os, hosts] = process.argv;

try {
  let cmd;
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  for (const host of hosts.split(',')) {
    if (host in confServer) {
      const directory = confServer[host]['/']?.['directory'] ? confServer[host]['/']['directory'] : undefined;
      cmd = `certbot certonly --webroot --webroot-path ${
        directory ? directory : `${getRootDirectory()}/public/${host}`
      } -d ${host}`;
      // You can get multi domain cert by specifying (extra) -d
      // For example
      // certbot -d example.com -d example.net -d www.example.org
      logger.info(`Run the following command`, cmd);
      await ncp.copy(cmd);
      await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
      // Certificate
      switch (os) {
        case 'windows':
          (() => {
            const sslPath = 'c:/Certbot/live';
            const privateKey = fs.readFileSync(`${sslPath}/${host}/privkey.pem`, 'utf8');
            const certificate = fs.readFileSync(`${sslPath}/${host}/cert.pem`, 'utf8');
            const ca = fs.readFileSync(`${sslPath}/${host}/chain.pem`, 'utf8');

            console.log(`SSL files found`, {
              privateKey,
              certificate,
              ca,
            });

            if (!fs.existsSync(`./engine-private/ssl/${host}`))
              fs.mkdirSync(`./engine-private/ssl/${host}`, { recursive: true });
            fs.writeFileSync(`./engine-private/ssl/${host}/key.key`, privateKey, 'utf8');
            fs.writeFileSync(`./engine-private/ssl/${host}/crt.crt`, certificate, 'utf8');
            fs.writeFileSync(`./engine-private/ssl/${host}/ca_bundle.crt`, ca, 'utf8');
          })();
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
