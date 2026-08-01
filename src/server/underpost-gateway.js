/**
 * The centralized gateway infrastructure service.
 *
 * One Nginx deployment is the cluster's single edge utility layer: it serves
 * every host's status pages, maintenance pages and shared edge contexts, and it
 * reverse-proxies the application workloads whose errors it is asked to
 * intercept. Application runtimes stay agnostic — they return a standard status
 * code or become unreachable, and nothing about status page delivery lives in
 * them.
 *
 * Interception is Nginx's `proxy_intercept_errors`, not an Envoy response
 * substitution, because only it satisfies all three constraints at once: the
 * document is served from disk so its size is unbounded, the upstream's status
 * code is preserved, and the client's URI never changes. Envoy's own mechanisms
 * substitute an inline body capped at 4096 bytes, and Envoy cannot re-dispatch a
 * request to another cluster once the upstream has answered.
 *
 * Layout under the Nginx root:
 *   <root>/<host>/<path>/status-pages/<status>/index.html
 *   <root>/<host>/<path>/<context>/...
 *   <root>/conf.d/<host>.conf                    generated server blocks
 * where `<path>` is the proxy sub-path with `/` written as `root`, so
 * `www.cyberiaonline.com` + `/` + 404 becomes
 * `www.cyberiaonline.com/root/status-pages/404/index.html`.
 *
 * @module src/server/underpost-gateway.js
 * @namespace UnderpostGateway
 */

import crypto from 'node:crypto';
import fs from 'fs-extra';
import nodePath from 'node:path';
import { timer } from '../client/components/core/CommonJs.js';
import { instanceStatusPageEntriesFactory, loadConfServerJson } from './conf.js';
import Underpost from '../index.js';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';

const logger = loggerFactory(import.meta);

/**
 * @constant UNDERPOST_GATEWAY
 * @description Identity of the shared gateway workload. One deployment serves
 * every host of every deploy, so these names are cluster-wide constants rather
 * than per-deploy.
 * @memberof UnderpostGateway
 */
const UNDERPOST_GATEWAY = {
  name: 'underpost-gateway',
  serviceName: 'underpost-gateway-service',
  configMapName: 'underpost-gateway-nginx',
  claimName: 'pvc-underpost-gateway',
  volumeName: 'pv-underpost-gateway',
  image: 'nginx:alpine',
  root: '/var/www/static',
  port: 80,
  healthPath: '/healthz',
  defaultHostDir: 'default',
  confDir: 'conf.d',
  // kube-dns's conventional ClusterIP; overridden from the live Service.
  resolver: '10.96.0.10',
};

/**
 * @method staticPathSegmentFactory
 * @description Folds a proxy sub-path into one directory name. `/` has no
 * directory of its own, so it is written as `root`; anything else keeps its
 * segments joined by `-` to stay a single level under the host.
 * @param {string} [path] - Proxy sub-path (`/`, `/peer`, `/app`).
 * @returns {string} Directory name.
 * @memberof UnderpostGateway
 */
const staticPathSegmentFactory = (path = '/') => {
  const segment = `${path || '/'}`.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
  return segment || 'root';
};

/**
 * @method kubernetesUpstreamFactory
 * @description Qualifies a short Kubernetes Service name for Nginx's runtime DNS resolver.
 *
 * Nginx uses the configured `resolver` whenever `proxy_pass` contains a
 * variable. That resolver does not apply the pod's `/etc/resolv.conf` search
 * suffixes, so `service-name:80` fails even though the same short name works in
 * wget/curl. A fully-qualified Service DNS name is unambiguous and continues to
 * resolve after the Service is recreated.
 *
 * Already-qualified hosts and IP literals are kept as supplied.
 * @param {string} upstream - `host:port`.
 * @param {string} [namespace] - Kubernetes namespace containing the Service.
 * @returns {string} Runtime-resolvable upstream.
 * @memberof UnderpostGateway
 */
