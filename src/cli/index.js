import dotenv from 'dotenv';
import { Command } from 'commander';
import Underpost, { UnderpostRootEnv } from '../index.js';
import { getNpmRootPath, getUnderpostRootPath, loadConf } from '../server/conf.js';
import fs from 'fs-extra';
import { commitData } from '../client/components/core/CommonJs.js';
import UnderpostLxd from './lxd.js';
import UnderpostBaremetal from './baremetal.js';
import UnderpostRun from './run.js';

// Load environment variables from .env file
const underpostRootPath = getUnderpostRootPath();
fs.existsSync(`${underpostRootPath}/.env`)
  ? dotenv.config({ path: `${underpostRootPath}/.env`, override: true })
  : dotenv.config();

const program = new Command();

// Set up the main program information
program.name('underpost').description(`underpost ci/cd cli ${Underpost.version}`).version(Underpost.version);

// 'new' command: Create a new project
program
  .command('new')
  .argument('<app-name>', 'The name or deploy-id of the application to create.')
  .option('--deploy-id', 'Crete deploy ID conf env files')
  .option('--cluster', 'Create deploy ID cluster files and sync to current cluster')
  .option('--dev', 'Sets the development cli context')
  .option('--sub-conf <sub-conf>', 'Create sub conf env files')
  .description('Initializes a new Underpost project, service, or configuration.')
  .action(Underpost.repo.new);

// 'start' command: Start application servers, build pipelines, or services
program
  .command('start')
  .argument('<deploy-id>', 'The unique identifier for the deployment configuration.')
  .argument(
    '[env]',
    'Optional: The environment to start (e.g., "development", "production"). Defaults to "development".',
  )
  .option('--run', 'Starts application servers and monitors their health.')
  .option('--build', 'Triggers the client-side application build process.')
  .action(Underpost.start.callback)
  .description('Initiates application servers, build pipelines, or other defined services based on the deployment ID.');

// 'clone' command: Clone a GitHub repository
program
  .command('clone')
  .argument(`<uri>`, 'The URI of the GitHub repository (e.g., "username/repository").')
  .option('--bare', 'Performs a bare clone, downloading only the .git files.')
  .option('-g8', 'Uses the g8 repository extension for cloning.')
  .description('Clones a specified GitHub repository into the current directory.')
  .action(Underpost.repo.clone);

// 'pull' command: Pull updates from a GitHub repository
program
  .command('pull')
  .argument('<path>', 'The absolute or relative directory path where the repository is located.')
  .argument(`<uri>`, 'The URI of the GitHub repository (e.g., "username/repository").')
  .description('Pulls the latest changes from a specified GitHub repository.')
  .option('-g8', 'Uses the g8 repository extension for pulling.')
  .action(Underpost.repo.pull);

// 'cmt' command: Commit changes to a GitHub repository
program
  .command('cmt')
  .argument('<path>', 'The absolute or relative directory path of the repository.')
  .argument(`<commit-type>`, `The type of commit to perform. Options: ${Object.keys(commitData).join(', ')}.`)
  .argument(`[module-tag]`, 'Optional: Sets a specific module tag for the commit.')
  .argument(`[message]`, 'Optional: Provides an additional custom message for the commit.')
  .option('--empty', 'Allows committing with empty files.')
  .option('--copy', 'Copies the generated commit message to the clipboard.')
  .option('--info', 'Displays information about available commit types.')
  .description('Manages commits to a GitHub repository, supporting various commit types and options.')
  .action(Underpost.repo.commit);

// 'push' command: Push changes to a GitHub repository
program
  .command('push')
  .argument('<path>', 'The absolute or relative directory path of the repository.')
  .argument(`<uri>`, 'The URI of the GitHub repository (e.g., "username/repository").')
  .option('-f', 'Forces the push, overwriting the remote repository history.')
  .option('-g8', 'Uses the g8 repository extension for pushing.')
  .description('Pushes committed changes from a local repository to a remote GitHub repository.')
  .action(Underpost.repo.push);

