'use strict';

/**
 * @module public-routes-browser.test
 * @description Drives the built Underpost PWA in a real browser against the real user, file and
 * document APIs on a real MongoDB: `/u/:username`, `/entry/:stableSlug` and `/content/:stableSlug`
 * through direct navigation, refresh, in-app navigation, back/forward, not-found and private
 * answers, copied share links, and a view stacked on top and closed again.
 *
 * Needs four things, and skips itself without any of them: the `puppeteer-core` driver, which is
 * not a declared dependency (`npm install --no-save puppeteer-core`), a Firefox binary
 * (`UNDERPOST_BROWSER_BIN`, or `firefox` on PATH), a `mongod` binary (see `test/support/mongod.js`),
 * and the Underpost client built at `public/underpost.net`
 * (`node bin client dd-cyberia '' underpost.net / --dev --lite-build`).
 *
 * Uses 'chai' for assertions.
 */

import nodePath from 'path';
import fs from 'fs-extra';
import express from 'express';
import { expect } from 'chai';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { applySecurity, authMiddlewareFactory } from '../../../src/server/security/auth.js';
import { publicRouteFallbackFactory } from '../../../src/server/network/middlewares.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { findBinary } from '../../support/binary.js';
import { apiPathOf } from '../../../src/server/domain/api-contract.js';

const puppeteer = await import('puppeteer-core').then((module) => module.default).catch(() => null);
const clientRoot = nodePath.resolve('public/underpost.net');
const browserBinary = findBinary('firefox', 'UNDERPOST_BROWSER_BIN');
const clientBuilt = fs.existsSync(nodePath.join(clientRoot, 'entry', 'index.html'));

const context = { host: 'underpost.net', path: '/' };
const apis = ['user', 'file', 'document'];

const listen = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
const close = (server) =>
  new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

const seed = async ({ User, File, Document }) => {
  const [alice, bob] = await User.create([
    {
      username: 'alice',
      email: 'alice@example.com',
      password: 'x',
      role: 'admin',
      publicProfile: true,
      briefDescription: 'Publishes the guides',
    },
    { username: 'bob', email: 'bob@example.com', password: 'x', role: 'user', publicProfile: false },
  ]);
  const markdown = (text) => {
    const data = Buffer.from(`# ${text}\n\nBody of ${text}.`);
    return File.create({ name: `${text}.md`, mimetype: 'text/markdown', data, size: data.length });
  };
  const guide = await Document.create({
    userId: alice._id,
    title: 'How to Chat With GPT?',
    tags: ['underpost-panel', 'guides'],
    isPublic: true,
    mdFileId: (await markdown('Chat guide'))._id,
  });
  const draft = await Document.create({
    userId: bob._id,
    title: 'Draft',
    tags: ['underpost-panel'],
    isPublic: false,
    mdFileId: (await markdown('Draft body'))._id,
  });
  return { alice, bob, guide, draft };
};

