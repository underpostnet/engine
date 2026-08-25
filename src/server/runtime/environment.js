/**
 * Environment and global installation path resolution.
 * @module src/server/runtime/environment.js
 * @namespace ServerEnvironment
 */
'use strict';

import dotenv from 'dotenv';
import fs from 'fs-extra';
import { execFileSync } from 'node:child_process';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { loggerFactory } from '../ops/logger.js';

const logger = loggerFactory(import.meta);

/**
 * Node directory backing every hostPath PersistentVolume the deploy flow
 * materializes (`<root>/<pv id>`), including the shared gateway's static tree.
 * Cluster bring-up gives it the shared container label, because the pods that
 * read these documents are unprivileged.
 * @constant {string}
 * @memberof ServerEnvironment
 */
const HOST_VOLUME_ROOT = '/home/dd/engine/volume';
const packageRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../..');
const envFileCache = new Map();
let rootEnvPath;

/**
 * Resolves the global npm module directory.
 * @returns {string}
 * @memberof ServerEnvironment
 */
const getNpmRootPath = () => {
  try {
    return execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

/**
 * Resolves the global Underpost installation directory.
 * @returns {string}
 * @memberof ServerEnvironment
 */
const getUnderpostRootPath = () => {
  const npmRoot = getNpmRootPath();
  return npmRoot ? `${npmRoot}/underpost` : `${packageRoot}/.underpost`;
};

const readEnvFile = (path) => {
  if (envFileCache.has(path)) return envFileCache.get(path);
  let values = {};
  try {
    if (path && fs.existsSync(path)) values = dotenv.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    logger.warn('Ignoring unreadable env file', { target: path, message: error.message });
  }
  envFileCache.set(path, values);
  return values;
};

const environmentValueFactory = (key) => {
  const processValue = `${process.env[key] ?? ''}`.trim();
  if (processValue) return processValue;

  if (rootEnvPath === undefined) {
    const underpostRoot = getUnderpostRootPath();
    rootEnvPath = underpostRoot ? `${underpostRoot}/.env` : '';
  }

  for (const path of ['./.env', rootEnvPath]) {
    const value = `${readEnvFile(path)[key] ?? ''}`.trim();
    if (value) return value;
  }
  return '';
};

/**
 * Single source of truth for resolving a deployment environment name from CLI options.
 * Explicit `--env` always wins; `--dev` is the development shorthand; otherwise the
 * caller's `fallback` decides. Deliberately does not read `process.env.NODE_ENV`, so a
 * developer shell that exports it cannot silently retarget a deploy — callers whose
 * contract is ambient (the client build) pass it in as `fallback` themselves.
 * @method deployEnvFactory
 * @param {object} [options] - CLI options carrying the environment selection.
 * @param {string} [options.env] - Explicit environment name.
 * @param {boolean} [options.dev] - Development context shorthand.
 * @param {string} [fallback='production'] - Value when no option selects an environment.
 * @returns {string} `development` | `production` | `test` | custom env name.
 * @memberof ServerEnvironment
 */
const deployEnvFactory = (options = {}, fallback = 'production') => {
  const explicit = `${options?.env ?? ''}`.trim();
  if (explicit) return explicit;
  if (options?.dev === true) return 'development';
  return fallback;
};

/**
 * Writes environment values as a dotenv file.
 * @method writeEnv
 * @param {string} envPath - Destination file path.
 * @param {Object<string, *>} envObj - Environment values keyed by variable name.
 * @returns {void}
 * @memberof ServerEnvironment
 */
const writeEnv = (envPath, envObj) =>
  fs.writeFileSync(
    envPath,
    Object.keys(envObj)
      .map((key) => `${key}=${envObj[key]}`)
      .join('\n'),
    'utf8',
  );

export { deployEnvFactory, environmentValueFactory, getNpmRootPath, getUnderpostRootPath, HOST_VOLUME_ROOT, writeEnv };
