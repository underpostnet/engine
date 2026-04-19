/**
 * Floor semantic descriptors for the Semantic Layer Generator.
 *
 * Provides procedural generation recipes for all floor-type object layers:
 * desert, grass, water, stone, and lava.  Imported by the main
 * semantic-layer-generator.js which registers them at startup.
 *
 * Biome palettes are imported from the centralized BIOME_PALETTES in the
 * parent module (circular import is safe because the function body is only
 * executed after module initialisation completes).
 *
 * @module src/server/semantic-layer-generator-floor.js
 * @namespace SemanticLayerGeneratorFloor
 */

import { BIOME_PALETTES } from './semantic-layer-generator.js';

/* ═══════════════════════════════════════════════════════════════════════════
 *  FLOOR SEMANTIC REGISTRY
 *  Call registerFloorSemantics(registerFn) once to add all floor descriptors.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Registers all built-in floor semantic descriptors.
 *
 * @param {function(string, import('./semantic-layer-generator.js').SemanticDescriptor): void} registerFn
 * @memberof SemanticLayerGeneratorFloor
 */
export function registerFloorSemantics(registerFn) {
  /* ── Desert ───────────────────────────────────────────────────────────── */
  registerFn('floor-desert', {
    semanticTags: ['sand', 'dune', 'arid', 'dry'],
    paletteHints: BIOME_PALETTES.desert,
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

  /* ── Grass ────────────────────────────────────────────────────────────── */
  registerFn('floor-grass', {
    semanticTags: ['grass', 'meadow', 'green', 'earth'],
    paletteHints: BIOME_PALETTES.grass,
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

  /* ── Water ────────────────────────────────────────────────────────────── */
  registerFn('floor-water', {
    semanticTags: ['water', 'ocean', 'wave', 'liquid'],
    paletteHints: BIOME_PALETTES.water,
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

  /* ── Stone ────────────────────────────────────────────────────────────── */
  registerFn('floor-stone', {
    semanticTags: ['stone', 'rock', 'cobble', 'grey'],
    paletteHints: BIOME_PALETTES.stone,
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

  /* ── Lava ─────────────────────────────────────────────────────────────── */
  registerFn('floor-lava', {
    semanticTags: ['lava', 'magma', 'fire', 'hot'],
    paletteHints: BIOME_PALETTES.lava,
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
}
