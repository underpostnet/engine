import dotenv from 'dotenv';
import fs from 'fs-extra';

import { Command } from 'commander';
import { getNpmRootPath, getUnderpostRootPath, loadConf } from '../server/conf.js';
import { commitData } from '../client/components/core/CommonJs.js';

import Underpost from '../index.js';

const underpostGlobalEnv = `${getUnderpostRootPath()}/.env`;

if (fs.existsSync(underpostGlobalEnv)) dotenv.config({ path: underpostGlobalEnv, override: true, quiet: true });
else dotenv.config({ quiet: true });

const program = new Command();

program.name('underpost').description(`underpost ci/cd cli ${Underpost.version}`).version(Underpost.version);

program
  .command('new')
  .argument('[app-name]', 'The name of the new project.')
  .option('--deploy-id <deploy-id>', 'Create deploy ID conf env files')
  .option('--sub-conf <sub-conf>', 'Create sub conf env files')
  .option('--cluster', 'Create deploy ID cluster files and sync to current cluster')
  .option('--build-repos', 'Create deploy ID repositories')
  .option('--build', 'Build the deployment to pwa-microservices-template (requires --deploy-id)')
  .option('--clean-template', 'Clean the build directory (pwa-microservices-template)')
  .option('--sync-conf', 'Sync configuration to private repositories (requires --deploy-id)')
  .option(
    '--sync-start',
    "Sync start scripts in deploy ID package.json with root package.json (use 'dd' as --deploy-id to sync all dd.router)",
  )
  .option('--purge', 'Remove deploy ID conf and all related repositories (requires --deploy-id)')
  .option('--dev', 'Sets the development cli context')
  .option('--default-conf', 'Create default deploy ID conf env files')
  .option('--conf-workflow-id <workflow-id>', 'Set custom configuration workflow ID for conf generation')
  .description('Initializes a new Underpost project, service, or configuration.')
  .action(Underpost.repo.new);

program
  .command('client')
  .argument('[deploy-id]', 'The deployment ID to build.', 'dd-default')
  .argument('[sub-conf]', 'The sub-configuration for the build.', '')
  .argument('[host]', 'Comma-separated hosts to filter the build.', '')
  .argument('[path]', 'Comma-separated paths to filter the build.', '')
  .option('--sync-env-port', 'Sync environment port assignments across all deploy IDs')
  .option('--single-replica', 'Build single replica folders instead of full client')
  .option('--build-zip', 'Create zip files of the builds')
  .option('--split <mb>', 'Split generated zip files into parts of the specified size in MB')
  .option('--unzip <build-prefix>', 'Extract a built client zip or split zip parts using the given build prefix')
  .option('--merge-zip <build-prefix>', 'Merge split ZIP parts back into a single ZIP file for the given build prefix')
  .option('--lite-build', 'Skip full build (default is full build)')
  .option('--icons-build', 'Build icons')
  .description('Builds client assets, single replicas, and/or syncs environment ports.')
  .action(Underpost.repo.client);

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
  .option('--skip-pull-base', 'Skips cloning repositories, uses current workspace code directly.')
  .option('--skip-full-build', 'Skips the full client bundle build during deployment.')
  .option(
    '--pull-bundle',
    'Downloads the pre-built client bundle from Cloudinary via pull-bundle before starting. Use together with --skip-full-build to skip the local build entirely.',
  )
  .option(
    '--private-test-repo',
    'During --build, clone the private test source repo (engine-test-<id>) instead of the production engine-<id> repo.',
  )
  .action(Underpost.start.callback)
  .description('Initiates application servers, build pipelines, or other defined services based on the deployment ID.');

program
  .command('clone')
  .argument(`<uri>`, 'The URI of the GitHub repository (e.g., "username/repository").')
  .option('--bare', 'Performs a bare clone, downloading only the .git files.')
  .option('--g8', 'Uses the g8 repository extension for cloning.')
  .description('Clones a specified GitHub repository into the current directory.')
  .action(Underpost.repo.clone);

program
  .command('pull')
  .argument('<path>', 'The absolute or relative directory path where the repository is located.')
  .argument(`<uri>`, 'The URI of the GitHub repository (e.g., "username/repository").')
  .description('Pulls the latest changes from a specified GitHub repository.')
  .option('--g8', 'Uses the g8 repository extension for pulling.')
  .action(Underpost.repo.pull);

