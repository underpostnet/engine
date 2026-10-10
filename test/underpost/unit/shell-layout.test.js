'use strict';

import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The shell layout owns every geometry value of the application shell. The drawer overlays the
 * body, so no drawer state moves the body; hidden bars give the body the whole viewport height.
 */

const template = (strings, ...values) => strings.reduce((out, text, i) => out + text + (values[i] ?? ''), '');
globalThis.html = template;
globalThis.css = template;
globalThis.requestAnimationFrame = (callback) => callback();

const dom = vi.hoisted(() => ({ elements: new Map(), appended: [], responsive: {}, viewport: { width: 1280 } }));
const { elements, appended, responsive, viewport } = dom;

vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  s: (selector) => dom.elements.get(selector) ?? null,
  sa: (selector) =>
    selector
      .split(',')
      .map((part) => dom.elements.get(part.trim()))
      .filter(Boolean),
  append: (selector, markup) => {
    dom.appended.push(markup);
    for (const name of ['shell-layout-style', 'shell-scrim', 'shell-nav-fixed', 'shell-restore'])
      if (markup.includes(name)) dom.element(`.${name}`);
  },
  htmls: (selector, markup) => (dom.elements.get(selector).markup = markup),
}));
vi.mock('../../../src/client/components/core/windowGetDimensions.js', () => ({ windowGetW: () => dom.viewport.width }));
vi.mock('../../../src/client/components/core/Responsive.js', () => ({
  Responsive: { onChanged: (listener, { key }) => (dom.responsive[key] = listener) },
}));
vi.mock('../../../src/client/components/core/Translate.js', () => ({
  Translate: { text: (key) => `t:${key}`, onChanged: () => {} },
}));

const { ShellLayout, ShellLayoutPresets, nextShellState, resolveShellConfig, shellControlSlots, shellGeometry } =
  await import('../../../src/client/components/core/ShellLayout.js');

const element = (selector, children = []) => {
  const el = {
    selector,
    attrs: {},
    style: {},
    dataset: {},
    inert: false,
    offsetWidth: 50,
    offsetParent: {},
    children,
    icon: { className: '' },
    setAttribute: (name, value) => (el.attrs[name] = value),
    getClientRects: () => [{}],
    querySelector: () => el.icon,
    contains: (other) => other === el || children.includes(other),
    focus: () => (document.activeElement = el),
  };
  elements.set(selector, el);
  return el;
};
dom.element = element;

const mountShell = (config) => {
  elements.clear();
  appended.length = 0;
  const root = { style: { values: {}, setProperty: (name, value) => (root.style.values[name] = value) }, dataset: {} };
  root.classList = { add: () => {}, remove: () => {} };
  globalThis.document = { documentElement: root, activeElement: null };
  ShellLayout.mount(config);
  const entry = element('#shell-drawer .main-btn-menu');
  const drawer = element('#shell-drawer', [entry]);
  const searchToggle = element('.shell-search-toggle');
  const chromeToggle = element('.shell-chrome-toggle');
  const header = element('.slide-menu-top-bar', [searchToggle]);
  const footer = element('.modal.bottom-bar', [chromeToggle]);
  const navToggle = element('.shell-nav-toggle');
  ShellLayout.bind();
  return { root, drawer, entry, header, footer, navToggle, searchToggle, chromeToggle };
};

describe('shell layout configuration', () => {
  it('defaults to the split layout with the drawer on the left', () => {
    expect(resolveShellConfig()).toEqual({ layout: 'split', side: 'left' });
    expect(resolveShellConfig({ layout: 'standard', side: 'right' })).toEqual({ layout: 'standard', side: 'right' });
  });

  it('fails on an unknown layout or side', () => {
    expect(() => resolveShellConfig({ layout: 'top-bottom-bar' })).toThrow('Unknown shell layout "top-bottom-bar"');
    expect(() => resolveShellConfig({ side: 'top' })).toThrow('Unknown navigation side "top"');
  });

  it('keeps the bar heights of the two presets', () => {
    expect(ShellLayoutPresets.standard).toEqual({ header: 100, footer: 0 });
    expect(ShellLayoutPresets.split).toEqual({ header: 50, footer: 50 });
  });

  it('puts the navigation toggle on the drawer side and the hide-bars control in the footer when there is one', () => {
    expect(shellControlSlots({ layout: 'split', side: 'left' })).toEqual({
      start: ['nav'],
      end: ['search'],
      footer: ['chrome'],
    });
    expect(shellControlSlots({ layout: 'split', side: 'right' })).toEqual({
      start: [],
      end: ['search', 'nav'],
      footer: ['chrome'],
    });
    expect(shellControlSlots({ layout: 'standard', side: 'left' })).toEqual({
      start: ['nav'],
      end: ['search', 'chrome'],
      footer: [],
    });
  });
});

