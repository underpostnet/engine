/**
 * Deploy module for managing the deployment of applications and services.
 * @module src/cli/deploy.js
 * @namespace UnderpostDeploy
 */

import {
  clusterTypeFactory,
  Config,
  deployHostsFactory,
  getDataDeploy,
  instanceStatusPageEntriesFactory,
  loadConfInstances,
  loadConfServerJson,
  loadReplicas,
  nextTrafficFactory,
  schedulableNodeFactory,
  trafficFromRoutingInfoFactory,
} from '../server/runtime/conf.js';
import {
  buildKindPorts,
  buildPortProxyRouter,
  buildProxyRouter,
  deployRangePortFactory,
  pathPortAssignmentFactory,
  readDeployRoutes,
} from '../server/network/router.js';
import { loggerFactory } from '../server/ops/logger.js';
import { HOST_VOLUME_ROOT } from '../server/runtime/environment.js';
import { shellExec } from '../server/runtime/process.js';
import { podSchedulingYaml } from '../server/runtime/pod-scheduling.js';
import { activeExecutionProfile } from '../server/build/execution.js';
import { ensureContainerStorage, ensureContainerStorageSubtree } from '../server/security/container-storage.js';
import { INTERNAL_READY_PATH, INTERNAL_HEALTH_PATH } from '../server/runtime/runtime-status.js';
import {
  staticContextRoutesFactory,
  statusPageRoutesFactory,
  viewShipsBundle,
} from '../client-builder/client-build.js';
import {
  UNDERPOST_GATEWAY,
  assertStaticAssets,
  hostServerConfFactory,
  installGatewayConf,
  underpostGatewayManifestsFactory,
  staticLocationFactory,
  statusPageAssetPathFactory,
  statusPageBuildSegment,
  syncStaticAssetFromPod,
  syncStaticTreeFromPod,
  writeHostServerConf,
  writeStaticAsset,
  writeStaticTree,
} from '../server/network/underpost-gateway.js';
import { getCapVariableName } from '../client/components/core/CommonJs.js';
import fs from 'fs-extra';
import nodePath from 'node:path';
import dotenv from 'dotenv';
import os from 'node:os';
import crypto from 'node:crypto';
import { appSecretName } from './app.js';
import { domainContextFactory } from './domains.js';
import { KUBECTL_SERVER_SIDE_APPLY } from './kubectl.js';
import { refusal } from './namespace.js';
import { apiPathOf } from '../server/domain/api-contract.js';
import { pathRoutePlan } from '../server/network/path-routes.js';
import Underpost from '../index.js';

/**
 * Clamps an identifier to the Kubernetes DNS-1123 label limit (63 chars),
 * used for pod-local `volumes[].name` / `volumeMounts[].name`. Names within the
 * limit are returned verbatim so existing short names are stable; longer ones
 * are truncated and suffixed with an 8-char content hash to stay unique and
 * deterministic (e.g. the per-variant instance volume names, which append the
 * full `<deployId>-<env>-<traffic>` and can exceed 63).
 * @param {string} name - Candidate name.
 * @returns {string} A name no longer than 63 characters.
 */
const k8sVolumeName = (name) => {
  if (typeof name !== 'string' || name.length <= 63) return name;
  const hash = crypto.createHash('sha1').update(name).digest('hex').slice(0, 8);
  return `${name.slice(0, 54)}-${hash}`;
};

// Where `bin client <deployId> --env <env>` writes each host's bundle, including the
// SSR status views declared in conf.ssr.json (`<host><path>/<status>/index.html`).
// Engine root inside the workload container; the built PWA artifacts live under
// its `public/` tree, which is where the static edge documents are sourced from.
// A workload that is gone answers with none of these itself; Envoy or the
// gateway hop produces them, and a maintenance page is what they mean.
const UPSTREAM_FAILURE_STATUSES = [502, 503, 504];

const CONTAINER_ENGINE_ROOT = '/home/dd/engine';

// The manifest set `deploy --build-manifest` produces for one environment.
const DEFAULT_MANIFEST_FILES = [
  'deployment.yaml',
  'proxy.yaml',
  'gateway.yaml',
  'httproute.yaml',
  'pv-pvc.yaml',
  'traffic-service.yaml',
  'grpc-service.yaml',
];

/**
 * Maps a host/path's edge-served views onto the statuses the gateway intercepts
 * for it, and the context directory each status is answered from.
 *
 * The mapping is the config's, not a policy of its own: a declared status page
 * (`/404`) answers that status, and the maintenance view answers the codes that
 * mean the workload is not there — a dead pod is exactly what a maintenance page
 * is for. A host that declares neither is never intercepted and keeps routing
 * straight to its workload.
 * @param {Array<object>} edgeRoutes - Entries from {@link UnderpostDeploy.edgeRouteEntriesFactory}.
 * @returns {Object<string,string>} Status code → context directory under the sub-path.
 */
const interceptStatusesFactory = (edgeRoutes = []) => {
  const statuses = {};
  for (const route of edgeRoutes) {
    if (route.status) statuses[route.status] = `status-pages/${route.status}`;
    else if (route.context === 'maintenance')
      for (const code of UPSTREAM_FAILURE_STATUSES) statuses[code] = route.context;
  }
  return statuses;
};

/**
 * The API sub-path of a host/path, when it declares one. Kept out of the
 * intercepted route so an API answers with its own status and body.
 * @param {object} confServer - Parsed `conf.server.json`.
 * @param {string} host - Hostname.
 * @param {string} path - Proxy sub-path.
 * @returns {string} API path prefix, or an empty string when the path serves no API.
 */
const apiPathFactory = ({ confServer, host, path }) => {
  const apis = confServer?.[host]?.[path]?.apis;
  if (!Array.isArray(apis) || apis.length === 0) return '';
  return apiPathOf(path);
};
const logger = loggerFactory(import.meta);

// hostPath volume trees are written under the operator's home directory, which carries a label no
// unprivileged container can read. This registers the persistent mapping and restores the tree,
// rather than only restoring it: a deploy must not depend on cluster bring-up having run on this
// host, and a plain `restorecon` against an unmapped path re-applies the very default that makes
// the volume unreadable. A no-op where SELinux or its userspace is absent.
const prepareContainerStorage = (path) => ensureContainerStorageSubtree(path, { execute: shellExec });

/**
 * @class UnderpostDeploy
 * @description Manages the deployment of applications and services.
 * This class provides a set of static methods to handle the deployment process,
 * including resource allocation, configuration management, and Kubernetes deployment.
 * @memberof UnderpostDeploy
 */
class UnderpostDeploy {
  static API = {
    /**
     * Creates a router configuration for a list of deployments.
     * @param {string} deployList - List of deployment IDs to include in the router.
     * @param {string} env - Environment for which the router is being created.
     * @returns {object} - Router configuration for the specified deployments.
     * @memberof UnderpostDeploy
     */
    async routerFactory(deployList, env) {
      const initEnvPath = `./engine-private/conf/${deployList.split(',')[0]}/.env.${env}`;
      const initEnvObj = dotenv.parse(fs.readFileSync(initEnvPath, 'utf8'));
      process.env.PORT = initEnvObj.PORT;
      process.env.NODE_ENV = env;
      await Config.build('proxy', deployList);
      return buildPortProxyRouter({ port: env === 'development' ? 80 : 443, proxyRouter: buildProxyRouter() });
    },
    /**
     * Stable Service used by every routing layer for one blue/green workload.
     * Its name never carries the colour; promotion changes only its selector.
     * @param {string} deployId - Deployment identifier.
     * @param {string} env - Deployment environment.
     * @returns {string} Kubernetes Service name.
     * @memberof UnderpostDeploy
     */
    trafficServiceNameFactory({ deployId, env }) {
      return k8sVolumeName(`${deployId}-${env}-traffic-service`);
    },
    /**
     * Renders the stable traffic Service. Both Envoy/Contour and the fallback
     * gateway use this object, so one selector update moves every port/path.
     * @param {string} deployId - Deployment identifier.
     * @param {string} env - Deployment environment.
     * @param {string} traffic - Selected colour.
     * @param {string} [namespace] - Kubernetes namespace.
     * @param {number} fromPort - First workload port.
     * @param {number} toPort - Last workload port.
     * @returns {string} Service YAML.
     * @memberof UnderpostDeploy
     */
    trafficServiceYamlFactory({ deployId, env, traffic, namespace = 'default', fromPort, toPort }) {
      if (!['blue', 'green'].includes(traffic)) throw new Error(`Invalid traffic colour: ${traffic}`);
      return `---
apiVersion: v1
kind: Service
metadata:
  name: ${Underpost.deploy.trafficServiceNameFactory({ deployId, env })}
  namespace: ${namespace}
  labels:
    underpost.net/traffic-service: "true"
    underpost.net/deploy-id: ${deployId}-${env}
spec:
  type: ClusterIP
  selector:
    app: ${deployId}-${env}-${traffic}
  ports:
${buildKindPorts(fromPort, toPort)}`;
    },
    /**
     * Applies a stable traffic Service from either a built manifest or explicit
     * port bounds, replacing only its selector colour.
     * @returns {string} Applied Service name.
     * @memberof UnderpostDeploy
     */
    applyTrafficService({ deployId, env, traffic, namespace = 'default', manifestPath, fromPort, toPort }) {
      if (!['blue', 'green'].includes(traffic)) throw new Error(`Invalid traffic colour: ${traffic}`);
      let manifest =
        manifestPath && fs.existsSync(manifestPath)
          ? fs.readFileSync(manifestPath, 'utf8')
          : Underpost.deploy.trafficServiceYamlFactory({ deployId, env, traffic, namespace, fromPort, toPort });
      const escaped = `${deployId}-${env}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      manifest = manifest.replace(new RegExp(`app: ${escaped}-(?:blue|green)`), `app: ${deployId}-${env}-${traffic}`);
      logger.info('Applying the traffic Service', { deployId, env, traffic, namespace });
      shellExec(
        `${KUBECTL_SERVER_SIDE_APPLY} -f - -n ${namespace} <<'EOF'
${manifest}
EOF
`,
        { disableLog: true },
      );
      return Underpost.deploy.trafficServiceNameFactory({ deployId, env });
    },
    /**
     * Creates a YAML service configuration for a deployment.
     * @param {string} deployId - Deployment ID for which the service is being created.
     * @param {string} path - Path for which the service is being created.
     * @param {string} env - Environment for which the service is being created.
     * @param {number} port - Port number for the service.
     * @param {Array<string>} deploymentVersions - List of deployment versions.
     * @param {string} serviceId - Custom service name (optional).
     * @param {Array} pathRewritePolicy - Path rewrite policy (optional).
     * @param {object} timeoutPolicy - Timeout policy (optional).
     * @param {object} retryPolicy - Retry policy (optional).
     * @returns {string} - YAML service configuration for the specified deployment.
     * @memberof UnderpostDeploy
     */
    deploymentYamlServiceFactory({
      deployId,
      path,
      env,
      port,
      deploymentVersions,
      serviceId,
      pathRewritePolicy,
      timeoutPolicy,
      retryPolicy,
    }) {
      return `
    - conditions:
        - prefix: ${path}
      ${
        pathRewritePolicy
          ? `pathRewritePolicy:
          replacePrefix:
          ${pathRewritePolicy.map(
            (rd) => `- prefix: ${rd.prefix}
            replacement: ${rd.replacement}
            `,
          ).join(`
`)}`
          : ''
      }${
        timeoutPolicy
          ? `\n      timeoutPolicy:\n${timeoutPolicy.response ? `        response: ${timeoutPolicy.response}\n` : ''}${
              timeoutPolicy.idle ? `        idle: ${timeoutPolicy.idle}\n` : ''
            }`
          : ''
      }${
        retryPolicy
          ? `\n      retryPolicy:\n${retryPolicy.count !== undefined ? `        count: ${retryPolicy.count}\n` : ''}${
              retryPolicy.perTryTimeout ? `        perTryTimeout: ${retryPolicy.perTryTimeout}\n` : ''
            }`
          : ''
      }
      enableWebsockets: true
      services:
    ${(serviceId ? [null] : deploymentVersions)
      .map(
        (version, i) =>
          `    - name: ${serviceId ? serviceId : `${deployId}-${env}-${version}-service`}
          port: ${port}
          weight: ${i === 0 ? 100 : 0}
    `,
      )
      .join('')}`;
    },
    /**
     * Builds Kubernetes probes that gate on the in-pod internal status endpoint.
     *
     * HTTP mode (default) aligns Kubernetes pod readiness with actual Underpost
     * runtime readiness:
     *   - readinessProbe → GET /_internal/ready  (200 only when running-deployment)
     *   - livenessProbe  → GET /_internal/health (deadlock / hung-process detection)
     *   - startupProbe   → GET /_internal/ready  (long window for hot-built/slow boots)
     *
     * Migration: pass `useHttp: false` to emit the legacy TCP socket probes
     * (port-bound only) for deployments not yet serving the internal endpoint.
     *
     * @param {object} opts
     * @param {number} opts.port - In-pod internal status port (deployment base PORT).
     * @param {boolean} [opts.useHttp=true] - Emit HTTP probes; false → legacy TCP.
     * @param {boolean} [opts.liveness=true] - Include a livenessProbe.
     * @param {boolean} [opts.startup=true] - Include a startupProbe.
     * @returns {{readinessProbe: object, livenessProbe?: object, startupProbe?: object}}
     * @memberof UnderpostDeploy
     */
    runtimeProbesFactory({ port, useHttp = true, liveness = true, startup = true } = {}) {
      if (!port) return {};
      if (!useHttp) {
        const tcp = { tcpSocket: { port }, initialDelaySeconds: 5, periodSeconds: 10, failureThreshold: 6 };
        const probes = { readinessProbe: tcp };
        if (liveness) probes.livenessProbe = { ...tcp, initialDelaySeconds: 30 };
        return probes;
      }
      const probes = {
        readinessProbe: {
          httpGet: { path: INTERNAL_READY_PATH, port },
          initialDelaySeconds: 5,
          periodSeconds: 5,
          timeoutSeconds: 3,
          failureThreshold: 3,
        },
      };
      if (liveness)
        probes.livenessProbe = {
          httpGet: { path: INTERNAL_HEALTH_PATH, port },
          initialDelaySeconds: 30,
          periodSeconds: 15,
          timeoutSeconds: 3,
          failureThreshold: 3,
        };
      if (startup)
        // A startupProbe suspends readiness/liveness until it first succeeds, so
        // its window bounds in-container hot builds and slow boots. 180 × 10s =
        // 30 min before the pod is considered failed to start.
        probes.startupProbe = {
          httpGet: { path: INTERNAL_READY_PATH, port },
          initialDelaySeconds: 10,
          periodSeconds: 10,
          timeoutSeconds: 3,
          failureThreshold: 180,
        };
      return probes;
    },
    /**
     * Resolves a required readiness probe for a custom workload. A configured
     * probe wins; otherwise a TCP probe on the instance port is the safe floor.
     * @param {object} [probe] - Configured readiness probe.
     * @param {number} port - Instance container port.
     * @returns {object} A Kubernetes readiness probe.
     */
    requiredReadinessProbeFactory({ probe, port }) {
      if (probe) return probe;
      if (!port) throw new Error('A readiness probe or container port is required');
      return Underpost.deploy.runtimeProbesFactory({ port, useHttp: false, liveness: false, startup: false })
        .readinessProbe;
    },
    /**
     * Creates a YAML deployment configuration for a deployment.
     * @param {string} deployId - Deployment ID for which the deployment is being created.
     * @param {string} env - Environment for which the deployment is being created.
     * @param {string} suffix - Suffix for the deployment.
     * @param {object} resources - Resource configuration for the deployment.
     * @param {number} replicas - Number of replicas for the deployment.
     * @param {string} image - Docker image for the deployment.
     * @param {string} namespace - Kubernetes namespace for the deployment.
     * @param {Array<object>} volumes - Volume configurations for the deployment.
     * @param {Array<string>} cmd - Command to run in the deployment container.
     * @param {boolean} skipFullBuild - Whether to skip the full client bundle build during deployment.
     * @param {boolean} pullBundle - Whether to pull the pre-built client bundle from Cloudinary before starting. Use together with skipFullBuild to skip the local build entirely.
     * @param {string} [imagePullPolicy] - Container imagePullPolicy override (`Always`, `IfNotPresent`, `Never`). When omitted, defaults to `Never` for `localhost/` images and `IfNotPresent` otherwise.
     * @param {object} lifecycle - Kubernetes lifecycle hooks configuration for the deployment container.
     * @param {object} readinessProbe - Kubernetes readiness probe configuration for the deployment container.
     * @param {object} livenessProbe - Kubernetes liveness probe configuration for the deployment container.
     * @param {object} startupProbe - Kubernetes startup probe configuration for the deployment container.
     * @param {number} containerPort - Container port to expose for the deployment.
     * @param {{affinity?:Object, tolerations?:Object[]}} [scheduling] - The pod scheduling of the workloads ({@link UnderpostNamespace.podScheduling}).
     * @returns {string} - YAML deployment configuration for the specified deployment.
     * @memberof UnderpostDeploy
     */
    deploymentYamlPartsFactory({
      deployId,
      env,
      suffix,
      resources,
      replicas,
      image,
      namespace,
      volumes,
      cmd,
      skipFullBuild,
      pullBundle,
      imagePullPolicy,
      // K8S lifecycle + probe wiring. Pass-through structures shaped like the
      // upstream Kubernetes API, spliced verbatim into the container spec.
      //   lifecycle:        { postStart: { exec: { command: [...] } }, preStop: { exec: { command: [...] } } }
      //   readinessProbe:   { tcpSocket: { port: 8081 }, ... }
      //   livenessProbe:    { tcpSocket: { port: 8081 }, ... }
      //   containerPort:    integer; rendered as ports[0].containerPort. Optional.
      lifecycle,
      readinessProbe,
      livenessProbe,
      startupProbe,
      containerPort,
      scheduling = {},
      // Explicit, secret-free internal status port injected as an env var so the
      // in-pod endpoint binds exactly what the probes and the monitor target,
      // independent of the ambient `PORT` baked into the image/secret.
      internalStatusPort,
    }) {
      if (!readinessProbe) throw new Error(`Refusing to build ${deployId}-${env}-${suffix} without a readiness probe`);
      if (!cmd)
        // One command, and deliberately only `start`. This string is executed by whatever
        // underpost the image happens to ship, which is as new as the last npm publish and no
        // newer — so it may name only CLI surface that has always existed. Everything the
        // deployment needs beyond that, host configuration included, is done inside the start
        // lifecycle, where the code is the freshly pulled source rather than the image snapshot.
        // `--pull-bundle` fetches the pre-built client bundle instead of building it in-pod.
        cmd = [
          `underpost start --build --run${pullBundle || skipFullBuild ? ' --pull-bundle --skip-full-build' : ''} ${deployId} ${env}`,
        ];
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      if (!volumes) volumes = [];
      const confVolume = fs.existsSync(`./engine-private/conf/${deployId}/conf.volume.json`)
        ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.volume.json`, 'utf8'))
        : [];
      volumes = volumes.concat(confVolume);
      // const containerImage = image ? image : `localhost/rockylinux9-underpost:v${packageJson.version}`;
      const containerImage = image ? image : `underpost/underpost-engine:v${packageJson.version}`;
      return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deployId}-${env}-${suffix}
  namespace: ${namespace ? namespace : 'default'}
  labels:
    app: ${deployId}-${env}-${suffix}
    deploy-id: ${deployId}-${env}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${deployId}-${env}-${suffix}
  template:
    metadata:
      labels:
        app: ${deployId}-${env}-${suffix}
        deploy-id: ${deployId}-${env}
    spec:
