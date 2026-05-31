import fs from 'fs-extra';

import { loggerFactory } from '../src/server/logger.js';
import { getDirname, newInstance, uniqueArray } from '../src/client/components/core/CommonJs.js';
import { shellExec } from '../src/server/process.js';
import walk from 'ignore-walk';
import { validateTemplatePath } from '../src/server/conf.js';
import dotenv from 'dotenv';

const logger = loggerFactory(import.meta);

if (fs.existsSync('./engine-private/conf/dd-cron/.env.production'))
  dotenv.config({
    path: `./engine-private/conf/dd-cron/.env.production`,
    override: true,
  });
else dotenv.config();

// Engine-only paths stripped from the template after the source sync.
const TEMPLATE_DELETE_PATHS = [
  './.github',
  './manifests/deployment/dd-lampp-development',
  './manifests/deployment/dd-cyberia-development',
  './manifests/deployment/dd-core-development',
  './manifests/deployment/dd-template-development',
  './src/server/object-layer.js',
  './src/server/atlas-sprite-sheet-generator.js',
  './src/server/shape-generator.js',
  './src/server/semantic-layer-generator.js',
  './src/server/semantic-layer-generator-floor.js',
  './src/server/semantic-layer-generator-skin.js',
  './src/server/semantic-layer-generator-resource.js',
  './src/server/besu-genesis-generator.js',
  './src/grpc/cyberia',
  './src/runtime/cyberia-server',
  './src/runtime/cyberia-client',
  './test/shape-generator.test.js',
  './src/client/public/cyberia-docs',
  'bin/cyberia.js',
  './hardhat',
];

// Workflow + service files re-added to the template after the engine-only strip above.
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
];

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
  'bare-metal',
  'container-orchestration',
  'image-management',
  'pwa',
  'workbox',
  'microservices',
];

const TEMPLATE_DESCRIPTION =
  'Underpost Platform — end-to-end CI/CD and application-delivery toolchain CLI. Covers bare metal, Kubernetes, K3s, kubeadm, LXD, container/image orchestration, secrets, databases, cron jobs, monitoring, SSH, runners, PWA + Workbox delivery, and release orchestration. Extensible via downstream CLIs.';

/**
 * Builds the pwa-microservices-template from scratch out of the current engine source tree.
 *
 * Clones (or resets) the template repo next to the engine, syncs every engine-tracked file the
 * template is allowed to carry (validateTemplatePath), strips engine-only modules, restores the
 * template's own CI workflows + guest services, and rewrites package.json / package-lock.json /
 * README so the template is a standalone, installable project.
 *
 * Usage: node bin/build.template [srcPath=./] [toPath=../pwa-microservices-template]
 */
const srcPath = (process.argv[2] ?? './').replaceAll(`'`, '');
const toPath = (process.argv[3] ?? '../pwa-microservices-template').replaceAll(`'`, '');
const githubUsername = process.env.GITHUB_USERNAME;

logger.info('Build template', { srcPath, toPath });

try {
  const sourceFiles = (
    await new Promise((resolve) =>
      walk(
        {
          path: srcPath,
          ignoreFiles: [`.gitignore`],
          includeEmpty: false,
          follow: false,
        },
        (...args) => resolve(args[1]),
      ),
    )
  ).filter((p) => !p.startsWith('.git'));

  // Clone the template from 0 if missing; otherwise reset it to a clean pristine checkout.
  if (!fs.existsSync(toPath)) {
    shellExec(`cd .. && node engine/bin clone ${githubUsername}/pwa-microservices-template`);
  } else {
    shellExec(`cd ${toPath} && git reset && git checkout . && git clean -f -d`);
    shellExec(`node bin pull ${toPath} ${githubUsername}/pwa-microservices-template`);
    shellExec(`sudo rm -rf ${toPath}/engine-private`);
    shellExec(`sudo rm -rf ${toPath}/logs`);
  }
  shellExec(`cd ${toPath} && git config core.filemode false`);

  for (const copyPath of sourceFiles) {
    if (copyPath === 'NaN') continue;
    const absolutePath = `${srcPath}/${copyPath}`;
    if (!validateTemplatePath(absolutePath)) continue;

    const folder = getDirname(`${toPath}/${copyPath}`);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    logger.info('build', `${toPath}/${copyPath}`);
    fs.copyFileSync(absolutePath, `${toPath}/${copyPath}`);
  }

  fs.copySync(`./.vscode`, `${toPath}/.vscode`);
  fs.copySync(`./src/client/public/default`, `${toPath}/src/client/public/default`);

  // Preserve the template's own README + package.json identity before merging engine metadata.
  for (const checkoutPath of ['README.md', 'package.json']) shellExec(`cd ${toPath} && git checkout ${checkoutPath}`);

  for (const deletePath of TEMPLATE_DELETE_PATHS) {
    const target = `${toPath}/${deletePath}`;
    if (fs.existsSync(target)) fs.removeSync(target);
  }

  fs.mkdirSync(`${toPath}/.github/workflows`, { recursive: true });
  for (const restorePath of TEMPLATE_RESTORE_PATHS) fs.copyFileSync(restorePath, `${toPath}/${restorePath}`);

  // ── package.json: take engine deps/scripts/version, keep template identity. ──
  const originPackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  const templatePackageJson = JSON.parse(fs.readFileSync(`${toPath}/package.json`, 'utf8'));
  const templateName = templatePackageJson.name;

  templatePackageJson.dependencies = originPackageJson.dependencies;
  templatePackageJson.devDependencies = originPackageJson.devDependencies;
  templatePackageJson.version = originPackageJson.version;
  templatePackageJson.scripts = originPackageJson.scripts;
  templatePackageJson.overrides = originPackageJson.overrides;
  templatePackageJson.name = templateName;
  templatePackageJson.description = TEMPLATE_DESCRIPTION;
  templatePackageJson.keywords = uniqueArray(TEMPLATE_KEYWORDS.concat(templatePackageJson.keywords || []));
  delete templatePackageJson.scripts['update:template'];
  fs.writeFileSync(`${toPath}/package.json`, JSON.stringify(templatePackageJson, null, 4), 'utf8');

  // ── package-lock.json: mirror engine packages, keep template name/version on the root entry. ──
  const originPackageLockJson = JSON.parse(fs.readFileSync('./package-lock.json', 'utf8'));
  const templatePackageLockJson = JSON.parse(fs.readFileSync(`${toPath}/package-lock.json`, 'utf8'));
  const originBasePackageLock = newInstance(templatePackageLockJson.packages['']);
  templatePackageLockJson.name = templateName;
  templatePackageLockJson.version = originPackageLockJson.version;
  templatePackageLockJson.packages = originPackageLockJson.packages;
  templatePackageLockJson.packages[''].name = templateName;
  templatePackageLockJson.packages[''].version = originPackageLockJson.version;
  templatePackageLockJson.packages[''].hasInstallScript = originBasePackageLock.hasInstallScript;
  templatePackageLockJson.packages[''].license = originBasePackageLock.license;
  fs.writeFileSync(`${toPath}/package-lock.json`, JSON.stringify(templatePackageLockJson, null, 4), 'utf8');

  fs.writeFileSync(
    `${toPath}/README.md`,
    fs
      .readFileSync('./README.md', 'utf8')
      .replace('<!-- template-title -->', '#### Base template for pwa/api-rest projects.'),
    'utf8',
  );
} catch (error) {
  logger.error(error, error.stack);
  process.exit(1);
}
