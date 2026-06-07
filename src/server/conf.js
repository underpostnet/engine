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
  getDirname,
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
import Underpost from '../index.js';

colors.enable();

const logger = loggerFactory(import.meta);

/**
 * Prefix used in JSON configuration files to denote an environment variable reference.
 * Any string value in a config object that starts with this prefix will be resolved
 * to the corresponding `process.env` value at runtime.
 *
 * @constant {string}
 * @memberof ServerConfBuilder
 * @example
 * // In conf.server.json:
 * { "db": { "password": "env:MARIADB_PASSWORD" } }
 */
const ENV_REF_PREFIX = 'env:';

/**
 * Resolves a standardized context key from host/path descriptors.
 * The key is used across DB, WS, mailer, and cache registries.
 *
 * @method resolveHostKeyContext
 * @param {{host?: string, path?: string}|string} [context={ host: '', path: '' }] - Context object or prebuilt key.
 * @returns {string} Host key context string.
 * @memberof ServerConfBuilder
 */
const resolveHostKeyContext = (context = { host: '', path: '' }) => {
  if (typeof context === 'string') return context;
  return `${context.host || ''}${context.path || ''}`;
};

/**
 * Recursively walks a configuration object and replaces every string value that
 * starts with {@link ENV_REF_PREFIX} (`"env:"`) with the corresponding
 * `process.env[VAR_NAME]` value.
 *
 * Non-string values and strings that do not start with the prefix are left untouched.
 *
 * Supports three reference formats:
 * - `"env:VAR_NAME"` — resolves to `process.env.VAR_NAME`, returns `''` if unset.
 * - `"env:VAR_NAME:default_value"` — resolves to `process.env.VAR_NAME`, falls back to `default_value` if unset.
 * - Type-coerced defaults:
 *   - `"env:VAR_NAME:int:465"` — resolved value is parsed as integer (`parseInt`), falls back to `465`.
 *   - `"env:VAR_NAME:bool:true"` — resolved value is coerced to boolean (`value !== 'false'`), falls back to `true`.
 *
 * @method resolveConfSecrets
 * @param {any} obj - The configuration object (or value) to resolve.
 * @returns {any} A **new** object with all `env:` references replaced by their runtime values.
 * @memberof ServerConfBuilder
 *
 * @example
 * // Given process.env.MARIADB_PASSWORD = 'supersecret'
 * resolveConfSecrets({ db: { password: 'env:MARIADB_PASSWORD' } });
 * // => { db: { password: 'supersecret' } }
 *
 * @example
 * // With default value fallback (env var not set)
 * resolveConfSecrets({ db: { provider: 'env:DB_PROVIDER:mongoose' } });
 * // => { db: { provider: 'mongoose' } }
 *
 * @example
 * // With int type coercion
 * resolveConfSecrets({ port: 'env:SMTP_PORT:int:465' });
 * // => { port: 465 }
 *
 * @example
 * // With bool type coercion
 * resolveConfSecrets({ secure: 'env:SMTP_SECURE:bool:true' });
 * // => { secure: true }
 */
const resolveConfSecrets = (obj) => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.startsWith(ENV_REF_PREFIX)) {
      const ref = obj.slice(ENV_REF_PREFIX.length);
      // Support env:VAR_NAME:default_value syntax (first colon separates key from default)
      const colonIdx = ref.indexOf(':');
      const envKey = colonIdx !== -1 ? ref.slice(0, colonIdx) : ref;
      const defaultValue = colonIdx !== -1 ? ref.slice(colonIdx + 1) : undefined;
      const envValue = process.env[envKey];

      let resolved;
      if (envValue !== undefined) {
        resolved = envValue;
      } else if (defaultValue !== undefined) {
        resolved = defaultValue;
      } else {
        logger.warn(`resolveConfSecrets: environment variable "${envKey}" is not set (referenced as "${obj}")`);
        return '';
      }

      // Type coercion via prefix in default value: int:N or bool:B
      // Also apply coercion when an env value is present and a typed default is declared
      if (defaultValue !== undefined) {
        if (defaultValue.startsWith('int:')) {
          return parseInt(resolved, 10) || parseInt(defaultValue.slice(4), 10) || 0;
        }
        if (defaultValue.startsWith('bool:')) {
          const boolDefault = defaultValue.slice(5);
          if (envValue !== undefined) return envValue !== 'false';
          return boolDefault !== 'false';
        }
      }

      return resolved;
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((item) => resolveConfSecrets(item));
  if (typeof obj === 'object') {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveConfSecrets(value);
    }
    return resolved;
  }
  return obj;
};

/**
 * Returns the private configuration folder for a given deploy ID.
 * Checks for a replica folder first, then falls back to the standard conf folder.
 *
 * @method getConfFolder
 * @param {string} deployId - The deploy ID.
 * @returns {string} The path to the private configuration folder.
 * @memberof ServerConfBuilder
 *
 * @example
 * getConfFolder('dd-myapp');
 * // => './engine-private/conf/dd-myapp'  (or './engine-private/replica/dd-myapp' if it exists)
 */
const getConfFolder = (deployId) => {
  return fs.existsSync(`./engine-private/replica/${deployId}`)
    ? `./engine-private/replica/${deployId}`
    : `./engine-private/conf/${deployId}`;
};

/**
 * Reads `engine-private/deploy/dd.cron` and returns the deploy-id string,
 * or `null` if the file does not exist or is empty.
 *
 * @method cronDeployIdResolve
 * @returns {string|null} The deploy-id from dd.cron, or null.
 * @memberof ServerConfBuilder
 */
const cronDeployIdResolve = () => {
  const cronDeployFile = './engine-private/deploy/dd.cron';
  if (fs.existsSync(cronDeployFile)) {
    const id = fs.readFileSync(cronDeployFile, 'utf8').trim();
    return id || null;
  }
  return null;
};

/**
 * Loads the deployment-specific `.env` file referenced by `engine-private/deploy/dd.cron`
 * into `process.env`. Uses `NODE_ENV` to select the environment variant
 * (defaults to `production`).
 *
 * Safe to call multiple times; subsequent calls are no-ops once the env is loaded.
 *
 * @method loadCronDeployEnv
 * @memberof ServerConfBuilder
 */
