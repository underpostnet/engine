import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';

const clicks = {};
const elements = new Map();
const element = () => ({
  disabled: false,
  attributes: {},
  style: {},
  classList: { add: vi.fn(), remove: vi.fn() },
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
  removeAttribute(name) {
    delete this.attributes[name];
  },
  click: vi.fn(),
});
const query = { params: {} };
const logins = new Map();
const shell = vi.hoisted(() => {
  let render;
  const ready = new Promise((resolve) => (render = resolve));
  return { ready, render };
});

vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  s: (selector) => {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  },
  htmls: vi.fn(),
}));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));
vi.mock('../../../src/client/components/core/BtnIcon.js', () => ({
  BtnIcon: { instance: async ({ class: className, label }) => `<button class="${className}">${label}</button>` },
}));
vi.mock('../../../src/client/components/core/EventsUI.js', () => ({
  EventsUI: { onClick: (selector, logic) => (clicks[selector] = logic) },
}));
vi.mock('../../../src/client/components/core/Input.js', () => ({
  Input: { instance: async ({ id }) => `<input class="${id}" />` },
}));
vi.mock('../../../src/client/components/core/Validator.js', () => ({
  Validator: { instance: async () => async () => ({ errorMessage: '' }) },
}));
vi.mock('../../../src/client/components/core/NotificationManager.js', () => ({
  NotificationManager: { Push: vi.fn() },
}));
vi.mock('../../../src/client/components/core/Router.js', () => ({
  RouterReady: shell.ready,
  getProxyPath: () => '/',
  getQueryParams: () => query.params,
  setQueryParams: vi.fn((params) => {
    for (const [key, value] of Object.entries(params)) if (value === null) delete query.params[key];
  }),
}));
vi.mock('../../../src/client/components/core/Auth.js', () => ({
  Auth: { sessionIn: vi.fn(async (payload) => ({ user: payload.data.user })) },
}));
vi.mock('../../../src/client/components/core/Logger.js', () => ({
  loggerFactory: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/client/components/core/ClientEvents.js', () => ({
  AuthEventType: { login: 'login', signup: 'signup' },
  authLoginEvents: {
    on: vi.fn((type, listener, { key }) => {
      logins.set(key, listener);
      return () => logins.delete(key);
    }),
    off: vi.fn(),
    has: vi.fn(),
    emit: vi.fn(),
  },
  authSignupEvents: { on: vi.fn(), off: vi.fn(), has: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../../src/client/components/core/Webhook.js', () => ({ WebhookProvider: { register: vi.fn() } }));
vi.mock('../../../src/client/services/core/core.service.js', () => ({ CoreService: {}, getApiBaseUrl: vi.fn() }));
vi.mock('../../../src/client/services/file/file.service.js', () => ({ FileService: {} }));
vi.mock('../../../src/client/services/user/user.service.js', () => ({ UserService: { post: vi.fn() } }));
vi.mock('../../../src/client/services/google-auth/google-auth.service.js', () => ({
  GoogleAuthService: {
    signInUrl: (view) => `https://www.cyberiaonline.com/api/v1/google-auth?view=${view}`,
    session: vi.fn(),
    link: vi.fn(),
  },
}));

const template = (parts, ...values) => parts.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
vi.stubGlobal('html', template);
vi.stubGlobal('css', template);
const location = { assign: vi.fn() };
const windowStub = { addEventListener: vi.fn() };
vi.stubGlobal('location', location);
vi.stubGlobal('window', windowStub);

const { GoogleSignIn } = await import('../../../src/client/components/google-auth/GoogleSignIn.js');
const { LogIn } = await import('../../../src/client/components/core/LogIn.js');
const { SignUp } = await import('../../../src/client/components/core/SignUp.js');
const { Auth } = await import('../../../src/client/components/core/Auth.js');
const { NotificationManager } = await import('../../../src/client/components/core/NotificationManager.js');
const { GoogleAuthService } = await import('../../../src/client/services/google-auth/google-auth.service.js');
afterAll(() => vi.unstubAllGlobals());

const flushTimers = () => new Promise((resolve) => setTimeout(resolve, 0));
const flow = 'f'.repeat(48);
const logInAs = async (user) => {
  for (const listener of [...logins.values()]) await listener({ user });
};
const session = { status: 'success', data: { token: 'header.payload.signature', user: { _id: 'u1', role: 'user' } } };

beforeEach(() => {
  vi.clearAllMocks();
  elements.clear();
  query.params = {};
  logins.clear();
});

describe('Google sign-in button', () => {
  it('renders a labelled button with the pixel-art Google icon, then the divider before the form', async () => {
    const markup = await GoogleSignIn.instance();
    expect(markup).toMatch(/<button class="in section-mp form-button google-sign-in-btn google-sign-in-[0-9a-f]+">/);
    expect(markup).toContain('<img class="google-sign-in-icon" src="/assets/ui-icons/google.png" alt="" />');
    expect(markup).toContain('continue-with-google');
    expect(markup).toContain('image-rendering: pixelated');
    expect(markup).toContain('google-sign-in-divider');
  });

  it('starts the server flow from its view once, and gives the button back on a back-forward cache restore', async () => {
    const markup = await GoogleSignIn.instance({ view: 'sign-up' });
    const id = markup.match(/google-sign-in-[0-9a-f]{8,}/)[0];
    await flushTimers();
    await clicks[`.${id}`]();
    const button = elements.get(`.${id}`);
    expect(button.disabled).toBe(true);
    expect(button.attributes['aria-busy']).toBe('true');
    expect(location.assign).toHaveBeenCalledWith('https://www.cyberiaonline.com/api/v1/google-auth?view=sign-up');

    const [event, restore, options] = windowStub.addEventListener.mock.calls[0];
    expect([event, options]).toEqual(['pageshow', { once: true }]);
    restore();
    expect(button.disabled).toBe(false);
    expect(button.attributes['aria-busy']).toBeUndefined();
  });

  it('keeps the email form, password recovery and sign-up link of the log-in view, under the Google button', async () => {
    const providerRender = vi.fn(GoogleSignIn.instance);
    const markup = await LogIn.instance({ providerRender });
    expect(providerRender).toHaveBeenCalledWith({ view: 'log-in' });
    for (const part of [
      'btn-log-in-i-not-have-account',
      'log-in-email',
      'log-in-password',
      'btn-log-in-forgot-password',
    ])
      expect(markup).toContain(part);
    expect(markup.indexOf('continue-with-google')).toBeLessThan(markup.indexOf('<form'));
    expect(await LogIn.instance()).not.toContain('google-sign-in');
  });

  it('offers the same button in the sign-up view, above its form', async () => {
    const providerRender = vi.fn(GoogleSignIn.instance);
    const markup = await SignUp.instance({ idModal: 'modal-sign-up', providerRender });
    expect(providerRender).toHaveBeenCalledWith({ view: 'sign-up' });
    expect(markup.indexOf('continue-with-google')).toBeLessThan(markup.indexOf('<form'));
    expect(markup).toContain('sign-up-password');
    expect(await SignUp.instance({ idModal: 'modal-sign-up' })).not.toContain('google-sign-in');
  });
});

describe('Google sign-in return', () => {
  it('does nothing on a page the flow did not return to', async () => {
    expect(await GoogleSignIn.resume()).toBeNull();
    expect(GoogleAuthService.session).not.toHaveBeenCalled();
    expect(Auth.sessionIn).not.toHaveBeenCalled();
  });

  it('removes the outcome from the URL and opens the session through Auth.sessionIn, once', async () => {
    query.params = { 'google-auth': 'success', 'google-auth-flow': flow };
    GoogleAuthService.session.mockResolvedValue(session);
    expect(await GoogleSignIn.resume()).toEqual({ user: session.data.user });
    expect(query.params).toEqual({});
    expect(GoogleAuthService.session).toHaveBeenCalledWith(flow);
    expect(Auth.sessionIn).toHaveBeenCalledTimes(1);
    expect(Auth.sessionIn).toHaveBeenCalledWith(session);
    // The notification board exists once the shell has rendered.
    await flushTimers();
    expect(NotificationManager.Push).not.toHaveBeenCalled();
    shell.render();
    await flushTimers();
    expect(NotificationManager.Push).toHaveBeenCalledWith({ html: 'success-user-log-in', status: 'success' });
  });

  it('keeps the visitor signed out and reopens the log-in view when the exchange fails', async () => {
    query.params = { 'google-auth': 'success' };
    GoogleAuthService.session.mockResolvedValue({
      status: 'error',
      message: 'The sign-in ticket is invalid or expired',
    });
    expect(await GoogleSignIn.resume()).toBeNull();
    expect(Auth.sessionIn).not.toHaveBeenCalled();
    await flushTimers();
    expect(NotificationManager.Push).toHaveBeenCalledWith({ html: 'google-auth-error', status: 'error' });
    expect(elements.get('.main-btn-log-in').click).toHaveBeenCalledTimes(1);
  });

  it('shows the message of each other outcome, a cancellation as information, and the generic one for an unknown outcome', async () => {
    for (const [status, message, level] of [
      ['cancelled', 'google-auth-cancelled', 'info'],
      ['conflict', 'google-auth-conflict', 'error'],
      ['unverified-email', 'google-auth-unverified-email', 'error'],
      ['<img src=x onerror=alert(1)>', 'google-auth-error', 'error'],
    ]) {
      vi.clearAllMocks();
      query.params = { 'google-auth': status };
      expect(await GoogleSignIn.resume()).toBeNull();
      expect(GoogleAuthService.session).not.toHaveBeenCalled();
      await flushTimers();
      expect(NotificationManager.Push).toHaveBeenCalledWith({ html: message, status: level });
    }
  });

  it('links the Google account after the next log-in of a registered user, once', async () => {
    query.params = { 'google-auth': 'link', 'google-auth-flow': flow };
    GoogleAuthService.link.mockResolvedValue({ status: 'success', data: { user: session.data.user }, code: 200 });
    expect(await GoogleSignIn.resume()).toBeNull();
    expect(query.params).toEqual({});
    await flushTimers();
    expect(NotificationManager.Push).toHaveBeenCalledWith({ html: 'google-auth-link', status: 'info' });

    await logInAs({ _id: 'guest1', role: 'guest' });
    expect(GoogleAuthService.link).not.toHaveBeenCalled();
    await logInAs(session.data.user);
    await logInAs(session.data.user);
    expect(GoogleAuthService.link).toHaveBeenCalledTimes(1);
    expect(GoogleAuthService.link).toHaveBeenCalledWith(flow);
    await flushTimers();
    expect(NotificationManager.Push).toHaveBeenCalledWith({ html: 'google-auth-linked', status: 'success' });
  });

  it('explains a link that conflicts or expired', async () => {
    for (const [code, message] of [
      [409, 'google-auth-conflict'],
      [401, 'google-auth-link-expired'],
    ]) {
      vi.clearAllMocks();
      query.params = { 'google-auth': 'link', 'google-auth-flow': flow };
      GoogleAuthService.link.mockResolvedValue({ status: 'error', message: 'refused', code });
      await GoogleSignIn.resume();
      await logInAs(session.data.user);
      await flushTimers();
      expect(NotificationManager.Push).toHaveBeenCalledWith({ html: message, status: 'error' });
    }
  });
});

describe('Google sign-in assets and copy', () => {
  it('ships the Google icon in the Cyberia public assets the portal serves at assets/ui-icons/', () => {
    const icon = fs.readFileSync('./src/client/public/cyberia/assets/ui-icons/google.png');
    expect(icon.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('translates every Google sign-in message to each supported language', () => {
    const source = fs.readFileSync('./src/client/components/google-auth/TranslateGoogleAuth.js', 'utf8');
    for (const key of [
      'or',
      'continue-with-google',
      'google-auth-cancelled',
      'google-auth-link',
      'google-auth-linked',
      'google-auth-link-expired',
      'google-auth-conflict',
      'google-auth-unverified-email',
      'google-auth-error',
    ]) {
      const entry = source.match(new RegExp(`Translate\\.Data\\['${key}'\\] = \\{([^}]*)\\}`))?.[1];
      expect(entry, key).toBeDefined();
      for (const lang of ['en', 'es']) expect(entry, `${key}.${lang}`).toMatch(new RegExp(`\\b${lang}: '[^']+'`));
    }
  });
});
