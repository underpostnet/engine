import { getId } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s, prepend } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';
import { loggerFactory } from './Logger.js';

const Modal = {
  Data: {},
  EffectData: {},
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
    const render = html` <style class="style-${IdModal}">

        ${css`
          .${IdModal} {
            width: ${width}px;
            height: ${height}px;
            top: ${top};
            left: ${left};
            overflow: auto; /* resizable required */
            resize: auto; /* resizable required */
            transition: opacity 0.3s, box-shadow 0.3s, bottom 0.3s;
            opacity: 0;
            z-index: 1;
            ${options && options.style
              ? Object.keys(options.style)
                  .map((keyStyle) => `${keyStyle}: ${options.style[keyStyle]};`)
                  .join('')
              : ''}
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
      <div class="${options && options.class ? options.class : 'fix'} modal box-shadow ${IdModal}">
        <div class="abs modal-handle-${IdModal}"></div>
        <div class="in modal-html-${IdModal}">
          <div class="stq bar-default-modal bar-default-modal-${IdModal}">
            <div class="in" style="text-align: right">
              ${!options?.barConfig?.buttons?.minimize?.disabled
                ? await BtnIcon.Render({
                    class: `btn-minimize-${IdModal} btn-modal-default-${IdModal}`,
                    label: options?.barConfig?.buttons?.minimize?.label
                      ? options.barConfig.buttons.minimize.label
                      : html`_`,
                  })
                : ''}
              ${!options?.barConfig?.buttons?.restore?.disabled
                ? await BtnIcon.Render({
                    class: `btn-restore-${IdModal} btn-modal-default-${IdModal}`,
                    label: options?.barConfig?.buttons?.restore?.label
                      ? options.barConfig.buttons.restore.label
                      : html`□`,
                    style: 'display: none',
                  })
                : ''}
              ${!options?.barConfig?.buttons?.maximize?.disabled
                ? await BtnIcon.Render({
                    class: `btn-maximize-${IdModal} btn-modal-default-${IdModal}`,
                    label: options?.barConfig?.buttons?.maximize?.label
                      ? options.barConfig.buttons.maximize.label
                      : html`▢`,
                  })
                : ''}
              ${!options?.barConfig?.buttons?.close?.disabled
                ? await BtnIcon.Render({
                    class: `btn-close-${IdModal} btn-modal-default-${IdModal}`,
                    label: options?.barConfig?.buttons?.close?.label ? options.barConfig.buttons.close.label : html`X`,
                  })
                : ''}
              ${!options?.barConfig?.buttons?.menu?.disabled
                ? await BtnIcon.Render({
                    class: `btn-menu-${IdModal} btn-modal-default-${IdModal}`,
                    label: options?.barConfig?.buttons?.menu?.label ? options.barConfig.buttons.menu.label : html`≡`,
                  })
                : ''}
            </div>
            <div class="in ${options && options.titleClass ? options.titleClass : 'title-modal'}">
              ${options && options.title ? options.title : ''}
            </div>
          </div>
          ${options && options.html ? html`<div class="in html-modal-content">${options.html}</div>` : ''}
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
    if (options && options.effect) {
      if (!this.EffectData[options.effect]) this.EffectData[options.effect] = {};
      this.EffectData[options.effect][IdModal] = {};
      switch (options.effect) {
        case 'dropNotification':
          (() => {
            const renderEffect = (IdModalDisable) => {
              let countDrop = 0;
              Object.keys(this.EffectData[options.effect])
                .reverse()
                .map((idModalKeyEffect) => {
                  if (idModalKeyEffect !== IdModalDisable) {
                    s(`.${idModalKeyEffect}`).style.bottom = `${
                      countDrop * s(`.${idModalKeyEffect}`).clientHeight * 1.05
                    }px`;
                    countDrop++;
                  }
                });
            };
            s(`.${IdModal}`).style.top = 'auto';
            s(`.${IdModal}`).style.left = 'auto';
            s(`.${IdModal}`).style.height = 'auto';
            s(`.${IdModal}`).style.position = 'absolute';
            renderEffect();
            this.EffectData[options.effect][IdModal].delete = () => renderEffect(IdModal);
          })();
          break;

        default:
          break;
      }
    }
    let dragInstance;
    let handle = [s(`.bar-default-modal-${IdModal}`), s(`.modal-handle-${IdModal}`), s(`.modal-html-${IdModal}`)];
    if (options && 'handleType' in options) {
      switch (options.handleType) {
        case 'bar':
          handle = [s(`.bar-default-modal-${IdModal}`)];

          break;

        default:
          break;
      }
    }
    const dragOptions = {
      handle,
      onDragStart: (data) => {
        if (!s(`.${IdModal}`)) return;
        // logger.info('Dragging started', data);
        transition = `${s(`.${IdModal}`).style.transition}`;
        s(`.${IdModal}`).style.transition = null;
      },
      onDrag: (data) => {
        if (!s(`.${IdModal}`)) return;
        // logger.info('Dragging', data);
      },
      onDragEnd: (data) => {
        if (!s(`.${IdModal}`)) return;
        // logger.info('Dragging stopped', data);
        s(`.${IdModal}`).style.transition = transition;
      },
    };
    // new Draggable(s(`.${IdModal}`), { disabled: true });
    const setDragInstance = () => new Draggable(s(`.${IdModal}`), dragOptions);
    transition = `${s(`.${IdModal}`).style.transition}`;
    s(`.${IdModal}`).style.transition = '0.15s';
    setTimeout(() => (s(`.${IdModal}`).style.opacity = '1'));
    setTimeout(() => (s(`.${IdModal}`).style.transition = transition), 150);
    if (s(`.btn-close-${IdModal}`))
      s(`.btn-close-${IdModal}`).onclick = () => {
        s(`.${IdModal}`).style.opacity = '0';
        setTimeout(() => {
          if (!s(`.${IdModal}`)) return;
          s(`.${IdModal}`).remove();
          s(`.style-${IdModal}`).remove();
          delete this.Data[IdModal];
          if (options && options.effect) {
            if (this.EffectData[options.effect][IdModal].delete) this.EffectData[options.effect][IdModal].delete();
            delete this.EffectData[options.effect][IdModal];
          }
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
        dragInstance = setDragInstance();
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
        dragInstance = setDragInstance();
        setTimeout(() => (s(`.${IdModal}`).style.transition = transition), 300);
      };
    }

    dragInstance = setDragInstance();
    new ResizeObserver(() => {
      if (s(`.${IdModal}`))
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
