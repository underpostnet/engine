/**
 * Package manifest and archive build utilities.
 *
 * @module src/server/build/package.js
 * @namespace PackageBuilder
 */

import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { loggerFactory } from '../ops/logger.js';
import { shellArgumentFactory, shellExec } from '../runtime/process.js';
import { loadDeployCatalog } from './catalog.js';

const logger = loggerFactory(import.meta);
const ENGINE_PACKAGE_PATH = fileURLToPath(new URL('../../../', import.meta.url));
const STAGED_CLI_PACKAGE = 'underpost-cli.tgz';
const DEPLOY_CONF_ROOT = './engine-private/conf';
const DEPLOY_MANIFEST_INDENT = 4;

/**
 * Packs an npm package into a build context under a stable file name.
 *
 * @param {object} params
 * @param {string} params.stagedFileName
 * @param {string} [params.outputPath]
 * @param {string} [params.packagePath]
 * @returns {string} Absolute path to the staged archive.
 * @memberof PackageBuilder
 */
const stagePackageArchive = ({ stagedFileName, outputPath = '.', packagePath = '.' } = {}) => {
  if (!stagedFileName || nodePath.basename(stagedFileName) !== stagedFileName)
    throw new TypeError('stagePackageArchive requires a file name without a directory');

  const sourcePath = nodePath.resolve(packagePath);
  const destinationPath = nodePath.resolve(outputPath);
  if (!fs.existsSync(nodePath.join(sourcePath, 'package.json')))
    throw new Error(`Package manifest not found: ${nodePath.join(sourcePath, 'package.json')}`);

  fs.ensureDirSync(destinationPath);
  const temporaryPath = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-package-'));

  try {
    shellExec(
      `npm pack --ignore-scripts --pack-destination ${shellArgumentFactory(temporaryPath)} ${shellArgumentFactory(sourcePath)}`,
      { silent: true },
    );
    const archives = fs.readdirSync(temporaryPath).filter((entry) => entry.endsWith('.tgz'));
    if (archives.length !== 1)
      throw new Error(
        `Expected exactly one package archive for ${sourcePath}, found ${archives.length}: ${archives.join(', ')}`,
      );

    const stagedPath = nodePath.join(destinationPath, stagedFileName);
    fs.moveSync(nodePath.join(temporaryPath, archives[0]), stagedPath, { overwrite: true });
    logger.info('Staged npm package archive', { source: archives[0], staged: stagedPath });
    return stagedPath;
  } finally {
    fs.removeSync(temporaryPath);
  }
};

/**
 * Stages this engine checkout as the CLI archive consumed by runtime images.
 *
 * @param {string} [outputPath]
 * @returns {string} Absolute path to the staged archive.
 * @memberof PackageBuilder
 */
const stageCliPackage = (outputPath = '.') =>
  stagePackageArchive({
    stagedFileName: STAGED_CLI_PACKAGE,
    outputPath,
    packagePath: ENGINE_PACKAGE_PATH,
  });

const replaceTemplateReferences = (value, templateRepositoryName, repositoryName) => {
  if (!templateRepositoryName || !repositoryName) return value;
  if (typeof value === 'string') return value.replaceAll(templateRepositoryName, repositoryName);
  if (Array.isArray(value))
    return value.map((entry) => replaceTemplateReferences(entry, templateRepositoryName, repositoryName));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        replaceTemplateReferences(entry, templateRepositoryName, repositoryName),
      ]),
    );
  return value;
};

/**
 * Builds the development dependency set for a generated product repository.
 *
 * Product packages replace the engine's broad runtime dependency set with a
 * deliberately small product-specific one. The generated repository still
 * contains the engine source, build scripts, Vitest configuration and tests,
 * though, so those engine dependencies remain necessary when developing or
 * testing the checkout. Keeping them as dev dependencies makes CI complete
 * without adding them to installations of the published product package.
 *
 * @param {object} [params]
 * @param {Record<string, string>} [params.engineDependencies]
 * @param {Record<string, string>} [params.engineDevDependencies]
 * @param {Record<string, string>} [params.productDependencies]
 * @param {Record<string, string>} [params.productDevDependencies]
 * @returns {Record<string, string>}
 * @memberof PackageBuilder
 */
const productDevDependenciesFactory = ({
  engineDependencies = {},
  engineDevDependencies = {},
  productDependencies = {},
  productDevDependencies = {},
} = {}) => {
  const developmentDependencies = {
    ...engineDependencies,
    ...engineDevDependencies,
    ...productDevDependencies,
  };

  for (const dependency of Object.keys(productDependencies)) delete developmentDependencies[dependency];

  return developmentDependencies;
};

