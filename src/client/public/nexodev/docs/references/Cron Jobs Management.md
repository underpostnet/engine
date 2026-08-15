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

| Argument      | Description                                        | Default            |
| ------------- | -------------------------------------------------- | ------------------ |
| `deploy-list` | Comma-separated deploy IDs (`dd-<conf-id>`)        | `default`          |
| `job-list`    | Comma-separated job IDs (`dns`, `backup`, `vultr`) | All available jobs |

> **⚠️** `job-list` defaults to **every** job in `UnderpostCron.JOB`. `underpost cron dd-cron`
> with no second argument runs `vultr` too — and `vultr` can block the edge VPS. Name the
> jobs explicitly when you do not want all of them.

---

## Modes

The cron command operates in three modes:

| Mode                   | Trigger                     | Description                                                                         |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| **Direct execution**   | No manifest flags           | Runs job callbacks immediately in the current process                               |
| **Generate + Apply**   | `--generate-k8s-cronjobs`   | Generates K8s CronJob YAML manifests; optionally applies with `--apply`             |
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

### Pre-script Commands

Inject commands before cron execution inside the container:

```bash
node bin cron --generate-k8s-cronjobs --apply --cmd "cd /home/dd/engine && node bin env dd-core production" --kind --dev
```

---

## Options

| Option                      | Description                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `--generate-k8s-cronjobs`   | Generate K8s CronJob YAML manifests from `conf.cron.json`       |
| `--apply`                   | Apply generated manifests to the cluster via `kubectl`          |
| `--setup-start [deploy-id]` | Update `package.json` start script and generate+apply manifests |
| `--namespace <name>`        | Kubernetes namespace (default: `default`)                       |
| `--image <name>`            | Custom container image for CronJob pods                         |
| `--git`                     | Pass `--git` flag to job execution                              |
| `--cmd <command>`           | Pre-script commands before cron execution                       |
| `--dev`                     | Development mode (`node bin` instead of `underpost`)            |
| `--kind`                    | Kind cluster context                                            |
| `--k3s`                     | K3s cluster context                                             |
| `--kubeadm`                 | Kubeadm cluster context                                         |
| `--dry-run`                 | Preview jobs without executing                                  |
| `--create-job-now`          | Create an immediate Job from each CronJob after applying        |

---

## Job Types

| Job ID   | Description                | Deploy ID Source             | Callback                                                              |
| -------- | -------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `dns`    | Dynamic DNS record updates | `dd.cron`                    | Detects public IP changes and updates configured DNS provider records |
| `backup` | Database exports           | `dd.router` (all deploy-ids) | Runs `node bin db --export --primary-pod` for each deploy-id          |
| `vultr`  | Edge VPS bandwidth guard   | `dd.cron` (logged only)      | Meters the Vultr plan quota and blocks edge egress before overage     |

### DNS Job

Checks if the host's public IP has changed. When a new IP is detected, iterates through DNS records defined in `conf.cron.json` and calls the configured provider API (e.g. `dondominio`) to update A records. Verifies the update by resolving the configured host.

### Backup Job

Iterates through the comma-separated deploy-id list and runs a database export for each. Supports `--git` to commit exports to the cron-backups repository. Backup commands are always executed via SSH on the remote node.

### Vultr Bandwidth Job

Meters the edge VPS against its Vultr plan quota and cuts its egress before an overage accrues. See [Edge Hub WireGuard and HAProxy](<./Edge Hub WireGuard and HAProxy.md>) for the topology it protects.

Unlike `dns` and `backup`, this job **ignores the deploy-list**. The edge hub is one machine for the whole cluster — the same reason its WireGuard peer registry is cluster-wide rather than per-deploy — so the deploy-list is logged for attribution and nothing else. All of its configuration is environment, not JSON.

Each run:

1. `GET /v2/instances/:id` → the instance's `plan` id.
2. `GET /v2/plans` → that plan's monthly `bandwidth` quota, in GB. **Paginated**: the cursor is followed until the plan is found, because the catalogue is longer than one page. A plan that is not in the catalogue raises an error rather than resolving to a quota of zero.
3. `GET /v2/instances/:id/bandwidth` → the daily buckets, summed for the **current UTC month**. The response is a rolling window that can still carry the tail of the previous cycle, and those bytes are against a quota that has already reset.
4. `limitInBytes = planBandwidthGB × 1024³ × VULTR_BANDWIDTH_THRESHOLD`.
5. If consumption ≥ that limit, SSH to the edge VPS and run `underpost ip --block-all-egress` (falling back to `cd /home/dd/engine && node bin ip …` when the CLI is not installed globally).

Guards, in the order they apply:

