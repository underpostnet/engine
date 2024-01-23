import { loggerFactory } from './Logger.js';
import { Responsive } from './Responsive.js';
import { checkFullScreen } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const FullScreen = {
  Event: {},
  fullScreenMode: false,
  Init: async function (options) {
    const { globalTimeInterval } = options;
    setInterval(() => {
      const currentFullScreenMode = checkFullScreen();
      if (this.fullScreenMode !== currentFullScreenMode) {
        this.fullScreenMode = currentFullScreenMode;
        logger.info('onChangeScreen', this.fullScreenMode);
        Object.keys(this.Event).map((keyEvent) => this.Event[keyEvent](this.fullScreenMode));
        Responsive.triggerEvents();
      }
    }, globalTimeInterval);
  },
  Render: async function () {},
};

export { FullScreen };
