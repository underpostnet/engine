import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { LogIn } from './LogIn.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { s } from './VanillaJs.js';

const SignUp = {
  Event: {},
  Trigger: async function (options) {
    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
  },
  Render: async function () {
    setTimeout(async () => {
      const formData = [
        {
          model: 'username',
          id: `sign-up-username`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 5, max: 20 } }],
        },
        { model: 'email', id: `sign-up-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
        {
          model: 'password',
          id: `sign-up-password`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 5, max: 20 } }],
        },
        {
          id: `sign-up-repeat-password`,
          rules: [{ type: 'isEmpty' }, { type: 'passwordMismatch', options: `sign-up-password` }],
        },
      ];
      const validators = await Validator.instance(formData);

      EventsUI.onClick(`.btn-sign-up`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const body = {};
        for (const inputData of formData) {
          if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
        }
        const result = await UserService.post({ body });
        NotificationManager.Push({
          html: typeof result.data === 'string' ? result.data : Translate.Render(`${result.status}-upload-user`),
          status: result.status,
        });
        if (result.status === 'success') {
          await this.Trigger(result.data);
          await LogIn.Trigger(result.data);
        }
      });
    });
    return html`
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `sign-up-username`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('username')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `sign-up-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            autocomplete: 'email',
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `sign-up-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('password')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `sign-up-repeat-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('repeat')} ${Translate.Render('password')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await BtnIcon.Render({
            class: 'btn-custom btn-sign-up',
            label: Translate.Render('sign-up'),
            type: 'submit',
          })}
        </div>
      </form>
    `;
  },
};

export { SignUp };
