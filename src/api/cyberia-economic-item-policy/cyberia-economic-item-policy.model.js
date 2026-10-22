/**
 * Mongoose model for `CyberiaEconomicItemPolicy`: what one item may do in one economy.
 *
 * One row per `{economyCode, itemId}`. A field the row leaves out inherits the `itemDefaults` of
 * its `CyberiaEconomy`; an optional field such as `portalFee` stays unset. The item id is the logical identity; the catalog binds it to the definition
 * a world runs. `salvage` lists what a burn grants per burned unit.
 *
 * @module src/api/cyberia-economic-item-policy/cyberia-economic-item-policy.model.js
 */

import { Schema, model } from 'mongoose';
import {
  ITEM_POLICY_DEFAULTS,
  ITEM_POLICY_FLAGS,
  ITEM_POLICY_LIMITS,
  ITEM_POLICY_OPTIONAL_LIMITS,
  SALVAGE_LIMITS,
  itemPolicyDefect,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';

const SalvageSchema = new Schema(
  {
    itemId: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1, max: SALVAGE_LIMITS.quantity, validate: Number.isInteger },
  },
  { _id: false, strict: 'throw' },
);

const CyberiaEconomicItemPolicySchema = new Schema(
  {
    economyCode: { type: String, required: true, trim: true },
    itemId: { type: String, required: true, trim: true },
    ...Object.fromEntries(
      Object.keys(ITEM_POLICY_DEFAULTS).map((key) => [
        key,
        ITEM_POLICY_FLAGS.includes(key)
          ? { type: Boolean, default: undefined }
          : {
              type: Number,
              default: undefined,
              min: ITEM_POLICY_LIMITS[key][0],
              max: ITEM_POLICY_LIMITS[key][1],
              validate: Number.isInteger,
            },
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(ITEM_POLICY_OPTIONAL_LIMITS).map(([key, [min, max]]) => [
        key,
        { type: Number, default: undefined, min, max, validate: Number.isInteger },
      ]),
    ),
    salvage: { type: [SalvageSchema], default: undefined },
  },
  { timestamps: true, strict: 'throw' },
);

CyberiaEconomicItemPolicySchema.index({ economyCode: 1, itemId: 1 }, { unique: true });

CyberiaEconomicItemPolicySchema.pre('validate', function () {
  const defect = itemPolicyDefect(this.toObject());
  if (defect) throw new RangeError(`Invalid item policy: ${defect}`);
});

const CyberiaEconomicItemPolicyModel = model('CyberiaEconomicItemPolicy', CyberiaEconomicItemPolicySchema);

const ProviderSchema = CyberiaEconomicItemPolicySchema;

export { CyberiaEconomicItemPolicySchema, CyberiaEconomicItemPolicyModel, ProviderSchema };
