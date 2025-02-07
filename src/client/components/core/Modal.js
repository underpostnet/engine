import { cap, getId, newInstance } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import {
  append,
  s,
  prepend,
  setPath,
  getProxyPath,
  htmls,
  sa,
  getAllChildNodes,
  getCurrentTrace,
  isActiveElement,
} from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Responsive } from './Responsive.js';
import { loggerFactory } from './Logger.js';
import {
  Css,
  ThemeEvents,
  Themes,
  ThemesScope,
  darkTheme,
  renderStyleTag,
  renderStatus,
  renderCssAttr,
} from './Css.js';
import { setDocTitle } from './Router.js';
import { NotificationManager } from './NotificationManager.js';
import { EventsUI } from './EventsUI.js';
import { Translate } from './Translate.js';
import { Input } from './Input.js';
import { Validator } from './Validator.js';
import { DropDown } from './DropDown.js';
import { Keyboard } from './Keyboard.js';
import { Badge } from './Badge.js';
import { Worker } from './Worker.js';

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
    let width = 300;
    let height = 400;
    let top = 0;
    let left = 0;
    const topBottomBarEnable = options && options.barMode && options.barMode === 'top-bottom-bar';
    if (!topBottomBarEnable) {
      options.heightTopBar = options.heightTopBar + options.heightBottomBar;
      options.heightBottomBar = 0;
    }
    let transition = `opacity 0.3s, box-shadow 0.3s, bottom 0.3s`;
    const originSlideMenuWidth = 320;
    const collapseSlideMenuWidth = 50;
    let slideMenuWidth = originSlideMenuWidth;
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
      onExpandUiListener: {},
      onBarUiOpen: {},
      onBarUiClose: {},
      query: options.query ? `${window.location.search}` : undefined,
    };
    const setCenterRestore = () => {
      const ResponsiveData = Responsive.getResponsiveData();
      top = `${ResponsiveData.height / 2 - height / 2}px`;
      left = `${ResponsiveData.width / 2 - width / 2}px`;
    };
    if (idModal !== 'main-body') setCenterRestore();
    if (options && 'mode' in options) {
      this.Data[idModal][options.mode] = {};
      switch (options.mode) {
        case 'view':
          if (options && options.slideMenu) s(`.btn-close-${options.slideMenu}`).click();
          options.zIndexSync = true;

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
                setPath(`${newPath}`); // ${location.search}
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
              // 'overflow-x': 'hidden',
              // overflow: 'visible', // required for tooltip
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
                  if (s(`.btn-menu-${idModal}`).classList.contains('hide') && collapseSlideMenuWidth !== slideMenuWidth)
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
              setTimeout(() => {
                s(`.main-body-btn-ui-menu-menu`).classList.add('hide');
                s(`.main-body-btn-ui-menu-close`).classList.remove('hide');
                if (s(`.btn-bar-center-icon-menu`)) {
                  s(`.btn-bar-center-icon-close`).classList.remove('hide');
                  s(`.btn-bar-center-icon-menu`).classList.add('hide');
                }
              });

              setTimeout(() => {
                s(`.main-body-btn-container`).style[
                  true || (options.mode && options.mode.match('right')) ? 'right' : 'left'
                ] = options.mode && options.mode.match('right') ? `${slideMenuWidth}px` : '0px';
              });
              Responsive.Event[`slide-menu-${idModal}`]();
            };
            barConfig.buttons.close.onClick = () => {
              this.Data[idModal][options.mode].width = 0;
              s(`.btn-close-${idModal}`).classList.add('hide');
              s(`.btn-menu-${idModal}`).classList.remove('hide');
              s(`.${idModal}`).style.width = `${this.Data[idModal][options.mode].width}px`;
              s(`.html-${idModal}`).style.display = 'none';
              setTimeout(() => {
                s(`.main-body-btn-ui-menu-close`).classList.add('hide');
                s(`.main-body-btn-ui-menu-menu`).classList.remove('hide');
                if (s(`.btn-bar-center-icon-menu`)) {
                  s(`.btn-bar-center-icon-menu`).classList.remove('hide');
                  s(`.btn-bar-center-icon-close`).classList.add('hide');
                }
              });
              // s(`.title-modal-${idModal}`).style.display = 'none';
              setTimeout(() => {
                s(`.main-body-btn-container`).style[
                  true || (options.mode && options.mode.match('right')) ? 'right' : 'left'
                ] = `${0}px`;
              });
              Responsive.Event[`slide-menu-${idModal}`]();
            };
            transition += `, width 0.3s`;

            setTimeout(() => {
              append(
                'body',
                html`
                  <div
                    class="abs main-body-btn-container"
                    style="top: ${options.heightTopBar + 50}px; z-index: 9; ${true ||
                    (options.mode && options.mode.match('right'))
                      ? 'right'
                      : 'left'}: 50px; width: 50px; height: 100px; transition: .3s"
                  >
                    <div
                      class="abs main-body-btn main-body-btn-menu"
                      style="top: 50px; ${true || (options.mode && options.mode.match('right'))
                        ? 'right'
                        : 'left'}: 0px"
                    >
                      <div class="abs center">
                        <i class="fa-solid fa-xmark hide main-body-btn-ui-menu-close"></i>
                        <i class="fa-solid fa-bars main-body-btn-ui-menu-menu"></i>
                      </div>
                    </div>
                    <div
                      class="abs main-body-btn main-body-btn-ui"
                      style="top: 0px; ${true || (options.mode && options.mode.match('right')) ? 'right' : 'left'}: 0px"
                    >
                      <div class="abs center">
                        <i class="fas fa-caret-down main-body-btn-ui-open hide"></i>
                        <i class="fas fa-caret-up main-body-btn-ui-close"></i>
                      </div>
                    </div>
                    <div class="main-body-btn-container-custom"></div>
                  </div>
                `,
              );

              s(`.main-body-btn-menu`).onclick = () => {
                Modal.actionBtnCenter();
              };

              let _heightTopBar, _heightBottomBar, _topMenu;
              s(`.main-body-btn-ui`).onclick = () => {
                if (s(`.main-body-btn-ui-open`).classList.contains('hide')) {
                  s(`.main-body-btn-ui-open`).classList.remove('hide');
                  s(`.main-body-btn-ui-close`).classList.add('hide');
                  _heightTopBar = newInstance(options.heightTopBar);
                  _heightBottomBar = newInstance(options.heightBottomBar);
                  _topMenu = newInstance(s(`.modal-menu`).style.top);
                  options.heightTopBar = 0;
                  options.heightBottomBar = 0;
                  s(`.slide-menu-top-bar`).classList.add('hide');
                  s(`.bottom-bar`).classList.add('hide');
                  s(`.modal-menu`).style.top = '0px';
                  s(`.main-body-btn-container`).style.top = '50px';
                  s(`.main-body`).style.top = '0px';
                  for (const event of Object.keys(Modal.Data[idModal].onBarUiClose))
                    Modal.Data[idModal].onBarUiClose[event]();
                } else {
                  s(`.main-body-btn-ui-close`).classList.remove('hide');
                  s(`.main-body-btn-ui-open`).classList.add('hide');
                  options.heightTopBar = _heightTopBar;
                  options.heightBottomBar = _heightBottomBar;
                  s(`.modal-menu`).style.top = _topMenu;
                  s(`.main-body-btn-container`).style.top = `${options.heightTopBar + 50}px`;
                  s(`.slide-menu-top-bar`).classList.remove('hide');
                  s(`.bottom-bar`).classList.remove('hide');
                  s(`.main-body`).style.top = `${options.heightTopBar}px`;
                  for (const event of Object.keys(Modal.Data[idModal].onBarUiOpen))
                    Modal.Data[idModal].onBarUiOpen[event]();
                }
                Responsive.Event[`slide-menu-modal-menu`]();
                Object.keys(this.Data).map((_idModal) => {
                  if (this.Data[_idModal].slideMenu) {
                    if (s(`.btn-maximize-${_idModal}`)) s(`.btn-maximize-${_idModal}`).click();
                  }
                });
                Responsive.Event[`view-${'main-body'}`]();
                if (Responsive.Event[`view-${'bottom-bar'}`]) Responsive.Event[`view-${'bottom-bar'}`]();
                if (Responsive.Event[`view-${'main-body-top'}`]) Responsive.Event[`view-${'main-body-top'}`]();
                for (const keyEvent of Object.keys(this.Data[idModal].onExpandUiListener)) {
                  this.Data[idModal].onExpandUiListener[keyEvent](
                    !s(`.main-body-btn-ui-open`).classList.contains('hide'),
                  );
                }
              };
            });

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
                  <form
                    class="in fll top-bar-search-box-container hover ${options?.disableTools?.includes('text-box')
                      ? 'hide'
                      : ''}"
                  >
                    ${await Input.Render({
                      id: inputSearchBoxId,
                      placeholder: Modal.mobileModal() ? Translate.Render('search', '.top-bar-search-box') : undefined, // html`<i class="fa-solid fa-magnifying-glass"></i> ${Translate.Render('search')}`,
                      placeholderIcon: html`<div
                        class="in fll"
                        style="width: ${originHeightTopBar}px; height: ${originHeightTopBar}px;"
                      >
                        <div class="abs center"><i class="fa-solid fa-magnifying-glass"></i></div>
                        ${!Modal.mobileModal()
                          ? html` <div
                              class="inl wfm key-shortcut-container-info"
                              style="${renderCssAttr({ style: { top: '10px', left: '60px' } })}"
                            >
                              ${await Badge.Render({
                                id: 'shortcut-key-info-search',
                                text: 'Shift',
                                classList: 'inl',
                                style: { 'z-index': 1 },
                              })}
                              ${await Badge.Render({
                                id: 'shortcut-key-info-search',
                                text: '+',
                                classList: 'inl',
                                style: { 'z-index': 1, background: 'none', color: '#5f5f5f' },
                              })}
                              ${await Badge.Render({
                                id: 'shortcut-key-info-search',
                                text: 'k',
                                classList: 'inl',
                                style: { 'z-index': 1 },
                              })}
                            </div>`
                          : ''}
                      </div>`,
                      inputClass: 'in fll',
                      // containerClass: '',
                    })}
                  </form>
                  <div
                    class="abs top-box-profile-container ${options?.disableTools?.includes('profile') ? 'hide' : ''}"
                  >
                    ${await BtnIcon.Render({
                      style: `height: 100%`,
                      class: 'in fll session-in-log-in main-btn-menu action-bar-box action-btn-profile-log-in',
                      label: html` <div class="${contentIconClass} action-btn-profile-log-in-render"></div>`,
                    })}
                    ${await BtnIcon.Render({
                      style: `height: 100%`,
                      class: 'in fll session-in-log-out main-btn-menu action-bar-box action-btn-profile-log-out',
                      label: html` <div class="${contentIconClass} action-btn-profile-log-out-render">
                        <i class="fas fa-user-plus"></i>
                      </div>`,
                    })}
                  </div>
                </div>
                ${options?.slideMenuTopBarFix
                  ? html`<div class="abs modal slide-menu-top-bar-fix" style="height: ${options.heightTopBar}px">
                      ${await options.slideMenuTopBarFix()}
                    </div>`
                  : ''}
              </div>`,
            );
            EventsUI.onClick(`.action-btn-profile-log-in`, () => {
              s(`.main-btn-account`).click();
            });
            EventsUI.onClick(`.action-btn-profile-log-out`, () => {
              s(`.main-btn-sign-up`).click();
            });
            s(`.input-info-${inputSearchBoxId}`).style.textAlign = 'left';
            htmls(`.input-info-${inputSearchBoxId}`, '');
            const inputInfoNode = s(`.input-info-${inputSearchBoxId}`).cloneNode(true);
            s(`.input-info-${inputSearchBoxId}`).remove();
            {
              const id = 'search-box-history';
              const searchBoxHistoryId = id;
              const formDataInfoNode = [
                {
                  model: 'search-box',
                  id: inputSearchBoxId,
                  rules: [] /*{ type: 'isEmpty' }, { type: 'isEmail' }*/,
                },
              ];
              let hoverHistBox = false;
              let hoverInputBox = false;
              let currentKeyBoardSearchBoxIndex = 0;
              let results = [];
              let historySearchBox = [];

              const checkHistoryBoxTitleStatus = () => {
                if (s(`.search-box-result-title`) && s(`.search-box-result-title`).classList) {
                  if (!s(`.${inputSearchBoxId}`).value.trim()) {
                    s(`.search-box-result-title`).classList.add('hide');
                    s(`.search-box-recent-title`).classList.remove('hide');
                  } else {
                    s(`.search-box-recent-title`).classList.add('hide');
                    s(`.search-box-result-title`).classList.remove('hide');
                  }
                }
              };

              const checkShortcutContainerInfoEnabled = () => {
                if (Modal.mobileModal() || !s(`.key-shortcut-container-info`)) return;
                if (!s(`.${inputSearchBoxId}`).value) {
                  s(`.key-shortcut-container-info`).classList.remove('hide');
                } else s(`.key-shortcut-container-info`).classList.add('hide');
              };

              const renderSearchResult = async (results) => {
                htmls(`.html-${searchBoxHistoryId}`, '');
                if (results.length === 0) {
                  append(
                    `.html-${searchBoxHistoryId}`,
                    await BtnIcon.Render({
                      label: html`<i class="fas fa-exclamation-circle"></i> ${Translate.Render('no-result-found')}`,
                      class: `wfa`,
                      style: renderCssAttr({
                        style: {
                          padding: '3px',
                          margin: '2px',
                          'text-align': 'center',
                          border: 'none',
                          cursor: 'default',
                          background: 'none !important',
                        },
                      }),
                    }),
                  );
                }
                let indexResult = -1;
                for (const result of results) {
                  indexResult++;
                  const indexRender = indexResult;
                  append(
                    `.html-${searchBoxHistoryId}`,
                    await BtnIcon.Render({
                      label: `${
                        result.fontAwesomeIcon
                          ? html`<i class="${result.fontAwesomeIcon.classList.toString()}"></i> `
                          : result.imgElement
                          ? html`<img
                              class="inl"
                              src="${result.imgElement.src}"
                              style="${renderCssAttr({ style: { width: '25px', height: '25px' } })}"
                            />`
                          : ''
                      } ${Translate.Render(result.routerId)}`,
                      class: `wfa search-result-btn-${result.routerId} ${
                        indexResult === currentKeyBoardSearchBoxIndex ? 'main-btn-menu-active' : ''
                      } search-result-btn-${indexResult}`,
                      style: renderCssAttr({
                        style: { padding: '3px', margin: '2px', 'text-align': 'left' },
                      }),
                    }),
                  );
                  s(`.search-result-btn-${result.routerId}`).onclick = () => {
                    s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.remove(
                      `main-btn-menu-active`,
                    );
                    currentKeyBoardSearchBoxIndex = indexRender;
                    s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.add(
                      `main-btn-menu-active`,
                    );
                    setSearchValue(`.search-result-btn-${result.routerId}`);
                  };
                }
              };

              const getResultSearchBox = (validatorData) => {
                const { model, id } = validatorData;
                switch (model) {
                  case 'search-box':
                    {
                      if (
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex] &&
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList
                      )
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.remove(
                          `main-btn-menu-active`,
                        );
                      currentKeyBoardSearchBoxIndex = 0;
                      if (
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex] &&
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList
                      )
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.add(
                          `main-btn-menu-active`,
                        );
                      results = [];
                      const routerInstance = Worker.RouterInstance.Routes();
                      for (const _routerId of Object.keys(routerInstance)) {
                        const routerId = _routerId.slice(1);
                        if (routerId) {
                          if (
                            s(`.main-btn-${routerId}`) &&
                            (routerId.toLowerCase().match(s(`.${id}`).value.toLowerCase()) ||
                              (Translate.Data[routerId] &&
                                Object.keys(Translate.Data[routerId]).filter((keyLang) =>
                                  Translate.Data[routerId][keyLang]
                                    .toLowerCase()
                                    .match(s(`.${id}`).value.toLowerCase()),
                                ).length > 0))
                          ) {
                            const fontAwesomeIcon = getAllChildNodes(s(`.main-btn-${routerId}`)).find((e) => {
                              return (
                                e.classList &&
                                Array.from(e.classList).find((e) => e.match('fa-') && !e.match('fa-grip-vertical'))
                              );
                            });
                            const imgElement = getAllChildNodes(s(`.main-btn-${routerId}`)).find((e) => {
                              return (
                                typeof e.src === 'string' &&
                                e.src.match(routerId) &&
                                e.classList &&
                                Array.from(e.classList).find((e) => e.match('img-btn-square-menu'))
                              );
                            });
                            if (imgElement || fontAwesomeIcon) {
                              results.push({
                                routerId,
                                fontAwesomeIcon: fontAwesomeIcon,
                                imgElement,
                              });
                            }
                          }
                        }
                      }
                    }
                    break;

                  default:
                    break;
                }
                if (s(`.${inputSearchBoxId}`).value.trim()) renderSearchResult(results);
                else renderSearchResult(historySearchBox);
              };

              const searchBoxCallBack = async (validatorData) => {
                const isSearchBoxActiveElement = isActiveElement(inputSearchBoxId);
                checkHistoryBoxTitleStatus();
                checkShortcutContainerInfoEnabled();
                if (!isSearchBoxActiveElement && !hoverHistBox && !hoverInputBox) {
                  Modal.removeModal(searchBoxHistoryId);
                  return;
                }
                setTimeout(() => getResultSearchBox(validatorData));
              };

              const getDefaultSearchBoxSelector = () => `.search-result-btn-${currentKeyBoardSearchBoxIndex}`;

              const updateSearchBoxValue = (selector) => {
                if (!selector) selector = getDefaultSearchBoxSelector();
                if (s(selector).childNodes) {
                  if (
                    s(selector).childNodes[s(selector).childNodes.length - 1] &&
                    s(selector).childNodes[s(selector).childNodes.length - 1].data &&
                    s(selector).childNodes[s(selector).childNodes.length - 1].data.trim()
                  ) {
                    s(`.${inputSearchBoxId}`).value =
                      s(selector).childNodes[s(selector).childNodes.length - 1].data.trim();
                  } else if (
                    s(selector).childNodes[s(selector).childNodes.length - 2] &&
                    s(selector).childNodes[s(selector).childNodes.length - 2].outerText &&
                    s(selector).childNodes[s(selector).childNodes.length - 2].outerText.trim()
                  ) {
                    s(`.${inputSearchBoxId}`).value =
                      s(selector).childNodes[s(selector).childNodes.length - 2].outerText.trim();
                  }
                }
                checkHistoryBoxTitleStatus();
                checkShortcutContainerInfoEnabled();
              };

              const setSearchValue = (selector) => {
                if (!selector) selector = getDefaultSearchBoxSelector();
                historySearchBox = historySearchBox.filter(
                  (h) => h.routerId !== results[currentKeyBoardSearchBoxIndex].routerId,
                );
                historySearchBox.unshift(results[currentKeyBoardSearchBoxIndex]);
                updateSearchBoxValue(selector);
                s(`.main-btn-${results[currentKeyBoardSearchBoxIndex].routerId}`).click();
                Modal.removeModal(searchBoxHistoryId);
              };

              const searchBoxHistoryOpen = async () => {
                if (!s(`.${id}`)) {
                  const { barConfig } = await Themes[Css.currentTheme]();
                  barConfig.buttons.maximize.disabled = true;
                  barConfig.buttons.minimize.disabled = true;
                  barConfig.buttons.restore.disabled = true;
                  barConfig.buttons.menu.disabled = true;
                  barConfig.buttons.close.disabled = false;
                  await Modal.Render({
                    id,
                    barConfig,
                    title: html`<div class="search-box-recent-title">
                        ${renderViewTitle({
                          icon: html`<i class="fas fa-history mini-title"></i>`,
                          text: Translate.Render('recent'),
                        })}
                      </div>
                      <div class="search-box-result-title hide">
                        ${renderViewTitle({
                          icon: html`<i class="far fa-list-alt mini-title"></i>`,
                          text: Translate.Render('results'),
                        })}
                      </div>`,
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
                    barMode: options.barMode,
                  });

                  const titleNode = s(`.title-modal-${id}`).cloneNode(true);
                  s(`.title-modal-${id}`).remove();
                  s(`.btn-bar-modal-container-render-${id}`).classList.add('in');
                  s(`.btn-bar-modal-container-render-${id}`).classList.add('fll');
                  s(`.btn-bar-modal-container-render-${id}`).appendChild(titleNode);

                  prepend(`.btn-bar-modal-container-${id}`, html`<div class="hide">${inputInfoNode.outerHTML}</div>`);

                  s(`.top-bar-search-box-container`).onmouseover = () => {
                    hoverInputBox = true;
                  };
                  s(`.top-bar-search-box-container`).onmouseout = () => {
                    hoverInputBox = false;
                  };
                  s(`.${id}`).onmouseover = () => {
                    hoverHistBox = true;
                  };
                  s(`.${id}`).onmouseout = () => {
                    hoverHistBox = false;
                    s(`.${inputSearchBoxId}`).focus();
                  };
                }
              };

              s('.top-bar-search-box').oninput = () => {
                searchBoxHistoryOpen();
                searchBoxCallBack(formDataInfoNode[0]);
              };
              s('.top-bar-search-box').onfocus = () => {
                searchBoxHistoryOpen();
                searchBoxCallBack(formDataInfoNode[0]);
              };
              s('.top-bar-search-box').onblur = () => {
                if (!hoverHistBox && !hoverInputBox && !isActiveElement(inputSearchBoxId)) {
                  Modal.removeModal(searchBoxHistoryId);
                }
              };
              EventsUI.onClick(`.top-bar-search-box-container`, () => {
                searchBoxHistoryOpen();
                searchBoxCallBack(formDataInfoNode[0]);
              });

              const timePressDelay = 100;
              Keyboard.instanceMultiPressKey({
                id: 'input-search-shortcut-ArrowUp',
                keys: ['ArrowUp'],
                eventCallBack: () => {
                  if (s(`.${id}`)) {
                    if (
                      s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex] &&
                      s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex - 1]
                    ) {
                      s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.remove(
                        `main-btn-menu-active`,
                      );
                      currentKeyBoardSearchBoxIndex--;
                      s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.add(
                        `main-btn-menu-active`,
                      );
                    } else {
                      if (s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex])
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.remove(
                          `main-btn-menu-active`,
                        );
                      currentKeyBoardSearchBoxIndex = s(`.html-${searchBoxHistoryId}`).childNodes.length - 1;
                      if (s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex])
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.add(
                          `main-btn-menu-active`,
                        );
                    }
                    updateSearchBoxValue();
                  }
                },
                timePressDelay,
              });

              Keyboard.instanceMultiPressKey({
                id: 'input-search-shortcut-ArrowDown',
                keys: ['ArrowDown'],
                eventCallBack: () => {
                  if (s(`.${id}`)) {
                    if (
                      s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex] &&
                      s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex + 1]
                    ) {
                      s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.remove(
                        `main-btn-menu-active`,
                      );
                      currentKeyBoardSearchBoxIndex++;
                      s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.add(
                        `main-btn-menu-active`,
                      );
                    } else {
                      if (s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex])
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.remove(
                          `main-btn-menu-active`,
                        );
                      currentKeyBoardSearchBoxIndex = 0;
                      if (s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex])
                        s(`.html-${searchBoxHistoryId}`).childNodes[currentKeyBoardSearchBoxIndex].classList.add(
                          `main-btn-menu-active`,
                        );
                    }
                    updateSearchBoxValue();
                  }
                },
                timePressDelay,
              });

              s(`.top-bar-search-box-container`).onsubmit = (e) => {
                e.preventDefault();
                setSearchValue();
              };
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
                    width: '100%',
                    // border: '3px solid red',
                  },
                  dragDisabled: true,
                  maximize: true,
                  slideMenu: 'modal-menu',
                  heightTopBar: originHeightTopBar,
                  heightBottomBar: originHeightBottomBar,
                  barMode: options.barMode,
                  observer: true,
                });
                const maxWidthInputSearchBox = 450;
                const paddingInputSearchBox = 5;
                const paddingRightSearchBox = 50;
                Responsive.Event[`view-${id}`] = () => {
                  if (!this.Data[id] || !s(`.${id}`)) return delete Responsive.Event[`view-${id}`];
                  const widthInputSearchBox =
                    window.innerWidth > maxWidthInputSearchBox ? maxWidthInputSearchBox : window.innerWidth;
                  s(`.top-bar-search-box-container`).style.width = `${
                    widthInputSearchBox - originHeightTopBar - paddingRightSearchBox - 1
                  }px`;
                  s(`.top-bar-search-box`).style.width = `${
                    widthInputSearchBox -
                    originHeightTopBar * 2 -
                    paddingRightSearchBox -
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
                Keyboard.instanceMultiPressKey({
                  id: 'input-search-shortcut-k',
                  keys: [
                    ['Shift', 'k'],
                    ['Alt', 'k'],
                  ],
                  eventCallBack: () => {
                    if (s(`.top-bar-search-box`)) {
                      s(`.top-bar-search-box`).blur();
                      s(`.top-bar-search-box`).focus();
                      s(`.top-bar-search-box`).select();
                    }
                  },
                });
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
                      class: `in fl${
                        options.mode === 'slide-menu-right' ? 'r' : 'l'
                      } main-btn-menu action-bar-box action-btn-center ${
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
                    barMode: options.barMode,
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
                EventsUI.onClick(`.action-btn-left`, (e) => {
                  e.preventDefault();
                  window.history.back();
                });
                EventsUI.onClick(`.action-btn-center`, (e) => {
                  e.preventDefault();
                  this.actionBtnCenter();
                });
                EventsUI.onClick(`.action-btn-right`, (e) => {
                  e.preventDefault();
                  window.history.forward();
                });
                EventsUI.onClick(`.action-btn-home`, () => s(`.main-btn-home`).click());
                EventsUI.onClick(`.action-btn-app-icon`, () => s(`.action-btn-home`).click());
                Keyboard.instanceMultiPressKey({
                  id: 'input-shortcut-global-escape',
                  keys: ['Escape'],
                  eventCallBack: () => {
                    // if (s(`.main-btn-home`)) s(`.main-btn-home`).click();

                    if (s(`.btn-close-${this.currentTopModalId}`)) s(`.btn-close-${this.currentTopModalId}`).click();
                  },
                });
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
                  if (s(`.dropdown-option-${theme}`))
                    DropDown.Tokens['settings-theme'].onClickEvents[`dropdown-option-${theme}`]();
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
                  if (s(`.dropdown-option-${lang}`))
                    DropDown.Tokens['settings-lang'].onClickEvents[`dropdown-option-${lang}`]();
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
                  barMode: options.barMode,
                });

                Responsive.Event[`view-${id}`] = () => {
                  if (!this.Data[id] || !s(`.${id}`)) return delete Responsive.Event[`view-${id}`];
                  s(`.${id}`).style.height =
                    s(`.main-body-btn-ui-close`).classList.contains('hide') &&
                    s(`.btn-restore-${id}`).style.display !== 'none'
                      ? `${window.innerHeight}px`
                      : `${
                          window.innerHeight -
                          (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                          (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
                        }px`;

                  if (
                    s(`.main-body-btn-ui-close`).classList.contains('hide') &&
                    s(`.btn-restore-${id}`).style.display !== 'none'
                  ) {
                    s(`.${id}`).style.top = '0px';
                  } else {
                    s(`.${id}`).style.top = `${options.heightTopBar ? options.heightTopBar : heightDefaultTopBar}px`;
                  }
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
    if (options.zIndexSync) this.zIndexSync({ idModal });
    if (s(`.${idModal}`)) {
      s(`.btn-maximize-${idModal}`).click();
      return;
    }
    if (options.slideMenu) {
      if (options.titleClass) options.titleClass = ' title-view-modal ' + options.titleClass;
      options.titleClass = ' title-view-modal ';
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
          z-index: 3;
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
        .sub-menu-title-container-${idModal},
        .nav-path-container-${idModal} {
          top: 0px;
          left: 0px;
          width: 200px;
          height: 50px;
          overflow: hidden;
          font-size: 20px;
          cursor: default;
        }
        .nav-path-display-${idModal} {
          font-size: 11px;
          width: 100%;
          top: 35px;
          left: 37px;
        }
        .nav-title-display-${idModal} {
          font-size: 19px;
          width: 100%;
          top: 13px;
          left: 13px;
        }
      </style>
      ${renderStyleTag(`style-${idModal}`, `.${idModal}`, options)}
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
              <div class="in flr bar-default-modal" style="z-index: 1">
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
            ${options.mode && options.mode.match('slide-menu')
              ? html`<div
                  class="stq modal"
                  style="${renderCssAttr({ style: { height: '50px', 'z-index': 1, top: '0px' } })}"
                >
                  ${await BtnIcon.Render({
                    style: renderCssAttr({ style: { height: '100%', color: '#5f5f5f' } }),
                    class: `in flr main-btn-menu action-bar-box btn-icon-menu-mode`,
                    label: html` <div class="abs center">
                      <i
                        class="fas fa-caret-right btn-icon-menu-mode-right ${options.mode && options.mode.match('right')
                          ? ''
                          : 'hide'}"
                      ></i
                      ><i
                        class="fas fa-caret-left btn-icon-menu-mode-left  ${options.mode && options.mode.match('right')
                          ? 'hide'
                          : ''}"
                      ></i>
                    </div>`,
                  })}
                  ${await BtnIcon.Render({
                    style: renderCssAttr({ style: { height: '100%', color: '#5f5f5f' } }),
                    class: `in flr main-btn-menu action-bar-box btn-icon-menu-back hide`,
                    label: html`<div class="abs center"><i class="fas fa-undo-alt"></i></div>`,
                  })}
                  <div class="abs sub-menu-title-container-${idModal} ac">
                    <div class="abs nav-title-display-${idModal}">
                      <!-- <i class="fas fa-home"></i> ${Translate.Render('home')} -->
                    </div>
                  </div>
                  <div class="abs nav-path-container-${idModal} ahc bold">
                    <div class="abs nav-path-display-${idModal}"><!-- ${location.pathname} --></div>
                  </div>
                </div>`
              : ''}
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
        const backMenuButtonEvent = async () => {
          if (s(`.menu-btn-container-children`)) htmls(`.menu-btn-container-children`, '');
          // htmls(`.nav-title-display-${'modal-menu'}`, html`<i class="fas fa-home"></i> ${Translate.Render('home')}`);
          htmls(`.nav-title-display-${'modal-menu'}`, html``);
          htmls(`.nav-path-display-${idModal}`, '');
          s(`.btn-icon-menu-back`).classList.add('hide');
          if (s(`.menu-btn-container-main`)) s(`.menu-btn-container-main`).classList.remove('hide');
        };
        s(`.main-btn-home`).onclick = () => {
          for (const keyModal of Object.keys(this.Data)) {
            if (
              ![idModal, 'main-body-top', 'main-body']
                .concat(options?.homeModals ? options.homeModals : [])
                .includes(keyModal)
            )
              s(`.btn-close-${keyModal}`).click();
            backMenuButtonEvent();
          }
          s(`.btn-close-modal-menu`).click();
          setPath(getProxyPath());
          setDocTitle({ ...options.RouterInstance, route: '' });
        };
        EventsUI.onClick(`.btn-icon-menu-back`, backMenuButtonEvent);
        EventsUI.onClick(`.btn-icon-menu-mode`, () => {
          if (s(`.btn-icon-menu-mode-right`).classList.contains('hide')) {
            s(`.btn-icon-menu-mode-right`).classList.remove('hide');
            s(`.btn-icon-menu-mode-left`).classList.add('hide');
          } else {
            s(`.btn-icon-menu-mode-left`).classList.remove('hide');
            s(`.btn-icon-menu-mode-right`).classList.add('hide');
          }
          if (slideMenuWidth === originSlideMenuWidth) {
            slideMenuWidth = collapseSlideMenuWidth;
            setTimeout(() => {
              s(`.main-body-btn-container`).style[
                true || (options.mode && options.mode.match('right')) ? 'right' : 'left'
              ] = options.mode && options.mode.match('right') ? `${slideMenuWidth}px` : '0px';
            }, 1);

            if (!s(`.btn-bar-center-icon-close`).classList.contains('hide')) {
              sa(`.handle-btn-container`).forEach((el) => el.classList.add('hide'));
              sa(`.menu-label-text`).forEach((el) => el.classList.add('hide'));
              if (!Modal.mobileModal()) {
                sa(`.tooltip-menu`).forEach((el) => el.classList.remove('hide'));
                s(`.${idModal}`).style.overflow = 'visible';
              }
              if (s(`.menu-btn-container-main`) && s(`.menu-btn-container-main`).classList.contains('hide'))
                s(`.btn-icon-menu-back`).classList.add('hide');
            }
            if (options.onCollapseMenu) options.onCollapseMenu();
            s(`.sub-menu-title-container-${'modal-menu'}`).classList.add('hide');
            s(`.nav-path-container-${'modal-menu'}`).classList.add('hide');
          } else {
            slideMenuWidth = originSlideMenuWidth;
            setTimeout(() => {
              s(`.main-body-btn-container`).style[
                true || (options.mode && options.mode.match('right')) ? 'right' : 'left'
              ] = options.mode && options.mode.match('right') ? `${slideMenuWidth}px` : '0px';
            }, 1);

            sa(`.handle-btn-container`).forEach((el) => el.classList.remove('hide'));
            sa(`.menu-label-text`).forEach((el) => el.classList.remove('hide'));
            if (!Modal.mobileModal()) {
              sa(`.tooltip-menu`).forEach((el) => el.classList.add('hide'));
              s(`.${idModal}`).style.overflow = null;
            }
            if (s(`.menu-btn-container-main`) && s(`.menu-btn-container-main`).classList.contains('hide'))
              s(`.btn-icon-menu-back`).classList.remove('hide');

            if (options.onExtendMenu) options.onExtendMenu();
            s(`.sub-menu-title-container-${'modal-menu'}`).classList.remove('hide');
            s(`.nav-path-container-${'modal-menu'}`).classList.remove('hide');
          }
          // btn-bar-center-icon-menu
          this.actionBtnCenter();
          this.actionBtnCenter();
        });

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
        this.removeModal(idModal);
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
                  setPath(newPath);
                  this.setTopModalCallback(subIdModal);
                  return setDocTitle({ ...options.RouterInstance, route: this.Data[subIdModal].options.route });
                }
              }
              // console.warn('SET MODAL URI', newPath);
              setPath(`${newPath}${Modal.homeCid ? `?cid=${Modal.homeCid}` : ''}`);
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
        Responsive.Event['h-ui-hide-' + idModal] = () => {
          setTimeout(() => {
            if (!s(`.${idModal}`) || !s(`.main-body-btn-ui-close`)) return;
            if (s(`.btn-restore-${idModal}`) && s(`.btn-restore-${idModal}`).style.display !== 'none') {
              s(`.${idModal}`).style.height = s(`.main-body-btn-ui-close`).classList.contains('hide')
                ? `${window.innerHeight}px`
                : `${
                    window.innerHeight -
                    (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) -
                    (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
                  }px`;
            }
            s(`.${idModal}`).style.top = s(`.main-body-btn-ui-close`).classList.contains('hide')
              ? `0px`
              : `${options.heightTopBar ? options.heightTopBar : heightDefaultTopBar}px`;
          });
        };
        Responsive.Event['h-ui-hide-' + idModal]();
      } else {
        delete Responsive.Event['h-ui-hide-' + idModal];
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
        // logger.info('ResizeObserver', `.${idModal}`, s(`.${idModal}`).offsetWidth, s(`.${idModal}`).offsetHeight);
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
      this.Data[idModal]?.onClickListener
        ? Object.keys(this.Data[idModal].onClickListener).map((keyListener) =>
            this.Data[idModal].onClickListener[keyListener](),
          )
        : null;
    };
    return {
      id: idModal,
      ...this.Data[idModal],
    };
  },
  currentTopModalId: '',
  zIndexSync: function ({ idModal }) {
    setTimeout(() => {
      const cleanTopModal = () => {
        Object.keys(this.Data).map((_idModal) => {
          if (this.Data[_idModal].options.zIndexSync && s(`.${_idModal}`)) s(`.${_idModal}`).style.zIndex = '3';
        });
      };
      const setTopModal = () => {
        if (s(`.${idModal}`)) {
          this.setTopModalCallback(idModal);
        } else setTimeout(setTopModal, 100);
      };
      cleanTopModal();
      setTopModal();
      this.Data[idModal].onClickListener[`${idModal}-z-index`] = () => {
        if (s(`.${idModal}`) && s(`.${idModal}`).style.zIndex === '3') {
          if (this.Data[idModal].options.route) setPath(`${getProxyPath()}${this.Data[idModal].options.route}`);
          cleanTopModal();
          setTopModal();
        }
      };
    });
  },
  setTopModalCallback: function (idModal) {
    s(`.${idModal}`).style.zIndex = '4';
    this.currentTopModalId = `${idModal}`;
    if (
      this.Data[idModal].query &&
      `${location.pathname}${window.location.search}` !== `${location.pathname}${this.Data[idModal].query}`
    )
      setPath(`${location.pathname}${this.Data[idModal].query}`);
  },
  mobileModal: () => window.innerWidth < 600 || window.innerHeight < 600,
  writeHTML: ({ idModal, html }) => htmls(`.html-${idModal}`, html),
  viewModalOpen: function () {
    return Object.keys(this.Data).find((idModal) => s(`.${idModal}`) && this.Data[idModal].options.mode === 'view');
  },
  removeModal: function (idModal) {
    if (!s(`.${idModal}`)) return;
    s(`.${idModal}`).remove();
    sa(`.style-${idModal}`).forEach((element) => {
      element.remove();
    });
    delete this.Data[idModal];
  },
  RenderConfirm: async function (options) {
    const { id } = options;
    append(
      'body',
      html`
        <div
          class="fix background-confirm-modal-${id}"
          style="${renderCssAttr({
            style: {
              'z-index': '10',
              background: 'rgba(0,0,0,0.5)',
              width: '100%',
              height: '100%',
              top: '0px',
              left: '0px',
              transition: '0.3s',
              opacity: '1',
            },
          })}"
        ></div>
      `,
    );
    const removeBackgroundConfirmModal = () => {
      s(`.background-confirm-modal-${id}`).style.opacity = '0';
      setTimeout(() => {
        s(`.background-confirm-modal-${id}`).remove();
      });
    };

    return new Promise(async (resolve, reject) => {
      const { barConfig } = await Themes[Css.currentTheme]();
      barConfig.buttons.maximize.disabled = true;
      barConfig.buttons.minimize.disabled = true;
      barConfig.buttons.restore.disabled = true;
      barConfig.buttons.menu.disabled = true;
      barConfig.buttons.close.disabled = false;
      const htmlRender = html`
        <br />
        <div class="in section-mp" style="font-size: 40px; text-align: center">
          ${options.icon ? options.icon : html` <i class="fas fa-question-circle"></i>`}
        </div>
        ${await options.html()}
        <div class="in section-mp">
          ${await BtnIcon.Render({
            class: `in section-mp form-button btn-confirm-${id}`,
            label: Translate.Render('confirm'),
            type: 'submit',
            style: `margin: auto`,
          })}
        </div>
        <div class="in section-mp ${options.disableBtnCancel ? 'hide' : ''}">
          ${await BtnIcon.Render({
            class: `in section-mp form-button btn-cancel-${id}`,
            label: Translate.Render('cancel'),
            type: 'submit',
            style: `margin: auto`,
          })}
        </div>
      `;
      await Modal.Render({
        id,
        barConfig,
        titleClass: 'hide',
        style: {
          width: '300px',
          height: '350px',
          overflow: 'hidden',
          'z-index': '11',
          resize: 'none',
        },
        dragDisabled: true,
        ...options,
        html: htmlRender,
      });

      const end = () => {
        removeBackgroundConfirmModal();
        Modal.removeModal(id);
      };
      barConfig.buttons.close.onClick = () => {
        end();
        resolve({ status: 'cancelled' });
      };
      s(`.background-confirm-modal-${id}`).onclick = () => {
        end();
        resolve({ status: 'cancelled' });
      };
      s(`.btn-cancel-${id}`).onclick = () => {
        end();
        resolve({ status: 'cancelled' });
      };
      s(`.btn-confirm-${id}`).onclick = () => {
        end();
        resolve({ status: 'confirm' });
      };
    });
  },
  headerTitleHeight: 40,
  actionBtnCenter: function () {
    // if (!s(`.btn-close-modal-menu`).classList.contains('hide')) return s(`.main-btn-home`).click();
    if (!s(`.btn-close-modal-menu`).classList.contains('hide')) {
      return s(`.btn-close-modal-menu`).click();
    }
    if (!s(`.btn-menu-modal-menu`).classList.contains('hide')) {
      return s(`.btn-menu-modal-menu`).click();
    }
  },
  cleanUI: function () {
    s(`.top-bar`).classList.add('hide');
    s(`.bottom-bar`).classList.add('hide');
    s(`.modal-menu`).classList.add('hide');
  },
  restoreUI: function () {
    s(`.top-bar`).classList.remove('hide');
    s(`.bottom-bar`).classList.remove('hide');
    s(`.modal-menu`).classList.remove('hide');
  },
};

const renderMenuLabel = ({ img, text, icon }) => {
  if (!img) return html`<span class="menu-btn-icon">${icon}</span> ${text}`;
  return html`<img class="abs center img-btn-square-menu" src="${getProxyPath()}assets/ui-icons/${img}" />
    <div class="abs center main-btn-menu-text">${text}</div>`;
};

const renderViewTitle = (options = { icon: '', img: '', text: '', assetFolder: '', 'ui-icons': '', dim, top }) => {
  if (options.dim === undefined) options.dim = 60;
  const { img, text, icon, dim, top } = options;
  if (!img && !options['ui-icon']) return html`<span class="view-title-icon">${icon}</span> ${text}`;
  return html`<img
      class="abs img-btn-square-view-title"
      style="${renderCssAttr({
        style: { width: `${dim}px`, height: `${dim}px`, top: top !== undefined ? `${top}px` : `-${dim / 2}px` },
      })}"
      src="${options['ui-icon']
        ? `${getProxyPath()}assets/${options.assetFolder ? options.assetFolder : 'ui-icons'}/${options['ui-icon']}`
        : img}"
    />
    <div class="in text-btn-square-view-title" style="${renderCssAttr({ style: { 'padding-left': `${dim}px` } })}">
      ${text}
    </div>`;
};

const buildBadgeToolTipMenuOption = (id, sideKey = 'left') => {
  const option = {
    id: `tooltip-content-main-btn-${id}`,
    text: `${Translate.Render(`${id}`)}`,
    classList: 'tooltip-menu hide',
    style: { top: `0px` },
  };
  switch (sideKey) {
    case 'left':
      option.style.left = '40px';

      break;

    case 'right':
      option.style.right = '80px';
      break;

    default:
      break;
  }
  return option;
};

export { Modal, renderMenuLabel, renderViewTitle, buildBadgeToolTipMenuOption };
