import { describe, it, expect } from 'vitest';
import {
  generateSkinVariant,
  prepareSkinBatch,
  skinParameters,
} from '../../../src/projects/cyberia/procedural/generators/skin/generator.js';
import { resolveProceduralContext } from '../../../src/projects/cyberia/procedural/context.js';
import { candidatePalette } from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { baselineSource } from '../../../src/projects/cyberia/procedural/source.js';
import { protectedCells, resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import { shapeOf, validateShape } from '../../../src/projects/cyberia/procedural/core/frame-mutation.js';
import { diversityBetween } from '../../../src/projects/cyberia/procedural/core/diversity.js';
import {
  framesByDirection,
  hexToRgba,
  toWire,
} from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import {
  SKIN_DEFAULT_PROFILE as profile,
  validateProfile,
} from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { BASELINE_SKIN, SKIN_PALETTES, SKIN_TEMPLATE } from '../../support/procedural-content.js';
import { bareSkin, skinSource } from '../../support/procedural-skin.js';

const ART = {
  brief: null,
  requiredVariants: [],
  palettes: [{ id: 'biome.red-green', group: 'biome', roles: { base: ['#aa0000', '#00aa00'] } }],
  references: [],
};
const template = resolveTemplate(SKIN_TEMPLATE);
const paletteOf = (id) => SKIN_PALETTES.find((palette) => palette.id === id);
const batchOf = (source, options = {}) =>
  prepareSkinBatch(resolveProceduralContext({ source, template, profile, ...options }));
const render = batchOf(skinSource(template));
const bare = batchOf(bareSkin(template));
const parameters = skinParameters({ variation: 0.6 }, profile);
const run = (batch, overrides = {}) =>
  generateSkinVariant(batch, {
    itemId: 'human-skin-001',
    seed: 11,
    parameters,
    palette: candidatePalette(template),
    ...overrides,
  });
const paint = (hex) => [...hexToRgba(hex).slice(0, 3), 255].join();

describe('skin variant parameters', () => {
  it('sets every granular variation from the one variation, and the diversity from the profile', () => {
    expect(skinParameters({ variation: 0.4 }, profile)).toEqual({
      variation: 0.4,
      silhouetteVariation: 0.4,
      regionVariation: 0.4,
      hairVariation: 0.4,
      detailVariation: 0.4,
      paletteVariation: 0.4,
      hairStyle: 'auto',
      minDiversity: profile.constraints.diversity.threshold,
    });
    expect(skinParameters({}, profile).hairVariation).toBe(0.5);
  });

  it('lets a granular variation, the hair style and the diversity override', () => {
    expect(
      skinParameters({ variation: 0.4, hairVariation: 1, hairStyle: 'long', minDiversity: 0.2 }, profile),
    ).toMatchObject({
      silhouetteVariation: 0.4,
      hairVariation: 1,
      hairStyle: 'long',
      minDiversity: 0.2,
    });
  });

  it('refuses an unknown parameter, a variation outside the bounds, an unknown style and a bad diversity', () => {
    const bounded = validateProfile({
      ...profile,
      constraints: { ...profile.constraints, variationBounds: { min: 0.1, max: 0.6 } },
    });
    expect(() => skinParameters({ speed: 1 }, profile)).toThrow(/Unknown skin variant parameter: speed/);
    expect(() => skinParameters({ variation: 0.05 }, bounded)).toThrow(/variation must be a number from 0.1 to 0.6/);
    expect(() => skinParameters({ hairVariation: 0.9 }, bounded)).toThrow(/hairVariation/);
    expect(() => skinParameters({ variation: 'high' }, profile)).toThrow(/variation/);
    expect(() => skinParameters({ hairStyle: 'bald' }, profile)).toThrow(/hairStyle must be auto or one of/);
    expect(() => skinParameters({ minDiversity: 2 }, profile)).toThrow(/minDiversity/);
  });
});

describe('a batch', () => {
  it('analyzes each direction of a render once: frames, regions, rules and protected cells', () => {
    expect(Object.keys(render.directions).sort()).toEqual(['06', '08', '18']);
    expect(render.directions['08'].frames).toHaveLength(2);
    expect(render.directions['08'].rule).toEqual(profile.directionRules['08']);
    expect(render.directions['18'].rule).toBeNull();
    expect(render.directions['08'].protectedList).toEqual(protectedCells(template, profile, '08'));
    expect(Object.keys(render.sourceBase).sort()).toEqual(['hair', 'legs', 'skin', 'torso']);
  });

  it('derives the region of a direction the template does not map from the interior of its silhouette', () => {
    expect(Object.keys(render.directions['18'].owned)).toEqual(['skin']);
    expect(render.directions['18'].owned.skin.length).toBeGreaterThan(0);
  });

  it('draws the base item from the template when the source has no render', () => {
    expect(Object.keys(bare.directions).sort()).toEqual(['06', '08']);
    expect(bare.directions['08'].frames).toHaveLength(1);
    expect(bare.sourceBase).toEqual({});
    expect(Object.keys(bare.baseFrames).sort()).toEqual(['06', '08']);
    expect(bare.baseFrames['08'][12][12]).toEqual(paint(template.roles.skin.tones.base).split(',').map(Number));
  });
});

describe('skin variant generation', () => {
  it('gives the same render, metrics, diversity and seed for the same input', () => {
    const [first, second] = [run(render), run(render)];
    expect(toWire(first.renderSource)).toEqual(toWire(second.renderSource));
    expect(second.metrics).toEqual(first.metrics);
    expect(second.diversity).toEqual(first.diversity);
    expect(second.seed).toBe(first.seed);
  });

  it('gives another variant for another seed, and a variant that differs from the source', () => {
    const renders = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(toWire(run(render, { seed }).renderSource))),
    );
    expect(renders.size).toBeGreaterThan(1);
    expect(run(render).diversity.score).toBeGreaterThanOrEqual(parameters.minDiversity);
    expect(run(render).diversity.nearest).toBe('source');
  });

  it('keeps the directions, the frame counts, the canvas and the frame duration of the source', () => {
    const variant = run(render);
    const [before, after] = [
      framesByDirection(skinSource(template).renderSource),
      framesByDirection(variant.renderSource),
    ];
    for (const code of ['08', '06', '18']) expect(after[code]).toHaveLength(before[code].length);
    expect(['02', '04', '12', '14', '16'].every((code) => after[code].length === 0)).toBe(true);
    expect(variant.renderSource).toMatchObject({ width: 25, height: 25, frameDurationMs: 250 });
    expect(variant.metrics).toMatchObject({ directions: 3, frames: 6, tries: 1, rejectedTries: 0 });
  });

  it('keeps the shape of every frame inside the bounds of the profile and every protected cell as it was', () => {
    const source = framesByDirection(skinSource(template).renderSource);
    const variant = framesByDirection(run(render).renderSource);
    const { maxBoxGrowth, maxCentroidDrift } = profile.constraints.shape;
    for (const code of ['08', '06', '18'])
      variant[code].forEach((frame, index) => {
        const tolerance = { sameCount: false, boxGrowth: maxBoxGrowth, centroidDrift: maxCentroidDrift };
        expect(validateShape(shapeOf(source[code][index]), shapeOf(frame), tolerance), `${code} ${index}`).toBe(true);
        for (const [x, y] of protectedCells(template, profile, code))
          expect(frame[y][x][3] > 0, `${code} [${x},${y}]`).toBe(source[code][index][y][x][3] > 0);
      });
  });

  it('grows hair and moves region borders: the silhouette and the colors change beyond the contour', () => {
    const totals = [1, 2, 3, 4].map((seed) => run(render, { seed }).metrics);
    expect(totals.some(({ hairAdded }) => hairAdded > 0)).toBe(true);
    expect(totals.every(({ deformed, features }) => deformed > 0 && features > 0)).toBe(true);
  });

  it('draws the base item from the template when the source has no render, in the template directions', () => {
    const variant = run(bare);
    const frames = framesByDirection(variant.renderSource);
    expect(frames['08']).toHaveLength(1);
    expect(frames['06']).toHaveLength(1);
    expect(frames['18']).toHaveLength(0);
    expect(variant.renderSource.frameDurationMs).toBe(template.frameDurationMs);
    expect(variant.data.item).toEqual({ id: 'human-skin-001', type: 'skin', description: 'a base', activable: true });
  });

  it('draws a new item from its Genesis Template: its function is the baseline item, its description empty', () => {
    const { stats } = BASELINE_SKIN.payload.data;
    const batch = batchOf(baselineSource('skin', { activable: true, stats }));
    expect(Object.keys(batch.directions).sort()).toEqual(['06', '08']);
    const variant = run(batch, { itemId: 'new-skin-001' });
    expect(variant.data).toEqual({
      item: { id: 'new-skin-001', type: 'skin', description: '', activable: true },
      stats,
    });
  });

  it('names the variant by the item id and keeps the source type, activation and stats', () => {
    expect(run(render).data).toEqual({
      item: { id: 'human-skin-001', type: 'skin', description: 'a base', activable: true },
      stats: { effect: 1, agility: 4 },
    });
  });
});

