import { CoreService } from '../../services/core/core.service.js';
import { FileService } from '../../services/file/file.service.js';
import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
import { newInstance } from './CommonJs.js';
import { dynamicCol, renderStatus, renderWave } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { fileFormDataFactory, Input } from './Input.js';
import { LogIn } from './LogIn.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { append, htmls, s } from './VanillaJs.js';

const Account = {
  UpdateEvent: {},
  Render: async function (options = { user: {}, bottomRender: async () => '', idModal: '' }) {
    // app profile page design example
    // CSS animated backgrounds
    let { user, idModal } = options;
    const waveAnimationId = 'account-wave';
    const profileFileAccept = ['image/png', 'image/jpeg'];
    setTimeout(async () => {
      if (LogIn.Scope.user.main.model.user.profileImage) {
        append(
          `.wave-animation-container-${waveAnimationId}`,
          html` <div class="abs center account-profile-image-container">
              <img
                class="abs center account-profile-image"
                style="opacity: 1"
                src="${LogIn.Scope.user.main.model.user.profileImage.imageSrc}"
              />
            </div>
            <div class="abs center account-profile-image-loading" style="color: white"></div>`,
        );
      }

      const formData = [
        {
          model: 'username',
          id: `account-username`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 5, max: 20 } }],
        },
        { model: 'email', id: `account-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
        {
          model: 'password',
          defaultValue: '*******',
          id: `account-password`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 5, max: 20 } }],
        },
      ];
      const validators = await Validator.instance(formData);

      for (const inputData of formData) {
        s(`.${inputData.id}`).value =
          !user[inputData.model] && inputData.defaultValue ? inputData.defaultValue : user[inputData.model];
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

      if (s(`.btn-confirm-email`))
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

      s(`.${waveAnimationId}`).style.cursor = 'pointer';
      s(`.${waveAnimationId}`).onclick = async (e) => {
        s(`.account-profile-image-input`).click();
      };
      EventsUI.onChange(
        `.account-profile-image-input`,
        async (e) => {
          s(`.account-profile-image`).style.opacity = 0;
          const formFile = fileFormDataFactory(e, profileFileAccept);

          const { status, data } = await UserService.put({
            id: `profile-image/${user._id}`,
            body: formFile,
            headerId: 'file',
          });

          if (status === 'success') {
            user.profileImageId = data.profileImageId;
            delete LogIn.Scope.user.main.model.user.profileImage;
            await LogIn.Trigger({ user });
            s(`.account-profile-image`).src = LogIn.Scope.user.main.model.user.profileImage.imageSrc;
          } else {
            NotificationManager.Push({
              html: Translate.Render('file-upload-failed'),
              status: 'error',
            });
          }

          s(`.account-profile-image`).style.opacity = 1;
        },
        `.account-profile-image-loading`,
      );
    });
    return html`
      <input type="file" accept="${profileFileAccept.join(', ')}" class="account-profile-image-input hide" />
      ${renderWave({ id: waveAnimationId })}

      <div class="fl">
        <form class="in fll account-dynamicCol-col-b">
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
              extension: !(options && options.disabled && options.disabled.includes('emailConfirm'))
                ? async () => html`<div class="in verify-email-status"></div>
                    ${await BtnIcon.Render({
                      class: `wfa btn-input-extension btn-confirm-email`,
                      type: 'button',
                      style: 'text-align: left',
                      label: html`<div class="in">
                        <i class="fa-solid fa-paper-plane"></i> ${Translate.Render('send')}
                        ${Translate.Render('verify-email')}
                      </div> `,
                    })}`
                : undefined,
            })}
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
              disabledEye: true,
            })}
          </div>
          ${options?.bottomRender ? await options.bottomRender() : ``}
          <div class="in">
            ${await BtnIcon.Render({
              class: 'section-mp form-button btn-account',
              label: Translate.Render('update'),
              type: 'submit',
            })}
          </div>
        </form>
      </div>
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
