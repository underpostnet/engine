'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import http from 'node:http';
import os from 'node:os';
import UnderpostEvent from '../../../../src/cli/event.js';
import UnderpostMonitor from '../../../../src/cli/monitor.js';
import UnderpostSSH from '../../../../src/cli/ssh.js';
import { EDGE_TOPOLOGY_PATH } from '../../../../src/cli/wireguard.js';
import { UNDERPOST_MONITORING } from '../../../../src/server/ops/monitoring.js';
import { shellHarness } from '../../../support/shell-harness.js';

const NODES_PATH = './engine-private/deploy/nodes';
const ROUTES_PATH = './engine-private/deploy/dd.routes';
const HUB_HOST = '203.0.113.10';

const TOPOLOGY = {
  [HUB_HOST]: {
    interfaceName: 'wg0',
    listenPort: 51820,
    address: '10.0.0.1/24',
    publicKey: 'hubPublicKeyFixture=',
    sshForwardPort: 2222,
    peers: [
      {
        id: 'control-a',
        address: '10.0.0.2',
        managementHost: '198.51.100.2',
        publicKey: 'peerAPublicKeyFixture=',
        hosts: ['app.fixture.test'],
        default: true,
      },
      {
        id: 'worker-b',
        address: '10.0.0.3',
        managementHost: '198.51.100.3',
        publicKey: 'peerBPublicKeyFixture=',
      },
    ],
  },
};

const FILES = {
  [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY),
  [`${NODES_PATH}/hub-node.json`]: JSON.stringify({ role: 'hub', hubHost: HUB_HOST }),
  [`${NODES_PATH}/control-node.json`]: JSON.stringify({ role: 'control', hubHost: HUB_HOST, peerId: 'control-a' }),
  [`${NODES_PATH}/worker-node.json`]: JSON.stringify({ role: 'worker', hubHost: HUB_HOST, peerId: 'worker-b' }),
};

// Topology, node documents and the SSH registry all live in the private
// repository, and every repair reaches a real host. The suite replaces the
// three: an in-memory document tree, a stubbed connection registry, and a
// recorded command runner.
const eventFixture = ({ files = FILES, hostname = 'hub-node' } = {}) => {
  const table = new Map(Object.entries(files));
  const written = new Map();
  const keys = () => [...table.keys(), ...written.keys()];

  vi.spyOn(os, 'hostname').mockReturnValue(hostname);
  vi.spyOn(os, 'networkInterfaces').mockReturnValue({
    eth0: [{ family: 'IPv4', address: '203.0.113.10', internal: false }],
  });
  vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    return table.has(key) || written.has(key) || keys().some((entry) => entry.startsWith(`${key}/`));
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    if (written.has(key)) return written.get(key);
    if (table.has(key)) return table.get(key);
    throw Object.assign(new Error(`ENOENT: ${key}`), { code: 'ENOENT' });
  });
  vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));
  vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
    keys()
      .filter((filePath) => filePath.startsWith(`${dir}/`))
      .map((filePath) => filePath.slice(`${dir}/`.length))
      .filter((name) => !name.includes('/')),
  );
  vi.spyOn(UnderpostSSH.API, 'resolveConnection').mockImplementation(({ host }) =>
    host ? { user: 'fixture', host, port: 22 } : null,
  );
  return { table, written };
};

const stubRunCommand = (implementation) =>
  vi
    .spyOn(UnderpostEvent.API, 'runCommand')
    .mockImplementation(implementation ?? (async () => ({ ok: true, output: 'ok' })));

describe('event subject registries', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the hub tunnel address from either end', () => {
    eventFixture();
    expect(UnderpostEvent.API.hubAddress()).to.equal('10.0.0.1');
    vi.restoreAllMocks();
    eventFixture({ hostname: 'control-node' });
    expect(UnderpostEvent.API.hubAddress()).to.equal('10.0.0.1');
  });

  it('joins each peer to the node document that claims it', () => {
    eventFixture();
    expect(UnderpostEvent.API.spokes()).to.deep.equal([
      {
        id: 'control-a',
        address: '10.0.0.2',
        managementHost: '198.51.100.2',
        nodeRole: 'control',
        nodeName: 'control-node',
        local: false,
      },
      {
        id: 'worker-b',
        address: '10.0.0.3',
        managementHost: '198.51.100.3',
        nodeRole: 'worker',
        nodeName: 'worker-node',
        local: false,
      },
    ]);
  });

  // Locality is settled against this machine's own addresses, never against the
  // node document that named it: a generic hostname names every machine that
  // kept the default, and a repair would then run on whichever host loaded the
  // config.
  it('settles locality against this machine own addresses', () => {
    eventFixture();
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      eth0: [{ family: 'IPv4', address: '198.51.100.3', internal: false }],
    });
    expect(UnderpostEvent.API.spokes().find((spoke) => spoke.id === 'worker-b').local).to.equal(true);
  });

  it('reports the nodes the cluster schedules on, hubs excluded', () => {
    eventFixture();
    expect(UnderpostEvent.API.clusterNodes()).to.deep.equal([
      { nodeName: 'control-node', role: 'control' },
      { nodeName: 'worker-node', role: 'worker' },
    ]);
  });

  it('lists every registered hub, named by its node document', () => {
    eventFixture();
    expect(UnderpostEvent.API.hubs()).to.deep.equal([
      { nodeName: 'hub-node', hubHost: HUB_HOST, address: '10.0.0.1', sshForwardPort: 2222 },
    ]);
  });

  it('selects a hub by node name or by static address', () => {
    eventFixture();
    expect(UnderpostEvent.API.hubs('hub-node')[0].hubHost).to.equal(HUB_HOST);
    expect(UnderpostEvent.API.hubs(HUB_HOST)[0].nodeName).to.equal('hub-node');
  });

  it('refuses a selector that names no registered hub', () => {
    eventFixture();
    expect(() => UnderpostEvent.API.hubs('ghost')).to.throw('is not a registered hub node or address');
  });

  // A hub with no node document is still a hub: topology owns the hub set.
  it('reports a hub the node documents never named', () => {
    eventFixture({ files: { [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY) } });
    expect(UnderpostEvent.API.hubs()[0].nodeName).to.equal('');
  });
});

