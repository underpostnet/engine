/**
 * Static assets of API modules: small immutable files a module declares, such as the images a
 * mailer link answers. Each asset is read once per process at module start, never on a request.
 * A request names an asset by its declared name only, so it never reaches the file system.
 *
 * Binary content that users store is a File document of the database, not an API asset.
 *
 * @module src/server/domain/api-assets.js
 * @namespace ApiAssets
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';

/** The cache policy of an API asset: public, kept for a day, revalidated by its ETag. */
const ASSET_CACHE_CONTROL = 'public, max-age=86400, must-revalidate';

/** Every loaded asset, by `<api>/<name>`. */
const loaded = new Map();

/** The assets this module created: what {@link isApiAsset} recognizes. */
const created = new WeakSet();

const assetKey = (api, name) => `${api}/${name}`;

/**
 * Reads the declared assets of an API that this process has not read yet.
 * @param {string} api
 * @param {Object<string, import('../../api/types.js').ApiAssetDeclaration>} declarations
 * @returns {Promise<void>}
 * @throws {Error} When a declared file cannot be read.
 * @memberof ApiAssets
 */
export async function loadApiAssets(api, declarations) {
  for (const [name, { file, contentType }] of Object.entries(declarations)) {
    const key = assetKey(api, name);
    if (loaded.has(key)) continue;
    const buffer = await fs.readFile(file).catch((error) => {
      throw new Error(`Asset ${key} cannot be read from ${file}: ${error.message}`);
    });
    const asset = Object.freeze({
      buffer,
      contentType,
      etag: `"${crypto.createHash('sha256').update(buffer).digest('base64url')}"`,
      cacheControl: ASSET_CACHE_CONTROL,
    });
    created.add(asset);
    loaded.set(key, asset);
  }
}

/**
 * The asset service of one API: the assets it declares, by name.
 * @param {string} api
 * @param {Object<string, import('../../api/types.js').ApiAssetDeclaration>} declarations
 * @returns {import('../../api/types.js').ApiAssetService}
 * @memberof ApiAssets
 */
export const apiAssetService = (api, declarations) =>
  Object.freeze({
    get: (name) => {
      const asset = Object.hasOwn(declarations, name) ? loaded.get(assetKey(api, name)) : undefined;
      if (!asset) throw Object.assign(new Error(`Asset ${name} not found`), { status: 404, expected: true });
      return asset;
    },
  });

/**
 * Whether a value is an asset of {@link loadApiAssets}.
 * @param {unknown} value
 * @returns {boolean}
 * @memberof ApiAssets
 */
export const isApiAsset = (value) => typeof value === 'object' && value !== null && created.has(value);

/**
 * Answers an asset with its type, cache policy and ETag, or 304 when the client holds it. The
 * asset may be embedded by any origin; the CORS headers stay those of the host.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('../../api/types.js').ApiAsset} asset
 * @returns {void}
 * @memberof ApiAssets
 */
export const sendApiAsset = (req, res, asset) => {
  res.set({
    'Content-Type': asset.contentType,
    'Cache-Control': asset.cacheControl,
    ETag: asset.etag,
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  if (req.fresh) return void res.status(304).end();
  res.status(200).end(asset.buffer);
};
