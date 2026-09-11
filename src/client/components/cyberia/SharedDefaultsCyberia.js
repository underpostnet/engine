// Shared content, stat contract, and presentation defaults.
// ─────────────────────────────────────────────────────────────────────────────
// Shared content vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default instance code for the Cyberia engine
 */
export const DEFAULT_INSTANCE_CODE = 'amethyst-strata-expansion';

/**
 * Canonical set of ObjectLayer item type names. Used as the
 * `data.item.type` discriminator and as the asset directory name on disk.
 *
 * Values intentionally equal their keys — this is a string enum, not a
 * z-order map. Render layer ordering lives in `entity_render.c`.
 *
 * @type {Readonly<Record<string,string>>}
 */
export const ITEM_TYPES = Object.freeze({
  skin: 'skin',
  breastplate: 'breastplate',
  weapon: 'weapon',
  skill: 'skill',
  coin: 'coin',
  floor: 'floor',
  obstacle: 'obstacle',
  portal: 'portal',
  foreground: 'foreground',
  resource: 'resource',
  static: 'static',
});

/**
 * Canonical set of entity category names used by the Go simulation,
 * the C/WASM client, and the browser editor UI.
 *
 * @type {Readonly<Record<string,string>>}
 */
export const ENTITY_TYPES = Object.freeze({
  player: 'player',
  other_player: 'other_player',
  bot: 'bot',
  skill: 'skill',
  coin: 'coin',
  floor: 'floor',
  obstacle: 'obstacle',
  portal: 'portal',
  foreground: 'foreground',
  resource: 'resource',
  static: 'static',
});

/** Per-entity-type allowlist of item types that may appear on the entity. */
export const ENTITY_TYPE_TO_ITEM_TYPES = Object.freeze({
  [ENTITY_TYPES.player]: Object.freeze([ITEM_TYPES.skin, ITEM_TYPES.breastplate, ITEM_TYPES.weapon]),
  [ENTITY_TYPES.other_player]: Object.freeze([ITEM_TYPES.skin, ITEM_TYPES.breastplate, ITEM_TYPES.weapon]),
  [ENTITY_TYPES.bot]: Object.freeze([ITEM_TYPES.skin, ITEM_TYPES.weapon]),
  [ENTITY_TYPES.skill]: Object.freeze([ITEM_TYPES.skill]),
  [ENTITY_TYPES.coin]: Object.freeze([ITEM_TYPES.coin]),
  [ENTITY_TYPES.floor]: Object.freeze([ITEM_TYPES.floor]),
  [ENTITY_TYPES.obstacle]: Object.freeze([ITEM_TYPES.obstacle]),
  [ENTITY_TYPES.portal]: Object.freeze([ITEM_TYPES.portal]),
  [ENTITY_TYPES.foreground]: Object.freeze([ITEM_TYPES.foreground]),
  [ENTITY_TYPES.resource]: Object.freeze([ITEM_TYPES.resource]),
  [ENTITY_TYPES.static]: Object.freeze([ITEM_TYPES.static]),
});

/** Quest step objective types accepted by the quest-progress engine. */
export const QUEST_STEPS_TYPES = Object.freeze(['collect', 'talk', 'kill']);

/**
 * Canonical skill LogicId registry — the single source of truth for the
 * `logicEventId` handler keys the simulation skill dispatcher knows how to run.
 * MUST stay aligned with the handlers registered in cyberia-server
 * `game/skill_dispatcher.go#InitSkills`. The skill editor (ActionEngineCyberia)
 * offers ONLY these ids, and `DefaultSkillConfig` (cyberia-server-defaults.js)
 * draws its `logicEventId`s from here.
 *
 * @type {ReadonlyArray<{id:string,name:string,description:string}>}
 */
export const SKILL_LOGIC_IDS = Object.freeze([
  Object.freeze({
    id: 'projectile',
    name: 'Projectile',
    description: 'Fires a projectile toward the tap. Spawn chance and lifetime scale with Intelligence and Range.',
  }),
  Object.freeze({
    id: 'coin_drop_or_transaction',
    name: 'Coin Drop',
    description: 'Drops coins on kill; transfer amount follows the kill-percent economy rules.',
  }),
  Object.freeze({
    id: 'doppelganger',
    name: 'Doppelganger',
    description: 'Summons a passive clone that wanders nearby. Spawn chance scales with Intelligence.',
  }),
]);

/** Ordered list of canonical skill LogicId values. */
export const SKILL_LOGIC_ID_VALUES = Object.freeze(SKILL_LOGIC_IDS.map((l) => l.id));

