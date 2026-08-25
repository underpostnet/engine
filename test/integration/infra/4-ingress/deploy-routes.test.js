'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  DEPLOY_ROUTES_PATH,
  buildKindPorts,
  buildPortProxyRouter,
  buildProxyRouter,
  deployRangePortFactory,
  deployRoutesExists,
  parseDeployRoutes,
  pathPortAssignmentFactory,
  readDeployRoutes,
  registerDeployRoute,
  resolveDeployList,
} from '../../../../src/server/network/router.js';
import { Config } from '../../../../src/server/runtime/conf.js';

describe('DEPLOY_ROUTES_PATH', () => {
  it('names the route table by what it holds — a list of routes', () => {
    expect(DEPLOY_ROUTES_PATH).to.equal('./engine-private/deploy/dd.routes');
  });
});

describe('parseDeployRoutes', () => {
  it('reads the comma separated table', () => {
    expect(parseDeployRoutes('dd-core,dd-cyberia,dd-test')).to.deep.equal(['dd-core', 'dd-cyberia', 'dd-test']);
  });

  it('tolerates the whitespace and trailing newline a hand-edited table carries', () => {
    expect(parseDeployRoutes(' dd-core , dd-cyberia ,\n')).to.deep.equal(['dd-core', 'dd-cyberia']);
  });

  it('drops empty entries rather than yielding a deploy id of ""', () => {
    // A trailing comma used to produce an empty id, which every `dd` fan-out
    // then resolved to `./engine-private/conf//conf.server.json`.
    expect(parseDeployRoutes('dd-core,,dd-test,')).to.deep.equal(['dd-core', 'dd-test']);
  });

  it('treats a missing or empty table as no routes at all', () => {
    expect(parseDeployRoutes('')).to.deep.equal([]);
    expect(parseDeployRoutes()).to.deep.equal([]);
    expect(parseDeployRoutes(null)).to.deep.equal([]);
  });

  it('preserves declaration order, which is the order deploys are rolled out in', () => {
    expect(parseDeployRoutes('dd-lampp,dd-cyberia,dd-core')).to.deep.equal(['dd-lampp', 'dd-cyberia', 'dd-core']);
  });
});

// The route table is a real file in the private repository this checkout may or
// may not carry, so every case here stubs the filesystem rather than writing to
// the path an engine actually deploys from.
describe('deploy route table', () => {
  const stubRouteTable = (contents) => {
    const written = { path: '', contents: '' };
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => contents !== null && filePath === DEPLOY_ROUTES_PATH);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => contents);
    vi.spyOn(fs, 'outputFileSync').mockImplementation((filePath, value) => {
      written.path = `${filePath}`;
      written.contents = `${value}`;
    });
    return written;
  };

  afterEach(() => vi.restoreAllMocks());

  it('reports the table present only when the file is there', () => {
    stubRouteTable('dd-core');
    expect(deployRoutesExists()).to.equal(true);
    vi.restoreAllMocks();
    stubRouteTable(null);
    expect(deployRoutesExists()).to.equal(false);
  });

  it('reads the routed deploy ids', () => {
    stubRouteTable('dd-core, dd-cyberia\n');
    expect(readDeployRoutes()).to.deep.equal(['dd-core', 'dd-cyberia']);
  });

  it('reads no routes at all without a table', () => {
    stubRouteTable(null);
    expect(readDeployRoutes()).to.deep.equal([]);
  });

  it('appends a new deploy id to the table', () => {
    const written = stubRouteTable('dd-core');
    expect(registerDeployRoute('dd-cyberia')).to.deep.equal(['dd-core', 'dd-cyberia']);
    expect(written.path).to.equal(DEPLOY_ROUTES_PATH);
    expect(written.contents).to.equal('dd-core,dd-cyberia');
  });

  it('creates the table when the engine has none', () => {
    const written = stubRouteTable(null);
    expect(registerDeployRoute('dd-core')).to.deep.equal(['dd-core']);
    expect(written.contents).to.equal('dd-core');
  });

  it('leaves an already routed deploy alone rather than building it twice', () => {
    const written = stubRouteTable('dd-core,dd-cyberia');
    expect(registerDeployRoute(' dd-cyberia ')).to.deep.equal(['dd-core', 'dd-cyberia']);
    expect(written.path).to.equal('');
  });

  it('writes nothing for an empty deploy id', () => {
    const written = stubRouteTable('dd-core');
    expect(registerDeployRoute('  ')).to.deep.equal(['dd-core']);
    expect(registerDeployRoute()).to.deep.equal(['dd-core']);
    expect(written.path).to.equal('');
  });

  it('fans the dd meta id out to the whole table', () => {
    stubRouteTable('dd-core,dd-cyberia');
    expect(resolveDeployList('dd')).to.deep.equal(['dd-core', 'dd-cyberia']);
  });

  it('falls back to the default deploy when no table is checked out', () => {
    stubRouteTable(null);
    expect(resolveDeployList('dd')).to.deep.equal(['dd-default']);
  });

  it('parses any other selector as a literal list', () => {
    stubRouteTable('dd-core');
    expect(resolveDeployList('dd-a,dd-b')).to.deep.equal(['dd-a', 'dd-b']);
  });
});