const kubernetesUpstreamFactory = (upstream, namespace = 'default') => {
  const value = `${upstream || ''}`.trim();
  const separator = value.lastIndexOf(':');
  if (separator < 1) return value;
  const host = value.slice(0, separator);
  const port = value.slice(separator + 1);
  if (host.includes('.') || host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return value;
  return `${host}.${namespace}.svc.cluster.local:${port}`;
};

/**
 * @method nginxTokenFactory
 * @description A sub-path as an identifier nginx accepts. Variable names admit
 * only word characters, so the `-` that {@link UnderpostGateway.staticPathSegmentFactory}
 * joins multi-segment paths with cannot appear in one.
 * @param {string} [path] - Proxy sub-path.
 * @returns {string} Identifier-safe token.
 * @memberof UnderpostGateway
 */
const nginxTokenFactory = (path = '/') => staticPathSegmentFactory(path).replace(/[^a-zA-Z0-9]/g, '_');

/**
 * @method staticLocationFactory
 * @description The three forms every placed document is addressed by: where it
 * sits under the root, the directory a prefix rewrite targets, and the exact URL
 * a full-path rewrite targets.
 *
 * `dir` is what routes normally use. A `ReplacePrefixMatch` onto the directory
 * lets one rule cover the document *and* everything beside it — `/maintenance`
 * resolves through `try_files $uri/index.html`, while `/maintenance/logo.png`
 * resolves through `$uri` — which is why the layout keeps each context in its
 * own directory rather than as a bare file.
 * @param {string} host - Hostname the document belongs to.
 * @param {string} [path] - Proxy sub-path the document belongs to.
 * @param {string} context - Directory under the sub-path (`status-pages/404`, `maintenance`).
 * @param {string} [file] - Document within the context.
 * @returns {{ assetPath: string, dir: string, url: string }} Root-relative path, prefix target, full-path target.
 * @memberof UnderpostGateway
 */
const staticLocationFactory = ({ host, path = '/', context, file = 'index.html' }) => {
  const dir = `${host}/${staticPathSegmentFactory(path)}/${context}`;
  const assetPath = `${dir}/${file}`;
  return { assetPath, dir: `/${dir}`, url: `/${assetPath}` };
};

/**
 * @method statusPageAssetPathFactory
 * @description Location of one host's status page.
 * @param {string} host - Hostname the page belongs to.
 * @param {string} [path] - Proxy sub-path the page belongs to.
 * @param {string|number} status - HTTP status code.
 * @returns {{ assetPath: string, dir: string, url: string }} See {@link UnderpostGateway.staticLocationFactory}.
 * @memberof UnderpostGateway
 */
const statusPageAssetPathFactory = ({ host, path = '/', status }) =>
  staticLocationFactory({ host, path, context: `status-pages/${status}` });

/**
 * @method statusPageBuildSegment
 * @description Where a status page is built inside the client bundle, relative
 * to that client's served root.
 *
 * Deliberately not `<status>/index.html`. A status page is an edge artifact, and
 * a document sitting on the runtime's own `/<status>` route makes it an
 * application route too: the runtime then has a page to serve — or to redirect to
 * — for its own errors, which is exactly the URI change the edge exists to
 * prevent. Kept under the same `status-pages` name the gateway layout uses, so
 * both sides read one convention.
 * @param {string|number} status - HTTP status code.
 * @returns {string} Bundle-relative path of the document.
 * @memberof UnderpostGateway
 */
const statusPageBuildSegment = (status) => `status-pages/${status}/index.html`;

/**
 * @method defaultStatusPagePath
 * @description Root-relative location of the shared fallback document.
 * @param {string|number} [status] - HTTP status code.
 * @returns {string} Root-relative path.
 * @memberof UnderpostGateway
 */
const defaultStatusPagePath = (status = 404) => `${UNDERPOST_GATEWAY.defaultHostDir}/status-pages/${status}/index.html`;

/**
 * @method nginxConfFactory
 * @description Renders the server config.
 *
 * The gateway always rewrites into the layout before forwarding, so `try_files`
 * only has to resolve a path that is already root-relative: the document itself
 * for an asset request, then `index.html` beneath it for a directory — which is
 * what a `ReplacePrefixMatch` onto a context directory produces.
 *
 * A miss ends on the shared default page, so a host with nothing on disk still
 * answers with a deliberate document — but through `error_page`, which keeps the
 * 404 status rather than presenting the fallback as the host's own page with a
 * 200. That status is what stops the document being stored: the PWA service
 * worker caches navigations for hours and would otherwise keep serving the
 * fallback long after the host's real page landed in the tree.
 * @returns {string} nginx.conf contents.
 * @memberof UnderpostGateway
 */
const nginxConfFactory = ({ resolver = UNDERPOST_GATEWAY.resolver } = {}) => `worker_processes auto;
error_log /dev/stderr warn;
pid /tmp/nginx.pid;

events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type text/html;
  sendfile on;
  tcp_nopush on;
  server_tokens off;

  gzip on;
  gzip_vary on;
  gzip_min_length 512;
  gzip_types text/html text/css text/plain application/javascript application/json image/svg+xml;

  log_format concise '$remote_addr "$request" $status $body_bytes_sent "$host"';
  access_log /dev/stdout concise;

  # Websocket upgrades must be forwarded verbatim; a proxied hop that drops the
  # Connection header leaves the client holding a half-open socket.
  map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
  }

  # Cluster DNS as a literal address — nginx cannot resolve its own resolver.
  # Needed because every upstream is passed through a variable: without it nginx
  # resolves a Service name once at start-up and keeps the address for the life
  # of the process, and a redeployed workload gets a new ClusterIP.
  resolver ${resolver} valid=10s ipv6=off;

  # Per-host server blocks, written into the volume by the deploy that owns the
  # host. They live beside the documents rather than in this ConfigMap because
  # the workload is shared: one deploy must not rewrite another's routing.
  include ${UNDERPOST_GATEWAY.root}/${UNDERPOST_GATEWAY.confDir}/*.conf;

  server {
    listen ${UNDERPOST_GATEWAY.port} default_server;
    server_name _;
    root ${UNDERPOST_GATEWAY.root};

    error_page 404 /${defaultStatusPagePath(404)};

    # Probes are the only traffic that would otherwise dominate the log.
    location = ${UNDERPOST_GATEWAY.healthPath} {
      access_log off;
      add_header Content-Type text/plain;
      return 200 'ok';
    }

    location = /${defaultStatusPagePath(404)} {
      internal;
      add_header Cache-Control 'no-store' always;
    }

    location / {
      add_header Cache-Control 'public, max-age=60';
      try_files $uri $uri/index.html =404;
    }
  }
}
`;

/**
 * @method statusPageLocationsFactory
 * @description The internal locations an intercepted status resolves to, and the
 * `error_page` lines that reach them.
 *
 * Each is `internal`, so a client cannot request the document at its storage
 * path — it is only ever reached by interception, which is what keeps the
 * client's URI unchanged. The `=` form is deliberately absent: `error_page 404
 * /x` preserves the upstream's status, while `error_page 404 = /x` would rewrite
 * it to the status of the page itself.
 * @param {string} host - Hostname the documents belong to.
 * @param {string} [path] - Proxy sub-path the documents belong to.
 * @param {Object<string,string>} statuses - Status code → context directory under the sub-path.
 * @returns {{errorPages: string, locations: string}} Rendered `error_page` directives and their locations.
 * @memberof UnderpostGateway
 */
const statusPageLocationsFactory = ({ host, path = '/', statuses }) => {
  const entries = Object.entries(statuses);
  const named = (status) => `@status_${nginxTokenFactory(path)}_${status}`;
  return {
    errorPages: entries.map(([status]) => `    error_page ${status} ${named(status)};`).join('\n'),
    locations: entries
      .map(
        ([status, context]) => `  location ${named(status)} {
    add_header Cache-Control 'no-store' always;
    try_files /${staticLocationFactory({ host, path, context }).assetPath} =${status};
  }`,
      )
      .join('\n'),
  };
};

/**
 * @method hostServerConfFactory
 * @description Renders one host's server block: every proxied sub-path, and the
 * documents its errors are intercepted with.
 *
 * `proxy_intercept_errors` is the whole mechanism. The upstream answers 404 or
 * dies, Nginx swaps in the document from disk, and the client sees its own URI
 * with the upstream's status code — no redirect, no size ceiling, and nothing
 * for the application runtime to implement. A sub-path that declares no status
 * page is proxied untouched, so an API keeps returning its own error bodies.
 * @param {string} host - Hostname this block serves.
 * @param {Array<object>} routes - `{ path, upstream, statuses, stripPrefix }` per proxied
 *   sub-path; `statuses` maps a status code to the context directory holding its
 *   document, and `stripPrefix` drops the sub-path before dialling the upstream.
 * @returns {string} nginx server block, or an empty string when the host proxies nothing.
 * @memberof UnderpostGateway
 */
const hostServerConfFactory = ({ host, routes = [], namespace = 'default' }) => {
  const proxied = routes.filter((route) => route.upstream);
  if (proxied.length === 0) return '';
  // Longest sub-path first: nginx prefix locations are longest-match, but the
  // emitted order keeps the block readable next to the HTTPRoute it mirrors.
  const sorted = [...proxied].sort((a, b) => (b.path || '/').length - (a.path || '/').length);
  const blocks = sorted.map((route) => {
    const { errorPages, locations } = statusPageLocationsFactory({
      host,
      path: route.path,
      statuses: route.statuses || {},
    });
    const intercept = errorPages ? `    proxy_intercept_errors on;\n${errorPages}` : '    proxy_intercept_errors off;';
    const path = route.path || '/';
    // The upstream is dialled through a variable, so nginx forwards the request
    // URI verbatim and a prefix strip has to be an explicit rewrite. `break`
    // keeps it inside this location instead of re-running location matching.
    const rewrite = route.stripPrefix && path !== '/' ? `    rewrite ^${path}/?(.*)$ /$1 break;\n` : '';
    return {
      path,
      upstream: kubernetesUpstreamFactory(route.upstream, namespace),
      intercept,
      locations,
      rewrite,
    };
  });
  return `
server {
  listen ${UNDERPOST_GATEWAY.port};
  server_name ${host};
  root ${UNDERPOST_GATEWAY.root};

  # This host's own documents, served from disk before anything is proxied.
  # Every path in the layout begins with the hostname, which is exactly what the
  # gateway rewrites a status or context route onto — and a longer prefix than
  # the proxied root below, so nginx prefers it. Without this location the
  # rewritten document path falls into the proxy and is sent to the application,
  # which has no such route: the app answers 404, and an app that redirects its
  # own 404s turns that into a loop between the route and the rewrite.
  location /${host}/ {
    add_header Cache-Control 'public, max-age=60';
    try_files $uri $uri/index.html =404;
  }

${blocks
  .map(
    ({ path, upstream, intercept, rewrite }) => `  location ${path} {
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Websockets: the upgrade must survive this hop or a client that negotiated
    # one at the edge is left holding a half-open connection.
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    set $upstream_${nginxTokenFactory(path)} ${upstream};
${intercept}
${rewrite}    proxy_pass http://$upstream_${nginxTokenFactory(path)};
  }`,
  )
  .join('\n\n')}

${blocks
  .map(({ locations }) => locations)
  .filter(Boolean)
  .join('\n')}
}
`;
};

/**
 * @method underpostGatewayManifestsFactory
 * @description Renders the whole workload: the Nginx config, the hostPath volume
 * holding the documents, the deployment and the Service routes target.
 * @param {string} [namespace] - Kubernetes namespace.
 * @param {string} hostPath - Node directory backing the static root.
 * @param {string} [nodeName] - Node the hostPath volume is pinned to.
 * @param {string} [storage] - Volume size.
 * @returns {string} Multi-document YAML.
 * @memberof UnderpostGateway
 */
const underpostGatewayManifestsFactory = ({
  namespace = 'default',
  hostPath,
  nodeName = '',
  storage = '1Gi',
  resolver,
} = {}) => {
  const nginxConf = nginxConfFactory({ resolver });
  // The config is mounted with `subPath`, which Kubernetes never refreshes in
  // place, and the pod template is otherwise identical across rebuilds — so
  // without this annotation an edited nginx.conf reaches the ConfigMap and
  // nothing else, and the running Nginx keeps serving under the previous
  // layout for the life of the pod.
  const configHash = crypto.createHash('sha256').update(nginxConf).digest('hex').slice(0, 16);
  return `
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${UNDERPOST_GATEWAY.configMapName}
  namespace: ${namespace}
data:
  nginx.conf: |
${nginxConf
  .replace(/\n$/, '')
  .split('\n')
  .map((line) => (line.length > 0 ? `    ${line}` : ''))
  .join('\n')}
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: ${UNDERPOST_GATEWAY.volumeName}
spec:
  capacity:
    storage: ${storage}
  accessModes:
    - ReadOnlyMany
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual${
    nodeName
      ? `
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values:
                - ${nodeName}`
      : ''
  }
  claimRef:
    apiVersion: v1
    kind: PersistentVolumeClaim
    name: ${UNDERPOST_GATEWAY.claimName}
    namespace: ${namespace}
  hostPath:
    path: ${hostPath}
    type: DirectoryOrCreate
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${UNDERPOST_GATEWAY.claimName}
  namespace: ${namespace}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: manual
  volumeName: ${UNDERPOST_GATEWAY.volumeName}
  resources:
    requests:
      storage: ${storage}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${UNDERPOST_GATEWAY.name}
  namespace: ${namespace}
  labels:
    app: ${UNDERPOST_GATEWAY.name}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${UNDERPOST_GATEWAY.name}
  template:
    metadata:
      labels:
        app: ${UNDERPOST_GATEWAY.name}
      annotations:
        underpost.net/nginx-conf-hash: '${configHash}'
    spec:
      containers:
        - name: nginx
          image: ${UNDERPOST_GATEWAY.image}
          ports:
            - containerPort: ${UNDERPOST_GATEWAY.port}
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              cpu: 200m
              memory: 128Mi
          readinessProbe:
            httpGet:
              path: ${UNDERPOST_GATEWAY.healthPath}
              port: ${UNDERPOST_GATEWAY.port}
            initialDelaySeconds: 2
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: ${UNDERPOST_GATEWAY.healthPath}
              port: ${UNDERPOST_GATEWAY.port}
            initialDelaySeconds: 10
            periodSeconds: 20
          volumeMounts:
            - name: nginx-conf
              mountPath: /etc/nginx/nginx.conf
              subPath: nginx.conf
            - name: static-root
              mountPath: ${UNDERPOST_GATEWAY.root}
              readOnly: true
      volumes:
        - name: nginx-conf
          configMap:
            name: ${UNDERPOST_GATEWAY.configMapName}
        - name: static-root
          persistentVolumeClaim:
            claimName: ${UNDERPOST_GATEWAY.claimName}
---
apiVersion: v1
kind: Service
metadata:
  name: ${UNDERPOST_GATEWAY.serviceName}
  namespace: ${namespace}
  labels:
    app: ${UNDERPOST_GATEWAY.name}
spec:
  type: ClusterIP
  selector:
    app: ${UNDERPOST_GATEWAY.name}
  ports:
    - name: http
      protocol: TCP
      port: ${UNDERPOST_GATEWAY.port}
      targetPort: ${UNDERPOST_GATEWAY.port}
`;
};

/**
 * @method writeStaticAsset
 * @description Places one document in the node directory backing the static
 * root. The deploy runs on that node, so the file is copied directly rather than
 * shipped through the API server — which is also what keeps a page of any size
 * out of the cluster's object store.
 * @param {string} hostRoot - Node directory backing the static root.
 * @param {string} assetPath - Root-relative destination.
 * @param {string} sourcePath - File to copy.
 * @returns {boolean} True when the document was placed.
 * @memberof UnderpostGateway
 */
const writeStaticAsset = ({ hostRoot, assetPath, sourcePath }) => {
  if (!sourcePath || !fs.existsSync(sourcePath) || fs.statSync(sourcePath).size === 0) return false;
  const target = nodePath.join(hostRoot, assetPath);
  // sudo: the node directory is root-owned, and the deploy may run unprivileged.
  shellExec(`sudo mkdir -p ${nodePath.dirname(target)}`, { silent: true });
  shellExec(`sudo cp -f ${sourcePath} ${target}`, { silent: true });
  return true;
};

/**
 * @method syncStaticAssetFromPod
 * @description Pulls one document out of the running workload and places it in
 * the static tree.
 *
 * The pod is the authority for these artifacts, not the host: several clients
 * are built from sources that only exist inside the container (cloned from the
 * private repo at start-up), so the host's `public/` tree is both incomplete and
 * as old as the last host-side build. Copying from the pod is what makes the
 * placed document match what the workload would actually have served.
 * @param {string} podName - Workload pod holding the built artifact.
 * @param {string} [namespace] - Pod namespace.
 * @param {string} [container] - Container within the pod.
 * @param {string} sourcePath - Absolute path of the artifact inside the container.
 * @param {string} hostRoot - Node directory backing the static root.
 * @param {string} assetPath - Root-relative destination.
 * @returns {boolean} True when the document was placed.
 * @memberof UnderpostGateway
 */
const syncStaticAssetFromPod = ({ podName, namespace = 'default', container, sourcePath, hostRoot, assetPath }) => {
  const target = nodePath.join(hostRoot, assetPath);
  const containerFlag = container ? ` -c ${container}` : '';
  // Keyed by destination, not by basename: every document in the layout is an
  // `index.html`, so a shared staging name lets one asset's copy be mistaken
  // for another's.
  const staged = nodePath.join(
    '/tmp',
    `underpost-gateway-${crypto.createHash('sha256').update(assetPath).digest('hex').slice(0, 12)}-${process.pid}`,
  );
  // Staged through /tmp because `kubectl cp` runs unprivileged while the node
  // directory is root-owned; the move is the only step that needs sudo.
  fs.removeSync(staged);
  shellExec(`kubectl cp ${namespace}/${podName}:${sourcePath} ${staged}${containerFlag} 2>/dev/null || true`, {
    silent: true,
    silentOnError: true,
  });
  if (!fs.existsSync(staged) || fs.statSync(staged).size === 0) {
    fs.removeSync(staged);
    return false;
  }
  shellExec(`sudo mkdir -p ${nodePath.dirname(target)}`, { silent: true });
  shellExec(`sudo cp -f ${staged} ${target}`, { silent: true });
  fs.removeSync(staged);
  logger.info('Static asset synced from workload', { podName, sourcePath, assetPath });
  return true;
};

/**
 * @method writeHostServerConf
 * @description Writes one host's server block into a directory, or removes it
 * when there is nothing to serve.
 *
 * A build artifact and nothing more: it touches no cluster, so generating
 * manifests works with no cluster running at all. Installing the block into the
 * live gateway and reloading it is {@link UnderpostGateway.installGatewayConf}'s
 * job, on the apply path where a cluster is a precondition.
 * @param {string} confDir - Directory the block is written to.
 * @param {string} host - Hostname the block serves.
 * @param {string} conf - Rendered block from {@link UnderpostGateway.hostServerConfFactory}; empty removes it.
 * @returns {boolean} True when the file changed.
 * @memberof UnderpostGateway
 */
const writeHostServerConf = ({ confDir, host, conf }) => {
  const target = nodePath.join(confDir, `${host}.conf`);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === (conf || '')) return false;
  if (!conf) {
    fs.removeSync(target);
    return true;
  }
  fs.mkdirpSync(confDir);
  fs.writeFileSync(target, conf, 'utf8');
  return true;
};

