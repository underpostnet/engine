'use strict';

import { expect } from 'chai';
import express from 'express';
import fs from 'fs-extra';
import { pathToFileURL } from 'url';
import {
  AUTH_CONTRIBUTION,
  apiAnnotationsOf,
  apiDocumentFactory,
  apiDocumentPathOf,
  documented,
  operationIdOf,
  ownRoutesOf,
  roleContribution,
} from '../../../src/server/domain/api-document.js';
import { registerCrudRoutes } from '../../../src/server/network/middlewares.js';
import { authServiceFactory } from '../../../src/server/security/auth.js';

const authMiddleware = documented((req, res, next) => next(), AUTH_CONTRIBUTION);
/** An API context with the auth service of a host whose token check lets every request through. */
const contextOf = (fields = {}) => ({
  consumes: {},
  services: { auth: authServiceFactory({ host: 'docs.fixture.test', path: '/' }, authMiddleware) },
  ...fields,
});
const adminOnly = documented((req, res, next) => next(), roleContribution('admin'));
const handler = (req, res) => res.end();
const crud = { post: handler, get: handler, put: handler, delete: handler };
const keys = (routes) => routes.map(({ method, path }) => `${method} ${path}`);
const doc = (fields = {}) => ({ notes: [], parameters: [], responses: {}, security: [], ...fields });
const AUTH_RESPONSES = {
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
};

/** Every `$ref` of a document, with the pointer it names. */
const refsOf = (value, found = []) => {
  if (Array.isArray(value)) value.forEach((item) => refsOf(item, found));
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) key === '$ref' ? found.push(item) : refsOf(item, found);
  return found;
};
const resolves = (document, ref) =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((node, key) => node?.[key], document) !== undefined;

