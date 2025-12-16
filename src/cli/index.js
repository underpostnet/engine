import dotenv from 'dotenv';
import { Command } from 'commander';
import Underpost, { UnderpostRootEnv } from '../index.js';
import { getNpmRootPath, getUnderpostRootPath, loadConf } from '../server/conf.js';
import fs from 'fs-extra';
import { commitData } from '../client/components/core/CommonJs.js';
import UnderpostLxd from './lxd.js';
import UnderpostBaremetal from './baremetal.js';
import UnderpostRun from './run.js';
import Dns from '../server/dns.js';
import UnderpostStatic from './static.js';

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
  .argument('[app-name]', 'The name of the new project.')
  .option('--deploy-id <deploy-id>', 'Crete deploy ID conf env files')
  .option('--sub-conf <sub-conf>', 'Create sub conf env files')
  .option('--cluster', 'Create deploy ID cluster files and sync to current cluster')
  .option('--build-repos', 'Create deploy ID repositories')
  .option('--build', 'Build the deployment to pwa-microservices-template (requires --deploy-id)')
  .option('--clean-template', 'Clean the build directory (pwa-microservices-template)')
  .option('--sync-conf', 'Sync configuration to private repositories (requires --deploy-id)')
  .option('--purge', 'Remove deploy ID conf and all related repositories (requires --deploy-id)')
  .option('--dev', 'Sets the development cli context')
  .option('--default-conf', 'Create default deploy ID conf env files')
  .option('--conf-workflow-id <workflow-id>', 'Set custom configuration workflow ID for conf generation')
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
  .option('--underpost-quickly-install', 'Uses Underpost Quickly Install for dependency installation.')
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
  .argument('[path]', 'The absolute or relative directory path of the repository.')
  .argument(`[commit-type]`, `The type of commit to perform. Options: ${Object.keys(commitData).join(', ')}.`)
  .argument(`[module-tag]`, 'Optional: Sets a specific module tag for the commit.')
  .argument(`[message]`, 'Optional: Provides an additional custom message for the commit.')
  .option(`--log <latest-n>`, 'Shows commit history from the specified number of latest n path commits.')
  .option('--last-msg <latest-n>', 'Displays the last n commit message.')
  .option('--empty', 'Allows committing with empty files.')
  .option('--copy', 'Copies the generated commit message to the clipboard.')
  .option('--info', 'Displays information about available commit types.')
  .option('--diff', 'Shows the current git diff changes.')
  .option('--edit', 'Edit last commit.')
  .option('--msg <msg>', 'Sets a custom commit message.')
  .option('--deploy-id <deploy-id>', 'Sets the deployment configuration ID for the commit context.')
  .option('--cached', 'Commit staged changes only or context.')
  .option('--hashes <hashes>', 'Comma-separated list of specific file hashes of commits.')
  .option('--extension <extension>', 'specific file extensions of commits.')
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
    `The deployment configuration ID. Use 'clean' to restore default environment settings. Use 'root' to load underpost root env. Use 'current' to get plain current deploy Id.`,
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

