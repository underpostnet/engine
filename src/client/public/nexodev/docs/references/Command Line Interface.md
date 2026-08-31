## Underpost CLI

> underpost ci/cd cli v3.3.0

**Usage:** `underpost [options] [command]`

### Global options

| Option                | Description                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-V, --version`       | output the version number                                                                                                                                                                                                                                                                    |
| `--profile <profile>` | Execution profile. One of: LIVE_CLUSTER, HERMETIC_BUILD, OFFLINE_DRY_RUN. LIVE_CLUSTER Full access: cluster and host mutation permitted. HERMETIC_BUILD Build outputs only: no cluster, host or network side effects. OFFLINE_DRY_RUN Nothing executes; every command is reported as intent. |
| `-h, --help`          | display help for command                                                                                                                                                                                                                                                                     |

### Commands

| Command                                       | Description                                                                                                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`new`](#underpost-new)                       | Initializes a new Underpost project, service, or configuration.                                                                                                                                                              |
| [`client`](#underpost-client)                 | Builds client assets, single replicas, and/or syncs environment ports.                                                                                                                                                       |
| [`start`](#underpost-start)                   | Initiates application servers, build pipelines, or other defined services based on the deployment ID.                                                                                                                        |
| [`clone`](#underpost-clone)                   | Clones a specified GitHub repository into the current directory.                                                                                                                                                             |
| [`pull`](#underpost-pull)                     | Pulls the latest changes from a specified GitHub repository.                                                                                                                                                                 |
| [`cmt`](#underpost-cmt)                       | Manages commits to a GitHub repository, supporting various commit types and options.                                                                                                                                         |
| [`push`](#underpost-push)                     | Pushes committed changes from a local repository to a remote GitHub repository.                                                                                                                                              |
| [`static`](#underpost-static)                 | Manages static build of page, bundles, and documentation with comprehensive customization options.                                                                                                                           |
| [`root`](#underpost-root)                     | Displays the root path of the npm installation.                                                                                                                                                                              |
| [`ip`](#underpost-ip)                         | Displays the current public machine IP addresses.                                                                                                                                                                            |
| [`cluster`](#underpost-cluster)               | Manages Kubernetes clusters, defaulting to Kind cluster initialization.                                                                                                                                                      |
| [`deploy`](#underpost-deploy)                 | Manages application deployments, defaulting to deploying development pods.                                                                                                                                                   |
| [`secret`](#underpost-secret)                 | Workload secret store: SOPS/Age encrypted credentials projected as Kubernetes Secrets.                                                                                                                                       |
| [`host`](#underpost-host)                     | Host configuration: the node-level operational environment shared by the cluster.                                                                                                                                            |
| [`app`](#underpost-app)                       | Application environment: one deployment's runtime configuration.                                                                                                                                                             |
| [`state`](#underpost-state)                   | Runtime state: live container execution state, health and metrics, exported off-cluster.                                                                                                                                     |
| [`image`](#underpost-image)                   | Manages Docker images, including building, saving, and loading into Kubernetes clusters.                                                                                                                                     |
| [`install`](#underpost-install)               | Quickly imports Underpost npm dependencies by copying them.                                                                                                                                                                  |
| [`db`](#underpost-db)                         | Manages database operations with support for MariaDB and MongoDB, including import/export, multi-pod targeting, and Git integration.                                                                                         |
| [`metadata`](#underpost-metadata)             | Manages cluster metadata operations, including import and export.                                                                                                                                                            |
| [`cron`](#underpost-cron)                     | Manages cron jobs: execute jobs directly or generate and apply K8s CronJob manifests.                                                                                                                                        |
| [`fs`](#underpost-fs)                         | Manages file storage, defaulting to file upload operations.                                                                                                                                                                  |
| [`monitor`](#underpost-monitor)               | Manages health server monitoring, the cluster observability stack, and host dashboards.                                                                                                                                      |
| [`event`](#underpost-event)                   | Dispatches operational events and provisions the monitoring rules that trigger them.                                                                                                                                         |
| [`ssh`](#underpost-ssh)                       | Manages cluster scoped SSH credentials and sessions for remote access to cluster nodes or services. Users are registered in engine-private/deploy/conf.users.json and keys are stored in engine-private/deploy/users/<user>. |
| [`wireguard`](#underpost-wireguard)           | Manages the WireGuard L3 hub-and-spoke transport and the HAProxy edge gateway in front of it.                                                                                                                                |
| [`haproxy`](#underpost-haproxy)               | Manages the HAProxy edge gateway over the WireGuard transport (same subsystem as `underpost wireguard`).                                                                                                                     |
| [`vultr`](#underpost-vultr)                   | Meters the edge VPS bandwidth against its Vultr plan quota and blocks egress before overage accrues.                                                                                                                         |
| [`run`](#underpost-run)                       | Runs specified scripts using various runners.                                                                                                                                                                                |
| [`test`](#underpost-test)                     | Runs the test tiers locally, inside deployment pods, or as a cluster Job with Allure reporting.                                                                                                                              |
| [`docker-compose`](#underpost-docker-compose) | General-purpose Docker Compose development pipeline (mirrors the Kubernetes dev stack).                                                                                                                                      |
| [`lxd`](#underpost-lxd)                       | Manages LXD virtual machines as K3s nodes (control plane or workers).                                                                                                                                                        |
| [`baremetal`](#underpost-baremetal)           | Manages baremetal server operations, including installation, database setup, commissioning, and user management.                                                                                                             |
| [`package`](#underpost-package)               | Generates the package manifests a deploy id owns, from the engine manifest and the deploy's product catalog, and installs the dependencies that catalog pins.                                                                |
| [`release`](#underpost-release)               | Release orchestrator for building new versions and deploying releases of the Underpost CLI.                                                                                                                                  |

## Command reference

### underpost new

Initializes a new Underpost project, service, or configuration.

**Usage:** `underpost new [options] [app-name]`

#### Arguments

| Argument   | Description                  |
| ---------- | ---------------------------- |
| `app-name` | The name of the new project. |

#### Options

| Option                             | Description                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--deploy-id <deploy-id>`          | Create deploy ID conf env files                                                                                     |
| `--sub-conf <sub-conf>`            | Create sub conf env files                                                                                           |
| `--cluster`                        | Initialize the base cluster deploy folder engine-private/deploy from ./conf.js                                      |
| `--build-repos`                    | Create deploy ID repositories                                                                                       |
| `--build`                          | Build the deployment to pwa-microservices-template (requires --deploy-id)                                           |
| `--clean-template`                 | Clean the build directory (pwa-microservices-template)                                                              |
| `--sync-conf`                      | Sync configuration to private repositories (requires --deploy-id)                                                   |
| `--sync-start`                     | Sync start scripts in deploy ID package.json with root package.json (use 'dd' as --deploy-id to sync all dd.routes) |
| `--purge`                          | Remove deploy ID conf and all related repositories (requires --deploy-id)                                           |
| `--dev`                            | Sets the development cli context                                                                                    |
| `--default-conf`                   | Create default deploy ID conf env files                                                                             |
| `--conf-workflow-id <workflow-id>` | Set custom configuration workflow ID for conf generation                                                            |
| `-h, --help`                       | display help for command                                                                                            |

---

### underpost client

Builds client assets, single replicas, and/or syncs environment ports.

**Usage:** `underpost client [options] [deploy-id] [sub-conf] [host] [path]`

#### Arguments

| Argument    | Description                                              |
| ----------- | -------------------------------------------------------- |
| `deploy-id` | The deployment ID to build. (default: "dd-default")      |
| `sub-conf`  | The sub-configuration for the build. (default: "")       |
| `host`      | Comma-separated hosts to filter the build. (default: "") |
| `path`      | Comma-separated paths to filter the build. (default: "") |

#### Options

| Option                       | Description                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `--sync-env-port`            | Sync environment port assignments across all deploy IDs                                                  |
| `--single-replica`           | Build single replica folders instead of full client                                                      |
| `--build-zip`                | Create zip files of the builds                                                                           |
| `--split <mb>`               | Split generated zip files into parts of the specified size in MB                                         |
| `--unzip <build-prefix>`     | Extract a built client zip or split zip parts using the given build prefix                               |
| `--merge-zip <build-prefix>` | Merge split ZIP parts back into a single ZIP file for the given build prefix                             |
| `--lite-build`               | Skip full build (default is full build)                                                                  |
| `--icons-build`              | Build icons                                                                                              |
| `--ssr`                      | Rebuild only SSR views defined in conf.ssr.json, leaving client assets untouched                         |
| `--env <env>`                | Target environment for the build (e.g. "production", "development"). Falls back to --dev, then NODE_ENV. |
| `--dev`                      | Sets the development cli context (shorthand for --env development).                                      |
| `-h, --help`                 | display help for command                                                                                 |

---

### underpost start

Initiates application servers, build pipelines, or other defined services based on the deployment ID.

**Usage:** `underpost start [options] <deploy-id> [env]`

#### Arguments

| Argument    | Description                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `deploy-id` | The unique identifier for the deployment configuration.                                            |
| `env`       | Optional: The environment to start (e.g., "development", "production"). Defaults to "development". |

#### Options

| Option                        | Description                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--run`                       | Starts application servers and monitors their health.                                                                                                        |
| `--build`                     | Triggers the client-side application build process.                                                                                                          |
| `--underpost-quickly-install` | Uses Underpost Quickly Install for dependency installation.                                                                                                  |
| `--skip-pull-repo-base`       | Skips cloning the engine source repository, uses current workspace code directly.                                                                            |
| `--skip-pull-private-repo`    | Skips cloning the private configuration repository, uses the engine-private already in the workspace.                                                        |
| `--skip-full-build`           | Skips the full client bundle build during deployment.                                                                                                        |
| `--pull-bundle`               | Downloads the pre-built client bundle from Cloudinary via pull-bundle before starting. Use together with --skip-full-build to skip the local build entirely. |
| `--private-test-repo`         | During --build, clone the private test source repo (engine-test-<id>) instead of the production engine-<id> repo.                                            |
| `-h, --help`                  | display help for command                                                                                                                                     |

---

### underpost clone

Clones a specified GitHub repository into the current directory.

**Usage:** `underpost clone [options] <uri>`

#### Arguments

| Argument | Description                                                     |
| -------- | --------------------------------------------------------------- |
| `uri`    | The URI of the GitHub repository (e.g., "username/repository"). |

#### Options

| Option       | Description                                             |
| ------------ | ------------------------------------------------------- |
| `--bare`     | Performs a bare clone, downloading only the .git files. |
| `--g8`       | Uses the g8 repository extension for cloning.           |
| `-h, --help` | display help for command                                |

---

### underpost pull

Pulls the latest changes from a specified GitHub repository.

**Usage:** `underpost pull [options] <path> <uri>`

#### Arguments

| Argument | Description                                                              |
| -------- | ------------------------------------------------------------------------ |
| `path`   | The absolute or relative directory path where the repository is located. |
| `uri`    | The URI of the GitHub repository (e.g., "username/repository").          |

#### Options

| Option       | Description                                   |
| ------------ | --------------------------------------------- |
| `--g8`       | Uses the g8 repository extension for pulling. |
| `-h, --help` | display help for command                      |

---

### underpost cmt

Manages commits to a GitHub repository, supporting various commit types and options.

**Usage:** `underpost cmt [options] [path] [commit-type] [module-tag] [message]`

#### Arguments

| Argument      | Description                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `path`        | The absolute or relative directory path of the repository.                                                                         |
| `commit-type` | The type of commit to perform. Options: feat, fix, docs, style, refactor, perf, ci, cd, infra, build, test, chore, revert, backup. |
| `module-tag`  | Optional: Sets a specific module tag for the commit.                                                                               |
| `message`     | Optional: Provides an additional custom message for the commit.                                                                    |

#### Options

| Option                              | Description                                                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--log [latest-n]`                  | Shows commit history from the specified number of latest n path commits.                                                                                                                            |
| `--last-msg <latest-n>`             | Displays the last n commit message.                                                                                                                                                                 |
| `--empty`                           | Allows committing with empty files.                                                                                                                                                                 |
| `--copy`                            | Copies the generated commit message to the clipboard.                                                                                                                                               |
| `--info`                            | Displays information about available commit types.                                                                                                                                                  |
| `--diff`                            | Shows the current git diff changes.                                                                                                                                                                 |
| `--edit`                            | Edit last commit.                                                                                                                                                                                   |
| `--deploy-id <deploy-id>`           | Sets the deployment configuration ID for the commit context.                                                                                                                                        |
| `--cached`                          | Commit staged changes only or context.                                                                                                                                                              |
| `--init-repo [origin]`              | Initialize a git repository at the specified path. Optionally set the git remote origin URL.                                                                                                        |
| `--hashes <hashes>`                 | Comma-separated list of specific file hashes of commits.                                                                                                                                            |
| `--extension <extension>`           | specific file extensions of commits.                                                                                                                                                                |
| `--changelog`                       | Print the plain changelog of the last N commits (see --from-n-commit, default 1).                                                                                                                   |
| `--changelog-build`                 | Builds a CHANGELOG.md from the latest five versions                                                                                                                                                 |
| `--changelog-min-version <version>` | Sets the minimum version limit for --changelog-build (default: 2.85.0)                                                                                                                              |
| `--changelog-no-hash`               | Excludes commit hashes from the generated changelog entries (used with --changelog-build).                                                                                                          |
| `--changelog-msg`                   | Print the sanitized, commit-ready changelog message of the last N commits (see --from-n-commit, default 1). Empty when there are no tagged entries.                                                 |
| `--from-n-commit <n>`               | Number of latest commits to include in --changelog/--changelog-msg (default: 1).                                                                                                                    |
| `--unpush`                          | With --log, automatically sets range to unpushed commits ahead of remote.                                                                                                                           |
| `-b`                                | Shows the current Git branch name.                                                                                                                                                                  |
| `-p [branch]`                       | Shows the reflog for the specified branch.                                                                                                                                                          |
| `--bc <commit-hash>`                | Shows branches that contain the specified commit.                                                                                                                                                   |
| `--is-remote-repo <url-repo>`       | Checks whether a remote Git repository URL is reachable. Prints true or false.                                                                                                                      |
| `--has-changes`                     | Prints "1" if there are staged or unstaged git changes in the repository, empty string otherwise.                                                                                                   |
| `--remote-url`                      | Prints the current git remote URL (origin) in plain text.                                                                                                                                           |
| `--switch-repo <url>`               | Switches the git remote (origin) to <url> and force-pulls the target branch, overwriting the current working tree (discards local commits and tracked changes). Accepts a full URL or "owner/repo". |
| `--target-branch <branch>`          | Target branch for --switch-repo (default: remote default branch).                                                                                                                                   |
| `-h, --help`                        | display help for command                                                                                                                                                                            |

