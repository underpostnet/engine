/**
 * Mongoose model for `CyberiaEconomy`: one economy profile that worlds share.
 *
 * The profile owns the coin model (`rules`), the wallet currency, the operation fees and the item
 * policy defaults. A `CyberiaEconomicItemPolicy` row overrides the defaults for one item. A
 * `CyberiaInstanceConf` names the profile its world runs by `economyCode`; every world of a universe
 * names the same one. Each write of the profile or of one of its rows raises `revision`, and the
 * world version folds it in, so a change reaches a server through its reload.
 *
 * @module src/api/cyberia-economy/cyberia-economy.model.js
 */

import { Schema, model } from 'mongoose';
import {
  COIN_BALANCE_MAX,
  CURRENCY_CODES,
  CURRENCY_DEFAULTS,
  ECONOMY_RULE_LIMITS,
  ECONOMY_RULES_DEFAULTS,
  ECONOMY_STATUSES,
  ITEM_POLICY_DEFAULTS,
  ITEM_POLICY_FLAGS,
  ITEM_POLICY_LIMITS,
  OPERATION_FEE_DEFAULTS,
  OPERATION_FEE_LIMITS,
  resolveEconomyProfile,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';

const integer = (default_, [min, max]) => ({ type: Number, default: default_, min, max, validate: Number.isInteger });

const CurrencySchema = new Schema(
  {
    code: { type: String, enum: CURRENCY_CODES, default: CURRENCY_DEFAULTS.code },
    maxBalance: integer(CURRENCY_DEFAULTS.maxBalance, [1, COIN_BALANCE_MAX]),
  },
  { _id: false, strict: 'throw' },
);

const RulesSchema = new Schema(
  Object.fromEntries(
    Object.entries(ECONOMY_RULE_LIMITS).map(([key, [min, max]]) => [
      key,
      { type: Number, min, max, default: ECONOMY_RULES_DEFAULTS[key] },
    ]),
  ),
  { _id: false, strict: 'throw' },
);

const FeesSchema = new Schema(
  Object.fromEntries(
    Object.entries(OPERATION_FEE_LIMITS).map(([key, bounds]) => [key, integer(OPERATION_FEE_DEFAULTS[key], bounds)]),
  ),
  { _id: false, strict: 'throw' },
);

const ItemDefaultsSchema = new Schema(
  Object.fromEntries(
    Object.entries(ITEM_POLICY_DEFAULTS).map(([key, value]) => [
      key,
      ITEM_POLICY_FLAGS.includes(key) ? { type: Boolean, default: value } : integer(value, ITEM_POLICY_LIMITS[key]),
    ]),
  ),
  { _id: false, strict: 'throw' },
);

const CyberiaEconomySchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    // A retired profile keeps its rows; no conf may name it.
    status: { type: String, enum: ECONOMY_STATUSES, default: 'active' },
    revision: { type: Number, default: 1, min: 1 },
    currency: { type: CurrencySchema, default: () => ({}) },
    rules: { type: RulesSchema, default: () => ({}) },
    fees: { type: FeesSchema, default: () => ({}) },
    itemDefaults: { type: ItemDefaultsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

CyberiaEconomySchema.pre('validate', function () {
  resolveEconomyProfile(this.toObject());
});

const CyberiaEconomyModel = model('CyberiaEconomy', CyberiaEconomySchema);

const ProviderSchema = CyberiaEconomySchema;

export { CyberiaEconomySchema, CyberiaEconomyModel, ProviderSchema };
