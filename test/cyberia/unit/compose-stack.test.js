import { describe, it, expect, vi } from 'vitest';
import NginxService from '../../../src/runtime/nginx/nginx.js';
import Underpost from '../../../src/index.js';

// Ports run from PORT+1 in declaration order: portal 4001, docs 4002 and its peer 4003, www 4004.
const CONF_SERVER = {
  'portal.test': { '/': { apis: ['cyberia-instance'] } },
  'docs.test': { '/': { apis: [], peer: true } },
  'www.portal.test': { '/': {} },
};
const BASE_PORTS = { development: 4000, production: 3000 };

vi.mock(import('../../../src/server/runtime/conf.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  loadConfServerJson: vi.fn(() => CONF_SERVER),
}));

vi.mock(import('../../../src/server/network/router.js'), async (importOriginal) => {
  const router = await importOriginal();
  return {
    ...router,
    deployHostPortsFactory: vi.fn((deployId, env) => router.hostPortsFactory(CONF_SERVER, BASE_PORTS[env] + 1)),
  };
});

const { composeStacks, cyberiaComposeStack, gatewayHostAliases } =
  await import('../../../src/projects/cyberia/compose-stack.js');
const { RELEASE_CONTENT } = await import('../../../src/projects/cyberia/content/release-content.js');
const { deployHostPortsFactory } = await import('../../../src/server/network/router.js');

const generate = (env = 'development') => {
  const nginx = new NginxService();
  const compose = cyberiaComposeStack({ deployId: 'dd-fixture', env, nginx });
  return { compose, services: compose.services, nginx: nginx.render() };
};

const locationOf = (conf, match) => {
  const start = conf.indexOf(`location ${match} {`);
  return start < 0 ? '' : conf.slice(start, conf.indexOf('\n    }', start));
};