function loadCronDeployEnv() {
  const envName = process.env.NODE_ENV || 'production';

  // 1) Load dd.cron env (takes full precedence)
  const cronDeployId = cronDeployIdResolve();
  if (cronDeployId) {
    const cronEnvPath = `./engine-private/conf/${cronDeployId}/.env.${envName}`;
    if (fs.existsSync(cronEnvPath)) {
      const cronEnv = dotenv.parse(fs.readFileSync(cronEnvPath, 'utf8'));
      process.env = { ...process.env, ...cronEnv };
    }
  }

  // 2) Load dd.router envs — only keys not already present
  const routerDeployFile = './engine-private/deploy/dd.router';
  if (fs.existsSync(routerDeployFile)) {
    const routerIds = fs.readFileSync(routerDeployFile, 'utf8').trim().split(',');
    for (const deployId of routerIds) {
      const id = deployId.trim();
      if (!id) continue;
      const envPath = `./engine-private/conf/${id}/.env.${envName}`;
      if (!fs.existsSync(envPath)) continue;
      const env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      for (const key of Object.keys(env)) {
        if (!(key in process.env)) process.env[key] = env[key];
      }
    }
  }
}

/**
 * Resolves the full path to a specific configuration JSON file for a deploy ID.
 * For `server` configs in development mode with a subConf, it will prefer the
 * dev-specific variant if it exists.
 *
 * @method getConfFilePath
 * @param {string} deployId - The deploy ID.
 * @param {string} confType - The configuration type (e.g. 'server', 'client', 'cron', 'ssr').
 * @param {string} [subConf=''] - Optional sub-configuration identifier (used for dev server variants).
 * @returns {string} The resolved path to the configuration JSON file.
 * @memberof ServerConfBuilder
 *
 * @example
 * getConfFilePath('dd-myapp', 'server');
 * // => './engine-private/conf/dd-myapp/conf.server.json'
 *
 * @example
 * // In development with subConf 'local':
 * getConfFilePath('dd-myapp', 'server', 'local');
 * // => './engine-private/conf/dd-myapp/conf.server.dev.local.json' (if it exists)
 */
const getConfFilePath = (deployId, confType, subConf = '') => {
  const folder = getConfFolder(deployId);
  // When no explicit subConf is given, fall back to the env var set by loadConf()
  const effectiveSubConf = subConf || process.env.DEPLOY_SUB_CONF || '';
  if (confType === 'server' && effectiveSubConf) {
    const devConfPath = `${folder}/conf.${confType}.dev.${effectiveSubConf}.json`;
    if (fs.existsSync(devConfPath)) return devConfPath;
  }
  return `${folder}/conf.${confType}.json`;
};

/**
 * Reads and parses a configuration JSON file for a given deploy ID and config type.
 * Optionally resolves `env:` secret references and/or applies replica expansion.
 *
 * @method readConfJson
 * @param {string} deployId - The deploy ID.
 * @param {string} confType - The configuration type (e.g. 'server', 'client', 'cron', 'ssr').
 * @param {object} [options={}] - Options.
 * @param {string} [options.subConf=''] - Sub-configuration identifier for dev variants.
 * @param {boolean} [options.resolve=false] - Whether to resolve `env:` references.
 * @param {boolean} [options.loadReplicas=false] - Whether to expand replica entries (server configs).
 * @returns {object} The parsed (and optionally resolved) configuration object.
 * @memberof ServerConfBuilder
 */
const readConfJson = (deployId, confType, options = {}) => {
  const filePath = getConfFilePath(deployId, confType, options.subConf || '');
  if (!fs.existsSync(filePath)) {
    throw new Error(`readConfJson: configuration file not found: ${filePath}`);
  }
  let parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (options.loadReplicas && confType === 'server') parsed = loadReplicas(deployId, parsed);
  if (options.resolve) parsed = resolveConfSecrets(parsed);
  return parsed;
};

/**
 * Default deploy ID used when no deploy ID is specified.
 * @constant {string}
 * @memberof ServerConfBuilder
 */
const DEFAULT_DEPLOY_ID = 'dd-default';

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
  build: async function (deployContext = DEFAULT_DEPLOY_ID, deployList, subConf) {
    if (process.argv[2] && typeof process.argv[2] === 'string' && process.argv[2].startsWith('dd-'))
      deployContext = process.argv[2];
    else if (deployContext !== 'proxy' && process.env.DEPLOY_ID && process.env.DEPLOY_ID.startsWith('dd-'))
      deployContext = process.env.DEPLOY_ID;
    if (!subConf && process.argv[3] && typeof process.argv[3] === 'string') subConf = process.argv[3];

    Underpost.env.set('await-deploy', new Date().toISOString());
    if (deployContext.startsWith('dd-')) loadConf(deployContext, subConf);
    if (deployContext === 'proxy') await Config.buildProxy(deployList, subConf);
  },
  /**
   * @method deployIdFactory
   * @description Creates a new deploy ID.
   * @param {string} [deployId='dd-default']
   * @param {object} [options={ subConf: '', cluster: false }] - The options.
   * @memberof ServerConfBuilder
   */
  deployIdFactory: function (deployId = DEFAULT_DEPLOY_ID, options = { subConf: '', cluster: false }) {
    if (!deployId.startsWith('dd-')) deployId = `dd-${deployId}`;

    logger.info('Build deployId', deployId);

    const folder = `./engine-private/conf/${deployId}`;
    const repoName = `engine-${deployId.split('dd-')[1]}`;

    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    const sharedEnvTemplate = fs.existsSync('./.env.example')
      ? fs.readFileSync('./.env.example', 'utf8')
      : fs.existsSync('./.env.production')
        ? fs.readFileSync('./.env.production', 'utf8')
        : '';

    const envTemplates = {
      production: fs.existsSync('./.env.production') ? fs.readFileSync('./.env.production', 'utf8') : sharedEnvTemplate,
      development: fs.existsSync('./.env.development')
        ? fs.readFileSync('./.env.development', 'utf8')
        : sharedEnvTemplate
          ? sharedEnvTemplate.replace('NODE_ENV=production', 'NODE_ENV=development').replace('PORT=3000', 'PORT=4000')
          : '',
      test: fs.existsSync('./.env.test')
        ? fs.readFileSync('./.env.test', 'utf8')
        : sharedEnvTemplate
          ? sharedEnvTemplate.replace('NODE_ENV=production', 'NODE_ENV=test').replace('PORT=3000', 'PORT=5000')
          : '',
    };

    for (const [envName, envTemplate] of Object.entries(envTemplates)) {
      if (!envTemplate) continue;
      fs.writeFileSync(`${folder}/.env.${envName}`, envTemplate.replaceAll('dd-default', deployId), 'utf8');
    }

    fs.writeFileSync(
      `${folder}/package.json`,
      fs.readFileSync('./package.json', 'utf8').replaceAll('dd-default', deployId),
      'utf8',
    );

    // Write default conf JSON files if they don't exist
    for (const confType of Object.keys(this.default)) {
      const confPath = `${folder}/conf.${confType}.json`;
      if (!fs.existsSync(confPath)) fs.writeFileSync(confPath, JSON.stringify(this.default[confType], null, 4), 'utf8');
    }

    if (options.subConf) {
      logger.info('Creating sub conf', {
        deployId: deployId,
        subConf: options.subConf,
      });
      fs.copySync(
        `./engine-private/conf/${deployId}/conf.server.json`,
        `./engine-private/conf/${deployId}/conf.server.dev.${options.subConf}.json`,
      );
    }

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
      shellExec(`node bin new --default-conf --deploy-id ${deployId}`);

      if (!fs.existsSync(`./engine-private/deploy/dd.router`))
        fs.writeFileSync(`./engine-private/deploy/dd.router`, deployId, 'utf8');
      else
        fs.writeFileSync(
          `./engine-private/deploy/dd.router`,
          fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').trim() + `,${deployId}`,
          'utf8',
        );
    }

    return { deployIdFolder: folder, deployId };
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

    const serverConf = loadConfServerJson(confPath);

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
  },
};

