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
 * Reads a full skin template (item-skin-08.json / item-skin-06.json) and
 * extracts the black (#000000) outline pixels from its `color` grid.
 * Pixels outside the 24 × 24 play area (x or y >= SKIN_GRID_DIM) are ignored.
 * @param {string} filename  Template filename (full template, not style overlay).
 * @returns {number[][]}  Array of [x, y] border pixel coordinates.
 */
function loadBorderFromTemplate(filename) {
  try {
    const template = JSON.parse(readFileSync(path.join(TEMPLATES_DIR, filename), 'utf8'));
    const colorGrid = template.color;
    if (!Array.isArray(colorGrid)) return [];
    const border = [];
    for (let y = 0; y < colorGrid.length; y++) {
      const row = colorGrid[y];
      if (!Array.isArray(row)) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '#000000' && x < SKIN_GRID_DIM && y < SKIN_GRID_DIM) {
          border.push([x, y]);
        }
      }
    }
    return border;
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
    /** Black outline border from full template color grid */
    border: loadBorderFromTemplate('item-skin-08.json'),
  },
  left: {
    skin: loadTemplate('item-skin-style-skin-06.json'),
    shirt: loadTemplate('item-skin-style-breastplate-06.json'),
    legs: loadTemplate('item-skin-style-legs-06.json'),
    hair: loadTemplate('item-skin-style-hair.json'),
    border: loadBorderFromTemplate('item-skin-06.json'),
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
    return { skin: RAW.down.skin, shirt: RAW.down.shirt, pants, shoes, hair: RAW.down.hair, border: RAW.down.border };
  })();

  const left = (() => {
    const { pants, shoes } = splitLegs(RAW.left.legs);
    return { skin: RAW.left.skin, shirt: RAW.left.shirt, pants, shoes, hair: RAW.left.hair, border: RAW.left.border };
  })();

  const right = {
    skin: mirrorH(left.skin),
    shirt: mirrorH(left.shirt),
    pants: mirrorH(left.pants),
    shoes: mirrorH(left.shoes),
    hair: mirrorH(left.hair),
    border: mirrorH(left.border),
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
 * @property {number}   hairDepth   Max Y row (inclusive) covered by hair; controls hair length.
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

  /* ── Hair depth: controls how far down the hair goes on the head ───── */
  // Range 5–11: 5 = close-cropped crown, 11 = long hair reaching shoulders
  const hairDepthOptions = [5, 6, 7, 8, 9, 10, 11];
  const hairDepth = hairDepthOptions[Math.floor(rng() * hairDepthOptions.length)];

  return {
    skinColor: [...skinRgb, 255],
    hairColor: [...hairRgb, 255],
    shirtColor: [...shirtRgb, 255],
    pantsColor: [...pantsRgb, 255],
    shoeColor: [...shoeRgb, 255],
    hairDepth,
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
 * Builds a 24 × 24 frame matrix for DOWN, LEFT, or RIGHT directions.
 *
 * Hair is derived from interior skin pixels at y <= palette.hairDepth.
 * The bottom of the hair zone gets a black hairline border; 2–4 random
 * columns extend 1–2 px further (bang wisps) with black closing tips,
 * giving the crown a slightly irregular, natural look.
 *
 * @param {DirectionZones} zones
 * @param {SkinPalette} palette
 * @param {number[][]} globalColors  Mutated in place to accumulate unique colours.
 * @param {string} seed
 * @param {string} itemId
 * @param {string} dirLabel  'down' | 'left' | 'right' — differentiates wisps per direction.
 * @returns {number[][]}
 */
function buildDirectionMatrix(zones, palette, globalColors, seed, itemId, dirLabel) {
  const matrix = Array.from({ length: SKIN_GRID_DIM }, () => Array(SKIN_GRID_DIM).fill(0));

  const skinIdx  = getOrAddColor(globalColors, palette.skinColor);
  const hairIdx  = getOrAddColor(globalColors, palette.hairColor);
  const shirtIdx = getOrAddColor(globalColors, palette.shirtColor);
  const pantsIdx = getOrAddColor(globalColors, palette.pantsColor);
  const shoeIdx  = getOrAddColor(globalColors, palette.shoeColor);

  // Sets for fast per-pixel lookup
  const borderSet = new Set(zones.border.map(([x, y]) => `${x},${y}`));
  const skinSet   = new Set(zones.skin.map(([x, y]) => `${x},${y}`));

  // 1. Full body silhouette → skin tone
  paint(matrix, zones.skin, skinIdx);

  // 2. Hair: interior head pixels at y <= hairDepth (guaranteed non-border)
  const hairPixels = zones.skin.filter(([x, y]) => y <= palette.hairDepth && !borderSet.has(`${x},${y}`));
  paint(matrix, hairPixels, hairIdx);

  // 2b. Hair fringe: black hairline + bang wisps at the bottom of the hair zone.
  //     The pixels immediately below the hair area are forehead skin — we paint a
  //     thin black hairline there, broken in 2–4 columns by downward bang wisps.
  {
    const blackIdx = getOrAddColor(globalColors, [0, 0, 0, 255]);
    const rng = lcgRng(hashStr(`${seed}:${itemId}:fringe-${dirLabel}`));

    // Bounding box per hair row
    const hairRowBounds = new Map();
    for (const [x, y] of hairPixels) {
      const b = hairRowBounds.get(y) || { min: x, max: x };
      b.min = Math.min(b.min, x); b.max = Math.max(b.max, x);
      hairRowBounds.set(y, b);
    }
    const hairRows = [...hairRowBounds.keys()].sort((a, b) => a - b);

    if (hairRows.length > 0) {
      const bottomY = hairRows[hairRows.length - 1];
      const { min: fMin, max: fMax } = hairRowBounds.get(bottomY);

      // 2–4 random bang-wisp columns extending below the fringe
      const fringeCols = [];
      for (let x = fMin; x <= fMax; x++) fringeCols.push(x);
      const numWisps = 2 + Math.floor(rng() * 3);   // 2–4
      const wispCols = new Set();
      for (let i = 0; i < numWisps; i++) {
        const wx = fringeCols[Math.floor(rng() * fringeCols.length)];
        wispCols.add(wx);
        const wLen = 1 + Math.floor(rng() * 2);      // 1–2 px extension
        for (let dy = 1; dy <= wLen; dy++) {
          const wy = bottomY + dy;
          if (wy < SKIN_GRID_DIM && wy <= HEAD_Y_MAX &&
              skinSet.has(`${wx},${wy}`) && !borderSet.has(`${wx},${wy}`)) {
            matrix[wy][wx] = hairIdx;
          }
        }
        // Black closing tip at the bottom of each wisp
        const tipY = bottomY + wLen + 1;
        if (tipY < SKIN_GRID_DIM && tipY <= HEAD_Y_MAX &&
            skinSet.has(`${wx},${tipY}`) && !borderSet.has(`${wx},${tipY}`)) {
          matrix[tipY][wx] = blackIdx;
        }
      }

      // Black hairline at y = bottomY + 1 for every non-wisp column that is a skin pixel
      const fringeY = bottomY + 1;
      if (fringeY < SKIN_GRID_DIM) {
        for (let x = fMin; x <= fMax; x++) {
          if (!wispCols.has(x) &&
              skinSet.has(`${x},${fringeY}`) && !borderSet.has(`${x},${fringeY}`)) {
            matrix[fringeY][x] = blackIdx;
          }
        }
      }
    }
  }

  // 2c. Outside-silhouette hair wisps — stray hair pixels beyond the body outline at
  //     the hair zone, consistent with the UP direction style.
  //     Each wisp sits in a transparent pixel adjacent to a head-zone border pixel;
  //     the border pixel itself (painted black in step 4) closes the wisp naturally.
  {
    const rngWisp = lcgRng(hashStr(`${seed}:${itemId}:outer-wisp-${dirLabel}`));

    const wispSet  = new Set();
    const wispList = [];
    for (const [bx, by] of zones.border) {
      if (by > palette.hairDepth) continue;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = bx + dx, ny = by + dy;
          if (nx < 0 || nx >= SKIN_GRID_DIM || ny < 0 || ny >= SKIN_GRID_DIM) continue;
          const key = `${nx},${ny}`;
          if (!skinSet.has(key) && !borderSet.has(key) && !wispSet.has(key)) {
            wispSet.add(key);
            wispList.push([nx, ny]);
          }
        }
      }
    }

    const numOuterWisps = 2 + Math.floor(rngWisp() * 3); // 2–4 wisps
    for (let i = 0; i < numOuterWisps && wispList.length > 0; i++) {
      const [wx, wy] = wispList[Math.floor(rngWisp() * wispList.length)];
      matrix[wy][wx] = hairIdx;
    }
  }

  // 3. Clothes
  paint(matrix, zones.shirt, shirtIdx);
  paint(matrix, zones.pants, pantsIdx);
  paint(matrix, zones.shoes, shoeIdx);

  // 4. Black border outline — always last
  const borderIdx = getOrAddColor(globalColors, [0, 0, 0, 255]);
  paint(matrix, zones.border, borderIdx);

  return matrix;
}

