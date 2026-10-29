/**
 * Lightweight IPFS HTTP client for communicating with a Kubo (go-ipfs) node
 * and an IPFS Cluster daemon running side-by-side in the same StatefulSet.
 *
 * Kubo API  (port 5001) – add / pin / cat content, and the MFS namespace.
 * Cluster API (port 9094) – replicate pins across the cluster.
 *
 * Adding and pinning content, listing it in MFS, and removing either are separate operations:
 * a CID is the content identity, an MFS path only a name for it. No read path depends on MFS: it
 * is off unless `IPFS_MFS_ENABLED=true`, and then a listing operation names nothing.
 *
 * Every request is bounded as a whole, its body included, and every answer is checked: a CID the
 * node returns, the status of each MFS operation, and the replication the Cluster reaches.
 *
 * @module src/api/ipfs/ipfs.client.js
 * @namespace IpfsClient
 */
import { loggerFactory } from '../../server/ops/logger.js';
import Underpost from '../../index.js';
const logger = loggerFactory(import.meta);
const DEFAULT_IPFS_HTTP_TIMEOUT_MS = Number(process.env.IPFS_HTTP_TIMEOUT_MS || 10000);
/** The most bytes one gateway read accepts unless the caller names a limit. */
const DEFAULT_IPFS_MAX_READ_BYTES = Number(process.env.IPFS_MAX_READ_BYTES || 64 * 1024 * 1024);
const getRequestTimeoutMs = (kind = 'kubo') => {
  if (kind === 'cluster') {
    return Number(process.env.IPFS_CLUSTER_TIMEOUT_MS || DEFAULT_IPFS_HTTP_TIMEOUT_MS);
  }
  if (kind === 'gateway') {
    return Number(process.env.IPFS_GATEWAY_TIMEOUT_MS || DEFAULT_IPFS_HTTP_TIMEOUT_MS);
  }
  return Number(process.env.IPFS_KUBO_TIMEOUT_MS || DEFAULT_IPFS_HTTP_TIMEOUT_MS);
};

/** A CIDv0 (`Qm…`) or a base32 CIDv1 (`b…`). */
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;

/**
 * Whether a value is a CID the node may return.
 * @param {string} cid
 * @returns {boolean}
 */
const isCid = (cid) => typeof cid === 'string' && CID_PATTERN.test(cid);

/**
 * Whether this process creates and reads MFS listings: `IPFS_MFS_ENABLED=true`.
 * @returns {boolean}
 */
const mfsEnabled = () => process.env.IPFS_MFS_ENABLED === 'true';

/**
 * Reads a response body up to a byte limit. A body over the limit is cancelled, never buffered whole.
 * @param {Response} res
 * @param {number} maxBytes
 * @returns {Promise<Buffer|null>} Null when the body is over the limit.
 */
