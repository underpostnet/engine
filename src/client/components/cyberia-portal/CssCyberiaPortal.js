import { AgGrid } from '../core/AgGrid.js';
import { borderChar, renderRetroFontFaces, subThemeManager } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Modal } from '../core/Modal.js';

const CssCommonCyberia = async () => {
  LoadingAnimation.img.load({
    key: 'points',
    src: 'assets/util/points-loading.gif',
    classes: 'inl',
    style: 'width: 100px; height: 100px',
  });
  subThemeManager.setDarkTheme('#ffcc00');
  subThemeManager.setLightTheme('#ffcc00');
  Modal.labelSelectorTopOffsetEndAnimation = '-15px';
  await AgGrid.RenderStyle({
    eventThemeId: 'CssCommonCyberia',
    style: {
      'font-family': 'retro-font-sensitive',
      'font-size': '24px',
      'no-cell-focus-style': true,
      'row-cursor': 'pointer',
    },
  });

  return html`${renderRetroFontFaces()}
    <style>
      /* Core variables: override in each theme */
      :root {
        --cy-font-retro: 'retro-font';
        --cy-font-retro-title: 'retro-font-title';
        --cy-font-retro-sensitive: 'retro-font-sensitive';
        --cy-font-retro-cta: 'retro-font-cta';
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

      h1,
      h2,
      h3 {
        font-family: var(--cy-font-retro-cta);
      }

      p {
        font-family: var(--cy-font-retro);
      }

      .landing-title,
      .html-main-body h1,
      .html-main-body h2,
      .html-main-body h3 {
        font-size: 5rem;
        color: #ffcc00;
        text-shadow: 2px 2px 0px #9e7b00;
        margin-bottom: 2rem;
      }

      /* Docs section retro styling */
      .submenu-landing-header h1 {
        font-family: var(--cy-font-retro-cta);
        color: #ffcc00;
        text-shadow: 2px 2px 0px #9e7b00;
      }
      .submenu-landing-card {
        border: 2px solid #ffcc00;
        transition: all 0.3s ease-in-out;
      }
      .submenu-landing-card:hover {
        background: rgba(255, 204, 0, 0.08);
        box-shadow:
          0 0 10px rgba(255, 204, 0, 0.3),
          0 0 20px rgba(255, 204, 0, 0.15);
        transform: translateY(-3px);
      }
      .card-icon {
        color: #ffcc00;
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
        background: rgba(255, 204, 0, 0.1);
      }
      .down-arrow-submenu {
        left: 102px;
      }

      .object-layer-viewer-container {
        width: 100% !important;
        font-family: var(--cy-font-retro);
      }

      .cta-button {
        font-family: var(--cy-font-retro-cta);
        font-size: 1.5rem;
        padding: 1rem 2rem;
        border: 3px solid #ffcc00;
        background: transparent;
        color: #ffcc00;
        cursor: pointer;
        transition: all 0.3s ease-in-out;
        text-shadow: 1px 1px 0px #9e7b00;
      }

      .cta-button:hover {
        background: #ffcc00;
        color: #000;
        box-shadow:
          0 0 20px #ffcc00,
          0 0 40px #ffcc00;
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

      /* Studio editors and the foundation context panel show ids, labels and definitions, which are
         case sensitive: they read in the sensitive face at the x-height of the display face. Titles
         keep the display face. */
      .studio-editor,
      .studio-editor .section-mp,
      .studio-editor button,
      .studio-editor p,
      .ol-context,
      .ol-context p {
        font-family: var(--cy-font-retro-sensitive);
      }
      .studio-editor,
      .ol-context {
        font-size-adjust: 0.5;
      }
      .studio-editor .sub-title-modal,
      .studio-editor .studio-group-title {
        font-family: var(--cy-font-retro);
        font-size-adjust: none;
      }
      .studio-editor i,
      .studio-editor .ag-root-wrapper {
        font-size-adjust: none;
      }
      .saga-badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 8px;
        color: #fff;
        font-size: 15px;
        font-weight: bold;
        line-height: 20px;
      }
      .studio-group {
        border: 1px solid var(--studio-border);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 14px;
      }
      .studio-group-title {
        font-size: 16px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 10px;
        opacity: 0.85;
      }

      .btn-modal-default {
        width: 35px;
        height: 35px;
      }
      .handle-btn-container {
        text-shadow: none;
      }
      .cyberia-menu-icon {
        width: 30px;
        height: 30px;
        top: -5px;
      }
      .cyberia-menu-icon-modal {
        top: -3px;
        width: 30px;
        height: 30px;
      }
      .cyberia-text-title-modal {
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
        color: #ffcc00 !important;
      }
    </style>
    ${borderChar(1, `#010101`, [
      '.default-slide-menu-top-bar-fix-title-container-text',
      '.saga-badge',
      '.ol-context-badge',
    ])}

    <div class="ag-grid-style"></div>`;
};

class CssCyberiaDark {
  static theme = 'cyberia-dark';
  static dark = true;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (
      (await CssCommonCyberia()) +
      html`<style>
        :root {
          --studio-border: #3a3a3a;
          --studio-subtle-border: #444;
          --studio-accent: #8cf;
          --studio-accent-warm: #fc8;
          --studio-positive: #9e9;
          --studio-tag: #335;
          --studio-tag-ink: #adf;
          --studio-card: #2a2a2a;
        }
      </style>`
    );
  };
}

class CssCyberiaLight {
  static theme = 'cyberia-light';
  static dark = false;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (
      (await CssCommonCyberia()) +
      html`<style>
        :root {
          --studio-border: #d4d4d4;
          --studio-subtle-border: #e0e0e0;
          --studio-accent: #246;
          --studio-accent-warm: #842;
          --studio-positive: #383;
          --studio-tag: #cde;
          --studio-tag-ink: #246;
          --studio-card: #fff;
        }
      </style>`
    );
  };
}

export { CssCyberiaDark, CssCommonCyberia, CssCyberiaLight };
