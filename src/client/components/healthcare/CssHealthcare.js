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
        .ripple {
          background: #5c0163;
          background-color: #5c0163;
        }
        .bar-default-modal {
          background: #501455;
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
        .ripple {
          background: #ffb866;
          background-color: #ffb866;
        }
        .bar-default-modal {
          background: #fff0cc;
        }
      </style>
    `,
};

export { CssHealthcareDark, CssHealthcareLight, CssCommonHealthcare };
