/**
 * The preview of a world: its maps at the places of `instance-map-layout.js`, so maps that share an
 * edge meet as one surface; every map at the real proportions of its grid, its picture contained in
 * it; one outline around the surface; and the portals between maps that do not touch. The world
 * stores the preview with a key that names every input and the generator, so it shows no stale
 * preview and draws a changed world once.
 *
 * @module src/projects/cyberia/instance/world-preview.js
 * @namespace CyberiaWorldPreview
 */

import crypto from 'node:crypto';
import sharp from 'sharp';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { loggerFactory } from '../../../server/ops/logger.js';
import { FileFactory } from '../../../api/file/file.service.js';
import { hasWorldOrigin, resolveGraphLayout } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { mapRects, mapsTouch } from './instance-map-layout.js';
import { PREVIEW_FIELDS, refreshMapPreview } from './map-preview-generator.js';

const logger = loggerFactory(import.meta);

/** The version of the drawing rules: part of every key, so a new rule draws every preview again. */
const GENERATOR = 6;
/** The longest side of a preview, and the most pixels one map cell takes: the scale of a map preview. */
const MAX_SIDE_PX = 768;
const MAX_CELL_PX = 8;
/** The outline around the maps, outside them. */
const OUTLINE_PX = 2;
const BACKGROUND = Object.freeze({ r: 7, g: 11, b: 20, alpha: 1 });
const FRAME = Object.freeze({ r: 18, g: 28, b: 48, alpha: 1 });
const OUTLINE = 'rgb(36,81,101)';
const PORTAL = 'rgb(60,200,255)';
const PORTAL_INTRA = 'rgb(170,110,255)';

const failure = (status, message) => Object.assign(new Error(message), { status });

/**
 * The key of a world preview: the generator, the world, each map with its grid, picture and cell,
 * and each portal.
 * @param {string} code
 * @param {Array<{code: string, gridX?: number, gridY?: number, worldX?: number, worldY?: number, preview?: string}>} maps - In instance order.
 * @param {Array<{x: number, y: number}>} cells - The cell of each map.
 * @param {Array<Object>} portals - The portal edges of the world.
 * @returns {string}
 * @memberof CyberiaWorldPreview
 */
const worldPreviewKey = (code, maps, cells, portals) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        GENERATOR,
        code,
        maps.map((map, i) => [
          map.code,
          map.gridX,
          map.gridY,
          map.worldX ?? null,
          map.worldY ?? null,
          String(map.preview ?? ''),
          cells[i].x,
          cells[i].y,
        ]),
        portals.map((p) => [
          p.sourceMapCode,
          p.sourceCellX,
          p.sourceCellY,
          p.targetMapCode,
          p.targetCellX,
          p.targetCellY,
          p.portalMode,
        ]),
      ]),
    )
    .digest('hex')
    .slice(0, 32);

/**
 * The pixel rectangle of each map, in one scale for the whole world. Maps that touch share their edge
 * pixel, and `joinedTo` names the maps each one touches.
 * @param {Array<{gridX?: number, gridY?: number, worldX?: number, worldY?: number}>} maps
 * @param {Array<{x: number, y: number}>} cells
 * @returns {{width: number, height: number, rects: Array<{left: number, top: number, width: number, height: number, placed: boolean, joinedTo: number[]}>}}
 * @memberof CyberiaWorldPreview
 */
const worldPreviewGeometry = (maps, cells) => {
  const cellRects = mapRects(maps, cells);
  const left = Math.min(...cellRects.map((r) => r.left)),
    top = Math.min(...cellRects.map((r) => r.top));
  const spanX = Math.max(...cellRects.map((r) => r.right)) - left,
    spanY = Math.max(...cellRects.map((r) => r.bottom)) - top;
  const scale = Math.min(MAX_CELL_PX, (MAX_SIDE_PX - 2 * OUTLINE_PX) / Math.max(spanX, spanY));
  const inner = { width: Math.max(1, Math.round(spanX * scale)), height: Math.max(1, Math.round(spanY * scale)) };
  const px = (value, origin, side) => Math.min(side - 1, Math.round((value - origin) * scale));
  const rects = cellRects.map((r, i) => {
    const x = px(r.left, left, inner.width),
      y = px(r.top, top, inner.height);
    return {
      left: OUTLINE_PX + x,
      top: OUTLINE_PX + y,
      width: Math.max(1, px(r.right, left, inner.width + 1) - x),
      height: Math.max(1, px(r.bottom, top, inner.height + 1) - y),
      placed: hasWorldOrigin(maps[i]),
      joinedTo: cellRects.flatMap((other, j) => (i !== j && mapsTouch(r, other) ? [j] : [])),
    };
  });
  return { width: inner.width + 2 * OUTLINE_PX, height: inner.height + 2 * OUTLINE_PX, rects };
};

