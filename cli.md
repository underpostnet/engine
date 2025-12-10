## underpost ci/cd cli v2.95.8

### Usage: `underpost [options] [command]`
  ```
 Options:
  -V, --version                                              output the version number
  -h, --help                                                 display help for command

Commands:
  new [options] [app-name]                                   Initializes a new Underpost project, service, or configuration.
  start [options] <deploy-id> [env]                          Initiates application servers, build pipelines, or other defined services based on the deployment ID.
  clone [options] <uri>                                      Clones a specified GitHub repository into the current directory.
  pull [options] <path> <uri>                                Pulls the latest changes from a specified GitHub repository.
  cmt [options] [path] [commit-type] [module-tag] [message]  Manages commits to a GitHub repository, supporting various commit types and options.
  push [options] <path> <uri>                                Pushes committed changes from a local repository to a remote GitHub repository.
  env [deploy-id] [env] [subConf]                            Sets environment variables and configurations related to a specific deployment ID.
  static [options]                                           Manages static build of page, bundles, and documentation with comprehensive customization options.
  config [options] <operator> [key] [value]                  Manages Underpost configurations using various operators.
  root                                                       Displays the root path of the npm installation.
  ip [options] [ips]                                         Displays the current public machine IP addresses.
  cluster [options] [pod-name]                               Manages Kubernetes clusters, defaulting to Kind cluster initialization.
  deploy [options] [deploy-list] [env]                       Manages application deployments, defaulting to deploying development pods.
  secret [options] <platform>                                Manages secrets for various platforms.
  image [options]                                            Manages Docker images, including building, saving, and loading into Kubernetes clusters.
  install                                                    Quickly imports Underpost npm dependencies by copying them.
  db [options] <deploy-list>                                 Manages database operations with support for MariaDB and MongoDB, including import/export, multi-pod targeting, and Git integration.
  metadata [options] [deploy-id] [host] [path]               Manages cluster metadata operations, including import and export.
  script [options] <operator> <script-name> [script-value]   Supports a variety of built-in Underpost global scripts, their preset lifecycle events, and arbitrary custom scripts.
  cron [options] [deploy-list] [job-list]                    Manages cron jobs, including initialization, execution, and configuration updates.
  fs [options] [path]                                        Manages file storage, defaulting to file upload operations.
  test [options] [deploy-list]                               Manages and runs tests, defaulting to the current Underpost default test suite.
  monitor [options] <deploy-id> [env]                        Manages health server monitoring for specified deployments.
  ssh [options]
  run [options] <runner-id> [path]                           Runs specified scripts using various runners.
  lxd [options]                                              Manages LXD containers and virtual machines.
  baremetal [options] [workflow-id] [hostname] [ip-address]  Manages baremetal server operations, including installation, database setup, commissioning, and user management.
  help [command]                                             display help for command
 
```

## Commands:
    

### `new` :
```
 Usage: underpost new [options] [app-name]

Initializes a new Underpost project, service, or configuration.

Arguments:
  app-name                          The name of the new project.

Options:
  --deploy-id <deploy-id>           Crete deploy ID conf env files
  --sub-conf <sub-conf>             Create sub conf env files
  --cluster                         Create deploy ID cluster files and sync to
                                    current cluster
  --build-repos                     Create deploy ID repositories
  --build                           Build the deployment to
                                    pwa-microservices-template (requires
                                    --deploy-id)
  --clean-template                  Clean the build directory
                                    (pwa-microservices-template)
  --sync-conf                       Sync configuration to private repositories
                                    (requires --deploy-id)
  --purge                           Remove deploy ID conf and all related
                                    repositories (requires --deploy-id)
  --dev                             Sets the development cli context
  --default-conf                    Create default deploy ID conf env files
  --conf-workflow-id <workflow-id>  Set custom configuration workflow ID for
                                    conf generation
  -h, --help                        display help for command
 
```
  

### `start` :
```
 Usage: underpost start [options] <deploy-id> [env]

Initiates application servers, build pipelines, or other defined services based
on the deployment ID.

Arguments:
  deploy-id   The unique identifier for the deployment configuration.
  env         Optional: The environment to start (e.g., "development",
              "production"). Defaults to "development".

Options:
  --run       Starts application servers and monitors their health.
  --build     Triggers the client-side application build process.
  -h, --help  display help for command
 
```
  

