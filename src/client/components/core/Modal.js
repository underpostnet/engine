import { getId } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';

const Modal = {
  Data: {},
  Render: async function (options) {
    const ResponsiveData = Responsive.getResponsiveData();
    const width = 150;
    const height = 100;
    const IdModal = options && 'id' in options ? options.id : getId(this.Data, 'modal-');
    this.Data[IdModal] = {};
    append(
      'body',
      html` <style class="style-${IdModal}">

          ${css`
            .${IdModal} {
              width: ${width}px;
              height: ${height}px;
              top: ${ResponsiveData.height / 2 - height / 2}px;
              left: ${ResponsiveData.width / 2 - width / 2}px;
              background: black;
              color: white;
              overflow: hidden; /* resizable required */
              resize: auto; /* resizable required */
              font-family: arial;
              ${options && options.style
                ? Object.keys(options.style)
                    .map((styleAttr) => `${styleAttr}: ${options.style[styleAttr]};`)
                    .join('')
                : ''}
            }
            .bar-default-modal-${IdModal} {
              background: gray;
              color: black;
            }

            .modal-html-${IdModal} {
              padding: 5px;
            }

            .btn-modal-default-${IdModal} {
            }`}
        </style>
        <div class="fix ${IdModal}">
          <div class="in bar-default-modal-${IdModal}">
            ${await BtnIcon.Render({ class: `btn-handle-${IdModal} btn-modal-default-${IdModal}`, label: `|||` })}
            ${!options || (options && !options.disabledCloseBtn)
              ? await BtnIcon.Render({ class: `btn-close-${IdModal} btn-modal-default-${IdModal}`, label: `X` })
              : ''}
            ${await BtnIcon.Render({ class: `btn-minimize-${IdModal} btn-modal-default-${IdModal}`, label: `_` })}
            ${options && options.title ? options.title : ''}
          </div>
          <div class="in modal-html-${IdModal}">${options && options.html ? options.html : IdModal}</div>
        </div>`
    );
    if (s(`.btn-close-${IdModal}`))
      s(`.btn-close-${IdModal}`).onclick = () => {
        s(`.${IdModal}`).remove();
        s(`.style-${IdModal}`).remove();
        delete this.Data[IdModal];
      };
    if (s(`.btn-minimize-${IdModal}`)) s(`.btn-minimize-${IdModal}`).onclick = () => alert();
    const dragInstance = new Draggable(s(`.${IdModal}`), { handle: [s(`.bar-default-modal-${IdModal}`)] });
    // cancel: [cancel1, cancel2]
    return {
      id: IdModal,
      dragInstance,
    };
  },
};

export { Modal };
