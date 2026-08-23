/**
 * Utility module for fullscreen mode management with cross-browser and PWA compatibility.
 * Provides robust fullscreen detection, event handling, and UI synchronization.
 * @module src/client/components/core/ViewModeController.js
 * @namespace ViewModeControllerClient
 */
import { Responsive } from './Responsive.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { fullScreenIn, fullScreenOut, s } from './VanillaJs.js';
/**
 * Manages fullscreen mode state, event handling, and UI synchronization.
 * Supports all major browsers and PWA/Nativefier environments with comprehensive
 * vendor-prefixed API detection.
 * @memberof ViewModeControllerClient
 */
class ViewModeController {
  /**
   * Internal state flag tracking the intended fullscreen mode.
   * @type {boolean}
   * @private
   */
  static _fullScreenSwitch = false;
  /**
   * Flag indicating whether event listeners have been attached.
   * Prevents duplicate event listener registration.
   * @type {boolean}
   * @private
   */
  static _eventListenersAdded = false;
  /**
   * Flag preventing concurrent sync operations.
   * Ensures state synchronization happens sequentially.
   * @type {boolean}
   * @private
   */
  static _syncInProgress = false;
  /**
   * Checks if the browser is currently in fullscreen mode.
   * Supports all vendor-prefixed fullscreen APIs for maximum compatibility:
   * - Standard Fullscreen API
   * - Webkit (Chrome, Safari, Opera)
   * - Mozilla (Firefox)
   * - Microsoft (IE/Edge)
   * @private
   * @memberof ViewModeControllerClient.ViewModeController
   * @returns {boolean} True if currently in fullscreen mode, false otherwise.
   */
  static _isFullScreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      document.fullscreen ||
      document.webkitIsFullScreen ||
      document.mozFullScreen
    );
  }
  /**
   * Synchronizes the toggle switch UI state with the actual fullscreen state.
   * Prevents race conditions using the _syncInProgress flag.
   * Updates the toggle switch only if there's a mismatch between UI and actual state.
   * @private
   * @memberof ViewModeControllerClient.ViewModeController
   * @returns {void}
   */
  static _syncToggleState() {
    if (ViewModeController._syncInProgress) return;
    ViewModeController._syncInProgress = true;
    const actualFullScreen = ViewModeController._isFullScreen();
    // Only update if there's a mismatch
    if (ViewModeController._fullScreenSwitch !== actualFullScreen) {
      ViewModeController._fullScreenSwitch = actualFullScreen;
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
      ViewModeController._syncInProgress = false;
    }, 100);
  }
  /**
   * Event handler for fullscreen change events.
   * Triggers UI state synchronization when fullscreen mode changes.
   * @private
   * @memberof ViewModeControllerClient.ViewModeController
   * @returns {void}
   */
  static _handleFullScreenChange() {
    ViewModeController._syncToggleState();
  }
  /**
   * Attaches all necessary event listeners for fullscreen mode detection.
   * Handles multiple scenarios:
   * - Vendor-prefixed fullscreen change events (Chrome, Firefox, IE/Edge)
   * - Window resize events (for PWA/Nativefier compatibility)
   * - ESC key detection (fallback for manual fullscreen exit)
   * Only attaches listeners once to prevent duplicates.
   * @private
   * @memberof ViewModeControllerClient.ViewModeController
   * @returns {void}
   */
  static _addEventListeners() {
    if (ViewModeController._eventListenersAdded) return;
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach((eventName) => {
      document.addEventListener(eventName, () => ViewModeController._handleFullScreenChange(), false);
    });
    // Additional check for PWA/Nativefier window resize events
    window.addEventListener(
      'resize',
      () => {
        setTimeout(() => ViewModeController._syncToggleState(), 150);
      },
      false,
    );
    // ESC key detection fallback
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
          setTimeout(() => ViewModeController._syncToggleState(), 100);
        }
      },
      false,
    );
    ViewModeController._eventListenersAdded = true;
  }
  /**
   * Enters fullscreen mode if not already in fullscreen.
   * Updates internal state and triggers fullscreen API.
   * Verifies the state change after a delay to ensure synchronization.
   * @private
   * @memberof ViewModeControllerClient.ViewModeController
   * @returns {void}
   */
  static _enterFullScreen() {
    if (ViewModeController._isFullScreen()) return;
    ViewModeController._fullScreenSwitch = true;
    fullScreenIn();
    // Verify after attempt
    setTimeout(() => ViewModeController._syncToggleState(), 300);
  }
  /**
   * Exits fullscreen mode if currently in fullscreen.
   * Updates internal state and triggers fullscreen exit API.
   * Verifies the state change after a delay to ensure synchronization.
   * @private
   * @memberof ViewModeControllerClient.ViewModeController
   * @returns {void}
   */
  static _exitFullScreen() {
    if (!ViewModeController._isFullScreen()) return;
    ViewModeController._fullScreenSwitch = false;
    fullScreenOut();
    // Verify after attempt
    setTimeout(() => ViewModeController._syncToggleState(), 300);
  }
  /**
   * Renders the fullscreen toggle setting UI component.
   * Initializes fullscreen state detection, sets up event listeners,
   * and creates a toggle switch for user interaction.
   * Integrates with the Responsive system for dynamic updates.
   * @memberof ViewModeControllerClient.ViewModeController
   * @returns {Promise<string>} A promise resolving to the HTML string for the fullscreen setting component.
   */
  static async RenderSetting() {
    // Initialize state from actual fullscreen status
    ViewModeController._fullScreenSwitch = ViewModeController._isFullScreen();
    // Setup event listeners once
    ViewModeController._addEventListeners();
    // Update responsive event
    Responsive.onChanged(
      () => {
        ViewModeController._syncToggleState();
      },
      { key: 'full-screen-settings' },
    );
    return html`<div class="in section-mp">
      ${await ToggleSwitch.instance({
        wrapper: true,
        wrapperLabel: html`<i class="fa-solid fa-expand"></i> ${Translate.instance('fullscreen')}`,
        id: 'fullscreen',
        disabledOnClick: true,
        checked: ViewModeController._fullScreenSwitch,
        on: {
          unchecked: () => {
            ViewModeController._exitFullScreen();
          },
          checked: () => {
            ViewModeController._enterFullScreen();
          },
        },
      })}
    </div>`;
  }
}
export { ViewModeController };
