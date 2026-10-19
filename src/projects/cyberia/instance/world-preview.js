/**
 * The preview of a world: each map with a world origin at its place in the world, so maps that
 * share an edge meet; each other map on the cell the layout of the world gives it, beside them; every
 * map at the real proportions of its grid ({@link mapNodeExtents}), its picture contained in it; and
 * the portals between the maps. The world stores the preview with a key that names every input and
 * the generator, so it shows no stale preview and draws a changed world once.
 *
 * @module src/projects/cyberia/instance/world-preview.js
 * @namespace CyberiaWorldPreview
 */

import crypto from 'node:crypto';
import sharp from 'sharp';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { loggerFactory } from '../../../server/ops/logger.js';
import { FileFactory } from '../../../api/file/file.service.js';
import {
  MAP_NODE_FILL,
  mapNodeExtents,
  mapWorldCenter,
  resolveGraphLayout,
} from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { refreshMapPreview } from './map-preview-generator.js';

const logger = loggerFactory(import.meta);

/** The version of the drawing rules: part of every key, so a new rule draws every preview again. */
const GENERATOR = 4;
/** The longest side of a preview, and the most pixels one layout cell takes. */
const MAX_SIDE_PX = 768;
const CELL_PX = 192;
const BACKGROUND = Object.freeze({ r: 7, g: 11, b: 20, alpha: 1 });
const FRAME = Object.freeze({ r: 18, g: 28, b: 48, alpha: 1 });
const FRAME_LINE = 'rgb(90,210,250)';
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
 * Where each map of a world draws, in pixels. A map with a world origin takes the rectangle of its
 * place; the other maps take their cells, right of the placed ones, each map centred in its cell, with
 * the empty rows and columns of the layout dropped. One scale holds for every map, and an edge two
 * placed maps share is one pixel column or row.
 * @param {Array<{gridX?: number, gridY?: number, worldX?: number, worldY?: number}>} maps
 * @param {Array<{x: number, y: number}>} cells
 * @returns {{width: number, height: number, rects: Array<{left: number, top: number, width: number, height: number, placed: boolean}>}}
 * @memberof CyberiaWorldPreview
 */
const worldPreviewGeometry = (maps, cells) => {
  const extents = mapNodeExtents(maps);
  const places = maps.map((map, i) => mapWorldCenter(map, extents[i]));
  const placed = places.flatMap((place, i) => (place ? [i] : []));
  const graph = places.flatMap((place, i) => (place ? [] : [i]));
  // The cells of the other maps start one gap right of the placed maps, level with their top.
  const gap = 1 - MAP_NODE_FILL;
  const graphLeft = placed.length ? Math.max(...placed.map((i) => places[i].x + extents[i].w / 2)) + gap : 0;
  const graphTop = placed.length ? Math.min(...placed.map((i) => places[i].y - extents[i].h / 2)) : 0;
  const rank = (axis) => {
    const lines = [...new Set(graph.map((i) => cells[i][axis]))].sort((a, b) => a - b);
    return (i) => lines.indexOf(cells[i][axis]);
  };
  const [column, row] = [rank('x'), rank('y')];
  const centers = maps.map((_, i) => places[i] ?? { x: graphLeft + column(i) + 0.5, y: graphTop + row(i) + 0.5 });
  // The room of a placed map is its rectangle; the room of another map is its whole cell.
  const rooms = centers.map(({ x, y }, i) => {
    const { w, h } = places[i] ? extents[i] : { w: 1, h: 1 };
    return { left: x - w / 2, top: y - h / 2, right: x + w / 2, bottom: y + h / 2 };
  });
  const left = Math.min(...rooms.map((room) => room.left));
  const top = Math.min(...rooms.map((room) => room.top));
  const spanX = Math.max(...rooms.map((room) => room.right)) - left;
  const spanY = Math.max(...rooms.map((room) => room.bottom)) - top;
  const cell = Math.max(8, Math.min(CELL_PX, Math.floor(MAX_SIDE_PX / Math.max(spanX, spanY))));
  const px = (value, origin) => Math.round((value - origin) * cell);
  const rects = centers.map(({ x, y }, i) => {
    const { w, h } = extents[i];
    const [rectLeft, rectTop] = [px(x - w / 2, left), px(y - h / 2, top)];
    return {
      left: rectLeft,
      top: rectTop,
      width: Math.max(1, px(x + w / 2, left) - rectLeft),
      height: Math.max(1, px(y + h / 2, top) - rectTop),
      placed: !!places[i],
    };
  });
  return { width: Math.max(1, Math.round(spanX * cell)), height: Math.max(1, Math.round(spanY * cell)), rects };
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
 * Draws a world: each map picture contained in its rectangle, a frame where a map shows nothing yet,
 * then the frame of each map and each portal between two maps of the world.
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
  const composites = [];
  for (const [i, rect] of rects.entries()) {
    const input = pictures[i]
      ? await sharp(pictures[i])
          .resize(rect.width, rect.height, { fit: 'contain', kernel: 'nearest', background: FRAME })
          .png()
          .toBuffer()
      : await sharp({ create: { width: rect.width, height: rect.height, channels: 4, background: FRAME } })
          .png()
          .toBuffer();
    composites.push({ input, left: rect.left, top: rect.top });
  }
  const index = new Map(maps.map((map, i) => [map.code, i]));
  const stroke = Math.max(1, Math.round(Math.min(width, height) / 256));
  // A placed map has no frame: maps that share an edge meet.
  const frames = rects
    .filter(({ placed }) => !placed)
    .map(
      ({ left, top, width: w, height: h }) =>
        `<rect x="${left + 0.5}" y="${top + 0.5}" width="${w - 1}" height="${h - 1}" fill="none" stroke="${FRAME_LINE}" stroke-opacity="0.8"/>`,
    );
  const links = portals
    .filter((p) => index.has(p.sourceMapCode) && index.has(p.targetMapCode))
    .map((p) => {
      const source = index.get(p.sourceMapCode);
      const target = index.get(p.targetMapCode);
      const [x1, y1] = portalPoint(rects[source], maps[source], p.sourceCellX, p.sourceCellY);
      const [x2, y2] = portalPoint(rects[target], maps[target], p.targetCellX, p.targetCellY);
      const color = source === target ? PORTAL_INTRA : PORTAL;
      const line = (paint, size) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${paint}" stroke-width="${size}" stroke-linecap="square"/>`;
      return line('rgb(0,0,0)', stroke + 2) + line(color, stroke);
    });
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${frames.join('')}${links.join('')}</svg>`,
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
    .select('code gridX gridY worldX worldY preview entities')
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
