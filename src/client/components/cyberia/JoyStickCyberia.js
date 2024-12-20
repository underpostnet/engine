import { newInstance } from '../core/CommonJs.js';
import { JoyStick } from '../core/JoyStick.js';
import { loggerFactory } from '../core/Logger.js';
import { BiomeCyberiaManagement } from './BiomeCyberia.js';
import { CyberiaParams } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';

const logger = loggerFactory(import.meta);

const JoyStickCyberia = {
  Render: async function () {
    const id = 'cyberia-joystick';
    JoyStick.Render({
      id,
      callBackTime: CyberiaParams.EVENT_CALLBACK_TIME,
      callback: () => {
        const { direction } = JoyStick.Tokens[id].joyDataSet;
        let x = newInstance(ElementsCyberia.Data.user.main.x);
        let y = newInstance(ElementsCyberia.Data.user.main.y);
        Array.from(direction).map((dir) => {
          switch (dir) {
            case 's':
              y = ElementsCyberia.Data.user.main.y + ElementsCyberia.Data.user.main.vel;
              break;
            case 'n':
              y = ElementsCyberia.Data.user.main.y - ElementsCyberia.Data.user.main.vel;
              break;
            case 'e':
              x = ElementsCyberia.Data.user.main.x + ElementsCyberia.Data.user.main.vel;
              break;
            case 'w':
              x = ElementsCyberia.Data.user.main.x - ElementsCyberia.Data.user.main.vel;
              break;
            default:
              break;
          }
        });
        if (
          PixiCyberia.transportBlock ||
          BiomeCyberiaManagement.isBiomeCyberiaCollision({ type: 'user', id: 'main', x, y })
        )
          return;
        ElementsCyberia.Data.user.main.x = x;
        ElementsCyberia.Data.user.main.y = y;
        PixiCyberia.updatePosition({ type: 'user', id: 'main' });
      },
    });
  },
};

export { JoyStickCyberia };
