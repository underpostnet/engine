import { getId } from './CommonJs.js';

const Modal = {
  Data: {},
  Init: function () {
    append(
      'body',
      html`
        <style>
          ${css`
            .modal {
              width: 300px;
              height: 250px;
              background: black;
            }
          `}
        </style>
      `
    );
  },
  Render: function (options) {
    const IdModal = 'id' in options ? options.id : getId(this.Data, 'modal-');
    this.Data[IdModal] = {};
    append('body', html` <div class="fix center modal ${IdModal}"></div>`);
    return {
      id: IdModal,
    };
  },
};

export { Modal };
