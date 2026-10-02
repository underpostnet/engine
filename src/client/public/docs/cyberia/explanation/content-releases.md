# Content releases

Cyberia serves content from versioned release databases. A release sets the production baseline,
and every reader reads the release that is active. This explains the model and the databases it
runs on.

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

A promotion builds the new served models, then swaps them in one assignment. A reader sees the
previous release or the new one, never a mix. Runtime models stay in the runtime database whatever
the partition serves, so a content operation can never reach player state. A cached value belongs
to the data it was read from: each bound release database has its own cache keys, so a promotion
reads fresh values and a rollback reads the values of the release it restores. A write invalidates
its namespace, so the next read of every reader sees it.

`GET /api/v1/cyberia-content-release/active` names the active release, its source revision and the
database the runtime serves. It serves the release once the runtime also reads the content artifact
that release holds ([the release copy](content-artifact.md#the-release-copy)).

The File store is shared by every release. Atlas renders are content-addressed, so two releases
may hold the same render: neither a write nor a purge deletes a render there, and
`content-release prune` removes a render only when no kept release points at it.

## Content releases

A content release is the `data-release` profile of `cyberia-content`
([Source releases](../../nexodev/explanation/source-releases.md)): it builds from an exact source
revision in a Release Job and fills its own database before it serves.

```
building ──▶ candidate ──validate──▶ validated ──promote──▶ active ──(next promote)──▶ retired
    │            │                                            ▲                          │
    └────────────┴──▶ failed (with the stage)                 └──────── rollback ────────┘
```

| Step      | What happens                                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepare   | On the host, `content-release prepare <id> --channel <channel>` fetches the locked revision into a read-only workspace                                                                                                     |
| Contract  | In the Release Job, the repository's own `npm ci`, `npm test` and `npm pack` build a copy of the workspace, with no Secret                                                                                                 |
| Verify    | The built artifact has the locked digest and revision                                                                                                                                                                      |
| Ingest    | The release copy of the artifact is stored, then the foundation, the release sagas and each served world are imported into the release database: the release is a `candidate`. A failed foundation import imports no world |
| Validate  | Definitions are published to the Object Layer authority, then `artifact`, `catalog`, `canonical`, `pinned-references`, `labels`, `render`, `instances`, `schema`                                                           |
| Promote   | One transaction retires the active release and activates the new one. A unique index allows one active release                                                                                                             |
| Serve     | Each engine follows the ledger (`CYBERIA_CONTENT_RELEASE_WATCH_MS`), reads the release copy of the artifact, rebinds the partition and hot-reloads the game servers                                                        |
| Roll back | `cyberia content-release rollback` re-promotes the previous release                                                                                                                                                        |
| Retire    | `cyberia content-release retire` retires the active release with no successor: the workspace serves until a promotion                                                                                                      |
| Prune     | A Release Job drops old releases: database and ledger entry. A building, validated or active release and the rollback target stay. The host then removes every release workspace but the current one                       |

The source channel is provenance: a release from the private channel runs the same steps and may
serve production. One release executes at a time; a second one waits for its own run. A production
runtime promotes only a release built from an exact source revision; a local release
(`--from backups` or `--from workspace`) serves development only.

A validation failure names each defect: a release copy of the artifact that is missing, incomplete,
altered or of another content than the release records, a cid missing from the release, content
whose hash is not its cid, a draft, a profile other than the Cyberia runtime's, a cid the authority
does not hold, an unpinned or dangling quest or shop reference, a map label the catalog does not
bind, a bound definition with no stored primary render or with a primary render or metadata that is
not the pair its `data.render` names, an instance without its conf or maps.

The ledger records for each release its source (the channel, the repository and the revision),
every source the deploy resolved, the content artifact, its provenance (engine version and commit,
builder, Release Job), its manifest (instances, maps, bindings, quests, actions) and its Object
Layer dependencies (every bound and pinned CID). A failed release names the stage that failed.

A rerun of the same deploy resumes the same release: a validated or promoted one is left as it is,
and a failed one is built again. Every build starts from an empty candidate database, the first one
and each retry, so no document of an earlier attempt or an earlier release survives into it. The
release is a function of the source revision, the [release content](content-artifact.md#release-content)
and the release configuration.

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
`cyberia instance <code> --export <dir> --release <id>` writes it out, and a commit makes it source.
Nothing writes Git on its own. A rollback serves the previous release with the live changes it held
when it retired.

With no release active, the runtime serves the workspace. That is the local development mode;
[Cyberia local content development](../how-to/develop-content-locally.md) holds the daily workflow and the
local release rehearsal.
