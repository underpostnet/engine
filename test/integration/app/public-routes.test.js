'use strict';

/**
 * @module public-routes.test
 * @description Serves the dynamic public routes end to end over HTTP: the PWA shell fallback for
 * `/u/:username`, `/entry/:stableSlug` and `/content/:stableSlug` (direct navigation and refresh),
 * and the API lookups behind them — username for profiles, stable slug for both views of a
 * document — including not-found and visibility answers. Legacy `?cid=` identity is asserted gone.
 *
 * Models are in-memory stand-ins behind `DataBaseProviderService.getModel`.
 *
 * Uses 'chai' for assertions.
 */

import os from 'os';
import nodePath from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import express from 'express';
import { expect } from 'chai';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { DocumentRouter } from '../../../src/api/document/document.router.js';
import { UserController } from '../../../src/api/user/user.controller.js';
import { publicRouteFallbackFactory } from '../../../src/server/network/middlewares.js';
import { jwtSign } from '../../../src/server/security/auth.js';

const context = { host: 'public-routes.test', path: '/' };

const listen = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
const close = (server) =>
  new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
const request = (url, options = {}) => axios.get(url, { validateStatus: () => true, ...options });

const publisher = { _id: new Types.ObjectId(), username: 'alice', role: 'admin', email: 'alice@example.com' };
const writer = { _id: new Types.ObjectId(), username: 'bob', role: 'user', email: 'bob@example.com' };

const documents = [
  {
    _id: new Types.ObjectId(),
    title: 'How to Chat With GPT Efficiently',
    stableSlug: 'how-to-chat-with-gpt',
    tags: ['underpost-panel', 'guides'],
    isPublic: true,
    userId: publisher,
  },
  {
    _id: new Types.ObjectId(),
    title: 'Draft',
    stableSlug: 'draft',
    tags: ['underpost-panel'],
    isPublic: false,
    userId: writer,
  },
];

const users = [
  { _id: publisher._id, username: 'alice', publicProfile: true, briefDescription: 'Publisher' },
  { _id: writer._id, username: 'bob', publicProfile: false },
];

const thenable = (value, methods = []) => {
  const chain = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const method of methods) chain[method] = () => chain;
  return chain;
};

const matches = (doc, filter) =>
  Object.entries(filter).every(([key, value]) => (key === 'tags' ? doc.tags.includes(value) : doc[key] === value));

const publicListingQueries = [];

const models = {
  Document: {
    findOne: (filter) =>
      thenable(
        documents.find((doc) => matches(doc, filter)),
        ['populate', 'sort'],
      ),
    find: (filter) => {
      publicListingQueries.push(filter);
      return thenable([], ['sort', 'limit', 'skip', 'populate']);
    },
  },
  User: {
    find: async () => [publisher],
    findOne: (filter) => {
      const user = users.find((candidate) =>
        filter._id ? `${candidate._id}` === `${filter._id}` : candidate.username === filter.username,
      );
      return Object.assign(thenable(user, ['select']), {});
    },
  },
  File: {},
};

