import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ui = vi.hoisted(() => ({
  nodes: new Map(),
  htmls: vi.fn(),
  onClick: vi.fn(),
  validate: vi.fn(async () => ({})),
  post: vi.fn(),
  sessionIn: vi.fn(),
  push: vi.fn(),
  file: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../../../src/client/services/core/core.service.js', () => ({
  CoreService: {},
  getApiBaseUrl: ({ id, endpoint }) => `/api/${endpoint}/${id}`,
}));
vi.mock('../../../src/client/services/file/file.service.js', () => ({ FileService: { get: ui.file } }));
vi.mock('../../../src/client/services/user/user.service.js', () => ({ UserService: { post: ui.post } }));
vi.mock('../../../src/client/components/core/Auth.js', () => ({ Auth: { sessionIn: ui.sessionIn } }));
vi.mock('../../../src/client/components/core/BtnIcon.js', () => ({
  BtnIcon: { instance: async ({ class: name }) => `<button class="${name}"></button>` },
}));
vi.mock('../../../src/client/components/core/EventsUI.js', () => ({ EventsUI: { onClick: ui.onClick } }));
vi.mock('../../../src/client/components/core/Input.js', () => ({
  Input: { instance: async ({ id }) => `<input class="${id}" />` },
}));
vi.mock('../../../src/client/components/core/Logger.js', () => ({
  loggerFactory: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/client/components/core/NotificationManager.js', () => ({
  NotificationManager: { Push: ui.push },
}));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));
vi.mock('../../../src/client/components/core/Validator.js', () => ({
  Validator: { instance: async () => ui.validate },
}));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  htmls: ui.htmls,
  s: (selector) => ui.nodes.get(selector),
}));
vi.mock('../../../src/client/components/core/Webhook.js', () => ({ WebhookProvider: { register: ui.register } }));

const { LogIn } = await import('../../../src/client/components/core/LogIn.js');

