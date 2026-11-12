'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import shell from 'shelljs';
import { vi } from 'vitest';
import Underpost from '../../../../src/index.js';

const secret = () => Underpost.secret;
const MONGODB = { resource: 'mongodb', id: 'credentials', name: 'mongodb-secret' };

describe('secret domain actions', () => {
  const cwd = process.cwd();
  let root;

  // An empty working directory has no cluster configuration: every resource seeds, in `default`.
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-secret-domain-'));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('runs one command with the named Secrets in its environment, and keeps them out of every store', () => {
    vi.spyOn(secret(), 'readData').mockReturnValue({ 'root-password': 'p', username: 'u' });
    const set = vi.spyOn(Underpost.host.store, 'set').mockImplementation(() => {});
    const commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command, options, callback) => {
      commands.push({ command, env: options.env });
      callback?.(0, '', '');
      return { code: 0, stdout: '', stderr: '' };
    });

    expect(
      secret().load({ env: 'development', args: { names: 'mongodb/credentials', run: 'npm run dev' } }),
    ).to.deep.equal({ loaded: ['mongodb/credentials'], keys: 2, command: 'npm run dev' });
    expect(secret().readData.mock.calls).to.deep.equal([[MONGODB, 'development']]);
    expect(commands.map(({ command }) => command)).to.deep.equal(['npm run dev']);
    expect(commands[0].env).to.include({ MONGODB_SECRET_ROOT_PASSWORD: 'p', MONGODB_SECRET_USERNAME: 'u' });
    expect(set).not.toHaveBeenCalled();
    expect(() => secret().load({ args: { names: 'mongodb/credentials' } })).to.throw(/load requires --args/);
  });

  it('publishes a plaintext manifest into the store of its environment, and refuses one without a reference', () => {
    const encrypt = vi.spyOn(secret(), 'encrypt').mockReturnValue('encrypted');
    expect(secret().publish({ env: 'test', args: { path: ' ./plain.yaml ', name: 'mongodb/credentials' } })).to.equal(
      'encrypted',
    );
    expect(encrypt.mock.calls[0]).to.deep.equal([
      './plain.yaml',
      './engine-private/secrets/test/mongodb/credentials.enc.yaml',
      { name: 'mongodb-secret', force: false },
    ]);
    expect(() => secret().publish({ args: { path: './plain.yaml' } })).to.throw(/name=<resource>\/<id>/);
  });

  it('applies the named Secrets, or every stored one of the environment', () => {
    const store = vi.spyOn(secret(), 'applyStore').mockReturnValue(2);
    expect(secret().apply({ env: 'test', args: { names: 'mongodb/credentials' }, dryRun: true })).to.equal(2);
    expect(store).toHaveBeenCalledWith({ environment: 'test', secrets: [MONGODB], dryRun: true });
    secret().apply({});
    expect(store).toHaveBeenLastCalledWith({ environment: 'production', secrets: undefined, dryRun: false });
    secret().apply({ args: 'names=mongodb/credentials|mongodb/keyfile,unused' });
    expect(store.mock.lastCall[0].secrets).to.deep.equal([
      MONGODB,
      { resource: 'mongodb', id: 'keyfile', name: 'mongodb-keyfile' },
    ]);
  });

  it('reports the status of the Secrets a filter names in an environment', () => {
    const report = vi.spyOn(secret(), 'statusReport').mockReturnValue([]);
    expect(secret().status({ env: 'development', args: { keys: 'mongo' } })).to.deep.equal([]);
    expect(report).toHaveBeenCalledWith('mongo', { environment: 'development' });
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
      env: 'production',
    });

    expect(secret().rotate({ args: { recipient: 'age1new', prune: 'true', keep: 'age1old' }, force: true })).to.equal(
      'recipient',
    );
    expect(recipient).toHaveBeenCalledWith('age1new', {
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

  it('withdraws the staged plaintext and purges the named Secrets, archived or deleted', () => {
    const purge = vi.spyOn(secret(), 'purge').mockReturnValue(undefined);
    expect(secret().clean({ args: { names: 'mongodb/credentials' }, force: true })).to.deep.equal({
      staged: 2,
      purged: ['mongodb/credentials'],
      disposition: 'archive',
    });
    expect(fs.existsSync(stage())).to.equal(false);
    expect(purge).toHaveBeenCalledWith(MONGODB, { environment: 'production', force: false });

    secret().clean({ env: 'test', args: { names: 'mongodb/credentials', delete: 'true' }, force: true });
    expect(purge).toHaveBeenLastCalledWith(MONGODB, { environment: 'test', force: true });
  });

  it('refuses to purge cluster state without --force', () => {
    expect(() => secret().clean({ args: { names: 'mongodb/credentials' } })).to.throw(/re-run with --force/);
  });
});

describe('secret purge', () => {
  const cwd = process.cwd();
  let root;
  let commands;
  const manifest = () => path.join(root, 'engine-private/secrets/production/mongodb/credentials.enc.yaml');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-secret-purge-'));
    process.chdir(root);
    fs.outputFileSync(manifest(), 'sealed');
    commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '' };
    });
    vi.spyOn(Underpost.wireguard, 'localRole').mockReturnValue('');
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('plans the purge on a dry run without touching the cluster or the store', () => {
    expect(secret().purge(MONGODB, { dryRun: true })).to.deep.equal({ deleted: false, archived: '' });
    expect(commands).to.deep.equal([]);
    expect(fs.existsSync(manifest())).to.equal(true);
  });

  it('deletes the live Secret from the namespace of its resource and archives the manifest', () => {
    const outcome = secret().purge(MONGODB, {});
    expect(outcome.deleted).to.equal(true);
    expect(outcome.archived).to.match(
      /^\.\/engine-private\/secrets\/\.archive\/production\/mongodb\/credentials\..+\.enc\.yaml$/,
    );
    expect(fs.existsSync(path.join(root, outcome.archived))).to.equal(true);
    expect(commands).to.deep.equal(['kubectl delete secret mongodb-secret -n default --ignore-not-found']);
  });

  it('deletes the manifest with force, and finds none on a second purge', () => {
    expect(secret().purge(MONGODB, { force: true })).to.deep.equal({ deleted: true, archived: '' });
    expect(fs.existsSync(manifest())).to.equal(false);
    expect(secret().purge(MONGODB, { force: true }).archived).to.equal('');
  });
});
