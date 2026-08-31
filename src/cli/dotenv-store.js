/**
 * Key-level CRUD over a dotenv-backed store file.
 *
 * Two stores exist and must not share a file: the host configuration store, holding this node's
 * configuration, and the container state store, holding one workload's runtime status. They are
 * the same shape, so the operations live here once.
 * @module src/cli/dotenv-store.js
 * @namespace UnderpostDotenvStore
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';
import nodePath from 'node:path';

import { loggerFactory } from '../server/ops/logger.js';
import { pbcopy } from '../server/runtime/process.js';
import { writeEnv } from '../server/runtime/environment.js';

const logger = loggerFactory(import.meta);

/**
 * Removes a store path that exists as a directory, which a previous EISDIR bug could leave behind.
 * @param {string} storePath - Path to the store file.
 * @memberof UnderpostDotenvStore
 */
const guardStorePath = (storePath) => {
  if (fs.existsSync(storePath) && !fs.statSync(storePath).isFile()) {
    logger.warn(`Removing stale directory at store path: ${storePath}`);
    fs.removeSync(storePath);
  }
};

/**
 * Builds the CRUD surface for one dotenv-backed store.
 * @param {object} options - Store definition.
 * @param {Function} options.path - Resolves the store file path at call time, so a store whose
 *   location depends on the installation root is never captured at import.
 * @param {string} options.label - Name used in log lines.
 * @returns {{get: Function, set: Function, delete: Function, list: Function, clean: Function, path: Function}} Store API.
 * @memberof UnderpostDotenvStore
 */
const dotenvStoreFactory = ({ path, label }) => {
  const read = () => {
    const storePath = path();
    if (!fs.existsSync(storePath) || !fs.statSync(storePath).isFile()) return {};
    return dotenv.parse(fs.readFileSync(storePath, 'utf8'));
  };
  const write = (values) => {
    const storePath = path();
    fs.ensureDirSync(nodePath.dirname(storePath));
    guardStorePath(storePath);
    writeEnv(storePath, values);
  };

  return {
    path,

    /**
     * Reads one key.
     * @param {string} key - Key to read.
     * @param {*} [value] - Unused; keeps the CLI argument arity uniform.
     * @param {object} [options] - Options.
     * @param {boolean} [options.plain] - Print the bare value on stdout.
     * @param {boolean} [options.disableLog] - Suppress logging.
     * @param {boolean} [options.copy] - Copy the value to the clipboard.
     * @returns {string|undefined} Stored value.
     * @memberof UnderpostDotenvStore
     */
    get(key, value, options = {}) {
      // The environment is the fallback, not an override: the store file always wins where it has
      // the key. A container gets this configuration injected as environment variables rather than
      // as a mounted file — bind-mounting the directory that holds the file would hand the pod a
      // home-directory tree no unprivileged container can read under SELinux.
      const stored = read()[key] ?? process.env[key];
      // `--plain` is a machine read: an absent key prints nothing, never the string `undefined`,
      // so a caller testing for empty output is not handed a value that looks set.
      if (!options.disableLog)
        options.plain === true ? console.log(stored ?? '') : logger.info(`${key}(${typeof stored})`, stored);
      if (options.copy === true) pbcopy(stored);
      return stored;
    },

    /**
     * Writes one key.
     * @param {string} key - Key to write.
     * @param {string} value - Value to write.
     * @memberof UnderpostDotenvStore
     */
    set(key, value) {
      write({ ...read(), [key]: value });
    },

    /**
     * Removes one key.
     * @param {string} key - Key to remove.
     * @memberof UnderpostDotenvStore
     */
    delete(key) {
      const values = read();
      delete values[key];
      write(values);
    },

    /**
     * Lists the store, optionally narrowed by a case-insensitive substring of key or value.
     * @param {*} [key] - Unused; keeps the CLI argument arity uniform.
     * @param {*} [value] - Unused; keeps the CLI argument arity uniform.
     * @param {object} [options] - Options.
     * @param {string} [options.filter] - Substring filter.
     * @param {boolean} [options.disableLog] - Suppress logging.
     * @returns {Object<string, string>} Stored values.
     * @memberof UnderpostDotenvStore
     */
    list(key, value, options = {}) {
      let values = read();
      if (options.filter) {
        const keyword = options.filter.toLowerCase();
        values = Object.fromEntries(
          Object.entries(values).filter(
            ([storedKey, storedValue]) =>
              storedKey.toLowerCase().includes(keyword) || `${storedValue}`.toLowerCase().includes(keyword),
          ),
        );
      }
      if (!options.disableLog) logger.info(options.filter ? `${label} (filtered: ${options.filter})` : label, values);
      return values;
    },

    /**
     * Empties the store, optionally retaining named keys.
     * @param {object} [options] - Options.
     * @param {Array<string>} [options.keepKeys=[]] - Keys to retain.
     * @memberof UnderpostDotenvStore
     */
    clean(options = {}) {
      const keepKeys = options.keepKeys ?? [];
      if (keepKeys.length === 0) return fs.removeSync(path());
      write(Object.fromEntries(Object.entries(read()).filter(([key]) => keepKeys.includes(key))));
    },
  };
};

export { dotenvStoreFactory, guardStorePath };
