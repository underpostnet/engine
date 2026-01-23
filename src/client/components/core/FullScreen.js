/**
 * Utility module for fullscreen mode management with cross-browser and PWA compatibility.
 * Provides robust fullscreen detection, event handling, and UI synchronization.
 * @module src/client/components/core/FullScreen.js
 * @namespace FullScreenClient
 */

import { Responsive } from './Responsive.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { checkFullScreen, fullScreenIn, fullScreenOut, s } from './VanillaJs.js';

/**
 * Manages fullscreen mode state, event handling, and UI synchronization.
 * Supports all major browsers and PWA/Nativefier environments with comprehensive
 * vendor-prefixed API detection.
 * @memberof FullScreenClient
 */
const FullScreen = {
  /**
   * Internal state flag tracking the intended fullscreen mode.
   * @type {boolean}
   * @private
   */
  _fullScreenSwitch: false,

  /**
   * Flag indicating whether event listeners have been attached.
   * Prevents duplicate event listener registration.
   * @type {boolean}
   * @private
   */
  _eventListenersAdded: false,

  /**
   * Flag preventing concurrent sync operations.
   * Ensures state synchronization happens sequentially.
   * @type {boolean}
   * @private
   */
  _syncInProgress: false,

  /**
   * Checks if the browser is currently in fullscreen mode.
   * Supports all vendor-prefixed fullscreen APIs for maximum compatibility:
   * - Standard Fullscreen API
   * - Webkit (Chrome, Safari, Opera)
   * - Mozilla (Firefox)
   * - Microsoft (IE/Edge)
   * @private
   * @memberof FullScreenClient.FullScreen
   * @returns {boolean} True if currently in fullscreen mode, false otherwise.
   */
  _isFullScreen: function () {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      document.fullscreen ||
      document.webkitIsFullScreen ||
      document.mozFullScreen
    );
  },

  /**
   * Synchronizes the toggle switch UI state with the actual fullscreen state.
   * Prevents race conditions using the _syncInProgress flag.
   * Updates the toggle switch only if there's a mismatch between UI and actual state.
   * @private
   * @memberof FullScreenClient.FullScreen
   * @returns {void}
   */
  _syncToggleState: function () {
    if (this._syncInProgress) return;
    this._syncInProgress = true;

    const actualFullScreen = this._isFullScreen();

    // Only update if there's a mismatch
    if (this._fullScreenSwitch !== actualFullScreen) {
      this._fullScreenSwitch = actualFullScreen;

      // Update toggle switch UI if it exists
      const toggle = s('.fullscreen');
      if (toggle && ToggleSwitch.Tokens[`fullscreen`]) {
        const switchState = ToggleSwitch.Tokens[`fullscreen`].checked;
        if (switchState !== actualFullScreen) {
          ToggleSwitch.Tokens[`fullscreen`].click();
        }
      }
    }

    setTimeout(() => {
      this._syncInProgress = false;
    }, 100);
  },

  /**
   * Event handler for fullscreen change events.
   * Triggers UI state synchronization when fullscreen mode changes.
   * @private
   * @memberof FullScreenClient.FullScreen
   * @returns {void}
   */
  _handleFullScreenChange: function () {
    this._syncToggleState();
  },

  /**
   * Attaches all necessary event listeners for fullscreen mode detection.
   * Handles multiple scenarios:
   * - Vendor-prefixed fullscreen change events (Chrome, Firefox, IE/Edge)
   * - Window resize events (for PWA/Nativefier compatibility)
   * - ESC key detection (fallback for manual fullscreen exit)
   * Only attaches listeners once to prevent duplicates.
   * @private
   * @memberof FullScreenClient.FullScreen
   * @returns {void}
   */
  _addEventListeners: function () {
    if (this._eventListenersAdded) return;

    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];

    events.forEach((eventName) => {
      document.addEventListener(eventName, () => this._handleFullScreenChange(), false);
    });

    // Additional check for PWA/Nativefier window resize events
    window.addEventListener(
      'resize',
      () => {
        setTimeout(() => this._syncToggleState(), 150);
      },
      false,
    );

    // ESC key detection fallback
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
          setTimeout(() => this._syncToggleState(), 100);
        }
      },
      false,
    );

    this._eventListenersAdded = true;
  },

  /**
   * Enters fullscreen mode if not already in fullscreen.
   * Updates internal state and triggers fullscreen API.
   * Verifies the state change after a delay to ensure synchronization.
   * @private
   * @memberof FullScreenClient.FullScreen
   * @returns {void}
   */
  _enterFullScreen: function () {
    if (this._isFullScreen()) return;

    this._fullScreenSwitch = true;
    fullScreenIn();

    // Verify after attempt
    setTimeout(() => this._syncToggleState(), 300);
  },

  /**
   * Exits fullscreen mode if currently in fullscreen.
   * Updates internal state and triggers fullscreen exit API.
   * Verifies the state change after a delay to ensure synchronization.
   * @private
   * @memberof FullScreenClient.FullScreen
   * @returns {void}
   */
  _exitFullScreen: function () {
    if (!this._isFullScreen()) return;

    this._fullScreenSwitch = false;
    fullScreenOut();

    // Verify after attempt
    setTimeout(() => this._syncToggleState(), 300);
  },

  /**
   * Renders the fullscreen toggle setting UI component.
   * Initializes fullscreen state detection, sets up event listeners,
   * and creates a toggle switch for user interaction.
   * Integrates with the Responsive system for dynamic updates.
   * @memberof FullScreenClient.FullScreen
   * @returns {Promise<string>} A promise resolving to the HTML string for the fullscreen setting component.
   */
  RenderSetting: async function () {
    // Initialize state from actual fullscreen status
    this._fullScreenSwitch = this._isFullScreen();

    // Setup event listeners once
    this._addEventListeners();

    // Update responsive event
    Responsive.Event['full-screen-settings'] = () => {
      this._syncToggleState();
    };

    return html`<div class="in section-mp">
      ${await ToggleSwitch.Render({
        wrapper: true,
        wrapperLabel: html`<i class="fa-solid fa-expand"></i> ${Translate.Render('fullscreen')}`,
        id: 'fullscreen',
        disabledOnClick: true,
        checked: this._fullScreenSwitch,
        on: {
          unchecked: () => {
            this._exitFullScreen();
          },
          checked: () => {
            this._enterFullScreen();
          },
        },
      })}
    </div>`;
  },
};

export { FullScreen };
