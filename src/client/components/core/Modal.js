import { getId, newInstance, s4 } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s, prepend, htmls, sa, getAllChildNodes, isActiveElement } from './VanillaJs.js';
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
import {
  setDocTitle,
  closeModalRouteChangeEvent,
  handleModalViewRoute,
  getProxyPath,
  setPath,
  coreUI,
} from './Router.js';
import { NotificationManager } from './NotificationManager.js';
import { EventsUI } from './EventsUI.js';
import { Translate } from './Translate.js';
import { Input, isTextInputFocused } from './Input.js';
import { DropDown } from './DropDown.js';
import { Keyboard } from './Keyboard.js';
import { Badge } from './Badge.js';
import { Worker } from './Worker.js';
import { Scroll } from './Scroll.js';

const logger = loggerFactory(import.meta, { trace: true });

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
      observer: false,
      disableBoxShadow: false,
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
      onCollapseMenuListener: {},
      onExtendMenuListener: {},
      onDragEndListener: {},
      onObserverListener: {},
      onClickListener: {},
      onExpandUiListener: {},
      onBarUiOpen: {},
      onBarUiClose: {},
      onHome: {},
      homeModals: options.homeModals ? options.homeModals : [],
      query: options.query ? `${window.location.search}` : undefined,
      getTop: () => window.innerHeight - (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar),
      getHeight: () => {
        return (
          window.innerHeight -
          (s(`.main-body-btn-ui-close`) && !s(`.main-body-btn-ui-close`).classList.contains('hide')
            ? (options.heightTopBar ? options.heightTopBar : heightDefaultTopBar) +
              (options.heightBottomBar ? options.heightBottomBar : heightDefaultBottomBar)
            : 0)
        );
      },
    };

    if (idModal !== 'main-body' && options.mode !== 'view') {
      top = `${window.innerHeight / 2 - height / 2}px`;
      left = `${window.innerWidth / 2 - width / 2}px`;
    }
    if (options && 'mode' in options) {
      this.Data[idModal][options.mode] = {};
      switch (options.mode) {
        case 'view':
          if (options && options.slideMenu) s(`.btn-close-${options.slideMenu}`).click();
          options.zIndexSync = true;

          options.style = { width: '100%', ...options.style, 'min-width': `${minWidth}px` };

          if (this.mobileModal()) {
            options.barConfig.buttons.restore.disabled = true;
            options.barConfig.buttons.minimize.disabled = true;
            options.dragDisabled = true;
            options.style.resize = 'none';
          }

          Responsive.Event[`view-${idModal}`] = () => {
            if (!this.Data[idModal]) return delete Responsive.Event[`view-${idModal}`];
            if (this.Data[idModal].slideMenu) s(`.${idModal}`).style.height = `${this.Data[idModal].getHeight()}px`;
          };
          Responsive.Event[`view-${idModal}`]();

          // Handle view mode modal route
          if (options.route) {
            handleModalViewRoute({
              route: options.route,
              RouterInstance: options.RouterInstance,
            });
          }

          break;
        case 'slide-menu':
        case 'slide-menu-right':
        case 'slide-menu-left':
          (async () => {
            if (!options.slideMenuTopBarBannerFix) {
              options.slideMenuTopBarBannerFix = async () => {
                let style = html``;
                if (options.barMode === 'top-bottom-bar') {
                  style = html`<style>
                    .default-slide-menu-top-bar-fix-logo-container {
                      width: 50px;
                      height: 50px;
                    }
                    .default-slide-menu-top-bar-fix-logo {
                      width: 40px;
                      height: 40px;
                      padding: 5px;
                    }
                    .default-slide-menu-top-bar-fix-title-container-text {
                      font-size: 26px;
                      top: 8px;
                      color: ${darkTheme ? '#ffffff' : '#000000'};
                    }
                  </style>`;
                } else {
                  style = html`<style>
                    .default-slide-menu-top-bar-fix-logo-container {
                      width: 100px;
                      height: 100px;
                    }
                    .default-slide-menu-top-bar-fix-logo {
                      width: 50px;
                      height: 50px;
                      padding: 24px;
                    }
                    .default-slide-menu-top-bar-fix-title-container-text {
                      font-size: 30px;
                      top: 30px;
                      color: ${darkTheme ? '#ffffff' : '#000000'};
                    }
                  </style>`;
                }
                setTimeout(() => {
                  if (s(`.top-bar-app-icon`) && s(`.top-bar-app-icon`).src) {
                    s(`.default-slide-menu-top-bar-fix-logo`).src = s(`.top-bar-app-icon`).src;
                    if (s(`.top-bar-app-icon`).classList.contains('negative-color'))
                      s(`.default-slide-menu-top-bar-fix-logo`).classList.add('negative-color');
                    htmls(
                      `.default-slide-menu-top-bar-fix-title-container`,
                      html`
                        <div class="inl default-slide-menu-top-bar-fix-title-container-text">${options.title}</div>
                      `,
                    );
                  } else
                    htmls(
                      `.default-slide-menu-top-bar-fix-logo-container`,
                      html`<div class="abs center">${s(`.action-btn-app-icon-render`).innerHTML}</div>`,
                    );
                });

                return html`${style}
                  <div class="in fll default-slide-menu-top-bar-fix-logo-container">
                    <img class="default-slide-menu-top-bar-fix-logo in fll" />
                  </div>
                  <div class="in fll default-slide-menu-top-bar-fix-title-container"></div>`;
              };
            }
            const { barConfig } = options;
            options.style = {
              position: 'absolute',
              height: `${Modal.Data[idModal].getHeight()}px`,
              width: `${slideMenuWidth}px`,
              // 'overflow-x': 'hidden',
              // overflow: 'visible', // required for tooltip
              'z-index': 6,
              resize: 'none',
              top: `${options.heightTopBar ? options.heightTopBar : heightDefaultTopBar}px`,
            };
            options.mode === 'slide-menu-right' ? (options.style.right = '0px') : (options.style.left = '0px');
            const contentIconClass = 'abs center';
            if (options.class) options.class += ' hide';
            else options.class = 'hide';
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
              s(`.${idModal}`).style.height = `${Modal.Data[idModal].getHeight()}px`;
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
              // s(`.title-modal-${idModal}`).style.display = 'none';
              setTimeout(() => {
                s(`.main-body-btn-ui-menu-close`).classList.add('hide');
                s(`.main-body-btn-ui-menu-menu`).classList.remove('hide');
                if (s(`.btn-bar-center-icon-menu`)) {
                  s(`.btn-bar-center-icon-menu`).classList.remove('hide');
                  s(`.btn-bar-center-icon-close`).classList.add('hide');
                }
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
                    class="abs main-body-btn-container hide"
                    style="top: ${options.heightTopBar + 50}px; z-index: 9; ${true ||
                    (options.mode && options.mode.match('right'))
                      ? 'right'
                      : 'left'}: 50px; width: 50px; height: 150px; transition: .3s"
                  >
                    <div
                      class="abs main-body-btn main-body-btn-ui"
                      style="top: 0px; ${true || (options.mode && options.mode.match('right')) ? 'right' : 'left'}: 0px"
                    >
                      <div class="abs center">
                        <i class="fas fa-caret-down main-body-btn-ui-open hide"></i>
                        <i class="fas fa-caret-up main-body-btn-ui-close"></i>
                      </div>
                    </div>
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
                      class="abs main-body-btn main-body-btn-bar-custom ${options?.slideMenuTopBarBannerFix
                        ? ''
                        : 'hide'}"
                      style="top: 100px; ${true || (options.mode && options.mode.match('right'))
                        ? 'right'
                        : 'left'}: 0px"
                    >
                      <div class="abs center">
                        <i class="fa-solid fa-magnifying-glass main-body-btn-ui-bar-custom-open"></i>
                        <i class="fa-solid fa-home hide main-body-btn-ui-bar-custom-close"></i>
                      </div>
                    </div>
                  </div>
                `,
              );

              s(`.main-body-btn-menu`).onclick = () => {
                Modal.actionBtnCenter();
              };

              s(`.main-body-btn-bar-custom`).onclick = () => {
                if (s(`.main-body-btn-ui-close`).classList.contains('hide')) {
                  s(`.main-body-btn-ui`).click();
                }
                if (s(`.main-body-btn-ui-bar-custom-open`).classList.contains('hide')) {
                  s(`.main-body-btn-ui-bar-custom-open`).classList.remove('hide');
                  s(`.main-body-btn-ui-bar-custom-close`).classList.add('hide');
                  s(`.slide-menu-top-bar-fix`).style.top = '0px';
                } else {
                  s(`.main-body-btn-ui-bar-custom-open`).classList.add('hide');
                  s(`.main-body-btn-ui-bar-custom-close`).classList.remove('hide');
                  s(`.slide-menu-top-bar-fix`).style.top = '-100px';
                  s(`.top-bar-search-box-container`).click();
                }
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
                  s(`.main-body`).style.height = `${window.innerHeight}px`;
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
                  s(`.main-body`).style.height = `${window.innerHeight - options.heightTopBar}px`;
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
              Modal.setTopBannerLink();
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
                ${options?.slideMenuTopBarBannerFix
                  ? html`<div
                      class="abs modal slide-menu-top-bar-fix"
                      style="height: ${options.heightTopBar}px; top: 0px"
                    >
                      <a class="a-link-top-banner fl">
                        <div class="inl">${await options.slideMenuTopBarBannerFix()}</div></a
                      >
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
              // Reusable hover/focus controller for search history panel
              let unbindDocSearch = null;
              const hoverFocusCtl = EventsUI.HoverFocusController({
                inputSelector: `.top-bar-search-box-container`,
                panelSelector: `.${id}`,
                activeElementId: inputSearchBoxId,
                onDismiss: () => dismissSearchBox(),
              });
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
                    if (!s(`.html-${searchBoxHistoryId}`) || !s(`.html-${searchBoxHistoryId}`).hasChildNodes()) return;
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
                if (!s(`.html-${searchBoxHistoryId}`) || !s(`.html-${searchBoxHistoryId}`).hasChildNodes()) return;
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
                if (!isSearchBoxActiveElement && !hoverFocusCtl.shouldStay()) {
                  Modal.removeModal(searchBoxHistoryId);
                  return;
                }
                setTimeout(() => {
                  getResultSearchBox(validatorData);

                  if (
                    s(`.slide-menu-top-bar-fix`) &&
                    !s(`.main-body-btn-ui-bar-custom-open`).classList.contains('hide')
                  ) {
                    s(`.main-body-btn-bar-custom`).click();
                  }
                });
              };

              const getDefaultSearchBoxSelector = () => `.search-result-btn-${currentKeyBoardSearchBoxIndex}`;

              const updateSearchBoxValue = (selector) => {
                if (!selector) selector = getDefaultSearchBoxSelector();
                // check exist childNodes
                if (!s(selector) || !s(selector).hasChildNodes()) return;

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

                // check exist childNodes
                if (!s(selector) || !s(selector).hasChildNodes()) return;

                historySearchBox = historySearchBox.filter(
                  (h) => h.routerId !== results[currentKeyBoardSearchBoxIndex].routerId,
                );
                historySearchBox.unshift(results[currentKeyBoardSearchBoxIndex]);
                updateSearchBoxValue(selector);
                s(`.main-btn-${results[currentKeyBoardSearchBoxIndex].routerId}`).click();
                Modal.removeModal(searchBoxHistoryId);
              };
              let boxHistoryDelayRender = 0;
              const searchBoxHistoryOpen = async () => {
                if (boxHistoryDelayRender) return;
                boxHistoryDelayRender = 1000;
                setTimeout(() => (boxHistoryDelayRender = 0));
                if (!s(`.${searchBoxHistoryId}`)) {
                  const { barConfig } = await Themes[Css.currentTheme]();
                  barConfig.buttons.maximize.disabled = true;
                  barConfig.buttons.minimize.disabled = true;
                  barConfig.buttons.restore.disabled = true;
                  barConfig.buttons.menu.disabled = true;
                  barConfig.buttons.close.disabled = false;
                  await Modal.Render({
                    id: searchBoxHistoryId,
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
                    heightTopBar: options.heightTopBar,
                  });

                  // Bind hover/focus and click-outside to dismiss
                  hoverFocusCtl.bind();
                  unbindDocSearch = EventsUI.bindDismissOnDocumentClick({
                    shouldStay: hoverFocusCtl.shouldStay,
                    onDismiss: () => dismissSearchBox(),
                    anchors: [`.top-bar-search-box-container`, `.${id}`],
                  });
                  // Ensure cleanup when modal closes
                  Modal.Data[id].onCloseListener[`unbind-doc-${id}`] = () => unbindDocSearch && unbindDocSearch();

                  Modal.MoveTitleToBar(id);

                  prepend(`.btn-bar-modal-container-${id}`, html`<div class="hide">${inputInfoNode.outerHTML}</div>`);
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

              const dismissSearchBox = () => {
                if (unbindDocSearch) {
                  try {
                    unbindDocSearch();
                  } catch (e) {}
                }
                Modal.removeModal(searchBoxHistoryId);
              };
              s('.top-bar-search-box').onblur = () => {
                hoverFocusCtl.checkDismiss();
              };
              EventsUI.onClick(`.top-bar-search-box-container`, () => {
                searchBoxHistoryOpen();
                searchBoxCallBack(formDataInfoNode[0]);
                const inputEl = s(`.${inputSearchBoxId}`);
                if (inputEl && inputEl.focus) inputEl.focus();
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
                  disableBoxShadow: true,
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
                  if (this.Data[id].slideMenu) s(`.${id}`).style.height = `${Modal.Data[id].getHeight()}px`;
                };
                Responsive.Event[`view-${id}`]();
                Keyboard.instanceMultiPressKey({
                  id: 'input-search-shortcut-k',
                  keys: [
                    ['Shift', 'k'],
                    ['Alt', 'k'],
                  ],
                  eventCallBack: () => {
                    if (isTextInputFocused()) return;
                    if (s(`.top-bar-search-box`)) {
                      if (s(`.main-body-btn-ui-close`).classList.contains('hide')) {
                        s(`.main-body-btn-ui-open`).click();
                      }
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
                if (!this.Data[idModal].homeModals) this.Data[idModal].homeModals = [];
                if (!this.Data[idModal].homeModals.includes(id)) {
                  this.Data[idModal].homeModals.push(id);
                }
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
                    s(`.${id}`).style.top = `${Modal.Data[id].getTop()}px`;
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
                EventsUI.onClick(`.action-btn-home`, async () => {
                  await Modal.onHomeRouterEvent();
                  Object.keys(this.Data[idModal].onHome).map((keyListener) => this.Data[idModal].onHome[keyListener]());
                });
                EventsUI.onClick(`.action-btn-app-icon`, () => s(`.action-btn-home`).click());
                Keyboard.instanceMultiPressKey({
                  id: 'input-shortcut-global-escape',
                  keys: ['Escape'],
                  eventCallBack: () => {
                    if (s(`.btn-close-${this.currentTopModalId}`)) s(`.btn-close-${this.currentTopModalId}`).click();
                  },
                });
              }

              {
                ThemeEvents['action-btn-theme'] = async () => {
                  htmls(
                    `.action-btn-theme-render`,
                    html` ${darkTheme ? html` <i class="fas fa-moon"></i>` : html`<i class="far fa-sun"></i>`}`,
                  );
                  if (s(`.slide-menu-top-bar-fix`)) {
                    htmls(
                      `.slide-menu-top-bar-fix`,
                      html`<a class="a-link-top-banner fl">${await options.slideMenuTopBarBannerFix()}</a>`,
                    );
                    Modal.setTopBannerLink();
                  }
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
                // old method
                // EventsUI.onClick(`.action-btn-lang`, () => {
                //   let lang = 'en';
                //   if (s('html').lang === 'en') lang = 'es';
                //   if (s(`.dropdown-option-${lang}`))
                //     DropDown.Tokens['settings-lang'].onClickEvents[`dropdown-option-${lang}`]();
                //   else Translate.renderLang(lang);
                // });

                // Open lightweight empty modal on language button, with shared dismiss logic
                EventsUI.onClick(
                  `.action-btn-lang`,
                  async () => {
                    const id = 'action-btn-lang-modal';
                    if (s(`.${id}`)) {
                      return s(`.btn-close-${id}`).click();
                    }
                    const { barConfig } = await Themes[Css.currentTheme]();
                    barConfig.buttons.maximize.disabled = true;
                    barConfig.buttons.minimize.disabled = true;
                    barConfig.buttons.restore.disabled = true;
                    barConfig.buttons.menu.disabled = true;
                    barConfig.buttons.close.disabled = false;
                    await Modal.Render({
                      id,
                      barConfig,
                      title: html`${renderViewTitle({
                        icon: html`<i class="fas fa-language mini-title"></i>`,
                        text: Translate.Render('select lang'),
                      })}`,
                      html: async () => html`${await Translate.RenderSetting('action-drop-modal' + id)}`,
                      titleClass: 'mini-title',
                      style: {
                        resize: 'none',
                        width: '100% !important',
                        height: '350px !important',
                        'max-width': '350px !important',
                        'z-index': 7,
                      },
                      dragDisabled: true,
                      maximize: true,
                      heightBottomBar: 0,
                      heightTopBar: originHeightTopBar,
                      barMode: options.barMode,
                    });

                    // Move title inside the bar container to align with control buttons
                    Modal.MoveTitleToBar(id);

                    // Position the language selection modal relative to the language button
                    Modal.positionRelativeToAnchor({
                      modalSelector: `.${id}`,
                      anchorSelector: '.action-btn-lang',
                      align: 'right',
                      offset: { x: 0, y: 6 },
                      autoVertical: true,
                    });

                    // Hover/focus controller uses the button as input anchor
                    const hoverFocusCtl = EventsUI.HoverFocusController({
                      inputSelector: `.action-btn-lang`,
                      panelSelector: `.${id}`,
                      onDismiss: () => Modal.removeModal(id),
                    });
                    hoverFocusCtl.bind();
                    const unbindDoc = EventsUI.bindDismissOnDocumentClick({
                      shouldStay: hoverFocusCtl.shouldStay,
                      onDismiss: () => Modal.removeModal(id),
                      anchors: [`.action-btn-lang`, `.${id}`],
                    });
                    Modal.Data[id].onCloseListener[`unbind-doc-${id}`] = () => unbindDoc();
                  },
                  { context: 'modal', noGate: true, noLoading: true },
                );
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
                      : `${Modal.Data[id].getHeight()}px`;

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

              const { removeEvent } = Scroll.setEvent('.main-body', async (payload) => {
                // console.warn('scroll', payload);
                if (payload.scrollTop > 100) {
                  if (!s(`.main-body-btn-ui-close`).classList.contains('hide')) s(`.main-body-btn-ui-close`).click();

                  removeEvent();
                }
              });
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
          resize: both; /* resizable required */
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
      <div
        class="fix ${options && options.class ? options.class : ''} modal ${options.disableBoxShadow
          ? ''
          : 'box-shadow'} ${idModal === 'main-body' ? `${idModal} modal-home` : idModal}"
      >
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
          // sa(`.main-btn-menu`).forEach((el) => {
          //   el.classList.remove('hide');
          // });
        };
        s(`.main-btn-home`).onclick = async () => {
          // await this.onHomeRouterEvent();
          s(`.action-btn-home`).click();
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
              if (s(`.menu-btn-container-children`) && s(`.menu-btn-container-children`).classList.contains('hide'))
                s(`.btn-icon-menu-back`).classList.add('hide');
            }
            if (options.onCollapseMenu) options.onCollapseMenu();
            s(`.sub-menu-title-container-${'modal-menu'}`).classList.add('hide');
            s(`.nav-path-container-${'modal-menu'}`).classList.add('hide');
            Object.keys(this.Data[idModal].onCollapseMenuListener).map((keyListener) =>
              this.Data[idModal].onCollapseMenuListener[keyListener](),
            );
          } else {
            slideMenuWidth = originSlideMenuWidth;
            setTimeout(() => {
              s(`.main-body-btn-container`).style[
                true || (options.mode && options.mode.match('right')) ? 'right' : 'left'
              ] = options.mode && options.mode.match('right') ? `${slideMenuWidth}px` : '0px';
            }, 1);

            sa(`.handle-btn-container`).forEach((el) => el.classList.remove('hide'));

            Modal.menuTextLabelAnimation(idModal);
            if (!Modal.mobileModal()) {
              sa(`.tooltip-menu`).forEach((el) => el.classList.add('hide'));
              s(`.${idModal}`).style.overflow = null;
            }
            if (s(`.menu-btn-container-children`) && s(`.menu-btn-container-children`).classList.contains('hide'))
              s(`.btn-icon-menu-back`).classList.remove('hide');

            if (options.onExtendMenu) options.onExtendMenu();
            s(`.sub-menu-title-container-${'modal-menu'}`).classList.remove('hide');
            s(`.nav-path-container-${'modal-menu'}`).classList.remove('hide');
            Object.keys(this.Data[idModal].onExtendMenuListener).map((keyListener) =>
              this.Data[idModal].onExtendMenuListener[keyListener](),
            );
          }
          // btn-bar-center-icon-menu
          this.actionBtnCenter();
          this.actionBtnCenter();
        });

        break;

      default:
        break;
    }
    // Track drag position for consistency
    let dragPosition = { x: 0, y: 0 };

    // Initialize drag options with proper bounds and smooth transitions
    let dragOptions = {
      handle: handle,
      bounds: {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
      preventDefault: true,
      position: { x: 0, y: 0 },
      onDragStart: () => {
        const modal = s(`.${idModal}`);
        if (!modal) return false; // Prevent drag if modal not found

        // Store current position
        const computedStyle = window.getComputedStyle(modal);
        const matrix = new DOMMatrixReadOnly(computedStyle.transform);
        dragPosition = {
          x: matrix.m41 || 0,
          y: matrix.m42 || 0,
        };

        modal.style.transition = 'none';
        modal.style.willChange = 'transform';
        return true; // Allow drag to start
      },
      onDrag: (data) => {
        // Update position based on drag delta
        dragPosition = { x: data.x, y: data.y };
      },
      onDragEnd: () => {
        const modal = s(`.${idModal}`);
        if (!modal) return;

        modal.style.willChange = '';
        modal.style.transition = transition;

        // Update drag instance with current position
        if (dragInstance) {
          dragInstance.updateOptions({
            position: dragPosition,
          });
        }

        // Notify listeners
        Object.keys(this.Data[idModal].onDragEndListener || {}).forEach((keyListener) => {
          this.Data[idModal].onDragEndListener[keyListener]?.();
        });
      },
    };

    let dragInstance = null;

    // Initialize or update drag instance
    const setDragInstance = () => {
      if (options?.dragDisabled) {
        if (dragInstance) {
          dragInstance.destroy();
          dragInstance = null;
        }
        return null;
      }

      const modal = s(`.${idModal}`);
      if (!modal) {
        console.warn(`Modal element .${idModal} not found for drag initialization`);
        return null;
      }

      // Ensure the modal has position: absolute for proper dragging
      if (window.getComputedStyle(modal).position !== 'absolute') {
        modal.style.position = 'absolute';
      }

      // Clean up existing instance
      if (dragInstance) {
        dragInstance.destroy();
      }

      try {
        // Create new instance with updated options
        dragInstance = new Draggable(modal, dragOptions);
        return dragInstance;
      } catch (error) {
        console.error('Failed to initialize draggable:', error);
        return null;
      }
    };

    // Expose method to update drag options
    this.Data[idModal].setDragInstance = (updateDragOptions) => {
      if (updateDragOptions) {
        dragOptions = { ...dragOptions, ...updateDragOptions };
      }
      dragInstance = setDragInstance();
      this.Data[idModal].dragInstance = dragInstance;
      this.Data[idModal].dragOptions = dragOptions;
    };
    // Initialize modal with proper transitions
    const modal = s(`.${idModal}`);
    if (modal) {
      // Initial state
      modal.style.transition = 'opacity 0.15s ease, transform 0.3s ease';
      modal.style.opacity = '0';

      // Trigger fade-in after a small delay to allow initial render
      requestAnimationFrame(() => {
        if (!modal) return;
        modal.style.opacity = '1';

        // Set final transition after initial animation completes
        setTimeout(() => {
          if (modal) {
            modal.style.transition = transition;

            // Initialize drag after transitions are set
            if (!options.dragDisabled) {
              setDragInstance();
              if (!options.mode) {
                dragInstance.updateOptions({
                  position: { x: 0, y: 0 },
                  disabled: false, // Ensure drag is enabled after restore
                });
              }
            }
          }
        }, 150);
      });
    }

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
        // Handle modal route change
        closeModalRouteChangeEvent({ closedId: idModal });
        // history.back();
      }, 300);
    };
    s(`.btn-close-${idModal}`).onclick = btnCloseEvent;

    // Minimize button handler
    s(`.btn-minimize-${idModal}`).onclick = () => {
      const modal = s(`.${idModal}`);
      if (!modal) return;

      if (options.slideMenu) {
        delete this.Data[idModal].slideMenu;
      }

      // Keep drag enabled when minimized
      if (dragInstance) {
        dragInstance.updateOptions({ disabled: false });
      }

      // Set up transition
      modal.style.transition = 'height 0.3s ease, transform 0.3s ease';

      // Update button states
      s(`.btn-minimize-${idModal}`).style.display = 'none';
      s(`.btn-maximize-${idModal}`).style.display = null;
      s(`.btn-restore-${idModal}`).style.display = null;

      // Collapse to header height
      const header = s(`.bar-default-modal-${idModal}`);
      if (header) {
        modal.style.height = `${header.clientHeight}px`;
        modal.style.overflow = 'hidden';
      }

      // Restore transition after animation
      setTimeout(() => {
        if (modal) {
          modal.style.transition = transition;
        }
      }, 300);
    };
    // Restore button handler
    s(`.btn-restore-${idModal}`).onclick = () => {
      const modal = s(`.${idModal}`);
      if (!modal) return;

      if (options.slideMenu) {
        delete this.Data[idModal].slideMenu;
      }

      // Re-enable dragging
      if (dragInstance) {
        dragInstance.updateOptions({ disabled: false });
      }

      // Set up transition
      modal.style.transition = 'all 0.3s ease';

      // Update button states
      s(`.btn-restore-${idModal}`).style.display = 'none';
      s(`.btn-minimize-${idModal}`).style.display = null;
      s(`.btn-maximize-${idModal}`).style.display = null;

      // Restore original dimensions and position
      modal.style.transform = '';
      modal.style.height = '';
      left = 0;
      width = 300;
      modal.style.left = `${left}px`;
      modal.style.width = `${width}px`;
      modal.style.overflow = '';

      // Reset drag position
      dragPosition = { x: 0, y: 0 };

      // Set new position
      modal.style.transform = `translate(0, 0)`;

      // Adjust top position based on top bar visibility
      const heightDefaultTopBar = 40; // Default top bar height if not specified
      s(`.${idModal}`).style.top = s(`.main-body-btn-ui-close`).classList.contains('hide')
        ? `0px`
        : `${options.heightTopBar ? options.heightTopBar : heightDefaultTopBar}px`;

      // Re-enable drag after restore
      if (dragInstance) {
        dragInstance.updateOptions({
          position: { x: 0, y: 0 },
          disabled: false, // Ensure drag is enabled after restore
        });
      }
      setTimeout(() => (s(`.${idModal}`) ? (s(`.${idModal}`).style.transition = transition) : null), 300);
    };
    s(`.btn-maximize-${idModal}`).onclick = () => {
      const modal = s(`.${idModal}`);
      if (!modal) return;

      // Disable drag when maximizing
      if (dragInstance) {
        dragInstance.updateOptions({ disabled: true });
      }

      modal.style.transition = '0.3s';
      setTimeout(() => (modal ? (modal.style.transition = transition) : null), 300);

      s(`.btn-maximize-${idModal}`).style.display = 'none';
      s(`.btn-restore-${idModal}`).style.display = null;
      s(`.btn-minimize-${idModal}`).style.display = null;
      modal.style.transform = null;

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
                : `${Modal.Data[idModal].getHeight()}px`;
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
      Modal.menuTextLabelAnimation(idModal);
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
  onHomeRouterEvent: async () => {
    // 1. Get list of modals to close.
    const modalsToClose = Object.keys(Modal.Data).filter((idModal) => {
      const modal = Modal.Data[idModal];
      if (!modal) return false;
      // Don't close the core UI elements

      if (coreUI.find((id) => idModal.startsWith(id))) {
        return false;
      }
      // Don't close modals that are part of the "home" screen itself
      const homeModals = Modal.Data['modal-menu']?.homeModals || [];
      if (homeModals.includes(idModal)) {
        return false;
      }
      return true;
    });

    // 2. Navigate to home first, creating a new history entry.
    setPath(`${getProxyPath()}${location.search ?? ''}${location.hash ?? ''}`);
    setDocTitle();

    // 3. Close the modals without them affecting the URL.
    for (const id of modalsToClose) {
      Modal.removeModal(id);
    }

    // 4. Finally, handle UI cleanup for the slide-menu.
    if (s(`.menu-btn-container-children`)) htmls(`.menu-btn-container-children`, '');
    if (s(`.nav-title-display-modal-menu`)) htmls(`.nav-title-display-modal-menu`, '');
    if (s(`.nav-path-display-modal-menu`)) htmls(`.nav-path-display-modal-menu`, '');
    if (s(`.btn-icon-menu-back`)) s(`.btn-icon-menu-back`).classList.add('hide');
    // sa(`.main-btn-menu`).forEach((el) => {
    //   el.classList.remove('hide');
    // });

    // And close the slide menu if it's open
    if (s(`.btn-close-modal-menu`) && !s(`.btn-close-modal-menu`).classList.contains('hide')) {
      s(`.btn-close-modal-menu`).click();
    }
  },
  currentTopModalId: '',
  zIndexSync: function ({ idModal }) {
    setTimeout(() => {
      if (!this.Data[idModal]) return;
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
          height: '400px',
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
  menuTextLabelAnimation: (idModal) => {
    if (
      !s(
        `.btn-icon-menu-mode-${Modal.Data[idModal].options.barMode === 'top-bottom-bar' ? 'left' : 'right'}`,
      ).classList.contains('hide')
    ) {
      return;
    }
    sa(`.menu-label-text`).forEach((el) => {
      el.classList.add('hide');
    });
    sa(`.main-btn-menu`).forEach((el) => {
      el.classList.overflow = 'hidden';
    });
    setTimeout(() => {
      sa(`.menu-label-text`).forEach((el) => {
        el.style.top = '-40px';
        el.classList.remove('hide');
      });
    }, 300);
    setTimeout(() => {
      sa(`.menu-label-text`).forEach((el) => {
        el.style.top = '0px';
      });
      sa(`.main-btn-menu`).forEach((el) => {
        el.classList.overflow = null;
      });
    }, 400);
  },
  // Move modal title element into the bar's render container so it aligns with control buttons
  /**
   * Position a modal relative to an anchor element
   * @param {Object} options - Positioning options
   * @param {string} options.modalSelector - CSS selector for the modal element
   * @param {string} options.anchorSelector - CSS selector for the anchor element
   * @param {Object} [options.offset={x: 0, y: 6}] - Offset from anchor
   * @param {string} [options.align='right'] - Horizontal alignment ('left' or 'right')
   * @param {boolean} [options.autoVertical=true] - Whether to automatically determine vertical position
   * @param {boolean} [options.placeAbove] - Force position above/below anchor (overrides autoVertical)
   */
  positionRelativeToAnchor({
    modalSelector,
    anchorSelector,
    offset = { x: 0, y: 6 },
    align = 'right',
    autoVertical = true,
    placeAbove,
  }) {
    try {
      const modal = s(modalSelector);
      const anchor = s(anchorSelector);

      if (!modal || !anchor || !anchor.getBoundingClientRect) return;

      // First, position the modal near its final position but off-screen
      const arect = anchor.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const safeMargin = 6;

      // Determine vertical position
      let finalPlaceAbove = placeAbove;
      if (autoVertical && placeAbove === undefined) {
        const inBottomBar = anchor.closest && anchor.closest('.bottom-bar');
        const inTopBar = anchor.closest && anchor.closest('.slide-menu-top-bar');

        if (inBottomBar) finalPlaceAbove = true;
        else if (inTopBar) finalPlaceAbove = false;
        else finalPlaceAbove = arect.top > vh / 2; // heuristic fallback
      }

      // Set initial position (slightly offset from final position)
      const initialOffset = finalPlaceAbove ? 20 : -20;
      modal.style.position = 'fixed';
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out';

      // Position near the anchor but slightly offset
      modal.style.top = `${finalPlaceAbove ? arect.top - 40 : arect.bottom + 20}px`;
      modal.style.left = `${align === 'right' ? arect.right - 200 : arect.left}px`;
      modal.style.transform = 'translateY(0)';

      // Force reflow to ensure initial styles are applied
      modal.offsetHeight;

      // Now calculate final position
      const mrect = modal.getBoundingClientRect();

      // Calculate final top position
      const top = finalPlaceAbove ? arect.top - mrect.height - offset.y : arect.bottom + offset.y;

      // Calculate final left position based on alignment
      let left;
      if (align === 'right') {
        left = arect.right - mrect.width - offset.x; // align right edges
      } else {
        left = arect.left + offset.x; // align left edges
      }

      // Ensure modal stays within viewport bounds
      left = Math.max(safeMargin, Math.min(left, vw - mrect.width - safeMargin));
      const finalTop = Math.max(safeMargin, Math.min(top, vh - mrect.height - safeMargin));

      // Apply final position with smooth transition
      requestAnimationFrame(() => {
        modal.style.top = `${Math.round(finalTop)}px`;
        modal.style.left = `${Math.round(left)}px`;
        modal.style.opacity = '1';
      });
    } catch (e) {
      console.error('Error positioning modal:', e);
    }
  },

  MoveTitleToBar(idModal) {
    try {
      const titleEl = s(`.title-modal-${idModal}`);
      const container = s(`.btn-bar-modal-container-render-${idModal}`);
      if (!titleEl || !container) return;
      const titleNode = titleEl.cloneNode(true);
      titleEl.remove();
      container.classList.add('in');
      container.classList.add('fll');
      container.appendChild(titleNode);
    } catch (e) {
      // non-fatal: keep default placement if structure not present
    }
  },
  setTopBannerLink: function () {
    if (s(`.a-link-top-banner`)) {
      s(`.a-link-top-banner`).setAttribute('href', `${location.origin}${getProxyPath()}`);
      EventsUI.onClick(`.a-link-top-banner`, (e) => {
        e.preventDefault();
        s(`.action-btn-home`).click();
      });
    }
  },
  headerTitleHeight: 40,
  actionBtnCenter: function () {
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
  RenderSeoSanitizer: async () => {
    sa('img').forEach((img) => {
      if (!img.getAttribute('alt')) img.setAttribute('alt', 'image ' + Worker.title + ' ' + s4());
    });
  },
};

const renderMenuLabel = ({ img, text, icon }) => {
  if (!img) return html`<span class="menu-btn-icon">${icon}</span> ${text}`;
  return html`<img class="abs center img-btn-square-menu" src="${getProxyPath()}assets/ui-icons/${img}" />
    <div class="abs center main-btn-menu-text">${text}</div>`;
};

const renderViewTitle = (
  options = { icon: '', img: '', text: '', assetFolder: '', 'ui-icons': '', dim, top, topText: '' },
) => {
  if (options.dim === undefined) options.dim = 30;
  const { img, text, icon, dim, top } = options;
  if (!img && !options['ui-icon']) return html`<span class="view-title-icon">${icon}</span> ${text}`;
  return html`<img
      class="abs img-btn-square-view-title"
      style="${renderCssAttr({
        style: {
          width: `${dim}px`,
          height: `${dim}px`,
          top: top !== undefined ? `${top}px !important` : undefined,
        },
      })}"
      src="${options['ui-icon']
        ? `${getProxyPath()}assets/${options.assetFolder ? options.assetFolder : 'ui-icons'}/${options['ui-icon']}`
        : img}"
    />
    <div
      class="in text-btn-square-view-title"
      style="${renderCssAttr({
        style: {
          // 'padding-left': `${20 + dim}px`,
          ...(options.topText !== undefined ? { top: options.topText + 'px !important' } : {}),
        },
      })}"
    >
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
