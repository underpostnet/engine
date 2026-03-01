/**
 * Lightweight IPFS HTTP client for communicating with a Kubo (go-ipfs) node
 * and an IPFS Cluster daemon running side-by-side in the same StatefulSet.
 *
 * Kubo API  (port 5001) – add / pin / cat content.
 * Cluster API (port 9094) – replicate pins across the cluster.
 *
 * Uses native `FormData` + `Blob` (Node ≥ 18) for reliable multipart encoding.
 *
 * @module src/server/ipfs-client.js
 * @namespace IpfsClient
 */

import stringify from 'fast-json-stable-stringify';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

// ─────────────────────────────────────────────────────────
//  URL helpers
// ─────────────────────────────────────────────────────────

/**
 * Base URL of the Kubo RPC API (port 5001).
 * @returns {string}
 */
const getIpfsApiUrl = () =>
  process.env.IPFS_API_URL || `http://${process.env.NODE_ENV === 'development' ? 'localhost' : 'ipfs-cluster'}:5001`;

/**
 * Base URL of the IPFS Cluster REST API (port 9094).
 * @returns {string}
 */
const getClusterApiUrl = () =>
  process.env.IPFS_CLUSTER_API_URL ||
  `http://${process.env.NODE_ENV === 'development' ? 'localhost' : 'ipfs-cluster'}:9094`;

/**
 * Base URL of the IPFS HTTP Gateway (port 8080).
 * @returns {string}
 */
const getGatewayUrl = () =>
  process.env.IPFS_GATEWAY_URL ||
  `http://${process.env.NODE_ENV === 'development' ? 'localhost' : 'ipfs-cluster'}:8080`;

// ─────────────────────────────────────────────────────────
//  Core: add content
// ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} IpfsAddResult
 * @property {string} cid  – CID (Content Identifier) returned by the node.
 * @property {number} size – Cumulative DAG size reported by the node.
 */

/**
 * Add arbitrary bytes to the Kubo node AND pin them on the IPFS Cluster.
 *
 * 1. `POST /api/v0/add?pin=true` to Kubo (5001) – stores + locally pins.
 * 2. `POST /pins/<CID>` to the Cluster REST API (9094) – replicates the pin
 *    across every peer so `GET /pins` on the cluster shows the content.
 * 3. Copies into MFS so the Web UI "Files" section shows the file.
 *
 * @param {Buffer|string} content   – raw bytes or a UTF-8 string to store.
 * @param {string}        [filename='data'] – logical filename for the upload.
 * @param {string}        [mfsPath]  – optional full MFS path.
 *                                     When omitted defaults to `/pinned/<filename>`.
 * @returns {Promise<IpfsAddResult|null>} `null` when the node is unreachable.
 */
