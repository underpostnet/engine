/**
 * UnderpostCron server module
 *
 * ## Host mounts and SELinux
 *
 * Generated CronJob pods run as `container_t`, so every host path they mount has to carry a type
 * that domain can use, and no host path carries a credential:
 *
 * - **the global underpost directory** (`<npm root>/underpost`, i.e. root's nvm tree) was mounted
 *   over the image's own copy of the CLI purely so the container could read `.env` and `.state`
 *   from it. It carried `admin_home_t`, which `container_t` can neither read nor write, and it
 *   exposed the whole of root's npm tree to get at two variables. Replaced by an optional
 *   `envFrom` Secret carrying exactly those values.
 * - **the node-exporter textfile directory** is written by the job bodies. Created by the
 *   collector's installer under `/var/lib`, so it inherits a type `container_t` may read but not
 *   write; {@link prepareCronHostStorage} gives it the shared container label.
 * - **the engine mirror** at {@link ENGINE_MIRROR_PATH}. The job body is `node bin ...` — it
 *   executes *this repository*, so it needs the source tree, its `node_modules` and the deploy
 *   configuration it resolves — {@link engineMirrorContentsFactory} is that set, and nothing wider.
 *   The checkout itself is never mounted. It lives in the operator's home tree, where
 *   `container_t` is denied every read, and the fix cannot be to relabel it: it is a live working
 *   tree, and the shared container label on it would make everything ever written there
 *   container-readable. So the pods mount a dedicated copy outside `/home` instead, refreshed
 *   from the checkout and labeled by {@link prepareCronHostStorage}. The mount lands on the
 *   checkout's own path inside the container, so nothing the job body runs knows the difference.
 * - **the connection key**, a projected Secret rather than a host path. `ssh` authenticates with a
 *   file, so it cannot travel in the `envFrom` Secret beside the tokens; and it must not travel in
 *   the mirror, which every `container_t` process on the node can read.
 *   {@link UnderpostSSH.keyPathFactory} prefers the mount, so a pod and the host CLI take the same
 *   code path to different keys.
 *
 * @module src/server/ops/cron.js
 * @namespace UnderpostCron
 */

import { loggerFactory } from './logger.js';
import { shellArgumentFactory, shellExec } from '../runtime/process.js';
import fs from 'fs-extra';
import os from 'node:os';
import dotenv from 'dotenv';
import Underpost from '../../index.js';
import { DEPLOY_ROUTES_PATH, readDeployRoutes } from '../network/router.js';
import { UNDERPOST_MONITORING } from './monitoring.js';
import ContainerStorageService, { ensureContainerStorage } from '../security/container-storage.js';
import { assertRoleCapability } from '../network/node-capability.js';

const logger = loggerFactory(import.meta);

// Where the job body runs, inside the container. The image is built around this path and every
// relative path the CLI resolves hangs off it, so the mount lands here whatever its host source.
const enginePath = '/home/dd/engine';
// The host source that mount reads: a copy of the checkout outside every home tree, which is the
// only way an unprivileged pod can read this platform's own source. See the module header.
const ENGINE_MIRROR_PATH = '/opt/engine';
const cronVolumeName = 'underpost-cron-container-volume';
const textfileVolumeName = 'underpost-node-exporter-textfile';
// The credentials the job bodies read out of the environment (`GITHUB_TOKEN`, `GITHUB_USERNAME`).
// They used to arrive by bind-mounting the operator's global underpost directory out of root's
// home over the image's own copy of the CLI; a Secret delivers exactly those values, is labeled
// for container consumption by kubelet, and exposes nothing else of that tree.
const cronEnvSecretName = 'underpost-cron-env';
// The connection key, projected as a volume: ssh authenticates with a file, and the mirror the
// pods mount deliberately carries no key material. `UnderpostSSH.keyPathFactory` reads it here.
const cronSshSecretName = 'underpost-ssh-key';
const sshSecretMountPath = '/etc/underpost/secrets/ssh';
const sshVolumeName = 'underpost-ssh-key';
const DEFAULT_CRON_ID = 'dd-cron';

/** The environment a generated pod runs. Rendered into the manifest, where it wins over the
 * projected Secret, so the resolved value and the running value cannot drift. */
const cronDeployEnvFactory = (dev) => (dev === true ? 'development' : 'production');

/**
 * Resolves the deploy ID stored in `engine-private/deploy/dd.cron`.
 * @returns {string|null}
 * @memberof UnderpostCron
 */
const cronDeployIdResolve = () => {
  const path = './engine-private/deploy/dd.cron';
  if (!fs.existsSync(path)) return null;
  return fs.readFileSync(path, 'utf8').trim() || null;
};

/**
 * Loads cron and router deployment environment files into `process.env`.
 * @returns {void}
 * @memberof UnderpostCron
 */
