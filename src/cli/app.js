/**
 * App domain: one application deployment's runtime environment.
 *
 * Its durable source is that deployment's env file under `engine-private/conf/<deployId>/`.
 * The deployment id is resolved from the repository context, never passed as a path, so a
 * caller says `--env development` and gets `.env.development` — or its sub-configuration
 * variant when `--args sub-conf=<name>` names one.
 *
 * Implements the canonical domain action set; see {@link UnderpostDomains.DOMAIN_ACTIONS}.
 * @module src/cli/app.js
 * @namespace UnderpostApp
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';

import { cleanDeployEnvFiles, DEFAULT_DEPLOY_ID, deployEnvFilePath, loadConf } from '../server/runtime/conf.js';
import { domainContextFactory } from './domains.js';
import { loggerFactory } from '../server/ops/logger.js';
import { readDeployRoutes } from '../server/network/router.js';
import { shellExec } from '../server/runtime/process.js';
import { writeEnv } from '../server/runtime/environment.js';
import { isReservedEnvKey } from './host.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/** Name of the Kubernetes Secret a deployment's environment is projected into. */
const appSecretName = (deployId, env) => `${deployId}-${env}-env`;

/**
 * @class UnderpostApp
 * @description Application deployment environment domain.
 * @memberof UnderpostApp
 */
