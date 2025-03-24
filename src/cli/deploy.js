import {
  buildKindPorts,
  buildPortProxyRouter,
  buildProxyRouter,
  Config,
  getDataDeploy,
  loadReplicas,
} from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

class UnderpostDeploy {
  static API = {
    sync(deployList) {
      const deployGroupId = 'dd.tmp';
      fs.writeFileSync(`./engine-private/deploy/${deployGroupId}`, deployList, 'utf8');
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
    async buildManifest(deployList, env, version) {
      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;

        const router = await UnderpostDeploy.API.routerFactory(deployId, env);
        const ports = Object.values(router).map((p) => parseInt(p.split(':')[2]));
        const fromPort = Math.min(...ports);
        const toPort = Math.max(...ports);
        const confServer = loadReplicas(
          JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
          'proxy',
        );

        fs.mkdirSync(`./engine-private/conf/${deployId}/build/${env}`, { recursive: true });
        if (env === 'development') fs.mkdirSync(`./manifests/deployment/${deployId}-${env}`, { recursive: true });

        logger.info('port range', { deployId, fromPort, toPort });

        const deploymentYamlParts = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deployId}-${env}
  labels:
    app: ${deployId}-${env}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${deployId}-${env}
  template:
    metadata:
      labels:
        app: ${deployId}-${env}
    spec:
      containers:
        - name: ${deployId}-${env}
          image: localhost/underpost-engine:${version && typeof version === 'string' ? version : Underpost.version}
          lifecycle:
            postStart:
              exec:
                command:
                  - /bin/sh
                  - -c
                  - >
                    sleep 60 &&
                    underpost config set deploy-id ${deployId} &&
                    underpost config set deploy-env ${env}
# image: localhost/${deployId}-${env}:${version && typeof version === 'string' ? version : Underpost.version}
---
apiVersion: v1
kind: Service
metadata:
  name: ${deployId}-${env}-service
spec:
  selector:
    app: ${deployId}-${env}
  ports:
  type: LoadBalancer`.split('ports:');
        deploymentYamlParts[1] =
          buildKindPorts(fromPort, toPort) +
          `  type: LoadBalancer
`;

        fs.writeFileSync(
          `./engine-private/conf/${deployId}/build/${env}/deployment.yaml`,
          deploymentYamlParts.join(`ports:
`),
        );

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

          const pathPortConditions = [];
          for (const path of Object.keys(confServer[host])) {
            const { peer } = confServer[host][path];
            if (!router[`${host}${path === '/' ? '' : path}`]) continue;
            const port = parseInt(router[`${host}${path === '/' ? '' : path}`].split(':')[2]);
            // logger.info('', { host, port, path });
            pathPortConditions.push({
              port,
              path,
            });

            if (peer) {
              //  logger.info('', { host, port: port + 1, path: '/peer' });
              pathPortConditions.push({
                port: port + 1,
                path: '/peer',
              });
            }
          }

          // logger.info('', { host, pathPortConditions });
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
          for (const conditionObj of pathPortConditions) {
            const { path, port } = conditionObj;
            proxyYaml += `
    - conditions:
        - prefix: ${path}
      enableWebsockets: true
      services:
        - name: ${deployId}-${env}-service
          port: ${port}`;
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
        version: '',
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
      if (options.sync) UnderpostDeploy.API.sync(deployList);
      if (options.buildManifest === true) await UnderpostDeploy.API.buildManifest(deployList, env, options.version);
      if (options.infoRouter === true)
        return logger.info('router', await UnderpostDeploy.API.routerFactory(deployList, env));
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
        shellExec(`sudo kubectl delete svc ${deployId}-${env}-service`);
        shellExec(`sudo kubectl delete deployment ${deployId}-${env}`);

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
          shellExec(`sudo kubectl apply -f ./${manifestsPath}/deployment.yaml`);
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
  };
}

export default UnderpostDeploy;
