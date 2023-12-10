import { Modal } from './Modal.js';
import { append, getProxyPath, htmls, s } from './VanillaJs.js';

const proxyPath = getProxyPath();

// https://www.fontspace.com/

const Css = {
  Init: async function (options) {
    if (!options) options = { theme: 'default' };
    const { theme } = options;
    append(
      'body',
      html`
        <style>
          ${css`
            html {
              scroll-behavior: smooth;
            }

            body {
              /* overscroll-behavior: contain; */
              /* box-sizing: border-box; */
              padding: 0px;
              margin: 0px;
            }

            .fl {
              position: relative;
              display: flow-root;
            }

            .abs,
            .in {
              display: block;
            }

            .fll {
              float: left;
            }

            .flr {
              float: right;
            }

            .abs {
              position: absolute;
            }

            .in,
            .inl {
              position: relative;
            }

            .inl {
              display: inline-table;
            }

            .fix {
              position: fixed;
              display: block;
            }

            .stq {
              position: sticky;
            }

            .center {
              transform: translate(-50%, -50%);
              top: 50%;
              left: 50%;
              width: 100%;
              text-align: center;
            }

            input {
              outline: none !important;
              border: none;
            }

            .hide {
              display: none !important;
            }
            /*

placeholder

*/

            ::placeholder {
              color: black;
              opacity: 1;
              /* Firefox */
              background: none;
            }

            :-ms-input-placeholder {
              /* Internet Explorer 10-11 */
              color: black;
              background: none;
            }

            ::-ms-input-placeholder {
              /* Microsoft Edge */
              color: black;
              background: none;
            }

            /*

selection

*/

            ::-moz-selection {
              /* Code for Firefox */
              color: black;
              background: rgb(208, 208, 208);
            }

            ::selection {
              color: black;
              background: rgb(208, 208, 208);
            }

            /*

scrollbar

Hide scrollbar for Chrome, Safari and Opera
[TAG]::-webkit-scrollbar {
display: none;
}
Hide scrollbar for IE, Edge and Firefox
[TAG] {
-ms-overflow-style: none;
scrollbar-width: none;
}

*/

            ::-webkit-scrollbar {
              width: 10px;
            }

            /* Track */
            ::-webkit-scrollbar-track {
              background: #f1f1f1;
            }

            /* Handle */
            ::-webkit-scrollbar-thumb {
              background: #888;
            }

            /* Handle on hover */
            ::-webkit-scrollbar-thumb:hover {
              background: #555;
            }
          `}
        </style>
        <style class="theme"></style>
      `,
    );
    return await Themes[theme]();
  },
  default: async () =>
    append(
      '.theme',
      css`
        .modal {
          background: white;
          color: black;
          font-family: arial;
          border-radius: 10px;
        }
        .bar-default-modal {
          background: #dfdfdf;
          color: black;
        }
        .html-modal-content {
          padding: 5px;
        }
        button {
          background: none;
          outline: none;
          border: none;
          cursor: pointer;
          transition: 0.3s;
          font-size: 15px;
          color: black;
          margin: 5px;
          padding: 5px;
          border-radius: 5px;
          border: 2px solid #bbbbbb;
          min-height: 30px;
          min-width: 30px;
        }
        .title-modal {
          padding: 5px;
          margin: 5px;
          text-transform: capitalize;
          cursor: default;
          font-size: 20px;
        }
        button:hover {
          background: #bbbbbb;
        }
        .box-shadow {
          box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
        }
        .box-shadow:hover {
          box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.2), 0 10px 30px 0 rgba(0, 0, 0, 0.3);
        }
        .toggle-switch-content-border {
          border: 2px solid #bbbbbb;
          padding: 5px;
          transition: 0.3s;
          cursor: pointer;
          top: 5px;
        }
        .toggle-switch-content-border:hover {
          background: #bbbbbb;
        }
        .toggle-switch-content {
          width: 60px;
        }
        .toggle-switch-circle {
          height: 20px;
          width: 20px;
          background: gray;
          transition: 0.3s;
        }

        .section-row {
          cursor: default;
          padding: 15px 0px 15px 0px;
          border-bottom: 2px solid #bbbbbb;
          max-width: 450px;
        }
      `,
    ),
  dark: async () =>
    append(
      '.theme',
      css`
        html {
          background: black;
          color: white;
        }
        .modal {
          /* background: #242124; */
          background: #121212;
          color: white;
          font-family: arial;
          border-radius: 10px;
        }
        .bar-default-modal {
          /* background: #242124; */
          background: #242424;
          color: white;
        }
        .html-modal-content {
          padding: 5px;
        }
        button {
          background: none;
          outline: none;
          border: none;
          cursor: pointer;
          transition: 0.3s;
          font-size: 15px;
          color: white;
          margin: 5px;
          padding: 5px;
          border-radius: 5px;
          border: 2px solid #bbbbbb;
          min-height: 30px;
          min-width: 30px;
        }
        .title-modal {
          padding: 5px;
          margin: 5px;
          text-transform: capitalize;
          cursor: default;
          font-size: 20px;
        }
        button:hover {
          background: #bbbbbb;
          color: black;
        }
        .box-shadow {
          box-shadow: 0 2px 4px 0 rgba(255, 255, 255, 0.2), 0 3px 10px 0 rgba(255, 255, 255, 0.19);
        }
        .box-shadow:hover {
          box-shadow: 0 4px 8px 0 rgba(255, 255, 255, 0.2), 0 5px 15px 0 rgba(255, 255, 255, 0.3);
        }
        .toggle-switch-content-border {
          border: 2px solid #bbbbbb;
          padding: 5px;
          transition: 0.3s;
          cursor: pointer;
          top: 5px;
        }
        .toggle-switch-content-border:hover {
          background: #bbbbbb;
        }
        .toggle-switch-content {
          width: 60px;
        }
        .toggle-switch-circle {
          height: 20px;
          width: 20px;
          background: gray;
          transition: 0.3s;
        }

        .section-row {
          cursor: default;
          padding: 15px 0px 15px 0px;
          border-bottom: 2px solid #bbbbbb;
          max-width: 450px;
        }
      `,
    ),
  cryptokoyn: async () =>
    append(
      '.theme',
      css`
        html {
          background: black;
          color: white;
        }
        .modal {
          /* background: #242124; */
          background: #121212;
          color: white;
          font-family: arial;
          border: 2px solid yellow;
          /* border-radius: 10px; */
        }
        .bar-default-modal {
          /* background: #242124; */
          background: #242424;
          color: white;
        }
        .html-modal-content {
          padding: 5px;
        }
        button {
          background: none;
          outline: none;
          border: none;
          cursor: pointer;
          transition: 0.3s;
          font-size: 15px;
          color: white;
          margin: 5px;
          padding: 5px;
          /* border-radius: 5px; */
          border: 2px solid yellow;
          min-height: 30px;
          min-width: 30px;
        }
        .title-modal {
          padding: 5px;
          margin: 5px;
          text-transform: capitalize;
          cursor: default;
          font-size: 20px;
          color: yellow;
        }
        button:hover {
          background: yellow;
          color: black;
        }
        .box-shadow {
          /* box-shadow: 0 2px 4px 0 rgba(255, 255, 255, 0.2), 0 3px 10px 0 rgba(255, 255, 255, 0.19); */
        }
        .box-shadow:hover {
          /* box-shadow: 0 4px 8px 0 rgba(255, 255, 255, 0.2), 0 5px 15px 0 rgba(255, 255, 255, 0.3); */
        }
        .toggle-switch-content-border {
          border: 2px solid yellow;
          padding: 5px;
          transition: 0.3s;
          cursor: pointer;
          top: 5px;
        }
        .toggle-switch-content-border:hover {
          background: yellow;
        }
        .toggle-switch-content {
          width: 60px;
        }
        .toggle-switch-circle {
          height: 20px;
          width: 20px;
          background: gray;
          transition: 0.3s;
        }

        .section-row {
          cursor: default;
          padding: 15px 0px 15px 0px;
          border-bottom: 2px solid yellow;
          max-width: 450px;
        }
      `,
    ),
  'dark-light': async () =>
    append(
      '.theme',
      css`
        html {
          background: black;
          color: white;
        }
        .modal {
          /* background: #242124; */
          background: #121212;
          color: white;
          font-family: arial;
          border: 2px solid #313131;
          /* border-radius: 10px; */
        }
        .bar-default-modal {
          /* background: #242124; */
          background: #242424;
          color: white;
        }
        .bar-default-modal-icon {
          /* background: #242124; */
          width: 15px;
          height: 15px;
        }
        .html-modal-content {
          padding: 5px;
        }
        button {
          background: none;
          outline: none;
          border: none;
          cursor: pointer;
          transition: 0.3s;
          font-size: 15px;
          color: white;
          margin: 5px;
          padding: 5px;
          /* border-radius: 5px; */
          border: 2px solid #313131;
          min-height: 30px;
          min-width: 30px;
        }
        .title-modal {
          padding: 5px;
          margin: 5px;
          text-transform: capitalize;
          cursor: default;
          font-size: 20px;
          color: yellow;
        }
        button:hover {
          background: #313131;
          color: yellow;
        }
        .box-shadow {
          /* box-shadow: 0 2px 4px 0 rgba(255, 255, 255, 0.2), 0 3px 10px 0 rgba(255, 255, 255, 0.19); */
        }
        .box-shadow:hover {
          /* box-shadow: 0 4px 8px 0 rgba(255, 255, 255, 0.2), 0 5px 15px 0 rgba(255, 255, 255, 0.3); */
        }
        .toggle-switch-content-border {
          border: 2px solid #313131;
          padding: 5px;
          transition: 0.3s;
          cursor: pointer;
          top: 5px;
        }
        .toggle-switch-content-border:hover {
          background: #313131;
        }
        .toggle-switch-content {
          width: 60px;
        }
        .toggle-switch-circle {
          height: 20px;
          width: 20px;
          background: gray;
          transition: 0.3s;
        }
        .section-row {
          cursor: default;
          padding: 15px 0px 15px 0px;
          border-bottom: 2px solid #313131;
          /* max-width: 450px; */
        }
        @keyframes diagonal-lines {
          0% {
            background-position: initial;
          }
          100% {
            background-position: 100px 0px;
          }
        }
        /*
        .progress-bar {
          top: 0px;
          left: 0px;
          transition: 0.3s;
          height: 10px;
          width: 100%;
          background: repeating-linear-gradient(45deg, #606dbc, #606dbc 5%, #465298 5%, #465298 10%);
          background-size: 100px 100px;
          animation: diagonal-lines 2s linear infinite;
        }
        */
        .progress-bar {
          top: 0px;
          left: 0px;
          transition: 0.3s;
          height: 10px;
          width: 100%;
          z-index: 3;
        }
        .diagonal-bar-background-animation {
          background: repeating-linear-gradient(45deg, #cacaca, #d5d5d5 5%, #545454 5%, #505050 10%);
          background-size: 100px 100px;
          animation: diagonal-lines 2s linear infinite;
        }
        .modal-icon-container {
          width: 40px;
          height: 40px;
          top: 5px;
          left: 5px;
          /* border: 2px solid black; */
        }
      `,
    ),
  retro: async () =>
    append(
      '.theme',
      css`
        @font-face {
          font-family: 'retro-font-title';
          src: URL('${proxyPath}assets/fonts/EndlessBossBattleRegular-v7Ey.ttf') format('truetype');
        }
        @font-face {
          font-family: 'retro-font';
          src: URL('${proxyPath}assets/fonts/Pixeboy-z8XGD.ttf') format('truetype');
        }
      `,
    ),
  cyberia: async () =>
    append(
      '.theme',
      css`
        body,
        input,
        .modal,
        button {
          font-family: 'retro-font';
          font-size: 24px;
        }

        .btn-modal-default {
          min-width: 40px;
        }

        button:hover {
          color: #ffcc00;
        }

        i {
          margin: 10px;
        }

        .title-modal {
          color: #ffcc00;
          font-family: 'retro-font-title';
        }

        .sub-title-modal {
          cursor: default;
          font-size: 25px;
          background: #1a1a1a;
          margin-top: 10px;
          /* background: #dcdcdc; */
          /* background: #313131; */
          /* border: 2px solid #313131; */
          /* color: #ffcc00; */
        }

        .toggle-switch-active {
          background: #ffcc00;
          /* background: green; */
        }

        .slot {
          cursor: pointer;
          width: 100px;
          height: 100px;
          border: 2px solid #313131;
          margin: 5px;
        }

        .notification-manager-date {
          font-size: 20px;
          color: #7a7a7a;
        }

        .section-mp {
          margin: 5px;
          margin-top: 15px;
          text-align: left;
        }

        .loading-animation-container {
          text-align: center;
        }
        ::placeholder {
          color: #c6c4c4;
          opacity: 1;
          /* Firefox */
          background: none;
        }

        :-ms-input-placeholder {
          /* Internet Explorer 10-11 */
          color: #c6c4c4;
          background: none;
        }

        ::-ms-input-placeholder {
          /* Microsoft Edge */
          color: #c6c4c4;
          background: none;
        }
        .ag-theme-alpine,
        .ag-theme-alpine-dark {
          /*
          --ag-foreground-color: rgb(126, 46, 132);
          --ag-background-color: rgb(249, 245, 227);
          --ag-header-foreground-color: rgb(204, 245, 172);
          --ag-header-background-color: rgb(209, 64, 129);
          --ag-odd-row-background-color: rgb(0, 0, 0, 0.03);
          --ag-header-column-resize-handle-color: rgb(126, 46, 132);

          --ag-font-size: 17px;
          */
          --ag-font-family: 'retro-font';
          --ag-font-size: 24px;
        }
        .ag-btn-renderer {
          font-size: 16px;
          min-width: 90px;
          min-height: 90px;
        }

        .btn-engine-biome {
          width: 253px;
        }
        .container-component {
          width: 250px;
        }
        .container-component:hover {
          color: #ffcc00;
          background: #313131;
        }

        .input-container {
          cursor: pointer;
          border: 2px solid #313131;
          transition: 0.3s;
        }
        .input-container:hover {
          color: #ffcc00;
          background: #313131;
        }

        input {
          cursor: pointer;
          background: none;
          color: white;
          background: #1a1a1a;
          width: -webkit-fill-available;
        }
        .input-label {
        }
        .input-info {
        }

        .dropdown-container {
          border: 2px solid #313131;
          transition: 0.3s;
          cursor: pointer;
        }
        .dropdown-option {
          width: 250px;
        }
        .dropdown-option:hover {
          color: #ffcc00;
          background: #313131;
        }
      `,
    ),
  fontawesome: async () =>
    append('head', html`<link rel="stylesheet" type="text/css" href="${proxyPath}dist/fontawesome/css/all.min.css" />`),
};

