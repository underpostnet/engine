'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import Underpost from '../../../../src/index.js';
import {
  UNDERPOST_GATEWAY,
  assertStaticAssets,
  gatewayFallbackProbeRunner,
  gatewayStaticAssetExists,
  installGatewayConf,
  instanceFallbackChecksFactory,
  placeInstanceStaticAssets,
  pwaFallbackChecksFactory,
  readHostInstanceRegistry,
  seedDefaultStatusPage,
  syncStaticAssetFromPod,
  writeHostInstanceRegistry,
  writeHostServerConf,
  writeStaticAsset,
} from '../../../../src/server/network/underpost-gateway.js';
import { shellHarness } from '../../../support/shell-harness.js';

const HOST_ROOT = '/underpost/gateway';
const CONF_DIR = '/tmp/gateway-conf-fixture';

// The gateway root is a root-owned node directory and every install talks to a
// running Nginx in the cluster. Both are replaced so the assertions are over the
// command vector and the files a run would place.
const gatewayFixture = (files = {}) => {
  const table = new Map(Object.entries(files));
  const written = new Map();
  const removed = [];
  const keys = () => [...table.keys(), ...written.keys()];

  vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    if (removed.includes(key)) return false;
    return table.has(key) || written.has(key) || keys().some((entry) => entry.startsWith(`${key}/`));
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    if (written.has(key)) return written.get(key);
    if (table.has(key)) return table.get(key);
    throw Object.assign(new Error(`ENOENT: ${key}`), { code: 'ENOENT' });
  });
  const write = (filePath, value) => {
    const key = `${filePath}`;
    const index = removed.indexOf(key);
    if (index !== -1) removed.splice(index, 1);
    written.set(key, `${value}`);
  };
  vi.spyOn(fs, 'writeFileSync').mockImplementation(write);
  vi.spyOn(fs, 'mkdirpSync').mockImplementation(() => undefined);
  vi.spyOn(fs, 'removeSync').mockImplementation((filePath) => {
    written.delete(`${filePath}`);
    removed.push(`${filePath}`);
  });
  vi.spyOn(fs, 'statSync').mockImplementation((filePath) => ({
    size: `${written.get(`${filePath}`) ?? table.get(`${filePath}`) ?? ''}`.length,
  }));
  vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
    keys()
      .filter((filePath) => filePath.startsWith(`${dir}/`))
      .map((filePath) => filePath.slice(`${dir}/`.length))
      .filter((name) => !name.includes('/')),
  );
  return { table, written, removed, write };
};

