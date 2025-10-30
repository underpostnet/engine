import { AgGrid } from '../core/AgGrid.js';
import { borderChar, subThemeManager } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath } from '../core/Router.js';

const CssCommonItemledger = async () => {
  LoadingAnimation.img.load({
    key: 'points',
    src: 'assets/util/points-loading.gif',
    classes: 'inl',
    style: 'width: 100px; height: 100px',
  });
  subThemeManager.setDarkTheme('#00ff88');
  subThemeManager.setLightTheme('#ffcc00');
  Modal.labelSelectorTopOffsetEndAnimation = '-15px';
  await AgGrid.RenderStyle({
    eventThemeId: 'CssCommonItemledger',
    style: {
      'font-family': `retro-font`,
      'font-size': '24px',
      'no-cell-focus-style': true,
      'row-cursor': 'pointer',
    },
  });

  return html`<style>
      /* Core variables: override in each theme */
      :root {
        --il-font-retro: 'retro-font';
        --il-font-retro-title: 'retro-font-title';
        --il-font-retro-sensitive: 'retro-font-sensitive';
      }

      @font-face {
        font-family: 'retro-font-title';
        src: URL('${getProxyPath()}assets/fonts/EndlessBossBattleRegular-v7Ey.ttf') format('truetype');
      }
      @font-face {
        font-family: 'retro-font';
        src: URL('${getProxyPath()}assets/fonts/Pixeboy-z8XGD.ttf') format('truetype');
      }
      @font-face {
        font-family: 'retro-font-sensitive';
        src: URL('${getProxyPath()}assets/fonts/VT323-Regular.ttf') format('truetype');
      }

      /* Base typography and smoothing */

      button,
      .title-main-modal,
      .section-mp,
      .default-slide-menu-top-bar-fix-title-container-text {
        font-family: var(--il-font-retro);
      }

      .default-slide-menu-top-bar-fix-title-container-text {
        font-size: 40px !important;
      }

      input,
      .chat-message-body {
        font-family: var(--il-font-retro-sensitive);
      }

      .btn-modal-default {
        width: 35px;
        height: 35px;
      }
      .handle-btn-container {
        text-shadow: none;
      }
      .itemledger-menu-icon {
        width: 30px;
        height: 30px;
        top: -5px;
      }
      .itemledger-menu-icon-modal {
        top: -3px;
        width: 30px;
        height: 30px;
      }
      .itemledger-text-title-modal {
        top: -10px;
      }
      .main-btn-menu {
        font-size: 20px;
      }
    </style>

    <div class="ag-grid-style"></div>`;
};

const CssItemledgerDark = {
  theme: 'itemledger-dark',
  dark: true,
  barButtonsIconTheme: 'img',
  render: async () => {
    return (
      (await CssCommonItemledger()) +
      html`
        <style>
          button:hover,
          .a-btn:hover {
            background: #212020;
          }
          .action-bar-box {
            color: white;
          }
          .default-slide-menu-top-bar-fix-title-container-text {
            font-size: 40px !important;
            color: black !important;
          }
        </style>
        ${borderChar(2, `#00ff88`, ['.default-slide-menu-top-bar-fix-title-container-text'])}
      `
    );
  },
};

const CssItemledgerLight = {
  theme: 'itemledger-light',
  dark: false,
  barButtonsIconTheme: 'img',
  render: async () => {
    return (
      (await CssCommonItemledger()) +
      html`
        <style>
          button:hover,
          .a-btn:hover {
            background: #d8d8d8;
          }

          .action-bar-box {
            color: black;
          }
          .default-slide-menu-top-bar-fix-title-container-text {
            font-size: 40px !important;
            color: #ffcc00 !important;
          }
        </style>
        ${borderChar(1, `#010101`, ['.default-slide-menu-top-bar-fix-title-container-text'])}
        ${borderChar(1, `#010101`, ['button', '.a-btn'], true)}
      `
    );
  },
};

export { CssItemledgerDark, CssCommonItemledger, CssItemledgerLight };
