## Underpost CI/CD CLI tool version v2.8.811

### Usage: `underpost [options] [command]`
  ```
 Options:
  -V, --version                                              output the version number
  -h, --help                                                 display help for command

Commands:
  new <app-name>                                             Initializes a new Underpost project with a predefined structure.
  start [options] <deploy-id> [env]                          Initiates application servers, build pipelines, or other defined services based on the deployment ID.
  clone [options] <uri>                                      Clones a specified GitHub repository into the current directory.
  pull [options] <path> <uri>                                Pulls the latest changes from a specified GitHub repository.
  cmt [options] <path> <commit-type> [module-tag] [message]  Manages commits to a GitHub repository, supporting various commit types and options.
  push [options] <path> <uri>                                Pushes committed changes from a local repository to a remote GitHub repository.
  env <deploy-id> [env]                                      Sets environment variables and configurations related to a specific deployment ID.
  config [options] <operator> [key] [value]                  Manages Underpost configurations using various operators.
  root                                                       Displays the root path of the npm installation.
  cluster [options] [pod-name]                               Manages Kubernetes clusters, defaulting to Kind cluster initialization.
  deploy [options] [deploy-list] [env]                       Manages application deployments, defaulting to deploying development pods.
  secret [options] <platform>                                Manages secrets for various platforms.
  dockerfile-image-build [options]                           Builds a Docker image from a specified Dockerfile with various options for naming, saving, and loading.
  dockerfile-pull-base-images [options]                      Pulls required Underpost Dockerfile base images and optionally loads them into clusters.
  install                                                    Quickly imports Underpost npm dependencies by copying them.
  db [options] <deploy-list>                                 Manages database operations, including import, export, and collection management.
  script [options] <operator> <script-name> [script-value]   Supports a variety of built-in Underpost global scripts, their preset lifecycle events, and arbitrary custom scripts.
  cron [options] [deploy-list] [job-list]                    Manages cron jobs, including initialization, execution, and configuration updates.
  fs [options] [path]                                        Manages file storage, defaulting to file upload operations.
  test [options] [deploy-list]                               Manages and runs tests, defaulting to the current Underpost default test suite.
  monitor [options] <deploy-id> [env]                        Manages health server monitoring for specified deployments.
  lxd [options]                                              Manages LXD containers and virtual machines.
  baremetal [options]                                        Manages baremetal server operations, including installation, database setup, and user management.
  help [command]                                             display help for command
 
```

## Commands:
    

### `new` :
```
 Usage: underpost new [options] <app-name>

Initializes a new Underpost project with a predefined structure.

Arguments:
  app-name    The name of the application to create.

Options:
  -h, --help  display help for command
 
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
 Usage: underpost cmt [options] <path> <commit-type> [module-tag] [message]

Manages commits to a GitHub repository, supporting various commit types and
options.

Arguments:
  path         The absolute or relative directory path of the repository.
  commit-type  The type of commit to perform. Options: feat, fix, docs, style,
               refactor, perf, cd, test, build, ci, chore, revert, backup.
  module-tag   Optional: Sets a specific module tag for the commit.
  message      Optional: Provides an additional custom message for the commit.

Options:
  --empty      Allows committing with empty files.
  --copy       Copies the generated commit message to the clipboard.
  --info       Displays information about available commit types.
  -h, --help   display help for command
 
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
 Usage: underpost env [options] <deploy-id> [env]

Sets environment variables and configurations related to a specific deployment
ID.

Arguments:
  deploy-id   The deployment configuration ID. Use 'clean' to restore default
              environment settings.
  env         Optional: The environment to set (e.g., "production",
              "development"). Defaults to "production".

Options:
  -h, --help  display help for command
 
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
  

### `cluster` :
```
 Usage: underpost cluster [options] [pod-name]

Manages Kubernetes clusters, defaulting to Kind cluster initialization.

Arguments:
  pod-name             Optional: Filters information by a specific pod name.

