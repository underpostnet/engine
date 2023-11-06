import { getId } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';
import { loggerFactory } from './Logger.js';

const Modal = {
  Data: {},
  Render: async function (options) {
    const ResponsiveData = Responsive.getResponsiveData();
    const width = 300;
    const height = 400;
    let top = `${ResponsiveData.height / 2 - height / 2}px`;
    let left = `${ResponsiveData.width / 2 - width / 2}px`;
    let transition;
    const IdModal = options && 'id' in options ? options.id : getId(this.Data, 'modal-');
    const logger = loggerFactory({ url: `.${IdModal}` });
    if (s(`.${IdModal}`)) {
      s(`.${IdModal}`).style.zIndex = '2';
      s(`.btn-maximize-${IdModal}`).click();
      return;
    }
    this.Data[IdModal] = {};
    append(
      'body',
      html` <style class="style-${IdModal}">

          ${css`
            .${IdModal} {
              width: ${width}px;
              height: ${height}px;
              top: ${top};
              left: ${left};
              overflow: auto; /* resizable required */
              resize: auto; /* resizable required */
              transition: opacity 0.3s, box-shadow 0.3s;
              opacity: 0;
            }
            .bar-default-modal-${IdModal} {
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
        <div class="fix modal box-shadow ${IdModal} ${options && options.class ? options.class : ''}">
          <div class="abs modal-handle-${IdModal}"></div>
          <div class="in modal-html-${IdModal}">
            <div class="stq bar-default-modal bar-default-modal-${IdModal}">
              <div class="in">
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
              </div>
              <div class="in title-modal">${options && options.title ? options.title : ''}</div>
            </div>
            ${options && options.html ? options.html : IdModal}
          </div>
        </div>`
    );
    let dragInstance;
    const dragOptions = {
      handle: [s(`.modal-handle-${IdModal}`), s(`.bar-default-modal-${IdModal}`), s(`.modal-html-${IdModal}`)],
      onDragStart: (data) => {
        // logger.info('Dragging started', data);
        transition = `${s(`.${IdModal}`).style.transition}`;
        s(`.${IdModal}`).style.transition = null;
      },
      onDrag: (data) => {
        // logger.info('Dragging', data);
      },
      onDragEnd: (data) => {
        // logger.info('Dragging stopped', data);
        s(`.${IdModal}`).style.transition = transition;
      },
    };
    transition = `${s(`.${IdModal}`).style.transition}`;
    s(`.${IdModal}`).style.transition = '0.15s';
    setTimeout(() => (s(`.${IdModal}`).style.opacity = '1'));
    setTimeout(() => (s(`.${IdModal}`).style.transition = transition), 150);
    if (s(`.btn-close-${IdModal}`))
      s(`.btn-close-${IdModal}`).onclick = () => {
        s(`.${IdModal}`).style.opacity = '0';
        setTimeout(() => {
          s(`.${IdModal}`).remove();
          s(`.style-${IdModal}`).remove();
          delete this.Data[IdModal];
        }, 300);
      };
    if (s(`.btn-minimize-${IdModal}`) && s(`.btn-maximize-${IdModal}`) && s(`.btn-maximize-${IdModal}`)) {
      s(`.btn-minimize-${IdModal}`).onclick = () => {
        transition = `${s(`.${IdModal}`).style.transition}`;
        s(`.${IdModal}`).style.transition = '0.3s';
        s(`.btn-minimize-${IdModal}`).style.display = 'none';
        s(`.btn-maximize-${IdModal}`).style.display = null;
        s(`.btn-restore-${IdModal}`).style.display = null;
        s(`.${IdModal}`).style.height = `${s(`.bar-default-modal-${IdModal}`).clientHeight}px`;
        setTimeout(() => (s(`.${IdModal}`).style.transition = transition), 300);
      };
      s(`.btn-restore-${IdModal}`).onclick = () => {
        transition = `${s(`.${IdModal}`).style.transition}`;
        s(`.${IdModal}`).style.transition = '0.3s';
        s(`.btn-restore-${IdModal}`).style.display = 'none';
        s(`.btn-minimize-${IdModal}`).style.display = null;
        s(`.btn-maximize-${IdModal}`).style.display = null;
        s(`.${IdModal}`).style.transform = null;
        s(`.${IdModal}`).style.height = null;
        s(`.${IdModal}`).style.width = null;
        s(`.${IdModal}`).style.top = top;
        s(`.${IdModal}`).style.left = left;
        dragInstance = new Draggable(s(`.${IdModal}`), dragOptions);
        setTimeout(() => (s(`.${IdModal}`).style.transition = transition), 300);
      };
      s(`.btn-maximize-${IdModal}`).onclick = () => {
        transition = `${s(`.${IdModal}`).style.transition}`;
        s(`.${IdModal}`).style.transition = '0.3s';
        s(`.btn-maximize-${IdModal}`).style.display = 'none';
        s(`.btn-restore-${IdModal}`).style.display = null;
        s(`.btn-minimize-${IdModal}`).style.display = null;
        s(`.${IdModal}`).style.transform = null;
        s(`.${IdModal}`).style.height = '100%';
        s(`.${IdModal}`).style.width = '100%';
        s(`.${IdModal}`).style.top = '0px';
        s(`.${IdModal}`).style.left = '0px';
        dragInstance = new Draggable(s(`.${IdModal}`), dragOptions);
        setTimeout(() => (s(`.${IdModal}`).style.transition = transition), 300);
      };
    }

    dragInstance = new Draggable(s(`.${IdModal}`), dragOptions);
    new ResizeObserver(() => {
      logger.info('ResizeObserver', `.${IdModal}`, s(`.${IdModal}`).offsetWidth, s(`.${IdModal}`).offsetHeight);
    }).observe(s(`.${IdModal}`));
    // cancel: [cancel1, cancel2]
    return {
      id: IdModal,
      dragInstance,
    };
  },
};

export { Modal };
