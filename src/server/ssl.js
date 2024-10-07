import fs from 'fs-extra';
import dotenv from 'dotenv';
import https from 'https';
import { loggerFactory } from './logger.js';
import { range } from '../client/components/core/CommonJs.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const buildSSL = async (host) => {
  const sslPath = process.env.CERTBOT_LIVE_PATH;
  host = host.replaceAll(`\\`, '/');
  const [hostSSL, path] = host.split('/');
  if (path || !fs.existsSync(sslPath)) return;
  const files = await fs.readdir(sslPath);

  for (const folderHost of files)
    if (folderHost.match(host.split('/')[0])) {
      for (const i of [''].concat(range(1, 10))) {
        const privateKeyPath = `${sslPath}/${folderHost}/privkey${i}.pem`;
        const certificatePath = `${sslPath}/${folderHost}/cert${i}.pem`;
        const caPath = `${sslPath}/${folderHost}/chain${i}.pem`;
        const caFullPath = `${sslPath}/${folderHost}/fullchain${i}.pem`;

        if (
          fs.existsSync(privateKeyPath) &&
          fs.existsSync(certificatePath) &&
          fs.existsSync(caPath) &&
          fs.existsSync(caFullPath)
        ) {
          const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
          const certificate = fs.readFileSync(certificatePath, 'utf8');
          const ca = fs.readFileSync(caPath, 'utf8');
          const caFull = fs.readFileSync(caFullPath, 'utf8');

          logger.info(`SSL files update`, {
            privateKey,
            certificate,
            ca,
            caFull,
          });

          if (!fs.existsSync(`./engine-private/ssl/${host}`))
            fs.mkdirSync(`./engine-private/ssl/${host}`, { recursive: true });

          fs.writeFileSync(`./engine-private/ssl/${host}/key.key`, privateKey, 'utf8');
          fs.writeFileSync(`./engine-private/ssl/${host}/crt.crt`, certificate, 'utf8');
          fs.writeFileSync(`./engine-private/ssl/${host}/ca_bundle.crt`, caFull, 'utf8');

          fs.writeFileSync(`./engine-private/ssl/${host}/_ca_bundle.crt`, ca, 'utf8');
          fs.writeFileSync(`./engine-private/ssl/${host}/_ca_full_bundle.crt`, caFull, 'utf8');

          // fs.removeSync(`${sslPath}/${folderHost}`);
          return true;
        }
      }
    }
  return false;
};

const validateSecureContext = (host) => {
  return (
    fs.existsSync(`./engine-private/ssl/${host}/key.key`) &&
    fs.existsSync(`./engine-private/ssl/${host}/crt.crt`) &&
    fs.existsSync(`./engine-private/ssl/${host}/ca_bundle.crt`)
  );
};

const buildSecureContext = (host) => {
  return {
    key: fs.readFileSync(`./engine-private/ssl/${host}/key.key`, 'utf8'),
    cert: fs.readFileSync(`./engine-private/ssl/${host}/crt.crt`, 'utf8'),
    ca: fs.readFileSync(`./engine-private/ssl/${host}/ca_bundle.crt`, 'utf8'),
  };
};

const createSslServer = async (app, hosts) => {
  let ServerSSL;
  for (const host of Object.keys(hosts)) {
    // const { redirect } = hosts[host];
    const [hostSSL, path = ''] = host.split('/');
    await buildSSL(host);
    const validSSL = validateSecureContext(hostSSL);
    if (validSSL) {
      if (!ServerSSL) ServerSSL = https.createServer(buildSecureContext(hostSSL), app);
      else ServerSSL.addContext(hostSSL, buildSecureContext(hostSSL));
    } else logger.error('Invalid SSL context', { host, ...hosts[host] });
  }
  return { ServerSSL };
};

const sslRedirectMiddleware = (req, res, port, proxyRouter) => {
  const sslRedirectUrl = `https://${req.headers.host}${req.url}`;
  if (
    process.env.NODE_ENV === 'production' &&
    port !== 443 &&
    !req.secure &&
    !req.url.startsWith(`/.well-known/acme-challenge`) &&
    proxyRouter[443] &&
    Object.keys(proxyRouter[443]).find((host) => {
      const [hostSSL, path = ''] = host.split('/');
      return sslRedirectUrl.match(hostSSL) && validateSecureContext(hostSSL);
    })
  )
    return res.status(302).redirect(sslRedirectUrl);
};

export { buildSSL, buildSecureContext, validateSecureContext, createSslServer, sslRedirectMiddleware };
