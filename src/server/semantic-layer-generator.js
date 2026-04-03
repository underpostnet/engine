/**
 * Semantic Layer Generator for Cyberia Online — Router / Dispatcher.
 *
 * This module is the public API surface.  It:
 *   1. Owns the semantic registry (registerSemantic / lookupSemantic).
 *   2. Provides the shared utility functions used by category submodules.
 *   3. Implements the default shape/noise-field generation pipeline
 *      (generateFrame / generateMultiFrame).
 *   4. Delegates to descriptor-attached custom generators when present
 *      (e.g. skin uses template-based pixel painting via customMultiFrameGenerator).
 *   5. Loads category submodules at initialisation:
 *        • semantic-layer-generator-floor.js — all floor-* descriptors
 *        • semantic-layer-generator-skin.js  — skin-* descriptors
 *
 * @module src/server/semantic-layer-generator.js
 * @namespace SemanticLayerGenerator
 */

import crypto from 'crypto';

import { createRng, seedToInt, createNoise2D, generateShape, listShapes } from './shape-generator.js';
import { loggerFactory } from './logger.js';

import { registerFloorSemantics } from './semantic-layer-generator-floor.js';
import { registerSkinSemantics } from './semantic-layer-generator-skin.js';

const logger = loggerFactory(import.meta);

/* ═══════════════════════════════════════════════════════════════════════════
 *  DETERMINISTIC HASHING
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Produces a deterministic 32-bit integer hash from an arbitrary string.
 * @param {string} str
 * @returns {number}
 * @memberof SemanticLayerGenerator
 */
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Derives a deterministic UUID v4 from an arbitrary seed string.
 * @param {string} seed
 * @returns {string}
 * @memberof SemanticLayerGenerator
 */
