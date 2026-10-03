/**
 * The renderers of the dynamic public routes of a host.
 *
 * A host declares the routes whose shell it renders with the resource's own metadata in
 * `publicRoutes` of its `conf.server.json` entry, by `PublicRoutes` name. This module is the one
 * place that knows each renderer: it checks the declaration and loads only the declared renderers.
 * A host that declares none serves every public route as the plain shell.
 *
 * @module src/server/network/public-route-renderers.js
 * @namespace PublicRouteRenderers
 */

/**
 * @typedef {Object} PublicRouteHost
 * @property {string} host
 * @property {string} path
 * @property {string[]} [publicRoutes] - `PublicRoutes` names the host renders.
 * @property {string[]} [apis] - The APIs the host mounts.
 * @property {Object<string,string>} [consumes] - The APIs the host consumes, api → owning domain.
 * @property {Object} [db] - The host database.
 * @property {string} [apiBaseHost] - The host that serves the API, when it is not this one.
 * @property {Object} [metadata] - The `metadata` block of the host client.
 */

/** Each renderer: what the host must hold, and its lazy loader. */
const RENDERERS = Object.freeze({
  entry: {
    // The entry is resolved from the document API of this host, so the host owns it.
    requirements: ({ apis = [], db, apiBaseHost }) =>
      !apiBaseHost && !!db && apis.includes('document') ? [] : ['a database, the "document" API and no apiBaseHost'],
    load: async () => (await import('./entry-metadata.js')).entryShellRendererFactory,
  },
  objectLayer: {
    // The definition is resolved at its authority, so the host needs nothing of its own.
    requirements: () => [],
    load: async () => (await import('./object-layer-metadata.js')).objectLayerShellRendererFactory,
  },
});

/** The route names a host can declare in `publicRoutes`. */
const PUBLIC_ROUTE_RENDERER_NAMES = Object.freeze(Object.keys(RENDERERS));

/**
 * The errors of the `publicRoutes` declaration of a host.
 * @param {PublicRouteHost} hostConf
 * @returns {string[]}
 * @memberof PublicRouteRenderers
 */
const publicRouteErrorsOf = (hostConf = {}) => {
  const { publicRoutes = [] } = hostConf;
  if (!Array.isArray(publicRoutes)) return ['"publicRoutes" is not an array'];
  const errors = [];
  for (const name of new Set(publicRoutes)) {
    if (!RENDERERS[name]) {
      errors.push(`unknown public route "${name}", expected one of ${PUBLIC_ROUTE_RENDERER_NAMES.join(', ')}`);
      continue;
    }
    for (const need of RENDERERS[name].requirements(hostConf)) errors.push(`public route "${name}" needs ${need}`);
  }
  if (new Set(publicRoutes).size !== publicRoutes.length) errors.push('"publicRoutes" repeats a route');
  return errors;
};

/**
 * The renderer of each public route a host declares, loaded on demand.
 * @param {PublicRouteHost} hostConf
 * @returns {Promise<Object<string, (req: import('express').Request, shellHtml: string, param: string) => Promise<string>>>}
 *   `PublicRoutes` name → renderer.
 * @throws {Error} On a declaration the host cannot serve.
 * @memberof PublicRouteRenderers
 */
const publicRouteRenderersFactory = async (hostConf) => {
  const errors = publicRouteErrorsOf(hostConf);
  if (errors.length) throw new Error(`${hostConf.host}${hostConf.path}: ${errors.join('; ')}`);
  const renderers = {};
  for (const name of hostConf.publicRoutes ?? []) renderers[name] = (await RENDERERS[name].load())(hostConf);
  return renderers;
};

export { PUBLIC_ROUTE_RENDERER_NAMES, publicRouteErrorsOf, publicRouteRenderersFactory };