describe('API document', () => {
  let fixturePath;
  const source = (name, text, own = true) => {
    fs.outputFileSync(`${fixturePath}/${name}`, text);
    return { url: pathToFileURL(`${fixturePath}/${name}`), own };
  };

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-api-document-');
  });

  afterEach(() => {
    fs.removeSync(fixturePath);
  });

  it('lists every route an owned API mounts, helper routes included', () => {
    const router = express.Router();
    router.use((req, res, next) => next());
    router.get('/maps/:code', authMiddleware, handler);
    registerCrudRoutes(router, crud, contextOf());

    const routes = ownRoutesOf('cyberia-map', router, contextOf());

    expect(routes[0]).to.deep.equal({
      api: 'cyberia-map',
      method: 'get',
      path: '/cyberia-map/maps/{code}',
      document: doc({ security: [{ bearerAuth: [] }], responses: AUTH_RESPONSES }),
    });
    expect(keys(routes)).to.deep.equal([
      'get /cyberia-map/maps/{code}',
      'post /cyberia-map/{id}',
      'post /cyberia-map',
      'get /cyberia-map/{id}',
      'get /cyberia-map',
      'put /cyberia-map/{id}',
      'put /cyberia-map',
      'delete /cyberia-map/{id}',
      'delete /cyberia-map',
    ]);
    expect(
      routes.find((route) => route.method === 'get' && route.path === '/cyberia-map').document.security,
    ).to.deep.equal([]);
  });

  it('serves of a consumed API only the routes the host extension mounts', () => {
    const extension = {
      api: 'object-layer',
      mount: (router, context) => router.get('/context/:id', context.services.auth.authenticate, handler),
    };
    const router = registerCrudRoutes(express.Router(), crud, contextOf());
    extension.mount(router, contextOf());
    const consumes = { 'object-layer': 'object-layer' };

    expect(keys(ownRoutesOf('object-layer', router, contextOf({ consumes, extension })))).to.deep.equal([
      'get /object-layer/context/{id}',
    ]);
    expect(ownRoutesOf('object-layer', router, contextOf({ consumes }))).to.deep.equal([]);
  });

  it('reads operations and document fields from the #swagger comments of a source', () => {
    const annotations = apiAnnotationsOf([
      source(
        'map.router.js',
        `/**
          * Prose that names \`#swagger\` comments is no comment of them.
          */
        /*
          #swagger.components.schemas.map = { type: 'object' }
        */
        router.get('/maps/:code', (req, res) => {
          /*
            #swagger.summary = 'Map context'
            #swagger.path = '/cyberia-map/maps/{code}'
            #swagger.method = 'get'
            #swagger.responses[200] = {
              description: 'The map',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/map' } } },
            }
          */
        });`,
      ),
      source(
        'owner.router.js',
        `/* #swagger.path = '/owner' #swagger.method = 'get' #swagger.summary = 'Owner' */`,
        false,
      ),
      source('owner.schemas.js', `/* #swagger.components.schemas.owner = { type: 'string' } */`, false),
    ]);

    expect(annotations).to.deep.equal({
      operations: {
        'get /cyberia-map/maps/{code}': {
          summary: 'Map context',
          responses: {
            200: {
              description: 'The map',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/map' } } },
            },
          },
        },
      },
      document: { components: { schemas: { map: { type: 'object' }, owner: { type: 'string' } } } },
    });
  });

  it('names the source and the pointer of a value that is not a literal', () => {
    const broken = source('broken.router.js', `/* #swagger.summary = 'open */`);
    expect(() => apiAnnotationsOf([broken])).to.throw(`${broken.url.pathname} #swagger.summary:`);
  });

  it('reads every #swagger comment of the source tree', () => {
    const sources = [...fs.globSync('src/api/*/*.router.js'), ...fs.globSync('src/projects/*/*.extension.js')].map(
      (file) => ({ url: pathToFileURL(file), own: true }),
    );

    const { operations } = apiAnnotationsOf(sources);

    for (const [key, operation] of Object.entries(operations)) {
      expect(key).to.match(/^(get|post|put|patch|delete) \/[a-z0-9-]+/);
      expect(operation.summary ?? operation.description, key).to.be.a('string');
    }
  });

  it('describes a route by the route, then by its annotation', () => {
    const document = apiDocumentFactory({
      host: 'docs.fixture.test',
      annotations: {
        operations: { 'put /cyberia-map/{id}': { summary: 'Update a map', parameters: [] } },
        document: { components: { schemas: { map: { type: 'object' } } } },
      },
      routes: [
        {
          api: 'cyberia-map',
          method: 'put',
          path: '/cyberia-map/{id}',
          document: doc({ security: [{ bearerAuth: [] }], responses: AUTH_RESPONSES }),
        },
        { api: 'cyberia-skill', method: 'get', path: '/cyberia-skill', document: doc() },
      ],
    });

    expect(document.paths['/cyberia-map/{id}'].put).to.deep.equal({
      tags: ['cyberia-map'],
      operationId: 'putCyberiaMapById',
      summary: 'Update a map',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
      security: [{ bearerAuth: [] }],
      responses: { ...AUTH_RESPONSES, default: { description: 'Response of the route.' } },
    });
    expect(document.paths['/cyberia-skill'].get).to.not.have.any.keys('requestBody', 'security', 'parameters');
    expect(document.tags).to.deep.equal([{ name: 'cyberia-map' }, { name: 'cyberia-skill' }]);
    expect(document.components.schemas.map).to.deep.equal({ type: 'object' });
    expect(document.components.securitySchemes).to.deep.equal({
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    });
  });

  it('documents an annotated concrete path of a parameterized route, and no path no route serves', () => {
    const document = apiDocumentFactory({
      host: 'docs.fixture.test',
      annotations: {
        operations: {
          'post /user/auth': { summary: 'Log in' },
          'get /cyberia-player/appearance/v${version}/{cids}': { summary: 'Template path' },
        },
        document: {},
      },
      routes: [
        { api: 'user', method: 'post', path: '/user/{id}', document: doc() },
        { api: 'cyberia-player', method: 'get', path: '/cyberia-player/appearance/v1/{cids}', document: doc() },
      ],
    });

    expect(Object.keys(document.paths)).to.deep.equal([
      '/user/{id}',
      '/cyberia-player/appearance/v1/{cids}',
      '/user/auth',
    ]);
    expect(document.paths['/user/auth'].post).to.include({ summary: 'Log in' });
    expect(document.paths['/user/auth'].post).to.not.have.property('parameters');
    expect(document.paths['/user/auth'].post.operationId).to.equal('postUserAuth');
  });

  it('keeps the first route of a method and path, as Express does', () => {
    const route = { api: 'user', method: 'get', path: '/user/{id}' };
    const document = apiDocumentFactory({
      host: 'docs.fixture.test',
      routes: [
        { ...route, document: doc({ security: [{ bearerAuth: [] }] }) },
        { ...route, document: doc() },
      ],
    });

    expect(document.paths['/user/{id}'].get.security).to.deep.equal([{ bearerAuth: [] }]);
  });

  it('applies a middleware contribution only to the routes that run it, once', () => {
    const router = express.Router();
    router.get('/open', handler);
    router.delete('/closed', authMiddleware, authMiddleware, adminOnly, documented(handler, { summary: 'Close' }));

    const document = apiDocumentFactory({
      host: 'docs.fixture.test',
      routes: ownRoutesOf('thing', router, contextOf()),
    });

    expect(document.paths['/thing/open'].get).to.not.have.any.keys('security', 'description');
    expect(document.paths['/thing/closed'].delete).to.deep.include({
      summary: 'Close',
      description: 'Requires the admin role.',
      security: [{ bearerAuth: [] }],
      responses: { ...AUTH_RESPONSES, default: { description: 'Response of the route.' } },
    });
  });

  it('documents the standard CRUD routes: summaries, list parameters, guards and envelopes', () => {
    const router = registerCrudRoutes(express.Router(), crud, contextOf());

    const { paths } = apiDocumentFactory({
      host: 'docs.fixture.test',
      routes: ownRoutesOf('thing', router, contextOf()),
    });

    expect(paths['/thing'].get.summary).to.equal('List records');
    expect(paths['/thing'].get.parameters.map(({ $ref }) => $ref.split('/').pop())).to.deep.equal([
      'page',
      'limit',
      'filterModel',
      'sortModel',
      'sort',
      'order',
    ]);
    expect(paths['/thing/{id}'].get).to.deep.include({
      summary: 'Read a record',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { $ref: '#/components/responses/Success' }, default: { $ref: '#/components/responses/Error' } },
    });
    expect(paths['/thing/{id}'].put.security).to.deep.equal([{ bearerAuth: [] }]);
    expect(paths['/thing'].delete.description).to.equal('Requires the admin role.');
    expect(paths['/thing/{id}'].delete.description).to.equal(
      'The id names the record.\n\nRequires the moderator role.',
    );
  });

  it('names each operation once, from its method and path', () => {
    expect(operationIdOf('post', '/cyberia-procedural-job/{jobId}/items/{itemId}/approve')).to.equal(
      'postCyberiaProceduralJobByJobIdItemsByItemIdApprove',
    );
    const router = registerCrudRoutes(express.Router(), crud, contextOf());
    router.get('/maps/:code', handler);
    const { paths } = apiDocumentFactory({
      host: 'docs.fixture.test',
      routes: ownRoutesOf('cyberia-map', router, contextOf()),
    });
    const ids = Object.values(paths).flatMap((operations) => Object.values(operations).map((o) => o.operationId));
    expect(new Set(ids).size).to.equal(ids.length);
  });

  it('resolves every reference of the source tree annotations, and declares every path parameter', () => {
    const sources = [...fs.globSync('src/api/*/*.router.js'), ...fs.globSync('src/projects/*/*.extension.js')].map(
      (file) => ({ url: pathToFileURL(file), own: true }),
    );
    const annotations = apiAnnotationsOf(sources);
    const routes = Object.keys(annotations.operations).map((key) => {
      const [method, path] = key.split(' ');
      return { api: path.split('/')[1], method, path, document: doc() };
    });
    const router = registerCrudRoutes(express.Router(), crud, contextOf());
    routes.push(...ownRoutesOf('thing', router, contextOf()));

    const document = apiDocumentFactory({ host: 'docs.fixture.test', annotations, routes });

    for (const ref of refsOf(document)) expect(resolves(document, ref), ref).to.equal(true);
    for (const [path, operations] of Object.entries(document.paths))
      for (const [method, operation] of Object.entries(operations)) {
        const declared = (operation.parameters ?? []).filter((parameter) => parameter.in === 'path');
        const templated = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => name);
        expect(declared.map(({ name }) => name).sort(), `${method} ${path}`).to.deep.equal([...templated].sort());
        expect(
          declared.every(({ required }) => required === true),
          `${method} ${path}`,
        ).to.equal(true);
      }
  });

  it('titles the document by the client, else by the host, at the API contract version', () => {
    expect(apiDocumentFactory({ host: 'docs.fixture.test' }).info).to.deep.equal({
      title: 'docs.fixture.test',
      description: undefined,
      version: 'v1',
    });
    expect(
      apiDocumentFactory({ host: 'docs.fixture.test', metadata: { title: 'Fixture', description: 'About' } }).info,
    ).to.deep.equal({ title: 'Fixture', description: 'About', version: 'v1' });
  });

  it('serves the document of a host path, with a server url relative to it', () => {
    expect(apiDocumentPathOf()).to.equal('/api/v1/openapi.json');
    expect(apiDocumentPathOf('/store')).to.equal('/store/api/v1/openapi.json');
    expect(apiDocumentFactory({ host: 'docs.fixture.test', path: '/store' }).servers).to.deep.equal([
      { url: '/store/api/v1' },
    ]);
  });
});
