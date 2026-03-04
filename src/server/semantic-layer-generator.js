/**
 * Semantic Layer Generator for Cyberia Online.
 *
 * Produces semantically consistent object layers with controlled, reproducible
 * variation and short-term temporal coherence (consecutive frames stay consistent).
 *
 * Uses the shape-generator primitives (createRng, seedToInt, createNoise2D, generateShape)
 * and object-layer engine (createObjectLayerDocuments, buildImgFromTile) to produce
 * frame matrices that can be persisted to MongoDB / IPFS / static assets.
 *
 * @module src/server/semantic-layer-generator.js
 * @namespace SemanticLayerGenerator
 */

import crypto from 'crypto';

import { createRng, seedToInt, createNoise2D, generateShape, listShapes } from './shape-generator.js';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

/* ═══════════════════════════════════════════════════════════════════════════
 *  DETERMINISTIC HASHING
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Produces a deterministic 32-bit integer hash from an arbitrary string.
 * Used to derive per-layer and per-frame seeds.
 * @param {string} str
 * @returns {number}
 * @memberof SemanticLayerGenerator
 */
/**
 * Derives a deterministic UUID v4 from an arbitrary seed string.
 * Uses SHA-256 to hash the seed, then formats 16 bytes as a valid UUID v4
 * (version nibble = 4, variant bits = 10xx).
 * @param {string} seed
 * @returns {string} A valid UUID v4 string.
 * @memberof SemanticLayerGenerator
 */
function seedToUUIDv4(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  // Set version nibble (byte 6, high nibble) to 0100 (version 4)
  hash[6] = (hash[6] & 0x0f) | 0x40;
  // Set variant bits (byte 8, high 2 bits) to 10xx
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Derives a per-layer seed:  layerSeed = hash(seed + ':' + itemId + ':' + layerKey)
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
 * Derives a per-frame seed:  frameSeed = hash(layerSeed + ':' + frameIndex)
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
 *  Maps item-id prefixes to semantic descriptors that drive generation.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} SemanticDescriptor
 * @property {string[]} semanticTags      - Conceptual tags (e.g. ['sand','dune']).
 * @property {number[][]} paletteHints    - Array of RGBA palette colors.
 * @property {Object<string,number>} preferredShapes - Shape key → relative weight.
 * @property {Object<string,LayerSpec>} layers - Named layer specifications.
 * @property {string} itemType            - Object layer type (floor, skin, weapon…).
 * @memberof SemanticLayerGenerator
 */

/**
 * @typedef {Object} LayerSpec
 * @property {string}   generator       - 'shape' | 'noise-field' | 'sprite'
 * @property {string[]} shapes          - Candidate shape keys for this layer.
 * @property {number}   count           - Number of elements to place.
 * @property {number}   scaleVariance   - Max ± scale deviation (0..1).
 * @property {number}   rotationVariance- Max ± rotation deviation in degrees.
 * @property {number}   colorShift      - Max RGBA channel shift per element.
 * @property {number}   jitter          - Positional jitter amount (0..1).
 * @property {number}   noiseLevel      - Noise displacement applied to shapes.
 * @property {number}   detailLevel     - Point count multiplier for shapes.
 * @property {number}   sparsity        - Fraction of grid cells left empty (0..1).
 * @property {number}   [frameJitter]   - Per-frame positional wobble for temporal coherence.
 * @property {number}   [frameRotation] - Per-frame rotation wobble in degrees.
 * @property {number}   [frameScale]    - Per-frame scale wobble.
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
  // Longest prefix match
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

/* ── Built-in semantic descriptors ─────────────────────────────────────── */

