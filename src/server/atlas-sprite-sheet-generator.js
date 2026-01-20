/**
 * Atlas Sprite Sheet Generator for Cyberia Online.
 * Consolidates all object layer frames (8 directions, multiple modes) into a single PNG atlas.
 * @module src/server/atlas-sprite-sheet-generator.js
 * @namespace CyberiaAtlasSpriteSheetGenerator
 */

import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { Jimp, rgbaToInt } from 'jimp';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

/**
 * @typedef {Object} AtlasFrame
 * @property {number} x - X position in atlas
 * @property {number} y - Y position in atlas
 * @property {number} width - Frame width
 * @property {number} height - Frame height
 * @property {number} frameIndex - Frame index in animation
 * @memberof CyberiaAtlasSpriteSheetGenerator
 */

/**
 * Atlas Sprite Sheet Generator Engine
 * @class
 * @memberof CyberiaAtlasSpriteSheetGenerator
 */
export class AtlasSpriteSheetGenerator {
  /**
   * Converts frame matrix and color palette to a Jimp image
   * @static
   * @param {number[][]} frameMatrix - The frame matrix
   * @param {number[][]} colors - Color palette
   * @param {number} cellPixelDim - Pixel dimension per cell
   * @returns {Promise<Jimp>} The generated image
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async frameMatrixToImage(frameMatrix, colors, cellPixelDim = 20) {
    if (!frameMatrix || frameMatrix.length === 0 || frameMatrix[0].length === 0) {
      throw new Error('Invalid frame matrix');
    }

    const width = cellPixelDim * frameMatrix[0].length;
    const height = cellPixelDim * frameMatrix.length;

    const image = new Jimp({ width, height, color: 0x00000000 });

    for (let y = 0; y < frameMatrix.length; y++) {
      for (let x = 0; x < frameMatrix[y].length; x++) {
        const colorIndex = frameMatrix[y][x];
        if (colorIndex === null || colorIndex === undefined) continue;

        const color = colors[colorIndex];
        if (!color) continue;

        const rgbaColor = color.length === 4 ? color : [...color, 255];

        for (let dy = 0; dy < cellPixelDim; dy++) {
          for (let dx = 0; dx < cellPixelDim; dx++) {
            const pixelX = x * cellPixelDim + dx;
            const pixelY = y * cellPixelDim + dy;
            image.setPixelColor(rgbaToInt(...rgbaColor), pixelX, pixelY);
          }
        }
      }
    }

    return image;
  }

  /**
   * Calculates optimal atlas dimensions based on frame count and size
   * @static
   * @param {Array} frameImages - Array of frame image objects
   * @returns {number} Recommended atlas dimension (power of 2)
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static calculateOptimalDimension(frameImages) {
    if (!frameImages || frameImages.length === 0) {
      logger.warn('No frames provided for dimension calculation, using default 2048');
      return 2048;
    }

    // Get max frame dimensions with defensive checks
    const widths = frameImages.map((f) => f.width).filter((w) => !isNaN(w) && w > 0);
    const heights = frameImages.map((f) => f.height).filter((h) => !isNaN(h) && h > 0);

    if (widths.length === 0 || heights.length === 0) {
      logger.warn('Invalid frame dimensions found, using default 2048');
      return 2048;
    }

    const maxFrameWidth = Math.max(...widths);
    const maxFrameHeight = Math.max(...heights);

    logger.info(`Frame dimensions: max ${maxFrameWidth}x${maxFrameHeight}, count: ${frameImages.length}`);

    // Calculate grid layout (try to make it roughly square)
    const frameCount = frameImages.length;
    const cols = Math.ceil(Math.sqrt(frameCount));
    const rows = Math.ceil(frameCount / cols);

    // Calculate required dimensions
    const requiredWidth = cols * maxFrameWidth;
    const requiredHeight = rows * maxFrameHeight;
    const requiredDim = Math.max(requiredWidth, requiredHeight);

    logger.info(`Grid layout: ${cols}x${rows}, required: ${requiredWidth}x${requiredHeight}`);

    // Round up to next power of 2
    const optimalDim = AtlasSpriteSheetGenerator.nextPowerOf2(requiredDim);

    // Ensure minimum 1024, maximum 8192
    const finalDim = Math.max(1024, Math.min(8192, optimalDim));

    logger.info(`Calculated optimal dimension: ${finalDim}x${finalDim}`);

    return finalDim;
  }

  /**
   * Consolidates all frames from an ObjectLayerRenderFrames into a single atlas sprite sheet
   * @static
   * @param {Object} objectLayerRenderFrames - The ObjectLayerRenderFrames document
   * @param {string} itemKey - The item key for the atlas
   * @param {number} [cellPixelDim=20] - Pixel dimension per cell
   * @param {number} [maxAtlasDim=null] - Maximum atlas dimension (auto-calculated if null)
   * @returns {Promise<{buffer: Buffer, metadata: Object}>} Atlas buffer and metadata
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async generateAtlas(objectLayerRenderFrames, itemKey, cellPixelDim = 20, maxAtlasDim = null) {
    const { frames, colors } = objectLayerRenderFrames;

    // Direction order for consistent packing
    const directionOrder = [
      'down_idle',
      'up_idle',
      'left_idle',
      'right_idle',
      'down_left_idle',
      'down_right_idle',
      'up_left_idle',
      'up_right_idle',
      'down_walking',
      'up_walking',
      'left_walking',
      'right_walking',
      'down_left_walking',
      'down_right_walking',
      'up_left_walking',
      'up_right_walking',
      'default_idle',
      'none_idle',
    ];

    // Generate all frame images
    const frameImages = [];

    for (const direction of directionOrder) {
      const directionFrames = frames[direction];
      if (!directionFrames || directionFrames.length === 0) continue;

      for (let frameIndex = 0; frameIndex < directionFrames.length; frameIndex++) {
        const frameMatrix = directionFrames[frameIndex];
        try {
          const frameImage = await AtlasSpriteSheetGenerator.frameMatrixToImage(frameMatrix, colors, cellPixelDim);

          frameImages.push({
            image: frameImage,
            direction,
            frameIndex,
            width: frameImage.bitmap.width,
            height: frameImage.bitmap.height,
          });
        } catch (error) {
          logger.warn(`Failed to generate frame for ${itemKey} ${direction}[${frameIndex}]:`, error.message);
        }
      }
    }

    if (frameImages.length === 0) {
      throw new Error(`No valid frames found for item: ${itemKey}`);
    }

    // Auto-calculate optimal dimension if not specified
    if (maxAtlasDim === null || maxAtlasDim === undefined) {
      maxAtlasDim = AtlasSpriteSheetGenerator.calculateOptimalDimension(frameImages);
      logger.info(
        `Auto-calculated optimal atlas dimension: ${maxAtlasDim}x${maxAtlasDim} for ${frameImages.length} frames`,
      );
    }

    // Validate maxAtlasDim
    if (isNaN(maxAtlasDim) || maxAtlasDim <= 0) {
      logger.error(`Invalid maxAtlasDim: ${maxAtlasDim}, using default 2048`);
      maxAtlasDim = 2048;
    }

    // Simple grid packing algorithm
    const { packedFrames, atlasWidth, atlasHeight } = AtlasSpriteSheetGenerator.packFramesGrid(
      frameImages,
      maxAtlasDim,
    );

    logger.info(`Packing ${packedFrames.length} frames into ${atlasWidth}x${atlasHeight} atlas`);

    // Validate dimensions before creating Jimp image
    if (isNaN(atlasWidth) || isNaN(atlasHeight) || atlasWidth <= 0 || atlasHeight <= 0) {
      throw new Error(
        `Invalid atlas dimensions: ${atlasWidth}x${atlasHeight} (maxAtlasDim: ${maxAtlasDim}, frameCount: ${frameImages.length})`,
      );
    }

    // Create atlas canvas
    const atlasImage = new Jimp({ width: atlasWidth, height: atlasHeight, color: 0x00000000 });

    // Build metadata structure first
    const frameMetadata = {};

    // Composite frames onto atlas
    let loggedCount = 0;
    for (const packedFrame of packedFrames) {
      const { image, x, y, direction, frameIndex } = packedFrame;

      // Log first few frames for debugging
      if (loggedCount < 3) {
        logger.info(
          `Frame ${loggedCount + 1}: ${direction}[${frameIndex}] → (${x},${y}) ${image.bitmap.width}x${image.bitmap.height}`,
        );
        loggedCount++;
      }

      // Manually copy pixels to ensure correct positioning
      for (let srcY = 0; srcY < image.bitmap.height; srcY++) {
        for (let srcX = 0; srcX < image.bitmap.width; srcX++) {
          const destX = x + srcX;
          const destY = y + srcY;

          // Skip if out of bounds
          if (destX >= atlasWidth || destY >= atlasHeight) continue;

          // Get pixel color from source image
          const color = image.getPixelColor(srcX, srcY);

          // Set pixel in atlas at destination position
          atlasImage.setPixelColor(color, destX, destY);
        }
      }

      // Store metadata in correct order
      if (!frameMetadata[direction]) {
        frameMetadata[direction] = [];
      }

      frameMetadata[direction].push({
        x,
        y,
        width: image.bitmap.width,
        height: image.bitmap.height,
        frameIndex,
      });
    }

    // Convert to PNG buffer
    const buffer = await atlasImage.getBuffer('image/png');

    const metadata = {
      itemKey,
      atlasWidth,
      atlasHeight,
      cellPixelDim,
      frames: frameMetadata,
    };

    return { buffer, metadata };
  }

  /**
   * Simple grid-based frame packing algorithm
   * @static
   * @param {Array} frameImages - Array of frame image objects
   * @param {number} maxDim - Maximum atlas dimension
   * @returns {{packedFrames: Array, atlasWidth: number, atlasHeight: number}}
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static packFramesGrid(frameImages, maxDim) {
    if (frameImages.length === 0) {
      throw new Error('No frames to pack');
    }

    // Sort frames by height (tallest first) for better packing
    const sortedFrames = [...frameImages].sort((a, b) => b.height - a.height || b.width - a.width);

    const packedFrames = [];
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    let maxWidth = 0;
    let totalHeight = 0;
    let exceedsCount = 0;

    for (const frame of sortedFrames) {
      // Check if frame fits in current row
      if (currentX + frame.width > maxDim) {
        // Move to next row
        currentX = 0;
        currentY += rowHeight;
        rowHeight = 0;
      }

      // Check if we exceed max height
      if (currentY + frame.height > maxDim) {
        exceedsCount++;
      }

      packedFrames.push({
        ...frame,
        x: currentX,
        y: currentY,
      });

      currentX += frame.width;
      rowHeight = Math.max(rowHeight, frame.height);
      maxWidth = Math.max(maxWidth, currentX);
      totalHeight = Math.max(totalHeight, currentY + frame.height);
    }

    // Log once if frames exceeded dimensions
    if (exceedsCount > 0) {
      const recommendedSize = AtlasSpriteSheetGenerator.nextPowerOf2(Math.max(maxWidth, totalHeight));
      logger.warn(
        `${exceedsCount} frames exceed atlas dimension (${maxDim}x${maxDim}). ` +
          `Actual required: ${maxWidth}x${totalHeight}. ` +
          `Recommended: --to-atlas-sprite-sheet ${recommendedSize}`,
      );
    }

    // Use maxDim as the atlas dimensions (already power-of-2 and optimal from auto-calculation)
    // If all frames fit within a smaller power-of-2, use that instead
    const atlasWidth = maxDim;
    const atlasHeight = maxDim;

    return {
      packedFrames,
      atlasWidth,
      atlasHeight,
    };
  }

  /**
   * Returns the next power of 2 greater than or equal to n
   * @static
   * @param {number} n - Input number
   * @returns {number} Next power of 2
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static nextPowerOf2(n) {
    if (n <= 0) return 1;
    n--;
    n |= n >> 1;
    n |= n >> 2;
    n |= n >> 4;
    n |= n >> 8;
    n |= n >> 16;
    return n + 1;
  }

  /**
   * Generates atlas and saves to file system
   * @static
   * @param {Object} objectLayerRenderFrames - The ObjectLayerRenderFrames document
   * @param {string} itemKey - The item key for the atlas
   * @param {string} outputPath - Output file path
   * @param {number} [cellPixelDim=20] - Pixel dimension per cell
   * @param {number} [maxAtlasDim=null] - Maximum atlas dimension (auto-calculated if null)
   * @returns {Promise<{buffer: Buffer, metadata: Object, outputPath: string}>}
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async generateAtlasToFile(
    objectLayerRenderFrames,
    itemKey,
    outputPath,
    cellPixelDim = 20,
    maxAtlasDim = null,
  ) {
    const { buffer, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
      objectLayerRenderFrames,
      itemKey,
      cellPixelDim,
      maxAtlasDim,
    );

    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, buffer);

    logger.info(`Atlas sprite sheet generated: ${outputPath}`);

    return { buffer, metadata, outputPath };
  }
}

// Export convenience functions
export const generateAtlas = AtlasSpriteSheetGenerator.generateAtlas;
export const generateAtlasToFile = AtlasSpriteSheetGenerator.generateAtlasToFile;
export const frameMatrixToImage = AtlasSpriteSheetGenerator.frameMatrixToImage;
export const packFramesGrid = AtlasSpriteSheetGenerator.packFramesGrid;
export const nextPowerOf2 = AtlasSpriteSheetGenerator.nextPowerOf2;
export const calculateOptimalDimension = AtlasSpriteSheetGenerator.calculateOptimalDimension;
