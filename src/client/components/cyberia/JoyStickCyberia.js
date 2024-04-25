import { newInstance } from '../core/CommonJs.js';
import { JoyStick } from '../core/JoyStick.js';
import { loggerFactory } from '../core/Logger.js';
import { BiomeEngine } from './Biome.js';
import { CyberiaParams } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { Pixi } from './Pixi.js';

const logger = loggerFactory(import.meta);

const JoyStickCyberia = {
  Render: async function () {
    const id = 'cyberia-joystick';
    JoyStick.Render({
      id,
      callBackTime: CyberiaParams.EVENT_CALLBACK_TIME,
      callback: () => {
        const { direction } = JoyStick.Tokens[id].joyDataSet;
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
        if (BiomeEngine.isBiomeCollision({ type: 'user', id: 'main', x, y })) return;
        Elements.Data.user.main.x = x;
        Elements.Data.user.main.y = y;
        Pixi.updatePosition({ type: 'user', id: 'main' });
      },
    });
  },
};

export { JoyStickCyberia };
