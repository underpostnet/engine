/**
 * The floor tile generator. It reads a resolved context and the palette of a candidate, never
 * another source. The item id, the description, the activable flag and the stats of a tile are
 * those of its source.
 *
 * A source with a render keeps its tile: the generator recolors it in the tones of the palette, and
 * every cell, frame, direction and the canvas stay as they are.
 *
 * Without a render, or when the request starts it from the template, the generator draws a seamless
 * tile from the region map of a Genesis Template: every cell is opaque and every edge joins the
 * opposite edge, so neighbor floor cells connect. A drawn tile is a pipeline over the layout of each
 * direction: a shift on the torus, a trade of border cells between region pairs, the tones of each
 * cell with relief at region borders, and accent cells. It is then checked: every region keeps its
 * share within {@link MAX_SHARE_SHIFT}, no cell stands alone in its region, and it stands far enough
 * from the source and from the siblings accepted before it. A tile that fails a check is drawn again
 * from the next seed of the try, up to {@link MAX_TRIES}. Pure functions.
 *
 * @module src/projects/cyberia/procedural/generators/floor/generator.js
 */
import {
  framesByDirection,
  hexToRgba,
  sourceFromDirectionFrames,
} from '../../../../../client/components/objectlayer-studio/RenderSource.js';
import { seededRandom } from '../../../../../client/components/objectlayer-studio/PixelRegion.js';
import { diversityAgainst, signatureOf } from '../../core/diversity.js';
import { variationParameters } from '../../core/parameters.js';
import { operatorSeed, trySeed } from '../../core/seed.js';
import { planPalette } from '../../palettes/resolver.js';
import {
  layoutOf,
  neighborsOf,
  ownedOf,
  paintLayout,
  recolorFrame,
  scatterAccents,
  shiftLayout,
  tradeBorders,
} from './operators.js';

/** The tries a tile gets to pass its checks. */
const MAX_TRIES = 5;
/** The greatest move of the share of a region, 0 to 1. */
const MAX_SHARE_SHIFT = 0.1;
const VARIATIONS = Object.freeze(['layout', 'region', 'detail', 'palette']);

/**
 * The parameters of a run, checked against a profile and completed. `variation` is the one
 * high-level control: it sets every granular variation the request leaves out.
 * @param {Object} [parameters]
 * @param {number} [parameters.variation] - 0 to 1; sets the four granular variations.
 * @param {number} [parameters.layoutVariation] - How far the pattern moves on the tile.
 * @param {number} [parameters.regionVariation] - How many border cells two regions trade.
 * @param {number} [parameters.detailVariation] - How much texture and how many accent cells.
 * @param {number} [parameters.paletteVariation] - How far the colors nothing fixes move.
 * @param {number} [parameters.minDiversity] - The least distance of a tile from the source and its siblings.
 * @param {Object} profile - A validated profile.
 * @returns {{variation:number,layoutVariation:number,regionVariation:number,detailVariation:number,paletteVariation:number,minDiversity:number}}
 * @throws {RangeError} On an unknown parameter or a value outside its bounds.
 */
export const floorParameters = (parameters = {}, profile) =>
  variationParameters(parameters, profile, { name: 'floor tile', variations: VARIATIONS });

/** The regions of a profile order that a template draws, lowest first. */
const orderOf = (template, profile) => profile.regionOrder.filter((region) => template.regionRoles[region]);

/** One tile frame of a layout and a plan, with its relief and accents. */
function drawTile(layout, { template, regionOrder, plan, seed, code, detail }) {
  const { width, height } = template.canvas;
  const random = (operatorId) => seededRandom(operatorSeed(seed, { operatorId, direction: code }));
  const { frame, contour } = paintLayout(layout, {
    width,
    height,
    plan,
    regionOrder,
    random: random('floor-tone'),
    detail,
  });
  return scatterAccents(frame, {
    layout,
    contour,
    lowest: regionOrder[0],
    accent: plan.accent,
    random: random('floor-accent'),
    detail,
  });
}

/** The opaque cells of each first frame, as the lowest region: the cells a recolored tile has. */
const ownedAs = (firstFrames, region) =>
  Object.fromEntries(
    Object.entries(firstFrames).map(([code, frame]) => [
      code,
      { [region]: frame.flatMap((row, y) => row.flatMap((cell, x) => (cell[3] > 0 ? [[x, y]] : []))) },
    ]),
  );

