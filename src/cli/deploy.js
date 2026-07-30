/**
 * Deploy module for managing the deployment of applications and services.
 * @module src/cli/deploy.js
 * @namespace UnderpostDeploy
 */

import {
  buildKindPorts,
  buildPortProxyRouter,
  buildProxyRouter,
  clusterTypeFactory,
  Config,
  cronDeployIdResolve,
  deployHostsFactory,
  deployRangePortFactory,
  gatewayApiEnabledFactory,
  getDataDeploy,
  instanceStatusPageEntriesFactory,
  loadConfInstances,
  loadConfServerJson,
  loadReplicas,
  pathPortAssignmentFactory,
  trafficFromRoutingInfoFactory,
} from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import { INTERNAL_READY_PATH, INTERNAL_HEALTH_PATH } from '../server/runtime-status.js';
import { staticContextRoutesFactory, statusPageRoutesFactory } from '../client-builder/client-build.js';
import {
  UNDERPOST_GATEWAY,
  hostServerConfFactory,
  installGatewayConf,
  underpostGatewayManifestsFactory,
  staticLocationFactory,
  statusPageAssetPathFactory,
  statusPageBuildSegment,
  syncStaticAssetFromPod,
  writeHostServerConf,
  writeStaticAsset,
} from '../server/underpost-gateway.js';
import { getCapVariableName } from '../client/components/core/CommonJs.js';
import fs from 'fs-extra';
import nodePath from 'node:path';
import dotenv from 'dotenv';
import os from 'node:os';
import crypto from 'node:crypto';
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

const GATEWAY_API_GROUP = 'gateway.networking.k8s.io';
const GATEWAY_API_GROUP_VERSION = `${GATEWAY_API_GROUP}/v1`;
// QUIC/HTTP3 listener config and direct-response status pages are the two route
// behaviours core Gateway API leaves to the implementation. Both are expressed
// through the Envoy Gateway extension group, so retargeting another Gateway API
// implementation is a change to these two constants and nothing else.
const GATEWAY_EXTENSION_GROUP = 'gateway.envoyproxy.io';
const GATEWAY_EXTENSION_GROUP_VERSION = `${GATEWAY_EXTENSION_GROUP}/v1alpha1`;
const GATEWAY_CONTROLLER_NAME = `${GATEWAY_EXTENSION_GROUP}/gatewayclass-controller`;
// The class `cluster --gateway-api` provisions and the class every generated
// Gateway references: one name, resolved through gatewayApiConfigFactory, so an
// override reaches the installer and the manifests together.
const GATEWAY_CLASS_DEFAULT = 'eg';
// Where `bin client <deployId> <env>` writes each host's bundle, including the
// SSR status views declared in conf.ssr.json (`<host><path>/<status>/index.html`).
// Engine root inside the workload container; the built PWA artifacts live under
// its `public/` tree, which is where the static edge documents are sourced from.
// A workload that is gone answers with none of these itself; Envoy or the
// gateway hop produces them, and a maintenance page is what they mean.
const UPSTREAM_FAILURE_STATUSES = [502, 503, 504];

const CONTAINER_ENGINE_ROOT = '/home/dd/engine';

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
  return `${path === '/' ? '' : path}/${process.env.BASE_API || 'api'}`;
};
const GATEWAY_DURATION_UNITS = [
  ['h', 3600000],
  ['m', 60000],
  ['s', 1000],
  ['ms', 1],
];

/**
 * Converts an HTTPProxy duration (`300000ms`, `10s`, `infinity`) into a Gateway
 * API Duration. The Gateway API grammar allows at most 5 digits per component,
 * so a value that overflows in one unit is re-expressed in a coarser one
 * (`300000ms` → `5m`); `infinity` maps to `0s`, which disables the timeout.
 * @param {string|number} value - Source duration.
 * @returns {string|null} Gateway API Duration, or null when unset/unparsable.
 */
const gatewayDurationFactory = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const raw = `${value}`.trim();
  if (raw === 'infinity' || raw === '0') return '0s';
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(raw);
  if (!match) return null;
  const factor = Object.fromEntries(GATEWAY_DURATION_UNITS)[match[2] || 'ms'];
  const ms = Math.round(parseFloat(match[1]) * factor);
  for (const [suffix, unit] of GATEWAY_DURATION_UNITS)
    if (ms % unit === 0 && ms / unit <= 99999) return `${ms / unit}${suffix}`;
  return `${Math.ceil(ms / 1000)}s`;
};

const logger = loggerFactory(import.meta);

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
    ${deploymentVersions
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
      // Explicit, secret-free internal status port injected as an env var so the
      // in-pod endpoint binds exactly what the probes and the monitor target,
      // independent of the ambient `PORT` baked into the image/secret.
      internalStatusPort,
    }) {
      if (!cmd)
        cmd =
          pullBundle || skipFullBuild
            ? [
                // When pullBundle (or skipFullBuild) is set the container pulls the pre-built client
                // bundle from Cloudinary (push-bundle must have been run on the dev machine beforehand).
                `underpost secret underpost --create-from-env`,
                `underpost start --build --run --pull-bundle --skip-full-build ${deployId} ${env}`,
              ]
            : [
                // `npm install -g npm@11.2.0`,
                // `npm install -g underpost`,
                `underpost secret underpost --create-from-env`,
                `underpost start --build --run ${deployId} ${env}`,
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
      containers:
        - name: ${deployId}-${env}-${suffix}
          image: ${containerImage}
          imagePullPolicy: ${imagePullPolicy ? imagePullPolicy : containerImage.startsWith('localhost/') ? 'Never' : 'IfNotPresent'}
          envFrom:
            - secretRef:
                name: underpost-config
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
     * @param {string} options.namespace - Kubernetes namespace for the deployment (defaults to "default").
     * @param {string} [options.versions] - Comma-separated list of versions to deploy.
     * @param {string} [options.cmd] - Custom initialization command for deploymentYamlPartsFactory (comma-separated commands).
     * @param {string} [options.timeoutResponse] - HTTPProxy per-route response timeout (e.g. "300000ms", "infinity").
     * @param {string} [options.timeoutIdle] - HTTPProxy per-route idle timeout (e.g. "10s", "infinity").
     * @param {string} [options.retryCount] - HTTPProxy per-route retry count (e.g. 3).
     * @param {string} [options.retryPerTryTimeout] - HTTPProxy per-route per-try timeout (e.g. "150ms").
     * @param {boolean} [options.disableDeploymentProxy] - Whether to disable deployment proxy route generation.
     * @param {string} [options.gatewayClass] - GatewayClass name baked into the generated `gateway.yaml`.
     * @param {boolean} [options.disableHttp3] - Omit QUIC/HTTP3 listener config and the Alt-Svc advertisement from the Gateway API manifests.
     * @param {number|string} [options.quicPort] - UDP port advertised for QUIC/HTTP3.
     * @param {string} [options.traffic] - Comma-separated active traffic colour(s) used to select which versions receive traffic (e.g. "blue", "green").
     * @param {boolean} [options.cert] - Whether to include cert-manager Certificate resources in secret.yaml (production only).
     * @param {boolean} [options.selfSigned] - Whether to include TLS block in HTTPProxy using a pre-created self-signed secret. Enables HTTPS for development without cert-manager.
     * @param {boolean} [options.skipFullBuild] - Whether to skip the full client bundle build; forwarded to deploymentYamlPartsFactory.
     * @param {boolean} [options.pullBundle] - Whether to pull the pre-built client bundle from Cloudinary; forwarded to deploymentYamlPartsFactory. Use together with skipFullBuild.
     * @param {string} [options.imagePullPolicy] - Container imagePullPolicy override (`Always`, `IfNotPresent`, `Never`); forwarded to deploymentYamlPartsFactory. Defaults to `Never` for `localhost/` images and `IfNotPresent` otherwise.
     * @param {boolean} [options.disableRuntimeProbes] - Omit internal-status HTTP probes from generated manifests. When true no readiness/liveness/startup probes are emitted.
     * @param {boolean} [options.tcpProbes] - Emit legacy TCP socket probes instead of HTTP internal-status probes (migration path).
     * @param {string} [options.node] - Explicit target node for hostPath PV nodeAffinity pinning; resolved through {@link UnderpostDeploy.resolveDeployNode} together with the cluster flags.
     * @param {boolean} [options.kind] - Kind cluster context; affects the cluster-type node default when no explicit node is set.
     * @param {boolean} [options.kubeadm] - Kubeadm cluster context; affects the cluster-type node default when no explicit node is set.
     * @param {boolean} [options.k3s] - K3s cluster context; affects the cluster-type node default when no explicit node is set.
     * @returns {Promise<void>} - Promise that resolves when the manifest is built.
     * @memberof UnderpostDeploy
     */
    async buildManifest(deployList, env, options) {
      const replicas = options.replicas;
      const image = options.image;
      if (!options.namespace) options.namespace = 'default';

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        const confServer = loadReplicas(
          deployId,
          loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
        );
        const router = await Underpost.deploy.routerFactory(deployId, env);
        const pathPortAssignmentData = await pathPortAssignmentFactory(deployId, router, confServer);
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
        // Opt out with `--disable-runtime-probes` to keep legacy probe-less pods.
        const internalPort = fromPort - 1;
        const probes = options.disableRuntimeProbes
          ? {}
          : Underpost.deploy.runtimeProbesFactory({ port: internalPort, useHttp: !options.tcpProbes });

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
    namespace: options.namespace,
    cmd: options.cmd ? options.cmd.split(',').map((c) => c.trim()) : undefined,
    skipFullBuild: options.skipFullBuild,
    pullBundle: options.pullBundle,
    imagePullPolicy: options.imagePullPolicy,
    internalStatusPort: options.disableRuntimeProbes ? undefined : internalPort,
    readinessProbe: probes.readinessProbe,
    livenessProbe: probes.livenessProbe,
    startupProbe: probes.startupProbe,
  })
  .replace('{{ports}}', buildKindPorts(fromPort, toPort))}
