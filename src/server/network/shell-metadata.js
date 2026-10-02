/**
 * The metadata of the resource a public route presents (`/entry/:stableSlug`,
 * `/object-layer/:cid`), rendered into the initial HTML of the PWA shell so crawlers, social
 * preview services and browsers read it before any client script runs. Each resource has its own
 * builder; this module holds what they share: the site context, the head elements and the
 * injector that writes them into the shell.
 *
 * @module src/server/network/shell-metadata.js
 * @namespace ShellMetadata
 */

import { API_BASE_PATH } from '../domain/api-contract.js';
import { JSONweb } from '../../client-builder/client-formatted.js';

/** Search snippets and social cards truncate around this length. */
const DESCRIPTION_MAX_LENGTH = 160;

/**
 * @typedef {object} ShellSite
 * @property {string} title - The app title, the site name unless `siteName` is set.
 * @property {string} [siteName] - The short brand name page titles end with (`… | Underpost`).
 * @property {string} [description] - The site description, the final description fallback.
 * @property {string} [thumbnail] - The site's social preview image, relative to the app path.
 */

/**
 * @typedef {object} ShellContext
 * @property {string} origin - The canonical origin (`https://underpost.net`).
 * @property {string} proxyPath - The app's sub-path with leading and trailing slash.
 * @property {string} apiBasePath - The versioned API path under the app path (`api/v1`).
 * @property {ShellSite} site
 */

/**
 * @typedef {object} ShellMetadata
 * @property {string} [robots] - `noindex` for a page that must not be indexed; the only field of a
 *   resource that did not resolve, so nothing about it is described.
 * @property {string} [title] - The page title: the headline and the site name.
 * @property {string} [headline] - The resource's own title.
 * @property {string} [description]
 * @property {'article'|'website'} [type] - The Open Graph object type.
 * @property {string} [canonicalUrl]
 * @property {string} [siteName]
 * @property {{ url: string, representative: boolean }} [image] - The social preview image;
 *   `representative` when it is the resource's own image rather than the site's.
 * @property {{ name: string, url?: string }} [author]
 * @property {string} [datePublished] - ISO 8601.
 * @property {string} [dateModified] - ISO 8601.
 * @property {object} [jsonLd] - The Schema.org description of the resource.
 */

/**
 * The context the shells of an instance are described in.
 * @method shellContext
 * @param {{ host: string, path: string, metadata?: ShellSite, origin?: string }} config - The
 *   instance, its client's `metadata` block, and the canonical origin (`https://<host>` unless
 *   given).
 * @returns {ShellContext}
 * @memberof ShellMetadata
 */
const shellContext = ({ host, path, metadata, origin }) => ({
  origin: origin ?? `https://${host}`,
  proxyPath: path === '/' ? '/' : `${path}/`,
  apiBasePath: API_BASE_PATH,
  site: metadata ?? {},
});

const escapeHtml = (value) =>
  `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Cuts a text to a length at a word boundary, closing with an ellipsis.
 * @method truncateText
 * @param {string} text
 * @param {number} [maxLength=DESCRIPTION_MAX_LENGTH]
 * @returns {string}
 * @memberof ShellMetadata
 */
const truncateText = (text, maxLength = DESCRIPTION_MAX_LENGTH) => {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > maxLength / 2 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.!?-]+$/, '')}…`;
};

/** The site name page titles end with. */
const siteNameOf = (site) => `${site.siteName || site.title || ''}`.trim();

/** The site's own social image, for a resource that has none. */
const siteImage = (context) =>
  context.site.thumbnail
    ? {
        url: /^https?:\/\//.test(context.site.thumbnail)
          ? context.site.thumbnail
          : `${context.origin}${context.proxyPath}${context.site.thumbnail.replace(/^\/+/, '')}`,
        representative: false,
      }
    : undefined;

const isoDate = (value) => {
  if (value === undefined || value === null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const withoutUndefined = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

const metaTag = (attribute, key, value) =>
  value === undefined ? '' : `<meta ${attribute}="${key}" content="${escapeHtml(value)}">`;

/**
 * The head elements of a resource's metadata.
 * @method renderShellHead
 * @param {ShellMetadata} metadata
 * @returns {string}
 * @memberof ShellMetadata
 */
const renderShellHead = (metadata) =>
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
    metadata.jsonLd ? `<script type="application/ld+json">${JSONweb(metadata.jsonLd)}</script>` : '',
  ]
    .filter(Boolean)
    .join('\n');

/** The head elements the shell was built with that a resource's own metadata replaces. */
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
 * Writes a resource's metadata into the built PWA shell: the title in place, the site-level
 * elements it supersedes removed, the resource's own elements added at the end of the head. A
 * field the metadata leaves out keeps the shell's element, so an unresolved resource only gains
 * its `robots` directive.
 * @method injectShellMetadata
 * @param {string} html - The built shell.
 * @param {ShellMetadata} metadata
 * @returns {string}
 * @memberof ShellMetadata
 */
const injectShellMetadata = (html, metadata) => {
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
  const head = renderShellHead(metadata);
  return output.replace(/<\/head>/i, (closing) => `${head}\n${closing}`);
};

export {
  DESCRIPTION_MAX_LENGTH,
  shellContext,
  truncateText,
  siteNameOf,
  siteImage,
  isoDate,
  withoutUndefined,
  renderShellHead,
  injectShellMetadata,
};
