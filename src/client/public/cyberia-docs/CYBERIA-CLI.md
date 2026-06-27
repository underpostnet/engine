# Cyberia CLI

`cyberia` (`bin/cyberia.js`) is the Cyberia-specific extension layer on top of the `underpost` CLI. Use
it for MMO content and extension workflows; use `underpost` for the shared platform, deployment, and
infrastructure surface. Unrecognized commands pass through to `underpost`.

This page is intentionally command-first: keep it aligned with the shipped CLI surface and avoid
repeating architecture prose unless it changes command behavior.

```bash
node bin/cyberia.js <command> [subcommand] [options]
# or, installed globally:
cyberia <command> [subcommand] [options]
```

| Command        | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `ol`           | object-layer content import, procedural generation, atlas/sprite work |
| `instance`     | export / import / drop a Cyberia instance and its related documents   |
| `client-hints` | per-instance presentation hints (palette, camera, status icons)       |
| `chain`        | Hyperledger Besu network + ERC-1155 `ObjectLayerToken` lifecycle      |
| `run-workflow` | named operational scripts (seed defaults, build manifests/dashboard)  |

Most data commands resolve the target DB from `DEFAULT_DEPLOY_ID` / `DEFAULT_DEPLOY_HOST` /
`DEFAULT_DEPLOY_PATH` in the `--env-path` file (default `./.env`). `--dev` forces the deploy's
`.env.development` (localhost IPFS, etc.); `--mongo-host` overrides the Mongo host.

---

## `cyberia ol` — object layer

Import PNG assets, generate procedural layers, build atlas sprite sheets, push to IPFS + MongoDB.

```bash
cyberia ol [item-id] [options]
```

| Option                                                                               | Description                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--import`                                                                           | Import specific item-id(s), comma-separated, from the asset directory    |
| `--import-types [types]`                                                             | Batch import by type (e.g. `skin,floors`) or `all`                       |
| `--generate`                                                                         | Generate procedural layers from a semantic item-id (e.g. `floor-desert`) |
| `--count <n>` / `--density <0..1>`                                                   | Shape count multiplier (default `3`) / density (default `0.5`)           |
| `--seed <seed>`                                                                      | Deterministic seed for `--generate` (e.g. `fx-42`)                       |
| `--frame-index <n>` / `--frame-count <n>`                                            | Start frame (default `0`) / frame count (default `1`)                    |
| `--to-atlas-sprite-sheet [dim]`                                                      | Build a consolidated atlas PNG for the item                              |
| `--show-frame [dir_frame]`                                                           | View one frame (e.g. `08_0`; default `08_0`)                             |
| `--show-atlas-sprite-sheet`                                                          | Display the atlas PNG for the item                                       |
| `--drop`                                                                             | Drop existing data before importing (or standalone)                      |
| `--client-public` / `--git-clean`                                                    | With `--drop`: also remove static asset folders / run clean              |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` · `--storage-file-path <path>` | env / DB / dev / filter overrides                                        |

```bash
# Import specific items
cyberia ol hatchet,sword --import --env-path ./engine-private/conf/dd-cyberia/.env.development

# Batch import by type, or everything
cyberia ol --import-types skin,floors
cyberia ol --import-types all

# Procedural generation
cyberia ol floor-desert --generate --seed fx-42
cyberia ol floor-grass  --generate --frame-count 4 --count 5 --density 0.7

# Atlas / inspect
cyberia ol hatchet --to-atlas-sprite-sheet
cyberia ol hatchet --show-frame 08_0

# Drop + re-import a single item, including static folders
cyberia ol hatchet --drop --client-public --import
```

---

## `cyberia instance` — instance data

Export / import / drop a game instance and its related maps, entities, actions, quests, and object
layers in MongoDB.

```bash
cyberia instance [instance-code] [options]
```

| Option                                                | Description                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `--export [path]`                                     | Export instance and related documents to a backup directory             |
| `--import [path]`                                     | Import from a backup directory (upsert, preserves UUIDs)                |
| `--conf`                                              | With `--export`/`--import`: only `cyberia-instance.json` + `-conf.json` |
| `--drop`                                              | Drop all documents associated with the instance code                    |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                                                |

```bash
cyberia instance FOREST --export ./backups/FOREST
cyberia instance FOREST --import ./backups/FOREST
cyberia instance FOREST --drop
```

---

## `cyberia client-hints` — presentation hints

