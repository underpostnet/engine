/**
 * Cyberia map preview generator — server-side equivalent of the browser
 * MapEngine "Capture Object Layer Map" render.
 *
 * MapEngineCyberia.renderToOffscreenCanvas() composites, per entity, every
 * `objectLayerItemIds` frame at (initCellX, initCellY) sized (dimX, dimY).
 * This module reproduces that with sharp so worlds that never pass through the
 * browser editor — the procedural fallback world — still get a `preview`
 * image for the client's Instance Map node backgrounds.
 *
 * Frames come from the same place the browser reads them:
 *   src/client/public/cyberia/assets/{itemType}/{itemId}/08/0.png
 *
 * Previews are pure functions of the map's entity list, so results are cached
 * in memory keyed by a content hash — the fallback world is regenerated (and
 * re-randomised) on every call, and only a changed layout re-renders.
 *
 * @module src/projects/cyberia/map-preview-generator.js
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import sharp from 'sharp';
import { loggerFactory } from '../../server/logger.js';
import {
  ENTITY_TYPE_TO_ITEM_TYPES,
  getDefaultCyberiaItemById,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

const logger = loggerFactory(import.meta);

const ASSET_ROOT = './src/client/public/cyberia/assets';
/** Direction/frame the editor previews with (08 = down_idle, frame 0). */
const PREVIEW_DIRECTION = '08';
const PREVIEW_FRAME = '0.png';

/** Node backgrounds are small; render cells down so a 64×64 map stays cheap. */
const DEFAULT_CELL_PX = 8;
const MAX_SIDE_PX = 1024;

/** Item-type directories under ASSET_ROOT, read once. */
let assetTypeDirs = null;

async function itemTypeDirs() {
  if (assetTypeDirs) return assetTypeDirs;
  try {
    const entries = await fs.readdir(ASSET_ROOT, { withFileTypes: true });
    assetTypeDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error) {
    logger.warn(`map preview: cannot read asset root: ${error.message}`);
    assetTypeDirs = [];
  }
  return assetTypeDirs;
}

/**
 * itemId → on-disk frame path, or null when no asset exists.
 *
 * The defaults registry only knows canonical items; saga-generated ones live on
 * disk without an entry, so the item type is resolved by probing — registry
 * first, then the types this entity type allows, then any remaining directory.
 */
const framePathCache = new Map();

async function resolveFramePath(itemId, entityType) {
  const key = `${itemId}:${entityType || ''}`;
  if (framePathCache.has(key)) return framePathCache.get(key);

  const candidates = [];
  const pushType = (type) => {
    if (type && !candidates.includes(type)) candidates.push(type);
  };

  pushType(getDefaultCyberiaItemById(itemId)?.item?.type);
  for (const type of ENTITY_TYPE_TO_ITEM_TYPES[entityType] || []) pushType(type);
  for (const type of await itemTypeDirs()) pushType(type);

  let found = null;
  for (const type of candidates) {
    const path = `${ASSET_ROOT}/${type}/${itemId}/${PREVIEW_DIRECTION}/${PREVIEW_FRAME}`;
    if (await fs.pathExists(path)) {
      found = path;
      break;
    }
  }
  framePathCache.set(key, found);
  return found;
}

/**
 * Resized-frame cache: `${framePath}:${w}x${h}` → Buffer | null.
 * A map tiles thousands of floor cells from a handful of distinct items, so
 * resizing once per (frame, size) is the difference between fast and unusable.
 */
const frameCache = new Map();

async function resizedFrame(itemId, entityType, width, height) {
  const framePath = await resolveFramePath(itemId, entityType);
  if (!framePath) return null;

  const key = `${framePath}:${width}x${height}`;
  if (frameCache.has(key)) return frameCache.get(key);

  let buffer = null;
  try {
    // `nearest` keeps the pixel-art edges crisp at small sizes.
    buffer = await sharp(framePath).resize(width, height, { kernel: 'nearest' }).png().toBuffer();
  } catch (error) {
    logger.warn(`map preview: frame render failed for "${itemId}": ${error.message}`);
  }
  frameCache.set(key, buffer);
  return buffer;
}

const clamp255 = (n) => Math.min(255, Math.max(0, Math.round(Number(n) || 0)));

/**
 * Parse the entity's cosmetic colour string into a sharp background.
 * Accepts `rgba(r,g,b,a)`, `rgb(r,g,b)` and `#rgb` / `#rrggbb`.
 * @returns {{ r: number, g: number, b: number, alpha: number }|null}
 */
function parseEntityColor(color) {
  if (typeof color !== 'string') return null;
  const value = color.trim();

  const fn = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(fn[4])));
    return { r: clamp255(fn[1]), g: clamp255(fn[2]), b: clamp255(fn[3]), alpha };
  }

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      alpha: 1,
    };
  }
  return null;
}

/**
 * Solid-fill cache: `${r},${g},${b},${a}:${w}x${h}` → Buffer | null.
 * Entities without object layers all fall back to a flat rect, so the same few
 * palette colours repeat across the whole map.
 */
const solidCache = new Map();

