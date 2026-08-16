/**
 * @description The main entry point for the Underpost CLI applications.
 * @module src/cli/run.js
 * @namespace UnderpostRun
 */

import { daemonProcess, getTerminalPid, pbcopy, shellCd, shellExec } from '../server/process.js';
import {
  awaitDeployMonitor,
  buildKindPorts,
  clusterContextFactory,
  clusterTypeFactory,
  cronDeployIdResolve,
  dispatchBuildInstanceEnv,
  deployHostsFactory,
  etcHostFactory,
  exposePartialMatchesFactory,
  exposePathPartsFactory,
  exposePortListFactory,
  exposePortPlanFactory,
  exposeTcpPortsFactory,
  gatewayApiEnabledFactory,
  generateSecurePassword,
  getNpmRootPath,
  instanceHttpRouteRulesFactory,
  instanceInterceptStatusesFactory,
  instancePortFactory,
  instanceProxyRoutesFactory,
  instanceStatusPageEntriesFactory,
  isDeployRunnerContext,
  loadConfInstances,
  loadProjectInstanceEnvBuilder,
  loadConfServerJson,
  loadReplicas,
  resolveDeployList,
  resolveEnvScoped,
  selectConfInstances,
  waitForPort,
  writeEnv,
  clusterInstancesFactory,
  deployTrafficEntriesFactory,
  curlStatusChainFactory,
  hostIngressFactsFactory,
  hostRenderInstancesFactory,
  instanceTrafficPlanFactory,
  trafficTableRowsFactory,
  isTrafficServingFactory,
  nextTrafficFactory,
  stopPlanFactory,
  trafficFromRoutingInfoFactory,
} from '../server/conf.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';

import fs from 'fs-extra';
import { range, s4, setPad, timer } from '../client/components/core/CommonJs.js';

import os from 'os';
import Underpost from '../index.js';
import dotenv from 'dotenv';
import { MongoBootstrap } from '../db/mongo/MongoBootstrap.js';
import {
  UNDERPOST_GATEWAY,
  assertStaticAssets,
  gatewayFallbackProbeRunner,
  hostServerConfFactory,
  installGatewayConf,
  instanceFallbackChecksFactory,
  placeInstanceStaticAssets,
  pwaFallbackChecksFactory,
  readHostInstanceRegistry,
  writeHostInstanceRegistry,
  writeHostServerConf,
} from '../server/underpost-gateway.js';
const logger = loggerFactory(import.meta);

/**
 * @constant DEFAULT_OPTION
 * @description Default options for the UnderpostRun class.
 * @typedef {Object} UnderpostRunDefaultOptions
 * @type {Object}
 * @property {boolean} dev - Whether to run in development mode.
 * @property {string} podName - The name of the pod to run.
 * @property {string} nodeName - The name of the node to run.
 * @property {string} ingressNode - Dedicated node for the host-network public ingress; never inherited from nodeName.
 * @property {string} sshKeyPath - Private key path for node SSH operations, forwarded to volume shipping over SSH.
 * @property {number} port - Custom port to use.
 * @property {string} exposeContainerPorts - Comma-separated Service/container destination ports.
 * @property {string} exposeHostPorts - Comma-separated host listening ports.
 * @property {boolean} localProxy - Start the development path proxy after exposing matched resources.
 * @property {string} volumeHostPath - The host path for the volume.
 * @property {string} volumeMountPath - The mount path for the volume.
 * @property {string} imageName - The name of the image to run.
 * @property {string} containerName - The name of the container to run.
 * @property {string} namespace - The namespace to run in.
 * @property {string} timeoutResponse - The response timeout duration.
 * @property {string} timeoutIdle - The idle timeout duration.
 * @property {string} retryCount - The number of retries.
 * @property {string} retryPerTryTimeout - The timeout duration per retry.
 * @property {boolean} build - Whether to build the image.
 * @property {number} replicas - The number of replicas to run.
 * @property {boolean} force - Whether to force the operation.
 * @property {boolean} reset - Whether to reset the operation.
 * @property {boolean} tls - Whether to use TLS.
 * @property {boolean} gatewayApi - Apply the Gateway API stack (Gateway + HTTPRoute) instead of the Contour HTTPProxy. Both manifest sets are always generated.
 * @property {boolean} disableGatewayApi - Fall back to the Contour HTTPProxy stack in runners where the Gateway API is the default (`cluster`).
 * @property {string} gatewayClass - GatewayClass name baked into generated Gateway manifests.
 * @property {boolean} disableHttp3 - Omit QUIC/HTTP3 listener config and the Alt-Svc advertisement.
 * @property {number} quicPort - UDP port advertised for QUIC/HTTP3.
 * @property {string} cmd - The command to run in the container.
 * @property {string} tty - The TTY option for the container.
 * @property {string} stdin - The stdin option for the container.
 * @property {string} restartPolicy - The restart policy for the container.
 * @property {string} runtimeClassName - The runtime class name for the container.
 * @property {string} imagePullPolicy - The image pull policy for the container.
 * @property {string} apiVersion - The API version for the container.
 * @property {string} claimName - The claim name for the volume.
 * @property {string} kindType - The kind of resource to create.
 * @property {number} devProxyPortOffset - The port offset for the development proxy.
 * @property {boolean} hostNetwork - Whether to use host networking.
 * @property {string} requestsMemory - The memory request for the container.
 * @property {string} requestsCpu - The CPU request for the container.
 * @property {string} limitsMemory - The memory limit for the container.
 * @property {string} limitsCpu - The CPU limit for the container.
 * @property {string} resourceTemplateId - The resource template ID.
 * @property {boolean} expose - Whether to expose the service.
 * @property {boolean} etcHosts - Whether to modify /etc/hosts.
 * @property {string} confServerPath - The configuration server path.
 * @property {string} underpostRoot - The root path of the Underpost installation.
 * @property {string} cmdCronJobs - Pre-script commands to run before cron job execution.
 * @property {string} deployIdCronJobs - Cron deploy-id passed to `cron --setup-start`; unset resolves dd.cron, `none` skips cron setup.
 * @property {string} timezone - The timezone to set.
 * @property {boolean} kubeadm - Whether to run in kubeadm mode.
 * @property {boolean} kind - Whether to run in kind mode.
 * @property {boolean} k3s - Whether to run in k3s mode.
 * @property {string} hosts - The hosts to use.
 * @property {string} deployId - The deployment ID.
 * @property {string} instanceId - The instance ID.
 * @property {string} user - The user to run as.
 * @property {string} group - The group to use.
 * @property {string} pid - The process ID.
 * @property {boolean} disablePrivateConfUpdate - Whether to disable private configuration updates.
 * @property {string} monitorStatus - The monitor status option.
 * @property {string} monitorStatusKindType - The monitor status kind type option.
 * @property {string} monitorStatusDeltaMs - The monitor status delta in milliseconds.
 * @property {string} monitorStatusMaxAttempts - The maximum number of attempts for monitor status.
 * @property {boolean} logs - Whether to enable logs.
 * @property {boolean} dryRun - Whether to perform a dry run.
 * @property {boolean} createJobNow - Whether to create the job immediately.
 * @property {number} fromNCommit - Number of commits back to use for message propagation (default: 1, last commit only).
 * @property {string|Array<{ip: string, hostnames: string[]}>} hostAliases - Adds entries to the Pod /etc/hosts via Kubernetes hostAliases.
 *   As a string (CLI): semicolon-separated entries of "ip=hostname1,hostname2" (e.g., "127.0.0.1=foo.local,bar.local;10.1.2.3=foo.remote").
 *   As an array (programmatic): objects with `ip` and `hostnames` fields (e.g., [{ ip: "127.0.0.1", hostnames: ["foo.local"] }]).
 * @property {boolean} gitClean - Whether to perform a `git clean` before running.
 * @property {boolean} copy - Whether to copy the command to the clipboard instead of executing it.
 * @property {boolean} skipFullBuild - Whether to skip the full client bundle build during deployment (supported by: sync, template-deploy).
 * @property {boolean} pullBundle - Whether to pull the bundle before running. Use together with --skip-full-build to skip the local build entirely (supported by: sync, template-deploy).
 * @property {boolean} remove - Whether to remove/teardown resources instead of creating them (e.g. delete-expose for k3s proxy devices in dev-cluster).
 * @property {boolean} test - Whether to enable test/generic-purpose mode (e.g. use self-signed TLS instead of cert-manager).
 * @property {string} hostAliases - Pod `/etc/hosts` entries, as semicolon-separated `ip=host1,host2` groups.
 * @property {string} args - Comma-separated arguments forwarded to the runner's own command.
 * @property {boolean} cert - Issue cert-manager certificates; set implicitly by `tls` in the promote workflow.
 * @property {boolean} instanceOnly - Act on the one instance id given, without expanding its variant family.
 * @property {string} labels - Comma-separated `key=value` pairs applied to the created resources.
 * @property {string} npmRoot - Resolved npm global root, cached on the options once looked up.
 * @property {object} on - Lifecycle hooks (`{ init }`) a programmatic caller supplies; unused from the CLI.
 * @property {string} traffic - Blue/green colour to bake into generated manifests (default: `blue`).
 * @property {boolean} gatewayBootstrapComplete - Internal marker: a parent orchestration already proved the static gateway fallback.
 * @property {boolean} noBackendCheckpoint - Internal marker: this promote is the deliberate no-backend fallback checkpoint, so it must not wait for the target colour's endpoints.
 * @property {Object<string,string>} targetTrafficById - Internal instance id → explicitly pre-routed traffic colour.
 * @property {string} volumeType - hostPath volume type (`DirectoryOrCreate`, `FileOrCreate`, or `dev` for the latter).
 * @property {string} branch - The Git branch to use for operations (e.g., for template-deploy, ssh-deploy).
 * @memberof UnderpostRun
 */
const DEFAULT_OPTION = {
  dev: false,
  podName: '',
  nodeName: '',
  ingressNode: '',
  sshKeyPath: '',
  port: 0,
  exposeContainerPorts: '',
  exposeHostPorts: '',
  localProxy: false,
  volumeHostPath: '',
  volumeMountPath: '',
  imageName: '',
  containerName: '',
  namespace: 'default',
  timeoutResponse: '',
  timeoutIdle: '',
  retryCount: '',
  retryPerTryTimeout: '',
  build: false,
  replicas: 1,
  force: false,
  reset: false,
  tls: false,
  gatewayApi: false,
  disableGatewayApi: false,
  gatewayClass: '',
  disableHttp3: false,
  quicPort: 0,
  cmd: '',
  tty: '',
  stdin: '',
  restartPolicy: '',
  runtimeClassName: '',
  imagePullPolicy: '',
  apiVersion: '',
  claimName: '',
  kindType: '',
  devProxyPortOffset: 0,
  hostNetwork: false,
  requestsMemory: '',
  requestsCpu: '',
  limitsMemory: '',
  limitsCpu: '',
  resourceTemplateId: '',
  expose: false,
  etcHosts: false,
  confServerPath: '',
  underpostRoot: '',
  cmdCronJobs: '',
  deployIdCronJobs: '',
  timezone: '',
  kubeadm: false,
  kind: false,
  k3s: false,
  hosts: '',
  deployId: '',
  instanceId: '',
  user: '',
  group: '',
  pid: '',
  disablePrivateConfUpdate: false,
  monitorStatus: '',
  monitorStatusKindType: '',
  monitorStatusDeltaMs: '',
  monitorStatusMaxAttempts: '',
  logs: false,
  dryRun: false,
  createJobNow: false,
  fromNCommit: 0,
  hostAliases: '',
  gitClean: false,
  copy: false,
  skipFullBuild: false,
  pullBundle: false,
  remove: false,
  test: false,
  branch: '',
  args: '',
  cert: false,
  instanceOnly: false,
  gatewayBootstrapComplete: false,
  noBackendCheckpoint: false,
  targetTrafficById: {},
  labels: '',
  npmRoot: '',
  on: undefined,
  traffic: '',
  volumeType: '',
};

/**
 * @class UnderpostRun
 * @description Manages the execution of various CLI commands and operations.
 * This class provides a set of static methods to perform different tasks
 * such as running tests, deploying applications, managing environment variables,
 * and more. It also includes a default option configuration and a collection of
 * runners for executing specific commands.
 * @memberof UnderpostRun
 */

// Secrets `sops-setup` onboards when no explicit list is passed: the full self-hosted data tier.
// `mongodb-keyfile` is listed alongside `mongodb-secret` because the MongoDB StatefulSet mounts
// it as a volume for intra-replica-set auth and will not start without it, so onboarding the
// credentials alone would leave Mongo broken.
const SOPS_SETUP_DEFAULT_SECRETS = ['postgres-secret', 'mariadb-secret', 'mongodb-secret', 'mongodb-keyfile'];

/**
 * Produces a value for a Secret data key that has no origin seed file and no `--args` override.
 * Key-aware because the data tier does not want one shape of secret: a replica-set keyfile is a
 * long base64 blob, a username is an identifier, and everything else is a password.
 * @param {string} key - Secret data key (e.g. 'password', 'username', 'mongodb-keyfile').
 * @returns {string} Generated value.
 * @memberof UnderpostRun
 */
const generateSeedValue = (key) => {
  if (key === 'username') return 'admin';
  // MongoDB keyfile: 6-1024 base64 characters shared by every replica-set member. Newlines are
  // stripped so the value round-trips identically through YAML and through
  // MongoBootstrap.readCredential, which strips them too.
  if (key === 'mongodb-keyfile')
    return shellExec(`openssl rand -base64 756`, { stdout: true, silent: true, disableLog: true }).replace(
      /\r?\n/g,
      '',
    );
  return generateSecurePassword(24);
};

class UnderpostRun {
  /**
   * @static
   * @description Collection of runners for executing specific commands.
   * @type {Object}
   * @memberof UnderpostRun
   */
  static RUNNERS = {
    /**
     * @method status
     * @description Reports deployment traffic, routing, Pods, expanded instances, and host capacity.
     * @param {string} path - Deploy id, comma-separated ids, or `dd`; empty uses the router/configured projects.
     * @param {UnderpostRunDefaultOptions} options - Namespace, environment (`--dev`), cluster, and node options.
     * @returns {Promise<{deployments: object[], machine: object}>} Structured status report.
     * @memberof UnderpostRun
     */
    status: async (path = '', options = DEFAULT_OPTION) => {
      options = {
        ...options,
        gatewayApi: gatewayApiEnabledFactory(options),
        namespace: options.namespace || 'default',
      };
      if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(options.namespace))
        throw new Error(`Invalid Kubernetes namespace: ${options.namespace}`);
      if (options.nodeName && !/^[a-zA-Z0-9._-]+$/.test(options.nodeName))
        throw new Error(`Invalid Kubernetes node name: ${options.nodeName}`);
      const env = options.dev ? 'development' : 'production';
      const requestedDeploys = `${path || options.deployId || ''}`.trim();
      const routerPath = './engine-private/deploy/dd.router';
      const confRoot = './engine-private/conf';
      const deployIds = [
        ...new Set(
          requestedDeploys
            ? resolveDeployList(requestedDeploys)
            : fs.existsSync(routerPath)
              ? resolveDeployList('dd')
              : fs.existsSync(confRoot)
                ? fs
                    .readdirSync(confRoot)
                    .filter(
                      (deployId) =>
                        fs.existsSync(`${confRoot}/${deployId}/conf.server.json`) ||
                        fs.existsSync(`${confRoot}/${deployId}/conf.instances.json`),
                    )
                    .sort()
                : [],
        ),
      ];
      if (deployIds.length === 0) throw new Error('No deployments found for status');
      if (deployIds.some((deployId) => !/^[a-zA-Z0-9._-]+$/.test(deployId)))
        throw new Error(`Invalid deployment status path: ${requestedDeploys}`);

      const deployments = [];
      for (const deployId of deployIds) {
        const instances = [];
        if (fs.existsSync(`${confRoot}/${deployId}/conf.instances.json`)) {
          for (const instance of loadConfInstances(deployId)) {
            const instanceDeployId = `${deployId}-${instance.id}`;
            instances.push({
              id: instance.id,
              host: instance.host,
              path: instance.path,
              fromPort: instance.fromPort,
              toPort: instance.toPort,
              fromDebugPort: instance.fromDebugPort,
              toDebugPort: instance.toDebugPort,
              traffic: Underpost.deploy.getCurrentTraffic(instanceDeployId, {
                namespace: options.namespace,
                hostTest: instance.host,
                env,
                gatewayApi: options.gatewayApi,
              }),
            });
          }
        }
        const deployment = {
          deployId,
          env,
          traffic: Underpost.deploy.getCurrentTraffic(deployId, {
            namespace: options.namespace,
            env,
            gatewayApi: options.gatewayApi,
          }),
          router: await Underpost.deploy.routerFactory(deployId, env),
          pods: Underpost.kubectl.get(deployId, 'pods', options.namespace),
          instances,
        };
        deployments.push(deployment);
        logger.info('', deployment);
      }

      const interfaceName = Underpost.dns.getDefaultNetworkInterface();
      const machine = {
        hostname: os.hostname(),
        arch: Underpost.baremetal.getHostArch(),
        clusterType: clusterTypeFactory(options),
        ipv4Public: await Underpost.dns.getPublicIp(),
        ipv4Local: Underpost.dns.getLocalIPv4Address(),
        resources: Underpost.cluster.getResourcesCapacity(options.nodeName),
        defaultInterfaceName: interfaceName,
        defaultInterfaceInfo: os.networkInterfaces()[interfaceName],
      };
      logger.info('Machine', machine);
      return { deployments, machine };
    },

    /**
     * @method expose
     * @description Port-forwards every Service whose name partially matches path, falling back to matching Pods.
     * Works through the active kubeconfig for Kind, k3s, and kubeadm clusters.
     * Comma-separated path fragments determine resource index order; host and
     * container port lists are paired against that same order.
     * @param {string} path - One or more comma-separated literal Service/Pod name fragments.
     * @param {UnderpostRunDefaultOptions} options - Namespace, cluster type, and optional port overrides.
     * @returns {Array<{kindType: string, name: string, localPort: number, remotePort: number}>} Forward plan.
     * @memberof UnderpostRun
     */
    expose: (path, options = DEFAULT_OPTION) => {
      const namespace = options.namespace || 'default';
      const clusterType = clusterTypeFactory(options);
      const pathParts = exposePathPartsFactory(path || options.podName);
      if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(namespace))
        throw new Error(`Invalid Kubernetes namespace: ${namespace}`);
      let kindType = 'svc';
      let resources = exposePartialMatchesFactory(Underpost.kubectl.get('', kindType, namespace), pathParts);

      if (resources.length === 0) {
        kindType = 'pod';
        resources = exposePartialMatchesFactory(Underpost.kubectl.get('', 'pods', namespace), pathParts);
      }
      if (resources.length === 0)
        throw new Error(`No Service or Pod partially matching '${pathParts.join(',')}' in namespace '${namespace}'`);

      const containerPorts = exposePortListFactory(options.exposeContainerPorts, '--expose-container-ports');
      const hostPorts = exposePortListFactory(options.exposeHostPorts, '--expose-host-ports');
      const portsOf = (resource) => {
        let declaredPorts = exposeTcpPortsFactory(resource);
        if (kindType === 'pod' && declaredPorts.length === 0) {
          const podJson = shellExec(`sudo kubectl get pod ${resource.NAME} -n ${namespace} -o json`, {
            stdout: true,
            silent: true,
          });
          const pod = JSON.parse(podJson);
          declaredPorts = (pod.spec?.containers || [])
            .flatMap((container) => container.ports || [])
            .map(({ containerPort }) => parseInt(containerPort))
            .filter((port) => Number.isInteger(port) && port > 0);
        }
        return declaredPorts;
      };
      const plan = exposePortPlanFactory({ resources, kindType, containerPorts, hostPorts, portsOf });

      logger.info('[expose] Kubernetes port-forward plan', {
        clusterType,
        namespace,
        matches: pathParts,
        plan,
      });
      for (const { kindType, name, localPort, remotePort } of plan)
        shellExec(`sudo kubectl port-forward -n ${namespace} ${kindType}/${name} ${localPort}:${remotePort}`, {
          async: true,
        });

      if (options.localProxy) {
        const deployId = options.deployId || pathParts[0];
        const env = options.dev ? 'development' : 'production';
        const envFile = `./engine-private/conf/${deployId}/.env.${env}`;
        let basePort = plan[0].localPort - 1;
        if (fs.existsSync(envFile)) {
          const portMatch = fs.readFileSync(envFile, 'utf8').match(/^PORT=(\d+)/m);
          if (portMatch) basePort = parseInt(portMatch[1]);
        }
        const tlsFlag = options.tls ? ' tls' : '';
        shellExec(
          `NODE_ENV=${env} PORT=${basePort} DEV_PROXY_PORT_OFFSET=0 node src/proxy proxy ${deployId} ${env}${tlsFlag}`,
          { async: true },
        );
      }

