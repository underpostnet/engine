import { AgGrid } from './AgGrid.js';
import { boxShadow, scrollBarDarkRender, scrollBarLightRender } from './Css.js';
import { append, getProxyPath, s } from './VanillaJs.js';

const CssCommonCore = async () => {
  if (!s(`.fa-link`))
    append(
      'head',
      html`<link
        class="fa-link"
        rel="stylesheet"
        type="text/css"
        href="${getProxyPath()}dist/fontawesome/css/all.min.css"
      />`,
    );
  await AgGrid.RenderStyle();
  return html`<style>
      .top-bar-app-icon {
        width: 35px;
        height: 35px;
      }
      .mini-title {
        font-size: 15px;
      }
      .top-bar-search-box-container {
        cursor: pointer;
      }
      .toggle-switch-active {
        background: #28b428 !important;
      }
      .progress-bar {
        top: 0;
        left: 0;
        transition: 0.3s;
        height: 5px;
        width: 100%;
        z-index: 11;
      }
      .handle-btn-container {
        width: 30px;
        height: 30px;
        /* border: 2px solid #5f5f5f; */
        /* color: #313131; */
        color: #5f5f5f;
        cursor: grab;
        right: 2px;
        top: -3px;
      }
      .handle-btn-container:active {
        cursor: grabbing !important;
      }
      .btn-label-content {
        height: 100%;
        top: 15px;
      }
      .badge {
        min-width: 20px;
        height: 20px;
        border-radius: 3px;
        background: #3b434b;
        position: relative;
        font-size: 12px;
        font-family: arial;
      }
      .badge-text {
        /* color: white; */
        padding: 3px 6px 0px 6px;
      }
      .badge-notification-circle-red {
        background: #bd0c0c;
        border-radius: 50%;
      }
      .top-box-profile-container {
        top: 0px;
        right: 0px;
        box-sizing: border-box;
        /* border: 2px solid red; */
      }
      .top-box-profile-img-container {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        overflow: hidden;
      }
      .top-box-profile-img {
        width: 45px;
        height: auto;
      }
      .account-profile-image-container {
        width: 140px;
        height: 140px;
        border-radius: 50%;
        overflow: hidden;
      }
      .account-profile-image {
        max-width: 160px;
        transition: 0.3s;
        background: #ffffff96;
      }
      .verify-email-status {
        color: gray;
      }
      .management-table-btn {
        font-size: 30px;
        width: 96px;
        height: 93px;
      }
      .management-table-btn-mini {
        font-size: 15px;
        width: 48px;
        height: 46.5px;
      }
      .ripple {
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 600ms linear;
        background-color: rgba(137, 137, 137, 0.503);
      }
      @keyframes ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }
      .title-view-modal {
        top: 8px;
        font-size: 21px !important;
        position: absolute !important;
      }
      .title-view-modal .view-title-icon {
        font-size: 21px !important;
      }
    </style>
    <style>
      .lds-dual-ring-mini,
      .lds-dual-ring-mini:after {
        box-sizing: border-box;
      }
      .lds-dual-ring-mini {
        display: inline-block;
        width: 40px;
        height: 40px;
      }
      .lds-dual-ring-mini:after {
        content: ' ';
        display: block;
        width: 32px;
        height: 32px;
        margin: 4px;
        border-radius: 50%;
        border: 3.2px solid currentColor;
        border-color: currentColor transparent currentColor transparent;
        animation: lds-dual-ring-mini 1.2s linear infinite;
      }
      @keyframes lds-dual-ring-mini {
        0% {
          transform: rotate(0);
        }
        100% {
          transform: rotate(360deg);
        }
      }
    </style>
    ${boxShadow({ selector: '.account-profile-image' })}
    <div class="ag-grid-style"></div>`;
};

