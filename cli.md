## underpost ci/cd cli v2.8.795

### Usage: `underpost [options] [command]`
  ```
 Options:
  -V, --version                                              output the version number
  -h, --help                                                 display help for command

Commands:
  new <app-name>                                             Create a new project
  start [options] <deploy-id> [env]                          Start up server, build pipelines, or services
  clone [options] <uri>                                      Clone github repository
  pull [options] <path> <uri>                                Pull github repository
  cmt [options] <path> <commit-type> [module-tag] [message]  Commit github repository
  push [options] <path> <uri>                                Push github repository
  env <deploy-id> [env]                                      Set environment variables files and conf related to <deploy-id>
  config <operator> [key] [value]                            Manage configuration, operators
  root                                                       Get npm root path
  cluster [options] [pod-name]                               Manage cluster, for default initialization base kind cluster
  deploy [options] [deploy-list] [env]                       Manage deployment, for default deploy development pods
  secret [options] <platform>                                Manage secrets
  dockerfile-image-build [options]                           Build image from Dockerfile
  dockerfile-pull-base-images [options]                      Pull underpost dockerfile images requirements
  install                                                    Fast import underpost npm dependencies
  db [options] <deploy-list>                                 Manage databases
  script [options] <operator> <script-name> [script-value]   Supports a number of built-in underpost global scripts and their preset life cycle events as well as arbitrary scripts
  cron [options] [deploy-list] [job-list]                    Cron jobs management
  fs [options] [path]                                        File storage management, for default upload file
  test [options] [deploy-list]                               Manage Test, for default run current underpost default test
  monitor [options] <deploy-id> [env]                        Monitor health server management
  lxd [options]                                              Lxd management
  help [command]                                             display help for command
 
```

## Commands:
    

### `new` :
```
 Usage: underpost new [options] <app-name>

Create a new project

Arguments:
  app-name    Application name

Options:
  -h, --help  display help for command
 
```
  

### `start` :
```
 Usage: underpost start [options] <deploy-id> [env]

Start up server, build pipelines, or services

Arguments:
  deploy-id   Deploy configuration id
  env         Optional environment, for default is development

Options:
  --run       Run app servers and monitor health server
  --build     Build app client
  -h, --help  display help for command
 
```
  

### `clone` :
```
 Usage: underpost clone [options] <uri>

Clone github repository

Arguments:
  uri         e.g. username/repository

Options:
  --bare      Clone only .git files
  -g8         Use g8 repo extension
  -h, --help  display help for command
 
```
  

### `pull` :
```
 Usage: underpost pull [options] <path> <uri>

Pull github repository

Arguments:
  path        Absolute or relative directory
  uri         e.g. username/repository

Options:
  -g8         Use g8 repo extension
  -h, --help  display help for command
 
```
  

### `cmt` :
```
 Usage: underpost cmt [options] <path> <commit-type> [module-tag] [message]

Commit github repository

Arguments:
  path         Absolute or relative directory
  commit-type  Options:
               feat,fix,docs,style,refactor,perf,cd,test,build,ci,chore,revert,backup
  module-tag   Optional set module tag
  message      Optional set additional message

Options:
  --empty      Allow empty files
  --copy       Copy to clipboard message
  --info       Info commit types
  -h, --help   display help for command
 
```
  

### `push` :
```
 Usage: underpost push [options] <path> <uri>

Push github repository

Arguments:
  path        Absolute or relative directory
  uri         e.g. username/repository

Options:
  -f          Force push overwriting repository
  -g8         Use g8 repo extension
  -h, --help  display help for command
 
```
  

### `env` :
```
 Usage: underpost env [options] <deploy-id> [env]

Set environment variables files and conf related to <deploy-id>

Arguments:
  deploy-id   deploy configuration id, if 'clean' restore default
  env         Optional environment, for default is production

Options:
  -h, --help  display help for command
 
```
  

### `config` :
```
 Usage: underpost config [options] <operator> [key] [value]

Manage configuration, operators

Arguments:
  operator    Options: set,delete,get,list,clean
  key         Config key
  value       Config value

Options:
  -h, --help  display help for command
 
```
  

### `root` :
```
 Usage: underpost root [options]

Get npm root path

Options:
  -h, --help  display help for command
 
```
  