/**
 * @method hostInstanceRegistryPathFactory
 * @description Path of the descriptor set last published for a host.
 *
 * Kept beside the host's server block because it describes the same object, and
 * given a non-`.conf` suffix so {@link UnderpostGateway.installGatewayConf}
 * never installs it into Nginx.
 * @param {string} confDir - Directory holding the built blocks.
 * @param {string} host - Hostname.
 * @returns {string} File path.
 * @memberof UnderpostGateway
 */
const hostInstanceRegistryPathFactory = ({ confDir, host }) => nodePath.join(confDir, `${host}.instances.json`);

/**
 * @method readHostInstanceRegistry
 * @description The instance descriptors last published for a host.
 *
 * The conf declares what *should* run; this records what the host was last
 * rendered with, which is the only place a variant's descriptor survives being
 * removed from the conf while its workload is still up. Unreadable or malformed
 * content is treated as absent: a broken registry must not block a deploy, it
 * just means nothing extra is preserved.
 * @param {string} confDir - Directory holding the built blocks.
 * @param {string} host - Hostname.
 * @returns {Array<object>} Descriptors, or an empty list.
 * @memberof UnderpostGateway
 */
const readHostInstanceRegistry = ({ confDir, host }) => {
  const target = hostInstanceRegistryPathFactory({ confDir, host });
  if (!fs.existsSync(target)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.id) : [];
  } catch (error) {
    logger.warn('Ignoring unreadable host instance registry', { target, message: error.message });
    return [];
  }
};

