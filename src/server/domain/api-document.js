/**
 * The OpenAPI document a host serves: every route it serves from its own authority.
 *
 * The routers are the one authority for what exists. A route is described from the router itself:
 * method, path parameters and JSON body, plus the `apiDocument` contribution of each middleware and
 * handler it runs ({@link documented}). A `#swagger` comment of its source adds the rest. Each comment
 * line `#swagger.<pointer> = <literal>` sets an OpenAPI value: a comment that sets `path` and `method`
 * describes that operation, any other comment sets document fields such as `components.schemas.<name>`.
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

const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (kind, name) => ({ $ref: `#/components/${kind}/${name}` });

/** The components every document carries: the response envelopes, list parameters and the session scheme. */
const SHARED_COMPONENTS = Object.freeze({
  schemas: {
    SuccessResponse: {
      type: 'object',
      required: ['status', 'data'],
      properties: { status: { type: 'string', enum: ['success'] }, data: { description: 'The result.' } },
    },
    ErrorResponse: {
      type: 'object',
      required: ['status', 'message'],
      properties: { status: { type: 'string', enum: ['error'] }, message: { type: 'string' } },
    },
  },
  responses: {
    Success: { description: 'Success envelope.', ...json(ref('schemas', 'SuccessResponse')) },
    Error: {
      description: 'Error envelope. The status comes from the error.',
      ...json(ref('schemas', 'ErrorResponse')),
    },
    Unauthorized: { description: 'No valid session token.', ...json(ref('schemas', 'ErrorResponse')) },
    Forbidden: {
      description: 'The account is restricted, or its role may not do this.',
      ...json(ref('schemas', 'ErrorResponse')),
    },
  },
  parameters: {
    page: { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
    limit: { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, default: 10 } },
    filterModel: {
      name: 'filterModel',
      in: 'query',
      description: 'AG Grid filter model, as JSON.',
      schema: { type: 'string' },
    },
    sortModel: {
      name: 'sortModel',
      in: 'query',
      description: 'AG Grid sort model, as JSON.',
      schema: { type: 'string' },
    },
    sort: { name: 'sort', in: 'query', description: 'Field to sort by.', schema: { type: 'string' } },
    order: {
      name: 'order',
      in: 'query',
      description: 'With `sort`, its direction (`asc` or `desc`). Alone, `field1:asc,field2:desc`.',
      schema: { type: 'string' },
    },
  },
  securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
});

/**
 * The OpenAPI fields a middleware or handler adds to every operation that runs it. `notes` become
 * paragraphs of the description.
 * @typedef {Object} ApiContribution
 * @property {string} [summary]
 * @property {string} [description]
 * @property {string[]} [notes]
 * @property {Object[]} [parameters]
 * @property {Object} [requestBody]
 * @property {Object<string, Object>} [responses]
 * @property {Object[]} [security]
 * @memberof ApiDocument
 */

/**
 * @typedef {Object} ApiRoute
 * @property {string} api - The API module that mounts the route.
 * @property {string} method - Lowercase HTTP method.
 * @property {string} path - OpenAPI path below the API base path, `/<api>/{param}`.
 * @property {ApiContribution} document - The merged contributions of the middleware and handlers it runs.
 * @memberof ApiDocument
 */

/** The authentication contribution of the host's auth middleware. */
export const AUTH_CONTRIBUTION = Object.freeze({
  security: [{ bearerAuth: [] }],
  responses: { 401: ref('responses', 'Unauthorized'), 403: ref('responses', 'Forbidden') },
});

/**
 * The contribution of a role guard.
 * @param {string} role - The least role the guard admits.
 * @returns {ApiContribution}
 * @memberof ApiDocument
 */
export const roleContribution = (role) => ({
  notes: [`Requires the ${role} role.`],
  responses: { 403: ref('responses', 'Forbidden') },
});

/** The list parameters a paginated read accepts. */
export const LIST_PARAMETERS = Object.freeze(
  Object.keys(SHARED_COMPONENTS.parameters).map((name) => ref('parameters', name)),
);

/** The responses of a handler that answers with the success or the error envelope. */
export const ENVELOPE_RESPONSES = Object.freeze({
  200: ref('responses', 'Success'),
  default: ref('responses', 'Error'),
});

/**
 * Marks a middleware or handler with the OpenAPI fields it adds to every operation that runs it.
 * @param {Function} handler
 * @param {ApiContribution} contribution
 * @returns {Function} The same handler.
 * @memberof ApiDocument
 */
export const documented = (handler, contribution) => Object.assign(handler, { apiDocument: contribution });

const parameterKey = (parameter) => parameter.$ref ?? `${parameter.in}:${parameter.name}`;