/**
 * Returns a generated product manifest without mutating its inputs.
 *
 * @param {object} params
 * @param {object} params.basePackageJson
 * @param {object} [params.sourcePackageJson]
 * @param {object} [params.catalog]
 * @param {string} params.confName
 * @param {Record<string, string>} [params.customDependencies]
 * @param {Record<string, string>} [params.customScripts]
 * @param {Record<string, string>} [params.customBin]
 * @param {string} [params.templateRepositoryName]
 * @param {string} [params.repositoryName]
 * @returns {object}
 * @memberof PackageBuilder
 */
const buildProductPackageJson = ({
  basePackageJson,
  sourcePackageJson = basePackageJson,
  catalog = {},
  confName,
  customDependencies,
  customScripts = {},
  customBin,
  templateRepositoryName = 'pwa-microservices-template',
  repositoryName = `engine-${confName?.replace(/^dd-/, '')}`,
} = {}) => {
  if (!basePackageJson || typeof basePackageJson !== 'object')
    throw new TypeError('buildProductPackageJson requires basePackageJson');
  if (!confName) throw new TypeError('buildProductPackageJson requires confName');

  const base = replaceTemplateReferences(basePackageJson, templateRepositoryName, repositoryName);
  const { devDependencies: baseDevDependencies, ...baseManifest } = base;
  const dependencies = customDependencies === undefined ? { ...base.dependencies } : { ...customDependencies };
  const devDependencies =
    customDependencies === undefined
      ? { ...baseDevDependencies }
      : productDevDependenciesFactory({
          engineDependencies: sourcePackageJson?.dependencies,
          engineDevDependencies: sourcePackageJson?.devDependencies,
          productDependencies: dependencies,
          productDevDependencies: baseDevDependencies,
        });

  return {
    ...baseManifest,
    name: confName.replace(/^dd-/, ''),
    ...(catalog.description ? { description: catalog.description } : {}),
    ...(catalog.keywords?.length ? { keywords: [...catalog.keywords] } : {}),
    dependencies,
    ...(Object.keys(devDependencies).length ? { devDependencies } : {}),
    scripts: { ...base.scripts, ...customScripts },
    ...(customBin === undefined ? {} : { bin: { ...customBin } }),
  };
};

/**
 * Where a deploy id's package manifest lives.
 *
 * A deploy's manifest is part of its configuration, next to `conf.server.json` and its env
 * files, so it is versioned with them rather than derived on the node.
 * @param {string} deployId - Deploy id (e.g. `dd-cyberia`).
 * @param {string} [confRoot] - Root of the private configuration tree.
 * @returns {string} Path to that deploy's `package.json`.
 * @memberof PackageBuilder
 */
const deployPackagePathFactory = (deployId, confRoot = DEPLOY_CONF_ROOT) => `${confRoot}/${deployId}/package.json`;

/**
 * The npm name a deploy id publishes under.
 *
 * A catalog names its own package; every other deploy id is its own identity without the `dd-`
 * prefix. One rule, so a manifest cannot be renamed by whichever command generated it.
 * @param {string} deployId - Deploy id.
 * @param {object} [catalog] - That deploy's product catalog.
 * @returns {string} Package name.
 * @memberof PackageBuilder
 */
const deployPackageNameFactory = (deployId, catalog = {}) =>
  `${catalog.packageName || `${deployId ?? ''}`.replace(/^dd-/, '')}`;

/**
 * The `start` script a deploy runs under.
 *
 * A catalog may declare its own, and an existing manifest's is preserved — a deploy that starts
 * something other than the engine server (a cron applier, say) keeps saying so across a
 * regeneration. Only a manifest that declares nothing gets the engine default.
 * @param {string} deployId - Deploy id.
 * @param {object} [catalog] - That deploy's product catalog.
 * @param {object} [currentPackageJson] - The manifest being regenerated, when one exists.
 * @returns {string} Start script.
 * @memberof PackageBuilder
 */
const deployStartScriptFactory = (deployId, catalog = {}, currentPackageJson = {}) =>
  catalog.packageScripts?.start ||
  currentPackageJson?.scripts?.start ||
  `node --max-old-space-size=8192 src/server ${deployId}`;

/**
 * Builds a deploy id's package manifest from the engine's, without mutating either input.
 *
 * One generator for every deploy manifest in the project. The engine manifest is the base —
 * its dependencies, overrides and toolchain scripts are what the checkout actually runs on —
 * and the deploy owns only its identity, its `start`, and whatever its catalog adds. A deploy
 * id without a catalog is therefore the engine manifest under its own name, which is the whole
 * default: nothing has to be declared for a new deploy to have a correct manifest.
 *
 * `productIdentity` selects the standalone CLI's bin map over the engine's. It is off for a
 * deploy's own manifest on purpose: that manifest is installed over the engine checkout on
 * hosts and in pods, where `npm link` must keep publishing the engine's command.
 * @param {object} params
 * @param {string} params.deployId - Deploy id the manifest belongs to.
 * @param {object} params.enginePackageJson - The engine's own manifest.
 * @param {object} [params.catalog] - That deploy's product catalog.
 * @param {object} [params.currentPackageJson] - The manifest being regenerated, when one exists.
 * @param {boolean} [params.productIdentity] - Use the catalog's bin map instead of the engine's.
 * @returns {object} The generated manifest.
 * @memberof PackageBuilder
 */
