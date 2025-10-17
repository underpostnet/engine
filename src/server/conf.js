/**
 * Provides utilities for building, loading, and managing server configurations,
 * deployment contexts, and service configurations (API, Client, WS).
 * @module src/server/conf.js
 * @namespace ServerConfBuilder
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';
import {
  capFirst,
  getCapVariableName,
  newInstance,
  orderAbc,
  orderArrayFromAttrInt,
  range,
  timer,
} from '../client/components/core/CommonJs.js';
import * as dir from 'path';
import colors from 'colors';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
import { DefaultConf } from '../../conf.js';
import splitFile from 'split-file';
import UnderpostRootEnv from '../cli/env.js';

colors.enable();

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * @class Config
 * @description Manages the configuration of the server.
 * This class provides a set of static methods to automate various
 * infrastructure operations, including NFS management, control server setup,
 * and system provisioning for different architectures.
 * @memberof ServerConfBuilder
 */
const Config = {
  /**
   * @method default
   * @description The default configuration of the server.
   * @memberof ServerConfBuilder
   */
  default: DefaultConf,
  /**
   * @method build
   * @description Builds the configuration of the server.
   * @param {string} [deployContext='dd-default'] - The deploy context.
   * @param {string} [deployList=''] - The deploy list.
   * @param {string} [subConf=''] - The sub configuration.
   * @memberof ServerConfBuilder
   */
  build: async function (deployContext = 'dd-default', deployList, subConf) {
    if (process.argv[2] && typeof process.argv[2] === 'string' && process.argv[2].startsWith('dd-'))
      deployContext = process.argv[2];
    if (!subConf && process.argv[3] && typeof process.argv[3] === 'string') subConf = process.argv[3];
    if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`);
    if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
    UnderpostRootEnv.API.set('await-deploy', new Date().toISOString());
    if (deployContext.startsWith('dd-')) loadConf(deployContext, subConf);
    if (deployContext === 'proxy') await Config.buildProxy(deployList, subConf);
  },
  /**
   * @method deployIdFactory
   * @description Creates a new deploy ID.
   * @param {string} [deployId='dd-default'] - The deploy ID.
   * @param {object} [options={ cluster: false }] - The options.
   * @memberof ServerConfBuilder
   */
  deployIdFactory: function (deployId = 'dd-default', options = { cluster: false }) {
    if (!deployId.startsWith('dd-')) deployId = `dd-${deployId}`;

    logger.info('Build deployId', deployId);

    const folder = `./engine-private/conf/${deployId}`;
    const repoName = `engine-${deployId.split('dd-')[1]}`;

    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      `${folder}/.env.production`,
      fs.readFileSync('./.env.production', 'utf8').replaceAll('dd-default', deployId),
      'utf8',
    );
    fs.writeFileSync(
      `${folder}/.env.development`,
      fs.readFileSync('./.env.development', 'utf8').replaceAll('dd-default', deployId),
      'utf8',
    );
    fs.writeFileSync(
      `${folder}/.env.test`,
      fs.readFileSync('./.env.test', 'utf8').replaceAll('dd-default', deployId),
      'utf8',
    );
    fs.writeFileSync(
      `${folder}/package.json`,
      fs.readFileSync('./package.json', 'utf8').replaceAll('dd-default', deployId),
      'utf8',
    );

    this.buildTmpConf(folder);

    if (options.cluster === true) {
      fs.writeFileSync(
        `./.github/workflows/${repoName}.cd.yml`,
        fs.readFileSync(`./.github/workflows/engine-test.cd.yml`, 'utf8').replaceAll('test', deployId.split('dd-')[1]),
        'utf8',
      );
      fs.writeFileSync(
        `./.github/workflows/${repoName}.ci.yml`,
        fs.readFileSync(`./.github/workflows/engine-test.ci.yml`, 'utf8').replaceAll('test', deployId.split('dd-')[1]),
        'utf8',
      );
      shellExec(`node bin/deploy update-default-conf ${deployId}`);

      if (!fs.existsSync(`./engine-private/deploy/dd.router`))
        fs.writeFileSync(`./engine-private/deploy/dd.router`, '', 'utf8');

      fs.writeFileSync(
        `./engine-private/deploy/dd.router`,
        fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').trim() + `,${deployId}`,
        'utf8',
      );
      const updateRepo = (stage = 1) => {
        shellExec(`git add . && git commit -m "Add base deployId ${deployId} cluster files stage:${stage}"`);
        shellExec(
          `cd engine-private && git add . && git commit -m "Add base deployId ${deployId} cluster files stage:${stage}"`,
        );
      };
      updateRepo(1);
      shellExec(`node bin run --build --dev sync`);
      updateRepo(2);
      shellExec(`node bin run --build sync`);
      updateRepo(3);
    }

    return { deployIdFolder: folder, deployId };
  },
  /**
   * @method buildTmpConf
   * @description Builds the temporary configuration of the server.
   * @param {string} [folder='./conf'] - The folder.
   * @memberof ServerConfBuilder
   */
  buildTmpConf: function (folder = './conf') {
    for (const confType of Object.keys(this.default))
      fs.writeFileSync(`${folder}/conf.${confType}.json`, JSON.stringify(this.default[confType], null, 4), 'utf8');
  },
  /**
   * @method buildProxyByDeployId
   * @description Builds the proxy by deploy ID.
   * @param {string} [deployId='dd-default'] - The deploy ID.
   * @param {string} [subConf=''] - The sub configuration.
   * @memberof ServerConfBuilder
   */
  buildProxyByDeployId: function (deployId = 'dd-default', subConf = '') {
    let confPath = fs.existsSync(`./engine-private/replica/${deployId}/conf.server.json`)
      ? `./engine-private/replica/${deployId}/conf.server.json`
      : `./engine-private/conf/${deployId}/conf.server.json`;

    if (
      process.env.NODE_ENV === 'development' &&
      subConf &&
      fs.existsSync(`./engine-private/conf/${deployId}/conf.server.dev.${subConf}.json`)
    )
      confPath = `./engine-private/conf/${deployId}/conf.server.dev.${subConf}.json`;

    const serverConf = JSON.parse(fs.readFileSync(confPath, 'utf8'));

    for (const host of Object.keys(loadReplicas(deployId, serverConf)))
      this.default.server[host] = {
        ...this.default.server[host],
        ...serverConf[host],
      };
  },
  /**
   * @method buildProxy
   * @description Builds the proxy.
   * @param {string} [deployList='dd-default'] - The deploy list.
   * @param {string} [subConf=''] - The sub configuration.
   * @memberof ServerConfBuilder
   */
  buildProxy: async function (deployList = 'dd-default', subConf = '') {
    if (!deployList) deployList = process.argv[3];
    if (!subConf) subConf = process.argv[4];
    this.default.server = {};
    for (const deployId of deployList.split(',')) {
      this.buildProxyByDeployId(deployId, subConf);
      if (fs.existsSync(`./engine-private/replica`)) {
        const singleReplicas = await fs.readdir(`./engine-private/replica`);
        for (let replica of singleReplicas) {
          if (replica.startsWith(deployId)) this.buildProxyByDeployId(replica, subConf);
        }
      }
    }
    this.buildTmpConf();
  },
};

/**
 * @method loadConf
 * @description Loads the configuration of the server.
 * @param {string} [deployId='dd-default'] - The deploy ID.
 * @param {string} [subConf=''] - The sub configuration.
 * @memberof ServerConfBuilder
 */
const loadConf = (deployId = 'dd-default', subConf) => {
  if (deployId === 'current') {
    console.log(process.env.DEPLOY_ID);
    return;
  }
  if (deployId === 'clean') {
    const path = '.';
    fs.removeSync(`${path}/.env`);
    shellExec(`git checkout ${path}/.env.production`);
    shellExec(`git checkout ${path}/.env.development`);
    shellExec(`git checkout ${path}/.env.test`);
    if (fs.existsSync(`${path}/jsdoc.json`)) shellExec(`git checkout ${path}/jsdoc.json`);
    shellExec(`git checkout ${path}/package.json`);
    shellExec(`git checkout ${path}/package-lock.json`);
    return;
  }
  const folder = fs.existsSync(`./engine-private/replica/${deployId}`)
    ? `./engine-private/replica/${deployId}`
    : `./engine-private/conf/${deployId}`;
  if (!fs.existsSync(folder)) Config.deployIdFactory(deployId);
  if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
  if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`);

  for (const typeConf of Object.keys(Config.default)) {
    let srcConf = fs.readFileSync(`${folder}/conf.${typeConf}.json`, 'utf8');
    if (process.env.NODE_ENV === 'development' && typeConf === 'server' && subConf) {
      const devConfPath = `${folder}/conf.${typeConf}.dev${subConf ? `.${subConf}` : ''}.json`;
      if (fs.existsSync(devConfPath)) srcConf = fs.readFileSync(devConfPath, 'utf8');
    }
    if (typeConf === 'server') srcConf = JSON.stringify(loadReplicas(deployId, JSON.parse(srcConf)), null, 4);
    fs.writeFileSync(`./conf/conf.${typeConf}.json`, srcConf, 'utf8');
  }
  fs.writeFileSync(`./.env.production`, fs.readFileSync(`${folder}/.env.production`, 'utf8'), 'utf8');
  fs.writeFileSync(`./.env.development`, fs.readFileSync(`${folder}/.env.development`, 'utf8'), 'utf8');
  fs.writeFileSync(`./.env.test`, fs.readFileSync(`${folder}/.env.test`, 'utf8'), 'utf8');
  const NODE_ENV = process.env.NODE_ENV;
  if (NODE_ENV) {
    const subPathEnv = fs.existsSync(`${folder}/.env.${NODE_ENV}.${subConf}`)
      ? `${folder}/.env.${NODE_ENV}.${subConf}`
      : `${folder}/.env.${NODE_ENV}`;
    fs.writeFileSync(`./.env`, fs.readFileSync(subPathEnv, 'utf8'), 'utf8');
    const env = dotenv.parse(fs.readFileSync(subPathEnv, 'utf8'));
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

/**
 * @method loadReplicas
 * @description Loads the replicas of the server.
 * @param {object} confServer - The server configuration.
 * @memberof ServerConfBuilder
 */
const loadReplicas = (deployId, confServer) => {
  const confServerOrigin = newInstance(confServer);
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      const { replicas, singleReplica } = confServer[host][path];
      if (replicas) {
        if (!singleReplica)
          for (const replicaPath of replicas) {
            {
              confServer[host][replicaPath] = newInstance(confServer[host][path]);
              delete confServer[host][replicaPath].replicas;
            }
          }
        else {
          const orderReplica = orderAbc(confServerOrigin[host][path].replicas);
          confServerOrigin[host][path].replicas = orderReplica;
          confServer[host][path].replicas = orderReplica;
        }
      }
    }
  }
  const serverPath = `./engine-private/conf/${deployId}/conf.server${process.env.NODE_ENV === 'production' ? '' : '.dev'}.json`;
  if (fs.existsSync(serverPath)) fs.writeFileSync(serverPath, JSON.stringify(confServerOrigin, null, 4), 'utf8');

  return confServer;
};