describe('dynamic public routes', () => {
  let server;
  let baseUrl;
  let shellRoot;
  let getModel;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'public-routes-test-secret';
    getModel = DataBaseProviderService.getModel;
    DataBaseProviderService.getModel = (name) => models[name];

    shellRoot = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'public-routes-'));
    for (const view of ['', 'u', 'content', 'peer/u'])
      await fs.outputFile(nodePath.join(shellRoot, view, 'index.html'), `<!doctype html><title>shell:${view}</title>`);

    const options = { ...context, authMiddleware: (req, res, next) => next() };
    const app = express();
    app.use(express.static(shellRoot));
    app.use(publicRouteFallbackFactory({ root: shellRoot, path: '/' }));
    app.use('/api/document', DocumentRouter.router(options));
    const userRouter = express.Router();
    userRouter.get('/username/:username', (req, res) => UserController.get(req, res, options));
    app.use('/api/user', userRouter);
    const peer = express();
    peer.use(publicRouteFallbackFactory({ root: shellRoot, path: '/peer' }));
    app.use(peer);
    app.use((req, res) => res.sendStatus(404));

    server = await listen(app);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    DataBaseProviderService.getModel = getModel;
    await close(server);
    await fs.remove(shellRoot);
  });

  describe('PWA shell fallback', () => {
    it('serves the namespace shell for a direct navigation or refresh', async () => {
      for (const [path, shell] of [
        ['/u/alice', 'shell:u'],
        ['/u/bob/', 'shell:u'],
        ['/content/how-to-chat-with-gpt', 'shell:content'],
        ['/peer/u/alice', 'shell:peer/u'],
      ]) {
        const res = await request(`${baseUrl}${path}`);
        expect(res.status, path).to.equal(200);
        expect(res.data, path).to.contain(shell);
      }
    });

    it('answers 404 for malformed parameters, extra segments and unbuilt namespaces', async () => {
      for (const path of [
        '/u/a',
        '/u/bad$name',
        '/u/alice/extra',
        '/content/Not_A_Slug',
        '/entry/how-to-chat-with-gpt',
      ])
        expect((await request(`${baseUrl}${path}`)).status, path).to.equal(404);
    });

    it('never serves a shell for API routes or non-GET requests', async () => {
      expect((await request(`${baseUrl}/api/document/slug/nonexistent`)).data.status).to.equal('error');
      const post = await axios.post(`${baseUrl}/u/alice`, {}, { validateStatus: () => true });
      expect(post.status).to.equal(404);
    });
  });

  describe('document lookup by stableSlug', () => {
    it('resolves a public document and hides its creator’s role and email', async () => {
      const res = await request(`${baseUrl}/api/document/slug/how-to-chat-with-gpt`);
      expect(res.status).to.equal(200);
      expect(res.data.data.title).to.equal('How to Chat With GPT Efficiently');
      expect(res.data.data.stableSlug).to.equal('how-to-chat-with-gpt');
      expect(res.data.data.userId.username).to.equal('alice');
      expect(res.data.data.userId).to.not.have.any.keys('role', 'email');
    });

    it('answers 404 for an unknown or malformed slug', async () => {
      for (const slug of ['nonexistent', 'Not_A_Slug', encodeURIComponent(`${documents[0]._id}`.toUpperCase())])
        expect((await request(`${baseUrl}/api/document/slug/${slug}`)).status, slug).to.equal(404);
    });

    it('answers 404 for a private document unless the owner asks', async () => {
      expect((await request(`${baseUrl}/api/document/slug/draft`)).status).to.equal(404);
      const token = jwtSign({ _id: `${writer._id}`, role: 'user' }, context, 5, 10);
      const owned = await request(`${baseUrl}/api/document/slug/draft`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(owned.status).to.equal(200);
      expect(owned.data.data.stableSlug).to.equal('draft');
    });

    it('scopes the lookup to a panel when one is named', async () => {
      const res = await request(`${baseUrl}/api/document/slug/how-to-chat-with-gpt?idPanel=underpost-panel`);
      expect(res.status).to.equal(200);
      expect(res.data.data.tags).to.deep.equal(['underpost-panel', 'guides']);
      for (const path of [
        '/slug/how-to-chat-with-gpt?idPanel=nexodev-blog',
        '/slug/how-to-chat-with-gpt?idPanel=underpost-panel&idPanel=guides',
        '/slug/nonexistent?idPanel=underpost-panel',
      ])
        expect((await request(`${baseUrl}/api/document${path}`)).status, path).to.equal(404);
    });

    it('no longer narrows the public listing by a cid query', async () => {
      publicListingQueries.length = 0;
      await request(`${baseUrl}/api/document/public?tags=underpost-panel&cid=${documents[0]._id}`);
      expect(publicListingQueries).to.have.length(1);
      expect(publicListingQueries[0]).to.not.have.property('_id');
    });
  });

  describe('profile lookup by username', () => {
    it('resolves a public profile', async () => {
      const res = await request(`${baseUrl}/api/user/username/alice`);
      expect(res.status).to.equal(200);
      expect(res.data.data.username).to.equal('alice');
    });

    it('answers 404 for an unknown or malformed username and 403 for a private profile', async () => {
      expect((await request(`${baseUrl}/api/user/username/nonexistent`)).status).to.equal(404);
      expect((await request(`${baseUrl}/api/user/username/a`)).status).to.equal(404);
      const privateProfile = await request(`${baseUrl}/api/user/username/bob`);
      expect(privateProfile.status).to.equal(403);
      expect(privateProfile.data.message).to.match(/private/);
    });
  });
});