// 'static' command: Manage static configurations
program
  .command('static')
  .option('--page <ssr-component-path>', 'Build custom static pages.')
  .option('--title <title>', 'Sets a custom title for the static page (deprecated: use --config-file).')
  .option('--output-path <output-path>', 'Sets the output path for the generated static page.')

  // Metadata options
  .option('--description <description>', 'Page description for SEO.')
  .option('--keywords <keywords>', 'Comma-separated keywords for SEO.')
  .option('--author <author>', 'Page author.')
  .option('--theme-color <color>', 'Theme color for mobile browsers.')
  .option('--canonical-url <url>', 'Canonical URL for SEO.')
  .option('--thumbnail <url>', 'Open Graph thumbnail image URL.')
  .option('--locale <locale>', 'Page locale (default: en-US).')
  .option('--site-name <name>', 'Site name for Open Graph.')

  // Script and style options
  .option('--head-scripts <paths>', 'Comma-separated paths to scripts for head section.')
  .option('--body-scripts <paths>', 'Comma-separated paths to scripts for body section.')
  .option('--styles <paths>', 'Comma-separated paths to stylesheets.')

  // Icon options
  .option('--favicon <path>', 'Favicon path.')
  .option('--apple-touch-icon <path>', 'Apple touch icon path.')
  .option('--manifest <path>', 'Web manifest path.')

  // Component options
  .option('--head-components <paths>', 'Comma-separated SSR head component paths.')
  .option('--body-components <paths>', 'Comma-separated SSR body component paths.')

  // Build options
  .option('--deploy-id <deploy-id>', 'Build static assets for a specific deployment ID.')
  .option('--build', 'Triggers the static build process for the specified deployment ID.')
  .option('--build-host <build-host>', 'Sets a custom build host for static documents or assets.')
  .option('--build-path <build-path>', 'Sets a custom build path for static documents or assets.')
  .option('--env <env>', 'Sets the environment for the static build (e.g., "development", "production").')
  .option('--minify', 'Minify HTML output (default: true for production).')
  .option('--no-minify', 'Disable HTML minification.')

  // Config file options
  .option('--config-file <path>', 'Path to JSON configuration file.')
  .option('--generate-config [path]', 'Generate a template configuration file.')

  // Other options
  .option('--lang <lang>', 'HTML lang attribute (default: en).')
  .option('--dir <dir>', 'HTML dir attribute (default: ltr).')
  .option('--dev', 'Sets the development cli context')

  .description(`Manages static build of page, bundles, and documentation with comprehensive customization options.`)
  .action(UnderpostStatic.API.callback);

// 'config' command: Manage Underpost configurations
program
  .command('config')
  .argument('operator', `The configuration operation to perform. Options: ${Object.keys(Underpost.env).join(', ')}.`)
  .argument('[key]', 'Optional: The specific configuration key to manage.')
  .argument('[value]', 'Optional: The value to set for the configuration key.')
  .option('--plain', 'Prints the configuration value in plain text.')
  .option('--filter <keyword>', 'Filters the list by matching key or value (only for list operation).')
  .description(`Manages Underpost configurations using various operators.`)
  .action((...args) => Underpost.env[args[0]](args[1], args[2], args[3]));

// 'root' command: Get npm root path
program
  .command('root')
  .description('Displays the root path of the npm installation.')
  .action(() => console.log(getNpmRootPath()));

