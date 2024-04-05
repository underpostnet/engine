const CssNexodev = {
  theme: 'nexodev',
  render: async () => css`
    html {
      overflow: hidden;
    }
    html,
    body {
      /*  color: #bdbdbd; */
      font-size: 20px;
    }
    .nexodev-title-logo {
      width: 40px;
      height: 35px;
      top: 2px;
      left: -9px;
    }
    .html-modal-menu {
      padding: 0px;
    }
    .nexodev-title-nexo {
      font-size: 24px;
    }
    button:hover {
      /* color: #6a0660; */
      color: #ffffff;
    }
    .main-btn-menu {
      text-align: left;
      padding: 15px;
      transition: none;
      /* margin: 2px; */
      margin: 0;
      border: none;
      /* background: #1a1a1a; */
    }
    .input-file-sub-col,
    .explorer-file-sub-col {
      min-height: 300px;
      border: 2px solid #313131;
    }
    .input-file-col,
    .explorer-file-col {
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
      color: #dddddd;
    }
    input::file-selector-button:hover {
      background: #191919;
      /* color: #ffcc00; */
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
      border: 2px solid #313131;
      transition: 0.3s;
      min-width: 280px;
    }
    .input-container:hover {
      color: #ffffff;
      background: #313131;
    }
    .btn-eye-password {
      text-align: center;
      background: #1a1a1a;
      font-size: 14px;
      padding-top: 8px;
      padding-bottom: 8px;
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
    /*
    .modal {
      background: rgba(18, 18, 18, 0.9);
    }
    .bar-default-modal {
      background: rgba(36, 36, 36, 0.75);
    }
    */
    .title-modal {
      color: #ffffff;
    }
    input {
      cursor: pointer;
      background: none;
      color: #ffffff;
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
      margin: 5px;
      margin-top: 15px;
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
    .warn-logout {
      text-align: center;
      padding: 10px;
    }
    .btn-default-modal-container {
      text-align: right;
      padding-right: 3px;
    }
    .chat-message-header {
      color: #cccccc;
    }
    .chat-box {
      border: 2px solid #313131;
      overflow: auto;
    }
    .ag-cell-data-changed {
      background-color: rgba(209, 209, 209, 1) !important;
      background: rgba(209, 209, 209, 1) !important;
      color: #2e2e2e !important;
    }
    .ag-cell-data-changed-animation {
      background-color: rgba(209, 209, 209, 1) !important;
      background: rgba(209, 209, 209, 1) !important;
      color: #2e2e2e !important;
    }
    .sub-title-modal {
      cursor: default;
      background: none;
      margin-top: 10px;
      padding: 10px;
      color: white;
      /* background: #dcdcdc; */
      /* background: #313131; */
      /* border: 2px solid #313131; */
      /* color: #f1f1f1; */
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
    .box-option {
      width: 238px;
      font-size: 20px;
      border: 2px solid #313131;
      padding: 10px;
    }
    .dropdown-option {
      width: 238px;
      font-size: 20px;
      padding: 10px;
    }
    .dropdown-option:hover {
      color: #c1c1c1;
      background: #313131;
    }
  `,
};

export { CssNexodev };
