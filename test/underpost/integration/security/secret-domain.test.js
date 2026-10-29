'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import shell from 'shelljs';
import { vi } from 'vitest';
import Underpost from '../../../../src/index.js';

const secret = () => Underpost.secret;

describe('secret domain actions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads the stored workload secrets into the host store under their environment names', () => {
    vi.spyOn(secret(), 'has').mockImplementation((name) => name === 'mongodb-secret');
    vi.spyOn(secret(), 'readData').mockReturnValue({ 'root-password': 'p', username: 'u' });
    const set = vi.spyOn(Underpost.host.store, 'set').mockImplementation(() => {});

    expect(secret().load({ args: { names: 'mongodb-secret,absent-secret' }, namespace: 'ns' })).to.deep.equal({
      loaded: ['mongodb-secret'],
      keys: 2,
    });
    expect(set.mock.calls).to.deep.equal([
      ['MONGODB_SECRET_ROOT_PASSWORD', 'p'],
      ['MONGODB_SECRET_USERNAME', 'u'],
    ]);

    set.mockClear();
    // Without names it reads every managed secret the store holds; a dry run writes nothing.
    expect(secret().load({ dryRun: true })).to.deep.equal({ loaded: ['mongodb-secret'], keys: 2 });
    expect(set).not.toHaveBeenCalled();
  });

  it('publishes a plaintext manifest through the encrypt path and refuses one without a path', () => {
    const encrypt = vi.spyOn(secret(), 'encrypt').mockReturnValue('encrypted');
    expect(secret().publish({ args: { path: ' ./plain.yaml ' }, namespace: 'ns' })).to.equal('encrypted');
    expect(encrypt.mock.calls[0].slice(0, 2)).to.deep.equal(['./plain.yaml', 'ns']);
    expect(() => secret().publish({ args: {} })).to.throw(/publish requires --args path=/);
  });

  it('applies the named secrets, or the whole store', () => {
    const selected = vi.spyOn(secret(), 'applySelected').mockReturnValue('selected');
    const store = vi.spyOn(secret(), 'applyStore').mockReturnValue('store');
    expect(secret().apply({ args: { names: 'a' }, namespace: 'ns', dryRun: true })).to.equal('selected');
    expect(selected).toHaveBeenCalledWith('a', 'ns', { dryRun: true });
    expect(secret().apply({})).to.equal('store');
    expect(store).toHaveBeenCalledWith('default', { dryRun: false });
  });

  it('reports the status of the keys a filter names', () => {
    const report = vi.spyOn(secret(), 'statusReport').mockReturnValue({ ok: true });
    expect(secret().status({ args: { keys: 'mongo' }, namespace: 'ns' })).to.deep.equal({ ok: true });
    expect(report).toHaveBeenCalledWith('mongo', { namespace: 'ns' });
  });

  it('rotates Actions secrets for a secret name and the Age recipient for a recipient', () => {
    const actions = vi.spyOn(secret(), 'rotateActionsSecrets').mockReturnValue('actions');
    const recipient = vi.spyOn(secret(), 'rotateRecipient').mockReturnValue('recipient');

    expect(
      secret().rotate({ args: { secret: 'NPM_TOKEN', 'deploy-id': 'template', target: 'org', store: 'true' } }),
    ).to.equal('actions');
    expect(actions.mock.calls[0][0]).to.deep.include({
      keys: 'NPM_TOKEN',
      deployId: 'template',
      target: 'org',
      store: 'true',
      namespace: 'default',
      env: 'production',
    });

    expect(secret().rotate({ args: { recipient: 'age1new', prune: 'true', keep: 'age1old' }, force: true })).to.equal(
      'recipient',
    );
    expect(recipient).toHaveBeenCalledWith('age1new', {
      namespace: 'default',
      dryRun: false,
      force: true,
      pruneRecipients: true,
      keepRecipients: 'age1old',
    });
  });
});

