/**
 * Repository identity: who owns the source this build came from, and the
 * canonical URLs derived from it.
 *
 * Every environment publishes from a different fork, so an owner baked into a
 * component renders a link to someone else's repository. The owner is resolved
 * once here, travels to the client in `renderPayload.repository`, and is the
 * only thing any GitHub, Pages or Coveralls URL is composed from.
 *
 * @module src/server/storage/repository.js
 * @namespace ServerRepository
 */

import { environmentValueFactory } from '../runtime/environment.js';

/**
 * @constant REPOSITORY_DEFAULTS
 * @description Fallbacks for a tree published without repository environment.
 * The only place in the codebase allowed to name an owner or a repository.
 * @memberof ServerRepository
 */
const REPOSITORY_DEFAULTS = {
  owner: 'underpostnet',
  name: 'engine',
  template: 'pwa-microservices-template',
  // Prebuilt package repositories are the template repository plus this suffix.
  packageSuffix: '-ghpkg',
};

/**
 * @method repositoryIdentityFactory
 * @description Resolves the repository identity this build publishes under.
 * @param {object} [overrides] - Explicit values that win over the environment.
 * @returns {{owner: string, name: string, template: string, packageSuffix: string}} Identity.
 * @memberof ServerRepository
 */
const repositoryIdentityFactory = (overrides = {}) => ({
  ...REPOSITORY_DEFAULTS,
  ...(environmentValueFactory('GITHUB_USERNAME') ? { owner: environmentValueFactory('GITHUB_USERNAME') } : {}),
  ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value)),
});

/**
 * @method githubUrlFactory
 * @description Composes a github.com URL under the resolved owner.
 * @param {object} [params]
 * @param {object} [params.identity] - Identity to compose against.
 * @param {string[]} [params.segments] - Path segments after the owner.
 * @returns {string} Absolute URL, trailing slash included.
 * @memberof ServerRepository
 */
const githubUrlFactory = ({ identity = repositoryIdentityFactory(), segments = [] } = {}) =>
  `https://github.com/${[identity.owner, ...segments].filter(Boolean).join('/')}/`;

/**
 * @method githubCommitUrlFactory
 * @description Markdown link to one commit, for generated changelogs.
 * @param {object} params
 * @param {string} params.shortHash - Abbreviated hash used as the link text.
 * @param {string} params.hash - Full hash the link resolves to.
 * @param {object} [params.identity] - Identity to compose against.
 * @returns {string} Markdown link.
 * @memberof ServerRepository
 */
const githubCommitUrlFactory = ({ shortHash, hash, identity = repositoryIdentityFactory() }) =>
  `[${shortHash}](https://github.com/${identity.owner}/${identity.name}/commit/${hash})`;

export { REPOSITORY_DEFAULTS, githubCommitUrlFactory, githubUrlFactory, repositoryIdentityFactory };