program
  .command('ip')
  .argument('[ips]', 'Optional args comma-separated list of IP to process.')
  .option('--copy', 'Copies the IP addresses to the clipboard.')
  .option('--ban-ingress-add', 'Adds IP addresses to banned ingress list.')
  .option('--ban-ingress-remove', 'Removes IP addresses from banned ingress list.')
  .option('--ban-ingress-list', 'Lists all banned ingress IP addresses.')
  .option('--ban-ingress-clear', 'Clears all banned ingress IP addresses.')
  .option('--ban-egress-add', 'Adds IP addresses to banned egress list.')
  .option('--ban-egress-remove', 'Removes IP addresses from banned egress list.')
  .option('--ban-egress-list', 'Lists all banned egress IP addresses.')
  .option('--ban-egress-clear', 'Clears all banned egress IP addresses.')
  .option('--ban-both-add', 'Adds IP addresses to both banned ingress and egress lists.')
  .option('--ban-both-remove', 'Removes IP addresses from both banned ingress and egress lists.')
  .description('Displays the current public machine IP addresses.')
  .action(Dns.ipDispatcher);

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
  .option('--full', 'Initializes the cluster with all available statefulsets and services.')
  .option(
    '--ns-use <ns-name>',
    "Switches the current Kubernetes context to the specified namespace (creates if it doesn't exist).",
  )
  .option('--kubeadm', 'Initializes the cluster using kubeadm for control plane management.')
  .option(
    '--pod-network-cidr <cidr>',
    'Sets custom pod network CIDR for kubeadm cluster initialization (defaults to "192.168.0.0/16").',
  )
  .option(
    '--control-plane-endpoint <endpoint>',
    'Sets custom control plane endpoint for kubeadm cluster initialization (defaults to "localhost:6443").',
  )
  .option('--grafana', 'Initializes the cluster with a Grafana deployment.')
  .option(
    '--prom [hosts]',
    'Initializes the cluster with a Prometheus Operator deployment and monitor scrap for specified hosts.',
  )
  .option('--dev', 'Initializes a development-specific cluster configuration.')
  .option('--list-pods', 'Displays detailed information about all pods.')
  .option('--pull-image', 'Sets an optional associated image to pull during initialization.')
  .option('--init-host', 'Installs necessary Kubernetes node CLI tools (e.g., kind, kubeadm, docker, podman, helm).')
  .option('--uninstall-host', 'Uninstalls all host components installed by init-host.')
  .option('--config', 'Sets the base Kubernetes node configuration.')
  .option('--worker', 'Sets the context for a worker node.')
  .option('--chown', 'Sets the appropriate ownership for Kubernetes kubeconfig files.')
  .option('--k3s', 'Initializes the cluster using K3s (Lightweight Kubernetes).')
  .option('--hosts <hosts>', 'A comma-separated list of cluster hostnames or IP addresses.')
  .option('--remove-volume-host-paths', 'Removes specified volume host paths after execution.')
  .option('--namespace <namespace>', 'Kubernetes namespace for cluster operations (defaults to "default").')
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
  .option('--disable-update-proxy', 'Disables updates to proxies.')
  .option('--disable-deployment-proxy', 'Disables proxies of deployments.')
  .option('--disable-update-volume', 'Disables updates to volume mounts during deployment.')
  .option(
    '--status',
    'Retrieves current network traffic data from resource deployments and the host machine network configuration.',
  )
  .option('--kubeadm', 'Enables the kubeadm context for deployment operations.')
  .option('--etc-hosts', 'Enables the etc-hosts context for deployment operations.')
  .option('--restore-hosts', 'Restores default `/etc/hosts` entries.')
  .option('--disable-update-underpost-config', 'Disables updates to Underpost configuration during deployment.')
  .option('--namespace <namespace>', 'Kubernetes namespace for deployment operations (defaults to "default").')
  .option('--kind-type <kind-type>', 'Specifies the Kind cluster type for deployment operations.')
  .option('--port <port>', 'Sets up port forwarding from local to remote ports.')
  .option('--cmd <cmd>', 'Custom initialization command for deployment (comma-separated commands).')
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

