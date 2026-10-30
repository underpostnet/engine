/**
 * Registration of existing APIs and client components in the configuration of a deployment and of
 * the replicas it has built.
 * @module src/server/site/site-registrations.js
 * @namespace SiteRegistrations
 */
import fs from 'fs-extra';
import { addApiConf } from '../runtime/conf.js';
import { deployConfFolder, replicaFolders, serverConfFiles } from './site-conf.js';

/**
 * Plans the registration of an existing API: on every route that serves APIs, in the main server
 * configuration, its development variants and its replicas, and in the services of a client.
 * @param {object} params
 * @param {object} params.draft - Configuration draft.
 * @param {string} params.apiId - API id; `src/api/<api-id>` must exist.
 * @param {string} params.deployId - Deploy id.
 * @param {string} [params.clientId] - Client whose services list the API.
 * @param {string} [params.host] - Limits the routes to one hostname.
 * @returns {{routes: string[]}} The routes of the deployment that serve the API after the change.
 * @memberof SiteRegistrations
 */
const apiRegistrationPlan = ({ draft, apiId, deployId, clientId = '', host = '' }) => {
  if (!fs.existsSync(`./src/api/${apiId}`)) throw new Error(`API not found: src/api/${apiId}`);
  const main = deployConfFolder(deployId);
  const routes = new Set();
  for (const folder of [main, ...replicaFolders(deployId)]) {
    for (const file of serverConfFiles(folder)) {
      const conf = draft.read(file);
      if (folder === main && host && !conf[host] && file.endsWith('/conf.server.json'))
        throw new Error(`Host not found: ${host} in ${file}`);
      const { added, present } = addApiConf(conf, { apiId, host });
      if (added.length) draft.note(file, `add API ${apiId} to ${added.join(', ')}`);
      if (folder === main) [...added, ...present].forEach((route) => routes.add(route));
    }
    const clientFile = `${folder}/conf.client.json`;
    if (!clientId || !fs.existsSync(clientFile)) continue;
    const client = draft.read(clientFile)[clientId];
    if (!Array.isArray(client?.services)) {
      if (folder === main) throw new Error(`Client "${clientId}" with a services list not found in ${clientFile}`);
      continue;
    }
    if (client.services.includes(apiId)) continue;
    client.services.push(apiId);
    draft.note(clientFile, `add service ${apiId} to ${clientId}`);
  }
  if (routes.size === 0)
    throw new Error(`No route of ${deployId}${host ? ` on ${host}` : ''} serves APIs (a non-empty apis list)`);
  return { routes: [...routes] };
};

/**
 * Plans the registration of a client component: in the `components.<submodule>` list of each
 * client, in the deployments named and in their replicas. A submodule takes the component only when
 * `src/client/components/<submodule>/<component>.js` exists.
 * @param {object} params
 * @param {object} params.draft - Configuration draft.
 * @param {string} params.componentId - Component id.
 * @param {string[]} params.deployIds - Deploy ids in scope.
 * @param {string} [params.clientId] - Limits the clients to one; every client otherwise.
 * @param {string} [params.submoduleId] - Limits the submodules to one; every component list otherwise.
 * @returns {{lists: string[]}} The `<file> <client>.<submodule>` lists that hold the component after the change.
 * @memberof SiteRegistrations
 */
const componentRegistrationPlan = ({ draft, componentId, deployIds, clientId = '', submoduleId = '' }) => {
  const lists = [];
  let checked = 0;
  for (const deployId of deployIds) {
    const main = deployConfFolder(deployId);
    for (const folder of [main, ...replicaFolders(deployId)]) {
      const file = `${folder}/conf.client.json`;
      if (!fs.existsSync(file)) continue;
      const conf = draft.read(file);
      if (clientId && !conf[clientId]) {
        if (folder === main) throw new Error(`Client "${clientId}" not found in ${file}`);
        continue;
      }
      for (const id of clientId ? [clientId] : Object.keys(conf)) {
        const components = conf[id].components ?? {};
        const submodules = submoduleId
          ? [submoduleId]
          : Object.keys(components).filter((key) => Array.isArray(components[key]));
        for (const submodule of submodules) {
          if (!Array.isArray(components[submodule])) continue;
          checked++;
          if (!fs.existsSync(`./src/client/components/${submodule}/${componentId}.js`)) continue;
          lists.push(`${file} ${id}.${submodule}`);
          if (components[submodule].includes(componentId)) continue;
          components[submodule].push(componentId);
          draft.note(file, `add component ${componentId} to ${id}.${submodule}`);
        }
      }
    }
  }
  if (checked === 0) throw new Error('No component list matches the requested scope');
  if (lists.length === 0)
    throw new Error(
      `Component file not found: src/client/components/${submoduleId || '<submodule>'}/${componentId}.js`,
    );
  return { lists };
};

export { apiRegistrationPlan, componentRegistrationPlan };