/** True when `logicEventId` is a known canonical skill LogicId. */
export const isCanonicalSkillLogicId = (logicEventId) => SKILL_LOGIC_ID_VALUES.includes(logicEventId);

/**
 * The two audio routes: a held music bed, and one-shot effects over it.
 *
 * One bus vocabulary, spelled once: the same ids name the `src/audio-module/<bus-id>/` directory
 * an asset is authored in, the argument `cyberia-audio <bus-id> <id>` dispatches on, the `bus` a
 * recorded manifest carries, and the route a binding's `settings.bus` selects.
 */
export const AUDIO_BUS_MUSIC = 'music';
export const AUDIO_BUS_SFX = 'sfx';
export const AUDIO_BUSES = Object.freeze([AUDIO_BUS_MUSIC, AUDIO_BUS_SFX]);

/**
 * Canonical audio LogicId registry — the runtime events an audio binding may answer.
 *
 * Audio is a consumer of the game's semantic event vocabulary, never a second one: a
 * `cyberia-map-audio-conf` binding resolves one of these ids (or a canonical skill LogicId, which
 * the client emits by the same name) to an `audioCode`. The ids live here, beside the other shared
 * vocabularies, because three parties must agree on them — the C client that emits them, the seed
 * that binds them, and the editor that offers them.
 *
 * `bus` is the binding's natural routing: music events take over the map's bed until `idle`
 * restores it; sfx events are one shots. A binding may override it in its own settings.
 *
 * MUST stay aligned with the events emitted by cyberia-client (`src/audio/audio_events.h`).
 *
 * @type {ReadonlyArray<{id:string,name:string,description:string,bus:'music'|'sfx'}>}
 */
export const AUDIO_LOGIC_IDS = Object.freeze([
  Object.freeze({
    id: 'idle',
    name: 'Idle',
    description: 'No event is holding the bed: the map returns to its default music.',
    bus: AUDIO_BUS_MUSIC,
  }),
  Object.freeze({
    id: 'combat',
    name: 'Combat',
    description: 'The player is taking damage: combat music takes over until the exchange ends.',
    bus: AUDIO_BUS_MUSIC,
  }),
  Object.freeze({ id: 'boss', name: 'Boss', description: 'A boss encounter is under way.', bus: AUDIO_BUS_MUSIC }),
  Object.freeze({
    id: 'portal-cooldown',
    name: 'Portal Cooldown',
    description: 'The player is standing on a portal while its teleport charge runs.',
    bus: AUDIO_BUS_MUSIC,
  }),
  Object.freeze({
    id: 'portal',
    name: 'Portal',
    description: 'The teleport charge completed and the player jumps — within a map or across one.',
    bus: AUDIO_BUS_SFX,
  }),
  Object.freeze({
    id: 'hit',
    name: 'Hit',
    description: 'Damage landed on any entity in view, not only on the player.',
    bus: AUDIO_BUS_SFX,
  }),
  Object.freeze({ id: 'heal', name: 'Heal', description: 'Life was restored to an entity in view.', bus: AUDIO_BUS_SFX }),
  Object.freeze({ id: 'drop', name: 'Drop', description: 'An item drop spawned in the world.', bus: AUDIO_BUS_SFX }),
  Object.freeze({
    id: 'victory',
    name: 'Victory',
    description: 'A quest or encounter was completed.',
    bus: AUDIO_BUS_SFX,
  }),
  Object.freeze({
    id: 'level-up',
    name: 'Level Up',
    description: 'An entity in view reached a new level.',
    bus: AUDIO_BUS_SFX,
  }),
  Object.freeze({
    id: 'death',
    name: 'Death',
    description: 'An entity in view was defeated.',
    bus: AUDIO_BUS_SFX,
  }),
  Object.freeze({
    id: 'item-pickup',
    name: 'Item Pickup',
    description: 'An item landed in the player inventory — loot, a reward, a purchase, an assembly output.',
    bus: AUDIO_BUS_SFX,
  }),
  Object.freeze({
    id: 'craft',
    name: 'Craft',
    description: 'An assembly is charging: the bed is held until the recipe progress bar finishes.',
    bus: AUDIO_BUS_MUSIC,
  }),
  Object.freeze({
    id: 'ui-click',
    name: 'UI Click',
    description: 'The interface accepted a tap — a button, a modal control, a bubble.',
    bus: AUDIO_BUS_SFX,
  }),
  Object.freeze({
    id: 'footsteps',
    name: 'Footsteps',
    description: 'Something with feet is walking in view; repeats on a gait cadence while it lasts.',
    bus: AUDIO_BUS_SFX,
  }),
]);

