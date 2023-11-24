// https://dondido.github.io/virtual-joystick/
// https://github.com/dondido/virtual-joystick

import { loggerFactory } from '../core/Logger.js';
import { getProxyPath, s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';
import { Event } from './Event.js';

await import(`${getProxyPath()}dist/virtual-joystick/virtual-joystick.js`);

const logger = loggerFactory(import.meta);

const JoyStick = {
  Render: async function () {
    setTimeout(() => {
      const $joystick = s('virtual-joystick');
      setInterval(() => {
        if ($joystick.dataset.direction !== '') {
          logger.info($joystick.dataset.direction);
          Array.from($joystick.dataset.direction).map((dir) => {
            switch (dir) {
              case 's':
                Elements.Data.user.main.y += Elements.Data.user.main.vel;
                break;
              case 'n':
                Elements.Data.user.main.y -= Elements.Data.user.main.vel;
                break;
              case 'e':
                Elements.Data.user.main.x += Elements.Data.user.main.vel;
                break;
              case 'w':
                Elements.Data.user.main.x -= Elements.Data.user.main.vel;
                break;
              default:
                break;
            }
          });
        }
      }, Event.Data.globalTimeInterval);
    });
    const width = 150;
    return html`
      <style>
        ${css`
          .joystick-container {
            width: ${width}px;
            height: ${width}px;
            bottom: 50px;
            border-radius: 50%;
            left: 50px;
            background: rgba(0, 0, 0, 0.75);
          }
          .joy-img-background {
            top: 0px;
            left: 0px;
            width: 100%;
            height: 100%;
            opacity: 0.5;
          }
          virtual-joystick {
            --radius: ${width / 2}px;
          }
        `}
      </style>
      <div class="fix joystick-container">
        <img class="abs joy-img-background" src="${location.pathname}assets/joy/joy_alpha.png" />
        <virtual-joystick data-mode="dynamic"> </virtual-joystick>
      </div>
    `;
  },
};

export { JoyStick };
