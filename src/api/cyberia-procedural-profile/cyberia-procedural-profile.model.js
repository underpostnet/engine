/**
 * Mongoose model for the CyberiaProceduralProfile API: how a generator transforms a Genesis Template
 * of one item type.
 *
 * One document holds one profile id. Storing a profile writes it over the stored one. The structure
 * is the one {@link validateProfile} checks.
 *
 * @module src/api/cyberia-procedural-profile/cyberia-procedural-profile.model.js
 * @namespace CyberiaProceduralProfileModel
 */
import { Schema, model } from 'mongoose';
import { validateProfile } from '../../projects/cyberia/procedural/profiles/registry.js';

/**
 * @typedef {Object} CyberiaProceduralProfile
 * @property {string} profileId - Stable id of the profile
 * @property {string} generatorId - Generator the profile drives
 * @property {string} itemType - Item type the profile generates
 * @property {string[]} regionOrder - Region ids, in the order the generator ranks them
 * @property {Object<string,{facing:string,face:string,hairMass:number}>} directionRules - Rules by direction code
 * @property {Object} constraints - Bounds a generator keeps
 * @memberof CyberiaProceduralProfileModel
 */
const CyberiaProceduralProfileSchema = new Schema(
  {
    profileId: { type: String, required: true, unique: true, trim: true },
    generatorId: { type: String, required: true, trim: true },
    itemType: { type: String, required: true, trim: true },
    regionOrder: { type: [String], required: true },
    directionRules: { type: Schema.Types.Mixed, required: true },
    constraints: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

CyberiaProceduralProfileSchema.index({ itemType: 1 });

/**
 * Stores a profile over the one stored under its id, and removes any other copy of that id.
 * @param {Object} profile - A profile as {@link validateProfile} accepts it.
 * @returns {Promise<Object>} The stored profile.
 * @throws {RangeError} When the profile is invalid.
 * @memberof CyberiaProceduralProfileModel
 */
CyberiaProceduralProfileSchema.statics.register = async function (profile) {
  const checked = validateProfile(profile);
  try {
    const stored = await this.findOneAndReplace({ profileId: checked.profileId }, checked, {
      upsert: true,
      returnDocument: 'after',
      lean: true,
    });
    await this.deleteMany({ profileId: checked.profileId, _id: { $ne: stored._id } });
    return stored;
  } catch (error) {
    if (error?.code === 11000) return await this.register(profile);
    throw error;
  }
};

/**
 * The profile stored under an id.
 * @param {string} profileId
 * @returns {Promise<Object>} A lean, validated profile.
 * @throws {RangeError} When no profile has the id.
 * @memberof CyberiaProceduralProfileModel
 */
CyberiaProceduralProfileSchema.statics.resolve = async function (profileId) {
  const stored = await this.findOne({ profileId }).lean();
  if (!stored) throw new RangeError(`Procedural profile ${profileId} is not stored`);
  return validateProfile(stored);
};

const CyberiaProceduralProfileModel = model('CyberiaProceduralProfile', CyberiaProceduralProfileSchema);
const ProviderSchema = CyberiaProceduralProfileSchema;

class CyberiaProceduralProfileDto {
  static select = {
    get: () => ({
      _id: 1,
      profileId: 1,
      generatorId: 1,
      itemType: 1,
      regionOrder: 1,
      directionRules: 1,
      constraints: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  };
}

export { CyberiaProceduralProfileSchema, CyberiaProceduralProfileModel, ProviderSchema, CyberiaProceduralProfileDto };