program
  .command('cmt')
  .argument('[path]', 'The absolute or relative directory path of the repository.')
  .argument(`[commit-type]`, `The type of commit to perform. Options: ${Object.keys(commitData).join(', ')}.`)
  .argument(`[module-tag]`, 'Optional: Sets a specific module tag for the commit.')
  .argument(`[message]`, 'Optional: Provides an additional custom message for the commit.')
  .option(`--log [latest-n]`, 'Shows commit history from the specified number of latest n path commits.')
  .option('--last-msg <latest-n>', 'Displays the last n commit message.')
  .option('--empty', 'Allows committing with empty files.')
  .option('--copy', 'Copies the generated commit message to the clipboard.')
  .option('--info', 'Displays information about available commit types.')
  .option('--diff', 'Shows the current git diff changes.')
  .option('--edit', 'Edit last commit.')
  .option('--deploy-id <deploy-id>', 'Sets the deployment configuration ID for the commit context.')
  .option('--cached', 'Commit staged changes only or context.')
  .option('--hashes <hashes>', 'Comma-separated list of specific file hashes of commits.')
  .option('--extension <extension>', 'specific file extensions of commits.')
  .option('--changelog', 'Print the plain changelog of the last N commits (see --from-n-commit, default 1).')
  .option('--changelog-build', 'Builds a CHANGELOG.md file based on the commit history')
  .option('--changelog-min-version <version>', 'Sets the minimum version limit for --changelog-build (default: 2.85.0)')
  .option(
    '--changelog-no-hash',
    'Excludes commit hashes from the generated changelog entries (used with --changelog-build).',
  )
  .option(
    '--changelog-msg',
    'Print the sanitized, commit-ready changelog message of the last N commits (see --from-n-commit, default 1). Empty when there are no tagged entries.',
  )
  .option('--from-n-commit <n>', 'Number of latest commits to include in --changelog/--changelog-msg (default: 1).')
  .option('--unpush', 'With --log, automatically sets range to unpushed commits ahead of remote.')
  .option('-b', 'Shows the current Git branch name.')
  .option('-p [branch]', 'Shows the reflog for the specified branch.')
  .option('--bc <commit-hash>', 'Shows branches that contain the specified commit.')
  .option(
    '--is-remote-repo <url-repo>',
    'Checks whether a remote Git repository URL is reachable. Prints true or false.',
  )
  .option(
    '--has-changes',
    'Prints "1" if there are staged or unstaged git changes in the repository, empty string otherwise.',
  )
  .option('--remote-url', 'Prints the current git remote URL (origin) in plain text.')
  .option(
    '--switch-repo <url>',
    'Switches the git remote (origin) to <url> and force-pulls the target branch, overwriting the current working tree (discards local commits and tracked changes). Accepts a full URL or "owner/repo".',
  )
  .option('--target-branch <branch>', 'Target branch for --switch-repo (default: master).')
  .description('Manages commits to a GitHub repository, supporting various commit types and options.')
  .action(Underpost.repo.commit);

program
  .command('push')
  .argument('<path>', 'The absolute or relative directory path of the repository.')
  .argument(`<uri>`, 'The URI of the GitHub repository (e.g., "username/repository").')
  .option('-f', 'Forces the push, overwriting the remote repository history.')
  .option('--g8', 'Uses the g8 repository extension for pushing.')
  .description('Pushes committed changes from a local repository to a remote GitHub repository.')
  .action(Underpost.repo.push);

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
    if (deployId === 'root') {
      const underpostRootDeployId = Underpost.env.get('DEPLOY_ID');
      if (underpostRootDeployId) deployId = underpostRootDeployId;
    }
    if (env) process.env.NODE_ENV = env;
    loadConf(deployId, subConf);
  });

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

  .option('--head-scripts <paths>', 'Comma-separated paths to scripts for head section.')
  .option('--body-scripts <paths>', 'Comma-separated paths to scripts for body section.')
  .option('--styles <paths>', 'Comma-separated paths to stylesheets.')

  .option('--favicon <path>', 'Favicon path.')
  .option('--apple-touch-icon <path>', 'Apple touch icon path.')
  .option('--manifest <path>', 'Web manifest path.')

  .option('--head-components <paths>', 'Comma-separated SSR head component paths.')
  .option('--body-components <paths>', 'Comma-separated SSR body component paths.')

  .option('--build-path <build-path>', 'Sets a custom build path for static documents or assets.')
  .option('--env <env>', 'Sets the environment for the static build (e.g., "development", "production").')
  .option('--minify', 'Minify HTML output (default: true for production).')
  .option('--no-minify', 'Disable HTML minification.')

  .option('--config-file <path>', 'Path to JSON configuration file.')
  .option('--generate-config [path]', 'Generate a template configuration file.')

  .option('--lang <lang>', 'HTML lang attribute (default: en).')
  .option('--dir <dir>', 'HTML dir attribute (default: ltr).')
  .option('--dev', 'Sets the development cli context')

  .option(
    '--run-sv [port]',
    'Start a standalone Express static server to preview the static build (default port: 5000).',
  )

  .description(`Manages static build of page, bundles, and documentation with comprehensive customization options.`)
  .action(Underpost.static.callback);

program
  .command('config')
  .argument('operator', `The configuration operation to perform. Options: ${Object.keys(Underpost.env).join(', ')}.`)
  .argument('[key]', 'Optional: The specific configuration key to manage.')
  .argument('[value]', 'Optional: The value to set for the configuration key.')
  .option('--plain', 'Prints the configuration value in plain text.')
  .option('--filter <keyword>', 'Filters the list by matching key or value (only for list operation).')
  .option('--deploy-id <deploy-id>', 'Sets the deployment configuration ID for the operation context.')
  .option('--build', 'Sets the build context for the operation.')
  .option('--copy', 'Copies the configuration value to the clipboard (only for get operation).')
  .description(`Manages Underpost configurations using various operators.`)
  .action((...args) => Underpost.env[args[0]](args[1], args[2], args[3]));

program
  .command('root')
  .description('Displays the root path of the npm installation.')
  .action(() => console.log(getNpmRootPath()));

program
  .command('ip')
  .argument('[ips]', 'Optional args comma-separated list of IP to process.')
  .option('--dhcp', 'Fetches and displays the current Dynamic Host Configuration Protocol server IP address.')
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
  .option('--mac', 'Prints the MAC address of the main network interface.')
  .description('Displays the current public machine IP addresses.')
  .action(Underpost.dns.ipDispatcher);

