/**
 * Lightweight IPFS HTTP client for communicating with a Kubo (go-ipfs) node
 * and an IPFS Cluster daemon running side-by-side in the same StatefulSet.
 *
 * Kubo API  (port 5001) – add / pin / cat content, and the MFS namespace.
 * Cluster API (port 9094) – replicate pins across the cluster.
 *
 * Adding and pinning content, listing it in MFS, and removing either are separate operations:
 * a CID is the content identity, an MFS path only a name for it.
 *
 * Uses native `FormData` + `Blob` (Node ≥ 18) for reliable multipart encoding.
 *
 * @module src/api/ipfs/ipfs.client.js
 * @namespace IpfsClient
 */
import { loggerFactory } from '../../server/ops/logger.js';
import Underpost from '../../index.js';
const logger = loggerFactory(import.meta);
const DEFAULT_IPFS_HTTP_TIMEOUT_MS = Number(process.env.IPFS_HTTP_TIMEOUT_MS || 10000);
const getRequestTimeoutMs = (kind = 'kubo') => {
  if (kind === 'cluster') {
    return Number(process.env.IPFS_CLUSTER_TIMEOUT_MS || DEFAULT_IPFS_HTTP_TIMEOUT_MS);
  }
  if (kind === 'gateway') {
    return Number(process.env.IPFS_GATEWAY_TIMEOUT_MS || DEFAULT_IPFS_HTTP_TIMEOUT_MS);
  }
  return Number(process.env.IPFS_KUBO_TIMEOUT_MS || DEFAULT_IPFS_HTTP_TIMEOUT_MS);
};
const fetchWithTimeout = async (url, options = {}, { kind = 'kubo', label = url } = {}) => {
  const controller = new AbortController();
  const timeoutMs = getRequestTimeoutMs(kind);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};
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
//  Core: add content
// ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} IpfsAddResult
 * @property {string} cid  – CID (Content Identifier) returned by the node.
 * @property {number} size – Cumulative DAG size reported by the node.
 */
/**
 * Adds bytes to the Kubo node, pins them there and on the IPFS Cluster. Adding bytes the node
 * holds again is a no-op that answers the same CID. MFS is a separate step: {@link copyToMfs}.
 *
 * 1. `POST /api/v0/add?pin=true` to Kubo (5001) – stores + locally pins.
 * 2. `POST /pins/<CID>` to the Cluster REST API (9094) – replicates the pin.
 *
 * @param {Buffer|string} content   – raw bytes or a UTF-8 string to store.
 * @param {string}        [filename='data'] – logical filename for the upload.
 * @returns {Promise<IpfsAddResult|null>} `null` when the node is unreachable.
 */
const addToIpfs = async (content, filename = 'data') => {
  const kuboUrl = getIpfsApiUrl();
  const clusterUrl = getClusterApiUrl();
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  const formData = new FormData();
  formData.append('file', new Blob([buf]), filename);
  let cid;
  let size;
  try {
    const res = await fetchWithTimeout(
      `${kuboUrl}/api/v0/add?pin=true&cid-version=1`,
      {
        method: 'POST',
        body: formData,
      },
      { kind: 'kubo', label: `IPFS Kubo add ${filename}` },
    );
    if (!res.ok) {
      const text = await res.text();
      logger.error(`IPFS Kubo add failed (${res.status}): ${text}`);
      return null;
    }
    const json = await res.json();
    cid = json.Hash;
    size = Number(json.Size);
    logger.info(`IPFS Kubo add OK – CID: ${cid}, size: ${size}`);
  } catch (err) {
    logger.warn(`IPFS Kubo node unreachable at ${kuboUrl}: ${err.message}`);
    return null;
  }
  try {
    const clusterRes = await fetchWithTimeout(
      `${clusterUrl}/pins/${encodeURIComponent(cid)}`,
      {
        method: 'POST',
      },
      { kind: 'cluster', label: `IPFS Cluster pin ${cid}` },
    );
    if (!clusterRes.ok) {
      const text = await clusterRes.text();
      logger.warn(`IPFS Cluster pin failed (${clusterRes.status}): ${text}`);
    } else {
      logger.info(`IPFS Cluster pin OK – CID: ${cid}`);
    }
  } catch (err) {
    logger.warn(`IPFS Cluster unreachable at ${clusterUrl}: ${err.message}`);
  }
  return { cid, size };
};
// ─────────────────────────────────────────────────────────
//  Pin management
// ─────────────────────────────────────────────────────────
/**
 * Explicitly pin an existing CID on both the Kubo node and the Cluster.
 *
 * @param {string} cid
 * @param {string} [type='recursive'] – `'recursive'` | `'direct'`
 * @returns {Promise<boolean>} `true` when at least the Kubo pin succeeded.
 */
