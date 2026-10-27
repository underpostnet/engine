// Shared runtime vocabulary, stat contract, and presentation defaults. Content lives in the
// cyberia-content repository, which reads this vocabulary as its generated runtime contract.
// ─────────────────────────────────────────────────────────────────────────────
// Shared runtime vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default instance code for the Cyberia engine: the world a release serves at `/`.
 */
export const DEFAULT_INSTANCE_CODE = 'amethyst-strata-expansion';

/**
 * The path of a world on its game client and server: the default world at the root, any other
 * under its code.
 * @param {string} code
 * @returns {string}
 */
export const worldPathOf = (code) => (code && code !== DEFAULT_INSTANCE_CODE ? `/${encodeURIComponent(code)}` : '');

/**
 * The preview the engine draws of a world from its maps, as an API endpoint and id.
 * @param {string} code
 * @returns {{endpoint: string, id: string}}
 */
export const worldPreviewPicture = (code) => ({
  endpoint: 'cyberia-instance/instance-map',
  id: `${encodeURIComponent(code)}/world-preview`,
});

/**
 * The picture of a world on its card, as an API endpoint and id: the thumbnail its author set, else
 * its preview.
 * @param {{code: string, thumbnail?: string|{_id: string}}} instance
 * @returns {{endpoint: string, id: string}}
 */
export const worldPicture = ({ code, thumbnail }) => {
  const fileId = thumbnail?._id ?? thumbnail;
  return fileId ? { endpoint: 'file/blob', id: String(fileId) } : worldPreviewPicture(code);
};

/**
 * Canonical set of ObjectLayer item type names. Used as the
 * `data.item.type` discriminator and as the asset directory name on disk.
 *
 * Values intentionally equal their keys — this is a string enum, not a
 * z-order map. The draw order is {@link VISUAL_LAYER_PRIORITY}.
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
  consumable: 'consumable',
});

/**
 * The draw order of the layers of an entity that faces down: a lower priority draws first, behind.
 * Facing up, the skin and the weapon swap priorities. Equal priorities keep the order of the layers.
 */
export const VISUAL_LAYER_PRIORITY = Object.freeze({ skin: 10, weapon: 40, other: 50 });

/** The draw priority of an item type when its entity faces down. */
export const visualLayerPriority = (type) => VISUAL_LAYER_PRIORITY[type] ?? VISUAL_LAYER_PRIORITY.other;

/**
 * The baseline frames of a render of an item type, by direction code: a skin idles and walks in four
 * facings, with two alternating frames per walk; a floor is one static frame; a portal turns and an
 * obstacle shifts in three idle frames. A suggestion an author starts from, never a rule.
 */
export const RENDER_FRAME_CONTRACT = Object.freeze({
  [ITEM_TYPES.skin]: Object.freeze({ '08': 1, '02': 1, '04': 1, '06': 1, '18': 2, '12': 2, '14': 2, '16': 2 }),
  [ITEM_TYPES.floor]: Object.freeze({ '08': 1 }),
  [ITEM_TYPES.portal]: Object.freeze({ '08': 3 }),
  [ITEM_TYPES.obstacle]: Object.freeze({ '08': 3 }),
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
  loot: 'loot',
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
  [ENTITY_TYPES.loot]: Object.freeze([ITEM_TYPES.consumable]),
});

/** Quest step objective types accepted by the quest-progress engine. */
export const QUEST_STEPS_TYPES = Object.freeze(['collect', 'talk', 'kill']);

/** The table column the sagas of a row show in, and the filter key a table sends for them. */
export const SAGA_FILTER_KEY = 'sagaCode';

/**
 * The key of a Map Population item a moderator authors in the Object Layer Studio: the Studio sends it
 * with its save, so the save becomes the draft definition of that item.
 */
export const authoringKey = (populationId, itemId) => `population:${populationId}:${itemId}`;

/** The population and the item an authoring key names, or null for another key. */
export const authoringOf = (key) => {
  const match = /^population:([0-9a-f]{24}):(.+)$/.exec(String(key ?? ''));
  return match ? { populationId: match[1], itemId: match[2] } : null;
};

