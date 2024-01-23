import { getId } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s, prepend } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';
import { loggerFactory } from './Logger.js';
import { renderStatus } from './Css.js';

const Modal = {
  Data: {},
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
    this.Data[idModal] = { options };
    if (options && 'mode' in options) {
      this.Data[idModal][options.mode] = {};
      switch (options.mode) {
        case 'view':
          setTimeout(() => {
            Object.keys(this.Data).map((_idModal) => {
              if (this.Data[_idModal].options.mode === 'view' && s(`.${_idModal}`))
                s(`.${_idModal}`).style.zIndex = '1';
            });
            if (s(`.${idModal}`)) s(`.${idModal}`).style.zIndex = '2';
          });

          if (options && options.slideMenu) s(`.btn-close-${options.slideMenu}`).click();

          options.style = {
            ...options.style,
            'min-width': '320px',
          };

          if (this.mobileModal()) {
            options.barConfig.buttons.restore.disabled = true;
            options.dragDisabled = true;
            options.style.resize = 'none';
          }

          Responsive.Event[`view-${idModal}`] = () => {
            if (!this.Data[idModal]) return delete Responsive.Event[`view-${idModal}`];
            if (this.Data[idModal].slideMenu) s(`.${idModal}`).style.height = `${window.innerHeight - 50}px`;
          };

          break;
        case 'slide-menu':
        case 'slide-menu-right':
        case 'slide-menu-left':
          (() => {
            const { barConfig } = options;
            options.style = {
              position: 'absolute',
              height: `${window.innerHeight - 50}px`,
              width: '320px',
              'z-index': 2,
              resize: 'none',
              top: '50px',
            };
            options.mode === 'slide-menu-right' ? (options.style.right = '0px') : (options.style.left = '0px');

            options.dragDisabled = true;
            top = '0px';
            left = 'auto';
            width = 'auto';
            barConfig.buttons.maximize.disabled = true;
            barConfig.buttons.minimize.disabled = true;
            barConfig.buttons.restore.disabled = true;
            barConfig.buttons.menu.disabled = true;
            Responsive.Event[`slide-menu-${idModal}`] = () => {
              for (const _idModal of Object.keys(this.Data)) {
                if (this.Data[_idModal].slideMenu && this.Data[_idModal].slideMenu.id === idModal)
                  this.Data[_idModal].slideMenu.callBack();
              }
              s(`.${idModal}`).style.height = `${window.innerHeight - 50}px`;
            };
            barConfig.buttons.menu.onClick = () => {
              this.Data[idModal][options.mode].width = 320;
              s(`.btn-menu-${idModal}`).classList.add('hide');
              s(`.btn-close-${idModal}`).classList.remove('hide');
              s(`.${idModal}`).style.width = `${this.Data[idModal][options.mode].width}px`;
              s(`.html-${idModal}`).style.display = 'block';
              // s(`.title-modal-${idModal}`).style.display = 'block';
              Responsive.Event[`slide-menu-${idModal}`]();
            };
            barConfig.buttons.close.onClick = () => {
              this.Data[idModal][options.mode].width = 0;
              s(`.btn-close-${idModal}`).classList.add('hide');
              s(`.btn-menu-${idModal}`).classList.remove('hide');
              s(`.${idModal}`).style.width = `${this.Data[idModal][options.mode].width}px`;
              s(`.html-${idModal}`).style.display = 'none';
              // s(`.title-modal-${idModal}`).style.display = 'none';
              Responsive.Event[`slide-menu-${idModal}`]();
            };
            setTimeout(() => {
              s(`.${idModal}`).style.width = '320px';
            });
            transition += `, width 0.3s`;

            append('body', html`<div class="fix modal slide-menu-top-bar"></div>`);

            setTimeout(() => {
              // clone and change position

              // s(`.btn-close-${idModal}`);
              // s(`.btn-menu-${idModal}`);

              const btnCloseNode = s(`.btn-close-${idModal}`).cloneNode(true);
              s(`.btn-close-${idModal}`).remove();
              s(`.slide-menu-top-bar`).appendChild(btnCloseNode);
              s(`.btn-close-${idModal}`).onclick = btnCloseEvent;

              const btnMenuNode = s(`.btn-menu-${idModal}`).cloneNode(true);
              s(`.btn-menu-${idModal}`).remove();
              s(`.slide-menu-top-bar`).appendChild(btnMenuNode);
              s(`.btn-menu-${idModal}`).onclick = btnMenuEvent;

              const titleNode = s(`.title-modal-${idModal}`).cloneNode(true);
              s(`.title-modal-${idModal}`).remove();
              s(`.slide-menu-top-bar`).appendChild(titleNode);

              // s('body').removeChild(`.${idModal}`);
              // while (s(`.top-modal`).firstChild) s(`.top-modal`).removeChild(s(`.top-modal`).firstChild);
            });
          })();
          break;

        case 'dropNotification':
          (() => {
            setTimeout(() => {
              s(`.${idModal}`).style.top = 'auto';
              s(`.${idModal}`).style.left = 'auto';
              s(`.${idModal}`).style.height = 'auto';
              s(`.${idModal}`).style.position = 'absolute';
              let countDrop = 0;
              Object.keys(this.Data)
                .reverse()
                .map((_idModal) => {
                  if (this.Data[_idModal][options.mode]) {
                    s(`.${_idModal}`).style.bottom = `${countDrop * s(`.${_idModal}`).clientHeight * 1.05}px`;
                    countDrop++;
                  }
                });
            });
          })();
          break;

        default:
          break;
      }
    }
    if (s(`.${idModal}`)) {
      s(`.btn-maximize-${idModal}`).click();
      return;
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
            z-index: 1;
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
              ${await BtnIcon.Render({
                class: `btn-minimize-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.barConfig?.buttons?.minimize?.disabled ? 'hide' : ''
                }`,
                label: options?.barConfig?.buttons?.minimize?.label
                  ? options.barConfig.buttons.minimize.label
                  : html`_`,
              })}
              ${await BtnIcon.Render({
                class: `btn-restore-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.barConfig?.buttons?.restore?.disabled ? 'hide' : ''
                }`,
                label: options?.barConfig?.buttons?.restore?.label ? options.barConfig.buttons.restore.label : html`□`,
                style: 'display: none',
              })}
              ${await BtnIcon.Render({
                class: `btn-maximize-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.barConfig?.buttons?.maximize?.disabled ? 'hide' : ''
                }`,
                label: options?.barConfig?.buttons?.maximize?.label
                  ? options.barConfig.buttons.maximize.label
                  : html`▢`,
              })}
              ${await BtnIcon.Render({
                class: `btn-close-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.barConfig?.buttons?.close?.disabled ? 'hide' : ''
                }`,
                label: options?.barConfig?.buttons?.close?.label ? options.barConfig.buttons.close.label : html`X`,
              })}
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
              class="inl title-modal-${idModal} ${options && options.titleClass ? options.titleClass : 'title-modal'}"
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
      // disabled: true,
      handle,
      onDragStart: (data) => {
        if (!s(`.${idModal}`)) return;
        // logger.info('Dragging started', data);
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
    s(`.${idModal}`).style.transition = '0.15s';
    setTimeout(() => (s(`.${idModal}`).style.opacity = '1'));
    setTimeout(() => (s(`.${idModal}`).style.transition = transition), 150);

    const btnCloseEvent = () => {
      if (options && 'barConfig' in options && options.barConfig.buttons.close.onClick)
        return options.barConfig.buttons.close.onClick();
      s(`.${idModal}`).style.opacity = '0';
      setTimeout(() => {
        if (!s(`.${idModal}`)) return;
        s(`.${idModal}`).remove();
        s(`.style-${idModal}`).remove();
        delete this.Data[idModal];
      }, 300);
    };
    s(`.btn-close-${idModal}`).onclick = btnCloseEvent;

    s(`.btn-minimize-${idModal}`).onclick = () => {
      if (options.slideMenu) delete this.Data[idModal].slideMenu;
      s(`.${idModal}`).style.transition = '0.3s';
      s(`.btn-minimize-${idModal}`).style.display = 'none';
      s(`.btn-maximize-${idModal}`).style.display = null;
      s(`.btn-restore-${idModal}`).style.display = null;
      s(`.${idModal}`).style.height = `${s(`.bar-default-modal-${idModal}`).clientHeight}px`;
      setTimeout(() => (s(`.${idModal}`).style.transition = transition), 300);
    };
    s(`.btn-restore-${idModal}`).onclick = () => {
      if (options.slideMenu) delete this.Data[idModal].slideMenu;
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
      s(`.${idModal}`).style.transition = '0.3s';
      setTimeout(() => (s(`.${idModal}`).style.transition = transition), 300);
      s(`.btn-maximize-${idModal}`).style.display = 'none';
      s(`.btn-restore-${idModal}`).style.display = null;
      s(`.btn-minimize-${idModal}`).style.display = null;
      s(`.${idModal}`).style.transform = null;

      if (options.slideMenu) {
        const idSlide = this.Data[options.slideMenu]['slide-menu']
          ? 'slide-menu'
          : this.Data[options.slideMenu]['slide-menu-right']
          ? 'slide-menu-right'
          : 'slide-menu-left';
        const callBack = () => {
          s(`.${idModal}`).style.transition = '0.3s';
          s(`.${idModal}`).style.width = `${window.innerWidth - this.Data[options.slideMenu][idSlide].width}px`;
          s(`.${idModal}`).style.left =
            idSlide === 'slide-menu-right' ? `0px` : `${this.Data[options.slideMenu][idSlide].width}px`;
          setTimeout(() => (s(`.${idModal}`).style.transition = transition), 300);
        };

        callBack();
        this.Data[idModal].slideMenu = {
          callBack,
          id: options.slideMenu,
        };
        s(`.${idModal}`).style.height = `${window.innerHeight - 50}px`;
        s(`.${idModal}`).style.top = `50px`;
      } else {
        s(`.${idModal}`).style.width = '100%';
        s(`.${idModal}`).style.height = '100%';
        s(`.${idModal}`).style.top = '0px';
        s(`.${idModal}`).style.left = '0px';
      }
      dragInstance = setDragInstance();
    };

    const btnMenuEvent = () => {
      if (options && 'barConfig' in options && options.barConfig.buttons.menu.onClick)
        return options.barConfig.buttons.menu.onClick();
    };
    s(`.btn-menu-${idModal}`).onclick = btnMenuEvent;

    dragInstance = setDragInstance();
    if (options && options.maximize) s(`.btn-maximize-${idModal}`).click();
    if (options.observer) {
      this.Data[idModal].observerEvent = {};
      this.Data[idModal].observer = new ResizeObserver(() => {
        if (s(`.${idModal}`))
          logger.info('ResizeObserver', `.${idModal}`, s(`.${idModal}`).offsetWidth, s(`.${idModal}`).offsetHeight);
        Object.keys(this.Data[idModal].observerEvent).map((eventKey) =>
          this.Data[idModal].observerEvent[eventKey]({
            width: s(`.${idModal}`).offsetWidth,
            height: s(`.${idModal}`).offsetHeight,
          }),
        );
      }).observe(s(`.${idModal}`));
    }
    // cancel: [cancel1, cancel2]
    return {
      id: idModal,
      dragInstance,
      setDragInstance,
      ...this.Data[idModal],
    };
  },
  mobileModal: () => window.innerWidth < 600,
};

export { Modal };
