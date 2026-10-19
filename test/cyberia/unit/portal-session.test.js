import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userToken: 'account-token',
  guestToken: '',
  account: { _id: 'player', role: 'user', profileImageId: 'avatar' },
  guest: { _id: 'visitor', role: 'guest' },
  nodes: new Map(),
  store: { Data: { user: { main: { model: { user: {} } } } } },
  session: new Map(),
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  avatar: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('../../../src/client/services/user/user.service.js', () => ({
  UserMock: { default: state.guest },
  UserService: { get: state.get, post: state.post, delete: state.delete },
}));
vi.mock('../../../src/client/services/user/guest.service.js', () => ({
  GuestService: {
    getUserToken: () => state.userToken,
    setUserToken: (token) => (state.userToken = token),
    clearUserToken: () => (state.userToken = ''),
    getGuestToken: () => state.guestToken,
    setGuestToken: (token) => (state.guestToken = token),
    clearGuestToken: () => (state.guestToken = ''),
    setMeta: vi.fn(),
  },
}));
vi.mock('../../../src/client/components/core/Account.js', () => ({ Account: { updateForm: vi.fn() } }));
vi.mock('../../../src/client/components/core/SearchBox.js', () => ({
  SearchBox: { RecentResults: { clear: vi.fn() } },
}));
vi.mock('../../../src/client/components/core/ShellLayout.js', () => ({ ShellLayout: { openSearch: vi.fn() } }));
vi.mock('../../../src/client/components/core/Logger.js', () => ({
  loggerFactory: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  s: (selector) => state.nodes.get(selector),
  htmls: state.avatar,
}));
vi.mock('../../../src/client/components/core/Webhook.js', () => ({
  WebhookProvider: { register: vi.fn(), unregister: vi.fn() },
}));
vi.mock('../../../src/client/components/core/NotificationManager.js', () => ({
  NotificationManager: { Push: vi.fn() },
}));
vi.mock('../../../src/client/components/core/BtnIcon.js', () => ({ BtnIcon: {} }));
vi.mock('../../../src/client/components/core/EventsUI.js', () => ({ EventsUI: {} }));
vi.mock('../../../src/client/components/core/Input.js', () => ({ Input: {} }));
vi.mock('../../../src/client/components/core/Validator.js', () => ({ Validator: {} }));
vi.mock('../../../src/client/services/core/core.service.js', () => ({
  CoreService: {},
  getApiBaseUrl: () => '/avatar',
}));
vi.mock('../../../src/client/services/file/file.service.js', () => ({
  FileService: { get: async () => ({ status: 'success', data: [{ _id: 'avatar' }] }) },
}));
vi.mock('../../../src/client/components/core/GoogleSignIn.js', () => ({ GoogleSignIn: { resume: async () => null } }));
vi.mock('../../../src/client/components/core/BuildManifest.js', () => ({ buildManifest: () => ({ runtime: {} }) }));
vi.mock('../../../src/client/components/core/Router.js', () => ({
  RouterReady: Promise.resolve(),
  getProxyPath: () => '/',
}));
vi.mock('../../../src/client/components/cyberia/StudioCyberia.js', () => ({ StudioCyberia: { reload: state.reload } }));
vi.mock('../../../src/client/components/cyberia-portal/AppStoreCyberiaPortal.js', () => ({
  AppStoreCyberiaPortal: state.store,
}));

const { Auth } = await import('../../../src/client/components/core/Auth.js');
const { LogIn } = await import('../../../src/client/components/core/LogIn.js');
const { LogInCyberiaPortal } = await import('../../../src/client/components/cyberia-portal/LogInCyberiaPortal.js');
const { resumeLaunch } = await import('../../../src/client/components/cyberia/GameLaunchCyberia.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  state.userToken = 'account-token';
  state.guestToken = '';
  state.store.Data.user.main.model.user = {};
  state.session.clear();
  state.nodes.clear();
  for (const name of ['log-in', 'sign-up', 'log-out', 'account'])
    state.nodes.set(`.main-btn-${name}`, { style: {}, click: vi.fn() });
  LogIn.offLogin('LogInCyberiaPortal');
  LogIn.offLogin('CyberiaPortalPlay');
  LogIn.Scope.user.main.model.user = {};
  state.get.mockImplementation(async () => ({
    status: 'success',
    data: { token: 'account-token', user: state.account },
  }));
  state.delete.mockResolvedValue({ status: 'success' });
  state.post.mockResolvedValue({ status: 'success', data: { token: 'guest-token', user: state.guest } });
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  vi.stubGlobal('location', {
    pathname: '/',
    search: '?signout',
    hash: '',
    assign: vi.fn(),
  });
  vi.stubGlobal('history', {
    state: null,
    replaceState: vi.fn((data, title, url) => {
      location.search = new URL(url, 'https://portal.test').search;
    }),
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (key) => state.session.get(key) ?? null,
    setItem: (key, value) => state.session.set(key, value),
    removeItem: (key) => state.session.delete(key),
  });
  vi.stubGlobal('html', (parts, ...values) => parts.reduce((out, part, i) => out + part + (values[i] ?? ''), ''));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('portal return from game settings', () => {
  it('keeps the account session on a normal portal visit', async () => {
    location.search = '';

    await LogInCyberiaPortal.instance();

    expect(state.delete).not.toHaveBeenCalled();
    expect(Auth.getToken()).toBe('account-token');
    expect(document.documentElement.dataset.session).toBe('log-in');
    expect(state.store.Data.user.main.model.user).toEqual(state.account);
    expect(state.avatar).toHaveBeenCalled();
  });

  it('keeps the shell and the account model signed out after startup completes', async () => {
    await LogInCyberiaPortal.instance();

    expect(state.delete).toHaveBeenCalledExactlyOnceWith({ id: 'logout' });
    expect(Auth.getToken()).toBe('');
    expect(document.documentElement.dataset.session).toBe('log-out');
    expect(state.store.Data.user.main.model.user).toEqual(state.guest);
    expect(LogIn.Scope.user.main.model.user).toEqual(state.guest);
    expect(state.nodes.get('.main-btn-log-in').style.display).toBeNull();
    expect(state.nodes.get('.main-btn-account').style.display).toBe('none');
    expect(location.search).toBe('');
    expect(location.assign).not.toHaveBeenCalled();
  });

  it('cancels a pending game launch when the player signs out', async () => {
    state.session.set('cyberia-pending-play', 'forest');
    location.search = '?signout&play=forest';

    await LogInCyberiaPortal.instance();

    expect(state.session.has('cyberia-pending-play')).toBe(false);
    expect(document.documentElement.dataset.session).toBe('log-out');
    expect(location.assign).not.toHaveBeenCalled();
  });

  it('resumes a pending game launch after a later sign-in', async () => {
    await LogInCyberiaPortal.instance();
    state.session.set('cyberia-pending-play', 'forest');

    await Auth.sessionIn({ status: 'success', data: { token: 'new-token', user: state.account } });

    expect(location.assign).toHaveBeenCalledExactlyOnceWith('/launch?world=forest&as=account');
    expect(document.documentElement.dataset.session).toBe('log-in');
    expect(state.session.has('cyberia-pending-play')).toBe(false);
  });

  it('consumes a sign-out request without a user token', async () => {
    state.userToken = '';
    state.session.set('cyberia-pending-play', 'forest');

    await resumeLaunch();

    expect(state.delete).not.toHaveBeenCalled();
    expect(state.session.has('cyberia-pending-play')).toBe(false);
    expect(location.search).toBe('');
    expect(location.assign).not.toHaveBeenCalled();
  });
});