/** How a portal connects: to a portal or a random cell, on another map or the same one. */
export const PORTAL_MODES = Object.freeze(['inter-portal', 'inter-random', 'intra-random', 'intra-portal']);

/** The code of a universe, an instance or a map. */
export const CONTENT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * A graph layout places each node on one integer cell: x grows right, y grows down, the origin is
 * free and both axes stay within ±LAYOUT_CELL_LIMIT. No two nodes share a cell. The layout is view
 * data only: it never moves an edge, a portal cell or an entity.
 */
export const LAYOUT_CELL_LIMIT = 64;

const layoutCellKey = (x, y) => `${x},${y}`;

/**
 * The layout of a graph: each node on its saved cell, and each other node on the first free cell
 * of a square grid of ⌈√n⌉ columns, in code order.
 * @param {string[]} codes - The node codes, in order.
 * @param {Object[]} saved - The saved cells, `{[key]: code, x, y}`.
 * @param {string} key - The field that names the node of a saved cell.
 * @returns {{x: number, y: number}[]} One cell per code, `{[key]: code, x, y}`.
 */
export const resolveGraphLayout = (codes, saved, key) => {
  const placed = new Map(saved.filter((cell) => codes.includes(cell[key])).map((cell) => [cell[key], cell]));
  const taken = new Set([...placed.values()].map(({ x, y }) => layoutCellKey(x, y)));
  const columns = Math.max(1, Math.ceil(Math.sqrt(codes.length)));
  let next = 0;
  for (const code of [...codes].sort()) {
    if (placed.has(code)) continue;
    while (taken.has(layoutCellKey(next % columns, Math.floor(next / columns)))) next++;
    const free = { [key]: code, x: next % columns, y: Math.floor(next / columns) };
    taken.add(layoutCellKey(free.x, free.y));
    placed.set(code, free);
  }
  return codes.map((code) => ({ [key]: code, x: placed.get(code).x, y: placed.get(code).y }));
};

/**
 * The first defect of a saved layout, or ''.
 * @param {string[]} codes - The node codes of the graph.
 * @param {Object[]} cells - The saved cells, `{[key]: code, x, y}`.
 * @param {string} key - The field that names the node of a cell.
 * @returns {string}
 */
export const graphLayoutDefect = (codes, cells, key) => {
  const nodes = new Set();
  const taken = new Set();
  for (const cell of cells) {
    const code = cell?.[key];
    if (!codes.includes(code)) return `${code} is not a node of the graph`;
    if (nodes.has(code)) return `${code} has two cells`;
    const { x, y } = cell;
    if (![x, y].every((v) => Number.isInteger(v) && Math.abs(v) <= LAYOUT_CELL_LIMIT))
      return `${code} needs integer cells within ±${LAYOUT_CELL_LIMIT}`;
    if (taken.has(layoutCellKey(x, y))) return `${code} shares the cell ${x},${y}`;
    nodes.add(code);
    taken.add(layoutCellKey(x, y));
  }
  return '';
};

/** The largest distance of a map world origin from 0, in map cells. */
export const MAP_WORLD_LIMIT = 1_000_000;

/**
 * The world origin of a map places it in the cell space of its world: the map takes `gridX` ×
 * `gridY` cells from (`worldX`, `worldY`). Two maps share an edge only where their cells meet. A map
 * without an origin has no physical place and shows on its layout cell.
 * @param {{worldX?: number|null, worldY?: number|null}} map
 * @returns {boolean}
 */
export const hasWorldOrigin = ({ worldX, worldY }) => Number.isFinite(worldX) && Number.isFinite(worldY);

/**
 * The first defect of the world origin of a map, or ''.
 * @param {{worldX?: number|null, worldY?: number|null, gridX?: number, gridY?: number}} map
 * @returns {string}
 */
