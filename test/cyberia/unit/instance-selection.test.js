import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ui = vi.hoisted(() => ({
  nodes: new Map(),
  htmls: vi.fn(),
  pager: vi.fn(),
  get: vi.fn(),
  push: vi.fn(),
  load: vi.fn(),
  search: vi.fn(),
  launch: vi.fn(),
  themes: {},
  dark: false,
}));
vi.mock('../../../src/client/components/core/Css.js', () => ({
  ThemeEvents: ui.themes,
  get darkTheme() {
    return ui.dark;
  },
}));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));
vi.mock('../../../src/client/components/core/NotificationManager.js', () => ({
  NotificationManager: { Push: ui.push },
}));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  htmls: ui.htmls,
  s: (selector) => ui.nodes.get(selector),
  htmlStrSanitize: (text) => text,
}));
vi.mock('../../../src/client/components/core/Router.js', () => ({ getProxyPath: () => '/' }));
vi.mock('../../../src/client/components/core/ListPager.js', () => ({
  ListPager: { instance: ui.pager, load: ui.load, search: ui.search },
}));
vi.mock('../../../src/client/services/core/core.service.js', () => ({ getApiBaseUrl: (url) => url }));
vi.mock('../../../src/client/services/cyberia-instance/cyberia-instance.service.js', () => ({
  CyberiaInstanceService: { get: ui.get },
}));
vi.mock('../../../src/client/components/cyberia/GameLaunchCyberia.js', () => ({
  gameServerUrl: (code) => `https://server.test/${code}`,
  launchWorld: ui.launch,
}));

const {
  InstanceSelectionView,
  defaultInstanceProvider,
  normalizeInstance,
  resolveStatus,
  statusFromMetrics,
  STATUS_ORDER,
} = await import('../../../src/client/components/cyberia/InstanceSelectionView.js');

const metrics = (values = {}) => ({
  health: 'healthy',
  entities: { total_entities: 50000 },
  workload: { current_load: 'critical', max_entity_capacity: 3000 },
  websocket: { status: 'running', active_connections: 2, max_connections: 2000 },
  ...values,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('html', (parts, ...values) => parts.reduce((out, part, i) => out + part + (values[i] ?? ''), ''));
  ui.nodes.clear();
  ui.dark = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('world selection status', () => {
  it('offers only availability filters', () => {
    expect(STATUS_ORDER).toEqual(['online', 'full', 'maintenance', 'coming-soon', 'offline']);
  });

  it.each([0, 74, 75, 99])('keeps %i percent population online', (players) => {
    expect(
      statusFromMetrics(
        metrics({
          websocket: { status: 'running', active_connections: players, max_connections: 100 },
        }),
      ),
    ).toBe('online');
  });

  it('uses content lifecycle without population estimates', () => {
    expect(resolveStatus({ status: 'draft', runtimeStatus: 'online', players: 0, capacity: 100 })).toBe('maintenance');
    expect(resolveStatus({ status: 'archived', runtimeStatus: 'online' })).toBe('offline');
    expect(normalizeInstance({ code: 'forest', players: 100, capacity: 100 })).toMatchObject({
      status: 'online',
      players: null,
      capacity: null,
    });
  });

  it.each(['healthy', 'degraded', 'critical'])(
    'keeps a reachable %s world joinable despite entity counts',
    (health) => {
      expect(statusFromMetrics(metrics({ health }))).toBe('online');
    },
  );

  it('uses the configured connection limit for a full world', () => {
    expect(
      statusFromMetrics(metrics({ websocket: { status: 'running', active_connections: 10, max_connections: 10 } })),
    ).toBe('full');
    expect(
      statusFromMetrics(metrics({ websocket: { status: 'running', active_connections: 5000, max_connections: 0 } })),
    ).toBe('online');
  });

  it.each(['stopping', 'error', 'crashed', 'unknown'])('handles websocket state %s', (status) => {
    expect(statusFromMetrics(metrics({ websocket: { status } }))).toBe(
      status === 'stopping' ? 'maintenance' : 'offline',
    );
  });

  it('handles unavailable, malformed and maintenance metrics', () => {
    expect(statusFromMetrics(null)).toBe('offline');
    expect(statusFromMetrics({})).toBe('offline');
    expect(statusFromMetrics(metrics({ health: 'maintenance' }))).toBe('maintenance');
  });
});

describe('world population source', () => {
  it('reads connection population and capacity from the live metrics endpoint', async () => {
    ui.get.mockResolvedValue({ status: 'success', data: { data: [{ code: 'forest' }], total: 1 } });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => metrics() });
    vi.stubGlobal('fetch', fetch);
    expect(await defaultInstanceProvider()).toMatchObject({
      data: [{ code: 'forest', status: 'online', players: 2, capacity: 2000, playable: true }],
      total: 1,
    });
    expect(fetch).toHaveBeenCalledWith('https://server.test/forest/api/v1/metrics', expect.anything());
  });

  it('keeps draft worlds unavailable and clears stale population when the metrics read fails', async () => {
    ui.get.mockResolvedValue({
      status: 'success',
      data: {
        data: [
          { code: 'draft', status: 'draft' },
          { code: 'offline', players: 20, capacity: 100 },
        ],
        total: 2,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => metrics() })
        .mockRejectedValueOnce(new Error('unreachable')),
    );
    const { data } = await defaultInstanceProvider();
    expect(data[0]).toMatchObject({ status: 'maintenance', playable: false });
    expect(data[1]).toMatchObject({ status: 'offline', playable: false, players: null, capacity: null });
  });

  it('renders the online card and filter under high operational load', async () => {
    ui.nodes.set('.isv-grid', {});
    ui.nodes.set('.isv-filters', {});
    await InstanceSelectionView.render();
    const { render } = ui.pager.mock.calls[0][0];
    render([{ ...normalizeInstance({ code: 'forest' }), players: 90, capacity: 100 }]);
    const filters = ui.htmls.mock.calls.find(([selector]) => selector === '.isv-filters')[1];
    const card = ui.htmls.mock.calls.find(([selector]) => selector === '.isv-grid')[1];
    expect(filters).toContain('data-filter="online"');
    expect(card).toContain('data-status="online"');
    expect(card).not.toContain('disabled');
  });
});