describe('shell geometry', () => {
  const geometry = (state) => shellGeometry({ layout: 'split', side: 'left', viewportWidth: 1280, ...state });

  it('places the body between the bars, and over the whole viewport while they hide', () => {
    expect(geometry({ chromeHidden: false })).toMatchObject({ bodyTop: 50, bodyBottom: 50 });
    expect(geometry({ chromeHidden: true })).toMatchObject({ bodyTop: 0, bodyBottom: 0 });
    expect(shellGeometry({ layout: 'standard', side: 'left', chromeHidden: false, viewportWidth: 800 })).toMatchObject({
      headerHeight: 100,
      footerHeight: 0,
      bodyTop: 100,
      bodyBottom: 0,
    });
  });

  it('gives the body no horizontal offset, whatever the drawer does', () => {
    for (const drawerOpen of [false, true])
      expect(Object.keys(geometry({ drawerOpen, chromeHidden: false }))).not.toContain('bodyLeft');
    expect(geometry({ drawerOpen: true })).toEqual(geometry({ drawerOpen: false }));
  });

  it('caps the drawer at the viewport width', () => {
    expect(geometry({ viewportWidth: 1280 }).drawerWidth).toBe(320);
    expect(geometry({ viewportWidth: 300 }).drawerWidth).toBe(300);
  });

  it('reserves header space only for the header controls', () => {
    expect(geometry({})).toMatchObject({ headerStart: 50, headerEnd: 50 });
    expect(shellGeometry({ layout: 'split', side: 'right', viewportWidth: 1280 })).toMatchObject({
      headerStart: 0,
      headerEnd: 100,
    });
  });
});

describe('shell state', () => {
  const closed = { drawerOpen: false, chromeHidden: false, searchOpen: false };

  it('shows the bars to open the drawer, and closes the drawer to hide them', () => {
    expect(nextShellState({ ...closed, chromeHidden: true }, 'open-drawer')).toEqual({
      ...closed,
      drawerOpen: true,
    });
    expect(nextShellState({ ...closed, drawerOpen: true }, 'hide-chrome')).toEqual({ ...closed, chromeHidden: true });
  });

  it('closes the drawer and shows the bars to open the search', () => {
    expect(nextShellState({ ...closed, drawerOpen: true, chromeHidden: true }, 'open-search')).toEqual({
      ...closed,
      searchOpen: true,
    });
  });

  it('fails on an unknown action', () => {
    expect(() => nextShellState(closed, 'push')).toThrow('Unknown shell action "push"');
  });
});