// 'env' command: Manage environment variables
program
  .command('env')
  .argument(
    '[deploy-id]',
    `The deployment configuration ID. Use 'clean' to restore default environment settings. User 'root' to load root env. User 'current' to get plain current deploy Id.`,
  )
  .argument('[env]', 'Optional: The environment to set (e.g., "production", "development"). Defaults to "production".')
  .argument('[subConf]', 'Optional: The sub configuration to set.')
  .description('Sets environment variables and configurations related to a specific deployment ID.')
  .action((deployId, env, subConf) => {
    if (fs.existsSync(`./engine-private/conf/${deployId}/.env.${env}`))
      dotenv.config({ path: `./engine-private/conf/${deployId}/.env.${env}`, override: true });
    else if (deployId === 'root') {
      deployId = UnderpostRootEnv.API.get('DEPLOY_ID');
    } else dotenv.config({ path: `./.env`, override: true });

    loadConf(deployId, subConf);
  });

// 'config' command: Manage Underpost configurations
program
  .command('config')
  .argument('operator', `The configuration operation to perform. Options: ${Object.keys(Underpost.env).join(', ')}.`)
  .argument('[key]', 'Optional: The specific configuration key to manage.')
  .argument('[value]', 'Optional: The value to set for the configuration key.')
  .option('--plain', 'Prints the configuration value in plain text.')
  .description(`Manages Underpost configurations using various operators.`)
  .action((...args) => Underpost.env[args[0]](args[1], args[2], args[3]));

// 'root' command: Get npm root path
program
  .command('root')
  .description('Displays the root path of the npm installation.')
  .action(() => console.log(getNpmRootPath()));

// 'cluster' command: Manage Kubernetes clusters
program
  .command('cluster')
  .argument('[pod-name]', 'Optional: Filters information by a specific pod name.')
  .option('--reset', `Deletes all clusters and prunes all related data and caches.`)
  .option('--mariadb', 'Initializes the cluster with a MariaDB statefulset.')
  .option('--mysql', 'Initializes the cluster with a MySQL statefulset.')
  .option('--mongodb', 'Initializes the cluster with a MongoDB statefulset.')
  .option('--mongo-db-host <host>', 'Set custom mongo db host')
  .option('--postgresql', 'Initializes the cluster with a PostgreSQL statefulset.')
  .option('--mongodb4', 'Initializes the cluster with a MongoDB 4.4 service.')
  .option('--valkey', 'Initializes the cluster with a Valkey service.')
  .option('--contour', 'Initializes the cluster with Project Contour base HTTPProxy and Envoy.')
  .option('--cert-manager', "Initializes the cluster with a Let's Encrypt production ClusterIssuer.")
  .option('--dedicated-gpu', 'Initializes the cluster with dedicated GPU base resources and environment settings.')
  .option('--info', 'Retrieves information about all deployed Kubernetes objects.')
  .option('--full', 'Initializes the cluster with all available statefulsets and services.')
  .option('--ns-use <ns-name>', 'Switches the current Kubernetes context to the specified namespace.')
  .option('--kubeadm', 'Initializes the cluster using kubeadm for control plane management.')
  .option('--grafana', 'Initializes the cluster with a Grafana deployment.')
  .option(
    '--prom [hosts]',
    'Initializes the cluster with a Prometheus Operator deployment and monitor scrap for specified hosts.',
  )
  .option('--dev', 'Initializes a development-specific cluster configuration.')
  .option('--list-pods', 'Displays detailed information about all pods.')
  .option('--info-capacity', 'Displays the current total machine capacity information.')
  .option('--info-capacity-pod', 'Displays the current machine capacity information per pod.')
  .option('--pull-image', 'Sets an optional associated image to pull during initialization.')
  .option('--init-host', 'Installs necessary Kubernetes node CLI tools (e.g., kind, kubeadm, docker, podman, helm).')
  .option('--uninstall-host', 'Uninstalls all host components installed by init-host.')
  .option('--config', 'Sets the base Kubernetes node configuration.')
  .option('--worker', 'Sets the context for a worker node.')
  .option('--chown', 'Sets the appropriate ownership for Kubernetes kubeconfig files.')
  .option('--k3s', 'Initializes the cluster using K3s (Lightweight Kubernetes).')
  .action(Underpost.cluster.init)
  .description('Manages Kubernetes clusters, defaulting to Kind cluster initialization.');