const boundedBody = async (res, maxBytes) => {
  if (Number(res.headers.get('content-length')) > maxBytes) {
    await res.body?.cancel();
    return null;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > maxBytes) {
      await res.body.cancel().catch(() => {});
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

/**
 * One request and its body inside one time budget: a node that sends headers and then stalls
 * fails like one that never answers.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {{kind?:string, label?:string, read?:'json'|'text'|'bytes'|'none', maxBytes?:number}} [params]
 * @returns {Promise<{status:number, ok:boolean, body:*}>} `body` is null for a byte read over `maxBytes`.
 * @throws {Error} When the budget runs out or the node is unreachable.
 */
const request = async (
  url,
  options = {},
  { kind = 'kubo', label = url, read = 'json', maxBytes = DEFAULT_IPFS_MAX_READ_BYTES } = {},
) => {
  const controller = new AbortController();
  const timeoutMs = getRequestTimeoutMs(kind);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let body = null;
    if (!res.ok || read === 'text') body = await res.text();
    else if (read === 'json') body = await res.json();
    else if (read === 'bytes') body = await boundedBody(res, maxBytes);
    else await res.body?.cancel();
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${label} timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

/** Kubo answers a missing MFS path with a 500 that says so. */
const isMissingMfsPath = ({ status, body }) => status === 500 && /file does not exist|no link named/i.test(`${body}`);

// ─────────────────────────────────────────────────────────
//  URL helpers
// ─────────────────────────────────────────────────────────
/**
 * Base URL of the Kubo RPC API (port 5001).
 * @returns {string}
 */
const getIpfsApiUrl = () =>
  process.env.IPFS_API_URL ||
  `http://${process.env.NODE_ENV === 'development' && !Underpost.state.isInsideContainer() ? 'localhost' : 'ipfs-cluster'}:5001`;
/**
 * Base URL of the IPFS Cluster REST API (port 9094).
 * @returns {string}
 */
const getClusterApiUrl = () =>
  process.env.IPFS_CLUSTER_API_URL ||
  `http://${process.env.NODE_ENV === 'development' && !Underpost.state.isInsideContainer() ? 'localhost' : 'ipfs-cluster'}:9094`;
/**
 * Base URL of the IPFS HTTP Gateway (port 8080).
 * @returns {string}
 */
const getGatewayUrl = () =>
  process.env.IPFS_GATEWAY_URL ||
  `http://${process.env.NODE_ENV === 'development' && !Underpost.state.isInsideContainer() ? 'localhost' : 'ipfs-cluster'}:8080`;
// ─────────────────────────────────────────────────────────
//  Cluster pins
// ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} ClusterPinResult
 * @property {'pinned'|'failed'|'unreachable'} status - Whether the Cluster took the pin.
 * @property {string} [error]
 */
/**
 * Asks the IPFS Cluster to track and replicate a pin. Idempotent.
 * @param {string} cid
 * @returns {Promise<ClusterPinResult>}
 */
const clusterPin = async (cid) => {
  try {
    const res = await request(
      `${getClusterApiUrl()}/pins/${encodeURIComponent(cid)}`,
      { method: 'POST' },
      { kind: 'cluster', label: `IPFS Cluster pin ${cid}`, read: 'none' },
    );
    if (!res.ok) {
      logger.warn(`IPFS Cluster pin failed (${res.status}): ${res.body}`);
      return { status: 'failed', error: `${res.status} ${res.body}`.slice(0, 500) };
    }
    return { status: 'pinned' };
  } catch (err) {
    logger.warn(`IPFS Cluster unreachable at ${getClusterApiUrl()}: ${err.message}`);
    return { status: 'unreachable', error: err.message };
  }
};
// ─────────────────────────────────────────────────────────
//  Core: add content
// ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} IpfsAddResult
 * @property {string} cid  – CID (Content Identifier) returned by the node.
 * @property {number} size – Cumulative DAG size reported by the node.
 * @property {ClusterPinResult} cluster – Whether the Cluster took the pin; the node holds it either way.
 */
/**
 * Adds bytes to the Kubo node, pins them there and on the IPFS Cluster. Adding bytes the node
 * holds again is a no-op that answers the same CID. MFS is a separate step: {@link copyToMfs}.
 *
 * 1. `POST /api/v0/add?pin=true` to Kubo (5001) – stores + locally pins.
 * 2. `POST /pins/<CID>` to the Cluster REST API (9094) – replicates the pin.
 *
 * The CID is the node's: a stored CID the Cluster did not take reports it in `cluster`, so a
 * caller reconciles it with {@link clusterPinStatus} and {@link pinCid}, never by adding again.
 *
 * @param {Buffer|string} content   – raw bytes or a UTF-8 string to store.
 * @param {string}        [filename='data'] – logical filename for the upload.
 * @returns {Promise<IpfsAddResult|null>} `null` when the node is unreachable or answers no CID.
 */
const addToIpfs = async (content, filename = 'data') => {
  const kuboUrl = getIpfsApiUrl();
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  const formData = new FormData();
  formData.append('file', new Blob([buf]), filename);
  let cid;
  let size;
  try {
    const res = await request(
      `${kuboUrl}/api/v0/add?pin=true&cid-version=1`,
      { method: 'POST', body: formData },
      { kind: 'kubo', label: `IPFS Kubo add ${filename}` },
    );
    if (!res.ok) {
      logger.error(`IPFS Kubo add failed (${res.status}): ${res.body}`);
      return null;
    }
    cid = res.body?.Hash;
    size = Number(res.body?.Size);
    if (!isCid(cid)) {
      logger.error(`IPFS Kubo add answered no CID for ${filename}: ${JSON.stringify(res.body).slice(0, 200)}`);
      return null;
    }
    logger.info(`IPFS Kubo add OK – CID: ${cid}, size: ${size}`);
  } catch (err) {
    logger.warn(`IPFS Kubo node unreachable at ${kuboUrl}: ${err.message}`);
    return null;
  }
  return { cid, size, cluster: await clusterPin(cid) };
};
// ─────────────────────────────────────────────────────────
//  Pin management
// ─────────────────────────────────────────────────────────
/**
 * Pins a CID the node holds on the node and on the Cluster. Idempotent: the reconciliation of an
 * add whose Cluster pin failed.
 *
 * @param {string} cid
 * @param {string} [type='recursive'] – `'recursive'` | `'direct'`
 * @returns {Promise<{cid:string, kubo:boolean, cluster:ClusterPinResult, error?:string}>}
 */
const pinCid = async (cid, type = 'recursive') => {
  if (!isCid(cid)) return { cid, kubo: false, cluster: { status: 'failed' }, error: 'not a CID' };
  let kubo = false;
  let error;
  try {
    const res = await request(
      `${getIpfsApiUrl()}/api/v0/pin/add?arg=${encodeURIComponent(cid)}&type=${type}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS Kubo pin/add ${cid}`, read: 'none' },
    );
    kubo = res.ok;
    if (!res.ok) error = `${res.status} ${res.body}`.slice(0, 500);
  } catch (err) {
    error = err.message;
  }
  return { cid, kubo, cluster: await clusterPin(cid), ...(error ? { error } : {}) };
};
/**
 * Unpin a CID from both the Kubo node and the Cluster. The caller decides that nothing kept
 * references it: a release, a rollback target or a player stack.
 *
 * @param {string} cid
 * @returns {Promise<boolean>} True when the node no longer pins it.
 */
const unpinCid = async (cid) => {
  try {
    const res = await request(
      `${getClusterApiUrl()}/pins/${encodeURIComponent(cid)}`,
      { method: 'DELETE' },
      { kind: 'cluster', label: `IPFS Cluster unpin ${cid}`, read: 'none' },
    );
    if (res.ok) logger.info(`IPFS Cluster unpin OK – CID: ${cid}`);
    else if (res.status === 404) logger.info(`IPFS Cluster unpin – CID already not pinned: ${cid}`);
    else logger.warn(`IPFS Cluster unpin failed (${res.status}): ${res.body}`);
  } catch (err) {
    logger.warn(`IPFS Cluster unpin unreachable: ${err.message}`);
  }
  try {
    const res = await request(
      `${getIpfsApiUrl()}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS Kubo pin/rm ${cid}`, read: 'none' },
    );
    if (res.ok) {
      logger.info(`IPFS Kubo unpin OK – CID: ${cid}`);
      return true;
    }
    // "not pinned or pinned indirectly" means the CID is already unpinned – treat as success
    if (`${res.body}`.includes('not pinned')) {
      logger.info(`IPFS Kubo unpin – CID already not pinned: ${cid}`);
      return true;
    }
    logger.warn(`IPFS Kubo pin/rm failed (${res.status}): ${res.body}`);
    return false;
  } catch (err) {
    logger.warn(`IPFS Kubo unpin unreachable: ${err.message}`);
    return false;
  }
};
// ─────────────────────────────────────────────────────────
//  Retrieval
// ─────────────────────────────────────────────────────────
/**
 * Retrieve raw bytes for a CID from the IPFS HTTP Gateway (port 8080).
 *
 * @param {string} cid
 * @param {{maxBytes?: number}} [limits] - `maxBytes`: the most bytes to read; a larger body answers
 *   null. `IPFS_MAX_READ_BYTES` by default.
 * @returns {Promise<Buffer|null>}
 */
const getFromIpfs = async (cid, { maxBytes = DEFAULT_IPFS_MAX_READ_BYTES } = {}) => {
  const url = getGatewayUrl();
  try {
    const res = await request(
      `${url}/ipfs/${encodeURIComponent(cid)}`,
      {},
      { kind: 'gateway', label: `IPFS gateway GET ${cid}`, read: 'bytes', maxBytes },
    );
    if (!res.ok) {
      logger.error(`IPFS gateway GET failed (${res.status}) for ${cid}`);
      return null;
    }
    if (!res.body) logger.warn(`IPFS gateway answered ${cid} with over ${maxBytes} bytes`);
    return res.body;
  } catch (err) {
    logger.warn(`IPFS gateway unreachable at ${url}: ${err.message}`);
    return null;
  }
};
// ─────────────────────────────────────────────────────────
//  Diagnostics
// ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} ClusterPinStatus
 * @property {string} cid
 * @property {boolean} tracked - The Cluster holds a pin of the CID.
 * @property {number} pinnedPeers - Peers that report it `pinned`.
 * @property {number} requiredPeers - Peers its replication factor asks for: `replication_factor_min`,
 *   or every peer the pin is allocated to when that factor is -1.
 * @property {string[]} pendingPeers - Peers that do not report it `pinned` yet.
 * @property {boolean} durable - The pinned peers meet the replication factor.
 */
/**
 * The replication the IPFS Cluster reaches for a CID, read from its own pin and its own
 * replication factor: `GET /pins/<cid>` and `GET /allocations/<cid>`.
 *
 * @param {string} cid
 * @returns {Promise<ClusterPinStatus|null>} `null` when the Cluster does not answer.
 */
const clusterPinStatus = async (cid) => {
  try {
    const [pins, allocation] = await Promise.all(
      ['pins', 'allocations'].map((resource) =>
        request(
          `${getClusterApiUrl()}/${resource}/${encodeURIComponent(cid)}`,
          {},
          { kind: 'cluster', label: `IPFS Cluster ${resource} ${cid}` },
        ),
      ),
    );
    if (pins.status === 404 || allocation.status === 404)
      return { cid, tracked: false, pinnedPeers: 0, requiredPeers: 1, pendingPeers: [], durable: false };
    if (!pins.ok || !allocation.ok) return null;
    const peers = Object.entries(pins.body?.peer_map ?? {});
    const pinned = peers.filter(([, { status }]) => status === 'pinned');
    const factor = Number(allocation.body?.replication_factor_min ?? -1);
    const requiredPeers =
      factor > 0 ? factor : Math.max(1, (allocation.body?.allocations ?? []).length || peers.length);
    return {
      cid,
      tracked: true,
      pinnedPeers: pinned.length,
      requiredPeers,
      pendingPeers: peers
        .filter(([, { status }]) => status !== 'pinned')
        .map(([peer, { peername }]) => peername || peer),
      durable: pinned.length >= requiredPeers,
    };
  } catch {
    return null;
  }
};
// ─────────────────────────────────────────────────────────
//  MFS management
// ─────────────────────────────────────────────────────────
/**
 * Remove a file or directory from the Kubo MFS (Mutable File System).
 * This cleans up entries visible in the IPFS Web UI "Files" section.
 *
 * @param {string} mfsPath – Full MFS path to remove, e.g. `/object-layer/cid/<cid>`.
 * @param {boolean} [recursive=true] – When `true`, removes directories recursively.
 * @returns {Promise<boolean>} `true` when the path is gone or was never there; with MFS off, no
 *   listing exists to remove.
 */
const removeMfsPath = async (mfsPath, recursive = true) => {
  if (!mfsEnabled()) return true;
  const kuboUrl = getIpfsApiUrl();
  try {
    const stat = await request(
      `${kuboUrl}/api/v0/files/stat?arg=${encodeURIComponent(mfsPath)}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS stat ${mfsPath}`, read: 'none' },
    );
    if (isMissingMfsPath(stat)) {
      logger.info(`IPFS MFS rm – path does not exist, skipping: ${mfsPath}`);
      return true;
    }
    if (!stat.ok) {
      logger.warn(`IPFS MFS stat failed (${stat.status}): ${stat.body}`);
      return false;
    }
    const rm = await request(
      `${kuboUrl}/api/v0/files/rm?arg=${encodeURIComponent(mfsPath)}&force=true${recursive ? '&recursive=true' : ''}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS rm ${mfsPath}`, read: 'none' },
    );
    if (!rm.ok) {
      logger.warn(`IPFS MFS rm failed (${rm.status}): ${rm.body}`);
      return false;
    }
    logger.info(`IPFS MFS rm OK – ${mfsPath}`);
    return true;
  } catch (err) {
    logger.warn(`IPFS MFS rm unreachable: ${err.message}`);
    return false;
  }
};
/**
 * Lists a CID under an MFS path: creates the parent directory, copies the CID beside the path,
 * then moves the copy over any entry there. The entry the path held stays until its replacement
 * exists. A copy is a reference, never a second copy of the bytes.
 *
 * @param {string} cid      – IPFS CID to list.
 * @param {string} mfsPath  – Full destination MFS path, e.g. `/object-layer/cid/<cid>/atlas.png`.
 * @returns {Promise<boolean>} `true` when the path lists the CID; `false` with MFS off.
 */
