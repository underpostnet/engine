import { UserService } from '../../services/user/user.service.js';
import { FileService } from '../../services/file/file.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { newInstance, s4 } from './CommonJs.js';
import { renderStatus, renderWave } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { fileFormDataFactory, Input } from './Input.js';
import { LogIn } from './LogIn.js';
import { Modal } from './Modal.js';
import { NotificationManager } from './NotificationManager.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { append, htmls, s } from './VanillaJs.js';
import { getProxyPath } from './Router.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';
import { loggerFactory } from './Logger.js';

const logger = loggerFactory(import.meta);

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
                : `src="${getApiBaseUrl({
                    id: 'assets/avatar',
                    endpoint: 'user',
                  })}"`}
            />
          </div>
          <div class="abs center account-profile-image-loading" style="color: white"></div>`,
      );

      const formData = [
        {
          model: 'username',
          id: `account-username`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 2, max: 20 } }, { type: 'isValidUsername' }],
        },
        { model: 'email', id: `account-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
        {
          model: 'password',
          defaultValue: '#Changethis123',
          id: `account-password`,
          rules: [{ type: 'isStrongPassword' }],
        },
        {
          model: 'briefDescription',
          id: `account-brief-description`,
          defaultValue: 'Uploader',
          rules: [{ type: 'isLength', options: { min: 0, max: 200 } }],
        },
      ];

      this.formData = formData;

      this.instanceModalUiEvents = async ({ user }) => {
        const accountInstance = this;
        const validators = await Validator.instance(formData);

        for (const inputData of formData) {
          s(`.${inputData.id}`).value =
            !user[inputData.model] && inputData.defaultValue ? inputData.defaultValue : user[inputData.model];
        }
        let lastUser;
        const submit = async () => {
          // Always get the current user from LogIn.Scope to avoid stale closure references
          const currentUser = LogIn.Scope.user.main.model.user;
          if (!currentUser || !currentUser._id) {
            NotificationManager.Push({
              html: Translate.Render('error-user-not-authenticated'),
              status: 'error',
            });
            return;
          }
          // Guest users cannot submit form
          if (currentUser.role === 'guest') {
            NotificationManager.Push({
              html: Translate.Render('error-user-not-authenticated'),
              status: 'error',
            });
            return;
          }
          lastUser = newInstance(currentUser);
          const { successKeys, errorKeys, errorMessage } = await validators();
          if (errorMessage) {
            NotificationManager.Push({
              html: `${errorKeys.map((e) => Translate.Render(e.replace('account-', '')))} ${errorMessage}`,
            });
            return;
          }
          const body = {};
          for (const inputData of formData) {
            const value = s(`.${inputData.id}`).value;
            if (!value || value === 'undefined') continue;
            if ('model' in inputData && successKeys.includes(inputData.id)) {
              body[inputData.model] = value;
              currentUser[inputData.model] = value;
            }
          }
          const result = await UserService.put({ id: currentUser._id, body });
          NotificationManager.Push({
            html:
              result.status === 'error' && result.message
                ? result.message
                : Translate.Render(`${result.status}-update-user`),
            status: result.status,
          });
          if (result.status === 'success') {
            const updatedUser = result.data;
            // Preserve profileImage from scope if it exists
            const existingProfileImage = LogIn.Scope.user.main.model.user.profileImage;
            LogIn.Scope.user.main.model.user = { ...updatedUser };
            if (existingProfileImage && !updatedUser.profileImage) {
              LogIn.Scope.user.main.model.user.profileImage = existingProfileImage;
            }
            accountInstance.triggerUpdateEvent({ user: updatedUser });
            if (lastUser.emailConfirmed !== updatedUser.emailConfirmed) {
              accountInstance.renderVerifyEmailStatus(updatedUser);
            }
            lastUser = newInstance(updatedUser);
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
            // Check if user is authenticated
            const currentUser = LogIn.Scope.user.main.model.user;
            if (!currentUser || !currentUser._id) {
              NotificationManager.Push({
                html: Translate.Render('error-user-not-authenticated'),
                status: 'error',
              });
              return;
            }
            // Guest users cannot verify email
            if (currentUser.role === 'guest') {
              NotificationManager.Push({
                html: Translate.Render('error-user-not-authenticated'),
                status: 'error',
              });
              return;
            }
            const result = await UserService.post({
              id: 'mailer/verify-email',
              body: {
                email: s(`.account-email`).value,
                hostname: `${location.hostname}`,
                proxyPath: getProxyPath(),
              },
            });
            NotificationManager.Push({
              html: result.status === 'error' ? result.message : Translate.Render(`email send`),
              status: result.status,
            });
          });
        const currentUser = LogIn.Scope.user.main.model.user;
        accountInstance.renderVerifyEmailStatus(currentUser || user);

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

            // Always get the current user from LogIn.Scope
            const currentUser = LogIn.Scope.user.main.model.user;
            if (!currentUser || !currentUser._id) {
              NotificationManager.Push({
                html: Translate.Render('error-user-not-authenticated'),
                status: 'error',
              });
              s(`.account-profile-image`).style.opacity = 1;
              return;
            }
            // Guest users cannot upload profile images
            if (currentUser.role === 'guest') {
              NotificationManager.Push({
                html: Translate.Render('error-user-not-authenticated'),
                status: 'error',
              });
              s(`.account-profile-image`).style.opacity = 1;
              return;
            }

            const { status, data } = await UserService.put({
              id: `profile-image/${currentUser._id}`,
              body: formFile,
              headerId: 'file',
            });

            if (status === 'success') {
              currentUser.profileImageId = data.profileImageId;
              LogIn.Scope.user.main.model.user = { ...currentUser };
              delete LogIn.Scope.user.main.model.user.profileImage;

              const defaultAvatarUrl = getApiBaseUrl({
                id: 'assets/avatar',
                endpoint: 'user',
              });

              // Fetch the new image immediately
              let newImageSrc = defaultAvatarUrl;
              try {
                const resultFile = await FileService.get({ id: data.profileImageId });
                if (resultFile && resultFile.status === 'success' && resultFile.data[0]) {
                  const imageData = resultFile.data[0];

                  if (!imageData.data?.data && imageData._id) {
                    newImageSrc = getApiBaseUrl({ id: imageData._id, endpoint: 'file/blob' });
                  } else if (imageData.data?.data) {
                    const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });
                    const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });
                    newImageSrc = URL.createObjectURL(imageFile);
                  }

                  LogIn.Scope.user.main.model.user.profileImage = {
                    resultFile,
                    imageData,
                    imageSrc: newImageSrc,
                  };
                }
              } catch (error) {
                logger.warn('Error fetching new profile image:', error);
              }

              // Update both images immediately
              s(`.account-profile-image`).src = newImageSrc;
              const topbarImg = s(`.top-box-profile-img`);
              if (topbarImg) topbarImg.src = newImageSrc;

              NotificationManager.Push({
                html: Translate.Render('success-update-user'),
                status: 'success',
              });
            } else {
              NotificationManager.Push({
                html: data?.message || Translate.Render('file-upload-failed'),
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
        EventsUI.onClick(
          `.btn-account-delete-confirm`,
          async (e) => {
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
          },
          { context: 'modal' },
        );
        EventsUI.onClick(`.btn-brief-description-update`, async (e) => {
          e.preventDefault();
          const descriptionValue = s(`.account-brief-description`).value;
          if (!descriptionValue || descriptionValue === 'undefined' || descriptionValue.trim() === '') {
            NotificationManager.Push({
              html: Translate.Render('brief-description-cannot-be-empty'),
              status: 'error',
            });
            return;
          }
          // Always get the current user from LogIn.Scope
          const currentUser = LogIn.Scope.user.main.model.user;
          if (!currentUser || !currentUser._id) {
            NotificationManager.Push({
              html: Translate.Render('error-user-not-authenticated'),
              status: 'error',
            });
            return;
          }
          // Guest users cannot update brief description
          if (currentUser.role === 'guest') {
            NotificationManager.Push({
              html: Translate.Render('error-user-not-authenticated'),
              status: 'error',
            });
            return;
          }
          const result = await UserService.put({ id: currentUser._id, body: { briefDescription: descriptionValue } });
          NotificationManager.Push({
            html:
              result.status === 'error' && result.message
                ? result.message
                : Translate.Render(`${result.status}-update-user`),
            status: result.status,
          });
          if (result.status === 'success') {
            currentUser.briefDescription = descriptionValue;
            // Preserve profileImage from scope
            const existingProfileImage = LogIn.Scope.user.main.model.user.profileImage;
            LogIn.Scope.user.main.model.user.briefDescription = descriptionValue;
            if (existingProfileImage) {
              LogIn.Scope.user.main.model.user.profileImage = existingProfileImage;
            }
            accountInstance.triggerUpdateEvent({ user: currentUser });
          }
        });

        // Setup public profile toggle handler
        setTimeout(() => {
          if (ToggleSwitch.Tokens['account-public-profile']) {
            const originalClick = ToggleSwitch.Tokens['account-public-profile'].click;
            ToggleSwitch.Tokens['account-public-profile'].click = async function () {
              originalClick.call(this);
              const isChecked = s(`.account-public-profile-checkbox`).checked;
              // Always get the current user from LogIn.Scope
              const currentUser = LogIn.Scope.user.main.model.user;
              if (!currentUser || !currentUser._id) {
                NotificationManager.Push({
                  html: Translate.Render('error-user-not-authenticated'),
                  status: 'error',
                });
                return;
              }
              // Guest users cannot toggle public profile
              if (currentUser.role === 'guest') {
                NotificationManager.Push({
                  html: Translate.Render('error-user-not-authenticated'),
                  status: 'error',
                });
                return;
              }
              const result = await UserService.put({ id: currentUser._id, body: { publicProfile: isChecked } });
              NotificationManager.Push({
                html:
                  result.status === 'error' && result.message
                    ? result.message
                    : Translate.Render(`${result.status}-update-user`),
                status: result.status,
              });
              if (result.status === 'success') {
                currentUser.publicProfile = isChecked;
                // Preserve profileImage from scope
                const existingProfileImage = LogIn.Scope.user.main.model.user.profileImage;
                LogIn.Scope.user.main.model.user.publicProfile = isChecked;
                if (existingProfileImage) {
                  LogIn.Scope.user.main.model.user.profileImage = existingProfileImage;
                }
                accountInstance.triggerUpdateEvent({ user: currentUser });
              }
            };

            // Override wrapper click handler to use our custom handler
            const wrapperElement = s(`.toggle-form-container-account-public-profile`);
            if (wrapperElement) {
              wrapperElement.onclick = () => ToggleSwitch.Tokens['account-public-profile'].click();
            }
          }
        });
        EventsUI.onClick(`.btn-account-delete`, async (e) => {
          e.preventDefault();
          // Always get the current user from LogIn.Scope
          const currentUser = LogIn.Scope.user.main.model.user;
          if (!currentUser || !currentUser._id) {
            NotificationManager.Push({
              html: Translate.Render('error-user-not-authenticated'),
              status: 'error',
            });
            return;
          }
          const result = await UserService.delete({ id: currentUser._id });
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
      <label for="account-profile-image-input-label"
        ><span class="hide">Profile Image</span>
        <input
          type="file"
          accept="${profileFileAccept.join(', ')}"
          class="account-profile-image-input hide"
          id="account-profile-image-input-label"
      /></label>
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
                class: `in wfa btn-input-extension btn-account-update-username`,
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
              ? async () =>
                  html`<div class="in verify-email-status"></div>
                    ${await BtnIcon.Render({
                      class: `in wfa btn-input-extension btn-confirm-email`,
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
                class: `in wfa btn-input-extension btn-account-change-password`,
                type: 'button',
                style: 'text-align: left',
                label: html`${Translate.Render(`change-password`)}`,
              })}`,
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `account-brief-description`,
            label: html`<i class="fa-solid fa-pen-fancy"></i> ${Translate.Render('brief-description')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            rows: 4,
            extension: async () =>
              html`${await BtnIcon.Render({
                class: `in wfa btn-input-extension btn-brief-description-update`,
                type: 'button',
                style: 'text-align: left',
                label: html`${Translate.Render(`update`)}`,
              })}`,
          })}
        </div>
        <div class="in section-mp">
          ${await ToggleSwitch.Render({
            wrapper: true,
            wrapperLabel: html`<i class="fa-solid fa-globe"></i> ${Translate.Render('public-profile')}`,
            id: 'account-public-profile',
            disabledOnClick: true,
            checked: user.publicProfile ? true : false,
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

    // Always sync the current user data into LogIn.Scope, preserving profileImage if it exists
    if (user && user._id) {
      const existingProfileImage = LogIn.Scope.user.main.model.user.profileImage;
      LogIn.Scope.user.main.model.user = { ...user };
      // Preserve existing profileImage if new user doesn't have one
      if (existingProfileImage && !user.profileImage) {
        LogIn.Scope.user.main.model.user.profileImage = existingProfileImage;
      }
    }

    // Use the current user from scope to ensure we have the latest data
    const currentUser = LogIn.Scope.user.main.model.user;
    if (!currentUser || !currentUser._id) {
      return;
    }

    await this.instanceModalUiEvents({ user: currentUser });
    s(`.account-profile-image`).style.opacity = 0;
    for (const inputData of this.formData)
      if (s(`.${inputData.id}`)) s(`.${inputData.id}`).value = currentUser[inputData.model];

    // Update profile image - always show default avatar as fallback (skip for guest users)
    const profileImageElement = s(`.account-profile-image`);
    const defaultAvatarUrl = getApiBaseUrl({
      id: 'assets/avatar',
      endpoint: 'user',
    });

    if (currentUser.role !== 'guest' && profileImageElement) {
      // Show custom image if available, otherwise default avatar
      const customImageSrc = LogIn.Scope.user.main.model.user.profileImage?.imageSrc;
      profileImageElement.src = customImageSrc || defaultAvatarUrl;
      profileImageElement.style.opacity = 1;
    } else if (profileImageElement) {
      profileImageElement.style.opacity = 0;
    }

    // update public profile toggle
    if (ToggleSwitch.Tokens['account-public-profile']) {
      if (currentUser.publicProfile && !s(`.account-public-profile-checkbox`).checked) {
        ToggleSwitch.Tokens['account-public-profile'].click();
      }
    }
  },
};

export { Account };
