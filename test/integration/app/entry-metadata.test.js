'use strict';

/**
 * @module entry-metadata.test
 * @description Serves `/entry/:stableSlug` end to end over HTTP and reads the raw initial HTML —
 * never a hydrated DOM — for the entry's title, description, canonical, Open Graph, article and
 * JSON-LD metadata: an entry with a JPEG, with a PNG, without an image, with Markdown content,
 * without usable text, a private entry (to an anonymous requester and to its owner), a missing
 * slug, and a Markdown source over the size cap. The `og:image` of every served entry is then
 * fetched from the same server. The API lookup and the other public routes are checked to be
 * untouched.
 *
 * Models are in-memory stand-ins behind `DataBaseProviderService.getModel`; the file API is the
 * real one, so the image URL the head names is the one the blob endpoint answers.
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
import { FileRouter } from '../../../src/api/file/file.router.js';
import { publicRouteFallbackFactory } from '../../../src/server/network/middlewares.js';
import { TEXT_SOURCE_MAX_BYTES, entryShellRendererFactory } from '../../../src/server/network/entry-metadata.js';
import { jwtSign } from '../../../src/server/security/auth.js';

const context = { host: 'entry-metadata.test', path: '/' };

const listen = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
const close = (server) =>
  new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
const request = (url, options = {}) => axios.get(url, { validateStatus: () => true, ...options });

const publisher = {
  _id: new Types.ObjectId(),
  username: 'alice',
  role: 'admin',
  email: 'alice@example.com',
  publicProfile: true,
  briefDescription: 'Publisher',
};
const writer = {
  _id: new Types.ObjectId(),
  username: 'bob',
  role: 'user',
  email: 'bob@example.com',
  publicProfile: false,
};

// Minimal valid image bytes: what a preview service would decode from the blob endpoint.
const JPEG_BYTES = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082',
  'hex',
);

const file = (name, mimetype, data) => ({ _id: new Types.ObjectId(), name, mimetype, data, size: data.length });
const markdown = (name, text) => file(name, 'text/markdown', Buffer.from(text));

const files = {
  cover: file('cover.jpg', 'image/jpeg', JPEG_BYTES),
  diagram: file('diagram.png', 'image/png', PNG_BYTES),
  notes: file('notes.pdf', 'application/pdf', Buffer.from('%PDF-1.4')),
  guide: markdown(
    'guide.md',
    '# How to Chat With GPT\n\nAsk **precise** questions, [one](https://example.com) at a time.\n\n```\nignored\n```\n',
  ),
  headingsOnly: markdown('headings.md', '# Title\n\n## Section\n\n```js\nconst x = 1;\n```\n'),
  draft: markdown('draft.md', '# Draft\n\nSecret body of the draft.\n'),
  huge: { ...markdown('huge.md', 'This text is never read. '), size: TEXT_SOURCE_MAX_BYTES + 1 },
  secret: file('secret.png', 'image/png', PNG_BYTES),
};

const document = (overrides) => ({
  _id: new Types.ObjectId(),
  tags: ['underpost-panel'],
  isPublic: true,
  userId: publisher,
  createdAt: new Date('2026-01-02T03:04:05Z'),
  updatedAt: new Date('2026-01-03T06:07:08Z'),
  share: { copyShareLinkEvent: [] },
  ...overrides,
});

const documents = [
  document({
    title: 'How to Chat With GPT',
    stableSlug: 'how-to-chat-with-gpt',
    fileId: files.cover,
    mdFileId: files.guide,
  }),
  document({ title: 'deploy diagram', stableSlug: 'deploy-diagram', fileId: files.diagram }),
  document({ title: 'Release Notes', stableSlug: 'release-notes', fileId: files.notes, mdFileId: files.headingsOnly }),
  document({
    title: 'Plain "Entry" & Co',
    stableSlug: 'plain-entry',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: undefined,
  }),
  document({ title: 'Long Read', stableSlug: 'long-read', mdFileId: files.huge }),
  document({
    title: 'Draft',
    stableSlug: 'draft',
    isPublic: false,
    userId: writer,
    fileId: files.secret,
    mdFileId: files.draft,
  }),
];

const site = {
  title: 'Underpost Platform | Tech Lab for Infrastructure, Orchestration and Runtime',
  siteName: 'Underpost',
  description: 'Engineering logs and system development for Underpost Platform.',
  thumbnail: 'assets/banner/underpost-social.png',
};

const thenable = (value, methods = []) => {
  const chain = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const method of methods) chain[method] = () => chain;
  return chain;
};

const sameId = (a, b) =>
  a !== undefined && a !== null && b !== undefined && b !== null && `${a._id ?? a}` === `${b._id ?? b}`;

const matchesDocument = (doc, filter) =>
  Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((clause) => matchesDocument(doc, clause));
    if (key === 'fileId' || key === 'mdFileId') return sameId(doc[key], value);
    if (key === 'tags') return doc.tags.includes(value);
    return doc[key] === value;
  });

const fileReads = [];

const models = {
  Document: {
    findOne: (filter) =>
      thenable(
        documents.find((doc) => matchesDocument(doc, filter)),
        ['populate', 'sort'],
      ),
    find: () => thenable([], ['sort', 'limit', 'skip', 'populate']),
  },
  File: {
    findOne: (filter) => {
      fileReads.push(filter);
      const found = Object.values(files).find((candidate) => sameId(candidate, filter._id));
      const underCap = !filter.size || !(found?.size > filter.size.$not.$gt);
      return thenable(found && underCap ? found : null, ['select']);
    },
  },
  User: {
    find: async () => [publisher],
    findOne: (filter) =>
      thenable(
        [publisher, writer].find((user) => sameId(user, filter._id)),
        ['select', 'lean'],
      ),
  },
};

const metaContent = (html, attribute, key) => {
  const matches = [...html.matchAll(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`, 'g'))];
  return matches.length === 1 ? matches[0][1] : matches.map((match) => match[1]);
};
const canonical = (html) => {
  const matches = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)];
  return matches.length === 1 ? matches[0][1] : matches.map((match) => match[1]);
};
const title = (html) => html.match(/<title>([^<]*)<\/title>/g).map((tag) => tag.slice(7, -8));
const jsonLd = (html) => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return scripts.length === 1 ? JSON.parse(scripts[0][1]) : scripts.map((match) => JSON.parse(match[1]));
};

describe('entry metadata over HTTP', () => {
  let server;
  let baseUrl;
  let shellRoot;
  let getModel;
  let ownerToken;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'entry-metadata-test-secret';
    getModel = DataBaseProviderService.getModel;
    DataBaseProviderService.getModel = (name) => models[name];
    ownerToken = jwtSign({ _id: `${writer._id}`, role: 'user' }, context, 5, 10);

    shellRoot = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'entry-metadata-'));
    const shell = (view) => `<!DOCTYPE html>
<html>
  <head>
    <title>${site.title}</title>
    <meta charset="UTF-8" />
    <script>
      window.renderPayload = JSON.parse(\`{"apiBasePath":"api","siteName":"Underpost"}\`);
    </script>
    <link rel="canonical" href="https://underpost.net${view}/" />
    <meta name="author" content="https://github.com/underpostnet" />
    <meta name="description" content="${site.description}" />
    <meta property="og:title" content="${site.title}" />
    <meta property="og:type" content="website" />
    <meta property="og:description" content="${site.description}" />
    <meta property="og:image" content="/${site.thumbnail}" />
    <meta property="og:url" content="https://underpost.net${view}/" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>shell:${view}</body>
</html>`;
    for (const view of ['', '/u', '/entry', '/content'])
      await fs.outputFile(nodePath.join(shellRoot, view, 'index.html'), shell(view));
    await fs.outputFile(nodePath.join(shellRoot, site.thumbnail), PNG_BYTES);

    const app = express();
    // The canonical origin is the server's own, so every URL the head names is fetched back here.
    server = await listen(app);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const options = { ...context, authMiddleware: (req, res, next) => next() };
    app.use(express.static(shellRoot));
    app.use(
      publicRouteFallbackFactory({
        root: shellRoot,
        path: '/',
        renderEntry: entryShellRendererFactory({ ...context, metadata: site, origin: baseUrl }),
      }),
    );
    app.use('/api/document', DocumentRouter.router(options));
    app.use('/api/file', FileRouter.router(options));
    app.use((req, res) => res.sendStatus(404));
  });

  afterAll(async () => {
    DataBaseProviderService.getModel = getModel;
    await close(server);
    await fs.remove(shellRoot);
  });

  const entry = async (slug, options = {}) => {
    const res = await request(`${baseUrl}/entry/${slug}`, options);
    expect(res.status, slug).to.equal(200);
    expect(res.headers['content-type'], slug).to.match(/^text\/html/);
    expect(res.data, slug).to.contain('shell:/entry');
    return res;
  };

  const expectReachableImage = async (url, mimetype, bytes) => {
    expect(url).to.match(/^http:\/\/127\.0\.0\.1:\d+\//);
    const res = await request(url, { responseType: 'arraybuffer' });
    expect(res.status, url).to.equal(200);
    expect(res.headers['content-type'], url).to.match(new RegExp(`^${mimetype}`));
    expect(Buffer.from(res.data).equals(bytes), url).to.equal(true);
  };

  it('describes a public entry with a JPEG in the initial HTML, image included', async () => {
    const { data: html, headers } = await entry('how-to-chat-with-gpt');
    expect(headers.vary).to.contain('Authorization');
    expect(headers['cache-control']).to.equal('public, max-age=0');
    expect(title(html)).to.deep.equal(['How to Chat With GPT | Underpost']);
    expect(metaContent(html, 'name', 'description')).to.equal('Ask precise questions, one at a time.');
    expect(canonical(html)).to.equal(`${baseUrl}/entry/how-to-chat-with-gpt`);
    expect(metaContent(html, 'property', 'og:type')).to.equal('article');
    expect(metaContent(html, 'property', 'og:site_name')).to.equal('Underpost');
    expect(metaContent(html, 'property', 'og:title')).to.equal('How to Chat With GPT');
    expect(metaContent(html, 'property', 'og:description')).to.equal('Ask precise questions, one at a time.');
    expect(metaContent(html, 'property', 'og:url')).to.equal(`${baseUrl}/entry/how-to-chat-with-gpt`);
    expect(metaContent(html, 'name', 'author')).to.equal('alice');
    expect(metaContent(html, 'property', 'article:published_time')).to.equal('2026-01-02T03:04:05.000Z');
    expect(metaContent(html, 'property', 'article:modified_time')).to.equal('2026-01-03T06:07:08.000Z');
    expect(metaContent(html, 'name', 'robots')).to.deep.equal([]);
    const image = metaContent(html, 'property', 'og:image');
    expect(image).to.equal(`${baseUrl}/api/file/blob/${files.cover._id}`);
    await expectReachableImage(image, 'image/jpeg', JPEG_BYTES);
    const data = jsonLd(html);
    expect(data).to.include({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'How to Chat With GPT',
      description: 'Ask precise questions, one at a time.',
      url: `${baseUrl}/entry/how-to-chat-with-gpt`,
      datePublished: '2026-01-02T03:04:05.000Z',
      dateModified: '2026-01-03T06:07:08.000Z',
    });
    expect(data.mainEntityOfPage).to.deep.equal({ '@type': 'WebPage', '@id': `${baseUrl}/entry/how-to-chat-with-gpt` });
    expect(data.author).to.deep.equal({ '@type': 'Person', name: 'alice', url: `${baseUrl}/u/alice` });
    expect(data.image).to.deep.equal([image]);
    // The shell's own site-level elements are replaced, not duplicated, and the page still boots.
    expect(html).to.not.contain('https://underpost.net/entry/');
    expect(html).to.not.contain('content="website"');
    expect(html).to.contain('window.renderPayload');
    expect(html).to.contain('<meta charset="UTF-8" />');
    expect(metaContent(html, 'name', 'twitter:card')).to.equal('summary_large_image');
  });

  it('uses a public PNG as the image and the capitalized title as the description without text', async () => {
    const { data: html } = await entry('deploy-diagram');
    expect(title(html)).to.deep.equal(['Deploy diagram | Underpost']);
    expect(metaContent(html, 'property', 'og:title')).to.equal('Deploy diagram');
    expect(metaContent(html, 'name', 'description')).to.equal('Deploy diagram');
    expect(jsonLd(html).headline).to.equal('Deploy diagram');
    const image = metaContent(html, 'property', 'og:image');
    expect(image).to.equal(`${baseUrl}/api/file/blob/${files.diagram._id}`);
    await expectReachableImage(image, 'image/png', PNG_BYTES);
    expect(jsonLd(html).image).to.deep.equal([image]);
  });

  it('falls back to the site image, and to the title, for an entry without usable image or text', async () => {
    const { data: html } = await entry('release-notes');
    expect(metaContent(html, 'name', 'description')).to.equal('Release Notes');
    expect(metaContent(html, 'property', 'og:description')).to.equal('Release Notes');
    const image = metaContent(html, 'property', 'og:image');
    expect(image).to.equal(`${baseUrl}/${site.thumbnail}`);
    await expectReachableImage(image, 'image/png', PNG_BYTES);
    expect(jsonLd(html)).to.not.have.property('image');
    expect(html).to.not.contain(`${files.notes._id}`);
  });

  it('escapes the entry title everywhere and dates a document without a modification time by its creation', async () => {
    const { data: html } = await entry('plain-entry');
    expect(title(html)).to.deep.equal(['Plain &quot;Entry&quot; &amp; Co | Underpost']);
    expect(metaContent(html, 'property', 'og:title')).to.equal('Plain &quot;Entry&quot; &amp; Co');
    expect(canonical(html)).to.equal(`${baseUrl}/entry/plain-entry`);
    expect(metaContent(html, 'property', 'og:image')).to.equal(`${baseUrl}/${site.thumbnail}`);
    const data = jsonLd(html);
    expect(data.headline).to.equal('Plain "Entry" & Co');
    expect(data.datePublished).to.equal('2026-02-01T00:00:00.000Z');
    expect(data.dateModified).to.equal('2026-02-01T00:00:00.000Z');
  });

  it('never reads a Markdown source over the size cap', async () => {
    fileReads.length = 0;
    const { data: html } = await entry('long-read');
    expect(metaContent(html, 'name', 'description')).to.equal('Long Read');
    expect(html).to.not.contain('never read');
    expect(fileReads).to.have.length(1);
    expect(fileReads[0].size).to.deep.equal({ $not: { $gt: TEXT_SOURCE_MAX_BYTES } });
  });

  it('answers a private entry to an anonymous requester exactly like a missing one, without indexing', async () => {
    const [draft, missing] = await Promise.all([entry('draft'), entry('nonexistent')]);
    expect(draft.data).to.equal(missing.data);
    for (const html of [draft.data, missing.data]) {
      expect(metaContent(html, 'name', 'robots')).to.equal('noindex');
      expect(title(html)).to.deep.equal([site.title]);
      expect(metaContent(html, 'name', 'description')).to.equal(site.description);
      expect(canonical(html)).to.equal('https://underpost.net/entry/');
      expect(metaContent(html, 'property', 'og:type')).to.equal('website');
      expect(html).to.not.contain('application/ld+json');
      expect(html).to.not.match(/Draft|Secret body|bob|draft\.md|secret\.png/);
      expect(html).to.not.contain(`${files.secret._id}`);
      expect(html).to.not.contain(`${files.draft._id}`);
    }
    expect((await request(`${baseUrl}/api/file/blob/${files.secret._id}`)).status).to.not.equal(200);
  });

  it('describes a private entry to its owner, still without indexing and without exposing its image', async () => {
    const { data: html, headers } = await entry('draft', { headers: { Authorization: `Bearer ${ownerToken}` } });
    expect(headers['cache-control']).to.equal('private, max-age=0');
    expect(title(html)).to.deep.equal(['Draft | Underpost']);
    expect(metaContent(html, 'name', 'robots')).to.equal('noindex');
    expect(metaContent(html, 'name', 'description')).to.equal('Secret body of the draft.');
    expect(canonical(html)).to.equal(`${baseUrl}/entry/draft`);
    expect(metaContent(html, 'property', 'og:image')).to.equal(`${baseUrl}/${site.thumbnail}`);
    expect(html).to.not.contain(`${files.secret._id}`);
    expect(jsonLd(html)).to.not.have.property('image');
    expect(jsonLd(html).author).to.deep.equal({ '@type': 'Person', name: 'bob' });
  });

  it('answers HEAD with the same headers and no body', async () => {
    const res = await axios.head(`${baseUrl}/entry/how-to-chat-with-gpt`, { validateStatus: () => true });
    expect(res.status).to.equal(200);
    expect(res.headers['content-type']).to.match(/^text\/html/);
    expect(res.data).to.equal('');
  });

  it('leaves the other public routes, malformed slugs and the API untouched', async () => {
    for (const [path, body] of [
      ['/u/alice', 'shell:/u'],
      ['/content/how-to-chat-with-gpt', 'shell:/content'],
    ]) {
      const res = await request(`${baseUrl}${path}`);
      expect(res.status, path).to.equal(200);
      expect(res.data, path).to.contain(body);
      expect(res.data, path).to.not.contain('application/ld+json');
      expect(title(res.data), path).to.deep.equal([site.title]);
    }
    for (const path of ['/entry/Not_A_Slug', '/entry/how-to-chat-with-gpt/extra'])
      expect((await request(`${baseUrl}${path}`)).status, path).to.equal(404);
    const api = await request(`${baseUrl}/api/document/slug/how-to-chat-with-gpt`);
    expect(api.status).to.equal(200);
    expect(api.data.data.title).to.equal('How to Chat With GPT');
    expect(api.data.data.userId.publicProfile).to.equal(true);
    expect(api.data.data.userId).to.not.have.any.keys('role', 'email');
  });
});
