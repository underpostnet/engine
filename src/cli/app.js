/**
 * App domain: one application deployment's runtime environment.
 *
 * Its durable source is that deployment's env file under `engine-private/conf/<deployId>/`.
 * The deployment id is resolved from the repository context, never passed as a path, so a
 * caller says `--env development` and gets `.env.development` — or its sub-configuration
 * variant when `--args sub-conf=<name>` names one.
 *
 * A custom instance is a deployment too: `--args instance-id=<id>` addresses that instance's own
 * `instances/<id>/env/<env>.env` and its own `<deployId>-<instanceId>-<env>-env` Secret, so an
 * instance's runtime environment is managed through this domain rather than by reaching into the
 * private conf tree by hand.
 *
 * Implements the canonical domain action set; see {@link UnderpostDomains.DOMAIN_ACTIONS}.
 * @module src/cli/app.js
 * @namespace UnderpostApp
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';

import {
  cleanDeployEnvFiles,
  DEFAULT_DEPLOY_ID,
  deployEnvContentFactory,
  deployEnvFilePath,
  deployOciEnvFilePath,
  instanceEnvFilePath,
  loadConf,
} from '../server/runtime/conf.js';
import { domainContextFactory } from './domains.js';
import { loggerFactory } from '../server/ops/logger.js';
import { readDeployRoutes } from '../server/network/router.js';
import { shellExec } from '../server/runtime/process.js';
import { writeEnv } from '../server/runtime/environment.js';
import { isReservedEnvKey } from './host.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * Name of the Kubernetes Secret a deployment's environment is projected into. An instance carries
 * its own, under the `<deployId>-<instanceId>` prefix every other instance object already uses.
 */
const appSecretName = (deployId, env, instanceId = '') =>
  `${instanceId ? `${deployId}-${instanceId}` : deployId}-${env}-env`;

