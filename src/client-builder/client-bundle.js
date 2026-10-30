/**
 * Client bundle transport: the host builds the clients of a deployment once, publishes them to the
 * object store as one immutable release artifact, and every runtime restores that exact artifact into
 * its served public directory. A runtime never builds the client.
 *
 * A bundle holds one ZIP per routed client, cut into parts. Its objects, under {@link CLIENT_BUNDLE_ROOT}:
 *
 *     <deploy-id>/<release-id>/<build-id>/parts/<route bundle id>/<sequence>
 *     <deploy-id>/<release-id>/<build-id>/manifest.json
 *
 * The manifest is stored last and is the commit point: a build without one is never restored. It
 * names every part and every ZIP with its size and SHA-256, and the TypeDoc entry of each documented
 * route. A reference pins one bundle by the SHA-256 of its manifest:
 * `<release-id>/<build-id>@sha256:<digest>`. Keys never repeat, and the store never replaces an
 * object with other bytes.
 *
 * The host keeps the record and the log of each build under {@link CLIENT_BUNDLE_RECORDS_ROOT}, and
 * `engine-private/conf/<deploy-id>/client-bundle.json` names the bundle the deployment last published.
 * Route selection mirrors {@link buildClient}: a route the build skips carries no artifact.
 * @module src/client-builder/client-bundle.js
 * @namespace clientBundle
 */

import crypto from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import Underpost from '../index.js';
import { BUILD_MANIFEST_FILE } from '../client/components/core/BuildManifest.js';
import { orderArrayFromAttrInt } from '../client/components/core/CommonJs.js';
import { TYPEDOC_DIRECTORY, TYPEDOC_PREVIEW, typedocOptionsFactory } from '../server/build/docs.js';
import { publishDirectory, recoverPublication, stagingDirectoryFactory } from '../server/build/publication.js';
import { loggerFactory } from '../server/ops/logger.js';
import { git } from '../server/release/release-workspace.js';
import { assertReleaseId } from '../server/release/source-release.js';
import { loadConfServerJson, loadReplicas } from '../server/runtime/conf.js';
import { acquireHostLock, hostLockName } from '../server/runtime/host-lock.js';
import {
  INTERRUPT_SIGNALS,
  WARNING_EVENTS,
  runManagedProcess,
  runMetricsFactory,
  taskAdmissionFactory,
  terminationReason,
} from '../server/runtime/managed-process.js';
import { packageManifestFactory } from '../server/runtime/process.js';
import { objectStore } from '../server/storage/object-store.js';
import { extractZipTo } from '../server/storage/zip.js';
import { clientBuildIdFactory, clientBundleIdFactory, getZipPartPaths } from './client-build.js';
import { TYPEDOC_RUN_RECORD, typedocSiteProblems } from './client-build-docs.js';

const logger = loggerFactory(import.meta);

/** @type {string} Directory `buildClient --build-zip` writes bundles to. */
const CLIENT_BUNDLE_DIRECTORY = './build';

/** @type {number} Part size in MB applied when the caller names none. */
const DEFAULT_SPLIT_MB = 8;

/** @type {string} `--split` value that turns splitting off. */
const SPLIT_DISABLED = 'none';

/** The key prefix of every client bundle. */
const CLIENT_BUNDLE_ROOT = 'underpost/client-bundles';

/** The manifest schema this engine writes and reads. */
const CLIENT_BUNDLE_SCHEMA = 1;

/** The build records of a host: `UNDERPOST_CLIENT_BUNDLE_RECORDS`, else `/home/dd/client-bundles`. */
const CLIENT_BUNDLE_RECORDS_ROOT = process.env.UNDERPOST_CLIENT_BUNDLE_RECORDS || '/home/dd/client-bundles';

/** Published bundles a prune keeps beyond the ones a deployment references. */
const CLIENT_BUNDLES_KEEP = 2;

/** The client build runs below the priority of the workloads the host serves. */
const CLIENT_BUILD_PROFILE = 'build';

/** Objects in flight to or from the store at once. */
const TRANSFER_CONCURRENCY = 3;

const CLI_ENTRY = fileURLToPath(new URL('../../bin/index.js', import.meta.url));
const BUILD_ID_PATTERN = /^client-\d{17}-\d+$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const readJson = (path) => {
  try {
    return fs.readJsonSync(path);
  } catch {
    return null;
  }
};

const writeJson = (path, value) => {
  fs.mkdirpSync(nodePath.dirname(path));
  fs.writeJsonSync(`${path}.tmp`, value, { spaces: 2 });
  fs.renameSync(`${path}.tmp`, path);
};

