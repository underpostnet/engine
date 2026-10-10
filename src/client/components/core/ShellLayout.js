/**
 * The application shell layout: header, footer, navigation drawer, main body bounds and the global
 * shell controls. One state drives every geometry value, published as `--shell-*` properties.
 * @module src/client/components/core/ShellLayout.js
 * @namespace ShellLayout
 */

import { Responsive } from './Responsive.js';
import { Translate } from './Translate.js';
import { append, htmls, s, sa } from './VanillaJs.js';
import { windowGetW } from './windowGetDimensions.js';

/** Height of one bar row and size of one bar control, in px. */
const SHELL_BAR_SIZE = 50;

/** Width of the open navigation drawer, in px. The viewport width caps it. */
const SHELL_DRAWER_WIDTH = 320;

/** Duration of every shell transition, in ms. */
const SHELL_TRANSITION_MS = 300;

/** Widest search field the header gives, in px. */
const SHELL_SEARCH_MAX_WIDTH = 350;

/** Header and footer heights of each supported layout, in px. */
const ShellLayoutPresets = Object.freeze({
  standard: Object.freeze({ header: 2 * SHELL_BAR_SIZE, footer: 0 }),
  split: Object.freeze({ header: SHELL_BAR_SIZE, footer: SHELL_BAR_SIZE }),
});

const SHELL_DRAWER_SIDES = Object.freeze(['left', 'right']);

/**
 * Validates a shell configuration and applies its defaults.
 * @param {{ layout?: 'standard'|'split', side?: 'left'|'right' }} [config]
 * @returns {{ layout: 'standard'|'split', side: 'left'|'right' }}
 * @memberof ShellLayout
 */
const resolveShellConfig = ({ layout = 'split', side = 'left' } = {}) => {
  if (!Object.hasOwn(ShellLayoutPresets, layout))
    throw new Error(`Unknown shell layout "${layout}": use ${Object.keys(ShellLayoutPresets).join(' or ')}`);
  if (!SHELL_DRAWER_SIDES.includes(side))
    throw new Error(`Unknown navigation side "${side}": use ${SHELL_DRAWER_SIDES.join(' or ')}`);
  return { layout, side };
};

/**
 * The controls of each slot. The hide-bars control sits in the footer when the layout has one.
 * @param {{ layout: string, side: string }} config
 * @returns {{ start: string[], end: string[], footer: string[] }}
 * @memberof ShellLayout
 */
const shellControlSlots = ({ layout, side }) => {
  const hasFooter = ShellLayoutPresets[layout].footer > 0;
  return {
    start: side === 'left' ? ['nav'] : [],
    end: ['search', ...(hasFooter ? [] : ['chrome']), ...(side === 'right' ? ['nav'] : [])],
    footer: hasFooter ? ['chrome'] : [],
  };
};

/**
 * The geometry of a shell state, in px. The drawer overlays the body, so the drawer state never
 * moves or resizes the body.
 * @param {{ layout: string, side: string, chromeHidden: boolean, viewportWidth: number }} state
 * @memberof ShellLayout
 */
const shellGeometry = ({ layout, side, chromeHidden, viewportWidth }) => {
  const { header, footer } = ShellLayoutPresets[layout];
  const slots = shellControlSlots({ layout, side });
  return {
    headerHeight: header,
    footerHeight: footer,
    bodyTop: chromeHidden ? 0 : header,
    bodyBottom: chromeHidden ? 0 : footer,
    drawerWidth: Math.min(SHELL_DRAWER_WIDTH, viewportWidth),
    headerStart: slots.start.length * SHELL_BAR_SIZE,
    headerEnd: slots.end.length * SHELL_BAR_SIZE,
  };
};

/**
 * The next shell state. The drawer and the search need the bars, and hidden bars close the drawer.
 * @param {{ drawerOpen: boolean, chromeHidden: boolean, searchOpen: boolean }} state
 * @param {'open-drawer'|'close-drawer'|'hide-chrome'|'show-chrome'|'open-search'|'close-search'} action
 * @memberof ShellLayout
 */
