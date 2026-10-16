import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const theme = vi.hoisted(() => ({
  Css: { currentTheme: 'fixture' },
  darkTheme: true,
  ThemeEvents: {},
  Themes: { fixture: async () => ({ barConfig: {} }) },
  simpleIconsRender: vi.fn(),
}));
const modal = vi.hoisted(() => ({ Data: {}, headerTitleHeight: 50, instance: vi.fn() }));
const select = vi.hoisted(() => vi.fn());

vi.mock('../../../src/client/components/core/Css.js', () => theme);
vi.mock('../../../src/client/components/core/Modal.js', () => ({
  Modal: modal,
  SUBMENU_SELECTION_QUERY_KEY: 'submenu',
  renderViewTitle: () => '',
}));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({ s: select }));
vi.mock('../../../src/client/components/core/Responsive.js', () => ({
  Responsive: { onChanged: vi.fn(), offChanged: vi.fn() },
}));
vi.mock('../../../src/client/components/core/ShellLayout.js', () => ({
  ShellLayout: { sync: vi.fn(), focusSearch: vi.fn() },
}));
vi.mock('../../../src/client/components/core/Router.js', () => ({
  listenQueryPathInstance: vi.fn(),
  setQueryPath: vi.fn(),
  closeModalRouteChangeEvent: vi.fn(),
  getProxyPath: () => '/',
  getQueryParams: () => ({}),
}));

import { Docs } from '../../../src/client/components/core/Docs.js';

describe('documentation theme synchronization', () => {
  let frame;
  let root;
  let toggle;
  let observers;
  let listeners;
  let nativeDark;
  let toggleReady;

  const load = () => listeners.load.forEach((listener) => listener());
  const changeTheme = (dark) => {
    theme.darkTheme = dark;
    Object.values(theme.ThemeEvents).forEach((listener) => listener());
  };
  const open = async (type = 'api') => {
    vi.spyOn(Docs, 'Data', 'get').mockReturnValue([{ type, url: () => '/api-docs/' }]);
    await Docs.RenderModal(type);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    theme.darkTheme = true;
    theme.ThemeEvents = {};
    modal.Data = { 'modal-docs': { options: {} } };
    modal.instance.mockImplementation(async ({ id }) => {
      modal.Data[id] = { onObserverListener: {}, onCloseListener: {} };
    });
    listeners = { load: [] };
    observers = [];
    nativeDark = false;
    toggleReady = true;
    const classes = new Set();
    root = {
      setAttribute: vi.fn(),
      classList: { contains: (value) => classes.has(value) },
    };
    toggle = {
      click: vi.fn(() => {
        nativeDark = !nativeDark;
        if (nativeDark) classes.add('dark-mode');
        else classes.delete('dark-mode');
      }),
    };
    frame = {
      style: {},
      addEventListener: (name, listener) => listeners[name].push(listener),
      contentDocument: {
        documentElement: root,
        querySelector: () => (toggleReady ? toggle : null),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      contentWindow: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        localStorage: { setItem: vi.fn() },
      },
    };
    select.mockImplementation((selector) => (selector.startsWith('.iframe-') ? frame : null));
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback) {
          this.callback = callback;
          this.observe = vi.fn();
          this.disconnect = vi.fn();
          observers.push(this);
        }
      },
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('applies the PWA theme on load through the native Swagger control', async () => {
    await open();
    load();
    expect(nativeDark).toBe(true);
    expect(root.classList.contains('dark-mode')).toBe(true);
    expect(toggle.click).toHaveBeenCalledOnce();
    expect(frame.contentWindow.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('follows PWA changes in both directions without toggling a matching theme', async () => {
    await open();
    load();
    changeTheme(false);
    expect(nativeDark).toBe(false);
    changeTheme(true);
    expect(nativeDark).toBe(true);
    changeTheme(true);
    expect(toggle.click).toHaveBeenCalledTimes(3);
  });

  it('uses the latest PWA theme when Swagger finishes rendering after load', async () => {
    toggleReady = false;
    await open();
    load();
    expect(observers).toHaveLength(1);
    changeTheme(false);
    toggleReady = true;
    observers[0].callback();
    expect(nativeDark).toBe(false);
    expect(toggle.click).not.toHaveBeenCalled();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });

  it('replaces the observer on navigation and removes it when the modal closes', async () => {
    toggleReady = false;
    await open();
    load();
    load();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    modal.Data['modal-docs-api'].onCloseListener['modal-docs-api']();
    expect(observers[1].disconnect).toHaveBeenCalledOnce();
    expect(theme.ThemeEvents).toEqual({});
  });

  it('does not fail when the frame blocks document access', async () => {
    await open();
    Object.defineProperty(frame, 'contentDocument', {
      get: () => {
        throw new Error('Blocked');
      },
    });
    expect(load).not.toThrow();
    expect(() => changeTheme(false)).not.toThrow();
    expect(observers).toHaveLength(0);
  });

  it('keeps Source Docs synchronized through the TypeDoc theme', async () => {
    await open('src');
    load();
    expect(root.setAttribute).toHaveBeenLastCalledWith('data-theme', 'dark');
    changeTheme(false);
    expect(root.setAttribute).toHaveBeenLastCalledWith('data-theme', 'light');
    expect(frame.contentWindow.localStorage.setItem).toHaveBeenLastCalledWith('tsd-theme', 'light');
    expect(toggle.click).not.toHaveBeenCalled();
  });
});