/**
 * @method writeHostInstanceRegistry
 * @description Records the descriptors a host was just rendered with.
 * @param {string} confDir - Directory holding the built blocks.
 * @param {string} host - Hostname.
 * @param {Array<object>} instances - Descriptors used for this render.
 * @returns {boolean} True when the file changed.
 * @memberof UnderpostGateway
 */
const writeHostInstanceRegistry = ({ confDir, host, instances = [] }) => {
  const target = hostInstanceRegistryPathFactory({ confDir, host });
  const next = `${JSON.stringify(instances, null, 2)}\n`;
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === next) return false;
  fs.mkdirpSync(confDir);
  fs.writeFileSync(target, next, 'utf8');
  return true;
};

/**
 * @method installGatewayConf
 * @description Installs the built server blocks into the shared gateway and
 * reloads Nginx.
 *
 * The blocks live in the volume rather than the ConfigMap because the workload is
 * shared by every deploy: a ConfigMap would make one deploy's apply rewrite
 * another's routing, and a `subPath` mount would never refresh anyway. Reloading
 * signals the running master, so the config lands without dropping a connection.
 *
 * A block that does not parse would take the whole edge down on reload, so the
 * config is validated first and the previous content is put back if it fails —
 * leaving the running Nginx exactly as it was.
 * @param {string} hostRoot - Node directory backing the gateway root.
 * @param {string} confSourceDir - Directory holding the built blocks.
 * @param {string} [namespace] - Namespace holding the workload.
 * @returns {boolean} True when Nginx was reloaded with the new config.
 * @throws {Error} When Nginx rejects the candidate config or cannot reload. A
 *   rejected candidate is restored before the error is raised.
 * @memberof UnderpostGateway
 */
