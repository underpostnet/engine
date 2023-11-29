import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const EventsUI = {
  onClick: (id, logic) => {
    let complete = true;
    s(id).onclick = async function () {
      if (complete) {
        complete = false;
        LoadingAnimation.bar.play(id);
        LoadingAnimation.spinner.play(id);
        await logic();
        LoadingAnimation.bar.stop(id);
        LoadingAnimation.spinner.stop(id);
        complete = true;
        return;
      }
      logger.warn('in process', id);
    };
  },
};

export { EventsUI };
