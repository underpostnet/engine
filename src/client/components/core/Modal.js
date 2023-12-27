import { getId } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s, prepend } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';
import { loggerFactory } from './Logger.js';
import { renderStatus } from './Css.js';

const Modal = {
  Data: {},
  ModeData: {},
  Render: async function (
    options = {
      id: '',
      barConfig: {},
      title: '',
      html: '',
      handleType: 'bar',
      mode: '' /* slide-menu */,
    },
  ) {
    const ResponsiveData = Responsive.getResponsiveData();
    let width = 300;
    let height = 400;
    let top = `${ResponsiveData.height / 2 - height / 2}px`;
    let left = `${ResponsiveData.width / 2 - width / 2}px`;
    let transition = `opacity 0.3s, box-shadow 0.3s, bottom 0.3s`;
    const idModal = options && 'id' in options ? options.id : getId(this.Data, 'modal-');
    const logger = loggerFactory({ url: `.${idModal}` });
    if (s(`.${idModal}`)) {
      s(`.${idModal}`).style.zIndex = '2';
      s(`.btn-maximize-${idModal}`).click();
      return;
    }
    this.Data[idModal] = {};
    if (options && 'mode' in options) {
      if (!this.ModeData[options.mode]) this.ModeData[options.mode] = {};
      this.ModeData[options.mode][idModal] = {};
      switch (options.mode) {
        case 'slide-menu':
          (() => {
            const { barConfig } = options;
            options.style = {
              position: 'absolute',
              height: '100%',
              width: '320px',
              right: '0px',
            };
            options.dragDisabled = true;
            top = '0px';
            left = 'auto';
            width = 'auto';
            barConfig.buttons.maximize.disabled = true;
            barConfig.buttons.minimize.disabled = true;
            barConfig.buttons.restore.disabled = true;
            barConfig.buttons.menu.disabled = true;
            barConfig.buttons.menu.onClick = () => {
              s(`.btn-menu-${idModal}`).classList.add('hide');
              s(`.btn-close-${idModal}`).classList.remove('hide');
              s(`.${idModal}`).style.width = '320px';
              s(`.html-${idModal}`).style.display = 'block';
              s(`.title-modal-${idModal}`).style.display = 'block';
            };
            barConfig.buttons.close.onClick = () => {
              s(`.btn-close-${idModal}`).classList.add('hide');
              s(`.btn-menu-${idModal}`).classList.remove('hide');
              s(`.${idModal}`).style.width = '50px';
              s(`.html-${idModal}`).style.display = 'none';
              s(`.title-modal-${idModal}`).style.display = 'none';
            };
            setTimeout(() => {
              s(`.${idModal}`).style.width = '320px';
            });
            transition += `, width 0.3s`;
          })();
          break;

        case 'dropNotification':
          (() => {
            const renderMode = (idModalDisable) => {
              let countDrop = 0;
              Object.keys(this.ModeData[options.mode])
                .reverse()
                .map((idModalKeyMode) => {
                  if (idModalKeyMode !== idModalDisable) {
                    s(`.${idModalKeyMode}`).style.bottom = `${
                      countDrop * s(`.${idModalKeyMode}`).clientHeight * 1.05
                    }px`;
                    countDrop++;
                  }
                });
            };
            setTimeout(() => {
              s(`.${idModal}`).style.top = 'auto';
              s(`.${idModal}`).style.left = 'auto';
              s(`.${idModal}`).style.height = 'auto';
              s(`.${idModal}`).style.position = 'absolute';
              renderMode();
              this.ModeData[options.mode][idModal].delete = () => renderMode(idModal);
            });
          })();
          break;

        default:
          break;
      }
    }
    const render = html` <style class="style-${idModal}">

        ${css`
          .${idModal} {
            width: ${width}px;
            height: ${height}px;
            top: ${top};
            left: ${left};
            overflow: auto; /* resizable required */
            resize: auto; /* resizable required */
            transition: ${transition};
            opacity: 0;
            z-index: 1;
            ${options && options.style
              ? Object.keys(options.style)
                  .map((keyStyle) => `${keyStyle}: ${options.style[keyStyle]};`)
                  .join('')
              : ''}
          }
          .bar-default-modal-${idModal} {
            top: 0px;
            left: 0px;
            z-index: 4;
          }

          .modal-html-${idModal} {
          }

          .btn-modal-default-${idModal} {
          }
          .modal-handle-${idModal} {
            width: 90%;
            height: 90%;
            top: 5%;
            left: 5%;
          }`}
      </style>
      <div class="${options && options.class ? options.class : 'fix'} modal box-shadow ${idModal}">
        <div class="abs modal-handle-${idModal}"></div>
        <div class="in modal-html-${idModal}">
          <div class="stq bar-default-modal bar-default-modal-${idModal}">
            <div class="in" style="text-align: right">
              ${!options?.barConfig?.buttons?.minimize?.disabled
                ? await BtnIcon.Render({
                    class: `btn-minimize-${idModal} btn-modal-default btn-modal-default-${idModal}`,
                    label: options?.barConfig?.buttons?.minimize?.label
                      ? options.barConfig.buttons.minimize.label
                      : html`_`,
                  })
                : ''}
              ${!options?.barConfig?.buttons?.restore?.disabled
                ? await BtnIcon.Render({
                    class: `btn-restore-${idModal} btn-modal-default btn-modal-default-${idModal}`,
                    label: options?.barConfig?.buttons?.restore?.label
                      ? options.barConfig.buttons.restore.label
                      : html`□`,
                    style: 'display: none',
                  })
                : ''}
              ${!options?.barConfig?.buttons?.maximize?.disabled
                ? await BtnIcon.Render({
                    class: `btn-maximize-${idModal} btn-modal-default btn-modal-default-${idModal}`,
                    label: options?.barConfig?.buttons?.maximize?.label
                      ? options.barConfig.buttons.maximize.label
                      : html`▢`,
                  })
                : ''}
              ${!options?.barConfig?.buttons?.close?.disabled
                ? await BtnIcon.Render({
                    class: `btn-close-${idModal} btn-modal-default btn-modal-default-${idModal}`,
                    label: options?.barConfig?.buttons?.close?.label ? options.barConfig.buttons.close.label : html`X`,
                  })
                : ''}
              ${await BtnIcon.Render({
                class: `btn-menu-${idModal} btn-modal-default btn-modal-default-${idModal}  ${
                  options?.barConfig?.buttons?.menu?.disabled ? 'hide' : ''
                }`,
                label: options?.barConfig?.buttons?.menu?.label ? options.barConfig.buttons.menu.label : html`≡`,
              })}
            </div>
            ${options && options.status
              ? html` <div class="abs modal-icon-container">${renderStatus(options.status)}</div> `
              : ''}
            <div
              class="in title-modal-${idModal} ${options && options.titleClass ? options.titleClass : 'title-modal'}"
            >
              ${options && options.title ? options.title : ''}
            </div>
          </div>

          <div class="in html-modal-content html-${idModal}">
            ${options && options.html ? (typeof options.html === 'function' ? await options.html() : options.html) : ''}
          </div>
        </div>
      </div>`;
    const selector = options && options.selector ? options.selector : 'body';
    if (options) {
      switch (options.renderType) {
        case 'prepend':
          prepend(selector, render);
          break;
        default:
          append(selector, render);
          break;
      }
    } else append(selector, render);
    let dragInstance;
    let handle = [s(`.bar-default-modal-${idModal}`), s(`.modal-handle-${idModal}`), s(`.modal-html-${idModal}`)];
    if (options && 'handleType' in options) {
      switch (options.handleType) {
        case 'bar':
          handle = [s(`.bar-default-modal-${idModal}`)];

          break;

        default:
          break;
      }
    }
    const dragOptions = {
      handle,
      onDragStart: (data) => {
        if (!s(`.${idModal}`)) return;
        // logger.info('Dragging started', data);
        transition = `${s(`.${idModal}`).style.transition}`;
        s(`.${idModal}`).style.transition = null;
      },
      onDrag: (data) => {
        if (!s(`.${idModal}`)) return;
        // logger.info('Dragging', data);
      },
      onDragEnd: (data) => {
        if (!s(`.${idModal}`)) return;
        // logger.info('Dragging stopped', data);
        s(`.${idModal}`).style.transition = transition;
      },
    };
    // new Draggable(s(`.${idModal}`), { disabled: true });
    const setDragInstance = () => (options?.dragDisabled ? null : new Draggable(s(`.${idModal}`), dragOptions));
    transition = `${s(`.${idModal}`).style.transition}`;
    s(`.${idModal}`).style.transition = '0.15s';
    setTimeout(() => (s(`.${idModal}`).style.opacity = '1'));
    setTimeout(() => (s(`.${idModal}`).style.transition = transition), 150);
    if (s(`.btn-close-${idModal}`))
      s(`.btn-close-${idModal}`).onclick = () => {
        if (options && 'barConfig' in options && options.barConfig.buttons.close.onClick)
          return options.barConfig.buttons.close.onClick();
        s(`.${idModal}`).style.opacity = '0';
        setTimeout(() => {
          if (!s(`.${idModal}`)) return;
          s(`.${idModal}`).remove();
          s(`.style-${idModal}`).remove();
          delete this.Data[idModal];
          if (options && options.mode) {
            if (this.ModeData[options.mode][idModal].delete) this.ModeData[options.mode][idModal].delete();
            delete this.ModeData[options.mode][idModal];
          }
        }, 300);
      };
    if (s(`.btn-minimize-${idModal}`) && s(`.btn-maximize-${idModal}`) && s(`.btn-maximize-${idModal}`)) {
      s(`.btn-minimize-${idModal}`).onclick = () => {
        transition = `${s(`.${idModal}`).style.transition}`;
        s(`.${idModal}`).style.transition = '0.3s';
        s(`.btn-minimize-${idModal}`).style.display = 'none';
        s(`.btn-maximize-${idModal}`).style.display = null;
        s(`.btn-restore-${idModal}`).style.display = null;
        s(`.${idModal}`).style.height = `${s(`.bar-default-modal-${idModal}`).clientHeight}px`;
        setTimeout(() => (s(`.${idModal}`).style.transition = transition), 300);
      };
      s(`.btn-restore-${idModal}`).onclick = () => {
        transition = `${s(`.${idModal}`).style.transition}`;
        s(`.${idModal}`).style.transition = '0.3s';
        s(`.btn-restore-${idModal}`).style.display = 'none';
        s(`.btn-minimize-${idModal}`).style.display = null;
        s(`.btn-maximize-${idModal}`).style.display = null;
        s(`.${idModal}`).style.transform = null;
        s(`.${idModal}`).style.height = null;
        s(`.${idModal}`).style.width = null;
        s(`.${idModal}`).style.top = top;
        s(`.${idModal}`).style.left = left;
        dragInstance = setDragInstance();
        setTimeout(() => (s(`.${idModal}`).style.transition = transition), 300);
      };
      s(`.btn-maximize-${idModal}`).onclick = () => {
        transition = `${s(`.${idModal}`).style.transition}`;
        s(`.${idModal}`).style.transition = '0.3s';
        s(`.btn-maximize-${idModal}`).style.display = 'none';
        s(`.btn-restore-${idModal}`).style.display = null;
        s(`.btn-minimize-${idModal}`).style.display = null;
        s(`.${idModal}`).style.transform = null;
        s(`.${idModal}`).style.height = '100%';
        s(`.${idModal}`).style.width = '100%';
        s(`.${idModal}`).style.top = '0px';
        s(`.${idModal}`).style.left = '0px';
        dragInstance = setDragInstance();
        setTimeout(() => (s(`.${idModal}`).style.transition = transition), 300);
      };
    }

    s(`.btn-menu-${idModal}`).onclick = () => {
      if (options && 'barConfig' in options && options.barConfig.buttons.menu.onClick)
        return options.barConfig.buttons.menu.onClick();
    };

    dragInstance = setDragInstance();
    true
      ? null
      : new ResizeObserver(() => {
          if (s(`.${idModal}`))
            logger.info('ResizeObserver', `.${idModal}`, s(`.${idModal}`).offsetWidth, s(`.${idModal}`).offsetHeight);
        }).observe(s(`.${idModal}`));
    // cancel: [cancel1, cancel2]
    return {
      id: idModal,
      dragInstance,
    };
  },
};

export { Modal };
