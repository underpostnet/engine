<p align="center">
  <img src="https://www.cyberiaonline.com/assets/splash/apple-touch-icon-precomposed.png" alt="CYBERIA Network Object Layer Engine CLI"/>
</p>

<div align="center">

<h1>cyberia</h1>

<h2>Network Object Layer Engine CLI</h2>

[![Downloads](https://img.shields.io/npm/dm/cyberia.svg)](https://www.npmjs.com/package/cyberia) [![Version](https://img.shields.io/npm/v/cyberia.svg)](https://www.npmjs.org/package/cyberia)

</div>

This Command Line Interface (CLI) is a core tool for the **Cyberia Network Object Layer Engine**, specifically designed for processing, generating, and managing game assets, primarily **Object Layer** elements like skins, floors, and weapons.

It handles image asset quantization, generates data matrices and color palettes, and persists the resulting structured data into the game's database.

## What this tool does

The CLI scans the local asset folders (`./src/client/public/cyberia/assets/{type}/{id}/{direction}/{frame}`), quantizes images to a tile matrix and color palette, and persists the resulting object-layer documents to your configured MongoDB. It also supports reconstructing a visual PNG from the stored matrix for inspection.

Key features:

- Walks the asset directory structure and processes PNG/GIF files.
- Produces `frame_matrix` and `map_color` arrays from images.
- Saves processed objects to the `ObjectLayer` model in MongoDB.
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

Reconstructs and opens a PNG from the processed frame data. The input format is `objectLayerId_direction_frameIndex`.

```bash
cyberia ol --import skin --show-frame anon_08_0
```
