# Main Cluster Lifecycle Commands

Minimalist reference for Underpost engine cluster lifecycle commands.

---

## Table of Contents

1. [Deploy ID Convention](#deploy-id-convention)
2. [Credential Security](#credential-security)
3. [New](#new)
4. [Env](#env)
5. [Development Server](#development-server)
6. [Cluster Build](#cluster-build)
7. [Template Deploy](#template-deploy)
8. [SSH Deploy](#ssh-deploy)
9. [Cluster](#cluster)
10. [DD Container](#dd-container)
11. [Image](#image)
12. [Default Configuration](#default-configuration)
13. [Promote](#promote)
14. [Cron](#cron)
15. [Sync](#sync)
16. [Deploy Job](#deploy-job)

---

## Deploy ID Convention

The project uses two correlated naming patterns for identifying deployments and their associated repositories:

| Pattern       | Format             | Example                                         | Usage                                                                           |
| ------------- | ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| **Deploy ID** | `dd-<conf-id>`     | `dd-core`, `dd-cyberia`, `dd-lampp`             | Configuration directories, `dd.router`, deploy/sync/promote commands, env files |
| **Repo Name** | `engine-<conf-id>` | `engine-core`, `engine-cyberia`, `engine-lampp` | GitHub repositories, CI/CD workflows, template-deploy, ssh-deploy commit tags   |

The `<conf-id>` suffix (e.g. `core`, `cyberia`, `lampp`, `test`) is the shared identifier that links both patterns:

- **Deploy ID** `dd-<conf-id>` → config stored at `./engine-private/conf/dd-<conf-id>/`
- **Repo Name** `engine-<conf-id>` → public repo, derived as `engine-${deployId.split('dd-')[1]}`
- **Private Repo** `engine-<conf-id>-private` → private configuration repo
- **Cron Backups Repo** `engine-<conf-id>-cron-backups` → cron backup repo
- **Conf file** `conf.dd-<conf-id>.js` → deployment configuration module

When a deploy ID is provided without the `dd-` prefix, the engine normalizes it automatically: `my-app` → `dd-my-app`. However, examples in this reference use the full `dd-<conf-id>` format for clarity.

Use `dd-<conf-id>` for all deploy/cluster/configuration commands. Use `engine-<conf-id>` for repository-level operations (template-deploy paths, ssh-deploy targets, CI/CD workflow files).

---

## Credential Security

Configuration files in `./engine-private/conf/dd-<conf-id>/` use `env:` reference pointers for sensitive values instead of plaintext secrets:

```json
{
  "db": {
    "password": "env:MARIADB_PASSWORD"
  }
}
```

Actual secret values are stored in per-deploy `.env.*` files (`./engine-private/conf/dd-<conf-id>/.env.production`, `.env.development`, `.env.test`). At runtime, the engine's `resolveConfSecrets()` function replaces `"env:VAR_NAME"` with the corresponding `process.env.VAR_NAME` value. Generated `conf.dd-*.js` manifests emit `process.env.VAR || ''` expressions — no plaintext secret is ever written to source-controlled JS files.

LAMPP deploy (`dd-lampp`) clients are `null` in the public project configuration. Client builds for LAMPP deployments are handled by private internal logic in `engine-private/itc-scripts/`.

> **⚠️ Important:** Ensure `.env.*` files and `engine-private/` are listed in `.gitignore` and never committed to public repositories.

---

## New

**Command:** `node bin new [app-name] [options]`

Creates deployment configurations, cluster files, and project scaffolding.

```bash
node bin new --deploy-id dd-my-app
node bin new --deploy-id dd-my-app --cluster
node bin new --default-conf --deploy-id dd-my-app
node bin new --sub-conf client my-service
node bin new --deploy-id dd-my-app --build
node bin new --deploy-id dd-my-app --purge
```

| Option                    | Description                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--deploy-id <id>`        | Create deployment ID configuration and env files (format: `dd-<conf-id>`)                                                   |
| `--cluster`               | Create cluster files and sync (requires `--deploy-id`)                                                                      |
| `--sub-conf <type>`       | Create sub-configuration files (`client`, `server`)                                                                         |
| `--build`                 | Build deployment to pwa-microservices-template                                                                              |
| `--build-repos`           | Create deployment ID repositories (`engine-<conf-id>`, `engine-<conf-id>-private`, `engine-<conf-id>-cron-backups`)         |
| `--clean-template`        | Clean the build directory                                                                                                   |
| `--sync-conf`             | Sync configuration to private repositories                                                                                  |
| `--sync-start`            | Sync start scripts in deploy ID `package.json` with root `package.json` (use `dd` as `--deploy-id` to sync all `dd.router`) |
| `--purge`                 | Remove deploy ID and all related files                                                                                      |
| `--dev`                   | Development CLI context                                                                                                     |
| `--default-conf`          | Create default deploy ID configuration                                                                                      |
| `--conf-workflow-id <id>` | Custom configuration workflow ID                                                                                            |

When `--deploy-id dd-my-app` is used with `--cluster`, the engine creates:

- Config directory: `./engine-private/conf/dd-my-app/`
- CI workflow: `.github/workflows/engine-my-app.ci.yml`
- CD workflow: `.github/workflows/engine-my-app.cd.yml`
- Appends `dd-my-app` to `./engine-private/deploy/dd.router`

When `--build-repos` is used, the engine creates three repositories:

- `engine-my-app` (public deployment repo)
- `engine-my-app-private` (private configuration repo)
- `engine-my-app-cron-backups` (cron backup repo)

---

## Env

**Command:** `node bin env [deploy-id] [env] [subConf]`

Sets environment variables and configurations for a specific deployment ID. Copies the deploy's `.env.*` files to the project root and updates `package.json` with the deploy's start script.

```bash
node bin env dd-core
node bin env dd-core development
node bin env dd-core production
node bin env clean
node bin env current
node bin env root
```

| Argument    | Description                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy-id` | The deployment ID (format: `dd-<conf-id>`). Special values: `clean` (restore defaults), `root` (load underpost root env), `current` (print current deploy ID) |
| `env`       | Optional: The environment to set (`production`, `development`, `test`). Defaults to `production`                                                              |
| `subConf`   | Optional: Sub-configuration identifier                                                                                                                        |

The `env` command loads configuration from `./engine-private/conf/dd-<conf-id>/` and writes:

- `.env.production`, `.env.development`, `.env.test` → project root
- `.env` → project root (from the selected environment's file)
- `package.json` → updated with the deploy's start script

The `clean` option removes all root `.env` files and restores `package.json` and related files from git.

---

## Development Server

**Command:** `npm run dev [deploy-id] [sub-conf]`

Starts the server in development mode with hot-reload via nodemon.

```bash
npm run dev dd-core
npm run dev dd-core nexodev
npm run dev dd-core healthcare
npm run dev dd-core bymyelectrics
npm run dev dd-core vitaintegral
```

| Argument    | Description                                                               |
| ----------- | ------------------------------------------------------------------------- |
| `deploy-id` | The deployment ID (format: `dd-<conf-id>`)                                |
| `sub-conf`  | Optional: Sub-configuration to filter server hosts for faster development |

The `sub-conf` argument filters the server to only build and run hosts defined in the corresponding `conf.server.dev.<sub-conf>.json` file. Without it, all hosts in `conf.server.json` are built.

### Sub-Configuration Files

Dev sub-configurations are stored at `./engine-private/conf/dd-<conf-id>/conf.server.dev.<sub-conf>.json` and contain a subset of hosts from the full `conf.server.json`. For example:

- `conf.server.json` — full config (all hosts: dogmadual.com, nexodev.org, healthcare.nexodev.org, ...)
- `conf.server.dev.nexodev.json` — only `www.nexodev.org`
- `conf.server.dev.healthcare.json` — only `healthcare.nexodev.org`

To create a new sub-configuration:

```bash
node bin new --sub-conf server <sub-conf-name>
```

This creates a copy of `conf.server.json` as `conf.server.dev.<sub-conf-name>.json` that can be trimmed to the desired hosts.

The sub-conf filtering is propagated via the `DEPLOY_SUB_CONF` environment variable, which is read by `getConfFilePath()` so that all downstream consumers (client builds, server runtimes, API servers) consistently use the filtered configuration.

### Additional Development Scripts

The following npm scripts provide alternative development modes:

```bash
# Run development server inside a container (no hot-reload)
npm run dev:container

# Run production server inside a container
npm run prod:container

# Run development proxy server
npm run dev:proxy
```

| Script           | Description                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `dev:container`  | Starts the server in development mode without nodemon (`NODE_ENV=development node src/server`)  |
| `prod:container` | Starts the server in production mode inside a container (`NODE_ENV=production node src/server`) |
| `dev:proxy`      | Starts an Express proxy server for development (`NODE_ENV=development node src/proxy proxy`)    |

See also: [Running Separate Client and API Servers for Development](Running%20Separate%20Client%20and%20API%20Servers%20for%20Development.md) for the `dev:api` and `dev:client` scripts.

---

## Cluster Build

**Command:** `node bin run cluster-build [path] [options]`

Full cluster build: clean → template-deploy → env clean → update default configs for all deployments in `dd.router`.

```bash
node bin run cluster-build
node bin run cluster-build cmt
node bin run cluster-build --node-name worker-01
```

- `path=cmt` commits changes to engine and engine-private repositories.
- `--node-name <name>` targets a specific node.

---

## Template Deploy

**Command:** `node bin run template-deploy [path] [options]`

Pushes `engine-private` and `engine` repositories with CI commit tags for PWA microservices template deployment. The optional `path` argument uses the `engine-<conf-id>` repo name pattern prefixed with `sync-`.

```bash
node bin run template-deploy
node bin run template-deploy --dev
node bin run template-deploy --force
node bin run template-deploy sync-engine-core --dev
node bin run template-deploy sync-engine-cyberia --dev
```

When a `sync-engine-<conf-id>` path is provided, the commit tag becomes `ci package-pwa-microservices-template-sync-engine-<conf-id>`, targeting a specific deployment sync in the CI pipeline.

| Option    | Description      |
| --------- | ---------------- |
| `--dev`   | Development mode |
| `--force` | Force push       |

---

## SSH Deploy

**Command:** `node bin run ssh-deploy <path> [options]`

Deploys via SSH using commit tags pushed to the engine repository. The `path` argument uses the `engine-<conf-id>` repo name pattern. The commit tag format is `cd ssh-<path>`.

```bash
node bin run ssh-deploy engine-core
node bin run ssh-deploy engine-cyberia
node bin run ssh-deploy sync-engine-core --dev
node bin run ssh-deploy sync-engine-cyberia --force
```

| Option    | Description      |
| --------- | ---------------- |
| `--dev`   | Development mode |
| `--force` | Force push       |

---

## Cluster

**Command:** `node bin run cluster [path] [options]`

Complete cluster initialization: reset → setup → pull images → deploy databases → deploy cache → ingress → certs → services. The runner uses `kubeadm` by default or `k3s` when `--k3s` is specified.

```bash
node bin run cluster
node bin run cluster express,dd-core+dd-cyberia
node bin run cluster lampp,dd-core+dd-cyberia+dd-lampp
node bin run cluster --dev
node bin run cluster --k3s
```

**Path format:** `<runtime-image>,<deploy-list>` — runtime defaults to `express` (valid values: `express`, `lampp`), deploy-list defaults to `dd.router` contents. Deploy IDs are `+`-separated and use the `dd-<conf-id>` format. When runtime is `lampp`, a MariaDB statefulset is additionally deployed alongside MongoDB.

| Option               | Description                                  |
| -------------------- | -------------------------------------------- |
| `--dev`              | Development environment (uses `--etc-hosts`) |
| `--namespace <name>` | Kubernetes namespace (default: `default`)    |
| `--kubeadm`          | Kubeadm cluster                              |
| `--k3s`              | K3s cluster                                  |

---

## DD Container

**Command:** `node bin run dd-container [path] [options]`

Creates a development container in the cluster for testing.

```bash
node bin run dd-container
node bin run dd-container "npm test"
node bin run dd-container --pod-name my-dev-pod
node bin run dd-container --image-name custom-image:latest --dev
node bin run dd-container --host-network
```

| Option                       | Description                                   |
| ---------------------------- | --------------------------------------------- |
| `--pod-name <name>`          | Pod name (default: `underpost-dev-container`) |
| `--image-name <name>`        | Docker image                                  |
| `--node-name <name>`         | Target node                                   |
| `--claim-name <name>`        | PVC name (default: `pvc-dd`)                  |
| `--volume-host-path <path>`  | Host path (default: `/home/dd`)               |
| `--volume-mount-path <path>` | Container mount path                          |
| `--host-network`             | Use host networking                           |
| `--dev`                      | Development mode (Kind cluster)               |

---

## Image

**Command:** `node bin image [options]`

Manages Docker images: pull base images, build custom images, save/load into clusters, list, and remove.

```bash
node bin image --pull-base
node bin image --pull-base --path /home/dd/engine/src/runtime/lampp
node bin image --pull-base --kind --dev
node bin image --pull-base --kubeadm
node bin image --build --path ./src/runtime/express --image-name my-app:latest --podman-save --kubeadm
node bin image --ls
node bin image --rm my-image-id
node bin image --spec --namespace default
node bin image --pull-dockerhub underpost --kind
```

| Option                           | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| `--pull-base`                    | Pull base images and build `rockylinux9-underpost` image       |
| `--build`                        | Build a Docker image using Podman                              |
| `--ls`                           | List all available Underpost Dockerfile images                 |
| `--rm <image-id>`                | Remove specified image                                         |
| `--spec`                         | Get cached list of container images used by all pods           |
| `--path <path>`                  | Dockerfile directory                                           |
| `--image-name <name>`            | Custom image name                                              |
| `--image-path <path>`            | Output path for tar image archive                              |
| `--dockerfile-name <name>`       | Custom Dockerfile name                                         |
| `--podman-save`                  | Export built image as tar file using Podman                    |
| `--pull-dockerhub <image>`       | Pull a Docker Hub image (use `underpost` for the engine image) |
| `--kind` / `--kubeadm` / `--k3s` | Load image into cluster                                        |
| `--node-name <name>`             | Target node for kubeadm/k3s                                    |
| `--namespace <name>`             | Kubernetes namespace (default: `default`)                      |
| `--reset`                        | Build without cache                                            |
| `--dev`                          | Development mode                                               |

---

## Default Configuration

**Command:** `node bin new --default-conf --deploy-id <deploy-id>`

Creates or updates default configuration files for a deployment. Reads from `./engine-private/conf/dd-<conf-id>/` (including `conf.server.json`, `conf.client.json`, `conf.ssr.json`) and writes the resolved config to `conf.dd-<conf-id>.js`.

During generation, `env:` references from `conf.server.json` are preserved as plain `'env:KEY'` strings in the generated `conf.dd-*.js` file. At runtime, `resolveConfSecrets()` in `conf.js` resolves these strings to `process.env.KEY` values when configurations are loaded via `loadConf()` or `loadConfServerJson()`. Private deployment-only fields (`git`, `directory`) are stripped from the public manifest.

```bash
node bin new --default-conf --deploy-id dd-core
node bin new --default-conf --deploy-id dd-cyberia
node bin new --default-conf --deploy-id dd-my-app
```

Special workflow IDs (via `--conf-workflow-id`) bypass the `dd-<conf-id>` convention:

```bash
node bin new --default-conf --conf-workflow-id dd-github-pages
node bin new --default-conf --conf-workflow-id template
```

- `dd-github-pages` — GitHub Pages configuration (sets host to `<username>.github.io`)
- `template` — cluster template with Valkey/MongoDB defaults

---

## Promote

**Command:** `node bin run promote <deploy-config> [options]`

Blue-green deployment promotion — switches traffic between blue and green environments.

```bash
node bin run promote dd-core,production,2
node bin run promote dd,production,1
node bin run promote dd-cyberia
node bin run promote dd-my-app,development
```

**Config format:** `<deploy-id>,<environment>,<replicas>` — environment defaults to `production`, replicas to `1`. Deploy IDs use the `dd-<conf-id>` format. Use `dd` as deploy-id to promote all deployments listed in `dd.router`.

---

## Cron

**Command:** `underpost cron [deploy-list] [job-list] [options]` / `node bin cron [deploy-list] [job-list] [options]`

Manages cron jobs: execute directly, generate K8s CronJob manifests, or setup a deploy-id's start script.

### DD Cron File

The file `./engine-private/deploy/dd.cron` stores the default cron deploy-id (e.g. `dd-cron`). This deploy-id maps to a configuration directory at `./engine-private/conf/dd-<conf-id>/` containing a `conf.cron.json` file that defines scheduled jobs.

### Cron Command Cycle

1. **Resolve deploy-id** — uses the argument if provided, otherwise reads `./engine-private/deploy/dd.cron`
2. **Read conf.cron.json** — loads job definitions from `./engine-private/conf/dd-<conf-id>/conf.cron.json`
3. **Setup deploy start** — updates `package.json` start script and generates K8s CronJob YAML manifests into `./manifests/cronjobs/dd-<conf-id>/`
4. **Apply to cluster** — deletes existing CronJobs, ensures the container image is loaded on the cluster, syncs engine to kind-worker if using `--kind`, then runs `kubectl apply -f` on all generated manifests
5. **Create immediate jobs** — when `--create-job-now` is set, creates a one-off Job from each CronJob via `kubectl create job <name>-now --from=cronjob/<name>`

### Usage

```bash
# Direct execution — run jobs immediately
underpost cron dd-cron dns
underpost cron dd-cron backup --git
underpost cron dd-cron dns,backup
node bin cron dd-cron dns --dev

# Generate K8s CronJob manifests
node bin cron --generate-k8s-cronjobs --dev
node bin cron --generate-k8s-cronjobs --namespace production --dev

# Generate + apply to cluster
node bin cron --generate-k8s-cronjobs --apply --kind --dev
node bin cron --generate-k8s-cronjobs --apply --kubeadm
node bin cron --generate-k8s-cronjobs --apply --k3s --image custom:latest

# Apply + create immediate jobs
node bin cron --generate-k8s-cronjobs --apply --create-job-now --kind --dev

# Setup deploy start (update package.json + generate manifests)
node bin cron --setup-start dd-cron
node bin cron --setup-start dd-my-app --namespace staging

# Dry run / SSH
node bin cron dd-cron dns --dry-run
underpost cron dd-cron backup --ssh --git

# Pre-script commands
node bin cron --generate-k8s-cronjobs --apply --cmd "cd /home/dd/engine && node bin env dd-core production" --kind --dev
```

### Options

| Option               | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `--dev`              | Development mode (`node bin` instead of `underpost`)                  |
| `--kind`             | Kind cluster context                                                  |
| `--k3s`              | K3s cluster context                                                   |
| `--kubeadm`          | Kubeadm cluster context                                               |
| `--git`              | Pass `--git` flag to job execution                                    |
| `--namespace <name>` | Kubernetes namespace (default: `default`)                             |
| `--image <name>`     | Custom container image                                                |
| `--cmd <command>`    | Pre-script commands before cron execution                             |
| `--create-job-now`   | Create an immediate Job from each CronJob after applying              |
| `--dry-run`          | Preview jobs without executing                                        |
| `--ssh`              | Execute backup commands via SSH on the remote node instead of locally |

### Available Job Types

| Job ID   | Description        | Deploy ID Source             |
| -------- | ------------------ | ---------------------------- |
| `dns`    | DNS record updates | `dd.cron`                    |
| `backup` | Database backups   | `dd.router` (all deploy-ids) |

### Conf Cron JSON Format

Located at `./engine-private/conf/dd-<conf-id>/conf.cron.json`:

```json
{
  "jobs": {
    "dns": {
      "enabled": true,
      "expression": "*/5 * * * *"
    },
    "backup": {
      "enabled": true,
      "expression": "0 0 * * *"
    }
  }
}
```

Each enabled job generates a Kubernetes CronJob YAML manifest at `./manifests/cronjobs/dd-<conf-id>/dd-<conf-id>-<job>.yaml`.

### Cron Integration With Sync

The `sync` command automatically triggers cron setup when `--deploy-id-cron-jobs` is not set to `none`:

```bash
node bin run sync dd-my-app --dev --kind --create-job-now
```

This calls the cron runner internally with the resolved cluster flags, applying cron manifests as part of the full deployment sync cycle.

---

## Sync

**Command:** `node bin run sync <deploy-id> [options]`

Synchronizes deployment replicas, configurations, and traffic across the cluster. Reads deployment IDs from `./engine-private/deploy/dd.router`, validates version states, updates cron jobs, and handles blue-green traffic switching.

```bash
node bin run sync dd-core --dev --kind
node bin run sync dd-core --kubeadm
node bin run sync dd --dev --kind --create-job-now
node bin run sync dd-my-app --dev --kind --deploy-id-cron-jobs dd-cron
node bin run sync dd-my-app --k3s --namespace production
```

Passing `dd` as the deploy-id syncs all deployments listed in `./engine-private/deploy/dd.router`.

| Option                              | Description                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| `--dev`                             | Development mode (uses Kind cluster and `--etc-hosts`)         |
| `--kind` / `--kubeadm` / `--k3s`    | Cluster type                                                   |
| `--namespace <name>`                | Kubernetes namespace (default: `default`)                      |
| `--replicas <n>`                    | Number of replicas                                             |
| `--deploy-id-cron-jobs <deploy-id>` | Deploy ID for cron job synchronization (set to `none` to skip) |
| `--cmd-cron-jobs <cmd>`             | Pre-script commands before cron execution                      |
| `--create-job-now`                  | Create immediate Job from each CronJob after applying          |
| `--timezone <tz>`                   | Set timezone for the deployment                                |
| `--disable-private-conf-update`     | Prevent private configuration updates during execution         |

---

## Deploy Job

**Command:** `node bin run deploy-job <name> [options]`

Deploys a Kubernetes Job resource with configurable container settings, volumes, and resource limits.

```bash
node bin run deploy-job my-job --image-name my-app:latest --namespace default
node bin run deploy-job my-job --image-name my-app:v1 --tty --stdin --restart-policy Never
node bin run deploy-job my-job --image-name my-app:v1 --requests-memory 256Mi --limits-memory 512Mi
node bin run deploy-job my-job --image-name my-app:v1 --host-aliases "127.0.0.1=foo.local,bar.local;10.1.2.3=baz.remote"
```

| Option                         | Description                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `--image-name <name>`          | Docker image for the Job                                                                                       |
| `--namespace <name>`           | Kubernetes namespace (default: `default`)                                                                      |
| `--node-name <name>`           | Target node                                                                                                    |
| `--tty`                        | Enables TTY for the container                                                                                  |
| `--stdin`                      | Keeps STDIN open                                                                                               |
| `--restart-policy <policy>`    | Job restart policy (e.g., `Never`, `OnFailure`)                                                                |
| `--runtime-class-name <name>`  | Runtime class name                                                                                             |
| `--image-pull-policy <policy>` | Image pull policy (e.g., `Always`, `IfNotPresent`)                                                             |
| `--api-version <version>`      | Kubernetes API version for the manifest                                                                        |
| `--labels <labels>`            | Comma-separated key-value pairs (e.g., `app=my-app,env=prod`)                                                  |
| `--claim-name <name>`          | PVC claim name for volume mounting                                                                             |
| `--volume-host-path <path>`    | Host path for volume                                                                                           |
| `--volume-mount-path <path>`   | Container mount path                                                                                           |
| `--requests-memory <mem>`      | Memory request (e.g., `256Mi`)                                                                                 |
| `--requests-cpu <cpu>`         | CPU request (e.g., `250m`)                                                                                     |
| `--limits-memory <mem>`        | Memory limit (e.g., `512Mi`)                                                                                   |
| `--limits-cpu <cpu>`           | CPU limit (e.g., `500m`)                                                                                       |
| `--resource-template-id <id>`  | Predefined resource template ID                                                                                |
| `--host-aliases <aliases>`     | Pod `/etc/hosts` entries. Format: semicolons separate entries, `=` separates IP from comma-separated hostnames |
| `--cmd <cmd>`                  | Comma-separated list of commands to execute                                                                    |

---

## Common Options

| Option                           | Scope     | Description                     |
| -------------------------------- | --------- | ------------------------------- |
| `--dev`                          | All       | Development mode                |
| `--kind` / `--kubeadm` / `--k3s` | Cluster   | Cluster type                    |
| `--namespace <name>`             | Cluster   | Kubernetes namespace            |
| `--node-name <name>`             | Cluster   | Target node                     |
| `--replicas <n>`                 | Deploy    | Replica count                   |
| `--force`                        | Git       | Force push                      |
| `--pod-name <name>`              | Container | Pod name                        |
| `--image-name <name>`            | Container | Docker image                    |
| `--volume-host-path <path>`      | Container | Host directory                  |
| `--volume-mount-path <path>`     | Container | Container mount path            |
| `--claim-name <name>`            | Container | PVC name                        |
| `--host-network`                 | Container | Use host networking             |
| `--tls`                          | Deploy    | Enable TLS                      |
| `--expose`                       | Deploy    | Expose services                 |
| `--etc-hosts`                    | Deploy    | Modify /etc/hosts for local DNS |
| `--build`                        | Build     | Trigger build                   |
| `--reset`                        | Cluster   | Reset cluster state             |

## Prerequisites

- Kubernetes cluster running (Kind/Kubeadm/K3s)
- `kubectl` configured
- Docker available
- `GITHUB_USERNAME` environment variable set
- `./engine-private/deploy/dd.router` populated with deploy-ids (format: `dd-<conf-id>,dd-<conf-id>,...`)
- `./engine-private/deploy/dd.cron` populated with cron deploy-id (format: `dd-<conf-id>`)
- Per-deploy `.env.*` files in `./engine-private/conf/dd-<conf-id>/` with required secret values (see [Credential Security](#credential-security))
