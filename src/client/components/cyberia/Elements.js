import { Keyboard } from '../core/Keyboard.js';
import { loggerFactory } from '../core/Logger.js';
import { BiomeEngine } from './Biome.js';
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
          background: { pixi: { tint: 'blue', visible: true } },
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
          ArrowLeft: () => {
            const x = this.Data[type][id].x - this.Data[type][id].vel;
            const y = this.Data[type][id].y;
            if (BiomeEngine.isCollision({ type, id, x, y })) return;
            this.Data[type][id].x = x;
            Pixi.updatePosition(options);
          },
          ArrowRight: () => {
            const x = this.Data[type][id].x + this.Data[type][id].vel;
            const y = this.Data[type][id].y;
            if (BiomeEngine.isCollision({ type, id, x, y })) return;
            this.Data[type][id].x = x;
            Pixi.updatePosition(options);
          },
          ArrowUp: () => {
            const x = this.Data[type][id].x;
            const y = this.Data[type][id].y - this.Data[type][id].vel;
            if (BiomeEngine.isCollision({ type, id, x, y })) return;
            this.Data[type][id].y = y;
            Pixi.updatePosition(options);
          },
          ArrowDown: () => {
            const x = this.Data[type][id].x;
            const y = this.Data[type][id].y + this.Data[type][id].vel;
            if (BiomeEngine.isCollision({ type, id, x, y })) return;
            this.Data[type][id].y = y;
            Pixi.updatePosition(options);
          },
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