class UnderpostApp {
  static API = {
    /**
     * Resolves the deployment id from the repository/deployment context.
     *
     * Most specific first: an explicit `--args deploy-id=`, the ambient `DEPLOY_ID` a loaded
     * environment exports, the root env store the node was bootstrapped with, then the first
     * routed deploy. Falls back to the default deploy id, so resolution is total.
     * @param {object} [context] - Normalized domain context, or `{ args }`.
     * @returns {string} Deployment id.
     * @memberof UnderpostApp
     */
    deployId(context = {}) {
      const routed = readDeployRoutes();
      return (
        `${context.args?.['deploy-id'] ?? context.deployId ?? ''}`.trim() ||
        `${process.env.DEPLOY_ID || ''}`.trim() ||
        `${Underpost.env.get('DEPLOY_ID', undefined, { disableLog: true }) || ''}`.trim() ||
        (routed.length > 0 ? routed[0] : '') ||
        DEFAULT_DEPLOY_ID
      );
    },

    /**
     * Resolves the durable source for an environment.
     *
     * A named sub-configuration selects `.env.<env>.<subConf>` when that file exists and degrades
     * to the plain `.env.<env>` when it does not — the same precedence
     * {@link ServerConfBuilder.loadConf} applies, so both agree on which file is in effect.
     * @param {object} [context] - Normalized domain context.
     * @returns {string} Path to the deployment env file.
     * @memberof UnderpostApp
     */
    envPath(context = {}) {
      return deployEnvFilePath(
        UnderpostApp.API.deployId(context),
        `${context.env ?? ''}`.trim() || 'production',
        `${context.args?.['sub-conf'] ?? process.env.DEPLOY_SUB_CONF ?? ''}`.trim(),
      );
    },

    /**
     * Parses a deployment's environment. An absent source reads as `{}`.
     * @param {object} [context] - Normalized domain context.
     * @returns {Object<string, string>} Parsed deployment environment.
     * @memberof UnderpostApp
     */
    read(context = {}) {
      const envPath = UnderpostApp.API.envPath(context);
      return fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath, 'utf8')) : {};
    },

    // ── canonical domain actions ────────────────────────────────────────────────────────────

    /**
     * Onboards the app domain: resolves the deployment id, confirms its environment source
     * exists, then loads it. Idempotent.
     * @param {object} context - Normalized domain context.
     * @returns {{deployId: string, source: string, keys: number}} What was onboarded.
     * @memberof UnderpostApp
     */
    setup(context = {}) {
      context = domainContextFactory(context);
      const deployId = UnderpostApp.API.deployId(context);
      const source = UnderpostApp.API.envPath(context);
      if (!fs.existsSync(source)) throw new Error(`[app] deployment environment not found: ${source}`);
      if (context.dryRun) {
        logger.info('[dry-run] app setup would load', { deployId, source });
        return { deployId, source, keys: Object.keys(UnderpostApp.API.read(context)).length };
      }
      const { keys } = UnderpostApp.API.load(context);
      return { deployId, source, keys };
    },

    /**
     * Loads the deployment environment into the underpost root env store.
     *
     * Deterministic: the same environment selector and repository context always resolve the
     * same file, and the store is rebuilt from it rather than merged into.
     * @param {object} context - Normalized domain context.
     * @returns {{source: string, keys: number}} Which file was loaded and how much of it.
     * @memberof UnderpostApp
     */
    load(context = {}) {
      context = domainContextFactory(context);
      const deployId = UnderpostApp.API.deployId(context);
      const envPath = UnderpostApp.API.envPath(context);
      if (!fs.existsSync(envPath)) throw new Error(`[app] deployment environment not found: ${envPath}`);
      const values = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      if (context.dryRun) {
        logger.info('[dry-run] app load would materialize the working tree', {
          deployId,
          source: envPath,
          keys: Object.keys(values).length,
        });
        return { source: envPath, keys: Object.keys(values).length };
      }
      // The working tree is this domain's local runtime: `./.env`, the per-environment copies,
      // `package.json`, and the in-process `Config.default` the server reads. Deliberately NOT
      // the underpost root env store — that store is host-scoped and holds the node's own
      // configuration, so writing a deployment's environment there would erase it.
      process.env.NODE_ENV = context.env;
      loadConf(deployId, `${context.args['sub-conf'] ?? ''}`.trim() || undefined);
      logger.info('Deployment environment loaded', { deployId, source: envPath, keys: Object.keys(values).length });
      return { source: envPath, keys: Object.keys(values).length };
    },

    /**
     * Writes the underpost root env store back into the deployment's durable source.
     * Refuses to overwrite an existing source without `--force`.
     * @param {object} context - Normalized domain context.
     * @returns {{target: string, keys: number}} What was written.
     * @memberof UnderpostApp
     */
    publish(context = {}) {
      context = domainContextFactory(context);
      const target = UnderpostApp.API.envPath(context);
      const values = Underpost.env.list(undefined, undefined, { disableLog: true });
      const keys = Object.keys(values);
      if (keys.length === 0) throw new Error('[app] the root env store is empty; nothing to publish');
      if (fs.existsSync(target) && !context.force)
        throw new Error(`[app] ${target} already exists; re-run with --force to overwrite it`);
      if (context.dryRun) {
        logger.info('[dry-run] app publish would write', { target, keys: keys.length });
        return { target, keys: keys.length };
      }
      writeEnv(target, values);
      logger.info('Deployment environment published', { target, keys: keys.length });
      return { target, keys: keys.length };
    },

    /**
     * Projects the deployment environment into the cluster as its own Secret, so a workload can
     * inject it with `envFrom` alongside the host configuration.
     * Idempotent — delete-then-apply converges on the current source.
     * @param {object} context - Normalized domain context.
     * @returns {{secret: string, namespace: string, env: string}} What was projected.
     * @memberof UnderpostApp
     */
    apply(context = {}) {
      context = domainContextFactory(context);
      const deployId = UnderpostApp.API.deployId(context);
      const envFilePath = UnderpostApp.API.envPath(context);
      if (!fs.existsSync(envFilePath)) throw new Error(`[app] deployment environment not found: ${envFilePath}`);
      const secret = appSecretName(deployId, context.env);
      if (context.dryRun) {
        logger.info('[dry-run] app apply would publish the Secret', {
          secret,
          namespace: context.namespace,
          source: envFilePath,
        });
        return { secret, namespace: context.namespace, env: context.env };
      }
      // The same reserved-key filter the host domain applies: an injected PATH would override
      // the container image's own no matter which Secret carried it.
      const sanitizedEnvPath = `${envFilePath}.secret`;
      fs.writeFileSync(
        sanitizedEnvPath,
        fs
          .readFileSync(envFilePath, 'utf8')
          .split('\n')
          .filter((line) => {
            const trimmed = line.trimStart();
            if (!trimmed || trimmed.startsWith('#')) return true;
            const key = line.slice(0, line.indexOf('=')).trim();
            return !key || !isReservedEnvKey(key);
          })
          .join('\n'),
      );
      try {
        shellExec(`kubectl delete secret ${secret} -n ${context.namespace} --ignore-not-found`);
        shellExec(
          `kubectl create secret generic ${secret} --from-env-file=${sanitizedEnvPath} --dry-run=client -o yaml | kubectl apply -f - -n ${context.namespace}`,
        );
      } finally {
        fs.removeSync(sanitizedEnvPath);
      }
      logger.info('Deployment environment applied', { secret, env: context.env, namespace: context.namespace });
      return { secret, namespace: context.namespace, env: context.env };
    },

    /**
     * Read-only report: the resolved deployment id, which source is in effect, and whether the
     * cluster projection exists.
     * @param {object} context - Normalized domain context.
     * @returns {object} Report.
     * @memberof UnderpostApp
     */
    status(context = {}) {
      context = domainContextFactory(context);
      const deployId = UnderpostApp.API.deployId(context);
      const source = UnderpostApp.API.envPath(context);
      const present = fs.existsSync(source);
      const secret = appSecretName(deployId, context.env);
      const projected = shellExec(`kubectl get secret ${secret} -n ${context.namespace} -o name`, {
        silent: true,
        stdout: true,
        silentOnError: true,
        disableLog: true,
      });
      const report = {
        domain: 'app',
        env: context.env,
        namespace: context.namespace,
        deployId,
        source,
        sourcePresent: present,
        keys: present ? Object.keys(UnderpostApp.API.read(context)).length : 0,
        clusterSecret: `${projected ?? ''}`.trim() ? secret : null,
      };
      logger.info('app status', report);
      return report;
    },

    /**
     * Replaces the live projection: deletes the deployment's Secret and re-applies it.
     * @param {object} context - Normalized domain context.
     * @returns {object} The re-applied projection.
     * @memberof UnderpostApp
     */
    rotate(context = {}) {
      context = domainContextFactory(context);
      const secret = appSecretName(UnderpostApp.API.deployId(context), context.env);
      if (context.dryRun) {
        logger.info('[dry-run] app rotate would re-project the Secret', { secret, namespace: context.namespace });
        return { secret, namespace: context.namespace, env: context.env };
      }
      shellExec(`kubectl delete secret ${secret} -n ${context.namespace} --ignore-not-found`);
      return UnderpostApp.API.apply(context);
    },

    /**
     * Withdraws the deployment environment from the local filesystem: removes the working-tree
     * `.env*` files `loadConf` materializes. `--force` also drops the deployment's cluster Secret.
     * @param {object} context - Normalized domain context.
     * @returns {{removed: Array<string>, removedSecret: string|null}} What was withdrawn.
     * @memberof UnderpostApp
     */
    clean(context = {}) {
      context = domainContextFactory(context);
      const secret = context.force ? appSecretName(UnderpostApp.API.deployId(context), context.env) : null;
      if (context.dryRun) {
        logger.info('[dry-run] app clean would remove the working-tree env files', { secret });
        return { removed: [], removedSecret: secret };
      }
      const removed = cleanDeployEnvFiles();
      if (secret) shellExec(`kubectl delete secret ${secret} -n ${context.namespace} --ignore-not-found`);
      logger.info('Deployment environment withdrawn', { files: removed, secret });
      return { removed, removedSecret: secret };
    },
  };
}

export default UnderpostApp;
export { appSecretName, UnderpostApp };