/**
 * @method loadConf
 * @description Loads the configuration of the server.
 * @param {string} [deployId='dd-default'] - The deploy ID.
 * @param {string} [subConf=''] - The sub configuration.
 * @memberof ServerConfBuilder
 */
const loadConf = (deployId = DEFAULT_DEPLOY_ID, subConf) => {
  if (deployId === 'current') {
    console.log(process.env.DEPLOY_ID);
    return;
  }
  if (deployId === 'clean') {
    const path = '.';
    fs.removeSync(`${path}/.env`);
    fs.removeSync(`${path}/.env.production`);
    fs.removeSync(`${path}/.env.development`);
    fs.removeSync(`${path}/.env.test`);
    if (fs.existsSync(`${path}/typedoc.json`)) shellExec(`git checkout ${path}/typedoc.json`);
    shellExec(`git checkout ${path}/package.json`);
    shellExec(`git checkout ${path}/package-lock.json`);
    return;
  }
  const folder = getConfFolder(deployId);

  if (!fs.existsSync(folder)) Config.deployIdFactory(deployId);

  if (subConf) process.env.DEPLOY_SUB_CONF = subConf;

  for (const typeConf of Object.keys(Config.default)) {
    let srcConf = fs.readFileSync(`${folder}/conf.${typeConf}.json`, 'utf8');
    if (process.env.NODE_ENV === 'development' && typeConf === 'server' && subConf) {
      const devConfPath = `${folder}/conf.${typeConf}.dev${subConf ? `.${subConf}` : ''}.json`;
      if (fs.existsSync(devConfPath)) srcConf = fs.readFileSync(devConfPath, 'utf8');
    }
    let parsed = JSON.parse(srcConf);
    if (typeConf === 'server') parsed = loadReplicas(deployId, parsed);
    Config.default[typeConf] = parsed;
  }
  fs.writeFileSync(`./.env.production`, fs.readFileSync(`${folder}/.env.production`, 'utf8'), 'utf8');
  fs.writeFileSync(`./.env.development`, fs.readFileSync(`${folder}/.env.development`, 'utf8'), 'utf8');
  fs.writeFileSync(`./.env.test`, fs.readFileSync(`${folder}/.env.test`, 'utf8'), 'utf8');
  const NODE_ENV = process.env.NODE_ENV || 'development';
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
  const confServer = newInstance(Config.default.server);
  let currentPort = parseInt(process.env.PORT) + 1;
  const proxyRouter = {};
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      if (confServer[host][path].singleReplica) continue;

      if (isDevProxyContext()) confServer[host][path].proxy = [isTlsDevProxy() ? 443 : 80];

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
        const replicaServerConf = loadConfServerJson(`./engine-private/replica/${replica}/conf.server.json`);
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
 * @param {object} options - The options.
 * @param {number} [options.port=4000] - The port.
 * @param {object} options.proxyRouter - The proxy router.
 * @param {object} [options.hosts] - The hosts.
 * @param {boolean} [options.orderByPathLength=false] - Whether to order by path length.
 * @param {boolean} [options.devProxyContext=false] - Whether to use dev proxy context.
 * @returns {object} - The port proxy router.
 * @memberof ServerConfBuilder
 */
const buildPortProxyRouter = (
  options = { port: 4000, proxyRouter, hosts, orderByPathLength: false, devProxyContext: false },
) => {
  let { port, proxyRouter, hosts, orderByPathLength } = options;
  hosts = hosts || proxyRouter[port] || {};

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
    // ${process.env.NODE_ENV === 'development' && !isDevProxyContext() ? `:${port}` : ''}
    const absoluteHost = [80, 443].includes(port)
      ? `${host}${path === '/' ? '' : path}`
      : `${host}:${port}${path === '/' ? '' : path}`;

    if (absoluteHost in router)
      logger.warn('Overwrite: Absolute host already exists on router', { absoluteHost, target });

    if (options.devProxyContext === true) {
      const appDevPort = parseInt(target.split(':')[2]) - process.env.DEV_PROXY_PORT_OFFSET;
      router[absoluteHost] = `http://localhost:${appDevPort}`;
    } else router[absoluteHost] = target;
  }); // order router

  if (Object.keys(router).length === 0) return router;

  const devApiConfPath = `./engine-private/conf/${process.argv[3]}/conf.server.dev.${process.argv[4]}-dev-api.json`;
  if (options.devProxyContext === true && process.env.NODE_ENV === 'development' && fs.existsSync(devApiConfPath)) {
    const confDevApiServer = JSON.parse(fs.readFileSync(devApiConfPath, 'utf8'));
    let devApiHosts = [];
    let origins = [];
    for (const _host of Object.keys(confDevApiServer))
      for (const _path of Object.keys(confDevApiServer[_host])) {
        if (confDevApiServer[_host][_path].origins && confDevApiServer[_host][_path].origins.length) {
          origins.push(...confDevApiServer[_host][_path].origins);
          if (_path !== 'peer' && devApiHosts.length === 0)
            devApiHosts.push(
              `${_host}${[80, 443].includes(port) && isDevProxyContext() ? '' : `:${port}`}${_path == '/' ? '' : _path}`,
            );
        }
      }
    origins = Array.from(new Set(origins));
    console.log({
      origins,
      devApiHosts,
    });
    for (const devApiHost of devApiHosts) {
      if (devApiHost in router) {
        const target = router[devApiHost];
        delete router[devApiHost];
        router[`${devApiHost}/${process.env.BASE_API}`] = target;
        router[`${devApiHost}/socket.io`] = target;
        for (const origin of origins) router[devApiHost] = origin;
      }
    }
  }

  if (orderByPathLength === true) {
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
 * @param {string} [options.deployId] - The deploy ID.
 * @param {boolean} [options.disableSyncEnvPort=false] - The disable sync env port.
 * @returns {object} - The data deploy.
 * @memberof ServerConfBuilder
 */
const getDataDeploy = async (
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
    const isReplicaDeploy = fs.existsSync(`./engine-private/replica/${deployObj.deployId}`);
    const serverConf = loadReplicas(
      deployObj.deployId,
      loadConfServerJson(`./engine-private/conf/${deployObj.deployId}/conf.server.json`),
    );
    let replicaDataDeploy = [];
    for (const host of Object.keys(serverConf))
      for (const path of Object.keys(serverConf[host])) {
        if (!isReplicaDeploy && serverConf[host][path].replicas && serverConf[host][path].singleReplica) {
          if (options && options.buildSingleReplica)
            await Underpost.repo.client(deployObj.deployId, '', host, path, {
              singleReplica: true,
            });
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

  if (!options.disableSyncEnvPort && options.buildSingleReplica)
    await Underpost.repo.client(undefined, '', '', '', { syncEnvPort: true });

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

  if (
    absolutePath.match('src/api') &&
    !absolutePath.match('src/api/types.js') &&
    !confServer.apis.find((p) => absolutePath.match(`src/api/${p}/`))
  ) {
    return false;
  }
  if (absolutePath.match('conf.dd-') && absolutePath.match('.js')) return false;
  if (absolutePath.match('typedoc.dd-') && absolutePath.match('.json')) return false;
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
  if (absolutePath.match('src/client/sw/') && !absolutePath.match('src/client/sw/core.sw.js')) {
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
    absolutePath.match('src/client/ssr/views') &&
    !(confSsr.views || []).find((p) => absolutePath.match(`src/client/ssr/views/${p.client}.js`))
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
 * @param {boolean} [isFinal=false] - If true, logs when the final (non-replica) deployment completes.
 * @param {number} [deltaMs=1000] - The delta ms.
 * @param {boolean} [callback=false] - The callback.
 * @returns {Promise<boolean>} - `false` if `container-status=error` was detected, `true` on clean completion.
 * @memberof ServerConfBuilder
 */
const awaitDeployMonitor = async (isFinal = false, deltaMs = 1000, callback = false) => {
  if (!callback) Underpost.env.set('await-deploy', new Date().toISOString());
  if (isFinal) logger.info('Final deployment running (no replica)');
  await timer(deltaMs);
  if (Underpost.env.get('container-status') === 'error') return false;
  if (Underpost.env.get('await-deploy')) return await awaitDeployMonitor(false, deltaMs, true);
  return true;
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
  for (const o of conf.views || []) paths.push(`src/client/ssr/views/${o.client}.js`);
  return paths;
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
 * @description Scrapes `node bin help` (and `node bin help <command>` for every
 * registered command) and renders a structured Markdown reference: a command
 * index with anchor links, plus a per-command section with its description,
 * usage, and Arguments/Options rendered as tables. Writes
 * `CLI-HELP.md` + the served reference doc, and refreshes the README CLI index.
 * @param {object} program - The commander program.
 * @param {string} oldVersion - The old version string to replace.
 * @param {string} newVersion - The new version string.
 * @memberof ServerConfBuilder
 */
const buildCliDoc = (program, oldVersion, newVersion) => {
  const help = (args = '') => shellExec(`node bin help${args ? ` ${args}` : ''}`, { silent: true, stdout: true });
  // Escape table-breaking pipes and collapse wrapped whitespace for a Markdown cell.
  const cell = (s) => String(s).replace(/\s+/g, ' ').replaceAll('|', '\\|').trim();
  const anchor = (name) => `underpost-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

  // Parse a commander help block into { usage, description, sections: { Options, Arguments, Commands } }.
  const parseHelp = (text) => {
    const lines = text.split('\n');
    const usageMatch = lines[0].match(/^Usage:\s*(.*)$/);
    const usage = usageMatch ? usageMatch[1].trim() : '';
    const sections = {};
    const descLines = [];
    let current = null;
    let buf = [];
    const flush = () => {
      if (current) sections[current] = buf.join('\n');
      buf = [];
    };
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const head = line.match(/^([A-Za-z][\w ]*):\s*$/); // top-level "Options:", "Arguments:", "Commands:"
      if (head) {
        flush();
        current = head[1].trim();
      } else if (current !== null) {
        buf.push(line);
      } else {
        descLines.push(line);
      }
    }
    flush();
    return { usage, description: descLines.join('\n').trim(), sections };
  };

  // Parse a columnar "  <term>   <description>" section (descriptions may wrap onto
  // indented continuation lines) into [{ term, desc }].
  const parseEntries = (text = '') => {
    const entries = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const leading = line.length - line.trimStart().length;
      if (leading <= 2) {
        const rest = line.trim();
        const gap = rest.search(/\s{2,}/);
        entries.push(gap === -1 ? { term: rest, desc: '' } : { term: rest.slice(0, gap), desc: rest.slice(gap) });
      } else if (entries.length) {
        entries[entries.length - 1].desc += ` ${line.trim()}`;
      }
    }
    return entries;
  };

  const table = (head, entries) =>
    !entries.length
      ? ''
      : `| ${head[0]} | ${head[1]} |\n| --- | --- |\n` +
        entries.map(({ term, desc }) => `| \`${cell(term)}\` | ${cell(desc)} |`).join('\n') +
        '\n';

  const detailSection = (sections, name, head) => {
    const t = table(head, parseEntries(sections[name]));
    return t ? `\n#### ${name}\n\n${t}` : '';
  };

  // ── Top-level index ──
  const root = parseHelp(help());
  const commandEntries = parseEntries(root.sections['Commands']).filter((e) => e.term.split(' ')[0] !== 'help');

  const index =
    `## Underpost CLI\n\n` +
    (root.description ? `> ${root.description.replace(/\s+/g, ' ')}\n\n` : '') +
    `**Usage:** \`${root.usage}\`\n\n` +
    `### Global options\n\n${table(['Option', 'Description'], parseEntries(root.sections['Options']))}\n` +
    `### Commands\n\n| Command | Description |\n| --- | --- |\n` +
    commandEntries
      .map((e) => {
        const name = e.term.split(' ')[0];
        return `| [\`${name}\`](#${anchor(name)}) | ${cell(e.desc)} |`;
      })
      .join('\n') +
    '\n';

  // ── Per-command detail ──
  let details = `\n## Command reference\n`;
  for (const cmd of program.commands) {
    const name = cmd._name;
    if (name === 'help') continue;
    const cmdHelp = parseHelp(help(name));
    details +=
      `\n### underpost ${name}\n\n` +
      (cmdHelp.description ? `${cmdHelp.description.replace(/\s+/g, ' ')}\n\n` : '') +
      `**Usage:** \`${cmdHelp.usage}\`\n` +
      detailSection(cmdHelp.sections, 'Arguments', ['Argument', 'Description']) +
      detailSection(cmdHelp.sections, 'Options', ['Option', 'Description']) +
      `\n---\n`;
  }

  const md = `${index}${details}`.replaceAll(oldVersion, newVersion);
  fs.writeFileSync(`./src/client/public/nexodev/docs/references/Command Line Interface.md`, md, 'utf8');
  fs.writeFileSync(`./CLI-HELP.md`, md, 'utf8');

  // Update README.md: bump version and refresh the CLI index between the comment tags.
  let readme = fs.readFileSync(`./README.md`, 'utf8').replaceAll(oldVersion, newVersion);
  const cliStartTag = '<!-- cli-index-start -->';
  const cliEndTag = '<!-- cli-index-end -->';
  const startIdx = readme.indexOf(cliStartTag);
  const endIdx = readme.indexOf(cliEndTag);
  if (startIdx !== -1 && endIdx !== -1) {
    const readmeIndex = index.replace(/\(#(underpost-[a-z0-9-]+)\)/g, '(CLI-HELP.md#$1)');
    readme =
      readme.substring(0, startIdx) +
      cliStartTag +
      '\n' +
      readmeIndex.replaceAll(oldVersion, newVersion) +
      '\n' +
      cliEndTag +
      readme.substring(endIdx + cliEndTag.length);
  }
  fs.writeFileSync('./README.md', readme, 'utf8');
};

/**
 * @method getInstanceContext
 * @description Gets the instance context.
 * @param {object} options - The options.
 * @param {string} options.deployId - The deploy ID.
 * @param {boolean} options.singleReplica - The single replica.
 * @param {Array} options.replicas - The replicas.
 * @param {string} options.redirect - The redirect.
 * @param {boolean} [options.peer=false] - Whether peer is enabled on the parent singleReplica path (used for port offset estimation when replica conf is not yet built).
 * @returns {object} - The instance context.
 * @memberof ServerConfBuilder
 */
const getInstanceContext = async (options = { deployId, singleReplica, replicas, redirect: '', peer: false }) => {
  const { deployId, singleReplica, replicas, redirect, peer } = options;
  let singleReplicaOffsetPortSum = 0;

  if (singleReplica && replicas && replicas.length > 0) {
    for (const replica of replicas) {
      const replicaDeployId = buildReplicaId({ deployId, replica });
      const replicaConfPath = `./engine-private/replica/${replicaDeployId}/conf.server.json`;
      if (!fs.existsSync(replicaConfPath)) {
        // Replica folder not built yet (e.g. dev mode without prior build);
        // estimate port offset: 1 per replica path + 1 extra if peer is enabled on the parent singleReplica config
        singleReplicaOffsetPortSum++;
        if (peer) singleReplicaOffsetPortSum++;
        continue;
      }
      const confReplicaServer = loadConfServerJson(replicaConfPath);
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
 * @param {boolean} options.devProxy - The dev proxy flag.
 * @returns {void}
 * @memberof ServerConfBuilder
 */
const buildClientStaticConf = async (
  options = { deployId: '', subConf: '', apiBaseHost: '', host: '', path: '', devProxy: false },
) => {
  let { deployId, subConf, host, path, devProxy } = options;
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
  const apiBaseHost = devProxy
    ? devProxyHostFactory({ host, tls: isTlsDevProxy() })
    : options?.apiBaseHost
      ? options.apiBaseHost
      : `localhost:${envObj.PORT + 1}`;
  confServer[host][path].apiBaseHost = apiBaseHost;
  confServer[host][path].apiBaseProxyPath = path;
  logger.warn('Build client static conf', { host, path, apiBaseHost });
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

/**
 * @method isDevProxyContext
 * @description Checks if the dev proxy context is valid.
 * @returns {boolean} - The dev proxy context.
 * @memberof ServerConfBuilder
 */
const isDevProxyContext = () => (process.argv.find((arg) => arg === 'proxy') ? true : false);

/**
 * @method devProxyHostFactory
 * @description Creates the dev proxy host.
 * @param {object} options - The options.
 * @param {string} [options.host='default.net'] - The host.
 * @param {boolean} [options.includeHttp=false] - Whether to include HTTP.
 * @param {number} [options.port=443] - The port.
 * @param {boolean} [options.tls=false] - Whether to use TLS.
 * @returns {string} - The dev proxy host.
 * @memberof ServerConfBuilder
 */
const devProxyHostFactory = (options = { host: 'default.net', includeHttp: false, port: 80, tls: false }) => {
  const resolvedPort =
    (options.port ? options.port : options.tls ? 443 : 80) + parseInt(process.env.DEV_PROXY_PORT_OFFSET);
  const isDefaultPort = (options.tls && resolvedPort === 443) || (!options.tls && resolvedPort === 80);
  const protocol = options.includeHttp ? (options.tls ? 'https://' : 'http://') : '';
  const hostname = options.host ? options.host : 'localhost';
  return `${protocol}${hostname}${isDefaultPort ? '' : `:${resolvedPort}`}`;
};

/**
 * @method isTlsDevProxy
 * @description Checks if TLS is used in the dev proxy.
 * @returns {boolean} - The TLS dev proxy status.
 * @memberof ServerConfBuilder
 */
const isTlsDevProxy = () => process.env.NODE_ENV !== 'production' && !!process.argv.find((arg) => arg === 'tls');

/**
 * @method getTlsHosts
 * @description Gets the TLS hosts.
 * @param {object} confServer - The server configuration.
 * @returns {Array} - The TLS hosts.
 * @memberof ServerConfBuilder
 */
const getTlsHosts = (confServer) =>
  Array.from(new Set(Object.keys(confServer).map((h) => new URL('https://' + h).hostname)));

/**
 * Reads a `conf.server.json` file from disk, parses it, and resolves all `env:` secret
 * references using {@link resolveConfSecrets}.
 *
 * Reads and parses a `conf.server.json` file from disk. The `env:` secret
 * references are **preserved** by default so that build/deploy tooling never
 * accidentally strips them.  Callers that need the actual secret values
 * (e.g. database or mailer modules) should explicitly wrap the result with
 * {@link resolveConfSecrets}.
 *
 * @method loadConfServerJson
 * @param {string} jsonPath - Absolute or relative path to the `conf.server.json` file.
 * @param {object} [options] - Optional settings.
 * @param {boolean} [options.resolve=false] - When `true`, resolves `env:` references
 *   via {@link resolveConfSecrets} before returning.
 * @returns {object} The parsed server configuration object (secrets unresolved unless
 *   `options.resolve` is `true`).
 * @throws {Error} If the file does not exist or cannot be parsed.
 * @memberof ServerConfBuilder
 *
 * @example
 * // Structure-only read (env: strings preserved)
 * const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
 *
 * @example
 * // Resolved read (env: strings replaced with process.env values)
 * const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`, { resolve: true });
 */
const loadConfServerJson = (jsonPath, options) => {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`loadConfServerJson: configuration file not found: ${jsonPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return options && options.resolve === true ? resolveConfSecrets(raw) : raw;
};

/**
 * Creates and writes the /etc/hosts file for a deployment.
 * @method etcHostFactory
 * @param {Array<string>} hosts - List of hosts to be added to the hosts file.
 * @param {object} options - Options for the hosts file creation.
 * @param {boolean} options.append - Whether to append to the existing hosts file.
 * @returns {object} - Object containing the rendered hosts file.
 * @memberof ServerConfBuilder
 */
const etcHostFactory = (hosts = [], options = { append: false }) => {
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
};

/**
 * Resolves the concrete deploy ids a build or conf-sync run should iterate over.
 *
 * The meta deploy id `dd` fans out to the comma separated ids declared in
 * `engine-private/deploy/dd.router`; any other value is parsed as a comma separated list.
 * Entries are trimmed and empties dropped.
 *
 * @method resolveDeployList
 * @param {string} deployId - A deploy id, a comma separated list, or the `dd` meta id.
 * @returns {string[]} Ordered list of concrete deploy ids.
 * @memberof ServerConfBuilder
 */
const resolveDeployList = (deployId) =>
  (deployId === 'dd' ? fs.readFileSync('./engine-private/deploy/dd.router', 'utf8') : deployId)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

/**
 * Syncs a single deploy id's private configuration into its dedicated
 * `engine-<suffix>-private` repository and pushes the result.
 *
 * Idempotent and safe to rerun: the private repo is cloned when missing or reset to a clean
 * checkout when present, then the deploy id's `conf` folder, matching `replica` and
 * `itc-scripts` entries, and any caller-supplied `extraPaths` payloads are mirrored. The
 * commit/push step is a no-op when nothing changed (`silentOnError`).
 *
 * @method syncPrivateConf
 * @param {string} deployId - A concrete deploy id (e.g. `dd-cyberia`), not the `dd` meta id.
 * @param {string[]} [extraPaths=[]] - Extra `./engine-private` payload paths to mirror (from the
 *   deploy's product catalog), kept out of this module so it stays product-agnostic.
 * @returns {void}
 * @memberof ServerConfBuilder
 */
const syncPrivateConf = (deployId, extraPaths = []) => {
  const suffix = deployId.split('dd-')[1];
  const privateRepoName = `engine-${suffix}-private`;
  const privateGitUri = `${process.env.GITHUB_USERNAME}/${privateRepoName}`;
  const privateRepoPath = `../${privateRepoName}`;

  if (!fs.existsSync(privateRepoPath)) {
    shellExec(`cd .. && underpost clone ${privateGitUri}`, { silent: true });
  } else {
    shellExec(`git config --global --add safe.directory '${dir.resolve(privateRepoPath)}'`);
    shellExec(`cd ${privateRepoPath} && git checkout . && git clean -f -d && underpost pull . ${privateGitUri}`, {
      silent: true,
    });
  }

  const confDest = `${privateRepoPath}/conf/${deployId}`;
  fs.removeSync(confDest);
  fs.mkdirSync(confDest, { recursive: true });
  fs.copySync(`./engine-private/conf/${deployId}`, confDest);

  fs.removeSync(`${privateRepoPath}/replica`);
  for (const payloadDir of ['replica', 'itc-scripts']) {
    const srcDir = `./engine-private/${payloadDir}`;
    if (!fs.existsSync(srcDir)) continue;
    for (const entry of fs.readdirSync(srcDir))
      if (entry.match(deployId)) fs.copySync(`${srcDir}/${entry}`, `${privateRepoPath}/${payloadDir}/${entry}`);
  }

  for (const extraPath of extraPaths) fs.copySync(`./engine-private/${extraPath}`, `${privateRepoPath}/${extraPath}`);

  shellExec(
    `cd ${privateRepoPath}` +
      ` && git add .` +
      ` && underpost cmt . ci engine-core-conf 'Update ${deployId} conf'` +
      ` && underpost push . ${privateGitUri}`,
    { silent: true, silentOnError: true },
  );
};

/**
 * Moves a deploy's public template sources into the engine working tree ahead of
 * the build copy step. Idempotent and safe to rerun: each move is guarded by
 * `existsSync`, so already-moved or absent sources are skipped rather than throwing.
 * The `[src, dest]` pairs come from the deploy's product catalog (passed in), so
 * this module stays product-agnostic.
 *
 * @method syncDeployIdSources
 * @param {Array<[string, string]>} [sourceMoves=[]] - Public `[src, dest]` move pairs.
 * @returns {boolean} `true` when any sources were declared, else `false`.
 * @memberof ServerConfBuilder
 */
const syncDeployIdSources = (sourceMoves = []) => {
  if (!sourceMoves.length) return false;
  for (const dir of ['src/api', 'src/client/components', 'src/client/public', 'src/client/services'])
    fs.mkdirSync(dir, { recursive: true });
  for (const [src, dest] of sourceMoves) if (fs.existsSync(src)) fs.moveSync(src, dest, { overwrite: true });
  return true;
};

/**
 * Rebuilds the standalone `pwa-microservices-template` from scratch out of the current
 * engine source tree.
 *
 * Clones the template repo next to the engine when missing, otherwise resets it to a clean
 * pristine checkout, then syncs every engine-tracked file the template is allowed to carry
 * ({@link validateTemplatePath}), strips engine-only + product modules, restores the template's
 * own CI workflows + guest services, and rewrites `package.json` / `package-lock.json` / `README`
 * so the result is a standalone, installable project. Throws on failure; callers own exit codes.
 *
 * Product catalogs are read dynamically ({@link module:src/server/catalog} `loadProductCatalogs`),
 * so this stays decoupled from — and survives removal of — any product module.
 *
 * @method buildTemplate
 * @param {object} [options]
 * @param {string} [options.srcPath='./'] - Engine source root to sync from.
 * @param {string} [options.toPath='../pwa-microservices-template'] - Template output path.
 * @returns {Promise<void>}
 * @memberof ServerConfBuilder
 */
const buildTemplate = async ({ srcPath = './', toPath = '../pwa-microservices-template' } = {}) => {
  const walk = (await import('ignore-walk')).default;
  const { TEMPLATE_RESTORE_PATHS, TEMPLATE_KEYWORDS, TEMPLATE_DESCRIPTION } = await import('./catalog-underpost.js');
  const { loadProductCatalogs } = await import('./catalog.js');
  const githubUsername = process.env.GITHUB_USERNAME;

  logger.info('Build template', { srcPath, toPath });

  const sourceFiles = (
    await new Promise((resolve) =>
      walk({ path: srcPath, ignoreFiles: [`.gitignore`], includeEmpty: false, follow: false }, (...args) =>
        resolve(args[1]),
      ),
    )
  ).filter((p) => !p.startsWith('.git'));

  fs.removeSync(`${githubUsername}/pwa-microservices-template`);
  shellExec(`cd .. && node engine/bin clone ${githubUsername}/pwa-microservices-template`);

  shellExec(`cd ${toPath} && git config core.filemode false`);

  for (const copyPath of sourceFiles) {
    if (copyPath === 'NaN') continue;
    const absolutePath = `${srcPath}/${copyPath}`;
    if (!validateTemplatePath(absolutePath)) continue;

    const folder = getDirname(`${toPath}/${copyPath}`);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    logger.info('build', `${toPath}/${copyPath}`);
    fs.copyFileSync(absolutePath, `${toPath}/${copyPath}`);
  }

  fs.copySync(`./.vscode`, `${toPath}/.vscode`);
  fs.copySync(`./src/client/public/default`, `${toPath}/src/client/public/default`);

  // Preserve the template's own README + package.json identity before merging engine metadata.
  for (const checkoutPath of ['README.md', 'package.json']) shellExec(`cd ${toPath} && git checkout ${checkoutPath}`);

  // Strip each product catalog's `stripPaths` (aggregated dynamically) plus the engine-only
  // workflows, deploy manifests, and product catalog modules.
  const productStripPaths = (await loadProductCatalogs()).flatMap((c) => c.stripPaths);
  for (const deletePath of productStripPaths) {
    const target = `${toPath}/${deletePath}`;
    if (fs.existsSync(target)) fs.removeSync(target);
  }
  shellExec(`rm -rf ${toPath}/.github`);
  shellExec(`rm -rf ${toPath}/manifests/deployment/dd-*`);
  shellExec(`rm -rf ${toPath}/src/server/catalog-*`);

  fs.mkdirSync(`${toPath}/.github/workflows`, { recursive: true });
  for (const restorePath of TEMPLATE_RESTORE_PATHS) {
    const dest = `${toPath}/${restorePath}`;
    if (fs.statSync(restorePath).isDirectory()) fs.copySync(restorePath, dest, { overwrite: true });
    else fs.copyFileSync(restorePath, dest);
  }

  // ── package.json: take engine deps/scripts/version, keep template identity. ──
  const originPackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  const templatePackageJson = JSON.parse(fs.readFileSync(`${toPath}/package.json`, 'utf8'));
  const templateName = templatePackageJson.name;

  templatePackageJson.dependencies = originPackageJson.dependencies;
  templatePackageJson.devDependencies = originPackageJson.devDependencies;
  templatePackageJson.version = originPackageJson.version;
  templatePackageJson.scripts = originPackageJson.scripts;
  templatePackageJson.overrides = originPackageJson.overrides;
  templatePackageJson.name = templateName;
  templatePackageJson.description = TEMPLATE_DESCRIPTION;
  templatePackageJson.keywords = TEMPLATE_KEYWORDS;
  delete templatePackageJson.scripts['build:template'];
  fs.writeFileSync(`${toPath}/package.json`, JSON.stringify(templatePackageJson, null, 4), 'utf8');

  // ── package-lock.json: mirror engine packages, keep template name/version on the root entry. ──
  const originPackageLockJson = JSON.parse(fs.readFileSync('./package-lock.json', 'utf8'));
  const templatePackageLockJson = JSON.parse(fs.readFileSync(`${toPath}/package-lock.json`, 'utf8'));
  const originBasePackageLock = newInstance(templatePackageLockJson.packages['']);
  templatePackageLockJson.name = templateName;
  templatePackageLockJson.version = originPackageLockJson.version;
  templatePackageLockJson.packages = originPackageLockJson.packages;
  templatePackageLockJson.packages[''].name = templateName;
  templatePackageLockJson.packages[''].version = originPackageLockJson.version;
  templatePackageLockJson.packages[''].hasInstallScript = originBasePackageLock.hasInstallScript;
  templatePackageLockJson.packages[''].license = originBasePackageLock.license;
  fs.writeFileSync(`${toPath}/package-lock.json`, JSON.stringify(templatePackageLockJson, null, 4), 'utf8');

  fs.writeFileSync(
    `${toPath}/README.md`,
    fs
      .readFileSync('./README.md', 'utf8')
      .replace('<!-- template-title -->', '#### Base template for pwa/api-rest projects.'),
    'utf8',
  );
};

const updatePrivateTemplateRepo = async () => {
  const templatePath = '/home/dd/pwa-microservices-template';
  shellExec(`sudo rm -rf ${templatePath}
cd /home/dd/engine && npm run build:template
cd /home/dd
underpost clone --bare underpostnet/pwa-microservices-template-private
sudo rm -rf ${templatePath}/.git
mv ./pwa-microservices-template-private.git ${templatePath}/.git
cd ${templatePath}
npm install --omit=dev --ignore-scripts
git init
git config user.name 'underpostnet'
git config user.email 'development@underpost.net'
git add .`);
  const hasChanges = shellExec(`node bin cmt ${templatePath} --has-changes`, {
    stdout: true,
    silent: true,
    disableLog: true,
  }).trim();
  if (hasChanges === '1') {
    shellExec(
      `cd ${templatePath} && git commit -m 'Update template' && underpost push . underpostnet/pwa-microservices-template-private`,
    );
  }
};

/**
 * @method updatePrivateEngineTestRepo
 * @description Publishes a deploy id's freshly assembled template to its private
 * **test** source repo `engine-test-<idPart>` (separate from the production
 * `engine-<idPart>`). A pod started with `underpost start --build --private-test-repo`
 * clones this repo, so work-in-progress engine source can be tested end to end
 * without touching the production source. Mirrors {@link updatePrivateTemplateRepo}
 * but per-deploy-id and against the test repo.
 *
 * Assumes the deploy id template has already been assembled at the template path
 * (run `node bin/build <deployId>` first, or use `node bin/build <deployId> --update-private`).
 * @param {string} deployId - Concrete deploy id (e.g. `dd-core`).
 * @returns {Promise<void>}
 * @memberof ServerConfBuilder
 */
const updatePrivateEngineTestRepo = async (deployId) => {
  const username = process.env.GITHUB_USERNAME || 'underpostnet';
  const repoName = `engine-test-${deployId.split('-')[1]}`;
  const templatePath = '/home/dd/pwa-microservices-template';
  if (!fs.existsSync(templatePath))
    throw new Error(`updatePrivateEngineTestRepo: assemble the template first (node bin/build ${deployId})`);

  // Detach the assembled working tree from any engine-build git history.
  shellExec(`sudo rm -rf ${templatePath}/.git`);

  // Adopt the test repo's existing history when present (so the push is a delta);
  // otherwise publish a fresh history on first push.
  shellExec(`cd /home/dd && sudo rm -rf ./${repoName}.git && underpost clone --bare ${username}/${repoName}`, {
    silent: true,
    disableLog: true,
    silentOnError: true,
  });
  if (fs.existsSync(`/home/dd/${repoName}.git`)) shellExec(`mv /home/dd/${repoName}.git ${templatePath}/.git`);

  // `git init` converts the moved bare repo into a normal work-tree repo (bare
  // clones have no work tree, so `git add` would fail), and bootstraps a fresh
  // repo on first publish. Idempotent — mirrors updatePrivateTemplateRepo.
  shellExec(`cd ${templatePath}
git init
git config user.name '${username}'
git config user.email 'development@underpost.net'
git add .`);

  const hasChanges = shellExec(`node bin cmt ${templatePath} --has-changes`, {
    stdout: true,
    silent: true,
    disableLog: true,
  }).trim();
  if (hasChanges === '1')
    shellExec(`cd ${templatePath} && git commit -m 'Update ${repoName}' && underpost push . ${username}/${repoName}`);
  else logger.info('No changes to publish', { repoName });
};

export {
  Config,
  loadConf,
  loadReplicas,
  cloneConf,
  getCapVariableName,
  addClientConf,
  buildClientSrc,
  buildApiSrc,
  addApiConf,
  addWsConf,
  buildWsSrc,
  cloneSrcComponents,
  buildProxyRouter,
  getDataDeploy,
  validateTemplatePath,
  buildReplicaId,
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
  buildCliDoc,
  getInstanceContext,
  buildApiConf,
  buildClientStaticConf,
  isDeployRunnerContext,
  isDevProxyContext,
  devProxyHostFactory,
  isTlsDevProxy,
  getTlsHosts,
  resolveHostKeyContext,
  resolveConfSecrets,
  loadConfServerJson,
  getConfFolder,
  getConfFilePath,
  readConfJson,
  DEFAULT_DEPLOY_ID,
  loadCronDeployEnv,
  cronDeployIdResolve,
  etcHostFactory,
  resolveDeployList,
  syncPrivateConf,
  syncDeployIdSources,
  buildTemplate,
  updatePrivateTemplateRepo,
  updatePrivateEngineTestRepo,
};
