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
 * {@link module:src/server/catalog-cyberia}.
 *
 * @module src/server/catalog.js
 * @namespace Catalog
 */

import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

/** Empty product catalog returned for deploy ids without a dedicated module. */
const EMPTY_CATALOG = {
  sourceMoves: [],
  privateConfPaths: [],
  templatePaths: [],
  stripPaths: [],
  keywords: [],
  description: '',
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
    const mod = await import(`../projects/${suffix}/catalog-${suffix}.js`);
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
 * @returns {Promise<object[]>} Loaded product catalogs (uniform shape).
 * @memberof Catalog
 */
const loadProductCatalogs = async () => {
  const catalogs = [];
  for (const file of await fs.readdir('./src/projects')) {
    if (file === 'underpost') continue;
    const mod = await import(`../projects/${file}/catalog-${file}.js`);
    if (mod.default) catalogs.push({ ...EMPTY_CATALOG, ...mod.default });
  }
  return catalogs;
};

export { loadDeployCatalog, loadProductCatalogs, EMPTY_CATALOG };