registerSemantic('floor-desert', {
  semanticTags: ['sand', 'dune', 'arid', 'dry'],
  paletteHints: [
    [210, 180, 120, 255], // warm sand
    [194, 160, 100, 255], // darker sand
    [230, 205, 150, 255], // light sand
    [180, 140, 80, 255], // ochre
    [160, 120, 70, 255], // deep ochre
    [120, 90, 55, 255], // rock brown
    [100, 80, 50, 255], // shadow
    [240, 220, 175, 255], // highlight
  ],
  preferredShapes: { ellipse: 3, circle: 2, cactus: 1, star: 0.5 },
  itemType: 'floor',
  layers: {
    base: {
      generator: 'noise-field',
      shapes: ['ellipse'],
      count: 0,
      scaleVariance: 0,
      rotationVariance: 0,
      colorShift: 8,
      jitter: 0,
      noiseLevel: 0.3,
      detailLevel: 1,
      sparsity: 0,
      frameJitter: 0,
      frameRotation: 0,
      frameScale: 0,
    },
    dunes: {
      generator: 'shape',
      shapes: ['ellipse', 'circle'],
      count: 5,
      scaleVariance: 0.3,
      rotationVariance: 15,
      colorShift: 12,
      jitter: 0.08,
      noiseLevel: 0.15,
      detailLevel: 1.2,
      sparsity: 0.3,
      frameJitter: 0.005,
      frameRotation: 0.5,
      frameScale: 0.005,
    },
    rocks: {
      generator: 'shape',
      shapes: ['star', 'circle'],
      count: 3,
      scaleVariance: 0.4,
      rotationVariance: 45,
      colorShift: 15,
      jitter: 0.12,
      noiseLevel: 0.2,
      detailLevel: 1,
      sparsity: 0.5,
      frameJitter: 0.002,
      frameRotation: 0.3,
      frameScale: 0.003,
    },
    tufts: {
      generator: 'shape',
      shapes: ['cactus', 'star'],
      count: 2,
      scaleVariance: 0.25,
      rotationVariance: 20,
      colorShift: 10,
      jitter: 0.1,
      noiseLevel: 0.1,
      detailLevel: 0.8,
      sparsity: 0.6,
      frameJitter: 0.008,
      frameRotation: 1.0,
      frameScale: 0.006,
    },
  },
});

registerSemantic('floor-grass', {
  semanticTags: ['grass', 'meadow', 'green', 'earth'],
  paletteHints: [
    [80, 140, 60, 255], // base green
    [60, 120, 45, 255], // dark green
    [110, 170, 80, 255], // light green
    [90, 130, 55, 255], // mid green
    [130, 100, 65, 255], // earth
    [70, 110, 40, 255], // shadow green
    [150, 190, 100, 255], // highlight
    [100, 85, 50, 255], // dark earth
  ],
  preferredShapes: { ellipse: 3, circle: 2, heart: 0.5 },
  itemType: 'floor',
  layers: {
    base: {
      generator: 'noise-field',
      shapes: ['circle'],
      count: 0,
      scaleVariance: 0,
      rotationVariance: 0,
      colorShift: 10,
      jitter: 0,
      noiseLevel: 0.25,
      detailLevel: 1,
      sparsity: 0,
      frameJitter: 0,
      frameRotation: 0,
      frameScale: 0,
    },
    blades: {
      generator: 'shape',
      shapes: ['ellipse', 'heart'],
      count: 6,
      scaleVariance: 0.35,
      rotationVariance: 40,
      colorShift: 15,
      jitter: 0.1,
      noiseLevel: 0.12,
      detailLevel: 1.0,
      sparsity: 0.25,
      frameJitter: 0.01,
      frameRotation: 2.0,
      frameScale: 0.005,
    },
    patches: {
      generator: 'shape',
      shapes: ['circle', 'ellipse'],
      count: 3,
      scaleVariance: 0.3,
      rotationVariance: 30,
      colorShift: 12,
      jitter: 0.08,
      noiseLevel: 0.15,
      detailLevel: 0.9,
      sparsity: 0.4,
      frameJitter: 0.003,
      frameRotation: 0.5,
      frameScale: 0.003,
    },
  },
});

