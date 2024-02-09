import { borderChar } from '../core/Css.js';
import { getProxyPath } from '../core/VanillaJs.js';

const CssCyberia = {
  theme: 'cyberia',
  render: async () =>
    css`
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

      .main-btn {
        width: -webkit-fill-available;
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

      .slot {
        cursor: pointer;
        width: 100px;
        height: 100px;
        border: 2px solid #313131;
        margin: 5px;
      }

      .notification-manager-date {
        font-size: 20px;
        color: #7a7a7a;
      }

      .section-mp {
        margin: 5px;
        margin-top: 15px;
        text-align: left;
      }

      .loading-animation-container {
        text-align: center;
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
      .ag-theme-alpine,
      .ag-theme-alpine-dark {
        /*
        --ag-foreground-color: rgb(126, 46, 132);
        --ag-background-color: rgb(249, 245, 227);
        --ag-header-foreground-color: rgb(204, 245, 172);
        --ag-header-background-color: rgb(209, 64, 129);
        --ag-odd-row-background-color: rgb(0, 0, 0, 0.03);
        --ag-header-column-resize-handle-color: rgb(126, 46, 132);
  
        --ag-font-size: 17px;
        */
        --ag-font-family: 'retro-font';
        --ag-font-size: 24px;
      }
      .ag-btn-renderer {
        font-size: 16px;
        min-width: 90px;
        min-height: 90px;
      }

      .btn-custom {
        width: 253px;
      }
      .container-component {
        width: 250px;
      }
      .container-component:hover {
        color: #ffcc00;
        background: #313131;
      }
      .container-component-hover:hover {
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
        width: -webkit-fill-available;
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
      }
      .dropdown-option:hover {
        color: #ffcc00;
        background: #313131;
      }
      .tile-cell {
        width: 10px;
        height: 10px;
        border: 1px solid gray;
        box-sizing: border-box;
        cursor: pointer;
      }
      .tile-cell:hover {
        border: 1px solid yellow;
      }
      .tile-object-container {
        font-size: 8px;
      }
      .toggle-switch-input-container {
        background: #232323;
        padding: 5px;
      }
      .face-world-img {
        width: 100%;
        height: 100%;
      }
      .main-user-container {
        /* border: 2px solid red; */
        z-index: 1;
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
      .display-current-face {
        top: 50px;
        right: 50px;
        font-size: 60px;
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
      }
      .warn-logout {
        text-align: center;
        padding-top: 50px;
        padding-bottom: 50px;
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
        z-index: 1;
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
        ${borderChar(2, 'black')}
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
        ${borderChar(2, 'black')}
      }

      .user-lifeBar {
        left: 0px;
      }
    `,
};

export { CssCyberia };
