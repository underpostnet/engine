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
      strong {
        color: #ffcc00;
      }
      .server-icon {
        width: 40px;
        height: 40px;
        top: 8px;
      }
      .server-status-circle {
        color: green;
        font-size: 30px;
        position: relative;
        top: 4px;
      }
      .action-game-panel {
        z-index: 10;
        font-size: 20px;
      }
      .action-panel-bar-btn-container {
        width: 40px;
        height: 40px;
      }
      .action-panel-img-icon {
        width: 20px;
        height: 20px;
      }
      .action-panel-bar-btn-container:hover {
        background: #c1c1c1;
      }
      .action-panel-bar-btn-container:hover .action-panel-img-icon {
        width: 23px;
        height: 23px;
      }
      .quest-provider-head {
        padding-left: 5px;
      }
      .quest-short-description {
        margin-left: 5px;
      }
      .quest-provide-img {
        width: 95%;
        height: auto;
        margin: auto;
      }
      .bubble-dialog {
        background: white;
        color: black;
        padding: 10px;
        border: 3px solid black;
        font-family: 'retro-font-sensitive';
        margin-bottom: 30px;
        min-height: 40px;
      }
      .section-mp-btn {
        margin: 0px;
      }
      .bubble-dialog-triangle {
      }
      .element-preview {
        width: 130px;
        height: 130px;
        margin: auto;
      }
      .quest-keyboard-bubble-info {
        color: #ffcc00;
        top: -8px;
        left: -6px;
      }
      .quest-step-box {
        width: 50px;
        height: 50px;
        cursor: pointer;
      }
      .quest-step-background-img {
        width: 100%;
        height: 100%;
      }
      .quest-step-check-img {
        width: 40%;
        height: 40%;
        top: 60%;
        left: 60%;
      }
      .quest-step-box:hover .quest-step-background-img {
        width: 105%;
        height: 105%;
      }
      .quest-step-box-disable {
        /* cursor: default !important; */
        /* filter: grayscale(1); */
        opacity: 0.7;
      }
      .quest-step-box-disable .quest-step-background-img {
        /* width: 100% !important;
        height: 100% !important; */
      }
      .quest-interaction-panel-containers-quest-img {
        width: 20px;
        height: 20px;
      }
      .quest-modal-panel-containers-quest-img {
        width: 30px;
        height: 30px;
      }
      .img-btn-square-view-title {
        width: 30px !important;
        height: 30px !important;
        left: 10px !important;
        top: 0px !important;
      }
      .text-btn-square-view-title {
        top: 6px !important;
        color: #ffcc00 !important;
      }
      .cyberia-splash-screen-logo-container {
        font-family: 'retro-font';
        color: black;
        font-size: 30px;
        top: 10px;
        width: 100%;
        text-align: center;
      }
      .cyberia-splash-screen-logo-span {
        font-family: 'retro-font-title';
        font-size: 14px;
        font-weight: normal;
        top: -12px;
        position: relative;
        color: white;
      }
      .logo-cyberia-splash-screen {
        width: 40px;
        height: auto;
        top: 14px;
        left: -6px;
      }
      .down-arrow-submenu {
        top: -20px;
        text-align: right;
        padding-right: 42px;
        color: #5f5f5f;
      }
      .main-body-btn {
        width: 50px;
        height: 50px;
        font-size: 18px;
        cursor: pointer;
        color: black;
      }
      .main-body-btn:hover {
        font-size: 21px;
      }
      .coin-slot-icon-img {
        width: 20px;
        height: 20px;
        top: 4px;
      }
      .map-name-icon-container {
        color: black;
        font-size: 12px;
        bottom: 3px;
        left: 3px;
        height: 15px;
        cursor: pointer;
        z-index: 9;
        color: #ffcc00;
      }
      .map-name-icon-container:hover {
        font-size: 12.5px;
      }
      .icon-img-btn-item-modal {
        width: 20px;
        height: 20px;
        top: 4px;
      }
      .item-modal-container {
        max-width: 400px;
      }
      .item-modal-quantity-input {
        width: 200px;
      }
    </style>
    ${borderChar(2, 'yellow', ['.cyberia-splash-screen-logo-container'])}
    ${borderChar(1, 'yellow', ['.main-body-btn-container'])}
    ${borderChar(1, 'black', ['.cyberia-splash-screen-logo-span', '.map-name-icon-container'])}
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
          body,
          input,
          .modal,
          button {
            font-family: 'retro-font';
            font-size: 24px;
          }

          body {
            overflow: hidden;
          }

          .modal {
            background: rgba(18, 18, 18, 0.9);
          }
          .bar-default-modal {
            background: rgba(36, 36, 36, 0.75);
          }

          .btn-modal-default {
            min-width: 40px;
          }

          button:hover {
            color: #ffcc00;
          }

          i {
            margin: 10px;
          }

          .title-modal {
            color: #ffcc00;
            font-family: 'retro-font-title';
          }

          .sub-title-modal {
            cursor: default;
            background: #1a1a1a;
            margin-top: 10px;
            /* background: #dcdcdc; */
            /* background: #313131; */
            /* border: 2px solid #313131; */
            /* color: #ffcc00; */
          }

          .toggle-switch-active {
            background: #ffcc00;
            /* background: green; */
          }

          .section-mp {
            margin: 5px;
            margin-top: 15px;
            text-align: left;
          }

          ::placeholder {
            color: #c6c4c4;
            opacity: 1;
            /* Firefox */
            background: none;
          }

          :-ms-input-placeholder {
            /* Internet Explorer 10-11 */
            color: #c6c4c4;
            background: none;
          }

          ::-ms-input-placeholder {
            /* Microsoft Edge */
            color: #c6c4c4;
            background: none;
          }

          .width-mini-box {
            width: 256px;
          }

          .width-mini-box:hover {
            color: #ffcc00;
            background: #313131;
          }
          .width-mini-box-hover:hover {
            color: #ffcc00;
            background: #313131;
          }

          .input-container-width {
            cursor: pointer;
            border: 2px solid #313131;
            transition: 0.3s;
          }
          .input-container-width:hover {
            color: #ffcc00;
            background: #313131;
          }

          .input-container {
            cursor: pointer;
            border: 2px solid #313131;
            transition: 0.3s;
          }
          .input-container:hover {
            color: #ffcc00;
            background: #313131;
          }

          input {
            cursor: pointer;
            background: none;
            color: white;
            background: #1a1a1a;
            font-family: 'retro-font-sensitive';
          }

          .input-label {
          }
          .input-info {
          }

          .dropdown-container {
            border: 2px solid #313131;
            transition: 0.3s;
            cursor: pointer;
          }
          .dropdown-option {
            width: 250px;
            padding: 4px;
          }
          .dropdown-option:hover {
            color: #ffcc00;
            background: #313131;
          }
          .tile-object-container {
            font-size: 8px;
          }
          .inside-input-btn {
            text-align: left;
          }
          .face-world-img {
            top: 0%;
            left: 0%;
            width: 100%;
            height: 100%;
          }
          .main-user-container {
            /* border: 2px solid red; */
            z-index: 1;
          }
          .main-user-pixi-container {
            width: 100%;
            height: 100%;
            top: 0px;
            left: 0px;
          }
          .main-user-avatar-img {
            width: 100%;
            height: 100%;
            top: 0px;
            left: 0px;
          }
          .adjacent-map-limit-img {
            width: 100%;
            height: 100%;
          }
          .adjacent-map-limit-to-level-img {
            top: 0%;
            left: 0%;
            width: 100%;
            height: 100%;
          }
          .drop-down-option-info {
            color: #ffcc00;
            font-size: 15px;
          }
          .chat-message-header {
            color: #ffcc00;
          }
          .chat-box {
            border: 2px solid #313131;
            overflow: auto;
            font-family: 'retro-font-sensitive';
          }
          .pixi-canvas-biome {
            width: 100%;
            max-width: 600px;
          }

          .main-skill-container {
            bottom: 5px;
            right: 5px;
            /* border: 2px solid red; */
            box-sizing: border-box;
            width: 200px;
            height: 200px;
            z-index: 3;
            cursor: url('${getProxyPath()}assets/cursor/white-pointer.png') -30 -30, auto !important;
          }
          .main-skill-slot {
            /* border: 2px solid blue; */
            box-sizing: border-box;
            width: 50%;
            height: 50%;
          }
          .main-skill-background-img {
            width: 90%;
            height: 90%;
          }
          /* + ~ > */
          .main-skill-slot:hover .main-skill-background-img {
            width: 95%;
            height: 95%;
          }
          .main-skill-key-text {
            top: 20%;
            left: 20%;
            font-size: 50px;
            color: #ffcc00;
          }
          .main-skill-img {
            width: 50%;
            height: 50%;
          }
          .dynamic-joystick-container-cyberia-joystick {
            cursor: url('${getProxyPath()}assets/cursor/white-pointer.png') -30 -30, auto !important;
          }
          .main-skill-cooldown {
            width: 60%;
            height: 60%;
            background: rgba(0, 0, 0, 0.5);
            transition: 0.35;
            border-radius: 10px;
          }

          .user-lifeBar {
            left: 0px;
          }
          .PointAndClickMovementCyberia-container {
            z-index: 2;
            top: 54px;
            cursor: url('${getProxyPath()}assets/cursor/white-pointer.png') -30 -30, auto !important;
          }
          .bag-slot-img {
            width: 80%;
            height: 80%;
          }
          .bag-slot-count {
            color: white;
            width: 30px;
            height: 30px;
            top: 5px;
            right: 5px;
            z-index: 1;
          }
          .bag-slot-type-text {
            padding-top: 70%;
            color: #ffcc00;
            font-size: 16px;
            text-align: center;
          }
          .bag-slot-name-text {
            font-size: 20px;
            text-align: center;
          }
          .text-icon {
            font-size: 70px;
            color: black;
          }
          .sub-head-sub-title-modal {
            color: #ffcc00;
            font-size: 18px;
          }
          .keys-display {
            font-size: 18px;
          }

          .character-container,
          .item-modal-container,
          .quest-modal-container {
            border: 2px solid #313131;
          }

          .character-container:hover,
          .quest-modal-container {
            background: rgba(255, 255, 255, 0.03);
          }

          .character-equip-container {
            width: 320px;
            height: 300px;
          }
          .character-skill-container {
            top: -40px;
            width: 320px;
            height: 150px;
          }
          .character-slot {
            width: 80px;
            height: 80px;
            border: 2px solid #313131;
            cursor: pointer;
          }
          .character-slot:hover {
            background: #313131;
          }

          .character-slot:hover .bag-slot-img {
            width: 90%;
            height: 90%;
          }
          .character-slot-type-text {
            font-size: 12px;
            color: #ffcc00;
            text-align: center;
            padding: 5px;
            width: 120%;
          }

          .character-slot-container-faction-symbol {
            top: 17%;
          }
          .character-slot-container-weapon {
            left: 20%;
            top: 70%;
          }
          .character-slot-container-breastplate {
            left: 80%;
            top: 70%;
          }
          .character-slot-container-legs {
            top: 83%;
          }
          .character-slot-container-helmet {
            left: 80%;
            top: 37%;
          }
          .character-slot-container-talisman {
            left: 20%;
            top: 37%;
          }
          .main-btn-square-menu {
            transition: none;
          }
          .main-btn-square-menu:hover .img-btn-square-menu {
            width: 90%;
            height: 90%;
          }
          .img-btn-square-menu {
            width: 80%;
            height: 80%;
          }
          .main-btn-menu {
            text-align: left;
          }
          .main-btn-menu-text {
            font-size: 14px;
            color: #ffcc00;
            top: 90%;
          }
          .character-slot-skill {
            width: 50px;
            height: 50px;
            border: 2px solid #313131;
            cursor: pointer;
          }

          .character-slot-skill:hover {
            background: #313131;
          }

          .character-slot-skill:hover .bag-slot-img {
            width: 90%;
            height: 90%;
          }

          .character-slot-container-basic-skill {
            left: 20%;
          }

          .character-slot-container-primary-skill {
            left: 40%;
          }
          .character-slot-container-secondary-skill {
            left: 60%;
          }
          .character-slot-container-definitive-skill {
            left: 80%;
          }
          .map-face-slot-container {
            height: 30px;
          }
          .map-face-slot {
            width: 25px;
            height: 25px;
            background: #80751980; /* #f5dd11d9 */
            border: 2px solid #313131;
            transition: 0.3s;
          }
          .map-face-symbol-text {
            color: white;
            font-size: 14px;
          }
          .input-file-col,
          .explorer-file-col {
            width: 50%;
          }
          .input-file-sub-col {
            border: 2px solid #313131;
            padding: 10px;
            min-height: 300px;
          }
          .explorer-file-sub-col {
          }
          input::file-selector-button {
            background: #232323;
            font-family: 'retro-font';
            transition: 0.3s;
            cursor: pointer;
            padding: 3px;
            color: #dddddd;
          }
          input::file-selector-button:hover {
            background: #191919;
            color: #ffcc00;
          }
          .eye-password {
            font-size: 16px;
            position: relative;
            margin: 5px;
          }
          .btn-eye-password {
            background: #191919;
            color: #717171;
            text-align: center;
            padding-top: 4px;
            padding-bottom: 4px;
          }
          .btn-bar-modal-container {
            text-align: right;
            padding-right: 3px;
          }
          .bag-slot {
            cursor: pointer;
            width: 100px;
            height: 100px;
            border: 2px solid #313131;
            margin: 5px;
            /* box-sizing: border-box; */
          }
          .bag-slot:hover {
            background: #313131;
          }
          .bag-slot:hover .bag-slot-img {
            width: 90%;
            height: 90%;
          }
          .bag-slot:hover .text-icon {
            font-size: 75px;
          }
          .item-modal-section-cell {
            /* border: 2px solid red;
           min-height: 100px; */
          }
          .item-modal-img {
            width: 80%;
            height: auto;
            margin: auto;
          }
          .stat-table-cell {
            width: 50%;
            /*  border: 2px solid #313131; */
            box-sizing: border-box;
            font-size: 16px;
          }
          .stat-table-cell-key {
            color: #ffcc00;
          }
          .header-icon-item-modal {
            width: 30px;
            height: 30px;
            padding: 5px;
            top: 8px;
          }
          .sub-title-item-modal {
            cursor: default;
            /* background: #1a1a1a; */
            margin-top: 10px;
            /* background: #dcdcdc; */
            /* background: #313131; */
            /* border: 2px solid #313131; */
            /* color: #ffcc00; */
          }
          .form-button {
            width: 260px;
            font-size: 20px;
            padding: 10px;
            text-align: center;
          }
          .drop-zone-file-explorer {
            min-height: 300px;
          }
          .toggle-form-container {
            width: 239px;
            font-size: 20px;
            border: 2px solid #313131;
            padding: 10px;
          }
          .sub-character-slot {
            width: 100%;
            height: 100%;
          }
          .main-skill-cooldown-delay-time-text {
            font-size: 21px;
          }
          .character-container-stats {
            width: 320px;
            height: 450px;
          }
          .character-container-view {
            height: 450px;
            width: 320px;
            overflow: hidden;
          }
          .action-bar-box:hover {
            background: none !important;
          }
          .action-bar-box:hover .img-btn-square-menu {
            width: 85%;
            height: 85%;
          }
          .typeWriteSectionsString {
            font-size: 18px;
          }
          .dialog-step-container {
            margin: 10px;
            font-size: 18px;
          }
          .button-quest-modal-forward {
            width: 70px;
            height: 70px;
            bottom: 10px;
            right: 20px;
            cursor: pointer;
            z-index: 4;
          }
          .button-quest-modal-forward:hover .button-quest-modal-img {
            width: 85%;
            height: 85%;
          }
          .button-quest-modal-img {
            width: 80%;
            height: 80%;
          }
        </style>

        ${borderChar(2, 'black', [
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
        ${borderChar(2, 'yellow', ['.text-icon'])}
      `
    );
  },
};

export { CssCyberiaDark, CssCommonCyberia };