const pinCid = async (cid, type = 'recursive') => {
  const kuboUrl = getIpfsApiUrl();
  const clusterUrl = getClusterApiUrl();
  let kuboOk = false;
  // Kubo pin
  try {
    const res = await fetchWithTimeout(
      `${kuboUrl}/api/v0/pin/add?arg=${encodeURIComponent(cid)}&type=${type}`,
      {
        method: 'POST',
      },
      { kind: 'kubo', label: `IPFS Kubo pin/add ${cid}` },
    );
    if (!res.ok) {
      const text = await res.text();
      logger.error(`IPFS Kubo pin/add failed (${res.status}): ${text}`);
    } else {
      kuboOk = true;
      logger.info(`IPFS Kubo pin OK – CID: ${cid} (${type})`);
    }
  } catch (err) {
    logger.warn(`IPFS Kubo pin unreachable: ${err.message}`);
  }
  // Cluster pin
  try {
    const clusterRes = await fetchWithTimeout(
      `${clusterUrl}/pins/${encodeURIComponent(cid)}`,
      {
        method: 'POST',
      },
      { kind: 'cluster', label: `IPFS Cluster pin ${cid}` },
    );
    if (!clusterRes.ok) {
      const text = await clusterRes.text();
      logger.warn(`IPFS Cluster pin failed (${clusterRes.status}): ${text}`);
    } else {
      logger.info(`IPFS Cluster pin OK – CID: ${cid}`);
    }
  } catch (err) {
    logger.warn(`IPFS Cluster pin unreachable: ${err.message}`);
  }
  return kuboOk;
};
/**
 * Unpin a CID from both the Kubo node and the Cluster.
 *
 * @param {string} cid
 * @returns {Promise<boolean>}
 */
const unpinCid = async (cid) => {
  const kuboUrl = getIpfsApiUrl();
  const clusterUrl = getClusterApiUrl();
  let kuboOk = false;
  // Cluster unpin
  try {
    const clusterRes = await fetchWithTimeout(
      `${clusterUrl}/pins/${encodeURIComponent(cid)}`,
      {
        method: 'DELETE',
      },
      { kind: 'cluster', label: `IPFS Cluster unpin ${cid}` },
    );
    if (!clusterRes.ok) {
      const text = await clusterRes.text();
      if (clusterRes.status === 404) {
        logger.info(`IPFS Cluster unpin – CID already not pinned: ${cid}`);
      } else {
        logger.warn(`IPFS Cluster unpin failed (${clusterRes.status}): ${text}`);
      }
    } else {
      logger.info(`IPFS Cluster unpin OK – CID: ${cid}`);
    }
  } catch (err) {
    logger.warn(`IPFS Cluster unpin unreachable: ${err.message}`);
  }
  // Kubo unpin
  try {
    const res = await fetchWithTimeout(
      `${kuboUrl}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`,
      {
        method: 'POST',
      },
      { kind: 'kubo', label: `IPFS Kubo pin/rm ${cid}` },
    );
    if (!res.ok) {
      const text = await res.text();
      // "not pinned or pinned indirectly" means the CID is already unpinned – treat as success
      if (text.includes('not pinned')) {
        kuboOk = true;
        logger.info(`IPFS Kubo unpin – CID already not pinned: ${cid}`);
      } else {
        logger.warn(`IPFS Kubo pin/rm failed (${res.status}): ${text}`);
      }
    } else {
      kuboOk = true;
      logger.info(`IPFS Kubo unpin OK – CID: ${cid}`);
    }
  } catch (err) {
    logger.warn(`IPFS Kubo unpin unreachable: ${err.message}`);
  }
  return kuboOk;
};
// ─────────────────────────────────────────────────────────
//  Retrieval
// ─────────────────────────────────────────────────────────
/**
 * Retrieve raw bytes for a CID from the IPFS HTTP Gateway (port 8080).
 *
 * @param {string} cid
 * @returns {Promise<Buffer|null>}
 */