---

### underpost push

Pushes committed changes from a local repository to a remote GitHub repository.

**Usage:** `underpost push [options] <path> <uri>`

#### Arguments

| Argument | Description                                                     |
| -------- | --------------------------------------------------------------- |
| `path`   | The absolute or relative directory path of the repository.      |
| `uri`    | The URI of the GitHub repository (e.g., "username/repository"). |

#### Options

| Option       | Description                                                 |
| ------------ | ----------------------------------------------------------- |
| `-f`         | Forces the push, overwriting the remote repository history. |
| `--g8`       | Uses the g8 repository extension for pushing.               |
| `-h, --help` | display help for command                                    |

---

### underpost static

Manages static build of page, bundles, and documentation with comprehensive customization options.

**Usage:** `underpost static [options]`

#### Options

| Option                        | Description                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `--page <ssr-component-path>` | Build custom static pages.                                                                 |
| `--title <title>`             | Sets a custom title for the static page (deprecated: use --config-file).                   |
| `--output-path <output-path>` | Sets the output path for the generated static page.                                        |
| `--description <description>` | Page description for SEO.                                                                  |
| `--keywords <keywords>`       | Comma-separated keywords for SEO.                                                          |
| `--author <author>`           | Page author.                                                                               |
| `--theme-color <color>`       | Theme color for mobile browsers.                                                           |
| `--canonical-url <url>`       | Canonical URL for SEO.                                                                     |
| `--thumbnail <url>`           | Open Graph thumbnail image URL.                                                            |
| `--locale <locale>`           | Page locale (default: en-US).                                                              |
| `--site-name <name>`          | Site name for Open Graph.                                                                  |
| `--head-scripts <paths>`      | Comma-separated paths to scripts for head section.                                         |
| `--body-scripts <paths>`      | Comma-separated paths to scripts for body section.                                         |
| `--styles <paths>`            | Comma-separated paths to stylesheets.                                                      |
| `--favicon <path>`            | Favicon path.                                                                              |
| `--apple-touch-icon <path>`   | Apple touch icon path.                                                                     |
| `--manifest <path>`           | Web manifest path.                                                                         |
| `--head-components <paths>`   | Comma-separated SSR head component paths.                                                  |
| `--body-components <paths>`   | Comma-separated SSR body component paths.                                                  |
| `--build-path <build-path>`   | Sets a custom build path for static documents or assets.                                   |
| `--env <env>`                 | Sets the environment for the static build (e.g., "development", "production").             |
| `--minify`                    | Minify HTML output (default: true for production).                                         |
| `--no-minify`                 | Disable HTML minification.                                                                 |
| `--config-file <path>`        | Path to JSON configuration file.                                                           |
| `--generate-config [path]`    | Generate a template configuration file.                                                    |
| `--lang <lang>`               | HTML lang attribute (default: en).                                                         |
| `--dir <dir>`                 | HTML dir attribute (default: ltr).                                                         |
| `--dev`                       | Sets the development cli context                                                           |
| `--run-sv [port]`             | Start a standalone Express static server to preview the static build (default port: 5000). |
| `-h, --help`                  | display help for command                                                                   |

---

### underpost root

Displays the root path of the npm installation.

**Usage:** `underpost root [options]`

#### Options

| Option       | Description              |
| ------------ | ------------------------ |
| `-h, --help` | display help for command |

---

### underpost ip

Displays the current public machine IP addresses.

**Usage:** `underpost ip [options] [ips]`

#### Arguments

| Argument | Description                                          |
| -------- | ---------------------------------------------------- |
| `ips`    | Optional args comma-separated list of IP to process. |

#### Options

| Option                           | Description                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `--dhcp`                         | Fetches and displays the current Dynamic Host Configuration Protocol server IP address.         |
| `--copy`                         | Copies the IP addresses to the clipboard.                                                       |
| `--ban-ingress-add`              | Adds IP addresses to banned ingress list.                                                       |
| `--ban-ingress-remove`           | Removes IP addresses from banned ingress list.                                                  |
| `--ban-ingress-list`             | Lists all banned ingress IP addresses.                                                          |
| `--ban-ingress-clear`            | Clears all banned ingress IP addresses.                                                         |
| `--ban-egress-add`               | Adds IP addresses to banned egress list.                                                        |
| `--ban-egress-remove`            | Removes IP addresses from banned egress list.                                                   |
| `--ban-egress-list`              | Lists all banned egress IP addresses.                                                           |
| `--ban-egress-clear`             | Clears all banned egress IP addresses.                                                          |
| `--ban-both-add`                 | Adds IP addresses to both banned ingress and egress lists.                                      |
| `--ban-both-remove`              | Removes IP addresses from both banned ingress and egress lists.                                 |
| `--block-all-egress`             | Blocks all outbound traffic from this host (keeps established/related connections).             |
| `--unblock-all-egress`           | Unblocks all outbound traffic and restores default ACCEPT policy.                               |
| `--block-all-ingress`            | Blocks all new inbound traffic to this host (keeps established/related connections).            |
| `--unblock-all-ingress`          | Unblocks all inbound traffic and restores default ACCEPT policy.                                |
| `--block-ingress-port <ports>`   | Blocks new inbound traffic on comma-separated TCP ports, leaving the management path reachable. |
| `--unblock-ingress-port <ports>` | Withdraws the port rules --block-ingress-port installed.                                        |
| `--mac`                          | Prints the MAC address of the main network interface.                                           |
| `-h, --help`                     | display help for command                                                                        |

---

### underpost cluster

Manages Kubernetes clusters, defaulting to Kind cluster initialization.

**Usage:** `underpost cluster [options] [pod-name]`

#### Arguments

| Argument   | Description                                           |
| ---------- | ----------------------------------------------------- |
| `pod-name` | Optional: Filters information by a specific pod name. |

#### Options

| Option                                | Description                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--reset`                             | Deletes all clusters and prunes all related data and caches.                                                                                                                                                                                                                                |
| `--reset-mongodb`                     | Performs a hard cleanup of only MongoDB-related resources (StatefulSet, PVCs/PVs, Secrets, ConfigMaps, caches) without restarting the whole node. Combined with --mongodb it instead wipes the retained hostPath volumes as part of that deploy, so the replica set starts from empty data. |
| `--mariadb`                           | Initializes the cluster with a MariaDB statefulset.                                                                                                                                                                                                                                         |
| `--mysql`                             | Initializes the cluster with a MySQL statefulset.                                                                                                                                                                                                                                           |
| `--mongodb`                           | Initializes the cluster with a MongoDB statefulset.                                                                                                                                                                                                                                         |
| `--service-host <host>`               | Set custom host/IP for exposed MongoDB and Valkey clients.                                                                                                                                                                                                                                  |
| `--postgresql`                        | Initializes the cluster with a PostgreSQL statefulset.                                                                                                                                                                                                                                      |
| `--mongodb4`                          | Initializes the cluster with a MongoDB 4.4 service.                                                                                                                                                                                                                                         |
| `--valkey`                            | Initializes the cluster with a Valkey service.                                                                                                                                                                                                                                              |
| `--ipfs`                              | Initializes the cluster with an ipfs-cluster statefulset.                                                                                                                                                                                                                                   |
| `--contour`                           | Initializes the cluster with Project Contour base HTTPProxy and Envoy.                                                                                                                                                                                                                      |
| `--gateway-api`                       | Initializes the cluster with the Gateway API control plane (CRDs, Envoy Gateway, GatewayClass) used by generated HTTPRoute + QUIC/HTTP3 manifests. With --dev the data plane binds the listener ports on the host network for direct browser access.                                        |
| `--gateway-class <name>`              | GatewayClass name to provision (default "eg").                                                                                                                                                                                                                                              |
| `--ingress-node <node-name>`          | Dedicated node for underpost-ingress when both routing stacks coexist. Workload placement flags do not move it.                                                                                                                                                                             |
| `--node-port`                         | Exposes enabled ready services (e.g. MongoDB 4.4, Valkey) to the host/public network via their NodePort Service manifest.                                                                                                                                                                   |
| `--node-name <k8s-node-name>`         | Pins the just-deployed workload (MongoDB 4.4 / Valkey StatefulSets, the observability Deployments) to the given Kubernetes node once it is ready, via a kubernetes.io/hostname nodeSelector.                                                                                                |
| `--cert-manager`                      | Initializes the cluster with a Let's Encrypt production ClusterIssuer.                                                                                                                                                                                                                      |
| `--dedicated-gpu`                     | Initializes the cluster with dedicated GPU base resources and environment settings.                                                                                                                                                                                                         |
| `--ns-use <ns-name>`                  | Switches the current Kubernetes context to the specified namespace (creates if it doesn't exist).                                                                                                                                                                                           |
| `--kubeadm`                           | Initializes the cluster using kubeadm for control plane management.                                                                                                                                                                                                                         |
| `--pod-network-cidr <cidr>`           | Sets custom pod network CIDR for kubeadm cluster initialization (defaults to "192.168.0.0/16").                                                                                                                                                                                             |
| `--control-plane-endpoint <endpoint>` | Sets custom control plane endpoint for kubeadm cluster initialization (defaults to "localhost:6443").                                                                                                                                                                                       |
| `--grafana`                           | Initializes the cluster with the observability stack (Prometheus, Alertmanager, Blackbox Exporter, Grafana). Equivalent to --prom; both converge the one stack.                                                                                                                             |
| `--prom [hosts]`                      | Initializes the cluster with the observability stack. Scrape targets are derived from each deploy conf.server.json; the optional comma-separated hosts are scraped at /metrics in addition to them.                                                                                         |
| `--dev`                               | Initializes a development-specific cluster configuration.                                                                                                                                                                                                                                   |
| `--list-pods`                         | Displays detailed information about all pods.                                                                                                                                                                                                                                               |
| `--pull-image`                        | Sets an optional associated image to pull during initialization.                                                                                                                                                                                                                            |
| `--init-host`                         | Installs necessary Kubernetes node CLI tools (e.g., kind, kubeadm, docker, podman, helm).                                                                                                                                                                                                   |
| `--uninstall-host`                    | Uninstalls all host components installed by init-host.                                                                                                                                                                                                                                      |
| `--config`                            | Sets the base Kubernetes node configuration.                                                                                                                                                                                                                                                |
| `--chown`                             | Sets the appropriate ownership for Kubernetes kubeconfig files.                                                                                                                                                                                                                             |
| `--k3s`                               | Initializes the cluster using K3s (Lightweight Kubernetes).                                                                                                                                                                                                                                 |
| `--hosts <hosts>`                     | A comma-separated list of cluster hostnames or IP addresses.                                                                                                                                                                                                                                |
| `--remove-volume-host-paths`          | Removes specified volume host paths after execution.                                                                                                                                                                                                                                        |
| `--reset-mode <mode>`                 | Reset mode for --reset --k3s: "drain" (stop services, keep K3s installed) or "full" (uninstall + cleanup). Default: "full".                                                                                                                                                                 |
| `--namespace <namespace>`             | Kubernetes namespace for cluster operations (defaults to "default").                                                                                                                                                                                                                        |
| `--replicas <replicas>`               | Sets a custom number of replicas for statefulset deployments.                                                                                                                                                                                                                               |
| `-h, --help`                          | display help for command                                                                                                                                                                                                                                                                    |

---

### underpost deploy

Manages application deployments, defaulting to deploying development pods.

**Usage:** `underpost deploy [options] [deploy-list] [env]`

#### Arguments

| Argument      | Description                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `deploy-list` | A comma-separated list of deployment IDs (e.g., "default-a,default-b").                                  |
| `env`         | Optional: The environment for deployment (e.g., "development", "production"). Defaults to "development". |

#### Options

| Option                               | Description                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--remove`                           | Deletes specified deployments and their associated services.                                                                                                                                                                                                                                                      |
| `--sync`                             | Synchronizes deployment environment variables, ports, and replica counts.                                                                                                                                                                                                                                         |
| `--info-router`                      | Displays the current router structure and configuration.                                                                                                                                                                                                                                                          |
| `--cert`                             | Resets TLS/SSL certificate secrets for deployments.                                                                                                                                                                                                                                                               |
| `--cert-hosts <hosts>`               | Resets TLS/SSL certificate secrets for specified hosts.                                                                                                                                                                                                                                                           |
| `--self-signed`                      | Use a pre-created self-signed TLS secret (kubernetes.io/tls) instead of cert-manager. The secret must already exist in the namespace with the same name as the host. Enables TLS in the Contour HTTPProxy virtualhost without requiring a production ClusterIssuer.                                               |
| `--node <node>`                      | Sets optional node for deployment operations.                                                                                                                                                                                                                                                                     |
| `--ingress-node <node-name>`         | Explicitly relocates the shared host-network ingress; ordinary --node placement never moves it.                                                                                                                                                                                                                   |
| `--ssh-key-path <path>`              | Private key path for node SSH operations. Currently used when shipping a hostPath volume to a remote target node over SSH. Defaults to engine-private/deploy/id_rsa.                                                                                                                                              |
| `--build-manifest`                   | Builds Kubernetes YAML manifests, including deployments, services, proxies, and secrets.                                                                                                                                                                                                                          |
| `--sync-static`                      | Places the SSR status pages and intercepted contexts in the gateway static utility tree, so the edge serves them instead of the application pods. Prefers the running workload and falls back to this checkout, so it can seed the tree before the deployment exists and refresh it once the deployment is Ready. |
| `--replicas <replicas>`              | Sets a custom number of replicas for deployments.                                                                                                                                                                                                                                                                 |
| `--image <image>`                    | Sets a custom image for deployments.                                                                                                                                                                                                                                                                              |
| `--versions <deployment-versions>`   | A comma-separated list of custom deployment versions.                                                                                                                                                                                                                                                             |
| `--traffic <traffic-versions>`       | A comma-separated list of custom deployment traffic weights.                                                                                                                                                                                                                                                      |
| `--timeout-response <duration>`      | Sets HTTPProxy per-route response timeout (e.g., "1s", "300ms", "infinity").                                                                                                                                                                                                                                      |
| `--timeout-idle <duration>`          | Sets HTTPProxy per-route idle timeout (e.g., "10s", "infinity").                                                                                                                                                                                                                                                  |
| `--retry-count <count>`              | Sets HTTPProxy per-route retry count (e.g., 3).                                                                                                                                                                                                                                                                   |
| `--retry-per-try-timeout <duration>` | Sets HTTPProxy retry per-try timeout (e.g., "150ms").                                                                                                                                                                                                                                                             |
| `--disable-update-deployment`        | Disables updates to deployments.                                                                                                                                                                                                                                                                                  |
| `--disable-runtime-probes`           | Deprecated compatibility flag; readiness probes remain mandatory. Use --tcp-probes for legacy workloads.                                                                                                                                                                                                          |
| `--tcp-probes`                       | Generates legacy TCP socket probes instead of HTTP internal-status probes (migration).                                                                                                                                                                                                                            |
| `--disable-update-proxy`             | Disables updates to proxies.                                                                                                                                                                                                                                                                                      |
| `--disable-deployment-proxy`         | Disables proxies of deployments.                                                                                                                                                                                                                                                                                  |
| `--gateway-api`                      | Routes through the Gateway API stack (Gateway + HTTPRoute) instead of the Contour HTTPProxy. Both manifest sets are always generated; this selects which one is applied.                                                                                                                                          |
| `--gateway-class <name>`             | GatewayClass name for generated Gateway manifests (default "eg").                                                                                                                                                                                                                                                 |
| `--disable-http3`                    | Omits the QUIC/HTTP3 listener config and the Alt-Svc advertisement from Gateway API manifests.                                                                                                                                                                                                                    |
| `--quic-port <port>`                 | UDP port advertised for QUIC/HTTP3 in generated Gateway API manifests (default 443).                                                                                                                                                                                                                              |
| `--disable-update-volume`            | Disables updates to volume mounts during deployment.                                                                                                                                                                                                                                                              |
| `--kubeadm`                          | Enables the kubeadm context for deployment operations.                                                                                                                                                                                                                                                            |
| `--k3s`                              | Enables the k3s context for deployment operations.                                                                                                                                                                                                                                                                |
| `--kind`                             | Enables the kind context for deployment operations.                                                                                                                                                                                                                                                               |
| `--git-clean`                        | Runs git clean on volume mount paths before copying.                                                                                                                                                                                                                                                              |
| `--disable-update-underpost-config`  | Disables updates to Underpost configuration during deployment.                                                                                                                                                                                                                                                    |
| `--namespace <namespace>`            | Kubernetes namespace for deployment operations (defaults to "default").                                                                                                                                                                                                                                           |
| `--cmd <cmd>`                        | Custom initialization command for deployment (comma-separated commands).                                                                                                                                                                                                                                          |
| `--skip-full-build`                  | Skip client bundle rebuild; container will pull pre-built bundle via pull-bundle instead.                                                                                                                                                                                                                         |
| `--pull-bundle`                      | Explicitly pull the pre-built client bundle from Cloudinary inside the container. Use together with --skip-full-build.                                                                                                                                                                                            |
| `--image-pull-policy <policy>`       | Override container imagePullPolicy in the generated deployment manifest (Always, IfNotPresent, Never). Defaults to Never for localhost/ images and IfNotPresent otherwise.                                                                                                                                        |
| `-h, --help`                         | display help for command                                                                                                                                                                                                                                                                                          |