### `clone` :
```
 Usage: underpost clone [options] <uri>

Clones a specified GitHub repository into the current directory.

Arguments:
  uri         The URI of the GitHub repository (e.g., "username/repository").

Options:
  --bare      Performs a bare clone, downloading only the .git files.
  -g8         Uses the g8 repository extension for cloning.
  -h, --help  display help for command
 
```
  

### `pull` :
```
 Usage: underpost pull [options] <path> <uri>

Pulls the latest changes from a specified GitHub repository.

Arguments:
  path        The absolute or relative directory path where the repository is
              located.
  uri         The URI of the GitHub repository (e.g., "username/repository").

Options:
  -g8         Uses the g8 repository extension for pulling.
  -h, --help  display help for command
 
```
  

### `cmt` :
```
 Usage: underpost cmt [options] [path] [commit-type] [module-tag] [message]

Manages commits to a GitHub repository, supporting various commit types and
options.

Arguments:
  path                     The absolute or relative directory path of the
                           repository.
  commit-type              The type of commit to perform. Options: feat, fix,
                           docs, style, refactor, perf, ci, cd, infra, build,
                           test, chore, revert, backup.
  module-tag               Optional: Sets a specific module tag for the commit.
  message                  Optional: Provides an additional custom message for
                           the commit.

Options:
  --log <latest-n>         Shows commit history from the specified number of
                           latest n path commits.
  --last-msg <latest-n>    Displays the last n commit message.
  --empty                  Allows committing with empty files.
  --copy                   Copies the generated commit message to the
                           clipboard.
  --info                   Displays information about available commit types.
  --diff                   Shows the current git diff changes.
  --edit                   Edit last commit.
  --msg <msg>              Sets a custom commit message.
  --deploy-id <deploy-id>  Sets the deployment configuration ID for the commit
                           context.
  --cached                 Commit staged changes only or context.
  --hashes <hashes>        Comma-separated list of specific file hashes of
                           commits.
  --extension <extension>  specific file extensions of commits.
  -h, --help               display help for command
 
```
  

### `push` :
```
 Usage: underpost push [options] <path> <uri>

Pushes committed changes from a local repository to a remote GitHub repository.

Arguments:
  path        The absolute or relative directory path of the repository.
  uri         The URI of the GitHub repository (e.g., "username/repository").

Options:
  -f          Forces the push, overwriting the remote repository history.
  -g8         Uses the g8 repository extension for pushing.
  -h, --help  display help for command
 
```
  

### `env` :
```
 Usage: underpost env [options] [deploy-id] [env] [subConf]

Sets environment variables and configurations related to a specific deployment
ID.

Arguments:
  deploy-id   The deployment configuration ID. Use 'clean' to restore default
              environment settings. Use 'root' to load underpost root env. Use
              'current' to get plain current deploy Id.
  env         Optional: The environment to set (e.g., "production",
              "development"). Defaults to "production".
  subConf     Optional: The sub configuration to set.

Options:
  -h, --help  display help for command
 
```
  

### `static` :
```
 Usage: underpost static [options]

Manages static build of page, bundles, and documentation with comprehensive
customization options.

Options:
  --page <ssr-component-path>  Build custom static pages.
  --title <title>              Sets a custom title for the static page
                               (deprecated: use --config-file).
  --output-path <output-path>  Sets the output path for the generated static
                               page.
  --description <description>  Page description for SEO.
  --keywords <keywords>        Comma-separated keywords for SEO.
  --author <author>            Page author.
  --theme-color <color>        Theme color for mobile browsers.
  --canonical-url <url>        Canonical URL for SEO.
  --thumbnail <url>            Open Graph thumbnail image URL.
  --locale <locale>            Page locale (default: en-US).
  --site-name <name>           Site name for Open Graph.
  --head-scripts <paths>       Comma-separated paths to scripts for head
                               section.
  --body-scripts <paths>       Comma-separated paths to scripts for body
                               section.
  --styles <paths>             Comma-separated paths to stylesheets.
  --favicon <path>             Favicon path.
  --apple-touch-icon <path>    Apple touch icon path.
  --manifest <path>            Web manifest path.
  --head-components <paths>    Comma-separated SSR head component paths.
  --body-components <paths>    Comma-separated SSR body component paths.
  --deploy-id <deploy-id>      Build static assets for a specific deployment
                               ID.
  --build                      Triggers the static build process for the
                               specified deployment ID.
  --build-host <build-host>    Sets a custom build host for static documents or
                               assets.
  --build-path <build-path>    Sets a custom build path for static documents or
                               assets.
  --env <env>                  Sets the environment for the static build (e.g.,
                               "development", "production").
  --minify                     Minify HTML output (default: true for
                               production).
  --no-minify                  Disable HTML minification.
  --config-file <path>         Path to JSON configuration file.
  --generate-config [path]     Generate a template configuration file.
  --lang <lang>                HTML lang attribute (default: en).
  --dir <dir>                  HTML dir attribute (default: ltr).
  --dev                        Sets the development cli context
  -h, --help                   display help for command
 
```
  

