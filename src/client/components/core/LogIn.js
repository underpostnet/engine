import { CoreService, getApiBaseUrl } from '../../services/core/core.service.js';
import { FileService } from '../../services/file/file.service.js';
import { UserService } from '../../services/user/user.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { loggerFactory } from './Logger.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { htmls, s } from './VanillaJs.js';
import { Webhook } from './Webhook.js';

const logger = loggerFactory(import.meta);

const LogIn = {
  Scope: {
    user: {
      main: {
        model: {
          user: {},
        },
      },
    },
  },
  Event: {},
  Trigger: async function (options) {
    const { user } = options;
    if (user) this.Scope.user.main.model.user = { ...this.Scope.user.main.model.user, ...user };

    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
    if (!user || user.role === 'guest') return;
    await Webhook.register({ user });
    if (s(`.session`))
      htmls(
        `.session`,
        html`<style>
          .session-in-log-in {
            display: block;
          }
          .session-inl-log-in {
            display: inline-table;
          }
          .session-fl-log-in {
            display: flow-root;
          }
          .session-in-log-out {
            display: none;
          }
          .session-inl-log-out {
            display: none;
          }
          .session-fl-log-out {
            display: none;
          }
        </style>`,
      );
    if (!this.Scope.user.main.model.user.profileImage) {
      try {
        const resultFile = await FileService.get({ id: user.profileImageId });
        if (resultFile && resultFile.status === 'success' && resultFile.data[0]) {
          const imageData = resultFile.data[0];
          let imageSrc = null;

          try {
            // Handle new metadata-only format
            if (!imageData.data?.data && imageData._id) {
              // Use blob endpoint for metadata-only format
              imageSrc = getApiBaseUrl({ id: imageData._id, endpoint: 'file/blob' });
            }
            // Handle legacy format with buffer data
            else if (imageData.data?.data) {
              const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });
              const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });
              imageSrc = URL.createObjectURL(imageFile);
            }

            if (imageSrc) {
              this.Scope.user.main.model.user.profileImage = {
                resultFile,
                imageData,
                imageSrc,
              };
            }
          } catch (error) {
            logger.warn('Error processing profile image:', error);
            // Continue without profile image - not fatal
          }
        }
      } catch (error) {
        logger.warn('Error fetching profile image:', error);
        // Continue without profile image - not fatal
      }
      htmls(
        `.action-btn-profile-log-in-render`,
        html`<div class="abs center top-box-profile-img-container">
          <img
            class="abs center top-box-profile-img"
            ${this.Scope.user.main.model.user.profileImage
              ? `src="${this.Scope.user.main.model.user.profileImage.imageSrc}"`
              : ``}
          />
        </div>`,
      );
    }
  },
  Render: async function () {
    setTimeout(async () => {
      const formData = [
        { model: 'email', id: `log-in-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
        { model: 'password', id: `log-in-password`, rules: [{ type: 'isEmpty' }] },
      ];
      const validators = await Validator.instance(formData);

      EventsUI.onClick(`.btn-log-in`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const body = {};
        for (const inputData of formData) {
          if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
        }
        const result = await UserService.post({ id: 'auth', body });

        if (result.status === 'error' && result.message.match('attempts')) {
          htmls(`.login-attempt-warn-value`, result.message.split(':')[1]);
          s(`.login-attempt-warn-container`).classList.remove('hide');
        } else s(`.login-attempt-warn-container`).classList.add('hide');

        if (result.status === 'error' && result.message.match('locked')) {
          htmls(`.login-attempt-warn-value0`, result.message.split(':')[1]);
          s(`.login-attempt-warn-container0`).classList.remove('hide');
        } else s(`.login-attempt-warn-container0`).classList.add('hide');

        if (result.status === 'success') await Auth.sessionIn(result);
        NotificationManager.Push({
          html: result.status === 'success' ? Translate.Render(`${result.status}-user-log-in`) : result.message,
          status: result.status,
        });
      });
      s(`.btn-log-in-forgot-password`).onclick = () => {
        s(`.main-btn-recover`).click();
      };

      s(`.btn-log-in-i-not-have-account`).onclick = () => {
        s(`.main-btn-sign-up`).click();
      };
    });
    return html`
      <div class="in">
        ${await BtnIcon.Render({
          class: 'in section-mp form-button btn-log-in-i-not-have-account',
          label: html`<i class="fas fa-user-plus"></i> ${Translate.Render(`i-not-have-account`)}
            <br />
            ${Translate.Render(`sign-up`)}`,
          type: 'button',
        })}
      </div>
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `log-in-email`,
            type: 'email',
            label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
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
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await BtnIcon.Render({
            class: 'in section-mp form-button btn-log-in-forgot-password',
            label: html`<i class="fas fa-question-circle"></i> ${Translate.Render(`forgot-password`)}`,
            type: 'button',
          })}
        </div>
        <div class="in section-mp form-button login-attempt-warn-container hide">
          <i class="fa-solid fa-triangle-exclamation"></i> ${Translate.Render('login-attempts-remaining')}
          <span style="color: #ed9d0f" class="login-attempt-warn-value"></span>
        </div>
        <div class="in section-mp form-button login-attempt-warn-container0 hide">
          <i class="fa-solid fa-triangle-exclamation"></i> ${Translate.Render('account-locked-try-again-in')}
          <span style="color: #ed9d0f" class="login-attempt-warn-value0"></span>
        </div>

        <div class="in">
          ${await BtnIcon.Render({
            class: 'in section-mp form-button btn-log-in',
            label: Translate.Render('log-in'),
            type: 'submit',
          })}
        </div>
      </form>
    `;
  },
};

export { LogIn };
