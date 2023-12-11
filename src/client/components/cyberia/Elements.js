import { Keyboard } from '../core/Keyboard.js';
import { loggerFactory } from '../core/Logger.js';
import { Pixi } from './Pixi.js';

const logger = loggerFactory(import.meta);

const Elements = {
  Data: {
    user: {
      main: {
        x: 1, // Matrix.Data.dim / 2 - 0.5,
        y: 1, // Matrix.Data.dim / 2 - 0.5,
        dim: 1.5,
        vel: 0.35,
        components: {
          background: { pixi: { tint: 'red', visible: true } },
        },
      },
    },
    biome: {},
  },

  Init: async function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;
    const eventId = `${type}.${id}`;
    Pixi.setComponents(options);

    switch (eventId) {
      case 'user.main':
        Keyboard.Event[`${eventId}`] = {
          ArrowLeft: () => (this.Data[type][id].x -= this.Data[type][id].vel),
          ArrowRight: () => (this.Data[type][id].x += this.Data[type][id].vel),
          ArrowUp: () => (this.Data[type][id].y -= this.Data[type][id].vel),
          ArrowDown: () => (this.Data[type][id].y += this.Data[type][id].vel),
        };

        ['q'].map((key) => {
          Keyboard.Event[`${eventId}`][key.toUpperCase()] = () =>
            logger.warn(`${eventId} Keyboard.Event [${key.toUpperCase()}]`);
          Keyboard.Event[`${eventId}`][key.toLowerCase()] = () =>
            logger.warn(`${eventId} Keyboard.Event [${key.toLowerCase()}]`);
        });

        break;

      default:
        break;
    }
  },
};

export { Elements };
