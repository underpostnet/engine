/**
 * Kubectl module providing low-level Kubernetes resource management primitives.
 * Centralises pod querying, file transfer, and in-container execution operations
 * that were previously scattered across db, deploy, and cluster modules.
 * @module src/cli/kubectl.js
 * @namespace UnderpostKubectl
 */

import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
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
      const raw = shellExec(
        `sudo kubectl get ${kindType}${namespace ? ` -n ${namespace}` : ` --all-namespaces`} -o wide`,
        { stdout: true, disableLog: true, silent: true },
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
     * @param {string} command - Full kubectl command string.
     * @param {object} [options={}] - Execution options.
     * @param {string} [options.context=''] - Human-readable label for log messages.
     * @returns {string} stdout output from the command.
     * @throws {Error} Re-throws any execution error after logging.
     * @memberof UnderpostKubectl
     */
    run(command, options = {}) {
      const { context = '' } = options;
      try {
        logger.info(`Executing kubectl command`, { command: sanitizeCommand(command), context });
        return shellExec(command, { stdout: true, disableLog: true });
      } catch (error) {
        logger.error(`kubectl command failed`, { command: sanitizeCommand(command), error: error.message, context });
        throw error;
      }
    },

    /**
     * Runs a shell command inside a pod container via `kubectl exec`.
     * @param {object} params
     * @param {string} params.podName - Target pod name.
     * @param {string} params.namespace - Pod namespace.
     * @param {string} params.command - Shell command to run inside the container.
     * @returns {string} stdout output from the in-pod command.
     * @throws {Error} Re-throws any execution error after logging.
     * @memberof UnderpostKubectl
     */
    exec({ podName, namespace, command }) {
      try {
        const kubectlCmd = `sudo kubectl exec -n ${namespace} -i ${podName} -- sh -c "${command}"`;
        return Underpost.kubectl.run(kubectlCmd, { context: `exec in pod ${podName}` });
      } catch (error) {
        logger.error('Failed to execute command in pod', {
          podName,
          command: sanitizeCommand(command),
          error: error.message,
        });
        throw error;
      }
    },

    /**
     * Copies a local file into a pod via `kubectl cp`.
     * @param {object} params
     * @param {string} params.sourcePath - Local source path.
     * @param {string} params.podName - Target pod name.
     * @param {string} params.namespace - Pod namespace.
     * @param {string} params.destPath - Destination path inside the container.
     * @returns {boolean} `true` on success, `false` on error.
     * @memberof UnderpostKubectl
     */
    cpTo({ sourcePath, podName, namespace, destPath }) {
      try {
        const command = `sudo kubectl cp ${sourcePath} ${namespace}/${podName}:${destPath}`;
        Underpost.kubectl.run(command, { context: `copy to pod ${podName}` });
        return true;
      } catch (error) {
        logger.error('Failed to copy file to pod', { sourcePath, podName, destPath, error: error.message });
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
     * @returns {boolean} `true` on success, `false` on error.
     * @memberof UnderpostKubectl
     */
    cpFrom({ podName, namespace, sourcePath, destPath }) {
      try {
        const command = `sudo kubectl cp ${namespace}/${podName}:${sourcePath} ${destPath}`;
        Underpost.kubectl.run(command, { context: `copy from pod ${podName}` });
        return true;
      } catch (error) {
        logger.error('Failed to copy file from pod', { podName, sourcePath, destPath, error: error.message });
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