const loadCronDeployEnv = () => {
  const envName = process.env.NODE_ENV || 'production';
  const cronDeployId = cronDeployIdResolve();

  if (cronDeployId) {
    const path = `./engine-private/conf/${cronDeployId}/.env.${envName}`;
    if (fs.existsSync(path)) process.env = { ...process.env, ...dotenv.parse(fs.readFileSync(path, 'utf8')) };
  }

  for (const id of readDeployRoutes()) {
    const path = `./engine-private/conf/${id}/.env.${envName}`;
    if (!id || !fs.existsSync(path)) continue;
    const env = dotenv.parse(fs.readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(env)) {
      if (!(key in process.env)) process.env[key] = value;
    }
  }
};

/**
 * Generates a Kubernetes CronJob YAML manifest string.
 *
 * @param {Object} params - CronJob parameters
 * @param {string} params.name - CronJob name (max 52 chars, sanitized to DNS subdomain)
 * @param {string} params.expression - Cron schedule expression (e.g., '0 0 * * *')
 * @param {string} params.deployList - Comma-separated deploy IDs for the cron CLI
 * @param {string} params.jobList - Comma-separated job IDs (e.g., 'dns', 'backup')
 * @param {string} [params.image] - Container image (defaults to underpost/underpost-engine:<version>)
 * @param {string} [params.namespace='default'] - Kubernetes namespace
 * @param {boolean} [params.git=false] - Pass --git flag to cron CLI
 * @param {boolean} [params.dev=false] - Use local ./ base path instead of global underpost installation
 * @param {string} [params.cmd] - Optional pre-script commands to run before cron execution
 * @param {boolean} [params.suspend=false] - Whether the CronJob is suspended
 * @param {boolean} [params.dryRun=false] - Pass --dry-run flag to the cron command inside the container
 * @param {boolean} [params.k3s=false] - Pass --k3s flag to the cron command inside the container
 * @param {boolean} [params.kind=false] - Pass --kind flag to the cron command inside the container
 * @param {boolean} [params.kubeadm=false] - Pass --kubeadm flag to the cron command inside the container
 * @param {string} [params.nodeName] - Pin the Job pod to this node via a `kubernetes.io/hostname` nodeSelector.
 *   Placement is a manifest concern only, so it is never forwarded to the cron command inside the container.
 * @returns {string} Kubernetes CronJob YAML manifest
 * @memberof UnderpostCron
 */
const cronJobYamlFactory = ({
  name,
  expression,
  deployList,
  jobList,
  image,
  namespace = 'default',
  git = false,
  dev = false,
  cmd,
  suspend = false,
  dryRun = false,
  k3s = false,
  kind = false,
  kubeadm = false,
  nodeName = '',
}) => {
  const containerImage = image || `underpost/underpost-engine:${Underpost.version}`;

  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 52);

  const cronDeployId = cronDeployIdResolve();

  const flags = `${git ? '--git ' : ''}${dev ? '--dev ' : ''}${dryRun ? '--dry-run ' : ''}${k3s ? '--k3s ' : ''}${kind ? '--kind ' : ''}${kubeadm ? '--kubeadm ' : ''}`;
  // No `app load`: it materializes a deployment's environment from its env file, and the pod has
  // neither. Its environment arrives injected, scoped to what the jobs consume; the `conf.*.json`
  // the jobs read carry `env:` references that resolve against exactly that.
  const commands = [`cd ${enginePath}`];
  if (cmd) commands.push(cmd);
  commands.push(`node bin cron ${deployList} ${jobList} ${flags}`);
  const fullCommand = commands.join(' &&\n                  ');

  return `apiVersion: batch/v1
kind: CronJob
metadata:
  name: ${sanitizedName}
  namespace: ${namespace}
  labels:
    app: ${sanitizedName}
    managed-by: underpost
spec:
  schedule: "${expression}"
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 200
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  suspend: ${suspend}
  jobTemplate:
    metadata:
      labels:
        app: ${sanitizedName}
        managed-by: underpost
    spec:
      template:
        metadata:
          labels:
            app: ${sanitizedName}
            managed-by: underpost
        spec:
${
  nodeName
    ? `          nodeSelector:
            kubernetes.io/hostname: ${nodeName}
`
    : ''
}          containers:
            - name: ${sanitizedName}
              image: ${containerImage}
              command:
                - /bin/sh
                - -c
                - >
                  ${fullCommand}
              # Explicit, so the environment the pod runs is the one this manifest resolved:
              # a container env entry wins over envFrom, whatever the projected Secret carries.
              env:
                - name: NODE_ENV
                  value: ${cronDeployEnvFactory(dev)}
              envFrom:
                - secretRef:
                    name: ${cronEnvSecretName}
                    optional: true
              volumeMounts:
                - mountPath: ${enginePath}
                  name: ${cronVolumeName}
                - mountPath: ${UNDERPOST_MONITORING.nodeExporter.textfileDirectory}
                  name: ${textfileVolumeName}
                - mountPath: ${sshSecretMountPath}
                  name: ${sshVolumeName}
                  readOnly: true
          volumes:
            # The engine mirror: a copy of the checkout kept outside every home tree, because
            # \`container_t\` is denied every read under one. The job body runs this repository's CLI
            # (\`node bin ...\`), so it needs the source tree, its node_modules and engine-private's
            # deploy configuration — the mount cannot be narrowed below that. Refreshed and labeled
            # by prepareCronHostStorage(); see src/server/ops/cron.js's module header.
            - hostPath:
                path: ${ENGINE_MIRROR_PATH}
                type: Directory
              name: ${cronVolumeName}
            # Metrics the cluster cannot scrape for itself are written here and read by the
            # node-exporter collector. Prepared and labeled by prepareCronHostStorage().
            - hostPath:
                path: ${UNDERPOST_MONITORING.nodeExporter.textfileDirectory}
                type: DirectoryOrCreate
              name: ${textfileVolumeName}
            # Optional for the same reason the credential Secret is: a cluster that has onboarded
            # no key still schedules, and the job that needs one reports its own failure.
            - secret:
                secretName: ${cronSshSecretName}
                optional: true
                defaultMode: 0400
              name: ${sshVolumeName}
          restartPolicy: OnFailure
`;
};

