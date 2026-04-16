import { borderChar, boxShadow, subThemeManager } from '../core/Css.js';

const CssCommonCecinasmarcelina = async () => {
  subThemeManager.setDarkTheme('#c0392b');
  subThemeManager.setLightTheme('#8b4513');
  return html`<style>
      .slide-menu-icon {
        width: 25px;
        height: 25px;
      }
      .menu-label-text-slide-menu-icon {
        top: -4px;
      }
    </style>
    ${borderChar(1, 'black', [])} ${boxShadow({ selector: `.home-body-btn` })}`;
};

const CssCecinasmarcelinaDark = {
  themePair: 'cecinasmarcelina-light',
  theme: 'cecinasmarcelina-dark',
  dark: true,
  render: async () => {
    return (
      (await CssCommonCecinasmarcelina()) +
      html`
        <style>
          .modal,
          .main-btn-menu,
          .input-extension {
            background: #1a0a0a;
          }
          button:hover,
          .hover:hover,
          .main-btn-menu-active,
          .dropdown-option:hover,
          .input-container:hover,
          .toggle-form-container:hover,
          .ripple {
            background: #3d1111;
            background-color: #3d1111;
          }
          .bar-default-modal,
          .btn-eye-password,
          input {
            background: #2a0e0e;
          }
          .toggle-switch-circle {
            background: #6b1f1f;
          }
          .dropdown-container,
          .toggle-form-container,
          .input-container {
            border: 2px solid #3d1111;
          }
          button {
            border: 2px solid #3d1111;
          }
          .main-body-top {
            background: rgb(26 10 10 / 50%) !important;
          }
        </style>
      `
    );
  },
};

const CssCecinasmarcelinaLight = {
  themePair: 'cecinasmarcelina-dark',
  theme: 'cecinasmarcelina-light',
  dark: false,
  render: async () => {
    return (
      (await CssCommonCecinasmarcelina()) +
      html`
        <style>
          .modal,
          .main-btn-menu,
          .input-extension {
            background: #f5ddd0;
          }
          button:hover,
          .hover:hover,
          .main-btn-menu-active,
          .dropdown-option:hover,
          .input-container:hover,
          .toggle-form-container:hover,
          .ripple {
            background: #edd0c0;
            background-color: #edd0c0;
          }
          .bar-default-modal,
          .btn-eye-password,
          input {
            background: #faeee6;
          }
          .toggle-switch-circle {
            background: #a0522d;
          }
          .dropdown-container,
          .toggle-form-container,
          .input-container {
            border: 2px solid #f5ddd0;
          }
          button {
            border: 2px solid #f5ddd0;
          }
          .main-body-top {
            background: rgb(253 245 240 / 50%) !important;
          }
        </style>
      `
    );
  },
};

export { CssCecinasmarcelinaDark, CssCommonCecinasmarcelina, CssCecinasmarcelinaLight };