export const mapSpatialDefect = (map) => {
  const { worldX, worldY, gridX, gridY } = map;
  if (worldX == null && worldY == null) return '';
  if (![worldX, worldY].every((n) => Number.isInteger(n) && Math.abs(n) <= MAP_WORLD_LIMIT))
    return `The world origin needs two integer cells within ±${MAP_WORLD_LIMIT}`;
  if (![gridX, gridY].every((n) => Number.isInteger(n) && n > 0)) return 'The map grid needs positive integer sides';
  return '';
};

/**
 * The maps of one world whose cells overlap, each pair as a defect.
 * @param {Array<{code: string, worldX?: number|null, worldY?: number|null, gridX: number, gridY: number}>} maps
 * @returns {string[]}
 */
export const worldPlacementDefects = (maps) => {
  const placed = maps.filter(hasWorldOrigin);
  const defects = [];
  for (const [i, a] of placed.entries())
    for (const b of placed.slice(i + 1))
      if (
        a.worldX < b.worldX + b.gridX &&
        b.worldX < a.worldX + a.gridX &&
        a.worldY < b.worldY + b.gridY &&
        b.worldY < a.worldY + a.gridY
      )
        defects.push(`Maps ${a.code} and ${b.code} overlap in their world`);
  return defects;
};

/** Prefix of an item's dialogue code: its flavor text, and an NPC's greeting when the item is its skin. */
export const ITEM_DIALOGUE_PREFIX = 'default-';

/** The item a dialogue code belongs to, or '' when the code is not an item dialogue. */
export const dialogueItemId = (code) =>
  String(code ?? '').startsWith(ITEM_DIALOGUE_PREFIX) ? code.slice(ITEM_DIALOGUE_PREFIX.length) : '';

/** Summoned-entity id the simulation resolves to the caster's active skin. */
export const CASTER_SKIN_PLACEHOLDER = '$active_skin';

/**
 * Canonical skill LogicId registry — the single source of truth for the
 * `logicEventId` handler keys the simulation skill dispatcher knows how to run.
 * MUST stay aligned with the handlers registered in cyberia-server
 * `game/skill_dispatcher.go#InitSkills`. The skill editor (ActionEngineCyberia)
 * offers ONLY these ids, and content abilities draw their `logicEventId` from here.
 *
 * `summons` is the item type of the entity the handler spawns; null spawns the caster's skin.
 * `summonsTrigger` marks a handler whose entity is its trigger item itself.
 *
 * @type {ReadonlyArray<{id:string,name:string,description:string,summons:string|null,summonsTrigger?:boolean}>}
 */
export const SKILL_LOGIC_IDS = Object.freeze([
  Object.freeze({
    id: 'projectile',
    name: 'Projectile',
    description: 'Fires a projectile toward the tap. Spawn chance and lifetime scale with Intelligence and Range.',
    summons: ITEM_TYPES.skill,
  }),
  Object.freeze({
    id: 'coin_drop_or_transaction',
    name: 'Coin Drop',
    description: 'Drops coins on kill; transfer amount follows the kill-percent economy rules.',
    summons: ITEM_TYPES.coin,
  }),
  Object.freeze({
    id: 'doppelganger',
    name: 'Doppelganger',
    description: 'Summons a passive clone that wanders nearby. Spawn chance scales with Intelligence.',
    summons: null,
  }),
  Object.freeze({
    id: 'zero-waste-auto-consume-heal',
    name: 'Zero-Waste Heal',
    description:
      'Consumes one held unit by itself when the missing life takes the whole heal. The item heals its Resistance as life.',
    summons: ITEM_TYPES.consumable,
    summonsTrigger: true,
  }),
]);

/** Ordered list of canonical skill LogicId values. */
export const SKILL_LOGIC_ID_VALUES = Object.freeze(SKILL_LOGIC_IDS.map((l) => l.id));

/** True when `logicEventId` is a known canonical skill LogicId. */
export const isCanonicalSkillLogicId = (logicEventId) => SKILL_LOGIC_ID_VALUES.includes(logicEventId);