const installGatewayConf = ({ hostRoot, confSourceDir, namespace = 'default' }) => {
  if (!fs.existsSync(confSourceDir)) return false;
  const blocks = fs.readdirSync(confSourceDir).filter((name) => name.endsWith('.conf'));
  if (blocks.length === 0) return false;
  const confDir = nodePath.join(hostRoot, UNDERPOST_GATEWAY.confDir);
  // sudo: the node directory is root-owned, and the deploy may run unprivileged.
  shellExec(`sudo mkdir -p ${confDir}`, { silent: true });
  const previous = Object.fromEntries(
    blocks.map((name) => {
      const target = nodePath.join(confDir, name);
      return [name, fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null];
    }),
  );
  const restorePrevious = () => {
    for (const [name, content] of Object.entries(previous)) {
      const target = nodePath.join(confDir, name);
      if (content === null) shellExec(`sudo rm -f ${target}`, { silent: true });
      else {
        const staged = nodePath.join('/tmp', `underpost-gateway-restore-${name}-${process.pid}`);
        fs.writeFileSync(staged, content, 'utf8');
        shellExec(`sudo cp -f ${staged} ${target}`, { silent: true });
        fs.removeSync(staged);
      }
    }
  };
  for (const name of blocks)
    shellExec(`sudo cp -f ${nodePath.join(confSourceDir, name)} ${nodePath.join(confDir, name)}`, { silent: true });
  const test = shellExec(`kubectl exec -n ${namespace} deploy/${UNDERPOST_GATEWAY.name} -- nginx -t 2>&1`, {
    stdout: true,
    silent: true,
    silentOnError: true,
  });
  if (!`${test}`.includes('successful')) {
    restorePrevious();
    logger.error('Gateway config rejected; the previous config was restored and Nginx left running', {
      blocks,
      test: `${test}`.trim().split('\n').slice(-3).join(' '),
    });
    throw new Error(
      `Gateway config rejected for ${blocks.join(', ')}: ${`${test}`.trim().split('\n').slice(-3).join(' ')}`,
    );
  }
  try {
    shellExec(`kubectl exec -n ${namespace} deploy/${UNDERPOST_GATEWAY.name} -- nginx -s reload`, {
      silent: true,
    });
  } catch (error) {
    restorePrevious();
    // The running master normally retains its old config when a reload signal
    // fails. Re-signal after restoring so even a partial reload converges back
    // to the last validated state.
    shellExec(`kubectl exec -n ${namespace} deploy/${UNDERPOST_GATEWAY.name} -- nginx -s reload`, {
      silent: true,
      silentOnError: true,
    });
    throw error;
  }
  logger.info('Gateway config installed and reloaded', { blocks, confDir });
  return true;
};

