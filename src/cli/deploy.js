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
      const deployGroupId = 'dd.router';
      fs.writeFileSync(`./engine-private/deploy/${deployGroupId}`, deployList, 'utf8');
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
        deployGroupId,
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
      return buildPortProxyRouter(env === 'development' ? 80 : 443, buildProxyRouter());
    },
    /**
     * Creates a YAML service configuration for a deployment.
     * @param {string} deployId - Deployment ID for which the service is being created.
     * @param {string} env - Environment for which the service is being created.
     * @param {number} port - Port number for the service.
     * @param {Array<string>} deploymentVersions - List of deployment versions.
     * @returns {string} - YAML service configuration for the specified deployment.
     * @memberof UnderpostDeploy
     */
    deploymentYamlServiceFactory({ deployId, env, port, deploymentVersions }) {
      return deploymentVersions
        .map(
          (version, i) => `    - name: ${deployId}-${env}-${version}-service
          port: ${port}
          weight: ${i === 0 ? 100 : 0}
    `,
        )
        .join('');
    },
    /**
     * Creates a YAML deployment configuration for a deployment.
     * @param {string} deployId - Deployment ID for which the deployment is being created.
     * @param {string} env - Environment for which the deployment is being created.
     * @param {string} suffix - Suffix for the deployment.
     * @param {object} resources - Resource configuration for the deployment.
     * @param {number} replicas - Number of replicas for the deployment.
     * @param {string} image - Docker image for the deployment.
     * @returns {string} - YAML deployment configuration for the specified deployment.
     * @memberof UnderpostDeploy
     */
    deploymentYamlPartsFactory({ deployId, env, suffix, resources, replicas, image }) {
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deployId}-${env}-${suffix}
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
          volumeMounts:
            - name: config-volume
              mountPath: /etc/config
      volumes:
        - name: config-volume
          configMap:
            name: underpost-config
---
apiVersion: v1
kind: Service
metadata:
  name: ${deployId}-${env}-${suffix}-service
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
     * @returns {Promise<void>} - Promise that resolves when the manifest is built.
     * @memberof UnderpostDeploy
     */
    async buildManifest(deployList, env, options) {
      const resources = UnderpostDeploy.API.resourcesFactory();
      const replicas = options.replicas;
      const image = options.image;

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
}).replace('{{ports}}', buildKindPorts(fromPort, toPort))}
`;
        }
        fs.writeFileSync(`./engine-private/conf/${deployId}/build/${env}/deployment.yaml`, deploymentYamlParts, 'utf8');

        let proxyYaml = '';
        let secretYaml = '';

        for (const host of Object.keys(confServer)) {
          if (env === 'production') secretYaml += UnderpostDeploy.API.buildCertManagerCertificate({ host });

          const pathPortAssignment = pathPortAssignmentData[host];
          // logger.info('', { host, pathPortAssignment });
          proxyYaml += `
