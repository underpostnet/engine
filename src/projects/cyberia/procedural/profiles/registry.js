/**
 * Procedural profiles: how a generator transforms a Genesis Template. A profile ranks the regions,
 * gives each direction its rules, and bounds what the generator may do: required directions,
 * protected regions, variation, shape and diversity. It holds no region map, color, item semantics,
 * binding or CID.
 *
 * The profiles Cyberia ships live here and are stored in the CyberiaProceduralProfile collection.
 * The source is the truth: a worker start writes it over the stored copy.
 *
 * @module src/projects/cyberia/procedural/profiles/registry.js
 * @namespace CyberiaProceduralProfiles
 */
import { OBJECT_LAYER_DIRECTION_CODES } from '../../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';

const PROFILE_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const REGION_ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const FACINGS = Object.freeze(['down', 'up', 'left', 'right']);
const FACES = Object.freeze(['front', 'side', 'back']);

const fail = (message) => {
  throw new RangeError(`Procedural profile: ${message}`);
};

const isInteger = (value, min) => Number.isSafeInteger(value) && value >= min;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isUnit = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

const checkRules = (rules, code) => {
  if (!OBJECT_LAYER_DIRECTION_CODES.includes(code)) fail(`${code} is not a direction code`);
  const { facing, face, hairMass = 1 } = rules ?? {};
  if (!FACINGS.includes(facing)) fail(`direction ${code} needs facing: ${FACINGS.join(', ')}`);
  if (!FACES.includes(face)) fail(`direction ${code} needs face: ${FACES.join(', ')}`);
  if (!(Number.isFinite(hairMass) && hairMass >= 0.25 && hairMass <= 2))
    fail(`direction ${code} needs hairMass from 0.25 to 2`);
  return { facing, face, hairMass };
};

const checkConstraints = (constraints, directionRules, regionOrder) => {
  if (!isPlainObject(constraints)) fail('constraints must be an object');
  const { requiredDirections } = constraints;
  if (!Array.isArray(requiredDirections) || requiredDirections.length === 0)
    fail('requiredDirections must list at least one direction');
  for (const code of requiredDirections) if (!directionRules[code]) fail(`required direction ${code} has no rules`);
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
    requiredDirections: [...requiredDirections],
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
  if (!isPlainObject(profile.directionRules) || Object.keys(profile.directionRules).length === 0)
    fail('directionRules must give at least one direction its rules');
  const directionRules = Object.fromEntries(
    Object.entries(profile.directionRules).map(([code, rules]) => [code, checkRules(rules, code)]),
  );
  return {
    profileId: profile.profileId,
    generatorId: profile.generatorId,
    itemType: profile.itemType,
    regionOrder: [...regionOrder],
    directionRules,
    constraints: checkConstraints(profile.constraints, directionRules, regionOrder),
  };
}

/**
 * The default skin profile. Torso and legs are protected: a variant keeps the shape of the body
 * that armor layers fit. The head, the hair and the skin vary.
 * @memberof CyberiaProceduralProfiles
 */
export const SKIN_DEFAULT_PROFILE = validateProfile({
  profileId: 'skin-default',
  generatorId: 'skin-variant',
  itemType: 'skin',
  regionOrder: ['hair', 'torso', 'leftLeg', 'rightLeg', 'head', 'skin'],
  directionRules: {
    '06': { facing: 'right', face: 'side', hairMass: 1 },
    '08': { facing: 'down', face: 'front', hairMass: 1 },
  },
  constraints: {
    requiredDirections: ['06', '08'],
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

/** Every profile Cyberia ships. */
export const DEFAULT_PROFILES = Object.freeze([SKIN_DEFAULT_PROFILE]);

/**
 * Stores every shipped profile over its stored copy. Safe to run again.
 * @param {{CyberiaProceduralProfile: import('mongoose').Model}} models
 * @returns {Promise<void>}
 * @memberof CyberiaProceduralProfiles
 */
export async function ensureDefaultProfiles({ CyberiaProceduralProfile }) {
  for (const profile of DEFAULT_PROFILES) await CyberiaProceduralProfile.register(profile);
}