// This domain's local runtime: the working-tree file `loadConf` materializes and the server
// reads. `publish` is the inverse of `load`, so both ends name the same file.
const LOCAL_RUNTIME_ENV_PATH = './.env';

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
     * environment exports, the host store the node was bootstrapped with, then the first routed
     * deploy. Falls back to the default deploy id, so resolution is total.
     * @param {object} [context] - Normalized domain context, or `{ args }`.
     * @returns {string} Deployment id.
     * @memberof UnderpostApp
     */
    deployId(context = {}) {
      const routed = readDeployRoutes();
      return (
        `${context.args?.['deploy-id'] ?? context.deployId ?? ''}`.trim() ||
        `${process.env.DEPLOY_ID || ''}`.trim() ||
        `${Underpost.host.store.get('DEPLOY_ID', undefined, { disableLog: true }) || ''}`.trim() ||
        (routed.length > 0 ? routed[0] : '') ||
        DEFAULT_DEPLOY_ID
      );
    },

    /**
     * Resolves the custom instance this invocation addresses, if any.
     * @param {object} [context] - Normalized domain context, or `{ args }`.
     * @returns {string} Instance id, or the empty string for the deployment itself.
     * @memberof UnderpostApp
     */
    instanceId(context = {}) {
      return `${context.args?.['instance-id'] ?? context.instanceId ?? ''}`.trim();
    },

    /**
     * Resolves the durable source for an environment.
     *
     * `--args instance-id=` selects that instance's own env file. Otherwise a named
     * sub-configuration selects `.env.<env>.<subConf>` when that file exists and degrades
     * to the plain `.env.<env>` when it does not — the same precedence
     * {@link ServerConfBuilder.loadConf} applies, so both agree on which file is in effect.
     * @param {object} [context] - Normalized domain context.
     * @returns {string} Path to the deployment or instance env file.
     * @memberof UnderpostApp
     */
    envPath(context = {}) {
      const env = `${context.env ?? ''}`.trim() || 'production';
      const instanceId = UnderpostApp.API.instanceId(context);
      if (instanceId) return instanceEnvFilePath(UnderpostApp.API.deployId(context), instanceId, env);
      return deployEnvFilePath(
        UnderpostApp.API.deployId(context),
        env,
        `${context.args?.['sub-conf'] ?? process.env.DEPLOY_SUB_CONF ?? ''}`.trim(),
      );
    },

    /**
     * Resolves the environment for a container runtime: the durable source with its
     * `.env.<env>.oci` overlay applied. Used wherever the consumer is a container image rather
     * than this host — the cluster Secret projection above all.
     * @param {object} [context] - Normalized domain context.
     * @returns {{source: string, overlay: string|null, content: string, values: Object<string,string>}}
     *   The resolved environment.
     * @memberof UnderpostApp
     */
    ociEnv(context = {}) {
      // An instance env file is already the container's environment — `instance-build-manifest`
      // derives it for that runtime — so there is no host/container split to overlay away.
      const source = UnderpostApp.API.envPath(context);
      if (UnderpostApp.API.instanceId(context))
        return {
          source,
          overlay: null,
          content: fs.existsSync(source) ? fs.readFileSync(source, 'utf8') : '',
          values: UnderpostApp.API.read(context),
        };
      return deployEnvContentFactory(
        UnderpostApp.API.deployId(context),
        `${context.env ?? ''}`.trim() || 'production',
        `${context.args?.['sub-conf'] ?? process.env.DEPLOY_SUB_CONF ?? ''}`.trim(),
        { oci: true },
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
     * Materializes the deployment environment into this domain's local runtime: the working-tree
     * `./.env` copies and the in-process `Config.default` the server reads.
     *
     * Deterministic: the same environment selector and repository context always resolve the
     * same file, and the working tree is rebuilt from it rather than merged into.
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
      // Deliberately not the host configuration store: that store is host-scoped and holds the node's
      // own configuration, so writing a deployment's environment there would erase it.
      process.env.NODE_ENV = context.env;
      const instanceId = UnderpostApp.API.instanceId(context);
      // `loadConf` materializes a deployment's working tree from its own conf; an instance has no
      // conf of its own, so its file is the local runtime env directly.
      if (instanceId) writeEnv(LOCAL_RUNTIME_ENV_PATH, values);
      else loadConf(deployId, `${context.args['sub-conf'] ?? ''}`.trim() || undefined);
      // The resolution loadConf performed, not `ociEnv()`, which forces the overlay on: a
      // skipped overlay and an applied one were indistinguishable in the pod log.
      const resolved = deployEnvContentFactory(deployId, context.env, `${context.args?.['sub-conf'] ?? ''}`.trim());
      logger.info('Deployment environment loaded', {
        deployId,
        instanceId: instanceId || null,
        source: envPath,
        inContainer: Underpost.state.isInsideContainer(),
        ociOverlay: resolved.overlay,
        keys: Object.keys(values).length,
      });
      return { source: envPath, keys: Object.keys(values).length };
    },

    /**
     * Writes this domain's local runtime back into the deployment's durable source.
     *
     * The exact inverse of `load`, so it reads the working-tree `./.env` that `load` materialized
     * — never the host configuration store, which belongs to the host domain and carries the node's
     * configuration rather than this deployment's.
     * Refuses to overwrite an existing source without `--force`.
     * @param {object} context - Normalized domain context.
     * @returns {{target: string, keys: number}} What was written.
     * @memberof UnderpostApp
     */
    publish(context = {}) {
      context = domainContextFactory(context);
      const target = UnderpostApp.API.envPath(context);
      const source = LOCAL_RUNTIME_ENV_PATH;
      if (!fs.existsSync(source))
        throw new Error(`[app] ${source} not found; run \`underpost app load\` before publishing`);
      const values = dotenv.parse(fs.readFileSync(source, 'utf8'));
      const keys = Object.keys(values);
      if (keys.length === 0) throw new Error(`[app] ${source} is empty; nothing to publish`);
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
      const secret = appSecretName(deployId, context.env, UnderpostApp.API.instanceId(context));
      // This Secret is consumed only by container workloads, so the OCI overlay is applied
      // unconditionally here — the host projecting it is not the runtime that reads it.
      const { overlay, content } = UnderpostApp.API.ociEnv(context);
      if (context.dryRun) {
        logger.info('[dry-run] app apply would publish the Secret', {
          secret,
          namespace: context.namespace,
          source: envFilePath,
          overlay,
        });
        return { secret, namespace: context.namespace, env: context.env, overlay };
      }
      // The same reserved-key filter the host domain applies: an injected PATH would override
      // the container image's own no matter which Secret carried it.
      const sanitizedEnvPath = `${envFilePath}.secret`;
      fs.writeFileSync(
        sanitizedEnvPath,
        content
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
      logger.info('Deployment environment applied', {
        secret,
        env: context.env,
        namespace: context.namespace,
        overlay,
      });
      return { secret, namespace: context.namespace, env: context.env, overlay };
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
      const secret = appSecretName(deployId, context.env, UnderpostApp.API.instanceId(context));
      const projected = shellExec(`kubectl get secret ${secret} -n ${context.namespace} -o name`, {
        silent: true,
        stdout: true,
        silentOnError: true,
        disableLog: true,
      });
      const instanceId = UnderpostApp.API.instanceId(context);
      const ociOverlay = instanceId ? '' : deployOciEnvFilePath(deployId, context.env);
      const report = {
        domain: 'app',
        env: context.env,
        namespace: context.namespace,
        deployId,
        instanceId: instanceId || null,
        source,
        sourcePresent: present,
        ociOverlay: ociOverlay && fs.existsSync(ociOverlay) ? ociOverlay : null,
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
      const secret = appSecretName(
        UnderpostApp.API.deployId(context),
        context.env,
        UnderpostApp.API.instanceId(context),
      );
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
      const secret = context.force
        ? appSecretName(UnderpostApp.API.deployId(context), context.env, UnderpostApp.API.instanceId(context))
        : null;
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