describe('palettes', () => {
  const colorsOfRegion = (variant, regionId, batch = render) => {
    const frame = framesByDirection(variant.renderSource)['08'][0];
    const { analysis } = batch.directions['08'].frames[0];
    return new Set(
      batch.directions['08'].owned[regionId]
        .filter(([x, y]) => analysis.interior[y * analysis.width + x])
        .map(([x, y]) => frame[y][x].join()),
    );
  };

  const still = skinParameters({ variation: 0 }, profile);

  it('colors the art roles from the foundation palettes: the torso takes the first base, the legs the second', () => {
    const palette = candidatePalette(template, { artDirection: ART });
    const variant = run(render, { parameters: skinParameters({ variation: 1 }, profile), palette });
    expect(colorsOfRegion(variant, 'torso').has(paint('#aa0000'))).toBe(true);
    expect(colorsOfRegion(variant, 'leftLeg').has(paint('#00aa00'))).toBe(true);
  });

  it('colors every role from a Palette Template, and moves none of them whatever the variation', () => {
    const chosen = paletteOf('skin.exotic-teal');
    const palette = candidatePalette(template, { palette: chosen });
    for (const parameters of [still, skinParameters({ variation: 1 }, profile)]) {
      const variant = run(render, { parameters, palette });
      for (const [regionId, role] of [
        ['head', 'skin'],
        ['hair', 'hair'],
        ['torso', 'torso'],
      ])
        expect(colorsOfRegion(variant, regionId).has(paint(chosen.roles[role]))).toBe(true);
    }
  });

  it('colors a slot the moderator sets over the Palette Template', () => {
    const palette = candidatePalette(template, {
      palette: paletteOf('skin.exotic-teal'),
      slots: { 'hair.base': '#ff00ff' },
    });
    expect(colorsOfRegion(run(render, { parameters: still, palette }), 'hair').has(paint('#ff00ff'))).toBe(true);
  });

  it('gives the candidates of two palettes distance in the palette metric', () => {
    const [left, right] = ['skin.natural-deep', 'skin.exotic-teal'].map((id) =>
      run(render, { parameters: still, palette: candidatePalette(template, { palette: paletteOf(id) }) }),
    );
    expect(diversityBetween(left.diversity.signature, right.diversity.signature).palette).toBeGreaterThan(0.2);
  });
});