/** Ordered list of canonical audio LogicId values. */
export const AUDIO_LOGIC_ID_VALUES = Object.freeze(AUDIO_LOGIC_IDS.map((l) => l.id));

/** Map: audio LogicId → its natural bus. */
export const AUDIO_LOGIC_ID_BUSES = Object.freeze(
  Object.fromEntries(AUDIO_LOGIC_IDS.map((l) => [l.id, l.bus])),
);

/**
 * True when `logicEventId` is a runtime event an audio binding may answer: an audio event, or a
 * skill event the dispatcher fires (a skill's own id is what the client emits when it runs).
 */
export const isCanonicalAudioLogicId = (logicEventId) =>
  AUDIO_LOGIC_ID_VALUES.includes(logicEventId) || isCanonicalSkillLogicId(logicEventId);

/**
 * Canonical entity-behavior registry — the authoritative vocabulary for the
 * `behavior` an entity-type default may bind to its matched entities. The Go
 * simulation owns the runtime semantics; this registry is the shared label /
 * documentation source consumed by the editor (EntityEngineCyberia) and by
 * content-authority validation. MUST stay aligned with cyberia-server
 * `game/behavior.go`.
 *
 * `selectable: false` marks behaviors the runtime assigns itself
 * (projectiles, coin drops) — they are not author-assignable to a default.
 *
 * @type {ReadonlyArray<{id:string,label:string,description:string,selectable:boolean}>}
 */
export const ENTITY_BEHAVIORS = Object.freeze([
  Object.freeze({
    id: 'passive',
    label: 'Passive',
    description: 'Wanders within its spawn radius; never aggroes. Default for unarmed entities.',
    selectable: true,
  }),
  Object.freeze({
    id: 'hostile',
    label: 'Hostile',
    description: 'Pursues and attacks players within aggro range. Default for armed entities.',
    selectable: true,
  }),
  Object.freeze({
    id: 'provider',
    label: 'Provider',
    description: 'Mission/action giver: barely moves from its spawn (sporadic short steps) and is immortal.',
    selectable: true,
  }),
  Object.freeze({
    id: 'provider-static',
    label: 'Provider (Static)',
    description: 'Like provider but completely immobile, and immortal.',
    selectable: true,
  }),
  Object.freeze({
    id: 'skill',
    label: 'Skill',
    description: 'Runtime projectile entity — assigned by the skill engine, not author-selectable.',
    selectable: false,
  }),
  Object.freeze({
    id: 'coin',
    label: 'Coin',
    description: 'Runtime coin entity — assigned by the economy engine, not author-selectable.',
    selectable: false,
  }),
]);

/** Ordered list of canonical behavior id values. */
export const ENTITY_BEHAVIOR_VALUES = Object.freeze(ENTITY_BEHAVIORS.map((b) => b.id));

/** Author-assignable behaviors (the subset the entity-default editor offers). */
export const SELECTABLE_ENTITY_BEHAVIORS = Object.freeze(ENTITY_BEHAVIORS.filter((b) => b.selectable));

/** True when `behavior` is a known canonical entity behavior. */
export const isCanonicalEntityBehavior = (behavior) => ENTITY_BEHAVIOR_VALUES.includes(behavior);

/**
 * Canonical object-layer animation directions. Each entry binds:
 *   code      — numeric asset folder name on disk
 *               (`./assets/<type>/<id>/<code>/<frame>.png`)
 *   label     — human-readable label for the editor UI
 *   keyframes — render keyframe direction names this folder code feeds
 *
 * Single source of truth for the browser editor (`ObjectLayerEngineModal`) and
 * the Node asset pipeline (`src/projects/cyberia/object-layer.js`). Adding a
 * direction here is the only place it needs to be declared.
 *
 * @type {ReadonlyArray<{code:string,label:string,keyframes:ReadonlyArray<string>}>}
 */
export const OBJECT_LAYER_DIRECTIONS = Object.freeze([
  Object.freeze({
    code: '08',
    label: 'Down Idle',
    keyframes: Object.freeze(['down_idle', 'none_idle', 'default_idle']),
  }),
  Object.freeze({ code: '18', label: 'Down Walk', keyframes: Object.freeze(['down_walking']) }),
  Object.freeze({ code: '02', label: 'Up Idle', keyframes: Object.freeze(['up_idle']) }),
  Object.freeze({ code: '12', label: 'Up Walk', keyframes: Object.freeze(['up_walking']) }),
  Object.freeze({
    code: '04',
    label: 'Left Idle',
    keyframes: Object.freeze(['left_idle', 'up_left_idle', 'down_left_idle']),
  }),
  Object.freeze({
    code: '14',
    label: 'Left Walk',
    keyframes: Object.freeze(['left_walking', 'up_left_walking', 'down_left_walking']),
  }),
  Object.freeze({
    code: '06',
    label: 'Right Idle',
    keyframes: Object.freeze(['right_idle', 'up_right_idle', 'down_right_idle']),
  }),
  Object.freeze({
    code: '16',
    label: 'Right Walk',
    keyframes: Object.freeze(['right_walking', 'up_right_walking', 'down_right_walking']),
  }),
]);

