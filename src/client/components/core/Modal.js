import { getId } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';

const Modal = {
  Data: {},
  Render: async function (options) {
    const ResponsiveData = Responsive.getResponsiveData();
    const width = 300;
    const height = 400;
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
              overflow: auto; /* resizable required */
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
              top: 0px;
              left: 0px;
              z-index: 1;
            }

            .modal-html-${IdModal} {
            }

            .btn-modal-default-${IdModal} {
            }
            .modal-handle-${IdModal} {
              width: 90%;
              height: 90%;
              top: 5%;
              left: 5%;
            }`}
        </style>
        <div class="fix ${IdModal}">
          <div class="abs modal-handle-${IdModal}"></div>
          <div class="in modal-html-${IdModal}">
            <div class="stq bar-default-modal-${IdModal}">
              ${await BtnIcon.Render({ class: `btn-dropdown-${IdModal} btn-modal-default-${IdModal}`, label: `☰` })}
              ${!options || (options && !options.disabledCloseBtn)
                ? await BtnIcon.Render({ class: `btn-close-${IdModal} btn-modal-default-${IdModal}`, label: `X` })
                : ''}
              ${await BtnIcon.Render({
                class: `btn-maximize-${IdModal} btn-modal-default-${IdModal}`,
                label: `▢`,
              })}
              ${await BtnIcon.Render({
                class: `btn-restore-${IdModal} btn-modal-default-${IdModal}`,
                label: `□`,
                style: 'display: none',
              })}
              ${await BtnIcon.Render({ class: `btn-minimize-${IdModal} btn-modal-default-${IdModal}`, label: `_` })}
              ${options && options.title ? options.title : ''}
            </div>
            ${options && options.html ? options.html : IdModal}
          </div>
        </div>`
    );
    if (s(`.btn-close-${IdModal}`))
      s(`.btn-close-${IdModal}`).onclick = () => {
        s(`.${IdModal}`).remove();
        s(`.style-${IdModal}`).remove();
        delete this.Data[IdModal];
      };
    if (s(`.btn-minimize-${IdModal}`) && s(`.btn-maximize-${IdModal}`) && s(`.btn-maximize-${IdModal}`)) {
      s(`.btn-minimize-${IdModal}`).onclick = () => {
        s(`.btn-minimize-${IdModal}`).style.display = 'none';
        s(`.btn-maximize-${IdModal}`).style.display = null;
        s(`.btn-restore-${IdModal}`).style.display = null;
        s(`.${IdModal}`).style.height = `${s(`.bar-default-modal-${IdModal}`).clientHeight}px`;
      };
      s(`.btn-restore-${IdModal}`).onclick = () => {
        s(`.btn-restore-${IdModal}`).style.display = 'none';
        s(`.btn-minimize-${IdModal}`).style.display = null;
        s(`.btn-maximize-${IdModal}`).style.display = null;
        s(`.${IdModal}`).style.height = null;
        s(`.${IdModal}`).style.width = null;
        s(`.${IdModal}`).style.top = null;
        s(`.${IdModal}`).style.left = null;
      };
      s(`.btn-maximize-${IdModal}`).onclick = () => {
        s(`.btn-maximize-${IdModal}`).style.display = 'none';
        s(`.btn-restore-${IdModal}`).style.display = null;
        s(`.btn-minimize-${IdModal}`).style.display = null;
        s(`.${IdModal}`).style.transform = null;
        s(`.${IdModal}`).style.height = '100%';
        s(`.${IdModal}`).style.width = '100%';
        s(`.${IdModal}`).style.top = '0px';
        s(`.${IdModal}`).style.left = '0px';
      };
    }

    const dragInstance = new Draggable(s(`.${IdModal}`), {
      handle: [s(`.modal-handle-${IdModal}`), s(`.bar-default-modal-${IdModal}`), s(`.modal-html-${IdModal}`)],
    });
    // cancel: [cancel1, cancel2]
    return {
      id: IdModal,
      dragInstance,
    };
  },
};

export { Modal };