/**
 * @method seedDefaultStatusPage
 * @description Writes the shared fallback document `nginx.conf` serves through
 * `error_page`, so a host with nothing on disk gets a deliberate page instead of
 * Nginx's stock error. Never overwrites an existing document — an operator may
 * have replaced it.
 * @param {string} hostRoot - Node directory backing the static root.
 * @returns {boolean} True when the document was written.
 * @memberof UnderpostGateway
 */
const seedDefaultStatusPage = (hostRoot) => {
  // The base config includes `<confDir>/*.conf`; the directory has to exist
  // before any deploy contributes a block to it.
  shellExec(`sudo mkdir -p ${nodePath.join(hostRoot, UNDERPOST_GATEWAY.confDir)}`, { silent: true });
  const target = nodePath.join(hostRoot, defaultStatusPagePath(404));
  if (fs.existsSync(target)) return false;
  const document = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>404 Not Found</title>
  </head>
  <body>
    <h1>404</h1>
    <p>The requested resource was not found.</p>
  </body>
</html>
`;
  shellExec(`sudo mkdir -p ${nodePath.dirname(target)}`, { silent: true });
  shellExec(`sudo tee ${target} > /dev/null <<'EOF'\n${document}EOF\n`, { silent: true });
  return true;
};

/**
 * @method gatewayStaticAssetExists
 * @description Whether a document is present and non-empty under the gateway
 * root. An empty file is treated as absent: it is what a half-finished copy
 * leaves behind, and serving it would answer a status page with a blank body.
 * @param {string} hostRoot - Node directory backing the gateway root.
 * @param {string} assetPath - Root-relative path of the document.
 * @returns {boolean} True when the document can be served.
 * @memberof UnderpostGateway
 */
const gatewayStaticAssetExists = ({ hostRoot, assetPath }) => {
  const target = `${hostRoot}/${assetPath}`;
  return fs.existsSync(target) && fs.statSync(target).size > 0;
};

/**
 * @method pwaFallbackChecksFactory
 * @description The fallback probes a deploy's own hosts are verified with, read
 * from `conf.server.json` and `conf.ssr.json`.
 *
 * One probe per host/sub-path that declares a maintenance view, because that is
 * the document an unreachable workload has to answer with — the condition the
 * edge must satisfy before any application is deployed behind it.
 * @param {string} deployId - Deploy id whose conf declares the views.
 * @returns {Array<{host: string, path: string, assetPath: string, kind: string}>} One probe per declaring sub-path.
 * @memberof UnderpostGateway
 */
const pwaFallbackChecksFactory = (deployId) => {
  const confServer = loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`);
  const confSSRPath = `./engine-private/conf/${deployId}/conf.ssr.json`;
  const confSSR = fs.existsSync(confSSRPath) ? JSON.parse(fs.readFileSync(confSSRPath, 'utf8')) : {};
  const checks = [];
  for (const host of Object.keys(confServer))
    for (const path of Object.keys(confServer[host])) {
      const maintenance = Underpost.deploy
        .edgeRouteEntriesFactory({ confServer, confSSR, host, path })
        .find((entry) => entry.context === 'maintenance');
      if (maintenance)
        checks.push({
          host,
          path,
          assetPath: maintenance.assetPath,
          kind: maintenance.kind,
        });
    }
  return checks;
};

