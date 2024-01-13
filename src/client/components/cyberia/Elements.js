import { getDirection, newInstance } from '../core/CommonJs.js';
import { Keyboard } from '../core/Keyboard.js';
import { loggerFactory } from '../core/Logger.js';
import { BiomeEngine } from './Biome.js';
import { Event } from './Event.js';
import { Pixi } from './Pixi.js';

const logger = loggerFactory(import.meta);

const Elements = {
  Data: {
    user: {
      main: {
        x: 1, // Matrix.Data.dim / 2 - 0.5,
        y: 1, // Matrix.Data.dim / 2 - 0.5,
        dim: 1,
        vel: 0.5,
        world: {
          _id: '65a2721757325ebbea5240e8',
          face: 1,
        },
        components: {
          background: [{ pixi: { tint: 'purple', visible: true }, enabled: false }],
          skin: [
            { displayId: 'anon', position: '08', enabled: true },
            { displayId: 'eiri', position: '08', enabled: false },
          ],
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

        let lastX = newInstance(this.Data[type][id].x);
        let lastY = newInstance(this.Data[type][id].y);
        let lastDirection;
        setInterval(() => {
          if (lastX !== this.Data[type][id].x || lastY !== this.Data[type][id].y) {
            const direction = getDirection(lastX, lastY, this.Data[type][id].x, this.Data[type][id].y);
            lastX = newInstance(this.Data[type][id].x);
            lastY = newInstance(this.Data[type][id].y);
            if (lastDirection === direction) return;
            lastDirection = newInstance(direction);
            logger.info('New direction', direction);
            switch (direction) {
              case 'n':
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '12';
                    return component;
                  });
                break;
              case 's':
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '18';
                    return component;
                  });
                break;
              case 'e':
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '16';
                    return component;
                  });
                break;
              case 'se':
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '16';
                    return component;
                  });
                break;
              case 'ne':
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '16';
                    return component;
                  });
                break;
              case 'w':
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '14';
                    return component;
                  });
                break;
              case 'sw':
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '14';
                    return component;
                  });
                break;
              case 'nw':
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '14';
                    return component;
                  });
                break;
              default:
                if (this.Data[type][id].components.skin)
                  this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                    component.position = '18';
                    return component;
                  });
                break;
            }
            for (const skinInterval of Object.keys(Pixi.Data[type][id].intervals['skin']))
              Pixi.Data[type][id].intervals['skin'][skinInterval].callBack();
          } else {
            const stopX = newInstance(lastX);
            const stopY = newInstance(lastY);
            setTimeout(() => {
              if (stopX === this.Data[type][id].x && stopY === this.Data[type][id].y) {
                switch (lastDirection) {
                  case 'n':
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '02';
                        return component;
                      });
                    break;
                  case 's':
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '08';
                        return component;
                      });
                    break;
                  case 'e':
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '06';
                        return component;
                      });
                    break;
                  case 'se':
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '06';
                        return component;
                      });
                    break;
                  case 'ne':
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '06';
                        return component;
                      });
                    break;
                  case 'w':
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '04';
                        return component;
                      });
                    break;
                  case 'sw':
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '04';
                        return component;
                      });
                    break;
                  case 'nw':
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '04';
                        return component;
                      });
                    break;
                  default:
                    if (this.Data[type][id].components.skin)
                      this.Data[type][id].components.skin = this.Data[type][id].components.skin.map((component) => {
                        component.position = '08';
                        return component;
                      });
                    break;
                }
                for (const skinInterval of Object.keys(Pixi.Data[type][id].intervals['skin']))
                  Pixi.Data[type][id].intervals['skin'][skinInterval].callBack();
              }
            }, 500);
          }
        }, Event.Data.globalTimeInterval);

        break;

      default:
        break;
    }
  },
};

export { Elements };