registerSemantic('floor-water', {
  semanticTags: ['water', 'ocean', 'wave', 'liquid'],
  paletteHints: [
    [40, 100, 180, 255], // deep blue
    [60, 130, 200, 255], // mid blue
    [90, 160, 220, 255], // light blue
    [120, 190, 230, 255], // highlight
    [30, 80, 150, 255], // dark blue
    [70, 140, 210, 255], // wave crest
    [150, 210, 240, 255], // foam
    [20, 60, 120, 255], // abyss
  ],
  preferredShapes: { ellipse: 3, circle: 2 },
  itemType: 'floor',
  layers: {
    base: {
      generator: 'noise-field',
      shapes: ['ellipse'],
      count: 0,
      scaleVariance: 0,
      rotationVariance: 0,
      colorShift: 12,
      jitter: 0,
      noiseLevel: 0.35,
      detailLevel: 1,
      sparsity: 0,
      frameJitter: 0,
      frameRotation: 0,
      frameScale: 0,
    },
    waves: {
      generator: 'shape',
      shapes: ['ellipse'],
      count: 4,
      scaleVariance: 0.3,
      rotationVariance: 10,
      colorShift: 18,
      jitter: 0.06,
      noiseLevel: 0.2,
      detailLevel: 1.2,
      sparsity: 0.2,
      frameJitter: 0.015,
      frameRotation: 1.5,
      frameScale: 0.008,
    },
    foam: {
      generator: 'shape',
      shapes: ['circle'],
      count: 3,
      scaleVariance: 0.5,
      rotationVariance: 0,
      colorShift: 10,
      jitter: 0.15,
      noiseLevel: 0.1,
      detailLevel: 0.7,
      sparsity: 0.5,
      frameJitter: 0.012,
      frameRotation: 0.5,
      frameScale: 0.01,
    },
  },
});

registerSemantic('floor-stone', {
  semanticTags: ['stone', 'rock', 'cobble', 'grey'],
  paletteHints: [
    [140, 140, 145, 255], // base grey
    [120, 118, 125, 255], // dark grey
    [165, 165, 170, 255], // light grey
    [100, 98, 105, 255], // shadow
    [180, 180, 185, 255], // highlight
    [90, 85, 80, 255], // dark rock
    [155, 150, 148, 255], // warm grey
    [110, 108, 115, 255], // cool grey
  ],
  preferredShapes: { circle: 3, ellipse: 2, star: 1, 'pixel-art': 0.5 },
  itemType: 'floor',
  layers: {
    base: {
      generator: 'noise-field',
      shapes: ['circle'],
      count: 0,
      scaleVariance: 0,
      rotationVariance: 0,
      colorShift: 6,
      jitter: 0,
      noiseLevel: 0.2,
      detailLevel: 1,
      sparsity: 0,
      frameJitter: 0,
      frameRotation: 0,
      frameScale: 0,
    },
    cobbles: {
      generator: 'shape',
      shapes: ['circle', 'ellipse', 'pixel-art'],
      count: 6,
      scaleVariance: 0.35,
      rotationVariance: 90,
      colorShift: 10,
      jitter: 0.06,
      noiseLevel: 0.15,
      detailLevel: 1.0,
      sparsity: 0.2,
      frameJitter: 0.001,
      frameRotation: 0.2,
      frameScale: 0.001,
    },
    cracks: {
      generator: 'shape',
      shapes: ['star'],
      count: 2,
      scaleVariance: 0.5,
      rotationVariance: 180,
      colorShift: 20,
      jitter: 0.1,
      noiseLevel: 0.25,
      detailLevel: 0.8,
      sparsity: 0.6,
      frameJitter: 0.0,
      frameRotation: 0.0,
      frameScale: 0.0,
    },
  },
});