const nextShellState = (state, action) => {
  switch (action) {
    case 'open-drawer':
      return { ...state, drawerOpen: true, chromeHidden: false };
    case 'close-drawer':
      return { ...state, drawerOpen: false };
    case 'hide-chrome':
      return { ...state, chromeHidden: true, drawerOpen: false };
    case 'show-chrome':
      return { ...state, chromeHidden: false };
    case 'open-search':
      return { ...state, searchOpen: true, chromeHidden: false, drawerOpen: false };
    case 'close-search':
      return { ...state, searchOpen: false };
    default:
      throw new Error(`Unknown shell action "${action}"`);
  }
};

const ShellControls = {
  nav: {
    className: 'shell-nav-toggle',
    icon: ({ drawerOpen }) => (drawerOpen ? 'fa-xmark' : 'fa-bars'),
    label: ({ drawerOpen }) => (drawerOpen ? 'close-navigation' : 'open-navigation'),
    attrs: ({ drawerOpen }) => ({ 'aria-controls': 'shell-drawer', 'aria-expanded': `${drawerOpen}` }),
    action: () => ShellLayout.toggleDrawer(),
  },
  search: {
    className: 'shell-search-toggle',
    icon: ({ searchOpen }) => (searchOpen ? 'fa-xmark' : 'fa-magnifying-glass'),
    label: ({ searchOpen }) => (searchOpen ? 'close-search' : 'search'),
    attrs: ({ searchOpen }) => ({ 'aria-controls': 'shell-search', 'aria-expanded': `${searchOpen}` }),
    action: () => (ShellLayout.state.searchOpen ? ShellLayout.closeSearch() : ShellLayout.focusSearch()),
  },
  chrome: {
    className: 'shell-chrome-toggle',
    icon: () => 'fa-caret-up',
    label: () => 'hide-bars',
    attrs: () => ({}),
    action: () => ShellLayout.hideChrome(),
  },
  restore: {
    className: 'shell-restore',
    icon: () => 'fa-caret-down',
    label: () => 'show-bars',
    attrs: () => ({}),
    action: () => ShellLayout.showChrome(),
  },
};

const renderControl = (name, position = 'in fll action-bar-box') =>
  html`<button type="button" class="${position} main-btn-menu shell-control ${ShellControls[name].className}">
    <div class="abs center"><i class="fa-solid"></i></div>
  </button>`;

const focusVisible = (selector) => [...sa(selector)].find((el) => el.getClientRects().length)?.focus();