/**
 * The analysis that every tile of a batch shares.
 * @param {Object} context - {@link resolveProceduralContext}.
 * @returns {Object} The batch: the frames of the source render or the layout of the first frame of
 *   each template direction, the frames of each direction of the base item, and the signature the
 *   tiles are compared with.
 * @throws {RangeError} When the template leaves a cell of a direction empty: a floor fills its tile.
 */
export function prepareFloorBatch(context) {
  const { template, profile, source } = context;
  const { width } = template.canvas;
  const regionOrder = orderOf(template, profile);
  const basePlan = planPalette({ template, palette: { roles: {} }, seed: 0, variation: 0 });
  if (source.renderSource) {
    const rendered = framesByDirection(source.renderSource);
    const frames = Object.fromEntries(context.directions.map((code) => [code, rendered[code]]));
    const firstFrames = Object.fromEntries(Object.entries(frames).map(([code, [first]]) => [code, first]));
    return {
      context,
      frames,
      regionOrder,
      sourceBase: {},
      baseFrames: frames,
      sourceSignature: signatureOf({
        firstFrames,
        ownedByCode: ownedAs(firstFrames, regionOrder[0]),
        regionIds: profile.regionOrder,
        plan: basePlan,
      }),
    };
  }
  const layouts = Object.fromEntries(
    context.directions.map((code) => {
      const layout = layoutOf(template, code);
      if (layout.includes(null))
        throw new RangeError(`Genesis Template ${template.id} leaves cells of direction ${code} empty`);
      return [code, layout];
    }),
  );
  const firstFrames = Object.fromEntries(
    Object.entries(layouts).map(([code, layout]) => [
      code,
      drawTile(layout, { template, regionOrder, plan: basePlan, seed: 0, code, detail: 0 }).frame,
    ]),
  );
  return {
    context,
    layouts,
    regionOrder,
    sourceBase: {},
    baseFrames: Object.fromEntries(Object.entries(firstFrames).map(([code, frame]) => [code, [frame]])),
    sourceSignature: signatureOf({
      firstFrames,
      ownedByCode: Object.fromEntries(Object.entries(layouts).map(([code, layout]) => [code, ownedOf(layout, width)])),
      regionIds: profile.regionOrder,
      plan: basePlan,
    }),
  };
}

/** Why a layout breaks the bounds of its template: a share that moved too far, or a region cell alone. */
function layoutProblem(layout, reference, { width, height }) {
  const share = (cells, region) => cells.filter((value) => value === region).length / cells.length;
  for (const region of new Set(reference))
    if (Math.abs(share(layout, region) - share(reference, region)) > MAX_SHARE_SHIFT + 1e-9)
      return `region ${region} left its share`;
  const alone = layout.findIndex((region, cell) =>
    neighborsOf(cell, width, height).every((neighbor) => layout[neighbor] !== region),
  );
  return alone >= 0 ? `cell ${alone} stands alone in region ${layout[alone]}` : '';
}

/** The source tile in the tones of a plan, around the base of its lowest region. */
function recolorTile(batch, plan) {
  const tones = [
    ...new Set([
      plan.outline,
      ...Object.values(plan.regions).flatMap(({ shadow, base, highlight }) => [shadow, base, highlight]),
    ]),
  ];
  const framesByCode = Object.fromEntries(
    Object.entries(batch.frames).map(([code, frames]) => [
      code,
      frames.map((frame) => recolorFrame(frame, tones, plan.regions[batch.regionOrder[0]])),
    ]),
  );
  const firstFrames = Object.fromEntries(Object.entries(framesByCode).map(([code, [first]]) => [code, first]));
  return {
    framesByCode,
    ownedByCode: ownedAs(firstFrames, batch.regionOrder[0]),
    plan,
    metrics: {
      directions: Object.keys(framesByCode).length,
      frames: Object.values(framesByCode).flat().length,
      recolored: true,
    },
  };
}

