import { getId, s4 } from './CommonJs.js';
import { Draggable } from '@neodrag/vanilla';
import { append, s, prepend, htmls, sa, getAllChildNodes, isActiveElement, htmlStrSanitize } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
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
  sanitizeRoute,
  getQueryParams,
  getViewPath,
  setRouterReady,
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
import { windowGetH, windowGetW } from './windowGetDimensions.js';
import { SearchBox } from './SearchBox.js';
import { createModalEvents } from './ClientEvents.js';
import { ShellLayout, ShellLayoutPresets, SHELL_BAR_SIZE } from './ShellLayout.js';

const logger = loggerFactory(import.meta, { trace: true });

/** Query key a submenu's route uses for the item it shows (`Docs`: the framed document). */
const SUBMENU_SELECTION_QUERY_KEY = 'cid';

/**
 * @typedef {object} ModalBarButton
 * @property {string} [label] - Button label HTML
 * @property {boolean} [disabled] - Whether the button is hidden/disabled
 * @property {Function} [onClick] - Optional click handler override
 */

/**
 * @typedef {object} ModalBarConfig
 * @property {{ minimize: ModalBarButton, restore: ModalBarButton, maximize: ModalBarButton, close: ModalBarButton, menu: ModalBarButton }} buttons
 */

/**
 * @typedef {object} ModalRenderOptions
 * @property {string} [id=''] - Modal element id/class name. Auto-generated if omitted.
 * @property {ModalBarConfig} [barConfig={}] - Bar button configuration.
 * @property {string} [title=''] - Modal title HTML.
 * @property {string|Function} [html=''] - Modal body HTML or async factory.
 * @property {string} [handleType='bar'] - Drag handle type ('bar' or default full).
 * @property {string} [mode=''] - Layout mode: 'view', 'slide-menu' (the shell drawer), 'dropNotification'.
 * @property {{ layout?: 'standard'|'split', side?: 'left'|'right' }} [shell] - Shell layout of a 'slide-menu' modal; see `ShellLayout`.
 * @property {object} [RouterInstance={}] - Router instance for route-aware modals.
 * @property {string[]} [disableTools=[]] - Tool ids to hide ('app-icon', 'text-box', 'profile', 'lang', 'theme', 'navigator').
 * @property {boolean} [observer=false] - Attach a ResizeObserver to the modal element.
 * @property {boolean} [disableBoxShadow=false] - Remove box shadow from the modal.
 * @property {boolean} [dragDisabled=false] - Disable dragging.
 * @property {boolean} [maximize=false] - Immediately maximize the modal after render.
 * @property {boolean} [disableCenter=false] - Skip auto-centering.
 * @property {object} [style={}] - Inline style overrides applied via renderStyleTag.
 * @property {string} [class=''] - Extra CSS class(es) on the modal wrapper.
 * @property {string} [titleClass=''] - Class for the title element.
 * @property {string} [btnBarModalClass=''] - Class override for the button bar container.
 * @property {string} [btnContainerClass=''] - Class for each bar button.
 * @property {string} [btnIconContainerClass=''] - Class for each bar button inner icon div.
 * @property {string} [barClass=''] - Class for the top/bottom bar flex row.
 * @property {string} [renderType=''] - Insertion strategy ('prepend' or default append).
 * @property {string} [selector='body'] - Parent selector for insertion.
 * @property {string} [slideMenu=''] - Id of the shell drawer; a maximized view then fills the main body area.
 * @property {string} [route=''] - URL path segment for view-mode route tracking.
 * @property {string} [publicRoute=''] - `PublicRoutes` key a view also presents (e.g. 'entry' for a blog view).
 * @property {string} [status=''] - Status icon descriptor rendered in the bar.
 * @property {boolean} [zIndexSync=false] - Enable z-index management for stacked view modals.
 * @property {boolean} [query=false] - Snapshot the current query string into modal data.
 * @property {string[]} [homeModals=[]] - Modal ids that belong to the home screen (not closed on home nav).
 * @property {Function} [titleRender] - Function returning title HTML (takes priority over title string).
 * @property {Function} [htmlMainBody] - Factory for main-body modal html (slide-menu mode).
 * @property {Function} [slideMenuTopBarBannerFix] - Async factory for top-bar banner content.
 * @property {number} [minSearchQueryLength=1] - Minimum search query length.
 */

/**
 * @typedef {object} ModalDataEntry
 * @property {ModalRenderOptions} options - Original render options.
 * @property {import('./EventBus.js').EventBus} events - Per-modal event bus backing the listener channels below.
 *
 * The `onX` channels are EventBus-backed proxies that preserve the historical
 * `{ [key]: listener }` map API: assign to register, read+call to invoke a single
 * listener, `delete` to remove, and `Object.keys` to enumerate registered keys.
 * @property {Object.<string, Function>} onCloseListener - Close event listeners keyed by id.
 * @property {Object.<string, Function>} onMenuListener - Menu button event listeners.
 * @property {Object.<string, Function>} onDragEndListener - Drag-end listeners.
 * @property {Object.<string, Function>} onObserverListener - ResizeObserver listeners.
 * @property {Object.<string, Function>} onClickListener - Click listeners.
 * @property {Object.<string, Function>} onReloadModalListener - Reload listeners.
 * @property {Object.<string, Function>} onHome - Home navigation listeners.
 * @property {string[]} homeModals - Home modal ids.
 * @property {string} [query] - Snapshotted query string.
 * @property {Function} center - Centers the modal in the viewport.
 * @property {ResizeObserver} [observer] - Attached ResizeObserver.
 * @property {Function} [observerCallBack] - ResizeObserver callback.
 * @property {Function} [setDragInstance] - Updates drag options and re-creates the Draggable.
 * @property {object} [dragInstance] - Active Draggable instance.
 * @property {object} [dragOptions] - Current drag configuration.
 */

class Modal {
  /** @type {Object.<string, ModalDataEntry>} */
  static Data = {};

  /**
   * Viewport-centered top/left CSS values for a modal of the given size.
   * @param {{ width: number, height: number }} param0
   * @returns {{ top: string, left: string }}
   */
  static getModalCenter({ width, height }) {
    return {
      top: `${windowGetH() / 2 - height / 2}px`,
      left: `${windowGetW() / 2 - width / 2}px`,
    };
  }