const barLabels = {
  cyberia: {
    close: html`<img class="inl bar-default-modal-icon" src="${proxyPath}assets/icons/close.png" />`,
    maximize: html`<img class="inl bar-default-modal-icon" src="${proxyPath}assets/icons/maximize.png" />`,
    minimize: html`<img class="inl bar-default-modal-icon" src="${proxyPath}assets/icons/minimize.png" />`,
    restore: html`<img class="inl bar-default-modal-icon" src="${proxyPath}assets/icons/restore.png" />`,
    menu: html`<img class="inl bar-default-modal-icon" src="${proxyPath}assets/icons/menu.png" />`,
  },
  fontawesome: {
    close: html`<i class="fa-solid fa-xmark"></i>`,
    maximize: html`<i class="fa-regular fa-square"></i>`,
    minimize: html`<i class="fa-solid fa-window-minimize"></i>`,
    restore: html`<i class="fa-regular fa-window-restore"></i>`,
    menu: html`<i class="fa-solid fa-bars"></i>`,
  },
  default: {
    close: html`X`,
    maximize: html`▢`,
    minimize: html`_`,
    restore: html`□`,
    menu: html`≡`,
  },
};

const barConfig = (options) => {
  const { barButtonsIconTheme } = options;
  return {
    buttons: {
      close: {
        disabled: false,
        label: barLabels[barButtonsIconTheme].close,
      },
      maximize: {
        disabled: false,
        label: barLabels[barButtonsIconTheme].maximize,
      },
      minimize: {
        disabled: false,
        label: barLabels[barButtonsIconTheme].minimize,
      },
      restore: {
        disabled: false,
        label: barLabels[barButtonsIconTheme].restore,
      },
      menu: {
        disabled: false,
        label: barLabels[barButtonsIconTheme].menu,
      },
    },
  };
};

