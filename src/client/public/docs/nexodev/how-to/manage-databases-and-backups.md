# DB and Backup Management Guide

This guide documents the `db` command of the Underpost CLI: backups of MariaDB and MongoDB
databases in the object store, restores, verification, restore drills, retention, statistics, and
the operations on one application collection.

No Git operation takes part in a backup or a restore. A backup goes to the object store, sealed.

## Quick Reference

```bash
# Back up every database of a deployment, then apply retention
underpost db <deploy-id> --export --prune

# List the backups of a deployment, newest first
underpost db <deploy-id> --list

# Print the collections and documents of the newest backup, or of one
underpost db <deploy-id> --inspect
underpost db <deploy-id> --inspect --backup 20261029T101500Z-a1b2c3 --hosts services.cyberiaonline.com

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

# Report one collection, its File references and the state of a target
underpost db collection inspect user --deploy-id dd-core --host www.nexodev.org --target-host underpost.net

# Copy a collection with its File documents and the companies it references
underpost db collection clone user --source-deploy-id dd-core --source-host www.nexodev.org \
  --target-host underpost.net --aggregate company --apply
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

| Option                         | Description                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--export`                     | Back up every database of each deployment to the object store                                                                                                 |
| `--import`                     | Restore a backup of each deployment (the newest available one by default)                                                                                     |
| `--backup <backup-id>`         | The backup `--import` or `--verify` reads                                                                                                                     |
| `--list`                       | List the backups of each deployment                                                                                                                           |
| `--verify`                     | Read every part of a backup and check its checksums, seal and archive inventory                                                                               |
| `--restore-test`               | With `--verify`, restore into an isolated `mongod` and compare with the manifest                                                                              |
| `--prune`                      | Remove the backups retention no longer keeps                                                                                                                  |
| `--keep <n>`                   | With `--prune`, available backups to keep, newest first                                                                                                       |
| `--dry-run`                    | With `--prune`, report and remove nothing                                                                                                                     |
| `--trees`                      | With `--import`, also restore the site file trees                                                                                                             |
| `--collections <collections>`  | Export or restore only these collections of the host databases                                                                                                |
| `--out-path <out-path>`        | Write or read plain archives in this local directory instead of the object store                                                                              |
| `--drop`                       | Drop each collection before restoring it                                                                                                                      |
| `--preserveUUID`               | Preserve collection UUIDs on restore (requires `--drop`)                                                                                                      |
| `--primary-pod`                | Read dumps from the MongoDB primary instead of a secondary                                                                                                    |
| `--stats`                      | Display collection/table names with document/row counts                                                                                                       |
| `--pod-name <pod-name>`        | Comma-separated pod names or patterns (`mariadb-*`)                                                                                                           |
| `--all-pods`                   | With `--stats`, read every matching pod                                                                                                                       |
| `--hosts <hosts>`              | Comma-separated database hosts to include                                                                                                                     |
| `--paths <paths>`              | Comma-separated paths to include                                                                                                                              |
| `--namespace <namespace>`      | Legacy namespace of the databases and workloads; `--namespace-mongodb` and `--namespace-mariadb` override one ([placement](place-resources-in-namespaces.md)) |
| `--clean-fs-collection`        | Remove File documents no model references                                                                                                                     |
| `--clean-fs-dry-run`           | With `--clean-fs-collection`, report only                                                                                                                     |
| `--migrate-stable-slugs`       | Give every Document its public `stableSlug`; idempotent                                                                                                       |
| `--dev`                        | Development CLI context                                                                                                                                       |
| `--kubeadm`, `--kind`, `--k3s` | Cluster context                                                                                                                                               |

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
underpost db dd-cyberia --import --backup 20261029T101500Z-a1b2c3 --hosts services.cyberiaonline.com --paths /
```

The import restores every database stream of the selected hosts: the host databases and their
partition databases. It reads each part, checks it against the manifest, opens it, and pipes the
plaintext into `mongorestore --archive --gzip` in the client pod. Writes go to the primary.

The import chooses a database stream by its database, never by the host that held it when the
backup was taken: a backup taken before a host was renamed restores into the renamed host.

- `--drop` drops each collection before restoring it. Without it, documents are inserted.
- `--collections` restores only those collections.
- `--trees` also extracts the site file trees into the live pods. A tree is chosen by its host path.
- Without a backup in the store, the import warns and leaves the databases as they are.

### Restore under another name

`--rename-database <from>:<to>` restores each database whose name is `<from>`, or starts with
`<from>-`, under `<to>`. One pair renames a host database, its partitions and their release
databases:

```bash
# example2-cyberia, example2-cyberia-content and example2-cyberia-content-<release> restore as
# cyberia, cyberia-content and cyberia-content-<release>
underpost db dd-cyberia --import --hosts services.cyberiaonline.com --rename-database example2-cyberia:cyberia --drop
```

The configuration names the new databases: the import restores the streams whose new name a
selected host declares. The source databases stay as they are; drop them yourself once the new
ones serve. A renamed collection gets a new UUID, because its source keeps the old one:
`--preserveUUID` applies to the streams that keep their name. `--inspect` takes the same pairs and
prints the name each stream restores under.

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

## Backup contents

```bash
underpost db dd-cyberia --list
underpost db dd-cyberia --inspect --backup 20261111T010009Z-0a2e8d --hosts services.cyberiaonline.com
```

`--list` prints each backup, newest first: its status, its id (the UTC second it started), its
stored size, and `verified` when a verification record exists.

`--inspect` reads one manifest, never the data: the newest available backup, or the one `--backup`
names. It prints when the backup started, how long it took, its size and expiry, its source, its
last verification, and each stream with the documents and indexes of every collection:

```text
backup    20261111T010009Z-0a2e8d  started 2026-11-11 01:00:09 UTC  took 22 s  53.9 MiB stored, 210.4 MiB plain  expires 2026-12-11 01:00:09 UTC
source    production  context kubernetes-admin@kubernetes  replica set rs0 6744f1c2…  engine v3.4.0
verified  never
stream    mongodb-cyberia  mongodb  cyberia  services.cyberiaonline.com/  48.2 MiB
          cyberia.users                                                      412 documents  4 indexes
