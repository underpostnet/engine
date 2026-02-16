# Cron Jobs Management

## Configuration

Create `engine-private/conf/<deploy-id>/conf.cron.json`:

```json
{
  "jobs": {
    "dns": { "expression": "0 */6 * * *", "enabled": true },
    "backup": { "expression": "0 0 * * *", "enabled": true }
  }
}
```

Set the deploy-id reference in `engine-private/deploy/dd.cron`.

## CLI Usage

```bash
# Execute cron jobs directly
underpost cron <deploy-list> <job-list>

# Execute with flags
underpost cron default dns,backup --git --dev

# Preview jobs without executing
underpost cron default dns,backup --dry-run

# Generate K8s CronJob manifests
underpost cron --generate-k8s-cronjobs

# Generate and apply to cluster
underpost cron --generate-k8s-cronjobs --apply --k3s
underpost cron --generate-k8s-cronjobs --apply --kind
underpost cron --generate-k8s-cronjobs --apply --kubeadm

# Generate, apply, and immediately run all enabled CronJobs
underpost cron --generate-k8s-cronjobs --apply --create-job-now --k3s
underpost cron --generate-k8s-cronjobs --apply --create-job-now --kind
underpost cron --generate-k8s-cronjobs --apply --create-job-now --kubeadm

# Setup deploy-id start script and apply
underpost cron --setup-start <deploy-id> --apply --k3s

# Setup, apply, and immediately run
underpost cron --setup-start <deploy-id> --apply --create-job-now --kind
```

## Runner Integration

```bash
# Run cron setup via runner (reads dd.cron if no path given)
underpost run cron
underpost run --dev cron

# With cluster flag and pre-script command
underpost run --k3s --cmd-cron-jobs "echo hello" cron

# Sync runner forwards cluster and cron flags automatically
underpost run --k3s --cmd-cron-jobs "echo setup" sync dd-default
```

| Runner Flag | Description |
|-------------|-------------|
| `--cmd-cron-jobs <cmd>` | Pre-script commands forwarded as `--cmd` to cron execution |
| `--deploy-id-cron-jobs <id>` | Deploy-id for cron job synchronization during sync |

## Cluster Flags

| Flag | Context | Behavior |
|------|---------|----------|
| `--k3s` | k3s cluster | Applies directly on host |
| `--kubeadm` | kubeadm cluster | Applies directly on host |
| `--kind` | kind cluster | Syncs engine volume to `kind-worker` container before applying |

Cluster flags are forwarded through the full chain: `run sync` → `run cron` → `underpost cron` → backup/dns jobs → `node bin db --export`.

## Cron Command Options

| Option | Description |
|--------|-------------|
| `--generate-k8s-cronjobs` | Generate CronJob YAML manifests |
| `--apply` | Apply manifests to the cluster via kubectl |
| `--create-job-now` | After applying, immediately create a Job from each CronJob (requires `--apply`) |
| `--setup-start <deploy-id>` | Update deploy-id `package.json` start script and generate+apply manifests |
| `--namespace <ns>` | Kubernetes namespace (default: `default`) |
| `--image <image>` | Custom container image (overrides default) |
| `--git` | Pass `--git` flag to job execution |
| `--dev` | Use local `./` base path instead of global underpost |
| `--cmd <cmd>` | Pre-script commands to run before cron execution |
| `--dry-run` | Preview cron jobs without executing them |
| `--k3s` | k3s cluster context |
| `--kind` | kind cluster context |
| `--kubeadm` | kubeadm cluster context |

## Immediate Job Execution

The `--create-job-now` flag creates a one-off Kubernetes Job from each applied CronJob's `jobTemplate`, triggering an immediate run without waiting for the scheduled time. This is useful for:

- Verifying that newly deployed CronJobs execute correctly
- Running a cron task on-demand after a configuration change
- Initial deployment scenarios where the first execution shouldn't wait for the next schedule window

Under the hood, for each enabled CronJob it runs:

```bash
kubectl create job <cronjob-name>-now-<timestamp> --from=cronjob/<cronjob-name> -n <namespace>
```

The generated Job name is suffixed with a timestamp to avoid naming collisions and is truncated to the Kubernetes 63-character limit.

> **Note:** `--create-job-now` requires `--apply` because the CronJob must exist in the cluster before a Job can be created from it.

### Examples

```bash
# Apply manifests and immediately run all enabled CronJobs on a kind cluster
underpost cron --generate-k8s-cronjobs --apply --create-job-now --kind

# Setup a deploy-id, apply its CronJobs, and trigger them immediately
underpost cron --setup-start dd-cron --apply --create-job-now --kubeadm

# Apply to a specific namespace and run immediately
underpost cron --generate-k8s-cronjobs --apply --create-job-now --namespace production --k3s
```

## Default Image

Default container image: `underpost/underpost-engine:<version>`.

When `--apply` is used without a custom `--image`, the default image is automatically pulled and loaded into the cluster via `underpost image --pull-dockerhub underpost` using the specified cluster flag.

## Volume

All cron jobs mount the engine directory from the host:

- **hostPath**: `/home/dd/engine` (type: `Directory`)
- **mountPath**: `/home/dd/engine`
- **Volume name**: `underpost-cron-container-volume`

For `--kind` clusters, the engine directory is automatically synced into the `kind-worker` node before applying manifests.

## Available Jobs

- `dns` — DNS management tasks
- `backup` — Database export operations (uses `dd.router` for deploy-id resolution, forwards `--k3s`/`--kind`/`--kubeadm` to `node bin db --export`)