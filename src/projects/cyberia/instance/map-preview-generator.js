/**
 * Cyberia map preview generator: the one renderer of the `preview` of a map.
 *
 * Per entity, it composites every `objectLayerItemIds` frame at (initCellX,
 * initCellY) sized (dimX, dimY), with sharp. Every live save and every
 * publication that writes a map revision draws it after the commit; the
 * preview is the node background of the client's Instance Map, and the
 * thumbnail of a map without a custom one.
 *
 * Every entity is drawn by its items' idle-preview stills, the same picture the
 * editors show, read from the atlas of the definition each label is bound to: an
 * animated item shows the first frame of its idle. `refreshMapPreview` stores that
 * picture as the preview of the map revision, and its media records the result.
 *
 * @module src/projects/cyberia/instance/map-preview-generator.js
 */

import sharp from 'sharp';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { loggerFactory } from '../../../server/ops/logger.js';
import { CacheService } from '../../../server/storage/cache.js';
import { renderFileBytes } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { mapCache } from '../../../api/cyberia-map/cyberia-map.service.js';
import { FileFactory } from '../../../api/file/file.service.js';
import { catalogModels, catalogMounted } from '../catalog/object-layer-catalog.js';

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
 * The part of an entity picture inside the canvas: a picture that overflows an edge is cut to it.
 * @returns {Promise<{input:Buffer,left:number,top:number}>}
 */
async function clipped(input, { left, top, w, h, width, height }) {
  const x = Math.max(0, left);
  const y = Math.max(0, top);
  const right = Math.min(width, left + w);
  const bottom = Math.min(height, top + h);
  if (x === left && y === top && right === left + w && bottom === top + h) return { input, left, top };
  const cut = await sharp(input)
    .extract({ left: x - left, top: y - top, width: right - x, height: bottom - y })
    .png()
    .toBuffer();
  return { input: cut, left: x, top: y };
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
    const box = { left, top, w, h, width, height };
    let drew = false;
    for (const itemId of entity.objectLayerItemIds || []) {
      const input = await resizedFrame(fileIds.get(itemId), w, h, options);
      if (input) {
        composites.push(await clipped(input, box));
        drew = true;
      }
    }
    if (drew) continue;

    const input = await solidFrame(entity.color, w, h);
    if (input) composites.push(await clipped(input, box));
  }
  if (composites.length === 0) return null;

  return await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/** The fields of a stored map a preview draws and a media write checks. */
const PREVIEW_FIELDS = 'code revision gridX gridY preview media entities';

/** The media of a map revision: whether the preview of that revision is stored. */
const mediaOf = (revision, status, error = '') => ({ revision, status, error, at: new Date() });

/**
 * Draws a stored map at its revision and makes the picture the preview of that revision: the media
 * of the map turns `ready`, or `failed` with the error of the draw or the store. A map another write
 * moved to a newer revision keeps the media of that revision, and nothing is stored. A picture its
 * stored File already holds writes no new File, so a rerun changes nothing. The replaced File goes
 * once no map names it, and a map that draws nothing keeps no preview.
 *
 * @param {object} map - A stored map with {@link PREVIEW_FIELDS} and `_id`.
 * @param {object} options - Router options ({ host, path }).
 * @returns {Promise<Buffer|null>} The stored picture, or null when none was stored.
 * @throws {Error} The error of the draw or the store, once the media records it.
 */
async function refreshMapPreview(map, options) {
  const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
  try {
    return await storeMapPreview(map, options);
  } catch (error) {
    await CyberiaMap.updateOne(
      { _id: map._id, revision: map.revision },
      { $set: { media: mediaOf(map.revision, 'failed', error.message) } },
      { timestamps: false },
    ).catch((failure) => logger.error(`map preview: "${map.code}" media not recorded: ${failure.message}`));
    await CacheService.invalidate(mapCache(options));
    throw error;
  }
}

/** {@link refreshMapPreview} without the record of a failure. */
async function storeMapPreview(map, options) {
  const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
  const File = DataBaseProviderService.getModel('File', options);
  const png = await renderMapPreviewPng(map, { options });
  const picture = png ? FileFactory.create(png, `${map.code}-preview.png`) : null;
  const kept = Boolean(picture && map.preview && (await File.exists({ _id: map.preview, md5: picture.md5 })));
  const ready = map.media?.status === 'ready' && map.media.revision === map.revision;
  if (ready && (kept || (!picture && !map.preview))) return png;
  const file = picture && !kept ? await new File(picture).save() : null;
  const { matchedCount } = await CyberiaMap.updateOne(
    { _id: map._id, revision: map.revision },
    {
      $set: { media: mediaOf(map.revision, 'ready'), ...(file && { preview: file._id }) },
      ...(!picture && { $unset: { preview: 1 } }),
    },
    { timestamps: false },
  );
  if (matchedCount === 0) {
    if (file) await File.deleteOne({ _id: file._id });
    return null;
  }
  if (
    map.preview &&
    !kept &&
    !(await CyberiaMap.exists({ $or: [{ preview: map.preview }, { thumbnail: map.preview }] }))
  )
    await File.deleteOne({ _id: map.preview });
  await CacheService.invalidate(mapCache(options));
  return png;
}

/**
 * Draws the preview of a stored map at the revision it is at now, after the write of that revision.
 * A failed render stays recorded in the media, so a retry runs it again.
 *
 * @param {object} filter - The map, by `_id` or `code`.
 * @param {object} options - Router options ({ host, path }).
 * @returns {Promise<{media:{revision:number,status:string,error:string,at:Date},preview:string|null}|null>}
 *   The media of the map now and its preview File, or null for an unknown map.
 */
async function refreshMapMedia(filter, options) {
  const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
  const map = await CyberiaMap.findOne(filter).select(PREVIEW_FIELDS).lean();
  if (!map) return null;
  try {
    await refreshMapPreview(map, options);
  } catch (error) {
    logger.error(`map preview: "${map.code}" revision ${map.revision} failed: ${error.message}`);
  }
  const stored = await CyberiaMap.findOne({ _id: map._id }, { media: 1, preview: 1 }).lean();
  return stored && { media: stored.media ?? null, preview: stored.preview ? String(stored.preview) : null };
}

/**
 * Draws again the preview of every stored map that places one of the labels, one map at a time:
 * a map that fails is reported and the others go on.
 *
 * @param {Object} params
 * @param {string[]|null} params.itemIds - The labels whose pictures changed; null draws every map.
 * @param {Object} params.options - Router options ({ host, path }).
 * @returns {Promise<{codes:string[],drawn:number,empty:number,failed:string[]}>} The codes of the
 *   maps taken, maps drawn, maps left without a picture, and the codes of the maps that failed.
 */
async function refreshMapPreviews({ itemIds, options }) {
  const maps = await DataBaseProviderService.getModel('CyberiaMap', options)
    .find(itemIds ? { 'entities.objectLayerItemIds': { $in: itemIds } } : {})
    .select(PREVIEW_FIELDS)
    .lean();
  const tally = { codes: maps.map(({ code }) => code), drawn: 0, empty: 0, failed: [] };
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

export { PREVIEW_FIELDS, renderMapPreviewPng, refreshMapMedia, refreshMapPreview, refreshMapPreviews };