/** Runs `worker` over `items`, {@link TRANSFER_CONCURRENCY} at once; the first error stops the queue. */
const eachLimited = async (items, worker) => {
  const queue = [...items];
  let failure = null;
  await Promise.all(
    Array.from({ length: Math.min(TRANSFER_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0 && !failure)
        try {
          await worker(queue.shift());
        } catch (error) {
          failure ??= error;
        }
    }),
  );
  if (failure) throw failure;
};

/**
 * Resolves the conf.server path a deployment's routes are read from.
 * @function clientBundleConfServerPath
 * @param {string} deployId - The deployment identifier.
 * @returns {string} Path to the deployment's `conf.server.json`.
 * @memberof clientBundle
 */
const clientBundleConfServerPath = (deployId) => `./engine-private/conf/${deployId}/conf.server.json`;

/**
 * The deployment conf file that names the bundle the deployment last published.
 * @function clientBundlePointerPath
 * @param {string} deployId - The deployment identifier.
 * @returns {string}
 * @memberof clientBundle
 */
const clientBundlePointerPath = (deployId) => `./engine-private/conf/${deployId}/client-bundle.json`;

/**
 * Parses the comma-separated host filter the runners accept as their positional argument.
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
 * Resolves the `--split` option into a part size.
 * @function clientBundleSplitMb
 * @param {string|number} [split] - Part size in MB, or `none` to disable splitting.
 * @returns {number|null} Part size in MB, null when splitting is disabled.
 * @memberof clientBundle
 */
const clientBundleSplitMb = (split) => {
  const requested = `${split ?? ''}`.trim();
  if (!requested) return DEFAULT_SPLIT_MB;
  if (requested === SPLIT_DISABLED) return null;

  const splitMb = Number(requested);
  if (Number.isFinite(splitMb) && splitMb > 0) return splitMb;

  logger.warn('invalid split option, falling back to the default', { split: requested, default: DEFAULT_SPLIT_MB });
  return DEFAULT_SPLIT_MB;
};

/**
 * The reference of one published bundle.
 * @function clientBundleReferenceFactory
 * @param {{releaseId: string, buildId: string, digest: string}} params - `digest` is the SHA-256 of the manifest.
 * @returns {string} `<release-id>/<build-id>@sha256:<digest>`.
 * @memberof clientBundle
 */
const clientBundleReferenceFactory = ({ releaseId, buildId, digest }) => `${releaseId}/${buildId}@sha256:${digest}`;

/**
 * Parses a bundle reference.
 * @function clientBundleReferenceOf
 * @param {string} reference - `<release-id>/<build-id>@sha256:<digest>`.
 * @returns {{releaseId: string, buildId: string, digest: string}}
 * @throws {Error} On a reference that does not pin one bundle.
 * @memberof clientBundle
 */
const clientBundleReferenceOf = (reference) => {
  const [path = '', digest = ''] = `${reference ?? ''}`.trim().split('@sha256:');
  const [releaseId = '', buildId = '', ...rest] = path.split('/');
  if (rest.length > 0 || !BUILD_ID_PATTERN.test(buildId) || !DIGEST_PATTERN.test(digest))
    throw new Error(`Invalid client bundle reference "${reference}": expected <release-id>/<build-id>@sha256:<digest>`);
  return { releaseId: assertReleaseId(releaseId), buildId, digest };
};

const bundlePrefix = ({ deployId, releaseId, buildId }) => `${CLIENT_BUNDLE_ROOT}/${deployId}/${releaseId}/${buildId}/`;

const docsEntry = (version) => `${TYPEDOC_DIRECTORY}/${version}/index.html`;

/**
 * Enumerates the bundles a deployment's routes build to, parents before the routes nested in them.
 *
 * A route is skipped exactly where {@link buildClient} skips it — redirects and rebuild-disabled
 * routes emit nothing, and a `singleReplica` route's replicas are built under their own deploy ids.
 * A route is documented when its client declares documentation and TypeDoc has a config for it.
 * @function clientBundleEntriesFactory
 * @param {object} options
 * @param {string} options.deployId - The deployment identifier.
 * @param {string[]} [options.hosts] - Optional host filter; empty selects every configured host.
 * @returns {Array<{host: string, routePath: string, bundleId: string, zipPath: string, publicPath: string,
 *   documented: boolean}>} One entry per bundle.
 * @memberof clientBundle
 */