// 'image'
program
  .command('image')
  .option(
    '--build',
    'Builds a Docker image using Podman, optionally saves it as a tar archive, and loads it into a specified Kubernetes cluster (Kind, Kubeadm, or K3s).',
  )
  .option('--ls', 'Lists all available Underpost Dockerfile images.')
  .option('--rm <image-id>', 'Removes specified Underpost Dockerfile images.')
  .option('--path [path]', 'The path to the Dockerfile directory.')
  .option('--image-name [image-name]', 'Sets a custom name for the Docker image.')
  .option('--image-path [image-path]', 'Sets the output path for the tar image archive.')
  .option('--dockerfile-name [dockerfile-name]', 'Sets a custom name for the Dockerfile.')
  .option('--podman-save', 'Exports the built image as a tar file using Podman.')
  .option('--pull-base', 'Pulls base images and builds a "rockylinux9-underpost" image.')
  .option('--spec', 'Get current cached list of container images used by all pods')
  .option('--namespace <namespace>', 'Kubernetes namespace for image operations (defaults to "default").')
  .option('--kind', 'Set kind cluster env image context management.')
  .option('--kubeadm', 'Set kubeadm cluster env image context management.')
  .option('--k3s', 'Set k3s cluster env image context management.')
  .option('--node-name', 'Set node name for kubeadm or k3s cluster env image context management.')
  .option('--secrets', 'Includes Dockerfile environment secrets during the build.')
  .option('--secrets-path [secrets-path]', 'Specifies a custom path for Dockerfile environment secrets.')
  .option('--reset', 'Performs a build without using the cache.')
  .option('--dev', 'Use development mode.')
  .option('--pull-dockerhub <dockerhub-image>', 'Sets a custom Docker Hub image for base image pulls.')
  .description('Manages Docker images, including building, saving, and loading into Kubernetes clusters.')
  .action(async (options) => {
    if (options.rm) Underpost.image.rm({ ...options, imageName: options.rm });
    if (options.ls) Underpost.image.list({ ...options, log: true });
    if (options.pullBase) Underpost.image.pullBaseImages(options);
    if (options.build) Underpost.image.build(options);
    if (options.pullDockerhub)
      Underpost.image.pullDockerHubImage({ ...options, dockerhubImage: options.pullDockerhub });
  });

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
  .argument('[deploy-list]', 'A comma-separated list of deployment IDs (e.g., "default-a,default-b").')
  .option('--import', 'Imports container backups from specified repositories.')
  .option('--export', 'Exports container backups to specified repositories.')
  .option(
    '--pod-name <pod-name>',
    'Comma-separated list of pod names or patterns (supports wildcards like "mariadb-*").',
  )
  .option('--all-pods', 'Target all matching pods instead of just the first one.')
  .option('--primary-pod', 'Automatically detect and use MongoDB primary pod (MongoDB only).')
  .option('--primary-pod-ensure <pod-name>', 'Ensure setup of MongoDB replica set primary pod before operations.')
  .option('--stats', 'Display database statistics (collection/table names with document/row counts).')
  .option('--collections <collections>', 'Comma-separated list of database collections to operate on.')
  .option('--out-path <out-path>', 'Specifies a custom output path for backups.')
  .option('--drop', 'Drops the specified databases or collections before importing.')
  .option('--preserveUUID', 'Preserves UUIDs during database import operations.')
  .option('--git', 'Enables Git integration for backup version control (clone, pull, commit, push to GitHub).')
  .option('--force-clone', 'Forces cloning of the Git repository, overwriting local changes.')
  .option('--hosts <hosts>', 'Comma-separated list of database hosts to filter operations.')
  .option('--paths <paths>', 'Comma-separated list of paths to filter database operations.')
  .option('--ns <ns-name>', 'Kubernetes namespace context for database operations (defaults to "default").')
  .option(
    '--macro-rollback-export <n-commits-reset>',
    'Exports a macro rollback script that reverts the last n commits (Git integration required).',
  )
  .option('--dev', 'Sets the development cli context')
  .option('--kubeadm', 'Enables the kubeadm context for database operations.')
  .option('--kind', 'Enables the kind context for database operations.')
  .option('--k3s', 'Enables the k3s context for database operations.')
  .description(
    'Manages database operations with support for MariaDB and MongoDB, including import/export, multi-pod targeting, and Git integration.',
  )
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
  .option('--init-pm2-cronjobs', 'Initializes PM2 cron jobs from configuration for the specified deployment IDs.')
  .option('--git', 'Uploads cron job configurations to GitHub.')
  .option('--update-package-scripts', 'Updates package.json start scripts for each deploy-id configuration.')
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
  .option('--replicas <replicas>', 'Sets a custom number of replicas for monitoring. Defaults to 1.')
  .option('--type <type>', 'Sets a custom monitor type.')
  .option('--sync', 'Synchronizes with current proxy deployments and traffic configurations.')
  .option('--namespace <namespace>', 'Sets the Kubernetes namespace for the deployment. Defaults to "default".')
  .description('Manages health server monitoring for specified deployments.')
  .action(Underpost.monitor.callback);

// 'ssh' command: SSH management
program
  .command('ssh')
  .option('--deploy-id <deploy-id>', 'Sets deploy id context for ssh operations.')
  .option('--generate', 'Generates new ssh credential and stores it in current private keys file storage.')
  .option('--user <user>', 'Sets custom ssh user')
  .option('--password <password>', 'Sets custom ssh password')
  .option('--host <host>', 'Sets custom ssh host')
  .option('--port <port>', 'Sets custom ssh port')
  .option('--filter <filter>', 'Filters ssh user credentials from current private keys file storage.')
  .option('--groups <groups>', 'Sets comma-separated ssh user groups for the ssh user credential.')
  .option('--user-add', 'Adds a new ssh user credential to current private keys file storage.')
  .option('--user-remove', 'Removes an existing ssh user credential from current private keys file storage.')
  .option('--user-ls', 'Lists all ssh user credentials from current private keys file storage.')
  .option('--start', 'Starts an SSH session with the specified credentials.')
  .option('--reset', 'Resets ssh configuration and deletes all stored credentials.')
  .option('--keys-list', 'Lists all ssh keys from current private keys file storage.')
  .option('--hosts-list', 'Lists all ssh hosts from current private keys file storage.')
  .option('--disable-password', 'Disables password authentication for the SSH session.')
  .option('--key-test', 'Tests the SSH key using ssh-keygen.')
  .option('--stop', 'Stops the SSH service.')
  .option('--status', 'Checks the status of the SSH service.')
  .option('--connect-uri', 'Displays the connection URI.')
  .option('--copy', 'Copies the connection URI to clipboard.')
  .action(Underpost.ssh.callback);

