/**
 * This module exports utility functions (`windowGetH`, `windowGetW`) for reliably
 * determining the browser viewport dimensions, refactored into a class structure
 * for encapsulation and better organization.
 *
 * @module src/client/components/core/windowGetDimensions.js
 * @namespace PwaWindowDimensions
 */

// --- Internal Helper Functions ---

/**
 * Helper: coerce a candidate value to a finite integer (or null if not usable).
 * @private
 * @param {*} v - The value to coerce (e.g., height/width from a window object).
 * @returns {number|null} The rounded positive integer, or null if invalid.
 * @memberof PwaWindowDimensions
 */
const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * Helper: Merge candidates in priority order and return first valid value.
 * @private
 * @param {...(number|null)[]} candidates - A list of number or null values.
 * @returns {number|null} The first finite, positive integer found, or null.
 * @memberof PwaWindowDimensions
 */
const pickFirst = (...candidates) => {
  for (const c of candidates) {
    if (Number.isFinite(c) && c > 0) return Math.round(c);
  }
  return null;
};

// --- Core Dimension Class ---

/**
 * @namespace PwaWindowDimensions
 * @class
 * @classdesc Utility class containing static methods for reliably determining the
 * browser viewport dimensions, prioritizing visual viewport, then layout viewport,
 * and finally screen dimensions as fallbacks.
 *
 * Usage:
 * import PwaWindowDimensions from './windowGetDimensions.js';
 * const h = PwaWindowDimensions.getH();
 * @memberof PwaWindowDimensions
 */
export class PwaWindowDimensions {
  // --- Private Static Getters (Encapsulating browser APIs) ---

