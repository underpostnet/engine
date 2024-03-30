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
        --ag-font-family: 'retro-font-sensitive';
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
      .width-mini-box {
        width: 250px;
      }
      .width-mini-box:hover {
        color: #ffcc00;
        background: #313131;
      }
      .width-mini-box-hover:hover {
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
      .sub-container {
        background: #232323;
        border: 2px solid #313131;
        transition: 0.3s;
      }
      .sub-container:hover {
        background: #191919;
        border: 2px solid #313131;
      }
      .inside-input-btn {
        text-align: left;
      }
      .face-world-img {
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
      .PointAndClickMovement-container {
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
        ${borderChar(2, 'black')}
      }
      .bag-slot-type-text {
        padding-top: 70%;
        color: yellow;
        font-size: 16px;
        text-align: center;
        ${borderChar(2, 'black')}
      }
      .bag-slot-name-text {
        font-size: 20px;
        text-align: center;
        ${borderChar(2, 'black')}
      }
      .xp-icon {
        font-size: 70px;
        color: black;
        ${borderChar(2, 'yellow')}
      }
      .sub-head-sub-title-modal {
        color: #ffcc00;
        font-size: 18px;
      }
      .keys-display {
        font-size: 18px;
      }

      .character-container {
        border: 2px solid #313131;
      }

      .character-equip-container {
        width: 330px;
        height: 300px;
      }
      .character-skill-container {
        width: 330px;
        height: 100px;
      }
      .character-slot {
        width: 80px;
        height: 80px;
        border: 2px solid #313131;
      }
      .character-slot-type-text {
        font-size: 12px;
        color: #ffcc00;
        text-align: center;
        padding: 5px;
      }

      .character-slot-faction-symbol {
        top: 17%;
      }
      .character-slot-weapon {
        left: 20%;
        top: 70%;
      }
      .character-slot-breastplate {
        left: 80%;
        top: 70%;
      }
      .character-slot-legs {
        top: 83%;
      }
      .character-slot-helmet {
        left: 80%;
        top: 37%;
      }
      .character-slot-talisman {
        left: 20%;
        top: 37%;
      }
      .main-btn-square-menu {
        width: 93px;
        height: 93px;
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
      .main-btn-menu-text {
        font-size: 14px;
        color: #ffcc00;
        ${borderChar(2, 'black')}
        top: 90%;
      }
      .menu-btn-container {
        width: 310px;
        margin: auto;
      }
      .img-btn-square-view-title {
        width: 60px;
        height: 60px;
        top: -30px;
        left: -1px;
      }
      .text-btn-square-view-title {
        padding-left: 60px;
        ${borderChar(2, 'black')}
      }
      .character-slot-skill {
        width: 50px;
        height: 50px;
        border: 2px solid #313131;
      }
      .character-slot-skill-0 {
        left: 20%;
      }
      .character-slot-skill-1 {
        left: 40%;
      }
      .character-slot-skill-2 {
        left: 60%;
      }
      .character-slot-skill-3 {
        left: 80%;
      }
      .display-current-face {
        font-size: 20px;
        color: white;
      }
      .map-face-slot-container {
        width: 25%;
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
        ${borderChar(2, 'black')}
      }
      .input-file-col,
      .explorer-file-col {
        width: 50%;
      }
      .input-file-sub-col,
      .explorer-file-sub-col {
        min-height: 300px;
        border: 2px solid #313131;
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
      }
      .display-current-element {
        font-family: 'retro-font-sensitive';
      }
      .btn-default-modal-container {
        text-align: right;
        padding-right: 3px;
      }
    `,
};

export { CssCyberia };
