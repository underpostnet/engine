/**
 * The OpenAPI document a host serves: every route it serves from its own authority.
 *
 * The routers are the one authority for what exists. A route is described from the router itself:
 * method, path parameters, JSON body and auth guard. A `#swagger` comment of its source adds the
 * rest. Each comment line `#swagger.<pointer> = <literal>` sets an OpenAPI value: a comment that
 * sets `path` and `method` describes that operation, any other comment sets document fields such as
 * `components.schemas.<name>`.
 *
 * @module src/server/domain/api-document.js
 * @namespace ApiDocument
 */
import fs from 'fs-extra';
import vm from 'vm';
import express from 'express';
import { DOMAIN_API_VERSION, apiPathOf } from './api-contract.js';

/** HTTP methods whose route reads a JSON body. */
const BODY_METHODS = ['post', 'put', 'patch'];

/**
 * @typedef {Object} ApiRoute
 * @property {string} api - The API module that mounts the route.
 * @property {string} method - Lowercase HTTP method.
 * @property {string} path - OpenAPI path below the API base path, `/<api>/{param}`.
 * @property {boolean} guarded - Whether the route runs the host's auth middleware.
 * @memberof ApiDocument
 */

/**
 * @typedef {Object} ApiAnnotations
 * @property {Object<string,Object>} operations - `<method> <path>` → the operation fields its comment sets.
 * @property {Object} document - The document fields the other comments set.
 * @memberof ApiDocument
 */

/**
 * The path a host path serves its OpenAPI document at, `/api/v1/openapi.json`.
 * @param {string} [path='/'] - Host path.
 * @returns {string}
 * @memberof ApiDocument
 */
export const apiDocumentPathOf = (path = '/') => `${apiPathOf(path)}/openapi.json`;

/**
 * The routes one router serves, as the API module mounts them.
 * @param {string} api
 * @param {import('express').Router} router
 * @param {Function} authMiddleware - The auth middleware the host handed the router.
 * @returns {ApiRoute[]}
 */
const routesOf = (api, router, authMiddleware) =>
  router.stack
    .filter((layer) => layer.route)
    .flatMap(({ route }) =>
      Object.keys(route.methods)
        .filter((method) => method !== '_all')
        .map((method) => ({
          api,
          method,
          path: `/${api}${route.path === '/' ? '' : route.path}`.replace(/:(\w+)/g, '{$1}'),
          guarded: route.stack.some((layer) => layer.handle === authMiddleware),
        })),
    );

/**
 * The routes a mounted API serves from the host's own authority. A consumed API is documented by
 * its owner: the host serves only the routes its extension mounts.
 * @param {string} api
 * @param {import('express').Router} router - The router the module built.
 * @param {import('../../api/types.js').RouterOptions} options - The options the module was built with.
 * @returns {ApiRoute[]}
 * @memberof ApiDocument
 */
export const ownRoutesOf = (api, router, options) => {
  if (!options.consumes?.[api]) return routesOf(api, router, options.authMiddleware);
  if (!options.extension) return [];
  const extensionRouter = express.Router();
  options.extension.mount(extensionRouter, options);
  return routesOf(api, extensionRouter, options.authMiddleware);
};

/** Sets `value` at `pointer` in `target`, creating the objects on the way. */
const assign = (target, [key, ...rest], value) => {
  if (rest.length === 0) target[key] = value;
  else assign((target[key] ??= {}), rest, value);
};

/**
 * The `#swagger` comments of a source file: per comment, its pointers and the values they set.
 * @param {URL} url
 * @returns {Array<Array<[string[], *]>>}
 * @throws {Error} On a value that is not a JavaScript literal.
 */
