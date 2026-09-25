// Object Layer protocol: canonical shape and render directions. No runtime imports.

/** Schema version of the canonical Object Layer payload. */
export const OBJECT_LAYER_SCHEMA_VERSION = 1;

/**
 * Animation directions. Each entry binds:
 *   code      — numeric asset folder name on disk (`./assets/<type>/<id>/<code>/<frame>.png`)
 *   label     — editor label
 *   keyframes — render keyframe names this folder code feeds
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

/** Ordered direction folder codes. */
export const OBJECT_LAYER_DIRECTION_CODES = Object.freeze(OBJECT_LAYER_DIRECTIONS.map((d) => d.code));

/** Map: direction folder code → editor label. */
export const OBJECT_LAYER_DIRECTION_LABELS = Object.freeze(
  Object.fromEntries(OBJECT_LAYER_DIRECTIONS.map((d) => [d.code, d.label])),
);

/** Render keyframe names a folder code feeds (empty if unknown). */
export const getKeyframeDirectionsByCode = (code) => {
  const entry = OBJECT_LAYER_DIRECTIONS.find((d) => d.code === code);
  return entry ? [...entry.keyframes] : [];
};

/** Inverse map: render keyframe name → folder code. */
export const OBJECT_LAYER_DIRECTION_NAME_TO_CODE = Object.freeze(
  OBJECT_LAYER_DIRECTIONS.reduce((acc, d) => {
    for (const name of d.keyframes) acc[name] = d.code;
    return acc;
  }, {}),
);

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** The rule {@link isStatRecord} checks, as a writer refused by it reads it. */
export const STAT_RECORD_RULE = 'data.stats must be a plain object of integers';

/**
 * Structural check of the mechanical block: a plain object of safe integers.
 * The stat vocabulary and bounds belong to a content profile, not to the protocol.
 * @param {*} stats
 * @returns {boolean}
 */
export function isStatRecord(stats) {
  if (!isPlainObject(stats)) return false;
  return Object.values(stats).every((value) => Number.isSafeInteger(value));
}

/**
 * A content profile reference: the semantic contract that gives `data.stats` and `data.item.type`
 * their vocabulary. The protocol names it; a runtime defines it.
 * @typedef {{id:string,version:number}} ProfileRef
 */

/**
 * Structural check of a profile reference.
 * @param {*} profile
 * @returns {boolean}
 */
export function isProfileRef(profile) {
  return (
    isPlainObject(profile) &&
    typeof profile.id === 'string' &&
    profile.id.trim().length > 0 &&
    Number.isSafeInteger(profile.version) &&
    profile.version >= 1
  );
}

/**
 * The reference a canonical payload carries for a profile.
 * @param {{id:string,version:number}} profile
 * @returns {ProfileRef}
 */
export const profileRef = ({ id, version }) => ({ id, version });

/**
 * The canonical Object Layer payload: the exact object whose bytes give the identity.
 * Holds content only. Ledger state, storage refs and the identity itself stay out.
 *
 * @param {Object} input - A document, a DTO or a bare `{ profile, data }` payload.
 * @returns {{schemaVersion:number,profile:ProfileRef,data:{item:Object,stats:Object,render:Object}}}
 * @throws {Error} When `data.stats` is present and is not a plain object of integers.
 */
export function canonicalObjectLayer(input = {}) {
  const profile = input?.profile ?? {};
  const data = input?.data ?? {};
  const item = data.item ?? {};
  const render = data.render ?? {};
  const stats = data.stats ?? {};
  if (!isStatRecord(stats)) throw new Error(STAT_RECORD_RULE);
  return {
    schemaVersion: OBJECT_LAYER_SCHEMA_VERSION,
    profile: { id: String(profile.id ?? ''), version: Number(profile.version ?? 0) },
    data: {
      item: {
        id: String(item.id ?? ''),
        type: String(item.type ?? ''),
        description: String(item.description ?? ''),
        activable: Boolean(item.activable),
      },
      stats: { ...stats },
      render: {
        cid: String(render.cid ?? ''),
        metadataCid: String(render.metadataCid ?? ''),
      },
    },
  };
}
