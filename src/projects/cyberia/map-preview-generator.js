/**
 * Cyberia map preview generator — server-side equivalent of the browser
 * MapEngine "Capture Object Layer Map" render.
 *
 * MapEngineCyberia.renderToOffscreenCanvas() composites, per entity, every
 * `objectLayerItemIds` frame at (initCellX, initCellY) sized (dimX, dimY).
 * This module reproduces that with sharp so maps that never pass through the
 * browser editor still get a `preview` image for the client's Instance Map node
 * backgrounds.
 *
 * Every entity is drawn by its items' idle-preview stills, the same picture the
 * editors show, read from the atlas of the definition each label is bound to.
 * `refreshMapPreview` stores that picture as the map's preview.
 *
 * @module src/projects/cyberia/map-preview-generator.js
 */

import sharp from 'sharp';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { CacheService } from '../../server/storage/cache.js';
import { renderFileBytes } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { mapCache } from '../../api/cyberia-map/cyberia-map.service.js';
import { FileFactory } from '../../api/file/file.service.js';
import { catalogModels, catalogMounted } from './object-layer-catalog.js';

const logger = loggerFactory(import.meta);

/** Node backgrounds are small; render cells down so a 64×64 map stays cheap. */
const DEFAULT_CELL_PX = 8;
const MAX_SIDE_PX = 1024;

/**
 * The idle preview File each label of a map resolves to now: the atlas of the definition its
 * binding names, so no type has to be known or probed.
 * @returns {Promise<Map<string, string|null>>} itemId → File id.
 */
async function idlePreviewFileIds(map, options) {
  const itemIds = [...new Set((map.entities || []).flatMap((entity) => entity.objectLayerItemIds || []))];
  const previews = new Map(itemIds.map((itemId) => [itemId, null]));
  if (itemIds.length === 0 || !catalogMounted(options)) return previews;
  try {
    const bindings = await catalogModels(options).CyberiaItemCatalog.resolve(itemIds);
    const atlases = await DataBaseProviderService.getModel('AtlasSpriteSheet', options)
      .find({ objectLayerCid: { $in: [...bindings.values()] } }, { objectLayerCid: 1, idlePreviewFileId: 1 })
      .lean();
    const fileIds = new Map(atlases.map((atlas) => [atlas.objectLayerCid, atlas.idlePreviewFileId]));
    for (const [itemId, cid] of bindings) previews.set(itemId, fileIds.get(cid) ? String(fileIds.get(cid)) : null);
  } catch (error) {
    logger.warn(`map preview: idle preview lookup failed for "${map.code}": ${error.message}`);
  }
  return previews;
}

/**
 * Resized-frame cache: `${fileId}:${w}x${h}` → Buffer | null. A File id is derived from its
 * bytes, so an entry never goes stale. A map tiles thousands of floor cells from a handful of
 * distinct items, so resizing once per (picture, size) is the difference between fast and unusable.
 */
const frameCache = new Map();

