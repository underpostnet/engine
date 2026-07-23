/**
 * Swappable random source for procedural world generation.
 *
 * The world generator and portal connector draw all randomness through
 * `nextRandom()` instead of `Math.random()` directly. By default it IS
 * `Math.random`, so live/editor generation stays random. The fallback world
 * temporarily installs a seeded PRNG so the SAME layout is produced on every
 * call — the instance-map `/static` POIs and the `/preview` image are built by
 * independent HTTP requests (and survive server restarts), so they must agree
 * on where every entity sits.
 *
 * @module src/api/cyberia-instance/cyberia-random-source.js
 */

let source = Math.random;

/** Draw the next float in [0, 1). Routes through the installed source. */
const nextRandom = () => source();

/**
 * mulberry32 — a small, fast, well-distributed seeded PRNG. Deterministic:
 * the same seed always yields the same sequence.
 * @param {number} seed 32-bit unsigned integer
 * @returns {() => number}
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a stable 32-bit seed from a string (FNV-1a). */
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Install a deterministic seeded source. Accepts a number or a string
 * (hashed to a 32-bit seed). Call `resetRandomSource()` to restore Math.random.
 * @param {number|string} seed
 */
function seedRandomSource(seed) {
  const s = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  source = mulberry32(s);
}

/** Restore the default `Math.random` source. */
function resetRandomSource() {
  source = Math.random;
}

/**
 * Run `fn` with a deterministic seeded source, restoring the previous source
 * afterward even if `fn` throws. Returns `fn`'s result.
 * @template T
 * @param {number|string} seed
 * @param {() => T} fn
 * @returns {T}
 */
function withSeededRandom(seed, fn) {
  const prev = source;
  seedRandomSource(seed);
  try {
    return fn();
  } finally {
    source = prev;
  }
}

export { nextRandom, seedRandomSource, resetRandomSource, withSeededRandom, hashSeed };
