import { Keyboard } from '../core/Keyboard.js';
import { loggerFactory } from '../core/Logger.js';

const logger = loggerFactory(import.meta);

const Elements = {
  Data: {
    user: {
      main: {
        x: 1, // Matrix.Data.dim / 2 - 0.5,
        y: 1, // Matrix.Data.dim / 2 - 0.5,
        dim: 1,
        vel: 0.35,
      },
    },
    biome: {},
  },
  Init: async function () {
    const idKeyBoardEvent = 'user.main';

    Keyboard.Event[`${idKeyBoardEvent}`] = {
      ArrowLeft: () => (this.Data.user.main.x -= this.Data.user.main.vel),
      ArrowRight: () => (this.Data.user.main.x += this.Data.user.main.vel),
      ArrowUp: () => (this.Data.user.main.y -= this.Data.user.main.vel),
      ArrowDown: () => (this.Data.user.main.y += this.Data.user.main.vel),
    };

    ['q'].map((key) => {
      Keyboard.Event[`${idKeyBoardEvent}`][key.toUpperCase()] = () =>
        logger.warn(`${idKeyBoardEvent} Keyboard.Event [${key.toUpperCase()}]`);
      Keyboard.Event[`${idKeyBoardEvent}`][key.toLowerCase()] = () =>
        logger.warn(`${idKeyBoardEvent} Keyboard.Event [${key.toLowerCase()}]`);
    });
  },
};

export { Elements };
