<p align="center">
  <img src="https://www.cyberiaonline.com/assets/splash/apple-touch-icon-precomposed.png" alt="CYBERIA Network Object Layer Engine CLI"/>
</p>

<div align="center">

<h1>cyberia</h1>

<h2>Network Object Layer Engine CLI</h2>

[![Downloads](https://img.shields.io/npm/dm/cyberia.svg)](https://www.npmjs.com/package/cyberia) [![Version](https://img.shields.io/npm/v/cyberia.svg)](https://www.npmjs.org/package/cyberia)

</div>

This Command Line Interface (CLI) is a core tool for the **Cyberia Network Object Layer Engine**, specifically designed for processing, generating, and managing game assets, primarily **Object Layer** elements like skins, floors, and weapons.

It handles image asset quantization, generates data matrices and color palettes, creates separate render frame documents, and persists the resulting structured data into the game's database with top-level references to render frames and atlas sprite sheets.

## What this tool does

The CLI scans the local asset folders (`./src/client/public/cyberia/assets/{type}/{id}/{direction}/{frame}`), quantizes images to a tile matrix and color palette, creates separate ObjectLayerRenderFrames documents, and persists the resulting object-layer documents with references to your configured MongoDB. It also supports reconstructing a visual PNG from the stored matrix for inspection.

Key features:

- Walks the asset directory structure and processes PNG/GIF files.
- Produces `frame_matrix` and `map_color` arrays from images.
- **Procedurally generates object layers** from semantic item-id descriptors with deterministic seeds and temporal coherence.
- Saves processed objects to the `ObjectLayer` model with top-level references to `ObjectLayerRenderFrames`.
- Creates separate `ObjectLayerRenderFrames` documents for render data.
- Links ObjectLayers to AtlasSpriteSheet documents via top-level `atlasSpriteSheetId`.
- Generates unique UUID v4 seeds (via `crypto.randomUUID()`) for SHA256 hash uniqueness.
- Generates SHA256 hash using `fast-json-stable-stringify` for deterministic serialization.
- Reconstructs PNG frames from stored tile data for debugging.
- Writes static asset PNGs, atlas sprite sheets, and metadata to the conventional directory structure.
- **Drop and cleanup** — removes ObjectLayer, RenderFrames, AtlasSpriteSheet, File documents and unpins IPFS CIDs. Supports targeted drop (specific items) or full drop.
- **Static asset cleanup** — optionally removes client-side static asset folders and runs git-clean on the asset directory.
- **IPFS integration** — pins CIDs to IPFS Cluster and Kubo, manages MFS paths, and unpins on drop.
- **Blockchain integration** — deploys Besu IBFT2 networks, manages ERC-1155 tokens (register, mint, transfer, burn), and resolves canonical CIDs from MongoDB for on-chain registration.
- **Cut-over consistency** — stages all IPFS operations, file creation, and atlas generation in-memory before atomically updating live MongoDB documents.

## Getting Started

### Prerequisites

You must have the following installed in your environment:

- **Node.js** (v24.10.0 recommended)
- **npm** or **yarn**
- **MongoDB** (or access to the configured MongoDB instance)

### **Installation**

```bash

npm install -g cyberia
```

### **Environment Setup**

Ensure your required environment variables (e.g., `DEFAULT_DEPLOY_ID`, `DEFAULT_DEPLOY_HOST`, `DEFAULT_DEPLOY_PATH`) are correctly configured, typically in a .env file, to point the CLI to the correct database instance defined in conf.server.json.

## Usage

The CLI is executed from the project root via the `cyberia.js` script.

### Import specific items with `--import`

Import one or more object layers by item-id. The CLI searches all asset type directories for matching items.

```bash
# Import a single item
cyberia ol hatchet --import

# Import multiple items (comma-separated)
cyberia ol hatchet,sword,shield --import
```

### Batch import by type with `--import-types`

Iterate asset folders for the given types and store processed objects in MongoDB.

```bash
# Process specific types (comma-separated)
cyberia ol --import-types skin,floor

# Process all recognized types (skips items that already exist in the database)
cyberia ol --import-types all
```

### Procedural generation with `--generate`

Produces semantically consistent object layers with controlled, reproducible variation and short-term temporal coherence (consecutive frames stay visually consistent). Uses the parametric shape generator and object layer engine under the hood.

```bash
# Generate a desert floor tile (single frame, auto seed)
cyberia ol floor-desert --generate

# Full control: 3 frames, explicit seed, density
cyberia ol floor-desert --generate --count 3 --seed fx-42 --frame-index 0 --frame-count 3 --density 0.5

# Grass terrain, sparse, 5 frames
cyberia ol floor-grass --generate --seed meadow-7 --frame-count 5 --density 0.3

# Water surface, dense, high element count
cyberia ol floor-water --generate --seed ocean-1 --count 5 --density 0.8 --frame-count 4

# Stone cobblestone
cyberia ol floor-stone --generate --seed cobble-99 --count 4 --density 0.6

# Lava flow, 3-frame animation
cyberia ol floor-lava --generate --seed magma-3 --frame-count 3 --density 0.7
```

**`--generate` options:**

| Option              | Default   | Description                                         |
| ------------------- | --------- | --------------------------------------------------- |
| `--seed <str>`      | auto UUID | Deterministic seed string. Same seed → same output. |
| `--count <n>`       | `3`       | Shape element count multiplier per layer.           |
| `--frame-index <n>` | `0`       | Starting frame index.                               |
| `--frame-count <n>` | `1`       | Number of consecutive frames to generate.           |
| `--density <f>`     | `0.5`     | Overall density factor (`0`–`1`). Lower = sparser.  |

**Available semantic item-id prefixes:**

| Prefix         | Type  | Tags                 | Palette                    |
| -------------- | ----- | -------------------- | -------------------------- |
| `floor-desert` | floor | sand, dune, arid     | warm ochres, sand tones    |
| `floor-grass`  | floor | grass, meadow, earth | greens, earth browns       |
| `floor-water`  | floor | water, ocean, wave   | blues, foam whites         |
| `floor-stone`  | floor | stone, rock, cobble  | greys, warm/cool stone     |
| `floor-lava`   | floor | lava, magma, fire    | reds, oranges, dark crust  |
| `skin-*`       | skin  | character, body      | skin tones, clothing darks |

#### How generation works

Each item-id maps to a **semantic descriptor** that provides `semanticTags`, `paletteHints`, `preferredShapes`, and named **layer specs** (e.g. `base`, `dunes`, `rocks`, `tufts` for `floor-desert`).

**Seed derivation** — deterministic at every level:

```
layerSeed  = hash(seed + ':' + itemId + ':' + layerKey)
frameSeed  = hash(layerSeed + ':' + frameIndex)
```

**Temporal coherence** — shape topology (which shapes, how many, where) is locked to `layerSeed` and never changes between frames. Only smooth, low-frequency noise perturbations (position jitter, slight rotation/scale wobble) are derived from `frameSeed`, so frame N and N+1 differ by ~2% of cells.

**Layer naming** — every generated layer gets an id: `<itemId>-<layerKey>` (e.g. `floor-desert-dunes`).

**Generation pipeline per layer:**

1. Pick generator type (`noise-field` for base fills, `shape` for element placement).
2. Select palette colors deterministically from `paletteHints` with per-element `colorShift`.
3. For shape layers: pick shape via weighted `preferredShapes`, compute stable base transform `(x, y, scale, rotation)`, apply frame-level smooth noise.
4. Stamp shapes onto a 24×24 grid via `intCoords` rasterization from the parametric shape generator.
5. Composite all layers into a final `frame_matrix` + unified `colors` palette.

**Variability factors per layer:**
`scaleVariance`, `rotationVariance`, `colorShift`, `jitter`, `noiseLevel`, `detailLevel`, `sparsity` — small, deterministic variations that keep each generation unique but semantically coherent.

#### What `--generate` persists

The full pipeline runs automatically:

1. **Static assets** — PNGs written to `./src/client/public/cyberia/assets/{type}/{itemId}/{dirCode}/{frame}.png` + `metadata.json`.
2. **MongoDB** — `ObjectLayerRenderFrames` + `ObjectLayer` documents created with SHA-256 hash.
3. **Atlas sprite sheet** — generated, saved to `File` + `AtlasSpriteSheet` collections, and linked via `atlasSpriteSheetId`.

#### Reproducibility example

Running the same command twice produces byte-identical output:

```bash
# Run 1
cyberia ol floor-desert --generate --seed fx-42 --count 3 --frame-count 2

# Run 2 (identical output)
cyberia ol floor-desert --generate --seed fx-42 --count 3 --frame-count 2
```

Different seeds produce different but semantically consistent results:

```bash
cyberia ol floor-desert --generate --seed fx-42   # variant A
cyberia ol floor-desert --generate --seed fx-99   # variant B (same style, different arrangement)
```

### Drop and cleanup with `--drop`

Removes object layer data from MongoDB and IPFS. Supports both targeted (specific items) and full drop.

```bash
# Drop specific items by item-id
cyberia ol anon,skin --drop

# Drop all object layers before re-importing
cyberia ol --drop --import-types all
```

**What `--drop` removes per item:**

- `ObjectLayer` document
- `ObjectLayerRenderFrames` document
- `AtlasSpriteSheet` document
- Associated `File` documents
- IPFS CID pins (objectLayer.cid, render.cid, render.metadataCid, AtlasSpriteSheet.cid) from both IPFS Cluster and Kubo
- MFS paths (`/object-layer/{itemKey}`)

**`--drop` companion flags:**

| Flag              | Description                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--client-public` | Also remove static asset folders: `./src/client/public/cyberia/assets/{type}/{itemId}/` and `./public/{host}{path}/assets/{type}/{itemId}/` |
| `--git-clean`     | Run `underpost run clean .` on the `src/client/public/cyberia` directory to remove untracked files                                          |

```bash
# Drop items and remove their static asset folders
cyberia ol anon --drop --client-public

# Full rebuild: drop everything, clean assets, re-import all
cyberia ol --drop --git-clean --import-types all
```

### Environment and database flags

These flags apply to both `ol` and `chain` commands where database or environment access is needed.

| Flag                         | Default  | Description                                                                   |
| ---------------------------- | -------- | ----------------------------------------------------------------------------- |
| `--env-path <path>`          | `./.env` | Path to .env file (e.g., `./engine-private/conf/dd-cyberia/.env.development`) |
| `--mongo-host <host>`        | —        | MongoDB host override                                                         |
| `--storage-file-path <path>` | —        | Storage file path override (JSON filter for selective import)                 |
| `--dev`                      | `false`  | Force development environment (loads `.env.development` for IPFS localhost)   |

```bash
# Import using a specific environment
cyberia ol --import-types all --env-path ./engine-private/conf/dd-cyberia/.env.development

# Use development IPFS localhost
cyberia ol anon --import --dev

# Override MongoDB host
cyberia ol --import-types skin --mongo-host mongodb://localhost:27017
```

## Visualize a processed frame

Reconstructs and opens a PNG from the database-stored frame data. Requires item-id as the first positional argument, followed by direction and frame index in the format `[direction]_[frameIndex]`.

```bash
# Show frame with default direction and frame (08_0)
cyberia ol anon --show-frame

# Show specific direction and frame
cyberia ol anon --show-frame 08_0

# Show different directions
cyberia ol anon --show-frame 02_0  # up_idle
cyberia ol anon --show-frame 04_1  # left_idle (second frame)
```

**Valid direction codes:**

- `08`: down_idle, none_idle, default_idle
- `18`: down_walking
- `02`: up_idle
- `12`: up_walking
- `04`: left_idle, up_left_idle, down_left_idle
- `14`: left_walking, up_left_walking, down_left_walking
- `06`: right_idle, up_right_idle, down_right_idle
- `16`: right_walking, up_right_walking, down_right_walking

This command:

- Finds the ObjectLayer by item-id
- Loads the associated ObjectLayerRenderFrames document
- Reconstructs the PNG from the stored `frame_matrix` and `map_color`
- Saves it temporarily to disk as `{item-id}_{direction}_{frame}.png`
- Opens it with Firefox for visual inspection

### Generate Atlas Sprite Sheet

Consolidates all frames (8 directions, multiple modes) from an object layer's render frames into a single optimized PNG atlas with metadata.

```bash
# Generate atlas sprite sheet with auto-calculated dimensions (recommended)
cyberia ol anon --to-atlas-sprite-sheet

# Generate atlas with custom dimensions (manual override)
cyberia ol anon --to-atlas-sprite-sheet 4096


```

This command:

- Finds the ObjectLayer by item-id or MongoDB `_id`
- Loads the associated ObjectLayerRenderFrames document
- **Auto-calculates optimal atlas dimensions** based on total frame count (8 directions × all animation modes)
- Generates a consolidated PNG with all animation frames properly arranged
- Stores the PNG in the File collection
- Creates/updates an AtlasSpriteSheet document with frame positions
- Updates the ObjectLayer with top-level `atlasSpriteSheetId` reference
- Uses power-of-2 dimensions for GPU efficiency

**Atlas Dimension Calculation:**

- **Auto (default)**: Dynamically calculates optimal size based on:
  - Total number of frames across all directions and modes
  - Individual frame dimensions
  - Grid layout to minimize wasted space
  - Power-of-2 optimization (1024, 2048, 4096, etc.)
- **Manual override**: Specify exact dimension (e.g., `--to-atlas-sprite-sheet 4096`)

**Common Atlas Sizes:**

- **1024x1024**: ~6-10 frames
- **2048x2048**: ~20-40 frames (typical for character sprites)
- **4096x4096**: ~80-160 frames (complex animations)
- **8192x8192**: Maximum, for extreme cases

The tool automatically warns if frames exceed the specified dimension and suggests a larger size.

### View Atlas Sprite Sheet

Opens the consolidated atlas sprite sheet PNG for inspection.

```bash
# Show atlas sprite sheet by item-id
cyberia ol anon --show-atlas-sprite-sheet

```

This command:

- Finds the ObjectLayer by item-id
- Retrieves the associated AtlasSpriteSheet via top-level `atlasSpriteSheetId` or by matching `metadata.itemKey`
- Saves it temporarily to disk
- Opens it with Firefox for visual inspection
- Displays atlas dimensions in the console

## Common Workflows

### Complete Asset Processing Pipeline

Process assets from source files through to atlas generation:

```bash
# 1. Import object layers from asset directories
cyberia ol --import-types skin

# 2. Verify a specific frame was imported correctly
cyberia ol anon --show-frame 08_0

# 3. Generate optimized atlas sprite sheet
cyberia ol anon --to-atlas-sprite-sheet

# 4. View the generated atlas
cyberia ol anon --show-atlas-sprite-sheet
```

### Procedural Generation Pipeline

Generate an object layer entirely from a semantic descriptor — no source PNGs needed:

```bash
# 1. Generate a 3-frame desert floor with explicit seed
cyberia ol floor-desert --generate --seed fx-42 --frame-count 3 --density 0.5

# 2. Inspect the generated frame
cyberia ol floor-desert --show-frame 08_0

# 3. View the auto-generated atlas
cyberia ol floor-desert --show-atlas-sprite-sheet
```

### Batch Procedural Generation

Generate a full tileset family with consistent seeds:

```bash
cyberia ol floor-desert --generate --seed world-1 --frame-count 3
cyberia ol floor-grass  --generate --seed world-1 --frame-count 3
cyberia ol floor-water  --generate --seed world-1 --frame-count 4
cyberia ol floor-stone  --generate --seed world-1 --frame-count 2
cyberia ol floor-lava   --generate --seed world-1 --frame-count 3
```

### Exploring Seed Variations

```bash
# Same item, different seeds — compare visual output
cyberia ol floor-desert --generate --seed alpha  --frame-count 1
cyberia ol floor-desert --generate --seed beta   --frame-count 1
cyberia ol floor-desert --generate --seed gamma  --frame-count 1

# Inspect each
cyberia ol floor-desert --show-frame 08_0
```

### Debugging Asset Issues

```bash
# Check if frame data is correct for all directions
cyberia ol anon --show-frame 08_0  # down_idle
cyberia ol anon --show-frame 02_0  # up_idle
cyberia ol anon --show-frame 04_0  # left_idle
cyberia ol anon --show-frame 06_0  # right_idle

# Verify walking animations
cyberia ol anon --show-frame 18_0  # down_walking
cyberia ol anon --show-frame 12_0  # up_walking
cyberia ol anon --show-frame 14_0  # left_walking
cyberia ol anon --show-frame 16_0  # right_walking
```

### Working with Multiple Items

```bash
# Import multiple types at once
cyberia ol --import-types skin,floor,weapon

# Process individual items
cyberia ol sword --show-frame 08_0
cyberia ol sword --to-atlas-sprite-sheet
cyberia ol shield --show-frame 08_0
cyberia ol shield --to-atlas-sprite-sheet
```

### Full Rebuild with Cleanup

Drop all data, clean static assets, and re-import everything:

```bash
# 1. Drop all object layers with IPFS cleanup and static asset removal
cyberia ol --drop --client-public --git-clean

# 2. Re-import all asset types
cyberia ol --import-types all

# 3. Verify
cyberia ol anon --show-frame 08_0
```

### Targeted Drop and Re-import

Drop and re-import specific items without affecting others:

```bash
# 1. Drop specific items and their static folders
cyberia ol anon,skin --drop --client-public

# 2. Re-import only those items
cyberia ol anon,skin --import

# 3. Regenerate atlas for each
cyberia ol anon --to-atlas-sprite-sheet
cyberia ol skin --to-atlas-sprite-sheet
```

## Blockchain Operations (`chain`)

The `chain` command group manages Hyperledger Besu IBFT2 network deployment and ERC-1155 token operations for on-chain object layer registration.

### Deploy Besu IBFT2 Network

Deploys a private Besu IBFT2 network to Kubernetes.

```bash
# Deploy with defaults (4 validators, chain-id 777771)
cyberia chain deploy

# Custom configuration
cyberia chain deploy --validators 6 --chain-id 888881 --block-period 3

# Pull container images first
cyberia chain deploy --pull-image
```

**`deploy` options:**

| Option                      | Default                    | Description                                        |
| --------------------------- | -------------------------- | -------------------------------------------------- |
| `--validators <count>`      | `4`                        | Number of IBFT2 validators                         |
| `--chain-id <id>`           | `777771`                   | Chain ID for the network                           |
| `--block-period <seconds>`  | `5`                        | IBFT2 block period in seconds                      |
| `--epoch-length <length>`   | `30000`                    | IBFT2 epoch length                                 |
| `--coinbase-address <addr>` | auto-detect                | Coinbase deployer address                          |
| `--besu-image <image>`      | `hyperledger/besu:24.12.1` | Besu container image                               |
| `--curl-image <image>`      | `curlimages/curl:8.11.1`   | Curl init container image                          |
| `--node-port-rpc <port>`    | `30545`                    | NodePort for external JSON-RPC access              |
| `--node-port-ws <port>`     | `30546`                    | NodePort for external WebSocket access             |
| `--namespace <ns>`          | `besu`                     | Kubernetes namespace for Besu resources            |
| `--pull-image`              | `false`                    | Pull Besu container images before deployment       |
| `--skip-generate`           | `false`                    | Skip manifest generation, use existing manifests   |
| `--skip-wait`               | `false`                    | Skip waiting for validators to reach Running state |

### Remove Besu Network

```bash
# Remove network (keep keys and manifests)
cyberia chain remove

# Full cleanup
cyberia chain remove --clean-keys --clean-manifests
```

| Option              | Default | Description                                         |
| ------------------- | ------- | --------------------------------------------------- |
| `--namespace <ns>`  | `besu`  | Kubernetes namespace for Besu resources             |
| `--clean-keys`      | `false` | Also remove generated validator keys                |
| `--clean-manifests` | `false` | Also remove the generated manifests/besu/ directory |

### Generate Manifests Without Deploying

```bash
cyberia chain generate-manifests --validators 6 --output-dir ./manifests/besu
```

Accepts the same options as `deploy` plus `--output-dir <dir>` (default: `./manifests/besu`).

### Deploy ERC-1155 Contract

```bash
cyberia chain deploy-contract
cyberia chain deploy-contract --network besu-k8s
```

### Compile and Test Contracts

```bash
cyberia chain compile
cyberia chain test
```

### Register Object Layer Item On-Chain

Registers an object layer as an ERC-1155 token with its canonical CID.

```bash
# Register with CID resolved from MongoDB (recommended)
cyberia chain register --item-id hatchet --from-db

# Register with explicit CID
cyberia chain register --item-id hatchet --metadata-cid bafk...

# Semi-fungible with supply
cyberia chain register --item-id wood --from-db --supply 500000
```

| Option                 | Default    | Required | Description                                             |
| ---------------------- | ---------- | -------- | ------------------------------------------------------- |
| `--item-id <itemId>`   | —          | yes      | Human-readable item identifier                          |
| `--metadata-cid <cid>` | —          | —        | IPFS metadata CID (ignored when `--from-db` is set)     |
| `--from-db`            | `false`    | —        | Resolve canonical CID from MongoDB ObjectLayer document |
| `--supply <supply>`    | `1`        | —        | Initial token supply (1 = NFT, >1 = semi-fungible)      |
| `--network <network>`  | `besu-k8s` | —        | Hardhat network name                                    |
| `--env-path <path>`    | `./.env`   | —        | Path to .env file                                       |
| `--mongo-host <host>`  | —          | —        | MongoDB host override                                   |

### Batch Register Multiple Items

```bash
# Batch register with CIDs from MongoDB
cyberia chain batch-register --from-db --items '[{"itemId":"wood","supply":500000},{"itemId":"hatchet","supply":1}]'

# Batch register with explicit CIDs
cyberia chain batch-register --items '[{"itemId":"wood","cid":"bafk...","supply":500000}]'
```

### Mint, Transfer, and Burn Tokens

```bash
# Mint additional tokens
cyberia chain mint --token-id 1 --to 0xAddress --amount 100

# Transfer tokens
cyberia chain transfer --from 0xSender --to 0xRecipient --token-id 1 --amount 50

# Burn tokens
cyberia chain burn --address 0xHolder --token-id 1 --amount 10
```

### Query Status and Balances

```bash
# Full network and contract status
cyberia chain status

# Query token balance
cyberia chain balance --address 0xAddress --token-id 0
```

### Key Management

```bash
# Generate a new Ethereum key pair
cyberia chain key-gen

# Generate and persist keys
cyberia chain key-gen --save

# Set coinbase deployer key
cyberia chain set-coinbase --from-file ./engine-private/eth-networks/besu/0xAddr.key.json
cyberia chain set-coinbase --private-key 0xHexKey
```

### Pause / Unpause Token Transfers (Emergency)

```bash
cyberia chain pause
cyberia chain unpause
```

## Workflow Import (`run-workflow`)

### Import Default Items

Imports default Object Layer items from a JSON configuration file into MongoDB.

```bash
cyberia run-workflow import-default-items

# Use development environment
cyberia run-workflow import-default-items --dev
```

## Complete `ol` Command Reference

| Flag                            | Type    | Default     | Description                                                |
| ------------------------------- | ------- | ----------- | ---------------------------------------------------------- |
| `--import`                      | boolean | `false`     | Import specific item(s) passed as comma-separated argument |
| `--import-types [type]`         | string  | —           | Batch import by type: `skin`, `floors`, or `all`           |
| `--show-frame [dir_frame]`      | string  | `08_0`      | View object layer frame (direction_frameIndex)             |
| `--to-atlas-sprite-sheet [dim]` | number  | auto        | Generate atlas sprite sheet, optionally specify dimension  |
| `--show-atlas-sprite-sheet`     | boolean | `false`     | Display the atlas sprite sheet PNG for an item             |
| `--generate`                    | boolean | `false`     | Generate procedural object layers from semantic item-id    |
| `--seed <str>`                  | string  | random UUID | Deterministic seed for `--generate`                        |
| `--count <n>`                   | number  | `3`         | Shape element count multiplier for `--generate`            |
| `--frame-index <n>`             | number  | `0`         | Starting frame index for `--generate`                      |
| `--frame-count <n>`             | number  | `1`         | Number of frames for `--generate`                          |
| `--density <f>`                 | number  | `0.5`       | Density factor (0–1) for `--generate`                      |
| `--drop`                        | boolean | `false`     | Drop existing data (targeted or full)                      |
| `--client-public`               | boolean | `false`     | With `--drop`, remove static asset folders                 |
| `--git-clean`                   | boolean | `false`     | With `--drop`, run underpost clean on cyberia assets       |
| `--dev`                         | boolean | `false`     | Force development environment                              |
| `--env-path <path>`             | string  | `./.env`    | Path to .env file                                          |
| `--mongo-host <host>`           | string  | —           | MongoDB host override                                      |
| `--storage-file-path <path>`    | string  | —           | Storage file path override                                 |