describe('event execution targets', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves a hub through its static public address, which no failed tunnel is part of', () => {
    eventFixture();
    expect(UnderpostEvent.API.hubTarget()).to.deep.equal({
      role: 'hub',
      nodeName: 'hub-node',
      address: '10.0.0.1',
      user: 'fixture',
      host: HUB_HOST,
      via: `fixture@${HUB_HOST}:22`,
    });
  });

  it('resolves a spoke through its registered LAN management host', () => {
    eventFixture();
    expect(UnderpostEvent.API.spokeTarget('worker-b')).to.include({
      role: 'spoke',
      nodeRole: 'worker',
      spokeId: 'worker-b',
      address: '10.0.0.3',
      host: '198.51.100.3',
    });
  });

  it('runs locally for a spoke that is this machine', () => {
    eventFixture();
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      eth0: [{ family: 'IPv4', address: '198.51.100.3', internal: false }],
    });
    expect(UnderpostEvent.API.spokeTarget('worker-b')).to.include({ via: 'local', user: '', host: '' });
  });

  it('names the command that registers an unknown or identity-less spoke', () => {
    eventFixture();
    expect(() => UnderpostEvent.API.spokeTarget('ghost')).to.throw('register it with --peer-add');
    vi.restoreAllMocks();
    eventFixture({
      files: {
        [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY),
        ...FILES,
        [`${NODES_PATH}/worker-node.json`]: JSON.stringify({ role: 'control', hubHost: HUB_HOST, peerId: 'other' }),
      },
    });
    expect(() => UnderpostEvent.API.spokeTarget('worker-b')).to.throw('run --node-config on that machine');
  });

  it('names the command that registers a management route for a spoke', () => {
    eventFixture();
    vi.spyOn(UnderpostSSH.API, 'resolveConnection').mockReturnValue(null);
    expect(() => UnderpostEvent.API.spokeTarget('worker-b')).to.throw('--user-add');
  });

  it('refuses a spoke registered with no management host', () => {
    eventFixture({
      files: {
        ...FILES,
        [EDGE_TOPOLOGY_PATH]: JSON.stringify({
          [HUB_HOST]: {
            ...TOPOLOGY[HUB_HOST],
            peers: [{ id: 'worker-b', address: '10.0.0.3', publicKey: 'k=' }],
          },
        }),
      },
    });
    expect(() => UnderpostEvent.API.spokeTarget('worker-b')).to.throw('has no managementHost');
  });

  // A rehearsal must be runnable from any machine holding the deploy
  // configuration and the SSH registry, not only from the control plane.
  it('resolves the node the observability stack reads probes on', () => {
    eventFixture();
    expect(UnderpostEvent.API.controlTarget().spokeId).to.equal('control-a');
  });

  it('refuses when no control node is registered', () => {
    eventFixture({
      files: {
        [EDGE_TOPOLOGY_PATH]: JSON.stringify(TOPOLOGY),
        [`${NODES_PATH}/hub-node.json`]: FILES[`${NODES_PATH}/hub-node.json`],
      },
    });
    expect(() => UnderpostEvent.API.controlTarget()).to.throw('probes have no reader');
  });

  it('selects every subject of a role when no selector narrows it', () => {
    eventFixture();
    expect(UnderpostEvent.API.subjectSelection('hub', {})).to.deep.equal([HUB_HOST]);
    expect(UnderpostEvent.API.subjectSelection('spoke', {})).to.deep.equal(['control-a', 'worker-b']);
  });

  it('narrows a selection by node name or subject id', () => {
    eventFixture();
    expect(UnderpostEvent.API.subjectSelection('hub', { nodes: 'hub-node' })).to.deep.equal([HUB_HOST]);
    expect(UnderpostEvent.API.subjectSelection('spoke', { nodes: 'worker-node' })).to.deep.equal(['worker-b']);
    expect(UnderpostEvent.API.subjectSelection('spoke', { spoke: 'control-a' })).to.deep.equal(['control-a']);
  });

  it('refuses a selector matching nothing of that role', () => {
    eventFixture();
    expect(() => UnderpostEvent.API.subjectSelection('spoke', { spoke: 'ghost' })).to.throw(
      'is not a registered spoke id or node name',
    );
  });

  it('keys every collector target by the address Prometheus labels its series with', () => {
    eventFixture();
    const targets = UnderpostEvent.API.nodeTargets();
    expect(targets.map(({ instance }) => instance)).to.deep.equal(['10.0.0.1', '198.51.100.2', '198.51.100.3']);
  });

  it('reports an unresolvable target rather than dropping the node', () => {
    eventFixture();
    vi.spyOn(UnderpostSSH.API, 'resolveConnection').mockReturnValue(null);
    expect(UnderpostEvent.API.nodeTargets().every((target) => target.via === 'unresolved')).to.equal(true);
  });
});