`;
        }
        fs.writeFileSync(`./engine-private/conf/${deployId}/build/${env}/deployment.yaml`, deploymentYamlParts, 'utf8');

        Underpost.deploy.buildGrpcServiceManifest({
          deployId,
          env,
          confServer,
          namespace: options.namespace,
          traffic: options.traffic && typeof options.traffic === 'string' ? options.traffic.split(',') : ['blue'],
        });

        const confVolume = fs.existsSync(`./engine-private/conf/${deployId}/conf.volume.json`)
          ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.volume.json`, 'utf8'))
          : [];
        if (confVolume.length > 0) {
          // Mirror deployVolume's data-node resolution so the generated manifest
          // pins the PV to the same node that physically receives the volume data.
          const pvDataNode = Underpost.deploy.resolveDeployNode({
            node: options.node,
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
              const hostPath = `/home/dd/engine/volume/${pvId}`;
              volumeYaml += `---\n${Underpost.deploy.persistentVolumeFactory({
                pvcId,
                namespace: options.namespace,
                hostPath,
                nodeName: pvDataNode,
              })}\n`;
            }
          }
          fs.writeFileSync(`./engine-private/conf/${deployId}/build/${env}/pv-pvc.yaml`, volumeYaml, 'utf8');
        }

        let proxyYaml = '';
        let secretYaml = '';
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
        const { altSvc, http3, gatewayClassName } = Underpost.deploy.gatewayApiConfigFactory(options);
        // Node directory backing the static utility's volume; documents are
        // placed here rather than in the cluster's object store, which is what
        // lifts the size ceiling entirely.
        const staticHostRoot = Underpost.deploy.underpostGatewayRootFactory(options);
        // Contexts routed to the gateway. Status pages are absent by design: they
        // are reached by interception only, never as a destination.
        const edgeRouteRecords = [];
        // Per-host proxy routes contributed to the shared gateway's own config.
        const gatewayRoutesByHost = {};
        // Every host attaches to one Gateway. Its HTTPS listener carries every
        // certificate and Envoy picks by SNI, so there are two listeners in
        // total instead of two per hostname.
        const gatewayName = Underpost.deploy.gatewayNameFactory({ deployId, env });
        const gatewayHosts = [];

        for (const host of Object.keys(confServer)) {
          if (env === 'production' && options.cert === true)
            secretYaml += Underpost.deploy.buildCertManagerCertificate({ host, namespace: options.namespace });

          const pathPortAssignment = pathPortAssignmentData[host];
          // logger.info('', { host, pathPortAssignment });
          let _proxyYaml = Underpost.deploy.baseProxyYamlFactory({ host, env, options });
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
                deployId,
                env,
                port,
                deploymentVersions,
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
                routeRules += Underpost.deploy.httpRouteRuleFactory({
                  path: edgeRoute.routePath,
                  // Onto the directory, not the document: one rule then covers
                  // the page and any asset beside it, which is exactly what the
                  // static utility's `try_files $uri $uri/index.html` resolves.
                  replacePrefixMatch: edgeRoute.dir,
                  serviceId: UNDERPOST_GATEWAY.serviceName,
                  port: UNDERPOST_GATEWAY.port,
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
              // workload errors or is gone. The API path is routed straight to
              // the workload instead: its errors are its own contract, and a
              // client parsing JSON must not receive an HTML page.
              const intercepted = interceptStatuses.length > 0;
              if (intercepted && apiPathFactory({ confServer, host, path }))
                routeRules += Underpost.deploy.httpRouteRuleFactory({
                  path: apiPathFactory({ confServer, host, path }),
                  deployId,
                  env,
                  port,
                  deploymentVersions,
                  timeoutPolicy: globalTimeoutPolicy,
                  retryPolicy: globalRetryPolicy,
                  altSvc: http3 ? altSvc : undefined,
                });
              routeRules += Underpost.deploy.httpRouteRuleFactory({
                path,
                ...(intercepted
                  ? { serviceId: UNDERPOST_GATEWAY.serviceName, port: UNDERPOST_GATEWAY.port }
                  : { deployId, env, port, deploymentVersions }),
                timeoutPolicy: globalTimeoutPolicy,
                retryPolicy: globalRetryPolicy,
                altSvc: http3 ? altSvc : undefined,
              });
              gatewayRoutesByHost[host] = (gatewayRoutesByHost[host] || []).concat(
                intercepted
                  ? {
                      path,
                      upstream: `${deployId}-${env}-${deploymentVersions[0]}-service:${port}`,
                      statuses: interceptStatusesFactory(
                        Underpost.deploy.edgeRouteEntriesFactory({ confServer, confSSR, host, path }),
                      ),
                    }
                  : [],
              );
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
              routeRules += Underpost.deploy.httpRouteRuleFactory({
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
            httpRouteYaml += Underpost.deploy.httpRouteYamlFactory({
              host,
              options,
              rules: routeRules,
              parentName: gatewayName,
            });
          }
        }
        if (gatewayHosts.length > 0) {
          // Instance hostnames belong on this Gateway's certificate list even
          // though their routes are applied later by `instance-promote`: one
          // Gateway terminates every hostname the deploy serves, and a hostname
          // with no certificate here has no TLS filter chain to be reached
          // through. A per-host Gateway is not the alternative — a
          // hostname-scoped listener beside this hostname-less one is the
          // ambiguity the consolidation exists to remove.
          gatewayYaml += Underpost.deploy.gatewayYamlFactory({
            name: gatewayName,
            hosts: [...new Set([...gatewayHosts, ...deployHostsFactory(deployId).filter((host) => !confServer[host])])],
            env,
            options,
          });
          gatewayYaml += Underpost.deploy.clientTrafficPolicyYamlFactory({
            name: gatewayName,
            sectionName: 'https',
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
              namespace: options.namespace || 'default',
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
        });
        if (env === 'production') {
          const yamlPath = `./engine-private/conf/${deployId}/build/${env}/secret.yaml`;
          fs.writeFileSync(yamlPath, secretYaml, 'utf8');
        } else {
          const deploymentsFiles = [
            'Dockerfile',
            'proxy.yaml',
            'gateway.yaml',
            'httproute.yaml',
            'deployment.yaml',
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
     * Builds and writes a gRPC ClusterIP service YAML for a deployment.
     * Scans conf.server.json for gRPC ports and emits grpc-service.yaml under
     * `engine-private/conf/<deployId>/build/<env>/`. The selector always uses the
     * explicit `app: <deployId>-<env>-<traffic>` label to target only the active
     * colour (blue or green).
     * @param {string} deployId - Deployment ID.
     * @param {string} env - Environment ('development' or 'production').
     * @param {object} confServer - Parsed conf.server.json content.
     * @param {string} [namespace='default'] - Kubernetes namespace.
     * @param {string[]} [traffic=['blue']] - Active traffic colour(s) ('blue', 'green', or both).
     * @param {string|null} [host=null] - Specific host to scan for gRPC ports. If null, all hosts are scanned.
     * @returns {string|null} - Path to the written YAML file, or null if no gRPC ports found.
     * @memberof UnderpostDeploy
     */
    buildGrpcServiceManifest({ deployId, env, confServer, namespace = 'default', traffic = ['blue'], host = null }) {
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
      let grpcServiceYaml = '';
      for (const color of traffic) {
        const grpcServiceName = `${deployId}-grpc-service-${env}-${color}`;
        const selectorYaml = `app: ${deployId}-${env}-${color}`;
        grpcServiceYaml += `---
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
      }
      const yamlPath = `./engine-private/conf/${deployId}/build/${env}/grpc-service.yaml`;
      fs.writeFileSync(yamlPath, grpcServiceYaml, 'utf8');
      return yamlPath;
    },
    /**
     * Builds a Certificate resource for a host using cert-manager.
     * @param {string} host - Hostname for which the certificate is being built.
     * @param {string} namespace - Kubernetes namespace for the certificate.
     * @returns {string} - Certificate resource YAML for the specified host.
     * @memberof UnderpostDeploy
     */
    buildCertManagerCertificate({ host, namespace }) {
      return `
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${host}
  namespace: ${namespace}
spec:
  commonName: ${host}
  dnsNames:
    - ${host}
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  secretName: ${host}`;
    },
    /**
     * Retrieves the current traffic status for a deployment.
     * @param {string} deployId - Deployment ID for which the traffic status is being retrieved.
     * @param {object} options - Options for the traffic retrieval.
     * @param {string} options.hostTest - Hostname to test for traffic status.
     * @param {string} options.namespace - Kubernetes namespace for the deployment.
     * @param {boolean} [options.gatewayApi] - Force the Gateway API stack; on by default unless `disableGatewayApi` is set.
     * @param {boolean} [options.disableGatewayApi] - Read the colour from the Contour HTTPProxy instead of the Gateway API HTTPRoute.
     * @param {string} [options.underpostGatewayRoot] - Node directory backing the gateway volume, where an intercepted host's colour lives.
     * @returns {string|null} - Current traffic status ('blue' or 'green') or null if not found.
     * @memberof UnderpostDeploy
     */
    getCurrentTraffic(deployId, options = { hostTest: '', namespace: '', env: '' }) {
      if (!options.namespace) options.namespace = 'default';
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
     * @param {string} host - Hostname whose routing is read.
     * @param {object} [options] - Options carrying namespace, gateway stack and gateway root.
     * @returns {string} Route object YAML and Nginx block, concatenated; empty when neither exists.
     * @memberof UnderpostDeploy
     */
    readHostRoutingInfo({ host, options = {} }) {
      const namespace = options.namespace || 'default';
      // A missing route object is the canonical "no traffic colour set yet"
      // state for blue/green rollouts. silentOnError swallows kubectl's NotFound
      // exit so the caller sees empty text rather than a throw.
      const kind = gatewayApiEnabledFactory(options) ? 'HTTPRoute' : 'HTTPProxy';
      const routeInfo = shellExec(`sudo kubectl get ${kind}/${host} -n ${namespace} -o yaml`, {
        silent: true,
        stdout: true,
        silentOnError: true,
      });
      const gatewayConfPath = nodePath.join(
        Underpost.deploy.underpostGatewayRootFactory(options),
        UNDERPOST_GATEWAY.confDir,
        `${host}.conf`,
      );
      const gatewayInfo = fs.existsSync(gatewayConfPath) ? fs.readFileSync(gatewayConfPath, 'utf8') : '';
      return `${routeInfo || ''}\n${gatewayInfo}`;
    },

    /**
     * Creates a base YAML configuration for an HTTPProxy resource.
     * @param {string} host - Hostname for which the HTTPProxy is being created.
     * @param {string} env - Environment for which the HTTPProxy is being created.
     * @param {object} options - Options for the HTTPProxy creation.
     * @param {string} options.namespace - Kubernetes namespace for the HTTPProxy.
     * @returns {string} - Base YAML configuration for the HTTPProxy resource.
     * @memberof UnderpostDeploy
     */
    baseProxyYamlFactory({ host, env, options }) {
      const includeTls = env !== 'development' || options.selfSigned === true;
      return `
---
apiVersion: projectcontour.io/v1
kind: HTTPProxy
metadata:
  name: ${host}
  namespace: ${options.namespace}
spec:
  virtualhost:
    fqdn: ${host}${
      includeTls
        ? `
    tls:
      secretName: ${host}`
        : ''
    }
  routes:`;
    },

    /**
     * Resolves the Gateway API transport settings shared by every generated
     * Gateway and HTTPRoute: the gateway class, whether QUIC/HTTP3 is enabled,
     * the UDP port QUIC is served on, and the `Alt-Svc` value that advertises
     * it. Single source of truth — no other factory reads these options.
     * @param {object} [options] - Deploy/run options.
     * @param {string} [options.gatewayClass] - GatewayClass name (env: UNDERPOST_GATEWAY_CLASS, default `contour`).
     * @param {boolean} [options.disableHttp3] - Disables QUIC/HTTP3 listener config and `Alt-Svc` advertisement.
     * @param {number|string} [options.quicPort] - UDP port QUIC is served on (env: UNDERPOST_QUIC_PORT, default 443).
     * @param {number|string} [options.altSvcMaxAge] - `Alt-Svc` max-age in seconds (default 86400).
     * @returns {{ gatewayClassName: string, http3: boolean, quicPort: number, altSvc: string }} Resolved config.
     * @memberof UnderpostDeploy
     */
    gatewayApiConfigFactory(options = {}) {
      const quicPort = parseInt(options.quicPort || process.env.UNDERPOST_QUIC_PORT || 443, 10);
      return {
        gatewayClassName: options.gatewayClass || process.env.UNDERPOST_GATEWAY_CLASS || GATEWAY_CLASS_DEFAULT,
        http3: options.disableHttp3 !== true,
        quicPort,
        altSvc: `h3=":${quicPort}"; ma=${parseInt(options.altSvcMaxAge || 86400, 10)}`,
      };
    },

    /**
     * Creates the cluster-scoped Gateway API provisioning objects: the
     * GatewayClass every generated Gateway attaches to, and the EnvoyProxy that
     * decides how the data plane is reachable from outside the cluster.
     *
     * Exposure differs by environment because the access path does:
     *   - development — the node *is* the operator's machine, so Envoy binds the
     *     listener ports on the host network. With the `/etc/hosts` entries the
     *     `cluster` runner writes, `https://<host>` resolves to 127.0.0.1 and
     *     reaches the gateway directly, and QUIC gets UDP/443 for free.
     *   - production — NodePort, mirroring the ports the Contour envoy service
     *     already publishes (`manifests/envoy-service-nodeport.yaml`).
     * @param {string} env - `development` | `production`.
     * @param {object} [options] - Deploy/run options (gateway class override).
     * @returns {string} GatewayClass + EnvoyProxy YAML.
     * @memberof UnderpostDeploy
     */
    gatewayClassYamlFactory({ env, options = {} }) {
      const { gatewayClassName } = Underpost.deploy.gatewayApiConfigFactory(options);
      const namespace = 'envoy-gateway-system';
      const hostBound = env === 'development';
      // `hostNetwork` is not a field of EnvoyProxy's KubernetesPodSpec — the
      // deployment `patch` (StrategicMerge) is the supported way to set plain
      // PodSpec fields. `dnsPolicy` must move with it: on the host network the
      // pod would otherwise inherit the node's resolv.conf and lose the cluster
      // DNS it needs to reach the xDS control plane.
      //
      // `useListenerPortAsContainerPort: true` stops Envoy Gateway remapping
      // privileged ports into the ephemeral range, which is what puts 80/443 on
      // the host — and by its own contract requires CAP_NET_BIND_SERVICE. The
      // development profile also runs Envoy as root: ambient capabilities are
      // not expressible in a Kubernetes securityContext, so a non-root process
      // cannot reliably hold that capability. Production keeps the hardened
      // upstream defaults and is reached through NodePort instead.
      const developmentProvider = `
      useListenerPortAsContainerPort: true
      envoyDeployment:
        patch:
          type: StrategicMerge
          value:
            spec:
              template:
                spec:
                  hostNetwork: true
                  dnsPolicy: ClusterFirstWithHostNet
        container:
          securityContext:
            runAsNonRoot: false
            runAsUser: 0
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
              add:
                - NET_BIND_SERVICE
      envoyService:
        type: ClusterIP`;
      const productionProvider = `
      useListenerPortAsContainerPort: false
      envoyService:
        type: NodePort`;
      return `
---
apiVersion: ${GATEWAY_EXTENSION_GROUP_VERSION}
kind: EnvoyProxy
metadata:
  name: ${gatewayClassName}-proxy-config
  namespace: ${namespace}
spec:
  # A deploy's hosts share one Gateway, but a cluster can hold more than one
  # deploy — and each Gateway would otherwise be provisioned its own data plane,
  # every one contending for the same node ports, so at most one could bind and
  # the rest would crash-loop. Merging collapses them onto a single Envoy fleet.
  # It is safe now that listeners are consolidated: the merge key is
  # (port, protocol, hostname), and a deploy contributes exactly one HTTP and
  # one HTTPS listener instead of a pair per hostname.
  mergeGateways: true
  provider:
    type: Kubernetes
    kubernetes:${hostBound ? developmentProvider : productionProvider}
---
apiVersion: ${GATEWAY_API_GROUP_VERSION}
kind: GatewayClass
metadata:
  name: ${gatewayClassName}
spec:
  controllerName: ${GATEWAY_CONTROLLER_NAME}
  parametersRef:
    group: ${GATEWAY_EXTENSION_GROUP}
    kind: EnvoyProxy
    name: ${gatewayClassName}-proxy-config
    namespace: ${namespace}
`;
    },

    /**
     * Provisions the self-signed TLS secret a host is served with when
     * cert-manager is not in play (development, and `instance-promote --tls
     * --test`). `scripts/ssl.sh` generates the pair through mkcert — which also
     * installs its root CA into the system and NSS trust stores, so the browser
     * trusts the certificate without a warning — and falls back to OpenSSL.
     *
     * The secret is deleted before being recreated so a re-run always ends with
     * the key pair on disk, and is named after the host because that is the
     * `secretName` both the HTTPProxy virtualhost and the Gateway listener
     * reference.
     * @param {string} host - Hostname to issue the certificate for.
     * @param {string} [namespace] - Kubernetes namespace.
     * @param {string} [underpostRoot] - Repo root holding `scripts/ssl.sh`.
     * @returns {{ sslDir: string, certPath: string, keyPath: string }} Generated artifact paths.
     * @memberof UnderpostDeploy
     */
    selfSignedTlsSecretFactory({ host, namespace = 'default', underpostRoot = '.' }) {
      const sslDir = `./engine-private/ssl/${host}`;
      const nameSafe = host.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const certPath = `${sslDir}/${nameSafe}.pem`;
      const keyPath = `${sslDir}/${nameSafe}-key.pem`;
      fs.mkdirpSync(sslDir);
      shellExec(`bash ${underpostRoot}/scripts/ssl.sh "${sslDir}" "${host}"`);
      shellExec(`kubectl delete secret ${host} -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl create secret tls ${host} --cert="${certPath}" --key="${keyPath}" -n ${namespace}`);
      logger.info('Self-signed TLS secret created', { host, namespace, certPath, keyPath });
      return { sslDir, certPath, keyPath };
    },

    /**
     * Creates the one Gateway a deploy's HTTPRoutes attach to.
     *
     * Its listeners carry no hostname: a single listener per protocol serves
     * every hostname and picks the certificate by SNI. The alternative — a
     * Gateway per host, with the hostname on its listener — cannot stand beside
     * it. `mergeGateways` collapses every Gateway of the class onto one listener
     * per (port, protocol), so on 80 the hostname-scoped listener is dropped
     * outright and on 443 it keeps an SNI filter chain whose route table is left
     * empty. Both report Programmed while every path on that hostname answers
     * 404, which is why the shape is not offered.
     *
     * The HTTPS listener is emitted under the same TLS rules as the HTTPProxy
     * virtualhost (production, or development with `--self-signed`); QUIC is
     * only wired when that listener exists, since HTTP/3 has no cleartext
     * transport.
     * @param {string} name - Gateway name, from {@link UnderpostDeploy.gatewayNameFactory}.
     * @param {Array<string>} hosts - Every hostname the deploy terminates; each becomes a certificate ref.
     * @param {string} env - `development` | `production`.
     * @param {object} [options] - Deploy/run options (namespace, gateway/QUIC settings, selfSigned).
     * @returns {string} Gateway YAML.
     * @memberof UnderpostDeploy
     */
    gatewayYamlFactory({ hosts = [], name, env, options = {} }) {
      const namespace = options.namespace || 'default';
      const { gatewayClassName } = Underpost.deploy.gatewayApiConfigFactory(options);
      const includeTls = env !== 'development' || options.selfSigned === true;
      const allowedRoutes = `      allowedRoutes:
        namespaces:
          from: Same`;
      return `
---
apiVersion: ${GATEWAY_API_GROUP_VERSION}
kind: Gateway
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  gatewayClassName: ${gatewayClassName}
  listeners:
    - name: http
      protocol: HTTP
      port: 80
${allowedRoutes}${
        includeTls
          ? `
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
${hosts
  .map(
    (tlsHost) => `          - group: ""
            kind: Secret
            name: ${tlsHost}`,
  )
  .join('\n')}
${allowedRoutes}`
          : ''
      }
`;
    },

    /**
     * Name of the Gateway a deploy's hosts share. One Gateway with one listener
     * per protocol replaces one Gateway per host: the merged listener set drops
     * from two per hostname to two in total, which is what removes the
     * collisions that left hostnames without a TLS filter chain or a route.
     * @param {string} deployId - Deploy id.
     * @param {string} env - `development` | `production`.
     * @returns {string} Gateway name.
     * @memberof UnderpostDeploy
     */
    gatewayNameFactory({ deployId, env }) {
      return `${deployId}-${env}`;
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
     * Creates the QUIC/HTTP3 ClientTrafficPolicy for the merged data plane.
     *
     * Emitted **once per manifest**, not once per Gateway. A ClientTrafficPolicy
     * configures the Envoy listener, and `mergeGateways` collapses every
     * Gateway of the class onto one shared listener set — so one policy per host
     * means N policies competing to configure the same listener. The
     * implementation resolves that by letting the oldest win and rejecting the
     * rest, which leaves the merged TLS listener carrying a single hostname's
     * filter chain: the first host serves HTTPS and every other one is reset
     * mid-handshake, while all Gateways still report Programmed with their
     * listeners Accepted.
     * @param {string} name - Gateway the policy attaches to, from {@link UnderpostDeploy.gatewayNameFactory}.
     * @param {string} sectionName - Listener the policy scopes itself to.
     * @param {string} env - `development` | `production`.
     * @param {object} [options] - Deploy/run options (namespace, QUIC settings).
     * @returns {string} ClientTrafficPolicy YAML, or an empty string when HTTP/3 has no TLS transport.
     * @memberof UnderpostDeploy
     */
    clientTrafficPolicyYamlFactory({ name, sectionName, env, options = {} }) {
      const namespace = options.namespace || 'default';
      const { http3 } = Underpost.deploy.gatewayApiConfigFactory(options);
      const includeTls = env !== 'development' || options.selfSigned === true;
      if (!includeTls || !http3) return '';
      // Scoped to the HTTPS section, not the whole Gateway. QUIC only concerns
      // the TLS listener, and an unscoped policy is applied to every listener of
      // the merged set — including the plain-HTTP ones, which the implementation
      // rejects outright ("applied to multiple http (non https) listeners on the
      // same port"), leaving HTTP/3 silently off.
      //
      // One policy, because there is one HTTPS listener. Per-host listeners needed
      // a policy each, and those policies fought over the merged 443 listener
      // until only one hostname kept a TLS filter chain; consolidating the
      // listeners removes the contention rather than managing it.
      return `
---
apiVersion: ${GATEWAY_EXTENSION_GROUP_VERSION}
kind: ClientTrafficPolicy
metadata:
  name: ${name}-http3
  namespace: ${namespace}
spec:
  targetRefs:
    - group: ${GATEWAY_API_GROUP}
      kind: Gateway
      name: ${name}
      sectionName: ${sectionName}
  http3: {}
`;
    },

    /**
     * Renders one HTTPRoute rule. Websockets need no opt-in here (unlike the
     * HTTPProxy `enableWebsockets` flag) — Gateway API forwards the upgrade by
     * default. A rule carrying `extensionRef` short-circuits at the gateway and
     * therefore emits no backendRefs.
     *
     * The HTTPProxy `timeoutPolicy.idle` has no Gateway API rule-level
     * equivalent (idle timeouts are listener/backend scoped) and is dropped.
     * @param {string} path - Match value.
     * @param {string} [matchType] - `PathPrefix` (default) | `Exact`.
     * @param {number} [port] - Backend service port.
     * @param {string} [deployId] - Deployment id used to derive the service name.
     * @param {string} [env] - Environment used to derive the service name.
     * @param {Array<string>} [deploymentVersions] - Traffic colours; the first carries all weight.
     * @param {string} [serviceId] - Explicit backend service name (overrides the derived one).
     * @param {Array<object>} [pathRewritePolicy] - HTTPProxy-shaped prefix rewrite, mapped to ReplacePrefixMatch.
     * @param {string} [replaceFullPath] - Rewrites the request to a fixed path (a single static document).
     * @param {string} [replacePrefixMatch] - Rewrites the matched prefix onto a static directory, so the
     *   document and everything beside it resolve through one rule.
     * @param {object} [extensionRef] - `{ group, kind, name }` of a direct-response filter.
     * @param {object} [timeoutPolicy] - `{ response }` mapped to Gateway API timeouts.
     * @param {object} [retryPolicy] - `{ count, perTryTimeout }` mapped to retry.attempts / timeouts.backendRequest.
     * @param {string} [altSvc] - `Alt-Svc` value advertising the QUIC endpoint.
     * @returns {string} Rule YAML (indented for `spec.rules`).
     * @memberof UnderpostDeploy
     */
    httpRouteRuleFactory({
      path,
      matchType = 'PathPrefix',
      port,
      deployId,
      env,
      deploymentVersions = ['blue'],
      serviceId,
      pathRewritePolicy,
      replaceFullPath,
      replacePrefixMatch,
      extensionRef,
      timeoutPolicy,
      retryPolicy,
      altSvc,
    }) {
      const lines = [
        `    - matches:`,
        `        - path:`,
        `            type: ${matchType}`,
        `            value: ${path}`,
      ];
      const filters = [];
      const prefixRewrite =
        replacePrefixMatch ?? (pathRewritePolicy?.length ? pathRewritePolicy[0].replacement : undefined);
      if (replaceFullPath || prefixRewrite) {
        filters.push(`        - type: URLRewrite`, `          urlRewrite:`, `            path:`);
        if (replaceFullPath)
          filters.push(`              type: ReplaceFullPath`, `              replaceFullPath: ${replaceFullPath}`);
        else
          filters.push(`              type: ReplacePrefixMatch`, `              replacePrefixMatch: ${prefixRewrite}`);
      }
      if (extensionRef)
        filters.push(
          `        - type: ExtensionRef`,
          `          extensionRef:`,
          `            group: ${extensionRef.group}`,
          `            kind: ${extensionRef.kind}`,
          `            name: ${extensionRef.name}`,
        );
      if (altSvc)
        filters.push(
          `        - type: ResponseHeaderModifier`,
          `          responseHeaderModifier:`,
          `            set:`,
          `              - name: Alt-Svc`,
          `                value: '${altSvc}'`,
        );
      if (filters.length > 0) lines.push(`      filters:`, ...filters);

      const timeouts = [];
      const request = gatewayDurationFactory(timeoutPolicy?.response);
      const backendRequest = gatewayDurationFactory(retryPolicy?.perTryTimeout ?? timeoutPolicy?.response);
      if (request) timeouts.push(`        request: ${request}`);
      if (backendRequest) timeouts.push(`        backendRequest: ${backendRequest}`);
      if (timeouts.length > 0) lines.push(`      timeouts:`, ...timeouts);

      const attempts = parseInt(retryPolicy?.count, 10);
      if (!isNaN(attempts)) lines.push(`      retry:`, `        attempts: ${attempts}`);

      // A backend is declared even for a rule the direct-response filter
      // short-circuits: the filter answers before the backend is ever dialled,
      // but a rule that resolves to nothing at all risks the whole route being
      // rejected — which takes every other path on that hostname down with it,
      // and shows up only as a bare 404 from the gateway.
      if (port !== undefined && (serviceId || deployId)) {
        lines.push(`      backendRefs:`);
        for (const [i, version] of deploymentVersions.entries())
          lines.push(
            `        - name: ${serviceId ? serviceId : `${deployId}-${env}-${version}-service`}`,
            `          port: ${port}`,
            `          weight: ${i === 0 ? 100 : 0}`,
          );
      }
      return `${lines.join('\n')}\n`;
    },

    /**
     * Wraps rendered rules in an HTTPRoute attached to the host Gateway. The
     * object is named after the host, exactly like the HTTPProxy it mirrors, so
     * an apply of a per-instance fragment replaces the host route set the same
     * way — the complete multi-instance set is assembled by `instance-promote`.
     * @param {string} host - Hostname (Gateway name and route hostname).
     * @param {object} options - Deploy/run options (namespace).
     * @param {string} rules - Rendered rules from {@link UnderpostDeploy.httpRouteRuleFactory}.
     * @param {string} [name] - Route name override.
     * @param {string} [parentName] - Gateway the route attaches to; defaults to the host's own Gateway.
     * @returns {string} HTTPRoute YAML, or an empty string when there are no rules.
     * @memberof UnderpostDeploy
     */
    httpRouteYamlFactory({ host, options = {}, rules, name, parentName }) {
      if (!rules || !rules.trim()) return '';
      const namespace = options.namespace || 'default';
      return `
---
apiVersion: ${GATEWAY_API_GROUP_VERSION}
kind: HTTPRoute
metadata:
  name: ${name || host}
  namespace: ${namespace}
spec:
  parentRefs:
    - group: ${GATEWAY_API_GROUP}
      kind: Gateway
      name: ${parentName || host}
      namespace: ${namespace}
  hostnames:
    - ${host}
  rules:
${rules}`;
    },

    /**
     * Node directory backing the static utility's volume, following the same
     * `/home/dd/engine/volume/<pv>` convention as every other hostPath volume.
     * @param {object} [options] - Deploy/run options.
     * @returns {string} Absolute host path.
     * @memberof UnderpostDeploy
     */
    underpostGatewayRootFactory(options = {}) {
      return options.underpostGatewayRoot || `/home/dd/engine/volume/${UNDERPOST_GATEWAY.volumeName}`;
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
      const namespace = options.namespace || 'default';
      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      const confSSRPath = `./engine-private/conf/${deployId}/conf.ssr.json`;
      if (!fs.existsSync(confServerPath) || !fs.existsSync(confSSRPath)) {
        logger.warn('No conf.server.json / conf.ssr.json; nothing to sync', { deployId, confServerPath });
        return [];
      }
      const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
      const confSSR = JSON.parse(fs.readFileSync(confSSRPath, 'utf8'));
      const hostRoot = Underpost.deploy.underpostGatewayRootFactory(options);
      const version = (options.versions && `${options.versions}`.split(',')[0]) || 'blue';
      const podName = Underpost.kubectl
        .get(`${deployId}-${env}-${version}`, 'pods', namespace)
        .find((pod) => pod.NAME?.startsWith(`${deployId}-${env}-${version}-`) && pod.STATUS === 'Running')?.NAME;
      const synced = [];
      for (const host of Object.keys(confServer))
        for (const path of Object.keys(confServer[host]))
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
      return underpostGatewayManifestsFactory({
        namespace: options.namespace || 'default',
        hostPath: Underpost.deploy.underpostGatewayRootFactory(options),
        nodeName: Underpost.deploy.resolveDeployNode(options),
        resolver: Underpost.deploy.clusterDnsFactory(),
      });
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
     * Renders the HTTPRoute rules that serve an instance's status pages at the
     * gateway. Each declared page gets a canonical route under the instance's
     * own sub-path (`/404`, `/FOREST/404`), so a status document is reachable
     * and cacheable per instance without ever reaching the workload.
     *
     * With `catchAll`, the same filter is additionally bound to `/`. That rule
     * is only ever requested by the host assembly when no instance claims the
     * root path — two rules with identical matches would otherwise make gateway
     * precedence ambiguous.
     * @param {string} deployId - Instance-scoped deploy id.
     * @param {string} basePath - The instance's URL sub-path.
     * @param {Array<object>} statusPages - `customStatusPages` entries.
     * @param {string} [altSvc] - `Alt-Svc` value advertising the QUIC endpoint.
     * @param {boolean} [catchAll] - Also bind the first page (404 when present) to `/`.
     * @param {string} [host] - Hostname the documents were placed under; falls back to `deployId`.
     * @param {Array<string>} [servedStatuses] - Statuses whose document reached the static tree. Undefined means "all declared".
     * @returns {string} Rule YAML.
     * @memberof UnderpostDeploy
     */
    statusPageRouteRulesFactory({
      deployId,
      basePath = '/',
      statusPages = [],
      altSvc,
      catchAll = false,
      host,
      servedStatuses,
    }) {
      // Only statuses whose document was actually placed in the static tree get
      // a rule; a rewrite to a missing file would answer with the shared default
      // page instead of the host's own.
      const pages = statusPages.filter(
        (page) =>
          page?.status && page?.hostPath && (servedStatuses === undefined || servedStatuses.includes(`${page.status}`)),
      );
      if (pages.length === 0) return '';
      const prefix = !basePath || basePath === '/' ? '' : basePath.replace(/\/$/, '');
      // Served by the static utility rather than carried in the gateway config:
      // a rendered page is far past the direct-response ceiling, and exceeding
      // it fails the whole route.
      const location = (status) => statusPageAssetPathFactory({ host: host || deployId, path: basePath, status });
      const staticRule = (path, rewrite) =>
        Underpost.deploy.httpRouteRuleFactory({
          path,
          ...rewrite,
          serviceId: UNDERPOST_GATEWAY.serviceName,
          port: UNDERPOST_GATEWAY.port,
          altSvc,
        });
      let rules = '';
      // Canonical routes rewrite onto the directory so assets beside the
      // document resolve too; the catch-all cannot, because a prefix rewrite of
      // `/` would carry the rest of the request path into the target.
      for (const page of pages)
        rules += staticRule(`${prefix}/${page.status}`, { replacePrefixMatch: location(page.status).dir });
      if (catchAll) {
        const fallback = pages.find((page) => `${page.status}` === '404') || pages[0];
        rules += staticRule('/', { replaceFullPath: location(fallback.status).url });
      }
      return rules;
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
     * @param {boolean} options.expose - Whether to expose the deployment.
     * @param {boolean} options.cert - Whether to create cert-manager Certificate resources for the deployment.
     * @param {string} options.certHosts - Comma-separated list of hosts for which to create cert-manager certificates.
     * @param {boolean} options.selfSigned - Use a pre-created self-signed TLS secret instead of cert-manager. The secret must already exist in the namespace with the same name as the host. Enables TLS in the Contour HTTPProxy virtualhost without requiring a production ClusterIssuer.
     * @param {string} options.versions - Comma-separated list of versions to deploy.
     * @param {string} options.image - Docker image for the deployment.
     * @param {string} options.traffic - Traffic status for the deployment.
     * @param {string} options.replicas - Number of replicas for the deployment.
     * @param {string} options.node - Explicit target node (highest precedence in the node chain). When empty, {@link UnderpostDeploy.resolveDeployNode} falls back to the cluster-type default (`kind-worker` for kind, host for kubeadm/k3s). Used for both volume placement and hostPath PV nodeAffinity.
     * @param {string} [options.sshKeyPath] - Private key path for node SSH operations, forwarded to deployVolume when shipping a hostPath volume to a remote target node over SSH. Defaults to engine-private/deploy/id_rsa.
     * @param {boolean} options.disableUpdateDeployment - Whether to disable deployment updates.
     * @param {boolean} [options.gatewayApi] - Apply the Gateway API stack (Gateway + HTTPRoute) instead of the Contour HTTPProxy. Both manifest sets are always generated by `--build-manifest`.
     * @param {string} [options.gatewayClass] - GatewayClass name baked into generated Gateway manifests.
     * @param {boolean} [options.disableHttp3] - Omit QUIC/HTTP3 listener config and the Alt-Svc advertisement.
     * @param {number|string} [options.quicPort] - UDP port advertised for QUIC/HTTP3.
     * @param {boolean} options.disableUpdateProxy - Whether to disable proxy updates.
     * @param {boolean} options.disableDeploymentProxy - Whether to disable deployment proxy.
     * @param {boolean} options.disableUpdateVolume - Whether to disable volume updates.
     * @param {boolean} options.status - Whether to display deployment status.
     * @param {boolean} options.disableUpdateUnderpostConfig - Whether to disable Underpost config updates.
     * @param {string} [options.namespace] - Kubernetes namespace for the deployment (defaults to "default").
     * @param {string} [options.timeoutResponse] - HTTPProxy per-route response timeout (e.g. "300000ms", "infinity").
     * @param {string} [options.timeoutIdle] - HTTPProxy per-route idle timeout (e.g. "10s", "infinity").
     * @param {string} [options.retryCount] - HTTPProxy per-route retry count (e.g. 3).
     * @param {string} [options.retryPerTryTimeout] - HTTPProxy per-route per-try timeout (e.g. "150ms").
     * @param {string} [options.kindType] - Kubernetes resource kind to target when using --expose (defaults to "svc").
     * @param {number} [options.port] - Port number override for exposing the deployment.
     * @param {string} [options.cmd] - Custom initialization command (comma-separated) for deploymentYamlPartsFactory.
     * @param {number} [options.exposePort] - Remote port override when --expose is active (overrides auto-detected service port). Used as both local and remote port unless exposeLocalPort is also set.
     * @param {number} [options.exposeLocalPort] - Local port override for --expose (e.g. 80); remote port is still auto-detected. Enables /etc/hosts access without a port in the browser URL.
     * @param {boolean} [options.localProxy] - When true (with --expose), forward all service TCP ports locally and start the Node.js path-routing proxy for full path-based routing (e.g. /wp alongside /).
     * @param {boolean} [options.tls] - When true (with --expose --local-proxy), start the proxy on port 443 with TLS using self-signed certificates resolved from the local SSL store.
     * @param {boolean} [options.k3s] - Whether to use k3s cluster context.
     * @param {boolean} [options.kubeadm] - Whether to use kubeadm cluster context.
     * @param {boolean} [options.kind] - Whether to use kind cluster context.
     * @param {boolean} [options.gitClean] - Whether to run git clean on volume mount paths before copying.
     * @param {boolean} [options.skipFullBuild] - Whether to skip the full client bundle build; passed through to buildManifest/deploymentYamlPartsFactory.
     * @param {boolean} [options.pullBundle] - Whether to pull the pre-built client bundle from Cloudinary; passed through to buildManifest/deploymentYamlPartsFactory. Use together with skipFullBuild.
     * @param {string} [options.imagePullPolicy] - Container imagePullPolicy override (`Always`, `IfNotPresent`, `Never`); passed through to buildManifest/deploymentYamlPartsFactory. Defaults to `Never` for `localhost/` images and `IfNotPresent` otherwise.
     * @param {boolean} [options.disableRuntimeProbes] - Omit internal-status HTTP probes from generated manifests. When true no readiness/liveness/startup probes are emitted.
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
        expose: false,
        cert: false,
        certHosts: '',
        versions: '',
        image: '',
        traffic: '',
        replicas: '',
        node: '',
        disableUpdateDeployment: false,
        disableUpdateProxy: false,
        disableDeploymentProxy: false,
        disableUpdateVolume: false,
        status: false,
        disableUpdateUnderpostConfig: false,
        namespace: '',
        timeoutResponse: '',
        timeoutIdle: '',
        retryCount: '',
        retryPerTryTimeout: '',
        kindType: '',
        port: 0,
        exposePort: 0,
        exposeLocalPort: 0,
        localProxy: false,
        tls: false,
        selfSigned: false,
        cmd: '',
        k3s: false,
        kubeadm: false,
        kind: false,
        gitClean: false,
        imagePullPolicy: '',
      },
    ) {
      const namespace = options.namespace ? options.namespace : 'default';
      if (!deployList && options.certHosts) {
        for (const host of options.certHosts.split(',')) {
          shellExec(`sudo kubectl apply -f - -n ${namespace} <<'EOF'
${Underpost.deploy.buildCertManagerCertificate({ host, namespace })}
EOF`);
        }
        return;
      } else if (!deployList) deployList = 'dd-default';
      if (deployList === 'dd' && fs.existsSync(`./engine-private/deploy/dd.router`))
        deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8');
      if (options.status === true) {
        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          const instances = [];
          if (fs.existsSync(`./engine-private/conf/${deployId}/conf.instances.json`)) {
            // Expands multiInstance variants so status lists every deployed
            // instance (mmo-server, mmo-server-forest, …), not just the templates.
            const confInstances = loadConfInstances(deployId);
            for (const instance of confInstances) {
              const _deployId = `${deployId}-${instance.id}`;
              instances.push({
                id: instance.id,
                host: instance.host,
                path: instance.path,
                fromPort: instance.fromPort,
                toPort: instance.toPort,
                fromDebugPort: instance.fromDebugPort,
                toDebugPort: instance.toDebugPort,
                traffic: Underpost.deploy.getCurrentTraffic(_deployId, {
                  namespace,
                  hostTest: instance.host,
                  env,
                  gatewayApi: options.gatewayApi,
                }),
              });
            }
          }
          logger.info('', {
            deployId,
            env,
            traffic: Underpost.deploy.getCurrentTraffic(deployId, { namespace, gatewayApi: options.gatewayApi }),
            router: await Underpost.deploy.routerFactory(deployId, env),
            pods: await Underpost.kubectl.get(deployId),
            instances,
          });
        }
        const interfaceName = Underpost.dns.getDefaultNetworkInterface();
        logger.info('Machine', {
          hostname: os.hostname(),
          arch: Underpost.baremetal.getHostArch(),
          ipv4Public: await Underpost.dns.getPublicIp(),
          ipv4Local: Underpost.dns.getLocalIPv4Address(),
          resources: Underpost.cluster.getResourcesCapacity(options.node),
          defaultInterfaceName: interfaceName,
          defaultInterfaceInfo: os.networkInterfaces()[interfaceName],
        });
        return;
      }
      if (!(options.versions && typeof options.versions === 'string')) options.versions = 'blue,green';
      if (!options.replicas) options.replicas = 1;
      if (options.sync)
        await getDataDeploy({
          buildSingleReplica: true,
        });
      if (options.buildManifest === true) await Underpost.deploy.buildManifest(deployList, env, options);
      if (options.syncStatic === true) {
        for (const deployId of deployList
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean))
          Underpost.deploy.syncStaticAssets(deployId, env, options);
        return;
      }
      if (options.infoRouter === true || options.buildManifest === true) {
        logger.info('router', await Underpost.deploy.routerFactory(deployList, env));
        return;
      }
      if (!options.disableUpdateUnderpostConfig) Underpost.deploy.configMap(env);

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        if (options.expose === true) {
          const kindType = options.kindType ? options.kindType : 'svc';
          const svc = Underpost.kubectl.get(deployId, kindType)[0];
          if (!svc) {
            logger.error(`No ${kindType} found matching '${deployId}', skipping expose`);
            continue;
          }
          if (options.localProxy) {
            const svcPorts = [
              ...new Set(
                svc['PORT(S)']
                  .split(',')
                  .filter((p) => p.includes('/TCP'))
                  .map((p) => parseInt(p.split(':')[0])),
              ),
            ];
            for (const svcPort of svcPorts) {
              shellExec(`sudo kubectl port-forward -n ${namespace} ${kindType}/${svc.NAME} ${svcPort}:${svcPort}`, {
                async: true,
              });
            }
            const envFile = `./engine-private/conf/${deployId}/.env.${env}`;
            let basePort = svcPorts[0] - 1;
            if (fs.existsSync(envFile)) {
              const portMatch = fs.readFileSync(envFile, 'utf8').match(/^PORT=(\d+)/m);
              if (portMatch) basePort = parseInt(portMatch[1]);
            }
            logger.info(deployId, { svc, svcPorts, basePort });
            const tlsFlag = options.tls ? ' tls' : '';
            shellExec(
              `NODE_ENV=${env} PORT=${basePort} DEV_PROXY_PORT_OFFSET=0 node src/proxy proxy ${deployId} ${env}${tlsFlag}`,
              { async: true },
            );
          } else {
            const remotePort = options.exposePort
              ? parseInt(options.exposePort)
              : options.port
                ? parseInt(options.port)
                : kindType !== 'svc'
                  ? 80
                  : parseInt(svc[`PORT(S)`].split('/TCP')[0]);
            const localPort = options.exposeLocalPort ? parseInt(options.exposeLocalPort) : remotePort;
            logger.info(deployId, {
              svc,
              localPort,
              remotePort,
            });
            shellExec(`sudo kubectl port-forward -n ${namespace} ${kindType}/${svc.NAME} ${localPort}:${remotePort}`, {
              async: true,
            });
          }
          continue;
        }

        const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
        const confVolume = fs.existsSync(`./engine-private/conf/${deployId}/conf.volume.json`)
          ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.volume.json`, 'utf8'))
          : [];

        if (!options.disableUpdateDeployment)
          for (const version of options.versions.split(',')) {
            shellExec(
              `sudo kubectl delete svc ${deployId}-${env}-${version}-service -n ${namespace} --ignore-not-found`,
            );
            shellExec(
              `sudo kubectl delete deployment ${deployId}-${env}-${version} -n ${namespace} --ignore-not-found`,
            );
            if (!options.disableUpdateVolume)
              for (const volume of confVolume)
                Underpost.deploy.deployVolume(volume, {
                  deployId,
                  env,
                  version,
                  namespace,
                  nodeName: Underpost.deploy.resolveDeployNode({
                    node: options.node,
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

        for (const host of Object.keys(confServer)) {
          if (!options.disableUpdateProxy) {
            // The host's route object is left in place and replaced by the `apply`
            // below. Deleting it first unpublished the hostname for the whole
            // reconciliation window, so every promote dropped live requests before
            // the new colour was ever the question.
            //
            // A deploy that previously ran the per-host model left a Gateway
            // named after each host. Those are superseded by the consolidated
            // one, and leaving them behind puts a hostname-scoped 443 listener
            // beside the hostname-less one in the same merged set — exactly the
            // ambiguity the consolidation exists to remove.
            //
            // `undefined-http3` is the same problem under a different name: the
            // consolidated policy was briefly emitted with an unresolved host in
            // its metadata. Merged listeners are configured by the oldest policy
            // that targets them, so that object outranks the correctly named one
            // for as long as it exists.
            if (options.gatewayApi)
              for (const name of [host, 'undefined']) {
                shellExec(`sudo kubectl delete Gateway ${name} -n ${namespace} --ignore-not-found`, { silent: true });
                shellExec(`sudo kubectl delete ClientTrafficPolicy ${name}-http3 -n ${namespace} --ignore-not-found`, {
                  silent: true,
                });
              }
            if (Underpost.deploy.isCertManagerContext({ host, env, options }))
              shellExec(`sudo kubectl delete Certificate ${host} -n ${namespace} --ignore-not-found`);
          }
        }

        const manifestsPath =
          env === 'production'
            ? `engine-private/conf/${deployId}/build/production`
            : `manifests/deployment/${deployId}-${env}`;

        if (!options.remove) {
          if (!options.disableUpdateDeployment) {
            shellExec(`sudo kubectl apply -f ./${manifestsPath}/deployment.yaml -n ${namespace}`);
            const grpcServicePath = `./${manifestsPath}/grpc-service.yaml`;
            if (fs.existsSync(grpcServicePath)) shellExec(`sudo kubectl apply -f ${grpcServicePath} -n ${namespace}`);
          }
          // Ingress is served by exactly one of the two routing stacks: the
          // Contour HTTPProxy set, or the Gateway API set (Gateway + HTTPRoute).
          // Applying both would publish duplicate routes for the same hostnames.
          if (!options.disableUpdateProxy) {
            if (options.gatewayApi) {
              // In the normal one-shot deploy, wait for the application endpoints
              // before publishing direct API routes. The cluster runner also uses
              // this apply path in an explicit ingress-only bootstrap, where the
              // Service is intentionally absent and the site route must already
              // reach underpost-gateway so it can serve the maintenance fallback.
              if (!options.disableUpdateDeployment)
                for (const version of options.versions.split(','))
                  Underpost.deploy.awaitServiceEndpoints({
                    service: `${deployId}-${env}-${version.trim()}-service`,
                    namespace,
                  });
              // Nginx must know how to proxy and intercept this host before Envoy
              // can send the first request to it. Installing first removes the
              // reconciliation window where the HTTPRoute is Accepted but the
              // shared gateway still serves its default server block.
              installGatewayConf({
                hostRoot: Underpost.deploy.underpostGatewayRootFactory(options),
                confSourceDir: Underpost.deploy.gatewayConfDirFactory({ deployId, env }),
                namespace,
              });
              for (const file of ['gateway.yaml', 'httproute.yaml']) {
                const gatewayApiPath = `./${manifestsPath}/${file}`;
                if (fs.existsSync(gatewayApiPath) && fs.readFileSync(gatewayApiPath, 'utf8').trim())
                  shellExec(`sudo kubectl apply -f ${gatewayApiPath} -n ${namespace}`);
              }
            } else shellExec(`sudo kubectl apply -f ./${manifestsPath}/proxy.yaml -n ${namespace}`);
          }

          if (Underpost.deploy.isCertManagerContext({ host: Object.keys(confServer)[0], env, options })) {
            const secretPath = `./${manifestsPath}/secret.yaml`;
            if (fs.existsSync(secretPath) && fs.readFileSync(secretPath, 'utf8').trim()) {
              shellExec(`sudo kubectl apply -f ${secretPath} -n ${namespace}`);
            } else logger.info('Skipping secret.yaml apply (no objects yet; applied by the --cert step)');
          }
        }
      }
    },
    /**
     * Creates a Kubernetes Secret for a deployment (replaces configMap for secret data).
     * Secrets are mounted as tmpfs (never written to node disk) and support RBAC restrictions.
     * @param {string} env - Environment for which the secret is being created.
     * @param {string} [namespace='default'] - Kubernetes namespace for the secret.
     * @memberof UnderpostDeploy
     */
    configMap(env, namespace = 'default') {
      const cronDeployId = cronDeployIdResolve() || 'dd-cron';
      const envFilePath = `/home/dd/engine/engine-private/conf/${cronDeployId}/.env.${env}`;
      // `--from-env-file` turns every KEY=VALUE into a secret key that the Deployment injects via
      // `envFrom`. Strip shell/runtime-critical keys (notably PATH) first — an injected PATH
      // overrides the image's own and breaks coreutils/sudo resolution inside the pod.
      const sanitizedEnvPath = `${envFilePath}.secret`;
      fs.writeFileSync(sanitizedEnvPath, Underpost.secret.sanitizeSecretEnvFile(fs.readFileSync(envFilePath, 'utf8')));
      shellExec(`kubectl delete secret underpost-config -n ${namespace} --ignore-not-found`);
      shellExec(
        `kubectl create secret generic underpost-config --from-env-file=${sanitizedEnvPath} --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
      );
      fs.removeSync(sanitizedEnvPath);
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
      const timeoutFlags = Underpost.deploy.timeoutFlagsFactory(options);
      const imagePullPolicyFlag = options.imagePullPolicy ? ` --image-pull-policy ${options.imagePullPolicy}` : '';
      const gatewayApiFlags = Underpost.deploy.gatewayApiFlagsFactory(options);

      // Envoy translates a route's backends when the route is applied, so routing
      // at a colour with no ready endpoint programmes a 500. Callers that roll a
      // new colour await its readiness first; the failover and cert flips
      // deliberately do not, and must stay fast — so this reports rather than
      // blocks.
      if (
        !Underpost.deploy.serviceHasReadyEndpoints({
          service: `${deployId}-${env}-${targetTraffic}-service`,
          namespace,
        })
      )
        logger.warn('Switching traffic to a colour with no ready endpoint; routes may be programmed as 500', {
          deployId,
          env,
          targetTraffic,
        });

      // Regenerates the manifests against the target colour only: `--build-manifest`
      // returns before any cluster mutation, so the workload is untouched and the
      // applies below are the whole switch.
      shellExec(
        `node bin deploy --info-router --build-manifest --traffic ${targetTraffic} --replicas ${replicas} --namespace ${namespace}${timeoutFlags}${imagePullPolicyFlag}${gatewayApiFlags} ${deployId} ${env}`,
      );

      const buildPath = `./engine-private/conf/${deployId}/build/${env}`;
      for (const file of options.gatewayApi ? ['gateway.yaml', 'httproute.yaml'] : ['proxy.yaml'])
        if (fs.existsSync(`${buildPath}/${file}`) && fs.readFileSync(`${buildPath}/${file}`, 'utf8').trim())
          shellExec(`sudo kubectl apply -f ${buildPath}/${file} -n ${namespace}`);

      const grpcServicePath = `./engine-private/conf/${deployId}/build/${env}/grpc-service.yaml`;
      if (fs.existsSync(grpcServicePath)) shellExec(`kubectl apply -f ${grpcServicePath} -n ${namespace}`);

      Underpost.env.set(`${deployId}-${env}-traffic`, targetTraffic);
    },

    /**
     * Resolves the effective target node for a deployment, applying a single
     * precedence chain shared by every deploy workflow — the default `deploy`
     * callback, `run sync`, and custom `run instance` — so node customization
     * behaves identically everywhere:
     *
     *   1. **Explicit node** — `node` (the resolved `--node` value). Upstream
     *      runners derive it from the comma-path field or `--node-name`
     *      (`run sync`: `path.split(',')[4]` > `--node-name` > default) and from
     *      `--node-name` directly (`run instance`).
     *   2. **`UNDERPOST_DEPLOY_NODE` env** — for kubeadm / k3s, the configured
     *      target node name. This makes hostPath PV `nodeAffinity` deterministic
     *      regardless of where the manifest is *built*: building inside a
     *      container or CI runner would otherwise leak that box's `os.hostname()`
     *      (e.g. a random container id) into `nodeSelector`, pinning the PV to a
     *      node that does not exist in the cluster.
     *   3. **Cluster-type default** — when nothing above is set: `kind-worker`
     *      for a kind cluster (the node that hosts kind hostPath volumes),
     *      otherwise the control-plane / current host (`os.hostname()`) for
     *      kubeadm / k3s. With no explicit cluster flag, `development` is treated
     *      as kind and `production` as the host, preserving legacy behaviour.
     *
     * @param {object} params
     * @param {string} [params.node=''] - Explicit node (`--node`); highest precedence.
     * @param {boolean} [params.kind=false] - Kind cluster context.
     * @param {boolean} [params.kubeadm=false] - Kubeadm cluster context.
     * @param {boolean} [params.k3s=false] - K3s cluster context.
     * @param {string} [params.env=''] - Deployment environment; tie-breaker when no cluster flag is set.
     * @returns {string} The effective node name.
     * @memberof UnderpostDeploy
     */
    resolveDeployNode({ node = '', kind = false, kubeadm = false, k3s = false, env = '' } = {}) {
      if (node) return node;
      const isKind = kind || (!kubeadm && !k3s && env !== 'production');
      if (isKind) return 'kind-worker';
      return process.env.UNDERPOST_DEPLOY_NODE || os.hostname();
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
     * @param {string} options.namespace - Kubernetes namespace for the deployment.
     * @param {string} options.nodeName - Effective target node (already resolved via {@link UnderpostDeploy.resolveDeployNode}). The volume data is written/shipped here and the PV is pinned to it; an empty value falls back to the cluster-type default inside this method.
     * @param {string} [options.clusterContext='kind'] - Cluster context type ('kind', 'kubeadm', or 'k3s').
     * @param {boolean} [options.gitClean=false] - Whether to run git clean on volumeMountPath before copying.
     * @param {string} [options.sshKeyPath=''] - Private key path used when the target node is remote and the volume is shipped over SSH. Empty falls back to copyDirToNode's default (engine-private/deploy/id_rsa).
     * @memberof UnderpostDeploy
     */
    deployVolume(
      volume = { claimName: '', volumeMountPath: '', volumeName: '' },
      options = {
        deployId: '',
        env: '',
        version: '',
        namespace: '',
        nodeName: '',
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
      const rootVolumeHostPath = `/home/dd/engine/volume/${pvId}`;
      if (options.gitClean && volume.volumeMountPath) {
        Underpost.repo.clean({ paths: [volume.volumeMountPath] });
      }
      // The node that physically receives the volume data. hostPath volumes are
      // node-local, so the data must land on the node where the pod will run, and
      // the PV is pinned there (nodeAffinity) so the scheduler co-locates the pod
      // with its volume — never mounting an empty DirectoryOrCreate on another node.
      let dataNode;
      if (clusterContext === 'kind') {
        const kindNode = options.nodeName || 'kind-worker';
        dataNode = kindNode;
        shellExec(`docker exec -i ${kindNode} bash -c "mkdir -p ${rootVolumeHostPath}"`);
        shellExec(`tar -C ${volume.volumeMountPath} -c . | docker cp - ${kindNode}:${rootVolumeHostPath}`);
        shellExec(
          `docker exec -i ${kindNode} bash -c "chown -R 1000:1000 ${rootVolumeHostPath}; chmod -R 755 ${rootVolumeHostPath}"`,
        );
      } else {
        const localHost = os.hostname();
        dataNode = options.nodeName || localHost;
        if (dataNode === localHost) {
          // Target node is the control plane / current host: write directly.
          if (!fs.existsSync(rootVolumeHostPath)) fs.mkdirSync(rootVolumeHostPath, { recursive: true });
          fs.copySync(volume.volumeMountPath, rootVolumeHostPath);
        } else {
          // Target node is remote: fs.copySync would only write the control-plane
          // filesystem, leaving the real node's hostPath empty. Ship the folder to
          // the node over SSH so the data exists where the pod is pinned.
          const nodeHost =
            shellExec(
              `kubectl get node ${dataNode} -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}'`,
              { stdout: true, silent: true, silentOnError: true },
            ).trim() || dataNode;
          logger.info('Shipping volume to remote node over SSH', {
            node: dataNode,
            host: nodeHost,
            src: volume.volumeMountPath,
            dest: rootVolumeHostPath,
          });
          Underpost.ssh.copyDirToNode({
            host: nodeHost,
            localDir: volume.volumeMountPath,
            remoteDir: rootVolumeHostPath,
            ...(options.sshKeyPath ? { keyPath: options.sshKeyPath } : {}),
          });
        }
      }
      shellExec(`kubectl delete pvc ${pvcId} -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pv ${pvId} --ignore-not-found`);
      shellExec(`kubectl apply -f - -n ${namespace} <<'EOF'
${Underpost.deploy.persistentVolumeFactory({
  hostPath: rootVolumeHostPath,
  pvcId,
  namespace,
  nodeName: dataNode,
})}
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
     * @param {string} [options.namespace='default'] - Kubernetes namespace for the PVC claimRef.
     * @param {string} [options.nodeName=''] - Node name to which the persistent volume is pinned (optional).
     * @returns {string} - YAML configuration for the persistent volume and claim.
     * @memberof UnderpostDeploy
     */
    persistentVolumeFactory({ hostPath, pvcId, namespace = 'default', nodeName = '' }) {
      const pvId = pvcId.replace(/^pvc-/, 'pv-');
      // hostPath volumes are node-local: deployVolume writes the content to the
      // filesystem of a single node. Without nodeAffinity the scheduler can place
      // the pod on a different node and mount an empty DirectoryOrCreate hostPath
      // (missing the materialized assets). Pin the PV to the node that holds the
      // data so the pod is always co-located with its volume.
      const nodeAffinity = nodeName
        ? `
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values:
                - ${nodeName}`
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
     * Checks if a TLS context is valid — i.e. whether the host is served over
     * HTTPS at all, by either issuer. Drives the TLS block in the generated
     * HTTPProxy virtualhost and Gateway listener.
     * @param {object} options - Options for the check.
     * @param {string} options.host - Host for which the TLS context is being checked.
     * @param {string} options.env - Environment for which the TLS context is being checked.
     * @param {object} options.options - Options for the TLS context check.
     * @returns {boolean} - True if the TLS context is valid, false otherwise.
     * @memberof UnderpostDeploy
     */
    isValidTLSContext: ({ host, env, options }) =>
      (env === 'production' &&
        options.cert === true &&
        (!options.certHosts || options.certHosts.split(',').includes(host))) ||
      options.selfSigned === true,

    /**
     * Checks whether cert-manager is the issuer for a host, as opposed to a
     * pre-created self-signed secret. Only this predicate may gate operations on
     * cert-manager's own objects: its CRDs are absent wherever it is not
     * installed (development, notably), and `kubectl --ignore-not-found`
     * tolerates a missing object but not a missing resource type.
     * @param {object} options - Options for the check.
     * @param {string} options.host - Host being checked.
     * @param {string} options.env - Environment being checked.
     * @param {object} options.options - Deploy options.
     * @returns {boolean} - True when cert-manager issues this host's certificate.
     * @memberof UnderpostDeploy
     */
    isCertManagerContext: ({ host, env, options }) =>
      options.selfSigned !== true && Underpost.deploy.isValidTLSContext({ host, env, options }),

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
     * Generates the Gateway API / QUIC flag string for spawned deploy commands,
     * so a routing choice made once at the top of a workflow reaches every
     * child process instead of silently reverting to the HTTPProxy default.
     * @param {object} options - Options containing the gateway settings.
     * @param {boolean} [options.gatewayApi] - Apply the Gateway API stack.
     * @param {boolean} [options.disableGatewayApi] - Apply the legacy Contour HTTPProxy stack.
     * @param {string} [options.gatewayClass] - GatewayClass name.
     * @param {boolean} [options.disableHttp3] - Disable QUIC/HTTP3.
     * @param {string|number} [options.quicPort] - Advertised QUIC port.
     * @returns {string} The gateway flags string.
     * @memberof UnderpostDeploy
     */
    gatewayApiFlagsFactory: (options = {}) => {
      return (
        `${options.gatewayApi ? ' --gateway-api' : ''}` +
        // The legacy selection has to travel too. Gateway API is the default, so
        // a child that never receives this flag reverts to it and reads or writes
        // a different routing kind than the workflow that spawned it.
        `${options.disableGatewayApi ? ' --disable-gateway-api' : ''}` +
        `${options.gatewayClass ? ` --gateway-class ${options.gatewayClass}` : ''}` +
        `${options.disableHttp3 ? ' --disable-http3' : ''}` +
        `${options.quicPort ? ` --quic-port ${options.quicPort}` : ''}`
      );
    },
  };
}

export default UnderpostDeploy;