describe('the shell layout controller', () => {
  beforeEach(() => {
    viewport.width = 1280;
  });

  it('publishes the geometry and the state to the page', () => {
    const { root, drawer } = mountShell({});
    expect(root.style.values).toMatchObject({
      '--shell-header-height': '50px',
      '--shell-footer-height': '50px',
      '--shell-body-top': '50px',
      '--shell-body-bottom': '50px',
      '--shell-drawer-width': '320px',
    });
    expect(root.dataset).toMatchObject({
      shellLayout: 'split',
      shellDrawer: 'closed',
      shellChrome: 'visible',
      shellSearch: 'closed',
    });
    expect(drawer.attrs).toMatchObject({ 'aria-label': 't:navigation' });
    expect(drawer.inert).toBe(true);
  });

  it('renders the drawer closed, as an inert navigation landmark', () => {
    expect(ShellLayout.drawerAttributes).toBe('id="shell-drawer" role="navigation" inert');
  });

  it('renders the stylesheet, the scrim and the fixed controls once per page', () => {
    mountShell({});
    expect(appended).toHaveLength(4);
    expect(appended[2]).toContain('fix shell-nav-fixed main-btn-menu shell-control shell-nav-toggle');
    ShellLayout.mount({});
    expect(appended).toHaveLength(4);
  });

  it('keeps the fixed controls on the drawer side, and clears the view header bars for them', () => {
    for (const side of ['left', 'right']) {
      mountShell({ side });
      const style = elements.get('.shell-layout-style').markup.replace(/\s+/g, ' ');
      expect(style).toContain(`.shell-control.shell-nav-fixed { ${side}: 0; }`);
      expect(style).toContain(`.shell-control.shell-restore { ${side}: 50px; }`);
      expect(style).toContain(
        `:root[data-shell-chrome='hidden'] .shell-bounded .stq.bar-default-modal { padding-${side}: 100px; }`,
      );
    }
  });

  it('opens the drawer over the body and moves the focus into it', () => {
    const { root, drawer, entry, navToggle } = mountShell({});
    const bounds = { ...root.style.values };
    navToggle.onclick();
    expect(root.dataset.shellDrawer).toBe('open');
    expect(root.style.values).toEqual(bounds);
    expect(drawer.inert).toBe(false);
    expect(navToggle.attrs).toMatchObject({
      'aria-controls': 'shell-drawer',
      'aria-expanded': 'true',
      'aria-label': 't:close-navigation',
    });
    expect(navToggle.icon.className).toBe('fa-solid fa-xmark');
    expect(document.activeElement).toBe(entry);
  });

  it('closes the drawer from the scrim and returns the focus it held to the toggle', () => {
    const { root, drawer, navToggle } = mountShell({});
    ShellLayout.openDrawer();
    elements.get('.shell-scrim').onclick();
    expect(root.dataset.shellDrawer).toBe('closed');
    expect(drawer.inert).toBe(true);
    expect(navToggle.attrs['aria-expanded']).toBe('false');
    expect(document.activeElement).toBe(navToggle);
  });

  it('hides the bars without a reserved gutter and gives their focus to the restore control', () => {
    const { root, header, footer, chromeToggle } = mountShell({});
    chromeToggle.focus();
    chromeToggle.onclick();
    expect(root.dataset.shellChrome).toBe('hidden');
    expect(root.style.values).toMatchObject({ '--shell-body-top': '0px', '--shell-body-bottom': '0px' });
    expect(header.inert && footer.inert).toBe(true);
    expect(document.activeElement).toBe(elements.get('.shell-restore'));

    elements.get('.shell-restore').onclick();
    expect(root.dataset.shellChrome).toBe('visible');
    expect(root.style.values).toMatchObject({ '--shell-body-top': '50px', '--shell-body-bottom': '50px' });
    expect(document.activeElement).toBe(chromeToggle);
  });

  it('brings the bars back and closes the drawer to show the search', () => {
    const { root, searchToggle } = mountShell({});
    ShellLayout.openDrawer();
    ShellLayout.hideChrome();
    ShellLayout.openSearch();
    expect(root.dataset).toMatchObject({ shellChrome: 'visible', shellDrawer: 'closed', shellSearch: 'open' });
    expect(searchToggle.attrs).toMatchObject({ 'aria-expanded': 'true', 'aria-label': 't:close-search' });
    searchToggle.onclick();
    expect(root.dataset.shellSearch).toBe('closed');
  });

  it('shows the bars to focus the search field, and searches a given text', () => {
    mountShell({});
    const input = element('.top-bar-search-box');
    input.events = [];
    Object.assign(input, {
      blur: () => {},
      select: () => input.events.push('select'),
      dispatchEvent: (event) => input.events.push(event.type),
    });
    ShellLayout.focusSearch();
    expect(document.activeElement).toBe(input);
    expect(input.events).toEqual(['select']);

    ShellLayout.closeSearch();
    expect(document.activeElement).toBe(elements.get('.shell-search-toggle'));
    ShellLayout.hideChrome();
    ShellLayout.focusSearch('guides');
    expect(document.documentElement.dataset).toMatchObject({ shellChrome: 'visible', shellSearch: 'open' });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('guides');
    expect(input.events).toEqual(['select', 'input']);
  });

  it('follows the viewport width and the standard preset', () => {
    const { root } = mountShell({ layout: 'standard', side: 'right' });
    expect(root.style.values).toMatchObject({
      '--shell-header-height': '100px',
      '--shell-footer-height': '0px',
      '--shell-header-start': '0px',
      '--shell-header-end': '150px',
    });
    viewport.width = 280;
    responsive['shell-layout']();
    expect(root.style.values['--shell-drawer-width']).toBe('280px');
  });

  it('bounds an element to the body area and releases it', () => {
    const classes = new Set();
    const properties = {};
    const actions = { offsetLeft: 1138 };
    const bar = { offsetWidth: 1280, querySelector: () => actions };
    const view = {
      style: {
        setProperty: (name, value) => (properties[name] = value),
        removeProperty: (name) => delete properties[name],
      },
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
      querySelector: () => bar,
    };
    ShellLayout.fill(view);
    expect(properties).toEqual({ '--shell-view-actions': '142px' });
    expect(view.style).toMatchObject({
      position: 'fixed',
      top: 'var(--shell-body-top)',
      bottom: 'var(--shell-body-bottom)',
      left: '0px',
      width: '100%',
    });
    expect(classes.has('shell-bounded')).toBe(true);
    ShellLayout.release(view);
    expect(view.style.bottom).toBe('');
    expect(properties).toEqual({});
    expect(classes.has('shell-bounded')).toBe(false);
  });
});
