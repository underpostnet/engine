import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ui = vi.hoisted(() => ({
  nodes: new Map(),
  query: {},
  theme: {
    Css: { currentTheme: 'fixture' },
    darkTheme: false,
    ThemeEvents: {},
    Themes: { fixture: async () => ({ barConfig: { bar: true } }) },
    simpleIconsRender: vi.fn(),
  },
  modal: {
    Data: {},
    headerTitleHeight: 50,
    instance: vi.fn(),
    subMenuPopulate: vi.fn(),
    buildSubMenuItemsHtml: vi.fn(async () => 'items'),
    renderSubMenuLanding: vi.fn((landing) => landing),
  },
  router: { listenQueryPathInstance: vi.fn(), setQueryPath: vi.fn(), closeModalRouteChangeEvent: vi.fn() },
  shell: { sync: vi.fn(), focusSearch: vi.fn(), closeDrawer: vi.fn() },
  responsive: { onChanged: vi.fn(), offChanged: vi.fn() },
}));

vi.mock('../../../src/client/components/core/Css.js', () => ui.theme);
vi.mock('../../../src/client/components/core/BuildManifest.js', () => ({
  buildManifest: () => ({ version: 'v3.5.0', documentation: { coverage: [{ id: 'engine', label: 'Engine' }] } }),
}));
vi.mock('../../../src/client/components/core/Modal.js', () => ({
  Modal: ui.modal,
  SUBMENU_SELECTION_QUERY_KEY: 'cid',
  renderViewTitle: ({ icon, text }) => `title:${icon}${text}`,
}));
vi.mock('../../../src/client/components/core/Repository.js', () => ({
  coverallsUrl: () => 'https://coveralls.test',
  githubPagesUrl: (repository) => `https://pages.test/${repository}`,
  packageRepository: () => 'engine-ghpkg',
  releaseUrl: () => 'https://github.test/release',
}));
vi.mock('../../../src/client/components/core/Responsive.js', () => ({ Responsive: ui.responsive }));
vi.mock('../../../src/client/components/core/ShellLayout.js', () => ({ ShellLayout: ui.shell }));
vi.mock('../../../src/client/components/core/Router.js', () => ({
  ...ui.router,
  getProxyPath: () => '/',
  getQueryParams: () => ui.query,
}));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({ s: (selector) => ui.nodes.get(selector) }));
vi.mock('../../../src/client/components/core/Documentation.js', () => ({
  Documentation: { instance: vi.fn(async ({ path }) => `documentation:${path}`) },
}));

const { Docs } = await import('../../../src/client/components/core/Docs.js');

