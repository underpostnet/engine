import { AgGrid } from '../core/AgGrid.js';
import { borderChar, subThemeManager } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath } from '../core/Router.js';

const CssCommonUnderpost = async () => {
  LoadingAnimation.img.load({
    key: 'points',
    src: 'assets/util/points-loading.gif',
    classes: 'inl',
    style: 'width: 100px; height: 100px',
  });
  subThemeManager.setDarkTheme('#f70808');
  subThemeManager.setLightTheme('#aa0000');
  Modal.labelSelectorTopOffsetEndAnimation = '-15px';
  await AgGrid.RenderStyle({
    eventThemeId: 'CssCommonUnderpost',
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
        --up-font-retro: 'retro-font';
        --up-font-retro-title: 'retro-font-title';
        --up-font-retro-sensitive: 'retro-font-sensitive';
        --up-font-retro-cta: 'retro-font-cta';
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
      @font-face {
        font-family: 'retro-font-cta';
        src: URL('${getProxyPath()}assets/fonts/PressStart2P-Regular.ttf') format('truetype');
      }

      /* Landing Page & Object Viewer Styles */
      .landing-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        width: 100%;
        background: #000;
        color: #fff;
        text-align: center;
      }

      .landing-title,
      h1,
      h2,
      h3 {
        font-family: var(--up-font-retro-cta);
        font-size: 5rem;
        color: #f70808;
        text-shadow: 2px 2px 0px #7a0404;
        margin-bottom: 2rem;
      }

      p {
        font-family: var(--up-font-retro);
      }

      .object-layer-viewer-container {
        width: 100% !important;
        font-family: var(--up-font-retro);
      }

      .cta-button {
        font-family: var(--up-font-retro-cta);
        font-size: 1.5rem;
        padding: 1rem 2rem;
        border: 3px solid #f70808;
        background: transparent;
        color: #f70808;
        cursor: pointer;
        transition: all 0.3s ease-in-out;
        text-shadow: 1px 1px 0px #7a0404;
      }

      .cta-button:hover {
        background: #f70808;
        color: #000;
        box-shadow:
          0 0 20px #f70808,
          0 0 40px #f70808;
        text-shadow: none;
      }

      /* Base typography and smoothing */

      button,
      .title-main-modal,
      .section-mp,
      .default-slide-menu-top-bar-fix-title-container-text {
        font-family: var(--up-font-retro);
      }

      .default-slide-menu-top-bar-fix-title-container-text {
        font-size: 40px !important;
      }

      input,
      .chat-message-body {
        font-family: var(--up-font-retro-sensitive);
      }

      .btn-modal-default {
        width: 35px;
        height: 35px;
      }
      .handle-btn-container {
        text-shadow: none;
      }
      .underpost-menu-icon {
        width: 30px;
        height: 30px;
        top: -5px;
      }
      .underpost-menu-icon-modal {
        top: -3px;
        width: 30px;
        height: 30px;
      }
      .underpost-text-title-modal {
        top: -10px;
      }
      .main-btn-menu {
        font-size: 20px;
      }
      .input-container {
        width: 278px;
      }
    </style>

    <div class="ag-grid-style"></div>`;
};

const CssUnderpostDark = {
  theme: 'underpost-dark',
  dark: true,
  barButtonsIconTheme: 'img',
  render: async () => {
    return (
      (await CssCommonUnderpost()) +
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
        ${borderChar(2, `#f70808`, ['.default-slide-menu-top-bar-fix-title-container-text'])}
      `
    );
  },
};

const CssUnderpostLight = {
  theme: 'underpost-light',
  dark: false,
  barButtonsIconTheme: 'img',
  render: async () => {
    return (
      (await CssCommonUnderpost()) +
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
            color: #aa0000 !important;
          }
        </style>
        ${borderChar(1, `#010101`, ['.default-slide-menu-top-bar-fix-title-container-text'])}
        ${borderChar(1, `#010101`, ['button', '.a-btn'], true)}
      `
    );
  },
};

export { CssUnderpostDark, CssCommonUnderpost, CssUnderpostLight };
