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
 *      quest step / action type enums. The data shape both the
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
});

/** Quest step objective types accepted by the quest-progress engine. */
export const QUEST_STEPS_TYPES = Object.freeze(['collect', 'talk', 'kill']);

/** Action categories accepted by the cyberia-action engine. */
export const CYBERIA_ACTION_TYPES = Object.freeze(['craft', 'shop', 'storage', 'talk', 'quest-talk']);

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
  { id: 8, iconId: 'chat', bounce: true, borderColor: { r: 220, g: 190, b: 60, a: 240 } },
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
  };
}

/**
 * Canonical hints document — what the client gets when no DB overrides
 * exist (or the engine endpoint is unreachable).
 */
export const CYBERIA_CLIENT_HINTS_DEFAULTS = buildClientHints({});