---
apiVersion: projectcontour.io/v1
kind: HTTPProxy
metadata:
  name: ${host}
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
          for (const conditionObj of pathPortAssignment) {
            const { path, port } = conditionObj;
            proxyYaml += `
    - conditions:
        - prefix: ${path}
      enableWebsockets: true
      services:
    ${UnderpostDeploy.API.deploymentYamlServiceFactory({
      deployId,
      env,
      port,
      deploymentVersions:
        options.traffic && typeof options.traffic === 'string' ? options.traffic.split(',') : ['blue'],
    })}`;
          }
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
     * @returns {string} - Certificate resource YAML for the specified host.
     * @memberof UnderpostDeploy
     */
    buildCertManagerCertificate({ host }) {
      return `
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${host}
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
     * @param {string} deployList - List of deployment IDs to include in the manifest.
     * @param {string} env - Environment for which the manifest is being built.
     * @param {object} options - Options for the manifest build process.
     * @param {string} options.remove - Whether to remove the deployment.
     * @param {string} options.infoRouter - Whether to display router information.
     * @param {string} options.sync - Whether to synchronize the deployment.
     * @param {string} options.buildManifest - Whether to build the manifest.
     * @param {string} options.infoUtil - Whether to display utility information.
     * @param {string} options.expose - Whether to expose the deployment.
     * @param {string} options.cert - Whether to create a certificate.
     * @param {string} options.certHosts - List of hosts for which certificates are being created.
     * @param {string} options.versions - Comma-separated list of versions to deploy.
     * @param {string} options.image - Docker image for the deployment.
     * @param {string} options.traffic - Current traffic status for the deployment.
     * @param {string} options.replicas - Number of replicas for the deployment.
     * @param {string} options.node - Node name for resource allocation.
     * @param {string} options.restoreHosts - Whether to restore hosts.
     * @param {string} options.disableUpdateDeployment - Whether to disable updating the deployment.
     * @param {string} options.disableUpdateProxy - Whether to disable updating the proxy.
     * @param {string} options.status - Whether to display status host machine server and traffic information.
     * @param {string} options.etcHosts - Whether to update /etc/hosts.
     * @returns {Promise<void>} - Promise that resolves when the callback is complete.
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
        status: false,
        etcHosts: false,
      },
    ) {
      if (options.infoUtil === true)
        return logger.info(`
kubectl rollout restart deployment/deployment-name
kubectl rollout undo deployment/deployment-name
kubectl scale statefulsets <stateful-set-name> --replicas=<new-replicas>
kubectl get pods -w
kubectl patch statefulset valkey-service --type='json' -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/image", "value":"valkey/valkey:latest"}]'
kubectl patch statefulset valkey-service -p '{"spec":{"template":{"spec":{"containers":[{"name":"valkey-service","imagePullPolicy":"Never"}]}}}}'
kubectl logs -f <pod-name>
kubectl describe pod <pod-name>
kubectl exec -it <pod-name> -- bash
kubectl exec -it <pod-name> -- sh
docker exec -it kind-control-plane bash
curl -4 -v google.com
kubectl taint nodes <node-name> node-role.kubernetes.io/control-plane:NoSchedule-
kubectl run test-pod --image=busybox:latest --restart=Never -- /bin/sh -c "while true; do sleep 30; done;"
kubectl run test-pod --image=alpine/curl:latest --restart=Never -- sh -c "sleep infinity"
kubectl get ippools -o yaml
kubectl get node <node-name> -o jsonpath='{.spec.podCIDR}'
kubectl patch ippool default-ipv4-ippool --type='json' -p='[{"op": "replace", "path": "/spec/cidr", "value": "10.244.0.0/16"}]'
kubectl patch ippool default-ipv4-ippool --type='json' -p='[{"op": "replace", "path": "/spec/cidr", "value": "192.168.0.0/24"}]'
sudo podman run --rm localhost/<image-name>:<image-version> <command>
kubectl get configmap kubelet-config -n kube-system -o yaml > kubelet-config.yaml
kubectl -n kube-system rollout restart daemonset kube-proxy
kubectl get EndpointSlice -o wide --all-namespaces -w
kubectl apply -k manifests/deployment/adminer/.
kubectl wait --for=condition=Ready pod/busybox1
kubectl wait --for=jsonpath='{.status.phase}'=Running pod/busybox1
kubectl wait --for='jsonpath={.status.conditions[?(@.type=="Ready")].status}=True' pod/busybox1
kubectl wait --for=delete pod/busybox1 --timeout=60s

kubectl run --rm -it test-dns --image=busybox:latest --restart=Never -- /bin/sh -c "
  nslookup kubernetes.default.svc.cluster.local;
  nslookup mongodb-service.default.svc.cluster.local;
  nslookup valkey-service.default.svc.cluster.local;
  nc -vz mongodb-service 27017;
  nc -vz valkey-service 6379;
  echo exit code: \\\$?
"

kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ...
EOF

https://org.ngc.nvidia.com/setup/api-keys
docker login nvcr.io
Username: $oauthtoken
Password: <Your Key>
`);
      if (!deployList && options.certHosts) {
        for (const host of options.certHosts.split(',')) {
          shellExec(`sudo kubectl apply -f - <<EOF
${UnderpostDeploy.API.buildCertManagerCertificate({ host })}
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
      UnderpostDeploy.API.configMap(env);
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

        if (!options.disableUpdateDeployment)
          for (const version of options.versions.split(',')) {
            shellExec(`sudo kubectl delete svc ${deployId}-${env}-${version}-service`);
            shellExec(`sudo kubectl delete deployment ${deployId}-${env}-${version}`);
          }

        const confServer = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));

        for (const host of Object.keys(confServer)) {
          if (!options.disableUpdateProxy) {
            shellExec(`sudo kubectl delete HTTPProxy ${host}`);
            if (UnderpostDeploy.API.isValidTLSContext({ host, env, options }))
              shellExec(`sudo kubectl delete Certificate ${host}`);
          }
          if (!options.remove) etcHosts.push(host);
        }

        const manifestsPath =
          env === 'production'
            ? `engine-private/conf/${deployId}/build/production`
            : `manifests/deployment/${deployId}-${env}`;

        if (!options.remove) {
          if (!options.disableUpdateDeployment) shellExec(`sudo kubectl apply -f ./${manifestsPath}/deployment.yaml`);
          if (!options.disableUpdateProxy) shellExec(`sudo kubectl apply -f ./${manifestsPath}/proxy.yaml`);

          if (UnderpostDeploy.API.isValidTLSContext({ host: Object.keys(confServer)[0], env, options }))
            shellExec(`sudo kubectl apply -f ./${manifestsPath}/secret.yaml`);
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
     * @returns {Array<object>} - Array of objects containing information about the deployment.
     * @memberof UnderpostDeploy
     */
    get(deployId, kindType = 'pods') {
      const raw = shellExec(`sudo kubectl get ${kindType} --all-namespaces -o wide`, {
        stdout: true,
        disableLog: true,
        silent: true,
      });

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
     * @memberof UnderpostDeploy
     */
    configMap(env) {
      shellExec(`kubectl delete configmap underpost-config`);
      shellExec(
        `kubectl create configmap underpost-config --from-file=/home/dd/engine/engine-private/conf/dd-cron/.env.${env}`,
      );
    },
    /**
     * Switches the traffic for a deployment.
     * @param {string} deployId - Deployment ID for which the traffic is being switched.
     * @param {string} env - Environment for which the traffic is being switched.
     * @param {string} targetTraffic - Target traffic status for the deployment.
     * @param {number} replicas - Number of replicas for the deployment.
     * @memberof UnderpostDeploy
     */
    switchTraffic(deployId, env, targetTraffic, replicas = 1) {
      UnderpostRootEnv.API.set(`${deployId}-${env}-traffic`, targetTraffic);
      shellExec(
        `node bin deploy --info-router --build-manifest --traffic ${targetTraffic} --replicas ${replicas} ${deployId} ${env}`,
      );
      shellExec(`sudo kubectl apply -f ./engine-private/conf/${deployId}/build/${env}/proxy.yaml`);
    },
    /**
     * Creates a hosts file for a deployment.
     * @param {Array<string>} hosts - List of hosts to be added to the hosts file.
     * @memberof UnderpostDeploy
     */
    etcHostFactory(hosts = []) {
      const renderHosts = `127.0.0.1         ${hosts.join(
        ' ',
      )} localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6`;

      fs.writeFileSync(`/etc/hosts`, renderHosts, 'utf8');
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
  };
}

export default UnderpostDeploy;