/**
 * @method instanceFallbackChecksFactory
 * @description The fallback probes a set of instances are verified with, one per
 * host and sub-path.
 *
 * Deduplicated on `host + path`: a variant that declares several status pages is
 * still one route to probe, and probing it once per declared status would report
 * the same reachability several times.
 * @param {Array<object>} [instances] - Expanded instance entries.
 * @returns {Array<{host: string, path: string, assetPath: string, kind: string}>} One probe per instance sub-path.
 * @memberof UnderpostGateway
 */
const instanceFallbackChecksFactory = (instances = []) => {
  const checks = new Map();
  for (const entry of instanceStatusPageEntriesFactory({ instances }))
    if (!checks.has(`${entry.host}${entry.path}`))
      checks.set(`${entry.host}${entry.path}`, {
        host: entry.host,
        path: entry.path,
        assetPath: entry.assetPath,
        kind: `status:${entry.status}`,
      });
  return [...checks.values()];
};

/**
 * @method assertStaticAssets
 * @description Fails the deploy when a configured document reached neither the
 * placement pass nor the gateway root.
 *
 * Deliberately fatal. A missing document is not visible at deploy time — the
 * routes are accepted, the workload is healthy, and the gap only surfaces later
 * as a shared default page in place of the host's own. Refusing to continue is
 * what turns that into an immediate, attributable failure.
 * @param {Array<object>} records - Placement records carrying `source` and `assetPath`.
 * @param {string} hostRoot - Node directory backing the gateway root.
 * @param {string} label - Workflow name used in the thrown message.
 * @returns {Array<object>} The records, unchanged, when every document is present.
 * @throws {Error} When any configured document is absent.
 * @memberof UnderpostGateway
 */
const assertStaticAssets = ({ records, hostRoot, label }) => {
  const missing = records.filter(
    (entry) => !entry.source && !gatewayStaticAssetExists({ hostRoot, assetPath: entry.assetPath }),
  );
  if (missing.length > 0)
    throw new Error(
      `[${label}] Static gateway bootstrap is missing configured assets: ` +
        missing.map((entry) => entry.assetPath).join(', '),
    );
  return records;
};

/**
 * @method placeInstanceStaticAssets
 * @description Places every instance's declared status page in the gateway root
 * and asserts the result.
 *
 * The documents come from the project each instance runs, so this is the only
 * pass that can supply them; anything still missing afterwards would leave a
 * route pointing at a document that cannot exist.
 * @param {Array<object>} instances - Expanded instance entries.
 * @param {object} options - Deploy/run options (gateway root, namespace).
 * @param {string} label - Workflow name used in the thrown message.
 * @returns {Array<object>} One record per document, with where it came from.
 * @memberof UnderpostGateway
 */
const placeInstanceStaticAssets = ({ instances, options, label }) => {
  const hostRoot = Underpost.deploy.underpostGatewayRootFactory(options);
  const records = instanceStatusPageEntriesFactory({ instances }).map((entry) => ({
    ...entry,
    source: writeStaticAsset({ hostRoot, assetPath: entry.assetPath, sourcePath: entry.sourcePath }) ? 'project' : null,
  }));
  return assertStaticAssets({ records, hostRoot, label });
};

