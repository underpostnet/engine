/**
 * The GitHub REST client: repository metadata, workflow dispatch and repository contents,
 * authenticated by {@link githubCredential} as a bearer header only. It runs Node `fetch`; no GitHub
 * CLI and no SDK.
 *
 * A failed request throws a {@link GithubError} whose `reason` tells an authorization problem from a
 * missing resource, a refused input and an unavailable service. Each operation logs one trace record.
 * @module src/server/github/github-client.js
 * @namespace GithubClient
 */

import fs from 'fs-extra';
import nodePath from 'node:path';
import { loggerFactory, traceOperation } from '../ops/logger.js';
import { githubCredential } from './github-credential.js';
import { githubSlug, remoteUrlFactory } from '../git/git.js';

const logger = loggerFactory(import.meta);

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/**
 * A GitHub request that failed: `reason` is `authentication` (401), `forbidden` (403), `rate-limited`,
 * `not-found` (404), `conflict` (409), `invalid` (422), `unavailable` (5xx) or `error`.
 * @memberof GithubClient
 */
class GithubError extends Error {
  constructor(message, { status = 0, reason = 'error' } = {}) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
    this.reason = reason;
  }
}

const statusReason = (status, response) => {
  if (status === 403 && response.headers.get('x-ratelimit-remaining') === '0') return 'rate-limited';
  return (
    {
      401: 'authentication',
      403: 'forbidden',
      404: 'not-found',
      409: 'conflict',
      422: 'invalid',
    }[status] ?? (status >= 500 ? 'unavailable' : 'error')
  );
};

/**
 * The `owner/repo` of a GitHub repository reference.
 * @param {string} repository - `owner/repo` or a GitHub URL.
 * @returns {string}
 * @throws {GithubError} When the reference names no GitHub repository.
 * @memberof GithubClient
 */
const githubRepository = (repository) => {
  const slug = githubSlug(remoteUrlFactory(repository));
  if (!slug) throw new GithubError(`'${repository}' names no GitHub repository`, { reason: 'invalid' });
  return slug;
};

/**
 * One GitHub REST request.
 * @param {string} method
 * @param {string} route - Path below the API root, e.g. `/repos/o/r`.
 * @param {object} [options]
 * @param {object} [options.body] - JSON body.
 * @param {string} [options.token] - A token for this request only.
 * @param {boolean} [options.raw] - The response is the raw content of a file, as bytes.
 * @returns {Promise<{status: number, data: *}>} `data` is the parsed JSON, the bytes when `raw`, or null for an empty response.
 * @throws {GithubError}
 * @memberof GithubClient
 */