/** The entity a skill summons: the trigger item when its logic summons the trigger, else the authored entity. */
export const skillSummonedItemId = ({ logicEventId, summonedEntityItemId = '' }, triggerItemId) =>
  SKILL_LOGIC_IDS.find(({ id }) => id === logicEventId)?.summonsTrigger ? triggerItemId : summonedEntityItemId;

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
 * `behavior` an entity-type default may bind to its matched entities. This
 * registry is the shared label / documentation source consumed by the editor
 * (EntityEngineCyberia) and by content-authority validation.
 *
 * `entityType` is the one entity type a behavior applies to. The Go simulation
 * owns the semantics of bot, obstacle and loot behaviors and MUST stay aligned with
 * cyberia-server `game/behavior.go`. The client owns the semantics of foreground behaviors.
 *
 * `selectable: false` marks behaviors the runtime assigns itself
 * (projectiles, coin drops) — they are not author-assignable to a default.
 * `immortal` marks behaviors whose entities take no combat damage
 * (`BehaviorIsImmortal` on the server).
 *
 * @type {ReadonlyArray<{id:string,label:string,description:string,entityType:string,selectable:boolean,immortal?:boolean}>}
 */
export const ENTITY_BEHAVIORS = Object.freeze([
  Object.freeze({
    id: 'passive',
    label: 'Passive',
    description: 'Wanders within its spawn radius; never aggroes. Default for unarmed entities.',
    entityType: ENTITY_TYPES.bot,
    selectable: true,
  }),
  Object.freeze({
    id: 'hostile',
    label: 'Hostile',
    description: 'Pursues and attacks players within aggro range. Default for armed entities.',
    entityType: ENTITY_TYPES.bot,
    selectable: true,
  }),
  Object.freeze({
    id: 'provider',
    label: 'Provider',
    description: 'Mission/action giver: barely moves from its spawn (sporadic short steps) and is immortal.',
    entityType: ENTITY_TYPES.bot,
    selectable: true,
    immortal: true,
  }),
  Object.freeze({
    id: 'provider-static',
    label: 'Provider (Static)',
    description: 'Like provider but completely immobile, and immortal.',
    entityType: ENTITY_TYPES.bot,
    selectable: true,
    immortal: true,
  }),
  Object.freeze({
    id: 'destructible',
    label: 'Destructible Obstacle',
    description:
      'Blocks movement while it has life and takes projectile damage. Depleted, it scatters its drops, shows its dead items and stops blocking until it respawns.',
    entityType: ENTITY_TYPES.obstacle,
    selectable: true,
  }),
  Object.freeze({
    id: 'overhead-occlusion',
    label: 'Overhead Occlusion',
    description: 'Roof: fades out while the local player stands under it, and fades back in when the player leaves.',
    entityType: ENTITY_TYPES.foreground,
    selectable: true,
  }),
  Object.freeze({
    id: 'consume-on-pickup-heal',
    label: 'Consume on Pickup (Heal)',
    description:
      'World loot its collector consumes at once to restore the buff factor of its item as life. Without it, collection grants the item.',
    entityType: ENTITY_TYPES.loot,
    selectable: true,
  }),
  Object.freeze({
    id: 'skill',
    label: 'Skill',
    description: 'Runtime projectile entity — assigned by the skill engine, not author-selectable.',
    entityType: ENTITY_TYPES.skill,
    selectable: false,
  }),
  Object.freeze({
    id: 'coin',
    label: 'Coin',
    description: 'Runtime coin entity — assigned by the economy engine, not author-selectable.',
    entityType: ENTITY_TYPES.coin,
    selectable: false,
  }),
]);

/** Ordered list of canonical behavior id values. */
export const ENTITY_BEHAVIOR_VALUES = Object.freeze(ENTITY_BEHAVIORS.map((b) => b.id));

/** Author-assignable behaviors (the subset the entity-default editor offers). */
export const SELECTABLE_ENTITY_BEHAVIORS = Object.freeze(ENTITY_BEHAVIORS.filter((b) => b.selectable));