describe('the dd-cyberia compose stack', () => {
  it('is the stack its docker-compose id names', () => {
    expect(composeStacks.cyberia).toBe(cyberiaComposeStack);
  });

  it('runs one game server and one game client per release instance', () => {
    const { services } = generate();
    const [main, test] = RELEASE_CONTENT.instances;
    expect(services['cyberia-server-runtime'].environment).toMatchObject({
      INSTANCE_CODE: main.instanceCode,
      CYBERIA_BASE_PATH: '/',
    });
    expect(services['cyberia-server-test'].environment).toMatchObject({
      INSTANCE_CODE: test.instanceCode,
      CYBERIA_BASE_PATH: '/test',
      CYBERIA_PUBLIC_URL: '${CYBERIA_SERVER_PUBLIC_ORIGIN:-http://localhost:8081}/test',
    });
    expect(services['cyberia-client-test'].environment.CYBERIA_INSTANCE_CODE).toBe(test.instanceCode);
    expect(services['cyberia-server-test'].container_name).toBe('dd-fixture-server-test');
    expect(services['cyberia-server-test'].healthcheck.test[1]).toContain(':8081/test/api/v1/health/ready');
  });

  it('starts each client after its own server, and every server after the content import and the universe seed', () => {
    const { services } = generate();
    const completed = { condition: 'service_completed_successfully' };
    expect(services['cyberia-client-test'].depends_on).toEqual({
      'cyberia-server-test': { condition: 'service_healthy' },
    });
    for (const server of ['cyberia-server-runtime', 'cyberia-server-test'])
      expect(services[server].depends_on['engine-cyberia-universe']).toEqual(completed);
    // A development bootstrap, no release: the ordered artifact import into the workspace, then the universe.
    const steps = {
      'engine-cyberia-content': [
        ['content', 'workspace', 'import'],
        { 'engine-cyberia-runtime': { condition: 'service_healthy' } },
      ],
      'engine-cyberia-universe': [['run-workflow', 'seed-universe'], { 'engine-cyberia-content': completed }],
    };
    for (const [name, [args, dependsOn]] of Object.entries(steps)) {
      const step = services[name];
      expect(step.image, name).toBe(services['engine-cyberia-runtime'].image);
      expect(step.network_mode, name).toBe('service:engine-cyberia-runtime');
      expect(step.command, name).toEqual(['node', 'bin/cyberia', ...args]);
      expect(step.depends_on, name).toEqual(dependsOn);
      expect(step.environment, name).toEqual(services['engine-cyberia-runtime'].environment);
      expect(step.restart, name).toBe('no');
    }
    expect(services['engine-cyberia-runtime'].command).toBeUndefined();
  });

  it('publishes every engine port as one block and probes the data-plane host', () => {
    const { services } = generate();
    const engine = services['engine-cyberia-runtime'];
    expect(engine.ports[0]).toBe('4001-4004:4001-4004');
    expect(engine.expose).toEqual(['4001-4004', '50051']);
    expect(engine.healthcheck.test[1]).toContain('/dev/tcp/127.0.0.1/4001');
  });

  it('starts the engine ports at the base port of the deploy env of the stack', () => {
    const { services } = generate('production');
    expect(deployHostPortsFactory).toHaveBeenLastCalledWith('dd-fixture', 'production');
    expect(services['engine-cyberia-runtime'].ports[0]).toBe('3001-3004:3001-3004');
  });

  it('routes every domain to its own engine port and an unknown host to the data plane', () => {
    const { nginx } = generate();
    const map = nginx.slice(nginx.indexOf('map $host $engine_upstream {'));
    const routed = Object.fromEntries(
      [...map.slice(0, map.indexOf('}')).matchAll(/^\s+(\S+)\s+engine-cyberia-runtime:(\d+);$/gm)].map(
        ([, host, port]) => [host, Number(port)],
      ),
    );
    expect(routed).toEqual({ default: 4001, 'portal.test': 4001, 'docs.test': 4002, 'www.portal.test': 4004 });
    expect(nginx).toContain('server_name portal.test docs.test www.portal.test;');
    expect(nginx).toContain('resolver 127.0.0.11');
  });

  it('serves each world on the client and server gateways by its path', () => {
    const { nginx } = generate();
    for (const match of ['/api/', '/assets/'])
      expect(locationOf(nginx, match), match).toContain('engine-cyberia-runtime:4001;');
    expect(locationOf(nginx, '= /ws')).toContain('cyberia-server-runtime:8081;');
    expect(locationOf(nginx, '= /test/ws')).toContain('cyberia-server-test:8081;');
    expect(locationOf(nginx, '= /test')).toContain('return 301 /test/;');
    const serverGateway = nginx.slice(nginx.indexOf('server_name cyberia-server'));
    expect(locationOf(serverGateway, '^~ /test/')).toContain('cyberia-server-test:8081;');
    expect(locationOf(serverGateway, '/')).toContain('cyberia-server-runtime:8081;');
    expect(nginx).toContain('listen 8081 default_server;');
  });

  it('resolves every gateway name and domain to the proxy', () => {
    const { services } = generate();
    expect(services.proxy.networks['dd-fixture-internal'].aliases).toEqual(gatewayHostAliases('dd-fixture'));
    expect(gatewayHostAliases('dd-fixture')).toEqual([
      'cyberia-client',
      'cyberia-server',
      'engine-cyberia',
      'portal.test',
      'docs.test',
      'www.portal.test',
    ]);
  });

  it('defaults to the dev images in development and to the release images in production', () => {
    const dev = generate().services;
    expect(dev['engine-cyberia-runtime'].image).toBe(
      `\${ENGINE_CYBERIA_IMAGE:-underpost/engine-cyberia-dev}:\${ENGINE_CYBERIA_TAG:-${Underpost.version}}`,
    );
    const prod = generate('production').services;
    expect(prod['cyberia-client-runtime'].image).toBe(
      `\${CYBERIA_CLIENT_IMAGE:-underpost/cyberia-client}:\${CYBERIA_CLIENT_TAG:-${Underpost.version}}`,
    );
    expect(prod['engine-cyberia-runtime'].environment.NODE_ENV).toBe('${NODE_ENV:-production}');
    expect(prod['cyberia-server-runtime'].environment.APP_ENV).toBe('${CYBERIA_SERVER_APP_ENV:-production}');
  });

  it('refuses a conf whose domains serve no Cyberia data plane', () => {
    const portal = CONF_SERVER['portal.test'];
    CONF_SERVER['portal.test'] = { '/': { apis: [] } };
    try {
      expect(() => generate()).toThrow('no domain serves the cyberia-instance API');
    } finally {
      CONF_SERVER['portal.test'] = portal;
    }
  });
});
