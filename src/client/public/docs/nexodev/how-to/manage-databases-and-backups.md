# DB and Backup Management Guide

This guide provides comprehensive documentation for managing database backups using the `db` command in the Underpost CLI.

## Quick Reference

```bash
# Export backups with Git version control
underpost db <deploy-id> --export --git

# Import backups (clean restore)
underpost db <deploy-id> --import --drop --git

# View database statistics
underpost db <deploy-id> --stats

# MongoDB primary pod operations
underpost db <deploy-id> --export --primary-pod --git

# Multi-pod export
underpost db <deploy-id> --export --pod-name "mariadb-*" --all-pods

# Specific collections only
underpost db <deploy-id> --export --collections users,orders --git

# Generate rollback script
underpost db <deploy-id> --macro-rollback-export 3
```

## Overview

The `db` command supports:

- **Database Types**: MariaDB and MongoDB
- **Operations**: Import, export, statistics, and rollback
- **Git Integration**: Version control for backups
- **Multi-Pod Support**: Target specific pods or all matching pods
- **Kubernetes Native**: Seamless integration with Kubernetes deployments

## Command Syntax

```bash
underpost db <deploy-list> [options]
```

### Required Arguments

- `<deploy-list>`: Comma-separated list of deployment IDs (e.g., `default-a,default-b`)

### Available Options

| Option                        | Description                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `--import`                    | Import container backups from specified repositories                          |
| `--export`                    | Export container backups to specified repositories                            |
| `--pod-name <pod-name>`       | Comma-separated pod names or patterns (supports wildcards like `mariadb-*`)   |
| `--all-pods`                  | Target all matching pods instead of just the first one                        |
| `--primary-pod`               | Automatically detect and use MongoDB primary pod (MongoDB only)               |
| `--stats`                     | Display database statistics (collection/table names with document/row counts) |
| `--collections <collections>` | Comma-separated list of database collections to operate on                    |
| `--out-path <out-path>`       | Custom output path for backups                                                |
| `--drop`                      | Drop specified databases or collections before importing                      |
| `--preserveUUID`              | Preserve UUIDs during database import operations                              |
| `--git`                       | Enable Git integration for backup version control                             |
| `--force-clone`               | Force clone Git repository, overwriting local changes                         |
| `--hosts <hosts>`             | Comma-separated list of database hosts to filter operations                   |
| `--paths <paths>`             | Comma-separated list of paths to filter database operations                   |
| `--ns <ns-name>`              | Kubernetes namespace context (defaults to `default`)                          |
| `--macro-rollback-export <n>` | Export macro rollback script that reverts the last n commits                  |
| `--clean-fs-collection`       | Clean orphaned File documents not referenced by any models                    |
| `--clean-fs-dry-run`          | Dry run mode for `--clean-fs-collection` (preview without deleting)           |
| `--dev`                       | Development CLI context                                                       |
| `--kubeadm`                   | Kubeadm cluster context for database operations                               |
| `--kind`                      | Kind cluster context for database operations                                  |
| `--k3s`                       | K3s cluster context for database operations                                   |

---

## Core Usage Examples

### 1. Export Database Backups

Export backups from all databases in a deployment:

```bash
underpost db default-a --export
```

Export with Git version control:

```bash
underpost db default-a --export --git
```

Export to custom output path:

```bash
underpost db default-a --export --out-path /custom/backup/path
```

### 2. Import Database Backups

Import backups to restore databases:

```bash
underpost db default-a --import
```

Import with database drop (clean import):

```bash
underpost db default-a --import --drop
```

Import while preserving UUIDs:

```bash
underpost db default-a --import --preserveUUID
```

Import with Git integration:

```bash
underpost db default-a --import --git
```

### 3. Database Statistics

View database statistics (collections/tables and counts):

```bash
underpost db default-a --stats
```

View stats for specific pod:

```bash
underpost db default-a --stats --pod-name mongodb-primary
```

### 4. Multi-Pod Operations

Target specific pod by name:

```bash
underpost db default-a --export --pod-name mariadb-master
```

Target all pods matching a pattern:

```bash
underpost db default-a --export --pod-name "mariadb-*" --all-pods
```

Automatically detect MongoDB primary pod:

```bash
underpost db default-a --export --primary-pod
```

### 5. Collection-Specific Operations

Export specific collections only:

```bash
underpost db default-a --export --collections users,orders,products
```

Import specific collections with drop:

```bash
underpost db default-a --import --collections users --drop
```

### 6. Git Version Control

Export with Git integration (clone, commit, push):

```bash
underpost db default-a --export --git
```

Force clone repository (overwrite local changes):

```bash
underpost db default-a --export --git --force-clone
```

Import from Git repository:

```bash
underpost db default-a --import --git
```

### 7. Rollback Operations

Generate rollback script to revert last 3 commits:

```bash
underpost db default-a --macro-rollback-export 3
```

Generate rollback script for last 5 commits:

```bash
underpost db default-a --macro-rollback-export 5
```

### 8. Filtered Operations

Filter by specific hosts:

```bash
underpost db default-a --export --hosts db1.example.com,db2.example.com
```

Filter by paths:

```bash
underpost db default-a --export --paths /data/db1,/data/db2
```

Combine host and path filters:

```bash
underpost db default-a --export --hosts db1.example.com --paths /data/db1
```

### 9. Namespace Operations

Specify Kubernetes namespace:

```bash
underpost db default-a --export --ns production
```

Export from multiple deployments in staging namespace:

```bash
underpost db app-a,app-b --export --ns staging --git
```

### 10. Multiple Deployments

Process multiple deployments simultaneously:

```bash
underpost db default-a,default-b,default-c --export --git
```

Export from all deployments with specific pod pattern:

```bash
underpost db default-a,default-b --export --pod-name "mongodb-*" --all-pods
```

---

## Common Workflows

### Complete Backup Workflow

1. **Export with Git version control:**

   ```bash
   underpost db default-a --export --git
   ```

2. **View statistics to verify:**

   ```bash
   underpost db default-a --stats
   ```

3. **Create rollback point (optional):**
   ```bash
   underpost db default-a --macro-rollback-export 1
   ```

### Clean Database Restore

1. **Import with drop to clean existing data:**

   ```bash
   underpost db default-a --import --drop --git
   ```

2. **Verify with statistics:**
   ```bash
   underpost db default-a --stats
   ```

### MongoDB Primary Pod Backup

1. **Auto-detect and backup primary pod:**

   ```bash
   underpost db mongodb-cluster --export --primary-pod --git
   ```

2. **Restore to primary pod:**
   ```bash
   underpost db mongodb-cluster --import --primary-pod --drop
   ```

### Multi-Environment Sync

1. **Export from production:**

   ```bash
   underpost db prod-app --export --git --ns production
   ```

2. **Import to staging with clean slate:**
   ```bash
   underpost db staging-app --import --git --drop --ns staging
   ```

---

## Best Practices

### 1. Always Use Git Integration

Enable `--git` for automated version control and backup history:

```bash
underpost db default-a --export --git
```

### 2. Verify Before Import

Check statistics before importing to understand data impact:

```bash
underpost db default-a --stats
```

### 3. Use --drop Carefully

The `--drop` flag removes existing data. Always backup first:

```bash
underpost db default-a --export --git  # Backup first
underpost db default-a --import --drop  # Then import
```

### 4. Target Specific Pods

For production systems, target specific pods to minimize impact:

```bash
underpost db default-a --export --pod-name mongodb-primary
```

### 5. Create Rollback Points

Before major changes, create rollback scripts:

```bash
underpost db default-a --macro-rollback-export 5
```

### 6. Use Namespaces

Always specify namespace in multi-environment setups:

```bash
underpost db default-a --export --ns production --git
```

---

## Troubleshooting

### Pod Not Found

If pod is not found, list available pods:

```bash
kubectl get pods -n <namespace>
```

Then specify exact pod name:

```bash
underpost db default-a --export --pod-name <exact-pod-name>
```

### Multiple Pods Detected

Use `--all-pods` to process all matching pods:

```bash
underpost db default-a --export --pod-name "mariadb-*" --all-pods
```

Or target the primary pod for MongoDB:

```bash
underpost db default-a --export --primary-pod
```

### Git Conflicts

Force clone to override local changes:

```bash
underpost db default-a --export --git --force-clone
```

### Namespace Access

Ensure you have proper Kubernetes RBAC permissions:

```bash
kubectl auth can-i get pods -n <namespace>
```

### Pod Connection Errors During Export

`unable to upgrade connection: container not found ("mongodb")` means the container
restarted underneath a pod the API server still reports as `Ready`. Exports and imports
handle this themselves:

- **Exec-readiness gate** — before any dump, restore, or `kubectl cp`, the pod is probed
  with a no-op exec. A pod that only _looks_ ready is waited out instead of being dumped.
- **Bounded retry** — a failed dump, restore, or copy is replayed with exponential
  backoff (2s, 4s, 8s) up to a fixed attempt limit, then fails for good. Each retry waits
  for the pod to accept an exec stream again, so a replay never lands on a container that
  is still restarting. Operations that are not safe to replay — a `mongorestore` without
  `--drop`, a MariaDB SQL import — opt out and run exactly once.
- **Honest exit** — a run where any database failed logs
  `Database operation completed with failures` and exits non-zero. Whatever succeeded is
  still committed; the run is never reported as a success.

### `command terminated with exit code 137`

Exit 137 is SIGKILL from the kernel's OOM killer: `mongodump` runs **inside** the mongod
container and shares its memory limit, so a dump can push the container past that limit and
take mongod down with it. The restart then triggers a replica-set election, and the next
dump fails with `(NotPrimaryOrSecondary) node is not in primary or recovering state`.

Two things keep the dump inside the budget:

- `mongodump` runs with `--numParallelCollections=1`. The default of 4 quadruples the
  buffers held at once, and that is what crosses the limit.
- `manifests/mongodb/statefulset.yaml` pins `--wiredTigerCacheSizeGB 0.25` and gives the
  container a 1536Mi limit. Left to itself, mongod sizes its cache from the cgroup limit and
  lands on the 256MB floor, leaving nothing for the dump.

Confirm an OOM kill and check the restart count with:

```bash
kubectl get pod mongodb-0 -n <namespace> -o wide
kubectl describe pod mongodb-0 -n <namespace> | grep -A5 'Last State'
```

`Last State: Terminated, Reason: OOMKilled` confirms it. Raise the container's memory limit
in the StatefulSet if a growing database outgrows the current one.

### Runtime Reconnect After a StatefulSet Change

Node runtimes rebuild their own MongoDB connection — reconfiguring or restarting the
StatefulSet no longer requires redeploying every consumer.

This is **provider-scoped**: liveness probes and rebuild semantics differ per database client,
so each provider supplies its own, and only `mongoose` is implemented today. A provider without
one (MariaDB, PostgreSQL) is simply left unwatched — never probed with the wrong call.

The driver reconnects sockets on its own, but it cannot recover from a _reconfigured_ replica
set: it records the highest `setVersion`/`electionId` it has seen and rejects any primary
reporting lower values for the rest of the process. That is what leaves pods stuck on
`MongoServerSelectionError … ReplicaSetNoPrimary` until they are redeployed. Only a new client
clears it, so the provider builds one:

- **Health watch** — every loaded mongoose provider is pinged on an interval (bounded, so a
  hung server does not stall the check).
- **Rebuild** — a tick that finds the connection down rebuilds it: a new connection, models
  re-bound to it, then the old connection closed. Services resolve models through the provider
  bucket on every call, so nothing has to re-register.
- **Retry until restored** — there is no attempt budget. Every tick retries while the database
  is unreachable, because giving up would leave the runtime permanently unable to reach it.
  Ticks that land mid-attempt are skipped, so attempts never stack.