---

### underpost secret

Workload secret store: SOPS/Age encrypted credentials projected as Kubernetes Secrets.

**Usage:** `underpost secret [options] <action>`

#### Arguments

| Argument | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action` | Action to run. One of: setup, load, publish, apply, status, rotate, clean. setup Onboards the domain: provisions whatever it needs, then converges it. Idempotent. load Loads the durable source into the local runtime environment. publish Writes the local runtime environment into the durable source. apply Projects the durable source into the live cluster. status Read-only report of the domain: sources, keys, and drift from the cluster. rotate Replaces the current projection or encryption identity. clean Withdraws the domain traces from the local filesystem. |

#### Options

| Option                    | Description                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--env <env>`             | Target environment: development \| production \| test (default: production).                              |
| `--namespace <namespace>` | Kubernetes namespace to act on (default: default).                                                        |
| `--args <key=value-list>` | Comma-separated domain parameters, e.g. `names=postgres-secret`, `recipient=age1...`, `sub-conf=nexodev`. |
| `--dry-run`               | Reports what the action would change without changing anything.                                           |
| `--force`                 | Confirms the irreversible variant of the action.                                                          |
| `-h, --help`              | display help for command                                                                                  |

---

### underpost host

Host configuration: the node-level operational environment shared by the cluster.

**Usage:** `underpost host [options] <action> [key] [value]`

#### Arguments

| Argument | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action` | Action to run. One of: setup, load, publish, apply, status, rotate, clean, get, set, delete, list. setup Onboards the domain: provisions whatever it needs, then converges it. Idempotent. load Loads the durable source into the local runtime environment. publish Writes the local runtime environment into the durable source. apply Projects the durable source into the live cluster. status Read-only report of the domain: sources, keys, and drift from the cluster. rotate Replaces the current projection or encryption identity. clean Withdraws the domain traces from the local filesystem. get\|set\|delete\|list Key-level access to the store this domain owns. |
| `key`    | Key to act on, for the key-level operators.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `value`  | Value to write, for the `set` operator.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

#### Options

| Option                    | Description                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--env <env>`             | Target environment: development \| production \| test (default: production).                              |
| `--namespace <namespace>` | Kubernetes namespace to act on (default: default).                                                        |
| `--args <key=value-list>` | Comma-separated domain parameters, e.g. `names=postgres-secret`, `recipient=age1...`, `sub-conf=nexodev`. |
| `--dry-run`               | Reports what the action would change without changing anything.                                           |
| `--force`                 | Confirms the irreversible variant of the action.                                                          |
| `--plain`                 | Prints the value in plain text (get).                                                                     |
| `--filter <keyword>`      | Filters by matching key or value (list).                                                                  |
| `--copy`                  | Copies the value to the clipboard (get).                                                                  |
| `-h, --help`              | display help for command                                                                                  |

---

### underpost app

Application environment: one deployment's runtime configuration.

**Usage:** `underpost app [options] <action>`

#### Arguments

| Argument | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action` | Action to run. One of: setup, load, publish, apply, status, rotate, clean. setup Onboards the domain: provisions whatever it needs, then converges it. Idempotent. load Loads the durable source into the local runtime environment. publish Writes the local runtime environment into the durable source. apply Projects the durable source into the live cluster. status Read-only report of the domain: sources, keys, and drift from the cluster. rotate Replaces the current projection or encryption identity. clean Withdraws the domain traces from the local filesystem. |

#### Options

| Option                    | Description                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--env <env>`             | Target environment: development \| production \| test (default: production).                              |
| `--namespace <namespace>` | Kubernetes namespace to act on (default: default).                                                        |
| `--args <key=value-list>` | Comma-separated domain parameters, e.g. `names=postgres-secret`, `recipient=age1...`, `sub-conf=nexodev`. |
| `--dry-run`               | Reports what the action would change without changing anything.                                           |
| `--force`                 | Confirms the irreversible variant of the action.                                                          |
| `-h, --help`              | display help for command                                                                                  |

---

### underpost state

Runtime state: live container execution state, health and metrics, exported off-cluster.

**Usage:** `underpost state [options] <action> [key] [value]`

#### Arguments

| Argument | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action` | Action to run. One of: setup, load, publish, apply, status, rotate, clean, get, set, delete, list. setup Onboards the domain: provisions whatever it needs, then converges it. Idempotent. load Loads the durable source into the local runtime environment. publish Writes the local runtime environment into the durable source. apply Projects the durable source into the live cluster. status Read-only report of the domain: sources, keys, and drift from the cluster. rotate Replaces the current projection or encryption identity. clean Withdraws the domain traces from the local filesystem. get\|set\|delete\|list Key-level access to the store this domain owns. |
| `key`    | Key to act on, for the key-level operators.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `value`  | Value to write, for the `set` operator.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

#### Options

| Option                    | Description                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--env <env>`             | Target environment: development \| production \| test (default: production).                              |
| `--namespace <namespace>` | Kubernetes namespace to act on (default: default).                                                        |
| `--args <key=value-list>` | Comma-separated domain parameters, e.g. `names=postgres-secret`, `recipient=age1...`, `sub-conf=nexodev`. |
| `--dry-run`               | Reports what the action would change without changing anything.                                           |
| `--force`                 | Confirms the irreversible variant of the action.                                                          |
| `--plain`                 | Prints the value in plain text (get).                                                                     |
| `--filter <keyword>`      | Filters by matching key or value (list).                                                                  |
| `--copy`                  | Copies the value to the clipboard (get).                                                                  |
| `-h, --help`              | display help for command                                                                                  |

---

### underpost image

Manages Docker images, including building, saving, and loading into Kubernetes clusters.

**Usage:** `underpost image [options]`

#### Options

