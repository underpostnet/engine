/**
 * What the engine and the map views share about placed entities: the composition tracker, how many
 * entities of a map answer to each composition entry, the drawing of entities on a canvas by the
 * atlas frames the game client draws, and the state of the preview a map revision draws.
 * No DOM lookup.
 *
 * @module src/client/components/cyberia/MapPlacementCyberia.js
 */

/**
 * The state of the preview of a map, as the views show it.
 * @param {{revision:number,status:string,error?:string}|null} media - The media of the map.
 * @param {number} revision - The revision the map is at.
 * @returns {{text:string,tone:string,retry:boolean}} `retry` while a draw of this revision waits or failed.
 */
export function mapMediaLabel(media, revision) {
  if (!media) return { text: 'No preview drawn yet', tone: 'muted', retry: true };
  if (media.revision !== revision)
    return { text: `Preview of revision ${media.revision}; revision ${revision} waits`, tone: 'pending', retry: true };
  if (media.status === 'ready') return { text: `Preview of revision ${revision} ready`, tone: 'good', retry: false };
  if (media.status === 'failed')
    return { text: `Preview of revision ${revision} failed: ${media.error || 'no reason'}`, tone: 'bad', retry: true };
  return { text: `Preview of revision ${revision} pending`, tone: 'pending', retry: true };
}

/** The identity of a map entity: its type and the items it holds, in order. */
export const entityKey = ({ entityType, objectLayerItemIds = [] }) => `${entityType}|${objectLayerItemIds.join(',')}`;

/**
 * Each composition entry with the number of map entities of its type and item ids.
 * @param {Array<{entity:{entityType:string,objectLayerItemIds:string[]}}>} entries
 * @param {Object[]} entities - Map entities.
 * @returns {Object[]} Each entry with `placed`; an entry is met once `placed` is one or more.
 */
export function trackComposition(entries, entities) {
  const counts = new Map();
  for (const entity of entities) counts.set(entityKey(entity), (counts.get(entityKey(entity)) ?? 0) + 1);
  return entries.map((entry) => ({ ...entry, placed: counts.get(entityKey(entry.entity)) ?? 0 }));
}

/**
 * Draws entities on a canvas context, in order, as the game client draws them: each item by the
 * idle frame of its atlas that the time `now` shows, stretched over the cells of the entity. Where
 * layers are off, or no item has a sprite yet, the entity takes its color. An item whose sprite
 * cannot load is marked unresolved: hatched, with a dashed border.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object[]} entities - Map entities.
 * @param {Object} params
 * @param {number} params.cellW - Pixels per cell, across.
 * @param {number} params.cellH - Pixels per cell, down.
 * @param {boolean} params.objectLayers - Whether to draw the items.
 * @param {(itemId:string) => {image:CanvasImageSource,frames:Object[],duration:number}|{missing:string}|undefined} params.spriteOf
 *   - The sprite of an item; undefined while it loads.
 * @param {number} [params.now] - Milliseconds; 0 draws the first frame.
 */
export function drawEntities(ctx, entities, { cellW, cellH, objectLayers, spriteOf, now = 0 }) {
  ctx.imageSmoothingEnabled = false;
  for (const entity of entities) {
    const [x, y, w, h] = [entity.initCellX * cellW, entity.initCellY * cellH, entity.dimX * cellW, entity.dimY * cellH];
    const sprites = objectLayers ? (entity.objectLayerItemIds ?? []).map(spriteOf) : [];
    if (!sprites.some((sprite) => sprite?.frames)) {
      ctx.fillStyle = entity.color;
      ctx.fillRect(x, y, w, h);
    }
    for (const sprite of sprites) {
      if (sprite?.frames) {
        const frame = sprite.frames[Math.floor(now / sprite.duration) % sprite.frames.length];
        ctx.drawImage(sprite.image, frame.x, frame.y, frame.width, frame.height, x, y, w, h);
      } else if (sprite?.missing) markUnresolved(ctx, x, y, w, h);
    }
  }
}

/** Hatches a rectangle and gives it a dashed border: an item whose artwork did not resolve. */
function markUnresolved(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = '#ff3b5c';
  ctx.lineWidth = 1;
  for (let offset = -h; offset < w; offset += 6) {
    ctx.moveTo(x + offset, y + h);
    ctx.lineTo(x + offset + h, y);
  }
  ctx.stroke();
  ctx.setLineDash([3, 2]);
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

/**
 * The time until the next frame any sprite of some entities changes, or 0 when none animates.
 * @param {Object[]} entities - Map entities.
 * @param {(itemId:string) => Object|undefined} spriteOf
 * @returns {number} Milliseconds.
 */
export function animationPace(entities, spriteOf) {
  let pace = 0;
  for (const entity of entities)
    for (const itemId of entity.objectLayerItemIds ?? []) {
      const sprite = spriteOf(itemId);
      if (sprite?.frames?.length > 1) pace = pace ? Math.min(pace, sprite.duration) : sprite.duration;
    }
  return pace;
}
