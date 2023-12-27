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
    `,
};

export { CssCyberia };
