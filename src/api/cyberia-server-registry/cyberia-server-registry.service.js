/**
 * @module src/api/cyberia-server-registry/cyberia-server-registry.service.js
 *
 * The live game server processes and the logical endpoints they serve.
 *
 *   reportServer()  — record one report of one process; a report older than the stored one is stale.
 *   liveEndpoints() — one row per world and public URL, from the live processes behind it.
 *   liveServers()   — one row per live process, for operators.
 *
 * The TTL index on `lastSeen` deletes a silent process. A read also skips a process past its TTL,
 * because the TTL monitor runs only once a minute.
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { CONTENT_CODE_PATTERN } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { SERVER_STATES, SERVER_TTL_SECONDS } from './cyberia-server-registry.model.js';
import { RELEASE_ID_PATTERN } from '../../server/release/source-release.js';

const MAX_URL_LENGTH = 512;
const SERVER_LIST_LIMIT = 1000;
const MAX_NAME_LENGTH = 120;
const SERVER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const BASE_PATH_PATTERN = /^\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BUILD_PATTERN = /^[0-9a-f]{0,64}$/;
const LOOPBACK_HOSTS = Object.freeze(['localhost', '127.0.0.1', '[::1]']);
const INTERNAL_SUFFIXES = Object.freeze(['.local', '.localhost', '.internal', '.svc', '.cluster.local']);

const httpError = (status, message) => Object.assign(new Error(message), { status });

const getModel = (options = {}) => DataBaseProviderService.getModel('CyberiaServerRegistry', options);

/** An IP literal, a single-label name or a cluster-only name: no player can dial it. */
const isInternalHost = (hostname) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
  hostname.startsWith('[') ||
  !hostname.includes('.') ||
  INTERNAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

/**
 * The public endpoint of a game server: an https origin and an optional one-segment base path, no
 * credentials, query or fragment. A loopback http origin passes outside production only.
 * @param {string} raw
 * @param {{production?: boolean}} [options]
 * @returns {string} The origin and the base path, without a trailing slash; '' when the value is unsafe.
 */
const normalizePublicUrl = (raw, { production = process.env.NODE_ENV === 'production' } = {}) => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return '';
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (url.username || url.password || url.search || url.hash) return '';
  const path = url.pathname.replace(/\/+$/, '');
  if (path && !BASE_PATH_PATTERN.test(path)) return '';
  const loopback = LOOPBACK_HOSTS.includes(url.hostname);
  if (loopback && production) return '';
  if (!loopback && (url.protocol !== 'https:' || isInternalHost(url.hostname))) return '';
  return `${url.origin}${path}`;
};

/** The cut-off of a live process. */
const liveSince = () => new Date(Date.now() - SERVER_TTL_SECONDS * 1000);

/**
 * Records one report of one game server process. The write applies only above the stored `seq`,
 * so a report that arrives late changes nothing and comes back as `stale`.
 * @param {{serverId: string, url: string, instanceCode: string, name?: string, state: string, seq: number, build?: string, releaseId?: string}} report
 * @param {object} options Router options (host/path context).
 * @returns {Promise<{stale: boolean, server: Object}>}
 * @throws {Error} 400 on an invalid report.
 */