Options:
  --reset              Deletes all clusters and prunes all related data and
                       caches.
  --mariadb            Initializes the cluster with a MariaDB statefulset.
  --mysql              Initializes the cluster with a MySQL statefulset.
  --mongodb            Initializes the cluster with a MongoDB statefulset.
  --postgresql         Initializes the cluster with a PostgreSQL statefulset.
  --mongodb4           Initializes the cluster with a MongoDB 4.4 service.
  --valkey             Initializes the cluster with a Valkey service.
  --contour            Initializes the cluster with Project Contour base
                       HTTPProxy and Envoy.
  --cert-manager       Initializes the cluster with a Let's Encrypt production
                       ClusterIssuer.
  --dedicated-gpu      Initializes the cluster with dedicated GPU base
                       resources and environment settings.
  --info               Retrieves information about all deployed Kubernetes
                       objects.
  --full               Initializes the cluster with all available statefulsets
                       and services.
  --ns-use <ns-name>   Switches the current Kubernetes context to the specified
                       namespace.
  --kubeadm            Initializes the cluster using kubeadm for control plane
                       management.
  --dev                Initializes a development-specific cluster
                       configuration.
  --list-pods          Displays detailed information about all pods.
  --info-capacity      Displays the current total machine capacity information.
  --info-capacity-pod  Displays the current machine capacity information per
                       pod.
  --pull-image         Sets an optional associated image to pull during
                       initialization.
  --init-host          Installs necessary Kubernetes node CLI tools (e.g.,
                       kind, kubeadm, docker, podman, helm).
  --config             Sets the base Kubernetes node configuration.
  --worker             Sets the context for a worker node.
  --chown              Sets the appropriate ownership for Kubernetes kubeconfig
                       files.
  --k3s                Initializes the cluster using K3s (Lightweight
                       Kubernetes).
  -h, --help           display help for command
 
```
  

### `deploy` :
```
 Usage: underpost deploy [options] [deploy-list] [env]

Manages application deployments, defaulting to deploying development pods.

Arguments:
  deploy-list                       A comma-separated list of deployment IDs
                                    (e.g., "default-a,default-b").
  env                               Optional: The environment for deployment
                                    (e.g., "development", "production").
                                    Defaults to "development".

Options:
  --remove                          Deletes specified deployments and their
                                    associated services.
  --sync                            Synchronizes deployment environment
                                    variables, ports, and replica counts.
  --info-router                     Displays the current router structure and
                                    configuration.
  --expose                          Exposes services matching the provided
                                    deployment ID list.
  --info-util                       Displays useful `kubectl` utility
                                    management commands.
  --cert                            Resets TLS/SSL certificate secrets for
                                    deployments.
  --build-manifest                  Builds Kubernetes YAML manifests, including
                                    deployments, services, proxies, and
                                    secrets.
  --dashboard-update                Updates dashboard instance data with the
                                    current router configuration.
  --replicas <replicas>             Sets a custom number of replicas for
                                    deployments.
  --versions <deployment-versions>  A comma-separated list of custom deployment
                                    versions.
  --traffic <traffic-versions>      A comma-separated list of custom deployment
                                    traffic weights.
  --disable-update-deployment       Disables updates to deployments.
  --info-traffic                    Retrieves traffic configuration from
                                    current resource deployments.
  --kubeadm                         Enables the kubeadm context for deployment
                                    operations.
  --restore-hosts                   Restores default `/etc/hosts` entries.
  --rebuild-clients-bundle          Inside the container, rebuilds client
                                    bundles (only static public or storage
                                    client files).
  -h, --help                        display help for command
 
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
  

