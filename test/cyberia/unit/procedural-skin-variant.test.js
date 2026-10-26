import { describe, it, expect } from 'vitest';
import {
  generateSpriteVariant,
  prepareSpriteBatch,
  spriteParameters,
} from '../../../src/projects/cyberia/procedural/generators/sprite/generator.js';
import { resolveProceduralContext } from '../../../src/projects/cyberia/procedural/context.js';
import { candidatePalette } from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { baselineSource } from '../../../src/projects/cyberia/procedural/source.js';
import {
  drawTemplate,
  protectedCells,
  regionsOf,
  resolveTemplate,
} from '../../../src/projects/cyberia/procedural/templates.js';
import { shapeOf, validateShape } from '../../../src/projects/cyberia/procedural/core/frame-mutation.js';
import { diversityBetween } from '../../../src/projects/cyberia/procedural/core/diversity.js';
import {
  framesByDirection,
  hexToRgba,
  sourceFromDirectionFrames,
  toWire,
} from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { RENDER_FRAME_CONTRACT } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import {
  SKIN_DEFAULT_PROFILE as profile,
  validateProfile,
} from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { BASELINE_SKIN, SKIN_TEMPLATE, paletteFixture } from '../../support/procedural-content.js';
import { bareSkin, skinSource } from '../../support/procedural-skin.js';

const ART = {
  brief: null,
  requiredVariants: [],
  palettes: [{ id: 'biome.red-green', group: 'biome', roles: { base: ['#aa0000', '#00aa00'] } }],
  references: [],
};
const template = resolveTemplate(SKIN_TEMPLATE);
const batchOf = (source, options = {}) =>
  prepareSpriteBatch(resolveProceduralContext({ source, template, profile, ...options }));
const render = batchOf(skinSource(template));
const bare = batchOf(bareSkin(template));
const parameters = spriteParameters({ variation: 0.6 }, profile);
const run = (batch, overrides = {}) =>
  generateSpriteVariant(batch, {
    itemId: 'human-skin-001',
    seed: 11,
    parameters,
    palette: candidatePalette(template),
    ...overrides,
  });
const paint = (hex) => [...hexToRgba(hex).slice(0, 3), 255].join();
const CODES = ['02', '04', '06', '08', '12', '14', '16', '18'];
const guardedOf = (code, index) => protectedCells(regionsOf(template, code, index), profile);

