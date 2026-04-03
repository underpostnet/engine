/**
 * Skin semantic descriptor and template-based procedural generator.
 *
 * Instead of the shape/noise-field approach used by floor tiles, character
 * skins are produced by painting pixel zones read from the canonical
 * artist-authored templates in:
 *
 *   src/client/public/cyberia/assets/templates/
 *
 * Templates define which pixels belong to each body part (hair, face/hands,
 * shirt/breastplate, pants, shoes).  A procedural per-seed color palette is
 * applied so every generated skin has a distinct look while remaining
 * technically valid for all four cardinal directions.
 *
 * Zone painting order (later zones override earlier ones):
 *   1. skin      – full body silhouette in skin-tone color
 *   2. shirt     – breastplate/shirt overpaints the torso
 *   3. pants     – legs overpaints the legs area
 *   4. shoes     – bottom rows of legs in shoe color
 *   5. hair      – hair overpaints the head crown
 *
 * UP direction derives from DOWN but colours the head area with hair instead
 * of skin (the back of the head is visible).
 * RIGHT direction mirrors LEFT (direction 06) template horizontally.
 *
 * @module src/server/semantic-layer-generator-skin.js
 * @namespace SemanticLayerGeneratorSkin
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../client/public/cyberia/assets/templates');

/* ─── Grid dimension (must match GRID_DIM in main generator) ────────────── */
const SKIN_GRID_DIM = 24;

/* ─── Y threshold: pixels at or above this row are considered "head" ─────── */
const HEAD_Y_MAX = 12;

/* ─── Y threshold: pixels at or above (>=) this row are "shoe" zone ──────── */
const SHOE_Y_MIN = 23;

/* ═══════════════════════════════════════════════════════════════════════════
 *  TEMPLATE LOADING
 *  Templates are loaded once at module initialisation (synchronous I/O).
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Loads a JSON template file and returns the parsed value.
 * Returns [] on any error so the generator degrades gracefully.
 * @param {string} filename
 * @returns {Array}
 */
