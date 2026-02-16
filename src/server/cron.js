/**
 * UnderpostCron server module
 * @module src/server/cron.js
 * @namespace UnderpostCron
 */

import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';
import fs from 'fs-extra';
import Underpost from '../index.js';
import { getUnderpostRootPath } from './conf.js';

const logger = loggerFactory(import.meta);

const volumeHostPath = '/home/dd';
const enginePath = '/home/dd/engine';
const cronVolumeName = 'underpost-cron-container-volume';
const shareEnvVolumeName = 'underpost-share-env';
const underpostContainerEnvPath = '/usr/lib/node_modules/underpost/.env';

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
}) => {
  const containerImage = image || `underpost/underpost-engine:${Underpost.version}`;

  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 52);

  const cmdPart = cmd ? `${cmd} && ` : '';
  const cronBin = dev ? 'node bin' : 'underpost';
  const flags = `${git ? '--git ' : ''}${dev ? '--dev ' : ''}${dryRun ? '--dry-run ' : ''}`;
  const cronCommand = `${cmdPart}${cronBin} cron ${flags}${deployList} ${jobList}`;

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
    spec:
      template:
        metadata:
          labels:
            app: ${sanitizedName}
            managed-by: underpost
        spec:
          containers:
            - name: ${sanitizedName}
              image: ${containerImage}
              command:
                - /bin/sh
                - -c
                - >
                  ${cronCommand}
              volumeMounts:
                - mountPath: ${enginePath}
                  name: ${cronVolumeName}
                - mountPath: ${underpostContainerEnvPath}
                  name: ${shareEnvVolumeName}
                  subPath: .env
          volumes:
            - hostPath:
                path: ${enginePath}
                type: Directory
              name: ${cronVolumeName}
            - hostPath:
                path: ${getUnderpostRootPath()}/.env
                type: FileOrCreate
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
 * When deployId is provided directly, uses it. Otherwise reads from dd.cron file.
 *
 * @param {string} [deployId] - Explicit deploy-id override
 * @memberof UnderpostCron
 * @returns {string|null} Resolved deploy-id or null if not found
 */
