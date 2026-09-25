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
  subThemeManager.setDarkTheme('#24FBFFFF');
  subThemeManager.setLightTheme('#24FBFFFF');
  Modal.labelSelectorTopOffsetEndAnimation = '-15px';
  await AgGrid.RenderStyle({
    eventThemeId: 'CssCommonItemledger',
    style: {
      'font-family': `retro-font-sensitive`,
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
        --il-font-retro-cta: 'retro-font-cta';
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
      .search-result-item {
        font-family: 'retro-font-sensitive';
      }
      .down-arrow-submenu {
        left: 102px;
      }

      /* Docs section retro styling */
      .docs-header h1 {
        font-family: var(--il-font-retro-cta);
        color: #24fbff;
        text-shadow: 2px 2px 0px #127e80;
      }
      .docs-card {
        border: 2px solid #24fbff;
        transition: all 0.3s ease-in-out;
      }
      .docs-card:hover {
        background: rgba(36, 251, 255, 0.08);
        box-shadow:
          0 0 10px rgba(36, 251, 255, 0.3),
          0 0 20px rgba(36, 251, 255, 0.15);
        transform: translateY(-3px);
      }
      .card-icon {
        color: #24fbff;
      }
      .card-content h3 {
        font-family: var(--il-font-retro-cta);
        font-size: 1.25rem;
      }
      .card-content p {
        font-family: var(--il-font-retro);
      }
      .submenu-btn {
        font-family: var(--il-font-retro);
      }
      .submenu-btn:hover {
        background: rgba(36, 251, 255, 0.1);
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
        font-family: var(--il-font-retro-cta);
        font-size: 5rem;
        color: #24fbff;
        text-shadow: 2px 2px 0px #127e80;
        margin-bottom: 2rem;
      }

      p {
        font-family: var(--il-font-retro);
      }

      .cta-button {
        font-family: var(--il-font-retro-cta);
        font-size: 1.5rem;
        padding: 1rem 2rem;
        border: 3px solid #24fbff;
        background: transparent;
        color: #24fbff;
        cursor: pointer;
        transition: all 0.3s ease-in-out;
        text-shadow: 1px 1px 0px #127e80;
      }

      .cta-button:hover {
        background: #24fbff;
        color: #000;
        box-shadow:
          0 0 20px #24fbff,
          0 0 40px #24fbff;
        text-shadow: none;
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
      .input-container {
        width: 278px;
      }
      .default-slide-menu-top-bar-fix-title-container-text {
        font-size: 40px !important;
        color: #24fbffff !important;
      }
    </style>

    ${borderChar(1, `black`, ['.default-slide-menu-top-bar-fix-title-container-text'])}
    <div class="ag-grid-style"></div>`;
};

class CssItemledgerDark {
  static theme = 'itemledger-dark';
  static dark = true;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (await CssCommonItemledger()) + html` <style></style> `;
  };
}

class CssItemledgerLight {
  static theme = 'itemledger-light';
  static dark = false;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (await CssCommonItemledger()) + html` <style></style> `;
  };
}

export { CssItemledgerDark, CssCommonItemledger, CssItemledgerLight };