const addToIpfs = async (content, filename = 'data', mfsPath) => {
  const kuboUrl = getIpfsApiUrl();
  const clusterUrl = getClusterApiUrl();

  // Build multipart body using native FormData + Blob (Node ≥ 18).
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  const formData = new FormData();
  formData.append('file', new Blob([buf]), filename);

  // ── Step 1: add to Kubo ──────────────────────────────
  let cid;
  let size;
  try {
    const res = await fetch(`${kuboUrl}/api/v0/add?pin=true&cid-version=1`, {
      method: 'POST',
      body: formData,
    });

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

  // ── Step 2: pin to the Cluster ───────────────────────
  try {
    const clusterRes = await fetch(`${clusterUrl}/pins/${encodeURIComponent(cid)}`, {
      method: 'POST',
    });

    if (!clusterRes.ok) {
      const text = await clusterRes.text();
      logger.warn(`IPFS Cluster pin failed (${clusterRes.status}): ${text}`);
    } else {
      logger.info(`IPFS Cluster pin OK – CID: ${cid}`);
    }
  } catch (err) {
    logger.warn(`IPFS Cluster unreachable at ${clusterUrl}: ${err.message}`);
  }

  // ── Step 3: copy into MFS so the Web UI "Files" section shows it ─
  const destPath = mfsPath || `/pinned/${filename}`;
  const destDir = destPath.substring(0, destPath.lastIndexOf('/')) || '/';
  try {
    // Ensure parent directory exists in MFS
    await fetch(`${kuboUrl}/api/v0/files/mkdir?arg=${encodeURIComponent(destDir)}&parents=true`, { method: 'POST' });

    // Remove existing entry if present (cp fails on duplicates)
    await fetch(`${kuboUrl}/api/v0/files/rm?arg=${encodeURIComponent(destPath)}&force=true`, {
      method: 'POST',
    });

    // Copy the CID into MFS
    const cpRes = await fetch(
      `${kuboUrl}/api/v0/files/cp?arg=/ipfs/${encodeURIComponent(cid)}&arg=${encodeURIComponent(destPath)}`,
      { method: 'POST' },
    );

    if (!cpRes.ok) {
      const text = await cpRes.text();
      logger.warn(`IPFS MFS cp failed (${cpRes.status}): ${text}`);
    } else {
      logger.info(`IPFS MFS cp OK – ${destPath} → ${cid}`);
    }
  } catch (err) {
    logger.warn(`IPFS MFS cp unreachable: ${err.message}`);
  }

  return { cid, size };
};

// ─────────────────────────────────────────────────────────
//  Convenience wrappers
// ─────────────────────────────────────────────────────────

/**
 * Add a JSON-serialisable object to IPFS.
 *
 * @param {any}    obj               – value to serialise.
 * @param {string} [filename='data.json']
 * @param {string} [mfsPath]         – optional full MFS destination path.
 * @returns {Promise<IpfsAddResult|null>}
 */
const addJsonToIpfs = async (obj, filename = 'data.json', mfsPath) => {
  const payload = stringify(obj);
  return addToIpfs(Buffer.from(payload, 'utf-8'), filename, mfsPath);
};

/**
 * Add a binary buffer (e.g. a PNG image) to IPFS.
 *
 * @param {Buffer} buffer   – raw image / file bytes.
 * @param {string} filename – e.g. `"atlas.png"`.
 * @param {string} [mfsPath] – optional full MFS destination path.
 * @returns {Promise<IpfsAddResult|null>}
 */
const addBufferToIpfs = async (buffer, filename, mfsPath) => {
  return addToIpfs(buffer, filename, mfsPath);
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
    const res = await fetch(`${kuboUrl}/api/v0/pin/add?arg=${encodeURIComponent(cid)}&type=${type}`, {
      method: 'POST',
    });
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
    const clusterRes = await fetch(`${clusterUrl}/pins/${encodeURIComponent(cid)}`, {
      method: 'POST',
    });
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
    const clusterRes = await fetch(`${clusterUrl}/pins/${encodeURIComponent(cid)}`, {
      method: 'DELETE',
    });
    if (!clusterRes.ok) {
      const text = await clusterRes.text();
      logger.warn(`IPFS Cluster unpin failed (${clusterRes.status}): ${text}`);
    } else {
      logger.info(`IPFS Cluster unpin OK – CID: ${cid}`);
    }
  } catch (err) {
    logger.warn(`IPFS Cluster unpin unreachable: ${err.message}`);
  }

  // Kubo unpin
  try {
    const res = await fetch(`${kuboUrl}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error(`IPFS Kubo pin/rm failed (${res.status}): ${text}`);
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
    const res = await fetch(`${url}/ipfs/${encodeURIComponent(cid)}`);
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
 * List all pins tracked by the IPFS Cluster (port 9094).
 * Each line in the response is a JSON object with at least a `cid` field.
 *
 * @returns {Promise<Array<{ cid: string, name: string, peer_map: object }>>}
 */
const listClusterPins = async () => {
  const clusterUrl = getClusterApiUrl();
  try {
    const res = await fetch(`${clusterUrl}/pins`);
    if (res.status === 204) {
      // 204 No Content → the cluster has no pins at all.
      return [];
    }
    if (!res.ok) {
      const text = await res.text();
      logger.error(`IPFS Cluster list pins failed (${res.status}): ${text}`);
      return [];
    }
    const text = await res.text();
    // The cluster streams one JSON object per line (NDJSON).
    return text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    logger.warn(`IPFS Cluster unreachable at ${clusterUrl}: ${err.message}`);
    return [];
  }
};

/**
 * List pins tracked by the local Kubo node (port 5001).
 *
 * @param {string} [type='recursive'] – `'all'` | `'recursive'` | `'direct'` | `'indirect'`
 * @returns {Promise<Object<string, { Type: string }>>} Map of CID → pin info.
 */
const listKuboPins = async (type = 'recursive') => {
  const kuboUrl = getIpfsApiUrl();
  try {
    const res = await fetch(`${kuboUrl}/api/v0/pin/ls?type=${type}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error(`IPFS Kubo pin/ls failed (${res.status}): ${text}`);
      return {};
    }
    const json = await res.json();
    return json.Keys || {};
  } catch (err) {
    logger.warn(`IPFS Kubo pin/ls unreachable: ${err.message}`);
    return {};
  }
};

// ─────────────────────────────────────────────────────────
//  MFS management
// ─────────────────────────────────────────────────────────

/**
 * Remove a file or directory from the Kubo MFS (Mutable File System).
 * This cleans up entries visible in the IPFS Web UI "Files" section.
 *
 * @param {string} mfsPath – Full MFS path to remove, e.g. `/pinned/myfile.json`
 *                           or `/object-layer/itemId`.
 * @param {boolean} [recursive=true] – When `true`, removes directories recursively.
 * @returns {Promise<boolean>} `true` when the removal succeeded or the path didn't exist.
 */
const removeMfsPath = async (mfsPath, recursive = true) => {
  const kuboUrl = getIpfsApiUrl();
  try {
    // First check if the path exists via stat; if it doesn't we can return early.
    const statRes = await fetch(`${kuboUrl}/api/v0/files/stat?arg=${encodeURIComponent(mfsPath)}`, { method: 'POST' });
    if (!statRes.ok) {
      // Path doesn't exist – nothing to remove.
      logger.info(`IPFS MFS rm – path does not exist, skipping: ${mfsPath}`);
      return true;
    }

    const rmRes = await fetch(
      `${kuboUrl}/api/v0/files/rm?arg=${encodeURIComponent(mfsPath)}&force=true${recursive ? '&recursive=true' : ''}`,
      { method: 'POST' },
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

// ─────────────────────────────────────────────────────────
//  Export
// ─────────────────────────────────────────────────────────

const IpfsClient = {
  getIpfsApiUrl,
  getClusterApiUrl,
  getGatewayUrl,
  addToIpfs,
  addJsonToIpfs,
  addBufferToIpfs,
  pinCid,
  unpinCid,
  getFromIpfs,
  listClusterPins,
  listKuboPins,
  removeMfsPath,
};

export { IpfsClient };
