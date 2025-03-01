import fs from 'fs-extra';
import dotenv from 'dotenv';
import {
  capFirst,
  getCapVariableName,
  newInstance,
  orderArrayFromAttrInt,
  range,
  timer,
} from '../client/components/core/CommonJs.js';
import * as dir from 'path';
import cliProgress from 'cli-progress';
import cliSpinners from 'cli-spinners';
import logUpdate from 'log-update';
import colors from 'colors';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
import { DefaultConf } from '../../conf.js';
import read from 'read';
import splitFile from 'split-file';
import axios from 'axios';
import https from 'https';
import { ssrFactory } from './client-formatted.js';

// axios.defaults.baseURL = BASE_URL;

// const httpsAgent = new https.Agent({
//   rejectUnauthorized: false,
// });

// axios.defaults.httpsAgent = httpsAgent;

colors.enable();

dotenv.config();

const logger = loggerFactory(import.meta);

// monitoring: https://app.pm2.io/

const Config = {
  default: DefaultConf,
  build: async function (options = { folder: '' }) {
    if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`, { recursive: true });
    fs.writeFileSync(`./tmp/await-deploy`, '', 'utf8');
    if (fs.existsSync(`./engine-private/conf/${process.argv[2]}`)) return loadConf(process.argv[2]);
    if (fs.existsSync(`./engine-private/replica/${process.argv[2]}`)) return loadConf(process.argv[2]);

    if (process.argv[2] === 'deploy') return;

    if (process.argv[2] === 'proxy') {
      this.default.server = {};
      for (const deployId of process.argv[3].split(',')) {
        let confPath = `./engine-private/conf/${deployId}/conf.server.json`;
        const privateConfDevPath = fs.existsSync(`./engine-private/replica/${deployId}/conf.server.json`)
          ? `./engine-private/replica/${deployId}/conf.server.json`
          : `./engine-private/conf/${deployId}/conf.server.dev.${process.argv[4]}.json`;
        const confDevPath = fs.existsSync(privateConfDevPath)
          ? privateConfDevPath
          : `./engine-private/conf/${deployId}/conf.server.dev.json`;

        if (process.env.NODE_ENV === 'development' && fs.existsSync(confDevPath)) confPath = confDevPath;
        const serverConf = JSON.parse(fs.readFileSync(confPath, 'utf8'));

        for (const host of Object.keys(loadReplicas(serverConf))) {
          if (serverConf[host]['/'])
            this.default.server[host] = {
              ...this.default.server[host],
              ...serverConf[host],
            };
          else
            this.default.server[host] = {
              ...serverConf[host],
              ...this.default.server[host],
            };
        }
      }
    }
    if (!options || !options.folder)
      options = {
        ...options,
        folder: `./conf`,
      };
    if (!fs.existsSync(options.folder)) fs.mkdirSync(options.folder, { recursive: true });
    for (const confType of Object.keys(this.default)) {
      fs.writeFileSync(
        `${options.folder}/conf.${confType}.json`,
        JSON.stringify(this.default[confType], null, 4),
        'utf8',
      );
    }
  },
};

const loadConf = (deployId, envInput) => {
  const folder = fs.existsSync(`./engine-private/replica/${deployId}`)
    ? `./engine-private/replica/${deployId}`
    : `./engine-private/conf/${deployId}`;
  if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
  if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`, { recursive: true });
  const isValidDeployId = fs.existsSync(`${folder}`);
  if (!isValidDeployId) {
    logger.info(`Save new deploy conf: '${deployId}'`);
    shellExec(`node bin/deploy save ${deployId}`);
    return loadConf(deployId);
  }
  for (const typeConf of Object.keys(Config.default)) {
    let srcConf = isValidDeployId
      ? fs.readFileSync(`${folder}/conf.${typeConf}.json`, 'utf8')
      : JSON.stringify(Config.default[typeConf]);
    if (process.env.NODE_ENV === 'development' && typeConf === 'server') {
      const devConfPath = `${folder}/conf.${typeConf}.dev${process.argv[3] ? `.${process.argv[3]}` : ''}.json`;
      if (fs.existsSync(devConfPath)) srcConf = fs.readFileSync(devConfPath, 'utf8');
    }
    if (typeConf === 'server') srcConf = JSON.stringify(loadReplicas(JSON.parse(srcConf)), null, 4);
    fs.writeFileSync(`./conf/conf.${typeConf}.json`, srcConf, 'utf8');
  }
  fs.writeFileSync(`./.env.production`, fs.readFileSync(`${folder}/.env.production`, 'utf8'), 'utf8');
  fs.writeFileSync(`./.env.development`, fs.readFileSync(`${folder}/.env.development`, 'utf8'), 'utf8');
  fs.writeFileSync(`./.env.test`, fs.readFileSync(`${folder}/.env.test`, 'utf8'), 'utf8');
  const NODE_ENV = envInput || process.env.NODE_ENV;
  if (NODE_ENV) {
    fs.writeFileSync(`./.env`, fs.readFileSync(`${folder}/.env.${NODE_ENV}`, 'utf8'), 'utf8');
    const env = dotenv.parse(fs.readFileSync(`${folder}/.env.${NODE_ENV}`, 'utf8'));
    process.env = {
      ...process.env,
      ...env,
    };
  }
  const originPackageJson = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(`${folder}/package.json`, 'utf8'));
  originPackageJson.scripts.start = packageJson.scripts.start;
  packageJson.scripts = originPackageJson.scripts;
  fs.writeFileSync(`./package.json`, JSON.stringify(packageJson, null, 4), 'utf8');
  return { folder, deployId };
};

