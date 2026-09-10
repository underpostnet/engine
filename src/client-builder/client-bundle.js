/**
 * Client bundle transport: enumerates the zip artifacts a deployment's routes build, uploads
 * them to file storage, and restores them into the served public directory.
 *
 * Push and pull are two directions of one contract, so both resolve their routes, bundle ids,
 * storage keys and part files through the helpers here rather than re-deriving them. Route
 * selection mirrors {@link buildClient}: a route that the build skips produces no artifact for
 * either direction to carry.
 * @module src/client-builder/client-bundle.js
 * @namespace clientBundle
 */

import fs from 'fs-extra';
import UnderpostFileStorage from '../cli/fs.js';
import * as dir from 'path';
import { cli } from '../server/build/execution.js';
import { loadConfServerJson, loadReplicas } from '../server/runtime/conf.js';
import { loggerFactory } from '../server/ops/logger.js';
import { shellArgumentFactory, shellExec } from '../server/runtime/process.js';
import { clientBundleIdFactory, getZipPartPaths, mergeClientBuildZip, unzipClientBuild } from './client-build.js';

const logger = loggerFactory(import.meta);

/** @type {string} Directory `buildClient --build-zip` writes bundles to, and the only place push and pull look. */
const CLIENT_BUNDLE_DIRECTORY = './build';

/** @type {number} Part size in MB applied when the caller names none. */
const DEFAULT_SPLIT_MB = 8;

/** @type {string} `--split` value that turns splitting off. */
const SPLIT_DISABLED = 'none';

const CLIENT_BUNDLE_STORAGE_ID = 'bundle';

/**
 * Resolves the conf.server path a deployment's routes are read from.
 * @function clientBundleConfServerPath
 * @param {string} deployId - The deployment identifier.
 * @returns {string} Path to the deployment's `conf.server.json`.
 * @memberof clientBundle
 */
const clientBundleConfServerPath = (deployId) => `./engine-private/conf/${deployId}/conf.server.json`;

/**
 * Resolves the storage manifest that tracks a deployment's uploaded bundle parts. Push writes
 * it and pull reads it, so both must name the same file.
 * @function clientBundleStorageFilePath
 * @param {string} deployId - The deployment identifier.
 * @returns {string} Path to the deployment's bundle storage manifest.
 * @memberof clientBundle
 */
const clientBundleStorageFilePath = (deployId) =>
  UnderpostFileStorage.API.resolveManifest({ deployId, storageId: CLIENT_BUNDLE_STORAGE_ID });

/**
 * Parses the comma-separated host filter both runners accept as their positional argument.
 * @function clientBundleHostFilter
 * @param {string} [hosts] - Comma-separated host names, or empty for every host.
 * @returns {string[]} The requested hosts, empty when no filter was given.
 * @memberof clientBundle
 */
const clientBundleHostFilter = (hosts = '') =>
  `${hosts ?? ''}`
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

/**
 * Resolves the `--split` option into the flag `underpost client` expects.
 * @function clientBundleSplitFlag
 * @param {string|number} [split] - Part size in MB, or `none` to disable splitting.
 * @returns {string} The flag to append, empty when splitting is disabled.
 * @memberof clientBundle
 */
const clientBundleSplitFlag = (split) => {
  const requested = `${split ?? ''}`.trim();
  if (!requested) return `--split ${DEFAULT_SPLIT_MB}`;
  if (requested === SPLIT_DISABLED) return '';

  const splitMb = Number(requested);
  if (Number.isFinite(splitMb) && splitMb > 0) return `--split ${splitMb}`;

  logger.warn('invalid split option, falling back to the default', { split: requested, default: DEFAULT_SPLIT_MB });
  return `--split ${DEFAULT_SPLIT_MB}`;
};