program
  .command('cluster')
  .argument('[pod-name]', 'Optional: Filters information by a specific pod name.')
  .option('--reset', `Deletes all clusters and prunes all related data and caches.`)
  .option(
    '--reset-mongodb',
    `Performs a hard cleanup of only MongoDB-related resources (StatefulSet, PVCs/PVs, Secrets, ConfigMaps, caches) without restarting the whole node.`,
  )
  .option('--mariadb', 'Initializes the cluster with a MariaDB statefulset.')
  .option('--mysql', 'Initializes the cluster with a MySQL statefulset.')
  .option('--mongodb', 'Initializes the cluster with a MongoDB statefulset.')
  .option('--service-host <host>', 'Set custom host/IP for exposed MongoDB and Valkey clients.')
  .option('--postgresql', 'Initializes the cluster with a PostgreSQL statefulset.')
  .option('--mongodb4', 'Initializes the cluster with a MongoDB 4.4 service.')
  .option('--valkey', 'Initializes the cluster with a Valkey service.')
  .option('--ipfs', 'Initializes the cluster with an ipfs-cluster statefulset.')
  .option('--contour', 'Initializes the cluster with Project Contour base HTTPProxy and Envoy.')
  .option(
    '--node-port',
    'Exposes enabled ready services (e.g. MongoDB 4.4, Valkey) to the host/public network via their NodePort Service manifest.',
  )
  .option(
    '--node-selector <k8s-node-name>',
    'Pins the just-deployed StatefulSet (MongoDB 4.4 / Valkey) to the given Kubernetes node once it is ready (via a kubernetes.io/hostname nodeSelector).',
  )
  .option('--cert-manager', "Initializes the cluster with a Let's Encrypt production ClusterIssuer.")
  .option('--dedicated-gpu', 'Initializes the cluster with dedicated GPU base resources and environment settings.')
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
  .option('--chown', 'Sets the appropriate ownership for Kubernetes kubeconfig files.')
  .option('--k3s', 'Initializes the cluster using K3s (Lightweight Kubernetes).')
  .option('--hosts <hosts>', 'A comma-separated list of cluster hostnames or IP addresses.')
  .option('--remove-volume-host-paths', 'Removes specified volume host paths after execution.')
  .option(
    '--reset-mode <mode>',
    'Reset mode for --reset --k3s: "drain" (stop services, keep K3s installed) or "full" (uninstall + cleanup). Default: "full".',
  )
  .option('--namespace <namespace>', 'Kubernetes namespace for cluster operations (defaults to "default").')
  .option('--replicas <replicas>', 'Sets a custom number of replicas for statefulset deployments.')
  .action(Underpost.cluster.init)
  .description('Manages Kubernetes clusters, defaulting to Kind cluster initialization.');

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
  .option(
    '--self-signed',
    'Use a pre-created self-signed TLS secret (kubernetes.io/tls) instead of cert-manager. ' +
      'The secret must already exist in the namespace with the same name as the host. ' +
      'Enables TLS in the Contour HTTPProxy virtualhost without requiring a production ClusterIssuer.',
  )
  .option('--node <node>', 'Sets optional node for deployment operations.')
  .option(
    '--ssh-key-path <path>',
    'Private key path for node SSH operations. Currently used when shipping a hostPath volume to a remote target node over SSH. Defaults to engine-private/deploy/id_rsa.',
  )
  .option(
    '--build-manifest',
    'Builds Kubernetes YAML manifests, including deployments, services, proxies, and secrets.',
  )
  .option('--replicas <replicas>', 'Sets a custom number of replicas for deployments.')
  .option('--image <image>', 'Sets a custom image for deployments.')
  .option('--versions <deployment-versions>', 'A comma-separated list of custom deployment versions.')
  .option('--traffic <traffic-versions>', 'A comma-separated list of custom deployment traffic weights.')
  .option(
    '--timeout-response <duration>',
    'Sets HTTPProxy per-route response timeout (e.g., "1s", "300ms", "infinity").',
  )
  .option('--timeout-idle <duration>', 'Sets HTTPProxy per-route idle timeout (e.g., "10s", "infinity").')
  .option('--retry-count <count>', 'Sets HTTPProxy per-route retry count (e.g., 3).')
  .option('--retry-per-try-timeout <duration>', 'Sets HTTPProxy retry per-try timeout (e.g., "150ms").')
  .option('--disable-update-deployment', 'Disables updates to deployments.')
  .option('--disable-runtime-probes', 'Omits the internal-status HTTP probes from generated deployment manifests.')
  .option('--tcp-probes', 'Generates legacy TCP socket probes instead of HTTP internal-status probes (migration).')
  .option('--disable-update-proxy', 'Disables updates to proxies.')
  .option('--disable-deployment-proxy', 'Disables proxies of deployments.')
  .option('--disable-update-volume', 'Disables updates to volume mounts during deployment.')
  .option(
    '--status',
    'Retrieves current network traffic data from resource deployments and the host machine network configuration.',
  )
  .option('--kubeadm', 'Enables the kubeadm context for deployment operations.')
  .option('--k3s', 'Enables the k3s context for deployment operations.')
  .option('--kind', 'Enables the kind context for deployment operations.')
  .option('--git-clean', 'Runs git clean on volume mount paths before copying.')
  .option('--disable-update-underpost-config', 'Disables updates to Underpost configuration during deployment.')
  .option('--namespace <namespace>', 'Kubernetes namespace for deployment operations (defaults to "default").')
  .option('--kind-type <kind-type>', 'Specifies the Kind cluster type for deployment operations.')
  .option('--port <port>', 'Sets up port forwarding from local to remote ports.')
  .option(
    '--expose-port <port>',
    'Sets the local:remote port to expose when --expose is active (overrides auto-detected service port).',
  )
  .option(
    '--expose-local-port <port>',
    'Sets a different local port for --expose (e.g. 80) while keeping the remote service port. Useful for /etc/hosts local access without specifying a port in the browser.',
  )
  .option(
    '--local-proxy',
    'Forward all service TCP ports locally and start the Node.js path-routing proxy. Enables full path-based routing (e.g. /wp alongside /) without needing --expose-local-port. Requires --expose.',
  )
  .option('--cmd <cmd>', 'Custom initialization command for deployment (comma-separated commands).')
  .option(
    '--skip-full-build',
    'Skip client bundle rebuild; container will pull pre-built bundle via pull-bundle instead.',
  )
  .option(
    '--pull-bundle',
    'Explicitly pull the pre-built client bundle from Cloudinary inside the container. Use together with --skip-full-build.',
  )
  .option(
    '--image-pull-policy <policy>',
    'Override container imagePullPolicy in the generated deployment manifest (Always, IfNotPresent, Never). Defaults to Never for localhost/ images and IfNotPresent otherwise.',
  )
  .option(
    '--tls',
    'Enables TLS for the local proxy started by --expose --local-proxy. ' +
      'The proxy will serve HTTPS on port 443 using self-signed certificates resolved from the local SSL store. ' +
      'Use together with --expose and --local-proxy.',
  )
  .description('Manages application deployments, defaulting to deploying development pods.')
  .action(Underpost.deploy.callback);

