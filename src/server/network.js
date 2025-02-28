import fs from 'fs-extra';

import { publicIp, publicIpv4, publicIpv6 } from 'public-ip';
import { loggerFactory } from './logger.js';
import { DataBaseProvider } from '../db/DataBaseProvider.js';
import { getDeployId } from './conf.js';

// Network Address Translation Management

// import dotenv from 'dotenv';
// dotenv.config();

const logger = loggerFactory(import.meta);

const ip = {
  public: {
    get: async () => await publicIp(), // => 'fe80::200:f8ff:fe21:67cf'
    ipv4: async () => await publicIpv4(), // => '46.5.21.123'
    ipv6: async () => await publicIpv6(), // => 'fe80::200:f8ff:fe21:67cf'
  },
};

let ipInstance = '';
const networkRouter = {};

const logRuntimeRouter = () => {
  const displayLog = {};

  for (const host of Object.keys(networkRouter))
    for (const path of Object.keys(networkRouter[host]))
      displayLog[networkRouter[host][path].publicHost] = networkRouter[host][path].local;

  logger.info('Runtime network', displayLog);
};

const saveRuntimeRouter = async () => {
  try {
    const deployId = process.env.DEFAULT_DEPLOY_ID;
    const host = process.env.DEFAULT_DEPLOY_HOST;
    const path = process.env.DEFAULT_DEPLOY_PATH;
    const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
    if (!deployId || !host || !path || !fs.existsSync(confServerPath)) {
      // logger.warn('default deploy instance not found');
      return;
    }
    const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
    const { db } = confServer[host][path];

    let closeConn;
    if (!DataBaseProvider.instance[`${host}${path}`]) {
      await DataBaseProvider.load({ apis: ['instance'], host, path, db });
      closeConn = true;
    }

    /** @type {import('../api/instance/instance.model.js').InstanceModel} */
    const Instance = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Instance;

    for (const _host of Object.keys(networkRouter)) {
      for (const _path of Object.keys(networkRouter[_host])) {
        const body = {
          host: _host,
          path: _path,
          deployId: getDeployId(),
          client: networkRouter[_host][_path].client,
          runtime: networkRouter[_host][_path].runtime,
          port: networkRouter[_host][_path].port,
          apis: networkRouter[_host][_path].apis,
        };
        const instance = await Instance.findOne({ deployId: body.deployId, host: _host, path: _path });
        if (instance) {
          await Instance.findByIdAndUpdate(instance._id, body);
        } else {
          await new Instance(body).save();
        }
      }
    }

    if (closeConn) await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
  } catch (error) {
    logger.error(error);
  }
};

const netWorkCron = [];

const saveRuntimeCron = async () => {
  try {
    const deployId = process.env.DEFAULT_DEPLOY_ID;
    const host = process.env.DEFAULT_DEPLOY_HOST;
    const path = process.env.DEFAULT_DEPLOY_PATH;
    const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
    const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
    const { db } = confServer[host][path];

    let closeConn;
    if (!DataBaseProvider.instance[`${host}${path}`]) {
      await DataBaseProvider.load({ apis: ['cron'], host, path, db });
      closeConn = true;
    }

    /** @type {import('../api/cron/cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Cron;

    // await Cron.insertMany(netWorkCron);

    for (const cronInstance of netWorkCron) {
      const cron = await Cron.findOne({ deployId: cronInstance.deployId, jobId: cronInstance.jobId });
      if (cron) {
        await Cron.findByIdAndUpdate(cron._id, cronInstance);
      } else {
        await new Cron(cronInstance).save();
      }
    }

    if (closeConn) await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
  } catch (error) {
    logger.error(error);
  }
};

const listenServerFactory = (logic = async () => {}) => {
  return {
    listen: async (...args) => (
      setTimeout(() => {
        const message = 'Listen server factory timeout';
        logger.error(message);
        throw new Error(message);
      }, 80000000), // ~ 55 days
      (logic ? await logic(...args) : undefined, args[1]())
    ),
  };
};

const listenPortController = async (server, port, metadata) =>
  new Promise((resolve) => {
    try {
      if (!server) server = listenServerFactory();

      const { host, path, client, runtime, meta } = metadata;
      const error = [];
      if (port === undefined) error.push(`port`);
      if (host === undefined) error.push(`host`);
      if (path === undefined) error.push(`path`);
      if (client === undefined) error.push(`client`);
      if (runtime === undefined) error.push(`runtime`);
      if (meta === undefined) error.push(`meta`);
      if (error.length > 0) throw new Error('Listen port controller requires values: ' + error.join(', '));

      server.listen(port, () => {
        if (!networkRouter[host]) networkRouter[host] = {};
        networkRouter[host][path] = {
          meta,
          client,
          runtime,
          port,
          public: `http://${ipInstance}:${port}${path}`,
          publicHost:
            port === 80
              ? `http://${host}${path}`
              : port === 443
              ? `https://${host}${path}`
              : `http://${host}:${port}${path}`,
          local: `http://localhost:${port}${path}`,
          apis: metadata.apis,
        };

        return resolve(true);
      });
    } catch (error) {
      logger.error(error, { metadata, port, stack: error.stack });
      resolve(false);
    }
  });

export {
  ip,
  listenPortController,
  networkRouter,
  netWorkCron,
  saveRuntimeRouter,
  logRuntimeRouter,
  listenServerFactory,
  saveRuntimeCron,
};
