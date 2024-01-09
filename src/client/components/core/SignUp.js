import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { s } from './VanillaJs.js';

const SignUp = {
  Render: async function () {
    setTimeout(() => {
      const formData = [
        { model: 'username', id: `sign-up-username`, rules: [{ type: 'emptyField' }] },
        { model: 'email', id: `sign-up-email`, rules: [{ type: 'emptyField' }, { type: 'validEmail' }] },
        { model: 'password', id: `sign-up-password`, rules: [{ type: 'emptyField' }] },
        {
          id: `sign-up-repeat-password`,
          rules: [{ type: 'emptyField' }, { type: 'passwordMismatch', match: `sign-up-password` }],
        },
      ];
      const validators = Validator.instance(formData);

      EventsUI.onClick(`.btn-sign-up`, async (e) => {
        e.preventDefault();
        const validatorError = await validators();
        if (validatorError) return;
        const body = {};
        for (const inputData of formData) {
          if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
        }
        const result = await UserService.post(body);
        NotificationManager.Push({
          html: Translate.Render(`${result.status}-upload-user`),
          status: result.status,
        });
      });
    });
    return html`
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `sign-up-username`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('username')}`,
            containerClass: 'section-mp container-component input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `sign-up-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
            containerClass: 'section-mp container-component input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `sign-up-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('password')}`,
            containerClass: 'section-mp container-component input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `sign-up-repeat-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('repeat')} ${Translate.Render('password')}`,
            containerClass: 'section-mp container-component input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">${await BtnIcon.Render({ class: 'btn-sign-up', label: Translate.Render('sign-up') })}</div>
      </form>
    `;
  },
};

export { SignUp };
