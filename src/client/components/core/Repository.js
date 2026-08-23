/**
 * Repository identity on the client.
 *
 * The owner is resolved at build time by `src/server/repository.js` and travels
 * in `renderPayload.repository`. Composing every GitHub, Pages and Coveralls URL
 * from it is what keeps a fork's links pointing at the fork instead of upstream.
 *
 * @module src/client/components/core/Repository.js
 * @namespace PwaRepository
 */

/**
 * Identity injected by the build.
 * @returns {{owner: string, name: string, template: string, packageSuffix: string}}
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
 * Coveralls report for the engine repository this build came from.
 * @returns {string}
 * @memberof PwaRepository
 */
const coverallsUrl = () => {
  const { owner, name } = repositoryIdentity();
  return `https://coveralls.io/github/${owner}/${name}`;
};

export { coverallsUrl, githubPagesUrl, githubUrl, packageRepository, repositoryIdentity };