const copyToMfs = async (cid, mfsPath) => {
  if (!mfsEnabled() || !isCid(cid)) return false;
  const kuboUrl = getIpfsApiUrl();
  const destDir = mfsPath.substring(0, mfsPath.lastIndexOf('/')) || '/';
  const staged = `${mfsPath}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`;
  const step = async (operation, query) => {
    const res = await request(
      `${kuboUrl}/api/v0/files/${operation}?${query}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS ${operation} ${mfsPath}`, read: 'none' },
    );
    if (!res.ok && !(operation === 'rm' && isMissingMfsPath(res)))
      throw new Error(`${operation} answered ${res.status}: ${res.body}`);
  };
  try {
    await step('mkdir', `arg=${encodeURIComponent(destDir)}&parents=true`);
    await step('cp', `arg=/ipfs/${encodeURIComponent(cid)}&arg=${encodeURIComponent(staged)}`);
    await step('rm', `arg=${encodeURIComponent(mfsPath)}&force=true`);
    await step('mv', `arg=${encodeURIComponent(staged)}&arg=${encodeURIComponent(mfsPath)}`);
    logger.info(`IPFS MFS cp OK – ${mfsPath} → ${cid}`);
    return true;
  } catch (err) {
    logger.warn(`IPFS MFS cp failed – ${mfsPath}: ${err.message}`);
    await request(
      `${kuboUrl}/api/v0/files/rm?arg=${encodeURIComponent(staged)}&force=true`,
      { method: 'POST' },
      { kind: 'kubo', read: 'none' },
    ).catch(() => {});
    return false;
  }
};