/**
 * Enumerates the bundles a deployment's routes build to.
 *
 * A route is skipped exactly where {@link buildClient} skips it — redirects and
 * rebuild-disabled routes emit nothing, and a `singleReplica` route's replicas are built under
 * their own deploy ids, so they carry their own manifests rather than the parent's.
 * @function clientBundleEntriesFactory
 * @param {object} options
 * @param {string} options.deployId - The deployment identifier.
 * @param {string[]} [options.hosts] - Optional host filter; empty selects every configured host.
 * @returns {Array<{host: string, routePath: string, buildId: string, zipPath: string, publicPath: string}>}
 *   One entry per bundle, in configuration order.
 * @memberof clientBundle
 */
const clientBundleEntriesFactory = ({ deployId, hosts = [] }) => {
  const confServerPath = clientBundleConfServerPath(deployId);
  if (!fs.existsSync(confServerPath)) {
    logger.warn('conf.server not found', { deployId, confServerPath });
    return [];
  }

  const confServer = loadReplicas(deployId, loadConfServerJson(confServerPath));
  const selectedHosts = hosts.length > 0 ? hosts : Object.keys(confServer);

  return selectedHosts.flatMap((host) => {
    if (!confServer[host]) {
      logger.warn('host not present in conf.server', { deployId, host });
      return [];
    }
    return Object.keys(confServer[host])
      .filter((routePath) => {
        const { redirect, disabledRebuild, singleReplica } = confServer[host][routePath] ?? {};
        return !redirect && !disabledRebuild && !singleReplica;
      })
      .map((routePath) => {
        const buildId = clientBundleIdFactory(host, routePath);
        return {
          host,
          routePath,
          buildId,
          zipPath: `${CLIENT_BUNDLE_DIRECTORY}/${buildId}.zip`,
          publicPath: routePath === '/' ? `public/${host}` : `public/${host}${routePath}`,
        };
      });
  });
};

/**
 * Reads the storage manifest as a plain lookup, for the recorded size of each uploaded artifact.
 * Read-only and tolerant: a manifest that is absent or unreadable disables verification rather
 * than failing the pull, since the artifacts themselves are still what the bundle is made of.
 * @function clientBundleManifestFactory
 * @param {string} deployId - The deployment identifier.
 * @returns {Object<string, {bytes?: number}>} The tracked entries, empty when unavailable.
 * @memberof clientBundle
 */
const clientBundleManifestFactory = (deployId) => {
  const manifestPath = clientBundleStorageFilePath(deployId);
  try {
    return UnderpostFileStorage.API.readManifest({ deployId, storageId: CLIENT_BUNDLE_STORAGE_ID }).storage;
  } catch (error) {
    logger.warn('bundle manifest unreadable, size verification skipped', { manifestPath, error: error?.message });
    return {};
  }
};

/**
 * The tracked keys that belong to one bundle.
 *
 * A bundle owns its zip and every split part of it, and nothing else: the id already carries the
 * route, so `underpost.net-` and `underpost.net-peer` cannot claim each other's parts.
 * @function clientBundleTrackedKeys
 * @param {object} manifest - The bundle storage manifest.
 * @param {string} buildId - The bundle's build id.
 * @returns {string[]} The manifest keys for that bundle.
 * @memberof clientBundle
 */