/**
 * Builds a 24 × 24 frame matrix for the UP (back-facing) direction.
 *
 * The entire head is covered with hair, eliminating face features (eyes/mouth).
 * Only the outer silhouette border is kept black; inner face-feature pixels
 * (pupils, mouth line) are overwritten with hair.
 *
 * Hair flows below the head onto the upper back with a tapering strip.
 * Black borders frame the sides and bottom of the flowing hair.
 * Random wisps extend 1–2 px beyond the body silhouette for dynamism.
 *
 * @param {DirectionZones} zones  Reuses ZONES.down pixel data.
 * @param {SkinPalette} palette
 * @param {number[][]} globalColors  Mutated in place.
 * @param {string} seed
 * @param {string} itemId
 * @returns {number[][]}
 */
function buildUpDirectionMatrix(zones, palette, globalColors, seed, itemId) {
  const matrix = Array.from({ length: SKIN_GRID_DIM }, () => Array(SKIN_GRID_DIM).fill(0));

  const skinIdx  = getOrAddColor(globalColors, palette.skinColor);
  const hairIdx  = getOrAddColor(globalColors, palette.hairColor);
  const shirtIdx = getOrAddColor(globalColors, palette.shirtColor);
  const pantsIdx = getOrAddColor(globalColors, palette.pantsColor);
  const shoeIdx  = getOrAddColor(globalColors, palette.shoeColor);
  const blackIdx = getOrAddColor(globalColors, [0, 0, 0, 255]);

  const rng = lcgRng(hashStr(`${seed}:${itemId}:up-hair`));

  // All body pixels (skin + border) used for outer-silhouette detection
  const allBodyCoords = [...zones.skin, ...zones.border];
  const bodySet = new Set(allBodyCoords.map(([x, y]) => `${x},${y}`));

  // 1. Paint full body → skin tone, then clothes, then border
  paint(matrix, zones.skin, skinIdx);
  paint(matrix, zones.shirt, shirtIdx);
  paint(matrix, zones.pants, pantsIdx);
  paint(matrix, zones.shoes, shoeIdx);
  paint(matrix, zones.border, blackIdx);

  // 2. HEAD HAIR — scanline-fill y <= HEAD_Y_MAX with hair.
  //    Covers all pixels in each row's bounding box, eliminating
  //    transparent eye/mouth gaps and black face-feature border dots.
  const headBounds = new Map();
  for (const [x, y] of allBodyCoords) {
    if (y > HEAD_Y_MAX) continue;
    const b = headBounds.get(y) || { min: x, max: x };
    b.min = Math.min(b.min, x); b.max = Math.max(b.max, x);
    headBounds.set(y, b);
  }
  for (const [y, { min, max }] of headBounds) {
    for (let x = min; x <= max; x++) matrix[y][x] = hairIdx;
  }

  // 3. Repaint OUTER head silhouette black (inner face features stay as hair).
  //    A border pixel is "outer" if any 8-connected neighbour is outside bodySet.
  for (const [bx, by] of zones.border) {
    if (by > HEAD_Y_MAX) continue;
    let outer = false;
    for (let dx = -1; dx <= 1 && !outer; dx++) {
      for (let dy = -1; dy <= 1 && !outer; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || nx >= SKIN_GRID_DIM || ny < 0 || ny >= SKIN_GRID_DIM || !bodySet.has(`${nx},${ny}`)) outer = true;
      }
    }
    if (outer) matrix[by][bx] = blackIdx;
    // inner face-feature border pixels → left as hair (already set above)
  }

  // 4. EXTENDED HAIR — flows below the head onto the upper back.
  //    hairDepth (5–11) maps to hairExtend (2–8 rows below HEAD_Y_MAX).
  const hairExtend = palette.hairDepth - 3;            // 5→2 … 11→8
  const extMaxY   = Math.min(HEAD_Y_MAX + hairExtend, SKIN_GRID_DIM - 2);

  // Compute body-bounds for each extension row (centering reference)
  const extBounds = new Map();
  for (const [x, y] of allBodyCoords) {
    if (y <= HEAD_Y_MAX || y > extMaxY) continue;
    const b = extBounds.get(y) || { min: x, max: x };
    b.min = Math.min(b.min, x); b.max = Math.max(b.max, x);
    extBounds.set(y, b);
  }
  const extYs = [...extBounds.keys()].sort((a, b) => a - b);

  // Track actual hair strip bounds per row (for border painting)
  const hairStripBounds = new Map();
  for (const y of extYs) {
    const { min, max } = extBounds.get(y);
    const cx       = (min + max) / 2;
    const bodyHalfW = (max - min) / 2;
    const yDist    = y - HEAD_Y_MAX;
    // Taper: narrower further from the head
    const taper  = Math.max(0.35, 1 - yDist * 0.08);
    const halfW  = Math.max(2, Math.round(bodyHalfW * taper));
    // Per-row random outside extension (0–2 px each side = wisps)
    const extL = Math.floor(rng() * 2);
    const extR = Math.floor(rng() * 2);
    const hMin = Math.max(0, Math.floor(cx) - halfW - extL);
    const hMax = Math.min(SKIN_GRID_DIM - 1, Math.ceil(cx) + halfW + extR);
    for (let x = hMin; x <= hMax; x++) matrix[y][x] = hairIdx;
    // Store core bounds (without wisp extension) for border
    hairStripBounds.set(y, {
      min: Math.max(0, Math.floor(cx) - halfW),
      max: Math.min(SKIN_GRID_DIM - 1, Math.ceil(cx) + halfW),
    });
  }

  // 5. BLACK BORDERS on sides and bottom of the hair extension.
  for (const y of extYs) {
    const { min, max } = hairStripBounds.get(y);
    if (min > 0 && matrix[y][min - 1] !== hairIdx)              matrix[y][min - 1] = blackIdx;
    if (max < SKIN_GRID_DIM - 1 && matrix[y][max + 1] !== hairIdx) matrix[y][max + 1] = blackIdx;
  }
  if (extYs.length > 0) {
    const bottomY = extYs[extYs.length - 1];
    const { min, max } = hairStripBounds.get(bottomY);
    const nextY = bottomY + 1;
    if (nextY < SKIN_GRID_DIM) {
      for (let x = min - 1; x <= max + 1; x++) {
        if (x >= 0 && x < SKIN_GRID_DIM && matrix[nextY][x] !== hairIdx) matrix[nextY][x] = blackIdx;
      }
    }
  }

  // 6. RANDOM WISPS — 2–4 stray hair pixels at edges for visual dynamism.
  //    Each wisp extends 1–2 px beyond the current hair boundary,
  //    with a black tip pixel closing it off.
  const allHairRows = [...headBounds.keys(), ...extYs];
  const numWisps = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < numWisps; i++) {
    const wy = allHairRows[Math.floor(rng() * allHairRows.length)];
    const hb = hairStripBounds.get(wy) || headBounds.get(wy);
    if (!hb) continue;
    const side  = rng() < 0.5 ? -1 : 1;
    const baseX = side < 0 ? hb.min - 1 : hb.max + 1;
    if (baseX < 0 || baseX >= SKIN_GRID_DIM) continue;
    matrix[wy][baseX] = hairIdx;
    // Optional second wisp pixel
    if (rng() < 0.45) {
      const px2 = baseX + side;
      if (px2 >= 0 && px2 < SKIN_GRID_DIM) matrix[wy][px2] = hairIdx;
    }
    // Black closing tip
    const tipX = side < 0
      ? Math.max(0, baseX - (rng() < 0.45 ? 2 : 1))
      : Math.min(SKIN_GRID_DIM - 1, baseX + (rng() < 0.45 ? 2 : 1));
    if (matrix[wy][tipX] !== hairIdx) matrix[wy][tipX] = blackIdx;
  }

  return matrix;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  WALK FRAME BUILDER
 *  Two-frame walk cycle: frame 0 = idle pose, frame 1 = body shifted up 1px.
 *  The vertical bob creates a natural walking bounce effect.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Derives a two-frame walk cycle from a pre-built idle matrix.
 * Frame 0: deep copy of idleMatrix.
 * Frame 1: all rows shifted up by 1 pixel — the walk-bounce step.
 * The bottom row becomes fully transparent (index 0).
 *
 * @param {number[][]} idleMatrix  Pre-built idle frame (not mutated).
 * @returns {number[][][]}  [frame0, frame1]
 */
