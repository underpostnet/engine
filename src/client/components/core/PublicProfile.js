import { renderWave } from './Css.js';
import { Translate } from './Translate.js';
import { s, htmls } from './VanillaJs.js';
import { UserService } from '../../services/user/user.service.js';
import { ThemeEvents, darkTheme, subThemeManager, lightenHex, darkenHex } from './Css.js';
import { Modal } from './Modal.js';
import { getId } from './CommonJs.js';
import { setPath, getProxyPath, getQueryParams, extractUsernameFromPath } from './Router.js';

const PublicProfile = {
  Data: {},
  currentUsername: null, // Track the currently displayed username for back/forward navigation

  Update: async function (options = { idModal: '', user: {} }) {
    const { idModal, user } = options;
    const username = user.username || 'Unknown User';

    // Skip update if already showing this profile (prevents loops during back/forward navigation)
    if (this.currentUsername === username) {
      return;
    }

    // Check if modal exists and is registered in Modal.Data
    if (!Modal.Data[idModal]) {
      return await this.Render(options);
    }

    try {
      // Track the username we're updating to
      this.currentUsername = username;

      // Ensure modal is in correct state
      this._ensureModalState(idModal);

      // Show loading state using Modal.writeHTML
      const loadingHtml = this._getLoadingHtml(username);
      Modal.writeHTML({ idModal, html: loadingHtml });

      // Clean up existing profile data to avoid conflicts
      this._cleanupProfileData({ idModal });

      // Re-render the profile content with new user
      const newContent = await this.Render({ ...options, disableUpdate: true });

      // Update modal content using Modal.writeHTML with smooth transition
      Modal.writeHTML({ idModal, html: newContent });
      Modal.zIndexSync({ idModal });

      this._addTransitionEffect(idModal);
      return newContent;
    } catch (error) {
      console.error('Error updating profile:', error);

      // Show error state using Modal.writeHTML
      const errorHtml = this._getErrorHtml(username, error.message);
      Modal.writeHTML({ idModal, html: errorHtml });

      throw error;
    }
  },

  _getLoadingHtml: function (username) {
    return html`
      <div class="profile-loading-container">
        <div class="profile-loading-spinner"></div>
        <p class="profile-loading-text">Loading profile for @${username}...</p>
        <style>
          .profile-loading-container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 400px;
            flex-direction: column;
            gap: 20px;
          }
          .profile-loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: profile-spin 1s linear infinite;
          }
          .profile-loading-text {
            margin: 0;
            color: #666;
            font-size: 14px;
          }
          @keyframes profile-spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        </style>
      </div>
    `;
  },

  _addTransitionEffect: function (idModal) {
    // Add smooth transition effect to modal content
    const modalContent = s(`.html-${idModal}`);
    if (modalContent) {
      modalContent.style.transition = 'opacity 0.3s ease-in-out';
      modalContent.style.opacity = '0';

      // Fade in after a brief delay
      setTimeout(() => {
        modalContent.style.opacity = '1';
      }, 50);
    }
  },

  _getErrorHtml: function (username, errorMessage) {
    return html`
      <div class="profile-error-container">
        <div class="profile-error-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3 class="profile-error-title">Failed to load profile</h3>
        <p class="profile-error-message">Could not load profile for @${username}</p>
        <p class="profile-error-details">${errorMessage}</p>
        <button class="profile-error-retry btn-retry-profile" onclick="location.reload()">
          <i class="fas fa-redo"></i> Retry
        </button>
        <style>
          .profile-error-container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 400px;
            flex-direction: column;
            gap: 15px;
            text-align: center;
            padding: 20px;
          }
          .profile-error-icon {
            font-size: 48px;
            color: #e74c3c;
          }
          .profile-error-title {
            margin: 0;
            color: #333;
            font-size: 18px;
          }
          .profile-error-message {
            margin: 0;
            color: #666;
            font-size: 14px;
          }
          .profile-error-details {
            margin: 0;
            color: #999;
            font-size: 12px;
            font-style: italic;
          }
          .profile-error-retry {
            padding: 8px 16px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.3s;
          }
          .profile-error-retry:hover {
            background: #2980b9;
          }
        </style>
      </div>
    `;
  },

  _cleanupProfileData: function ({ idModal }) {
    delete ThemeEvents[`error-state-${idModal}`];
    delete ThemeEvents[`profile-${idModal}`];
    delete this.Data[idModal];
  },

  _ensureModalState: function (idModal) {
    // Ensure modal is in the correct state for content updates
    if (Modal.Data[idModal]) {
      // Reset any modal-specific states that might interfere
      Modal.Data[idModal].updated = true;
      Modal.Data[idModal].lastUpdated = Date.now();
    }
  },

  Render: async function (
    options = {
      idModal: '',
      user: {},
    },
  ) {
    let {
      user: { _id: userId, username },
    } = options;
    const idModal = options.idModal || getId();
    const profileId = `public-profile-${userId}`;
    const waveAnimationId = `${profileId}-wave`;
    const profileImageClass = `${profileId}-image`;
    const profileContainerId = `${profileId}-container`;
    const cardId = `${profileId}-card`;

    if (!options.disableUpdate) {
      const queryParams = getQueryParams();
      const usernameFromPath = extractUsernameFromPath();
      const cid = usernameFromPath || queryParams.cid || username;
      const existingModal = s(`.${idModal}`);
      if (existingModal && Modal.Data[idModal]) {
        await PublicProfile.Update({
          idModal,
          user: { username: cid },
        });
        return;
      } else username = cid;
    }

    // Initialize data structure (Modal.Data pattern)
    if (!PublicProfile.Data[profileId]) {
      PublicProfile.Data[profileId] = {
        userData: null,
        colors: {},
        updated: true,
        lastUpdated: Date.now(),
      };
    } // Setup observer callback using Modal.Data pattern

    // Get primary theme color for secondary colors
    const getPrimaryThemeColor = () => {
      const primaryColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
      return primaryColor || (darkTheme ? '#3498db' : '#3498db');
    };

    // Theme-aware color palette with subtheme secondary colors
    const getThemeColors = () => {
      const isDark = darkTheme;
      const primaryColor = getPrimaryThemeColor();
      const primaryColorLight = lightenHex(primaryColor, 0.8);
      const primaryColorDark = darkenHex(primaryColor, 0.75);

      return {
        // Background colors
        bgPrimary: isDark ? 'rgba(25, 25, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        bgSecondary: isDark ? 'rgba(35, 35, 40, 0.95)' : 'rgba(248, 249, 250, 0.95)',
        bgGradient: isDark
          ? `linear-gradient(135deg, ${darkenHex(primaryColor, 0.9)}, ${darkenHex(primaryColor, 0.95)})`
          : `linear-gradient(135deg, ${lightenHex(primaryColor, 0.92)}, ${lightenHex(primaryColor, 0.88)})`,

        // Text colors
        textPrimary: isDark ? '#e8e8e8' : '#1a1a1a',
        textSecondary: isDark ? '#b0b0b0' : '#555555',
        textTertiary: isDark ? '#808080' : '#999999',

        // Border and divider
        border: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        divider: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',

        // Badge with subtheme
        badgeBg: isDark ? `${darkenHex(primaryColor, 0.85)}33` : `${lightenHex(primaryColor, 0.92)}66`,
        badgeBorder: isDark ? `${primaryColorLight}4d` : `${primaryColor}26`,
        badgeText: isDark ? primaryColorLight : primaryColor,

        // Button with subtheme gradient
        buttonGradient: isDark
          ? `linear-gradient(135deg, ${primaryColorLight}, ${primaryColor})`
          : `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})`,
        buttonShadow: isDark ? `${primaryColor}40` : `${primaryColor}4d`,
        buttonShadowHover: isDark ? `${primaryColor}66` : `${primaryColor}80`,

        // Error
        error: isDark ? '#ff6b6b' : '#e74c3c',

        // Shadows
        shadowSmall: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.08)',
        shadowMedium: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.12)',
        shadowLarge: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.15)',

        // Primary colors
        primaryColor,
        primaryColorLight,
        primaryColorDark,
      };
    };

    // Update error state theme colors dynamically
    const updateErrorStateTheme = () => {
      const errorStateEl = s(`.${profileContainerId}-error-state`);
      if (!errorStateEl) return;

      const colors = getThemeColors();
      const primaryColor = getPrimaryThemeColor();

      errorStateEl.style.background = `linear-gradient(135deg, ${colors.bgPrimary} 0%, ${colors.bgSecondary} 100%)`;

      // Update icon container
      const iconContainer = errorStateEl.querySelector('div[style*="border-radius: 50%"]');
      if (iconContainer) {
        iconContainer.style.background = `${colors.error}15`;
        iconContainer.style.borderColor = `${colors.error}30`;
      }

      // Update icon
      const icon = errorStateEl.querySelector('i');
      if (icon) {
        icon.style.color = colors.error;
      }

      // Update heading
      const heading = errorStateEl.querySelector('h2');
      if (heading) {
        heading.style.color = colors.textPrimary;
      }

      // Update description
      const description = errorStateEl.querySelector('p');
      if (description) {
        description.style.color = colors.textSecondary;
      }

      // Update buttons
      const buttons = errorStateEl.querySelectorAll('a');
      buttons.forEach((btn, index) => {
        if (index === 0) {
          // Home button
          btn.style.background = colors.buttonGradient;
          btn.style.boxShadow = `0 4px 12px ${colors.buttonShadow}`;
        } else {
          // Go Back button
          btn.style.color = colors.primaryColor;
          btn.style.borderColor = `${colors.primaryColor}40`;
        }
      });
    };

    // Register theme change handler
    ThemeEvents[`error-state-${idModal}`] = updateErrorStateTheme;
    setTimeout(updateErrorStateTheme);

    const renderErrorState = (message, icon = 'fa-exclamation-circle', description = '') => {
      const colors = getThemeColors();
      return html`
        <div
          class="${profileContainerId}-error-state"
          style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 40px;
          background: linear-gradient(135deg, ${colors.bgPrimary} 0%, ${colors.bgSecondary} 100%);
          border-radius: 20px;
          text-align: center;
        "
        >
          <!-- Icon Container -->
          <div
            style="
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: ${colors.error}15;
            border: 2px solid ${colors.error}30;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 32px;
          "
          >
            <i
              class="fa-solid ${icon}"
              style="
              font-size: 56px;
              color: ${colors.error};
              opacity: 0.9;
            "
            ></i>
          </div>

          <!-- Main Message -->
          <h2
            style="
            margin: 0 0 16px 0;
            font-size: 24px;
            font-weight: 600;
            color: ${colors.textPrimary};
            letter-spacing: -0.5px;
          "
          >
            ${message}
          </h2>

          <!-- Description/Documentation -->
          ${description
            ? html`<p
                style="
            margin: 0 0 32px 0;
            font-size: 16px;
            color: ${colors.textSecondary};
            line-height: 1.6;
            max-width: 500px;
          "
              >
                ${description}
              </p>`
            : ''}

          <!-- Helpful Actions -->
          <div
            style="
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            justify-content: center;
            margin-top: 24px;
          "
          >
            <a
              href="/"
              style="
              padding: 12px 28px;
              background: ${colors.buttonGradient};
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.3s ease;
              box-shadow: 0 4px 12px ${colors.buttonShadow};
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 8px;
            "
              onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px ${colors.buttonShadowHover}';"
              onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px ${colors.buttonShadow}';"
            >
              <i class="fa-solid fa-home"></i>
              ${Translate.Render('go-home')}
            </a>
            <a
              href="javascript:history.back()"
              style="
              padding: 12px 28px;
              background: transparent;
              color: ${colors.primaryColor};
              text-decoration: none;
              border: 2px solid ${colors.primaryColor}40;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.3s ease;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 8px;
            "
              onmouseover="this.style.background='${colors.primaryColor}08'; this.style.borderColor='${colors.primaryColor}60';"
              onmouseout="this.style.background='transparent'; this.style.borderColor='${colors.primaryColor}40';"
            >
              <i class="fa-solid fa-arrow-left"></i>
              ${Translate.Render('go-back')}
            </a>
          </div>
        </div>
      `;
    };

    if (!userId && !username) {
      return renderErrorState(
        Translate.Render('user-not-found'),
        'fa-user-slash',
        "The user you're looking for could not be found. Please check the username and try again.",
      );
    }

    // Fetch public user data
    let userData = null;
    try {
      const result = await UserService.get({ id: `u/${username}` });
      setTimeout(() => {
        Modal.Data[idModal].onObserverListener['profile-card-observer'] = () => {
          const modalHeight = s(`.${idModal}`).offsetHeight;

          if (s(`.${profileContainerId}`)) s(`.${profileContainerId}`).style.height = `${modalHeight - 110}px`;
          if (s(`.${profileContainerId}-error-state`))
            s(`.${profileContainerId}-error-state`).style.height = `${modalHeight - 160}px`;
        };
        Modal.Data[idModal].onObserverListener['profile-card-observer']();
      });
      if (result.status === 'success') {
        userData = result.data;
        PublicProfile.Data[profileId].userData = userData;

        // Track the currently displayed username for back/forward navigation
        PublicProfile.currentUsername = userData.username || username;

        // Update browser history to show clean URL after successful data fetch
        if (userData.username) {
          const cleanPath = `${getProxyPath()}u/${username}`;
          setPath(cleanPath, { replace: true });
        }
      } else {
        if (result.message && result.message.toLowerCase().match('private'))
          return renderErrorState(
            Translate.Render('profile-is-private'),
            'fa-lock',
            'This user has chosen to keep their profile private. Respect their privacy and check back later if they change their settings.',
          );
        else
          return renderErrorState(
            Translate.Render('user-not-found'),
            'fa-user-slash',
            'This user profile does not exist or has been removed. Please verify the username.',
          );
      }
    } catch (error) {
      console.error('Error fetching public profile:', error);
      return renderErrorState(
        Translate.Render('error-loading-profile'),
        'fa-circle-exclamation',
        'We encountered an issue loading this profile. Please try again in a moment or contact support if the problem persists.',
      );
    }

    // If user doesn't have public profile enabled
    if (!userData.publicProfile) {
      return renderErrorState(
        Translate.Render('profile-is-private'),
        'fa-lock',
        'This user has chosen to keep their profile private. Respect their privacy and check back later if they change their settings.',
      );
    }

    // Function to update profile card styles based on theme changes
    const updateProfileCardTheme = () => {
      const container = s(`.${profileContainerId}`);
      if (!container) return;

      const colors = getThemeColors();
      PublicProfile.Data[profileId].colors = colors;

      // Update container background
      container.style.background = colors.bgGradient;

      // Update card
      const card = s(`.${cardId}`);
      if (card) {
        card.style.backgroundColor = colors.bgPrimary;
        card.style.borderColor = colors.border;
        card.style.boxShadow = `0 12px 48px ${colors.shadowMedium}`;
      }

      // Update text colors
      const username_el = s(`.${profileId}-username`);
      if (username_el) username_el.style.color = colors.textPrimary;

      const description_els = document.querySelectorAll(`.${profileId}-description`);
      description_els.forEach((el) => {
        el.style.color = colors.textSecondary;
      });

      const badge_el = s(`.${profileId}-badge`);
      if (badge_el) {
        badge_el.style.backgroundColor = colors.badgeBg;
        badge_el.style.borderColor = colors.badgeBorder;
        const badgeText = badge_el.querySelector('span');
        if (badgeText) badgeText.style.color = colors.badgeText;
      }

      const divider = s(`.${profileId}-divider`);
      if (divider) {
        divider.style.background = `linear-gradient(90deg, transparent, ${colors.divider}, transparent)`;
      }

      const button = s(`.${profileId}-button`);
      if (button) {
        button.style.background = colors.buttonGradient;
        button.style.boxShadow = `0 6px 16px ${colors.buttonShadow}`;
      }

      const imageContainer = s(`.${profileId}-image-container`);
      if (imageContainer) {
        imageContainer.style.borderColor = colors.bgPrimary;
        imageContainer.style.backgroundColor = colors.bgSecondary;
      }
    };

    // Register theme change listener
    ThemeEvents[`profile-${idModal}`] = updateProfileCardTheme;

    // Schedule rendering of profile image after DOM is ready
    setTimeout(async () => {
      if (userData.profileImageId) {
        try {
          const imageSrc = `${getProxyPath()}api/file/blob/${userData.profileImageId}`;
          const imgElement = s(`.${profileImageClass}`);
          if (imgElement) {
            imgElement.src = imageSrc;
            imgElement.style.opacity = '1';
            const loadingEl = s(`.${profileImageClass}-loading`);
            if (loadingEl) {
              loadingEl.style.display = 'none';
            }
          }
        } catch (error) {
          console.warn('Could not load profile image:', error);
        }
      }
    });

    const colors = getThemeColors();
    PublicProfile.Data[profileId].colors = colors;

    return html`
      <!-- Hero Section with Wave Background -->
      <div
        class="${profileContainerId}"
        style="
          position: relative;
          background: ${colors.bgGradient};
          overflow: visible;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 40px;
          padding-bottom: 20px;
          padding-left: 20px;
          padding-right: 20px;
          transition: background 0.3s ease-in-out;
        "
      >
        <!-- Wave Animation Background - Fixed Height -->
        <div
          class="${waveAnimationId}"
          style="
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0.5;
            overflow: hidden;
          "
        >
          ${renderWave({ id: waveAnimationId })}
        </div>

        <!-- Profile Card Container - Half Overlapping -->
        <div
          class="${cardId}"
          style="
            position: relative;
            top: 60px;
            background: ${colors.bgPrimary};
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 48px 32px 40px;
            max-width: 520px;
            width: 100%;
            box-shadow: 0 12px 48px ${colors.shadowMedium};
            border: 1px solid ${colors.border};
            transition: all 0.3s ease-in-out;
            margin-top: -40px;
          "
        >
          <!-- Profile Image Container -->
          <div
            style="
              display: flex;
              justify-content: center;
              margin-bottom: 36px;
            "
          >
            <div
              class="${profileId}-image-container"
              style="
                position: relative;
                width: 160px;
                height: 160px;
                flex-shrink: 0;
                border-radius: 50%;
                border: 6px solid ${colors.bgPrimary};
                background-color: ${colors.bgSecondary};
                transition: all 0.3s ease-in-out;
                overflow: hidden;
                box-shadow: 0 12px 40px ${colors.shadowLarge};
              "
            >
              <img
                class="${profileImageClass}"
                style="
                  width: 100%;
                  height: 100%;
                  border-radius: 50%;
                  opacity: 0;
                  transition: opacity 0.4s ease-in-out;
                  object-fit: cover;
                "
                alt="${userData.username}"
              />
              <div
                class="${profileImageClass}-loading"
                style="
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: ${colors.textTertiary};
                  font-size: 48px;
                  transition: display 0.3s ease-in-out;
                  background: linear-gradient(135deg, ${colors.bgSecondary}, ${colors.bgPrimary});
                "
              >
                <i class="fa-solid fa-user" style="opacity: 0.4;"></i>
              </div>
            </div>
          </div>

          <!-- Content Section -->
          <div style="text-align: center;">
            <!-- Username -->
            <h1
              class="${profileId}-username"
              style="
                margin: 0 0 12px 0;
                font-size: 28px;
                font-weight: 700;
                color: ${colors.textPrimary};
                letter-spacing: -0.5px;
                transition: color 0.3s ease-in-out;
              "
            >
              ${userData.username}
            </h1>

            <!-- Brief Description / Bio -->
            <div style="margin: 16px 0 28px 0;">
              ${userData.briefDescription
                ? html`<p
                    class="${profileId}-description"
                    style="
                      margin: 0;
                      font-size: 14px;
                      color: ${colors.textSecondary};
                      line-height: 1.6;
                      font-weight: 500;
                      transition: color 0.3s ease-in-out;
                    "
                  >
                    ${userData.briefDescription}
                  </p>`
                : html`<p
                    class="${profileId}-description"
                    style="
                      margin: 0;
                      font-size: 14px;
                      color: ${colors.textTertiary};
                      font-style: italic;
                      transition: color 0.3s ease-in-out;
                    "
                  >
                    ${Translate.Render('no-description')}
                  </p>`}
            </div>

            <!-- Member Since Badge -->
            <div
              class="${profileId}-badge"
              style="
                display: inline-block;
                background: ${colors.badgeBg};
                border: 1px solid ${colors.badgeBorder};
                border-radius: 24px;
                padding: 8px 16px;
                margin-bottom: 28px;
                transition: all 0.3s ease-in-out;
              "
            >
              <span
                style="
                  font-size: 12px;
                  color: ${colors.badgeText};
                  font-weight: 600;
                  letter-spacing: 0.5px;
                  transition: color 0.3s ease-in-out;
                "
              >
                <i class="fa-solid fa-calendar" style="margin-right: 6px;"></i>
                ${Translate.Render('member-since')}: ${new Date(userData.createdAt).toLocaleDateString()}
              </span>
            </div>

            <!-- Divider -->
            <div
              class="${profileId}-divider"
              style="
                margin: 24px 0;
                height: 1px;
                background: linear-gradient(
                  90deg,
                  transparent,
                  ${colors.divider},
                  transparent
                );
                transition: background 0.3s ease-in-out;
              "
            ></div>

            <!-- Action Links -->
            <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
              <a
                class="${profileId}-button"
                href="javascript:void(0)"
                title="${Translate.Render('view-profile')}"
                style="
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  width: 50px;
                  height: 50px;
                  border-radius: 50%;
                  background: ${colors.buttonGradient};
                  color: white;
                  text-decoration: none;
                  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                  cursor: pointer;
                  box-shadow: 0 6px 16px ${colors.buttonShadow};
                  font-size: 18px;
                  border: none;
                "
                onmouseover="
                  this.style.transform = 'translateY(-4px) scale(1.1)';
                  this.style.boxShadow = '0 10px 24px ${colors.buttonShadowHover}';
                "
                onmouseout="
                  this.style.transform = 'translateY(0) scale(1)';
                  this.style.boxShadow = '0 6px 16px ${colors.buttonShadow}';
                "
              >
                <i class="fa-solid fa-user"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  },
};

export { PublicProfile };