```

`--hosts` and `--paths` keep the streams of the databases those hosts declare. When no stream
matches, the command names the databases the backup holds; add `--rename-database` for a database
renamed since the backup. Compare two backups to see when a collection changed, then restore the one
that holds the data. A new replica set id between two backups means a new MongoDB server.

## List and retention

```bash
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

## Restore a production backup into the development sandbox

`--dev` restores into the MongoDB of the development sandbox of this host, and never into another
cluster. [Replicate production data](run-a-development-sandbox.md#replicate-production-data) holds
the workflow:

```bash
underpost db dd-cyberia --import --dev --backup 20261111T010009Z-0a2e8d --hosts services.cyberiaonline.com --drop
```

## Collection operations

`underpost db collection` inspects, clones, moves and renames one application collection. The
argument names the collection, or the API whose model owns it (`user` or `users`). Each command prints
its plan; only `--apply` writes. No output holds a credential.

| Command                           | What it does                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `inspect <collection>`            | Documents, indexes, File references, missing Files, relationships; reads only |
| `clone <collection>`              | Copies the collection to a target and verifies it; the source stays unchanged |
| `move <collection>`               | Clones and verifies; deletes the source only with `--confirm-source-delete`   |
| `rename <collection> --to <name>` | Renames the collection inside its database; refuses a name that exists        |

### Targets

Outside a container the command reaches the MongoDB primary through a port-forward, because the
member names resolve only inside the cluster. With `--dev` it reaches the MongoDB of the development
sandbox through its forward.

A target is a deployment, a host it declares, one path of that host and its database:
`--deploy-id`, `--host`, `--path` and `--database` for `inspect` and `rename`; `--source-*` and
`--target-*` for `clone` and `move`. The target deployment is the source deployment unless
`--target-deploy-id` names another. The command reads `conf.server.json` of the deployment with its
secrets resolved, and refuses an undeclared host or path. When several paths of a host declare a
database, the command names them and asks for `--path`. `--database` replaces the configured database
of the side it names. The model of a partition API reads its partition database; the command reads it
there too.

`inspect` reports the target state when `--target-host` is given.

### File documents

A clone or a move takes with it each File document that the collection references, through the paths
of `src/api/file/file.ref.json`. A path may cross nested objects, subdocuments and arrays. The
command copies the referenced Files only, in bounded batches, with their `_id` and their binary data
byte for byte. A File the target already holds with the same content counts as copied. A File the
target holds with other content under the same `_id` stops the operation. A File the source lacks
stops it before any write. The plan names each one with the document that references it:
`documents 6765… -> File 6945…`.

`--allow-missing-files` copies such a reference as it is, so the target keeps the defect of the
source. The plan, the result and the operation record count each one. Repair the document in the
source when you can.

`--disable-file-sync` copies no File. The command still reads each reference, and refuses the
operation when the target lacks a referenced File.

`underpost:unit` checks the registry against the schemas: each registered path is a File reference
of its model, and each File reference of a model is registered.

### Aggregates

No other relationship is followed unless `--aggregate` names it. `--aggregate company` reads the
references of the collection schema to the `Company` model (`associatedCompanies.company` of
`user`), and copies only the companies the documents reference, with their Files. An aggregate the
schema does not reference, a dynamic reference (`refPath`), `file` and the collection itself are
refused. One level is followed: the aggregate documents bring their Files, never their own aggregates.

### Copy, verification and resumption

Documents go through the native driver in `_id` order, in batches of `--batch-size` documents (500)
and at most 32 MiB. BSON values keep their types: `ObjectId`, `Binary`, `Date`, `Decimal128`,
`Long`, `Int32` and `Double`. The target collection gets the indexes and the options of the source
(collation, validator, capped size) before the first document. A target collection with documents, or
with an index the source defines another way, blocks the operation. A unique index conflict stops it.
A view, a time series or a clustered collection is refused.

After the copy, the verification compares every source document with its target copy, every File and
aggregate document byte for byte, the counts, the indexes and the options.

Each clone or move writes a record in the `underpost-data-operations` collection of the target base
database: its id, both sides, the collection, the aggregates, the File policy, the counts, the stage,
the last batch and any failure. Run the same command again to resume an interrupted operation: the
copy starts again from the first batch, and each document the target already holds is compared, not
written again.

### Move

A move without `--confirm-source-delete` stops after the verification and leaves the source as it
is. Stop the writes to the source, then run the command again with the flag. The move verifies again,
drops the source collection, and deletes each source File that no registered collection of the
source databases still references. A File that another collection references stays.

### Consistency

No operation is a point-in-time snapshot, and none uses a transaction. A document or a File written
to the source during an operation may not be part of it. Stop the writes to the source, or schedule a
maintenance window, before a move.

### A backup as the source

`clone --source-backup-id <backup-id>` reads the source from a `dr` backup of the source deployment.
The backup must be available, every part listed in the store, and its last recorded verification
passed. The command restores only the needed collections, part by checked part, into staging databases
(`underpost-staging-*`) on the target server, clones from them, and drops them on success and failure.
Neither the backup nor the live source changes. A failed drop is reported.

### Give a site its own database

Two hosts can read one database. To give one of them its own, copy the collections it needs into a
new database, then point its configuration at it. `underpost.net` read the `nexodev` database of
`www.nexodev.org`; its users and documents move like this:

```bash
# conf.server.json of dd-cyberia names env:DB_NAME_UNDERPOST for underpost.net; .env.<env> sets it
underpost db collection inspect user --deploy-id dd-cyberia --host underpost.net
underpost db collection clone user --source-deploy-id dd-core --source-host www.nexodev.org \
  --target-deploy-id dd-cyberia --target-host underpost.net --apply
underpost db collection clone document --source-deploy-id dd-core --source-host www.nexodev.org \
  --target-deploy-id dd-cyberia --target-host underpost.net --apply
```

The File documents of both collections come with them. Clone the users first: the panel lists a
public document only when its user is an `admin` or a `moderator` of the same database. Deploy the
host with the new configuration after both clones complete. The source database keeps every
collection, and each site writes only its own database after the clone.

A host that started on the new database already holds its seeded administrator
(`DEFAULT_ADMIN_PASSWORD`), and the user clone refuses a target with documents. Stop the host, put
that collection aside, then clone:

```bash
underpost db collection rename user --deploy-id dd-cyberia --host underpost.net --to users-seed --apply
```

Rehearse in the development sandbox with a backup as the source:

```bash
node bin db collection clone user --dev --source-deploy-id dd-core --source-host www.nexodev.org \
  --source-backup-id <backup-id> --target-deploy-id dd-cyberia --target-host underpost.net --apply
```

### Rename

A rename keeps the documents, their ids and the indexes. A File stays where it is. Update the model
or its configuration to read the new name: the command prints that warning.

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
3. **Default of the reference** — `"env:VAR_NAME:fallback"` (in `underpost.config.js` or a conf file) gives `fallback` when the variable is unset.

### Generated Manifest Files (`underpost.config.dd-*.js`)

When `writeConfManifest()` (`node bin new --default-conf`) generates a `underpost.config.dd-*.js` manifest from `conf.server.json`:

1. `env:` references from `conf.server.json` are preserved as plain `'env:KEY'` strings in the generated JS file.
2. Non-sensitive values (arrays, booleans, static strings) are serialized normally.
3. At runtime, `resolveConfSecrets()` in `conf.js` resolves `'env:KEY'` strings to `process.env.KEY` values when configurations are loaded via `loadConf()` or `loadConfServerJson()`.

This ensures that **no plaintext secret ever appears** in source-controlled JS files.

> **⚠️ Important:** Ensure that `.env.*` files and `engine-private/` are listed in
> `.gitignore` and are **never committed** to public repositories. The placeholder
> values (`changethis`) in the root `.env.*` templates are intentional reminders
> to replace them with real credentials before deployment.