/**
 * Prepares the node directories the generated CronJobs mount, and gives the one they write to a
 * label an unprivileged container can actually use.
 *
 * The node-exporter textfile directory is created by the collector's own installer under
 * `/var/lib`, so it inherits that tree's policy type — which `container_t` may read but never
 * write. The cron pods write their metrics there, so without this the first Enforcing run turns
 * every `*.prom` write into a denial.
 *
 * The engine mirror is refreshed from the checkout first, then labeled with the rest: the pods
 * execute it, so a stale or unlabeled mirror is the same outage. The checkout itself is never
 * prepared — it is the operator's working tree, and the shared container label on it would make
 * everything written there container-readable.
 * @returns {string[]} Prepared paths.
 * @memberof UnderpostCron
 */
const prepareCronHostStorage = () => {
  syncEngineMirror();

  const paths = [UNDERPOST_MONITORING.nodeExporter.textfileDirectory, ENGINE_MIRROR_PATH];
  ensureContainerStorage(paths, { execute: shellExec });

  const mirror = cronCheckoutContextFactory();
  if (!mirror.readable)
    logger.warn('CronJob pods cannot read the engine mirror they mount', {
      path: ENGINE_MIRROR_PATH,
      type: mirror.type,
      effect: `every job body fails with Cannot find module '${enginePath}/bin'`,
      remedy: `label it ${ContainerStorageService.SHARED_CONTAINER_TYPE}: sudo restorecon -RF ${ENGINE_MIRROR_PATH}`,
    });

  return paths;
};

/**
 * Syncs the engine directory into the kind-worker container node.
 * Required for kind clusters where worker nodes don't share the host filesystem.
 *
 * @memberof UnderpostCron
 */
const syncEngineToKindWorker = () => {
  logger.info('Syncing engine mirror to kind-worker node', { path: ENGINE_MIRROR_PATH });
  shellExec(`docker exec -i kind-worker bash -c "rm -rf ${ENGINE_MIRROR_PATH}"`);
  shellExec(`docker cp ${ENGINE_MIRROR_PATH} kind-worker:${ENGINE_MIRROR_PATH}`);
  shellExec(
    `docker exec -i kind-worker bash -c "chown -R 1000:1000 ${ENGINE_MIRROR_PATH}; chmod -R 755 ${ENGINE_MIRROR_PATH}"`,
  );
};

/**
 * Resolves the deploy-id to use for cron job generation.
 * Uses the explicit value or the deploy ID stored in `dd.cron`.
 *
 * @param {string} [deployId] - Explicit deploy-id override
 * @memberof UnderpostCron
 * @returns {string|null} Resolved deploy-id or null if not found
 */
const resolveDeployId = (deployId) => (deployId && deployId !== 'dd' ? deployId : cronDeployIdResolve());

/**
 * Parses a comma-separated CLI list into a trimmed, non-empty array.
 *
 * @param {string|string[]} [value] - Raw CLI value
 * @memberof UnderpostCron
 * @returns {string[]} Parsed entries
 */
