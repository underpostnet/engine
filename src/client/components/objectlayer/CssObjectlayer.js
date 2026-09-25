import { AgGrid } from '../core/AgGrid.js';
import { borderChar, subThemeManager } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath } from '../core/Router.js';

const CssCommonObjectlayer = async () => {
  LoadingAnimation.img.load({
    key: 'points',
    src: 'assets/util/points-loading.gif',
    classes: 'inl',
    style: 'width: 100px; height: 100px',
  });
  subThemeManager.setDarkTheme('#68ec89');
  subThemeManager.setLightTheme('#68ec89');
  Modal.labelSelectorTopOffsetEndAnimation = '-15px';
  await AgGrid.RenderStyle({
    eventThemeId: 'CssCommonObjectlayer',
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
        --ol-font-retro: 'retro-font';
        --ol-font-retro-title: 'retro-font-title';
        --ol-font-retro-sensitive: 'retro-font-sensitive';
        --ol-font-retro-cta: 'retro-font-cta';
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
        font-family: var(--ol-font-retro-cta);
        font-size: 5rem;
        color: #7cff6b;
        text-shadow: 2px 2px 0px #2f7a2a;
        margin-bottom: 2rem;
      }

      p {
        font-family: var(--ol-font-retro);
      }

      .object-layer-viewer-container {
        width: 100% !important;
        font-family: var(--ol-font-retro);
      }

      .cta-button {
        font-family: var(--ol-font-retro-cta);
        font-size: 1.5rem;
        padding: 1rem 2rem;
        border: 3px solid #7cff6b;
        background: transparent;
        color: #7cff6b;
        cursor: pointer;
        transition: all 0.3s ease-in-out;
        text-shadow: 1px 1px 0px #2f7a2a;
      }

      .cta-button:hover {
        background: #7cff6b;
        color: #000;
        box-shadow:
          0 0 20px #7cff6b,
          0 0 40px #7cff6b;
        text-shadow: none;
      }

      /* Base typography and smoothing */

      button,
      .title-main-modal,
      .section-mp,
      .default-slide-menu-top-bar-fix-title-container-text {
        font-family: var(--ol-font-retro);
      }

      .default-slide-menu-top-bar-fix-title-container-text {
        font-size: 40px !important;
      }

      input,
      .chat-message-body {
        font-family: var(--ol-font-retro-sensitive);
      }

      .btn-modal-default {
        width: 35px;
        height: 35px;
      }
      .handle-btn-container {
        text-shadow: none;
      }
      .objectlayer-menu-icon {
        width: 30px;
        height: 30px;
        top: -5px;
      }
      .objectlayer-menu-icon-modal {
        top: -3px;
        width: 30px;
        height: 30px;
      }
      .objectlayer-text-title-modal {
        top: -10px;
      }
      .main-btn-menu {
        font-size: 20px;
      }
      .input-container {
        width: 278px;
      }
      .down-arrow-submenu {
        left: 102px;
      }

      /* Docs section retro styling */
      .docs-header h1 {
        font-family: var(--ol-font-retro-cta);
        color: #7cff6b;
        text-shadow: 2px 2px 0px #2f7a2a;
      }
      .docs-card {
        border: 2px solid #7cff6b;
        transition: all 0.3s ease-in-out;
      }
      .docs-card:hover {
        background: rgba(124, 255, 107, 0.08);
        box-shadow:
          0 0 10px rgba(124, 255, 107, 0.3),
          0 0 20px rgba(124, 255, 107, 0.15);
        transform: translateY(-3px);
      }
      .card-icon {
        color: #7cff6b;
      }
      .card-content h3 {
        font-family: var(--ol-font-retro-cta);
        font-size: 1.25rem;
      }
      .card-content p {
        font-family: var(--ol-font-retro);
      }
      .submenu-btn {
        font-family: var(--ol-font-retro);
      }
      .submenu-btn:hover {
        background: rgba(124, 255, 107, 0.1);
      }
      .default-slide-menu-top-bar-fix-title-container-text {
        font-size: 40px !important;
        color: #68ec89 !important;
      }
    </style>

    ${borderChar(1, `black`, ['.default-slide-menu-top-bar-fix-title-container-text'])}
    <div class="ag-grid-style"></div>`;
};

class CssObjectlayerDark {
  static theme = 'objectlayer-dark';
  static dark = true;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (await CssCommonObjectlayer()) + html` <style></style> `;
  };
}

class CssObjectlayerLight {
  static theme = 'objectlayer-light';
  static dark = false;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (await CssCommonObjectlayer()) + html` <style></style> `;
  };
}

export { CssObjectlayerDark, CssCommonObjectlayer, CssObjectlayerLight };
