'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { EMPTY_CATALOG, loadProductCatalogs, loadProductContexts } from '../../../src/server/build/catalog.js';
import { TEST_PROJECTS, productContextOf } from '../../../src/server/build/testing.js';
import { validateTemplatePath } from '../../../src/server/runtime/conf.js';
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

  it('every moved or copied source exists', () => {
    // `sourcePaths` are exempt: their source repos sit beside the engine and are
    // an external input, not expected to be checked out here.
    for (const { moves, copies } of catalogs)
      for (const [source] of [...moves, ...copies]) expect(fs.existsSync(source), source).to.equal(true);
  });

  it('resolves paths against the roots the build actually uses', () => {
    // `templatePaths` are read as `.${path}` and written or dropped as `${toPath}${path}`.
    for (const { templatePaths } of catalogs) for (const path of templatePaths) expect(path, path).to.match(/^\//);
  });
});

describeProducts('product catalogs and the test projects', () => {
  // A product owns the projects under its `templatePaths`: its template ships them and
  // the base template drops them.
  const productProjects = TEST_PROJECTS.filter((project) => productContextOf(project, catalogs));

  it.skipIf(!unslicedTree)('has products that own at least one project', () => {
    expect(productProjects).to.not.be.empty;
  });

  it.skipIf(!unslicedTree)('gives every project a directory that exists in an unsliced tree', () => {
    for (const { name, directory } of TEST_PROJECTS) expect(fs.existsSync(directory), name).to.equal(true);
  });

  it('carries the directory of every project a present product owns', () => {
    // Holds in a product template too: what it kept of itself must be whole.
    for (const { name, directory } of productProjects) expect(fs.existsSync(directory), name).to.equal(true);
  });

  it.skipIf(!unslicedTree)('gives a product every project whose sources the base template drops', () => {
    // The base template ships every project no product owns, so it must ship that project's sources too.
    const productPath = (source) =>
      catalogs.some(({ templatePaths }) => templatePaths.some((path) => `/${source}/`.startsWith(`${path}/`)));
    for (const { name, directory, sources = [] } of TEST_PROJECTS.filter((p) => !productProjects.includes(p))) {
      const dropped = sources.filter((source) => !validateTemplatePath(source) || productPath(source));
      expect(dropped, `${name}: add /${directory} to the templatePaths of its product`).to.be.empty;
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
