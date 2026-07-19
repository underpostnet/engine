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
import { getDefaultCyberiaItemById } from '../../client/components/cyberia/SharedDefaultsCyberia.js';

const logger = loggerFactory(import.meta);

const ASSET_ROOT = './src/client/public/cyberia/assets';
/** Direction/frame the editor previews with (08 = down_idle, frame 0). */
const PREVIEW_DIRECTION = '08';
const PREVIEW_FRAME = '0.png';

/** Node backgrounds are small; render cells down so a 64×64 map stays cheap. */
const DEFAULT_CELL_PX = 8;
const MAX_SIDE_PX = 1024;

/** itemId → on-disk frame path, or null when the item is not a known default. */
function itemFramePath(itemId) {
  const item = getDefaultCyberiaItemById(itemId)?.item;
  if (!item?.type || !item?.id) return null;
  return `${ASSET_ROOT}/${item.type}/${item.id}/${PREVIEW_DIRECTION}/${PREVIEW_FRAME}`;
}

/**
 * Resized-frame cache: `${itemId}:${w}x${h}` → Buffer | null.
 * A map tiles thousands of floor cells from a handful of distinct items, so
 * resizing once per (item, size) is the difference between fast and unusable.
 */
const frameCache = new Map();

async function resizedFrame(itemId, width, height) {
  const key = `${itemId}:${width}x${height}`;
  if (frameCache.has(key)) return frameCache.get(key);

  let buffer = null;
  const framePath = itemFramePath(itemId);
  if (framePath && (await fs.pathExists(framePath))) {
    try {
      // `nearest` keeps the pixel-art edges crisp at small sizes.
      buffer = await sharp(framePath).resize(width, height, { kernel: 'nearest' }).png().toBuffer();
    } catch (error) {
      logger.warn(`map preview: frame render failed for "${itemId}": ${error.message}`);
    }
  }
  frameCache.set(key, buffer);
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

  const composites = [];
  for (const entity of map.entities || []) {
    const itemIds = entity.objectLayerItemIds || [];
    if (itemIds.length === 0) continue;

    const left = Math.round((entity.initCellX || 0) * cell);
    const top = Math.round((entity.initCellY || 0) * cell);
    const w = Math.max(1, Math.round((entity.dimX || 1) * cell));
    const h = Math.max(1, Math.round((entity.dimY || 1) * cell));
    if (left >= width || top >= height || left + w <= 0 || top + h <= 0) continue;

    // Stack the entity's layers in declaration order, exactly like the editor.
    for (const itemId of itemIds) {
      const input = await resizedFrame(itemId, w, h);
      if (input) composites.push({ input, left, top });
    }
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
