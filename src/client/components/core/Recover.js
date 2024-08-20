import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { LogIn } from './LogIn.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { s } from './VanillaJs.js';

const Recover = {
  Event: {},
  Trigger: async function (options) {
    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
  },
  Render: async function (options = { idModal: '', user: {}, bottomRender: async () => '' }) {
    const { idModal, user } = options;
    setTimeout(async () => {
      const formData = [
        {
          model: 'username',
          id: `recover-username`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 2, max: 20 } }],
        },
        { model: 'email', id: `recover-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
        {
          model: 'password',
          id: `recover-password`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 2, max: 20 } }],
        },
        {
          id: `recover-repeat-password`,
          rules: [{ type: 'isEmpty' }, { type: 'passwordMismatch', options: `recover-password` }],
        },
      ];
      const validators = await Validator.instance(formData);

      EventsUI.onClick(`.btn-recover`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const body = {};
        for (const inputData of formData) {
          if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
        }
        // const result = await UserService.post({ body });
        // NotificationManager.Push({
        //   html: result.status,
        //   status: result.status,
        // });
      });
      s(`.btn-recover-log-in`).onclick = () => {
        s(`.main-btn-log-in`).click();
      };
    });
    return html`
      ${await BtnIcon.Render({
        class: 'section-mp form-button btn-recover-log-in',
        label: Translate.Render('log-in'),
        type: 'button',
      })}
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `recover-username`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('username')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `recover-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            autocomplete: 'email',
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `recover-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('password')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `recover-repeat-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('repeat')} ${Translate.Render('password')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        ${options?.bottomRender ? await options.bottomRender() : ``}
        <div class="in">
          ${await BtnIcon.Render({
            class: 'section-mp form-button btn-recover',
            label: Translate.Render('recover'),
            type: 'submit',
          })}
        </div>
      </form>
    `;
  },
};

export { Recover };
