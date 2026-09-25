/**
 * The documentation a client declares: the TypeDoc options its reference site is built with,
 * the reference documents that site carries, and which client owns the deploy root config.
 *
 * A client declares it in `conf.client.json` under `docs`, one block per client:
 *
 * - `typedoc` — options layered over the engine default {@link DEFAULT_TYPEDOC_CONFIG_PATH}.
 *   The default is the only TypeDoc file the engine keeps; a product overrides it here.
 * - `references` — documentation directories the client publishes. A directory is read to any
 *   depth, and only `.md` files are read. Under the documentation root, the path of a document
 *   is its identity: `<domain>/<category>/<slug>`.
 * - `coverage` — the reports the client publishes (see {@link module:src/server/build/coverage.js}).
 * - `api` — the API modules its OpenAPI document covers, out of the ones its instance serves.
 * - `canonical` — marks the one client whose options a product template writes to its root.
 *
 * @module src/server/build/docs.js
 * @namespace UnderpostDocs
 */

import fs from 'fs-extra';
import { marked } from 'marked';
import { anchorFactory } from '../../client/components/core/CommonJs.js';

/**
 * @constant DEFAULT_TYPEDOC_CONFIG_PATH
 * @description The engine TypeDoc config, relative to a source tree root. Every client
 * reference site starts from it and overrides only what its product changes.
 * @memberof UnderpostDocs
 */
const DEFAULT_TYPEDOC_CONFIG_PATH = './typedoc.json';

const normalizeDirectory = (directory) => `${directory ?? ''}`.replace(/\/+$/, '');

/**
 * @method typedocOptionsFactory
 * @description The TypeDoc options a client builds with: the default config, overridden by
 * the client `docs.typedoc` block.
 * @param {object} [options] - Resolution options.
 * @param {object} [options.docs] - The `docs` block of one `conf.client.json` client.
 * @param {string} [options.configPath] - The default config to layer over.
 * @returns {object|null} Merged options, or null when the default config is absent.
 * @memberof UnderpostDocs
 */
const typedocOptionsFactory = ({ docs = {}, configPath = DEFAULT_TYPEDOC_CONFIG_PATH } = {}) => {
  if (!fs.existsSync(configPath)) return null;
  return { ...JSON.parse(fs.readFileSync(configPath, 'utf8')), ...(docs?.typedoc ?? {}) };
};

/**
 * @constant DOCS_ROOT
 * @description The authored documentation tree. Every document under it carries its identity in
 * its path: the first segment is the domain, the second the category, the file stem the slug.
 * @memberof UnderpostDocs
 */
const DOCS_ROOT = './src/client/public/docs';

/**
 * @constant DOCS_CATEGORIES
 * @description The categories a domain may use. The product domains follow Diátaxis; the
 * engineering domain keeps its own three.
 * @memberof UnderpostDocs
 */
const DOCS_CATEGORIES = Object.freeze({
  overview: 'Overview',
  explanation: 'Explanation',
  'how-to': 'How-to',
  reference: 'Reference',
  architecture: 'Architecture',
  'engineering-journal': 'Engineering journal',
  'lab-notes': 'Lab notes',
  adr: 'ADR',
});

/** Order categories appear in, ahead of any not named here. */
const CATEGORY_ORDER = Object.keys(DOCS_CATEGORIES);

/** Reads the YAML-ish front matter of a document: flat `key: value` pairs, nothing nested. */
const frontMatterOf = (text) => {
  if (!text.startsWith('---\n')) return { data: {}, body: text };
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) return { data: {}, body: text };
  const data = {};
  for (const line of text.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0) data[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { data, body: text.slice(end + 5) };
};

/** A body with its fenced code removed: a `#` inside a fence is a comment, never a heading. */
const proseOf = (body) => body.replace(/^```[\s\S]*?^```/gm, '');

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** The text a heading renders to, which is what the renderer reads its anchor from. */
const renderedTextOf = (heading) =>
  marked
    .parseInline(heading)
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]);

/** The first `# ` heading of a body, as text: the title carries no markup into the navigation. */
const headingOf = (body) => {
  const heading = proseOf(body).match(/^#\s+(.+)$/m)?.[1];
  return heading ? renderedTextOf(heading.trim()).trim() : '';
};

const walkMarkdown = (root) => {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)))
      if (entry.isDirectory()) walk(`${directory}/${entry.name}`);
      else if (entry.name.toLowerCase().endsWith('.md')) found.push(`${directory}/${entry.name}`);
  };
  walk(root);
  return found;
};

/**
 * @typedef {object} DocsDocument
 * @property {string} path - Source path of the document.
 * @property {string} domain - Domain directory the document belongs to.
 * @property {string} category - Category directory the document belongs to.
 * @property {string} slug - File stem.
 * @property {string} title - Declared title, or the first heading.
 * @property {number} order - Position inside its category.
 * @property {object} data - The document's front matter.
 * @property {string} url - Public path the build publishes it at.
 * @memberof UnderpostDocs
 */