/** Parameters with one entry per location and name; a later one replaces an earlier one. */
const uniqueParameters = (parameters) => [
  ...new Map(parameters.map((parameter) => [parameterKey(parameter), parameter])).values(),
];

/**
 * The contributions of a route's middleware and handlers, merged in run order.
 * @param {ApiContribution[]} contributions
 * @returns {Required<Pick<ApiContribution, 'notes'|'parameters'|'responses'|'security'>> & ApiContribution}
 */
const mergeContributions = (contributions) =>
  contributions.reduce(
    (merged, { notes = [], parameters = [], responses = {}, security = [], ...fields }) => ({
      ...merged,
      ...fields,
      notes: [...new Set([...merged.notes, ...notes])],
      parameters: uniqueParameters([...merged.parameters, ...parameters]),
      responses: { ...merged.responses, ...responses },
      security: [...new Map([...merged.security, ...security].map((entry) => [JSON.stringify(entry), entry])).values()],
    }),
    { notes: [], parameters: [], responses: {}, security: [] },
  );

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
 * @returns {ApiRoute[]}
 */
const routesOf = (api, router) =>
  router.stack
    .filter((layer) => layer.route)
    .flatMap(({ route }) =>
      Object.keys(route.methods)
        .filter((method) => method !== '_all')
        .map((method) => ({
          api,
          method,
          path: `/${api}${route.path === '/' ? '' : route.path}`.replace(/:(\w+)/g, '{$1}'),
          document: mergeContributions(
            route.stack.filter((layer) => layer.method === method).flatMap(({ handle }) => handle.apiDocument ?? []),
          ),
        })),
    );

/**
 * The routes a mounted API serves from the host's own authority. A consumed API is documented by
 * its owner: the host serves only the routes its extension mounts.
 * @param {string} api
 * @param {import('express').Router} router - The router the module built.
 * @param {import('../../api/types.js').ApiRouterContext} context - The context the module was built with.
 * @returns {ApiRoute[]}
 * @memberof ApiDocument
 */
export const ownRoutesOf = (api, router, context) => {
  if (!context.consumes?.[api]) return routesOf(api, router);
  if (!context.extension) return [];
  const extensionRouter = express.Router();
  context.extension.mount(extensionRouter, context);
  return routesOf(api, extensionRouter);
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
 * A unique operation id from the method and the path: `post /job/{jobId}/approve` is
 * `postJobByJobIdApprove`.
 * @param {string} method
 * @param {string} path
 * @returns {string}
 * @memberof ApiDocument
 */
export const operationIdOf = (method, path) =>
  method +
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => (/^\{(\w+)\}$/.exec(segment) ? `by-${segment.slice(1, -1)}` : segment))
    .flatMap((segment) => segment.split(/[^a-zA-Z0-9]+/).filter(Boolean))
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');

/**
 * The operation of a route at a path: what the route derives, then its annotation.
 * @param {ApiRoute} route
 * @param {string} path - The route path, or a concrete path it serves.
 * @param {Object} [annotation] - The fields its `#swagger` comment sets.
 * @returns {Object} OpenAPI operation.
 */
const operationOf = ({ api, method, document }, path, annotation = {}) => {
  const { notes, parameters, responses, security, ...fields } = document;
  const {
    parameters: annotatedParameters = [],
    responses: annotatedResponses = {},
    ...operation
  } = { ...fields, ...annotation };
  const pathParameters = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  const allParameters = uniqueParameters([...pathParameters, ...parameters, ...annotatedParameters]);
  const description = [operation.description, ...notes].filter(Boolean).join('\n\n');
  const allResponses = { ...responses, ...annotatedResponses };
  if (!Object.keys(allResponses).some((status) => status === 'default' || status.startsWith('2')))
    allResponses.default = { description: 'Response of the route.' };
  return {
    tags: [api],
    operationId: operationIdOf(method, path),
    ...(BODY_METHODS.includes(method) && { requestBody: json({ type: 'object' }) }),
    ...operation,
    ...(description && { description }),
    ...(allParameters.length > 0 && { parameters: allParameters }),
    ...(security.length > 0 && { security }),
    responses: allResponses,
  };
};

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
 * @returns {Object} OpenAPI 3.0.3 document.
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
    paths[operationPath] = { ...paths[operationPath], [route.method]: operationOf(route, operationPath, annotation) };
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
  const components = annotations.document.components ?? {};
  return {
    ...annotations.document,
    openapi: '3.0.3',
    info: { title: metadata.title ?? host, description: metadata.description, version: DOMAIN_API_VERSION },
    servers: [{ url: apiPathOf(path) }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      ...components,
      ...Object.fromEntries(
        Object.entries(SHARED_COMPONENTS).map(([kind, shared]) => [kind, { ...shared, ...components[kind] }]),
      ),
    },
  };
};