const commentsOf = (url) =>
  [...fs.readFileSync(url, 'utf8').matchAll(/\/\*([\s\S]*?)\*\//g)]
    .map(([, comment]) => {
      const starts = [...comment.matchAll(/#swagger\.([\w.[\]'"]+)\s*=/g)];
      return starts.map((start, index) => {
        const literal = comment.slice(start.index + start[0].length, starts[index + 1]?.index);
        try {
          return [start[1].match(/[^.[\]'"]+/g), vm.runInNewContext(`(${literal})`)];
        } catch (error) {
          throw new Error(`${url.pathname} #swagger.${start[1]}: ${error.message}`);
        }
      });
    })
    .filter((assignments) => assignments.length > 0);

/**
 * The annotations of the sources a host serves.
 * @param {Array<{url: URL, own: boolean}>} sources - Each source, and whether its operations describe this host's routes.
 * @returns {ApiAnnotations}
 * @memberof ApiDocument
 */
export const apiAnnotationsOf = (sources) => {
  const annotations = { operations: {}, document: {} };
  for (const { url, own } of sources) {
    for (const assignments of commentsOf(url)) {
      const block = {};
      for (const [pointer, value] of assignments) assign(block, pointer, value);
      const { path, method, ...operation } = block;
      if (!path || !method) for (const [pointer, value] of assignments) assign(annotations.document, pointer, value);
      else if (own) annotations.operations[`${method} ${path}`] = operation;
    }
  }
  return annotations;
};

/**
 * The operation a route documents before its annotation.
 * @param {ApiRoute} route
 * @returns {Object} OpenAPI operation.
 */
const routeOperation = ({ api, method, path, guarded }) => ({
  tags: [api],
  parameters: [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  })),
  ...(BODY_METHODS.includes(method) && {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  }),
  ...(guarded && { security: [{ bearerAuth: [] }] }),
  responses: { default: { description: 'Response of the route' } },
});

/**
 * Whether a route serves a concrete path, such as `/user/{id}` serves `/user/auth`.
 * @param {ApiRoute} route
 * @param {string} path
 * @returns {boolean}
 */
const serves = (route, path) =>
  new RegExp(`^${route.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '[^/]+')}$`).test(path);

/**
 * The OpenAPI document of the routes a host serves. The first route of a method and path wins, as
 * it does in Express. An annotation may also name a concrete path of a parameterized route.
 * @param {Object} options
 * @param {string} options.host - The host; it titles the document without a client title.
 * @param {Object} [options.metadata] - The client's `metadata` block.
 * @param {ApiAnnotations} [options.annotations]
 * @param {ApiRoute[]} [options.routes] - The host's own routes, in mount order.
 * @param {string} [options.path='/'] - Host path; the server URL resolves against the document URL.
 * @returns {Object} OpenAPI 3.0 document.
 * @memberof ApiDocument
 */
export const apiDocumentFactory = ({
  host,
  metadata = {},
  annotations = { operations: {}, document: {} },
  routes = [],
  path = '/',
}) => {
  const paths = {};
  const describe = (route, operationPath, annotation) => {
    paths[operationPath] = {
      ...paths[operationPath],
      [route.method]: { ...routeOperation({ ...route, path: operationPath }), ...annotation },
    };
  };
  for (const route of routes)
    if (!paths[route.path]?.[route.method])
      describe(route, route.path, annotations.operations[`${route.method} ${route.path}`]);
  for (const [key, annotation] of Object.entries(annotations.operations)) {
    const [method, operationPath] = key.split(' ');
    if (paths[operationPath]?.[method]) continue;
    const route = routes.find((route) => route.method === method && serves(route, operationPath));
    if (route) describe(route, operationPath, annotation);
  }
  const tags = new Set(Object.values(paths).flatMap((operations) => Object.values(operations).flatMap((o) => o.tags)));
  return {
    ...annotations.document,
    openapi: '3.0.0',
    info: { title: metadata.title ?? host, description: metadata.description, version: DOMAIN_API_VERSION },
    servers: [{ url: apiPathOf(path) }],
    tags: [...tags].map((name) => ({ name })),
    paths,
    components: {
      ...annotations.document.components,
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    },
  };
};
