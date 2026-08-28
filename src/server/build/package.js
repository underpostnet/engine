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

const logger = loggerFactory(import.meta);
const ENGINE_PACKAGE_PATH = fileURLToPath(new URL('../../../', import.meta.url));
const STAGED_CLI_PACKAGE = 'underpost-cli.tgz';

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

export {
  STAGED_CLI_PACKAGE,
  buildProductPackageJson,
  productDevDependenciesFactory,
  stageCliPackage,
  stagePackageArchive,
};
