import { newInstance, random, range, reduceMatrix, round10 } from '../core/CommonJs.js';

const BaseMatrixCyberia = () => {
  return {
    dim: 16 * 2,
    dimPaintByCell: 3,
    dimAmplitude: 3, // 8,
  };
};

const ModelElement = {
  world: (options) => {
    return {
      world: {
        _id: options?.worldId ? options.worldId : CyberiaParams.CYBERIA_WORLD_ID,
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
  quests: () => {
    return {
      quests: [],
    };
  },
};

const PositionsComponent = {
  frames1: () => [
    { positionId: '02', frames: 1 },
    { positionId: '04', frames: 1 },
    { positionId: '06', frames: 1 },
    { positionId: '08', frames: 1 },
    { positionId: '12', frames: 1 },
    { positionId: '14', frames: 1 },
    { positionId: '16', frames: 1 },
    { positionId: '18', frames: 1 },
  ],
  default: () => [
    { positionId: '02', frames: 1 },
    { positionId: '04', frames: 1 },
    { positionId: '06', frames: 1 },
    { positionId: '08', frames: 1 },
    { positionId: '12', frames: 2 },
    { positionId: '14', frames: 2 },
    { positionId: '16', frames: 2 },
    { positionId: '18', frames: 2 },
  ],
  wing: () => [
    { positionId: '02', frames: 2 },
    { positionId: '04', frames: 2 },
    { positionId: '06', frames: 2 },
    { positionId: '08', frames: 2 },
    { positionId: '12', frames: 2 },
    { positionId: '14', frames: 2 },
    { positionId: '16', frames: 2 },
    { positionId: '18', frames: 2 },
  ],
  ghost: () => [
    { positionId: '02', frames: 8 },
    { positionId: '04', frames: 8 },
    { positionId: '06', frames: 8 },
    { positionId: '08', frames: 8 },
    { positionId: '12', frames: 8 },
    { positionId: '14', frames: 8 },
    { positionId: '16', frames: 8 },
    { positionId: '18', frames: 8 },
  ],
  frames3: () => [
    { positionId: '02', frames: 3 },
    { positionId: '04', frames: 3 },
    { positionId: '06', frames: 3 },
    { positionId: '08', frames: 3 },
    { positionId: '12', frames: 3 },
    { positionId: '14', frames: 3 },
    { positionId: '16', frames: 3 },
    { positionId: '18', frames: 3 },
  ],
  frames11: () => [
    { positionId: '02', frames: 11 },
    { positionId: '04', frames: 11 },
    { positionId: '06', frames: 11 },
    { positionId: '08', frames: 11 },
    { positionId: '12', frames: 11 },
    { positionId: '14', frames: 11 },
    { positionId: '16', frames: 11 },
    { positionId: '18', frames: 11 },
  ],
};

const setElementConsistency = (type, element) => {
  if ('life' in element && 'maxLife' in element) {
    if (element.life > element.maxLife) element.life = newInstance(element.maxLife);
    if (element.life > 0 && element.components.skin.find((s) => s.enabled).displayId === 'ghost') {
      const currentSkin = element.components.skin.find((s) => s.current);
      element.components.skin = element.components.skin.map((s) => {
        s.enabled = s.displayId === (currentSkin ? currentSkin.displayId : 'anon');
        return s;
      });
    }
  }
  return element;
};

const DisplayComponent = {
  get: {
    bone: () => {
      return {
        displayId: 'bone',
        position: '08',
        positions: PositionsComponent.frames1(),
        velFrame: 0.03,
        assetFolder: 'quest',
        extension: 'gif',
      };
    },
    'bone-brown': () => {
      return {
        displayId: 'bone-brown',
        position: '08',
        positions: PositionsComponent.frames1(),
        velFrame: 0.03,
        assetFolder: 'quest',
        extension: 'gif',
      };
    },
    ayleen: () => {
      return {
        displayId: 'ayleen',
        position: '08',
        positions: PositionsComponent.default(),
        velFrame: 0.03,
        assetFolder: 'skin',
        extension: 'png',
      };
    },
    anon: () => {
      return {
        displayId: 'anon',
        position: '08',
        positions: PositionsComponent.default(),
        assetFolder: 'skin',
        velFrame: 0.03,
        extension: 'png',
      };
    },
    eiri: () => {
      return {
        displayId: 'eiri',
        position: '08',
        positions: PositionsComponent.default(),
        assetFolder: 'skin',
        velFrame: 0.03,
        extension: 'png',
      };
    },
    'scp-2040': () => {
      return {
        displayId: 'scp-2040',
        position: '08',
        positions: PositionsComponent.default(),
        assetFolder: 'skin',
        velFrame: 0.03,
        extension: 'png',
      };
    },
    ghost: () => {
      return {
        displayId: 'ghost',
        position: '08',
        positions: PositionsComponent.ghost(),
        assetFolder: 'skin',
        velFrame: 0.03,
        extension: 'png',
      };
    },
    purple: () => {
      return {
        displayId: 'purple',
        position: '08',
        positions: PositionsComponent.default(),
        assetFolder: 'skin',
        velFrame: 0.03,
        extension: 'png',
      };
    },
    agent: () => {
      return {
        displayId: 'agent',
        position: '08',
        positions: PositionsComponent.default(),
        assetFolder: 'skin',
        velFrame: 0.03,
        extension: 'png',
      };
    },
    kishins: () => {
      return {
        displayId: 'kishins',
        position: '08',
        positions: PositionsComponent.default(),
        assetFolder: 'skin',
        velFrame: 0.03,
        extension: 'png',
      };
    },
    punk: () => {
      return {
        displayId: 'punk',
        position: '08',
        positions: PositionsComponent.default(),
        assetFolder: 'skin',
        velFrame: 0.03,
        extension: 'png',
      };
    },
    'tim-knife': () => {
      return {
        displayId: 'tim-knife',
        position: '08',
        positions: PositionsComponent['frames3'](),
        velFrame: 0.03,
        assetFolder: 'weapon',
        extension: 'gif',
      };
    },
    'brown-wing': () => {
      return {
        displayId: 'brown-wing',
        position: '08',
        positions: PositionsComponent.wing(),
        velFrame: 0.03,
        assetFolder: 'breastplate',
        extension: 'png',
      };
    },
    'red-power': () => {
      return {
        displayId: 'red-power',
        position: '08',
        positions: PositionsComponent['frames3'](),
        velFrame: 0.03,
        assetFolder: 'skill',
        extension: 'png',
      };
    },
    'green-power': () => {
      return {
        displayId: 'green-power',
        position: '08',
        positions: PositionsComponent['frames3'](),
        velFrame: 0.03,
        assetFolder: 'skill',
        extension: 'png',
      };
    },
    dog: () => {
      return {
        displayId: 'dog',
        position: '08',
        positions: PositionsComponent['frames11'](),
        velFrame: 0.1,
        assetFolder: 'skin',
        extension: 'png',
      };
    },
  },
};

const Stat = {
  get: {
    anon: () => {
      return {
        dim: 1,
        vel: 0.5,
        maxLife: 150,
        deadTime: 3000,
      };
    },
    purple: () => {
      return {
        dim: 1,
        vel: 0.5,
        maxLife: 150,
        deadTime: 3000,
      };
    },
    ghost: () => {
      return {
        dim: 1,
        vel: 0.5,
        maxLife: 150,
        deadTime: 3000,
      };
    },
    eiri: () => {
      return {
        dim: 1,
        vel: 0.5,
        maxLife: 150,
        deadTime: 3000,
      };
    },
    kishins: () => {
      return {
        dim: 2.5,
        vel: 0.8,
        maxLife: 400,
        deadTime: 5000,
      };
    },
    'scp-2040': () => {
      return {
        dim: 1.8,
        vel: 0.2,
        maxLife: 300,
        deadTime: 8000,
      };
    },
    'tim-knife': () => {
      return {
        damage: 50,
        dim: 1,
      };
    },
    'red-power': () => {
      return {
        cooldown: 750,
        timeLife: 300,
        damage: 10,
        vel: 0.3,
      };
    },
    'green-power': () => {
      return {
        cooldown: 750,
        timeLife: 300,
        damage: 10,
        vel: 0.8,
      };
    },
    'brown-wing': () => {
      return {
        dim: 1,
        vel: 1.5,
      };
    },
    'bone-browne': {
      return: {
        dim: 1.8,
      },
    },
    bone: () => {
      return {
        dim: 1,
      };
    },
    dog: () => {
      return {
        dim: 1,
      };
    },
  },
  set: function (type, element, build) {
    if (!build) {
      const oldElement = newInstance(element);
      // only storage data (no accumulative attributes, example: damage)
      element = BaseElement()[type].main;
      element._id = oldElement._id;
      element.x = oldElement.x;
      element.y = oldElement.y;
      element.skill = oldElement.skill;
      element.weapon = oldElement.weapon;
      element.breastplate = oldElement.breastplate;
      element.model = oldElement.model;
      element.components = oldElement.components;
      element.life = oldElement.life;
      element.coin = oldElement.coin;
    }

    for (const componentType of Object.keys(CharacterCyberiaSlotType)) {
      if (!element.components[componentType]) continue;
      const component = element.components[componentType].find((e) => e.current);
      if (component) {
        const componentStat = this.get[component.displayId]();
        if (componentType === 'skin') {
          element = { ...element, ...componentStat };
          continue;
        }
        for (const keyStat of Object.keys(componentStat)) {
          switch (keyStat) {
            case 'damage':
              element[keyStat] += componentStat[keyStat];
              break;

            default:
              break;
          }
        }
      }
    }

    element = setElementConsistency(type, element);

    return element;
  },
};

const QuestComponent = {
  Data: {
    'floki-bone': () => {
      return {
        type: 'search',
        maxStep: 3,
        currentStep: 0,
        displaySearchObjects: [
          { id: 'bone', quantity: 2, current: 0, step: 0 },
          { id: 'bone-brown', quantity: 1, current: 0, step: 0 },
          {
            id: 'ayleen',
            actionIcon: 'assets/ui-icons/hand.png',
            panelQuestIcons: ['assets/ui-icons/hand.png', 'assets/skin/ayleen/08/0.png'],
            quantity: 1,
            current: 0,
            step: 1,
            delivery: true,
          },
          { id: 'bone', quantity: 1, current: 0, step: 2 },
          { id: 'bone-brown', quantity: 1, current: 0, step: 2 },
          {
            id: 'ayleen',
            actionIcon: 'assets/ui-icons/hand.png',
            panelQuestIcons: ['assets/ui-icons/hand.png', 'assets/skin/ayleen/08/0.png'],
            quantity: 1,
            current: 0,
            step: 3,
            delivery: true,
          },
        ],
        reward: [
          {
            type: 'coin',
            quantity: 20,
          },
        ],
        provide: {
          displayIds: [
            {
              id: 'ayleen',
              quantity: [1],
              stepData: [
                {
                  image: 'assets/quest/bone/08/0.gif',
                  bubble: false,
                  completeDialog: {
                    en: 'Good, now take the bones to ayleen',
                    es: 'Bien, ahora lleva los huesos a ayleen',
                  },
                },
                {
                  image: 'assets/skin/ayleen/08/0.png',
                  bubble: true,
                  completeDialog: {
                    en: 'thanks, please find more bones',
                    es: 'gracias!, porfavor busca mas huesos',
                  },
                },
                {
                  image: 'assets/quest/bone/08/0.gif',
                  bubble: false,
                  completeDialog: {
                    en: 'Good, now take the bones to ayleen',
                    es: 'Bien, ahora lleva los huesos a ayleen',
                  },
                },
                {
                  image: 'assets/skin/ayleen/08/0.png',
                  bubble: true,
                  completeDialog: {
                    en: 'thanks!',
                    es: 'gracias!',
                  },
                },
              ],
            },
          ],
        },
        icon: {
          folder: 'quest/bone',
          id: 'animation.gif',
        },
        title: {
          en: `floki's bone`,
          es: 'Huesos de floki',
        },
        shortDescription: {
          en: `Please find Floki's bone`,
          es: 'Por favor encuentra los huesos de floki',
        },
        description: {
          en: `Please find Floki's bone`,
          es: 'Por favor encuentra los huesos de floki',
        },
        descriptionBubble: true,
        successDescription: {
          en: 'complete thanks!',
          es: 'complete gracias!',
        },
        successDescriptionBubble: true,
      };
    },
  },
  getQuestByDisplayId: function ({ displayId }) {
    const questData = [];
    for (const id of Object.keys(this.Data)) {
      const provideDemand = this.Data[id]().provide.displayIds.filter((q) => q.id === displayId);

      if (provideDemand.length > 0)
        for (const demandUnit of range(0, provideDemand.reduce((sum, el) => sum + el.quantity[0], 0) - 1))
          questData.push({ id, ...this.Data[id](), demandUnit });

      // if (this.Data[id]().provide.displayIds.find((q) => q.id === displayId)) {
      //   questData.push({ id, ...this.Data[id]() });
      // }
      if (this.Data[id]().displaySearchObjects.find((q) => q.id === displayId)) {
        if (this.componentsScope[displayId].questKeyContext === 'displaySearchObjects')
          questData.push({ id, ...this.Data[id]() });
      }
    }
    return questData;
  },
  verifyCompleteQuestStep: function ({ currentStep, questData }) {
    if (!currentStep) currentStep = questData.currentStep;
    return questData.displaySearchObjects.filter((s) => s.step === currentStep && s.current < s.quantity).length === 0;
  },
  verifyCompleteQuest: function ({ currentStep, questData }) {
    if (!currentStep) currentStep = questData.currentStep;
    return currentStep >= this.Data[questData.id]().maxStep && this.verifyCompleteQuestStep({ questData });
  },
  componentsScope: {
    bone: {
      questKeyContext: 'displaySearchObjects',
    },
    'bone-brown': {
      questKeyContext: 'displaySearchObjects',
    },
    ayleen: {
      questKeyContext: 'provide',
    },
  },
  components: [DisplayComponent.get['bone'](), DisplayComponent.get['bone-brown'](), DisplayComponent.get['ayleen']()],
};

const ComponentElement = {
  user: () => {
    let base = {
      behavior: 'user',
      components: {
        background: [{ pixi: { tint: 'blue', visible: true }, enabled: false }],
        skin: [
          { enabled: true, current: true, ...DisplayComponent.get['anon']() },
          DisplayComponent.get['eiri'](),
          DisplayComponent.get['scp-2040'](),
          DisplayComponent.get['ghost'](),
        ],
        weapon: [DisplayComponent.get['tim-knife']()],
        breastplate: [DisplayComponent.get['brown-wing']()],
        lifeBar: {},
        lifeIndicator: {},
        coinIndicator: {},
        username: {},
        title: {},
        pointerArrow: {},
      },
    };
    return Stat.set('user', base, true);
  },
  bot: () => {
    let base = {
      behavior: 'user-hostile',
      components: {
        background: [{ pixi: { tint: 'purple', visible: true }, enabled: false }],
        skin: [DisplayComponent.get['ghost']()],
        weapon: [],
        breastplate: [],
        lifeBar: {},
        lifeIndicator: {},
        username: {},
        title: {},
        pointerArrow: {},
      },
    };
    return Stat.set('bot', base, true);
  },
  skill: () => {
    let base = {
      parent: {
        type: '',
        id: '',
      },
      components: {
        background: [{ pixi: { tint: 'purple', visible: true }, enabled: false }],
        skin: [{ enabled: true, current: true, ...DisplayComponent.get['red-power']() }],
        weapon: [],
        breastplate: [],
      },
    };
    return Stat.set('skill', base, true);
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

const SkillCyberiaType = {
  basic: { keyboard: 'q' },
  primary: { keyboard: 'w' },
  secondary: { keyboard: 'e' },
  definitive: { keyboard: 'r' },
};

const SkillCyberiaData = {
  'red-power': { type: 'basic' },
  'green-power': { type: 'basic' },
};

const SkillCyberiaElement = () => {
  return {
    cooldown: 750,
    timeLife: 300,
    damage: 10,
  };
};

const PlayerElement = () => {
  return {
    skill: {
      keys: {
        basic: 'red-power',
        primary: null,
        secondary: null,
        definitive: null,
      },
      tree: [
        {
          id: 'red-power',
        },
        {
          id: 'green-power',
        },
      ],
    },
    weapon: {
      tree: [
        {
          id: 'tim-knife',
        },
      ],
    },
    breastplate: {
      tree: [
        {
          id: 'brown-wing',
        },
      ],
    },
    maxLife: 150,
    life: 150,
    deadTime: 3000,
    lifeRegeneration: 5,
    lifeRegenerationVel: 1500,
    coin: 0,
  };
};

const BaseElement = (options = { worldId: undefined }) => {
  return {
    user: {
      main: {
        ...MatrixElement(),
        ...PlayerElement(),
        ...SkillCyberiaElement(),
        ...ComponentElement.user(),
        model: {
          ...ModelElement.world(options),
          ...ModelElement.user(),
          ...ModelElement.quests(),
        },
      },
    },
    bot: {
      main: {
        ...MatrixElement(),
        ...PlayerElement(),
        ...SkillCyberiaElement(),
        ...ComponentElement.bot(),
        model: {
          ...ModelElement.world(options),
        },
      },
    },
    skill: {
      main: {
        ...MatrixElement(),
        ...SkillCyberiaElement(),
        ...ComponentElement.skill(),
        model: {
          ...ModelElement.world(options),
        },
      },
    },
    biome: {},
    chat: {},
    mailer: {},
  };
};

const isBiomeCyberiaCollision = function (options = { biomeData: {}, element: {}, x: 1, y: 1 }) {
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
  for (const aSumX of range(0, round10(A.dim * dimPaintByCell)))
    for (const aSumY of range(0, round10(A.dim * dimPaintByCell)))
      for (const bSumX of range(0, round10(B.dim * dimPaintByCell)))
        for (const bSumY of range(0, round10(B.dim * dimPaintByCell)))
          if (
            round10(A.x * dimPaintByCell + aSumX) === round10(B.x * dimPaintByCell + bSumX) &&
            round10(A.y * dimPaintByCell + aSumY) === round10(B.y * dimPaintByCell + bSumY)
          )
            return true;
  return false;
};

const getRandomAvailablePositionCyberia = function (options = { biomeData: {}, element: {} }) {
  const { biomeData } = options;
  let x, y;
  const dim = biomeData.dim * biomeData.dimPaintByCell;
  while (x === undefined || y === undefined || isBiomeCyberiaCollision({ ...options, x, y })) {
    x = random(0, dim - 1);
    y = random(0, dim - 1);
  }
  return { x, y };
};

const getCollisionMatrixCyberia = (biome, element) => {
  let biomeData = newInstance(biome);
  if (!Array.isArray(biome.solid)) biomeData.solid = Object.values(biome.solid).map((row) => Object.values(row));
  return reduceMatrix(
    biomeData.solid.map((y) => y.map((x) => (x === 0 ? 0 : 1))),
    3,
  ).map((y, iY) =>
    y.map((x, iX) =>
      x === 0 &&
      !isBiomeCyberiaCollision({
        biomeData,
        element,
        x: iX,
        y: iY,
      })
        ? 0
        : 1,
    ),
  );
};

const WorldCyberiaType = {
  width: {
    worldFaces: [1, 6, 3, 5],
    spaceFace: [2, 4],
  },
  height: {
    worldFaces: [1, 2, 3, 4],
    spaceFace: [5, 6],
  },
};

const WorldCyberiaLimit = (options = { type: undefined }) => {
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

const updateMovementDirection = ({ direction, element, suffix }) => {
  switch (direction) {
    case 'n':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}2`;
          return component;
        });
      break;
    case 's':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}8`;
          return component;
        });
      break;
    case 'e':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}6`;
          return component;
        });
      break;
    case 'se':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}6`;
          return component;
        });
      break;
    case 'ne':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}6`;
          return component;
        });
      break;
    case 'w':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}4`;
          return component;
        });
      break;
    case 'sw':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}4`;
          return component;
        });
      break;
    case 'nw':
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}4`;
          return component;
        });
      break;
    default:
      if (element.components.skin)
        element.components.skin = element.components.skin.map((component) => {
          component.position = `${suffix ? suffix : '1'}8`;
          return component;
        });
      break;
  }
  return element;
};

