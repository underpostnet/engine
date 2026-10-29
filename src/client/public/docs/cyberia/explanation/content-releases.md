# Content releases

Cyberia serves content from versioned release databases. A release sets the production baseline,
and every reader reads the release that its process serves. This explains the model and the
databases it runs on.

## Databases

One MongoDB replica set, one logical database per boundary:

| Database                            | Holds                                                                   | Written by                                                          |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `DB_NAME_OBJECTLAYER`               | Canonical Object Layers                                                 | `objectlayer.org`                                                   |
| `DB_NAME_ITEMLEDGER`                | Bindings, transfers, balances, checkpoints                              | `itemledger.com`, the indexer                                       |
| `DB_NAME_CRYPTOKOYN`                | CKY accounts                                                            | `cryptokoyn.net`                                                    |
| `DB_NAME_CYBERIA`                   | Cyberia runtime: users, quest progress, server registry, release ledger | `cyberiaonline.com`                                                 |
| `DB_NAME_CYBERIA_CONTENT`           | Workspace: what the CLI authors, drafts included                        | `cyberia` CLI, the Studio while no release is active                |
| `DB_NAME_CYBERIA_CONTENT-<release>` | One content release: world, catalog, Object Layer cache, artifact copy  | `cyberia content-release build`, then moderators while it is active |
| `DB_NAME_NEXODEV`                   | `underpost.net`                                                         | `underpost.net`                                                     |

The Cyberia host declares its content APIs as the `content` partition of its `db`. The runtime
binds the partition to the database it serves: the active release, or the workspace while no
release is active. Every reader reads that database: guests, users, moderators, admins, the game
servers over gRPC and service-key callers. A role decides what a caller may change, never what it
reads. The `cyberia` CLI binds nothing: it works on the workspace, or on the release `--release`
names.