const clientBundleEntriesFactory = ({ deployId, hosts = [] }) => {
  const confServerPath = clientBundleConfServerPath(deployId);
  if (!fs.existsSync(confServerPath)) {
    logger.warn('conf.server not found', { deployId, confServerPath });
    return [];
  }

  const confServer = loadReplicas(deployId, loadConfServerJson(confServerPath));
  const confClient = readJson(`./engine-private/conf/${deployId}/conf.client.json`) ?? {};
  const selectedHosts = hosts.length > 0 ? hosts : Object.keys(confServer);

  return selectedHosts.flatMap((host) => {
    if (!confServer[host]) {
      logger.warn('host not present in conf.server', { deployId, host });
      return [];
    }
    return orderArrayFromAttrInt(Object.keys(confServer[host]), 'length', 'asc')
      .filter((routePath) => {
        const { redirect, disabledRebuild, singleReplica } = confServer[host][routePath] ?? {};
        return !redirect && !disabledRebuild && !singleReplica;
      })
      .map((routePath) => {
        const bundleId = clientBundleIdFactory(host, routePath);
        const docs = confClient[confServer[host][routePath].client]?.docs;
        return {
          host,
          routePath,
          bundleId,
          zipPath: `${CLIENT_BUNDLE_DIRECTORY}/${bundleId}.zip`,
          publicPath: routePath === '/' ? `public/${host}` : `public/${host}${routePath}`,
          documented: Boolean(docs && typedocOptionsFactory({ docs })),
        };
      });
  });
};

/**
 * The local artifacts of one bundle: its split parts when the build split it, otherwise the zip.
 * @function clientBundleArtifactPaths
 * @param {string} zipPath - The bundle's zip path.
 * @returns {string[]} Artifact paths in order, empty when the build wrote none.
 * @memberof clientBundle
 */
const clientBundleArtifactPaths = (zipPath) => {
  const partPaths = fs.existsSync(nodePath.dirname(zipPath)) ? getZipPartPaths(zipPath) : [];
  return partPaths.length > 0 ? partPaths : fs.existsSync(zipPath) ? [zipPath] : [];
};

/**
 * The problems of the client tree of one route; a tree without problems can be published. A
 * documented route carries the TypeDoc site of exactly the engine version it is built from, published
 * by the build that started at `since`.
 * @function clientBundleTreeProblems
 * @param {string} tree - The client tree of the route.
 * @param {{documented: boolean, version: string, since: string}} params
 * @returns {string[]} Problems, empty for a complete tree.
 * @memberof clientBundle
 */
const clientBundleTreeProblems = (tree, { documented, version, since }) => {
  const problems = [BUILD_MANIFEST_FILE, 'index.html']
    .filter((file) => !fs.existsSync(`${tree}/${file}`) || fs.statSync(`${tree}/${file}`).size === 0)
    .map((file) => `${file} is missing or empty`);
  if (!documented) return problems;
  const sites = `${tree}/${TYPEDOC_DIRECTORY}`;
  const versions = fs.existsSync(sites)
    ? fs.readdirSync(sites).filter((entry) => !entry.startsWith('.') && entry !== TYPEDOC_PREVIEW)
    : [];
  const others = versions.filter((entry) => entry !== version);
  if (others.length > 0) problems.push(`${TYPEDOC_DIRECTORY} holds other versions: ${others.join(', ')}`);
  if (!versions.includes(version)) return [...problems, `${TYPEDOC_DIRECTORY}/${version} is missing`];
  problems.push(
    ...typedocSiteProblems(`${sites}/${version}`).map((problem) => `${TYPEDOC_DIRECTORY}/${version}: ${problem}`),
  );
  const { published } = readJson(`${sites}/${TYPEDOC_RUN_RECORD}`) ?? {};
  if (published?.version !== version || !(Date.parse(published.at) >= Date.parse(since)))
    problems.push(`${TYPEDOC_DIRECTORY}/${version} was not published by this build`);
  return problems;
};

/** Fills what the process environment lacks from the deployment environment: the object store credentials. */
const fillDeployEnv = (deployId, env) => {
  for (const [key, value] of Object.entries(Underpost.app.read({ env, args: { 'deploy-id': deployId } })))
    process.env[key] ??= value;
};

/**
 * Every git checkout the build reads: the engine root and each checkout directly under it, with the
 * remote it was fetched from, without credentials.
 * @param {string} [root='.']
 * @returns {Array<{path: string, remote: string|null, revision: string, dirty: boolean}>}
 */
