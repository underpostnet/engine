'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  DEFAULT_TYPEDOC_CONFIG_PATH,
  apiDocsModulesFactory,
  canonicalDocsClient,
  docsReferencesFactory,
  typedocOptionsFactory,
} from '../../../src/server/build/docs.js';

describe('client docs conf', () => {
  let fixturePath;
  let cwd;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-docs-conf-');
    // The default config resolves against the source tree root, so the fixture stands in for it.
    cwd = process.cwd();
    process.chdir(fixturePath);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(fixturePath);
  });

  it('layers the client typedoc block over the default config', () => {
    fs.outputJsonSync(DEFAULT_TYPEDOC_CONFIG_PATH, {
      name: 'Engine',
      entryPoints: ['./src'],
      tsconfig: './tsconfig.docs.json',
    });

    const options = typedocOptionsFactory({
      docs: { typedoc: { name: 'Product', entryPoints: ['./src/api'] } },
    });

    expect(options).to.deep.equal({ name: 'Product', entryPoints: ['./src/api'], tsconfig: './tsconfig.docs.json' });
  });

  it('serves the default config to a client that overrides nothing', () => {
    fs.outputJsonSync(DEFAULT_TYPEDOC_CONFIG_PATH, { name: 'Engine' });
    expect(typedocOptionsFactory({ docs: {} })).to.deep.equal({ name: 'Engine' });
    expect(typedocOptionsFactory()).to.deep.equal({ name: 'Engine' });
  });

  it('reports no options when the tree carries no default config', () => {
    expect(typedocOptionsFactory({ docs: { typedoc: { name: 'Product' } } })).to.equal(null);
  });

  it('reads every markdown file a declared directory holds, in name order', () => {
    fs.outputFileSync('./references/c-third.md', '# c');
    fs.outputFileSync('./references/a-first.md', '# a');
    fs.outputFileSync('./references/b-second.md', '# b');

    expect(docsReferencesFactory({ references: ['./references'] })).to.deep.equal([
      './references/a-first.md',
      './references/b-second.md',
      './references/c-third.md',
    ]);
  });

  it('reads to any depth and only markdown', () => {
    fs.outputFileSync('./references/a.md', '# a');
    fs.outputFileSync('./references/b.MD', '# b');
    fs.outputFileSync('./references/notes.txt', 'not a document');
    fs.outputFileSync('./references/c.markdown', '# not markdown either');
    fs.outputFileSync('./references/nested/deep.md', '# deep');

    expect(docsReferencesFactory({ references: ['./references'] })).to.deep.equal([
      './references/a.md',
      './references/b.MD',
      './references/nested/deep.md',
    ]);
  });

  it('joins the directories a client declares and skips one the tree lacks', () => {
    fs.outputFileSync('./first/a.md', '# a');
    fs.outputFileSync('./second/b.md', '# b');

    expect(docsReferencesFactory({ references: ['./first/', './absent', './second'] })).to.deep.equal([
      './first/a.md',
      './second/b.md',
    ]);
  });

  it('reads nothing when a client declares no reference directory', () => {
    expect(docsReferencesFactory({})).to.deep.equal([]);
    expect(docsReferencesFactory()).to.deep.equal([]);
  });

  it('documents the declared modules the instance serves, in declaration order', () => {
    const docs = { api: ['item-ledger', 'object-layer', 'absent'] };
    expect(apiDocsModulesFactory({ docs, apis: ['user', 'object-layer', 'item-ledger'] })).to.deep.equal([
      'item-ledger',
      'object-layer',
    ]);
    expect(apiDocsModulesFactory({ docs: { api: [] }, apis: ['user'] })).to.deep.equal([]);
  });

  it('documents the served modules whose router describes itself when nothing is declared', () => {
    fs.outputFileSync('./src/api/user/user.router.js', '// #swagger.tags = ["user"]');
    fs.outputFileSync('./src/api/plain/plain.router.js', 'export {};');

    expect(apiDocsModulesFactory({ docs: {}, apis: ['user', 'plain', 'absent'] })).to.deep.equal(['user']);
    expect(apiDocsModulesFactory({ apis: ['user'] })).to.deep.equal(['user']);
    expect(apiDocsModulesFactory()).to.deep.equal([]);
  });

  it('names the client whose typedoc options a product template writes to its root', () => {
    const confClient = {
      portal: { docs: { canonical: true } },
      store: { docs: {} },
      landing: {},
    };
    expect(canonicalDocsClient(confClient)).to.equal('portal');
    expect(canonicalDocsClient({ store: { docs: {} } })).to.equal(undefined);
    expect(canonicalDocsClient()).to.equal(undefined);
  });

  it('refuses two canonical clients', () => {
    const confClient = { portal: { docs: { canonical: true } }, store: { docs: { canonical: true } } };
    expect(() => canonicalDocsClient(confClient)).to.throw('canonical');
  });
});
