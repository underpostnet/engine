import { UserService } from '../../services/user/user.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { LogIn } from './LogIn.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { getProxyPath, getQueryParams, s } from './VanillaJs.js';

const Recover = {
  Event: {},
  Trigger: async function (options) {
    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
  },
  Render: async function (options = { idModal: '', user: {}, bottomRender: async () => '' }) {
    const { idModal, user } = options;
    let mode = 'recover-verify-email';
    const recoverToken = getQueryParams().payload;
    const formData = {
      'recover-username': {
        model: 'username',
        id: `recover-username`,
        rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 2, max: 20 } }],
        show: () => false,
        disable: function () {
          return !this.show();
        },
      },
      'recover-email': {
        model: 'email',
        id: `recover-email`,
        rules: [{ type: 'isEmpty' }, { type: 'isEmail' }],
        show: () => mode === 'recover-verify-email',
        disable: function () {
          return !this.show();
        },
      },
      'recover-password': {
        model: 'password',
        id: `recover-password`,
        rules: [{ type: 'isStrongPassword' }],
        show: () => mode === 'change-password',
        disable: function () {
          return !this.show();
        },
      },
      'recover-repeat-password': {
        id: `recover-repeat-password`,
        rules: [{ type: 'isEmpty' }, { type: 'passwordMismatch', options: `recover-password` }],
        show: () => mode === 'change-password',
        disable: function () {
          return !this.show();
        },
      },
    };

    if (recoverToken) {
      mode = 'change-password';
    }

    setTimeout(async () => {
      if (user && user.email) {
        s(`.recover-email`).value = user.role === 'guest' ? '' : user.email;
        if (user.emailConfirmed) s(`.recover-email`).setAttribute('disabled', '');
      }

      const validators = await Validator.instance(formData);

      EventsUI.onClick(`.btn-recover`, async (e) => {
        e.preventDefault();
        s(`.recover-resend-btn-container`).classList.add('hide');
        s(`.recover-send-btn-container`).classList.remove('hide');
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const body = {};
        for (const inputData of Object.values(formData)) {
          if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
        }
        switch (mode) {
          case 'recover-verify-email': {
            body.proxyPath = getProxyPath();
            body.hostname = `${location.hostname}`;
            const result = await UserService.post({ id: 'recover-verify-email', body });
            NotificationManager.Push({
              html:
                result.status === 'error' ? result.message : Translate.Render(`${result.status}-recover-verify-email`),
              status: result.status,
            });
            if (result.status === 'success') {
              s(`.recover-send-btn-container`).classList.add('hide');
              s(`.recover-resend-btn-container`).classList.remove('hide');
            }
            break;
          }
          case 'change-password': {
            const result = await UserService.put({ id: `recover/${recoverToken}`, body });
            NotificationManager.Push({
              html:
                typeof result.data === 'string' ? result.data : Translate.Render(`${result.status}-recover-password`),
              status: result.status,
            });
            if (result.status === 'success') {
              if (Auth.getToken()) {
                s(`.btn-close-modal-recover`).click();
                s(`.main-btn-account`).click();
              } else {
                s(`.btn-recover`).classList.add('hide');
                s(`.input-container-recover-password`).classList.add('hide');
                s(`.input-container-recover-repeat-password`).classList.add('hide');
                s(`.btn-recover-log-in`).classList.remove('hide');
              }
              this.Trigger({ user: result.data });
            }
            break;
          }
        }
      });
      s(`.btn-recover-resend`).onclick = (e) => {
        e.preventDefault();
        s(`.btn-recover`).click();
      };
      s(`.btn-recover-log-in`).onclick = () => {
        s(`.btn-close-modal-recover`).click();
        s(`.main-btn-log-in`).click();
      };
    });
    return html`
      ${await BtnIcon.Render({
        class: 'in section-mp form-button btn-recover-log-in hide',
        label: Translate.Render('log-in'),
        type: 'button',
      })}
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `recover-username`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('username')}`,
            containerClass: `inl section-mp width-mini-box input-container ${
              formData[`recover-username`].show() ? '' : 'hide'
            }`,
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `recover-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
            containerClass: `inl section-mp width-mini-box input-container ${
              formData[`recover-email`].show() ? '' : 'hide'
            }`,
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
            containerClass: `inl section-mp width-mini-box input-container ${
              formData[`recover-password`].show() ? '' : 'hide'
            }`,
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `recover-repeat-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('repeat')} ${Translate.Render('password')}`,
            containerClass: `inl section-mp width-mini-box input-container ${
              formData[`recover-repeat-password`].show() ? '' : 'hide'
            }`,
            placeholder: true,
          })}
        </div>
        ${options?.bottomRender ? await options.bottomRender() : ``}
        <div class="in recover-send-btn-container">
          ${await BtnIcon.Render({
            class: 'in section-mp form-button btn-recover',
            label: Translate.Render(mode === 'recover-verify-email' ? 'send-recover-verify-email' : 'change-password'),
            type: 'button',
          })}
        </div>
        <div class="in recover-resend-btn-container hide">
          <div class="in section-mp form-button" style="color: #ed9d0f">
            <i class="fa-solid fa-triangle-exclamation"></i> ${Translate.Render('15-min-valid-recover-email')}
          </div>
          ${await BtnIcon.Render({
            class: 'in section-mp form-button btn-recover-resend',
            label: html`${Translate.Render('resend')} ${Translate.Render('recover-verify-email')}`,
            type: 'submit',
          })}
        </div>
      </form>
    `;
  },
};

export { Recover };
