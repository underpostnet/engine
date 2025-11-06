/**
 * Provides utilities and engine logic for processing and managing Cyberia Online's object layer assets (skins, floors, weapons, etc.).
 * @module src/server/object-layer.js
 * @namespace CyberiaObjectLayer
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { Jimp, intToRGBA, rgbaToInt } from 'jimp';

import { range } from '../client/components/core/CommonJs.js';
import { random } from '../client/components/core/CommonJs.js';
import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

dotenv.config({ path: `./engine-private/conf/dd-cyberia/.env.production`, override: true });

/**
 * @typedef {Object} ObjectLayerCallbackPayload
 * @property {string} path - The full file path to the image.
 * @property {string} objectLayerType - The type of object layer (e.g., 'skin', 'floor').
 * @property {string} objectLayerId - The unique ID of the object layer asset.
 * @property {string} direction - The direction folder name (e.g., '08', '12').
 * @memberof CyberiaObjectLayer
 * @property {string} frame - The frame file name.
 */

export class ObjectLayerEngine {
  /**
   * @memberof CyberiaObjectLayer
   * @static
   * @description Iterates through the directory structure of object layer PNG assets for a given type.
   * @param {string} [objectLayerType='skin'] - The type of object layer to iterate over (e.g., 'skin', 'floor').
   * @param {function(ObjectLayerCallbackPayload): Promise<void>} [callback=() => {}] - The async function to execute for each image file found.
   * @returns {Promise<void>}
   * @memberof CyberiaObjectLayer
   */
  static async pngDirectoryIteratorByObjectLayerType(
    objectLayerType = 'skin',
    callback = ({ path, objectLayerType, objectLayerId, direction, frame }) => {},
  ) {
    const assetRoot = `./src/client/public/cyberia/assets/${objectLayerType}`;
    if (!fs.existsSync(assetRoot)) {
      logger.warn(`Asset root not found for type: ${objectLayerType}`);
      return;
    }

    for (const objectLayerId of await fs.readdir(assetRoot)) {
      const idPath = `${assetRoot}/${objectLayerId}`;
      if (!fs.statSync(idPath).isDirectory()) continue;

      for (const direction of await fs.readdir(idPath)) {
        const dirFolder = `${idPath}/${direction}`;
        if (!fs.statSync(dirFolder).isDirectory()) continue;

        for (const frame of await fs.readdir(dirFolder)) {
          const imageFilePath = `${dirFolder}/${frame}`;
          await callback({ path: imageFilePath, objectLayerType, objectLayerId, direction, frame });
        }
      }
    }
  }