/** A node that records its listeners, and fires them on demand. */
const nodeFactory = (extra = {}) => {
  const listeners = {};
  return {
    listeners,
    addEventListener: vi.fn((type, listener) => (listeners[type] ??= []).push(listener)),
    removeEventListener: vi.fn((type, listener) => {
      listeners[type] = (listeners[type] ?? []).filter((entry) => entry !== listener);
    }),
    fire: (type, event = {}) => (listeners[type] ?? []).forEach((listener) => listener(event)),
    ...extra,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('html', (parts, ...values) => parts.reduce((out, part, i) => out + part + (values[i] ?? ''), ''));
  ui.nodes.clear();
  ui.query = {};
  ui.theme.ThemeEvents = {};
  ui.modal.Data = { 'modal-docs': { options: { RouterInstance: {} } } };
  ui.modal.instance.mockImplementation(async ({ id }) => {
    ui.modal.Data[id] = { onObserverListener: {}, onCloseListener: {} };
  });
  Docs.Tokens = {};
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('documentation entries', () => {
  const entry = (type) => Docs.entries.find((docData) => docData.type === type);

  it('lists every entry with a coverage report per build report, and hides the disabled ones', () => {
    expect(Docs.entries.map(({ type }) => type)).toEqual([
      'guide',
      'repo',
      'demo',
      'src',
      'api',
      'coverage-engine',
      'coverage-link',
    ]);
    Docs.Tokens['modal-docs'] = { disabled: ['demo', 'coverage-link'] };
    expect(Docs.Data.map(({ type }) => type)).not.toContain('demo');
    expect(Docs.Data.map(({ type }) => type)).not.toContain('coverage-link');
  });

  it('links each entry to its place, and lets the shell replace the external links', () => {
    expect(entry('guide').url()).toBe('/docs');
    expect(entry('src').url()).toBe('/docs/engine/3.5.0');
    expect(entry('api').url()).toBe('/api-docs');
    expect(entry('coverage-engine').url()).toBe('/docs/coverage/engine');
    expect(entry('repo').url()).toBe('https://github.test/release');
    expect(entry('demo').url()).toBe('https://pages.test/engine-ghpkg');
    expect(entry('coverage-link').url()).toBe('https://coveralls.test');

    Docs.Tokens['modal-docs'] = {
      lastReleaseUrl: () => 'release-override',
      demoUrl: () => 'demo-override',
      coverageLinkUrl: () => 'coverage-override',
    };
    expect(entry('repo').url()).toBe('release-override');
    expect(entry('demo').url()).toBe('demo-override');
    expect(entry('coverage-link').url()).toBe('coverage-override');
  });

  it('describes each card, and a coverage report by its run', () => {
    expect(Docs.cardDescription({ type: 'api', text: 'Api Docs' })).toMatch(/REST API reference/);
    expect(Docs.cardDescription({ type: 'coverage-engine', text: 'Engine' })).toBe('Test coverage report: Engine');
  });

  it('draws the entries from the ui-icons set with the classes of the shell', () => {
    const icons = Docs.uiIcons({ iconClass: 'cyberia-menu-icon' });
    expect(icons.subMenuIcon('repo')).toBe('<img class="inl cyberia-menu-icon" src="/assets/ui-icons/github.png" />');
    expect(icons.subMenuIcon('coverage-engine')).toContain('/assets/ui-icons/check.png');
    expect(icons.subMenuIcon('unknown')).toContain('/assets/ui-icons/doc.png');
    expect(icons.viewTitle({ type: 'src', text: 'Source Docs' })).toBe(
      'title:<img class="inl cyberia-menu-icon-modal" src="/assets/ui-icons/doc.png" />' +
        '<span class="inl cyberia-text-title-modal">Source Docs</span>',
    );
  });
});

describe('documentation landing', () => {
  const button = () => ({ onclick: null, click: vi.fn() });

  it('renders one card per entry with the shell icon, and populates the submenu', async () => {
    const landing = await Docs.instance({ idModal: 'modal-docs', subMenuIcon: (type) => `icon:${type}` });
    expect(ui.modal.subMenuPopulate).toHaveBeenCalledWith('docs', 'items');
    expect(landing).toMatchObject({ subMenuId: 'docs', title: 'Documentation' });
    expect(landing.cards[0]).toMatchObject({ id: 'guide', icon: 'icon:guide', title: 'Documentation' });
    expect((await Docs.instance({ idModal: 'modal-docs' })).cards[1].icon).toContain('fa-github');
  });

  it('opens an external entry in the page, and frames the others on the docs route', async () => {
    vi.stubGlobal('location', { href: '' });
    const render = vi.spyOn(Docs, 'RenderModal').mockResolvedValue(undefined);
    const repo = button();
    const api = button();
    ui.nodes.set('.btn-docs-repo', repo);
    ui.nodes.set('.btn-docs-api', api);
    await Docs.instance({ idModal: 'modal-docs' });
    vi.runAllTimers();

    repo.onclick();
    expect(location.href).toBe('https://github.test/release');
    await api.onclick();
    expect(ui.shell.closeDrawer).toHaveBeenCalled();
    expect(ui.router.setQueryPath).toHaveBeenCalledWith({ path: 'docs', queryPath: 'api' }, 'cid');
    expect(render).toHaveBeenCalledWith('api', 'modal-docs');

    // A deep link that already selects the entry keeps its query.
    ui.router.setQueryPath.mockClear();
    ui.query = { cid: 'api' };
    await api.onclick();
    expect(ui.router.setQueryPath).not.toHaveBeenCalled();
  });

  it('follows the submenu route and tints the coverage icons with the theme', async () => {
    const api = button();
    ui.nodes.set('.btn-docs-api', api);
    ui.nodes.set('.doc-icon-coverage', {});
    await Docs.instance({ idModal: 'modal-docs' });
    vi.runAllTimers();

    const { event } = ui.router.listenQueryPathInstance.mock.calls[0][0];
    event('api');
    expect(api.click).toHaveBeenCalledOnce();
    event('absent');
    expect(api.click).toHaveBeenCalledOnce();
    expect(ui.theme.simpleIconsRender).toHaveBeenCalledWith('.doc-icon-coverage');
  });
});

describe('documentation view', () => {
  const view = () => ui.modal.instance.mock.calls.at(-1)[0];

  it('opens nothing for an unknown entry or a missing parent', async () => {
    await Docs.RenderModal('nothing');
    await Docs.RenderModal('api', 'modal-absent');
    expect(ui.modal.instance).not.toHaveBeenCalled();
  });

  it('renders the guide inline, titled by the shell', async () => {
    Docs.Tokens['modal-docs'] = { viewTitle: ({ text }) => `shell:${text}` };
    ui.query = { doc: 'nexodev/how-to/run' };
    await Docs.RenderModal('guide');
    const options = view();
    expect(options).toMatchObject({ id: 'modal-docs-guide', title: 'shell:Documentation', route: 'docs' });
    expect(await options.html()).toBe('documentation:nexodev/how-to/run');
  });

  it('frames a report, keeps the frame sized to the modal and cleans up on close', async () => {
    const frame = nodeFactory({ style: {}, contentWindow: null, contentDocument: null });
    ui.nodes.set('.iframe-modal-docs-coverage-engine', frame);
    ui.nodes.set('.modal-docs-coverage-engine', { offsetHeight: 600 });
    await Docs.RenderModal('coverage-engine');
    expect(await view().html()).toContain('src="/docs/coverage/engine"');
    expect(frame.style.height).toBe('550px');
    expect(ui.theme.simpleIconsRender).toHaveBeenCalledWith('.doc-icon-coverage');

    ui.nodes.set('.bar-default-modal-modal-docs-coverage-engine', { offsetHeight: 100 });
    ui.responsive.onChanged.mock.calls[0][0]();
    expect(frame.style.height).toBe('500px');

    ui.modal.Data['modal-docs-coverage-engine'].onCloseListener['modal-docs-coverage-engine']();
    expect(ui.responsive.offChanged).toHaveBeenCalledWith('modal-docs-coverage-engine');
    expect(ui.router.closeModalRouteChangeEvent).toHaveBeenCalledWith({ closedId: 'modal-docs-coverage-engine' });
  });

  it('re-syncs the layout on in-frame navigation and forwards the search shortcut', async () => {
    const frameDocument = nodeFactory();
    const frameWindow = nodeFactory();
    const frame = nodeFactory({ style: {}, contentWindow: frameWindow, contentDocument: frameDocument });
    ui.nodes.set('.iframe-modal-docs-coverage-engine', frame);
    await Docs.RenderModal('coverage-engine');

    frame.fire('load');
    expect(frameWindow.parent).toBe(frameWindow);
    vi.runAllTimers();
    ui.shell.sync.mockClear();

    frameDocument.fire('click', { target: { closest: () => ({}) } });
    frameDocument.fire('click', { target: { closest: () => null } });
    frameWindow.fire('hashchange');
    frameWindow.fire('popstate');
    vi.runAllTimers();
    expect(ui.shell.sync).toHaveBeenCalledTimes(12);

    const preventDefault = vi.fn();
    frameDocument.fire('keydown', { shiftKey: true, key: 'K', preventDefault, stopPropagation: vi.fn() });
    frameDocument.fire('keydown', { shiftKey: false, key: 'k', preventDefault });
    expect(ui.shell.focusSearch).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();

    // A second load releases the listeners of the previous document before binding new ones.
    frame.fire('load');
    expect(frameDocument.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(frameDocument.listeners.keydown).toHaveLength(1);

    ui.modal.Data['modal-docs-coverage-engine'].onCloseListener['modal-docs-coverage-engine']();
    expect(frameDocument.listeners.keydown).toHaveLength(0);
  });
});
