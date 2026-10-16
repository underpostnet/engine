/**
 * An in-memory stand-in for `src/db/valkey/Valkey.js`, for suites whose real boundary is another
 * store. It keeps values as JSON with their expiry, and `setDown(true)` makes every call fail as
 * a lost connection does. Mock the module with `memoryValkeyModule()`.
 *
 * @module test/support/valkey-memory.js
 */

const entries = new Map();
let down = false;

const guard = () => {
  if (down) throw new Error('Valkey instance not connected');
};

const live = (key) => {
  const entry = entries.get(key);
  if (entry?.expiresAt && entry.expiresAt <= Date.now()) entries.delete(key);
  return entries.get(key) ?? null;
};

const ValkeyAPI = {
  isConnected: () => !down,
  get: async (_, key) => {
    guard();
    const entry = live(key);
    return entry ? JSON.parse(entry.value) : null;
  },
  set: async (_, key, payload, ttlMs) => {
    guard();
    entries.set(key, { value: JSON.stringify(payload), expiresAt: ttlMs ? Date.now() + ttlMs : 0 });
    return 'OK';
  },
  del: async (_, key) => {
    guard();
    return entries.delete(key) ? 1 : 0;
  },
};

/** The stored keys and their expiry, and the switch of the connection. */
const memoryValkey = {
  keys: () => [...entries.keys()].filter((key) => live(key)),
  ttlMs: (key) => (live(key)?.expiresAt ?? 0) - Date.now(),
  setDown: (value) => {
    down = value;
  },
  clear: () => entries.clear(),
};

/** The exports of the Valkey module, backed by memory. */
const memoryValkeyModule = () => ({
  ValkeyAPI,
  isValkeyEnable: () => !down,
  createValkeyConnection: async () => undefined,
  closeValkeyConnection: () => undefined,
});

export { memoryValkey, memoryValkeyModule };