const loadReplicas = (confServer) => {
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      const { replicas, singleReplica } = confServer[host][path];
      if (
        replicas &&
        (process.argv[2] === 'proxy' ||
          !singleReplica ||
          (singleReplica && process.env.NODE_ENV === 'development' && !process.argv[3]))
      )
        for (const replicaPath of replicas) {
          confServer[host][replicaPath] = newInstance(confServer[host][path]);
          delete confServer[host][replicaPath].replicas;
          delete confServer[host][replicaPath].singleReplica;
        }
    }
  }
  return confServer;
};

const cloneConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const toClientVariableName = getCapVariableName(toOptions.clientId);
  const fromClientVariableName = getCapVariableName(fromOptions.clientId);

  const formattedSrc = (dataConf) =>
    JSON.stringify(dataConf, null, 4)
      .replaceAll(fromClientVariableName, toClientVariableName)
      .replaceAll(fromOptions.clientId, toOptions.clientId);

  const isMergeConf = fs.existsSync(confToFolder);
  if (!isMergeConf) fs.mkdirSync(confToFolder, { recursive: true });

  fs.writeFileSync(
    `${confToFolder}/.env.production`,
    fs.readFileSync(`${confFromFolder}/.env.production`, 'utf8'),
    'utf8',
  );
  fs.writeFileSync(
    `${confToFolder}/.env.development`,
    fs.readFileSync(`${confFromFolder}/.env.development`, 'utf8'),
    'utf8',
  );
  fs.writeFileSync(`${confToFolder}/.env.test`, fs.readFileSync(`${confFromFolder}/.env.test`, 'utf8'), 'utf8');

  for (const confTypeId of ['server', 'client', 'cron', 'ssr']) {
    const confFromData = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.${confTypeId}.json`, 'utf8'));
    fs.writeFileSync(`${confToFolder}/conf.${confTypeId}.json`, formattedSrc(confFromData), 'utf8');
  }

  const packageData = JSON.parse(fs.readFileSync(`${confFromFolder}/package.json`, 'utf8'));
  packageData.scripts.start = packageData.scripts.start.replaceAll(fromOptions.deployId, toOptions.deployId);
  fs.writeFileSync(`${confToFolder}/package.json`, JSON.stringify(packageData, null, 4), 'utf8');
};

const addClientConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const toClientConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.client.json`, 'utf8'));
  const fromClientConf = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.client.json`, 'utf8'));

  const toClientVariableName = getCapVariableName(toOptions.clientId);
  const fromClientVariableName = getCapVariableName(fromOptions.clientId);

  const { host, path } = toOptions;

  toClientConf[fromOptions.clientId] = fromClientConf[fromOptions.clientId];

  fs.writeFileSync(`${confToFolder}/conf.client.json`, JSON.stringify(toClientConf, null, 4), 'utf8');

  const toServerConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));
  const fromServerConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));

  toServerConf[host][path].client = fromOptions.clientId;
  toServerConf[host][path].runtime = 'nodejs';
  toServerConf[host][path].apis = fromClientConf[fromOptions.clientId].services;

  fs.writeFileSync(`${confToFolder}/conf.server.json`, JSON.stringify(toServerConf, null, 4), 'utf8');

  const fromSsrConf = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.ssr.json`, 'utf8'));
  const toSsrConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.ssr.json`, 'utf8'));

  toSsrConf[fromClientVariableName] = fromSsrConf[fromClientVariableName];

  fs.writeFileSync(`${confToFolder}/conf.ssr.json`, JSON.stringify(toSsrConf, null, 4), 'utf8');
};

const buildClientSrc = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./src/client/components/${fromOptions.clientId}`;
  const confToFolder = `./src/client/components/${toOptions.clientId}`;

  const toClientVariableName = getCapVariableName(toOptions.clientId);
  const fromClientVariableName = getCapVariableName(fromOptions.clientId);

  const formattedSrc = (src) =>
    src.replaceAll(fromClientVariableName, toClientVariableName).replaceAll(fromOptions.clientId, toOptions.clientId);

  const isMergeConf = fs.existsSync(confToFolder);
  if (!isMergeConf) fs.mkdirSync(confToFolder, { recursive: true });

  const files = await fs.readdir(confFromFolder, { recursive: true });
  for (const relativePath of files) {
    const fromFilePath = dir.resolve(`${confFromFolder}/${relativePath}`);
    const toFilePath = dir.resolve(`${confToFolder}/${relativePath}`);

    fs.writeFileSync(formattedSrc(toFilePath), formattedSrc(fs.readFileSync(fromFilePath, 'utf8')), 'utf8');
  }

  fs.writeFileSync(
    `./src/client/ssr/head/${toClientVariableName}Scripts.js`,
    formattedSrc(fs.readFileSync(`./src/client/ssr/head/${fromClientVariableName}Scripts.js`, 'utf8')),
    'utf8',
  );

  fs.writeFileSync(
    `./src/client/${toClientVariableName}.index.js`,
    formattedSrc(fs.readFileSync(`./src/client/${fromClientVariableName}.index.js`, 'utf8')),
    'utf8',
  );

  fs.copySync(`./src/client/public/${fromOptions.clientId}`, `./src/client/public/${toOptions.clientId}`);
};

