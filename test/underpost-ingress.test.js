'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
// Named import: js-yaml's ESM build exports no default.
import { loadAll } from 'js-yaml';
import {
  UNDERPOST_INGRESS,
  gatewayBackendFactory,
  underpostIngressConfFactory,
  underpostIngressHostMapFactory,
  underpostIngressManifestsFactory,
} from '../src/server/underpost-ingress.js';

const CONTOUR = UNDERPOST_INGRESS.backends.contour;
const GATEWAY = gatewayBackendFactory('envoy-eg-d8c59e83');
const BOTH = { contour: CONTOUR, gateway: GATEWAY };

describe('shared ingress front', () => {
  describe('underpostIngressHostMapFactory', () => {
    it('routes each hostname to the stack that describes it', () => {
      const { entries } = underpostIngressHostMapFactory({
        contourHosts: ['legacy.test'],
        gatewayHosts: ['app.test'],
      });
      expect(entries).to.deep.equal([
        { host: 'app.test', backend: 'gateway' },
        { host: 'legacy.test', backend: 'contour' },
      ]);
    });

    // Both objects existing for one hostname is what switching stacks leaves
    // behind. Only one can win, so the choice is fixed rather than left to
    // whichever happened to be listed first.
    it('reports a hostname described by both, and resolves it to the preferred stack', () => {
      const { entries, conflicts } = underpostIngressHostMapFactory({
        contourHosts: ['shared.test'],
        gatewayHosts: ['shared.test'],
      });
      expect(conflicts).to.deep.equal(['shared.test']);
      expect(entries).to.deep.equal([{ host: 'shared.test', backend: 'gateway' }]);
    });

    it('honours an explicit preference for the conflicted hostname', () => {
      const { entries } = underpostIngressHostMapFactory({
        contourHosts: ['shared.test'],
        gatewayHosts: ['shared.test'],
        preferred: 'contour',
      });
      expect(entries).to.deep.equal([{ host: 'shared.test', backend: 'contour' }]);
    });

    it('deduplicates and drops empty hostnames', () => {
      const { entries, conflicts } = underpostIngressHostMapFactory({
        contourHosts: ['a.test', 'a.test', '', null],
        gatewayHosts: [],
      });
      expect(entries).to.deep.equal([{ host: 'a.test', backend: 'contour' }]);
      expect(conflicts).to.deep.equal([]);
    });

    it('is empty with nothing routed', () => {
      expect(underpostIngressHostMapFactory()).to.deep.equal({ entries: [], conflicts: [] });
    });
  });

  describe('underpostIngressConfFactory', () => {
    const conf = (input) => underpostIngressConfFactory({ backends: BOTH, ...input });

    it('maps a hostname to its stack in both the HTTP and the TLS table', () => {
      const out = conf({ entries: [{ host: 'legacy.test', backend: 'contour' }] });
      expect(out).to.include(`legacy.test ${CONTOUR.http};`);
      expect(out).to.include(`legacy.test ${CONTOUR.tls};`);
    });

    // The upstream must reach nginx as a variable. A literal upstream in a
    // `stream` block is resolved when the config is parsed, so nginx refuses to
    // start until the Service has DNS and then caches that address forever.
    it('passes every upstream through a variable so the resolver applies', () => {
      const out = conf({ entries: [] });
      expect(out).to.include('proxy_pass http://$underpost_ingress_http_upstream;');
      expect(out).to.include('proxy_pass $underpost_ingress_tls_upstream;');
      expect(out).to.include('proxy_pass $underpost_ingress_quic_upstream;');
      expect(out).to.not.match(/proxy_pass\s+[a-z0-9.-]+\.svc\.cluster\.local/);
    });

    it('falls back to the Gateway API stack for an unknown hostname', () => {
      const out = conf({ entries: [] });
      expect(out).to.include(`default ${GATEWAY.http};`);
      expect(out).to.include(`default ${GATEWAY.tls};`);
    });

    it('falls back to the only stack installed', () => {
      const out = underpostIngressConfFactory({ backends: { contour: CONTOUR }, defaultBackend: 'gateway' });
      expect(out).to.include(`default ${CONTOUR.http};`);
    });

    // A host left over from the other stack would otherwise render a map entry
    // pointing at an upstream that does not exist in this config.
    it('drops a hostname whose stack is not installed', () => {
      const out = underpostIngressConfFactory({
        backends: { gateway: GATEWAY },
        entries: [
          { host: 'orphan.test', backend: 'contour' },
          { host: 'app.test', backend: 'gateway' },
        ],
      });
      expect(out).to.not.include('orphan.test');
      expect(out).to.include('app.test');
      expect(out).to.not.include('projectcontour');
    });

    it('serves QUIC only when the Gateway API data plane is present', () => {
      expect(conf({ entries: [] })).to.include(`listen ${UNDERPOST_INGRESS.httpsPort} udp;`);
      expect(underpostIngressConfFactory({ backends: { contour: CONTOUR } })).to.not.include('udp;');
    });

    it('refuses to render with no backend at all', () => {
      expect(() => underpostIngressConfFactory({ backends: {} })).to.throw(/No data plane backend/);
    });

    it('carries the cluster DNS resolver into both the http and stream contexts', () => {
      const out = conf({ entries: [], resolver: '10.43.0.10' });
      expect(out.match(/resolver 10\.43\.0\.10 valid=10s ipv6=off;/g)).to.have.lengthOf(2);
    });
  });

  describe('underpostIngressManifestsFactory', () => {
    // The regression that left the edge Pending: under `hostNetwork: true`
    // Kubernetes sets `hostPort` to each declared `containerPort`, and the
    // scheduler then refuses to place the pod until those host ports are free —
    // which they only become once this pod replaces the data planes holding them.
    it('takes the host network while declaring no port field at all', () => {
      const out = underpostIngressManifestsFactory({ conf: 'worker_processes auto;' });
      expect(out).to.include('hostNetwork: true');
      expect(out).to.include('dnsPolicy: ClusterFirstWithHostNet');
      const fields = out.split('\n').filter((line) => !line.trim().startsWith('#'));
      expect(fields.filter((line) => /^\s*-?\s*(ports|containerPort|hostPort):/.test(line))).to.deep.equal([]);
    });

    // Host-map changes are reloaded in place. Keeping them out of the pod
    // template avoids a Recreate gap on every HTTPRoute/HTTPProxy migration.
    it('keeps the pod template stable and runs from a writable config copy', () => {
      const deployment = (conf) =>
        loadAll(underpostIngressManifestsFactory({ conf })).find((document) => document?.kind === 'Deployment');
      expect(deployment('a').spec.template).to.deep.equal(deployment('b').spec.template);
      const out = underpostIngressManifestsFactory({ conf: 'a' });
      expect(out).to.include('cp /etc/underpost-ingress/nginx.conf /tmp/nginx.conf');
      expect(out).to.not.include('subPath:');
    });

    // Verified against the real nginx:alpine image: dropping any of these is a
    // start-up failure, and only NET_BIND_SERVICE is visible to `nginx -t` —
    // CHOWN fails on the temp paths, SETUID/SETGID when workers spawn.
    it('grants every capability the nginx master needs to start', () => {
      const out = underpostIngressManifestsFactory({ conf: 'x' });
      for (const capability of ['NET_BIND_SERVICE', 'CHOWN', 'SETUID', 'SETGID'])
        expect(out).to.include(`- ${capability}`);
      expect(out).to.include('- ALL');
    });

    // The node's ports are a single resource: a rolling update would surge a
    // second pod that cannot bind and stall the rollout indefinitely.
    it('replaces rather than rolls, because the ports cannot be held twice', () => {
      expect(underpostIngressManifestsFactory({ conf: 'x' })).to.include('type: Recreate');
    });

    it('pins to a node only when one is given', () => {
      expect(underpostIngressManifestsFactory({ conf: 'x', nodeName: 'node-1' })).to.include(
        'kubernetes.io/hostname: node-1',
      );
      expect(underpostIngressManifestsFactory({ conf: 'x' })).to.not.include('nodeSelector');
    });

    // The manifest is assembled by string templating, and the config is embedded
    // as an indented block scalar — so "it looks right" is not evidence. Parsing
    // it back is what proves the pod spec is the one intended and that the
    // embedded config survived the indentation intact.
    it('parses as YAML, with the config round-tripping unchanged', () => {
      const conf = underpostIngressConfFactory({
        entries: [{ host: 'legacy.test', backend: 'contour' }],
        backends: BOTH,
      });
      const documents = loadAll(underpostIngressManifestsFactory({ conf, nodeName: 'node-1' })).filter(Boolean);
      expect(documents.map((document) => document.kind)).to.deep.equal(['ConfigMap', 'Deployment']);

      const deployment = documents.find((document) => document.kind === 'Deployment');
      const container = deployment.spec.template.spec.containers[0];
      expect(deployment.spec.template.spec.hostNetwork).to.equal(true);
      expect(container.ports).to.equal(undefined);
      expect(container.securityContext.capabilities.add).to.have.members([
        'NET_BIND_SERVICE',
        'CHOWN',
        'SETUID',
        'SETGID',
      ]);

      const configMap = documents.find((document) => document.kind === 'ConfigMap');
      expect(configMap.data['nginx.conf'].trimEnd()).to.equal(conf.trimEnd());
    });

    it('validates and reloads a live config before persisting it', () => {
      const clusterSource = fs.readFileSync(new URL('../src/cli/cluster.js', import.meta.url), 'utf8');
      const install = clusterSource.slice(
        clusterSource.indexOf('    installUnderpostIngress('),
        clusterSource.indexOf('    pruneEndpointlessService(', clusterSource.indexOf('    installUnderpostIngress(')),
      );
      const testCandidate = install.indexOf("execIngress('nginx -t -c /tmp/nginx.candidate.conf'");
      const reload = install.indexOf('nginx -s reload -c /tmp/nginx.conf', testCandidate);
      const persist = install.indexOf("shellExec(`kubectl apply -f - -n ${namespace} <<'EOF'", reload);
      expect(testCandidate).to.be.greaterThan(-1);
      expect(reload).to.be.greaterThan(testCandidate);
      expect(persist).to.be.greaterThan(reload);
    });
  });
});