async function solidFrame(color, width, height) {
  const rgba = parseEntityColor(color);
  if (!rgba || rgba.alpha <= 0) return null;

  const key = `${rgba.r},${rgba.g},${rgba.b},${rgba.alpha}:${width}x${height}`;
  if (solidCache.has(key)) return solidCache.get(key);

  let buffer = null;
  try {
    buffer = await sharp({ create: { width, height, channels: 4, background: rgba } })
      .png()
      .toBuffer();
  } catch (error) {
    logger.warn(`map preview: solid fill failed for "${color}": ${error.message}`);
  }
  solidCache.set(key, buffer);
  return buffer;
}

/** Stable content hash of everything that affects the rendered pixels. */
function mapPreviewHash(map, cellPx) {
  const layout = (map.entities || []).map((e) => [
    e.initCellX,
    e.initCellY,
    e.dimX,
    e.dimY,
    (e.objectLayerItemIds || []).join(','),
    // Drives frame-path resolution, and the colour is the render fallback.
    e.entityType || '',
    e.color || '',
  ]);
  return crypto
    .createHash('sha1')
    .update(JSON.stringify({ code: map.code, g: [map.gridX, map.gridY], cellPx, layout }))
    .digest('hex');
}

/**
 * Render one CyberiaMap-shaped object to a PNG buffer.
 *
 * @param {object} map               CyberiaMap-shaped (code, gridX/gridY, entities).
 * @param {object} [opts]
 * @param {number} [opts.cellPx=8]   Pixels per grid cell in the output.
 * @returns {Promise<Buffer|null>}   PNG buffer, or null when nothing rendered.
 */
async function renderMapPreviewPng(map, { cellPx = DEFAULT_CELL_PX } = {}) {
  const gridX = map?.gridX || 0;
  const gridY = map?.gridY || 0;
  if (gridX <= 0 || gridY <= 0) return null;

  // Keep the output bounded regardless of grid size.
  const scale = Math.min(1, MAX_SIDE_PX / (Math.max(gridX, gridY) * cellPx));
  const cell = Math.max(1, Math.floor(cellPx * scale));
  const width = gridX * cell;
  const height = gridY * cell;

  // Every entity of every entityType in the array renders something: its layer
  // frames when they resolve on disk, otherwise a flat fill of its colour.
  const composites = [];
  for (const entity of map.entities || []) {
    const left = Math.round((entity.initCellX || 0) * cell);
    const top = Math.round((entity.initCellY || 0) * cell);
    const w = Math.max(1, Math.round((entity.dimX || 1) * cell));
    const h = Math.max(1, Math.round((entity.dimY || 1) * cell));
    if (left >= width || top >= height || left + w <= 0 || top + h <= 0) continue;

    // Stack the entity's layers in declaration order, exactly like the editor.
    let drew = false;
    for (const itemId of entity.objectLayerItemIds || []) {
      const input = await resizedFrame(itemId, entity.entityType, w, h);
      if (input) {
        composites.push({ input, left, top });
        drew = true;
      }
    }
    if (drew) continue;

    const input = await solidFrame(entity.color, w, h);
    if (input) composites.push({ input, left, top });
  }
  if (composites.length === 0) return null;

  return await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * Rendered-preview cache: `${instanceCode}:${mapCode}` → { hash, png }.
 * Only the latest render per map is retained — the fallback world is
 * regenerated per request and old layouts are unreachable.
 */
const previewCache = new Map();

const cacheKey = (instanceCode, mapCode) => `${instanceCode}:${mapCode}`;

/**
 * Render (or reuse) the preview for one map and cache it under the instance.
 * @returns {Promise<Buffer|null>}
 */
async function cacheMapPreview(instanceCode, map, opts = {}) {
  const key = cacheKey(instanceCode, map.code);
  const hash = mapPreviewHash(map, opts.cellPx ?? DEFAULT_CELL_PX);
  const hit = previewCache.get(key);
  if (hit && hit.hash === hash) return hit.png;

  const png = await renderMapPreviewPng(map, opts);
  if (!png) return null;
  previewCache.set(key, { hash, png });
  return png;
}

/** Cached PNG for a map, or null when it was never rendered. */
function getCachedMapPreview(instanceCode, mapCode) {
  return previewCache.get(cacheKey(instanceCode, mapCode))?.png ?? null;
}

/**
 * Render + cache previews for every map of a freshly generated world. Failures
 * are logged and skipped so a missing asset never breaks the world payload.
 *
 * @param {string} instanceCode
 * @param {object[]} maps  CyberiaMap-shaped objects.
 * @returns {Promise<string[]>} map codes that now have a cached preview.
 */
async function cacheWorldMapPreviews(instanceCode, maps, opts = {}) {
  const rendered = [];
  for (const map of maps || []) {
    try {
      if (await cacheMapPreview(instanceCode, map, opts)) rendered.push(map.code);
    } catch (error) {
      logger.warn(`map preview: "${map?.code}" failed: ${error.message}`);
    }
  }
  return rendered;
}

export {
  renderMapPreviewPng,
  cacheMapPreview,
  cacheWorldMapPreviews,
  getCachedMapPreview,
  mapPreviewHash,
};