const reportServer = async (report = {}, options = {}) => {
  const serverId = String(report.serverId ?? '');
  if (!SERVER_ID_PATTERN.test(serverId)) throw httpError(400, 'serverId is invalid');
  const url = normalizePublicUrl(report.url);
  if (!url) throw httpError(400, 'url must be a public https endpoint');
  const instanceCode = String(report.instanceCode ?? '');
  if (!CONTENT_CODE_PATTERN.test(instanceCode)) throw httpError(400, 'instanceCode is invalid');
  if (!SERVER_STATES.includes(report.state)) throw httpError(400, `state must be ${SERVER_STATES.join(' or ')}`);
  if (!Number.isSafeInteger(report.seq) || report.seq < 1) throw httpError(400, 'seq must be a positive integer');
  const build = String(report.build ?? '');
  if (!BUILD_PATTERN.test(build)) throw httpError(400, 'build must be a hex digest');
  const releaseId = String(report.releaseId ?? '');
  if (releaseId && !RELEASE_ID_PATTERN.test(releaseId)) throw httpError(400, 'releaseId is invalid');
  const name = String(report.name ?? '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);

  const now = new Date();
  const fields = 'serverId url instanceCode name state seq build releaseId startedAt lastSeen -_id';
  try {
    const server = await getModel(options)
      .findOneAndUpdate(
        { serverId, seq: { $lt: report.seq } },
        {
          $set: { url, instanceCode, name, state: report.state, seq: report.seq, build, releaseId, lastSeen: now },
          $setOnInsert: { startedAt: now },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .select(fields)
      .lean();
    return { stale: false, server };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return { stale: true, server: await getModel(options).findOne({ serverId }).select(fields).lean() };
  }
};

/**
 * The logical endpoints of the live processes: one row per world and public URL, `available` while
 * one process behind it is ready, else `draining`. A world with no live process has no row. `build`
 * names the binary when every live process of the endpoint runs one, else ''. `releases` lists the
 * content releases the processes serve: one entry once they converge.
 * @param {object} options Router options (host/path context).
 * @param {{instanceCodes?: string[]}} [filter]
 * @returns {Promise<{instanceCode: string, url: string, name: string, status: 'available'|'draining', ready: number, draining: number, build: string, releases: string[]}[]>}
 */
const liveEndpoints = async (options = {}, { instanceCodes } = {}) =>
  await getModel(options).aggregate([
    { $match: { lastSeen: { $gt: liveSince() }, ...(instanceCodes ? { instanceCode: { $in: instanceCodes } } : {}) } },
    { $sort: { lastSeen: -1 } },
    {
      $group: {
        _id: { instanceCode: '$instanceCode', url: '$url' },
        name: { $first: '$name' },
        ready: { $sum: { $cond: [{ $eq: ['$state', 'ready'] }, 1, 0] } },
        draining: { $sum: { $cond: [{ $eq: ['$state', 'draining'] }, 1, 0] } },
        builds: { $addToSet: { $ifNull: ['$build', ''] } },
        releases: { $addToSet: { $ifNull: ['$releaseId', ''] } },
      },
    },
    {
      $project: {
        _id: 0,
        instanceCode: '$_id.instanceCode',
        url: '$_id.url',
        name: 1,
        status: { $cond: [{ $gt: ['$ready', 0] }, 'available', 'draining'] },
        ready: 1,
        draining: 1,
        build: { $cond: [{ $eq: [{ $size: '$builds' }, 1] }, { $first: '$builds' }, ''] },
        releases: { $sortArray: { input: '$releases', sortBy: 1 } },
      },
    },
    { $sort: { instanceCode: 1, url: 1 } },
    { $limit: SERVER_LIST_LIMIT },
  ]);

/**
 * Whether a world has a logical endpoint that takes new sessions.
 * @param {string} instanceCode
 * @param {object} options Router options (host/path context).
 * @returns {Promise<boolean>}
 */
const worldAvailable = async (instanceCode, options = {}) =>
  !!(await getModel(options).exists({ instanceCode, state: 'ready', lastSeen: { $gt: liveSince() } }));

/**
 * Every live process, newest report first. Operators only: it names the processes.
 * @param {object} options Router options (host/path context).
 * @returns {Promise<Object[]>}
 */
const liveServers = async (options = {}) =>
  await getModel(options)
    .find({ lastSeen: { $gt: liveSince() } })
    .sort({ instanceCode: 1, lastSeen: -1 })
    .limit(SERVER_LIST_LIMIT)
    .select('serverId url instanceCode name state seq startedAt lastSeen -_id')
    .lean();

export { liveEndpoints, liveServers, normalizePublicUrl, reportServer, worldAvailable, SERVER_LIST_LIMIT };
