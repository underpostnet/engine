'use strict';

import { expect } from 'chai';
import express from 'express';
import fs from 'fs-extra';
import { pathToFileURL } from 'url';
import {
  apiAnnotationsOf,
  apiDocumentFactory,
  apiDocumentPathOf,
  ownRoutesOf,
} from '../../../src/server/domain/api-document.js';
import { registerCrudRoutes } from '../../../src/server/network/middlewares.js';

const authMiddleware = (req, res, next) => next();
const handler = (req, res) => res.end();
const crud = { post: handler, get: handler, put: handler, delete: handler };
const keys = (routes) => routes.map(({ method, path }) => `${method} ${path}`);

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
    registerCrudRoutes(router, crud, { authMiddleware });

    const routes = ownRoutesOf('cyberia-map', router, { authMiddleware, consumes: {} });

    expect(routes[0]).to.deep.equal({
      api: 'cyberia-map',
      method: 'get',
      path: '/cyberia-map/maps/{code}',
      guarded: true,
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
    expect(routes.find((route) => route.method === 'get' && route.path === '/cyberia-map').guarded).to.equal(false);
  });

  it('serves of a consumed API only the routes the host extension mounts', () => {
    const extension = { mount: (router, options) => router.get('/context/:id', options.authMiddleware, handler) };
    const router = registerCrudRoutes(express.Router(), crud, { authMiddleware });
    extension.mount(router, { authMiddleware });
    const consumes = { 'object-layer': 'object-layer' };

    expect(keys(ownRoutesOf('object-layer', router, { authMiddleware, consumes, extension }))).to.deep.equal([
      'get /object-layer/context/{id}',
    ]);
    expect(ownRoutesOf('object-layer', router, { authMiddleware, consumes })).to.deep.equal([]);
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
        { api: 'cyberia-map', method: 'put', path: '/cyberia-map/{id}', guarded: true },
        { api: 'cyberia-skill', method: 'get', path: '/cyberia-skill', guarded: false },
      ],
    });

    expect(document.paths['/cyberia-map/{id}'].put).to.deep.equal({
      tags: ['cyberia-map'],
      summary: 'Update a map',
      parameters: [],
      requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
      security: [{ bearerAuth: [] }],
      responses: { default: { description: 'Response of the route' } },
    });
    expect(document.paths['/cyberia-skill'].get).to.not.have.any.keys('requestBody', 'security');
    expect(document.tags).to.deep.equal([{ name: 'cyberia-map' }, { name: 'cyberia-skill' }]);
    expect(document.components).to.deep.equal({
      schemas: { map: { type: 'object' } },
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
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
        { api: 'user', method: 'post', path: '/user/{id}', guarded: false },
        { api: 'cyberia-player', method: 'get', path: '/cyberia-player/appearance/v1/{cids}', guarded: false },
      ],
    });

    expect(Object.keys(document.paths)).to.deep.equal([
      '/user/{id}',
      '/cyberia-player/appearance/v1/{cids}',
      '/user/auth',
    ]);
    expect(document.paths['/user/auth'].post).to.include({ summary: 'Log in' });
    expect(document.paths['/user/auth'].post.parameters).to.deep.equal([]);
  });

  it('keeps the first route of a method and path, as Express does', () => {
    const route = { api: 'user', method: 'get', path: '/user/{id}' };
    const document = apiDocumentFactory({
      host: 'docs.fixture.test',
      routes: [
        { ...route, guarded: true },
        { ...route, guarded: false },
      ],
    });

    expect(document.paths['/user/{id}'].get.security).to.deep.equal([{ bearerAuth: [] }]);
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