In one engine process, a promotion builds the new served models, then swaps them in one
assignment: a reader of that process sees the previous release or the new one, never a mix. The
processes take a promotion one by one ([Serving a release](#serving-a-release)). Runtime models stay in the runtime database whatever
the partition serves, so a content operation can never reach player state. A cached value belongs
to the data it was read from: each bound release database has its own cache keys, so a promotion
reads fresh values and a rollback reads the values of the release it restores. A write invalidates
its namespace, so the next read of every reader sees it.

`GET /api/v1/cyberia-content-release/active` names the active release, its source revision and the
database the runtime serves. It serves the release once the runtime also reads the content artifact
that release holds ([the release copy](content-artifact.md#the-release-copy)).

The File store is shared by every release. Atlas renders are content-addressed, so two releases
may hold the same render: neither a write nor a purge deletes a render there, and
`content-release prune` removes a render only when no kept release points at it and no player
owns its definition. It reads the definitions players own before it drops a database, so the IPFS
copy of their renders stays pinned.

## Content releases

A content release is the `data-release` profile of `cyberia-content`
([Source releases](../../nexodev/explanation/source-releases.md)): it builds from an exact source
revision in a Release Job and fills its own database before it serves.

```
building ──▶ candidate ──validate──▶ validated ──promote──▶ active ──(next promote)──▶ retired
    │            │                                            ▲                          │
    └────────────┴──▶ failed (with the stage)                 └──────── rollback ────────┘
```

| Step      | What happens                                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepare   | On the host, `content-release prepare <id> --channel <channel>` fetches the locked revision into a read-only workspace                                                                                                                                                    |
| Contract  | In the Release Job, the repository's own `npm ci`, `npm test` and `npm pack` build a copy of the workspace, with no Secret                                                                                                                                                |
| Verify    | The built artifact has the locked digest and revision                                                                                                                                                                                                                     |
| Ingest    | The release copy of the artifact is stored, then the foundation, the release sagas, the global content and each served world are imported into the release database, each as one durable step. Their definitions stay drafts. A failed foundation import imports no world |
| Publish   | One durable task per bound and global definition makes it canonical at the Object Layer authority ([Publication](#publication)); then the release is a `candidate`                                                                                                        |
| Validate  | `artifact`, `catalog`, `canonical`, `labels`, `skills`, `render`, `global`, `instances`, `economy`, `schema`                                                                                                                                                              |
| Promote   | One transaction retires the active release and activates the new one. A unique index allows one active release                                                                                                                                                            |
| Serve     | Each engine follows the ledger, reads the release copy of the artifact, rebinds the partition and hot-reloads the game servers ([Serving a release](#serving-a-release))                                                                                                  |
| Roll back | `cyberia content-release rollback` re-promotes the previous release                                                                                                                                                                                                       |
| Retire    | `cyberia content-release retire` retires the active release with no successor: the workspace serves until a promotion                                                                                                                                                     |
| Prune     | A Release Job drops old releases: database and ledger entry. A building, validated or active release, the rollback target and the renders players own stay. The host then removes every release workspace but the current one                                             |

The source channel is provenance: a release from the private channel runs the same steps and may
serve production. One release executes at a time; a second one waits for its own run. A production
runtime promotes only a release built from an exact source revision; a local release
(`--from backups` or `--from workspace`) serves development only.

A validation failure names each defect: a release copy of the artifact that is missing, incomplete,
altered or of another content than the release records, a cid missing from the release, content
whose hash is not its cid, a draft, a profile other than the Cyberia runtime's, a cid the authority
does not hold, a quest or an action that still pins a definition, a map label the catalog does not
bind, a skill document that cannot run, a bound definition with no stored primary render or with a primary render or metadata that is
not the pair its `data.render` names, a global content definition the release does not store, does
not publish, or whose atlas is not the render it names, an instance without its conf or maps.

The ledger records for each release its source (the channel, the repository and the revision),
every source the deploy resolved, the content artifact, its provenance (engine version and commit,
builder, Release Job), its manifest (instances, maps, bindings, global content, quests, actions) and
its Object Layer dependencies (every bound CID and every global content CID). A failed release names the stage that failed.

A rerun of the same deploy resumes the same release: a validated or promoted one is left as it is,
and a failed one resumes. Its candidate database, its verified artifact and its completed steps and
publications stay; only what did not complete runs. A retry never runs `npm ci`, `npm test` and
`npm pack` again: it reads the artifact the candidate holds, checked file by file against its digest.
A release id with another source revision or another content digest is refused. The first build
starts from an empty candidate database; `content-release build --reset` starts it again, raises its
generation and records the reset in the audit trail of the release. The release is a function of the
source revision, the [release content](content-artifact.md#release-content) and the release
configuration.

`cyberia content-release inspect <release-id>` shows the stage that stopped a release, each task
that is waiting, blocked or failed with its attempts and its error, and the audit trail.

### Publication

The Object Layer authority is the only writer of canonical definitions. A release import stores its
definitions as drafts and asks nobody; the publication stage then settles each one:

1. Read the authority. A publication whose answer was lost may have stored the definition.
2. Send a definition the authority lacks, then read it again. Only the stored state completes the
   task, never the answer to the write.
3. Make the draft the cache copy of the canonical content.

A timeout, a reset connection, HTTP 429 or 5xx is transient: the task is retried with exponential
backoff, jitter and the wait a `Retry-After` asks for, at most `CYBERIA_RELEASE_PUBLISH_ATTEMPTS`
times (8), then it is `blocked`. Transient failures in a row open a circuit breaker: no new
publication starts until it closes. A refusal, another identity, or other content under the same CID
is permanent: the task `failed`. At most `CYBERIA_RELEASE_PUBLISH_CONCURRENCY` (4) publications run at
once. The stage ends after `CYBERIA_RELEASE_PUBLISH_DEADLINE_MS` (20 min); what is left keeps its
state, and the release cannot validate until every definition is canonical. The next build resumes the
tasks that did not complete. `DOMAIN_API_WRITE_TIMEOUT_MS` sets the budget of one write.

A task is one entry of `tasks` in the ledger row (`src/server/release/release-tasks.js`). A claim is
one conditional update on its generation: one execution wins and holds a lease. An execution whose
lease expired and whose task another one claimed again writes nothing.

## Serving a release

A promotion is one transaction in the ledger. Each process then takes the new release on its own,
so the platform converges on it; it never switches everywhere at the same instant.

| Process                   | Takes the new release                                                        | When                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Engine                    | Reads the release copy of the artifact and rebinds the partition, atomically | At its next ledger watch: `CYBERIA_CONTENT_RELEASE_WATCH_MS`, 15 s by default            |
| One game server per world | Rebuilds its world from the release                                          | When an engine that took the release triggers its hot reload                             |
| Each other replica        | Rebuilds its world from the release                                          | At its passive reload, `ENGINE_GRPC_RELOAD_INTERVAL_SEC`, or at restart when that is `0` |

Inside one process the switch is atomic: the readers of an engine see one release, and a game
server builds its world from one release. Between processes, two releases serve at the same time
until every process took the new one.

Three reads show how far a promotion got:

- `GET /api/v1/cyberia-content-release/active` on an engine names the release it serves.
- Each game server process reports to the [server registry](server-registry.md) the `releaseId` its
  world was built from, and its `build`.
- Each logical endpoint of the registry lists the `releases` its live replicas serve. One value
  means the replicas converged; several mean the promotion still spreads.

## Development and production

Both lifecycles import the same release content in the same order. They differ in the store and in
what runs the import.

### Development

```text
bootstrap → foundation → release sagas → release instances → edit → hot reload
```

`cyberia run-workflow import-content` imports into the workspace, a mutable database: it upserts,
and an import into a store that already holds content keeps what Studio authored. The content job
of the Docker stack runs the same command. No Release Job, ledger entry or candidate database takes
part. [Cyberia local content development](../how-to/develop-content-locally.md) holds the daily
workflow.

### Production

```text
source revision → release workspace → empty candidate database → release copy → foundation
  → release sagas → release instances → validation → promotion → active
```

A Release Job runs `cyberia content-release build --from source`. The serving workload never imports
content: it serves the active release and follows the ledger.

## Live changes

A release is authoritative for the production baseline. It is not a read-only dataset. While it is
active, moderators and admins change it through the same APIs and permissions as any other data,
and the hot reload rebuilds the game servers from it:

```
release baseline + live authorized changes = current production state
```

The next release replaces the baseline with the content of `cyberia-content`, and keeps no live
change. A change that must outlive its release goes into `cyberia-content` on purpose:
`cyberia content-release export-live` writes it out from a production content baseline, and a commit makes it source.
An item binding is such a change: the export freezes the definition each item runs into the
snapshot, and the next release restores it. So is [global content](runtime-binding.md#global-content):
the export writes each definition no world carries, and the next release imports it. Nothing writes Git on its own, and no release reads
the previous database. See [Runtime binding](runtime-binding.md#releases). A rollback serves the previous release with the live changes it held
when it retired.

A release records the fingerprint of its content as it was built: one digest per content API of
the worlds and their bindings (instances, confs, maps, quests, actions, dialogues, skills, entity
defaults, the item catalog and the global content). Timestamps, version keys, save revisions and generated map
pictures do not count. `content-release live-changes` compares the active release with its
fingerprint and names each API that changed. `promote` and `build --promote` refuse while there
is a change, because the promotion stops serving it. Export the changed worlds, commit them to
`cyberia-content`, and build the next release from that revision. `--discard-live-changes`
promotes anyway; the changes then stay in the retired release database until a prune drops it. A
release that records no fingerprint has unknown live changes and needs the same choice. A rollback
is not checked: the release it leaves keeps its own live changes.

With no release active, the runtime serves the workspace. That is the local development mode;
[Cyberia local content development](../how-to/develop-content-locally.md) holds the daily workflow and the
local release rehearsal.