registerSemantic('floor-lava', {
  semanticTags: ['lava', 'magma', 'fire', 'hot'],
  paletteHints: [
    [200, 50, 20, 255], // hot red
    [230, 100, 30, 255], // orange
    [255, 180, 50, 255], // bright yellow
    [160, 30, 10, 255], // dark red
    [80, 20, 10, 255], // cooled rock
    [50, 15, 8, 255], // dark crust
    [240, 140, 40, 255], // glow
    [120, 25, 12, 255], // mid lava
  ],
  preferredShapes: { circle: 3, ellipse: 2, cactus: 1 },
  itemType: 'floor',
  layers: {
    base: {
      generator: 'noise-field',
      shapes: ['circle'],
      count: 0,
      scaleVariance: 0,
      rotationVariance: 0,
      colorShift: 15,
      jitter: 0,
      noiseLevel: 0.4,
      detailLevel: 1,
      sparsity: 0,
      frameJitter: 0,
      frameRotation: 0,
      frameScale: 0,
    },
    flow: {
      generator: 'shape',
      shapes: ['ellipse', 'circle'],
      count: 5,
      scaleVariance: 0.35,
      rotationVariance: 25,
      colorShift: 20,
      jitter: 0.1,
      noiseLevel: 0.2,
      detailLevel: 1.1,
      sparsity: 0.2,
      frameJitter: 0.02,
      frameRotation: 2.0,
      frameScale: 0.01,
    },
    crust: {
      generator: 'shape',
      shapes: ['star', 'cactus'],
      count: 3,
      scaleVariance: 0.4,
      rotationVariance: 60,
      colorShift: 10,
      jitter: 0.08,
      noiseLevel: 0.15,
      detailLevel: 0.9,
      sparsity: 0.4,
      frameJitter: 0.005,
      frameRotation: 0.5,
      frameScale: 0.004,
    },
  },
});

