/**
 * The document metadata of a public entry (`/entry/:stableSlug`), rendered into the initial HTML
 * of the PWA shell so crawlers, social preview services and browsers read it before any client
 * script runs. One builder produces the structured metadata, one injector writes it into the shell.
 *
 * @module src/server/network/entry-metadata.js
 * @namespace EntryMetadata
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { findReadableByStableSlug } from '../../api/document/document.service.js';
import { capFirst, publicRoutePathFactory } from '../../client/components/core/CommonJs.js';
import { API_BASE_PATH } from '../domain/api-contract.js';

/** Search snippets and social cards truncate around this length. */
const DESCRIPTION_MAX_LENGTH = 160;
/** Largest Markdown source read for a description: text only, an image is never loaded. */
const TEXT_SOURCE_MAX_BYTES = 256 * 1024;
/** Image types every social preview service renders; anything else falls back to the site image. */
const SOCIAL_IMAGE_TYPES = ['image/jpeg', 'image/png'];
/** Entries are dated posts a publisher lists in a blog panel, so no more specific type is claimed. */
const ARTICLE_TYPE = 'BlogPosting';

/**
 * @typedef {object} EntrySite
 * @property {string} title - The app title, the site name unless `siteName` is set.
 * @property {string} [siteName] - The short brand name page titles end with (`… | Underpost`).
 * @property {string} [description] - The site description, the final description fallback.
 * @property {string} [thumbnail] - The site's social preview image, relative to the app path.
 */

/**
 * @typedef {object} EntryContext
 * @property {string} origin - The canonical origin (`https://underpost.net`).
 * @property {string} proxyPath - The app's sub-path with leading and trailing slash.
 * @property {string} apiBasePath - The versioned API path under the app path (`api/v1`).
 * @property {EntrySite} site
 * @property {string} [markdown] - The entry's Markdown source, when it has one small enough to read.
 */

/**
 * @typedef {object} EntryMetadata
 * @property {string} [robots] - `noindex` for a page that must not be indexed; the only field of an
 *   entry that did not resolve, so nothing about it is described.
 * @property {string} [title] - The page title: the headline and the site name.
 * @property {string} [headline] - The entry's own title, its first letter capitalized.
 * @property {string} [description]
 * @property {'article'} [type] - The Open Graph object type.
 * @property {string} [canonicalUrl]
 * @property {string} [siteName]
 * @property {{ url: string, representative: boolean }} [image] - The social preview image;
 *   `representative` when it is the entry's own image rather than the site's.
 * @property {{ name: string, url?: string }} [author]
 * @property {string} [datePublished] - ISO 8601.
 * @property {string} [dateModified] - ISO 8601.
 * @property {object} [jsonLd] - The Schema.org article.
 */

const escapeHtml = (value) =>
  `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Inside a script element only `</` (and the JS line terminators JSON leaves raw) can break out.
const jsonForScript = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * The plain text of a Markdown source: body prose only. Headings, code blocks, images, link
 * targets, HTML, tables' structure and every formatting marker are dropped; whitespace collapses.
 * @method markdownToText
 * @param {string} markdown
 * @returns {string}
 * @memberof EntryMetadata
 */
const markdownToText = (markdown) =>
  decodeEntities(
    `${markdown ?? ''}`
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\1[ \t]*$/gm, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?[a-zA-Z][^>\n]*>/g, ' ')
      .replace(/<[a-z][a-z0-9+.-]*:[^>\s]+>/g, ' ')
      .replace(/^ {0,3}#{1,6}[ \t][^\n]*$/gm, '')
      .replace(/^ {0,3}[ \t|:-]*-[ \t|:-]*$/gm, '')
      .replace(/^ {0,3}(?:[*_][ \t]*){3,}$/gm, '')
      .replace(/^ {0,3}=+[ \t]*$/gm, '')
      .replace(/^ {0,3}\[[^\]\n]+\]:[ \t][^\n]*$/gm, '')
      .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '')
      .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
      .replace(/\[([^\]\n]*)\]\[[^\]\n]*\]/g, '$1')
      .replace(/^[ \t]*>[ \t]?/gm, '')
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
      .replace(/(\*{1,3})(?=\S)([^*\n]*?\S)\1/g, '$2')
      .replace(/(^|[\s(])(_{1,3})(?=\S)([^_\n]*?\S)\2(?=$|[\s).,;:!?])/gm, '$1$3')
      .replace(/~~(?=\S)([^~\n]*?\S)~~/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\|/g, ' ')
      .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/ ([.,;:!?])/g, '$1')
      .trim(),
  );

/**
 * Cuts a text to a length at a word boundary, closing with an ellipsis.
 * @method truncateText
 * @param {string} text
 * @param {number} [maxLength=DESCRIPTION_MAX_LENGTH]
 * @returns {string}
 * @memberof EntryMetadata
 */
const truncateText = (text, maxLength = DESCRIPTION_MAX_LENGTH) => {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > maxLength / 2 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.!?-]+$/, '')}…`;
};

