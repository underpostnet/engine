/**
 * Procedural profiles: how a generator transforms a Genesis Template. A profile ranks the regions,
 * gives each facing its rules, and bounds what the generator may do: protected regions, variation,
 * shape and diversity. It holds no region map, color, item semantics, binding or CID. The frames a
 * template draws are the frame contract of its item type.
 *
 * The profiles Cyberia ships live here and are stored in the CyberiaProceduralProfile collection.
 * The source is the truth: a worker start writes it over the stored copy.
 *
 * @module src/projects/cyberia/procedural/profiles/registry.js
 * @namespace CyberiaProceduralProfiles
 */
import { OBJECT_LAYER_FACINGS } from '../../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';

const PROFILE_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const REGION_ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const FACES = Object.freeze(['front', 'side', 'back']);

const fail = (message) => {
  throw new RangeError(`Procedural profile: ${message}`);
};

const isInteger = (value, min) => Number.isSafeInteger(value) && value >= min;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isUnit = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

const checkRules = (rules, facing) => {
  if (!OBJECT_LAYER_FACINGS.includes(facing)) fail(`${facing} is not a facing: ${OBJECT_LAYER_FACINGS.join(', ')}`);
  const { face, hairMass = 1 } = rules ?? {};
  if (!FACES.includes(face)) fail(`facing ${facing} needs face: ${FACES.join(', ')}`);
  if (!(Number.isFinite(hairMass) && hairMass >= 0.25 && hairMass <= 2))
    fail(`facing ${facing} needs hairMass from 0.25 to 2`);
  return { face, hairMass };
};

const checkConstraints = (constraints, regionOrder) => {
  if (!isPlainObject(constraints)) fail('constraints must be an object');
  const protectedRegions = constraints.protectedRegions ?? [];
  if (!Array.isArray(protectedRegions) || protectedRegions.some((id) => !regionOrder.includes(id)))
    fail('protectedRegions must name regions of regionOrder');
  const { min = 0, max = 1 } = constraints.variationBounds ?? {};
  if (!(isUnit(min) && isUnit(max) && min <= max)) fail('variationBounds must satisfy 0 <= min <= max <= 1');
  const { maxBoxGrowth = 3, maxCentroidDrift = 2 } = constraints.shape ?? {};
  if (!isInteger(maxBoxGrowth, 0) || !(Number.isFinite(maxCentroidDrift) && maxCentroidDrift >= 0))
    fail('shape needs an integer maxBoxGrowth and a number maxCentroidDrift');
  const { threshold = 0.05 } = constraints.diversity ?? {};
  if (!isUnit(threshold)) fail('diversity.threshold must be a number from 0 to 1');
  const deformablePairs = constraints.deformablePairs ?? [];
  if (
    !Array.isArray(deformablePairs) ||
    deformablePairs.some(
      (pair) => !Array.isArray(pair) || pair.length !== 2 || pair.some((id) => !regionOrder.includes(id)),
    )
  )
    fail('deformablePairs must list pairs of regions of regionOrder');
  return {
    protectedRegions: [...protectedRegions],
    variationBounds: { min, max },
    shape: { maxBoxGrowth, maxCentroidDrift },
    diversity: { threshold },
    deformablePairs: deformablePairs.map((pair) => [...pair]),
  };
};

/**
 * The profile as the system stores it: checked, normalized, a copy.
 * @param {Object} profile
 * @returns {{profileId:string,generatorId:string,itemType:string,regionOrder:string[],directionRules:Object,constraints:Object}}
 * @throws {RangeError} When the profile breaks the structure: identity, region order, direction
 *   rules or constraints.
 * @memberof CyberiaProceduralProfiles
 */
export function validateProfile(profile) {
  if (!isPlainObject(profile)) fail('must be an object');
  if (typeof profile.profileId !== 'string' || !PROFILE_ID_PATTERN.test(profile.profileId))
    fail('profileId must be lowercase words joined by hyphens');
  if (typeof profile.generatorId !== 'string' || !profile.generatorId) fail('generatorId is required');
  if (typeof profile.itemType !== 'string' || !profile.itemType) fail('itemType is required');
  const { regionOrder } = profile;
  if (
    !Array.isArray(regionOrder) ||
    regionOrder.length === 0 ||
    new Set(regionOrder).size !== regionOrder.length ||
    !regionOrder.every((id) => REGION_ID_PATTERN.test(id))
  )
    fail('regionOrder must list each region id once');
  if (!isPlainObject(profile.directionRules)) fail('directionRules must map facings to their rules');
  return {
    profileId: profile.profileId,
    generatorId: profile.generatorId,
    itemType: profile.itemType,
    regionOrder: [...regionOrder],
    directionRules: Object.fromEntries(
      Object.entries(profile.directionRules).map(([facing, rules]) => [facing, checkRules(rules, facing)]),
    ),
    constraints: checkConstraints(profile.constraints, regionOrder),
  };
}