Manage the per-instance `CyberiaClientHints` document (palette, camera, status icons, interpolation).
These are presentation overrides only — never an instance or server identifier.

```bash
cyberia client-hints [instance-code] [options]
```

| Option                                                | Description                                     |
| ----------------------------------------------------- | ----------------------------------------------- |
| `--seed-defaults`                                     | Upsert canonical presentation-hint defaults     |
| `--export [path]`                                     | Export the hints document to JSON               |
| `--import [path]`                                     | Upsert hints from a JSON file                   |
| `--drop`                                              | Remove the hints document for the instance code |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                        |

```bash
cyberia client-hints cyberia-main --seed-defaults
cyberia client-hints cyberia-main --export ./client-hints-cyberia-main.json
```

---

## `cyberia chain` — Besu + ObjectLayerToken

Hyperledger Besu IBFT2 network and ERC-1155 `ObjectLayerToken` (CKY) lifecycle.

### Network

```bash
cyberia chain deploy [options]            # deploy IBFT2 network to Kubernetes
cyberia chain generate-manifests [opts]   # generate manifests without deploying (same options)
cyberia chain remove [--namespace besu] [--clean-keys] [--clean-manifests]
```

Key `deploy` options: `--validators <n>` (4) · `--chain-id <id>` (777771) · `--block-period <s>` (5) ·
`--epoch-length <n>` (30000) · `--besu-image <img>` · `--node-port-rpc <port>` (30545) ·
`--node-port-ws <port>` (30546) · `--namespace <ns>` (besu) · `--pull-image` · `--skip-generate` ·
`--skip-wait`.

### Contract

```bash
cyberia chain compile
cyberia chain test
cyberia chain deploy-contract --network besu-k8s   # deploys ObjectLayerToken, mints initial CKY
```

### Keys

```bash
cyberia chain key-gen                                       # new secp256k1 deployer key
cyberia chain set-coinbase --private-key 0xYOUR_KEY
cyberia chain set-coinbase --from-file ./engine-private/eth-networks/besu/<address>.key.json
```

### Tokens

```bash
cyberia chain register <item-id> --from-db --supply 1            # 1 = NFT, >1 = semi-fungible
cyberia chain batch-register --from-db --items '[{"itemId":"wood","supply":500000}]'
cyberia chain mint     --token-id 0 --to 0xABCD... --amount 1000000000000000000000
cyberia chain transfer --from 0x... --to 0x... --token-id 0 --amount 1000
cyberia chain burn     --token-id 0 --address 0x... --amount 500
cyberia chain balance  --address 0xABCD... --token-id 0
cyberia chain status   [--network besu-k8s]                     # chain id, block, supply, pause state
cyberia chain pause   [--network besu-k8s]                      # owner-only transfer freeze / resume
cyberia chain unpause [--network besu-k8s]
```

`--from-db` resolves the canonical IPFS CID from MongoDB (recommended over manual `--metadata-cid`).

---

## `cyberia run-workflow` — operational scripts

Named scripts from the `scripts/` directory for seeding and build maintenance.

| Subcommand                   | Description                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `import-default-items`       | Import default object layers, skills, dialogues, actions/quests, client-hints to Mongo |
| `seed-skills`                | Upsert `DefaultSkillConfig` into the `cyberia-skill` collection (full records)       |
| `seed-dialogues`             | Upsert `DefaultCyberiaDialogues` into the `cyberia-dialogue` collection             |
| `generate-semantic-examples` | Generate one procedural example per registered semantic prefix                      |
| `build-manifest`             | Build K8s Deployment + Service manifests for mmo-client / mmo-server                |
| `build-server-dashboard`     | Build the static cyberia-server metrics/status dashboard (`--dev`, `--output-path`) |

```bash
cyberia run-workflow import-default-items --env-path ./engine-private/conf/dd-cyberia/.env.development
cyberia run-workflow seed-skills
cyberia run-workflow generate-semantic-examples
cyberia run-workflow build-manifest
cyberia run-workflow build-server-dashboard
```

---

## Operational rules

- Preserve public CLI entrypoints and command names unless a change is intentionally breaking.
- Reuse existing helpers for config loading, env resolution, path normalization, and deploy selection.
- Prefer one source of truth for generated manifests, deploy IDs, runtime choice, and asset metadata.
- Treat generated artifacts (atlases, manifests, dashboard HTML) as outputs only; never hand-edit them.
- `engine-private/` is a private external dependency; never assume its contents exist locally.
