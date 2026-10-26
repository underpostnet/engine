/**
 * The variation parameters every generator takes: `variation`, the one high-level control, a
 * granular variation for each of its operators, and `minDiversity`. Pure functions.
 *
 * @module src/projects/cyberia/procedural/core/parameters.js
 */

const DEFAULT_VARIATION = 0.5;

/**
 * The variation parameters of a run, checked against a profile and completed. `variation` sets
 * every granular variation the request leaves out.
 * @param {Object} parameters - The parameters of the run.
 * @param {Object} profile - A validated profile.
 * @param {Object} kind
 * @param {string} kind.name - The name of the generator, for the messages.
 * @param {string[]} kind.variations - The granular variations: `<name>Variation` each.
 * @param {string[]} [kind.extra] - The other parameters the generator takes.
 * @returns {{variation:number,minDiversity:number}} And `<name>Variation` for each granular variation.
 * @throws {RangeError} On an unknown parameter or a value outside its bounds.
 */
export function variationParameters(parameters, profile, { name, variations, extra = [] }) {
  const known = ['variation', ...variations.map((variation) => `${variation}Variation`), ...extra, 'minDiversity'];
  const unknown = Object.keys(parameters).filter((parameter) => !known.includes(parameter));
  if (unknown.length > 0) throw new RangeError(`Unknown ${name} parameter: ${unknown.join(', ')}`);
  const { min, max } = profile.constraints.variationBounds;
  const inBounds = (parameter, value) => {
    if (!Number.isFinite(value) || value < min || value > max)
      throw new RangeError(`${parameter} must be a number from ${min} to ${max}`);
    return value;
  };
  const variation = inBounds('variation', parameters.variation ?? DEFAULT_VARIATION);
  const minDiversity = parameters.minDiversity ?? profile.constraints.diversity.threshold;
  if (!Number.isFinite(minDiversity) || minDiversity < 0 || minDiversity > 1)
    throw new RangeError('minDiversity must be a number from 0 to 1');
  return {
    variation,
    ...Object.fromEntries(
      variations.map((granular) => [
        `${granular}Variation`,
        inBounds(`${granular}Variation`, parameters[`${granular}Variation`] ?? variation),
      ]),
    ),
    minDiversity,
  };
}
