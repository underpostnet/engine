'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  UNDERPOST_GATEWAY,
  hostServerConfFactory,
  kubernetesUpstreamFactory,
  writeHostServerConf,
  underpostGatewayManifestsFactory,
  nginxConfFactory,
  staticLocationFactory,
  staticPathSegmentFactory,
  statusPageAssetPathFactory,
  statusPageBuildSegment,
} from '../src/server/underpost-gateway.js';
import { staticContextRoutesFactory, statusPageRoutesFactory } from '../src/client-builder/client-build.js';

// A `conf.ssr.json` client entry: two intercepted contexts, one status page,
// and one ordinary view that must stay with the workload.
const VIEWS = [
  { path: '/offline', title: 'No Network Connection', client: 'NoNetworkConnection', offlineDefault: true },
  { path: '/maintenance', title: 'Server Maintenance', client: 'Maintenance', maintenanceDefault: true },
  { path: '/test', title: 'Test', client: 'Test' },
  { path: '/404', title: '404 Instance Not Found', client: 'Cyberia404' },
];

const manifests = (overrides = {}) =>
  underpostGatewayManifestsFactory({
    namespace: 'default',
    hostPath: `/home/dd/engine/volume/${UNDERPOST_GATEWAY.volumeName}`,
    nodeName: 'node-a',
    ...overrides,
  })
    .split('\n---\n')
    .filter((doc) => doc.trim());

const kind = (docs, name) => docs.find((doc) => doc.includes(`\nkind: ${name}\n`));

// Undo the block-scalar indent the ConfigMap wraps the config in, which is the
// step that would corrupt it. The trailing newline is the document separator's,
// stripped on the way in and restored here.
const CONFIG_MAP_KEY = '  nginx.conf: |\n';
const configMapNginxConf = (docs) => {
  const configMap = kind(docs, 'ConfigMap');
  return `${configMap
    .slice(configMap.indexOf(CONFIG_MAP_KEY) + CONFIG_MAP_KEY.length)
    .split('\n')
    .map((line) => (line.length > 0 ? line.slice(4) : line))
    .join('\n')}\n`;
};

