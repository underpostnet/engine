'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { EMPTY_CATALOG, loadProductCatalogs, loadProductContexts } from '../../../src/server/build/catalog.js';
import { TEST_PROJECTS, productContextOf } from '../../../src/server/build/testing.js';
import { unslicedTree } from '../../support/tree.js';

// A broken catalog path fails during template assembly, long after the commit
// that broke it, so the tree is asserted here instead.
//
// A base template has had every product stripped out, including the catalogs
// that describe the strip — there is nothing left to assert against, and the
// paths these check are the ones it legitimately no longer carries.
const catalogs = await loadProductCatalogs();
const describeProducts = describe.skipIf(catalogs.length === 0);

// A product template keeps its own catalog but has every other product sliced away, so only
// the unsliced engine tree carries every catalog and every tier directory.

describeProducts('product catalogs', () => {
  it('every catalog carries the uniform shape', () => {
    for (const catalog of catalogs)
      for (const key of Object.keys(EMPTY_CATALOG)) expect(catalog, key).to.have.property(key);
  });

  it('every engine path packaged into a product CLI exists', () => {
    for (const { templatePaths } of catalogs)
      for (const path of templatePaths) expect(fs.existsSync(`.${path}`), path).to.equal(true);
  });

  it('every path stripped from the base template exists', () => {
    for (const { stripPaths } of catalogs)
      for (const path of stripPaths) expect(fs.existsSync(path), path).to.equal(true);
  });

  it('every moved or copied source exists', () => {
    // `sourceMoves` alone are exempt: they read from private sibling repos that
    // are an external input and are not expected to be checked out here.
    for (const { moves, copies } of catalogs)
      for (const [source] of [...moves, ...copies]) expect(fs.existsSync(source), source).to.equal(true);
  });

  it('resolves paths against the roots the build actually uses', () => {
    // `templatePaths` are copied as `.${path}`, `stripPaths` as `${toPath}/${path}`.
    for (const { templatePaths, stripPaths } of catalogs) {
      for (const path of templatePaths) expect(path, path).to.match(/^\//);
      for (const path of stripPaths) expect(path, path).to.match(/^\.\//);
    }
  });
});

describeProducts('product catalogs and the test projects', () => {
  // A project a product strips from the base template but does not ship is a
  // project nothing runs: the template keeps no tests for the code it removed,
  // and the product CLI arrives without the suite that covers what it added. A
  // product strips its whole domain directory, so a project inside it is stripped
  // with it.
  const strippedProjects = TEST_PROJECTS.filter((project) => productContextOf(project, catalogs));

  it.skipIf(!unslicedTree)('has products that own at least one project', () => {
    expect(strippedProjects).to.not.be.empty;
  });

  it.skipIf(!unslicedTree)('gives every project a directory that exists in an unsliced tree', () => {
    for (const { name, directory } of TEST_PROJECTS) expect(fs.existsSync(directory), name).to.equal(true);
  });

  it('carries the directory of every project a present product owns', () => {
    // Holds in a product template too: what it kept of itself must be whole.
    for (const { name, directory } of strippedProjects) expect(fs.existsSync(directory), name).to.equal(true);
  });

  it('ships every project it strips from the base template', () => {
    for (const { name, directory } of strippedProjects) {
      const owner = productContextOf({ directory }, catalogs);
      expect(
        owner.templatePaths.some((path) => `/${directory}`.startsWith(path)),
        `${name} is packaged by its product`,
      ).to.equal(true);
    }
  });
});

describeProducts('product contexts', () => {
  const pinned = catalogs.filter(({ packageDependencies }) => Object.keys(packageDependencies).length > 0);

  it('names every catalog after the deploy id that loads it', () => {
    for (const { deployId } of catalogs)
      expect(fs.existsSync(`./src/projects/${deployId.slice(3)}`), deployId).to.equal(true);
  });

  it('keeps a product context inactive where the manifest lacks its pins', async () => {
    const contexts = await loadProductContexts({ dependencies: {} });
    for (const { deployId, packageDependencies } of pinned) {
      const context = contexts.find((entry) => entry.deployId === deployId);
      expect(context.active, deployId).to.equal(false);
      expect(context.missing, deployId).to.deep.equal(Object.keys(packageDependencies));
    }
  });

  it('activates a product context where the manifest declares every pin', async () => {
    const dependencies = Object.assign({}, ...pinned.map(({ packageDependencies }) => packageDependencies));
    for (const manifest of [{ dependencies }, { devDependencies: dependencies }])
      for (const { deployId, active, missing } of await loadProductContexts(manifest)) {
        expect(active, deployId).to.equal(true);
        expect(missing, deployId).to.be.empty;
      }
  });
});
