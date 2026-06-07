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
  deployRangePortFactory,
} from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { timer } from '../client/components/core/CommonJs.js';
import {
  RUNTIME_STATUS,
  INTERNAL_STATUS_PATH,
  normalizeContainerStatus,
  deployStatusPort,
} from '../server/runtime-status.js';
import axios from 'axios';
import fs from 'fs-extra';
import net from 'node:net';
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
     * Resolves a free ephemeral TCP port on the loopback interface, used as the
     * local end of the `kubectl port-forward` tunnel so it never collides with
     * host-local services.
     * @returns {Promise<number>}
     * @memberof UnderpostMonitor
     */
    findFreePort() {
      return new Promise((resolve) => {
        const srv = net.createServer();
        srv.once('error', () => resolve(20000 + Math.floor(Math.random() * 20000)));
        srv.listen(0, '127.0.0.1', () => {
          const { port } = srv.address();
          srv.close(() => resolve(port));
        });
      });
    },
    /**
     * Resolves the deployment's internal status port (Phase-2 transport target).
     *
     * Canonical value is `fromPort - 1` from the deployment router — the exact
     * port `buildManifest` injects into the pod (UNDERPOST_INTERNAL_PORT) and
     * uses for the probes — so the tunnel target always matches the in-pod bind.
     * `UNDERPOST_INTERNAL_PORT` overrides; ambient resolution is the last resort.
     *
     * @param {string} deployId
     * @param {string} env
     * @returns {Promise<number>}
     * @memberof UnderpostMonitor
     */
    async deployInternalPort(deployId, env) {
      const override = parseInt(process.env.UNDERPOST_INTERNAL_PORT);
      if (!Number.isNaN(override)) return override;
      try {
        const router = await Underpost.deploy.routerFactory(deployId, env);
        const { fromPort } = deployRangePortFactory(router);
        if (Number.isFinite(fromPort) && fromPort > 0) return fromPort - 1;
      } catch (_) {
        /* fall through to ambient resolution */
      }
      return deployStatusPort(deployId, env) ?? 3000;
    },
    /**
     * Reads Phase-2 runtime status from a single pod using the selected transport.
     *
     *   - `exec` (default): `kubectl exec … underpost config get container-status`
     *     reads the env-file value. Synchronous, no background process — required
     *     for custom instances (cyberia-server/client) and the safe choice for
     *     CI/SSH. See `Deploy custom instance to K8S.md`.
     *   - `http`: port-forward to the in-pod `/_internal/status` endpoint served
     *     by the `underpost start` launcher (dd-* runtime deploys). Opt-in.
     *
     * Transport failures are reported as `{ ok: false }` and must never be read
     * as success — they are retried, not promoted.
     *
     * @param {string} podName
     * @param {string} namespace
     * @param {number} internalPort
     * @param {('http'|'exec')} [transport='exec']
     * @returns {Promise<{ok: boolean, status?: (string|null), transportError?: string}>}
     * @memberof UnderpostMonitor
     */
    async readRuntimeStatus(podName, namespace, internalPort, transport = 'exec') {
      return transport === 'exec'
        ? Underpost.monitor.readRuntimeStatusViaExec(podName, namespace)
        : Underpost.monitor.readRuntimeStatusViaHttp(podName, namespace, internalPort);
    },
    /**
     * Phase-2 read over `kubectl exec` (env-file transport). Works for any pod
     * whose image bakes the underpost CLI — notably custom instances that stamp
     * `container-status` from `lifecycle.postStart`/`preStop` hooks.
     * @param {string} podName
     * @param {string} namespace
     * @returns {{ok: boolean, status?: (string|null), transportError?: string}}
     * @memberof UnderpostMonitor
     */
    readRuntimeStatusViaExec(podName, namespace) {
      try {
        const raw = shellExec(
          `sudo kubectl exec ${podName} -n ${namespace} -- sh -c 'underpost config get container-status --plain'`,
          { silent: true, disableLog: true, stdout: true, silentOnError: true },
        );
        const status = normalizeContainerStatus(raw ? raw.toString().trim() : '');
        return status === undefined ? { ok: false, transportError: 'empty_status' } : { ok: true, status };
      } catch (error) {
        return { ok: false, transportError: error?.code || error?.message || 'exec_failed' };
      }
    },
    /**
     * Phase-2 read over `kubectl port-forward` + HTTP `/_internal/status`.
     *
     * The local side of the tunnel MUST be an ephemeral free port: pinning it to
     * internalPort collides with any host-local service on that number (e.g. a
     * dev runtime on the same machine as the cluster), making port-forward fail
     * to bind and every read return a false transport error.
     *
     * @param {string} podName
     * @param {string} namespace
     * @param {number} internalPort
     * @returns {Promise<{ok: boolean, status?: (string|null), transportError?: string}>}
     * @memberof UnderpostMonitor
     */
    async readRuntimeStatusViaHttp(podName, namespace, internalPort) {
      const override = parseInt(process.env.UNDERPOST_PF_LOCAL_PORT);
      const localPort = Number.isNaN(override) ? await Underpost.monitor.findFreePort() : override;
      const url = `http://127.0.0.1:${localPort}${INTERNAL_STATUS_PATH}`;
      let portForward;
      try {
        // `exec` makes the tracked child the sudo/kubectl process (so kill
        // reaches it); stdio is redirected to /dev/null so the tunnel never
        // inherits — and therefore never holds open — a CI/SSH session's pipes,
        // which would hang the job after a successful deploy.
        portForward = shellExec(
          `exec sudo kubectl port-forward pod/${podName} ${localPort}:${internalPort} -n ${namespace} </dev/null >/dev/null 2>&1`,
          { async: true, silent: true, disableLog: true, silentOnError: true },
        );
      } catch (_) {
        portForward = undefined;
      }
      try {
        let lastError;
        const attempts = parseInt(process.env.UNDERPOST_PF_ATTEMPTS) || 20;
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            const res = await axios.get(url, { timeout: 2500 });
            const raw = res?.data?.status ?? null;
            return { ok: true, status: normalizeContainerStatus(raw) ?? raw, payload: res.data };
          } catch (error) {
            lastError = error;
            await timer(350);
          }
        }
        return { ok: false, transportError: lastError?.code || lastError?.message || 'transport_failed' };
      } finally {
        if (portForward && typeof portForward.kill === 'function') {
          try {
            portForward.kill('SIGTERM');
          } catch (_) {
            /* tunnel already gone */
          }
        }
      }
    },
    /**
     * Monitors a deployment to terminal readiness using a deterministic
     * two-phase state machine.
     *
     *   Phase 1 (Kubernetes): pod `Ready` condition via `checkDeploymentReadyStatus`.
     *   Phase 2 (Runtime):    `container-status`, read via the selected transport.
     *
     * Two deployment shapes are supported via `options`:
     *   - `runtime` gate (default, dd-* deploys): the `underpost start` launcher
     *     stamps `running-deployment`. Success requires K8S Ready AND every pod
     *     reporting `running-deployment`.
     *   - `kubernetes` gate (custom instances, e.g. cyberia): the runtime is a
     *     bare binary; K8S `readinessProbe` (TCP) IS the running signal and
     *     `container-status` is stamped to `initializing`/`stopping` by lifecycle
     *     hooks. Success requires K8S Ready; the status read is used only for
     *     fast `error` detection and display.
     *
     * Phase-2 transport defaults to `exec` (`kubectl exec`, no background
     * process). The `http` transport (`kubectl port-forward` → `/_internal/status`)
     * is opt-in via `options.statusTransport='http'` or
     * `UNDERPOST_STATUS_TRANSPORT=http`; it must not be used in CI/SSH sessions
     * where a stray tunnel can hang the job.
     *
     * Contract (both shapes):
     *   - Runtime readiness is never declared before Kubernetes readiness.
     *   - An explicit runtime `error` (or a fatal pod status) transitions
     *     immediately to `failed` (throw → CD exit 1).
     *   - Transport failures never count as success and never advance state.
     *   - `timeout` is a distinct terminal state from `failed`.
     *   - Every transition emits a structured, secret-free event.
     *
     * @param {string} deployId - Deployment ID for which the ready status is being monitored.
     * @param {string} env - Environment for which the ready status is being monitored.
     * @param {string} targetTraffic - Target traffic status for the deployment.
     * @param {Array<string>} ignorePods - List of pod names to ignore.
     * @param {string} [namespace='default'] - Kubernetes namespace for the deployment.
     * @param {object} [options] - Monitoring shape.
     * @param {('runtime'|'kubernetes')} [options.readyGate='runtime'] - Running-signal owner.
     * @param {('http'|'exec')} [options.statusTransport='http'] - Phase-2 read transport.
     * @returns {object} - Object containing the ready status of the deployment.
     * @memberof UnderpostMonitor
     */
    async monitorReadyRunner(deployId, env, targetTraffic, ignorePods = [], namespace = 'default', options = {}) {
      const delayMs = parseInt(process.env.UNDERPOST_MONITOR_DELAY_MS) || 1000;
      const maxIterations = parseInt(process.env.UNDERPOST_MONITOR_MAX_ITERATIONS) || 3000;
      const deploymentId = `${deployId}-${env}-${targetTraffic}`;
      const tag = `[${deploymentId}]`;
      const expectedStatus = RUNTIME_STATUS.RUNNING;
      const readyGate = options.readyGate === 'kubernetes' ? 'kubernetes' : 'runtime';
      // Default to `exec`: a single synchronous `kubectl exec` read leaves no
      // background process behind. The `http` transport spawns `kubectl
      // port-forward` children that, if orphaned, inherit a CI/SSH session's
      // stdio and hang the job after a successful deploy — opt in explicitly.
      const statusTransport =
        (options.statusTransport || process.env.UNDERPOST_STATUS_TRANSPORT) === 'http' ? 'http' : 'exec';
      const internalPort =
        statusTransport === 'http' ? await Underpost.monitor.deployInternalPort(deployId, env) : null;
      const podErrorStates = ['error', 'crashloopbackoff', 'oomkilled', 'imagepullbackoff', 'errimagepull'];

      const emit = (state, status) =>
        logger.info('deploy-monitor', {
          deployId: deploymentId,
          phase: state.startsWith('runtime') ? 'runtime' : 'kubernetes',
          state,
          status: status ?? null,
          timestamp: new Date().toISOString(),
        });

      logger.info('Deployment init', {
        deployId,
        env,
        targetTraffic,
        namespace,
        internalPort,
        readyGate,
        statusTransport,
      });
      emit('pending');

      const runtimeStatusCache = new Map();
      const advancedPods = new Set();

      for (let i = 0; i < maxIterations; i++) {
        const result = await Underpost.monitor.checkDeploymentReadyStatus(
          deployId,
          env,
          targetTraffic,
          ignorePods,
          namespace,
        );
        const allPods = [...result.readyPods, ...result.notReadyPods];

        if (allPods.length === 0) {
          emit('pending');
          await timer(delayMs);
          continue;
        }
        emit('pod_scheduled');

        // Phase 1 fatal: a Kubernetes-level pod failure is terminal (failed,
        // not timeout) — fail the CD runner immediately instead of waiting out
        // the full window.
        for (const pod of allPods) {
          const podStatus = (pod.STATUS || '').toLowerCase().trim();
          if (podErrorStates.find((s) => podStatus.includes(s)))
            throw new Error(`Pod ${pod.NAME} has error pod status: ${pod.STATUS}`);
        }

        const allPodsK8sReady = result.notReadyPods.length === 0;
        if (allPodsK8sReady) emit('pod_ready');

        // Phase 2: runtime status via the selected transport. Transport failures
        // neither advance state nor count as success; explicit `error` is terminal.
        let allRuntimeRead = true;
        for (const pod of allPods) {
          if (!pod?.NAME) continue;
          const read = await Underpost.monitor.readRuntimeStatus(pod.NAME, namespace, internalPort, statusTransport);
          if (!read.ok) {
            allRuntimeRead = false;
            emit('runtime_booting', `transport:${read.transportError}`);
            continue;
          }
          const status = read.status;
          if (status === RUNTIME_STATUS.ERROR) throw new Error(`Pod ${pod.NAME} reported runtime status=error`);
          // Regression (advanced → empty/build) means a pod restarted. Under the
          // kubernetes gate the runtime never advances past `initializing`, so
          // only treat a drop to empty/build as a regression there.
          if (advancedPods.has(pod.NAME) && (!status || status === RUNTIME_STATUS.BUILD))
            throw new Error(`Pod ${pod.NAME} runtime status regressed (${status ?? 'empty'}) — pod likely restarted`);
          if (status && status !== RUNTIME_STATUS.BUILD) advancedPods.add(pod.NAME);
          runtimeStatusCache.set(pod.NAME, status);
          emit('runtime_booting', status);
        }

        // Under the kubernetes gate the readinessProbe is the running signal, so
        // K8S Ready alone confirms Phase 2; the status read above is kept only
        // for `error` fast-fail and display.
        const allRuntimeReady =
          readyGate === 'kubernetes'
            ? true
            : allRuntimeRead && allPods.every((pod) => runtimeStatusCache.get(pod.NAME) === expectedStatus);

        for (const pod of allPods) {
          const status = runtimeStatusCache.get(pod.NAME) || 'waiting for status';
          const podStatus = pod.STATUS || 'Unknown';
          const statusDisplay = status === expectedStatus ? status : `${status} (pending)`;
          console.log(
            'Target pod:',
            pod.NAME[pod.NAME.includes('green') ? 'bgGreen' : 'bgBlue'].bold.black,
            '| Pod status:',
            podStatus.bold.yellow,
            '| Runtime status:',
            statusDisplay.bold.cyan,
          );
        }

        // Terminal success requires both phases. runtime_ready cannot precede
        // Kubernetes readiness.
        if (allPodsK8sReady && allRuntimeReady) {
          const readySignal = readyGate === 'kubernetes' ? 'K8S readinessProbe' : `runtime ${expectedStatus}`;
          emit('runtime_ready', readyGate === 'kubernetes' ? 'k8s-ready' : expectedStatus);
          logger.info(`${tag} | Deployment ready (K8S Ready + ${readySignal})`);
          return result;
        }

        await timer(delayMs);
        if ((i + 1) % 10 === 0) logger.info(`${tag} | In progress... iteration ${i + 1}`);
      }

      emit('timeout');
      logger.error(`${tag} | Deployment timeout after ${maxIterations} iterations`);
      throw new Error(
        `monitorReadyRunner timeout: ${deploymentId} did not become Ready within ${maxIterations}*${delayMs}ms`,
      );
    },
  };
}

export default UnderpostMonitor;
