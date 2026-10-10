'use strict';

import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The shell navigation registry renders every drawer entry from one declaration and opens every
 * view with the shell defaults. Activating an entry closes the drawer, except a submenu entry.
 */

const template = (strings, ...values) => strings.reduce((out, text, i) => out + text + (values[i] ?? ''), '');
globalThis.html = template;

const state = vi.hoisted(() => ({
  clicks: {},
  sortable: null,
  query: {},
  openSubmenus: new Set(),
  subMenuRender: vi.fn(),
  setQueryParams: vi.fn(),
  closeDrawer: vi.fn(),
  modalInstance: vi.fn(async (options) => options),
  sortableSubMenuEvents: vi.fn(() => ({ onStart: 'start', onEnd: () => {} })),
}));

vi.mock('sortablejs', () => ({
  default: class {
    constructor(el, options) {
      state.sortable = { el, options };
    }
  },
}));
vi.mock('../../../src/client/components/core/BtnIcon.js', () => ({
  BtnIcon: {
    instance: async ({ class: className, label, style, attrs, tabHref, handleContainerClass }) =>
      `<button class="${className}" style="${style ?? ''}" ${attrs} href="${tabHref}" handle="${
        handleContainerClass ?? ''
      }">${label}</button>`,
  },
}));
vi.mock('../../../src/client/components/core/Css.js', () => ({
  Css: { currentTheme: 'dark' },
  Themes: { dark: async () => ({ barConfig: { theme: 'dark' } }) },
}));
vi.mock('../../../src/client/components/core/EventsUI.js', () => ({
  EventsUI: { onClick: (selector, handler) => (state.clicks[selector] = handler) },
}));
vi.mock('../../../src/client/components/core/Modal.js', () => ({
  Modal: { instance: state.modalInstance },
  SUBMENU_SELECTION_QUERY_KEY: 'cid',
  isSubMenuOpen: (id) => state.openSubmenus.has(id),
  renderMenuLabel: ({ icon, text }) => `[${icon}|${text}]`,
  renderViewTitle: ({ icon, text }) => `{${icon}|${text}}`,
  sortableSubMenuEvents: state.sortableSubMenuEvents,
  subMenuRender: state.subMenuRender,
}));
vi.mock('../../../src/client/components/core/Router.js', () => ({
  getProxyPath: () => '/app/',
  getQueryParams: () => state.query,
  setQueryParams: state.setQueryParams,
}));
vi.mock('../../../src/client/components/core/ShellLayout.js', () => ({
  ShellLayout: { closeDrawer: state.closeDrawer },
}));
vi.mock('../../../src/client/components/core/Translate.js', () => ({
  Translate: { instance: (key) => `T(${key})` },
}));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({ s: (selector) => ({ selector }) }));

const { ShellNavigation } = await import('../../../src/client/components/core/ShellNavigation.js');

const RouterInstance = { Routes: () => ({}) };
const trusted = { isTrusted: true };
const routed = { isTrusted: false };

const shell = (overrides = {}) => ({
  RouterInstance,
  entries: [
    { id: 'home', route: '', icon: '<i home>', active: true },
    { id: 'settings', icon: '<i settings>', view: () => ({ html: 'settings view' }) },
    { id: 'public-profile', route: 'u', icon: '<i profile>', session: true, action: vi.fn() },
    { id: 'recover', icon: '<i recover>', hidden: true, view: () => ({ html: 'recover view' }) },
    {
      id: 'docs',
      icon: '<i docs>',
      submenu: true,
      view: () => ({ observer: true }),
      children: [{ id: 'editor', icon: '<i editor>', view: () => ({ html: 'editor view' }) }],
    },
  ],
  ...overrides,
});

beforeEach(() => {
  for (const key of Object.keys(state.clicks)) delete state.clicks[key];
  state.query = {};
  state.openSubmenus.clear();
  vi.clearAllMocks();
});

