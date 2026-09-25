/**
 * Repository identity on the client.
 *
 * The owner is resolved at build time by `src/server/storage/repository.js` and travels
 * in `renderPayload.repository`. Composing every GitHub, Pages and Coveralls URL
 * from it is what keeps a fork's links pointing at the fork instead of upstream.
 *
 * @module src/client/components/core/Repository.js
 * @namespace PwaRepository
 */

/**
 * Identity injected by the build.
 * @returns {{owner: string, organization: string, name: string, template: string, packageSuffix: string, deployPackage?: string}}
 * @memberof PwaRepository
 */
const repositoryIdentity = () => window.renderPayload.repository;

/**
 * Repository holding the prebuilt package and its published demo.
 * @returns {string}
 * @memberof PwaRepository
 */
const packageRepository = () => {
  const { template, packageSuffix } = repositoryIdentity();
  return `${template}${packageSuffix}`;
};

/**
 * Composes a github.com URL under the resolved owner.
 * @param {...string} segments - Path segments after the owner.
 * @returns {string}
 * @memberof PwaRepository
 */
const githubUrl = (...segments) =>
  `https://github.com/${[repositoryIdentity().owner, ...segments].filter(Boolean).join('/')}/`;

/**
 * Composes a GitHub Pages URL under the resolved owner.
 * @param {string} repository - Repository publishing the page.
 * @returns {string}
 * @memberof PwaRepository
 */
const githubPagesUrl = (repository) => `https://${repositoryIdentity().owner}.github.io/${repository}/`;

/**
 * Composes a github.com URL under the organization the package repositories mirror into.
 * @param {...string} segments - Path segments after the organization.
 * @returns {string}
 * @memberof PwaRepository
 */
const organizationUrl = (...segments) =>
  `https://github.com/${[repositoryIdentity().organization, ...segments].filter(Boolean).join('/')}/`;

/**
 * The release tag this build carries, as the repositories tag it: `v<version>`.
 * @returns {string}
 * @memberof PwaRepository
 */
const releaseTag = () => `${window.renderPayload.version}`.replace(/^v?/, 'v');

/**
 * The release page of this build's version on a repository: `<owner>/<repository>/releases/tag/v<version>`.
 * @param {string} [repository] - Repository cutting the release; the engine repository this build came from.
 * @returns {string}
 * @memberof PwaRepository
 */
const releaseUrl = (repository = repositoryIdentity().name) =>
  `${githubUrl(repository, 'releases', 'tag')}${releaseTag()}`;

/**
 * The release page of this build's version on the deploy's package repository, under the organization:
 * `<organization>/engine-ghpkg-<conf-id>/releases/tag/v<version>`.
 * @returns {string}
 * @memberof PwaRepository
 */
const deployPackageReleaseUrl = () =>
  `${organizationUrl(repositoryIdentity().deployPackage, 'releases', 'tag')}${releaseTag()}`;

/**
 * Coveralls report for the engine repository this build came from.
 * @returns {string}
 * @memberof PwaRepository
 */
const coverallsUrl = () => {
  const { owner, name } = repositoryIdentity();
  return `https://coveralls.io/github/${owner}/${name}`;
};

export {
  coverallsUrl,
  deployPackageReleaseUrl,
  githubPagesUrl,
  githubUrl,
  organizationUrl,
  packageRepository,
  releaseTag,
  releaseUrl,
  repositoryIdentity,
};
