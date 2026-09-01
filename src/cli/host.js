/**
 * Host domain: the complete node-level operational environment.
 *
 * Its durable source is the cron deploy's env file — SSH, registry, DNS, mail, cluster and
 * deployment settings — resolved through `engine-private/deploy/dd.cron`, the same id the cron
 * jobs run against, so this is the one configuration the whole cluster shares. Its local runtime
 * is {@link UnderpostHost.API.store}, the host configuration store this domain owns end to end.
 *
 * Implements the canonical domain action set; see {@link UnderpostDomains.DOMAIN_ACTIONS}.
 * @module src/cli/host.js
 * @namespace UnderpostHost
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';

import nodePath from 'node:path';

import {
  CONFIG_SCOPES,
  classifyConfigKeys,
  configOwnershipFactory,
  configRejectionFactory,
} from '../server/runtime/config-scope.js';
import { cronDeployIdResolve } from '../server/ops/cron.js';
import { domainContextFactory } from './domains.js';
import { dotenvStoreFactory } from './dotenv-store.js';
import { getUnderpostRootPath, writeEnv } from '../server/runtime/environment.js';
import { loggerFactory } from '../server/ops/logger.js';
import { shellExec } from '../server/runtime/process.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

const UNDERPOST_CONFIG_SECRET = 'underpost-config';
const DEFAULT_CRON_DEPLOY_ID = 'dd-cron';
const SCOPES_DIR = './engine-private/deploy/scopes';

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
 * Whether a key must be kept out of a published Secret and out of the host configuration store.
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
     * The host configuration store: a single host-scoped dotenv file next to the global installation,
     * holding this node's resolved configuration.
     *
     * This domain's local runtime, so it lives here rather than in a module of its own: `load`
     * rebuilds it from the durable source, `publish` reads it back out, `clean` withdraws it.
     * Key-level access is `underpost host get|set|delete|list`, registered from
     * {@link UnderpostDomains.DOMAIN_STORE_OPERATORS} — a different interaction shape than the
     * canonical seven actions and deliberately outside them, but the same domain.
     *
     * Container runtime status is a different concern with a different lifetime — see
     * {@link UnderpostState}.
     * @type {ReturnType<typeof dotenvStoreFactory>}
     * @memberof UnderpostHost
     */
    store: dotenvStoreFactory({
      path: () => `${getUnderpostRootPath()}/.env`,
      label: 'host configuration',
    }),

    // ── key-level store operators ───────────────────────────────────────────────────────────
    // Delegates rather than aliases, so the command surface addresses this domain and never the
    // store object directly. Container status is not among them: that key belongs to the state
    // store, whose owner and lifetime are different — see {@link UnderpostState}.

    /**
     * Reads one host configuration key.
     * @param {string} key - Key to read.
     * @param {*} [value] - Unused; keeps the operator arity uniform.
     * @param {object} [options] - `--plain`, `--copy`, `disableLog`.
     * @returns {string|undefined} Stored value.
     * @memberof UnderpostHost
     */
    get(key, value, options = {}) {
      return UnderpostHost.API.store.get(key, value, options);
    },

    /**
     * Writes one host configuration key.
     * @param {string} key - Key to write.
     * @param {string} value - Value to write.
     * @memberof UnderpostHost
     */
    set(key, value) {
      return UnderpostHost.API.store.set(key, value);
    },

    /**
     * Removes one host configuration key.
     * @param {string} key - Key to remove.
     * @memberof UnderpostHost
     */
    delete(key) {
      return UnderpostHost.API.store.delete(key);
    },

    /**
     * Lists the host configuration store, optionally narrowed by `--filter`.
     * @param {*} [key] - Unused; keeps the operator arity uniform.
     * @param {*} [value] - Unused; keeps the operator arity uniform.
     * @param {object} [options] - `--filter`, `disableLog`.
     * @returns {Object<string, string>} Stored values.
     * @memberof UnderpostHost
     */
    list(key, value, options = {}) {
      return UnderpostHost.API.store.list(key, value, options);
    },

    /**
     * Resolves the durable source for an environment.
     * @param {string} [env='production'] - Environment selector.
     * @returns {string} Path to the cron deploy's `.env.<env>`.
     * @memberof UnderpostHost
     */
    envPath(env = 'production') {
      return `./engine-private/conf/${cronDeployIdResolve() || DEFAULT_CRON_DEPLOY_ID}/.env.${env || 'production'}`;
    },

    /**
     * The scoped durable sources present for an environment.
     * @param {string} [env='production'] - Environment selector.
     * @returns {Array<{scope: string, path: string}>} Sources that exist, in scope-table order.
     * @memberof UnderpostHost
     */
    scopedSources(env = 'production') {
      return Object.keys(CONFIG_SCOPES)
        .map((scope) => ({ scope, path: UnderpostHost.API.scopePath(scope, env) }))
        .filter(({ path }) => fs.existsSync(path));
    },

    /**
     * Parses the host configuration. An absent source reads as `{}` so callers can probe
     * without branching on existence.
     * @param {string} [env='production'] - Environment selector.
     * @returns {Object<string, string>} Parsed host configuration.
     * @memberof UnderpostHost
     */
    read(env = 'production') {
      // The scoped sources are authoritative once they exist. The unsplit file is read only until
      // `setup` has split and verified it, and is retired at that point — a durable source that
      // outlives its replacement is a second answer to the same question.
      const scoped = UnderpostHost.API.scopedSources(env);
      if (scoped.length > 0)
        return scoped.reduce((values, { path }) => ({ ...values, ...dotenv.parse(fs.readFileSync(path, 'utf8')) }), {});
      const envPath = UnderpostHost.API.envPath(env);
      return fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath, 'utf8')) : {};
    },

    /**
     * Where this environment's configuration is actually read from, for diagnostics.
     * @param {string} [env='production'] - Environment selector.
     * @returns {string} Scopes directory once split, else the unsplit source.
     * @memberof UnderpostHost
     */
    sourceLabel(env = 'production') {
      const scoped = UnderpostHost.API.scopedSources(env);
      return scoped.length > 0 ? `${SCOPES_DIR}/*.env.${env || 'production'}` : UnderpostHost.API.envPath(env);
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
        envPath: UnderpostHost.API.sourceLabel(env),
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

    /**
     * Where a configuration scope's durable source lives.
     *
     * Beside the deploy markers rather than inside a deployment's conf: these are the node's
     * concerns, not any one deployment's, and the deployment that happens to carry them today is
     * an accident of history the split exists to end.
     * @param {string} scope - Scope name.
     * @param {string} [env='production'] - Environment selector.
     * @returns {string} Path to that scope's env file.
     * @memberof UnderpostHost
     */
    scopePath(scope, env = 'production') {
      return `${SCOPES_DIR}/${scope}.env.${env || 'production'}`;
    },

    /**
     * Splits the host domain's durable source into one file per owning scope.
     *
     * Additive and idempotent: it writes the scoped sources and reports what it found, and never
     * removes the source it read. The legacy file stays authoritative until an operator has
     * compared the two — a migration that deletes the only copy of a fleet's credentials on the
     * strength of a regex is not a migration worth having.
     *
     * Fails closed on a key no scope claims. Guessing an owner is how a provisioning credential
     * ends up in a workload projection, which is the exposure this split exists to close.
     * @param {object} context - Normalized domain context.
     * @returns {{source: string, scopes: Object<string, number>, written: string[]}} What was split.
     * @memberof UnderpostHost
     */
    /**
     * Writes an environment into the scoped durable sources, one file per owning scope.
     *
     * Fails closed on a key no scope claims: guessing an owner is how a provisioning credential
     * ends up in a workload projection, which is the exposure the split exists to close.
     * @param {Object<string, string>} values - Environment to distribute.
     * @param {object} [context] - Normalized domain context.
     * @returns {string[]} Paths written.
     * @memberof UnderpostHost
     */
    writeScopes(values, context = {}) {
      const env = context.env || 'production';
      const { scopes, unclassified } = classifyConfigKeys(values);
      if (unclassified.length > 0)
        throw new Error(
          `[host] ${unclassified.length} key(s) belong to no scope, so their exposure cannot be decided:\n` +
            unclassified
              .map((key) =>
                configRejectionFactory({
                  domain: 'host',
                  deployId: cronDeployIdResolve() || DEFAULT_CRON_DEPLOY_ID,
                  env,
                  key,
                  reason: 'no ownership rule matches; declare it in CONFIG_OWNERSHIP',
                }),
              )
              .join('\n'),
        );

      const written = [];
      for (const [scope, keys] of Object.entries(scopes)) {
        if (keys.length === 0) continue;
        const target = UnderpostHost.API.scopePath(scope, env);
        written.push(target);
        if (context.dryRun) continue;
        fs.mkdirpSync(nodePath.dirname(target));
        writeEnv(target, Object.fromEntries(keys.map((key) => [key, values[key]])));
        fs.chmodSync(target, 0o600);
      }
      return written;
    },

    split(context = {}) {
      context = domainContextFactory(context);
      const env = context.env || 'production';
      const source = UnderpostHost.API.envPath(env);
      if (!fs.existsSync(source)) {
        // Retired, which is the finished state of this migration rather than a fault. Rerunning
        // `setup` on a migrated node has nothing to split, and must not read that as a broken one.
        const scoped = UnderpostHost.API.scopedSources(env);
        if (scoped.length === 0) throw new Error(`[host] configuration source not found: ${source}`);
        logger.info('Host configuration already split by scope', { env, scopes: scoped.length });
        return { source, scopes: {}, written: [] };
      }

      const values = dotenv.parse(fs.readFileSync(source, 'utf8'));
      const written = UnderpostHost.API.writeScopes(values, { ...context, env });
      const counts = Object.fromEntries(
        Object.entries(classifyConfigKeys(values).scopes).map(([scope, keys]) => [scope, keys.length]),
      );

      logger.info(
        context.dryRun ? '[dry-run] host configuration would be split by scope' : 'Host configuration split',
        { source, env, scopes: counts, written: written.length },
      );
      return { source, scopes: counts, written };
    },

    /**
     * Confirms a split is complete: every key of the durable source is present, once, in exactly
     * the scope that owns it. Run before an operator retires the unsplit source.
     * @param {object} context - Normalized domain context.
     * @returns {{ok: boolean, source: string, missing: string[], misplaced: string[]}} Verdict.
     * @memberof UnderpostHost
     */
    verifySplit(context = {}) {
      context = domainContextFactory(context);
      const env = context.env || 'production';
      const source = UnderpostHost.API.envPath(env);
      if (!fs.existsSync(source)) return { ok: true, source, missing: [], misplaced: [] };

      const values = dotenv.parse(fs.readFileSync(source, 'utf8'));
      const missing = [];
      const misplaced = [];
      for (const key of Object.keys(values)) {
        const ownership = configOwnershipFactory(key);
        if (!ownership) {
          missing.push(key);
          continue;
        }
        const target = UnderpostHost.API.scopePath(ownership.owner, env);
        const split = fs.existsSync(target) ? dotenv.parse(fs.readFileSync(target, 'utf8')) : {};
        if (split[key] === undefined) missing.push(key);
        else if (split[key] !== values[key]) misplaced.push(key);
      }

      const ok = missing.length === 0 && misplaced.length === 0;
      logger[ok ? 'info' : 'error']('Host configuration split verification', {
        source,
        env,
        keys: Object.keys(values).length,
        missing: missing.length,
        misplaced: misplaced.length,
        ...(ok ? {} : { keysMissing: missing, keysMisplaced: misplaced }),
      });
      if (!ok) process.exitCode = 1;
      return { ok, source, missing, misplaced };
    },

    /**
     * Whether this environment still has an unsplit source beside its scoped ones.
     * @param {string} [env='production'] - Environment selector.
     * @returns {boolean} True while both layouts exist.
     * @memberof UnderpostHost
     */
    hasDualSource(env = 'production') {
      return UnderpostHost.API.scopedSources(env).length > 0 && fs.existsSync(UnderpostHost.API.envPath(env));
    },

    /**
     * Removes the unsplit source once the scoped ones fully account for it.
     *
     * The gate is {@link UnderpostHost.verifySplit}, not the presence of the scope files: a split
     * that dropped or altered a key would otherwise retire the only copy of it. Idempotent — an
     * already-retired source is nothing to do, not an error.
     * @param {object} context - Normalized domain context.
     * @returns {{retired: boolean, source: string, reason: string}} What happened, and why.
     * @memberof UnderpostHost
     */
    retireLegacySource(context = {}) {
      context = domainContextFactory(context);
      const source = UnderpostHost.API.envPath(context.env);
      if (!fs.existsSync(source)) return { retired: false, source, reason: 'already retired' };

      const { ok, missing, misplaced } = UnderpostHost.API.verifySplit(context);
      if (!ok) {
        process.exitCode = 0;
        logger.warn('Unsplit host source kept: the scoped sources do not account for it', {
          source,
          missing: missing.length,
          misplaced: misplaced.length,
        });
        return { retired: false, source, reason: 'verification failed' };
      }
      if (context.dryRun) {
        logger.info('[dry-run] unsplit host source would be retired', { source });
        return { retired: false, source, reason: 'dry-run' };
      }
      fs.removeSync(source);
      logger.info('Unsplit host source retired; the scoped sources are authoritative', { source });
      return { retired: true, source, reason: 'verified' };
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
      const deployId = cronDeployIdResolve() || DEFAULT_CRON_DEPLOY_ID;
      const source = UnderpostHost.API.sourceLabel(context.env);
      if (Object.keys(UnderpostHost.API.read(context.env)).length === 0)
        throw new Error(`[host] configuration source not found: ${source}`);
      if (context.dryRun) {
        logger.info('[dry-run] host setup would load', { deployId, source });
        return { deployId, source, keys: Object.keys(UnderpostHost.API.read(context.env)).length };
      }
      const { keys } = UnderpostHost.API.load(context);
      // The scoped sources are what this domain provisions: they are what lets a projection hand a
      // workload its own scope instead of the whole node environment. Split, verify, then retire —
      // the unsplit file is removed only once every key of it is proven present and equal under its
      // owner, so a failed classification leaves the original in place.
      const split = UnderpostHost.API.split(context);
      const retired = UnderpostHost.API.retireLegacySource(context);
      return { deployId, source, keys, scopes: split.scopes, retired };
    },

    /**
     * Loads the host configuration into the host configuration store.
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
      const onDisk = UnderpostHost.API.read(context.env);
      const fromFile = Object.keys(onDisk).length > 0;
      const values = fromFile
        ? onDisk
        : Object.fromEntries(Object.entries(process.env).filter(([key]) => !isReservedEnvKey(key)));
      const source = fromFile ? UnderpostHost.API.sourceLabel(context.env) : 'container-env';
      if (context.dryRun) {
        logger.info('[dry-run] host load would replace the host configuration store', {
          source,
          keys: Object.keys(values).length,
        });
        return { source, keys: Object.keys(values).length };
      }
      UnderpostHost.API.store.clean();
      for (const [key, value] of Object.entries(values)) UnderpostHost.API.store.set(key, value);
      logger.info('Host configuration loaded', { source, keys: Object.keys(values).length });
      return { source, keys: Object.keys(values).length };
    },

    /**
     * Writes the host configuration store back into the durable host configuration source.
     *
     * The inverse of `load`. Writes each key into the scope that owns it — there is no file that
     * takes all of them — so this can never recreate the legacy unsplit source, migrated away from
     * in {@link UnderpostHost.retireLegacySource}. `--force` still governs overwriting an existing
     * scoped source, the same guarantee the single-file version made per file.
     * @param {object} context - Normalized domain context.
     * @returns {{target: string, keys: number}} What was written.
     * @memberof UnderpostHost
     */
    publish(context = {}) {
      context = domainContextFactory(context);
      const env = context.env || 'production';
      const values = UnderpostHost.API.store.list(undefined, undefined, { disableLog: true });
      const keys = Object.keys(values);
      if (keys.length === 0) throw new Error('[host] the host configuration store is empty; nothing to publish');
      if (!context.force) {
        const existing = UnderpostHost.API.scopedSources(env).map(({ path }) => path);
        if (existing.length > 0)
          throw new Error(`[host] ${existing.join(', ')} already exist; re-run with --force to overwrite them`);
      }
      const written = UnderpostHost.API.writeScopes(values, { ...context, env });
      const target = UnderpostHost.API.sourceLabel(env);
      logger.info(context.dryRun ? '[dry-run] host publish would write' : 'Host configuration published', {
        target,
        keys: keys.length,
        scopes: written.length,
      });
      return { target, keys: keys.length };
    },

    /**
     * Projects the host configuration into the cluster as the `underpost-config` Secret that
     * workloads inject with `envFrom`.
     *
     * Applying it before a deploy is what makes the pod resolve the requested `NODE_ENV`: the
     * container reads it back through `load`, so a stale Secret means a stale environment.
     * Idempotent — delete-then-apply converges on the current source.
     *
     * Reads through {@link UnderpostHost.read}, the one composition of the durable source: scoped
     * files where the migration has run, the legacy file otherwise. Staged on tmpfs rather than
     * beside the source, because the source is no longer necessarily one file to stage beside.
     * @param {object} context - Normalized domain context.
     * @returns {{secret: string, namespace: string, env: string}} What was projected.
     * @memberof UnderpostHost
     */
    apply(context = {}) {
      context = domainContextFactory(context);
      const source = UnderpostHost.API.sourceLabel(context.env);
      const values = UnderpostHost.API.read(context.env);
      if (Object.keys(values).length === 0) throw new Error(`[host] configuration source not found: ${source}`);
      if (context.dryRun) {
        logger.info('[dry-run] host apply would publish the Secret', {
          secret: UNDERPOST_CONFIG_SECRET,
          namespace: context.namespace,
          source,
        });
        return { secret: UNDERPOST_CONFIG_SECRET, namespace: context.namespace, env: context.env };
      }
      // `--from-env-file` turns every KEY=VALUE into a secret key the Deployment injects via
      // `envFrom`, so reserved keys are filtered before the file is handed to kubectl.
      const sanitized = Object.fromEntries(Object.entries(values).filter(([key]) => !isReservedEnvKey(key)));
      const stageDir = '/dev/shm/underpost-host-apply';
      fs.mkdirpSync(stageDir, { mode: 0o700 });
      fs.chmodSync(stageDir, 0o700);
      const sanitizedEnvPath = `${stageDir}/${context.namespace}.env`;
      writeEnv(sanitizedEnvPath, sanitized);
      fs.chmodSync(sanitizedEnvPath, 0o600);
      try {
        shellExec(`kubectl delete secret ${UNDERPOST_CONFIG_SECRET} -n ${context.namespace} --ignore-not-found`);
        shellExec(
          `kubectl create secret generic ${UNDERPOST_CONFIG_SECRET} --from-env-file=${sanitizedEnvPath} --dry-run=client -o yaml | kubectl apply -f - -n ${context.namespace}`,
        );
      } finally {
        fs.removeSync(sanitizedEnvPath);
      }
      logger.info('Host configuration applied', { env: context.env, namespace: context.namespace, source });
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
      const source = UnderpostHost.API.sourceLabel(context.env);
      const keys = Object.keys(UnderpostHost.API.read(context.env)).length;
      const legacyPresent = fs.existsSync(UnderpostHost.API.envPath(context.env));
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
        sourcePresent: keys > 0,
        keys,
        dualSource: UnderpostHost.API.hasDualSource(context.env),
        clusterSecret: `${projected ?? ''}`.trim() ? UNDERPOST_CONFIG_SECRET : null,
      };
      logger.info('host status', report);
      if (legacyPresent) UnderpostHost.API.verifySplit(context);
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
     * Withdraws the host configuration from the local filesystem by clearing the host configuration store.
     * Container runtime state lives in its own store and is untouched. `--force` also removes the
     * ephemeral `engine-private` clone.
     * @param {object} context - Normalized domain context.
     * @returns {{keptKeys: Array<string>, removedPrivateRepo: boolean}} What was withdrawn.
     * @memberof UnderpostHost
     */
    clean(context = {}) {
      context = domainContextFactory(context);
      if (context.dryRun) {
        logger.info('[dry-run] host clean would clear the host configuration store', { force: context.force });
        return { removedPrivateRepo: false };
      }
      UnderpostHost.API.store.clean();
      if (context.force) Underpost.repo.cleanupPrivateEngineRepo();
      logger.info('Host configuration withdrawn', { removedPrivateRepo: context.force });
      return { removedPrivateRepo: context.force };
    },
  };
}

export default UnderpostHost;
export { isReservedEnvKey, UnderpostHost };
