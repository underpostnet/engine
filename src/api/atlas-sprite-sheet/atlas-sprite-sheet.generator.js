/**
 * Atlas Sprite Sheet Generator for Cyberia Online.
 * Consolidates all object layer frames (8 directions, multiple modes) into a single PNG atlas.
 * @module src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js
 * @namespace CyberiaAtlasSpriteSheetGenerator
 */

import { Jimp, rgbaToInt } from 'jimp';
import sharp from 'sharp';
import { loggerFactory } from '../../server/ops/logger.js';
import {
  OBJECT_LAYER_DIRECTION_CODES,
  getKeyframeDirectionsByCode,
} from '../../client/components/object-layer/ObjectLayerProtocol.js';

const logger = loggerFactory(import.meta);

/** Direction code of the frame an item is previewed by: down idle. */
export const IDLE_PREVIEW_DIRECTION_CODE = '08';

/**
 * Pixels per cell of the upscaled derived render, when no factor is given.
 * @memberof CyberiaAtlasSpriteSheetGenerator
 */
export const DEFAULT_ATLAS_UPSCALE_FACTOR = 20;

/**
 * Pixels per cell of the primary render: the one `data.render.cid` addresses and the client
 * runtime downloads. One pixel per cell, so it carries every cell and nothing more.
 * @memberof CyberiaAtlasSpriteSheetGenerator
 */
export const PRIMARY_CELL_PIXEL_DIM = 1;

/**
 * Side, in pixels, of the square idle preview every client shows as an item's picture.
 * @memberof CyberiaAtlasSpriteSheetGenerator
 */
