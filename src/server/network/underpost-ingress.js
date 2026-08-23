/**
 * Underpost ingress: the shared entry point that lets the Contour and Gateway
 * API data planes run side by side.
 *
 * Only one process can hold a node's 80/443, and a `hostPort` claim is stronger
 * than a listener: the CNI hostport plugin DNATs every packet on those ports to
 * the claiming pod before anything else sees them. So two ingress stacks on one
 * node is not a configuration question — whichever claims first silently takes
 * all traffic, and the other logs nothing at all.
 *
 * This module owns the port instead, and hands each connection to the data plane
 * that actually describes its hostname. Both stacks are then reachable through
 * the same address, and neither has to be uninstalled to try the other.
 *
 * Cleartext and TLS are split deliberately:
 *
 * - `:80` is proxied at L7, because a plaintext request carries a readable `Host`
 *   header and the backends answer it with their own redirect or content.
 * - `:443` is forwarded at L4 by SNI, because terminating TLS here would mean
 *   holding every host's certificate and re-negotiating ALPN. Passing the bytes
 *   through keeps certificates, HTTP/2 and mTLS exactly where they already work.
 *
 * @module src/server/network/underpost-ingress.js
 * @namespace UnderpostIngress
 */

import { compressionConfFactory, compressionModulesConfFactory, nginxImageFactory } from './underpost-compression.js';

/**
 * @constant UNDERPOST_INGRESS
 * @description Identity of the underpost ingress workload. One deployment fronts every
 * data plane on the node, so these names are cluster-wide constants.
 * @memberof UnderpostIngress
 */
const UNDERPOST_INGRESS = {
  name: 'underpost-ingress',
  configMapName: 'underpost-ingress-nginx',
  image: nginxImageFactory(),
  httpPort: 80,
  httpsPort: 443,
  healthPort: 8090,
  healthPath: '/healthz',
  // kube-dns's conventional ClusterIP; overridden from the live Service.
  resolver: '10.96.0.10',
  backends: {
    contour: { http: 'envoy.projectcontour.svc.cluster.local:80', tls: 'envoy.projectcontour.svc.cluster.local:443' },
  },
};

/**
 * @method gatewayBackendFactory
 * @description Upstreams for the Gateway API data plane.
 *
 * Envoy Gateway provisions and names its own Service (`envoy-<class>-<hash>`),
 * so unlike Contour's fixed name this one is discovered from the cluster and
 * passed in.
 * @param {string} service - Provisioned Service name.
 * @param {string} [namespace] - Namespace holding it.
 * @returns {{http: string, tls: string}} Qualified upstreams.
 * @memberof UnderpostIngress
 */
const gatewayBackendFactory = (service, namespace = 'envoy-gateway-system') => ({
  http: `${service}.${namespace}.svc.cluster.local:80`,
  tls: `${service}.${namespace}.svc.cluster.local:443`,
});

/**
 * @method underpostIngressHostMapFactory
 * @description Decides which data plane each hostname is handed to.
 *
 * A hostname belongs to whichever stack has a route object describing it, which
 * is the only fact that survives a switch between them: manifests for both kinds
 * are always generated, so the objects that actually exist in the cluster are
 * what says who serves what.
 *
 * A hostname described by both is a leftover from switching stacks, not a valid
 * state — both would answer, and which one won would depend on ordering here. It
 * resolves to `preferred` and is reported separately so the duplicate can be
 * removed rather than silently tolerated.
 * @param {Array<string>} [contourHosts] - Hostnames with an HTTPProxy.
 * @param {Array<string>} [gatewayHosts] - Hostnames with an HTTPRoute.
 * @param {string} [preferred] - Backend that wins a hostname described by both.
 * @returns {{entries: Array<{host: string, backend: string}>, conflicts: Array<string>}} Routing table and duplicates.
 * @memberof UnderpostIngress
 */
const underpostIngressHostMapFactory = ({ contourHosts = [], gatewayHosts = [], preferred = 'gateway' } = {}) => {
  const contour = new Set(contourHosts.filter(Boolean));
  const gateway = new Set(gatewayHosts.filter(Boolean));
  const conflicts = [...contour].filter((host) => gateway.has(host)).sort();
  const entries = [...new Set([...contour, ...gateway])].sort().map((host) => ({
    host,
    backend: contour.has(host) && gateway.has(host) ? preferred : contour.has(host) ? 'contour' : 'gateway',
  }));
  return { entries, conflicts };
};