describe('event remediation handlers', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  describe('hub', () => {
    it('restarts each hub across its external SSH endpoint', async () => {
      eventFixture();
      const run = stubRunCommand();
      const result = await UnderpostEvent.API.repairHub({});
      expect(result.ok).to.equal(true);
      expect(run.mock.calls[0][0]).to.include('--wireguard-restart --check');
      expect(run.mock.calls[0][1].host).to.equal(HUB_HOST);
    });

    it('acts on exactly the hubs the alert names', async () => {
      eventFixture();
      const run = stubRunCommand();
      await UnderpostEvent.API.repairHub({}, [{ labels: { underpost_hub: HUB_HOST } }]);
      expect(run.mock.calls.filter(([command]) => command.includes('--wireguard-restart')).length).to.equal(1);
    });

    it('reports an unresolvable hub without failing the pass', async () => {
      eventFixture();
      stubRunCommand();
      vi.spyOn(UnderpostEvent.API, 'hubTarget').mockImplementation(() => {
        throw new Error('no management route');
      });
      const result = await UnderpostEvent.API.repairHub({});
      expect(result.ok).to.equal(false);
      expect(result.targets[0].via).to.equal('unresolved');
    });

    it('reports that no hub is registered at all', async () => {
      eventFixture({ files: {} });
      vi.spyOn(UnderpostEvent.API, 'subjectSelection').mockReturnValue([]);
      const result = await UnderpostEvent.API.repairHub({});
      expect(result).to.include({ ok: false, role: 'hub' });
      expect(result.targets).to.deep.equal([]);
    });
  });

  describe('spokes', () => {
    it('repairs every registered spoke when invoked by hand', async () => {
      eventFixture();
      const run = stubRunCommand();
      const result = await UnderpostEvent.API.repairSpokes({});
      expect(result.ok).to.equal(true);
      expect(run.mock.calls[0][0]).to.include('--expected-id');
    });

    it('acts on exactly the spokes the alert names', async () => {
      eventFixture();
      const run = stubRunCommand();
      await UnderpostEvent.API.repairSpokes({}, [{ labels: { underpost_spoke: 'worker-b' } }]);
      expect(run.mock.calls[0][0]).to.include('worker-b');
    });

    // Spokes are independent hosts; a partial recovery beats none.
    it('does not let one unresolvable spoke stop the others', async () => {
      eventFixture();
      stubRunCommand();
      vi.spyOn(UnderpostEvent.API, 'spokeTarget').mockImplementation((spokeId) => {
        if (spokeId === 'control-a') throw new Error('no management route');
        return { role: 'spoke', nodeRole: 'worker', spokeId, address: '10.0.0.3', user: 'u', host: 'h', via: 'ssh' };
      });
      const result = await UnderpostEvent.API.repairSpokes({});
      expect(result.ok).to.equal(false);
      expect(result.targets.map(({ ok }) => ok)).to.deep.equal([false, true]);
    });

    it('reports that no spoke is registered at all', async () => {
      eventFixture();
      vi.spyOn(UnderpostEvent.API, 'subjectSelection').mockReturnValue([]);
      const result = await UnderpostEvent.API.repairSpokes({});
      expect(result).to.include({ ok: false, role: 'spoke' });
    });

    it('reads the edge status the CLI reports rather than assembling a second opinion', async () => {
      eventFixture();
      const run = stubRunCommand(async () => ({ ok: true, output: 'status output' }));
      expect(await UnderpostEvent.API.wireguardHealth({})).to.equal('status output');
      expect(run.mock.calls[0][0]).to.equal('node bin wireguard --status');
      expect(await UnderpostEvent.API.wireguardHealth({ dryRun: true })).to.include('dry run');
    });
  });

  describe('public ingress', () => {
    const ingressFixture = () =>
      eventFixture({
        files: {
          ...FILES,
          [ROUTES_PATH]: 'dd-core',
          './engine-private/conf/dd-core/conf.server.json': JSON.stringify({
            'app.fixture.test': { '/': { client: 'App' } },
            'api.fixture.test': { '/': { client: 'Api' } },
          }),
        },
      });

    const curl = (finalByHost) =>
      harness.route({
        match: 'curl -L -v -i -s',
        code: 0,
        stdout: '',
        // The probe reads the final code out of the write-out marker.
      }) ||
      vi
        .spyOn(UnderpostEvent.API, 'publicIngressUrls')
        .mockImplementation(() =>
          Object.keys(finalByHost).map((host) => ({ host, path: '/', url: `https://${host}/` })),
        );

    it('lists every public URL the deploy conf publishes', () => {
      ingressFixture();
      expect(UnderpostEvent.API.publicIngressUrls().map(({ url }) => url)).to.deep.equal([
        'https://app.fixture.test/',
        'https://api.fixture.test/',
      ]);
    });

    it('reports a healthy edge when every host lands on 200', () => {
      ingressFixture();
      harness.route({ match: 'curl', code: 0, stdout: '< HTTP/2 200\nUNDERPOST_CURL_FINAL=200\n' });
      expect(UnderpostEvent.API.publicIngressHealth()).to.include({ state: 'healthy', total: 2, healthy: 2 });
    });

    // A 301 that never lands on a 200 is a broken route, not a served one.
    it('classifies a redirect chain that never lands as failing', () => {
      ingressFixture();
      harness.route({ match: 'curl', code: 0, stdout: '< HTTP/1.1 301\nUNDERPOST_CURL_FINAL=301\n' });
      expect(UnderpostEvent.API.publicIngressHealth().state).to.equal('down');
    });

    it('separates one host failing from every host failing', () => {
      ingressFixture();
      harness.route({
        match: 'curl',
        code: 0,
        stdout: '< HTTP/2 200\nUNDERPOST_CURL_FINAL=200\n',
      });
      harness.route({
        match: (command) => command.includes('curl') && command.includes('api.fixture.test'),
        code: 0,
        stdout: 'UNDERPOST_CURL_FINAL=000\n',
      });
      const health = UnderpostEvent.API.publicIngressHealth();
      expect(health).to.include({ state: 'partial', total: 2, healthy: 1 });
      expect(UnderpostEvent.API.publicIngressReport(health)).to.include('api.fixture.test');
    });

    it('announces nothing at all while the edge is healthy', async () => {
      ingressFixture();
      harness.route({ match: 'curl', code: 0, stdout: '< HTTP/2 200\nUNDERPOST_CURL_FINAL=200\n' });
      expect(await UnderpostEvent.API.repairPublicIngress({})).to.include({ ok: true, silent: true });
    });

    // Some hosts failing is a deploy-level fault the edge cannot repair.
    it('announces a per-host fault and leaves the edge alone', async () => {
      ingressFixture();
      const run = stubRunCommand();
      harness.route({ match: 'curl', code: 0, stdout: '< HTTP/2 200\nUNDERPOST_CURL_FINAL=200\n' });
      harness.route({
        match: (command) => command.includes('curl') && command.includes('api.fixture.test'),
        code: 0,
        stdout: 'UNDERPOST_CURL_FINAL=000\n',
      });
      const result = await UnderpostEvent.API.repairPublicIngress({});
      expect(result.ok).to.equal(false);
      expect(result.condition).to.include('the fault is per host');
      expect(run.mock.calls.length).to.equal(0);
    });

    // Ingress first: a blocked edge makes the tunnel rebuild look successful
    // while nothing can still reach it.
    it('unblocks ingress before rebuilding the tunnel on a whole-edge outage', async () => {
      ingressFixture();
      harness.route({ match: 'curl', code: 0, stdout: 'UNDERPOST_CURL_FINAL=000\n' });
      const run = stubRunCommand();
      const result = await UnderpostEvent.API.repairPublicIngress({ dryRun: true });
      expect(run.mock.calls.map(([command]) => command)).to.deep.equal([
        'node bin ip --unblock-all-ingress',
        'node bin wireguard --wireguard-setup --wireguard-restart',
      ]);
      expect(result.ok).to.equal(false);
    });

    it('stops the command chain at the first failure on a node', async () => {
      ingressFixture();
      harness.route({ match: 'curl', code: 0, stdout: 'UNDERPOST_CURL_FINAL=000\n' });
      const run = stubRunCommand(async () => ({ ok: false, error: 'refused' }));
      await UnderpostEvent.API.repairPublicIngress({ dryRun: true });
      expect(run.mock.calls.length).to.equal(1);
    });

    it('reports an unresolvable hub during an edge outage', async () => {
      ingressFixture();
      harness.route({ match: 'curl', code: 0, stdout: 'UNDERPOST_CURL_FINAL=000\n' });
      stubRunCommand();
      vi.spyOn(UnderpostEvent.API, 'hubTarget').mockImplementation(() => {
        throw new Error('no management route');
      });
      const result = await UnderpostEvent.API.repairPublicIngress({ dryRun: true });
      expect(result.targets[0].via).to.equal('unresolved');
    });

    it('stops polling as soon as the edge answers again', async () => {
      ingressFixture();
      let pass = 0;
      vi.spyOn(UnderpostEvent.API, 'publicIngressHealth').mockImplementation(() => ({
        state: pass++ === 0 ? 'down' : 'healthy',
        total: 1,
        healthy: pass === 0 ? 0 : 1,
        failing: [],
      }));
      const health = await UnderpostEvent.API.awaitPublicIngressHealth({ timeoutMs: 1000, intervalMs: 1 });
      expect(health.state).to.equal('healthy');
    });

    it('gives up once the recovery window closes', async () => {
      ingressFixture();
      vi.spyOn(UnderpostEvent.API, 'publicIngressHealth').mockReturnValue({
        state: 'down',
        total: 1,
        healthy: 0,
        failing: [],
      });
      expect((await UnderpostEvent.API.awaitPublicIngressHealth({ timeoutMs: 5, intervalMs: 1 })).state).to.equal(
        'down',
      );
    });
  });

  describe('node inspection', () => {
    it('runs the diagnostic on every registered node when the alert names none', async () => {
      eventFixture();
      const run = stubRunCommand();
      const result = await UnderpostEvent.API.inspectNodes({
        role: 'node',
        command: 'top -bn1',
        condition: 'cpu above threshold',
      });
      expect(result.ok).to.equal(true);
      expect(run.mock.calls.length).to.equal(3);
      expect(run.mock.calls[0][1].silent).to.equal(true);
    });

    it('narrows the diagnostic to the instances the alert names', async () => {
      eventFixture();
      const run = stubRunCommand();
      await UnderpostEvent.API.inspectNodes({
        role: 'node',
        command: 'top -bn1',
        condition: 'cpu',
        alerts: [{ labels: { instance: '198.51.100.3:9100' } }],
      });
      expect(run.mock.calls.length).to.equal(1);
    });

    it('reports that no registered node matches the alert', async () => {
      eventFixture();
      const result = await UnderpostEvent.API.inspectNodes({
        role: 'node',
        command: 'top -bn1',
        condition: 'cpu',
        alerts: [{ labels: { instance: '10.9.9.9:9100' } }],
      });
      expect(result.ok).to.equal(false);
      expect(result.error).to.include('no registered node matches');
    });

    it('reports an unresolvable node rather than running nothing', async () => {
      eventFixture();
      stubRunCommand();
      vi.spyOn(UnderpostSSH.API, 'resolveConnection').mockReturnValue(null);
      const result = await UnderpostEvent.API.inspectNodes({ role: 'node', command: 'top', condition: 'cpu' });
      expect(result.ok).to.equal(false);
      expect(result.targets.every((target) => target.via === 'unresolved')).to.equal(true);
    });
  });
});

