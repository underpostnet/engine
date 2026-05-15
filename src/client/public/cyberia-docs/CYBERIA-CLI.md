<p align="center">
  <img src="https://www.cyberiaonline.com/assets/splash/apple-touch-icon-precomposed.png" alt="CYBERIA Network Object Layer Engine"/>
</p>

<div align="center">

### CYBERIA

**Network Object Layers**

_Stackable Rendering Layers as a Unified Tokenized Reality_

[![Version](https://img.shields.io/npm/v/cyberia.svg)](https://www.npmjs.org/package/cyberia)

</div>

# Cyberia CLI

**Path:** `bin/cyberia.js`

---

## Overview

The Cyberia CLI (`cyberia`) is an extension of the **Underpost CLI** specifically for the Cyberia MMORPG ecosystem. Underpost is the end-to-end bare-metal infrastructure platform for general-purpose applications; `cyberia` extends it with tooling for the game's content pipeline, economy, and MMO engine toolchain. Unrecognized commands are transparently passed through to `underpost` for infrastructure operations.

The CLI manages:

- **Object Layer (`ol`)** — import, generate, and manage game item definitions and sprite atlases.
- **Instance (`instance`)** — export/import/seed game instance data (maps, entities, configs).
- **Chain (`chain`)** — Hyperledger Besu deployment and ERC-1155 ObjectLayerToken lifecycle.
- **Run-Workflow (`run-workflow`)** — execute named operational scripts (seed defaults, build manifests).

---

## Global Usage

```bash
node bin/cyberia.js <command> [subcommand] [options]
# or if installed globally:
cyberia <command> [subcommand] [options]
```

---

## `cyberia ol` — Object Layer Management

Manages the Object Layer content pipeline: import PNG assets, generate procedural layers, build atlas sprite sheets, and push to IPFS/MongoDB.

```bash
cyberia ol [item-id] [options]
```

### Options

| Option                          | Description                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `--import`                      | Import specific item-id(s) (comma-separated) from the PNG asset directory into MongoDB + IPFS |
| `--import-types [types]`        | Batch import by type (e.g. `skin,floor`) or `all`                                             |
| `--generate`                    | Generate procedural layers for a semantic item-id (see Semantic Registry below)               |
| `--count <n>`                   | Shape element count multiplier for `--generate` (default: `3`)                                |
| `--seed <seed>`                 | Deterministic seed string for `--generate` (e.g. `fx-42`)                                     |
| `--frame-index <n>`             | Starting frame index for `--generate` (default: `0`)                                          |
| `--frame-count <n>`             | Number of frames to generate for `--generate` (default: `1`)                                  |
| `--density <0..1>`              | Shape density factor for `--generate` (default: `0.5`)                                        |
| `--to-atlas-sprite-sheet [dim]` | Convert ObjectLayer frames to a consolidated atlas PNG                                        |
| `--show-atlas-sprite-sheet`     | Display the atlas PNG for the given item-id                                                   |
| `--show-frame [dir_frame]`      | View a single frame (e.g. `08_0`; default: `08_0`)                                            |
| `--drop`                        | Drop existing data before importing                                                           |
| `--client-public`               | With `--drop`: also remove static client asset folders                                        |
| `--git-clean`                   | With `--drop`: run clean on the cyberia asset directory                                       |
| `--dev`                         | Force development env (uses `.env.development` for localhost IPFS)                            |
| `--env-path <path>`             | Path to `.env` file (e.g. `./engine-private/conf/dd-cyberia/.env.development`)                |
| `--mongo-host <host>`           | MongoDB host override                                                                         |
| `--storage-file-path <path>`    | Storage filter JSON path override                                                             |

### Examples

```bash
# Import a single item from PNG source
cyberia ol hatchet --import --env-path ./engine-private/conf/dd-cyberia/.env.development

# Import all items of type 'skin' and 'floor'
cyberia ol --import-types skin,floor

# Import all types
cyberia ol --import-types all

# Generate a procedural floor tile (desert biome, seed fx-42)
cyberia ol floor-desert --generate --seed fx-42

# Generate 4 frames of a procedural floor with custom count and density
cyberia ol floor-grass --generate --frame-count 4 --count 5 --density 0.7

# Generate a character skin
cyberia ol skin-dark-001 --generate --seed my-seed

# View a specific frame of an item
cyberia ol hatchet --show-frame 08_0

# Rebuild atlas sprite sheet for an item
cyberia ol hatchet --to-atlas-sprite-sheet

# Drop and re-import a single item
cyberia ol hatchet --drop --import
```

---

## Semantic Item-ID Registry

The `--generate` flag uses item-id prefixes to look up a procedural descriptor from the semantic registry.

### Floor Prefixes

| Prefix         | Biome  | Description                                     |
| -------------- | ------ | ----------------------------------------------- |
| `floor-desert` | Desert | Sandy, arid tile with warm yellow/brown palette |
| `floor-grass`  | Grass  | Meadow tile with green/earth tones              |
| `floor-water`  | Water  | Ocean/lake tile with blue/teal palette          |
| `floor-stone`  | Stone  | Rock/cobble tile with grey palette              |
| `floor-lava`   | Lava   | Magma tile with red/orange palette              |

### Skin Prefixes

| Prefix         | Description                                     |
| -------------- | ----------------------------------------------- |
| `skin-random`  | Fully random skin tone and hair                 |
| `skin-dark`    | Dark skin tones                                 |
| `skin-light`   | Light / pale skin tones                         |
| `skin-vivid`   | Vivid / exotic hair colours (blue, red, green…) |
| `skin-natural` | Natural hair colours (brown, blond, grey…)      |
| `skin-shaved`  | Shaved / bald head — no hair                    |

### Resource Prefixes

Resource prefixes follow the pattern `resource-{biome}-{shape}`:

| Shape Family | Description                            |
| ------------ | -------------------------------------- |
| `petal`      | Parabolic arc shapes — coloured petals |
| `stone`      | Hard, angular mineral shapes           |
| `polygon`    | Crystal/geometric faceted shapes       |
| `thread`     | Thin, wispy Bézier lines               |

**Biomes:** `desert`, `grass`, `water`, `stone`, `lava`

**Full matrix (20 prefixes):**

```
resource-desert-petal    resource-grass-petal    resource-water-petal
resource-desert-stone    resource-grass-stone    resource-water-stone
resource-desert-polygon  resource-grass-polygon  resource-water-polygon
resource-desert-thread   resource-grass-thread   resource-water-thread

resource-stone-petal     resource-lava-petal
resource-stone-stone     resource-lava-stone
resource-stone-polygon   resource-lava-polygon
resource-stone-thread    resource-lava-thread
```

---

## `cyberia instance` — Instance Management

Manages game instance documents (maps, entities, actions, quests, skill config) in MongoDB.

```bash
cyberia instance [instance-code] [options]
```

### Options

| Option                | Description                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--export [path]`     | Export instance and all related documents to a backup directory                                                   |
| `--import [path]`     | Import instance documents from a backup directory (upsert, preserves UUIDs)                                       |
| `--conf`              | With `--export`/`--import`: only process instance and instance-conf documents (skip maps, entities, ObjectLayers) |
| `--drop`              | Drop all documents associated with the instance code                                                              |
| `--env-path <path>`   | Path to `.env` file                                                                                               |
| `--mongo-host <host>` | MongoDB host override                                                                                             |
| `--dev`               | Force development environment                                                                                     |

### Examples

```bash
# Export instance to backup
cyberia instance cyberia-main --export ./backups/cyberia-main

# Import instance from backup
cyberia instance cyberia-main --import ./backups/cyberia-main

# Drop instance data
cyberia instance cyberia-main --drop
```

---

## `cyberia chain` — Blockchain Lifecycle

Full lifecycle management for the Hyperledger Besu network and `ObjectLayerToken` ERC-1155 contract.

### Network Commands

#### `cyberia chain deploy`

Deploy a new Hyperledger Besu IBFT2 network to Kubernetes:

```bash
cyberia chain deploy [options]
```

| Option                   | Default                    | Description                               |
| ------------------------ | -------------------------- | ----------------------------------------- |
| `--validators <n>`       | `4`                        | Number of IBFT2 validators                |
| `--chain-id <id>`        | `777771`                   | EVM chain ID                              |
| `--block-period <s>`     | `5`                        | IBFT2 block period in seconds             |
| `--epoch-length <n>`     | `30000`                    | IBFT2 epoch length                        |
| `--besu-image <img>`     | `hyperledger/besu:24.12.1` | Besu container image                      |
| `--node-port-rpc <port>` | `30545`                    | Kubernetes NodePort for JSON-RPC          |
| `--node-port-ws <port>`  | `30546`                    | Kubernetes NodePort for WebSocket         |
| `--namespace <ns>`       | `besu`                     | Kubernetes namespace                      |
| `--pull-image`           | —                          | Pull Besu images before deploying         |
| `--skip-generate`        | —                          | Use existing `manifests/besu/` as-is      |
| `--skip-wait`            | —                          | Skip waiting for validators to be Running |

#### `cyberia chain remove`

Remove the Besu network from Kubernetes:

```bash
cyberia chain remove [--namespace besu] [--clean-keys] [--clean-manifests]
```

#### `cyberia chain generate-manifests`

Generate Kubernetes manifests without deploying:

```bash
cyberia chain generate-manifests [options]  # same options as deploy
```

---

### Contract Commands

#### `cyberia chain compile`

Compile the Solidity contracts:

```bash
cyberia chain compile
```

#### `cyberia chain deploy-contract`

Deploy `ObjectLayerToken` to a Besu network (mints 10M CKY to the coinbase address):

```bash
cyberia chain deploy-contract --network besu-k8s
```

| Option             | Default    | Description                                                  |
| ------------------ | ---------- | ------------------------------------------------------------ |
| `--network <name>` | `besu-k8s` | Hardhat network name (`besu-ibft2`, `besu-qbft`, `besu-k8s`) |

#### `cyberia chain test`

Run the Hardhat contract test suite:

```bash
cyberia chain test
```

---

### Key Management

#### `cyberia chain key-gen`

Generate a new secp256k1 Ethereum key pair for the coinbase deployer account:

```bash
cyberia chain key-gen
# Output: address + private key + key file written to engine-private/
```

#### `cyberia chain set-coinbase`

Set the active coinbase key used for contract deployment and minting:

```bash
cyberia chain set-coinbase --private-key 0xYOUR_KEY
cyberia chain set-coinbase --from-file ./engine-private/eth-networks/besu/<address>.key.json
```

---

### Token Commands

#### `cyberia chain register`

Register a single Object Layer item on-chain:

```bash
cyberia chain register <item-id> [options]
```

| Option                 | Default    | Description                                           |
| ---------------------- | ---------- | ----------------------------------------------------- |
| `--from-db`            | —          | Resolve canonical IPFS CID from MongoDB (recommended) |
| `--metadata-cid <cid>` | `""`       | Manual CID override (ignored when `--from-db` is set) |
| `--supply <n>`         | `1`        | Initial token supply (1 = NFT, >1 = semi-fungible)    |
| `--network <name>`     | `besu-k8s` | Hardhat network name                                  |
| `--env-path <path>`    | `./.env`   | Path to `.env` file                                   |
| `--mongo-host <host>`  | —          | MongoDB host override                                 |

```bash
# Register unique NFT item (non-fungible)
cyberia chain register legendary-hatchet --from-db --supply 1

# Register stackable resource (semi-fungible)
cyberia chain register gold-ore --from-db --supply 1000000
```

#### `cyberia chain batch-register`

Register multiple items in a single batch transaction:

```bash
cyberia chain batch-register --from-db --items '[{"itemId":"wood","supply":500000},{"itemId":"stone","supply":500000}]'
```

#### `cyberia chain mint`

Mint additional tokens for an existing token ID:

```bash
cyberia chain mint --token-id 0 --to 0xABCD...1234 --amount 1000000000000000000000
cyberia chain mint --token-id <tokenId> --to <address> --amount <uint256>
```

#### `cyberia chain balance`

Query the token balance of an address:

```bash
cyberia chain balance --address 0xABCD...1234 --token-id 0
```

#### `cyberia chain transfer`

Transfer tokens between addresses:

```bash
cyberia chain transfer --from 0x... --to 0x... --token-id 0 --amount 1000
```

#### `cyberia chain burn`

Burn tokens from an address:

```bash
cyberia chain burn --token-id 0 --amount 500 --address 0x...
```

#### `cyberia chain status`

Query chain and contract status:

```bash
cyberia chain status [--network besu-k8s]
# Outputs: chain ID, block number, CKY total supply, deployer address, pause state
```

#### `cyberia chain pause` / `cyberia chain unpause`

Emergency transfer freeze / resume (owner only):

```bash
cyberia chain pause   [--network besu-k8s]
cyberia chain unpause [--network besu-k8s]
```

---

## `cyberia run-workflow` — Operational Scripts

Pre-built operational workflows for seeding and maintenance:

| Subcommand                   | Description                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `import-default-items`       | Import the canonical default item set (`DefaultCyberiaItems`) into MongoDB + IPFS, then seed skill config and dialogues            |
| `seed-skill-config`          | Upsert `DefaultSkillConfig` into `CyberiaInstanceConf` for the target instance                                                     |
| `seed-dialogues`             | Upsert `DefaultCyberiaDialogues` (NPC dialogue lines) into the `cyberia-dialogue` collection                                       |
| `generate-semantic-examples` | Generate procedural examples for skin prefixes (`skin-*`); floor and resource generation is available but commented out by default |
| `build-manifest`             | Build Kubernetes Deployment + Service YAML manifests for mmo-client and mmo-server instances (kubeadm + kind variants)             |

```bash
cyberia run-workflow import-default-items --env-path ./engine-private/conf/dd-cyberia/.env.development
cyberia run-workflow seed-skill-config --env-path ./engine-private/conf/dd-cyberia/.env.development
cyberia run-workflow build-manifest
```

---

## Environment Variables

The CLI respects the following environment variables (typically loaded from an `--env-path` file):

| Variable              | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `DEFAULT_DEPLOY_ID`   | Engine deployment ID — resolves to `engine-private/conf/{id}/`   |
| `DEFAULT_DEPLOY_HOST` | Deploy host (used to index the conf object)                      |
| `DEFAULT_DEPLOY_PATH` | Deploy path (used to index the conf object)                      |
| `MONGODB_URI`         | MongoDB connection string (loaded from conf if not set directly) |
| `IPFS_API_URL`        | IPFS API URL for pinning (e.g. `http://localhost:5001`)          |