program
  .command('secret')
  .argument('<platform>', `The secret management platform. Options: ${Object.keys(Underpost.secret).join(', ')}.`)
  .option('--init', 'Initializes the secrets platform environment.')
  .option('--create-from-file <path-env-file>', 'Creates secrets from a specified environment file.')
  .option('--create-from-env', 'Creates secrets from container environment variables (envFrom: secretRef).')
  .option('--global-clean', 'Removes all filesystem traces of secrets (engine-private, .env, conf cache).')
  .option('--list', 'Lists all available secrets for the platform.')
  .description(`Manages secrets for various platforms.`)
  .action((...args) => {
    if (args[1].globalClean) return Underpost.secret.globalSecretClean();
    if (args[1].createFromFile) return Underpost.secret[args[0]].createFromEnvFile(args[1].createFromFile);
    if (args[1].createFromEnv) return Underpost.secret[args[0]].createFromContainerEnv();
    if (args[1].list) return Underpost.secret[args[0]].list();
    if (args[1].init) return Underpost.secret[args[0]].init();
  });

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
  .option('--image-out-path [image-out-path]', 'Sets the output path for the tar image archive.')
  .option('--dockerfile-name [dockerfile-name]', 'Sets a custom name for the Dockerfile.')
  .option('--podman-save', 'Exports the built image as a tar file using Podman.')
  .option('--pull-base', 'Pulls the base image prerequisites (rockylinux:9) on the host; combine with --build.')
  .option('--spec', 'Get current cached list of container images used by all pods')
  .option('--namespace <namespace>', 'Kubernetes namespace for image operations (defaults to "default").')
  .option('--kind', 'Set kind cluster env image context management.')
  .option('--kubeadm', 'Set kubeadm cluster env image context management.')
  .option('--k3s', 'Set k3s cluster env image context management.')
  .option('--docker-compose', 'Load the built image tar into the local Docker store for Docker Compose availability.')
  .option('--node-name', 'Set node name for kubeadm or k3s cluster env image context management.')
  .option('--reset', 'Performs a build without using the cache.')
  .option('--dev', 'Use development mode.')
  .option('--pull-dockerhub <dockerhub-image>', 'Sets a custom Docker Hub image for base image pulls.')
  .option(
    '--import-tar <tar-path>',
    'Load a pre-built image tar archive (e.g. ./image-v1.0.0.tar) into the enabled target(s) without building. Combine with --kind, --kubeadm, --k3s and/or --docker-compose; the archive is loaded into each enabled one.',
  )
  .description('Manages Docker images, including building, saving, and loading into Kubernetes clusters.')
  .action(async (options) => {
    if (options.rm) Underpost.image.rm({ ...options, imageName: options.rm });
    if (options.ls) Underpost.image.list({ ...options, log: true });
    if (options.pullBase) Underpost.image.pullBaseImages(options);
    if (options.build) Underpost.image.build(options);
    if (options.importTar) Underpost.image.importTar(options);
    if (options.pullDockerhub)
      Underpost.image.pullDockerHubImage({ ...options, dockerhubImage: options.pullDockerhub });
  });

program
  .command('install')
  .description('Quickly imports Underpost npm dependencies by copying them.')
  .action(() => {
    fs.copySync(`${underpostRootPath}/node_modules`, './node_modules');
  });

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
  .option(
    '--clean-fs-collection',
    'Cleans orphaned File documents from collections that are not referenced by any models.',
  )
  .option(
    '--clean-fs-dry-run',
    'Dry run mode - shows what would be deleted without actually deleting (use with --clean-fs-collection).',
  )
  .option('--dev', 'Sets the development cli context')
  .option('--kubeadm', 'Enables the kubeadm context for database operations.')
  .option('--kind', 'Enables the kind context for database operations.')
  .option('--k3s', 'Enables the k3s context for database operations.')
  .option('--repo-backup', 'Backs up repositories (git commit+push) inside deployment pods via kubectl exec.')
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
  .option('--dev', 'Sets the development cli context')
  .description('Manages cluster metadata operations, including import and export.')
  .action(Underpost.db.clusterMetadataBackupCallback);

