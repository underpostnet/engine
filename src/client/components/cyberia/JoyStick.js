// https://dondido.github.io/virtual-joystick/
// https://github.com/dondido/virtual-joystick

import { newInstance } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { getProxyPath, s } from '../core/VanillaJs.js';
import { BiomeEngine } from './Biome.js';
import { Elements } from './Elements.js';
import { Pixi } from './Pixi.js';

const logger = loggerFactory(import.meta);

const JoyStick = {
  Render: async function () {
    await import(`${getProxyPath()}dist/virtual-joystick/virtual-joystick.js`);
    setTimeout(() => {
      const $joystick = s('virtual-joystick');
      setInterval(() => {
        if ($joystick.dataset.direction !== '') {
          logger.info($joystick.dataset.direction);
          let x = newInstance(Elements.Data.user.main.x);
          let y = newInstance(Elements.Data.user.main.y);
          Array.from($joystick.dataset.direction).map((dir) => {
            switch (dir) {
              case 's':
                y = Elements.Data.user.main.y + Elements.Data.user.main.vel;
                break;
              case 'n':
                y = Elements.Data.user.main.y - Elements.Data.user.main.vel;
                break;
              case 'e':
                x = Elements.Data.user.main.x + Elements.Data.user.main.vel;
                break;
              case 'w':
                x = Elements.Data.user.main.x - Elements.Data.user.main.vel;
                break;
              default:
                break;
            }
          });
          if (BiomeEngine.isCollision({ type: 'user', id: 'main', x, y })) return;
          Elements.Data.user.main.x = x;
          Elements.Data.user.main.y = y;
          Pixi.updatePosition({ type: 'user', id: 'main' });
        }
      }, window.eventCallbackTime);
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
          /* 
          ::selection {
            color: rgba(255, 255, 255, 0) !important;
            background: none !important;
          } 
          */
        `}
      </style>
      <div class="fix joystick-container">
        <img class="abs joy-img-background" src="${getProxyPath()}assets/joy/joy_alpha.png" />
        <virtual-joystick data-mode="dynamic"> </virtual-joystick>
      </div>
    `;
  },
};

export { JoyStick };