| Guard                           | Behaviour                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API failure                     | Raises. **Nothing is blocked** — a guard that cut the edge on a failed API call would be an outage caused by the thing meant to prevent one.                                                                        |
| Unmetered plan (`bandwidth: 0`) | Reported and skipped, never blocked.                                                                                                                                                                                |
| Already blocked this cycle      | Latched in `VULTR_EGRESS_BLOCKED_AT` in the underpost root env, which the CronJob mounts from the host. A job firing hourly does not re-open an SSH session to a host that is already blocked. `--force` overrides. |
| SSH failure                     | Logged as an error and **not** latched, so the next run retries.                                                                                                                                                    |
| Back under budget               | The latch is cleared, but the host stays blocked — restoring traffic is an operator decision. `--auto-unblock` opts into doing it automatically.                                                                    |

> **⚠️ `--block-all-egress` takes every hostname behind the hub offline**, WireGuard included, so all spokes go dark at once. It is the cheaper failure: an overage accrues silently and without a ceiling, while a blocked edge is loud and reversible. `blockAllEgress` keeps `established,related` in the output chain and leaves the input chain untouched, so a **new** inbound SSH session still completes its handshake — the host stays reachable to run `underpost ip --unblock-all-egress`.

Run it by hand before trusting it to cron:

```bash
underpost vultr --dry-run          # measures and reports; touches no host
underpost vultr --metric outgoing  # count egress alone instead of both directions
```

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
    },
    "vultr": {
      "enabled": true,
      "expression": "0 * * * *"
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

| Field                  | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `jobs.<id>.enabled`    | Whether the job is active (`true`/`false`)                      |
| `jobs.<id>.expression` | Cron schedule expression (standard 5-field format)              |
| `records.A[]`          | DNS A record providers for the `dns` job                        |
| `records.A[].dns`      | Provider name (must match a handler in `Dns.services.updateIp`) |

#### `jobs.<id>` carries schedule, nothing else

A `jobs` entry answers exactly two questions — _does this job run_, and _how often_. It is not where a job is configured. Both fields have defaults, so **an empty object is valid**:

```json
"vultr": {}
```

is read as `enabled: true` (only an explicit `false` skips a job) with `expression: "0 0 * * *"` (the fallback in `generateK8sCronJobs`). It works — it just gives you a bandwidth guard that checks **once a day**, which is too coarse to catch a spike before it becomes an overage. Write the schedule you actually want:

```json
"vultr": { "enabled": true, "expression": "0 * * * *" }
```

Hourly is the right order of magnitude here. Vultr refreshes these counters periodically and its own documentation advises against using the endpoint for real-time metrics, so a per-minute schedule buys nothing and spends three API calls a minute.

There is **no `records`-style block for `vultr`**, and none is needed. `dns` reads its providers from this file because a record set is per-deploy configuration; the bandwidth guard's inputs are one API key and one instance id, which are credentials and machine identity — those live in `.env.<environment>`, resolved by `loadCronDeployEnv()` before the job is dispatched.

#### Vultr Environment Variables

Set these in `engine-private/conf/<dd.cron deploy-id>/.env.production` — the file `loadCronDeployEnv()` loads into `process.env` at the top of every cron run. The underpost root env (`underpost env set …`) is the fallback for each key.

| Variable                    | Required | Description                                                                    | Default                          |
| --------------------------- | -------- | ------------------------------------------------------------------------------ | -------------------------------- |
| `VULTR_API_KEY`             | **yes**  | Vultr API v2 key. Sent as a bearer token; never logged.                        | —                                |
| `VULTR_INSTANCE_ID`         | **yes**  | Instance id of the edge VPS to meter.                                          | —                                |
| `VULTR_BANDWIDTH_THRESHOLD` | no       | Fraction of the plan quota that triggers the block. `0.80` and `80` both work. | `0.80`                           |
| `VULTR_VPS_IP`              | no\*     | Edge VPS to SSH into. Falls back to `DEFAULT_SSH_HOST`.                        | —                                |
| `VULTR_SSH_USER`            | no       | Falls back to `DEFAULT_SSH_USER`.                                              | `root`                           |
| `VULTR_SSH_KEY_PATH`        | no       | Falls back to `DEFAULT_SSH_KEY_PATH`.                                          | `./engine-private/deploy/id_rsa` |
| `VULTR_SSH_PORT`            | no       | Falls back to `DEFAULT_SSH_PORT`.                                              | `22`                             |
| `VULTR_EGRESS_BLOCKED_AT`   | —        | Written by the job, not by you. The latch that stops a repeat block each run.  | _(unset)_                        |

> **⚠️ Set `VULTR_VPS_IP` explicitly.** `DEFAULT_SSH_HOST` exists in `dd-cron/.env.production` for the `backup` job and points at whatever that deploy's default SSH target is. If it is not the Vultr edge VPS, the fallback will run `--block-all-egress` **on the wrong machine**. The guard has no way to tell the two apart.

The paths resolve inside the CronJob container because it mounts `/home/dd/engine` from the host and runs with that as its working directory — the same mount the `backup` job's SSH commands rely on. The latch survives between runs because the root env directory (`/usr/lib/node_modules/underpost`) is a hostPath mount too.

#### Enabling it

```bash
# 1. credentials, in the cron deploy's production env
#    VULTR_API_KEY=...
#    VULTR_INSTANCE_ID=...
#    VULTR_VPS_IP=...

# 2. prove the reading is right before anything can act on it
node bin cron dd-cron vultr --dry-run

# 3. flip "enabled": true in conf.cron.json, then publish the CronJob
node bin cron --generate-k8s-cronjobs --apply --kubeadm
```

Step 2 matters: a job enabled without credentials fails on every fire, and a job enabled with the wrong `VULTR_VPS_IP` succeeds at blocking the wrong host. Keep the entry at `"enabled": false` until the dry run reads back the numbers you expect.

---

## Lifecycle

### Direct Execution Flow

1. Parse `deploy-list` and `job-list` arguments
2. For each job ID, look up the handler in `UnderpostCron.JOB`
3. Call the handler's `callback(deployList, options)`
4. DNS: check public IP → update records → verify
5. Backup: iterate deploy-ids → run `db --export --primary-pod` for each
6. Vultr: read plan quota + month-to-date usage → compare against the threshold → SSH `ip --block-all-egress` when crossed

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
4. Call `generateK8sCronJobs` with hardcoded production defaults (`--git`, `--dev`, `--kubeadm`)

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
        ├── dd-<conf-id>-backup.yaml
        └── dd-<conf-id>-vultr.yaml
```

---

## Credential Security

All sensitive credentials used by cron jobs (especially the `dns` job) are stored as
**environment variable references** (`env:VAR_NAME`) inside JSON configuration files —
never as plaintext values. The actual secret values live exclusively in `.env.<environment>`
files (e.g. `.env.production`) within `engine-private/`.

### The `env:` Reference Pattern

Configuration files (`conf.cron.json`) use a special `env:` prefix to point to environment
variables instead of embedding secrets directly:

```json
{
  "records": {
    "A": [
      {
        "dns": "dondominio",
        "user": "env:DDNS_USER",
        "api_key": "env:DDNS_API_KEY",
        "host": "env:DDNS_HOST"
      }
    ]
  },
  "jobs": {
    "dns": { "enabled": true, "expression": "*/5 * * * *" },
    "backup": { "enabled": true, "expression": "0 0 * * *" }
  }
}
```

At runtime, the engine's `resolveConfSecrets()` function walks the config object and replaces
every `"env:VAR_NAME"` string with the corresponding `process.env.VAR_NAME` value. This
happens automatically when configs are loaded via `loadConf()`.

### DDNS Environment Variables

| Variable        | Description                           | Default       |
| --------------- | ------------------------------------- | ------------- |
| `DDNS_HOST`     | Hostname to update via DDNS           | `example.com` |
| `DDNS_PROVIDER` | DNS provider name (e.g. `dondominio`) | `dondominio`  |
| `DDNS_API_KEY`  | DNS provider API key / password       | _(empty)_     |
| `DDNS_USER`     | DNS provider username                 | _(empty)_     |

These variables must be set in the appropriate `.env.<environment>` file
(e.g. `.env.production`) or injected via your deployment platform.

### How Credentials Flow

1. **`conf.cron.json`** stores `"env:DDNS_USER"`, `"env:DDNS_API_KEY"`, etc. — no
   secrets are present in the JSON file itself.
2. When `loadConf()` activates a deploy-id, it copies `.env.*` files and loads them
   into `process.env`. Configuration JSON files are **not** copied to a staging
   directory — they remain in `engine-private/conf/<deploy-id>/` and are read
   directly at runtime via `readConfJson()`.
3. At runtime, the `dns` job calls `readConfJson(deployId, 'cron', { resolve: true })`
   which reads from the private folder and resolves `env:` references into real values,
   then passes each A-record entry to the DNS provider handler (e.g. `dondominio`).
4. The handler validates that `user` and `api_key` are present before making any external
   API call. Missing credentials cause an error log and the update is skipped — the full
   URL containing the API key is **never logged**.

### Generated Manifest Files (`conf.dd-*.js`)

When `updateDefaultConf()` generates a `conf.dd-*.js` manifest:

1. `env:` references from `conf.server.json` are preserved as plain `'env:KEY'` strings in the generated JS file.
2. Non-sensitive values (expressions, booleans, static strings) are serialized normally.
3. At runtime, `resolveConfSecrets()` in `conf.js` resolves `'env:KEY'` strings to `process.env.KEY` values when configurations are loaded via `loadConf()` or `loadConfServerJson()`.

This ensures that **no plaintext secret ever appears** in source-controlled JS files.

> **⚠️ Important:** Ensure that `.env.*` files and `engine-private/` are listed in
> `.gitignore` and are **never committed** to public repositories. The placeholder
> values (`changethis`) in the root `.env.*` templates are intentional reminders
> to replace them with real credentials before deployment.

---

## Sync Integration

The `sync` command triggers cron setup automatically unless `--deploy-id-cron-jobs` is set to `none`:

```bash
node bin run sync dd-my-app --dev --kind --create-job-now
```

This calls the cron runner internally with resolved cluster flags, applying cron manifests as part of the deployment sync cycle. The `--cmd-cron-jobs` option on `sync` forwards pre-script commands to the cron generator.
