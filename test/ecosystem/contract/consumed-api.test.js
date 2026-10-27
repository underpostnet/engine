'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  apiExtensionUrl,
  consumedApisOf,
  consumesOf,
  deployConfServer,
  loadApiExtension,
  ownerHostOf,
  ownsApi,
} from '../../../src/server/domain/consumed-api.js';

// A host mounts the APIs another domain owns and names that owner: the owner stays the source of truth.
describe('consumed API declarations', () => {
  const shop = { apis: ['user', 'object-layer', 'item-ledger'], consumes: { 'object-layer': 'object-layer' } };

  it('returns the owner of each consumed API, as a copy', () => {
    const consumes = consumedApisOf(shop);
    expect(consumes).to.deep.equal({ 'object-layer': 'object-layer' });
    consumes.user = 'cyberia';
    expect(shop.consumes).to.deep.equal({ 'object-layer': 'object-layer' });
    expect(consumedApisOf()).to.deep.equal({});
  });

  it('refuses a consumed API the host does not mount, or an owner that is not a domain', () => {
    expect(() => consumedApisOf({ apis: [], consumes: { 'object-layer': 'object-layer' } })).to.throw(
      'Consumed API "object-layer" is not in the host\'s apis',
    );
    expect(() => consumedApisOf({ apis: ['user'], consumes: { user: 'Object Layer' } })).to.throw(
      'Consumed API "user" names no domain: "Object Layer"',
    );
  });

  it('owns an API that the host mounts and does not consume', () => {
    expect(ownsApi(shop, 'item-ledger')).to.equal(true);
    expect(ownsApi(shop, 'object-layer')).to.equal(false);
    expect(ownsApi(shop, 'file')).to.equal(false);
    expect(ownsApi(undefined, 'user')).to.equal(false);
  });

  it('finds the host of a deploy that owns an API', () => {
    const confServer = {
      'shop.net': { '/': shop },
      'objectlayer.org': { '/': { apis: ['object-layer'] } },
    };
    expect(ownerHostOf(confServer, 'object-layer')).to.equal('objectlayer.org');
    expect(ownerHostOf(confServer, 'item-ledger')).to.equal('shop.net');
    expect(ownerHostOf(confServer, 'file')).to.equal('');
    expect(ownerHostOf(null, 'user')).to.equal('');
  });

  it('accepts only project and API names that stay inside the projects directory', () => {
    expect(apiExtensionUrl('object-layer', 'cyberia').pathname).to.match(
      /\/src\/projects\/cyberia\/object-layer\.extension\.js$/,
    );
    for (const [api, project] of [
      ['object-layer', '../server'],
      ['../db', 'cyberia'],
      ['object-layer', 'Cyberia'],
      ['object-layer', undefined],
    ])
      expect(() => apiExtensionUrl(api, project), `${project}/${api}`).to.throw('Invalid extension project');
  });

  it('loads no extension for an API the host does not extend', async () => {
    expect(await loadApiExtension('object-layer')).to.equal(undefined);
    expect(await loadApiExtension('object-layer', { 'atlas-sprite-sheet': 'cyberia' })).to.equal(undefined);
  });
});

// A process that knows only `{ host, path }`, such as the CLI, reads the declarations from its deploy.
describe('consumed APIs of the running deploy', () => {
  const cwd = process.cwd();
  let root;
  let sequence = 0;

  const deploy = (confServer) => {
    const id = `dd-consumed-${process.pid}-${++sequence}`;
    if (confServer) fs.outputJsonSync(path.join(root, `engine-private/conf/${id}/conf.server.json`), confServer);
    vi.stubEnv('DEFAULT_DEPLOY_ID', id);
    return id;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-consumed-api-'));
    process.chdir(root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.chdir(cwd);
    fs.removeSync(root);
  });

  it('reads no server conf without a deploy id, or for a deploy that has none', () => {
    vi.stubEnv('DEFAULT_DEPLOY_ID', '');
    expect(deployConfServer()).to.equal(null);
    deploy();
    expect(deployConfServer()).to.equal(null);
  });

  it('reads the server conf of a deploy once', () => {
    const id = deploy({ 'shop.net': { '/': { apis: ['user'] } } });
    expect(deployConfServer()).to.deep.equal({ 'shop.net': { '/': { apis: ['user'] } } });
    fs.outputJsonSync(path.join(root, `engine-private/conf/${id}/conf.server.json`), {});
    expect(deployConfServer()).to.deep.equal({ 'shop.net': { '/': { apis: ['user'] } } });
  });

  it('takes the declarations of the router options first, then those of the deploy host path', () => {
    deploy({
      'shop.net': {
        '/': { apis: ['object-layer'], consumes: { 'object-layer': 'object-layer' } },
        '/ledger': { apis: ['item-ledger'], consumes: { 'item-ledger': 'item-ledger' } },
      },
    });
    expect(consumesOf({ consumes: { user: 'cyberia' } })).to.deep.equal({ user: 'cyberia' });
    expect(consumesOf({ host: 'shop.net' })).to.deep.equal({ 'object-layer': 'object-layer' });
    expect(consumesOf({ host: 'shop.net', path: '/ledger' })).to.deep.equal({ 'item-ledger': 'item-ledger' });
    expect(consumesOf({ host: 'other.net' })).to.deep.equal({});
    expect(consumesOf()).to.deep.equal({});
  });
});
