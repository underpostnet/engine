'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  DOCS_CATEGORIES,
  DOCS_ROOT,
  anchorsOf,
  docsDocumentsFactory,
  docsNavigationFactory,
  docsProblemsFactory,
} from '../../../src/server/build/docs.js';

// The documentation quality gate: the tree is the information architecture, so a document that
// does not fit it, or a link that resolves to nothing, fails here rather than in a browser.
const documents = () => docsDocumentsFactory({ references: [DOCS_ROOT] });

/** The domains the ecosystem documents, and the categories each one is allowed. */
const DOMAINS = {
  ecosystem: ['architecture'],
  'object-layer': ['overview', 'explanation', 'how-to', 'reference'],
  'item-ledger': ['overview', 'explanation', 'how-to', 'reference'],
  cyberia: ['overview', 'explanation', 'how-to', 'reference'],
  cryptokoyn: ['overview', 'explanation', 'how-to', 'reference'],
  nexodev: ['overview', 'explanation', 'how-to', 'reference'],
  underpost: ['overview', 'engineering-journal', 'lab-notes', 'adr'],
};

describe('documentation architecture', () => {
  it('carries no structural problem and no broken internal link', () => {
    const problems = docsProblemsFactory(documents());
    const report = problems.map(({ document, problem }) => `${document} ${problem}`).join('\n');
    expect(problems, report).to.have.lengthOf(0);
  });

  it('documents every ecosystem domain, each in its own directory', () => {
    const domains = new Set(documents().map((document) => document.domain));
    expect([...domains].sort()).to.deep.equal(Object.keys(DOMAINS).sort());
  });

  it('keeps every document in a category its domain uses', () => {
    for (const document of documents())
      expect(DOMAINS[document.domain], `${document.path} is in ${document.category}`).to.include(document.category);
  });

  it('gives every product domain an overview, and the engineering domain its own categories', () => {
    const byDomain = {};
    for (const document of documents()) (byDomain[document.domain] ??= []).push(document);
    for (const domain of Object.keys(DOMAINS)) {
      if (domain === 'ecosystem') continue;
      expect(
        byDomain[domain].some((document) => document.category === 'overview' && document.slug === 'index'),
        `${domain} has an overview`,
      ).to.equal(true);
    }
    const underpost = new Set(byDomain.underpost.map((document) => document.category));
    for (const category of ['engineering-journal', 'lab-notes', 'adr']) expect(underpost).to.include(category);
  });

  it('states the identity and maturity of every domain exactly once', () => {
    const navigation = docsNavigationFactory(documents());
    expect(navigation.domains.map((domain) => domain.id)).to.have.lengthOf(Object.keys(DOMAINS).length);
    for (const domain of navigation.domains) {
      expect(domain.identity, `${domain.id} identity`).to.be.a('string').that.is.not.empty;
      expect(domain.index, `${domain.id} index`).to.be.a('string').that.is.not.empty;
      if (domain.id !== 'ecosystem')
        expect(domain.maturity, `${domain.id} maturity`).to.be.a('string').that.is.not.empty;
    }
  });

  it('reaches every document from the navigation, and nothing else', () => {
    const navigation = docsNavigationFactory(documents());
    const reachable = navigation.domains
      .flatMap((domain) => domain.categories.flatMap((category) => category.documents.map((d) => d.path)))
      .sort();
    const all = documents()
      .map((document) => `${document.domain}/${document.category}/${document.slug}`)
      .sort();
    expect(reachable).to.deep.equal(all);
  });

  it('names every category it groups documents under', () => {
    const navigation = docsNavigationFactory(documents());
    for (const domain of navigation.domains)
      for (const category of domain.categories)
        expect(DOCS_CATEGORIES[category.id], category.id).to.equal(category.title);
  });

  it('publishes each document at the path its identity gives it', () => {
    for (const document of documents())
      expect(document.url).to.equal(`docs/${document.domain}/${document.category}/${document.slug}.md`);
  });

  it('leaves no document outside the tree and no empty category directory', () => {
    const stray = fs
      .readdirSync('./src/client/public', { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /-docs$/.test(entry.name))
      .map((entry) => entry.name);
    expect(stray, 'documentation lives under one root').to.deep.equal([]);

    for (const domain of Object.keys(DOMAINS))
      for (const entry of fs.readdirSync(`${DOCS_ROOT}/${domain}`, { withFileTypes: true }))
        if (entry.isDirectory())
          expect(
            fs.readdirSync(`${DOCS_ROOT}/${domain}/${entry.name}`).length,
            `${domain}/${entry.name} holds documents`,
          ).to.be.greaterThan(0);
  });
});

describe('documentation validator', () => {
  let root;
  const write = (path, text) => fs.outputFileSync(`${root}/${path}`, text);
  const problems = () =>
    docsProblemsFactory(docsDocumentsFactory({ references: [root] }, { root })).map(({ problem }) => problem);

  beforeEach(() => {
    root = fs.mkdtempSync('/tmp/engine-docs-gate-');
    write('alpha/overview/index.md', '---\ndomain: Alpha\nidentity: A domain\n---\n\n# Alpha\n\n## Scope\n');
  });

  afterEach(() => fs.removeSync(root));

  it('accepts a sound tree', () => {
    write('alpha/reference/api.md', '# API\n\nSee [the scope](../overview/index.md#scope).\n');
    expect(problems()).to.deep.equal([]);
  });

  it('reports a link to a document that does not exist', () => {
    write('alpha/reference/api.md', '# API\n\n[gone](../how-to/gone.md)\n');
    expect(problems()).to.deep.equal(['links to "../how-to/gone.md", which resolves to no document']);
  });

  it('reports an anchor the target does not carry', () => {
    write('alpha/reference/api.md', '# API\n\n[scope](../overview/index.md#missing)\n');
    expect(problems()).to.deep.equal(['links to "../overview/index.md#missing", and the target has no such heading']);
  });

  it('reports a link to a source file, which the site does not serve', () => {
    write('alpha/reference/api.md', '# API\n\n[code](../../src/cli/index.js)\n');
    expect(problems()[0]).to.match(/which is not a document/);
  });

  it('reports a document without exactly one title, ignoring comments in code', () => {
    write('alpha/how-to/run.md', '# Run\n\n```bash\n# a comment, not a title\n```\n\n# Second title\n');
    expect(problems()).to.deep.equal(['has 2 top-level titles, and needs exactly one']);
  });

  it('reports an unknown category and a slug a URL cannot carry', () => {
    write('alpha/misc/Notes File.md', '# Notes\n');
    expect(problems()).to.include.members([
      'is in unknown category "misc"',
      'has a slug a URL cannot carry: "Notes File"',
    ]);
  });

  it('reports a domain that never declares itself', () => {
    write('beta/overview/index.md', '# Beta\n');
    expect(problems()).to.deep.equal(['is declared by 0 documents, and needs exactly one carrying `domain:`']);
  });

  it('reads a title as text, so no markup reaches the navigation', () => {
    write('alpha/reference/api.md', '# The `alpha` **API**\n');
    const document = docsDocumentsFactory({ references: [root] }, { root }).find((found) => found.slug === 'api');
    expect(document.title).to.equal('The alpha API');
  });

  it('reads anchors the way the renderer writes them', () => {
    expect(anchorsOf('# `cyberia ol` — object layer\n## Fountain & Sink\n## Scope\n## Scope\n')).to.deep.equal([
      'cyberia-ol--object-layer',
      'fountain--sink',
      'scope',
      'scope-1',
    ]);
  });
});
