import { BtnIcon } from './BtnIcon.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';

const LogOut = {
  Event: {},
  Trigger: async function (options) {
    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
  },
  Render: async function () {
    setTimeout(() => {
      s('.btn-log-out').onclick = () => LogOut.Trigger();
    });
    return html` <div class="in warn-logout">${Translate.Render('confirm-logout')}</div>
      <div class="in warn-logout">
        ${await BtnIcon.Render({
          class: 'btn-custom btn-log-out',
          label: Translate.Render('log-out'),
        })}
      </div>`;
  },
};

export { LogOut };