### `config` :
```
 Usage: underpost config [options] <operator> [key] [value]

Manages Underpost configurations using various operators.

Arguments:
  operator    The configuration operation to perform. Options: set, delete,
              get, list, clean.
  key         Optional: The specific configuration key to manage.
  value       Optional: The value to set for the configuration key.

Options:
  --plain     Prints the configuration value in plain text.
  -h, --help  display help for command
 
```
  

### `root` :
```
 Usage: underpost root [options]

Displays the root path of the npm installation.

Options:
  -h, --help  display help for command
 
```
  

### `ip` :
```
 Usage: underpost ip [options] [ips]

Displays the current public machine IP addresses.

Arguments:
  ips                   Optional args comma-separated list of IP to process.

Options:
  --copy                Copies the IP addresses to the clipboard.
  --ban-ingress-add     Adds IP addresses to banned ingress list.
  --ban-ingress-remove  Removes IP addresses from banned ingress list.
  --ban-ingress-list    Lists all banned ingress IP addresses.
  --ban-ingress-clear   Clears all banned ingress IP addresses.
  --ban-egress-add      Adds IP addresses to banned egress list.
  --ban-egress-remove   Removes IP addresses from banned egress list.
  --ban-egress-list     Lists all banned egress IP addresses.
  --ban-egress-clear    Clears all banned egress IP addresses.
  --ban-both-add        Adds IP addresses to both banned ingress and egress
                        lists.
  --ban-both-remove     Removes IP addresses from both banned ingress and
                        egress lists.
  -h, --help            display help for command
 
```
  

### `cluster` :
```
 Usage: underpost cluster [options] [pod-name]

Manages Kubernetes clusters, defaulting to Kind cluster initialization.

Arguments:
  pod-name                             Optional: Filters information by a
                                       specific pod name.

Options:
  --reset                              Deletes all clusters and prunes all
                                       related data and caches.
  --mariadb                            Initializes the cluster with a MariaDB
                                       statefulset.
  --mysql                              Initializes the cluster with a MySQL
                                       statefulset.
  --mongodb                            Initializes the cluster with a MongoDB
                                       statefulset.
  --mongo-db-host <host>               Set custom mongo db host
  --postgresql                         Initializes the cluster with a
                                       PostgreSQL statefulset.
  --mongodb4                           Initializes the cluster with a MongoDB
                                       4.4 service.
  --valkey                             Initializes the cluster with a Valkey
                                       service.
  --contour                            Initializes the cluster with Project
                                       Contour base HTTPProxy and Envoy.
  --cert-manager                       Initializes the cluster with a Let's
                                       Encrypt production ClusterIssuer.
  --dedicated-gpu                      Initializes the cluster with dedicated
                                       GPU base resources and environment
                                       settings.
  --full                               Initializes the cluster with all
                                       available statefulsets and services.
  --ns-use <ns-name>                   Switches the current Kubernetes context
                                       to the specified namespace (creates if
                                       it doesn't exist).
  --kubeadm                            Initializes the cluster using kubeadm
                                       for control plane management.
  --pod-network-cidr <cidr>            Sets custom pod network CIDR for kubeadm
                                       cluster initialization (defaults to
                                       "192.168.0.0/16").
  --control-plane-endpoint <endpoint>  Sets custom control plane endpoint for
                                       kubeadm cluster initialization (defaults
                                       to "localhost:6443").
  --grafana                            Initializes the cluster with a Grafana
                                       deployment.
  --prom [hosts]                       Initializes the cluster with a
                                       Prometheus Operator deployment and
                                       monitor scrap for specified hosts.
  --dev                                Initializes a development-specific
                                       cluster configuration.
  --list-pods                          Displays detailed information about all
                                       pods.
  --pull-image                         Sets an optional associated image to
                                       pull during initialization.
  --init-host                          Installs necessary Kubernetes node CLI
                                       tools (e.g., kind, kubeadm, docker,
                                       podman, helm).
  --uninstall-host                     Uninstalls all host components installed
                                       by init-host.
  --config                             Sets the base Kubernetes node
                                       configuration.
  --worker                             Sets the context for a worker node.
  --chown                              Sets the appropriate ownership for
                                       Kubernetes kubeconfig files.
  --k3s                                Initializes the cluster using K3s
                                       (Lightweight Kubernetes).
  --hosts <hosts>                      A comma-separated list of cluster
                                       hostnames or IP addresses.
  --remove-volume-host-paths           Removes specified volume host paths
                                       after execution.
  --namespace <namespace>              Kubernetes namespace for cluster
                                       operations (defaults to "default").
  -h, --help                           display help for command
 
```
  

