/**
 * Monitor module for managing the monitoring of deployments and services.
 * @module src/cli/monitor.js
 * @namespace UnderpostMonitor
 */

import { loadReplicas, pathPortAssignmentFactory } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import axios from 'axios';
import fs from 'fs-extra';
import { shellExec } from '../server/process.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostMonitor
 * @description Manages deployment monitoring and health checks.
 * This class provides a set of static methods to monitor and manage
 * deployment health, including checking server status, handling traffic
 * switching, and orchestrating monitoring workflows.
 * @memberof UnderpostMonitor
 */
class UnderpostMonitor {
  static API = {
    /**
     * @method callback
     * @description Initiates a deployment monitoring workflow based on the provided options.
     * This method orchestrates the monitoring process for a specific deployment, handling
     * traffic switching, error accumulation, and optional Git integration for version control.
     * @param {string} deployId - The identifier for the deployment to monitor.
     * @param {string} [env='development'] - The environment for the deployment (e.g., 'development', 'production').
     * @param {object} [options] - An object containing boolean flags for various operations.
     * @param {boolean} [options.now=false] - Perform a single health check immediately.
     * @param {boolean} [options.single=false] - Perform a single health check and exit.
     * @param {string} [options.msInterval=''] - Interval in milliseconds for periodic health checks.
     * @param {string} [options.type=''] - Type of deployment (e.g., 'blue-green', 'remote').
     * @param {string} [options.replicas='1'] - Number of replicas for the deployment. Defaults to 1.
     * @param {boolean} [options.sync=false] - Synchronize traffic switching with the deployment.
     * @param {string} [options.namespace='default'] - Kubernetes namespace for the deployment. Defaults to 'default'.
     * @param {string} [options.timeoutResponse=''] - Timeout for server response checks.
     * @param {string} [options.timeoutIdle=''] - Timeout for idle connections.
     * @param {string} [options.retryCount=''] - Number of retry attempts for health checks.
     * @param {string} [options.retryPerTryTimeout=''] - Timeout per retry attempt.
     * @param {boolean} [options.promote=false] - Promote the deployment after monitoring.
     * @param {boolean} [options.readyDeployment=false] - Monitor until the deployment is ready.
     * @param {string} [options.versions=''] - Specific version of the deployment to monitor.
     * @param {object} [commanderOptions] - Options passed from the command line interface.
     * @param {object} [auxRouter] - Optional router configuration for the deployment.
     * @memberof UnderpostMonitor
     */
    async callback(
      deployId,
      env = 'development',
      options = {
        now: false,
        single: false,
        msInterval: '',
        type: '',
        replicas: '1',
        sync: false,
        namespace: 'default',
        timeoutResponse: '',
        timeoutIdle: '',
        retryCount: '',
        retryPerTryTimeout: '',
        promote: false,
        readyDeployment: false,
        versions: '',
      },
      commanderOptions,
      auxRouter,
    ) {
      if (!options.namespace) options.namespace = 'default';
      if (!options.replicas) options.replicas = '1';
      if (deployId === 'dd' && fs.existsSync(`./engine-private/deploy/dd.router`)) {
        for (const _deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(','))
          Underpost.monitor.callback(
            _deployId.trim(),
            env,
            options,
            commanderOptions,
            await Underpost.deploy.routerFactory(_deployId, env),
          );
        return;
      }

      if (options.readyDeployment) {
        for (const version of options.versions.split(',')) {
          (async () => {
            await Underpost.deploy.monitorReadyRunner(deployId, env, version, [], options.namespace, 'underpost');
            if (options.promote)
              Underpost.deploy.switchTraffic(deployId, env, version, options.replicas, options.namespace, options);
          })();
        }
        return;
      }

      const router = auxRouter ?? (await Underpost.deploy.routerFactory(deployId, env));

      const confServer = loadReplicas(
        deployId,
        JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
      );

      const pathPortAssignmentData = await pathPortAssignmentFactory(deployId, router, confServer);

      let errorPayloads = [];
      if (options.sync === true) {
        const currentTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace });
        if (currentTraffic) Underpost.env.set(`${deployId}-${env}-traffic`, currentTraffic);
      }
      let traffic = Underpost.env.get(`${deployId}-${env}-traffic`) ?? 'blue';
      const maxAttempts = parseInt(
        Object.keys(pathPortAssignmentData)
          .map((host) => pathPortAssignmentData[host].length)
          .reduce((accumulator, value) => accumulator + value, 0) * 2.5,
      );

      logger.info(`Init deploy monitor`, {
        pathPortAssignmentData,
        maxAttempts,
        deployId,
        env,
        traffic,
      });

