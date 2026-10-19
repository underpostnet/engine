/**
 * The geometry of the maps of a world, shared by the world preview and the static payload of the
 * in-game map.
 *
 * Each rectangle is in map cells: x grows right, y grows down. A map with a world origin takes its
 * place in the world. The other maps keep the arrangement of their layout cells, right of the placed
 * maps: a column starts where the maps of the column before it end, and a row where the maps above
 * it end, so maps on neighbour cells touch. A run of empty columns or rows between two maps leaves
 * one gap, as wide as the narrowest map or as tall as the shortest.
 *
 * @module src/projects/cyberia/instance/instance-map-layout.js
 * @namespace CyberiaInstanceMapLayout
 */

import { hasWorldOrigin } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';

/** The longest map side of a world, in map cells: the unit of the layout. */
const longestSide = (maps) => Math.max(1, ...maps.flatMap(({ gridX = 0, gridY = 0 }) => [gridX, gridY]));

/**
 * The start of each line of cells on one axis. A line starts past the smallest map of the line
 * before it, and past each map of an earlier line that `blocks` one of its maps. A skipped line
 * adds `gap`.
 */
const lineStarts = (members, lineOf, sizeOf, gap, blocks) => {
  const lines = [...new Set(members.map(lineOf))].sort((a, b) => a - b);
  const starts = new Map();
  for (const [k, line] of lines.entries()) {
    const past = (from, end) => end + (line - from > 1 ? gap : 0);
    const previous = lines[k - 1];
    let start =
      k > 0
        ? past(previous, starts.get(previous) + Math.min(...members.filter((i) => lineOf(i) === previous).map(sizeOf)))
        : 0;
    for (const i of members.filter((m) => lineOf(m) === line))
      for (const j of members)
        if (lineOf(j) < line && blocks(j, i))
          start = Math.max(start, past(lineOf(j), starts.get(lineOf(j)) + sizeOf(j)));
    starts.set(line, start);
  }
  return starts;
};

/**
 * The rectangle of each map in map cells. A map without a grid takes the longest side of its world.
 * @param {Array<{gridX?: number, gridY?: number, worldX?: number|null, worldY?: number|null}>} maps
 * @param {Array<{x: number, y: number}>} cells - The layout cell of each map.
 * @returns {Array<{left: number, top: number, right: number, bottom: number}>}
 * @memberof CyberiaInstanceMapLayout
 */
export const mapRects = (maps, cells) => {
  if (!maps.length) return [];
  const longest = longestSide(maps);
  const sizes = maps.map(({ gridX = 0, gridY = 0 }) => ({
    w: gridX > 0 ? gridX : longest,
    h: gridY > 0 ? gridY : longest,
  }));
  const gap = { w: Math.min(...sizes.map(({ w }) => w)), h: Math.min(...sizes.map(({ h }) => h)) };
  const loose = maps.flatMap((map, i) => (hasWorldOrigin(map) ? [] : [i]));
  const columns = lineStarts(
    loose,
    (i) => cells[i].x,
    (i) => sizes[i].w,
    gap.w,
    (j, i) => cells[j].y === cells[i].y,
  );
  const left = (i) => columns.get(cells[i].x);
  const rows = lineStarts(
    loose,
    (i) => cells[i].y,
    (i) => sizes[i].h,
    gap.h,
    (j, i) => Math.min(left(j) + sizes[j].w, left(i) + sizes[i].w) > Math.max(left(j), left(i)),
  );
  const origins = maps.map((map, i) =>
    hasWorldOrigin(map) ? { x: map.worldX, y: map.worldY } : { x: left(i), y: rows.get(cells[i].y) },
  );
  const placed = maps.flatMap((map, i) => (hasWorldOrigin(map) ? [i] : []));
  if (placed.length && loose.length) {
    const x = Math.max(...placed.map((i) => origins[i].x + sizes[i].w)) + gap.w;
    const y = Math.min(...placed.map((i) => origins[i].y));
    for (const i of loose) origins[i] = { x: origins[i].x + x, y: origins[i].y + y };
  }
  return origins.map(({ x, y }, i) => ({ left: x, top: y, right: x + sizes[i].w, bottom: y + sizes[i].h }));
};

/**
 * Whether two map rectangles share an edge of positive length. A corner or an overlap is no edge.
 * @param {{left: number, top: number, right: number, bottom: number}} a
 * @param {{left: number, top: number, right: number, bottom: number}} b
 * @returns {boolean}
 * @memberof CyberiaInstanceMapLayout
 */
export const mapsTouch = (a, b) => {
  const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const along = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return (across === 0 && along > 0) || (along === 0 && across > 0);
};

/**
 * The layout of the in-game map: each map centred on the centre of the world, its longest side 1.
 * `world` is the centre of a map with a world origin, at the same scale, or null.
 * @param {Array<{gridX?: number, gridY?: number, worldX?: number|null, worldY?: number|null}>} maps
 * @param {Array<{x: number, y: number}>} cells - The layout cell of each map.
 * @returns {{nodes: Array<{w: number, h: number, world: {x: number, y: number}|null, x: number, y: number}>, w: number, h: number}}
 * @memberof CyberiaInstanceMapLayout
 */
export const instanceMapLayout = (maps, cells) => {
  const rects = mapRects(maps, cells);
  if (!rects.length) return { nodes: [], w: 0, h: 0 };
  const unit = longestSide(maps);
  const left = Math.min(...rects.map((r) => r.left)),
    top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right)),
    bottom = Math.max(...rects.map((r) => r.bottom));
  const nodes = rects.map((r, i) => {
    const x = (r.left + r.right) / 2,
      y = (r.top + r.bottom) / 2;
    return {
      w: (r.right - r.left) / unit,
      h: (r.bottom - r.top) / unit,
      world: hasWorldOrigin(maps[i]) ? { x: x / unit, y: y / unit } : null,
      x: (x - (left + right) / 2) / unit,
      y: (y - (top + bottom) / 2) / unit,
    };
  });
  return { nodes, w: (right - left) / unit, h: (bottom - top) / unit };
};
