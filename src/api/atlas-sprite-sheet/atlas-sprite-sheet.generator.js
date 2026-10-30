/**
 * Atlas Sprite Sheet Generator for Cyberia Online.
 * Consolidates all object layer frames (8 directions, multiple modes) into a single PNG atlas.
 * @module src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js
 * @namespace CyberiaAtlasSpriteSheetGenerator
 */

import { PNG } from 'pngjs';
import sharp from 'sharp';
import { loggerFactory } from '../../server/ops/logger.js';
import {
  RENDER_SOURCE_MAX_COLORS,
  hexToRgba,
  sourceFromIndexedFrames,
} from '../../client/components/objectlayer-studio/RenderSource.js';
import {
  OBJECT_LAYER_DIRECTION_CODES,
  OBJECT_LAYER_KEYFRAMES,
  getKeyframeDirectionsByCode,
} from '../../client/components/objectlayer-studio/ObjectLayerProtocol.js';

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

/** Longest side, in cells, of an atlas. */
const MAX_ATLAS_DIM = 4096;

/** The first bytes of every PNG file. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Longer side, in pixels, of the idle preview every client shows as an item's picture.
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
   * The pixels of one frame of a render source, each cell `cellPixelDim` pixels wide.
   * @static
   * @param {Object} source - Render source.
   * @param {Uint8Array} pixels - The frame's palette indexes.
   * @param {number} cellPixelDim - Pixel dimension per cell
   * @returns {{data: Buffer, width: number, height: number}} Raw RGBA pixels.
   * @throws {Error} When a cell names no palette color.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static frameImage(source, pixels, cellPixelDim = 1) {
    if (!source.width || !source.height) throw new Error('Invalid frame dimensions');
    const colors = source.palette.map((hex) => Buffer.from(hexToRgba(hex)));
    const data = Buffer.alloc(source.width * source.height * 4);
    for (let cell = 0; cell < source.width * source.height; cell++) {
      const color = colors[pixels[cell]];
      if (!color) throw new Error(`Cell ${cell} names no palette color`);
      color.copy(data, cell * 4);
    }
    return AtlasSpriteSheetGenerator.repeatPixels({ data, width: source.width, height: source.height }, cellPixelDim);
  }

  /**
   * PNG bytes of raw RGBA pixels. The encoder settings never change, so the same pixels give the
   * same bytes, and so the same render CID.
   * @static
   * @param {{data: Buffer, width: number, height: number}} image - Raw RGBA pixels.
   * @returns {Buffer}
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static encodePng(image) {
    return PNG.sync.write(image);
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
   * Consolidates all frames of a render source into one atlas sprite sheet.
   *
   * One packing produces the primary render at {@link PRIMARY_CELL_PIXEL_DIM} pixels per cell,
   * and `metadata`, which describes it. `upscaleFactor` is recorded for the upscaled render
   * {@link AtlasSpriteSheetGenerator.upscaledFromRender} derives from it.
   *
   * @static
   * @param {Object} objectLayerRenderFrames - The render source
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
    const { frames } = objectLayerRenderFrames;
    const frameDuration = Number(objectLayerRenderFrames.frameDurationMs);

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
        try {
          const frameImage = AtlasSpriteSheetGenerator.frameImage(
            objectLayerRenderFrames,
            directionFrames[frameIndex],
            PRIMARY_CELL_PIXEL_DIM,
          );

          frameImages.push({
            image: frameImage,
            direction,
            frameIndex,
            width: frameImage.width,
            height: frameImage.height,
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

    if (!Number.isInteger(maxAtlasDim) || maxAtlasDim <= 0 || maxAtlasDim > MAX_ATLAS_DIM) {
      throw new Error(`Atlas dimension must be between 1 and ${MAX_ATLAS_DIM}`);
    }

    // Simple grid packing algorithm
    const { packedFrames, atlasWidth, atlasHeight } = AtlasSpriteSheetGenerator.packFramesGrid(
      frameImages,
      maxAtlasDim,
    );

    logger.info(`Packing ${packedFrames.length} frames into ${atlasWidth}x${atlasHeight} atlas`);

    // Validate dimensions before allocating the canvas
    if (isNaN(atlasWidth) || isNaN(atlasHeight) || atlasWidth <= 0 || atlasHeight <= 0) {
      throw new Error(
        `Invalid atlas dimensions: ${atlasWidth}x${atlasHeight} (maxAtlasDim: ${maxAtlasDim}, frameCount: ${frameImages.length})`,
      );
    }

    const primaryImage = { data: Buffer.alloc(atlasWidth * atlasHeight * 4), width: atlasWidth, height: atlasHeight };

    // Every direction, empty ones included: the layout pinned is the layout stored, byte for byte.
    const frameMetadata = Object.fromEntries(directionOrder.map((direction) => [direction, []]));

    for (const packedFrame of packedFrames) {
      const { image, x, y, direction, frameIndex } = packedFrame;

      AtlasSpriteSheetGenerator.blitFrame(primaryImage, image, x, y);

      frameMetadata[direction][frameIndex] = {
        x,
        y,
        width: image.width,
        height: image.height,
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

    return { primary: AtlasSpriteSheetGenerator.encodePng(primaryImage), metadata };
  }

  /**
   * The render source a primary render holds: its frames, cut out by its layout. The inverse of
   * {@link generateAtlas}: the source generates the same render again.
   *
   * @static
   * @param {Buffer} render - PNG bytes of the primary render.
   * @param {Object} metadata - Layout of the render.
   * @param {Object} [limits]
   * @param {number} [limits.maxPixels=Infinity] - The most pixels its atlas may hold.
   * @returns {Promise<Object>} A render source (`RenderSource.js`).
   * @throws {Error} When the render is not a PNG, the layout does not describe the render, or the
   *   render exceeds the limits. Every check runs before the render is decoded.
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static async sourceFromRender(render, metadata, { maxPixels = Infinity } = {}) {
    const { atlasWidth, atlasHeight, cellPixelDim, frame_duration: frameDurationMs, frames } = metadata ?? {};
    if (!Buffer.isBuffer(render) || !render.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
      throw new Error('The render is not a PNG');
    if (cellPixelDim !== PRIMARY_CELL_PIXEL_DIM)
      throw new Error(`A primary render holds ${PRIMARY_CELL_PIXEL_DIM} pixel per cell, not ${cellPixelDim}`);
    if (![atlasWidth, atlasHeight].every((side) => Number.isInteger(side) && side >= 1 && side <= MAX_ATLAS_DIM))
      throw new Error(`An atlas is 1 to ${MAX_ATLAS_DIM} cells a side`);
    if (atlasWidth * atlasHeight > maxPixels) throw new Error(`The atlas holds over ${maxPixels} pixels`);
    if (!Number.isFinite(frameDurationMs) || frameDurationMs < 0)
      throw new Error('A layout names its frame duration in milliseconds');
    if (frames === null || typeof frames !== 'object' || Array.isArray(frames))
      throw new Error('A layout lists its frames by keyframe');
    const inside = (box) =>
      [box?.x, box?.y, box?.width, box?.height].every(Number.isInteger) &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.width >= 1 &&
      box.height >= 1 &&
      box.x + box.width <= atlasWidth &&
      box.y + box.height <= atlasHeight;
    const keyframes = Object.entries(frames).map(([keyframe, boxes]) => {
      if (!OBJECT_LAYER_KEYFRAMES.includes(keyframe)) throw new Error(`The layout names no keyframe ${keyframe}`);
      if (!Array.isArray(boxes) || !boxes.every(inside)) throw new Error(`A ${keyframe} frame lies outside the render`);
      return [keyframe, boxes];
    });
    const pixels = keyframes.flatMap(([, boxes]) => boxes).reduce((sum, box) => sum + box.width * box.height, 0);
    if (pixels > atlasWidth * atlasHeight) throw new Error(`The frames of the layout hold ${pixels} pixels`);

    const { data, info } = await sharp(render, { limitInputPixels: atlasWidth * atlasHeight })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== atlasWidth || info.height !== atlasHeight)
      throw new Error(`The render is ${info.width}×${info.height}, its layout ${atlasWidth}×${atlasHeight}`);
    const colors = [];
    const indexOf = new Map();
    const indexAt = (at) => {
      const rgba = data.readUInt32BE(at);
      if (!indexOf.has(rgba)) {
        if (colors.length === RENDER_SOURCE_MAX_COLORS)
          throw new RangeError(`A render holds at most ${RENDER_SOURCE_MAX_COLORS} colors`);
        indexOf.set(rgba, colors.push([...data.subarray(at, at + 4)]) - 1);
      }
      return indexOf.get(rgba);
    };
    const cut = ({ x, y, width, height }) =>
      Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, column) => indexAt(((y + row) * atlasWidth + x + column) * 4)),
      );
    return sourceFromIndexedFrames({
      frames: Object.fromEntries(
        keyframes.filter(([, boxes]) => boxes.length).map(([key, boxes]) => [key, boxes.map(cut)]),
      ),
      colors,
      frameDurationMs,
    });
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
   * The idle preview of a render: its preview frame scaled nearest-neighbour until its longer side
   * is {@link IDLE_PREVIEW_SIZE}, with no margin.
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
    return await sharp(cells.data, { raw: { width: cells.width, height: cells.height, channels: 4 } })
      .resize(IDLE_PREVIEW_SIZE, IDLE_PREVIEW_SIZE, { kernel: 'nearest', fit: 'inside' })
      .png()
      .toBuffer();
  }

  /**
   * Copies a frame onto an atlas canvas at the given origin. Pixels outside the canvas are dropped.
   * @static
   * @param {{data: Buffer, width: number, height: number}} atlasImage - Destination atlas canvas, raw RGBA.
   * @param {{data: Buffer, width: number, height: number}} frameImage - Source frame, raw RGBA.
   * @param {number} originX - Destination X origin.
   * @param {number} originY - Destination Y origin.
   * @returns {void}
   * @memberof CyberiaAtlasSpriteSheetGenerator
   */
  static blitFrame(atlasImage, frameImage, originX, originY) {
    const rowBytes = Math.max(0, Math.min(frameImage.width, atlasImage.width - originX)) * 4;
    for (let srcY = 0; srcY < frameImage.height && originY + srcY < atlasImage.height; srcY++) {
      const from = srcY * frameImage.width * 4;
      frameImage.data.copy(atlasImage.data, ((originY + srcY) * atlasImage.width + originX) * 4, from, from + rowBytes);
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