// 'run' command: Run a script
program
  .command('run')
  .argument('<runner-id>', `The runner ID to run. Options: ${Object.keys(UnderpostRun.RUNNERS).join(', ')}.`)
  .argument('[path]', 'The input value, identifier, or path for the operation.')
  .option('--cmd <command-list>', 'Comma-separated list of commands to execute.')
  .option('--args <args-array>', 'Array of arguments to pass to the command.')
  .option('--dev', 'Sets the development context environment for the script.')
  .option('--build', 'Set builder context runner')
  .option('--replicas <replicas>', 'Sets a custom number of replicas for deployment.')
  .option('--pod-name <pod-name>', 'Optional: Specifies the pod name for execution.')
  .option('--node-name <node-name>', 'Optional: Specifies the node name for execution.')
  .option('--port <port>', 'Optional: Specifies the port for execution.')
  .option('--etc-hosts', 'Enables etc-hosts context for the runner execution.')
  .option('--volume-host-path <volume-host-path>', 'Optional: Specifies the volume host path for test execution.')
  .option('--volume-mount-path <volume-mount-path>', 'Optional: Specifies the volume mount path for test execution.')
  .option('--volume-type <volume-type>', 'Optional: Specifies the volume type for test execution.')
  .option('--image-name <image-name>', 'Optional: Specifies the image name for test execution.')
  .option('--container-name <container-name>', 'Optional: Specifies the container name for test execution.')
  .option('--namespace <namespace>', 'Optional: Specifies the namespace for test execution.')
  .option('--tty', 'Enables TTY for the container in deploy-job.')
  .option('--stdin', 'Keeps STDIN open for the container in deploy-job.')
  .option('--restart-policy <policy>', 'Sets the restart policy for the job in deploy-job.')
  .option('--runtime-class-name <name>', 'Sets the runtime class name for the job in deploy-job.')
  .option('--image-pull-policy <policy>', 'Sets the image pull policy for the job in deploy-job.')
  .option('--api-version <version>', 'Sets the API version for the job manifest in deploy-job.')
  .option(
    '--labels <labels>',
    'Optional: Specifies a comma-separated list of key-value pairs for labels (e.g., "app=my-app,env=prod").',
  )
  .option('--claim-name <name>', 'Optional: Specifies the claim name for volume mounting in deploy-job.')
  .option(
    '--kind-type <kind-type>',
    'Specifies the kind of Kubernetes resource (e.g., Job, Deployment) for deploy-job.',
  )
  .option('--force', 'Forces operation, overriding any warnings or conflicts.')
  .option('--tls', 'Enables TLS for the runner execution.')
  .option('--reset', 'Resets the runner state before execution.')
  .option('--terminal', 'Enables terminal mode for interactive script execution.')
  .option('--dev-proxy-port-offset <port-offset>', 'Sets a custom port offset for development proxy.')
  .option('--host-network', 'Enables host network mode for the runner execution.')
  .option('--requests-memory <requests-memory>', 'Requests memory limit for the runner execution.')
  .option('--requests-cpu <requests-cpu>', 'Requests CPU limit for the runner execution.')
  .option('--limits-memory <limits-memory>', 'Sets memory limit for the runner execution.')
  .option('--limits-cpu <limits-cpu>', 'Sets CPU limit for the runner execution.')
  .option(
    '--resource-template-id <resource-template-id >',
    'Specifies a resource template ID for the runner execution.',
  )
  .option('--expose', 'Enables service exposure for the runner execution.')
  .option('--conf-server-path <conf-server-path>', 'Sets a custom configuration server path.')
  .option('--underpost-root <underpost-root>', 'Sets a custom Underpost root path.')
  .option('--cron-jobs <jobs>', 'Comma-separated list of cron jobs to run before executing the script.')
  .option('--timezone <timezone>', 'Sets the timezone for the runner execution.')
  .option('--kubeadm', 'Sets the kubeadm cluster context for the runner execution.')
  .option('--k3s', 'Sets the k3s cluster context for the runner execution.')
  .option('--kind', 'Sets the kind cluster context for the runner execution.')
  .option('--log-type <log-type>', 'Sets the log type for the runner execution.')
  .option('--deploy-id <deploy-id>', 'Sets deploy id context for the runner execution.')
  .option('--user <user>', 'Sets user context for the runner execution.')
  .option('--hosts <hosts>', 'Comma-separated list of hosts for the runner execution.')
  .option('--instance-id <instance-id>', 'Sets instance id context for the runner execution.')
  .option('--pid <process-id>', 'Sets process id context for the runner execution.')
  .description('Runs specified scripts using various runners.')
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
  .option('--workflow-id <workflow-id>', 'Sets the workflow ID context for LXD operations.')
  .option('--vm-id <vm-id>', 'Sets the VM ID context for LXD operations.')
  .option('--deploy-id <deploy-id>', 'Sets the deployment ID context for LXD operations.')
  .option('--namespace <namespace>', 'Kubernetes namespace for LXD operations (defaults to "default").')
  .description('Manages LXD containers and virtual machines.')
  .action(UnderpostLxd.API.callback);