/** One tile of a seed, or the reason the seed gave none. */
function buildTile(batch, seed, parameters, palette) {
  const { template, profile } = batch.context;
  const { width, height } = template.canvas;
  const plan = planPalette({ template, palette, seed, variation: parameters.paletteVariation });
  if (batch.frames) return recolorTile(batch, plan);
  const metrics = { directions: 0, frames: 0, shift: [0, 0], traded: 0, accents: 0 };
  const framesByCode = {};
  const ownedByCode = {};
  for (const [code, reference] of Object.entries(batch.layouts)) {
    const random = (operatorId) => seededRandom(operatorSeed(seed, { operatorId, direction: code }));
    const move = random('floor-shift');
    const reach = parameters.layoutVariation;
    const [dx, dy] = [Math.floor(move() * width * reach), Math.floor(move() * height * reach)];
    const { layout, traded } = tradeBorders(shiftLayout(reference, { width, height, dx, dy }), {
      width,
      height,
      pairs: profile.constraints.deformablePairs,
      protectedRegions: profile.constraints.protectedRegions,
      reference,
      maxShift: MAX_SHARE_SHIFT,
      random: random('floor-trade'),
      strength: parameters.regionVariation,
    });
    const problem = layoutProblem(layout, reference, template.canvas);
    if (problem) return { reason: `direction ${code}: ${problem}` };
    const { frame, accents } = drawTile(layout, {
      template,
      regionOrder: batch.regionOrder,
      plan,
      seed,
      code,
      detail: parameters.detailVariation,
    });
    framesByCode[code] = [frame];
    ownedByCode[code] = ownedOf(layout, width);
    Object.assign(metrics, {
      directions: metrics.directions + 1,
      frames: metrics.frames + 1,
      shift: [dx, dy],
      traded: metrics.traded + traded,
      accents: metrics.accents + accents,
    });
  }
  return { framesByCode, ownedByCode, plan, metrics };
}

/**
 * One floor tile. A recolored tile is themed, not new, so it never fails the diversity check.
 * @param {Object} batch - {@link prepareFloorBatch} of the context.
 * @param {Object} params
 * @param {string} params.itemId - The item id of the tile.
 * @param {number} params.seed - The seed of the tile: try 0 uses it, the next tries derive from it.
 * @param {Object} params.parameters - {@link floorParameters} of the run.
 * @param {Array<{id:string,signature:Object}>} [params.siblings] - The accepted siblings to differ from.
 * @param {{roles:Object}} params.palette - {@link candidatePalette} of the tile.
 * @returns {{data:Object,renderSource:Object,seed:number,tries:number,metrics:Object,diversity:Object}} The tile: its
 *   definition content, its render, the seed that made it, the tries it took, what the operators did and its diversity.
 * @throws {RangeError} When no try passes the checks.
 */
export function generateFloorTile(batch, { itemId, seed, parameters, palette, siblings = [] }) {
  const { source, template, profile } = batch.context;
  const references = [{ id: 'source', signature: batch.sourceSignature }, ...siblings];
  const rejections = [];
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const tried = trySeed(seed, attempt);
    const built = buildTile(batch, tried, parameters, palette);
    if (built.reason) {
      rejections.push(built.reason);
      continue;
    }
    const signature = signatureOf({
      firstFrames: Object.fromEntries(Object.entries(built.framesByCode).map(([code, [frame]]) => [code, frame])),
      ownedByCode: built.ownedByCode,
      regionIds: profile.regionOrder,
      plan: built.plan,
    });
    const diversity = diversityAgainst(signature, references);
    if (!batch.frames && diversity.score < parameters.minDiversity) {
      rejections.push(`diversity ${diversity.score.toFixed(3)} is below ${parameters.minDiversity}`);
      continue;
    }
    return {
      data: {
        item: { id: itemId, type: source.itemType, description: source.description, activable: source.activable },
        stats: { ...source.stats },
      },
      renderSource: sourceFromDirectionFrames({
        framesByCode: built.framesByCode,
        frameDurationMs: source.renderSource?.frameDurationMs ?? template.frameDurationMs,
      }),
      seed: tried,
      tries: attempt + 1,
      metrics: { ...built.metrics, tries: attempt + 1, rejectedTries: attempt },
      diversity: { ...diversity, signature },
    };
  }
  throw new RangeError(`No tile passed its checks in ${MAX_TRIES} tries: ${rejections.join('; ')}`);
}

/**
 * What stops a render from serving as a floor tile: a cell that is not fully opaque shows what lies
 * under the floor.
 * @param {Object} renderSource - A decoded render source.
 * @returns {string[]} One line per problem; empty when the render fits.
 */
export function floorRenderProblems(renderSource) {
  const { palette, frames } = renderSource;
  const clear = palette.map((hex) => hexToRgba(hex)[3] < 255);
  const problems = [];
  for (const [keyframe, list] of Object.entries(frames))
    list.forEach((pixels, index) => {
      const gaps = pixels.reduce((sum, color) => sum + (clear[color] ? 1 : 0), 0);
      if (gaps > 0) problems.push(`frame ${index} of ${keyframe} has ${gaps} cells that are not opaque`);
    });
  return problems;
}
