import { getId } from './CommonJs.js';
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
              z-index: 1;
            }
            .notification-board {
              background: black;
              padding: 3px;
              color: white;
            }
          `}
        </style>
        <div class="fix notification-board-container"></div>
      `
    );
  },
  Tokens: {},
  Push: function (options) {
    const idNotification = getId(this.Tokens, 'board-notification-');
    prepend(
      '.notification-board-container',
      html`<div class="in notification-board ${idNotification}">
        ${new Date().toISOString()}<br />
        ${options.html}
      </div>`
    );
    setTimeout(() => {
      s(`.${idNotification}`).remove();
    }, 2500);
  },
};

export { NotificationManager };
