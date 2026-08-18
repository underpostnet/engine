/**
 * UnderpostCron server module
 * @module src/server/cron.js
 * @namespace UnderpostCron
 */

import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import Underpost from '../index.js';
import { getUnderpostRootPath } from './environment.js';

const logger = loggerFactory(import.meta);

const volumeHostPath = '/home/dd';
const enginePath = '/home/dd/engine';
const cronVolumeName = 'underpost-cron-container-volume';
const shareEnvVolumeName = 'underpost-share-env';
const underpostContainerEnvDir = '/usr/lib/node_modules/underpost';
const DEFAULT_CRON_ID = 'dd-cron';

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

  const routerPath = './engine-private/deploy/dd.router';
  if (!fs.existsSync(routerPath)) return;
  for (const deployId of fs.readFileSync(routerPath, 'utf8').trim().split(',')) {
    const id = deployId.trim();
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

  const cronBin = 'node bin'; // dev ? 'node bin' : 'underpost';
  const flags = `${git ? '--git ' : ''}${dev ? '--dev ' : ''}${dryRun ? '--dry-run ' : ''}${k3s ? '--k3s ' : ''}${kind ? '--kind ' : ''}${kubeadm ? '--kubeadm ' : ''}`;
  const commands = [`cd ${enginePath}`, `node bin env ${cronDeployId} ${dev ? `development` : `production`}`]; // `node bin run secret`
  if (cmd) commands.push(cmd);
  commands.push(`${cronBin} cron ${deployList} ${jobList} ${flags}`);
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
              volumeMounts:
                - mountPath: ${enginePath}
                  name: ${cronVolumeName}
                - mountPath: ${underpostContainerEnvDir}
                  name: ${shareEnvVolumeName}
          volumes:
            - hostPath:
                path: ${enginePath}
                type: Directory
              name: ${cronVolumeName}
            - hostPath:
                path: ${getUnderpostRootPath()}
                type: DirectoryOrCreate
              name: ${shareEnvVolumeName}
          restartPolicy: OnFailure
`;
};

/**
 * Syncs the engine directory into the kind-worker container node.
 * Required for kind clusters where worker nodes don't share the host filesystem.
 *
 * @memberof UnderpostCron
 */
const syncEngineToKindWorker = () => {
  logger.info('Syncing engine volume to kind-worker node');
  shellExec(`docker exec -i kind-worker bash -c "rm -rf ${volumeHostPath}"`);
  shellExec(`docker exec -i kind-worker bash -c "mkdir -p ${volumeHostPath}"`);
  shellExec(`docker cp ${volumeHostPath}/engine kind-worker:${volumeHostPath}/engine`);
  shellExec(
    `docker exec -i kind-worker bash -c "chown -R 1000:1000 ${volumeHostPath}; chmod -R 755 ${volumeHostPath}"`,
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
const resolveDeployId = (deployId) => deployId || cronDeployIdResolve();

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
 * Normalizes and validates a `--node-name` value before it reaches a manifest or a shell.
 *
 * @param {string} [nodeName] - Raw CLI value
 * @memberof UnderpostCron
 * @returns {string} Trimmed node name, or '' when unset
 * @throws {Error} When the value is not a valid Kubernetes node name
 */
const resolveNodeName = (nodeName) => {
  const node = `${nodeName || ''}`.trim();
  if (node && !/^[a-zA-Z0-9._-]+$/.test(node)) throw new Error(`Invalid Kubernetes node name: ${node}`);
  return node;
};

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
 * Resolves the manifest owner deploy-id from the `deploy-list` positional argument.
 * The `default` sentinel means "not provided", deferring to the dd.cron file.
 *
 * @param {string} [deployList] - Comma-separated deploy IDs from the CLI
 * @memberof UnderpostCron
 * @returns {string|undefined} Owner deploy-id, or undefined when unspecified
 */
const deployIdFromList = (deployList) => {
  const [deployId] = parseList(deployList);
  return !deployId || deployId === 'default' ? undefined : deployId;
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
          deployId: deployIdFromList(deployList),
          jobFilter,
        });

      const resolvedDeployList = deployList || 'default';
      const resolvedJobList = jobFilter.length > 0 ? jobFilter : Object.keys(Underpost.cron.JOB);

      if (options.nodeName)
        logger.warn(`--node-name is a manifest placement flag and has no effect on direct execution`, {
          nodeName: options.nodeName,
        });

      for (const jobId of resolvedJobList) {
        if (Underpost.cron.JOB[jobId]) {
          if (options.dryRun) {
            logger.info(`[dry-run] Would execute cron job`, { jobId, deployList: resolvedDeployList, options });
          } else {
            logger.info(`Executing cron job`, { jobId, deployList: resolvedDeployList, options });
            await Underpost.cron.JOB[jobId].callback(resolvedDeployList, options);
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
      const nodeName = resolveNodeName(options.nodeName);
      const requestedDeployId = deployIdFromList(deployList);
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
     * @param {boolean} [options.k3s=false] - k3s cluster context (apply directly on host)
     * @param {boolean} [options.kind=false] - kind cluster context (apply via kind-worker container)
     * @param {boolean} [options.kubeadm=false] - kubeadm cluster context (apply directly on host)
     * @param {boolean} [options.createJobNow=false] - After applying, create a Job from each CronJob immediately
     * @param {boolean} [options.dryRun=false] - Pass --dry-run=client to kubectl commands
     * @param {string}  [options.nodeName] - Pin every generated CronJob's pod to this node
     * @memberof UnderpostCron
     */
    generateK8sCronJobs: async function (options = {}) {
      const namespace = options.namespace || 'default';
      const nodeName = resolveNodeName(options.nodeName);
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

      const outputDir = `./manifests/cronjobs/${jobDeployId}`;
      fs.mkdirSync(outputDir, { recursive: true });

      const generatedFiles = [];

      for (const job of targetJobs) {
        const jobConfig = confCronConfig.jobs[job];

        if (jobConfig.enabled === false) {
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
          k3s: !!options.k3s,
          kind: !!options.kind,
          kubeadm: !!options.kubeadm,
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
        // A nodeSelector naming a node that is not registered leaves every Job Pending at its
        // next fire, silently. Warn rather than throw: the node may join before the schedule.
        if (nodeName && !nodeExists(nodeName))
          logger.warn(`Target node not found on the cluster; pods will stay Pending until it joins`, { nodeName });

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
            kind: !!options.kind,
            k3s: !!options.k3s,
            kubeadm: !!options.kubeadm,
            dev: !!options.dev,
          });
        }

        // Sync engine volume to kind-worker node if using kind cluster
        if (options.kind) {
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
     * Backup jobs read from dd.router (multiple deploy-ids); others from dd.cron.
     *
     * @param {string} jobId - Job identifier (e.g., 'dns', 'backup')
     * @returns {string} Comma-separated deploy IDs
     * @memberof UnderpostCron
     */
    getRelatedDeployIdList(jobId) {
      if (jobId === 'backup') {
        const routerFilePath = './engine-private/deploy/dd.router';
        if (fs.existsSync(routerFilePath)) return fs.readFileSync(routerFilePath, 'utf8').trim();
        logger.warn(`Deploy file not found: ${routerFilePath}, falling back to the cron deploy-id`);
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

export { cronDeployIdResolve, cronJobYamlFactory, loadCronDeployEnv, resolveDeployId };
