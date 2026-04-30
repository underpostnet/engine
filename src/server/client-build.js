/**
 * Manages the client-side build process, including full builds and incremental builds.
 * @module server/client-build.js
 * @namespace clientBuild
 */

'use strict';

import fs from 'fs-extra';
import { transformClientJs, JSONweb } from './client-formatted.js';
import { loggerFactory } from './logger.js';
import {
  getCapVariableName,
  newInstance,
  orderArrayFromAttrInt,
  uniqueArray,
} from '../client/components/core/CommonJs.js';
import { readConfJson } from './conf.js';
import { minify } from 'html-minifier-terser';
import AdmZip from 'adm-zip';
import * as dir from 'path';
import { shellExec } from './process.js';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import { buildIcons } from './client-icons.js';
import Underpost from '../index.js';
import { buildDocs } from './client-build-docs.js';
import { ssrFactory } from './ssr.js';

// Static Site Generation (SSG)

/**
 * Recursively copies files from source to destination, but only files that don't exist in destination.
 * @function copyNonExistingFiles
 * @param {string} src - Source directory path
 * @param {string} dest - Destination directory path
 * @returns {void}
 * @memberof clientBuild
 */
const copyNonExistingFiles = (src, dest) => {
  if (dir.basename(src) === '.git') return;

  // Ensure source exists
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  // Get stats for source
  const srcStats = fs.statSync(src);

  // If source is a file, copy only if it doesn't exist in destination
  if (srcStats.isFile()) {
    if (!fs.existsSync(dest)) {
      const destDir = dir.dirname(dest);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
    }
    return;
  }

  // If source is a directory, create destination if it doesn't exist
  if (srcStats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    // Read all items in source directory
    const items = fs.readdirSync(src);

    // Recursively process each item
    for (const item of items) {
      const srcPath = dir.join(src, item);
      const destPath = dir.join(dest, item);
      copyNonExistingFiles(srcPath, destPath);
    }
  }
};

const splitFileByMb = ({ filePath, partSizeMb, logger }) => {
  const partSizeBytes = Math.floor(Number(partSizeMb) * 1024 * 1024);
  if (!Number.isFinite(partSizeBytes) || partSizeBytes <= 0) {
    throw new Error(`Invalid --split value: ${partSizeMb}`);
  }

  // Clean ALL stale part files (any naming variant) before writing new ones
  const zipDir = dir.dirname(filePath);
  const zipBase = dir.basename(filePath);
  if (fs.existsSync(zipDir)) {
    fs.readdirSync(zipDir)
      .filter((name) => name.startsWith(`${zipBase}.part`) || name.startsWith(`${zipBase}-part`))
      .forEach((name) => fs.removeSync(dir.join(zipDir, name)));
  }

  const fileBuffer = fs.readFileSync(filePath);
  const partPaths = [];

  for (let offset = 0, partIndex = 0; offset < fileBuffer.length; offset += partSizeBytes, partIndex++) {
    const partBuffer = fileBuffer.subarray(offset, offset + partSizeBytes);
    const partPath = `${filePath}.part${String(partIndex + 1).padStart(3, '0')}`;
    fs.writeFileSync(partPath, partBuffer);
    partPaths.push(partPath);
  }

  logger.warn('split zip', {
    filePath,
    partSizeMb: Number(partSizeMb),
    parts: partPaths.length,
  });

  return partPaths;
};

const getZipPartPaths = (zipPath) => {
  const zipDir = dir.dirname(zipPath);
  const zipBase = dir.basename(zipPath);
  const partPrefixDot = `${zipBase}.part`;
  const partPrefixDash = `${zipBase}-part`;

  const parsePartIndex = (rawSuffix) => {
    // Strip optional .zip suffix added by pull/download (e.g. '001.zip' → '001')
    const digits = rawSuffix.replace(/\.zip$/i, '');
    return /^\d+$/.test(digits) ? Number(digits) : NaN;
  };

  const getPartIndex = (name) => {
    if (name.startsWith(partPrefixDot)) return parsePartIndex(name.slice(partPrefixDot.length));
    if (name.startsWith(partPrefixDash)) return parsePartIndex(name.slice(partPrefixDash.length));
    return NaN;
  };

  return fs
    .readdirSync(zipDir)
    .filter((name) => Number.isFinite(getPartIndex(name)))
    .sort((a, b) => getPartIndex(a) - getPartIndex(b))
    .map((name) => dir.join(zipDir, name));
};