const parseList = (value) => {
  if (Array.isArray(value)) return value.map((entry) => `${entry}`.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

/**
 * Resolves the deploy-id list a job callback receives.
 *
 * Always a comma-separated string: every job callback splits it on `,`, and
 * `getRelatedDeployIdList` already returns that shape, so an explicit list is
 * normalized to match rather than handed over as a parsed array.
 *
 * @param {string} jobId - Job identifier, used to pick the default source file
 * @param {string|string[]} [deployList] - Explicit deploy-list CLI value
 * @memberof UnderpostCron
 * @returns {string} Comma-separated deploy IDs
 */
const resolveJobDeployList = (jobId, deployList) =>
  !deployList || deployList === 'dd' ? Underpost.cron.getRelatedDeployIdList(jobId) : parseList(deployList).join(',');

/**
 * Checks whether a node is registered on the cluster.
 *
 * @param {string} nodeName - Node name
 * @memberof UnderpostCron
 * @returns {boolean} True when the node exists
 */
const nodeExists = (nodeName) => {
  const stdout = shellExec(`kubectl get node ${nodeName} -o name`, {
    silent: true,
    stdout: true,
    silentOnError: true,
    disableLog: true,
  });
  return `${stdout || ''}`.trim().length > 0;
};

/**
 * Whether the pods can read the mirror they mount, and the type denying them when they cannot.
 *
 * The job body is the engine's own CLI, so a mount `container_t` may not read surfaces as
 * `Cannot find module '<engine>/bin'` — a Node error naming neither the mount nor the policy that
 * denied it. {@link prepareCronHostStorage} labels the mirror, so this is the post-condition on
 * that: a mirror that still denies means the labeling did not take, not that the mount is wrong.
 * Off an Enforcing host nothing denies, so nothing is claimed.
 *
 * @memberof UnderpostCron
 * @returns {{readable: boolean, type: string}} Whether a pod can read the mount, and its SELinux type.
 */
const cronCheckoutContextFactory = () => {
  const read = (command) =>
    `${shellExec(command, { stdout: true, silent: true, silentOnError: true, disableLog: true }) || ''}`.trim();

  if (read('command -v getenforce >/dev/null 2>&1 && getenforce') !== 'Enforcing') return { readable: true, type: '' };

  const type = (read(`ls -Zd ${ENGINE_MIRROR_PATH}`).split(/\s+/)[0] || '').split(':')[2] || '';
  return { readable: type === ContainerStorageService.SHARED_CONTAINER_TYPE, type };
};

/**
 * @method engineMirrorContentsFactory
 * @description Exactly what a job body resolves, as rsync filter rules over the checkout.
 *
 * An allowlist, not a denylist, for two reasons that both bite in production. The mirror carries
 * the shared container label, so every `container_t` process on the node can read it: a denylist
 * leaks whatever the repository gains next, and the thing it gains may be a key. And the mirror is
 * copied on every apply, so a denylist grows without anyone deciding to grow it.
 *
 * `engine-private` is narrowed rather than dropped — the pod cannot run without it. `app load`
 * reads `conf/<deploy-id>/.env.<env>` and that deploy's `conf.*.json`; `cron` reads
 * `deploy/dd.cron`, `deploy/dd.routes` and the env of every routed deploy. That is the whole set.
 * No key material is mirrored: the connection key arrives as a projected Secret volume.
 *
 * `node_modules` is present and `.git` is not, which is why the repository's own ignore files
 * cannot express this set: they describe what is not source, and this is what is executed.
 *
 * No `.env.*` at any environment. Each one is a deployment's entire credential set, and the
 * mirror is readable by every `container_t` process on the node; the pods receive the keys their
 * scope entitles them to as an injected environment instead. `conf.*.json` stay because they hold
 * `env:` references rather than values.
 * @returns {string[]} rsync filter rules, in precedence order.
 * @memberof UnderpostCron
 */
const engineMirrorContentsFactory = () => [
  // rsync takes the first rule that matches, so the asset trees are subtracted before `/src/**`
  // adds their parents back. They are data the CLI never opens, and the bulk of the checkout.
  '--exclude=/src/client/public/**',
  // The CLI, its modules, and the manifest that makes them resolvable. `/src` is taken whole
  // apart from those two subtrees: it is one import graph, and the entrypoint pulls from every
  // corner of it — `src/runtime/nginx` among them.
  '--include=/bin/',
  '--include=/bin/**',
  '--include=/src/',
  '--include=/src/**',
  '--include=/package.json',
  '--include=/conf.js',
  '--include=/node_modules/',
  '--include=/node_modules/**',
  // The deploy configuration the job bodies resolve, named file-shape by file-shape rather than
  // globbed: `conf/<id>` also holds per-deploy key pairs and `deploy/` holds the fleet's own, and
  // an allowlist is only worth having if it stops at the files that are actually read.
  '--include=/engine-private/',
  '--include=/engine-private/conf/',
  '--include=/engine-private/conf/*/',
  '--include=/engine-private/conf/*/conf.*.json',
  '--include=/engine-private/conf/*/package.json',
  '--include=/engine-private/deploy/',
  '--include=/engine-private/deploy/dd.cron',
  '--include=/engine-private/deploy/dd.routes',
  '--exclude=*',
];

/**
 * Refreshes the engine mirror the CronJob pods mount from the checkout this command runs in.
 *
 * `--delete` because the mirror is an output, not a second working tree: a file the checkout no
 * longer has must not survive in the tree the pods execute.
 *
 * @memberof UnderpostCron
 * @returns {{source: string, target: string}} What was mirrored, and where.
 */
const syncEngineMirror = () => {
  const source = process.cwd();
  const filters = engineMirrorContentsFactory().map(shellArgumentFactory).join(' ');

  logger.info('Refreshing the engine mirror the CronJob pods mount', { source, target: ENGINE_MIRROR_PATH });
  shellExec(
    `sudo rsync -a --delete ${filters} ${shellArgumentFactory(`${source}/`)} ${shellArgumentFactory(`${ENGINE_MIRROR_PATH}/`)}`,
  );
  return { source, target: ENGINE_MIRROR_PATH };
};

/**
 * Resolves the node a generated CronJob's pods are pinned to.
 *
 * Placement is not optional for these manifests. The job body runs the engine checkout they
 * hostPath-mount, and a hostPath is node-local: an unpinned pod is free to land on a node whose
 * `/home/dd/engine` is some other directory of that name, where the body dies on
 * `Cannot find module '/home/dd/engine/bin'` before it can report anything of its own. The node
 * generating the manifest is the one holding the checkout it mounts, so it is the default —
 * claimed only when the cluster actually knows it under that name, so a workstation that is not
 * a node keeps producing the portable manifest it produced before.
 *
 * @param {string} [nodeName] - Explicit `--node-name`, which always wins.
 * @memberof UnderpostCron
 * @returns {string} Node to pin to, or `''` to leave the pods unpinned.
 */
const cronNodeNameFactory = (nodeName) => {
  const requested = `${nodeName || ''}`.trim();
  if (requested) return requested;

  const local = os.hostname();
  if (!local || !nodeExists(local)) return '';
  logger.info('Pinning CronJob pods to the node holding the mounted checkout', { nodeName: local });
  return local;
};

/**
 * Resolves the cluster context a manifest run applies under.
 *
 * The context is not decoration: it selects how the image reaches the cluster and is rendered
 * into the pod's own command, so a run that names none published a CronJob whose body addressed
 * no cluster at all. A node can be asked which runtime it belongs to, so an unnamed context is
 * read from the cluster rather than left blank.
 *
 * @param {object} [options] - CLI options carrying `k3s`, `kind` or `kubeadm`.
 * @memberof UnderpostCron
 * @returns {{k3s: boolean, kind: boolean, kubeadm: boolean}} Mutually exclusive context flags.
 */
const cronClusterContextFactory = (options = {}) => {
  if (options.k3s || options.kind || options.kubeadm)
    return { k3s: !!options.k3s, kind: !!options.kind, kubeadm: !!options.kubeadm };

  const { type } = Underpost.cluster.detectClusterRuntime();
  if (type) logger.info('Resolved the cluster context from the cluster itself', { clusterType: type });
  return { k3s: type === 'k3s', kind: type === 'kind', kubeadm: type === 'kubeadm' };
};

/**
 * Checks whether a CronJob is already published on the cluster.
 *
 * @param {string} cronJobName - Sanitized CronJob name
 * @param {string} namespace - Kubernetes namespace
 * @memberof UnderpostCron
 * @returns {boolean} True when the CronJob exists
 */
const cronJobExists = (cronJobName, namespace) => {
  const stdout = shellExec(`kubectl get cronjob ${cronJobName} -n ${namespace} --ignore-not-found -o name`, {
    silent: true,
    stdout: true,
    silentOnError: true,
    disableLog: true,
  });
  return `${stdout || ''}`.trim().length > 0;
};

/**
 * UnderpostCron main module methods
 * @class UnderpostCron
 * @memberof UnderpostCron
 */
class UnderpostCron {
  /** @returns {Object} Available cron job handlers */
  static get JOB() {
    return {
      dns: Underpost.dns,
      backup: Underpost.backup,
      vultr: Underpost.vultr,
    };
  }

  static API = {
    /**
     * CLI entry point for the `underpost cron` command.
     *
     * Manifest modes (`--setup-start`, `--generate-k8s-cronjobs`, `--apply`, `--create-job-now`)
     * never run job callbacks in this process: they write and publish manifests, and hand the
     * work to the cluster. All of them are scoped to `job-list` when given.
     *
     * @param {string} deployList - Comma-separated deploy IDs; in manifest modes its first entry is the manifest owner deploy-id
     * @param {string} jobList - Comma-separated job IDs; in manifest modes it restricts which conf.cron.json jobs are generated
     * @param {Object} options - CLI flags
     * @param {boolean} [options.generateK8sCronjobs] - Generate K8s CronJob YAML manifests
     * @param {boolean} [options.apply] - Apply manifests to the cluster
     * @param {boolean} [options.git] - Pass --git to job execution
     * @param {boolean} [options.dev] - Use local ./ base path instead of global underpost installation
     * @param {string}  [options.cmd] - Optional pre-script commands to run before cron execution
     * @param {string}  [options.namespace] - Kubernetes namespace
     * @param {string}  [options.image] - Custom container image
     * @param {boolean} [options.setupStart] - Update the deploy-id package.json start script and generate+apply its cron jobs
     * @param {boolean} [options.k3s] - Use k3s cluster context (apply directly on host)
     * @param {boolean} [options.kind] - Use kind cluster context (apply via kind-worker container)
     * @param {boolean} [options.kubeadm] - Use kubeadm cluster context (apply directly on host)
     * @param {boolean} [options.dryRun] - Preview cron jobs without executing them
     * @param {boolean} [options.createJobNow] - After applying, immediately create a Job from each CronJob (requires --apply)
     * @param {string}  [options.nodeName] - Pin generated CronJob pods to this node (manifest modes only)
     * @memberof UnderpostCron
     */
    callback: async function (deployList, jobList, options = {}) {
      loadCronDeployEnv();

      const jobFilter = parseList(jobList);

      if (options.setupStart) return await Underpost.cron.setupDeployStart(deployList, { ...options, jobFilter });

      if (options.generateK8sCronjobs || options.apply || options.createJobNow)
        return await Underpost.cron.generateK8sCronJobs({
          ...options,
          deployId: deployList,
          jobFilter,
        });

      if (options.nodeName)
        logger.warn(`--node-name is a manifest placement flag and has no effect on direct execution`, {
          nodeName: options.nodeName,
        });

      for (const jobId of jobFilter) {
        const resolvedDeployIdList = resolveJobDeployList(jobId, deployList);

        if (Underpost.cron.JOB[jobId]) {
          if (options.dryRun) {
            logger.info(`[dry-run] Would execute cron job`, { jobId, deployList: resolvedDeployIdList, options });
          } else {
            logger.info(`Executing cron job`, { jobId, deployList: resolvedDeployIdList, options });
            await Underpost.cron.JOB[jobId].callback(resolvedDeployIdList, options);
          }
        } else {
          logger.warn(`Unknown cron job: ${jobId}`);
        }
      }
    },

    /**
     * Update the package.json start script for the given deploy-id and generate+apply its K8s CronJob manifests.
     *
     * @param {string} [deployList] - Comma-separated deploy IDs; its first entry is the deploy-id whose package.json is updated. Falls back to the dd.cron file
     * @param {Object} [options] - Additional options forwarded to generateK8sCronJobs
     * @param {string[]} [options.jobFilter] - Restrict the setup to these job IDs
     * @param {boolean} [options.createJobNow] - After applying, immediately create a Job from each CronJob
     * @param {boolean} [options.dryRun] - Pass --dry-run=client to kubectl commands
     * @param {boolean} [options.apply] - Whether to apply generated manifests to the cluster
     * @param {boolean} [options.git] - Pass --git flag to cron CLI commands
     * @param {boolean} [options.dev] - Use local ./ base path instead of global underpost installation
     * @param {string}  [options.cmd] - Optional pre-script commands to run before cron execution
     * @param {string}  [options.nodeName] - Pin every generated CronJob's pod to this node
     * @param {string}  [options.namespace] - Kubernetes namespace for the CronJobs
     * @param {string}  [options.image] - Custom container image override for the CronJobs
     * @param {boolean} [options.k3s] - k3s cluster context (apply directly on host)
     * @param {boolean} [options.kind] - kind cluster context (apply via kind-worker container)
     * @param {boolean} [options.kubeadm] - kubeadm cluster context (apply directly on host)
     * @memberof UnderpostCron
     */
    setupDeployStart: async function (deployList, options = {}) {
      // Validated up front: an invalid node name must not leave a rewritten package.json behind.
      const nodeName = options.nodeName;
      const requestedDeployId = deployList;
      const deployId = resolveDeployId(requestedDeployId);
      if (!deployId) {
        logger.warn(
          'Could not resolve deploy-id. Provide it as the deploy-list argument or create engine-private/deploy/dd.cron',
        );
        return;
      }
      if (!requestedDeployId) logger.info(`Resolved cron deploy-id from dd.cron`, { deployId });
      const confDir = `./engine-private/conf/${deployId}`;
      const packageJsonPath = `${confDir}/package.json`;
      const confCronPath = `${confDir}/conf.cron.json`;

      if (!fs.existsSync(confCronPath)) {
        logger.warn(`conf.cron.json not found for deploy-id: ${deployId}`, { path: confCronPath });
        return;
      }

      const confCron = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

      if (!confCron.jobs || Object.keys(confCron.jobs).length === 0) {
        logger.warn(`No cron jobs configured for deploy-id: ${deployId}`);
        return;
      }

      const jobFilter = parseList(options.jobFilter);
      const enabledJobs = Object.keys(confCron.jobs).filter(
        (job) => confCron.jobs[job].enabled !== false && (jobFilter.length === 0 || jobFilter.includes(job)),
      );
      if (enabledJobs.length === 0) {
        logger.warn(
          `No enabled cron jobs for deploy-id: ${deployId}`,
          jobFilter.length > 0 ? { jobFilter } : undefined,
        );
        return;
      }

      // Start script only references manifests generateK8sCronJobs actually writes
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        let startCommand = 'echo "Starting cron jobs..."';
        for (const job of enabledJobs)
          startCommand += ` && kubectl apply -f ./manifests/cronjobs/${deployId}/${deployId}-${job}.yaml`;
        if (!packageJson.scripts) packageJson.scripts = {};
        packageJson.scripts.start = startCommand;

        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + '\n', 'utf8');
        logger.info(`Updated package.json start script for ${deployId}`, { path: packageJsonPath });
      } else {
        logger.warn(`package.json not found for deploy-id: ${deployId}`, { path: packageJsonPath });
      }

      await Underpost.cron.generateK8sCronJobs({
        deployId,
        jobFilter,
        nodeName,
        namespace: options.namespace,
        image: options.image,
        apply: options.apply,
        createJobNow: options.createJobNow,
        git: !!options.git,
        dev: !!options.dev,
        kubeadm: !!options.kubeadm,
        cmd: options.cmd,
        k3s: !!options.k3s,
        kind: !!options.kind,
        dryRun: !!options.dryRun,
      });
    },

    /**
     * Generate Kubernetes CronJob YAML manifests from conf.cron.json configuration.
     * Each enabled job produces one CronJob YAML file under manifests/cronjobs/<deployId>/.
     * With --apply the manifests are also applied to the cluster via kubectl.
     *
     * @param {Object} options
     * @param {string}  [options.deployId] - Explicit deploy-id (overrides dd.cron file lookup)
     * @param {string|string[]} [options.jobFilter] - Restrict generation/apply to these job IDs (empty means all)
     * @param {boolean} [options.git=false] - Pass --git flag to cron CLI commands
     * @param {boolean} [options.dev=false] - Use local ./ base path instead of global underpost
     * @param {string}  [options.cmd] - Optional pre-script commands
     * @param {boolean} [options.apply=false] - kubectl apply generated manifests
     * @param {string}  [options.namespace='default'] - Target Kubernetes namespace
     * @param {string}  [options.image] - Custom container image override
     * @param {boolean} [options.k3s] - k3s cluster context (apply directly on host); read from the cluster when no context is named
     * @param {boolean} [options.kind] - kind cluster context (apply via kind-worker container); read from the cluster when no context is named
     * @param {boolean} [options.kubeadm] - kubeadm cluster context (apply directly on host); read from the cluster when no context is named
     * @param {boolean} [options.createJobNow=false] - After applying, create a Job from each CronJob immediately
     * @param {boolean} [options.dryRun=false] - Pass --dry-run=client to kubectl commands
     * @param {string}  [options.nodeName] - Pin every generated CronJob's pod to this node; defaults to this node
     *   when the cluster knows it, because the pods mount its checkout
     * @memberof UnderpostCron
     */
    generateK8sCronJobs: async function (options = {}) {
      const namespace = options.namespace || 'default';
      const jobDeployId = resolveDeployId(options.deployId);

      if (!jobDeployId) {
        logger.warn(
          'Could not resolve deploy-id. Provide it as the deploy-list argument or create engine-private/deploy/dd.cron',
        );
        return;
      }

      const confCronPath = `./engine-private/conf/${jobDeployId}/conf.cron.json`;

      if (!fs.existsSync(confCronPath)) {
        logger.warn(`Cron configuration not found: ${confCronPath}`);
        return;
      }

      const confCronConfig = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

      if (!confCronConfig.jobs || Object.keys(confCronConfig.jobs).length === 0) {
        logger.info('No cron jobs configured');
        return;
      }

      const jobFilter = parseList(options.jobFilter);
      const targetJobs = Object.keys(confCronConfig.jobs).filter(
        (job) => jobFilter.length === 0 || jobFilter.includes(job),
      );

      if (targetJobs.length === 0) {
        logger.warn(`No cron jobs matched the requested job list`, {
          deployId: jobDeployId,
          jobFilter,
          available: Object.keys(confCronConfig.jobs),
        });
        return;
      }

      // Placement and cluster context are read from the cluster this run publishes to, so a run
      // that only writes manifests stays offline and portable — the same reason `--apply` is what
      // makes a manifest node-specific: it is the run that knows which node's checkout the pods
      // will mount.
      const nodeName = options.apply === true ? cronNodeNameFactory(options.nodeName) : options.nodeName || '';
      const cluster =
        options.apply === true
          ? cronClusterContextFactory(options)
          : { k3s: !!options.k3s, kind: !!options.kind, kubeadm: !!options.kubeadm };

      const outputDir = `./manifests/cronjobs/${jobDeployId}`;
      fs.mkdirSync(outputDir, { recursive: true });

      const generatedFiles = [];

      for (const job of targetJobs) {
        const jobConfig = confCronConfig.jobs[job];

        if (jobConfig.enabled === false) {
          // The manifest is an output, not a source: leaving the previous one on disk keeps a
          // stale spec around that a later `kubectl apply -f` would happily deploy — which is how
          // a mount or image this generator has since dropped comes back.
          const disabledPath = `${outputDir}/${jobDeployId}-${job}.yaml`;
          if (fs.existsSync(disabledPath)) {
            fs.removeSync(disabledPath);
            logger.info(`Removed manifest for disabled job: ${disabledPath}`);
          }
          logger.info(`Skipping disabled job: ${job}`);
          continue;
        }

        const deployIdList = Underpost.cron.getRelatedDeployIdList(job);
        const expression = jobConfig.expression || '0 0 * * *';
        const cronJobName = `${jobDeployId}-${job}`;

        const yamlContent = cronJobYamlFactory({
          name: cronJobName,
          expression,
          deployList: deployIdList,
          jobList: job,
          image: options.image,
          namespace,
          git: !!options.git,
          dev: !!options.dev,
          cmd: options.cmd,
          suspend: false,
          dryRun: !!options.dryRun,
          ...cluster,
          nodeName,
        });

        const yamlFilePath = `${outputDir}/${cronJobName}.yaml`;
        fs.writeFileSync(yamlFilePath, yamlContent, 'utf8');
        generatedFiles.push(yamlFilePath);

        logger.info(`Generated CronJob manifest: ${yamlFilePath}`, {
          job,
          expression,
          namespace,
          ...(nodeName ? { nodeName } : {}),
        });
      }

      if (options.apply) {
        // Publishing is the privileged half: it stages credentials on the node and writes cluster
        // resources. Generating manifests is neither, which is why the gate is here and not around
        // the whole command — a workstation or CI runner has no node role and keeps working.
        const role = Underpost.wireguard.localRole();
        if (role) assertRoleCapability({ role, capability: 'cron-publication', operation: 'cron --apply' });

        // A nodeSelector naming a node that is not registered leaves every Job Pending at its
        // next fire, silently. Warn rather than throw: the node may join before the schedule.
        if (nodeName && !nodeExists(nodeName))
          logger.warn(`Target node not found on the cluster; pods will stay Pending until it joins`, { nodeName });

        // The node directory the pods write metrics into, labeled for container access.
        prepareCronHostStorage();

        // The credentials the job bodies read from the environment. Optional by design: the
        // `envFrom` reference is `optional: true`, so a cluster with neither seed files nor the
        // values in its environment still schedules — the jobs that need a GitHub token simply
        // report their own failure instead of the pod refusing to start.
        for (const name of [cronEnvSecretName, cronSshSecretName])
          if (!Underpost.secret.applyIfPresent(name, namespace)) Underpost.secret.applyFromOriginSeed(name, namespace);

        // Delete existing CronJobs before applying new ones
        for (const job of targetJobs) {
          const cronJobName = `${jobDeployId}-${job}`;
          shellExec(`kubectl delete cronjob ${cronJobName} --namespace=${namespace} --ignore-not-found`);
        }

        // Ensure default dockerhub image is loaded on the cluster when no custom image is provided
        if (!options.image) {
          logger.info('Ensuring default image is loaded on cluster');
          Underpost.image.pullDockerHubImage({
            dockerhubImage: 'underpost',
            ...cluster,
            dev: !!options.dev,
          });
        }

        // Sync engine volume to kind-worker node if using kind cluster
        if (cluster.kind) {
          syncEngineToKindWorker();
        }

        for (const yamlFile of generatedFiles) {
          logger.info(`Applying: ${yamlFile}`);
          shellExec(`kubectl apply -f ${yamlFile}`);
        }
        logger.info('All CronJob manifests applied');
      } else {
        logger.info(`Manifests generated in ${outputDir}. Use --apply to deploy to the cluster.`);
      }
      // Create an immediate Job from each CronJob if requested. Runs after --apply so the
      // Job is always cloned from the manifest this invocation just published.
      if (options.createJobNow) {
        for (const job of targetJobs) {
          const jobConfig = confCronConfig.jobs[job];
          if (jobConfig.enabled === false) continue;

          const cronJobName = `${jobDeployId}-${job}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/--+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 52);

          if (!cronJobExists(cronJobName, namespace)) {
            logger.warn(`CronJob not found on the cluster, skipping immediate Job`, {
              cronJobName,
              namespace,
              hint: 'add --apply to publish the manifest first',
            });
            continue;
          }

          const immediateJobName = `${cronJobName}-now-${Date.now()}`.substring(0, 63);
          logger.info(`Creating immediate Job from CronJob: ${cronJobName}`, { jobName: immediateJobName });
          shellExec(`kubectl create job ${immediateJobName} --from=cronjob/${cronJobName} -n ${namespace}`);
        }
        logger.info('All immediate Jobs created');
      }
    },

    /**
     * Resolve the deploy-id list associated with a given job.
     * Backup jobs read from dd.routes (multiple deploy-ids); others from dd.cron.
     *
     * @param {string} jobId - Job identifier (e.g., 'dns', 'backup')
     * @returns {string} Comma-separated deploy IDs
     * @memberof UnderpostCron
     */
    getRelatedDeployIdList(jobId) {
      if (jobId === 'backup') {
        const routes = readDeployRoutes();
        if (routes.length > 0) return routes.join(',');
        logger.warn(`Deploy route table not found: ${DEPLOY_ROUTES_PATH}, falling back to the cron deploy-id`);
      }

      const cronDeployId = cronDeployIdResolve();
      if (!cronDeployId) logger.warn(`Cron deploy-id not resolved, using default`, { jobId, default: DEFAULT_CRON_ID });
      return cronDeployId || DEFAULT_CRON_ID;
    },

    /**
     * Get the available cron job handlers.
     * Each handler should have a callback function that executes the job logic.
     * @memberof UnderpostCron
     * @returns {Object} Available cron job handlers
     */
    get JOB() {
      return UnderpostCron.JOB;
    },

    /**
     * Get the list of available job IDs.
     * This is derived from the keys of the JOB object.
     * @memberof UnderpostCron
     * @returns {string[]} List of available job IDs
     */
    getJobsIDs() {
      return Object.keys(UnderpostCron.JOB);
    },
  };
}

export default UnderpostCron;

export {
  cronCheckoutContextFactory,
  cronDeployIdResolve,
  cronJobYamlFactory,
  engineMirrorContentsFactory,
  loadCronDeployEnv,
  parseList,
  resolveDeployId,
  resolveJobDeployList,
};