describe('event dispatch and publication', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the firing event ids out of an Alertmanager payload', () => {
    expect(
      UnderpostEvent.API.webhookEventIds({
        status: 'firing',
        alerts: [
          { labels: { underpost_event: 'wireguard-spoke-down' } },
          { status: 'resolved', labels: { underpost_event: 'wireguard-server-down' } },
          { labels: { underpost_event: 'not-a-registered-event' } },
          { labels: {} },
          { labels: { underpost_event: 'wireguard-spoke-down' } },
        ],
      }),
    ).to.deep.equal(['wireguard-spoke-down']);
  });

  it('reads no event out of an empty or malformed payload', () => {
    expect(UnderpostEvent.API.webhookEventIds({})).to.deep.equal([]);
    expect(UnderpostEvent.API.webhookEventIds({ alerts: 'not-an-array' })).to.deep.equal([]);
  });

  it('refuses an unknown event id', async () => {
    await expect(UnderpostEvent.API.dispatch('not-an-event')).rejects.toThrow('unknown event id');
  });

  // The dispatcher may be serving a webhook, where an unhandled rejection would
  // silence every later alert.
  it('reports a failing handler rather than throwing out of the dispatcher', async () => {
    const notify = vi.spyOn(UnderpostEvent.API, 'notify').mockResolvedValue(undefined);
    vi.spyOn(UnderpostEvent.API, 'repairSpokes').mockRejectedValue(new Error('ssh refused'));
    const result = await UnderpostEvent.API.dispatch('wireguard-spoke-down', {});
    expect(result).to.include({ ok: false });
    expect(result.error).to.include('ssh refused');
    expect(notify.mock.calls.length).to.equal(1);
  });

  // Alerting on a healthy check is how an inbox stops being read.
  it('announces nothing when the handler found nothing wrong', async () => {
    const notify = vi.spyOn(UnderpostEvent.API, 'notify').mockResolvedValue(undefined);
    vi.spyOn(UnderpostEvent.API, 'repairPublicIngress').mockResolvedValue({ ok: true, silent: true, targets: [] });
    await UnderpostEvent.API.dispatch('public-ingress-down', {});
    expect(notify.mock.calls.length).to.equal(0);
  });

  it('suppresses the notification when the run asked for none', async () => {
    const notify = vi.spyOn(UnderpostEvent.API, 'notify').mockResolvedValue(undefined);
    vi.spyOn(UnderpostEvent.API, 'repairSpokes').mockResolvedValue({ ok: true, targets: [] });
    await UnderpostEvent.API.dispatch('wireguard-spoke-down', { notify: false });
    expect(notify.mock.calls.length).to.equal(0);
  });

  it('reports the command instead of running it under a dry run', async () => {
    const result = await UnderpostEvent.API.runCommand('node bin wireguard --status', {
      dryRun: true,
      user: 'u',
      host: 'h',
    });
    expect(result.ok).to.equal(true);
    expect(result.output).to.include('ssh u@h');
  });

  it('runs a command through the single execution facility', async () => {
    const runner = vi.spyOn(UnderpostSSH.API, 'sshRemoteRunner').mockResolvedValue('done');
    const result = await UnderpostEvent.API.runCommand('uptime', { user: 'u', host: 'h' });
    expect(result).to.deep.equal({ ok: true, output: 'done' });
    expect(runner.mock.calls[0][1]).to.include({ user: 'u', host: 'h', remote: true });
  });

  // The generated SSH script is in the thrown message and tells a reader nothing.
  it('reports what the command said rather than the wrapper that carried it', async () => {
    vi.spyOn(UnderpostSSH.API, 'sshRemoteRunner').mockRejectedValue(
      Object.assign(new Error('Command failed: ssh ...'), { stderr: 'permission denied\n' }),
    );
    const result = await UnderpostEvent.API.runCommand('uptime', { user: 'u', host: 'h' });
    expect(result).to.include({ ok: false, output: '' });
    expect(result.error).to.equal('permission denied');
  });

  it('merges one event into the set the cluster reported', () => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: true,
      ids: ['wireguard-spoke-down'],
      reason: '',
    });
    expect(UnderpostEvent.API.deployedEventIds({})).to.deep.equal(['wireguard-spoke-down']);
    expect(UnderpostEvent.API.deploySelection('public-ingress-down', {})).to.deep.equal([
      'public-ingress-down',
      'wireguard-spoke-down',
    ]);
  });

  it('reports each declared event against the deployed set', () => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: true,
      ids: ['wireguard-spoke-down', 'retired-event'],
      reason: '',
    });
    const status = Object.fromEntries(UnderpostEvent.API.deploymentStatus({}).map((row) => [row.id, row.status]));
    expect(status['wireguard-spoke-down']).to.equal('DEPLOYED');
    expect(status['public-ingress-down']).to.equal('PENDING');
    expect(status['retired-event']).to.equal('OUT_OF_SYNC');
  });

  it('reports every event as unknown when the cluster did not answer', () => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: false,
      ids: [],
      reason: 'no cluster',
    });
    expect(UnderpostEvent.API.deploymentStatus({}).every((row) => row.status === 'UNKNOWN')).to.equal(true);
  });
});

