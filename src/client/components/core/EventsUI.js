import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { NotificationManager } from './NotificationManager.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const EventsUI = {
  on: (id = '', logic = function (e) {}, type = 'onclick', loadingContainer) => {
    let complete = true;
    s(id)[type] = async function (e) {
      if (complete) {
        complete = false;
        await LoadingAnimation.spinner.play(loadingContainer ? loadingContainer : id);
        await LoadingAnimation.bar.play(id);
        try {
          await logic(e);
        } catch (error) {
          logger.error(error);
          NotificationManager.Push({
            status: 'error',
            html: error?.message ? error.message : error ? error : 'Event error',
          });
        }
        LoadingAnimation.bar.stop(id);
        LoadingAnimation.spinner.stop(loadingContainer ? loadingContainer : id);
        complete = true;
        return;
      }
      if (e && e.preventDefault) e.preventDefault();
      logger.warn('in process', id);
    };
  },
  onClick: async function (id = '', logic = async function (e) {}, loadingContainer) {
    return await this.on(id, logic, 'onclick', loadingContainer);
  },
  onChange: async function (id = '', logic = async function (e) {}, loadingContainer) {
    return await this.on(id, logic, 'onchange', loadingContainer);
  },
};

export { EventsUI };
