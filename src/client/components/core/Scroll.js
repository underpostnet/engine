import { borderChar } from './Css.js';
import { append, s } from './VanillaJs.js';

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
  pullTopRefresh: function () {
    append(
      'body',
      html` <style>
          .pull-refresh-icon-container {
            height: 60px;
            width: 100%;
            z-index: 10;
            transition: 0.3s;
            left: 0px;
          }
          .pull-refresh-icon {
            width: 60px;
            height: 60px;
            margin: auto;
            color: white;
            font-size: 30px;
          }
        </style>
        ${borderChar(2, 'black', [' .pull-refresh-icon-container'])}
        <div style="top: -60px" class="abs pull-refresh-icon-container">
          <div class="in pull-refresh-icon">
            <div class="abs center"><i class="fa-solid fa-arrows-rotate"></i></div>
          </div>
        </div>`,
    );

    let touchstartY = 0;
    let reload = false;
    const minHeightDragReload = 3;
    const maxHeightDragReload = 20;

    document.addEventListener('touchstart', (e) => {
      touchstartY = e.touches[0].clientY;
      // console.warn('touchstart', touchstartY);
    });

    document.addEventListener('touchmove', (e) => {
      const touchY = e.touches[0].clientY;
      const touchDiff = touchY - touchstartY;

      // console.warn('touchDiff', touchDiff, maxHeightDragReload);

      if (touchDiff > maxHeightDragReload)
        s(`.pull-refresh-icon-container`).style.top = 60 + maxHeightDragReload + 'px';
      else s(`.pull-refresh-icon-container`).style.top = 60 + touchDiff + 'px';

      if (touchDiff > minHeightDragReload && window.scrollY === 0) {
        reload = true;
      } else {
        reload = false;
      }
    });
    document.addEventListener('touchend', (e) => {
      // console.warn('touchend');
      s(`.pull-refresh-icon-container`).style.top = '-60px';
      if (reload) {
        location.reload();
        // console.warn('reload');
      }
      reload = false;
    });
  },
};

export { Scroll };