- **Fail-safe** — a rebuild that cannot connect keeps the existing connection rather than
  tearing it down, so a run never ends up with no connection at all.

| Variable                | Meaning                                        | Default |
| ----------------------- | ---------------------------------------------- | ------- |
| `DB_HEALTH_INTERVAL_MS` | Ping interval; `0` disables the watch entirely | `15000` |

`DataBaseProviderService.reconnect(context)` triggers the same rebuild on demand, for a
maintenance route or a one-off from a REPL.

### Slow or Hanging Primary Detection

`--primary-pod` resolves the replica-set primary over a **direct** connection
(`directConnection=true`) with explicit server-selection timeouts, and the whole probe runs
under a wall-clock budget. Without the direct connection the driver tries to reach the other
members by their StatefulSet DNS names, which turns one unreachable member into a
multi-minute stall.

Detection order, cheapest first:

1. `db.hello().primary` **without credentials** — the server answers `hello` before
   authentication, so this resolves even with an app user that has no cluster-monitor role.
2. The same probe with credentials, then `rs.status()` with credentials.
3. Every `Running` MongoDB pod is tried in turn — one member mid-restart does not end the
   search. The primary is resolved again for **every** database rather than cached across the
   run, because a member that restarts mid-backup re-elects and a stale answer sends every
   later dump to a node that no longer accepts them.

When no member answers, the export falls back to the first pod and logs
`Could not detect primary pod, using first pod`.

---

## Advanced Examples

### Selective Collection Backup and Restore

Export only user-related collections:

```bash
underpost db default-a --export --collections users,user_profiles,user_sessions --git
```

Import only specific collections without affecting others:

```bash
underpost db default-a --import --collections users --preserveUUID
```

### Cross-Namespace Migration

1. Export from production:

   ```bash
   underpost db prod-app --export --git --ns production
   ```

2. Import to development:
   ```bash
   underpost db dev-app --import --git --drop --ns development
   ```

### Automated Backup Script

Create a scheduled backup script:

```bash
#!/bin/bash
# Daily backup with Git version control
underpost db default-a,default-b --export --git --ns production
underpost db default-a,default-b --stats --ns production > backup-stats-$(date +%Y%m%d).log
```

---

## Credential Security

All database credentials are stored as **environment variable references** (`env:VAR_NAME`)
inside JSON configuration files — never as plaintext values. The actual secret values live
exclusively in `.env.<environment>` files (e.g. `.env.production`) within `engine-private/`.

### The `env:` Reference Pattern

Configuration files (`conf.server.json`, `conf.cron.json`) use a special `env:` prefix to
point to environment variables instead of embedding secrets directly:

```json
{
  "db": {
    "provider": "mariadb",
    "host": "env:MARIADB_HOST",
    "name": "env:DB_NAME_MYAPP",
    "user": "env:MARIADB_USER",
    "password": "env:MARIADB_PASSWORD"
  },
  "mailer": {
    "transport": {
      "auth": {
        "user": "env:SMTP_AUTH_USER",
        "pass": "env:SMTP_AUTH_PASS"
      }
    }
  }
}
```

At runtime, the engine's `resolveConfSecrets()` function walks the config object and replaces
every `"env:VAR_NAME"` string with the corresponding `process.env.VAR_NAME` value. This
happens automatically when configs are loaded via `loadConf()` or `loadConfServerJson()`.

### Database Environment Variables

| Variable           | Description                                     | Default                     |
| ------------------ | ----------------------------------------------- | --------------------------- |
| `DB_PROVIDER`      | Database provider (`mongoose`, `mariadb`)       | `mongoose`                  |
| `DB_HOST`          | MongoDB connection URI                          | `mongodb://127.0.0.1:27017` |
| `DB_NAME`          | Default database name                           | `default`                   |
| `DB_NAME_<SITE>`   | Per-site database name (e.g. `DB_NAME_NEXODEV`) | —                           |
| `MARIADB_HOST`     | MariaDB/MySQL host                              | `127.0.0.1`                 |
| `MARIADB_PORT`     | MariaDB/MySQL port                              | `3306`                      |
| `MARIADB_USER`     | MariaDB/MySQL username                          | `root`                      |
| `MARIADB_PASSWORD` | MariaDB/MySQL password                          | _(empty)_                   |

