/**
 * Dynamic product-catalog resolver.
 *
 * Product catalogs (`catalog-<suffix>.js`, e.g. `catalog-cyberia`, `catalog-prototype`)
 * are loaded lazily by deploy id via ES dynamic `import()` so the base build
 * (`bin/build`) and template assembly (`bin/build.template`) never statically
 * depend on any product module. Removing a product catalog simply makes its
 * deploy id resolve to the empty catalog — nothing else breaks.
 *
 * Each product catalog default-exports the uniform shape documented in
 * {@link module:src/projects/cyberia/catalog-cyberia.js}.
 *
 * @module src/server/build/catalog.js
 * @namespace Catalog
 */

import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

/**
 * Empty product catalog returned for deploy ids without a dedicated module.
 *
 * The `package*` fields are the deploy's package manifest contract, read by
 * {@link module:src/server/build/package.js}: a deploy id with no catalog gets the engine
 * manifest under its own identity, and one with a catalog adds exactly what it declares here.
 */
const EMPTY_CATALOG = {
  sourceMoves: [],
  privateConfPaths: [],
  templatePaths: [],
  stripPaths: [],
  moves: [],
  copies: [],
  keywords: [],
  description: '',
  packageName: '',
  packageBin: {},
  packageDependencies: {},
  packageScripts: {},
};

/**
 * Loads a single deploy id's product catalog. The suffix after `dd-` selects the
 * module (`dd-cyberia` → `catalog-cyberia.js`). Returns {@link EMPTY_CATALOG} when
 * the deploy id has no dedicated catalog or the module cannot be loaded.
 *
 * @method loadDeployCatalog
 * @param {string} deployId - A concrete deploy id (e.g. `dd-cyberia`).
 * @returns {Promise<object>} The product catalog (uniform shape).
 * @memberof Catalog
 */
const loadDeployCatalog = async (deployId) => {
  const suffix = (deployId ?? '').split('dd-')[1];
  if (!suffix) return EMPTY_CATALOG;
  if (fs.existsSync(`./src/projects/${suffix}/catalog-${suffix}.js`)) {
    const mod = await import(`../../projects/${suffix}/catalog-${suffix}.js`);
    return { ...EMPTY_CATALOG, ...(mod.default ?? {}) };
  }
  return EMPTY_CATALOG;
};

/**
 * Loads every product catalog present alongside this module (`catalog-*.js`,
 * excluding the base `catalog-underpost` and this resolver). Used to aggregate
 * product `stripPaths` for the base template without naming any product.
 *
 * @method loadProductCatalogs
 * @returns {Promise<object[]>} Loaded product catalogs (uniform shape), each with the `deployId` it loads for.
 * @memberof Catalog
 */
const loadProductCatalogs = async () => {
  const catalogs = [];
  if (!fs.existsSync('./src/projects')) return catalogs;
  for (const file of await fs.readdir('./src/projects')) {
    if (file === 'underpost') continue;
    // A URL, so the import resolves from this module when a bundler inlines it (the Vitest config).
    const mod = await import(new URL(`../../projects/${file}/catalog-${file}.js`, import.meta.url).href);
    if (mod.default) catalogs.push({ ...EMPTY_CATALOG, ...mod.default, deployId: `dd-${file}` });
  }
  return catalogs;
};

/**
 * Whether this checkout is each product's context. A product's context is active where its
 * catalog is present and the manifest declares every package the catalog pins: the product
 * repository, and the build that installed the catalog. The engine checkout is not.
 *
 * @method loadProductContexts
 * @param {object} [packageJson] - The checkout's manifest; `./package.json` otherwise.
 * @returns {Promise<Array<{deployId: string, stripPaths: string[], missing: string[], active: boolean}>>}
 * @memberof Catalog
 */
const loadProductContexts = async (packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'))) =>
  (await loadProductCatalogs()).map(({ deployId, stripPaths, packageDependencies }) => {
    const declared = { ...packageJson.devDependencies, ...packageJson.dependencies };
    const missing = Object.keys(packageDependencies).filter((name) => !declared[name]);
    return { deployId, stripPaths, missing, active: missing.length === 0 };
  });

export { loadDeployCatalog, loadProductCatalogs, loadProductContexts, EMPTY_CATALOG };