  /**
   * @memberof CyberiaObjectLayer
   * @static
   * @description Asynchronously reads a PNG file and resolves with its raw bitmap data, width, and height.
   * @param {string} filePath - The path to the PNG file.
   * @returns {Promise<{width: number, height: number, data: Buffer} | {error: true, message: string}>} - The image data or an error object.
   * @memberof CyberiaObjectLayer
   */
  static readPngAsync(filePath) {
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(new PNG())
        .on('parsed', function () {
          resolve({
            width: this.width,
            height: this.height,
            data: Buffer.from(this.data),
          });
        })
        .on('error', (error) => {
          logger.error(`Error reading PNG file: ${filePath}`, error);
          // Resolve with a specific error indicator instead of rejecting
          resolve({ error: true, message: error.message });
        });
    });
  }

  /**
   * @memberof CyberiaObjectLayer
   * @static
   * @description Processes an image file (PNG or GIF) to generate a frame matrix and a color palette (map_color).
   * It quantizes the image based on a factor derived from image height (mazeFactor).
   * @param {string} path - The path to the image file.
   * @param {Array<number[]>} [colors=[]] - The existing color palette array to append new colors to.
   * @returns {Promise<{frame: number[][], colors: Array<number[]>}>} - The frame matrix and the updated color palette.
   * @memberof CyberiaObjectLayer
   */
  static async frameFactory(path, colors = []) {
    const frame = [];
    try {
      let image;

      if (path.endsWith('.gif')) {
        image = await Jimp.read(path);
        // remove gif file
        fs.removeSync(path);
        // save image replacing gif for png
        const pngPath = path.replace('.gif', '.png');
        await image.write(pngPath);
      } else {
        const png = await ObjectLayerEngine.readPngAsync(path);
        if (png.error) {
          throw new Error(`Failed to read PNG: ${png.message}`);
        }
        image = new Jimp(png);
      }

      const mazeFactor = parseInt(image.bitmap.height / 24);
      let _y = -1;
      for (const y of range(0, image.bitmap.height - 1)) {
        if (y % mazeFactor === 0) {
          _y++;
          if (!frame[_y]) frame[_y] = [];
        }
        let _x = -1;
        for (const x of range(0, image.bitmap.width - 1)) {
          const rgba = Object.values(intToRGBA(image.getPixelColor(x, y)));
          if (y % mazeFactor === 0 && x % mazeFactor === 0) {
            _x++;
            const indexColor = colors.findIndex(
              (c) => c[0] === rgba[0] && c[1] === rgba[1] && c[2] === rgba[2] && c[3] === rgba[3],
            );
            if (indexColor === -1) {
              colors.push(rgba);
              frame[_y][_x] = colors.length - 1;
            } else {
              frame[_y][_x] = indexColor;
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to process image ${path}:`, error);
    }
    return { frame, colors };
  }

  /**
   * @memberof CyberiaObjectLayer
   * @static
   * @description Converts a numerical folder direction (e.g., '08', '14') into an array of corresponding keyframe names (e.g., 'down_idle', 'left_walking').
   * @param {string} direction - The numerical direction string.
   * @returns {string[]} - An array of keyframe direction names.
   * @memberof CyberiaObjectLayer
   */
  static getKeyFramesDirectionsFromNumberFolderDirection(direction) {
    let objectLayerFrameDirections = [];

    switch (direction) {
      case '08':
        objectLayerFrameDirections = ['down_idle', 'none_idle', 'default_idle'];
        break;
      case '18':
        objectLayerFrameDirections = ['down_walking'];
        break;
      case '02':
        objectLayerFrameDirections = ['up_idle'];
        break;
      case '12':
        objectLayerFrameDirections = ['up_walking'];
        break;
      case '04':
        objectLayerFrameDirections = ['left_idle', 'up_left_idle', 'down_left_idle'];
        break;
      case '14':
        objectLayerFrameDirections = ['left_walking', 'up_left_walking', 'down_left_walking'];
        break;
      case '06':
        objectLayerFrameDirections = ['right_idle', 'up_right_idle', 'down_right_idle'];
        break;
      case '16':
        objectLayerFrameDirections = ['right_walking', 'up_right_walking', 'down_right_walking'];
        break;
    }

    return objectLayerFrameDirections;
  }

  /**
   * @memberof CyberiaObjectLayer
   * @static
   * @description Processes an image file through frameFactory and adds the resulting frame to the render data structure.
   * Updates the color palette and pushes the frame to all keyframe directions corresponding to the given direction code.
   * Initializes colors array, frames object, and direction arrays if they don't exist.
   * @param {Object} renderData - The render data object containing frames and colors.
   * @param {string} imagePath - The path to the image file to process.
   * @param {string} directionCode - The numerical direction code (e.g., '08', '14').
   * @returns {Promise<Object>} - The updated render data object.
   * @memberof CyberiaObjectLayer
   */
  static async processAndPushFrame(renderData, imagePath, directionCode) {
    // Initialize colors array if it doesn't exist
    if (!renderData.colors) {
      renderData.colors = [];
    }

    // Initialize frames object if it doesn't exist
    if (!renderData.frames) {
      renderData.frames = {};
    }

    // Process the image and extract frame matrix and updated colors
    const frameFactoryResult = await ObjectLayerEngine.frameFactory(imagePath, renderData.colors);

    // Update the colors palette
    renderData.colors = frameFactoryResult.colors;

    // Get all keyframe directions for this direction code
    const keyframeDirections = ObjectLayerEngine.getKeyFramesDirectionsFromNumberFolderDirection(directionCode);

    // Push the frame to all corresponding directions
    for (const keyframeDirection of keyframeDirections) {
      if (!renderData.frames[keyframeDirection]) {
        renderData.frames[keyframeDirection] = [];
      }
      renderData.frames[keyframeDirection].push(frameFactoryResult.frame);
    }

    return renderData;
  }

  /**
   * @memberof CyberiaObjectLayer
   * @static
   * @description Builds a PNG image file from a tile matrix and color map using Jimp and Sharp.
   * @param {Object} options - Options object.
   * @param {Object} options.tile - The tile data.
   * @param {Array<number[]>} options.tile.map_color - The color palette.
   * @param {number[][]} options.tile.frame_matrix - The matrix of color indices.
   * @param {string} options.imagePath - The output path for the generated image.
   * @param {number} [options.cellPixelDim=20] - The pixel dimension of each cell in the matrix.
   * @param {function(number, number, number[]): number} [options.opacityFilter] - Function to filter opacity (ignored in this implementation).
   * @returns {Promise<void>}
   * @memberof CyberiaObjectLayer
   */
  static async buildImgFromTile(
    options = {
      tile: { map_color: null, frame_matrix: null },
      imagePath: '',
      cellPixelDim: 20,
      opacityFilter: (x, y, color) => 255,
    },
  ) {
    const { tile, imagePath, cellPixelDim } = options;
    const mainMatrix = tile.frame_matrix;
    if (!mainMatrix || mainMatrix.length === 0 || mainMatrix[0].length === 0) {
      logger.error(`Cannot build image from empty or invalid frame_matrix for path: ${imagePath}`);
      return;
    }

    const sharpOptions = {
      create: {
        width: cellPixelDim * mainMatrix[0].length,
        height: cellPixelDim * mainMatrix.length,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent background
      },
    };

    let image = await sharp(sharpOptions).png().toBuffer();
    fs.writeFileSync(imagePath, image);
    image = await Jimp.read(imagePath);

    for (let y = 0; y < mainMatrix.length; y++) {
      for (let x = 0; x < mainMatrix[y].length; x++) {
        const colorIndex = mainMatrix[y][x];
        if (colorIndex === null || colorIndex === undefined) continue;

        const color = tile.map_color[colorIndex];
        if (!color) continue;

        const rgbaColor = color.length === 4 ? color : [...color, 255]; // Ensure alpha channel

        for (let dy = 0; dy < cellPixelDim; dy++) {
          for (let dx = 0; dx < cellPixelDim; dx++) {
            const pixelX = x * cellPixelDim + dx;
            const pixelY = y * cellPixelDim + dy;
            image.setPixelColor(rgbaToInt(...rgbaColor), pixelX, pixelY);
          }
        }
      }
    }

    await image.write(imagePath);
  }

  /**
   * @memberof CyberiaObjectLayer
   * @static
   * @description Generates a random set of character statistics for an item, with values between 0 and 10.
   * @returns {{effect: number, resistance: number, agility: number, range: number, intelligence: number, utility: number}} - The random stats object.
   * @memberof CyberiaObjectLayer
   */
  static generateRandomStats() {
    return {
      effect: random(0, 10),
      resistance: random(0, 10),
      agility: random(0, 10),
      range: random(0, 10),
      intelligence: random(0, 10),
      utility: random(0, 10),
    };
  }
}

/**
 * @memberof CyberiaObjectLayer
 * @constant
 * @description Mapping of item type names to numerical IDs.
 * @type {{floor: number, skin: number, weapon: number, skill: number, coin: number}}
 */
export const itemTypes = { floor: 0, skin: 1, weapon: 2, skill: 3, coin: 4 };

// Export equivalent for backward compatibility with existing destructured imports.
export const pngDirectoryIteratorByObjectLayerType = ObjectLayerEngine.pngDirectoryIteratorByObjectLayerType;
export const readPngAsync = ObjectLayerEngine.readPngAsync;
export const frameFactory = ObjectLayerEngine.frameFactory;
export const getKeyFramesDirectionsFromNumberFolderDirection =
  ObjectLayerEngine.getKeyFramesDirectionsFromNumberFolderDirection;
export const processAndPushFrame = ObjectLayerEngine.processAndPushFrame;
export const buildImgFromTile = ObjectLayerEngine.buildImgFromTile;
export const generateRandomStats = ObjectLayerEngine.generateRandomStats;