const CssCoreDark = {
  theme: 'core-dark',
  dark: true,
  render: async () =>
    (await CssCommonCore()) +
    html`
      <style>
        @keyframes diagonal-lines {
          0% {
            background-position: initial;
          }
          to {
            background-position: 100px 0;
          }
        }
        html {
          background: #000;
          color: #fff;
          overflow: hidden;
        }
        .modal {
          background: #121212;
          color: #fff;
          font-family: arial;
        }
        .bar-default-modal {
          background: #242424;
          color: #fff;
        }
        .bar-default-modal-icon {
          width: 15px;
          height: 15px;
        }
        button {
          outline: 0;
          font-size: 15px;
          margin: 5px;
          min-height: 30px;
          min-width: 30px;
          color: #e6e6e6;
          background: none;
        }
        .hover:hover {
          background: #313131;
        }
        .hover-active {
          background: #313131;
        }
        button:hover {
          background: #313131;
        }
        .title-modal {
          padding: 5px;
          margin: 5px;
          cursor: default;
          font-size: 20px;
        }
        .box-content-border,
        button {
          border: 2px solid #313131;
          padding: 5px;
          cursor: pointer;
        }
        .box-content-border:hover {
          background: #313131;
        }
        .toggle-switch-content {
          width: 60px;
        }
        .toggle-switch-content-checkbox {
          border: 2px solid #5b5b5b;
          width: 50px;
          height: 50px;
        }
        .toggle-switch-circle {
          height: 20px;
          width: 20px;
          background: gray;
          transition: 0.3s;
        }
        .diagonal-bar-background-animation {
          background: repeating-linear-gradient(45deg, #cacaca, #d5d5d5 5%, #545454 5%, #505050 10%);
          background-size: 100px 100px;
          animation: diagonal-lines 2s linear infinite;
        }
        .modal-icon-container {
          width: 40px;
          height: 40px;
          top: 5px;
          left: 5px;
        }
        .slide-menu-top-bar {
          width: 100%;
          top: 0;
          right: 0;
        }
        body,
        html {
          font-size: 20px;
        }
        .html-modal-menu {
          padding: 0;
        }
        .main-btn-menu {
          text-align: left;
          padding: 15px;
          transition: none;
          margin: 0;
          border: 0;
          height: 52px;
        }
        .main-btn-menu-active {
          background: #212020;
        }
        .a-btn {
          text-decoration: none;
          color: white;
        }
        .a-btn:hover {
          color: white;
        }
        .input-file-sub-col {
          border: 2px solid #313131;
          padding: 10px;
          min-height: 300px;
        }
        .explorer-file-col,
        .input-file-col {
          width: 50%;
        }
        .btn-input-file-explorer {
          padding: 15px;
        }
        input::file-selector-button {
          background: #232323;
          transition: 0.3s;
          cursor: pointer;
          padding: 3px;
          color: #ddd;
        }
        input::file-selector-button:hover {
          background: #191919;
        }
        .drop-hover-container {
          background: #232323;
          border: 2px solid #313131;
          transition: 0.3s;
        }
        .drop-hover-container:hover {
          background: #191919;
          border: 2px solid #313131;
        }
        .tool-btn-file-explorer {
          min-height: 60px;
          min-width: 60px;
          font-size: 24px;
          padding: 10px;
        }
        .file-explorer-nav {
          padding: 5px;
        }
        .input-container,
        .input-container-width {
          cursor: pointer;
          border: 2px solid #313131;
          transition: 0.3s;
        }
        .input-container-width:hover,
        .input-container:hover {
          color: #fff;
          background: #313131;
        }
        .input-container {
          width: 256px;
        }
        .btn-eye-password {
          text-align: center;
          background: #1a1a1a;
          font-size: 17px;
          padding-top: 7px;
          padding-bottom: 6px;
        }
        ::placeholder {
          color: #c6c4c4;
          opacity: 1;
          background: 0 0;
        }
        :-ms-input-placeholder {
          color: #c6c4c4;
          background: 0 0;
        }
        ::-ms-input-placeholder {
          color: #c6c4c4;
          background: 0 0;
        }

        input:hover {
          color: #ffffff;
        }
        input {
          cursor: pointer;
          color: #e6e6e6;
          background: #1a1a1a;
          font-size: 20px;
          padding: 5px;
        }
        .input-label {
          padding: 8px;
        }
        .input-info {
          padding: 5px;
          font-size: 16px;
        }
        .section-mp {
          margin: 15px 5px 5px;
          text-align: left;
        }
        .menu-btn-icon {
          font-size: 20px;
          margin: 12px;
        }
        .view-title-icon {
          font-size: 35px;
          margin: 20px;
        }
        .btn-bar-modal-container {
          text-align: right;
          padding-right: 3px;
        }
        .chat-message-header {
          color: #ccc;
        }
        .chat-box {
          border: 2px solid #313131;
          overflow: auto;
        }
        .sub-title-modal {
          cursor: default;
          background: 0 0;
          margin-top: 10px;
          padding: 10px;
          color: #fff;
        }
        .sub-title-icon {
          font-size: 30px;
        }
        .dropdown-container {
          border: 2px solid #313131;
          transition: 0.3s;
          cursor: pointer;
        }
        .btn-custom {
          width: 260px;
          font-size: 20px;
          padding: 10px;
        }
        .toggle-form-container {
          border: 2px solid #313131;
          cursor: pointer;
        }
        .toggle-form-container,
        .dropdown-option {
          width: 238px;
          font-size: 20px;
          padding: 10px;
        }
        .dropdown-option:hover {
          color: #c1c1c1;
          background: #313131;
        }
        .chart-container {
          background: #232323;
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
        a {
          color: #b1a7a7;
        }
        a:hover {
          color: #ffffff;
        }
        .content-render {
          font-size: 16px;
          font-family: monospace;
        }
        .input-extension {
          background: #1a1a1a;
        }
        .btn-input-extension {
          margin: 5px 0 0 0;
          padding: 5px;
          font-size: 16px;
        }
        .btn-input-extension:hover {
        }
      </style>
      ${scrollBarDarkRender()}
    `,
};

