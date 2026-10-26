/**
 * The sprite variant generator: skins and portals. It reads a resolved context and the palette of a
 * candidate, never another source, and gives sprites of the canvas, directions and frame counts of
 * the source: from its render, or from its Genesis Template when it has none. It colors and shapes;
 * the item id, the description, the activable flag and the stats of a variant are those of its source.
 *
 * A variant is a pipeline of operators over each frame: region fill (template) or palette map
 * (render), facing features and hair growth where the profile gives the facing rules, region
 * deformation, silhouette mutation and a detail pass. Each frame takes the regions of the template
 * frame of its direction and index, placed on the render. Every operator draws from the seed of the
 * facing, and the outline of the protected regions stays, so the frames of a facing change alike.
 * A variant is then checked: its shape against the base, its protected cells, and how far it stands
 * from the source and from the siblings accepted before it. A variant that fails a check is
 * rejected and generated again from the next seed of the try, up to {@link MAX_TRIES}.
 *
 * The analysis of a source (silhouettes, outlines, regions, distance fields, dominant colors and
 * the signature of the source) is the same for every variant of a batch: {@link prepareSpriteBatch}
 * computes it once. Pure functions.
 *
 * @module src/projects/cyberia/procedural/generators/sprite/generator.js
 */
import {
  framesByDirection,
  sourceFromDirectionFrames,
  rgbaToHex,
} from '../../../../../client/components/objectlayer-studio/RenderSource.js';
import { facingOf } from '../../../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { seededRandom } from '../../../../../client/components/objectlayer-studio/PixelRegion.js';
import { analyzeFrame } from '../../core/frame-analysis.js';
import { cellsOfMask, dilate, maskOfCells } from '../../core/morphology.js';
import { shapeOf, validateShape, mutateFrameShape } from '../../core/frame-mutation.js';
import { diversityAgainst, signatureOf } from '../../core/diversity.js';
import { variationParameters } from '../../core/parameters.js';
import { HAIR_STYLE_IDS, growHair } from './hair-growth.js';
import { detailPass, featurePass, paletteMap, paletteMaps, regionDeformation, regionFill } from './operators.js';
import { planPalette } from '../../palettes/resolver.js';
import { drawTemplate, placeRegions, protectedCells, regionsOf } from '../../templates.js';
import { operatorSeed, trySeed } from '../../core/seed.js';

/** The tries a variant gets to pass its checks. */
const MAX_TRIES = 5;
const VARIATIONS = Object.freeze(['silhouette', 'region', 'hair', 'detail', 'palette']);

/**
 * The parameters of a run, checked against a profile and completed. `variation` is the one
 * high-level control: it sets every granular variation the request leaves out.
 * @param {Object} [parameters]
 * @param {number} [parameters.variation] - 0 to 1; sets the five granular variations.
 * @param {number} [parameters.silhouetteVariation] - The contour mutation budget.
 * @param {number} [parameters.regionVariation] - How far the borders of two regions move.
 * @param {number} [parameters.hairVariation] - How much hair grows.
 * @param {number} [parameters.detailVariation] - How many detail cells and optional features.
 * @param {number} [parameters.paletteVariation] - How far the colors nothing fixes move.
 * @param {string} [parameters.hairStyle] - `auto` or a key of the hair styles.
 * @param {number} [parameters.minDiversity] - The least distance of a variant from the source and its siblings.
 * @param {Object} profile - A validated profile.
 * @returns {{variation:number,silhouetteVariation:number,regionVariation:number,hairVariation:number,detailVariation:number,paletteVariation:number,hairStyle:string,minDiversity:number}}
 * @throws {RangeError} On an unknown parameter or a value outside its bounds.
 */
export function spriteParameters(parameters = {}, profile) {
  const checked = variationParameters(parameters, profile, {
    name: 'sprite variant',
    variations: VARIATIONS,
    extra: ['hairStyle'],
  });
  const hairStyle = parameters.hairStyle ?? 'auto';
  if (hairStyle !== 'auto' && !HAIR_STYLE_IDS.includes(hairStyle))
    throw new RangeError(`hairStyle must be auto or one of ${HAIR_STYLE_IDS.join(', ')}`);
  return { ...checked, hairStyle };
}

const keyOf = (cells) => new Set(cells.map(([x, y]) => `${x},${y}`));

const hexOf = (rgba) => rgbaToHex([...rgba.slice(0, 3), 255]).slice(0, 7);

