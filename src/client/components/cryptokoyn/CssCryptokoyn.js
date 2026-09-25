import { AgGrid } from '../core/AgGrid.js';
import { borderChar, subThemeManager } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath } from '../core/Router.js';

const CssCommonCryptokoyn = async () => {
  LoadingAnimation.img.load({
    key: 'points',
    src: 'assets/util/points-loading.gif',
    classes: 'inl',
    style: 'width: 100px; height: 100px',
  });
  subThemeManager.setDarkTheme('#ff0d0d');
  subThemeManager.setLightTheme('#f25454');
  Modal.labelSelectorTopOffsetEndAnimation = '-15px';
  await AgGrid.RenderStyle({
    eventThemeId: 'CssCommonCryptokoyn',
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
        --cy-font-retro: 'retro-font';
        --cy-font-retro-title: 'retro-font-title';
        --cy-font-retro-sensitive: 'retro-font-sensitive';
        --cy-font-retro-cta: 'retro-font-cta';
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
        font-family: var(--cy-font-retro-cta);
        font-size: 5rem;
        color: #ff0d0d;
        text-shadow: 2px 2px 0px #9e0808;
        margin-bottom: 2rem;
      }

      p {
        font-family: var(--cy-font-retro);
      }

      .object-layer-viewer-container {
        width: 100% !important;
        font-family: var(--cy-font-retro);
      }

      .cta-button {
        font-family: var(--cy-font-retro-cta);
        font-size: 1.5rem;
        padding: 1rem 2rem;
        border: 3px solid #ff0d0d;
        background: transparent;
        color: #ff0d0d;
        cursor: pointer;
        transition: all 0.3s ease-in-out;
        text-shadow: 1px 1px 0px #9e0808;
      }

      .cta-button:hover {
        background: #ff0d0d;
        color: #000;
        box-shadow:
          0 0 20px #ff0d0d,
          0 0 40px #ff0d0d;
        text-shadow: none;
      }

      /* Base typography and smoothing */

      button,
      .title-main-modal,
      .section-mp,
      .default-slide-menu-top-bar-fix-title-container-text {
        font-family: var(--cy-font-retro);
      }

      .default-slide-menu-top-bar-fix-title-container-text {
        font-size: 40px !important;
      }

      input,
      .chat-message-body {
        font-family: var(--cy-font-retro-sensitive);
      }

      /* Wallet copy is case sensitive (addresses, recovery phrases, standards), so the whole
         view reads in the sensitive face, sized up to match the display face's weight. */
      .wallet-view,
      .wallet-view .section-mp,
      .wallet-view button,
      .wallet-view input,
      .wallet-view a {
        font-family: var(--cy-font-retro-sensitive);
        font-size: 22px;
      }
      .wallet-view .sub-title-modal {
        font-family: var(--cy-font-retro);
        font-size: 26px;
      }
      .wallet-view .wallet-address,
      .wallet-view .wallet-mnemonic {
        font-size: 24px;
        color: #ff0d0d;
      }

      .btn-modal-default {
        width: 35px;
        height: 35px;
      }
      .handle-btn-container {
        text-shadow: none;
      }
      .cryptokoyn-menu-icon {
        width: 30px;
        height: 30px;
        top: -5px;
      }
      .cryptokoyn-menu-icon-modal {
        top: -3px;
        width: 30px;
        height: 30px;
      }
      .cryptokoyn-text-title-modal {
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
        font-family: var(--cy-font-retro-cta);
        color: #ff0d0d;
        text-shadow: 2px 2px 0px #9e0808;
      }
      .docs-card {
        border: 2px solid #ff0d0d;
        transition: all 0.3s ease-in-out;
      }
      .docs-card:hover {
        background: rgba(255, 13, 13, 0.08);
        box-shadow:
          0 0 10px rgba(255, 13, 13, 0.3),
          0 0 20px rgba(255, 13, 13, 0.15);
        transform: translateY(-3px);
      }
      .card-icon {
        color: #ff0d0d;
      }
      .card-content h3 {
        font-family: var(--cy-font-retro-cta);
        font-size: 1.25rem;
      }
      .card-content p {
        font-family: var(--cy-font-retro);
      }
      .submenu-btn {
        font-family: var(--cy-font-retro);
      }
      .submenu-btn:hover {
        background: rgba(255, 13, 13, 0.1);
      }
      .default-slide-menu-top-bar-fix-title-container-text {
        font-size: 40px !important;
        color: #ff0d0d !important;
      }
    </style>

    ${borderChar(1, `black`, ['.default-slide-menu-top-bar-fix-title-container-text'])}
    <div class="ag-grid-style"></div>`;
};

class CssCryptokoynDark {
  static theme = 'cryptokoyn-dark';
  static dark = true;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (await CssCommonCryptokoyn()) + html` <style></style> `;
  };
}

class CssCryptokoynLight {
  static theme = 'cryptokoyn-light';
  static dark = false;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (await CssCommonCryptokoyn()) + html` <style></style> `;
  };
}

export { CssCryptokoynDark, CssCommonCryptokoyn, CssCryptokoynLight };