### `deploy` :
```
 Usage: underpost deploy [options] [deploy-list] [env]

Manages application deployments, defaulting to deploying development pods.

Arguments:
  deploy-list                        A comma-separated list of deployment IDs
                                     (e.g., "default-a,default-b").
  env                                Optional: The environment for deployment
                                     (e.g., "development", "production").
                                     Defaults to "development".

Options:
  --remove                           Deletes specified deployments and their
                                     associated services.
  --sync                             Synchronizes deployment environment
                                     variables, ports, and replica counts.
  --info-router                      Displays the current router structure and
                                     configuration.
  --expose                           Exposes services matching the provided
                                     deployment ID list.
  --cert                             Resets TLS/SSL certificate secrets for
                                     deployments.
  --cert-hosts <hosts>               Resets TLS/SSL certificate secrets for
                                     specified hosts.
  --node <node>                      Sets optional node for deployment
                                     operations.
  --build-manifest                   Builds Kubernetes YAML manifests,
                                     including deployments, services, proxies,
                                     and secrets.
  --replicas <replicas>              Sets a custom number of replicas for
                                     deployments.
  --image <image>                    Sets a custom image for deployments.
  --versions <deployment-versions>   A comma-separated list of custom
                                     deployment versions.
  --traffic <traffic-versions>       A comma-separated list of custom
                                     deployment traffic weights.
  --disable-update-deployment        Disables updates to deployments.
  --disable-update-proxy             Disables updates to proxies.
  --disable-deployment-proxy         Disables proxies of deployments.
  --disable-update-volume            Disables updates to volume mounts during
                                     deployment.
  --status                           Retrieves current network traffic data
                                     from resource deployments and the host
                                     machine network configuration.
  --kubeadm                          Enables the kubeadm context for deployment
                                     operations.
  --etc-hosts                        Enables the etc-hosts context for
                                     deployment operations.
  --restore-hosts                    Restores default `/etc/hosts` entries.
  --disable-update-underpost-config  Disables updates to Underpost
                                     configuration during deployment.
  --namespace <namespace>            Kubernetes namespace for deployment
                                     operations (defaults to "default").
  --kind-type <kind-type>            Specifies the Kind cluster type for
                                     deployment operations.
  --port <port>                      Sets up port forwarding from local to
                                     remote ports.
  -h, --help                         display help for command
 
```
  

### `secret` :
```
 Usage: underpost secret [options] <platform>

Manages secrets for various platforms.

Arguments:
  platform                            The secret management platform. Options:
                                      docker, underpost.

Options:
  --init                              Initializes the secrets platform
                                      environment.
  --create-from-file <path-env-file>  Creates secrets from a specified
                                      environment file.
  --list                              Lists all available secrets for the
                                      platform.
  -h, --help                          display help for command
 
```
  