const sourcesFactory = (root = '.') =>
  ['.', ...fs.readdirSync(root).filter((name) => fs.existsSync(nodePath.join(root, name, '.git')))].map((path) => {
    const dir = nodePath.join(root, path);
    // Without an `origin` remote, git prints the name back.
    const remote = git(dir, ['ls-remote', '--get-url', 'origin']);
    return {
      path,
      remote: remote === 'origin' ? null : remote.replace(/\/\/[^@/]+@/, '//'),
      revision: git(dir, ['rev-parse', 'HEAD']),
      dirty: git(dir, ['status', '--porcelain']) !== '',
    };
  });

const clientBundleLock = (deployId) =>
  acquireHostLock({
    name: hostLockName('client-bundle', clientBundleConfServerPath(deployId)),
    onWait: (holders) =>
      logger.warn('TASK_DEFERRED', {
        deployId,
        lock: 'client-bundle',
        holders: holders.map(({ pid, command }) => ({ pid, command })),
      }),
  });

const readClientBundlePointer = (deployId) => {
  const path = clientBundlePointerPath(deployId);
  if (!fs.existsSync(path))
    throw new Error(
      `No client bundle named: pass --bundle, or publish one with \`run push-bundle --deploy-id ${deployId}\``,
    );
  return fs.readJsonSync(path).reference;
};

/**
 * Runs the client build of a bundle as a managed task, below the priority of the workloads the host
 * serves: it starts only when the host has memory above its reserve, and stops when the host falls
 * below it. It builds the client assets, the SSR views and the TypeDoc sites, and packs every route.
 * Each TypeDoc is a managed task of its own, in its own kernel scope where the host has one, so the
 * build itself runs under the monitor. An explicit TypeDoc build fails it.
 * @function clientBundleBuild
 * @param {{deployId: string, env: string, splitMb: number|null, buildId: string, logPath: string}} params
 * @returns {Promise<{reason: string, detail?: string, command: string[], resources?: object}>} `reason`
 *   is `completed`, `rejected`, or how the managed process runner names the end of the run.
 * @memberof clientBundle
 */
const clientBundleBuild = async ({ deployId, env, splitMb, buildId, logPath }) => {
  const command = ['client', deployId, '--env', env, '--docs', 'build', '--build-zip'];
  if (splitMb) command.push('--split', `${splitMb}`);
  command.push('--build-id', buildId);
  const event = (name, fields = {}) =>
    logger[WARNING_EVENTS.has(name) ? 'warn' : 'info'](name, { buildId, task: 'client-build', ...fields });
  const task = taskAdmissionFactory({ profile: CLIENT_BUILD_PROFILE });
  if (!task.admitted) {
    event('TASK_REJECTED', { capacity: task.capacity, reason: task.reason });
    return { reason: 'rejected', detail: task.reason, command };
  }
  event('TASK_ADMITTED', {
    profile: CLIENT_BUILD_PROFILE,
    hostAvailableBytes: task.capacity.availableMemoryBytes,
    reserveBytes: task.budget.reserveBytes,
    allowanceBytes: task.budget.memoryBytes,
    threads: task.budget.threads,
    nice: task.budget.nice,
    enforcement: task.enforcement,
  });
  const control = {};
  const stop = (signal) => control.stop?.(signal);
  for (const signal of INTERRUPT_SIGNALS) process.on(signal, stop);
  try {
    const outcome = await runManagedProcess({
      command: process.execPath,
      args: [CLI_ENTRY, ...command],
      cwd: process.cwd(),
      budget: task.budget,
      diagnose: true,
      control,
      logPath,
      onEvent: event,
    });
    return {
      reason: terminationReason(outcome),
      detail: outcome.overBudget || `exit ${outcome.exitCode ?? outcome.signal}`,
      command,
      resources: { profile: CLIENT_BUILD_PROFILE, ...runMetricsFactory({ outcome, budget: task.budget }) },
    };
  } finally {
    for (const signal of INTERRUPT_SIGNALS) process.off(signal, stop);
  }
};

/**
 * Stores the parts of a bundle, then its manifest. Each put returns once the store reports the bytes
 * it holds; a failed publication removes what it stored.
 * @returns {Promise<string>} The SHA-256 of the stored manifest.
 */
const publishClientBundle = async ({ store, prefix, manifest, uploads }) => {
  const manifestKey = `${prefix}manifest.json`;
  try {
    await eachLimited(uploads, ({ key, path }) => store.put(key, fs.readFileSync(path)));
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2));
    await store.put(manifestKey, bytes);
    return sha256(bytes);
  } catch (error) {
    await store
      .remove([...uploads.map(({ key }) => key), manifestKey])
      .catch((cleanup) => logger.warn('Client bundle objects left in the store', { prefix, error: cleanup.message }));
    throw error;
  }
};

