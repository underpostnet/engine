import { s } from './VanillaJs.js';

class Scroll {
  static setEvent(selector, options = {}) {
    const el = s(selector);
    if (!el) return;

    const threshold = options.threshold ?? 1;

    let ticking = false;
    el.addEventListener(
      'scroll',
      (event) => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const scrollHeight = el.scrollHeight;
          const scrollTop = el.scrollTop;
          const clientHeight = el.clientHeight;

          const remaining = Math.max(0, scrollHeight - clientHeight - scrollTop);

          const payload = {
            scrollHeight,
            scrollTop,
            clientHeight,
            scrollBottom: remaining <= threshold ? 0 : remaining,
            atBottom: remaining <= threshold,
          };

          console.warn('scroll', event, JSON.stringify(payload, null, 2));
          ticking = false;
        });
      },
      { passive: true },
    );
  }
}

export { Scroll };
export default Scroll;