registerSemantic('skin-', {
  semanticTags: ['character', 'body', 'humanoid'],
  paletteHints: [
    [180, 140, 110, 255],
    [160, 120, 90, 255],
    [200, 160, 130, 255],
    [140, 100, 70, 255],
    [100, 70, 50, 255],
    [60, 60, 80, 255],
    [80, 80, 100, 255],
    [220, 180, 150, 255],
  ],
  preferredShapes: { 'skull-bone': 2, circle: 2, ellipse: 1 },
  itemType: 'skin',
  layers: {
    body: {
      generator: 'shape',
      shapes: ['ellipse', 'circle'],
      count: 4,
      scaleVariance: 0.3,
      rotationVariance: 10,
      colorShift: 12,
      jitter: 0.05,
      noiseLevel: 0.1,
      detailLevel: 1.2,
      sparsity: 0.2,
      frameJitter: 0.003,
      frameRotation: 0.5,
      frameScale: 0.003,
    },
    detail: {
      generator: 'shape',
      shapes: ['skull-bone', 'star'],
      count: 2,
      scaleVariance: 0.2,
      rotationVariance: 5,
      colorShift: 8,
      jitter: 0.03,
      noiseLevel: 0.08,
      detailLevel: 1.5,
      sparsity: 0.5,
      frameJitter: 0.002,
      frameRotation: 0.3,
      frameScale: 0.002,
    },
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  COLOR UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Picks a palette color deterministically from the hint palette.
 * @param {number[][]} palette
 * @param {function():number} rng
 * @param {number} colorShift - Max channel deviation.
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
 * Falls back to uniform if no weights match.
 * @param {string[]} candidates
 * @param {Object<string,number>} weights
 * @param {function():number} rng
 * @returns {string}
 * @memberof SemanticLayerGenerator
 */
function pickShape(candidates, weights, rng) {
  // Filter to only shapes that actually exist in the shape registry
  const available = listShapes();
  const valid = candidates.filter((c) => available.includes(c));
  if (valid.length === 0) {
    // fallback to any available shape
    return available[Math.floor(rng() * available.length)];
  }
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
 *  Converts generated shape layers into a 24×24 frame_matrix compatible
 *  with the ObjectLayerEngine frame format.
 * ═══════════════════════════════════════════════════════════════════════════ */

const GRID_DIM = 24; // standard object layer grid (24 rows × 24 cols)

/**
 * Generates a noise-field base layer as a 24×24 frame matrix.
 * Uses low-frequency 2D noise seeded per-frame for temporal coherence.
 * @param {number[][]} palette
 * @param {number} layerSeedInt
 * @param {number} frameIndex
 * @param {LayerSpec} spec
 * @param {number} density
 * @returns {{frameMatrix: number[][], colors: number[][]}}
 * @memberof SemanticLayerGenerator
 */
function generateNoiseFieldLayer(palette, layerSeedInt, frameIndex, spec, density) {
  const frameSeedInt = deriveFrameSeed(layerSeedInt, frameIndex);
  const rng = createRng(frameSeedInt);
  const noise = createNoise2D(createRng(layerSeedInt)); // topology from layerSeed, not frameSeed

  const colors = [];
  const frameMatrix = [];

  // Pre-pick a small set of colors for the base
  const baseColors = [];
  const colorRng = createRng(layerSeedInt + 7); // stable color selection
  for (let i = 0; i < Math.min(palette.length, 4); i++) {
    baseColors.push(pickColor(palette, colorRng, spec.colorShift));
  }

  // Register base colors
  const colorIndices = baseColors.map((c) => {
    colors.push(c);
    return colors.length - 1;
  });

  const noiseFreq = 0.15 + spec.noiseLevel * 0.3;
  // Frame-level noise offset for smooth temporal variation
  const frameOffsetX = frameIndex * 0.05;
  const frameOffsetY = frameIndex * 0.03;

  for (let y = 0; y < GRID_DIM; y++) {
    const row = [];
    for (let x = 0; x < GRID_DIM; x++) {
      const n = noise((x + frameOffsetX) * noiseFreq, (y + frameOffsetY) * noiseFreq);
      // Map noise [-1,1] → color index
      const normalized = (n + 1) / 2; // 0..1
      const idx = Math.min(colorIndices.length - 1, Math.floor(normalized * colorIndices.length));
      row.push(colorIndices[idx]);
    }
    frameMatrix.push(row);
  }

  return { frameMatrix, colors };
}

/**
 * Stamps a parametric shape onto a frame matrix at a given position/scale.
 * @param {number[][]} frameMatrix  - Mutable 24×24 matrix.
 * @param {number[][]} colors       - Mutable color palette.
 * @param {string} shapeKey
 * @param {Object} transform        - { x, y, scale, rotation }
 * @param {number[]} color           - RGBA color for this stamp.
 * @param {number} noiseLevel
 * @param {number} detailLevel
 * @param {string} seed              - String seed for shape generation.
 * @memberof SemanticLayerGenerator
 */
function stampShape(frameMatrix, colors, shapeKey, transform, color, noiseLevel, detailLevel, seed) {
  // Generate shape using intCoords for pixel-level placement
  const gridSize = Math.max(4, Math.round(GRID_DIM * transform.scale));
  const result = generateShape(shapeKey, {
    intCoords: [gridSize, gridSize],
    noise: noiseLevel,
    rotation: transform.rotation,
    seed,
    count: Math.round(80 * detailLevel),
  });

  // Register color
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

  // Compute offset to center the shape at (transform.x, transform.y)
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
 * @property {string}  itemId       - The item identifier (e.g. 'floor-desert').
 * @property {string}  seed         - Master seed string (e.g. 'fx-42').
 * @property {number}  frameIndex   - Current frame index (0-based).
 * @property {number}  [count=3]    - Number of shape elements per layer (multiplier).
 * @property {number}  [density=0.5]- Overall density factor (0..1).
 * @memberof SemanticLayerGenerator
 */

/**
 * @typedef {Object} GeneratedLayer
 * @property {string}   layerId       - Composite id: <itemId>-<layerKey>.
 * @property {string}   layerKey      - The layer name (e.g. 'dunes', 'rocks').
 * @property {Object[]} keys          - Content entries placed in this layer.
 * @property {number[][]} frameMatrix - 24×24 color-index matrix.
 * @property {number[][]} colors      - Shared color palette.
 * @memberof SemanticLayerGenerator
 */

/**
 * @typedef {Object} GenerationResult
 * @property {string}   itemId
 * @property {string}   seed
 * @property {number}   frameIndex
 * @property {GeneratedLayer[]} layers
 * @property {number[][]} compositeFrameMatrix - Final composited 24×24 matrix.
 * @property {number[][]} compositeColors      - Final color palette.
 * @memberof SemanticLayerGenerator
 */

/**
 * Generates all semantic layers for a single frame of an item.
 *
 * Shape topology stays fixed across adjacent frames (determined by layerSeed);
 * only smooth per-frame transforms vary (derived from frameSeed + low-frequency noise).
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

  const { paletteHints, preferredShapes, layers: layerSpecs } = descriptor;
  const layerKeys = Object.keys(layerSpecs);

  // Composite frame matrix (start transparent — color index 0 will be transparent)
  const compositeColors = [[0, 0, 0, 0]]; // index 0 = transparent
  const compositeMatrix = Array.from({ length: GRID_DIM }, () => Array(GRID_DIM).fill(0));

  const generatedLayers = [];

  for (const layerKey of layerKeys) {
    const spec = layerSpecs[layerKey];
    const layerSeedInt = deriveLayerSeed(seed, itemId, layerKey);
    const layerId = `${itemId}-${layerKey}`;

    if (spec.generator === 'noise-field') {
      // ── Noise-field base layer ──
      const { frameMatrix, colors: layerColors } = generateNoiseFieldLayer(
        paletteHints,
        layerSeedInt,
        frameIndex,
        spec,
        density,
      );

      // Merge colors into composite palette
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

      // Stamp onto composite
      for (let y = 0; y < GRID_DIM; y++) {
        for (let x = 0; x < GRID_DIM; x++) {
          const mapped = colorMap[frameMatrix[y][x]];
          if (mapped !== undefined && mapped !== 0) {
            compositeMatrix[y][x] = mapped;
          }
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
      // ── Shape element layer ──
      const layerRng = createRng(layerSeedInt);
      const frameSeedInt = deriveFrameSeed(layerSeedInt, frameIndex);
      const frameRng = createRng(frameSeedInt);
      const frameNoise = createNoise2D(createRng(frameSeedInt + 3));

      const effectiveCount = Math.max(1, Math.round(spec.count * count * density));
      const layerEntries = [];

      // Frame matrix for this layer alone (for metadata)
      const layerMatrix = Array.from({ length: GRID_DIM }, () => Array(GRID_DIM).fill(-1));
      const layerColors = [];

      for (let ei = 0; ei < effectiveCount; ei++) {
        // Sparsity check — deterministic per element
        if (layerRng() < spec.sparsity) continue;

        // ── Shape selection (stable across frames) ──
        const shapeKey = pickShape(spec.shapes, preferredShapes, createRng(layerSeedInt + ei * 97));

        // ── Base transform (stable across frames — from layerSeed) ──
        const baseRng = createRng(layerSeedInt + ei * 31 + 17);
        const baseX = baseRng();
        const baseY = baseRng();
        const baseScale = 0.15 + baseRng() * 0.25 + (baseRng() * 2 - 1) * spec.scaleVariance * 0.15;
        const baseRotation = (baseRng() * 2 - 1) * spec.rotationVariance;

        // ── Per-frame smooth perturbation (temporal coherence) ──
        const fj = spec.frameJitter || 0;
        const fr = spec.frameRotation || 0;
        const fs = spec.frameScale || 0;

        // Low-frequency noise indexed by element position for smooth frame-to-frame change
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

        // ── Color (stable per element, small per-frame shift) ──
        const colorRng = createRng(layerSeedInt + ei * 53 + 7);
        const baseColor = pickColor(paletteHints, colorRng, spec.colorShift);

        // Small per-frame color shift for shimmer
        const frameColorShift = Math.round(frameNoise(ei * 3.7 + 400, frameIndex * 0.08) * 3);
        const color = baseColor.map((ch, ci) => (ci < 3 ? clamp(ch + frameColorShift, 0, 255) : ch));

        // ── Shape seed (stable topology) ──
        const shapeSeed = `${seed}:${itemId}:${layerKey}:${ei}`;

        // Stamp onto composite matrix
        stampShape(
          compositeMatrix,
          compositeColors,
          shapeKey,
          transform,
          color,
          spec.noiseLevel * (spec.jitter + 0.5),
          spec.detailLevel,
          shapeSeed,
        );

        // Also stamp onto layer-local matrix for metadata
        stampShape(
          layerMatrix,
          layerColors,
          shapeKey,
          transform,
          color,
          spec.noiseLevel * 0.5,
          spec.detailLevel,
          shapeSeed,
        );

        layerEntries.push({
          type: 'shape',
          shapeKey,
          transform,
          color,
          shapeSeed,
        });
      }

      generatedLayers.push({
        layerId,
        layerKey,
        keys: layerEntries,
        frameMatrix: layerMatrix,
        colors: layerColors,
      });
    }
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
 *  Generates multiple consecutive frames with temporal coherence.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} MultiFrameResult
 * @property {string} itemId
 * @property {string} seed
 * @property {number} frameCount
 * @property {GenerationResult[]} frames
 * @property {Object} objectLayerRenderFramesData - Ready for ObjectLayerEngine.createObjectLayerDocuments.
 * @property {Object} objectLayerData             - Ready for ObjectLayerEngine.createObjectLayerDocuments.
 * @memberof SemanticLayerGenerator
 */

/**
 * Generates N consecutive frames for an item-id, producing data structures
 * compatible with ObjectLayerEngine document creation.
 *
 * @param {Object} options
 * @param {string}  options.itemId
 * @param {string}  options.seed
 * @param {number}  [options.frameCount=1]     - Number of frames to generate.
 * @param {number}  [options.startFrame=0]     - Starting frame index.
 * @param {number}  [options.count=3]          - Shape element count multiplier.
 * @param {number}  [options.density=0.5]      - Density factor.
 * @param {number}  [options.frameDuration=250] - ms per frame.
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

  const frames = [];
  let mergedColors = [[0, 0, 0, 0]]; // index 0 = transparent

  // First pass: generate all frames
  for (let fi = 0; fi < frameCount; fi++) {
    const result = generateFrame({
      itemId,
      seed,
      frameIndex: startFrame + fi,
      count,
      density,
    });
    frames.push(result);
  }

  // Second pass: unify color palettes across all frames
  const globalColors = [[0, 0, 0, 0]];
  const frameMappings = [];

  for (const frame of frames) {
    const mapping = {};
    for (let ci = 0; ci < frame.compositeColors.length; ci++) {
      const c = frame.compositeColors[ci];
      let found = globalColors.findIndex((gc) => gc[0] === c[0] && gc[1] === c[1] && gc[2] === c[2] && gc[3] === c[3]);
      if (found < 0) {
        globalColors.push([...c]);
        found = globalColors.length - 1;
      }
      mapping[ci] = found;
    }
    frameMappings.push(mapping);
  }

  // Third pass: remap frame matrices to global palette
  const remappedFrames = frames.map((frame, fi) => {
    const mapping = frameMappings[fi];
    return frame.compositeFrameMatrix.map((row) => row.map((ci) => (mapping[ci] !== undefined ? mapping[ci] : 0)));
  });

  // Build objectLayerRenderFramesData structure
  // For floor types: use direction '08' (down_idle / default_idle / none_idle)
  const objectLayerRenderFramesData = {
    frame_duration: frameDuration,
    is_stateless: descriptor.itemType === 'floor',
    frames: {},
    colors: globalColors,
  };

  // Assign frames to directions
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

  // Build objectLayerData
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