const buildDeployPackageJson = ({
  deployId,
  enginePackageJson,
  catalog = {},
  currentPackageJson = {},
  productIdentity = false,
} = {}) => {
  if (!deployId) throw new TypeError('buildDeployPackageJson requires deployId');
  if (!enginePackageJson || typeof enginePackageJson !== 'object')
    throw new TypeError('buildDeployPackageJson requires enginePackageJson');

  const catalogBin = catalog.packageBin && Object.keys(catalog.packageBin).length ? { ...catalog.packageBin } : null;
  const bin = productIdentity && catalogBin ? catalogBin : enginePackageJson.bin;

  return {
    ...enginePackageJson,
    name: deployPackageNameFactory(deployId, catalog),
    ...(catalog.description ? { description: catalog.description } : {}),
    ...(catalog.keywords?.length ? { keywords: [...catalog.keywords] } : {}),
    scripts: {
      ...enginePackageJson.scripts,
      ...catalog.packageScripts,
      start: deployStartScriptFactory(deployId, catalog, currentPackageJson),
    },
    dependencies: { ...enginePackageJson.dependencies, ...catalog.packageDependencies },
    ...(bin === undefined ? {} : { bin: { ...bin } }),
  };
};

/**
 * The product-CLI manifest overrides a catalog declares, for {@link buildProductPackageJson}.
 *
 * A product package replaces the engine's runtime dependency set with its own, so it always
 * carries the published `underpost` alongside whatever the catalog pins. A catalog that
 * declares no package contract returns nothing, leaving the base template's manifest as it is.
 * @param {object} params
 * @param {object} params.catalog - The deploy's product catalog.
 * @param {string} params.underpostVersion - Version of the engine CLI the product depends on.
 * @returns {{customDependencies?: object, customScripts?: object, customBin?: object}} Overrides.
 * @memberof PackageBuilder
 */
const productPackageOptionsFactory = ({ catalog = {}, underpostVersion = '' } = {}) => {
  const dependencies = catalog.packageDependencies ?? {};
  const bin = catalog.packageBin ?? {};
  if (Object.keys(dependencies).length === 0 && Object.keys(bin).length === 0) return {};

  return {
    customDependencies: { underpost: `^${`${underpostVersion}`.replace(/^v/, '')}`, ...dependencies },
    customScripts: { ...catalog.packageScripts },
    ...(Object.keys(bin).length ? { customBin: { ...bin } } : {}),
  };
};

/**
 * Regenerates the package manifest of every deploy id that has one.
 *
 * The engine's manifest is the source: a dependency added there reaches every deploy from here,
 * which is what keeps a node's install from pruning packages the CLI imports. Deploy ids are
 * discovered from the configuration tree rather than listed, so a new deploy is covered by
 * existing.
 * @param {object} [params]
 * @param {string[]} [params.deployIds] - Deploy ids to regenerate; every one that has a manifest otherwise.
 * @param {string} [params.confRoot] - Root of the private configuration tree.
 * @param {object} [params.enginePackageJson] - The engine's own manifest.
 * @param {boolean} [params.dryRun] - Resolve the manifests without writing them.
 * @returns {Promise<Array<{deployId: string, path: string, name: string}>>} What was regenerated.
 * @memberof PackageBuilder
 */
const syncDeployPackages = async ({
  deployIds = [],
  confRoot = DEPLOY_CONF_ROOT,
  enginePackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8')),
  dryRun = false,
} = {}) => {
  if (!fs.existsSync(confRoot)) {
    logger.warn('No private configuration tree to sync deploy manifests into', { confRoot });
    return [];
  }

  const selected = deployIds.length > 0 ? deployIds : fs.readdirSync(confRoot).sort();
  const synced = [];
  for (const deployId of selected) {
    const manifestPath = deployPackagePathFactory(deployId, confRoot);
    if (!fs.existsSync(manifestPath)) {
      // A deploy id named explicitly is a request, not a discovery: say which one has no
      // manifest instead of reporting a silent no-op.
      if (deployIds.length > 0) logger.warn('Deploy has no package manifest to sync', { deployId, manifestPath });
      continue;
    }

    const currentPackageJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const packageJson = buildDeployPackageJson({
      deployId,
      enginePackageJson,
      catalog: await loadDeployCatalog(deployId),
      currentPackageJson,
    });
    if (!dryRun)
      fs.writeFileSync(manifestPath, `${JSON.stringify(packageJson, null, DEPLOY_MANIFEST_INDENT)}\n`, 'utf8');
    synced.push({ deployId, path: manifestPath, name: packageJson.name });
  }

  logger.info('Deploy package manifests synced', { count: synced.length, dryRun, confRoot });
  return synced;
};

