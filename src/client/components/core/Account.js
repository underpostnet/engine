import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
import { renderStatus } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { s } from './VanillaJs.js';

const Account = {
  UpdateEvent: {},
  Render: async function (options = { user: {} }) {
    const { user } = options;
    setTimeout(async () => {
      const formData = [
        {
          model: 'username',
          id: `account-username`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 5, max: 20 } }],
        },
        { model: 'email', id: `account-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
        {
          model: 'password',
          id: `account-password`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 5, max: 20 } }],
        },
      ];
      const validators = await Validator.instance(formData);

      for (const inputData of formData) {
        s(`.${inputData.id}`).value = user[inputData.model];
      }

      EventsUI.onClick(`.btn-account`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const body = {};
        for (const inputData of formData) {
          if (!s(`.${inputData.id}`).value || s(`.${inputData.id}`).value === 'undefined') continue;
          if ('model' in inputData) {
            body[inputData.model] = s(`.${inputData.id}`).value;
            user[inputData.model] = s(`.${inputData.id}`).value;
          }
        }
        const result = await UserService.put({ id: user._id, body });
        NotificationManager.Push({
          html:
            result.status === 'error' && result.message
              ? result.message
              : Translate.Render(`${result.status}-update-user`),
          status: result.status,
        });
        if (result.status === 'success') {
          for (const updateEvent of Object.keys(this.UpdateEvent)) {
            await this.UpdateEvent[updateEvent]({ user });
          }
        }
      });

      EventsUI.onClick(`.btn-confirm-email`, async (e) => {
        e.preventDefault();
        const result = await UserService.post({ id: 'mailer/verify-email' });
      });
    });
    return html`
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `account-username`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('username')}`,
            containerClass: 'inl section-mp container-component input-container',
            placeholder: true,
            disabled: false,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `account-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
            containerClass: 'inl section-mp container-component input-container',
            placeholder: true,
            autocomplete: 'email',
            disabled: false,
            footer: html``,
          })}
        </div>
        <div class="in">
          <div class="in section-mp container-component sub-container">
            <div class="in">
              ${renderStatus(user.emailConfirmed ? 'success' : 'error', { class: 'inl' })} ${Translate.Render('email')}
              ${Translate.Render(user.emailConfirmed ? 'confirmed' : 'unconfirmed')}
            </div>
            ${!user.emailConfirmed
              ? await BtnIcon.Render({
                  class: 'in inside-input-btn btn-confirm-email',
                  label: html`<i class="fa-solid fa-paper-plane"></i> ${Translate.Render('send')}
                    ${Translate.Render('verify-email')}`,
                })
              : ''}
          </div>
        </div>
        <div class="in">
          ${await Input.Render({
            id: `account-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('password')}`,
            containerClass: 'inl section-mp container-component input-container',
            placeholder: true,
            disabled: true,
          })}
        </div>
        <div class="in">
          ${await BtnIcon.Render({ class: 'btn-account', label: Translate.Render('update'), type: 'submit' })}
        </div>
      </form>
    `;
  },
};

export { Account };