// 'baremetal' command: Baremetal server management
program
  .command('baremetal [workflow-id] [hostname] [ip-address]')
  .option('--control-server-install', 'Installs the baremetal control server.')
  .option('--control-server-uninstall', 'Uninstalls the baremetal control server.')
  .option('--control-server-db-install', 'Installs up the database for the baremetal control server.')
  .option('--control-server-db-uninstall', 'Uninstalls the database for the baremetal control server.')
  .option('--mac <mac>', 'Specifies the MAC address for baremetal machine operations.')
  .option('--install-packer', 'Installs Packer CLI.')
  .option(
    '--packer-maas-image-template <template-path>',
    'Creates a new image folder from canonical/packer-maas template path (requires workflow-id).',
  )
  .option('--packer-workflow-id <workflow-id>', 'Specifies the workflow ID for Packer MAAS image operations.')
  .option(
    '--packer-maas-image-build',
    'Builds a MAAS image using Packer for the workflow specified by --packer-workflow-id.',
  )
  .option(
    '--packer-maas-image-upload',
    'Uploads an existing MAAS image artifact without rebuilding for the workflow specified by --packer-workflow-id.',
  )
  .option(
    '--packer-maas-image-cached',
    'Continue last build without removing artifacts (used with --packer-maas-image-build).',
  )
  .option('--remove-machines <system-ids>', 'Removes baremetal machines by comma-separated system IDs, or use "all"')
  .option('--clear-discovered', 'Clears all discovered baremetal machines from the database.')
  .option('--commission', 'Init workflow for commissioning a physical machine.')
  .option('--nfs-build', 'Builds an NFS root filesystem for a workflow id config architecture using QEMU emulation.')
  .option('--nfs-mount', 'Mounts the NFS root filesystem for a workflow id config architecture.')
  .option('--nfs-unmount', 'Unmounts the NFS root filesystem for a workflow id config architecture.')
  .option('--nfs-sh', 'Copies QEMU emulation root entrypoint shell command to the clipboard.')
  .option('--cloud-init-update', 'Updates cloud init for a workflow id config architecture.')
  .option('--logs <log-id>', 'Displays logs for log id: dhcp, cloud, machine, cloud-config.')
  .option('--dev', 'Sets the development context environment for baremetal operations.')
  .option('--ls', 'Lists available boot resources and machines.')
  .description(
    'Manages baremetal server operations, including installation, database setup, commissioning, and user management.',
  )
  .action(UnderpostBaremetal.API.callback);

export { program };
