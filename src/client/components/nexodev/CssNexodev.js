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
    .btn-default-modal-container. {
      text-align: right;
      padding-right: 3px;
    }
  `,
};

export { CssNexodev };
