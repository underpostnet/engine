'use strict';

import { expect } from 'chai';
import fs from 'node:fs';
import {
  GATEWAY_STATIC,
  gatewayStaticManifestsFactory,
  nginxConfFactory,
  staticLocationFactory,
  staticPathSegmentFactory,
  statusPageAssetPathFactory,
} from '../src/server/gateway-static.js';
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
  gatewayStaticManifestsFactory({
    namespace: 'default',
    hostPath: `/home/dd/engine/volume/${GATEWAY_STATIC.volumeName}`,
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

describe('gateway static edge tier', () => {
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
      expect(conf).to.include(`root ${GATEWAY_STATIC.root};`);
    });

    // A 200 would let the PWA service worker store the shared page as the
    // host's own and keep serving it after the real document lands.
    it('serves the shared fallback as a 404 that is never stored', () => {
      expect(conf).to.include(`error_page 404 /${GATEWAY_STATIC.defaultHostDir}/status-pages/404/index.html;`);
      expect(conf).to.match(/location = \/default\/status-pages\/404\/index\.html \{\s*\n\s*internal;/);
      expect(conf).to.include("add_header Cache-Control 'no-store' always;");
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
      expect(pv).to.include(`path: /home/dd/engine/volume/${GATEWAY_STATIC.volumeName}`);
      expect(pv).to.include('- node-a');
    });

    it('omits node affinity when no node is resolved', () => {
      expect(kind(manifests({ nodeName: '' }), 'PersistentVolume')).to.not.include('nodeAffinity');
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
});