/** Ordered list of object-layer direction folder codes. */
export const OBJECT_LAYER_DIRECTION_CODES = Object.freeze(OBJECT_LAYER_DIRECTIONS.map((d) => d.code));

/** Map: direction folder code → editor label. */
export const OBJECT_LAYER_DIRECTION_LABELS = Object.freeze(
  Object.fromEntries(OBJECT_LAYER_DIRECTIONS.map((d) => [d.code, d.label])),
);

/** Render keyframe direction names a numeric folder code feeds (empty if unknown). */
export const getKeyframeDirectionsByCode = (code) => {
  const entry = OBJECT_LAYER_DIRECTIONS.find((d) => d.code === code);
  return entry ? [...entry.keyframes] : [];
};

/** Inverse map: render keyframe direction name → numeric folder code. */
export const OBJECT_LAYER_DIRECTION_NAME_TO_CODE = Object.freeze(
  OBJECT_LAYER_DIRECTIONS.reduce((acc, d) => {
    for (const name of d.keyframes) acc[name] = d.code;
    return acc;
  }, {}),
);

// Stat order is shared by authoring, simulation, and snapshots. `scale` is what one point is
// worth in the simulation; the server reads it from the generated contract.
export const STAT_DEFINITIONS = Object.freeze([
  { key: 'effect', title: 'Effect', description: 'Removes life on impact.', detail: 'Each point removes one life point per hit.', floor: 1, scale: 1 },
  { key: 'resistance', title: 'Resistance', description: 'Adds maximum life and regeneration amount.', detail: 'Each point adds one point of maximum life and a tenth of a point to each regeneration.', floor: 0, scale: 1 },
  { key: 'agility', title: 'Agility', description: 'Changes movement speed.', detail: 'Each point adds one percent of base speed.', floor: -90, scale: 0.01 },
  { key: 'range', title: 'Range', description: 'Adds lifetime to summoned entities.', detail: 'Each point adds fifty milliseconds of summon lifetime.', floor: 0, scale: 50 },
  { key: 'intelligence', title: 'Intelligence', description: 'Adds summon success chance.', detail: 'Each point adds five percentage points of summon chance.', floor: 0, scale: 0.05 },
  { key: 'utility', title: 'Utility', description: 'Reduces action cooldown and increases regeneration chance.', detail: 'Each point removes one percent of base cooldown and adds one percentage point of regeneration chance.', floor: 0, scale: 0.01 },
].map((stat) => Object.freeze({ ...stat, icon: `stat-${stat.key}.png` })));
export const STAT_TYPES = Object.freeze(STAT_DEFINITIONS.map(({ key }) => key));
/** What one point of each stat is worth in the simulation. */
export const STAT_SCALES = Object.freeze(Object.fromEntries(STAT_DEFINITIONS.map(({ key, scale }) => [key, scale])));
/** Life regenerated per trigger for each point of resistance, on top of the entity's base regeneration. */
export const STAT_REGEN_PER_RESISTANCE = 0.1;
export const STAT_MODIFIER_MIN = -100;
export const STAT_MODIFIER_MAX = 100;
export const STAT_DEFAULT = 0;
export const ENTITY_LEVEL_MIN = 1;
export const ENTITY_LEVEL_MAX = 65535;
export function validateEntityLevel(level) {
  if (!Number.isInteger(level) || level < ENTITY_LEVEL_MIN || level > ENTITY_LEVEL_MAX) {
    throw new RangeError('Entity level must be an integer from 1 to 65535.');
  }
  return level;
}
export const STAT_CONTRACT_VERSION = 2;
export const STAT_DEFAULTS = Object.freeze(Object.fromEntries(STAT_TYPES.map((key) => [key, STAT_DEFAULT])));
export const STAT_EFFECTIVE_FLOORS = Object.freeze(Object.fromEntries(STAT_DEFINITIONS.map(({ key, floor }) => [key, floor])));
export const STAT_DESCRIPTIONS = Object.freeze(Object.fromEntries(STAT_DEFINITIONS.map(({ key, ...info }) => [key, Object.freeze(info)])));

