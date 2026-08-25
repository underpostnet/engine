/**
 * Host domain: the complete node-level operational environment.
 *
 * Its durable source is the cron deploy's env file — SSH, registry, DNS, mail, cluster and
 * deployment settings — resolved through `engine-private/deploy/dd.cron`, the same id the cron
 * jobs run against, so this is the one configuration the whole cluster shares.
 *
 * Implements the canonical domain action set; see {@link UnderpostDomains.DOMAIN_ACTIONS}.
 * @module src/cli/host.js
 * @namespace UnderpostHost
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';

import { cronDeployIdResolve } from '../server/ops/cron.js';
import { domainContextFactory } from './domains.js';
import { loggerFactory } from '../server/ops/logger.js';
import { shellExec } from '../server/runtime/process.js';
import { writeEnv } from '../server/runtime/environment.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

const UNDERPOST_CONFIG_SECRET = 'underpost-config';

// Shell- and Kubernetes-critical keys that must never round-trip through a published Secret:
// an injected PATH overrides the container image's own and breaks coreutils resolution in the
// pod. NODE_ENV is deliberately exempt — it is the deployment environment this domain exists to
// carry, and stripping it made every deploy fall back to `development`.
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
const PRESERVED_ENV_KEYS = new Set(['NODE_ENV']);

/**
 * Whether a key must be kept out of a published Secret and out of the root env store.
 * @param {string} key - Environment variable name.
 * @returns {boolean} True when the key is reserved.
 * @memberof UnderpostHost
 */
const isReservedEnvKey = (key) =>
  !PRESERVED_ENV_KEYS.has(key) &&
  (RESERVED_ENV_KEYS.has(key) || RESERVED_ENV_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)));

/**
 * @class UnderpostHost
 * @description Host/global infrastructure configuration domain.
 * @memberof UnderpostHost
 */