/**
 * Builds the clients of a deployment once and publishes them as one bundle.
 *
 * Under a host lock per deployment: the managed client build, the check of every route tree, the
 * SHA-256 of every part and ZIP, the upload, and the manifest last. Only then does the deployment conf
 * name the bundle. A failure publishes nothing, and the host record says why.
 * @function pushClientBundle
 * @param {object} options
 * @param {string} options.deployId - The deployment identifier.
 * @param {string[]} [options.hosts] - Optional host filter; empty selects every configured host.
 * @param {string|number} [options.split] - Part size in MB, or `none` for one part per route.
 * @param {boolean} [options.dev] - Build for development; defaults to production.
 * @param {string} [options.releaseId] - The deploy release; defaults to `v<version>-<engine commit>`.
 * @param {string} [options.image] - The runtime image the release deploys.
 * @param {object} [options.store] - Object store; defaults to the one the environment selects.
 * @param {string} [options.root] - Build records root.
 * @param {typeof clientBundleBuild} [options.build] - Runs the client build.
 * @returns {Promise<{reference: string, manifest: object}>}
 * @memberof clientBundle
 */
const pushClientBundle = async ({
  deployId,
  hosts = [],
  split,
  dev = false,
  releaseId = '',
  image = '',
  store,
  root = CLIENT_BUNDLE_RECORDS_ROOT,
  build = clientBundleBuild,
}) => {
  const env = dev ? 'development' : 'production';
  const entries = clientBundleEntriesFactory({ deployId, hosts });
  if (entries.length === 0) throw new Error(`No route of ${deployId} builds a client bundle`);
  const version = fs.readJsonSync('./package.json').version.replace(/^v/, '');
  const sources = sourcesFactory();
  const release = assertReleaseId(
    releaseId || `v${version}-${sources[0].revision.slice(0, 7)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
  );
  const buildId = clientBuildIdFactory();
  const directory = nodePath.join(root, deployId, release, buildId);
  const record = {
    schema: CLIENT_BUNDLE_SCHEMA,
    status: 'building',
    deployId,
    releaseId: release,
    buildId,
    env,
    builder: os.hostname(),
    startedAt: new Date().toISOString(),
  };
  const lock = await clientBundleLock(deployId);
  try {
    writeJson(`${directory}/build.json`, record);
    logger.info('Client bundle build', { deployId, releaseId: release, buildId, record: directory });
    fillDeployEnv(deployId, env);
    const target = store ?? objectStore();
    record.store = target.location;
    for (const { zipPath } of entries) for (const path of clientBundleArtifactPaths(zipPath)) fs.removeSync(path);

    const result = await build({
      deployId,
      env,
      splitMb: clientBundleSplitMb(split),
      buildId,
      logPath: `${directory}/build.log`,
    });
    Object.assign(record, { command: result.command, resources: result.resources });
    if (result.reason !== 'completed') throw new Error(`The client build ended ${result.reason}: ${result.detail}`);
    const problems = entries.flatMap((entry) =>
      clientBundleTreeProblems(entry.publicPath, {
        documented: entry.documented,
        version,
        since: record.startedAt,
      }).map((problem) => `${entry.host}${entry.routePath}: ${problem}`),
    );
    if (problems.length > 0) throw new Error(`The client build is incomplete: ${problems.join('; ')}`);

    const prefix = bundlePrefix({ deployId, releaseId: release, buildId });
    const uploads = [];
    const routes = entries.map(({ host, routePath, bundleId, zipPath, publicPath, documented }) => {
      const artifactPaths = clientBundleArtifactPaths(zipPath);
      if (artifactPaths.length === 0) throw new Error(`The client build wrote no bundle for ${host}${routePath}`);
      const zip = crypto.createHash('sha256');
      let bytes = 0;
      const parts = artifactPaths.map((path, index) => {
        const content = fs.readFileSync(path);
        zip.update(content);
        bytes += content.length;
        const key = `${prefix}parts/${bundleId}/${String(index + 1).padStart(4, '0')}`;
        uploads.push({ key, path });
        return { key, bytes: content.length, sha256: sha256(content) };
      });
      return {
        host,
        path: routePath,
        bundle: bundleId,
        zip: { bytes, sha256: zip.digest('hex') },
        parts,
        docs: documented
          ? {
              version,
              entry: docsEntry(version),
              sha256: sha256(fs.readFileSync(`${publicPath}/${docsEntry(version)}`)),
            }
          : null,
      };
    });
    record.resources = {
      ...record.resources,
      typedoc: entries
        .filter(({ documented }) => documented)
        .map(({ host, routePath, publicPath }) => ({
          route: `${host}${routePath}`,
          peak: readJson(`${publicPath}/${TYPEDOC_DIRECTORY}/${TYPEDOC_RUN_RECORD}`)?.history?.peak ?? null,
        })),
    };
    const manifest = {
      schema: CLIENT_BUNDLE_SCHEMA,
      deployId,
      releaseId: release,
      buildId,
      env,
      engine: { version, commit: sources[0].revision },
      build: {
        builder: record.builder,
        startedAt: record.startedAt,
        node: process.version,
        typedoc: packageManifestFactory('typedoc').manifest.version,
        command: result.command,
      },
      image: image || null,
      sources,
      routes,
    };
    const digest = await publishClientBundle({ store: target, prefix, manifest, uploads });
    for (const { path } of uploads) fs.removeSync(path);
    record.reference = clientBundleReferenceFactory({ releaseId: release, buildId, digest });
    record.manifest = manifest;
    writeJson(clientBundlePointerPath(deployId), {
      reference: record.reference,
      publishedAt: new Date().toISOString(),
    });
    record.status = 'published';
    logger.info('Client bundle published', {
      reference: record.reference,
      routes: routes.length,
      parts: uploads.length,
      bytes: routes.reduce((total, { zip }) => total + zip.bytes, 0),
    });
    return { reference: record.reference, manifest };
  } catch (error) {
    record.status = 'failed';
    record.error = error.message;
    throw error;
  } finally {
    record.completedAt = new Date().toISOString();
    writeJson(`${directory}/build.json`, record);
    lock.release();
  }
};

/**
 * Reads the manifest a reference pins.
 * @throws {Error} When the bundle is not published, or its manifest is not the one the reference pins.
 */
const readClientBundleManifest = async ({ store, deployId, releaseId, buildId, digest }) => {
  const key = `${bundlePrefix({ deployId, releaseId, buildId })}manifest.json`;
  const bytes = await store.get(key);
  if (!bytes) throw new Error(`Client bundle ${releaseId}/${buildId} of ${deployId} is not published: no ${key}`);
  if (sha256(bytes) !== digest)
    throw new Error(`Client bundle manifest ${key} has SHA-256 ${sha256(bytes)}; the reference pins ${digest}`);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (
    manifest.schema !== CLIENT_BUNDLE_SCHEMA ||
    manifest.deployId !== deployId ||
    manifest.releaseId !== releaseId ||
    manifest.buildId !== buildId
  )
    throw new Error(
      `Client bundle manifest ${key} does not describe ${releaseId}/${buildId} in schema ${CLIENT_BUNDLE_SCHEMA}`,
    );
  return manifest;
};

/** Downloads the parts of one route, checks each and the ZIP they make, and writes the ZIP. */
const downloadRoute = async ({ store, route, zipPath }) => {
  const zip = crypto.createHash('sha256');
  const file = fs.openSync(zipPath, 'w');
  try {
    for (const part of route.parts) {
      const bytes = await store.get(part.key, { maxBytes: part.bytes });
      if (!bytes) throw new Error(`Client bundle part ${part.key} is missing`);
      const digest = sha256(bytes);
      if (bytes.length !== part.bytes || digest !== part.sha256)
        throw new Error(
          `Client bundle part ${part.key} holds ${bytes.length} bytes with SHA-256 ${digest}, not its manifest's`,
        );
      zip.update(bytes);
      fs.writeSync(file, bytes);
    }
  } finally {
    fs.closeSync(file);
  }
  const digest = zip.digest('hex');
  if (digest !== route.zip.sha256)
    throw new Error(
      `Client bundle ${route.bundle} reassembles to SHA-256 ${digest}; its manifest names ${route.zip.sha256}`,
    );
};