export function validateStatModifier(value) {
  if (!Number.isInteger(value) || value < STAT_MODIFIER_MIN || value > STAT_MODIFIER_MAX) {
    throw new RangeError(`Stat modifiers must be integers from ${STAT_MODIFIER_MIN} to +${STAT_MODIFIER_MAX}.`);
  }
  return value;
}

export function validateStats(stats = {}) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new TypeError('Stats must be an object.');
  for (const key of Object.keys(stats)) {
    if (!STAT_TYPES.includes(key)) throw new TypeError(`Unknown stat: ${key}`);
  }
  return Object.fromEntries(STAT_TYPES.map((key) => [key, validateStatModifier(stats[key] === undefined ? STAT_DEFAULT : stats[key])]));
}

/**
 * Semantic stat bounds per item type, inclusive, as `[min, max]` per stat.
 *
 * What a type may carry: a weapon deals its effect and can cost resistance, a skin and a
 * breastplate defend, a skill reaches, and world content carries nothing. A type absent here,
 * or a stat a type leaves out, keeps the contract bounds.
 */
export const STAT_TYPE_BOUNDS = Object.freeze({
  weapon:      { effect: [5, 20], resistance: [-10, 2], agility: [-5, 5], range: [0, 10], intelligence: [0, 5], utility: [0, 10] },
  skin:        { effect: [1, 1], resistance: [0, 20], agility: [-5, 10], range: [0, 0], intelligence: [0, 2], utility: [0, 5] },
  breastplate: { effect: [0, 0], resistance: [5, 30], agility: [-15, 0], range: [0, 0], intelligence: [0, 3], utility: [0, 5] },
  skill:       { effect: [0, 15], resistance: [0, 5], agility: [0, 5], range: [5, 30], intelligence: [0, 10], utility: [0, 10] },
  resource:    { effect: [0, 0], resistance: [0, 10], agility: [0, 0], range: [0, 0], intelligence: [0, 0], utility: [0, 0] },
  coin:        { effect: [0, 0], resistance: [0, 0], agility: [0, 0], range: [0, 0], intelligence: [0, 0], utility: [0, 0] },
  floor:       { effect: [0, 0], resistance: [0, 0], agility: [0, 0], range: [0, 0], intelligence: [0, 0], utility: [0, 0] },
  obstacle:    { effect: [0, 0], resistance: [0, 0], agility: [0, 0], range: [0, 0], intelligence: [0, 0], utility: [0, 0] },
  portal:      { effect: [0, 0], resistance: [0, 0], agility: [0, 0], range: [0, 0], intelligence: [0, 0], utility: [0, 0] },
  foreground:  { effect: [0, 0], resistance: [0, 0], agility: [0, 0], range: [0, 0], intelligence: [0, 0], utility: [0, 0] },
  static:      { effect: [0, 0], resistance: [0, 0], agility: [0, 0], range: [0, 0], intelligence: [0, 0], utility: [0, 0] },
});

for (const [type, bounds] of Object.entries(STAT_TYPE_BOUNDS)) {
  if (!Object.values(ITEM_TYPES).includes(type)) throw new Error(`STAT_TYPE_BOUNDS: unknown item type "${type}"`);
  for (const [key, [min, max]] of Object.entries(bounds)) {
    if (!STAT_TYPES.includes(key)) throw new Error(`STAT_TYPE_BOUNDS: ${type} names unknown stat "${key}"`);
    validateStatModifier(min);
    validateStatModifier(max);
    if (min > max) throw new Error(`STAT_TYPE_BOUNDS: ${type}.${key} minimum exceeds its maximum`);
  }
}

/**
 * The inclusive `[min, max]` every stat may take for an item type: the semantic bound where the
 * type declares one, the contract bound where it does not.
 *
 * @param {string} itemType
 * @returns {Readonly<Record<string,[number,number]>>}
 */
export function statBoundsForType(itemType) {
  const typed = STAT_TYPE_BOUNDS[itemType] ?? {};
  return Object.freeze(Object.fromEntries(STAT_TYPES.map((key) => [key, typed[key] ?? [STAT_MODIFIER_MIN, STAT_MODIFIER_MAX]])));
}

export function generateRandomStats(min = STAT_MODIFIER_MIN, max = STAT_MODIFIER_MAX, random = Math.random) {
  validateStatModifier(min);
  validateStatModifier(max);
  if (min > max) throw new RangeError('Random minimum must not exceed maximum.');
  return Object.fromEntries(STAT_TYPES.map((key) => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return [0, 1).');
    return [key, Math.floor(value * (max - min + 1)) + min];
  }));
}

