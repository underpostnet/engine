import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { cssEffect } from './Css.js';
import { NotificationManager } from './NotificationManager.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const EventsUI = {
  on: (id = '', logic = function (e) {}, type = 'onclick', options = {}) => {
    const { loadingContainer } = options;
    if (!s(id)) return;
    let complete = true;
    s(id)[type] = async function (e) {
      cssEffect(id, e);
      if (complete) {
        complete = false;
        await LoadingAnimation.spinner.play(loadingContainer ? loadingContainer : id);
        if (!id.match('delete') && !id.match('remove') && !id.match('clean') && !id.match('clear'))
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
        if (!id.match('delete') && !id.match('remove') && !id.match('clean') && !id.match('clear'))
          LoadingAnimation.bar.stop(id);
        await LoadingAnimation.spinner.stop(loadingContainer ? loadingContainer : id);
        complete = true;
        return;
      }
      if (e && e.preventDefault) e.preventDefault();
      logger.warn('in process', id);
    };
  },
  onClick: async function (id = '', logic = async function (e) {}, options = { loadingContainer: '' }) {
    return await this.on(id, logic, 'onclick', options);
  },
  onChange: async function (id = '', logic = async function (e) {}, options = { loadingContainer: '' }) {
    return await this.on(id, logic, 'onchange', options);
  },
};

export { EventsUI };
