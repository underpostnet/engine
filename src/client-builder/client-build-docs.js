'use strict';

/**
 * Module for building project documentation (TypeDoc, coverage, references).
 * @module src/client-builder/client-build-docs.js
 * @namespace clientBuildDocs
 */

import crypto from 'node:crypto';
import fs from 'fs-extra';
import * as dir from 'path';
import { packageBinPath } from '../server/runtime/process.js';
import { loggerFactory } from '../server/ops/logger.js';
import {
  INTERRUPT_SIGNALS,
  WARNING_EVENTS,
  runManagedProcess,
  runMetricsFactory,
  taskAdmissionFactory,
  terminationReason,
} from '../server/runtime/managed-process.js';
import {
  MEMORY_RESERVE_ENV,
  megabytes,
  memoryRequirementFactory,
  reserveOverrideNotice,
  resourceHistoryFactory,
  resourceProfileFactory,
} from '../server/runtime/resource-governor.js';
import { acquireHostLock, hostLockName } from '../server/runtime/host-lock.js';
import {
  publishDirectory,
  recoverPublication,
  recoverPublications,
  stagingDirectoryFactory,
} from '../server/build/publication.js';
import {
  coverageReportCandidates,
  coverageReportsFactory,
  coverageUnavailablePage,
  resolveCoverageReportPath,
} from '../server/build/coverage.js';
import {
  DEFAULT_TYPEDOC_CONFIG_PATH,
  DOCS_VIEWS,
  TYPEDOC_DIRECTORY,
  TYPEDOC_PREVIEW,
  docsDocumentsFactory,
  docsNavigationFactory,
  docsReferencesFactory,
  frontMatterOf,
  typedocOptionsFactory,
} from '../server/build/docs.js';
import { documentationHref } from '../client/components/core/CommonJs.js';

/** Beside the sites: the resource history of the TypeDoc workload of a client, and its last publication. */
const TYPEDOC_RUN_RECORD = '.typedoc-run.json';

const HEAP_EXHAUSTED = /JavaScript heap out of memory/;

const readJson = (path) => {
  try {
    return fs.readJsonSync(path);
  } catch {
    return null;
  }
};

/**
 * The problems of a generated TypeDoc site; a site without problems can be published.
 * @function typedocSiteProblems
 * @memberof clientBuildDocs
 * @param {string} directory - The generated site.
 * @returns {string[]} Problems, empty for a complete site.
 */
const typedocSiteProblems = (directory) => {
  const index = `${directory}/index.html`;
  if (!fs.existsSync(index) || fs.statSync(index).size === 0) return ['index.html is missing or empty'];
  const html = fs.readFileSync(index, 'utf8');
  const problems = ['assets/style.css', 'assets/main.js', 'assets/search.js']
    .filter((asset) => !fs.existsSync(`${directory}/${asset}`) || fs.statSync(`${directory}/${asset}`).size === 0)
    .map((asset) => `${asset} is missing or empty`);
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push('index.html has no title');
  if (!html.includes('assets/style.css')) problems.push('index.html links no stylesheet');
  return problems;
};

/**
 * Runs TypeDoc for one client as a managed task of the `heavy` resource profile.
 *
 * `build` generates `docs/engine/<version>` into a staging directory beside it and publishes the
 * staging directory only when it checks out, so a failed run leaves the published site as it was.
 * `watch` rebuilds `docs/engine/preview` on every change until the operator stops it, then removes
 * it. One TypeDoc runs per host at a time, and a TypeDoc that outlives its build keeps the host. A
 * task starts only when the host can give it the memory its resource history asks for, and in a
 * systemd scope where the kernel enforces its limits. The history belongs to one workload: the
 * TypeDoc options and the program they compile.
 * @function runTypedoc
 * @memberof clientBuildDocs
 * @param {Object} options
 * @param {string} options.host - The hostname.
 * @param {string} options.path - The base path.
 * @param {Object} [options.metadata] - Client metadata; its title names the site.
 * @param {Object} options.docs - Documentation config from client conf.
 * @param {string} options.version - Package version the site documents.
 * @param {'build'|'watch'} options.mode
 * @param {string} options.buildId - Identity of the client build, in every event.
 * @returns {Promise<{status: 'published'|'stopped'|'skipped'|'rejected'|'failed'|'cancelled', reason?: string,
 *   metrics?: object}>} `metrics` of a run that started, from `runMetricsFactory`.
 */
