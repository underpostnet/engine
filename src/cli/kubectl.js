/**
 * Kubectl module providing low-level Kubernetes resource management primitives.
 * Centralises pod querying, file transfer, and in-container execution operations
 * that were previously scattered across db, deploy, and cluster modules.
 * @module src/cli/kubectl.js
 * @namespace UnderpostKubectl
 */

import { loggerFactory } from '../server/ops/logger.js';
import { shellExec, sleepSync } from '../server/runtime/process.js';
import { timer } from '../client/components/core/CommonJs.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * Redacts credentials from shell command strings before logging.
 * Masks passwords in `-p<password>`, `--password=<password>`, and `-P <password>` patterns.
 * @param {string} cmd - The raw command string.
 * @returns {string} The command with credentials replaced by `***`.
 * @memberof UnderpostKubectl
 */
const sanitizeCommand = (cmd) => {
  if (typeof cmd !== 'string') return cmd;
  return cmd
    .replace(/-p['"]?[^\s'"]+/g, '-p***')
    .replace(/--password=['"]?[^\s'"]+/g, '--password=***')
    .replace(/-P\s+['"]?[^\s'"]+/g, '-P ***');
};

const DEFAULT_POD_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;
const DEFAULT_EXEC_READY_ATTEMPTS = 5;
const DEFAULT_CREATION_TIMEOUT_SECONDS = 120;
const DEFAULT_READY_TIMEOUT_SECONDS = 180;

/**
 * Exponential backoff for attempt `n`: 2s, 4s, 8s, …
 * @param {number} attempt - 1-based attempt that just failed.
 * @param {number} [baseDelayMs=2000] - Delay after the first failure.
 * @returns {number} Milliseconds to wait before the next attempt.
 * @memberof UnderpostKubectl
 */
const backoffDelayMs = (attempt, baseDelayMs = RETRY_BASE_DELAY_MS) => baseDelayMs * 2 ** (attempt - 1);

/**
 * Wraps a command in `timeout(1)` so a stalled API-server stream cannot hang a job forever.
 * @param {string} command - Command to bound.
 * @param {number} timeoutSeconds - Wall-clock budget; `0`/falsy returns the command unchanged.
 * @returns {string} The bounded command.
 * @memberof UnderpostKubectl
 */
const withTimeout = (command, timeoutSeconds) =>
  timeoutSeconds > 0 ? `timeout --kill-after=10s ${timeoutSeconds}s ${command}` : command;

/**
 * @class UnderpostKubectl
 * @description Kubernetes cluster resource management primitives.
 * Provides a unified interface for kubectl operations: resource listing, in-pod
 * command execution, file transfer, and pod discovery/filtering.
 * All methods are stateless and safe to call from any other CLI module.
 * @memberof UnderpostKubectl
 */
class UnderpostKubectl {
  static API = {
    /**
     * Lists Kubernetes resources matching `deployId`, parsed into plain objects.
     * Equivalent to `kubectl get <kindType> -o wide`, filtered by name substring.
     * @param {string} deployId - Substring to match against resource names. Empty string returns all.
     * @param {string} [kindType='pods'] - Resource kind: pods, deployments, svc, nodes, …
     * @param {string} [namespace=''] - Namespace to query; empty string → --all-namespaces.
     * @returns {Array<object>} Parsed rows keyed by column header (NAME, STATUS, NODE, …).
     * @memberof UnderpostKubectl
     */
    get(deployId, kindType = 'pods', namespace = '') {
      // Existence-check style: a missing kubectl context, a non-existent
      // namespace, or no pods matching the filter must return an empty
      // list (not throw). silentOnError keeps the legacy contract.
      const raw = shellExec(
        `sudo kubectl get ${kindType}${namespace ? ` -n ${namespace}` : ` --all-namespaces`} -o wide`,
        { stdout: true, disableLog: true, silent: true, silentOnError: true },
      );

      const heads = raw
        .split(`\n`)[0]
        .split(' ')
        .filter((_r) => _r.trim());

      const pods = raw
        .split(`\n`)
        .filter((r) => (deployId ? r.match(deployId) : r.trim() && !r.match('NAME')))
        .map((r) => r.split(' ').filter((_r) => _r.trim()));

      const result = [];
      for (const row of pods) {
        const pod = {};
        let index = -1;
        for (const head of heads) {
          index++;
          pod[head] = row[index];
        }
        result.push(pod);
      }
      return result;
    },

    /**
     * Executes a kubectl command with credential-safe logging and error propagation.
     * Retries any failure up to `retries` times with exponential backoff; callers whose
     * command is not safe to replay pass `retries: 0`.
     * @param {string} command - Full kubectl command string.
     * @param {object} [options={}] - Execution options.
     * @param {string} [options.context=''] - Human-readable label for log messages.
     * @param {number} [options.retries=0] - Extra attempts allowed after a failure.
     * @param {number} [options.baseDelayMs=2000] - Delay after the first failure; doubles per attempt.
     * @param {number} [options.timeoutSeconds=0] - Wall-clock budget per attempt; `0` disables the bound.
     * @param {string} [options.podName=''] - Pod the command targets; retries wait for it to accept exec again.
     * @param {string} [options.namespace='default'] - Namespace of `podName`.
     * @returns {string} stdout output from the command.
     * @throws {Error} Re-throws the last execution error after logging.
     * @memberof UnderpostKubectl
     */
    run(command, options = {}) {
      const {
        context = '',
        retries = 0,
        baseDelayMs = RETRY_BASE_DELAY_MS,
        timeoutSeconds = 0,
        podName = '',
        namespace = 'default',
      } = options;
      const attempts = Math.max(0, retries) + 1;
      const boundedCommand = withTimeout(command, timeoutSeconds);

      for (let attempt = 1; ; attempt++) {
        try {
          logger.info(`Executing kubectl command`, {
            command: sanitizeCommand(command),
            context,
            ...(attempts > 1 ? { attempt, attempts } : {}),
          });
          return shellExec(boundedCommand, { stdout: true, disableLog: true });
        } catch (error) {
          if (attempt === attempts) {
            logger.error(`kubectl command failed`, {
              command: sanitizeCommand(command),
              error: error.message,
              context,
              attempts,
            });
            throw error;
          }
          const delayMs = backoffDelayMs(attempt, baseDelayMs);
          logger.warn(`kubectl command failed, retrying`, {
            command: sanitizeCommand(command),
            context,
            attempt,
            attempts,
            delayMs,
            error: error.message,
          });
          sleepSync(delayMs);
          // An OOM kill takes the container with it (exit 137), so the replay would land on
          // a container that is still coming back up. Wait for it rather than burning an attempt.
          if (podName) Underpost.kubectl.ensureExecReady({ podName, namespace });
        }
      }
    },

    /**
     * Polls until the pod can actually accept an exec stream.
     *
     * `kubectl wait --for=condition=Ready` reads the pod status the API server last
     * recorded, which stays `Ready` for a window after the container underneath is
     * gone — the exact gap that makes a dump fail with `container not found`. This
     * probes the real thing: a no-op exec into the container.
     *
     * @param {object} params
     * @param {string} params.podName - Pod to gate on.
     * @param {string} [params.namespace='default'] - Pod namespace.
     * @param {number} [params.attempts=5] - Probe attempts before giving up.
     * @param {number} [params.baseDelayMs=2000] - Delay after the first probe; doubles per attempt.
     * @param {number} [params.readyTimeoutSeconds=30] - Budget for the readiness condition wait.
     * @param {number} [params.probeTimeoutSeconds=15] - Budget for the no-op exec probe.
     * @returns {boolean} `true` when the pod accepted an exec stream.
     * @memberof UnderpostKubectl
     */
    ensureExecReady({
      podName,
      namespace = 'default',
      attempts = DEFAULT_EXEC_READY_ATTEMPTS,
      baseDelayMs = RETRY_BASE_DELAY_MS,
      readyTimeoutSeconds = 30,
      probeTimeoutSeconds = 15,
    }) {
      const probeOptions = { silent: true, silentOnError: true, disableLog: true };
      for (let attempt = 1; attempt <= attempts; attempt++) {
        shellExec(
          `kubectl wait --for=condition=Ready pod/${podName} -n ${namespace} --timeout=${readyTimeoutSeconds}s`,
          probeOptions,
        );
        const probe = shellExec(
          withTimeout(`sudo kubectl exec -n ${namespace} -i ${podName} -- sh -c "exit 0"`, probeTimeoutSeconds),
          probeOptions,
        );
        if (probe && probe.code === 0) return true;
        if (attempt < attempts) sleepSync(backoffDelayMs(attempt, baseDelayMs));
      }
      logger.error('Pod never became exec-ready', { podName, namespace, attempts });
      return false;
    },

    /**
     * Waits for a pod object to exist.
     *
     * `kubectl wait` fails on a missing object rather than waiting for one to appear, so any
     * readiness wait issued while the controller is still creating the pod returns
     * `Error from server (NotFound)`. A StatefulSet with `podManagementPolicy: OrderedReady`
     * hits this every rollout: member N+1 is created only once N reports Ready.
     *
     * @param {object} params
     * @param {string} params.podName - Pod to wait for.
     * @param {string} [params.namespace='default'] - Pod namespace.
     * @param {number} [params.timeoutSeconds=120] - Maximum wait window.
     * @param {number} [params.intervalMs=2000] - Poll interval.
     * @returns {Promise<boolean>} `true` once the pod object exists.
     * @memberof UnderpostKubectl
     */
    async waitForPodCreation({
      podName,
      namespace = 'default',
      timeoutSeconds = DEFAULT_CREATION_TIMEOUT_SECONDS,
      intervalMs = 2000,
    }) {
      const deadline = Date.now() + timeoutSeconds * 1000;
      while (Date.now() < deadline) {
        const found = shellExec(`kubectl get pod ${podName} -n ${namespace} --ignore-not-found -o name`, {
          stdout: true,
          silent: true,
          silentOnError: true,
          disableLog: true,
        });
        if (`${found || ''}`.trim()) return true;
        await timer(intervalMs);
      }
      return false;
    },

    /**
     * Waits for each named pod to be created and then to report Ready.
     *
     * Never throws: a pod that never arrives or never becomes Ready is returned to the caller,
     * which owns the diagnosis — a stalled rollout usually needs surrounding context (volume
     * bindings, events) that a bare non-zero exit code cannot carry.
     *
     * @param {object} params
     * @param {string[]} params.podNames - Pods to wait for, in order.
     * @param {string} [params.namespace='default'] - Pod namespace.
     * @param {number} [params.creationTimeoutSeconds=120] - Per-pod budget for the pod to appear.
     * @param {number} [params.readyTimeoutSeconds=180] - Per-pod budget for the Ready condition.
     * @returns {Promise<string[]>} Names of the pods that did not become ready (empty = all good).
     * @memberof UnderpostKubectl
     */
    async waitForPodsReady({
      podNames,
      namespace = 'default',
      creationTimeoutSeconds = DEFAULT_CREATION_TIMEOUT_SECONDS,
      readyTimeoutSeconds = DEFAULT_READY_TIMEOUT_SECONDS,
    }) {
      const failed = [];
      for (const podName of podNames) {
        if (
          !(await Underpost.kubectl.waitForPodCreation({ podName, namespace, timeoutSeconds: creationTimeoutSeconds }))
        ) {
          logger.error('Pod was never created', { podName, namespace, timeoutSeconds: creationTimeoutSeconds });
          failed.push(podName);
          continue;
        }

        const result = shellExec(
          `kubectl wait --for=condition=Ready pod/${podName} -n ${namespace} --timeout=${readyTimeoutSeconds}s`,
          { silentOnError: true },
        );
        if (result.code !== 0) {
          logger.error('Pod did not become ready', { podName, namespace, timeoutSeconds: readyTimeoutSeconds });
          failed.push(podName);
        }
      }
      return failed;
    },

    /**
     * Runs a shell command inside a pod container via `kubectl exec`.
     * @param {object} params
     * @param {string} params.podName - Target pod name.
     * @param {string} params.namespace - Pod namespace.
     * @param {string} params.command - Shell command to run inside the container.
     * @param {number} [params.retries=2] - Extra attempts allowed after a failure, with exponential backoff.
     * @param {number} [params.timeoutSeconds=0] - Wall-clock budget per attempt; `0` disables the bound.
     * @returns {string} stdout output from the in-pod command.
     * @throws {Error} Re-throws any execution error after logging.
     * @memberof UnderpostKubectl
     */
    exec({ podName, namespace, command, retries = DEFAULT_POD_RETRIES, timeoutSeconds = 0 }) {
      const kubectlCmd = `sudo kubectl exec -n ${namespace} -i ${podName} -- sh -c "${command}"`;
      return Underpost.kubectl.run(kubectlCmd, {
        context: `exec in pod ${podName}`,
        retries,
        timeoutSeconds,
        podName,
        namespace,
      });
    },

    /**
     * Copies a local file into a pod via `kubectl cp`.
     * @param {object} params
     * @param {string} params.sourcePath - Local source path.
     * @param {string} params.podName - Target pod name.
     * @param {string} params.namespace - Pod namespace.
     * @param {string} params.destPath - Destination path inside the container.
     * @param {number} [params.retries=2] - Extra attempts allowed after a failure, with exponential backoff.
     * @returns {boolean} `true` on success, `false` on error.
     * @memberof UnderpostKubectl
     */
    cpTo({ sourcePath, podName, namespace, destPath, retries = DEFAULT_POD_RETRIES }) {
      try {
        const command = `sudo kubectl cp ${sourcePath} ${namespace}/${podName}:${destPath}`;
        Underpost.kubectl.run(command, { context: `copy to pod ${podName}`, retries, podName, namespace });
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Copies a file from a pod to the local filesystem via `kubectl cp`.
     * @param {object} params
     * @param {string} params.podName - Source pod name.
     * @param {string} params.namespace - Pod namespace.
     * @param {string} params.sourcePath - Source path inside the container.
     * @param {string} params.destPath - Local destination path.
     * @param {number} [params.retries=2] - Extra attempts allowed after a failure, with exponential backoff.
     * @returns {boolean} `true` on success, `false` on error.
     * @memberof UnderpostKubectl
     */
    cpFrom({ podName, namespace, sourcePath, destPath, retries = DEFAULT_POD_RETRIES }) {
      try {
        const command = `sudo kubectl cp ${namespace}/${podName}:${sourcePath} ${destPath}`;
        Underpost.kubectl.run(command, { context: `copy from pod ${podName}`, retries, podName, namespace });
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Checks whether a file exists inside a pod container.
     * @param {object} params
     * @param {string} params.podName - Pod name.
     * @param {string} params.path - Absolute path inside the container to test.
     * @returns {boolean} `true` if the file exists.
     * @memberof UnderpostKubectl
     */
    existsFile({ podName, path }) {
      const result = shellExec(`kubectl exec ${podName} -- test -f ${path} && echo "true" || echo "false"`, {
        stdout: true,
        disableLog: true,
        silent: true,
      }).trim();
      return result === 'true';
    },

    /**
     * Returns a filtered list of pods from the cluster.
     * Supports wildcard glob patterns on pod names and optional deployId substring filtering.
     * @param {object} [criteria={}] - Filter criteria.
     * @param {string} [criteria.deployId] - Substring to match against pod names (forwards to `get`).
     * @param {string} [criteria.podNames] - Comma-separated glob patterns (supports `*`).
     * @param {string} [criteria.namespace='default'] - Kubernetes namespace to query.
     * @returns {Array<object>} Filtered pod rows from `get`.
     * @memberof UnderpostKubectl
     */
    getFilteredPods(criteria = {}) {
      const { podNames, namespace = 'default', deployId } = criteria;
      try {
        let pods = Underpost.kubectl.get(deployId || '', 'pods', namespace);
        if (podNames) {
          const patterns = podNames.split(',').map((p) => p.trim());
          pods = pods.filter((pod) =>
            patterns.some((pattern) => new RegExp('^' + pattern.replace(/\*/g, '.*') + '$').test(pod.NAME)),
          );
        }
        logger.info(`Found ${pods.length} pod(s) matching criteria`, { criteria, podNames: pods.map((p) => p.NAME) });
        return pods;
      } catch (error) {
        logger.error('Error filtering pods', { error: error.message, criteria });
        return [];
      }
    },
  };
}

export default UnderpostKubectl;

export { backoffDelayMs, withTimeout };