describe('maintenance suspension', () => {
  let fixturePath;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-event-');
  });

  afterEach(() => {
    fs.removeSync(fixturePath);
    vi.restoreAllMocks();
  });

  const stateFile = () => `${fixturePath}/suspension.json`;

  it('records the exact deployed set and republishes with no events', async () => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: true,
      ids: ['wireguard-spoke-down', 'public-ingress-down'],
      reason: '',
    });
    const sync = vi.spyOn(UnderpostMonitor.API, 'syncObservability').mockResolvedValue({});

    const suspension = await UnderpostEvent.API.suspendEvents(stateFile(), {});

    expect(suspension.events).to.deep.equal(['public-ingress-down', 'wireguard-spoke-down']);
    expect(sync.mock.calls[0][0].events).to.deep.equal([]);
    expect(fs.readJsonSync(stateFile()).events).to.deep.equal(suspension.events);
  });

  it('refuses to suspend without a state file, or over an existing one', async () => {
    await expect(UnderpostEvent.API.suspendEvents('')).rejects.toThrow('requires a state-file path');
    fs.outputJsonSync(stateFile(), {});
    await expect(UnderpostEvent.API.suspendEvents(stateFile())).rejects.toThrow('resume it before suspending again');
  });

  // Restoring from a set the cluster never reported would silently drop events.
  it('refuses to suspend a set the cluster could not report', async () => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: false,
      ids: [],
      reason: 'no cluster',
    });
    await expect(UnderpostEvent.API.suspendEvents(stateFile(), {})).rejects.toThrow('cannot be suspended safely');
  });

  it('refuses to suspend a deployed event this checkout cannot restore', async () => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: true,
      ids: ['retired-event'],
      reason: '',
    });
    await expect(UnderpostEvent.API.suspendEvents(stateFile(), {})).rejects.toThrow('undeploy them first');
  });

  it('retains the recovery state when the republication fails', async () => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: true,
      ids: ['wireguard-spoke-down'],
      reason: '',
    });
    vi.spyOn(UnderpostMonitor.API, 'syncObservability').mockRejectedValue(new Error('cluster refused'));
    await expect(UnderpostEvent.API.suspendEvents(stateFile(), {})).rejects.toThrow('cluster refused');
    expect(fs.existsSync(stateFile())).to.equal(true);
  });

  it('restores the saved set and removes the state only once it converged', async () => {
    fs.outputJsonSync(stateFile(), {
      version: 1,
      namespace: 'default',
      events: ['wireguard-spoke-down'],
      suspendedAt: '2026-01-01T00:00:00.000Z',
    });
    const sync = vi.spyOn(UnderpostMonitor.API, 'syncObservability').mockResolvedValue({ ok: true });

    await UnderpostEvent.API.resumeEvents(stateFile(), {});

    expect(sync.mock.calls[0][0].events).to.deep.equal(['wireguard-spoke-down']);
    expect(fs.existsSync(stateFile())).to.equal(false);
  });

  it('keeps the state file when the resync fails, so it can be retried', async () => {
    fs.outputJsonSync(stateFile(), { version: 1, namespace: 'default', events: [] });
    vi.spyOn(UnderpostMonitor.API, 'syncObservability').mockRejectedValue(new Error('cluster refused'));
    await expect(UnderpostEvent.API.resumeEvents(stateFile(), {})).rejects.toThrow('cluster refused');
    expect(fs.existsSync(stateFile())).to.equal(true);
  });

  it('refuses every malformed suspension state', async () => {
    await expect(UnderpostEvent.API.resumeEvents('')).rejects.toThrow('requires a state-file path');
    await expect(UnderpostEvent.API.resumeEvents(`${fixturePath}/absent.json`)).rejects.toThrow('does not exist');

    fs.outputFileSync(stateFile(), '{ not json');
    await expect(UnderpostEvent.API.resumeEvents(stateFile())).rejects.toThrow('invalid JSON');

    fs.outputJsonSync(stateFile(), { version: 99 });
    await expect(UnderpostEvent.API.resumeEvents(stateFile())).rejects.toThrow('unsupported suspension state version');

    fs.outputJsonSync(stateFile(), { version: 1, namespace: 'Not A Namespace', events: [] });
    await expect(UnderpostEvent.API.resumeEvents(stateFile())).rejects.toThrow('invalid namespace');

    fs.outputJsonSync(stateFile(), { version: 1, namespace: 'default', events: [42] });
    await expect(UnderpostEvent.API.resumeEvents(stateFile())).rejects.toThrow('invalid event list');

    fs.outputJsonSync(stateFile(), { version: 1, namespace: 'default', events: ['retired-event'] });
    await expect(UnderpostEvent.API.resumeEvents(stateFile())).rejects.toThrow('no longer declared by this checkout');
  });
});

