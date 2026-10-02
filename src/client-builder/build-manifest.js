/**
 * The Underpost Build Manifest producer: the one place that builds the manifest of a client build,
 * its head tags, its file and its service worker prelude.
 *
 * @module src/client-builder/build-manifest.js
 * @namespace BuildManifest
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import Underpost from '../index.js';
import { JSONweb } from './client-formatted.js';
import { API_BASE_PATH } from '../server/domain/api-contract.js';
import { uniqueArray } from '../client/components/core/CommonJs.js';
import {
  BUILD_MANIFEST_ELEMENT_ID,
  BUILD_MANIFEST_FILE,
  BUILD_MANIFEST_REL,
  BUILD_MANIFEST_SCHEMA,
  assertBuildManifest,
} from '../client/components/core/BuildManifest.js';

/**
 * The `serviceWorker` section of an application: its cache prefix and the SSR status views it
 * precaches and serves when the network or the server fails.
 * @param {Object} params
 * @param {string} params.basePath - The application base path.
 * @param {Array<{path: string, offlineDefault?: boolean, maintenanceDefault?: boolean}>} params.views - The SSR views.
 * @returns {{cachePrefix: string, precache: string[], offline: string, maintenance: string}}
 * @memberof BuildManifest
 */
const serviceWorkerManifest = ({ basePath, views }) => {
  const prefix = basePath === '/' ? '' : basePath;
  const indexUrl = (routePath) => `${prefix}${routePath === '/' ? '' : routePath}/index.html`;
  const offline = views.filter((view) => view.offlineDefault);
  const maintenance = views.filter((view) => view.maintenanceDefault);
  return {
    cachePrefix: `engine-core-${basePath === '/' ? 'root' : basePath.replaceAll('/', '_')}`,
    precache: uniqueArray([...offline, ...maintenance].map((view) => indexUrl(view.path))),
    offline: indexUrl(offline.at(-1)?.path ?? '/offline'),
    maintenance: indexUrl(maintenance.at(-1)?.path ?? '/maintenance'),
  };
};

/**
 * The manifest of one build. Each field is set here on purpose; no input is copied as a whole.
 * @param {Object} params
 * @param {string} params.application - The client id, or the page of a static build.
 * @param {boolean} [params.development] - A development build.
 * @param {string} [params.basePath='/'] - The application base path.
 * @param {string} [params.apiBaseProxyPath] - The proxy path of the API host, when it differs.
 * @param {string} [params.apiBaseHost] - The API host, when it differs.
 * @param {Object<string, string>} [params.apiHosts] - Endpoint to host, for services another domain owns.
 * @param {string} [params.siteName] - The name page titles end with.
 * @param {{repository: Object, coverage: Array<{id: string, label: string}>}} [params.documentation] -
 *   The public repository identity and the coverage reports the documentation UI links.
 * @param {Object} [params.serviceWorker] - The {@link serviceWorkerManifest} section.
 * @returns {Readonly<Object>}
 * @memberof BuildManifest
 */
const buildManifestFactory = ({
  application,
  development = false,
  basePath = '/',
  apiBaseProxyPath,
  apiBaseHost,
  apiHosts,
  siteName,
  documentation,
  serviceWorker,
}) => {
  const content = {
    schema: BUILD_MANIFEST_SCHEMA,
    application,
    version: Underpost.version,
    build: { mode: development ? 'development' : 'production' },
    runtime: {
      basePath,
      apiBasePath: API_BASE_PATH,
      ...(apiBaseProxyPath ? { apiBaseProxyPath } : undefined),
      ...(apiBaseHost ? { apiBaseHost } : undefined),
      ...(apiHosts && Object.keys(apiHosts).length ? { apiHosts: { ...apiHosts } } : undefined),
      ...(siteName ? { siteName } : undefined),
    },
  };
  if (documentation) {
    const { owner, organization, name, template, packageSuffix, deployPackage } = documentation.repository;
    content.documentation = {
      repository: {
        owner,
        organization,
        name,
        template,
        packageSuffix,
        ...(deployPackage ? { deployPackage } : undefined),
      },
      coverage: documentation.coverage.map(({ id, label }) => ({ id, label })),
    };
  }
  if (serviceWorker) {
    const { cachePrefix, precache, offline, maintenance } = serviceWorker;
    content.serviceWorker = { cachePrefix, precache: [...precache], offline, maintenance };
  }
  // The id digests the content: builds of the same inputs agree on it, on every replica.
  const id = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
  return assertBuildManifest({ ...content, build: { id, ...content.build } }, `of ${application}`);
};

/**
 * The URL of the manifest of an application mounted at a base path.
 * @param {string} basePath - `/` or a sub-path such as `/test`.
 * @returns {string}
 * @memberof BuildManifest
 */
const buildManifestHref = (basePath) => `${basePath === '/' ? '' : basePath}/${BUILD_MANIFEST_FILE}`;

/**
 * The head tags of a document: the link to the manifest file at the manifest base path, then the
 * manifest as a JSON data block.
 * @param {Object} params
 * @param {Object} params.manifest
 * @returns {string}
 * @memberof BuildManifest
 */
const buildManifestHead = ({ manifest }) =>
  `<link rel="${BUILD_MANIFEST_REL}" href="${buildManifestHref(manifest.runtime.basePath)}" type="application/json" />` +
  `<script id="${BUILD_MANIFEST_ELEMENT_ID}" type="application/json">${JSONweb(manifest)}</script>`;

/**
 * The service worker prelude: the manifest, as `self.buildManifest`, before the worker bundle.
 * @param {Object} manifest
 * @returns {string}
 * @memberof BuildManifest
 */
const buildManifestPrelude = (manifest) => `self.buildManifest = ${JSONweb(manifest)};`;

/**
 * Writes the manifest at the root of the site, byte for byte the inline snapshot.
 * @param {string} siteRoot - The directory the site serves at the manifest base path.
 * @param {Object} manifest
 * @returns {string} The written path.
 * @memberof BuildManifest
 */
const writeBuildManifest = (siteRoot, manifest) => {
  const target = `${siteRoot}/${BUILD_MANIFEST_FILE}`;
  fs.outputFileSync(target, JSONweb(manifest), 'utf8');
  return target;
};

export {
  buildManifestFactory,
  buildManifestHead,
  buildManifestHref,
  buildManifestPrelude,
  serviceWorkerManifest,
  writeBuildManifest,
};
