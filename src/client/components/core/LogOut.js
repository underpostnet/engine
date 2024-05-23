import { BtnIcon } from './BtnIcon.js';
import { Translate } from './Translate.js';
import { htmls, s } from './VanillaJs.js';

const LogOut = {
  Event: {},
  Trigger: async function (options) {
    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
    if (s(`.session`))
      htmls(
        `.session`,
        html`<style>
          .session-in-log-out {
            display: block;
          }
          .session-inl-log-out {
            display: inline-table;
          }
          .session-in-log-in {
            display: none;
          }
          .session-inl-log-in {
            display: none;
          }
        </style>`,
      );
  },
  Render: async function () {
    setTimeout(() => {
      s('.btn-log-out').onclick = () => LogOut.Trigger();
    });
    return html` <div class="in warn-logout">${Translate.Render('confirm-logout')}</div>
      <div class="in warn-logout">
        ${await BtnIcon.Render({
          class: 'section-mp form-button btn-log-out',
          label: Translate.Render('log-out'),
        })}
      </div>`;
  },
};

export { LogOut };
