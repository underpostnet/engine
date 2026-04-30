import { UserService } from '../../services/user/user.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { s } from './VanillaJs.js';
class SignUp {
  static Event = {};
  static async Trigger(options) {
    for (const eventKey of Object.keys(SignUp.Event)) await SignUp.Event[eventKey](options);
  }
  static async instance(options = { bottomRender: async () => '' }) {
    setTimeout(async () => {
      const formData = [
        {
          model: 'username',
          id: `sign-up-username`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 2, max: 20 } }, { type: 'isValidUsername' }],
        },
        { model: 'email', id: `sign-up-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
        {
          model: 'password',
          id: `sign-up-password`,
          rules: [{ type: 'isStrongPassword' }],
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
        const handleSignUpError = (data) => {
          let error = '';
          if (data.message) {
            if (data.message.match('duplicate')) {
              if (data.message.match('username')) error += Translate.instance('error-username-taken');
              if (data.message.match('email')) error += Translate.instance('error-email-taken');
            } else {
              if (data.message.match('username')) error += Translate.instance('error-username-invalid');
              if (data.message.match('email')) error += Translate.instance('error-email-invalid');
              if (data.message.match('password')) error += Translate.instance('error-password-invalid');
            }
            return error;
          }
          return Translate.instance('error-register-user');
        };
        NotificationManager.Push({
          html:
            typeof result.data === 'string'
              ? result.data
              : result.status === 'success'
                ? Translate.instance(`success-register-user`)
                : handleSignUpError(result),
          status: result.status,
        });
        if (result.status === 'success') {
          await Auth.sessionIn(result);
          setTimeout(() => {
            if (s(`.btn-close-${options.idModal}`)) s(`.btn-close-${options.idModal}`).click();
          });
        }
      });
      setTimeout(() => {
        s(`.btn-sign-up-i-have-account`).onclick = () => {
          s(`.main-btn-log-in`).click();
        };
      });
    });
    return html`
      ${await BtnIcon.instance({
        class: 'in section-mp form-button btn-sign-up-i-have-account',
        label: html`<i class="fas fa-sign-in-alt"></i> ${Translate.instance('i-have-account')}<br />${Translate.instance(
            'log-in',
          )}`,
        type: 'button',
      })}
      <form class="in">
        <div class="in">
          ${await Input.instance({
            id: `sign-up-username`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.instance('username')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.instance({
            id: `sign-up-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.instance('email')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            autocomplete: 'email',
          })}
        </div>
        <div class="in">
          ${await Input.instance({
            id: `sign-up-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.instance('password')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.instance({
            id: `sign-up-repeat-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.instance('repeat')}
              ${Translate.instance('password')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        ${options?.bottomRender ? await options.bottomRender() : ``}
        <div class="in">
          ${await BtnIcon.instance({
            class: 'in section-mp form-button btn-sign-up',
            label: Translate.instance('sign-up'),
            type: 'submit',
          })}
        </div>
      </form>
    `;
  }
}
export { SignUp };