      const switchTraffic = (targetTraffic) => {
        const nextTraffic = targetTraffic ?? (traffic === 'blue' ? 'green' : 'blue');
        // Delegate traffic switching to centralized deploy implementation so behavior is consistent
        Underpost.deploy.switchTraffic(deployId, env, nextTraffic, options.replicas, options.namespace, options);
        // Keep local traffic in sync with the environment
        traffic = nextTraffic;
      };

      const monitor = async (reject) => {
        const currentTimestamp = new Date().getTime();
        errorPayloads = errorPayloads.filter((e) => currentTimestamp - e.timestamp < 60 * 1000 * 5);
        logger.info(`[${deployId}-${env}] Check server health`);
        for (const host of Object.keys(pathPortAssignmentData)) {
          for (const instance of pathPortAssignmentData[host]) {
            const { port, path } = instance;
            if (path.match('peer') || path.match('socket')) continue;
            const urlTest = `http${env === 'development' ? '' : 's'}://${host}${path}`;
            if (env === 'development') {
              const { renderHosts } = Underpost.deploy.etcHostFactory([host]);
              logger.info('renderHosts', renderHosts);
            }
            await axios.get(urlTest, { timeout: 10000 }).catch((error) => {
              const errorPayload = {
                urlTest,
                host,
                port,
                path,
                name: error.name,
                status: error.status,
                code: error.code,
                errors: error.errors,
                timestamp: new Date().getTime(),
              };
              if (errorPayload.status !== 404) {
                errorPayloads.push(errorPayload);
                if (errorPayloads.length >= maxAttempts) {
                  logger.error(
                    `Deployment ${deployId} ${env} has been reached max attempts error payloads`,
                    errorPayloads,
                  );
                  switch (options.type) {
                    case 'blue-green':
                    default: {
                      const confServer = JSON.parse(
                        fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'),
                      );

                      const namespace = options.namespace;
                      Underpost.deploy.configMap(env, namespace);

                      for (const host of Object.keys(confServer)) {
                        shellExec(`sudo kubectl delete HTTPProxy ${host} -n ${namespace} --ignore-not-found`);
                      }
                      shellExec(
                        `sudo kubectl rollout restart deployment/${deployId}-${env}-${traffic} -n ${namespace}`,
                      );

                      switchTraffic();
                    }
                  }
                  errorPayloads = [];
                }
                logger.error(`Error accumulator ${deployId}-${env}-${traffic}`, errorPayloads.length);
              }
            });
          }
        }
      };
      if (options.now === true) await monitor();
      if (options.single === true) return;
      let optionsMsTimeout = parseInt(options.msInterval);
      if (isNaN(optionsMsTimeout)) optionsMsTimeout = 60250; // 60.25 seconds
      let monitorTrafficName;
      let monitorPodName;
      const monitorCallBack = (resolve, reject) => {
        if (env === 'development') {
          const { renderHosts } = Underpost.deploy.etcHostFactory([]);
          logger.info('renderHosts', renderHosts);
        }
        const envMsTimeout = Underpost.env.get(`${deployId}-${env}-monitor-ms`);
        setTimeout(
          async () => {
            const isOnline = await Underpost.dns.isInternetConnection();
            if (!isOnline) {
              logger.warn('No internet connection');
              monitorCallBack(resolve, reject);
              return;
            }
            if (!options.now)
              switch (options.type) {
                case 'blue-green':
                default: {
                  if (monitorTrafficName !== traffic) {
                    monitorTrafficName = undefined;
                    monitorPodName = undefined;
                  }
                  const checkDeploymentReadyStatus = async () => {
                    const { ready, notReadyPods, readyPods } = await Underpost.deploy.checkDeploymentReadyStatus(
                      deployId,
                      env,
                      traffic,
                      [],
                      options.namespace,
                    );
                    if (ready) {
                      monitorPodName = readyPods[0].NAME;
                      monitorTrafficName = `${traffic}`;
                    }
                  };
                  if (!monitorPodName) {
                    await checkDeploymentReadyStatus();
                    monitorCallBack(resolve, reject);
                    return;
                  }
                }
              }
            const monitorKey = `${deployId}-${env}-monitor-input`;
            const monitorValue = Underpost.env.get(monitorKey);
            switch (monitorValue) {
              case 'pause':
                monitorCallBack(resolve, reject);
                return;
              case 'restart':
              case 'stop':
              case 'blue-green-switch':
                Underpost.env.delete(monitorKey);
              case 'restart':
                return reject();
              case 'stop':
                return resolve();
              case 'blue-green-switch':
                switchTraffic();
            }
            await monitor(reject);
            monitorCallBack(resolve, reject);
            return;
          },
          !isNaN(envMsTimeout) ? envMsTimeout : optionsMsTimeout,
        );
      };
      return new Promise((...args) => monitorCallBack(...args));
    },
  };
}

export default UnderpostMonitor;