### `image` :
```
 Usage: underpost image [options]

Manages Docker images, including building, saving, and loading into Kubernetes
clusters.

Options:
  --build                              Builds a Docker image using Podman,
                                       optionally saves it as a tar archive,
                                       and loads it into a specified Kubernetes
                                       cluster (Kind, Kubeadm, or K3s).
  --ls                                 Lists all available Underpost Dockerfile
                                       images.
  --rm <image-id>                      Removes specified Underpost Dockerfile
                                       images.
  --path [path]                        The path to the Dockerfile directory.
  --image-name [image-name]            Sets a custom name for the Docker image.
  --image-path [image-path]            Sets the output path for the tar image
                                       archive.
  --dockerfile-name [dockerfile-name]  Sets a custom name for the Dockerfile.
  --podman-save                        Exports the built image as a tar file
                                       using Podman.
  --pull-base                          Pulls base images and builds a
                                       "rockylinux9-underpost" image.
  --spec                               Get current cached list of container
                                       images used by all pods
  --namespace <namespace>              Kubernetes namespace for image
                                       operations (defaults to "default").
  --kind                               Set kind cluster env image context
                                       management.
  --kubeadm                            Set kubeadm cluster env image context
                                       management.
  --k3s                                Set k3s cluster env image context
                                       management.
  --node-name                          Set node name for kubeadm or k3s cluster
                                       env image context management.
  --secrets                            Includes Dockerfile environment secrets
                                       during the build.
  --secrets-path [secrets-path]        Specifies a custom path for Dockerfile
                                       environment secrets.
  --reset                              Performs a build without using the
                                       cache.
  --dev                                Use development mode.
  --pull-dockerhub <dockerhub-image>   Sets a custom Docker Hub image for base
                                       image pulls.
  -h, --help                           display help for command
 
```
  

### `install` :
```
 Usage: underpost install [options]

Quickly imports Underpost npm dependencies by copying them.

Options:
  -h, --help  display help for command
 
```
  

### `db` :
```
 Usage: underpost db [options] <deploy-list>

Manages database operations with support for MariaDB and MongoDB, including
import/export, multi-pod targeting, and Git integration.

Arguments:
  deploy-list                                A comma-separated list of deployment IDs (e.g., "default-a,default-b").

Options:
  --import                                   Imports container backups from specified repositories.
  --export                                   Exports container backups to specified repositories.
  --pod-name <pod-name>                      Comma-separated list of pod names or patterns (supports wildcards like "mariadb-*").
  --all-pods                                 Target all matching pods instead of just the first one.
  --primary-pod                              Automatically detect and use MongoDB primary pod (MongoDB only).
  --stats                                    Display database statistics (collection/table names with document/row counts).
  --collections <collections>                Comma-separated list of database collections to operate on.
  --out-path <out-path>                      Specifies a custom output path for backups.
  --drop                                     Drops the specified databases or collections before importing.
  --preserveUUID                             Preserves UUIDs during database import operations.
  --git                                      Enables Git integration for backup version control (clone, pull, commit, push to GitHub).
  --force-clone                              Forces cloning of the Git repository, overwriting local changes.
  --hosts <hosts>                            Comma-separated list of database hosts to filter operations.
  --paths <paths>                            Comma-separated list of paths to filter database operations.
  --ns <ns-name>                             Kubernetes namespace context for database operations (defaults to "default").
  --macro-rollback-export <n-commits-reset>  Exports a macro rollback script that reverts the last n commits (Git integration required).
  -h, --help                                 display help for command
 
```
  

### `metadata` :
```
 Usage: underpost metadata [options] [deploy-id] [host] [path]

Manages cluster metadata operations, including import and export.

Arguments:
  deploy-id    The deployment ID to manage metadata.
  host         The host to manage metadata.
  path         The path to manage metadata.

Options:
  --import     Imports from local storage.
  --export     Exports to local storage.
  --crons      Apply to cron data collection
  --instances  Apply to instance data collection
  --generate   Generate cluster metadata
  --itc        Apply under container execution context
  -h, --help   display help for command
 
```
  

### `script` :
```
 Usage: underpost script [options] <operator> <script-name> [script-value]

Supports a variety of built-in Underpost global scripts, their preset lifecycle
events, and arbitrary custom scripts.

Arguments:
  operator               The script operation to perform. Options: set, run,
                         get.
  script-name            The name of the script to execute.
  script-value           Optional: A literal command or a path to a script
                         file.

Options:
  --itc                  Executes the script within the container execution
                         context.
  --itc-path             Specifies container path options for script execution.
  --ns <ns-name>         Optional: Specifies the namespace context for script
                         execution.
  --pod-name <pod-name>  Optional: Specifies the pod name for script execution.
  -h, --help             display help for command
 
```
  