const getFromIpfs = async (cid) => {
  const url = getGatewayUrl();
  try {
    const res = await fetchWithTimeout(
      `${url}/ipfs/${encodeURIComponent(cid)}`,
      {},
      {
        kind: 'gateway',
        label: `IPFS gateway GET ${cid}`,
      },
    );
    if (!res.ok) {
      logger.error(`IPFS gateway GET failed (${res.status}) for ${cid}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.warn(`IPFS gateway unreachable at ${url}: ${err.message}`);
    return null;
  }
};
// ─────────────────────────────────────────────────────────
//  Diagnostics
// ─────────────────────────────────────────────────────────
/**
 * Whether the IPFS Cluster tracks a pin of a CID: `GET /pins/<cid>` on the Cluster REST API.
 *
 * @param {string} cid
 * @returns {Promise<boolean|null>} `null` when the Cluster does not answer.
 */
const isClusterPinned = async (cid) => {
  try {
    const res = await fetchWithTimeout(
      `${getClusterApiUrl()}/pins/${encodeURIComponent(cid)}`,
      {},
      { kind: 'cluster', label: `IPFS Cluster pin status ${cid}` },
    );
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const { peer_map: peers = {} } = await res.json();
    return Object.values(peers).some(({ status }) => status === 'pinned');
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
 * @returns {Promise<boolean>} `true` when the removal succeeded or the path didn't exist.
 */
const removeMfsPath = async (mfsPath, recursive = true) => {
  const kuboUrl = getIpfsApiUrl();
  try {
    // First check if the path exists via stat; if it doesn't we can return early.
    const statRes = await fetchWithTimeout(
      `${kuboUrl}/api/v0/files/stat?arg=${encodeURIComponent(mfsPath)}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS stat ${mfsPath}` },
    );
    if (!statRes.ok) {
      // Path doesn't exist – nothing to remove.
      logger.info(`IPFS MFS rm – path does not exist, skipping: ${mfsPath}`);
      return true;
    }
    const rmRes = await fetchWithTimeout(
      `${kuboUrl}/api/v0/files/rm?arg=${encodeURIComponent(mfsPath)}&force=true${recursive ? '&recursive=true' : ''}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS rm ${mfsPath}` },
    );
    if (!rmRes.ok) {
      const text = await rmRes.text();
      logger.warn(`IPFS MFS rm failed (${rmRes.status}): ${text}`);
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
 * Lists a CID under an MFS path: creates the parent directory, replaces any entry at the path,
 * and copies the CID there. A copy is a reference, never a second copy of the bytes.
 *
 * @param {string} cid      – IPFS CID to list.
 * @param {string} mfsPath  – Full destination MFS path, e.g. `/object-layer/cid/<cid>/atlas.png`.
 * @returns {Promise<boolean>} `true` when the MFS entry was created successfully.
 */
const copyToMfs = async (cid, mfsPath) => {
  const kuboUrl = getIpfsApiUrl();
  const destDir = mfsPath.substring(0, mfsPath.lastIndexOf('/')) || '/';
  try {
    await fetchWithTimeout(
      `${kuboUrl}/api/v0/files/mkdir?arg=${encodeURIComponent(destDir)}&parents=true`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS mkdir ${destDir}` },
    );
    await fetchWithTimeout(
      `${kuboUrl}/api/v0/files/rm?arg=${encodeURIComponent(mfsPath)}&force=true`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS rm ${mfsPath}` },
    );
    const cpRes = await fetchWithTimeout(
      `${kuboUrl}/api/v0/files/cp?arg=/ipfs/${encodeURIComponent(cid)}&arg=${encodeURIComponent(mfsPath)}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS cp ${mfsPath}` },
    );
    if (!cpRes.ok) {
      const text = await cpRes.text();
      logger.warn(`IPFS MFS cp failed (${cpRes.status}): ${text} – ${mfsPath}`);
      return false;
    }
    logger.info(`IPFS MFS cp OK – ${mfsPath} → ${cid}`);
    return true;
  } catch (err) {
    logger.warn(`IPFS MFS cp unreachable: ${err.message}`);
    return false;
  }
};

/**
 * The CID an MFS path lists: `files/stat`.
 *
 * @param {string} mfsPath
 * @returns {Promise<{cid:string,size:number,type:string}|null>} `null` when the path does not exist
 *   or the node does not answer.
 */
const statMfsPath = async (mfsPath) => {
  try {
    const res = await fetchWithTimeout(
      `${getIpfsApiUrl()}/api/v0/files/stat?arg=${encodeURIComponent(mfsPath)}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS stat ${mfsPath}` },
    );
    if (!res.ok) return null;
    const { Hash, Size, Type } = await res.json();
    return { cid: Hash, size: Number(Size), type: Type };
  } catch {
    return null;
  }
};

/**
 * The names an MFS directory holds: `files/ls`.
 *
 * @param {string} mfsPath
 * @returns {Promise<string[]|null>} `null` when the directory does not exist or the node does not answer.
 */
const listMfsDirectory = async (mfsPath) => {
  try {
    const res = await fetchWithTimeout(
      `${getIpfsApiUrl()}/api/v0/files/ls?arg=${encodeURIComponent(mfsPath)}`,
      { method: 'POST' },
      { kind: 'kubo', label: `IPFS MFS ls ${mfsPath}` },
    );
    if (!res.ok) return null;
    const { Entries } = await res.json();
    return (Entries ?? []).map(({ Name }) => Name);
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
  static addToIpfs = addToIpfs;
  static pinCid = pinCid;
  static unpinCid = unpinCid;
  static getFromIpfs = getFromIpfs;
  static isClusterPinned = isClusterPinned;
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
    const kuboUrl = getIpfsApiUrl();
    try {
      const res = await fetchWithTimeout(
        `${kuboUrl}/api/v0/pin/ls?arg=${encodeURIComponent(cid)}&type=all`,
        { method: 'POST' },
        { kind: 'kubo', label: `IPFS Kubo pin/ls ${cid}` },
      );
      if (!res.ok) return false;
      const json = await res.json();
      return !!(json.Keys && json.Keys[cid]);
    } catch {
      return false;
    }
  };
}
export { IpfsClient };
