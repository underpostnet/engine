import { getId, getIsoDate } from './CommonJs.js';
import { Css, Themes } from './Css.js';
import { Modal } from './Modal.js';
import { append, prepend, s } from './VanillaJs.js';

const NotificationManager = {
  Types: ['success', 'error', 'warning', 'info'],
  RenderBoard: async function () {
    append(
      'body',
      html`
        <style>
          ${css`
            .notification-board-container {
              right: 5px;
              width: 300px;
              bottom: 5px;
              z-index: 4;
            }
            .notification-board-title {
              padding: 5px;
            }
          `}
        </style>
        <div class="fix notification-board-container"></div>
      `,
    );
  },
  Tokens: {},
  Push: async function (options = { status: '', html: '' }) {
    const { barConfig } = await Themes[Css.currentTheme](); // newInstance
    barConfig.buttons.maximize.disabled = true;
    barConfig.buttons.minimize.disabled = true;
    barConfig.buttons.restore.disabled = true;
    barConfig.buttons.menu.disabled = true;
    const idNotification = getId(this.Tokens, 'board-notification-');
    this.Tokens[idNotification] = {};
    await Modal.Render({
      title: html`<div class="in notification-manager-date">${getIsoDate(new Date())}</div>
        ${options.html}`,
      html: '',
      id: idNotification,
      selector: `.notification-board-container`,
      class: 'in',
      titleClass: 'notification-board-title',
      renderType: 'prepend',
      barConfig,
      style: {
        width: '300px',
      },
      mode: 'dropNotification',
      status: options.status,
    });
    setTimeout(() => {
      if (s(`.btn-close-${idNotification}`)) s(`.btn-close-${idNotification}`).click();
    }, 2000);
  },
};

export { NotificationManager };
