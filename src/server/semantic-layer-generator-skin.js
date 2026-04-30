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
 * The canonical side template is direction 06 (right); LEFT is derived by
 * mirroring it so generated frame keys stay aligned with 04 = left and 06 = right.
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
class RAW {
  static down = {
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
  };
  static left = {
    skin: loadTemplate('item-skin-style-skin-06.json'),
    shirt: loadTemplate('item-skin-style-breastplate-06.json'),
    legs: loadTemplate('item-skin-style-legs-06.json'),
    hair: loadTemplate('item-skin-style-hair.json'),
    border: loadBorderFromTemplate('item-skin-06.json'),
  };
}
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
  const right = (() => {
    const { pants, shoes } = splitLegs(RAW.left.legs);
    return { skin: RAW.left.skin, shirt: RAW.left.shirt, pants, shoes, hair: RAW.left.hair, border: RAW.left.border };
  })();
  const left = {
    skin: mirrorH(right.skin),
    shirt: mirrorH(right.shirt),
    pants: mirrorH(right.pants),
    shoes: mirrorH(right.shoes),
    hair: mirrorH(right.hair),
    border: mirrorH(right.border),
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
 *
 * @param {string} seed
 * @param {string} itemId
 * @param {'random'|'dark'|'light'|'vivid'|'natural'|'shaved'} [subtype='random']
 * @returns {SkinPalette}
 */
function deriveSkinPalette(seed, itemId, subtype = 'random') {
  const rng = lcgRng(hashStr(`${seed}:${itemId}:skin-palette`));
  /* ── Skin tones: dark brown → light peach ───────────────────────────── */
  const allSkinTones = [
    [38, 22, 14], // near-black
    [72, 44, 28], // very dark
    [110, 68, 44], // dark
    [152, 100, 66], // medium
    [186, 134, 94], // warm mid
    [214, 170, 130], // light
    [232, 196, 164], // very light
    [248, 220, 196], // pale
  ];
  // Constrain tone pool by subtype
  const skinPool =
    subtype === 'dark' ? allSkinTones.slice(0, 3) : subtype === 'light' ? allSkinTones.slice(5) : allSkinTones;
  const skinRgb = skinPool[Math.floor(rng() * skinPool.length)];
  /* ── Hair: natural shades + vivid options ───────────────────────────── */
  const naturalHair = [
    [18, 12, 8], // near-black
    [55, 32, 14], // very dark brown
    [95, 56, 22], // dark brown
    [158, 108, 42], // medium brown
    [194, 156, 60], // blond
    [210, 90, 36], // auburn / ginger
    [36, 36, 36], // dark grey
    [140, 140, 140], // grey
    [230, 230, 230], // white
  ];
  const vividHair = [
    [168, 22, 22], // vivid red
    [22, 72, 210], // vivid blue
    [20, 180, 76], // vivid green
    [160, 22, 178], // vivid purple
    [210, 168, 22], // golden
    [22, 200, 200], // vivid cyan
    [220, 60, 160], // hot pink
  ];
  const allHairPresets = [...naturalHair, ...vividHair];
  const hairPool = subtype === 'vivid' ? vividHair : subtype === 'natural' ? naturalHair : allHairPresets;
  const hairRgb = hairPool[Math.floor(rng() * hairPool.length)];
  /* ── Clothing: random hue, reasonable saturation/lightness ─────────── */
  const shirtRgb = hslToRgb(rng(), 0.6 + rng() * 0.35, 0.32 + rng() * 0.28);
  const pantsRgb = hslToRgb(rng(), 0.55 + rng() * 0.4, 0.2 + rng() * 0.3);
  /* Shoes tend to be darker (lower lightness) */
  const shoeH = rng();
  const shoeRgb = hslToRgb(shoeH, 0.35 + rng() * 0.4, 0.12 + rng() * 0.2);
  /* ── Hair depth: controls how far down the hair goes on the head ───── *
   *  0        → shaved (no hair at all — bald silhouette)               *
   *  5 – 11   → short crop to long flowing hair                         */
  const hairDepthOptions = subtype === 'shaved' ? [0] : [5, 6, 7, 8, 9, 10, 11];
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
 * hairDepth === 0 means shaved head — all hair steps are skipped.
 *
 * Non-shaved heads get:
 *   2b. Black hairline at y = hairDepth+1 with 2–4 bang wisps punching through.
 *   2c. Side hair extension: narrow strips hang from the crown's left/right
 *       edges for hairExtend = hairDepth − 3 rows (same formula as UP's
 *       back-extension), ensuring visual hair-length consistency across all 4
 *       directions.
 *
 * @param {DirectionZones} zones
 * @param {SkinPalette} palette
 * @param {number[][]} globalColors  Mutated in place to accumulate unique colours.
 * @param {string} seed
 * @param {string} itemId
 * @param {string} dirLabel  'down' | 'left' | 'right' — differentiates RNG streams.
 * @returns {number[][]}
 */
function buildDirectionMatrix(zones, palette, globalColors, seed, itemId, dirLabel) {
  const matrix = Array.from({ length: SKIN_GRID_DIM }, () => Array(SKIN_GRID_DIM).fill(0));
  const skinIdx = getOrAddColor(globalColors, palette.skinColor);
  const hairIdx = getOrAddColor(globalColors, palette.hairColor);
  const shirtIdx = getOrAddColor(globalColors, palette.shirtColor);
  const pantsIdx = getOrAddColor(globalColors, palette.pantsColor);
  const shoeIdx = getOrAddColor(globalColors, palette.shoeColor);
  // Sets for fast per-pixel lookup
  const borderSet = new Set(zones.border.map(([x, y]) => `${x},${y}`));
  const skinSet = new Set(zones.skin.map(([x, y]) => `${x},${y}`));
  // 1. Full body silhouette → skin tone
  paint(matrix, zones.skin, skinIdx);
  // Compute hair pixels and per-row bounding boxes once — shared by steps 2b and 2c.
  // hairDepth === 0 → shaved head, all hair steps are skipped.
  const hairPixels =
    palette.hairDepth > 0 ? zones.skin.filter(([x, y]) => y <= palette.hairDepth && !borderSet.has(`${x},${y}`)) : [];
  const hairRowBounds = new Map();
  for (const [x, y] of hairPixels) {
    const b = hairRowBounds.get(y) || { min: x, max: x };
    b.min = Math.min(b.min, x);
    b.max = Math.max(b.max, x);
    hairRowBounds.set(y, b);
  }
  const hairRows = [...hairRowBounds.keys()].sort((a, b) => a - b);
  if (palette.hairDepth > 0) {
    // 2. Hair fill
    paint(matrix, hairPixels, hairIdx);
    const blackIdx = getOrAddColor(globalColors, [0, 0, 0, 255]);
    // 2b. Black hairline + bang wisps at the fringe (bottom of hair zone).
    if (hairRows.length > 0) {
      const rngFringe = lcgRng(hashStr(`${seed}:${itemId}:fringe-${dirLabel}`));
      const bottomY = hairRows[hairRows.length - 1];
      const { min: fMin, max: fMax } = hairRowBounds.get(bottomY);
      // Build 2–4 random bang-wisp columns
      const fringeCols = [];
      for (let x = fMin; x <= fMax; x++) fringeCols.push(x);
      const numWisps = 2 + Math.floor(rngFringe() * 3);
      const wispCols = new Set();
      for (let i = 0; i < numWisps; i++) {
        const wx = fringeCols[Math.floor(rngFringe() * fringeCols.length)];
        wispCols.add(wx);
        const wLen = 1 + Math.floor(rngFringe() * 2);
        for (let dy = 1; dy <= wLen; dy++) {
          const wy = bottomY + dy;
          if (wy < SKIN_GRID_DIM && wy <= HEAD_Y_MAX && skinSet.has(`${wx},${wy}`) && !borderSet.has(`${wx},${wy}`)) {
            matrix[wy][wx] = hairIdx;
          }
        }
        const tipY = bottomY + wLen + 1;
        if (
          tipY < SKIN_GRID_DIM &&
          tipY <= HEAD_Y_MAX &&
          skinSet.has(`${wx},${tipY}`) &&
          !borderSet.has(`${wx},${tipY}`)
        ) {
          matrix[tipY][wx] = blackIdx;
        }
      }
      // Black hairline for non-wisp fringe columns
      const fringeY = bottomY + 1;
      if (fringeY < SKIN_GRID_DIM) {
        for (let x = fMin; x <= fMax; x++) {
          if (!wispCols.has(x) && skinSet.has(`${x},${fringeY}`) && !borderSet.has(`${x},${fringeY}`)) {
            matrix[fringeY][x] = blackIdx;
          }
        }
      }
    }
    // 2c. SIDE HAIR STRANDS — 1-px strands at each temple, anchored at the
    //     outermost border columns of the head at HEAD_Y_MAX (ear level).
    //     Fixed anchor means position is independent of hairDepth, giving a
    //     consistent result across all seeds and templates.
    //
    //     Length: 1–3 rows (hairDepth 5→1, 6→2, 7+→3).
    //     Width:  1 px by default; 30 % chance of 2 px per row for subtle
    //             seed-based variation.  No inward drift.
    {
      const rngWisp = lcgRng(hashStr(`${seed}:${itemId}:outer-wisp-${dirLabel}`));
      const strandRows = palette.hairDepth >= 5 ? Math.min(palette.hairDepth - 4, 3) : 0;
      if (strandRows > 0) {
        const borderAtHead = zones.border.filter(([, y]) => y === HEAD_Y_MAX);
        if (borderAtHead.length >= 2) {
          const hbL = Math.min(...borderAtHead.map(([x]) => x));
          const hbR = Math.max(...borderAtHead.map(([x]) => x));
          let lastLx = null,
            lastRx = null;
          for (let row = 0; row < strandRows; row++) {
            const y = HEAD_Y_MAX + 1 + row; // just below ear level
            if (y >= SKIN_GRID_DIM) break;
            const ext = rngWisp() < 0.3 ? 2 : 1;
            const lMin = Math.max(0, hbL - ext);
            const rMax = Math.min(SKIN_GRID_DIM - 1, hbR + ext);
            // Left strand: pixels outside the body to the left of hbL
            for (let x = lMin; x < hbL; x++) matrix[y][x] = hairIdx;
            // Right strand: pixels outside the body to the right of hbR
            for (let x = hbR + 1; x <= rMax; x++) matrix[y][x] = hairIdx;
            if (lMin > 0 && matrix[y][lMin - 1] !== hairIdx) matrix[y][lMin - 1] = blackIdx;
            if (rMax < SKIN_GRID_DIM - 1 && matrix[y][rMax + 1] !== hairIdx) matrix[y][rMax + 1] = blackIdx;
            lastLx = lMin;
            lastRx = rMax;
          }
          const tipY = HEAD_Y_MAX + 1 + strandRows;
          if (tipY < SKIN_GRID_DIM) {
            if (lastLx !== null) matrix[tipY][Math.max(0, lastLx)] = blackIdx;
            if (lastRx !== null) matrix[tipY][Math.min(SKIN_GRID_DIM - 1, lastRx)] = blackIdx;
          }
        }
      }
    }
    // 2d. UPPER SIDE HAIR ARCH — thick arch on each temple anchored at y=10.
    //     The arch is widest at its crown (y=10, 4-5 px outward from the border)
    //     and tapers toward the ear base, creating a visible sideburn arc.
    //     3 rows max (hairDepth 5→1 row, 6→2 rows, 7+→3 rows).
    //     Together with the lower 2c strands the pair forms a broken arc shape.
    {
      const UPPER_ANCHOR_Y = HEAD_Y_MAX - 2; // y=10
      const rngWisp2 = lcgRng(hashStr(`${seed}:${itemId}:outer-wisp2-${dirLabel}`));
      const strandRows2 = palette.hairDepth >= 5 ? Math.min(palette.hairDepth - 4, 3) : 0;
      if (strandRows2 > 0) {
        const borderAtUpper = zones.border.filter(([, y]) => y === UPPER_ANCHOR_Y);
        if (borderAtUpper.length >= 2) {
          const hbL2 = Math.min(...borderAtUpper.map(([x]) => x));
          const hbR2 = Math.max(...borderAtUpper.map(([x]) => x));
          // Arch widths per row: narrow at crown (y=10), widest at ear base (y=12).
          // Follows the head silhouette arc — wider where the head is wider.
          const extBase = [2, 3, 4];
          let lastLx2 = null,
            lastRx2 = null;
          for (let row = 0; row < strandRows2; row++) {
            const y = UPPER_ANCHOR_Y + row; // y=10, y=11, y=12
            if (y >= SKIN_GRID_DIM) break;
            const ext2 = extBase[row] + (rngWisp2() < 0.4 ? 1 : 0); // 40 % +1 bonus
            const innerL2 = hbL2 + 2; // 2 px toward center
            const innerR2 = hbR2 - 2;
            const lMin2 = Math.max(0, innerL2 - ext2);
            const rMax2 = Math.min(SKIN_GRID_DIM - 1, innerR2 + ext2);
            for (let x = lMin2; x < innerL2; x++) matrix[y][x] = hairIdx;
            for (let x = innerR2 + 1; x <= rMax2; x++) matrix[y][x] = hairIdx;
            if (lMin2 > 0 && matrix[y][lMin2 - 1] !== hairIdx) matrix[y][lMin2 - 1] = blackIdx;
            if (rMax2 < SKIN_GRID_DIM - 1 && matrix[y][rMax2 + 1] !== hairIdx) matrix[y][rMax2 + 1] = blackIdx;
            lastLx2 = lMin2;
            lastRx2 = rMax2;
          }
          const tipY2 = UPPER_ANCHOR_Y + strandRows2; // first row after arch
          if (tipY2 < SKIN_GRID_DIM) {
            if (lastLx2 !== null && matrix[tipY2][Math.max(0, lastLx2)] !== hairIdx)
              matrix[tipY2][Math.max(0, lastLx2)] = blackIdx;
            if (lastRx2 !== null && matrix[tipY2][Math.min(SKIN_GRID_DIM - 1, lastRx2)] !== hairIdx)
              matrix[tipY2][Math.min(SKIN_GRID_DIM - 1, lastRx2)] = blackIdx;
          }
        }
      }
    }
    // 2e. HAIR EDGE DISTORTIONS — 5–9 stray hair pixels scattered along the
    //     outer border of the hair zone for an organic, hand-drawn look.
    //     Each pixel sits one step outside the body silhouette and is closed
    //     with a black tip pixel for pixel-art definition.
    {
      const rngDist = lcgRng(hashStr(`${seed}:${itemId}:hair-distort-${dirLabel}`));
      // Collect the outermost border column per hair row.
      const borderInHair = zones.border.filter(([, y]) => y <= palette.hairDepth);
      const bhrMap = new Map();
      for (const [x, y] of borderInHair) {
        const b = bhrMap.get(y) || { min: x, max: x };
        b.min = Math.min(b.min, x);
        b.max = Math.max(b.max, x);
        bhrMap.set(y, b);
      }
      const bhrRows = [...bhrMap.keys()];
      const numDistort = 5 + Math.floor(rngDist() * 5); // 5–9
      for (let i = 0; i < numDistort; i++) {
        const y = bhrRows[Math.floor(rngDist() * bhrRows.length)];
        const bnd = bhrMap.get(y);
        if (!bnd) continue;
        const side = rngDist() < 0.5 ? -1 : 1;
        const px = side < 0 ? bnd.min - 1 : bnd.max + 1;
        if (px >= 0 && px < SKIN_GRID_DIM && matrix[y][px] !== hairIdx) {
          matrix[y][px] = hairIdx;
          const bx = px + side;
          if (bx >= 0 && bx < SKIN_GRID_DIM && matrix[y][bx] !== hairIdx) matrix[y][bx] = blackIdx;
        }
      }
    }
    // 2f. MID-CROWN SIDE HAIR ARC — 7-row arc of hair strands following the
    //     head edge, centered at y=7 (crown shoulders).  Right strand anchors
    //     near x=8 (character right), left mirrors it at x≈15.  Width peaks
    //     at the center row (3 px outward) and tapers to 1 px at the extremes.
    //     Per-row 40 % width bonus + 30 % extra distortion pixel per side.
    {
      const CROWN_Y = 7;
      const crownW = [3, 2, 2, 1]; // base width at |dy| = 0, 1, 2, 3
      const rngCrown = lcgRng(hashStr(`${seed}:${itemId}:crown-side-${dirLabel}`));
      for (let dy = -3; dy <= 3; dy++) {
        const y = CROWN_Y + dy;
        if (y < 0 || y >= SKIN_GRID_DIM) continue;
        const borderAtY = zones.border.filter(([, by]) => by === y);
        if (borderAtY.length < 2) continue;
        const hbL = Math.min(...borderAtY.map(([x]) => x));
        const hbR = Math.max(...borderAtY.map(([x]) => x));
        const ext = crownW[Math.abs(dy)] + (rngCrown() < 0.4 ? 1 : 0);
        // Left strand (character right, viewer left)
        const lMin = Math.max(0, hbL - ext);
        for (let x = lMin; x < hbL; x++) matrix[y][x] = hairIdx;
        if (lMin > 0 && matrix[y][lMin - 1] !== hairIdx) matrix[y][lMin - 1] = blackIdx;
        // Right strand (character left, viewer right)
        const rMax = Math.min(SKIN_GRID_DIM - 1, hbR + ext);
        for (let x = hbR + 1; x <= rMax; x++) matrix[y][x] = hairIdx;
        if (rMax < SKIN_GRID_DIM - 1 && matrix[y][rMax + 1] !== hairIdx) matrix[y][rMax + 1] = blackIdx;
        // Distortion: 30 % chance of one extra pixel per side
        if (rngCrown() < 0.3) {
          const px = lMin - 1;
          if (px >= 0 && matrix[y][px] !== hairIdx) {
            matrix[y][px] = hairIdx;
            if (px > 0 && matrix[y][px - 1] !== hairIdx) matrix[y][px - 1] = blackIdx;
          }
        }
        if (rngCrown() < 0.3) {
          const px = rMax + 1;
          if (px < SKIN_GRID_DIM && matrix[y][px] !== hairIdx) {
            matrix[y][px] = hairIdx;
            if (px < SKIN_GRID_DIM - 1 && matrix[y][px + 1] !== hairIdx) matrix[y][px + 1] = blackIdx;
          }
        }
      }
    }
  }
  // 3. Clothes
  paint(matrix, zones.shirt, shirtIdx);
  paint(matrix, zones.pants, pantsIdx);
  paint(matrix, zones.shoes, shoeIdx);
  // 4. Black border outline — always last
  const borderIdx = getOrAddColor(globalColors, [0, 0, 0, 255]);
  paint(matrix, zones.border, borderIdx);
  // 4b. CROWN BORDER SOFTENING — for non-shaved skins, replace most outer
  //     silhouette border pixels within the hair zone with hair colour so the
  //     crown blends into the background rather than having a hard black outline.
  //     Interior features (eyes, pupils) are never touched — only outer-silhouette
  //     pixels (those with at least one empty 8-neighbour) are candidates.
  //     ~25 % of candidates are kept black for pixel-art definition.
  if (palette.hairDepth > 0) {
    const rngBorder = lcgRng(hashStr(`${seed}:${itemId}:soften-border-${dirLabel}`));
    for (const [bx, by] of zones.border) {
      if (by > palette.hairDepth) continue;
      let isOuter = false;
      for (let dx = -1; dx <= 1 && !isOuter; dx++) {
        for (let dy = -1; dy <= 1 && !isOuter; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = bx + dx,
            ny = by + dy;
          if (
            nx < 0 ||
            nx >= SKIN_GRID_DIM ||
            ny < 0 ||
            ny >= SKIN_GRID_DIM ||
            (!skinSet.has(`${nx},${ny}`) && !borderSet.has(`${nx},${ny}`))
          )
            isOuter = true;
        }
      }
      if (isOuter && rngBorder() < 0.75) matrix[by][bx] = hairIdx;
    }
  }
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
  const skinIdx = getOrAddColor(globalColors, palette.skinColor);
  const hairIdx = getOrAddColor(globalColors, palette.hairColor);
  const shirtIdx = getOrAddColor(globalColors, palette.shirtColor);
  const pantsIdx = getOrAddColor(globalColors, palette.pantsColor);
  const shoeIdx = getOrAddColor(globalColors, palette.shoeColor);
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
  // 1b. FACE FEATURE WIPE — the zones come from the DOWN (front-facing) template
  //     which embeds eyes, pupils and mouth as black border pixels.  In the UP
  //     (back-of-head) view those pixels must not appear.
  //     Walk every border pixel in the face+neck band (y ≤ FACE_FEATURE_Y_MAX).
  //     If a pixel has ALL 8 neighbours inside bodySet it is an *interior* feature
  //     (eye outline, pupil, mouth corners) — paint it with skinIdx so it is
  //     invisible.  Outer-silhouette pixels keep their black value.
  //
  //     The mouth is at y=15 in the 26×26 template, which is ABOVE HEAD_Y_MAX=12
  //     so the subsequent scanline fill does NOT reach it — this wipe is the only
  //     place that erases it.
  const FACE_FEATURE_Y_MAX = 17; // below collar; safe upper bound for face features
  for (const [bx, by] of zones.border) {
    if (by > FACE_FEATURE_Y_MAX) continue;
    let outer = false;
    for (let dx = -1; dx <= 1 && !outer; dx++) {
      for (let dy = -1; dy <= 1 && !outer; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = bx + dx,
          ny = by + dy;
        if (nx < 0 || nx >= SKIN_GRID_DIM || ny < 0 || ny >= SKIN_GRID_DIM || !bodySet.has(`${nx},${ny}`)) outer = true;
      }
    }
    if (!outer) matrix[by][bx] = skinIdx;
  }
  // 2. HEAD HAIR — two paths: shaved (hairDepth=0) or normal.
  //
  //  SHAVED: scanline-fill the head with *skin tone* (covers inner face-feature
  //          border pixels so no eyes/mouth bleed through on the bald back-head).
  //          Repaint only the outer silhouette black.  No extensions or wisps.
  //
  //  NORMAL: scanline-fill with hair colour, keep inner pixels as hair, repaint
  //          outer silhouette black, then extend hair strip + add wisps.
  const headBounds = new Map();
  for (const [x, y] of allBodyCoords) {
    if (y > HEAD_Y_MAX) continue;
    const b = headBounds.get(y) || { min: x, max: x };
    b.min = Math.min(b.min, x);
    b.max = Math.max(b.max, x);
    headBounds.set(y, b);
  }
  // Shared helper: repaint outer head silhouette black; inner pixels stay as-is.
  // A border pixel is "outer" if any 8-connected neighbour is outside bodySet.
  const repaintOuterHeadBorder = () => {
    for (const [bx, by] of zones.border) {
      if (by > HEAD_Y_MAX) continue;
      let outer = false;
      for (let dx = -1; dx <= 1 && !outer; dx++) {
        for (let dy = -1; dy <= 1 && !outer; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = bx + dx,
            ny = by + dy;
          if (nx < 0 || nx >= SKIN_GRID_DIM || ny < 0 || ny >= SKIN_GRID_DIM || !bodySet.has(`${nx},${ny}`))
            outer = true;
        }
      }
      if (outer) matrix[by][bx] = blackIdx;
    }
  };
  if (palette.hairDepth === 0) {
    // ── SHAVED HEAD ─────────────────────────────────────────────────────────
    // Fill head scanlines with skin tone (eliminates any face-feature artefacts)
    for (const [y, { min, max }] of headBounds) {
      for (let x = min; x <= max; x++) matrix[y][x] = skinIdx;
    }
    repaintOuterHeadBorder();
    // No extended hair, no wisps.
  } else {
    // ── NORMAL HAIR HEAD ────────────────────────────────────────────────────
    // Scanline-fill y <= HEAD_Y_MAX with hair colour
    for (const [y, { min, max }] of headBounds) {
      for (let x = min; x <= max; x++) matrix[y][x] = hairIdx;
    }
    // Repaint outer silhouette black; inner face-feature pixels stay as hair
    repaintOuterHeadBorder();
    // Crown border softening (UP) — same intent as 4b in buildDirectionMatrix.
    // repaintOuterHeadBorder() just set outer head border pixels to black;
    // randomly convert 75 % of them back to hair colour for a softer crown edge.
    {
      const rngBorder = lcgRng(hashStr(`${seed}:${itemId}:soften-border-up`));
      for (const [bx, by] of zones.border) {
        if (by > HEAD_Y_MAX) continue;
        if (matrix[by][bx] !== blackIdx) continue; // already hair / not yet set
        let isOuter = false;
        for (let dx = -1; dx <= 1 && !isOuter; dx++) {
          for (let dy = -1; dy <= 1 && !isOuter; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = bx + dx,
              ny = by + dy;
            if (nx < 0 || nx >= SKIN_GRID_DIM || ny < 0 || ny >= SKIN_GRID_DIM || !bodySet.has(`${nx},${ny}`))
              isOuter = true;
          }
        }
        if (isOuter && rngBorder() < 0.75) matrix[by][bx] = hairIdx;
      }
    }
    // 2b side. SIDE HAIR STRANDS (UP) — identical geometry to the other three
    //          directions: 1-px strands just below HEAD_Y_MAX, anchored at the
    //          head border bounds at that row.
    {
      const headAtMax = headBounds.get(HEAD_Y_MAX);
      if (headAtMax && palette.hairDepth >= 5) {
        const rngWisp = lcgRng(hashStr(`${seed}:${itemId}:outer-wisp-up`));
        const strandRows = Math.min(palette.hairDepth - 4, 3);
        const hbL = headAtMax.min;
        const hbR = headAtMax.max;
        let lastLx = null,
          lastRx = null;
        for (let row = 0; row < strandRows; row++) {
          const y = HEAD_Y_MAX + 1 + row;
          if (y >= SKIN_GRID_DIM) break;
          const ext = rngWisp() < 0.3 ? 2 : 1;
          const lMin = Math.max(0, hbL - ext);
          const rMax = Math.min(SKIN_GRID_DIM - 1, hbR + ext);
          for (let x = lMin; x < hbL; x++) matrix[y][x] = hairIdx;
          for (let x = hbR + 1; x <= rMax; x++) matrix[y][x] = hairIdx;
          if (lMin > 0 && matrix[y][lMin - 1] !== hairIdx) matrix[y][lMin - 1] = blackIdx;
          if (rMax < SKIN_GRID_DIM - 1 && matrix[y][rMax + 1] !== hairIdx) matrix[y][rMax + 1] = blackIdx;
          lastLx = lMin;
          lastRx = rMax;
        }
        const tipY = HEAD_Y_MAX + 1 + strandRows;
        if (tipY < SKIN_GRID_DIM) {
          if (lastLx !== null) matrix[tipY][Math.max(0, lastLx)] = blackIdx;
          if (lastRx !== null) matrix[tipY][Math.min(SKIN_GRID_DIM - 1, lastRx)] = blackIdx;
        }
      }
    }
    // 2c side. UPPER SIDE HAIR ARCH (UP) — mirrors 2d in buildDirectionMatrix;
    //          thick arch starting at y=10, widest at the crown.
    {
      const UPPER_ANCHOR_Y = HEAD_Y_MAX - 2; // y=10
      const headAtUpper = headBounds.get(UPPER_ANCHOR_Y);
      if (headAtUpper && palette.hairDepth >= 5) {
        const rngWisp2 = lcgRng(hashStr(`${seed}:${itemId}:outer-wisp2-up`));
        const strandRows2 = Math.min(palette.hairDepth - 4, 3);
        const hbL2 = headAtUpper.min;
        const hbR2 = headAtUpper.max;
        const extBase = [2, 3, 4];
        let lastLx2 = null,
          lastRx2 = null;
        for (let row = 0; row < strandRows2; row++) {
          const y = UPPER_ANCHOR_Y + row; // y=10, y=11, y=12
          if (y >= SKIN_GRID_DIM) break;
          const ext2 = extBase[row] + (rngWisp2() < 0.4 ? 1 : 0);
          const innerL2 = hbL2 + 2; // 2 px toward center
          const innerR2 = hbR2 - 2;
          const lMin2 = Math.max(0, innerL2 - ext2);
          const rMax2 = Math.min(SKIN_GRID_DIM - 1, innerR2 + ext2);
          for (let x = lMin2; x < innerL2; x++) matrix[y][x] = hairIdx;
          for (let x = innerR2 + 1; x <= rMax2; x++) matrix[y][x] = hairIdx;
          if (lMin2 > 0 && matrix[y][lMin2 - 1] !== hairIdx) matrix[y][lMin2 - 1] = blackIdx;
          if (rMax2 < SKIN_GRID_DIM - 1 && matrix[y][rMax2 + 1] !== hairIdx) matrix[y][rMax2 + 1] = blackIdx;
          lastLx2 = lMin2;
          lastRx2 = rMax2;
        }
        const tipY2 = UPPER_ANCHOR_Y + strandRows2;
        if (tipY2 < SKIN_GRID_DIM) {
          if (lastLx2 !== null && matrix[tipY2][Math.max(0, lastLx2)] !== hairIdx)
            matrix[tipY2][Math.max(0, lastLx2)] = blackIdx;
          if (lastRx2 !== null && matrix[tipY2][Math.min(SKIN_GRID_DIM - 1, lastRx2)] !== hairIdx)
            matrix[tipY2][Math.min(SKIN_GRID_DIM - 1, lastRx2)] = blackIdx;
        }
      }
    }
    // 2d. HEAD HAIR EDGE DISTORTIONS (UP) — 5–9 stray pixels along the outer
    //     head silhouette for organic texture.  Identical approach to 2e in
    //     buildDirectionMatrix, using headBounds for column references.
    {
      const rngDist = lcgRng(hashStr(`${seed}:${itemId}:hair-distort-up`));
      const hbKeys = [...headBounds.keys()];
      const numDistort = 5 + Math.floor(rngDist() * 5);
      for (let i = 0; i < numDistort; i++) {
        const y = hbKeys[Math.floor(rngDist() * hbKeys.length)];
        const bnd = headBounds.get(y);
        if (!bnd) continue;
        const side = rngDist() < 0.5 ? -1 : 1;
        const px = side < 0 ? bnd.min - 1 : bnd.max + 1;
        if (px >= 0 && px < SKIN_GRID_DIM && matrix[y][px] !== hairIdx) {
          matrix[y][px] = hairIdx;
          const bx = px + side;
          if (bx >= 0 && bx < SKIN_GRID_DIM && matrix[y][bx] !== hairIdx) matrix[y][bx] = blackIdx;
        }
      }
    }
    // 2e. MID-CROWN SIDE HAIR ARC (UP) — mirrors 2f in buildDirectionMatrix;
    //     same 7-row arc centered at y=7, using headBounds for the silhouette
    //     edge reference instead of zones.border.
    {
      const CROWN_Y = 7;
      const crownW = [3, 2, 2, 1];
      const rngCrown = lcgRng(hashStr(`${seed}:${itemId}:crown-side-up`));
      for (let dy = -3; dy <= 3; dy++) {
        const y = CROWN_Y + dy;
        if (y < 0 || y >= SKIN_GRID_DIM) continue;
        const bnd = headBounds.get(y);
        if (!bnd) continue;
        const hbL = bnd.min;
        const hbR = bnd.max;
        const ext = crownW[Math.abs(dy)] + (rngCrown() < 0.4 ? 1 : 0);
        const lMin = Math.max(0, hbL - ext);
        for (let x = lMin; x < hbL; x++) matrix[y][x] = hairIdx;
        if (lMin > 0 && matrix[y][lMin - 1] !== hairIdx) matrix[y][lMin - 1] = blackIdx;
        const rMax = Math.min(SKIN_GRID_DIM - 1, hbR + ext);
        for (let x = hbR + 1; x <= rMax; x++) matrix[y][x] = hairIdx;
        if (rMax < SKIN_GRID_DIM - 1 && matrix[y][rMax + 1] !== hairIdx) matrix[y][rMax + 1] = blackIdx;
        if (rngCrown() < 0.3) {
          const px = lMin - 1;
          if (px >= 0 && matrix[y][px] !== hairIdx) {
            matrix[y][px] = hairIdx;
            if (px > 0 && matrix[y][px - 1] !== hairIdx) matrix[y][px - 1] = blackIdx;
          }
        }
        if (rngCrown() < 0.3) {
          const px = rMax + 1;
          if (px < SKIN_GRID_DIM && matrix[y][px] !== hairIdx) {
            matrix[y][px] = hairIdx;
            if (px < SKIN_GRID_DIM - 1 && matrix[y][px + 1] !== hairIdx) matrix[y][px + 1] = blackIdx;
          }
        }
      }
    }
    // 4. EXTENDED HAIR — flows below the head onto the upper back.
    //    hairDepth (5–11) maps to hairExtend (2–8 rows below HEAD_Y_MAX).
    const hairExtend = Math.min(palette.hairDepth - 3, 6); // 5→2 … 9→6, capped at 6
    const extMaxY = Math.min(HEAD_Y_MAX + hairExtend, SKIN_GRID_DIM - 2);
    // Compute body-bounds for each extension row (centering reference)
    const extBounds = new Map();
    for (const [x, y] of allBodyCoords) {
      if (y <= HEAD_Y_MAX || y > extMaxY) continue;
      const b = extBounds.get(y) || { min: x, max: x };
      b.min = Math.min(b.min, x);
      b.max = Math.max(b.max, x);
      extBounds.set(y, b);
    }
    const extYs = [...extBounds.keys()].sort((a, b) => a - b);
    // Track actual hair strip bounds per row (for border painting)
    const hairStripBounds = new Map();
    for (const y of extYs) {
      const { min, max } = extBounds.get(y);
      const cx = (min + max) / 2;
      const bodyHalfW = (max - min) / 2;
      const yDist = y - HEAD_Y_MAX;
      // Taper: narrower further from the head
      const taper = Math.max(0.35, 1 - yDist * 0.08);
      const halfW = Math.max(2, Math.round(bodyHalfW * taper));
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
      if (min > 0 && matrix[y][min - 1] !== hairIdx) matrix[y][min - 1] = blackIdx;
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
      const side = rng() < 0.5 ? -1 : 1;
      const baseX = side < 0 ? hb.min - 1 : hb.max + 1;
      if (baseX < 0 || baseX >= SKIN_GRID_DIM) continue;
      matrix[wy][baseX] = hairIdx;
      // Optional second wisp pixel
      if (rng() < 0.45) {
        const px2 = baseX + side;
        if (px2 >= 0 && px2 < SKIN_GRID_DIM) matrix[wy][px2] = hairIdx;
      }
      // Black closing tip
      const tipX =
        side < 0
          ? Math.max(0, baseX - (rng() < 0.45 ? 2 : 1))
          : Math.min(SKIN_GRID_DIM - 1, baseX + (rng() < 0.45 ? 2 : 1));
      if (matrix[wy][tipX] !== hairIdx) matrix[wy][tipX] = blackIdx;
    }
  } // end else (normal hair)
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
  const FOOT_TOP = SHOE_Y_MIN - 1; // y=22 — bottom of leg zone, just above shoes
  const midX = Math.floor(SKIN_GRID_DIM / 2); // x=12 — column boundary between left/right foot
  // Build one walk frame: copy idle, then raise shoe row up 1 px for the chosen side,
  // leaving y=SHOE_Y_MIN transparent for that foot.
  const makeFrame = (liftLeft) => {
    const frame = idleMatrix.map((row) => [...row]);
    const xFrom = liftLeft ? 0 : midX;
    const xTo = liftLeft ? midX : SKIN_GRID_DIM;
    for (let x = xFrom; x < xTo; x++) {
      frame[FOOT_TOP][x] = idleMatrix[SHOE_Y_MIN][x]; // raise shoe to y=22
      frame[SHOE_Y_MIN][x] = 0; // clear y=23 → transparent gap
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
  // Skin subtype is injected via the descriptor (set during registration).
  // Falls back to 'random' for the legacy skin- prefix or any unknown descriptor.
  const subtype = _descriptor?.skinSubtype ?? 'random';
  const palette = deriveSkinPalette(seed, itemId, subtype);
  // Build idle direction matrices
  const matrices = {
    down: buildDirectionMatrix(ZONES.down, palette, globalColors, seed, itemId, 'down'),
    up: buildUpDirectionMatrix(ZONES.up, palette, globalColors, seed, itemId),
    left: buildDirectionMatrix(ZONES.left, palette, globalColors, seed, itemId, 'left'),
    right: buildDirectionMatrix(ZONES.right, palette, globalColors, seed, itemId, 'right'),
  };
  // Build 2-frame walk cycles from idle matrices (shared color palette, no extra allocations)
  const walkFrames = {
    down: buildWalkFrames(matrices.down),
    up: buildWalkFrames(matrices.up),
    left: buildWalkFrames(matrices.left),
    right: buildWalkFrames(matrices.right),
  };
  // Idle: frameCount identical copies of the direction matrix.
  const makeIdleArray = (matrix) => Array.from({ length: frameCount }, () => matrix.map((row) => [...row]));
  // Walking: always exactly 2 frames (walk cycle is independent of frameCount).
  const makeWalkArray = (frames2) => frames2.map((m) => m.map((row) => [...row]));
  const objectLayerRenderFramesData = {
    frame_duration: frameDuration,
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
  /**
   * Skin subtypes — each maps a prefix to palette constraints.
   *
   * | Prefix          | Skin tone     | Hair pool          | hairDepth |
   * |-----------------|---------------|--------------------|----------|
   * | skin-random     | any           | any                | 5–11     |
   * | skin-dark       | dark (1–3)    | any                | 5–11     |
   * | skin-light      | light (6–8)   | any                | 5–11     |
   * | skin-vivid      | any           | vivid only         | 5–11     |
   * | skin-natural    | any           | natural only       | 5–11     |
   * | skin-shaved     | any           | any (unused)       | 0 only   |
   */
  const SUBTYPES = [
    { prefix: 'skin-random', subtype: 'random', desc: 'Fully random skin tone and hair' },
    { prefix: 'skin-dark', subtype: 'dark', desc: 'Dark skin tones' },
    { prefix: 'skin-light', subtype: 'light', desc: 'Light / pale skin tones' },
    { prefix: 'skin-vivid', subtype: 'vivid', desc: 'Vivid / exotic hair colours (blue, red, green…)' },
    { prefix: 'skin-natural', subtype: 'natural', desc: 'Natural hair colours (brown, blond, grey…)' },
    { prefix: 'skin-shaved', subtype: 'shaved', desc: 'Shaved / bald head — no hair' },
  ];
  const sharedLayers = {
    skin: { generator: 'template-zone' },
    hair: { generator: 'template-zone' },
    shirt: { generator: 'template-zone' },
    pants: { generator: 'template-zone' },
    shoes: { generator: 'template-zone' },
    border: { generator: 'template-zone' },
  };
  for (const { prefix, subtype, desc } of SUBTYPES) {
    registerFn(prefix, {
      semanticTags: ['character', 'body', 'humanoid'],
      paletteHints: [],
      preferredShapes: {},
      itemType: 'skin',
      skinSubtype: subtype,
      description: desc,
      layers: sharedLayers,
      // Custom generator bypasses the default shape/noise pipeline;
      // receives this descriptor so it can read skinSubtype.
      customMultiFrameGenerator: generateSkinMultiFrame,
    });
  }
}
