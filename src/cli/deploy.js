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
  deployRangePortFactory,
  getDataDeploy,
  loadReplicas,
  pathPortAssignmentFactory,
} from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import UnderpostRootEnv from './env.js';
import UnderpostCluster from './cluster.js';
import { timer } from '../client/components/core/CommonJs.js';
import os from 'node:os';
import Dns, { getLocalIPv4Address } from '../server/dns.js';
import UnderpostBaremetal from './baremetal.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostDeploy
 * @description Manages the deployment of applications and services.
 * This class provides a set of static methods to handle the deployment process,
 * including resource allocation, configuration management, and Kubernetes deployment.
 * @memberof UnderpostDeploy
 */
class UnderpostDeploy {
  static NETWORK = {};
  static API = {
    /**
     * Synchronizes deployment configurations for a list of deployments.
     * @param {string} deployList - List of deployment IDs to synchronize.
     * @param {object} options - Options for the synchronization process.
     * @param {string} options.versions - Comma-separated list of versions to deploy.
     * @param {string} options.replicas - Number of replicas for each deployment.
     * @param {string} options.node - Node name for resource allocation.
     * @returns {object} - Deployment data for the specified deployments.
     * @memberof UnderpostDeploy
     */
    sync(deployList, { versions, replicas, node }) {
      fs.writeFileSync(`./engine-private/deploy/dd.router`, deployList, 'utf8');
      const totalPods = deployList.split(',').length * versions.split(',').length * parseInt(replicas);
      const limitFactor = 0.8;
      const reserveFactor = 0.05;
      const resources = UnderpostCluster.API.getResourcesCapacity(node);
      const memory = parseInt(resources.memory.value / totalPods);
      const cpu = parseInt(resources.cpu.value / totalPods);
      UnderpostRootEnv.API.set(
        'resources.requests.memory',
        `${parseInt(memory * reserveFactor)}${resources.memory.unit}`,
      );
      UnderpostRootEnv.API.set('resources.requests.cpu', `${parseInt(cpu * reserveFactor)}${resources.cpu.unit}`);
      UnderpostRootEnv.API.set('resources.limits.memory', `${parseInt(memory * limitFactor)}${resources.memory.unit}`);
      UnderpostRootEnv.API.set('resources.limits.cpu', `${parseInt(cpu * limitFactor)}${resources.cpu.unit}`);
      UnderpostRootEnv.API.set('total-pods', totalPods);
      return getDataDeploy({
        buildSingleReplica: true,
      });
    },
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
     * @returns {string} - YAML service configuration for the specified deployment.
     * @param {string} [serviceId] - Custom service name (optional).
     * @param {Array} [pathRewritePolicy] - Path rewrite policy (optional).
     * @memberof UnderpostDeploy
     */
    deploymentYamlServiceFactory({ deployId, path, env, port, deploymentVersions, serviceId, pathRewritePolicy }) {
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
      }
      enableWebsockets: true
      services:
    ${deploymentVersions
      .map(
        (version, i) => `    - name: ${serviceId ? serviceId : `${deployId}-${env}-${version}-service`}
          port: ${port}
          weight: ${i === 0 ? 100 : 0}
    `,
      )
      .join('')}`;
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
     * @returns {string} - YAML deployment configuration for the specified deployment.
     * @memberof UnderpostDeploy
     */
    deploymentYamlPartsFactory({ deployId, env, suffix, resources, replicas, image, namespace }) {
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      let volumes = [
        {
          volumeMountPath: '/etc/config',
          volumeName: 'config-volume',
          configMap: 'underpost-config',
        },
      ];
      const confVolume = fs.existsSync(`./engine-private/conf/${deployId}/conf.volume.json`)
        ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.volume.json`, 'utf8'))
        : [];
      volumes = volumes.concat(confVolume);
      return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deployId}-${env}-${suffix}
  namespace: ${namespace ? namespace : 'default'}
  labels:
    app: ${deployId}-${env}-${suffix}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${deployId}-${env}-${suffix}
  template:
    metadata:
      labels:
        app: ${deployId}-${env}-${suffix}
    spec:
      containers:
        - name: ${deployId}-${env}-${suffix}
          image: ${image ?? `localhost/rockylinux9-underpost:v${packageJson.version}`}