/**
 * @method cloneConf
 * @description Clones the configuration of the server.
 * @param {object} toOptions - The options for the target configuration.
 * @param {object} fromOptions - The options for the source configuration.
 * @param {object} [fromDefaultOptions={ deployId: 'dd-default', clientId: 'default' }] - The default options for the source configuration.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method addClientConf
 * @description Adds the client configuration to the server.
 * @param {object} toOptions - The options for the target configuration.
 * @param {object} fromOptions - The options for the source configuration.
 * @param {object} [fromDefaultOptions={ deployId: 'dd-default', clientId: 'default' }] - The default options for the source configuration.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method buildClientSrc
 * @description Builds the client source code.
 * @param {object} toOptions - The options for the target configuration.
 * @param {object} fromOptions - The options for the source configuration.
 * @param {object} [fromDefaultOptions={ deployId: 'dd-default', clientId: 'default' }] - The default options for the source configuration.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method buildApiSrc
 * @description Builds the API source code.
 * @param {object} toOptions - The options for the target configuration.
 * @param {object} fromOptions - The options for the source configuration.
 * @param {object} [fromDefaultOptions={ apiId: 'default', deployId: 'dd-default', clientId: 'default' }] - The default options for the source configuration.
 * @memberof ServerConfBuilder
 */
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
};

