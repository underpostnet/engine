/**
 * Runs the test projects, wherever they have to run: on this host, inside a
 * deployment's containers, or as a Job on the cluster.
 *
 * One entrypoint, one runner. Selecting domains, planning the batches and rendering
 * the reporting surfaces belong to `src/server/build/testing.js`; this module resolves
 * where the run happens, starts one fresh process per batch and merges the results.
 *
 * @module src/cli/test.js
 * @namespace UnderpostTest
 */

import fs from 'fs-extra';
import nodePath from 'node:path';
import { timer } from '../client/components/core/CommonJs.js';
import { getUnderpostRootPath, shellEnvFactory } from '../server/runtime/environment.js';
import { actionInitLog, loggerFactory, setUpInfo } from '../server/ops/logger.js';
import { packageBinPath, shellArgumentFactory, shellExec } from '../server/runtime/process.js';
import { INTERRUPT_SIGNALS, runManagedProcess } from '../server/runtime/managed-process.js';
import { hostCapacityFactory, megabytes, reserveOverrideNotice } from '../server/runtime/resource-governor.js';
import { loadProductContexts } from '../server/build/catalog.js';
import {
  TEST_PROJECTS,
  UNDERPOST_TESTING,
  allureManifestsFactory,
  coverageReportKey,
  coverageThresholdFactory,
  githubAnnotationsFactory,
  impactSelector,
  resolveTestProjects,
  staleTestRuns,
  testBatchStatus,
  testBudgetFactory,
  testExecutionPlanFactory,
  testFailuresFactory,
  testJobManifestFactory,
  testLogTail,
  testRunFailureReportFactory,
  testRunIdFactory,
  testRunReportFactory,
  testRunStatus,
  vitestArgsFactory,
  vitestEnvFactory,
} from '../server/build/testing.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/** Lines of the merge log that explain a failed gate. */
const GATE_LINE = /does not meet|threshold/i;

/**
 * What a failed run leaves to read: the failed tests of each batch, the end of the log of a
 * batch that wrote no results, and the lines of the merge log that explain a failed gate.
 * @param {object} params
 * @param {object} params.manifest - Run manifest.
 * @param {string} params.runDirectory - Directory of the run.
 * @param {string} params.root - Engine tree.
 * @returns {Object<string, {failures?: object[], tail?: string, thresholdLines?: string[]}>} Evidence by batch index, and `merge`.
 */
const runEvidenceFactory = ({ manifest, runDirectory, root }) => {
  const read = (file, fallback) => {
    try {
      return file ? fs.readFileSync(nodePath.join(runDirectory, file), 'utf8') : fallback;
    } catch {
      return fallback;
    }
  };
  const evidence = {};
  for (const { index, results, log } of manifest.batches) {
    let failures = [];
    try {
      failures = testFailuresFactory(JSON.parse(read(results, '{}')), root);
    } catch {}
    evidence[index] = { failures, tail: testLogTail(read(log, '')) };
  }
  if (manifest.merge) {
    const log = read(manifest.merge.log, '');
    evidence.merge = {
      tail: testLogTail(log),
      thresholdLines: testLogTail(log, Infinity)
        .split('\n')
        .filter((line) => GATE_LINE.test(line))
        .slice(0, 10),
    };
  }
  return evidence;
};

/**
 * The paths a change touches: against a git ref, or the working tree when none is named.
 * @param {string} [base] - Git ref to compare against; the working tree and the index otherwise.
 * @returns {string[]} Repository-relative paths.
 */
const changedPaths = (base = '') => {
  const read = (command) =>
    `${shellExec(command, { stdout: true, silent: true, silentOnError: true, disableLog: true }) ?? ''}`.split('\n');
  return [
    ...read(base ? `git diff --name-only ${base}` : 'git diff --name-only HEAD'),
    // A new file is in no diff until it is added, and it is exactly the change most worth testing.
    ...read('git ls-files --others --exclude-standard'),
  ]
    .map((path) => path.trim())
    .filter(Boolean);
};

/**
 * @class UnderpostTest
 * @description Manages test execution and its cluster-side reporting.
 * @memberof UnderpostTest
 */