| Option                                | Description                                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--build`                             | Builds a Docker image using Podman, optionally saves it as a tar archive, and loads it into a specified Kubernetes cluster (Kind, Kubeadm, or K3s).                                                                   |
| `--ls`                                | Lists all available Underpost Dockerfile images.                                                                                                                                                                      |
| `--rm <image-id>`                     | Removes specified Underpost Dockerfile images.                                                                                                                                                                        |
| `--path [path]`                       | The path to the Dockerfile directory.                                                                                                                                                                                 |
| `--image-name [image-name]`           | Sets a custom name for the Docker image.                                                                                                                                                                              |
| `--image-out-path [image-out-path]`   | Sets the output path for the tar image archive.                                                                                                                                                                       |
| `--dockerfile-name [dockerfile-name]` | Sets a custom name for the Dockerfile.                                                                                                                                                                                |
| `--podman-save`                       | Exports the built image as a tar file using Podman.                                                                                                                                                                   |
| `--pull-base`                         | Pulls the base image prerequisites (rockylinux:9) on the host; combine with --build.                                                                                                                                  |
| `--spec`                              | Get current cached list of container images used by all pods                                                                                                                                                          |
| `--namespace <namespace>`             | Kubernetes namespace for image operations (defaults to "default").                                                                                                                                                    |
| `--kind`                              | Set kind cluster env image context management.                                                                                                                                                                        |
| `--kubeadm`                           | Set kubeadm cluster env image context management.                                                                                                                                                                     |
| `--k3s`                               | Set k3s cluster env image context management.                                                                                                                                                                         |
| `--docker-compose`                    | Load the built image tar into the local Docker store for Docker Compose availability.                                                                                                                                 |
| `--node-name`                         | Set node name for kubeadm or k3s cluster env image context management.                                                                                                                                                |
| `--reset`                             | Performs a build without using the cache.                                                                                                                                                                             |
| `--dev`                               | Use development mode.                                                                                                                                                                                                 |
| `--pull-dockerhub <dockerhub-image>`  | Sets a custom Docker Hub image for base image pulls.                                                                                                                                                                  |
| `--import-tar <tar-path>`             | Load a pre-built image tar archive (e.g. ./image-v1.0.0.tar) into the enabled target(s) without building. Combine with --kind, --kubeadm, --k3s and/or --docker-compose; the archive is loaded into each enabled one. |
| `-h, --help`                          | display help for command                                                                                                                                                                                              |

---

### underpost install

Quickly imports Underpost npm dependencies by copying them.

**Usage:** `underpost install [options]`

#### Options

| Option       | Description              |
| ------------ | ------------------------ |
| `-h, --help` | display help for command |

---

### underpost db

Manages database operations with support for MariaDB and MongoDB, including import/export, multi-pod targeting, and Git integration.

**Usage:** `underpost db [options] [deploy-list]`

#### Arguments

| Argument      | Description                                                             |
| ------------- | ----------------------------------------------------------------------- |
| `deploy-list` | A comma-separated list of deployment IDs (e.g., "default-a,default-b"). |

#### Options

| Option                                      | Description                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--import`                                  | Imports container backups from specified repositories.                                                 |
| `--export`                                  | Exports container backups to specified repositories.                                                   |
| `--pod-name <pod-name>`                     | Comma-separated list of pod names or patterns (supports wildcards like "mariadb-*").                   |
| `--all-pods`                                | Target all matching pods instead of just the first one.                                                |
| `--primary-pod`                             | Automatically detect and use MongoDB primary pod (MongoDB only).                                       |
| `--stats`                                   | Display database statistics (collection/table names with document/row counts).                         |
| `--collections <collections>`               | Comma-separated list of database collections to operate on.                                            |
| `--out-path <out-path>`                     | Specifies a custom output path for backups.                                                            |
| `--drop`                                    | Drops the specified databases or collections before importing.                                         |
| `--preserveUUID`                            | Preserves UUIDs during database import operations.                                                     |
| `--git`                                     | Enables Git integration for backup version control (clone, pull, commit, push to GitHub).              |
| `--force-clone`                             | Forces cloning of the Git repository, overwriting local changes.                                       |
| `--hosts <hosts>`                           | Comma-separated list of database hosts to filter operations.                                           |
| `--paths <paths>`                           | Comma-separated list of paths to filter database operations.                                           |
| `--ns <ns-name>`                            | Kubernetes namespace context for database operations (defaults to "default").                          |
| `--macro-rollback-export <n-commits-reset>` | Exports a macro rollback script that reverts the last n commits (Git integration required).            |
| `--clean-fs-collection`                     | Cleans orphaned File documents from collections that are not referenced by any models.                 |
| `--clean-fs-dry-run`                        | Dry run mode - shows what would be deleted without actually deleting (use with --clean-fs-collection). |
| `--dev`                                     | Sets the development cli context                                                                       |
| `--kubeadm`                                 | Enables the kubeadm context for database operations.                                                   |
| `--kind`                                    | Enables the kind context for database operations.                                                      |
| `--k3s`                                     | Enables the k3s context for database operations.                                                       |
| `--repo-backup`                             | Backs up repositories (git commit+push) inside deployment pods via kubectl exec.                       |
| `-h, --help`                                | display help for command                                                                               |

---

### underpost metadata

Manages cluster metadata operations, including import and export.

**Usage:** `underpost metadata [options] [deploy-id] [host] [path]`

#### Arguments

| Argument    | Description                           |
| ----------- | ------------------------------------- |
| `deploy-id` | The deployment ID to manage metadata. |
| `host`      | The host to manage metadata.          |
| `path`      | The path to manage metadata.          |

#### Options

| Option        | Description                             |
| ------------- | --------------------------------------- |
| `--import`    | Imports from local storage.             |
| `--export`    | Exports to local storage.               |
| `--crons`     | Apply to cron data collection           |
| `--instances` | Apply to instance data collection       |
| `--generate`  | Generate cluster metadata               |
| `--itc`       | Apply under container execution context |
| `--dev`       | Sets the development cli context        |
| `-h, --help`  | display help for command                |

---

### underpost cron

Manages cron jobs: execute jobs directly or generate and apply K8s CronJob manifests.

**Usage:** `underpost cron [options] [deploy-list] [job-list]`

#### Arguments

| Argument      | Description                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy-list` | A comma-separated list of deployment IDs (e.g., "default-a,default-b"). In manifest modes its first entry is the manifest owner deploy-id.              |
| `job-list`    | A comma-separated list of job IDs. Options: dns,backup,vultr. Defaults to all available jobs, and restricts which jobs are generated in manifest modes. |

#### Options

| Option                    | Description                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--generate-k8s-cronjobs` | Generates Kubernetes CronJob YAML manifests from cron configuration.                                               |
| `--apply`                 | Generates and applies K8s CronJob manifests to the cluster via kubectl (never runs jobs).                          |
| `--setup-start`           | Updates deploy-list package.json start script and generates+applies its K8s CronJob manifests.                     |
| `--namespace <namespace>` | Kubernetes namespace for the CronJob resources (default: "default").                                               |
| `--image <image>`         | Custom container image for the CronJob pods.                                                                       |
| `--node-name <node-name>` | Pins the CronJob pods to this node via a kubernetes.io/hostname nodeSelector.                                      |
| `--git`                   | Pass --git flag to cron job execution.                                                                             |
| `--cmd <cmd>`             | Optional pre-script commands to run before cron execution.                                                         |
| `--dev`                   | Use local ./ base path instead of global underpost installation.                                                   |
| `--k3s`                   | Use k3s cluster context (apply directly on host).                                                                  |
| `--kind`                  | Use kind cluster context (apply via kind-worker container).                                                        |
| `--kubeadm`               | Use kubeadm cluster context (apply directly on host).                                                              |
| `--dry-run`               | Preview cron jobs without executing them.                                                                          |
| `--create-job-now`        | Creates a Job from each CronJob on the cluster now (implies manifest mode; combine with --apply to publish first). |
| `-h, --help`              | display help for command                                                                                           |

---

### underpost fs

Manages file storage, defaulting to file upload operations.

**Usage:** `underpost fs [options] [path]`

#### Arguments

| Argument | Description                                                  |
| -------- | ------------------------------------------------------------ |
| `path`   | The absolute or relative directory path for file operations. |

#### Options

| Option                                    | Description                                                       |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `--rm`                                    | Removes the specified file.                                       |
| `--git`                                   | Displays current Git changes related to file storage.             |
| `--recursive`                             | Uploads files recursively from the specified path.                |
| `--deploy-id <deploy-id>`                 | Specifies the deployment configuration ID for file operations.    |
| `--pull`                                  | Downloads the specified file.                                     |
| `--omit-unzip`                            | With --pull, keeps the downloaded .zip file and skips extraction. |
| `--force`                                 | Forces the action, overriding any warnings or conflicts.          |
| `--storage-file-path <storage-file-path>` | Specifies a custom file storage path.                             |
| `-h, --help`                              | display help for command                                          |

---

### underpost monitor

Manages health server monitoring, the cluster observability stack, and host dashboards.

**Usage:** `underpost monitor [options] [deploy-id] [env]`

#### Arguments

| Argument    | Description                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy-id` | The deployment configuration ID to monitor. With the observability flags it selects which deploys are scraped; "dd" covers every deploy in dd.routes. (default: "dd") |
| `env`       | Optional: The environment to monitor (e.g., "development", "production"). Defaults to "development".                                                                  |

#### Options

| Option                               | Description                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ms-interval <ms-interval>`        | Sets a custom millisecond interval for monitoring checks.                                                                                                                                                             |
| `--now`                              | Executes the monitor script immediately.                                                                                                                                                                              |
| `--single`                           | Disables recurrence, running the monitor script only once.                                                                                                                                                            |
| `--replicas <replicas>`              | Sets a custom number of replicas for monitoring. Defaults to 1.                                                                                                                                                       |
| `--type <type>`                      | Sets a custom monitor type.                                                                                                                                                                                           |
| `--sync`                             | Synchronizes with current proxy deployments and traffic configurations.                                                                                                                                               |
| `--namespace <namespace>`            | Sets the Kubernetes namespace for the deployment. Defaults to "default".                                                                                                                                              |
| `--timeout-response <duration>`      | Sets HTTPProxy per-route response timeout (e.g., "5s").                                                                                                                                                               |
| `--timeout-idle <duration>`          | Sets HTTPProxy per-route idle timeout (e.g., "10s", "infinity").                                                                                                                                                      |
| `--retry-count <count>`              | Sets HTTPProxy per-route retry count (e.g., 3).                                                                                                                                                                       |
| `--retry-per-try-timeout <duration>` | Sets HTTPProxy retry per-try timeout (e.g., "150ms").                                                                                                                                                                 |
| `--disable-private-conf-update`      | Disables updates to private configuration during execution.                                                                                                                                                           |
| `--versions <deployment-versions>`   | Specifies the deployment versions to monitor. eg. "blue,green", "green"                                                                                                                                               |
| `--ready-deployment`                 | Run in ready deployment monitor mode.                                                                                                                                                                                 |
| `--promote`                          | Promotes the deployment after monitoring.                                                                                                                                                                             |
| `--observability`                    | Deploys or converges the cluster observability stack (Prometheus, Alertmanager, Blackbox Exporter, Grafana), ensuring the Gateway API metrics source and local-path storage provisioner are ready.                    |
| `--sync-prom`                        | Regenerates the scrape configuration, alert rules and Alertmanager route from the live deploy configuration and event registry, applies Grafana admin credentials, then reloads or rolls only the affected component. |
| `--events <event-ids>`               | Comma-separated event ids to provision; empty provisions every registered event.                                                                                                                                      |
| `--webhook-url <url>`                | URL Alertmanager delivers events to (defaults to the node address of `event --serve`).                                                                                                                                |
| `--extra-targets <targets>`          | Comma-separated additional "host:port" scrape targets.                                                                                                                                                                |
| `--metrics-server`                   | Installs the Kubernetes metrics-server (kubectl top / HPA resource API). Skipped on K3s, which bundles its own, unless --force.                                                                                       |
| `--cockpit`                          | Installs and enables the Cockpit KVM dashboard on this host (cockpit, cockpit-machines, libvirt) and opens its firewall service.                                                                                      |
| `--cockpit-stop`                     | Stops and disables the Cockpit KVM dashboard and closes its firewall service.                                                                                                                                         |
| `--grafana-host <host>`              | Publishes Grafana at https://<host>/grafana through the edge Gateway that already serves that hostname.                                                                                                               |
| `--node-port`                        | Publishes Grafana on the node's LAN address (port 32300).                                                                                                                                                             |
| `--expose-grafana`                   | Republishes Grafana with --grafana-host / --node-port without redeploying the stack.                                                                                                                                  |
| `--webhook-token`                    | Prints the shared event webhook token, to persist as UNDERPOST_EVENT_TOKEN in the cron deploy env.                                                                                                                    |
| `--node-name <k8s-node-name>`        | Pins every monitoring workload to this node; moving Grafana deletes and recreates its node-local data.                                                                                                                |
| `--kubeadm`                          | Treats the cluster as kubeadm when resolving node and host addresses.                                                                                                                                                 |
| `--kind`                             | Treats the cluster as Kind (Docker nodes) when resolving node and host addresses.                                                                                                                                     |
| `--k3s`                              | Treats the cluster as K3s when resolving node and host addresses.                                                                                                                                                     |
| `--force`                            | Confirms an install that would replace a bundled component (e.g. --metrics-server on K3s).                                                                                                                            |
| `--dev`                              | Sets the development cli context (scrapes over HTTP, defaults the cluster type to Kind).                                                                                                                              |
| `-h, --help`                         | display help for command                                                                                                                                                                                              |

---

### underpost event

Dispatches operational events and provisions the monitoring rules that trigger them.

**Usage:** `underpost event [options] [event-id]`

#### Arguments

| Argument   | Description                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event-id` | The operational event to dispatch. Options: wireguard-server-down,wireguard-spoke-down,public-ingress-down,node-cpu-limit-exceeded,node-memory-limit-exceeded,hub-bandwidth-limit-exceeded,node-disk-limit-exceeded,node-network-traffic-exceeded. |

#### Options

| Option                          | Description                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--deploy`                      | Merges the event into the set already deployed in the cluster and republishes the monitoring configuration.                                                                   |
| `--undeploy`                    | Removes the event from the deployed set and republishes without it.                                                                                                           |
| `--suspend-events <state-file>` | Saves the exact deployed event set and temporarily republishes observability without event probes or alerts.                                                                  |
| `--resume-events <state-file>`  | Restores and resynchronizes the exact event set saved by --suspend-events, then removes the state file.                                                                       |
| `--serve`                       | Runs the Alertmanager webhook receiver in the foreground (use --service to supervise it).                                                                                     |
| `--service`                     | Installs the receiver on a WireGuard control node as the underpost-event systemd unit. It remains available while the tunnel is down.                                         |
| `--service-stop`                | Stops, disables and removes the underpost-event systemd unit.                                                                                                                 |
| `--service-status`              | Reports whether the underpost-event unit is active and enabled.                                                                                                               |
| `--list`                        | Lists the registered events with their resolved probe targets.                                                                                                                |
| `--port <port>`                 | Listening port for --serve and the generated unit (default: 39099).                                                                                                           |
| `--cooldown-ms <ms>`            | Minimum interval between two dispatches of one event in --serve (default: 300000).                                                                                            |
| `--spoke <spoke-id>`            | Spoke to remediate when dispatching wireguard-spoke-down by hand; a webhook takes it from the alert labels.                                                                   |
| `--nodes <node-names>`          | Comma-separated node documents to act on — hubs for wireguard-server-down, peers for wireguard-spoke-down. Empty covers every registered hub, or every peer of this node hub. |
| `--namespace <namespace>`       | Kubernetes namespace holding the observability stack. Defaults to "default".                                                                                                  |
| `--webhook-url <url>`           | URL Alertmanager delivers to, written into the generated route with --deploy.                                                                                                 |
| `--dev`                         | Sets the development cli context.                                                                                                                                             |
| `--dry-run`                     | Reports the remediation the event would run without executing it.                                                                                                             |
| `--no-notify`                   | Skips the operational alert declared in engine-private/deploy/conf.event.json.                                                                                                |
| `--e2e-test`                    | Rehearses the event against the live edge: breaks the real subject, waits for the probe to fail, runs the remediation, and verifies the notification was actually sent.       |
| `-h, --help`                    | display help for command                                                                                                                                                      |