const absoluteUrl = (context, relativePath) =>
  /^https?:\/\//.test(relativePath)
    ? relativePath
    : `${context.origin}${context.proxyPath}${relativePath.replace(/^\/+/, '')}`;

const isoDate = (value) => {
  if (value === undefined || value === null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const withoutUndefined = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

/**
 * The metadata of a resolved entry, or of an unresolved one (`document` `null`: missing, or not
 * readable by the requester, which are answered alike). The description comes from the first
 * source that yields text: the Markdown body, the title, the site description. The social image
 * is the entry's own file when it is a public JPEG or PNG, the site's otherwise; the structured
 * data only names an image that is the entry's own.
 * @method buildEntryMetadata
 * @param {object|null} document - The public document shape (`DocumentDto.toPublic`).
 * @param {EntryContext} context
 * @returns {EntryMetadata}
 * @memberof EntryMetadata
 */
const buildEntryMetadata = (document, context) => {
  if (!document) return { robots: 'noindex' };
  const { site, origin, proxyPath, apiBasePath, markdown } = context;
  const siteName = `${site.siteName || site.title || ''}`.trim();
  // The entry's title as the page shows it: the first letter capitalized, the rest as written.
  const headline = capFirst(`${document.title ?? ''}`.trim());
  const description = truncateText(markdownToText(markdown) || headline || `${site.description ?? ''}`.trim());
  const canonicalUrl = `${origin}${publicRoutePathFactory('entry', document.stableSlug, proxyPath)}`;

  const file = document.fileId && typeof document.fileId === 'object' ? document.fileId : null;
  const representative = !!file && document.isPublic === true && SOCIAL_IMAGE_TYPES.includes(file.mimetype);
  const image = representative
    ? { url: `${origin}${proxyPath}${apiBasePath}/file/blob/${file._id}`, representative: true }
    : site.thumbnail
      ? { url: absoluteUrl(context, site.thumbnail), representative: false }
      : undefined;

  const username = document.userId?.username;
  const profilePath = username ? publicRoutePathFactory('profile', username, proxyPath) : null;
  const author = username
    ? withoutUndefined({
        name: username,
        url: profilePath && document.userId.publicProfile === true ? `${origin}${profilePath}` : undefined,
      })
    : undefined;

  const datePublished = isoDate(document.createdAt);
  const dateModified = isoDate(document.updatedAt) ?? datePublished;

  const jsonLd = withoutUndefined({
    '@context': 'https://schema.org',
    '@type': ARTICLE_TYPE,
    headline,
    description,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    author: author ? { '@type': 'Person', ...author } : undefined,
    publisher: siteName ? { '@type': 'Organization', name: siteName } : undefined,
    datePublished,
    dateModified,
    image: representative ? [image.url] : undefined,
  });

  return withoutUndefined({
    robots: document.isPublic === true ? undefined : 'noindex',
    title: siteName ? `${headline} | ${siteName}` : headline,
    headline,
    description,
    canonicalUrl,
    siteName: siteName || undefined,
    type: 'article',
    image,
    author,
    datePublished,
    dateModified,
    jsonLd,
  });
};

const metaTag = (attribute, key, value) =>
  value === undefined ? '' : `<meta ${attribute}="${key}" content="${escapeHtml(value)}">`;

/**
 * The head elements of an entry's metadata.
 * @method renderEntryHead
 * @param {EntryMetadata} metadata
 * @returns {string}
 * @memberof EntryMetadata
 */
const renderEntryHead = (metadata) =>
  [
    metaTag('name', 'robots', metadata.robots),
    metaTag('name', 'description', metadata.description),
    metaTag('name', 'author', metadata.author?.name),
    metadata.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}">` : '',
    metaTag('property', 'og:type', metadata.type),
    metaTag('property', 'og:site_name', metadata.siteName),
    metaTag('property', 'og:title', metadata.headline),
    metaTag('property', 'og:description', metadata.description),
    metaTag('property', 'og:url', metadata.canonicalUrl),
    metaTag('property', 'og:image', metadata.image?.url),
    metaTag('property', 'article:published_time', metadata.datePublished),
    metaTag('property', 'article:modified_time', metadata.dateModified),
    metadata.jsonLd ? `<script type="application/ld+json">${jsonForScript(metadata.jsonLd)}</script>` : '',
  ]
    .filter(Boolean)
    .join('\n');

/** The head elements the shell was built with that an entry's own metadata replaces. */
const REPLACED_HEAD_ELEMENTS = {
  robots: (metadata) => metadata.robots !== undefined,
  description: (metadata) => metadata.description !== undefined,
  author: (metadata) => metadata.author !== undefined,
  'og:type': (metadata) => metadata.type !== undefined,
  'og:site_name': (metadata) => metadata.siteName !== undefined,
  'og:title': (metadata) => metadata.headline !== undefined,
  'og:description': (metadata) => metadata.description !== undefined,
  'og:url': (metadata) => metadata.canonicalUrl !== undefined,
  'og:image': (metadata) => metadata.image !== undefined,
  'article:published_time': (metadata) => metadata.datePublished !== undefined,
  'article:modified_time': (metadata) => metadata.dateModified !== undefined,
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Writes an entry's metadata into the built PWA shell: the title in place, the site-level
 * elements it supersedes removed, the entry's own elements added at the end of the head. A
 * field the metadata leaves out keeps the shell's element, so an unresolved entry only gains
 * its `robots` directive.
 * @method injectEntryMetadata
 * @param {string} html - The built shell.
 * @param {EntryMetadata} metadata
 * @returns {string}
 * @memberof EntryMetadata
 */
const injectEntryMetadata = (html, metadata) => {
  let output = html;
  if (metadata.title !== undefined)
    output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`);
  for (const [key, isReplaced] of Object.entries(REPLACED_HEAD_ELEMENTS))
    if (isReplaced(metadata))
      output = output.replace(
        new RegExp(
          `[ \\t]*<meta\\s[^>]*?\\b(?:name|property)=["']${escapeRegExp(key)}(?::[a-z_]+)?["'][^>]*>[ \\t]*\\n?`,
          'gi',
        ),
        '',
      );
  if (metadata.canonicalUrl !== undefined)
    output = output.replace(/[ \t]*<link\s[^>]*?\brel=["']canonical["'][^>]*>[ \t]*\n?/gi, '');
  const head = renderEntryHead(metadata);
  return output.replace(/<\/head>/i, (closing) => `${head}\n${closing}`);
};

const fileText = (file) => {
  if (!file?.data) return undefined;
  const data = Buffer.isBuffer(file.data) ? file.data : file.data.buffer;
  return data ? Buffer.from(data).toString('utf8') : undefined;
};

/**
 * The Markdown source of an entry, read only while it is under the text-source size cap.
 * @param {object} document - The public document shape.
 * @param {{ host: string, path: string }} options - The database context.
 * @returns {Promise<string|undefined>}
 */
const markdownSource = async (document, options) => {
  const id = document.mdFileId?._id ?? document.mdFileId;
  if (!id) return undefined;
  const File = DataBaseProviderService.getModel('File', options);
  const file = await File.findOne({ _id: id, size: { $not: { $gt: TEXT_SOURCE_MAX_BYTES } } }).select('data');
  return fileText(file);
};

/**
 * The renderer of an instance's entry shells: resolves the entry under the document read rule
 * the API applies (the requester's bearer token decides what is readable), builds its metadata
 * and writes it into the shell.
 * @method entryShellRendererFactory
 * @param {{ host: string, path: string, metadata?: EntrySite, origin?: string }} config - The
 *   instance, its client's `metadata` block, and the canonical origin (`https://<host>` unless
 *   given).
 * @returns {(req: import('express').Request, shellHtml: string, stableSlug: string) => Promise<string>}
 * @memberof EntryMetadata
 */
const entryShellRendererFactory = ({ host, path, metadata, origin }) => {
  const options = { host, path };
  const context = {
    origin: origin ?? `https://${host}`,
    proxyPath: path === '/' ? '/' : `${path}/`,
    apiBasePath: API_BASE_PATH,
    site: metadata ?? {},
  };
  return async (req, shellHtml, stableSlug) => {
    let document = null;
    try {
      document = await findReadableByStableSlug(req, options, stableSlug);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    const markdown = document ? await markdownSource(document, options) : undefined;
    return injectEntryMetadata(shellHtml, buildEntryMetadata(document, { ...context, markdown }));
  };
};

export {
  DESCRIPTION_MAX_LENGTH,
  TEXT_SOURCE_MAX_BYTES,
  markdownToText,
  truncateText,
  buildEntryMetadata,
  renderEntryHead,
  injectEntryMetadata,
  entryShellRendererFactory,
};
