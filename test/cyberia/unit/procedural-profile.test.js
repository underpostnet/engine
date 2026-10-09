import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILES,
  SKIN_DEFAULT_PROFILE,
  validateProfile,
} from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { GENERATORS } from '../../../src/projects/cyberia/procedural/generator-registry.js';

const profile = (overrides = {}) => ({
  profileId: 'tiny-skin',
  generatorId: 'skin-variant',
  itemType: 'skin',
  regionOrder: ['hair', 'skin'],
  directionRules: { '08': { facing: 'down', face: 'front' } },
  constraints: { requiredDirections: ['08'] },
  ...overrides,
});

describe('procedural profile validation', () => {
  it('stores a normalized copy with the defaults of rules and constraints', () => {
    const checked = validateProfile(profile());
    expect(checked.directionRules['08']).toEqual({ facing: 'down', face: 'front', hairMass: 1 });
    expect(checked.constraints).toEqual({
      requiredDirections: ['08'],
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
    ['no direction rules', { directionRules: {} }, /directionRules/],
    [
      'a direction code the protocol lacks',
      { directionRules: { 99: { facing: 'down', face: 'front' } } },
      /not a direction/,
    ],
  ])('refuses %s', (_, overrides, message) => {
    expect(() => validateProfile(profile(overrides))).toThrow(message);
  });

  it('refuses rules that name no facing, no face or a hair mass out of range', () => {
    const rules = (rule) => ({ directionRules: { '08': rule } });
    expect(() => validateProfile(profile(rules({ face: 'front' })))).toThrow(/needs facing/);
    expect(() => validateProfile(profile(rules({ facing: 'down', face: 'ear' })))).toThrow(/needs face/);
    expect(() => validateProfile(profile(rules({ facing: 'down', face: 'front', hairMass: 3 })))).toThrow(/hairMass/);
  });

  it('refuses constraints that name no direction or region, or bounds out of order', () => {
    const constraints = (extra) => ({ constraints: { requiredDirections: ['08'], ...extra } });
    expect(() => validateProfile(profile(constraints({ requiredDirections: [] })))).toThrow(/requiredDirections/);
    expect(() => validateProfile(profile(constraints({ requiredDirections: ['06'] })))).toThrow(
      /required direction 06 has no rules/,
    );
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

  it('gives each direction its own rules: a front face down, a side face right', () => {
    expect(SKIN_DEFAULT_PROFILE.directionRules['08']).toEqual({ facing: 'down', face: 'front', hairMass: 1 });
    expect(SKIN_DEFAULT_PROFILE.directionRules['06']).toEqual({ facing: 'right', face: 'side', hairMass: 1 });
  });

  it('protects the shape of the body armor fits', () => {
    expect(SKIN_DEFAULT_PROFILE.constraints.protectedRegions).toEqual(['torso', 'leftLeg', 'rightLeg']);
    expect(SKIN_DEFAULT_PROFILE.constraints.requiredDirections).toEqual(['06', '08']);
  });
});