/** True when an entity of `behavior` ignores combat damage, so no player can kill it. */
export const isImmortalBehavior = (behavior) => ENTITY_BEHAVIORS.some((b) => b.id === behavior && b.immortal);

/** True when `behavior` is a known canonical entity behavior. */
export const isCanonicalEntityBehavior = (behavior) => ENTITY_BEHAVIOR_VALUES.includes(behavior);

/** True when a default of `entityType` may bind `behavior`: none, or an author-assignable behavior of that type. */
export const isAssignableEntityBehavior = (entityType, behavior) =>
  !behavior || SELECTABLE_ENTITY_BEHAVIORS.some((b) => b.id === behavior && b.entityType === entityType);

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
// Time a dead entity or a consumed loot token waits before it comes back.
export const RESPAWN_DURATION_MS_MIN = 1000;
export const RESPAWN_DURATION_MS_DEFAULT = 3000;
export function validateRespawnDuration(ms) {
  if (!Number.isInteger(ms) || ms < RESPAWN_DURATION_MS_MIN) {
    throw new RangeError(`Respawn time must be an integer of at least ${RESPAWN_DURATION_MS_MIN} ms.`);
  }
  return ms;
}
// A player container slot holds one stack: one item id at any quantity. Coins take no slot.
// A container opens `base` slots at level 1, then `step` more every `every` levels, up to `max`.
export const CONTAINER_CAPACITY = Object.freeze({
  inventory: Object.freeze({ base: 8, step: 1, every: 3, max: 24 }),
  storage: Object.freeze({ base: 16, step: 2, every: 5, max: 40 }),
});
// The open slots of a container at a level; mirrors `CapacityRule.Slots` of the game server.
export const containerSlots = ({ base, step, every, max }, level) =>
  Math.min(max, base + step * Math.floor((Math.max(level, 1) - 1) / every));
export const PARTY_MAX_MEMBERS = 5;
// Pending party invites one player can hold.
export const PARTY_INVITES_MAX = 5;
// A party member shares a bot kill when its centre is this many cells or less from the centre of the bot.
export const PARTY_XP_SHARE_RADIUS = 10;
export const CHAT_TEXT_MAX_RUNES = 160;
// The bag stacks one side of a trade offers at most.
export const TRADE_OFFER_MAX_STACKS = 8;
// The most cells between the centre of a player and the cell it drops a stack on.
export const ITEM_DROP_REACH = 4;
// Chat emoji: a line writes `:<name>:` and the client draws the ui-icon `emoji-<name>` in its place.
export const CHAT_EMOJI = Object.freeze(['smile', 'laugh', 'wink', 'cool', 'sad', 'angry', 'heart', 'thumbsup']);
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
 * breastplate defend, a skill reaches, a consumable heals its resistance, and world content carries
 * nothing. A type
 * absent here, or a stat a type leaves out, keeps the contract bounds.
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
  consumable:  { effect: [0, 0], resistance: [0, 50], agility: [0, 0], range: [0, 0], intelligence: [0, 0], utility: [0, 0] },
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

/**
 * Custom stat bounds an author sets in place of the bounds of the item type: each stat `[min, max]`,
 * whole numbers inside the stat contract, the minimum not above the maximum.
 *
 * @param {Record<string,[number,number]>} ranges
 * @returns {Readonly<Record<string,[number,number]>>}
 * @throws {RangeError} Naming the first stat whose range is not valid.
 */
export function customStatBounds(ranges) {
  if (!ranges || typeof ranges !== 'object') throw new RangeError('Custom stat bounds give each stat [min, max].');
  return Object.freeze(
    Object.fromEntries(
      STAT_TYPES.map((key) => {
        const range = ranges[key];
        if (!Array.isArray(range) || range.length !== 2) throw new RangeError(`${key}: custom bounds are [min, max].`);
        for (const value of range)
          if (!Number.isInteger(value) || value < STAT_MODIFIER_MIN || value > STAT_MODIFIER_MAX)
            throw new RangeError(`${key}: ${value} is outside ${STAT_MODIFIER_MIN} to ${STAT_MODIFIER_MAX}.`);
        if (range[0] > range[1])
          throw new RangeError(`${key}: the minimum ${range[0]} is above the maximum ${range[1]}.`);
        return [key, Object.freeze([...range])];
      }),
    ),
  );
}