### `cron` :
```
 Usage: underpost cron [options] [deploy-list] [job-list]

Manages cron jobs, including initialization, execution, and configuration
updates.

Arguments:
  deploy-list               A comma-separated list of deployment IDs (e.g.,
                            "default-a,default-b").
  job-list                  A comma-separated list of job IDs. Options:
                            callback, initCronJobs, updatePackageScripts,
                            getRelatedDeployIdList. Defaults to all available
                            jobs.

Options:
  --init-pm2-cronjobs       Initializes PM2 cron jobs from configuration for
                            the specified deployment IDs.
  --git                     Uploads cron job configurations to GitHub.
  --update-package-scripts  Updates package.json start scripts for each
                            deploy-id configuration.
  -h, --help                display help for command
 
```
  

### `fs` :
```
 Usage: underpost fs [options] [path]

Manages file storage, defaulting to file upload operations.

Arguments:
  path                                     The absolute or relative directory path for file operations.

Options:
  --rm                                     Removes the specified file.
  --git                                    Displays current Git changes related to file storage.
  --recursive                              Uploads files recursively from the specified path.
  --deploy-id <deploy-id>                  Specifies the deployment configuration ID for file operations.
  --pull                                   Downloads the specified file.
  --force                                  Forces the action, overriding any warnings or conflicts.
  --storage-file-path <storage-file-path>  Specifies a custom file storage path.
  -h, --help                               display help for command
 
```
  

### `test` :
```
 Usage: underpost test [options] [deploy-list]

Manages and runs tests, defaulting to the current Underpost default test suite.

Arguments:
  deploy-list                A comma-separated list of deployment IDs (e.g.,
                             "default-a,default-b").

Options:
  --itc                      Executes tests within the container execution
                             context.
  --sh                       Copies the container entrypoint shell command to
                             the clipboard.
  --logs                     Displays container logs for test debugging.
  --pod-name <pod-name>      Optional: Specifies the pod name for test
                             execution.
  --pod-status <pod-status>  Optional: Filters tests by pod status.
  --kind-type <kind-type>    Optional: Specifies the Kind cluster type for
                             tests.
  -h, --help                 display help for command
 
```
  

### `monitor` :
```
 Usage: underpost monitor [options] <deploy-id> [env]

Manages health server monitoring for specified deployments.

Arguments:
  deploy-id                    The deployment configuration ID to monitor.
  env                          Optional: The environment to monitor (e.g.,
                               "development", "production"). Defaults to
                               "development".

Options:
  --ms-interval <ms-interval>  Sets a custom millisecond interval for
                               monitoring checks.
  --now                        Executes the monitor script immediately.
  --single                     Disables recurrence, running the monitor script
                               only once.
  --replicas <replicas>        Sets a custom number of replicas for monitoring.
                               Defaults to 1.
  --type <type>                Sets a custom monitor type.
  --sync                       Synchronizes with current proxy deployments and
                               traffic configurations.
  --namespace <namespace>      Sets the Kubernetes namespace for the
                               deployment. Defaults to "default".
  -h, --help                   display help for command
 
```
  

### `ssh` :
```
 Usage: underpost ssh [options]

Options:
  --deploy-id <deploy-id>  Sets deploy id context for ssh operations.
  --generate               Generates new ssh credential and stores it in
                           current private keys file storage.
  --user <user>            Sets custom ssh user
  --password <password>    Sets custom ssh password
  --host <host>            Sets custom ssh host
  --port <port>            Sets custom ssh port
  --filter <filter>        Filters ssh user credentials from current private
                           keys file storage.
  --groups <groups>        Sets comma-separated ssh user groups for the ssh
                           user credential.
  --user-add               Adds a new ssh user credential to current private
                           keys file storage.
  --user-remove            Removes an existing ssh user credential from current
                           private keys file storage.
  --user-ls                Lists all ssh user credentials from current private
                           keys file storage.
  --start                  Starts an SSH session with the specified
                           credentials.
  --reset                  Resets ssh configuration and deletes all stored
                           credentials.
  --keys-list              Lists all ssh keys from current private keys file
                           storage.
  --hosts-list             Lists all ssh hosts from current private keys file
                           storage.
  --disable-password       Disables password authentication for the SSH
                           session.
  --key-test               Tests the SSH key using ssh-keygen.
  --stop                   Stops the SSH service.
  --status                 Checks the status of the SSH service.
  --connect-uri            Displays the connection URI.
  --copy                   Copies the connection URI to clipboard.
  -h, --help               display help for command
 
```
  