async function resizedFrame(fileId, width, height, options) {
  if (!fileId) return null;
  const key = `${fileId}:${width}x${height}`;
  if (frameCache.has(key)) return frameCache.get(key);

  let buffer = null;
  try {
    const still = await renderFileBytes(fileId, options);
    // `nearest` keeps the pixel-art edges crisp at small sizes.
    if (still) buffer = await sharp(still).resize(width, height, { kernel: 'nearest' }).png().toBuffer();
  } catch (error) {
    logger.warn(`map preview: frame render failed for File ${fileId}: ${error.message}`);
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

/**
 * Render one CyberiaMap-shaped object to a PNG buffer.
 *
 * @param {object} map               CyberiaMap-shaped (code, gridX/gridY, entities).
 * @param {object} [opts]
 * @param {number} [opts.cellPx=8]   Pixels per grid cell in the output.
 * @param {object} [opts.options]    Router options ({ host, path }) the stills are read with.
 * @returns {Promise<Buffer|null>}   PNG buffer, or null when nothing rendered.
 */
async function renderMapPreviewPng(map, { cellPx = DEFAULT_CELL_PX, options } = {}) {
  const gridX = map?.gridX || 0;
  const gridY = map?.gridY || 0;
  if (gridX <= 0 || gridY <= 0) return null;

  // Keep the output bounded regardless of grid size.
  const scale = Math.min(1, MAX_SIDE_PX / (Math.max(gridX, gridY) * cellPx));
  const cell = Math.max(1, Math.floor(cellPx * scale));
  const width = gridX * cell;
  const height = gridY * cell;
  const fileIds = await idlePreviewFileIds(map, options);

  // Every entity of every entityType renders something: its items'
  // stills when the atlases hold them, otherwise a flat fill of its colour.
  const composites = [];
  for (const entity of map.entities || []) {
    const left = Math.round(entity.initCellX * cell);
    const top = Math.round(entity.initCellY * cell);
    const w = Math.max(1, Math.round((entity.dimX || 1) * cell));
    const h = Math.max(1, Math.round((entity.dimY || 1) * cell));
    if (left >= width || top >= height || left + w <= 0 || top + h <= 0) continue;

    // Stack the entity's layers in declaration order, exactly like the editor.
    let drew = false;
    for (const itemId of entity.objectLayerItemIds || []) {
      const input = await resizedFrame(fileIds.get(itemId), w, h, options);
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
 * Draws a stored map again and makes the picture its preview. A picture its stored File already
 * holds writes nothing, so a rerun changes nothing. The replaced File goes once no map names it,
 * and a map that draws nothing keeps no preview: no map names a missing File, and no preview File
 * outlives its references. A map another write moved on keeps its own preview.
 *
 * @param {object} map - A stored map: `_id`, `code`, `gridX`, `gridY`, `preview` and `entities`.
 * @param {object} options - Router options ({ host, path }).
 * @returns {Promise<Buffer|null>} The stored picture, or null when none was stored.
 */
async function refreshMapPreview(map, options) {
  const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
  const File = DataBaseProviderService.getModel('File', options);
  const png = await renderMapPreviewPng(map, { options });
  const picture = png ? FileFactory.create(png, `${map.code}-preview.png`) : null;
  if (picture && map.preview && (await File.exists({ _id: map.preview, md5: picture.md5 }))) return png;
  const file = picture ? await new File(picture).save() : null;
  const { matchedCount } = await CyberiaMap.updateOne(
    { _id: map._id, preview: map.preview ?? null },
    file ? { $set: { preview: file._id } } : { $unset: { preview: 1 } },
    { timestamps: false },
  );
  if (matchedCount === 0) {
    if (file) await File.deleteOne({ _id: file._id });
    return null;
  }
  if (map.preview && !(await CyberiaMap.exists({ $or: [{ preview: map.preview }, { thumbnail: map.preview }] })))
    await File.deleteOne({ _id: map.preview });
  await CacheService.invalidate(mapCache(options));
  return png;
}

/**
 * Draws again the preview of every stored map that places one of the labels, one map at a time:
 * a map that fails is reported and the others go on.
 *
 * @param {Object} params
 * @param {string[]|null} params.itemIds - The labels whose pictures changed; null draws every map.
 * @param {Object} params.options - Router options ({ host, path }).
 * @returns {Promise<{drawn:number,empty:number,failed:string[]}>} Maps drawn, maps left without a
 *   picture, and the codes of the maps that failed.
 */
async function refreshMapPreviews({ itemIds, options }) {
  const maps = await DataBaseProviderService.getModel('CyberiaMap', options)
    .find(itemIds ? { 'entities.objectLayerItemIds': { $in: itemIds } } : {})
    .select('code gridX gridY preview entities')
    .lean();
  const tally = { drawn: 0, empty: 0, failed: [] };
  for (const map of maps) {
    try {
      if (await refreshMapPreview(map, options)) tally.drawn++;
      else tally.empty++;
    } catch (error) {
      logger.error(`map preview: "${map.code}" failed: ${error.message}`);
      tally.failed.push(map.code);
    }
  }
  return tally;
}

export { renderMapPreviewPng, refreshMapPreview, refreshMapPreviews };
