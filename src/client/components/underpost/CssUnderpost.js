import { AgGrid } from '../core/AgGrid.js';
import { borderChar, subThemeManager } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { markdownStyle } from '../core/Markdown.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath } from '../core/Router.js';

/** The retro face every Markdown body of this client renders in. */
const MARKDOWN_RETRO_TOKENS = {
  'font-family': 'var(--up-font-retro-sensitive)',
  'heading-font-family': 'var(--up-font-retro-sensitive)',
  'code-font-family': 'var(--up-font-retro-sensitive)',
  'font-size': '24px',
  'code-font-size': '1em',
  h1: '36px',
  h2: '30px',
  h3: '26px',
  h4: '24px',
};

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
      'font-family': `retro-font-sensitive`,
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
      .default-slide-menu-top-bar-fix-title-container {
        top: 10px;
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
        font-size: 30px !important;
        left: -15px !important;
        top: 42px !important;
        color: white !important;
      }

      .modal,
      .badge {
        font-family: var(--up-font-retro);
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
      /* A glyph icon sits in the same box as the image icons. */
      i.underpost-menu-icon,
      i.underpost-menu-icon-modal {
        font-size: 22px;
        line-height: 30px;
        text-align: center;
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
      .public-profile-image-container,
      .public-profile-image,
      .creator-avatar {
        border-radius: 0px !important;
      }

      .underpost-panel-subtitle {
        top: 3px !important;
      }
      /* Clears the fixed hamburger at the pace the bars slide. */
      .underpost-panel-form-container {
        transition: padding-left 0.3s ease;
      }
      @media (prefers-reduced-motion: reduce) {
        .underpost-panel-form-container {
          transition: none;
        }
      }
    </style>

    ${markdownStyle({
      id: 'markdown-style-underpost-panel',
      containers: ['.underpost-panel-cell', '.underpost-panel-cell .markdown-content', '.EasyMDEContainer'],
      tokens: MARKDOWN_RETRO_TOKENS,
    })}
    ${markdownStyle({
      id: 'markdown-style-underpost-preview',
      containers: [
        '.EasyMDEContainer .editor-preview',
        '.EasyMDEContainer .editor-preview-full',
        '.EasyMDEContainer .editor-preview-side',
      ],
      tokens: MARKDOWN_RETRO_TOKENS,
    })}
    ${markdownStyle({
      id: 'markdown-style-underpost-content',
      containers: ['.content-render', '.content-render .markdown-content'],
      tokens: {
        ...MARKDOWN_RETRO_TOKENS,
        'font-size': '22px',
        h1: '18px',
        h2: '16px',
        h3: '14px',
        h4: '14px',
      },
    })}

    <div class="ag-grid-style"></div>
    ${borderChar(1, `#010101`, ['.default-slide-menu-top-bar-fix-title-container-text'])} `;
};

class CssUnderpostDark {
  static theme = 'underpost-dark';
  static dark = true;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (
      (await CssCommonUnderpost()) +
      html`
        <style>
          .action-bar-box {
            color: white;
          }
        </style>
      `
    );
  };
}

class CssUnderpostLight {
  static theme = 'underpost-light';
  static dark = false;
  static barButtonsIconTheme = 'img';
  static render = async () => {
    return (await CssCommonUnderpost()) + html` <style></style> `;
  };
}

export { CssUnderpostDark, CssCommonUnderpost, CssUnderpostLight };