program
  .command('cron')
  .argument('[deploy-list]', 'A comma-separated list of deployment IDs (e.g., "default-a,default-b").')
  .argument(
    '[job-list]',
    `A comma-separated list of job IDs. Options: ${Underpost.cron.getJobsIDs()}. Defaults to all available jobs.`,
  )
  .option('--generate-k8s-cronjobs', 'Generates Kubernetes CronJob YAML manifests from cron configuration.')
  .option('--apply', 'Applies generated K8s CronJob manifests to the cluster via kubectl.')
  .option(
    '--setup-start [deploy-id]',
    'Updates deploy-id package.json start script and generates+applies its K8s CronJob manifests.',
  )
  .option('--namespace <namespace>', 'Kubernetes namespace for the CronJob resources (default: "default").')
  .option('--image <image>', 'Custom container image for the CronJob pods.')
  .option('--git', 'Pass --git flag to cron job execution.')
  .option('--cmd <cmd>', 'Optional pre-script commands to run before cron execution.')
  .option('--dev', 'Use local ./ base path instead of global underpost installation.')
  .option('--k3s', 'Use k3s cluster context (apply directly on host).')
  .option('--kind', 'Use kind cluster context (apply via kind-worker container).')
  .option('--kubeadm', 'Use kubeadm cluster context (apply directly on host).')
  .option('--dry-run', 'Preview cron jobs without executing them.')
  .option(
    '--create-job-now',
    'After applying manifests, immediately create a Job from each CronJob (requires --apply).',
  )
  .description('Manages cron jobs: execute jobs directly or generate and apply K8s CronJob manifests.')
  .action(Underpost.cron.callback);

program
  .command('fs')
  .argument('[path]', 'The absolute or relative directory path for file operations.')
  .option('--rm', 'Removes the specified file.')
  .option('--git', 'Displays current Git changes related to file storage.')
  .option('--recursive', 'Uploads files recursively from the specified path.')
  .option('--deploy-id <deploy-id>', 'Specifies the deployment configuration ID for file operations.')
  .option('--pull', 'Downloads the specified file.')
  .option('--omit-unzip', 'With --pull, keeps the downloaded .zip file and skips extraction.')
  .option('--force', 'Forces the action, overriding any warnings or conflicts.')
  .option('--storage-file-path <storage-file-path>', 'Specifies a custom file storage path.')
  .description('Manages file storage, defaulting to file upload operations.')
  .action(Underpost.fs.callback);

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
  .option('--timeout-response <duration>', 'Sets HTTPProxy per-route response timeout (e.g., "5s").')
  .option('--timeout-idle <duration>', 'Sets HTTPProxy per-route idle timeout (e.g., "10s", "infinity").')
  .option('--retry-count <count>', 'Sets HTTPProxy per-route retry count (e.g., 3).')
  .option('--retry-per-try-timeout <duration>', 'Sets HTTPProxy retry per-try timeout (e.g., "150ms").')
  .option('--disable-private-conf-update', 'Disables updates to private configuration during execution.')
  .option('--versions <deployment-versions>', 'Specifies the deployment versions to monitor. eg. "blue,green", "green"')
  .option('--ready-deployment', 'Run in ready deployment monitor mode.')
  .option('--promote', 'Promotes the deployment after monitoring.')
  .description('Manages health server monitoring for specified deployments.')
  .action(Underpost.monitor.callback);

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
  .description('Manages SSH credentials and sessions for remote access to cluster nodes or services.')
  .action(Underpost.ssh.callback);

program
  .command('run')
  .argument('<runner-id>', `The runner ID to run. Options: ${Underpost.run.RUNNERS}.`)
  .argument('[path]', 'The input value, identifier, or path for the operation.')
  .option('--cmd <command-list>', 'Comma-separated list of commands to execute.')
  .option('--args <args-array>', 'Array of arguments to pass to the command.')
  .option('--dev', 'Sets the development context environment for the script.')
  .option('--build', 'Set builder context runner')
  .option('--replicas <replicas>', 'Sets a custom number of replicas for deployment.')
  .option('--pod-name <pod-name>', 'Optional: Specifies the pod name for execution.')
  .option('--node-name <node-name>', 'Optional: Specifies the node name for execution.')
  .option(
    '--ssh-key-path <path>',
    'Optional: Private key path for node SSH operations, forwarded to volume shipping over SSH. Defaults to engine-private/deploy/id_rsa.',
  )
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
  .option('--cmd-cron-jobs <cmd-cron-jobs>', 'Pre-script commands to run before cron job execution.')
  .option(
    '--deploy-id-cron-jobs <deploy-id-cron-jobs>',
    'Specifies deployment IDs to synchronize cron jobs with during execution.',
  )
  .option('--timezone <timezone>', 'Sets the timezone for the runner execution.')
  .option('--kubeadm', 'Sets the kubeadm cluster context for the runner execution.')
  .option('--k3s', 'Sets the k3s cluster context for the runner execution.')
  .option('--kind', 'Sets the kind cluster context for the runner execution.')
  .option('--traffic <traffic>', 'Blue/green traffic colour to bake into generated manifests (default: blue).')
  .option('--git-clean', 'Runs git clean on volume mount paths before copying.')
  .option('--deploy-id <deploy-id>', 'Sets deploy id context for the runner execution.')
  .option('--user <user>', 'Sets user context for the runner execution.')
  .option('--hosts <hosts>', 'Comma-separated list of hosts for the runner execution.')
  .option('--instance-id <instance-id>', 'Sets instance id context for the runner execution.')
  .option('--pid <process-id>', 'Sets process id context for the runner execution.')
  .option(
    '--timeout-response <duration>',
    'Sets HTTPProxy per-route response timeout (e.g., "1s", "300ms", "infinity").',
  )
  .option('--timeout-idle <duration>', 'Sets HTTPProxy per-route idle timeout (e.g., "10s", "infinity").')
  .option('--retry-count <count>', 'Sets HTTPProxy per-route retry count (e.g., 3).')
  .option('--retry-per-try-timeout <duration>', 'Sets HTTPProxy retry per-try timeout (e.g., "150ms").')
  .option('--disable-private-conf-update', 'Disables updates to private configuration during execution.')
  .option('--logs', 'Streams logs during the runner execution.')
  .option('--monitor-status <status>', 'Sets the status to monitor for pod/resource (default: "Running").')
  .option(
    '--monitor-status-kind-type <kind-type>',
    'Sets the Kubernetes resource kind type to monitor (default: "pods").',
  )
  .option(
    '--monitor-status-delta-ms <milliseconds>',
    'Sets the polling interval in milliseconds for status monitoring (default: 1000).',
  )
  .option(
    '--monitor-status-max-attempts <attempts>',
    'Sets the maximum number of status check attempts (default: 600).',
  )
  .option('--dry-run', 'Preview operations without executing them.')
  .option(
    '--from-n-commit <n>',
    'Number of commits back to use for message propagation in template-deploy (default: 1, last commit only).',
  )
  .option(
    '--create-job-now',
    'After applying cron manifests, immediately create a Job from each CronJob (forwarded to cron runner).',
  )
  .option(
    '--host-aliases <host-aliases>',
    'Adds entries to the Pod /etc/hosts via hostAliases. ' +
      'Format: semicolon-separated entries of "ip=hostname1,hostname2" ' +
      '(e.g., "127.0.0.1=foo.local,bar.local;10.1.2.3=foo.remote,bar.remote").',
  )
  .option('--copy', 'Copies the runner output to the clipboard (supported by: generate-pass, template-deploy-local).')
  .option(
    '--skip-full-build',
    'Skip client bundle rebuild; triggers pull-bundle in container startup (supported by: sync, template-deploy).',
  )
  .option(
    '--pull-bundle',
    'Explicitly download the pre-built client bundle from Cloudinary inside the container (supported by: sync, template-deploy). Use together with --skip-full-build.',
  )
  .option('--remove', 'Remove/teardown resources')
  .option(
    '--test',
    'Enables test/generic-purpose mode for the runner (e.g. use self-signed TLS instead of cert-manager).',
  )
  .description('Runs specified scripts using various runners.')
  .action(Underpost.run.callback);