describe('underpost gateway edge tier', () => {
  describe('view selection', () => {
    it('routes status pages and intercepted contexts to the edge, and nothing else', () => {
      expect(statusPageRoutesFactory({ views: VIEWS, proxyPath: '/' }).map((route) => route.status)).to.deep.equal([
        '404',
      ]);
      expect(staticContextRoutesFactory({ views: VIEWS, proxyPath: '/' }).map((route) => route.context)).to.deep.equal([
        'offline',
        'maintenance',
      ]);
    });

    it('scopes both kinds to the instance sub-path', () => {
      expect(statusPageRoutesFactory({ views: VIEWS, proxyPath: '/FOREST' })[0].routePath).to.equal('/FOREST/404');
      expect(staticContextRoutesFactory({ views: VIEWS, proxyPath: '/FOREST' })[0].routePath).to.equal(
        '/FOREST/offline',
      );
    });
  });

  describe('document layout', () => {
    it('folds the root sub-path into a directory of its own', () => {
      expect(staticPathSegmentFactory('/')).to.equal('root');
      expect(staticPathSegmentFactory('/FOREST')).to.equal('FOREST');
      expect(staticPathSegmentFactory('/a/b')).to.equal('a-b');
    });

    it('keeps each document in a directory, so a prefix rewrite covers what sits beside it', () => {
      const location = statusPageAssetPathFactory({ host: 'www.cyberiaonline.com', path: '/', status: 404 });
      expect(location.assetPath).to.equal('www.cyberiaonline.com/root/status-pages/404/index.html');
      expect(location.dir).to.equal('/www.cyberiaonline.com/root/status-pages/404');
      expect(location.url).to.equal('/www.cyberiaonline.com/root/status-pages/404/index.html');
      expect(location.assetPath).to.equal(`${location.dir}/index.html`.slice(1));
    });

    it('separates instances of the same host', () => {
      const forest = statusPageAssetPathFactory({ host: 'client.cyberiaonline.com', path: '/FOREST', status: 404 });
      const root = statusPageAssetPathFactory({ host: 'client.cyberiaonline.com', path: '/', status: 404 });
      expect(forest.assetPath).to.equal('client.cyberiaonline.com/FOREST/status-pages/404/index.html');
      expect(forest.assetPath).to.not.equal(root.assetPath);
    });

    it('gives contexts the same shape as status pages', () => {
      expect(staticLocationFactory({ host: 'underpost.net', path: '/', context: 'offline' }).assetPath).to.equal(
        'underpost.net/root/offline/index.html',
      );
    });
  });

  describe('nginx config', () => {
    const conf = nginxConfFactory();

    it('resolves a prefix rewrite onto a directory through its index', () => {
      expect(conf).to.include('try_files $uri $uri/index.html =404;');
      expect(conf).to.include(`root ${UNDERPOST_GATEWAY.root};`);
    });

    // Every upstream is dialled through a variable so a redeployed Service is
    // re-resolved; that requires a resolver, and nginx cannot resolve its own.
    it('carries a literal resolver address and includes the per-host blocks', () => {
      expect(conf).to.match(/resolver \d+\.\d+\.\d+\.\d+ valid=/);
      expect(conf).to.include(`include ${UNDERPOST_GATEWAY.root}/${UNDERPOST_GATEWAY.confDir}/*.conf;`);
      expect(nginxConfFactory({ resolver: '10.0.0.10' })).to.include('resolver 10.0.0.10 valid=');
    });

    it('defines the websocket upgrade map the host blocks reference', () => {
      expect(conf).to.include('map $http_upgrade $connection_upgrade');
    });

    // A 200 would let the PWA service worker store the shared page as the
    // host's own and keep serving it after the real document lands.
    it('serves the shared fallback as a 404 that is never stored', () => {
      expect(conf).to.include(`error_page 404 /${UNDERPOST_GATEWAY.defaultHostDir}/status-pages/404/index.html;`);
      expect(conf).to.match(/location = \/default\/status-pages\/404\/index\.html \{\s*\n\s*internal;/);
      expect(conf).to.include("add_header Cache-Control 'no-store' always;");
    });
  });

  // Interception is the whole reason Nginx sits in the request path: the status
  // code and the client's URI survive, and the document is read from disk so its
  // size is unbounded — none of which an inline Envoy body can do.
  describe('host server blocks', () => {
    const conf = () =>
      hostServerConfFactory({
        host: 'server.fixture.test',
        routes: [
          { path: '/', upstream: 'root-service:8083', statuses: { 404: 'status-pages/404' } },
          {
            path: '/FOREST',
            upstream: 'forest-service:8083',
            statuses: { 404: 'status-pages/404', 503: 'maintenance' },
            stripPrefix: true,
          },
        ],
      });

    it('intercepts each sub-path onto its own document', () => {
      expect(conf()).to.include('proxy_intercept_errors on;');
      expect(conf()).to.include('error_page 404 @status_FOREST_404;');
      expect(conf()).to.include('try_files /server.fixture.test/FOREST/status-pages/404/index.html =404;');
      expect(conf()).to.include('try_files /server.fixture.test/root/status-pages/404/index.html =404;');
    });

    it('qualifies short Service names for the runtime DNS resolver', () => {
      expect(conf()).to.include('set $upstream_root root-service.default.svc.cluster.local:8083;');
      expect(conf()).to.include('set $upstream_FOREST forest-service.default.svc.cluster.local:8083;');
      expect(kubernetesUpstreamFactory('svc:80', 'games')).to.equal('svc.games.svc.cluster.local:80');
      expect(kubernetesUpstreamFactory('svc.other.svc.cluster.local:80', 'games')).to.equal(
        'svc.other.svc.cluster.local:80',
      );
      expect(kubernetesUpstreamFactory('10.0.0.8:80', 'games')).to.equal('10.0.0.8:80');
    });

    // The rewritten document path arrives at this same server block. Without a
    // location for it, `location /` proxies it to the application, which has no
    // such route — and an application that redirects its own 404s then bounces
    // between the route and the rewrite until the browser gives up.
    it("serves the host's own documents from disk instead of proxying them", () => {
      expect(conf()).to.include('location /server.fixture.test/ {');
      const documentLocation = conf().slice(conf().indexOf('location /server.fixture.test/ {'));
      expect(documentLocation.slice(0, documentLocation.indexOf('}'))).to.include(
        'try_files $uri $uri/index.html =404;',
      );
    });

    // Longer prefix than the proxied root, so nginx prefers it.
    it('places the document location ahead of the proxy', () => {
      expect(conf().indexOf('location /server.fixture.test/ {')).to.be.lessThan(conf().indexOf('location / {'));
    });

    // A dead workload is what a maintenance page is for.
    it('answers upstream failure from the maintenance context', () => {
      expect(conf()).to.include('error_page 503 @status_FOREST_503;');
      expect(conf()).to.include('try_files /server.fixture.test/FOREST/maintenance/index.html =503;');
    });

    // `error_page 404 @x` keeps the upstream's status; `error_page 404 = @x`
    // would replace it with the status of the page itself.
    it('never rewrites the status it intercepted', () => {
      expect(conf()).to.not.match(/error_page \d+ = /);
      expect(conf()).to.not.include('return 30');
      expect(conf()).to.not.include('location.replace');
    });

    it('strips a variant prefix only where the instance asks for it', () => {
      expect(conf()).to.include('rewrite ^/FOREST/?(.*)$ /$1 break;');
      expect(conf()).to.not.include('rewrite ^//?');
    });

    // nginx variable names admit only word characters.
    it('emits identifiers nginx accepts for a multi-segment path', () => {
      const nested = hostServerConfFactory({
        host: 'h.test',
        routes: [{ path: '/a/b', upstream: 'svc:80', statuses: { 404: 'status-pages/404' } }],
      });
      expect(nested).to.include('set $upstream_a_b svc.default.svc.cluster.local:80;');
      expect(nested).to.not.match(/\$upstream_\S*-/);
    });

    // The map lives in the base config; the header that uses it lives here.
    it('forwards websocket upgrades across the proxied hop', () => {
      expect(conf()).to.include('proxy_set_header Upgrade $http_upgrade;');
      expect(conf()).to.include('proxy_set_header Connection $connection_upgrade;');
    });

    it('proxies without interception when nothing is declared', () => {
      const bare = hostServerConfFactory({ host: 'h.test', routes: [{ path: '/', upstream: 'svc:80' }] });
      expect(bare).to.include('proxy_intercept_errors off;');
      expect(bare).to.not.include('error_page');
    });

    it('renders nothing for a host that proxies nothing', () => {
      expect(hostServerConfFactory({ host: 'h.test', routes: [] })).to.equal('');
      expect(hostServerConfFactory({ host: 'h.test', routes: [{ path: '/' }] })).to.equal('');
    });
  });

  describe('workload manifests', () => {
    it('renders the whole workload as one document set', () => {
      expect(manifests().map((doc) => /\nkind: (\w+)\n/.exec(doc)[1])).to.deep.equal([
        'ConfigMap',
        'PersistentVolume',
        'PersistentVolumeClaim',
        'Deployment',
        'Service',
      ]);
    });

    it('carries the rendered nginx.conf verbatim', () => {
      expect(configMapNginxConf(manifests())).to.equal(nginxConfFactory());
    });

    // The config is mounted with `subPath`, which Kubernetes never refreshes in
    // place: without a pod-template change an edited nginx.conf reaches the
    // ConfigMap and nothing else.
    it('rolls the pod when the config changes, and only then', () => {
      const hash = (docs) => /underpost\.net\/nginx-conf-hash: '(\w+)'/.exec(kind(docs, 'Deployment'))[1];
      expect(hash(manifests())).to.have.length(16);
      expect(hash(manifests())).to.equal(hash(manifests({ storage: '2Gi' })));
    });

    it('pins the volume to the node holding the documents', () => {
      const pv = kind(manifests(), 'PersistentVolume');
      expect(pv).to.include(`path: /home/dd/engine/volume/${UNDERPOST_GATEWAY.volumeName}`);
      expect(pv).to.include('- node-a');
    });

    it('omits node affinity when no node is resolved', () => {
      expect(kind(manifests({ nodeName: '' }), 'PersistentVolume')).to.not.include('nodeAffinity');
    });
  });

  // A backtick anywhere inside these templates closes the literal early and the
  // rest is evaluated as JavaScript, so the factory silently returns a number.
  describe('config template integrity', () => {
    it('renders a string, not an expression', () => {
      expect(nginxConfFactory()).to.be.a('string').with.length.greaterThan(0);
      expect(
        hostServerConfFactory({
          host: 'h.test',
          routes: [{ path: '/', upstream: 's:80', statuses: { 404: 'status-pages/404' } }],
        }),
      )
        .to.be.a('string')
        .with.length.greaterThan(0);
    });
  });

  // The client's URI must survive a status page being served. Interception is the
  // only delivery path that keeps it: a route for `/404` would make the page a
  // destination, and every hop to a destination is a URI the client did not ask
  // for. Contexts are different — `/offline` is an address a client requests and
  // the service worker precaches by URL.
  describe('status delivery preserves the URI', () => {
    const statusView = (path) => /^\/([1-5]\d{2})$/.test(path);

    it('separates status pages from routable contexts', () => {
      const views = [
        { path: '/404', client: 'S404' },
        { path: '/offline', client: 'Off', offlineDefault: true },
        { path: '/maintenance', client: 'Mnt', maintenanceDefault: true },
      ];
      expect(statusPageRoutesFactory({ views, proxyPath: '/' }).map((r) => r.routePath)).to.deep.equal(['/404']);
      expect(staticContextRoutesFactory({ views, proxyPath: '/' }).map((r) => r.routePath)).to.deep.equal([
        '/offline',
        '/maintenance',
      ]);
      // Only the contexts are emitted as routes; the status page is not.
      expect(views.filter((v) => statusView(v.path)).length).to.equal(1);
    });

    // Every reachable path in the block is either the proxy or an internal
    // interception target — never an outward-facing status page URL.
    it('exposes no status page as a request target', () => {
      const conf = hostServerConfFactory({
        host: 'h.test',
        routes: [{ path: '/', upstream: 's:80', statuses: { 404: 'status-pages/404' } }],
      });
      expect(conf).to.not.match(/location\s+\/404\b/);
      expect(conf).to.include('error_page 404 @status_root_404;');
      // Named locations are unreachable from outside by construction.
      expect(conf).to.include('location @status_root_404 {');
    });
  });

  // The runtime redirects its own 404 only when it has a page on that route to
  // redirect to. Building the status page off `/<status>` removes the route, so a
  // runtime that predates the agnostic change still answers a bare 404 — which is
  // what the gateway intercepts, keeping the client's URI.
  describe('status pages are not runtime routes', () => {
    it('builds under status-pages, never on the status route', () => {
      expect(statusPageBuildSegment(404)).to.equal('status-pages/404/index.html');
      expect(statusPageBuildSegment(404)).to.not.equal('404/index.html');
      expect(statusPageBuildSegment('503')).to.equal('status-pages/503/index.html');
    });

    // The document the gateway serves and the one the build writes are named by
    // the same convention, so the sync cannot look where nothing was written.
    it('shares the status-pages name with the gateway layout', () => {
      const served = statusPageAssetPathFactory({ host: 'h.test', path: '/', status: 404 }).assetPath;
      expect(served).to.include('status-pages/404/index.html');
      expect(statusPageBuildSegment(404)).to.equal('status-pages/404/index.html');
    });
  });

  // A build must work with no cluster running: generating manifests cannot depend
  // on a running gateway to validate against, and cannot mutate the host either.
  // Installing and reloading is the apply path's job.
  describe('build/apply separation', () => {
    const source = fs.readFileSync(new URL('../src/server/underpost-gateway.js', import.meta.url), 'utf8');
    const bodyOf = (name) => {
      const start = source.indexOf(`const ${name} = `);
      const next = source.slice(start + 1).search(/\nconst \w+ = |\nexport \{/);
      return source.slice(start, start + 1 + next);
    };

    it('renders and writes without touching the cluster', () => {
      for (const name of [
        'hostServerConfFactory',
        'nginxConfFactory',
        'writeHostServerConf',
        'statusPageLocationsFactory',
      ]) {
        expect(bodyOf(name)).to.not.include('kubectl');
        expect(bodyOf(name)).to.not.include('sudo ');
      }
    });

    it('keeps the cluster work in the install path', () => {
      expect(bodyOf('installGatewayConf')).to.include('nginx -t');
      expect(bodyOf('installGatewayConf')).to.include('nginx -s reload');
      expect(bodyOf('installGatewayConf')).to.include('throw new Error');
    });

    it('writes a block to the directory it is given, and removes it when empty', () => {
      const dir = fs.mkdtempSync('/tmp/underpost-gateway-test-');
      try {
        expect(writeHostServerConf({ confDir: dir, host: 'h.test', conf: 'server {}\n' })).to.equal(true);
        expect(fs.readFileSync(`${dir}/h.test.conf`, 'utf8')).to.equal('server {}\n');
        // Idempotent: an unchanged block is not rewritten.
        expect(writeHostServerConf({ confDir: dir, host: 'h.test', conf: 'server {}\n' })).to.equal(false);
        expect(writeHostServerConf({ confDir: dir, host: 'h.test', conf: '' })).to.equal(true);
        expect(fs.existsSync(`${dir}/h.test.conf`)).to.equal(false);
      } finally {
        fs.removeSync(dir);
      }
    });
  });

  // The manifests are piped to `kubectl apply -f -` through a heredoc. Every
  // value is already substituted by the template literal, so anything the shell
  // would expand is content — and `nginx.conf` is nothing but content the shell
  // recognises. An unquoted delimiter turns `try_files $uri $uri/index.html`
  // into `try_files /index.html`, which matches nothing, and every host's
  // status page is answered by the shared default instead.
  describe('shell safety', () => {
    const applySites = () =>
      ['src/cli/cluster.js', 'src/cli/deploy.js', 'src/cli/run.js'].flatMap((file) =>
        fs
          .readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
          .split('\n')
          .map((line, index) => ({ file, line: index + 1, text: line }))
          .filter((entry) => entry.text.includes('kubectl apply') && entry.text.includes('<<')),
      );

    it('applies every generated manifest through a quoted heredoc', () => {
      const unquoted = applySites().filter((entry) => !entry.text.includes("<<'EOF'"));
      expect(unquoted.map((entry) => `${entry.file}:${entry.line}`)).to.deep.equal([]);
    });

    it('renders nginx variables the shell would otherwise eat', () => {
      expect(nginxConfFactory()).to.include('try_files $uri $uri/index.html =404;');
      expect(nginxConfFactory()).to.match(/\$remote_addr.+\$request.+\$status/);
    });
  });

  describe('traffic switch publication order', () => {
    const deploySource = fs.readFileSync(new URL('../src/cli/deploy.js', import.meta.url), 'utf8');
    const switchTraffic = deploySource.slice(
      deploySource.indexOf('    switchTraffic('),
      deploySource.indexOf('    resolveDeployNode(', deploySource.indexOf('    switchTraffic(')),
    );

    it('loads the rebuilt gateway host blocks before applying HTTPRoutes', () => {
      const install = switchTraffic.indexOf('installGatewayConf({');
      const apply = switchTraffic.indexOf("for (const file of options.gatewayApi ? ['gateway.yaml', 'httproute.yaml']");
      expect(install).to.be.greaterThan(-1);
      expect(apply).to.be.greaterThan(install);
    });

    it('refreshes the shared ingress host table after publishing routes', () => {
      const apply = switchTraffic.indexOf('shellExec(`sudo kubectl apply -f ${buildPath}/${file}');
      const refresh = switchTraffic.indexOf('Underpost.cluster.refreshUnderpostIngress({ namespace, options });');
      expect(apply).to.be.greaterThan(-1);
      expect(refresh).to.be.greaterThan(apply);
    });

    it('keeps the stable selector on the live colour until route migration completes', () => {
      const ready = switchTraffic.indexOf('!Underpost.deploy.awaitServiceEndpoints({');
      const bootstrap = switchTraffic.indexOf('Underpost.deploy.applyTrafficService({', ready);
      const apply = switchTraffic.indexOf("for (const file of options.gatewayApi ? ['gateway.yaml', 'httproute.yaml']");
      const removeOldRoute = switchTraffic.indexOf('Underpost.deploy.removeInactiveHostRoutes({', apply);
      const targetSelector = switchTraffic.indexOf('if (targetTraffic !== bootstrapTraffic)', removeOldRoute);
      expect(ready).to.be.greaterThan(-1);
      expect(bootstrap).to.be.greaterThan(ready);
      expect(apply).to.be.greaterThan(bootstrap);
      expect(removeOldRoute).to.be.greaterThan(apply);
      expect(targetSelector).to.be.greaterThan(removeOldRoute);
    });
  });
});
