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
 * @constant TYPEDOC_DIRECTORY
 * @description Where the TypeDoc sites of a client live below its root: one directory per package
 * version, served at `/docs/engine/<version>/`, and the development preview. The documentation task
 * owns it, and a full client build keeps it.
 * @memberof UnderpostDocs
 */
const TYPEDOC_DIRECTORY = 'docs/engine';

/**
 * @constant TYPEDOC_PREVIEW
 * @description The directory a TypeDoc watch rebuilds, below {@link TYPEDOC_DIRECTORY}.
 * @memberof UnderpostDocs
 */
const TYPEDOC_PREVIEW = 'preview';

/**
 * @constant TYPEDOC_MODES
 * @description What a client build does with the TypeDoc site. `auto` builds it in a full production
 * build and keeps the published site otherwise, `skip` keeps the published site, `build` generates
 * and publishes it, and `watch` runs the development preview.
 * @memberof UnderpostDocs
 */
const TYPEDOC_MODES = Object.freeze(['auto', 'skip', 'build', 'watch']);

/** The `client` operations that build no client, by option name. */
const CLIENT_OPERATIONS = Object.freeze({
  unzip: '--unzip',
  mergeZip: '--merge-zip',
  singleReplica: '--single-replica',
  syncEnvPort: '--sync-env-port',
});

/**
 * @method docsPlanFactory
 * @description What one `client` build does with its documentation: whether it builds the client
 * assets, and what it does with the TypeDoc site. An explicit request makes a TypeDoc failure fail
 * the build; in `auto` it is a warning. A watch builds and publishes nothing else: it only runs the
 * preview of its one client.
 * @param {object} [options] - Options of the `client` command.
 * @param {string} [options.docs='auto'] - One of {@link TYPEDOC_MODES}.
 * @param {boolean} [options.docsOnly] - Build the documentation without the client assets.
 * @param {string} [env='development'] - The resolved build environment.
 * @returns {{assets: boolean, typedoc: 'skip'|'build'|'watch', required: boolean}}
 * @throws {Error} On a combination that cannot run.
 * @memberof UnderpostDocs
 */
const docsPlanFactory = (options = {}, env = 'development') => {
  const mode = options.docs || 'auto';
  if (!TYPEDOC_MODES.includes(mode)) throw new Error(`--docs '${mode}': expected one of ${TYPEDOC_MODES.join(', ')}`);
  const docsOnly = options.docsOnly === true;
  const required = docsOnly || mode !== 'auto';
  const operation = Object.keys(CLIENT_OPERATIONS).find((name) => options[name]);
  if (required && operation)
    throw new Error(`${CLIENT_OPERATIONS[operation]} builds no client: it takes no --docs option`);
  const full = env === 'production' && !options.liteBuild && !options.ssr;
  const typedoc = mode !== 'auto' ? mode : docsOnly || full ? 'build' : 'skip';
  if (docsOnly && typedoc === 'skip') throw new Error('--docs-only builds the documentation: it cannot skip TypeDoc');
  if (typedoc === 'watch' && env !== 'development')
    throw new Error(`--docs watch runs in development only, not in ${env}`);
  if (options.ssr && typedoc !== 'skip')
    throw new Error('--ssr rebuilds the SSR views only: build the documentation with --docs-only');
  const assetOption = ['buildZip', 'iconsBuild'].find((name) => options[name]);
  if (assetOption && (docsOnly || typedoc === 'watch'))
    throw new Error(
      `--${assetOption === 'buildZip' ? 'build-zip' : 'icons-build'} builds client assets: it cannot run with --docs-only or --docs watch`,
    );
  return { assets: !docsOnly && typedoc !== 'watch', typedoc, required };
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

/**
 * @constant DOCS_VIEWS
 * @description The domains the documentation view of each application navigates, by client id.
 * Every domain of the tree has exactly one view. An application not named here navigates every
 * domain.
 * @memberof UnderpostDocs
 */
const DOCS_VIEWS = Object.freeze({
  underpost: Object.freeze(['ecosystem', 'underpost']),
  objectlayer: Object.freeze(['object-layer']),
  itemledger: Object.freeze(['item-ledger']),
  'cyberia-portal': Object.freeze(['cyberia']),
  cryptokoyn: Object.freeze(['cryptokoyn']),
  nexodev: Object.freeze(['nexodev']),
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
  DOCS_VIEWS,
  anchorsOf,
  docsDocumentsFactory,
  docsNavigationFactory,
  docsProblemsFactory,
  frontMatterOf,
  DEFAULT_TYPEDOC_CONFIG_PATH,
  TYPEDOC_DIRECTORY,
  TYPEDOC_MODES,
  TYPEDOC_PREVIEW,
  canonicalDocsClient,
  docsPlanFactory,
  docsReferencesFactory,
  typedocOptionsFactory,
};
