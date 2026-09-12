/**
 * @module src/api/cyberia-server-registry/cyberia-server-registry.service.js
 *
 * Service layer for the live game-server list. One stateless operation:
 *
 *   reportServer() — upsert one server and restart its TTL countdown.
 *
 * The TTL index on `lastSeen` deletes a silent server, so there is nothing
 * else to clean up.
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';

/** Field caps for the reported values. A report is an external write. */
const MAX_URL_LENGTH = 512;
const MAX_FIELD_LENGTH = 120;

const getModel = (options = {}) =>
  DataBaseProviderService.getModel('CyberiaServerRegistry', {
    host: options.host || 'default',
    path: options.path || '/',
  });

/**
 * Normalise a reported server URL. Returns '' when the value is not an http
 * or https URL, which the caller rejects.
 *
 * @param {string} rawUrl
 * @returns {string} Origin plus sub-path, without the trailing slash.
 */
const normalizeServerUrl = (rawUrl) => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return '';
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
};

/**
 * Record one server report. Idempotent: the upsert keys on `serverUrl`, so a
 * restart reuses the same document and only `lastSeen` moves.
 *
 * @param {{serverUrl: string, instanceCode?: string, name?: string}} report
 * @param {object} options Router options (host/path routing context).
 * @returns {Promise<{serverUrl: string, instanceCode: string, name: string, lastSeen: Date}>}
 * @throws {Error} When `serverUrl` is not an http(s) URL.
 */
const reportServer = async (report = {}, options = {}) => {
  const serverUrl = normalizeServerUrl(report.serverUrl);
  if (!serverUrl) throw new Error('serverUrl must be an http(s) URL');

  const instanceCode = String(report.instanceCode || '')
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
  const name = String(report.name || '')
    .trim()
    .slice(0, MAX_FIELD_LENGTH);

  const Model = getModel(options);
  return await Model.findOneAndUpdate(
    { serverUrl },
    { $set: { instanceCode, name, lastSeen: new Date() } },
    { upsert: true, new: true },
  )
    .select('serverUrl instanceCode name lastSeen -_id')
    .lean();
};

/**
 * The most recent live report. The TTL index already removed the dead ones,
 * so the newest `lastSeen` is the answer.
 *
 * @param {object} options Router options (host/path routing context).
 * @returns {Promise<?{serverUrl: string, instanceCode: string, name: string, lastSeen: Date}>}
 */
const getLatestServer = async (options = {}) =>
  await getModel(options).findOne().sort({ lastSeen: -1 }).select('serverUrl instanceCode name lastSeen -_id').lean();

export { reportServer, getLatestServer, normalizeServerUrl };