/**
 * Canonical (itemId → itemType) registry shipped with the engine. Used
 * by the import-default-items seed, the on-chain ObjectLayerToken bridge,
 * the fallback world generator, the CLI tooling, and the browser editor.
 *
 * Adding a new item here is the **only** place it needs to be declared.
 */
export const DefaultCyberiaItems = [
  { item: { id: 'coin', type: ITEM_TYPES.coin } },
  { item: { id: 'hatchet-skill', type: ITEM_TYPES.skill } },
  { item: { id: 'atlas_pistol_mk2', type: ITEM_TYPES.weapon } },
  { item: { id: 'atlas_pistol_mk2_bullet', type: ITEM_TYPES.skill } },
  { item: { id: 'tim-knife', type: ITEM_TYPES.weapon } },
  { item: { id: 'hatchet', type: ITEM_TYPES.weapon } },
  { item: { id: 'wason', type: ITEM_TYPES.skin } },
  { item: { id: 'kishins', type: ITEM_TYPES.skin } },
  { item: { id: 'scp-2040', type: ITEM_TYPES.skin } },
  { item: { id: 'purple', type: ITEM_TYPES.skin } },
  { item: { id: 'punk', type: ITEM_TYPES.skin } },
  { item: { id: 'lain', type: ITEM_TYPES.skin } },
  { item: { id: 'kaneki', type: ITEM_TYPES.skin } },
  { item: { id: 'junko', type: ITEM_TYPES.skin } },
  { item: { id: 'ghost', type: ITEM_TYPES.skin } },
  { item: { id: 'fragmentation', type: ITEM_TYPES.skin } },
  { item: { id: 'eiri', type: ITEM_TYPES.skin } },
  { item: { id: 'anon', type: ITEM_TYPES.skin } },
  { item: { id: 'alex', type: ITEM_TYPES.skin } },
  { item: { id: 'agent', type: ITEM_TYPES.skin } },
  { item: { id: 'grass', type: ITEM_TYPES.floor } },
  { item: { id: 'wood-1', type: ITEM_TYPES.resource } },
  { item: { id: 'wood-2', type: ITEM_TYPES.resource } },
  { item: { id: 'wood-extracted-1', type: ITEM_TYPES.resource } },
  { item: { id: 'wood-extracted-2', type: ITEM_TYPES.resource } },
  { item: { id: 'wood-drop-1', type: ITEM_TYPES.resource } },
  { item: { id: 'wood-drop-2', type: ITEM_TYPES.resource } },
];

const _ITEM_BY_ID = Object.freeze(
  DefaultCyberiaItems.reduce((acc, entry) => {
    acc[entry.item.id] = entry;
    return acc;
  }, {}),
);

/** O(1) lookup: item id → registry entry, or `null` if unknown. */
export const getDefaultCyberiaItemById = (itemId) => _ITEM_BY_ID[itemId] || null;

/** All registry entries of a given item type. */
export const getDefaultCyberiaItemsByItemType = (itemType) =>
  DefaultCyberiaItems.filter((entry) => entry.item.type === itemType);

/** All registry entries whose item type is permitted on a given entity type. */
export const getDefaultCyberiaItemsByEntityType = (entityType) => {
  const allowed = ENTITY_TYPE_TO_ITEM_TYPES[entityType] || [];
  return DefaultCyberiaItems.filter((entry) => allowed.includes(entry.item.type));
};

// ─────────────────────────────────────────────────────────────────────────────
// Presentation defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Named colour palette. Solid-color fallbacks for entity types, plus
 * UI-only entries (WEAPON, SELF_BORDER) the renderer uses for HUD.
 *
 * Keys are stable identifiers shared with the C client's local palette.
 * Adding a new key here requires adding it to
 * `cyberia-client/src/domain/presentation_defaults.h` to keep parity.
 *
 * @type {ReadonlyArray<{key:string,r:number,g:number,b:number,a:number}>}
 */
