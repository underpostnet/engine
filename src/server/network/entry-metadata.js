/**
 * The document metadata of a public entry (`/entry/:stableSlug`), rendered into the initial HTML
 * of the PWA shell (see {@link module:src/server/network/shell-metadata.js}).
 *
 * @module src/server/network/entry-metadata.js
 * @namespace EntryMetadata
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { findReadableByStableSlug } from '../../api/document/document.service.js';
import { capFirst, publicRoutePathFactory } from '../../client/components/core/CommonJs.js';
import {
  injectShellMetadata,
  isoDate,
  shellContext,
  siteImage,
  siteNameOf,
  truncateText,
  withoutUndefined,
} from './shell-metadata.js';

/** Largest Markdown source read for a description: text only, an image is never loaded. */
const TEXT_SOURCE_MAX_BYTES = 256 * 1024;
/** Image types every social preview service renders; anything else falls back to the site image. */
const SOCIAL_IMAGE_TYPES = ['image/jpeg', 'image/png'];
/** Entries are dated posts a publisher lists in a blog panel, so no more specific type is claimed. */
const ARTICLE_TYPE = 'BlogPosting';

/**
 * The shell context with the entry's Markdown source, when it has one small enough to read.
 * @typedef {import('./shell-metadata.js').ShellContext & { markdown?: string }} EntryContext
 */

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
 * The metadata of a resolved entry, or of an unresolved one (`document` `null`: missing, or not
 * readable by the requester, which are answered alike). The description comes from the first
 * source that yields text: the Markdown body, the title, the site description. The social image
 * is the entry's own file when it is a public JPEG or PNG, the site's otherwise; the structured
 * data only names an image that is the entry's own.
 * @method buildEntryMetadata
 * @param {object|null} document - The public document shape (`DocumentDto.toPublic`).
 * @param {EntryContext} context
 * @returns {import('./shell-metadata.js').ShellMetadata}
 * @memberof EntryMetadata
 */
const buildEntryMetadata = (document, context) => {
  if (!document) return { robots: 'noindex' };
  const { site, origin, proxyPath, apiBasePath, markdown } = context;
  const siteName = siteNameOf(site);
  // The entry's title as the page shows it: the first letter capitalized, the rest as written.
  const headline = capFirst(`${document.title ?? ''}`.trim());
  const description = truncateText(markdownToText(markdown) || headline || `${site.description ?? ''}`.trim());
  const canonicalUrl = `${origin}${publicRoutePathFactory('entry', document.stableSlug, proxyPath)}`;

  const file = document.fileId && typeof document.fileId === 'object' ? document.fileId : null;
  const representative = !!file && document.isPublic === true && SOCIAL_IMAGE_TYPES.includes(file.mimetype);
  const image = representative
    ? { url: `${origin}${proxyPath}${apiBasePath}/file/blob/${file._id}`, representative: true }
    : siteImage(context);

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
 * @param {{ host: string, path: string, metadata?: import('./shell-metadata.js').ShellSite, origin?: string }} config
 *   The instance, its client's `metadata` block, and the canonical origin.
 * @returns {(req: import('express').Request, shellHtml: string, stableSlug: string) => Promise<string>}
 * @memberof EntryMetadata
 */
const entryShellRendererFactory = ({ host, path, metadata, origin }) => {
  const options = { host, path };
  const context = shellContext({ host, path, metadata, origin });
  return async (req, shellHtml, stableSlug) => {
    let document = null;
    try {
      document = await findReadableByStableSlug(req, options, stableSlug);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    const markdown = document ? await markdownSource(document, options) : undefined;
    return injectShellMetadata(shellHtml, buildEntryMetadata(document, { ...context, markdown }));
  };
};

export { TEXT_SOURCE_MAX_BYTES, markdownToText, buildEntryMetadata, entryShellRendererFactory };