class UnderpostTest {
  static API = {
    /**
     * @method setUpInfo
     * @description Logs the execution context a failing run has to be read against:
     * arguments, environment, privileges and heap ceiling.
     * @returns {Promise<void>}
     * @memberof UnderpostTest
     */
    async setUpInfo() {
      return await setUpInfo(logger);
    },

    /**
     * @method run
     * @description Runs the selected projects on this host.
     *
     * Each batch of the execution plan runs in a fresh process and writes its report
     * to `.vitest/test-runs/<run-id>/`. A failed batch does not stop the run. One merge
     * at the end builds the final test and coverage reports and applies the coverage
     * threshold. `manifest.json` in the run directory records every batch.
     *
     * Resolved against the globally installed engine when the current directory
     * is not one, so `underpost test` from anywhere still runs the shipped suites
     * rather than failing on a missing config.
     * @param {object} [params]
     * @param {string} [params.suite] - Domain or project selector.
     * @param {string} [params.grep] - Substring filter on test names.
     * @param {boolean} [params.watch] - Keep the runner open and re-run on change.
     * @param {boolean} [params.coverage] - Emit the coverage reporters.
     * @param {boolean} [params.allure] - Also write Allure results for the dashboard.
     * @param {string} [params.footprint] - `safe` (the default), `balanced` or `ci`.
     * @param {number|string} [params.batchTimeout] - Minutes one batch can run, 0 for no limit.
     * @param {boolean} [params.diagnose] - Record memory and CPU per batch, and log heap and coverage timings.
     * @returns {Promise<object|undefined>} The run manifest; undefined in watch mode.
     * @throws {Error} When no engine tree is found, or when the run does not pass.
     * @memberof UnderpostTest
     */
    async run({
      suite = '',
      grep = '',
      watch = false,
      coverage = true,
      allure = false,
      footprint = '',
      batchTimeout = 0,
      diagnose = false,
    } = {}) {
      actionInitLog();
      const root = [process.cwd(), getUnderpostRootPath()].find(
        (candidate) => candidate && fs.existsSync(`${candidate}/vitest.config.js`),
      );
      if (!root) throw new Error('[test] no vitest.config.js in the current directory or the global underpost install');

      const plan = testExecutionPlanFactory({
        selector: suite,
        contexts: await loadProductContexts(fs.readJsonSync(`${root}/package.json`)),
        footprint,
      });
      for (const [deployId, entries] of Object.entries(Object.groupBy(plan.excluded, ({ deployId }) => deployId)))
        logger.warn('Skipping projects that run only in their product context', {
          deployId,
          projects: entries.map(({ name }) => name),
          missing: entries[0].missing,
          hint: `run them in the ${deployId} product repository, or install its catalog here: node bin package ${deployId} --install`,
        });
      // Rejects a malformed COVERAGE_MIN before the first batch, not at the merge.
      coverageThresholdFactory(process.env);
      const { totalMemoryBytes, cpus } = hostCapacityFactory();
      const budget = testBudgetFactory({ footprint: plan.footprint, totalMemoryBytes, cpus });
      const allureResultsDirectory = allure
        ? nodePath.resolve(
            root,
            process.env[UNDERPOST_TESTING.allureResultsEnvKey] || UNDERPOST_TESTING.allureResultsDirectory,
          )
        : '';
      const vitestBatches = plan.batches.filter(({ delegated }) => !delegated);

      // Only this selection's report starts from nothing: the ones beside it belong to
      // other selections a deploy on this host may publish.
      if (coverage && vitestBatches.length > 0)
        for (const report of [coverageReportKey(suite), 'lcov.info', 'coverage-final.json'])
          fs.removeSync(`${root}/${UNDERPOST_TESTING.coverageDirectory}/${report}`);

      if (watch) {
        if (vitestBatches.length < plan.batches.length) logger.warn('Delegated projects do not run in watch mode');
        if (vitestBatches.length === 0) return;
        const args = vitestArgsFactory({ projects: plan.projects, grep, watch, coverage });
        shellExec([process.execPath, packageBinPath('vitest', root), ...args].map(shellArgumentFactory).join(' '), {
          cwd: root,
          env: vitestEnvFactory({ env: shellEnvFactory(), footprint: plan.footprint, allureResultsDirectory }),
        });
        return;
      }

      const { directory, reportDirectory, kept } = UNDERPOST_TESTING.runs;
      const runsDirectory = nodePath.resolve(root, directory);
      fs.mkdirSync(runsDirectory, { recursive: true });
      for (const stale of staleTestRuns(fs.readdirSync(runsDirectory), kept))
        fs.removeSync(nodePath.join(runsDirectory, stale));
      const runId = testRunIdFactory(new Date(), process.pid);
      const runDirectory = nodePath.join(runsDirectory, runId);
      const reportsDirectory = nodePath.join(runDirectory, reportDirectory);
      fs.mkdirSync(reportsDirectory, { recursive: true });
      for (const directoryName of [UNDERPOST_TESTING.runs.resultsDirectory, UNDERPOST_TESTING.runs.logDirectory])
        fs.mkdirSync(nodePath.join(runDirectory, directoryName), { recursive: true });
      const manifestPath = nodePath.join(runDirectory, 'manifest.json');
      const mergeLog = `${UNDERPOST_TESTING.runs.logDirectory}/merge.log`;
      const manifest = {
        runId,
        selector: suite || 'all',
        footprint: plan.footprint,
        coverage,
        grep,
        excluded: plan.excluded.map(({ name }) => name),
        batches: plan.batches.map((batch) => ({ ...batch, status: 'pending' })),
        ...(vitestBatches.length > 0 ? { merge: { status: 'pending', log: mergeLog } } : {}),
        status: 'running',
      };
      const save = () => fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
      save();
      logger.info('Test run', {
        runId,
        footprint: plan.footprint,
        batches: plan.batches.length,
        manifest: nodePath.relative(root, manifestPath),
        budget: budget
          ? `${megabytes(budget.memoryBytes)} per batch, ${megabytes(budget.reserveBytes)} host reserve, ` +
            `${budget.threads} threads, nice ${budget.nice}`
          : 'none',
      });
      if (budget && reserveOverrideNotice(budget)) logger.warn('Host reserve', reserveOverrideNotice(budget));

      const control = { child: null, interrupted: null };
      const onSignal = (signal) => {
        // A second signal stops the running batch at once.
        logger.warn('Stopping the test run', { signal, forced: Boolean(control.interrupted) });
        control.interrupted ??= signal;
        control.stop?.(signal);
      };
      const timeoutMs = Number(batchTimeout) * 60 * 1000 || 0;
      // A pipe is not a terminal: keep the colour a person at one reads.
      const colorEnv = process.stdout.isTTY && !process.env.NO_COLOR ? { FORCE_COLOR: '1' } : {};
      const vitest = vitestBatches.length > 0 ? packageBinPath('vitest', root) : '';
      const record = ({ exitCode, signal, timedOut, overBudget, durationMs, diagnostics }, reported) => ({
        status: testBatchStatus({
          exitCode,
          signal,
          timedOut,
          overBudget,
          reported,
          interrupted: Boolean(control.interrupted),
        }),
        exitCode,
        signal,
        durationMs,
        ...(overBudget ? { reason: overBudget } : {}),
        ...(diagnostics ? { diagnostics } : {}),
      });
      const runBatch = async (batch) => {
        if (batch.delegated) {
          const {
            name,
            directory: projectDirectory,
            delegate,
          } = TEST_PROJECTS.find(({ name }) => name === batch.projects[0]);
          const projectRoot = `${root}/${projectDirectory}`;
          // A product build strips the projects it does not own, so an absent
          // directory is a project this tree does not ship, not a failure.
          if (!fs.existsSync(projectRoot)) {
            logger.warn(`Skipping project not present in this tree`, { project: name, directory: projectDirectory });
            return { status: 'skipped' };
          }
          if (allureResultsDirectory) fs.mkdirSync(allureResultsDirectory, { recursive: true });
          const resultsPath = allureResultsDirectory ? `${allureResultsDirectory}/TEST-${name}.xml` : '';
          const outcome = await runManagedProcess({
            command: 'sh',
            args: ['-c', delegate({ resultsPath, grep })],
            cwd: projectRoot,
            timeoutMs,
            diagnose,
            graceMs: UNDERPOST_TESTING.runs.terminationGraceMs,
            budget,
            control,
            logPath: nodePath.join(runDirectory, batch.log),
          });
          return record(outcome, true);
        }
        const report = nodePath.join(runDirectory, batch.report);
        const coverageDirectory = nodePath.join(runDirectory, 'coverage');
        const outcome = await runManagedProcess({
          command: process.execPath,
          args: [
            vitest,
            ...vitestArgsFactory({
              projects: batch.projects,
              grep,
              coverage,
              batch: { coverageDirectory, coverageInclude: plan.coverageInclude },
              logHeapUsage: diagnose,
            }),
          ],
          cwd: root,
          env: {
            ...vitestEnvFactory({
              env: shellEnvFactory(),
              footprint: plan.footprint,
              report,
              results: nodePath.join(runDirectory, batch.results),
              allureResultsDirectory,
              diagnose,
            }),
            ...colorEnv,
          },
          timeoutMs,
          diagnose,
          graceMs: UNDERPOST_TESTING.runs.terminationGraceMs,
          budget,
          control,
          logPath: nodePath.join(runDirectory, batch.log),
        });
        // The blob holds the batch coverage; the raw files of a stopped batch can be large.
        fs.removeSync(coverageDirectory);
        return record(outcome, fs.existsSync(report));
      };

      for (const signal of INTERRUPT_SIGNALS) process.on(signal, onSignal);
      try {
        for (const batch of manifest.batches) {
          if (control.interrupted) break;
          logger.info(`Batch ${batch.index}/${manifest.batches.length}`, {
            projects: batch.projects,
            groupOrder: batch.groupOrder,
          });
          batch.status = 'running';
          save();
          Object.assign(batch, await runBatch(batch));
          save();
          const passed = batch.status === 'passed' || batch.status === 'skipped';
          logger[passed ? 'info' : 'error'](`Batch ${batch.index} ${batch.status}`, {
            projects: batch.projects,
            exitCode: batch.exitCode,
            signal: batch.signal,
            ...(batch.reason ? { reason: batch.reason } : {}),
          });
        }

        if (manifest.merge && !control.interrupted) {
          if (fs.readdirSync(reportsDirectory).length === 0) {
            logger.error('No batch wrote a report to merge');
            manifest.merge = { status: 'error' };
          } else {
            manifest.merge.status = 'running';
            save();
            const outcome = await runManagedProcess({
              command: process.execPath,
              args: [
                vitest,
                ...vitestArgsFactory({ projects: plan.projects, coverage, mergeReports: reportsDirectory }),
              ],
              cwd: root,
              env: {
                ...vitestEnvFactory({ env: shellEnvFactory(), footprint: plan.footprint, diagnose }),
                ...colorEnv,
              },
              timeoutMs,
              diagnose,
              graceMs: UNDERPOST_TESTING.runs.terminationGraceMs,
              budget,
              control,
              logPath: nodePath.join(runDirectory, mergeLog),
            });
            manifest.merge = { ...record(outcome, true), log: mergeLog };
          }
        }
      } finally {
        for (const signal of INTERRUPT_SIGNALS) process.off(signal, onSignal);
        manifest.status = testRunStatus(manifest);
        save();
      }

      console.log(testRunReportFactory(manifest));
      if (manifest.status !== 'passed') {
        const evidence = runEvidenceFactory({ manifest, runDirectory, root });
        const failedTests = manifest.batches.flatMap(({ index }) => evidence[index]?.failures ?? []);
        const detail = testRunFailureReportFactory(manifest, evidence);
        if (detail) console.log(`\n${detail}\n`);
        console.log(`Run directory: ${nodePath.relative(root, runDirectory)} (manifest.json, logs/, results/)`);
        if (process.env.GITHUB_ACTIONS) {
          for (const annotation of githubAnnotationsFactory(failedTests)) console.log(annotation);
          if (process.env.GITHUB_STEP_SUMMARY)
            fs.appendFileSync(
              process.env.GITHUB_STEP_SUMMARY,
              `## Test run ${runId}: ${manifest.status}\n\n\`\`\`text\n${testRunReportFactory(manifest)}\n\n${detail}\n\`\`\`\n`,
            );
        }
        const failures = [
          ...manifest.batches
            .filter(({ status }) => status !== 'passed' && status !== 'skipped')
            .map(({ index, projects, status }) => `batch ${index} (${projects.join(',')}) ${status}`),
          ...(manifest.merge && manifest.merge.status !== 'passed' ? [`merge ${manifest.merge.status}`] : []),
          ...(failedTests.length > 0 ? [`${failedTests.length} failed test(s)`] : []),
        ];
        throw new Error(`[test] run ${runId} ${manifest.status}: ${failures.join('; ')}`);
      }
      logger.info('Test run passed', { runId, manifest: nodePath.relative(root, manifestPath) });
      return manifest;
    },

    /**
     * @method dashboard
     * @description Applies the Allure dashboard: the results claim every run
     * writes to, the report server, and the ways in.
     * @param {object} params
     * @param {string} [params.namespace='default'] - Target namespace.
     * @param {string} [params.host] - Hostname to route the dashboard sub-path on.
     * @param {boolean} [params.dryRun] - Print the manifests instead of applying them.
     * @returns {string} The rendered manifests.
     * @memberof UnderpostTest
     */
    dashboard({ namespace = 'default', host = '', dryRun = false } = {}) {
      const manifests = allureManifestsFactory({ namespace, host });
      if (dryRun) {
        console.log(manifests);
        return manifests;
      }
      shellExec(`sudo kubectl apply -f - <<'EOF'\n${manifests}\nEOF`);
      const { allure } = UNDERPOST_TESTING;
      logger.info('Allure dashboard applied', {
        namespace,
        nodePort: allure.nodePort,
        url: host ? `https://${host}${allure.subPath}` : '',
      });
      return manifests;
    },

    /**
     * @method job
     * @description Runs one selection on the cluster as a Job.
     *
     * The Job writes into the same claim the dashboard reads, so its results are
     * published by finishing — there is no upload step to fail separately from
     * the tests it would have reported.
     * @param {object} params
     * @param {string} params.image - Image carrying the engine and its dependencies.
     * @param {string} [params.suite] - Domain or project selector.
     * @param {string} [params.namespace='default'] - Target namespace.
     * @param {string} [params.nodeName] - Pins the pod to one node.
     * @param {boolean} [params.dryRun] - Print the manifest instead of applying it.
     * @returns {Promise<boolean>} Whether the Job's pod reached completion.
     * @throws {Error} When no image is given.
     * @memberof UnderpostTest
     */
    async job({ image = '', suite = '', namespace = 'default', nodeName = '', dryRun = false } = {}) {
      if (!image) throw new Error('[test] --job needs --image: the Job has no engine tree of its own');
      const name = `${UNDERPOST_TESTING.job.namePrefix}-${(suite || 'all').replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
      const manifest = testJobManifestFactory({ name, namespace, image, suite, nodeName });
      if (dryRun) {
        console.log(manifest);
        return true;
      }
      shellExec(`sudo kubectl apply -f - <<'EOF'\n${manifest}\nEOF`);
      return await Underpost.test.statusMonitor(name, 'Completed', 'pods');
    },

    /**
     * @method callback
     * @description `underpost test` entrypoint.
     * @param {string} [suite] - Domain or project selector.
     * @param {object} [options]
     * @param {boolean} [options.itc] - Run here rather than dispatching into pods.
     * @param {string} [options.deployList] - Comma separated deploy ids to run inside.
     * @param {boolean} [options.dashboard] - Apply the Allure dashboard and exit.
     * @param {boolean} [options.job] - Run the selection as a cluster Job.
     * @param {boolean|string} [options.changed] - Select the domains the changed sources belong to.
     * @param {boolean} [options.list] - Print the projects the selector resolves to and exit.
     * @param {boolean} [options.print] - Print the selector, or the resolved projects, on stdout and exit.
     * @param {boolean} [options.allure] - Write Allure results alongside the run.
     * @param {string} [options.grep] - Substring filter on test names.
     * @param {boolean} [options.watch] - Keep the runner open and re-run on change.
     * @param {boolean} [options.coverage] - Emit the coverage reporters.
     * @param {string} [options.footprint] - `safe` (the default), `balanced` or `ci`.
     * @param {string} [options.batchTimeout] - Minutes one batch can run.
     * @param {boolean} [options.diagnose] - Record memory and CPU per batch.
     * @param {string} [options.namespace] - Namespace for the cluster-side actions.
     * @param {string} [options.image] - Image for `--job`.
     * @param {string} [options.nodeName] - Node pin for `--job`.
     * @param {string} [options.host] - Hostname for the dashboard route.
     * @param {boolean} [options.dryRun] - Render manifests without applying them.
     * @param {string} [options.podName] - Wait for this object instead of running tests.
     * @param {string} [options.podStatus] - Status `--pod-name` waits for.
     * @param {string} [options.kindType] - Kind `--pod-name` queries.
     * @returns {Promise<void>}
     * @memberof UnderpostTest
     */
    async callback(suite = '', options = {}) {
      const { itc, deployList, dashboard, job, podName, podStatus, kindType, namespace = 'default' } = options;

      // Impact selection: the domains the changed sources belong to, never the whole suite by
      // habit. A change nothing maps to widens to every domain rather than running none.
      if (options.changed) {
        const paths = changedPaths(options.changed === true ? '' : options.changed);
        const selected = impactSelector(paths);
        // `--print` feeds a CI step, so it answers on stdout alone, and an empty change set
        // widens rather than handing that step a selector that reads as every project.
        if (options.print) return void console.log(selected || 'all');
        logger.info('Changed sources select', { paths: paths.length, selector: selected || '(nothing changed)' });
        if (!selected) return;
        suite = selected;
      }

      if (options.print)
        return void console.log(
          resolveTestProjects(suite)
            .map(({ name }) => name)
            .join(','),
        );

      if (options.list) {
        for (const { name, directory, description } of resolveTestProjects(suite))
          logger.info(name, { directory, description });
        return;
      }

      if (podName) return void (await Underpost.test.statusMonitor(podName, podStatus || 'Running', kindType));
      if (dashboard) return void Underpost.test.dashboard(options);
      if (job) return void (await Underpost.test.job({ ...options, suite }));

      if (deployList && !itc) {
        for (const deployId of deployList
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)) {
          const pods = Underpost.kubectl.get(deployId, 'pods', namespace);
          if (pods.length === 0) {
            logger.warn(`Couldn't find pods in deployment`, { deployId });
            continue;
          }
          for (const { NAME } of pods)
            Underpost.kubectl.exec({
              podName: NAME,
              namespace,
              command: `cd ${UNDERPOST_TESTING.job.workingDirectory} && underpost test ${suite} --itc`,
            });
        }
        return;
      }

      return void (await Underpost.test.run({ ...options, suite }));
    },

    /**
     * @method statusMonitor
     * @description Waits for a cluster object to reach a status.
     *
     * `Completed` is accepted wherever `Running` was asked for: a Job's pod and a
     * one-shot container both satisfy "it came up" by having finished, and a
     * caller polling for readiness would otherwise time out on a success.
     * @param {string} podName - Name, or name substring, of the object to watch.
     * @param {string} [status='Running'] - Status to wait for.
     * @param {string} [kindType='pods'] - Kind to query.
     * @param {number} [deltaMs=1000] - Delay between attempts.
     * @param {number} [maxAttempts=300] - Attempts before giving up.
     * @returns {Promise<boolean>} Whether the status was reached.
     * @memberof UnderpostTest
     */
    async statusMonitor(podName, status = 'Running', kindType = 'pods', deltaMs = 1000, maxAttempts = 60 * 5) {
      if (!kindType) kindType = 'pods';
      logger.info(`Loading instance`, { podName, status, kindType, deltaMs, maxAttempts });
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await timer(deltaMs);
        const pods = Underpost.kubectl.get(podName, kindType);
        const reached = pods.find(
          (pod) => pod.STATUS === status || (status === 'Running' && pod.STATUS === 'Completed'),
        );
        logger.info(
          `Testing pod ${podName}... ${reached ? 1 : 0}/1 - elapsed time ${deltaMs * attempt}ms - attempt ${attempt}/${maxAttempts}`,
          pods[0] ? pods[0].STATUS : 'Not found kind object',
        );
        if (reached) return true;
      }
      logger.error(`Failed to test pod ${podName} within ${maxAttempts} attempts`);
      return false;
    },
  };
}

export default UnderpostTest;
