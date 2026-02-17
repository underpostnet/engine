# Cron Jobs Management

Minimalist reference for Underpost engine cron job CLI.

---

## Table of Contents

1. [Command](#command)
2. [Modes](#modes)
3. [Usage](#usage)
4. [Options](#options)
5. [Job Types](#job-types)
6. [Configuration](#configuration)
7. [Lifecycle](#lifecycle)
8. [File Structure](#file-structure)
9. [Sync Integration](#sync-integration)

---

## Command

```bash
underpost cron [deploy-list] [job-list] [options]
node bin cron [deploy-list] [job-list] [options]    # dev mode
```

| Argument | Description | Default |
|----------|-------------|---------|
| `deploy-list` | Comma-separated deploy IDs (`dd-<conf-id>`) | `default` |
| `job-list` | Comma-separated job IDs (`dns`, `backup`) | All available jobs |

---

## Modes

The cron command operates in three modes:

| Mode | Trigger | Description |
|------|---------|-------------|
| **Direct execution** | No manifest flags | Runs job callbacks immediately in the current process |
| **Generate + Apply** | `--generate-k8s-cronjobs` | Generates K8s CronJob YAML manifests; optionally applies with `--apply` |
| **Setup deploy start** | `--setup-start [deploy-id]` | Updates `package.json` start script and generates+applies manifests for a deploy-id |

---

## Usage

### Direct Execution

Run jobs immediately without Kubernetes manifests:

```bash
underpost cron dd-cron dns
underpost cron dd-cron backup --git
underpost cron dd-cron dns,backup
node bin cron dd-cron dns --dev
```

### Generate Manifests

Generate CronJob YAML files without applying:

```bash
node bin cron --generate-k8s-cronjobs --dev
node bin cron --generate-k8s-cronjobs --namespace production --dev
```

### Apply to Cluster

Generate and deploy CronJob manifests to a running cluster:

```bash
node bin cron --generate-k8s-cronjobs --apply --kind --dev
node bin cron --generate-k8s-cronjobs --apply --kubeadm
node bin cron --generate-k8s-cronjobs --apply --k3s --image custom:latest
```

### Immediate Job Creation

After applying, create a one-off Job from each CronJob:

```bash
node bin cron --generate-k8s-cronjobs --apply --create-job-now --kind --dev
```

### Setup Deploy Start

Update a deploy-id's `package.json` start script and generate its manifests:

```bash
node bin cron --setup-start dd-cron
node bin cron --setup-start dd-my-app --namespace staging
```

### Dry Run

Preview jobs without executing:

```bash
node bin cron dd-cron dns --dry-run
node bin cron dd-cron backup --dry-run --dev
```

### SSH Remote Execution

Execute backup jobs via SSH on the remote node:

```bash
underpost cron dd-cron backup --ssh --git
```

### Pre-script Commands

Inject commands before cron execution inside the container:

```bash
node bin cron --generate-k8s-cronjobs --apply --cmd "cd /home/dd/engine && node bin env dd-core production" --kind --dev
```

---

## Options

| Option | Description |
|--------|-------------|
| `--generate-k8s-cronjobs` | Generate K8s CronJob YAML manifests from `conf.cron.json` |
| `--apply` | Apply generated manifests to the cluster via `kubectl` |
| `--setup-start [deploy-id]` | Update `package.json` start script and generate+apply manifests |
| `--namespace <name>` | Kubernetes namespace (default: `default`) |
| `--image <name>` | Custom container image for CronJob pods |
| `--git` | Pass `--git` flag to job execution |
| `--cmd <command>` | Pre-script commands before cron execution |
| `--dev` | Development mode (`node bin` instead of `underpost`) |
| `--kind` | Kind cluster context |
| `--k3s` | K3s cluster context |
| `--kubeadm` | Kubeadm cluster context |
| `--dry-run` | Preview jobs without executing |
| `--create-job-now` | Create an immediate Job from each CronJob after applying |
| `--ssh` | Execute backup commands via SSH on the remote node |

---

## Job Types

| Job ID | Description | Deploy ID Source | Callback |
|--------|-------------|------------------|----------|
| `dns` | Dynamic DNS record updates | `dd.cron` | Detects public IP changes and updates configured DNS provider records |
| `backup` | Database exports | `dd.router` (all deploy-ids) | Runs `node bin db --export --primary-pod` for each deploy-id |

### DNS Job

Checks if the host's public IP has changed. When a new IP is detected, iterates through DNS records defined in `conf.cron.json` and calls the configured provider API (e.g. `dondominio`) to update A records. Verifies the update by resolving the configured host.

### Backup Job

Iterates through the comma-separated deploy-id list and runs a database export for each. Supports `--git` to commit exports to the cron-backups repository and `--ssh` to execute on a remote node.

---

## Configuration

### DD Cron File

`./engine-private/deploy/dd.cron` — stores the default cron deploy-id (e.g. `dd-cron`). Used when no deploy-id argument is provided.

### Conf Cron JSON

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
  },
  "records": {
    "A": [
      {
        "dns": "dondominio",
        "user": "ddns-user",
        "api_key": "ddns-api-key",
        "host": "example.com"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `jobs.<id>.enabled` | Whether the job is active (`true`/`false`) |
| `jobs.<id>.expression` | Cron schedule expression (standard 5-field format) |
| `records.A[]` | DNS A record providers for the `dns` job |
| `records.A[].dns` | Provider name (must match a handler in `Dns.services.updateIp`) |

---

## Lifecycle

### Direct Execution Flow

1. Parse `deploy-list` and `job-list` arguments
2. For each job ID, look up the handler in `UnderpostCron.JOB`
3. Call the handler's `callback(deployList, options)`
4. DNS: check public IP → update records → verify
5. Backup: iterate deploy-ids → run `db --export --primary-pod` for each

### Manifest Generation + Apply Flow

1. **Resolve deploy-id** — argument or `./engine-private/deploy/dd.cron`
2. **Read `conf.cron.json`** — load job definitions from `./engine-private/conf/dd-<conf-id>/conf.cron.json`
3. **Generate YAML** — for each enabled job, produce a CronJob manifest at `./manifests/cronjobs/dd-<conf-id>/dd-<conf-id>-<job>.yaml`
4. **Delete existing** — `kubectl delete cronjob <name> --ignore-not-found`
5. **Load image** — ensure the container image is available on the cluster
6. **Sync engine** — if `--kind`, copy engine directory into `kind-worker` container
7. **Apply** — `kubectl apply -f` on each generated manifest
8. **Create immediate jobs** — if `--create-job-now`, run `kubectl create job <name>-now --from=cronjob/<name>`

### Setup Deploy Start Flow

1. Resolve deploy-id (argument or `dd.cron` file)
2. Read `conf.cron.json` and validate enabled jobs exist
3. Update `package.json` start script with `kubectl apply -f` commands for each job manifest
4. Call `generateK8sCronJobs` with hardcoded production defaults (`--git`, `--dev`, `--kubeadm`, `--ssh`)

---

## File Structure

```
engine-private/
├── deploy/
│   ├── dd.cron              # Default cron deploy-id (e.g. dd-cron)
│   └── dd.router            # Deploy-id list for backup jobs
└── conf/
    └── dd-<conf-id>/
        ├── conf.cron.json   # Job definitions and DNS records
        └── package.json     # Updated by --setup-start

manifests/
└── cronjobs/
    └── dd-<conf-id>/
        ├── dd-<conf-id>-dns.yaml
        └── dd-<conf-id>-backup.yaml
```

---

## Sync Integration

The `sync` command triggers cron setup automatically unless `--deploy-id-cron-jobs` is set to `none`:

```bash
node bin run sync dd-my-app --dev --kind --create-job-now
```

This calls the cron runner internally with resolved cluster flags, applying cron manifests as part of the deployment sync cycle. The `--cmd-cron-jobs` option on `sync` forwards pre-script commands to the cron generator.