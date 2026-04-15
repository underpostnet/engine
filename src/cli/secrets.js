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
      createFromEnvFile(envPath) {
        Underpost.env.clean();
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          Underpost.env.set(key, envObj[key]);
        }
      },
      /** Reads application secrets from process.env (injected via envFrom: secretRef)
       *  and writes them to the underpost .env file, filtering out known system and
       *  Kubernetes-injected environment variables. Replaces the fragile shell-based
       *  `printenv | grep -vE` pattern with a maintainable Node.js blocklist.
       */
      createFromContainerEnv() {
        Underpost.env.clean();
        const systemKeys = new Set([
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
        const systemKeyPrefixes = ['KUBERNETES_', 'npm_', 'NODE_'];
        for (const [key, value] of Object.entries(process.env)) {
          if (systemKeys.has(key)) continue;
          if (systemKeyPrefixes.some((prefix) => key.startsWith(prefix))) continue;
          Underpost.env.set(key, value);
        }
      },
    },

    /**
     * Removes all filesystem traces of secrets after deployment startup.
     * Centralizes the defense-in-depth cleanup performed
     * @memberof UnderpostSecret
     */
    globalSecretClean() {
      loadConf('clean');
      fs.removeSync('./engine-private');
      Underpost.env.clean();
    },
  };
}

export default UnderpostSecret;