const buildApiSrc = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { apiId: 'default', deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.apiId) fromOptions.apiId = fromDefaultOptions.apiId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const toClientVariableName = getCapVariableName(toOptions.apiId);
  const fromClientVariableName = getCapVariableName(fromOptions.apiId);

  const formattedSrc = (src) =>
    src.replaceAll(fromClientVariableName, toClientVariableName).replaceAll(fromOptions.apiId, toOptions.apiId);

  const apiToFolder = `./src/api/${toOptions.apiId}`;
  const apiFromFolder = `./src/api/${fromOptions.apiId}`;

  const isMergeConf = fs.existsSync(apiToFolder);
  if (!isMergeConf) fs.mkdirSync(apiToFolder, { recursive: true });

  for (const srcApiType of ['model', 'controller', 'service', 'router']) {
    fs.writeFileSync(
      `${apiToFolder}/${toOptions.apiId}.${srcApiType}.js`,
      formattedSrc(fs.readFileSync(`${apiFromFolder}/${fromOptions.apiId}.${srcApiType}.js`, 'utf8')),
      'utf8',
    );
  }

  fs.mkdirSync(`./src/client/services/${toOptions.apiId}`, { recursive: true });
  if (fs.existsSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.service.js`))
    fs.writeFileSync(
      `./src/client/services/${toOptions.apiId}/${toOptions.apiId}.service.js`,
      formattedSrc(
        fs.readFileSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.service.js`, 'utf8'),
      ),
      'utf8',
    );
  return;
  if (fs.existsSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.management.js`))
    fs.writeFileSync(
      `./src/client/services/${toOptions.apiId}/${toOptions.apiId}.management.js`,
      formattedSrc(
        fs.readFileSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.management.js`, 'utf8'),
      ),
      'utf8',
    );
};

const addApiConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { apiId: 'default', deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.apiId) fromOptions.apiId = fromDefaultOptions.apiId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const toClientVariableName = getCapVariableName(toOptions.apiId);
  const fromClientVariableName = getCapVariableName(fromOptions.apiId);

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const confServer = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));
  for (const host of Object.keys(confServer))
    for (const path of Object.keys(confServer[host]))
      if (confServer[host][path].apis) confServer[host][path].apis.push(toOptions.apiId);
  fs.writeFileSync(`${confToFolder}/conf.server.json`, JSON.stringify(confServer, null, 4), 'utf8');

  const confClient = JSON.parse(fs.readFileSync(`${confToFolder}/conf.client.json`, 'utf8'));
  confClient[toOptions.clientId].services.push(toOptions.apiId);
  fs.writeFileSync(`${confToFolder}/conf.client.json`, JSON.stringify(confClient, null, 4), 'utf8');
};

const addWsConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { wsId: 'default', deployId: 'dd-default', host: 'default.net', paths: '/' },
) => {
  if (!fromOptions.wsId) fromOptions.wsId = fromDefaultOptions.wsId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.host) fromOptions.host = fromDefaultOptions.host;
  if (!fromOptions.paths) fromOptions.paths = fromDefaultOptions.paths;

  const toClientVariableName = getCapVariableName(toOptions.apiId);
  const fromClientVariableName = getCapVariableName(fromOptions.apiId);

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const paths = toOptions.paths.split(',');

  const confServer = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));
  for (const host of Object.keys(confServer))
    for (const path of Object.keys(confServer[host]))
      if (host === toOptions.host && paths.includes(path) && confServer[host][path])
        confServer[host][path].ws = toOptions.wsId;
  fs.writeFileSync(`${confToFolder}/conf.server.json`, JSON.stringify(confServer, null, 4), 'utf8');
};

const buildWsSrc = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { wsId: 'default', deployId: 'dd-default', host: 'default.net', paths: '/' },
) => {
  if (!fromOptions.wsId) fromOptions.wsId = fromDefaultOptions.wsId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.host) fromOptions.host = fromDefaultOptions.host;
  if (!fromOptions.paths) fromOptions.paths = fromDefaultOptions.paths;

  const toClientVariableName = getCapVariableName(toOptions.wsId);
  const fromClientVariableName = getCapVariableName(fromOptions.wsId);

  const confFromFolder = `./src/ws/${fromOptions.wsId}`;
  const confToFolder = `./src/ws/${toOptions.wsId}`;

  const paths = toOptions.paths.split(',');

  const formattedSrc = (src) =>
    src.replaceAll(fromClientVariableName, toClientVariableName).replaceAll(fromOptions.wsId, toOptions.wsId);

  const files = await fs.readdir(confFromFolder, { recursive: true });
  for (const relativePath of files) {
    const fromFilePath = dir.resolve(`${confFromFolder}/${relativePath}`);
    const toFilePath = dir.resolve(`${confToFolder}/${relativePath}`);

    if (fs.lstatSync(fromFilePath).isDirectory() && !fs.existsSync(formattedSrc(toFilePath)))
      fs.mkdirSync(formattedSrc(toFilePath), { recursive: true });

    if (fs.lstatSync(fromFilePath).isFile() && !fs.existsSync(formattedSrc(toFilePath))) {
      fs.writeFileSync(formattedSrc(toFilePath), formattedSrc(fs.readFileSync(fromFilePath, 'utf8')), 'utf8');
    }
  }
};

