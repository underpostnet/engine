/**
 * Resource semantic descriptors for the Semantic Layer Generator.
 *
 * Provides procedural generation recipes for generic collectible resource
 * object layers.  Each colour palette is imported from the centralized
 * BIOME_PALETTES (shared with floor descriptors).
 *
 * Each biome is paired with four distinct shape families:
 *
 *   • **petal**   — several parabolic arcs facing the same general direction,
 *                   reminiscent of a semi-ring of Saturn.  Open curves are
 *                   scanline-filled so each arc reads as a coloured petal.
 *   • **stone**   — hard, angular mineral shapes (circle, pixel-art); filled.
 *   • **polygon** — perfect regular geometric figures (triangles, squares,
 *                   pentagons, hexagons); filled with near-zero noise.
 *   • **thread**  — thin, wispy lines composed of Bézier curves and
 *                   parabolas; NOT filled — rendered as outlines only.
 *
 * Naming convention: `resource-{biome}-{shape}`
 *   e.g. `resource-desert-petal`, `resource-grass-stone`, `resource-lava-thread`
 *
 * All descriptors use `itemType: 'floor'` so the default single-direction
 * frame pipeline (`down_idle` / `default_idle`) is used — matching the
 * stateless, non-directional nature of world-placed resource pickups.
 *
 * @module src/server/semantic-layer-generator-resource.js
 * @namespace SemanticLayerGeneratorResource
 */

import { BIOME_PALETTES } from './semantic-layer-generator.js';

/* ═══════════════════════════════════════════════════════════════════════════
 *  SHAPE FAMILY RECIPES
 *
 *  Each recipe defines:
 *    tags            — semantic tags appended to the biome tags
 *    preferredShapes — shape → weight map for the shape picker
 *    layers          — ordered LayerSpec dict (rendered bottom→top)
 * ═══════════════════════════════════════════════════════════════════════════ */