const classes = () => {
  const names = new Set(['hide']);
  return { names, add: (name) => names.add(name), remove: (name) => names.delete(name) };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('html', (parts, ...values) => parts.reduce((out, part, i) => out + part + (values[i] ?? ''), ''));
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  ui.nodes.clear();
  LogIn.Scope.user.main.model.user = {};
  LogIn.Event = {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('log-in form', () => {
  const mount = async (options) => {
    const attempts = classes();
    const locked = classes();
    ui.nodes.set('.log-in-email', { value: 'ada@example.com' });
    ui.nodes.set('.log-in-password', { value: 'secret' });
    ui.nodes.set('.login-attempt-warn-container', { classList: attempts });
    ui.nodes.set('.login-attempt-warn-container0', { classList: locked });
    ui.nodes.set('.btn-log-in-forgot-password', {});
    ui.nodes.set('.btn-log-in-i-not-have-account', {});
    ui.nodes.set('.main-btn-recover', { click: vi.fn() });
    ui.nodes.set('.main-btn-sign-up', { click: vi.fn() });
    const markup = await LogIn.instance(options);
    await vi.runAllTimersAsync();
    const submit = ui.onClick.mock.calls[0][1];
    return { markup, attempts, locked, submit: () => submit({ preventDefault: vi.fn() }) };
  };

  it('renders the form with the provider block and links to recovery and sign-up', async () => {
    const { markup } = await mount({ providerRender: async ({ view }) => `<div class="provider-${view}"></div>` });
    expect(markup).toContain('provider-log-in');
    expect(markup).toContain('log-in-email');
    ui.nodes.get('.btn-log-in-forgot-password').onclick();
    ui.nodes.get('.btn-log-in-i-not-have-account').onclick();
    expect(ui.nodes.get('.main-btn-recover').click).toHaveBeenCalledOnce();
    expect(ui.nodes.get('.main-btn-sign-up').click).toHaveBeenCalledOnce();
  });

  it('posts the credentials and opens the session on success', async () => {
    ui.post.mockResolvedValue({ status: 'success', data: { token: 't' } });
    const { submit, attempts, locked } = await mount();
    await submit();
    expect(ui.post).toHaveBeenCalledWith({ id: 'auth', body: { email: 'ada@example.com', password: 'secret' } });
    expect(ui.sessionIn).toHaveBeenCalledOnce();
    expect(ui.push).toHaveBeenCalledWith({ html: 'success-user-log-in', status: 'success' });
    expect(attempts.names.has('hide')).toBe(true);
    expect(locked.names.has('hide')).toBe(true);
  });

  it('shows the remaining attempts, then the lock, and sends nothing for an invalid form', async () => {
    const { submit, attempts, locked } = await mount();
    ui.post.mockResolvedValueOnce({ status: 'error', message: 'Invalid credentials. Remaining attempts: 4' });
    await submit();
    expect(ui.htmls).toHaveBeenCalledWith('.login-attempt-warn-value', ' 4');
    expect(attempts.names.has('hide')).toBe(false);

    ui.post.mockResolvedValueOnce({ status: 'error', message: 'Account locked. Please try again in: 15 min.' });
    await submit();
    expect(ui.htmls).toHaveBeenCalledWith('.login-attempt-warn-value0', ' 15 min.');
    expect(locked.names.has('hide')).toBe(false);
    expect(attempts.names.has('hide')).toBe(true);
    expect(ui.push).toHaveBeenLastCalledWith({ html: 'Account locked. Please try again in: 15 min.', status: 'error' });
    expect(ui.sessionIn).not.toHaveBeenCalled();

    ui.validate.mockResolvedValueOnce({ errorMessage: 'empty' });
    ui.post.mockClear();
    await submit();
    expect(ui.post).not.toHaveBeenCalled();
  });
});

describe('log-in trigger', () => {
  it('marks a guest or an absent user as logged out after the listeners run', async () => {
    const listener = vi.fn();
    LogIn.Event.probe = listener;
    await LogIn.Trigger({ user: { role: 'guest' } });
    expect(listener).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.session).toBe('log-out');
    expect(ui.register).not.toHaveBeenCalled();
  });

  it('draws the stored profile image, and the default avatar when there is none', async () => {
    ui.file.mockResolvedValueOnce({ status: 'success', data: [{ _id: 'f1', data: {} }] });
    await LogIn.Trigger({ user: { role: 'user', profileImageId: 'f1' } });
    expect(ui.register).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.session).toBe('log-in');
    expect(ui.htmls.mock.calls.at(-1)[1]).toContain('src="/api/file/blob/f1"');

    LogIn.Scope.user.main.model.user = {};
    await LogIn.Trigger({ user: { role: 'user' } });
    expect(ui.htmls.mock.calls.at(-1)[1]).toContain('src="/api/user/assets/avatar"');
  });

  it('draws an inline image, and falls back to the avatar when the file read fails', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:inline' });
    ui.file.mockResolvedValueOnce({
      status: 'success',
      data: [{ data: { data: [1, 2, 3] }, mimetype: 'image/png', name: 'a.png' }],
    });
    await LogIn.Trigger({ user: { role: 'user', profileImageId: 'f2' } });
    expect(ui.htmls.mock.calls.at(-1)[1]).toContain('src="blob:inline"');

    LogIn.Scope.user.main.model.user = {};
    ui.file.mockRejectedValueOnce(new Error('offline'));
    await LogIn.Trigger({ user: { role: 'user', profileImageId: 'f3' } });
    expect(ui.htmls.mock.calls.at(-1)[1]).toContain('src="/api/user/assets/avatar"');
  });

  it('keeps an image it already drew', async () => {
    LogIn.Scope.user.main.model.user = { profileImage: { imageSrc: 'kept' } };
    await LogIn.Trigger({ user: { role: 'user', profileImageId: 'f1' } });
    expect(ui.file).not.toHaveBeenCalled();
    expect(ui.htmls).not.toHaveBeenCalled();
  });
});
