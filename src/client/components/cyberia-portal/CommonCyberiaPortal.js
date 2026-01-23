const ModelElement = {
  user: () => {
    return {
      user: {
        _id: '',
      },
    };
  },
};

const BaseElement = () => {
  return {
    user: {
      main: {
        model: {
          ...ModelElement.user(),
        },
      },
    },
    chat: {},
    mailer: {},
  };
};

const CyberiaPortalParams = {
  EVENT_CALLBACK_TIME: 45,
};

const CyberiaDependencies = {
  'maxrects-packer': '^2.7.3',
  pngjs: '^7.0.0',
  jimp: '^1.6.0',
  sharp: '^0.32.5',
};

export { BaseElement, ModelElement, CyberiaPortalParams, CyberiaDependencies };
