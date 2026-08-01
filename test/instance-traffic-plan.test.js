'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  curlStatusChainFactory,
  hostRenderInstancesFactory,
  instanceTrafficPlanFactory,
  isTrafficServingFactory,
  hostIngressFactsFactory,
  nextTrafficFactory,
  stopPlanFactory,
  trafficFromRoutingInfoFactory,
  trafficTableRowsFactory,
} from '../src/server/conf.js';

// Pure resolution over the conf: the cluster lookups are injected, so every case
// here fixes the routed colour and the endpoint readiness explicitly.
const INSTANCES = [
  { id: 'mmo-server', host: 'server.fixture.test', path: '/' },
  { id: 'mmo-server-forest', host: 'server.fixture.test', path: '/FOREST' },
];

const planFactory = ({ live = {}, ready = {}, requestedTraffic = '', instances = INSTANCES } = {}) =>
  instanceTrafficPlanFactory({
    instances,
    requestedTraffic,
    liveTrafficOf: (instance) => live[instance.id],
    servesTraffic: (instance, colour) => ready[`${instance.id}:${colour}`] === true,
  });

describe('blue/green traffic plan', () => {
  describe('curlStatusChainFactory', () => {
    it('extracts every followed response without duplicating -i headers', () => {
      const raw = [
        '< HTTP/1.1 301 Moved Permanently',
        'HTTP/1.1 301 Moved Permanently',
        '< HTTP/2 200',
        'HTTP/2 200',
        'UNDERPOST_CURL_FINAL=200',
      ].join('\n');
      expect(curlStatusChainFactory(raw)).to.deep.equal(['301', '200']);
    });

    it('ignores proxy CONNECT acknowledgements and reports no-response as 000', () => {
      expect(curlStatusChainFactory('< HTTP/1.1 200 Connection established\nUNDERPOST_CURL_FINAL=000')).to.deep.equal([
        '000',
      ]);
    });

    it('uses curl write-out when no verbose response line was emitted', () => {
      expect(curlStatusChainFactory('UNDERPOST_CURL_FINAL=204')).to.deep.equal(['204']);
    });
  });

  describe('nextTrafficFactory', () => {
    it('flips the live colour', () => {
      expect(nextTrafficFactory('blue')).to.equal('green');
      expect(nextTrafficFactory('green')).to.equal('blue');
    });

    it('starts on blue when no colour is live', () => {
      for (const live of ['', undefined, null]) expect(nextTrafficFactory(live)).to.equal('blue');
    });

    it('honours an explicitly requested colour over the flip', () => {
      expect(nextTrafficFactory('blue', 'blue')).to.equal('blue');
      expect(nextTrafficFactory('green', 'green')).to.equal('green');
    });

    it('ignores a request that is not a colour', () => {
      for (const requested of ['', 'red', 'BLUE', undefined])
        expect(nextTrafficFactory('blue', requested)).to.equal('green');
    });
  });

  // `run sync` gates its no-backend checkpoint on this directly; `run instance`
  // reaches it through instanceTrafficPlanFactory. One definition, so neither
  // runner can decide differently about taking a live host offline.
  describe('isTrafficServingFactory', () => {
    it('is serving only when the routed colour is also reachable', () => {
      expect(isTrafficServingFactory({ liveTraffic: 'blue', hasReadyEndpoints: () => true })).to.equal(true);
      expect(isTrafficServingFactory({ liveTraffic: 'blue', hasReadyEndpoints: () => false })).to.equal(false);
    });

    it('is not serving when no colour is routed', () => {
      for (const liveTraffic of ['', undefined, null])
        expect(isTrafficServingFactory({ liveTraffic, hasReadyEndpoints: () => true })).to.equal(false);
    });

    it('asks about the routed colour, and only when one is routed', () => {
      const asked = [];
      isTrafficServingFactory({
        liveTraffic: 'green',
        hasReadyEndpoints: (colour) => {
          asked.push(colour);
          return true;
        },
      });
      isTrafficServingFactory({
        liveTraffic: '',
        hasReadyEndpoints: (colour) => {
          asked.push(colour);
          return true;
        },
      });
      expect(asked).to.deep.equal(['green']);
    });

    it('defaults to not serving with nothing supplied', () => {
      expect(isTrafficServingFactory({})).to.equal(false);
    });
  });

  describe('instanceTrafficPlanFactory', () => {
    it('flips every instance off the colour it serves', () => {
      const { liveTrafficById, targetTrafficById } = planFactory({
        live: { 'mmo-server': 'blue', 'mmo-server-forest': 'green' },
        ready: { 'mmo-server:blue': true, 'mmo-server-forest:green': true },
      });
      expect(liveTrafficById).to.deep.equal({ 'mmo-server': 'blue', 'mmo-server-forest': 'green' });
      expect(targetTrafficById).to.deep.equal({ 'mmo-server': 'green', 'mmo-server-forest': 'blue' });
    });

    // The regression this guards: a re-deploy of a healthy host must not be
    // mistaken for a first bring-up, because the no-backend fallback checkpoint
    // gated on `serving` routes the edge at a colour that has no Deployment.
    it('reports a routed colour with a ready endpoint as serving', () => {
      const { serving } = planFactory({
        live: { 'mmo-server': 'blue', 'mmo-server-forest': 'blue' },
        ready: { 'mmo-server:blue': true, 'mmo-server-forest:blue': true },
      });
      expect(serving.map((instance) => instance.id)).to.deep.equal(['mmo-server', 'mmo-server-forest']);
    });

    it('reports nothing serving on a first bring-up', () => {
      const { serving, targetTrafficById } = planFactory({ live: {}, ready: {} });
      expect(serving).to.deep.equal([]);
      expect(targetTrafficById).to.deep.equal({ 'mmo-server': 'blue', 'mmo-server-forest': 'blue' });
    });

    // A route can still name a colour whose workload is long gone; that is a
    // dead route, not traffic, so the checkpoint is free to run.
    it('does not treat a routed colour without a ready endpoint as serving', () => {
      const { serving, targetTrafficById } = planFactory({
        live: { 'mmo-server': 'blue', 'mmo-server-forest': 'blue' },
        ready: {},
      });
      expect(serving).to.deep.equal([]);
      expect(targetTrafficById).to.deep.equal({ 'mmo-server': 'green', 'mmo-server-forest': 'green' });
    });

    it('counts only the instances that are actually serving', () => {
      const { serving } = planFactory({
        live: { 'mmo-server': 'blue', 'mmo-server-forest': 'blue' },
        ready: { 'mmo-server:blue': true },
      });
      expect(serving.map((instance) => instance.id)).to.deep.equal(['mmo-server']);
    });

    // Readiness is asked about the live colour only. An idle colour left Ready by
    // a previous cycle is not what the host is serving on.
    it('ignores readiness of a colour that is not routed', () => {
      const { serving } = planFactory({
        live: { 'mmo-server': 'blue' },
        ready: { 'mmo-server:green': true },
        instances: [INSTANCES[0]],
      });
      expect(serving).to.deep.equal([]);
    });

    it('never consults readiness when no colour is routed', () => {
      const asked = [];
      const { serving } = instanceTrafficPlanFactory({
        instances: INSTANCES,
        liveTrafficOf: () => '',
        servesTraffic: (instance, colour) => {
          asked.push(`${instance.id}:${colour}`);
          return true;
        },
      });
      expect(asked).to.deep.equal([]);
      expect(serving).to.deep.equal([]);
    });

    it('applies a requested colour to every instance', () => {
      const { targetTrafficById } = planFactory({
        live: { 'mmo-server': 'blue', 'mmo-server-forest': 'green' },
        requestedTraffic: 'blue',
      });
      expect(targetTrafficById).to.deep.equal({ 'mmo-server': 'blue', 'mmo-server-forest': 'blue' });
    });

    it('is a no-op with no instances', () => {
      expect(instanceTrafficPlanFactory({})).to.deep.equal({
        liveTrafficById: {},
        targetTrafficById: {},
        serving: [],
      });
    });
  });

  // A host's server block and HTTPRoute are single shared objects, so what the
  // render is built from decides which variants keep a route at all.
  describe('hostRenderInstancesFactory', () => {
    const MAIN = INSTANCES[0];
    const FOREST = INSTANCES[1];
    const TEST = { id: 'mmo-server-test', host: 'server.fixture.test', path: '/TEST' };

    // The reported regression: trimming the conf to one variant must not delete
    // the routes of the variants still deployed behind the same host.
    it('keeps a still-deployed variant that the conf no longer declares', () => {
      const rendered = hostRenderInstancesFactory({
        declared: [FOREST],
        preserved: [MAIN, FOREST, TEST],
        isDeployed: () => true,
      });
      expect(rendered.map((instance) => instance.id)).to.deep.equal([
        'mmo-server-forest',
        'mmo-server',
        'mmo-server-test',
      ]);
    });

    it('drops a preserved variant once its workload is gone', () => {
      const rendered = hostRenderInstancesFactory({
        declared: [FOREST],
        preserved: [MAIN, TEST],
        isDeployed: (instance) => instance.id === 'mmo-server',
      });
      expect(rendered.map((instance) => instance.id)).to.deep.equal(['mmo-server-forest', 'mmo-server']);
    });

    it('never duplicates a variant that is both declared and preserved', () => {
      const rendered = hostRenderInstancesFactory({
        declared: [MAIN, FOREST],
        preserved: [MAIN, FOREST],
        isDeployed: () => true,
      });
      expect(rendered.map((instance) => instance.id)).to.deep.equal(['mmo-server', 'mmo-server-forest']);
    });

    // The declared entry is the current truth for that id; a stale preserved copy
    // of the same id must not shadow it.
    it('prefers the declared entry over a preserved one of the same id', () => {
      const rendered = hostRenderInstancesFactory({
        declared: [{ ...FOREST, path: '/FOREST-NEW' }],
        preserved: [{ ...FOREST, path: '/FOREST-OLD' }],
        isDeployed: () => true,
      });
      expect(rendered).to.have.lengthOf(1);
      expect(rendered[0].path).to.equal('/FOREST-NEW');
    });

    it('ignores preserved entries with no id', () => {
      expect(
        hostRenderInstancesFactory({ declared: [FOREST], preserved: [{}, null], isDeployed: () => true }),
      ).to.deep.equal([FOREST]);
    });

    it('is the declared set when nothing was preserved', () => {
      expect(hostRenderInstancesFactory({ declared: [MAIN, FOREST] })).to.deep.equal([MAIN, FOREST]);
      expect(hostRenderInstancesFactory({})).to.deep.equal([]);
    });
  });

  describe('stopPlanFactory', () => {
    const FAMILY = {
      'mmo-server': [
        { id: 'mmo-server', host: 'server.fixture.test' },
        { id: 'mmo-server-forest', host: 'server.fixture.test' },
      ],
      'mmo-client': [{ id: 'mmo-client', host: 'client.fixture.test' }],
    };
    const plan = (input) =>
      stopPlanFactory({
        env: 'development',
        instancesFor: (instanceId) => FAMILY[instanceId] || [],
        liveTrafficOf: () => 'blue',
        ...input,
      });
    const names = (input) => plan(input).deployments.map((target) => target.deployment);

    // 1 — default is the partner of whatever is serving.
    it('stops the inactive colour of the PWA workload', () => {
      expect(names({ deployId: 'dd-cyberia' })).to.deep.equal(['dd-cyberia-development-green']);
    });

    it('stops the colours named by --traffic, both when both are given', () => {
      expect(names({ deployId: 'dd-cyberia', traffic: 'blue,green' })).to.deep.equal([
        'dd-cyberia-development-blue',
        'dd-cyberia-development-green',
      ]);
      expect(names({ deployId: 'dd-cyberia', traffic: 'blue' })).to.deep.equal(['dd-cyberia-development-blue']);
    });

    it('refuses a --traffic value that is not a colour', () => {
      expect(plan({ deployId: 'dd-cyberia', traffic: 'red' }).error).to.match(/--traffic accepts blue and\/or green/);
    });

    // 2 — a literal path names the object outright and overrides every flag.
    it('stops exactly the literal deployment, ignoring flags', () => {
      const result = plan({
        path: 'dd-cyberia-mmo-server-forest-development-blue',
        deployId: 'dd-other',
        instanceId: 'mmo-client',
        traffic: 'blue,green',
      });
      expect(result.deployments.map((target) => target.deployment)).to.deep.equal([
        'dd-cyberia-mmo-server-forest-development-blue',
      ]);
      expect(result.deployments[0].kind).to.equal('literal');
    });

    it('accepts several literal deployments', () => {
      expect(names({ path: 'a-development-blue, b-development-green' })).to.deep.equal([
        'a-development-blue',
        'b-development-green',
      ]);
    });

    // 3 + 4 — instance ids add their whole family alongside the PWA workload.
    it('adds every variant of each instance family', () => {
      expect(names({ deployId: 'dd-cyberia', instanceId: 'mmo-client,mmo-server' })).to.deep.equal([
        'dd-cyberia-development-green',
        'dd-cyberia-mmo-client-development-green',
        'dd-cyberia-mmo-server-development-green',
        'dd-cyberia-mmo-server-forest-development-green',
      ]);
    });

    it('applies explicit colours to the PWA workload and every instance alike', () => {
      expect(names({ deployId: 'dd-cyberia', instanceId: 'mmo-client', traffic: 'blue,green' })).to.deep.equal([
        'dd-cyberia-development-blue',
        'dd-cyberia-development-green',
        'dd-cyberia-mmo-client-development-blue',
        'dd-cyberia-mmo-client-development-green',
      ]);
    });

    it('resolves each target its own colour', () => {
      const deployments = plan({
        deployId: 'dd-cyberia',
        instanceId: 'mmo-server',
        liveTrafficOf: (target) => (target.id === 'dd-cyberia-mmo-server' ? 'green' : 'blue'),
      }).deployments;
      expect(deployments.map((target) => target.deployment)).to.deep.equal([
        'dd-cyberia-development-green',
        'dd-cyberia-mmo-server-development-blue',
        'dd-cyberia-mmo-server-forest-development-green',
      ]);
    });

    it('never plans the same deployment twice', () => {
      expect(names({ deployId: 'dd-cyberia', instanceId: 'mmo-server,mmo-server' })).to.deep.equal([
        'dd-cyberia-development-green',
        'dd-cyberia-mmo-server-development-green',
        'dd-cyberia-mmo-server-forest-development-green',
      ]);
    });

    // 5 — an instance id is only unique inside a deploy.
    it('refuses --instance-id without --deploy-id', () => {
      const result = plan({ instanceId: 'mmo-server' });
      expect(result.error).to.match(/--instance-id requires --deploy-id/);
      expect(result.deployments).to.deep.equal([]);
    });

    it('refuses a plan with nothing to act on', () => {
      expect(plan({}).error).to.match(/nothing to stop/);
    });

    it('passes the instance host through for colour resolution', () => {
      const asked = [];
      plan({
        deployId: 'dd-cyberia',
        instanceId: 'mmo-client',
        liveTrafficOf: (target) => {
          asked.push([target.id, target.host, target.kind]);
          return 'blue';
        },
      });
      expect(asked).to.deep.equal([
        ['dd-cyberia', '', 'pwa'],
        ['dd-cyberia-mmo-client', 'client.fixture.test', 'instance'],
      ]);
    });
  });

  // One host's routing text is matched against several deployments and both
  // environments, so the match has to be exact about which name it is reading.
  describe('trafficFromRoutingInfoFactory', () => {
    const INFO = [
      'name: dd-cyberia-mmo-server-development-green-service',
      'name: dd-cyberia-mmo-server-forest-development-blue-service',
      'name: dd-cyberia-development-blue-service',
    ].join('\n');

    it('reads each deployment its own colour from a shared host', () => {
      expect(trafficFromRoutingInfoFactory({ info: INFO, deployId: 'dd-cyberia', env: 'development' })).to.equal(
        'blue',
      );
      expect(
        trafficFromRoutingInfoFactory({ info: INFO, deployId: 'dd-cyberia-mmo-server', env: 'development' }),
      ).to.equal('green');
      expect(
        trafficFromRoutingInfoFactory({ info: INFO, deployId: 'dd-cyberia-mmo-server-forest', env: 'development' }),
      ).to.equal('blue');
    });

    it('reads the colour from the stable Service selector', () => {
      expect(
        trafficFromRoutingInfoFactory({
          info: 'dd-cyberia-development-green',
          deployId: 'dd-cyberia',
          env: 'development',
        }),
      ).to.equal('green');
    });

    // The reported failure: a development cluster reported as entirely unrouted
    // because every match was anchored on `-production-`.
    it('finds nothing for an environment the routing does not mention', () => {
      expect(trafficFromRoutingInfoFactory({ info: INFO, deployId: 'dd-cyberia', env: 'production' })).to.equal(null);
    });

    it('is null when there is no routing text', () => {
      for (const info of ['', '   \n ', undefined])
        expect(trafficFromRoutingInfoFactory({ info, deployId: 'dd-cyberia', env: 'development' })).to.equal(null);
    });

    it('does not let a regex metacharacter in the id match loosely', () => {
      expect(
        trafficFromRoutingInfoFactory({
          info: 'name: dd-any-development-blue-service',
          deployId: 'dd.any',
          env: 'development',
        }),
      ).to.equal(null);
    });

    it('falls back to a whole-text match with no environment', () => {
      expect(trafficFromRoutingInfoFactory({ info: 'routes to green here', deployId: 'dd-cyberia' })).to.equal('green');
      expect(trafficFromRoutingInfoFactory({ info: 'nothing routed', deployId: 'dd-cyberia' })).to.equal(null);
    });
  });

  // None of these three is readable from the route object alone, which is why
  // the report correlates four kinds instead of reading one.
  describe('hostIngressFactsFactory', () => {
    const GATEWAYS = [
      {
        metadata: { name: 'dd-cyberia-development' },
        spec: {
          listeners: [
            { name: 'http', protocol: 'HTTP' },
            { name: 'https', protocol: 'HTTPS', tls: { certificateRefs: [{ name: 'underpost.net' }] } },
          ],
        },
      },
      { metadata: { name: 'dd-plain-development' }, spec: { listeners: [{ name: 'http', protocol: 'HTTP' }] } },
    ];
    const POLICIES = [
      { spec: { targetRefs: [{ kind: 'Gateway', name: 'dd-cyberia-development', sectionName: 'https' }], http3: {} } },
    ];

    it('reads the kind, TLS and HTTP/3 for a Gateway API host', () => {
      const facts = hostIngressFactsFactory({
        httpRoutes: [{ spec: { hostnames: ['underpost.net'], parentRefs: [{ name: 'dd-cyberia-development' }] } }],
        gateways: GATEWAYS,
        clientTrafficPolicies: POLICIES,
      });
      expect(facts['underpost.net']).to.deep.equal({ route: 'HTTPRoute', tls: true, http3: true });
    });

    it('reads TLS from an HTTPProxy virtualhost, and never claims HTTP/3 for it', () => {
      const facts = hostIngressFactsFactory({
        httpProxies: [
          { spec: { virtualhost: { fqdn: 'legacy.test', tls: { secretName: 'legacy' } } } },
          { spec: { virtualhost: { fqdn: 'plain.test' } } },
        ],
      });
      expect(facts['legacy.test']).to.deep.equal({ route: 'HTTPProxy', tls: true, http3: false });
      expect(facts['plain.test']).to.deep.equal({ route: 'HTTPProxy', tls: false, http3: false });
    });

    it('reports no TLS for a Gateway with only a plain HTTP listener', () => {
      const facts = hostIngressFactsFactory({
        httpRoutes: [{ spec: { hostnames: ['plain.test'], parentRefs: [{ name: 'dd-plain-development' }] } }],
        gateways: GATEWAYS,
      });
      expect(facts['plain.test']).to.deep.equal({ route: 'HTTPRoute', tls: false, http3: false });
    });

    // QUIC only exists where TLS does, so a policy on a plain listener describes
    // nothing — the implementation rejects it too.
    it('does not claim HTTP/3 from a policy targeting a Gateway with no TLS listener', () => {
      const facts = hostIngressFactsFactory({
        httpRoutes: [{ spec: { hostnames: ['plain.test'], parentRefs: [{ name: 'dd-plain-development' }] } }],
        gateways: GATEWAYS,
        clientTrafficPolicies: [{ spec: { targetRefs: [{ name: 'dd-plain-development' }], http3: {} } }],
      });
      expect(facts['plain.test'].http3).to.equal(false);
    });

    it('lets the HTTPRoute win a host described by both kinds', () => {
      const facts = hostIngressFactsFactory({
        httpRoutes: [{ spec: { hostnames: ['dual.test'], parentRefs: [{ name: 'dd-cyberia-development' }] } }],
        httpProxies: [{ spec: { virtualhost: { fqdn: 'dual.test' } } }],
        gateways: GATEWAYS,
        clientTrafficPolicies: POLICIES,
      });
      expect(facts['dual.test']).to.deep.equal({ route: 'HTTPRoute', tls: true, http3: true });
    });

    it('yields nothing for missing CRDs or malformed items', () => {
      expect(hostIngressFactsFactory()).to.deep.equal({});
      expect(hostIngressFactsFactory({ httpProxies: [{ spec: {} }], httpRoutes: [{ spec: {} }] })).to.deep.equal({});
    });
  });

  describe('trafficTableRowsFactory', () => {
    const ENTRIES = [
      { kind: 'pwa', deployId: 'dd-a', id: 'dd-a', host: 'a.test', path: '/', deployment: 'dd-a-development' },
      {
        kind: 'instance',
        deployId: 'dd-a',
        id: 'dd-a-mmo-server',
        host: 'server.test',
        path: '/',
        deployment: 'dd-a-mmo-server-development',
      },
    ];

    it('reports both deployment kinds with their live colour', () => {
      const rows = trafficTableRowsFactory({
        entries: ENTRIES,
        liveTrafficOf: (entry) => (entry.kind === 'pwa' ? 'blue' : 'green'),
        servesTraffic: () => true,
      });
      expect(rows.map((row) => [row.kind, row.traffic, row.serving])).to.deep.equal([
        ['pwa', 'blue', true],
        ['instance', 'green', true],
      ]);
    });

    it('narrows to the requested hosts', () => {
      const rows = trafficTableRowsFactory({ entries: ENTRIES, hosts: ['server.test'], liveTrafficOf: () => 'blue' });
      expect(rows.map((row) => row.host)).to.deep.equal(['server.test']);
    });

    it('reports every host when none are requested', () => {
      for (const hosts of [[], ['']])
        expect(trafficTableRowsFactory({ entries: ENTRIES, hosts, liveTrafficOf: () => 'blue' })).to.have.lengthOf(2);
    });

    // A deployment with no published route is a real state to report, not a row
    // to hide: it is exactly what a half-finished promote looks like.
    it('keeps an entry whose colour cannot be read', () => {
      const rows = trafficTableRowsFactory({ entries: ENTRIES, liveTrafficOf: () => null, servesTraffic: () => true });
      expect(rows.map((row) => [row.traffic, row.serving])).to.deep.equal([
        ['', false],
        ['', false],
      ]);
    });

    it('reports a routed colour with no ready endpoint as not serving', () => {
      const rows = trafficTableRowsFactory({
        entries: [ENTRIES[0]],
        liveTrafficOf: () => 'blue',
        servesTraffic: () => false,
      });
      expect(rows[0]).to.include({ traffic: 'blue', serving: false });
    });

    it('is empty with no entries', () => {
      expect(trafficTableRowsFactory({})).to.deep.equal([]);
    });

    it('feeds the report from stable Service selectors before legacy route text', () => {
      const runSource = fs.readFileSync(new URL('../src/cli/run.js', import.meta.url), 'utf8');
      const start = runSource.indexOf("    'get-traffic': async");
      const end = runSource.indexOf("    'instance-promote': async", start);
      const getTraffic = runSource.slice(start, end);
      const listServices = getTraffic.indexOf("listResources('service')");
      const stableSelector = getTraffic.indexOf('const stableTraffic = trafficFromRoutingInfoFactory');
      const legacyRoute = getTraffic.indexOf('const legacyTraffic = trafficFromRoutingInfoFactory');
      expect(listServices).to.be.greaterThan(-1);
      expect(stableSelector).to.be.greaterThan(listServices);
      expect(legacyRoute).to.be.greaterThan(stableSelector);
    });

    it('uses real followed curl probes and reports current and opposite deployment status without ENV', () => {
      const runSource = fs.readFileSync(new URL('../src/cli/run.js', import.meta.url), 'utf8');
      const start = runSource.indexOf("    'get-traffic': async");
      const end = runSource.indexOf("    'instance-promote': async", start);
      const getTraffic = runSource.slice(start, end);
      expect(getTraffic).to.include('curl -L -v -i -s');
      expect(getTraffic).to.include("'OPPOSITE'");
      expect(getTraffic).not.to.include('showOpposite');
      expect(getTraffic).to.include("'CURRENT'");
      expect(getTraffic).not.to.include("'ENV',");
      expect(getTraffic).to.include('opposite,');
      expect(getTraffic).to.include("status.exists ? (status.ready ? 'ready' : 'not-ready') : 'missing'");
      expect(getTraffic).to.include("status.serving ? 'serving' : 'not-serving'");
      expect(getTraffic).to.include("`${probe.path} [${probe.statuses.join('→')}]`");
    });

    it('caches stable Service readiness across hosts sharing the same deployment', () => {
      const runSource = fs.readFileSync(new URL('../src/cli/run.js', import.meta.url), 'utf8');
      const start = runSource.indexOf("    'get-traffic': async");
      const end = runSource.indexOf("    'instance-promote': async", start);
      const getTraffic = runSource.slice(start, end);
      expect(getTraffic).to.include('const servingState = {}');
      expect(getTraffic).to.include('if (servingState[key] === undefined)');
    });
  });
});
