/**
 * The one source of the GitHub credential: every Git transport to GitHub, every GitHub REST call
 * and every workflow dispatch resolves it here, so one token reaches all of them the same way.
 *
 * Resolution order, first value wins:
 *   1. `explicit`      a token a programmatic caller passes for one operation
 *   2. `GITHUB_TOKEN`  the process environment, as GitHub Actions and the fleet set it
 *   3. `GH_TOKEN`      the process environment, as the GitHub CLI reads it
 *   4. `underpost-env` `GITHUB_TOKEN` of the Underpost env files (`./.env`, then the global store)
 *
 * A credential names its source and never prints its token. A GitHub App installation token is one
 * more source with the same shape.
 * @module src/server/github/github-credential.js
 * @namespace GithubCredential
 */

import { environmentValueFactory } from '../runtime/environment.js';

/** The hosts a GitHub credential is sent to, over HTTPS only. */
const GITHUB_HOSTS = Object.freeze(['github.com']);

const SOURCES = Object.freeze([
  ['GITHUB_TOKEN', () => process.env.GITHUB_TOKEN],
  ['GH_TOKEN', () => process.env.GH_TOKEN],
  ['underpost-env', () => environmentValueFactory('GITHUB_TOKEN')],
]);

/**
 * @typedef {object} GithubCredential
 * @property {string} token - Never logged.
 * @property {string} source - Where the token came from: `explicit`, `GITHUB_TOKEN`, `GH_TOKEN` or `underpost-env`.
 * @memberof GithubCredential
 */

/**
 * Resolves the GitHub credential.
 * @param {object} [options]
 * @param {string} [options.token] - A token for this operation only.
 * @returns {GithubCredential|null} `null` when no source holds a token.
 * @memberof GithubCredential
 */
const githubCredential = ({ token } = {}) => {
  if (`${token ?? ''}`.trim()) return { token: `${token}`.trim(), source: 'explicit' };
  for (const [source, read] of SOURCES) {
    const value = `${read() ?? ''}`.trim();
    if (value) return { token: value, source };
  }
  return null;
};

/**
 * Whether a URL is an HTTPS URL of a GitHub host, the only transport the GitHub credential is sent over.
 * @param {string} url
 * @returns {boolean}
 * @memberof GithubCredential
 */
const isGithubHttpsUrl = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && GITHUB_HOSTS.includes(hostname.toLowerCase());
  } catch {
    return false;
  }
};

export { GITHUB_HOSTS, githubCredential, isGithubHttpsUrl };