---

### underpost ssh

Manages cluster scoped SSH credentials and sessions for remote access to cluster nodes or services. Users are registered in engine-private/deploy/conf.users.json and keys are stored in engine-private/deploy/users/<user>.

**Usage:** `underpost ssh [options]`

#### Options

| Option                  | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `--generate`            | Generates new ssh credential and stores it in current private keys file storage. |
| `--user <user>`         | Sets custom ssh user                                                             |
| `--password <password>` | Sets custom ssh password                                                         |
| `--host <host>`         | Sets custom ssh host                                                             |
| `--port <port>`         | Sets custom ssh port                                                             |
| `--filter <filter>`     | Filters ssh user credentials from current private keys file storage.             |
| `--groups <groups>`     | Sets comma-separated ssh user groups for the ssh user credential.                |
| `--user-add`            | Adds a new ssh user credential to current private keys file storage.             |
| `--user-remove`         | Removes an existing ssh user credential from current private keys file storage.  |
| `--user-ls`             | Lists all ssh user credentials from current private keys file storage.           |
| `--start`               | Starts an SSH session with the specified credentials.                            |
| `--reset`               | Resets ssh configuration and deletes all stored credentials.                     |
| `--keys-list`           | Lists all ssh keys from current private keys file storage.                       |
| `--hosts-list`          | Lists all ssh hosts from current private keys file storage.                      |
| `--disable-password`    | Disables password authentication for the SSH session.                            |
| `--key-test`            | Tests the SSH key using ssh-keygen.                                              |
| `--stop`                | Stops the SSH service.                                                           |
| `--status`              | Checks the status of the SSH service.                                            |
| `-h, --help`            | display help for command                                                         |

---

### underpost wireguard

Manages the WireGuard L3 hub-and-spoke transport and the HAProxy edge gateway in front of it.

**Usage:** `underpost wireguard [options]`

#### Options

| Option                               | Description                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--deploy-id <deploy-id>`            | Deploy IDs whose conf.server.json/conf.instances.json define the routes. Accepts one id or a comma-separated list; defaults to "dd", every deploy in dd.routes, because the edge holds one pair of map files for the whole cluster.                                                                                                                                                                  |
| `--interface <name>`                 | WireGuard interface name (default: "wg0").                                                                                                                                                                                                                                                                                                                                                           |
| `--wireguard-install`                | Installs the wireguard-tools, haproxy and iptables host packages.                                                                                                                                                                                                                                                                                                                                    |
| `--wireguard-setup`                  | Generates keys, builds the interface config, and applies local network rules.                                                                                                                                                                                                                                                                                                                        |
| `--node-config`                      | Writes a node identity under deploy/nodes, named after the machine it describes.                                                                                                                                                                                                                                                                                                                     |
| `--node-name <node-name>`            | Node record to write; defaults to this hostname, which is what runtime commands resolve their identity by.                                                                                                                                                                                                                                                                                           |
| `--node-role <role>`                 | Machine role: control, worker, or hub.                                                                                                                                                                                                                                                                                                                                                               |
| `--hub-host <ipv4>`                  | Static public IPv4 key of the hub topology this node belongs to.                                                                                                                                                                                                                                                                                                                                     |
| `--port <port>`                      | WireGuard UDP listening port (default: 51820).                                                                                                                                                                                                                                                                                                                                                       |
| `--cidr <cidr>`                      | Hub interface address on a hub; overlay subnet routed through the hub on control and worker nodes.                                                                                                                                                                                                                                                                                                   |
| `--peer-ip <ip>`                     | Tunnel address used by --peer-add or to update the selected node during setup.                                                                                                                                                                                                                                                                                                                       |
| `--peer-id <peer-id>`                | Topology peer represented by a control or worker node identity.                                                                                                                                                                                                                                                                                                                                      |
| `--public-key <key>`                 | Public key used by off-host topology authoring or --peer-add.                                                                                                                                                                                                                                                                                                                                        |
| `--peer-add <peer-id>`               | Registers a spoke and applies it to the running hub without a restart.                                                                                                                                                                                                                                                                                                                               |
| `--peer-remove <peer-id>`            | Removes a peer from the selected topology and running hub.                                                                                                                                                                                                                                                                                                                                           |
| `--allowed-ips <cidrs>`              | Comma-separated CIDRs routed to the spoke (e.g. "10.0.0.2/32,192.168.10.0/24").                                                                                                                                                                                                                                                                                                                      |
| `--hosts <hosts>`                    | Comma-separated hostnames bound to the spoke, overriding instance resolution.                                                                                                                                                                                                                                                                                                                        |
| `--instances <instances>`            | Comma-separated conf.instances.json ids bound to the spoke.                                                                                                                                                                                                                                                                                                                                          |
| `--management-host <host>`           | Stable LAN or management address used to repair this peer when its tunnel address is unavailable.                                                                                                                                                                                                                                                                                                    |
| `--default`                          | Marks the spoke as the fallback for hostnames that match no other binding.                                                                                                                                                                                                                                                                                                                           |
| `--haproxy-setup`                    | Installs HAProxy, publishes the current routes, and enables the daemon.                                                                                                                                                                                                                                                                                                                              |
| `--haproxy-sync`                     | Recompiles the SNI/Host maps from deploy config and hot-reloads HAProxy.                                                                                                                                                                                                                                                                                                                             |
| `--status`                           | Prints the whole edge context without changing anything: role, interface, tunnel address, public key, daemon states, peers with their bindings and link health, and the resolved routing.                                                                                                                                                                                                            |
| `--build-conf`                       | Writes only engine-private/deploy/conf.wireguard.json and touches no host state. Combine with --wireguard-setup / --peer-add / --peer-remove to author the topology off-box; alone it normalizes and validates the existing topology.                                                                                                                                                                |
| `--forward-proxy-server`             | Ensures the hub HTTP/CONNECT forward proxy runs as the underpost-forward-proxy systemd service, bound to the tunnel address only (default port 1080), and returns. Authenticates every request with FORWARD_PROXY_API_KEY, so spokes can reach the internet through the VPS public address. Idempotent: re-running converges on the one service and restarts it only when the unit actually changed. |
| `--forward-proxy-server-host <host>` | Address the forward proxy binds, overriding the selected hub tunnel address.                                                                                                                                                                                                                                                                                                                         |
| `--forward-proxy-server-port <port>` | Port the forward proxy binds (default: 1080).                                                                                                                                                                                                                                                                                                                                                        |
| `--ssh-forward-port <port>`          | Publishes the default spoke SSH port on this public TCP port of the hub, so CI with no fixed address can reach the cluster node (e.g. 2222). "0" closes it. Stored in hub topology.                                                                                                                                                                                                                  |
| `--sync`                             | Brings every registered node engine checkout up to date over its SSH identity: clean, pull, fix and install.                                                                                                                                                                                                                                                                                         |
| `--nodes <node-names>`               | Comma-separated node documents --sync, --cmd, --node-exporter and --connect-uri act on. Empty covers every hub and every peer of this node hub.                                                                                                                                                                                                                                                      |
| `--connect-uri`                      | Prints the SSH command that reaches each node named by --nodes, joining the node document under engine-private/deploy/nodes to the management address it is registered under in engine-private/deploy/conf.users.json. Empty --nodes lists the whole fleet.                                                                                                                                          |
| `--copy`                             | Copies the --connect-uri output to the clipboard instead of printing it.                                                                                                                                                                                                                                                                                                                             |
| `--cmd <command-list>`               | Comma-separated custom commands to run on the selected nodes over their SSH identity. Given with --sync, only these run in place of the sync steps.                                                                                                                                                                                                                                                  |
| `--node-exporter`                    | Provisions the host metrics collector as a systemd service on the selected hub nodes, bound to their tunnel address, so machines outside the cluster report hardware metrics like every cluster node.                                                                                                                                                                                                |
| `--repo-engine <repo>`               | Engine repository --sync pulls from, as owner/repo or a clone URL. Defaults to the configured account engine.                                                                                                                                                                                                                                                                                        |
| `--repo-engine-private <repo>`       | Private engine repository --sync pulls from, as owner/repo or a clone URL. Defaults to the configured private repo derived from --repo-engine.                                                                                                                                                                                                                                                       |
| `--wireguard-start`                  | Enables and starts wg-quick@<interface> and the QUIC forward.                                                                                                                                                                                                                                                                                                                                        |
| `--wireguard-restart`                | Restarts wg-quick@<interface> and restores the hub QUIC forward.                                                                                                                                                                                                                                                                                                                                     |
| `--wireguard-stop`                   | Tears down the interface and removes its transient packet rules.                                                                                                                                                                                                                                                                                                                                     |
| `--check`                            | Waits for an active interface and a fresh handshake with its required peer.                                                                                                                                                                                                                                                                                                                          |
| `--check-timeout <seconds>`          | Maximum wait for --check (default: 30).                                                                                                                                                                                                                                                                                                                                                              |
| `--expected-role <role>`             | Refuses restart/check unless this host has the expected node role.                                                                                                                                                                                                                                                                                                                                   |
| `--expected-id <peer-id>`            | Refuses restart/check unless this node represents the expected peer id.                                                                                                                                                                                                                                                                                                                              |
| `--wireguard-reset`                  | Removes generated host state, keeping keys, topology and node identity.                                                                                                                                                                                                                                                                                                                              |
| `--wireguard-reinstall`              | Full purge, package reinstall and re-key; updates the selected topology key.                                                                                                                                                                                                                                                                                                                         |
| `--dry-run`                          | Prints the files and commands the run would apply, without touching the host.                                                                                                                                                                                                                                                                                                                        |
| `-h, --help`                         | display help for command                                                                                                                                                                                                                                                                                                                                                                             |

---

### underpost haproxy

Manages the HAProxy edge gateway over the WireGuard transport (same subsystem as `underpost wireguard`).

**Usage:** `underpost haproxy [options]`

#### Options

| Option                               | Description                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--deploy-id <deploy-id>`            | Deploy IDs whose conf.server.json/conf.instances.json define the routes. Accepts one id or a comma-separated list; defaults to "dd", every deploy in dd.routes, because the edge holds one pair of map files for the whole cluster.                                                                                                                                                                  |
| `--interface <name>`                 | WireGuard interface name (default: "wg0").                                                                                                                                                                                                                                                                                                                                                           |
| `--wireguard-install`                | Installs the wireguard-tools, haproxy and iptables host packages.                                                                                                                                                                                                                                                                                                                                    |
| `--wireguard-setup`                  | Generates keys, builds the interface config, and applies local network rules.                                                                                                                                                                                                                                                                                                                        |
| `--node-config`                      | Writes a node identity under deploy/nodes, named after the machine it describes.                                                                                                                                                                                                                                                                                                                     |
| `--node-name <node-name>`            | Node record to write; defaults to this hostname, which is what runtime commands resolve their identity by.                                                                                                                                                                                                                                                                                           |
| `--node-role <role>`                 | Machine role: control, worker, or hub.                                                                                                                                                                                                                                                                                                                                                               |
| `--hub-host <ipv4>`                  | Static public IPv4 key of the hub topology this node belongs to.                                                                                                                                                                                                                                                                                                                                     |
| `--port <port>`                      | WireGuard UDP listening port (default: 51820).                                                                                                                                                                                                                                                                                                                                                       |
| `--cidr <cidr>`                      | Hub interface address on a hub; overlay subnet routed through the hub on control and worker nodes.                                                                                                                                                                                                                                                                                                   |
| `--peer-ip <ip>`                     | Tunnel address used by --peer-add or to update the selected node during setup.                                                                                                                                                                                                                                                                                                                       |
| `--peer-id <peer-id>`                | Topology peer represented by a control or worker node identity.                                                                                                                                                                                                                                                                                                                                      |
| `--public-key <key>`                 | Public key used by off-host topology authoring or --peer-add.                                                                                                                                                                                                                                                                                                                                        |
| `--peer-add <peer-id>`               | Registers a spoke and applies it to the running hub without a restart.                                                                                                                                                                                                                                                                                                                               |
| `--peer-remove <peer-id>`            | Removes a peer from the selected topology and running hub.                                                                                                                                                                                                                                                                                                                                           |
| `--allowed-ips <cidrs>`              | Comma-separated CIDRs routed to the spoke (e.g. "10.0.0.2/32,192.168.10.0/24").                                                                                                                                                                                                                                                                                                                      |
| `--hosts <hosts>`                    | Comma-separated hostnames bound to the spoke, overriding instance resolution.                                                                                                                                                                                                                                                                                                                        |
| `--instances <instances>`            | Comma-separated conf.instances.json ids bound to the spoke.                                                                                                                                                                                                                                                                                                                                          |
| `--management-host <host>`           | Stable LAN or management address used to repair this peer when its tunnel address is unavailable.                                                                                                                                                                                                                                                                                                    |
| `--default`                          | Marks the spoke as the fallback for hostnames that match no other binding.                                                                                                                                                                                                                                                                                                                           |
| `--haproxy-setup`                    | Installs HAProxy, publishes the current routes, and enables the daemon.                                                                                                                                                                                                                                                                                                                              |
| `--haproxy-sync`                     | Recompiles the SNI/Host maps from deploy config and hot-reloads HAProxy.                                                                                                                                                                                                                                                                                                                             |
| `--status`                           | Prints the whole edge context without changing anything: role, interface, tunnel address, public key, daemon states, peers with their bindings and link health, and the resolved routing.                                                                                                                                                                                                            |
| `--build-conf`                       | Writes only engine-private/deploy/conf.wireguard.json and touches no host state. Combine with --wireguard-setup / --peer-add / --peer-remove to author the topology off-box; alone it normalizes and validates the existing topology.                                                                                                                                                                |
| `--forward-proxy-server`             | Ensures the hub HTTP/CONNECT forward proxy runs as the underpost-forward-proxy systemd service, bound to the tunnel address only (default port 1080), and returns. Authenticates every request with FORWARD_PROXY_API_KEY, so spokes can reach the internet through the VPS public address. Idempotent: re-running converges on the one service and restarts it only when the unit actually changed. |
| `--forward-proxy-server-host <host>` | Address the forward proxy binds, overriding the selected hub tunnel address.                                                                                                                                                                                                                                                                                                                         |
| `--forward-proxy-server-port <port>` | Port the forward proxy binds (default: 1080).                                                                                                                                                                                                                                                                                                                                                        |
| `--ssh-forward-port <port>`          | Publishes the default spoke SSH port on this public TCP port of the hub, so CI with no fixed address can reach the cluster node (e.g. 2222). "0" closes it. Stored in hub topology.                                                                                                                                                                                                                  |
| `--sync`                             | Brings every registered node engine checkout up to date over its SSH identity: clean, pull, fix and install.                                                                                                                                                                                                                                                                                         |
| `--nodes <node-names>`               | Comma-separated node documents --sync, --cmd, --node-exporter and --connect-uri act on. Empty covers every hub and every peer of this node hub.                                                                                                                                                                                                                                                      |
| `--connect-uri`                      | Prints the SSH command that reaches each node named by --nodes, joining the node document under engine-private/deploy/nodes to the management address it is registered under in engine-private/deploy/conf.users.json. Empty --nodes lists the whole fleet.                                                                                                                                          |
| `--copy`                             | Copies the --connect-uri output to the clipboard instead of printing it.                                                                                                                                                                                                                                                                                                                             |
| `--cmd <command-list>`               | Comma-separated custom commands to run on the selected nodes over their SSH identity. Given with --sync, only these run in place of the sync steps.                                                                                                                                                                                                                                                  |
| `--node-exporter`                    | Provisions the host metrics collector as a systemd service on the selected hub nodes, bound to their tunnel address, so machines outside the cluster report hardware metrics like every cluster node.                                                                                                                                                                                                |
| `--repo-engine <repo>`               | Engine repository --sync pulls from, as owner/repo or a clone URL. Defaults to the configured account engine.                                                                                                                                                                                                                                                                                        |
| `--repo-engine-private <repo>`       | Private engine repository --sync pulls from, as owner/repo or a clone URL. Defaults to the configured private repo derived from --repo-engine.                                                                                                                                                                                                                                                       |
| `--wireguard-start`                  | Enables and starts wg-quick@<interface> and the QUIC forward.                                                                                                                                                                                                                                                                                                                                        |
| `--wireguard-restart`                | Restarts wg-quick@<interface> and restores the hub QUIC forward.                                                                                                                                                                                                                                                                                                                                     |
| `--wireguard-stop`                   | Tears down the interface and removes its transient packet rules.                                                                                                                                                                                                                                                                                                                                     |
| `--check`                            | Waits for an active interface and a fresh handshake with its required peer.                                                                                                                                                                                                                                                                                                                          |
| `--check-timeout <seconds>`          | Maximum wait for --check (default: 30).                                                                                                                                                                                                                                                                                                                                                              |
| `--expected-role <role>`             | Refuses restart/check unless this host has the expected node role.                                                                                                                                                                                                                                                                                                                                   |
| `--expected-id <peer-id>`            | Refuses restart/check unless this node represents the expected peer id.                                                                                                                                                                                                                                                                                                                              |
| `--wireguard-reset`                  | Removes generated host state, keeping keys, topology and node identity.                                                                                                                                                                                                                                                                                                                              |
| `--wireguard-reinstall`              | Full purge, package reinstall and re-key; updates the selected topology key.                                                                                                                                                                                                                                                                                                                         |
| `--dry-run`                          | Prints the files and commands the run would apply, without touching the host.                                                                                                                                                                                                                                                                                                                        |
| `-h, --help`                         | display help for command                                                                                                                                                                                                                                                                                                                                                                             |