/**
 * The proportions of the preview of a world, its longest side 1: the size of its card in a graph cell.
 * @param {{cyberiaMapCodes?: string[], mapLayout?: Object[]}} instance
 * @param {Array<{code: string, gridX?: number, gridY?: number, worldX?: number, worldY?: number}>} maps - Any order.
 * @returns {{w: number, h: number}}
 * @memberof CyberiaWorldPreview
 */
const worldPreviewSize = (instance, maps) => {
  const byCode = new Map(maps.map((map) => [map.code, map]));
  const ordered = (instance.cyberiaMapCodes ?? []).map((code) => byCode.get(code)).filter(Boolean);
  if (!ordered.length) return { w: 1, h: 1 };
  const cells = resolveGraphLayout(
    ordered.map(({ code }) => code),
    instance.mapLayout ?? [],
    'mapCode',
  );
  const { width, height } = worldPreviewGeometry(ordered, cells);
  const longest = Math.max(width, height);
  return { w: width / longest, h: height / longest };
};

/** The point of a portal on its map: the centre of its cell, or the centre of the map for a random one. */
const portalPoint = (rect, map, cellX, cellY) =>
  cellX >= 0 && cellY >= 0 && map.gridX > 0 && map.gridY > 0
    ? [rect.left + ((cellX + 0.5) / map.gridX) * rect.width, rect.top + ((cellY + 0.5) / map.gridY) * rect.height]
    : [rect.left + rect.width / 2, rect.top + rect.height / 2];

/**
 * Draws a world: the outline of each map under all pictures, so only the outline around the surface
 * shows; each map picture contained in its rectangle, a frame where a map shows nothing yet; then
 * each portal between two maps that do not touch.
 * @param {Object} params
 * @param {Array<{code: string, gridX?: number, gridY?: number}>} params.maps - In instance order.
 * @param {Array<{x: number, y: number}>} params.cells - The cell of each map.
 * @param {Array<Object>} params.portals - The portal edges of the world.
 * @param {Array<Buffer|null>} params.pictures - The picture of each map, null when it shows nothing yet.
 * @returns {Promise<Buffer>} PNG.
 * @memberof CyberiaWorldPreview
 */