### SMTP / Mailer Environment Variables

| Variable              | Description                  | Default               |
| --------------------- | ---------------------------- | --------------------- |
| `SMTP_HOST`           | SMTP server hostname         | `smtp.default.com`    |
| `SMTP_PORT`           | SMTP server port             | `465`                 |
| `SMTP_SECURE`         | Use TLS (`true`/`false`)     | `true`                |
| `SMTP_AUTH_USER`      | SMTP authentication user     | _(empty)_             |
| `SMTP_AUTH_PASS`      | SMTP authentication password | _(empty)_             |
| `MAILER_SENDER_EMAIL` | Sender email address         | `noreply@default.net` |
| `MAILER_SENDER_NAME`  | Sender display name          | `Default`             |

### DDNS / Cron Environment Variables

| Variable        | Description                 | Default       |
| --------------- | --------------------------- | ------------- |
| `DDNS_HOST`     | Hostname to update via DDNS | `example.com` |
| `DDNS_PROVIDER` | DNS provider name           | `dondominio`  |
| `DDNS_API_KEY`  | DNS provider API key        | _(empty)_     |
| `DDNS_USER`     | DNS provider username       | _(empty)_     |

### Valkey (Redis-compatible) Environment Variables

| Variable      | Description        | Default     |
| ------------- | ------------------ | ----------- |
| `VALKEY_HOST` | Valkey server host | `127.0.0.1` |
| `VALKEY_PORT` | Valkey server port | `6379`      |

### Resolution Order

Credentials are resolved in the following priority:

1. **`env:` reference in JSON** — `conf.server.json` or `conf.cron.json` stores `"env:VAR_NAME"`.
2. **Environment variable** — `resolveConfSecrets()` resolves the pointer to `process.env.VAR_NAME`.
3. **Safe built-in default** — the `DefaultConf` in `conf.js` uses `process.env.VAR || 'fallback'` for base defaults.

### Generated Manifest Files (`conf.dd-*.js`)

When `updateDefaultConf()` generates a `conf.dd-*.js` manifest from `conf.server.json`:

1. `env:` references from `conf.server.json` are preserved as plain `'env:KEY'` strings in the generated JS file.
2. Non-sensitive values (arrays, booleans, static strings) are serialized normally.
3. At runtime, `resolveConfSecrets()` in `conf.js` resolves `'env:KEY'` strings to `process.env.KEY` values when configurations are loaded via `loadConf()` or `loadConfServerJson()`.

This ensures that **no plaintext secret ever appears** in source-controlled JS files.

> **⚠️ Important:** Ensure that `.env.*` files and `engine-private/` are listed in
> `.gitignore` and are **never committed** to public repositories. The placeholder
> values (`changethis`) in the root `.env.*` templates are intentional reminders
> to replace them with real credentials before deployment.

---

## Notes

- **Backup Retention**: System automatically maintains the last `MAX_BACKUP_RETENTION` backups
- **MongoDB Primary Detection**: `--primary-pod` automatically identifies the primary pod in replica sets, probing every `Running` member over a bounded direct connection
- **Pod Contact Resilience**: Every dump/restore/copy waits for the pod to accept an exec stream and retries with exponential backoff
- **Wildcard Support**: Pod names support wildcards (e.g., `mariadb-*`, `mongo-*`)
- **Git Requirements**: Git integration requires properly configured GitHub credentials
- **Kubernetes Context**: Ensure `kubectl` is configured with correct cluster context

---

## Related Commands

- `underpost metadata --export`: Export cluster metadata
- `underpost metadata --import`: Import cluster metadata
- `kubectl get pods -n <namespace>`: List available pods

For more information, refer to the CLI Reference Guide.
