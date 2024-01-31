// https://dondido.github.io/virtual-joystick/
// https://github.com/dondido/virtual-joystick

import { getDirection, newInstance } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { append, getProxyPath, s } from '../core/VanillaJs.js';
import { BiomeEngine } from './Biome.js';
import { Elements } from './Elements.js';
import { Pixi } from './Pixi.js';
import JoystickController from 'joystick-controller';

const logger = loggerFactory(import.meta);

const JoyStickCyberia = {
  Render: async function () {
    append(
      'body',
      html`
        <style>
          .dynamic-joystick-container {
            /* border: 2px solid red; */
            left: 0px;
            bottom: 0px;
            height: 260px;
            width: 260px;
          }
          .joy-img-background {
            width: 70%;
            height: 70%;
            opacity: 0.5;
          }
        </style>
        <div class="abs dynamic-joystick-container">
          <img class="abs center joy-img-background" src="${getProxyPath()}assets/joy/joy_alpha.png" />
        </div>
      `,
    );

    this.instance = new JoystickController(
      {
        maxRange: 70,
        level: 10,
        radius: 70,
        joystickRadius: 50,
        opacity: 0.5,
        containerClass: 'joystick-container',
        // controllerClass: 'joystick-controller',
        // joystickClass: 'joystick',
        distortion: true,
        dynamicPosition: true,
        dynamicPositionTarget: s(`.dynamic-joystick-container`),
        mouseClickButton: 'ALL',
        hideContextMenu: true,
        // x: '120px',
        // y: '120px',
      },
      (args = { x, y, leveledX, leveledY, distance, angle }) => {
        const { angle } = args;
        if (angle === 0) return (this.joyDataSet = undefined);
        const radians = parseFloat(angle);
        const direction = getDirection({ radians });
        this.joyDataSet = { ...args, radians, direction };
        logger.info(this.joyDataSet);
      },
    );
    setInterval(() => {
      if (!this.joyDataSet || !this.joyDataSet.direction) return;
      const { direction } = this.joyDataSet;
      let x = newInstance(Elements.Data.user.main.x);
      let y = newInstance(Elements.Data.user.main.y);
      Array.from(direction).map((dir) => {
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
    }, window.eventCallbackTime);
  },
};

export { JoyStickCyberia };