#          resources:
#            requests:
#              memory: "${resources.requests.memory}"
#              cpu: "${resources.requests.cpu}"
#            limits:
#              memory: "${resources.limits.memory}"
#              cpu: "${resources.limits.cpu}"
          command:
            - /bin/sh
            - -c
            - >
              npm install -g npm@11.2.0 &&
              npm install -g underpost &&
              underpost secret underpost --create-from-file /etc/config/.env.${env} &&
              underpost start --build --run ${deployId} ${env}
${UnderpostDeploy.API.volumeFactory(volumes.map((v) => ((v.version = `${deployId}-${env}-${suffix}`), v)))
  .render.split(`\n`)
  .map((l) => '    ' + l)
  .join(`\n`)}
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
     * @param {string} options.namespace - Kubernetes namespace for the deployment.
     * @returns {Promise<void>} - Promise that resolves when the manifest is built.
     * @memberof UnderpostDeploy
     */
    async buildManifest(deployList, env, options) {
      const resources = UnderpostDeploy.API.resourcesFactory();
      const replicas = options.replicas;
      const image = options.image;
      if (!options.namespace) options.namespace = 'default';

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        const confServer = loadReplicas(
          deployId,
          JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
        );
        const router = await UnderpostDeploy.API.routerFactory(deployId, env);
        const pathPortAssignmentData = await pathPortAssignmentFactory(deployId, router, confServer);
        const { fromPort, toPort } = deployRangePortFactory(router);
        const deploymentVersions = options.versions.split(',');
        fs.mkdirSync(`./engine-private/conf/${deployId}/build/${env}`, { recursive: true });
        if (env === 'development') fs.mkdirSync(`./manifests/deployment/${deployId}-${env}`, { recursive: true });

        logger.info('port range', { deployId, fromPort, toPort });

        let deploymentYamlParts = '';
        for (const deploymentVersion of deploymentVersions) {
          deploymentYamlParts += `---
${UnderpostDeploy.API.deploymentYamlPartsFactory({
  deployId,
  env,
  suffix: deploymentVersion,
  resources,
  replicas,
  image,
  namespace: options.namespace,
}).replace('{{ports}}', buildKindPorts(fromPort, toPort))}
`;
        }
        fs.writeFileSync(`./engine-private/conf/${deployId}/build/${env}/deployment.yaml`, deploymentYamlParts, 'utf8');

        let proxyYaml = '';
        let secretYaml = '';
        const customServices = fs.existsSync(`./engine-private/conf/${deployId}/conf.services.json`)
          ? JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.services.json`))
          : [];

        for (const host of Object.keys(confServer)) {
          if (env === 'production') secretYaml += UnderpostDeploy.API.buildCertManagerCertificate({ host });

          const pathPortAssignment = pathPortAssignmentData[host];
          // logger.info('', { host, pathPortAssignment });
          let _proxyYaml = `
---
apiVersion: projectcontour.io/v1
kind: HTTPProxy
metadata:
  name: ${host}
  namespace: ${options.namespace}
spec:
  virtualhost:
    fqdn: ${host}${
      env === 'development'
        ? ''
        : `
    tls:
      secretName: ${host}`
    }
  routes:`;
          const deploymentVersions =
            options.traffic && typeof options.traffic === 'string' ? options.traffic.split(',') : ['blue'];
          let proxyRoutes = '';
          if (!options.disableDeploymentProxy)
            for (const conditionObj of pathPortAssignment) {
              const { path, port } = conditionObj;
              proxyRoutes += UnderpostDeploy.API.deploymentYamlServiceFactory({
                path,
                deployId,
                env,
                port,
                deploymentVersions,
              });
            }
          for (const customService of customServices) {
            const { path: _path, port, serviceId, host: _host, pathRewritePolicy } = customService;
            if (host === _host) {
              proxyRoutes += UnderpostDeploy.API.deploymentYamlServiceFactory({
                path: _path,
                port,
                serviceId,
                deploymentVersions,
                pathRewritePolicy,
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
          const deploymentsFiles = ['Dockerfile', 'proxy.yaml', 'deployment.yaml'];
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
     * @returns {string|null} - Current traffic status ('blue' or 'green') or null if not found.
     * @memberof UnderpostDeploy
     */
    getCurrentTraffic(deployId) {
      // kubectl get deploy,sts,svc,configmap,secret -n default -o yaml --export > default.yaml
      const hostTest = Object.keys(
        JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
      )[0];
      const info = shellExec(`sudo kubectl get HTTPProxy/${hostTest} -o yaml`, { silent: true, stdout: true });
      return info.match('blue') ? 'blue' : info.match('green') ? 'green' : null;
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
     * @param {boolean} options.cert - Whether to create certificates for the deployment.
     * @param {string} options.certHosts - Comma-separated list of hosts for which to create certificates.
     * @param {string} options.versions - Comma-separated list of versions to deploy.
     * @param {string} options.image - Docker image for the deployment.
     * @param {string} options.traffic - Traffic status for the deployment.
     * @param {string} options.replicas - Number of replicas for the deployment.
     * @param {string} options.node - Node name for resource allocation.
     * @param {boolean} options.restoreHosts - Whether to restore the hosts file.
     * @param {boolean} options.disableUpdateDeployment - Whether to disable deployment updates.
     * @param {boolean} options.disableUpdateProxy - Whether to disable proxy updates.
     * @param {boolean} options.disableDeploymentProxy - Whether to disable deployment proxy.
     * @param {boolean} options.disableUpdateVolume - Whether to disable volume updates.
     * @param {boolean} options.status - Whether to display deployment status.
     * @param {boolean} options.etcHosts - Whether to display the /etc/hosts file.
     * @param {boolean} options.disableUpdateUnderpostConfig - Whether to disable Underpost config updates.
     * @param {string} [options.namespace] - Kubernetes namespace for the deployment.
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
        restoreHosts: false,
        disableUpdateDeployment: false,
        disableUpdateProxy: false,
        disableDeploymentProxy: false,
        disableUpdateVolume: false,
        status: false,
        etcHosts: false,
        disableUpdateUnderpostConfig: false,
        namespace: '',
      },
    ) {
      const namespace = options.namespace ? options.namespace : 'default';
      if (!deployList && options.certHosts) {
        for (const host of options.certHosts.split(',')) {
          shellExec(`sudo kubectl apply -f - -n ${namespace} <<EOF
${UnderpostDeploy.API.buildCertManagerCertificate({ host, namespace })}
EOF`);
        }
        return;
      } else if (!deployList) deployList = 'dd-default';
      if (deployList === 'dd' && fs.existsSync(`./engine-private/deploy/dd.router`))
        deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8');
      if (options.status === true) {
        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          logger.info('', {
            deployId,
            env,
            traffic: UnderpostDeploy.API.getCurrentTraffic(deployId),
            router: await UnderpostDeploy.API.routerFactory(deployId, env),
            pods: await UnderpostDeploy.API.get(deployId),
          });
        }
        const interfaceName = Dns.getDefaultNetworkInterface();
        logger.info('Machine', {
          node: os.hostname(),
          arch: UnderpostBaremetal.API.getHostArch(),
          ipv4Public: await Dns.getPublicIp(),
          ipv4Local: getLocalIPv4Address(),
          resources: UnderpostCluster.API.getResourcesCapacity(),
          defaultInterfaceName: interfaceName,
          defaultInterfaceInfo: os.networkInterfaces()[interfaceName],
        });
        return;
      }
      if (!(options.versions && typeof options.versions === 'string')) options.versions = 'blue,green';
      if (!options.replicas) options.replicas = 1;
      if (options.sync) UnderpostDeploy.API.sync(deployList, options);
      if (options.buildManifest === true) await UnderpostDeploy.API.buildManifest(deployList, env, options);
      if (options.infoRouter === true || options.buildManifest === true) {
        logger.info('router', await UnderpostDeploy.API.routerFactory(deployList, env));
        return;
      }
      if (!options.disableUpdateUnderpostConfig) UnderpostDeploy.API.configMap(env);
      let renderHosts = '';
      let etcHosts = [];
      if (options.restoreHosts === true) {
        const factoryResult = UnderpostDeploy.API.etcHostFactory(etcHosts);
        renderHosts = factoryResult.renderHosts;
        logger.info(renderHosts);
        return;
      }

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        if (options.expose === true) {
          const svc = UnderpostDeploy.API.get(deployId, 'svc')[0];
          const port = parseInt(svc[`PORT(S)`].split('/TCP')[0]);
          logger.info(deployId, {
            svc,
            port,
          });
          shellExec(`sudo kubectl port-forward -n default svc/${svc.NAME} ${port}:${port}`, { async: true });
          continue;
        }

        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
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
            if (!options.disableUpdateVolume) {
              for (const volume of confVolume) {
                const pvcId = `${volume.claimName}-${deployId}-${env}-${version}`;
                const pvId = `${volume.claimName.replace('pvc-', 'pv-')}-${deployId}-${env}-${version}`;
                const rootVolumeHostPath = `/home/dd/engine/volume/${pvId}`;
                if (!fs.existsSync(rootVolumeHostPath)) fs.mkdirSync(rootVolumeHostPath, { recursive: true });
                fs.copySync(volume.volumeMountPath, rootVolumeHostPath);
                shellExec(`kubectl delete pvc ${pvcId} -n ${namespace} --ignore-not-found`);
                shellExec(`kubectl delete pv ${pvId} --ignore-not-found`);
                shellExec(`kubectl apply -f - -n ${namespace} <<EOF
${UnderpostDeploy.API.persistentVolumeFactory({
  hostPath: rootVolumeHostPath,
  pvcId,
})}
EOF
`);
              }
            }
          }

        for (const host of Object.keys(confServer)) {
          if (!options.disableUpdateProxy) {
            shellExec(`sudo kubectl delete HTTPProxy ${host} -n ${namespace} --ignore-not-found`);
            if (UnderpostDeploy.API.isValidTLSContext({ host, env, options }))
              shellExec(`sudo kubectl delete Certificate ${host} -n ${namespace} --ignore-not-found`);
          }
          if (!options.remove) etcHosts.push(host);
        }

        const manifestsPath =
          env === 'production'
            ? `engine-private/conf/${deployId}/build/production`
            : `manifests/deployment/${deployId}-${env}`;

        if (!options.remove) {
          if (!options.disableUpdateDeployment)
            shellExec(`sudo kubectl apply -f ./${manifestsPath}/deployment.yaml -n ${namespace}`);
          if (!options.disableUpdateProxy)
            shellExec(`sudo kubectl apply -f ./${manifestsPath}/proxy.yaml -n ${namespace}`);

          if (UnderpostDeploy.API.isValidTLSContext({ host: Object.keys(confServer)[0], env, options }))
            shellExec(`sudo kubectl apply -f ./${manifestsPath}/secret.yaml -n ${namespace}`);
        }
      }
      if (options.etcHosts === true) {
        const factoryResult = UnderpostDeploy.API.etcHostFactory(etcHosts);
        renderHosts = factoryResult.renderHosts;
      }
      if (renderHosts)
        logger.info(
          `
` + renderHosts,
        );
    },
    /**
     * Retrieves information about a deployment.
     * @param {string} deployId - Deployment ID for which information is being retrieved.
     * @param {string} kindType - Type of Kubernetes resource to retrieve information for (e.g. 'pods').
     * @param {string} namespace - Kubernetes namespace to retrieve information from.
     * @returns {Array<object>} - Array of objects containing information about the deployment.
     * @memberof UnderpostDeploy
     */
    get(deployId, kindType = 'pods', namespace = '') {
      const raw = shellExec(
        `sudo kubectl get ${kindType}${namespace ? ` -n ${namespace}` : ` --all-namespaces`} -o wide`,
        {
          stdout: true,
          disableLog: true,
          silent: true,
        },
      );

      const heads = raw
        .split(`\n`)[0]
        .split(' ')
        .filter((_r) => _r.trim());

      const pods = raw
        .split(`\n`)
        .filter((r) => (deployId ? r.match(deployId) : r.trim() && !r.match('NAME')))
        .map((r) => r.split(' ').filter((_r) => _r.trim()));

      const result = [];

      for (const row of pods) {
        const pod = {};
        let index = -1;
        for (const head of heads) {
          index++;
          pod[head] = row[index];
        }
        result.push(pod);
      }

      return result;
    },
    /**
     * Retrieves the resources factory for a deployment.
     * @returns {object} - Object containing the resources factory for the deployment.
     * @memberof UnderpostDeploy
     */
    resourcesFactory() {
      return {
        requests: {
          memory: UnderpostRootEnv.API.get('resources.requests.memory'),
          cpu: UnderpostRootEnv.API.get('resources.requests.cpu'),
        },
        limits: {
          memory: UnderpostRootEnv.API.get('resources.limits.memory'),
          cpu: UnderpostRootEnv.API.get('resources.limits.cpu'),
        },
        totalPods: UnderpostRootEnv.API.get('total-pods'),
      };
    },
    /**
     * Checks if a container file exists in a pod.
     * @param {object} options - Options for the check.
     * @param {string} options.podName - Name of the pod to check.
     * @param {string} options.path - Path to the container file to check.
     * @returns {boolean} - True if the container file exists, false otherwise.
     * @memberof UnderpostDeploy
     */
    existsContainerFile({ podName, path }) {
      if (podName === 'kind-worker') {
        const isFile = JSON.parse(
          shellExec(`docker exec ${podName} sh -c 'test -f "$1" && echo true || echo false' sh ${path}`, {
            stdout: true,
            disableLog: true,
            silent: true,
          }).trim(),
        );
        const isFolder = JSON.parse(
          shellExec(`docker exec ${podName} sh -c 'test -d "$1" && echo true || echo false' sh ${path}`, {
            stdout: true,
            disableLog: true,
            silent: true,
          }).trim(),
        );
        return isFolder || isFile;
      }
      return JSON.parse(
        shellExec(`kubectl exec ${podName} -- test -f ${path} && echo "true" || echo "false"`, {
          stdout: true,
          disableLog: true,
          silent: true,
        }).trim(),
      );
    },
    /**
     * Checks the status of a deployment.
     * @param {string} deployId - Deployment ID for which the status is being checked.
     * @param {string} env - Environment for which the status is being checked.
     * @param {string} traffic - Current traffic status for the deployment.
     * @param {Array<string>} ignoresNames - List of pod names to ignore.
     * @returns {object} - Object containing the status of the deployment.
     * @memberof UnderpostDeploy
     */
    checkDeploymentReadyStatus(deployId, env, traffic, ignoresNames = []) {
      const cmd = `underpost config get container-status`;
      const pods = UnderpostDeploy.API.get(`${deployId}-${env}-${traffic}`);
      const readyPods = [];
      const notReadyPods = [];
      for (const pod of pods) {
        const { NAME } = pod;
        if (ignoresNames && ignoresNames.find((t) => NAME.trim().toLowerCase().match(t.trim().toLowerCase()))) continue;
        if (
          shellExec(`sudo kubectl exec -i ${NAME} -- sh -c "${cmd}"`, { stdout: true }).match(
            `${deployId}-${env}-running-deployment`,
          )
        ) {
          readyPods.push(pod);
        } else {
          notReadyPods.push(pod);
        }
      }
      return {
        ready: pods.length > 0 && notReadyPods.length === 0,
        notReadyPods,
        readyPods,
      };
    },
    /**
     * Creates a configmap for a deployment.
     * @param {string} env - Environment for which the configmap is being created.
     * @param {string} [namespace='default'] - Kubernetes namespace for the configmap.
     * @memberof UnderpostDeploy
     */
    configMap(env, namespace = 'default') {
      shellExec(`kubectl delete configmap underpost-config -n ${namespace} --ignore-not-found`);
      shellExec(
        `kubectl create configmap underpost-config --from-file=/home/dd/engine/engine-private/conf/dd-cron/.env.${env} --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
      );
    },
    /**
     * Switches the traffic for a deployment.
     * @param {string} deployId - Deployment ID for which the traffic is being switched.
     * @param {string} env - Environment for which the traffic is being switched.
     * @param {string} targetTraffic - Target traffic status for the deployment.
     * @param {number} replicas - Number of replicas for the deployment.
     * @param {string} [namespace='default'] - Kubernetes namespace for the deployment.
     * @memberof UnderpostDeploy
     */
    switchTraffic(deployId, env, targetTraffic, replicas = 1, namespace = 'default') {
      UnderpostRootEnv.API.set(`${deployId}-${env}-traffic`, targetTraffic);
      shellExec(
        `node bin deploy --info-router --build-manifest --traffic ${targetTraffic} --replicas ${replicas} --namespace ${namespace} ${deployId} ${env}`,
      );
      shellExec(`sudo kubectl apply -f ./engine-private/conf/${deployId}/build/${env}/proxy.yaml -n ${namespace}`);
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
        let { volumeName, volumeMountPath, volumeHostPath, volumeType, claimName, configMap, version } = volumeData;
        if (version) {
          volumeName = `${volumeName}-${version}`;
          claimName = claimName ? `${claimName}-${version}` : null;
        }
        _volumeMounts += `
        - name: ${volumeName}
          mountPath: ${volumeMountPath}
`;

        _volumes += `
    - name: ${volumeName}
 ${
   configMap
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
     * @returns {string} - YAML configuration for the persistent volume and claim.
     * @memberof UnderpostDeploy
     */
    persistentVolumeFactory({ hostPath, pvcId }) {
      return fs
        .readFileSync(`./manifests/pv-pvc-dd.yaml`, 'utf8')
        .replace('/home/dd', hostPath)
        .replace('pv-dd', pvcId.replace('pvc-', 'pv-'))
        .replace('pvc-dd', pvcId);
    },

    /**
     * Creates a hosts file for a deployment.
     * @param {Array<string>} hosts - List of hosts to be added to the hosts file.
     * @param {object} options - Options for the hosts file creation.
     * @param {boolean} options.append - Whether to append to the existing hosts file.
     * @returns {object} - Object containing the rendered hosts file.
     * @memberof UnderpostDeploy
     */
    etcHostFactory(hosts = [], options = { append: false }) {
      hosts = hosts.map((host) => {
        try {
          if (!host.startsWith('http')) host = `http://${host}`;
          const hostname = new URL(host).hostname;
          logger.info('Hostname extract valid', { host, hostname });
          return hostname;
        } catch (e) {
          logger.warn('No hostname extract valid', host);
          return host;
        }
      });
      const renderHosts = `127.0.0.1         ${hosts.join(
        ' ',
      )} localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6`;

      if (options && options.append && fs.existsSync(`/etc/hosts`)) {
        fs.writeFileSync(
          `/etc/hosts`,
          fs.readFileSync(`/etc/hosts`, 'utf8') +
            `
${renderHosts}`,
          'utf8',
        );
      } else fs.writeFileSync(`/etc/hosts`, renderHosts, 'utf8');
      return { renderHosts };
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
      env === 'production' &&
      options.cert === true &&
      (!options.certHosts || options.certHosts.split(',').includes(host)),

    /**
     * Monitors the ready status of a deployment.
     * @param {string} deployId - Deployment ID for which the ready status is being monitored.
     * @param {string} env - Environment for which the ready status is being monitored.
     * @param {string} targetTraffic - Target traffic status for the deployment.
     * @param {Array<string>} ignorePods - List of pod names to ignore.
     * @memberof UnderpostDeploy
     */
    async monitorReadyRunner(deployId, env, targetTraffic, ignorePods = []) {
      let checkStatusIteration = 0;
      const checkStatusIterationMsDelay = 1000;
      const iteratorTag = `[${deployId}-${env}-${targetTraffic}]`;
      logger.info('Deployment init', { deployId, env, targetTraffic, checkStatusIterationMsDelay });
      const minReadyOk = 3;
      let readyOk = 0;

      while (readyOk < minReadyOk) {
        const ready = UnderpostDeploy.API.checkDeploymentReadyStatus(deployId, env, targetTraffic, ignorePods).ready;
        if (ready === true) {
          readyOk++;
          logger.info(`${iteratorTag} | Deployment ready. Verification number: ${readyOk}`);
        }
        await timer(checkStatusIterationMsDelay);
        checkStatusIteration++;
        logger.info(
          `${iteratorTag} | Deployment in progress... | Delay number check iterations: ${checkStatusIteration}`,
        );
      }
      logger.info(`${iteratorTag} | Deployment ready. | Total delay number check iterations: ${checkStatusIteration}`);
    },

    /**
     * Retrieves the currently loaded images in the Kubernetes cluster.
     * @returns {Array<object>} - Array of objects containing pod names and their corresponding images.
     * @memberof UnderpostDeploy
     */
    getCurrentLoadedImages(node = 'kind-worker', specContainers = false) {
      if (specContainers) {
        const raw = shellExec(
          `kubectl get pods --all-namespaces -o=jsonpath='{range .items[*]}{"\\n"}{.metadata.namespace}{"/"}{.metadata.name}{":\\t"}{range .spec.containers[*]}{.image}{", "}{end}{end}'`,
          {
            stdout: true,
            silent: true,
          },
        );
        return raw
          .split(`\n`)
          .map((lines) => ({
            pod: lines.split('\t')[0].replaceAll(':', '').trim(),
            image: lines.split('\t')[1] ? lines.split('\t')[1].replaceAll(',', '').trim() : null,
          }))
          .filter((o) => o.image);
      }
      const raw = shellExec(node === 'kind-worker' ? `docker exec -i ${node} crictl images` : `crictl images`, {
        stdout: true,
        silent: true,
      });

      const heads = raw
        .split(`\n`)[0]
        .split(' ')
        .filter((_r) => _r.trim());

      const pods = raw
        .split(`\n`)
        .filter((r) => !r.match('IMAGE'))
        .map((r) => r.split(' ').filter((_r) => _r.trim()));

      const result = [];

      for (const row of pods) {
        if (row.length === 0) continue;
        const pod = {};
        let index = -1;
        for (const head of heads) {
          if (head in pod) continue;
          index++;
          pod[head] = row[index];
        }
        result.push(pod);
      }
      return result;
    },
  };
}

export default UnderpostDeploy;