/**
 * @method docsDocumentsFactory
 * @description Every document a client declares, read to any depth, in path order. A document
 * outside the documentation root keeps an empty domain and category: it is published as a plain
 * reference and carries no place in the navigation.
 * @param {object} [docs] - The `docs` block of one `conf.client.json` client.
 * @param {object} [options]
 * @param {string} [options.root] - The documentation root identities are read against.
 * @returns {DocsDocument[]} Documents, in discovery order.
 * @memberof UnderpostDocs
 */
const docsDocumentsFactory = (docs = {}, { root: rootDirectory = DOCS_ROOT } = {}) => {
  const root = normalizeDirectory(rootDirectory);
  const documents = [];
  for (const directory of docs?.references ?? []) {
    const base = normalizeDirectory(directory);
    if (!base || !fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
    for (const path of walkMarkdown(base)) {
      const relative = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : '';
      const [domain = '', category = '', ...rest] = relative.split('/');
      const slug = (rest.length ? rest.join('-') : relative).replace(/\.md$/i, '');
      const { data, body } = frontMatterOf(fs.readFileSync(path, 'utf8'));
      documents.push({
        path,
        domain: rest.length ? domain : '',
        category: rest.length ? category : '',
        slug,
        title: data.title || headingOf(body),
        order: Number(data.order ?? 100),
        data,
        url: rest.length ? `docs/${domain}/${category}/${slug}.md` : `docs/references/${path.split('/').pop()}`,
      });
    }
  }
  return documents;
};

/**
 * @method docsReferencesFactory
 * @description The source paths of the documents a client declares, which is what TypeDoc takes
 * as its project documents.
 * @param {object} [docs] - The `docs` block of one `conf.client.json` client.
 * @returns {string[]} Document paths.
 * @memberof UnderpostDocs
 */
const docsReferencesFactory = (docs = {}) => docsDocumentsFactory(docs).map((document) => document.path);

/**
 * @method docsNavigationFactory
 * @description The navigation a set of documents makes: domains in declared order, each with its
 * categories and their documents. One document per domain declares the domain itself, carrying
 * its display name, its identity and its maturity.
 * @param {DocsDocument[]} [documents] - Documents, as {@link docsDocumentsFactory} returns them.
 * @returns {{domains: object[]}} The navigation tree.
 * @memberof UnderpostDocs
 */
const docsNavigationFactory = (documents = []) => {
  const domains = new Map();
  for (const document of documents) {
    if (!document.domain) continue;
    if (!domains.has(document.domain))
      domains.set(document.domain, { id: document.domain, title: document.domain, order: 100, categories: new Map() });
    const domain = domains.get(document.domain);
    if (document.data.domain) {
      domain.title = document.data.domain;
      domain.identity = document.data.identity ?? '';
      domain.maturity = document.data.maturity ?? '';
      domain.order = Number(document.data.order ?? domain.order);
      domain.index = `${document.domain}/${document.category}/${document.slug}`;
    }
    if (!domain.categories.has(document.category))
      domain.categories.set(document.category, {
        id: document.category,
        title: DOCS_CATEGORIES[document.category] ?? document.category,
        documents: [],
      });
    domain.categories.get(document.category).documents.push({
      slug: document.slug,
      title: document.title,
      order: document.order,
      url: document.url,
      path: `${document.domain}/${document.category}/${document.slug}`,
    });
  }
  return {
    domains: [...domains.values()]
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      .map((domain) => ({
        ...domain,
        categories: [...domain.categories.values()]
          .sort((a, b) => CATEGORY_ORDER.indexOf(a.id) - CATEGORY_ORDER.indexOf(b.id))
          .map((category) => ({
            ...category,
            documents: category.documents.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
          })),
      })),
  };
};

/** The anchors a document's headings render with, in reading order. */
const anchorsOf = (body) => {
  const anchor = anchorFactory();
  return [...proseOf(body).matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => anchor(renderedTextOf(match[1])));
};

/** Every `](target)` of a body, with the angle-bracket form an authored path with spaces uses. */
const linksOf = (body) => [...body.matchAll(/\]\(<?([^)>]+)>?\)/g)].map((match) => match[1].trim());

/**
 * @method docsProblemsFactory
 * @description Everything wrong with a set of documents: a document without one title, an unknown
 * category, a duplicate identity, a filename a URL cannot carry, a domain that declares itself
 * more than once or not at all, and any internal link that resolves to nothing.
 * @param {DocsDocument[]} [documents] - Documents, as {@link docsDocumentsFactory} returns them.
 * @returns {Array<{document: string, problem: string}>} One entry per problem, in document order.
 * @memberof UnderpostDocs
 */
