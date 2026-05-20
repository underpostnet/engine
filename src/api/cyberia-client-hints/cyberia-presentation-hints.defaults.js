/**
 * Canonical client-presentation hints — the **client's** render-policy
 * defaults, stored on the engine **only** because instance authors may
 * optionally override them for cosmetic reasons (a custom palette per
 * world, a different camera zoom for a tutorial level, etc.).
 *
 * STRICT BOUNDARY:
 *   - The cyberia-server (Go) MUST NOT load this file.  It is not part of
 *     the gRPC InstanceConfig payload that the simulation consumes.
 *   - The cyberia-client (C/WASM) ships built-in defaults that MUST match
 *     this file 1-to-1 (see cyberia-client/src/domain/presentation_defaults.h).
 *     The client can run end-to-end without ever calling the engine for
 *     these values; the engine endpoint is purely opt-in for per-instance
 *     overrides.
 *
 * Anything that influences gameplay (entity stats, AOI radius, economy,
 * skill rules, tick rate, max active layers, etc.) does NOT belong here
 * — it lives in `cyberia-instance-conf.defaults.js`.
 *
 * @module src/api/cyberia-client-hints/cyberia-presentation-hints.defaults.js
 */

/**
 * Named colour palette. Solid-color fallbacks for entity types, plus
 * UI-only entries (WEAPON, SELF_BORDER) the renderer uses for HUD.
 *
 * Keys are stable identifiers shared with the C client's local palette;
 * adding a new key here requires adding it to
 * cyberia-client/src/domain/presentation_defaults.h to keep parity.
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
 * Per-entity-type colour key. Tells the client which palette entry to
 * use as the solid-colour fallback for an entity that has no active
 * ObjectLayer items.  The server never reads this — it is presentation.
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
 * Camera and render-tuning defaults. Pure client presentation.
 */
export const RENDER_DEFAULTS = Object.freeze({
  cameraSmoothing: 0.1,
  cameraZoom: 1.0,
  defaultWidthScreenFactor: 1,
  defaultHeightScreenFactor: 1,
  // Visual-only smoothing window for remote entities. The server ignores
  // this; it ticks at TickRate, snapshots at SnapshotRate, and lets the
  // client decide how to interpolate the result.
  interpolationMs: 100,
  // Local-dev convenience; the server has no authority over this.
  devUi: false,
});

/**
 * Status-icon presentation half. The numeric `id` is shared with the
 * simulation (it travels on the wire as a u8 inside the AOI binary
 * entity-status indicator field). Everything else here — icon filename,
 * border colour, bounce animation, description — is purely cosmetic and
 * client-resolvable.
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
 *   palette colours, render defaults, status-icon iconIds, etc. Anything
 *   missing falls back to the canonical defaults exported here.
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
 * exist (or when the engine endpoint is not reachable).
 */
export const CYBERIA_CLIENT_HINTS_DEFAULTS = buildClientHints({});
