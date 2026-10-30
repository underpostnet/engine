import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modal = vi.hoisted(() => ({ Data: {}, headerTitleHeight: 50, instance: vi.fn() }));
const select = vi.hoisted(() => vi.fn());

vi.mock('../../../src/client/components/core/Css.js', () => ({
  Css: { currentTheme: 'fixture' },
  darkTheme: false,
  ThemeEvents: {},
  Themes: { fixture: async () => ({ barConfig: {} }) },
  simpleIconsRender: vi.fn(),
}));
vi.mock('../../../src/client/components/core/Modal.js', () => ({
  Modal: modal,
  SUBMENU_SELECTION_QUERY_KEY: 'cid',
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

// The app session: a login writes the user token, as the real one does.
const session = vi.hoisted(() => ({ sessionIn: vi.fn() }));
vi.mock('../../../src/client/components/core/Auth.js', () => ({ Auth: session }));

const { Docs } = await import('../../../src/client/components/core/Docs.js');
const { GuestService } = await import('../../../src/client/services/user/guest.service.js');

const SCHEMES = {
  bearerAuth: { type: 'http', scheme: 'bearer' },
  basicAuth: { type: 'http', scheme: 'basic' },
  keyAuth: { type: 'apiKey', in: 'header', name: 'X-Key' },
};

/** The part of a Swagger UI instance the docs view uses: its spec, responses, auth and store. */
const swaggerFactory = () => {
  const listeners = [];
  const state = { spec: null, schemes: null, responses: new Map() };
  const dispatch = () => listeners.forEach((listener) => listener());
  // Immutable maps, reduced to the calls the view makes.
  const immutable = (entries) => ({
    forEach: (callback) => entries.forEach((value, key) => callback(value, key)),
    get: (key) => entries.get(key),
  });
  const ui = {
    specSelectors: {
      securityDefinitions: () => state.schemes,
      specJson: () => state.spec,
      responses: () => immutable(new Map([...state.responses].map(([path, methods]) => [path, immutable(methods)]))),
    },
    preauthorizeApiKey: vi.fn(dispatch),
    authActions: { logout: vi.fn(dispatch) },
    getStore: () => ({ subscribe: (listener) => listeners.push(listener) }),
  };
  // An Immutable map of security schemes, reduced to the calls the view makes.
  const loadSpec = (definitions) => {
    state.spec = { definitions };
    state.schemes = {
      filter: (keep) => ({
        keySeq: () => ({
          toArray: () => Object.keys(definitions).filter((name) => keep({ get: (key) => definitions[name][key] })),
        }),
      }),
    };
    dispatch();
  };
  // Swagger UI keeps the last response of each operation; executing it again stores a new one.
  const respond = (path, method, body) => {
    state.responses.set(
      path,
      new Map([...(state.responses.get(path) ?? []), [method, immutable(new Map([['text', body]]))]]),
    );
    dispatch();
  };
  return { ui, dispatch, loadSpec, respond };
};

describe('API docs authorization', () => {
  let frame;
  let listeners;
  let swagger;
  let storage;

  const load = () => listeners.load.forEach((listener) => listener());
  const close = () => modal.Data['modal-docs-api'].onCloseListener['modal-docs-api']();
  const open = async () => {
    vi.spyOn(Docs, 'Data', 'get').mockReturnValue([{ type: 'api', url: () => '/api-docs' }]);
    await Docs.RenderModal('api');
  };

  beforeEach(() => {
    vi.useFakeTimers();
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    });
    for (const key of Object.keys(GuestService.TokenEvent)) delete GuestService.TokenEvent[key];
    session.sessionIn.mockReset().mockImplementation(async ({ data }) => GuestService.setUserToken(data.token));
    modal.Data = { 'modal-docs': { options: {} } };
    modal.instance.mockImplementation(async ({ id }) => {
      modal.Data[id] = { onObserverListener: {}, onCloseListener: {} };
    });
    listeners = { load: [] };
    swagger = swaggerFactory();
    frame = {
      style: {},
      addEventListener: (name, listener) => listeners[name].push(listener),
      contentDocument: {
        documentElement: { classList: { contains: () => false } },
        querySelector: () => ({ click: vi.fn() }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      contentWindow: { ui: swagger.ui, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    };
    select.mockImplementation((selector) => (selector.startsWith('.iframe-') ? frame : null));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('authorizes each bearer scheme with the session token once the document loads', async () => {
    await open();
    load();
    swagger.loadSpec(SCHEMES);
    expect(swagger.ui.preauthorizeApiKey).not.toHaveBeenCalled();
    expect(swagger.ui.authActions.logout).not.toHaveBeenCalled();

    GuestService.setGuestToken('guest-token');
    expect(swagger.ui.preauthorizeApiKey.mock.calls).toEqual([['bearerAuth', 'guest-token']]);
  });

  it('waits for the document when the session token is already there', async () => {
    GuestService.setGuestToken('guest-token');
    await open();
    load();
    expect(swagger.ui.preauthorizeApiKey).not.toHaveBeenCalled();
    swagger.loadSpec(SCHEMES);
    expect(swagger.ui.preauthorizeApiKey.mock.calls).toEqual([['bearerAuth', 'guest-token']]);
  });

  it('follows each change of the session token, and logs out when none is left', async () => {
    GuestService.setGuestToken('guest-token');
    await open();
    load();
    swagger.loadSpec(SCHEMES);
    GuestService.setUserToken('user-token');
    GuestService.setUserToken('user-token');
    GuestService.clearUserToken();
    GuestService.clearGuestToken();
    expect(swagger.ui.preauthorizeApiKey.mock.calls).toEqual([
      ['bearerAuth', 'guest-token'],
      ['bearerAuth', 'user-token'],
      ['bearerAuth', 'guest-token'],
    ]);
    expect(swagger.ui.authActions.logout.mock.calls).toEqual([[['bearerAuth']]]);
  });

  it('keeps a logout made in Swagger UI until the token changes', async () => {
    GuestService.setGuestToken('guest-token');
    await open();
    load();
    swagger.loadSpec(SCHEMES);
    swagger.dispatch();
    expect(swagger.ui.preauthorizeApiKey).toHaveBeenCalledOnce();
    GuestService.setGuestToken('next-token');
    expect(swagger.ui.preauthorizeApiKey).toHaveBeenLastCalledWith('bearerAuth', 'next-token');
  });

  it('authorizes each document the frame loads, and stops when the modal closes', async () => {
    GuestService.setGuestToken('guest-token');
    await open();
    load();
    swagger.loadSpec(SCHEMES);
    const next = swaggerFactory();
    frame.contentWindow.ui = next.ui;
    load();
    next.loadSpec(SCHEMES);
    expect(next.ui.preauthorizeApiKey.mock.calls).toEqual([['bearerAuth', 'guest-token']]);

    close();
    expect(GuestService.TokenEvent).toEqual({});
    GuestService.setGuestToken('next-token');
    expect(next.ui.preauthorizeApiKey).toHaveBeenCalledOnce();
  });

  it('logs the app in once for a login in Swagger UI, and Swagger UI then sends that token', async () => {
    GuestService.setGuestToken('guest-token');
    await open();
    load();
    swagger.loadSpec(SCHEMES);
    const login = { status: 'success', data: { token: 'user-token', user: { _id: 'u1', role: 'user' } } };
    swagger.respond('/user/auth', 'post', JSON.stringify(login));
    await vi.waitFor(() => expect(swagger.ui.preauthorizeApiKey).toHaveBeenLastCalledWith('bearerAuth', 'user-token'));
    expect(session.sessionIn.mock.calls).toEqual([[login]]);
    swagger.dispatch();
    expect(session.sessionIn).toHaveBeenCalledOnce();

    // Executing the login again is a new response: a new session.
    swagger.respond('/user/auth', 'post', JSON.stringify({ ...login, data: { ...login.data, token: 'next-token' } }));
    await vi.waitFor(() => expect(swagger.ui.preauthorizeApiKey).toHaveBeenLastCalledWith('bearerAuth', 'next-token'));
    expect(session.sessionIn).toHaveBeenCalledTimes(2);
  });

  it('leaves the session alone for a failed, guest, tokenless or binary response', async () => {
    GuestService.setGuestToken('guest-token');
    await open();
    load();
    swagger.loadSpec(SCHEMES);
    swagger.respond('/user/auth', 'post', JSON.stringify({ status: 'error', message: 'unauthorized' }));
    swagger.respond(
      '/user/guest',
      'post',
      JSON.stringify({ status: 'success', data: { token: 'g', user: { role: 'guest' } } }),
    );
    swagger.respond('/user/{id}', 'get', JSON.stringify({ status: 'success', data: { user: { role: 'user' } } }));
    swagger.respond('/file/{id}', 'get', { size: 3 });
    swagger.respond('/core', 'get', 'not json');
    await vi.dynamicImportSettled();
    expect(session.sessionIn).not.toHaveBeenCalled();
    expect(swagger.ui.preauthorizeApiKey.mock.calls).toEqual([['bearerAuth', 'guest-token']]);
  });

  it('does not fail when the frame blocks access', async () => {
    await open();
    Object.defineProperty(frame.contentWindow, 'ui', {
      get: () => {
        throw new Error('Blocked');
      },
    });
    expect(load).not.toThrow();
    expect(() => GuestService.setGuestToken('guest-token')).not.toThrow();
  });
});
