import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { s } from './VanillaJs.js';

const LogIn = {
  Event: {},
  Trigger: async function (options) {
    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
  },
  Render: async function () {
    setTimeout(() => {
      const formData = [
        { model: 'email', id: `log-in-email`, rules: [{ type: 'emptyField' }, { type: 'validEmail' }] },
        { model: 'password', id: `log-in-password`, rules: [{ type: 'emptyField' }] },
      ];
      const validators = Validator.instance(formData);

      EventsUI.onClick(`.btn-log-in`, async (e) => {
        e.preventDefault();
        const { error, errorMessage } = await validators();
        if (error) return;
        const body = {};
        for (const inputData of formData) {
          if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
        }
        const result = await UserService.post({ id: 'auth', body });
        if (result.status === 'success') this.Trigger(result.data);
        NotificationManager.Push({
          html: Translate.Render(`${result.status}-user-log-in`),
          status: result.status,
        });
      });
    });
    return html`
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `log-in-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
            containerClass: 'inl section-mp container-component input-container',
            placeholder: true,
            autocomplete: 'email',
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `log-in-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('password')}`,
            containerClass: 'inl section-mp container-component input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await BtnIcon.Render({ class: 'btn-log-in', label: Translate.Render('log-in'), type: 'submit' })}
        </div>
      </form>
    `;
  },
};

export { LogIn };