describe('proxy router construction', () => {
  const CONF_SERVER = {
    'app.fixture.test': {
      '/': { proxy: [80, 443], client: 'App', peer: true },
      '/admin': { proxy: [443], client: 'Admin', redirect: 'https://admin.fixture.test' },
    },
    'single.fixture.test': {
      '/': { proxy: [80], singleReplica: true },
    },
  };

  let previousServer;
  let previousPort;

  beforeEach(() => {
    previousServer = Config.default.server;
    previousPort = process.env.PORT;
    Config.default.server = JSON.parse(JSON.stringify(CONF_SERVER));
    process.env.PORT = '3000';
  });

  afterEach(() => {
    Config.default.server = previousServer;
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    vi.restoreAllMocks();
  });

  it('assigns one ascending port per served path and keys it by proxy port', () => {
    const proxyRouter = buildProxyRouter();
    expect(Object.keys(proxyRouter).sort()).to.deep.equal(['443', '80']);
    expect(proxyRouter[80]['app.fixture.test/'].target).to.equal('http://localhost:3001');
    expect(proxyRouter[443]['app.fixture.test/'].target).to.equal('http://localhost:3001');
    expect(proxyRouter[443]['app.fixture.test/admin'].target).to.equal('http://localhost:3003');
    expect(proxyRouter[443]['app.fixture.test/admin'].redirect).to.equal('https://admin.fixture.test');
  });

  it('gives a peer-enabled path its own port on the next slot', () => {
    const proxyRouter = buildProxyRouter();
    expect(proxyRouter[80]['app.fixture.test/peer'].target).to.equal('http://localhost:3002');
    expect(proxyRouter[80]['app.fixture.test/peer'].path).to.equal('/peer');
  });

  it('nests the peer path under a non-root path', () => {
    Config.default.server = { 'app.fixture.test': { '/admin': { proxy: [443], peer: true } } };
    const proxyRouter = buildProxyRouter();
    expect(Object.keys(proxyRouter[443])).to.include('app.fixture.test/admin/peer');
  });

  it('leaves a single replica out of the proxy router entirely', () => {
    const proxyRouter = buildProxyRouter();
    expect(Object.keys(proxyRouter[80])).not.to.include('single.fixture.test/');
  });

  it('collapses every proxy port to the dev proxy port under a proxy invocation', () => {
    const previousArgv = process.argv;
    process.argv = [...previousArgv.slice(0, 2), 'proxy'];
    try {
      expect(Object.keys(buildProxyRouter())).to.deep.equal(['80']);
    } finally {
      process.argv = previousArgv;
    }
  });
});