export const PALETTE = Object.freeze([
  { key: 'BACKGROUND', r: 30, g: 30, b: 30, a: 255 },
  { key: 'FLOOR_BACKGROUND', r: 45, g: 45, b: 45, a: 255 },
  { key: 'FLOOR', r: 60, g: 60, b: 60, a: 255 },
  { key: 'OBSTACLE', r: 80, g: 80, b: 80, a: 255 },
  { key: 'PORTAL', r: 0, g: 200, b: 200, a: 255 },
  { key: 'PORTAL_INTER_PORTAL', r: 0, g: 200, b: 200, a: 255 },
  { key: 'PORTAL_INTER_RANDOM', r: 80, g: 130, b: 255, a: 255 },
  { key: 'PORTAL_INTRA_RANDOM', r: 220, g: 200, b: 50, a: 255 },
  { key: 'PORTAL_INTRA_PORTAL', r: 200, g: 80, b: 200, a: 255 },
  { key: 'FOREGROUND', r: 255, g: 255, b: 255, a: 189 },
  { key: 'PLAYER', r: 0, g: 255, b: 0, a: 255 },
  { key: 'OTHER_PLAYER', r: 128, g: 128, b: 255, a: 255 },
  { key: 'BOT', r: 255, g: 128, b: 0, a: 255 },
  { key: 'GHOST', r: 200, g: 200, b: 255, a: 100 },
  { key: 'COIN', r: 255, g: 215, b: 0, a: 255 },
  { key: 'SKILL', r: 255, g: 255, b: 50, a: 255 },
  { key: 'RESOURCE', r: 100, g: 180, b: 80, a: 255 },
  { key: 'STATIC', r: 120, g: 140, b: 110, a: 255 },
  { key: 'WEAPON', r: 180, g: 50, b: 50, a: 255 },
  { key: 'SELF_BORDER', r: 220, g: 190, b: 60, a: 240 },
]);

/**
 * Per-entity-type palette key. Tells the client which palette entry to
 * use as the solid-colour fallback for an entity that has no active
 * ObjectLayer items.
 */
export const ENTITY_COLOR_KEYS = Object.freeze([
  { entityType: 'player', colorKey: 'PLAYER' },
  { entityType: 'other_player', colorKey: 'OTHER_PLAYER' },
  { entityType: 'bot', colorKey: 'BOT' },
  { entityType: 'skill', colorKey: 'SKILL' },
  { entityType: 'coin', colorKey: 'COIN' },
  { entityType: 'floor', colorKey: 'FLOOR' },
  { entityType: 'obstacle', colorKey: 'OBSTACLE' },
  { entityType: 'portal', colorKey: 'PORTAL' },
  { entityType: 'foreground', colorKey: 'FOREGROUND' },
  { entityType: 'resource', colorKey: 'RESOURCE' },
  { entityType: 'static', colorKey: 'STATIC' },
]);

/**
 * Camera and render-tuning defaults. Pure presentation — the cyberia-server
 * never reads any of these. The cyberia-client fetches the whole bundle
 * from /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE at startup
 * and treats this object as the on-disk schema.
 *
 *   cellSize        — pixels per simulation cell on the client viewport.
 *                     Authoritative server works in cell units; this value
 *                     only governs how cells map to pixels for rendering.
 *   interpolationMs — render-time smoothing window for remote entities.
 *                     Server ticks at TickRate, snapshots at SnapshotRate,
 *                     client decides how to display the stream.
 *   defaultObjWidth /
 *   defaultObjHeight — default entity dimensions used by the world editor
 *                     and the client when a doc omits dims. Presentation
 *                     because dims-in-cells is just a visual sizing.
 *   fontFamily      — TTF file name under engine `assets/fonts/`. When set, the
 *                     cyberia-client fetches `assets/fonts/<fontFamily>` and loads
 *                     it as the main default font for all text. Empty = raylib's
 *                     built-in font.
 *   fontFactorSize  — uniform multiplier applied to every text size, so a
 *                     deployment can scale all UI/HUD text without per-call edits.
 */
export const RENDER_DEFAULTS = Object.freeze({
  cellSize: 45,
  defaultObjWidth: 1,
  defaultObjHeight: 1,
  cameraSmoothing: 0.1,
  cameraZoom: 1.0,
  defaultWidthScreenFactor: 1,
  defaultHeightScreenFactor: 1,
  interpolationMs: 100,
  devUi: false,
  // EndlessBossBattleRegular-v7Ey.ttf
  // Pixeboy-z8XGD.ttf
  // PressStart2P-Regular.ttf
  // VT323-Regular.ttf
  // Jersey15-Regular.ttf

  fontFamily: 'Jersey15-Regular.ttf',
  fontFactorSize: 1.4,
});

/**
 * Status-icon presentation half. The numeric `id` is shared with the
 * simulation (it travels on the wire as a u8 inside the AOI binary
 * entity-status indicator field). Everything else here — icon filename,
 * border colour, bounce animation — is purely cosmetic and resolved on
 * the client.
 *
 * IDs MUST stay aligned with `STATUS_ICONS` in `cyberia-server-defaults.js`.
 */