const renderDefaultWindowsModalButtonContent = (options) => {
  const { barButtonsIconTheme, htmlRender } = options;
  const barConfigInstance = barConfig({ barButtonsIconTheme });
  if (htmlRender)
    Object.keys(Modal.Data).map((IdModal) => {
      if (s(`.btn-minimize-${IdModal}`)) htmls(`.btn-minimize-${IdModal}`, barConfigInstance.buttons.minimize.label);
      if (s(`.btn-restore-${IdModal}`)) htmls(`.btn-restore-${IdModal}`, barConfigInstance.buttons.restore.label);
      if (s(`.btn-maximize-${IdModal}`)) htmls(`.btn-maximize-${IdModal}`, barConfigInstance.buttons.maximize.label);
      if (s(`.btn-close-${IdModal}`)) htmls(`.btn-close-${IdModal}`, barConfigInstance.buttons.close.label);
      if (s(`.btn-menu-${IdModal}`)) htmls(`.btn-menu-${IdModal}`, barConfigInstance.buttons.menu.label);
    });
  return { barConfig: barConfigInstance };
};

const Themes = {
  cyberia: async () => {
    const htmlRender = Css.currentTheme !== 'cyberia';
    if (htmlRender) {
      Css.currentTheme = 'cyberia';
      htmls('.theme', '');
      await Css.fontawesome();
      await Css['dark-light']();
      await Css.retro();
      await Css.cyberia();
    }
    return { ...renderDefaultWindowsModalButtonContent({ barButtonsIconTheme: 'cyberia', htmlRender }) };
  },
  default: async () => {
    const htmlRender = Css.currentTheme !== 'default';
    if (htmlRender) {
      Css.currentTheme = 'default';
      htmls('.theme', '');
      await Css.fontawesome();
      await Css.default();
    }
    return { ...renderDefaultWindowsModalButtonContent({ barButtonsIconTheme: 'fontawesome', htmlRender }) };
  },
  'dark-light': async () => {
    const htmlRender = Css.currentTheme !== 'dark-light';
    if (htmlRender) {
      Css.currentTheme = 'dark-light';
      htmls('.theme', '');
      await Css.fontawesome();
      await Css['dark-light']();
    }
    return { ...renderDefaultWindowsModalButtonContent({ barButtonsIconTheme: 'fontawesome', htmlRender }) };
  },
  dark: async () => {
    const htmlRender = Css.currentTheme !== 'dark';
    if (htmlRender) {
      Css.currentTheme = 'dark';
      htmls('.theme', '');
      await Css.fontawesome();
      await Css.dark();
    }
    return { ...renderDefaultWindowsModalButtonContent({ barButtonsIconTheme: 'fontawesome', htmlRender }) };
  },
  cryptokoyn: async () => {
    const htmlRender = Css.currentTheme !== 'cryptokoyn';
    if (htmlRender) {
      Css.currentTheme = 'cryptokoyn';
      htmls('.theme', '');
      await Css.fontawesome();
      await Css.cryptokoyn();
    }
    return { ...renderDefaultWindowsModalButtonContent({ barButtonsIconTheme: 'default', htmlRender }) };
  },
};