const resolveClientBuildZip = (buildPrefix) => {
  const normalizedPrefix = buildPrefix.replace(/\.zip(?:[.-]part\d+|[.-]part\*)?$/, '').replace(/[.-]part\*$/, '');
  const candidatePrefixes = uniqueArray([
    normalizedPrefix,
    normalizedPrefix.endsWith('-') ? normalizedPrefix : `${normalizedPrefix}-`,
  ]);

  for (const prefix of candidatePrefixes) {
    const zipPath = `${prefix}.zip`;
    if (fs.existsSync(zipPath)) {
      return {
        buildPrefix: prefix,
        zipPath,
        partPaths: [],
      };
    }

    const partPaths = fs.existsSync(dir.dirname(zipPath)) ? getZipPartPaths(zipPath) : [];
    if (partPaths.length > 0) {
      return {
        buildPrefix: prefix,
        zipPath,
        partPaths,
      };
    }
  }

  const searchDir = dir.dirname(normalizedPrefix);
  const prefixBase = dir.basename(normalizedPrefix);
  if (!fs.existsSync(searchDir)) {
    throw new Error(`Build directory not found: ${searchDir}`);
  }

  const matches = uniqueArray(
    fs
      .readdirSync(searchDir)
      .filter((name) => name.startsWith(prefixBase) && /\.zip(?:[.-]part\d+)?$/.test(name))
      .map((name) => name.replace(/[.-]part\d+$/, '')),
  );

  if (matches.length === 1) {
    const zipPath = dir.join(searchDir, matches[0]);
    const partPaths = getZipPartPaths(zipPath);
    return {
      buildPrefix: zipPath.replace(/\.zip$/, ''),
      zipPath,
      partPaths,
    };
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple build zip matches found for '${buildPrefix}': ${matches.join(', ')}. Use a more specific --unzip path.`,
    );
  }

  throw new Error(`No build zip or split parts found for: ${buildPrefix}`);
};

/**
 * Merges split ZIP parts back into a single ZIP file.
 * @param {object} options
 * @param {string} options.buildPrefix - The build prefix path (e.g. build/underpost.net/underpost.net-).
 * @param {object} options.logger - Logger instance.
 * @returns {{ zipPath: string, partPaths: string[], mergedBytes: number }}
 */
const mergeClientBuildZip = ({ buildPrefix, logger }) => {
  // Normalize to get the zip path, then look for parts directly (bypassing resolveClientBuildZip
  // which prefers an existing monolithic zip over parts).
  const normalizedPrefix = buildPrefix.replace(/\.zip(?:[.-]part\d+)?$/, '').replace(/[-.]$/, '') + '-';
  const candidatePrefixes = uniqueArray([buildPrefix, buildPrefix.endsWith('-') ? buildPrefix : `${buildPrefix}-`]);

  let zipPath;
  let partPaths = [];

  for (const prefix of candidatePrefixes) {
    const candidate = prefix.endsWith('.zip') ? prefix : `${prefix}.zip`;
    const parts = getZipPartPaths(candidate);
    if (parts.length > 0) {
      zipPath = candidate;
      partPaths = parts;
      break;
    }
  }

  if (partPaths.length === 0) {
    // Fall back to resolveClientBuildZip for the zipPath
    const resolved = resolveClientBuildZip(buildPrefix);
    zipPath = resolved.zipPath;
    logger.warn('merge-zip: no split parts found, nothing to merge', { buildPrefix, zipPath });
    return { zipPath, partPaths, mergedBytes: 0 };
  }

  // For each part, extract raw bytes: if the part file is a Cloudinary wrapper zip
  // (downloaded via pull without --omit-unzip or with --omit-unzip keeping the .zip),
  // extract the inner entry rather than using the wrapper bytes.
  const readPartBytes = (partPath) => {
    const rawBytes = fs.readFileSync(partPath);
    // Check for ZIP magic bytes (PK\x03\x04)
    if (rawBytes[0] === 0x50 && rawBytes[1] === 0x4b && rawBytes[2] === 0x03 && rawBytes[3] === 0x04) {
      try {
        const wrapperZip = new AdmZip(rawBytes);
        const entries = wrapperZip.getEntries();
        // The inner entry is the original part file (without the outer .zip wrapper)
        const partBase = dir.basename(partPath).replace(/\.zip$/i, '');
        const entry = entries.find((e) => e.entryName === partBase || e.entryName.endsWith('/' + partBase));
        if (entry) {
          return entry.getData();
        }
        // Fallback: single-entry archive
        if (entries.length === 1) {
          return entries[0].getData();
        }
      } catch (_) {
        // Not a valid zip or extraction failed — use raw bytes
      }
    }
    return rawBytes;
  };

  const mergedBuffer = Buffer.concat(partPaths.map(readPartBytes));
  fs.writeFileSync(zipPath, mergedBuffer);

  logger.warn('merge-zip: merged split parts into zip', {
    zipPath,
    parts: partPaths.length,
    mergedBytes: mergedBuffer.length,
  });

  return { zipPath, partPaths, mergedBytes: mergedBuffer.length };
};

const unzipClientBuild = ({ buildPrefix, logger }) => {
  const { zipPath, partPaths, buildPrefix: resolvedBuildPrefix } = resolveClientBuildZip(buildPrefix);
  const outputPath = resolvedBuildPrefix.replace(/-$/, '');

  fs.removeSync(outputPath);
  fs.mkdirSync(outputPath, { recursive: true });

  const zip =
    partPaths.length > 0
      ? new AdmZip(Buffer.concat(partPaths.map((partPath) => fs.readFileSync(partPath))))
      : new AdmZip(zipPath);

  zip.extractAllTo(outputPath, true);

  logger.warn('unzip build', {
    source: partPaths.length > 0 ? partPaths : [zipPath],
    outputPath,
    splitParts: partPaths.length,
  });

  return {
    outputPath,
    zipPath,
    partPaths,
  };
};

/** @type {string} Default XSL sitemap template used when no `sitemap` source file exists in the public directory. */
const defaultSitemapXsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
    xmlns:html="http://www.w3.org/TR/REC-html40"
    xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
    xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes" />
    <xsl:template match="/">
        <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
                <title>XML Sitemap</title>
                <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
                <style type="text/css">
                    body {
                    font-family: sans-serif;
                    font-size: 16px;
                    color: #242628;
                    }
                    a {
                    color: #000;
                    text-decoration: none;
                    }
                    a:hover {
                    text-decoration: underline;
                    }
                    table {
                    border: none;
                    border-collapse: collapse;
                    width: 100%
                    }
                    th {
                    text-align: left;
                    padding-right: 30px;
                    font-size: 11px;
                    }
                    thead th {
                    border-bottom: 1px solid #7d878a;
                    cursor: pointer;
                    }
                    td {
                    font-size:11px;
                    padding: 5px;
                    }
                    tr:nth-child(odd) td {
                    background-color: rgba(0,0,0,0.04);
                    }
                    tr:hover td {
                    background-color: #e2edf2;
                    }

                    #content {
                    margin: 0 auto;
                    padding: 2% 5%;
                    max-width: 800px;
                    }

                    .desc {
                    margin: 18px 3px;
                    line-height: 1.2em;
                    }
                    .desc a {
                    color: #5ba4e5;
                    }
                </style>
            </head>
            <body>
                <div id="content">
                    <h1>XML Sitemap</h1>
                    <p class="desc"> This is a sitemap generated by <a
                            href="{{web-url}}">{{web-url}}</a>
                    </p>
                    <xsl:if test="count(sitemap:sitemapindex/sitemap:sitemap) &gt; 0">
                        <table id="sitemap" cellpadding="3">
                            <thead>
                                <tr>
                                    <th width="75%">Sitemap</th>
                                    <th width="25%">Last Modified</th>
                                </tr>
                            </thead>
                            <tbody>
                                <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                                    <xsl:variable name="sitemapURL">
                                        <xsl:value-of select="sitemap:loc" />
                                    </xsl:variable>
                                <tr>
                                        <td>
                                            <a href="{$sitemapURL}">
                                                <xsl:value-of select="sitemap:loc" />
                                            </a>
                                        </td>
                                        <td>
                                            <xsl:value-of
                                                select="concat(substring(sitemap:lastmod,0,11),concat(' ', substring(sitemap:lastmod,12,5)))" />
                                        </td>
                                    </tr>
                                </xsl:for-each>
                            </tbody>
                        </table>
                    </xsl:if>
                    <xsl:if test="count(sitemap:sitemapindex/sitemap:sitemap) &lt; 1">
                        <p class="desc">
                            <a href="{{web-url}}sitemap.xml" class="back-link">&#8592; Back to index</a>
                        </p>
                        <table
                            id="sitemap" cellpadding="3">
                            <thead>
                                <tr>
                                    <th width="70%">URL (<xsl:value-of
                                            select="count(sitemap:urlset/sitemap:url)" /> total)</th>
                                    <th width="15%">Images</th>
                                    <th title="Last Modification Time" width="15%">Last Modified</th>
                                </tr>
                            </thead>
                            <tbody>
                                <xsl:variable name="lower" select="'abcdefghijklmnopqrstuvwxyz'" />
                                <xsl:variable name="upper" select="'ABCDEFGHIJKLMNOPQRSTUVWXYZ'" />
                                <xsl:for-each select="sitemap:urlset/sitemap:url">
                                    <tr>
                                        <td>
                                            <xsl:variable name="itemURL">
                                                <xsl:value-of select="sitemap:loc" />
                                            </xsl:variable>
                                            <a href="{$itemURL}">
                                                <xsl:value-of select="sitemap:loc" />
                                            </a>
                                        </td>
                                        <td>
                                            <xsl:value-of select="count(image:image)" />
                                        </td>
                                        <td>
                                            <xsl:value-of
                                                select="concat(substring(sitemap:lastmod,0,11),concat(' ', substring(sitemap:lastmod,12,5)))" />
                                        </td>
                                    </tr>
                                </xsl:for-each>
                            </tbody>
                        </table>
                        <p
                            class="desc">
                            <a href="{{web-url}}sitemap.xml" class="back-link">&#8592; Back to index</a>
                        </p>
                    </xsl:if>
                </div>
            </body>
        </html>

    </xsl:template>
</xsl:stylesheet>`;

/**
 * @async
 * @function buildClient
 * @memberof clientBuild
 * @param {Object} options - Options for the build process.
 * @param {string} options.deployId - The deployment ID for which to build the client.
 * @param {Array} options.liveClientBuildPaths - List of paths to build incrementally.
 * @param {Array} options.instances - List of instances to build.
 * @param {boolean} options.buildZip - Whether to create zip files of the builds.
 * @param {string|number} options.split - Optional zip split size in MB.
 * @param {boolean} options.fullBuild - Whether to perform a full build.
 * @param {boolean} options.iconsBuild - Whether to build icons.
 * @returns {Promise<void>} - Promise that resolves when the build is complete.
 * @throws {Error} - If the build fails.
 * @memberof clientBuild
 */
const buildClient = async (
  options = {
    deployId: '',
    liveClientBuildPaths: [],
    instances: [],
    buildZip: false,
    split: '',
    fullBuild: false,
    iconsBuild: false,
  },
) => {
  const logger = loggerFactory(import.meta);
  const deployId = options.deployId || process.env.DEPLOY_ID;
  const confClient = readConfJson(deployId, 'client');
  const confServer = readConfJson(deployId, 'server', { loadReplicas: true });
  const confSSR = readConfJson(deployId, 'ssr');
  const packageData = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
  const acmeChallengePath = `/.well-known/acme-challenge`;
  const publicPath = `./public`;

  /**
   * @async
   * @function buildAcmeChallengePath
   * @memberof clientBuild
   * @param {string} acmeChallengeFullPath - Full path to the acme-challenge directory.
   * @returns {void}
   * @throws {Error} - If the directory cannot be created.
   * @memberof clientBuild
   */
  const buildAcmeChallengePath = (acmeChallengeFullPath = '') => {
    fs.mkdirSync(acmeChallengeFullPath, {
      recursive: true,
    });
    fs.writeFileSync(`${acmeChallengeFullPath}/.gitkeep`, '', 'utf8');
  };

  /**
   * @async
   * @function fullBuild
   * @memberof clientBuild
   * @param {Object} options - Options for the full build process.
   * @param {string} options.path - Path to the client directory.
   * @param {Object} options.logger - Logger instance.
   * @param {string} options.client - Client name.
   * @param {Object} options.db - Database configuration.
   * @param {Array} options.dists - List of distributions to build.
   * @param {string} options.rootClientPath - Full path to the client directory.
   * @param {string} options.acmeChallengeFullPath - Full path to the acme-challenge directory.
   * @param {string} options.publicClientId - Public client ID.
   * @param {boolean} options.iconsBuild - Whether to build icons.
   * @param {Object} options.metadata - Metadata for the client.
   * @param {boolean} options.publicCopyNonExistingFiles - Whether to copy non-existing files from public directory.
   * @returns {Promise<void>} - Promise that resolves when the full build is complete.
   * @throws {Error} - If the full build fails.
   * @memberof clientBuild
   */
  const fullBuild = async ({
    path,
    logger,
    client,
    db,
    dists,
    rootClientPath,
    acmeChallengeFullPath,
    publicClientId,
    iconsBuild,
    metadata,
    publicCopyNonExistingFiles,
  }) => {
    logger.warn('Full build', rootClientPath);

    buildAcmeChallengePath(acmeChallengeFullPath);

    fs.removeSync(rootClientPath);

    if (fs.existsSync(`./src/client/public/${publicClientId}`)) {
      if (iconsBuild === true) await buildIcons({ publicClientId, metadata });

      fs.copySync(`./src/client/public/${publicClientId}`, rootClientPath, {
        filter: (sourcePath) => !sourcePath.split(dir.sep).includes('.git'),
      });
    } else if (fs.existsSync(`./engine-private/src/client/public/${publicClientId}`)) {
      fs.copySync(`./engine-private/src/client/public/${publicClientId}`, rootClientPath, {
        filter: (sourcePath) => !sourcePath.split(dir.sep).includes('.git'),
      });
    }
    if (dists)
      for (const dist of dists) {
        if ('folder' in dist) {
          if (fs.statSync(dist.folder).isDirectory()) {
            fs.mkdirSync(`${rootClientPath}${dist.public_folder}`, { recursive: true });
            fs.copySync(dist.folder, `${rootClientPath}${dist.public_folder}`);
          } else {
            const folder = dist.public_folder.split('/');
            folder.pop();
            fs.mkdirSync(`${rootClientPath}${folder.join('/')}`, { recursive: true });
            fs.copyFileSync(dist.folder, `${rootClientPath}${dist.public_folder}`);
          }
        }
        if ('styles' in dist) {
          fs.mkdirSync(`${rootClientPath}${dist.public_styles_folder}`, { recursive: true });
          fs.copySync(dist.styles, `${rootClientPath}${dist.public_styles_folder}`);
        }
      }

    if (publicCopyNonExistingFiles)
      copyNonExistingFiles(`./src/client/public/${publicCopyNonExistingFiles}`, rootClientPath);
  };

  // { srcBuildPath, publicBuildPath }
  const enableLiveRebuild =
    options && options.liveClientBuildPaths && options.liveClientBuildPaths.length > 0 ? true : false;
  const isDevelopment = process.env.NODE_ENV === 'development';

  let currentPort = parseInt(process.env.PORT) + 1;
  for (const host of Object.keys(confServer)) {
    const paths = orderArrayFromAttrInt(Object.keys(confServer[host]), 'length', 'asc');
    for (const path of paths) {
      if (
        options &&
        options.instances &&
        options.instances.length > 0 &&
        !options.instances.find((i) => i.path === path && i.host === host)
      )
        continue;
      const {
        runtime,
        client,
        directory,
        disabledRebuild,
        db,
        redirect,
        apis,
        apiBaseProxyPath,
        apiBaseHost,
        ttiLoadTimeLimit,
        singleReplica,
        docs,
      } = confServer[host][path];
      if (singleReplica) continue;
      if (!confClient[client]) confClient[client] = {};
      const { components, dists, views, services, metadata, publicRef, publicCopyNonExistingFiles } =
        confClient[client];
      let backgroundImage;
      if (metadata) {
        backgroundImage = metadata.backgroundImage;
        if (metadata.thumbnail) metadata.thumbnail = `${path === '/' ? path : `${path}/`}${metadata.thumbnail}`;
      }
      const rootClientPath = directory ? directory : `${publicPath}/${host}${path}`;
      const port = newInstance(currentPort);
      const publicClientId = publicRef ? publicRef : client;
      const fullBuildEnabled = options.fullBuild && !enableLiveRebuild;
      // const baseHost = process.env.NODE_ENV === 'production' ? `https://${host}` : `http://localhost:${port}`;
      const baseHost = process.env.NODE_ENV === 'production' ? `https://${host}` : ``;
      const minifyBuild = process.env.NODE_ENV === 'production';
      // ''; // process.env.NODE_ENV === 'production' ? `https://${host}` : ``;
      currentPort++;

      const acmeChallengeFullPath = directory
        ? `${directory}${acmeChallengePath}`
        : `${publicPath}/${host}${acmeChallengePath}`;

      if (!enableLiveRebuild) buildAcmeChallengePath(acmeChallengeFullPath);

      if (redirect || disabledRebuild) continue;

      if (fullBuildEnabled)
        await fullBuild({
          path,
          logger,
          client,
          db,
          dists,
          rootClientPath,
          acmeChallengeFullPath,
          publicClientId,
          iconsBuild: options.iconsBuild,
          metadata,
          publicCopyNonExistingFiles,
        });

      if (components)
        for (const module of Object.keys(components)) {
          if (!fs.existsSync(`${rootClientPath}/components/${module}`))
            fs.mkdirSync(`${rootClientPath}/components/${module}`, { recursive: true });

          for (const component of components[module]) {
            const jsSrcPath = `./src/client/components/${module}/${component}.js`;
            const jsPublicPath = `${rootClientPath}/components/${module}/${component}.js`;

            if (enableLiveRebuild && !options.liveClientBuildPaths.find((p) => p.srcBuildPath === jsSrcPath)) continue;

            const jsSrc = await transformClientJs(jsSrcPath, {
              dists,
              proxyPath: path,
              basePath: 'components',
              module,
              baseHost,
              minify: minifyBuild,
            });
            fs.writeFileSync(jsPublicPath, jsSrc, 'utf8');
          }
        }

      if (services) {
        for (const module of services) {
          if (!fs.existsSync(`${rootClientPath}/services/${module}`))
            fs.mkdirSync(`${rootClientPath}/services/${module}`, { recursive: true });
          const moduleDir = `./src/client/services/${module}`;
          if (!fs.existsSync(moduleDir)) continue;

          const serviceFiles = fs
            .readdirSync(moduleDir)
            .filter((name) => name.endsWith('.service.js') || name.endsWith('.management.js'))
            .sort();

          for (const serviceFile of serviceFiles) {
            const jsSrcPath = `${moduleDir}/${serviceFile}`;
            const jsPublicPath = `${rootClientPath}/services/${module}/${serviceFile}`;

            if (enableLiveRebuild && !options.liveClientBuildPaths.find((p) => p.srcBuildPath === jsSrcPath)) continue;

            const jsSrc = await transformClientJs(jsSrcPath, {
              dists,
              proxyPath: path,
              basePath: 'services',
              module,
              baseHost,
              minify: minifyBuild,
            });
            fs.writeFileSync(jsPublicPath, jsSrc, 'utf8');
          }
        }
      }

      const buildId = `${client}.index`;
      const siteMapLinks = [];
      const ssrPath = path === '/' ? path : `${path}/`;
      const Render = await ssrFactory();

      if (views) {
        const jsSrcPath = `./src/client/sw/core.sw.js`;

        const jsPublicPath = `${rootClientPath}/sw.js`;

        if (!(enableLiveRebuild && !options.liveClientBuildPaths.find((p) => p.srcBuildPath === jsSrcPath))) {
          const jsSrc = await transformClientJs(jsSrcPath, {
            dists,
            proxyPath: path,
            baseHost,
            minify: minifyBuild,
            externalizeBareImports: false,
          });

          fs.writeFileSync(jsPublicPath, jsSrc, 'utf8');
        }

        if (
          !(
            enableLiveRebuild &&
            !options.liveClientBuildPaths.find(
              (p) => p.srcBuildPath.startsWith(`./src/client/ssr`) || p.srcBuildPath.slice(-9) === '.index.js',
            )
          )
        )
          for (const view of views) {
            const buildPath = `${
              rootClientPath[rootClientPath.length - 1] === '/' ? rootClientPath.slice(0, -1) : rootClientPath
            }${view.path === '/' ? view.path : `${view.path}/`}`;

            if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath, { recursive: true });

            logger.info('View build', buildPath);

            const jsSrc = await transformClientJs(`./src/client/${view.client}.index.js`, {
              dists,
              proxyPath: path,
              baseHost,
              minify: minifyBuild,
            });

            fs.writeFileSync(`${buildPath}${buildId}.js`, jsSrc, 'utf8');
            const title = metadata.title ? metadata.title : title;

            const canonicalURL = `https://${host}${path}${
              view.path === '/' ? (path === '/' ? '' : '/') : path === '/' ? `${view.path.slice(1)}/` : `${view.path}/`
            }`;

            let ssrHeadComponents = ``;
            let ssrBodyComponents = ``;
            if ('ssr' in view) {
              // https://metatags.io/
              if (process.env.NODE_ENV === 'production' && !confSSR[view.ssr].head.includes('Production'))
                confSSR[view.ssr].head.unshift('Production');

              for (const ssrHeadComponent of confSSR[view.ssr].head) {
                const SrrComponent = await ssrFactory(`./src/client/ssr/head/${ssrHeadComponent}.js`);

                switch (ssrHeadComponent) {
                  case 'Pwa':
                    const validPwaBuild =
                      metadata &&
                      fs.existsSync(`./src/client/public/${publicClientId}/browserconfig.xml`) &&
                      fs.existsSync(`./src/client/public/${publicClientId}/site.webmanifest`);

                    if (validPwaBuild) {
                      // build webmanifest
                      const webmanifestJson = JSON.parse(
                        fs.readFileSync(`./src/client/public/${publicClientId}/site.webmanifest`, 'utf8'),
                      );
                      if (metadata.title) {
                        webmanifestJson.name = metadata.title;
                        webmanifestJson.short_name = metadata.title;
                      }
                      if (metadata.description) {
                        webmanifestJson.description = metadata.description;
                      }
                      if (metadata.themeColor) {
                        webmanifestJson.theme_color = metadata.themeColor;
                        webmanifestJson.background_color = metadata.themeColor;
                      }
                      fs.writeFileSync(
                        `${buildPath}site.webmanifest`,
                        JSON.stringify(webmanifestJson, null, 4).replaceAll(`: "/`, `: "${ssrPath}`),
                        'utf8',
                      );
                      // build browserconfig
                      fs.writeFileSync(
                        `${buildPath}browserconfig.xml`,
                        fs
                          .readFileSync(`./src/client/public/${publicClientId}/browserconfig.xml`, 'utf8')
                          .replaceAll(
                            `<TileColor></TileColor>`,
                            metadata.themeColor
                              ? `<TileColor>${metadata.themeColor}</TileColor>`
                              : `<TileColor>#e0e0e0</TileColor>`,
                          )
                          .replaceAll(`src="/`, `src="${ssrPath}`),
                        'utf8',
                      );

                      // Android play store example:
                      //
                      // "related_applications": [
                      //   {
                      //     "platform": "play",
                      //     "url": "https://play.google.com/store/apps/details?id=cheeaun.hackerweb"
                      //   }
                      // ],
                      // "prefer_related_applications": true
                    }
                    if (validPwaBuild) ssrHeadComponents += SrrComponent({ title, ssrPath, canonicalURL, ...metadata });
                    break;
                  case 'Seo':
                    if (metadata) {
                      ssrHeadComponents += SrrComponent({ title, ssrPath, canonicalURL, ...metadata });
                    }
                    break;
                  case 'Microdata':
                    if (
                      fs.existsSync(`./src/client/public/${publicClientId}/microdata.json`) // &&
                      // path === '/' &&
                      // view.path === '/'
                    ) {
                      const microdata = JSON.parse(
                        fs.readFileSync(`./src/client/public/${publicClientId}/microdata.json`, 'utf8'),
                      );
                      ssrHeadComponents += SrrComponent({ microdata });
                    }
                    break;
                  default:
                    ssrHeadComponents += SrrComponent({ ssrPath, host, path });
                    break;
                }
              }

              for (const ssrBodyComponent of confSSR[view.ssr].body) {
                const SrrComponent = await ssrFactory(`./src/client/ssr/body/${ssrBodyComponent}.js`);
                ssrBodyComponents += SrrComponent({
                  ...metadata,
                  ssrPath,
                  host,
                  path,
                  ttiLoadTimeLimit,
                  version: Underpost.version,
                  backgroundImage: backgroundImage ? (path === '/' ? path : `${path}/`) + backgroundImage : undefined,
                });
              }
            }

            /** @type {import('sitemap').SitemapItem} */
            const siteMapLink = {
              url: `${path === '/' ? '' : path}${view.path}`,
              changefreq: 'daily',
              priority: 0.8,
            };
            siteMapLinks.push(siteMapLink);

            const htmlSrc = Render({
              title,
              buildId,
              ssrPath,
              ssrHeadComponents,
              ssrBodyComponents,
              renderPayload: {
                apiBaseProxyPath,
                apiBaseHost,
                apiBasePath: process.env.BASE_API,
                version: Underpost.version,
                ...(isDevelopment ? { dev: true } : undefined),
              },
              renderApi: {
                JSONweb,
              },
            });

            fs.writeFileSync(
              `${buildPath}index.html`,
              minifyBuild
                ? await minify(htmlSrc, {
                    minifyCSS: true,
                    minifyJS: true,
                    collapseBooleanAttributes: true,
                    collapseInlineTagWhitespace: true,
                    collapseWhitespace: true,
                  })
                : htmlSrc,
              'utf8',
            );
          }
      }
      if (!enableLiveRebuild && siteMapLinks.length > 0) {
        const hasSitemapTemplate = fs.existsSync(`${rootClientPath}/sitemap`);
        const sitemapBaseUrl = `https://${host}${path === '/' ? '' : path}`;
        // Create a stream to write to — omit xslUrl so we can inject a relative href below
        /** @type {import('sitemap').SitemapStreamOptions} */
        const sitemapOptions = { hostname: `https://${host}` };

        const siteMapStream = new SitemapStream(sitemapOptions);
        let siteMapSrc = await new Promise((resolve) =>
          streamToPromise(Readable.from(siteMapLinks).pipe(siteMapStream)).then((data) => resolve(data.toString())),
        );

        // Inject a relative xml-stylesheet PI so the XSL loads from the same origin
        // (works on both http://localhost:<port> and https://production-host)
        siteMapSrc = siteMapSrc.replace(
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="sitemap.xsl"?>',
        );

        // Return a promise that resolves with your XML string
        fs.writeFileSync(`${rootClientPath}/sitemap.xml`, siteMapSrc, 'utf8');

        // Generate XSL stylesheet from source template or default fallback
        const xslTemplate = hasSitemapTemplate
          ? fs.readFileSync(`${rootClientPath}/sitemap`, 'utf8')
          : defaultSitemapXsl;
        const webUrl = `https://${host}${path === '/' ? '/' : `${path}/`}`;
        fs.writeFileSync(`${rootClientPath}/sitemap.xsl`, xslTemplate.replaceAll('{{web-url}}', webUrl), 'utf8');

        fs.writeFileSync(
          `${rootClientPath}/robots.txt`,
          `User-agent: *
Sitemap: ${sitemapBaseUrl}/sitemap.xml`,
          'utf8',
        );
      }

      if (fullBuildEnabled && docs) {
        await buildDocs({
          host,
          path,
          port,
          metadata,
          apis,
          publicClientId,
          rootClientPath,
          packageData,
          docs,
        });
      }

      if (client) {
        let PRE_CACHED_RESOURCES = [];

        if (views && fs.existsSync(`${rootClientPath}/sw.js`)) {
          PRE_CACHED_RESOURCES = await fs.readdir(rootClientPath, { recursive: true });
          PRE_CACHED_RESOURCES = views
            .map((view) => `${path === '/' ? '' : path}${view.path}`)
            .concat(
              PRE_CACHED_RESOURCES.map((p) => `/${p}`).filter(
                (p) => p[1] !== '.' && !fs.statSync(`${rootClientPath}${p}`).isDirectory(),
              ),
            );
        }

        for (const pageType of ['offline', 'pages']) {
          if (confSSR[getCapVariableName(client)] && confSSR[getCapVariableName(client)][pageType]) {
            for (const page of confSSR[getCapVariableName(client)][pageType]) {
              const SsrComponent = await ssrFactory(`./src/client/ssr/${pageType}/${page.client}.js`);

              const htmlSrc = Render({
                title: page.title,
                ssrPath,
                ssrHeadComponents: '<base target="_top">',
                ssrBodyComponents: SsrComponent(),
                renderPayload: {
                  apiBaseProxyPath,
                  apiBaseHost,
                  apiBasePath: process.env.BASE_API,
                  version: Underpost.version,
                  ...(isDevelopment ? { dev: true } : undefined),
                },
                renderApi: {
                  JSONweb,
                },
              });

              const buildPath = `${
                rootClientPath[rootClientPath.length - 1] === '/' ? rootClientPath.slice(0, -1) : rootClientPath
              }${page.path === '/' ? page.path : `${page.path}/`}`;

              PRE_CACHED_RESOURCES.push(`${path === '/' ? '' : path}${page.path === '/' ? '' : page.path}/index.html`);

              if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath, { recursive: true });

              const buildHtmlPath = `${buildPath}index.html`;

              logger.info('ssr page build', buildHtmlPath);

              fs.writeFileSync(
                buildHtmlPath,
                minifyBuild
                  ? await minify(htmlSrc, {
                      minifyCSS: true,
                      minifyJS: true,
                      collapseBooleanAttributes: true,
                      collapseInlineTagWhitespace: true,
                      collapseWhitespace: true,
                    })
                  : htmlSrc,
                'utf8',
              );
            }
          }
        }

        {
          const renderPayload = {
            PRE_CACHED_RESOURCES: uniqueArray(PRE_CACHED_RESOURCES),
            PROXY_PATH: path,
          };
          fs.writeFileSync(
            `${rootClientPath}/sw.js`,
            `self.renderPayload = ${JSONweb(renderPayload)};
${fs.readFileSync(`${rootClientPath}/sw.js`, 'utf8')}`,
            'utf8',
          );
        }
      }
      if (!enableLiveRebuild && options.buildZip) {
        logger.warn('build zip', rootClientPath);

        if (!fs.existsSync('./build')) fs.mkdirSync('./build');

        const zip = new AdmZip();
        const files = await fs.readdir(rootClientPath, { recursive: true });

        for (const relativePath of files) {
          const filePath = dir.resolve(`${rootClientPath}/${relativePath}`);
          if (!fs.lstatSync(filePath).isDirectory()) {
            const folder = dir.relative(`public/${host}${path}`, dir.dirname(filePath));
            zip.addLocalFile(filePath, folder);
          }
        }

        const buildId = `${host}-${path.replaceAll('/', '')}`;
        const zipPath = `./build/${buildId}.zip`;

        logger.warn('write zip', zipPath);

        zip.writeZip(zipPath);

        if (options.split) {
          splitFileByMb({
            filePath: zipPath,
            partSizeMb: options.split,
            logger,
          });
          fs.removeSync(zipPath);
          logger.warn('removed original zip after split', { zipPath });
        }
      }
    }
  }
};

export { buildClient, copyNonExistingFiles, unzipClientBuild, mergeClientBuildZip };