  /**
   * Create or reload a modal. When the modal already exists in the DOM the
   * existing instance is reloaded via its onReloadModalListener callbacks.
   * @param {ModalRenderOptions} options
   * @returns {Promise<ModalDataEntry & { id: string }>}
   */
  static async instance(
    options = {
      id: '',
      barConfig: {},
      title: '',
      html: '',
      handleType: 'bar',
      mode: '',
      RouterInstance: {},
      disableTools: [],
      observer: false,
      disableBoxShadow: false,
      dragDisabled: false,
      maximize: false,
      disableCenter: false,
      style: {},
      class: '',
      titleClass: '',
      route: '',
      slideMenu: '',
      zIndexSync: false,
      query: false,
      homeModals: [],
    },
  ) {
    let width = 300;
    let height = 400;
    let top = options.style?.top ? options.style.top : 0;
    let left = options.style?.left ? options.style.left : 0;
    let transition = `opacity 0.3s, box-shadow 0.3s, bottom 0.3s`;
    const minWidth = width;
    const idModal = options.id ? options.id : getId(this.Data, 'modal-');
    const { bus: eventBus, channels: eventChannels } = createModalEvents();
    this.Data[idModal] = {
      options,
      events: eventBus,
      ...eventChannels,
      homeModals: options.homeModals ? options.homeModals : [],
      query: options.query ? `${window.location.search}` : undefined,
      center: () => {
        const { top: centeredTop, left: centeredLeft } = Modal.getModalCenter({ width, height });
        top = centeredTop;
        left = centeredLeft;
      },
      ...this.Data[idModal],
    };

    if (options && 'mode' in options) {
      Modal.Data[idModal][options.mode] = {};
      switch (options.mode) {
        case 'view':
          options.zIndexSync = true;

          options.style = { width: '100%', ...options.style, 'min-width': `${minWidth}px` };

          if (Modal.mobileModal()) {
            options.barConfig.buttons.restore.disabled = true;
            options.barConfig.buttons.minimize.disabled = true;
            options.dragDisabled = true;
            options.style.resize = 'none';
          }

          if (options.route)
            handleModalViewRoute({
              route: options.route,
              RouterInstance: options.RouterInstance,
              idModal,
              publicRoute: options.publicRoute,
            });

          break;
        case 'slide-menu':
          ShellLayout.mount({ ...options.shell, onDrawerOpen: () => Modal.menuTextLabelAnimation() });
          (async () => {
            const { footer: footerHeight } = ShellLayoutPresets[ShellLayout.config.layout];
            if (!options.slideMenuTopBarBannerFix) {
              options.slideMenuTopBarBannerFix = async () => {
                const style =
                  footerHeight > 0
                    ? html`<style>
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
                          color: ${darkTheme ? '#ffffff' : '#000000'};
                        }
                        /* Themes size and offset the title for the 100px banner with !important;
                           the 50px one has to win over them or the title spills into the menu. */
                        .slide-menu-top-bar-fix .default-slide-menu-top-bar-fix-title-container-text {
                          font-size: 26px !important;
                          top: 8px !important;
                          left: 0px !important;
                        }
                      </style>`
                    : html`<style>
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
            options.style = { 'z-index': 6, resize: 'none' };
            const contentIconClass = 'abs center';
            top = 'auto';
            transition = '.3s';
            options.dragDisabled = true;
            options.titleClass = 'hide';
            options.disableCenter = true;
            options.btnBarModalClass = 'hide';

            const inputSearchBoxId = `top-bar-search-box`;
            append(
              'body',
              html`<div class="fix modal slide-menu-top-bar" style="z-index: 7">
                <div
                  class="fl top-bar ${options.barClass ? options.barClass : ''}"
                  style="height: ${SHELL_BAR_SIZE}px;"
                >
                  ${ShellLayout.renderSlot('start')}
                  ${await BtnIcon.instance({
                    style: `height: 100%`,
                    class: `in fll main-btn-menu action-bar-box action-btn-app-icon ${
                      options?.disableTools?.includes('app-icon') ? 'hide' : ''
                    }`,
                    label: html` <div class="${contentIconClass} action-btn-app-icon-render"></div>`,
                  })}
                  <form
                    id="shell-search"
                    class="in fll top-bar-search-box-container hover ${options?.disableTools?.includes('text-box')
                      ? 'hide'
                      : ''}"
                  >
                    ${await Input.instance({
                      id: inputSearchBoxId,
                      autocomplete: 'off',
                      placeholder: Modal.mobileModal()
                        ? Translate.instance('search', '.top-bar-search-box')
                        : undefined, // html`<i class="fa-solid fa-magnifying-glass"></i> ${Translate.instance('search')}`,
                      placeholderIcon: html`<div
                        class="in fll"
                        style="width: ${SHELL_BAR_SIZE}px; height: ${SHELL_BAR_SIZE}px;"
                      >
                        <div class="abs center"><i class="fa-solid fa-magnifying-glass"></i></div>
                        ${!Modal.mobileModal()
                          ? html` <div
                              class="inl wfm key-shortcut-container-info"
                              style="${renderCssAttr({ style: { top: '10px', left: '60px' } })}"
                            >
                              ${await Badge.instance({
                                id: 'shortcut-key-info-search',
                                text: 'Shift',
                                classList: 'inl',
                                style: { 'z-index': 1 },
                              })}
                              ${await Badge.instance({
                                id: 'shortcut-key-info-search',
                                text: '+',
                                classList: 'inl',
                                style: { 'z-index': 1, background: 'none', color: '#5f5f5f' },
                              })}
                              ${await Badge.instance({
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
                    ${await BtnIcon.instance({
                      style: `height: 100%`,
                      class: 'in fll session-in-log-in main-btn-menu action-bar-box action-btn-profile-log-in',
                      label: html` <div class="${contentIconClass} action-btn-profile-log-in-render"></div>`,
                    })}
                    ${await BtnIcon.instance({
                      style: `height: 100%`,
                      class: 'in fll session-in-log-out main-btn-menu action-bar-box action-btn-profile-log-out',
                      label: html` <div class="${contentIconClass} action-btn-profile-log-out-render">
                        <i class="fas fa-user-plus"></i>
                      </div>`,
                    })}
                  </div>
                  ${ShellLayout.renderSlot('end')}
                </div>
                <div class="abs modal slide-menu-top-bar-fix" style="height: 100%">
                  <a class="a-link-top-banner fl">
                    <div class="inl">${await options.slideMenuTopBarBannerFix()}</div></a
                  >
                </div>
              </div>`,
            );
            Modal.setTopBannerLink();
            EventsUI.onClick(`.action-btn-profile-log-in`, () => {
              if (Modal.mobileModal() && s(`.btn-close-search-box-history`)) {
                s(`.btn-close-search-box-history`).click();
              }
              s(`.main-btn-account`).click();
            });
            EventsUI.onClick(`.action-btn-profile-log-out`, () => {
              if (Modal.mobileModal() && s(`.btn-close-search-box-history`)) {
                s(`.btn-close-search-box-history`).click();
              }
              s(`.main-btn-sign-up`).click();
            });
            s(`.input-info-${inputSearchBoxId}`).style.textAlign = 'left';
            htmls(`.input-info-${inputSearchBoxId}`, '');
            const inputInfoNode = s(`.input-info-${inputSearchBoxId}`).cloneNode(true);
            s(`.input-info-${inputSearchBoxId}`).remove();
            {
              // Inject SearchBox base styles
              SearchBox.injectStyles();

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

              const renderSearchResult = async (results, isRecentHistory = false) => {
                // Check if the search history modal still exists before rendering
                if (!s(`.html-${searchBoxHistoryId}`)) return;

                htmls(`.html-${searchBoxHistoryId}`, '');

                // Show/hide clear-all button based on whether showing recent history
                // Use setTimeout to ensure the button is in the DOM after modal renders
                const updateClearAllBtn = () => {
                  const clearAllBtn = s(`.btn-search-history-clear-all`);
                  if (clearAllBtn) {
                    if (isRecentHistory && results.length > 0) {
                      clearAllBtn.style.display = 'flex';
                    } else {
                      clearAllBtn.style.display = 'none';
                    }
                  }
                };
                // Try immediately and also with a delay to handle timing
                updateClearAllBtn();
                setTimeout(updateClearAllBtn, 50);

                if (results.length === 0) {
                  append(
                    `.html-${searchBoxHistoryId}`,
                    await BtnIcon.instance({
                      label: html`<i class="fas fa-exclamation-circle"></i> ${Translate.instance('no-result-found')}`,
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
                  return;
                }

                // Use SearchBox component for rendering results
                const searchContext = {
                  RouterInstance: Worker.RouterInstance,
                  options: options,
                  isRecentHistory: isRecentHistory, // Flag for delete button visibility
                  onResultClick: () => {
                    // Dismiss search box on result click
                    if (s(`.${searchBoxHistoryId}`)) {
                      Modal.removeModal(searchBoxHistoryId);
                    }
                  },
                };

                SearchBox.renderResults(results, `html-${searchBoxHistoryId}`, searchContext);
              };

              const getResultSearchBox = async (validatorData) => {
                if (!s(`.html-${searchBoxHistoryId}`)) return;
                const { model, id } = validatorData;

                switch (model) {
                  case 'search-box':
                    {
                      currentKeyBoardSearchBoxIndex = 0;
                      results = [];

                      const query = s(`.${id}`) ? s(`.${id}`).value : '';
                      const trimmedQuery = query.trim();

                      // Use SearchBox component for extensible search
                      const searchContext = {
                        RouterInstance: Worker.RouterInstance,
                        options: options,
                        minQueryLength: options?.minSearchQueryLength || 1, // Allow single character search by default
                        onResultClick: () => {
                          // Dismiss search box on result click
                          if (s(`.${searchBoxHistoryId}`)) {
                            Modal.removeModal(searchBoxHistoryId);
                          }
                        },
                      };

                      // Check minimum query length (default: 1 character)
                      const minLength = searchContext.minQueryLength;
                      if (trimmedQuery.length >= minLength) {
                        results = await SearchBox.search(trimmedQuery, searchContext);
                        renderSearchResult(results, false); // Search results - no delete buttons
                      } else if (trimmedQuery.length === 0) {
                        // Show recent results from persistent history when query is empty
                        const recentResults = SearchBox.RecentResults.getAll();
                        renderSearchResult(recentResults, true); // Recent history - show delete buttons
                      } else {
                        // Query is too short - show nothing or a hint
                        renderSearchResult([], false);
                      }
                    }
                    break;

                  default:
                    break;
                }
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

                  if (!ShellLayout.state.searchOpen) ShellLayout.openSearch();
                });
              };

              const updateSearchBoxValue = (selector) => {
                if (!selector) {
                  // Get the currently active search result item
                  const activeItem = s(`.html-${searchBoxHistoryId} .search-result-item.active-search-result`);
                  if (activeItem) {
                    const titleEl = activeItem.querySelector('.search-result-title');
                    if (titleEl && titleEl.textContent) {
                      s(`.${inputSearchBoxId}`).value = titleEl.textContent.trim();
                    }
                  }
                } else if (s(selector)) {
                  const titleEl = s(selector).querySelector('.search-result-title');
                  if (titleEl && titleEl.textContent) {
                    s(`.${inputSearchBoxId}`).value = titleEl.textContent.trim();
                  }
                }
                checkHistoryBoxTitleStatus();
                checkShortcutContainerInfoEnabled();
              };

              const setSearchValue = (selector) => {
                // Get all search result items
                const allItems = sa(`.html-${searchBoxHistoryId} .search-result-item`);
                if (!allItems || allItems.length === 0) return;

                const activeItem = allItems[currentKeyBoardSearchBoxIndex];
                if (!activeItem) return;

                const resultId = activeItem.getAttribute('data-result-id');
                const resultType = activeItem.getAttribute('data-result-type');

                if (resultType === 'route' && results[currentKeyBoardSearchBoxIndex]) {
                  const result = results[currentKeyBoardSearchBoxIndex];
                  // Track in persistent history
                  SearchBox.RecentResults.add(result);
                  updateSearchBoxValue();
                  if (s(`.main-btn-${resultId}`)) {
                    s(`.main-btn-${resultId}`).click();
                  }
                } else {
                  // Track custom provider result in persistent history
                  if (results[currentKeyBoardSearchBoxIndex]) {
                    SearchBox.RecentResults.add(results[currentKeyBoardSearchBoxIndex]);
                  }
                  // Trigger click on custom result
                  activeItem.click();
                }
                Modal.removeModal(searchBoxHistoryId);
              };
              let boxHistoryDelayRender = 0;
              const searchBoxHistoryOpen = async () => {
                if (boxHistoryDelayRender) return;
                ShellLayout.closeDrawer();
                boxHistoryDelayRender = 1000;
                setTimeout(() => (boxHistoryDelayRender = 0));
                if (!s(`.${searchBoxHistoryId}`)) {
                  const { barConfig } = await Themes[Css.currentTheme]();
                  barConfig.buttons.maximize.disabled = true;
                  barConfig.buttons.minimize.disabled = true;
                  barConfig.buttons.restore.disabled = true;
                  barConfig.buttons.menu.disabled = true;
                  barConfig.buttons.close.disabled = false;

                  await Modal.instance({
                    id: searchBoxHistoryId,
                    barConfig,
                    title: html`<div
                      style="display: flex; align-items: center; justify-content: space-between; width: 100%;"
                    >
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="search-box-recent-title">
                          ${renderViewTitle({
                            icon: html`<i class="fas fa-history mini-title"></i>`,
                            text: Translate.instance('recent'),
                          })}
                        </div>
                        <div class="search-box-result-title hide">
                          ${renderViewTitle({
                            icon: html`<i class="far fa-list-alt mini-title"></i>`,
                            text: Translate.instance('results'),
                          })}
                        </div>
                      </div>
                    </div>`,
                    html: () => html``,
                    titleClass: 'mini-title',
                    style: {
                      resize: 'none',
                      'max-width': '450px',
                      height:
                        this.mobileModal() && windowGetW() < 445
                          ? `${windowGetH() - SHELL_BAR_SIZE}px !important`
                          : '300px !important',
                      'z-index': 9,
                    },
                    class: 'search-history-modal',
                    dragDisabled: true,
                    maximize: true,
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

                  // Add styles for inline button layout in the search history modal bar
                  const styleId = 'search-history-modal-bar-styles';
                  if (!s(`#${styleId}`)) {
                    const styleTag = document.createElement('style');
                    styleTag.id = styleId;
                    styleTag.textContent = `
                      .search-history-modal .btn-bar-modal-container .bar-default-modal {
                        display: flex;
                        flex-direction: row-reverse;
                        align-items: center;
                      }
                      .search-history-modal .btn-bar-modal-container .btn-modal-default {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        float: none;
                      }
                      .search-history-modal .html-${searchBoxHistoryId} {
                        overflow-x: hidden;
                        box-sizing: border-box;
                      }
                      .search-history-modal .html-${searchBoxHistoryId} .search-result-item,
                      .search-history-modal .html-${searchBoxHistoryId} .search-result-history-item {
                        box-sizing: border-box;
                        max-width: 100%;
                      }
                    `;
                    document.head.appendChild(styleTag);
                  }

                  // Add clear all button to the bar area, before the close button
                  const clearAllBtnHtml = await BtnIcon.instance({
                    class: `btn-search-history-clear-all btn-modal-default btn-modal-default-${searchBoxHistoryId}`,
                    label: html`<i class="fas fa-trash-alt"></i>`,
                    attrs: `title="Clear all recent items"`,
                    style: 'padding: 4px 8px; font-size: 12px; display: none;',
                  });

                  // Insert before close button in the bar (with flex row-reverse, inserting after close button places our button to its left visually)
                  const closeBtn = s(`.btn-close-${searchBoxHistoryId}`);
                  if (closeBtn) {
                    closeBtn.insertAdjacentHTML('afterend', clearAllBtnHtml);
                  }

                  // Add click handler for clear all history button
                  const clearAllBtn = s(`.btn-search-history-clear-all`);
                  if (clearAllBtn) {
                    clearAllBtn.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Clear all history from persistent storage
                      SearchBox.RecentResults.clear();
                      // Re-render to show empty history (with isRecentHistory true to hide button)
                      renderSearchResult([], true);
                    };
                  }

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
                    const allItems = sa(`.html-${searchBoxHistoryId} .search-result-item`);
                    if (!allItems || allItems.length === 0) return;

                    // Remove active class from current
                    if (allItems[currentKeyBoardSearchBoxIndex]) {
                      allItems[currentKeyBoardSearchBoxIndex].classList.remove('active-search-result');
                    }

                    // Navigate up
                    if (currentKeyBoardSearchBoxIndex > 0) {
                      currentKeyBoardSearchBoxIndex--;
                    } else {
                      currentKeyBoardSearchBoxIndex = allItems.length - 1;
                    }

                    // Add active class to new and ensure visibility
                    if (allItems[currentKeyBoardSearchBoxIndex]) {
                      allItems[currentKeyBoardSearchBoxIndex].classList.add('active-search-result');
                      // Use optimized scroll method to ensure item is always visible
                      const container = s(`.html-${searchBoxHistoryId}`);
                      if (container) {
                        SearchBox.scrollIntoViewIfNeeded(allItems[currentKeyBoardSearchBoxIndex], container);
                      }
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
                    const allItems = sa(`.html-${searchBoxHistoryId} .search-result-item`);
                    if (!allItems || allItems.length === 0) return;

                    // Remove active class from current
                    if (allItems[currentKeyBoardSearchBoxIndex]) {
                      allItems[currentKeyBoardSearchBoxIndex].classList.remove('active-search-result');
                    }

                    // Navigate down
                    if (currentKeyBoardSearchBoxIndex < allItems.length - 1) {
                      currentKeyBoardSearchBoxIndex++;
                    } else {
                      currentKeyBoardSearchBoxIndex = 0;
                    }

                    // Add active class to new and ensure visibility
                    if (allItems[currentKeyBoardSearchBoxIndex]) {
                      allItems[currentKeyBoardSearchBoxIndex].classList.add('active-search-result');
                      // Use optimized scroll method to ensure item is always visible
                      const container = s(`.html-${searchBoxHistoryId}`);
                      if (container) {
                        SearchBox.scrollIntoViewIfNeeded(allItems[currentKeyBoardSearchBoxIndex], container);
                      }
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
              {
                const { barConfig } = await Themes[Css.currentTheme]();
                barConfig.buttons.maximize.disabled = true;
                barConfig.buttons.minimize.disabled = true;
                barConfig.buttons.restore.disabled = true;
                barConfig.buttons.menu.disabled = true;
                barConfig.buttons.close.disabled = true;
                await Modal.instance({
                  id: 'main-body',
                  barConfig,
                  html: options.htmlMainBody ? options.htmlMainBody : () => html``,
                  titleClass: 'hide',
                  style: {
                    background: 'none',
                    resize: 'none',
                    'min-width': `${minWidth}px`,
                    width: '100%',
                  },
                  dragDisabled: true,
                  maximize: true,
                  slideMenu: 'modal-menu',
                  observer: true,
                  disableBoxShadow: true,
                });
                Keyboard.instanceMultiPressKey({
                  id: 'input-search-shortcut-k',
                  keys: [
                    ['Shift', 'k'],
                    ['Alt', 'k'],
                  ],
                  eventCallBack: () => {
                    if (!isTextInputFocused()) ShellLayout.focusSearch();
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
                if (!this.Data[idModal].homeModals.includes(id)) this.Data[idModal].homeModals.push(id);
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
                  <div class="fl ${options.barClass ? options.barClass : ''}" style="height: ${SHELL_BAR_SIZE}px;">
                    ${ShellLayout.renderSlot('footer')}
                    ${await BtnIcon.instance({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-lang ${
                        options?.disableTools?.includes('lang') ? 'hide' : ''
                      }`,
                      label: html` <div class="${contentIconClass} action-btn-lang-render"></div>`,
                    })}
                    ${await BtnIcon.instance({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-theme ${
                        options?.disableTools?.includes('theme') ? 'hide' : ''
                      }`,
                      label: html` <div class="${contentIconClass} action-btn-theme-render"></div>`,
                    })}
                    ${await BtnIcon.instance({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-home ${
                        options?.disableTools?.includes('navigator') ? 'hide' : ''
                      }`,
                      label: html` <div class="${contentIconClass}"><i class="fas fa-home"></i></div>`,
                    })}
                    ${await BtnIcon.instance({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-right ${
                        options?.disableTools?.includes('navigator') ? 'hide' : ''
                      }`,
                      label: html` <div class="${contentIconClass}"><i class="fas fa-chevron-right"></i></div>`,
                    })}
                    ${await BtnIcon.instance({
                      style: `height: 100%`,
                      class: `in flr main-btn-menu action-bar-box action-btn-left ${
                        options?.disableTools?.includes('navigator') ? 'hide' : ''
                      }`,
                      label: html`<div class="${contentIconClass}"><i class="fas fa-chevron-left"></i></div>`,
                    })}
                  </div>
                `;
                if (footerHeight === 0) {
                  append(`.slide-menu-top-bar`, html` <div class="in ${id}">${await html()}</div>`);
                } else {
                  await Modal.instance({
                    id,
                    barConfig,
                    html,
                    titleClass: 'hide',
                    style: {
                      resize: 'none',
                      'min-width': `${minWidth}px`,
                      'z-index': 7,
                    },
                    dragDisabled: true,
                    disableCenter: true,
                  });
                }
                ShellLayout.bind();
                EventsUI.onClick(`.action-btn-left`, (e) => {
                  e.preventDefault();
                  window.history.back();
                });
                EventsUI.onClick(`.action-btn-right`, (e) => {
                  e.preventDefault();
                  window.history.forward();
                });
                EventsUI.onClick(`.action-btn-home`, async () => {
                  await Modal.onHomeRouterEvent();
                  subMenuHandler(Object.keys(options.RouterInstance.Routes()));
                  Object.keys(this.Data[idModal].onHome).map((keyListener) => this.Data[idModal].onHome[keyListener]());
                  s(`.main-body`)?.scrollTo({ top: 0, behavior: 'smooth' });
                });
                EventsUI.onClick(`.action-btn-app-icon`, () => s(`.action-btn-home`).click());
                Keyboard.instanceMultiPressKey({
                  id: 'input-shortcut-global-escape',
                  keys: ['Escape'],
                  eventCallBack: () => {
                    if (ShellLayout.state.drawerOpen) return ShellLayout.closeDrawer();
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
                    await Modal.instance({
                      id,
                      barConfig,
                      title: html`${renderViewTitle({
                        icon: html`<i class="fas fa-language mini-title"></i>`,
                        text: Translate.instance('select lang'),
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

              await NotificationManager.RenderBoard(options);

              const { removeEvent } = Scroll.setEvent('.main-body', async (payload) => {
                if (payload.scrollTop > 100) {
                  ShellLayout.hideChrome();
                  removeEvent();
                }
              });
              setTimeout(window.onresize);
              setRouterReady();
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
      for (const event of Object.keys(Modal.Data[idModal].onReloadModalListener))
        await Modal.Data[idModal].onReloadModalListener[event]();

      s(`.btn-maximize-${idModal}`).click();
      return;
    }

    if (idModal !== 'main-body' && options.mode !== 'view' && !options.disableCenter) Modal.Data[idModal].center();

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
        ${options.mode === 'slide-menu' ? ShellLayout.drawerAttributes : ''}
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
                ${await BtnIcon.instance({
                  class: `btn-minimize-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                    options?.btnContainerClass ? options.btnContainerClass : ''
                  } ${options?.barConfig?.buttons?.minimize?.disabled ? 'hide' : ''}`,
                  label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                    ${options?.barConfig?.buttons?.minimize?.label ? options.barConfig.buttons.minimize.label : html`_`}
                  </div>`,
                })}
                ${await BtnIcon.instance({
                  class: `btn-restore-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                    options?.btnContainerClass ? options.btnContainerClass : ''
                  } ${options?.barConfig?.buttons?.restore?.disabled ? 'hide' : ''}`,
                  label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                    ${options?.barConfig?.buttons?.restore?.label ? options.barConfig.buttons.restore.label : html`□`}
                  </div>`,
                  style: 'display: none',
                })}
                ${await BtnIcon.instance({
                  class: `btn-maximize-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                    options?.btnContainerClass ? options.btnContainerClass : ''
                  } ${options?.barConfig?.buttons?.maximize?.disabled ? 'hide' : ''}`,
                  label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                    ${options?.barConfig?.buttons?.maximize?.label ? options.barConfig.buttons.maximize.label : html`▢`}
                  </div>`,
                })}
                ${await BtnIcon.instance({
                  class: `btn-close-${idModal} btn-modal-default btn-modal-default-${idModal} ${
                    options?.btnContainerClass ? options.btnContainerClass : ''
                  } ${options?.barConfig?.buttons?.close?.disabled ? 'hide' : ''}`,
                  label: html`<div class="${options?.btnIconContainerClass ? options.btnIconContainerClass : ''}">
                    ${options?.barConfig?.buttons?.close?.label ? options.barConfig.buttons.close.label : html`X`}
                  </div>`,
                })}
                ${await BtnIcon.instance({
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
              class="inl title-modal-${idModal} ${options && options.titleClass
                ? options.titleClass
                : 'title-main-modal'}"
            >
              ${options && options.titleRender ? options.titleRender() : options.title ? options.title : ''}
            </div>
          </div>

          <div class="in html-modal html-${idModal}">
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
    if (options.mode === 'slide-menu') s(`.main-btn-home`).onclick = () => s(`.action-btn-home`).click();

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

      // A dragged modal moves inside the page; a maximized view keeps the fixed bounds
      // `ShellLayout.fill` gives it, so its position is left alone.
      if (
        !(options.slideMenu && Modal.isMaximized(idModal)) &&
        window.getComputedStyle(modal).position !== 'absolute'
      ) {
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

      ShellLayout.release(modal);

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

      ShellLayout.release(modal);

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

      // Restore original dimensions and position: a floating modal lives in the page again.
      this.Data[idModal].center();
      modal.style.position = 'absolute';
      modal.style.transform = '';
      modal.style.height = `${height}px`;
      modal.style.left = left;
      modal.style.top = top;
      modal.style.width = `${width}px`;
      modal.style.overflow = '';

      // Re-enable drag after restore
      if (dragInstance) {
        dragInstance.updateOptions({
          position: { x: 0, y: 0 },
          disabled: false, // Ensure drag is enabled after restore
        });
      }
      setTimeout(() => (s(`.${idModal}`) ? (s(`.${idModal}`).style.transition = transition) : null), 300);
    };
    // Animated from wherever the modal is when a click maximizes it; placed outright when it is
    // the modal's own `maximize` option at creation, so a view does not slide in from the corner
    // it was appended at.
    const maximize = ({ animate = true } = {}) => {
      const modal = s(`.${idModal}`);
      if (!modal) return;

      // Disable drag when maximizing
      if (dragInstance) {
        dragInstance.updateOptions({ disabled: true });
      }

      modal.style.transition = animate ? '0.3s' : 'none';
      setTimeout(() => (modal ? (modal.style.transition = transition) : null), animate ? 300 : 0);

      s(`.btn-maximize-${idModal}`).style.display = 'none';
      s(`.btn-restore-${idModal}`).style.display = null;
      s(`.btn-minimize-${idModal}`).style.display = null;
      modal.style.transform = null;

      if (options.slideMenu) ShellLayout.fill(modal);
      else {
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.top = 'var(--shell-body-top, 0px)';
        modal.style.left = '0px';
      }
      dragInstance = setDragInstance();
    };
    s(`.btn-maximize-${idModal}`).onclick = () => maximize();

    const btnMenuEvent = () => {
      Object.keys(this.Data[idModal].onMenuListener).map((keyListener) =>
        this.Data[idModal].onMenuListener[keyListener](),
      );
      if (options && 'barConfig' in options && options.barConfig.buttons.menu.onClick)
        options.barConfig.buttons.menu.onClick();
    };
    s(`.btn-menu-${idModal}`).onclick = btnMenuEvent;

    dragInstance = setDragInstance();
    if (options && options.maximize) maximize({ animate: false });
    if (options.observer) {
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
  }

  /** @type {Object.<string, object>} */
  static subMenuBtnClass = {};

  /**
   * Navigate to the home route and close all non-home modals.
   * @param {{ keepPath?: boolean }} [options] - `keepPath` leaves the current path and title in place.
   */
  static onHomeRouterEvent = async ({ keepPath = false } = {}) => {
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

    // 2. Navigate to home first, creating a new history entry — unless the home view is rendering a
    // public route of its own (`/entry/:stableSlug`), whose path must stay. Either way the home view
    // records what it presents, so closing a view stacked on it comes back here.
    if (!keepPath) {
      setPath(`${getProxyPath()}${location.search ?? ''}${location.hash ?? ''}`);
      setDocTitle();
    }
    if (Modal.Data['main-body']) Modal.Data['main-body'].path = keepPath ? location.pathname : undefined;

    // 3. Close the modals without them affecting the URL.
    for (const id of modalsToClose) {
      Modal.removeModal(id);
    }

    ShellLayout.closeDrawer();
  };

  /** @type {string} */
  static currentTopModalId = '';

  /**
   * Synchronise z-index for view modals, promoting the given modal to top.
   * @param {{ idModal: string }} param0
   */
  static zIndexSync({ idModal }) {
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
          if (this.Data[idModal].options.route) {
            setPath(`${getViewPath(idModal)}${location.search ?? ''}${location.hash ?? ''}`);
            setDocTitle(this.Data[idModal].options.route);
          }
          cleanTopModal();
          setTopModal();
        }
      };
    });
  }

  /**
   * Puts a modal on top, and records when, so the stack order of the open views is known.
   * @param {string} idModal
   */
  static setTopModalCallback(idModal) {
    s(`.${idModal}`).style.zIndex = '4';
    this.currentTopModalId = `${idModal}`;
    if (this.Data[idModal]) this.Data[idModal].raisedAt = performance.now();
  }

  /** @returns {boolean} True when the viewport is considered mobile-sized. */
  static mobileModal = () => windowGetW() < 600 || windowGetH() < 600;

  /**
   * @param {{ idModal: string, html: string }} param0
   */
  static writeHTML = ({ idModal, html }) => htmls(`.html-${idModal}`, html);

  /**
   * Update an existing modal's content and/or title.
   * @param {{ idModal: string, html?: string, title?: string }} param0
   * @returns {Promise<boolean>}
   */
  static async updateModal({ idModal, html, title }) {
    if (!this.Data[idModal] || !s(`.${idModal}`)) {
      console.warn(`Modal ${idModal} not found for update`);
      return false;
    }

    // Update modal content
    if (html) {
      this.writeHTML({ idModal, html });
    }

    // Update modal title if provided
    if (title) {
      const titleElement = s(`.${idModal} .modal-title`);
      if (titleElement) {
        titleElement.innerHTML = title;
      }
    }

    // Trigger reload listeners
    if (this.Data[idModal].onReloadModalListener) {
      for (const event of Object.keys(this.Data[idModal].onReloadModalListener)) {
        await this.Data[idModal].onReloadModalListener[event]();
      }
    }

    return true;
  }

  /** @returns {string|undefined} Id of the first open view-mode modal, or undefined. */
  static viewModalOpen() {
    return Object.keys(this.Data).find((idModal) => s(`.${idModal}`) && this.Data[idModal].options.mode === 'view');
  }

  /**
   * Remove a modal element and its style tags, and delete its data entry.
   * @param {string} idModal
   */
  static removeModal(idModal) {
    if (!s(`.${idModal}`)) return;
    s(`.${idModal}`).remove();
    sa(`.style-${idModal}`).forEach((element) => {
      element.remove();
    });
    delete this.Data[idModal];
  }

  /** Answers of the confirmation dialogs still open, by dialog id. */
  static confirmAnswers = {};

  /**
   * Render a confirmation dialog and return a promise resolving to the user's choice. One dialog
   * per id: a call for an id whose dialog is open waits for the same answer. The body scrolls inside
   * the viewport and the buttons stay in view. `confirmLabel` names the action; `danger` marks it
   * destructive and gives the focus to Cancel.
   * @param {{ id: string, html: Function, icon?: string, confirmLabel?: string, danger?: boolean, disableBtnCancel?: boolean }} options
   * @returns {Promise<{ status: 'confirm'|'cancelled' }>}
   */
  static RenderConfirm(options) {
    const { id } = options;
    Modal.confirmAnswers[id] ??= Modal.openConfirm(options).finally(() => delete Modal.confirmAnswers[id]);
    return Modal.confirmAnswers[id];
  }

  /** Opens the dialog of {@link Modal.RenderConfirm}. */
  static async openConfirm(options) {
    const { id } = options;
    // In: the backdrop fades up under a dialog that rises and scales into place. Out: the dialog
    // sinks and fades while the backdrop fades, and both leave the DOM — and the promise settles
    // — only once that is over, so an answer never cuts straight to the page behind. The style
    // tag shares the modal's `style-${id}` class so `removeModal` clears it with the rest.
    const enterMs = 220;
    const exitMs = 160;
    append(
      'body',
      html`
        <style class="style-${id}">
          .confirm-modal-in-${id} {
            animation: confirm-modal-in ${enterMs}ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          }
          .confirm-modal-out-${id} {
            animation: confirm-modal-out ${exitMs}ms ease-in both;
            pointer-events: none;
          }
          @keyframes confirm-modal-in {
            from {
              opacity: 0;
              transform: translateY(14px) scale(0.94);
            }
            to {
              opacity: 1;
              transform: none;
            }
          }
          @keyframes confirm-modal-out {
            from {
              opacity: 1;
              transform: none;
            }
            to {
              opacity: 0;
              transform: translateY(8px) scale(0.96);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .confirm-modal-in-${id},
            .confirm-modal-out-${id} {
              animation-duration: 1ms;
            }
            .background-confirm-modal-${id} {
              transition-duration: 1ms !important;
            }
          }
          .modal-html-${id},
          .html-${id} {
            display: flex;
            flex-direction: column;
            min-height: 0;
          }
          .modal-html-${id} {
            height: 100%;
          }
          .html-${id} {
            flex: 1 1 auto;
          }
          .confirm-modal-body-${id} {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            overscroll-behavior: contain;
          }
          .confirm-modal-actions-${id} {
            flex: none;
            padding-bottom: 6px;
          }
          .confirm-modal-actions-${id} .form-button {
            width: calc(100% - 16px);
            max-width: 278px;
          }
          .btn-confirm-${id}.confirm-modal-danger {
            color: var(--studio-accent-warm, #ff6b5a);
            border: 2px solid currentColor;
            font-weight: bold;
          }
        </style>
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
              transition: `opacity ${enterMs}ms ease`,
              opacity: '0',
            },
          })}"
        ></div>
      `,
    );
    requestAnimationFrame(() => {
      if (s(`.background-confirm-modal-${id}`)) s(`.background-confirm-modal-${id}`).style.opacity = '1';
    });

    return new Promise(async (resolve, reject) => {
      const { barConfig } = await Themes[Css.currentTheme]();
      barConfig.buttons.maximize.disabled = true;
      barConfig.buttons.minimize.disabled = true;
      barConfig.buttons.restore.disabled = true;
      barConfig.buttons.menu.disabled = true;
      barConfig.buttons.close.disabled = false;
      const htmlRender = html`
        <div class="confirm-modal-body-${id}">
          <div class="in section-mp" style="font-size: 40px; text-align: center">
            ${options.icon ? options.icon : html` <i class="fas fa-question-circle"></i>`}
          </div>
          ${await options.html()}
        </div>
        <div class="confirm-modal-actions-${id}">
          <div class="in section-mp">
            ${await BtnIcon.instance({
              class: `in section-mp form-button btn-confirm-${id} ${options.danger ? 'confirm-modal-danger' : ''}`,
              label: options.confirmLabel ?? Translate.instance('confirm'),
              type: 'submit',
              style: `margin: auto`,
            })}
          </div>
          <div class="in section-mp ${options.disableBtnCancel ? 'hide' : ''}">
            ${await BtnIcon.instance({
              class: `in section-mp form-button btn-cancel-${id}`,
              label: Translate.instance('cancel'),
              type: 'submit',
              style: `margin: auto`,
            })}
          </div>
        </div>
      `;
      await Modal.instance({
        id,
        barConfig,
        titleClass: 'hide',
        style: {
          width: 'min(300px, calc(100vw - 16px))',
          height: 'min(400px, calc(100vh - 16px))',
          top: 'max(8px, calc(50vh - 200px))',
          left: 'calc(50vw - min(150px, 50vw - 8px))',
          overflow: 'hidden',
          'z-index': '11',
          resize: 'none',
        },
        dragDisabled: true,
        ...options,
        html: htmlRender,
      });
      // The animation outranks the inline opacity `Modal.instance` fades with, so the dialog
      // follows this curve alone; the class comes off afterwards so it holds no transform.
      const dialog = s(`.${id}`);
      if (dialog) {
        dialog.classList.add(`confirm-modal-in-${id}`);
        dialog.addEventListener(
          'animationend',
          (e) => e.target === dialog && dialog.classList.remove(`confirm-modal-in-${id}`),
          { once: true },
        );
      }

      // Only the first answer counts: a second click while the dialog is leaving is ignored.
      let closing = false;
      const end = (status) => {
        if (closing) return;
        closing = true;
        const background = s(`.background-confirm-modal-${id}`);
        if (background) {
          background.style.pointerEvents = 'none';
          background.style.transition = `opacity ${exitMs}ms ease`;
          background.style.opacity = '0';
        }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (background) background.remove();
          Modal.removeModal(id);
          resolve({ status });
        };
        const modal = s(`.${id}`);
        if (!modal) return finish();
        modal.classList.remove(`confirm-modal-in-${id}`);
        modal.classList.add(`confirm-modal-out-${id}`);
        modal.addEventListener('animationend', (e) => e.target === modal && finish());
        // Should the animation never report back (element detached, animations disabled).
        setTimeout(finish, exitMs + 50);
      };
      barConfig.buttons.close.onClick = () => end('cancelled');
      s(`.background-confirm-modal-${id}`).onclick = () => end('cancelled');
      s(`.btn-cancel-${id}`).onclick = () => end('cancelled');
      s(`.btn-confirm-${id}`).onclick = () => end('confirm');
      if (options.danger) s(`.btn-cancel-${id}`).focus();
    });
  }

  /** @type {string} */
  static labelSelectorTopOffsetStartAnimation = `-40px`;

  /** @type {string} */
  static labelSelectorTopOffsetEndAnimation = `-3px`;

  /**
   * Animate the drawer labels into view.
   * @param {string} [subMenuId] - If provided, animate only this sub-menu.
   */
  static menuTextLabelAnimation = (subMenuId) => {
    const btnSelector = `.main-btn-menu`;
    const labelSelector = `.menu-label-text`;

    const _data = subMenuId
      ? {
          [subMenuId]: Modal.subMenuBtnClass[subMenuId],
        }
      : { ...Modal.subMenuBtnClass, _: { btnSelector, labelSelector } };

    for (const keyDataBtn of Object.keys(_data)) {
      const { labelSelector, top } = _data[keyDataBtn];
      if (top)
        setTimeout(() => {
          top();
        });
      sa(labelSelector).forEach((el) => {
        if (!el.classList.contains('hide')) el.classList.add('hide');
        el.style.transition = null;
      });

      setTimeout(() => {
        sa(labelSelector).forEach((el) => {
          el.classList.remove('hide');
          el.style.transition = null;
        });
        sa(labelSelector).forEach((el) => {
          el.style.top = Modal.labelSelectorTopOffsetStartAnimation;
        });
      }, 300);
      setTimeout(() => {
        sa(labelSelector).forEach((el) => {
          el.style.top = Modal.labelSelectorTopOffsetEndAnimation;
        });
      }, 400);
    }
  };

  /**
   * Builds submenu item HTML using the canonical BtnIcon pattern.
   * Centralises the item-rendering contract so individual submenu owners (e.g. Docs)
   * only need to supply data — not layout concerns.
   * @param {string} subMenuId - Submenu identifier (e.g. 'docs')
   * @param {Array<{type:string, icon:string, text:string, url:function|string}>} items
   * @param {Object} [options]
   * @param {function} [options.subMenuIcon] - Optional icon override per item type
   * @returns {Promise<string>} Rendered HTML string
   */
  static buildSubMenuItemsHtml = async (subMenuId, items = [], options = {}) => {
    let result = '';
    for (const item of items) {
      const tabHref = typeof item.url === 'function' ? item.url() : item.url || '';
      const icon =
        options.subMenuIcon && typeof options.subMenuIcon === 'function' ? options.subMenuIcon(item.type) : item.icon;
      result += html`${await BtnIcon.instance({
        class: `in wfa main-btn-menu submenu-btn btn-${subMenuId} btn-${subMenuId}-${item.type}`,
        label: html`<span class="inl menu-btn-icon">${icon}</span
          ><span class="menu-label-text menu-label-text-${subMenuId}"> ${item.text} </span>`,
        tabHref,
        useMenuBtn: true,
      })} `;
    }
    return result;
  };

  /**
   * Injects pre-built submenu item HTML into the submenu container.
   * Does nothing when the shell renders no container for `subMenuId`.
   * @param {string} subMenuId
   * @param {string} itemsHtml
   */
  static subMenuPopulate = (subMenuId, itemsHtml) => {
    // A shell can own a view without owning a submenu for it; then there is nothing to populate.
    if (!s(`.menu-btn-container-children-${subMenuId}`)) return;
    htmls(`.menu-btn-container-children-${subMenuId}`, itemsHtml);
    if (isSubMenuOpen(subMenuId)) layoutSubMenus();
  };

  /**
   * The landing of a submenu's own view: one card per entry it offers. A card opens what its
   * submenu button `.btn-<subMenuId>-<id>` opens, or runs its `open` when the shell renders no button.
   * @param {object} params
   * @param {string} params.subMenuId - The submenu, e.g. `docs`.
   * @param {string} params.title - The landing heading.
   * @param {Array<{id: string, icon: string, title: string, description: string, open?: Function}>} params.cards
   * @returns {string} The landing HTML.
   */
  static renderSubMenuLanding = ({ subMenuId, title, cards }) => {
    setTimeout(() => {
      for (const { id, open } of cards) {
        const cardEl = s(`.submenu-landing-card-container-${subMenuId}-${id}`);
        if (!cardEl) continue;
        const openCard = () => (s(`.btn-${subMenuId}-${id}`) ? s(`.btn-${subMenuId}-${id}`).click() : open?.());
        cardEl.onclick = openCard;
        // The card is a div, so the keyboard affordances a button would carry are declared here.
        cardEl.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          openCard();
        };
      }
    });
    return html`
      <style>
        /* The landing owns its entrance: a shell without this keyframe would leave every card
           at its starting opacity, and the view would look empty. */
        @keyframes submenu-landing-fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .submenu-landing {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .submenu-landing-header {
          text-align: center;
          margin-bottom: 3rem;
          opacity: 0;
          animation: submenu-landing-fade-in-up 0.6s ease-out forwards;
        }
        .submenu-landing-header h1 {
          font-size: 2.5rem;
          margin: 0 0 1rem;
          line-height: 1.2;
        }
        .submenu-landing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
          gap: 1.5rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .submenu-landing-card-container {
          cursor: pointer;
          opacity: 0;
          animation: submenu-landing-fade-in-up 0.6s ease-out forwards;
          border-radius: 8px;
        }
        .submenu-landing-card-container:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 3px;
        }
        .submenu-landing-card {
          border-radius: 8px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          height: 100%;
          box-sizing: border-box;
          transition:
            transform 0.25s ease,
            background 0.25s ease,
            border-color 0.25s ease;
        }
        .submenu-landing-card-container:hover .submenu-landing-card,
        .submenu-landing-card-container:focus-visible .submenu-landing-card {
          transform: translateY(-4px);
        }
        .card-icon {
          font-size: 1.75rem;
          width: 56px;
          height: 56px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 0 1.25rem;
          transition: transform 0.25s ease;
        }
        /* A menu-sized image grows to the card; the menu offset it carries does not apply here. */
        .card-icon img {
          position: static;
          width: 40px;
          height: 40px;
        }
        .submenu-landing-card-container:hover .card-icon {
          transform: scale(1.08);
        }
        .card-content {
          flex: 1;
        }
        .card-content h3 {
          margin: 0 0 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
        }
        .card-content p {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.5;
          opacity: 0.85;
        }
        @media (prefers-reduced-motion: reduce) {
          .submenu-landing-header,
          .submenu-landing-card-container {
            animation: none;
            opacity: 1;
          }
          .submenu-landing-card,
          .card-icon {
            transition: none;
          }
          .submenu-landing-card-container:hover .submenu-landing-card,
          .submenu-landing-card-container:hover .card-icon {
            transform: none;
          }
        }
        ${cards
          .map(
            (_, index) => css`
              .submenu-landing-card-container:nth-child(${index + 1}) {
                animation-delay: ${0.1 * (index + 1)}s;
              }
            `,
          )
          .join('')}
      </style>

      <div class="submenu-landing">
        <div class="submenu-landing-header">
          <h1>${title}</h1>
        </div>

        <ul class="submenu-landing-grid">
          ${cards
            .map(
              ({ id, icon, title: cardTitle, description }) => html`
                <div
                  class="in submenu-landing-card-container submenu-landing-card-container-${subMenuId}-${id}"
                  role="link"
                  tabindex="0"
                  aria-label="${htmlStrSanitize(cardTitle)}: ${description}"
                >
                  <li class="submenu-landing-card box-content-border hover">
                    <div class="card-icon" aria-hidden="true">${icon}</div>
                    <div class="card-content">
                      <h3>${cardTitle}</h3>
                      <p>${description}</p>
                    </div>
                  </li>
                </div>
              `,
            )
            .join('')}
        </ul>
      </div>
    `;
  };

  // Move modal title element into the bar's render container so it aligns with control buttons
  /**
   * Position a modal relative to an anchor element.
   * @param {object} options - Positioning options
   * @param {string} options.modalSelector - CSS selector for the modal element
   * @param {string} options.anchorSelector - CSS selector for the anchor element
   * @param {object} [options.offset={x: 0, y: 6}] - Offset from anchor
   * @param {string} [options.align='right'] - Horizontal alignment ('left' or 'right')
   * @param {boolean} [options.autoVertical=true] - Whether to automatically determine vertical position
   * @param {boolean} [options.placeAbove] - Force position above/below anchor (overrides autoVertical)
   */
  static positionRelativeToAnchor({
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
      const vh = windowGetH();
      const vw = windowGetW();
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
  }

  /**
   * Move the title element inside the bar button container for inline alignment.
   * @param {string} idModal
   */
  static MoveTitleToBar(idModal) {
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
  }

  /** Update the top-banner anchor href and bind the home-click handler. */
  static setTopBannerLink() {
    if (s(`.a-link-top-banner`)) {
      s(`.a-link-top-banner`).setAttribute('href', `${location.origin}${getProxyPath()}`);
      EventsUI.onClick(`.a-link-top-banner`, (e) => {
        e.preventDefault();
        s(`.action-btn-home`).click();
      });
    }
  }

  /** @type {number} */
  static headerTitleHeight = 40;

  /** A modal is maximized while its restore button offers the way back. */
  static isMaximized(idModal) {
    const restoreEl = s(`.btn-restore-${idModal}`);
    return !!restoreEl && restoreEl.style.display !== 'none';
  }

  /** Add missing `alt` attributes to all images for SEO/accessibility. */
  static RenderSeoSanitizer = async () => {
    sa('img').forEach((img) => {
      if (!img.getAttribute('alt')) img.setAttribute('alt', 'image ' + Worker.title + ' ' + s4());
    });
  };
}

const renderMenuLabel = ({ img, src, text, icon }) => {
  if (!img && !src) return html`<span class="inl menu-btn-icon">${icon}</span> ${text}`;
  const imgSrc = src ? src : `${getProxyPath()}assets/ui-icons/${img}`;
  return html`<img class="abs center img-btn-square-menu" src="${imgSrc}" />
    <div class="abs center main-btn-menu-text">${text}</div>`;
};

const renderViewTitle = (
  options = {
    icon: '',
    img: '',
    text: '',
    assetFolder: '',
    'ui-icon': '',
    imgClass: '',
    textClass: '',
    dim,
    top,
    topText: '',
  },
) => {
  if (options.dim === undefined) options.dim = 30;
  const { img, text, icon, dim, top } = options;
  if (!img && !options['ui-icon']) return html`<span class="view-title-icon">${icon}</span> ${text}`;
  const imgClass = options.imgClass || 'abs img-btn-square-view-title';
  const textClass = options.textClass || 'in text-btn-square-view-title';
  return html`<img
      class="${imgClass}"
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
      class="${textClass}"
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

/** Whether a submenu is open: the state `subMenuRender` keeps, whatever its caret shows mid-turn. */
const isSubMenuOpen = (subMenuId) => !!Modal.subMenuBtnClass[subMenuId]?.open;

const SUBMENU_ITEM_HEIGHT = 51;

/** The entries a submenu shows: its buttons that are not hidden. */
const subMenuItemCount = (subMenuId) =>
  [...sa(`.btn-${subMenuId}`)].filter((item) => !item.classList.contains('hide')).length;

/** Fits every open submenu to what it shows and to where its button is: height, room under the button and top. */
const fitSubMenus = () => {
  for (const [subMenuId, { open, top }] of Object.entries(Modal.subMenuBtnClass)) {
    if (!open) continue;
    const height = SUBMENU_ITEM_HEIGHT * subMenuItemCount(subMenuId);
    s(`.menu-btn-container-children-${subMenuId}`).style.height = `${height}px`;
    s(`.main-btn-${subMenuId}`).style.marginBottom = `${height + 4}px`;
    top();
  }
};

/** Fits every open submenu frame by frame while the menu settles, so no submenu leaves another behind. */
const layoutSubMenus = () => {
  const settled = performance.now() + 450;
  const follow = () => {
    fitSubMenus();
    if (performance.now() < settled) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
};

const subMenuRender = async (subMenuId, forceOpen) => {
  const menuBtn = s(`.main-btn-${subMenuId}`);
  const menuContainer = s(`.menu-btn-container-children-${subMenuId}`);
  const arrow = s(`.down-arrow-submenu-${subMenuId}`);

  if (!menuBtn || !menuContainer || !arrow) return;

  const top = () => (menuContainer.style.top = `${menuBtn.offsetTop + menuBtn.offsetHeight}px`);

  const shouldOpen = forceOpen ?? !isSubMenuOpen(subMenuId);
  Modal.subMenuBtnClass[subMenuId] = {
    ...Modal.subMenuBtnClass[subMenuId],
    btnSelector: `.btn-${subMenuId}`,
    labelSelector: `.menu-label-text-${subMenuId}`,
    top,
    open: shouldOpen,
  };

  menuBtn.style.transition = '.3s';
  arrow.style.transition = '.3s';

  if (!shouldOpen) {
    // Close animation
    menuContainer.style.overflow = 'hidden';
    menuContainer.style.height = '0px';
    arrow.style.rotate = '180deg';
    setTimeout(() => {
      menuBtn.style.marginBottom = '0px';
      arrow.style.rotate = '0deg';
    });
  } else {
    sa(`.menu-label-text-${subMenuId}`).forEach((el) => {
      if (!el.classList.contains('hide')) el.classList.add('hide');
    });
    setTimeout(() => {
      Modal.menuTextLabelAnimation(subMenuId);
    });
    menuContainer.style.width = '100%';
    menuContainer.style.overflow = null;
    arrow.style.rotate = '0deg';
    setTimeout(() => {
      arrow.style.rotate = '180deg';
    });
  }
  layoutSubMenus();

  // The button stops moving here, so this pass fits a page that painted few frames meanwhile.
  setTimeout(() => {
    menuBtn.style.transition = null;
    fitSubMenus();
  }, 500);
};

const sortableSubMenuEvents = (subMenuIds) => {
  let openSubMenuIds = [];

  return {
    onStart: () => {
      openSubMenuIds = subMenuIds.filter(isSubMenuOpen);
      for (const subMenuId of openSubMenuIds) subMenuRender(subMenuId, false);
    },
    onEnd: () => {
      for (const subMenuId of openSubMenuIds) subMenuRender(subMenuId, true);
      openSubMenuIds = [];
    },
  };
};

const subMenuHandler = (routes, route) => {
  route = sanitizeRoute(route);
  for (let _route of routes) {
    _route = sanitizeRoute(_route);
    // A submenu stays open while the route shows one of its entries.
    if (_route === route || s(`.menu-btn-container-children-${_route} .main-btn-${route}`)) continue;
    if (isSubMenuOpen(_route)) subMenuRender(_route);
  }
  setTimeout(() => {
    // A submenu marks the item its route currently shows: Docs keeps that in `?cid=<type>`.
    const selection = getQueryParams()[SUBMENU_SELECTION_QUERY_KEY];
    if (s(`.main-sub-btn-active`)) s(`.main-sub-btn-active`).classList.remove('main-sub-btn-active');
    if (selection && s(`.btn-${route}-${selection}`)) {
      s(`.btn-${route}-${selection}`).classList.add('main-sub-btn-active');
    }
  });
};

export {
  Modal,
  SUBMENU_SELECTION_QUERY_KEY,
  renderMenuLabel,
  renderViewTitle,
  subMenuRender,
  sortableSubMenuEvents,
  isSubMenuOpen,
  subMenuHandler,
};