program
  .command('docker-compose')
  .argument('[target]', 'Optional service name for --logs, --shell, --restart, or --build.')
  .option('--install', 'Install Docker Engine and the Compose v2 plugin on RHEL/Rocky hosts.')
  .option(
    '--reset',
    'Comprehensive teardown (equivalent to cluster --reset): removes all stack containers, the network, named volumes (destroys data), orphans, and generated artifacts.',
  )
  .option('--force', 'Force reinstall (--install), remove volumes (--down), or also drop the env-file (--reset).')
  .option(
    '--deploy-id <deploy-id>',
    "Deployment to run as the app container (default: dd-default). 'dd-default' self-bootstraps a fresh engine; any other id runs the standard 'underpost start' command (mirrors src/cli/deploy.js).",
  )
  .option(
    '--docker-compose-id <docker-compose-id>',
    'Selects a canonical custom-workflow stack at engine-private/conf/<deploy-id>/docker-compose/<docker-compose-id>/ ' +
      '(docker-compose.yml + compose.env + nginx.conf, used as-is; nginx/env generation is skipped). ' +
      'e.g. --deploy-id dd-cyberia --docker-compose-id cyberia for the Cyberia MMO ecosystem.',
  )
  .option('--env <env>', 'Deployment environment for non-default deploy ids (default: development).')
  .option('--generate', 'Render dynamic supporting files (nginx router config, env-file, app-command override).')
  .option('--up', 'Start the full stack detached (regenerates config first).')
  .option('--down', 'Stop and remove containers (and orphans).')
  .option('--volumes', 'With --down, also remove named volumes (destroys persisted data).')
  .option('--restart', 'Restart services (optionally a single [target]).')
  .option('--build', 'With --up rebuild images; alone, rebuilds images with --no-cache.')
  .option('--pull', 'Pull upstream images for all services.')
  .option('--logs', 'Follow logs for all services (optionally a single [target]).')
  .option('--status', 'Show a formatted status table of services.')
  .option('--shell', 'Open an interactive shell in [target] (default: app).')
  .option('--exec <subcommand>', 'General-purpose passthrough docker compose subcommand.')
  .option('--compose-file <path>', 'Path to the compose file (default: docker-compose.yml).')
  .option('--env-file <path>', 'Path to the compose env-file (default: docker/compose.env).')
  .option('--nginx-conf <path>', 'Path to the generated nginx config (default: docker/nginx/default.conf).')
  .description('General-purpose Docker Compose development pipeline (mirrors the Kubernetes dev stack).')
  .action(Underpost.dockerCompose.callback);