describe('secret clean', () => {
  const cwd = process.cwd();
  let root;
  const stage = () => path.join(root, 'engine-private/secrets/.stage');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-secret-clean-'));
    process.chdir(root);
    fs.outputFileSync(path.join(stage(), 'one.yaml'), 'plain');
    fs.outputFileSync(path.join(stage(), 'two.yaml'), 'plain');
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('counts the staged plaintext on a dry run and leaves it in place', () => {
    expect(secret().clean({ dryRun: true })).to.deep.equal({ staged: 2, purged: [], disposition: 'archive' });
    expect(fs.existsSync(stage())).to.equal(true);
  });

  it('withdraws the staged plaintext and purges the named secrets, archived or deleted', () => {
    const purge = vi.spyOn(secret(), 'purge').mockReturnValue(undefined);
    expect(secret().clean({ args: { names: 'a' }, force: true })).to.deep.equal({
      staged: 2,
      purged: ['a'],
      disposition: 'archive',
    });
    expect(fs.existsSync(stage())).to.equal(false);
    expect(purge).toHaveBeenCalledWith('a', { namespace: 'default', dryRun: false, force: false });

    expect(secret().clean({ args: { names: 'b', delete: 'true' }, force: true }).disposition).to.equal('delete');
    expect(purge).toHaveBeenLastCalledWith('b', { namespace: 'default', dryRun: false, force: true });
  });

  it('refuses to purge cluster state without --force', () => {
    expect(() => secret().clean({ args: { names: 'a' } })).to.throw(/re-run with --force/);
  });
});

describe('secret purge', () => {
  const cwd = process.cwd();
  let root;
  let commands;
  const manifest = () => path.join(root, 'engine-private/secrets/ns/probe-secret.enc.yaml');
  const seeds = ({ files = [], keys = {}, values = {} } = {}) => {
    vi.spyOn(secret(), 'seedSources').mockReturnValue(Object.fromEntries(files.map((file, index) => [index, file])));
    vi.spyOn(secret(), 'seedEnvKeys').mockReturnValue(keys);
    vi.spyOn(secret(), 'seedEnvValues').mockReturnValue(values);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-secret-purge-'));
    process.chdir(root);
    fs.outputFileSync(manifest(), 'sealed');
    commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '' };
    });
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('plans the purge on a dry run without touching the cluster or the store', () => {
    seeds({ keys: { password: 'PROBE_PASSWORD' }, values: { password: 'p' } });
    expect(secret().purge('probe-secret', { namespace: 'ns', dryRun: true })).to.deep.equal({
      deleted: false,
      archived: '',
      seedFallback: true,
    });
    expect(commands).to.deep.equal([]);
    expect(fs.existsSync(manifest())).to.equal(true);
  });

  it('deletes the live Secret and archives the manifest, reporting the seed files it can fall back to', () => {
    fs.outputFileSync(path.join(root, 'seed.txt'), 'p');
    seeds({ files: [path.join(root, 'seed.txt')] });
    const outcome = secret().purge('probe-secret', { namespace: 'ns' });
    expect(outcome.deleted).to.equal(true);
    expect(outcome.seedFallback).to.equal(true);
    expect(outcome.archived).to.match(/^\.\/engine-private\/secrets\/\.archive\/ns\/probe-secret\..+\.enc\.yaml$/);
    expect(fs.existsSync(path.join(root, outcome.archived))).to.equal(true);
    expect(commands).to.deep.equal(['kubectl delete secret probe-secret -n ns --ignore-not-found']);
  });

  it('deletes the manifest with force, and reports a missing seed path', () => {
    seeds({ files: [path.join(root, 'absent.txt')] });
    expect(secret().purge('probe-secret', { namespace: 'ns', force: true })).to.deep.equal({
      deleted: true,
      archived: '',
      seedFallback: false,
    });
    expect(fs.existsSync(manifest())).to.equal(false);
    // A second purge finds no manifest left to remove.
    expect(secret().purge('probe-secret', { namespace: 'ns', force: true }).archived).to.equal('');
    expect(() => secret().purge('')).to.throw(/Purge requires a secret name/);
  });
});