describe('shell navigation rendering', () => {
  it('renders one drawer button per entry, on its route', async () => {
    const menu = await ShellNavigation.render(shell());
    expect(menu.startsWith('<div class="fl menu-btn-container">')).toBe(true);
    expect(menu).toContain('class="in wfa main-btn-menu main-btn-home main-btn-menu-active"');
    expect(menu).toContain('data-id="home" href="/app/"');
    expect(menu).toContain('data-id="settings" href="/app/settings"');
    expect(menu).toContain('data-id="public-profile" href="/app/u"');
    expect(menu).toContain('handle="handle-btn-container"');
  });

  it('starts role entries hidden and session entries out of the layout', async () => {
    const menu = await ShellNavigation.render(shell());
    expect(menu).toContain('main-btn-recover hide"');
    expect(menu).toMatch(/main-btn-public-profile" style="display: none"/);
    expect(menu).toMatch(/main-btn-settings" style=""/);
  });

  it('renders a submenu entry with its caret and its fixed children, without drag handles', async () => {
    const menu = await ShellNavigation.render(shell());
    expect(menu).toContain('down-arrow-submenu down-arrow-submenu-docs');
    expect(menu).toContain('<div class="abs menu-btn-container-children-docs" style="height: 0px; overflow: hidden;">');
    expect(menu).toContain(
      'class="in wfa main-btn-menu submenu-btn btn-docs btn-docs-editor main-btn-editor" style="" data-id="editor" href="/app/editor" handle=""',
    );
    expect(menu).toContain('<span class="menu-label-text menu-label-text-docs">T(editor)</span>');
  });

  it('draws image entries with the icon set of the shell', async () => {
    const config = shell({ iconSet: 'acme', entries: [{ id: 'wallet', image: 'wallet.png' }] });
    expect(await ShellNavigation.render(config)).toContain(
      '<img class="inl acme-menu-icon" src="/app/assets/ui-icons/wallet.png" />',
    );
    expect(ShellNavigation.title(config, config.entries[0])).toBe(
      '{<img class="inl acme-menu-icon-modal" src="/app/assets/ui-icons/wallet.png" />|<span class="inl acme-text-title-modal">T(wallet)</span>}',
    );
  });

  it('titles a font icon entry with its icon and its label', () => {
    expect(ShellNavigation.title(shell(), { id: 'polyhedron', icon: '<i p>', text: 'Polyhedron' })).toBe(
      '{<i p>|Polyhedron}',
    );
  });
});

describe('shell navigation activation', () => {
  it('binds only the entries that open something', () => {
    ShellNavigation.bind(shell());
    expect(Object.keys(state.clicks).sort()).toEqual(
      [
        '.main-btn-docs',
        '.main-btn-editor',
        '.main-btn-public-profile',
        '.main-btn-recover',
        '.main-btn-settings',
      ].sort(),
    );
  });

  it('closes the drawer and opens the entry view with the shell defaults', async () => {
    ShellNavigation.bind(shell());
    await state.clicks['.main-btn-settings'](trusted);
    expect(state.closeDrawer).toHaveBeenCalledOnce();
    expect(state.modalInstance).toHaveBeenCalledWith({
      id: 'modal-settings',
      route: 'settings',
      barConfig: { theme: 'dark' },
      title: '{<i settings>|T(settings)}',
      handleType: 'bar',
      maximize: true,
      mode: 'view',
      slideMenu: 'modal-menu',
      RouterInstance,
      html: 'settings view',
    });
  });

  it('opens a submenu child like any other entry', async () => {
    ShellNavigation.bind(shell());
    await state.clicks['.main-btn-editor'](trusted);
    expect(state.closeDrawer).toHaveBeenCalledOnce();
    expect(state.modalInstance.mock.calls[0][0]).toMatchObject({ id: 'modal-editor', route: 'editor' });
  });

  it('hands an action the opener of the entry view, with overrides', async () => {
    const config = shell();
    ShellNavigation.bind(config);
    const event = trusted;
    await state.clicks['.main-btn-public-profile'](event);
    const [received, open] = config.entries[2].action.mock.calls[0];
    expect(received).toBe(event);
    await open({ title: '', observer: true });
    expect(state.modalInstance.mock.calls[0][0]).toMatchObject({ id: 'modal-public-profile', route: 'u', title: '' });
  });

  it('keeps the drawer open and toggles the submenu on a click, clearing its selection', async () => {
    state.query = { cid: 'src' };
    ShellNavigation.bind(shell());
    await state.clicks['.main-btn-docs'](trusted);
    expect(state.closeDrawer).not.toHaveBeenCalled();
    expect(state.setQueryParams).toHaveBeenCalledWith({ cid: null });
    expect(state.subMenuRender).toHaveBeenCalledWith('docs');
    expect(state.modalInstance.mock.calls[0][0]).toMatchObject({ id: 'modal-docs', route: 'docs', observer: true });
  });

  it('leaves an open submenu as it is when a route reaches its entry', async () => {
    state.openSubmenus.add('docs');
    ShellNavigation.bind(shell());
    await state.clicks['.main-btn-docs'](routed);
    expect(state.subMenuRender).not.toHaveBeenCalled();
    expect(state.setQueryParams).not.toHaveBeenCalled();
  });

  it('makes the drawer order sortable without dragging the submenu panels', () => {
    ShellNavigation.bind(shell());
    expect(state.sortableSubMenuEvents).toHaveBeenCalledWith(['docs']);
    expect(state.sortable.el).toEqual({ selector: '.menu-btn-container' });
    expect(state.sortable.options).toMatchObject({
      group: 'menu-sortable',
      handle: '.handle-btn-container',
      draggable: '.main-btn-menu',
      onStart: 'start',
    });
  });
});