// 'deploy' command: Manage deployments
program
  .command('deploy')
  .argument('[deploy-list]', 'A comma-separated list of deployment IDs (e.g., "default-a,default-b").')
  .argument(
    '[env]',
    'Optional: The environment for deployment (e.g., "development", "production"). Defaults to "development".',
  )
  .option('--remove', 'Deletes specified deployments and their associated services.')
  .option('--sync', 'Synchronizes deployment environment variables, ports, and replica counts.')
  .option('--info-router', 'Displays the current router structure and configuration.')
  .option('--expose', 'Exposes services matching the provided deployment ID list.')
  .option('--info-util', 'Displays useful `kubectl` utility management commands.')
  .option('--cert', 'Resets TLS/SSL certificate secrets for deployments.')
  .option('--cert-hosts <hosts>', 'Resets TLS/SSL certificate secrets for specified hosts.')
  .option('--node <node>', 'Sets optional node for deployment operations.')
  .option(
    '--build-manifest',
    'Builds Kubernetes YAML manifests, including deployments, services, proxies, and secrets.',
  )
  .option('--replicas <replicas>', 'Sets a custom number of replicas for deployments.')
  .option('--image <image>', 'Sets a custom image for deployments.')
  .option('--versions <deployment-versions>', 'A comma-separated list of custom deployment versions.')
  .option('--traffic <traffic-versions>', 'A comma-separated list of custom deployment traffic weights.')
  .option('--disable-update-deployment', 'Disables updates to deployments.')
  .option('--info-traffic', 'Retrieves traffic configuration from current resource deployments.')
  .option('--kubeadm', 'Enables the kubeadm context for deployment operations.')
  .option('--etc-hosts', 'Enables the etc-hosts context for deployment operations.')
  .option('--restore-hosts', 'Restores default `/etc/hosts` entries.')
  .description('Manages application deployments, defaulting to deploying development pods.')
  .action(Underpost.deploy.callback);

// 'secret' command: Manage secrets
program
  .command('secret')
  .argument('<platform>', `The secret management platform. Options: ${Object.keys(Underpost.secret).join(', ')}.`)
  .option('--init', 'Initializes the secrets platform environment.')
  .option('--create-from-file <path-env-file>', 'Creates secrets from a specified environment file.')
  .option('--list', 'Lists all available secrets for the platform.')
  .description(`Manages secrets for various platforms.`)
  .action((...args) => {
    if (args[1].createFromFile) return Underpost.secret[args[0]].createFromEnvFile(args[1].createFromFile);
    if (args[1].list) return Underpost.secret[args[0]].list();
    if (args[1].init) return Underpost.secret[args[0]].init();
  });

// 'dockerfile-image-build' command: Build Docker images from Dockerfiles
program
  .command('dockerfile-image-build')
  .option('--path [path]', 'The path to the Dockerfile directory.')
  .option('--image-name [image-name]', 'Sets a custom name for the Docker image.')
  .option('--image-path [image-path]', 'Sets the output path for the tar image archive.')
  .option('--dockerfile-name [dockerfile-name]', 'Sets a custom name for the Dockerfile.')
  .option('--podman-save', 'Exports the built image as a tar file using Podman.')
  .option('--kind-load', 'Imports the tar image into a Kind cluster.')
  .option('--kubeadm-load', 'Imports the tar image into a Kubeadm cluster.')
  .option('--secrets', 'Includes Dockerfile environment secrets during the build.')
  .option('--secrets-path [secrets-path]', 'Specifies a custom path for Dockerfile environment secrets.')
  .option('--reset', 'Performs a build without using the cache.')
  .option('--k3s-load', 'Loads the image into a K3s cluster.')
  .description(
    'Builds a Docker image from a specified Dockerfile with various options for naming, saving, and loading.',
  )
  .action(Underpost.image.dockerfile.build);