### `cluster` :
```
 Usage: underpost cluster [options] [pod-name]

Manage cluster, for default initialization base kind cluster

Arguments:
  pod-name             Optional pod name filter

Options:
  --reset              Delete all clusters and prune all data and caches
  --mariadb            Init with mariadb statefulset
  --mysql              Init with mysql statefulset
  --mongodb            Init with mongodb statefulset
  --postgresql         Init with postgresql statefulset
  --mongodb4           Init with mongodb 4.4 service
  --valkey             Init with valkey service
  --contour            Init with project contour base HTTPProxy and envoy
  --cert-manager       Init with letsencrypt-prod ClusterIssuer
  --dedicated-gpu      Init with dedicated gpu base resources env
  --info               Get all kinds objects deployed
  --full               Init with all statefulsets and services available
  --ns-use <ns-name>   Switches current context to namespace
  --kubeadm            Init with kubeadm controlplane management
  --dev                init with dev cluster
  --list-pods          Display list pods information
  --info-capacity      display current total machine capacity info
  --info-capacity-pod  display current machine capacity pod info
  --pull-image         Set optional pull associated image
  --init-host          Install k8s node necessary cli env: kind, kubeadm,
                       docker, podman, helm
  --config             Set k8s base node config
  --worker             Set worker node context
  --chown              Set k8s kube chown
  -h, --help           display help for command
 
```
  

### `deploy` :
```
 Usage: underpost deploy [options] [deploy-list] [env]

Manage deployment, for default deploy development pods

Arguments:
  deploy-list                       Deploy id list, e.g. default-a,default-b
  env                               Optional environment, for default is
                                    development

Options:
  --remove                          Delete deployments and services
  --sync                            Sync deployments env, ports, and replicas
  --info-router                     Display router structure
  --expose                          Expose service match deploy-list
  --info-util                       Display kubectl util management commands
  --cert                            Reset tls/ssl certificate secrets
  --build-manifest                  Build kind yaml manifests: deployments,
                                    services, proxy and secrets
  --dashboard-update                Update dashboard instance data with current
                                    router config
  --replicas <replicas>             Set custom number of replicas
  --versions <deployment-versions>  Comma separated custom deployment versions
  --traffic <traffic-versions>      Comma separated custom deployment traffic
  --disable-update-deployment       Disable update deployments
  --info-traffic                    get traffic conf form current resources
                                    deployments
  --kubeadm                         Enable kubeadm context
  --restore-hosts                   Restore defautl etc hosts
  --rebuild-clients-bundle          Inside container, rebuild clients bundle,
                                    only static public or storage client files
  -h, --help                        display help for command
 
```
  

### `secret` :
```
 Usage: underpost secret [options] <platform>

Manage secrets

Arguments:
  platform                            Options: docker,underpost

Options:
  --init                              Init secrets platform environment
  --create-from-file <path-env-file>  Create secret from env file
  --list                              Lists secrets
  -h, --help                          display help for command
 
```
  

### `dockerfile-image-build` :
```
 Usage: underpost dockerfile-image-build [options]

Build image from Dockerfile

Options:
  --path [path]                        Dockerfile path
  --image-name [image-name]            Set image name
  --image-path [image-path]            Set tar image path
  --dockerfile-name [dockerfile-name]  set Dockerfile name
  --podman-save                        Export tar file from podman
  --kind-load                          Import tar image to Kind cluster
  --kubeadm-load                       Import tar image to Kubeadm cluster
  --secrets                            Dockerfile env secrets
  --secrets-path [secrets-path]        Dockerfile custom path env secrets
  --reset                              Build without using cache
  -h, --help                           display help for command
 
```
  

### `dockerfile-pull-base-images` :
```
 Usage: underpost dockerfile-pull-base-images [options]

Pull underpost dockerfile images requirements

Options:
  --path [path]   Dockerfile path
  --kind-load     Import tar image to Kind cluster
  --kubeadm-load  Import tar image to Kubeadm cluster
  --version       Set custom version
  -h, --help      display help for command
 
```
  

### `install` :
```
 Usage: underpost install [options]

Fast import underpost npm dependencies

Options:
  -h, --help  display help for command
 
```
  

