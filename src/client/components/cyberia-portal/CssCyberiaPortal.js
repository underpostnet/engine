import { AgGrid } from '../core/AgGrid.js';
import { borderChar } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { getProxyPath } from '../core/VanillaJs.js';

const CssCommonCyberia = async () => {
  LoadingAnimation.img.load({
    key: 'points',
    src: 'assets/util/points-loading.gif',
    classes: 'inl',
    style: 'width: 100px; height: 100px',
  });
  LoadingAnimation.setDarkColor('#ffcc00');
  LoadingAnimation.setLightColor('#ffcc00');
  await AgGrid.RenderStyle({
    eventThemeId: 'CssCommonCyberia',
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
        --cy-font-retro: 'retro-font';
        --cy-font-retro-title: 'retro-font-title';
        --cy-font-retro-sensitive: 'retro-font-sensitive';
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
      .title-view-modal,
      .section-mp {
        font-family: var(--cy-font-retro);
      }

      input,
      .chat-message-body {
        font-family: var(--cy-font-retro-sensitive);
      }

      .btn-modal-default {
        width: 35px;
        height: 35px;
      }
      button:hover,
      .a-btn:hover {
        color: #ffcc00;
      }
      .handle-btn-container {
        text-shadow: none;
      }
    </style>

    <div class="ag-grid-style"></div>`;
};

const CssCyberiaDark = {
  theme: 'cyberia-dark',
  dark: true,
  barButtonsIconTheme: 'img',
  render: async () => {
    return (
      (await CssCommonCyberia()) +
      html`
        <style>
          button:hover,
          .a-btn:hover {
            background: #212020;
          }
          .action-bar-box {
            color: white;
          }
        </style>
      `
    );
  },
};

const CssCyberiaLight = {
  theme: 'cyberia-light',
  dark: false,
  barButtonsIconTheme: 'img',
  render: async () => {
    return (
      (await CssCommonCyberia()) +
      html` <style>
          button:hover,
          .a-btn:hover {
            background: #d8d8d8;
          }

          .action-bar-box {
            color: black;
          }
        </style>
        ${borderChar(1, `#010101`, ['button', '.a-btn'], true)}`
    );
  },
};

export { CssCyberiaDark, CssCommonCyberia, CssCyberiaLight };
