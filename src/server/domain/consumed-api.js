/**
 * API ownership of one host.
 *
 * A host declares the APIs another domain owns in `conf.server.json` as
 * `consumes: { "<api>": "<domain>" }`. It still mounts them: their collections are a local
 * cache of the owner's content, carried by content releases. The owner stays the source of
 * truth: resolvers read it, publication writes to it, and documentation lists the API under it.
 *
 * @module src/server/domain/consumed-api.js
 * @namespace ConsumedApi
 */
import fs from 'fs-extra';
import { loadConfServerJson } from '../runtime/conf.js';

/** A domain is named by the API its owner host serves: lowercase words joined by hyphens. */
const DOMAIN_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The consumed-API declarations of a host, validated: every consumed API is mounted, and every
 * owner is a domain name.
 * @param {{apis?:string[],consumes?:Object<string,string>}} hostConf - One host entry of the server conf.
 * @returns {Object<string,string>} api → owning domain.
 * @throws {Error} On a declaration that cannot be served.
 * @memberof ConsumedApi
 */
export function consumedApisOf(hostConf = {}) {
  const consumes = hostConf.consumes ?? {};
  const apis = hostConf.apis ?? [];
  for (const [api, domain] of Object.entries(consumes)) {
    if (!apis.includes(api)) throw new Error(`Consumed API "${api}" is not in the host's apis`);
    if (!DOMAIN_NAME.test(domain)) throw new Error(`Consumed API "${api}" names no domain: "${domain}"`);
  }
  return { ...consumes };
}

/**
 * Whether a host serves an API from its own authority.
 * @param {{apis?:string[],consumes?:Object<string,string>}} hostConf
 * @param {string} api
 * @returns {boolean}
 * @memberof ConsumedApi
 */
export const ownsApi = (hostConf = {}, api) => (hostConf.apis ?? []).includes(api) && !hostConf.consumes?.[api];

const deployConfs = new Map();

/**
 * The server conf of the deploy this process runs (`DEFAULT_DEPLOY_ID`), read once per deploy
 * id; null when the deploy has none. Secrets stay unresolved: only the API layout is read here.
 * @returns {Object|null}
 * @memberof ConsumedApi
 */
export function deployConfServer() {
  const id = process.env.DEFAULT_DEPLOY_ID;
  if (!id) return null;
  if (!deployConfs.has(id)) {
    const confPath = `./engine-private/conf/${id}/conf.server.json`;
    deployConfs.set(id, fs.existsSync(confPath) ? loadConfServerJson(confPath) : null);
  }
  return deployConfs.get(id);
}

/**
 * The host of a deploy that serves an API from its own authority, or '' when none does.
 * @param {Object|null} confServer - The deploy's server conf.
 * @param {string} api
 * @returns {string}
 * @memberof ConsumedApi
 */
export const ownerHostOf = (confServer, api) =>
  (confServer && Object.keys(confServer).find((host) => ownsApi(confServer[host]['/'], api))) || '';

/**
 * The consumed APIs of a host: from its API context, or, for a process that has only
 * `{ host, path }` such as the CLI, from the deploy's server conf.
 * @param {{host?:string,path?:string,consumes?:Object<string,string>}} [options]
 * @returns {Object<string,string>} api → owning domain.
 * @memberof ConsumedApi
 */
export const consumesOf = (options = {}) =>
  options.consumes ?? deployConfServer()?.[options.host]?.[options.path || '/']?.consumes ?? {};

/**
 * The module of one API extension: `src/projects/<project>/<api>.extension.js`.
 * @param {string} api
 * @param {string} project
 * @returns {URL}
 * @throws {Error} On a project name that is not a project directory name.
 * @memberof ConsumedApi
 */
export function apiExtensionUrl(api, project) {
  if (!/^[a-z0-9-]+$/.test(project ?? '') || !/^[a-z0-9-]+$/.test(api ?? ''))
    throw new Error(`Invalid extension project "${project}" for API "${api}"`);
  return new URL(`../../projects/${project}/${api}.extension.js`, import.meta.url);
}

/**
 * The extension a host declares for one API in `apiExtensions: { "<api>": "<project>" }`: the
 * module `src/projects/<project>/<api>.extension.js`, an {@link import('../../api/types.js').ApiExtension}.
 * It names the API it extends, exports `mount(router, context)`, and may export the hooks the API
 * reads (`resolveKey`, `listParams`, `beforeDelete`). A host that declares none gets the API as its
 * owner ships it.
 * @param {string} api
 * @param {Object<string,string>} [apiExtensions]
 * @returns {Promise<import('../../api/types.js').ApiExtension|undefined>}
 * @throws {Error} When the module extends another API or breaks the contract.
 * @memberof ConsumedApi
 */
export async function loadApiExtension(api, apiExtensions = {}) {
  const project = apiExtensions?.[api];
  if (!project) return undefined;
  const extension = await import(apiExtensionUrl(api, project).href);
  if (extension.api !== api) throw new Error(`Extension ${project}/${api} extends "${extension.api}", not "${api}"`);
  if (typeof extension.mount !== 'function')
    throw new Error(`Extension ${project}/${api} exports no mount(router, context)`);
  for (const hook of ['resolveKey', 'listParams', 'beforeDelete'])
    if (extension[hook] !== undefined && typeof extension[hook] !== 'function')
      throw new Error(`Extension ${project}/${api} exports a ${hook} that is not a function`);
  return extension;
}
