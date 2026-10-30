'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  DEFAULT_TYPEDOC_CONFIG_PATH,
  canonicalDocsClient,
  docsPlanFactory,
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

  it('builds the TypeDoc site in a full production build and keeps the published one otherwise', () => {
    expect(docsPlanFactory({}, 'production')).to.deep.equal({ assets: true, typedoc: 'build', required: false });
    expect(docsPlanFactory({}, 'development')).to.deep.equal({ assets: true, typedoc: 'skip', required: false });
    expect(docsPlanFactory({ liteBuild: true }, 'production').typedoc).to.equal('skip');
    expect(docsPlanFactory({ ssr: true }, 'production').typedoc).to.equal('skip');
    expect(docsPlanFactory()).to.deep.equal({ assets: true, typedoc: 'skip', required: false });
  });

  it('follows an explicit request, whose failure then fails the build', () => {
    expect(docsPlanFactory({ docs: 'build' }, 'development')).to.deep.equal({
      assets: true,
      typedoc: 'build',
      required: true,
    });
    expect(docsPlanFactory({ docs: 'skip' }, 'production')).to.deep.equal({
      assets: true,
      typedoc: 'skip',
      required: true,
    });
    expect(docsPlanFactory({ docsOnly: true }, 'development')).to.deep.equal({
      assets: false,
      typedoc: 'build',
      required: true,
    });
    expect(docsPlanFactory({ docs: 'watch', docsOnly: true }, 'development')).to.deep.equal({
      assets: false,
      typedoc: 'watch',
      required: true,
    });
    // A watch only previews: it builds no client assets, with or without --docs-only.
    expect(docsPlanFactory({ docs: 'watch' }, 'development')).to.deep.equal({
      assets: false,
      typedoc: 'watch',
      required: true,
    });
  });

  it('rejects a documentation request that cannot run', () => {
    const rejected =
      (options, env = 'development') =>
      () =>
        docsPlanFactory(options, env);
    expect(rejected({ docs: 'all' })).to.throw("--docs 'all': expected one of auto, skip, build, watch");
    expect(rejected({ docs: 'watch' }, 'production')).to.throw(
      '--docs watch runs in development only, not in production',
    );
    expect(rejected({ docsOnly: true, docs: 'skip' })).to.throw('--docs-only builds the documentation');
    expect(rejected({ ssr: true, docs: 'build' })).to.throw('--ssr rebuilds the SSR views only');
    expect(rejected({ docsOnly: true, buildZip: true })).to.throw('--build-zip builds client assets');
    expect(rejected({ docs: 'watch', iconsBuild: true })).to.throw('--icons-build builds client assets');
    expect(rejected({ docsOnly: true, unzip: 'build/x' })).to.throw('--unzip builds no client');
    expect(rejected({ docs: 'build', syncEnvPort: true })).to.throw('--sync-env-port builds no client');
    expect(docsPlanFactory({ syncEnvPort: true }, 'production').typedoc).to.equal('build');
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
