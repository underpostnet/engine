/**
 * Fallback-world default items — process-local override store.
 *
 * The procedural fallback world is never persisted, so its default item set
 * has no collection to live in. This module holds the set the FallbackWorldEngine
 * view composed, in memory, for the lifetime of the engine process:
 *
 *   - written by  POST /api/cyberia-instance/fallback-world/hot-reload
 *   - read by     fetchFullInstance()'s fallback branch (instance-data.js) and
 *                 GET /api/cyberia-instance/fallback-world[/default-items]
 *
 * Deliberately NOT persisted: an engine restart drops back to the code defaults,
 * so a stale editor session can never become the permanent shape of the world.
 * This keeps the fallback path's "code defaults are authoritative" invariant —
 * the only thing an operator can layer on top is this explicit, volatile list.
 *
 * @module src/api/cyberia-instance/cyberia-fallback-default-items.js
 */

/** @typedef {{ id: string, defaultPlayerInventory: boolean }} FallbackDefaultItem */

/** @type {FallbackDefaultItem[]} */
let defaultItems = [];

/**
 * Coerce a caller-supplied list into the canonical `{ id, defaultPlayerInventory }`
 * shape. Accepts the legacy `string[]` form and drops blank/duplicate ids so the
 * world generator never sees a malformed entry.
 *
 * @param {Array<string|FallbackDefaultItem>} entries
 * @returns {FallbackDefaultItem[]}
 */
function normalizeFallbackDefaultItems(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    const raw = typeof entry === 'string' ? { id: entry } : entry;
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ id, defaultPlayerInventory: !!raw.defaultPlayerInventory });
  }
  return normalized;
}

/**
 * Current override set. Returns a copy so callers cannot mutate the store.
 * @returns {FallbackDefaultItem[]}
 */
const getFallbackDefaultItems = () => defaultItems.map((entry) => ({ ...entry }));

/**
 * Replace the override set. An empty list clears it, restoring pure code defaults.
 * @param {Array<string|FallbackDefaultItem>} entries
 * @returns {FallbackDefaultItem[]} The stored set.
 */
function setFallbackDefaultItems(entries) {
  defaultItems = normalizeFallbackDefaultItems(entries);
  return getFallbackDefaultItems();
}

export { getFallbackDefaultItems, setFallbackDefaultItems, normalizeFallbackDefaultItems };