// 'dockerfile-pull-base-images' command: Pull base Dockerfile images
program
  .command('dockerfile-pull-base-images')
  .option('--path [path]', 'The path to the Dockerfile directory.')
  .option('--kind-load', 'Imports the pulled image into a Kind cluster.')
  .option('--kubeadm-load', 'Imports the pulled image into a Kubeadm cluster.')
  .option('--version', 'Sets a custom version for the base images.')
  .option('--k3s-load', 'Loads the image into a K3s cluster.')
  .description('Pulls required Underpost Dockerfile base images and optionally loads them into clusters.')
  .action(Underpost.image.dockerfile.pullBaseImages);

// 'install' command: Fast import npm dependencies
program
  .command('install')
  .description('Quickly imports Underpost npm dependencies by copying them.')
  .action(() => {
    fs.copySync(`${underpostRootPath}/node_modules`, './node_modules');
  });

// 'db' command: Manage databases
program
  .command('db')
  .argument('<deploy-list>', 'A comma-separated list of deployment IDs (e.g., "default-a,default-b").')
  .option('--import', 'Imports container backups from specified repositories.')
  .option('--export', 'Exports container backups to specified repositories.')
  .option('--pod-name <pod-name>', 'Optional: Specifies the pod context for database operations.')
  .option('--collections <collections>', 'A comma-separated list of database collections to operate on.')
  .option('--out-path <out-path>', 'Specifies a custom output path for backups.')
  .option('--drop', 'Drops the specified databases or collections.')
  .option('--preserveUUID', 'Preserves UUIDs during database operations.')
  .option('--git', 'Uploads database backups to GitHub.')
  .option('--hosts <hosts>', 'A comma-separated list of database hosts.')
  .option('--paths <paths>', 'A comma-separated list of paths for database files.')
  .option('--ns <ns-name>', 'Optional: Specifies the namespace context for database operations.')
  .description('Manages database operations, including import, export, and collection management.')
  .action(Underpost.db.callback);

program
  .command('metadata')
  .argument('[deploy-id]', 'The deployment ID to manage metadata.')
  .argument('[host]', 'The host to manage metadata.')
  .argument('[path]', 'The path to manage metadata.')
  .option('--import', 'Imports from local storage.')
  .option('--export', 'Exports to local storage.')
  .option('--crons', 'Apply to cron data collection')
  .option('--instances', 'Apply to instance data collection')
  .option('--generate', 'Generate cluster metadata')
  .option('--itc', 'Apply under container execution context')
  .description('Manages cluster metadata operations, including import and export.')
  .action(Underpost.db.clusterMetadataBackupCallback);

// 'script' command: Execute scripts
program
  .command('script')
  .argument('operator', `The script operation to perform. Options: ${Object.keys(Underpost.script).join(', ')}.`)
  .argument('<script-name>', 'The name of the script to execute.')
  .argument('[script-value]', 'Optional: A literal command or a path to a script file.')
  .option('--itc', 'Executes the script within the container execution context.')
  .option('--itc-path', 'Specifies container path options for script execution.')
  .option('--ns <ns-name>', 'Optional: Specifies the namespace context for script execution.')
  .option('--pod-name <pod-name>', 'Optional: Specifies the pod name for script execution.')
  .description(
    'Supports a variety of built-in Underpost global scripts, their preset lifecycle events, and arbitrary custom scripts.',
  )
  .action((...args) => Underpost.script[args[0]](args[1], args[2], args[3]));