/**
 * @method addApiConf
 * @description Adds the API configuration to the server.
 * @param {object} toOptions - The options for the target configuration.
 * @param {object} fromOptions - The options for the source configuration.
 * @param {object} [fromDefaultOptions={ apiId: 'default', deployId: 'dd-default', clientId: 'default' }] - The default options for the source configuration.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method addWsConf
 * @description Adds the WebSocket configuration to the server.
 * @param {object} toOptions - The options for the target configuration.
 * @param {object} fromOptions - The options for the source configuration.
 * @param {object} [fromDefaultOptions={ wsId: 'default', deployId: 'dd-default', host: 'default.net', paths: '/' }] - The default options for the source configuration.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method buildWsSrc
 * @description Builds the WebSocket source code.
 * @param {object} toOptions - The options for the target configuration.
 * @param {object} fromOptions - The options for the source configuration.
 * @param {object} [fromDefaultOptions={ wsId: 'default', deployId: 'dd-default', host: 'default.net', paths: '/' }] - The default options for the source configuration.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method cloneSrcComponents
 * @description Clones the source components.
 * @param {object} toOptions - The options for the target configuration.
 * @param {object} fromOptions - The options for the source configuration.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method buildProxyRouter
 * @description Builds the proxy router.
 * @memberof ServerConfBuilder
 */
