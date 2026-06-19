/**
 * Underpost platform content catalog — the base `pwa-microservices-template`.
 *
 * @module src/projects/underpost/catalog-underpost.js
 * @namespace UnderpostCatalog
 */

/**
 * Workflow + service files re-added to the template after the engine-only strip.
 * @constant {string[]}
 * @memberof UnderpostCatalog
 */
const TEMPLATE_RESTORE_PATHS = [
  `./.github/workflows/pwa-microservices-template-page.cd.yml`,
  `./.github/workflows/pwa-microservices-template-test.ci.yml`,
  `./.github/workflows/npmpkg.ci.yml`,
  `./.github/workflows/ghpkg.ci.yml`,
  `./.github/workflows/gitlab.ci.yml`,
  `./.github/workflows/publish.ci.yml`,
  `./.github/workflows/release.cd.yml`,
  `./src/client/services/user/guest.service.js`,
  './src/api/user/guest.service.js',
  './src/ws/IoInterface.js',
  './src/ws/IoServer.js',
  './manifests/deployment/dd-default-development',
];

/**
 * npm keywords for the standalone Underpost platform / template package.
 * @constant {string[]}
 * @memberof UnderpostCatalog
 */
const TEMPLATE_KEYWORDS = [
  'underpost',
  'underpost-platform',
  'cli',
  'toolchain',
  'ci-cd',
  'devops',
  'kubernetes',
  'k3s',
  'kubeadm',
  'lxd',
  'baremetal',
  'container-orchestration',
  'image-management',
  'pwa',
  'workbox',
  'microservices',
];

/**
 * npm description for the standalone Underpost platform / template package.
 * @constant {string}
 * @memberof UnderpostCatalog
 */
const TEMPLATE_DESCRIPTION =
  'Underpost Platform — end-to-end CI/CD and application-delivery toolchain CLI. Covers bare metal, Kubernetes, K3s, kubeadm, LXD, container/image orchestration, secrets, databases, cron jobs, monitoring, SSH, runners, PWA + Workbox delivery, and release orchestration. Extensible via downstream CLIs.';

export { TEMPLATE_RESTORE_PATHS, TEMPLATE_KEYWORDS, TEMPLATE_DESCRIPTION };