### `run` :
```
 Usage: underpost run [options] <runner-id> [path]

Runs specified scripts using various runners.

Arguments:
  runner-id                                       The runner ID to run. Options: spark-template, rmi, kill, secret, underpost-config, gpu-env, tf-gpu-test, dev-cluster, metadata, svc-ls, svc-rm, ssh-cluster-info, dev-hosts-expose, dev-hosts-restore, cluster-build, template-deploy, template-deploy-image, clean, pull, release-deploy, ssh-deploy, ide, sync, stop, ssh-deploy-stop, tz, cron, get-proxy, instance-promote, instance, ls-deployments, host-update, dd-container, ip-info, monitor, db-client, git-conf, promote, metrics, cluster, deploy, disk-clean, disk-usage, dev, service, sh, log, release-cmt, sync-replica, tf-vae-test, deploy-job.
  path                                            The input value, identifier, or path for the operation.

Options:
  --command <command-array>                       Array of commands to run.
  --args <args-array>                             Array of arguments to pass to the command.
  --dev                                           Sets the development context environment for the script.
  --build                                         Set builder context runner
  --replicas <replicas>                           Sets a custom number of replicas for deployment.
  --pod-name <pod-name>                           Optional: Specifies the pod name for execution.
  --node-name <node-name>                         Optional: Specifies the node name for execution.
  --port <port>                                   Optional: Specifies the port for execution.
  --etc-hosts                                     Enables etc-hosts context for the runner execution.
  --volume-host-path <volume-host-path>           Optional: Specifies the volume host path for test execution.
  --volume-mount-path <volume-mount-path>         Optional: Specifies the volume mount path for test execution.
  --volume-type <volume-type>                     Optional: Specifies the volume type for test execution.
  --image-name <image-name>                       Optional: Specifies the image name for test execution.
  --container-name <container-name>               Optional: Specifies the container name for test execution.
  --namespace <namespace>                         Optional: Specifies the namespace for test execution.
  --tty                                           Enables TTY for the container in deploy-job.
  --stdin                                         Keeps STDIN open for the container in deploy-job.
  --restart-policy <policy>                       Sets the restart policy for the job in deploy-job.
  --runtime-class-name <name>                     Sets the runtime class name for the job in deploy-job.
  --image-pull-policy <policy>                    Sets the image pull policy for the job in deploy-job.
  --api-version <version>                         Sets the API version for the job manifest in deploy-job.
  --labels <labels>                               Optional: Specifies a comma-separated list of key-value pairs for labels (e.g., "app=my-app,env=prod").
  --claim-name <name>                             Optional: Specifies the claim name for volume mounting in deploy-job.
  --kind-type <kind-type>                         Specifies the kind of Kubernetes resource (e.g., Job, Deployment) for deploy-job.
  --force                                         Forces operation, overriding any warnings or conflicts.
  --tls                                           Enables TLS for the runner execution.
  --reset                                         Resets the runner state before execution.
  --terminal                                      Enables terminal mode for interactive script execution.
  --dev-proxy-port-offset <port-offset>           Sets a custom port offset for development proxy.
  --host-network                                  Enables host network mode for the runner execution.
  --requests-memory <requests-memory>             Requests memory limit for the runner execution.
  --requests-cpu <requests-cpu>                   Requests CPU limit for the runner execution.
  --limits-memory <limits-memory>                 Sets memory limit for the runner execution.
  --limits-cpu <limits-cpu>                       Sets CPU limit for the runner execution.
  --resource-template-id <resource-template-id >  Specifies a resource template ID for the runner execution.
  --expose                                        Enables service exposure for the runner execution.
  --conf-server-path <conf-server-path>           Sets a custom configuration server path.
  --underpost-root <underpost-root>               Sets a custom Underpost root path.
  --cron-jobs <jobs>                              Comma-separated list of cron jobs to run before executing the script.
  --timezone <timezone>                           Sets the timezone for the runner execution.
  --kubeadm                                       Sets the kubeadm cluster context for the runner execution.
  --k3s                                           Sets the k3s cluster context for the runner execution.
  --kind                                          Sets the kind cluster context for the runner execution.
  --log-type <log-type>                           Sets the log type for the runner execution.
  --deploy-id <deploy-id>                         Sets deploy id context for the runner execution.
  --user <user>                                   Sets user context for the runner execution.
  --hosts <hosts>                                 Comma-separated list of hosts for the runner execution.
  --instance-id <instance-id>                     Sets instance id context for the runner execution.
  -h, --help                                      display help for command
 
```
  