/**
 * The default skin profile. Torso and legs are protected: a variant keeps the shape of the body
 * that armor layers fit. The head, the hair and the skin vary. A face shows its features from the
 * front and the side, none from the back.
 * @memberof CyberiaProceduralProfiles
 */
export const SKIN_DEFAULT_PROFILE = validateProfile({
  profileId: 'skin-default',
  generatorId: 'skin-variant',
  itemType: 'skin',
  regionOrder: ['hair', 'torso', 'leftLeg', 'rightLeg', 'head', 'skin'],
  directionRules: {
    down: { face: 'front', hairMass: 1 },
    up: { face: 'back', hairMass: 1 },
    left: { face: 'side', hairMass: 1 },
    right: { face: 'side', hairMass: 1 },
  },
  constraints: {
    protectedRegions: ['torso', 'leftLeg', 'rightLeg'],
    variationBounds: { min: 0, max: 1 },
    shape: { maxBoxGrowth: 4, maxCentroidDrift: 2 },
    diversity: { threshold: 0.05 },
    deformablePairs: [
      ['hair', 'head'],
      ['head', 'skin'],
    ],
  },
});

/**
 * The default floor profile. A floor has no facing rules. The ground and its patches trade cells,
 * and nothing is protected.
 * @memberof CyberiaProceduralProfiles
 */
export const FLOOR_DEFAULT_PROFILE = validateProfile({
  profileId: 'floor-default',
  generatorId: 'floor-tile',
  itemType: 'floor',
  regionOrder: ['ground', 'patch'],
  directionRules: {},
  constraints: {
    protectedRegions: [],
    variationBounds: { min: 0, max: 1 },
    diversity: { threshold: 0.02 },
    deformablePairs: [['ground', 'patch']],
  },
});

/**
 * The default portal profile. A portal has no facing rules. Its core keeps its shape, so every
 * frame of the vortex turns around the same center; the swirl trades cells with the ring and the depth.
 * @memberof CyberiaProceduralProfiles
 */
export const PORTAL_DEFAULT_PROFILE = validateProfile({
  profileId: 'portal-default',
  generatorId: 'portal-variant',
  itemType: 'portal',
  regionOrder: ['ring', 'swirl', 'depth', 'core'],
  directionRules: {},
  constraints: {
    protectedRegions: ['core'],
    variationBounds: { min: 0, max: 1 },
    shape: { maxBoxGrowth: 2, maxCentroidDrift: 1 },
    diversity: { threshold: 0.04 },
    deformablePairs: [
      ['ring', 'swirl'],
      ['swirl', 'depth'],
    ],
  },
});

/**
 * The default obstacle profile. An obstacle has no facing rules. Its chunks keep their shape, so
 * the three idle frames shift only the seams, the loose pieces and the dust.
 * @memberof CyberiaProceduralProfiles
 */
export const OBSTACLE_DEFAULT_PROFILE = validateProfile({
  profileId: 'obstacle-default',
  generatorId: 'obstacle-variant',
  itemType: 'obstacle',
  regionOrder: ['dust', 'chunk', 'seam', 'loose'],
  directionRules: {},
  constraints: {
    protectedRegions: ['chunk'],
    variationBounds: { min: 0, max: 1 },
    shape: { maxBoxGrowth: 2, maxCentroidDrift: 1 },
    diversity: { threshold: 0.03 },
    deformablePairs: [
      ['seam', 'loose'],
      ['loose', 'dust'],
    ],
  },
});

/** Every profile Cyberia ships. */
export const DEFAULT_PROFILES = Object.freeze([
  SKIN_DEFAULT_PROFILE,
  FLOOR_DEFAULT_PROFILE,
  PORTAL_DEFAULT_PROFILE,
  OBSTACLE_DEFAULT_PROFILE,
]);

/**
 * Stores every shipped profile over its stored copy. Safe to run again.
 * @param {{CyberiaProceduralProfile: import('mongoose').Model}} models
 * @returns {Promise<void>}
 * @memberof CyberiaProceduralProfiles
 */
export async function ensureDefaultProfiles({ CyberiaProceduralProfile }) {
  for (const profile of DEFAULT_PROFILES) await CyberiaProceduralProfile.register(profile);
}
