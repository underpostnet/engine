import { CalendarCore } from '../core/CalendarCore.js';
import { borderChar, boxShadow, subThemeManager } from '../core/Css.js';
import { getProxyPath } from '../core/Router.js';

const CssCommonHealthcare = async () => {
  CalendarCore.RenderStyle();
  subThemeManager.setLightTheme(`#ea2475`);
  subThemeManager.setDarkTheme(`#00d243`);
  return html`<style>
      @font-face {
        font-family: 'cursive';
        src: URL('${getProxyPath()}fonts/Cookie-Regular.ttf') format('truetype');
      }
      .home-body-btn {
        margin: 10px;
        height: 150px;
        width: 150px;
        font-size: 18px;
        border-radius: 35px;
      }
      .home-menu-container {
        margin: auto;
        margin-top: 40px;
        margin-bottom: 100px;
      }
      .home-menu-icon {
        width: 80px;
        height: 80px;
      }
      .home-h1-font-container {
        margin-bottom: 30px;
        font-size: 40px;
        font-family: 'cursive';
        text-align: center;
      }
      .home-h2-font-container {
        margin-bottom: 10px;
        font-size: 25px;
        font-family: 'cursive';
        text-align: center;
      }
      .slide-menu-icon {
        width: 25px;
        height: 25px;
      }
      .menu-label-text-slide-menu-icon {
        top: -4px;
      }
      .b0-panel-sub-container {
        margin: 10px;
        padding: 0px;
        border-radius: 14px;
        overflow: hidden;
        cursor: pointer;
        transition: 0.3s;
      }
      .nutrition-tips-panel-cell {
        height: 100px;
        font-size: 20px;
      }
      .nutrition-tips-panel-icon {
        width: 80px;
        height: 80px;
        margin: auto;
      }
      .healthcare-banner {
        width: 300px;
        margin: auto;
      }
      .healthcare-calendar-info-value {
        font-weight: bold;
        padding-left: 20px;
      }
      .add-note-btn {
        font-size: 30px;
        font-weight: bold;
        font-family: 'cursive';
        text-align: center;
        min-width: 250px;
        padding: 10px;
      }
    </style>
    ${borderChar(1, 'black', [])} ${boxShadow({ selector: `.home-body-btn` })}`;
};

const CssHealthcareDark = {
  themePair: 'healthcare-light',
  theme: 'healthcare-dark',
  dark: true,
  render: async () => {
    return (
      (await CssCommonHealthcare()) +
      html`
        <style>
          .modal,
          .input-extension {
            background: #38003c;
          }
          button:hover,
          .hover:hover,
          .main-btn-menu-active,
          .dropdown-option:hover,
          .input-container:hover,
          .toggle-form-container:hover,
          .ripple {
            background: #5c0163;
            background-color: #5c0163;
          }
          .bar-default-modal,
          .btn-eye-password,
          input {
            background: #501455;
          }
          .toggle-switch-circle {
            background: #440c4a;
          }
          .dropdown-container,
          .toggle-form-container,
          .input-container {
            border: 2px solid #501455;
          }
          button {
            border: 2px solid #501455;
          }
          .main-body-top {
            background: rgb(12 12 12 / 50%) !important;
          }
          .home-body-btn {
            background: #a80081;
          }
          .b0-panel-sub-container {
            background-color: #501455;
          }
          .b0-panel-sub-container:hover {
            background-color: #731c7a;
          }
        </style>
      `
    );
  },
};
const CssHealthcareLight = {
  themePair: 'healthcare-dark',
  theme: 'healthcare-light',
  dark: false,
  render: async () => {
    return (
      (await CssCommonHealthcare()) +
      html`
        <style>
          .modal,
          .input-extension {
            background: #ffce95;
          }
          button:hover,
          .hover:hover,
          .main-btn-menu-active,
          .dropdown-option:hover,
          .input-container:hover,
          .toggle-form-container:hover,
          .ripple {
            background: #ffb866;
            background-color: #ffb866;
          }
          .bar-default-modal,
          .btn-eye-password,
          input {
            background: #fff0cc;
          }
          .toggle-switch-circle {
            background: #ed8b1a;
          }
          .dropdown-container,
          .toggle-form-container,
          .input-container {
            border: 2px solid #fff0cc;
          }
          button {
            border: 2px solid #fff0cc;
          }
          .main-body-top {
            background: rgb(255 253 234 / 50%) !important;
          }
          .home-body-btn {
            background: #ffce95;
          }
          .b0-panel-sub-container {
            background-color: #fff0cc;
          }
          .b0-panel-sub-container:hover {
            background-color: #fef7e7;
          }
        </style>
      `
    );
  },
};

export { CssHealthcareDark, CssHealthcareLight, CssCommonHealthcare };
