import { publicIp, publicIpv4, publicIpv6 } from 'public-ip';
import { killPortProcess } from 'kill-port-process';
import detect from 'detect-port';
import { loggerFactory } from './logger.js';
import { orderArrayFromAttrInt } from '../client/components/core/CommonJs.js';

// Network Address Translation Management

// import dotenv from 'dotenv';
// dotenv.config();

const logger = loggerFactory(import.meta);

const network = {
  port: {
    status: async (ports) => {
      const status = [];
      for (const port of ports) {
        status.push({
          port,
          open: await new Promise((resolve) =>
            detect(port)
              .then((_port) => {
                if (port == _port)
                  // `port: ${port} was not occupied`
                  return resolve(false);

                // `port: ${port} was occupied, try port: ${_port}`
                return resolve(true);
              })
              .catch((error) => resolve(`${error.message}`)),
          ),
        });
      }
      return status;
    },
    kill: async (ports) => await killPortProcess(ports),
    portClean: async function (port) {
      const [portStatus] = await this.status([port]);
      // logger.info('port status', portStatus);
      if (portStatus.open) await this.kill([port]);
    },
  },
};

const ip = {
  public: {
    get: async () => await publicIp(), // => 'fe80::200:f8ff:fe21:67cf'
    ipv4: async () => await publicIpv4(), // => '46.5.21.123'
    ipv6: async () => await publicIpv6(), // => 'fe80::200:f8ff:fe21:67cf'
  },
};

const networkRouter = {};

const logNetworkRouter = (logger) => {
  // order router
  const router = {};
  for (const absoluteHostKey of orderArrayFromAttrInt(Object.keys(networkRouter), 'length'))
    router[absoluteHostKey] = networkRouter[absoluteHostKey];

  logger.info('Runtime network', router);
};

const listenPortController = async (server, port, log) =>
  new Promise((resolve) => {
    try {
      server.listen(port, () => {
        if (log.type === 'proxy') {
          logger.info('Proxy running', log);
          return resolve(true);
        }
        networkRouter[log.host] = log.local;
        return resolve(true);
      });
    } catch (error) {
      logger.error(error, error.stack);
      resolve(false);
    }
  });

export { ip, network, listenPortController, networkRouter, logNetworkRouter };