/**
 * Restores a bundle into the served public directory.
 *
 * The reference pins the bundle; without one, the deployment conf names it. Every part and every ZIP
 * is checked before any route is replaced. Each route is then extracted beside its public directory,
 * checked, and published in its place, parents first. A failure leaves nothing to serve from this
 * restore and never falls back to a build. A repeated restore gives the same tree.
 * @function pullClientBundle
 * @param {object} options
 * @param {string} options.deployId - The deployment identifier.
 * @param {string[]} [options.hosts] - Optional host filter; empty selects every configured host.
 * @param {boolean} [options.dev] - Read the development environment; defaults to production.
 * @param {string} [options.reference] - The exact bundle.
 * @param {object} [options.store] - Object store; defaults to the one the environment selects.
 * @returns {Promise<{reference: string, restored: number}>}
 * @memberof clientBundle
 */
const pullClientBundle = async ({ deployId, hosts = [], dev = false, reference = '', store }) => {
  const pinned = reference || readClientBundlePointer(deployId);
  const { releaseId, buildId, digest } = clientBundleReferenceOf(pinned);
  fillDeployEnv(deployId, dev ? 'development' : 'production');
  const source = store ?? objectStore();
  const manifest = await readClientBundleManifest({ store: source, deployId, releaseId, buildId, digest });
  const entries = clientBundleEntriesFactory({ deployId, hosts });
  if (entries.length === 0) throw new Error(`No route of ${deployId} restores a client bundle`);
  const routes = entries.map((entry) => {
    const route = manifest.routes.find(({ bundle }) => bundle === entry.bundleId);
    if (!route) throw new Error(`Client bundle ${pinned} carries no ${entry.host}${entry.routePath}`);
    if (Boolean(route.docs) !== entry.documented)
      throw new Error(
        `Client bundle ${pinned} ${route.docs ? 'documents' : 'does not document'} ${entry.host}${entry.routePath}; the deployment conf ${entry.documented ? 'does' : 'does not'}`,
      );
    return { entry, route };
  });
  logger.info('Client bundle restore', { reference: pinned, engine: manifest.engine, image: manifest.image });

  const restore = nodePath.resolve(CLIENT_BUNDLE_DIRECTORY, `.restore-${buildId}`);
  fs.removeSync(restore);
  fs.mkdirpSync(restore);
  try {
    await eachLimited(routes, ({ route }) =>
      downloadRoute({ store: source, route, zipPath: `${restore}/${route.bundle}.zip` }),
    );
    for (const { entry, route } of routes) {
      const target = nodePath.resolve(entry.publicPath);
      fs.mkdirpSync(nodePath.dirname(target));
      recoverPublication(target);
      const staging = stagingDirectoryFactory(target);
      try {
        await extractZipTo(`${restore}/${route.bundle}.zip`, staging);
        const problems = clientBundleTreeProblems(staging, {
          documented: entry.documented,
          version: manifest.engine.version,
          since: manifest.build.startedAt,
        });
        if (problems.length > 0) throw new Error(`Client bundle ${route.bundle} is incomplete: ${problems.join('; ')}`);
        publishDirectory({ staging, target });
      } finally {
        fs.removeSync(staging);
      }
    }
  } finally {
    fs.removeSync(restore);
  }
  logger.info('Client bundle restored', { reference: pinned, routes: routes.map(({ route }) => route.bundle) });
  return { reference: pinned, restored: routes.length };
};