describe('diversity', () => {
  it('rejects a variant that is too near the source and fails when no try is far enough', () => {
    expect(() => run(render, { parameters: skinParameters({ minDiversity: 1 }, profile) })).toThrow(
      /No variant passed its checks in 5 tries: diversity/,
    );
  });

  it('tries again from the next seed when a variant is too near a sibling, and records the seed that passed', () => {
    const first = run(render, { parameters: skinParameters({ variation: 0.6, minDiversity: 0 }, profile) });
    const siblings = [{ id: 'first', signature: first.diversity.signature }];
    const second = run(render, {
      siblings,
      parameters: skinParameters({ variation: 0.6, minDiversity: 0.01 }, profile),
    });
    expect(second.tries).toBeGreaterThan(1);
    expect(second.seed).not.toBe(first.seed);
    expect(second.diversity.score).toBeGreaterThanOrEqual(0.01);
    expect(second.metrics.rejectedTries).toBe(second.tries - 1);
  });

  it('rebuilds a variant from the seed it records, with no siblings', () => {
    const first = run(render, { parameters: skinParameters({ variation: 0.6, minDiversity: 0 }, profile) });
    const second = run(render, {
      siblings: [{ id: 'first', signature: first.diversity.signature }],
      parameters: skinParameters({ variation: 0.6, minDiversity: 0.01 }, profile),
    });
    const rebuilt = run(render, {
      seed: second.seed,
      parameters: skinParameters({ variation: 0.6, minDiversity: 0 }, profile),
    });
    expect(toWire(rebuilt.renderSource)).toEqual(toWire(second.renderSource));
  });

  it('gives a batch of siblings that differ from one another by the least diversity', () => {
    const wanted = skinParameters({ variation: 0.7, minDiversity: 0.05 }, profile);
    const siblings = [];
    for (const seed of [1, 2, 3, 4]) {
      const variant = run(render, { seed, siblings, parameters: wanted });
      siblings.push({ id: `v${seed}`, signature: variant.diversity.signature });
    }
    for (let at = 1; at < siblings.length; at++)
      for (let other = 0; other < at; other++)
        expect(diversityBetween(siblings[at].signature, siblings[other].signature).score).toBeGreaterThanOrEqual(0.05);
  });
});

describe('directions', () => {
  const facing = (face) =>
    validateProfile({
      ...profile,
      directionRules: {
        ...profile.directionRules,
        '08': { facing: face === 'back' ? 'up' : 'down', face, hairMass: 1 },
      },
    });
  const featuresOf = (face) => {
    const variantProfile = facing(face);
    const batch = prepareSkinBatch(
      resolveProceduralContext({ source: skinSource(template), template, profile: variantProfile }),
    );
    return generateSkinVariant(batch, {
      itemId: 'a',
      seed: 3,
      palette: candidatePalette(template),
      parameters: skinParameters({ variation: 0.6 }, variantProfile),
    }).metrics.features;
  };

  it('draws features by the rules of each direction: a back face none, a front face more than a side face', () => {
    expect(featuresOf('back')).toBeLessThan(featuresOf('side'));
    expect(featuresOf('side')).toBeLessThan(featuresOf('front'));
  });
});
