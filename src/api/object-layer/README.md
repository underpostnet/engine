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

## **🚀 Getting Started**

### **Prerequisites**

You must have the following installed in your environment:

- **Node.js** (v24.10.0 recommended)
- **npm** or **yarn**
- **MongoDB** (or access to the configured MongoDB instance)

### **Installation**

1. **Clone the Repository** (If applicable):  
   git clone \[Your Repository URL\]  
   cd \[Your Project Directory\]

2. **Install Dependencies:**  
   npm install  
   \# or  
   yarn install

3. Environment Setup:  
   Ensure your required environment variables (e.g., DEFAULT_DEPLOY_ID, DEFAULT_DEPLOY_HOST, DEFAULT_DEPLOY_PATH) are correctly configured, typically in a .env file, to point the CLI to the correct database instance defined in conf.server.json.

## **🛠️ Usage**

The CLI is executed via Node.js, running the primary script cyberia.js. You can use your project's package.json scripts or run it directly.

The main execution pattern is:

node cyberia.js \[command\] \[options\]

### **Main Commands**

#### **1\. Processing and Saving Object Layer Assets**

The primary function of this CLI is to process raw PNG/GIF assets, convert them into game-ready tile matrices and color palettes, and store the final data object in the database.

| Option                  | Description                                                                                                                                                                                                                                 |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| \--process-object-layer | Iterates through all asset directories (/cyberia/assets/{type}/{id}/{direction}/{frame}), runs the frameFactory quantization logic, generates map_color and frame_matrix, and saves the final object to the database (with a SHA-256 hash). |

**Example:** To process all defined assets (skins, floors, etc.):

node cyberia.js \--process-object-layer

#### **2\. Visualizing Processed Frames**

This command allows developers to quickly visualize a single processed frame matrix, regenerating a standard PNG image from the tile data. This is useful for debugging the asset processing and quantization logic.

| Option        | Format                             | Description                                                                                                                 |
| :------------ | :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| \--show-frame | objectLayerId_direction_frameIndex | Takes a processed asset ID, direction, and frame index, reconstructs the PNG, saves it locally, and opens it using firefox. |

**Example:** To show the first frame (index 0\) of the skin-001 asset in direction 08:

node cyberia.js \--show-frame skin-001_08_0

This will create a file named skin-001_08_0.png in the current directory and open it.

## **⚙️ Core Logic (from object-layer.js)**

The CLI relies on the logic provided by the ObjectLayerEngine class, which handles:

- **pngDirectoryIteratorByObjectLayerType**: Walks the file system to find all relevant asset files.
- **frameFactory**: The core image processing method that converts raw image data (PNG/GIF) into a grid of color indices (frame_matrix) and a global color palette (map_color).
- **buildImgFromTile**: Reverses the process, taking the stored frame_matrix and map_color to reconstruct and save a visual PNG.