describe('skin variant parameters', () => {
  it('sets every granular variation from the one variation, and the diversity from the profile', () => {
    expect(spriteParameters({ variation: 0.4 }, profile)).toEqual({
      variation: 0.4,
      silhouetteVariation: 0.4,
      regionVariation: 0.4,
      hairVariation: 0.4,
      detailVariation: 0.4,
      paletteVariation: 0.4,
      hairStyle: 'auto',
      minDiversity: profile.constraints.diversity.threshold,
    });
    expect(spriteParameters({}, profile).hairVariation).toBe(0.5);
  });

  it('lets a granular variation, the hair style and the diversity override', () => {
    expect(
      spriteParameters({ variation: 0.4, hairVariation: 1, hairStyle: 'long', minDiversity: 0.2 }, profile),
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
    expect(() => spriteParameters({ speed: 1 }, profile)).toThrow(/Unknown sprite variant parameter: speed/);
    expect(() => spriteParameters({ variation: 0.05 }, bounded)).toThrow(/variation must be a number from 0.1 to 0.6/);
    expect(() => spriteParameters({ hairVariation: 0.9 }, bounded)).toThrow(/hairVariation/);
    expect(() => spriteParameters({ variation: 'high' }, profile)).toThrow(/variation/);
    expect(() => spriteParameters({ hairStyle: 'bald' }, profile)).toThrow(/hairStyle must be auto or one of/);
    expect(() => spriteParameters({ minDiversity: 2 }, profile)).toThrow(/minDiversity/);
  });
});

describe('a batch', () => {
  it('analyzes each frame of a render once: its regions, its protected cells and the rules of its facing', () => {
    expect(Object.keys(render.directions).sort()).toEqual(CODES);
    expect(render.directions['18'].frames).toHaveLength(2);
    expect(render.directions['08'].rule).toEqual({ ...profile.directionRules.down, facing: 'down' });
    expect(render.directions['18'].rule).toEqual(render.directions['08'].rule);
    expect(render.directions['02'].rule).toEqual({ face: 'back', hairMass: 1, facing: 'up' });
    render.directions['18'].frames.forEach(({ owned, protectedList }, index) => {
      expect(owned).toEqual(regionsOf(template, '18', index));
      expect(protectedList).toEqual(guardedOf('18', index));
    });
    expect(Object.keys(render.sourceBase).sort()).toEqual(['hair', 'legs', 'skin', 'torso']);
  });

  it('places the template regions on a render of another canvas: bottom on bottom, centre on centre', () => {
    const padded = (frame) => [
      [...frame[0], [0, 0, 0, 0]].map(() => [0, 0, 0, 0]),
      ...frame.map((row) => [[0, 0, 0, 0], ...row]),
    ];
    const wide = {
      ...skinSource(template),
      renderSource: sourceFromDirectionFrames({
        framesByCode: { '08': [padded(drawTemplate(template, '08'))] },
        frameDurationMs: 300,
      }),
    };
    const { owned, protectedList } = batchOf(wide).directions['08'].frames[0];
    expect(owned.torso).toEqual(regionsOf(template, '08', 0).torso.map(([x, y]) => [x + 1, y + 1]));
    expect(protectedList).toEqual(guardedOf('08', 0).map(([x, y]) => [x + 1, y + 1]));
  });

  it('draws the base item from the template when the source has no render: every frame of every facing', () => {
    expect(Object.keys(bare.directions).sort()).toEqual(CODES);
    expect(bare.directions['08'].frames).toHaveLength(1);
    expect(bare.directions['18'].frames).toHaveLength(2);
    expect(bare.sourceBase).toEqual({});
    expect(Object.keys(bare.baseFrames).sort()).toEqual(CODES);
    expect(bare.baseFrames['08'][0][12][12]).toEqual(paint(template.roles.skin.tones.base).split(',').map(Number));
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
    const partial = batchOf(skinSource(template, { codes: ['08', '18', '06'] }));
    const variant = run(partial);
    const [before, after] = [
      framesByDirection(skinSource(template, { codes: ['08', '18', '06'] }).renderSource),
      framesByDirection(variant.renderSource),
    ];
    for (const code of ['08', '06', '18']) expect(after[code]).toHaveLength(before[code].length);
    expect(['02', '04', '12', '14', '16'].every((code) => after[code].length === 0)).toBe(true);
    expect(variant.renderSource).toMatchObject({ width: 25, height: 25, frameDurationMs: 250 });
    expect(variant.metrics).toMatchObject({ directions: 3, frames: 4, tries: 1, rejectedTries: 0 });
  });

  it('keeps the shape of every frame inside the bounds of the profile and every protected cell as it was', () => {
    const source = framesByDirection(skinSource(template).renderSource);
    const variant = framesByDirection(run(render).renderSource);
    const { maxBoxGrowth, maxCentroidDrift } = profile.constraints.shape;
    for (const code of CODES)
      variant[code].forEach((frame, index) => {
        const tolerance = { sameCount: false, boxGrowth: maxBoxGrowth, centroidDrift: maxCentroidDrift };
        expect(validateShape(shapeOf(source[code][index]), shapeOf(frame), tolerance), `${code} ${index}`).toBe(true);
        for (const [x, y] of guardedOf(code, index))
          expect(frame[y][x][3] > 0, `${code} [${x},${y}]`).toBe(source[code][index][y][x][3] > 0);
      });
  });

  it('grows hair and moves region borders: the silhouette and the colors change beyond the contour', () => {
    const totals = [1, 2, 3, 4].map((seed) => run(render, { seed }).metrics);
    expect(totals.some(({ hairAdded }) => hairAdded > 0)).toBe(true);
    expect(totals.every(({ deformed, features }) => deformed > 0 && features > 0)).toBe(true);
  });

  it('draws the base item from the template when the source has no render: the whole frame contract', () => {
    const variant = run(bare);
    const frames = framesByDirection(variant.renderSource);
    for (const [code, least] of Object.entries(RENDER_FRAME_CONTRACT.skin)) expect(frames[code]).toHaveLength(least);
    expect(variant.metrics).toMatchObject({ directions: 8, frames: 12 });
    expect(variant.renderSource.frameDurationMs).toBe(template.frameDurationMs);
    expect(variant.data.item).toEqual({ id: 'human-skin-001', type: 'skin', description: 'a base', activable: true });
  });

  it('draws a new item from its Genesis Template: its function is the baseline item, its description empty', () => {
    const { stats } = BASELINE_SKIN.payload.data;
    const batch = batchOf(baselineSource('skin', { activable: true, stats }));
    expect(Object.keys(batch.directions).sort()).toEqual(CODES);
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

describe('the frames of a facing', () => {
  const variant = framesByDirection(run(bare).renderSource);
  const cellsOf = (frame, rows) =>
    rows.flatMap((y) => frame[y].map((cell, x) => (cell[3] > 0 ? `${x},${y}` : null)).filter(Boolean));

  it('walks with alternating legs: the two walking frames differ only below the torso', () => {
    for (const code of ['18', '12', '14', '16']) {
      const [left, right] = variant[code];
      const rows = [...Array(template.canvas.height).keys()];
      const changed = rows.filter((y) => JSON.stringify(left[y]) !== JSON.stringify(right[y]));
      expect(changed.length, code).toBeGreaterThan(0);
      const torsoTop = Math.min(...regionsOf(template, code, 0).torso.map(([, y]) => y));
      expect(Math.min(...changed), code).toBeGreaterThan(torsoTop);
    }
  });

  it('gives the idle and the walking frames of a facing the same head and hair', () => {
    for (const [idle, walk] of [
      ['08', '18'],
      ['02', '12'],
      ['04', '14'],
      ['06', '16'],
    ]) {
      const head = [...Array(14).keys()];
      expect(cellsOf(variant[walk][0], head), walk).toEqual(cellsOf(variant[idle][0], head));
    }
  });

  it('shows no face from the back: the back of the head keeps its hair whole', () => {
    const [frame] = variant['02'];
    for (const [x, y] of regionsOf(template, '02', 0).hair.filter(([, row]) => row > 5))
      expect(frame[y][x][3], `${x},${y}`).toBe(255);
  });
});

describe('palettes', () => {
  const colorsOfRegion = (variant, regionId, batch = render) => {
    const frame = framesByDirection(variant.renderSource)['08'][0];
    const { analysis, owned } = batch.directions['08'].frames[0];
    return new Set(
      owned[regionId].filter(([x, y]) => analysis.interior[y * analysis.width + x]).map(([x, y]) => frame[y][x].join()),
    );
  };

  const still = spriteParameters({ variation: 0 }, profile);

  it('colors the art roles from the foundation palettes: the torso takes the first base, the legs the second', () => {
    const palette = candidatePalette(template, { artDirection: ART });
    const variant = run(render, { parameters: spriteParameters({ variation: 1 }, profile), palette });
    expect(colorsOfRegion(variant, 'torso').has(paint('#aa0000'))).toBe(true);
    expect(colorsOfRegion(variant, 'leftLeg').has(paint('#00aa00'))).toBe(true);
  });

  it('colors every role from a palette, and moves none of them whatever the variation', () => {
    const chosen = paletteFixture('exotic-teal');
    const palette = candidatePalette(template, { palette: chosen });
    for (const parameters of [still, spriteParameters({ variation: 1 }, profile)]) {
      const variant = run(render, { parameters, palette });
      for (const [regionId, role] of [
        ['head', 'feature'],
        ['hair', 'detail'],
        ['torso', 'primary'],
      ])
        expect(colorsOfRegion(variant, regionId).has(paint(chosen.roles[role]))).toBe(true);
    }
  });

  it('colors a slot the moderator sets over the palette', () => {
    const palette = candidatePalette(template, {
      palette: paletteFixture('exotic-teal'),
      slots: { 'hair.base': '#ff00ff' },
    });
    expect(colorsOfRegion(run(render, { parameters: still, palette }), 'hair').has(paint('#ff00ff'))).toBe(true);
  });

  it('gives the candidates of two palettes distance in the palette metric', () => {
    const [left, right] = ['natural-deep', 'exotic-teal'].map((id) =>
      run(render, { parameters: still, palette: candidatePalette(template, { palette: paletteFixture(id) }) }),
    );
    expect(diversityBetween(left.diversity.signature, right.diversity.signature).palette).toBeGreaterThan(0.2);
  });
});

describe('diversity', () => {
  it('rejects a variant that is too near the source and fails when no try is far enough', () => {
    expect(() => run(render, { parameters: spriteParameters({ minDiversity: 1 }, profile) })).toThrow(
      /No variant passed its checks in 5 tries: diversity/,
    );
  });

  it('tries again from the next seed when a variant is too near a sibling, and records the seed that passed', () => {
    const first = run(render, { parameters: spriteParameters({ variation: 0.6, minDiversity: 0 }, profile) });
    const siblings = [{ id: 'first', signature: first.diversity.signature }];
    const second = run(render, {
      siblings,
      parameters: spriteParameters({ variation: 0.6, minDiversity: 0.01 }, profile),
    });
    expect(second.tries).toBeGreaterThan(1);
    expect(second.seed).not.toBe(first.seed);
    expect(second.diversity.score).toBeGreaterThanOrEqual(0.01);
    expect(second.metrics.rejectedTries).toBe(second.tries - 1);
  });

  it('rebuilds a variant from the seed it records, with no siblings', () => {
    const first = run(render, { parameters: spriteParameters({ variation: 0.6, minDiversity: 0 }, profile) });
    const second = run(render, {
      siblings: [{ id: 'first', signature: first.diversity.signature }],
      parameters: spriteParameters({ variation: 0.6, minDiversity: 0.01 }, profile),
    });
    const rebuilt = run(render, {
      seed: second.seed,
      parameters: spriteParameters({ variation: 0.6, minDiversity: 0 }, profile),
    });
    expect(toWire(rebuilt.renderSource)).toEqual(toWire(second.renderSource));
  });

  it('gives a batch of siblings that differ from one another by the least diversity', () => {
    const wanted = spriteParameters({ variation: 0.7, minDiversity: 0.05 }, profile);
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
        down: { face, hairMass: 1 },
      },
    });
  const featuresOf = (face) => {
    const variantProfile = facing(face);
    const batch = prepareSpriteBatch(
      resolveProceduralContext({ source: skinSource(template), template, profile: variantProfile }),
    );
    return generateSpriteVariant(batch, {
      itemId: 'a',
      seed: 3,
      palette: candidatePalette(template),
      parameters: spriteParameters({ variation: 0.6 }, variantProfile),
    }).metrics.features;
  };

  it('draws features by the rules of each facing: a back face none, a front face more than a side face', () => {
    expect(featuresOf('back')).toBeLessThan(featuresOf('side'));
    expect(featuresOf('side')).toBeLessThan(featuresOf('front'));
  });
});
