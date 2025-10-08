/*
 * windowGetDimensions.js
 * ES6 vanilla utilities: windowGetH and windowGetW
 * Returns the most reliable viewport height/width available, with fallbacks
 * from modern to old browsers.
 *
 * Usage:
 *   import { windowGetH, windowGetW } from './windowGetDimensions.js';
 *   const h = windowGetH();
 *   const w = windowGetW();
 *
 * Notes:
 * - visualViewport (when present) reflects the *visible* viewport (changes when
 *   the on-screen keyboard opens, or when mobile address/toolbars show/hide).
 * - documentElement.clientHeight/Width reflect the layout viewport.
 * - window.innerHeight/innerWidth include scrollbars and are widely supported.
 * - screen.* values are last-resort and reflect the physical screen, not the
 *   browser chrome.
 */

// Helper: coerce a candidate to a finite integer (or null if not usable)
const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * Try visualViewport values (most accurate for "what's actually visible").
 * @returns {{height: number|null, width: number|null}}
 */
const getFromVisualViewport = () => {
  if (typeof window !== 'undefined' && window.visualViewport) {
    const { height, width } = window.visualViewport;
    return { height: toInt(height), width: toInt(width) };
  }
  return { height: null, width: null };
};

/**
 * Try layout viewport (doctype-root) measurements.
 * document.documentElement.clientHeight/clientWidth are stable and widely used.
 * @returns {{height: number|null, width: number|null}}
 */
const getFromDocumentElement = () => {
  if (typeof document !== 'undefined' && document.documentElement) {
    const { clientHeight, clientWidth } = document.documentElement;
    return { height: toInt(clientHeight), width: toInt(clientWidth) };
  }
  return { height: null, width: null };
};

/**
 * Try window.* measurements (innerHeight/innerWidth are widely supported).
 * @returns {{height: number|null, width: number|null}}
 */
const getFromWindowInner = () => {
  if (typeof window !== 'undefined') {
    return { height: toInt(window.innerHeight), width: toInt(window.innerWidth) };
  }
  return { height: null, width: null };
};

/**
 * Try body measurements.
 * @returns {{height: number|null, width: number|null}}
 */
const getFromBody = () => {
  if (typeof document !== 'undefined' && document.body) {
    return { height: toInt(document.body.clientHeight), width: toInt(document.body.clientWidth) };
  }
  return { height: null, width: null };
};

/**
 * Try screen measurements (physical screen/fallback).
 * screen.availHeight/availWidth are often available; outer* might also exist.
 * @returns {{height: number|null, width: number|null}}
 */
const getFromScreen = () => {
  if (typeof window !== 'undefined' && window.screen) {
    const { availHeight, availWidth, height, width } = window.screen;
    return {
      height: toInt(availHeight) || toInt(height) || null,
      width: toInt(availWidth) || toInt(width) || null,
    };
  }
  return { height: null, width: null };
};

/**
 * Try outer dimensions (less reliable, but sometimes available).
 * @returns {{height: number|null, width: number|null}}
 */
const getFromOuter = () => {
  if (typeof window !== 'undefined') {
    return { height: toInt(window.outerHeight), width: toInt(window.outerWidth) };
  }
  return { height: null, width: null };
};

/**
 * Merge candidates in priority order and return first valid value.
 * @param {...(number|null)[]} candidates
 * @returns {number|null}
 */
const pickFirst = (...candidates) => {
  for (const c of candidates) {
    if (Number.isFinite(c) && c > 0) return Math.round(c);
  }
  return null;
};

/**
 * Get the best-available viewport height in pixels.
 * Priority (from most reliable for "visible" to least):
 *  1. window.visualViewport.height
 *  2. document.documentElement.clientHeight
 *  3. window.innerHeight
 *  4. document.body.clientHeight
 *  5. window.screen.availHeight / window.screen.height
 *  6. window.outerHeight
 *
 * @param {Object} [options]
 * @param {boolean} [options.preferVisualViewport=true] - when true, prefer visualViewport if present
 * @returns {number|null} height in px (rounded integer) or null if none found
 */
export const windowGetH = (options = {}) => {
  const { preferVisualViewport = true } = options;

  const vv = getFromVisualViewport();
  const de = getFromDocumentElement();
  const wi = getFromWindowInner();
  const bd = getFromBody();
  const sc = getFromScreen();
  const ot = getFromOuter();

  if (preferVisualViewport) {
    return pickFirst(vv.height, de.height, wi.height, bd.height, sc.height, ot.height) || null;
  }

  // if not preferring visualViewport, still include it but later
  return pickFirst(de.height, wi.height, bd.height, vv.height, sc.height, ot.height) || null;
};

/**
 * Get the best-available viewport width in pixels.
 * Priority (from most reliable for "visible" to least):
 *  1. window.visualViewport.width
 *  2. document.documentElement.clientWidth
 *  3. window.innerWidth
 *  4. document.body.clientWidth
 *  5. window.screen.availWidth / window.screen.width
 *  6. window.outerWidth
 *
 * @param {Object} [options]
 * @param {boolean} [options.preferVisualViewport=true] - when true, prefer visualViewport if present
 * @returns {number|null} width in px (rounded integer) or null if none found
 */
export const windowGetW = (options = {}) => {
  const { preferVisualViewport = true } = options;

  const vv = getFromVisualViewport();
  const de = getFromDocumentElement();
  const wi = getFromWindowInner();
  const bd = getFromBody();
  const sc = getFromScreen();
  const ot = getFromOuter();

  if (preferVisualViewport) {
    return pickFirst(vv.width, de.width, wi.width, bd.width, sc.width, ot.width) || null;
  }

  return pickFirst(de.width, wi.width, bd.width, vv.width, sc.width, ot.width) || null;
};

// Convenience default export (optional)
export default {
  windowGetH,
  windowGetW,
};

/* --------------------------------------------------------------------------
 * Example usage:
 *
 * import { windowGetH, windowGetW } from './windowGetDimensions.js';
 *
 * // Get values now
 * const currentH = windowGetH();
 * const currentW = windowGetW();
 *
 * // React to changes (recommended on mobile)
 * if (window.visualViewport) {
 *   window.visualViewport.addEventListener('resize', () => {
 *     console.log('visualViewport resize ->', windowGetH(), windowGetW());
 *   });
 * } else {
 *   window.addEventListener('resize', () => {
 *     console.log('window resize ->', windowGetH(), windowGetW());
 *   });
 * }
 *
 * --------------------------------------------------------------------------*/
