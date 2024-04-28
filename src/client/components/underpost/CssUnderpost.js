const CssUnderpost = {
  theme: 'underpost',
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
      .html-modal-menu {
        padding: 0px;
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
      .input-container {
        cursor: pointer;
        border: 2px solid #313131;
        transition: 0.3s;
        width: 280px;
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
      .btn-custom {
        width: 283px;
        padding: 15px;
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
      .btn-bar-modal-container {
        text-align: right;
        padding-right: 3px;
      }
      .underpost-title-logo {
        width: 35px;
        height: 32px;
        top: 2px;
        left: -4px;
      }
      .underpost-title-text-a {
        top: 5px;
        font-weight: bold;
        left: 10px;
      }
      .underpost-title-text-b {
        top: 5px;
        left: 10px;
      }
      .btn-lab-gallery {
        font-weight: bold;
        margin: 2px;
        padding: 10px;
        font-weight: bold;
        text-align: left;
      }
      .iframe-gallery {
        width: 100%;
        min-height: 500px;
        border: none;
        margin: 2px;
      }
    </style>
  `,
};

export { CssUnderpost };
