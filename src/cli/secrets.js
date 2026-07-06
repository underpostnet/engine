/**
 * Secrets module for managing the secrets of the application.
 * @module src/cli/secrets.js
 * @namespace UnderpostSecret
 */

import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import Underpost from '../index.js';
import { loadConf } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

// Shell/runtime-critical and Kubernetes-injected env keys that must never be persisted as
// application secrets nor injected into a pod via `envFrom`. An injected PATH (or HOME, etc.)
// overrides the container image's own and breaks coreutils/sudo resolution inside the pod
// ("rm: command not found"). Single source of truth for both container-env capture and the
// `underpost-config` secret built from an env file.
const RESERVED_ENV_KEYS = new Set([
  'HOME',
  'HOSTNAME',
  'PATH',
  'TERM',
  'SHLVL',
  'PWD',
  '_',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'container',
  'SHELL',
  'USER',
  'LOGNAME',
  'MAIL',
  'OLDPWD',
  'LESSOPEN',
  'LESSCLOSE',
  'LS_COLORS',
  'DISPLAY',
  'COLORTERM',
  'EDITOR',
  'VISUAL',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'SSH_AUTH_SOCK',
  'SSH_CLIENT',
  'SSH_CONNECTION',
  'SSH_TTY',
  'XDG_SESSION_ID',
  'XDG_RUNTIME_DIR',
  'XDG_DATA_DIRS',
  'XDG_CONFIG_DIRS',
  'DBUS_SESSION_BUS_ADDRESS',
  'GPG_AGENT_INFO',
  'WINDOWID',
  'DESKTOP_SESSION',
  'SESSION_MANAGER',
  'XAUTHORITY',
  'WAYLAND_DISPLAY',
  'which_declare',
]);
const RESERVED_ENV_KEY_PREFIXES = ['KUBERNETES_', 'npm_', 'NODE_'];
const isReservedEnvKey = (key) =>
  RESERVED_ENV_KEYS.has(key) || RESERVED_ENV_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));

/**
 * @class UnderpostSecret
 * @description Manages the secrets of the application.
 * @memberof UnderpostSecret
 */
class UnderpostSecret {
  static API = {
    /**
     * @method underpost
     * @description Manages the secrets of the application.
     * @memberof UnderpostSecret
     */
    underpost: {
      /**
       * @method createFromEnvFile
       * @description Reads application secrets from a .env file and writes them to the underpost .env file. Used for local development and testing.
       * @param {string} envPath - The path to the .env file to read secrets from. Defaults to './.env'.
       * @memberof UnderpostSecret
       */
      createFromEnvFile(envPath = './.env') {
        Underpost.env.clean();
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          Underpost.env.set(key, envObj[key]);
        }
      },
      /**
       * @method createFromContainerEnv
       * @description Reads application secrets from process.env (injected via envFrom: secretRef)
       *  and writes them to the underpost .env file, filtering out known system and
       *  Kubernetes-injected environment variables. Replaces the fragile shell-based
       *  `printenv | grep -vE` pattern with a maintainable Node.js blocklist.
       * @memberof UnderpostSecret
       */
      createFromContainerEnv() {
        Underpost.env.clean();
        for (const [key, value] of Object.entries(process.env)) {
          if (isReservedEnvKey(key)) continue;
          Underpost.env.set(key, value);
        }
      },
    },

    /**
     * @method sanitizeSecretEnvFile
     * @description Strips shell/runtime-critical and Kubernetes-injected keys (PATH, HOME, …) from
     * raw `.env` file content so the resulting `underpost-config` secret can be safely injected via
     * `envFrom` without clobbering the container image's own PATH. Blank lines and comments are
     * preserved. Uses the same {@link RESERVED_ENV_KEYS} blocklist as container-env capture.
     * @param {string} envFileContent - Raw contents of a `.env.<env>` file.
     * @returns {string} Filtered env-file content.
     * @memberof UnderpostSecret
     */
    sanitizeSecretEnvFile(envFileContent) {
      return envFileContent
        .split('\n')
        .filter((line) => {
          const trimmed = line.trimStart();
          if (!trimmed || trimmed.startsWith('#')) return true;
          const key = line.slice(0, line.indexOf('=')).trim();
          return !key || !isReservedEnvKey(key);
        })
        .join('\n');
    },

    /**
     * Removes all filesystem traces of secrets after deployment startup.
     * Centralizes the defense-in-depth cleanup performed
     * @param {object} options - Options for cleaning the environment.
     * @param {Array<string>} [options.keepKeys=[]] - List of keys to keep in the environment file. If provided, only these keys will be retained.
     * @memberof UnderpostSecret
     */
    globalSecretClean(options = { keepKeys: [] }) {
      const { keepKeys } = options;
      loadConf('clean');
      Underpost.repo.cleanupPrivateEngineRepo();
      Underpost.env.clean({
        keepKeys: keepKeys.length > 0 ? keepKeys : ['container-status', 'start-container-status'],
      });
    },
  };
}

export default UnderpostSecret;
