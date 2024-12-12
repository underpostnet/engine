import { CalendarCore } from '../core/CalendarCore.js';
import { boxShadow } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { getProxyPath } from '../core/VanillaJs.js';

const CssCommonHealthcare = async () => {
  CalendarCore.RenderStyle();
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
    </style>
    ${boxShadow({ selector: `.home-body-btn` })}`;
};

const CssHealthcareDark = {
  themePair: 'healthcare-light',
  theme: 'healthcare-dark',
  dark: true,
  render: async () => {
    LoadingAnimation.setDarkColor(`#00d243`);
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
    LoadingAnimation.setLightColor(`#ea2475`);
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
        </style>
      `
    );
  },
};

export { CssHealthcareDark, CssHealthcareLight, CssCommonHealthcare };