${podSchedulingYaml(scheduling, 6)}      containers:
        - name: ${deployId}-${env}-${suffix}
          image: ${containerImage}
          imagePullPolicy: ${imagePullPolicy ? imagePullPolicy : containerImage.startsWith('localhost/') ? 'Never' : 'IfNotPresent'}
          envFrom:
            - secretRef:
                name: underpost-config
            # The deployment's own environment, with its .env.<env>.oci overlay already
            # applied by 'app apply'. Optional so a deployment predating that Secret still
            # starts; the in-pod 'app load' resolves the same overlay as a second path.
            - secretRef:
                name: ${appSecretName(deployId, env)}
                optional: true
${
  internalStatusPort
    ? `          env:
            - name: UNDERPOST_INTERNAL_PORT
              value: "${internalStatusPort}"
`
    : ''
}${
        containerPort
          ? `          ports:
            - containerPort: ${containerPort}
`
          : ''
      }${
        resources
          ? `          resources:
            requests:
              memory: "${resources.requests.memory}"
              cpu: "${resources.requests.cpu}"
            limits:
              memory: "${resources.limits.memory}"
              cpu: "${resources.limits.cpu}"`
          : ''
      }
          command:
            - /bin/sh
            - -c
            - >
              ${cmd.join(' &&\n              ')}
${
  readinessProbe
    ? `          readinessProbe:
${JSON.stringify(readinessProbe, null, 2)
  .split('\n')
  .map((l) => '            ' + l)
  .join('\n')}
`
    : ''
}${
        livenessProbe
          ? `          livenessProbe:
${JSON.stringify(livenessProbe, null, 2)
  .split('\n')
  .map((l) => '            ' + l)
  .join('\n')}
`
          : ''
      }${
        startupProbe
          ? `          startupProbe:
${JSON.stringify(startupProbe, null, 2)
  .split('\n')
  .map((l) => '            ' + l)
  .join('\n')}
`
          : ''
      }${
        lifecycle
          ? `          lifecycle:
${JSON.stringify(lifecycle, null, 2)
  .split('\n')
  .map((l) => '            ' + l)
  .join('\n')}
`
          : ''
      }

${
  volumes.length > 0
    ? Underpost.deploy
        .volumeFactory(volumes.map((v) => ((v.version = `${deployId}-${env}-${suffix}`), v)))
        .render.split(`\n`)
        .map((l) => '    ' + l)
        .join(`\n`)
    : ''
}
---
apiVersion: v1
kind: Service
metadata:
  name: ${deployId}-${env}-${suffix}-service
  namespace: ${namespace}
spec:
  selector:
    app: ${deployId}-${env}-${suffix}
  ports:
{{ports}}  type: LoadBalancer`;
    },
    /**
     * Builds a manifest for a list of deployments.
     * @param {string} deployList - List of deployment IDs to include in the manifest.
     * @param {string} env - Environment for which the manifest is being built.
     * @param {object} options - Options for the manifest build process.
     * @param {string} options.replicas - Number of replicas for each deployment.
     * @param {string} options.image - Docker image for the deployment.
     * @param {string} [options.namespace] - The legacy namespace override; conf.cluster.json places each resource without it.
     * @param {string} [options.versions] - Comma-separated list of versions to deploy.
     * @param {string} [options.cmd] - Custom initialization command for deploymentYamlPartsFactory (comma-separated commands).
     * @param {string} [options.timeoutResponse] - HTTPProxy per-route response timeout (e.g. "10000ms", "infinity").
     * @param {string} [options.timeoutIdle] - HTTPProxy per-route idle timeout (e.g. "10s", "infinity").
     * @param {string} [options.retryCount] - HTTPProxy per-route retry count (e.g. 3).
     * @param {string} [options.retryPerTryTimeout] - HTTPProxy per-route per-try timeout (e.g. "150ms").
     * @param {boolean} [options.disableDeploymentProxy] - Whether to disable deployment proxy route generation.
     * @param {string} [options.gatewayClass] - GatewayClass name baked into the generated `gateway.yaml`.
     * @param {boolean} [options.disableHttp3] - Omit QUIC/HTTP3 listener config and the Alt-Svc advertisement from the Gateway API manifests.
     * @param {number|string} [options.quicPort] - UDP port advertised for QUIC/HTTP3.
     * @param {string} [options.traffic] - Comma-separated active traffic colour(s) used to select which versions receive traffic (e.g. "blue", "green").
     * @param {boolean} [options.skipFullBuild] - Whether to skip the full client bundle build; forwarded to deploymentYamlPartsFactory.
     * @param {boolean} [options.pullBundle] - Whether to pull the pre-built client bundle from Cloudinary; forwarded to deploymentYamlPartsFactory. Use together with skipFullBuild.
     * @param {string} [options.imagePullPolicy] - Container imagePullPolicy override (`Always`, `IfNotPresent`, `Never`); forwarded to deploymentYamlPartsFactory. Defaults to `Never` for `localhost/` images and `IfNotPresent` otherwise.
     * @param {boolean} [options.disableRuntimeProbes] - Deprecated compatibility flag; readiness remains mandatory.
     * @param {boolean} [options.tcpProbes] - Emit legacy TCP socket probes instead of HTTP internal-status probes (migration path).
     * @param {string} [options.node] - Explicit target node of the workloads and their hostPath volumes; overrides the scheduling of conf.cluster.json.
     * @param {boolean} [options.kind] - Kind cluster context; affects the cluster-type node default when no explicit node is set.
     * @param {boolean} [options.kubeadm] - Kubeadm cluster context; affects the cluster-type node default when no explicit node is set.
     * @param {boolean} [options.k3s] - K3s cluster context; affects the cluster-type node default when no explicit node is set.
     * @returns {Promise<void>} - Promise that resolves when the manifest is built.
     * @memberof UnderpostDeploy
     */
    async buildManifest(deployList, env, buildOptions) {
      const replicas = buildOptions.replicas;
      const image = buildOptions.image;

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        // Each deployment resolves its own placement: a migration can move one deployment alone.
        const options = { ...buildOptions, env, deployId };
        const namespace = Underpost.namespace.of('workloads', { options });
        const confServer = loadReplicas(
          deployId,
          loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
        );
        const router = await Underpost.deploy.routerFactory(deployId, env);
        const pathPortAssignmentData = await pathPortAssignmentFactory(deployId, router, confServer);
        const assignedPorts = Object.fromEntries(
          Object.entries(pathPortAssignmentData).flatMap(([host, assignments]) =>
            assignments.map(({ path, port }) => [`${host}${path}`, port]),
          ),
        );
        const { fromPort, toPort } = deployRangePortFactory(router);
        const deploymentVersions = options.versions.split(',');
        fs.mkdirSync(`./engine-private/conf/${deployId}/build/${env}`, { recursive: true });
        if (env === 'development') fs.mkdirSync(`./manifests/deployment/${deployId}-${env}`, { recursive: true });

        logger.info('port range', { deployId, fromPort, toPort });

        // The internal status endpoint binds `fromPort - 1`: app instances bind
        // the router range starting at `fromPort`, so this slot is always free
        // inside the pod. It is injected into the pod env (UNDERPOST_INTERNAL_PORT)
        // and used for both the probes and the monitor's port-forward target so
        // all three agree regardless of the image's ambient PORT.
        // Readiness is a hard promotion invariant. The legacy disable flag is
        // intentionally ignored; workloads that cannot serve the internal HTTP
        // endpoint can migrate with the explicit TCP probe mode.
        const internalPort = fromPort - 1;
        const probes = Underpost.deploy.runtimeProbesFactory({ port: internalPort, useHttp: !options.tcpProbes });

        let deploymentYamlParts = '';
        for (const deploymentVersion of deploymentVersions) {
          deploymentYamlParts += `---
