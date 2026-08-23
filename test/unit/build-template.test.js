'use strict';

import { execSync } from 'node:child_process';
import os from 'node:os';

import { expect } from 'chai';
import fs from 'fs-extra';

import { DefaultConf } from '../../conf.js';
import {
  ensureTemplateCheckout,
  gitOriginRepositoryName,
  pruneTemplateWorkTree,
  validateTemplatePath,
} from '../../src/server/runtime/conf.js';
import { TEMPLATE_PRESERVED_ENTRIES } from '../../src/projects/underpost/catalog-underpost.js';

const gitCheckout = (originUrl) => {
  const path = fs.mkdtempSync(`${os.tmpdir()}/underpost-template-`);
  execSync('git init -q', { cwd: path });
  if (originUrl) execSync(`git remote add origin ${originUrl}`, { cwd: path });
  return path;
};

describe('template checkout guard', () => {
  const created = [];
  const checkout = (originUrl) => {
    const path = gitCheckout(originUrl);
    created.push(path);
    return path;
  };

  afterAll(() => created.forEach((path) => fs.removeSync(path)));

  it('accepts a checkout whose origin is the template repository', () => {
    const path = checkout('https://github.com/underpostnet/pwa-microservices-template.git');
    expect(ensureTemplateCheckout({ toPath: path, githubUsername: 'underpostnet', noClone: true })).to.equal(false);
  });

  it('rejects a checkout carrying another repository history', () => {
    // Publishing a deploy id swaps the checkout `.git` for its product repo, and
    // an assembly that trusted it would read that product's package.json identity
    // back into the base template.
    const path = checkout('https://github.com/underpostnet/engine-test-cyberia.git');
    expect(() => ensureTemplateCheckout({ toPath: path, githubUsername: 'underpostnet', noClone: true })).to.throw(
      'not a underpostnet/pwa-microservices-template checkout',
    );
  });

  it('reports no origin for a checkout that declares none and for a plain directory', () => {
    expect(gitOriginRepositoryName(checkout())).to.equal(null);
    const plain = fs.mkdtempSync(`${os.tmpdir()}/underpost-plain-`);
    created.push(plain);
    expect(gitOriginRepositoryName(plain)).to.equal(null);
  });
});

describe('template work tree prune', () => {
  it('keeps only the entries a rebuild cannot reconstruct', () => {
    const path = fs.mkdtempSync(`${os.tmpdir()}/underpost-prune-`);
    fs.outputFileSync(`${path}/.git/HEAD`, 'ref: refs/heads/master\n');
    fs.outputFileSync(`${path}/node_modules/underpost/index.js`, '');
    fs.outputFileSync(`${path}/src/client/components/core/RenamedAway.js`, '');
    fs.outputFileSync(`${path}/package.json`, '{}');

    pruneTemplateWorkTree(path, TEMPLATE_PRESERVED_ENTRIES);

    expect(fs.readdirSync(path).sort()).to.deep.equal(['.git', 'node_modules']);
    fs.removeSync(path);
  });
});

// The filter resolves the base template against the default host and client that only
// the engine's conf declares; a product build ships its own deploy conf instead.
const defaultHostConf = DefaultConf.server?.['default.net']?.['/'];
const describeBaseTemplate = describe.skipIf(!defaultHostConf?.apis?.length || !DefaultConf.client?.default?.services);

describeBaseTemplate('template path selection', () => {
  // A skipped suite still runs its body at collection time, so nothing here may dereference
  // a conf the product build does not ship.
  const apis = defaultHostConf?.apis ?? [];

  it('carries the api entrypoint that sits next to the api directory', () => {
    // `src/api.js` is a documented development entrypoint, not one of the API
    // modules the deploy conf selects between.
    expect(validateTemplatePath('.//src/api.js')).to.equal(true);
  });

  it('carries the api modules the conf declares, and the shared types', () => {
    for (const api of apis) expect(validateTemplatePath(`.//src/api/${api}/${api}.service.js`), api).to.equal(true);
    expect(validateTemplatePath('.//src/api/types.js')).to.equal(true);
  });

  it('drops an api module the conf does not declare', () => {
    expect(validateTemplatePath('.//src/api/not-a-declared-api/not-a-declared-api.service.js')).to.equal(false);
  });
});
