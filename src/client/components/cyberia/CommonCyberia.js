import { newInstance, random, range, round10 } from '../core/CommonJs.js';

const CyberiaBaseMatrix = () => {
  return {
    dim: 16 * 2,
    dimPaintByCell: 3,
    dimAmplitude: 2, // 8,
  };
};

const ModelElement = {
  world: () => {
    return {
      world: {
        _id: '65c78ae12194e65297a8a371', // '65a820d4cc37f11f003a4082'  '65a8783937c1183be094ccb0'
        // 65c774c6efaaea9445bb6e74 (3)   65c78ae12194e65297a8a371 (2)
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
          {
            displayId: 'anon',
            position: '08',
            positions: [
              { positionId: '02', frames: 1 },
              { positionId: '04', frames: 1 },
              { positionId: '06', frames: 1 },
              { positionId: '08', frames: 1 },
              { positionId: '12', frames: 2 },
              { positionId: '14', frames: 2 },
              { positionId: '16', frames: 2 },
              { positionId: '18', frames: 2 },
            ],
            enabled: true,
          },
          {
            displayId: 'eiri',
            position: '08',
            positions: [
              { positionId: '02', frames: 1 },
              { positionId: '04', frames: 1 },
              { positionId: '06', frames: 1 },
              { positionId: '08', frames: 1 },
              { positionId: '12', frames: 2 },
              { positionId: '14', frames: 2 },
              { positionId: '16', frames: 2 },
              { positionId: '18', frames: 2 },
            ],
            enabled: false,
          },
        ],
        lifeBar: {},
        lifeIndicator: {},
      },
    };
  },
  bot: () => {
    return {
      components: {
        background: [{ pixi: { tint: 'purple', visible: true }, enabled: false }],
        skin: [
          {
            displayId: 'purple',
            position: '08',
            positions: [
              { positionId: '02', frames: 1 },
              { positionId: '04', frames: 1 },
              { positionId: '06', frames: 1 },
              { positionId: '08', frames: 1 },
              { positionId: '12', frames: 2 },
              { positionId: '14', frames: 2 },
              { positionId: '16', frames: 2 },
              { positionId: '18', frames: 2 },
            ],
            enabled: true,
          },
        ],
        lifeBar: {},
        lifeIndicator: {},
      },
    };
  },
  skill: () => {
    return {
      parent: {
        type: '',
        id: '',
      },
      components: {
        background: [{ pixi: { tint: 'purple', visible: true }, enabled: false }],
        skill: [],
      },
    };
  },
};

const MatrixElement = () => {
  return {
    x: 1, // Matrix.Data.dim / 2 - 0.5,
    y: 1, // Matrix.Data.dim / 2 - 0.5,
    dim: 1,
    vel: 0.5,
  };
};

const PlayerElement = () => {
  return {
    skill: {
      basic: 'q',
      keys: {
        q: 'red-power',
        w: null,
        e: null,
        r: null,
      },
    },
    maxLife: 150,
    life: 150,
    deadTime: 3000,
  };
};

const BaseElement = () => {
  return {
    user: {
      main: {
        ...MatrixElement(),
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
        ...MatrixElement(),
        ...PlayerElement(),
        ...ComponentElement.bot(),
        model: {
          ...ModelElement.world(),
        },
      },
    },
    skill: {
      main: {
        ...MatrixElement(),
        ...ComponentElement.skill(),
        model: {
          ...ModelElement.world(),
        },
      },
    },
    biome: {},
    chat: {},
  };
};

const isBiomeCollision = function (options = { biomeData: {}, element: {}, x: 1, y: 1 }) {
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

const isElementCollision = function (
  args = { A: { x: 1, y: 1, dim: 1 }, B: { x: 1, y: 1, dim: 1 }, dimPaintByCell: 3 },
) {
  const { A, B, dimPaintByCell } = args;
  for (const aSumX of range(0, A.dim * dimPaintByCell))
    for (const aSumY of range(0, A.dim * dimPaintByCell))
      for (const bSumX of range(0, B.dim * dimPaintByCell))
        for (const bSumY of range(0, B.dim * dimPaintByCell))
          if (
            round10(A.x * dimPaintByCell + aSumX) === round10(B.x * dimPaintByCell + bSumX) &&
            round10(A.y * dimPaintByCell + aSumY) === round10(B.y * dimPaintByCell + bSumY)
          )
            return true;
  return false;
};

const getRandomAvailablePosition = function (options = { biomeData: {}, element: {} }) {
  const { biomeData } = options;
  let x, y;
  const dim = biomeData.dim * biomeData.dimPaintByCell;
  while (x === undefined || y === undefined || isBiomeCollision({ ...options, x, y })) {
    x = random(0, dim - 1);
    y = random(0, dim - 1);
  }
  return { x, y };
};

const WorldType = {
  width: {
    worldFaces: [1, 6, 3, 5],
    spaceFace: [2, 4],
  },
  height: {
    worldFaces: [1, 2, 3, 4],
    spaceFace: [5, 6],
  },
};

const WorldLimit = (options = { type: undefined }) => {
  const { type } = options;
  return {
    6: {
      top: [2, 'bottom'],
      bottom: [4, 'top'],
      left: [1, 'right'],
      right: [3, 'left'],
    },
    5: {
      top: [2, 'bottom'],
      bottom: [4, 'top'],
      left: [3, 'right'],
      right: [1, 'left'],
    },
    4: {
      top: [1, 'bottom'],
      bottom: [3, 'top'],
      left: [5, 'right'],
      right: [6, 'left'],
    },
    3: {
      top: [4, 'bottom'],
      bottom: [2, 'top'],
      left: [type === 'width' ? 6 : 5, 'right'],
      right: [type === 'width' ? 5 : 6, 'left'],
    },
    2: {
      top: [3, 'bottom'],
      bottom: [1, 'top'],
      left: [5, 'right'],
      right: [6, 'left'],
    },
    1: {
      top: [2, 'bottom'],
      bottom: [4, 'top'],
      left: [5, 'right'],
      right: [6, 'left'],
    },
  };
};

const SkillType = {
  'red-power': {
    component: {
      displayId: 'red-power',
      position: '08',
      positions: [{ positionId: '08', frames: 2 }],
      velFrame: 50,
      enabled: true,
    },
    cooldown: 750,
    timeLife: 300,
    damage: 10,
  },
};

const updateMovementDirection = ({ direction, element }) => {
  switch (direction) {
    case 'n':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '12';
          return component;
        });
      break;
    case 's':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '18';
          return component;
        });
      break;
    case 'e':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '16';
          return component;
        });
      break;
    case 'se':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '16';
          return component;
        });
      break;
    case 'ne':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '16';
          return component;
        });
      break;
    case 'w':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '14';
          return component;
        });
      break;
    case 'sw':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '14';
          return component;
        });
      break;
    case 'nw':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '14';
          return component;
        });
      break;
    default:
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = '18';
          return component;
        });
      break;
  }
  return element;
};

const CyberiaParams = {
  CYBERIA_EVENT_CALLBACK_TIME: 45,
};

export {
  BaseElement,
  MatrixElement,
  ModelElement,
  ComponentElement,
  getRandomAvailablePosition,
  isBiomeCollision,
  isElementCollision,
  WorldLimit,
  WorldType,
  SkillType,
  CyberiaParams,
  updateMovementDirection,
  CyberiaBaseMatrix,
};
