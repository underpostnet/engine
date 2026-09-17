'use strict';

/**
 * @module entry-metadata.test
 * @description Covers the entry metadata of `src/server/network/entry-metadata.js` as data: the
 * plain text a Markdown source reduces to, the description's sources in order, the social image
 * rule (the entry's own JPEG or PNG, else the site's, and only the entry's own in the structured
 * data), the canonical URL, the author, the `noindex` of what must not be indexed — and its
 * injection into a built shell, pretty or minified, without duplicating a head element or
 * breaking out of an attribute or a script.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import {
  DESCRIPTION_MAX_LENGTH,
  buildEntryMetadata,
  injectEntryMetadata,
  markdownToText,
  renderEntryHead,
  truncateText,
} from '../../src/server/network/entry-metadata.js';

const context = {
  origin: 'https://underpost.net',
  proxyPath: '/',
  apiBasePath: 'api',
  site: {
    title: 'Underpost Platform | Tech Lab',
    siteName: 'Underpost',
    description: 'Engineering logs.',
    thumbnail: 'assets/banner/underpost-social.jpg',
  },
};

const entry = (overrides = {}) => ({
  _id: 'doc1',
  title: 'How to Chat With GPT',
  stableSlug: 'how-to-chat-with-gpt',
  isPublic: true,
  createdAt: new Date('2026-01-02T03:04:05Z'),
  updatedAt: new Date('2026-01-03T06:07:08Z'),
  userId: { _id: 'u1', username: 'alice', publicProfile: true, briefDescription: 'Publisher' },
  ...overrides,
});

const shell = `<!DOCTYPE html>
<html>
  <head>
    <title>Underpost Platform | Tech Lab</title>
    <meta charset="UTF-8" />
    <link rel="canonical" href="https://underpost.net/entry/" />
    <meta name="author" content="https://github.com/underpostnet" />
    <meta name="keywords" content="tech,lab" />
    <meta name="description" content="Engineering logs." />
    <meta name="theme-color" content="#141414" />
    <meta property="og:title" content="Underpost Platform | Tech Lab" />
    <meta property="og:type" content="website" />
    <meta property="og:description" content="Engineering logs." />
    <meta property="og:image" content="/assets/banner/underpost-social.jpg" />
    <meta property="og:url" content="https://underpost.net/entry/" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body></body>
</html>`;

const metaContent = (html, attribute, key) => {
  const matches = [...html.matchAll(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`, 'g'))];
  return matches.length === 1 ? matches[0][1] : matches.map((match) => match[1]);
};
const jsonLd = (html) => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return scripts.length === 1 ? JSON.parse(scripts[0][1]) : scripts.map((match) => JSON.parse(match[1]));
};

describe('markdown to text', () => {
  it('keeps prose and drops headings, code, images, link targets, HTML and formatting', () => {
    const text = markdownToText(`---
title: front matter
---
# Heading

> A **bold** _intro_ with a [link](https://example.com) and \`code\`, an image ![alt](a.png).

\`\`\`js
const hidden = 1;
\`\`\`

- item one
- [x] item two
1. numbered

| a | b |
|---|:-:|
| c | d |

<div class="x">html <b>inside</b></div> &amp; snake_case_name stays ***strong***.
`);
    expect(text).to.equal(
      'A bold intro with a link and code, an image. item one item two numbered a b c d html inside & snake_case_name stays strong.',
    );
  });

  it('yields nothing for a source without prose', () => {
    expect(markdownToText('# Only\n\n## Headings\n\n```\ncode\n```\n\n---\n')).to.equal('');
    for (const source of ['', '   \n\n', null, undefined]) expect(markdownToText(source)).to.equal('');
  });

  it('collapses whitespace and line endings', () => {
    expect(markdownToText('one\r\ntwo\r\n\r\n   three\tfour')).to.equal('one two three four');
  });
});

describe('description truncation', () => {
  it('leaves a short text alone and cuts a long one at a word with an ellipsis', () => {
    expect(truncateText('short')).to.equal('short');
    const words = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
    const cut = truncateText(words);
    expect(cut.length).to.be.at.most(DESCRIPTION_MAX_LENGTH);
    expect(cut.endsWith('…')).to.equal(true);
    expect(cut.slice(0, -1).trim()).to.equal(cut.slice(0, -1));
    expect(words.startsWith(cut.slice(0, -1))).to.equal(true);
    expect(cut).to.not.match(/[,;:.!?-]…$/);
  });
});

describe('entry metadata', () => {
  it('titles the page with the entry and the site name and makes the canonical URL the entry path', () => {
    const metadata = buildEntryMetadata(entry(), context);
    expect(metadata.title).to.equal('How to Chat With GPT | Underpost');
    expect(metadata.headline).to.equal('How to Chat With GPT');
    expect(metadata.siteName).to.equal('Underpost');
    expect(metadata.type).to.equal('article');
    expect(metadata.canonicalUrl).to.equal('https://underpost.net/entry/how-to-chat-with-gpt');
    expect(metadata.jsonLd).to.include({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'How to Chat With GPT',
      url: 'https://underpost.net/entry/how-to-chat-with-gpt',
      datePublished: '2026-01-02T03:04:05.000Z',
      dateModified: '2026-01-03T06:07:08.000Z',
    });
    expect(metadata.jsonLd.mainEntityOfPage).to.deep.equal({
      '@type': 'WebPage',
      '@id': 'https://underpost.net/entry/how-to-chat-with-gpt',
    });
    expect(metadata.jsonLd.publisher).to.deep.equal({ '@type': 'Organization', name: 'Underpost' });
    expect(metadata.robots).to.equal(undefined);
  });

  it('capitalizes the first letter of the title everywhere it appears, and only that', () => {
    const metadata = buildEntryMetadata(entry({ title: '  how to chat with GPT ' }), context);
    expect(metadata.title).to.equal('How to chat with GPT | Underpost');
    expect(metadata.headline).to.equal('How to chat with GPT');
    expect(metadata.jsonLd.headline).to.equal('How to chat with GPT');
    expect(metadata.description).to.equal('How to chat with GPT');
  });

  it('falls back to the app title as the site name and honours a sub-path', () => {
    const metadata = buildEntryMetadata(entry(), {
      ...context,
      proxyPath: '/blog/',
      site: { title: 'PWA Demo App', thumbnail: 'android-chrome-384x384.png' },
    });
    expect(metadata.title).to.equal('How to Chat With GPT | PWA Demo App');
    expect(metadata.canonicalUrl).to.equal('https://underpost.net/blog/entry/how-to-chat-with-gpt');
    expect(metadata.image).to.deep.equal({
      url: 'https://underpost.net/blog/android-chrome-384x384.png',
      representative: false,
    });
    expect(metadata.author.url).to.equal('https://underpost.net/blog/u/alice');
  });

  it('describes the entry from its Markdown, else its title, else the site', () => {
    const markdown = '# How to Chat With GPT\n\nAsk **precise** questions, one at a time.\n\n```\nnot this\n```';
    expect(buildEntryMetadata(entry(), { ...context, markdown }).description).to.equal(
      'Ask precise questions, one at a time.',
    );
    expect(buildEntryMetadata(entry(), { ...context, markdown: '# Only a heading\n' }).description).to.equal(
      'How to Chat With GPT',
    );
    expect(buildEntryMetadata(entry({ title: '' }), context).description).to.equal('Engineering logs.');
    const long = buildEntryMetadata(entry(), { ...context, markdown: 'prose '.repeat(100) });
    expect(long.description.length).to.be.at.most(DESCRIPTION_MAX_LENGTH);
    expect(long.description.endsWith('…')).to.equal(true);
    expect(long.jsonLd.description).to.equal(long.description);
  });

  it('uses the entry image as the social and structured-data image only when it is a public JPEG or PNG', () => {
    for (const mimetype of ['image/jpeg', 'image/png']) {
      const metadata = buildEntryMetadata(entry({ fileId: { _id: 'f1', name: 'cover', mimetype } }), context);
      expect(metadata.image).to.deep.equal({ url: 'https://underpost.net/api/file/blob/f1', representative: true });
      expect(metadata.jsonLd.image).to.deep.equal(['https://underpost.net/api/file/blob/f1']);
    }
    for (const fileId of [
      undefined,
      null,
      'f1',
      { _id: 'f1', name: 'notes.pdf', mimetype: 'application/pdf' },
      { _id: 'f1', name: 'anim.gif', mimetype: 'image/gif' },
      { _id: 'f1', name: 'photo.webp', mimetype: 'image/webp' },
    ]) {
      const metadata = buildEntryMetadata(entry({ fileId }), context);
      expect(metadata.image, JSON.stringify(fileId)).to.deep.equal({
        url: 'https://underpost.net/assets/banner/underpost-social.jpg',
        representative: false,
      });
      expect(metadata.jsonLd, JSON.stringify(fileId)).to.not.have.property('image');
    }
    expect(buildEntryMetadata(entry(), { ...context, site: { title: 'x' } })).to.not.have.property('image');
  });

  it('names the author from the public creator and links a public profile only', () => {
    expect(buildEntryMetadata(entry(), context).author).to.deep.equal({
      name: 'alice',
      url: 'https://underpost.net/u/alice',
    });
    expect(buildEntryMetadata(entry(), context).jsonLd.author).to.deep.equal({
      '@type': 'Person',
      name: 'alice',
      url: 'https://underpost.net/u/alice',
    });
    const hidden = buildEntryMetadata(
      entry({ userId: { _id: 'u1', username: 'alice', publicProfile: false, email: 'a@x.y', role: 'admin' } }),
      context,
    );
    expect(hidden.author).to.deep.equal({ name: 'alice' });
    expect(JSON.stringify(hidden)).to.not.match(/a@x\.y|admin/);
    for (const userId of [undefined, null, 'u1', { role: undefined, email: undefined }]) {
      const metadata = buildEntryMetadata(entry({ userId }), context);
      expect(metadata).to.not.have.property('author');
      expect(metadata.jsonLd).to.not.have.property('author');
    }
  });

  it('marks a private entry noindex, and describes nothing of an unresolved one', () => {
    const owned = buildEntryMetadata(entry({ isPublic: false, fileId: { _id: 'f1', mimetype: 'image/png' } }), context);
    expect(owned.robots).to.equal('noindex');
    expect(owned.title).to.equal('How to Chat With GPT | Underpost');
    expect(owned.image.representative).to.equal(false);
    expect(owned.jsonLd).to.not.have.property('image');
    for (const document of [null, undefined])
      expect(buildEntryMetadata(document, context)).to.deep.equal({ robots: 'noindex' });
  });

  it('dates an entry by what it has, never by a missing timestamp', () => {
    const undated = buildEntryMetadata(entry({ createdAt: null, updatedAt: undefined }), context);
    expect(undated).to.not.have.any.keys('datePublished', 'dateModified');
    expect(undated.jsonLd).to.not.have.any.keys('datePublished', 'dateModified');
    const created = buildEntryMetadata(entry({ createdAt: '2026-02-01T00:00:00Z', updatedAt: null }), context);
    expect(created.datePublished).to.equal('2026-02-01T00:00:00.000Z');
    expect(created.dateModified).to.equal('2026-02-01T00:00:00.000Z');
  });
});

describe('entry head injection', () => {
  it('replaces the shell’s title, description, canonical and Open Graph elements exactly once', () => {
    const metadata = buildEntryMetadata(entry({ fileId: { _id: 'f1', mimetype: 'image/jpeg' } }), {
      ...context,
      markdown: 'Ask precise questions.',
    });
    const html = injectEntryMetadata(shell, metadata);
    expect(html.match(/<title>/g)).to.have.length(1);
    expect(html).to.contain('<title>How to Chat With GPT | Underpost</title>');
    expect(html.match(/rel="canonical"/g)).to.have.length(1);
    expect(html).to.contain('<link rel="canonical" href="https://underpost.net/entry/how-to-chat-with-gpt">');
    expect(metaContent(html, 'name', 'description')).to.equal('Ask precise questions.');
    expect(metaContent(html, 'name', 'author')).to.equal('alice');
    expect(metaContent(html, 'name', 'robots')).to.deep.equal([]);
    expect(metaContent(html, 'property', 'og:type')).to.equal('article');
    expect(metaContent(html, 'property', 'og:site_name')).to.equal('Underpost');
    expect(metaContent(html, 'property', 'og:title')).to.equal('How to Chat With GPT');
    expect(metaContent(html, 'property', 'og:description')).to.equal('Ask precise questions.');
    expect(metaContent(html, 'property', 'og:url')).to.equal('https://underpost.net/entry/how-to-chat-with-gpt');
    expect(metaContent(html, 'property', 'og:image')).to.equal('https://underpost.net/api/file/blob/f1');
    expect(metaContent(html, 'property', 'article:published_time')).to.equal('2026-01-02T03:04:05.000Z');
    expect(metaContent(html, 'property', 'article:modified_time')).to.equal('2026-01-03T06:07:08.000Z');
    expect(jsonLd(html)['@type']).to.equal('BlogPosting');
    // Site-level elements the entry does not speak for stay as built.
    expect(metaContent(html, 'name', 'keywords')).to.equal('tech,lab');
    expect(metaContent(html, 'name', 'theme-color')).to.equal('#141414');
    expect(metaContent(html, 'name', 'twitter:card')).to.equal('summary_large_image');
    expect(html).to.contain('<meta charset="UTF-8" />');
    expect(html.indexOf('</head>')).to.be.greaterThan(html.indexOf('application/ld+json'));
  });

  it('injects the same elements into a minified shell', () => {
    const minified = shell
      .replace(/\n\s*/g, '')
      .replace(/ \/>/g, '>')
      .replace(/<meta property="og:image"/, '<meta property="og:image:width" content="1200"><meta property="og:image"');
    const html = injectEntryMetadata(minified, buildEntryMetadata(entry(), context));
    expect(html.match(/<title>/g)).to.have.length(1);
    expect(html).to.contain('<title>How to Chat With GPT | Underpost</title>');
    expect(html.match(/rel="canonical"/g)).to.have.length(1);
    expect(html.match(/property="og:image/g)).to.have.length(1);
    expect(metaContent(html, 'property', 'og:image')).to.equal(
      'https://underpost.net/assets/banner/underpost-social.jpg',
    );
    expect(html.match(/name="description"/g)).to.have.length(1);
    expect(metaContent(html, 'property', 'og:type')).to.equal('article');
    expect(html.match(/<\/head>/g)).to.have.length(1);
  });

  it('escapes the entry’s text in attributes, the title and the JSON-LD script', () => {
    const hostile = entry({
      title: 'Tom & Jerry <script>alert(1)</script> "quoted"',
      userId: { _id: 'u1', username: 'alice', publicProfile: true },
    });
    const html = injectEntryMetadata(shell, buildEntryMetadata(hostile, { ...context, markdown: '</script><b>x</b>' }));
    expect(html).to.not.contain('<script>alert');
    expect(html).to.contain(
      '<title>Tom &amp; Jerry &lt;script&gt;alert(1)&lt;/script&gt; &quot;quoted&quot; | Underpost</title>',
    );
    expect(metaContent(html, 'property', 'og:title')).to.equal(
      'Tom &amp; Jerry &lt;script&gt;alert(1)&lt;/script&gt; &quot;quoted&quot;',
    );
    const script = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
    expect(script).to.not.contain('</');
    expect(JSON.parse(script).headline).to.equal('Tom & Jerry <script>alert(1)</script> "quoted"');
    expect(JSON.parse(script).description).to.equal('x');
  });

  it('only adds a noindex directive for an unresolved entry, keeping the shell’s own head', () => {
    const html = injectEntryMetadata(shell, buildEntryMetadata(null, context));
    expect(metaContent(html, 'name', 'robots')).to.equal('noindex');
    expect(html).to.contain('<title>Underpost Platform | Tech Lab</title>');
    expect(html).to.contain('<link rel="canonical" href="https://underpost.net/entry/" />');
    expect(metaContent(html, 'property', 'og:type')).to.equal('website');
    expect(html).to.not.contain('application/ld+json');
    expect(injectEntryMetadata(html, buildEntryMetadata(null, context)).match(/name="robots"/g)).to.have.length(1);
  });

  it('renders no element for a field the metadata leaves out', () => {
    expect(renderEntryHead({ robots: 'noindex' })).to.equal('<meta name="robots" content="noindex">');
    expect(renderEntryHead({})).to.equal('');
  });
});