program
  .command('lxd')
  .argument(
    '[vm-id]',
    'VM identifier shared by current-VM flags like --vm-create, --vm-delete, --vm-init, --vm-info, and --vm-test.',
  )
  .option('--init', 'Initializes LXD on the current machine via preseed.')
  .option(
    '--reset',
    'Host-safe reset: removes proxy devices, stops/deletes VMs, drops admin-profile and lxdbr0. Does NOT touch the LXD snap or storage pools.',
  )
  .option(
    '--purge',
    'DESTRUCTIVE: gracefully shuts down the LXD daemon (60s timeout), then removes the LXD snap. Combine with --reset to wipe per-VM state first. Safe replacement for the prior aggressive teardown.',
  )
  .option(
    '--shutdown',
    'Pre-host-reboot procedure: gracefully stops every VM and the LXD daemon. Run BEFORE any reboot/poweroff to keep the host bootable.',
  )
  .option(
    '--restore',
    'Symmetric to --shutdown: starts the LXD daemon, waits for it to be responsive, then starts every VM. VMs created via admin-profile have boot.autostart=false, so this is the explicit "bring the lab back up" command.',
  )
  .option('--install', 'Installs the LXD snap.')
  .option('--dev', 'Use local paths instead of the global npm installation.')
  .option('--create-virtual-network', 'Creates the lxdbr0 bridge network.')
  .option('--ipv4-address <cidr>', 'IPv4 address/CIDR for the lxdbr0 bridge network (default: "10.250.250.1/24").')
  .option('--create-admin-profile', 'Creates the admin-profile for VM management.')
  .option('--control', 'Initialize the target VM as a K3s control plane node.')
  .option('--worker', 'Initialize the target VM as a K3s worker node.')
  .option('--vm-create', 'Copy the LXC launch command for the command argument [vm-id] to the clipboard.')
  .option(
    '--vm-delete',
    'SAFELY stop and delete the command argument [vm-id] (removes proxy devices first, then stops, then deletes). Safe to re-run.',
  )
  .option(
    '--vm-init',
    'Bring the command argument [vm-id] up as a K3s node end-to-end: OS base setup, mirror /home/dd/engine into the VM, then K3s role install via the local engine (use with --control or --worker).',
  )
  .option('--vm-info', 'Display full configuration and status for the command argument [vm-id].')
  .option('--vm-test', 'Run connectivity and health checks on the command argument [vm-id].')
  .option(
    '--vm-sync-engine',
    'Re-copy the host engine source into the command argument [vm-id], overriding whatever is currently there (equivalent to the engine-bootstrap step of --vm-init in isolation).',
  )
  .option('--root-size <gb-size>', 'Root disk size in GiB for --vm-create (default: 32).')
  .option(
    '--join-node <nodes>',
    'Join a K3s worker to a control plane. Standalone format: "workerName,controlName". ' +
      'When used with --vm-init --worker, provide just the control node name for auto-join.',
  )
  .option('--expose <vm-name:ports>', 'Proxy host ports to a VM (e.g., "k3s-control:80,443").')
  .option(
    '--node-port <port>',
    'Customizes the VM-side (connect) port for --expose, so the host listens on the given port but proxies to this NodePort inside the VM (e.g. expose host 27017 -> VM NodePort 32017).',
  )
  .option('--delete-expose <vm-name:ports>', 'Remove proxied ports from a VM (e.g., "k3s-control:80,443").')
  .option(
    '--copy',
    'For two-phase flows that surface a command for the user to execute (e.g. --create-admin-profile phase 1), copy the command to the clipboard instead of printing it to the terminal.',
  )
  .option('--namespace <namespace>', 'Kubernetes namespace context (defaults to "default").')
  .option(
    '--maas-project <project>',
    'LXD project managed by MAAS (e.g. "k3s-cluster"). When set, all lxc commands target this project so MAAS enumerates the VMs in its machines UI.',
  )
  .option(
    '--move-to-project',
    'Stop the [vm-id] VM in the default project, move it to --maas-project, then start it so MAAS picks it up. Requires --maas-project.',
  )
  .description('Manages LXD virtual machines as K3s nodes (control plane or workers).')
  .action((vmId, options) => Underpost.lxd.callback(vmId, options));