const runTypedoc = async ({ host, path, metadata = {}, docs, version, mode, buildId }) => {
  const logger = loggerFactory(import.meta);
  const typedocOptions = typedocOptionsFactory({ docs });
  if (!typedocOptions) {
    logger.warn('typedoc config not found, skipping', DEFAULT_TYPEDOC_CONFIG_PATH);
    return { status: 'skipped', reason: `no ${DEFAULT_TYPEDOC_CONFIG_PATH}` };
  }
  const pathPrefix = path === '/' ? '/' : `${path}/`;
  const root = dir.resolve(`./public/${host}${pathPrefix}${TYPEDOC_DIRECTORY}`);
  const target = `${root}/${mode === 'watch' ? TYPEDOC_PREVIEW : version}`;
  const taskId = `typedoc-${mode}-${host}${path}`.replace(/[^a-z0-9.-]+/gi, '-').replace(/-$/, '');
  const locks = [];
  const event = (name, fields = {}) => {
    if (name === 'TASK_START') for (const lock of locks) lock.attach(fields.pid);
    logger[WARNING_EVENTS.has(name) ? 'warn' : 'info'](name, { buildId, taskId, ...fields });
  };
  const profile = resourceProfileFactory('heavy');
  const abort = new AbortController();
  const control = {};
  const onSignal = (signal) => {
    abort.abort(signal);
    control.stop?.(signal);
  };
  // TypeDoc resolves the paths of an options file from its directory: the file stays at the root.
  const configPath = `.typedoc.${taskId}.json`;
  const logPath = `${root}/.${taskId}.log`;
  let out = '';
  for (const signal of INTERRUPT_SIGNALS) process.on(signal, onSignal);
  try {
    for (const [name, slots] of [
      [hostLockName('typedoc', target), 1],
      [`resource-${profile.name}`, profile.concurrency],
    ]) {
      const lock = await acquireHostLock({
        name,
        slots,
        timeoutMs: profile.maxRuntimeMs,
        signal: abort.signal,
        onWait: (holders) =>
          event('TASK_DEFERRED', {
            lock: name,
            holders: holders.map(({ pid, command, acquiredAt, holderAlive, workload }) => ({
              pid,
              command,
              acquiredAt,
              holderAlive,
              ...(workload ? { workloadGroup: workload.pgid } : {}),
            })),
          }),
      });
      if (!lock) {
        if (abort.signal.aborted) return { status: 'cancelled', reason: `stopped by ${abort.signal.reason}` };
        event('TASK_REJECTED', { lock: name });
        return {
          status: 'rejected',
          reason: `another process held ${name} for ${profile.maxRuntimeMs / 60000} minutes`,
        };
      }
      locks.push(lock);
    }

    fs.mkdirSync(root, { recursive: true });
    if (mode === 'build') {
      const recovered = recoverPublications(root);
      if (recovered.restored.length > 0 || recovered.removed.length > 0)
        event('ARTIFACT_RECOVERED', { root, ...recovered });
    }
    const references = docsReferencesFactory(docs);
    const tsconfig = fs.realpathSync(typedocOptions.tsconfig || './tsconfig.docs.json');
    const options = {
      ...typedocOptions,
      tsconfig,
      name: metadata?.title || typedocOptions.name,
      favicon: `./public/${host}${pathPrefix}favicon.ico`,
      // TypeDoc 0.28+: option is `projectDocuments`, not `documents`
      ...(references.length > 0 ? { projectDocuments: references } : {}),
    };
    const workload = crypto
      .createHash('sha256')
      .update(JSON.stringify([options, fs.readFileSync(tsconfig, 'utf8')]))
      .digest('hex')
      .slice(0, 16);
    const recordPath = `${root}/${TYPEDOC_RUN_RECORD}`;
    const record = readJson(recordPath) ?? {};
    const requiredBytes = memoryRequirementFactory({ history: record.history, workload, profile: profile.name });
    const task = taskAdmissionFactory({
      profile: profile.name,
      unit: `underpost-${taskId}-${process.pid}`,
      requiredBytes,
    });
    const notice = reserveOverrideNotice(task.budget);
    if (notice) event('RESOURCE_RESERVE_OVERRIDE', { notice });
    const refusal = !task.admitted
      ? `${task.reason}. Free memory, then rerun with --docs-only; lowering ${MEMORY_RESERVE_ENV} only takes memory from the rest of the host`
      : task.isolationRefusal;
    if (refusal) {
      event('TASK_REJECTED', { requiredBytes, capacity: task.capacity, reason: refusal });
      return { status: 'rejected', reason: refusal };
    }
    const { budget } = task;
    event('TASK_ADMITTED', {
      profile: profile.name,
      workload,
      hostAvailableBytes: task.capacity.availableMemoryBytes,
      reserveBytes: budget.reserveBytes,
      allowanceBytes: budget.memoryBytes,
      heapLimitBytes: budget.heapBytes,
      requiredBytes: requiredBytes || 'unknown: no run of this workload measured it',
      threads: budget.threads,
      nice: budget.nice,
      enforcement: task.enforcement,
    });

    out = mode === 'watch' ? target : stagingDirectoryFactory(target);
    fs.writeJsonSync(configPath, { ...options, out: dir.resolve(out) }, { spaces: 2 });
    const outcome = await runManagedProcess({
      command: process.execPath,
      args: [
        packageBinPath('typedoc'),
        '--options',
        configPath,
        ...(mode === 'watch' ? ['--watch', '--preserveWatchOutput'] : []),
      ],
      cwd: process.cwd(),
      timeoutMs: mode === 'watch' ? 0 : profile.maxRuntimeMs,
      budget,
      boundary: task.boundary,
      diagnose: true,
      control,
      logPath,
      onEvent: event,
    });
    const output = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    const heapExhausted = HEAP_EXHAUSTED.test(output);
    const reason = heapExhausted ? 'memory-limit' : terminationReason(outcome);
    const metrics = { reason, ...runMetricsFactory({ outcome, budget }) };
    if (mode === 'watch') return { status: reason === 'cancelled' ? 'stopped' : 'failed', reason, metrics };
    const history = resourceHistoryFactory({
      history: record.history,
      workload,
      reason,
      diagnostics: outcome.diagnostics,
      budget,
      at: new Date().toISOString(),
    });
    fs.writeJsonSync(recordPath, { history, published: record.published });
    if (reason !== 'completed')
      return {
        status: reason === 'cancelled' ? 'cancelled' : 'failed',
        reason: {
          cancelled: `stopped by ${outcome.cancelled}`,
          timeout: `TypeDoc ran longer than ${profile.maxRuntimeMs / 60000} minutes`,
          'memory-limit':
            outcome.overBudget ||
            (heapExhausted
              ? `TypeDoc used up its ${megabytes(budget.heapBytes)} heap`
              : `the kernel stopped TypeDoc at its ${megabytes(budget.memoryBytes)} memory limit`),
          'host-pressure': outcome.overBudget,
          failed: `TypeDoc exited with ${outcome.exitCode ?? outcome.signal}: ${output.trim().split('\n').pop() ?? ''}`,
        }[reason],
        metrics,
      };
    const problems = typedocSiteProblems(out);
    if (problems.length > 0) {
      event('TASK_FAILED', { reason: 'invalid artifact', problems });
      return { status: 'failed', reason: `TypeDoc wrote an incomplete site: ${problems.join(', ')}`, metrics };
    }
    event('ARTIFACT_VALIDATED', { staging: out });
    const { replaced } = publishDirectory({ staging: out, target });
    // Every other version is obsolete once this one is published.
    const removed = fs
      .readdirSync(root)
      .filter((entry) => !entry.startsWith('.') && entry !== version && entry !== TYPEDOC_PREVIEW);
    for (const entry of removed) fs.removeSync(`${root}/${entry}`);
    fs.writeJsonSync(recordPath, { history, published: { version, at: history.last.at } });
    event('ARTIFACT_PUBLISHED', { target, replaced, removed });
    return { status: 'published', metrics };
  } finally {
    for (const signal of INTERRUPT_SIGNALS) process.off(signal, onSignal);
    // An unpublished staging directory, or the preview of a watch that ended.
    if (out) fs.removeSync(out);
    fs.removeSync(configPath);
    fs.removeSync(logPath);
    for (const lock of locks.reverse()) lock.release();
  }
};