const githubRequest = async (method, route, { body, token, raw = false } = {}) => {
  const credential = githubCredential({ token });
  const response = await fetch(`${API_ROOT}${route}`, {
    method,
    headers: {
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'User-Agent': 'underpost-cli',
      'X-GitHub-Api-Version': API_VERSION,
      ...(credential ? { Authorization: `Bearer ${credential.token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    const text = bytes.toString('utf8');
    let detail = text.trim().slice(0, 300);
    try {
      detail = JSON.parse(text).message || detail;
    } catch {
      // A body that is not JSON is reported as it is.
    }
    throw new GithubError(`${method} ${route}: ${response.status} ${detail}`, {
      status: response.status,
      reason: statusReason(response.status, response),
    });
  }
  if (raw) return { status: response.status, data: bytes };
  return { status: response.status, data: bytes.length ? JSON.parse(bytes.toString('utf8')) : null };
};

const trace = (operation, context, token, run) =>
  traceOperation(
    logger,
    `github ${operation}`,
    { ...context, credential: githubCredential({ token })?.source ?? 'none' },
    run,
  );

/**
 * The metadata of a repository.
 * @param {string} repository - `owner/repo` or a GitHub URL.
 * @param {object} [options]
 * @param {string} [options.token]
 * @returns {Promise<{repository: string, defaultBranch: string, visibility: string, archived: boolean,
 *   permissions: object, url: string}>}
 * @memberof GithubClient
 */
const repositoryMetadata = async (repository, { token } = {}) => {
  const slug = githubRepository(repository);
  const { data } = await githubRequest('GET', `/repos/${slug}`, { token });
  return {
    repository: data.full_name,
    defaultBranch: data.default_branch,
    visibility: data.visibility,
    archived: data.archived,
    permissions: data.permissions ?? {},
    url: data.html_url,
  };
};

/**
 * Dispatches a `workflow_dispatch` workflow. GitHub accepting it means a run was created, never that
 * it ran: the result names the run to follow.
 * @param {object} params
 * @param {string} params.repository - `owner/repo` or a GitHub URL.
 * @param {string} params.workflow - Workflow file name or id.
 * @param {string} [params.ref] - The default branch of the repository otherwise.
 * @param {Object<string, *>} [params.inputs] - Empty values are left out.
 * @param {string} [params.token]
 * @returns {Promise<{repository: string, workflow: string, ref: string, runId: number|null, url: string}>}
 * @memberof GithubClient
 */
const dispatchWorkflow = async ({ repository, workflow, ref = '', inputs = {}, token }) => {
  const slug = githubRepository(repository);
  const file = `${workflow ?? ''}`.trim();
  if (!/^[\w.-]+$/.test(file))
    throw new GithubError(`'${workflow}' is not a workflow file name or id`, { reason: 'invalid' });
  return trace('dispatch', { repository: slug, workflow: file, inputs: Object.keys(inputs) }, token, async (record) => {
    record.ref = ref || (await repositoryMetadata(slug, { token })).defaultBranch;
    const values = Object.fromEntries(
      Object.entries(inputs)
        .filter(([, value]) => value !== undefined && value !== null && `${value}` !== '')
        .map(([key, value]) => [key, `${value}`]),
    );
    const { data } = await githubRequest('POST', `/repos/${slug}/actions/workflows/${file}/dispatches`, {
      token,
      body: { ref: record.ref, inputs: values, return_run_details: true },
    });
    record.runId = data?.workflow_run_id ?? null;
    record.url = data?.html_url ?? `https://github.com/${slug}/actions/workflows/${file}`;
    return { repository: slug, workflow: file, ref: record.ref, runId: record.runId, url: record.url };
  });
};

/**
 * Downloads a directory of a repository, recursively, through the contents API.
 * @param {object} params
 * @param {string} params.repository
 * @param {string} params.directory - Path inside the repository.
 * @param {string} params.target - Local directory; it must not exist unless `overwrite`.
 * @param {string} [params.ref] - The default branch otherwise.
 * @param {boolean} [params.overwrite]
 * @param {string} [params.token]
 * @returns {Promise<{files: string[], target: string}>}
 * @memberof GithubClient
 */
const downloadDirectory = async ({ repository, directory, target, ref = '', overwrite = false, token }) => {
  const slug = githubRepository(repository);
  if (!directory || !target) throw new GithubError('a directory and a target are required', { reason: 'invalid' });
  return trace('download', { repository: slug, directory, path: target, ref }, token, async (record) => {
    if (fs.existsSync(target) && !overwrite)
      throw new GithubError(`${target} exists: pass overwrite to replace it`, { reason: 'conflict' });
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const contents = (entry, raw = false) =>
      githubRequest('GET', `/repos/${slug}/contents/${entry.split('/').map(encodeURIComponent).join('/')}${query}`, {
        token,
        raw,
      });
    const files = [];
    const copy = async (entry, destination) => {
      const { data } = await contents(entry);
      if (!Array.isArray(data)) throw new GithubError(`${entry} is not a directory of ${slug}`, { reason: 'invalid' });
      fs.mkdirpSync(destination);
      for (const item of data) {
        const local = nodePath.join(destination, item.name);
        if (item.type === 'dir') await copy(item.path, local);
        else if (item.type === 'file') {
          fs.writeFileSync(local, (await contents(item.path, true)).data);
          files.push(local);
        } else logger.warn(`Skipping ${item.type} ${item.path}`);
      }
    };
    try {
      await copy(directory, target);
    } catch (error) {
      fs.removeSync(target);
      throw error;
    }
    record.files = files.length;
    return { files, target };
  });
};

export { GithubError, dispatchWorkflow, downloadDirectory, githubRepository, githubRequest, repositoryMetadata };
