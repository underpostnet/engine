import { s } from './VanillaJs.js';

class Scroll {
  /**
   * Attach scroll listener to an element (resolved with s(selector)).
   * @param {string} selector - selector passed to s(selector)
   * @param {object} options
   * @param {number} [options.threshold=1] - px margin to treat as bottom
   * @param {number} [options.precision=3] - decimal places for percentages
   * @param {function} [callback] - callback function to be called on scroll
   */
  static setEvent(selector, options = { threshold: 1, precision: 3 }, callback = async () => {}) {
    const el = s(selector);
    if (!el) return;

    const threshold = options.threshold ?? 1; // px tolerance for bottom detection
    const precision = options.precision ?? 3;
    let ticking = false;

    const round = (v) => {
      const m = Math.pow(10, precision);
      return Math.round(v * m) / m;
    };

    el.addEventListener(
      'scroll',
      (event) => {
        if (ticking) return;
        ticking = true;

        requestAnimationFrame(() => {
          const scrollHeight = el.scrollHeight;
          const clientHeight = el.clientHeight;
          const scrollTop = el.scrollTop;

          // pixels left to scroll (clamped to >= 0)
          const remaining = Math.max(0, scrollHeight - clientHeight - scrollTop);

          // maximum possible remaining (0 if content fits without scrolling)
          const maxRemaining = Math.max(0, scrollHeight - clientHeight);

          // percentRemaining: 1 = top (all remaining), 0 = bottom (none remaining)
          let percentRemaining = maxRemaining === 0 ? 0 : remaining / maxRemaining;
          percentRemaining = Math.max(0, Math.min(1, percentRemaining));

          // percentScrolled: complementary value (0 = top, 1 = bottom)
          let percentScrolled = 1 - percentRemaining;
          percentScrolled = Math.max(0, Math.min(1, percentScrolled));

          const payload = {
            scrollHeight,
            clientHeight,
            scrollTop,
            remaining, // px left (>= 0)
            scrollBottom: remaining <= threshold ? 0 : remaining,
            atBottom: remaining <= threshold,
            percentRemaining: round(percentRemaining), // 0..1
            percentScrolled: round(percentScrolled), // 0..1
          };

          // replace this with an event dispatch or callback if you prefer
          // console.warn('scroll', event, JSON.stringify(payload, null, 2));
          callback(payload);

          ticking = false;
        });
      },
      { passive: true },
    );
  }
}

export { Scroll };
export default Scroll;
