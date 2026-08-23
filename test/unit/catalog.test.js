'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { EMPTY_CATALOG, loadProductCatalogs } from '../../src/server/build/catalog.js';
import { TEST_TIERS } from '../../src/server/build/testing.js';

// A broken catalog path fails during template assembly, long after the commit
// that broke it, so the tree is asserted here instead.
//
// A base template has had every product stripped out, including the catalogs
// that describe the strip — there is nothing left to assert against, and the
// paths these check are the ones it legitimately no longer carries.
const catalogs = await loadProductCatalogs();
const describeProducts = describe.skipIf(catalogs.length === 0);

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

describeProducts('product catalogs and the test tiers', () => {
  // A tier a product strips from the base template but does not ship is a tier
  // nothing runs: the template keeps no tests for the code it removed, and the
  // product CLI arrives without the suite that covers what it added.
  const strippedTiers = TEST_TIERS.filter(({ directory }) =>
    catalogs.some(({ stripPaths }) => stripPaths.includes(`./${directory}`)),
  );

  it('has products that own at least one tier', () => {
    expect(strippedTiers).to.not.be.empty;
  });

  it('gives every tier a directory that exists in an unsliced tree', () => {
    for (const { name, directory } of TEST_TIERS) expect(fs.existsSync(directory), name).to.equal(true);
  });

  it('ships every tier it strips from the base template', () => {
    for (const { name, directory } of strippedTiers) {
      const owner = catalogs.find(({ stripPaths }) => stripPaths.includes(`./${directory}`));
      expect(owner.templatePaths, name).to.include(`/${directory}`);
    }
  });
});