const SHAPE_FAMILIES = {
  /* ── Petal — thick parabolic arcs all facing roughly the same direction ─
   *  Uses `thick-parabola` — a closed band shape that traces the outer
   *  parabola forward and the inner parabola backward, producing a thick
   *  filled crescent.  Two layers with slightly different curvature &
   *  thickness overlap to build a bold Saturn-ring effect.
   * ───────────────────────────────────────────────────────────────────── */
  petal: {
    tags: ['petal', 'arc', 'crescent', 'organic'],
    preferredShapes: { 'thick-parabola': 5 },
    layers: {
      arcs: {
        generator: 'shape',
        shapes: ['thick-parabola'],
        count: 2,
        scaleBase: 0.45,
        scaleRange: 0.15,
        scaleVariance: 0.1,
        rotationBase: 90,              // vertical parabolas
        rotationVariance: 10,
        colorShift: 18,
        jitter: 0.04,
        noiseLevel: 0.04,
        detailLevel: 1.2,
        sparsity: 0.05,
        centerBias: 0.6,              // cluster near tile centre
        frameJitter: 0.008,
        frameRotation: 1.5,
        frameScale: 0.004,
        fill: true,
        shapeParams: { a: 0.5, rangeX: 1.3, thickness: 0.35 },
      },
      inner: {
        generator: 'shape',
        shapes: ['thick-parabola'],
        count: 1,
        scaleBase: 0.35,
        scaleRange: 0.15,
        scaleVariance: 0.1,
        rotationBase: 90,
        rotationVariance: 6,
        colorShift: 24,
        jitter: 0.03,
        noiseLevel: 0.03,
        detailLevel: 1.0,
        sparsity: 0.05,
        centerBias: 0.6,
        frameJitter: 0.006,
        frameRotation: 1.0,
        frameScale: 0.003,
        fill: true,
        shapeParams: { a: 0.6, rangeX: 1.2, thickness: 0.4 },
      },
    },
  },

  /* ── Stone — hard, angular mineral shapes (filled) ────────────────────── */
  stone: {
    tags: ['stone', 'mineral', 'rock', 'hard'],
    preferredShapes: { circle: 3, 'pixel-art': 3, star: 1, ellipse: 1 },
    layers: {
      body: {
        generator: 'shape',
        shapes: ['circle', 'pixel-art'],
        count: 3,
        scaleVariance: 0.35,
        rotationVariance: 90,
        colorShift: 10,
        jitter: 0.06,
        noiseLevel: 0.18,
        detailLevel: 1.2,
        sparsity: 0.1,
        frameJitter: 0.002,
        frameRotation: 0.3,
        frameScale: 0.002,
        fill: true,
      },
      chips: {
        generator: 'shape',
        shapes: ['star', 'pixel-art'],
        count: 4,
        scaleVariance: 0.4,
        rotationVariance: 180,
        colorShift: 16,
        jitter: 0.1,
        noiseLevel: 0.2,
        detailLevel: 0.9,
        sparsity: 0.3,
        frameJitter: 0.001,
        frameRotation: 0.2,
        frameScale: 0.001,
        fill: true,
      },
    },
  },

  /* ── Polygon — one geometric shape repeated with variations ───────────
   *  A single regular polygon (square) repeated several times with
   *  varying scale, rotation, and colour — clearly geometric,
   *  possibly overlapping.  Zero noise keeps edges ruler-straight.
   * ───────────────────────────────────────────────────────────────────── */
  polygon: {
    tags: ['polygon', 'crystal', 'geometric', 'facet'],
    preferredShapes: { 'regular-polygon': 6 },
    layers: {
      figures: {
        generator: 'shape',
        shapes: ['regular-polygon'],
        count: 3,
        scaleBase: 0.25,
        scaleRange: 0.25,
        scaleVariance: 0.15,
        rotationVariance: 25,
        colorShift: 20,
        jitter: 0.02,
        noiseLevel: 0.0,
        detailLevel: 1.3,
        sparsity: 0.0,
        centerBias: 0.75,             // stack near tile centre
        frameJitter: 0.003,
        frameRotation: 0.8,
        frameScale: 0.002,
        fill: true,
        shapeParams: { sides: 4 },
      },
    },
  },

  /* ── Thread — thin, wispy wavy lines (outlines only, NOT filled) ──────
   *  Bézier curves and parabolas rendered as open contours.  High count
   *  gives a tangle-of-threads appearance.
   * ───────────────────────────────────────────────────────────────────── */
  thread: {
    tags: ['thread', 'fiber', 'sewing', 'wisp'],
    preferredShapes: { 'bezier-path': 4, parabola: 3 },
    layers: {
      strands: {
        generator: 'shape',
        shapes: ['bezier-path', 'parabola'],
        count: 7,
        scaleVariance: 0.35,
        rotationVariance: 180,
        colorShift: 14,
        jitter: 0.12,
        noiseLevel: 0.15,
        detailLevel: 1.0,
        sparsity: 0.15,
        frameJitter: 0.015,
        frameRotation: 3.0,
        frameScale: 0.006,
        fill: false, // outlines only — wavy lines
        shapeParams: { closed: false },
      },
      wisps: {
        generator: 'shape',
        shapes: ['bezier-path'],
        count: 4,
        scaleVariance: 0.3,
        rotationVariance: 120,
        colorShift: 10,
        jitter: 0.1,
        noiseLevel: 0.1,
        detailLevel: 0.9,
        sparsity: 0.3,
        frameJitter: 0.01,
        frameRotation: 2.0,
        frameScale: 0.004,
        fill: false,
        shapeParams: { closed: false },
      },
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  BIOME SEMANTIC TAGS
 * ═══════════════════════════════════════════════════════════════════════════ */

const BIOME_TAGS = {
  desert: ['sand', 'arid', 'dry'],
  grass: ['grass', 'meadow', 'earth'],
  water: ['water', 'ocean', 'liquid'],
  stone: ['rock', 'cobble', 'grey'],
  lava: ['lava', 'magma', 'fire'],
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  REGISTRATION
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Registers all built-in resource semantic descriptors.
 *
 * Generates 5 biomes × 4 shape families = 20 descriptors, each registered
 * under the prefix `resource-{biome}-{shape}`.
 *
 * @param {function(string, import('./semantic-layer-generator.js').SemanticDescriptor): void} registerFn
 * @memberof SemanticLayerGeneratorResource
 */
export function registerResourceSemantics(registerFn) {
  const biomes = Object.keys(BIOME_PALETTES);
  const families = Object.keys(SHAPE_FAMILIES);

  for (const biome of biomes) {
    for (const family of families) {
      const prefix = `resource-${biome}-${family}`;
      const palette = BIOME_PALETTES[biome];
      const recipe = SHAPE_FAMILIES[family];

      registerFn(prefix, {
        semanticTags: [...BIOME_TAGS[biome], ...recipe.tags, 'resource'],
        paletteHints: palette,
        preferredShapes: recipe.preferredShapes,
        itemType: 'floor',
        layers: recipe.layers,
      });
    }
  }
}
