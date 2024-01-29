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

const PlayerElement = () => {
  return {
    x: 1, // Matrix.Data.dim / 2 - 0.5,
    y: 1, // Matrix.Data.dim / 2 - 0.5,
    dim: 1,
    vel: 0.5,
    components: {
      background: [{ pixi: { tint: 'purple', visible: true }, enabled: false }],
      skin: [
        { displayId: 'anon', position: '08', enabled: true },
        { displayId: 'eiri', position: '08', enabled: false },
      ],
    },
  };
};

const BaseElement = () => {
  return {
    user: {
      main: {
        ...PlayerElement(),
        model: {
          ...ModelElement.world(),
          ...ModelElement.user(),
        },
      },
    },
    bot: {
      main: {
        ...PlayerElement(),
        model: {
          ...ModelElement.world(),
        },
      },
    },
    biome: {},
    chat: {},
  };
};

export { BaseElement, PlayerElement, ModelElement };
