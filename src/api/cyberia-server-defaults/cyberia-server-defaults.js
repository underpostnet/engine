/**
 * Canonical simulation contract of the Cyberia runtime: simulation / AOI / combat / economy /
 * skill rules, equipment rules, status-icon numeric IDs, inventory resolution and audio routing.
 *
 * Content lives in the cyberia-content artifact (src/projects/cyberia/content-artifact.js).
 *
 * STRICT BOUNDARY: never import this from `src/client/`. The browser bundler
 * resolves imports recursively, so one browser-side import ships the whole
 * simulation defaults in the public JS payload.
 *
 * @module src/api/cyberia-server-defaults/cyberia-server-defaults.js
 */

// Shared vocabulary lives under src/client/ so the browser bundler resolves it.
import {
  ITEM_TYPES,
  STAT_TYPES,
  STAT_MODIFIER_MAX,
  ENTITY_LEVEL_MAX,
  SKILL_LOGIC_ID_VALUES,
  AUDIO_BUSES,
  AUDIO_BUS_MUSIC,
  AUDIO_BUS_SFX,
  AUDIO_LOGIC_ID_BUSES,
  AUDIO_LOGIC_ID_VALUES,
  isCanonicalAudioLogicId,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

// ─────────────────────────────────────────────────────────────────────────────
// Equipment rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which ObjectLayer item types may be active together on an entity. The server
 * validates every item_activation against these rules, scoped to the item set
 * of the entity state: liveItemIds while alive, deadItemIds while dead.
 */
export const EQUIPMENT_RULES_DEFAULTS = Object.freeze({
  activeItemTypes: [ITEM_TYPES.skin, ITEM_TYPES.breastplate, ITEM_TYPES.weapon],
  onePerType: true,
  requireSkin: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Entity Status Indicators (server-side numeric table)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Numeric Entity Status Indicator (ESI) IDs. The server stamps one u8 ID on
 * every entity in the AOI wire format; the client resolves the icon from
 * `SharedDefaultsCyberia.js#STATUS_ICONS_PRESENTATION`. These IDs are wire
 * contract: append only, never renumber.
 */
export const STATUS_ICONS = Object.freeze([
  { id: 0, name: 'none', description: 'No icon (skill/coin bots, world objects)' },
  { id: 1, name: 'passive', description: 'Passive bot — no weapon, non-aggressive' },
  { id: 2, name: 'hostile', description: 'Hostile bot — has weapon, will aggro' },
  { id: 3, name: 'frozen', description: 'Player in FrozenInteractionState (modal open)' },
  { id: 4, name: 'player', description: 'Normal player — alive, not frozen' },
  { id: 5, name: 'dead', description: 'Entity is dead / respawning' },
  { id: 6, name: 'resource', description: 'Resource entity — static, exploitable (wood, minerals, etc.)' },
  { id: 7, name: 'resource-extracted', description: 'Resource entity extracted/depleted (dead state)' },
  {
    id: 8,
    name: 'action-provider',
    description:
      'Capability: bot has a usable cyberia-action (shop/storage/craft/talk) for players who can interact with it. Sent as a capability bit, not a presence state.',
  },
  {
    id: 9,
    name: 'quest-provider',
    description:
      'Capability: bot offers or advances a cyberia-quest for the viewing player (acceptable offer or active talk-target). Sent as a capability bit, not a presence state.',
  },
  {
    id: 10,
    name: 'portal',
    description:
      'Presence: fixed-target portal / transport entity. The client renders the transport icon plus a "<targetMapCode> <x>,<y>" nameplate.',
  },
  {
    id: 11,
    name: 'portal-random',
    description:
      'Presence: random-target portal (inter-random / intra-random, targetCell -1,-1). The client renders the transport-random icon plus a "<targetMapCode>" nameplate (no cell, the destination is random).',
  },
]);

// ─────────────────────────────────────────────────────────────────────────────
// Per-entity-type default resolution (simulation-side only — no presentation here)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The default a placed entity resolves to, by the item ids it already carries.
 *
 * Mirrors `resolveEntityDefaultBuild` in cyberia-server/game/entity_defaults.go, which is the rule
 * the simulation applies at spawn: a default matches only when the entity carries ALL of its live
 * ids, and the most specific match wins — the one requiring the largest set, so `{purple, pistol}`
 * beats `{purple}`. Ties keep the earlier default, which makes the order a world declares them in
 * significant. With no containing match, the first default of that type answers.
 *
 * @param {{entityType: string, itemIds?: string[]}} entity - Placed entity type and its item ids.
 * @param {Array<{entityType: string, liveItemIds?: string[]}>} defaults - Candidate defaults, in order.
 * @returns {object|undefined} The matched default, or undefined when the type has none.
 */
export function resolveEntityDefaultBuild({ entityType, itemIds = [] }, defaults = []) {
  const carried = new Set(itemIds.filter(Boolean));
  let firstOfType;
  let matched;
  let matchedSize = 0;
  for (const candidate of defaults) {
    if (candidate?.entityType !== entityType) continue;
    firstOfType ??= candidate;
    const liveItemIds = candidate.liveItemIds || [];
    if (carried.size === 0 || liveItemIds.length === 0) continue;
    if (!liveItemIds.every((itemId) => carried.has(itemId))) continue;
    if (liveItemIds.length > matchedSize) {
      matched = candidate;
      matchedSize = liveItemIds.length;
    }
  }
  return matched ?? firstOfType;
}

/**
 * The canonical inventory contract: one entity, one inventory, derived.
 *
 * An entity carries the union of every item id its default names — the lifecycle discriminators
 * (live / dead / drop) and the inventory-only extras — deduplicated, in that order. Which slots
 * are *active* is not stored anywhere: it follows from the discriminator the id belongs to, and
 * the runtime flips them as context changes (`activateOrAppendLayer` in
 * cyberia-server/game/dead_items.go activates the slot that is already there). Seeding the whole
 * union is what lets it activate rather than append.
 *
 * Spawn state is alive, so the live ids are the active ones. A worn item and an inventory-only
 * item are stock the entity holds, so each starts as one unit. A dead or drop id is a lifecycle
 * slot the runtime activates or scatters later, so it starts empty. The server owns the coin
 * quantity from spawn on, whatever the seed says.
 *
 * `overrideItemsIdsState` adjusts that derivation for one carried id: `active` forces the spawn
 * state — a skin the equipment rules would otherwise leave inactive — and `quantity` sizes a
 * stack, which is how a drop bundle declares how many it scatters. It never adds an id: the union
 * decides membership, an override only what a member starts as, so a rule naming an id no list
 * carries does nothing at all.
 *
 * Activating one item can deactivate another. `EQUIPMENT_RULES_DEFAULTS` allows one active item
 * per type, so an override that activates a skin is a decision about which skin the entity wears:
 * the one the lists derived gives way to the one the author named. Only the governed types are
 * constrained, and only where the item's type is known — a resource visual, a coin, anything the
 * rules do not name, passes through untouched.
 *
 * @param {{liveItemIds?:string[],deadItemIds?:string[],dropItemIds?:string[],inventoryItemsIds?:string[],
 *   overrideItemsIdsState?:Array<{itemId:string,active?:boolean,quantity?:number}>}} entityDefault
 * @param {{itemTypes?:Object<string,string>|Map<string,string>}} [context] - itemId → item type, where known.
 * @returns {Array<{itemId:string,active:boolean,quantity:number}>} Inventory rows, as the wire carries them.
 */
export function resolveEntityInventory(entityDefault = {}, { itemTypes } = {}) {
  const live = new Set(entityDefault.liveItemIds || []);
  const overrides = new Map(
    (entityDefault.overrideItemsIdsState || []).filter((rule) => rule?.itemId).map((rule) => [rule.itemId, rule]),
  );
  const itemIds = [
    ...new Set(
      [
        ...(entityDefault.liveItemIds || []),
        ...(entityDefault.deadItemIds || []),
        ...(entityDefault.dropItemIds || []),
        ...(entityDefault.inventoryItemsIds || []),
      ].filter(Boolean),
    ),
  ];
  const drops = new Set(entityDefault.dropItemIds || []);
  const stock = new Set(entityDefault.inventoryItemsIds || []);
  const rows = itemIds.map((itemId) => {
    const override = overrides.get(itemId);
    const active = 'boolean' === typeof override?.active ? override.active : live.has(itemId);
    const held = active || stock.has(itemId);
    const quantity = Number.isFinite(override?.quantity) ? override.quantity : held ? 1 : 0;
    // A drop id scatters on death unless an override says how often. Rows that are not drops
    // carry the same 1, so every consumer reads one field and never a missing one.
    const dropChance =
      drops.has(itemId) && Number.isFinite(override?.dropChance)
        ? Math.min(1, Math.max(0, override.dropChance))
        : 1;
    return { itemId, active, quantity, dropChance };
  });
  return applyEquipmentRules(rows, { itemTypes, overrides });
}

/**
 * One active item per governed type, with the authored choice ahead of the derived one.
 *
 * An override that activates an item states which item of its type the entity wears; a row the
 * lists merely derived yields to it. Two overrides of the same type resolve in list order, first
 * kept — the same first-wins the runtime applies when it normalizes a loadout.
 *
 * @param {Array<{itemId:string,active:boolean,quantity:number}>} rows - Resolved inventory rows.
 * @param {{itemTypes?:Object<string,string>|Map<string,string>, overrides?:Map<string,object>}} context
 * @returns {Array<{itemId:string,active:boolean,quantity:number}>} The same rows, contested types settled.
 */
function applyEquipmentRules(rows, { itemTypes, overrides = new Map() } = {}) {
  if (!itemTypes || !EQUIPMENT_RULES_DEFAULTS.onePerType) return rows;
  const typeOf = (itemId) => (itemTypes instanceof Map ? itemTypes.get(itemId) : itemTypes[itemId]) || '';
  const governed = new Set(EQUIPMENT_RULES_DEFAULTS.activeItemTypes);
  const claimed = new Set();
  // Authored first, so an override wins the slot it asks for; the derived rows fill what is left.
  const contenders = [
    ...rows.filter((row) => row.active && overrides.get(row.itemId)?.active === true),
    ...rows.filter((row) => row.active && overrides.get(row.itemId)?.active !== true),
  ];
  const deactivated = new Set();
  for (const row of contenders) {
    const type = typeOf(row.itemId);
    if (!governed.has(type)) continue;
    if (claimed.has(type)) deactivated.add(row.itemId);
    else claimed.add(type);
  }
  // Taking something off does not take it away: the entity still carries the stack, so only the
  // worn flag changes. A row emptied here would leave the inventory holding nothing.
  return rows.map((row) => (deactivated.has(row.itemId) ? { ...row, active: false } : row));
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio seed content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The audio bank the seeded world needs: one `cyberia-audio` module per asset code.
 *
 * `bus` names the module directory (`cyberia-audio/src/audio-module/<bus-id>/<code>`) and is the
 * asset's natural route; `options` are that module's render parameters. The code is also the
 * identity the client fetches by, so a code here must exist as a module there.
 *
 * @type {ReadonlyArray<{code:string,bus:'music'|'sfx',options?:object}>}
 */
export const DEFAULT_AUDIO_BANK = Object.freeze([
  ...['shoot', 'coin', 'drop', 'item-pickup', 'victory', 'level-up', 'death', 'heal', 'hit', 'portal', 'ui-click', 'footsteps'].map(
    (code) => Object.freeze({ code, bus: AUDIO_BUS_SFX }),
  ),
  Object.freeze({ code: 'exploration', bus: AUDIO_BUS_MUSIC, options: { cycles: 1 } }),
  Object.freeze({ code: 'combat', bus: AUDIO_BUS_MUSIC, options: { rounds: 1 } }),
  Object.freeze({ code: 'boss', bus: AUDIO_BUS_MUSIC }),
  Object.freeze({ code: 'portal-cooldown', bus: AUDIO_BUS_MUSIC }),
  Object.freeze({ code: 'craft', bus: AUDIO_BUS_MUSIC }),
]);

/** Map-level audio settings the seed writes onto every seeded map. */
export const DEFAULT_AUDIO_SETTINGS = Object.freeze({ volume: 0.8, crossfadeMs: 800 });

/**
 * The music bed a seeded map falls back to when no event is holding the bus.
 *
 * One bed for every map of a world: what a map sounds like when nothing is happening is the
 * world's ambient identity, and the events are what make a place sound different — a combat or a
 * boss bed is bound to the moment it belongs to, not to a map index.
 */
export const DEFAULT_MAP_MUSIC = 'exploration';

/**
 * Canonical runtime-event → asset bindings.
 *
 * `logicEventId` is the semantic event the client emits (an audio LogicId, or a skill LogicId the
 * dispatcher runs); `audioCode` is the bank entry that answers it.
 *
 * @type {ReadonlyArray<{logicEventId:string,audioCode:string}>}
 */
export const DEFAULT_AUDIO_BINDINGS = Object.freeze([
  Object.freeze({ logicEventId: 'projectile', audioCode: 'shoot' }),
  Object.freeze({ logicEventId: 'coin_drop_or_transaction', audioCode: 'coin' }),
  Object.freeze({ logicEventId: 'drop', audioCode: 'drop' }),
  Object.freeze({ logicEventId: 'item-pickup', audioCode: 'item-pickup' }),
  Object.freeze({ logicEventId: 'craft', audioCode: 'craft' }),
  Object.freeze({ logicEventId: 'heal', audioCode: 'heal' }),
  Object.freeze({ logicEventId: 'hit', audioCode: 'hit' }),
  Object.freeze({ logicEventId: 'portal', audioCode: 'portal' }),
  Object.freeze({ logicEventId: 'ui-click', audioCode: 'ui-click' }),
  Object.freeze({ logicEventId: 'footsteps', audioCode: 'footsteps' }),
  Object.freeze({ logicEventId: 'combat', audioCode: 'combat' }),
  Object.freeze({ logicEventId: 'boss', audioCode: 'boss' }),
  Object.freeze({ logicEventId: 'victory', audioCode: 'victory' }),
  Object.freeze({ logicEventId: 'level-up', audioCode: 'level-up' }),
  Object.freeze({ logicEventId: 'death', audioCode: 'death' }),
  Object.freeze({ logicEventId: 'portal-cooldown', audioCode: 'portal-cooldown' }),
]);

const AUDIO_BANK_CODES = DEFAULT_AUDIO_BANK.map(({ code }) => code);

for (const { code, bus } of DEFAULT_AUDIO_BANK) {
  if (!AUDIO_BUSES.includes(bus)) {
    throw new Error(`DEFAULT_AUDIO_BANK: "${code}" names bus "${bus}". Allowed: ${AUDIO_BUSES.join(', ')}`);
  }
}

// Fail fast on an audio binding the runtime cannot honour: an unknown event would never fire, and
// an unbanked code would leave the client requesting an asset the seed never imported. Both read
// as silence at play time, so they must surface at boot instead.
for (const { logicEventId, audioCode } of DEFAULT_AUDIO_BINDINGS) {
  if (!isCanonicalAudioLogicId(logicEventId)) {
    throw new Error(
      `DEFAULT_AUDIO_BINDINGS: unknown logicEventId "${logicEventId}". ` +
        `Allowed (SharedDefaultsCyberia): ${[...AUDIO_LOGIC_ID_VALUES, ...SKILL_LOGIC_ID_VALUES].join(', ')}`,
    );
  }
  if (!AUDIO_BANK_CODES.includes(audioCode)) {
    throw new Error(
      `DEFAULT_AUDIO_BINDINGS: "${logicEventId}" binds audioCode "${audioCode}", ` +
        `absent from DEFAULT_AUDIO_BANK: ${AUDIO_BANK_CODES.join(', ')}`,
    );
  }
}
if (!AUDIO_BANK_CODES.includes(DEFAULT_MAP_MUSIC)) {
  throw new Error(`Default map music "${DEFAULT_MAP_MUSIC}" is absent from DEFAULT_AUDIO_BANK`);
}

/**
 * The natural routing of a binding for one runtime event.
 *
 * The bus comes from the canonical audio registry (a skill LogicId is a one-shot, so it falls back
 * to sfx). Music holds the bed in a loop, and only music crossfades.
 *
 * @param {string} logicEventId
 * @returns {{bus:string,loop:boolean,crossfadeMs?:number}}
 */
export function audioEventRouting(logicEventId) {
  const bus = AUDIO_LOGIC_ID_BUSES[logicEventId] ?? AUDIO_BUS_SFX;
  return AUDIO_BUS_MUSIC === bus ? { bus, loop: true } : { bus, loop: false, crossfadeMs: 0 };
}

/**
 * Expands {@link DEFAULT_AUDIO_BINDINGS} into `cyberia-map-audio-conf` event records, each with the
 * natural routing of its event.
 *
 * @param {{volume?:number,crossfadeMs?:number}} [settings=DEFAULT_AUDIO_SETTINGS]
 * @returns {Array<{logicEventId:string,audioCode:string,settings:object}>}
 */
export function buildAudioEventBindings(settings = DEFAULT_AUDIO_SETTINGS) {
  const { volume, crossfadeMs } = { ...DEFAULT_AUDIO_SETTINGS, ...settings };
  return DEFAULT_AUDIO_BINDINGS.map(({ logicEventId, audioCode }) => ({
    logicEventId,
    audioCode,
    settings: { volume, crossfadeMs, ...audioEventRouting(logicEventId) },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Instance-level simulation configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical default Cyberia instance configuration consumed by the gRPC
 * `InstanceConfig` payload. ONLY gameplay-affecting values live here.
 *
 * Anything that does not influence the authoritative simulation (cell-pixel
 * size, camera tunings, palette, interpolation window, render flags) is
 * forbidden — see `SharedDefaultsCyberia.js` and the
 * `/api/v1/cyberia-client-hints` REST endpoint for presentation overrides.
 */
export const PROGRESSION_RULES_DEFAULTS = Object.freeze({
  maxLevel: 100,
  xpPerLevel: 100,
  baseStats: Object.freeze({ effect: 5, resistance: 10, agility: 0, range: 0, intelligence: 0, utility: 0 }),
  perLevelStats: Object.freeze({ effect: 2, resistance: 5, agility: 1, range: 10, intelligence: 1, utility: 1 }),
  killXp: 25,
  questXp: 100,
  objectiveXp: 10,
  minAwardIntervalMs: 500,
  repeatWindowMs: 60000,
  maxRepeatAwards: 4,
  maxAwardsPerWindow: 30,
  defaultBotLevel: 1,
});

export const PROGRESSION_RULE_LIMITS = Object.freeze(Object.fromEntries(Object.entries({
  maxLevel: [1, ENTITY_LEVEL_MAX], xpPerLevel: [1, 1000000],
  killXp: [0, 1000000], questXp: [0, 1000000], objectiveXp: [0, 1000000],
  minAwardIntervalMs: [1, 60000], repeatWindowMs: [1000, 3600000],
  maxRepeatAwards: [1, 100], maxAwardsPerWindow: [1, 1000], defaultBotLevel: [1, ENTITY_LEVEL_MAX],
}).map(([key, bounds]) => [key, Object.freeze(bounds)])));

export function resolveProgressionRules(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Progression rules must be an object.');
  const defaults = PROGRESSION_RULES_DEFAULTS;
  const rules = {
    ...defaults, ...input,
    baseStats: { ...defaults.baseStats, ...input.baseStats },
    perLevelStats: { ...defaults.perLevelStats, ...input.perLevelStats },
  };
  for (const key of ['baseStats', 'perLevelStats']) {
    if (input[key] !== undefined && (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key]))) {
      throw new TypeError('Base stat curve must be an object: ' + key);
    }
  }
  if (rules.defaultBotLevel > rules.maxLevel) throw new RangeError('Default bot level exceeds maximum level.');
  for (const [key, [min, max]] of Object.entries(PROGRESSION_RULE_LIMITS)) {
    if (!Number.isInteger(rules[key]) || rules[key] < min || rules[key] > max) throw new RangeError('Invalid progression rule: ' + key);
  }
  for (const block of [rules.baseStats, rules.perLevelStats]) {
    for (const [key, value] of Object.entries(block)) {
      if (!STAT_TYPES.includes(key) || !Number.isInteger(value) || value < 0 || value > STAT_MODIFIER_MAX) {
        throw new RangeError('Invalid base stat curve: ' + key);
      }
    }
  }
  for (const key of Object.keys(rules)) {
    if (!(key in defaults)) throw new TypeError('Unknown progression rule: ' + key);
  }
  return rules;
}

export const CYBERIA_INSTANCE_CONF_DEFAULTS = {
  // ── Tick model ─────────────────────────────────────────────────────
  tickRate: 60,
  snapshotRate: 20,

  // ── World / AOI ────────────────────────────────────────────────────
  aoiRadius: 10,
  portalHoldTimeMs: 3000,
  portalSpawnRadius: 3,

  // ── Entity base stats ──────────────────────────────────────────────
  entityBaseSpeed: 5,
  entityBaseMaxLife: 100,
  entityBaseActionCooldownMs: 500,
  entityBaseMinActionCooldownMs: 100,

  // ── Bot defaults ───────────────────────────────────────────────────
  botAggroRange: 10,

  // ── Player defaults ────────────────────────────────────────────────
  defaultPlayerWidth: 2,
  defaultPlayerHeight: 2,
  playerBaseLifeRegenMin: 0.5,
  playerBaseLifeRegenMax: 1.5,
  // Movement speed for the player entity only, in grid cells per second. Bots,
  // projectiles and every other entity keep entityBaseSpeed. 0 falls back to
  // entityBaseSpeed.
  playerBaseSpeed: 8,
  progressionRules: PROGRESSION_RULES_DEFAULTS,
  maxActiveLayers: 4,
  initialLifeFraction: 1.0,

  // ── Combat / death ─────────────────────────────────────────────────
  respawnDurationMs: 3000,
  collisionLifeLoss: 10,

  // ── Economy — Fountain & Sink model ────────────────────────────────
  economyRules: {
    botSpawnCoins: 50,
    playerSpawnCoins: 50,
    coinKillPercentVsBot: 0.4,
    coinKillPercentVsPlayer: 0.15,
    coinKillMinAmount: 10,
    respawnCostPercent: 0.0,
    portalFee: 0,
    craftingFeePercent: 0.0,
  },

  // ── Chances, as fractions of 1 ───────────────────────────────────
  // A tap has lifeRegenChance to regenerate life; utility raises it. No chance the
  // stats raise passes maxChance, so nothing becomes a certainty.
  lifeRegenChance: 0.15,
  maxChance: 0.95,

  // ── Per-entity-type defaults ───────────────────────────────────────
  // References into the CyberiaEntityTypeDefault collection — see the schema.
  // Empty by default: a conf that names no document resolves against the
  // foundation baseline, so a fresh world is complete without owning a row.
  entityDefaults: [],

  // ── Status icons (numeric IDs only — visuals live in client defaults) ──
  statusIcons: STATUS_ICONS.map((s) => ({ ...s })),

  // ── Skill system ───────────────────────────────────────────────────
  // No skillConfig: the skills an instance runs are derived from its own content, never
  // stored on the conf. See cyberia-instance-items.js for the membership rule.
  skillRules: {
    projectileSpawnChance: 0.75,
    projectileLifetimeMs: 2000,
    projectileWidth: 1,
    projectileHeight: 1,
    projectileSpeedMultiplier: 3,
    doppelgangerSpawnChance: 0.6,
    doppelgangerLifetimeMs: 5000,
    doppelgangerSpawnRadius: 3,
    doppelgangerInitialLifeFraction: 1.0,
  },

  // ── Equipment Rules ────────────────────────────────────────────────
  equipmentRules: { ...EQUIPMENT_RULES_DEFAULTS },
};

// ─────────────────────────────────────────────────────────────────────────────
// Instance-conf default backfill
// ─────────────────────────────────────────────────────────────────────────────

const _isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const _cloneDefault = (v) => JSON.parse(JSON.stringify(v));

/**
 * Recursively backfill one value against its canonical default:
 *   - null / undefined  → deep clone of the default
 *   - empty array       → deep clone of the default (config lists must never
 *                         export empty — e.g. entityDefaults, statusIcons)
 *   - non-empty array   → kept verbatim (author content)
 *   - plain object      → keep author-set keys, recurse to fill missing default keys
 *   - scalar            → kept verbatim when present (0, '', false count as present)
 */
function _deepFillDefaults(value, defaultValue) {
  if (value === null || value === undefined) return _cloneDefault(defaultValue);
  if (Array.isArray(defaultValue)) {
    return Array.isArray(value) && value.length > 0 ? value : _cloneDefault(defaultValue);
  }
  if (_isPlainObject(defaultValue) && _isPlainObject(value)) {
    const out = { ...value };
    for (const key of Object.keys(defaultValue)) {
      out[key] = _deepFillDefaults(value[key], defaultValue[key]);
    }
    return out;
  }
  return value;
}

/**
 * Return a copy of a CyberiaInstanceConf document with every field defined by
 * CyberiaInstanceConfSchema present. Missing, null/undefined, or empty-array
 * fields — common when a doc is read with `.lean()` (which skips Mongoose schema
 * defaults), was created before a schema field existed, or was seeded with the
 * schema's empty-array default (e.g. `entityDefaults`) — are filled from
 * CYBERIA_INSTANCE_CONF_DEFAULTS. Author-set scalars (including 0, '', false), non-empty arrays, and DB
 * metadata (_id, instanceCode, timestamps) are preserved untouched.
 *
 * @param {object} [conf]
 * @returns {object}
 */
export function fillInstanceConfDefaults(conf = {}) {
  const source = _isPlainObject(conf) ? conf : {};
  const out = { ...source };
  for (const key of Object.keys(CYBERIA_INSTANCE_CONF_DEFAULTS)) {
    out[key] = _deepFillDefaults(source[key], CYBERIA_INSTANCE_CONF_DEFAULTS[key]);
  }
  // A conf from before skills were derived still carries the field; it is not part of the
  // schema any more, and leaving it would put a stale second answer back on the wire.
  delete out.skillConfig;
  return out;
}