class UnderpostHost {
  static API = {
    /**
     * Resolves the durable source for an environment.
     * @param {string} [env='production'] - Environment selector.
     * @returns {string} Path to the cron deploy's `.env.<env>`.
     * @memberof UnderpostHost
     */
    envPath(env = 'production') {
      return `./engine-private/conf/${cronDeployIdResolve() || 'dd-cron'}/.env.${env || 'production'}`;
    },

    /**
     * Parses the host configuration. An absent source reads as `{}` so callers can probe
     * without branching on existence.
     * @param {string} [env='production'] - Environment selector.
     * @returns {Object<string, string>} Parsed host configuration.
     * @memberof UnderpostHost
     */
    read(env = 'production') {
      const envPath = UnderpostHost.API.envPath(env);
      return fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath, 'utf8')) : {};
    },

    /**
     * Strips reserved keys from raw env-file content before it becomes a Secret.
     * Blank lines and comments are preserved.
     * @param {string} envFileContent - Raw `.env.<env>` contents.
     * @returns {string} Filtered content.
     * @memberof UnderpostHost
     */
    sanitizeEnvFile(envFileContent) {
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
     * Typed read of the Grafana administrator keys. They are host configuration because the
     * admin identity is declared once for the cluster; the secret domain onboards them from here.
     * @param {object} [options] - Options.
     * @param {string} [options.env='production'] - Environment selector.
     * @param {boolean} [options.required=true] - Throw when user or password is missing.
     * @returns {{username: string, password: string, email: string, envPath: string}} Credentials.
     * @memberof UnderpostHost
     */
    grafanaAdmin(options = {}) {
      const env = `${options.env ?? ''}`.trim() || (options.dev === true ? 'development' : 'production');
      const values = UnderpostHost.API.read(env);
      const credentials = {
        username: `${values.GF_SECURITY_ADMIN_USER || ''}`.trim(),
        password: `${values.GF_SECURITY_ADMIN_PASSWORD || ''}`,
        email: `${values.GF_SECURITY_ADMIN_EMAIL || ''}`.trim(),
        envPath: UnderpostHost.API.envPath(env),
      };
      if (options.required !== false) {
        const missing = [
          !credentials.username && 'GF_SECURITY_ADMIN_USER',
          !credentials.password && 'GF_SECURITY_ADMIN_PASSWORD',
        ].filter(Boolean);
        if (missing.length > 0) throw new Error(`[grafana] missing ${missing.join(', ')} in ${credentials.envPath}`);
      }
      return credentials;
    },

    // ── canonical domain actions ────────────────────────────────────────────────────────────

    /**
     * Onboards the host domain: confirms the cron deploy resolves and its source exists, then
     * loads it. Idempotent — repeating it re-converges rather than re-provisioning.
     * @param {object} context - Normalized domain context.
     * @returns {{deployId: string, source: string, keys: number}} What was onboarded.
     * @memberof UnderpostHost
     */
    setup(context = {}) {
      context = domainContextFactory(context);
      const deployId = cronDeployIdResolve() || 'dd-cron';
      const source = UnderpostHost.API.envPath(context.env);
      if (!fs.existsSync(source)) throw new Error(`[host] configuration source not found: ${source}`);
      if (context.dryRun) {
        logger.info('[dry-run] host setup would load', { deployId, source });
        return { deployId, source, keys: Object.keys(UnderpostHost.API.read(context.env)).length };
      }
      const { keys } = UnderpostHost.API.load(context);
      return { deployId, source, keys };
    },

    /**
     * Loads the host configuration into the underpost root env store.
     *
     * Two sources, one meaning. On a node the env file is on disk. Inside a workload container it
     * is not — `engine-private` is not cloned yet at that point in the boot — and the same
     * configuration arrives as the container environment, injected from the Secret `apply` wrote.
     * Preferring whichever is present makes one action correct in both places.
     *
     * Idempotent: the store is rebuilt from the source, so repeating converges.
     * @param {object} context - Normalized domain context.
     * @returns {{source: string, keys: number}} Where the configuration came from and how much.
     * @memberof UnderpostHost
     */
    load(context = {}) {
      context = domainContextFactory(context);
      const envPath = UnderpostHost.API.envPath(context.env);
      const fromFile = fs.existsSync(envPath);
      const values = fromFile
        ? dotenv.parse(fs.readFileSync(envPath, 'utf8'))
        : Object.fromEntries(Object.entries(process.env).filter(([key]) => !isReservedEnvKey(key)));
      const source = fromFile ? envPath : 'container-env';
      if (context.dryRun) {
        logger.info('[dry-run] host load would replace the root env store', {
          source,
          keys: Object.keys(values).length,
        });
        return { source, keys: Object.keys(values).length };
      }
      Underpost.env.clean();
      for (const [key, value] of Object.entries(values)) Underpost.env.set(key, value);
      logger.info('Host configuration loaded', { source, keys: Object.keys(values).length });
      return { source, keys: Object.keys(values).length };
    },

    /**
     * Writes the underpost root env store back into the durable host configuration source.
     *
     * The inverse of `load`. Refuses to overwrite an existing source without `--force`, because
     * the root env store on a node is a projection and can be narrower than the file it came from.
     * @param {object} context - Normalized domain context.
     * @returns {{target: string, keys: number}} What was written.
     * @memberof UnderpostHost
     */
    publish(context = {}) {
      context = domainContextFactory(context);
      const target = UnderpostHost.API.envPath(context.env);
      const values = Underpost.env.list(undefined, undefined, { disableLog: true });
      const keys = Object.keys(values);
      if (keys.length === 0) throw new Error('[host] the root env store is empty; nothing to publish');
      if (fs.existsSync(target) && !context.force)
        throw new Error(`[host] ${target} already exists; re-run with --force to overwrite it`);
      if (context.dryRun) {
        logger.info('[dry-run] host publish would write', { target, keys: keys.length });
        return { target, keys: keys.length };
      }
      writeEnv(target, values);
      logger.info('Host configuration published', { target, keys: keys.length });
      return { target, keys: keys.length };
    },

    /**
     * Projects the host configuration into the cluster as the `underpost-config` Secret that
     * workloads inject with `envFrom`.
     *
     * Applying it before a deploy is what makes the pod resolve the requested `NODE_ENV`: the
     * container reads it back through `load`, so a stale Secret means a stale environment.
     * Idempotent — delete-then-apply converges on the current source.
     * @param {object} context - Normalized domain context.
     * @returns {{secret: string, namespace: string, env: string}} What was projected.
     * @memberof UnderpostHost
     */
    apply(context = {}) {
      context = domainContextFactory(context);
      const envFilePath = UnderpostHost.API.envPath(context.env);
      if (!fs.existsSync(envFilePath)) throw new Error(`[host] configuration source not found: ${envFilePath}`);
      if (context.dryRun) {
        logger.info('[dry-run] host apply would publish the Secret', {
          secret: UNDERPOST_CONFIG_SECRET,
          namespace: context.namespace,
          source: envFilePath,
        });
        return { secret: UNDERPOST_CONFIG_SECRET, namespace: context.namespace, env: context.env };
      }
      // `--from-env-file` turns every KEY=VALUE into a secret key the Deployment injects via
      // `envFrom`, so the file is sanitized before it is handed to kubectl.
      const sanitizedEnvPath = `${envFilePath}.secret`;
      fs.writeFileSync(sanitizedEnvPath, UnderpostHost.API.sanitizeEnvFile(fs.readFileSync(envFilePath, 'utf8')));
      try {
        shellExec(`kubectl delete secret ${UNDERPOST_CONFIG_SECRET} -n ${context.namespace} --ignore-not-found`);
        shellExec(
          `kubectl create secret generic ${UNDERPOST_CONFIG_SECRET} --from-env-file=${sanitizedEnvPath} --dry-run=client -o yaml | kubectl apply -f - -n ${context.namespace}`,
        );
      } finally {
        fs.removeSync(sanitizedEnvPath);
      }
      logger.info('Host configuration applied', { env: context.env, namespace: context.namespace });
      return { secret: UNDERPOST_CONFIG_SECRET, namespace: context.namespace, env: context.env };
    },

    /**
     * Read-only report: which source is in effect, how many keys it carries, and whether the
     * cluster projection exists.
     * @param {object} context - Normalized domain context.
     * @returns {object} Report.
     * @memberof UnderpostHost
     */
    status(context = {}) {
      context = domainContextFactory(context);
      const source = UnderpostHost.API.envPath(context.env);
      const present = fs.existsSync(source);
      const projected = shellExec(`kubectl get secret ${UNDERPOST_CONFIG_SECRET} -n ${context.namespace} -o name`, {
        silent: true,
        stdout: true,
        silentOnError: true,
        disableLog: true,
      });
      const report = {
        domain: 'host',
        env: context.env,
        namespace: context.namespace,
        deployId: cronDeployIdResolve() || 'dd-cron',
        source,
        sourcePresent: present,
        keys: present ? Object.keys(UnderpostHost.API.read(context.env)).length : 0,
        clusterSecret: `${projected ?? ''}`.trim() ? UNDERPOST_CONFIG_SECRET : null,
      };
      logger.info('host status', report);
      return report;
    },

    /**
     * Replaces the live projection: deletes the `underpost-config` Secret and re-applies it, so
     * consumers pick up a source that changed underneath them.
     * @param {object} context - Normalized domain context.
     * @returns {object} The re-applied projection.
     * @memberof UnderpostHost
     */
    rotate(context = {}) {
      context = domainContextFactory(context);
      if (context.dryRun) {
        logger.info('[dry-run] host rotate would re-project the Secret', { namespace: context.namespace });
        return { secret: UNDERPOST_CONFIG_SECRET, namespace: context.namespace, env: context.env };
      }
      shellExec(`kubectl delete secret ${UNDERPOST_CONFIG_SECRET} -n ${context.namespace} --ignore-not-found`);
      return UnderpostHost.API.apply(context);
    },

    /**
     * Withdraws the host configuration from the local filesystem by clearing the root env store.
     * Container runtime state lives in its own store and is untouched. `--force` also removes the
     * ephemeral `engine-private` clone.
     * @param {object} context - Normalized domain context.
     * @returns {{keptKeys: Array<string>, removedPrivateRepo: boolean}} What was withdrawn.
     * @memberof UnderpostHost
     */
    clean(context = {}) {
      context = domainContextFactory(context);
      if (context.dryRun) {
        logger.info('[dry-run] host clean would clear the root env store', { force: context.force });
        return { removedPrivateRepo: false };
      }
      Underpost.env.clean();
      if (context.force) Underpost.repo.cleanupPrivateEngineRepo();
      logger.info('Host configuration withdrawn', { removedPrivateRepo: context.force });
      return { removedPrivateRepo: context.force };
    },
  };
}

export default UnderpostHost;
export { isReservedEnvKey, UnderpostHost };
