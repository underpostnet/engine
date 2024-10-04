import { s } from './VanillaJs.js';

const Scroll = {
  data: {},
  init: function (selector) {
    s(selector).addEventListener('scroll', Scroll.scrollHandler);
    Scroll.data[selector] = {
      element: s(selector),
    };
    return Scroll.data[selector];
  },
  getScrollPosition: function (selector) {
    // Scroll.data[selector].element.clientHeight -
    return Scroll.data[selector].element.scrollTop;
  },
  scrollHandler: async function () {
    for (const selector in Scroll.data) await Scroll.data[selector].callback(Scroll.getScrollPosition(selector));
  },
  addEvent: function (selector = '', callback = () => {}) {
    Scroll.data[selector].callback = callback;
  },
  removeEvent: function (selector) {
    delete Scroll.data[selector];
  },
  to: function (elector = '', options = { top: 100, left: 100, behavior: 'smooth' }) {
    Scroll.data[selector].element.scrollTo({
      top: options.top || Scroll.getScrollPosition(selector),
      left: options.left || 0,
      behavior: options.behavior || 'smooth',
    });
  },
};

export { Scroll };