### `db` :
```
 Usage: underpost db [options] <deploy-list>

Manage databases

Arguments:
  deploy-list                  Deploy id list, e.g. default-a,default-b

Options:
  --import                     Import container backups from repositories
  --export                     Export container backups to repositories
  --pod-name <pod-name>        Optional pod context
  --collections <collections>  Comma separated collections
  --out-path <out-path>        Custom out path backup
  --drop                       Drop databases
  --preserveUUID               Preserve Ids
  --git                        Upload to github
  --hosts <hosts>              Comma separated hosts
  --paths <paths>              Comma separated paths
  --ns <ns-name>               Optional name space context
  -h, --help                   display help for command
 
```
  

### `script` :
```
 Usage: underpost script [options] <operator> <script-name> [script-value]

Supports a number of built-in underpost global scripts and their preset life
cycle events as well as arbitrary scripts

Arguments:
  operator               Options: set,run,get
  script-name            Script name
  script-value           Literal command, or path

Options:
  --itc                  Inside container execution context
  --itc-path             Inside container path options
  --ns <ns-name>         Options name space context
  --pod-name <pod-name>
  -h, --help             display help for command
 
```
  

### `cron` :
```
 Usage: underpost cron [options] [deploy-list] [job-list]

Cron jobs management

Arguments:
  deploy-list         Deploy id list, e.g. default-a,default-b
  job-list            Deploy id list, e.g. callback,updateDashboardData, for
                      default all available jobs

Options:
  --itc               Inside container execution context
  --init              Init cron jobs for cron job default deploy id
  --git               Upload to github
  --dashboard-update  Update dashboard cron data with current jobs config
  -h, --help          display help for command
 
```
  

### `fs` :
```
 Usage: underpost fs [options] [path]

File storage management, for default upload file

Arguments:
  path                                     Absolute or relative directory

Options:
  --rm                                     Remove file
  --git                                    Current git changes
  --recursive                              Upload files recursively
  --deploy-id <deploy-id>                  Deploy configuration id
  --pull                                   Download file
  --force                                  Force action
  --storage-file-path <storage-file-path>  custom file storage path
  -h, --help                               display help for command
 
```
  

### `test` :
```
 Usage: underpost test [options] [deploy-list]

Manage Test, for default run current underpost default test

Arguments:
  deploy-list                Deploy id list, e.g. default-a,default-b

Options:
  --itc                      Inside container execution context
  --sh                       Copy to clipboard, container entrypoint shell
                             command
  --logs                     Display container logs
  --pod-name <pod-name>
  --pod-status <pod-status>
  --kind-type <kind-type>
  -h, --help                 display help for command
 
```
  

### `monitor` :
```
 Usage: underpost monitor [options] <deploy-id> [env]

Monitor health server management

Arguments:
  deploy-id                    Deploy configuration id
  env                          Optional environment, for default is development

Options:
  --ms-interval <ms-interval>  Custom ms interval delta time
  --now                        Exec immediately monitor script
  --single                     Disable recurrence
  --replicas <replicas>        Set custom number of replicas
  --type <type>                Set custom monitor type
  --sync                       Sync with current proxy deployments proxy
                               traffic
  -h, --help                   display help for command
 
```
  

### `lxd` :
```
 Usage: underpost lxd [options]

Lxd management

Options:
  --init                           Init lxd
  --reset                          Reset lxd on current machine
  --install                        Install lxd on current machine
  --dev                            Set dev context env
  --create-virtual-network         Create lxd virtual network bridge
  --create-admin-profile           Create admin profile for lxd management
  --control                        set control node vm context
  --worker                         set worker node context
  --create-vm <vm-id>              Create default virtual machines
  --init-vm <vm-id>                Get init vm underpost script
  --info-vm <vm-id>                Get all info vm
  --test <vm-id>                   Test health, status and network connectivity
                                   for a VM
  --root-size <gb-size>            Set root size vm
  --join-node <nodes>              Comma separated worker and control node e.
                                   g. k8s-worker-1,k8s-control
  --expose <vm-name-ports>         Vm name and : separated with Comma separated
                                   vm port to expose e. g. k8s-control:80,443
  --delete-expose <vm-name-ports>  Vm name and : separated with Comma separated
                                   vm port to remove expose e. g.
                                   k8s-control:80,443
  --auto-expose-k8s-ports <vm-id>  Automatically expose common Kubernetes ports
                                   for the VM.
  -h, --help                       display help for command
 
```
  