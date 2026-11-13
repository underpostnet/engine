import { describe, expect, it } from 'vitest';
import {
  capturesPath,
  matchPathRoute,
  pathRoutePlan,
  resolvePathRoutes,
  routingHostsOf,
} from '../../../src/server/network/path-routes.js';

const SITE = 'www.example.test';
const APP = 'app.example.test';

const confClient = {
  site: { publicCopyNonExistingFiles: 'app', views: [{ path: '/', client: 'Site', ssr: 'Site' }] },
  app: {
    components: { core: ['Router'] },
    services: ['user'],
    dists: [
      { folder: './node_modules/a', public_folder: '/dist/a' },
      { styles: './node_modules/b/css', public_styles_folder: '/styles/b' },
    ],
    views: [
      { path: '/', client: 'App', ssr: 'App' },
      { path: '/log-in', client: 'App', ssr: 'App' },
      { path: '/settings', client: 'App', ssr: 'App' },
    ],
  },
};

const confSSR = {
  Site: {
    views: [
      { path: '/maintenance', client: 'Maintenance', maintenanceDefault: true },
      { path: '/404', client: 'NotFound' },
    ],
  },
  App: {
    views: [
      { path: '/offline', client: 'NoNetworkConnection', offlineDefault: true },
      { path: '/maintenance', client: 'Maintenance', maintenanceDefault: true },
      { path: '/404', client: 'NotFound' },
      { path: '/launch', client: 'Launch' },
    ],
  },
};

const confServerOf = (pathRoutes, app = {}) => ({
  [SITE]: { '/': { client: 'site', apis: [], pathRoutes } },
  [APP]: { '/': { client: 'app', apis: ['user', 'ticket', 'admin'], ws: 'core', ...app } },
  'example.test': { '/': { client: null, redirect: `https://${SITE}` } },
});

const resolve = (pathRoutes, app) =>
  resolvePathRoutes({ confServer: confServerOf(pathRoutes, app), confClient, confSSR, host: SITE, path: '/' });

const route = (id, match, destination = { host: APP }) => ({ id, match, destination });

