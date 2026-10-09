/**
 * Deterministic seeds. A seed is an unsigned 32-bit integer derived from stable inputs, never from
 * time, host or process state. The generator of numbers from a seed is `seededRandom` of
 * `PixelRegion.js`. Pure functions.
 *
 * @module src/projects/cyberia/procedural/core/seed.js
 */

/** The seed of FNV-1a over the parts, in order. Equal parts give an equal seed. */
export const deriveSeed = (...parts) => {
  let hash = 0x811c9dc5;
  for (const char of parts.join('|')) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return hash >>> 0;
};

/**
 * The seed of one generated item: every input that decides its content.
 * @param {Object} params
 * @param {number} params.rootSeed - The seed of the generation spec.
 * @param {string} params.sourceCid
 * @param {string} params.itemId - The target item id of the candidate.
 * @param {number} params.ordinal - The position of the candidate in the job.
 * @param {string} params.generationRunId
 * @param {string} params.generatorId
 * @param {string} params.profileId
 * @returns {number}
 */
export const itemSeed = ({ rootSeed, sourceCid, itemId, ordinal, generationRunId, generatorId, profileId }) =>
  deriveSeed(rootSeed, sourceCid, itemId, ordinal, generationRunId, generatorId, profileId);

/**
 * The seed of one operator step: the seed of the variant and the position of the step. Each
 * operator names the inputs it uses; the others stay out, so equal inputs give an equal step.
 * @param {number} seed - The seed of the variant.
 * @param {Object} step
 * @param {string} step.operatorId
 * @param {string} [step.direction]
 * @param {number} [step.frameIndex]
 * @param {string} [step.regionId]
 * @returns {number}
 */
export const operatorSeed = (seed, { operatorId, direction = '', frameIndex = '', regionId = '' }) =>
  deriveSeed(seed, operatorId, direction, frameIndex, regionId);

/** The seed of a diversity try: try 0 is the seed itself. */
export const trySeed = (seed, attempt) => (attempt === 0 ? seed : deriveSeed(seed, 'diversity', attempt));

/** A copy of the items in an order the random numbers decide: Fisher-Yates. */
export function shuffled(items, random) {
  const copy = [...items];
  for (let at = copy.length - 1; at > 0; at--) {
    const other = Math.floor(random() * (at + 1));
    [copy[at], copy[other]] = [copy[other], copy[at]];
  }
  return copy;
}

/** The seed a regeneration takes after a seed. */
export const regenerationSeed = (seed) => deriveSeed(seed, 'regenerate');
