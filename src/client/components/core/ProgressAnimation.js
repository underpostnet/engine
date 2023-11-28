import { getId, newInstance } from './CommonJs.js';
import { append, s } from './VanillaJs.js';

const ProgressAnimation = {
  bar: {
    tokens: {},
    play: function (id, time) {
      if (!id) id = getId(this.tokens, 'progress-bar');
      append(
        'body',
        html` <div class="fix progress-bar diagonal-bar-background-animation ${id}" style="left: -100%"></div> `,
      );

      // Diagonal Lines Animation
      // https://alvarotrigo.com/blog/animated-backgrounds-css/

      const frames = time
        ? [
            { time: time * 0.7, value: '-30%' },
            { time: time * 0.85, value: '-10%' },
            { time: time * 1, value: '0%' },
          ]
        : [
            { time: 700, value: '-30%' },
            { time: 850, value: '-10%' },
            { time: 1000, value: '0%' },
          ];

      for (const frame of frames) {
        setTimeout(() => {
          s(`.${id}`).style.left = frame.value;
        }, frame.time);
      }

      // setTimeout(() => (s(`.${id}`).style.left = '0%'), time + 200);
      // setTimeout(() => (s(`.${id}`).style.left = '70%'), time + 400);
      // setTimeout(() => (s(`.${id}`).style.left = '100%'), time + 600);
      if (time) this.stop(id, time);

      return id;
    },
    stop: function (id, time) {
      setTimeout(() => {
        s(`.${id}`).style.opacity = 1;
        setTimeout(() => {
          s(`.${id}`).style.opacity = 0;
          setTimeout(() => {
            s(`.${id}`).remove();
          }, 400);
        });
      }, time);
    },
  },
};
export { ProgressAnimation };