/**
 * The stats outside some bounds ({@link statBoundsForType} or {@link customStatBounds}), in contract
 * order. A stat left out takes the default.
 *
 * @param {Readonly<Record<string,[number,number]>>} bounds
 * @param {Record<string,number>} [stats]
 * @returns {Array<{key:string,value:number,min:number,max:number}>}
 */
export function statProblems(bounds, stats = {}) {
  return STAT_TYPES.flatMap((key) => {
    const value = stats?.[key] ?? STAT_DEFAULT;
    const [min, max] = bounds[key];
    return Number.isInteger(value) && min <= value && value <= max ? [] : [{ key, value, min, max }];
  });
}

/** One line for a stat outside its bounds: `effect 30 is outside 5 to 20`. */
export const statProblemText = ({ key, value, min, max }) => `${key} ${value} is outside ${min} to ${max}`;

/**
 * Stats drawn inside some bounds, each from its inclusive `[min, max]`.
 *
 * @param {Readonly<Record<string,[number,number]>>} bounds
 * @param {() => number} [random=Math.random] - Source in [0, 1).
 * @returns {Record<string,number>}
 */
export function randomStatsWithin(bounds, random = Math.random) {
  return Object.fromEntries(
    STAT_TYPES.map((key) => {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return [0, 1).');
      const [min, max] = bounds[key];
      return [key, Math.floor(value * (max - min + 1)) + min];
    }),
  );
}

export function generateRandomStats(min = STAT_MODIFIER_MIN, max = STAT_MODIFIER_MAX, random = Math.random) {
  validateStatModifier(min);
  validateStatModifier(max);
  if (min > max) throw new RangeError('Random minimum must not exceed maximum.');
  return randomStatsWithin(Object.fromEntries(STAT_TYPES.map((key) => [key, [min, max]])), random);
}

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
  { key: 'LOOT', r: 120, g: 220, b: 160, a: 255 },
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
  { entityType: 'loot', colorKey: 'LOOT' },
]);

/**
 * Camera and render-tuning defaults. Pure presentation — the cyberia-server
 * never reads any of these. The cyberia-client fetches the whole bundle
 * from /api/v1/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE at startup
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
 *   overheadOcclusionHiddenOpacity — opacity of an `overhead-occlusion`
 *                     foreground while the local player stands under it. 0 hides it.
 *   overheadOcclusionFadeMs — duration of the fade between opacity 1 and the
 *                     hidden opacity, in both directions.
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
  overheadOcclusionHiddenOpacity: 0,
  overheadOcclusionFadeMs: 300,
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
    overheadOcclusionHiddenOpacity: ov.overheadOcclusionHiddenOpacity ?? RENDER_DEFAULTS.overheadOcclusionHiddenOpacity,
    overheadOcclusionFadeMs: ov.overheadOcclusionFadeMs ?? RENDER_DEFAULTS.overheadOcclusionFadeMs,
  };
}

/**
 * Canonical hints document — what the client gets when no DB overrides
 * exist (or the engine endpoint is unreachable).
 */
export const CYBERIA_CLIENT_HINTS_DEFAULTS = buildClientHints({});

const IDENTITY_PREVIEW_VERSION = 1;

/**
 * The identity preview: one static PNG of the visual layers an entity wears, in its idle frame.
 * The route names a preview by the ordered Object Layer CIDs of those layers, under the version of
 * the drawing rules. `urlBytes` bounds a reference.
 */
export const IDENTITY_PREVIEW = Object.freeze({
  version: IDENTITY_PREVIEW_VERSION,
  route: `cyberia-player/appearance/v${IDENTITY_PREVIEW_VERSION}`,
  maxLayers: 20,
  urlBytes: 2048,
});