${Underpost.deploy
  .deploymentYamlPartsFactory({
    deployId,
    env,
    suffix: deploymentVersion,
    replicas,
    image,
    namespace,
    cmd: options.cmd ? options.cmd.split(',').map((c) => c.trim()) : undefined,
    skipFullBuild: options.skipFullBuild,
    pullBundle: options.pullBundle,
    imagePullPolicy: options.imagePullPolicy,
    // Workload placement belongs in the manifest submitted for the rollout.
    // Patching it after promotion creates a second ReplicaSet and can leave the
    // old live pod pending termination behind a replacement that is not Ready.
    scheduling: Underpost.namespace.podScheduling({ resource: 'workloads', environment: env, node: options.node }),
    internalStatusPort: internalPort,
    readinessProbe: probes.readinessProbe,
    livenessProbe: probes.livenessProbe,
    startupProbe: probes.startupProbe,
  })
  .replace('{{ports}}', buildKindPorts(fromPort, toPort))}
`;
        }
        fs.writeFileSync(`./engine-private/conf/${deployId}/build/${env}/deployment.yaml`, deploymentYamlParts, 'utf8');
        const builtTraffic = `${options.traffic || deploymentVersions[0] || 'blue'}`.split(',')[0].trim();
        fs.writeFileSync(
          `./engine-private/conf/${deployId}/build/${env}/traffic-service.yaml`,
          Underpost.deploy.trafficServiceYamlFactory({
            deployId,
            env,
            traffic: builtTraffic,
            namespace,
            fromPort,
            toPort,
          }),
          'utf8',
        );

        Underpost.deploy.buildGrpcServiceManifest({
          deployId,
          env,
          confServer,
          namespace,
          traffic: builtTraffic,
        });

        const confVolume = fs.existsSync(`./engine-private/conf/${deployId}/conf.volume.json`)
          ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.volume.json`, 'utf8'))
          : [];
        if (confVolume.length > 0) {
          // Mirror deployVolume's data-node resolution so the generated manifest
          // pins the PV to the same node that physically receives the volume data.
          const pvDataNodes = Underpost.deploy.resolveDeployNodes({
            node: options.node,
            resource: 'workloads',
            kind: options.kind,
            kubeadm: options.kubeadm,
            k3s: options.k3s,
            env,
          });
          let volumeYaml = '';
          for (const deploymentVersion of deploymentVersions) {
            for (const volume of confVolume) {
              if (!volume.claimName) continue;
              const pvcId = `${volume.claimName}-${deployId}-${env}-${deploymentVersion}`;
              const pvId = pvcId.replace(/^pvc-/, 'pv-');
              const hostPath = `${HOST_VOLUME_ROOT}/${pvId}`;
              volumeYaml += `---\n${Underpost.deploy.persistentVolumeFactory({
                pvcId,
                namespace,
                hostPath,
                nodeNames: pvDataNodes,
              })}\n`;
            }
          }
          fs.writeFileSync(`./engine-private/conf/${deployId}/build/${env}/pv-pvc.yaml`, volumeYaml, 'utf8');
        } else fs.removeSync(`./engine-private/conf/${deployId}/build/${env}/pv-pvc.yaml`);

        let proxyYaml = '';
        let gatewayYaml = '';
        let httpRouteYaml = '';
        const customServices = fs.existsSync(`./engine-private/conf/${deployId}/conf.services.json`)
          ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.services.json`))
          : [];
        // PWA status pages are SSR views whose route is a bare status code; the
        // client build writes each to `<path>/index.html` inside the served
        // bundle, so the gateway rewrites to that artifact instead of carrying
        // a copy of the document (which is what custom instances need).
        const confSSRPath = `./engine-private/conf/${deployId}/conf.ssr.json`;
        const confSSR = fs.existsSync(confSSRPath) ? JSON.parse(fs.readFileSync(confSSRPath, 'utf8')) : {};
        // Path routes resolve client selectors against the client views.
        const confClientPath = `./engine-private/conf/${deployId}/conf.client.json`;
        const confClient = fs.existsSync(confClientPath) ? JSON.parse(fs.readFileSync(confClientPath, 'utf8')) : {};
        // A deployment without hosts renders no route, so it reads no TLS policy.
        const { altSvc, http3, gatewayClassName } = Underpost.ingress.gatewayApiConfigFactory(
          options,
          Object.keys(confServer).length ? env : '',
        );
        // Node directory backing the static utility's volume; documents are
        // placed here rather than in the cluster's object store, which is what
        // lifts the size ceiling entirely.
        const staticHostRoot = Underpost.deploy.underpostGatewayRootFactory(options);
        // Contexts routed to the gateway. Status pages are absent by design: they
        // are reached by interception only, never as a destination.
        const edgeRouteRecords = [];
        // Paths each host routes to another host path of the deploy.
        const pathRouteRecords = [];
        // Per-host proxy routes contributed to the shared gateway's own config.
        const gatewayRoutesByHost = {};
        // Every host attaches to one deploy-scoped Gateway. Each hostname gets
        // distinct HTTP/HTTPS listeners: mergeGateways combines every Gateway
        // in the class, and (port, protocol, hostname) must remain unique across
        // that complete set.
        const gatewayName = Underpost.ingress.gatewayNameFactory({ deployId, env });
        const publicScheme = Underpost.tls.terminates({ environment: env, options }) ? 'https' : 'http';
        const trafficServiceName = Underpost.deploy.trafficServiceNameFactory({ deployId, env });
        const gatewayHosts = [];

        for (const host of Object.keys(confServer)) {
          const pathPortAssignment = pathPortAssignmentData[host];
          // logger.info('', { host, pathPortAssignment });
          let _proxyYaml = Underpost.ingress.baseProxyYamlFactory({ host, env, options });
          // The live colour is a cluster fact, and a build must not need one: with
          // no `--traffic` the routes carry every colour this build emits, the
          // first at full weight. `switchTraffic` passes the promoted colour
          // explicitly, so a real promotion still pins exactly one.
          const deploymentVersions = `${options.traffic || options.versions || 'blue,green'}`.split(',');
          let proxyRoutes = '';
          const globalTimeoutPolicy =
            (options.timeoutResponse && options.timeoutResponse !== '') ||
            (options.timeoutIdle && options.timeoutIdle !== '')
              ? {
                  response: options.timeoutResponse,
                  idle: options.timeoutIdle,
                }
              : undefined;
          const globalRetryPolicy =
            options.retryCount ||
            options.retryCount === 0 ||
            (options.retryPerTryTimeout && options.retryPerTryTimeout !== '')
              ? {
                  count: options.retryCount,
                  perTryTimeout: options.retryPerTryTimeout,
                }
              : undefined;
          let routeRules = '';
          if (!options.disableDeploymentProxy)
            for (const conditionObj of pathPortAssignment) {
              const { path, port } = conditionObj;
              proxyRoutes += Underpost.deploy.deploymentYamlServiceFactory({
                path,
                port,
                serviceId: trafficServiceName,
                timeoutPolicy: globalTimeoutPolicy,
                retryPolicy: globalRetryPolicy,
              });
              // Intercepted contexts get a route of their own — `/offline` and
              // `/maintenance` are addresses a client asks for, and the service
              // worker precaches them by URL.
              //
              // A status page gets none. It is reached only by interception, so
              // the client's URI is always the one it requested: a route for
              // `/404` would make the status page a destination, and any hop to
              // it — a rewrite, or a runtime that redirects its own 404s — is a
              // URI the client did not ask for. `/invalid-path` must answer 404
              // with the configured document while staying `/invalid-path`, which
              // only `proxy_intercept_errors` in the gateway can do.
              const edgeRoutes = Underpost.deploy.edgeRouteEntriesFactory({ confServer, confSSR, host, path });
              const interceptStatuses = Object.keys(interceptStatusesFactory(edgeRoutes));
              for (const edgeRoute of edgeRoutes.filter((route) => !route.status)) {
                routeRules += Underpost.ingress.httpRouteRuleFactory({
                  path: edgeRoute.routePath,
                  // Onto the directory, not the document: one rule then covers
                  // the page and any asset beside it, which is exactly what the
                  // static utility's `try_files $uri $uri/index.html` resolves.
                  replacePrefixMatch: edgeRoute.dir,
                  ...Underpost.ingress.gatewayBackendFactory(options),
                  timeoutPolicy: globalTimeoutPolicy,
                  retryPolicy: globalRetryPolicy,
                  altSvc: http3 ? altSvc : undefined,
                });
                edgeRouteRecords.push({
                  host,
                  path: edgeRoute.routePath,
                  kind: edgeRoute.kind,
                  servedBy: UNDERPOST_GATEWAY.serviceName,
                  rewrite: edgeRoute.dir,
                  assetPath: edgeRoute.assetPath,
                });
              }
              // The site path goes through the shared gateway, which proxies it
              // to this workload and swaps in a status document when the
              // workload errors or is gone, and serves a static site from its
              // volume first. The API path is routed straight to the workload
              // instead: its errors are its own contract, and a client parsing
              // JSON must not receive an HTML page.
              const edgeSite = Underpost.deploy.edgeSiteFactory({ confServer, confClient, host, path });
              const plan = pathRoutePlan({ confServer, confClient, confSSR, host, path, ports: assignedPorts });
              // Gateway API redirects with 301 or 302 only: the gateway answers the 308 of a redirect route.
              const intercepted = interceptStatuses.length > 0 || !!edgeSite || plan.some((entry) => entry.redirect);
              if (intercepted && apiPathFactory({ confServer, host, path }))
                routeRules += Underpost.ingress.httpRouteRuleFactory({
                  path: apiPathFactory({ confServer, host, path }),
                  port,
                  serviceId: trafficServiceName,
                  timeoutPolicy: globalTimeoutPolicy,
                  retryPolicy: globalRetryPolicy,
                  altSvc: http3 ? altSvc : undefined,
                });
              routeRules += Underpost.ingress.httpRouteRuleFactory({
                path,
                ...(intercepted
                  ? Underpost.ingress.gatewayBackendFactory(options)
                  : { serviceId: trafficServiceName, port }),
                timeoutPolicy: globalTimeoutPolicy,
                retryPolicy: globalRetryPolicy,
                altSvc: http3 ? altSvc : undefined,
              });
              gatewayRoutesByHost[host] = (gatewayRoutesByHost[host] || []).concat(
                intercepted
                  ? {
                      path,
                      upstream: `${trafficServiceName}:${port}`,
                      statuses: interceptStatusesFactory(edgeRoutes),
                      ...(edgeSite ? { site: edgeSite.dir } : undefined),
                    }
                  : [],
              );
              // A service match goes straight to the destination workload. A document match
              // takes the interception of this host, so the visitor gets the documents of the
              // host they asked for. A redirect answers at the gateway, before any workload.
              for (const route of [...new Set(plan.map((entry) => entry.route))]) {
                const entries = plan.filter((entry) => entry.route === route);
                const { redirect, destination } = entries[0];
                const { port } = destination;
                const location = redirect && `${publicScheme}://${destination.host}`;
                const direct = entries.filter((entry) => !redirect && (entry.service || !intercepted));
                const edge = entries.filter((entry) => !direct.includes(entry));
                if (direct.length)
                  routeRules += Underpost.ingress.httpRouteRuleFactory({
                    matches: direct.map((entry) => entry.match),
                    port,
                    serviceId: trafficServiceName,
                    timeoutPolicy: globalTimeoutPolicy,
                    retryPolicy: globalRetryPolicy,
                    altSvc: http3 ? altSvc : undefined,
                  });
                gatewayRoutesByHost[host] = gatewayRoutesByHost[host].concat(
                  edge.map((entry) =>
                    redirect
                      ? { path: entry.match.path, match: entry.match.type, redirect: location }
                      : {
                          path: entry.match.path,
                          match: entry.match.type,
                          documents: path,
                          upstream: `${trafficServiceName}:${port}`,
                          statuses: interceptStatusesFactory(edgeRoutes),
                        },
                  ),
                );
                pathRouteRecords.push({
                  host,
                  id: route,
                  destination: `${destination.host}${destination.path}`,
                  ...(redirect ? { redirect: location } : undefined),
                  direct: direct.map((entry) => entry.match.path),
                  edge: edge.map((entry) => entry.match.path),
                });
              }
            }
          for (const customService of customServices) {
            const {
              path: _path,
              port,
              serviceId,
              host: _host,
              pathRewritePolicy,
              timeoutPolicy: _timeoutPolicy,
              retryPolicy: _retryPolicy,
            } = customService;
            if (host === _host) {
              proxyRoutes += Underpost.deploy.deploymentYamlServiceFactory({
                path: _path,
                port,
                serviceId,
                deploymentVersions,
                pathRewritePolicy,
                timeoutPolicy: _timeoutPolicy ? _timeoutPolicy : globalTimeoutPolicy,
                retryPolicy: _retryPolicy ? _retryPolicy : globalRetryPolicy,
              });
              routeRules += Underpost.ingress.httpRouteRuleFactory({
                path: _path,
                port,
                serviceId,
                deploymentVersions,
                pathRewritePolicy,
                timeoutPolicy: _timeoutPolicy ? _timeoutPolicy : globalTimeoutPolicy,
                retryPolicy: _retryPolicy ? _retryPolicy : globalRetryPolicy,
                altSvc: http3 ? altSvc : undefined,
              });
            }
          }
          if (proxyRoutes) proxyYaml += _proxyYaml + proxyRoutes;
          if (routeRules) {
            gatewayHosts.push(host);
            httpRouteYaml += Underpost.ingress.httpRouteYamlFactory({
              host,
              options,
              rules: routeRules,
              parentName: gatewayName,
              owner: gatewayName,
            });
          }
        }
        if (gatewayHosts.length > 0) {
          // Instance hostnames belong on this Gateway's certificate list even
          // though their routes are applied later by `instance-promote`: one
          // Gateway terminates every hostname the deploy serves, and a hostname
          // with no certificate listener here has no TLS filter chain to reach.
          // The Gateway remains deploy-scoped, while its listeners are scoped by
          // hostname so they can coexist with the other merged Gateways.
          const allGatewayHosts = [
            ...new Set([...gatewayHosts, ...deployHostsFactory(deployId).filter((host) => !confServer[host])]),
          ].sort();
          gatewayYaml += Underpost.ingress.gatewayYamlFactory({
            name: gatewayName,
            hosts: allGatewayHosts,
            env,
            options,
          });
          gatewayYaml += Underpost.ingress.clientTrafficPolicyYamlFactory({
            name: gatewayName,
            sectionNames: allGatewayHosts.map((host) =>
              Underpost.ingress.gatewayListenerNameFactory({ protocol: 'https', host }),
            ),
            env,
            options,
          });
        }
        // The shared gateway proxies the intercepted paths, so its own config is
        // part of this build — written as an artifact beside the manifests and
        // nothing more. Installing it into the live workload and reloading it is
        // the apply path's job: a build must work with no cluster running.
        for (const [gatewayHost, routes] of Object.entries(gatewayRoutesByHost))
          writeHostServerConf({
            confDir: Underpost.deploy.gatewayConfDirFactory({ deployId, env }),
            host: gatewayHost,
            conf: hostServerConfFactory({
              host: gatewayHost,
              routes,
              namespace: Underpost.namespace.of('workloads', { environment: env, options }),
              clusterDomain: Underpost.namespace.cluster({ environment: env, options }).clusterDomain,
            }),
          });
        const yamlPath = `./engine-private/conf/${deployId}/build/${env}/proxy.yaml`;
        fs.writeFileSync(yamlPath, proxyYaml, 'utf8');
        const buildPath = `./engine-private/conf/${deployId}/build/${env}`;
        for (const [name, content] of Object.entries({
          'gateway.yaml': gatewayYaml,
          'httproute.yaml': httpRouteYaml,
        }))
          Underpost.deploy.writeManifest({ filePath: `${buildPath}/${name}`, content });
        logger.info('Gateway API manifests written', {
          deployId,
          env,
          gatewayClass: gatewayClassName,
          http3,
          altSvc: http3 ? altSvc : null,
          edgeRoutes: edgeRouteRecords,
          pathRoutes: pathRouteRecords,
        });
        if (env !== 'production') {
          const deploymentsFiles = [
            'Dockerfile',
            'proxy.yaml',
            'gateway.yaml',
            'httproute.yaml',
            'deployment.yaml',
            'traffic-service.yaml',
            'pv-pvc.yaml',
            'grpc-service.yaml',
          ];
          for (const file of deploymentsFiles) {
            const source = `./engine-private/conf/${deployId}/build/${env}/${file}`;
            const target = `./manifests/deployment/${deployId}-${env}/${file}`;
            // Mirror absence as well as presence: a file this build no longer
            // produces must not survive here from an earlier one.
            if (fs.existsSync(source)) fs.copyFileSync(source, target);
            else fs.removeSync(target);
          }
        }
      }
    },
    /**
     * Stable gRPC Service of one blue/green workload. Its name never carries the
     * colour, so a client that dials it survives every traffic switch.
     * @param {string} deployId - Deployment identifier.
     * @param {string} env - Deployment environment.
     * @returns {string} Kubernetes Service name.
     * @memberof UnderpostDeploy
     */
    grpcServiceNameFactory({ deployId, env }) {
      return `${deployId}-grpc-service-${env}`;
    },
    /**
     * Builds and writes the stable gRPC ClusterIP service YAML for a deployment.
     * Scans conf.server.json for gRPC ports and emits grpc-service.yaml under
     * `engine-private/conf/<deployId>/build/<env>/`. The selector targets the
     * `app: <deployId>-<env>-<traffic>` label of the one colour that serves.
     * @param {string} deployId - Deployment ID.
     * @param {string} env - Environment ('development' or 'production').
     * @param {object} confServer - Parsed conf.server.json content.
     * @param {string} [namespace='default'] - Kubernetes namespace.
     * @param {string} [traffic='blue'] - The colour that serves ('blue' or 'green').
     * @param {string|null} [host=null] - Specific host to scan for gRPC ports. If null, all hosts are scanned.
     * @returns {string|null} - Path to the written YAML file, or null if no gRPC ports found.
     * @memberof UnderpostDeploy
     */
    buildGrpcServiceManifest({ deployId, env, confServer, namespace = 'default', traffic = 'blue', host = null }) {
      const grpcPorts = new Set();
      const hostsToScan = host ? [host] : Object.keys(confServer);
      for (const h of hostsToScan) {
        if (!confServer[h]) continue;
        for (const path of Object.keys(confServer[h])) {
          const grpc = confServer[h][path].grpc;
          if (grpc && grpc.port) grpcPorts.add(parseInt(grpc.port));
        }
      }
      if (grpcPorts.size === 0) return null;
      const grpcPortsList = [...grpcPorts]
        .map(
          (port) => `    - name: grpc-${port}
      protocol: TCP
      port: ${port}
      targetPort: ${port}`,
        )
        .join('\n');
      const grpcServiceName = Underpost.deploy.grpcServiceNameFactory({ deployId, env });
      const selectorYaml = `app: ${deployId}-${env}-${traffic}`;
      const grpcServiceYaml = `---
apiVersion: v1
kind: Service
metadata:
  name: ${grpcServiceName}
  namespace: ${namespace}
  labels:
    app: ${grpcServiceName}
spec:
  type: ClusterIP
  selector:
    ${selectorYaml}
  ports:
${grpcPortsList}
`;
      logger.info(
        `gRPC ClusterIP service YAML written: ${grpcServiceName} (selector: ${selectorYaml}, ports: ${[...grpcPorts].join(', ')})`,
      );
      const yamlPath = `./engine-private/conf/${deployId}/build/${env}/grpc-service.yaml`;
      fs.writeFileSync(yamlPath, grpcServiceYaml, 'utf8');
      return yamlPath;
    },
    /**
     * Mirrors each deploy's built development manifests into the project tree, and refreshes the
     * public default configuration they belong to.
     *
     * The project repository carries the development manifests of every routed deploy; the
     * private build directory is where they are produced. A manifest the build stopped producing
     * is removed here rather than left behind, so the two cannot disagree about what a deploy
     * ships.
     * @param {string[]} [deployIds] - Deploy ids to mirror; the route table plus `dd-cron` otherwise.
     * @returns {Array<{deployId: string, copied: string[], removed: string[]}>} What was mirrored.
     * @memberof UnderpostDeploy
     */
    mirrorDefaultManifests(deployIds = readDeployRoutes().concat(['dd-cron'])) {
      const mirrored = [];
      for (const deployId of deployIds) {
        const copied = [];
        const removed = [];
        for (const file of DEFAULT_MANIFEST_FILES) {
          const source = `./engine-private/conf/${deployId}/build/development/${file}`;
          const target = `./manifests/deployment/${deployId}-development/${file}`;
          if (fs.existsSync(source)) {
            fs.copySync(source, target);
            copied.push(file);
          } else if (fs.existsSync(target)) {
            fs.removeSync(target);
            removed.push(file);
          }
        }
        shellExec(`node bin new --dev --default-conf --deploy-id ${deployId}`);
        mirrored.push({ deployId, copied, removed });
      }
      logger.info('Default deployment manifests mirrored', { deployIds: mirrored.map(({ deployId }) => deployId) });
      return mirrored;
    },

    /**
     * Retrieves the current traffic status for a deployment.
     * @param {string} deployId - Deployment ID for which the traffic status is being retrieved.
     * @param {object} options - Options for the traffic retrieval.
     * @param {string} options.hostTest - Hostname to test for traffic status.
     * @param {string} [options.namespace] - The legacy namespace override; conf.cluster.json places each resource without it.
     * @param {string} [options.env] - The environment; its routing provider names the route kind read first.
     * @param {string} [options.underpostGatewayRoot] - Node directory backing the gateway volume, where an intercepted host's colour lives.
     * @returns {string|null} - Current traffic status ('blue' or 'green') or null if not found.
     * @memberof UnderpostDeploy
     */
    getCurrentTraffic(deployId, options = { hostTest: '', namespace: '', env: '' }) {
      // The stable Service selector is the blue/green authority. Routes and the
      // fallback gateway deliberately contain no colour after migration, so
      // reading them first would make a healthy deployment appear unrouted.
      for (const env of options.env ? [options.env] : ['production', 'development']) {
        const service = Underpost.deploy.trafficServiceNameFactory({ deployId, env });
        const selector = shellExec(
          `kubectl get service ${service} -n ${Underpost.namespace.of('workloads', { environment: env, options })} -o jsonpath='{.spec.selector.app}'`,
          {
            stdout: true,
            silent: true,
            silentOnError: true,
          },
        );
        const traffic = trafficFromRoutingInfoFactory({ info: `${selector}`, deployId, env });
        if (traffic) return traffic;
      }
      const hostTest = options?.hostTest
        ? options.hostTest
        : Object.keys(loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`))[0];
      return trafficFromRoutingInfoFactory({
        info: Underpost.deploy.readHostRoutingInfo({ host: hostTest, options }),
        deployId,
        env: options.env,
      });
    },

    /**
     * All the routing text that can carry a host's traffic colour.
     *
     * Two sources, because one is not enough on its own: the route object names
     * the colour for a host routed straight at its workload, and the Nginx server
     * block names it for a host whose errors the gateway intercepts — those are
     * routed at `underpost-gateway-service`, so their colour appears nowhere in
     * the route object. Reading both means the colour resolves the same way
     * whichever stack is live and whether or not the host is intercepted.
     *
     * Split out of {@link UnderpostDeploy.getCurrentTraffic} so a report covering
     * many deployments and environments can read each host once instead of once
     * per row.
     *
     * The route kind of the routing provider of the environment is read first, and the other one when that
     * finds nothing: a host the other provider still routes keeps its colour during a provider change. When
     * neither kind exists the host has no route and the caller proceeds with the Nginx block alone.
     * @param {string} host - Hostname whose routing is read.
     * @param {object} [options] - Options carrying the environment, namespace and gateway root.
     * @returns {string} Route object YAML and Nginx block, concatenated; empty when neither exists.
     * @memberof UnderpostDeploy
     */
    readHostRoutingInfo({ host, options = {} }) {
      const namespace = Underpost.namespace.of('workloads', { options });
      // A missing route object is the canonical "no traffic colour set yet"
      // state for blue/green rollouts. silentOnError swallows kubectl's NotFound
      // exit so this returns empty text rather than throwing. The `kind:` check
      // is what distinguishes a real object from anything kubectl printed while
      // failing — an empty answer has to mean "absent", or the fallback below
      // would never run.
      const readRouteObject = (kind) => {
        const out = shellExec(`kubectl get ${kind}/${host} -n ${namespace} -o yaml`, {
          silent: true,
          stdout: true,
          silentOnError: true,
        });
        return `${out || ''}`.includes(`kind: ${kind}`) ? `${out}` : '';
      };

      const preferred = Underpost.ingress.provider({ options }) === 'gateway-api' ? 'HTTPRoute' : 'HTTPProxy';
      const fallback = preferred === 'HTTPRoute' ? 'HTTPProxy' : 'HTTPRoute';
      let routeInfo = readRouteObject(preferred);
      if (!routeInfo) {
        routeInfo = readRouteObject(fallback);
        if (routeInfo)
          logger.warn('Host is routed by the other provider than its environment names; reading it instead', {
            host,
            selected: preferred,
            found: fallback,
            namespace,
          });
      }

      const gatewayConfPath = nodePath.join(
        Underpost.deploy.underpostGatewayRootFactory(options),
        UNDERPOST_GATEWAY.confDir,
        `${host}.conf`,
      );
      const gatewayInfo = fs.existsSync(gatewayConfPath) ? fs.readFileSync(gatewayConfPath, 'utf8') : '';
      return `${routeInfo || ''}\n${gatewayInfo}`;
    },

    /**
     * Writes a generated manifest, or removes it when there is nothing to
     * write. An empty file is not an empty set for `kubectl apply` — it fails
     * with "no objects passed to apply" — so a deploy that declares no objects
     * of a kind must leave no file behind, including one a previous build wrote.
     * @param {string} filePath - Destination path.
     * @param {string} content - Rendered YAML; blank removes the file.
     * @returns {boolean} True when a file was written.
     * @memberof UnderpostDeploy
     */
    writeManifest({ filePath, content }) {
      if (content && content.trim()) {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
      }
      fs.removeSync(filePath);
      return false;
    },

    /**
     * Node directory backing the static utility's volume, following the same
     * `HOST_VOLUME_ROOT/<pv>` convention as every other hostPath volume.
     * @param {object} [options] - Deploy/run options.
     * @returns {string} Absolute host path.
     * @memberof UnderpostDeploy
     */
    underpostGatewayRootFactory(options = {}) {
      return options.underpostGatewayRoot || `${HOST_VOLUME_ROOT}/${UNDERPOST_GATEWAY.volumeName}`;
    },

    /**
     * Reports whether a Service currently has at least one ready endpoint.
     *
     * The single reachability predicate for a colour: a Service with no ready
     * endpoint cannot serve, so it is neither safe to route to nor something
     * live traffic can be sitting on.
     * @param {string} service - Service name.
     * @param {string} [namespace] - Namespace.
     * @returns {boolean} True when an endpoint is ready right now.
     * @memberof UnderpostDeploy
     */
    serviceHasReadyEndpoints({ service, namespace = 'default' }) {
      const ready = shellExec(
        `kubectl get endpointslice -n ${namespace} -l kubernetes.io/service-name=${service} ` +
          `-o jsonpath='{.items[*].endpoints[*].conditions.ready}' 2>/dev/null`,
        { stdout: true, silent: true, silentOnError: true },
      );
      return `${ready}`.includes('true');
    },

    /**
     * Reports whether a Deployment object exists at all.
     *
     * The inactive colour of a blue/green pair is routinely absent, so callers
     * that act on it must distinguish "not deployed yet" from a failed lookup.
     * @param {string} deployment - Deployment name.
     * @param {string} [namespace] - Kubernetes namespace.
     * @returns {boolean} True when the object is present.
     */
    deploymentExists({ deployment, namespace = 'default' }) {
      return !!`${
        shellExec(`kubectl get deployment ${deployment} -n ${namespace} --ignore-not-found -o name`, {
          stdout: true,
          silent: true,
          silentOnError: true,
        }) || ''
      }`.trim();
    },

    /**
     * The rollout state of a Deployment: `ready` when the controller has observed the current generation and
     * every desired replica is updated, Ready and Available; `stalled` when Kubernetes reports
     * `ProgressDeadlineExceeded`, which it never retries on its own; else `progressing`.
     * @param {string} deployment - Deployment name.
     * @param {string} [namespace] - Kubernetes namespace.
     * @returns {'ready'|'stalled'|'progressing'}
     */
    deploymentRollout({ deployment, namespace = 'default' }) {
      // `|` keeps an absent field in place: a Deployment with no ready replica omits `readyReplicas`.
      const [generation, observed, desired, updated, ready, available, progress] = `${
        shellExec(
          `kubectl get deployment ${deployment} -n ${namespace} ` +
            `-o jsonpath='{.metadata.generation}|{.status.observedGeneration}|{.spec.replicas}|` +
            `{.status.updatedReplicas}|{.status.readyReplicas}|{.status.availableReplicas}|` +
            `{.status.conditions[?(@.type=="Progressing")].reason}'`,
          { stdout: true, silent: true, silentOnError: true },
        ) || ''
      }`
        .trim()
        .split('|');
      if (progress === 'ProgressDeadlineExceeded') return 'stalled';
      const [g, o, d, u, r, a] = [generation, observed, desired, updated, ready, available].map(Number);
      return o >= g && d > 0 && u === d && r === d && a === d ? 'ready' : 'progressing';
    },

    /**
     * Waits for all replicas of a target colour, not merely its first endpoint.
     * @param {string} deployment - Deployment name.
     * @param {string} [namespace] - Kubernetes namespace.
     * @param {number} [timeoutMs] - Maximum wait.
     * @returns {boolean} True when the whole Deployment is ready; false at once when its rollout stalled.
     */
    awaitDeploymentReady({ deployment, namespace = 'default', timeoutMs = 15 * 60 * 1000 }) {
      const deadline = Date.now() + timeoutMs;
      let rollout = 'progressing';
      while (Date.now() < deadline) {
        rollout = Underpost.deploy.deploymentRollout({ deployment, namespace });
        if (rollout === 'ready') return true;
        if (rollout === 'stalled') break;
        shellExec('sleep 2', { silent: true });
      }
      logger.warn('Deployment never made every desired replica Ready', { deployment, namespace, rollout });
      return false;
    },

    /**
     * Blocks until a Service has at least one ready endpoint.
     *
     * Envoy Gateway translates a route's backends at translation time, so the
     * moment a route is applied decides whether it works: with no ready
     * endpoint the rule is rewritten to a 500 direct response and stays that
     * way. Returns false on timeout rather than throwing — a Service that never
     * comes up is the deploy's problem to report, not this helper's.
     * @param {string} service - Service name.
     * @param {string} [namespace] - Namespace.
     * @param {number} [timeoutMs] - How long to wait.
     * @returns {boolean} True once an endpoint is ready.
     * @memberof UnderpostDeploy
     */
    awaitServiceEndpoints({ service, namespace = 'default', timeoutMs = 15 * 60 * 1000 }) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (Underpost.deploy.serviceHasReadyEndpoints({ service, namespace })) return true;
        shellExec('sleep 2', { silent: true });
      }
      logger.warn('Service never reported a ready endpoint; routes may be programmed as 500', {
        service,
        namespace,
      });
      return false;
    },

    /**
     * Places every edge-served document in the static utility's tree.
     *
     * Two sources, in that order. The workload is preferred because it is the
     * only place all of them exist at once: several clients are built from
     * sources cloned into the container at start-up, so this checkout's `public/`
     * tree is both incomplete and only as fresh as its last local build. The
     * checkout is the fallback, and the reason this runs twice in a cluster
     * bring-up — once before the workload exists, to seed the tree so the routes
     * are correct the moment they are programmed, and once after it is Ready, to
     * replace what the container built better.
     *
     * A host whose page is in neither place keeps whatever the tree already had,
     * ending on the shared default page — which answers 404 rather than
     * presenting itself as that host's page.
     * @param {string} deployId - Deploy id whose conf declares the views.
     * @param {string} env - `development` | `production`.
     * @param {object} [options] - Deploy options (namespace, versions, static root).
     * @returns {Array<object>} One record per document, with where it came from.
     * @memberof UnderpostDeploy
     */
    syncStaticAssets(deployId, env, options = {}) {
      const namespace = Underpost.namespace.of('workloads', { options: { ...options, deployId } });
      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      const confSSRPath = `./engine-private/conf/${deployId}/conf.ssr.json`;
      if (!fs.existsSync(confServerPath) || !fs.existsSync(confSSRPath)) {
        logger.warn('No conf.server.json / conf.ssr.json; nothing to sync', { deployId, confServerPath });
        return [];
      }
      // loadReplicas expands a plain `replicas` path (no singleReplica) into its
      // own literal path key with the canonical path's client/view config
      // cloned onto it, matching what buildManifest/buildProxyRouter resolve
      // against — so a replica path this workload actually built (e.g. `/r1`)
      // gets its edge documents synced too, not just the canonical path.
      const confServer = loadReplicas(deployId, JSON.parse(fs.readFileSync(confServerPath, 'utf8')));
      const confSSR = JSON.parse(fs.readFileSync(confSSRPath, 'utf8'));
      const confClientPath = `./engine-private/conf/${deployId}/conf.client.json`;
      const confClient = fs.existsSync(confClientPath) ? JSON.parse(fs.readFileSync(confClientPath, 'utf8')) : {};
      const hostRoot = Underpost.deploy.underpostGatewayRootFactory(options);
      const version = (options.versions && `${options.versions}`.split(',')[0]) || 'blue';
      const podName = Underpost.kubectl
        .get(`${deployId}-${env}-${version}`, 'pods', namespace)
        .find((pod) => pod.NAME?.startsWith(`${deployId}-${env}-${version}-`) && pod.STATUS === 'Running')?.NAME;
      const synced = [];
      for (const host of Object.keys(confServer))
        for (const path of Object.keys(confServer[host])) {
          // A singleReplica canonical path is never built under this deploy id —
          // client-build.js skips it (see `if (singleReplica) continue`) and
          // buildProxyRouter/buildManifest route none of its own edge documents
          // for it either. Its replicas are each their own deploy id, built and
          // synced independently; requiring this path's assets here would fail
          // on a document that structurally cannot exist for this deploy.
          if (confServer[host][path].singleReplica) continue;
          for (const entry of Underpost.deploy.edgeRouteEntriesFactory({ confServer, confSSR, host, path })) {
            const fromPod =
              !!podName &&
              syncStaticAssetFromPod({
                podName,
                namespace,
                sourcePath: entry.containerPath,
                hostRoot,
                assetPath: entry.assetPath,
              });
            const fromHost =
              !fromPod && writeStaticAsset({ hostRoot, assetPath: entry.assetPath, sourcePath: entry.hostPath });
            synced.push({
              host,
              kind: entry.kind,
              assetPath: entry.assetPath,
              source: fromPod ? 'workload' : fromHost ? 'checkout' : null,
            });
          }
          const site = Underpost.deploy.edgeSiteFactory({ confServer, confClient, host, path });
          if (site) {
            const fromPod =
              !!podName &&
              syncStaticTreeFromPod({
                podName,
                namespace,
                sourcePath: site.containerPath,
                hostRoot,
                assetPath: site.assetPath,
              });
            const fromHost =
              !fromPod && writeStaticTree({ hostRoot, assetPath: site.assetPath, sourcePath: site.hostPath });
            synced.push({
              host,
              kind: 'site',
              assetPath: site.assetPath,
              source: fromPod ? 'workload' : fromHost ? 'checkout' : null,
            });
          }
        }
      // Instance status pages are the same kind of document under the same
      // layout, so they are placed by the same pass — but they come from neither
      // of the sources above. Each is built and versioned by the project its
      // instance runs, so `customStatusPages[].hostPath` resolves against that
      // project's checkout on this host, and one document is placed per variant
      // so `/FOREST/404` and `/404` each land where their own rule rewrites to.
      if (fs.existsSync(`./engine-private/conf/${deployId}/conf.instances.json`))
        for (const entry of instanceStatusPageEntriesFactory({ instances: loadConfInstances(deployId) }))
          synced.push({
            host: entry.host,
            kind: `status:${entry.status}`,
            assetPath: entry.assetPath,
            source: writeStaticAsset({ hostRoot, assetPath: entry.assetPath, sourcePath: entry.sourcePath })
              ? 'project'
              : null,
          });
      // The documents were just written under the operator's home tree, whose policy label
      // (user_home_t) the unprivileged gateway container cannot read — it would answer 403 for
      // every one of them. Register the mapping for the volume root and restore this subtree, so
      // the files this pass created carry the shared container label.
      prepareContainerStorage(hostRoot);
      logger.info('Static edge documents placed', {
        deployId,
        podName: podName || '(no running workload; placed from this checkout)',
        fromWorkload: synced.filter((entry) => entry.source === 'workload').length,
        fromCheckout: synced.filter((entry) => entry.source === 'checkout').length,
        fromProject: synced.filter((entry) => entry.source === 'project').length,
        missing: synced.filter((entry) => !entry.source).map((entry) => entry.assetPath),
      });
      return synced;
    },

    /**
     * The static site of a root host path: its whole build, which the shared gateway serves from
     * its volume before it asks the workload. A host path is one when its client ships no bundle
     * and it serves no API, socket, database or peer: every answer it gives is a file of its build.
     * @param {object} confServer - Parsed `conf.server.json`.
     * @param {object} confClient - Parsed `conf.client.json`.
     * @param {string} host - Hostname.
     * @param {string} path - Proxy sub-path.
     * @returns {{dir: string, assetPath: string, containerPath: string, hostPath: string}|null}
     * @memberof UnderpostDeploy
     */
    edgeSiteFactory({ confServer, confClient, host, path }) {
      const entry = confServer?.[host]?.[path];
      const views = confClient?.[entry?.client]?.views ?? [];
      if (path !== '/' || views.length === 0 || views.some(viewShipsBundle)) return null;
      if (entry.apis?.length || entry.ws || entry.db || entry.peer || entry.redirect) return null;
      const { dir, assetPath } = staticLocationFactory({ host, path, context: 'site', file: '' });
      return {
        dir,
        assetPath: assetPath.replace(/\/$/, ''),
        containerPath: `${CONTAINER_ENGINE_ROOT}/public/${host}`,
        hostPath: `./public/${host}`,
      };
    },

    /**
     * The SSR views one host/path serves from the static edge tier, with every
     * address each of them needs: the route to match, the directory the gateway
     * rewrites onto, where the document sits under the static root, and the two
     * places the build may have left it — inside the workload, and in this
     * checkout's own `public/` tree.
     *
     * Single source of truth for the two consumers that must agree exactly —
     * `--build-manifest`, which emits the rules, and `--sync-static`, which
     * places the documents those rules point at.
     * @param {object} confServer - Parsed `conf.server.json`.
     * @param {object} confSSR - Parsed `conf.ssr.json`.
     * @param {string} host - Hostname.
     * @param {string} path - Proxy sub-path.
     * @returns {Array<object>} One entry per edge-served view.
     * @memberof UnderpostDeploy
     */
    edgeRouteEntriesFactory({ confServer, confSSR, host, path }) {
      const client = confServer?.[host]?.[path]?.client;
      const views = client ? confSSR?.[getCapVariableName(client)]?.views : undefined;
      if (!views) return [];
      // The client build writes each view to `public/<host><path>/<view>/index.html`,
      // under the container root for the workload's copy and under this repo for
      // the host's.
      // A context is built on its own route (`/offline/index.html`) because a
      // client requests it by URL; a status page is built under `status-pages/`
      // instead, off any route the runtime could answer with. Both sides read the
      // segment from one factory so the sync never looks where the build did not
      // write.
      const publicPath = (segment) => `public/${host}${path === '/' ? '' : path}/${segment}`;
      const addresses = (segment) => ({
        containerPath: `${CONTAINER_ENGINE_ROOT}/${publicPath(segment)}`,
        hostPath: `./${publicPath(segment)}`,
      });
      return [
        ...statusPageRoutesFactory({ views, proxyPath: path }).map((route) => ({
          ...route,
          ...statusPageAssetPathFactory({ host, path, status: route.status }),
          kind: `status:${route.status}`,
          ...addresses(statusPageBuildSegment(route.status)),
        })),
        ...staticContextRoutesFactory({ views, proxyPath: path }).map((route) => ({
          ...route,
          ...staticLocationFactory({ host, path, context: route.context }),
          kind: `context:${route.context}`,
          ...addresses(`${route.context}/index.html`),
        })),
      ];
    },

    /**
     * Renders the static utility workload, resolving its placement from the
     * deploy options the way every other hostPath volume is resolved — the
     * documents are written to a node directory, so the pod has to land on the
     * node that holds them.
     * @param {object} [options] - Deploy/run options (namespace, node, cluster flags).
     * @returns {string} Multi-document YAML.
     * @memberof UnderpostDeploy
     */
    underpostGatewayYamlFactory(options = {}) {
      const namespace = Underpost.namespace.of('platform', { options });
      return `${underpostGatewayManifestsFactory({
        namespace,
        hostPath: Underpost.deploy.underpostGatewayRootFactory(options),
        nodeName: Underpost.namespace.soleNode(
          Underpost.deploy.resolveDeployNodes({ ...options, node: options.nodeName, resource: 'platform' }),
          'The Underpost gateway',
        ),
        tolerations: Underpost.namespace.podScheduling({ resource: 'platform', options, node: options.nodeName })
          .tolerations,
        resolver: Underpost.deploy.clusterDnsFactory(),
      })}${Underpost.ingress.referenceGrantYamlFactory({
        namespace,
        fromNamespace: Underpost.namespace.of('workloads', { options }),
        services: [UNDERPOST_GATEWAY.serviceName],
      })}`;
    },

    /**
     * Where a build writes the shared gateway's server blocks. A build artifact
     * like every other manifest, installed into the live workload by the apply
     * path rather than by the build that produced it.
     * @param {string} deployId - Deploy id.
     * @param {string} env - `development` | `production`.
     * @returns {string} Directory holding the built blocks.
     * @memberof UnderpostDeploy
     */
    gatewayConfDirFactory({ deployId, env }) {
      return `./engine-private/conf/${deployId}/build/${env}/gateway-conf.d`;
    },

    /**
     * The cluster DNS address Nginx resolves upstream Service names through.
     * Read from the live Service because it follows the cluster's own Service
     * CIDR, and baked into the config because nginx cannot resolve the name of
     * its own resolver.
     * @returns {string} kube-dns ClusterIP, or the conventional default.
     * @memberof UnderpostDeploy
     */
    clusterDnsFactory() {
      const clusterIp = shellExec(
        `kubectl get svc kube-dns -n kube-system -o jsonpath='{.spec.clusterIP}' 2>/dev/null`,
        { stdout: true, silent: true, silentOnError: true },
      );
      return /^\d+\.\d+\.\d+\.\d+$/.test(`${clusterIp}`.trim()) ? `${clusterIp}`.trim() : UNDERPOST_GATEWAY.resolver;
    },

    /**
     * Callback function for handling deployment options.
     * @param {string} deployList - List of deployment IDs to process.
     * @param {string} env - Environment for which the deployment is being processed.
     * @param {object} options - Options for the deployment process.
     * @param {boolean} options.remove - Whether to remove the deployment.
     * @param {boolean} options.infoRouter - Whether to display router information.
     * @param {boolean} options.sync - Whether to synchronize deployment configurations.
     * @param {boolean} options.buildManifest - Whether to build the deployment manifest.
     * @param {boolean} options.infoUtil - Whether to display utility information.
     * @param {string} options.versions - Comma-separated list of versions to deploy.
     * @param {string} options.image - Docker image for the deployment.
     * @param {string} options.traffic - Traffic status for the deployment.
     * @param {string} options.replicas - Number of replicas for the deployment.
     * @param {string} options.node - Explicit target node; without it, the scheduling of conf.cluster.json ({@link UnderpostNamespace.schedule}) places the workloads, and {@link UnderpostDeploy.resolveDeployNodes} their volumes.
     * @param {string} [options.sshKeyPath] - Private key path for node SSH operations, forwarded to deployVolume when shipping a hostPath volume to a remote target node over SSH. Defaults to engine-private/deploy/id_rsa.
     * @param {boolean} options.disableUpdateDeployment - Whether to disable deployment updates.
     * @param {boolean} [options.gatewayApi] - Apply the Gateway API stack (Gateway + HTTPRoute) instead of the Contour HTTPProxy. Both manifest sets are always generated by `--build-manifest`.
     * @param {string} [options.gatewayClass] - GatewayClass name baked into generated Gateway manifests.
     * @param {boolean} [options.disableHttp3] - Omit QUIC/HTTP3 listener config and the Alt-Svc advertisement.
     * @param {number|string} [options.quicPort] - UDP port advertised for QUIC/HTTP3.
     * @param {boolean} options.disableUpdateProxy - Whether to disable proxy updates.
     * @param {boolean} options.disableDeploymentProxy - Whether to disable deployment proxy.
     * @param {boolean} options.disableUpdateVolume - Whether to disable volume updates.
     * @param {boolean} options.disableUpdateUnderpostConfig - Whether to disable Underpost config updates.
     * @param {string} [options.namespace] - The legacy namespace override; conf.cluster.json places each resource without it.
     * @param {string} [options.timeoutResponse] - HTTPProxy per-route response timeout (e.g. "10000ms", "infinity").
     * @param {string} [options.timeoutIdle] - HTTPProxy per-route idle timeout (e.g. "10s", "infinity").
     * @param {string} [options.retryCount] - HTTPProxy per-route retry count (e.g. 3).
     * @param {string} [options.retryPerTryTimeout] - HTTPProxy per-route per-try timeout (e.g. "150ms").
     * @param {string} [options.cmd] - Custom initialization command (comma-separated) for deploymentYamlPartsFactory.
     * @param {boolean} [options.k3s] - Whether to use k3s cluster context.
     * @param {boolean} [options.kubeadm] - Whether to use kubeadm cluster context.
     * @param {boolean} [options.kind] - Whether to use kind cluster context.
     * @param {boolean} [options.gitClean] - Whether to run git clean on volume mount paths before copying.
     * @param {boolean} [options.skipFullBuild] - Whether to skip the full client bundle build; passed through to buildManifest/deploymentYamlPartsFactory.
     * @param {boolean} [options.pullBundle] - Whether to pull the pre-built client bundle from Cloudinary; passed through to buildManifest/deploymentYamlPartsFactory. Use together with skipFullBuild.
     * @param {string} [options.imagePullPolicy] - Container imagePullPolicy override (`Always`, `IfNotPresent`, `Never`); passed through to buildManifest/deploymentYamlPartsFactory. Defaults to `Never` for `localhost/` images and `IfNotPresent` otherwise.
     * @param {boolean} [options.disableRuntimeProbes] - Deprecated compatibility flag; readiness remains mandatory.
     * @param {boolean} [options.tcpProbes] - Emit legacy TCP socket probes instead of HTTP internal-status probes.
     * @returns {Promise<void>} - Promise that resolves when the deployment process is complete.
     * @memberof UnderpostDeploy
     */
    async callback(
      deployList = '',
      env = 'development',
      options = {
        remove: false,
        infoRouter: false,
        sync: false,
        buildManifest: false,
        infoUtil: false,
        versions: '',
        image: '',
        traffic: '',
        replicas: '',
        node: '',
        disableUpdateDeployment: false,
        disableUpdateProxy: false,
        disableDeploymentProxy: false,
        disableUpdateVolume: false,
        disableUpdateUnderpostConfig: false,
        namespace: '',
        timeoutResponse: '',
        timeoutIdle: '',
        retryCount: '',
        retryPerTryTimeout: '',
        cmd: '',
        k3s: false,
        kubeadm: false,
        kind: false,
        gitClean: false,
        imagePullPolicy: '',
      },
    ) {
      options = { ...options, gatewayApi: Underpost.ingress.provider({ environment: env, options }) === 'gateway-api' };
      // Each deployment resolves its own placement: a migration can move one deployment alone.
      const namespaceOf = (deployId = '') =>
        Underpost.namespace.of('workloads', { environment: env, options: { ...options, deployId } });
      if (!deployList || deployList === 'dd') deployList = readDeployRoutes().join(',');
      const deployIds = deployList
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      Underpost.ingress.assertOwnership(deployIds);
      const explicitVersions = options.versions && typeof options.versions === 'string' ? options.versions : '';
      const explicitTraffic =
        options.traffic && typeof options.traffic === 'string' ? options.traffic.split(',')[0] : '';
      const liveTrafficByDeployId = Object.fromEntries(
        deployIds.map((deployId) => [
          deployId,
          Underpost.deploy.getCurrentTraffic(deployId, {
            namespace: namespaceOf(deployId),
            env,
            gatewayApi: options.gatewayApi,
          }),
        ]),
      );
      const versionsByDeployId = Object.fromEntries(
        deployIds.map((deployId) => [
          deployId,
          explicitVersions || explicitTraffic || nextTrafficFactory(liveTrafficByDeployId[deployId]),
        ]),
      );
      if (!options.replicas) options.replicas = 1;
      if (options.sync)
        await getDataDeploy({
          buildSingleReplica: true,
        });
      if (options.buildManifest === true)
        for (const deployId of deployIds)
          await Underpost.deploy.buildManifest(deployId, env, {
            ...options,
            versions: versionsByDeployId[deployId],
            traffic: explicitTraffic || liveTrafficByDeployId[deployId] || versionsByDeployId[deployId].split(',')[0],
          });
      if (options.syncStatic === true) {
        for (const deployId of deployList
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean))
          // The documents of the colour that serves, unless --versions names another.
          Underpost.deploy.syncStaticAssets(deployId, env, {
            ...options,
            versions: explicitVersions || liveTrafficByDeployId[deployId] || 'blue',
          });
        return;
      }
      // Before the `--build-manifest` return: a manifest build is when the Secrets it mounts
      // must exist, and `run sync` reaches this command with `--build-manifest --info-router`.
      if (!options.disableUpdateUnderpostConfig) {
        const placement = Underpost.namespace.overrides(options);
        // A profile without cluster writes, such as a hermetic manifest build, reports the projections as intent.
        const dryRun = !activeExecutionProfile().permits.includes('cluster:write');
        Underpost.host.apply(domainContextFactory({ env, ...placement, dryRun }));
        // Each deployment's own env, OCI overlay applied. Without it the overlay reaches a pod
        // only through in-pod `app load`, so a stale image keeps the base file's 127.0.0.1.
        for (const _deployId of deployIds)
          await Underpost.app.apply(
            domainContextFactory({ env, ...placement, dryRun, args: { 'deploy-id': _deployId } }),
          );
      }
      if (options.infoRouter === true || options.buildManifest === true) {
        logger.info('router', await Underpost.deploy.routerFactory(deployList, env));
        return;
      }

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        const namespace = namespaceOf(deployId);
        const deploymentVersions = versionsByDeployId[deployId].split(',').map((version) => version.trim());
        const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
        const confVolume = fs.existsSync(`./engine-private/conf/${deployId}/conf.volume.json`)
          ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.volume.json`, 'utf8'))
          : [];

        if (!options.disableUpdateDeployment)
          for (const version of deploymentVersions) {
            shellExec(`kubectl delete svc ${deployId}-${env}-${version}-service -n ${namespace} --ignore-not-found`);
            shellExec(`kubectl delete deployment ${deployId}-${env}-${version} -n ${namespace} --ignore-not-found`);
            if (!options.disableUpdateVolume)
              for (const volume of confVolume)
                Underpost.deploy.deployVolume(volume, {
                  deployId,
                  env,
                  version,
                  namespace,
                  nodeNames: Underpost.deploy.resolveDeployNodes({
                    node: options.node,
                    resource: 'workloads',
                    kind: options.kind,
                    kubeadm: options.kubeadm,
                    k3s: options.k3s,
                    env,
                  }),
                  clusterContext: clusterTypeFactory(options),
                  gitClean: options.gitClean || false,
                  sshKeyPath: options.sshKeyPath || '',
                });
          }

        // The host's route object is left in place and replaced by the `apply`
        // below. Deleting it first unpublished the hostname for the whole
        // reconciliation window, so every promote dropped live requests before
        // the new colour was ever the question.
        if (!options.disableUpdateProxy && options.gatewayApi)
          Underpost.ingress.sweepLegacyGatewayObjects({ hosts: Object.keys(confServer), namespace });

        const manifestsPath =
          env === 'production'
            ? `engine-private/conf/${deployId}/build/production`
            : `manifests/deployment/${deployId}-${env}`;

        if (!options.remove) {
          if (!options.disableUpdateDeployment) {
            shellExec(`${KUBECTL_SERVER_SIDE_APPLY} -f ./${manifestsPath}/deployment.yaml -n ${namespace}`);
            const grpcServicePath = `./${manifestsPath}/grpc-service.yaml`;
            if (fs.existsSync(grpcServicePath)) shellExec(`kubectl apply -f ${grpcServicePath} -n ${namespace}`);
          }
          // Ingress is served by exactly one of the two routing stacks: the
          // Contour HTTPProxy set, or the Gateway API set (Gateway + HTTPRoute).
          // Applying both would publish duplicate routes for the same hostnames.
          if (!options.disableUpdateProxy) {
            const currentTraffic = Underpost.deploy.getCurrentTraffic(deployId, {
              namespace,
              env,
              gatewayApi: options.gatewayApi,
            });
            const currentReady =
              !!currentTraffic &&
              Underpost.deploy.serviceHasReadyEndpoints({
                service: `${deployId}-${env}-${currentTraffic}-service`,
                namespace,
              });
            // With no explicit traffic request, deploying the opposite colour is
            // preparation only: preserve the colour already serving. A first
            // deployment has no live selector and starts on the first requested
            // version. Explicit --traffic is the only normal apply-time switch.
            const desiredTraffic = explicitTraffic || (currentReady ? currentTraffic : deploymentVersions[0]);
            const desiredDeployment = `${deployId}-${env}-${desiredTraffic}`;
            if (
              !options.disableUpdateDeployment &&
              (!Underpost.deploy.awaitDeploymentReady({ deployment: desiredDeployment, namespace }) ||
                !Underpost.deploy.awaitServiceEndpoints({ service: `${desiredDeployment}-service`, namespace }))
            )
              throw new Error(`Refusing to route ${deployId}-${env} to unready colour ${desiredTraffic}`);

            // Migration is two-phase. First make every route and fallback block
            // use a stable Service that still selects the current colour. Only
            // after both stacks are converged is its selector moved to the ready
            // target, so stack migration cannot create a root/API split.
            const bootstrapTraffic = currentReady ? currentTraffic : desiredTraffic;
            const trafficServicePath = `./${manifestsPath}/traffic-service.yaml`;
            Underpost.deploy.applyTrafficService({
              deployId,
              env,
              traffic: bootstrapTraffic,
              namespace,
              manifestPath: trafficServicePath,
            });
            if (options.gatewayApi) {
              // Nginx must know how to proxy and intercept this host before Envoy
              // can send the first request to it. Installing first removes the
              // reconciliation window where the HTTPRoute is Accepted but the
              // shared gateway still serves its default server block.
              installGatewayConf({
                hostRoot: Underpost.deploy.underpostGatewayRootFactory(options),
                confSourceDir: Underpost.deploy.gatewayConfDirFactory({ deployId, env }),
                namespace: Underpost.namespace.of('platform', { environment: env, options }),
              });
              Underpost.ingress.applyGatewayGrant({ namespace, env, options });
              for (const file of ['gateway.yaml', 'httproute.yaml']) {
                const gatewayApiPath = `./${manifestsPath}/${file}`;
                if (fs.existsSync(gatewayApiPath) && fs.readFileSync(gatewayApiPath, 'utf8').trim())
                  shellExec(`kubectl apply -f ${gatewayApiPath} -n ${namespace}`);
              }
            } else shellExec(`kubectl apply -f ./${manifestsPath}/proxy.yaml -n ${namespace}`);
            // The hostnames just published have to reach the data plane that now
            // describes them. A shared edge built before this apply still sends
            // them to the other stack, which answers 404 for a healthy workload.
            // No-op when no shared edge is installed.
            const platform = Underpost.namespace.of('platform', { environment: env, options });
            const sharedIngressUpdated = Underpost.cluster.refreshUnderpostIngress({ namespace: platform, options });
            if (sharedIngressUpdated) {
              Underpost.ingress.removeInactiveHostRoutes({
                hosts: Object.keys(confServer),
                gatewayApi: options.gatewayApi,
                namespace,
              });
              Underpost.cluster.refreshUnderpostIngress({ namespace: platform, options });
            }

            if (desiredTraffic !== bootstrapTraffic)
              Underpost.deploy.applyTrafficService({
                deployId,
                env,
                traffic: desiredTraffic,
                namespace,
                manifestPath: trafficServicePath,
              });
            if (
              !options.disableUpdateDeployment &&
              !Underpost.deploy.awaitServiceEndpoints({
                service: Underpost.deploy.trafficServiceNameFactory({ deployId, env }),
                namespace,
              })
            ) {
              if (desiredTraffic !== bootstrapTraffic)
                Underpost.deploy.applyTrafficService({
                  deployId,
                  env,
                  traffic: bootstrapTraffic,
                  namespace,
                  manifestPath: trafficServicePath,
                });
              throw new Error(`Traffic Service for ${deployId}-${env} never became ready on ${desiredTraffic}`);
            }
            const missing = await Underpost.tls.missing({ deployId, environment: env, namespace, options });
            if (missing.length)
              logger.warn(`The TLS of ${deployId} is not in place for ${missing.join(', ')}`, {
                run: `node bin tls reconcile --deploy-id ${deployId} --env ${env} --apply`,
              });
            if (options.gatewayApi) {
              const stale = await Underpost.ingress.stale({ deployId, environment: env, options });
              if (stale.length)
                logger.warn(`The old routing of ${deployId} is still in the cluster`, {
                  findings: stale.map(({ message }) => message),
                  run: `node bin ingress reconcile --deploy-id ${deployId} --env ${env} --apply`,
                });
            }
          }
        }
      }
    },
    /**
     * Switches the traffic for a deployment.
     *
     * Routing only: the workload is the caller's to deploy and make Ready, and
     * this must never rebuild it. The colour being switched to is, by definition,
     * the one about to receive every request, so tearing it down here would make
     * the flip the outage it exists to avoid.
     * @param {string} deployId - Deployment ID for which the traffic is being switched.
     * @param {string} env - Environment for which the traffic is being switched.
     * @param {string} targetTraffic - Target traffic status for the deployment.
     * @param {number} replicas - Number of replicas for the deployment.
     * @param {string} [namespace='default'] - Kubernetes namespace for the deployment.
     * @param {object} options - Options for the traffic switch.
     * @param {string} options.timeoutResponse - Timeout response setting for the deployment.
     * @param {string} options.timeoutIdle - Timeout idle setting for the deployment.
     * @param {string} options.retryCount - Retry count setting for the deployment.
     * @param {string} options.retryPerTryTimeout - Retry per-try timeout setting for the deployment.
     * @param {string} [options.imagePullPolicy] - Container imagePullPolicy override; forwarded to the manifest rebuild triggered here.
     * @memberof UnderpostDeploy
     */
    switchTraffic(
      deployId,
      env,
      targetTraffic,
      replicas = 1,
      namespace = 'default',
      options = {
        timeoutResponse: '',
        timeoutIdle: '',
        retryCount: '',
        retryPerTryTimeout: '',
        imagePullPolicy: '',
      },
    ) {
      options = { ...options, gatewayApi: Underpost.ingress.provider({ environment: env, options }) === 'gateway-api' };
      const timeoutFlags = Underpost.deploy.timeoutFlagsFactory(options);
      const imagePullPolicyFlag = options.imagePullPolicy ? ` --image-pull-policy ${options.imagePullPolicy}` : '';
      const gatewayApiFlags = Underpost.deploy.gatewayApiFlagsFactory(options);

      // Readiness is a promotion precondition, not advisory. All callers use
      // this same gate, including monitor/failover paths, so no code path can
      // publish an endpointless target and turn a healthy opposite colour into
      // a 500/maintenance response.
      if (
        !Underpost.deploy.awaitDeploymentReady({
          deployment: `${deployId}-${env}-${targetTraffic}`,
          namespace,
        }) ||
        !Underpost.deploy.awaitServiceEndpoints({ service: `${deployId}-${env}-${targetTraffic}-service`, namespace })
      )
        throw new Error(`Refusing to switch ${deployId}-${env} to unready colour ${targetTraffic}`);
      const currentTraffic = Underpost.deploy.getCurrentTraffic(deployId, {
        namespace,
        env,
        gatewayApi: options.gatewayApi,
      });
      const currentReady =
        !!currentTraffic &&
        Underpost.deploy.serviceHasReadyEndpoints({
          service: `${deployId}-${env}-${currentTraffic}-service`,
          namespace,
        });
      const bootstrapTraffic = currentReady ? currentTraffic : targetTraffic;

      // Regenerates the manifests against the target colour only: `--build-manifest`
      // returns before any cluster mutation, so the workload is untouched and the
      // applies below are the whole switch.
      shellExec(
        `node bin deploy --info-router --build-manifest --traffic ${targetTraffic} --replicas ${replicas}${Underpost.namespace.flags(options)}${timeoutFlags}${imagePullPolicyFlag}${gatewayApiFlags} ${deployId} ${env}`,
      );

      const buildPath = `./engine-private/conf/${deployId}/build/${env}`;
      const trafficServicePath = `${buildPath}/traffic-service.yaml`;
      // On the first stable-Service migration, keep serving the current colour
      // while the Nginx block and HTTPRoute/HTTPProxy are replaced. Once every
      // layer references this Service, one selector update below is the switch.
      Underpost.deploy.applyTrafficService({
        deployId,
        env,
        traffic: bootstrapTraffic,
        namespace,
        manifestPath: trafficServicePath,
      });
      // A traffic switch rebuilds the underpost-gateway host blocks together
      // with the HTTPRoutes. Install and validate those blocks before publishing
      // a route that sends an intercepted site path to the shared gateway. The
      // regular deploy apply path already does this; omitting it here left Nginx
      // on its default server (or a previous environment/colour), so every such
      // request became the shared 404 page even though Envoy reported the route
      // Accepted and relayed it successfully.
      const platform = Underpost.namespace.of('platform', { environment: env, options });
      if (options.gatewayApi) {
        installGatewayConf({
          hostRoot: Underpost.deploy.underpostGatewayRootFactory(options),
          confSourceDir: Underpost.deploy.gatewayConfDirFactory({ deployId, env }),
          namespace: platform,
        });
        Underpost.ingress.applyGatewayGrant({ namespace, env, options });
      }
      for (const file of options.gatewayApi ? ['gateway.yaml', 'httproute.yaml'] : ['proxy.yaml'])
        if (fs.existsSync(`${buildPath}/${file}`) && fs.readFileSync(`${buildPath}/${file}`, 'utf8').trim())
          shellExec(`kubectl apply -f ${buildPath}/${file} -n ${namespace}`);

      // The shared front derives its Host/SNI table from the live route objects.
      // Refresh after applying them so a hostname migrating between HTTPProxy and
      // HTTPRoute reaches the stack that now owns it. This is also a no-op when
      // underpost-ingress is not installed.
      const sharedIngressUpdated = Underpost.cluster.refreshUnderpostIngress({ namespace: platform, options });
      if (sharedIngressUpdated) {
        const switchHosts = Object.keys(loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`));
        Underpost.ingress.removeInactiveHostRoutes({
          hosts: switchHosts,
          gatewayApi: options.gatewayApi,
          namespace,
        });
        Underpost.cluster.refreshUnderpostIngress({ namespace: platform, options });
      }

      if (targetTraffic !== bootstrapTraffic)
        Underpost.deploy.applyTrafficService({
          deployId,
          env,
          traffic: targetTraffic,
          namespace,
          manifestPath: trafficServicePath,
        });
      const trafficService = Underpost.deploy.trafficServiceNameFactory({ deployId, env });
      if (!Underpost.deploy.awaitServiceEndpoints({ service: trafficService, namespace })) {
        if (targetTraffic !== bootstrapTraffic)
          Underpost.deploy.applyTrafficService({
            deployId,
            env,
            traffic: bootstrapTraffic,
            namespace,
            manifestPath: trafficServicePath,
          });
        throw new Error(`Traffic Service ${trafficService} never became ready on ${targetTraffic}`);
      }

      // The gateway serves the documents of its node volume before the workload: a static site
      // (`root/site`), the status pages, the intercepted contexts. They are the build of the colour
      // that serves, so they follow the traffic here, on every switch: a sync, a promotion, a
      // revert, a failover. A copy taken before the switch is the previous colour's build.
      if (options.gatewayApi) {
        const hostRoot = Underpost.deploy.underpostGatewayRootFactory(options);
        assertStaticAssets({
          records: Underpost.deploy.syncStaticAssets(deployId, env, { ...options, namespace, versions: targetTraffic }),
          hostRoot,
          label: 'switch',
        });
      }

      const grpcServicePath = `./engine-private/conf/${deployId}/build/${env}/grpc-service.yaml`;
      if (fs.existsSync(grpcServicePath)) shellExec(`kubectl apply -f ${grpcServicePath} -n ${namespace}`);

      Underpost.host.store.set(`${deployId}-${env}-traffic`, targetTraffic);
    },

    /**
     * The nodes that receive the hostPath volume data of a resource, and that its volumes pin: the
     * explicit node, else the nodes {@link UnderpostNamespace.schedule} names for the resource, else the
     * cluster-type default: `kind-worker` for kind, this host for kubeadm and k3s. Without a cluster
     * flag, `production` is the host and any other environment kind.
     * @param {object} params
     * @param {string} [params.node=''] - Explicit node: `--node`, `--node-name`.
     * @param {string} [params.resource='workloads'] - The placed resource the volume belongs to.
     * @param {boolean} [params.kind=false] - Kind cluster context.
     * @param {boolean} [params.kubeadm=false] - Kubeadm cluster context.
     * @param {boolean} [params.k3s=false] - K3s cluster context.
     * @param {string} [params.env=''] - Deployment environment.
     * @param {boolean} [params.dev=false] - The development environment when `env` is empty.
     * @returns {string[]} The node names.
     * @memberof UnderpostDeploy
     */
    resolveDeployNodes({
      node = '',
      resource = 'workloads',
      kind = false,
      kubeadm = false,
      k3s = false,
      env = '',
      dev = false,
    } = {}) {
      const environment = env || (dev ? 'development' : 'production');
      const { nodes } = Underpost.namespace.schedule({ resource, environment, node });
      if (nodes.length) return nodes;
      return [kind || (!kubeadm && !k3s && env !== 'production') ? 'kind-worker' : os.hostname()];
    },

    /**
     * Checks a node name against the cluster and substitutes a real one when it
     * does not exist.
     *
     * {@link UnderpostDeploy.resolveDeployNodes} guesses from the environment when
     * no cluster flag is given, so `--dev` against a kubeadm cluster yields
     * `kind-worker`. For anything pinned by `nodeSelector` that guess does not
     * degrade — it simply never schedules.
     * @param {string} [node] - The chosen node name.
     * @returns {{node: string, corrected: boolean}} The name to use, and whether it had to change.
     * @memberof UnderpostDeploy
     */
    resolveSchedulableNode({ node = '' } = {}) {
      return schedulableNodeFactory({ nodes: Underpost.kubectl.get('', 'nodes'), node });
    },

    /**
     * Deploys a volume for a deployment.
     * @param {object} volume - Volume configuration.
     * @param {string} volume.claimName - Name of the persistent volume claim.
     * @param {string} volume.volumeMountPath - Mount path of the volume in the container.
     * @param {string} volume.volumeName - Name of the volume.
     * @param {object} options - Options for the volume deployment.
     * @param {string} options.deployId - Deployment ID.
     * @param {string} options.env - Environment for the deployment.
     * @param {string} options.version - Version of the deployment.
     * @param {string} [options.namespace] - The namespace of the volume claim.
     * @param {string[]} options.nodeNames - Effective target nodes ({@link UnderpostDeploy.resolveDeployNodes}). Each node receives its own copy of the volume data, and the PV pins the pods to them; none falls back to the cluster-type default.
     * @param {string} [options.clusterContext='kind'] - Cluster context type ('kind', 'kubeadm', or 'k3s').
     * @param {boolean} [options.gitClean=false] - Whether to run git clean on volumeMountPath before copying.
     * @param {string} [options.sshKeyPath=''] - Private key path used when the target node is remote and the volume is shipped over SSH. Empty uses the key of the node's peer connection ({@link UnderpostEvent.kubernetesNodeTarget}).
     * @memberof UnderpostDeploy
     */
    deployVolume(
      volume = { claimName: '', volumeMountPath: '', volumeName: '' },
      options = {
        deployId: '',
        env: '',
        version: '',
        namespace: '',
        nodeNames: [],
        clusterContext: 'kind',
        gitClean: false,
        sshKeyPath: '',
      },
    ) {
      if (!volume.claimName) {
        logger.warn('Volume claimName is required to deploy volume', volume);
        return;
      }
      const { deployId, env, version, namespace } = options;
      const clusterContext = options.clusterContext || 'kind';
      const pvcId = `${volume.claimName}-${deployId}-${env}-${version}`;
      const pvId = `${volume.claimName.replace('pvc-', 'pv-')}-${deployId}-${env}-${version}`;
      const rootVolumeHostPath = `${HOST_VOLUME_ROOT}/${pvId}`;
      if (options.gitClean && volume.volumeMountPath) {
        Underpost.repo.clean({ paths: [volume.volumeMountPath] });
      }
      // A hostPath volume holds its data on one node, and the PV pins the pods to it: the manifest refuses
      // more than one node before any data ships.
      const kind = clusterContext === 'kind';
      const dataNodes = options.nodeNames?.length ? options.nodeNames : [kind ? 'kind-worker' : os.hostname()];
      const manifest = Underpost.deploy.persistentVolumeFactory({
        hostPath: rootVolumeHostPath,
        pvcId,
        namespace,
        nodeNames: dataNodes,
      });
      for (const dataNode of dataNodes) {
        if (kind) {
          shellExec(`docker exec -i ${dataNode} bash -c "mkdir -p ${rootVolumeHostPath}"`);
          shellExec(`tar -C ${volume.volumeMountPath} -c . | docker cp - ${dataNode}:${rootVolumeHostPath}`);
          shellExec(
            `docker exec -i ${dataNode} bash -c "chown -R 1000:1000 ${rootVolumeHostPath}; chmod -R 755 ${rootVolumeHostPath}"`,
          );
          continue;
        }
        const target = Underpost.event.kubernetesNodeTarget(dataNode);
        if (target.via === 'local') {
          // The directory is created owned by the invoking user — the root above it may be
          // root-owned, and the copy that follows is unprivileged — and labeled before as well as
          // after the copy, so the files land already carrying the shared container label instead
          // of inheriting the operator home tree's.
          const { uid, gid } = os.userInfo();
          ensureContainerStorage(rootVolumeHostPath, { execute: shellExec, owner: `${uid}:${gid}` });
          fs.copySync(volume.volumeMountPath, rootVolumeHostPath);
          prepareContainerStorage(rootVolumeHostPath);
          continue;
        }
        logger.info('Shipping volume to remote node over SSH', {
          node: dataNode,
          via: target.via,
          user: target.user,
          src: volume.volumeMountPath,
          dest: rootVolumeHostPath,
        });
        if (options.sshKeyPath && options.sshKeyPath !== target.keyPath)
          logger.warn('--ssh-key-path replaces the registered key of the peer; its registered user stays', {
            node: dataNode,
            user: target.user,
            keyPath: options.sshKeyPath,
          });
        Underpost.ssh.copyDirToNode({
          host: target.host,
          port: target.port,
          user: target.user,
          keyPath: options.sshKeyPath || target.keyPath,
          localDir: volume.volumeMountPath,
          remoteDir: rootVolumeHostPath,
          // The volume is mounted on that node, so the label has to exist there.
          containerStorage: true,
        });
      }
      shellExec(`kubectl delete pvc ${pvcId} -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pv ${pvId} --ignore-not-found`);
      shellExec(`kubectl apply -f - -n ${namespace} <<'EOF'
${manifest}
EOF
`);
    },

    /**
     * Creates volume mounts and volumes for a deployment.
     * @param {Array<volume>} volumes - List of volume configurations.
     * @param {string} volume.volumeName - Name of the volume.
     * @param {string} volume.volumeMountPath - Mount path of the volume in the container.
     * @param {string} volume.volumeHostPath - Host path of the volume.
     * @param {string} volume.volumeType - Type of the volume (e.g. 'Directory').
     * @param {string|null} volume.claimName - Name of the persistent volume claim (if applicable).
     * @param {string|null} volume.configMap - Name of the config map (if applicable).
     * @param {string|null} volume.secret - Name of the Kubernetes Secret (if applicable). Mounts as readOnly.
     * @param {boolean} [volume.emptyDir=false] - If true, uses an emptyDir volume (writable tmpfs).
     * @returns {object} - Object containing the rendered volume mounts and volumes.
     * @memberof UnderpostDeploy
     */
    volumeFactory(
      volumes = [
        {
          volumeName: 'volume-name',
          volumeMountPath: '/path/in/container',
          volumeHostPath: '/path/on/host',
          volumeType: 'Directory',
          claimName: null,
          configMap: null,
          version: null,
        },
      ],
    ) {
      let _volumeMounts = `
      volumeMounts:`;
      let _volumes = `
  volumes:`;
      volumes.map((volumeData) => {
        let {
          volumeName,
          volumeMountPath,
          volumeHostPath,
          volumeType,
          claimName,
          configMap,
          secret,
          emptyDir,
          version,
        } = volumeData;
        if (version) {
          volumeName = `${volumeName}-${version}`;
          claimName = claimName ? `${claimName}-${version}` : null;
        }
        // The pod-local volume name is a DNS-1123 label (max 63 chars); the PVC
        // `claimName` it references is a subdomain (max 253) and stays verbatim.
        // Per-variant instance names append <deployId>-<env>-<traffic> and can
        // exceed 63, so clamp only the pod-local name (mount name must match it).
        const podVolumeName = k8sVolumeName(volumeName);
        _volumeMounts += `
        - name: ${podVolumeName}
          mountPath: ${volumeMountPath}
${secret ? `          readOnly: true\n` : ''}`;

        _volumes += `
    - name: ${podVolumeName}
 ${
   emptyDir
     ? `     emptyDir: {}`
     : secret
       ? `     secret:
        secretName: ${secret}`
       : configMap
         ? `     configMap:
        name: ${configMap}`
         : claimName
           ? `     persistentVolumeClaim:
        claimName: ${claimName}`
           : `     hostPath:
        path: ${volumeHostPath}
        type: ${volumeType}
`
 }

  `;
      });
      return { render: _volumeMounts + _volumes };
    },

    /**
     * Creates a persistent volume and persistent volume claim for a deployment.
     * @param {object} options - Options for the persistent volume and claim creation.
     * @param {string} options.hostPath - Host path for the persistent volume.
     * @param {string} options.pvcId - Persistent volume claim ID.
     * @param {string} [options.namespace='default'] - The namespace of the claim.
     * @param {string[]} [options.nodeNames=[]] - The node the persistent volume pins its pods to; none pins nothing.
     * @returns {string} - YAML configuration for the persistent volume and claim.
     * @throws {Error} When it names more than one node: a host path holds the data of one node.
     * @memberof UnderpostDeploy
     */
    persistentVolumeFactory({ hostPath, pvcId, namespace = 'default', nodeNames = [] }) {
      const pvId = pvcId.replace(/^pvc-/, 'pv-');
      if (nodeNames.length > 1)
        throw refusal(
          `The host path volume ${pvId} keeps what its pods write on one node, and its node group names ` +
            `${nodeNames.join(', ')}: give the group one member, or name the node with --node`,
        );
      // hostPath volumes are node-local: the PV pins the pods to the nodes that hold the data.
      const nodeAffinity = nodeNames.length
        ? `
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values:${nodeNames.map((name) => `\n                - ${name}`).join('')}`
        : '';
      return `apiVersion: v1
kind: PersistentVolume
metadata:
  name: ${pvId}
spec:
  capacity:
    storage: 5Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual${nodeAffinity}
  claimRef:
    apiVersion: v1
    kind: PersistentVolumeClaim
    name: ${pvcId}
    namespace: ${namespace}
  hostPath:
    path: ${hostPath}
    type: DirectoryOrCreate
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${pvcId}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: manual
  volumeName: ${pvId}
  resources:
    requests:
      storage: 5Gi`;
    },

    /**
     * Predefined resource templates for Kubernetes deployments.
     * @memberof UnderpostDeploy
     */
    resourcesTemplate: {
      dev_small: {
        id: 'dev_small',
        useCase: 'microservice_development',
        resources: {
          requests: {
            memory: '128Mi',
            cpu: '250m',
          },
          limits: {
            memory: '512Mi',
            cpu: '1',
          },
        },
      },
      prod_moderate: {
        id: 'prod_moderate',
        useCase: 'production_moderate',
        resources: {
          requests: {
            memory: '256Mi',
            cpu: '500m',
          },
          limits: {
            memory: '512Mi',
            cpu: '1',
          },
        },
      },
      memory_heavy: {
        id: 'memory_heavy',
        useCase: 'memory_intensive_app',
        resources: {
          requests: {
            memory: '512Mi',
            cpu: '500m',
          },
          limits: {
            memory: '1Gi',
            cpu: '1',
          },
        },
      },
      cpu_bound: {
        id: 'cpu_bound',
        useCase: 'cpu_intensive_job',
        resources: {
          requests: {
            memory: '256Mi',
            cpu: '1000m',
          },
          limits: {
            memory: '512Mi',
            cpu: '2000m',
          },
        },
      },
    },

    /**
     * Creates a resource object for Kubernetes deployments.
     * @param {object} resources - Resource specifications.
     * @param {string} resources.requestsMemory - Memory request for the container.
     * @param {string} resources.requestsCpu - CPU request for the container.
     * @param {string} resources.limitsMemory - Memory limit for the container.
     * @param {string} resources.limitsCpu - CPU limit for the container.
     * @returns {object|undefined} - Resource object for Kubernetes deployments or undefined if any resource is missing.
     * @memberof UnderpostDeploy
     */
    resourcesFactory: (
      resources = {
        resourceTemplateId: '',
        requestsMemory: '',
        requestsCpu: '',
        limitsMemory: '',
        limitsCpu: '',
      },
    ) => {
      if (resources) {
        if (resources.resourceTemplateId)
          return Underpost.deploy.resourcesTemplate[resources.resourceTemplateId].resources;
        if (resources.requestsMemory && resources.requestsCpu && resources.limitsMemory && resources.limitsCpu)
          return {
            requests: {
              memory: resources.requestsMemory,
              cpu: resources.requestsCpu,
            },
            limits: {
              memory: resources.limitsMemory,
              cpu: resources.limitsCpu,
            },
          };
      }
      return undefined;
    },

    /**
     * Extracts a non-standard `imagePullPolicy` key from an env-resolved
     * instance lifecycle block (the convention used in `conf.instances.json`,
     * where `imagePullPolicy` sits alongside `postStart`/`preStop` for
     * per-instance ergonomics) and returns a clean lifecycle hash that is
     * safe to splice into the K8S container spec.
     *
     * Returns `{ lifecycle, imagePullPolicy }`:
     *   - `lifecycle` — the input minus `imagePullPolicy`, or `undefined` when
     *     the resulting block is empty.
     *   - `imagePullPolicy` — the extracted value, or `undefined` if absent.
     *
     * @param {object|undefined} lifecycle - Env-resolved lifecycle block
     *   (already passed through {@link ServerConfBuilder.resolveEnvScoped}). May be `undefined`.
     * @returns {{ lifecycle: (object|undefined), imagePullPolicy: (string|undefined) }}
     * @memberof UnderpostDeploy
     */
    extractInstanceImagePullPolicy(lifecycle) {
      if (!lifecycle || typeof lifecycle !== 'object' || !('imagePullPolicy' in lifecycle)) {
        return { lifecycle, imagePullPolicy: undefined };
      }
      const { imagePullPolicy, ...rest } = lifecycle;
      return {
        lifecycle: Object.keys(rest).length > 0 ? rest : undefined,
        imagePullPolicy,
      };
    },

    /**
     * Generates timeout flags string for deployment commands.
     * @param {object} options - Options containing timeout settings.
     * @param {string|number} [options.timeoutResponse] - Timeout response value.
     * @param {string|number} [options.timeoutIdle] - Timeout idle value.
     * @param {string|number} [options.retryCount] - Retry count value.
     * @param {string|number} [options.retryPerTryTimeout] - Retry per try timeout value.
     * @returns {string} The timeout flags string.
     * @memberof UnderpostDeploy
     */
    timeoutFlagsFactory: (options = {}) => {
      return (
        `${options.timeoutResponse ? ` --timeout-response ${options.timeoutResponse}` : ''}` +
        `${options.timeoutIdle ? ` --timeout-idle ${options.timeoutIdle}` : ''}` +
        `${options.retryCount || options.retryCount === 0 ? ` --retry-count ${options.retryCount}` : ''}` +
        `${options.retryPerTryTimeout ? ` --retry-per-try-timeout ${options.retryPerTryTimeout}` : ''}`
      );
    },

    /**
     * The Gateway API transport flags of a spawned deploy command: its GatewayClass and its QUIC/HTTP3
     * settings. The routing provider comes from the environment of the child, never from a flag.
     * @param {object} options - Options containing the gateway settings.
     * @param {string} [options.gatewayClass] - GatewayClass name.
     * @param {boolean} [options.disableHttp3] - Disable QUIC/HTTP3.
     * @param {string|number} [options.quicPort] - Advertised QUIC port.
     * @returns {string} The gateway flags string.
     * @memberof UnderpostDeploy
     */
    gatewayApiFlagsFactory: (options = {}) => {
      return (
        `${options.gatewayClass ? ` --gateway-class ${options.gatewayClass}` : ''}` +
        `${options.disableHttp3 ? ' --disable-http3' : ''}` +
        `${options.quicPort ? ` --quic-port ${options.quicPort}` : ''}`
      );
    },
  };
}

export default UnderpostDeploy;
