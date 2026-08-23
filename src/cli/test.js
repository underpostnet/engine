/**
 * Runs the test tiers, wherever they have to run: on this host, inside a
 * deployment's containers, or as a Job on the cluster.
 *
 * One entrypoint, one runner. Selecting suites, ordering tiers and rendering
 * the reporting surfaces belong to `src/server/build/testing.js`; this module resolves
 * where the run happens and drives it.
 *
 * @module src/cli/test.js
 * @namespace UnderpostTest
 */

import fs from 'fs-extra';
import nodePath from 'node:path';
import { timer } from '../client/components/core/CommonJs.js';
import { getUnderpostRootPath } from '../server/runtime/environment.js';
import { actionInitLog, loggerFactory, setUpInfo } from '../server/ops/logger.js';
import { shellExec } from '../server/runtime/process.js';
import {
  UNDERPOST_TESTING,
  allureManifestsFactory,
  resolveTestSelection,
  testJobManifestFactory,
  vitestArgsFactory,
} from '../server/build/testing.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

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
     * @description Runs the selected tiers on this host.
     *
     * Resolved against the globally installed engine when the current directory
     * is not one, so `underpost test` from anywhere still runs the shipped suites
     * rather than failing on a missing config.
     * @param {object} [params]
     * @param {string} [params.suite] - Suite or tier selector.
     * @param {string} [params.grep] - Substring filter on test names.
     * @param {boolean} [params.watch] - Keep the runner open and re-run on change.
     * @param {boolean} [params.coverage] - Emit the coverage reporters.
     * @param {boolean} [params.allure] - Also write Allure results for the dashboard.
     * @returns {void}
     * @throws {Error} When no engine tree with a runner configuration can be found.
     * @memberof UnderpostTest
     */
    run({ suite = '', grep = '', watch = false, coverage = true, allure = false } = {}) {
      actionInitLog();
      const root = [process.cwd(), getUnderpostRootPath()].find(
        (candidate) => candidate && fs.existsSync(`${candidate}/vitest.config.js`),
      );
      if (!root) throw new Error('[test] no vitest.config.js in the current directory or the global underpost install');

      const { projects, runVitest, delegated } = resolveTestSelection(suite);
      const allureResultsDirectory =
        allure &&
        nodePath.resolve(
          root,
          process.env[UNDERPOST_TESTING.allureResultsEnvKey] || UNDERPOST_TESTING.allureResultsDirectory,
        );

      if (runVitest) {
        const env = [
          'NODE_ENV=test',
          ...(allureResultsDirectory ? [`${UNDERPOST_TESTING.allureResultsEnvKey}=${allureResultsDirectory}`] : []),
        ];
        shellExec(
          `cd ${root} && ${env.join(' ')} npx vitest ${vitestArgsFactory({ projects, grep, watch, coverage }).join(' ')}`,
        );
      }

      for (const { name, directory, delegate } of delegated) {
        const tierRoot = `${root}/${directory}`;
        // A product build strips the tiers it does not own, so an absent
        // directory is a tier this tree does not ship, not a failure.
        if (!fs.existsSync(tierRoot)) {
          logger.warn(`Skipping tier not present in this tree`, { tier: name, directory });
          continue;
        }
        if (allureResultsDirectory) fs.mkdirSync(allureResultsDirectory, { recursive: true });
        const resultsPath = allureResultsDirectory ? `${allureResultsDirectory}/TEST-${name}.xml` : '';
        shellExec(`cd ${tierRoot} && ${delegate({ resultsPath, grep })}`);
      }
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
     * @description Runs one suite on the cluster as a Job.
     *
     * The Job writes into the same claim the dashboard reads, so its results are
     * published by finishing — there is no upload step to fail separately from
     * the tests it would have reported.
     * @param {object} params
     * @param {string} params.image - Image carrying the engine and its dependencies.
     * @param {string} [params.suite] - Suite or tier selector.
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
     * @param {string} [suite] - Suite or tier selector.
     * @param {object} [options]
     * @param {boolean} [options.itc] - Run here rather than dispatching into pods.
     * @param {string} [options.deployList] - Comma separated deploy ids to run inside.
     * @param {boolean} [options.dashboard] - Apply the Allure dashboard and exit.
     * @param {boolean} [options.job] - Run the suite as a cluster Job.
     * @param {boolean} [options.allure] - Write Allure results alongside the run.
     * @param {string} [options.grep] - Substring filter on test names.
     * @param {boolean} [options.watch] - Keep the runner open and re-run on change.
     * @param {boolean} [options.coverage] - Emit the coverage reporters.
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

      return void Underpost.test.run({ ...options, suite });
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
