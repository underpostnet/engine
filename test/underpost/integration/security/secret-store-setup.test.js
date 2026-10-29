'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import shell from 'shelljs';
import { vi } from 'vitest';
import Underpost from '../../../../src/index.js';

const secret = () => Underpost.secret;
const RECIPIENT = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p';
const OTHER = 'age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn';

// The store paths are relative to the engine root, so every case runs in a fixture tree of its own.
describe('secret store setup and recipient rotation', () => {
  const cwd = process.cwd();
  const keyFileEnv = process.env.SOPS_AGE_KEY_FILE;
  let root;
  let commands;
  const conf = () => path.join(root, 'engine-private/secrets/.sops.yaml');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-secret-setup-'));
    process.chdir(root);
    process.env.SOPS_AGE_KEY_FILE = path.join(root, 'keys/age.txt');
    commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const keygen = /age-keygen -o "([^"]+)"/.exec(command);
      if (keygen) fs.outputFileSync(keygen[1], `# public key: ${RECIPIENT}\nAGE-SECRET-KEY-1X\n`);
      return { code: 0, stdout: '', stderr: '' };
    });
    vi.spyOn(secret(), 'assertTooling').mockReturnValue(undefined);
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
    if (keyFileEnv === undefined) delete process.env.SOPS_AGE_KEY_FILE;
    else process.env.SOPS_AGE_KEY_FILE = keyFileEnv;
  });

  describe('init', () => {
    it('generates the key and writes the creation rule once', () => {
      vi.spyOn(secret(), 'localRecipients').mockReturnValue([RECIPIENT]);
      secret().init();
      expect(commands.some((command) => command.startsWith('umask 077 && age-keygen -o'))).to.equal(true);
      expect(commands).to.include(`chmod 600 "${process.env.SOPS_AGE_KEY_FILE}"`);
      expect(fs.readFileSync(conf(), 'utf8')).to.include(`    age: ${RECIPIENT}`);
    });

    it('reuses an existing key and joins an inherited creation rule', () => {
      fs.outputFileSync(process.env.SOPS_AGE_KEY_FILE, 'AGE-SECRET-KEY-1X\n');
      fs.outputFileSync(conf(), 'creation_rules:\n  - path_regex: .*\\.enc\\.yaml$\n    age: other\n');
      vi.spyOn(secret(), 'localRecipients').mockReturnValue([RECIPIENT]);
      const join = vi.spyOn(secret(), 'ensureCreationRecipient').mockReturnValue(true);
      secret().init();
      expect(commands.some((command) => command.includes('age-keygen'))).to.equal(false);
      expect(join).toHaveBeenCalledWith(RECIPIENT);
    });
  });

  describe('recipient', () => {
    it('names the first local identity, and refuses a missing key or one with no identity', () => {
      expect(() => secret().recipient()).to.throw(/Age private key not found/);
      fs.outputFileSync(process.env.SOPS_AGE_KEY_FILE, '');
      vi.spyOn(secret(), 'localRecipients').mockReturnValue([]);
      expect(() => secret().recipient()).to.throw(/No Age identity could be read/);
      vi.spyOn(secret(), 'localRecipients').mockReturnValue([RECIPIENT, OTHER]);
      expect(secret().recipient()).to.equal(RECIPIENT);
    });
  });

  describe('repairCreationRules', () => {
    it('rewrites a rule carrying the store prefix and leaves any other rule alone', () => {
      expect(secret().repairCreationRules()).to.equal(false);
      fs.outputFileSync(conf(), 'creation_rules:\n  - path_regex: engine-private/secrets/.*\\.enc\\.yaml$\n');
      expect(secret().repairCreationRules()).to.equal(true);
      expect(fs.readFileSync(conf(), 'utf8')).to.equal('creation_rules:\n  - path_regex: .*\\.enc\\.yaml$\n');
      expect(secret().repairCreationRules()).to.equal(false);
    });
  });

  describe('rotateRecipient', () => {
    const manifest = { path: 'engine-private/secrets/default/a.enc.yaml', namespace: 'default', name: 'a' };

    beforeEach(() => {
      fs.outputFileSync(conf(), 'creation_rules: []\n');
      vi.spyOn(secret(), 'assertKeyFile').mockReturnValue('/keys/age.txt');
      vi.spyOn(secret(), 'creationRecipients').mockReturnValue([OTHER]);
      vi.spyOn(secret(), 'manifests').mockReturnValue([manifest]);
      vi.spyOn(secret(), 'assertDecryptable').mockReturnValue(undefined);
    });

    it('refuses a recipient that is not an Age public key, and a store without creation rules', () => {
      expect(() => secret().rotateRecipient('')).to.throw(/requires --args recipient=/);
      expect(() => secret().rotateRecipient('ssh-ed25519 AAAA')).to.throw(/Not a valid Age public recipient/);
      fs.removeSync(conf());
      expect(() => secret().rotateRecipient(RECIPIENT)).to.throw(/Missing creation rules/);
    });

    it('plans an additive rotation on a dry run and a prune with the recipients it revokes', () => {
      expect(secret().rotateRecipient(RECIPIENT, { dryRun: true })).to.deep.equal({
        recipients: [OTHER, RECIPIENT],
        revoked: [],
        rekeyed: 0,
      });
      expect(secret().rotateRecipient(RECIPIENT, { dryRun: true, pruneRecipients: true })).to.deep.equal({
        recipients: [RECIPIENT],
        revoked: [OTHER],
        rekeyed: 0,
      });
      // A kept recipient survives the prune, from a list or a separated string.
      expect(
        secret().rotateRecipient(RECIPIENT, { dryRun: true, pruneRecipients: true, keepRecipients: [OTHER] }).revoked,
      ).to.deep.equal([]);
      expect(
        secret().rotateRecipient(RECIPIENT, { dryRun: true, pruneRecipients: true, keepRecipients: `${OTHER}|` })
          .recipients,
      ).to.deep.equal([RECIPIENT, OTHER]);
    });

    it('re-keys every manifest onto the new recipients and confirms each one', () => {
      const write = vi.spyOn(secret(), 'writeCreationRecipients').mockReturnValue(undefined);
      vi.spyOn(secret(), 'manifestRecipients').mockReturnValue([OTHER, RECIPIENT]);
      expect(secret().rotateRecipient(RECIPIENT)).to.deep.equal({
        recipients: [OTHER, RECIPIENT],
        revoked: [],
        rekeyed: 1,
      });
      expect(write).toHaveBeenCalledWith([OTHER, RECIPIENT]);
      expect(commands.some((command) => command.includes(`updatekeys --yes "${manifest.path}"`))).to.equal(true);
    });

    it('refuses a prune without --force and a manifest still sealed to the old recipient', () => {
      expect(() => secret().rotateRecipient(RECIPIENT, { pruneRecipients: true })).to.throw(
        /Refusing to revoke 1 recipient\(s\) without --force/,
      );
      vi.spyOn(secret(), 'writeCreationRecipients').mockReturnValue(undefined);
      vi.spyOn(secret(), 'manifestRecipients').mockReturnValue([OTHER]);
      expect(() => secret().rotateRecipient(RECIPIENT, { pruneRecipients: true, force: true })).to.throw(
        /is still sealed to .* after updatekeys/,
      );
    });

    it('reports the revoked recipients of a confirmed prune', () => {
      vi.spyOn(secret(), 'writeCreationRecipients').mockReturnValue(undefined);
      vi.spyOn(secret(), 'manifestRecipients').mockReturnValue([RECIPIENT]);
      expect(secret().rotateRecipient(RECIPIENT, { pruneRecipients: true, force: true })).to.deep.equal({
        recipients: [RECIPIENT],
        revoked: [OTHER],
        rekeyed: 1,
      });
    });
  });
});
