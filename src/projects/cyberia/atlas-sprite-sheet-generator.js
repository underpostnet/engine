/**
 * Atlas Sprite Sheet Generator for Cyberia Online.
 * Consolidates all object layer frames (8 directions, multiple modes) into a single PNG atlas.
 * @module src/projects/cyberia/atlas-sprite-sheet-generator.js
 * @namespace CyberiaAtlasSpriteSheetGenerator
 */

import { Jimp, rgbaToInt } from 'jimp';
import { loggerFactory } from '../../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/**
 * Pixels per cell of the human-resolution atlas, when no factor is given.
 * @memberof CyberiaAtlasSpriteSheetGenerator
 */
export const DEFAULT_ATLAS_UPSCALE_FACTOR = 20;

/**
 * Pixels per cell of the minified atlas. The client runtime downloads this one,
 * so it stays at one pixel per cell.
 * @memberof CyberiaAtlasSpriteSheetGenerator
 */
const MINIFY_CELL_PIXEL_DIM = 1;

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
  static async frameMatrixToImage(frameMatrix, colors, cellPixelDim = 1) {
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
    if (
      !frameImages?.length ||
      frameImages.some(
        ({ width, height }) => !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0,
      )
    ) {
      throw new Error('Invalid frame dimensions');
    }
    const cols = Math.ceil(Math.sqrt(frameImages.length));
    const rows = Math.ceil(frameImages.length / cols);
    return AtlasSpriteSheetGenerator.nextPowerOf2(
      Math.max(
        cols * Math.max(...frameImages.map((frame) => frame.width)),
        rows * Math.max(...frameImages.map((frame) => frame.height)),
      ),
    );
  }

  /**
   * Consolidates all frames of an ObjectLayerRenderFrames into one atlas sprite sheet.
   *
   * One packing produces two renders of the same layout: `minifyBuffer` at one
   * pixel per cell, which the client runtime downloads, and `buffer` at
   * `upscaleFactor` pixels per cell for human viewing. `metadata` describes the
   * minified render, so atlas metadata and the served blob always agree.
   *
   * @static
   * @param {Object} objectLayerRenderFrames - The ObjectLayerRenderFrames document
   * @param {string} itemKey - The item key for the atlas
   * @param {number} [upscaleFactor=DEFAULT_ATLAS_UPSCALE_FACTOR] - Pixels per cell of the human-resolution render
   * @param {number} [maxAtlasDim=null] - Maximum atlas dimension (auto-calculated if null)
   * @returns {Promise<{buffer: Buffer, minifyBuffer: Buffer, metadata: Object}>} Both renders and the shared metadata
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async generateAtlas(
    objectLayerRenderFrames,
    itemKey,
    upscaleFactor = DEFAULT_ATLAS_UPSCALE_FACTOR,
    maxAtlasDim = null,
  ) {
    if (!Number.isInteger(upscaleFactor) || upscaleFactor < 1) throw new Error('Invalid pixel scale');
    const { frames, colors } = objectLayerRenderFrames;
    const frameDuration = Number(objectLayerRenderFrames?.frame_duration);

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

    // The packing works on the minified render; the upscaled render reuses its layout.
    const frameImages = [];

    for (const direction of directionOrder) {
      const directionFrames = frames[direction];
      if (!directionFrames || directionFrames.length === 0) continue;

      for (let frameIndex = 0; frameIndex < directionFrames.length; frameIndex++) {
        const frameMatrix = directionFrames[frameIndex];
        try {
          const frameImage = await AtlasSpriteSheetGenerator.frameMatrixToImage(
            frameMatrix,
            colors,
            MINIFY_CELL_PIXEL_DIM,
          );

          frameImages.push({
            image: frameImage,
            frameMatrix,
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

    if (!Number.isInteger(maxAtlasDim) || maxAtlasDim <= 0 || maxAtlasDim > 4096) {
      throw new Error('Atlas dimension must be between 1 and 4096');
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

    const minifyImage = new Jimp({ width: atlasWidth, height: atlasHeight, color: 0x00000000 });
    const upscaledImage = new Jimp({
      width: atlasWidth * upscaleFactor,
      height: atlasHeight * upscaleFactor,
      color: 0x00000000,
    });

    const frameMetadata = {};

    for (const packedFrame of packedFrames) {
      const { image, frameMatrix, x, y, direction, frameIndex } = packedFrame;

      AtlasSpriteSheetGenerator.blitFrame(minifyImage, image, x, y);

      // The same cell grid at a larger scale, so the upscaled atlas is an exact
      // multiple of the layout the metadata describes.
      if (upscaleFactor > MINIFY_CELL_PIXEL_DIM) {
        const upscaledFrame = await AtlasSpriteSheetGenerator.frameMatrixToImage(frameMatrix, colors, upscaleFactor);
        AtlasSpriteSheetGenerator.blitFrame(upscaledImage, upscaledFrame, x * upscaleFactor, y * upscaleFactor);
      } else {
        AtlasSpriteSheetGenerator.blitFrame(upscaledImage, image, x, y);
      }

      if (!frameMetadata[direction]) {
        frameMetadata[direction] = [];
      }

      frameMetadata[direction][frameIndex] = {
        x,
        y,
        width: image.bitmap.width,
        height: image.bitmap.height,
        frameIndex,
      };
    }

    const metadata = {
      itemKey,
      atlasWidth,
      atlasHeight,
      cellPixelDim: MINIFY_CELL_PIXEL_DIM,
      upscaleFactor,
      frame_duration: Number.isFinite(frameDuration) ? frameDuration : 100,
      frames: frameMetadata,
    };

    return {
      buffer: await upscaledImage.getBuffer('image/png'),
      minifyBuffer: await minifyImage.getBuffer('image/png'),
      metadata,
    };
  }

  /**
   * Copies a frame image onto an atlas canvas at the given origin.
   * @static
   * @param {Jimp} atlasImage - Destination atlas canvas.
   * @param {Jimp} frameImage - Source frame image.
   * @param {number} originX - Destination X origin.
   * @param {number} originY - Destination Y origin.
   * @returns {void}
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static blitFrame(atlasImage, frameImage, originX, originY) {
    for (let srcY = 0; srcY < frameImage.bitmap.height; srcY++) {
      for (let srcX = 0; srcX < frameImage.bitmap.width; srcX++) {
        const destX = originX + srcX;
        const destY = originY + srcY;
        if (destX >= atlasImage.bitmap.width || destY >= atlasImage.bitmap.height) continue;
        atlasImage.setPixelColor(frameImage.getPixelColor(srcX, srcY), destX, destY);
      }
    }
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

    for (const frame of sortedFrames) {
      // Check if frame fits in current row
      if (currentX + frame.width > maxDim) {
        // Move to next row
        currentX = 0;
        currentY += rowHeight;
        rowHeight = 0;
      }

      if (frame.width > maxDim || currentY + frame.height > maxDim) {
        throw new Error(`Frames exceed atlas dimension ${maxDim}`);
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

    const atlasWidth = maxWidth;
    const atlasHeight = totalHeight;

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
}