describe('dispatcher service', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  it('reads no installed port when no unit is present', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(UnderpostEvent.API.serviceInstalledPort()).to.equal(0);
  });

  it('reads the port rendered into the installed unit', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      UnderpostEvent.API.serviceUnitFactory({ port: 39111, workingDirectory: '/home/dd/engine' }),
    );
    expect(UnderpostEvent.API.serviceInstalledPort()).to.equal(39111);
  });

  it('returns the recent journal without echoing the command', () => {
    harness.route({ match: 'journalctl', code: 0, stdout: 'log line\n' });
    expect(UnderpostEvent.API.serviceJournal(5)).to.equal('log line\n');
  });

  // systemd refuses a binary under /root or /home on an SELinux host, and the
  // failure surfaces only as 203/EXEC in the journal.
  it('probes a Node binary with a transient unit before installing one', () => {
    const probed = UnderpostEvent.API.serviceNodePath();
    expect(probed).to.include({ probed: true });
    expect(probed.path).to.equal(process.execPath);
  });

  it('falls back to the first candidate when no probe succeeds', () => {
    harness.route({ match: '', code: 1 });
    expect(UnderpostEvent.API.serviceNodePath()).to.include({ path: process.execPath, probed: false });
  });
});

describe('alertmanager webhook receiver', () => {
  const TOKEN = 'fixture-webhook-token';
  let server;
  let address;

  // Raw HTTP rather than fetch: the receiver answers before reading the body on
  // a refusal, and undici reports the resulting socket close as a failure even
  // though the response arrived.
  const post = async (body, { headers = {}, path = UNDERPOST_MONITORING.eventWebhook.path, method = 'POST' } = {}) =>
    new Promise((resolve, reject) => {
      const payload = method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body ?? {})) : '';
      const request = http.request(
        `${address}${path}`,
        {
          method,
          // Each case gets a fresh server, so a pooled keep-alive socket from
          // the previous one would be answered by nothing.
          agent: false,
          headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...headers },
        },
        (response) => {
          let text = '';
          response.on('data', (chunk) => (text += chunk));
          response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text || '{}') }));
        },
      );
      request.on('error', reject);
      if (payload) request.write(payload);
      request.end();
    });

  beforeEach(async () => {
    vi.spyOn(UnderpostMonitor.API, 'eventWebhookTokenFactory').mockReturnValue(TOKEN);
    server = await UnderpostEvent.API.serve({ port: 0, token: TOKEN, cooldownMs: 60000 });
    address = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    vi.restoreAllMocks();
  });

  it('refuses every path and method that is not the webhook', async () => {
    expect((await post({}, { path: '/' })).status).to.equal(404);
    expect((await post(undefined, { method: 'GET' })).status).to.equal(404);
  });

  // The receiver is a remediation path with root-equivalent reach.
  it('refuses a delivery carrying no valid bearer token', async () => {
    expect((await post({}, { headers: { authorization: 'Bearer wrong' } })).status).to.equal(401);
  });

  it('refuses a payload that is not JSON', async () => {
    expect((await post('{ not json')).status).to.equal(400);
  });

  // Remediation can take minutes and Alertmanager retries any delivery it does
  // not see accepted, so the answer comes before the dispatch.
  it('accepts the delivery before dispatching, and names what it accepted', async () => {
    const dispatch = vi.spyOn(UnderpostEvent.API, 'dispatch').mockResolvedValue({ ok: true });
    const response = await post({
      status: 'firing',
      alerts: [{ labels: { underpost_event: 'wireguard-spoke-down', underpost_spoke: 'worker-b' } }],
    });
    expect(response).to.deep.equal({ status: 202, body: { accepted: ['wireguard-spoke-down'] } });
    await vi.waitFor(() => expect(dispatch.mock.calls.length).to.equal(1));
    expect(dispatch.mock.calls[0][2][0].labels.underpost_spoke).to.equal('worker-b');
  });

  it('accepts a payload naming no registered event without dispatching', async () => {
    const dispatch = vi.spyOn(UnderpostEvent.API, 'dispatch').mockResolvedValue({ ok: true });
    expect((await post({ status: 'firing', alerts: [{ labels: {} }] })).body).to.deep.equal({ accepted: [] });
    expect(dispatch.mock.calls.length).to.equal(0);
  });

  it('holds a repeated group inside the cooldown', async () => {
    const dispatch = vi.spyOn(UnderpostEvent.API, 'dispatch').mockResolvedValue({ ok: true });
    const payload = {
      status: 'firing',
      alerts: [{ labels: { underpost_event: 'wireguard-spoke-down', underpost_spoke: 'worker-b' } }],
    };
    await post(payload);
    await vi.waitFor(() => expect(dispatch.mock.calls.length).to.equal(1));
    await post(payload);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(dispatch.mock.calls.length).to.equal(1);
  });

  it('reports a rejected dispatch rather than crashing the receiver', async () => {
    vi.spyOn(UnderpostEvent.API, 'dispatch').mockRejectedValue(new Error('handler exploded'));
    expect(
      (await post({ status: 'firing', alerts: [{ labels: { underpost_event: 'public-ingress-down' } }] })).status,
    ).to.equal(202);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.listening).to.equal(true);
  });

  it('reports a port it cannot bind', async () => {
    await expect(UnderpostEvent.API.serve({ port: server.address().port, token: TOKEN })).rejects.toThrow();
  });
});

