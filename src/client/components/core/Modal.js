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
              ${options && options.style
                ? Object.keys(options.style)
                    .map((styleAttr) => `${styleAttr}: ${options.style[styleAttr]};`)
                    .join('')
                : ''}
            }`}
        </style>
        <div class="fix ${IdModal}">
          ${await BtnIcon.Render({ class: `btn-close-${IdModal}`, label: `x` })}
          ${await BtnIcon.Render({ class: `btn-handle-${IdModal}`, label: `+` })}
          ${options && options.html ? options.html : IdModal}
        </div>`
    );
    s(`.btn-close-${IdModal}`).onclick = () => {
      s(`.${IdModal}`).remove();
      s(`.style-${IdModal}`).remove();
      delete this.Data[IdModal];
    };
    const dragInstance = new Draggable(s(`.${IdModal}`), { handle: [s(`.btn-handle-${IdModal}`)] });
    // cancel: [cancel1, cancel2]
    return {
      id: IdModal,
      dragInstance,
    };
  },
};

export { Modal };
