import fs from 'fs-extra';

import { loggerFactory } from '../src/server/logger.js';
import { getDirname, newInstance } from '../src/client/components/core/CommonJs.js';
import { shellExec } from '../src/server/process.js';
import walk from 'ignore-walk';
import { validateTemplatePath } from '../src/server/conf.js';
import { TEMPLATE_RESTORE_PATHS, TEMPLATE_KEYWORDS, TEMPLATE_DESCRIPTION } from '../src/server/catalog-underpost.js';
import { loadProductCatalogs } from '../src/server/catalog.js';
import dotenv from 'dotenv';

const logger = loggerFactory(import.meta);

if (fs.existsSync('./engine-private/conf/dd-cron/.env.production'))
  dotenv.config({
    path: `./engine-private/conf/dd-cron/.env.production`,
    override: true,
  });
else dotenv.config();

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

  // Base strips plus each product catalog's `stripPaths`, aggregated dynamically so the
  // template build stays decoupled from (and survives the removal of) product modules.
  const productStripPaths = (await loadProductCatalogs()).flatMap((c) => c.stripPaths);
  for (const deletePath of productStripPaths) {
    const target = `${toPath}/${deletePath}`;
    if (fs.existsSync(target)) fs.removeSync(target);
  }
  shellExec(`rm -rf ${toPath}/.github`);
  shellExec(`rm -rf ${toPath}/manifests/deployment/dd-*`);
  shellExec(`rm -rf ${toPath}/src/server/catalog-*`);

  fs.mkdirSync(`${toPath}/.github/workflows`, { recursive: true });
  for (const restorePath of TEMPLATE_RESTORE_PATHS) {
    const src = restorePath;
    const dest = `${toPath}/${restorePath}`;
    if (fs.statSync(src).isDirectory()) {
      fs.copySync(src, dest, { overwrite: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

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
  templatePackageJson.keywords = TEMPLATE_KEYWORDS;
  delete templatePackageJson.scripts['build:template'];
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