describe.skipIf(!puppeteer || !browserBinary || !mongodBinary || !clientBuilt)('public routes in the browser', () => {
  let mongod;
  let server;
  let baseUrl;
  let browser;
  let page;
  let seeded;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'public-routes-browser-secret';
    mongod = await startMongod('public-routes-browser');
    const provider = await DataBaseProviderService.load({
      ...context,
      apis,
      db: { provider: 'mongoose', host: mongod.host, name: 'public-routes-browser' },
    });
    await provider.models.Document.ensureStableSlugs();
    seeded = await seed(provider.models);

    // Same middleware order as the runtime (`src/runtime/express/Express.js`): the shell is served
    // like a static view, ahead of the security headers the API responses carry.
    const options = { ...context, apiPath: apiPathOf(context.path), authMiddleware: authMiddlewareFactory(context) };
    const app = express();
    app.use(express.json());
    app.use(express.static(clientRoot));
    app.use(publicRouteFallbackFactory({ root: clientRoot, path: '/' }));
    applySecurity(app, { origin: [] });
    for (const api of apis) {
      const { ApiRouter } = await import(`../../../src/api/${api}/${api}.router.js`);
      app.use(`${options.apiPath}/${api}`, ApiRouter({ ...options, app }));
    }
    app.use((req, res) => res.sendStatus(404));
    server = await listen(app);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    browser = await puppeteer.launch({ browser: 'firefox', executablePath: browserBinary, headless: true });
    page = await browser.newPage();
    // The share button writes the link to the clipboard, which a headless page cannot read back.
    await page.evaluateOnNewDocument(() => {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (text) => void window.__copied.push(text) },
        configurable: true,
      });
    });
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    if (server) await close(server);
    await DataBaseProviderService.getProvider(context)?.close?.();
    await mongod?.stop();
  });

  const open = async (path) => {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  };
  const pathname = () => page.evaluate(() => location.pathname);
  const textOf = (selector) => page.$eval(selector, (el) => el.textContent.trim());
  const waitForText = async (selector, text) => {
    await page.waitForFunction(
      (selector, text) => {
        const el = document.querySelector(selector);
        return !!el && el.textContent.includes(text);
      },
      { timeout: 20000 },
      selector,
      text,
    );
  };
  const waitForPath = (expected) =>
    page.waitForFunction((expected) => location.pathname === expected, { timeout: 20000 }, expected);
  // History traversal between pushState entries is same-document: no load event ever fires, so
  // puppeteer's own goBack/goForward, which wait for one, would hang.
  const goBack = () => page.evaluate(() => history.back());
  const goForward = () => page.evaluate(() => history.forward());

  describe('/u/:username', () => {
    it('renders the profile on direct navigation and keeps the path across a refresh', async () => {
      await open('/u/alice');
      await waitForText('.public-profile-alice-username', 'alice');
      expect(await textOf('.public-profile-alice-description')).to.equal('Publishes the guides');
      expect(await pathname()).to.equal('/u/alice');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForText('.public-profile-alice-username', 'alice');
      expect(await pathname()).to.equal('/u/alice');
    }, 30000);

    it('shows the not-found state for an unknown user and the private state for a private one', async () => {
      await open('/u/nonexistent');
      await waitForText('.public-profile-nonexistent-container-error-state', 'not');
      expect(await pathname()).to.equal('/u/nonexistent');
      await open('/u/bob');
      await waitForText('.public-profile-bob-container-error-state', 'rivate');
      expect(await pathname()).to.equal('/u/bob');
    }, 30000);
  });

  describe('/content/:stableSlug', () => {
    it('renders the document on direct navigation and after a refresh', async () => {
      await open('/content/how-to-chat-with-gpt');
      await waitForText('.title-modal-modal-content-how-to-chat-with-gpt', 'How to Chat With GPT?');
      await waitForText('.content-render-modal-content-how-to-chat-with-gpt', 'Body of Chat guide');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForText('.content-render-modal-content-how-to-chat-with-gpt', 'Body of Chat guide');
      expect(await pathname()).to.equal('/content/how-to-chat-with-gpt');
    }, 30000);

    it('shows the not-found state for an unknown slug and for another user’s private document', async () => {
      await open('/content/nonexistent');
      await waitForText('.error-modal-content-nonexistent', 'o result');
      await open('/content/draft');
      await waitForText('.error-modal-content-draft', 'o result');
      expect(await pathname()).to.equal('/content/draft');
    }, 30000);
  });

  describe('/entry/:stableSlug', () => {
    it('renders the single entry on direct navigation, then the listing after navigating home', async () => {
      await open('/entry/how-to-chat-with-gpt');
      await waitForText('.a-title-underpost-panel', 'How to Chat With GPT?');
      expect(await page.$$eval('.a-title-underpost-panel', (els) => els.length)).to.equal(1);
      expect(await page.$eval('.a-title-underpost-panel', (el) => el.getAttribute('href'))).to.equal(
        '/entry/how-to-chat-with-gpt',
      );
      expect(await pathname()).to.equal('/entry/how-to-chat-with-gpt');
    }, 30000);

    it('navigates from the listing to an entry, to its creator, and back and forward through history', async () => {
      await open('/');
      await waitForText('.a-title-underpost-panel', 'How to Chat With GPT?');
      await page.click('.a-title-underpost-panel');
      await waitForPath('/entry/how-to-chat-with-gpt');
      await page.waitForSelector(`.creator-profile-link-${seeded.guide._id}`, { timeout: 20000 });
      await page.click(`.creator-profile-link-${seeded.guide._id}`);
      await waitForPath('/u/alice');
      await waitForText('.public-profile-alice-username', 'alice');
      await goBack();
      await waitForPath('/entry/how-to-chat-with-gpt');
      await waitForText('.a-title-underpost-panel', 'How to Chat With GPT?');
      await goBack();
      await waitForPath('/');
      await goForward();
      await waitForPath('/entry/how-to-chat-with-gpt');
      await goForward();
      await waitForPath('/u/alice');
      await waitForText('.public-profile-alice-username', 'alice');
    }, 30000);

    it('copies the canonical entry URL as the share link', async () => {
      await open('/entry/how-to-chat-with-gpt');
      await waitForText('.a-title-underpost-panel', 'How to Chat With GPT?');
      await page.click(`.underpost-panel-btn-copy-share-${seeded.guide._id}`);
      await page.waitForFunction(() => window.__copied.length > 0, { timeout: 20000 });
      expect(await page.evaluate(() => window.__copied)).to.deep.equal([`${baseUrl}/entry/how-to-chat-with-gpt`]);
    }, 30000);

    it('keeps the entry path when a view opened on top of it is closed', async () => {
      await open('/entry/how-to-chat-with-gpt');
      await waitForText('.a-title-underpost-panel', 'How to Chat With GPT?');
      await page.evaluate(() => document.querySelector('.main-btn-settings').click());
      await waitForPath('/settings');
      await page.evaluate(() => document.querySelector('.btn-close-modal-settings').click());
      await waitForPath('/entry/how-to-chat-with-gpt');
      expect(await page.$$eval('.a-title-underpost-panel', (els) => els.length)).to.equal(1);
    }, 30000);

    it('restores each stacked view’s own path as views on top of it close', async () => {
      await open('/entry/how-to-chat-with-gpt');
      await waitForText('.a-title-underpost-panel', 'How to Chat With GPT?');
      await page.waitForSelector(`.creator-profile-link-${seeded.guide._id}`, { timeout: 20000 });
      await page.click(`.creator-profile-link-${seeded.guide._id}`);
      await waitForPath('/u/alice');
      await waitForText('.public-profile-alice-username', 'alice');
      await page.evaluate(() => document.querySelector('.main-btn-settings').click());
      await waitForPath('/settings');
      await page.evaluate(() => document.querySelector('.btn-close-modal-settings').click());
      await waitForPath('/u/alice');
      await page.evaluate(() => document.querySelector('.btn-close-modal-public-profile').click());
      await waitForPath('/entry/how-to-chat-with-gpt');
      expect(await page.$$eval('.a-title-underpost-panel', (els) => els.length)).to.equal(1);
    }, 30000);
  });
});
