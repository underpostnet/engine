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
import { DataBaseProvider } from '../db/DataBaseProvider.js';
import UnderpostRootEnv from './env.js';
import UnderpostCluster from './cluster.js';

const logger = loggerFactory(import.meta);

class UnderpostDeploy {
  static NETWORK = {};
  static API = {
    sync(deployList, { versions, replicas }) {
      const deployGroupId = 'dd.tmp';
      fs.writeFileSync(`./engine-private/deploy/${deployGroupId}`, deployList, 'utf8');
      const totalPods = deployList.split(',').length * versions.split(',').length * parseInt(replicas);
      const limitFactor = 0.8;
      const reserveFactor = 0.05;
      const resources = UnderpostCluster.API.getResourcesCapacity();
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
    async routerFactory(deployList, env) {
      const initEnvPath = `./engine-private/conf/${deployList.split(',')[0]}/.env.${env}`;
      const initEnvObj = dotenv.parse(fs.readFileSync(initEnvPath, 'utf8'));
      process.env.PORT = initEnvObj.PORT;
      process.env.NODE_ENV = env;
      await Config.build(undefined, 'proxy', deployList);
      return buildPortProxyRouter(env === 'development' ? 80 : 443, buildProxyRouter());
    },
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
    deploymentYamlPartsFactory({ deployId, env, suffix, resources, replicas }) {
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
          image: localhost/debian:underpost
          resources:
            requests:
              memory: "${resources.requests.memory}"
              cpu: "${resources.requests.cpu}"
            limits:
              memory: "${resources.limits.memory}"
              cpu: "${resources.limits.cpu}"
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
    async buildManifest(deployList, env, options) {
      const resources = UnderpostDeploy.API.resourcesFactory();
      const replicas = options.replicas;

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        const confServer = loadReplicas(
          JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
          'proxy',
        );
        const router = await UnderpostDeploy.API.routerFactory(deployId, env);
        const pathPortAssignmentData = pathPortAssignmentFactory(router, confServer);
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
}).replace('{{ports}}', buildKindPorts(fromPort, toPort))}
`;
        }
        fs.writeFileSync(`./engine-private/conf/${deployId}/build/${env}/deployment.yaml`, deploymentYamlParts, 'utf8');

        let proxyYaml = '';
        let secretYaml = '';

        for (const host of Object.keys(confServer)) {
          if (env === 'production')
            secretYaml += `
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
    getCurrentTraffic(deployId) {
      // kubectl get deploy,sts,svc,configmap,secret -n default -o yaml --export > default.yaml
      const hostTest = Object.keys(
        JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
      )[0];
      const info = shellExec(`sudo kubectl get HTTPProxy/${hostTest} -o yaml`, { silent: true, stdout: true });
      return info.match('blue') ? 'blue' : info.match('green') ? 'green' : null;
    },
    async callback(
      deployList = 'default',
      env = 'development',
      options = {
        remove: false,
        infoRouter: false,
        sync: false,
        buildManifest: false,
        infoUtil: false,
        expose: false,
        cert: false,
        versions: '',
        traffic: '',
        dashboardUpdate: false,
        replicas: '',
        disableUpdateDeployment: false,
        infoTraffic: false,
      },
    ) {
      if (options.infoUtil === true)
        return logger.info(`
kubectl rollout restart deployment/deployment-name
kubectl rollout undo deployment/deployment-name
kubectl scale statefulsets <stateful-set-name> --replicas=<new-replicas>
        `);
      if (deployList === 'dd' && fs.existsSync(`./engine-private/deploy/dd.router`))
        deployList = fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8');
      if (options.infoTraffic === true) {
        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          logger.info('', {
            deployId,
            env,
            traffic: UnderpostDeploy.API.getCurrentTraffic(deployId),
          });
        }
        return;
      }
      if (!(options.versions && typeof options.versions === 'string')) options.versions = 'blue,green';
      if (!options.replicas) options.replicas = 1;
      if (options.sync) UnderpostDeploy.API.sync(deployList, options);
      if (options.buildManifest === true) await UnderpostDeploy.API.buildManifest(deployList, env, options);
      if (options.infoRouter === true) logger.info('router', await UnderpostDeploy.API.routerFactory(deployList, env));
      if (options.dashboardUpdate === true) await UnderpostDeploy.API.updateDashboardData(deployList, env, options);
      if (options.infoRouter === true) return;
      shellExec(`kubectl delete configmap underpost-config`);
      shellExec(
        `kubectl create configmap underpost-config --from-file=/home/dd/engine/engine-private/conf/dd-cron/.env.${env}`,
      );
      const etcHost = (
        concat,
      ) => `127.0.0.1  ${concat} localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6`;
      let concatHots = '';

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
          shellExec(`sudo kubectl delete HTTPProxy ${host}`);
          if (env === 'production' && options.cert === true) shellExec(`sudo kubectl delete Certificate ${host}`);
          if (!options.remove === true && env === 'development') concatHots += ` ${host}`;
        }

        const manifestsPath =
          env === 'production'
            ? `engine-private/conf/${deployId}/build/production`
            : `manifests/deployment/${deployId}-${env}`;

        if (!options.remove === true) {
          if (!options.disableUpdateDeployment) shellExec(`sudo kubectl apply -f ./${manifestsPath}/deployment.yaml`);
          shellExec(`sudo kubectl apply -f ./${manifestsPath}/proxy.yaml`);
          if (env === 'production' && options.cert === true)
            shellExec(`sudo kubectl apply -f ./${manifestsPath}/secret.yaml`);
        }
      }
      let renderHosts;
      switch (process.platform) {
        case 'linux':
          {
            switch (env) {
              case 'development':
                renderHosts = etcHost(concatHots);
                fs.writeFileSync(`/etc/hosts`, renderHosts, 'utf8');

                break;

              default:
                break;
            }
          }
          break;

        default:
          break;
      }
      if (renderHosts)
        logger.info(
          `
` + renderHosts,
        );
    },
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
    async updateDashboardData(deployList, env, options) {
      try {
        const deployId = process.env.DEFAULT_DEPLOY_ID;
        const host = process.env.DEFAULT_DEPLOY_HOST;
        const path = process.env.DEFAULT_DEPLOY_PATH;
        const { db } = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'))[host][
          path
        ];

        await DataBaseProvider.load({ apis: ['instance'], host, path, db });

        /** @type {import('../api/instance/instance.model.js').InstanceModel} */
        const Instance = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Instance;

        await Instance.deleteMany();

        for (const _deployId of deployList.split(',')) {
          const deployId = _deployId.trim();
          if (!deployId) continue;
          const confServer = loadReplicas(
            JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
            'proxy',
          );
          const router = await UnderpostDeploy.API.routerFactory(deployId, env);
          const pathPortAssignmentData = pathPortAssignmentFactory(router, confServer);

          for (const host of Object.keys(confServer)) {
            for (const { path, port } of pathPortAssignmentData[host]) {
              if (!confServer[host][path]) continue;

              const { client, runtime, apis } = confServer[host][path];

              const body = {
                deployId,
                host,
                path,
                port,
                client,
                runtime,
                apis,
              };

              logger.info('save', body);

              await new Instance(body).save();
            }
          }
        }

        await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
      } catch (error) {
        logger.error(error, error.stack);
      }
    },
  };
}

export default UnderpostDeploy;