---

### underpost vultr

Meters the edge VPS bandwidth against its Vultr plan quota and blocks egress before overage accrues.

**Usage:** `underpost vultr [options] [deploy-list]`

#### Arguments

| Argument      | Description                                                       |
| ------------- | ----------------------------------------------------------------- |
| `deploy-list` | A comma-separated list of deployment IDs, logged for attribution. |

#### Options

| Option                        | Description                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `--instance-id <instance-id>` | Vultr instance id to meter (default: VULTR_INSTANCE_ID).                                                      |
| `--api-key <api-key>`         | Vultr API key (default: VULTR_API_KEY). Prefer the environment over this flag.                                |
| `--threshold <ratio>`         | Fraction of the plan quota that triggers the egress block; "0.80" and "80" are both accepted (default: 0.80). |
| `--metric <metric>`           | "total" (incoming + outgoing, default) or "outgoing" for egress alone.                                        |
| `--month <yyyy-mm>`           | Billing month to sum (default: the current UTC month).                                                        |
| `--all-dates`                 | Sum every daily bucket the API returns instead of scoping to one month.                                       |
| `--host <ip>`                 | Edge VPS to block (default: VULTR_VPS_IP, then DEFAULT_SSH_HOST).                                             |
| `--user <user>`               | SSH user on the edge VPS (default: VULTR_SSH_USER, then DEFAULT_SSH_USER, then "root").                       |
| `--key-path <path>`           | SSH private key (default: VULTR_SSH_KEY_PATH, then DEFAULT_SSH_KEY_PATH).                                     |
| `--port <port>`               | SSH port on the edge VPS (default: VULTR_SSH_PORT, then DEFAULT_SSH_PORT, then 22).                           |
| `--force`                     | Re-apply the egress block even if it was already applied for this cycle.                                      |
| `--auto-unblock`              | Restore egress automatically once consumption falls back under the threshold.                                 |
| `--dry-run`                   | Reports the consumption and the action it would take, without touching the edge VPS.                          |
| `-h, --help`                  | display help for command                                                                                      |

---

### underpost run

Runs specified scripts using various runners.

**Usage:** `underpost run [options] <runner-id> [path]`

#### Arguments

| Argument    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runner-id` | The runner ID to run. Options: status,expose,dev-cluster,metadata,ipfs-expose,svc-ls,svc-rm,node-move,cluster-build,template-deploy,template-deploy-local,docker-image,clean,pull,ssh-deploy,ide,crypto-policy,sync,net-tables,stop,tz,get-traffic,restore-mongo,ingress-refresh,instance-promote,instance,deploy-key,instance-build-manifest,ls-deployments,host-update,install-crio,dd-container,ip-info,db-client,git-conf,promote,cluster,gateway-status,deploy,disk-clean,disk-devices,disk-usage,dev,service,etc-hosts,log,ps,pid-info,background,ports,deploy-test,tf-vae-test,spark-template,kill,generate-pass,gpu-env,tf-gpu-test,deploy-job,push-bundle,pull-bundle,kubeadm-wireguard,build-cluster-deployment-manifests,monitor-ui,shared-dir,shared-dir-add-user. |
| `path`      | The input value, identifier, or path for the operation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

#### Options

| Option                                           | Description                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--cmd <command-list>`                           | Comma-separated list of commands to execute.                                                                                                                                                |
| `--args <args-array>`                            | Array of arguments to pass to the command.                                                                                                                                                  |
| `--dev`                                          | Sets the development context environment for the script.                                                                                                                                    |
| `--build`                                        | Set builder context runner                                                                                                                                                                  |
| `--replicas <replicas>`                          | Sets a custom number of replicas for deployment.                                                                                                                                            |
| `--pod-name <pod-name>`                          | Optional: Specifies the pod name for execution.                                                                                                                                             |
| `--node-name <node-name>`                        | Optional: Specifies the node name for execution.                                                                                                                                            |
| `--ingress-node <node-name>`                     | Dedicated node for the host-network underpost-ingress listener. Workload --node-name never relocates it.                                                                                    |
| `--ssh-key-path <path>`                          | Optional: Private key path for node SSH operations, forwarded to volume shipping over SSH. Defaults to engine-private/deploy/id_rsa.                                                        |
| `--port <port>`                                  | Optional: Specifies the port for execution.                                                                                                                                                 |
| `--expose-container-ports <ports>`               | Comma-separated Service/container ports; multiple matched resources consume values by resource index.                                                                                       |
| `--expose-host-ports <ports>`                    | Comma-separated host ports paired with container ports by resource/port index.                                                                                                              |
| `--local-proxy`                                  | Starts the development path proxy after the expose runner creates its port-forwards.                                                                                                        |
| `--etc-hosts`                                    | Enables etc-hosts context for the runner execution.                                                                                                                                         |
| `--volume-host-path <volume-host-path>`          | Optional: Specifies the volume host path for test execution.                                                                                                                                |
| `--volume-mount-path <volume-mount-path>`        | Optional: Specifies the volume mount path for test execution.                                                                                                                               |
| `--volume-type <volume-type>`                    | Optional: Specifies the volume type for test execution.                                                                                                                                     |
| `--image-name <image-name>`                      | Optional: Specifies the image name for test execution.                                                                                                                                      |
| `--image <image>`                                | Container image the deployment pulls and runs (sync).                                                                                                                                       |
| `--runtime-image <name>`                         | src/runtime/<name> image family the cluster runner brings up (default "express").                                                                                                           |
| `--versions <deployment-versions>`               | Comma-separated blue/green deployment versions (sync); unset resolves the next colour.                                                                                                      |
| `--container-name <container-name>`              | Optional: Specifies the container name for test execution.                                                                                                                                  |
| `--namespace <namespace>`                        | Optional: Specifies the namespace for test execution.                                                                                                                                       |
| `--tty`                                          | Enables TTY for the container in deploy-job.                                                                                                                                                |
| `--stdin`                                        | Keeps STDIN open for the container in deploy-job.                                                                                                                                           |
| `--restart-policy <policy>`                      | Sets the restart policy for the job in deploy-job.                                                                                                                                          |
| `--runtime-class-name <name>`                    | Sets the runtime class name for the job in deploy-job.                                                                                                                                      |
| `--image-pull-policy <policy>`                   | Sets the image pull policy for the job in deploy-job.                                                                                                                                       |
| `--api-version <version>`                        | Sets the API version for the job manifest in deploy-job.                                                                                                                                    |
| `--labels <labels>`                              | Optional: Specifies a comma-separated list of key-value pairs for labels (e.g., "app=my-app,env=prod").                                                                                     |
| `--claim-name <name>`                            | Optional: Specifies the claim name for volume mounting in deploy-job.                                                                                                                       |
| `--kind-type <kind-type>`                        | Specifies the kind of Kubernetes resource (e.g., Job, Deployment) for deploy-job.                                                                                                           |
| `--force`                                        | Forces operation, overriding any warnings or conflicts.                                                                                                                                     |
| `--tls`                                          | Enables TLS for the runner execution.                                                                                                                                                       |
| `--reset`                                        | Resets the runner state before execution.                                                                                                                                                   |
| `--dev-proxy-port-offset <port-offset>`          | Sets a custom port offset for development proxy.                                                                                                                                            |
| `--host-network`                                 | Enables host network mode for the runner execution.                                                                                                                                         |
| `--requests-memory <requests-memory>`            | Requests memory limit for the runner execution.                                                                                                                                             |
| `--requests-cpu <requests-cpu>`                  | Requests CPU limit for the runner execution.                                                                                                                                                |
| `--limits-memory <limits-memory>`                | Sets memory limit for the runner execution.                                                                                                                                                 |
| `--limits-cpu <limits-cpu>`                      | Sets CPU limit for the runner execution.                                                                                                                                                    |
| `--resource-template-id <resource-template-id >` | Specifies a resource template ID for the runner execution.                                                                                                                                  |
| `--expose`                                       | Enables exposure-only behavior in compatible runners; the expose runner itself does not require this flag.                                                                                  |
| `--conf-server-path <conf-server-path>`          | Sets a custom configuration server path.                                                                                                                                                    |
| `--underpost-root <underpost-root>`              | Sets a custom Underpost root path.                                                                                                                                                          |
| `--cmd-cron-jobs <cmd-cron-jobs>`                | Pre-script commands to run before cron job execution.                                                                                                                                       |
| `--deploy-id-cron-jobs <deploy-id-cron-jobs>`    | Cron deploy-id to set up during sync; defaults to dd.cron, "none" skips cron setup entirely.                                                                                                |
| `--timezone <timezone>`                          | Sets the timezone for the runner execution.                                                                                                                                                 |
| `--kubeadm`                                      | Sets the kubeadm cluster context for the runner execution.                                                                                                                                  |
| `--k3s`                                          | Sets the k3s cluster context for the runner execution.                                                                                                                                      |
| `--kind`                                         | Sets the kind cluster context for the runner execution.                                                                                                                                     |
| `--traffic <traffic>`                            | Blue/green traffic colour to bake into generated manifests (default: blue). `stop` accepts a comma list, e.g. blue,green.                                                                   |
| `--git-clean`                                    | Runs git clean on volume mount paths before copying.                                                                                                                                        |
| `--deploy-id <deploy-id>`                        | Sets deploy id context for the runner execution.                                                                                                                                            |
| `--user <user>`                                  | Sets user context for the runner execution.                                                                                                                                                 |
| `--hosts <hosts>`                                | Comma-separated list of hosts for the runner execution.                                                                                                                                     |
| `--instance-id <instance-id>`                    | Sets instance id context for the runner execution.                                                                                                                                          |
| `--pid <process-id>`                             | Sets process id context for the runner execution.                                                                                                                                           |
| `--timeout-response <duration>`                  | Sets HTTPProxy per-route response timeout (e.g., "1s", "300ms", "infinity").                                                                                                                |
| `--timeout-idle <duration>`                      | Sets HTTPProxy per-route idle timeout (e.g., "10s", "infinity").                                                                                                                            |
| `--retry-count <count>`                          | Sets HTTPProxy per-route retry count (e.g., 3).                                                                                                                                             |
| `--retry-per-try-timeout <duration>`             | Sets HTTPProxy retry per-try timeout (e.g., "150ms").                                                                                                                                       |
| `--gateway-api`                                  | Routes through the Gateway API stack (Gateway + HTTPRoute) instead of the Contour HTTPProxy. Both manifest sets are always generated; this selects which one is applied.                    |
| `--disable-gateway-api`                          | Falls back to the Contour HTTPProxy stack in runners where the Gateway API is the default (cluster).                                                                                        |
| `--gateway-class <name>`                         | GatewayClass name for generated Gateway manifests (default "eg").                                                                                                                           |
| `--disable-http3`                                | Omits the QUIC/HTTP3 listener config and the Alt-Svc advertisement from Gateway API manifests.                                                                                              |
| `--quic-port <port>`                             | UDP port advertised for QUIC/HTTP3 in generated Gateway API manifests (default 443).                                                                                                        |
| `--repo-engine-private <repo>`                   | Private configuration repository the pull runner checks out, as owner/repo or a clone URL. Defaults to the private repo derived from the engine source.                                     |
| `--disable-private-conf-update`                  | Disables updates to private configuration during execution.                                                                                                                                 |
| `--logs`                                         | Streams logs during the runner execution.                                                                                                                                                   |
| `--monitor-status <status>`                      | Sets the status to monitor for pod/resource (default: "Running").                                                                                                                           |
| `--monitor-status-kind-type <kind-type>`         | Sets the Kubernetes resource kind type to monitor (default: "pods").                                                                                                                        |
| `--monitor-status-delta-ms <milliseconds>`       | Sets the polling interval in milliseconds for status monitoring (default: 1000).                                                                                                            |
| `--monitor-status-max-attempts <attempts>`       | Sets the maximum number of status check attempts (default: 600).                                                                                                                            |
| `--dry-run`                                      | Preview operations without executing them.                                                                                                                                                  |
| `--from-n-commit <n>`                            | Number of commits back to use for message propagation in template-deploy (default: 1, last commit only).                                                                                    |
| `--create-job-now`                               | After applying cron manifests, immediately create a Job from each CronJob (forwarded to cron runner).                                                                                       |
| `--host-aliases <host-aliases>`                  | Adds entries to the Pod /etc/hosts via hostAliases. Format: semicolon-separated entries of "ip=hostname1,hostname2" (e.g., "127.0.0.1=foo.local,bar.local;10.1.2.3=foo.remote,bar.remote"). |
| `--copy`                                         | Copies the runner output to the clipboard (supported by: generate-pass, template-deploy-local).                                                                                             |
| `--skip-full-build`                              | Skip client bundle rebuild; triggers pull-bundle in container startup (supported by: sync, template-deploy).                                                                                |
| `--pull-bundle`                                  | Explicitly download the pre-built client bundle from Cloudinary inside the container (supported by: sync, template-deploy). Use together with --skip-full-build.                            |
| `--remove`                                       | Remove/teardown resources                                                                                                                                                                   |
| `--test`                                         | Enables test/generic-purpose mode for the runner (e.g. use self-signed TLS instead of cert-manager).                                                                                        |
| `--branch <branch>`                              | Sets the branch for git operations (default: current branch).                                                                                                                               |
| `-h, --help`                                     | display help for command                                                                                                                                                                    |