const resolveDeployId = (deployId) => {
  if (deployId) return deployId;

  const cronDeployFilePath = './engine-private/deploy/dd.cron';
  if (!fs.existsSync(cronDeployFilePath)) {
    return null;
  }
  return fs.readFileSync(cronDeployFilePath, 'utf8').trim();
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
    };
  }

  static API = {
    /**
     * CLI entry point for the `underpost cron` command.
     *
     * @param {string} deployList - Comma-separated deploy IDs
     * @param {string} jobList - Comma-separated job IDs
     * @param {Object} options - CLI flags
     * @param {boolean} [options.generateK8sCronjobs] - Generate K8s CronJob YAML manifests
     * @param {boolean} [options.apply] - Apply manifests to the cluster
     * @param {boolean} [options.git] - Pass --git to job execution
     * @param {boolean} [options.dev] - Use local ./ base path instead of global underpost installation
     * @param {string}  [options.cmd] - Optional pre-script commands to run before cron execution
     * @param {string}  [options.namespace] - Kubernetes namespace
     * @param {string}  [options.image] - Custom container image
     * @param {string}  [options.setupStart] - Deploy-id to setup: updates its package.json start and generates+applies cron jobs
     * @param {boolean} [options.k3s] - Use k3s cluster context (apply directly on host)
     * @param {boolean} [options.kind] - Use kind cluster context (apply via kind-worker container)
     * @param {boolean} [options.kubeadm] - Use kubeadm cluster context (apply directly on host)
     * @param {boolean} [options.dryRun] - Preview cron jobs without executing them
     * @param {boolean} [options.createJobNow] - After applying, immediately create a Job from each CronJob (requires --apply)
     * @memberof UnderpostCron
     */
    callback: async function (
      deployList = 'default',
      jobList = Object.keys(Underpost.cron.JOB).join(','),
      options = {},
    ) {
      if (options.setupStart) {
        await Underpost.cron.setupDeployStart(options.setupStart, options);
        return;
      }

      if (options.generateK8sCronjobs) {
        await Underpost.cron.generateK8sCronJobs(options);
        return;
      }

      for (const _jobId of jobList.split(',')) {
        const jobId = _jobId.trim();
        if (Underpost.cron.JOB[jobId]) {
          if (options.dryRun) {
            logger.info(`[dry-run] Would execute cron job`, { jobId, deployList, options });
          } else {
            logger.info(`Executing cron job`, { jobId, deployList, options });
            await Underpost.cron.JOB[jobId].callback(deployList, options);
          }
        } else {
          logger.warn(`Unknown cron job: ${jobId}`);
        }
      }
    },

    /**
     * Update the package.json start script for the given deploy-id and generate+apply its K8s CronJob manifests.
     *
     * @param {string} deployId - The deploy-id whose package.json will be updated
     * @param {Object} [options] - Additional options forwarded to generateK8sCronJobs
     * @param {boolean} [options.createJobNow] - After applying, immediately create a Job from each CronJob
     * @param {boolean} [options.dryRun] - Pass --dry-run=client to kubectl commands
     * @param {boolean} [options.apply] - Whether to apply generated manifests to the cluster
     * @param {boolean} [options.git] - Pass --git flag to cron CLI commands
     * @param {boolean} [options.dev] - Use local ./ base path instead of global underpost installation
     * @param {string}  [options.cmd] - Optional pre-script commands to run before cron execution
     * @param {string}  [options.namespace] - Kubernetes namespace for the CronJobs
     * @param {string}  [options.image] - Custom container image override for the CronJobs
     * @param {boolean} [options.k3s] - k3s cluster context (apply directly on host)
     * @param {boolean} [options.kind] - kind cluster context (apply via kind-worker container)
     * @param {boolean} [options.kubeadm] - kubeadm cluster context (apply directly on host)
     * @memberof UnderpostCron
     */
    setupDeployStart: async function (deployId, options = {}) {
      if (!deployId || deployId === true) deployId = resolveDeployId();
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

      const hasEnabledJobs = Object.values(confCron.jobs).some((job) => job.enabled !== false);
      if (!hasEnabledJobs) {
        logger.warn(`No enabled cron jobs for deploy-id: ${deployId}`);
        return;
      }

      // Update package.json start script
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        let startCommand = 'echo "Starting cron jobs..."';
        for (const job of Object.keys(confCron.jobs))
          startCommand += ` && kubectl apply -f ./manifests/cronjobs/${deployId}/${deployId}-${job}.yaml`;
        if (!packageJson.scripts) packageJson.scripts = {};
        packageJson.scripts.start = startCommand;

        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + '\n', 'utf8');
        logger.info(`Updated package.json start script for ${deployId}`, { path: packageJsonPath });
      } else {
        logger.warn(`package.json not found for deploy-id: ${deployId}`, { path: packageJsonPath });
      }

      // Generate and apply cron job manifests for this deploy-id
      await Underpost.cron.generateK8sCronJobs({
        deployId,
        apply: options.apply,
        git: !!options.git,
        dev: !!options.dev,
        cmd: options.cmd,
        namespace: options.namespace,
        image: options.image,
        k3s: !!options.k3s,
        kind: !!options.kind,
        kubeadm: !!options.kubeadm,
        createJobNow: !!options.createJobNow,
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
     * @memberof UnderpostCron
     */
    generateK8sCronJobs: async function (options = {}) {
      const namespace = options.namespace || 'default';
      const jobDeployId = resolveDeployId(options.deployId);

      if (!jobDeployId) {
        logger.warn(
          'Could not resolve deploy-id. Provide --setup-start <deploy-id> or create engine-private/deploy/dd.cron',
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

      const outputDir = `./manifests/cronjobs/${jobDeployId}`;
      fs.mkdirSync(outputDir, { recursive: true });

      const generatedFiles = [];

      for (const job of Object.keys(confCronConfig.jobs)) {
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
        });

        const yamlFilePath = `${outputDir}/${cronJobName}.yaml`;
        fs.writeFileSync(yamlFilePath, yamlContent, 'utf8');
        generatedFiles.push(yamlFilePath);

        logger.info(`Generated CronJob manifest: ${yamlFilePath}`, { job, expression, namespace });
      }

      if (options.apply) {
        // Delete existing CronJobs before applying new ones
        for (const job of Object.keys(confCronConfig.jobs)) {
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

        // Create an immediate Job from each CronJob if requested
        if (options.createJobNow) {
          for (const job of Object.keys(confCronConfig.jobs)) {
            const jobConfig = confCronConfig.jobs[job];
            if (jobConfig.enabled === false) continue;

            const cronJobName = `${jobDeployId}-${job}`
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/--+/g, '-')
              .replace(/^-|-$/g, '')
              .substring(0, 52);

            const immediateJobName = `${cronJobName}-now-${Date.now()}`.substring(0, 63);
            logger.info(`Creating immediate Job from CronJob: ${cronJobName}`, { jobName: immediateJobName });
            shellExec(`kubectl create job ${immediateJobName} --from=cronjob/${cronJobName} -n ${namespace}`);
          }
          logger.info('All immediate Jobs created');
        }
      } else {
        logger.info(`Manifests generated in ${outputDir}. Use --apply to deploy to the cluster.`);
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
      const deployFilePath =
        jobId === 'backup' ? './engine-private/deploy/dd.router' : './engine-private/deploy/dd.cron';

      if (!fs.existsSync(deployFilePath)) {
        logger.warn(`Deploy file not found: ${deployFilePath}, using default`);
        return fs.existsSync('./engine-private/deploy/dd.cron')
          ? fs.readFileSync('./engine-private/deploy/dd.cron', 'utf8').trim()
          : 'dd-cron';
      }

      return fs.readFileSync(deployFilePath, 'utf8').trim();
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

export { cronJobYamlFactory, resolveDeployId };
