/**
 * Static utility workload served at the gateway tier.
 *
 * Envoy Gateway rejects a direct-response body over 4096 bytes while translating
 * the HTTPRoute — before any patched route configuration exists — and that
 * rejection fails the whole route, not the one rule. A rendered status page is
 * far larger, so the gateway cannot carry the document itself.
 *
 * This module owns the alternative: one small Nginx deployment that holds every
 * host's status pages and other intercepted static contexts, which routes reach
 * as an ordinary backend. There is no size limit on a backend response, the
 * application workloads never see the request, and the same tree serves
 * maintenance pages or any other path interception.
 *
 * Layout under the Nginx root:
 *   <root>/<host>/<path>/status-pages/<status>/index.html
 *   <root>/<host>/<path>/<context>/...
 * where `<path>` is the proxy sub-path with `/` written as `root`, so
 * `www.cyberiaonline.com` + `/` + 404 becomes
 * `www.cyberiaonline.com/root/status-pages/404/index.html`.
 *
 * @module src/server/gateway-static.js
 * @namespace GatewayStatic
 */

import crypto from 'node:crypto';
import fs from 'fs-extra';
import nodePath from 'node:path';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';

const logger = loggerFactory(import.meta);

/**
 * @constant GATEWAY_STATIC
 * @description Identity of the static utility workload. One deployment serves
 * every host, so these names are cluster-wide constants rather than per-deploy.
 * @memberof GatewayStatic
 */
const GATEWAY_STATIC = {
  name: 'gateway-static-utility',
  serviceName: 'gateway-static-utility-service',
  configMapName: 'gateway-static-utility-nginx',
  claimName: 'pvc-gateway-static-utility',
  volumeName: 'pv-gateway-static-utility',
  image: 'nginx:alpine',
  root: '/var/www/static',
  port: 80,
  healthPath: '/healthz',
  defaultHostDir: 'default',
};

/**
 * @method staticPathSegmentFactory
 * @description Folds a proxy sub-path into one directory name. `/` has no
 * directory of its own, so it is written as `root`; anything else keeps its
 * segments joined by `-` to stay a single level under the host.
 * @param {string} [path] - Proxy sub-path (`/`, `/peer`, `/app`).
 * @returns {string} Directory name.
 * @memberof GatewayStatic
 */
const staticPathSegmentFactory = (path = '/') => {
  const segment = `${path || '/'}`.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
  return segment || 'root';
};

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
 * @memberof GatewayStatic
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
 * @returns {{ assetPath: string, dir: string, url: string }} See {@link GatewayStatic.staticLocationFactory}.
 * @memberof GatewayStatic
 */
const statusPageAssetPathFactory = ({ host, path = '/', status }) =>
  staticLocationFactory({ host, path, context: `status-pages/${status}` });

/**
 * @method defaultStatusPagePath
 * @description Root-relative location of the shared fallback document.
 * @param {string|number} [status] - HTTP status code.
 * @returns {string} Root-relative path.
 * @memberof GatewayStatic
 */
const defaultStatusPagePath = (status = 404) => `${GATEWAY_STATIC.defaultHostDir}/status-pages/${status}/index.html`;

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
 * @memberof GatewayStatic
 */
