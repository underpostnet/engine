# DB and Backup Management Guide

This guide documents the `db` command of the Underpost CLI: backups of MariaDB and MongoDB
databases in the object store, restores, verification, restore drills, retention and statistics.

No Git operation takes part in a backup or a restore. A backup goes to the object store, sealed.

## Quick Reference

```bash
# Back up every database of a deployment, then apply retention
underpost db <deploy-id> --export --prune

# List the backups of a deployment
underpost db <deploy-id> --list

# Restore the newest available backup (drop each collection first)
underpost db <deploy-id> --import --drop --preserveUUID

# Restore one backup
underpost db <deploy-id> --import --backup 20261029T101500Z-a1b2c3 --drop

# Read every byte of the newest backup, then restore it into an isolated mongod and compare
underpost db <deploy-id> --verify --restore-test

# Report what retention would remove
underpost db <deploy-id> --prune --keep 7 --dry-run

# View database statistics
underpost db <deploy-id> --stats
```

## Overview

A backup is a set of named **streams**, one for each:

- MongoDB database of the deployment: each host database and each database its partitions serve
  (`<partition>` and every `<partition>-<id>`),
- MariaDB database of the deployment,
- site file tree of a `repository` entry of `conf.server.json` (the live pod's site root).

Each stream is cut into **parts** (8 MiB by default). Each part is sealed with AES-256-GCM and
stored as one object. The **manifest** is stored last. It is the commit point:

- A backup without a manifest is never available.
- A backup that fails stores `failure.json`, removes its parts, and reads as `failed`.
- A failed or partial backup never appears as a successful one.

The manifest names every part with its size and SHA-256, and every stream with the SHA-256 of its
plaintext. A light verification reads only the object listing. A deep verification reads every byte.

## Configuration

| Variable                              | Meaning                                                                    | Default      |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------ |
| `UNDERPOST_OBJECT_STORE`              | `cloudinary`, or `file:<absolute directory>` for tests and isolated drills | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME`               | Cloudinary account of the object store                                     | —            |
| `CLOUDINARY_API_KEY`                  | Cloudinary API key                                                         | —            |
| `CLOUDINARY_API_SECRET`               | Cloudinary API secret                                                      | —            |
| `UNDERPOST_BACKUP_KEY`                | The 32-byte sealing key, base64 or hex (`openssl rand -hex 32`)            | — (required) |
| `UNDERPOST_BACKUP_PART_BYTES`         | Plaintext bytes per part                                                   | `8388608`    |
| `UNDERPOST_BACKUP_UPLOAD_CONCURRENCY` | Parts in flight to the store at once                                       | `2`          |
| `UNDERPOST_BACKUP_KEEP`               | Available backups retention always keeps, newest first                     | `7`          |
| `UNDERPOST_BACKUP_MAX_AGE_DAYS`       | Age after which retention removes a backup beyond the kept ones            | `30`         |
| `UNDERPOST_BACKUP_GRACE_HOURS`        | Age after which retention removes a failed or abandoned backup             | `24`         |
| `UNDERPOST_DB_CLIENT_CPU`             | CPU limit of the client pod that runs `mongodump` and `mongorestore`       | `1`          |
| `UNDERPOST_DB_CLIENT_MEMORY`          | Memory limit of that client pod                                            | `1Gi`        |
| `UNDERPOST_DB_DRILL_CPU`              | CPU limit of the restore drill pod                                         | `1`          |
| `UNDERPOST_DB_DRILL_MEMORY`           | Memory limit of the restore drill pod, which also runs a scratch `mongod`  | `1536Mi`     |
| `UNDERPOST_OBJECT_STORE_ATTEMPTS`     | Attempts of one object store request on a transient failure                | `5`          |

Keep the backup key in the host configuration scopes (`engine-private/deploy/scopes/*.env.production`)
and in one offline place. A backup cannot be opened without the key that sealed it. The manifest
records the key id, never the key.

## Command Syntax

```bash
underpost db <deploy-list> [options]
```

`<deploy-list>` is a comma-separated list of deployment IDs. `dd` selects every routed deployment.
One deployment that fails does not stop the others; the run fails when any did.

| Option                         | Description                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `--export`                     | Back up every database of each deployment to the object store                    |
| `--import`                     | Restore a backup of each deployment (the newest available one by default)        |
| `--backup <backup-id>`         | The backup `--import` or `--verify` reads                                        |
| `--list`                       | List the backups of each deployment                                              |
| `--verify`                     | Read every part of a backup and check its checksums, seal and archive inventory  |
| `--restore-test`               | With `--verify`, restore into an isolated `mongod` and compare with the manifest |
| `--prune`                      | Remove the backups retention no longer keeps                                     |
| `--keep <n>`                   | With `--prune`, available backups to keep, newest first                          |
| `--dry-run`                    | With `--prune`, report and remove nothing                                        |
| `--trees`                      | With `--import`, also restore the site file trees                                |
| `--collections <collections>`  | Export or restore only these collections of the host databases                   |
| `--out-path <out-path>`        | Write or read plain archives in this local directory instead of the object store |
| `--drop`                       | Drop each collection before restoring it                                         |
| `--preserveUUID`               | Preserve collection UUIDs on restore (requires `--drop`)                         |
| `--primary-pod`                | Read dumps from the MongoDB primary instead of a secondary                       |
| `--stats`                      | Display collection/table names with document/row counts                          |
| `--pod-name <pod-name>`        | Comma-separated pod names or patterns (`mariadb-*`)                              |
| `--all-pods`                   | With `--stats`, read every matching pod                                          |
| `--hosts <hosts>`              | Comma-separated database hosts to include                                        |
| `--paths <paths>`              | Comma-separated paths to include                                                 |
| `--ns <ns-name>`               | Kubernetes namespace (`default`)                                                 |
| `--clean-fs-collection`        | Remove File documents no model references                                        |
| `--clean-fs-dry-run`           | With `--clean-fs-collection`, report only                                        |
| `--migrate-stable-slugs`       | Give every Document its public `stableSlug`; idempotent                          |
| `--dev`                        | Development CLI context                                                          |
| `--kubeadm`, `--kind`, `--k3s` | Cluster context                                                                  |

---

## Export

```bash
underpost db dd-cyberia --export --prune
```

### Where the dump runs

A MongoDB dump never runs in the `mongod` container. The export starts a dedicated **client pod**,
`underpost-db-client-<deploy-id>`:

- Its image is the exact image (by digest) the replica set runs, so `mongodump` matches the server.
- It has its own CPU and memory limits (`UNDERPOST_DB_CLIENT_CPU`, `UNDERPOST_DB_CLIENT_MEMORY`).
- Its credentials are in a Secret applied from stdin. No command line holds them.
- Its name is the lock: a second export of the same deployment refuses to start while it runs.
- It ends after `activeDeadlineSeconds` (6 h) whatever happens, and the export removes it.

`mongodump --archive --gzip` writes to the stdout of an exec stream. The stream goes straight to
the object store: no dump lands on the disk of a pod or of the host. A MariaDB dump
(`mariadb-dump --single-transaction`) streams the same way from the MariaDB pod; this host
compresses it.

### Consistency

A dump reads one replica set member, a secondary unless `--primary-pod`. Each collection is read
at its own time. A backup has **no cross-collection point in time**; the manifest records this
under `meta.consistency`. The archive inventory (documents and indexes per namespace) is read from
the stream as it is stored, and the manifest records it.

### Failure

The export fails when a dump exits with an error, when an upload fails after its retries, or when
the store does not list every part with its size. The backup then reads as `failed`.

## Import

```bash
underpost db dd-cyberia --import --drop --preserveUUID
underpost db dd-cyberia --import --backup 20261029T101500Z-a1b2c3 --hosts www.cyberiaonline.com --paths /
```

The import restores every database stream of the selected hosts: the host databases and their
partition databases. It reads each part, checks it against the manifest, opens it, and pipes the
plaintext into `mongorestore --archive --gzip` in the client pod. Writes go to the primary.

- `--drop` drops each collection before restoring it. Without it, documents are inserted.
- `--collections` restores only those collections.
- `--trees` also extracts the site file trees into the live pods.
- Without a backup in the store, the import warns and leaves the databases as they are.

## Verification and restore drills

```bash
underpost db dd-cyberia --verify
underpost db dd-cyberia --verify --restore-test --backup 20261029T101500Z-a1b2c3
```

`--verify` reads every part, checks its size and SHA-256, opens its seal, checks the SHA-256 of
each stream, and parses each MongoDB archive to compare its inventory with the manifest.

`--restore-test` also runs a **restore drill**:

1. A pod of its own, `underpost-db-drill-<deploy-id>`, starts a scratch `mongod` on an `emptyDir`.
   Its TTL monitor is off: an expired document of a TTL collection still counts as restored.
2. Every MongoDB stream is restored into it.
3. Every namespace is compared with the manifest inventory (documents, indexes), and every
   collection passes `validate`.
4. The restore duration is recorded.
5. The pod and its scratch data are removed.

A drill never restores over production. The report is stored beside the manifest
(`verifications/<checked-at>.json`); the manifest stays as it was written.

## List and retention

```bash
underpost db dd-cyberia --list
underpost db dd-cyberia --prune --keep 7 --dry-run
```

Retention keeps the newest `UNDERPOST_BACKUP_KEEP` available backups. An older available backup goes
once it is older than `UNDERPOST_BACKUP_MAX_AGE_DAYS`. A failed or abandoned backup goes once it is
older than `UNDERPOST_BACKUP_GRACE_HOURS`; a younger incomplete one may still be writing. A prune
removes the manifest first, so an interrupted prune leaves an incomplete backup the next prune removes.

## Local archives

`--out-path <dir>` writes plain archives to a local directory (`<stream>.archive.gz`, `.sql.gz`,
`.tar.gz`) and an import reads them back. The archives are not sealed: they never leave the host.
`underpost metadata --export` and `--import` use this mode.

## Storage layout

```text
underpost/backups/<deploy-id>/<profile>/<backup-id>/manifest.json
underpost/backups/<deploy-id>/<profile>/<backup-id>/failure.json
underpost/backups/<deploy-id>/<profile>/<backup-id>/verifications/<checked-at>.json
underpost/backups/<deploy-id>/<profile>/<backup-id>/parts/<stream>/<sequence>
```

The `db` command writes the `dr` profile. A backup id is the UTC second it started and six random
hex digits (`20261029T101500Z-a1b2c3`), so ids sort by time.

In Cloudinary every object is a private raw asset with token access control; only a signed URL
delivers it. Each upload is checked: the stored size and MD5 must be the bytes sent. A different
object under the same key is refused, never replaced.

The manifest (`schemaVersion: 1`) records the backup id, profile, deployment, source (environment,
namespace, replica set identity and members, client image, engine version), store, encryption
(`aes-256-gcm`, key id, part size), every stream (kind, database, tool, format, read preference,
plaintext size and SHA-256, parts, inventory), totals, timestamps, duration, retention expiry and
the consistency the profile guarantees.

## Monitoring

The export, a failure and a verification each write a node-exporter textfile
(`/var/lib/node_exporter/textfile/underpost_backup_<deploy>_<profile>_<kind>.prom`):

| Gauge                                                   | Written by    |
| ------------------------------------------------------- | ------------- |
| `underpost_backup_last_success_timestamp_seconds`       | export        |
| `underpost_backup_last_bytes`, `_plain_bytes`, `_parts` | export        |
| `underpost_backup_last_duration_seconds`                | export        |
| `underpost_backup_last_failure_timestamp_seconds`       | failure       |
| `underpost_backup_last_verification_timestamp_seconds`  | verify        |
| `underpost_backup_last_verification_ok`                 | verify        |
| `underpost_backup_last_restore_test_ok`                 | restore drill |
| `underpost_backup_last_restore_test_duration_seconds`   | restore drill |

A backup is overdue when
`time() - underpost_backup_last_success_timestamp_seconds > 2 * 86400`; it is unverified when
`underpost_backup_last_verification_ok == 0`.

### RPO and RTO

- **RPO** is the interval of the backup cron job: with the daily job, at most 24 h of writes.
- **RTO** is measured by the restore drill: `underpost_backup_last_restore_test_duration_seconds` is
  the restore time of the newest drilled backup. Run `--verify --restore-test` on a schedule to keep
  the figure current.

## Scheduled backups

The `backup` cron job runs `node bin db <deploy-id> --export --prune` for every routed deployment on
the host node, over SSH. The host reads the object store credentials and the backup key from its
own configuration: no credential travels in the command. See
[Manage cron jobs](./manage-cron-jobs.md).

---

## Troubleshooting

### Another run holds the client pod

`Client pod underpost-db-client-<deploy-id> is Running: another run holds it` means an export or an
import of the same deployment runs. Wait for it. A pod a stopped run left is removed once it ended
or outlived its deadline.

### A backup reads as failed

`underpost db <deploy-id> --list` shows `failed`. The import of that id reports the stage and the
error the backup recorded. Fix the cause and export again; retention removes the failed backup.

### Another key

`Backup … is sealed with key <id>, not <id>` means `UNDERPOST_BACKUP_KEY` is not the key that sealed
the backup. Use the key of that time.

### Pod connection errors

`unable to upgrade connection: container not found` means a container restarted under a pod the
API server still reports as `Ready`. Every exec first waits until the pod accepts an exec stream,
and a failed exec that is safe to replay is retried with exponential backoff (2 s, 4 s, 8 s).

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

`--stats` reads the replica-set primary. It resolves the primary over a **direct** connection
(`directConnection=true`) with explicit server-selection timeouts, and the whole probe runs
under a wall-clock budget. Without the direct connection the driver tries to reach the other
members by their StatefulSet DNS names, which turns one unreachable member into a
multi-minute stall.

Detection order, cheapest first:

1. `db.hello().primary` **without credentials** — the server answers `hello` before
   authentication, so this resolves even with an app user that has no cluster-monitor role.
2. The same probe with credentials, then `rs.status()` with credentials.
3. Every `Running` MongoDB pod is tried in turn — one member mid-restart does not end the
   search.

When no member answers, the statistics read the first pod and log
`Could not detect primary pod, using first pod`.

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

### Generated Manifest Files (`underpost.config.dd-*.js`)

When `updateDefaultConf()` generates a `underpost.config.dd-*.js` manifest from `conf.server.json`:

1. `env:` references from `conf.server.json` are preserved as plain `'env:KEY'` strings in the generated JS file.
2. Non-sensitive values (arrays, booleans, static strings) are serialized normally.
3. At runtime, `resolveConfSecrets()` in `conf.js` resolves `'env:KEY'` strings to `process.env.KEY` values when configurations are loaded via `loadConf()` or `loadConfServerJson()`.

This ensures that **no plaintext secret ever appears** in source-controlled JS files.

> **⚠️ Important:** Ensure that `.env.*` files and `engine-private/` are listed in
> `.gitignore` and are **never committed** to public repositories. The placeholder
> values (`changethis`) in the root `.env.*` templates are intentional reminders
> to replace them with real credentials before deployment.