const docsProblemsFactory = (documents = []) => {
  const problems = [];
  const report = (document, problem) => problems.push({ document: document.path, problem });
  const identity = (document) => `${document.domain}/${document.category}/${document.slug}`;
  const placed = documents.filter((document) => document.domain);
  const byIdentity = new Map(placed.map((document) => [identity(document), document]));
  const headings = new Map(
    placed.map((document) => [
      identity(document),
      anchorsOf(frontMatterOf(fs.readFileSync(document.path, 'utf8')).body),
    ]),
  );
  const declarations = new Map();

  for (const document of documents) {
    if (!document.domain) {
      report(document, 'lives outside the documentation root, so it has no domain or category');
      continue;
    }
    const { body } = frontMatterOf(fs.readFileSync(document.path, 'utf8'));
    const titles = proseOf(body).match(/^#\s+.+$/gm) ?? [];
    if (titles.length !== 1) report(document, `has ${titles.length} top-level titles, and needs exactly one`);
    if (!document.title) report(document, 'declares no title and carries no heading');
    if (!DOCS_CATEGORIES[document.category]) report(document, `is in unknown category "${document.category}"`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(document.slug))
      report(document, `has a slug a URL cannot carry: "${document.slug}"`);
    if (byIdentity.get(identity(document)) !== document)
      report(document, `repeats the identity "${identity(document)}"`);
    if (document.data.domain) declarations.set(document.domain, (declarations.get(document.domain) ?? 0) + 1);

    for (const target of linksOf(proseOf(body))) {
      if (/^[a-z]+:|^\/\//i.test(target) || target.startsWith('#')) continue;
      const [path, fragment] = target.split('#');
      if (!path) continue;
      if (!path.toLowerCase().endsWith('.md')) {
        report(document, `links to "${target}", which is not a document`);
        continue;
      }
      const resolved = `${document.domain}/${document.category}/${path}`
        .split('/')
        .reduce((stack, part) => {
          if (part === '..') stack.pop();
          else if (part !== '.') stack.push(part);
          return stack;
        }, [])
        .join('/')
        .replace(/\.md$/i, '');
      if (!byIdentity.has(resolved)) {
        report(document, `links to "${target}", which resolves to no document`);
        continue;
      }
      if (fragment && !headings.get(resolved).includes(fragment))
        report(document, `links to "${target}", and the target has no such heading`);
    }
  }

  for (const domain of new Set(placed.map((document) => document.domain))) {
    const count = declarations.get(domain) ?? 0;
    if (count !== 1)
      problems.push({
        document: domain,
        problem: `is declared by ${count} documents, and needs exactly one carrying \`domain:\``,
      });
  }

  return problems;
};

/**
 * @method apiDocsModulesFactory
 * @description The API modules an instance's OpenAPI document covers: the ones the client
 * `docs.api` names, kept to those the instance serves from its own authority. A consumed API is
 * another domain's contract and is documented there, never here. Without a declaration, the
 * owned modules whose router describes itself with `#swagger` annotations.
 * @param {object} [options]
 * @param {object} [options.docs] - The `docs` block of one `conf.client.json` client.
 * @param {string[]} [options.apis] - The API modules the instance serves.
 * @param {Object<string,string>} [options.consumes] - The served modules another domain owns.
 * @returns {string[]} Module names, in declaration order.
 * @memberof UnderpostDocs
 */
const apiDocsModulesFactory = ({ docs = {}, apis = [], consumes = {} } = {}) => {
  const owned = apis.filter((api) => !consumes?.[api]);
  if (Array.isArray(docs?.api)) return docs.api.filter((api) => owned.includes(api));
  return owned.filter((api) => {
    const routerPath = `./src/api/${api}/${api}.router.js`;
    return fs.existsSync(routerPath) && fs.readFileSync(routerPath, 'utf8').includes('#swagger');
  });
};

/**
 * @method canonicalDocsClient
 * @description The client whose TypeDoc options a product template writes to its root, as
 * `docs.canonical` marks it. A deploy names one client or none.
 * @param {object} [confClient] - A parsed `conf.client.json`.
 * @returns {string|undefined} Client id, or undefined when no client is marked.
 * @throws {Error} When two clients are marked.
 * @memberof UnderpostDocs
 */
const canonicalDocsClient = (confClient = {}) => {
  const marked = Object.keys(confClient).filter((client) => confClient[client]?.docs?.canonical === true);
  if (marked.length > 1) throw new Error(`[docs] clients '${marked.join("', '")}' are both marked canonical`);
  return marked[0];
};

export {
  DOCS_CATEGORIES,
  DOCS_ROOT,
  anchorsOf,
  docsDocumentsFactory,
  docsNavigationFactory,
  docsProblemsFactory,
  frontMatterOf,
  DEFAULT_TYPEDOC_CONFIG_PATH,
  apiDocsModulesFactory,
  canonicalDocsClient,
  docsReferencesFactory,
  typedocOptionsFactory,
};