/**
 * The `repository` field a package points at.
 *
 * @param {string} slug - Repository `owner/repo` slug.
 * @returns {{type: string, url: string}} Manifest repository entry.
 * @memberof PackageBuilder
 */
const packageRepositoryFactory = (slug) => ({ type: 'git', url: `git+https://github.com/${slug}.git` });

const readManifest = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const writeManifest = (path, manifest) =>
  fs.writeFileSync(path, `${JSON.stringify(manifest, null, DEPLOY_MANIFEST_INDENT)}\n`, 'utf8');

/**
 * Renames a checkout's package, in its manifest and its lockfile.
 *
 * Both carry the name, and npm rejects an install where they disagree, so they are one
 * operation. A checkout with no lockfile is renamed just as well.
 * @param {object} params
 * @param {string} params.name - New package name.
 * @param {string} [params.packagePath] - Manifest to rename.
 * @param {string} [params.lockPath] - Lockfile to rename alongside it.
 * @returns {{name: string, files: string[]}} The name applied and where.
 * @memberof PackageBuilder
 */
const renamePackage = ({ name, packagePath = './package.json', lockPath = './package-lock.json' } = {}) => {
  if (!name) throw new TypeError('renamePackage requires name');

  writeManifest(packagePath, { ...readManifest(packagePath), name });
  const files = [packagePath];

  if (fs.existsSync(lockPath)) {
    const lock = readManifest(lockPath);
    writeManifest(lockPath, {
      ...lock,
      name,
      ...(lock.packages?.[''] ? { packages: { ...lock.packages, '': { ...lock.packages[''], name } } } : {}),
    });
    files.push(lockPath);
  }

  logger.info('Package renamed', { name, files });
  return { name, files };
};

/**
 * Points a checkout's package at a repository.
 *
 * @param {object} params
 * @param {string} params.slug - Repository `owner/repo` slug.
 * @param {string} [params.packagePath] - Manifest to update.
 * @returns {{repository: object}} The repository entry applied.
 * @memberof PackageBuilder
 */
const setPackageRepository = ({ slug, packagePath = './package.json' } = {}) => {
  if (!slug) throw new TypeError('setPackageRepository requires slug');

  const repository = packageRepositoryFactory(slug);
  writeManifest(packagePath, { ...readManifest(packagePath), repository });
  logger.info('Package repository set', { slug, packagePath });
  return { repository };
};

/**
 * The install specifiers a deploy's catalog pins, as `name@version`.
 *
 * The pins are the catalog's, so an install and a generated manifest cannot disagree about a
 * version.
 * @param {object} [catalog] - The deploy's product catalog.
 * @returns {string[]} Specifiers, in declaration order.
 * @memberof PackageBuilder
 */
const deployDependencySpecsFactory = (catalog = {}) =>
  Object.entries(catalog.packageDependencies ?? {}).map(([name, version]) => `${name}@${version}`);

/**
 * Installs a deploy's catalog dependencies into the current checkout, at their pinned versions.
 *
 * @param {string} deployId - Deploy id whose catalog dependencies are installed.
 * @param {object} [catalog] - Pre-loaded catalog; loaded from the deploy id otherwise.
 * @returns {Promise<string[]>} The dependencies installed, as `name@version`.
 * @memberof PackageBuilder
 */
const installDeployDependencies = async (deployId, catalog) => {
  const specs = deployDependencySpecsFactory(catalog ?? (await loadDeployCatalog(deployId)));
  if (specs.length === 0) {
    logger.warn('Deploy declares no catalog dependencies', { deployId });
    return specs;
  }
  shellExec(`npm install ${specs.join(' ')}`);
  return specs;
};

export {
  DEPLOY_CONF_ROOT,
  DEPLOY_MANIFEST_INDENT,
  STAGED_CLI_PACKAGE,
  buildDeployPackageJson,
  buildProductPackageJson,
  deployDependencySpecsFactory,
  deployPackageNameFactory,
  deployPackagePathFactory,
  deployStartScriptFactory,
  installDeployDependencies,
  packageRepositoryFactory,
  productDevDependenciesFactory,
  productPackageOptionsFactory,
  renamePackage,
  setPackageRepository,
  stageCliPackage,
  stagePackageArchive,
  syncDeployPackages,
};
