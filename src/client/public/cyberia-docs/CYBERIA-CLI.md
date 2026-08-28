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
| `--export-current-fallbackworld`                      | Capture the in-memory procedural fallback world, then export it         |
| `--keep-fallback-codes`                               | Capture using the raw `fallback-map-*` / canonical action-quest codes   |
| `--fallback-url <url>`                                | Capture the world a running engine serves instead of regenerating it    |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                                                |

```bash
cyberia instance FOREST --export ./backups/FOREST
cyberia instance FOREST --import ./backups/FOREST
cyberia instance FOREST --drop
```

### Capturing the procedural fallback world

The fallback world is never persisted: every engine process rebuilds it from the code defaults at
boot and serves it whenever a requested instance is absent. `--export-current-fallbackworld` freezes
that in-memory world into MongoDB under a real instance code — maps and portal topology, the
instance conf, and the content collections the fallback path serves from code rather than the DB
(skills, entity-type defaults, dialogues, actions, quests) — and then exports it like any other
instance.

```bash
# Freeze the current fallback world as PROC-1 and back it up
cyberia instance PROC-1 --export-current-fallbackworld --dev

# Restore it later as an ordinary persisted instance
cyberia instance PROC-1 --import --dev
```

Map, action and quest codes are namespaced under the instance code (`fallback-map-0` →
`PROC-1-map-0`) so successive captures never overwrite each other; `--keep-fallback-codes` writes
the canonical codes verbatim instead. Sprites are the one thing a capture cannot synthesise: when a
referenced item id has no `ObjectLayer` document the command aborts and names the ids to import with
`cyberia ol <ids> --import`. Staged fallback default items live only in the serving engine process,
so pass `--fallback-url http://localhost:4001` to capture a live world rather than regenerating it.

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

| Subcommand                   | Description                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `import-default-items`       | Import default object layers, skills, dialogues, actions/quests, client-hints to Mongo |
| `seed-skills`                | Upsert `DefaultSkillConfig` into the `cyberia-skill` collection (full records)         |
| `seed-dialogues`             | Upsert `DefaultCyberiaDialogues` into the `cyberia-dialogue` collection                |
| `generate-semantic-examples` | Generate one procedural example per registered semantic prefix                         |
| `build-manifest`             | Build K8s Deployment + Service manifests for mmo-client / mmo-server                   |
| `build-server-dashboard`     | Build the static cyberia-server metrics/status dashboard (`--dev`, `--output-path`)    |

```bash
cyberia run-workflow import-default-items --env-path ./engine-private/conf/dd-cyberia/.env.development
cyberia run-workflow seed-skills
cyberia run-workflow generate-semantic-examples
cyberia run-workflow build-manifest
cyberia run-workflow build-server-dashboard
```

---

## Bringing up the full stack locally

```bash
node bin run cluster --deploy-id dd-cyberia --dev
```

One command, no extra flags. It resets and rebuilds the node, deploys MongoDB / IPFS / Valkey, imports each database from its git backup, installs the Gateway API control plane, and deploys `dd-cyberia` behind it.

What `--dev` implies, rather than requiring you to pass it:

- **Gateway API + Envoy Gateway**, with **HTTP/3 (QUIC) on by default** beside HTTP/2 and HTTP/1.1.
- **Self-signed, locally trusted TLS** for every hostname in `conf.server.json`, plus the matching `/etc/hosts` entries — so a local Chromium reaches `https://www.cyberiaonline.com` through the real data plane.
- **The gateway static tier seeded** with the portal's `/404`, `/offline` and `/maintenance` documents before the routes are applied, then refreshed from the running container once it is Ready. See [Architecture → Edge tier](./ARCHITECTURE.md).

The run ends with a gateway status report: listener and route conditions, the workloads behind them, and an HTTPS probe of every route hostname.

### With the MMO services

`--instance-id` brings up custom instances from `engine-private/conf/dd-cyberia/conf.instances.json` in the same run:

```bash
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server --dev
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server,mmo-client --dev
```

Each id runs only where `dd-cyberia` declares it, and only once the portal workload has rolled out — `cyberia-server` dials the engine's gRPC ClusterIP for its world configuration at boot, so the content authority has to be serving first. `mmo-server` names the whole variant family (`amethyst-strata-expansion`, `FOREST`, `TEST`); `mmo-server-forest` names one variant.

`server.cyberiaonline.com` and `client.cyberiaonline.com` are issued the same self-signed certificates as the portal hosts and written into the same `/etc/hosts` pass, so the three services are reachable over TLS from a local browser without further setup. In production the same flag issues cert-manager certificates instead.

To place the static documents again without redeploying — after rebuilding the portal client, for instance:

```bash
node bin deploy dd-cyberia development --sync-static --gateway-api --kubeadm
```

---

## Operational rules

- Preserve public CLI entrypoints and command names unless a change is intentionally breaking.
- Reuse existing helpers for config loading, env resolution, path normalization, and deploy selection.
- Prefer one source of truth for generated manifests, deploy IDs, runtime choice, and asset metadata.
- Treat generated artifacts (atlases, manifests, dashboard HTML) as outputs only; never hand-edit them.
- `engine-private/` is a private external dependency; never assume its contents exist locally.