describe('path routes', () => {
  it('resolves nothing for a host path that declares none', () => {
    expect(resolvePathRoutes({ confServer: { [SITE]: { '/': {} } }, host: SITE, path: '/' })).toEqual([]);
  });

  it('matches by path element, as Gateway API does', () => {
    expect(capturesPath({ type: 'PathPrefix', path: '/log-in' }, '/log-in')).toBe(true);
    expect(capturesPath({ type: 'PathPrefix', path: '/log-in' }, '/log-in/x')).toBe(true);
    expect(capturesPath({ type: 'PathPrefix', path: '/log-in' }, '/log-inx')).toBe(false);
    expect(capturesPath({ type: 'PathPrefix', path: '/' }, '/anything')).toBe(true);
    expect(capturesPath({ type: 'Exact', path: '/log-in' }, '/log-in/x')).toBe(false);
  });

  it('generates the document routes of the destination client, without its edge documents', () => {
    const [views] = resolve([route('views', { kind: 'client-views', exclude: ['/'] })]);
    expect(views.destination).toEqual({ host: APP, path: '/' });
    expect(views.matches.map((match) => match.path)).toEqual(['/launch', '/log-in', '/settings']);
    expect(views.matches.every((match) => match.type === 'PathPrefix' && !match.service)).toBe(true);
  });

  it('derives the asset, API and socket paths from the destination configuration', () => {
    const [assets, api, ws] = resolve([
      route('assets', { kind: 'client-assets' }),
      route('api', { kind: 'api' }),
      route('ws', { kind: 'ws' }),
    ]);
    expect(assets.matches.map((match) => match.path)).toEqual(['/components', '/dist', '/services', '/styles']);
    expect(api.matches).toEqual([{ type: 'PathPrefix', path: '/api/v1', service: true }]);
    expect(ws.matches).toEqual([{ type: 'PathPrefix', path: '/socket.io', service: true }]);
  });

  it('marks an explicit path under the destination API as a service match', () => {
    const [exact, prefix] = resolve([
      route('openapi', { kind: 'Exact', path: '/api/v1/openapi.json' }),
      route('api-docs', { kind: 'PathPrefix', path: '/api-docs' }),
    ]);
    expect(exact.matches).toEqual([{ type: 'Exact', path: '/api/v1/openapi.json', service: true }]);
    expect(prefix.matches).toEqual([{ type: 'PathPrefix', path: '/api-docs', service: false }]);
  });

  it('prefixes the paths of a destination under a sub-path', () => {
    const confServer = {
      [SITE]: { '/': { client: 'site', pathRoutes: [route('api', { kind: 'api' }, { host: APP, path: '/v' })] } },
      [APP]: { '/v': { client: 'app', apis: ['user'] } },
    };
    const [api] = resolvePathRoutes({ confServer, confClient, confSSR, host: SITE, path: '/' });
    expect(api.matches[0].path).toBe('/v/api/v1');
  });

  it('refuses a route that captures a document of the host itself', () => {
    expect(() => resolve([route('views', { kind: 'client-views' })])).toThrow(
      /route "views" captures \/, \/maintenance, \/404, which www\.example\.test\/ serves itself; exclude it/,
    );
    expect(() => resolve([route('all', { kind: 'PathPrefix', path: '/' })])).toThrow(
      /captures \/, \/maintenance, \/404/,
    );
  });

  it('refuses two routes that declare the same match', () => {
    expect(() =>
      resolve([route('a', { kind: 'PathPrefix', path: '/x' }), route('b', { kind: 'PathPrefix', path: '/x' })]),
    ).toThrow(/routes "a" and "b" both match PathPrefix \/x/);
  });

  it.each([
    [[route('Bad Id', { kind: 'api' })], /needs an id/],
    [[route('a', { kind: 'api' }), route('a', { kind: 'ws' })], /repeats an id/],
    [[route('a', { kind: 'Regex', path: '/x' })], /needs a match of kind/],
    [[route('a', { kind: 'PathPrefix', path: 'x' })], /"x" is not an absolute path/],
    [[route('a', { kind: 'PathPrefix', path: '/a/../b' })], /dot segment/],
    [[route('a', { kind: 'PathPrefix', path: '/x/' })], /not an absolute path/],
    [[route('a', { kind: 'api', exclude: [] })], /match api has unknown keys exclude/],
    [[{ ...route('a', { kind: 'api' }), rewrite: '/' }], /has unknown keys rewrite/],
    [[route('a', { kind: 'api' }, { host: APP, path: '/', rewrite: 'x' })], /destination has unknown keys rewrite/],
    [[route('a', { kind: 'api' }, { host: 'other.test' })], /no host path of this deploy/],
    [[route('a', { kind: 'PathPrefix', path: '/x' }, { host: SITE })], /routes to its own host path/],
    [[route('a', { kind: 'PathPrefix', path: '/x' }, { host: 'example.test' })], /only redirects/],
    [[route('a', { kind: 'client-views', exclude: ['/', '/nope'] })], /exclude names paths .* \/nope/],
  ])('refuses an invalid declaration %#', (pathRoutes, error) => {
    expect(() => resolve(pathRoutes)).toThrow(error);
  });

  it('refuses routed views when the host client does not build their public tree', () => {
    const confServer = confServerOf([route('views', { kind: 'client-views', exclude: ['/'] })]);
    const lacking = { ...confClient, site: { views: confClient.site.views } };
    expect(() => resolvePathRoutes({ confServer, confClient: lacking, confSSR, host: SITE, path: '/' })).toThrow(
      /the views need the public tree app/,
    );
  });

  it('redirects the views of the destination without needing their public tree on the host', () => {
    const confServer = confServerOf([{ ...route('views', { kind: 'client-views', exclude: ['/'] }), redirect: true }]);
    const lacking = { ...confClient, site: { views: confClient.site.views } };
    const [views] = resolvePathRoutes({ confServer, confClient: lacking, confSSR, host: SITE, path: '/' });
    expect(views).toMatchObject({ id: 'views', redirect: true, destination: { host: APP, path: '/' } });
    expect(views.matches.map((match) => match.path)).toEqual(['/launch', '/log-in', '/settings']);
  });

  it('refuses a redirect that would move an API or socket request to another origin', () => {
    expect(() => resolve([{ ...route('apis', { kind: 'client-apis' }), redirect: true }])).toThrow(
      /route "apis": redirects \/api\/v1\/user, under the API or socket path of app\.example\.test\/: a redirect takes documents only/,
    );
    expect(() => resolve([{ ...route('ws', { kind: 'ws' }), redirect: true }])).toThrow(
      /a redirect takes documents only/,
    );
    expect(() => resolve([{ ...route('views', { kind: 'client-views', exclude: ['/'] }), redirect: 'yes' }])).toThrow(
      /redirect must be true or false/,
    );
  });

  it('refuses a kind the destination cannot serve', () => {
    expect(() => resolve([route('a', { kind: 'api' })], { apis: [] })).toThrow(/serves no API/);
    expect(() => resolve([route('a', { kind: 'ws' })], { ws: undefined })).toThrow(/serves no socket/);
    expect(() => resolve([route('a', { kind: 'client-views' })], { client: null })).toThrow(/serves no client/);
    expect(() => resolve([route('a', { kind: 'api' })], { singleReplica: true })).toThrow(/runs as its own deploy/);
  });

  it('reports every defect at once', () => {
    let error;
    try {
      resolve([route('a', { kind: 'api' }, { host: 'other.test' }), route('b', { kind: 'Regex' })]);
    } catch (thrown) {
      error = thrown;
    }
    expect(error.message.split('\n')).toHaveLength(2);
  });

  it('keeps the routes of a sub-path host path inside that sub-path', () => {
    const confServer = {
      [SITE]: { '/site': { client: null, pathRoutes: [route('a', { kind: 'PathPrefix', path: '/other' })] } },
      [APP]: { '/': { client: 'app' } },
    };
    expect(() => resolvePathRoutes({ confServer, confClient, confSSR, host: SITE, path: '/site' })).toThrow(
      /routes paths outside \/site: \/other/,
    );
  });

  it('routes the APIs the destination client calls, and the ones it includes', () => {
    const [apis] = resolve([route('apis', { kind: 'client-apis', include: ['ticket'] })]);
    expect(apis.matches).toEqual([
      { type: 'PathPrefix', path: '/api/v1/ticket', service: true },
      { type: 'PathPrefix', path: '/api/v1/user', service: true },
    ]);
    expect(() => resolve([route('apis', { kind: 'client-apis', include: ['nope'] })])).toThrow(
      /include names APIs the destination does not mount: nope/,
    );
    expect(() => resolve([route('apis', { kind: 'client-apis', include: ['user'] })])).toThrow(
      /include names APIs the client already calls: user/,
    );
    expect(() => resolve([route('apis', { kind: 'client-apis', include: 'ticket' })])).toThrow(
      /include must be an array of API ids/,
    );
  });

  it('refuses routes on a host path that only redirects', () => {
    const confServer = { [SITE]: { '/': { redirect: 'https://x.test', pathRoutes: [] } } };
    expect(() => resolvePathRoutes({ confServer, host: SITE, path: '/' })).toThrow(/only redirects routes no path/);
  });

  describe('route plan', () => {
    const plan = () =>
      pathRoutePlan({
        confServer: confServerOf([
          route('views', { kind: 'client-views', exclude: ['/'] }),
          route('apis', { kind: 'client-apis' }),
          route('ws', { kind: 'ws' }),
          route('document', { kind: 'Exact', path: '/api/v1/user/document' }),
        ]),
        confClient,
        confSSR,
        host: SITE,
        path: '/',
        ports: { [`${APP}/`]: 4004, [`${SITE}/`]: 4006 },
      });

    it('gives each match its destination port, protocol and precedence', () => {
      const entries = plan();
      expect(entries[0]).toEqual({
        route: 'document',
        kind: 'Exact',
        match: { type: 'Exact', path: '/api/v1/user/document' },
        service: true,
        redirect: false,
        protocol: 'http',
        destination: { host: APP, path: '/', port: 4004 },
      });
      expect(entries.find((entry) => entry.route === 'ws').protocol).toBe('websocket');
      const prefixes = entries.filter((entry) => entry.match.type === 'PathPrefix').map((entry) => entry.match.path);
      expect(prefixes).toEqual([...prefixes].sort((a, b) => b.length - a.length || a.localeCompare(b)));
    });

    it('matches a request by its path, element by element, without its query', () => {
      const entries = plan();
      expect(matchPathRoute(entries, '/log-in/?play=a').route).toBe('views');
      expect(matchPathRoute(entries, '/log-in')).toMatchObject({ route: 'views', destination: { port: 4004 } });
      expect(matchPathRoute(entries, '/api/v1/user/document').route).toBe('document');
      expect(matchPathRoute(entries, '/api/v1/user/x').route).toBe('apis');
      expect(matchPathRoute(entries, '/a/../launch').route).toBe('views');
      expect(matchPathRoute(entries, '/log-inx')).toBeUndefined();
      expect(matchPathRoute(entries, '/LOG-IN')).toBeUndefined();
      expect(matchPathRoute(entries, '/')).toBeUndefined();
    });

    it('refuses a destination without a port', () => {
      expect(() =>
        pathRoutePlan({
          confServer: confServerOf([route('apis', { kind: 'client-apis' })]),
          confClient,
          confSSR,
          host: SITE,
          path: '/',
          ports: {},
        }),
      ).toThrow(/route "apis" finds no port of app\.example\.test\//);
    });

    it('names the hosts whose routes reach a host path', () => {
      const confServer = confServerOf([route('apis', { kind: 'client-apis' })]);
      expect(routingHostsOf({ confServer, confClient, confSSR, host: APP })).toEqual([SITE]);
      expect(routingHostsOf({ confServer, confClient, confSSR, host: SITE })).toEqual([]);
    });

    it('marks every match of a redirect route, which reaches no workload through the host', () => {
      const confServer = confServerOf([
        { ...route('views', { kind: 'client-views', exclude: ['/'] }), redirect: true },
      ]);
      const entries = pathRoutePlan({
        confServer,
        confClient,
        confSSR,
        host: SITE,
        path: '/',
        ports: { [`${APP}/`]: 4004 },
      });
      expect(entries.every((entry) => entry.redirect && !entry.service && entry.protocol === 'http')).toBe(true);
      expect(matchPathRoute(entries, '/log-in/?play=a')).toMatchObject({ route: 'views', redirect: true });
      expect(routingHostsOf({ confServer, confClient, confSSR, host: APP })).toEqual([]);
    });
  });
});