export const IDLE_PREVIEW_SIZE = 300;

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
   * One packing produces the primary render at {@link PRIMARY_CELL_PIXEL_DIM} pixels per cell,
   * and `metadata`, which describes it. `upscaleFactor` is recorded for the upscaled render
   * {@link AtlasSpriteSheetGenerator.upscaledFromRender} derives from it.
   *
   * @static
   * @param {Object} objectLayerRenderFrames - The ObjectLayerRenderFrames document
   * @param {string} itemKey - The item label the render is generated for
   * @param {number} [upscaleFactor=DEFAULT_ATLAS_UPSCALE_FACTOR] - Pixels per cell of the upscaled render
   * @param {number} [maxAtlasDim=null] - Maximum atlas dimension (auto-calculated if null)
   * @returns {Promise<{primary: Buffer, metadata: Object}>}
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

    // The packing works on the primary render; the upscaled render reuses its layout.
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
            PRIMARY_CELL_PIXEL_DIM,
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

    const primaryImage = new Jimp({ width: atlasWidth, height: atlasHeight, color: 0x00000000 });

    // Every direction, empty ones included: the layout pinned is the layout stored, byte for byte.
    const frameMetadata = Object.fromEntries(directionOrder.map((direction) => [direction, []]));

    for (const packedFrame of packedFrames) {
      const { image, x, y, direction, frameIndex } = packedFrame;

      AtlasSpriteSheetGenerator.blitFrame(primaryImage, image, x, y);

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
      cellPixelDim: PRIMARY_CELL_PIXEL_DIM,
      upscaleFactor,
      frame_duration: Number.isFinite(frameDuration) ? frameDuration : 100,
      frames: frameMetadata,
    };

    return { primary: await primaryImage.getBuffer('image/png'), metadata };
  }

  /**
   * The frame an item is previewed by: the first frame of the first down-idle keyframe the
   * atlas carries, or the first frame of any direction when it has none.
   *
   * @static
   * @param {Object} metadata - Atlas metadata as {@link generateAtlas} returns it.
   * @returns {{x:number,y:number,width:number,height:number}|null} Frame box, in cells.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static idlePreviewFrame(metadata) {
    const frames = metadata?.frames ?? {};
    const preferred = getKeyframeDirectionsByCode(IDLE_PREVIEW_DIRECTION_CODE);
    for (const direction of [...preferred, ...Object.keys(frames)]) {
      const frame = frames[direction]?.[0];
      if (frame) return frame;
    }
    return null;
  }

  /**
   * Pixels per cell of a render, read from its width: every render is the cell grid `metadata`
   * describes at some whole density, so the bytes say which one they are.
   * @static
   * @param {number} renderWidth - Render width in pixels.
   * @param {Object} metadata - Atlas metadata.
   * @returns {number}
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static pixelsPerCell(renderWidth, metadata) {
    const density = renderWidth / Number(metadata.atlasWidth);
    if (!Number.isInteger(density) || density < 1)
      throw new Error(`A ${renderWidth}px render is no whole multiple of ${metadata.atlasWidth} cells`);
    return density;
  }

  /**
   * Pixels per cell of the upscaled representation of a layout.
   * @static
   * @param {Object} metadata - Atlas metadata.
   * @returns {number}
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static upscaledPixelsPerCell(metadata) {
    return Number(metadata.upscaleFactor) || Number(metadata.cellPixelDim) || PRIMARY_CELL_PIXEL_DIM;
  }

  /**
   * Repeats every pixel of a raw RGBA image into a `factor`-square block. A block copy, never a
   * resize: a resize premultiplies alpha and rounds, and a derived render must hold the exact
   * colours of the one it comes from.
   * @static
   * @param {{data: Buffer, width: number, height: number}} image - Raw RGBA pixels.
   * @param {number} factor - Whole scale factor.
   * @returns {{data: Buffer, width: number, height: number}}
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static repeatPixels({ data, width, height }, factor) {
    if (factor === 1) return { data, width, height };
    const outWidth = width * factor;
    const out = Buffer.alloc(outWidth * height * factor * 4);
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(outWidth * 4);
      for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4;
        for (let dx = 0; dx < factor; dx++) data.copy(row, (x * factor + dx) * 4, from, from + 4);
      }
      for (let dy = 0; dy < factor; dy++) row.copy(out, (y * factor + dy) * outWidth * 4);
    }
    return { data: out, width: outWidth, height: height * factor };
  }

  /**
   * One box of a render at one pixel per cell: the first pixel of every cell block, so a render at
   * any whole density gives the same cells.
   * @static
   * @param {Buffer} render - PNG bytes of a render of the layout.
   * @param {Object} metadata - Atlas metadata.
   * @param {{x:number,y:number,width:number,height:number}} box - Frame box, in cells.
   * @returns {Promise<{data: Buffer, width: number, height: number}>} Raw RGBA pixels.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async cellBox(render, metadata, box) {
    const image = sharp(render).ensureAlpha();
    const { width } = await image.metadata();
    const density = AtlasSpriteSheetGenerator.pixelsPerCell(width, metadata);
    const { data } = await image
      .extract({
        left: box.x * density,
        top: box.y * density,
        width: box.width * density,
        height: box.height * density,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (density === 1) return { data, width: box.width, height: box.height };
    const cells = Buffer.alloc(box.width * box.height * 4);
    for (let y = 0; y < box.height; y++)
      for (let x = 0; x < box.width; x++) {
        const from = (y * density * box.width * density + x * density) * 4;
        data.copy(cells, (y * box.width + x) * 4, from, from + 4);
      }
    return { data: cells, width: box.width, height: box.height };
  }

  /**
   * One box of a render, at the upscaled density of its layout.
   * @static
   * @param {Buffer} render - PNG bytes of a render of the layout.
   * @param {Object} metadata - Atlas metadata.
   * @param {{x:number,y:number,width:number,height:number}} box - Frame box, in cells.
   * @returns {Promise<{data: Buffer, width: number, height: number}>} Raw RGBA pixels.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async upscaledBox(render, metadata, box) {
    return AtlasSpriteSheetGenerator.repeatPixels(
      await AtlasSpriteSheetGenerator.cellBox(render, metadata, box),
      AtlasSpriteSheetGenerator.upscaledPixelsPerCell(metadata),
    );
  }

  /**
   * The upscaled render derived from a render of a layout: the same cell grid at
   * `metadata.upscaleFactor` pixels per cell, every colour kept exactly.
   * @static
   * @param {Buffer} render - PNG bytes of a render of the layout.
   * @param {Object} metadata - Atlas metadata.
   * @returns {Promise<Buffer|null>} PNG bytes, or null when it would repeat the render it comes from.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async upscaledFromRender(render, metadata) {
    const { width } = await sharp(render).metadata();
    if (
      AtlasSpriteSheetGenerator.pixelsPerCell(width, metadata) ===
      AtlasSpriteSheetGenerator.upscaledPixelsPerCell(metadata)
    )
      return null;
    const whole = { x: 0, y: 0, width: Number(metadata.atlasWidth), height: Number(metadata.atlasHeight) };
    const { data, width: outWidth, height } = await AtlasSpriteSheetGenerator.upscaledBox(render, metadata, whole);
    return await sharp(data, { raw: { width: outWidth, height, channels: 4 } })
      .png()
      .toBuffer();
  }

  /**
   * The frames an atlas holds for one direction code: those of the first keyframe of the code
   * that has any.
   * @static
   * @param {Object} metadata - Atlas metadata.
   * @param {string} directionCode - Direction folder code, e.g. `08`.
   * @returns {Array<{x:number,y:number,width:number,height:number}>} Frame boxes, in cells.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static directionFrames(metadata, directionCode) {
    const frames = metadata?.frames ?? {};
    for (const keyframe of getKeyframeDirectionsByCode(directionCode))
      if (frames[keyframe]?.length) return frames[keyframe];
    return [];
  }

  /**
   * Frame count of every direction code an atlas describes.
   * @static
   * @param {Object} metadata - Atlas metadata.
   * @returns {Object<string, number>} Direction code → frames.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static frameCounts(metadata) {
    return Object.fromEntries(
      OBJECT_LAYER_DIRECTION_CODES.map((code) => [
        code,
        AtlasSpriteSheetGenerator.directionFrames(metadata, code).length,
      ]),
    );
  }

  /**
   * Animated WebP of one direction of a render, at the upscaled density of its layout. Frames of
   * one direction may differ in size, so each is scaled to the largest, nearest-neighbour.
   * @static
   * @param {Buffer} render - PNG bytes of a render of the layout.
   * @param {Object} metadata - Atlas metadata.
   * @param {string} directionCode - Direction folder code.
   * @param {number} frameDuration - Milliseconds per frame.
   * @returns {Promise<Buffer|null>} WebP bytes, or null when the direction has no frame.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async animationFromRender(render, metadata, directionCode, frameDuration) {
    const boxes = AtlasSpriteSheetGenerator.directionFrames(metadata, directionCode);
    if (!boxes.length) return null;
    const scale = AtlasSpriteSheetGenerator.upscaledPixelsPerCell(metadata);
    const width = Math.max(...boxes.map((box) => box.width)) * scale;
    const height = Math.max(...boxes.map((box) => box.height)) * scale;
    const frames = await Promise.all(
      boxes.map(async (box) => {
        const frame = await AtlasSpriteSheetGenerator.upscaledBox(render, metadata, box);
        return await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } })
          .resize(width, height, { kernel: 'nearest', fit: 'fill' })
          .png()
          .toBuffer();
      }),
    );
    // One frame is a still; animation takes two or more.
    const image = frames.length === 1 ? sharp(frames[0]) : sharp(frames, { join: { animated: true } });
    return await image.webp({ loop: 0, delay: frames.map(() => frameDuration), lossless: true }).toBuffer();
  }

  /**
   * The idle preview of a render: its preview frame on a transparent {@link IDLE_PREVIEW_SIZE}
   * square, centred, each cell a block of the largest whole size that fits.
   * @static
   * @param {Buffer} render - PNG bytes of a render of the layout.
   * @param {Object} metadata - Atlas metadata as {@link generateAtlas} returns it.
   * @returns {Promise<Buffer|null>} PNG bytes of the idle preview, or null when the render has no frame.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async idlePreviewFromRender(render, metadata) {
    const frame = AtlasSpriteSheetGenerator.idlePreviewFrame(metadata);
    if (!frame) return null;
    const cells = await AtlasSpriteSheetGenerator.cellBox(render, metadata, frame);
    const factor = Math.floor(IDLE_PREVIEW_SIZE / Math.max(cells.width, cells.height));
    const still = AtlasSpriteSheetGenerator.repeatPixels(cells, Math.max(1, factor));
    const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
    const image = sharp(still.data, { raw: { width: still.width, height: still.height, channels: 4 } });
    if (factor < 1)
      image.resize(IDLE_PREVIEW_SIZE, IDLE_PREVIEW_SIZE, {
        kernel: 'nearest',
        fit: 'contain',
        background: transparent,
      });
    else {
      const left = Math.floor((IDLE_PREVIEW_SIZE - still.width) / 2);
      const top = Math.floor((IDLE_PREVIEW_SIZE - still.height) / 2);
      image.extend({
        left,
        top,
        right: IDLE_PREVIEW_SIZE - still.width - left,
        bottom: IDLE_PREVIEW_SIZE - still.height - top,
        background: transparent,
      });
    }
    return await image.png().toBuffer();
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
