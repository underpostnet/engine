import { renderWave } from './Css.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';
import { NotificationManager } from './NotificationManager.js';
import { UserService } from '../../services/user/user.service.js';

const PublicProfile = {
  Render: async function (
    options = {
      idModal: '',
      user: {},
    },
  ) {
    const {
      user: { _id: userId, username },
    } = options;
    const waveAnimationId = `public-profile-wave-${userId}`;

    if (!userId) {
      return html`<div class="in section-mp" style="text-align: center; color: red;">
        ${Translate.Render('user-not-found')}
      </div>`;
    }

    // Fetch public user data
    let userData = null;
    try {
      const result = await UserService.get({ id: `public/${username}` });
      if (result.status === 'success') {
        userData = result.data;
      } else {
        return html`<div class="in section-mp" style="text-align: center; color: red;">
          ${Translate.Render('user-not-found')}
        </div>`;
      }
    } catch (error) {
      console.error('Error fetching public profile:', error);
      return html`<div class="in section-mp" style="text-align: center; color: red;">
        ${Translate.Render('error-loading-profile')}
      </div>`;
    }

    // If user doesn't have public profile enabled
    if (!userData.publicProfile) {
      return html`<div class="in section-mp" style="text-align: center; color: red;">
        ${Translate.Render('profile-is-private')}
      </div>`;
    }

    // Schedule rendering of profile image after DOM is ready
    setTimeout(async () => {
      const container = s(`.wave-animation-container-${waveAnimationId}`);
      if (container && userData.profileImageId) {
        try {
          const imageResult = await UserService.get({ id: `file/${userData.profileImageId}` });
          if (imageResult.status === 'success' && imageResult.data?.imageSrc) {
            const imgElement = s(`.public-profile-image`);
            if (imgElement) {
              imgElement.src = imageResult.data.imageSrc;
              imgElement.style.opacity = 1;
            }
          }
        } catch (error) {
          console.warn('Could not load profile image:', error);
        }
      }
    });

    return html`
      ${renderWave({ id: waveAnimationId })}

      <div class="wave-animation-container-${waveAnimationId}" style="position: relative; margin-bottom: 40px;">
        <div class="abs center public-profile-image-container">
          <img
            class="abs center public-profile-image"
            style="opacity: 0; transition: opacity 0.3s ease-in-out;"
            alt="${userData.username}"
          />
        </div>
        <div class="abs center public-profile-image-loading" style="color: white;"></div>
      </div>

      <div class="in section-mp" style="text-align: center; padding: 20px;">
        <!-- Username -->
        <div class="in section-mp">
          <h2 style="margin: 0; font-size: 28px; font-weight: bold;">
            <i class="fa-solid fa-user"></i> ${userData.username}
          </h2>
        </div>

        <!-- Brief Description / Bio -->
        ${userData.briefDescription
          ? html`<div class="in section-mp" style="margin-top: 16px;">
              <p style="margin: 0; font-size: 14px; color: #666; line-height: 1.6;">
                <i class="fa-solid fa-pen-fancy"></i>
                <span style="margin-left: 8px;">${userData.briefDescription}</span>
              </p>
            </div>`
          : html`<div class="in section-mp" style="margin-top: 16px;">
              <p style="margin: 0; font-size: 14px; color: #999; font-style: italic;">
                ${Translate.Render('no-description')}
              </p>
            </div>`}

        <!-- Member Since -->
        <div class="in section-mp" style="margin-top: 16px;">
          <span style="font-size: 12px; color: #999;">
            <i class="fa-solid fa-calendar"></i>
            ${Translate.Render('member-since')}: ${new Date(userData.createdAt).toLocaleDateString()}
          </span>
        </div>

        <!-- Divider -->
        <div style="margin: 20px 0; border-top: 1px solid #eee;"></div>

        <!-- Social Links Placeholder -->
        <div class="in section-mp" style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <a
            href="javascript:void(0)"
            title="Profile"
            style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background-color: #f0f0f0;
              color: #333;
              text-decoration: none;
              transition: all 0.3s ease;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='#e0e0e0'; this.style.transform='scale(1.1)';"
            onmouseout="this.style.backgroundColor='#f0f0f0'; this.style.transform='scale(1)';"
          >
            <i class="fa-solid fa-user"></i>
          </a>
        </div>

        <!-- Profile Stats (Optional) -->
        <div class="in section-mp" style="margin-top: 24px; display: flex; justify-content: center; gap: 40px;">
          <div style="text-align: center;">
            <div style="font-size: 20px; font-weight: bold; color: #333;">-</div>
            <div style="font-size: 12px; color: #999; margin-top: 4px;">${Translate.Render('followers')}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 20px; font-weight: bold; color: #333;">-</div>
            <div style="font-size: 12px; color: #999; margin-top: 4px;">${Translate.Render('following')}</div>
          </div>
        </div>
      </div>
    `;
  },
};

export { PublicProfile };
