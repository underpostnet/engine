import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { sanitizeHtml, ssrFactory } from '../../../src/client-builder/ssr.js';
import { DefaultConf } from '../../../underpost.config.js';

// The root element holds session and theme state.

vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({ s: vi.fn(), htmls: vi.fn() }));
vi.mock('../../../src/client/components/core/Auth.js', () => ({ Auth: {} }));
vi.mock('../../../src/client/components/core/BtnIcon.js', () => ({ BtnIcon: {} }));
vi.mock('../../../src/client/components/core/EventsUI.js', () => ({ EventsUI: {} }));
vi.mock('../../../src/client/components/core/Input.js', () => ({ Input: {} }));
vi.mock('../../../src/client/components/core/Validator.js', () => ({ Validator: {} }));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: {} }));
vi.mock('../../../src/client/components/core/NotificationManager.js', () => ({ NotificationManager: {} }));
vi.mock('../../../src/client/components/core/Logger.js', () => ({ loggerFactory: () => ({ warn: vi.fn() }) }));
vi.mock('../../../src/client/components/core/Webhook.js', () => ({
  WebhookProvider: { register: vi.fn(), unregister: vi.fn() },
}));
vi.mock('../../../src/client/components/core/ClientEvents.js', () => ({
  AuthEventType: { login: 'login', logout: 'logout' },
  authLoginEvents: { emit: vi.fn() },
  authLogoutEvents: { emit: vi.fn() },
}));
vi.mock('../../../src/client/services/core/core.service.js', () => ({ CoreService: {}, getApiBaseUrl: vi.fn() }));
vi.mock('../../../src/client/services/file/file.service.js', () => ({ FileService: {} }));
vi.mock('../../../src/client/services/user/user.service.js', () => ({ UserService: {} }));

const { LogIn } = await import('../../../src/client/components/core/LogIn.js');
const { LogOut } = await import('../../../src/client/components/core/LogOut.js');

const render = async (state = {}) =>
  (await ssrFactory())({
    title: 'Root',
    ssrPath: '/',
    buildId: 'build-1',
    buildManifestHead: '<script id="manifest" type="application/json">{}</script>',
    ssrHeadComponents: '<meta name="head-component" />',
    ssrBodyComponents: '<div class="body-component"></div>',
    ...state,
  });

describe('root document', () => {
  it('renders the logged-out session and the dark theme on <html>', async () => {
    expect(await render()).toMatch(/<html\s+dir="ltr"\s+lang="en"\s+data-session="log-out"\s+data-theme="dark"\s*>/);
  });

  it('keeps root and theme styles in the head without marker containers', async () => {
    const document = await render();
    const [head, body] = document.split('</head>');
    expect(document).not.toMatch(/class="(session|theme)"/);
    expect(head.match(/<style\b[^>]*>/g)).toEqual(['<style class="root-style">', '<style class="theme-style">']);
    expect(head.indexOf('head-component')).toBeLessThan(head.indexOf('root-style'));
    expect(body).not.toContain('<style');
    expect(body).toContain('body-component');
  });

  it('renders the supplied session and theme state', async () => {
    expect(await render({ sessionState: 'log-in', theme: 'light' })).toMatch(
      /data-session="log-in"\s+data-theme="light"/,
    );
  });

  it.each([undefined, null, 'unknown', '\"><script>alert(1)</script>', {}])(
    'uses safe defaults for invalid root state %j',
    async (state) => {
      expect(await render({ sessionState: state, theme: state })).toMatch(/data-session="log-out"\s+data-theme="dark"/);
    },
  );

  it('keys each session class on the root attribute for both states', async () => {
    const document = await render();
    for (const display of ['in', 'inl', 'fl'])
      for (const state of ['log-in', 'log-out']) {
        const selector = `.session-${display}-${state}`;
        expect(document).toContain(`:root[data-session='log-in'] ${selector}`);
        expect(document).toContain(`:root:not([data-session='log-in']) ${selector}`);
      }
  });

  it.each(Object.entries(DefaultConf.ssr).flatMap(([client, { body }]) => body.map((name) => [client, name])))(
    '%s renders its body component %s as markup',
    async (client, name) => {
      const markup = (await ssrFactory(`./src/client/ssr/body/${name}.js`))({ ssrPath: '/', ttiLoadTimeLimit: 1 });
      expect(markup).toBeTypeOf('string');
      expect(markup).not.toContain('[object Object]');
    },
  );

  it('gets one nonce on each script and style under the CSP sanitizer', async () => {
    const document = sanitizeHtml({ locals: { nonce: 'n0nce' } }, {}, await render());
    const tags = document.match(/<(script|style)\b[^>]*>/g);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag.match(/nonce=/g)).toEqual(['nonce=']);
  });

  it('replaces existing nonces without changing other attributes', () => {
    const source = `<style nonce='old' media="screen">body { margin: 0; }</style><script NONCE=old data-label="nonce=keep > 0"></script>`;
    const response = { locals: { nonce: 'response-nonce' } };
    const document = sanitizeHtml(response, {}, source);
    expect(document).not.toContain('old');
    expect(document).toContain('media="screen"');
    expect(document).toContain('data-label="nonce=keep > 0"');
    expect(document.match(/nonce="response-nonce"/g)).toHaveLength(2);
    expect(sanitizeHtml(response, {}, document)).toBe(document);
  });

  it('rejects objects before the build can insert them into HTML', async () => {
    const root = fs.mkdtempSync('/tmp/engine-ssr-');
    try {
      const componentPath = `${root}/invalid.js`;
      fs.writeFileSync(componentPath, 'SSRComponent = () => ({ css: "body {}" });');
      const component = await ssrFactory(componentPath);
      expect(() => component()).toThrow(`SSR component must return HTML: ${componentPath}`);
    } finally {
      fs.removeSync(root);
    }
  });

  it('renders the configured body list without object text', async () => {
    const components = await Promise.all(
      DefaultConf.ssr.Default.body.map((name) => ssrFactory(`./src/client/ssr/body/${name}.js`)),
    );
    const ssrBodyComponents = components.map((component) => component({ ssrPath: '/', ttiLoadTimeLimit: 1 })).join('');
    const document = await render({ ssrBodyComponents });
    expect(document).not.toContain('[object Object]');
    expect(document).toContain('ssr-loader');
  });
});

describe('session state on the root element', () => {
  beforeEach(() => {
    globalThis.document = { documentElement: { dataset: { session: 'log-out' } } };
    LogIn.Scope.user.main.model.user = { profileImage: {} };
  });

  it('logs a user in and out', async () => {
    await LogIn.Trigger({ user: { _id: 'u1', role: 'user' } });
    expect(document.documentElement.dataset.session).toBe('log-in');
    await LogOut.Trigger({});
    expect(document.documentElement.dataset.session).toBe('log-out');
  });

  it('keeps a guest logged out', async () => {
    document.documentElement.dataset.session = 'log-in';
    await LogIn.Trigger({ user: { _id: 'g1', role: 'guest' } });
    expect(document.documentElement.dataset.session).toBe('log-out');
  });

  it('uses the logged-out state when no user is available', async () => {
    document.documentElement.dataset.session = 'log-in';
    await LogIn.Trigger({});
    expect(document.documentElement.dataset.session).toBe('log-out');
  });
});