const CharacterCyberiaSlotType = {
  skin: {},
  weapon: {},
  'faction-symbol': {},
  breastplate: {},
  legs: {},
  helmet: {},
  talisman: {},
};

const BehaviorElement = {
  user: {
    color: 'yellow',
  },
  'user-hostile': {
    color: 'red',
  },
  'quest-passive': {
    color: 'yellow',
  },
  'item-quest': {
    color: 'yellow',
  },
  decor: {
    color: 'yellow',
  },
  pet: {
    color: 'yellow',
  },
};

const getK = (value) => {
  /*

    TOP DEFINITION

    1kk
    1kk means million where each K represents 000.

    1k = 1 000
    1kk = 1 000 000
    1kkk =1 000 000 000

    Mostly used in games.
    I'm selling this item for 1kk
    by Aelos03 May 22, 2014

    */

  const limitK = 1000;
  const limitKK = 1000000;
  const limitKKK = 1000000000;
  if (value < limitK) return value;
  else if (value >= limitK && value < limitKK) return round10(value / limitK, -2) + 'k';
  else if (value >= limitKK && value < limitKKK) return round10(value / limitKK, -2) + 'kk';
  else if (value >= limitKKK) return round10(value / limitKKK, -2) + 'kkk';
};

const CyberiaParams = {
  EVENT_CALLBACK_TIME: 45,
  MOVEMENT_TRANSITION_FACTOR: 4,
  CYBERIA_WORLD_ID: '',
};

const CyberiaServer = {
  instances: [{ server: 'dim32' }, { server: 'hhworld' }, { server: 'interior32' }, { server: 'lol' }],
};

export {
  BaseElement,
  MatrixElement,
  ModelElement,
  ComponentElement,
  getRandomAvailablePositionCyberia,
  isBiomeCyberiaCollision,
  isElementCollision,
  WorldCyberiaLimit,
  WorldCyberiaType,
  CyberiaParams,
  updateMovementDirection,
  BaseMatrixCyberia,
  getCollisionMatrixCyberia,
  CharacterCyberiaSlotType,
  PositionsComponent,
  Stat,
  setElementConsistency,
  SkillCyberiaData,
  SkillCyberiaType,
  QuestComponent,
  BehaviorElement,
  CyberiaServer,
  getK,
  DisplayComponent,
};
