# Main Cluster Lifecycle Commands

Minimalist reference for Underpost engine cluster lifecycle commands.

---

## Table of Contents

1. [Deploy ID Convention](#deploy-id-convention)
2. [New](#new)
3. [Cluster Build](#cluster-build)
4. [Template Deploy](#template-deploy)
5. [SSH Deploy](#ssh-deploy)
6. [Cluster](#cluster)
7. [DD Container](#dd-container)
8. [Image](#image)
9. [Default Configuration](#default-configuration)
10. [Promote](#promote)
11. [Cron](#cron)

---

## Deploy ID Convention

The project uses two correlated naming patterns for identifying deployments and their associated repositories:

| Pattern | Format | Example | Usage |
|---------|--------|---------|-------|
| **Deploy ID** | `dd-<conf-id>` | `dd-core`, `dd-cyberia`, `dd-lampp` | Configuration directories, `dd.router`, deploy/sync/promote commands, env files |
| **Repo Name** | `engine-<conf-id>` | `engine-core`, `engine-cyberia`, `engine-lampp` | GitHub repositories, CI/CD workflows, template-deploy, ssh-deploy commit tags |

The `<conf-id>` suffix (e.g. `core`, `cyberia`, `lampp`, `test`) is the shared identifier that links both patterns:

- **Deploy ID** `dd-<conf-id>` → config stored at `./engine-private/conf/dd-<conf-id>/`
- **Repo Name** `engine-<conf-id>` → public repo, derived as `engine-${deployId.split('dd-')[1]}`
- **Private Repo** `engine-<conf-id>-private` → private configuration repo
- **Cron Backups Repo** `engine-<conf-id>-cron-backups` → cron backup repo
- **Conf file** `conf.dd-<conf-id>.js` → deployment configuration module

When a deploy ID is provided without the `dd-` prefix, the engine normalizes it automatically: `my-app` → `dd-my-app`. However, examples in this reference use the full `dd-<conf-id>` format for clarity.

Use `dd-<conf-id>` for all deploy/cluster/configuration commands. Use `engine-<conf-id>` for repository-level operations (template-deploy paths, ssh-deploy targets, CI/CD workflow files).

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

| Option | Description |
|--------|-------------|
| `--deploy-id <id>` | Create deployment ID configuration and env files (format: `dd-<conf-id>`) |
| `--cluster` | Create cluster files and sync (requires `--deploy-id`) |
| `--sub-conf <type>` | Create sub-configuration files (`client`, `server`) |
| `--build` | Build deployment to pwa-microservices-template |
| `--build-repos` | Create deployment ID repositories (`engine-<conf-id>`, `engine-<conf-id>-private`, `engine-<conf-id>-cron-backups`) |
| `--clean-template` | Clean the build directory |
| `--sync-conf` | Sync configuration to private repositories |
| `--purge` | Remove deploy ID and all related files |
| `--dev` | Development CLI context |
| `--default-conf` | Create default deploy ID configuration |
| `--conf-workflow-id <id>` | Custom configuration workflow ID |

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

| Option | Description |
|--------|-------------|
| `--dev` | Development mode |
| `--force` | Force push |

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

| Option | Description |
|--------|-------------|
| `--dev` | Development mode |
| `--force` | Force push |

---

## Cluster

**Command:** `node bin run cluster [path] [options]`

Complete cluster initialization: reset → kubeadm → pull images → deploy databases → deploy cache → ingress → certs → services.

```bash
node bin run cluster
node bin run cluster lampp,dd-core+dd-cyberia+dd-lampp
node bin run cluster --dev
node bin run cluster mysql,dd-core+dd-cyberia --dev
```

**Path format:** `<runtime-image>,<deploy-list>` — runtime defaults to `lampp`, deploy-list defaults to `dd.router` contents. Deploy IDs are `+`-separated and use the `dd-<conf-id>` format.

| Option | Description |
|--------|-------------|
| `--dev` | Development environment (uses `--etc-hosts`) |
| `--namespace <name>` | Kubernetes namespace (default: `default`) |
| `--replicas <n>` | Replicas per service |
| `--node-name <name>` | Target node |
| `--kubeadm` | Kubeadm cluster |
| `--kind` | Kind cluster |
| `--k3s` | K3s cluster |

---

## DD Container

**Command:** `node bin run dd-container [path] [options]`

Creates a development container in the cluster for testing.

```bash
node bin run dd-container
node bin run dd-container "npm test"
node bin run dd-container --pod-name my-dev-pod
node bin run dd-container --image-name custom-image:latest --dev
```

| Option | Description |
|--------|-------------|
| `--pod-name <name>` | Pod name (default: `underpost-dev-container`) |
| `--image-name <name>` | Docker image |
| `--node-name <name>` | Target node |
| `--claim-name <name>` | PVC name (default: `pvc-dd`) |
| `--volume-host-path <path>` | Host path (default: `/home/dd`) |
| `--dev` | Development mode (Kind cluster) |

---

## Image

**Command:** `node bin image [options]`

Pulls Underpost Dockerfile base images and loads them into clusters.

```bash
node bin image --pull-base
node bin image --pull-base --path /home/dd/engine/src/runtime/lampp
node bin image --pull-base --kind --dev
node bin image --pull-base --kubeadm --version 1.2.3
```

| Option | Description |
|--------|-------------|
| `--path <path>` | Dockerfile directory |
| `--kind` / `--kubeadm` / `--k3s` | Load into cluster |
| `--version <version>` | Custom image version |
| `--dev` | Development mode |

---

## Default Configuration

**Command:** `node bin new --default-conf --deploy-id <deploy-id>`

Creates or updates default configuration files for a deployment. Reads from `./engine-private/conf/dd-<conf-id>/` and writes the resolved config to `conf.dd-<conf-id>.js`.

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

**Command:** `node bin run cron [deploy-id] [options]`

Manages Kubernetes CronJob lifecycle for scheduled tasks (DNS updates, backups). Reads the default deploy-id from `./engine-private/deploy/dd.cron` when no deploy-id argument is provided. The deploy-id uses the `dd-<conf-id>` format.

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
# Generate and apply cron jobs using dd.cron default deploy-id
node bin run cron --dev --kind

# Specify deploy-id explicitly
node bin run cron dd-cron --dev --kind

# Apply manifests to cluster
node bin run cron dd-cron --dev --kind --apply

# Apply and immediately trigger all jobs
node bin run cron dd-cron --dev --kind --create-job-now

# Dry run (preview without executing)
node bin run cron dd-cron --dev --kind --dry-run

# With custom pre-command and namespace
node bin run cron dd-cron --dev --kind --cmd "echo setup" --namespace production

# Production with kubeadm
node bin run cron dd-cron --kubeadm
```

### Options

| Option | Description |
|--------|-------------|
| `--dev` | Development mode (`node bin` instead of `underpost`) |
| `--kind` | Kind cluster context |
| `--k3s` | K3s cluster context |
| `--kubeadm` | Kubeadm cluster context |
| `--git` | Pass `--git` flag to job execution |
| `--namespace <name>` | Kubernetes namespace (default: `default`) |
| `--image <name>` | Custom container image |
| `--cmd <command>` | Pre-script commands before cron execution |
| `--create-job-now` | Create an immediate Job from each CronJob after applying |
| `--dry-run` | Preview jobs without executing |

### Available Job Types

| Job ID | Description | Deploy ID Source |
|--------|-------------|-----------------|
| `dns` | DNS record updates | `dd.cron` |
| `backup` | Database backups | `dd.router` (all deploy-ids) |

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

## Common Options

| Option | Scope | Description |
|--------|-------|-------------|
| `--dev` | All | Development mode |
| `--kind` / `--kubeadm` / `--k3s` | Cluster | Cluster type |
| `--namespace <name>` | Cluster | Kubernetes namespace |
| `--node-name <name>` | Cluster | Target node |
| `--replicas <n>` | Deploy | Replica count |
| `--force` | Git | Force push |
| `--pod-name <name>` | Container | Pod name |
| `--image-name <name>` | Container | Docker image |
| `--volume-host-path <path>` | Container | Host directory |
| `--volume-mount-path <path>` | Container | Container mount path |
| `--claim-name <name>` | Container | PVC name |
| `--host-network` | Container | Use host networking |
| `--tls` | Deploy | Enable TLS |
| `--expose` | Deploy | Expose services |
| `--etc-hosts` | Deploy | Modify /etc/hosts for local DNS |
| `--build` | Build | Trigger build |
| `--reset` | Cluster | Reset cluster state |

## Prerequisites

- Kubernetes cluster running (Kind/Kubeadm/K3s)
- `kubectl` configured
- Docker available
- `GITHUB_USERNAME` environment variable set
- `./engine-private/deploy/dd.router` populated with deploy-ids (format: `dd-<conf-id>,dd-<conf-id>,...`)
- `./engine-private/deploy/dd.cron` populated with cron deploy-id (format: `dd-<conf-id>`)