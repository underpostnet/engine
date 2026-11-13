/**
 * The lifecycle of the API modules of one host path: load the module of each API, check its
 * contract, build its context with the services it declares, start it once, and create its router.
 * The Express runtime mounts the router; a module never sees the Express application.
 *
 * @module src/server/domain/api-module.js
 * @namespace ApiModule
 */

import { DataBaseProviderService } from '../../db/database-provider.js';
import { MailerProvider } from '../../mailer/mailer-provider.js';
import { authServiceFactory } from '../security/auth.js';
import { resolveHostKeyContext } from '../runtime/conf.js';
import { apiPathOf } from './api-contract.js';
import { apiAssetService, loadApiAssets } from './api-assets.js';
import { loadApiExtension } from './consumed-api.js';

/**
 * The shared services a module may declare.
 * @type {ReadonlyArray<import('../../api/types.js').ApiServiceName>}
 * @memberof ApiModule
 */
export const API_SERVICE_NAMES = Object.freeze(['database', 'auth', 'mailer', 'assets']);

/**
 * The module of an API: `src/api/<api>/<api>.router.js`.
 * @param {string} api
 * @returns {URL}
 * @memberof ApiModule
 */
export const apiModuleUrl = (api) => new URL(`../../api/${api}/${api}.router.js`, import.meta.url);

/**
 * How an `ApiModule` export breaks the contract of {@link import('../../api/types.js').ApiModuleDefinition}.
 * @param {string} api - The API the module is loaded for.
 * @param {unknown} definition
 * @returns {string[]} One line per defect; empty for a valid module.
 * @memberof ApiModule
 */
export const apiModuleDefects = (api, definition) => {
  if (!definition || typeof definition !== 'object') return ['exports no ApiModule'];
  const defects = [];
  if (definition.id !== api) defects.push(`ApiModule.id is "${definition.id}", not "${api}"`);
  if (typeof definition.createRouter !== 'function') defects.push('ApiModule.createRouter is not a function');
  if (definition.initialize !== undefined && typeof definition.initialize !== 'function')
    defects.push('ApiModule.initialize is not a function');
  const services = definition.services;
  if (!Array.isArray(services)) defects.push('ApiModule.services is not an array');
  else {
    for (const name of services)
      if (!API_SERVICE_NAMES.includes(name)) defects.push(`ApiModule.services names an unknown service "${name}"`);
    if (new Set(services).size !== services.length) defects.push('ApiModule.services repeats a service');
    if (!!definition.assets !== services.includes('assets'))
      defects.push('ApiModule.assets and the assets service go together');
  }
  for (const [name, declaration] of Object.entries(definition.assets ?? {}))
    if (!declaration?.file || typeof declaration.contentType !== 'string')
      defects.push(`ApiModule.assets.${name} needs a file and a contentType`);
  const known = ['id', 'services', 'assets', 'initialize', 'createRouter'];
  for (const key of Object.keys(definition))
    if (!known.includes(key)) defects.push(`ApiModule.${key} is not part of the contract`);
  return defects;
};

/**
 * The services a module declares, built for one host path.
 * @param {import('../../api/types.js').ApiModuleDefinition} definition
 * @param {{host:string, path:string}} identity
 * @returns {import('../../api/types.js').ApiServices}
 * @throws {Error} Naming each declared service the host path does not provide.
 * @memberof ApiModule
 */
export const apiServicesOf = (definition, identity) => {
  const missing = [];
  const services = {};
  for (const name of definition.services) {
    if (name === 'database') {
      try {
        DataBaseProviderService.getProvider(identity);
        services.database = DataBaseProviderService.getDispatcher(identity);
      } catch {
        missing.push('database (the host path loads no database provider)');
      }
    } else if (name === 'auth') services.auth = authServiceFactory(identity);
    else if (name === 'mailer') {
      const mailer = MailerProvider.service(resolveHostKeyContext(identity));
      if (mailer) services.mailer = mailer;
      else missing.push('mailer (the host path loads no mailer)');
    } else if (name === 'assets') services.assets = apiAssetService(definition.id, definition.assets);
  }
  if (missing.length) throw new Error(`missing service: ${missing.join(', ')}`);
  return services;
};

