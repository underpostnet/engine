import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import Underpost from '../../../../src/index.js';
import { shellHarness } from '../../../support/shell-harness.js';

const deployId = 'dd-route-test';
const conf = `engine-private/conf/${deployId}`;
const build = `${conf}/build/development`;
const SITE = 'www.example.test';
const APP = 'app.example.test';

let cwd;
let fixture;

const confServer = (siteRoutes, site = {}) => ({
  [SITE]: {
    '/': { client: 'site', runtime: 'nodejs', apis: [], proxy: [80, 443], pathRoutes: siteRoutes, ...site },
  },
  [APP]: { '/': { client: 'app', runtime: 'nodejs', apis: ['user'], ws: 'core', proxy: [80, 443] } },
});

const ROUTES = [
  { id: 'app-views', match: { kind: 'client-views', exclude: ['/'] }, destination: { host: APP } },
  { id: 'app-api', match: { kind: 'api' }, destination: { host: APP } },
  { id: 'app-socket', match: { kind: 'ws' }, destination: { host: APP } },
];

const writeFixture = ({ siteRoutes = ROUTES, siteSSR, site } = {}) => {
  fs.outputJsonSync(`${conf}/conf.server.json`, confServer(siteRoutes, site));
  fs.outputJsonSync(`${conf}/conf.client.json`, {
    site: { publicCopyNonExistingFiles: 'app', views: [{ path: '/', client: 'Site', ssr: 'Site' }] },
    app: {
      views: [
        { path: '/', client: 'App', ssr: 'App' },
        { path: '/log-in', client: 'App', ssr: 'App' },
      ],
    },
  });
  fs.outputJsonSync(`${conf}/conf.ssr.json`, {
    Site: {
      views: siteSSR ?? [
        { path: '/maintenance', client: 'Maintenance', maintenanceDefault: true },
        { path: '/404', client: 'NotFound' },
      ],
    },
    App: { views: [{ path: '/404', client: 'NotFound' }] },
  });
};

const httpRoute = (host) =>
  fs
    .readFileSync(`${build}/httproute.yaml`, 'utf8')
    .split('\n---\n')
    .find((doc) => doc.includes(`- ${host}\n`));

const buildManifest = () =>
  Underpost.deploy.buildManifest(deployId, 'development', { versions: 'blue', replicas: 1, disableHttp3: true });

beforeEach(() => {
  cwd = process.cwd();
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'path-routes-manifest-'));
  process.chdir(fixture);
  fs.outputJsonSync('package.json', { version: '1.0.0' });
  fs.outputJsonSync(`${conf}/conf.volume.json`, []);
  fs.outputJsonSync('engine-private/deploy/conf.cluster.json', {
    environments: { development: { profile: 'legacy', tls: { mode: 'none' } } },
  });
  shellHarness();
  vi.spyOn(Underpost.deploy, 'routerFactory').mockResolvedValue({
    [SITE]: 'http://localhost:3001',
    [APP]: 'http://localhost:3002',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(cwd);
  fs.removeSync(fixture);
});

describe('path routes in the deploy manifests', () => {
  it('sends service paths straight to the destination port, and leaves documents to the gateway', async () => {
    writeFixture();
    await buildManifest();
    const route = httpRoute(SITE);
    expect(route).toMatch(
      /type: PathPrefix\n\s+value: \/api\/v1\n[\s\S]*?- name: dd-route-test-development-traffic-service\n\s+port: 3002/,
    );
    expect(route).toMatch(/value: \/socket\.io\n[\s\S]*?port: 3002/);
    expect(route).not.toContain('value: /log-in');

    const block = fs.readFileSync(`${build}/gateway-conf.d/${SITE}.conf`, 'utf8');
    expect(block).toContain('location = /log-in {');
    expect(block).toContain('location /log-in/ {');
    expect(block).toMatch(/location \/log-in\/ \{[\s\S]*?:3002;[\s\S]*?error_page 404 @status_root_404;/);
    expect(block).not.toContain('location = /api/v1');
    // The documents of the visitor's host answer an intercepted error, once.
    expect(block.match(/location @status_root_404 \{/g)).toHaveLength(1);
  });

  it('routes every match to the destination when the host intercepts nothing', async () => {
    // A database makes the host no static site, so nothing sends it through the gateway.
    writeFixture({ siteSSR: [], site: { db: { provider: 'mongoose' } } });
    await buildManifest();
    const route = httpRoute(SITE);
    expect(route).toMatch(/value: \/launch|value: \/log-in/);
    expect(route).toMatch(/value: \/log-in\n[\s\S]*?port: 3002/);
    expect(fs.existsSync(`${build}/gateway-conf.d/${SITE}.conf`)).toBe(false);
  });

  it('serves a static site from the gateway volume first, and its workload when the volume lacks a file', async () => {
    writeFixture({ siteSSR: [] });
    await buildManifest();
    expect(httpRoute(SITE)).toMatch(/value: \/\n\s+backendRefs:\n\s+- name: underpost-gateway-service/);
    const block = fs.readFileSync(`${build}/gateway-conf.d/${SITE}.conf`, 'utf8');
    expect(block).toContain(`try_files /${SITE}/root/site$uri/index.html /${SITE}/root/site$uri @site_root;`);
    expect(block).toMatch(/location @site_root \{[\s\S]*?:3001;/);
    expect(block).toContain('location /log-in/ {');
  });

  it('answers a redirect route at the gateway with a 308 to the destination host, before any workload', async () => {
    // A database makes the host no static site: the redirect alone sends it through the gateway.
    writeFixture({
      siteSSR: [],
      site: { db: { provider: 'mongoose' } },
      siteRoutes: [{ ...ROUTES[0], redirect: true }],
    });
    await buildManifest();
    const route = httpRoute(SITE);
    expect(route).toMatch(/value: \/\n\s+backendRefs:\n\s+- name: underpost-gateway-service/);
    expect(route).not.toContain('value: /log-in');
    const block = fs.readFileSync(`${build}/gateway-conf.d/${SITE}.conf`, 'utf8');
    // The environment terminates no TLS: the visitor reaches the destination over plain HTTP.
    expect(block).toMatch(
      /location = \/log-in \{\n\s+add_header Cache-Control 'no-cache' always;\n\s+return 308 http:\/\/app\.example\.test\$request_uri;/,
    );
    expect(block).toMatch(/location \/log-in\/ \{\n[^}]*return 308 http:\/\/app\.example\.test\$request_uri;/);
    expect(block.match(/return 308/g)).toHaveLength(2);
  });

  it('refuses the build when a route captures a document of the host', async () => {
    writeFixture({ siteRoutes: [{ id: 'all', match: { kind: 'client-views' }, destination: { host: APP } }] });
    await expect(buildManifest()).rejects.toThrow(/route "all" captures \//);
  });
});