const renderStyle = ({ side }) => css`
  .slide-menu-top-bar {
    top: 0;
    left: 0;
    width: 100%;
    height: var(--shell-header-height);
  }
  .top-bar {
    box-sizing: border-box;
    padding-left: var(--shell-header-start);
  }
  .shell-header-slot {
    top: 0;
    z-index: 2;
    height: ${SHELL_BAR_SIZE}px;
  }
  .shell-header-start {
    left: 0;
  }
  .shell-header-end {
    right: 0;
  }
  .top-box-profile-container {
    right: var(--shell-header-end);
  }
  .a-link-top-banner {
    padding-left: var(--shell-header-start);
  }
  .slide-menu-top-bar-fix {
    transition:
      transform ${SHELL_TRANSITION_MS}ms ease,
      visibility 0s linear ${SHELL_TRANSITION_MS}ms;
  }
  :root[data-shell-search='open'] .slide-menu-top-bar-fix {
    transform: translateY(-100%);
    visibility: hidden;
  }
  @media (max-width: 599.98px) {
    :root[data-shell-search='open'] .action-btn-app-icon {
      display: none;
    }
  }
  .modal.bottom-bar {
    top: auto;
    bottom: 0;
    left: 0;
    width: 100%;
    height: var(--shell-footer-height);
  }
  .slide-menu-top-bar,
  .modal.bottom-bar {
    transition: transform ${SHELL_TRANSITION_MS}ms ease !important;
  }
  :root[data-shell-chrome='hidden'] .slide-menu-top-bar {
    transform: translateY(-100%);
    pointer-events: none;
  }
  :root[data-shell-chrome='hidden'] .modal.bottom-bar {
    transform: translateY(100%);
    pointer-events: none;
    box-shadow: none;
  }
  #shell-drawer {
    top: var(--shell-body-top);
    bottom: var(--shell-body-bottom);
    height: auto;
    width: var(--shell-drawer-width);
    ${side === 'left' ? 'left: 0; right: auto;' : 'left: auto; right: 0;'}
    transform: translateX(${side === 'left' ? '-100%' : '100%'});
    transition:
      transform ${SHELL_TRANSITION_MS}ms ease,
      box-shadow ${SHELL_TRANSITION_MS}ms ease,
      top ${SHELL_TRANSITION_MS}ms ease,
      bottom ${SHELL_TRANSITION_MS}ms ease !important;
  }
  :root[data-shell-drawer='closed'] #shell-drawer {
    box-shadow: none;
  }
  :root[data-shell-drawer='open'] #shell-drawer {
    transform: none;
  }
  .shell-scrim {
    top: var(--shell-body-top);
    bottom: var(--shell-body-bottom);
    left: 0;
    width: 100%;
    z-index: 5;
    background: rgba(0, 0, 0, 0.45);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity ${SHELL_TRANSITION_MS}ms ease,
      visibility 0s linear ${SHELL_TRANSITION_MS}ms;
  }
  :root[data-shell-drawer='open'] .shell-scrim {
    opacity: 1;
    visibility: visible;
    transition: opacity ${SHELL_TRANSITION_MS}ms ease;
  }
  .shell-header-slot .shell-control,
  .bottom-bar .shell-control {
    height: 100%;
  }
  .shell-control.shell-nav-fixed,
  .shell-control.shell-restore {
    top: 0;
    z-index: 9;
    width: ${SHELL_BAR_SIZE}px;
    height: ${SHELL_BAR_SIZE}px;
    margin: 0;
  }
  .shell-control.shell-nav-fixed {
    ${side}: 0;
  }
  .shell-control.shell-restore {
    ${side}: ${SHELL_BAR_SIZE}px;
  }
  :root:not([data-shell-chrome='hidden']) .shell-nav-fixed,
  :root:not([data-shell-chrome='hidden']) .shell-restore {
    display: none;
  }
  .shell-bounded .stq.bar-default-modal {
    transition: padding-${side} ${SHELL_TRANSITION_MS}ms ease;
  }
  :root[data-shell-chrome='hidden'] .shell-bounded .stq.bar-default-modal {
    padding-${side}: ${2 * SHELL_BAR_SIZE}px;
  }
  .shell-bounded .stq.bar-default-modal > .title-main-modal {
    display: block;
    max-width: calc(100% - var(--shell-view-actions));
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  :root[data-shell-chrome='hidden'] .shell-bounded .stq.bar-default-modal > .title-main-modal {
    max-width: calc(100% - var(--shell-view-actions) - ${2 * SHELL_BAR_SIZE}px);
  }
  .shell-control:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -4px;
  }
  :root.shell-animating .shell-bounded {
    transition:
      top ${SHELL_TRANSITION_MS}ms ease,
      bottom ${SHELL_TRANSITION_MS}ms ease !important;
  }
  @media (prefers-reduced-motion: reduce) {
    :root[data-shell-chrome] .slide-menu-top-bar,
    :root[data-shell-chrome] .modal.bottom-bar,
    :root[data-shell-search] .slide-menu-top-bar-fix,
    :root[data-shell-drawer] #shell-drawer,
    :root[data-shell-drawer] .shell-scrim,
    :root.shell-animating .shell-bounded,
    :root .shell-bounded .stq.bar-default-modal {
      transition: none !important;
    }
  }
`;

class ShellLayout {
  /** @type {{ layout: 'standard'|'split', side: 'left'|'right' }} */
  static config = resolveShellConfig();

  /** @type {{ drawerOpen: boolean, chromeHidden: boolean, searchOpen: boolean }} */
  static state = { drawerOpen: false, chromeHidden: false, searchOpen: false };

  /** @type {Function|undefined} Runs each time the drawer opens. */
  static onDrawerOpen;

  static animationTimeout;

  /**
   * Starts the shell: its stylesheet, scrim, fixed controls and listeners. A new call renders none twice.
   * @param {{ layout?: string, side?: string, onDrawerOpen?: Function }} options
   * @memberof ShellLayout
   */
  static mount({ onDrawerOpen, ...config } = {}) {
    ShellLayout.config = resolveShellConfig(config);
    ShellLayout.state = { drawerOpen: false, chromeHidden: false, searchOpen: false };
    ShellLayout.onDrawerOpen = onDrawerOpen;
    if (!s('.shell-layout-style')) append('head', html`<style class="shell-layout-style"></style>`);
    htmls('.shell-layout-style', renderStyle(ShellLayout.config));
    if (!s('.shell-scrim')) append('body', html`<div class="fix shell-scrim"></div>`);
    if (!s('.shell-nav-fixed')) append('body', renderControl('nav', 'fix shell-nav-fixed'));
    if (!s('.shell-restore')) append('body', renderControl('restore', 'fix'));
    s('.shell-scrim').onclick = () => ShellLayout.closeDrawer();
    Responsive.onChanged(() => ShellLayout.apply(), { key: 'shell-layout' });
    Translate.onChanged(() => ShellLayout.syncControls(), { key: 'shell-layout' });
    ShellLayout.apply();
  }

