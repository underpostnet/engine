import { UserService } from '../../services/user/user.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { newInstance, s4 } from './CommonJs.js';
import { renderStatus, renderWave } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { fileFormDataFactory, Input } from './Input.js';
import { LogIn } from './LogIn.js';
import { Modal } from './Modal.js';
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
      append(
        `.wave-animation-container-${waveAnimationId}`,
        html` <div class="abs center account-profile-image-container">
            <img
              class="abs center account-profile-image"
              style="opacity: 1"
              ${LogIn.Scope.user.main.model.user.profileImage
                ? `src="${LogIn.Scope.user.main.model.user.profileImage.imageSrc}"`
                : ''}
            />
          </div>
          <div class="abs center account-profile-image-loading" style="color: white"></div>`,
      );

      const formData = [
        {
          model: 'username',
          id: `account-username`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 2, max: 20 } }],
        },
        { model: 'email', id: `account-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
        {
          model: 'password',
          defaultValue: '*******',
          id: `account-password`,
          rules: [{ type: 'isStrongPassword' }],
        },
      ];

      this.formData = formData;

      this.instanceModalUiEvents = async ({ user }) => {
        const validators = await Validator.instance(formData);

        for (const inputData of formData) {
          s(`.${inputData.id}`).value =
            !user[inputData.model] && inputData.defaultValue ? inputData.defaultValue : user[inputData.model];
        }
        let lastUser;
        const submit = async () => {
          lastUser = newInstance(user);
          const { successKeys } = await validators();
          if (successKeys.length === 0) return;
          const body = {};
          for (const inputData of formData) {
            if (!s(`.${inputData.id}`).value || s(`.${inputData.id}`).value === 'undefined') continue;
            if ('model' in inputData && successKeys.includes(inputData.id)) {
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
        };
        EventsUI.onClick(`.btn-account`, async (e) => {
          e.preventDefault();
          await submit();
        });
        EventsUI.onClick(`.btn-account-update-username`, async (e) => {
          e.preventDefault();
          await submit();
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
          e.preventDefault();
          s(`.account-profile-image-input`).click();
        };
        EventsUI.onChange(
          `.account-profile-image-input`,
          async (e) => {
            e.preventDefault();
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
          { loadingContainer: `.account-profile-image-loading` },
        );
        s(`.btn-account-change-password`).onclick = (e) => {
          e.preventDefault();
          // s(`.btn-close-modal-account`).click();
          s(`.main-btn-recover`).click();
        };
        s(`.btn-account-delete-confirm`).onclick = async (e) => {
          e.preventDefault();
          const confirmResult = await Modal.RenderConfirm({
            html: async () => {
              return html`
                <div class="in section-mp" style="text-align: center">
                  ${Translate.Render('confirm-delete-account')}
                </div>
              `;
            },
            id: 'delete-account-modal',
          });
          if (confirmResult.status === 'cancelled') return;
          s(`.btn-account-delete-confirm`).classList.add('hide');
          s(`.btn-account-delete`).classList.remove('hide');
          s(`.btn-account-delete`).click();
        };
        EventsUI.onClick(`.btn-account-delete`, async (e) => {
          e.preventDefault();
          const result = await UserService.delete({ id: user._id });
          NotificationManager.Push({
            html: result.status === 'error' ? result.message : Translate.Render(`success-delete-account`),
            status: result.status,
          });
          s(`.btn-account-delete-confirm`).classList.remove('hide');
          s(`.btn-account-delete`).classList.add('hide');
          if (result.status === 'success') {
            Modal.onHomeRouterEvent();
            await Auth.sessionOut();
          }
        });
      };
      await this.instanceModalUiEvents({ user });
    });
    return html`
      <input type="file" accept="${profileFileAccept.join(', ')}" class="account-profile-image-input hide" />
      ${renderWave({ id: waveAnimationId })}

      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `account-username`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('username')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            disabled: false,
            extension: async () =>
              html`${await BtnIcon.Render({
                class: `wfa btn-input-extension btn-account-update-username`,
                type: 'button',
                style: 'text-align: left',
                label: html`${Translate.Render(`update`)}`,
              })}`,
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
            disabled: user.emailConfirmed,
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
            extension: async () =>
              html`${await BtnIcon.Render({
                class: `wfa btn-input-extension btn-account-change-password`,
                type: 'button',
                style: 'text-align: left',
                label: html`${Translate.Render(`change-password`)}`,
              })}`,
          })}
        </div>
        ${options?.bottomRender ? await options.bottomRender() : ``}
        <div class="in hide">
          ${await BtnIcon.Render({
            class: 'in section-mp form-button btn-account',
            label: Translate.Render('update'),
            type: 'submit',
          })}
        </div>
      </form>
      <div class="in">
        ${await BtnIcon.Render({
          class: 'in section-mp form-button btn-account-delete hide',
          label: html` ${Translate.Render(`delete-account`)}`,
          type: 'button',
          style: 'color: #5f5f5f',
        })}
        ${await BtnIcon.Render({
          class: 'in section-mp form-button btn-account-delete-confirm',
          label: html` ${Translate.Render(`delete-account`)}`,
          type: 'button',
          style: 'color: #5f5f5f',
        })}
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
      if (user.emailConfirmed === true) s(`.account-email`).setAttribute('disabled', '');
    }
  },
  instanceModalUiEvents: async (user) => null,
  updateForm: async function (user) {
    if (!s(`.modal-account`)) return;
    await this.instanceModalUiEvents({ user });
    s(`.account-profile-image`).style.opacity = 0;
    for (const inputData of this.formData)
      if (s(`.${inputData.id}`)) s(`.${inputData.id}`).value = user[inputData.model];
    if (LogIn.Scope.user.main.model.user.profileImage) {
      s(`.account-profile-image`).src = LogIn.Scope.user.main.model.user.profileImage.imageSrc;
      s(`.account-profile-image`).style.opacity = 1;
    }
  },
};

export { Account };
