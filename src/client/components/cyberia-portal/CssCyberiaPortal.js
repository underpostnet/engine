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
  // Keep accent color consistent across themes (brand identity)
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
        --cy-bg: #0f0f0f; /* default base (dark) */
        --cy-surface: rgba(255, 255, 255, 0.03);
        --cy-text: #eaeaea;
        --cy-muted: #c6c4c4;
        --cy-border: #313131;
        --cy-radius: 10px;
        --cy-elevation-1: 0 6px 18px rgba(0, 0, 0, 0.45);
        --cy-elevation-2: 0 12px 30px rgba(0, 0, 0, 0.5);
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

      /* Accessibility helpers */
      :focus-visible {
        outline: 3px solid var(--cy-accent);
        outline-offset: 3px;
      }
      :focus {
        outline: none;
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
          animation-duration: 0s !important;
        }
      }

      /* Base typography and smoothing */
      body,
      input,
      textarea,
      button,
      select {
        font-family: var(--cy-font-retro);
        color: var(--cy-text);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      strong {
        color: var(--cy-accent);
      }

      /* Small UI pieces */
      .server-icon {
        width: 40px;
        height: 40px;
        top: 8px;
      }
      .server-status-circle {
        color: #4cd137;
        font-size: 30px;
        position: relative;
        top: 4px;
      }

      /* Action panel */
      .action-game-panel {
        z-index: 10;
        font-size: 20px;
      }
      .action-panel-bar-btn-container {
        width: 40px;
        height: 40px;
        border-radius: var(--cy-radius);
        transition: transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .action-panel-img-icon {
        width: 20px;
        height: 20px;
        transition: transform 0.12s ease;
      }
      .action-panel-bar-btn-container:hover {
        transform: translateY(-2px);
        background: var(--cy-surface);
        box-shadow: var(--cy-elevation-1);
      }
      .action-panel-bar-btn-container:active {
        transform: translateY(0);
      }

      /* Dialogs */
      .bubble-dialog {
        background: var(--cy-surface);
        color: var(--cy-text);
        padding: 12px;
        border: 2px solid var(--cy-border);
        font-family: var(--cy-font-retro-sensitive);
        margin-bottom: 22px;
        min-height: 44px;
        border-radius: 8px;
      }

      .section-mp-btn {
        margin: 6px;
        padding: 5px;
        text-align: left;
        max-width: 320px;
      }

      .element-preview {
        width: 130px;
        height: 130px;
        margin: auto;
        border-radius: 8px;
        overflow: hidden;
      }

      .quest-keyboard-bubble-info {
        color: var(--cy-accent);
        top: -8px;
        left: -6px;
      }

      .quest-step-box {
        width: 50px;
        height: 50px;
        cursor: pointer;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid var(--cy-border);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .quest-step-box:hover {
        transform: scale(1.05);
      }

      .img-btn-square-view-title {
        width: 30px;
        height: 30px;
        left: 10px;
        top: -2px;
      }
      .text-btn-square-view-title {
        top: 8px;
        color: var(--cy-accent);
        padding-left: 48px;
      }

      .cyberia-splash-screen-logo-container {
        font-family: var(--cy-font-retro);
        color: var(--cy-text);
        font-size: 30px;
        top: 10px;
        width: 100%;
        text-align: center;
      }
      .cyberia-splash-screen-logo-span {
        font-family: var(--cy-font-retro-title);
        font-size: 14px;
        font-weight: normal;
        top: -12px;
        position: relative;
        color: var(--cy-text);
      }
      .logo-cyberia-splash-screen {
        width: 40px;
        height: auto;
        top: 14px;
        left: -6px;
      }

      .main-body-btn {
        width: 50px;
        height: 50px;
        font-size: 18px;
        cursor: pointer;
        color: var(--cy-text);
        background: transparent;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .main-body-btn:hover {
        transform: translateY(-2px);
        color: var(--cy-accent);
      }

      .map-name-icon-container {
        color: var(--cy-accent);
        font-size: 12px;
        bottom: 3px;
        left: 3px;
        height: 15px;
        cursor: pointer;
        z-index: 9;
      }

      .item-modal-container {
        max-width: 420px;
        background: var(--cy-surface);
        border: 2px solid var(--cy-border);
        border-radius: 10px;
        box-shadow: var(--cy-elevation-1);
      }
      .item-modal-quantity-input {
        width: 200px;
      }

      /* Inputs / dropdown tweaks */
      input,
      textarea,
      select {
        background: none;
        border: 2px solid var(--cy-border);
        padding: 5px;
        margin: 5px;
        border-radius: 8px;
        color: var(--cy-text);
        transition: border-color 0.14s ease, box-shadow 0.14s ease;
      }
      .top-bar-search-box {
        margin: 0px;
      }
      input::placeholder,
      textarea::placeholder {
        color: var(--cy-muted);
        opacity: 1;
      }
      input:focus,
      textarea:focus,
      select:focus {
        border-color: var(--cy-accent);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
      }

      /* small responsive helpers */
      .width-mini-box {
        width: 256px;
      }
      .width-mini-box:hover {
        color: var(--cy-accent);
        background: var(--cy-surface);
      }

      .btn-eye-password {
        background: none;
      }

      /* Bag / slots */
      .bag-slot {
        cursor: pointer;
        width: 100px;
        height: 100px;
        border: 2px solid var(--cy-border);
        margin: 6px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .bag-slot:hover {
        background: var(--cy-surface);
        box-shadow: var(--cy-elevation-1);
      }
      .bag-slot-img {
        width: 80%;
        height: 80%;
        object-fit: contain;
      }
      .bag-slot-count {
        color: var(--cy-text);
        width: 30px;
        height: 30px;
        top: 45px;
        right: 5px;
        z-index: 1;
      }
      .bag-slot-type-text {
        padding-top: 85%;
        color: var(--cy-accent);
        font-size: 16px;
        text-align: center;
      }

      /* Skill container */
      .main-skill-container {
        bottom: 5px;
        right: 5px;
        box-sizing: border-box;
        width: 175px;
        height: 175px;
        z-index: 3;
        cursor: url('${getProxyPath()}assets/cursor/white-pointer.png') -30 -30, auto !important;
      }
      .main-skill-background-img {
        width: 90%;
        height: 90%;
      }
      .main-skill-key-text {
        top: 20%;
        left: 20%;
        font-size: 50px;
        color: var(--cy-accent);
      }

      /* Small helpers that render borders using helpers */
    </style>
    ${borderChar(2, 'var(--cy-accent)', ['.cyberia-splash-screen-logo-container'])}
    ${borderChar(1, 'var(--cy-accent)', ['.main-body-btn-container'])}
    ${borderChar(1, 'var(--cy-border)', ['.cyberia-splash-screen-logo-span', '.map-name-icon-container'])}
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
          /* Dark theme overrides - subtle glass surfaces and deeper contrast */
          :root {
            --cy-bg: #0f0f0f;
            --cy-surface: rgba(255, 255, 255, 0.03);
            --cy-text: #eaeaea;
            --cy-muted: #c6c4c4;
            --cy-border: #313131;
          }

          body,
          input,
          .modal,
          button {
            font-family: var(--cy-font-retro);
            font-size: 24px;
          }
          body {
            background: linear-gradient(180deg, #070707 0%, #111111 100%);
            color: var(--cy-text);
            overflow: hidden;
          }

          .modal {
            background: linear-gradient(180deg, rgba(22, 22, 22, 0.88), rgba(14, 14, 14, 0.88));
            border-radius: 12px;
            backdrop-filter: blur(6px);
          }
          .bar-default-modal {
            background: rgba(36, 36, 36, 0.75);
          }

          .btn-modal-default {
            min-width: 40px;
            border-radius: 8px;
          }

          button:hover {
            color: var(--cy-accent);
          }

          .title-modal {
            color: var(--cy-accent);
            font-family: var(--cy-font-retro-title);
          }

          .sub-title-modal {
            cursor: default;
            background: rgba(26, 26, 26, 0.6);
            margin-top: 10px;
            border-radius: 8px;
          }

          .toggle-switch-active {
            background: var(--cy-accent);
          }

          ::placeholder {
            color: var(--cy-muted);
          }

          .width-mini-box:hover,
          .input-container:hover {
            color: var(--cy-accent);
            background: rgba(255, 255, 255, 0.02);
          }
          .input-container,
          .input-container-width {
            border: 2px solid var(--cy-border);
            transition: 0.18s;
          }

          input {
            background: none;
            color: var(--cy-text);
            background: rgba(18, 18, 18, 0.6);
            font-family: var(--cy-font-retro-sensitive);
          }

          .dropdown-container {
            border: 2px solid var(--cy-border);
            transition: 0.18s;
          }
          .dropdown-option:hover {
            color: var(--cy-accent);
            background: rgba(255, 255, 255, 0.02);
          }

          .chat-box {
            border: 2px solid var(--cy-border);
            overflow: auto;
            font-family: var(--cy-font-retro-sensitive);
          }

          .main-skill-container {
            cursor: url('${getProxyPath()}assets/cursor/white-pointer.png') -30 -30, auto !important;
          }
          .dynamic-joystick-container-cyberia-joystick {
            cursor: url('${getProxyPath()}assets/cursor/white-pointer.png') -30 -30, auto !important;
          }

          .character-slot {
            border: 2px solid var(--cy-border);
            cursor: pointer;
          }
          .character-slot:hover {
            background: #313131;
          }

          .map-face-slot {
            background: rgba(128, 117, 25, 0.5);
            border: 2px solid var(--cy-border);
          }

          input::file-selector-button {
            background: #232323;
            color: #dddddd;
            border-radius: 6px;
          }
          input::file-selector-button:hover {
            background: #191919;
            color: var(--cy-accent);
          }

          .bag-slot:hover {
            background: #313131;
          }
          .bag-slot:hover .bag-slot-img {
            width: 90%;
            height: 90%;
          }

          .form-button {
            width: 260px;
            font-size: 20px;
            padding: 5px;
            text-align: center;
            min-height: 45px;
            border-radius: 8px;
            background: linear-gradient(90deg, rgba(255, 204, 0, 0.12), rgba(255, 204, 0, 0.06));
            color: var(--cy-text);
            border: 1px solid rgba(255, 204, 0, 0.12);
          }
        </style>

        ${borderChar(2, 'var(--cy-border)', [
          '.main-skill-key-text',
          '.main-skill-cooldown',
          '.bag-slot-count',
          '.bag-slot-name-text',
          '.bag-slot-type-text',
          '.main-btn-menu-text',
          '.text-btn-square-view-title',
          '.map-face-symbol-text',
          '.quest-keyboard-bubble-info',
          '.quest-step-box',
        ])}
        ${borderChar(2, 'var(--cy-accent)', ['.text-icon'])}
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
      html`
        <style>
          /* Light theme overrides - clean surfaces and soft elevation */
          :root {
            --cy-bg: #f5f6f8;
            --cy-surface: #ffffff;
            --cy-text: #111214;
            --cy-muted: #6b6b6b;
            --cy-border: #e0e0e0;
            --cy-accent: #ffcc00;
          }

          body,
          input,
          .modal,
          button {
            font-family: var(--cy-font-retro);
            font-size: 24px;
          }
          body {
            background: var(--cy-bg);
            color: var(--cy-text);
            overflow: hidden;
          }

          .modal {
            background: rgba(255, 255, 255, 0.98);
            box-shadow: 0 10px 30px rgba(16, 24, 40, 0.06);
            border-radius: 12px;
          }
          .bar-default-modal {
            background: rgba(255, 255, 255, 0.9);
          }

          .btn-modal-default {
            min-width: 40px;
            border-radius: 8px;
          }

          button:hover {
            color: var(--cy-accent);
          }

          .title-modal {
            color: var(--cy-accent);
            font-family: var(--cy-font-retro-title);
          }

          .sub-title-modal {
            cursor: default;
            background: transparent;
            margin-top: 10px;
          }

          .toggle-switch-active {
            background: var(--cy-accent);
          }

          ::placeholder {
            color: var(--cy-muted);
          }

          .width-mini-box:hover,
          .input-container:hover {
            color: var(--cy-accent);
            background: rgba(0, 0, 0, 0.02);
          }
          .input-container,
          .input-container-width {
            border: 2px solid var(--cy-border);
            transition: 0.18s;
          }

          input {
            background: none;
            color: var(--cy-text);
            background: transparent;
            font-family: var(--cy-font-retro-sensitive);
          }

          .dropdown-container {
            border: 2px solid var(--cy-border);
            transition: 0.18s;
          }
          .dropdown-option:hover {
            color: var(--cy-accent);
            background: rgba(0, 0, 0, 0.04);
          }

          .chat-box {
            border: 2px solid var(--cy-border);
            overflow: auto;
            font-family: var(--cy-font-retro-sensitive);
            background: var(--cy-surface);
          }

          .main-skill-container {
            cursor: url('${getProxyPath()}assets/cursor/black-pointer.png') -30 -30, auto !important;
          }
          .dynamic-joystick-container-cyberia-joystick {
            cursor: url('${getProxyPath()}assets/cursor/black-pointer.png') -30 -30, auto !important;
          }

          .character-slot {
            border: 2px solid var(--cy-border);
            cursor: pointer;
          }
          .character-slot:hover {
            background: rgba(0, 0, 0, 0.03);
          }

          .map-face-slot {
            background: #f1e8b3;
            border: 2px solid var(--cy-border);
          }

          input::file-selector-button {
            background: #f0f0f0;
            color: #222;
            border-radius: 6px;
          }
          input::file-selector-button:hover {
            background: #e8e8e8;
            color: var(--cy-accent);
          }

          .bag-slot:hover {
            background: rgba(0, 0, 0, 0.03);
          }
          .bag-slot:hover .bag-slot-img {
            width: 90%;
            height: 90%;
          }

          .form-button {
            width: 260px;
            font-size: 20px;
            padding: 5px;
            text-align: center;
            min-height: 45px;
            border-radius: 8px;
            background: var(--cy-accent);
            color: #111;
            border: 1px solid rgba(0, 0, 0, 0.06);
            box-shadow: 0 8px 20px rgba(16, 24, 40, 0.05);
          }
        </style>

        ${borderChar(2, 'var(--cy-border)', [
          '.main-skill-key-text',
          '.main-skill-cooldown',
          '.bag-slot-count',
          '.bag-slot-name-text',
          '.bag-slot-type-text',
          '.main-btn-menu-text',
          '.text-btn-square-view-title',
          '.map-face-symbol-text',
          '.quest-keyboard-bubble-info',
          '.quest-step-box',
        ])}
        ${borderChar(2, 'var(--cy-accent)', ['.text-icon'])}
      `
    );
  },
};

export { CssCyberiaDark, CssCommonCyberia, CssCyberiaLight };