describe('event CLI', () => {
  beforeEach(() => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: true,
      ids: ['wireguard-spoke-down'],
      reason: '',
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('routes the maintenance flags before every other action', async () => {
    const suspend = vi.spyOn(UnderpostEvent.API, 'suspendEvents').mockResolvedValue({});
    const resume = vi.spyOn(UnderpostEvent.API, 'resumeEvents').mockResolvedValue({});
    await UnderpostEvent.API.callback('', { suspendEvents: '/tmp/state.json', list: true });
    await UnderpostEvent.API.callback('', { resumeEvents: '/tmp/state.json', list: true });
    expect(suspend.mock.calls.length).to.equal(1);
    expect(resume.mock.calls.length).to.equal(1);
  });

  it('prints every declared event with its deployed state', async () => {
    vi.spyOn(UnderpostEvent.API, 'definitions').mockReturnValue([
      {
        id: 'wireguard-spoke-down',
        role: 'spoke',
        description: 'fixture',
        schedule: { probeInterval: '30s', alertFor: '2m' },
        alert: { name: 'FixtureAlert', expr: 'probe_success == 0', for: '2m' },
        probes: [{ module: 'icmp', targets: ['10.0.0.2'] }],
        remediation: [{ spokeId: 'worker-b', address: '10.0.0.3', via: 'ssh', error: 'no route' }],
        notifications: [{ providerId: 'smtp', target: 'ops', recipients: [{ email: 'ops@fixture.test' }] }],
      },
    ]);
    await UnderpostEvent.API.callback('', { list: true });
  });

  it('reports an unreadable cluster and an event no longer declared', async () => {
    vi.spyOn(UnderpostMonitor.API, 'readDeployedEventState').mockReturnValue({
      readable: false,
      ids: ['retired-event'],
      reason: 'no cluster',
    });
    vi.spyOn(UnderpostEvent.API, 'definitions').mockReturnValue([]);
    await UnderpostEvent.API.callback('', { list: true });
  });

  // The ConfigMaps are rendered whole, so publishing one event means rendering
  // every event that must stay published with it.
  it('publishes an event by merging it into the cluster set', async () => {
    const sync = vi.spyOn(UnderpostMonitor.API, 'syncObservability').mockResolvedValue({});
    await UnderpostEvent.API.callback('public-ingress-down', { deploy: true });
    expect(sync.mock.calls[0][0].events).to.deep.equal(['public-ingress-down', 'wireguard-spoke-down']);
  });

  it('withdraws an event by removing it from the cluster set', async () => {
    const sync = vi.spyOn(UnderpostMonitor.API, 'syncObservability').mockResolvedValue({});
    await UnderpostEvent.API.callback('wireguard-spoke-down', { undeploy: true });
    expect(sync.mock.calls[0][0].events).to.deep.equal([]);
  });

  it('refuses a publication that names no event', async () => {
    await expect(UnderpostEvent.API.callback('', { deploy: true })).rejects.toThrow('an event id is required');
    await expect(UnderpostEvent.API.callback('', { undeploy: true })).rejects.toThrow('an event id is required');
  });

  it('routes the service flags to the service reconciler', async () => {
    const service = vi.spyOn(UnderpostEvent.API, 'service').mockReturnValue({});
    for (const flag of ['service', 'serviceStop', 'serviceStatus']) {
      await UnderpostEvent.API.callback('', { [flag]: true });
    }
    expect(service.mock.calls.length).to.equal(3);
  });

  it('runs the receiver in the foreground', async () => {
    const serve = vi.spyOn(UnderpostEvent.API, 'serve').mockResolvedValue({});
    await UnderpostEvent.API.callback('', { serve: true });
    expect(serve.mock.calls.length).to.equal(1);
  });

  it('names the registered events when a dispatch selects none', async () => {
    await expect(UnderpostEvent.API.callback('', {})).rejects.toThrow('an event id is required; one of');
  });

  it('dispatches one event by hand', async () => {
    const dispatch = vi.spyOn(UnderpostEvent.API, 'dispatch').mockResolvedValue({ ok: true, targets: [] });
    expect(await UnderpostEvent.API.callback('wireguard-spoke-down', { dryRun: true })).to.include({ ok: true });
    expect(dispatch.mock.calls[0][0]).to.equal('wireguard-spoke-down');
  });

  it('prints the rehearsal step by step', async () => {
    vi.spyOn(UnderpostEvent.API, 'e2e').mockResolvedValue({
      ok: true,
      steps: [{ name: 'baseline', subject: 'spoke worker-b', ok: true, detail: 'answered' }],
    });
    expect(await UnderpostEvent.API.callback('wireguard-spoke-down', { e2eTest: true })).to.include({ ok: true });
  });
});

describe('dispatcher service reconciliation', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
    vi.spyOn(UnderpostEvent.API, 'serviceJournal').mockReturnValue('journal line\n');
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  it('reports the unit state and the journal when it is not settled', () => {
    const previousExitCode = process.exitCode;
    vi.spyOn(UnderpostEvent.API, 'serviceState').mockReturnValue({
      service: 'underpost-event.service',
      active: 'failed',
      enabled: 'enabled',
      settled: false,
    });
    try {
      expect(UnderpostEvent.API.service({ serviceStatus: true }).active).to.equal('failed');
      expect(process.exitCode).to.equal(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('withdraws the unit and the firewall rule it opened', () => {
    vi.spyOn(UnderpostEvent.API, 'serviceInstalledPort').mockReturnValue(39111);
    const state = UnderpostEvent.API.service({ serviceStop: true });
    expect(state.active).to.equal('inactive');
    expect(harness.ran('39111')).to.equal(true);
    expect(harness.ran('rm -f')).to.equal(true);
  });

  it('refuses to install the dispatcher anywhere but a control node', () => {
    vi.spyOn(UnderpostEvent.API, 'serviceInstalledPort').mockReturnValue(0);
    eventFixture({ hostname: 'hub-node' });
    expect(() => UnderpostEvent.API.service({})).to.throw('must run on a WireGuard control node');
  });

  it('refuses to install a unit no Node binary can start', () => {
    vi.spyOn(UnderpostEvent.API, 'serviceInstalledPort').mockReturnValue(0);
    vi.spyOn(UnderpostEvent.API, 'assertDispatchReady').mockReturnValue([]);
    vi.spyOn(UnderpostEvent.API, 'serviceNodePath').mockReturnValue({ path: '/usr/bin/node', probed: false });
    eventFixture({ hostname: 'control-node' });
    expect(() => UnderpostEvent.API.service({})).to.throw('no Node executable can run');
  });

  it('reports what it would apply under a dry run', () => {
    vi.spyOn(UnderpostEvent.API, 'serviceInstalledPort').mockReturnValue(39111);
    vi.spyOn(UnderpostEvent.API, 'assertDispatchReady').mockReturnValue([]);
    vi.spyOn(UnderpostEvent.API, 'serviceNodePath').mockReturnValue({ path: '/usr/bin/node', probed: true });
    eventFixture({ hostname: 'control-node' });
    const state = UnderpostEvent.API.service({ dryRun: true, port: 39222 });
    expect(state.active).to.equal('dry-run');
    expect(harness.calls.length).to.equal(0);
  });

  it('reconciles the unit and reports a settled service', () => {
    vi.spyOn(UnderpostEvent.API, 'serviceInstalledPort').mockReturnValue(0);
    vi.spyOn(UnderpostEvent.API, 'assertDispatchReady').mockReturnValue([]);
    vi.spyOn(UnderpostEvent.API, 'serviceNodePath').mockReturnValue({ path: '/usr/bin/node', probed: true });
    vi.spyOn(UnderpostEvent.API, 'serviceState').mockReturnValue({
      active: 'active',
      enabled: 'enabled',
      settled: true,
    });
    eventFixture({ hostname: 'control-node' });
    expect(UnderpostEvent.API.service({})).to.include({ active: 'active' });
    expect(harness.ran('systemctl reset-failed underpost-event.service')).to.equal(true);
  });

  it('names the process holding the port when the unit could not bind', () => {
    const previousExitCode = process.exitCode;
    vi.spyOn(UnderpostEvent.API, 'serviceInstalledPort').mockReturnValue(0);
    vi.spyOn(UnderpostEvent.API, 'assertDispatchReady').mockReturnValue([]);
    vi.spyOn(UnderpostEvent.API, 'serviceNodePath').mockReturnValue({ path: '/usr/bin/node', probed: true });
    vi.spyOn(UnderpostEvent.API, 'serviceState').mockReturnValue({
      active: 'failed',
      enabled: 'enabled',
      settled: false,
    });
    vi.spyOn(UnderpostEvent.API, 'serviceJournal').mockReturnValue('Error: listen EADDRINUSE\n');
    eventFixture({ hostname: 'control-node' });
    try {
      expect(UnderpostEvent.API.service({}).active).to.equal('failed');
      expect(process.exitCode).to.equal(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