const clientBundleTrackedKeys = (manifest, buildId) =>
  Object.keys(manifest).filter((key) =>
    key.replace(/^\.\//, '').startsWith(`${CLIENT_BUNDLE_DIRECTORY.replace(/^\.\//, '')}/${buildId}.zip`),
  );

/**
 * Lists the local artifacts that make up one bundle: its split parts when the build split it,
 * otherwise the single zip.
 * @function clientBundleArtifactPaths
 * @param {string} zipPath - The bundle's zip path.
 * @returns {{zipPath: string, partPaths: string[], artifactPaths: string[]}} The resolved artifacts.
 * @memberof clientBundle
 */
const clientBundleArtifactPaths = (zipPath) => {
  const partPaths = fs.existsSync(dir.dirname(zipPath)) ? getZipPartPaths(zipPath) : [];
  const artifactPaths = partPaths.length > 0 ? partPaths : fs.existsSync(zipPath) ? [zipPath] : [];
  return { zipPath, partPaths, artifactPaths };
};

/**
 * Builds a deployment's client bundles and uploads them to file storage.
 *
 * The build and the uploads run as child processes because `underpost app load` writes the
 * `.env` this deployment's credentials live in, and only a freshly started process reads it.
 * @function pushClientBundle
 * @param {object} options
 * @param {string} options.deployId - The deployment identifier.
 * @param {string[]} [options.hosts] - Optional host filter; empty selects every configured host.
 * @param {string|number} [options.split] - Part size in MB, or `none` to upload one zip.
 * @param {boolean} [options.dev] - Build for development; defaults to production.
 * @returns {{pushed: number, skipped: number}} How many bundles were uploaded and skipped.
 * @memberof clientBundle
 */
const pushClientBundle = ({ deployId, hosts = [], split, dev = false }) => {
  const baseCommand = cli('underpost', { local: true });
  const env = dev ? 'development' : 'production';
  const splitFlag = clientBundleSplitFlag(split);

  shellExec(`${baseCommand} app load --env ${env} --args deploy-id=${deployId}`);
  shellExec(`${baseCommand} client ${deployId} --env ${env} --build-zip${splitFlag ? ` ${splitFlag}` : ''}`);

  const entries = clientBundleEntriesFactory({ deployId, hosts });
  if (entries.length === 0) logger.warn('no bundle routes resolved', { deployId, hosts });

  let pushed = 0;
  let skipped = 0;
  for (const { host, routePath, buildId, zipPath } of entries) {
    const { artifactPaths } = clientBundleArtifactPaths(zipPath);
    if (artifactPaths.length === 0) {
      logger.warn('no bundle artifacts found', { host, routePath, buildId });
      skipped++;
      continue;
    }
    for (const artifactPath of artifactPaths) {
      shellExec(
        `${baseCommand} fs ${artifactPath} --deploy-id ${deployId} --storage-id ${CLIENT_BUNDLE_STORAGE_ID} --force`,
      );
    }

    // Remove obsolete manifest entries only after all current artifacts upload.
    const current = new Set(artifactPaths.map((artifactPath) => artifactPath.replace(/^\.\//, '')));
    const stale = clientBundleTrackedKeys(clientBundleManifestFactory(deployId), buildId).filter(
      (key) => !current.has(key.replace(/^\.\//, '')),
    );
    for (const key of stale) {
      shellExec(
        `${baseCommand} fs --tracked --key ${shellArgumentFactory(key)} ` +
          `--deploy-id ${deployId} --storage-id ${CLIENT_BUNDLE_STORAGE_ID} --rm`,
      );
    }
    if (stale.length > 0) logger.warn('removed bundle parts a smaller build no longer produces', { buildId, stale });

    logger.info('pushed bundle', { host, routePath, artifacts: artifactPaths.length });
    pushed++;
  }
  return { pushed, skipped };
};

/**
 * Downloads a deployment's client bundles from file storage and installs them into the served
 * public directory.
 *
 * Merging and extraction run in-process through the build module; only the download needs a
 * child process, for the same `.env` reason {@link pushClientBundle} documents.
 * @function pullClientBundle
 * @param {object} options
 * @param {string} options.deployId - The deployment identifier.
 * @param {string[]} [options.hosts] - Optional host filter; empty selects every configured host.
 * @param {boolean} [options.dev] - Pull the development environment; defaults to production.
 * @returns {Promise<{pulled: number, skipped: number}>} How many bundles were installed and skipped.
 * @memberof clientBundle
 */
const expectedBundleBytes = ({ manifest, partPaths }) => {
  const sizes = partPaths.map((partPath) => manifest[clientBundleManifestKey(partPath)]?.bytes);
  return sizes.every((bytes) => Number.isFinite(bytes)) ? sizes.reduce((total, bytes) => total + bytes, 0) : undefined;
};

/**
 * The manifest key a locally pulled part corresponds to. A pull writes the downloaded archive as
 * `<key>.zip`, so the wrapper suffix is what has to come off to address the entry that produced it.
 * @function clientBundleManifestKey
 * @param {string} partPath - Local path of a pulled part.
 * @returns {string} The tracked storage key.
 * @memberof clientBundle
 */
const clientBundleManifestKey = (partPath) => partPath.replace(/^\.\//, '').replace(/\.zip$/i, '');

const pullClientBundle = async ({ deployId, hosts = [], dev = false }) => {
  const baseCommand = cli('underpost', { local: true });
  const env = dev ? 'development' : 'production';

  const entries = clientBundleEntriesFactory({ deployId, hosts });
  if (entries.length === 0) {
    logger.error('no bundle routes resolved', { deployId, hosts });
    return { pulled: 0, skipped: 0 };
  }

  shellExec(`${baseCommand} app load --env ${env} --args deploy-id=${deployId}`);
  fs.mkdirSync(CLIENT_BUNDLE_DIRECTORY, { recursive: true });
  shellExec(
    `${baseCommand} fs ${CLIENT_BUNDLE_DIRECTORY.replace(/^\.\//, '')} --tracked --deploy-id ${deployId} ` +
      `--storage-id ${CLIENT_BUNDLE_STORAGE_ID} --pull --omit-unzip`,
  );

  const manifest = clientBundleManifestFactory(deployId);

  let pulled = 0;
  let skipped = 0;
  for (const { host, routePath, buildId, zipPath, publicPath } of entries) {
    const { partPaths, artifactPaths } = clientBundleArtifactPaths(zipPath);
    if (artifactPaths.length === 0) {
      logger.warn('bundle not found, skipping', { host, routePath, buildId, zipPath });
      skipped++;
      continue;
    }

    if (partPaths.length > 0) {
      const { mergedBytes } = await mergeClientBuildZip({ buildPrefix: zipPath, logger });
      // The parts are reassembled blind, so a single stale or short one is only visible as a
      // corrupt archive far downstream. The pushed sizes are what identify it here instead.
      const expectedBytes = expectedBundleBytes({ manifest, partPaths });
      if (expectedBytes !== undefined && expectedBytes !== mergedBytes)
        throw new Error(
          `Bundle ${buildId} reassembled to ${mergedBytes} bytes, expected ${expectedBytes} from ${partPaths.length} pushed parts`,
        );
    }
    const { outputPath } = await unzipClientBuild({ buildPrefix: zipPath, logger });

    fs.removeSync(zipPath);
    for (const partPath of partPaths) fs.removeSync(partPath);

    if (!fs.existsSync(outputPath)) {
      logger.warn('extracted bundle directory not found, skipping', { host, routePath, outputPath });
      skipped++;
      continue;
    }

    // The previous deployment's document root can be owned by the web server user, so the
    // replace goes through sudo; the extracted tree this process just wrote does not.
    shellExec(`sudo rm -rf ${publicPath}`);
    if (routePath !== '/') shellExec(`sudo mkdir -p public/${host}`);
    fs.copySync(outputPath, publicPath);

    logger.info('pulled bundle', { host, routePath, publicPath });
    pulled++;
  }
  return { pulled, skipped };
};

export {
  CLIENT_BUNDLE_DIRECTORY,
  clientBundleTrackedKeys,
  clientBundleManifestFactory,
  clientBundleManifestKey,
  DEFAULT_SPLIT_MB,
  clientBundleArtifactPaths,
  clientBundleConfServerPath,
  clientBundleEntriesFactory,
  clientBundleHostFilter,
  clientBundleSplitFlag,
  clientBundleStorageFilePath,
  pullClientBundle,
  pushClientBundle,
};