function loadTemplate(filename) {
  try {
    return JSON.parse(readFileSync(path.join(TEMPLATES_DIR, filename), 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Raw template pixel lists keyed by direction and zone name.
 * Coordinates are [x, y] pairs where (0,0) is the top-left cell of a
 * SKIN_GRID_DIM × SKIN_GRID_DIM (24 × 24) grid.
 *
 * @type {{ down: Object, left: Object }}
 */
const RAW = {
  down: {
    /** Full body silhouette – face, torso, arms, legs */
    skin: loadTemplate('item-skin-style-skin-08.json'),
    /** Shirt / breastplate zone */
    shirt: loadTemplate('item-skin-style-breastplate-08.json'),
    /** Legs / pants zone (includes shoe row) */
    legs: loadTemplate('item-skin-style-legs-08.json'),
    /** Hair – direction-agnostic crown */
    hair: loadTemplate('item-skin-style-hair.json'),
  },
  left: {
    skin: loadTemplate('item-skin-style-skin-06.json'),
    shirt: loadTemplate('item-skin-style-breastplate-06.json'),
    legs: loadTemplate('item-skin-style-legs-06.json'),
    hair: loadTemplate('item-skin-style-hair.json'),
  },
};

/**
 * Splits the legs template into pants (y < SHOE_Y_MIN) and shoes (y >= SHOE_Y_MIN).
 * @param {number[][]} legsCoords
 * @returns {{ pants: number[][], shoes: number[][] }}
 */
function splitLegs(legsCoords) {
  const pants = [];
  const shoes = [];
  for (const [x, y] of legsCoords) {
    if (y >= SHOE_Y_MIN) shoes.push([x, y]);
    else pants.push([x, y]);
  }
  return { pants, shoes };
}

/**
 * Mirrors a pixel list horizontally so a left-facing sprite becomes right-facing.
 * Uses the reference width 26 (template grid): x_new = 25 − x.
 * All resulting coordinates remain within 0..23.
 * @param {number[][]} coords
 * @returns {number[][]}
 */
function mirrorH(coords) {
  return coords
    .map(([x, y]) => [25 - x, y])
    .filter(([x, y]) => x >= 0 && x < SKIN_GRID_DIM && y >= 0 && y < SKIN_GRID_DIM);
}

/**
 * Per-direction pixel zone definitions.
 * Shoes are separated from pants; hair and skin are provided per direction.
 *
 * @typedef {{ skin: number[][], shirt: number[][], pants: number[][], shoes: number[][], hair: number[][] }} DirectionZones
 * @type {{ down: DirectionZones, left: DirectionZones, right: DirectionZones, up: Object }}
 */
const ZONES = (() => {
  const down = (() => {
    const { pants, shoes } = splitLegs(RAW.down.legs);
    return { skin: RAW.down.skin, shirt: RAW.down.shirt, pants, shoes, hair: RAW.down.hair };
  })();

  const left = (() => {
    const { pants, shoes } = splitLegs(RAW.left.legs);
    return { skin: RAW.left.skin, shirt: RAW.left.shirt, pants, shoes, hair: RAW.left.hair };
  })();

  const right = {
    skin: mirrorH(left.skin),
    shirt: mirrorH(left.shirt),
    pants: mirrorH(left.pants),
    shoes: mirrorH(left.shoes),
    hair: mirrorH(left.hair),
  };

  // UP: same body layout as DOWN but head pixels (y <= HEAD_Y_MAX) are painted
  // with hair color (back of character's head), body/arms remain skin colored.
  // Reuse down zones; we flag this dynamically in buildDirectionMatrix.
  const up = { ...down, isUpDirection: true };

  return { down, left, right, up };
})();

/* ═══════════════════════════════════════════════════════════════════════════
 *  COLOUR UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Mini LCG-based RNG (32-bit seed).  Avoids importing from the parent module.
 * @param {number} seed
 * @returns {function(): number} RNG returning floats in [0, 1).
 */
function lcgRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Simple string hash → 32-bit unsigned integer.
 * @param {string} str
 * @returns {number}
 */
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * HSL colour to [r, g, b] (each 0–255).
 * @param {number} h  Hue in [0, 1).
 * @param {number} s  Saturation in [0, 1].
 * @param {number} l  Lightness in [0, 1].
 * @returns {number[]}
 */
function hslToRgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (x) => {
    const t = ((x % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue2rgb(h + 1 / 3) * 255), Math.round(hue2rgb(h) * 255), Math.round(hue2rgb(h - 1 / 3) * 255)];
}

/** Clamp v to [lo, hi]. */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  PALETTE DERIVATION
 *  All colours are deterministic from (seed, itemId).
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef  {Object} SkinPalette
 * @property {number[]} skinColor   RGBA – face / hands / neck
 * @property {number[]} hairColor   RGBA – hair
 * @property {number[]} shirtColor  RGBA – shirt / breastplate
 * @property {number[]} pantsColor  RGBA – pants / legs
 * @property {number[]} shoeColor   RGBA – shoes / boots
 */

/**
 * Derives a fully deterministic 5-colour palette for a skin variant.
 * @param {string} seed
 * @param {string} itemId
 * @returns {SkinPalette}
 */
function deriveSkinPalette(seed, itemId) {
  const rng = lcgRng(hashStr(`${seed}:${itemId}:skin-palette`));

  /* ── Skin tones: dark brown → light peach ───────────────────────────── */
  const skinTones = [
    [38, 22, 14],
    [72, 44, 28],
    [110, 68, 44],
    [152, 100, 66],
    [186, 134, 94],
    [214, 170, 130],
    [232, 196, 164],
    [248, 220, 196],
  ];
  const skinRgb = skinTones[Math.floor(rng() * skinTones.length)];

  /* ── Hair: natural shades + vivid options ───────────────────────────── */
  const hairPresets = [
    [18, 12, 8], // near-black
    [55, 32, 14], // very dark brown
    [95, 56, 22], // dark brown
    [158, 108, 42], // medium brown
    [194, 156, 60], // blond
    [210, 90, 36], // auburn / ginger
    [36, 36, 36], // dark grey
    [140, 140, 140], // grey
    [230, 230, 230], // white
    [168, 22, 22], // vivid red
    [22, 72, 210], // vivid blue
    [20, 180, 76], // vivid green
    [160, 22, 178], // vivid purple
    [210, 168, 22], // golden
  ];
  const hairRgb = hairPresets[Math.floor(rng() * hairPresets.length)];

  /* ── Clothing: random hue, reasonable saturation/lightness ─────────── */
  const shirtRgb = hslToRgb(rng(), 0.6 + rng() * 0.35, 0.32 + rng() * 0.28);
  const pantsRgb = hslToRgb(rng(), 0.55 + rng() * 0.4, 0.20 + rng() * 0.30);

  /* Shoes tend to be darker (lower lightness) */
  const shoeH = rng();
  const shoeRgb = hslToRgb(shoeH, 0.35 + rng() * 0.4, 0.12 + rng() * 0.20);

  return {
    skinColor: [...skinRgb, 255],
    hairColor: [...hairRgb, 255],
    shirtColor: [...shirtRgb, 255],
    pantsColor: [...pantsRgb, 255],
    shoeColor: [...shoeRgb, 255],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  FRAME MATRIX BUILDER
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Returns the index of `rgba` in `globalColors`, adding it if absent.
 * @param {number[][]} globalColors
 * @param {number[]} rgba
 * @returns {number}
 */
function getOrAddColor(globalColors, rgba) {
  const idx = globalColors.findIndex(
    (c) => c[0] === rgba[0] && c[1] === rgba[1] && c[2] === rgba[2] && c[3] === rgba[3],
  );
  if (idx >= 0) return idx;
  globalColors.push([...rgba]);
  return globalColors.length - 1;
}

/**
 * Paints a list of [x,y] coordinates onto a frame matrix with a color index.
 * Skips coordinates outside SKIN_GRID_DIM.
 * @param {number[][]} matrix
 * @param {number[][]} coords
 * @param {number} colorIdx
 */
function paint(matrix, coords, colorIdx) {
  for (const [x, y] of coords) {
    if (x >= 0 && x < SKIN_GRID_DIM && y >= 0 && y < SKIN_GRID_DIM) {
      matrix[y][x] = colorIdx;
    }
  }
}

/**
 * Builds a 24 × 24 frame matrix for one direction.
 *
 * @param {DirectionZones} zones
 * @param {SkinPalette} palette
 * @param {number[][]} globalColors  Mutated in place to accumulate unique colours.
 * @param {boolean} [isUp=false]    When true the head area uses hair colour (back-of-head).
 * @returns {number[][]}
 */
function buildDirectionMatrix(zones, palette, globalColors, isUp = false) {
  const matrix = Array.from({ length: SKIN_GRID_DIM }, () => Array(SKIN_GRID_DIM).fill(0));

  const skinIdx = getOrAddColor(globalColors, palette.skinColor);
  const hairIdx = getOrAddColor(globalColors, palette.hairColor);
  const shirtIdx = getOrAddColor(globalColors, palette.shirtColor);
  const pantsIdx = getOrAddColor(globalColors, palette.pantsColor);
  const shoeIdx = getOrAddColor(globalColors, palette.shoeColor);

  if (isUp) {
    // UP direction: split skin pixels into head (hair colour) and body (skin colour)
    const headPixels = zones.skin.filter(([, y]) => y <= HEAD_Y_MAX);
    const bodyPixels = zones.skin.filter(([, y]) => y > HEAD_Y_MAX);
    paint(matrix, bodyPixels, skinIdx);
    paint(matrix, headPixels, hairIdx); // back-of-head = all hair
  } else {
    // 1. Full body silhouette → skin tone
    paint(matrix, zones.skin, skinIdx);
  }

  // 2. Shirt / breastplate → overpaints torso
  paint(matrix, zones.shirt, shirtIdx);

  // 3. Pants → overpaints legs
  paint(matrix, zones.pants, pantsIdx);

  // 4. Shoes → overpaints bottom rows
  paint(matrix, zones.shoes, shoeIdx);

  // 5. Hair (crown) → overpaints top of head
  if (!isUp) {
    // For non-UP directions, paint the hair crown on top of skin
    paint(matrix, zones.hair, hairIdx);
  }
  // (UP direction already painted head as hair; skip the crown overpaint)

  return matrix;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  UUID HELPER (self-contained, no import from parent)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Derives a deterministic UUID v4 from an arbitrary seed string.
 * @param {string} seed
 * @returns {string}
 */
function localSeedToUUIDv4(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  CUSTOM MULTI-FRAME GENERATOR
 *  Called by generateMultiFrame() when descriptor.customMultiFrameGenerator exists.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Generates a complete MultiFrameResult for a skin item using template-based
 * pixel painting.  Each of the four cardinal directions gets a properly oriented
 * frame matrix; all share the same deterministic colour palette.
 *
 * @param {import('./semantic-layer-generator.js').GenerateLayerOptions & { frameCount?: number, startFrame?: number, frameDuration?: number }} options
 * @param {import('./semantic-layer-generator.js').SemanticDescriptor} _descriptor
 * @returns {import('./semantic-layer-generator.js').MultiFrameResult}
 */
function generateSkinMultiFrame(options, _descriptor) {
  const { itemId, seed, frameCount = 1, startFrame = 0, frameDuration = 250 } = options;

  // Shared mutable palette; starts with index 0 = transparent
  const globalColors = [[0, 0, 0, 0]];

  const palette = deriveSkinPalette(seed, itemId);

  // Build four direction matrices
  const matrices = {
    down: buildDirectionMatrix(ZONES.down, palette, globalColors, false),
    up: buildDirectionMatrix(ZONES.up, palette, globalColors, true),
    left: buildDirectionMatrix(ZONES.left, palette, globalColors, false),
    right: buildDirectionMatrix(ZONES.right, palette, globalColors, false),
  };

  // Each direction produces `frameCount` identical frames (idle = static).
  // A per-frame colour micro-shift could be added here for future breathing
  // animation; for now the matrices are simply copied.
  const makeFrameArray = (matrix) =>
    Array.from({ length: frameCount }, () => matrix.map((row) => [...row]));

  const objectLayerRenderFramesData = {
    frame_duration: frameDuration,
    is_stateless: false,
    frames: {
      // DOWN (08)
      down_idle: makeFrameArray(matrices.down),
      none_idle: makeFrameArray(matrices.down),
      default_idle: makeFrameArray(matrices.down),
      // UP (02)
      up_idle: makeFrameArray(matrices.up),
      // LEFT (06)
      left_idle: makeFrameArray(matrices.left),
      up_left_idle: makeFrameArray(matrices.left),
      down_left_idle: makeFrameArray(matrices.left),
      // RIGHT (04)
      right_idle: makeFrameArray(matrices.right),
      up_right_idle: makeFrameArray(matrices.right),
      down_right_idle: makeFrameArray(matrices.right),
    },
    colors: globalColors,
  };

  const objectLayerData = {
    data: {
      item: {
        id: itemId,
        type: 'skin',
        description: `Procedurally generated character skin (seed: ${seed})`,
        activable: true,
      },
      stats: {
        effect: 0,
        resistance: 0,
        agility: 0,
        range: 0,
        intelligence: 0,
        utility: 0,
      },
      ledger: { type: 'OFF_CHAIN' },
      seed: localSeedToUUIDv4(`${seed}:${itemId}`),
    },
  };

  // Build synthetic frames array for layer-summary logging in cyberia.js
  const layerSummary = [
    { layerKey: 'skin', layerId: `${itemId}-skin`, keys: ZONES.down.skin.map(() => ({ type: 'template' })) },
    { layerKey: 'hair', layerId: `${itemId}-hair`, keys: ZONES.down.hair.map(() => ({ type: 'template' })) },
    { layerKey: 'shirt', layerId: `${itemId}-shirt`, keys: ZONES.down.shirt.map(() => ({ type: 'template' })) },
    { layerKey: 'pants', layerId: `${itemId}-pants`, keys: ZONES.down.pants.map(() => ({ type: 'template' })) },
    { layerKey: 'shoes', layerId: `${itemId}-shoes`, keys: ZONES.down.shoes.map(() => ({ type: 'template' })) },
  ];

  const frames = Array.from({ length: frameCount }, (_, fi) => ({
    itemId,
    seed,
    frameIndex: startFrame + fi,
    layers: layerSummary,
    compositeFrameMatrix: matrices.down,
    compositeColors: globalColors,
  }));

  return {
    itemId,
    seed,
    frameCount,
    frames,
    objectLayerRenderFramesData,
    objectLayerData,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  REGISTRATION
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Registers all skin semantic descriptors.
 * Uses dependency injection — no import from the parent module.
 *
 * @param {function(string, import('./semantic-layer-generator.js').SemanticDescriptor): void} registerFn
 * @memberof SemanticLayerGeneratorSkin
 */
export function registerSkinSemantics(registerFn) {
  registerFn('skin-', {
    semanticTags: ['character', 'body', 'humanoid'],
    paletteHints: [], // unused — palette derived procedurally from seed
    preferredShapes: {},
    itemType: 'skin',
    // layers is intentionally empty — frame generation is fully custom
    layers: {
      skin: { generator: 'template-zone' },
      hair: { generator: 'template-zone' },
      shirt: { generator: 'template-zone' },
      pants: { generator: 'template-zone' },
      shoes: { generator: 'template-zone' },
    },
    // Custom generator bypasses the default shape/noise pipeline
    customMultiFrameGenerator: generateSkinMultiFrame,
  });
}
