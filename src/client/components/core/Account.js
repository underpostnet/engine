import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
import { newInstance } from './CommonJs.js';
import { renderStatus } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { htmls, s } from './VanillaJs.js';

const Account = {
  UpdateEvent: {},
  Render: async function (options = { user: {} }) {
    let { user } = options;
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
      let lastUser;
      EventsUI.onClick(`.btn-account`, async (e) => {
        e.preventDefault();
        lastUser = newInstance(user);
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
          user = result.data;
          this.triggerUpdateEvent({ user });
          if (lastUser.emailConfirmed !== user.emailConfirmed) {
            this.renderVerifyEmailStatus(user);
          }
          lastUser = newInstance(user);
        }
      });

      EventsUI.onClick(`.btn-confirm-email`, async (e) => {
        e.preventDefault();
        const result = await UserService.post({
          id: 'mailer/verify-email',
          body: { email: s(`.account-email`).value },
        });
        NotificationManager.Push({
          html: result.status === 'error' ? result.message : Translate.Render(`email send`),
          status: result.status,
        });
      });
      this.renderVerifyEmailStatus(user);
    });
    return html`
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `account-username`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('username')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            disabled: false,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `account-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            autocomplete: 'email',
            disabled: false,
            footer: html``,
          })}
        </div>
        <div class="in ${options.disabled ? (options.disabled.includes('emailConfirm') ? 'hide' : '') : ''}">
          <div class="in section-mp width-mini-box sub-container">
            <div class="in verify-email-status"></div>
            ${await BtnIcon.Render({
              class: `in inside-input-btn btn-confirm-email`,
              type: 'button',
              label: html`<i class="fa-solid fa-paper-plane"></i> ${Translate.Render('send')}
                ${Translate.Render('verify-email')}`,
            })}
          </div>
        </div>
        <div class="in">
          ${await Input.Render({
            id: `account-password`,
            type: 'password',
            autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('password')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            disabled: true,
          })}
        </div>
        <div class="in">
          ${await BtnIcon.Render({
            class: 'section-mp form-button btn-account',
            label: Translate.Render('update'),
            type: 'submit',
          })}
        </div>
      </form>
    `;
  },
  triggerUpdateEvent: async function (options = { user: {} }) {
    for (const updateEvent of Object.keys(this.UpdateEvent)) {
      await this.UpdateEvent[updateEvent](options);
    }
  },
  renderVerifyEmailStatus: function (user) {
    if (s('.verify-email-status')) {
      if (s(`.btn-confirm-email`)) {
        if (user.emailConfirmed) s(`.btn-confirm-email`).classList.add('hide');
        else s(`.btn-confirm-email`).classList.remove('hide');
      }
      htmls(
        '.verify-email-status',
        html`${renderStatus(user.emailConfirmed ? 'success' : 'error', { class: 'inl' })} ${Translate.Render('email')}
        ${Translate.Render(user.emailConfirmed ? 'confirmed' : 'unconfirmed')}`,
      );
    }
  },
};

export { Account };