const composeWorldPreview = async ({ maps, cells, portals, pictures }) => {
  const { width, height, rects } = worldPreviewGeometry(maps, cells);
  const outline = rects.map(
    ({ left, top, width: w, height: h }) =>
      `<rect x="${left - OUTLINE_PX}" y="${top - OUTLINE_PX}" width="${w + 2 * OUTLINE_PX}" height="${h + 2 * OUTLINE_PX}" fill="${OUTLINE}"/>`,
  );
  const composites = [
    {
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${outline.join('')}</svg>`,
      ),
      left: 0,
      top: 0,
    },
  ];
  for (const [i, rect] of rects.entries()) {
    const picture = pictures[i] ? sharp(pictures[i]) : null;
    const metadata = picture ? await picture.metadata() : null;
    const matches = metadata && Math.abs(metadata.width / metadata.height - maps[i].gridX / maps[i].gridY) < 1e-6;
    const input = pictures[i]
      ? await picture
          .resize(rect.width, rect.height, { fit: matches ? 'fill' : 'contain', kernel: 'nearest', background: FRAME })
          .png()
          .toBuffer()
      : await sharp({ create: { width: rect.width, height: rect.height, channels: 4, background: FRAME } })
          .png()
          .toBuffer();
    composites.push({ input, left: rect.left, top: rect.top });
  }
  const index = new Map(maps.map((map, i) => [map.code, i]));
  const stroke = Math.max(1, Math.round(Math.min(width, height) / 256));
  const links = portals
    .filter((p) => index.has(p.sourceMapCode) && index.has(p.targetMapCode))
    .map((p) => {
      const source = index.get(p.sourceMapCode);
      const target = index.get(p.targetMapCode);
      if (rects[source].joinedTo.includes(target)) return '';
      const [x1, y1] = portalPoint(rects[source], maps[source], p.sourceCellX, p.sourceCellY);
      const [x2, y2] = portalPoint(rects[target], maps[target], p.targetCellX, p.targetCellY);
      const color = source === target ? PORTAL_INTRA : PORTAL;
      const line = (paint, size) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${paint}" stroke-width="${size}" stroke-linecap="square"/>`;
      return line('rgb(0,0,0)', stroke + 2) + line(color, stroke);
    });
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${links.join('')}</svg>`,
  );
  composites.push({ input: overlay, left: 0, top: 0 });
  return await sharp({ create: { width, height, channels: 4, background: BACKGROUND } })
    .composite(composites)
    .png()
    .toBuffer();
};

/**
 * The preview of a world. The stored one serves while its key is the key of the world now; else the
 * world is drawn and stored, and the File it replaced goes once nothing names it. A map with no
 * stored picture is drawn first, so the key names every picture the preview shows.
 * @param {string} instanceCode
 * @param {{host: string, path: string}} options - Router options.
 * @returns {Promise<{key: string, png: Buffer}>}
 * @throws {Error} `status` 404 for an unknown world, or a world with no map.
 * @memberof CyberiaWorldPreview
 */
const worldPreview = async (instanceCode, options) => {
  const model = (name) => DataBaseProviderService.getModel(name, options);
  const instance = await model('CyberiaInstance')
    .findOne(
      { code: instanceCode },
      { code: 1, cyberiaMapCodes: 1, mapLayout: 1, portals: 1, preview: 1, previewKey: 1 },
    )
    .lean();
  if (!instance) throw failure(404, `No world ${instanceCode}`);
  const codes = instance.cyberiaMapCodes ?? [];
  const stored = await model('CyberiaMap')
    .find({ code: { $in: codes } })
    .select(`${PREVIEW_FIELDS} worldX worldY`)
    .lean();
  const maps = codes.map((code) => stored.find((map) => map.code === code)).filter(Boolean);
  if (maps.length === 0) throw failure(404, `World ${instanceCode} has no map`);

  const kept = new Set(
    (
      await model('File')
        .find({ _id: { $in: maps.map(({ preview }) => preview).filter(Boolean) } }, { _id: 1 })
        .lean()
    ).map(({ _id }) => String(_id)),
  );
  for (const map of maps) {
    if (map.preview && kept.has(String(map.preview))) continue;
    await refreshMapPreview(map, options);
    map.preview = (await model('CyberiaMap').findOne({ code: map.code }, { preview: 1 }).lean())?.preview;
  }
  const cells = resolveGraphLayout(
    maps.map(({ code }) => code),
    instance.mapLayout ?? [],
    'mapCode',
  );
  const portals = instance.portals ?? [];
  const key = worldPreviewKey(instance.code, maps, cells, portals);

  const File = model('File');
  if (instance.previewKey === key && instance.preview) {
    const current = await File.findOne({ _id: instance.preview }, { data: 1 });
    if (current?.data) return { key, png: current.data };
  }
  const files = await File.find({ _id: { $in: maps.map(({ preview }) => preview).filter(Boolean) } }, { data: 1 });
  const pictures = maps.map((map) => files.find(({ _id }) => String(_id) === String(map.preview))?.data ?? null);
  const png = await composeWorldPreview({ maps, cells, portals, pictures });

  const file = await new File(FileFactory.create(png, `${instance.code}-world-preview.png`)).save();
  const { matchedCount } = await model('CyberiaInstance').updateOne(
    { _id: instance._id, previewKey: instance.previewKey || { $in: ['', null] } },
    { $set: { preview: file._id, previewKey: key } },
    { timestamps: false },
  );
  if (matchedCount === 0) await File.deleteOne({ _id: file._id });
  else if (instance.preview && !(await model('CyberiaInstance').exists({ preview: instance.preview })))
    await File.deleteOne({ _id: instance.preview });
  return { key, png };
};

/**
 * Brings the stored preview of every world that holds one of the maps in line, one world at a time:
 * a world that fails is reported and the others go on.
 * @param {Object} params
 * @param {string[]|null} params.mapCodes - The maps whose pictures changed; null takes every world.
 * @param {Object} params.options - Router options ({ host, path }).
 * @returns {Promise<{current: number, failed: string[]}>} The worlds whose stored preview is current, and the codes that failed.
 * @memberof CyberiaWorldPreview
 */
const refreshWorldPreviews = async ({ mapCodes, options }) => {
  const instances = await DataBaseProviderService.getModel('CyberiaInstance', options)
    .find(mapCodes ? { cyberiaMapCodes: { $in: mapCodes } } : {}, { code: 1 })
    .lean();
  const tally = { current: 0, failed: [] };
  for (const { code } of instances) {
    try {
      await worldPreview(code, options);
      tally.current++;
    } catch (error) {
      if (error.status === 404) continue;
      logger.error(`world preview: "${code}" failed: ${error.message}`);
      tally.failed.push(code);
    }
  }
  return tally;
};

export {
  composeWorldPreview,
  refreshWorldPreviews,
  worldPreview,
  worldPreviewGeometry,
  worldPreviewKey,
  worldPreviewSize,
};