  /**
   * The controls of one slot: `start` and `end` of the header, or `footer`.
   * @param {'start'|'end'|'footer'} slot
   * @returns {string}
   * @memberof ShellLayout
   */
  static renderSlot(slot) {
    const slots = shellControlSlots(ShellLayout.config);
    const controls = slots[slot].map((name) => renderControl(name)).join('');
    if (slot === 'footer') return controls;
    return html`<div class="abs fl shell-header-slot shell-header-${slot}">${controls}</div>`;
  }

  /** Attributes of the drawer element. It starts closed, so it paints closed. */
  static drawerAttributes = 'id="shell-drawer" role="navigation" inert';

  /**
   * Binds the rendered controls.
   * @memberof ShellLayout
   */
  static bind() {
    for (const control of Object.values(ShellControls))
      sa(`.${control.className}`).forEach((el) => (el.onclick = () => control.action()));
    ShellLayout.apply();
  }

  /** Current geometry. */
  static geometry() {
    return shellGeometry({ ...ShellLayout.config, ...ShellLayout.state, viewportWidth: windowGetW() });
  }

  /** Publishes the geometry and the state to the page. */
  static apply() {
    const root = document.documentElement;
    const geometry = ShellLayout.geometry();
    for (const [name, value] of Object.entries(geometry))
      root.style.setProperty(`--shell-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, `${value}px`);
    const { drawerOpen, chromeHidden, searchOpen } = ShellLayout.state;
    root.dataset.shellLayout = ShellLayout.config.layout;
    root.dataset.shellDrawer = drawerOpen ? 'open' : 'closed';
    root.dataset.shellChrome = chromeHidden ? 'hidden' : 'visible';
    root.dataset.shellSearch = searchOpen ? 'open' : 'closed';
    if (s('#shell-drawer')) s('#shell-drawer').inert = !drawerOpen;
    for (const bar of sa('.slide-menu-top-bar, .modal.bottom-bar')) bar.inert = chromeHidden;
    ShellLayout.syncControls();
    ShellLayout.fitSearch();
  }

  /** Writes each control's icon, accessible name and disclosure state. */
  static syncControls() {
    for (const control of Object.values(ShellControls)) {
      for (const el of sa(`.${control.className}`)) {
        el.querySelector('i').className = `fa-solid ${control.icon(ShellLayout.state)}`;
        el.setAttribute('aria-label', Translate.text(control.label(ShellLayout.state), { disableTextFormat: true }));
        for (const [name, value] of Object.entries(control.attrs(ShellLayout.state))) el.setAttribute(name, value);
      }
    }
    if (s('#shell-drawer'))
      s('#shell-drawer').setAttribute('aria-label', Translate.text('navigation', { disableTextFormat: true }));
  }

  /** Gives the search field the header width the other header items leave. */
  static fitSearch() {
    const container = s('.top-bar-search-box-container');
    const input = s('.top-bar-search-box');
    if (!container || !input) return;
    const taken = ['.shell-header-start', '.action-btn-app-icon', '.top-box-profile-container', '.shell-header-end']
      .map((selector) => s(selector)?.offsetWidth ?? 0)
      .reduce((sum, width) => sum + width, 0);
    const width = Math.max(SHELL_BAR_SIZE, Math.min(SHELL_SEARCH_MAX_WIDTH, windowGetW() - taken - 1));
    container.style.width = `${width}px`;
    input.style.width = `${width - SHELL_BAR_SIZE - 20}px`;
    input.style.top = `${(SHELL_BAR_SIZE - input.clientHeight) / 2}px`;
  }

  /** Moves to the next state and publishes it. Bounded elements ease while the bars move. */
  static dispatch(action) {
    const previous = ShellLayout.state;
    ShellLayout.state = nextShellState(previous, action);
    if (previous.chromeHidden !== ShellLayout.state.chromeHidden) {
      document.documentElement.classList.add('shell-animating');
      clearTimeout(ShellLayout.animationTimeout);
      ShellLayout.animationTimeout = setTimeout(
        () => document.documentElement.classList.remove('shell-animating'),
        SHELL_TRANSITION_MS,
      );
    }
    ShellLayout.apply();
  }

  /** Opens the drawer and moves the focus to its first entry. */
  static openDrawer() {
    if (ShellLayout.state.drawerOpen) return;
    ShellLayout.dispatch('open-drawer');
    focusVisible('#shell-drawer .main-btn-menu');
    ShellLayout.onDrawerOpen?.();
  }

  /** Closes the drawer and returns the focus it held to the toggle. */
  static closeDrawer() {
    if (!ShellLayout.state.drawerOpen) return;
    const holdsFocus = !!s('#shell-drawer')?.contains(document.activeElement);
    ShellLayout.dispatch('close-drawer');
    if (holdsFocus) focusVisible('.shell-nav-toggle');
  }

  static toggleDrawer() {
    return ShellLayout.state.drawerOpen ? ShellLayout.closeDrawer() : ShellLayout.openDrawer();
  }

  /** Slides the bars away; the restore control takes the focus they held. */
  static hideChrome() {
    if (ShellLayout.state.chromeHidden) return;
    const holdsFocus = [...sa('.slide-menu-top-bar, .modal.bottom-bar, #shell-drawer')].some((bar) =>
      bar.contains(document.activeElement),
    );
    ShellLayout.dispatch('hide-chrome');
    if (holdsFocus) s('.shell-restore')?.focus();
  }

  /** Brings the bars back; the hide-bars control takes the focus the restore control held. */
  static showChrome() {
    if (!ShellLayout.state.chromeHidden) return;
    const holdsFocus = document.activeElement === s('.shell-restore');
    ShellLayout.dispatch('show-chrome');
    if (holdsFocus) s('.shell-chrome-toggle')?.focus();
  }

  /** Shows the search field in the header in place of the banner. */
  static openSearch() {
    ShellLayout.dispatch('open-search');
  }

  /** Shows the banner again; the search toggle takes the focus the covered field held. */
  static closeSearch() {
    if (!ShellLayout.state.searchOpen) return;
    const holdsFocus = document.activeElement === s('.top-bar-search-box');
    ShellLayout.dispatch('close-search');
    if (holdsFocus) s('.shell-search-toggle')?.focus();
  }

  /**
   * Shows the bars and the search field, and focuses the field.
   * @param {string} [query] - Searches this text instead of selecting the current one.
   */
  static focusSearch(query) {
    ShellLayout.openSearch();
    const input = s('.top-bar-search-box');
    if (!input) return;
    input.blur();
    input.focus();
    if (query === undefined) return input.select();
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Bounds an element to the main body area: under the header, over the footer, full width. Its
   * title stops before its window buttons.
   * @param {HTMLElement} el
   */
  static fill(el) {
    el.classList.add('shell-bounded');
    const bar = el.querySelector('.btn-bar-modal-container');
    const actions = bar?.querySelector('.bar-default-modal');
    el.style.setProperty('--shell-view-actions', `${actions ? bar.offsetWidth - actions.offsetLeft : 0}px`);
    Object.assign(el.style, {
      position: 'fixed',
      top: 'var(--shell-body-top)',
      bottom: 'var(--shell-body-bottom)',
      height: 'auto',
      left: '0px',
      width: '100%',
      translate: '0px 0px',
      transform: '',
    });
  }

  /**
   * Releases an element from the main body bounds.
   * @param {HTMLElement} el
   */
  static release(el) {
    el.classList.remove('shell-bounded');
    el.style.bottom = '';
    el.style.removeProperty('--shell-view-actions');
  }

  /** Publishes the geometry again and re-bounds every bounded element. */
  static sync() {
    ShellLayout.apply();
    sa('.shell-bounded').forEach(ShellLayout.fill);
  }
}

export {
  ShellLayout,
  ShellLayoutPresets,
  SHELL_BAR_SIZE,
  resolveShellConfig,
  shellControlSlots,
  shellGeometry,
  nextShellState,
};