const buildProxyRouter = () => {
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  let currentPort = parseInt(process.env.PORT) + 1;
  const proxyRouter = {};
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      if (confServer[host][path].singleReplica) continue;

      confServer[host][path].port = newInstance(currentPort);
      for (const port of confServer[host][path].proxy) {
        if (!(port in proxyRouter)) proxyRouter[port] = {};
        proxyRouter[port][`${host}${path}`] = {
          // target: `http://${host}:${confServer[host][path].port}${path}`,
          target: `http://localhost:${confServer[host][path].port}`,
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
            target: `http://localhost:${confServer[host][peerPath].port}`,
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

  return proxyRouter;
};

/**
 * @method pathPortAssignmentFactory
 * @description Creates the path port assignment.
 * @param {string} deployId - The deploy ID.
 * @param {object} router - The router.
 * @param {object} confServer - The server configuration.
 * @memberof ServerConfBuilder
 */
const pathPortAssignmentFactory = async (deployId, router, confServer) => {
  const pathPortAssignmentData = {};
  for (const host of Object.keys(confServer)) {
    const pathPortAssignment = [];
    for (const path of Object.keys(confServer[host])) {
      const { peer } = confServer[host][path];
      if (!router[`${host}${path === '/' ? '' : path}`]) continue;
      const port = parseInt(router[`${host}${path === '/' ? '' : path}`].split(':')[2]);
      // logger.info('', { host, port, path });
      pathPortAssignment.push({
        port,
        path,
      });

      if (peer) {
        //  logger.info('', { host, port: port + 1, path: '/peer' });
        pathPortAssignment.push({
          port: port + 1,
          path: `${path === '/' ? '' : path}/peer`,
        });
      }
    }
    pathPortAssignmentData[host] = pathPortAssignment;
  }
  if (fs.existsSync(`./engine-private/replica`)) {
    const singleReplicas = await fs.readdir(`./engine-private/replica`);
    for (let replica of singleReplicas) {
      if (replica.startsWith(deployId)) {
        const replicaServerConf = JSON.parse(
          fs.readFileSync(`./engine-private/replica/${replica}/conf.server.json`, 'utf8'),
        );
        for (const host of Object.keys(replicaServerConf)) {
          const pathPortAssignment = [];
          for (const path of Object.keys(replicaServerConf[host])) {
            const { peer } = replicaServerConf[host][path];
            if (!router[`${host}${path === '/' ? '' : path}`]) continue;
            const port = parseInt(router[`${host}${path === '/' ? '' : path}`].split(':')[2]);
            // logger.info('', { host, port, path });
            pathPortAssignment.push({
              port,
              path,
            });

            if (peer) {
              //  logger.info('', { host, port: port + 1, path: '/peer' });
              pathPortAssignment.push({
                port: port + 1,
                path: `${path === '/' ? '' : path}/peer`,
              });
            }
          }
          pathPortAssignmentData[host] = pathPortAssignmentData[host].concat(pathPortAssignment);
        }
      }
    }
  }
  return pathPortAssignmentData;
};

/**
 * @method deployRangePortFactory
 * @description Creates the deploy range port factory.
 * @param {object} router - The router.
 * @returns {object} - The deploy range port factory.
 * @memberof ServerConfBuilder
 */
const deployRangePortFactory = (router) => {
  const ports = Object.values(router).map((p) => parseInt(p.split(':')[2]));
  const fromPort = Math.min(...ports);
  const toPort = Math.max(...ports);
  return { ports, fromPort, toPort };
};

/**
 * @method buildKindPorts
 * @description Builds the kind ports.
 * @param {number} from - The from port.
 * @param {number} to - The to port.
 * @returns {string} - The kind ports.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method buildPortProxyRouter
 * @description Builds the port proxy router.
 * @param {number} port - The port.
 * @param {object} proxyRouter - The proxy router.
 * @param {object} [options={ orderByPathLength: false }] - The options.
 * @returns {object} - The port proxy router.
 * @memberof ServerConfBuilder
 */
const buildPortProxyRouter = (port, proxyRouter, options = { orderByPathLength: false }) => {
  const hosts = proxyRouter[port];
  const router = {};
  // build router
  Object.keys(hosts).map((hostKey) => {
    let { host, path, target, proxy, peer } = hosts[hostKey];

    if (!proxy.includes(port)) {
      logger.warn('Proxy port not set on conf', { port, host, path, proxy, target });
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Omitting host', { host, path, target });
        return;
      }
    }

    const absoluteHost = [80, 443].includes(port)
      ? `${host}${path === '/' ? '' : path}`
      : `${host}:${port}${path === '/' ? '' : path}`;

    if (absoluteHost in router)
      logger.warn('Overwrite: Absolute host already exists on router', { absoluteHost, target });

    router[absoluteHost] = target;
  }); // order router

  if (Object.keys(router).length === 0) return router;

  if (options.orderByPathLength === true) {
    const reOrderRouter = {};
    for (const absoluteHostKey of orderArrayFromAttrInt(Object.keys(router), 'length'))
      reOrderRouter[absoluteHostKey] = router[absoluteHostKey];
    return reOrderRouter;
  }

  return router;
};

/**
 * @method buildReplicaId
 * @description Builds the replica ID.
 * @param {object} options - The options.
 * @param {string} options.deployId - The deploy ID.
 * @param {string} options.replica - The replica.
 * @returns {string} - The replica ID.
 * @memberof ServerConfBuilder
 */
const buildReplicaId = ({ deployId, replica }) => `${deployId}-${replica.slice(1)}`;

/**
 * @method getDataDeploy
 * @description Gets the data deploy.
 * @param {object} options - The options.
 * @param {boolean} [options.buildSingleReplica=false] - The build single replica.
 * @param {string} options.deployId - The deploy ID.
 * @param {boolean} [options.disableSyncEnvPort=false] - The disable sync env port.
 * @returns {object} - The data deploy.
 * @memberof ServerConfBuilder
 */
const getDataDeploy = (
  options = {
    buildSingleReplica: false,
    disableSyncEnvPort: false,
  },
) => {
  let dataDeploy = fs
    .readFileSync(`./engine-private/deploy/dd.router`, 'utf8')
    .split(',')
    .map((deployId) => deployId.trim())
    .filter((deployId) => deployId);

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
      deployObj.deployId,
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

  if (!options.disableSyncEnvPort && options.buildSingleReplica) shellExec(Cmd.syncPorts());

  logger.info('Deployments configured', buildDataDeploy);

  return buildDataDeploy;
};

/**
 * @method validateTemplatePath
 * @description Validates the template path.
 * @param {string} absolutePath - The absolute path.
 * @returns {boolean} - The validation result.
 * @memberof ServerConfBuilder
 */
const validateTemplatePath = (absolutePath = '') => {
  const host = 'default.net';
  const path = '/';
  const client = 'default';
  const ssr = 'Default';
  const confServer = DefaultConf.server[host][path];
  const confClient = DefaultConf.client[client];
  const confSsr = DefaultConf.ssr[ssr];
  const clients = DefaultConf.client.default.services;

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

/**
 * @method awaitDeployMonitor
 * @description Waits for the deploy monitor.
 * @param {boolean} [init=false] - The init flag.
 * @param {number} [deltaMs=1000] - The delta ms.
 * @returns {Promise<void>} - The await deploy monitor.
 * @memberof ServerConfBuilder
 */
const awaitDeployMonitor = async (init = false, deltaMs = 1000) => {
  if (init) UnderpostRootEnv.API.set('await-deploy', new Date().toISOString());
  await timer(deltaMs);
  if (UnderpostRootEnv.API.get('await-deploy')) return await awaitDeployMonitor();
};

/**
 * @method getCronBackUpFolder
 * @description Gets the cron back up folder.
 * @param {string} host - The host.
 * @param {string} path - The path.
 * @returns {string} - The cron back up folder.
 * @memberof ServerConfBuilder
 */
const getCronBackUpFolder = (host = '', path = '') => {
  return `${host}${path.replace(/\\/g, '/').replace(`/`, '-')}`;
};

/**
 * @method mergeFile
 * @description Merges the file.
 * @param {Array} parts - The parts.
 * @param {string} outputFilePath - The output file path.
 * @returns {Promise<void>} - The merge file.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method rebuildConfFactory
 * @description Rebuilds the conf factory.
 * @param {object} options - The options.
 * @param {string} options.deployId - The deploy ID.
 * @param {string} options.valkey - The valkey.
 * @param {boolean} [options.mongo=false] - The mongo.
 * @returns {object} - The rebuild conf factory.
 * @memberof ServerConfBuilder
 */
const rebuildConfFactory = ({ deployId, valkey, mongo }) => {
  const confServer = loadReplicas(
    deployId,
    JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
  );
  const hosts = {};
  for (const host of Object.keys(confServer)) {
    hosts[host] = {};
    for (const path of Object.keys(confServer[host])) {
      if (!confServer[host][path].db) continue;
      const { singleReplica, replicas, db } = confServer[host][path];
      const { provider } = db;
      if (singleReplica) {
        for (const replica of replicas) {
          const deployIdReplica = buildReplicaId({ replica, deployId });
          const confServerReplica = JSON.parse(
            fs.readFileSync(`./engine-private/replica/${deployIdReplica}/conf.server.json`, 'utf8'),
          );
          for (const _host of Object.keys(confServerReplica)) {
            for (const _path of Object.keys(confServerReplica[_host])) {
              hosts[host][_path] = { replica: { host, path } };
              confServerReplica[_host][_path].valkey = valkey;
              switch (provider) {
                case 'mongoose':
                  confServerReplica[_host][_path].db.host = mongo.host;
                  break;
              }
            }
          }
          fs.writeFileSync(
            `./engine-private/replica/${deployIdReplica}/conf.server.json`,
            JSON.stringify(confServerReplica, null, 4),
            'utf8',
          );
        }
      } else hosts[host][path] = {};
      confServer[host][path].valkey = valkey;
      switch (provider) {
        case 'mongoose':
          confServer[host][path].db.host = mongo.host;
          break;
      }
    }
  }
  fs.writeFileSync(`./engine-private/conf/${deployId}/conf.server.json`, JSON.stringify(confServer, null, 4), 'utf8');
  return { hosts };
};

/**
 * @method getPathsSSR
 * @description Gets the paths SSR.
 * @param {object} conf - The conf.
 * @returns {Array} - The paths SSR.
 * @memberof ServerConfBuilder
 */
const getPathsSSR = (conf) => {
  const paths = ['src/client/ssr/Render.js'];
  for (const o of conf.head) paths.push(`src/client/ssr/head/${o}.js`);
  for (const o of conf.body) paths.push(`src/client/ssr/body/${o}.js`);
  for (const o of Object.keys(conf.mailer)) paths.push(`src/client/ssr/mailer/${conf.mailer[o]}.js`);
  for (const o of conf.offline) paths.push(`src/client/ssr/mailer/${o.client}.js`);
  for (const o of conf.pages) paths.push(`src/client/ssr/pages/${o.client}.js`);
  return paths;
};

/**
 * @method Cmd
 * @description The command factory.
 * @memberof ServerConfBuilder
 */
const Cmd = {
  /**
   * @method delete
   * @description Deletes the deploy.
   * @param {string} deployId - The deploy ID.
   * @returns {string} - The delete command.
   * @memberof Cmd
   */
  delete: (deployId) => `pm2 delete ${deployId}`,
  /**
   * @method run
   * @description Runs the deploy.
   * @returns {string} - The run command.
   * @memberof Cmd
   */
  run: () => `npm start`,
  /**
   * @method build
   * @description Builds the deploy.
   * @param {string} deployId - The deploy ID.
   * @returns {string} - The build command.
   * @memberof Cmd
   */
  build: (deployId) => `node bin/deploy build-full-client ${deployId}${process.argv.includes('l') ? ' l' : ''}`,
  /**
   * @method conf
   * @description Configures the deploy.
   * @param {string} deployId - The deploy ID.
   * @param {string} env - The environment.
   * @returns {string} - The conf command.
   * @memberof Cmd
   */
  conf: (deployId, env) => `node bin/deploy conf ${deployId} ${env ? env : 'production'}`,
  /**
   * @method replica
   * @description Builds the replica.
   * @param {string} deployId - The deploy ID.
   * @param {string} host - The host.
   * @param {string} path - The path.
   * @returns {string} - The replica command.
   * @memberof Cmd
   */
  replica: (deployId, host, path) => `node bin/deploy build-single-replica ${deployId} ${host} ${path}`,
  /**
   * @method syncPorts
   * @description Syncs the ports.
   * @returns {string} - The sync ports command.
   * @memberof Cmd
   */
  syncPorts: () => `node bin/deploy sync-env-port`,
  /**
   * @method cron
   * @description Creates a cron job.
   * @param {string} deployList - The deploy list.
   * @param {string} jobList - The job list.
   * @param {string} name - The name.
   * @param {string} expression - The expression.
   * @param {object} options - The options.
   * @returns {string} - The cron command.
   * @memberof Cmd
   */
  cron: (deployList, jobList, name, expression, options) =>
    `pm2 start ./bin/index.js --no-autorestart --instances 1 --cron "${expression}" --name ${name} -- cron ${
      options?.itc ? `--itc ` : ''
    }${options?.git ? `--git ` : ''}${deployList} ${jobList}`,
};

/**
 * @method splitFileFactory
 * @description Splits the file factory.
 * @param {string} name - The name.
 * @param {string} _path - The path.
 * @returns {Promise<boolean>} - The split file factory.
 * @memberof ServerConfBuilder
 */
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

/**
 * @method getNpmRootPath
 * @description Gets the npm root path.
 * @returns {string} - The npm root path.
 * @memberof ServerConfBuilder
 */
const getNpmRootPath = () =>
  shellExec(`npm root -g`, {
    stdout: true,
    disableLog: true,
    silent: true,
  }).trim();

/**
 * @method getUnderpostRootPath
 * @description Gets the underpost root path.
 * @returns {string} - The underpost root path.
 * @memberof ServerConfBuilder
 */
const getUnderpostRootPath = () => `${getNpmRootPath()}/underpost`;

/**
 * @method writeEnv
 * @description Writes the environment variables.
 * @param {string} envPath - The environment path.
 * @param {object} envObj - The environment object.
 * @memberof ServerConfBuilder
 */
const writeEnv = (envPath, envObj) =>
  fs.writeFileSync(
    envPath,
    Object.keys(envObj)
      .map((key) => `${key}=${envObj[key]}`)
      .join(`\n`),
    'utf8',
  );

/**
 * @method buildCliDoc
 * @description Builds the CLI documentation.
 * @param {object} program - The program.
 * @param {string} oldVersion - The old version.
 * @param {string} newVersion - The new version.
 * @memberof ServerConfBuilder
 */
const buildCliDoc = (program, oldVersion, newVersion) => {
  let md = shellExec(`node bin help`, { silent: true, stdout: true }).split('Options:');
  const baseOptions =
    `## ${md[0].split(`\n`)[2]}

### Usage: ` +
    '`' +
    md[0].split(`\n`)[0].split('Usage: ')[1] +
    '`' +
    `
  ` +
    '```\n Options:' +
    md[1] +
    ' \n```';
  md =
    baseOptions +
    `

## Commands:
    `;
  program.commands.map((o) => {
    md +=
      `

` +
      '### `' +
      o._name +
      '` :' +
      `
` +
      '```\n ' +
      shellExec(`node bin help ${o._name}`, { silent: true, stdout: true }) +
      ' \n```' +
      `
  `;
  });
  md = md.replaceAll(oldVersion, newVersion);
  fs.writeFileSync(`./src/client/public/nexodev/docs/references/Command Line Interface.md`, md, 'utf8');
  fs.writeFileSync(`./cli.md`, md, 'utf8');
  const readmeSplit = `pwa-microservices-template</a>`;
  const readme = fs.readFileSync(`./README.md`, 'utf8').split(readmeSplit);
  fs.writeFileSync(
    './README.md',
    (
      readme[0] +
      readmeSplit +
      `

` +
      baseOptions +
      `

<a target="_top" href="https://github.com/${process.env.GITHUB_USERNAME}/pwa-microservices-template/blob/master/cli.md">See complete CLI Docs here.</a>

`
    ).replaceAll(oldVersion, newVersion),
    'utf8',
  );
};

/**
 * @method getInstanceContext
 * @description Gets the instance context.
 * @param {object} options - The options.
 * @param {string} options.deployId - The deploy ID.
 * @param {boolean} options.singleReplica - The single replica.
 * @param {Array} options.replicas - The replicas.
 * @param {string} options.redirect - The redirect.
 * @returns {object} - The instance context.
 * @memberof ServerConfBuilder
 */
const getInstanceContext = async (options = { deployId, singleReplica, replicas, redirect: '' }) => {
  const { deployId, singleReplica, replicas, redirect } = options;
  let singleReplicaOffsetPortSum = 0;

  if (singleReplica && replicas && replicas.length > 0) {
    for (const replica of replicas) {
      const replicaDeployId = buildReplicaId({ deployId, replica });
      const confReplicaServer = JSON.parse(
        fs.readFileSync(`./engine-private/replica/${replicaDeployId}/conf.server.json`, 'utf8'),
      );
      for (const host of Object.keys(confReplicaServer)) {
        for (const path of Object.keys(confReplicaServer[host])) {
          singleReplicaOffsetPortSum++;
          if (confReplicaServer[host][path].peer) singleReplicaOffsetPortSum++;
        }
      }
    }
  }

  const redirectTarget = redirect
    ? redirect[redirect.length - 1] === '/'
      ? redirect.slice(0, -1)
      : redirect
    : undefined;

  return { redirectTarget, singleReplicaOffsetPortSum };
};

/**
 * @method buildApiConf
 * @description Builds the API configuration.
 * @param {object} options - The options.
 * @param {string} options.deployId - The deploy ID.
 * @param {string} options.subConf - The sub configuration.
 * @param {string} options.host - The host.
 * @param {string} options.path - The path.
 * @param {string} options.origin - The origin.
 * @returns {object} - The API configuration.
 * @memberof ServerConfBuilder
 */
const buildApiConf = async (options = { deployId: '', subConf: '', host: '', path: '', origin: '' }) => {
  let { deployId, subConf, host, path, origin } = options;
  if (!deployId) deployId = process.argv[2].trim();
  if (!subConf) subConf = process.argv[3].trim();
  if (process.argv[4]) host = process.argv[4].trim();
  if (process.argv[5]) path = process.argv[5].trim();
  if (process.argv[6])
    origin = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${process.argv[6].trim()}`;

  if (!origin) return;
  const confServer = JSON.parse(
    fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.dev.${subConf}.json`, 'utf8'),
  );
  const envObj = dotenv.parse(
    fs.readFileSync(`./engine-private/conf/${deployId}/.env.${process.env.NODE_ENV}`, 'utf8'),
  );
  if (host && path) {
    confServer[host][path].origins = [origin];
    logger.info('Build api conf', { host, path, origin });
  } else return;
  writeEnv(`./engine-private/conf/${deployId}/.env.${process.env.NODE_ENV}.${subConf}-dev-api`, envObj);
  fs.writeFileSync(
    `./engine-private/conf/${deployId}/conf.server.dev.${subConf}-dev-api.json`,
    JSON.stringify(confServer, null, 4),
    'utf8',
  );
};

