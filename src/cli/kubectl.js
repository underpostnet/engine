/**
 * Kubectl module providing low-level Kubernetes resource management primitives.
 * Centralises pod querying, file transfer, and in-container execution operations
 * that were previously scattered across db, deploy, and cluster modules.
 * @module src/cli/kubectl.js
 * @namespace UnderpostKubectl
 */

import net from 'node:net';
import fs from 'fs-extra';
import { loadAll } from 'js-yaml';
import { schedulePodTemplate } from '../server/runtime/pod-scheduling.js';
import { loggerFactory, redactSensitiveText } from '../server/ops/logger.js';
import { shellArgumentFactory, shellExec, shellSpawn, sleepSync } from '../server/runtime/process.js';
import { timer } from '../client/components/core/CommonJs.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

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
// Server-side apply keys Service ports by port and protocol; client-side apply merges a TCP/UDP pair on one port.
const KUBECTL_SERVER_SIDE_APPLY = 'kubectl apply --server-side --force-conflicts';

const withTimeout = (command, timeoutSeconds) =>
  timeoutSeconds > 0 ? `timeout --kill-after=10s ${timeoutSeconds}s ${command}` : command;

/**
 * The manifest of a client pod and of the Secret that carries its credentials. The pod sleeps
 * until its deadline; its work arrives through exec streams.
 * @param {object} params - As {@link UnderpostKubectl.API.startClientPod}.
 * @returns {string} Two YAML documents.
 * @memberof UnderpostKubectl
 */
