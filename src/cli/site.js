/**
 * Site domain: websites in the configuration of a deployment — clients, host/path routes, and the
 * existing APIs and components they use.
 *
 * Every operation resolves and validates its whole scope, plans each file change, prints the plan,
 * and applies it as one change set. `--dry-run` stops after the plan. After an applied change set,
 * the default configuration of each changed deployment is regenerated. Kubernetes deployment, DNS
 * and certificates belong to other domains.
 * @module src/cli/site.js
 * @namespace UnderpostSite
 */

import fs from 'fs-extra';
import { DefaultConf } from '../../underpost.config.js';
import { getCapVariableName } from '../client/components/core/CommonJs.js';
import { readDeployRoutes } from '../server/network/router.js';
import { loggerFactory } from '../server/ops/logger.js';
import { clientRoutesPlan, cloneClientPlan } from '../server/site/site-clients.js';
import {
  componentIdFactory,
  confDraftFactory,
  deployConfFolder,
  siteDeployIdFactory,
  siteHostFactory,
  siteIdFactory,
  sitePathFactory,
  siteRouteFactory,
} from '../server/site/site-conf.js';
import { apiRegistrationPlan, componentRegistrationPlan } from '../server/site/site-registrations.js';
import {
  cloneRoutePlan,
  dbNameEnvChanges,
  redirectEntryFactory,
  routeEntryFactory,
  setSiteRoute,
} from '../server/site/site-routes.js';
import { applyChangeSet } from '../server/storage/file-change-set.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

const deploySource = (deployId) => {
  const folder = deployConfFolder(deployId);
  const read = (type) =>
    fs.existsSync(`${folder}/conf.${type}.json`) ? fs.readJsonSync(`${folder}/conf.${type}.json`) : {};
  return { server: read('server'), client: read('client'), ssr: read('ssr') };
};

const templateSource = () =>
  structuredClone({ server: DefaultConf.server, client: DefaultConf.client, ssr: DefaultConf.ssr });

const sourceClient = (source, clientId, origin) => {
  if (!source.client[clientId]) throw new Error(`Client "${clientId}" not found in ${origin}`);
  return { clientId, client: source.client[clientId], ssr: source.ssr[getCapVariableName(clientId)] };
};

/**
 * @class UnderpostSite
 * @description Site provisioning operations.
 * @memberof UnderpostSite
 */