/**
 * The context of a module for one host path, frozen: no module changes the runtime it shares.
 * @param {Object} params
 * @param {string} params.host
 * @param {string} params.path
 * @param {Object<string,string>} [params.consumes={}]
 * @param {string[]} [params.origins=[]]
 * @param {import('../../api/types.js').ApiServices} [params.services={}]
 * @param {import('../../api/types.js').ApiExtension} [params.extension]
 * @param {string[]} [params.publicHosts=[]] - The hosts whose path routes reach the host path.
 * @returns {import('../../api/types.js').ApiRouterContext}
 * @memberof ApiModule
 */
export const apiContextFactory = ({
  host,
  path,
  consumes = {},
  origins = [],
  services = {},
  extension,
  publicHosts = [],
}) =>
  Object.freeze({
    host,
    path,
    apiBasePath: apiPathOf(path),
    consumes: Object.freeze({ ...consumes }),
    origins: Object.freeze([...origins]),
    publicHosts: Object.freeze([...publicHosts]),
    services: Object.freeze({ ...services }),
    ...(extension ? { extension } : {}),
  });

/** The start of each module, by `<host><path>:<api>`: one per host path while it succeeds. */
const started = new Map();

/**
 * Starts a module once per host path: reads its assets, then awaits its `initialize`. A failed
 * start is forgotten, so a later start tries again.
 * @param {import('../../api/types.js').ApiModuleDefinition} definition
 * @param {import('../../api/types.js').ApiRouterContext} context
 * @returns {Promise<void>}
 * @memberof ApiModule
 */
export const startApiModule = (definition, context) => {
  const key = `${resolveHostKeyContext(context)}:${definition.id}`;
  if (!started.has(key)) {
    const start = (async () => {
      if (definition.assets) await loadApiAssets(definition.id, definition.assets);
      await definition.initialize?.(context);
    })();
    start.catch(() => started.delete(key));
    started.set(key, start);
  }
  return started.get(key);
};

/**
 * Builds the router of one API for one host path: the module, its context, its start and its router.
 * @param {Object} params
 * @param {string} params.api
 * @param {string} params.host
 * @param {string} params.path
 * @param {Object<string,string>} params.consumes - The consumed APIs of the host.
 * @param {string[]} params.origins
 * @param {Object<string,string>} [params.apiExtensions] - api → project, from `conf.server.json`.
 * @param {string[]} [params.publicHosts] - The hosts whose path routes reach the host path.
 * @returns {Promise<{definition: import('../../api/types.js').ApiModuleDefinition,
 *   context: import('../../api/types.js').ApiRouterContext, router: import('express').Router, url: URL}>}
 * @throws {Error} Naming the API, the host and the path.
 * @memberof ApiModule
 */
export async function buildApiModule({ api, host, path, consumes, origins, apiExtensions, publicHosts }) {
  try {
    const url = apiModuleUrl(api);
    const { ApiModule: definition } = await import(url.href);
    const defects = apiModuleDefects(api, definition);
    if (defects.length) throw new Error(defects.join('; '));
    const context = apiContextFactory({
      host,
      path,
      consumes,
      origins,
      services: apiServicesOf(definition, { host, path }),
      extension: await loadApiExtension(api, apiExtensions),
      publicHosts,
    });
    await startApiModule(definition, context);
    const router = definition.createRouter(context);
    if (typeof router !== 'function' || !Array.isArray(router.stack))
      throw new Error('createRouter returned no Express router');
    return { definition, context, router, url };
  } catch (error) {
    throw new Error(`API ${api} of ${host}${path}: ${error.message}`, { cause: error });
  }
}