const clientPodManifestFactory = ({
  name,
  namespace,
  image,
  secretEnv = {},
  labels = {},
  limits,
  scratchSize = '',
  activeDeadlineSeconds,
}) => {
  const allLabels = { 'managed-by': 'underpost', app: 'underpost-client-pod', ...labels };
  const labelLines = (indent) =>
    Object.entries(allLabels)
      .map(([key, value]) => `${indent}${key}: ${JSON.stringify(String(value))}`)
      .join('\n');
  const secretData = Object.entries(secretEnv)
    .map(([key, value]) => `  ${key}: ${Buffer.from(String(value ?? '')).toString('base64')}`)
    .join('\n');
  return `apiVersion: v1
kind: Secret
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
${labelLines('    ')}
type: Opaque
data:
${secretData || '  UNDERPOST_CLIENT: ""'}
---
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
${labelLines('    ')}
spec:
  restartPolicy: Never
  activeDeadlineSeconds: ${activeDeadlineSeconds}
  terminationGracePeriodSeconds: 30
  automountServiceAccountToken: false
  containers:
    - name: client
      image: ${JSON.stringify(image)}
      imagePullPolicy: IfNotPresent
      command: ['sleep', '${activeDeadlineSeconds}']
      envFrom:
        - secretRef:
            name: ${name}
      resources:
        requests:
          cpu: '100m'
          memory: '128Mi'
        limits:
          cpu: ${JSON.stringify(limits.cpu)}
          memory: ${JSON.stringify(limits.memory)}${
            scratchSize
              ? `
      volumeMounts:
        - name: scratch
          mountPath: /scratch
  volumes:
    - name: scratch
      emptyDir:
        sizeLimit: ${JSON.stringify(scratchSize)}`
              : ''
          }`;
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
      // Existence-check style: a missing kubectl context, a non-existent
      // namespace, or no pods matching the filter must return an empty
      // list (not throw). silentOnError keeps the legacy contract.
      const raw = shellExec(
        `kubectl get ${kindType}${namespace ? ` -n ${shellArgumentFactory(namespace)}` : ` --all-namespaces`} -o wide`,
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
     * Prepares a retained PersistentVolume for one claim before an installer applies it. A volume that
     * a live claim of another namespace or name holds refuses: that claim owns its data. A released
     * volume drops its stale claim reference, so the claim binds it and its data stays.
     * @param {object} params
     * @param {string} params.volume - The PersistentVolume.
     * @param {string} params.namespace - The namespace of the claim.
     * @param {string} params.claim - The claim.
     * @returns {'absent'|'ready'|'released'} The state of the volume before the call.
     * @throws {Error} When a live claim holds the volume.
     * @memberof UnderpostKubectl
     */
    claimVolume({ volume, namespace, claim }) {
      const read = (command) =>
        `${shellExec(command, { stdout: true, silent: true, silentOnError: true }) ?? ''}`.trim();
      const reference = read(
        `kubectl get pv ${shellArgumentFactory(volume)} --ignore-not-found ` +
          `-o jsonpath='{.spec.claimRef.namespace}/{.spec.claimRef.name}/{.spec.claimRef.uid}'`,
      );
      if (!reference) return 'absent';
      const [holderNamespace, holder, uid] = reference.split('/');
      if (!holder || (holderNamespace === namespace && holder === claim)) return 'ready';
      const live = read(
        `kubectl get pvc ${shellArgumentFactory(holder)} -n ${shellArgumentFactory(holderNamespace)} ` +
          `--ignore-not-found -o jsonpath='{.metadata.uid}'`,
      );
      if (live && (!uid || live === uid))
        throw new Error(
          `PersistentVolume ${volume} holds the data of ${holderNamespace}/${holder}, which is live: release it ` +
            `(node bin namespace migrate) or install into ${holderNamespace}`,
        );
      shellExec(
        `kubectl patch pv ${shellArgumentFactory(volume)} --type=json -p ${shellArgumentFactory(
          JSON.stringify([
            {
              op: 'replace',
              path: '/spec/claimRef',
              value: { apiVersion: 'v1', kind: 'PersistentVolumeClaim', namespace, name: claim },
            },
          ]),
        )}`,
      );
      logger.info(`Released PersistentVolume ${volume} from ${holderNamespace}/${holder} for ${namespace}/${claim}`);
      return 'released';
    },

    /**
     * Applies a manifest with the pod scheduling of its resource: a kustomization directory, rendered by
     * `kubectl kustomize`, or a file. Each pod template takes the node selector and the tolerations; a
     * DaemonSet keeps its own placement.
     * @param {object} params
     * @param {string} params.path - A kustomization directory or a manifest file.
     * @param {string} params.namespace - The namespace of its namespaced objects.
     * @param {{affinity?:Object, tolerations?:Object[]}} [params.scheduling] - {@link UnderpostNamespace.podScheduling}.
     * @memberof UnderpostKubectl
     */
    applyScheduled({ path, namespace, scheduling = {} }) {
      const manifest = fs.statSync(path).isDirectory()
        ? shellExec(`kubectl kustomize ${shellArgumentFactory(path)}`, { stdout: true, silent: true })
        : fs.readFileSync(path, 'utf8');
      const items = loadAll(manifest)
        .filter(Boolean)
        .map((object) => schedulePodTemplate(object, scheduling));
      shellExec(
        `kubectl apply -n ${shellArgumentFactory(namespace)} -f - <<'EOF'\n${JSON.stringify({ apiVersion: 'v1', kind: 'List', items })}\nEOF\n`,
      );
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
            command: redactSensitiveText(command),
            context,
            ...(attempts > 1 ? { attempt, attempts } : {}),
          });
          return shellExec(boundedCommand, { stdout: true, disableLog: true });
        } catch (error) {
          if (attempt === attempts) {
            logger.error(`kubectl command failed`, {
              command: redactSensitiveText(command),
              error: error.message,
              context,
              attempts,
            });
            throw error;
          }
          const delayMs = backoffDelayMs(attempt, baseDelayMs);
          logger.warn(`kubectl command failed, retrying`, {
            command: redactSensitiveText(command),
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
          `kubectl wait --for=condition=Ready ${shellArgumentFactory(`pod/${podName}`)} -n ${shellArgumentFactory(namespace)} --timeout=${shellArgumentFactory(`${readyTimeoutSeconds}s`)}`,
          probeOptions,
        );
        const probe = shellExec(
          withTimeout(
            `kubectl exec -n ${shellArgumentFactory(namespace)} -i ${shellArgumentFactory(podName)} -- sh -c "exit 0"`,
            probeTimeoutSeconds,
          ),
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
        const found = shellExec(
          `kubectl get pod ${shellArgumentFactory(podName)} -n ${shellArgumentFactory(namespace)} --ignore-not-found -o name`,
          {
            stdout: true,
            silent: true,
            silentOnError: true,
            disableLog: true,
          },
        );
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
          `kubectl wait --for=condition=Ready ${shellArgumentFactory(`pod/${podName}`)} -n ${shellArgumentFactory(namespace)} --timeout=${shellArgumentFactory(`${readyTimeoutSeconds}s`)}`,
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
     * Runs a shell command inside a pod container via `kubectl exec`. The command is quoted as one
     * argument, so the pod's shell parses it and the host shell never expands it.
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
      const kubectlCmd = `kubectl exec -n ${shellArgumentFactory(namespace)} -i ${shellArgumentFactory(podName)} -- sh -c ${shellArgumentFactory(command)}`;
      return Underpost.kubectl.run(kubectlCmd, {
        context: `exec in pod ${podName}`,
        retries,
        timeoutSeconds,
        podName,
        namespace,
      });
    },

    /**
     * Runs a command in a pod with its stdin and stdout as streams, so a dump or a restore never
     * lands on the disk of the pod or of this host.
     * @param {object} params
     * @param {string} params.podName - Target pod name.
     * @param {string} [params.namespace='default'] - Pod namespace.
     * @param {string} params.command - Shell command to run inside the container.
     * @returns {ReturnType<typeof shellSpawn>} The child: `stdin`, `stdout` and `exited`.
     * @memberof UnderpostKubectl
     */
    execStream({ podName, namespace = 'default', command }) {
      return shellSpawn(
        `kubectl exec -i -n ${shellArgumentFactory(namespace)} ${shellArgumentFactory(podName)} -- sh -c ${shellArgumentFactory(command)}`,
      );
    },

    /**
     * Starts a dedicated client pod and waits until it accepts exec streams. The pod runs a tool
     * against a service with its own resource limits, never inside the container it reads. The
     * name is the lock: `kubectl create` refuses a second pod of that name, so two runs never
     * overlap. A pod left by a stopped run is removed once it ended or outlived its deadline.
     *
     * Credentials travel in a Secret applied from stdin, never in a command line; the container
     * reads them as environment variables.
     * @param {object} params
     * @param {string} params.name - Pod name: one per target at a time.
     * @param {string} [params.namespace='default']
     * @param {string} params.image - Exact image, by digest when the caller knows it.
     * @param {Object<string,string>} [params.secretEnv={}] - Variables the Secret carries.
     * @param {Object<string,string>} [params.labels={}]
     * @param {{cpu:string, memory:string}} [params.limits]
     * @param {string} [params.scratchSize] - Size limit of an `emptyDir` at `/scratch`; none without it.
     * @param {number} [params.activeDeadlineSeconds=21600] - The pod ends after this, whatever runs.
     * @param {number} [params.readyTimeoutSeconds=180]
     * @returns {Promise<{name:string, namespace:string, remove:() => void}>}
     * @throws {Error} When another run holds the name, or the pod never becomes ready.
     * @memberof UnderpostKubectl
     */
    async startClientPod({
      name,
      namespace = 'default',
      image,
      secretEnv = {},
      labels = {},
      limits = { cpu: '1', memory: '1Gi' },
      scratchSize = '',
      activeDeadlineSeconds = 21600,
      readyTimeoutSeconds = DEFAULT_READY_TIMEOUT_SECONDS,
    }) {
      const ns = shellArgumentFactory(namespace);
      const remove = () =>
        shellExec(
          `kubectl delete pod/${shellArgumentFactory(name)} secret/${shellArgumentFactory(name)} -n ${ns} --ignore-not-found --wait=false`,
          { silent: true, silentOnError: true, disableLog: true },
        );
      const manifest = clientPodManifestFactory({
        name,
        namespace,
        image,
        secretEnv,
        labels,
        limits,
        scratchSize,
        activeDeadlineSeconds,
      });
      const create = async () => {
        const child = shellSpawn(`kubectl create -f - -n ${ns}`, { disableLog: true });
        child.stdin.end(manifest);
        try {
          await child.exited;
          return { code: 0, stderr: '' };
        } catch (error) {
          return { code: error.code ?? 1, stderr: error.stderr ?? error.message };
        }
      };
      let created = await create();
      if (created.code !== 0 && /AlreadyExists/.test(`${created.stderr}`)) {
        const phase = shellExec(
          `kubectl get pod ${shellArgumentFactory(name)} -n ${ns} -o jsonpath='{.status.phase} {.metadata.creationTimestamp}'`,
          { stdout: true, silent: true, silentOnError: true, disableLog: true },
        ).trim();
        const [state, createdAt] = phase.split(' ');
        const expired = Date.now() - Date.parse(createdAt) > activeDeadlineSeconds * 1000;
        if (!['Succeeded', 'Failed', ''].includes(state ?? '') && !expired)
          throw new Error(`Client pod ${name} is ${state}: another run holds it. Wait for it, or delete the pod`);
        logger.warn('Removing a client pod a stopped run left', { name, state });
        remove();
        await timer(5000);
        created = await create();
      }
      if (created.code !== 0)
        throw new Error(`Client pod ${name} was not created: ${redactSensitiveText(`${created.stderr}`)}`);
      try {
        Underpost.kubectl.run(
          `kubectl wait --for=condition=Ready pod/${shellArgumentFactory(name)} -n ${ns} --timeout=${readyTimeoutSeconds}s`,
          { context: `client pod ${name}` },
        );
        if (!Underpost.kubectl.ensureExecReady({ podName: name, namespace }))
          throw new Error(`Client pod ${name} does not accept exec streams`);
      } catch (error) {
        remove();
        throw error;
      }
      return { name, namespace, remove };
    },

    /**
     * Forwards a local port to a port of a pod or a Service, for a process outside the cluster. The
     * forward lives while this process holds its stdin: `close()`, or any exit of this process,
     * Ctrl+C and SIGKILL included, stops it.
     * @param {object} params
     * @param {string} params.resource - `pod/<name>` or `svc/<name>`.
     * @param {string} [params.namespace='default']
     * @param {string} [params.context] - The kubeconfig context; the current one when absent.
     * @param {number} params.remotePort
     * @param {string} [params.address='127.0.0.1'] - The local address the forward listens on.
     * @param {number} [params.localPort] - The local port; a free one when absent.
     * @param {number} [params.readyTimeoutMs=20000] - Wait for `kubectl` to listen.
     * @returns {Promise<{localPort:number, close:() => void, ended:Promise<void>}>} `ended` settles
     *   when the forward stops.
     * @throws {Error} When the resource is not a pod or a Service, or the forward does not listen in time or exits.
     * @memberof UnderpostKubectl
     */
    async portForward({
      resource,
      namespace = 'default',
      context = '',
      remotePort,
      address = '127.0.0.1',
      localPort,
      readyTimeoutMs = 20000,
    }) {
      if (!/^(pod|svc)\/[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(`${resource}`))
        throw new Error(`A forward targets pod/<name> or svc/<name>, not ${resource}`);
      localPort ??= await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on('error', reject);
        server.listen(0, address, () => {
          const { port } = server.address();
          server.close(() => resolve(port));
        });
      });
      const forward = `kubectl${context ? ` --context ${shellArgumentFactory(context)}` : ''} port-forward -n ${shellArgumentFactory(namespace)} ${shellArgumentFactory(resource)} --address ${shellArgumentFactory(address)} ${localPort}:${remotePort}`;
      // A watcher stops kubectl at the end of stdin, so a close needs no signal to a process group.
      const child = shellSpawn(
        `sh -c ${shellArgumentFactory(`exec 3<&0; ${forward} </dev/null 3<&- & k=$!; (read x <&3; kill $k) >/dev/null 2>&1 & wait $k`)}`,
      );
      const close = () => child.stdin.end();
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`The forward to ${resource}:${remotePort} did not listen in ${readyTimeoutMs}ms`)),
            readyTimeoutMs,
          );
          child.stdout.on('data', (chunk) => {
            if (!/Forwarding from/.test(`${chunk}`)) return;
            clearTimeout(timeout);
            resolve();
          });
          child.exited.then(
            () => reject(new Error(`The forward to ${resource}:${remotePort} exited`)),
            (error) =>
              reject(new Error(`The forward to ${resource}:${remotePort} failed: ${error.stderr || error.message}`)),
          );
        });
      } catch (error) {
        close();
        throw error;
      }
      logger.info('Port forward ready', { resource, namespace, context, address, localPort, remotePort });
      return {
        localPort,
        close,
        ended: child.exited.then(
          () => {},
          () => {},
        ),
      };
    },

    /**
     * The exact image a pod's first container runs: its image id when the runtime reports one.
     * @param {string} podName
     * @param {string} [namespace='default']
     * @returns {string} Empty when the pod is unknown.
     * @memberof UnderpostKubectl
     */
    podImage(podName, namespace = 'default') {
      const read = (path) =>
        shellExec(
          `kubectl get pod ${shellArgumentFactory(podName)} -n ${shellArgumentFactory(namespace)} -o jsonpath=${shellArgumentFactory(`{${path}}`)}`,
          { stdout: true, silent: true, silentOnError: true, disableLog: true },
        ).trim();
      const imageId = read('.status.containerStatuses[0].imageID').replace(/^docker-pullable:\/\//, '');
      return imageId.includes('@sha256:') ? imageId : read('.spec.containers[0].image');
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
        const command = `kubectl cp ${sourcePath} ${namespace}/${podName}:${destPath}`;
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
        const command = `kubectl cp ${namespace}/${podName}:${sourcePath} ${destPath}`;
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
      const result = shellExec(
        `kubectl exec ${shellArgumentFactory(podName)} -- test -f ${shellArgumentFactory(path)} && echo "true" || echo "false"`,
        {
          stdout: true,
          disableLog: true,
          silent: true,
        },
      ).trim();
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

export { KUBECTL_SERVER_SIDE_APPLY, backoffDelayMs, clientPodManifestFactory, withTimeout };