/**
 * Checks once that every documented route of a bundle serves, at its public origin, the TypeDoc entry
 * that bundle holds.
 * @function verifyServedClientBundle
 * @param {object} options
 * @param {string} options.deployId - The deployment identifier.
 * @param {string} [options.reference] - The exact bundle; defaults to the one the deployment conf names.
 * @param {boolean} [options.dev] - Read the development environment; defaults to production.
 * @param {object} [options.store] - Object store; defaults to the one the environment selects.
 * @param {typeof fetch} [options.request] - HTTP client.
 * @returns {Promise<string[]>} The entries that answered.
 * @throws {Error} Naming each entry that answered with other bytes, or not at all.
 * @memberof clientBundle
 */
const verifyServedClientBundle = async ({ deployId, reference = '', dev = false, store, request = fetch }) => {
  const pinned = reference || readClientBundlePointer(deployId);
  const { releaseId, buildId, digest } = clientBundleReferenceOf(pinned);
  fillDeployEnv(deployId, dev ? 'development' : 'production');
  const manifest = await readClientBundleManifest({
    store: store ?? objectStore(),
    deployId,
    releaseId,
    buildId,
    digest,
  });
  const checks = await Promise.all(
    manifest.routes
      .filter(({ docs }) => docs)
      .map(async ({ host, path, docs }) => {
        // The query keeps a cache from answering for the entry this bundle replaces.
        const url = `https://${host}${path === '/' ? '' : path}/${docs.entry}?bundle=${buildId}`;
        try {
          const response = await request(url, { signal: AbortSignal.timeout(10000) });
          const served = sha256(Buffer.from(await response.arrayBuffer()));
          if (!response.ok) return { url, problem: `answered ${response.status}` };
          return { url, problem: served === docs.sha256 ? '' : `serves SHA-256 ${served}, not ${docs.sha256}` };
        } catch (error) {
          return { url, problem: error.message };
        }
      }),
  );
  const failed = checks.filter(({ problem }) => problem);
  if (failed.length > 0)
    throw new Error(
      `Client bundle ${pinned} is not served: ${failed.map(({ url, problem }) => `${url} ${problem}`).join('; ')}`,
    );
  logger.info('Client bundle served', { reference: pinned, entries: checks.map(({ url }) => url) });
  return checks.map(({ url }) => url);
};