/**
 * The CID an MFS path lists: `files/stat`.
 *
 * @param {string} mfsPath
 * @returns {Promise<{cid:string,size:number,type:string}|null>} `null` when the path does not exist,
 *   the node does not answer, or MFS is off.
 */
const statMfsPath = async (mfsPath) => {
  if (!mfsEnabled()) return null;
  try {
    const res = await request(
      `${getIpfsApiUrl()}/api/v0/files/stat?arg=${encodeURIComponent(mfsPath)}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS stat ${mfsPath}` },
    );
    if (!res.ok || !isCid(res.body?.Hash)) return null;
    return { cid: res.body.Hash, size: Number(res.body.Size), type: res.body.Type };
  } catch {
    return null;
  }
};

/**
 * The names an MFS directory holds: `files/ls`.
 *
 * @param {string} mfsPath
 * @returns {Promise<string[]|null>} `null` when the directory does not exist, the node does not
 *   answer, or MFS is off.
 */
const listMfsDirectory = async (mfsPath) => {
  if (!mfsEnabled()) return null;
  try {
    const res = await request(
      `${getIpfsApiUrl()}/api/v0/files/ls?arg=${encodeURIComponent(mfsPath)}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS ls ${mfsPath}` },
    );
    if (!res.ok) return null;
    return (res.body?.Entries ?? []).map(({ Name }) => Name);
  } catch {
    return null;
  }
};
// ─────────────────────────────────────────────────────────
//  Export
// ─────────────────────────────────────────────────────────
class IpfsClient {
  static getIpfsApiUrl = getIpfsApiUrl;
  static getClusterApiUrl = getClusterApiUrl;
  static getGatewayUrl = getGatewayUrl;
  static isCid = isCid;
  static mfsEnabled = mfsEnabled;
  static addToIpfs = addToIpfs;
  static pinCid = pinCid;
  static unpinCid = unpinCid;
  static getFromIpfs = getFromIpfs;
  static clusterPinStatus = clusterPinStatus;
  static copyToMfs = copyToMfs;
  static statMfsPath = statMfsPath;
  static listMfsDirectory = listMfsDirectory;
  static removeMfsPath = removeMfsPath;
  /**
   * Check whether a single CID is currently pinned on the local Kubo node.
   * Uses the pin/ls?arg=<cid> endpoint which returns only that one pin
   * (much cheaper than fetching the full list).
   *
   * @param {string} cid - IPFS Content Identifier to check.
   * @returns {Promise<boolean>} true when the CID is pinned.
   */
  static isCidPinned = async (cid) => {
    try {
      const res = await request(
        `${getIpfsApiUrl()}/api/v0/pin/ls?arg=${encodeURIComponent(cid)}&type=all`,
        { method: 'POST' },
        { kind: 'kubo', label: `IPFS Kubo pin/ls ${cid}` },
      );
      return res.ok && !!res.body?.Keys?.[cid];
    } catch {
      return false;
    }
  };
}
export { IpfsClient };