  /**
   * @method
   * @static
   * Try visualViewport values (most accurate for "what's actually visible").
   * @returns {{height: number|null, width: number|null}}
   * @memberof PwaWindowDimensions
   */
  static #getFromVisualViewport() {
    if (typeof window !== 'undefined' && window.visualViewport) {
      const { height, width } = window.visualViewport;
      return { height: toInt(height), width: toInt(width) };
    }
    return { height: null, width: null };
  }

  /**
   * @method
   * @static
   * Try layout viewport (doctype-root) measurements.
   * document.documentElement.clientHeight/clientWidth are stable and widely used.
   * @returns {{height: number|null, width: number|null}}
   * @memberof PwaWindowDimensions
   */
  static #getFromDocumentElement() {
    if (typeof document !== 'undefined' && document.documentElement) {
      const { clientHeight, clientWidth } = document.documentElement;
      return { height: toInt(clientHeight), width: toInt(clientWidth) };
    }
    return { height: null, width: null };
  }

  /**
   * @method
   * @static
   * Try window.* measurements (innerHeight/innerWidth are widely supported).
   * @returns {{height: number|null, width: number|null}}
   * @memberof PwaWindowDimensions
   */
  static #getFromWindowInner() {
    if (typeof window !== 'undefined') {
      return { height: toInt(window.innerHeight), width: toInt(window.innerWidth) };
    }
    return { height: null, width: null };
  }

  /**
   * @method
   * @static
   * Try body measurements (less reliable, used as a fallback).
   * @returns {{height: number|null, width: number|null}}
   * @memberof PwaWindowDimensions
   */
  static #getFromBody() {
    if (typeof document !== 'undefined' && document.body) {
      return { height: toInt(document.body.clientHeight), width: toInt(document.body.clientWidth) };
    }
    return { height: null, width: null };
  }

  /**
   * @method
   * @static
   * Try screen measurements (physical screen/last-resort fallback).
   * @returns {{height: number|null, width: number|null}}
   * @memberof PwaWindowDimensions
   */
  static #getFromScreen() {
    if (typeof window !== 'undefined' && window.screen) {
      const { availHeight, availWidth, height, width } = window.screen;
      return {
        height: toInt(availHeight) || toInt(height) || null,
        width: toInt(availWidth) || toInt(width) || null,
      };
    }
    return { height: null, width: null };
  }

  /**
   * @method
   * @static
   * Try outer dimensions (less reliable, sometimes available fallback).
   * @returns {{height: number|null, width: number|null}}
   * @memberof PwaWindowDimensions
   */
  static #getFromOuter() {
    if (typeof window !== 'undefined') {
      return { height: toInt(window.outerHeight), width: toInt(window.outerWidth) };
    }
    return { height: null, width: null };
  }

  // --- Public Static Methods ---

  /**
   * Get the best-available viewport height in pixels.
   *
   * Priority (from most reliable for "visible" to least):
   * 1. window.visualViewport.height (if `preferVisualViewport` is true)
   * 2. document.documentElement.clientHeight (Layout viewport)
   * 3. window.innerHeight (Window size)
   * 4. document.body.clientHeight (Body size)
   * 5. window.visualViewport.height (if `preferVisualViewport` is false)
   * 6. window.screen.availHeight / window.screen.height (Physical screen)
   * 7. window.outerHeight (Last resort)
   *
   * @memberof PwaWindowDimensions
   * @static
   * @param {Object} [options]
   * @param {boolean} [options.preferVisualViewport=true] - When true, visualViewport is checked first (best for visible screen size, e.g., above mobile keyboard).
   * @returns {number|null} Height in px (rounded integer) or null if none found.
   * @memberof PwaWindowDimensions
   */
  static getH(options = {}) {
    const { preferVisualViewport = true } = options;

    const vv = PwaWindowDimensions.#getFromVisualViewport();
    const de = PwaWindowDimensions.#getFromDocumentElement();
    const wi = PwaWindowDimensions.#getFromWindowInner();
    const bd = PwaWindowDimensions.#getFromBody();
    const sc = PwaWindowDimensions.#getFromScreen();
    const ot = PwaWindowDimensions.#getFromOuter();

    // Determine the prioritized list of height candidates
    let candidates = [de.height, wi.height, bd.height];
    if (preferVisualViewport) {
      candidates = [vv.height, ...candidates]; // vv first
    } else {
      candidates.push(vv.height); // vv later
    }

    // Add final fallbacks
    candidates.push(sc.height, ot.height);

    return pickFirst(...candidates) || null;
  }

  /**
   * Get the best-available viewport width in pixels.
   *
   * Priority (from most reliable for "visible" to least):
   * 1. window.visualViewport.width (if `preferVisualViewport` is true)
   * 2. document.documentElement.clientWidth (Layout viewport)
   * 3. window.innerWidth (Window size)
   * 4. document.body.clientWidth (Body size)
   * 5. window.visualViewport.width (if `preferVisualViewport` is false)
   * 6. window.screen.availWidth / window.screen.width (Physical screen)
   * 7. window.outerWidth (Last resort)
   *
   * @memberof PwaWindowDimensions
   * @static
   * @param {Object} [options]
   * @param {boolean} [options.preferVisualViewport=true] - When true, visualViewport is checked first.
   * @returns {number|null} Width in px (rounded integer) or null if none found.
   * @memberof PwaWindowDimensions
   */
  static getW(options = {}) {
    const { preferVisualViewport = true } = options;

    const vv = PwaWindowDimensions.#getFromVisualViewport();
    const de = PwaWindowDimensions.#getFromDocumentElement();
    const wi = PwaWindowDimensions.#getFromWindowInner();
    const bd = PwaWindowDimensions.#getFromBody();
    const sc = PwaWindowDimensions.#getFromScreen();
    const ot = PwaWindowDimensions.#getFromOuter();

    // Determine the prioritized list of width candidates
    let candidates = [de.width, wi.width, bd.width];
    if (preferVisualViewport) {
      candidates = [vv.width, ...candidates]; // vv first
    } else {
      candidates.push(vv.width); // vv later
    }

    // Add final fallbacks
    candidates.push(sc.width, ot.width);

    return pickFirst(...candidates) || null;
  }
}

// --- Backward Compatibility Exports (Legacy API) ---

/**
 * Get the best-available viewport height in pixels.
 * This function exists for backward compatibility; it wraps PwaWindowDimensions.getH().
 *
 * @function windowGetH
 * @memberof PwaWindowDimensions
 * @param {Object} [options]
 * @param {boolean} [options.preferVisualViewport=true] - When true, visualViewport is checked first.
 * @returns {number|null} Height in px (rounded integer) or null if none found.
 * @memberof PwaWindowDimensions
 */
export const windowGetH = (options = {}) => PwaWindowDimensions.getH(options);

/**
 * Get the best-available viewport width in pixels.
 * This function exists for backward compatibility; it wraps PwaWindowDimensions.getW().
 *
 * @function windowGetW
 * @memberof PwaWindowDimensions
 * @param {Object} [options]
 * @param {boolean} [options.preferVisualViewport=true] - When true, prefer visualViewport if present
 * @returns {number|null} Width in px (rounded integer) or null if none found.
 * @memberof PwaWindowDimensions
 */
export const windowGetW = (options = {}) => PwaWindowDimensions.getW(options);

// --- Default Export ---

/**
 * @typedef {PwaWindowDimensions} PwaWindowDimensions
 * @memberof PwaWindowDimensions
 */
export default PwaWindowDimensions;
