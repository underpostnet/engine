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

const UnderpostParams = {
  NEXODEV_EVENT_CALLBACK_TIME: 45,
};

export { BaseElement, ModelElement, UnderpostParams };
