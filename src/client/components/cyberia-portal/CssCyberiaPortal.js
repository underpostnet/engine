const CssCyberiaPortal = {
  theme: 'css-cyberia-portal',
  dark: true,
  render: async () => html`
    <style>
      html {
        overflow: hidden;
      }
      html,
      body {
        /*  color: #bdbdbd; */
        font-size: 20px;
      }
      .cyberia-portal-title-logo {
        width: 40px;
        height: 35px;
        top: 2px;
        left: -9px;
      }
      .html-modal-menu {
        padding: 0px;
      }
      .cyberia-portal-title-nexo {
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
      .input-file-sub-col {
        border: 2px solid #313131;
        padding: 10px;
        min-height: 300px;
      }
      .explorer-file-sub-col {
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
      .input-container-width {
        cursor: pointer;
        border: 2px solid #313131;
        transition: 0.3s;
      }
      .input-container-width:hover {
        color: #ffffff;
        background: #313131;
      }
      .input-container {
        cursor: pointer;
        border: 2px solid #313131;
        transition: 0.3s;
        width: 256px;
      }
      .input-container:hover {
        color: #ffffff;
        background: #313131;
      }
      .btn-eye-password {
        text-align: center;
        background: #1a1a1a;
        font-size: 17px;
        padding-top: 7px;
        padding-bottom: 7px;
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
    .bar-cyberia-portal-modal {
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
      .btn-bar-modal-container {
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
        cursor: cyberia-portal;
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
        min-height: 100px;
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
    </style>
  `,
};

const CssCyberiaPortalLight = {
  theme: 'css-cyberia-portal-light',
  dark: false,
  render: async () => html`
    <style>
      html {
        overflow: hidden;
      }
      html,
      body {
        /*  color: #bdbdbd; */
        font-size: 20px;
      }
      .cyberia-portal-title-logo {
        width: 40px;
        height: 35px;
        top: 2px;
        left: -9px;
      }
      .html-modal-menu {
        padding: 0px;
      }
      .cyberia-portal-title-nexo {
        font-size: 24px;
      }
      button:hover {
        /* color: #6a0660; */
        color: #000000;
      }
      .main-btn-menu {
        text-align: left;
        padding: 15px;
        transition: none;
        /* margin: 2px; */
        margin: 0;
        border: none;
        /* background: #b9b9b9; */
      }
      .input-file-sub-col {
        border: 2px solid #bbbbbb;
        padding: 10px;
        border-radius: 5px;
        min-height: 300px;
      }
      .explorer-file-sub-col {
      }
      .input-file-col,
      .explorer-file-col {
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
        /* color: #ffcc00; */
      }
      .sub-container {
        background: #cacaca;
        border: 2px solid #313131;
        transition: 0.3s;
      }
      .sub-container:hover {
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
        border: 2px solid #bbbbbb;
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
        padding-bottom: 7px;
      }

      ::placeholder {
        color: #333333;
        opacity: 1;
        /* Firefox */
        background: none;
      }
      :-ms-input-placeholder {
        /* Internet Explorer 10-11 */
        color: #333333;
        background: none;
      }

      ::-ms-input-placeholder {
        /* Microsoft Edge */
        color: #333333;
        background: none;
      }
      /*
      .modal {
        background: rgba(18, 18, 18, 0.9);
      }
      .bar-cyberia-portal-modal {
        background: rgba(36, 36, 36, 0.75);
      }
      */
      .title-modal {
        color: #000000;
      }
      input {
        cursor: pointer;
        background: none;
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
      .btn-bar-modal-container {
        text-align: right;
        padding-right: 3px;
      }
      .chat-message-header {
        color: #222222;
      }
      .chat-box {
        border: 2px solid #bbbbbb;
        overflow: auto;
        border-radius: 5px;
      }
      .ag-cell-data-changed {
        background-color: rgba(109, 104, 255, 1) !important;
        background: rgba(109, 104, 255, 1) !important;
        color: #e4e4e4 !important;
      }
      .ag-cell-data-changed-animation {
        background-color: rgba(109, 104, 255, 1) !important;
        background: rgba(109, 104, 255, 1) !important;
        color: #e4e4e4 !important;
      }
      .sub-title-modal {
        cursor: cyberia-portal;
        background: none;
        margin-top: 10px;
        padding: 10px;
        color: black;
        /* background: #dcdcdc; */
        /* background: #313131; */
        /* border: 2px solid #313131; */
        /* color: #f1f1f1; */
      }
      .sub-title-icon {
        font-size: 30px;
      }
      .dropdown-container {
        border-radius: 5px;
        border: 2px solid #bbbbbb;
        transition: 0.3s;
        cursor: pointer;
        min-height: 100px;
      }
      .btn-custom {
        width: 260px;
        font-size: 20px;
        padding: 10px;
      }
      .box-option {
        width: 238px;
        font-size: 20px;
        border-radius: 5px;
        border: 2px solid #bbbbbb;
        padding: 10px;
      }
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
        border: 2px solid #bbbbbb;
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
        color: rgba(109, 104, 255, 1);
      }
      a:hover {
        color: rgba(232, 159, 76, 1);
      }
      .content-render {
        font-size: 16px;
        font-family: monospace;
      }
    </style>
  `,
};

export { CssCyberiaPortal, CssCyberiaPortalLight };