describe('gateway static assets', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  describe('placement', () => {
    it('copies a document into the root-owned gateway tree', () => {
      gatewayFixture({ './project/public/404/index.html': '<!doctype html>404\n' });
      expect(
        writeStaticAsset({
          hostRoot: HOST_ROOT,
          assetPath: 'app.test/root/status-pages/404/index.html',
          sourcePath: './project/public/404/index.html',
        }),
      ).to.equal(true);
      expect(harness.ran(`sudo cp -f ./project/public/404/index.html ${HOST_ROOT}/app.test`)).to.equal(true);
    });

    // A half-finished copy leaves an empty file behind, and serving it would
    // answer a status page with a blank body.
    it('places nothing for a missing or empty source', () => {
      gatewayFixture({ './project/public/empty.html': '' });
      expect(
        writeStaticAsset({ hostRoot: HOST_ROOT, assetPath: 'a', sourcePath: './project/public/empty.html' }),
      ).to.equal(false);
      expect(writeStaticAsset({ hostRoot: HOST_ROOT, assetPath: 'a', sourcePath: './absent.html' })).to.equal(false);
      expect(writeStaticAsset({ hostRoot: HOST_ROOT, assetPath: 'a' })).to.equal(false);
      expect(harness.ran('sudo cp')).to.equal(false);
    });

    it('treats an empty document under the gateway root as absent', () => {
      gatewayFixture({ [`${HOST_ROOT}/a/index.html`]: 'body', [`${HOST_ROOT}/b/index.html`]: '' });
      expect(gatewayStaticAssetExists({ hostRoot: HOST_ROOT, assetPath: 'a/index.html' })).to.equal(true);
      expect(gatewayStaticAssetExists({ hostRoot: HOST_ROOT, assetPath: 'b/index.html' })).to.equal(false);
      expect(gatewayStaticAssetExists({ hostRoot: HOST_ROOT, assetPath: 'c/index.html' })).to.equal(false);
    });

    // The pod is the authority: several clients are built from sources that only
    // exist inside the container.
    it('pulls a document out of the running workload through a keyed staging path', () => {
      const { write } = gatewayFixture();
      harness.route({
        match: (command) => {
          const staged = /kubectl cp \S+ (\/tmp\/underpost-gateway-\S+)/.exec(command)?.[1];
          if (staged) write(staged, '<!doctype html>from pod\n');
          return false;
        },
      });
      expect(
        syncStaticAssetFromPod({
          podName: 'app-pod',
          namespace: 'ops',
          container: 'app',
          sourcePath: '/app/public/404/index.html',
          hostRoot: HOST_ROOT,
          assetPath: 'app.test/root/status-pages/404/index.html',
        }),
      ).to.equal(true);
      expect(harness.ran('kubectl cp ops/app-pod:/app/public/404/index.html')).to.equal(true);
      expect(harness.ran('-c app')).to.equal(true);
      expect(harness.ran(`sudo cp -f /tmp/underpost-gateway-`)).to.equal(true);
    });

    it('reports nothing placed when the workload has no such document', () => {
      gatewayFixture();
      expect(
        syncStaticAssetFromPod({
          podName: 'app-pod',
          sourcePath: '/app/absent.html',
          hostRoot: HOST_ROOT,
          assetPath: 'a',
        }),
      ).to.equal(false);
      expect(harness.ran('sudo cp -f')).to.equal(false);
    });

    // A missing document is invisible at deploy time and only surfaces later as
    // a shared default page in place of the host's own.
    it('fails the deploy when a configured document reached neither pass', () => {
      gatewayFixture();
      expect(() =>
        assertStaticAssets({
          records: [{ source: null, assetPath: 'app.test/root/status-pages/404/index.html' }],
          hostRoot: HOST_ROOT,
          label: 'run instance',
        }),
      ).to.throw('missing configured assets');
    });

    it('accepts a document that either pass supplied', () => {
      gatewayFixture({ [`${HOST_ROOT}/b`]: 'body' });
      const records = [
        { source: 'project', assetPath: 'a' },
        { source: null, assetPath: 'b' },
      ];
      expect(assertStaticAssets({ records, hostRoot: HOST_ROOT, label: 'run instance' })).to.equal(records);
    });

    it('places every declared status page a set of instances carries', () => {
      gatewayFixture({ 'fixture-server/public/404/index.html': '<!doctype html>404\n' });
      vi.spyOn(Underpost.deploy, 'underpostGatewayRootFactory').mockReturnValue(HOST_ROOT);
      const records = placeInstanceStaticAssets({
        instances: [
          {
            id: 'mmo-server',
            host: 'server.fixture.test',
            path: '/',
            metadata: { repository: 'underpostnet/fixture-server' },
            customStatusPages: [{ status: '404', hostPath: './public/404/index.html' }],
          },
        ],
        options: {},
        label: 'run instance',
      });
      expect(records[0].source).to.equal('project');
    });
  });

  describe('host server blocks', () => {
    it('writes a block and reports the change', () => {
      const { written } = gatewayFixture();
      expect(writeHostServerConf({ confDir: CONF_DIR, host: 'app.test', conf: 'server {}\n' })).to.equal(true);
      expect(written.get(`${CONF_DIR}/app.test.conf`)).to.equal('server {}\n');
      expect(writeHostServerConf({ confDir: CONF_DIR, host: 'app.test', conf: 'server {}\n' })).to.equal(false);
    });

    it('removes the block when there is nothing to serve', () => {
      const { removed } = gatewayFixture({ [`${CONF_DIR}/app.test.conf`]: 'server {}\n' });
      expect(writeHostServerConf({ confDir: CONF_DIR, host: 'app.test', conf: '' })).to.equal(true);
      expect(removed).to.include(`${CONF_DIR}/app.test.conf`);
    });

    // The registry records what the host was last rendered with, which is the
    // only place a variant's descriptor survives leaving the conf.
    it('records and reads back the descriptors a host was rendered with', () => {
      const { written } = gatewayFixture();
      const instances = [{ id: 'mmo-server', host: 'app.test', path: '/' }];
      expect(writeHostInstanceRegistry({ confDir: CONF_DIR, host: 'app.test', instances })).to.equal(true);
      expect(writeHostInstanceRegistry({ confDir: CONF_DIR, host: 'app.test', instances })).to.equal(false);
      expect(readHostInstanceRegistry({ confDir: CONF_DIR, host: 'app.test' })).to.deep.equal(instances);
      // Given a non-.conf suffix so the install pass never feeds it to Nginx.
      expect([...written.keys()][0].endsWith('.instances.json')).to.equal(true);
    });

    it('reads no descriptors from an absent or malformed registry', () => {
      gatewayFixture();
      expect(readHostInstanceRegistry({ confDir: CONF_DIR, host: 'app.test' })).to.deep.equal([]);
      vi.restoreAllMocks();
      gatewayFixture({ [`${CONF_DIR}/app.test.instances.json`]: '{ not json' });
      expect(readHostInstanceRegistry({ confDir: CONF_DIR, host: 'app.test' })).to.deep.equal([]);
      vi.restoreAllMocks();
      gatewayFixture({ [`${CONF_DIR}/app.test.instances.json`]: JSON.stringify([{ id: 'a' }, {}]) });
      expect(readHostInstanceRegistry({ confDir: CONF_DIR, host: 'app.test' })).to.deep.equal([{ id: 'a' }]);
    });
  });

  describe('gateway config install', () => {
    const installFixture = (files = {}) =>
      gatewayFixture({ [`${CONF_DIR}/app.test.conf`]: 'server { listen 80; }\n', ...files });

    it('validates the candidate config before signalling the running master', () => {
      installFixture();
      harness.route({ match: 'nginx -t', code: 0, stdout: 'configuration file test is successful\n' });
      expect(installGatewayConf({ hostRoot: HOST_ROOT, confSourceDir: CONF_DIR })).to.equal(true);
      const testIndex = harness.calls.findIndex((command) => command.includes('nginx -t'));
      const reloadIndex = harness.calls.findIndex((command) => command.includes('nginx -s reload'));
      expect(reloadIndex).to.be.above(testIndex);
    });

    // A block that does not parse would take the whole edge down on reload.
    it('restores the previous blocks and fails when Nginx rejects the candidate', () => {
      const { written } = installFixture({
        [`${HOST_ROOT}/${UNDERPOST_GATEWAY.confDir}/app.test.conf`]: 'server { listen 8080; }\n',
      });
      harness.route({ match: 'nginx -t', code: 1, stdout: 'nginx: [emerg] unknown directive\n' });
      expect(() => installGatewayConf({ hostRoot: HOST_ROOT, confSourceDir: CONF_DIR })).to.throw(
        'Gateway config rejected',
      );
      expect(harness.ran('underpost-gateway-restore-app.test.conf')).to.equal(true);
      expect(harness.ran('nginx -s reload')).to.equal(false);
      expect([...written.keys()].every((path) => !path.includes('restore'))).to.equal(true);
    });

    it('removes a block that was not there before the failed candidate', () => {
      installFixture();
      harness.route({ match: 'nginx -t', code: 1, stdout: 'nginx: [emerg]\n' });
      expect(() => installGatewayConf({ hostRoot: HOST_ROOT, confSourceDir: CONF_DIR })).to.throw();
      expect(harness.ran(`sudo rm -f ${HOST_ROOT}/${UNDERPOST_GATEWAY.confDir}/app.test.conf`)).to.equal(true);
    });

    // The running master normally retains its old config when a reload fails, so
    // the restore is re-signalled to converge it back.
    it('restores and re-signals when the reload itself fails', () => {
      installFixture();
      harness.route({ match: 'nginx -t', code: 0, stdout: 'successful\n' });
      let firstReload = true;
      harness.route({
        match: (command) => {
          if (!command.includes('nginx -s reload')) return false;
          if (!firstReload) return false;
          firstReload = false;
          return true;
        },
        throws: new Error('reload signal refused'),
      });
      expect(() => installGatewayConf({ hostRoot: HOST_ROOT, confSourceDir: CONF_DIR })).to.throw(
        'reload signal refused',
      );
      expect(harness.count('nginx -s reload')).to.equal(2);
    });

    it('installs nothing when the build produced no blocks', () => {
      gatewayFixture();
      expect(installGatewayConf({ hostRoot: HOST_ROOT, confSourceDir: CONF_DIR })).to.equal(false);
      vi.restoreAllMocks();
      gatewayFixture({ [`${CONF_DIR}/app.test.instances.json`]: '[]' });
      expect(installGatewayConf({ hostRoot: HOST_ROOT, confSourceDir: CONF_DIR })).to.equal(false);
    });
  });

  describe('default status page', () => {
    it('creates the include directory and writes the shared fallback', () => {
      gatewayFixture();
      expect(seedDefaultStatusPage(HOST_ROOT)).to.equal(true);
      expect(harness.ran(`sudo mkdir -p ${HOST_ROOT}/${UNDERPOST_GATEWAY.confDir}`)).to.equal(true);
      expect(harness.ran('404 Not Found')).to.equal(true);
    });

    // An operator may have replaced it.
    it('never overwrites an existing document', () => {
      gatewayFixture({ [`${HOST_ROOT}/${UNDERPOST_GATEWAY.defaultHostDir}/status-pages/404/index.html`]: 'custom' });
      expect(seedDefaultStatusPage(HOST_ROOT)).to.equal(false);
      expect(harness.ran('sudo tee')).to.equal(false);
    });
  });

  describe('fallback probe selection', () => {
    it('probes one route per sub-path that declares a maintenance view', () => {
      gatewayFixture({
        './engine-private/conf/dd-core/conf.server.json': JSON.stringify({
          'app.fixture.test': {
            '/': { client: 'App', ssr: 'App' },
            '/single': { client: 'S', singleReplica: true, replicas: ['/blue'] },
          },
        }),
        './engine-private/conf/dd-core/conf.ssr.json': JSON.stringify({
          App: { head: [], body: [], mailer: {}, views: [{ path: '/', client: 'App' }] },
        }),
      });
      expect(() => pwaFallbackChecksFactory('dd-core')).not.to.throw();
    });

    // A variant declaring several status pages is still one route to probe.
    it('probes each instance sub-path once, however many pages it declares', () => {
      const checks = instanceFallbackChecksFactory([
        {
          id: 'mmo-server',
          host: 'server.fixture.test',
          path: '/',
          customStatusPages: [
            { status: '404', hostPath: './public/404/index.html' },
            { status: '500', hostPath: './public/500/index.html' },
          ],
        },
        {
          id: 'mmo-server-forest',
          host: 'server.fixture.test',
          path: '/FOREST',
          customStatusPages: [{ status: '404', hostPath: './public/404/index.html' }],
        },
      ]);
      expect(checks.map(({ path, kind }) => `${path}:${kind}`)).to.deep.equal(['/:status:404', '/FOREST:status:404']);
    });

    it('probes nothing for instances declaring no status page', () => {
      expect(instanceFallbackChecksFactory([{ id: 'a', host: 'a.test', path: '/' }])).to.deep.equal([]);
      expect(instanceFallbackChecksFactory()).to.deep.equal([]);
    });
  });

  describe('pre-runtime fallback probes', () => {
    const CHECK = {
      host: 'app.fixture.test',
      path: '/',
      assetPath: 'app.fixture.test/root/status-pages/404/index.html',
      kind: 'status:404',
    };
    const DOCUMENT = '<!doctype html>404\n';

    const probeFixture = () => {
      vi.spyOn(Underpost.deploy, 'underpostGatewayRootFactory').mockReturnValue(HOST_ROOT);
      return gatewayFixture({ [`${HOST_ROOT}/${CHECK.assetPath}`]: DOCUMENT });
    };

    it('runs nothing when the Gateway API stack is not in use', async () => {
      probeFixture();
      expect(await gatewayFallbackProbeRunner({ checks: [CHECK], options: {}, label: 'deploy' })).to.deep.equal([]);
      expect(harness.calls.length).to.equal(0);
    });

    it('runs nothing when no route declares a fallback', async () => {
      probeFixture();
      expect(
        await gatewayFallbackProbeRunner({ checks: [], options: { gatewayApi: true }, label: 'deploy' }),
      ).to.deep.equal([]);
    });

    it('refuses to continue when the gateway is not operational', async () => {
      probeFixture();
      await expect(
        gatewayFallbackProbeRunner({
          checks: [CHECK],
          options: { gatewayApi: true },
          label: 'deploy',
          gatewayStatusRunner: async () => ({ programmed: false, servesHttps: false }),
        }),
      ).rejects.toThrow('not operational before application deployment');
    });

    it('refuses a dev gateway that does not terminate TLS', async () => {
      probeFixture();
      await expect(
        gatewayFallbackProbeRunner({
          checks: [CHECK],
          options: { gatewayApi: true, dev: true },
          label: 'deploy',
          gatewayStatusRunner: async () => ({ programmed: true, servesHttps: false }),
        }),
      ).rejects.toThrow('not operational');
    });

    // The assertion is on the response body, not on object status: an accepted
    // route says nothing about which document a client receives.
    it('passes only when the edge answers an upstream failure with the configured document', async () => {
      probeFixture();
      harness.route({ match: 'wget -q -O -', code: 0, stdout: DOCUMENT });
      harness.route({ match: 'wget -S -O /dev/null', code: 0, stdout: 'HTTP/1.1 502 Bad Gateway\n' });
      const [result] = await gatewayFallbackProbeRunner({
        checks: [CHECK],
        options: { gatewayApi: true },
        label: 'deploy',
        gatewayStatusRunner: async () => ({ programmed: true, servesHttps: true }),
      });
      expect(result).to.include({ passed: true, status: '502', bodyMatchesConfiguredAsset: true, attempts: 1 });
    });

    it('probes over TLS through the local resolve override in dev', async () => {
      probeFixture();
      harness.route({ match: 'curl -sSk --noproxy', code: 0, stdout: DOCUMENT });
      harness.route({ match: "-w '%{http_code}'", code: 0, stdout: '503\n' });
      const [result] = await gatewayFallbackProbeRunner({
        checks: [CHECK],
        options: { gatewayApi: true, dev: true },
        label: 'deploy',
        gatewayStatusRunner: async () => ({ programmed: true, servesHttps: true }),
      });
      expect(result.passed).to.equal(true);
      expect(harness.ran(`--resolve ${CHECK.host}:443:127.0.0.1`)).to.equal(true);
    });

    // A probe must not pass against a shared default page.
    it('fails a probe answered with a body that is not the configured document', async () => {
      probeFixture();
      harness.route({ match: 'wget -q -O -', code: 0, stdout: '<!doctype html>shared default\n' });
      harness.route({ match: 'wget -S -O /dev/null', code: 0, stdout: 'HTTP/1.1 502 Bad Gateway\n' });
      await expect(
        gatewayFallbackProbeRunner({
          checks: [{ ...CHECK, host: 'app.fixture.test' }],
          options: { gatewayApi: true },
          label: 'deploy',
          gatewayStatusRunner: async () => ({ programmed: true, servesHttps: true }),
        }),
      ).rejects.toThrow('fallback probes failed');
    }, 90000);
  });
});