describe('world selection view', () => {
  const htmlOf = (selector) => ui.htmls.mock.calls.filter(([target]) => target === selector).at(-1)?.[1] ?? '';
  const world = (values = {}) => ({ ...normalizeInstance({ code: 'forest', name: 'Forest' }), ...values });

  const mount = async (options) => {
    let click;
    ui.nodes.set('.isv-grid', {});
    ui.nodes.set('.isv-filters', {});
    ui.nodes.set('.style-instance-selection', {});
    ui.nodes.set('.isv-search input', { value: '' });
    ui.nodes.set('.instance-selection', { addEventListener: (type, listener) => (click = listener) });
    const markup = await InstanceSelectionView.render(options);
    vi.runAllTimers();
    const { fetch, render } = ui.pager.mock.calls.at(-1)[0];
    const target = (matches) => ({ closest: (selector) => matches[selector] ?? null });
    return { markup, fetch, render, click: (matches) => click({ target: target(matches) }) };
  };

  it('styles the view for the light and the dark theme, and skips a view that is not mounted', async () => {
    await mount();
    expect(htmlOf('.style-instance-selection')).toContain('--isv-bg: #f1f3f5');
    ui.dark = true;
    ui.themes['instance-selection']();
    expect(htmlOf('.style-instance-selection')).toContain('--isv-bg: #161616');
    ui.nodes.delete('.style-instance-selection');
    const calls = ui.htmls.mock.calls.length;
    ui.themes['instance-selection']();
    expect(ui.htmls.mock.calls.length).toBe(calls);
  });

  it('wires the search box and loads the first page once mounted', async () => {
    const { markup } = await mount();
    expect(markup).toContain('instance-selection');
    expect(ui.search).toHaveBeenCalledWith('instance-selection', ui.nodes.get('.isv-search input'));
    expect(ui.load).toHaveBeenCalledWith('instance-selection', 1);
  });

  it('launches a playable world and explains why another cannot start', async () => {
    const { render, click } = await mount();
    render([world({ id: 'a', code: 'forest' }), world({ id: 'b', code: 'cave', status: 'full', playable: false })]);
    click({ '.isv-play:not(.isv-play-disabled)': { dataset: { instanceId: 'a' } } });
    expect(ui.launch).toHaveBeenCalledWith('forest');
    click({ '.isv-play:not(.isv-play-disabled)': { dataset: { instanceId: 'b' } } });
    expect(ui.push).toHaveBeenCalledWith({ html: 'Forest is Full.', status: 'warning' });
    // A card no longer in the page launches nothing.
    click({ '.isv-play:not(.isv-play-disabled)': { dataset: { instanceId: 'gone' } } });
    expect(ui.launch).toHaveBeenCalledOnce();
  });

  it('filters by status, reloads on refresh or retry, and ignores any other click', async () => {
    const { render, click } = await mount();
    render([world({ id: 'a' }), world({ id: 'b', status: 'maintenance', playable: false })]);
    expect(htmlOf('.isv-filters')).toContain('data-filter="maintenance"');

    click({ '.isv-chip': { dataset: { filter: 'maintenance' } } });
    expect(htmlOf('.isv-grid')).toContain('data-status="maintenance"');
    expect(htmlOf('.isv-grid')).not.toContain('data-status="online"');
    expect(htmlOf('.isv-filters')).toContain('isv-chip-active');

    click({ '.isv-chip': { dataset: { filter: 'full' } } });
    expect(htmlOf('.isv-grid')).toContain('No worlds match your filters');

    ui.load.mockClear();
    click({ '.isv-refresh': {} });
    click({ '.isv-retry': {} });
    click({});
    expect(ui.load.mock.calls).toEqual([['instance-selection'], ['instance-selection']]);
  });

  it('shows the empty registry, and an empty search, apart', async () => {
    const { render } = await mount();
    render([]);
    expect(htmlOf('.isv-grid')).toContain('No worlds available');
    ui.nodes.get('.isv-search input').value = 'zz';
    render([]);
    expect(htmlOf('.isv-grid')).toContain('No worlds match your filters');
  });

  it('fetches a page with the search text and shows the registry error', async () => {
    const fetchInstances = vi
      .fn()
      .mockResolvedValueOnce({ data: [], total: 0 })
      .mockRejectedValueOnce(new Error('down'));
    const { fetch } = await mount({ fetchInstances, liveStatus: false });
    ui.nodes.get('.isv-search input').value = ' forest ';
    expect(await fetch({ page: 2, limit: 12 })).toEqual({ data: [], total: 0 });
    expect(fetchInstances).toHaveBeenCalledWith({ liveStatus: false, page: 2, limit: 12, search: 'forest' });
    expect(await fetch({ page: 1, limit: 12 })).toBeNull();
    expect(htmlOf('.isv-grid')).toContain('Could not reach the world registry');
    expect(htmlOf('.isv-grid')).toContain('down');
  });

  it('renders at most three escaped tags and the call to action of a world that cannot start', async () => {
    const { render } = await mount();
    render([
      world({ id: 'a', tags: ['pvp', '<b>', 'x', 'y'] }),
      world({ id: 'b', code: '', status: 'coming-soon', playable: false }),
    ]);
    const grid = htmlOf('.isv-grid');
    expect(grid).toContain('&lt;b&gt;');
    expect(grid).not.toContain('>y<');
    expect(grid).toContain('Soon');
    expect(grid).toContain('disabled');
  });
});