program
  .command('baremetal [workflow-id]')
  .option('--ip-address <ip-address>', 'The IP address of the control server or the local machine.')
  .option('--hostname <hostname>', 'The hostname of the target baremetal machine.')
  .option('--ip-file-server <ip-file-server>', 'The IP address of the file server (NFS/TFTP).')
  .option('--ip-config <ip-config>', 'IP configuration string for the baremetal machine.')
  .option('--netmask <netmask>', 'Netmask of network.')
  .option('--dns-server <dns-server>', 'DNS server IP address.')
  .option('--control-server-install', 'Installs the baremetal control server.')
  .option('--control-server-uninstall', 'Uninstalls the baremetal control server.')
  .option('--control-server-restart', 'Restarts the baremetal control server.')
  .option('--control-server-db-install', 'Installs up the database for the baremetal control server.')
  .option('--control-server-db-uninstall', 'Uninstalls the database for the baremetal control server.')
  .option('--create-machine', 'Creates a new baremetal machine entry in the database.')
  .option(
    '--mac <mac>',
    'Specifies the MAC address for baremetal machine operations. Use "random" for random MAC, "hardware" to use device\'s actual MAC (no spoofing), or specify a MAC address.',
  )
  .option('--ipxe', 'Chainloads iPXE to normalize identity before commissioning.')
  .option('--ipxe-rebuild', 'Forces rebuild of iPXE binary with embedded boot script.')
  .option(
    '--ipxe-build-iso <iso-path>',
    'Builds a standalone iPXE ISO with embedded script for the specified workflow ID.',
  )
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
  .option(
    '--install-disk [device]',
    'Explicit target install disk for Rocky deployment (e.g. /dev/nvme0n1). Omit or leave empty to auto-detect the internal disk.',
  )
  .option(
    '--no-auto-install',
    'Disables the ephemeral runtime AUTO_INSTALL fallback (controller must trigger install).',
  )
  .option('--no-remote-install', 'Skips the controller-side remote install orchestration over SSH.')
  .option(
    '--worker',
    'Post-install infra role: join the deployed node as a Kubernetes worker (requires --control <ip>). Without this flag the node is set up as a control-plane.',
  )
  .option('--control <ip>', 'Control-plane IP the worker node joins (used with --worker for kubeadm infra setup).')
  .option(
    '--ssh-key-dir <dir>',
    'Directory holding the SSH key pair used for commissioning/orchestration (expects <dir>/id_rsa and <dir>/id_rsa.pub). Overrides the workflow "sshKeyDir"; defaults to engine-private/deploy. Supports a leading ~.',
  )
  .option(
    '--deploy-id <deploy-id>',
    'Deployment ID whose user key pair is used for SSH (key from engine-private/conf/<deploy-id>/users/<user>/id_rsa). Same user↔deployId↔key convention as the ssh command.',
  )
  .option(
    '--user <user>',
    'SSH user paired with --deploy-id for key resolution and the login user on an existing control-plane (defaults to root). Mirrors the ssh command --user.',
  )
  .option(
    '--engine-repo <url>',
    'Custom engine repo cloned + normalized to /home/dd/engine on the node (default: <GITHUB_USERNAME>/engine).',
  )
  .option('--engine-branch <branch>', 'Branch of the engine repo to clone on the node.')
  .option(
    '--engine-private-repo <url>',
    'Custom private repo cloned + normalized to /home/dd/engine/engine-private on the node (default: <GITHUB_USERNAME>/engine-<id>-private).',
  )
  .option('--engine-private-branch <branch>', 'Branch of the engine-private repo to clone on the node.')
  .option(
    '--bootstrap-http-server-run',
    'Runs a temporary bootstrap HTTP server for generic purposes such as serving iPXE scripts or ISO images during commissioning.',
  )
  .option(
    '--bootstrap-http-server-path <path>',
    'Sets a custom bootstrap HTTP server path for baremetal commissioning.',
  )
  .option(
    '--bootstrap-http-server-port <port>',
    'Sets a custom bootstrap HTTP server port for baremetal commissioning.',
  )
  .option('--iso-url <url>', 'Uses a custom ISO URL for baremetal machine commissioning.')
  .option('--nfs-build', 'Builds an NFS root filesystem for a workflow id config architecture using QEMU emulation.')
  .option('--nfs-mount', 'Mounts the NFS root filesystem for a workflow id config architecture.')
  .option('--nfs-reset', 'Resets the NFS server completely, closing all connections before reloading exports.')
  .option('--nfs-unmount', 'Unmounts the NFS root filesystem for a workflow id config architecture.')
  .option('--nfs-build-server', 'Builds the NFS server for a workflow id config architecture.')
  .option('--nfs-sh', 'Copies QEMU emulation root entrypoint shell command to the clipboard.')
  .option('--cloud-init', 'Sets the kernel parameters and sets the necessary seed users on the HTTP server.')
  .option('--cloud-init-update', 'Updates cloud init for a workflow id config architecture.')
  .option('--ubuntu-tools-build', 'Builds ubuntu tools for chroot environment.')
  .option('--ubuntu-tools-test', 'Tests ubuntu tools in chroot environment.')
  .option('--rocky-tools-build', 'Builds rocky linux tools for chroot environment.')
  .option('--rocky-tools-test', 'Tests rocky linux tools in chroot environment.')
  .option('--bootcmd <bootcmd-list>', 'Comma-separated list of boot commands to execute.')
  .option('--runcmd <runcmd-list>', 'Comma-separated list of run commands to execute.')
  .option(
    '--logs <log-id>',
    `Displays logs for log id: ${[
      'dhcp',
      'dhcp-lease',
      'dhcp-lan',
      'cloud-init',
      'cloud-init-machine',
      'cloud-init-config',
    ]}`,
  )
  .option('--dev', 'Sets the development context environment for baremetal operations.')
  .option('--ls', 'Lists available boot resources and machines.')
  .option(
    '--resume-infra-setup',
    'Skip commissioning, OS install, and all bootstrapping; resume only the SSH-based infra setup (kubeadm join/init) on a node that already has the OS installed and is reachable via SSH.',
  )
  .option(
    '--resume-join',
    'Skip everything except the kubeadm join command. Assumes engine, Node.js, CRI-O, kubelet, and kubeadm are already installed. Only retrieves a fresh join token from the control-plane and runs kubeadm join.',
  )
  .description(
    'Manages baremetal server operations, including installation, database setup, commissioning, and user management.',
  )
  .action(Underpost.baremetal.callback);

program
  .command('release')
  .argument('[version]', 'The new version string to set (e.g., "3.1.4"). Defaults to current version.')
  .option('--build', 'Builds a new version: tests template, bumps versions, rebuilds manifests and configs.')
  .option('--deploy', 'Deploys the release: syncs secrets, commits, and pushes to remote repositories.')
  .option(
    '--ci-push <deploy-id>',
    'Local equivalent of engine-*.ci.yml: builds dd-{deploy-id} and pushes to the engine-{deploy-id} repository. ' +
      'Accepts the suffix (e.g., "cyberia"), "dd-cyberia", or "engine-cyberia".',
  )
  .option(
    '--message <message>',
    'Commit message for --ci-push or --pwa-build (defaults to last commit of the engine repository).',
  )
  .option(
    '--pwa-build',
    'Runs the pwa-microservices-template update flow: always re-clones, syncs engine sources, installs, builds, and pushes.',
  )
  .option(
    '--dry-run',
    'For --build: previews version-bump changes (per-file substitution counts) without writing files or running downstream commands.',
  )
  .option(
    '--mongo-host <host>',
    'For --build: override DB_HOST in the template .env.example for the smoke test (e.g., "192.168.1.82:27017").',
  )
  .option('--mongo-user <user>', 'For --build: override DB_USER in the template .env.example for the smoke test.')
  .option(
    '--mongo-password <password>',
    'For --build: override DB_PASSWORD in the template .env.example for the smoke test.',
  )
  .option(
    '--valkey-host <host>',
    'For --build: override VALKEY_HOST in the template .env.example for the smoke test (e.g., "192.168.1.82").',
  )
  .description('Release orchestrator for building new versions and deploying releases of the Underpost CLI.')
  .action(async (version, options) => {
    if (options.build) return Underpost.release.build(version, options);
    if (options.deploy) return Underpost.release.deploy(version, options);
    if (options.ciPush) return Underpost.release.ci(options.ciPush, options.message, options);
    if (options.pwaBuild) return Underpost.release.pwa(options.message, options);
    console.log(
      'Please specify --build, --deploy, --ci-push, or --pwa-build. Use "underpost release --help" for details.',
    );
  });

export { program };
