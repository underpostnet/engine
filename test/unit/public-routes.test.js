'use strict';

/**
 * @module public-routes.test
 * @description Covers the shared public route table in `src/client/components/core/CommonJs.js` —
 * the parsing and generation of `/u/:username`, `/entry/:stableSlug` and `/content/:stableSlug`
 * that the client router and the server's PWA fallback both read — and the server's stable slug
 * derivation with its deterministic collision candidates. What is asserted here is what keeps a
 * generated link and a resolved path the same URL.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import {
  STABLE_SLUG_MAX_LENGTH,
  isValidStableSlug,
  isValidUsername,
  parsePublicRoute,
  publicRoutePathFactory,
} from '../../src/client/components/core/CommonJs.js';
import { stableSlugCandidate, stableSlugFactory } from '../../src/api/document/document.model.js';

describe('stable slug derivation', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(stableSlugFactory('How to Chat With GPT')).to.equal('how-to-chat-with-gpt');
    expect(stableSlugFactory('  spaced   out\ttitle\n')).to.equal('spaced-out-title');
  });

  it('drops punctuation without leaving stray separators', () => {
    expect(stableSlugFactory('How to Chat With GPT?')).to.equal('how-to-chat-with-gpt');
    expect(stableSlugFactory('C++ / Node.js: a -- guide!!')).to.equal('c-node-js-a-guide');
    expect(stableSlugFactory("Don't stop — ever")).to.equal('dont-stop-ever');
  });

  it('folds diacritics and letters Unicode normalization leaves whole', () => {
    expect(stableSlugFactory('Ñandú Crème brûlée')).to.equal('nandu-creme-brulee');
    expect(stableSlugFactory('Straße Ærø Łódź')).to.equal('strasse-aero-lodz');
  });

  it('falls back deterministically when nothing URL-safe remains', () => {
    for (const title of ['', '   ', '!!!', '你好', null, undefined])
      expect(stableSlugFactory(title)).to.equal('untitled');
  });

  it('bounds a long title to the segment length without a trailing separator', () => {
    const slug = stableSlugFactory(`${'word '.repeat(40)}end`);
    expect(slug.length).to.be.at.most(STABLE_SLUG_MAX_LENGTH);
    expect(isValidStableSlug(slug)).to.equal(true);
  });

  it('always yields a slug the route validator accepts', () => {
    for (const title of ['How to Chat With GPT?', 'Ñandú', '', 'x'.repeat(300), '--a--'])
      expect(isValidStableSlug(stableSlugFactory(title))).to.equal(true);
  });
});

describe('stable slug collision candidates', () => {
  it('keeps the base first, then numbers from 2', () => {
    expect([1, 2, 3].map((attempt) => stableSlugCandidate('how-to-chat-with-gpt', attempt))).to.deep.equal([
      'how-to-chat-with-gpt',
      'how-to-chat-with-gpt-2',
      'how-to-chat-with-gpt-3',
    ]);
  });

  it('truncates the base so a suffixed candidate still fits and validates', () => {
    const base = stableSlugFactory('a'.repeat(STABLE_SLUG_MAX_LENGTH));
    const candidate = stableSlugCandidate(base, 12);
    expect(candidate.length).to.equal(STABLE_SLUG_MAX_LENGTH);
    expect(candidate.endsWith('-12')).to.equal(true);
    expect(isValidStableSlug(candidate)).to.equal(true);
  });
});

describe('public route parsing', () => {
  it('resolves each namespace to its named parameter', () => {
    expect(parsePublicRoute('/u/alice')).to.deep.equal({
      name: 'profile',
      namespace: 'u',
      params: { username: 'alice' },
    });
    expect(parsePublicRoute('/entry/how-to-chat-with-gpt')).to.deep.equal({
      name: 'entry',
      namespace: 'entry',
      params: { stableSlug: 'how-to-chat-with-gpt' },
    });
    expect(parsePublicRoute('/content/how-to-chat-with-gpt/')).to.deep.equal({
      name: 'content',
      namespace: 'content',
      params: { stableSlug: 'how-to-chat-with-gpt' },
    });
  });

  it('resolves under a proxy sub-path', () => {
    expect(parsePublicRoute('/peer/u/bob', '/peer/')?.params).to.deep.equal({ username: 'bob' });
    expect(parsePublicRoute('/u/bob', '/peer/')).to.equal(null);
  });

  it('rejects paths that are not exactly a namespace and one valid parameter', () => {
    for (const path of [
      '/u',
      '/u/',
      '/u/alice/extra',
      '/settings/alice',
      '/content/Not_A_Slug',
      '/entry/trailing-',
      '/u/bad$name',
      '/u/a',
      '/u/%E0%A4%A',
      `/entry/${'a'.repeat(STABLE_SLUG_MAX_LENGTH + 1)}`,
    ])
      expect(parsePublicRoute(path), path).to.equal(null);
  });

  it('identifies nothing from the query string', () => {
    expect(parsePublicRoute('/u?cid=alice')).to.equal(null);
    expect(parsePublicRoute('/content')).to.equal(null);
  });
});

describe('public route generation', () => {
  it('builds canonical paths that parse back to the same parameter', () => {
    for (const [name, value, param] of [
      ['profile', 'alice', 'username'],
      ['entry', 'how-to-chat-with-gpt', 'stableSlug'],
      ['content', 'how-to-chat-with-gpt', 'stableSlug'],
    ]) {
      const path = publicRoutePathFactory(name, value, '/peer/');
      expect(parsePublicRoute(path, '/peer/')?.params[param]).to.equal(value);
    }
    expect(publicRoutePathFactory('entry', 'how-to-chat-with-gpt')).to.equal('/entry/how-to-chat-with-gpt');
  });

  it('refuses an invalid parameter or an unknown route', () => {
    expect(publicRoutePathFactory('entry', undefined)).to.equal(null);
    expect(publicRoutePathFactory('entry', '65f0c0ffee0000000000abcd'.toUpperCase())).to.equal(null);
    expect(publicRoutePathFactory('profile', '../etc')).to.equal(null);
    expect(publicRoutePathFactory('unknown', 'value')).to.equal(null);
  });

  it('validates usernames with the model rules', () => {
    expect(isValidUsername('alice_01')).to.equal(true);
    expect(isValidUsername('a')).to.equal(false);
    expect(isValidUsername('x'.repeat(21))).to.equal(false);
    expect(isValidUsername('bad name')).to.equal(false);
  });
});
