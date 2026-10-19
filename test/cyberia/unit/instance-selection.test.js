import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ui = vi.hoisted(() => ({ nodes: new Map(), htmls: vi.fn(), pager: vi.fn(), get: vi.fn() }));
vi.mock('../../../src/client/components/core/Css.js', () => ({ ThemeEvents: {}, darkTheme: false }));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));
vi.mock('../../../src/client/components/core/NotificationManager.js', () => ({ NotificationManager: {} }));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  htmls: ui.htmls,
  s: (selector) => ui.nodes.get(selector),
  htmlStrSanitize: (text) => text,
}));
vi.mock('../../../src/client/components/core/Router.js', () => ({ getProxyPath: () => '/' }));
vi.mock('../../../src/client/components/core/ListPager.js', () => ({
  ListPager: { instance: ui.pager, load: vi.fn(), search: vi.fn() },
}));
vi.mock('../../../src/client/services/core/core.service.js', () => ({ getApiBaseUrl: (url) => url }));
vi.mock('../../../src/client/services/cyberia-instance/cyberia-instance.service.js', () => ({
  CyberiaInstanceService: { get: ui.get },
}));
vi.mock('../../../src/client/components/cyberia/GameLaunchCyberia.js', () => ({
  gameServerUrl: (code) => `https://server.test/${code}`,
  launchWorld: vi.fn(),
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