---

### underpost test

Runs the test tiers locally, inside deployment pods, or as a cluster Job with Allure reporting.

**Usage:** `underpost test [options] [suite]`

#### Arguments

| Argument | Description                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suite`  | A comma-separated list of suites or tiers to run. Suites: unit, infra, app, cyberia, contracts, all. Tiers: unit, infra:1-security, infra:2-network, infra:3-cluster, infra:4-ingress, infra:5-observability, app, cyberia, contracts. Defaults to every tier, in tier order. (default: "") |

#### Options

| Option                        | Description                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `--itc`                       | Runs in this execution context instead of dispatching into deployment pods.    |
| `--deploy-list <deploy-list>` | A comma-separated list of deployment IDs to run the suite inside.              |
| `--grep <pattern>`            | Runs only tests whose name matches the pattern.                                |
| `--watch`                     | Keeps the runner open and re-runs affected suites on change.                   |
| `--no-coverage`               | Skips coverage instrumentation and reporters.                                  |
| `--allure`                    | Writes Allure results for the cluster dashboard alongside the run.             |
| `--dashboard`                 | Applies the Allure dashboard to the cluster and exits.                         |
| `--job`                       | Runs the selected suite on the cluster as a Kubernetes Job (requires --image). |
| `--image <image>`             | Image carrying the engine and its dependencies, for --job.                     |
| `--node-name <node-name>`     | Pins the --job pod to this node.                                               |
| `--host <host>`               | Hostname to route the --dashboard sub-path on.                                 |
| `--namespace <namespace>`     | Kubernetes namespace for --dashboard, --job and --deploy-list.                 |
| `--dry-run`                   | Renders the --dashboard or --job manifests without applying them.              |
| `--pod-name <pod-name>`       | Waits for this cluster object to reach --pod-status instead of running tests.  |
| `--pod-status <pod-status>`   | Status --pod-name waits for (default: "Running").                              |
| `--kind-type <kind-type>`     | Kind --pod-name queries (default: "pods").                                     |
| `-h, --help`                  | display help for command                                                       |

---

### underpost docker-compose

General-purpose Docker Compose development pipeline (mirrors the Kubernetes dev stack).

**Usage:** `underpost docker-compose [options] [target]`

#### Arguments

| Argument | Description                                                       |
| -------- | ----------------------------------------------------------------- |
| `target` | Optional service name for --logs, --shell, --restart, or --build. |

#### Options

| Option                                    | Description                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--install`                               | Install Docker Engine and the Compose v2 plugin on RHEL/Rocky hosts.                                                                                                                                                                                                                                  |
| `--reset`                                 | Comprehensive teardown (equivalent to cluster --reset): removes all stack containers, the network, named volumes (destroys data), orphans, and generated artifacts.                                                                                                                                   |
| `--force`                                 | Force reinstall (--install), remove volumes (--down), or also drop the env-file (--reset).                                                                                                                                                                                                            |
| `--deploy-id <deploy-id>`                 | Deployment to run as the app container (default: dd-default). 'dd-default' self-bootstraps a fresh engine; any other id runs the standard 'underpost start' command (mirrors src/cli/deploy.js).                                                                                                      |
| `--docker-compose-id <docker-compose-id>` | Selects a canonical custom-workflow stack at engine-private/conf/<deploy-id>/docker-compose/<docker-compose-id>/ (docker-compose.yml + compose.env + nginx.conf, used as-is; nginx/env generation is skipped). e.g. --deploy-id dd-cyberia --docker-compose-id cyberia for the Cyberia MMO ecosystem. |
| `--env <env>`                             | Deployment environment for non-default deploy ids (default: development).                                                                                                                                                                                                                             |
| `--generate`                              | Render dynamic supporting files (nginx router config, env-file, app-command override).                                                                                                                                                                                                                |
| `--up`                                    | Start the full stack detached (regenerates config first).                                                                                                                                                                                                                                             |
| `--down`                                  | Stop and remove containers (and orphans).                                                                                                                                                                                                                                                             |
| `--volumes`                               | With --down, also remove named volumes (destroys persisted data).                                                                                                                                                                                                                                     |
| `--restart`                               | Restart services (optionally a single [target]).                                                                                                                                                                                                                                                      |
| `--build`                                 | With --up rebuild images; alone, rebuilds images with --no-cache.                                                                                                                                                                                                                                     |
| `--pull`                                  | Pull upstream images for all services.                                                                                                                                                                                                                                                                |
| `--logs`                                  | Follow logs for all services (optionally a single [target]).                                                                                                                                                                                                                                          |
| `--status`                                | Show a formatted status table of services.                                                                                                                                                                                                                                                            |
| `--shell`                                 | Open an interactive shell in [target] (default: app).                                                                                                                                                                                                                                                 |
| `--exec <subcommand>`                     | General-purpose passthrough docker compose subcommand.                                                                                                                                                                                                                                                |
| `--compose-file <path>`                   | Path to the compose file (default: docker-compose.yml).                                                                                                                                                                                                                                               |
| `--env-file <path>`                       | Path to the compose env-file (default: docker/compose.env).                                                                                                                                                                                                                                           |
| `--nginx-conf <path>`                     | Path to the generated nginx config (default: docker/nginx/default.conf).                                                                                                                                                                                                                              |
| `-h, --help`                              | display help for command                                                                                                                                                                                                                                                                              |

---

### underpost lxd

Manages LXD virtual machines as K3s nodes (control plane or workers).

**Usage:** `underpost lxd [options] [vm-id]`

#### Arguments

| Argument | Description                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| `vm-id`  | VM identifier shared by current-VM flags like --vm-create, --vm-delete, --vm-init, --vm-info, and --vm-test. |

#### Options

