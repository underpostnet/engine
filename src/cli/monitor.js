/**
 * Monitor module for managing the monitoring of deployments and services.
 * @module src/cli/monitor.js
 * @namespace UnderpostMonitor
 */

import { loadReplicas, loadConfServerJson, etcHostFactory, clusterTypeFactory } from '../server/conf.js';
import {
  deployRangePortFactory,
  deployRoutesExists,
  pathPortAssignmentFactory,
  readDeployRoutes,
  resolveDeployList,
} from '../server/router.js';
import { cronDeployIdResolve, loadCronDeployEnv } from '../server/cron.js';
import { loggerFactory } from '../server/logger.js';
import { timer, generateRandomPasswordSelection } from '../client/components/core/CommonJs.js';
import {
  RUNTIME_STATUS,
  INTERNAL_STATUS_PATH,
  normalizeContainerStatus,
  deployStatusPort,
} from '../server/runtime-status.js';
import {
  UNDERPOST_MONITORING,
  alertRulesFactory,
  alertmanagerConfFactory,
  appScrapeEntriesFactory,
  blackboxConfFactory,
  deployedEventIdsFactory,
  grafanaAdminSecretFactory,
  grafanaDeploymentFactory,
  grafanaDeploymentPatchFactory,
  grafanaExposureFactory,
  grafanaNodePortFactory,
  grafanaResetPlanFactory,
  grafanaStorageResetRequiredFactory,
  monitoringConfigFactory,
  prometheusConfFactory,
  scrapeDeployListFactory,
  webhookSecretFactory,
} from '../server/monitoring.js';
import axios from 'axios';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'fs-extra';
import net from 'node:net';
import { shellExec } from '../server/process.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);
const grafanaAdminSyncState = new WeakMap();

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
     * @param {boolean} [options.observability=false] - Deploy or converge the Prometheus/Alertmanager/Blackbox/Grafana stack.
     * @param {boolean} [options.syncProm=false] - Regenerate the stack's configuration and reload it in place.
     * @param {boolean} [options.metricsServer=false] - Install the Kubernetes metrics-server.
     * @param {boolean} [options.cockpit=false] - Install and enable the Cockpit KVM dashboard on this host.
     * @param {boolean} [options.cockpitStop=false] - Stop and disable the Cockpit KVM dashboard.
     * @param {boolean} [options.exposeGrafana=false] - Republish Grafana without touching the rest of the stack.
     * @param {string} [options.grafanaHost=''] - Hostname to publish Grafana under, at `/grafana`.
     * @param {boolean} [options.nodePort=false] - Publish Grafana on the node's LAN address.
     * @param {boolean} [options.webhookToken=false] - Print the shared event webhook token and exit.
     * @param {string} [options.events=''] - Comma-separated event ids to provision; empty selects every registered event.
     * @param {string} [options.webhookUrl=''] - URL Alertmanager delivers events to.
     * @param {string} [options.extraTargets=''] - Comma-separated additional `host:port` scrape targets.
     * @param {string} [options.nodeName=''] - Strict workload node; moving Grafana resets its local data.
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
        observability: false,
        syncProm: false,
        metricsServer: false,
        cockpit: false,
        cockpitStop: false,
        exposeGrafana: false,
        grafanaHost: '',
        nodePort: false,
        webhookToken: false,
        events: '',
        webhookUrl: '',
        extraTargets: '',
        nodeName: '',
      },
      commanderOptions,
      auxRouter,
    ) {
      loadCronDeployEnv();
      if (!options.namespace) options.namespace = 'default';
      if (!options.replicas) options.replicas = '1';

      // Host- and cluster-scoped operations: none of them act on one deploy, so
      // they resolve before the per-deploy health loop rather than inside it.
      // `deploy-id` only selects which deploys the stack scrapes.
      if (options.webhookToken) return console.log(Underpost.monitor.eventWebhookTokenFactory());
      if (options.cockpit || options.cockpitStop) return Underpost.monitor.cockpit({ stop: !!options.cockpitStop });
      if (options.exposeGrafana) return Underpost.monitor.exposeGrafana(options);
      if (options.metricsServer) return await Underpost.monitor.deployMetricsServer(options);
      if (options.observability) return await Underpost.monitor.deployObservability({ ...options, deployId });
      if (options.syncProm) return await Underpost.monitor.syncObservability({ ...options, deployId });
      if (deployId === 'dd' && deployRoutesExists()) {
        for (const _deployId of readDeployRoutes())
          Underpost.monitor.callback(
            _deployId,
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
        const currentTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace, env });
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
     * @method observabilityDeployListFactory
     * @description The deploys the stack scrapes.
     *
     * Reads the two router files and hands the selection to
     * {@link UnderpostMonitoring.scrapeDeployListFactory}, which owns the rule:
     * the default set is `dd.cron` plus `dd.routes`, exactly what
     * `loadCronDeployEnv()` loads.
     * @param {string} [deployId] - Deploy id, comma-separated list, or `dd`/empty for the default set.
     * @returns {string[]} Distinct deploy ids.
     * @memberof UnderpostMonitor
     */
    observabilityDeployListFactory(deployId = '') {
      return scrapeDeployListFactory({
        deployId,
        cronDeployId: cronDeployIdResolve(),
        routerDeployIds: resolveDeployList('dd'),
      });
    },

    /**
     * @method observabilityContextFactory
     * @description Resolves everything the observability stack is rendered from:
     * the Express runtimes to scrape, the events to alert on, and the address
     * Alertmanager delivers to.
     *
     * Scrape targets come from the same `conf.server.json` the runtime binds and
     * probe targets from the event registry, so a host or an event is either
     * deployed and observed or neither. Nothing here is stored — a re-run
     * reflects the configuration as it is now.
     * @param {object} [options]
     * @param {string} [options.deployId='dd'] - Deploy id, comma-separated list, or `dd` for the whole router.
     * @param {string} [options.events=''] - Comma-separated event ids; empty selects every registered event.
     * @param {string} [options.namespace='default'] - Namespace holding the stack.
     * @param {string} [options.webhookUrl=''] - Explicit dispatcher URL; resolved from the node otherwise.
     * @param {string} [options.extraTargets=''] - Comma-separated additional `host:port` scrape targets.
     * @param {string} [options.hosts=''] - Comma-separated hostnames scraped at `/metrics` alongside the configured ones.
     * @param {boolean} [options.dev=false] - Development environment (scrapes over HTTP).
     * @returns {object} Render context.
     * @memberof UnderpostMonitor
     */
    observabilityContextFactory(options = {}) {
      const namespace = options.namespace || 'default';
      const deployIds = Underpost.monitor.observabilityDeployListFactory(options.deployId);
      const scheme = options.dev ? 'http' : 'https';

      const appTargets = [];
      for (const deployId of deployIds) {
        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        if (!fs.existsSync(confServerPath)) {
          logger.warn('Deploy has no server configuration; skipping its scrape targets', { deployId });
          continue;
        }
        appTargets.push(...appScrapeEntriesFactory(loadConfServerJson(confServerPath), { scheme }));
      }

      for (const host of `${options.hosts || ''}`
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean))
        appTargets.push({ host, metricsPath: '/metrics', scheme });

      const events = Underpost.event.assertDispatchReady(Underpost.event.definitions(options.events || ''));
      const probes = events.flatMap((event) => event.probes);
      const extraTargets = `${options.extraTargets || ''}`
        .split(',')
        .map((target) => target.trim())
        .filter(Boolean);

      return {
        namespace,
        deployIds,
        appTargets,
        extraTargets,
        events,
        probes,
        token: options.token || Underpost.monitor.eventWebhookTokenFactory(),
        webhookUrl: options.webhookUrl || Underpost.monitor.eventWebhookUrlFactory(options),
      };
    },

    /**
     * @method eventWebhookTokenFactory
     * @description The bearer token Alertmanager presents to the event
     * dispatcher, minted on first use.
     *
     * The webhook triggers root-equivalent remediation on the edge from an
     * unauthenticated POST, so the stack is never provisioned without one.
     *
     * Two machines have to agree on it: the cluster provisions the Alertmanager
     * Secret, and the hub runs the receiver that validates what Alertmanager
     * sends. So the deploy environment wins over the machine-local root env
     * store — `engine-private` is shared, and a token written there reaches both
     * sides on the next pull. A token minted here is machine-local by
     * definition, which is why minting says so.
     * @returns {string} Shared bearer token.
     * @memberof UnderpostMonitor
     */
    eventWebhookTokenFactory() {
      const shared =
        process.env.UNDERPOST_EVENT_TOKEN ||
        Underpost.env.get('UNDERPOST_EVENT_TOKEN', undefined, { disableLog: true });
      if (shared) return shared;
      const token = generateRandomPasswordSelection(48);
      Underpost.env.set('UNDERPOST_EVENT_TOKEN', token);
      logger.warn('Minted a machine-local event webhook token', {
        hint: 'persist it as UNDERPOST_EVENT_TOKEN in the cron deploy env so the hub receiver shares it',
        read: 'node bin monitor --webhook-token',
      });
      return token;
    },

    /**
     * @method eventWebhookUrlFactory
     * @description Address the cluster reaches the event dispatcher at.
     *
     * Never a Service: the dispatcher runs on a host, because remediation needs
     * the engine checkout and the SSH key store and neither exists in a pod.
     * Which host, and therefore which address, follows the topology:
     *
     * The dispatcher belongs to the control plane. On kubeadm and K3s the
     * kubelet runs on that machine, so the node's
     *     InternalIP is the host. On Kind each node is a Docker container on its
     *     own bridge, so the node InternalIP is the container and the bridge
     *     gateway is the host.
     * @param {object} [options] - Cluster options (`kind`, `kubeadm`, `k3s`, `dev`).
     * @returns {string} Webhook URL.
     * @memberof UnderpostMonitor
     */
    eventWebhookUrlFactory(options = {}) {
      const { port, path } = UNDERPOST_MONITORING.eventWebhook;
      const read = (command) =>
        `${shellExec(command, { stdout: true, silent: true, silentOnError: true, disableLog: true }) || ''}`
          .trim()
          .split(/\s+/)[0];

      const host =
        clusterTypeFactory(options, options.dev ? 'kind' : 'kubeadm') === 'kind'
          ? read(`docker network inspect kind -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}'`)
          : Underpost.monitor.nodeInternalIp(options.nodeName);

      if (!host)
        logger.warn('Host address for the event webhook is unresolved; pass --webhook-url to set it explicitly');
      return `http://${host || '127.0.0.1'}:${port}${path}`;
    },

    /** Reads a live Grafana admin Secret without emitting its data. */
    grafanaAdminSecretState(namespace = 'default') {
      const { adminSecretName, adminUserKey, adminPasswordKey } = UNDERPOST_MONITORING.grafana;
      const source = shellExec(`kubectl get secret ${adminSecretName} -n ${namespace} --ignore-not-found -o json`, {
        stdout: true,
        silent: true,
        silentOnError: true,
        disableLog: true,
      });
      if (!`${source || ''}`.trim()) return null;
      const secret = JSON.parse(source);
      const decode = (key) => Buffer.from(`${secret.data?.[key] || ''}`, 'base64').toString('utf8');
      return {
        username: decode(adminUserKey),
        password: decode(adminPasswordKey),
        resourceVersion: `${secret.metadata?.resourceVersion || ''}`,
      };
    },

    /** Resolves and applies the dedicated Grafana admin Secret. */
    syncGrafanaAdminSecret(options = {}) {
      const namespace = options.namespace || 'default';
      const { grafana } = UNDERPOST_MONITORING;
      const envCredentials = Underpost.secret.grafanaAdmin({ ...options, required: false });
      const stored = Underpost.secret.sops.has(grafana.adminSecretName, namespace);
      const data = stored
        ? Underpost.secret.sops.readData(grafana.adminSecretName, namespace)
        : {
            [grafana.adminUserKey]: envCredentials.username,
            [grafana.adminPasswordKey]: envCredentials.password,
          };
      const desired = {
        username: `${data[grafana.adminUserKey] || ''}`.trim(),
        password: `${data[grafana.adminPasswordKey] || ''}`,
        email: envCredentials.email,
      };
      if (!desired.username || !desired.password)
        throw new Error(
          `[grafana] ${stored ? grafana.adminSecretName : envCredentials.envPath} must define ` +
            `${grafana.adminUserKey} and ${grafana.adminPasswordKey}`,
        );

      const previous = Underpost.monitor.grafanaAdminSecretState(namespace);
      const deploymentSource = shellExec(`kubectl get deployment ${grafana.name} -n ${namespace} -o json`, {
        stdout: true,
        silent: true,
        silentOnError: true,
        disableLog: true,
      });
      const deployment = `${deploymentSource || ''}`.trim() ? JSON.parse(deploymentSource) : null;
      const deploymentContainer = deployment?.spec?.template?.spec?.containers?.find(
        ({ name }) => name === grafana.name,
      );
      const deploymentLogin =
        deploymentContainer?.env?.find(({ name }) => name === 'GF_SECURITY_ADMIN_USER')?.value || '';
      const recordedLogin = deployment?.metadata?.annotations?.[grafana.adminLoginAnnotation] || '';
      const previousLogin = recordedLogin || deploymentLogin || previous?.username || 'admin';
      if (deployment && !recordedLogin)
        shellExec(
          `kubectl patch deployment ${grafana.name} -n ${namespace} --type merge --patch-file=/dev/stdin <<'EOF'
${JSON.stringify({ metadata: { annotations: { [grafana.adminLoginAnnotation]: previousLogin } } })}
EOF
`,
          { silent: true, disableLog: true },
        );

      if (stored) Underpost.secret.sops.applyIfPresent(grafana.adminSecretName, namespace, { quiet: true });
      else
        shellExec(
          `kubectl apply -f - <<'EOF'
${grafanaAdminSecretFactory({ ...desired, namespace })}
EOF
`,
          { silent: true, disableLog: true },
        );

      const current = Underpost.monitor.grafanaAdminSecretState(namespace);
      if (!current?.username || !current?.password)
        throw new Error(`[grafana] secret/${grafana.adminSecretName} is missing its credential keys`);
      logger.info('Grafana admin Secret synchronized', {
        namespace,
        source: stored ? 'sops' : 'cron-env',
        changed: previous?.username !== current.username || previous?.password !== current.password,
        resourceVersion: current.resourceVersion,
        deploymentExists: Boolean(deployment),
        emailConfigured: Boolean(desired.email),
      });
      return {
        desired: { ...desired, username: current.username, password: current.password },
        previousLogin,
        resourceVersion: current.resourceVersion,
        deploymentExists: Boolean(deployment),
        deployment,
        changed: previous?.username !== current.username || previous?.password !== current.password,
      };
    },

    /** Converges the admin account stored in Grafana's PVC onto the Secret. */
    async reconcileGrafanaAdmin({ namespace = 'default', desired, previousLogin = '' } = {}) {
      const { grafana } = UNDERPOST_MONITORING;
      const localPort = await Underpost.monitor.findFreePort();
      let portForward;
      let authenticationDiagnostics = {};
      try {
        logger.info('Reconciling Grafana administrator', {
          namespace,
          desiredLogin: desired.username,
          previousLogin,
          emailConfigured: Boolean(desired.email),
        });
        portForward = shellExec(
          `exec kubectl port-forward deployment/${grafana.name} ${localPort}:${grafana.port} -n ${namespace} ` +
            `</dev/null >/dev/null 2>&1`,
          { async: true, silent: true, disableLog: true, silentOnError: true },
        );

        const paths = ['', grafana.subPath];
        const logins = [...new Set([desired.username, previousLogin].filter(Boolean))];
        const authenticate = async () => {
          const diagnostics = {};
          for (let attempt = 0; attempt < 20; attempt++) {
            for (const prefix of paths) {
              for (const username of logins) {
                try {
                  const response = await axios.get(`http://127.0.0.1:${localPort}${prefix}/api/user`, {
                    auth: { username, password: desired.password },
                    timeout: 2500,
                  });
                  if (response.data?.id) return { prefix, username, user: response.data };
                } catch (error) {
                  diagnostics[`${prefix || '/'}:${username}`] =
                    error.response?.status || error.code || 'request-failed';
                }
              }
            }
            await timer(350);
          }
          authenticationDiagnostics = diagnostics;
          return null;
        };

        let session = await authenticate();
        if (!session) {
          logger.warn('Grafana API authentication failed; resetting admin user ID 1 from the mounted Secret', {
            attempts: authenticationDiagnostics,
          });
          shellExec(
            `kubectl exec deployment/${grafana.name} -n ${namespace} -- sh -c ` +
              `'printf "%s" "$GF_SECURITY_ADMIN_PASSWORD" | grafana cli ` +
              `--homepath "\${GF_PATHS_HOME:-/usr/share/grafana}" ` +
              `--config "\${GF_PATHS_CONFIG:-/etc/grafana/grafana.ini}" ` +
              `--configOverrides "cfg:default.paths.data=\${GF_PATHS_DATA:-/var/lib/grafana}" ` +
              `admin reset-admin-password --password-from-stdin'`,
            { silent: true, disableLog: true },
          );
          logger.info('Grafana CLI password reset completed', { userId: 1 });
          session = await authenticate();
        }
        if (!session) {
          logger.error('Grafana administrator authentication still fails after the CLI reset', {
            attempts: authenticationDiagnostics,
            hint: 'verify auth.basic is enabled and inspect the Grafana pod logs',
          });
          throw new Error('[grafana] unable to authenticate the persisted administrator account');
        }

        const auth = { username: session.username, password: desired.password };
        const profile = {
          login: desired.username,
          name: session.user.name || desired.username,
          email: desired.email || session.user.email || '',
          theme: session.user.theme || '',
        };
        if (session.user.login !== profile.login || session.user.email !== profile.email)
          await axios.put(`http://127.0.0.1:${localPort}${session.prefix}/api/users/${session.user.id}`, profile, {
            auth,
            timeout: 5000,
          });
        if (!session.user.isGrafanaAdmin)
          await axios.put(
            `http://127.0.0.1:${localPort}${session.prefix}/api/admin/users/${session.user.id}/permissions`,
            { isGrafanaAdmin: true },
            { auth: { username: desired.username, password: desired.password }, timeout: 5000 },
          );
        logger.info('Grafana administrator reconciled', {
          userId: session.user.id,
          login: desired.username,
          profileUpdated: session.user.login !== profile.login || session.user.email !== profile.email,
          permissionUpdated: !session.user.isGrafanaAdmin,
        });
        shellExec(
          `kubectl patch deployment ${grafana.name} -n ${namespace} --type merge --patch-file=/dev/stdin <<'EOF'
${JSON.stringify({ metadata: { annotations: { [grafana.adminLoginAnnotation]: desired.username } } })}
EOF
`,
          { silent: true, disableLog: true },
        );
      } catch (error) {
        if (`${error?.message || ''}`.startsWith('[grafana]')) throw error;
        throw new Error('[grafana] failed to synchronize the persisted administrator account');
      } finally {
        if (portForward && typeof portForward.kill === 'function') {
          try {
            portForward.kill('SIGTERM');
          } catch (_) {}
        }
      }
    },

    /**
     * @method ensureObservabilityPrerequisites
     * @description Verifies the cluster resources the stack depends on, and
     * provisions the ones this CLI owns.
     *
     * Cluster DNS is verified rather than installed: the Envoy job and every
     * component address is a `.svc.cluster.local` name, so without CoreDNS the
     * stack comes up green and scrapes nothing. It belongs to the cluster
     * runtime (kubeadm, K3s, Kind), so a missing one is reported, not patched
     * over. The Gateway API control plane is installed when absent, because
     * `cluster --gateway-api` is the same command that would otherwise be run
     * by hand.
     * @param {object} [options]
     * @param {boolean} [options.dev=false] - Use the in-repo CLI rather than the global install.
     * @returns {boolean} True when the stack has everything it needs.
     * @memberof UnderpostMonitor
     */
    ensureObservabilityPrerequisites(options = {}) {
      const exists = (command) =>
        Boolean(shellExec(command, { stdout: true, silent: true, silentOnError: true, disableLog: true })?.trim());

      const clusterDns = exists(`kubectl get deployment -n kube-system -l k8s-app=kube-dns -o name`);
      if (!clusterDns) {
        logger.error('Cluster DNS (CoreDNS/kube-dns) is not present', {
          hint: 'the stack addresses every component by svc.cluster.local name; initialize the cluster first',
        });
        return false;
      }
      shellExec(`kubectl rollout status deployment -n kube-system -l k8s-app=kube-dns --timeout=3m`, {
        silentOnError: true,
      });

      const { namespace: envoyNamespace } = UNDERPOST_MONITORING.envoy;
      if (!exists(`kubectl get deployment envoy-gateway -n ${envoyNamespace} -o name`)) {
        logger.info('Envoy Gateway is absent; installing the Gateway API control plane', { envoyNamespace });
        shellExec(`${options.dev ? 'node bin' : 'underpost'} cluster${options.dev ? ' --dev' : ''} --gateway-api`);
      }
      if (!exists(`kubectl get deployment envoy-gateway -n ${envoyNamespace} -o name`))
        logger.warn('Envoy Gateway is still absent; its metrics job will discover no targets', { envoyNamespace });

      Underpost.cluster.ensureLocalPathProvisioner();

      return true;
    },

    /**
     * @method syncObservability
     * @description Renders the stack's configuration from the live deploy
     * configuration and event registry, applies it, and reloads the running
     * components.
     *
     * This is the single provisioning path: `monitor --observability`,
     * `monitor --sync-prom` and `event <id> --deploy` all land here, so the
     * scrape config, the alert rules and the Alertmanager route can never be
     * generated by two implementations that disagree.
     * @param {object} [options] - See `observabilityContextFactory`.
     * @returns {Promise<object>} The applied context.
     * @memberof UnderpostMonitor
     */
    async syncObservability(options = {}) {
      const context = Underpost.monitor.observabilityContextFactory(options);
      const { namespace, appTargets, extraTargets, probes, events, webhookUrl, token } = context;
      const grafanaAdmin = Underpost.monitor.syncGrafanaAdminSecret({ ...options, namespace });

      const stamp = (conf) =>
        `# generated: ${crypto.createHash('sha1').update(conf).digest('hex').slice(0, 12)}\n${conf}`;
      // The hub runs the collector but is not a cluster node, so node discovery
      // cannot find it; it is scraped at the tunnel address topology records.
      const hostTargets = Underpost.event
        .hubs()
        .map((hub) => hub.address)
        .filter(Boolean);
      const prometheusConf = stamp(
        prometheusConfFactory({
          appTargets,
          extraTargets,
          probes,
          hostTargets,
          nodeRoles: Underpost.event.clusterNodes(),
          namespace,
        }),
      );
      const alertmanagerConf = stamp(alertmanagerConfFactory({ webhookUrl }));

      // disableLog: shellExec echoes the command, and this heredoc carries the
      // webhook token.
      shellExec(
        `kubectl apply -f - <<'EOF'
${webhookSecretFactory({ token, namespace })}
EOF
`,
        { disableLog: true, silent: true },
      );

      shellExec(`kubectl apply -f - <<'EOF'
${monitoringConfigFactory({
  namespace,
  prometheusConf,
  alertRules: alertRulesFactory(events),
  alertmanagerConf,
  blackboxConf: blackboxConfFactory(),
})}
EOF
`);

      const { prometheus, alertmanager, blackbox } = UNDERPOST_MONITORING;
      const marker = (conf) => conf.split('\n')[0];
      const prometheusReloaded = await Underpost.monitor.reloadMonitoringComponent({
        name: prometheus.name,
        namespace,
        file: '/etc/prometheus/prometheus.yml',
        marker: marker(prometheusConf),
      });
      // Planned-maintenance event suspension/resumption must not proceed while
      // a running Prometheus still evaluates its previous rules. No pod is safe:
      // the applied ConfigMap is what a future pod reads. A refused reload is not.
      if (options.requireEventReload && prometheusReloaded === false)
        throw new Error('[observability] running Prometheus did not accept the event configuration reload');
      await Underpost.monitor.reloadMonitoringComponent({
        name: alertmanager.name,
        namespace,
        file: '/etc/alertmanager/alertmanager.yml',
        marker: marker(alertmanagerConf),
      });
      await Underpost.monitor.reloadMonitoringComponent({ name: blackbox.name, namespace });

      if (grafanaAdmin.deploymentExists && !options.deferGrafanaAdmin) {
        const container = grafanaAdmin.deployment.spec.template.spec.containers.find(
          ({ name }) => name === UNDERPOST_MONITORING.grafana.name,
        );
        const env = Object.fromEntries((container?.env || []).map((entry) => [entry.name, entry.value]));
        const exposure = {
          rootUrl: env.GF_SERVER_ROOT_URL || grafanaExposureFactory({}).rootUrl,
          subPath: env.GF_SERVER_SERVE_FROM_SUB_PATH === 'true',
        };
        const patch = grafanaDeploymentPatchFactory({
          exposure,
          nodeName: grafanaAdmin.deployment.spec.template.spec.nodeSelector?.['kubernetes.io/hostname'] || '',
          adminSecretVersion: grafanaAdmin.resourceVersion,
        });
        shellExec(`kubectl patch deployment ${UNDERPOST_MONITORING.grafana.name} -n ${namespace} --type strategic --patch-file=/dev/stdin <<'EOF'
${JSON.stringify(patch)}
EOF
`);
        Underpost.monitor.waitForObservabilityDeployment({ name: UNDERPOST_MONITORING.grafana.name, namespace });
        await Underpost.monitor.reconcileGrafanaAdmin({ namespace, ...grafanaAdmin });
      } else if (options.deferGrafanaAdmin) grafanaAdminSyncState.set(context, grafanaAdmin);

      logger.info('Observability configuration synced', {
        namespace,
        deployIds: context.deployIds,
        scrapeTargets: appTargets.length + extraTargets.length,
        events: events.map((event) => event.id),
        webhookUrl,
        grafanaAdminSecret: UNDERPOST_MONITORING.grafana.adminSecretName,
      });
      return context;
    },

    /**
     * @method reloadMonitoringComponent
     * @description Reloads one component in place, once the ConfigMap it mounts
     * has actually reached its pod.
     *
     * kubelet projects an updated ConfigMap on its own schedule — up to a minute
     * — so reloading immediately after `kubectl apply` re-reads the previous
     * file and reports success. The generated `# generated:` stamp is polled
     * inside the container first, which makes the wait observable rather than
     * a fixed sleep.
     *
     * The reload is SIGHUP to PID 1, which all three Prometheus-project binaries
     * honour and which needs nothing from the image beyond `kill`. Their HTTP
     * reload endpoint would need a POST client the busybox-based images do not
     * reliably ship. Reloading in place is what keeps Prometheus' in-memory
     * series: the TSDB is an emptyDir, so a rollout restart would discard every
     * sample collected so far.
     * @param {object} params
     * @param {string} params.name - Workload/app label.
     * @param {string} [params.namespace='default'] - Namespace holding it.
     * @param {string} [params.file] - Mounted config path to poll.
     * @param {string} [params.marker] - Line that must appear in that file.
     * @param {number} [params.timeoutMs=120000] - Maximum wait for projection.
     * @returns {Promise<boolean|null>} True when reloaded, false on a failed
     * reload, and null when no running pod exists (the next pod reads the
     * already-applied ConfigMap at startup).
     * @memberof UnderpostMonitor
     */
    async reloadMonitoringComponent({ name, namespace = 'default', file = '', marker = '', timeoutMs = 120000 }) {
      const pod = shellExec(`kubectl get pods -n ${namespace} -l app=${name} -o jsonpath='{.items[0].metadata.name}'`, {
        stdout: true,
        silent: true,
        silentOnError: true,
        disableLog: true,
      })
        .toString()
        .trim();
      if (!pod) {
        logger.warn('Component is not running; its configuration is applied and will be read at start', { name });
        return null;
      }

      const exec = (command) =>
        shellExec(`kubectl exec ${pod} -n ${namespace} -- ${command}`, {
          stdout: false,
          silent: true,
          silentOnError: true,
          disableLog: true,
        });

      if (file && marker) {
        const deadline = Date.now() + timeoutMs;
        let projected = false;
        while (Date.now() < deadline) {
          if (exec(`grep -qF '${marker}' ${file}`).code === 0) {
            projected = true;
            break;
          }
          await timer(3000);
        }
        if (!projected) {
          logger.warn('Configuration has not reached the pod yet; skipping reload', { name, file });
          return false;
        }
      }

      const reload = exec(`kill -HUP 1`);
      if (reload.code !== 0) {
        logger.warn('Reload signal was refused; the component keeps its previous configuration', {
          name,
          stderr: `${reload.stderr || ''}`.slice(-200),
        });
        return false;
      }
      logger.info('Component reloaded', { name, pod });
      return true;
    },

    /**
     * @method deployObservability
     * @description Installs or converges the whole stack: Prometheus,
     * Alertmanager, the Blackbox Exporter and Grafana, then renders their
     * configuration from the live deploy configuration and event registry.
     *
     * Idempotent and re-runnable: workloads are applied, never deleted first, so
     * a re-run on a healthy cluster is a no-op for the pods and a refresh for
     * the configuration.
     *
     * `--node-name` pins every component. Moving Grafana resets its node-local
     * volume before the replacement is created.
     * @param {object} [options] - See `observabilityContextFactory`.
     * @param {string} [options.nodeName] - Strict workload node; moving Grafana resets its local data.
     * @param {string} [options.grafanaHost] - Hostname to publish Grafana under, at `/grafana`.
     * @param {boolean} [options.nodePort] - Publish Grafana on the node's LAN address.
     * @returns {Promise<object|undefined>} The applied context, or undefined when prerequisites are missing.
     * @memberof UnderpostMonitor
     */
    async deployObservability(options = {}) {
      const namespace = options.namespace || 'default';
      const manifestsRoot = Underpost.monitor.observabilityManifestsRoot();
      const { grafana } = UNDERPOST_MONITORING;
      const pinnable = [
        UNDERPOST_MONITORING.prometheus.name,
        UNDERPOST_MONITORING.alertmanager.name,
        UNDERPOST_MONITORING.blackbox.name,
      ];

      if (!Underpost.monitor.ensureObservabilityPrerequisites(options)) return undefined;
      const nodeName = Underpost.monitor.resolveObservabilityNode(options.nodeName);
      Underpost.monitor.resetGrafanaForNode({ namespace, nodeName });

      // Configuration first: every workload below mounts a ConfigMap, and a pod
      // admitted before its ConfigMap exists stays pending until kubelet
      // re-resolves the volume.
      const context = await Underpost.monitor.syncObservability({
        ...options,
        namespace,
        deferGrafanaAdmin: true,
      });
      const grafanaAdmin = grafanaAdminSyncState.get(context);

      for (const manifest of ['prometheus', 'alertmanager', 'blackbox-exporter'])
        shellExec(`kubectl apply -f ${manifestsRoot}/${manifest}/deployment.yaml -n ${namespace}`);

      Underpost.monitor.pinWorkloads({ names: pinnable, namespace, nodeName });
      Underpost.monitor.applyGrafanaResources({ manifestsRoot, namespace });
      const exposure = Underpost.monitor.exposeGrafana({
        ...options,
        namespace,
        nodeName,
        patchDeployment: false,
      });
      Underpost.monitor.applyGrafanaDeployment({
        manifestsRoot,
        namespace,
        nodeName,
        exposure,
        adminSecretVersion: grafanaAdmin.resourceVersion,
      });

      for (const name of [...pinnable, grafana.name])
        Underpost.monitor.waitForObservabilityDeployment({ name, namespace });
      await Underpost.monitor.reconcileGrafanaAdmin({ namespace, ...grafanaAdmin });
      grafanaAdminSyncState.delete(context);

      logger.info('Observability stack deployed', {
        grafanaUrl: exposure.url,
        namespace,
        clusterType: clusterTypeFactory(options, options.dev ? 'kind' : 'kubeadm'),
        nodeName: nodeName || '(scheduler)',
        grafana: `http://${UNDERPOST_MONITORING.grafana.name}.${namespace}.svc.cluster.local:${UNDERPOST_MONITORING.grafana.port}`,
        prometheus: `http://${UNDERPOST_MONITORING.prometheus.name}.${namespace}.svc.cluster.local:${UNDERPOST_MONITORING.prometheus.port}`,
        events: context.events.map((event) => event.id),
      });
      return context;
    },

    /** Resolves and validates an explicit observability workload node. */
    resolveObservabilityNode(nodeName = '') {
      nodeName = `${nodeName || ''}`.trim();
      if (!nodeName) return '';
      const { node, corrected } = Underpost.deploy.resolveSchedulableNode({ node: nodeName });
      if (corrected)
        throw new Error(`[monitor] --node-name ${nodeName} is not a node in this cluster (schedulable: ${node})`);
      return node;
    },

    /** Returns Grafana's bound volume and its node affinity. */
    grafanaVolume(namespace = 'default') {
      const { pvcName } = UNDERPOST_MONITORING.grafana;
      const read = (command) =>
        `${shellExec(command, { stdout: true, silent: true, silentOnError: true, disableLog: true }) || ''}`.trim();
      const boundName = read(`kubectl get pvc ${pvcName} -n ${namespace} -o jsonpath='{.spec.volumeName}'`);
      const pvList = read('kubectl get pv -o json');
      const volumes = pvList ? JSON.parse(pvList).items || [] : [];
      const volume = volumes.find(
        ({ metadata, spec }) =>
          metadata.name === boundName || (spec.claimRef?.name === pvcName && spec.claimRef?.namespace === namespace),
      );
      const nodes = (volume?.spec.nodeAffinity?.required?.nodeSelectorTerms || []).flatMap((term) =>
        (term.matchExpressions || [])
          .filter(({ key }) => key === 'kubernetes.io/hostname')
          .flatMap(({ values }) => values || []),
      );
      return { name: volume?.metadata.name || '', nodes };
    },

    /** Removes Grafana and its local data before moving it to another node. */
    resetGrafanaForNode({ namespace = 'default', nodeName = '' } = {}) {
      const volume = Underpost.monitor.grafanaVolume(namespace);
      if (!grafanaStorageResetRequiredFactory({ nodeName, volumeNodes: volume.nodes })) return false;
      const plan = grafanaResetPlanFactory(volume.name);

      logger.warn('Resetting Grafana to move its local storage', {
        from: volume.nodes,
        to: nodeName,
        dataLoss: true,
      });
      const remove = (resource, options = '') =>
        shellExec(
          `kubectl delete ${resource} -n ${namespace} --ignore-not-found --wait=true --timeout=3m ${options}`.trim(),
        );
      for (const controller of plan.controllers) remove(controller, '--cascade=foreground');
      for (const resource of plan.resources) remove(resource);

      if (plan.volumeName)
        shellExec(
          `kubectl patch pv ${plan.volumeName} --type merge -p '{"spec":{"persistentVolumeReclaimPolicy":"Delete"}}'`,
        );
      remove(plan.claim);
      if (plan.volumeName)
        shellExec(`kubectl delete pv ${plan.volumeName} --ignore-not-found --wait=true --timeout=3m`);

      logger.info('Grafana reset completed', { nodeName, removedVolume: plan.volumeName });
      return true;
    },

    /** Applies Grafana with placement and URL settings in its initial pod template. */
    applyGrafanaDeployment({ manifestsRoot, namespace = 'default', nodeName = '', exposure, adminSecretVersion = '' }) {
      const source = shellExec(`kubectl create --dry-run=client -f ${manifestsRoot}/grafana/deployment.yaml -o json`, {
        stdout: true,
        silent: true,
        disableLog: true,
      });
      const deployment = grafanaDeploymentFactory({
        deployment: JSON.parse(source),
        exposure,
        namespace,
        nodeName,
        adminSecretVersion,
      });
      shellExec(
        `kubectl apply -f - <<'EOF'
${JSON.stringify(deployment)}
EOF
`,
        { disableLog: true },
      );
    },

    /** Applies Grafana's storage and internal Service. */
    applyGrafanaResources({ manifestsRoot, namespace = 'default' }) {
      for (const resource of ['storage-class.yaml', 'pvc.yaml', 'service.yaml'])
        shellExec(`kubectl apply -f ${manifestsRoot}/grafana/${resource} -n ${namespace}`);
    },

    /** Waits for a stack Deployment and prints actionable diagnostics on failure. */
    waitForObservabilityDeployment({ name, namespace = 'default' }) {
      const rollout = shellExec(`kubectl rollout status deployment/${name} -n ${namespace} --timeout=5m`, {
        silentOnError: true,
      });
      if (rollout.code === 0) return;
      shellExec(`kubectl get pods -n ${namespace} -l app=${name} -o wide`, { silentOnError: true });
      shellExec(`kubectl describe pods -n ${namespace} -l app=${name}`, { silentOnError: true });
      if (name === UNDERPOST_MONITORING.grafana.name)
        shellExec(`kubectl describe pvc ${UNDERPOST_MONITORING.grafana.pvcName} -n ${namespace}`, {
          silentOnError: true,
        });
      throw new Error(`[observability] deployment/${name} failed to become ready; diagnostics are shown above`);
    },

    /**
     * @method pinWorkloads
     * @description Pins Deployments to one node, refusing a name no node carries.
     *
     * A workload pinned to a non-existent node does not degrade — it stays
     * Pending and every rollout wait times out with nothing naming the cause —
     * so the name is checked against the live node list before anything is
     * patched. Kind, kubeadm and K3s name their nodes differently
     * (`kind-worker`, the machine hostname, `node-01`), which is exactly why the
     * check is against the cluster rather than a per-runtime guess.
     * @param {object} params
     * @param {string[]} params.names - Deployment names.
     * @param {string} params.namespace - Namespace holding them.
     * @param {string} params.nodeName - Requested node; empty leaves placement to the scheduler.
     * @returns {boolean} True when the workloads were pinned.
     * @throws {Error} When `nodeName` is not a node in this cluster.
     * @memberof UnderpostMonitor
     */
    pinWorkloads({ names = [], namespace = 'default', nodeName = '' }) {
      if (!nodeName) return false;
      const node = Underpost.monitor.resolveObservabilityNode(nodeName);
      for (const name of names) Underpost.cluster.pinToNode({ kind: 'deployment', name, namespace, node });
      return true;
    },

    /**
     * @method observabilityManifestsRoot
     * @description Directory the stack's workload manifests are applied from.
     *
     * Always the engine checkout, never the globally installed package: these
     * manifests ship with the repository and the deploy is run from it, so
     * resolving them out of `node_modules/underpost` applies whatever an older
     * global install happens to carry — or fails outright when it carries
     * nothing.
     * @returns {string} Manifests directory.
     * @throws {Error} When the directory is not present in the working directory.
     * @memberof UnderpostMonitor
     */
    observabilityManifestsRoot() {
      const root = './manifests';
      if (!fs.existsSync(root)) throw new Error(`[observability] ${root} not found; run this from the engine checkout`);
      return root;
    },

    /**
     * @method exposeGrafana
     * @description Publishes Grafana to a browser, and tells Grafana where it is
     * being reached from.
     *
     * Two independent exposures, either or both:
     *
     *   - `--grafana-host <host>` attaches it at `/grafana` on a hostname the
     *     edge already serves, so it inherits that host's certificate and is
     *     reachable publicly. The route carries no rewrite: with
     *     `serve_from_sub_path` Grafana expects to receive the prefix, and
     *     stripping it would break every asset URL it then generates.
     *   - `--node-port` publishes it on the node's LAN address, for an operator
     *     on the same network with no DNS or certificate involved.
     *
     * The `GF_SERVER_*` pair and the node pin are applied as one pod-template
     * patch rather than separate `set env` and `patch` calls. Each template
     * mutation starts a new ReplicaSet, and Grafana rolls with `Recreate`
     * because its data directory is a ReadWriteOnce volume — so two mutations in
     * sequence means two rollouts, and an identical patch means none at all.
     * @param {object} [options]
     * @param {string} [options.grafanaHost=''] - Hostname to attach the sub-path route to.
     * @param {boolean} [options.nodePort=false] - Publish the LAN NodePort.
     * @param {string} [options.nodeName=''] - Grafana node and NodePort address.
     * @param {string} [options.namespace='default'] - Namespace holding Grafana.
     * @param {string} [options.env] - Environment whose Gateway the route attaches to.
     * @param {boolean} [options.patchDeployment=true] - Apply the runtime settings to an existing Deployment.
     * @returns {object} The resolved exposure.
     * @memberof UnderpostMonitor
     */
    exposeGrafana(options = {}) {
      const namespace = options.namespace || 'default';
      const { grafana } = UNDERPOST_MONITORING;
      const host = `${options.grafanaHost || ''}`.trim();
      const nodeName = Underpost.monitor.resolveObservabilityNode(`${options.nodeName || ''}`.trim());
      const reset = options.patchDeployment !== false && Underpost.monitor.resetGrafanaForNode({ namespace, nodeName });
      const manifestsRoot = reset ? Underpost.monitor.observabilityManifestsRoot() : '';
      if (reset) {
        Underpost.cluster.ensureLocalPathProvisioner();
        Underpost.monitor.applyGrafanaResources({ manifestsRoot, namespace });
      }

      const nodeIp = options.nodePort ? Underpost.monitor.nodeInternalIp(nodeName) : '';

      if (options.nodePort)
        shellExec(`kubectl apply -f - <<'EOF'
${grafanaNodePortFactory({ namespace, nodePort: grafana.nodePort })}
EOF
`);

      if (host) {
        // The deploy's Gateway already terminates TLS for this hostname, so the
        // route attaches to it rather than provisioning a second listener.
        const parentName = Underpost.deploy.gatewayNameFactory({
          deployId: Underpost.monitor.grafanaRouteDeployId(host, options),
          env: options.env || (options.dev ? 'development' : 'production'),
        });
        const routeYaml = Underpost.deploy.httpRouteYamlFactory({
          host,
          name: grafana.routeName,
          parentName,
          options: { namespace },
          rules: Underpost.deploy.httpRouteRuleFactory({
            path: grafana.subPath,
            matchType: 'PathPrefix',
            serviceId: grafana.name,
            port: grafana.port,
          }),
        });
        shellExec(`kubectl apply -f - <<'EOF'
${routeYaml}
EOF
`);
      } else shellExec(`kubectl delete httproute ${grafana.routeName} -n ${namespace} --ignore-not-found`);

      const exposure = grafanaExposureFactory({ host, nodeIp, nodePort: grafana.nodePort });
      if (options.patchDeployment !== false) {
        if (reset) Underpost.monitor.applyGrafanaDeployment({ manifestsRoot, namespace, nodeName, exposure });
        else {
          const patch = JSON.stringify(grafanaDeploymentPatchFactory({ exposure, nodeName }));
          shellExec(`kubectl patch deployment ${grafana.name} -n ${namespace} -p '${patch}'`);
        }
        Underpost.monitor.waitForObservabilityDeployment({ name: grafana.name, namespace });
      }

      logger.info('Grafana exposed', {
        url: exposure.url,
        nodePort: options.nodePort ? `${nodeIp || '<node>'}:${grafana.nodePort}` : null,
        route: host ? `${host}${grafana.subPath}` : null,
        node: nodeName || '(scheduler)',
      });
      return exposure;
    },

    /**
     * @method nodeInternalIp
     * @description The InternalIP of a named node, or of the control plane when
     * none is named.
     *
     * Not the first node: `items[0]` is whichever node the API server lists
     * first, so an address meant for the control plane silently becomes a
     * worker's as soon as one sorts ahead of it.
     * @param {string} [nodeName] - Node to resolve.
     * @returns {string} InternalIP, empty when unresolved.
     * @memberof UnderpostMonitor
     */
    nodeInternalIp(nodeName = '') {
      const command = nodeName
        ? `kubectl get node ${nodeName} -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}'`
        : `kubectl get nodes -l node-role.kubernetes.io/control-plane ` +
          `-o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'`;
      return `${shellExec(command, { stdout: true, silent: true, silentOnError: true, disableLog: true }) || ''}`
        .trim()
        .split(/\s+/)[0];
    },

    /**
     * @method grafanaRouteDeployId
     * @description The deploy whose Gateway terminates a hostname.
     *
     * Resolved from the live Gateways rather than guessed, because the Gateway
     * is named after the deploy that owns the host and a route attached to a
     * Gateway that does not list the hostname is accepted and then never
     * matched — a 404 with nothing logged.
     * @param {string} host - Hostname to publish under.
     * @param {object} [options] - Namespace and environment.
     * @returns {string} Owning deploy id.
     * @throws {Error} When no Gateway in the cluster serves the hostname.
     * @memberof UnderpostMonitor
     */
    grafanaRouteDeployId(host, options = {}) {
      const namespace = options.namespace || 'default';
      const env = options.env || (options.dev ? 'development' : 'production');
      const gateways = `${
        shellExec(
          `kubectl get gateway -n ${namespace} -o jsonpath='{range .items[*]}{.metadata.name}={range .spec.listeners[*]}{.hostname},{end}{"\\n"}{end}'`,
          { stdout: true, silent: true, silentOnError: true, disableLog: true },
        ) || ''
      }`.trim();

      for (const line of gateways.split('\n')) {
        const [name, hostnames = ''] = line.split('=');
        if (!name || !hostnames.split(',').includes(host)) continue;
        const suffix = `-${env}`;
        if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
      }
      throw new Error(
        `[observability] no ${env} Gateway serves '${host}'; deploy that host first, or use --node-port instead`,
      );
    },

    /**
     * @method deployMetricsServer
     * @description Installs the Kubernetes metrics-server.
     *
     * A different concern from the observability stack: metrics-server backs the
     * resource API that `kubectl top` and the HorizontalPodAutoscaler read, and
     * keeps no history. Prometheus keeps history and answers queries; neither
     * substitutes for the other.
     *
     * `--kubelet-insecure-tls` is required on kubeadm and Kind, whose kubelets
     * serve a self-signed certificate that metrics-server would otherwise
     * reject with an x509 error on every node. K3s ships its own metrics-server
     * already wired to its kubelets, so installing this one there would leave
     * two Deployments contending for the same APIService.
     * @param {object} [options]
     * @param {boolean} [options.force=false] - Install on K3s anyway, replacing the bundled one.
     * @param {string} [options.nodeName=''] - Pin the metrics-server Deployment to this node.
     * @returns {Promise<boolean>} True when the install ran.
     * @memberof UnderpostMonitor
     */
    async deployMetricsServer(options = {}) {
      const namespace = 'kube-system';
      const clusterType = clusterTypeFactory(options, options.dev ? 'kind' : 'kubeadm');
      if (clusterType === 'k3s' && !options.force) {
        logger.warn('K3s bundles metrics-server; skipping (pass --force to replace the bundled one)');
        return false;
      }

      shellExec(
        `kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/high-availability-1.21+.yaml`,
      );
      await timer(2000);

      // Idempotent: the JSON patch appends the flag, so re-running would add a
      // duplicate. Checked first rather than made unconditional.
      const args = shellExec(
        `kubectl get deployment metrics-server -n ${namespace} -o jsonpath='{.spec.template.spec.containers[0].args}'`,
        { stdout: true, silent: true, silentOnError: true, disableLog: true },
      );
      if (!`${args || ''}`.includes('--kubelet-insecure-tls'))
        shellExec(
          `kubectl patch deployment metrics-server -n ${namespace} --type='json' ` +
            `-p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'`,
        );

      shellExec(`kubectl scale deployment metrics-server -n ${namespace} --replicas=1`);
      Underpost.monitor.pinWorkloads({ names: ['metrics-server'], namespace, nodeName: options.nodeName });
      shellExec(`kubectl rollout status deployment/metrics-server -n ${namespace} --timeout=5m`, {
        silentOnError: true,
      });
      logger.info('metrics-server deployed', { clusterType, namespace });
      return true;
    },

    /**
     * @method cockpit
     * @description Installs, enables or stops the Cockpit KVM dashboard on this
     * host — the web console for the libvirt guests the baremetal and LXD flows
     * provision, served on port 9090.
     *
     * Host-level and therefore idempotent and reversible by contract: the
     * install is a no-op on an already-provisioned host, the firewall service is
     * re-declared rather than toggled blindly, and `--cockpit-stop` reverses
     * exactly what was opened. Every step is guarded on the tool actually being
     * present, so a host without firewalld is configured rather than failed.
     *
     * Cockpit and Prometheus both default to 9090. They do not collide here —
     * Prometheus is a ClusterIP Service inside the cluster and Cockpit binds the
     * host — but a NodePort exposing Prometheus on the host must not use 9090 on
     * a node that also runs this dashboard.
     * @param {object} [options]
     * @param {boolean} [options.stop=false] - Stop and disable the console, and close its firewall service.
     * @returns {boolean} True when the requested state was applied.
     * @memberof UnderpostMonitor
     */
    cockpit(options = {}) {
      const has = (binary) =>
        Boolean(
          `${shellExec(`command -v ${binary} 2>/dev/null || true`, { stdout: true, silent: true, silentOnError: true, disableLog: true }) || ''}`.trim(),
        );
      const firewalld = () =>
        has('firewall-cmd') &&
        shellExec(`sudo firewall-cmd --state >/dev/null 2>&1`, { silentOnError: true, disableLog: true, stdout: false })
          .code === 0;

      if (options.stop) {
        shellExec(`sudo systemctl disable --now cockpit.socket`, { silentOnError: true });
        if (firewalld()) {
          shellExec(`sudo firewall-cmd --permanent --remove-service=cockpit`, { silentOnError: true });
          shellExec(`sudo firewall-cmd --reload`);
        }
        // libvirtd is left running: it hosts the guests themselves, and this
        // command manages the console in front of them, not the hypervisor.
        logger.info('Cockpit stopped and disabled', { note: 'libvirtd left running' });
        return true;
      }

      if (!has('dnf')) {
        logger.error('Cockpit install requires dnf', { hint: 'install cockpit cockpit-machines libvirt by hand' });
        return false;
      }
      shellExec(`sudo dnf install -y cockpit cockpit-machines libvirt`);
      shellExec(`sudo systemctl enable --now cockpit.socket libvirtd`);

      if (firewalld()) {
        // Removed then re-added rather than added alone: a permanent rule from a
        // previous release may name a different zone or port set, and re-adding
        // over it leaves both in place.
        shellExec(`sudo firewall-cmd --zone=public --remove-service=cockpit --permanent`, { silentOnError: true });
        shellExec(`sudo firewall-cmd --permanent --add-service=cockpit`);
        shellExec(`sudo firewall-cmd --reload`);
      } else logger.warn('firewalld is not running; Cockpit port 9090 was not opened');

      const status = shellExec(`sudo systemctl is-active cockpit.socket`, {
        stdout: true,
        silent: true,
        silentOnError: true,
      });
      logger.info('Cockpit KVM dashboard ready', {
        url: `https://${os.hostname()}:9090`,
        socket: `${status || ''}`.trim() || 'unknown',
      });
      return true;
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
     * @method readDeployedEventState
     * @description The events the cluster is currently running, read from the
     * ConfigMaps it serves them from, with whether the cluster actually answered.
     *
     * The cluster is the state. Asking it what is deployed is what makes a
     * scoped `--deploy` additive instead of a replacement: the alternative is a
     * local file that claims what should be running and is wrong the moment
     * anyone applies anything by hand.
     *
     * A cluster that does not answer is not an empty cluster. Reporting the two
     * the same way makes an unreachable API server look like a stack with
     * nothing deployed, which reads as `PENDING` everywhere and renders a
     * `--deploy` set that withdraws every event it does not name.
     * @param {object} [params]
     * @param {string} [params.namespace='default'] - Namespace holding the stack.
     * @returns {{readable: boolean, ids: string[], reason: string}} Deployed set, empty and
     * unreadable when the cluster did not answer.
     * @memberof UnderpostMonitor
     */
    readDeployedEventState({ namespace = 'default' } = {}) {
      const { prometheus } = UNDERPOST_MONITORING;
      const read = (name) => {
        const result = shellExec(`kubectl get configmap ${name} -n ${namespace} -o jsonpath='{.data}'`, {
          silent: true,
          silentOnError: true,
          disableLog: true,
        });
        // kubectl repeats its discovery failure once per API group; the last
        // line is the one that names what actually went wrong.
        const reason =
          `${result?.stderr || ''}`
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .pop() || '';
        // A ConfigMap the cluster answered for and does not hold is an empty
        // set; every other failure leaves the deployed set unknown.
        const absent = /notfound|not found/i.test(reason);
        return { readable: result?.code === 0 || absent, data: `${result?.stdout || ''}`, reason };
      };
      const rules = read(prometheus.rulesConfigMapName);
      const conf = read(prometheus.configMapName);
      const readable = rules.readable && conf.readable;
      return {
        readable,
        ids: readable ? deployedEventIdsFactory(rules.data, conf.data) : [],
        reason: readable ? '' : rules.reason || conf.reason,
      };
    },

    /**
     * @method readDeployedEventIds
     * @description The deployed event ids alone; an unreadable cluster reads as empty.
     * @param {object} [params]
     * @param {string} [params.namespace='default'] - Namespace holding the stack.
     * @returns {string[]} Distinct event ids, sorted.
     * @memberof UnderpostMonitor
     */
    readDeployedEventIds({ namespace = 'default' } = {}) {
      return Underpost.monitor.readDeployedEventState({ namespace }).ids;
    },

    /**
     * @method awaitProbes
     * @description Reads event probes from the Blackbox Exporter, and waits for
     * them to reach an expected state.
     *
     * Reads the same `/probe` endpoint Prometheus scrapes, so what this observes
     * is what detection observes — a second implementation of ICMP or TCP here
     * would be able to disagree with the component that actually fires alerts.
     *
     * The exporter is a ClusterIP Service, reached through the API server's
     * service proxy: one stateless request per read, with no local listener and
     * no background child, so the read works identically on the node that hosts
     * the stack and from any machine that can run it there over SSH.
     *
     * @param {object} params
     * @param {Array<{module: string, target: string}>} params.probes - Probes to read.
     * @param {boolean} [params.expect=true] - `probe_success` state every probe must reach.
     * @param {string} [params.namespace='default'] - Namespace holding the exporter.
     * @param {number} [params.timeoutMs=0] - Maximum wait; `0` reads once.
     * @param {number} [params.intervalMs=5000] - Poll interval.
     * @param {{user?: string, host?: string}} [params.target] - Account that reaches the cluster; empty reads locally.
     * @returns {Promise<{ok: boolean, readable: boolean, elapsedMs: number, observations: Array<object>}>} Last observation set.
     * @memberof UnderpostMonitor
     */
    async awaitProbes({
      probes = [],
      expect = true,
      namespace = 'default',
      timeoutMs = 0,
      intervalMs = 5000,
      target = {},
    }) {
      if (probes.length === 0) return { ok: false, readable: false, elapsedMs: 0, observations: [] };

      const { blackbox } = UNDERPOST_MONITORING;
      const startedAt = Date.now();
      const deadline = startedAt + Math.max(0, timeoutMs);

      const read = async (probe) => {
        const path =
          `/api/v1/namespaces/${namespace}/services/${blackbox.name}:${blackbox.port}/proxy/probe` +
          `?module=${encodeURIComponent(probe.module)}&target=${encodeURIComponent(probe.target)}`;
        const result = await Underpost.event.runCommand(`kubectl get --raw '${path}'`, { ...target, silent: true });
        const match = `${result.output || ''}`.match(/^probe_success (\d)$/m);
        return {
          ...probe,
          success: match?.[1] === '1',
          read: Boolean(match),
          ...(match ? {} : { error: `${result.error || 'no probe_success line'}`.trim().slice(-200) }),
        };
      };

      let observations = [];
      do {
        observations = [];
        for (const probe of probes) observations.push(await read(probe));
        // An unreadable probe is not an observation: the exporter being
        // unreachable must never be reported as a failing subject. `readable`
        // is returned so a caller can tell "the subject is down" from "nothing
        // could be asked about it".
        const readable = observations.every((observation) => observation.read);
        const ok = readable && observations.every((observation) => observation.success === expect);
        if (ok || Date.now() >= deadline) return { ok, readable, elapsedMs: Date.now() - startedAt, observations };
        await timer(intervalMs);
      } while (true);
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