// 'cron' command: Manage cron jobs
program
  .command('cron')
  .argument('[deploy-list]', 'A comma-separated list of deployment IDs (e.g., "default-a,default-b").')
  .argument(
    '[job-list]',
    `A comma-separated list of job IDs. Options: ${Object.keys(Underpost.cron).join(
      ', ',
    )}. Defaults to all available jobs.`,
  )
  .option('--itc', 'Executes cron jobs within the container execution context.')
  .option('--init', 'Initializes cron jobs for the default deployment ID.')
  .option('--git', 'Uploads cron job configurations to GitHub.')
  .description('Manages cron jobs, including initialization, execution, and configuration updates.')
  .action(Underpost.cron.callback);

// 'fs' command: File storage management
program
  .command('fs')
  .argument('[path]', 'The absolute or relative directory path for file operations.')
  .option('--rm', 'Removes the specified file.')
  .option('--git', 'Displays current Git changes related to file storage.')
  .option('--recursive', 'Uploads files recursively from the specified path.')
  .option('--deploy-id <deploy-id>', 'Specifies the deployment configuration ID for file operations.')
  .option('--pull', 'Downloads the specified file.')
  .option('--force', 'Forces the action, overriding any warnings or conflicts.')
  .option('--storage-file-path <storage-file-path>', 'Specifies a custom file storage path.')
  .description('Manages file storage, defaulting to file upload operations.')
  .action(Underpost.fs.callback);

// 'test' command: Manage tests
program
  .command('test')
  .argument('[deploy-list]', 'A comma-separated list of deployment IDs (e.g., "default-a,default-b").')
  .description('Manages and runs tests, defaulting to the current Underpost default test suite.')
  .option('--itc', 'Executes tests within the container execution context.')
  .option('--sh', 'Copies the container entrypoint shell command to the clipboard.')
  .option('--logs', 'Displays container logs for test debugging.')
  .option('--pod-name <pod-name>', 'Optional: Specifies the pod name for test execution.')
  .option('--pod-status <pod-status>', 'Optional: Filters tests by pod status.')
  .option('--kind-type <kind-type>', 'Optional: Specifies the Kind cluster type for tests.')
  .action(Underpost.test.callback);

// 'monitor' command: Monitor health server
program
  .command('monitor')
  .argument('<deploy-id>', 'The deployment configuration ID to monitor.')
  .argument(
    '[env]',
    'Optional: The environment to monitor (e.g., "development", "production"). Defaults to "development".',
  )
  .option('--ms-interval <ms-interval>', 'Sets a custom millisecond interval for monitoring checks.')
  .option('--now', 'Executes the monitor script immediately.')
  .option('--single', 'Disables recurrence, running the monitor script only once.')
  .option('--replicas <replicas>', 'Sets a custom number of replicas for monitoring.')
  .option('--type <type>', 'Sets a custom monitor type.')
  .option('--sync', 'Synchronizes with current proxy deployments and traffic configurations.')
  .description('Manages health server monitoring for specified deployments.')
  .action(Underpost.monitor.callback);

// 'ssh' command: SSH management
program
  .command('ssh')
  .option('--generate', 'Generates new ssh credential and stores it in current private keys file storage.')
  .description('Import and start ssh server and client based on current default deployment ID.')
  .action(Underpost.ssh.callback);

// 'run' command: Run a script
program
  .command('run')
  .argument('<runner-id>', `The runner ID to run. Options: ${Object.keys(UnderpostRun.RUNNERS).join(', ')}.`)
  .argument('[path]', 'The absolute or relative directory path where the script is located.')
  .option('--command <command-array>', 'Array of commands to run.')
  .option('--args <args-array>', 'Array of arguments to pass to the command.')
  .option('--dev', 'Sets the development context environment for the script.')
  .option('--build', 'Set builder context runner')
  .option('--replicas <replicas>', 'Sets a custom number of replicas for deployment.')
  .option('--pod-name <pod-name>', 'Optional: Specifies the pod name for test execution.')
  .option('--volume-host-path <volume-host-path>', 'Optional: Specifies the volume host path for test execution.')
  .option('--volume-mount-path <volume-mount-path>', 'Optional: Specifies the volume mount path for test execution.')
  .option('--volume-type <volume-type>', 'Optional: Specifies the volume type for test execution.')
  .option('--image-name <image-name>', 'Optional: Specifies the image name for test execution.')
  .option('--container-name <container-name>', 'Optional: Specifies the container name for test execution.')
  .option('--namespace <namespace>', 'Optional: Specifies the namespace for test execution.')
  .option('--kubeadm', 'Flag to indicate Kubeadm cluster type context')
  .option('--k3s', 'Flag to indicate K3s cluster type context')
  .description('Runs a script from the specified path.')
  .action(UnderpostRun.API.callback);