/**
 * Builds a directory into a staging directory beside it, then publishes it in its place.
 * @function publishBuilt
 * @memberof clientBuildDocs
 * @param {string} target - Published directory.
 * @param {(staging: string) => void|Promise<void>} build - Writes the new version.
 * @returns {Promise<void>}
 */
const publishBuilt = async (target, build) => {
  recoverPublication(target);
  const staging = stagingDirectoryFactory(target);
  try {
    fs.mkdirSync(staging, { recursive: true });
    await build(staging);
    publishDirectory({ staging, target });
  } finally {
    fs.removeSync(staging);
  }
};

/**
 * Publishes every coverage HTML report the deploy declares, each at `docs/coverage/<id>`.
 *
 * Never generates one: a report belongs to the test stage, which bundles it into the
 * deploy artifact (see {@link module:src/server/build/coverage.js}). A client build that
 * shelled out to `npm test` here spent minutes of a pod's build phase on a runner the
 * workload has no business holding, and every expected non-zero exit of that suite latched
 * `container-status=error`, failing the deployment monitor on a healthy rollout.
 * @function buildCoverage
 * @memberof clientBuildDocs
 * @param {Object} options - Coverage build options
 * @param {Object} options.docs - Documentation config from client conf
 * @param {Array<{id: string, label?: string, suite?: string, path?: string}>} [options.docs.coverage] - Declared reports
 * @param {string} options.docsDestination - Resolved output path where docs were built
 */
