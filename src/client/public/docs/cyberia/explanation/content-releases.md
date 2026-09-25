# Content releases

Cyberia authors content in a workspace database and serves it from versioned release
databases. This explains the model and the databases it runs on.

## Databases

One MongoDB replica set, one logical database per boundary:

| Database                            | Holds                                                                   | Written by                      |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `DB_NAME_OBJECTLAYER`               | Canonical Object Layers                                                 | `objectlayer.org`               |
| `DB_NAME_ITEMLEDGER`                | Bindings, transfers, balances, checkpoints                              | `itemledger.com`, the indexer   |
| `DB_NAME_CRYPTOKOYN`                | CKY accounts                                                            | `cryptokoyn.net`                |
| `DB_NAME_CYBERIA`                   | Cyberia runtime: users, quest progress, server registry, release ledger | `cyberiaonline.com`             |
| `DB_NAME_CYBERIA_CONTENT`           | Workspace: what the Studio authors, drafts included                     | Portal Studio, `cyberia` CLI    |
| `DB_NAME_CYBERIA_CONTENT-<release>` | One content release: world, catalog, Object Layer cache                 | `cyberia content-release build` |
| `DB_NAME_NEXODEV`                   | `underpost.net`                                                         | `underpost.net`                 |

The Cyberia host declares its content APIs as the `content` partition of its `db`. Each request
reads one content view:

| View        | Content models read         | Readers                                                  |
| ----------- | --------------------------- | -------------------------------------------------------- |
| `workspace` | `DB_NAME_CYBERIA_CONTENT`   | A moderator of the host (the Studio), the `cyberia` CLI  |
| `served`    | The active release database | Players, the game servers over gRPC, service-key callers |

A promotion builds the new served models, then swaps them in one assignment. A reader sees the
previous release or the new one, never a mix. Runtime models stay in the runtime database in both
views, so a content operation can never reach player state.

The File store is shared by every release. Atlas renders are content-addressed, so two releases
may hold the same render: a write never deletes a replaced render there, and
`content-release prune` removes a render only when no kept release points at it.

## Content releases

```
build ──▶ candidate ──validate──▶ validated ──promote──▶ active ──(next promote)──▶ retired
                         │                                  ▲                          │
                         └──▶ invalid                       └──────── rollback ────────┘
```

| Step      | What happens                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Build     | `content-release build <id>` fills the release database: `--from backups` (default) or `--from workspace`, drafts left out  |
| Publish   | Every bound definition is stored at the Object Layer authority (idempotent)                                                 |
| Validate  | `catalog`, `canonical`, `pinned-references`, `labels`, `render`, `instances`, `schema`; records manifest and dependencies   |
| Promote   | One transaction retires the active release and activates the new one. A unique index allows one active release              |
| Serve     | Each engine follows the ledger (`CYBERIA_CONTENT_RELEASE_WATCH_MS`), rebinds the partition and hot-reloads the game servers |
| Roll back | `cyberia content-release rollback` re-promotes the previous release                                                         |
| Retire    | `cyberia content-release retire` retires the active release with no successor: the workspace serves until a promotion       |
| Prune     | Retired release databases beyond `--keep` are dropped; the active release and the rollback target stay                      |

A validation failure names each defect: a cid missing from the release, content whose hash is not
its cid, a draft, a profile other than the Cyberia runtime's, a cid the authority does not hold, an
unpinned or dangling quest or shop reference, a map label the catalog does not bind, a bound
definition with no stored primary render or with a primary render or metadata that is not the pair
its `data.render` names, an instance without its conf or maps.

The ledger records for each release its source (`backups` or `workspace`, engine version, commit,
builder), its manifest (instances, maps, bindings, quests, actions) and its Object Layer
dependencies (every bound and pinned CID).

Nothing writes a release database after its build. The Studio writes the workspace. The next
release carries those edits (`--from workspace`), or `cyberia instance --export` carries them into
the backups. A rerun of the same deploy finds a promoted release built and leaves it.

With no release active, the runtime serves the workspace. That is the local development mode;
[Cyberia local content development](../how-to/develop-content-locally.md) holds the daily workflow and the
local release rehearsal.