| Option                            | Description                                                                                                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--init`                          | Initializes LXD on the current machine via preseed.                                                                                                                                                                    |
| `--reset`                         | Host-safe reset: removes proxy devices, stops/deletes VMs, drops admin-profile and lxdbr0. Does NOT touch the LXD snap or storage pools.                                                                               |
| `--purge`                         | DESTRUCTIVE: gracefully shuts down the LXD daemon (60s timeout), then removes the LXD snap. Combine with --reset to wipe per-VM state first. Safe replacement for the prior aggressive teardown.                       |
| `--shutdown`                      | Pre-host-reboot procedure: gracefully stops every VM and the LXD daemon. Run BEFORE any reboot/poweroff to keep the host bootable.                                                                                     |
| `--restore`                       | Symmetric to --shutdown: starts the LXD daemon, waits for it to be responsive, then starts every VM. VMs created via admin-profile have boot.autostart=false, so this is the explicit "bring the lab back up" command. |
| `--install`                       | Installs the LXD snap.                                                                                                                                                                                                 |
| `--dev`                           | Use local paths instead of the global npm installation.                                                                                                                                                                |
| `--create-virtual-network`        | Creates the lxdbr0 bridge network.                                                                                                                                                                                     |
| `--ipv4-address <cidr>`           | IPv4 address/CIDR for the lxdbr0 bridge network (default: "10.250.250.1/24").                                                                                                                                          |
| `--create-admin-profile`          | Creates the admin-profile for VM management.                                                                                                                                                                           |
| `--control`                       | Initialize the target VM as a K3s control plane node.                                                                                                                                                                  |
| `--worker`                        | Initialize the target VM as a K3s worker node.                                                                                                                                                                         |
| `--vm-create`                     | Copy the LXC launch command for the command argument [vm-id] to the clipboard.                                                                                                                                         |
| `--vm-delete`                     | SAFELY stop and delete the command argument [vm-id] (removes proxy devices first, then stops, then deletes). Safe to re-run.                                                                                           |
| `--vm-init`                       | Bring the command argument [vm-id] up as a K3s node end-to-end: OS base setup, mirror /home/dd/engine into the VM, then K3s role install via the local engine (use with --control or --worker).                        |
| `--vm-info`                       | Display full configuration and status for the command argument [vm-id].                                                                                                                                                |
| `--vm-test`                       | Run connectivity and health checks on the command argument [vm-id].                                                                                                                                                    |
| `--vm-sync-engine`                | Re-copy the host engine source into the command argument [vm-id], overriding whatever is currently there (equivalent to the engine-bootstrap step of --vm-init in isolation).                                          |
| `--root-size <gb-size>`           | Root disk size in GiB for --vm-create (default: 32).                                                                                                                                                                   |
| `--join-node <nodes>`             | Join a K3s worker to a control plane. Standalone format: "workerName,controlName". When used with --vm-init --worker, provide just the control node name for auto-join.                                                |
| `--expose <vm-name:ports>`        | Proxy host ports to a VM (e.g., "k3s-control:80,443").                                                                                                                                                                 |
| `--node-port <port>`              | Customizes the VM-side (connect) port for --expose, so the host listens on the given port but proxies to this NodePort inside the VM (e.g. expose host 27017 -> VM NodePort 32017).                                    |
| `--delete-expose <vm-name:ports>` | Remove proxied ports from a VM (e.g., "k3s-control:80,443").                                                                                                                                                           |
| `--copy`                          | For two-phase flows that surface a command for the user to execute (e.g. --create-admin-profile phase 1), copy the command to the clipboard instead of printing it to the terminal.                                    |
| `--namespace <namespace>`         | Kubernetes namespace context (defaults to "default").                                                                                                                                                                  |
| `--maas-project <project>`        | LXD project managed by MAAS (e.g. "k3s-cluster"). When set, all lxc commands target this project so MAAS enumerates the VMs in its machines UI.                                                                        |
| `--move-to-project`               | Stop the [vm-id] VM in the default project, move it to --maas-project, then start it so MAAS picks it up. Requires --maas-project.                                                                                     |
| `-h, --help`                      | display help for command                                                                                                                                                                                               |

---

### underpost baremetal

Manages baremetal server operations, including installation, database setup, commissioning, and user management.

**Usage:** `underpost baremetal [options] [workflow-id]`

#### Options

| Option                                         | Description                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ip-address <ip-address>`                    | The IP address of the control server or the local machine.                                                                                                                                                                                                                            |
| `--hostname <hostname>`                        | The hostname of the target baremetal machine.                                                                                                                                                                                                                                         |
| `--ip-file-server <ip-file-server>`            | The IP address of the file server (NFS/TFTP).                                                                                                                                                                                                                                         |
| `--ip-config <ip-config>`                      | IP configuration string for the baremetal machine.                                                                                                                                                                                                                                    |
| `--netmask <netmask>`                          | Netmask of network.                                                                                                                                                                                                                                                                   |
| `--dns-server <dns-server>`                    | DNS server IP address.                                                                                                                                                                                                                                                                |
| `--control-server-install`                     | Installs the baremetal control server.                                                                                                                                                                                                                                                |
| `--control-server-uninstall`                   | Uninstalls the baremetal control server.                                                                                                                                                                                                                                              |
| `--control-server-restart`                     | Restarts the baremetal control server.                                                                                                                                                                                                                                                |
| `--control-server-db-install`                  | Installs up the database for the baremetal control server.                                                                                                                                                                                                                            |
| `--control-server-db-uninstall`                | Uninstalls the database for the baremetal control server.                                                                                                                                                                                                                             |
| `--create-machine`                             | Creates a new baremetal machine entry in the database.                                                                                                                                                                                                                                |
| `--mac <mac>`                                  | Specifies the MAC address for baremetal machine operations. Use "random" for random MAC, "hardware" to use device's actual MAC (no spoofing), or specify a MAC address.                                                                                                               |
| `--ipxe`                                       | Chainloads iPXE to normalize identity before commissioning.                                                                                                                                                                                                                           |
| `--ipxe-rebuild`                               | Forces rebuild of iPXE binary with embedded boot script.                                                                                                                                                                                                                              |
| `--ipxe-build-iso <iso-path>`                  | Builds a standalone iPXE ISO with embedded script for the specified workflow ID.                                                                                                                                                                                                      |
| `--install-packer`                             | Installs Packer CLI.                                                                                                                                                                                                                                                                  |
| `--packer-maas-image-template <template-path>` | Creates a new image folder from canonical/packer-maas template path (requires workflow-id).                                                                                                                                                                                           |
| `--packer-workflow-id <workflow-id>`           | Specifies the workflow ID for Packer MAAS image operations.                                                                                                                                                                                                                           |
| `--packer-maas-image-build`                    | Builds a MAAS image using Packer for the workflow specified by --packer-workflow-id.                                                                                                                                                                                                  |
| `--packer-maas-image-upload`                   | Uploads an existing MAAS image artifact without rebuilding for the workflow specified by --packer-workflow-id.                                                                                                                                                                        |
| `--packer-maas-image-cached`                   | Continue last build without removing artifacts (used with --packer-maas-image-build).                                                                                                                                                                                                 |
| `--remove-machines <system-ids>`               | Removes baremetal machines by comma-separated system IDs, or use "all"                                                                                                                                                                                                                |
| `--clear-discovered`                           | Clears all discovered baremetal machines from the database.                                                                                                                                                                                                                           |
| `--commission`                                 | Init workflow for commissioning a physical machine.                                                                                                                                                                                                                                   |
| `--install-disk [device]`                      | Explicit target install disk for Rocky deployment (e.g. /dev/nvme0n1). Omit or leave empty to auto-detect the internal disk.                                                                                                                                                          |
| `--no-auto-install`                            | Disables the ephemeral runtime AUTO_INSTALL fallback (controller must trigger install).                                                                                                                                                                                               |
| `--no-remote-install`                          | Skips the controller-side remote install orchestration over SSH.                                                                                                                                                                                                                      |
| `--worker`                                     | Post-install infra role: join the deployed node as a Kubernetes worker (requires --control <ip>). Without this flag the node is set up as a control-plane.                                                                                                                            |
| `--control <ip>`                               | Control-plane IP the worker node joins (used with --worker for kubeadm infra setup).                                                                                                                                                                                                  |
| `--ssh-key-dir <dir>`                          | Directory holding the SSH key pair used for commissioning/orchestration (expects <dir>/id_rsa and <dir>/id_rsa.pub). Overrides the workflow "sshKeyDir"; defaults to engine-private/deploy/users/<user> for a non-root --user, otherwise engine-private/deploy. Supports a leading ~. |
| `--deploy-id <deploy-id>`                      | Deployment ID used to resolve the private engine repo cloned onto the node (engine-<suffix>-private.                                                                                                                                                                                  |
| `--user <user>`                                | SSH user whose cluster scoped key pair is used (engine-private/deploy/users/<user>/id_rsa) and the login user on an existing control-plane (defaults to root, whose key is engine-private/deploy/id_rsa). Mirrors the ssh command --user.                                             |
| `--engine-repo <url>`                          | Custom engine repo cloned + normalized to /home/dd/engine on the node (default: <GITHUB_USERNAME>/engine).                                                                                                                                                                            |
| `--engine-branch <branch>`                     | Branch of the engine repo to clone on the node.                                                                                                                                                                                                                                       |
| `--engine-private-repo <url>`                  | Custom private repo cloned + normalized to /home/dd/engine/engine-private on the node (default: <GITHUB_USERNAME>/engine-<id>-private).                                                                                                                                               |
| `--engine-private-branch <branch>`             | Branch of the engine-private repo to clone on the node.                                                                                                                                                                                                                               |
| `--bootstrap-http-server-run`                  | Runs a temporary bootstrap HTTP server for generic purposes such as serving iPXE scripts or ISO images during commissioning.                                                                                                                                                          |
| `--bootstrap-http-server-path <path>`          | Sets a custom bootstrap HTTP server path for baremetal commissioning.                                                                                                                                                                                                                 |
| `--bootstrap-http-server-port <port>`          | Sets a custom bootstrap HTTP server port for baremetal commissioning.                                                                                                                                                                                                                 |
| `--iso-url <url>`                              | Uses a custom ISO URL for baremetal machine commissioning.                                                                                                                                                                                                                            |
| `--nfs-build`                                  | Builds an NFS root filesystem for a workflow id config architecture using QEMU emulation.                                                                                                                                                                                             |
| `--nfs-mount`                                  | Mounts the NFS root filesystem for a workflow id config architecture.                                                                                                                                                                                                                 |
| `--nfs-reset`                                  | Resets the NFS server completely, closing all connections before reloading exports.                                                                                                                                                                                                   |
| `--nfs-unmount`                                | Unmounts the NFS root filesystem for a workflow id config architecture.                                                                                                                                                                                                               |
| `--nfs-build-server`                           | Builds the NFS server for a workflow id config architecture.                                                                                                                                                                                                                          |
| `--nfs-sh`                                     | Copies QEMU emulation root entrypoint shell command to the clipboard.                                                                                                                                                                                                                 |
| `--cloud-init`                                 | Sets the kernel parameters and sets the necessary seed users on the HTTP server.                                                                                                                                                                                                      |
| `--cloud-init-update`                          | Updates cloud init for a workflow id config architecture.                                                                                                                                                                                                                             |
| `--ubuntu-tools-build`                         | Builds ubuntu tools for chroot environment.                                                                                                                                                                                                                                           |
| `--ubuntu-tools-test`                          | Tests ubuntu tools in chroot environment.                                                                                                                                                                                                                                             |
| `--rocky-tools-build`                          | Builds rocky linux tools for chroot environment.                                                                                                                                                                                                                                      |
| `--rocky-tools-test`                           | Tests rocky linux tools in chroot environment.                                                                                                                                                                                                                                        |
| `--bootcmd <bootcmd-list>`                     | Comma-separated list of boot commands to execute.                                                                                                                                                                                                                                     |
| `--runcmd <runcmd-list>`                       | Comma-separated list of run commands to execute.                                                                                                                                                                                                                                      |
| `--logs <log-id>`                              | Displays logs for log id: dhcp,dhcp-lease,dhcp-lan,cloud-init,cloud-init-machine,cloud-init-config                                                                                                                                                                                    |
| `--dev`                                        | Sets the development context environment for baremetal operations.                                                                                                                                                                                                                    |
| `--ls`                                         | Lists available boot resources and machines.                                                                                                                                                                                                                                          |
| `--resume-infra-setup`                         | Skip commissioning, OS install, and all bootstrapping; resume only the SSH-based infra setup (kubeadm join/init) on a node that already has the OS installed and is reachable via SSH.                                                                                                |
| `--resume-join`                                | Skip everything except the kubeadm join command. Assumes engine, Node.js, CRI-O, kubelet, and kubeadm are already installed. Only retrieves a fresh join token from the control-plane and runs kubeadm join.                                                                          |
| `-h, --help`                                   | display help for command                                                                                                                                                                                                                                                              |

---

### underpost package

Generates the package manifests a deploy id owns, from the engine manifest and the deploy's product catalog, and installs the dependencies that catalog pins.

**Usage:** `underpost package [options] [deploy-id]`

#### Arguments

| Argument    | Description                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| `deploy-id` | Deploy id, or a comma-separated list, to act on. Defaults to every deploy id in the private configuration tree. |

#### Options

| Option                    | Description                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `--sync`                  | Regenerates each deploy manifest from the engine manifest and the deploy catalog (default). |
| `--install`               | Installs the dependencies the deploy catalog pins into this checkout.                       |
| `--rename <name>`         | Renames this checkout's package, in its manifest and its lockfile.                          |
| `--set-repo <owner/repo>` | Points this checkout's package at a repository.                                             |
| `--dry-run`               | For --sync: resolves the manifests without writing them.                                    |
| `-h, --help`              | display help for command                                                                    |

---

### underpost release

Release orchestrator for building new versions and deploying releases of the Underpost CLI.

**Usage:** `underpost release [options] [version]`

#### Arguments

| Argument  | Description                                                                 |
| --------- | --------------------------------------------------------------------------- |
| `version` | The new version string to set (e.g., "3.1.4"). Defaults to current version. |

#### Options

| Option                        | Description                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--build`                     | Builds a new version: tests template, bumps versions, rebuilds manifests and configs.                                                                                                |
| `--deploy`                    | Deploys the release: syncs secrets, commits, and pushes to remote repositories.                                                                                                      |
| `--ci-push <deploy-id>`       | Local equivalent of engine-*.ci.yml: builds dd-{deploy-id} and pushes to the engine-{deploy-id} repository. Accepts the suffix (e.g., "cyberia"), "dd-cyberia", or "engine-cyberia". |
| `--message <message>`         | Commit message for --ci-push or --pwa-build (defaults to last commit of the engine repository).                                                                                      |
| `--pwa-build`                 | Runs the pwa-microservices-template update flow: always re-clones, syncs engine sources, installs, builds, and pushes.                                                               |
| `--dry-run`                   | For --build: previews version-bump changes (per-file substitution counts) without writing files or running downstream commands.                                                      |
| `--mongo-host <host>`         | For --build: override DB_HOST in the template .env.example for the smoke test (e.g., "192.168.1.82:27017").                                                                          |
| `--mongo-user <user>`         | For --build: override DB_USER in the template .env.example for the smoke test.                                                                                                       |
| `--mongo-password <password>` | For --build: override DB_PASSWORD in the template .env.example for the smoke test.                                                                                                   |
| `--valkey-host <host>`        | For --build: override VALKEY_HOST in the template .env.example for the smoke test (e.g., "192.168.1.82").                                                                            |
| `-h, --help`                  | display help for command                                                                                                                                                             |

---
