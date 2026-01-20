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
- Saves processed objects to the `ObjectLayer` model with top-level references to `ObjectLayerRenderFrames`.
- Creates separate `ObjectLayerRenderFrames` documents for render data.
- Links ObjectLayers to AtlasSpriteSheet documents via top-level `atlasSpriteSheetId`.
- Generates unique UUID v4 seeds (via `crypto.randomUUID()`) for SHA256 hash uniqueness.
- Generates SHA256 hash using `fast-json-stable-stringify` for deterministic serialization.
- Reconstructs PNG frames from stored tile data for debugging.

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

### Process and import object-layer assets

This will iterate asset folders for the given types and store processed objects in MongoDB.

```bash
# Process specific types (comma-separated)
cyberia ol --import skin,floor

# Process all recognized types
cyberia ol --import all
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
cyberia ol --import skin

# 2. Verify a specific frame was imported correctly
cyberia ol anon --show-frame 08_0

# 3. Generate optimized atlas sprite sheet
cyberia ol anon --to-atlas-sprite-sheet

# 4. View the generated atlas
cyberia ol anon --show-atlas-sprite-sheet
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
cyberia ol --import skin,floor,weapon

# Process individual items
cyberia ol sword --show-frame 08_0
cyberia ol sword --to-atlas-sprite-sheet
cyberia ol shield --show-frame 08_0
cyberia ol shield --to-atlas-sprite-sheet
```