### `lxd` :
```
 Usage: underpost lxd [options]

Manages LXD containers and virtual machines.

Options:
  --init                           Initializes LXD on the current machine.
  --reset                          Resets LXD on the current machine, deleting
                                   all configurations.
  --install                        Installs LXD on the current machine.
  --dev                            Sets the development context environment for
                                   LXD.
  --create-virtual-network         Creates an LXD virtual network bridge.
  --create-admin-profile           Creates an admin profile for LXD management.
  --control                        Sets the context for a control node VM.
  --worker                         Sets the context for a worker node VM.
  --create-vm <vm-id>              Creates default virtual machines with the
                                   specified ID.
  --init-vm <vm-id>                Retrieves the Underpost initialization
                                   script for the specified VM.
  --info-vm <vm-id>                Retrieves all information about the
                                   specified VM.
  --test <vm-id>                   Tests the health, status, and network
                                   connectivity for a VM.
  --root-size <gb-size>            Sets the root partition size (in GB) for the
                                   VM.
  --k3s                            Flag to indicate that the VM initialization
                                   is for a K3s cluster type.
  --join-node <nodes>              A comma-separated list of worker and control
                                   nodes to join (e.g.,
                                   "k8s-worker-1,k8s-control").
  --expose <vm-name-ports>         Exposes specified ports on a VM (e.g.,
                                   "k8s-control:80,443"). Multiple VM-port
                                   pairs can be comma-separated.
  --delete-expose <vm-name-ports>  Removes exposed ports on a VM (e.g.,
                                   "k8s-control:80,443"). Multiple VM-port
                                   pairs can be comma-separated.
  --workflow-id <workflow-id>      Sets the workflow ID context for LXD
                                   operations.
  --vm-id <vm-id>                  Sets the VM ID context for LXD operations.
  --deploy-id <deploy-id>          Sets the deployment ID context for LXD
                                   operations.
  --namespace <namespace>          Kubernetes namespace for LXD operations
                                   (defaults to "default").
  -h, --help                       display help for command
 
```
  

### `baremetal` :
```
 Usage: underpost baremetal [options] [workflow-id] [hostname] [ip-address]

Manages baremetal server operations, including installation, database setup,
commissioning, and user management.

Options:
  --control-server-install       Installs the baremetal control server.
  --control-server-uninstall     Uninstalls the baremetal control server.
  --control-server-db-install    Installs up the database for the baremetal
                                 control server.
  --control-server-db-uninstall  Uninstalls the database for the baremetal
                                 control server.
  --commission                   Init workflow for commissioning a physical
                                 machine.
  --nfs-build                    Builds an NFS root filesystem for a workflow
                                 id config architecture using QEMU emulation.
  --nfs-mount                    Mounts the NFS root filesystem for a workflow
                                 id config architecture.
  --nfs-unmount                  Unmounts the NFS root filesystem for a
                                 workflow id config architecture.
  --nfs-sh                       Copies QEMU emulation root entrypoint shell
                                 command to the clipboard.
  --cloud-init-update            Updates cloud init for a workflow id config
                                 architecture.
  --logs <log-id>                Displays logs for log id: dhcp, cloud,
                                 machine, cloud-config.
  --dev                          Sets the development context environment for
                                 baremetal operations.
  --ls                           Lists available boot resources and machines.
  -h, --help                     display help for command
 
```
  