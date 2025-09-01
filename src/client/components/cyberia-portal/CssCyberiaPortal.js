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
        --cy-accent: #ffcc00; /* brand accent */
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
      body,
      input,
      textarea,
      button,
      select {
        font-family: var(--cy-font-retro);
      }

      .btn-modal-default {
        width: 35px;
        height: 35px;
      }
    </style>
    <div class="ag-grid-style"></div>`;
};

const CssCyberiaDark = {
  theme: 'cyberia-dark',
  dark: true,
  barButtonsIconTheme: 'img',
  render: async () => {
    return (await CssCommonCyberia()) + html``;
  },
};

const CssCyberiaLight = {
  theme: 'cyberia-light',
  dark: false,
  barButtonsIconTheme: 'img',
  render: async () => {
    return (await CssCommonCyberia()) + html``;
  },
};

export { CssCyberiaDark, CssCommonCyberia, CssCyberiaLight };