/** The most used opaque color of some regions in the interior of their frames, as `#rrggbb`. */
function dominantColor(entries, regionIds) {
  const counts = new Map();
  for (const { frame, analysis, owned } of entries)
    for (const [x, y] of regionIds.flatMap((regionId) => owned[regionId] ?? []))
      if (analysis.interior[y * analysis.width + x] && frame[y][x][3] > 0) {
        const hex = hexOf(frame[y][x]);
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
  return [...counts].sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))[0]?.[0];
}

/**
 * The analysis of a source that every variant of a batch shares.
 * @param {Object} context - {@link resolveProceduralContext}.
 * @returns {Object} The batch: directions with their facing, rules and frames, each frame with its
 *   analysis, its regions and its protected cells; the dominant colors of the source, the first
 *   frame of each direction of the base item (the source render, or the template in its colors),
 *   and the signature the variants are compared with.
 */
export function prepareSpriteBatch(context) {
  const { template, profile, source } = context;
  const rendered = source.renderSource ? framesByDirection(source.renderSource) : null;
  const directions = {};
  const entries = [];
  for (const code of context.directions) {
    const drawn = rendered?.[code] ?? template.directions[code].map((_, index) => drawTemplate(template, code, index));
    const frames = drawn.map((frame, index) => {
      const analysis = analyzeFrame(frame);
      const regions = regionsOf(template, code, index);
      const owned = rendered ? placeRegions(regions, analysis) : regions;
      const protectedList = protectedCells(owned, profile);
      return { frame, analysis, owned, protectedList, steady: steadyCells(protectedList, analysis) };
    });
    const facing = facingOf(code);
    const rules = profile.directionRules[facing];
    directions[code] = { facing, rule: rules ? { ...rules, facing } : null, frames };
    entries.push(...frames);
  }
  const sourceBase = rendered
    ? Object.fromEntries(
        Object.entries(template.roles)
          .map(([role, { regions }]) => [role, dominantColor(entries, regions)])
          .filter(([, color]) => color),
      )
    : {};
  const basePlan = planPalette({ template, palette: { roles: {} }, sourceBase, seed: 0, variation: 0 });
  const regionIds = profile.regionOrder;
  const baseFrames = Object.fromEntries(
    Object.entries(directions).map(([code, { frames }]) => [
      code,
      frames.map(({ frame, analysis, owned }) =>
        rendered ? frame : regionFill(frame, { analysis, owned, plan: basePlan }),
      ),
    ]),
  );
  return {
    context,
    directions,
    entries,
    sourceBase,
    baseFrames,
    sourceSignature: signatureOf({
      firstFrames: Object.fromEntries(Object.entries(baseFrames).map(([code, frames]) => [code, frames[0]])),
      ownedByCode: ownedByCode(directions),
      regionIds,
      plan: basePlan,
    }),
  };
}

/**
 * The cells a contour move leaves where they are: the protected cells and the silhouette cells next
 * to them, so the body keeps its outline in every frame of a facing.
 */
function steadyCells(protectedList, { width, height, mask }) {
  const ring = dilate(maskOfCells(protectedList, width, height), width, height);
  return cellsOfMask(
    ring.map((set, cell) => (set && mask[cell] ? 1 : 0)),
    width,
  );
}

/** The regions of the first frame of each direction, as a signature reads them. */
const ownedByCode = (directions) =>
  Object.fromEntries(Object.entries(directions).map(([code, { frames }]) => [code, frames[0].owned]));

/** Why a variant frame does not keep the shape of its base and every protected cell; empty when it does. */
function frameProblem({ frame: base, protectedList }, frame, shape) {
  const tolerance = { sameCount: false, boxGrowth: shape.maxBoxGrowth, centroidDrift: shape.maxCentroidDrift };
  if (!validateShape(shapeOf(base), shapeOf(frame), tolerance)) return 'its shape left the bounds of the profile';
  const moved = protectedList.find(([x, y]) => base[y][x][3] > 0 !== frame[y][x][3] > 0);
  return moved ? `protected cell [${moved}] changed` : '';
}