/**
 * @method underpostIngressConfFactory
 * @description Renders the underpost ingress Nginx configuration.
 *
 * `default` in both maps is what an unknown hostname reaches. It is the stack
 * that owns most of the routing rather than a rejection, so a host whose route
 * object has not been applied yet still reaches a data plane that can answer it
 * — including with its own 404.
 *
 * Compression is rendered for `:80` alone, and that asymmetry is the same split
 * the module makes everywhere else: an L7 hop holds a body it can encode, while
 * `:443` carries bytes this process never decrypts. Whatever leaves through the
 * tunnel on that port was compressed where TLS terminates — see
 * {@link module:src/server/network/underpost-compression.js}.
 * @param {Array<object>} [entries] - Host table from {@link UnderpostIngress.underpostIngressHostMapFactory}.
 * @param {object} backends - `{contour: {http, tls}, gateway: {http, tls}}`; a missing stack is omitted.
 * @param {string} [defaultBackend] - Backend for an unmatched hostname.
 * @param {string} [resolver] - Cluster DNS ClusterIP.
 * @param {object} [compression] - Overrides for the compression policy.
 * @returns {string} nginx.conf contents.
 * @memberof UnderpostIngress
 */
const underpostIngressConfFactory = ({
  entries = [],
  backends = {},
  defaultBackend = 'gateway',
  resolver = UNDERPOST_INGRESS.resolver,
  compression = {},
} = {}) => {
  const available = Object.keys(backends).filter((name) => backends[name]?.http && backends[name]?.tls);
  // With one stack installed the map still renders, so the same workload serves
  // the single-stack case without a second code path.
  const fallback = available.includes(defaultBackend) ? defaultBackend : available[0];
  if (!fallback) throw new Error('[underpost-ingress] No data plane backend to route to');
  const routable = entries.filter((entry) => entry?.host && available.includes(entry.backend));
  const mapEntries = (kind) =>
    routable.map((entry) => `    ${entry.host} ${backends[entry.backend][kind]};`).join('\n') || '';
  // No `staticRoot`: this workload proxies every byte and serves no documents,
  // so there is never a pre-compressed sibling on disk to prefer.
  const policy = { ...compression, staticRoot: false };
  const modules = compressionModulesConfFactory(policy);
  const compress = compressionConfFactory(policy);

  return `worker_processes auto;
error_log /dev/stderr warn;
pid /tmp/nginx.pid;
${modules ? `${modules}\n` : ''}
events {
  worker_connections 4096;
}

http {
  server_tokens off;
${compress ? `\n${compress}\n` : ''}
  log_format underpost_ingress '$remote_addr "$request" $status "$host" -> $underpost_ingress_http_upstream';
  access_log /dev/stdout underpost_ingress;

  map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
  }

  # Cluster DNS as a literal address — nginx cannot resolve its own resolver.
  # Every upstream is passed through a variable, so without this nginx resolves
  # each Service name once at start-up and keeps the address for the life of the
  # process; a re-provisioned data plane gets a new ClusterIP.
  resolver ${resolver} valid=10s ipv6=off;

  map $host $underpost_ingress_http_upstream {
    default ${backends[fallback].http};
${mapEntries('http')}
  }

  server {
    listen ${UNDERPOST_INGRESS.healthPort} default_server;
    server_name _;
    location = ${UNDERPOST_INGRESS.healthPath} {
      access_log off;
      add_header Content-Type text/plain;
      return 200 'ok';
    }
    location / {
      return 404;
    }
  }

  server {
    listen ${UNDERPOST_INGRESS.httpPort} default_server;
    server_name _;

    location / {
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      # Websocket upgrades must survive this hop or a client that negotiated one
      # at the edge is left holding a half-open connection.
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_pass http://$underpost_ingress_http_upstream;
    }
  }
}

stream {
  log_format underpost_ingress '$remote_addr -> "$ssl_preread_server_name" $upstream_addr $status';
  access_log /dev/stdout underpost_ingress;
  resolver ${resolver} valid=10s ipv6=off;

  # SNI is read without terminating the connection, so each data plane keeps
  # serving its own certificates and negotiating its own ALPN. Terminating here
  # would mean holding every host's key and re-offering h2 on the way out.
  map $ssl_preread_server_name $underpost_ingress_tls_upstream {
    default ${backends[fallback].tls};
${mapEntries('tls')}
  }

  server {
    listen ${UNDERPOST_INGRESS.httpsPort};
    ssl_preread on;
    proxy_pass $underpost_ingress_tls_upstream;
  }
${
  backends.gateway
    ? `
  # QUIC keeps working, but it cannot be routed by hostname: \`ssl_preread\` is
  # TCP-only, and a QUIC Initial carries its SNI inside an encrypted frame. Only
  # the Gateway API data plane serves HTTP/3 here — Contour advertises no
  # Alt-Svc — so every datagram goes there. A client that tries QUIC against a
  # Contour host gets no answer and falls back to TCP, exactly as it would have
  # if nothing had advertised HTTP/3 at all.
  #
  # The constant is reached through a map because a literal \`proxy_pass\` in
  # \`stream\` is resolved when the config is parsed, not through \`resolver\`:
  # nginx refuses to start while the Service has no DNS record, and once it does
  # start it keeps that address for the life of the process.
  map $remote_addr $underpost_ingress_quic_upstream {
    default ${backends.gateway.tls};
  }

  server {
    listen ${UNDERPOST_INGRESS.httpsPort} udp;
    proxy_pass $underpost_ingress_quic_upstream;
    proxy_timeout 30s;
  }
`
    : ''
}}
`;
};

