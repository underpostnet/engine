import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
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
    setTimeout(() => {
      const formData = [
        { model: 'username', id: `account-username`, rules: [{ type: 'emptyField' }] },
        { model: 'email', id: `account-email`, rules: [{ type: 'emptyField' }, { type: 'validEmail' }] },
        { model: 'password', id: `account-password`, rules: [{ type: 'emptyField' }] },
      ];
      const validators = Validator.instance(formData);

      for (const inputData of formData) {
        s(`.${inputData.id}`).value = user[inputData.model];
      }

      EventsUI.onClick(`.btn-account`, async (e) => {
        e.preventDefault();
        const { error, errorMessage } = await validators();
        if (error) return;
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
          })}
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