// 'lxd' command: LXD management
program
  .command('lxd')
  .option('--init', 'Initializes LXD on the current machine.')
  .option('--reset', 'Resets LXD on the current machine, deleting all configurations.')
  .option('--install', 'Installs LXD on the current machine.')
  .option('--dev', 'Sets the development context environment for LXD.')
  .option('--create-virtual-network', 'Creates an LXD virtual network bridge.')
  .option('--create-admin-profile', 'Creates an admin profile for LXD management.')
  .option('--control', 'Sets the context for a control node VM.')
  .option('--worker', 'Sets the context for a worker node VM.')
  .option('--create-vm <vm-id>', 'Creates default virtual machines with the specified ID.')
  .option('--init-vm <vm-id>', 'Retrieves the Underpost initialization script for the specified VM.')
  .option('--info-vm <vm-id>', 'Retrieves all information about the specified VM.')
  .option('--test <vm-id>', 'Tests the health, status, and network connectivity for a VM.')
  .option('--root-size <gb-size>', 'Sets the root partition size (in GB) for the VM.')
  .option('--k3s', 'Flag to indicate that the VM initialization is for a K3s cluster type.')
  .option(
    '--join-node <nodes>',
    'A comma-separated list of worker and control nodes to join (e.g., "k8s-worker-1,k8s-control").',
  )
  .option(
    '--expose <vm-name-ports>',
    'Exposes specified ports on a VM (e.g., "k8s-control:80,443"). Multiple VM-port pairs can be comma-separated.',
  )
  .option(
    '--delete-expose <vm-name-ports>',
    'Removes exposed ports on a VM (e.g., "k8s-control:80,443"). Multiple VM-port pairs can be comma-separated.',
  )
  .option('--auto-expose-k8s-ports <vm-id>', 'Automatically exposes common Kubernetes ports for the specified VM.')
  .description('Manages LXD containers and virtual machines.')
  .action(UnderpostLxd.API.callback);

// 'baremetal' command: Baremetal server management
program
  .command('baremetal [workflow-id] [hostname] [ip-address]')
  .option('--control-server-install', 'Installs the baremetal control server.')
  .option('--control-server-uninstall', 'Uninstalls the baremetal control server.')
  .option('--control-server-db-install', 'Installs up the database for the baremetal control server.')
  .option('--control-server-db-uninstall', 'Uninstalls the database for the baremetal control server.')
  .option('--commission', 'Init workflow for commissioning a physical machine.')
  .option('--nfs-build', 'Builds an NFS root filesystem for a workflow id config architecture using QEMU emulation.')
  .option('--nfs-mount', 'Mounts the NFS root filesystem for a workflow id config architecture.')
  .option('--nfs-unmount', 'Unmounts the NFS root filesystem for a workflow id config architecture.')
  .option('--nfs-sh', 'Copies QEMU emulation root entrypoint shell command to the clipboard.')
  .option('--cloud-init-update', 'Updates cloud init for a workflow id config architecture.')
  .option('--cloud-init-reset', 'Resets cloud init for a workflow id config architecture.')
  .option('--logs <log-id>', 'Displays logs for log id: dhcp, cloud, machine, cloud-config.')
  .option('--dev', 'Sets the development context environment for baremetal operations.')
  .option('--ls', 'Lists available boot resources and machines.')
  .description(
    'Manages baremetal server operations, including installation, database setup, commissioning, and user management.',
  )
  .action(UnderpostBaremetal.API.callback);

export { program };