describe('world registry source', () => {
  it('searches by name, skips the live status on request and reports a failed read', async () => {
    ui.get.mockResolvedValueOnce({ status: 'success', data: { data: [{ name: 'Nameless' }], total: 1 } });
    const { data } = await defaultInstanceProvider({ liveStatus: false, search: 'name', page: 2, limit: 5 });
    expect(ui.get.mock.calls[0][0]).toMatchObject({ page: 2, limit: 5, filterModel: { name: { filter: 'name' } } });
    expect(data[0]).toMatchObject({ name: 'Nameless', thumbnailUrl: '/assets/ui-icons/world-default-forest-city.png' });

    ui.get.mockResolvedValueOnce({ status: 'error', message: 'denied' });
    await expect(defaultInstanceProvider()).rejects.toThrow('denied');
    ui.get.mockResolvedValueOnce(null);
    await expect(defaultInstanceProvider()).rejects.toThrow('Could not load instances');
  });

  it('names an instance without a code or a name, and keeps only real tags', () => {
    expect(normalizeInstance({ tags: ['a', '', null, 'b'] })).toMatchObject({
      name: 'Unknown Instance',
      tags: ['a', 'b'],
    });
    expect(normalizeInstance({ code: 'c', tags: 'not-a-list' }).tags).toEqual([]);
  });
});
