import { CalendarCore } from '../core/CalendarCore.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';

const CssCommonHealthcare = async () => {
  // LoadingAnimation.setLightColor(`#ea2475`);
  // CalendarCore.RenderStyle();
  return html`<style></style>`;
};

const CssHealthcareDark = {
  themePair: 'healthcare-light',
  theme: 'healthcare-dark',
  dark: true,
  render: () =>
    CssCommonHealthcare() +
    html`
      <style>
        .modal {
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
      </style>
    `,
};
const CssHealthcareLight = {
  themePair: 'healthcare-dark',
  theme: 'healthcare-light',
  dark: false,
  render: () =>
    CssCommonHealthcare() +
    html`
      <style>
        .modal {
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
      </style>
    `,
};

export { CssHealthcareDark, CssHealthcareLight, CssCommonHealthcare };
