/**
 * The Release Job: the Kubernetes execution boundary of a release that runs in the cluster. A
 * serving workload runs no release. A Release Job runs one command once, never retries on its own,
 * reads the release store read only, and receives one explicit Secret.
 *
 * @module src/server/release/release-job.js
 * @namespace ReleaseJob
 */
import { shellExec } from '../runtime/process.js';
import { RELEASE_STORE_ROOT } from './release-workspace.js';

/** Finished Jobs stay this long for their logs, then Kubernetes removes them. */
const JOB_TTL_SECONDS = 24 * 60 * 60;

const POLL_MS = 5000;

/**
 * A Job name for one run of a release: DNS-1123, at most 63 characters, unique per run.
 * @param {Object} params
 * @param {string} params.deployId
 * @param {string} params.releaseId
 * @param {number} [params.now]
 * @returns {string}
 * @memberof ReleaseJob
 */
export function releaseJobName({ deployId, releaseId, now = Date.now() }) {
  const suffix = now.toString(36);
  const base = `${deployId}-release-${releaseId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 62 - suffix.length)
    .replace(/-+$/, '');
  return `${base}-${suffix}`;
}

/**
 * Renders the Release Job.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.namespace='default']
 * @param {string} params.image
 * @param {string} params.command - One shell command line, run by `sh -c`.
 * @param {string} params.secretName - The one Secret the Job reads its credentials from.
 * @param {Object<string,string>} [params.variables] - Plain, non-secret environment values.
 * @param {string} params.deployId
 * @param {string} params.releaseId
 * @param {string} [params.nodeName] - Pins the Job to the node that holds the release store.
 * @param {string} [params.storePath]
 * @param {number} [params.timeoutSeconds=3600]
 * @param {string} [params.imagePullPolicy='IfNotPresent']
 * @returns {string} Job YAML.
 * @memberof ReleaseJob
 */
export function releaseJobManifestFactory({
  name,
  namespace = 'default',
  image,
  command,
  secretName,
  variables = {},
  deployId,
  releaseId,
  nodeName = '',
  storePath = RELEASE_STORE_ROOT,
  timeoutSeconds = 3600,
  imagePullPolicy = 'IfNotPresent',
}) {
  for (const [key, value] of Object.entries({ image, command, secretName }))
    if (!value) throw new Error(`A Release Job needs ${key}`);
  const labels = (indent) =>
    [`app: underpost-release`, `deploy-id: ${deployId}`, `release-id: ${releaseId}`]
      .map((line) => `${' '.repeat(indent)}${line}`)
      .join('\n');
  // JSON strings are YAML scalars: no value needs escaping of its own.
  const env = Object.entries({ ...variables, UNDERPOST_RELEASE_STORE: storePath })
    .map(([key, value]) => `            - name: ${key}\n              value: ${JSON.stringify(`${value}`)}`)
    .join('\n');
  return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
${labels(4)}
spec:
  backoffLimit: 0
  activeDeadlineSeconds: ${timeoutSeconds}
  ttlSecondsAfterFinished: ${JOB_TTL_SECONDS}
  template:
    metadata:
      labels:
${labels(8)}
    spec:
      restartPolicy: Never
${nodeName ? `      nodeSelector:\n        kubernetes.io/hostname: ${nodeName}\n` : ''}      containers:
        - name: release
          image: ${image}
          imagePullPolicy: ${imagePullPolicy}
          envFrom:
            - secretRef:
                name: ${secretName}
          env:
${env}
          command: ${JSON.stringify(['/bin/sh', '-c', command])}
          volumeMounts:
            - name: release-store
              mountPath: ${JSON.stringify(storePath)}
              readOnly: true
      volumes:
        - name: release-store
          hostPath:
            path: ${JSON.stringify(storePath)}
            type: Directory`;
}

const kubectl = (args) =>
  `${shellExec(`kubectl ${args}`, { silent: true, stdout: true, silentOnError: true, disableLog: true }) ?? ''}`.trim();

/**
 * The state of a Job: `running`, `succeeded` or `failed`.
 * @param {string} name
 * @param {string} namespace
 * @returns {'running'|'succeeded'|'failed'}
 * @memberof ReleaseJob
 */
export function releaseJobState(name, namespace) {
  const [succeeded, failed] = kubectl(
    `get job ${name} -n ${namespace} -o jsonpath='{.status.succeeded},{.status.failed}'`,
  ).split(',');
  if (Number(succeeded) > 0) return 'succeeded';
  if (Number(failed) > 0) return 'failed';
  return 'running';
}

/**
 * Applies a Release Job, streams its log, and waits for its end.
 * @param {Object} params
 * @param {string} params.manifest
 * @param {string} params.name
 * @param {string} [params.namespace='default']
 * @param {number} [params.timeoutSeconds=3600]
 * @returns {Promise<boolean>} Whether the Job succeeded.
 * @memberof ReleaseJob
 */
export async function runReleaseJob({ manifest, name, namespace = 'default', timeoutSeconds = 3600 }) {
  shellExec(`kubectl apply -f - <<'EOF'\n${manifest}\nEOF`);
  const deadline = Date.now() + timeoutSeconds * 1000;
  let streamed = false;
  let state = 'running';
  while (Date.now() < deadline) {
    const phase = kubectl(`get pods -n ${namespace} -l job-name=${name} -o jsonpath='{.items[0].status.phase}'`);
    // `logs -f` returns when the container ends, so the log is whole before the state is read.
    if (!streamed && ['Running', 'Succeeded', 'Failed'].includes(phase)) {
      shellExec(`kubectl logs -f job/${name} -n ${namespace}`, { silentOnError: true, disableLog: true });
      streamed = true;
    }
    state = releaseJobState(name, namespace);
    if (state !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  if (state === 'running') shellExec(`kubectl delete job ${name} -n ${namespace} --ignore-not-found`);
  return state === 'succeeded';
}