const CssCoreLight = {
  theme: 'core-light',
  dark: false,
  render: async () =>
    (await CssCommonCore()) +
    html`
      <style>
        .modal {
          background: #fff;
          color: #000;
          font-family: arial;
          border-radius: 10px;
        }
        .top-bar-search-box-container {
          border-radius: 10px;
        }
        .bar-default-modal {
          background: #dfdfdf;
          color: #000;
        }
        button {
          padding: 5px;
          margin: 5px;
          outline: 0;
          cursor: pointer;
          transition: 0.3s;
          font-size: 15px;
          border-radius: 5px;
          border: 2px solid #bbb;
          min-height: 30px;
          min-width: 30px;
          color: #313131;
          background: none;
        }
        button:hover {
          background: #bbbbbb;
        }
        .hover:hover {
          background: #bbbbbb;
        }
        .hover-active {
          background: #bbbbbb;
        }
        .title-modal {
          cursor: default;
          font-size: 20px;
          padding: 5px;
          margin: 5px;
        }
        .box-shadow {
          box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
        }
        .box-shadow:hover {
          box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.2), 0 10px 30px 0 rgba(0, 0, 0, 0.3);
        }
        .box-content-border {
          border: 2px solid #bbb;
          padding: 5px;
          transition: 0.3s;
          cursor: pointer;
        }
        .box-content-border:hover {
          background: #bbb;
        }
        .toggle-switch-content {
          width: 60px;
        }
        .toggle-switch-content-checkbox {
          border: 2px solid #5b5b5b;
          width: 50px;
          height: 50px;
        }
        .toggle-switch-circle {
          height: 20px;
          width: 20px;
          background: gray;
          transition: 0.3s;
        }
        .slide-menu-top-bar {
          width: 100%;
          top: 0;
          right: 0;
        }
        .modal-icon-container {
          width: 40px;
          height: 40px;
          top: 5px;
          left: 5px;
        }
        html {
          overflow: hidden;
        }
        body,
        html {
          font-size: 20px;
        }
        .html-modal-menu {
          padding: 0;
        }
        button,
        button:hover {
          color: #000;
        }
        .main-btn-menu {
          text-align: left;
          padding: 15px;
          transition: none;
          margin: 0;
          border: 0;
          height: 52px;
        }
        .main-btn-menu-active {
          background: #d8d8d8;
        }
        .a-btn {
          text-decoration: none;
          color: black;
        }
        .a-btn:hover {
          color: black;
        }
        .input-file-sub-col {
          border: 2px solid #bbb;
          padding: 10px;
          border-radius: 5px;
          min-height: 300px;
        }
        .explorer-file-col,
        .input-file-col {
          width: 50%;
        }
        .btn-input-file-explorer {
          padding: 15px;
        }
        input::file-selector-button {
          background: #cacaca;
          transition: 0.3s;
          cursor: pointer;
          padding: 3px;
          color: #232323;
        }
        input::file-selector-button:hover {
          background: #bcbcbc;
        }
        .drop-hover-container {
          background: #cacaca;
          border: 2px solid #313131;
          transition: 0.3s;
        }
        .drop-hover-container:hover {
          background: #bcbcbc;
          border: 2px solid #313131;
        }
        .tool-btn-file-explorer {
          min-height: 60px;
          min-width: 60px;
          font-size: 24px;
          padding: 10px;
        }
        .file-explorer-nav {
          padding: 5px;
        }
        .input-container {
          cursor: pointer;
          border-radius: 5px;
          border: 2px solid #bbb;
          transition: 0.3s;
          width: 256px;
        }
        .input-container:hover {
          color: #1a1a1a;
          background: #c9c9c9;
        }
        .btn-eye-password {
          text-align: center;
          background: #eaeaea;
          font-size: 17px;
          padding-top: 7px;
          padding-bottom: 6px;
        }
        ::placeholder {
          color: #333;
          opacity: 1;
          background: 0 0;
        }
        :-ms-input-placeholder {
          color: #333;
          background: 0 0;
        }
        ::-ms-input-placeholder {
          color: #333;
          background: 0 0;
        }
        .title-modal {
          color: #000;
        }
        input {
          cursor: pointer;
          color: #272727;
          background: #eaeaea;
          font-size: 20px;
          padding: 5px;
        }
        .input-label {
          padding: 8px;
        }
        .input-info {
          padding: 5px;
          font-size: 16px;
        }
        .section-mp {
          margin: 15px 5px 5px;
          text-align: left;
        }
        .menu-btn-icon {
          font-size: 20px;
          margin: 12px;
        }
        .view-title-icon {
          font-size: 35px;
          margin: 20px;
        }
        .btn-bar-modal-container {
          text-align: right;
          padding-right: 3px;
        }
        .chat-message-header {
          color: #222;
        }
        .chat-box {
          border: 2px solid #bbb;
          overflow: auto;
          border-radius: 5px;
        }
        .sub-title-modal {
          cursor: default;
          background: 0 0;
          margin-top: 10px;
          padding: 10px;
          color: #000;
        }
        .sub-title-icon {
          font-size: 30px;
        }
        .dropdown-container {
          border-radius: 5px;
          border: 2px solid #bbb;
          transition: 0.3s;
          cursor: pointer;
        }
        .btn-custom {
          width: 260px;
          font-size: 20px;
          padding: 10px;
        }
        .toggle-form-container {
          border-radius: 5px;
          border: 2px solid #bbb;
          cursor: pointer;
        }
        .toggle-form-container,
        .dropdown-option {
          width: 238px;
          font-size: 20px;
          padding: 10px;
        }
        .dropdown-option:hover {
          color: #313131;
          background: #c1c1c1;
        }
        .chart-container {
          background: #e4e4e4;
        }
        .form-button {
          width: 260px;
          font-size: 20px;
          padding: 10px;
          text-align: center;
        }
        .input-container-width {
          cursor: pointer;
          border: 2px solid #bbb;
          transition: 0.3s;
          border-radius: 5px;
        }
        .input-container-width:hover {
          color: #202020;
          background: #c9c9c9;
        }
        .drop-zone-file-explorer {
          min-height: 300px;
        }
        a {
          color: #6d68ff;
        }
        a:hover {
          color: #e89f4c;
        }
        .content-render {
          font-size: 16px;
          font-family: monospace;
        }
        .input-extension {
          background: #eaeaea;
        }
        .btn-input-extension {
          margin: 5px 0 0 0;
          padding: 5px;
          font-size: 16px;
        }
        .btn-input-extension:hover {
        }
      </style>
      ${scrollBarLightRender()}
    `,
};

export { CssCoreDark, CssCoreLight };