const borderChar = (px, color) => html`
  text-shadow: ${px}px -${px}px ${px}px ${color}, -${px}px ${px}px ${px}px ${color}, -${px}px -${px}px ${px}px ${color},
  ${px}px ${px}px ${px}px ${color};
`;

const renderMediaQuery = (mediaData) => {
  //  first limit should be '0'
  return html`
    <style>
      ${mediaData
        .map(
          (mediaState) => css`
            @media only screen and (min-width: ${mediaState.limit}px) {
              ${mediaState.css}
            }
          `,
        )
        .join('')}
    </style>
  `;
};

const renderStatus = (status, options) => {
  switch (status) {
    case 'success':
      return html`<div class="${options?.class ? options.class : 'abs center'}">
        <i style="color: green" class="fa-solid fa-check"></i>
      </div>`;
    case 'error':
      return html`<div class="${options?.class ? options.class : 'abs center'}">
        <i style="color: red" class="fa-solid fa-xmark"></i>
      </div>`;
    case 'warning':
      return html`<div class="${options?.class ? options.class : 'abs center'}">
        <i style="color: yellow" class="fa-solid fa-triangle-exclamation"></i>
      </div>`;
    default:
      return html``;
  }
};

export {
  Css,
  Themes,
  barLabels,
  barConfig,
  borderChar,
  renderMediaQuery,
  renderDefaultWindowsModalButtonContent,
  renderStatus,
};
