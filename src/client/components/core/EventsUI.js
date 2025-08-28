import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { cssEffect } from './Css.js';
import { NotificationManager } from './NotificationManager.js';
import { s, isActiveElement } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const EventsUI = {
  on: (id = '', logic = function (e) {}, type = 'onclick', options = {}) => {
    const { loadingContainer } = options;
    if (!s(id)) return;
    let complete = true;
    s(id)[type] = async function (e) {
      if (options.clickEffect) cssEffect(id, e);
      if (complete) {
        complete = false;
        await LoadingAnimation.spinner.play(loadingContainer ? loadingContainer : id);
        if (options.context !== 'modal') await LoadingAnimation.bar.play(id);
        try {
          await logic(e);
        } catch (error) {
          logger.error(error);
          NotificationManager.Push({
            status: 'error',
            html: error?.message ? error.message : error ? error : 'Event error',
          });
        }
        if (options.context !== 'modal') LoadingAnimation.bar.stop(id);
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
  // Shared hover/focus controller extracted from Modal
  HoverFocusController: function ({ inputSelector, panelSelector, activeElementId, onDismiss } = {}) {
    let hoverPanel = false;
    let hoverInput = false;
    const isActive = () => (activeElementId ? isActiveElement(activeElementId) : false);
    const shouldStay = () => isActive() || hoverPanel || hoverInput;
    const bind = () => {
      if (inputSelector && s(inputSelector)) {
        s(inputSelector).onmouseover = () => {
          hoverInput = true;
        };
        s(inputSelector).onmouseout = () => {
          hoverInput = false;
        };
      }
      if (panelSelector && s(panelSelector)) {
        s(panelSelector).onmouseover = () => {
          hoverPanel = true;
        };
        s(panelSelector).onmouseout = () => {
          hoverPanel = false;
          if (activeElementId && s(`.${activeElementId}`) && s(`.${activeElementId}`).focus)
            s(`.${activeElementId}`).focus();
        };
      }
    };
    const checkDismiss = () => {
      if (!shouldStay()) onDismiss && onDismiss();
    };
    return { bind, shouldStay, checkDismiss };
  },
  // Generic click-outside binding to dismiss a panel/modal
  bindDismissOnDocumentClick: function ({ shouldStay, onDismiss } = {}) {
    if (typeof document === 'undefined') return () => {};
    const handler = () => {
      // Defer to allow hover flags to update first
      setTimeout(() => {
        if (!shouldStay || !shouldStay()) onDismiss && onDismiss();
      });
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  },
};

export { EventsUI };