const cloneSrcComponents = async ({ toOptions, fromOptions }) => {
  const toClientVariableName = getCapVariableName(toOptions.componentsFolder);
  const fromClientVariableName = getCapVariableName(fromOptions.componentsFolder);

  const formattedSrc = (src) =>
    src
      .replaceAll(fromClientVariableName, toClientVariableName)
      .replaceAll(fromOptions.componentsFolder, toOptions.componentsFolder);

  const confFromFolder = `./src/client/components/${fromOptions.componentsFolder}`;
  const confToFolder = `./src/client/components/${toOptions.componentsFolder}`;

  fs.mkdirSync(confToFolder, { recursive: true });

  const files = await fs.readdir(confFromFolder);
  for (const relativePath of files) {
    const fromFilePath = dir.resolve(`${confFromFolder}/${relativePath}`);
    const toFilePath = dir.resolve(`${confToFolder}/${relativePath}`);

    fs.writeFileSync(formattedSrc(toFilePath), formattedSrc(fs.readFileSync(fromFilePath, 'utf8')), 'utf8');
  }
};

const buildProxyRouter = () => {
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  let currentPort = parseInt(process.env.PORT) + 1;
  const proxyRouter = {};
  const singleReplicaHosts = [];
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      if (confServer[host][path].singleReplica && !singleReplicaHosts.includes(host)) {
        singleReplicaHosts.push(host);
        currentPort++;
        continue;
      }
      confServer[host][path].port = newInstance(currentPort);
      for (const port of confServer[host][path].proxy) {
        if (!(port in proxyRouter)) proxyRouter[port] = {};
        proxyRouter[port][`${host}${path}`] = {
          // target: `http://${host}:${confServer[host][path].port}${path}`,
          target: `http://localhost:${confServer[host][path].port - singleReplicaHosts.length}`,
          // target: `http://127.0.0.1:${confServer[host][path].port}`,
          proxy: confServer[host][path].proxy,
          redirect: confServer[host][path].redirect,
          host,
          path,
        };
      }
      currentPort++;
      if (confServer[host][path].peer) {
        const peerPath = path === '/' ? `/peer` : `${path}/peer`;
        confServer[host][peerPath] = newInstance(confServer[host][path]);
        confServer[host][peerPath].port = newInstance(currentPort);
        for (const port of confServer[host][path].proxy) {
          if (!(port in proxyRouter)) proxyRouter[port] = {};
          proxyRouter[port][`${host}${peerPath}`] = {
            // target: `http://${host}:${confServer[host][peerPath].port}${peerPath}`,
            target: `http://localhost:${confServer[host][peerPath].port - singleReplicaHosts.length}`,
            // target: `http://127.0.0.1:${confServer[host][peerPath].port}`,
            proxy: confServer[host][peerPath].proxy,
            host,
            path: peerPath,
          };
        }
        currentPort++;
      }
    }
  }
  if (process.argv.includes('maintenance'))
    (async () => {
      globalThis.defaultHtmlSrcMaintenance = (await ssrFactory())({
        title: 'Site in maintenance',
        ssrPath: '/',
        ssrHeadComponents: '',
        ssrBodyComponents: (await ssrFactory(`./src/client/ssr/offline/Maintenance.js`))(),
      });
    })();

  return proxyRouter;
};

const buildKindPorts = (from, to) =>
  range(parseInt(from), parseInt(to))
    .map(
      (port) => `    - name: 'tcp-${port}'
      protocol: TCP
      port: ${port}
      targetPort: ${port}
    - name: 'udp-${port}'
      protocol: UDP
      port: ${port}
      targetPort: ${port}
`,
    )
    .join('\n');

const buildPortProxyRouter = (port, proxyRouter) => {
  const hosts = proxyRouter[port];
  const router = {};
  // build router
  Object.keys(hosts).map((hostKey) => {
    let { host, path, target, proxy, peer } = hosts[hostKey];
    if (process.argv.includes('localhost') && process.env.NODE_ENV === 'development') host = `localhost`;

    if (!proxy.includes(port)) return;
    const absoluteHost = [80, 443].includes(port)
      ? `${host}${path === '/' ? '' : path}`
      : `${host}:${port}${path === '/' ? '' : path}`;

    if (process.argv.includes('localhost') && !(absoluteHost in router)) router[absoluteHost] = target;
    else router[absoluteHost] = target;
  }); // order router

  if (Object.keys(router).length === 0) return router;

  const reOrderRouter = {};
  for (const absoluteHostKey of orderArrayFromAttrInt(Object.keys(router), 'length'))
    reOrderRouter[absoluteHostKey] = router[absoluteHostKey];

  return reOrderRouter;
};