/**
 * @method gatewayFallbackProbeRunner
 * @description Proves the edge answers each configured fallback with the exact
 * document on disk, before any application is deployed behind it.
 *
 * The assertion is on the response, not on the manifests: an accepted route and a
 * Programmed Gateway say nothing about which body a client receives, and every
 * failure this pipeline has had was invisible in object status. The expected body
 * is hashed from the file the config points at, so a probe cannot pass against a
 * shared default page.
 *
 * With no workload deployed yet the upstream is unreachable, so the wanted status
 * is an upstream failure carrying the configured document — which is the whole
 * contract being verified. Polling absorbs the reconciliation window in which the
 * data plane still serves the previous generation.
 *
 * `gatewayStatusRunner` is injected rather than imported so this module never
 * depends on the runner collection that calls it.
 * @param {Array<object>} checks - Probes from {@link UnderpostGateway.pwaFallbackChecksFactory} or {@link UnderpostGateway.instanceFallbackChecksFactory}.
 * @param {object} options - Deploy/run options (namespace, dev, gatewayApi).
 * @param {string} label - Workflow name used in log lines and thrown messages.
 * @param {Function} gatewayStatusRunner - `(hosts, options) => Promise<{programmed: boolean, servesHttps: boolean}>`.
 * @returns {Promise<Array<object>>} One result per probe.
 * @throws {Error} When the gateway is not operational, or any probe fails.
 * @memberof UnderpostGateway
 */
const gatewayFallbackProbeRunner = async ({ checks, options, label, gatewayStatusRunner }) => {
  if (!options.gatewayApi || checks.length === 0) return [];
  const namespace = options.namespace || 'default';
  shellExec(`kubectl rollout status deployment/${UNDERPOST_GATEWAY.name} -n ${namespace} --timeout=5m`);
  const hosts = [...new Set(checks.map((check) => check.host))];
  const gatewayStatus = await gatewayStatusRunner(hosts.join(','), { ...options, namespace });
  if (!gatewayStatus.programmed || (options.dev && !gatewayStatus.servesHttps))
    throw new Error(`[${label}] Gateway is not operational before application deployment`);

  const hostRoot = Underpost.deploy.underpostGatewayRootFactory(options);
  const failures = [];
  const results = [];
  for (const check of checks) {
    const expectedPath = `${hostRoot}/${check.assetPath}`;
    const expectedHash = gatewayStaticAssetExists({ hostRoot, assetPath: check.assetPath })
      ? crypto.createHash('sha256').update(fs.readFileSync(expectedPath)).digest('hex')
      : '';
    let body = '';
    let status = '';
    let actualHash = '';
    let passed = false;
    let attempts = 0;
    // Gateway and HTTPRoute status can still show the previous generation for a
    // short reconciliation window. Poll the actual response until the intended
    // fallback is observable instead of racing the controller once.
    for (attempts = 1; attempts <= 30; attempts++) {
      if (options.dev) {
        const url = `https://${check.host}${check.path || '/'}`;
        const curl = `curl -sSk --noproxy '*' --resolve ${check.host}:443:127.0.0.1`;
        body = shellExec(`${curl} ${url}`, { stdout: true, silent: true, silentOnError: true });
        status = shellExec(`${curl} -o /dev/null -w '%{http_code}' ${url}`, {
          stdout: true,
          silent: true,
          silentOnError: true,
        }).trim();
      } else {
        const request = `http://127.0.0.1${check.path || '/'}`;
        body = shellExec(
          `kubectl exec -n ${namespace} deploy/${UNDERPOST_GATEWAY.name} -- sh -c ` +
            `"wget -q -O - -T 10 --header 'Host: ${check.host}' ${request} 2>/dev/null || true"`,
          { stdout: true, silent: true, silentOnError: true },
        );
        const headers = shellExec(
          `kubectl exec -n ${namespace} deploy/${UNDERPOST_GATEWAY.name} -- sh -c ` +
            `"wget -S -O /dev/null -T 10 --header 'Host: ${check.host}' ${request} 2>&1 || true"`,
          { stdout: true, silent: true, silentOnError: true },
        );
        status = [...headers.matchAll(/HTTP\/[0-9.]+\s+([0-9]{3})/g)].pop()?.[1] || '';
      }
      actualHash = crypto
        .createHash('sha256')
        .update(body || '')
        .digest('hex');
      passed = /^50[234]$/.test(status) && !!expectedHash && actualHash === expectedHash;
      if (passed) break;
      if (attempts < 30) await timer(2000);
    }
    const result = {
      ...check,
      status,
      bodyMatchesConfiguredAsset: actualHash === expectedHash,
      attempts,
      passed,
    };
    results.push(result);
    if (!passed) failures.push(result);
  }
  logger.info(`[${label}] Pre-runtime fallback probes`, { results });
  if (failures.length > 0) throw new Error(`[${label}] ${failures.length}/${checks.length} fallback probes failed`);
  return results;
};

export {
  UNDERPOST_GATEWAY,
  assertStaticAssets,
  gatewayFallbackProbeRunner,
  gatewayStaticAssetExists,
  hostInstanceRegistryPathFactory,
  hostServerConfFactory,
  installGatewayConf,
  instanceFallbackChecksFactory,
  placeInstanceStaticAssets,
  pwaFallbackChecksFactory,
  readHostInstanceRegistry,
  writeHostInstanceRegistry,
  kubernetesUpstreamFactory,
  underpostGatewayManifestsFactory,
  nginxConfFactory,
  seedDefaultStatusPage,
  staticLocationFactory,
  staticPathSegmentFactory,
  statusPageAssetPathFactory,
  statusPageBuildSegment,
  statusPageLocationsFactory,
  syncStaticAssetFromPod,
  writeHostServerConf,
  writeStaticAsset,
};
