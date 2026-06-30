/**
 * Shared Cyberia defaults — isomorphic, dependency-free, importable from
 * **both** Node and the browser.
 *
 * Pure plain-data ESM module: no Node built-ins, no DOM APIs, no
 * environment guards. Every export is a frozen literal, a constant
 * lookup table, or a pure function over those tables. Side-effect free
 * on import.
 *
 * Two responsibilities, no others:
 *
 *   1. **Presentation values** — palette, entity colour keys, status-icon
 *      visuals (icon stem + border colour + bounce), camera tunings,
 *      render flags. Mirrored 1-to-1 by the C/WASM client's compile-time
 *      defaults in `cyberia-client/src/domain/presentation_defaults.h`.
 *      Optionally overridable per deployment through the REST endpoint
 *      `/api/cyberia-client-hints/:code`.
 *
 *   2. **Shared content vocabulary** — `ITEM_TYPES`, `ENTITY_TYPES`,
 *      `DefaultCyberiaItems` registry + lookups, type-to-item mapping,
 *      quest step objective enum. The data shape both the
 *      browser-side editor UI and the engine REST controllers need to
 *      understand; it is **not** simulation state.
 *
 * STRICT BOUNDARIES
 * -----------------
 *   - The cyberia-server (Go) MUST NOT load this file. None of these
 *     values influence the authoritative simulation. The server owns the
 *     numeric Entity Status Indicator IDs only (see `cyberia-server-defaults`).
 *
 *   - The C/WASM cyberia-client embeds *presentation* defaults at compile
 *     time and fetches optional overrides through REST. It does NOT carry
 *     the JS vocabulary constants — entity-type and item-id strings
 *     arrive on the wire and are matched directly.
 *
 *   - The browser editor bundles this file via esbuild. It MUST NOT
 *     import `cyberia-server-defaults.js` — that would pull simulation
 *     rules, economy, and seed content into the browser bundle. All
 *     shared vocabulary the editor needs lives here.
 *
 * Naming: this file is intentionally placed under `src/client/` so its
 * URL is `/components/cyberia/SharedDefaultsCyberia.js` when the engine
 * static server resolves it. Node-side importers reach in with a
 * relative path; both halves see the same module instance.
 *
 * @module src/client/components/cyberia/SharedDefaultsCyberia.js
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared content vocabulary
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Canonical entity/item stat types, in display order. Shared by the object-layer
 * editor (stat inputs) and the asset pipeline (random stat generation).
 */
export const STAT_TYPES = Object.freeze(['effect', 'resistance', 'agility', 'range', 'intelligence', 'utility']);

/**
 * Build a random stat block keyed by STAT_TYPES, each value 0–10 inclusive.
 * Non-deterministic (uses Math.random) — the asset pipeline uses it to seed
 * default stats for newly authored object layers.
 */
export const generateRandomStats = () =>
  Object.fromEntries(STAT_TYPES.map((statType) => [statType, Math.floor(Math.random() * 11)]));

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
  fontFamily: 'PressStart2P-Regular.ttf',
  fontFactorSize: 0.8,
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
  { id: 5, iconId: 'skull', bounce: false, borderColor: { r: 160, g: 130, b: 200, a: 200 } },
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
