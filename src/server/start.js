import UnderpostDeploy from '../cli/deploy.js';
import fs from 'fs-extra';
import { awaitDeployMonitor } from './conf.js';
import { actionInitLog, loggerFactory } from './logger.js';
import { shellCd, shellExec } from './process.js';
import UnderpostRootEnv from '../cli/env.js';

const logger = loggerFactory(import.meta);

class UnderpostStartUp {
  static API = {
    logRuntimeRouter: () => {
      const displayLog = {};

      for (const host of Object.keys(UnderpostDeploy.NETWORK))
        for (const path of Object.keys(UnderpostDeploy.NETWORK[host]))
          displayLog[UnderpostDeploy.NETWORK[host][path].publicHost] = UnderpostDeploy.NETWORK[host][path].local;

      logger.info('Runtime network', displayLog);
    },
    listenServerFactory: (logic = async () => {}) => {
      return {
        listen: async (...args) => {
          const msDelta = 1000;
          const msMax = 30 * 24 * 60 * 60 * 1000; // ~ 1 month
          let msCount = 0;
          setInterval(() => {
            msCount += msDelta;
            if (msCount >= msMax) {
              const message = 'Listen server factory timeout';
              logger.error(message);
              throw new Error(message);
            }
          }, msDelta);
          return logic ? await logic(...args) : undefined, args[1]();
        },
      };
    },
    listenPortController: async (server, port, metadata) =>
      new Promise((resolve) => {
        try {
          if (port === ':') {
            server.listen(port, actionInitLog);
            return resolve(true);
          }

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
            if (!UnderpostDeploy.NETWORK[host]) UnderpostDeploy.NETWORK[host] = {};
            UnderpostDeploy.NETWORK[host][path] = {
              meta,
              client,
              runtime,
              port,
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
      }),

    async callback(deployId = 'dd-default', env = 'development', options = { build: false, run: false }) {
      if (options.build === true) await UnderpostStartUp.API.build(deployId, env);
      if (options.run === true) await UnderpostStartUp.API.run(deployId, env);
    },
    async build(deployId = 'dd-default', env = 'development') {
      const buildBasePath = `/home/dd`;
      const repoName = `engine-${deployId.split('-')[1]}`;
      shellExec(`cd ${buildBasePath} && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}`);
      shellExec(`cd ${buildBasePath} && sudo mv ./${repoName} ./engine`);
      shellExec(`cd ${buildBasePath}/engine && underpost clone ${process.env.GITHUB_USERNAME}/${repoName}-private`);
      shellExec(`cd ${buildBasePath}/engine && sudo mv ./${repoName}-private ./engine-private`);
      shellCd(`${buildBasePath}/engine`);
      shellExec(`npm install`);
      shellExec(`node bin/deploy conf ${deployId} ${env}`);
      if (fs.existsSync('./engine-private/itc-scripts')) {
        const itcScripts = await fs.readdir('./engine-private/itc-scripts');
        for (const itcScript of itcScripts)
          if (itcScript.match(deployId)) shellExec(`node ./engine-private/itc-scripts/${itcScript}`);
      }
      shellExec(`node bin/deploy build-full-client ${deployId}`);
    },
    async run(deployId = 'dd-default', env = 'development') {
      const runCmd = env === 'production' ? 'run prod-img' : 'run dev-img';
      if (fs.existsSync(`./engine-private/replica`)) {
        const replicas = await fs.readdir(`./engine-private/replica`);
        for (const replica of replicas) {
          if (!replica.match(deployId)) continue;
          shellExec(`node bin/deploy conf ${replica} ${env}`);
          shellExec(`npm ${runCmd} ${replica}`, { async: true });
          await awaitDeployMonitor(true);
        }
      }
      shellExec(`node bin/deploy conf ${deployId} ${env}`);
      shellExec(`npm ${runCmd} ${deployId}`, { async: true });
      await awaitDeployMonitor(true);
      UnderpostRootEnv.API.set('container-status', `${deployId}-${env}-running-deployment`);
    },
  };
}

export default UnderpostStartUp;
