/**
 * Response compression policy for the Nginx workloads on the request path.
 *
 * @module src/server/network/underpost-compression.js
 * @namespace UnderpostCompression
 */

/**
 * @constant UNDERPOST_COMPRESSION
 * @description The compression policy both edge workloads render from.
 *
 * `text/html` appears in no type list on purpose: nginx and ngx_brotli both
 * always compress it, and naming it again only invites the two lists to drift.
 * Every entry is a format that is still text on the wire — already-compressed
 * media (png, woff2, mp4) is excluded, since re-encoding it spends CPU to add
 * bytes.
 * @memberof UnderpostCompression
 */
const UNDERPOST_COMPRESSION = {
  types: [
    'application/atom+xml',
    'application/geo+json',
    'application/javascript',
    'application/json',
    'application/ld+json',
    'application/manifest+json',
    'application/rss+xml',
    'application/vnd.api+json',
    'application/wasm',
    'application/x-javascript',
    'application/xhtml+xml',
    'application/xml',
    'font/otf',
    'font/ttf',
    'image/svg+xml',
    'image/x-icon',
    'text/css',
    'text/javascript',
    'text/markdown',
    'text/plain',
    'text/xml',
  ],
  // Below roughly this size a compressed body plus its headers is no smaller
  // than the original, and can be larger.
  minLength: 512,
  // Level 5 of 9: within a few percent of maximum ratio at a fraction of the
  // CPU. The edge compresses every response of every host, so the cost of a
  // higher level is paid on the shared workload, not on one deploy.
  gzipLevel: 5,
  // Brotli's scale runs to 11, where dynamic compression becomes slower than
  // the transfer it saves. 5 is the usual on-the-fly ceiling.
  brotliLevel: 5,
  filterModule: 'ngx_http_brotli_filter_module.so',
  staticModule: 'ngx_http_brotli_static_module.so',
  defaultImage: 'nginx:alpine',
  env: {
    image: 'UNDERPOST_NGINX_IMAGE',
    brotliModules: 'UNDERPOST_NGINX_BROTLI_MODULES',
    enabled: 'UNDERPOST_NGINX_COMPRESSION',
  },
};

/**
 * @method nginxImageFactory
 * @description The image both edge workloads run.
 *
 * Resolved in one place because the two have to agree: they sit on the same
 * request path, and brotli is a property of the image rather than of the
 * config. An image carrying ngx_brotli is the only way the brotli directives
 * below can be rendered at all.
 * @returns {string} Container image reference.
 * @memberof UnderpostCompression
 */
const nginxImageFactory = () =>
  `${process.env[UNDERPOST_COMPRESSION.env.image] || ''}`.trim() || UNDERPOST_COMPRESSION.defaultImage;

/**
 * @method brotliModuleDirFactory
 * @description Directory holding the brotli dynamic modules, or an empty string
 * when the image is not declared to carry them.
 *
 * Empty is the default and the safe state: gzip alone, on a stock image, with
 * no `load_module` line that could fail to resolve.
 * @returns {string} Absolute directory path, or `''`.
 * @memberof UnderpostCompression
 */
const brotliModuleDirFactory = () =>
  `${process.env[UNDERPOST_COMPRESSION.env.brotliModules] || ''}`.trim().replace(/\/+$/, '');

/**
 * @method compressionEnabledFactory
 * @description Whether responses are compressed at all.
 *
 * The escape hatch for a CPU-bound edge node: compression trades cycles for
 * bytes, and an operator who is out of the former rather than the latter needs
 * to turn it off without editing generated configuration.
 * @returns {boolean} True unless explicitly disabled.
 * @memberof UnderpostCompression
 */
const compressionEnabledFactory = () =>
  !['off', '0', 'false', 'no'].includes(`${process.env[UNDERPOST_COMPRESSION.env.enabled] || ''}`.trim().toLowerCase());

/**
 * @method compressionModulesConfFactory
 * @description The `load_module` lines brotli needs, in nginx's main context.
 *
 * Rendered only alongside the brotli directives that require them, so a config
 * never loads a module it does not use or uses one it did not load — using one
 * that was not loaded is a start-up failure, and the reverse is surface on a
 * workload that has no documents to serve from it.
 * @param {string} [brotliModuleDir] - Directory holding the modules; empty renders nothing.
 * @param {boolean} [enabled] - Whether compression is on at all.
 * @param {boolean} [staticRoot] - Whether the workload serves documents from disk.
 * @returns {string} Main-context directives, or an empty string.
 * @memberof UnderpostCompression
 */
const compressionModulesConfFactory = ({
  brotliModuleDir = brotliModuleDirFactory(),
  enabled = compressionEnabledFactory(),
  staticRoot = false,
} = {}) => {
  if (!enabled || !brotliModuleDir) return '';
  return [
    `load_module ${brotliModuleDir}/${UNDERPOST_COMPRESSION.filterModule};`,
    ...(staticRoot ? [`load_module ${brotliModuleDir}/${UNDERPOST_COMPRESSION.staticModule};`] : []),
  ].join('\n');
};

/**
 * @method compressionConfFactory
 * @description The compression block for an nginx `http` context.
 *
 * `gzip_proxied any` is what makes this worth rendering on a reverse proxy at
 * all: the default is `off`, which suppresses compression for exactly the
 * responses these workloads exist to forward. A response the upstream already
 * encoded is passed through untouched either way — nginx never re-compresses
 * one that carries `Content-Encoding`.
 *
 * `*_static` is only rendered where a document root exists. It costs one stat()
 * per request to serve an operator-placed `.gz`/`.br` sibling with no CPU at
 * all, and has nothing to look for on a workload that serves no files.
 * @param {boolean} [enabled] - Whether compression is on at all.
 * @param {string} [brotliModuleDir] - Directory holding the brotli modules; empty renders gzip alone.
 * @param {boolean} [staticRoot] - Whether the workload serves documents from disk.
 * @param {string} [indent] - Leading whitespace for each line.
 * @returns {string} `http`-context directives, or an empty string.
 * @memberof UnderpostCompression
 */
const compressionConfFactory = ({
  enabled = compressionEnabledFactory(),
  brotliModuleDir = brotliModuleDirFactory(),
  staticRoot = false,
  indent = '  ',
} = {}) => {
  if (!enabled) return '';
  const types = UNDERPOST_COMPRESSION.types.join(' ');
  const lines = [
    'gzip on;',
    // Compressed and uncompressed bodies share a URL, so a cache that ignores
    // this header serves one to a client that asked for the other.
    'gzip_vary on;',
    `gzip_comp_level ${UNDERPOST_COMPRESSION.gzipLevel};`,
    `gzip_min_length ${UNDERPOST_COMPRESSION.minLength};`,
    'gzip_proxied any;',
    `gzip_types ${types};`,
    ...(staticRoot ? ['gzip_static on;'] : []),
  ];
  if (brotliModuleDir)
    lines.push(
      'brotli on;',
      `brotli_comp_level ${UNDERPOST_COMPRESSION.brotliLevel};`,
      `brotli_min_length ${UNDERPOST_COMPRESSION.minLength};`,
      `brotli_types ${types};`,
      ...(staticRoot ? ['brotli_static on;'] : []),
    );
  return lines.map((line) => `${indent}${line}`).join('\n');
};

export {
  UNDERPOST_COMPRESSION,
  brotliModuleDirFactory,
  compressionConfFactory,
  compressionEnabledFactory,
  compressionModulesConfFactory,
  nginxImageFactory,
};