/** One variant of a seed, or the reason the seed gave none. */
function buildVariant(batch, seed, parameters, palette) {
  const { context } = batch;
  const { template, profile } = context;
  const plan = planPalette({
    template,
    palette,
    sourceBase: batch.sourceBase,
    seed,
    variation: parameters.paletteVariation,
  });
  const styleRandom = seededRandom(operatorSeed(seed, { operatorId: 'hair-style' }));
  const hairStyle =
    parameters.hairStyle === 'auto'
      ? HAIR_STYLE_IDS[Math.floor(styleRandom() * HAIR_STYLE_IDS.length)]
      : parameters.hairStyle;
  const maps = context.source.renderSource ? paletteMaps(batch.entries, plan) : null;
  const metrics = {
    directions: 0,
    frames: 0,
    accepted: 0,
    rejected: 0,
    hairAdded: 0,
    deformed: 0,
    features: 0,
    hairStyle,
  };
  const framesByCode = {};

  for (const [code, direction] of Object.entries(batch.directions)) {
    const { rule } = direction;
    framesByCode[code] = [];
    for (const [index, base] of direction.frames.entries()) {
      const { owned, protectedList, steady } = base;
      const frozen = keyOf(protectedList);
      const facingSeed = (operatorId, regionId) =>
        operatorSeed(seed, { operatorId, direction: direction.facing, regionId });
      let frame = maps
        ? paletteMap(base.frame, { analysis: base.analysis, owned, maps })
        : regionFill(base.frame, { analysis: base.analysis, owned, plan });
      let marks = [];
      if (rule) {
        ({ frame, marks } = featurePass(frame, {
          analysis: base.analysis,
          owned,
          rule,
          plan,
          seed: facingSeed('direction-feature'),
          detail: parameters.detailVariation,
        }));
        if (owned.hair && owned.head) {
          const grown = growHair(frame, {
            analysis: analyzeFrame(frame),
            hairCells: owned.hair,
            headCells: owned.head,
            frozen,
            rule,
            style: hairStyle,
            plan,
            seed: facingSeed('hair-growth'),
            strength: parameters.hairVariation,
          });
          frame = grown.frame;
          metrics.hairAdded += grown.added;
        }
      }
      const pairs = profile.constraints.deformablePairs;
      const deformed = regionDeformation(frame, {
        analysis: analyzeFrame(frame),
        owned,
        pairs,
        frozen,
        plan,
        seed: facingSeed('region-deformation'),
        strength: parameters.regionVariation,
      });
      frame = deformed.frame;
      metrics.deformed += deformed.changed;
      const mutated = mutateFrameShape(frame, {
        factor: parameters.silhouetteVariation,
        seed: facingSeed('silhouette-mutation'),
        frozen: steady,
      });
      frame = mutated.frame;
      metrics.accepted += mutated.accepted;
      metrics.rejected += mutated.rejected;
      metrics.features += marks.length;
      frame = detailPass(frame, {
        analysis: analyzeFrame(frame),
        owned,
        frozen: new Set([...frozen, ...keyOf(marks)]),
        plan,
        seedOf: (regionId) => facingSeed('detail', regionId),
        detail: parameters.detailVariation,
      });
      const problem = frameProblem(base, frame, profile.constraints.shape);
      if (problem) return { reason: `frame ${index} of direction ${code}: ${problem}` };
      framesByCode[code].push(frame);
      metrics.frames++;
    }
    metrics.directions++;
  }
  return { framesByCode, plan, metrics };
}

/**
 * One sprite variant.
 * @param {Object} batch - {@link prepareSpriteBatch} of the context.
 * @param {Object} params
 * @param {string} params.itemId - The item id of the variant.
 * @param {number} params.seed - The seed of the variant: try 0 uses it, the next tries derive from it.
 * @param {Object} params.parameters - {@link spriteParameters} of the run.
 * @param {Array<{id:string,signature:Object}>} [params.siblings] - The accepted siblings to differ from.
 * @param {{roles:Object}} params.palette - {@link candidatePalette} of the variant.
 * @returns {{data:Object,renderSource:Object,seed:number,tries:number,metrics:Object,diversity:Object}} The variant: its
 *   definition content, its render, the seed that made it, the tries it took, what the operators did and its diversity.
 * @throws {RangeError} When no try passes the checks.
 */
export function generateSpriteVariant(batch, { itemId, seed, parameters, palette, siblings = [] }) {
  const { source, template, profile } = batch.context;
  const references = [{ id: 'source', signature: batch.sourceSignature }, ...siblings];
  const rejections = [];
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const tried = trySeed(seed, attempt);
    const built = buildVariant(batch, tried, parameters, palette);
    if (built.reason) {
      rejections.push(built.reason);
      continue;
    }
    const signature = signatureOf({
      firstFrames: Object.fromEntries(Object.entries(built.framesByCode).map(([code, frames]) => [code, frames[0]])),
      ownedByCode: ownedByCode(batch.directions),
      regionIds: profile.regionOrder,
      plan: built.plan,
    });
    const diversity = diversityAgainst(signature, references);
    if (diversity.score < parameters.minDiversity) {
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
  throw new RangeError(`No variant passed its checks in ${MAX_TRIES} tries: ${rejections.join('; ')}`);
}