/**
 * @method buildClientStaticConf
 * @description Builds the client static configuration.
 * @param {object} options - The options.
 * @param {string} options.deployId - The deploy ID.
 * @param {string} options.subConf - The sub configuration.
 * @param {string} options.apiBaseHost - The API base host.
 * @param {string} options.host - The host.
 * @param {string} options.path - The path.
 * @returns {void}
 * @memberof ServerConfBuilder
 */
const buildClientStaticConf = async (options = { deployId: '', subConf: '', apiBaseHost: '', host: '', path: '' }) => {
  let { deployId, subConf, host, path } = options;
  if (!deployId) deployId = process.argv[2].trim();
  if (!subConf) subConf = process.argv[3].trim();
  if (!host) host = process.argv[4].trim();
  if (!path) path = process.argv[5].trim();
  const confServer = JSON.parse(
    fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.dev.${subConf}-dev-api.json`, 'utf8'),
  );
  const envObj = dotenv.parse(
    fs.readFileSync(`./engine-private/conf/${deployId}/.env.${process.env.NODE_ENV}.${subConf}-dev-api`, 'utf8'),
  );
  envObj.PORT = parseInt(envObj.PORT);
  const apiBaseHost = options?.apiBaseHost ? options.apiBaseHost : `localhost:${envObj.PORT + 1}`;
  confServer[host][path].apiBaseHost = apiBaseHost;
  confServer[host][path].apiBaseProxyPath = path;
  logger.info('Build client static conf', { host, path, apiBaseHost });
  envObj.PORT = parseInt(confServer[host][path].origins[0].split(':')[2]) - 1;
  writeEnv(`./engine-private/conf/${deployId}/.env.${process.env.NODE_ENV}.${subConf}-dev-client`, envObj);
  fs.writeFileSync(
    `./engine-private/conf/${deployId}/conf.server.dev.${subConf}-dev-client.json`,
    JSON.stringify(confServer, null, 4),
    'utf8',
  );
};

/**
 * @method isDeployRunnerContext
 * @description Checks if the deploy runner context is valid.
 * @param {string} path - The path.
 * @param {object} options - The options.
 * @returns {boolean} - The deploy runner context.
 * @memberof ServerConfBuilder
 */
const isDeployRunnerContext = (path, options) => !options.build && path && path !== 'template-deploy';

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
  getDataDeploy,
  validateTemplatePath,
  buildReplicaId,
  getCronBackUpFolder,
  mergeFile,
  getPathsSSR,
  buildKindPorts,
  buildPortProxyRouter,
  splitFileFactory,
  getNpmRootPath,
  getUnderpostRootPath,
  writeEnv,
  pathPortAssignmentFactory,
  deployRangePortFactory,
  awaitDeployMonitor,
  rebuildConfFactory,
  buildCliDoc,
  getInstanceContext,
  buildApiConf,
  buildClientStaticConf,
  isDeployRunnerContext,
};