/**
 * @method underpostIngressManifestsFactory
 * @description Renders the underpost ingress workload.
 *
 * Host-networked, because it exists to be the thing that holds the node's 80/443
 * — the ports both data planes have just been moved off. `hostPort` is not used:
 * the claim it installs is what made the two stacks exclusive in the first place.
 * @param {string} [namespace] - Namespace to deploy into.
 * @param {string} conf - Rendered nginx.conf.
 * @param {string} [nodeName] - Node to pin the underpost ingress to; empty schedules freely.
 * @returns {string} Multi-document YAML.
 * @memberof UnderpostIngress
 */
const underpostIngressManifestsFactory = ({ namespace = 'default', conf, nodeName = '' } = {}) => {
  return `
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${UNDERPOST_INGRESS.configMapName}
  namespace: ${namespace}
data:
  nginx.conf: |
${`${conf}`
  .replace(/\n$/, '')
  .split('\n')
  .map((line) => (line.length > 0 ? `    ${line}` : ''))
  .join('\n')}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${UNDERPOST_INGRESS.name}
  namespace: ${namespace}
  labels:
    app: ${UNDERPOST_INGRESS.name}
spec:
  replicas: 1
  # Recreate is retained for real pod-template upgrades because the node's ports
  # cannot be held twice. Host-table changes do not alter this template: the
  # installer validates and hot-reloads /tmp/nginx.conf in the existing pod.
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: ${UNDERPOST_INGRESS.name}
  template:
    metadata:
      labels:
        app: ${UNDERPOST_INGRESS.name}
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet${
        nodeName
          ? `
      nodeSelector:
        kubernetes.io/hostname: ${nodeName}`
          : ''
      }
      containers:
        - name: nginx
          image: ${UNDERPOST_INGRESS.image}
          # The latest tag otherwise implies Always. Production edge nodes are often
          # deliberately unable to reach Docker Hub; once the audited image is
          # present, a route-table refresh or pod restart must stay offline-safe.
          imagePullPolicy: IfNotPresent
          command:
            - /bin/sh
            - -c
            - cp /etc/underpost-ingress/nginx.conf /tmp/nginx.conf && exec nginx -c /tmp/nginx.conf -g 'daemon off;'
          # No \`ports:\` block, deliberately. Under \`hostNetwork: true\` Kubernetes
          # sets \`hostPort\` to each \`containerPort\`, and the scheduler then
          # refuses to place the pod unless those host ports are already free —
          # which they are not, because the data planes only release them as this
          # workload arrives. Declaring them turns the ports this exists to take
          # into a precondition for being scheduled at all.
          securityContext:
            runAsNonRoot: false
            runAsUser: 0
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
              # The master starts as root and needs all four: NET_BIND_SERVICE to
              # bind 80/443, CHOWN to take ownership of its temp paths, and
              # SETUID/SETGID to drop each worker to the unprivileged \`nginx\`
              # user. Dropping any one of them is a start-up failure rather than a
              # degraded mode — and only the first is visible to \`nginx -t\`, since
              # the other two are reached when workers spawn.
              add:
                - NET_BIND_SERVICE
                - CHOWN
                - SETUID
                - SETGID
          readinessProbe:
            httpGet:
              path: ${UNDERPOST_INGRESS.healthPath}
              port: ${UNDERPOST_INGRESS.healthPort}
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: ${UNDERPOST_INGRESS.healthPath}
              port: ${UNDERPOST_INGRESS.healthPort}
            initialDelaySeconds: 10
            periodSeconds: 20
          volumeMounts:
            - name: nginx-conf
              mountPath: /etc/underpost-ingress
              readOnly: true
            - name: cache
              mountPath: /var/cache/nginx
            - name: run
              mountPath: /tmp
      volumes:
        - name: nginx-conf
          configMap:
            name: ${UNDERPOST_INGRESS.configMapName}
        - name: cache
          emptyDir: {}
        - name: run
          emptyDir: {}
`;
};

export {
  UNDERPOST_INGRESS,
  gatewayBackendFactory,
  underpostIngressConfFactory,
  underpostIngressHostMapFactory,
  underpostIngressManifestsFactory,
};