class UnderpostSite {
  static API = {
    /**
     * Prints a change plan and applies it, then regenerates the default configuration of each
     * deployment it changed.
     * @param {object} params
     * @param {string} params.operation - Operation name, for the log.
     * @param {Array<object>} params.changes - The change set.
     * @param {string[]} params.deployIds - Deployments the change set touches.
     * @param {boolean} [params.dryRun] - Prints the plan only.
     * @returns {{applied: boolean, plan: Array<object>}} The result.
     * @memberof UnderpostSite
     */
    applyPlan({ operation, changes, deployIds, dryRun = false }) {
      const { applied, plan } = applyChangeSet(changes, { dryRun });
      for (const { action, path, summary } of plan)
        logger.info(`${operation} ${action}`, summary ? `${path} (${summary})` : path);
      if (applied) for (const deployId of deployIds) Underpost.repo.updateDefaultConf({ deployId });
      const pending = plan.filter(({ action }) => action !== 'unchanged').length;
      logger.info(`${operation} ${applied ? 'applied' : pending ? 'planned' : 'unchanged'}`, { files: pending });
      return { applied, plan };
    },

    /**
     * Creates a site: a client cloned from a template or a deployment, a primary `www.<host>` route
     * that serves it, and a `<host>` route that redirects to the primary.
     * @param {string} host - Site hostname, with or without `www.`.
     * @param {object} options
     * @param {string} options.client - Id of the new client.
     * @param {string} options.deployId - Deployment the site is created in.
     * @param {string} [options.path='/'] - Route path.
     * @param {string} [options.from='default'] - Source client.
     * @param {string} [options.fromDeployId] - Deployment of the source client; the default template otherwise.
     * @param {boolean} [options.replace] - Replaces different entries at the two routes.
     * @param {boolean} [options.dryRun] - Prints the plan only.
     * @returns {{applied: boolean, plan: Array<object>}} The result.
     * @memberof UnderpostSite
     */
    create(host, options = {}) {
      const base = siteHostFactory(host).replace(/^www\./, '');
      const primary = `www.${base}`;
      const path = sitePathFactory(options.path);
      const deployId = siteDeployIdFactory(options.deployId);
      const clientId = siteIdFactory(options.client, 'client id');
      const fromId = siteIdFactory(options.from || 'default', 'source client id');
      const origin = options.fromDeployId ? siteDeployIdFactory(options.fromDeployId) : 'the default template';
      const source = options.fromDeployId ? deploySource(origin) : templateSource();
      const from = sourceClient(source, fromId, origin);
      const sourceRoute = Object.values(source.server)
        .flatMap((routes) => Object.values(routes))
        .find((route) => route.client === fromId);
      if (!sourceRoute) throw new Error(`No route serves client "${fromId}" in ${origin}`);

      const draft = confDraftFactory();
      const sources = cloneClientPlan({ draft, from, to: { clientId, deployId } });
      const entry = routeEntryFactory(sourceRoute, clientId);
      setSiteRoute({ draft, deployId, host: primary, path, entry, replace: options.replace });
      draft.setRoute({
        file: `${deployConfFolder(deployId)}/conf.server.json`,
        host: base,
        path,
        entry: redirectEntryFactory(entry, `https://${primary}`),
        replace: options.replace,
      });
      return UnderpostSite.API.applyPlan({
        operation: 'site create',
        changes: [...draft.changes(), ...sources, ...dbNameEnvChanges(deployId, entry)],
        deployIds: [deployId],
        dryRun: options.dryRun,
      });
    },

    /**
     * Clones a client under a new id: its configuration entries, its source tree, and a sibling
     * route next to each route of the deployment that serves the source client.
     * @param {string} fromClientId - Source client.
     * @param {string} toClientId - New client.
     * @param {object} options
     * @param {string} options.deployId - Deployment the clone is created in.
     * @param {string} [options.fromDeployId] - Deployment of the source client; `deployId` otherwise.
     * @param {boolean} [options.replace] - Replaces different entries at the clone routes.
     * @param {boolean} [options.dryRun] - Prints the plan only.
     * @returns {{applied: boolean, plan: Array<object>}} The result.
     * @memberof UnderpostSite
     */
    cloneClient(fromClientId, toClientId, options = {}) {
      const deployId = siteDeployIdFactory(options.deployId);
      const fromDeployId = options.fromDeployId ? siteDeployIdFactory(options.fromDeployId) : deployId;
      const fromId = siteIdFactory(fromClientId, 'source client id');
      const clientId = siteIdFactory(toClientId, 'client id');
      const draft = confDraftFactory();
      const sources = cloneClientPlan({
        draft,
        from: sourceClient(deploySource(fromDeployId), fromId, fromDeployId),
        to: { clientId, deployId },
      });
      const envChanges = clientRoutesPlan({
        draft,
        deployId,
        fromClientId: fromId,
        toClientId: clientId,
        replace: options.replace,
      });
      return UnderpostSite.API.applyPlan({
        operation: 'site clone-client',
        changes: [...draft.changes(), ...sources, ...envChanges],
        deployIds: [deployId],
        dryRun: options.dryRun,
      });
    },

    /**
     * Clones a route, with its development variants, to another host/path and optionally to another
     * deployment and client.
     * @param {string} fromRoute - Source route, `<host>[/path]`.
     * @param {string} toRoute - Target route, `<host>[/path]`.
     * @param {object} options
     * @param {string} options.deployId - Deployment the route is created in.
     * @param {string} [options.fromDeployId] - Deployment of the source route; `deployId` otherwise.
     * @param {string} [options.client] - Client the route serves instead of the source client.
     * @param {boolean} [options.replace] - Replaces a different entry at the target route.
     * @param {boolean} [options.dryRun] - Prints the plan only.
     * @returns {{applied: boolean, plan: Array<object>}} The result.
     * @memberof UnderpostSite
     */
    cloneRoute(fromRoute, toRoute, options = {}) {
      const deployId = siteDeployIdFactory(options.deployId);
      const from = {
        deployId: options.fromDeployId ? siteDeployIdFactory(options.fromDeployId) : deployId,
        ...siteRouteFactory(fromRoute),
      };
      const to = { deployId, ...siteRouteFactory(toRoute) };
      if (from.deployId === to.deployId && from.host === to.host && from.path === to.path)
        throw new Error('Source and target routes are the same');
      const draft = confDraftFactory();
      const { envChanges } = cloneRoutePlan({
        draft,
        from,
        to,
        clientId: options.client ? siteIdFactory(options.client, 'client id') : '',
        replace: options.replace,
      });
      return UnderpostSite.API.applyPlan({
        operation: 'site clone-route',
        changes: [...draft.changes(), ...envChanges],
        deployIds: [deployId],
        dryRun: options.dryRun,
      });
    },

    /**
     * Registers an existing API in a deployment: on every route that serves APIs, in the development
     * variants and replicas, and in the services of a client.
     * @param {string} apiId - API id.
     * @param {object} options
     * @param {string} options.deployId - Deployment.
     * @param {string} [options.client] - Client whose services list the API.
     * @param {string} [options.host] - Limits the routes to one hostname.
     * @param {boolean} [options.dryRun] - Prints the plan only.
     * @returns {{applied: boolean, plan: Array<object>}} The result.
     * @memberof UnderpostSite
     */
    addApi(apiId, options = {}) {
      const deployId = siteDeployIdFactory(options.deployId);
      const draft = confDraftFactory();
      apiRegistrationPlan({
        draft,
        apiId: siteIdFactory(apiId, 'API id'),
        deployId,
        clientId: options.client ? siteIdFactory(options.client, 'client id') : '',
        host: options.host ? siteHostFactory(options.host) : '',
      });
      return UnderpostSite.API.applyPlan({
        operation: 'site add-api',
        changes: draft.changes(),
        deployIds: [deployId],
        dryRun: options.dryRun,
      });
    },

    /**
     * Registers a client component in the component lists of a deployment, or of every routed
     * deployment when `allDeploys` says so, and of their replicas.
     * @param {string} componentId - Component id.
     * @param {object} options
     * @param {string} [options.deployId] - Deployment; required unless `allDeploys`.
     * @param {boolean} [options.allDeploys] - Every deployment in the route table.
     * @param {string} [options.client] - Limits the clients to one.
     * @param {string} [options.submodule] - Limits the component lists to one submodule.
     * @param {boolean} [options.dryRun] - Prints the plan only.
     * @returns {{applied: boolean, plan: Array<object>}} The result.
     * @memberof UnderpostSite
     */
    addComponent(componentId, options = {}) {
      if (Boolean(options.deployId) === Boolean(options.allDeploys))
        throw new Error('Name exactly one scope: --deploy-id <deploy-id> or --all-deploys');
      const deployIds = options.allDeploys ? readDeployRoutes() : [siteDeployIdFactory(options.deployId)];
      const draft = confDraftFactory();
      componentRegistrationPlan({
        draft,
        componentId: componentIdFactory(componentId),
        deployIds,
        clientId: options.client ? siteIdFactory(options.client, 'client id') : '',
        submoduleId: options.submodule ? siteIdFactory(options.submodule, 'submodule id') : '',
      });
      return UnderpostSite.API.applyPlan({
        operation: 'site add-component',
        changes: draft.changes(),
        deployIds,
        dryRun: options.dryRun,
      });
    },
  };
}

export default UnderpostSite;