function buildWalkFrames(idleMatrix) {
  const FOOT_TOP = SHOE_Y_MIN - 1;                 // y=22 — bottom of leg zone, just above shoes
  const midX     = Math.floor(SKIN_GRID_DIM / 2); // x=12 — column boundary between left/right foot

  // Build one walk frame: copy idle, then raise shoe row up 1 px for the chosen side,
  // leaving y=SHOE_Y_MIN transparent for that foot.
  const makeFrame = (liftLeft) => {
    const frame = idleMatrix.map((row) => [...row]);
    const xFrom = liftLeft ? 0    : midX;
    const xTo   = liftLeft ? midX : SKIN_GRID_DIM;
    for (let x = xFrom; x < xTo; x++) {
      frame[FOOT_TOP][x]   = idleMatrix[SHOE_Y_MIN][x]; // raise shoe to y=22
      frame[SHOE_Y_MIN][x] = 0;                          // clear y=23 → transparent gap
    }
    return frame;
  };

  // frame0: right foot raised; frame1: left foot raised → alternating step cycle
  return [makeFrame(false), makeFrame(true)];
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

  // Build idle direction matrices
  const matrices = {
    down:  buildDirectionMatrix(ZONES.down, palette, globalColors, seed, itemId, 'down'),
    up:    buildUpDirectionMatrix(ZONES.up, palette, globalColors, seed, itemId),
    left:  buildDirectionMatrix(ZONES.left, palette, globalColors, seed, itemId, 'left'),
    right: buildDirectionMatrix(ZONES.right, palette, globalColors, seed, itemId, 'right'),
  };

  // Build 2-frame walk cycles from idle matrices (shared color palette, no extra allocations)
  const walkFrames = {
    down:  buildWalkFrames(matrices.down),
    up:    buildWalkFrames(matrices.up),
    left:  buildWalkFrames(matrices.left),
    right: buildWalkFrames(matrices.right),
  };

  // Idle: frameCount identical copies of the direction matrix.
  const makeIdleArray = (matrix) =>
    Array.from({ length: frameCount }, () => matrix.map((row) => [...row]));

  // Walking: always exactly 2 frames (walk cycle is independent of frameCount).
  const makeWalkArray = (frames2) => frames2.map((m) => m.map((row) => [...row]));

  const objectLayerRenderFramesData = {
    frame_duration: frameDuration,
    is_stateless: false,
    frames: {
      // DOWN (08) idle
      down_idle: makeIdleArray(matrices.down),
      none_idle: makeIdleArray(matrices.down),
      default_idle: makeIdleArray(matrices.down),
      // UP (02) idle
      up_idle: makeIdleArray(matrices.up),
      // LEFT (06) idle
      left_idle: makeIdleArray(matrices.left),
      up_left_idle: makeIdleArray(matrices.left),
      down_left_idle: makeIdleArray(matrices.left),
      // RIGHT (04) idle
      right_idle: makeIdleArray(matrices.right),
      up_right_idle: makeIdleArray(matrices.right),
      down_right_idle: makeIdleArray(matrices.right),
      // Walking animations – 2-frame bounce cycle
      down_walking: makeWalkArray(walkFrames.down),
      up_walking: makeWalkArray(walkFrames.up),
      left_walking: makeWalkArray(walkFrames.left),
      right_walking: makeWalkArray(walkFrames.right),
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
    { layerKey: 'border', layerId: `${itemId}-border`, keys: ZONES.down.border.map(() => ({ type: 'template' })) },
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
      border: { generator: 'template-zone' },
    },
    // Custom generator bypasses the default shape/noise pipeline
    customMultiFrameGenerator: generateSkinMultiFrame,
  });
}