export const STATUS_ICONS_PRESENTATION = Object.freeze([
  { id: 0, iconId: null, bounce: false, borderColor: { r: 70, g: 70, b: 120, a: 200 } },
  { id: 1, iconId: 'arrow-down-gray', bounce: false, borderColor: { r: 130, g: 140, b: 160, a: 200 } },
  { id: 2, iconId: 'arrow-down-red', bounce: true, borderColor: { r: 210, g: 50, b: 50, a: 240 } },
  { id: 3, iconId: 'chat', bounce: true, borderColor: { r: 80, g: 160, b: 220, a: 240 } },
  { id: 4, iconId: 'arrow-down', bounce: false, borderColor: { r: 60, g: 190, b: 90, a: 240 } },
  { id: 5, iconId: 'clock', bounce: false, borderColor: { r: 160, g: 130, b: 200, a: 200 } },
  { id: 6, iconId: 'arrow-down-gray', bounce: false, borderColor: { r: 100, g: 180, b: 80, a: 220 } },
  { id: 7, iconId: 'clock', bounce: false, borderColor: { r: 160, g: 130, b: 200, a: 200 } },
  { id: 8, iconId: 'hand', bounce: true, borderColor: { r: 80, g: 160, b: 220, a: 240 } },
  { id: 9, iconId: 'quest', bounce: true, borderColor: { r: 220, g: 190, b: 60, a: 240 } },
  { id: 10, iconId: 'transport', bounce: false, borderColor: { r: 90, g: 170, b: 230, a: 240 } },
  { id: 11, iconId: 'transport-random', bounce: false, borderColor: { r: 150, g: 130, b: 230, a: 240 } },
]);

/**
 * Build the full client-hints document for a given instance.
 *
 * @param {Object} [overrides] DB document fragments that may override
 *   palette colours, render defaults, status-icon iconIds, etc.
 *   Anything missing falls back to the canonical defaults exported here.
 * @returns {Object} JSON-friendly client hints object.
 */
export function buildClientHints(overrides = {}) {
  const ov = overrides || {};

  // Palette merge: canonical first, DB overrides keyed by name, append any
  // truly new keys at the end.
  const dbColors = new Map((ov.colors || []).map((c) => [c.key, c]));
  const palette = PALETTE.map((c) => {
    const o = dbColors.get(c.key);
    return o ? { key: c.key, r: o.r ?? c.r, g: o.g ?? c.g, b: o.b ?? c.b, a: o.a ?? c.a } : { ...c };
  });
  for (const [key, c] of dbColors) {
    if (!palette.some((p) => p.key === key)) {
      palette.push({ key, r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0, a: c.a ?? 255 });
    }
  }

  // Status icons: only iconId is overridable. Border colour stays canonical
  // because the DB schema defaults for that field are placeholder values.
  const dbIcons = new Map((ov.statusIcons || []).map((s) => [s.id, s]));
  const statusIcons = STATUS_ICONS_PRESENTATION.map((canon) => {
    const o = dbIcons.get(canon.id);
    return {
      id: canon.id,
      iconId: (o && o.iconId) || canon.iconId || '',
      bounce: canon.bounce,
      borderColor: { ...canon.borderColor },
    };
  });

  return {
    palette,
    entityColorKeys: ENTITY_COLOR_KEYS.map((e) => ({ ...e })),
    statusIcons,
    cellSize: ov.cellSize ?? RENDER_DEFAULTS.cellSize,
    defaultObjWidth: ov.defaultObjWidth ?? RENDER_DEFAULTS.defaultObjWidth,
    defaultObjHeight: ov.defaultObjHeight ?? RENDER_DEFAULTS.defaultObjHeight,
    cameraSmoothing: ov.cameraSmoothing ?? RENDER_DEFAULTS.cameraSmoothing,
    cameraZoom: ov.cameraZoom ?? RENDER_DEFAULTS.cameraZoom,
    defaultWidthScreenFactor: ov.defaultWidthScreenFactor ?? RENDER_DEFAULTS.defaultWidthScreenFactor,
    defaultHeightScreenFactor: ov.defaultHeightScreenFactor ?? RENDER_DEFAULTS.defaultHeightScreenFactor,
    interpolationMs: ov.interpolationMs ?? RENDER_DEFAULTS.interpolationMs,
    devUi: ov.devUi ?? RENDER_DEFAULTS.devUi,
    fontFamily: ov.fontFamily ?? RENDER_DEFAULTS.fontFamily,
    fontFactorSize: ov.fontFactorSize ?? RENDER_DEFAULTS.fontFactorSize,
  };
}

/**
 * Canonical hints document — what the client gets when no DB overrides
 * exist (or the engine endpoint is unreachable).
 */
export const CYBERIA_CLIENT_HINTS_DEFAULTS = buildClientHints({});
