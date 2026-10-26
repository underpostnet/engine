import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILES,
  FLOOR_DEFAULT_PROFILE,
  SKIN_DEFAULT_PROFILE,
  validateProfile,
} from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { GENERATORS } from '../../../src/projects/cyberia/procedural/generator-registry.js';
import { RENDER_FRAME_CONTRACT } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { facingOf } from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';

const profile = (overrides = {}) => ({
  profileId: 'tiny-skin',
  generatorId: 'skin-variant',
  itemType: 'skin',
  regionOrder: ['hair', 'skin'],
  directionRules: { down: { face: 'front' } },
  constraints: {},
  ...overrides,
});

describe('procedural profile validation', () => {
  it('stores a normalized copy with the defaults of rules and constraints', () => {
    const checked = validateProfile(profile());
    expect(checked.directionRules.down).toEqual({ face: 'front', hairMass: 1 });
    expect(checked.constraints).toEqual({
      protectedRegions: [],
      variationBounds: { min: 0, max: 1 },
      shape: { maxBoxGrowth: 3, maxCentroidDrift: 2 },
      diversity: { threshold: 0.05 },
      deformablePairs: [],
    });
    expect(validateProfile(checked)).toEqual(checked);
  });

  it('holds no region map, color, item semantics or binding', () => {
    expect(Object.keys(validateProfile(profile({ canvas: {}, template: {}, directions: {} }))).sort()).toEqual([
      'constraints',
      'directionRules',
      'generatorId',
      'itemType',
      'profileId',
      'regionOrder',
    ]);
  });

  it.each([
    ['an id with a capital', { profileId: 'Skin' }, /profileId/],
    ['no generator', { generatorId: '' }, /generatorId/],
    ['no item type', { itemType: '' }, /itemType/],
    ['a repeated region id in the order', { regionOrder: ['skin', 'skin'] }, /regionOrder/],
    ['direction rules that are no map', { directionRules: [] }, /directionRules/],
    ['a direction code in place of a facing', { directionRules: { '08': { face: 'front' } } }, /08 is not a facing/],
  ])('refuses %s', (_, overrides, message) => {
    expect(() => validateProfile(profile(overrides))).toThrow(message);
  });

  it('refuses rules that name no face or a hair mass out of range', () => {
    const rules = (rule) => ({ directionRules: { down: rule } });
    expect(() => validateProfile(profile(rules({ face: 'ear' })))).toThrow(/facing down needs face/);
    expect(() => validateProfile(profile(rules({ face: 'front', hairMass: 3 })))).toThrow(/hairMass/);
  });

  it('refuses constraints that name no region, or bounds out of order', () => {
    const constraints = (extra) => ({ constraints: { ...extra } });
    expect(() => validateProfile(profile(constraints({ protectedRegions: ['feet'] })))).toThrow(/protectedRegions/);
    expect(() => validateProfile(profile(constraints({ variationBounds: { min: 0.8, max: 0.2 } })))).toThrow(
      /variationBounds/,
    );
    expect(() => validateProfile(profile(constraints({ diversity: { threshold: 2 } })))).toThrow(/diversity/);
    expect(() => validateProfile(profile(constraints({ shape: { maxBoxGrowth: -1 } })))).toThrow(/shape/);
    expect(() => validateProfile(profile(constraints({ deformablePairs: [['hair', 'feet']] })))).toThrow(
      /deformablePairs/,
    );
    expect(() => validateProfile(profile({ constraints: null }))).toThrow(/constraints must be an object/);
  });
});

describe('the shipped skin profile', () => {
  it('drives the skin generator, which names it as its default', () => {
    expect(DEFAULT_PROFILES).toContain(SKIN_DEFAULT_PROFILE);
    expect(SKIN_DEFAULT_PROFILE).toMatchObject({
      profileId: 'skin-default',
      generatorId: 'skin-variant',
      itemType: 'skin',
    });
    expect(GENERATORS[SKIN_DEFAULT_PROFILE.generatorId]).toMatchObject({
      itemType: 'skin',
      defaultProfile: 'skin-default',
      modes: ['update-existing', 'create-new'],
    });
  });

  it('gives each facing its rules: a front face down, no face up, a side face left and right', () => {
    expect(SKIN_DEFAULT_PROFILE.directionRules).toEqual({
      down: { face: 'front', hairMass: 1 },
      up: { face: 'back', hairMass: 1 },
      left: { face: 'side', hairMass: 1 },
      right: { face: 'side', hairMass: 1 },
    });
  });

  it('rules every facing of the skin frame contract, idle and walking', () => {
    for (const code of Object.keys(RENDER_FRAME_CONTRACT.skin))
      expect(SKIN_DEFAULT_PROFILE.directionRules[facingOf(code)]).toBeDefined();
  });

  it('protects the shape of the body armor fits', () => {
    expect(SKIN_DEFAULT_PROFILE.constraints.protectedRegions).toEqual(['torso', 'leftLeg', 'rightLeg']);
  });
});

describe('the shipped floor profile', () => {
  it('drives the floor generator, which names it as its default', () => {
    expect(DEFAULT_PROFILES).toContain(FLOOR_DEFAULT_PROFILE);
    expect(FLOOR_DEFAULT_PROFILE).toMatchObject({
      profileId: 'floor-default',
      generatorId: 'floor-tile',
      itemType: 'floor',
    });
    expect(GENERATORS[FLOOR_DEFAULT_PROFILE.generatorId]).toMatchObject({
      itemType: 'floor',
      defaultProfile: 'floor-default',
      modes: ['update-existing', 'create-new'],
    });
  });

  it('has no facing rules and protects no region; its frame contract is one static frame', () => {
    expect(FLOOR_DEFAULT_PROFILE.directionRules).toEqual({});
    expect(FLOOR_DEFAULT_PROFILE.constraints).toMatchObject({
      protectedRegions: [],
      deformablePairs: [['ground', 'patch']],
    });
    expect(RENDER_FRAME_CONTRACT.floor).toEqual({ '08': 1 });
  });
});
