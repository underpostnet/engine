import { getId, getIsoDate } from './CommonJs.js';
import { Css, Themes } from './Css.js';
import { Modal } from './Modal.js';
import { append, prepend, s } from './VanillaJs.js';

const NotificationManager = {
  Types: ['success', 'error', 'warning', 'info'],
  RenderBoard: async function (options) {
    this.options = options;
    append(
      'body',
      html`
        <style>
          .notification-board-container {
            right: 5px !important;
            width: 300px !important;
            bottom: ${5 + (options?.heightBottomBar ? options.heightBottomBar : 0)}px !important;
            z-index: 11 !important;
          }
          .notification-board-title {
            padding: 11px !important;
          }
          .notification-manager-date {
            font-size: 20px !important;
            color: #7a7a7a !important;
          }
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
  NotificationScheme: {
    // Visual Options
    body: '<String>',
    icon: '<URL String>',
    image: '<URL String>',
    badge: '<URL String>',
    dir: "<String of 'auto' | 'ltr' | 'rtl'>",
    timestamp: '<Long>',

    // Both visual & behavioral options
    actions: '<Array of Strings>',
    data: '<Anything>',

    // Behavioral Options
    tag: '<String>',
    requireInteraction: '<boolean>',
    renotify: '<Boolean>',
    vibrate: '<Array of Integers>',
    sound: '<URL String>',
    silent: '<Boolean>',
  },
};

export { NotificationManager };