const nginxConfFactory = () => `worker_processes auto;
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

  server {
    listen ${GATEWAY_STATIC.port};
    server_name _;
    root ${GATEWAY_STATIC.root};

    error_page 404 /${defaultStatusPagePath(404)};

    # Probes are the only traffic that would otherwise dominate the log.
    location = ${GATEWAY_STATIC.healthPath} {
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
 * @method gatewayStaticManifestsFactory
 * @description Renders the whole workload: the Nginx config, the hostPath volume
 * holding the documents, the deployment and the Service routes target.
 * @param {string} [namespace] - Kubernetes namespace.
 * @param {string} hostPath - Node directory backing the static root.
 * @param {string} [nodeName] - Node the hostPath volume is pinned to.
 * @param {string} [storage] - Volume size.
 * @returns {string} Multi-document YAML.
 * @memberof GatewayStatic
 */
const gatewayStaticManifestsFactory = ({ namespace = 'default', hostPath, nodeName = '', storage = '1Gi' } = {}) => {
  const nginxConf = nginxConfFactory();
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
  name: ${GATEWAY_STATIC.configMapName}
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
  name: ${GATEWAY_STATIC.volumeName}
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
    name: ${GATEWAY_STATIC.claimName}
    namespace: ${namespace}
  hostPath:
    path: ${hostPath}
    type: DirectoryOrCreate
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${GATEWAY_STATIC.claimName}
  namespace: ${namespace}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: manual
  volumeName: ${GATEWAY_STATIC.volumeName}
  resources:
    requests:
      storage: ${storage}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${GATEWAY_STATIC.name}
  namespace: ${namespace}
  labels:
    app: ${GATEWAY_STATIC.name}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${GATEWAY_STATIC.name}
  template:
    metadata:
      labels:
        app: ${GATEWAY_STATIC.name}
      annotations:
        underpost.net/nginx-conf-hash: '${configHash}'
    spec:
      containers:
        - name: nginx
          image: ${GATEWAY_STATIC.image}
          ports:
            - containerPort: ${GATEWAY_STATIC.port}
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              cpu: 200m
              memory: 128Mi
          readinessProbe:
            httpGet:
              path: ${GATEWAY_STATIC.healthPath}
              port: ${GATEWAY_STATIC.port}
            initialDelaySeconds: 2
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: ${GATEWAY_STATIC.healthPath}
              port: ${GATEWAY_STATIC.port}
            initialDelaySeconds: 10
            periodSeconds: 20
          volumeMounts:
            - name: nginx-conf
              mountPath: /etc/nginx/nginx.conf
              subPath: nginx.conf
            - name: static-root
              mountPath: ${GATEWAY_STATIC.root}
              readOnly: true
      volumes:
        - name: nginx-conf
          configMap:
            name: ${GATEWAY_STATIC.configMapName}
        - name: static-root
          persistentVolumeClaim:
            claimName: ${GATEWAY_STATIC.claimName}
---
apiVersion: v1
kind: Service
metadata:
  name: ${GATEWAY_STATIC.serviceName}
  namespace: ${namespace}
  labels:
    app: ${GATEWAY_STATIC.name}
spec:
  type: ClusterIP
  selector:
    app: ${GATEWAY_STATIC.name}
  ports:
    - name: http
      protocol: TCP
      port: ${GATEWAY_STATIC.port}
      targetPort: ${GATEWAY_STATIC.port}
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
 * @memberof GatewayStatic
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
 * @memberof GatewayStatic
 */
const syncStaticAssetFromPod = ({ podName, namespace = 'default', container, sourcePath, hostRoot, assetPath }) => {
  const target = nodePath.join(hostRoot, assetPath);
  const containerFlag = container ? ` -c ${container}` : '';
  // Keyed by destination, not by basename: every document in the layout is an
  // `index.html`, so a shared staging name lets one asset's copy be mistaken
  // for another's.
  const staged = nodePath.join(
    '/tmp',
    `gateway-static-${crypto.createHash('sha256').update(assetPath).digest('hex').slice(0, 12)}-${process.pid}`,
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
 * @method seedDefaultStatusPage
 * @description Writes the shared fallback document `nginx.conf` serves through
 * `error_page`, so a host with nothing on disk gets a deliberate page instead of
 * Nginx's stock error. Never overwrites an existing document — an operator may
 * have replaced it.
 * @param {string} hostRoot - Node directory backing the static root.
 * @returns {boolean} True when the document was written.
 * @memberof GatewayStatic
 */
const seedDefaultStatusPage = (hostRoot) => {
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

export {
  GATEWAY_STATIC,
  gatewayStaticManifestsFactory,
  nginxConfFactory,
  seedDefaultStatusPage,
  staticLocationFactory,
  staticPathSegmentFactory,
  statusPageAssetPathFactory,
  syncStaticAssetFromPod,
  writeStaticAsset,
};
