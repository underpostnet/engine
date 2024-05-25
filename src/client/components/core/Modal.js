import { getId } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s, prepend, setURI, getProxyPath, htmls } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';
import { loggerFactory } from './Logger.js';
import { Css, Themes, renderStatus } from './Css.js';
import { setDocTitle } from './Router.js';
import { NotificationManager } from './NotificationManager.js';

const logger = loggerFactory(import.meta);

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
      RouterInstance: {},
    },
  ) {
    const ResponsiveData = Responsive.getResponsiveData();
    let width = 300;
    let height = 400;
    let top = `${ResponsiveData.height / 2 - height / 2}px`;
    let left = `${ResponsiveData.width / 2 - width / 2}px`;
    let transition = `opacity 0.3s, box-shadow 0.3s, bottom 0.3s`;
    const minWidth = width;
    const heightDefaultTopBar = 0;
    const heightDefaultBottomBar = 0;
    const idModal = options && 'id' in options ? options.id : getId(this.Data, 'modal-');
    this.Data[idModal] = { options, onCloseListener: {} };
    if (options && 'mode' in options) {
      this.Data[idModal][options.mode] = {};
      switch (options.mode) {
        case 'view':
          setTimeout(() => {
            Object.keys(this.Data).map((_idModal) => {
              if (this.Data[_idModal].options.mode === 'view' && s(`.${_idModal}`))
                s(`.${_idModal}`).style.zIndex = '3';
            });
            const setTopModal = () => {
              if (s(`.${idModal}`)) s(`.${idModal}`).style.zIndex = '4';
              else setTimeout(setTopModal, 100);
            };
            setTopModal();
          });

          if (options && options.slideMenu) s(`.btn-close-${options.slideMenu}`).click();

          options.style = {
            ...options.style,
            'min-width': `${minWidth}px`,
          };

          if (this.mobileModal()) {
            options.barConfig.buttons.restore.disabled = true;
            options.barConfig.buttons.minimize.disabled = true;
            options.dragDisabled = true;
            options.style.resize = 'none';
          }

          Responsive.Event[`view-${idModal}`] = () => {
            if (!this.Data[idModal]) return delete Responsive.Event[`view-${idModal}`];
            if (this.Data[idModal].slideMenu)
              s(`.${idModal}`).style.height = `${
                window.innerHeight -
                (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
              }px`;
          };
          Responsive.Event[`view-${idModal}`]();

          // Router
          if (options.route)
            (() => {
              let path = window.location.pathname;
              if (path !== '/' && path[path.length - 1] === '/') path = path.slice(0, -1);
              const proxyPath = getProxyPath();
              const newPath = `${proxyPath}${options.route}`;
              if (path !== newPath) {
                // console.warn('SET MODAL URI', newPath);
                setURI(`${newPath}`); // ${location.search}
                setDocTitle({ ...options.RouterInstance, route: options.route });
              }
            })();

          break;
        case 'slide-menu':
        case 'slide-menu-right':
        case 'slide-menu-left':
          (() => {
            const { barConfig } = options;
            options.style = {
              position: 'absolute',
              height: `${
                window.innerHeight -
                (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
              }px`,
              width: '320px',
              'z-index': 6,
              resize: 'none',
              top: `${options.heightTopBar ? options.heightTopBar : heightDefaultTopBar}px`,
            };
            options.mode === 'slide-menu-right' ? (options.style.right = '0px') : (options.style.left = '0px');

            options.dragDisabled = true;
            top = '0px';
            left = 'auto';
            width = 'auto';
            // barConfig.buttons.maximize.disabled = true;
            // barConfig.buttons.minimize.disabled = true;
            // barConfig.buttons.restore.disabled = true;
            // barConfig.buttons.menu.disabled = true;
            // barConfig.buttons.close.disabled = true;
            options.btnBarModalClass = 'hide';
            Responsive.Event[`slide-menu-${idModal}`] = () => {
              for (const _idModal of Object.keys(this.Data)) {
                if (this.Data[_idModal].slideMenu && this.Data[_idModal].slideMenu.id === idModal)
                  this.Data[_idModal].slideMenu.callBack();
              }
              s(`.${idModal}`).style.height = `${
                window.innerHeight -
                (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
              }px`;
              if (s(`.main-body-top`)) {
                if (Modal.mobileModal()) {
                  if (s(`.btn-menu-${idModal}`).classList.contains('hide'))
                    s(`.main-body-top`).classList.remove('hide');
                  if (s(`.btn-close-${idModal}`).classList.contains('hide')) s(`.main-body-top`).classList.add('hide');
                } else if (!s(`.main-body-top`).classList.contains('hide')) s(`.main-body-top`).classList.add('hide');
              }
            };
            barConfig.buttons.menu.onClick = () => {
              this.Data[idModal][options.mode].width = 320;
              s(`.btn-menu-${idModal}`).classList.add('hide');
              s(`.btn-close-${idModal}`).classList.remove('hide');
              s(`.${idModal}`).style.width = `${this.Data[idModal][options.mode].width}px`;
              s(`.html-${idModal}`).style.display = 'block';
              // s(`.title-modal-${idModal}`).style.display = 'block';
              if (s(`.main-body-top`)) {
                s(`.btn-bar-center-icon-close`).classList.remove('hide');
                s(`.btn-bar-center-icon-menu`).classList.add('hide');
              }

              Responsive.Event[`slide-menu-${idModal}`]();
            };
            barConfig.buttons.close.onClick = () => {
              this.Data[idModal][options.mode].width = 0;
              s(`.btn-close-${idModal}`).classList.add('hide');
              s(`.btn-menu-${idModal}`).classList.remove('hide');
              s(`.${idModal}`).style.width = `${this.Data[idModal][options.mode].width}px`;
              s(`.html-${idModal}`).style.display = 'none';
              if (s(`.main-body-top`)) {
                s(`.btn-bar-center-icon-menu`).classList.remove('hide');
                s(`.btn-bar-center-icon-close`).classList.add('hide');
              }
              // s(`.title-modal-${idModal}`).style.display = 'none';
              Responsive.Event[`slide-menu-${idModal}`]();
            };
            transition += `, width 0.3s`;

            append('body', html`<div class="fix modal slide-menu-top-bar"></div>`);

            setTimeout(async () => {
              // clone and change position

              // s(`.btn-close-${idModal}`);
              // s(`.btn-menu-${idModal}`);

              // const btnCloseNode = s(`.btn-close-${idModal}`).cloneNode(true);
              // s(`.btn-close-${idModal}`).remove();
              // s(`.slide-menu-top-bar`).appendChild(btnCloseNode);
              // s(`.btn-close-${idModal}`).onclick = btnCloseEvent;

              // const btnMenuNode = s(`.btn-menu-${idModal}`).cloneNode(true);
              // s(`.btn-menu-${idModal}`).remove();
              // s(`.slide-menu-top-bar`).appendChild(btnMenuNode);
              // s(`.btn-menu-${idModal}`).onclick = btnMenuEvent;

              const titleNode = s(`.title-modal-${idModal}`).cloneNode(true);
              s(`.title-modal-${idModal}`).remove();
              s(`.slide-menu-top-bar`).appendChild(titleNode);
              s(`.slide-menu-top-bar`).style.zIndex = 7;

              // s('body').removeChild(`.${idModal}`);
              // while (s(`.top-modal`).firstChild) s(`.top-modal`).removeChild(s(`.top-modal`).firstChild);

              {
                const { barConfig } = await Themes[Css.currentTheme]();
                barConfig.buttons.maximize.disabled = true;
                barConfig.buttons.minimize.disabled = true;
                barConfig.buttons.restore.disabled = true;
                barConfig.buttons.menu.disabled = true;
                barConfig.buttons.close.disabled = true;
                const id = 'main-body';
                await Modal.Render({
                  id,
                  barConfig,
                  html: options.htmlMainBody ? options.htmlMainBody : () => html``,
                  titleClass: 'hide',
                  style: {
                    // overflow: 'hidden',
                    background: 'none',
                    resize: 'none',
                    'min-width': `${minWidth}px`,
                    // border: '3px solid red',
                  },
                  dragDisabled: true,
                  maximize: true,
                  slideMenu: 'modal-menu',
                  heightTopBar: options.heightTopBar,
                  heightBottomBar: options.heightBottomBar,
                });

                Responsive.Event[`view-${id}`] = () => {
                  if (!this.Data[id] || !s(`.${id}`)) return delete Responsive.Event[`view-${id}`];
                  if (this.Data[id].slideMenu)
                    s(`.${id}`).style.height = `${
                      window.innerHeight -
                      (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                      (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
                    }px`;
                };
                Responsive.Event[`view-${id}`]();
              }

              if (options.heightBottomBar && options.heightBottomBar > 0) {
                const { barConfig } = await Themes[Css.currentTheme]();
                barConfig.buttons.maximize.disabled = true;
                barConfig.buttons.minimize.disabled = true;
                barConfig.buttons.restore.disabled = true;
                barConfig.buttons.menu.disabled = true;
                barConfig.buttons.close.disabled = true;
                const id = 'bottom-bar';
                const widthCell = 33.33;
                await Modal.Render({
                  id,
                  barConfig,
                  html: async () => html`
                    <div class="fl" style="height: ${options.heightBottomBar}px;">
                      ${await BtnIcon.Render({
                        style: `width: ${widthCell}%; height: 100%`,
                        class: 'in fll main-btn-menu bottom-bar-btn bottom-btn-center',
                        label: html` <div class="abs center">
                          <i class="far fa-square btn-bar-center-icon-square hide"></i>
                          <i class="fa-solid fa-xmark btn-bar-center-icon-close hide"></i>
                          <i class="fa-solid fa-bars btn-bar-center-icon-menu"></i>
                        </div>`,
                      })}
                      ${await BtnIcon.Render({
                        style: `width: ${widthCell}%; height: 100%`,
                        class: 'in fll main-btn-menu bottom-bar-btn bottom-btn-left',
                        label: html`<div class="abs center"><i class="fas fa-chevron-left"></i></div>`,
                      })}
                      ${await BtnIcon.Render({
                        style: `width: ${widthCell}%; height: 100%`,
                        class: 'in fll main-btn-menu bottom-bar-btn bottom-btn-right',
                        label: html` <div class="abs center"><i class="fas fa-chevron-right"></i></div>`,
                      })}
                    </div>
                  `,
                  titleClass: 'hide',
                  style: {
                    resize: 'none',
                    height: `${options.heightBottomBar}px`,
                    'min-width': `${minWidth}px`,
                    'z-index': 7,
                  },
                  dragDisabled: true,
                  maximize: true,
                });
                Responsive.Event[`view-${id}`] = () => {
                  if (!this.Data[id] || !s(`.${id}`)) return delete Responsive.Event[`view-${id}`];
                  s(`.${id}`).style.top = `${
                    window.innerHeight - (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
                  }px`;
                };
                Responsive.Event[`view-${id}`]();
                s(`.bottom-btn-left`).onclick = (e) => {
                  e.preventDefault();
                  window.history.back();
                };
                s(`.bottom-btn-center`).onclick = (e) => {
                  e.preventDefault();
                  // if (!s(`.btn-close-modal-menu`).classList.contains('hide')) return s(`.main-btn-home`).click();
                  if (!s(`.btn-close-modal-menu`).classList.contains('hide')) return s(`.btn-close-modal-menu`).click();
                  if (!s(`.btn-menu-modal-menu`).classList.contains('hide')) return s(`.btn-menu-modal-menu`).click();
                };
                s(`.bottom-btn-right`).onclick = (e) => {
                  e.preventDefault();
                  window.history.forward();
                };
              }

              {
                const { barConfig } = await Themes[Css.currentTheme]();
                barConfig.buttons.maximize.disabled = true;
                barConfig.buttons.minimize.disabled = true;
                barConfig.buttons.restore.disabled = true;
                barConfig.buttons.menu.disabled = true;
                barConfig.buttons.close.disabled = true;
                const id = 'main-body-top';
                await Modal.Render({
                  id,
                  barConfig,
                  html: () => html``,
                  titleClass: 'hide',
                  class: 'hide',
                  style: {
                    // overflow: 'hidden',
                    background: 'none',
                    resize: 'none',
                    'min-width': `${minWidth}px`,
                    'z-index': 5,
                    background: `rgba(61, 61, 61, 0.5)`,
                    // border: '3px solid red',
                  },
                  dragDisabled: true,
                  maximize: true,
                  heightTopBar: options.heightTopBar,
                  heightBottomBar: options.heightBottomBar,
                });

                Responsive.Event[`view-${id}`] = () => {
                  if (!this.Data[id] || !s(`.${id}`)) return delete Responsive.Event[`view-${id}`];
                  s(`.${id}`).style.height = `${
                    window.innerHeight -
                    (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                    (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
                  }px`;
                };
                Responsive.Event[`view-${id}`]();

                s(`.main-body-top`).onclick = () => s(`.btn-close-modal-menu`).click();
              }

              await NotificationManager.RenderBoard(options);
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
        }
      </style>
      <div class="fix ${options && options.class ? options.class : ''} modal box-shadow ${idModal}">
        <div class="abs modal-handle-${idModal}"></div>
        <div class="in modal-html-${idModal}">
          <div class="stq bar-default-modal bar-default-modal-${idModal}">
            <div class="in btn-bar-modal-container ${options?.btnBarModalClass ? options.btnBarModalClass : ''}">
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
              ${options && options.titleRender ? options.titleRender() : options.title ? options.title : ''}
            </div>
          </div>

          <div class="in html-${idModal}">
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
      Object.keys(this.Data[idModal].onCloseListener).map((keyListener) =>
        this.Data[idModal].onCloseListener[keyListener](),
      );
      if (options && 'barConfig' in options && options.barConfig.buttons.close.onClick)
        return options.barConfig.buttons.close.onClick();
      s(`.${idModal}`).style.opacity = '0';
      if (this.Data[idModal].observer) {
        this.Data[idModal].observer.disconnect();
        // this.Data[idModal].observer.unobserve();
      }
      setTimeout(() => {
        if (!s(`.${idModal}`)) return;
        s(`.${idModal}`).remove();
        s(`.style-${idModal}`).remove();
        delete this.Data[idModal];
        // Router
        if (options.route)
          (() => {
            let path = window.location.pathname;
            if (path[path.length - 1] !== '/') path = `${path}/`;
            let newPath = `${getProxyPath()}`;
            if (path !== newPath) {
              for (const subIdModal of Object.keys(this.Data)) {
                if (this.Data[subIdModal].options.route) {
                  newPath = `${newPath}${this.Data[subIdModal].options.route}`;
                  // console.warn('SET MODAL URI', newPath);
                  setURI(newPath);
                  s(`.${subIdModal}`).style.zIndex = '4';
                  return setDocTitle({ ...options.RouterInstance, route: this.Data[subIdModal].options.route });
                }
              }
              // console.warn('SET MODAL URI', newPath);
              setURI(newPath);
              return setDocTitle({ ...options.RouterInstance, route: '' });
            }
          })();
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
          setTimeout(() => (s(`.${idModal}`) ? (s(`.${idModal}`).style.transition = transition) : null), 300);
        };

        callBack();
        this.Data[idModal].slideMenu = {
          callBack,
          id: options.slideMenu,
        };
        s(`.${idModal}`).style.height = `${
          window.innerHeight -
          (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
          (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
        }px`;
        s(`.${idModal}`).style.top = `${options.heightTopBar ? options.heightTopBar : heightDefaultTopBar}px`;
      } else {
        s(`.${idModal}`).style.width = '100%';
        s(`.${idModal}`).style.height = '100%';
        s(`.${idModal}`).style.top = `${options.heightTopBar ? options.heightTopBar : heightDefaultTopBar}px`;
        s(`.${idModal}`).style.left = `0px`;
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
      this.Data[idModal].observerCallBack = () => {
        logger.info('ResizeObserver', `.${idModal}`, s(`.${idModal}`).offsetWidth, s(`.${idModal}`).offsetHeight);
        if (this.Data[idModal] && this.Data[idModal].observerEvent)
          Object.keys(this.Data[idModal].observerEvent).map((eventKey) =>
            this.Data[idModal].observerEvent[eventKey]({
              width: s(`.${idModal}`).offsetWidth,
              height: s(`.${idModal}`).offsetHeight,
            }),
          );
        else console.warn('observer not found', idModal);
      };
      this.Data[idModal].observer = new ResizeObserver(this.Data[idModal].observerCallBack);
      this.Data[idModal].observer.observe(s(`.${idModal}`));
      setTimeout(this.Data[idModal].observerCallBack);
    }
    // cancel: [cancel1, cancel2]
    return {
      id: idModal,
      dragInstance,
      setDragInstance,
      ...this.Data[idModal],
    };
  },
  removeModal: async function (idModal) {
    return new Promise((resolve) => {
      if (!s(`.${idModal}`)) resolve();
      s(`.${idModal}`).style.opacity = '0';
      setTimeout(() => {
        if (this.Data[idModal].observer) {
          this.Data[idModal].observer.disconnect();
          // this.Data[idModal].observer.unobserve();
        }
        s(`.${idModal}`).remove();
        s(`.style-${idModal}`).remove();
        delete this.Data[idModal];
        resolve();
      });
    });
  },
  mobileModal: () => window.innerWidth < 600 || window.innerHeight < 600,
  writeHTML: ({ idModal, html }) => htmls(`.html-${idModal}`, html),
};

export { Modal };