const buildCoverage = async ({ docs, docsDestination }) => {
  const logger = loggerFactory(import.meta);
  const reports = coverageReportsFactory(docs);
  if (reports.length === 0) return;
  // The route holds exactly the declared reports: one dropped from the conf leaves with it.
  await publishBuilt(`${docsDestination}coverage`, (staging) => {
    for (const report of reports) {
      const coverageBuildPath = `${staging}/${report.id}`;
      const reportPath = resolveCoverageReportPath(report);

      if (!reportPath) {
        fs.outputFileSync(`${coverageBuildPath}/index.html`, coverageUnavailablePage(report), 'utf8');
        logger.warn('no coverage report bundled, publishing the unavailable page', {
          id: report.id,
          searched: coverageReportCandidates(report),
        });
        continue;
      }

      fs.copySync(reportPath, coverageBuildPath);
      logger.warn('build coverage', { id: report.id, source: reportPath });
    }
  });
};

/**
 * The docs-view link a source document link resolves to. An authored link is relative to the
 * document that holds it, which is how it resolves in an editor and in the generated reference
 * site; published, the same target opens in the documentation view.
 * @function documentLinkFactory
 * @memberof clientBuildDocs
 * @param {import('../server/build/docs.js').DocsDocument} document - The document holding the link
 * @param {string} target - The link target, as authored
 * @param {string} proxyPath - The instance's proxy path
 * @returns {string|null} The rewritten link, or null when the target is not an authored document
 */