/**
 * Removes the bundles of a deployment nothing keeps: kept are the protected ones (the bundles its
 * workloads restore and the new candidate) and the newest `keep` published ones. A build without a
 * manifest is never restored and goes too. The host records follow, but the newest `keep` records of
 * any outcome stay to explain the last builds.
 * @function pruneClientBundles
 * @param {object} options
 * @param {string} options.deployId - The deployment identifier.
 * @param {string[]} [options.protect] - References of the bundles that must stay.
 * @param {number} [options.keep] - Published bundles kept beyond the protected ones.
 * @param {boolean} [options.dev] - Read the development environment; defaults to production.
 * @param {object} [options.store] - Object store; defaults to the one the environment selects.
 * @param {string} [options.root] - Build records root.
 * @returns {Promise<{kept: string[], removed: string[]}>} `<release-id>/<build-id>` of each bundle.
 * @memberof clientBundle
 */
const pruneClientBundles = async ({
  deployId,
  protect = [],
  keep = CLIENT_BUNDLES_KEEP,
  dev = false,
  store,
  root = CLIENT_BUNDLE_RECORDS_ROOT,
}) => {
  const protectedBuilds = protect.map((reference) => {
    const { releaseId, buildId } = clientBundleReferenceOf(reference);
    return `${releaseId}/${buildId}`;
  });
  fillDeployEnv(deployId, dev ? 'development' : 'production');
  const source = store ?? objectStore();
  const newestFirst = (a, b) => b.buildId.localeCompare(a.buildId);
  const lock = await clientBundleLock(deployId);
  try {
    const prefix = `${CLIENT_BUNDLE_ROOT}/${deployId}/`;
    const builds = new Map();
    for (const { key } of await source.list(prefix)) {
      const [releaseId, buildId] = key.slice(prefix.length).split('/');
      const id = `${releaseId}/${buildId}`;
      const build = builds.get(id) ?? { id, buildId, keys: [], published: false };
      build.keys.push(key);
      build.published ||= key === `${prefix}${id}/manifest.json`;
      builds.set(id, build);
    }
    const published = [...builds.values()].filter((build) => build.published).sort(newestFirst);
    const kept = new Set([...protectedBuilds, ...published.slice(0, keep).map(({ id }) => id)]);
    const removed = [...builds.values()].filter(({ id }) => !kept.has(id));
    await source.remove(removed.flatMap(({ keys }) => keys));

    const records = (fs.existsSync(`${root}/${deployId}`) ? fs.readdirSync(`${root}/${deployId}`) : []).flatMap(
      (releaseId) =>
        fs
          .readdirSync(`${root}/${deployId}/${releaseId}`)
          .map((buildId) => ({ id: `${releaseId}/${buildId}`, buildId })),
    );
    const keptRecords = new Set([
      ...kept,
      ...records
        .sort(newestFirst)
        .slice(0, keep)
        .map(({ id }) => id),
    ]);
    for (const { id } of records) if (!keptRecords.has(id)) fs.removeSync(`${root}/${deployId}/${id}`);
    for (const releaseId of fs.existsSync(`${root}/${deployId}`) ? fs.readdirSync(`${root}/${deployId}`) : [])
      if (fs.readdirSync(`${root}/${deployId}/${releaseId}`).length === 0)
        fs.removeSync(`${root}/${deployId}/${releaseId}`);

    logger.info('Client bundles pruned', { deployId, kept: [...kept], removed: removed.map(({ id }) => id) });
    return { kept: [...kept], removed: removed.map(({ id }) => id) };
  } finally {
    lock.release();
  }
};

export {
  CLIENT_BUNDLE_DIRECTORY,
  clientBundleArtifactPaths,
  clientBundleEntriesFactory,
  clientBundleHostFilter,
  clientBundleReferenceOf,
  clientBundleSplitMb,
  clientBundleTreeProblems,
  pruneClientBundles,
  pullClientBundle,
  pushClientBundle,
  verifyServedClientBundle,
};