const cliBar = async (time = 5000) => {
  // create new progress bar
  const b = new cliProgress.SingleBar({
    format: 'Delay | {bar} | {percentage}% || {value}/{total} Chunks || Speed: {speed}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  const maxValueDisplay = 200;
  const minValueDisplay = 0;
  const steps = 10;
  const incrementValue = 200 / steps;
  const delayTime = time / steps;
  // initialize the bar - defining payload token "speed" with the default value "N/A"
  b.start(maxValueDisplay, minValueDisplay, {
    speed: 'N/A',
  });

  // update values
  // b1.increment();
  // b1.update(20);

  for (const step of range(1, steps)) {
    b.increment(incrementValue);
    await timer(delayTime);
  }

  // stop the bar
  b.stop();
};

const cliSpinner = async (time = 5000, message0, message1, color, type = 'dots') => {
  const { frames, interval } = cliSpinners[type];
  const steps = parseInt(time / interval);
  let index = 0;
  for (const step of range(1, steps)) {
    const msg = `${message0 ? message0 : ''}${frames[index]}${message1 ? message1 : ''}`;
    logUpdate(color ? msg[color] : msg);
    await timer(interval);
    index++;
    if (index === frames.length) index = 0;
  }
};

const buildReplicaId = ({ deployId, replica }) => `${deployId}-${replica.slice(1)}`;

const getDataDeploy = (
  options = { buildSingleReplica: false, deployGroupId: '', deployId: '', disableSyncEnvPort: false },
) => {
  let dataDeploy = JSON.parse(fs.readFileSync(`./engine-private/deploy/${options.deployGroupId}.json`, 'utf8'));

  if (options.deployId) dataDeploy = dataDeploy.filter((d) => d === options.deployId);

  dataDeploy = dataDeploy.map((deployId) => {
    return {
      deployId,
    };
  });

  if (options && options.buildSingleReplica && fs.existsSync(`./engine-private/replica`))
    fs.removeSync(`./engine-private/replica`);

  let buildDataDeploy = [];
  for (const deployObj of dataDeploy) {
    const serverConf = loadReplicas(
      JSON.parse(fs.readFileSync(`./engine-private/conf/${deployObj.deployId}/conf.server.json`, 'utf8')),
    );
    let replicaDataDeploy = [];
    for (const host of Object.keys(serverConf))
      for (const path of Object.keys(serverConf[host])) {
        if (serverConf[host][path].replicas && serverConf[host][path].singleReplica) {
          if (options && options.buildSingleReplica) shellExec(Cmd.replica(deployObj.deployId, host, path));
          replicaDataDeploy = replicaDataDeploy.concat(
            serverConf[host][path].replicas.map((r) => {
              return {
                deployId: buildReplicaId({ deployId: deployObj.deployId, replica: r }),
                replicaHost: host,
              };
            }),
          );
        }
      }
    buildDataDeploy.push(deployObj);
    if (replicaDataDeploy.length > 0) buildDataDeploy = buildDataDeploy.concat(replicaDataDeploy);
  }

  const enableSyncEnvPort = !options.disableSyncEnvPort && options.buildSingleReplica;
  if (enableSyncEnvPort) shellExec(Cmd.syncPorts(options.deployGroupId));

  logger.info('buildDataDeploy', { buildDataDeploy, enableSyncEnvPort });

  return buildDataDeploy;
};

const validateTemplatePath = (absolutePath = '') => {
  const host = 'default.net';
  const path = '/';
  const client = 'default';
  const ssr = 'Default';
  const confServer = DefaultConf.server[host][path];
  const confClient = DefaultConf.client[client];
  const confSsr = DefaultConf.ssr[ssr];
  const clients = Object.keys(confClient).concat(['core', 'test', 'default', 'user']);

  if (absolutePath.match('src/api') && !confServer.apis.find((p) => absolutePath.match(`src/api/${p}/`))) {
    return false;
  }
  if (absolutePath.match('conf.dd-') && absolutePath.match('.js')) return false;
  if (
    absolutePath.match('src/client/services/') &&
    !clients.find((p) => absolutePath.match(`src/client/services/${p}/`))
  ) {
    return false;
  }
  if (absolutePath.match('src/client/public/') && !clients.find((p) => absolutePath.match(`src/client/public/${p}/`))) {
    return false;
  }
  if (
    absolutePath.match('src/client/components/') &&
    !clients.find((p) => absolutePath.match(`src/client/components/${p}/`))
  ) {
    return false;
  }
  if (absolutePath.match('src/client/sw/') && !clients.find((p) => absolutePath.match(`src/client/sw/${p}.sw.js`))) {
    return false;
  }
  if (
    absolutePath.match('src/client/ssr/body') &&
    !confSsr.body.find((p) => absolutePath.match(`src/client/ssr/body/${p}.js`))
  ) {
    return false;
  }
  if (
    absolutePath.match('src/client/ssr/head') &&
    !confSsr.head.find((p) => absolutePath.match(`src/client/ssr/head/${p}.js`))
  ) {
    return false;
  }
  if (
    absolutePath.match('src/client/ssr/mailer') &&
    !Object.keys(confSsr.mailer).find((p) => absolutePath.match(`src/client/ssr/mailer/${confSsr.mailer[p]}.js`))
  ) {
    return false;
  }
  if (
    absolutePath.match('src/client/ssr/offline') &&
    !confSsr.offline.find((p) => absolutePath.match(`src/client/ssr/offline/${p.client}.js`))
  ) {
    return false;
  }
  if (
    absolutePath.match('src/client/ssr/pages') &&
    !confSsr.pages.find((p) => absolutePath.match(`src/client/ssr/pages/${p.client}.js`))
  ) {
    return false;
  }
  if (absolutePath.match('hardhat/')) return false;
  if (
    absolutePath.match('/client') &&
    absolutePath.match('.index.js') &&
    !absolutePath.match('/offline') &&
    !clients.find((p) => absolutePath.match(`src/client/${capFirst(p)}.index.js`))
  ) {
    return false;
  }
  if (absolutePath.match('src/ws/') && !clients.find((p) => absolutePath.match(`src/ws/${p}/`))) {
    return false;
  }
  return true;
};

const deployTest = async (dataDeploy) => {
  const failed = [];
  for (const deploy of dataDeploy) {
    const deployServerConfPath = fs.existsSync(`./engine-private/replica/${deploy.deployId}/conf.server.json`)
      ? `./engine-private/replica/${deploy.deployId}/conf.server.json`
      : `./engine-private/conf/${deploy.deployId}/conf.server.json`;
    const serverConf = loadReplicas(JSON.parse(fs.readFileSync(deployServerConfPath, 'utf8')));
    let fail = false;
    for (const host of Object.keys(serverConf))
      for (const path of Object.keys(serverConf[host])) {
        const { singleReplica } = serverConf[host][path];
        if (singleReplica) continue;
        const urlTest = `https://${host}${path}`;
        try {
          const result = await axios.get(urlTest, { timeout: 10000 });
          const test = result.data.split('<title>');
          if (test[1])
            logger.info('Success deploy', {
              ...deploy,
              result: test[1].split('</title>')[0],
              urlTest,
            });
          else {
            logger.error('Error deploy', {
              ...deploy,
              result: result.data,
              urlTest,
            });
            fail = true;
          }
        } catch (error) {
          logger.error('Error deploy', {
            ...deploy,
            message: error.message,
            urlTest,
          });
          fail = true;
        }
      }
    if (fail) failed.push(deploy);
  }
  return { failed };
};

const getDeployGroupId = () => {
  const deployGroupIndexArg = process.argv.findIndex((a) => a.match(`deploy-group:`));
  if (deployGroupIndexArg > -1) return process.argv[deployGroupIndexArg].split(':')[1].trim();
  return 'dd';
};

const getDeployId = () => {
  const deployIndexArg = process.argv.findIndex((a) => a.match(`deploy-id:`));
  if (deployIndexArg > -1) return process.argv[deployIndexArg].split(':')[1].trim();
  for (const deployId of process.argv) {
    if (fs.existsSync(`./engine-private/conf/${deployId}`)) return deployId;
    else if (fs.existsSync(`./engine-private/replica/${deployId}`)) return deployId;
  }
  return 'default';
};

const getCronBackUpFolder = (host = '', path = '') => {
  return `${host}${path.replace(/\\/g, '/').replace(`/`, '-')}`;
};

const execDeploy = async (options = { deployId: 'default' }, currentAttempt = 1) => {
  const { deployId } = options;
  shellExec(Cmd.delete(deployId));
  shellExec(Cmd.conf(deployId));
  shellExec(Cmd.run(deployId));
  const maxTime = 1000 * 60;
  const minTime = 20 * 1000;
  const intervalTime = 1000;
  return await new Promise(async (resolve) => {
    let currentTime = 0;
    const attempt = () => {
      if (currentTime >= minTime && !fs.existsSync(`./tmp/await-deploy`)) {
        clearInterval(processMonitor);
        return resolve(true);
      }
      cliSpinner(
        intervalTime,
        `[deploy.js] `,
        ` Load instance | attempt:${currentAttempt} | elapsed time ${currentTime / 1000}s / ${maxTime / 1000}s`,
        'yellow',
        'material',
      );
      currentTime += intervalTime;
      if (currentTime >= maxTime) {
        clearInterval(processMonitor);
        return resolve(false);
      }
    };
    const processMonitor = setInterval(attempt, intervalTime);
  });
};

const deployRun = async (dataDeploy, currentAttempt = 1) => {
  if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`, { recursive: true });
  await fixDependencies();
  const maxAttempts = 3;
  for (const deploy of dataDeploy) {
    let currentAttempt = 1;
    const attempt = async () => {
      const success = await execDeploy(deploy, currentAttempt);
      currentAttempt++;
      if (!success && currentAttempt <= maxAttempts) await attempt();
    };
    await attempt();
  }
  const { failed } = await deployTest(dataDeploy);
  if (failed.length > 0) {
    for (const deploy of failed) logger.error(deploy.deployId, Cmd.run(deploy.deployId));
    if (currentAttempt === maxAttempts) return logger.error(`max deploy attempts exceeded`);
    if (process.argv.includes('manual')) await read({ prompt: 'Press enter to retry failed processes\n' });
    currentAttempt++;
    await deployRun(failed, currentAttempt);
  } else logger.info(`Deploy process successfully`);
};

const restoreMacroDb = async (deployGroupId = '', deployId = null) => {
  const dataDeploy = await getDataDeploy({ deployGroupId, buildSingleReplica: false });
  for (const deployGroup of dataDeploy) {
    if (deployId && deployGroup.deployId !== deployId) continue;
    if (!deployGroup.replicaHost) {
      const deployServerConfPath = `./engine-private/conf/${deployGroup.deployId}/conf.server.json`;
      const serverConf = JSON.parse(fs.readFileSync(deployServerConfPath, 'utf8'));

      for (const host of Object.keys(serverConf)) {
        for (const path of Object.keys(serverConf[host])) {
          const { db, singleReplica } = serverConf[host][path];
          if (db && !singleReplica) {
            const cmd = `node bin/db ${host}${path} import ${deployGroup.deployId} cron`;
            shellExec(cmd);
          }
        }
      }
    }
  }
};

const mergeFile = async (parts = [], outputFilePath) => {
  await new Promise((resolve) => {
    splitFile
      .mergeFiles(parts, outputFilePath)
      .then(() => {
        resolve();
      })
      .catch((err) => {
        console.log('Error: ', err);
        resolve();
      });
  });
};

const getRestoreCronCmd = async (options = { host: '', path: '', conf: {}, deployId: '' }) => {
  const { host, path, conf, deployId } = options;
  const { runtime, db, git, directory } = conf[host][path];
  const { provider, name, user, password = '', backupPath = '' } = db;

  if (['xampp', 'lampp'].includes(runtime)) {
    logger.info('Create database', `node bin/db ${host}${path} create ${deployId}`);
    shellExec(`node bin/db ${host}${path} create ${deployId}`);
  }

  if (git) {
    if (directory && !fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });

    shellExec(`git clone ${git}`);

    // fs.mkdirSync(`./public/${host}${path}`, { recursive: true });

    if (fs.existsSync(`./${git.split('/').pop()}`))
      fs.moveSync(`./${git.split('/').pop()}`, directory ? directory : `./public/${host}${path}`, {
        overwrite: true,
      });
  }

  let cmd, currentBackupTimestamp, baseBackUpPath;

  if (process.argv.includes('cron')) {
    baseBackUpPath = `${process.cwd()}/engine-private/cron-backups/${getCronBackUpFolder(host, path)}`;

    const files = await fs.readdir(baseBackUpPath, { withFileTypes: true });

    currentBackupTimestamp = files
      .map((fileObj) => parseInt(fileObj.name))
      .sort((a, b) => a - b)
      .reverse()[0];
  }

  switch (provider) {
    case 'mariadb':
      {
        if (process.argv.includes('cron')) {
          cmd = `mysql -u ${user} -p${password} ${name} < ${baseBackUpPath}/${currentBackupTimestamp}/${name}.sql`;
          if (fs.existsSync(`${baseBackUpPath}/${currentBackupTimestamp}/${name}-parths.json`)) {
            const names = JSON.parse(
              fs.readFileSync(`${baseBackUpPath}/${currentBackupTimestamp}/${name}-parths.json`, 'utf8'),
            ).map((p) => p.replaceAll(`\\`, '/').replaceAll('C:/', '/').replaceAll('c:/', '/'));

            await mergeFile(names, `${baseBackUpPath}/${currentBackupTimestamp}/${name}.sql`);
          }
        } else {
          cmd = `mysql -u ${user} -p${password} ${name} < ${
            backupPath ? backupPath : `./engine-private/sql-backups/${name}.sql`
          }`;
          if (
            fs.existsSync(
              `${
                backupPath ? backupPath.split('/').slice(0, -1).join('/') : `./engine-private/sql-backups`
              }/${name}-parths.json`,
            )
          ) {
            const names = JSON.parse(
              fs.readFileSync(
                `${
                  backupPath ? backupPath.split('/').slice(0, -1).join('/') : `./engine-private/sql-backups`
                }/${name}-parths.json`,
                'utf8',
              ),
            ).map((p) => p.replaceAll(`\\`, '/').replaceAll('C:/', '/').replaceAll('c:/', '/'));

            await mergeFile(
              names,
              `${
                backupPath ? backupPath.split('/').slice(0, -1).join('/') : `./engine-private/sql-backups`
              }/${name}.sql`,
            );
          }
        }
      }
      break;

    case 'mongoose':
      {
        if (process.argv.includes('cron')) {
          cmd = `mongorestore -d ${name} ${baseBackUpPath}/${currentBackupTimestamp}/${name}`;
        } else cmd = `mongorestore -d ${name} ${backupPath ? backupPath : `./engine-private/mongodb-backup/${name}`}`;
      }
      break;
  }

  // logger.info('Restore', cmd);

  return cmd;
};

const getPathsSSR = (conf) => {
  const paths = ['src/client/ssr/Render.js'];
  for (const o of conf.head) paths.push(`src/client/ssr/head/${o}.js`);
  for (const o of conf.body) paths.push(`src/client/ssr/body/${o}.js`);
  for (const o of Object.keys(conf.mailer)) paths.push(`src/client/ssr/mailer/${conf.mailer[o]}.js`);
  for (const o of conf.offline) paths.push(`src/client/ssr/mailer/${o.client}.js`);
  for (const o of conf.pages) paths.push(`src/client/ssr/pages/${o.client}.js`);
  return paths;
};

const Cmd = {
  delete: (deployId) => `pm2 delete ${deployId}`,
  run: (deployId) => `node bin/deploy run ${deployId}`,
  build: (deployId) => `node bin/deploy build-full-client ${deployId}${process.argv.includes('l') ? ' l' : ''}`,
  conf: (deployId, env) => `node bin/deploy conf ${deployId} ${env ? env : 'production'}`,
  replica: (deployId, host, path) => `node bin/deploy build-single-replica ${deployId} ${host} ${path}`,
  syncPorts: (deployGroupId) => `node bin/deploy sync-env-port ${deployGroupId}`,
  cron: (deployId, job, expression) => {
    shellExec(Cmd.delete(`${deployId}-${job}`));
    return `env-cmd -f .env.production pm2 start bin/cron.js --no-autorestart --instances 1 --cron "${expression}" --name ${deployId}-${job} -- ${job} ${deployId}`;
  },
};

const fixDependencies = async () => {
  return;
  // sed -i "$line_number s,.*,$new_text," "$file"
  // sed -i "$line_number c \\$new_text" "$file"
  const dep = fs.readFileSync(`./node_modules/peer/dist/module.mjs`, 'utf8');
  const errorLine = `import {WebSocketServer as $hSjDC$WebSocketServer} from "ws";`;

  fs.writeFileSync(
    `./node_modules/peer/dist/module.mjs`,
    dep.replaceAll(
      errorLine,
      `import WebSocketServer from "ws";
    let $hSjDC$WebSocketServer = WebSocketServer.Server;`,
    ),
    'utf8',
  );
};

const maintenanceMiddleware = (req, res, port, proxyRouter) => {
  if (process.argv.includes('maintenance') && globalThis.defaultHtmlSrcMaintenance) {
    if (req.method.toUpperCase() === 'GET') {
      res.set('Content-Type', 'text/html');
      return res.status(503).send(globalThis.defaultHtmlSrcMaintenance);
    }
    return res.status(503).json({
      status: 'error',
      message: 'Server is under maintenance',
    });
  }
};

const splitFileFactory = async (name, _path) => {
  const stats = fs.statSync(_path);
  const maxSizeInBytes = 1024 * 1024 * 50; // 50 mb
  const fileSizeInBytes = stats.size;
  if (fileSizeInBytes > maxSizeInBytes) {
    logger.info('splitFileFactory input', { name, from: _path });
    return await new Promise((resolve) => {
      splitFile
        .splitFileBySize(_path, maxSizeInBytes) // 50 mb
        .then((names) => {
          logger.info('splitFileFactory output', { parts: names });
          fs.writeFileSync(
            `${_path.split('/').slice(0, -1).join('/')}/${name}-parths.json`,
            JSON.stringify(names, null, 4),
            'utf8',
          );
          fs.removeSync(_path);
          return resolve(true);
        })
        .catch((err) => {
          console.log('Error: ', err);
          return resolve(false);
        });
    });
  }
  return false;
};

const setUpProxyMaintenanceServer = ({ deployGroupId }) => {
  shellExec(`pm2 kill`);
  shellExec(`node bin/deploy valkey-service`);
  const proxyDeployId = fs.readFileSync(`./engine-private/deploy/${deployGroupId}.proxy`, 'utf8').trim();
  shellExec(`node bin/deploy conf ${proxyDeployId} production`);
  shellExec(`node bin/deploy run ${proxyDeployId} maintenance`);
};

const getNpmRootPath = () =>
  shellExec(`npm root -g`, {
    stdout: true,
    disableLog: true,
    silent: true,
  }).trim();

const writeEnv = (envPath, envObj) =>
  fs.writeFileSync(
    envPath,
    Object.keys(envObj)
      .map((key) => `${key}=${envObj[key]}`)
      .join(`\n`),
    'utf8',
  );

export {
  Cmd,
  Config,
  loadConf,
  loadReplicas,
  cloneConf,
  getCapVariableName,
  buildClientSrc,
  buildApiSrc,
  addApiConf,
  addClientConf,
  addWsConf,
  buildWsSrc,
  cloneSrcComponents,
  buildProxyRouter,
  cliBar,
  cliSpinner,
  getDataDeploy,
  validateTemplatePath,
  buildReplicaId,
  restoreMacroDb,
  getDeployGroupId,
  execDeploy,
  deployRun,
  getCronBackUpFolder,
  getRestoreCronCmd,
  mergeFile,
  fixDependencies,
  getDeployId,
  maintenanceMiddleware,
  setUpProxyMaintenanceServer,
  getPathsSSR,
  buildKindPorts,
  buildPortProxyRouter,
  splitFileFactory,
  getNpmRootPath,
  writeEnv,
};