### `dockerfile-image-build` :
```
 Usage: underpost dockerfile-image-build [options]

Builds a Docker image from a specified Dockerfile with various options for
naming, saving, and loading.

Options:
  --path [path]                        The path to the Dockerfile directory.
  --image-name [image-name]            Sets a custom name for the Docker image.
  --image-path [image-path]            Sets the output path for the tar image
                                       archive.
  --dockerfile-name [dockerfile-name]  Sets a custom name for the Dockerfile.
  --podman-save                        Exports the built image as a tar file
                                       using Podman.
  --kind-load                          Imports the tar image into a Kind
                                       cluster.
  --kubeadm-load                       Imports the tar image into a Kubeadm
                                       cluster.
  --secrets                            Includes Dockerfile environment secrets
                                       during the build.
  --secrets-path [secrets-path]        Specifies a custom path for Dockerfile
                                       environment secrets.
  --reset                              Performs a build without using the
                                       cache.
  --k3s-load                           Loads the image into a K3s cluster.
  -h, --help                           display help for command
 
```
  

### `dockerfile-pull-base-images` :
```
 Usage: underpost dockerfile-pull-base-images [options]

Pulls required Underpost Dockerfile base images and optionally loads them into
clusters.

Options:
  --path [path]   The path to the Dockerfile directory.
  --kind-load     Imports the pulled image into a Kind cluster.
  --kubeadm-load  Imports the pulled image into a Kubeadm cluster.
  --version       Sets a custom version for the base images.
  --k3s-load      Loads the image into a K3s cluster.
  -h, --help      display help for command
 
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

Manages database operations, including import, export, and collection
management.

Arguments:
  deploy-list                  A comma-separated list of deployment IDs (e.g.,
                               "default-a,default-b").

Options:
  --import                     Imports container backups from specified
                               repositories.
  --export                     Exports container backups to specified
                               repositories.
  --pod-name <pod-name>        Optional: Specifies the pod context for database
                               operations.
  --collections <collections>  A comma-separated list of database collections
                               to operate on.
  --out-path <out-path>        Specifies a custom output path for backups.
  --drop                       Drops the specified databases or collections.
  --preserveUUID               Preserves UUIDs during database operations.
  --git                        Uploads database backups to GitHub.
  --hosts <hosts>              A comma-separated list of database hosts.
  --paths <paths>              A comma-separated list of paths for database
                               files.
  --ns <ns-name>               Optional: Specifies the namespace context for
                               database operations.
  -h, --help                   display help for command
 
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
  deploy-list         A comma-separated list of deployment IDs (e.g.,
                      "default-a,default-b").
  job-list            A comma-separated list of job IDs. Options: callback,
                      updateDashboardData. Defaults to all available jobs.

Options:
  --itc               Executes cron jobs within the container execution
                      context.
  --init              Initializes cron jobs for the default deployment ID.
  --git               Uploads cron job configurations to GitHub.
  --dashboard-update  Updates dashboard cron data with the current job
                      configurations.
  -h, --help          display help for command
 
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
  --type <type>                Sets a custom monitor type.
  --sync                       Synchronizes with current proxy deployments and
                               traffic configurations.
  -h, --help                   display help for command
 
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
  --auto-expose-k8s-ports <vm-id>  Automatically exposes common Kubernetes
                                   ports for the specified VM.
  -h, --help                       display help for command
 
```
  

### `baremetal` :
```
 Usage: underpost baremetal [options]

Manages baremetal server operations, including installation, database setup,
and user management.

Options:
  --control-server-install       Installs the baremetal control server.
  --control-server-db-init       Sets up the database for the baremetal control
                                 server.
  --control-server-db-uninstall  Uninstalls the database for the baremetal
                                 control server.
  --control-server-init          Initializes the baremetal control server.
  --control-server-login         Logs in as an administrator to the control
                                 server.
  --control-server-uninstall     Uninstalls the baremetal control server.
  --control-server-stop          Stops the baremetal control server.
  --control-server-start         Starts the baremetal control server.
  --get-users                    Retrieves a list of users from the control
                                 server.
  --new-api-key                  Generates a new API key for the control
                                 server.
  --dev                          Sets the development context environment for
                                 baremetal operations.
  -h, --help                     display help for command
 
```
  