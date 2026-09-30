/**
 * The metadata of a public Object Layer definition (`/object-layer/:cid`), rendered into the
 * initial HTML of the PWA shell (see {@link module:src/server/network/shell-metadata.js}): the
 * item names and describes the page, and its idle preview is the social image. Any host that
 * presents the view renders it: the definition is read where `resolveObjectLayer` finds it.
 *
 * @module src/server/network/object-layer-metadata.js
 * @namespace ObjectLayerMetadata
 */

import { capFirst, publicRoutePathFactory } from '../../client/components/core/CommonJs.js';
import { isObjectLayerCid } from '../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { deployConfServer, ownerHostOf } from '../domain/consumed-api.js';
import { resolveObjectLayer } from '../domain/object-layer-resolver.js';
import {
  injectShellMetadata,
  isoDate,
  shellContext,
  siteImage,
  siteNameOf,
  truncateText,
  withoutUndefined,
} from './shell-metadata.js';

/**
 * The shell context of Object Layer pages, with the API base that serves their idle previews.
 * @typedef {import('./shell-metadata.js').ShellContext & { previewBase: string }} ObjectLayerContext
 */

/**
 * The API base the idle previews of a host's pages are served from: its own atlas API, else the
 * one of the host that owns it, else none.
 * @param {import('./shell-metadata.js').ShellContext} context
 * @param {string[]} apis - The APIs the host mounts.
 * @returns {string}
 */
const previewBaseOf = (context, apis) => {
  if (apis.includes('atlas-sprite-sheet')) return `${context.origin}${context.proxyPath}${context.apiBasePath}`;
  const owner = ownerHostOf(deployConfServer(), 'atlas-sprite-sheet');
  return owner ? `https://${owner}/${context.apiBasePath}` : '';
};

/**
 * The metadata of a definition, or of an unresolved one (`objectLayer` `null`). The item's label
 * titles the page; its description, else its type, describes it. A definition that names a render
 * shows its idle preview, else the site image. An archived definition is offered to no one, so it
 * is not indexed.
 * @method buildObjectLayerMetadata
 * @param {object|null} objectLayer - The canonical definition.
 * @param {ObjectLayerContext} context
 * @returns {import('./shell-metadata.js').ShellMetadata}
 * @memberof ObjectLayerMetadata
 */
const buildObjectLayerMetadata = (objectLayer, context) => {
  if (!objectLayer) return { robots: 'noindex' };
  const { site, origin, proxyPath, previewBase } = context;
  const siteName = siteNameOf(site);
  const { id: headline, type, description: itemDescription } = objectLayer.data.item;
  const description = truncateText(`${itemDescription ?? ''}`.trim() || `${capFirst(type)} object layer`);
  const canonicalUrl = `${origin}${publicRoutePathFactory('objectLayer', objectLayer.cid, proxyPath)}`;
  const image =
    objectLayer.data.render?.cid && previewBase
      ? { url: `${previewBase}/atlas-sprite-sheet/idle-preview/${objectLayer.cid}`, representative: true }
      : siteImage(context);

  const jsonLd = withoutUndefined({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: headline,
    description,
    genre: type,
    identifier: objectLayer.cid,
    url: canonicalUrl,
    image: image?.representative ? [image.url] : undefined,
    publisher: siteName ? { '@type': 'Organization', name: siteName } : undefined,
    dateCreated: isoDate(objectLayer.createdAt),
    dateModified: isoDate(objectLayer.updatedAt),
  });

  return withoutUndefined({
    robots: objectLayer.archivedAt ? 'noindex' : undefined,
    title: siteName ? `${headline} | ${siteName}` : headline,
    headline,
    description,
    canonicalUrl,
    siteName: siteName || undefined,
    type: 'website',
    image,
    jsonLd,
  });
};

/**
 * The renderer of an instance's Object Layer shells: resolves the definition a cid names, builds
 * its metadata and writes it into the shell.
 * @method objectLayerShellRendererFactory
 * @param {{ host: string, path: string, metadata?: import('./shell-metadata.js').ShellSite,
 *   origin?: string, apis?: string[], consumes?: Object<string, string> }} config - The instance, its
 *   client's `metadata` block, the canonical origin, and the APIs it mounts and consumes.
 * @returns {(req: import('express').Request, shellHtml: string, cid: string) => Promise<string>}
 * @memberof ObjectLayerMetadata
 */
const objectLayerShellRendererFactory = ({ host, path, metadata, origin, apis = [], consumes }) => {
  const options = { host, path, consumes };
  const shell = shellContext({ host, path, metadata, origin });
  const context = { ...shell, previewBase: previewBaseOf(shell, apis) };
  return async (req, shellHtml, cid) => {
    // An authority that does not answer leaves the page described by the site, never unserved.
    const objectLayer = isObjectLayerCid(cid) ? await resolveObjectLayer(cid, options).catch(() => undefined) : null;
    if (objectLayer === undefined) return shellHtml;
    return injectShellMetadata(shellHtml, buildObjectLayerMetadata(objectLayer, context));
  };
};

export { buildObjectLayerMetadata, objectLayerShellRendererFactory };
