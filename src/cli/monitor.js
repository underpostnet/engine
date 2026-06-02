/**
 * Monitor module for managing the monitoring of deployments and services.
 * @module src/cli/monitor.js
 * @namespace UnderpostMonitor
 */

import {
  loadReplicas,
  pathPortAssignmentFactory,
  loadConfServerJson,
  loadCronDeployEnv,
  etcHostFactory,
} from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { timer } from '../client/components/core/CommonJs.js';
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
      loadCronDeployEnv();
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
        await Promise.all(
          options.versions.split(',').map(async (version) => {
            await Underpost.monitor.monitorReadyRunner(deployId, env, version, [], options.namespace);
            if (options.promote)
              Underpost.deploy.switchTraffic(deployId, env, version, options.replicas, options.namespace, options);
          }),
        );
        return;
      }

      const router = auxRouter ?? (await Underpost.deploy.routerFactory(deployId, env));

      const confServer = loadReplicas(
        deployId,
        loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
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
        // Delegate traffic switching to deploy implementation so behavior is consistent
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
              const { renderHosts } = etcHostFactory([host]);
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
                      const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);

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
          const { renderHosts } = etcHostFactory([]);
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
                    const { ready, notReadyPods, readyPods } = await Underpost.monitor.checkDeploymentReadyStatus(
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
    /**
     * Checks the status of a deployment.
     * @param {string} deployId - Deployment ID for which the status is being checked.
     * @param {string} env - Environment for which the status is being checked.
     * @param {string} traffic - Current traffic status for the deployment.
     * @param {Array<string>} ignoresNames - List of pod names to ignore.
     * @param {string} [namespace='default'] - Kubernetes namespace for the deployment.
     * @returns {object} - Object containing the status of the deployment.
     * @memberof UnderpostMonitor
     */
    async checkDeploymentReadyStatus(deployId, env, traffic, ignoresNames = [], namespace = 'default') {
      const pods = Underpost.kubectl.get(`${deployId}-${env}-${traffic}`, 'pods', namespace);
      const readyPods = [];
      const notReadyPods = [];

      // Readiness signal: the pod's Kubernetes `Ready` condition driven by the
      // container's readinessProbe (TCP socket, HTTP get, or exec). Set by kubelet
      // when the probe passes. A failed or crashing runtime never becomes Ready —
      // kubelet surfaces CrashLoopBackOff and this gate stays closed.
      for (const pod of pods) {
        const { NAME } = pod;
        if (ignoresNames && ignoresNames.find((t) => NAME.trim().toLowerCase().match(t.trim().toLowerCase()))) continue;

        let podJson = null;
        try {
          // Pod may not exist yet (between deployment apply and pod
          // scheduling). silentOnError lets the monitor loop continue
          // instead of aborting on the transient NotFound exit.
          const raw = shellExec(`sudo kubectl get pod ${NAME} -n ${namespace} -o json`, {
            silent: true,
            disableLog: true,
            stdout: true,
            silentOnError: true,
          });
          podJson = raw ? JSON.parse(raw) : null;
        } catch (_) {
          podJson = null;
        }
        const conditions = podJson?.status?.conditions || [];
        const readyCondition = conditions.find((c) => c.type === 'Ready');
        const k8sReady = readyCondition?.status === 'True';

        pod.out = JSON.stringify({ k8sReady, condition: readyCondition ?? null });

        if (k8sReady) readyPods.push(pod);
        else notReadyPods.push(pod);
      }
      const consideredCount = readyPods.length + notReadyPods.length;
      return {
        ready: consideredCount > 0 && notReadyPods.length === 0,
        notReadyPods,
        readyPods,
      };
    },
    /**
     * Monitors the ready status of a deployment.
     *
     * Ready signal:
     *   The orchestrator gate is the Kubernetes pod Ready condition. When the
     *   container's `readinessProbe` succeeds, kubelet flips
     *   `status.conditions[Ready]` to True and `checkDeploymentReadyStatus`
     *   returns the pod in `readyPods`. This is the only required signal — see
     *   `src/client/public/nexodev/docs/references/Deploy custom instance to K8S.md`.
     *
     * Container-status:
     *   `underpost config get container-status` is read from each pod for both
     *   the display column and as a second ready gate alongside the K8S Ready
     *   condition. Both must be satisfied before the monitor exits:
     *     1. K8S readinessProbe (TCP socket) — ensures the port is bound.
     *     2. container-status == `<deploy>-<env>-running-deployment` — ensures
     *        the application has completed its own startup sequence.
     *   Early-abort on `error` container-status remains in effect: a failing
     *   runtime keeps its pod alive (not Ready) with `container-status=error`,
     *   so this `exec`-read surfaces the failure and the monitor aborts —
     *   failing the CD runner instead of waiting out the full timeout.
     *
     * @param {string} deployId - Deployment ID for which the ready status is being monitored.
     * @param {string} env - Environment for which the ready status is being monitored.
     * @param {string} targetTraffic - Target traffic status for the deployment.
     * @param {Array<string>} ignorePods - List of pod names to ignore.
     * @param {string} [namespace='default'] - Kubernetes namespace for the deployment.
     * @returns {object} - Object containing the ready status of the deployment.
     * @memberof UnderpostMonitor
     */
    async monitorReadyRunner(deployId, env, targetTraffic, ignorePods = [], namespace = 'default') {
      const delayMs = 1000;
      const maxIterations = 3000;
      const deploymentId = `${deployId}-${env}-${targetTraffic}`;
      const expectedContainerStatus = `${deployId}-${env}-running-deployment`;
      const tag = `[${deploymentId}]`;
      const containerStatusDefault = 'waiting for status';

      logger.info('Deployment init', { deployId, env, targetTraffic, namespace });

      const podStatusCache = new Map();
      const advancedPods = new Set();

      const readContainerStatus = (podName) => {
        try {
          const raw = shellExec(
            `sudo kubectl exec ${podName} -n ${namespace} -- sh -c 'underpost config get container-status --plain'`,
            { silent: true, disableLog: true, stdout: true, silentOnError: true },
          );
          const val = raw ? raw.toString().trim() : '';
          return val && val !== 'undefined' ? val : containerStatusDefault;
        } catch (_) {
          // exec failed (e.g. pod not yet running) — preserve last known value
          return podStatusCache.get(podName) || containerStatusDefault;
        }
      };

      for (let i = 0; i < maxIterations; i++) {
        const result = await Underpost.monitor.checkDeploymentReadyStatus(
          deployId,
          env,
          targetTraffic,
          ignorePods,
          namespace,
        );

        const allPods = [...result.readyPods, ...result.notReadyPods];

        for (const pod of allPods) {
          if (!pod?.NAME) continue;
          const podStatus = (pod.STATUS || '').toLowerCase().trim();
          if (
            ['error', 'crashloopbackoff', 'oomkilled', 'imagepullbackoff', 'errimagepull'].find((s) =>
              podStatus.match(s),
            )
          )
            throw new Error(`Pod ${pod.NAME} has error pod status: ${pod.STATUS}`);
          const status = readContainerStatus(pod.NAME);
          if (status === 'error') throw new Error(`Pod ${pod.NAME} has error container-status`);
          if (advancedPods.has(pod.NAME) && status === containerStatusDefault)
            throw new Error(`Pod ${pod.NAME} container-status regressed to default — pod likely restarted`);
          if (status !== containerStatusDefault) advancedPods.add(pod.NAME);
          podStatusCache.set(pod.NAME, status);
        }

        const allPodsK8sReady = allPods.length > 0 && result.notReadyPods.length === 0;

        const allPodsStatusReady =
          allPods.length > 0 && allPods.every((pod) => podStatusCache.get(pod.NAME) === expectedContainerStatus);

        // Print snapshot for every pod — annotate when container-status hasn't caught
        // up to the K8S Ready condition yet.
        for (const pod of allPods) {
          const status = podStatusCache.get(pod.NAME) || containerStatusDefault;
          const podStatus = pod.STATUS || 'Unknown';
          const statusMatchesExpected = status === expectedContainerStatus;
          const statusDisplay = statusMatchesExpected ? status : `${status} (pending)`;

          console.log(
            'Target pod:',
            pod.NAME[pod.NAME.includes('green') ? 'bgGreen' : 'bgBlue'].bold.black,
            '| Pod status:',
            podStatus.bold.yellow,
            '| Runtime status:',
            statusDisplay.bold.cyan,
          );
        }

        // Both K8S readinessProbe AND container-status must be satisfied before
        // declaring the deployment ready. The TCP probe ensures the port is bound;
        // container-status == running-deployment ensures the application has
        // completed its own startup sequence so traffic is not switched prematurely.
        if (allPodsK8sReady && allPodsStatusReady) {
          logger.info(`${tag} | All pods Ready (K8S readinessProbe satisfied)`);
          return result;
        }

        await timer(delayMs);

        if ((i + 1) % 10 === 0) {
          logger.info(`${tag} | In progress... iteration ${i + 1}`);
        }
      }

      logger.error(`${tag} | Deployment timeout after ${maxIterations} iterations`);
      throw new Error(
        `monitorReadyRunner timeout: ${deploymentId} did not become Ready within ${maxIterations}*${delayMs}ms`,
      );
    },
  };
}

export default UnderpostMonitor;