      return plan;
    },

    /**
     * @method dev-cluster
     * @description Resets and deploys a full development cluster including MongoDB, Valkey, exposes services, and updates `/etc/hosts` for local access.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-cluster': (path, options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const mongoHosts = ['mongodb-0.mongodb-service'];
      let primaryMongoHost = 'mongodb-0.mongodb-service';
      const clusterType = clusterTypeFactory(options);
      const clusterFlag = ` --${clusterType}`;
      const clusterInitFlag = clusterType === 'kind' ? '' : clusterFlag;
      const clusterOptions = `${options.dev ? ' --dev' : ''}${clusterInitFlag} --namespace ${options.namespace}`;
      if (!options.expose && !options.remove) {
        shellExec(`${baseCommand} cluster${clusterOptions} --reset`);
        shellExec(`${baseCommand} cluster${clusterOptions}`);

        shellExec(
          `${baseCommand} cluster${clusterOptions} --mongodb --service-host ${mongoHosts.join(',')} --pull-image`,
        );
        shellExec(`${baseCommand} cluster${clusterOptions} --valkey --pull-image`);
      }
      if (options.remove) {
        shellExec(`${baseCommand} run kill '6379,27017'`);
      } else {
        try {
          const primaryPodName =
            MongoBootstrap.getPrimaryPodName({
              namespace: options.namespace,
              podName: 'mongodb-0',
              disableAuth: options.dev,
            }) || 'mongodb-0';
          primaryMongoHost = `${primaryPodName}.mongodb-service`;
        } catch (error) {
          logger.warn('Failed to detect MongoDB primary pod, using default', {
            error: error.message,
            default: primaryMongoHost,
          });
        }
        shellExec(
          `${baseCommand} run expose mongodb-service --namespace ${options.namespace}${clusterFlag} --expose-container-ports 27017 --expose-host-ports 27017`,
          { async: true },
        );
        shellExec(
          `${baseCommand} run expose valkey-service --namespace ${options.namespace}${clusterFlag} --expose-container-ports 6379 --expose-host-ports 6379`,
          { async: true },
        );
      }
      const hostListenResult = etcHostFactory([primaryMongoHost]);
      logger.info(hostListenResult.renderHosts);
    },

    /**
     * @method metadata
     * @description Generates metadata for the specified path after exposing the development cluster.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    metadata: async (path, options = DEFAULT_OPTION) => {
      const ports = '6379,27017';
      shellExec(`node bin run kill '${ports}'`);
      shellExec(`node bin run dev-cluster --dev --expose --namespace ${options.namespace}`, { async: true });
      logger.info('Waiting for port-forward services to be ready...');
      const ready = await Promise.all([27017, 6379].map((port) => waitForPort({ port })));
      if (ready.some((reachable) => !reachable)) {
        shellExec(`node bin run kill '${ports}'`);
        throw new Error('Port-forward services failed to become ready');
      }
      logger.info('Port-forward services are ready');
      shellExec(`node bin metadata --generate ${path}`);
      shellExec(`node bin db --dev --clean-fs-collection dd`);
      shellExec(`node bin run kill '${ports}'`);
    },

    /**
     * @method ipfs-expose
     * @description Exposes every declared TCP port on the matching IPFS Cluster Service.
     * @type {Function}
     * @memberof UnderpostRun
     */
    'ipfs-expose': (path, options = DEFAULT_OPTION) => {
      // 5001 Kubo RPC API / WebUI: Kubo/IPFS HTTP API + IPFS WebUI (e.g., http://localhost:5001/webui).
      // 9094 IPFS Cluster HTTP API: IPFS Cluster REST API consumed by ipfs-cluster-ctl and WebUI clients (e.g., http://localhost:9094/).
      // 8080 (or 8081) IPFS Gateway: Public HTTP Gateway for accessing pinned content by CID (e.g., http://localhost:8080/ipfs/Qm...).
      shellExec(`node bin run expose ipfs --expose-host-ports 5001,9094,8080`);
    },

    /**
     * @method svc-ls
     * @description Lists systemd services and installed packages, optionally filtering by the provided path.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional filter for services and packages).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'svc-ls': (path, options = DEFAULT_OPTION) => {
      const log = shellExec(`systemctl list-units --type=service${path ? ` | grep ${path}` : ''}`, {
        silent: true,
        stdout: true,
      });
      console.log(path ? log.replaceAll(path, path.red) : log);
      const log0 = shellExec(`sudo dnf list installed${path ? ` | grep ${path}` : ''}`, {
        silent: true,
        stdout: true,
      });
      console.log(path ? log0.replaceAll(path, path.red) : log0);
    },

    /**
     * @method svc-rm
     * @description Removes a systemd service by stopping it, disabling it, uninstalling the package, and deleting related files.
     * @param {string} path - The input value, identifier, or path for the operation (used as the service name).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'svc-rm': (path, options = DEFAULT_OPTION) => {
      shellExec(`sudo systemctl stop ${path}`);
      shellExec(`sudo systemctl disable --now ${path}`);
      shellExec(`sudo dnf remove -y ${path}*`);
      shellExec(`sudo rm -f /usr/lib/systemd/system/${path}.service`);
      shellExec(`sudo rm -f /etc/yum.repos.d/${path}*.repo`);
    },

    /**
     * @method node-move
     * @description Abstract runner that relocates any schedulable Kubernetes workload
     * (Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob, ReplicationController)
     * onto a target node by patching its pod-template `nodeSelector` and rolling it out.
     * Resource-kind agnostic: it resolves the kind dynamically and applies the right
     * patch path, so it works for `sts`, `deployment`, etc. without bespoke logic.
     *
     * Selection grammar via `path`:
     *   - `<kind>/<name>`  -> a single resource (e.g. `deployment/dd-core-production-blue`)
     *   - `<kind>`         -> every resource of that kind in the namespace (e.g. `statefulset`)
     *   - ``               -> all movable workloads (deployment, statefulset, daemonset) in the namespace
     *
     * Placement:
     *   - default: built-in `kubernetes.io/hostname=<node>` (no node mutation required)
     *   - `--labels k=v,...`: label the target node with those pairs and use them as the
     *     nodeSelector (matches the "label node + nodeSelector" pattern), enabling reusable
     *     workload pools instead of pinning to a single hostname.
     *
     * Flags: `--node-name <node>` (target), `--namespace <ns>`, `--dry-run` (preview only),
     *        `--remove` (clear the nodeSelector / unpin placement).
     *
     * Caveats: Services/ConfigMaps and bare Pods are not schedulable controllers and are
     * skipped (move the owning controller). StatefulSets bound to node-local PVs may stay
     * Pending after a move until their volume is available on the target node.
     * @param {string} path - Resource selector (`kind/name`, `kind`, or empty).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     * @returns {Array<{ref:string,kind:string,status:string,node?:string}>} Per-resource outcome.
     */
    'node-move': (path = '', options = DEFAULT_OPTION) => {
      const node = options.nodeName;
      const ns = options.namespace || 'default';
      const dryRun = options.dryRun === true;
      const remove = options.remove === true;

      if (!remove && !node) {
        throw new Error('node-move requires --node-name <target-node> (or --remove to clear placement)');
      }

      const normalizeKind = (k) =>
        ({
          deploy: 'deployment',
          deployments: 'deployment',
          deployment: 'deployment',
          sts: 'statefulset',
          statefulsets: 'statefulset',
          statefulset: 'statefulset',
          ds: 'daemonset',
          daemonsets: 'daemonset',
          daemonset: 'daemonset',
          rs: 'replicaset',
          replicasets: 'replicaset',
          replicaset: 'replicaset',
          rc: 'replicationcontroller',
          replicationcontroller: 'replicationcontroller',
          job: 'job',
          jobs: 'job',
          cj: 'cronjob',
          cronjob: 'cronjob',
          cronjobs: 'cronjob',
          po: 'pod',
          pod: 'pod',
          pods: 'pod',
          svc: 'service',
          service: 'service',
          services: 'service',
        })[k] || k;

      // Kinds that own a pod template we can patch. Changing that template is
      // itself the controller's rollout trigger.
      const templated = [
        'deployment',
        'statefulset',
        'daemonset',
        'replicaset',
        'job',
        'cronjob',
        'replicationcontroller',
      ];
      const templateSelectorPath = (kind) =>
        kind === 'cronjob'
          ? ['spec', 'jobTemplate', 'spec', 'template', 'spec', 'nodeSelector']
          : ['spec', 'template', 'spec', 'nodeSelector'];

      // Resolve the desired nodeSelector. Custom --labels enables reusable pools;
      // otherwise pin by the always-present hostname label.
      let selector = { 'kubernetes.io/hostname': node };
      if (!remove && options.labels) {
        selector = {};
        for (const pair of `${options.labels}`
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)) {
          const eq = pair.indexOf('=');
          if (eq < 0) continue;
          selector[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
        }
      }

      // Verify the target node exists, and apply custom labels to it if provided.
      if (!remove) {
        const found = shellExec(`kubectl get node ${node} -o name`, {
          silent: true,
          stdout: true,
          silentOnError: true,
        }).trim();
        if (!found) throw new Error(`Target node not found: ${node}`);
        if (options.labels) {
          const labelArgs = Object.entries(selector)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ');
          const labelCmd = `kubectl label node ${node} ${labelArgs} --overwrite`;
          if (dryRun) logger.info(`[dry-run] ${labelCmd}`);
          else shellExec(labelCmd);
        }
      }

      const kubectlNames = (kind) =>
        (
          shellExec(`kubectl get ${kind} -n ${ns} -o name`, {
            silent: true,
            stdout: true,
            silentOnError: true,
          }).trim() || ''
        )
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);

      // Build the list of "kind/name" targets from the selection grammar.
      let targets = [];
      if (!path) {
        for (const kind of ['deployment', 'statefulset', 'daemonset']) targets.push(...kubectlNames(kind));
      } else if (path.includes('/')) {
        targets = [path];
      } else {
        targets = kubectlNames(path);
      }

      if (targets.length === 0) {
        logger.warn('node-move: no matching resources found', { path, namespace: ns });
        return [];
      }

      // Merge-patch body that sets (or clears, when --remove) the nodeSelector.
      const buildPatch = (kind) => {
        const keys = templateSelectorPath(kind);
        let obj = remove ? null : selector;
        for (let i = keys.length - 1; i >= 0; i--) obj = { [keys[i]]: obj };
        return JSON.stringify(obj);
      };

      const results = [];
      for (const ref of targets) {
        const slash = ref.indexOf('/');
        const rawKind = slash >= 0 ? ref.slice(0, slash) : path && !path.includes('/') ? path : '';
        const name = slash >= 0 ? ref.slice(slash + 1) : ref;
        const kind = normalizeKind(`${rawKind}`.split('.')[0].toLowerCase());

        if (!templated.includes(kind)) {
          logger.warn(`node-move: ${kind}/${name} is not a schedulable controller; skipping`, {
            hint: 'move its owning controller (deployment/statefulset/daemonset) instead',
          });
          results.push({ ref, kind, status: 'skipped' });
          continue;
        }

        // Idempotency: skip the patch if the resource is already where we want
        // it. Compares the live pod-template nodeSelector against the desired
        // placement so a repeated run does not trigger an unnecessary rollout.
        const basePath = kind === 'cronjob' ? 'spec.jobTemplate.spec.template.spec' : 'spec.template.spec';
        const jsonpath = (expr) =>
          shellExec(`kubectl get ${kind} ${name} -n ${ns} -o jsonpath='${expr}'`, {
            silent: true,
            stdout: true,
            silentOnError: true,
            disableLog: true,
          }).trim();

        if (remove) {
          const current = jsonpath(`{.${basePath}.nodeSelector}`);
          if (!current || current === 'map[]') {
            logger.info(`node-move: ${kind}/${name} already has no nodeSelector; nothing to clear`);
            results.push({ ref, kind, status: 'already-cleared' });
            continue;
          }
        } else {
          const alreadyOnNode = Object.entries(selector).every(([k, v]) => {
            const esc = k.replace(/\./g, '\\.');
            return jsonpath(`{.${basePath}.nodeSelector.${esc}}`) === v;
          });
          if (alreadyOnNode) {
            logger.info(`node-move: ${kind}/${name} already pinned to ${node}; skipping`, { namespace: ns });
            results.push({ ref, kind, status: 'already-on-node', node });
            continue;
          }
        }

        const patchCmd = `kubectl patch ${kind} ${name} -n ${ns} --type=merge -p '${buildPatch(kind)}'`;
        if (dryRun) {
          logger.info(`[dry-run] ${patchCmd}`);
          results.push({ ref, kind, status: 'dry-run', node: remove ? undefined : node });
          continue;
        }

        shellExec(patchCmd);
        // nodeSelector is part of the pod template, so this patch already
        // creates a new controller revision. A rollout restart here creates a
        // second, immediately superseding revision and can strand the previous
        // Ready replica in "pending termination" while the newest pod starts.
        logger.info(remove ? `Cleared node placement: ${kind}/${name}` : `Moved ${kind}/${name} -> ${node}`, {
          namespace: ns,
        });
        results.push({ ref, kind, status: remove ? 'cleared' : 'moved', node: remove ? undefined : node });
      }

      logger.info('node-move complete', { namespace: ns, node: remove ? null : node, count: results.length });
      return results;
    },

    /**
     * @method dev-hosts-expose
     * @description Deploys a specified service in development mode with `/etc/hosts` modification for local access.
     * @param {string} path - The input value, identifier, or path for the operation (used as the deployment ID to deploy).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-hosts-expose': async (path, options = DEFAULT_OPTION) => {
      shellExec(`node bin deploy ${path} development --disable-update-deployment --disable-update-proxy --kubeadm`);
      // /etc/hosts is written here, not by `deploy`: that command has no
      // --etc-hosts option, and the `etc-hosts` runner already resolves a
      // deploy's hosts from its conf.server.json.
      await UnderpostRun.RUNNERS['etc-hosts']('', { ...options, deployId: path });
    },

    /**
     * @method dev-hosts-restore
     * @description Restores the `/etc/hosts` file to its original state after modifications made during development deployments.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dev-hosts-restore': (path, options = DEFAULT_OPTION) => {
      // Rewrite /etc/hosts with the loopback block alone, dropping the deploy
      // host entries `dev-hosts-expose` (and the `cluster` runner) added.
      const hostListenResult = etcHostFactory([]);
      logger.info(hostListenResult.renderHosts);
    },

    /**
     * @method cluster-build
     * @description Build configuration for cluster deployment.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'cluster-build': (path, options = DEFAULT_OPTION) => {
      const nodeOptions =
        (options.nodeName ? ` --node-name ${options.nodeName}` : '') +
        (options.sshKeyPath ? ` --ssh-key-path ${options.sshKeyPath}` : '');
      shellExec(`node bin run clean`);
      shellExec(`node bin run --dev sync-replica template-deploy${nodeOptions}`);
      shellExec(`node bin run sync-replica template-deploy${nodeOptions}`);
      shellExec(`node bin env clean`);
      for (const deployId of fs.readFileSync('./engine-private/deploy/dd.router', 'utf8').split(','))
        shellExec(`node bin new --default-conf --deploy-id ${deployId.trim()}`);
      if (path === 'cmt') {
        shellExec(`git add . && underpost cmt . build cluster-build`);
        shellExec(`cd engine-private && git add . && underpost cmt . build cluster-build`);
      }
    },
    /**
     * @method template-deploy
     * @description Pushes `engine-private`, dispatches CI workflow to build `pwa-microservices-template`,
     * and optionally triggers engine-<conf-id> CI with sync/init which in turn dispatches the CD workflow
     * after the build chain completes (template → ghpkg → engine-<conf-id> → CD).
     * @param {string} path - The deployment path identifier (e.g., 'sync-engine-core', 'init-engine-core', or empty for build-only).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'template-deploy': (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`npm run security:secrets`);
      const reportPath = './gitleaks-report.json';
      if (fs.existsSync(reportPath) && JSON.parse(fs.readFileSync(reportPath, 'utf8')).length > 0) {
        logger.error('Secrets detected in gitleaks-report.json, aborting template-deploy');
        return;
      }
      shellExec(`${baseCommand} run pull`);
      shellExec(`${baseCommand} run shared-dir`);

      // Capture the sanitized message from the last N commits (--from-n-commit, default 1) for
      // propagation to pwa-microservices-template and every engine-* repo.
      const fromN = parseInt(options.fromNCommit) > 0 ? parseInt(options.fromNCommit) : 1;
      const sanitizedMessage = shellExec(`node bin cmt --changelog-msg --from-n-commit ${fromN} --changelog-no-hash`, {
        silent: true,
        stdout: true,
      }).trim();

      shellExec(
        `${baseCommand} push ./engine-private ${options.force ? '-f ' : ''}${
          process.env.GITHUB_USERNAME
        }/engine-private`,
      );
      shellCd('/home/dd/engine');

      // Push engine repo so workflow YAML changes reach GitHub
      shellExec(`git reset`);
      shellExec(`${baseCommand} push . ${options.force ? '-f ' : ''}${process.env.GITHUB_USERNAME}/engine`);

      // Determine deploy conf and type from path (sync-engine-core, init-engine-core, etc.)
      let deployConfId = '';
      let deployType = '';
      if (path.startsWith('sync-')) {
        deployConfId = path.replace(/^sync-/, '');
        deployType = 'sync-and-deploy';
      } else if (path.startsWith('init-')) {
        deployConfId = path.replace(/^init-/, '');
        deployType = 'init';
      }

      // If --build is set and path is a sync-engine-* target, push the pre-built client bundle
      // to Cloudinary so the remote container can pull it instead of rebuilding from source.
      if (options.build && deployConfId && deployConfId.startsWith('engine-')) {
        const confName = deployConfId.replace(/^engine-/, '');
        const pushDeployId = options.deployId || `dd-${confName}`;
        logger.info(`[template-deploy] Running push-bundle for deployId: ${pushDeployId}`);
        shellExec(`${baseCommand} run push-bundle --deploy-id ${pushDeployId}`);
      }

      // Dispatch npmpkg CI workflow — this builds pwa-microservices-template first.
      // If deployConfId is set, npmpkg.ci.yml will dispatch the engine-<conf-id> CI
      // with sync=true after template build completes. The engine CI then dispatches
      // the CD workflow after the engine repo build finishes — ensuring correct sequence:
      // npmpkg.ci → engine-<id>.ci → engine-<id>.cd
      const repo = `${process.env.GITHUB_USERNAME}/engine`;
      const inputs = {};
      if (sanitizedMessage) inputs.message = sanitizedMessage;
      if (deployConfId) inputs.deploy_conf_id = deployConfId;
      if (deployType) inputs.deploy_type = deployType;

      // Omit `ref` so dispatchWorkflow auto-detects the repo's default branch
      // (a fork may default to `main` rather than the monorepo's `master`).
      Underpost.repo.dispatchWorkflow({
        repo,
        workflowFile: 'npmpkg.ci.yml',
        inputs,
      });
    },

    /**
     * @method template-deploy-local
     * @description Similar to `template-deploy` but runs the workflow locally without dispatching GitHub Actions. It pulls the latest changes, pushes to GitHub, builds the template, and optionally triggers a local release with CI push.
     * @param {string} path - The deployment path identifier (e.g., 'sync-engine-core', 'init-engine-core', or empty for build-only).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'template-deploy-local': async (path, options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`npm run security:secrets`);
      const reportPath = './gitleaks-report.json';
      if (fs.existsSync(reportPath) && JSON.parse(fs.readFileSync(reportPath, 'utf8')).length > 0) {
        logger.error('Secrets detected in gitleaks-report.json, aborting template-deploy');
        return;
      }
      shellExec(`${baseCommand} run pull`);
      shellExec(`${baseCommand} run shared-dir`);

      // Capture the sanitized message from the last N commits (--from-n-commit, default 1).
      const fromN = parseInt(options.fromNCommit) > 0 ? parseInt(options.fromNCommit) : 1;
      const sanitizedMessage = shellExec(`node bin cmt --changelog-msg --from-n-commit ${fromN} --changelog-no-hash`, {
        silent: true,
        stdout: true,
      }).trim();

      const { triggerCmd } = path
        ? await Underpost.release.ci(path, sanitizedMessage, options)
        : await Underpost.release.pwa(sanitizedMessage, options);
      pbcopy(triggerCmd + ' && cd /home/dd/engine');
    },
    /**
     * @method docker-image
     * @description Dispatches the Docker image CI workflow (`docker-image[.<runtime>].ci.yml`) via `workflow_dispatch`.
     * Repository resolution is delegated to `Underpost.repo.resolveInstanceRepo(path)`.
     * @param {string} path - Optional runtime / workflow suffix (e.g. `cyberia-server`, `cyberia-client`).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'docker-image': (path, options = DEFAULT_OPTION) => {
      const repo = Underpost.repo.resolveInstanceRepo(path, !options.test);
      Underpost.repo.dispatchWorkflow({
        repo,
        workflowFile: `docker-image${path ? `.${path}` : ''}${options.dev ? '.dev' : ''}.ci.yml`,
        inputs: {},
      });
    },
    /**
     * @method clean
     * @description Changes directory to the provided path (defaulting to `/home/dd/engine`) and runs `node bin/deploy clean-core-repo`.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional directory path).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    clean: (path = '', options = DEFAULT_OPTION) => {
      Underpost.repo.clean({ paths: path ? path.split(',') : ['/home/dd/engine', '/home/dd/engine/engine-private'] });
      if (options.dev) shellExec(`node bin run shared-dir ${path ? path : '/home/dd/engine'}`);
    },
    /**
     * @method pull
     * @description Clones or pulls updates for the `engine` and `engine-private` repositories into `/home/dd/engine` and `/home/dd/engine/engine-private`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    pull: (path, options = DEFAULT_OPTION) => {
      // shellExec is fail-fast by default — any non-zero exit throws and
      // propagates up to the workflow step. No per-call flag required.
      if (!fs.existsSync(`/home/dd`) || !fs.existsSync(`/home/dd/engine`)) {
        fs.mkdirSync(`/home/dd`, { recursive: true });
        shellExec(`cd /home/dd && underpost clone ${process.env.GITHUB_USERNAME}/engine`, { silent: true });
      } else {
        shellExec(`underpost run clean`);
        shellExec(`cd /home/dd/engine && underpost pull . ${process.env.GITHUB_USERNAME}/engine`, { silent: true });
      }
      if (!fs.existsSync(`/home/dd/engine/engine-private`))
        shellExec(`cd /home/dd/engine && underpost clone ${process.env.GITHUB_USERNAME}/engine-private`, {
          silent: true,
        });
      else
        shellExec(
          `cd /home/dd/engine/engine-private && underpost pull . ${process.env.GITHUB_USERNAME}/engine-private`,
          { silent: true },
        );
    },
    /**
     * @method release-deploy
     * @description Executes deployment (`underpost run deploy`) for all deployment IDs listed in `./engine-private/deploy/dd.router`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'release-deploy': (path, options = DEFAULT_OPTION) => {
      actionInitLog();
      shellExec(`underpost --version`);
      shellCd(`/home/dd/engine`);
      for (const _deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',')) {
        const deployId = _deployId.trim();
        shellExec(`underpost run deploy ${deployId}`, { async: true });
      }
    },
    /**
     * @method ssh-deploy
     * @description Dispatches the corresponding CD workflow for SSH-based deployment, replacing empty commits with workflow_dispatch.
     * @param {string} path - The deployment identifier (e.g., 'engine-core', 'sync-engine-core', 'init-engine-core').
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ssh-deploy': (path, options = DEFAULT_OPTION) => {
      actionInitLog();

      let job = 'deploy';
      let confId = path;
      if (path.startsWith('sync-')) {
        job = 'sync-and-deploy';
        confId = path.replace(/^sync-/, '');
      } else if (path.startsWith('init-')) {
        job = 'init';
        confId = path.replace(/^init-/, '');
      }
      const repo = Underpost.repo.resolveInstanceRepo(confId, !options.test);
      // Omit `ref` so dispatchWorkflow auto-detects the target repo's default
      // branch (getDefaultBranch): the monorepo is `master` but instance repos
      // like engine-cyberia default to `main` — hardcoding either 422s.
      Underpost.repo.dispatchWorkflow({
        repo,
        workflowFile: `${confId}.cd.yml`,
        inputs: { job },
      });
    },
    /**
     * @method ide
     * @description Opens a Visual Studio Code (VS Code) session for the specified path using `node ${underpostRoot}/bin/zed ${path}`,
     * or installs Zed and sublime-text IDE if `path` is 'install'.
     * @param {string} path - The input value, identifier, or path for the operation (used as the path to the directory to open in the IDE).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ide: (path = '', options = DEFAULT_OPTION) => {
      const underpostRoot = options.dev ? '.' : options.underpostRoot;
      const [projectPath, customIde] = path.split(',');
      if (projectPath === 'install') {
        if (customIde === 'zed') shellExec(`sudo curl -f https://zed.dev/install.sh | sh`);
        else if (customIde === 'subl') {
          shellExec(
            `sudo dnf config-manager --add-repo https://download.sublimetext.com/rpm/stable/x86_64/sublime-text.repo`,
          );
          shellExec(`sudo dnf install -y sublime-text`);
        } else {
          shellExec(`sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc &&
echo -e "[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\nautorefresh=1\ntype=rpm-md\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" | sudo tee /etc/yum.repos.d/vscode.repo > /dev/null`);
          shellExec(`sudo dnf install -y code`);
        }
        return;
      }
      if (customIde === 'zed') shellExec(`node ${underpostRoot}/bin/zed ${projectPath}`);
      else shellExec(`node ${underpostRoot}/bin/vs ${projectPath}`);
    },
    /**
     * @method crypto-policy
     * @description Sets the system's crypto policies to `DEFAULT:SHA1` using `update-crypto-policies` command.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'crypto-policy': (path, options = DEFAULT_OPTION) => {
      shellExec(`sudo update-crypto-policies --set DEFAULT:SHA1`);
    },
    /**
     * @method sync
     * @description Cleans up, and then runs a deployment synchronization command (`underpost deploy --kubeadm --build-manifest --sync...`) using parameters parsed from `path` (deployId, replicas, versions, image, node).
     *
     * Forwards `--image-pull-policy <policy>` to the underlying `deploy --build-manifest` invocation when `options.imagePullPolicy` is set,
     * which then plumbs through `buildManifest` and `deploymentYamlPartsFactory` to override the container `imagePullPolicy` in the generated
     * `deployment.yaml`. Useful when you want to force `Always` so the kubelet re-pulls a mutable tag on every rollout. Example:
     *   `node bin run sync dd-core --kubeadm --image-pull-policy Always`
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string containing deploy parameters).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    sync: async (path, options = DEFAULT_OPTION) => {
      // Dev usage: node bin run --dev --build sync dd-default
      const env = options.dev ? 'development' : 'production';
      options = { ...options, gatewayApi: gatewayApiEnabledFactory(options) };
      const baseCommand = 'node bin'; // options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const clusterFlag = options.k3s ? ' --k3s' : options.kind ? ' --kind' : ' --kubeadm';
      const defaultPath = [
        'dd-default',
        options.replicas,
        ``,
        ``,
        !options.kubeadm && !options.k3s ? 'kind-control-plane' : os.hostname(),
      ];
      let [deployId, replicas, versions, image, node] = path ? path.split(',') : defaultPath;
      deployId = deployId ? deployId : defaultPath[0];
      replicas = replicas ? replicas : defaultPath[1];
      versions = versions ? versions.replaceAll('+', ',') : defaultPath[2];
      image = image ? image : defaultPath[3];
      node = node ? node : options.nodeName ? options.nodeName : defaultPath[4];
      shellExec(`${baseCommand} cluster --ns-use ${options.namespace}`);

      if (image && !image.startsWith('localhost'))
        Underpost.image.pullDockerHubImage({
          dockerhubImage: image,
          kind: options.kind || (!options.nodeName && !options.kubeadm && !options.k3s),
          kubeadm: options.nodeName || options.kubeadm,
          k3s: options.k3s,
        });

      if (isDeployRunnerContext(path, options)) {
        if (!options.disablePrivateConfUpdate) {
          const { validVersion } = Underpost.repo.privateConfUpdate(deployId);
          if (!validVersion) throw new Error('Version mismatch');
        }
        if (options.timezone !== 'none') shellExec(`${baseCommand} run${baseClusterCommand} tz`);
        if (options.deployIdCronJobs !== 'none') {
          // --deploy-id-cron-jobs overrides the cron deploy-id; unset falls back to
          // dd.cron, the same source `cron --setup-start` resolves against on its own.
          const cronDeployId = options.deployIdCronJobs || cronDeployIdResolve() || '';
          if (cronDeployId && !/^[a-zA-Z0-9._,-]+$/.test(cronDeployId))
            throw new Error(`Invalid cron deploy-id: ${cronDeployId}`);
          shellExec(
            `node bin cron${cronDeployId ? ` ${cronDeployId}` : ''}${baseClusterCommand}${clusterFlag} --setup-start --git --apply`,
          );
        }
      }

      const currentTraffic = isDeployRunnerContext(path, options)
        ? Underpost.deploy.getCurrentTraffic(deployId, {
            namespace: options.namespace,
            env,
            gatewayApi: options.gatewayApi,
          })
        : '';
      let targetTraffic = currentTraffic ? (currentTraffic === 'blue' ? 'green' : 'blue') : 'green';
      if (targetTraffic) versions = versions ? versions : targetTraffic;

      // The routed colour is only live traffic while it still has a ready
      // endpoint. Everything downstream that would take the host offline to prove
      // the maintenance fallback is conditional on this being false: a first
      // bring-up has nothing to interrupt, a re-deploy does.
      const serving = isTrafficServingFactory({
        liveTraffic: currentTraffic,
        hasReadyEndpoints: (colour) =>
          Underpost.deploy.serviceHasReadyEndpoints({
            service: `${deployId}-${env}-${colour}-service`,
            namespace: options.namespace || 'default',
          }),
      });

      const ignorePods =
        isDeployRunnerContext(path, options) && targetTraffic
          ? Underpost.kubectl.get(`${deployId}-${env}-${targetTraffic}`, 'pods', options.namespace).map((p) => p.NAME)
          : [];

      const timeoutFlags = Underpost.deploy.timeoutFlagsFactory(options);
      const cmdString = options.cmd
        ? ' --cmd ' + (options.cmd.find((c) => c.match('"')) ? '"' + options.cmd + '"' : "'" + options.cmd + "'")
        : '';
      const gitCleanFlag = options.gitClean ? ' --git-clean' : '';

      const skipFullBuildFlag = options.skipFullBuild ? ' --skip-full-build' : '';
      const pullBundleFlag = options.pullBundle ? ' --pull-bundle' : '';
      const imagePullPolicyFlag = options.imagePullPolicy ? ` --image-pull-policy ${options.imagePullPolicy}` : '';
      const sshKeyPathFlag = options.sshKeyPath ? ` --ssh-key-path ${options.sshKeyPath}` : '';
      const gatewayApiFlags = Underpost.deploy.gatewayApiFlagsFactory(options);

      // A direct sync owns the same gateway-first contract as the full cluster
      // runner. Build the host-side SSR documents before generating routes unless
      // the caller explicitly selected a pre-built bundle workflow.
      if (isDeployRunnerContext(path, options) && !options.skipFullBuild)
        shellExec(`${baseCommand} client ${deployId} ${env}`);

      shellExec(
        `${baseCommand} deploy${clusterFlag} --build-manifest --sync --info-router --replicas ${replicas} --node ${node}${
          image ? ` --image ${image}` : ''
        }${versions ? ` --versions ${versions}` : ''}${
          options.namespace ? ` --namespace ${options.namespace}` : ''
        }${timeoutFlags}${cmdString}${gitCleanFlag}${skipFullBuildFlag}${pullBundleFlag}${imagePullPolicyFlag}${sshKeyPathFlag}${gatewayApiFlags} ${deployId} ${env}`,
      );

      if (isDeployRunnerContext(path, options)) {
        if (options.gatewayApi) {
          const namespace = options.namespace || 'default';
          const gatewayRoot = Underpost.deploy.underpostGatewayRootFactory(options);
          shellExec(`kubectl rollout status deployment/${UNDERPOST_GATEWAY.name} -n ${namespace} --timeout=5m`);
          const staticAssets = Underpost.deploy.syncStaticAssets(deployId, env, {
            ...options,
            namespace,
            // Prefer the currently serving workload as the document source. On
            // an initial deploy there is none, so sync falls back to the checkout.
            versions: currentTraffic || versions || targetTraffic,
          });
          assertStaticAssets({ records: staticAssets, hostRoot: gatewayRoot, label: 'sync' });

          if (serving)
            logger.info('[sync] Live colour serving; holding traffic until the target colour is Ready', {
              deployId,
              live: currentTraffic,
              target: targetTraffic,
            });
          else {
            // Remove any inactive-colour workload left by an earlier cycle. Without
            // this cleanup the probe could hit a stale Ready pod and never exercise
            // the configured unavailable-backend fallback.
            shellExec(
              `kubectl delete service ${deployId}-${env}-${targetTraffic}-service -n ${namespace} --ignore-not-found`,
            );
            shellExec(
              `kubectl delete deployment ${deployId}-${env}-${targetTraffic} -n ${namespace} --ignore-not-found`,
            );
            // Publish the target-colour route while its Service is deliberately
            // absent. Site paths reach underpost-gateway and must return the
            // configured maintenance body before deployment.yaml is submitted.
            shellExec(
              `${baseCommand} deploy${clusterFlag}${cmdString} --replicas ${replicas} --node ${node} --disable-update-deployment ${deployId} ${env} --versions ${versions}${
                options.namespace ? ` --namespace ${options.namespace}` : ''
              }${timeoutFlags}${gitCleanFlag}${imagePullPolicyFlag}${sshKeyPathFlag}${gatewayApiFlags}`,
            );
            await gatewayFallbackProbeRunner({
              gatewayStatusRunner: UnderpostRun.RUNNERS['gateway-status'],
              checks: pwaFallbackChecksFactory(deployId),
              options,
              label: 'sync',
            });
          }
        }

        // Backup app/services repositories with repo-backup configured
        shellExec(
          `${baseCommand} db ${deployId} ${clusterFlag}${baseClusterCommand} --repo-backup --primary-pod --git --force-clone --preserveUUID ${options.namespace ? ` --ns ${options.namespace}` : ''}`,
        );
        shellExec(
          `${baseCommand} deploy${clusterFlag}${cmdString} --replicas ${replicas} --node ${node} --disable-update-proxy ${deployId} ${env} --versions ${versions}${
            options.namespace ? ` --namespace ${options.namespace}` : ''
          }${timeoutFlags}${gitCleanFlag}${imagePullPolicyFlag}${sshKeyPathFlag}${gatewayApiFlags}`,
        );
        if (!targetTraffic)
          targetTraffic = Underpost.deploy.getCurrentTraffic(deployId, {
            namespace: options.namespace,
            env,
            gatewayApi: options.gatewayApi,
          });
        await Underpost.monitor.monitorReadyRunner(deployId, env, targetTraffic, ignorePods, options.namespace);
        Underpost.deploy.switchTraffic(deployId, env, targetTraffic, replicas, options.namespace, options);
      } else
        logger.info(
          'current traffic',
          Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace, env }),
        );
    },

    /**
     * @method stop
     * @description Deletes colour-suffixed Deployments and their Services, leaving routing untouched.
     *
     * Four ways to say what to stop, resolved by {@link ServerConfBuilder.stopPlanFactory}:
     *
     * ```bash
     * # Literal: exactly this Deployment, flags ignored
     * node bin run stop dd-cyberia-mmo-server-forest-development-blue
     *
     * # The deploy's PWA workload, inactive colour
     * node bin run stop --deploy-id dd-cyberia
     *
     * # ...plus every variant of each instance family, inactive colour
     * node bin run stop --deploy-id dd-cyberia --instance-id mmo-client,mmo-server
     *
     * # Explicit colours; both, where they exist
     * node bin run stop --deploy-id dd-cyberia --traffic blue,green
     * ```
     *
     * The default colour is the blue/green partner of whatever each target is
     * serving, so a stop is safe against a live host unless `--traffic` names the
     * serving colour outright — which is warned about, not refused.
     *
     * That colour is read through the same routing stack that published it: the
     * Gateway API HTTPRoute by default, the Contour HTTPProxy under
     * `--disable-gateway-api`. Reading the wrong kind finds no colour, degrades to
     * "blue", and stops whichever Deployment happens to carry that name. It is
     * resolved per target too — an instance's colour lives under its own
     * `<deployId>-<instanceId>` prefix, and on a shared host the parent's answer
     * belongs to a different variant.
     * @param {string} [path] - Literal comma-separated Deployment names; when set, every flag is ignored.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    stop: async (path = '', options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const namespace = options.namespace || 'default';
      const gatewayApi = gatewayApiEnabledFactory(options);

      // Memoized because the plan and the serving check ask the same question,
      // and `--traffic` skips the plan's lookup entirely — which is exactly when
      // the check has to make its own.
      const liveTraffic = {};
      const liveTrafficOf = (target) => {
        if (liveTraffic[target.id] === undefined)
          liveTraffic[target.id] =
            Underpost.deploy.getCurrentTraffic(target.id, {
              hostTest: target.host || options.hosts,
              namespace,
              env,
              gatewayApi,
            }) || '';
        return liveTraffic[target.id];
      };

      const { deployments, error } = stopPlanFactory({
        path,
        deployId: options.deployId,
        instanceId: options.instanceId,
        traffic: options.traffic,
        env,
        instancesFor: (instanceId) => selectConfInstances(loadConfInstances(options.deployId), instanceId),
        liveTrafficOf,
      });
      if (error) {
        logger.error(error);
        return [];
      }

      // Read once: it decides what is reported as actually stopped, and a target
      // that is already gone is a no-op worth naming rather than a silent delete.
      const deployedNames = Underpost.kubectl.get('', 'deployment', namespace).map((entry) => entry.NAME);
      const stopped = [];
      for (const target of deployments) {
        const existed = deployedNames.includes(target.deployment);
        if (existed) stopped.push(target.deployment);
        // The Service is deleted either way: an orphan left by a half-finished
        // cycle outlives its Deployment and would keep resolving to no endpoints.
        shellExec(`kubectl delete deployment ${target.deployment} -n ${namespace} --ignore-not-found`);
        shellExec(`kubectl delete svc ${target.deployment}-service -n ${namespace} --ignore-not-found`);
      }

      const serving = deployments.filter(
        (target) => target.kind !== 'literal' && target.colour === liveTrafficOf(target),
      );
      if (serving.length > 0)
        logger.warn('Stopped the serving colour; those routes stay published and now have no backend', {
          deployments: serving.map((target) => target.deployment),
        });
      logger.info('Stop complete', {
        namespace,
        stopped,
        absent: deployments.filter((target) => !stopped.includes(target.deployment)).map((t) => t.deployment),
      });
      return stopped;
    },

    /**
     * @method tz
     * @description Sets the system timezone using `timedatectl set-timezone` command.
     * @param {string} path - The input value, identifier, or path for the operation (used as the timezone string).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    tz: (path, options = DEFAULT_OPTION) => {
      const tz =
        options.timezone && options.timezone !== 'none'
          ? options.timezone
          : path
            ? path
            : Underpost.env.get('TIME_ZONE', undefined, { disableLog: true })
              ? Underpost.env.get('TIME_ZONE')
              : process.env.TIME_ZONE
                ? process.env.TIME_ZONE
                : 'America/New_York';
      shellExec(`sudo timedatectl set-timezone ${tz}`);
    },

    /**
     * @method get-traffic
     * @description Prints the live blue/green colour of every routable
     * deployment, of both kinds, as a table.
     * @param {string} [path] - Comma-separated hosts to report on; empty reports every host.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'get-traffic': async (path = '', options = DEFAULT_OPTION) => {
      options = {
        ...options,
        gatewayApi: gatewayApiEnabledFactory(options),
        namespace: options.namespace || 'default',
      };
      // A report answers "what is live", so it cannot pick one environment from a
      // flag and call the other absent: a cluster running `development` would be
      // reported as entirely unrouted. Both are scanned and the environment is a
      // column; `--dev` narrows to development when only that is wanted.
      const envs = options.dev ? ['development'] : options.test ? ['development', 'production'] : ['production'];
      const hosts = `${path || ''}`
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean);

      const confRoot = './engine-private/conf';
      const deployList = options.deployId
        ? resolveDeployList(options.deployId)
        : fs.existsSync(confRoot)
          ? fs
              .readdirSync(confRoot)
              .filter((deployId) => fs.existsSync(`${confRoot}/${deployId}/conf.server.json`))
              .sort()
          : [];

      const deployments = Underpost.kubectl.get('', 'deployment', options.namespace);
      const deployedNames = deployments.map((entry) => entry.NAME);

      // Four cluster-wide reads, correlated once: which kind describes a host,
      // whether its listener terminates TLS, and whether QUIC is enabled on it.
      // A missing CRD is an empty list, so a single-stack cluster reads the same
      // way as one running both.
      const listResources = (kind) => {
        const raw = shellExec(`kubectl get ${kind} -A -o json`, {
          stdout: true,
          silent: true,
          silentOnError: true,
        });
        try {
          const parsed = JSON.parse(`${raw || ''}`);
          return Array.isArray(parsed?.items) ? parsed.items : [];
        } catch {
          return [];
        }
      };
      const ingressFacts = hostIngressFactsFactory({
        httpRoutes: listResources('httproute'),
        httpProxies: listResources('httpproxy'),
        gateways: listResources('gateway'),
        clientTrafficPolicies: listResources('clienttrafficpolicy'),
      });
      const trafficServiceSelectors = Object.fromEntries(
        listResources('service')
          .filter((service) => service?.metadata?.labels?.['underpost.net/traffic-service'] === 'true')
          .map((service) => [
            `${service?.metadata?.namespace || 'default'}/${service?.metadata?.name}`,
            service?.spec?.selector?.app || '',
          ]),
      );

      // One read per host, reused across every deployment and environment that
      // shares it — the colour match is pure, only the fetch is expensive.
      const routingInfo = {};
      const hostRoutingInfo = (host) => {
        if (routingInfo[host] === undefined)
          routingInfo[host] = Underpost.deploy.readHostRoutingInfo({ host, options });
        return routingInfo[host];
      };
      const trafficState = {};
      const liveTrafficStateOf = (entry, env) => {
        const key = `${entry.id}/${env}`;
        if (trafficState[key]) return trafficState[key];
        const stableService = Underpost.deploy.trafficServiceNameFactory({ deployId: entry.id, env });
        const selector = trafficServiceSelectors[`${options.namespace}/${stableService}`] || '';
        const stableTraffic = trafficFromRoutingInfoFactory({ info: selector, deployId: entry.id, env });
        if (stableTraffic)
          return (trafficState[key] = {
            colour: stableTraffic,
            service: stableService,
          });
        const legacyTraffic = trafficFromRoutingInfoFactory({
          info: hostRoutingInfo(entry.host),
          deployId: entry.id,
          env,
        });
        return (trafficState[key] = {
          colour: legacyTraffic,
          service: legacyTraffic ? `${entry.deployment}-${legacyTraffic}-service` : '',
        });
      };
      const servingState = {};
      const servesTraffic = (entry, env) => {
        const service = liveTrafficStateOf(entry, env).service;
        if (!service) return false;
        const key = `${options.namespace}/${service}`;
        if (servingState[key] === undefined)
          servingState[key] = Underpost.deploy.serviceHasReadyEndpoints({
            service,
            namespace: options.namespace,
          });
        return servingState[key];
      };

      const rows = envs.flatMap((env) =>
        trafficTableRowsFactory({
          entries: deployList
            .flatMap((deployId) => deployTrafficEntriesFactory({ deployId, env }))
            .map((entry) => ({ ...entry, env })),
          hosts,
          liveTrafficOf: (entry) => liveTrafficStateOf(entry, env).colour,
          servesTraffic: (entry) => servesTraffic(entry, env),
        }),
      );

      if (rows.length === 0) {
        logger.warn('No configured hosts matched the requested traffic report', {
          hosts,
          envs,
          deployList,
          namespace: options.namespace,
        });
        return rows;
      }

      // Probe the exact public URL represented by each host/path row. PWA rows
      // can carry several configured paths in one cell, while instance rows
      // carry one; cache by URL so shared rows never repeat network work.
      const shellArg = (value) => `'${`${value}`.replaceAll("'", "'\\''")}'`;
      const probeCache = new Map();
      const probePath = (host, routePath, tls) => {
        const normalizedPath = `${routePath || '/'}`.startsWith('/') ? `${routePath || '/'}` : `/${routePath}`;
        let url;
        try {
          url = new URL(normalizedPath, `${tls ? 'https' : 'http'}://${host}`).href;
        } catch {
          return { path: normalizedPath, url: '', statuses: ['000'] };
        }
        if (!probeCache.has(url)) {
          // -L follows the real redirect chain, -v supplies one response line
          // per hop, -i keeps full response headers available, and -s removes
          // only the progress meter. The body is discarded to keep a status
          // report bounded even when a host returns a large application page.
          const raw = shellExec(
            `curl -L -v -i -s --connect-timeout 3 --max-time 12 --max-redirs 10 ` +
              `-o /dev/null -w '\nUNDERPOST_CURL_FINAL=%{http_code}\n' ${shellArg(url)} 2>&1 || true`,
            { stdout: true, silent: true, silentOnError: true, disableLog: true },
          );
          probeCache.set(url, curlStatusChainFactory(raw));
        }
        return { path: normalizedPath, url, statuses: probeCache.get(url) };
      };

      const deploymentByName = new Map(deployments.map((deployment) => [deployment.NAME, deployment]));
      const readinessOf = (deployment) => {
        const replicas = deployment?.READY || '-';
        const [ready, desired] = `${replicas}`.split('/').map(Number);
        return {
          replicas,
          exists: Boolean(deployment),
          ready: Number.isFinite(ready) && Number.isFinite(desired) && desired > 0 && ready === desired,
        };
      };
      const deploymentStatusOf = (row, traffic) => {
        if (!traffic) return null;
        const deployment = `${row.deployment}-${traffic}`;
        return {
          deployment,
          traffic,
          ...readinessOf(deploymentByName.get(deployment)),
        };
      };
      const reportRows = rows.map((row) => {
        const facts = ingressFacts[row.host] || {};
        const probes = [...new Set(`${row.path || '/'}`.split(/\s+/).filter(Boolean))].map((routePath) =>
          probePath(row.host, routePath, facts.tls),
        );
        const oppositeTraffic = row.traffic ? nextTrafficFactory(row.traffic) : '';
        const current = deploymentStatusOf(row, row.traffic);
        const opposite = deploymentStatusOf(row, oppositeTraffic);
        return {
          ...row,
          probes,
          current: current ? { ...current, serving: row.serving } : null,
          opposite,
        };
      });

      // Padded on the raw values, coloured afterwards: an ANSI escape counts
      // toward String.length and would skew every column right of it.
      const columns = ['HOST', 'PATH', 'KIND', 'ROUTE', 'TLS', 'HTTP3', 'CURRENT', 'OPPOSITE'];
      const deploymentStatus = (status, includeServing = false) => {
        if (!status) return `unrouted - missing${includeServing ? ' not-serving' : ''}`;
        return [
          status.deployment,
          status.replicas,
          status.exists ? (status.ready ? 'ready' : 'not-ready') : 'missing',
          ...(includeServing ? [status.serving ? 'serving' : 'not-serving'] : []),
        ].join(' ');
      };
      const cellOf = (row) => {
        const facts = ingressFacts[row.host] || {};
        const pathStatus = row.probes.map((probe) => `${probe.path} [${probe.statuses.join('→')}]`).join(' ');
        return [
          row.host,
          pathStatus,
          row.kind,
          facts.route || 'none',
          facts.tls ? 'yes' : 'no',
          facts.http3 ? 'yes' : 'no',
          deploymentStatus(row.current, true),
          deploymentStatus(row.opposite),
        ];
      };
      const paint = (value, i) => {
        if (columns[i] === 'PATH')
          return value.replace(/\b(?:000|[1-5][0-9]{2})\b/g, (status) => {
            if (/^1/.test(status)) return status.cyan;
            if (/^2/.test(status)) return status.green;
            if (/^3/.test(status)) return status.cyan;
            if (/^4/.test(status)) return status.yellow;
            return status.red;
          });
        if (columns[i] === 'CURRENT' || columns[i] === 'OPPOSITE') {
          if (value === '-') return value;
          const [deployment, replicas, status, serving] = value.split(' ');
          const deploymentDisplay = deployment.replace(
            /-(blue|green)$/,
            (_, traffic) => `-${traffic === 'blue' ? traffic.bgBlue.bold.black : traffic.bgGreen.bold.black}`,
          );
          const replicasDisplay = readinessOf({ READY: replicas }).ready ? replicas.green : replicas.red;
          const statusDisplay = status === 'ready' ? status.green : status.red;
          const servingDisplay = serving ? (serving === 'serving' ? serving.green : serving.red) : '';
          return [deploymentDisplay, replicasDisplay, statusDisplay, servingDisplay].filter(Boolean).join(' ');
        }
        // TLS and HTTP/3 being off is a normal development state, not a fault, so
        // only the affirmative is highlighted.
        if (columns[i] === 'TLS' || columns[i] === 'HTTP3') return value === 'yes' ? value.green : value;
        if (columns[i] === 'ROUTE') return value === 'none' ? value.red : value;
        return value;
      };
      // A shared table renderer, called once per environment when both are
      // scanned: mixing development and production rows into one table is what
      // made an unrouted production host look like a duplicate of the same,
      // live development host.
      const printTable = (cells, heading) => {
        const widths = columns.map((column, i) => Math.max(column.length, ...cells.map((cell) => `${cell[i]}`.length)));
        const line = (values, painted) =>
          values
            .map(
              (value, i) => (painted ? paint(`${value}`, i) : `${value}`) + ' '.repeat(widths[i] - `${value}`.length),
            )
            .join('  ');
        console.log(heading ? `\n${heading.bold}\n${line(columns, false).bold}` : `\n${line(columns, false).bold}`);
        console.log(widths.map((width) => '-'.repeat(width)).join('  '));
        for (const cell of cells) console.log(line(cell, true));
      };
      for (const env of envs) {
        const envCells = reportRows.filter((row) => row.env === env).map(cellOf);
        if (envCells.length > 0) printTable(envCells, `[${env.toUpperCase()}]`);
      }
      console.log('');
      return reportRows;
    },

    /**
     * @method restore-mongo
     * @description Initializes a MongoDB replica set in the cluster without resetting existing data.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'restore-mongo': async (path, options = DEFAULT_OPTION) => {
      await MongoBootstrap.initReplicaSet({
        namespace: options.namespace || 'default',
        reset: options.reset || false,
        clusterType: options.kubeadm ? 'kubeadm' : options.k3s ? 'k3s' : 'kind', // o 'k3s' / 'kubeadm' según corresponda
        underpostRoot: '.',
      });
    },

    /**
     * @method ingress-refresh
     * @description Rebuilds the shared HTTPProxy/HTTPRoute host map without
     * inheriting application workload placement. Supplying a path or
     * `--ingress-node` is the explicit recovery mechanism for relocating the
     * public 80/443 listener.
     * @param {string} [path] - Optional ingress node name.
     * @param {UnderpostRunDefaultOptions} options - Runner options.
     * @returns {boolean} True after the ingress is Ready with the refreshed map.
     * @memberof UnderpostRun
     */
    'ingress-refresh': (path = '', options = DEFAULT_OPTION) => {
      const namespace = options.namespace || 'default';
      const ingressNode = options.ingressNode || `${path || ''}`.trim();
      const updated = Underpost.cluster.refreshUnderpostIngress({
        namespace,
        options: { ...options, ingressNode },
      });
      if (!updated)
        throw new Error(
          `[ingress-refresh] ${UNDERPOST_INGRESS.name} is not installed; install both ingress stacks first`,
        );
      logger.info('[ingress-refresh] Shared ingress is operational', {
        namespace,
        node: ingressNode || '(preserved)',
      });
      return true;
    },

    'instance-promote': async (path, options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      options = { ...options, gatewayApi: gatewayApiEnabledFactory(options) };
      let [deployId, id] = path.split(',');
      const confInstances = loadConfInstances(deployId);
      const promoted = selectConfInstances(confInstances, id);
      let promotedTraffic = '';

      // A Contour HTTPProxy is named after its host, so every instance sharing a
      // host shares one object. Rebuilding it from the promoted instance alone
      // would drop its siblings' routes, so each host is rendered from the full
      // set: promoted instances flip colour, the rest keep their live colour.
      //
      // "Full set" is not what the conf currently declares. Each variant sub-path
      // is its own deployment, and one that was dropped from the conf while its
      // workload is still up must keep its route — otherwise editing the variant
      // list to scope a deploy takes the untouched variants offline. The
      // descriptors last published for the host cover exactly that gap, and a
      // variant leaves the render only once its Deployment is gone.
      const promotedIds = new Set(promoted.map((instance) => instance.id));
      const hosts = [...new Set(promoted.map((instance) => instance.host))];
      const namespace = options.namespace || 'default';
      const gatewayConfDir = Underpost.deploy.gatewayConfDirFactory({ deployId, env });
      const deployedNames = Underpost.kubectl.get('', 'deployment', namespace).map((entry) => entry.NAME);
      const instancesByHost = Object.fromEntries(
        hosts.map((host) => [
          host,
          hostRenderInstancesFactory({
            declared: confInstances.filter((instance) => instance.host === host),
            preserved: readHostInstanceRegistry({ confDir: gatewayConfDir, host }),
            isDeployed: (instance) =>
              deployedNames.some((name) => name.startsWith(`${deployId}-${instance.id}-${env}-`)),
          }),
        ]),
      );
      const affected = hosts.flatMap((host) => instancesByHost[host]);
      const trafficById = {};
      const currentTrafficById = {};
      const bootstrapTrafficById = {};
      for (const instance of affected) {
        const currentTraffic = Underpost.deploy.getCurrentTraffic(`${deployId}-${instance.id}`, {
          hostTest: instance.host,
          namespace: options.namespace,
          env,
          gatewayApi: options.gatewayApi,
        });
        currentTrafficById[instance.id] = currentTraffic;
        if (!promotedIds.has(instance.id)) {
          trafficById[instance.id] = currentTraffic || 'blue';
          continue;
        }
        trafficById[instance.id] = nextTrafficFactory(currentTraffic, options.targetTrafficById?.[instance.id]);
        promotedTraffic = trafficById[instance.id];
      }

      // Readiness is mandatory for an actual promotion. The only exception is
      // the explicit no-backend checkpoint, whose purpose is to prove that an
      // endpointless selector returns the configured fallback before a workload
      // exists.
      if (!options.noBackendCheckpoint)
        for (const instance of affected.filter((entry) => promotedIds.has(entry.id))) {
          const podId = `${deployId}-${instance.id}-${env}-${trafficById[instance.id]}`;
          if (
            !Underpost.deploy.awaitDeploymentReady({ deployment: podId, namespace }) ||
            !Underpost.deploy.awaitServiceEndpoints({ service: `${podId}-service`, namespace })
          )
            throw new Error(`Refusing to promote ${instance.id} to unready colour ${trafficById[instance.id]}`);
        }

      // Bootstrap one stable Service per instance on its current ready colour.
      // Routes and fallback blocks can now migrate without changing traffic;
      // promoted selectors move to their targets only after the whole host has
      // converged below.
      for (const instance of affected) {
        const instanceDeployId = `${deployId}-${instance.id}`;
        const currentTraffic = currentTrafficById[instance.id];
        const currentReady =
          !!currentTraffic &&
          Underpost.deploy.serviceHasReadyEndpoints({
            service: `${instanceDeployId}-${env}-${currentTraffic}-service`,
            namespace,
          });
        const bootstrapTraffic = currentReady ? currentTraffic : trafficById[instance.id];
        bootstrapTrafficById[instance.id] = bootstrapTraffic;
        Underpost.deploy.applyTrafficService({
          deployId: instanceDeployId,
          env,
          traffic: bootstrapTraffic,
          namespace,
          fromPort: instancePortFactory({ instance, env }),
          toPort: instancePortFactory({ instance, env, container: true }),
        });
      }

      // Instance routes attach to the Gateway the parent deploy owns. A Gateway
      // per instance host cannot work beside it: `mergeGateways` collapses every
      // Gateway of the class onto one listener per (port, protocol), so a
      // hostname-scoped listener and the deploy's hostname-less one contend for
      // the same port — on 80 the hostname-scoped one is dropped outright, and
      // on 443 it keeps an SNI filter chain whose route table is left empty.
      // Either way every path on the instance host answers 404 while the
      // Gateway reports Programmed and the route reports Accepted.
      const gatewayName = Underpost.deploy.gatewayNameFactory({ deployId, env });
      for (const host of hosts) {
        const hostInstances = instancesByHost[host];
        const routingEnv = options.tls ? 'production' : env;
        // Every variant of this host contributes one proxied sub-path to the
        // shared gateway, whose interception turns each workload's own error
        // into that variant's declared document.
        if (options.gatewayApi)
          writeHostServerConf({
            confDir: gatewayConfDir,
            host,
            conf: hostServerConfFactory({
              host,
              namespace: options.namespace || 'default',
              routes: hostInstances.map((instance) => ({
                path: instance.path,
                upstream: `${Underpost.deploy.trafficServiceNameFactory({
                  deployId: `${deployId}-${instance.id}`,
                  env,
                })}:${instancePortFactory({ instance, env })}`,
                statuses: instanceInterceptStatusesFactory(instance),
                stripPrefix: Array.isArray(instance.pathRewritePolicy) && instance.pathRewritePolicy.length > 0,
              })),
            }),
          });
        // Recorded before the route is published, so a variant dropped from the
        // conf keeps its descriptor from the render that still carried it.
        writeHostInstanceRegistry({ confDir: gatewayConfDir, host, instances: hostInstances });
        // The route below sends every intercepted path to this shared Nginx
        // service. Load the host block first so an Accepted route can never race
        // a gateway that still has only its default server configuration.
        if (options.gatewayApi)
          installGatewayConf({
            hostRoot: Underpost.deploy.underpostGatewayRootFactory(options),
            confSourceDir: gatewayConfDir,
            namespace: options.namespace,
          });
        let proxyYaml = options.gatewayApi
          ? Underpost.deploy.httpRouteYamlFactory({
              host,
              options,
              parentName: gatewayName,
              rules: instanceHttpRouteRulesFactory({ deployId, instances: hostInstances, env, trafficById, options }),
            })
          : Underpost.deploy.baseProxyYamlFactory({ host, env: routingEnv, options }) +
            instanceProxyRoutesFactory({ deployId, instances: hostInstances, env, trafficById });
        if (options.tls) {
          if (options.test) {
            Underpost.deploy.selfSignedTlsSecretFactory({
              host,
              namespace: options.namespace,
              underpostRoot: options.underpostRoot || '.',
            });
          } else {
            shellExec(`sudo kubectl delete Certificate ${host} -n ${options.namespace} --ignore-not-found`);
            proxyYaml += Underpost.deploy.buildCertManagerCertificate({ ...options, host });
          }
        }
        if (options.gatewayApi) {
          // Left by the per-host model this replaces. Both outlive the route
          // that referenced them and keep contending for the merged listener.
          for (const name of [`Gateway ${host}`, `ClientTrafficPolicy ${host}-http3`])
            shellExec(`kubectl delete ${name} --namespace ${options.namespace} --ignore-not-found`, { silent: true });
        }
        // The host's route object is replaced in place, never deleted first:
        // `apply` moves the whole spec in one transition, so the hostname always
        // has a route. Delete-then-apply left a window with none, and Envoy
        // answered every request that landed in it 404 — an outage on each
        // promote, independent of which colour was healthy.
        shellExec(
          `kubectl apply -f - -n ${options.namespace} <<'EOF'
${proxyYaml}
EOF
`,
          { disableLog: true },
        );
      }
      // These hostnames may have just moved between stacks, or appeared for the
      // first time. A shared edge that has not been told answers them from the
      // other data plane, which has no route for them — a 404 in front of a
      // healthy workload. No-op when no shared edge is installed.
      const sharedIngressUpdated = Underpost.cluster.refreshUnderpostIngress({ namespace, options });
      if (sharedIngressUpdated) {
        Underpost.deploy.removeInactiveHostRoutes({ hosts, gatewayApi: options.gatewayApi, namespace });
        Underpost.cluster.refreshUnderpostIngress({ namespace, options });
      }
      if (!options.noBackendCheckpoint)
        for (const instance of affected.filter((entry) => promotedIds.has(entry.id))) {
          const instanceDeployId = `${deployId}-${instance.id}`;
          const targetTraffic = trafficById[instance.id];
          const bootstrapTraffic = bootstrapTrafficById[instance.id];
          if (targetTraffic !== bootstrapTraffic)
            Underpost.deploy.applyTrafficService({
              deployId: instanceDeployId,
              env,
              traffic: targetTraffic,
              namespace,
              fromPort: instancePortFactory({ instance, env }),
              toPort: instancePortFactory({ instance, env, container: true }),
            });
          const trafficService = Underpost.deploy.trafficServiceNameFactory({ deployId: instanceDeployId, env });
          if (!Underpost.deploy.awaitServiceEndpoints({ service: trafficService, namespace })) {
            if (targetTraffic !== bootstrapTraffic)
              Underpost.deploy.applyTrafficService({
                deployId: instanceDeployId,
                env,
                traffic: bootstrapTraffic,
                namespace,
                fromPort: instancePortFactory({ instance, env }),
                toPort: instancePortFactory({ instance, env, container: true }),
              });
            throw new Error(`Traffic Service ${trafficService} never became ready on ${targetTraffic}`);
          }
        }
      // Refresh the gRPC service to ensure it points to the parent deploy's current traffic.
      if (promotedTraffic) {
        const parentTraffic =
          Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace, env }) || 'blue';
        const grpcServicePath = Underpost.deploy.buildGrpcServiceManifest({
          deployId,
          env,
          confServer: loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
          namespace: options.namespace,
          traffic: [parentTraffic],
        });
        if (grpcServicePath) shellExec(`kubectl apply -f ${grpcServicePath} -n ${options.namespace}`);
      }
    },

    /**
     * @method instance
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string containing workflow parameters).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    instance: async (path = '', options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      options = {
        ...options,
        gatewayApi: gatewayApiEnabledFactory(options),
        namespace: options.namespace || 'default',
      };
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      let [deployId, id, replicas] = path.split(',');
      if (!replicas) replicas = options.replicas;
      const confInstances = selectConfInstances(loadConfInstances(deployId), id);
      const { liveTrafficById, targetTrafficById, serving } = instanceTrafficPlanFactory({
        instances: confInstances,
        requestedTraffic: options.traffic,
        liveTrafficOf: (instance) =>
          Underpost.deploy.getCurrentTraffic(`${deployId}-${instance.id}`, {
            hostTest: instance.host,
            namespace: options.namespace,
            env,
            gatewayApi: options.gatewayApi,
          }),
        servesTraffic: (instance, colour) =>
          Underpost.deploy.serviceHasReadyEndpoints({
            service: `${deployId}-${instance.id}-${env}-${colour}-service`,
            namespace: options.namespace,
          }),
      });

      let prePromoted = false;
      const fallbackChecks = instanceFallbackChecksFactory(confInstances);
      // The promote points intercepted statuses at these documents on either
      // path, so they are placed regardless of which one runs.
      if (options.gatewayApi && fallbackChecks.length > 0 && !options.expose)
        placeInstanceStaticAssets({ instances: confInstances, options, label: 'instance' });
      if (
        options.gatewayApi &&
        !options.gatewayBootstrapComplete &&
        fallbackChecks.length > 0 &&
        !options.expose &&
        serving.length === 0
      ) {
        // Clear the target colour before routing to it. A previous blue/green
        // cycle may have left that inactive Deployment Ready, which would turn
        // this into a stale-app probe instead of a no-backend fallback probe.
        for (const instance of confInstances) {
          const podId = `${deployId}-${instance.id}-${env}-${targetTrafficById[instance.id]}`;
          shellExec(`kubectl delete service ${podId}-service --namespace ${options.namespace} --ignore-not-found`);
          shellExec(`kubectl delete deployment ${podId} --namespace ${options.namespace} --ignore-not-found`);
        }
        // A direct `run instance` must publish and prove its configured static
        // fallback before it submits the first instance Deployment document.
        await UnderpostRun.RUNNERS['instance-promote'](`${deployId},${id}`, {
          ...options,
          targetTrafficById,
          noBackendCheckpoint: true,
        });
        await gatewayFallbackProbeRunner({
          gatewayStatusRunner: UnderpostRun.RUNNERS['gateway-status'],
          checks: fallbackChecks,
          options,
          label: 'instance',
        });
        prePromoted = true;
      } else if (serving.length > 0)
        logger.info('[instance] Live colour serving; holding traffic until the target colour is Ready', {
          hosts: [...new Set(serving.map((instance) => instance.host))],
          live: serving.map((instance) => `${instance.id}:${liveTrafficById[instance.id]}`),
          target: serving.map((instance) => `${instance.id}:${targetTrafficById[instance.id]}`),
        });

      const etcHosts = [];
      for (const instance of confInstances) {
        let {
          id: _id,
          host: _host,
          path: _path,
          image: _image,
          cmd: _cmd,
          volumes: _volumes,
          metadata: _metadata,
          lifecycle: _lifecycle,
          readinessProbe: _readinessProbe,
          livenessProbe: _livenessProbe,
        } = instance;
        const _deployId = `${deployId}-${_id}`;
        const _fromPort = instancePortFactory({ instance, env });
        const _toPort = instancePortFactory({ instance, env, container: true });
        etcHosts.push(_host);
        if (options.expose) continue;
        // Examples images:
        // `underpost/underpost-engine:${Underpost.version}`
        // `localhost/rockylinux9-underpost:${Underpost.version}`
        if (options.imageName) _image = options.imageName;
        if (!_image) _image = `underpost/underpost-engine:${Underpost.version}`;

        if (_image && !_image.startsWith('localhost'))
          Underpost.image.pullDockerHubImage({
            dockerhubImage: _image,
            kind: options.kind || (!options.nodeName && !options.kubeadm && !options.k3s),
            kubeadm: options.nodeName || options.kubeadm,
            k3s: options.k3s,
          });

        const targetTraffic = targetTrafficById[instance.id];
        const podId = `${_deployId}-${env}-${targetTraffic}`;
        const ignorePods = Underpost.kubectl.get(podId, 'pods', options.namespace).map((p) => p.NAME);
        Underpost.deploy.configMap(env, options.namespace);
        shellExec(`kubectl delete service ${podId}-service --namespace ${options.namespace} --ignore-not-found`);
        shellExec(`kubectl delete deployment ${podId} --namespace ${options.namespace} --ignore-not-found`);
        for (const _volume of _volumes)
          if (_volume.claimName)
            Underpost.deploy.deployVolume(_volume, {
              namespace: options.namespace,
              deployId: _deployId,
              env,
              version: targetTraffic,
              nodeName: Underpost.deploy.resolveDeployNode({
                node: options.nodeName,
                kind: options.kind,
                kubeadm: options.kubeadm,
                k3s: options.k3s,
                env,
              }),
              clusterContext: clusterTypeFactory(options),
              gitClean: options.gitClean || false,
              sshKeyPath: options.sshKeyPath || '',
            });
        // Regenerate the parent deploy's gRPC ClusterIP service pointing to the
        // parent's current traffic colour and apply it before the instance pod starts so
        // DNS is resolvable the moment the pod boots.
        const parentTraffic =
          Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace, env }) || 'blue';
        const grpcServicePath = Underpost.deploy.buildGrpcServiceManifest({
          deployId,
          env,
          confServer: loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
          namespace: options.namespace,
          traffic: [parentTraffic],
          host: _host,
        });
        if (grpcServicePath) shellExec(`kubectl apply -f ${grpcServicePath} -n ${options.namespace}`);

        const resolvedCmd = _cmd[env].map((c) =>
          c.replaceAll(
            '{{grpc-service-dns}}',
            `${deployId}-grpc-service-${env}-${parentTraffic}.${options.namespace || 'default'}.svc.cluster.local:50051`,
          ),
        );

        // Resolve env-scoped lifecycle/probe blocks: each can be either
        //   { ...envObj }                        // shared shape
        //   { development: {...}, production: {...} }   // env-specific

        // Convention: an instance config may place `imagePullPolicy` inside
        // the env-scoped lifecycle block (alongside postStart/preStop).
        // Extract it onto the container spec (where K8S expects it) and
        // strip it from the lifecycle hash so the rendered YAML stays valid.
        // CLI override (`--image-pull-policy`) wins over the conf value.
        const { lifecycle: lifecycleForManifest, imagePullPolicy: lifecycleImagePullPolicy } =
          Underpost.deploy.extractInstanceImagePullPolicy(resolveEnvScoped(_lifecycle, env));
        const instanceImagePullPolicy = options.imagePullPolicy || lifecycleImagePullPolicy;

        let deploymentYaml = `---
${Underpost.deploy
  .deploymentYamlPartsFactory({
    deployId: _deployId,
    env,
    suffix: targetTraffic,
    resources: Underpost.deploy.resourcesFactory(options),
    replicas,
    image: _image,
    namespace: options.namespace,
    volumes: _volumes,
    cmd: resolvedCmd,
    lifecycle: lifecycleForManifest,
    readinessProbe: Underpost.deploy.requiredReadinessProbeFactory({
      probe: resolveEnvScoped(_readinessProbe, env),
      port: _toPort,
    }),
    livenessProbe: resolveEnvScoped(_livenessProbe, env),
    containerPort: _toPort,
    imagePullPolicy: instanceImagePullPolicy,
    // Pin the pod in the manifest submitted for its only rollout. Volumes were
    // already resolved against this node; leaving the pod unconstrained could
    // schedule it away from its data and require a second, post-ready move.
    nodeName: options.nodeName
      ? Underpost.deploy.resolveDeployNode({
          node: options.nodeName,
          kind: options.kind,
          kubeadm: options.kubeadm,
          k3s: options.k3s,
          env,
        })
      : '',
  })
  .replace('{{ports}}', buildKindPorts(_fromPort, _toPort))}
`;
        // console.log(deploymentYaml);
        shellExec(
          `kubectl apply -f - -n ${options.namespace} <<'EOF'
${deploymentYaml}
EOF
`,
          { disableLog: true },
        );
        // Custom instances run a bare binary (no `underpost start` / internal
        // HTTP endpoint): Kubernetes readiness is the running signal and
        // container-status is read via exec. See `Deploy custom instance to K8S.md`.
        const { ready, readyPods } = await Underpost.monitor.monitorReadyRunner(
          _deployId,
          env,
          targetTraffic,
          ignorePods,
          options.namespace,
          { readyGate: 'kubernetes', statusTransport: 'exec' },
        );

        if (!ready) {
          logger.error(`Deployment ${deployId} did not become ready in time.`);
          return;
        }
      }
      // Cluster-invoked instances inherit a fallback route for the old
      // colour, so they still promote the family atomically after every variant
      // is Ready. A direct run already routed the exact target colour before the
      // Deployment and proved its fallback; that route simply starts proxying the
      // new endpoints and must not be toggled a second time.
      if (!options.expose && !prePromoted) await UnderpostRun.RUNNERS['instance-promote'](`${deployId},${id}`, options);
      if (options.etcHosts) {
        const hostListenResult = etcHostFactory(etcHosts);
        logger.info(hostListenResult.renderHosts);
      }
    },

    /**
     * @method deploy-key
     * @description Copies the deploy key for a specific user and deployId to a temporary location on the local machine.
     * @param {string} path - The input value, identifier, or path for the operation (not used in this method).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @param {string} options.user - The user for which to copy the deploy key.
     * @param {string} options.deployId - The deployment identifier associated with the deploy key.
     * @memberof UnderpostRun
     */
    'deploy-key': (path, options = DEFAULT_OPTION) => {
      const prefix = 'dd-key';
      if (options.reset) {
        shellExec(`rm -rf /home/dd/tmp/${prefix}_*`);
        return;
      }
      if (!options.user || !options.deployId) {
        logger.error('Both --user and --deploy-id options are required to copy the deploy key.');
        return;
      }
      const targetPath = `/home/dd/tmp/${prefix}_${s4()}${s4()}`;
      fs.mkdirSync('/home/dd/tmp', { recursive: true });
      fs.copyFileSync(`./engine-private/conf/${options.deployId}/users/${options.user}/id_rsa`, targetPath);
      logger.info(`Copied deploy key to ${targetPath}`);
      if (options.copy) pbcopy(targetPath);
    },

    /**
     * @method instance-build-manifest
     * @description Builds a Kubernetes Deployment + Service manifest for a specific instance entry
     * from `conf.instances.json` and writes it to a file. This is a purely local
     * artifact generator: it never probes a live cluster. Traffic colour defaults
     * to the canonical initial `blue` and can be overridden with `--traffic`; the
     * real blue/green swap is resolved at deploy time (`deploy --sync`).
     *
     * If `--build` is supplied the image is built from the project Dockerfile and loaded into the
     * cluster before the manifest is written (kind by default; `--kubeadm` / `--k3s` override).
     *
     * @param {string} path - Comma-separated: `deployId,instanceId[,projectPath]`.
     *   `projectPath` is the root directory that contains the `Dockerfile` (e.g. `./cyberia-client`).
     *   Artifacts are written to `<projectPath>/manifests/<env>/Dockerfile` and
     *   `<projectPath>/manifests/<env>/deployment.yaml`.
     *   In production, files are also copied to `<projectPath>/Dockerfile` and
     *   `<projectPath>/deployment.yaml`.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'instance-build-manifest': async (path, options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      let [deployId, id, projectPath] = path.split(',');
      const rootPath = projectPath ? projectPath : '.';

      const confInstances = loadConfInstances(deployId);
      // Targeting a template id builds every world in the family. The fan-out
      // re-enters this runner with `instanceOnly` because the default world
      // keeps the template id verbatim — without it, selecting `mmo-server`
      // would match the family again and recurse forever. Only that default
      // world publishes to the project root, so the repo keeps exactly one
      // canonical Dockerfile/deployment.yaml pair.
      const selected = options.instanceOnly
        ? confInstances.filter((instance) => instance.id === id)
        : selectConfInstances(confInstances, id);
      if (selected.length === 0) {
        logger.error(`Instance with id '${id}' not found in conf.instances.json for deployId '${deployId}'`);
        return;
      }
      if (!options.instanceOnly && (selected.length > 1 || selected[0].id !== id)) {
        for (const instance of selected)
          await UnderpostRun.RUNNERS['instance-build-manifest'](
            [deployId, instance.id, projectPath].filter((v) => v !== undefined).join(','),
            { ...options, instanceOnly: true },
          );
        return;
      }

      const envManifestPath = `${rootPath}/manifests/deployments/${id}-${env}`;
      const outputPath = `${envManifestPath}/deployment.yaml`;
      const dockerfileManifestPath = `${envManifestPath}/Dockerfile`;

      fs.mkdirpSync(envManifestPath);

      const instance = selected[0];
      const isDefaultInstance = instance.id === instance.templateId || !instance.templateId;
      const instanceEnvBuilder = await loadProjectInstanceEnvBuilder(deployId);

      let {
        id: _id,
        host: _host,
        image: _image,
        cmd: _cmd,
        volumes: _volumes,
        metadata: _metadata,
        runtime: _runtime,
        lifecycle: _lifecycle,
        readinessProbe: _readinessProbe,
        livenessProbe: _livenessProbe,
      } = instance;

      // Resolve Dockerfile source. Dev/prod variant rules:
      //   - When the instance defines a `runtime`, look under
      //     `src/runtime/<runtime>/`. In `--dev` mode prefer `Dockerfile.dev`
      //     when it exists, falling back to `Dockerfile`.
      //   - When `runtime` is not set, look in the project root with the
      //     same `.dev` → no-suffix precedence.
      // Dockerfile.dev is a full Dockerfile (not an overlay) — each runtime
      // owns the contract between its dev image and its prod image (debug
      // build flags, extra tooling, default ports, etc.).
      const dockerfileBase = _runtime ? `src/runtime/${_runtime}` : rootPath;
      const dockerfileCandidates = options.dev
        ? [`${dockerfileBase}/Dockerfile.dev`, `${dockerfileBase}/Dockerfile`]
        : [`${dockerfileBase}/Dockerfile`];
      const dockerfileSourcePath = dockerfileCandidates.find((p) => fs.existsSync(p));
      if (dockerfileSourcePath) {
        if (options.dev && !dockerfileSourcePath.endsWith('.dev')) {
          logger.warn(
            `[instance-build-manifest] --dev requested but no Dockerfile.dev present; falling back to ${dockerfileSourcePath}`,
          );
        }
        fs.copyFileSync(dockerfileSourcePath, dockerfileManifestPath);
      } else {
        logger.warn(`[instance-build-manifest] Dockerfile not found; tried: ${dockerfileCandidates.join(', ')}`);
      }

      const _deployId = `${deployId}-${_id}`;
      if (!_image) _image = `underpost/underpost-engine:${Underpost.version}`;
      const _fromPort = instancePortFactory({ instance, env });
      const _toPort = instancePortFactory({ instance, env, container: true });

      // Build image from projectPath Dockerfile and load into cluster when --build is set.
      if (options.build && projectPath) {
        const isKind = !options.kubeadm && !options.k3s;
        Underpost.image.build({
          path: projectPath,
          imageName: _image,
          podmanSave: true,
          imageOutPath: projectPath,
          kind: isKind,
          kubeadm: !!options.kubeadm,
          k3s: !!options.k3s,
          reset: !!options.reset,
          dev: options.dev,
        });
        logger.info(`[instance-build-manifest] Image built and loaded`, {
          image: _image,
          cluster: isKind ? 'kind' : options.kubeadm ? 'kubeadm' : 'k3s',
        });
      }

      const targetTraffic = options.traffic || 'blue';
      const parentTraffic = targetTraffic;
      const resolvedCmd = _cmd[env].map((c) =>
        c.replaceAll(
          '{{grpc-service-dns}}',
          `${deployId}-grpc-service-${env}-${parentTraffic}.${options.namespace || 'default'}.svc.cluster.local:50051`,
        ),
      );

      // Env-aware lifecycle / probe selection. Each block may either be
      // a single object (shared across envs) or `{ development, production }`.

      // Convention: an instance config may place `imagePullPolicy` inside
      // the env-scoped lifecycle block (alongside postStart/preStop).
      // Extract it onto the container spec and strip it from the lifecycle hash.
      const { lifecycle: lifecycleForManifest, imagePullPolicy: lifecycleImagePullPolicy } =
        Underpost.deploy.extractInstanceImagePullPolicy(resolveEnvScoped(_lifecycle, env));
      const instanceImagePullPolicy = options.imagePullPolicy || lifecycleImagePullPolicy;

      const deploymentYaml =
        `---\n` +
        Underpost.deploy
          .deploymentYamlPartsFactory({
            deployId: _deployId,
            env,
            suffix: targetTraffic,
            resources: Underpost.deploy.resourcesFactory(options),
            replicas: options.replicas,
            image: _image,
            namespace: options.namespace,
            volumes: _volumes,
            cmd: resolvedCmd,
            lifecycle: lifecycleForManifest,
            readinessProbe: Underpost.deploy.requiredReadinessProbeFactory({
              probe: resolveEnvScoped(_readinessProbe, env),
              port: _toPort,
            }),
            livenessProbe: resolveEnvScoped(_livenessProbe, env),
            containerPort: _toPort,
            imagePullPolicy: instanceImagePullPolicy,
            nodeName: options.nodeName
              ? Underpost.deploy.resolveDeployNode({
                  node: options.nodeName,
                  kind: options.kind,
                  kubeadm: options.kubeadm,
                  k3s: options.k3s,
                  env,
                })
              : '',
          })
          .replace('{{ports}}', buildKindPorts(_fromPort, _toPort));

      fs.writeFileSync(outputPath, deploymentYaml, 'utf8');
      logger.info(`[instance-build-manifest] Manifest written to ${outputPath}`, {
        deployId: _deployId,
        env,
        traffic: targetTraffic,
        image: _image,
      });

      // --- Sibling manifests (pv-pvc, proxy, grpc-service) ------------------
      // Emit the same apply-able set the parent deploy writes to build/<env>,
      // scoped to this instance so the project repo and engine-private ship
      // more than just deployment.yaml. Content matches what `run instance`
      // creates dynamically at deploy time (deployVolume / instance-promote /
      // the parent gRPC ClusterIP), so a static `kubectl apply` is equivalent.
      const pvDataNode = Underpost.deploy.resolveDeployNode({
        node: options.nodeName,
        kind: options.kind,
        kubeadm: options.kubeadm,
        k3s: options.k3s,
        env,
      });

      // pv-pvc.yaml — one PV+PVC per instance volume; names mirror deployVolume.
      let pvPvcYaml = '';
      for (const volume of _volumes || []) {
        if (!volume.claimName) continue;
        const pvcId = `${volume.claimName}-${_deployId}-${env}-${targetTraffic}`;
        const pvId = `${volume.claimName.replace('pvc-', 'pv-')}-${_deployId}-${env}-${targetTraffic}`;
        pvPvcYaml += `---\n${Underpost.deploy.persistentVolumeFactory({
          pvcId,
          namespace: options.namespace,
          hostPath: `/home/dd/engine/volume/${pvId}`,
          nodeName: pvDataNode,
        })}\n`;
      }

      // proxy.yaml — this instance's OWN route only (its sub-path → its own
      // service), so each variant's build dir carries a distinct, instance-scoped
      // fragment rather than an identical copy of the whole host proxy. The
      // complete host HTTPProxy — every variant's route aggregated onto the one
      // fqdn, each pointing at its live colour — is assembled and applied by
      // `instance-promote` at deploy time, and only once EVERY variant is ready.
      const proxyYaml =
        Underpost.deploy.baseProxyYamlFactory({ host: _host, env, options }) +
        instanceProxyRoutesFactory({
          deployId,
          instances: [instance],
          env,
          trafficById: { [instance.id]: targetTraffic },
        });

      // A status route is only emitted for a page this project actually ships, so
      // a rewrite never points at a document that cannot exist. The check is a
      // read: placing the document into the gateway volume is `deploy
      // --sync-static`'s job at apply time, and a build must not mutate the host.
      // `projectPath` is passed through because this runner is given one
      // explicitly; the sync derives the same root from the instance itself.
      const statusPageEntries = instanceStatusPageEntriesFactory({
        instances: [instance],
        projectPath: rootPath,
      }).filter((entry) => fs.existsSync(entry.sourcePath));

      // httproute.yaml — this instance's own routes, including the status routes
      // that reach the static utility instead of this workload. No Gateway is
      // emitted beside it: the parent deploy owns the one Gateway that
      // terminates every hostname it serves, and a second, hostname-scoped one
      // would contend with it for the merged listener rather than add to it.
      const httpRouteYaml = Underpost.deploy.httpRouteYamlFactory({
        host: _host,
        options,
        parentName: Underpost.deploy.gatewayNameFactory({ deployId, env }),
        rules: instanceHttpRouteRulesFactory({
          deployId,
          instances: [instance],
          env,
          trafficById: { [instance.id]: targetTraffic },
          options,
          servedStatuses: statusPageEntries.map((page) => `${page.status}`),
        }),
      });

      // grpc-service.yaml — the parent deploy's gRPC ClusterIP (shared; the
      // instance cmd resolves {{grpc-service-dns}} to it). Reuse the parent's
      // generated manifest when present rather than regenerating it here.
      const parentGrpcServicePath = `./engine-private/conf/${deployId}/build/${env}/grpc-service.yaml`;
      const grpcServiceYaml = fs.existsSync(parentGrpcServicePath)
        ? fs.readFileSync(parentGrpcServicePath, 'utf8')
        : '';

      // Write the sibling set next to deployment.yaml (project) and into the
      // engine-private per-instance build dir (mirrors instances/<id>/ layout).
      const instanceBuildDir = `./engine-private/conf/${deployId}/instances/${_id}/build/${env}`;
      fs.mkdirpSync(instanceBuildDir);
      fs.writeFileSync(`${instanceBuildDir}/deployment.yaml`, deploymentYaml, 'utf8');
      const siblingManifests = {
        'pv-pvc.yaml': pvPvcYaml,
        'traffic-service.yaml': Underpost.deploy.trafficServiceYamlFactory({
          deployId: _deployId,
          env,
          traffic: targetTraffic,
          namespace: options.namespace,
          fromPort: _fromPort,
          toPort: _toPort,
        }),
        'proxy.yaml': proxyYaml,
        // No gateway.yaml: the parent deploy owns the Gateway. `writeManifest`
        // removes the file a previous per-host build left behind.
        'gateway.yaml': '',
        'httproute.yaml': httpRouteYaml,
        'grpc-service.yaml': grpcServiceYaml,
      };
      // Written only when they carry objects, and removed otherwise: an empty
      // manifest makes `kubectl apply` fail with "no objects passed to apply",
      // so a build that produces none must leave none behind either.
      for (const [name, content] of Object.entries(siblingManifests))
        for (const dir of [envManifestPath, instanceBuildDir])
          Underpost.deploy.writeManifest({ filePath: `${dir}/${name}`, content });
      logger.info('[instance-build-manifest] Sibling manifests written', {
        project: envManifestPath,
        enginePrivate: instanceBuildDir,
        pvPvc: !!pvPvcYaml,
        proxy: !!proxyYaml,
        httpRoute: !!httpRouteYaml,
        statusPages: statusPageEntries.length,
        grpcService: !!grpcServiceYaml,
      });
      const { gatewayClassName, http3, quicPort, altSvc } = Underpost.deploy.gatewayApiConfigFactory(options);
      logger.info('[instance-build-manifest] Gateway API manifests written', {
        host: _host,
        gatewayClass: gatewayClassName,
        http3,
        quicPort,
        altSvc: http3 ? altSvc : null,
        statusPages: (instance.customStatusPages || []).map((page) => ({
          status: page.status,
          route: `${instance.path === '/' ? '' : instance.path}/${page.status}`,
          hostPath: page.hostPath,
        })),
        statusPageResources: statusPageEntries,
      });

      // --- Per-instance env files -----------------------------------------
      // Each env file starts from the template instance's canonical file for the
      // same mode. Operator-owned keys remain private and are copied verbatim;
      // deploy-specific builders may then derive application env from the
      // normalized instance path/code.
      //
      // A derived instance's env dir is generated in full: both development.env
      // and production.env are written on every build, so a deploy in either
      // environment always finds the env file its `cmd` sources, no matter which
      // mode this build ran. The default/template instance owns the committed
      // source files, so only its current-mode file is idempotently refreshed.
      if (instance.templateId) {
        const instanceEnvDir = `./engine-private/conf/${deployId}/instances/${_id}/env`;
        fs.mkdirpSync(instanceEnvDir);
        const envsToWrite = isDefaultInstance ? [env] : ['development', 'production'];
        for (const targetEnv of envsToWrite) {
          const templateEnvPath = `./engine-private/conf/${deployId}/instances/${instance.templateId}/env/${targetEnv}.env`;
          if (!fs.existsSync(templateEnvPath))
            throw new Error(`[instance-build-manifest] Missing canonical env file: ${templateEnvPath}`);
          const baseEnv = dotenv.parse(fs.readFileSync(templateEnvPath, 'utf8'));
          const builtEnv = dispatchBuildInstanceEnv({
            deployId,
            instance,
            environment: targetEnv,
            baseEnv,
            containerDeployId: `${_deployId}-${targetEnv}`,
            builders: instanceEnvBuilder ? { [deployId]: instanceEnvBuilder } : {},
          });
          writeEnv(`${instanceEnvDir}/${targetEnv}.env`, builtEnv);
        }
        logger.info('[instance-build-manifest] Instance env written', {
          dir: instanceEnvDir,
          instanceCode: instance.instanceCode,
          envs: envsToWrite,
          builder: instanceEnvBuilder?.name || 'canonical-copy',
        });
      }

      if (env === 'production' && isDefaultInstance) {
        if (fs.existsSync(dockerfileManifestPath)) {
          fs.copyFileSync(dockerfileManifestPath, `${rootPath}/Dockerfile`);
        }
        fs.copyFileSync(outputPath, `${rootPath}/deployment.yaml`);
        // Sibling manifests alongside deployment.yaml at the project root.
        for (const name of [
          'pv-pvc.yaml',
          'traffic-service.yaml',
          'proxy.yaml',
          'gateway.yaml',
          'httproute.yaml',
          'grpc-service.yaml',
        ]) {
          const src = `${envManifestPath}/${name}`;
          // Absence is mirrored too, so the repo never ships a manifest this
          // build stopped producing.
          if (fs.existsSync(src)) fs.copyFileSync(src, `${rootPath}/${name}`);
          else fs.removeSync(`${rootPath}/${name}`);
        }
        logger.info('[instance-build-manifest] Production artifacts copied to project root', {
          rootPath,
          dockerfile: `${rootPath}/Dockerfile`,
          deployment: `${rootPath}/deployment.yaml`,
        });
        const ciSrc = `./.github/workflows/docker-image.${_runtime}.ci.yml`;
        if (fs.existsSync(ciSrc)) {
          if (!fs.existsSync(`${rootPath}/.github/workflows`)) fs.mkdirpSync(`${rootPath}/.github/workflows`);
          fs.copyFileSync(ciSrc, `${rootPath}/.github/workflows/docker-image.${_runtime}.ci.yml`);
          logger.info(`[instance-build-manifest] CI workflow copied`, { src: ciSrc });
        }

        // Ship the development variant alongside production so the instance repo
        // is self-contained: the dev Dockerfile (built by the -dev CI workflow
        // into underpost/<runtime>-dev, consumed by the development compose
        // stack) and its dispatchable workflow. Both are optional — synced only
        // when the source-of-truth files exist in the engine repo.
        if (_runtime) {
          const devDockerfileSrc = `src/runtime/${_runtime}/Dockerfile.dev`;
          if (fs.existsSync(devDockerfileSrc)) {
            fs.copyFileSync(devDockerfileSrc, `${rootPath}/Dockerfile.dev`);
            logger.info('[instance-build-manifest] Dev Dockerfile copied', { src: devDockerfileSrc });
          }
          const devCiSrc = `./.github/workflows/docker-image.${_runtime}.dev.ci.yml`;
          if (fs.existsSync(devCiSrc)) {
            if (!fs.existsSync(`${rootPath}/.github/workflows`)) fs.mkdirpSync(`${rootPath}/.github/workflows`);
            fs.copyFileSync(devCiSrc, `${rootPath}/.github/workflows/docker-image.${_runtime}.dev.ci.yml`);
            logger.info(`[instance-build-manifest] Dev CI workflow copied`, { src: devCiSrc });
          }
        }
      }
    },

    /**
     * @method ls-deployments
     * @description Retrieves and logs a table of Kubernetes deployments using `Underpost.deploy.get`.
     * @param {string} path - The input value, identifier, or path for the operation (used as an optional deployment name filter).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ls-deployments': async (path, options = DEFAULT_OPTION) => {
      console.table(await Underpost.kubectl.get(path, 'deployments', options.namespace));
    },

    /**
     * @method host-update
     * @description Executes the `rocky-setup.sh` script to update the host system configuration.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'host-update': async (path, options = DEFAULT_OPTION) => {
      // const baseCommand = options.dev ? 'node bin' : 'underpost';
      shellExec(`chmod +x ${options.underpostRoot}/scripts/rocky-setup.sh`);
      shellExec(`${options.underpostRoot}/scripts/rocky-setup.sh${options.dev ? ' --install-dev' : ``}`);
    },

    /**
     * @method install-crio
     * @description Installs and configures CRI-O as the container runtime for kubeadm clusters.
     * Adds the stable v1.33 CRI-O yum repository, installs the `cri-o` package, configures
     * the systemd cgroup driver, enables the `crio` service, and writes `/etc/crictl.yaml`
     * so that `crictl` targets the CRI-O socket by default.
     * @param {string} path - Unused.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow.
     * @memberof UnderpostRun
     */
    'install-crio': (path, options = DEFAULT_OPTION) => {
      logger.info('Installing CRI-O...');
      shellExec(`cat <<EOF | sudo tee /etc/yum.repos.d/cri-o.repo
[cri-o]
name=CRI-O
baseurl=https://download.opensuse.org/repositories/isv:/cri-o:/stable:/v1.33/rpm/
enabled=1
gpgcheck=1
gpgkey=https://download.opensuse.org/repositories/isv:/cri-o:/stable:/v1.33/rpm/repodata/repomd.xml.key
EOF`);
      shellExec(`sudo dnf -y install cri-o`);
      // Add the Kubernetes repo so cri-tools (crictl CLI) is available.
      // The repo has exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni, so we
      // use --disableexcludes=kubernetes to override and install cri-tools.
      shellExec(`cat <<EOF | sudo tee /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://pkgs.k8s.io/core:/stable:/v1.36/rpm/
enabled=1
gpgcheck=1
gpgkey=https://pkgs.k8s.io/core:/stable:/v1.36/rpm/repodata/repomd.xml.key
exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni
EOF`);
      shellExec(`sudo yum install -y cri-tools --disableexcludes=kubernetes 2>/dev/null || {
        CRICTL_VERSION="v1.31.0"
        ARCH="amd64"
        log "Kubernetes repo not available, downloading crictl binary directly..."
        curl -sL "https://github.com/kubernetes-sigs/cri-tools/releases/download/\${CRICTL_VERSION}/crictl-\${CRICTL_VERSION}-\${ARCH}.tar.gz" | sudo tar -C /usr/local/bin -xz
      }`);
      // Ensure CRI-O uses systemd cgroup driver (matches kubelet default)
      shellExec(`sudo sed -i 's/^#\?cgroup_manager =.*/cgroup_manager = "systemd"/' /etc/crio/crio.conf`, {
        silentOnError: true,
      });
      shellExec(`sudo systemctl enable --now crio`);
      logger.info('CRI-O installed and started.');
      // Write crictl config so all crictl calls default to the CRI-O socket
      shellExec(`cat <<EOF | sudo tee /etc/crictl.yaml
runtime-endpoint: unix:///var/run/crio/crio.sock
image-endpoint: unix:///var/run/crio/crio.sock
timeout: 10
debug: false
EOF`);
    },

    /**
     * @method dd-container
     * @description Deploys a development or debug container tasks jobs, setting up necessary volumes and images, and running specified commands within the container.
     * @param {string} path - The input value, identifier, or path for the operation (used as the command to run inside the container).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'dd-container': async (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const currentImage = options.imageName
        ? options.imageName
        : Underpost.image
            .getCurrentLoaded(options.nodeName ? options.nodeName : 'kind-worker', false)
            .find((o) => o.IMAGE.match('underpost'));
      const podName = options.podName || `underpost-dev-container`;
      const volumeHostPath = options.claimName || '/home/dd';
      const claimName = options.claimName || `pvc-dd`;

      if (!options.nodeName) {
        shellExec(`docker exec -i kind-worker bash -c "rm -rf ${volumeHostPath}"`);
        shellExec(`docker exec -i kind-worker bash -c "mkdir -p ${volumeHostPath}"`);
        shellExec(`docker cp ${volumeHostPath}/engine kind-worker:${volumeHostPath}/engine`);
        shellExec(
          `docker exec -i kind-worker bash -c "chown -R 1000:1000 ${volumeHostPath}; chmod -R 755 ${volumeHostPath}"`,
        );
      } else {
        shellExec(`kubectl apply -f ${options.underpostRoot}/manifests/pv-pvc-dd.yaml -n ${options.namespace}`);
      }

      if (!currentImage)
        shellExec(
          `${baseCommand} image${baseClusterCommand} --pull-base --build --path ${
            options.dev ? '.' : options.underpostRoot
          } ${options.dev ? '--kind' : '--kubeadm'}`,
        );
      // shellExec(`kubectl delete pod ${podName} --ignore-not-found`);

      const payload = {
        ...options,
        podName,
        imageName: currentImage
          ? currentImage.image
            ? currentImage.image
            : currentImage.IMAGE
              ? `${currentImage.IMAGE}:${currentImage.TAG}`
              : `localhost/rockylinux9-underpost:${Underpost.version}`
          : `localhost/rockylinux9-underpost:${Underpost.version}`,
        volumeMountPath: volumeHostPath,
        ...(options.dev ? { volumeHostPath } : { claimName }),
        on: {
          init: async () => {},
        },
        args: [daemonProcess(path ? path : `cd /home/dd/engine && npm install && npm run test`)],
      };

      await Underpost.run.CALL('deploy-job', path, payload);
    },

    /**
     * @method ip-info
     * @description Executes the `ip-info.sh` script to display IP-related information for the specified path.
     * @param {string} path - The input value, identifier, or path for the operation (used as an argument to the script).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'ip-info': (path, options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/ip-info.sh`);
      shellExec(`${underpostRoot}/scripts/ip-info.sh ${path}`);
    },

    /**
     * @method db-client
     * @description Deploys and exposes the Adminer database client application (using `adminer:4.7.6-standalone` image) on the cluster.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'db-client': async (path, options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;

      Underpost.image.pullDockerHubImage({
        dockerhubImage: 'adminer',
        version: '4.7.6-standalone',
        kind: options.kind,
        kubeadm: options.kubeadm,
        k3s: options.k3s,
      });

      shellExec(`kubectl delete deployment adminer -n ${options.namespace} --ignore-not-found`);
      shellExec(`kubectl apply -k ${underpostRoot}/manifests/deployment/adminer/. -n ${options.namespace}`);
      const successInstance = await Underpost.test.statusMonitor('adminer', 'Running', 'pods', 1000, 60 * 10);

      if (successInstance) return UnderpostRun.RUNNERS.expose(path || 'adminer', options);
    },

    /**
     * @method git-conf
     * @description Configures Git global and local user name and email settings based on the provided `path` (formatted as `username,email`), or defaults to environment variables.
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string: `username,email`).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'git-conf': (path = '', options = DEFAULT_OPTION) => {
      const defaultUsername = Underpost.env.get('GITHUB_USERNAME');
      const defaultEmail = Underpost.env.get('GITHUB_EMAIL');
      const validPath = path && path.split(',').length;
      const [username, email] = validPath ? path.split(',') : [defaultUsername, defaultEmail];
      if (validPath) {
        Underpost.env.set('GITHUB_USERNAME', username);
        Underpost.env.set('GITHUB_EMAIL', email);
        Underpost.env.get('GITHUB_USERNAME');
        Underpost.env.get('GITHUB_EMAIL');
      }
      shellExec(
        `git config --global credential.helper "" && ` +
          `git config credential.helper "" && ` +
          `git config --global user.name '${username}' && ` +
          `git config --global user.email '${email}' && ` +
          `git config --global credential.interactive always && ` +
          `git config user.name '${username}' && ` +
          `git config user.email '${email}' && ` +
          `git config credential.interactive always &&` +
          `git config pull.rebase false && ` +
          `git config core.filemode false`,
        {
          disableLog: true,
          silent: true,
        },
      );

      if (options.logs)
        console.log(
          shellExec(`git config list`, { silent: true, stdout: true })
            .replaceAll('user.email', 'user.email'.yellow)
            .replaceAll(username, username.green)
            .replaceAll('user.name', 'user.name'.yellow)
            .replaceAll(email, email.green),
        );
    },

    /**
     * @method promote
     * @description Switches traffic between blue/green deployments for a specified deployment ID(s) (uses `dd.router` for 'dd', or a specific ID).
     * When `--tls` is set, rebuilds the proxy manifest with `--cert` so the HTTPProxy includes
     * TLS config, deletes stale Certificate resources, then reapplies the proxy and secret.yaml
     * (cert-manager Certificate resources) for each affected deployment.
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated string: `deployId,env,replicas`).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    promote: async (path, options = DEFAULT_OPTION) => {
      options = { ...options, gatewayApi: gatewayApiEnabledFactory(options) };
      let [inputDeployId, inputEnv, inputReplicas] = path.split(',');
      if (!inputEnv) inputEnv = 'production';
      if (!inputReplicas) inputReplicas = 1;
      // TODO: normalize: --tls maps to --cert for deploy.js isValidTLSContext compatibility
      if (options.tls) options.cert = true;

      const applyCerts = (deployId, targetTraffic) => {
        if (!options.tls) return;
        // Rebuild proxy.yaml with --cert so the HTTPProxy includes TLS virtualhost config
        shellExec(
          `node bin deploy --build-manifest --cert --traffic ${targetTraffic} --replicas ${inputReplicas} --namespace ${options.namespace} ${deployId} ${inputEnv}`,
        );
        // Delete stale Certificate resources before reapplying
        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        if (fs.existsSync(confServerPath)) {
          for (const host of Object.keys(JSON.parse(fs.readFileSync(confServerPath, 'utf8'))))
            shellExec(`sudo kubectl delete Certificate ${host} -n ${options.namespace} --ignore-not-found`);
        }
        shellExec(
          `sudo kubectl apply -f ./engine-private/conf/${deployId}/build/${inputEnv}/proxy.yaml -n ${options.namespace}`,
        );
        const secretPath = `./engine-private/conf/${deployId}/build/${inputEnv}/secret.yaml`;
        if (fs.existsSync(secretPath)) shellExec(`kubectl apply -f ${secretPath} -n ${options.namespace}`);
      };

      if (inputDeployId === 'dd') {
        for (const deployId of fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',')) {
          const currentTraffic = Underpost.deploy.getCurrentTraffic(deployId, {
            namespace: options.namespace,
            env: inputEnv,
          });
          const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
          Underpost.deploy.switchTraffic(deployId, inputEnv, targetTraffic, inputReplicas, options.namespace, options);
          applyCerts(deployId, targetTraffic);
        }
      } else {
        const currentTraffic = Underpost.deploy.getCurrentTraffic(inputDeployId, {
          namespace: options.namespace,
          env: inputEnv,
        });
        const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
        Underpost.deploy.switchTraffic(
          inputDeployId,
          inputEnv,
          targetTraffic,
          inputReplicas,
          options.namespace,
          options,
        );
        applyCerts(inputDeployId, targetTraffic);
      }
    },
    /**
     * @method metrics
     * @description Deploys Prometheus and Grafana for metrics monitoring, targeting the hosts defined in the deployment configuration files.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    metrics: async (path, options = DEFAULT_OPTION) => {
      if (path === 'server') {
        shellExec(
          `kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/high-availability-1.21+.yaml`,
        );
        await timer(2000);

        shellExec(`kubectl patch deployment metrics-server -n kube-system \
  --type='json' \
  -p='[
    {
      "op":"add",
      "path":"/spec/template/spec/containers/0/args/-",
      "value":"--kubelet-insecure-tls"
    }
  ]'`);
        shellExec(`kubectl scale deployment metrics-server \
  -n kube-system \
  --replicas=1`);

        return;
      }
      const deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',');
      let hosts = [];
      for (const deployId of deployList) {
        const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
        hosts = hosts.concat(Object.keys(confServer));
      }
      shellExec(`node bin cluster --prom ${hosts.join(',')}`);
      shellExec(`node bin cluster --grafana`);
    },
    /**
     * @method cluster
     * @description Deploys a full production/development ready Kubernetes cluster environment including MongoDB,
     * MariaDB, Valkey, the Gateway API data plane (Envoy Gateway), Contour, and Cert-Manager, and deploys all services.
     *
     * Ingress is served by the Gateway API stack (Gateway + HTTPRoute) with QUIC/HTTP3 in **both** environments;
     * `--disable-gateway-api` falls back to the Contour HTTPProxy stack. Because HTTP/3 has no cleartext transport,
     * development terminates TLS too: a self-signed certificate per host (mkcert via `scripts/ssl.sh`, whose root CA
     * the script installs into the system + NSS trust stores) is issued into the secret the Gateway listener
     * references, and every host is written to `/etc/hosts` so the operator's browser reaches the PWA at
     * `https://<host>` on the local machine.
     *
     * Custom instances are the optional third segment of `path`. They are resolved per deploy against that deploy's
     * own `conf.instances.json`, so an id only runs where its deploy declares it, and each one is deployed after its
     * deploy's default workload is serving — an instance reads the parent's world configuration over the parent's
     * gRPC ClusterIP at boot. Instance hosts share the deploy's environment: the same self-signed certificates and
     * `/etc/hosts` pass in development, the same cert-manager issuance in production.
     * @param {string} path - `<runtime-image>,<deploy-list>[,<instance-list>]` — `+`-separated lists, e.g.
     *   `express,dd-cyberia,mmo-server` or `express,dd-cyberia+dd-core,mmo-server+mmo-client`. An instance list entry
     *   may be a template id (`mmo-server`), which selects its whole variant family.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    cluster: async (path = '', options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const clusterType = clusterTypeFactory(options, 'kubeadm');
      shellCd(`/home/dd/engine`);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --reset --${clusterType}`);
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType}`);
      await timer(5000);
      let [runtimeImage, deployList, instanceListId] =
        path && path.trim() && path.split(',')
          ? path.split(',')
          : [
              'express',
              fs.readFileSync(`${underpostRoot}/engine-private/deploy/dd.router`, 'utf8').replaceAll(',', '+'),
              '',
            ];
      // shellExec(
      //   `${baseCommand} image${baseClusterCommand} --build ${
      //     runtimeImage ? ` --pull-base --path ${underpostRoot}/src/runtime/${runtimeImage}` : ''
      //   } --${clusterType}`,
      // );
      if (!deployList) {
        deployList = [];
        logger.warn('No deploy list provided');
      } else deployList = deployList.split('+');
      await timer(5000);
      // --reset-mongodb wipes the retained hostPath volumes before the rollout.
      // This workflow already tore the node down and re-imports every database
      // from its git backup a few lines below, so inheriting the previous
      // cluster's replica set config is never wanted — that state leaves mongod
      // parked outside its own config and the bootstrap fighting to recover it.
      shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --pull-image --mongodb --reset-mongodb`);
      if (deployList.includes('dd-cyberia'))
        shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --pull-image --ipfs --replicas 1`);

      if (runtimeImage === 'lampp') {
        await timer(5000);
        shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --pull-image --mariadb`);
      }
      await timer(5000);
      for (const deployId of deployList) {
        shellExec(
          `${baseCommand} db ${deployId} --import --git --drop --preserveUUID --primary-pod${options.namespace ? ` --ns ${options.namespace}` : ''}`,
        );
      }
      await timer(5000);
      shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --pull-image --valkey`);
      // Exactly one ingress stack is installed, because the two cannot coexist
      // on this node: Contour's Envoy DaemonSet declares hostPort 80/443, so the
      // CNI hostport plugin DNATs everything arriving on those ports straight to
      // it — before the Gateway API data plane's own listener can see them. With
      // no HTTPProxy objects to program (this workflow applies HTTPRoutes),
      // Contour's Envoy has no listeners and refuses the redirected connection,
      // which looks exactly like a gateway that is not listening at all.
      const gatewayApi = gatewayApiEnabledFactory(options);
      const gatewayApiFlags = Underpost.deploy.gatewayApiFlagsFactory({ ...options, gatewayApi });
      await timer(5000);
      if (gatewayApi) {
        shellExec(
          `${baseCommand} cluster${baseClusterCommand} --${clusterType} --gateway-api${
            options.gatewayClass ? ` --gateway-class ${options.gatewayClass}` : ''
          }`,
        );
      } else shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --contour`);
      if (gatewayApi)
        shellExec(
          `kubectl rollout status deployment/${UNDERPOST_GATEWAY.name} -n ${options.namespace || 'default'} --timeout=5m`,
        );
      if (env === 'production') {
        await timer(5000);
        shellExec(`${baseCommand} cluster${baseClusterCommand} --${clusterType} --cert-manager`);
      }

      const { byDeployId: instancesByDeployId, unmatched: unmatchedInstanceIds } = clusterInstancesFactory(
        deployList,
        instanceListId,
      );
      if (unmatchedInstanceIds.length > 0)
        logger.warn('[cluster] No deploy declares these instances; they will not be deployed', {
          instances: unmatchedInstanceIds,
          deployList,
        });

      // Development terminates TLS with a locally trusted certificate instead of
      // cert-manager: QUIC/HTTP3 has no cleartext transport, so without it the
      // dev gateway would fall back to an HTTP-only listener. The hosts are
      // written to /etc/hosts in a single pass — etcHostFactory rewrites the
      // file, so one call per deploy would drop the previous deploy's entries.
      // Instance hosts come through the same resolver the Gateway's certificate
      // list uses, so the two can never disagree about what the deploy serves.
      const hosts = [...new Set(deployList.flatMap((deployId) => deployHostsFactory(deployId)))];
      if (env === 'development') {
        for (const host of hosts)
          Underpost.deploy.selfSignedTlsSecretFactory({
            host,
            namespace: options.namespace || 'default',
            underpostRoot,
          });
        const hostListenResult = etcHostFactory(hosts);
        logger.info(hostListenResult.renderHosts);
      }
      const version = 'v3.2.90';
      const instanceOptionsFactory = (deployId, instanceId) => ({
        ...options,
        ...clusterContextFactory(clusterType),
        gatewayApi,
        gatewayBootstrapComplete: true,
        tls: true,
        test: env === 'development',
        etcHosts: false,
        namespace: options.namespace || 'default',
        imageName:
          deployId === 'dd-cyberia' && env === 'development' && instanceId === 'mmo-server'
            ? `underpost/cyberia-server-dev:${version}`
            : deployId === 'dd-cyberia' && env === 'development' && instanceId === 'mmo-client'
              ? `underpost/cyberia-client-dev:${version}`
              : undefined,
      });
      const deployFlagsById = {};
      const fallbackChecks = new Map();

      // Regenerating the manifests is required, not incidental: the TLS listener
      // — and with it the QUIC policy and the HTTPRoute set — is only emitted
      // when the TLS and gateway flags are known at generation time. It takes two
      // passes because `--build-manifest` returns after writing the manifests, so
      // the same flags have to be repeated on the apply call.
      for (const deployId of deployList) {
        const deployFlags =
          `--${clusterType}${env === 'production' ? ' --cert' : ' --self-signed'}${gatewayApiFlags}` +
          `${options.namespace ? ` --namespace ${options.namespace}` : ''}` +
          (deployId === 'dd-cyberia'
            ? ` --image 'underpost/engine-cyberia:${version}'  \
                --versions blue \
                --image-pull-policy Always \
                --cmd 'cd /home/dd/engine, \
                underpost clone underpostnet/engine-cyberia, \
                mkdir -p /home/dd/engine/src/client/public/itemledger \
                  /home/dd/engine/src/client/public/cryptokoyn \
                  /home/dd/engine/src/client/components/cryptokoyn \
                  /home/dd/engine/src/client/components/itemledger \
                  /home/dd/engine/hardhat, \
                cp -a ./engine-cyberia/src/client/public/itemledger/. /home/dd/engine/src/client/public/itemledger/, \
                cp -a ./engine-cyberia/src/client/public/cryptokoyn/. /home/dd/engine/src/client/public/cryptokoyn/, \
                cp -a ./engine-cyberia/src/client/components/cryptokoyn/. /home/dd/engine/src/client/components/cryptokoyn/, \
                cp -a ./engine-cyberia/src/client/components/itemledger/. /home/dd/engine/src/client/components/itemledger/, \
                cp -a ./engine-cyberia/src/client/Itemledger.index.js /home/dd/engine/src/client/Itemledger.index.js, \
                cp -a ./engine-cyberia/src/client/Cryptokoyn.index.js /home/dd/engine/src/client/Cryptokoyn.index.js, \
                rm -rf ./engine-cyberia, \
                sudo rm -rf ./engine-private/, \
                node bin clone underpostnet/engine-cyberia-private, \
                sudo mv ./engine-cyberia-private ./engine-private, \
                node bin env dd-cyberia ${env}, \
                node ./engine-private/itc-scripts/dd-cyberia-0.js, \
                sudo chown -R dd:dd /home/dd/engine/src/client/public/cyberia, \
                node bin env dd-cyberia ${env}, \
                node bin client dd-cyberia ${env}, \
                node bin start dd-cyberia ${env} --run'`
            : '');
        deployFlagsById[deployId] = deployFlags;
        // SSR status and context documents belong to the ingress bootstrap, so
        // build them on the host before any workload Deployment is submitted.
        shellExec(`${baseCommand} client ${deployId} ${env}`);
        shellExec(`${baseCommand} deploy ${deployId} ${env} --build-manifest ${deployFlags}`);
        // Seed the static tree before the routes exist, so every status page and
        // intercepted context the manifests just pointed at resolves from the
        // first request. This pass places what this checkout built; the pass
        // after the rollout replaces each document with the container's own,
        // which is the only place clients built from private sources exist.
        if (gatewayApi) {
          const staticAssets = Underpost.deploy.syncStaticAssets(deployId, env, {
            ...options,
            ...clusterContextFactory(clusterType),
            gatewayApi,
            namespace: options.namespace || 'default',
            versions: /--versions\s+([^\s]+)/.exec(deployFlags)?.[1] || options.versions || 'blue',
          });
          const missingAssets = staticAssets.filter((entry) => !entry.source);
          if (missingAssets.length > 0)
            throw new Error(
              `[cluster] Static gateway bootstrap is missing configured assets for ${deployId}: ` +
                missingAssets.map((entry) => entry.assetPath).join(', '),
            );

          // Record the exact documents the no-backend checkpoint must return.
          // PWA paths use the SSR maintenance view; custom instances have no
          // maintenance view and reuse their first declared status document.
          const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
          const confSSRPath = `./engine-private/conf/${deployId}/conf.ssr.json`;
          const confSSR = fs.existsSync(confSSRPath) ? JSON.parse(fs.readFileSync(confSSRPath, 'utf8')) : {};
          for (const host of Object.keys(confServer))
            for (const path of Object.keys(confServer[host])) {
              const maintenance = Underpost.deploy
                .edgeRouteEntriesFactory({ confServer, confSSR, host, path })
                .find((entry) => entry.context === 'maintenance');
              if (maintenance)
                fallbackChecks.set(`${host}${path}`, {
                  host,
                  path,
                  assetPath: maintenance.assetPath,
                  kind: maintenance.kind,
                });
            }
          const selectedInstances = instancesByDeployId[deployId].ids.flatMap((instanceId) =>
            selectConfInstances(loadConfInstances(deployId), instanceId),
          );
          for (const entry of instanceStatusPageEntriesFactory({ instances: selectedInstances }))
            if (!fallbackChecks.has(`${entry.host}${entry.path}`))
              fallbackChecks.set(`${entry.host}${entry.path}`, {
                host: entry.host,
                path: entry.path,
                assetPath: entry.assetPath,
                kind: `status:${entry.status}`,
              });
        }
        // Apply only the gateway tier. Application Services and Deployments are
        // deliberately absent so the status fallback can be observed first.
        shellExec(`${baseCommand} deploy ${deployId} ${env} --disable-update-deployment ${deployFlags}`);
        // Instance host routes and their custom status pages are part of
        // the same ingress bootstrap. `instance-promote` is safe here: it only
        // writes the Nginx host block and routing objects; no instance Deployment
        // is created until the second phase below.
        for (const instanceId of instancesByDeployId[deployId].ids) {
          logger.info('[cluster] Bootstrapping custom instance gateway', { deployId, instanceId, env });
          await UnderpostRun.RUNNERS['instance-promote'](`${deployId},${instanceId}`, {
            ...instanceOptionsFactory(deployId, instanceId),
            noBackendCheckpoint: true,
          });
        }
      }

      // This is the deliberate no-backend checkpoint. The static Nginx pod, all
      // Gateway listeners, parent HTTPRoutes and selected instance HTTPRoutes
      // must be live before the first application Deployment YAML is submitted.
      if (gatewayApi && fallbackChecks.size > 0) {
        const fallbackResults = await gatewayFallbackProbeRunner({
          gatewayStatusRunner: UnderpostRun.RUNNERS['gateway-status'],
          checks: [...fallbackChecks.values()],
          options: { ...options, gatewayApi, namespace: options.namespace || 'default' },
          label: 'cluster',
        });
        logger.info('[cluster] Gateway fallback checkpoint passed; starting application deployments', {
          hosts,
          fallbacks: fallbackResults,
        });
      }

      for (const deployId of deployList) {
        const deployFlags = deployFlagsById[deployId];
        // Preserve the already-operational ingress objects and apply only the
        // workload manifests. EndpointSlices will update as pods become Ready;
        // the site route continues to reach underpost-gateway throughout.
        shellExec(`${baseCommand} deploy ${deployId} ${env} --disable-update-proxy ${deployFlags}`);
        if (gatewayApi) {
          const namespace = options.namespace || 'default';
          const version = /--versions\s+([^\s,]+)/.exec(deployFlags)?.[1] || 'blue';
          shellExec(`kubectl rollout status deployment/${deployId}-${env}-${version} -n ${namespace} --timeout=15m`);
          shellExec(`${baseCommand} deploy ${deployId} ${env} --sync-static ${deployFlags}`);
        }

        // Custom instance pods depend on the parent's gRPC service, so they are
        // still started after the parent is Ready. Their routes already exist and
        // keep serving the custom fallback until the atomic promotion completes.
        for (const instanceId of instancesByDeployId[deployId].ids) {
          logger.info('[cluster] Deploying custom instance', { deployId, instanceId, env, clusterType });
          await UnderpostRun.RUNNERS.instance(
            `${deployId},${instanceId},${options.replicas || 1}`,
            instanceOptionsFactory(deployId, instanceId),
          );
        }
      }
      logger.info('[cluster] Ingress stack deployed', {
        env,
        stack: gatewayApi ? 'gateway-api' : 'httpproxy',
        gatewayClass: gatewayApi ? Underpost.deploy.gatewayApiConfigFactory(options).gatewayClassName : null,
        http3: gatewayApi && options.disableHttp3 !== true,
        tls: env === 'production' ? 'cert-manager' : 'self-signed',
        hosts,
        instances: Object.fromEntries(
          deployList
            .filter((deployId) => instancesByDeployId[deployId].ids.length > 0)
            .map((deployId) => [deployId, instancesByDeployId[deployId].ids]),
        ),
      });
      if (gatewayApi) await UnderpostRun.RUNNERS['gateway-status']('', options);
    },

    /**
     * @method gateway-status
     * @description Reports whether the Gateway API data plane is actually
     * serving. Applying a Gateway only records intent: the controller
     * provisions Envoy asynchronously, so a deploy can finish cleanly while
     * nothing listens on the node — the failure then surfaces much later as a
     * bare "connection refused" from the browser. This waits for the Gateways to
     * be Programmed and prints the data plane's pods and services.
     * @param {string} path - Unused.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'gateway-status': async (path = '', options = DEFAULT_OPTION) => {
      const namespace = options.namespace || 'default';
      const dataPlaneNamespace = 'envoy-gateway-system';
      const capture = (cmd) => shellExec(cmd, { stdout: true, silent: true, silentOnError: true })?.trim?.() || '';

      const programmed = shellExec(
        `kubectl wait --for=condition=Programmed --timeout=180s gateway --all -n ${namespace}`,
        { silentOnError: true },
      );
      if (programmed?.code !== 0)
        logger.warn(
          '[gateway-status] Gateways are not Programmed. The listeners are not being served; ' +
            `check 'kubectl describe gateway -n ${namespace}' and the controller logs in ${dataPlaneNamespace}.`,
        );
      shellExec(`kubectl get gateway -n ${namespace} -o wide`, { silentOnError: true });

      // Per-listener truth. A Gateway reports Programmed while individual
      // listeners are rejected, so the aggregate condition hides exactly the
      // case where some hostnames serve and others do not. Prints each
      // listener's attached route count and any failing condition with its
      // reason — an unresolved TLS secret or a rejected listener names itself.
      const listenerStatus = capture(
        `kubectl get gateway -n ${namespace} -o jsonpath=` +
          `'{range .items[*]}{.metadata.name}{"  "}` +
          `{range .status.listeners[*]}{.name}=routes:{.attachedRoutes}` +
          `{range .conditions[?(@.status=="False")]}{" "}{.type}/{.reason}{end}{"  "}{end}{"\\n"}{end}'`,
      );
      logger.info('[gateway-status] Listeners (name=routes + failing conditions)\n' + (listenerStatus || '(none)'));

      // Envoy Gateway policies attach to a Gateway but configure the merged
      // listener, so two of them competing for the same listener is resolved by
      // rejecting one — and the rejection is recorded here, not on the Gateway.
      const policyStatus = capture(
        `kubectl get clienttrafficpolicy -n ${namespace} -o jsonpath=` +
          `'{range .items[*]}{.metadata.name}{range .status.ancestors[*]}` +
          `{range .conditions[?(@.status=="False")]}{"  "}{.type}/{.reason}: {.message}{end}{end}{"\\n"}{end}'`,
      );
      logger.info(
        '[gateway-status] ClientTrafficPolicies (failing conditions)\n' +
          (policyStatus
            .split('\n')
            .filter((line) => line.includes('  '))
            .join('\n') || '(none — all policies accepted)'),
      );

      // Envoy Gateway policies that fail to translate are not visible on the
      // Gateway or the route: the resource is admitted, its status carries the
      // rejection, and the xDS snapshot it belonged to can go with it — which
      // reads downstream as every hostname answering route_not_found.
      const backendPolicyStatus = capture(
        `kubectl get backendtrafficpolicy -n ${namespace} -o jsonpath=` +
          `'{range .items[*]}{.metadata.name}{range .status.ancestors[*]}` +
          `{range .conditions[?(@.status=="False")]}{"  "}{.type}/{.reason}: {.message}{end}{end}{"\n"}{end}' ` +
          `2>/dev/null`,
      );
      logger.info(
        '[gateway-status] BackendTrafficPolicies (failing conditions)\n' +
          (backendPolicyStatus
            .split('\n')
            .filter((line) => line.includes('  '))
            .join('\n') || '(none — all policies accepted)'),
      );

      // Route-level conditions. A rule that references something unresolvable
      // can cost the whole route, and then every path on that hostname answers
      // with a bare gateway 404 while the Gateway and its listeners stay green.
      const routeStatus = capture(
        `kubectl get httproute -n ${namespace} -o jsonpath=` +
          `'{range .items[*]}{.metadata.name}{range .status.parents[*]}` +
          `{range .conditions[?(@.status=="False")]}{"  "}{.type}/{.reason}: {.message}{end}{end}{"\\n"}{end}'`,
      )
        .split('\n')
        .filter((line) => line.includes('  '));
      logger.info(
        '[gateway-status] HTTPRoutes (failing conditions)\n' +
          (routeStatus.join('\n') || '(none — all routes accepted)'),
      );

      // The workloads the routes point at. A status code that moves between runs
      // (500 here, 404 there) is the application's, not the gateway's, and the
      // gateway config cannot explain it — restarts and unready containers can.
      const backends = capture(
        `kubectl get pods -n ${namespace} -o custom-columns=` +
          `'NAME:.metadata.name,READY:.status.containerStatuses[*].ready,RESTARTS:.status.containerStatuses[*].restartCount,STATUS:.status.phase'`,
      );
      logger.info('[gateway-status] Workloads behind the routes\n' + (backends || '(none)'));

      // A Programmed Gateway only means Envoy was provisioned — not that it is
      // reachable from this machine. Which of the two is false decides the fix,
      // so report the pod's network mode and container ports, the service type
      // and node ports, and what the host is actually listening on.
      const dataPlane = capture(
        `kubectl get pods -n ${dataPlaneNamespace} -o custom-columns=` +
          `'NAME:.metadata.name,HOST_NETWORK:.spec.hostNetwork,PORTS:.spec.containers[*].ports[*].containerPort'`,
      );
      const services = capture(
        `kubectl get svc -n ${dataPlaneNamespace} -o custom-columns=` +
          `'NAME:.metadata.name,TYPE:.spec.type,PORTS:.spec.ports[*].port,NODEPORTS:.spec.ports[*].nodePort,TARGETS:.spec.ports[*].targetPort'`,
      );
      logger.info('[gateway-status] Data plane\n' + dataPlane + '\n\n' + services);

      // Envoy creates its listener sockets only once the control plane has
      // pushed a config with routes attached, which lands a little after the
      // pod reports Ready. Polling that window is the difference between
      // "connection refused" and a working gateway, so wait for the socket
      // rather than sampling it once.
      const listenerFilter = `grep -E ':(80|443|10080|10443) '`;
      let hostListeners = '';
      for (let attempt = 0; attempt < 30; attempt++) {
        hostListeners = capture(`sudo ss -lntupH 2>/dev/null | ${listenerFilter}`);
        if (/:443\s/.test(hostListeners)) break;
        await timer(2000);
      }
      const servesHttps = /:443\s/.test(hostListeners);
      logger.info('[gateway-status] Host listeners on 80/443/10080/10443\n' + (hostListeners || '(none)'));

      if (!servesHttps) {
        logger.warn(
          '[gateway-status] Nothing is listening on this host port 443, so a browser reaching the ' +
            'hostnames through /etc/hosts gets "connection refused". Compare the two tables above: ' +
            'HOST_NETWORK=false means the pod is on the pod network (only the ClusterIP/NodePort is ' +
            'reachable); HOST_NETWORK=true with PORTS 10080/10443 means the privileged-port remap is ' +
            'still active. Until it is resolved, forward the merged service to expose it locally:\n' +
            `  kubectl port-forward -n ${dataPlaneNamespace} svc/<envoy-service> 443:443 80:80 --address 127.0.0.1`,
        );
        return { programmed: programmed?.code === 0, servesHttps, dataPlane, services, hostListeners, probes: [] };
      }

      // An open socket still is not proof the hostname routes anywhere. Probe
      // each Gateway hostname exactly as the browser would — through /etc/hosts,
      // validating the certificate against the trust store `scripts/ssl.sh`
      // populated — so the workflow ends on an observed response, not an
      // inference. Each host is probed twice: over loopback, and pinned to the
      // node IP. The two answers separate a loopback-specific block from a data
      // plane that is not reachable at all.
      const nodeIp = capture(
        `kubectl get node -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'`,
      );
      // The `server` header is reported alongside the status because the code
      // alone cannot say who produced it: `500 (envoy)` is a gateway or upstream
      // failure, while `500` from the workload's own server is an application
      // error, and the two lead to completely different fixes.
      const probeUrl = (url, resolveArgs = '') => {
        const raw = capture(
          `curl -sS -o /dev/null -D - -w 'HTTP_CODE=%{http_code}' --max-time 10 ${resolveArgs}${url} 2>&1 | tr -d '\\r'`,
        );
        const status = /HTTP_CODE=([0-9]{3})/.exec(raw)?.[1];
        if (!status) return raw.split('\n').find((line) => line.startsWith('curl:')) || 'no-response';
        const server = /^server:\s*(.+)$/im.exec(raw)?.[1]?.trim();
        return server ? `${status} (${server})` : status;
      };
      const probe = (host, resolveTo) =>
        probeUrl(`https://${host}`, resolveTo ? `--resolve ${host}:443:${resolveTo} ` : '');
      // Port 80 is the same Envoy process, same host, same listener set — only
      // the port differs. It separates "this gateway is unreachable" from
      // "something specifically rejects 443".
      const probeHttp = (host) => probeUrl(`http://${host}`);
      // curl writes `000` when it never got a response, so a bare three-digit
      // match would read a failed connection as success.
      const answered = (status) => /^[1-5][0-9]{2}\b/.test(status);
      // The routes, not the listeners, are where the hostnames live: a
      // consolidated Gateway serves every hostname from one hostname-less
      // listener and picks the certificate by SNI, so reading the listeners
      // would leave nothing to probe.
      const hosts = [
        ...new Set(
          (path
            ? path.split(',')
            : capture(`kubectl get httproute -n ${namespace} -o jsonpath='{.items[*].spec.hostnames[*]}'`).split(/\s+/)
          )
            .map((host) => host.trim())
            .filter(Boolean),
        ),
      ];
      const probes = hosts.map((host) => ({
        host,
        http: probeHttp(host),
        loopback: probe(host),
        ...(nodeIp ? { nodeIp: probe(host, nodeIp) } : {}),
      }));
      logger.info('[gateway-status] HTTPS probe', { nodeIp: nodeIp || '(unknown)', probes });

      // A gateway answer alone cannot say whether the gateway or the workload
      // produced the code: Envoy relays an upstream response unchanged. So when
      // a hostname fails, ask its backend the *same* question from inside the
      // cluster, bypassing Envoy.
      //
      // Same question is the whole point: these workloads route by virtual host,
      // so a probe carrying `Host: <service-name>` exercises a different branch
      // than the browser did and its answer means nothing. Each probe therefore
      // replays the route it came from — the Gateway hostname, the rule path,
      // and the rewrite the rule would have applied — against the rule's own
      // backend. Only then do the two columns compare.
      const failing = probes.filter((entry) => /^[45]/.test(entry.loopback) || /^[45]/.test(entry.http));
      if (failing.length > 0) {
        const routes = JSON.parse(
          capture(`kubectl get httproute -n ${namespace} -o json`) || '{"items":[]}',
        ).items.filter((route) => failing.some((entry) => route.spec?.hostnames?.includes(entry.host)));
        // Exec into the static utility rather than spawning a probe pod: it is
        // installed with the gateway stack, sits in this namespace, and its
        // BusyBox shell already carries wget — no image pull, no pod churn.
        const probePod = capture(
          `kubectl get pods -n ${namespace} -l app=${UNDERPOST_GATEWAY.name} -o jsonpath='{.items[0].metadata.name}'`,
        );
        if (!probePod || routes.length === 0) {
          logger.warn(
            '[gateway-status] Cannot probe backends directly: ' +
              (probePod
                ? 'no HTTPRoute matched a failing hostname'
                : `no ${UNDERPOST_GATEWAY.name} pod in ${namespace}`),
          );
        } else {
          const backendProbes = [];
          for (const route of routes) {
            const host = route.spec.hostnames[0];
            for (const rule of route.spec.rules || []) {
              const backend = (rule.backendRefs || [])[0];
              if (!backend) continue;
              const match = rule.matches?.[0]?.path?.value || '/';
              const rewrite = (rule.filters || []).find((filter) => filter.type === 'URLRewrite')?.urlRewrite?.path;
              const target =
                rewrite?.type === 'ReplaceFullPath'
                  ? rewrite.replaceFullPath
                  : rewrite?.type === 'ReplacePrefixMatch'
                    ? rewrite.replacePrefixMatch
                    : match;
              const raw = capture(
                `kubectl exec -n ${namespace} ${probePod} -- wget -S -O /dev/null -T 5 ` +
                  `--header 'Host: ${host}' http://${backend.name}:${backend.port}${target} 2>&1 || true`,
              );
              const code = /HTTP\/[0-9.]+\s+([0-9]{3})/.exec(raw)?.[1];
              const failure = raw.split('\n').find((line) => line.includes('wget:'));
              backendProbes.push({
                request: `${host}${match}`,
                backend: `${backend.name}:${backend.port}${target}`,
                direct: code || failure?.trim() || 'no-response',
                gateway: failing.find((entry) => entry.host === host)?.http,
              });
            }
          }
          logger.info('[gateway-status] Backend probe (same Host and path, bypassing Envoy)', { backendProbes });
          // Only the rule the browser actually hit is comparable, so judge on
          // the root rule rather than on every rule of the route.
          const rootProbes = backendProbes.filter((entry) => entry.request.endsWith('/'));
          const appFault = rootProbes.filter((entry) => `${entry.direct}` === `${entry.gateway}`);
          const gatewayFault = rootProbes.filter(
            (entry) => /^[0-9]{3}$/.test(entry.direct) && `${entry.direct}` !== `${entry.gateway}`,
          );
          if (gatewayFault.length > 0) {
            logger.warn(
              '[gateway-status] These backends answer differently without Envoy in the path, so the gateway is ' +
                'not relaying the workload response — the routing layer is the fault:\n  ' +
                gatewayFault
                  .map((entry) => `${entry.request} -> backend ${entry.direct}, gateway ${entry.gateway}`)
                  .join('\n  '),
            );
            // The access log is the only artifact that says *why*. Its
            // response_flags column separates an Envoy local reply (NR no route,
            // UF upstream connect failure, UH no healthy upstream, DPE protocol
            // error) from a relayed upstream status, which no amount of probing
            // from outside can distinguish.
            // Selector, not owning-gateway labels: under `mergeGateways` the data
            // plane belongs to the GatewayClass, so per-Gateway labels are absent
            // and a selector built from them silently matches nothing.
            const dataPlaneLog = capture(
              `kubectl logs -n ${dataPlaneNamespace} ` +
                `-l app.kubernetes.io/name=envoy,app.kubernetes.io/component=proxy ` +
                `-c envoy --tail=60 --prefix 2>/dev/null | tail -60`,
            );
            logger.info(
              '[gateway-status] Data plane access log (response_flags names the reason)\n' +
                (dataPlaneLog || `(none — check: kubectl get pods -n ${dataPlaneNamespace} --show-labels)`),
            );
            // A translation the control plane rejected after admitting the
            // resource surfaces only here, never on the object's own status.
            const controlPlaneLog = capture(
              `kubectl logs -n ${dataPlaneNamespace} deployment/envoy-gateway --tail=40 2>/dev/null ` +
                `| grep -Ei 'error|warn|reject|invalid' | tail -20`,
            );
            logger.info('[gateway-status] Control plane errors\n' + (controlPlaneLog || '(none in the last 40 lines)'));
          }
          if (appFault.length > 0)
            logger.warn(
              '[gateway-status] These backends return the same code without Envoy in the path, so the gateway is ' +
                'relaying an application response — the routing layer is not the fault:\n  ' +
                appFault.map((entry) => `${entry.request} -> ${entry.direct}`).join('\n  ') +
                `\n  Read the workload log: kubectl logs -n ${namespace} <pod>`,
            );
        }
      }

      const unreachable = probes.filter((entry) => !answered(entry.loopback));
      if (unreachable.length > 0) {
        // Narrow it here rather than leaving the operator with a bare refusal.
        // A socket bound on 0.0.0.0 that resets a loopback connection is either
        // not in this network namespace, or something is rejecting the packet.
        const listenerPid = /pid=(\d+)/.exec(hostListeners)?.[1];
        const hostNetns = capture(`sudo readlink /proc/1/ns/net`);
        const listenerNetns = listenerPid ? capture(`sudo readlink /proc/${listenerPid}/ns/net`) : '';
        // Anything that can answer a SYN with ICMP port-unreachable, from either
        // rule engine. firewalld on RHEL 9 keeps its rules in its own `inet
        // firewalld` nftables table, which `iptables-save` cannot see at all —
        // grepping only iptables hides half the packet path.
        const rejectRules = capture(
          `sudo iptables-save 2>/dev/null | grep -E '(REJECT|DROP)' | grep -E '(dport|dpt:) ?(443|https)\\b' | head -20`,
        );
        const nftRules = capture(
          `sudo nft list ruleset 2>/dev/null | grep -nE '(dport|ports) .*(443|https)|reject' | head -20`,
        );
        // A hostPort claim outranks any process listening on the node: the CNI
        // plugin DNATs the port to the claiming pod first, so the packet never
        // reaches the gateway. This is the one failure that leaves every other
        // signal green.
        const hostPortHijack = capture(
          `sudo nft list ruleset 2>/dev/null | grep -E 'dport (80|443)\\b.*dnat to' | head -5`,
        );
        const hostPortClaims = capture(
          `kubectl get daemonset,deployment -A ` +
            `-o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}={.spec.template.spec.containers[*].ports[*].hostPort}{"\\n"}{end}'`,
        )
          .split('\n')
          .filter((line) => /=.*\b(80|443)\b/.test(line));
        logger.warn(`[gateway-status] ${unreachable.length}/${probes.length} hostnames did not answer over HTTPS`, {
          listenerPid: listenerPid || '(unknown)',
          hostNetns: hostNetns || '(unknown)',
          listenerNetns: listenerNetns || '(unknown)',
          sameNetworkNamespace: !!hostNetns && hostNetns === listenerNetns,
          nodeIpReachable: probes.some((entry) => answered(entry.nodeIp)),
          endpointlessServices: capture(
            `kubectl get svc -A -o jsonpath=` + `'{range .items[*]}{.metadata.namespace}/{.metadata.name} {end}'`,
          )
            .split(/\s+/)
            .filter(Boolean)
            .filter((ref) => {
              const [ns, name] = ref.split('/');
              return !capture(
                `kubectl get endpointslice -n ${ns} -l kubernetes.io/service-name=${name} ` +
                  `-o jsonpath='{.items[*].endpoints[*].addresses[*]}'`,
              ).trim();
            }),
          httpReachable: probes.some((entry) => answered(entry.http)),
          hostPortHijack: hostPortHijack || '(none)',
          hostPortClaims: hostPortClaims.length > 0 ? hostPortClaims : '(none)',
          rejectRules: rejectRules || '(none matching 443 in iptables)',
          nftRules: nftRules || '(none matching 443 in nftables)',
        });
        logger.warn(
          '[gateway-status] Read it as: hostPortHijack non-empty → another workload reserved host port ' +
            '80/443 and the CNI DNATs those ports to it before the gateway can see them; hostPortClaims ' +
            'names the owner, and only one ingress stack can hold them. httpReachable=true → the same Envoy ' +
            'answers on 80, so only 443 is rejected. sameNetworkNamespace=false → the listener is not on ' +
            'this host despite hostNetwork. endpointlessServices naming a Service that publishes 80/443 → ' +
            'kube-proxy REJECTs those ports on its behalf; delete it.',
        );
      }

      return { programmed: programmed?.code === 0, servesHttps, dataPlane, services, hostListeners, probes };
    },
    /**
     * @method deploy
     * @description Deploys a specified service (identified by `path`) using blue/green strategy, monitors its status, and switches traffic upon readiness.
     * @param {string} path - The input value, identifier, or path for the operation (used as the deployment ID to deploy).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    deploy: async (path, options = DEFAULT_OPTION) => {
      const deployId = path;
      const env = options.dev ? 'development' : 'production';
      const { validVersion } = Underpost.repo.privateConfUpdate(deployId);
      if (!validVersion) throw new Error('Version mismatch');
      const currentTraffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace: options.namespace, env });
      const targetTraffic = currentTraffic === 'blue' ? 'green' : 'blue';
      const ignorePods = Underpost.kubectl
        .get(`${deployId}-${env}-${targetTraffic}`, 'pods', options.namespace)
        .map((p) => p.NAME);

      shellExec(`sudo kubectl rollout restart deployment/${deployId}-${env}-${targetTraffic} -n ${options.namespace}`);

      await Underpost.monitor.monitorReadyRunner(deployId, env, targetTraffic, ignorePods, options.namespace);

      Underpost.deploy.switchTraffic(deployId, env, targetTraffic, options.replicas, options.namespace, options);
    },

    /**
     * @method disk-clean
     * @description Executes the `disk-clean-sh` script to perform disk cleanup operations.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'disk-clean': async (path, options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/disk-clean.sh`);
      shellExec(`./scripts/disk-clean.sh`);
    },

    /**
     * @method disk-devices
     * @description Executes the `disk-devices.sh` script to display information about disk devices.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'disk-devices': async (path = '/', options = DEFAULT_OPTION) => {
      const { underpostRoot } = options;
      shellExec(`chmod +x ${underpostRoot}/scripts/disk-devices.sh`);
      shellExec(`${underpostRoot}/scripts/disk-devices.sh`);
    },

    /**
     * @method disk-usage
     * @description Displays disk usage statistics using the `du` command, sorted by size.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'disk-usage': async (path = '/', options = DEFAULT_OPTION) => {
      if (!path) path = '/';
      logger.info('Mount filesystem');
      shellExec(`df -h${path === '/' ? '' : ` ${path}`}`);
      logger.info('Files disks usage');
      shellExec(`du -xh ${path} --max-depth=1 | sort -h`);
    },

    /**
     * @method dev
     * @description Starts development servers for client, API, and proxy based on provided parameters (deployId, host, path, clientHostPort).
     * @param {string} path - The input value, identifier, or path for the operation (formatted as `deployId,subConf,host,path,clientHostPort`).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    dev: async (path = '', options = DEFAULT_OPTION) => {
      let [deployId, subConf, host, _path, clientHostPort] = path.split(',');
      if (options.confServerPath) {
        const confServer = JSON.parse(fs.readFileSync(options.confServerPath, 'utf8'));
        fs.writeFileSync(
          `./engine-private/conf/${deployId}/conf.server.dev.${subConf}.json`,
          JSON.stringify(
            {
              [host]: {
                [_path]: confServer[host][_path],
              },
            },
            null,
            4,
          ),
          'utf8',
        );
      }
      if (!deployId) deployId = 'dd-default';
      if (!host) host = 'default.net';
      if (!_path) _path = '/';
      if (!clientHostPort) clientHostPort = 'localhost:4004';
      if (!subConf) subConf = 'local';
      if (options.reset && fs.existsSync(`./engine-private/conf/${deployId}`))
        fs.removeSync(`./engine-private/conf/${deployId}`);
      if (options.devProxyPortOffset) {
        const envPath = `./engine-private/conf/${deployId}/.env.development`;
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        envObj.DEV_PROXY_PORT_OFFSET = options.devProxyPortOffset;
        writeEnv(envPath, envObj);
      }
      dotenv.config({ path: `./engine-private/conf/${deployId}/.env.development`, override: true });
      shellExec(`node bin run dev-cluster --expose --namespace ${options.namespace}`, { async: true });
      {
        const cmd = `npm run dev:api ${deployId} ${subConf} ${host} ${_path} ${clientHostPort} proxy${
          options.tls ? ' tls' : ''
        }`;
        shellExec(cmd, { async: true });
      }
      if ((await awaitDeployMonitor()) !== true) return;
      {
        const cmd = `npm run dev:client ${deployId} ${subConf} ${host} ${_path} proxy${options.tls ? ' tls' : ''}`;

        shellExec(cmd, {
          async: true,
        });
      }
      if ((await awaitDeployMonitor()) !== true) return;
      shellExec(
        `NODE_ENV=development node src/proxy proxy ${deployId} ${subConf} ${host} ${_path}${options.tls ? ' tls' : ''}`,
      );
    },

    /**
     * @method service
     * @description Deploys and exposes specific services (like `mongo-express-service`) on the cluster, updating deployment configurations and monitoring status.
     * @param {string} path - The input value, identifier, or path for the operation (formatted as `deployId,serviceId,host,path,replicas,image,node`).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    service: async (path = '', options = DEFAULT_OPTION) => {
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      shellCd(`/home/dd/engine`);
      let [deployId, serviceId, host, _path, replicas, image, node] = path.split(',');
      if (!replicas) replicas = options.replicas;
      // const confClient = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.client.json`, 'utf8'));
      const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
      // const confSSR = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.ssr.json`, 'utf8'));
      // const packageData = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/package.json`, 'utf8'));
      const services = fs.existsSync(`./engine-private/deploy/${deployId}/conf.services.json`)
        ? JSON.parse(fs.readFileSync(`./engine-private/deploy/${deployId}/conf.services.json`, 'utf8'))
        : [];
      let serviceData = services.findIndex((s) => s.serviceId === serviceId);
      const payload = {
        serviceId,
        path: _path,
        port: options.port,
        host,
      };
      let podToMonitor;
      if (!payload.port)
        switch (serviceId) {
          case 'mongo-express-service': {
            payload.port = 8081;
            break;
          }
          case 'grafana': {
            payload.port = 3000;
            // payload.pathRewritePolicy = [
            //   {
            //     prefix: '/grafana',
            //     replacement: '/',
            //   },
            // ];
            break;
          }
        }
      if (serviceData == -1) {
        services.push(payload);
      } else {
        services[serviceData] = payload;
      }
      fs.writeFileSync(
        `./engine-private/conf/${deployId}/conf.services.json`,
        JSON.stringify(services, null, 4),
        'utf8',
      );
      switch (serviceId) {
        case 'mongo-express-service': {
          shellExec(`kubectl delete svc mongo-express-service -n ${options.namespace} --ignore-not-found`);
          shellExec(`kubectl delete deployment mongo-express -n ${options.namespace} --ignore-not-found`);
          shellExec(`kubectl apply -f manifests/deployment/mongo-express/deployment.yaml -n ${options.namespace}`);
          podToMonitor = 'mongo-express';
          break;
        }
        case 'grafana': {
          shellExec(
            `node bin cluster${baseClusterCommand} --grafana --hosts '${host}' --prom '${Object.keys(confServer)}'`,
          );
          podToMonitor = 'grafana';
          break;
        }
      }
      const success = await Underpost.test.statusMonitor(podToMonitor);
      if (success) {
        const versions =
          Underpost.deploy.getCurrentTraffic(deployId, {
            namespace: options.namespace,
            env: options.dev ? 'development' : 'production',
          }) || 'blue';
        if (!node) node = os.hostname();
        const timeoutFlags = Underpost.deploy.timeoutFlagsFactory(options);
        shellExec(
          `${baseCommand} deploy${options.dev ? '' : ' --kubeadm'}${
            options.devProxyPortOffset ? ' --disable-deployment-proxy' : ''
          } --build-manifest --sync --info-router --replicas ${replicas} --node ${node}${
            image ? ` --image ${image}` : ''
          }${versions ? ` --versions ${versions}` : ''}${timeoutFlags} dd ${env}`,
        );
        shellExec(
          `${baseCommand} deploy${options.dev ? '' : ' --kubeadm'}${
            options.devProxyPortOffset ? ' --disable-deployment-proxy' : ''
          } --disable-update-deployment ${deployId} ${env} --versions ${versions}`,
        );
      } else logger.error(`Service pod ${podToMonitor} failed to start in time.`);
      if (options.etcHosts === true) {
        const hostListenResult = etcHostFactory([host]);
        logger.info(hostListenResult.renderHosts);
      }
    },

    /**
     * @method etc-hosts
     * @description Generates and logs the contents for the `/etc/hosts` file based on provided hosts or deployment configurations.
     * @param {string} path - The input value, identifier, or path for the operation (used as a comma-separated list of hosts).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'etc-hosts': async (path = '', options = DEFAULT_OPTION) => {
      const hosts = path ? path.split(',') : [];
      if (options.deployId) hosts.push(...deployHostsFactory(options.deployId));
      const hostListenResult = etcHostFactory(hosts);
      logger.info(hostListenResult.renderHosts);
    },

    /**
     * @method sh
     * @description Enables remote control for the Kitty terminal emulator.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    sh: async (path = '', options = DEFAULT_OPTION) => {
      let [operator, arg0, arg1] = path.split(',');
      if (operator == 'copy') {
        shellExec(
          `kitty @ get-text ${arg0 === 'all' ? '--match all' : '--self'} --extent all${
            arg1 === 'ansi' ? ' --ansi yes' : ''
          } | kitty +kitten clipboard`,
        );
        return;
      }
      shellExec(`kitty -o allow_remote_control=yes`);
    },

    /**
     * @method log
     * @description Searches and highlights keywords in a specified log file, optionally showing surrounding lines.
     * @param {string} path - The input value, identifier, or path for the operation (formatted as `filePath,keywords,lines`).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    log: async (path, options = DEFAULT_OPTION) => {
      const [filePath, keywords, lines] = path.split(',');
      let result = shellExec(`grep -i -E ${lines ? `-C ${lines} ` : ''}'${keywords}' ${filePath}`, {
        stdout: true,
        silent: true,
      }).replaceAll(`--`, `==============================`.green.bold);
      for (const keyword of keywords.split('|')) result = result.replaceAll(keyword, keyword.bgYellow.black.bold);
      console.log(result);
    },

    /**
     * @method ps
     * @description Displays running processes that match a specified path or keyword.
     * @param {string} path - The input value, identifier, or path for the operation (used as a keyword to filter processes).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ps: async (path = '', options = DEFAULT_OPTION) => {
      const out = shellExec(
        path.startsWith('top-consumers')
          ? `ps -eo pid,%cpu,%mem,rss,cmd --sort=-%cpu | head -n ${path.split(',')[1] || 15}`
          : path
            ? `(ps -eo pid,%cpu,%mem,rss,cmd -ww | head -n1; ps -eo pid,%cpu,%mem,rss,cmd -ww | tail -n +2 | grep -F ${path})`
            : `ps -eo pid,%cpu,%mem,rss,cmd -ww`,
        {
          stdout: true,
          silent: true,
        },
      );

      console.log(
        path ? out.replaceAll(path.split(',')[2] || path, (path.split(',')[2] || path).bgYellow.black.bold) : out,
      );
    },

    /**
     * @method pid-info
     * @description Displays detailed information about a process by PID, including service details, command line, executable path, working directory, environment variables, and parent process tree.
     * @param {string} path - The PID of the process to inspect.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'pid-info': (path, options = DEFAULT_OPTION) => {
      const pid = path;
      if (!pid) {
        logger.error('PID is required. Usage: underpost run pid-info <pid>');
        return;
      }

      // Services
      logger.info('Process info');
      shellExec(`sudo ps -p ${pid} -o pid,ppid,user,stime,etime,cmd`);
      logger.info('Command line');
      shellExec(`sudo cat /proc/${pid}/cmdline | tr '\\0' ' ' ; echo`);
      logger.info('Executable path');
      shellExec(`sudo readlink -f /proc/${pid}/exe`);
      logger.info('Working directory');
      shellExec(`sudo readlink -f /proc/${pid}/cwd`);
      logger.info('Environment variables (first 200)');
      shellExec(`sudo tr '\\0' '\\n' </proc/${pid}/environ | head -200`);

      // Parent
      logger.info('Parent process');
      const parentInfo = shellExec(`sudo ps -o pid,ppid,user,cmd -p ${pid}`, { stdout: true, silent: true });
      console.log(parentInfo);
      const ppidMatch = parentInfo.split('\n').find((l) => l.trim().startsWith(pid));
      if (ppidMatch) {
        const ppid = ppidMatch.trim().split(/\s+/)[1];
        logger.info(`Parent PID: ${ppid}`);
        shellExec(`ps -fp ${ppid}`);
      }
      logger.info('Process tree');
      shellExec(`pstree -s ${pid}`);
    },

    /**
     * @method background
     * @description Runs a custom command in the background using nohup, logging output to `/var/log/<id>.log` and saving the PID to `/var/run/<id>.pid`.
     * @param {string} path - The command to run in the background (e.g. 'npm run prod:container dd-cyberia-r3').
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    background: (path, options = DEFAULT_OPTION) => {
      if (!path) {
        logger.error('Command is required. Usage: underpost run background <command>');
        return;
      }
      const id = path.split(/\s+/).pop();
      const logFile = `/var/log/${id}.log`;
      const pidFile = `/var/run/${id}.pid`;
      logger.info(`Starting background process`, { id, logFile, pidFile });
      shellExec(`nohup ${path} > ${logFile} 2>&1 & pid=$!; echo $pid > ${pidFile}; disown`);
      logger.info(`Background process started for '${id}'`);
    },

    /**
     * @method ports
     * @description Set on ~/.bashrc alias: ports <port> Command to list listening ports that match the given keyword.
     * @param {string} path - The input value, identifier, or path for the operation (used as a keyword to filter listening ports).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    ports: async (path = '', options = DEFAULT_OPTION) => {
      shellExec(`chmod +x ${options.underpostRoot}/scripts/ports-ls.sh`);
      shellExec(`${options.underpostRoot}/scripts/ports-ls.sh`);
    },

    /**
     * @method deploy-test
     * @description Deploys a test deployment (`dd-test`) in either development or production mode, setting up necessary secrets and starting the deployment.
     * @param {string} path - The input value, identifier, or path for the operation (used as the deployment ID).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'deploy-test': async (path, options = DEFAULT_OPTION) => {
      // Note: use recomendation empty deploy cluster: node bin --dev cluster
      const env = options.dev ? 'development' : 'production';
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseClusterCommand = options.dev ? ' --dev' : '';
      const inputs = path ? path.split(',') : [];
      const deployId = inputs[0] ? inputs[0] : 'dd-test';
      const cmd = options.cmd
        ? options.cmd
        : [
            `npm install -g npm@11.2.0`,
            `npm install -g underpost`,
            `${baseCommand} secret underpost --create-from-env`,
            `${baseCommand} start --build --run ${deployId} ${env}`,
          ];
      shellExec(`node bin run sync${baseClusterCommand} --deploy-id-cron-jobs none dd-test --cmd "${cmd}"`);
    },

    /**
     * @method tf-vae-test
     * @description Creates and runs a job pod (`tf-vae-test`) that installs TensorFlow dependencies, clones the TensorFlow docs, and runs the CVAE tutorial script, with a terminal monitor attached.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'tf-vae-test': async (path, options = DEFAULT_OPTION) => {
      const podName = 'tf-vae-test';
      await Underpost.run.CALL('deploy-job', '', {
        logs: options.logs,
        podName,
        // volumeMountPath: '/custom_images',
        // volumeHostPath: '/home/dd/engine/src/client/public/cyberia/assets/skin',
        on: {
          init: async () => {
            // const pid = getTerminalPid();
            // shellExec(`sudo kill -9 ${pid}`);
            (async () => {
              const nameSpace = options.namespace;
              const basePath = '/home/dd';
              const scriptPath = '/site/en/tutorials/generative/cvae.py';

              const { close } = await (async () => {
                const checkAwaitPath = '/await';
                while (!Underpost.kubectl.existsFile({ podName, path: checkAwaitPath })) {
                  logger.info('monitor', checkAwaitPath);
                  await timer(1000);
                }

                return {
                  close: () => shellExec(`sudo kubectl exec -i ${podName} -- sh -c "rm -rf ${checkAwaitPath}"`),
                };
              })();

              const localScriptPath = `${basePath}/lab/src/${scriptPath.split('/').pop()}`;
              if (!fs.existsSync(localScriptPath)) {
                throw new Error(`Local override script not found: ${localScriptPath}`);
              }

              shellExec(`sudo kubectl cp ${localScriptPath} ${nameSpace}/${podName}:${basePath}/docs${scriptPath}`);

              close();

              {
                const checkPath = `/latent_space_plot.png`;
                const outsPaths = [];
                const labDir = `${basePath}/lab`;

                logger.info('monitor', checkPath);
                {
                  const checkAwaitPath = `/home/dd/docs${checkPath}`;
                  while (!Underpost.kubectl.existsFile({ podName, path: checkAwaitPath })) {
                    logger.info('waiting for', checkAwaitPath);
                    await timer(1000);
                  }
                }

                {
                  const toPath = `${labDir}${checkPath}`;
                  outsPaths.push(toPath);
                  shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${basePath}/docs${checkPath} ${toPath}`);
                }

                for (let i of range(1, 10)) {
                  const fileName = `image_at_epoch_${setPad(i, '0', 4)}.png`;
                  const fromPath = `/${fileName}`;
                  const toPath = `${labDir}/${fileName}`;
                  outsPaths.push(toPath);
                  shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${basePath}/docs${fromPath} ${toPath}`);
                }

                shellExec(`firefox ${outsPaths.join(' ')}`);
                process.exit(0);
              }
            })();
          },
        },
        args: [
          `pip install --upgrade \
               nbconvert \
               tensorflow-probability==0.23.0 \
               imageio \
               git+https://github.com/tensorflow/docs \
               matplotlib \
               "numpy<1.25,>=1.21"`,
          'mkdir -p /home/dd',
          'cd /home/dd',
          'git clone https://github.com/tensorflow/docs.git',
          'cd docs',
          'jupyter nbconvert --to python site/en/tutorials/generative/cvae.ipynb',
          `echo '' > /await`,
          `echo '=== WAITING SCRIPT LAUNCH ==='`,
          `while [ -f /await ]; do sleep 1; done`,
          `echo '=== FINISHED ==='`,
          daemonProcess(`ipython site/en/tutorials/generative/cvae.py`),
        ],
      });
    },

    /**
     * @method spark-template
     * @description Creates a new Spark template project using `sbt new` in `/home/dd/spark-template`, initializes a Git repository, and runs `replace_params.sh` and `build.sh`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'spark-template': (path, options = DEFAULT_OPTION) => {
      const dir = '/home/dd/spark-template';
      shellExec(`sudo rm -rf ${dir}`);
      shellCd('/home/dd');

      // pbcopy(`cd /home/dd && sbt new ${process.env.GITHUB_USERNAME}/spark-template.g8`);
      // await read({ prompt: 'Command copy to clipboard, press enter to continue.\n' });
      shellExec(`cd /home/dd && sbt new ${process.env.GITHUB_USERNAME}/spark-template.g8 '--name=spark-template'`);

      shellCd(dir);

      Underpost.repo.initLocalRepo({ path: dir });
      shellExec(`git add . && git commit -m "Base implementation"`);
      shellExec(`chmod +x ./replace_params.sh`);
      shellExec(`chmod +x ./build.sh`);

      shellExec(`./replace_params.sh`);
      shellExec(`./build.sh`);

      shellCd('/home/dd/engine');
    },
    /**
     * @method pull-rocky-image
     * @description Pulls the base `rockylinux:9` image from Docker Hub via Podman.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'pull-rocky-image': (path, options = DEFAULT_OPTION) => {
      shellExec(`sudo podman pull docker.io/library/rockylinux:9`);
    },
    /**
     * @method rmi
     * @description Forces the removal of all local Podman images (`podman rmi $(podman images -qa) --force`).
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    rmi: (path, options = DEFAULT_OPTION) => {
      shellExec(`podman rmi $(podman images -qa) --force`);
    },
    /**
     * @method kill
     * @description Kills processes listening on the specified port(s). If the `path` contains a `+`, it treats it as a range of ports to kill.
     * @param {string} path - The input value, identifier, or path for the operation (used as the port number).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    kill: (path = '', options = DEFAULT_OPTION) => {
      if (options.pid)
        return shellExec(`sudo kill -9 ${options.pid}`, {
          silentOnError: true,
        });
      for (const _path of path.split(',')) {
        if (_path.split('+')[1]) {
          let [port, sumPortOffSet] = _path.split('+');
          port = parseInt(port);
          sumPortOffSet = parseInt(sumPortOffSet);
          for (const sumPort of range(0, sumPortOffSet))
            shellExec(
              `PIDS=$(lsof -t -i:${parseInt(port) + parseInt(sumPort)}); [ -n "$PIDS" ] && sudo kill -9 $PIDS || true`,
              {
                silentOnError: true,
              },
            );
        } else
          shellExec(`PIDS=$(lsof -t -i:${_path}); [ -n "$PIDS" ] && sudo kill -9 $PIDS || true`, {
            silentOnError: true,
          });
      }
    },
    /**
     * @method generate-pass
     * @description Generates a cryptographically secure random password that satisfies all validatePassword
     * constraints (lowercase, uppercase, digit, special char, min 8 chars). Logs the plain password
     * to the console or, when `--copy` is set, copies it to the clipboard via pbcopy.
     * @param {string} path - Optional password length (default: 16).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow.
     * @param {boolean} options.copy - When true, copies to clipboard instead of logging.
     * @memberof UnderpostRun
     */
    'generate-pass': (path, options = DEFAULT_OPTION) => {
      const password = generateSecurePassword(path && parseInt(path) > 0 ? parseInt(path) : 16);
      if (options.copy) pbcopy(password);
      else console.log(password);
    },
    /**
     * @method sops-setup
     * @description End-to-end SOPS/Age onboarding for a host: installs tooling, generates the Age
     * keypair and creation rules, pins the key path for non-interactive runs, encrypts the
     * requested Secrets into the Git-tracked store, then validates and applies them.
     *
     * Every step is idempotent and re-runnable. Notably it delegates key generation to
     * `secret sops --init` rather than calling `age-keygen` directly: a bare `age-keygen -o`
     * overwrites an existing key, which would orphan every manifest already encrypted to the
     * previous recipient with no way to recover them.
     *
     * On a host that pulled a store created elsewhere, the freshly generated key is not a recipient
     * of the inherited manifests. `init()` registers this host in the creation rules so what it
     * encrypts from here on stays readable, but existing manifests can only be re-keyed from a host
     * that still holds a decrypting key. That case is reported per secret and then raised by the
     * apply pre-flight with the available remedies, rather than surfacing as a sops decrypt error.
     *
     * Onboards the whole self-hosted data tier by default — PostgreSQL, MariaDB, and MongoDB
     * (`postgres-secret`, `mariadb-secret`, `mongodb-secret`, `mongodb-keyfile`). The MongoDB
     * keyfile is included because the StatefulSet mounts it for intra-replica-set auth and will
     * not start without it. Pass an explicit comma-separated list to narrow the set.
     *
     * Secret values are resolved per data key, in order:
     *   1. the origin seed file, when one exists (`engine-private/postgresql-password`) — this is
     *      the real onboarding path, carrying the credential the cluster already runs on;
     *   2. `--args` as `key=value` pairs, for a value supplied by the operator;
     *   3. a freshly generated value: a base64 keyfile for `mongodb-keyfile`, `admin` for a
     *      `username`, otherwise a 24-character secure password.
     *
     * Plaintext manifests are written by Node under `/dev/shm` at mode 600 and shredded by
     * `encrypt()`. They are never emitted through a shell heredoc, which would place the
     * credential in the command string and therefore in the process table and the command log.
     *
     * Usage:
     *   underpost run sops-setup                                   # postgres + mariadb + mongo
     *   underpost run sops-setup mongodb-secret,mongodb-keyfile --namespace prod
     *   underpost run sops-setup postgres-secret --args "password=s3cr3t"
     *   underpost run sops-setup --dry-run                         # stop before mutating cluster
     *   underpost run sops-setup --force                           # replace stored manifests
     * @param {string} path - Comma-separated Secret names to onboard. Defaults to the full data
     *   tier: postgres-secret, mariadb-secret, mongodb-secret, mongodb-keyfile.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @param {string} options.namespace - Target namespace for the store and the apply (default: 'default').
     * @param {string} options.args - Comma-separated `key=value` overrides for Secret data keys.
     * @param {boolean} options.dryRun - Validate and server-dry-run only; never apply.
     * @param {boolean} options.force - Replace encrypted manifests that already exist.
     * @memberof UnderpostRun
     */
    'sops-setup': (path = '', options = DEFAULT_OPTION) => {
      const namespace = options.namespace || 'default';
      const secretNames = (path || SOPS_SETUP_DEFAULT_SECRETS.join(','))
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

      // `--args key=value,key2=value2` overrides, applied to any secret that declares that key.
      const overrides = `${options.args || ''}`.split(',').reduce((acc, pair) => {
        const separator = pair.indexOf('=');
        if (separator > 0) acc[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
        return acc;
      }, {});

      logger.info('sops-setup', { secretNames, namespace, dryRun: !!options.dryRun, force: !!options.force });

      // 1. Host tooling, then keypair + creation rules. Both no-op when already present.
      Underpost.secret.sops.installTooling();
      Underpost.secret.sops.init();

      // 2. Pin the resolved key path for non-interactive runs (systemd units, CronJobs, sudo).
      //    Written with the concrete path rather than a guessed default, because `sudo` resets
      //    HOME and a wrong guess surfaces later as an opaque decrypt failure.
      const keyFile = Underpost.secret.sops.keyFile();
      shellExec(
        `sudo tee /etc/profile.d/underpost-sops.sh >/dev/null <<'UNDERPOST_SOPS_ENV_EOF'
export SOPS_AGE_KEY_FILE="\${SOPS_AGE_KEY_FILE:-${keyFile}}"
UNDERPOST_SOPS_ENV_EOF`,
      );
      shellExec(`sudo chmod 644 /etc/profile.d/underpost-sops.sh`);

      // 3. Build and encrypt each requested Secret.
      const stageDir = '/dev/shm/underpost-secrets';
      const held = Underpost.secret.sops.localRecipients();
      fs.ensureDirSync(stageDir);
      fs.chmodSync(stageDir, 0o700);
      try {
        for (const name of secretNames) {
          const stored = Underpost.secret.sops.has(name, namespace);
          if (stored && !options.force) {
            // A stored manifest this host cannot open is present but unusable here, so reporting it
            // as onboarded would send the operator on to an apply that is guaranteed to fail.
            if (Underpost.secret.sops.decryptable(Underpost.secret.sops.manifestPath(name, namespace), held))
              logger.info(`${name} is already onboarded in ns/${namespace}; skipping (use --force to replace)`);
            else
              logger.warn(
                `${name} is stored in ns/${namespace} but is sealed to an Age recipient this host does not hold; ` +
                  `skipping. Adopt the store's key, re-key it from a host that holds one, or re-onboard from the ` +
                  `origin seed files with --force.`,
              );
            continue;
          }

          // Data keys come from the secret's origin seed contract, so an onboarded manifest
          // carries exactly the keys the workload's secretKeyRef already expects.
          const seedSources = Underpost.secret.sops.seedSources(name);
          const dataKeys = Object.keys(seedSources).length > 0 ? Object.keys(seedSources) : ['password'];
          const stringData = {};
          for (const key of dataKeys) {
            const seedPath = seedSources[key];
            if (seedPath && fs.existsSync(seedPath)) {
              stringData[key] = fs.readFileSync(seedPath, 'utf8').trim();
              logger.info(`${name}.${key} seeded from ${seedPath}`);
            } else if (overrides[key] !== undefined) {
              stringData[key] = overrides[key];
              logger.info(`${name}.${key} taken from --args`);
            } else {
              stringData[key] = generateSeedValue(key);
              // Replacing a stored manifest with a value nothing seeded means the credential the
              // running datastore still authenticates against is being thrown away.
              if (stored)
                logger.warn(
                  `${name}.${key} generated while replacing the stored manifest — no seed file at ` +
                    `${seedPath || '(unmapped)'} and no --args override. The running datastore keeps its old ` +
                    `credential until this value is applied to it; pass --args "${key}=<value>" to keep the ` +
                    `existing one.`,
                );
              else logger.info(`${name}.${key} generated`);
            }
          }

          const stagePath = `${stageDir}/${name}.yaml`;
          fs.outputFileSync(
            stagePath,
            [
              'apiVersion: v1',
              'kind: Secret',
              'metadata:',
              `  name: ${name}`,
              `  namespace: ${namespace}`,
              '  labels:',
              '    app.kubernetes.io/managed-by: underpost',
              'type: Opaque',
              'stringData:',
              // Single-quoted YAML scalars with doubled internal quotes: values are generated or
              // operator-supplied and may contain characters YAML would otherwise interpret.
              ...Object.entries(stringData).map(([key, value]) => `  ${key}: '${`${value}`.replace(/'/g, "''")}'`),
              '',
            ].join('\n'),
            'utf8',
          );
          fs.chmodSync(stagePath, 0o600);
          // encrypt() stages, validates, moves into place, and shreds the plaintext source.
          Underpost.secret.sops.encrypt(stagePath, namespace, options);
        }
      } finally {
        // Defense in depth: encrypt() shreds each source, but a throw mid-loop must not leave a
        // plaintext manifest sitting in shared memory.
        fs.removeSync(stageDir);
      }

      Underpost.secret.sops.list();

      // 4. Validate every manifest in the namespace, then apply unless this is a dry run.
      Underpost.secret.sops.apply(namespace, { dryRun: true });
      if (options.dryRun) return logger.info('--dry-run: validated only, cluster left unchanged');
      Underpost.secret.sops.apply(namespace);
    },
    /**
     * @method sops-status
     * @description Reports the live state of the SOPS/Age secret system: host tooling, the Age
     * key and its recipient, the committed creation rules, every stored manifest with whether the
     * local key can open it and whether the cluster still matches, and which managed Secrets are
     * onboarded versus still seeding from their origin path.
     *
     * Read-only and safe to run anywhere. Decryption happens only for the drift check, only for
     * manifests the local key is a recipient of, and only into `kubectl diff` with its output
     * discarded — no secret value is ever printed or written to disk.
     *
     * Usage:
     *   underpost run sops-status                                   # every managed key, ns default
     *   underpost run sops-status mongo                             # partial match: both mongo keys
     *   underpost run sops-status --namespace prod                  # every managed key in ns prod
     * @param {string} path - Comma-separated managed Secret keys to report on; empty reports all.
     *   Matched as case-insensitive substrings (`mongo` selects mongodb-secret and mongodb-keyfile).
     *   Filters both the stored-manifest listing and the coverage table.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @param {string} options.namespace - Namespace to inspect (DEFAULT_OPTION scheme, default 'default').
     * @memberof UnderpostRun
     */
    'sops-status': (path = '', options = DEFAULT_OPTION) => {
      const sops = Underpost.secret.sops;
      // `--namespace` selects the namespace (DEFAULT_OPTION scheme); `path` narrows which managed
      // Secret keys to report on, so the two axes stay independent.
      const namespace = options.namespace || 'default';
      const manageSecretKeyFilter = path
        .split(',')
        .map((key) => key.trim().toLowerCase())
        .filter(Boolean);
      // Partial, case-insensitive substring match, so `mongo` reaches both `mongodb-secret` and
      // `mongodb-keyfile` without having to spell either out.
      const matchesKeyFilter = (name) =>
        manageSecretKeyFilter.length === 0 || manageSecretKeyFilter.some((key) => name.toLowerCase().includes(key));
      const mark = (ok) => (ok ? 'yes' : 'no');

      // ── Tooling ────────────────────────────────────────────────────────────
      const version = (bin, flag) =>
        sops.hasBinary(bin)
          ? shellExec(`${bin} ${flag} 2>/dev/null | head -1`, { stdout: true, silent: true, disableLog: true }).trim()
          : '(not installed)';
      logger.info(
        '[sops-status] Tooling\n' +
          `  sops        ${version('sops', '--version')}\n` +
          `  age         ${version('age', '--version')}\n` +
          `  age-keygen  ${sops.hasBinary('age-keygen') ? 'installed' : '(not installed)'}`,
      );

      // ── Age key ────────────────────────────────────────────────────────────
      const keyFile = sops.keyFile();
      const keyExists = fs.existsSync(keyFile);
      // A key file may hold several identities — that is how a host joins a store it did not
      // create — so every check below works against the whole held set, not one recipient.
      const held = sops.localRecipients();
      const keyMode = keyExists ? (fs.statSync(keyFile).mode & 0o777).toString(8) : '';
      logger.info(
        '[sops-status] Age key\n' +
          `  path        ${keyFile}\n` +
          `  present     ${mark(keyExists)}${keyExists ? `  (mode ${keyMode}${keyMode === '600' || keyMode === '400' ? '' : ' — INSECURE, run chmod 600'})` : ''}\n` +
          `  recipients  ${held.join(', ') || (keyExists ? '(none — unreadable key file)' : '(none)')}` +
          (keyExists ? '' : `\n  searched    ${sops.keyFileCandidates().join(', ')}`),
      );

      // ── Creation rules ─────────────────────────────────────────────────────
      const confPath = './engine-private/secrets/.sops.yaml';
      const ruleRecipients = sops.creationRecipients();
      logger.info(
        '[sops-status] Creation rules\n' +
          `  config      ${confPath} ${fs.existsSync(confPath) ? '' : '(missing — run: underpost secret sops --init)'}\n` +
          `  recipients  ${ruleRecipients.length > 0 ? ruleRecipients.join(', ') : '(none)'}\n` +
          `  local key listed  ${mark(held.some((recipient) => ruleRecipients.includes(recipient)))}`,
      );

      // ── Stored manifests ───────────────────────────────────────────────────
      const manifests = sops.manifests(namespace).filter((manifest) => matchesKeyFilter(manifest.name));
      const onboarded = new Set();
      if (manifests.length === 0)
        logger.warn(
          `[sops-status] Store\n  no encrypted manifests in ns/${namespace}` +
            (manageSecretKeyFilter.length > 0 ? ` matching ${manageSecretKeyFilter.join(', ')}` : ''),
        );
      else {
        const rows = manifests.map((manifest) => {
          onboarded.add(manifest.name);
          const recipients = sops.manifestRecipients(manifest.path);
          const decryptable = sops.decryptable(manifest.path, held);
          const live = shellExec(
            `kubectl get secret ${manifest.name} -n ${manifest.namespace} --ignore-not-found -o name 2>/dev/null || true`,
            { stdout: true, silent: true, silentOnError: true, disableLog: true },
          ).trim();
          // Drift is decided by kubectl's exit code; its stdout would contain the decrypted
          // values, so it is discarded rather than captured.
          let sync = 'n/a';
          if (live && decryptable) {
            const result = shellExec(
              `bash -c 'set -o pipefail; SOPS_AGE_KEY_FILE="${keyFile}" sops --decrypt "${manifest.path}" ` +
                `| kubectl diff -f - -n "${manifest.namespace}" >/dev/null 2>&1'`,
              { silentOnError: true, disableLog: true, stdout: false },
            );
            sync = result.code === 0 ? 'in-sync' : result.code === 1 ? 'DRIFT' : 'error';
          } else if (!live) sync = 'not applied';
          else if (!decryptable) sync = 'no local key';
          return (
            `  ${`${manifest.namespace}/${manifest.name}`.padEnd(34)} ` +
            `recipients=${String(recipients.length).padEnd(3)} ` +
            `decryptable=${mark(decryptable).padEnd(4)} ` +
            `live=${mark(!!live).padEnd(4)} ` +
            `${sync}`
          );
        });
        logger.info(`[sops-status] Store — ns/${namespace} (${manifests.length} manifest(s))\n` + rows.join('\n'));
      }

      // ── Coverage ───────────────────────────────────────────────────────────
      const coverage = sops
        .managedSecrets()
        .filter(matchesKeyFilter)
        .map((name) => {
          const seeds = Object.values(sops.seedSources(name));
          const seedPresent = seeds.length > 0 && seeds.every((seed) => fs.existsSync(seed));
          const source = onboarded.has(name)
            ? 'sops'
            : seedPresent
              ? 'origin seed'
              : seeds.length
                ? 'MISSING'
                : 'unmapped';
          return `  ${name.padEnd(24)} ${source.padEnd(12)} ${seeds.length ? `seed=${mark(seedPresent)}` : ''}`;
        });
      if (coverage.length === 0)
        logger.warn(
          `[sops-status] Coverage\n  no managed Secret matches ${manageSecretKeyFilter.join(', ')}\n` +
            `  known keys: ${sops.managedSecrets().join(', ')}`,
        );
      else
        logger.info('[sops-status] Coverage (which source each managed Secret deploys from)\n' + coverage.join('\n'));
    },
    /**
     * @method secret
     * @description Creates an Underpost secret named 'underpost' from a file, defaulting to `/home/dd/engine/engine-private/conf/dd-cron/.env.production` if no path is provided.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional path to the secret file).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    secret: (path, options = DEFAULT_OPTION) => {
      const cronDeployId = cronDeployIdResolve() || 'dd-cron';
      Underpost.secret.underpost.createFromEnvFile(
        `/home/dd/engine/engine-private/conf/${cronDeployId}/.env.${options.dev ? 'development' : 'production'}`,
      );
    },
    /**
     * @method underpost-config
     * @description Calls `Underpost.deploy.configMap` to create a Kubernetes ConfigMap, defaulting to the 'production' environment.
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional configuration name/environment).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'underpost-config': (path = '', options = DEFAULT_OPTION) => {
      Underpost.deploy.configMap(path ? path : 'production', options.namespace);
    },
    /**
     * @method gpu-env
     * @description Sets up a dedicated GPU development environment cluster, resetting and then setting up the cluster with `--dedicated-gpu` and monitoring the pods.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'gpu-env': (path, options = DEFAULT_OPTION) => {
      const clusterType = 'kubeadm';
      shellExec(
        `node bin cluster --dev --reset --${clusterType} && node bin cluster --dev --dedicated-gpu --${clusterType} && kubectl get pods --all-namespaces -o wide -w`,
      );
    },
    /**
     * @method tf-gpu-test
     * @description Deletes existing `tf-gpu-test-script` ConfigMap and `tf-gpu-test-pod`, and applies the test manifest from `manifests/deployment/tensorflow/tf-gpu-test.yaml`.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'tf-gpu-test': (path, options = DEFAULT_OPTION) => {
      const { underpostRoot, namespace } = options;
      shellExec(`kubectl delete configmap tf-gpu-test-script -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pod tf-gpu-test-pod -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl apply -f ${underpostRoot}/manifests/deployment/tensorflow/tf-gpu-test.yaml -n ${namespace}`);
    },

    /**
     * @method deploy-job
     * @description Creates and applies a custom Kubernetes Pod manifest (Job) for running arbitrary commands inside a container image (defaulting to a TensorFlow/NVIDIA image).
     * @param {string} path - The input value, identifier, or path for the operation (used as the optional script path or job argument).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     */
    'deploy-job': async (path, options = DEFAULT_OPTION) => {
      const podName = options.podName || 'deploy-job';
      const volumeName = `${podName}-volume`;
      if (typeof options.args === 'string') options.args = options.args.split(',');
      const args = (options.args ? options.args : path ? [path] : [`python ${path}`]).filter((c) => c.trim());
      const imageName = options.imageName || 'nvcr.io/nvidia/tensorflow:24.04-tf2-py3';
      const containerName = options.containerName || `${podName}-container`;
      const gpuEnable = imageName.match('nvidia');
      const runtimeClassName = options.runtimeClassName ? options.runtimeClassName : gpuEnable ? 'nvidia' : '';
      const namespace = options.namespace || 'default';
      const volumeMountPath = options.volumeMountPath || path;
      const volumeHostPath = options.volumeHostPath || path;
      const claimName = options.claimName || '';
      const enableVolumeMount = volumeMountPath && (volumeHostPath || claimName);
      const tty = options.tty ? 'true' : 'false';
      const stdin = options.stdin ? 'true' : 'false';
      const restartPolicy = options.restartPolicy || 'Never';
      const kindType = options.kindType || 'Pod';
      const imagePullPolicy = options.imagePullPolicy || 'IfNotPresent';
      const hostNetwork = options.hostNetwork ? options.hostNetwork : '';
      const apiVersion = options.apiVersion || 'v1';
      // Parse hostAliases option:
      //   - string from CLI: "ip1=host1,host2;ip2=host3,host4"
      //   - array from programmatic callers: [{ ip: "127.0.0.1", hostnames: ["foo.local"] }]
      const hostAliases = options.hostAliases
        ? Array.isArray(options.hostAliases)
          ? options.hostAliases
          : options.hostAliases
              .split(';')
              .filter((entry) => entry.trim())
              .map((entry) => {
                const [ip, hostnamesStr] = entry.split('=');
                const hostnames = hostnamesStr ? hostnamesStr.split(',').map((h) => h.trim()) : [];
                return { ip: ip.trim(), hostnames };
              })
        : [];
      const hostAliasesYaml =
        hostAliases.length > 0
          ? `  hostAliases:\n${hostAliases
              .map(
                (alias) =>
                  `  - ip: "${alias.ip}"\n    hostnames:\n${alias.hostnames.map((h) => `    - "${h}"`).join('\n')}`,
              )
              .join('\n')}`
          : '';
      const labels = options.labels
        ? options.labels
            .split(',')
            .map((keyValue) => {
              const [key, value] = keyValue.split('=');
              return `    ${key}: ${value}
`;
            })
            .join('')
        : `    app: ${podName}`;
      if (options.volumeType === 'dev') options.volumeType = 'FileOrCreate';
      const volumeType =
        options.volumeType || (enableVolumeMount && volumeHostPath && fs.statSync(volumeHostPath).isDirectory())
          ? 'Directory'
          : 'File';

      const envs = Underpost.env.list();

      const cmd = `kubectl apply -f - <<'EOF'
apiVersion: ${apiVersion}
kind: ${kindType}
metadata:
  name: ${podName}
  namespace: ${namespace}
  labels:
${labels}
spec:
  restartPolicy: ${restartPolicy}
${runtimeClassName ? `  runtimeClassName: ${runtimeClassName}` : ''}
${hostNetwork ? `  hostNetwork: ${hostNetwork}` : ''}
${hostAliasesYaml}
  containers:
    - name: ${containerName}
      image: ${imageName}
      imagePullPolicy: ${imagePullPolicy}
      tty: ${tty}
      stdin: ${stdin}
      command: ${JSON.stringify(options.cmd ? options.cmd : ['/bin/bash', '-c'])}
${
  args.length > 0
    ? `      args:
        - |
${args.map((arg) => `          ${arg}`).join('\n')}`
    : ''
}
${`${
  gpuEnable
    ? `      resources:
        limits:
          nvidia.com/gpu: '1'
`
    : ''
}      env:
${Object.keys(envs)
  .map((key) => ({ key, value: typeof envs[key] === 'number' ? envs[key] : `"${envs[key]}"` }))
  .concat(gpuEnable ? [{ key: 'NVIDIA_VISIBLE_DEVICES', value: 'all' }] : [])
  .map((env) => `        - name: ${env.key}\n          value: ${env.value}`)
  .join('\n')}`}
${
  enableVolumeMount
    ? Underpost.deploy.volumeFactory([{ volumeMountPath, volumeName, volumeHostPath, volumeType, claimName }]).render
    : ''
}
EOF`;
      shellExec(`kubectl delete pod ${podName} -n ${namespace} --ignore-not-found`);
      console.log(cmd);
      shellExec(cmd, { disableLog: true });
      const successInstance = await Underpost.test.statusMonitor(
        podName,
        options.monitorStatus || 'Running',
        options.monitorStatusKindType || 'pods',
        options.monitorStatusDeltaMs || 1000,
        options.monitorStatusMaxAttempts || 600,
      );
      if (successInstance) {
        options.on?.init ? await options.on.init() : null;
        if (options.logs) shellExec(`kubectl logs -f ${podName} -n ${namespace}`, { async: true });
      }
    },

    /**
     * @method push-bundle
     * @description Builds the client zip for the specified deployment, splits it into parts, and uploads to file storage.
     *   Steps: set env, build+split zip, upload only the zip parts belonging to the deploy-id's hosts (from conf.server.json).
     *   Only files matching `<host>-<route>.zip.part*` or `<host>-<route>.zip` for each non-skipped route are uploaded.
     * @param {string} path - Optional `fsPath.splitOption` string.
     *   Examples: `build` (default split 8), `build.16` (split 16 MB), `build.none-split` (no split flag).
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow.
     * @param {string} [options.deployId] - Override deploy ID.
     * @param {boolean} [options.dev] - Use development environment; defaults to production.
     * @memberof UnderpostRun
     */
    'push-bundle': (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = 'node bin'; // options.dev ? 'node bin' : 'underpost';
      const env = options.dev ? 'development' : 'production';
      const deployId = options.deployId || 'dd-default';
      const pathParts = (path || '').split('.');
      const fsPath = (pathParts[0] || '').trim() || 'build';
      const splitOption = (pathParts[1] || '').trim();

      let splitFlag = '--split 8';
      if (splitOption) {
        if (splitOption === 'none-split') {
          splitFlag = '';
        } else {
          const splitMb = Number(splitOption);
          if (Number.isFinite(splitMb) && splitMb > 0) {
            splitFlag = `--split ${splitMb}`;
          } else {
            logger.warn('push-bundle: invalid split option, using default split 8', {
              path,
              splitOption,
            });
          }
        }
      }

      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      const confServer = fs.existsSync(confServerPath)
        ? loadReplicas(deployId, loadConfServerJson(confServerPath))
        : {};
      const storageFilePath = `engine-private/conf/${deployId}/storage.bundle.json`;

      shellExec(`${baseCommand} env ${deployId} ${env}`);
      shellExec(`${baseCommand} client ${deployId} --build-zip${splitFlag ? ` ${splitFlag}` : ''}`);

      const pushBundleFiles = (host, routePath) => {
        const buildId = `${host}-${routePath.replaceAll('/', '')}`;
        const buildDir = `./${fsPath}`;
        if (!fs.existsSync(buildDir)) return;
        const partFiles = fs
          .readdirSync(buildDir)
          .filter(
            (name) =>
              name.startsWith(`${buildId}.zip.part`) ||
              name.startsWith(`${buildId}.zip-part`) ||
              name === `${buildId}.zip`,
          )
          .map((name) => `${fsPath}/${name}`);
        if (partFiles.length === 0) {
          logger.warn(`push-bundle: no bundle files found for '${host}${routePath}'`, { buildId });
          return;
        }
        for (const partFile of partFiles) {
          shellExec(
            `${baseCommand} fs ${partFile} --deploy-id ${deployId} --storage-file-path ${storageFilePath} --force`,
          );
        }
      };

      for (const host of Object.keys(confServer)) {
        for (const routePath of Object.keys(confServer[host])) {
          const routeConf = confServer[host][routePath] || {};
          if (routeConf.redirect || routeConf.disabledRebuild) continue;
          if (routeConf.singleReplica) {
            if (routeConf.replicas) {
              for (const replica of routeConf.replicas) {
                pushBundleFiles(host, replica);
              }
            }
            continue;
          }
          pushBundleFiles(host, routePath);
        }
      }
    },

    /**
     * @method pull-bundle
     * @description Downloads split zip parts from file storage, merges and extracts them, and moves the result into the public directory.
     *   Steps: set env, download parts (omit-unzip), merge zip, unzip, remove zip + parts, move to public/<host>[/path].
     *   Iterates over every non-singleReplica, non-redirect, non-disabledRebuild route in conf.server.json
     *   so that multi-path deployments are handled correctly.
     * @param {string} path - Optional comma-separated host name(s) to restrict processing (e.g. 'underpost.net' or 'a.com,b.com').
     *   If omitted, all hosts from `engine-private/conf/<deployId>/conf.server.json` are used.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow.
     * @param {string} [options.deployId] - Deploy ID for storage lookup (defaults to 'dd-default').
     * @param {boolean} [options.dev] - Use development environment; defaults to production.
     * @memberof UnderpostRun
     */
    'pull-bundle': (path = '', options = DEFAULT_OPTION) => {
      const baseCommand = 'node bin'; // options.dev ? 'node bin' : 'underpost';
      const env = options.dev ? 'development' : 'production';
      const deployId = options.deployId || 'dd-default';
      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      const confServer = fs.existsSync(confServerPath)
        ? loadReplicas(deployId, loadConfServerJson(confServerPath))
        : {};
      const hostsArg = path
        ? path
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean)
        : Object.keys(confServer);

      if (hostsArg.length === 0) {
        logger.error('pull-bundle: no hosts resolved', { deployId, path, confServerPath });
        return;
      }

      shellExec(`${baseCommand} env ${deployId} ${env}`);
      if (!fs.existsSync('./build')) fs.mkdirSync('./build', { recursive: true });
      shellExec(
        `${baseCommand} fs build --recursive --deploy-id ${deployId} --storage-file-path engine-private/conf/${deployId}/storage.bundle.json --pull --omit-unzip`,
      );

      const pullBundleRoute = (host, routePath) => {
        const buildId = `${host}-${routePath.replaceAll('/', '')}`;
        const zipPath = `build/${buildId}.zip`;
        const buildDir = './build';
        const hasZip = fs.existsSync(zipPath);
        const hasParts =
          fs.existsSync(buildDir) &&
          fs
            .readdirSync(buildDir)
            .some((name) => name.startsWith(`${buildId}.zip.part`) || name.startsWith(`${buildId}.zip-part`));

        if (!hasZip && !hasParts) {
          logger.warn(`Bundle not found for '${host}${routePath}'. Skipping.`, { zipPath, deployId });
          return;
        }

        if (hasParts) shellExec(`${baseCommand} client --merge-zip ${zipPath}`);
        shellExec(`${baseCommand} client --unzip ${zipPath}`);
        shellExec(`sudo rm -rf ${zipPath}`);

        if (fs.existsSync(buildDir)) {
          fs.readdirSync(buildDir)
            .filter((name) => name.startsWith(`${buildId}.zip.part`) || name.startsWith(`${buildId}.zip-part`))
            .forEach((partFile) => shellExec(`sudo rm -rf ${buildDir}/${partFile}`));
        }

        const extractedDir = `build/${buildId.replace(/-$/, '')}`;
        if (!fs.existsSync(extractedDir)) {
          logger.warn(`Extracted build dir not found: ${extractedDir}. Skipping move for '${host}${routePath}'.`);
          return;
        }

        const publicDestPath = routePath === '/' ? `public/${host}` : `public/${host}${routePath}`;
        if (fs.existsSync(publicDestPath)) shellExec(`sudo rm -rf ${publicDestPath}`);
        if (routePath !== '/') shellExec(`sudo mkdir -p public/${host}`);
        fs.copySync(`${extractedDir}`, `${publicDestPath}`);
      };

      for (const host of hostsArg) {
        const routePaths = confServer[host] ? Object.keys(confServer[host]) : ['/'];

        for (const routePath of routePaths) {
          const routeConf = confServer[host] ? confServer[host][routePath] || {} : {};
          if (routeConf.redirect || routeConf.disabledRebuild) continue;
          if (routeConf.singleReplica) {
            if (routeConf.replicas) {
              for (const replica of routeConf.replicas) {
                pullBundleRoute(host, replica);
              }
            }
            continue;
          }
          pullBundleRoute(host, routePath);
        }
      }
    },

    /**
     * @method kubeadm-wireguard
     * @description
     * Configures Calico to keep using the Kubernetes NodeInternalIP after WireGuard
     * is added to the node. This prevents the WireGuard interface (for example
     * 10.0.0.2) from being selected as the Calico/BGP node address.
     *
     * @param {string} path - Unused.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options.
     * @memberof UnderpostRun
     */
    'kubeadm-wireguard': (path, options = DEFAULT_OPTION) => {
      shellExec(`kubectl patch installation.operator.tigera.io default --type='json' \
-p='[
  {"op":"replace","path":"/spec/calicoNetwork/nodeAddressAutodetectionV4","value":{"kubernetes":"NodeInternalIP"}}
]'`);

      shellExec(`kubectl rollout restart daemonset/calico-node -n calico-system`);
    },

    /**
     * @method build-cluster-deployment-manifests
     * @description Builds deployment manifests for both production and development environments using `node bin deploy --build-manifest`, syncing them, and setting replicas to 1 for the `dd` deployment.
     * @param {string} path - Unused.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow.
     * @memberof UnderpostRun
     */
    'build-cluster-deployment-manifests': (path = '', options = DEFAULT_OPTION) => {
      shellExec(`node bin deploy --build-manifest --sync --info-router --replicas 1 dd development`);
      shellExec(`node bin deploy --build-manifest --sync --info-router --replicas 1 dd production --cert`);
    },

    /**
     * @method monitor-ui
     * @description Installs and enables the Cockpit KVM Dashboard (cockpit, cockpit-machines, libvirt)
     * and opens the cockpit firewall service. With `--remove`, closes the firewall service instead.
     * @param {string} path - Unused.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow.
     *   `options.remove` — when true, removes the cockpit firewall rule instead of adding it.
     * @memberof UnderpostRun
     */
    'monitor-ui': (path, options = DEFAULT_OPTION) => {
      if (options.remove) {
        shellExec(`sudo firewall-cmd --zone=public --remove-service=cockpit --permanent`);
        shellExec(`sudo firewall-cmd --reload`);
        return;
      }
      shellExec(`sudo dnf install -y cockpit cockpit-machines libvirt`);
      shellExec(`sudo systemctl enable --now cockpit.socket libvirtd`);
      shellExec(`sudo firewall-cmd --permanent --add-service=cockpit`);
      shellExec(`sudo firewall-cmd --reload`);
    },

    /**
     * @method shared-dir
     * @description Run once for initial shared-directory setup. Creates the group, adds the user,
     * creates the directory, sets ownership, applies the SGID bit, and configures default ACLs so
     * all future files inside the directory automatically inherit group write permissions.
     * Use `reload-shared-dir` for subsequent permission repairs without recreating the group.
     * @param {string} path - Target directory to set up (defaults to `/home/dd/engine`).
     *   Customise via the `path` argument or leave empty to use the default.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow.
     *   Key fields: `options.user` (default `'admin'`), `options.group` (default `'engine-dev'`).
     * @memberof UnderpostRun
     */
    'shared-dir': (path = '/home/dd/engine', options = DEFAULT_OPTION) => {
      const dir = path || '/home/dd/engine';
      const user = options.user || 'admin';
      const group = options.group || 'engine-dev';

      logger.info(`[setup-shared-dir] dir=${dir} user=${user} group=${group}`);

      shellExec(`sudo groupadd ${group} 2>/dev/null || true`);
      shellExec(`sudo usermod -aG ${group} ${user}`);
      shellExec(`sudo mkdir -p ${dir}`);
      shellExec(`sudo chown -R ${user}:${group} ${dir}`);
      shellExec(`sudo chmod -R 2775 ${dir}`);
      shellExec(`sudo setfacl -d -m g:${group}:rwx ${dir}`);
      shellExec(`sudo setfacl -m g:${group}:rwx ${dir}`);

      logger.info(`[setup-shared-dir] Shared directory setup complete: ${dir}`);
    },
    /**
     * @method shared-dir-add-user
     * @description Add a user to an existing shared directory without changing
     * file owners. Grants recursive group/ACL access so the user can read and
     * write throughout the shared workspace while preserving existing ownership.
     *
     * @param {string} path - Shared directory (defaults to `/home/dd/engine`).
     * @param {UnderpostRunDefaultOptions} options - Underpost runner options.
     *   Key fields:
     *     - options.user  (default: 'admin')
     *     - options.group (default: 'engine-dev')
     *
     * @memberof UnderpostRun
     */ 'shared-dir-add-user': (path = '/home/dd/engine', options = DEFAULT_OPTION) => {
      const dir = path || '/home/dd/engine';
      const user = options.user || 'admin';

      logger.info(`[shared-dir-add-user] dir=${dir} user=${user}`);

      // Give the user direct access without changing owners or group ownership.
      shellExec(`sudo setfacl -R -m u:${user}:rwx ${dir}`);

      // Make future files/directories inherit the same user ACL.
      shellExec(`sudo find ${dir} -type d -exec setfacl -d -m u:${user}:rwx {} \\;`);

      logger.info(`[shared-dir-add-user] User '${user}' added to shared directory: ${dir}`);
    },
  };

  static API = {
    /**
     * @method DEFAULT_OPTION
     * @description The default options for Underpost runners, including development mode, namespace, replicas, and underpost root path.
     * @memberof UnderpostRun
     * @static
     * @returns {Object} The default options object.
     */
    get DEFAULT_OPTION() {
      return DEFAULT_OPTION;
    },
    /**
     * @method RUNNERS
     * @description Retrieves the list of available runner IDs from the UnderpostRun class.
     * @memberof UnderpostRun
     * @returns {string[]} An array of runner IDs.
     */
    get RUNNERS() {
      return Object.keys(UnderpostRun.RUNNERS);
    },

    /**
     * @method CALL
     * @description Executes a specified runner function from the UnderpostRun class with the provided path and options.
     * @param {string} runner - The name of the runner to execute.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     * @returns {Promise<any>} The result of the runner execution.
     */
    async CALL(runner = '', path = '', options = DEFAULT_OPTION) {
      return await UnderpostRun.RUNNERS[runner](path, options);
    },

    /**
     * @method callback
     * @description Initiates the execution of a specified CLI command (runner) with the given input value (`path`) and processed options.
     * @param {string} runner - The name of the runner to execute.
     * @param {string} path - The input value, identifier, or path for the operation.
     * @param {UnderpostRunDefaultOptions} options - The default underpost runner options for customizing workflow
     * @memberof UnderpostRun
     * @returns {Promise<any>} The result of the callback execution.
     */
    async callback(runner, path, options = DEFAULT_OPTION) {
      try {
        const npmRoot = getNpmRootPath();
        const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
        if (options.cmd) options.cmd = options.cmd.split(',');
        if (options.args) options.args = options.args.split(',');
        if (!options.underpostRoot) options.underpostRoot = underpostRoot;
        if (!options.namespace) options.namespace = 'default';
        if (options.replicas === '' || options.replicas === null || options.replicas === undefined)
          options.replicas = 1;
        options.npmRoot = npmRoot;
        logger.info(`Executing runner`, { runner, namespace: options.namespace });
        if (!Underpost.run.RUNNERS.includes(runner)) throw new Error(`Runner not found: ${runner}`);
        const result = await Underpost.run.CALL(runner, path, options);
        return result;
      } catch (error) {
        console.log(error);
        logger.error(error);
        process.exit(1);
      }
    },
  };
}

export default UnderpostRun;
