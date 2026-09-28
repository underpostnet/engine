/**
 * Browser-local drafts of the editors: unsaved work kept in IndexedDB, so a crash or a closed tab
 * loses nothing on this device. The server stays the source of truth; a draft only offers
 * recovery. Without IndexedDB every call resolves to nothing.
 *
 * @module src/client/components/core/EditorDraftStore.js
 */

const DATABASE = 'editor-drafts';
const STORE = 'drafts';

let opening = null;

const open = () =>
  (opening ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  }));

const run = async (mode, operate) => {
  const database = await open();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = operate(database.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
};

const EditorDraftStore = {
  /**
   * Keeps the draft of an editor target.
   * @param {string} key - Editor and target, such as `cyberia-map:frontier-outpost`.
   * @param {*} value - Structured-cloneable editor state.
   */
  put: (key, value) => run('readwrite', (store) => store.put({ key, value, savedAt: Date.now() })),

  /** The draft of a target: `{ key, value, savedAt }`, or null. */
  get: (key) => run('readonly', (store) => store.get(key)),

  /** Drops the draft of a target, once its work is saved. */
  remove: (key) => run('readwrite', (store) => store.delete(key)),

  /**
   * A writer that keeps the latest state of a target once no new state arrives for `delayMs`.
   * @param {string} key
   * @param {number} [delayMs=1500]
   * @returns {{save: (value: *) => void, cancel: () => void}}
   */
  debounced(key, delayMs = 1500) {
    let timer = null;
    return {
      save(value) {
        clearTimeout(timer);
        timer = setTimeout(() => EditorDraftStore.put(key, value), delayMs);
      },
      cancel() {
        clearTimeout(timer);
      },
    };
  },
};

export { EditorDraftStore };