const documentLinkFactory = (document, target, proxyPath) => {
  if (!document.domain || /^[a-z]+:|^\/\//i.test(target) || target.startsWith('#')) return null;
  const [path, fragment = ''] = target.split('#');
  if (!path.toLowerCase().endsWith('.md')) return null;
  const resolved = dir
    .normalize(`${document.domain}/${document.category}/${path}`)
    .replace(/\.md$/i, '')
    .replace(/\\/g, '/');
  return documentationHref(proxyPath, resolved, fragment);
};

/**
 * Publishes the documents a client declares, and the navigation they make.
 *
 * A document is published at the path its identity gives it, `/docs/<domain>/<category>/<slug>.md`,
 * with its front matter removed and its links rewritten to the documentation view. The navigation
 * is written beside them as `/docs/manifest.json`, so the view derives its structure from the
 * documentation tree rather than from links inside the prose. Its `view` names the domains the
 * client's documentation view navigates ({@link DOCS_VIEWS}); empty means every domain.
 * @function buildDocsReferences
 * @memberof clientBuildDocs
 * @param {Object} options - Reference publish options
 * @param {Object} options.docs - Documentation config from client conf
 * @param {string} options.docsDestination - Resolved `/docs/` output path of the host
 * @param {string} [options.proxyPath] - The instance's proxy path
 * @param {string} [options.client] - The client id
 * @returns {{documents: number, navigation: object}} What was published
 */
const buildDocsReferences = async ({ docs, docsDestination, proxyPath = '/', client = '' }) => {
  const logger = loggerFactory(import.meta);
  const documents = docsDocumentsFactory(docs);
  if (documents.length === 0) return { documents: 0, navigation: { domains: [], view: [] } };

  // Every document is read before one is replaced: a document that cannot be read changes nothing.
  const folders = new Map();
  for (const document of documents) {
    const { body } = frontMatterOf(fs.readFileSync(document.path, 'utf8'));
    const published = body.replace(/\]\(<?([^)>]+)>?\)/g, (match, target) => {
      const link = documentLinkFactory(document, target, proxyPath);
      return link ? `](${link})` : match;
    });
    const [, folder, ...path] = document.url.split('/');
    folders.set(folder, [...(folders.get(folder) ?? []), { path: path.join('/'), body: published.trimStart() }]);
  }
  // The route holds exactly the declared documents: one dropped from the conf leaves with it.
  for (const [folder, files] of folders)
    await publishBuilt(`${docsDestination}${folder}`, (staging) => {
      for (const { path, body } of files) fs.outputFileSync(`${staging}/${path}`, body, 'utf8');
    });

  const navigation = { ...docsNavigationFactory(documents), view: [...(DOCS_VIEWS[client] ?? [])] };
  fs.outputFileSync(`${docsDestination}manifest.json.tmp`, JSON.stringify(navigation, null, 2), 'utf8');
  fs.renameSync(`${docsDestination}manifest.json.tmp`, `${docsDestination}manifest.json`);
  logger.warn('build docs', {
    published: docsDestination,
    documents: documents.length,
    domains: navigation.domains.map((domain) => domain.id),
  });
  return { documents: documents.length, navigation };
};

/**
 * Builds the documentation of one client: its coverage reports and documents when the build asks for
 * them, and its TypeDoc site when it asks for that. A skipped TypeDoc site stays as last published.
 * @function buildDocs
 * @memberof clientBuildDocs
 * @param {Object} options - Documentation build options
 * @param {string} options.host - The hostname
 * @param {string} options.path - The base path
 * @param {Object} options.metadata - Metadata for the documentation
 * @param {Object} options.packageData - Package.json data
 * @param {Object} options.docs - Documentation config from client conf
 * @param {string} options.client - The client id
 * @param {boolean} options.references - Publish the coverage reports and the documents.
 * @param {'skip'|'build'} options.typedoc - What the build does with the TypeDoc site.
 * @param {string} options.buildId - Identity of the client build.
 * @returns {Promise<{status: string, reason?: string}>} The outcome of the TypeDoc site.
 */
const buildDocs = async ({ host, path, metadata = {}, packageData, docs, client, references, typedoc, buildId }) => {
  const logger = loggerFactory(import.meta);
  const pathPrefix = path === '/' ? '/' : `${path}/`;
  const version = (packageData?.version || '').replace(/^v/, '');
  if (references) {
    // Coverage reports at /docs/coverage/<id>/
    const docsDestination = `./public/${host}${pathPrefix}docs/`;
    await buildCoverage({ docs, docsDestination });
    await buildDocsReferences({ docs, docsDestination, proxyPath: pathPrefix, client });
  }
  if (typedoc === 'build') return runTypedoc({ host, path, metadata, docs, version, mode: 'build', buildId });
  const site = `./public/${host}${pathPrefix}${TYPEDOC_DIRECTORY}/${version}/index.html`;
  if (!fs.existsSync(site))
    logger.warn('No TypeDoc site published', { site, build: 'node bin client <deploy-id> --docs-only' });
  return { status: 'skipped' };
};

export { TYPEDOC_RUN_RECORD, buildCoverage, buildDocs, buildDocsReferences, runTypedoc, typedocSiteProblems };
