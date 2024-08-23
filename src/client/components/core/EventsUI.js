import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { NotificationManager } from './NotificationManager.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const EventsUI = {
  on: (id = '', logic = function (e) {}, type = 'onclick', options = {}) => {
    const { loadingContainer, disableSpinner } = options;
    if (!s(id)) return;
    let complete = true;
    s(id)[type] = async function (e) {
      if (complete) {
        complete = false;
        if (!disableSpinner) await LoadingAnimation.spinner.play(loadingContainer ? loadingContainer : id);
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
        if (!disableSpinner) await LoadingAnimation.spinner.stop(loadingContainer ? loadingContainer : id);
        complete = true;
        return;
      }
      if (e && e.preventDefault) e.preventDefault();
      logger.warn('in process', id);
    };
  },
  onClick: async function (
    id = '',
    logic = async function (e) {},
    options = { disableSpinner: false, loadingContainer: '' },
  ) {
    return await this.on(id, logic, 'onclick', options);
  },
  onChange: async function (
    id = '',
    logic = async function (e) {},
    options = { disableSpinner: false, loadingContainer: '' },
  ) {
    return await this.on(id, logic, 'onchange', options);
  },
};

export { EventsUI };
