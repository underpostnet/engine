import { getId, newInstance } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s, prepend, setURI, getProxyPath, htmls } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';
import { loggerFactory } from './Logger.js';
import { Css, ThemeEvents, Themes, ThemesScope, darkTheme, getStyleAttrFromObject, renderStatus } from './Css.js';
import { setDocTitle } from './Router.js';
import { NotificationManager } from './NotificationManager.js';
import { EventsUI } from './EventsUI.js';
import { Translate } from './Translate.js';
import { Input } from './Input.js';
import { Validator } from './Validator.js';

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
      disableTools: [],
    },
  ) {
    if (options.heightBottomBar === undefined) options.heightBottomBar = 50;
    if (options.heightTopBar === undefined) options.heightTopBar = 50;
    let originHeightBottomBar = options.heightBottomBar ? newInstance(options.heightBottomBar) : 0;
    let originHeightTopBar = options.heightTopBar ? newInstance(options.heightTopBar) : 0;
    options.heightTopBar = options.heightTopBar + options.heightBottomBar;
    options.heightBottomBar = 0;
    let width = 300;
    let height = 400;
    let top = 0;
    let left = 0;
    const setCenterRestore = () => {
      const ResponsiveData = Responsive.getResponsiveData();
      top = `${ResponsiveData.height / 2 - height / 2}px`;
      left = `${ResponsiveData.width / 2 - width / 2}px`;
    };
    setCenterRestore();
    let transition = `opacity 0.3s, box-shadow 0.3s, bottom 0.3s`;
    const slideMenuWidth = 320;
    const minWidth = width;
    const heightDefaultTopBar = 0;
    const heightDefaultBottomBar = 0;
    const idModal = options && 'id' in options ? options.id : getId(this.Data, 'modal-');
    this.Data[idModal] = {
      options,
      onCloseListener: {},
      onMenuListener: {},
      onDragEndListener: {},
      onObserverListener: {},
      onClickListener: {},
    };
    if (options && 'mode' in options) {
      this.Data[idModal][options.mode] = {};
      switch (options.mode) {
        case 'view':
          setTimeout(() => {
            const cleanTopModal = () => {
              Object.keys(this.Data).map((_idModal) => {
                if (this.Data[_idModal].options.mode === 'view' && s(`.${_idModal}`))
                  s(`.${_idModal}`).style.zIndex = '3';
              });
            };
            const setTopModal = () => {
              if (s(`.${idModal}`)) s(`.${idModal}`).style.zIndex = '4';
              else setTimeout(setTopModal, 100);
            };
            cleanTopModal();
            setTopModal();
            this.Data[idModal].onClickListener[`${idModal}-z-index`] = () => {
              if (s(`.${idModal}`) && s(`.${idModal}`).style.zIndex === '3') {
                if (this.Data[idModal].options.route) setURI(`${getProxyPath()}${this.Data[idModal].options.route}`);
                cleanTopModal();
                setTopModal();
              }
            };
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
          (async () => {
            const { barConfig } = options;
            options.style = {
              position: 'absolute',
              height: `${
                window.innerHeight -
                (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
              }px`,
              width: `${slideMenuWidth}px`,
              'z-index': 6,
              resize: 'none',
              top: `${options.heightTopBar ? options.heightTopBar : heightDefaultTopBar}px`,
            };
            options.mode === 'slide-menu-right' ? (options.style.right = '0px') : (options.style.left = '0px');
            const contentIconClass = 'abs center';

            options.dragDisabled = true;
            options.titleClass = 'hide';
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
              this.Data[idModal][options.mode].width = slideMenuWidth;
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

            const inputSearchBoxId = `top-bar-search-box`;
            append(
              'body',
              html` <div class="fix modal slide-menu-top-bar">
                <div
                  class="fl top-bar  ${options.barClass ? options.barClass : ''}"
                  style="height: ${originHeightTopBar}px;"
                >
                  ${await BtnIcon.Render({
                    style: `height: 100%`,
                    class: 'in fll main-btn-menu action-bar-box action-btn-close hide',
                    label: html` <div class="${contentIconClass} action-btn-close-render">
                      <i class="fa-solid fa-xmark"></i>
                    </div>`,
                  })}
                  ${await BtnIcon.Render({
                    style: `height: 100%`,
                    class: `in fll main-btn-menu action-bar-box action-btn-app-icon ${
                      options?.disableTools?.includes('app-icon') ? 'hide' : ''
                    }`,
                    label: html` <div class="${contentIconClass} action-btn-app-icon-render"></div>`,
                  })}
                  <div
                    class="in fll top-bar-search-box-container hover ${options?.disableTools?.includes('text-box')
                      ? 'hide'
                      : ''}"
                  >
                    ${await Input.Render({
                      id: inputSearchBoxId,
                      placeholder: Translate.Render('search', '.top-bar-search-box'), // html`<i class="fa-solid fa-magnifying-glass"></i> ${Translate.Render('search')}`,
                      placeholderIcon: html`<div
                        class="in fll"
                        style="width: ${originHeightTopBar}px; height: ${originHeightTopBar}px;"
                      >
                        <div class="abs center"><i class="fa-solid fa-magnifying-glass"></i></div>
                      </div>`,
                      inputClass: 'in fll',
                      // containerClass: '',
                    })}
                  </div>
                </div>
              </div>`,
            );
            const formDataInfoNode = [
              { model: 'search-box', id: inputSearchBoxId, rules: [] /*{ type: 'isEmpty' }, { type: 'isEmail' }*/ },
            ];
            s(`.input-info-${inputSearchBoxId}`).style.textAlign = 'left';
            htmls(`.input-info-${inputSearchBoxId}`, '');
            const inputInfoNode = s(`.input-info-${inputSearchBoxId}`).cloneNode(true);
            s(`.input-info-${inputSearchBoxId}`).remove();
            {
              let hoverHistBox = false;
              let hoverInputBox = false;
              const id = 'search-box-history';
              const searchBoxHistoryClose = () =>
                setTimeout(() => {
                  if (s(`.${id}`) && !hoverHistBox && !hoverInputBox) {
                    s(`.btn-close-${id}`).click();
                    s(`.action-btn-app-icon`).classList.remove('hide');
                    s(`.action-btn-close`).classList.add('hide');
                  }
                });

              const searchBoxHistoryOpen = async () => {
                // in focus

                if (!s(`.${id}`)) {
                  const { barConfig } = await Themes[Css.currentTheme]();
                  barConfig.buttons.maximize.disabled = true;
                  barConfig.buttons.minimize.disabled = true;
                  barConfig.buttons.restore.disabled = true;
                  barConfig.buttons.menu.disabled = true;
                  barConfig.buttons.close.disabled = true;
                  await Modal.Render({
                    id,
                    barConfig,
                    title: renderViewTitle({
                      icon: html`<i class="fas fa-history mini-title"></i>`,
                      text: Translate.Render('Recent'),
                    }),
                    html: () => html``,
                    titleClass: 'mini-title',
                    style: {
                      resize: 'none',
                      'max-width': '450px',
                      height:
                        this.mobileModal() && window.innerWidth < 445
                          ? `${window.innerHeight - originHeightTopBar}px !important`
                          : '300px !important',
                      'z-index': 7,
                    },
                    dragDisabled: true,
                    maximize: true,
                    heightBottomBar: 0,
                    heightTopBar: originHeightTopBar,
                  });

                  const titleNode = s(`.title-modal-${id}`).cloneNode(true);
                  s(`.title-modal-${id}`).remove();
                  s(`.btn-bar-modal-container-render-${id}`).classList.add('in');
                  s(`.btn-bar-modal-container-render-${id}`).classList.add('fll');
                  s(`.btn-bar-modal-container-render-${id}`).appendChild(titleNode);

                  s(`.action-btn-app-icon`).classList.add('hide');
                  s(`.action-btn-close`).classList.remove('hide');
                  this.Data[id].onCloseListener[id] = () => {
                    s(`.action-btn-app-icon`).classList.remove('hide');
                    s(`.action-btn-close`).classList.add('hide');
                  };

                  prepend(`.btn-bar-modal-container-${id}`, inputInfoNode.outerHTML);
                  const searchBoxValidator = await Validator.instance(formDataInfoNode);

                  s('.top-bar-search-box').onblur = searchBoxHistoryClose;
                  s(`.top-bar-search-box-container`).onmouseover = () => {
                    hoverInputBox = true;
                  };
                  s(`.top-bar-search-box-container`).onmouseout = () => {
                    hoverInputBox = false;
                  };
                  s(`.top-bar-search-box-container`).onclick = () => {
                    searchBoxHistoryOpen();
                  };
                  s(`.${id}`).onmouseover = () => {
                    hoverHistBox = true;
                  };
                  s(`.${id}`).onmouseout = () => {
                    hoverHistBox = false;
                    s('.top-bar-search-box').focus();
                  };
                }
              };
              s('.top-bar-search-box').oninput = searchBoxHistoryOpen;
              s('.top-bar-search-box').onfocus = searchBoxHistoryOpen;
            }
            setTimeout(async () => {
              // clone and change position

              // s(`.btn-close-${idModal}`);
              // s(`.btn-menu-${idModal}`);
              if (originHeightBottomBar === 0) {
                const btnCloseNode = s(`.btn-close-${idModal}`).cloneNode(true);
                s(`.btn-close-${idModal}`).remove();
                s(`.top-bar`).appendChild(btnCloseNode);
                s(`.btn-close-${idModal}`).onclick = btnCloseEvent;

                const btnMenuNode = s(`.btn-menu-${idModal}`).cloneNode(true);
                s(`.btn-menu-${idModal}`).remove();
                s(`.top-bar`).appendChild(btnMenuNode);
                s(`.btn-menu-${idModal}`).onclick = btnMenuEvent;
              }

              // const titleNode = s(`.title-modal-${idModal}`).cloneNode(true);
              // s(`.title-modal-${idModal}`).remove();
              // s(`.top-bar`).appendChild(titleNode);

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
                  heightTopBar: originHeightTopBar,
                  heightBottomBar: originHeightBottomBar,
                });
                const maxWidthInputSearchBox = 450;
                const paddingInputSearchBox = 5;
                Responsive.Event[`view-${id}`] = () => {
                  if (!this.Data[id] || !s(`.${id}`)) return delete Responsive.Event[`view-${id}`];
                  const widthInputSearchBox =
                    window.innerWidth > maxWidthInputSearchBox ? maxWidthInputSearchBox : window.innerWidth;
                  s(`.top-bar-search-box-container`).style.width = `${widthInputSearchBox - originHeightTopBar - 1}px`;
                  s(`.top-bar-search-box`).style.width = `${
                    widthInputSearchBox -
                    originHeightTopBar * 2 -
                    paddingInputSearchBox * 2 /*padding input*/ -
                    10 /* right-margin */
                  }px`;
                  s(`.top-bar-search-box`).style.top = `${
                    (originHeightTopBar - s(`.top-bar-search-box`).clientHeight) / 2
                  }px`;
                  if (this.Data[id].slideMenu)
                    s(`.${id}`).style.height = `${
                      window.innerHeight -
                      (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                      (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
                    }px`;
                };
                Responsive.Event[`view-${id}`]();
              }

              {
                const { barConfig } = await Themes[Css.currentTheme]();
                barConfig.buttons.maximize.disabled = true;
                barConfig.buttons.minimize.disabled = true;
                barConfig.buttons.restore.disabled = true;
                barConfig.buttons.menu.disabled = true;
                barConfig.buttons.close.disabled = true;
                const id = 'bottom-bar';
                if (options && options.homeModals && !options.homeModals.includes(id)) options.homeModals.push(id);
                else options.homeModals = [id];
                const html = async () => html`
                  <style>
                    .top-bar-search-box-container {
                      height: 100%;
                      overflow: hidden;
                    }
                    .bottom-bar {
                      overflow: hidden;
                    }
                    .action-bar-box {
                      margin: 0px;
                      border: none;
                      width: 50px;
                      min-height: 50px;
                    }
                  </style>
                  <div
                    class="fl ${options.barClass ? options.barClass : ''}"
                    style="height: ${originHeightBottomBar}px;"
                  >
                    ${await BtnIcon.Render({
                      style: `height: 100%`,
                      class: `in fll main-btn-menu action-bar-box action-btn-center ${
                        options?.disableTools?.includes('center') ? 'hide' : ''
                      }`,
                      label: html`
                        <div class="${contentIconClass}">
                          <i class="far fa-square btn-bar-center-icon-square hide"></i>
                          <span class="btn-bar-center-icon-close hide">${barConfig.buttons.close.label}</span>
                          <span class="btn-bar-center-icon-menu">${barConfig.buttons.menu.label}</span>
                        </div>
                      `,
                    })}
                    ${await BtnIcon.Render({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-lang ${
                        options?.disableTools?.includes('lang') ? 'hide' : ''
                      }`,
                      label: html` <div class="${contentIconClass} action-btn-lang-render"></div>`,
                    })}
                    ${await BtnIcon.Render({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-theme ${
                        options?.disableTools?.includes('theme') ? 'hide' : ''
                      }`,
                      label: html` <div class="${contentIconClass} action-btn-theme-render"></div>`,
                    })}
                    ${await BtnIcon.Render({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-home ${
                        options?.disableTools?.includes('navigator') ? 'hide' : ''
                      }`,
                      label: html` <div class="${contentIconClass}"><i class="fas fa-home"></i></div>`,
                    })}
                    ${await BtnIcon.Render({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-right ${
                        options?.disableTools?.includes('navigator') ? 'hide' : ''
                      }`,
                      label: html` <div class="${contentIconClass}"><i class="fas fa-chevron-right"></i></div>`,
                    })}
                    ${await BtnIcon.Render({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-left ${
                        options?.disableTools?.includes('navigator') ? 'hide' : ''
                      }`,
                      label: html`<div class="${contentIconClass}"><i class="fas fa-chevron-left"></i></div>`,
                    })}
                  </div>
                `;
                if (options.heightBottomBar === 0 && options.heightTopBar > 0) {
                  append(`.slide-menu-top-bar`, html` <div class="in ${id}">${await html()}</div>`);
                } else {
                  await Modal.Render({
                    id,
                    barConfig,
                    html,
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
                    //  <div class="in fll right-offset-menu-bottom-bar" style="height: 100%"></div>
                    // s(`.right-offset-menu-bottom-bar`).style.width = `${window.innerWidth - slideMenuWidth}px`;
                    s(`.${id}`).style.top = `${
                      window.innerHeight - (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
                    }px`;
                  };
                  Responsive.Event[`view-${id}`]();
                }
                s(`.action-btn-left`).onclick = (e) => {
                  e.preventDefault();
                  window.history.back();
                };
                s(`.action-btn-center`).onclick = (e) => {
                  e.preventDefault();
                  // if (!s(`.btn-close-modal-menu`).classList.contains('hide')) return s(`.main-btn-home`).click();
                  if (!s(`.btn-close-modal-menu`).classList.contains('hide')) return s(`.btn-close-modal-menu`).click();
                  if (!s(`.btn-menu-modal-menu`).classList.contains('hide')) return s(`.btn-menu-modal-menu`).click();
                };
                s(`.action-btn-right`).onclick = (e) => {
                  e.preventDefault();
                  window.history.forward();
                };
                s(`.action-btn-home`).onclick = () => s(`.main-btn-home`).click();
                s(`.action-btn-app-icon`).onclick = () => s(`.action-btn-home`).click();
              }

              {
                ThemeEvents['action-btn-theme'] = () => {
                  htmls(
                    `.action-btn-theme-render`,
                    html` ${darkTheme ? html` <i class="fas fa-moon"></i>` : html`<i class="far fa-sun"></i>`}`,
                  );
                };
                ThemeEvents['action-btn-theme']();

                EventsUI.onClick(`.action-btn-theme`, async () => {
                  const themePair = ThemesScope.find((t) => t.theme === Css.currentTheme).themePair;
                  const theme = themePair ? themePair : ThemesScope.find((t) => t.dark === !darkTheme).theme;
                  if (s(`.dropdown-option-${theme}`)) s(`.dropdown-option-${theme}`).click();
                  else await Themes[theme]();
                });
                if (!(ThemesScope.find((t) => t.dark) && ThemesScope.find((t) => !t.dark))) {
                  s(`.action-btn-theme`).classList.add('hide');
                }
              }

              {
                htmls(`.action-btn-lang-render`, html` ${s('html').lang}`);
                EventsUI.onClick(`.action-btn-lang`, () => {
                  let lang = 'en';
                  if (s('html').lang === 'en') lang = 'es';
                  if (s(`.dropdown-option-${lang}`)) s(`.dropdown-option-${lang}`).click();
                  else Translate.renderLang(lang);
                });
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
                  heightTopBar: originHeightTopBar,
                  heightBottomBar: originHeightBottomBar,
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
      ${getStyleAttrFromObject(`.${idModal}`, options)}
      <div class="fix ${options && options.class ? options.class : ''} modal box-shadow ${idModal}">
        <div class="abs modal-handle-${idModal}"></div>
        <div class="in modal-html-${idModal}">
          <div class="stq bar-default-modal bar-default-modal-${idModal}">
            <div
              class="fl btn-bar-modal-container btn-bar-modal-container-${idModal} ${options?.btnBarModalClass
                ? options.btnBarModalClass
                : ''}"
            >
              <div class="btn-bar-modal-container-render-${idModal}"></div>
              ${await BtnIcon.Render({
                class: `btn-minimize-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.btnContainerClass ? options.btnContainerClass : ''
                } ${options?.barConfig?.buttons?.minimize?.disabled ? 'hide' : ''}`,
                label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                  ${options?.barConfig?.buttons?.minimize?.label ? options.barConfig.buttons.minimize.label : html`_`}
                </div>`,
              })}
              ${await BtnIcon.Render({
                class: `btn-restore-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.btnContainerClass ? options.btnContainerClass : ''
                } ${options?.barConfig?.buttons?.restore?.disabled ? 'hide' : ''}`,
                label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                  ${options?.barConfig?.buttons?.restore?.label ? options.barConfig.buttons.restore.label : html`□`}
                </div>`,
                style: 'display: none',
              })}
              ${await BtnIcon.Render({
                class: `btn-maximize-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.btnContainerClass ? options.btnContainerClass : ''
                } ${options?.barConfig?.buttons?.maximize?.disabled ? 'hide' : ''}`,
                label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                  ${options?.barConfig?.buttons?.maximize?.label ? options.barConfig.buttons.maximize.label : html`▢`}
                </div>`,
              })}
              ${await BtnIcon.Render({
                class: `btn-close-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.btnContainerClass ? options.btnContainerClass : ''
                } ${options?.barConfig?.buttons?.close?.disabled ? 'hide' : ''}`,
                label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                  ${options?.barConfig?.buttons?.close?.label ? options.barConfig.buttons.close.label : html`X`}
                </div>`,
              })}
              ${await BtnIcon.Render({
                class: `btn-menu-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                  options?.btnContainerClass ? options.btnContainerClass : ''
                } ${options?.barConfig?.buttons?.menu?.disabled ? 'hide' : ''}`,
                label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                  ${options?.barConfig?.buttons?.menu?.label ? options.barConfig.buttons.menu.label : html`≡`}
                </div>`,
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
    switch (options.mode) {
      case 'slide-menu':
      case 'slide-menu-right':
      case 'slide-menu-left':
        s(`.main-btn-home`).onclick = () => {
          for (const keyModal of Object.keys(this.Data)) {
            if (
              ![idModal, 'main-body-top', 'main-body']
                .concat(options?.homeModals ? options.homeModals : [])
                .includes(keyModal)
            )
              s(`.btn-close-${keyModal}`).click();
          }
          s(`.btn-close-modal-menu`).click();
        };
        break;

      default:
        break;
    }
    let dragOptions = {
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
        Object.keys(this.Data[idModal].onDragEndListener).map((keyListener) =>
          this.Data[idModal].onDragEndListener[keyListener](),
        );
      },
    };
    let dragInstance;
    // new Draggable(s(`.${idModal}`), { disabled: true });
    const setDragInstance = () => (options?.dragDisabled ? null : new Draggable(s(`.${idModal}`), dragOptions));
    this.Data[idModal].setDragInstance = (updateDragOptions) => {
      dragOptions = {
        ...dragOptions,
        ...updateDragOptions,
      };
      dragInstance = setDragInstance();
      this.Data[idModal].dragInstance = dragInstance;
      this.Data[idModal].dragOptions = dragOptions;
    };
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
              for (const subIdModal of Object.keys(this.Data).reverse()) {
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
      setCenterRestore();
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
      Object.keys(this.Data[idModal].onMenuListener).map((keyListener) =>
        this.Data[idModal].onMenuListener[keyListener](),
      );
      if (options && 'barConfig' in options && options.barConfig.buttons.menu.onClick)
        return options.barConfig.buttons.menu.onClick();
    };
    s(`.btn-menu-${idModal}`).onclick = btnMenuEvent;

    dragInstance = setDragInstance();
    if (options && options.maximize) s(`.btn-maximize-${idModal}`).click();
    if (options.observer) {
      this.Data[idModal].onObserverListener = {};
      this.Data[idModal].observerCallBack = () => {
        logger.info('ResizeObserver', `.${idModal}`, s(`.${idModal}`).offsetWidth, s(`.${idModal}`).offsetHeight);
        if (this.Data[idModal] && this.Data[idModal].onObserverListener)
          Object.keys(this.Data[idModal].onObserverListener).map((eventKey) =>
            this.Data[idModal].onObserverListener[eventKey]({
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
    s(`.${idModal}`).onclick = () => {
      Object.keys(this.Data[idModal].onClickListener).map((keyListener) =>
        this.Data[idModal].onClickListener[keyListener](),
      );
    };
    return {
      id: idModal,
      ...this.Data[idModal],
    };
  },
  mobileModal: () => window.innerWidth < 600 || window.innerHeight < 600,
  writeHTML: ({ idModal, html }) => htmls(`.html-${idModal}`, html),
};

const renderMenuLabel = ({ img, text, icon }) => {
  if (!img) return html`<span class="menu-btn-icon">${icon}</span> ${text}`;
  return html`<img class="abs center img-btn-square-menu" src="${getProxyPath()}assets/ui-icons/${img}" />
    <div class="abs center main-btn-menu-text">${text}</div>`;
};

const renderViewTitle = (options = { icon: '', img: '', text: '', assetFolder: '', 'ui-icons': '' }) => {
  const { img, text, icon } = options;
  if (!img && !options['ui-icon']) return html`<span class="view-title-icon">${icon}</span> ${text}`;
  return html`<img
      class="abs img-btn-square-view-title"
      src="${options['ui-icon']
        ? `${getProxyPath()}assets/${options.assetFolder ? options.assetFolder : 'ui-icons'}/${options['ui-icon']}`
        : img}"
    />
    <div class="in text-btn-square-view-title">${text}</div>`;
};

export { Modal, renderMenuLabel, renderViewTitle };
