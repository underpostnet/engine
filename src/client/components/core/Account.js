import { CoreService } from '../../services/core/core.service.js';
import { FileService } from '../../services/file/file.service.js';
import { UserService } from '../../services/user/user.service.js';
import { BtnIcon } from './BtnIcon.js';
import { newInstance } from './CommonJs.js';
import { dynamicCol, renderStatus } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { htmls, s } from './VanillaJs.js';

const Account = {
  UpdateEvent: {},
  Render: async function (options = { user: {}, bottomRender: async () => '', idModal: '' }) {
    // app profile page design example
    // CSS animated backgrounds
    let { user, idModal } = options;
    setTimeout(async () => {
      if (user.profileImageId) {
        const resultFile = await FileService.get({ id: user.profileImageId });

        const imageData = resultFile.data[0];

        const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });

        const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });

        const imageSrc = URL.createObjectURL(imageFile);

        const rawSvg = await CoreService.getRaw({ url: imageSrc });

        htmls(
          `.account-profile-image-render`,
          rawSvg.replace(`<svg`, `<svg class="abs account-profile-image" `).replace(`#5f5f5f`, `#ffffffc8`),
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
    });
    return html`
      <style>
        .wave-animation-container {
          height: 200px;
        }
        .wave-animation-container {
          background: linear-gradient(
            315deg,
            rgba(101, 0, 94, 1) 3%,
            rgba(60, 132, 206, 1) 38%,
            rgba(48, 238, 226, 1) 68%,
            rgba(255, 25, 25, 1) 98%
          );
          animation: gradient 15s ease infinite;
          background-size: 400% 400%;
          overflow: hidden;
        }

        @keyframes gradient {
          0% {
            background-position: 0% 0%;
          }
          50% {
            background-position: 100% 100%;
          }
          100% {
            background-position: 0% 0%;
          }
        }

        .wave {
          background: rgb(255 255 255 / 25%);
          border-radius: 1000% 1000% 0 0;
          width: 200%;
          height: 12em;
          animation: wave 10s -3s linear infinite;
          opacity: 0.8;
          bottom: 0;
          left: 0;
          top: 30%;
        }

        .wave:nth-of-type(2) {
          animation: wave 18s linear reverse infinite;
          opacity: 0.8;
          top: 50%;
        }

        .wave:nth-of-type(3) {
          animation: wave 20s -1s reverse infinite;
          opacity: 0.9;
          top: 70%;
        }

        @keyframes wave {
          2% {
            transform: translateX(1);
          }

          25% {
            transform: translateX(-25%);
          }

          50% {
            transform: translateX(-50%);
          }

          75% {
            transform: translateX(-25%);
          }

          100% {
            transform: translateX(1);
          }
        }

        .account-profile-image {
          top: 0px;
        }
      </style>
      <div class="in wave-animation-container">
        <div class="in wave"></div>
        <div class="abs wave"></div>
        <div class="abs wave"></div>
        <div class="account-profile-image-render"></div>
      </div>
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