describe('port proxy router', () => {
  const HOSTS = {
    'app.fixture.test/': {
      host: 'app.fixture.test',
      path: '/',
      target: 'http://localhost:3001',
      proxy: [80, 443],
    },
    'app.fixture.test/admin': {
      host: 'app.fixture.test',
      path: '/admin',
      target: 'http://localhost:3002',
      proxy: [443],
    },
  };

  afterEach(() => vi.restoreAllMocks());

  it('drops the port from the absolute host on the standard edge ports', () => {
    const router = buildPortProxyRouter({ port: 443, hosts: HOSTS });
    expect(router).to.deep.equal({
      'app.fixture.test': 'http://localhost:3001',
      'app.fixture.test/admin': 'http://localhost:3002',
    });
  });

  it('carries the port on a non standard edge port', () => {
    const router = buildPortProxyRouter({ port: 4000, hosts: { 'a/': HOSTS['app.fixture.test/'] } });
    expect(router).to.deep.equal({ 'app.fixture.test:4000': 'http://localhost:3001' });
  });

  it('reads the hosts off the proxy router when none are passed', () => {
    const router = buildPortProxyRouter({
      port: 80,
      proxyRouter: { 80: { 'app.fixture.test/': HOSTS['app.fixture.test/'] } },
    });
    expect(router).to.deep.equal({ 'app.fixture.test': 'http://localhost:3001' });
  });

  it('returns an empty router when the port serves nothing', () => {
    expect(buildPortProxyRouter({ port: 8080, proxyRouter: {} })).to.deep.equal({});
  });

  it('keeps a host whose conf omits the port outside production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const router = buildPortProxyRouter({ port: 8080, hosts: { 'a/': HOSTS['app.fixture.test/'] } });
      expect(router).to.deep.equal({ 'app.fixture.test:8080': 'http://localhost:3001' });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('omits a host whose conf omits the port in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(buildPortProxyRouter({ port: 8080, hosts: { 'a/': HOSTS['app.fixture.test/'] } })).to.deep.equal({});
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('warns and keeps the last target when two hosts resolve to one absolute host', () => {
    const router = buildPortProxyRouter({
      port: 443,
      hosts: {
        first: { ...HOSTS['app.fixture.test/'], target: 'http://localhost:3001' },
        second: { ...HOSTS['app.fixture.test/'], target: 'http://localhost:3009' },
      },
    });
    expect(router).to.deep.equal({ 'app.fixture.test': 'http://localhost:3009' });
  });

  it('rewrites the target to the app dev port under a dev proxy context', () => {
    const previous = process.env.DEV_PROXY_PORT_OFFSET;
    process.env.DEV_PROXY_PORT_OFFSET = '1000';
    try {
      const router = buildPortProxyRouter({ port: 443, hosts: HOSTS, devProxyContext: true });
      expect(router['app.fixture.test']).to.equal('http://localhost:2001');
    } finally {
      if (previous === undefined) delete process.env.DEV_PROXY_PORT_OFFSET;
      else process.env.DEV_PROXY_PORT_OFFSET = previous;
    }
  });

  it('orders the router by absolute host length so the longest path matches first', () => {
    const router = buildPortProxyRouter({ port: 443, hosts: HOSTS, orderByPathLength: true });
    expect(Object.keys(router)).to.deep.equal(['app.fixture.test/admin', 'app.fixture.test']);
  });

  it('splits the dev API host into its api and socket routes and points the bare host at the origin', () => {
    const previousEnv = process.env.NODE_ENV;
    const previousApi = process.env.BASE_API;
    const previousOffset = process.env.DEV_PROXY_PORT_OFFSET;
    const previousArgv = process.argv;
    process.env.NODE_ENV = 'development';
    process.env.BASE_API = 'api';
    process.env.DEV_PROXY_PORT_OFFSET = '0';
    process.argv = [...previousArgv.slice(0, 2), 'proxy', 'dd-fixture', 'local'];
    const devApiConf = {
      'app.fixture.test': {
        '/': { origins: ['http://localhost:5173'] },
        '/peer': { origins: [] },
      },
    };
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}`.endsWith('local-dev-api.json'));
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify(devApiConf));
    try {
      const router = buildPortProxyRouter({ port: 443, hosts: HOSTS, devProxyContext: true });
      expect(router['app.fixture.test/api']).to.equal('http://localhost:3001');
      expect(router['app.fixture.test/socket.io']).to.equal('http://localhost:3001');
      expect(router['app.fixture.test']).to.equal('http://localhost:5173');
    } finally {
      process.env.NODE_ENV = previousEnv;
      if (previousApi === undefined) delete process.env.BASE_API;
      else process.env.BASE_API = previousApi;
      if (previousOffset === undefined) delete process.env.DEV_PROXY_PORT_OFFSET;
      else process.env.DEV_PROXY_PORT_OFFSET = previousOffset;
      process.argv = previousArgv;
    }
  });
});

describe('deploy port range', () => {
  it('reports every assigned port and the range that spans them', () => {
    expect(
      deployRangePortFactory({
        'a.test': 'http://localhost:3001',
        'b.test': 'http://localhost:3005',
        'c.test': 'http://localhost:3003',
      }),
    ).to.deep.equal({ ports: [3001, 3005, 3003], fromPort: 3001, toPort: 3005 });
  });

  it('renders one TCP and one UDP entry per port in the kind service', () => {
    const yaml = buildKindPorts(3001, 3002);
    expect(yaml).to.include("- name: 'tcp-3001'");
    expect(yaml).to.include("- name: 'udp-3002'");
    expect(yaml.match(/protocol: TCP/g).length).to.equal(2);
  });
});

describe('path port assignment', () => {
  const CONF_SERVER = {
    'app.fixture.test': {
      '/': { peer: true },
      '/admin': {},
      '/unrouted': {},
    },
  };
  const ROUTER = {
    'app.fixture.test': 'http://localhost:3001',
    'app.fixture.test/admin': 'http://localhost:3003',
  };

  afterEach(() => vi.restoreAllMocks());

  it('maps each routed path to the port its runtime bound', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(await pathPortAssignmentFactory('dd-fixture', ROUTER, CONF_SERVER)).to.deep.equal({
      'app.fixture.test': [
        { port: 3001, path: '/' },
        { port: 3002, path: '/peer' },
        { port: 3003, path: '/admin' },
      ],
    });
  });

  it('appends the paths served by every single replica of the deploy', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}`.includes('./engine-private/replica'));
    vi.spyOn(fs, 'readdir').mockResolvedValue(['dd-fixture-blue', 'dd-other-green']);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ 'app.fixture.test': { '/admin': { peer: true }, '/unrouted': {} } }),
    );
    const assignment = await pathPortAssignmentFactory('dd-fixture', ROUTER, CONF_SERVER);
    expect(assignment['app.fixture.test']).to.deep.equal([
      { port: 3001, path: '/' },
      { port: 3002, path: '/peer' },
      { port: 3003, path: '/admin' },
      { port: 3003, path: '/admin' },
      { port: 3004, path: '/admin/peer' },
    ]);
  });
});
