import { Auth } from '../../components/core/Auth.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'atlas-sprite-sheet';
/* Idle previews by key (item label or definition cid), shared by every view of the page; null when there is none. */
const idlePreviews = new Map();
/* Idle preview loads in flight: concurrent callers share one request. */
const idlePreviewLoads = new Map();
/* The version of a key moves on every write that changes its preview, so its URL never shows a stale copy. */
const idlePreviewVersions = new Map();
class AtlasSpriteSheetService {
  /** URL of the 300 px idle preview of an item label or a definition cid. */
  static idlePreviewUrl = (key) => {
    const version = idlePreviewVersions.get(key);
    return `${getApiBaseUrl({ endpoint, id: `idle-preview/${key}` })}${version ? `?v=${version}` : ''}`;
  };
  /** The loaded idle preview of a key, or null while it loads or when there is none. */
  static idlePreviewImage = (key) => idlePreviews.get(key) ?? null;
  /** Loads the idle preview of a key once: resolves with the image, or null when there is none. */
  static loadIdlePreview = (key) => {
    if (idlePreviews.has(key)) return Promise.resolve(idlePreviews.get(key));
    if (!idlePreviewLoads.has(key)) {
      const version = idlePreviewVersions.get(key);
      const load = new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        const settle = (value) => {
          if (idlePreviewVersions.get(key) === version) idlePreviews.set(key, value);
          resolve(value);
        };
        img.onload = () => settle(img);
        img.onerror = () => settle(null);
        img.src = AtlasSpriteSheetService.idlePreviewUrl(key);
      }).finally(() => idlePreviewLoads.delete(key));
      idlePreviewLoads.set(key, load);
    }
    return idlePreviewLoads.get(key);
  };
  /** Loads the idle previews of many keys; `onLoad` runs once for each preview that arrives. */
  static preloadIdlePreviews = (keys, onLoad) =>
    Promise.all(
      [...new Set(keys)]
        .filter((key) => !idlePreviews.has(key))
        .map((key) => AtlasSpriteSheetService.loadIdlePreview(key).then((img) => img && onLoad?.())),
    );
  /** Drops the idle preview of a key after a write that changes it: the next load reads the new one. */
  static invalidateIdlePreview = (key) => {
    idlePreviews.delete(key);
    idlePreviewLoads.delete(key);
    idlePreviewVersions.set(key, (idlePreviewVersions.get(key) ?? 0) + 1);
  };
  /** Frames per direction code, and the frame duration, of the render a definition names. */
  static getFrameCounts = (options = { cid: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ endpoint, id: `frame-counts/${options.cid}` }), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(readResponse)
        .then(resolve)
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /** The layout of the render a definition names, and the cids it is pinned under. */
  static getLayout = (options = { cid: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ endpoint, id: `layout/${options.cid}` }), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(readResponse)
        .then(resolve)
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  /** URL of the render a definition names: the primary render as pinned, or its upscaled derived render. */
  static renderUrl = ({ cid, upscaled = false }) =>
    getApiBaseUrl({ endpoint, id: `render/${cid}${upscaled ? '/upscaled' : ''}` });
  /** One direction of the render a definition names, animated: a blob URL of the WebP. */
  static getAnimation = (options = { cid: '', directionCode: '' }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ endpoint, id: `animation/${options.cid}/${options.directionCode}` }), {
        method: 'GET',
        credentials: 'include',
      })
        .then(async (res) => {
          if (!res.ok) return await readResponse(res);
          return { status: 'success', data: URL.createObjectURL(await res.blob()) };
        })
        .then(resolve)
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  static generateAtlas = (options = { id: '' }) =>
    new Promise((resolve, reject) =>
      fetch(`${getApiBaseUrl({ endpoint })}/generate/${options.id}`, {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  static deleteByObjectLayerId = (options = { id: '' }) =>
    new Promise((resolve, reject) =>
      fetch(`${getApiBaseUrl({ endpoint })}/object-layer/${options.id}`, {
        method: 'DELETE',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  static post = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'POST',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  static put = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'PUT',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  static get = (options = {}) => {
    const { id, page, limit, filterModel, sortModel, sort, asc, order } = options;
    const url = buildQueryUrl(getApiBaseUrl({ id, endpoint }), {
      page,
      limit,
      filterModel,
      sortModel,
      sort,
      asc,
      order,
    });
    return new Promise((resolve, reject) =>
      fetch(url.toString(), {
        method: 'GET',
        headers: headersFactory(),
        credentials: 'include',
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
  };
  static delete = (options = { id: '', body: {} }) =>
    new Promise((resolve, reject) =>
      fetch(getApiBaseUrl({ id: options.id, endpoint }), {
        method: 'DELETE',
        headers: headersFactory(),
        credentials: 'include',
        body: payloadFactory(options.body),
      })
        .then(readResponse)
        .then((res) => {
          logger.info(res);
          return resolve(res);
        })
        .catch((error) => {
          logger.error(error);
          return reject(error);
        }),
    );
}
export { AtlasSpriteSheetService };
