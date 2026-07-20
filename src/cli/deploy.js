/**
 * Deploy module for managing the deployment of applications and services.
 * @module src/cli/deploy.js
 * @namespace UnderpostDeploy
 */

import {
  buildKindPorts,
  buildPortProxyRouter,
  buildProxyRouter,
  Config,
  cronDeployIdResolve,
  deployRangePortFactory,
  getDataDeploy,
  loadConfServerJson,
  loadReplicas,
  pathPortAssignmentFactory,
} from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import { INTERNAL_READY_PATH, INTERNAL_HEALTH_PATH } from '../server/runtime-status.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import os from 'node:os';
import Underpost from '../index.js';

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
        const customServices = fs.existsSync(`./engine-private/conf/${deployId}/conf.services.json`)
          ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.services.json`))
          : [];

        for (const host of Object.keys(confServer)) {
          if (env === 'production' && options.cert === true)
            secretYaml += Underpost.deploy.buildCertManagerCertificate({ host, namespace: options.namespace });

          const pathPortAssignment = pathPortAssignmentData[host];
          // logger.info('', { host, pathPortAssignment });
          let _proxyYaml = Underpost.deploy.baseProxyYamlFactory({ host, env, options });
          const deploymentVersions =
            options.traffic && typeof options.traffic === 'string' ? options.traffic.split(',') : ['blue'];
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
            }
          }
          if (proxyRoutes) proxyYaml += _proxyYaml + proxyRoutes;
        }
        const yamlPath = `./engine-private/conf/${deployId}/build/${env}/proxy.yaml`;
        fs.writeFileSync(yamlPath, proxyYaml, 'utf8');
        if (env === 'production') {
          const yamlPath = `./engine-private/conf/${deployId}/build/${env}/secret.yaml`;
          fs.writeFileSync(yamlPath, secretYaml, 'utf8');
        } else {
          const deploymentsFiles = ['Dockerfile', 'proxy.yaml', 'deployment.yaml', 'pv-pvc.yaml', 'grpc-service.yaml'];
          for (const file of deploymentsFiles) {
            if (fs.existsSync(`./engine-private/conf/${deployId}/build/${env}/${file}`)) {
              fs.copyFileSync(
                `./engine-private/conf/${deployId}/build/${env}/${file}`,
                `./manifests/deployment/${deployId}-${env}/${file}`,
              );
            }
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
     * @returns {string|null} - Current traffic status ('blue' or 'green') or null if not found.
     * @memberof UnderpostDeploy
     */
    getCurrentTraffic(deployId, options = { hostTest: '', namespace: '' }) {
      if (!options.namespace) options.namespace = 'default';
      // kubectl get deploy,sts,svc,configmap,secret -n default -o yaml --export > default.yaml
      const hostTest = options?.hostTest
        ? options.hostTest
        : Object.keys(loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`))[0];
      // Missing HTTPProxy is the canonical "no traffic colour set yet" state
      // for blue/green rollouts. silentOnError swallows kubectl's NotFound
      // exit so the function can return null cleanly.
      const info = shellExec(`sudo kubectl get HTTPProxy/${hostTest} -n ${options.namespace} -o yaml`, {
        silent: true,
        stdout: true,
        silentOnError: true,
      });
      if (!info) return null;
      return info.match('blue') ? 'blue' : info.match('green') ? 'green' : null;
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
          shellExec(`sudo kubectl apply -f - -n ${namespace} <<EOF
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
            const confInstances = JSON.parse(
              fs.readFileSync(`./engine-private/conf/${deployId}/conf.instances.json`, 'utf8'),
            );
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
                traffic: Underpost.deploy.getCurrentTraffic(_deployId, { namespace, hostTest: instance.host }),
              });
            }
          }
          logger.info('', {
            deployId,
            env,
            traffic: Underpost.deploy.getCurrentTraffic(deployId, { namespace }),
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
                  clusterContext: options.k3s ? 'k3s' : options.kubeadm ? 'kubeadm' : 'kind',
                  gitClean: options.gitClean || false,
                  sshKeyPath: options.sshKeyPath || '',
                });
          }

        for (const host of Object.keys(confServer)) {
          if (!options.disableUpdateProxy) {
            shellExec(`sudo kubectl delete HTTPProxy ${host} -n ${namespace} --ignore-not-found`);
            if (Underpost.deploy.isValidTLSContext({ host, env, options }))
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
          if (!options.disableUpdateProxy)
            shellExec(`sudo kubectl apply -f ./${manifestsPath}/proxy.yaml -n ${namespace}`);

          if (
            Underpost.deploy.isValidTLSContext({ host: Object.keys(confServer)[0], env, options }) &&
            !options.selfSigned
          ) {
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

      shellExec(
        `node bin deploy --info-router --build-manifest --traffic ${targetTraffic} --replicas ${replicas} --namespace ${namespace}${timeoutFlags}${imagePullPolicyFlag} ${deployId} ${env}`,
      );

      shellExec(`sudo kubectl apply -f ./engine-private/conf/${deployId}/build/${env}/proxy.yaml -n ${namespace}`);

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
      shellExec(`kubectl apply -f - -n ${namespace} <<EOF
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
        _volumeMounts += `
        - name: ${volumeName}
          mountPath: ${volumeMountPath}
${secret ? `          readOnly: true\n` : ''}`;

        _volumes += `
    - name: ${volumeName}
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
     * Checks if a TLS context is valid.
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
     *   (already passed through pickEnv). May be `undefined`.
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
  };
}

export default UnderpostDeploy;
