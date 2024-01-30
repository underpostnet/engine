import { newInstance, random, range, round10 } from '../core/CommonJs.js';

const ModelElement = {
  world: () => {
    return {
      world: {
        _id: '65a8783937c1183be094ccb0', // '65a820d4cc37f11f003a4082', // '65a820a9cc37f11f003a4077',
        face: 1,
      },
    };
  },
  user: () => {
    return {
      user: {
        _id: '',
      },
    };
  },
};

const ComponentElement = {
  user: () => {
    return {
      components: {
        background: [{ pixi: { tint: 'blue', visible: true }, enabled: false }],
        skin: [
          { displayId: 'anon', position: '08', enabled: true },
          { displayId: 'eiri', position: '08', enabled: false },
        ],
      },
    };
  },
  bot: () => {
    return {
      components: {
        background: [{ pixi: { tint: 'purple', visible: true }, enabled: false }],
        skin: [{ displayId: 'purple', position: '08', enabled: true }],
      },
    };
  },
};

const PlayerElement = () => {
  return {
    x: 1, // Matrix.Data.dim / 2 - 0.5,
    y: 1, // Matrix.Data.dim / 2 - 0.5,
    dim: 1,
    vel: 0.5,
  };
};

const BaseElement = () => {
  return {
    user: {
      main: {
        ...PlayerElement(),
        ...ComponentElement.user(),
        model: {
          ...ModelElement.world(),
          ...ModelElement.user(),
        },
      },
    },
    bot: {
      main: {
        ...PlayerElement(),
        ...ComponentElement.bot(),
        model: {
          ...ModelElement.world(),
        },
      },
    },
    biome: {},
    chat: {},
  };
};

const isCollision = function (options = { biomeData: {}, element: {}, x: 1, y: 1 }) {
  let { biomeData, element, x, y } = newInstance(options);
  if (!biomeData || !biomeData.solid) return false;
  x = x * biomeData.dimPaintByCell;
  y = y * biomeData.dimPaintByCell;
  for (const sumY of range(0, round10(element.dim * biomeData.dimPaintByCell) - 1))
    for (const sumX of range(0, round10(element.dim * biomeData.dimPaintByCell) - 1)) {
      if (
        biomeData.solid[round10(y + sumY)] === undefined ||
        biomeData.solid[round10(y + sumY)][round10(x + sumX)] === undefined ||
        biomeData.solid[round10(y + sumY)][round10(x + sumX)] === 1
      )
        return true;
    }
  return false;
};

const getRandomAvailablePosition = function (options = { biomeData: {}, element: {} }) {
  const { biomeData } = options;
  let x, y;
  const dim = biomeData.dim * biomeData.dimPaintByCell;
  while (x === undefined || y === undefined || isCollision({ ...options, x, y })) {
    x = random(0, dim - 1);
    y = random(0, dim - 1);
  }
  return { x, y };
};

export { BaseElement, PlayerElement, ModelElement, ComponentElement, getRandomAvailablePosition, isCollision };