function seedToUUIDv4(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

/**
 * Derives a per-layer seed.
 * @param {string} seed
 * @param {string} itemId
 * @param {string} layerKey
 * @returns {number}
 * @memberof SemanticLayerGenerator
 */
function deriveLayerSeed(seed, itemId, layerKey) {
  return hashString(`${seed}:${itemId}:${layerKey}`);
}

/**
 * Derives a per-frame seed.
 * @param {number} layerSeed
 * @param {number} frameIndex
 * @returns {number}
 * @memberof SemanticLayerGenerator
 */
function deriveFrameSeed(layerSeed, frameIndex) {
  return hashString(`${layerSeed}:${frameIndex}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SEMANTIC REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} SemanticDescriptor
 * @property {string[]}               semanticTags              Conceptual tags.
 * @property {number[][]}             paletteHints              RGBA palette colours.
 * @property {Object<string,number>}  preferredShapes           Shape key → weight.
 * @property {Object<string,LayerSpec>} layers                  Named layer specs.
 * @property {string}                 itemType                  floor | skin | weapon | skill | coin
 * @property {Function}               [customMultiFrameGenerator] Overrides the default multi-frame pipeline.
 * @memberof SemanticLayerGenerator
 */

/**
 * @typedef {Object} LayerSpec
 * @property {string}   generator          'shape' | 'noise-field' | 'template-zone'
 * @property {string[]} [shapes]
 * @property {number}   [count]
 * @property {number}   [scaleVariance]
 * @property {number}   [rotationVariance]
 * @property {number}   [colorShift]
 * @property {number}   [jitter]
 * @property {number}   [noiseLevel]
 * @property {number}   [detailLevel]
 * @property {number}   [sparsity]
 * @property {number}   [frameJitter]
 * @property {number}   [frameRotation]
 * @property {number}   [frameScale]
 * @memberof SemanticLayerGenerator
 */

/**
 * Global semantic registry keyed by item-id prefix.
 * @type {Object<string, SemanticDescriptor>}
 */
const semanticRegistry = {};

/**
 * Registers a semantic descriptor for an item-id prefix.
 * @param {string} prefix
 * @param {SemanticDescriptor} descriptor
 * @memberof SemanticLayerGenerator
 */
export function registerSemantic(prefix, descriptor) {
  semanticRegistry[prefix] = descriptor;
}

/**
 * Looks up the best-matching semantic descriptor for an item-id.
 * Tries exact match first, then longest prefix match.
 * @param {string} itemId
 * @returns {SemanticDescriptor|null}
 * @memberof SemanticLayerGenerator
 */
export function lookupSemantic(itemId) {
  if (semanticRegistry[itemId]) return semanticRegistry[itemId];
  let best = null;
  let bestLen = 0;
  for (const prefix of Object.keys(semanticRegistry)) {
    if (itemId.startsWith(prefix) && prefix.length > bestLen) {
      best = semanticRegistry[prefix];
      bestLen = prefix.length;
    }
  }
  return best;
}

/* ── Load category submodules at startup ────────────────────────────────── */
registerFloorSemantics(registerSemantic);
registerSkinSemantics(registerSemantic);

/* ═══════════════════════════════════════════════════════════════════════════
 *  COLOR UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Picks a palette color deterministically from the hint palette.
 * @param {number[][]} palette
 * @param {function():number} rng
 * @param {number} colorShift
 * @returns {number[]} RGBA array.
 * @memberof SemanticLayerGenerator
 */
function pickColor(palette, rng, colorShift = 0) {
  const idx = Math.floor(rng() * palette.length);
  const base = [...palette[idx]];
  if (colorShift > 0) {
    for (let i = 0; i < 3; i++) {
      base[i] = Math.max(0, Math.min(255, base[i] + Math.round((rng() * 2 - 1) * colorShift)));
    }
  }
  return base;
}

/**
 * Clamp an integer value between min and max inclusive.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  WEIGHTED SHAPE SELECTION
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Picks a shape key from candidate list, weighted by the descriptor's preferredShapes.
 * @param {string[]} candidates
 * @param {Object<string,number>} weights
 * @param {function():number} rng
 * @returns {string}
 * @memberof SemanticLayerGenerator
 */
function pickShape(candidates, weights, rng) {
  const available = listShapes();
  const valid = candidates.filter((c) => available.includes(c));
  if (valid.length === 0) return available[Math.floor(rng() * available.length)];
  const w = valid.map((k) => weights[k] ?? 1);
  const total = w.reduce((s, v) => s + v, 0);
  let r = rng() * total;
  for (let i = 0; i < valid.length; i++) {
    r -= w[i];
    if (r <= 0) return valid[i];
  }
  return valid[valid.length - 1];
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  FRAME MATRIX GENERATION
 * ═══════════════════════════════════════════════════════════════════════════ */

const GRID_DIM = 24;

/**
 * Generates a noise-field base layer as a 24×24 frame matrix.
 * @memberof SemanticLayerGenerator
 */
function generateNoiseFieldLayer(palette, layerSeedInt, frameIndex, spec, density) {
  const frameSeedInt = deriveFrameSeed(layerSeedInt, frameIndex);
  const rng = createRng(frameSeedInt);
  const noise = createNoise2D(createRng(layerSeedInt));

  const colors = [];
  const frameMatrix = [];

  const baseColors = [];
  const colorRng = createRng(layerSeedInt + 7);
  for (let i = 0; i < Math.min(palette.length, 4); i++) {
    baseColors.push(pickColor(palette, colorRng, spec.colorShift));
  }
  const colorIndices = baseColors.map((c) => {
    colors.push(c);
    return colors.length - 1;
  });

  const noiseFreq = 0.15 + spec.noiseLevel * 0.3;
  const frameOffsetX = frameIndex * 0.05;
  const frameOffsetY = frameIndex * 0.03;

  for (let y = 0; y < GRID_DIM; y++) {
    const row = [];
    for (let x = 0; x < GRID_DIM; x++) {
      const n = noise((x + frameOffsetX) * noiseFreq, (y + frameOffsetY) * noiseFreq);
      const normalized = (n + 1) / 2;
      const idx = Math.min(colorIndices.length - 1, Math.floor(normalized * colorIndices.length));
      row.push(colorIndices[idx]);
    }
    frameMatrix.push(row);
  }

  return { frameMatrix, colors };
}

/**
 * Stamps a parametric shape onto a frame matrix at a given position/scale.
 * @memberof SemanticLayerGenerator
 */
function stampShape(frameMatrix, colors, shapeKey, transform, color, noiseLevel, detailLevel, seed) {
  const gridSize = Math.max(4, Math.round(GRID_DIM * transform.scale));
  const result = generateShape(shapeKey, {
    intCoords: [gridSize, gridSize],
    noise: noiseLevel,
    rotation: transform.rotation,
    seed,
    count: Math.round(80 * detailLevel),
  });

  const existingIdx = colors.findIndex(
    (c) => c[0] === color[0] && c[1] === color[1] && c[2] === color[2] && c[3] === color[3],
  );
  let colorIdx;
  if (existingIdx >= 0) {
    colorIdx = existingIdx;
  } else {
    colors.push([...color]);
    colorIdx = colors.length - 1;
  }

  const offsetX = Math.round(transform.x * GRID_DIM - gridSize / 2);
  const offsetY = Math.round(transform.y * GRID_DIM - gridSize / 2);

  for (const pt of result.points) {
    const gx = pt.x + offsetX;
    const gy = pt.y + offsetY;
    if (gx >= 0 && gx < GRID_DIM && gy >= 0 && gy < GRID_DIM) {
      frameMatrix[gy][gx] = colorIdx;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  CORE GENERATION PIPELINE
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} GenerateLayerOptions
 * @property {string} itemId
 * @property {string} seed
 * @property {number} [frameIndex=0]
 * @property {number} [count=3]
 * @property {number} [density=0.5]
 * @memberof SemanticLayerGenerator
 */

/**
 * @typedef {Object} GeneratedLayer
 * @property {string}     layerId
 * @property {string}     layerKey
 * @property {Object[]}   keys
 * @property {number[][]} frameMatrix
 * @property {number[][]} colors
 * @memberof SemanticLayerGenerator
 */

/**
 * @typedef {Object} GenerationResult
 * @property {string}         itemId
 * @property {string}         seed
 * @property {number}         frameIndex
 * @property {GeneratedLayer[]} layers
 * @property {number[][]}     compositeFrameMatrix
 * @property {number[][]}     compositeColors
 * @memberof SemanticLayerGenerator
 */

/**
 * Generates all semantic layers for a single frame of an item.
 *
 * If the descriptor provides `customMultiFrameGenerator`, a stub result is
 * returned — use `generateMultiFrame` for those descriptors.
 *
 * @param {GenerateLayerOptions} options
 * @returns {GenerationResult}
 * @memberof SemanticLayerGenerator
 */
export function generateFrame(options) {
  const { itemId, seed, frameIndex = 0, count = 3, density = 0.5 } = options;

  const descriptor = lookupSemantic(itemId);
  if (!descriptor) {
    throw new Error(
      `No semantic descriptor found for item-id "${itemId}". ` +
        `Available prefixes: ${Object.keys(semanticRegistry).join(', ')}`,
    );
  }

  // Descriptors with a custom multi-frame generator: return a transparent stub.
  if (typeof descriptor.customMultiFrameGenerator === 'function') {
    return {
      itemId,
      seed,
      frameIndex,
      layers: [],
      compositeFrameMatrix: Array.from({ length: GRID_DIM }, () => Array(GRID_DIM).fill(0)),
      compositeColors: [[0, 0, 0, 0]],
    };
  }

  const { paletteHints, preferredShapes, layers: layerSpecs } = descriptor;
  const layerKeys = Object.keys(layerSpecs);

  const compositeColors = [[0, 0, 0, 0]];
  const compositeMatrix = Array.from({ length: GRID_DIM }, () => Array(GRID_DIM).fill(0));
  const generatedLayers = [];

  for (const layerKey of layerKeys) {
    const spec = layerSpecs[layerKey];
    const layerSeedInt = deriveLayerSeed(seed, itemId, layerKey);
    const layerId = `${itemId}-${layerKey}`;

    if (spec.generator === 'noise-field') {
      const { frameMatrix, colors: layerColors } = generateNoiseFieldLayer(
        paletteHints,
        layerSeedInt,
        frameIndex,
        spec,
        density,
      );

      const colorMap = {};
      for (let ci = 0; ci < layerColors.length; ci++) {
        const c = layerColors[ci];
        let found = compositeColors.findIndex(
          (cc) => cc[0] === c[0] && cc[1] === c[1] && cc[2] === c[2] && cc[3] === c[3],
        );
        if (found < 0) {
          compositeColors.push([...c]);
          found = compositeColors.length - 1;
        }
        colorMap[ci] = found;
      }

      for (let y = 0; y < GRID_DIM; y++) {
        for (let x = 0; x < GRID_DIM; x++) {
          const mapped = colorMap[frameMatrix[y][x]];
          if (mapped !== undefined && mapped !== 0) compositeMatrix[y][x] = mapped;
        }
      }

      generatedLayers.push({
        layerId,
        layerKey,
        keys: [{ type: 'noise-field', noiseLevel: spec.noiseLevel }],
        frameMatrix,
        colors: layerColors,
      });
    } else if (spec.generator === 'shape') {
      const layerRng = createRng(layerSeedInt);
      const frameSeedInt = deriveFrameSeed(layerSeedInt, frameIndex);
      const frameRng = createRng(frameSeedInt);
      const frameNoise = createNoise2D(createRng(frameSeedInt + 3));

      const effectiveCount = Math.max(1, Math.round(spec.count * count * density));
      const layerEntries = [];
      const layerMatrix = Array.from({ length: GRID_DIM }, () => Array(GRID_DIM).fill(-1));
      const layerColors = [];

      for (let ei = 0; ei < effectiveCount; ei++) {
        if (layerRng() < spec.sparsity) continue;

        const shapeKey = pickShape(spec.shapes, preferredShapes, createRng(layerSeedInt + ei * 97));

        const baseRng = createRng(layerSeedInt + ei * 31 + 17);
        const baseX = baseRng();
        const baseY = baseRng();
        const baseScale = 0.15 + baseRng() * 0.25 + (baseRng() * 2 - 1) * spec.scaleVariance * 0.15;
        const baseRotation = (baseRng() * 2 - 1) * spec.rotationVariance;

        const fj = spec.frameJitter || 0;
        const fr = spec.frameRotation || 0;
        const fs = spec.frameScale || 0;

        const noiseX = frameNoise(ei * 2.5, frameIndex * 0.1) * fj;
        const noiseY = frameNoise(ei * 2.5 + 100, frameIndex * 0.1) * fj;
        const noiseRot = frameNoise(ei * 2.5 + 200, frameIndex * 0.1) * fr;
        const noiseScale = frameNoise(ei * 2.5 + 300, frameIndex * 0.1) * fs;

        const transform = {
          x: clamp(baseX + noiseX, 0.05, 0.95),
          y: clamp(baseY + noiseY, 0.05, 0.95),
          scale: Math.max(0.05, baseScale + noiseScale),
          rotation: baseRotation + noiseRot,
        };

        const colorRng = createRng(layerSeedInt + ei * 53 + 7);
        const baseColor = pickColor(paletteHints, colorRng, spec.colorShift);
        const frameColorShift = Math.round(frameNoise(ei * 3.7 + 400, frameIndex * 0.08) * 3);
        const color = baseColor.map((ch, ci) => (ci < 3 ? clamp(ch + frameColorShift, 0, 255) : ch));

        const shapeSeed = `${seed}:${itemId}:${layerKey}:${ei}`;

        stampShape(
          compositeMatrix, compositeColors, shapeKey, transform, color,
          spec.noiseLevel * (spec.jitter + 0.5), spec.detailLevel, shapeSeed,
        );
        stampShape(
          layerMatrix, layerColors, shapeKey, transform, color,
          spec.noiseLevel * 0.5, spec.detailLevel, shapeSeed,
        );

        layerEntries.push({ type: 'shape', shapeKey, transform, color, shapeSeed });
      }

      generatedLayers.push({
        layerId,
        layerKey,
        keys: layerEntries,
        frameMatrix: layerMatrix,
        colors: layerColors,
      });
    }
    // 'template-zone' handled by customMultiFrameGenerator — skip here
  }

  return {
    itemId,
    seed,
    frameIndex,
    layers: generatedLayers,
    compositeFrameMatrix: compositeMatrix,
    compositeColors,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MULTI-FRAME GENERATION
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} MultiFrameResult
 * @property {string}         itemId
 * @property {string}         seed
 * @property {number}         frameCount
 * @property {GenerationResult[]} frames
 * @property {Object}         objectLayerRenderFramesData
 * @property {Object}         objectLayerData
 * @memberof SemanticLayerGenerator
 */

/**
 * Generates N consecutive frames for an item-id.
 *
 * If the matched descriptor provides `customMultiFrameGenerator`, it is invoked
 * directly and its result is returned unchanged — allowing category submodules
 * (e.g. skin) to fully control frame layout and direction assignment.
 *
 * @param {Object}  options
 * @param {string}  options.itemId
 * @param {string}  options.seed
 * @param {number}  [options.frameCount=1]
 * @param {number}  [options.startFrame=0]
 * @param {number}  [options.count=3]
 * @param {number}  [options.density=0.5]
 * @param {number}  [options.frameDuration=250]
 * @returns {MultiFrameResult}
 * @memberof SemanticLayerGenerator
 */
export function generateMultiFrame(options) {
  const { itemId, seed, frameCount = 1, startFrame = 0, count = 3, density = 0.5, frameDuration = 250 } = options;

  const descriptor = lookupSemantic(itemId);
  if (!descriptor) {
    throw new Error(
      `No semantic descriptor found for item-id "${itemId}". ` +
        `Available prefixes: ${Object.keys(semanticRegistry).join(', ')}`,
    );
  }

  // ── Dispatch to custom generator ─────────────────────────────────────────
  if (typeof descriptor.customMultiFrameGenerator === 'function') {
    return descriptor.customMultiFrameGenerator(options, descriptor);
  }

  // ── Default shape / noise-field pipeline ─────────────────────────────────
  const frames = [];
  for (let fi = 0; fi < frameCount; fi++) {
    frames.push(generateFrame({ itemId, seed, frameIndex: startFrame + fi, count, density }));
  }

  const globalColors = [[0, 0, 0, 0]];
  const frameMappings = [];

  for (const frame of frames) {
    const mapping = {};
    for (let ci = 0; ci < frame.compositeColors.length; ci++) {
      const c = frame.compositeColors[ci];
      let found = globalColors.findIndex(
        (gc) => gc[0] === c[0] && gc[1] === c[1] && gc[2] === c[2] && gc[3] === c[3],
      );
      if (found < 0) {
        globalColors.push([...c]);
        found = globalColors.length - 1;
      }
      mapping[ci] = found;
    }
    frameMappings.push(mapping);
  }

  const remappedFrames = frames.map((frame, fi) => {
    const mapping = frameMappings[fi];
    return frame.compositeFrameMatrix.map((row) => row.map((ci) => (mapping[ci] !== undefined ? mapping[ci] : 0)));
  });

  const objectLayerRenderFramesData = {
    frame_duration: frameDuration,
    is_stateless: descriptor.itemType === 'floor',
    frames: {},
    colors: globalColors,
  };

  const directionMappings = {
    floor: [['down_idle', 'none_idle', 'default_idle']],
    skin: [
      ['down_idle', 'none_idle', 'default_idle'],
      ['up_idle'],
      ['left_idle', 'up_left_idle', 'down_left_idle'],
      ['right_idle', 'up_right_idle', 'down_right_idle'],
    ],
    weapon: [['down_idle', 'none_idle', 'default_idle']],
    skill: [['down_idle', 'none_idle', 'default_idle']],
    coin: [['down_idle', 'none_idle', 'default_idle']],
  };

  const dirGroups = directionMappings[descriptor.itemType] || directionMappings.floor;
  for (const dirGroup of dirGroups) {
    for (const dirName of dirGroup) {
      objectLayerRenderFramesData.frames[dirName] = [...remappedFrames];
    }
  }

  const objectLayerData = {
    data: {
      item: {
        id: itemId,
        type: descriptor.itemType,
        description: `Procedurally generated ${descriptor.semanticTags.join(', ')} (seed: ${seed})`,
        activable: true,
      },
      stats: {
        effect: hashMod(seed + ':effect', 11),
        resistance: hashMod(seed + ':resistance', 11),
        agility: hashMod(seed + ':agility', 11),
        range: hashMod(seed + ':range', 11),
        intelligence: hashMod(seed + ':intelligence', 11),
        utility: hashMod(seed + ':utility', 11),
      },
      ledger: { type: 'OFF_CHAIN' },
      seed: seedToUUIDv4(seed + ':' + itemId),
    },
  };

  return {
    itemId,
    seed,
    frameCount,
    frames,
    objectLayerRenderFramesData,
    objectLayerData,
  };
}

/**
 * Deterministic modulo hash for stat generation.
 * @param {string} str
 * @param {number} mod
 * @returns {number}
 */
function hashMod(str, mod) {
  return ((hashString(str) % mod) + mod) % mod;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  EXPORTS
 * ═══════════════════════════════════════════════════════════════════════════ */

export { hashString, deriveLayerSeed, deriveFrameSeed, pickColor, pickShape, seedToUUIDv4, GRID_DIM, semanticRegistry };
