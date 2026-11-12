// The encrypted store with the real sops and age binaries, in a scratch checkout with a key generated for the
// run: a Secret sealed without a namespace decrypts to its data, and the namespace-keyed store moves into the
// store of an environment, verified, archived and declared, then a second run finds nothing to move. No command
// line carries a secret value. Skipped where sops or age-keygen is not installed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import childProcess from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import shell from 'shelljs';
import Underpost from '../../../../src/index.js';

const tooling = childProcess.spawnSync('sh', ['-c', 'command -v sops && command -v age-keygen']).status === 0;
const STORE = './engine-private/secrets';
const CREDENTIALS = { username: 'root', password: "p'w ord" };
const KEYFILE = { 'mongodb-keyfile': 'a2V5ZmlsZQ' };

describe.skipIf(!tooling)('the encrypted store with sops and age', () => {
  const cwd = process.cwd();
  const keyFile = process.env.SOPS_AGE_KEY_FILE;
  let root;
  let commands;

  /** Encrypts a namespace-keyed manifest as the previous store held it. */
  const legacy = (name, data) => {
    const plaintext = nodePath.join(root, `${name}.yaml`);
    fs.writeFileSync(
      plaintext,
      [
        'apiVersion: v1',
        'kind: Secret',
        'metadata:',
        `  name: ${name}`,
        '  namespace: default',
        'type: Opaque',
        'stringData:',
        ...Object.entries(data).map(([key, value]) => `  ${key}: '${value.replace(/'/g, "''")}'`),
        '',
      ].join('\n'),
    );
    const path = `${STORE}/default/${name}.enc.yaml`;
    fs.ensureDirSync(nodePath.dirname(path));
    childProcess.execFileSync('sops', [
      '--config',
      `${STORE}/.sops.yaml`,
      '--filename-override',
      path,
      '--encrypt',
      '--output',
      path,
      plaintext,
    ]);
    fs.removeSync(plaintext);
    return path;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-sops-roundtrip-'));
    process.chdir(root);
    const key = nodePath.join(root, 'keys.txt');
    childProcess.execFileSync('age-keygen', ['-o', key], { stdio: 'ignore' });
    fs.chmodSync(key, 0o600);
    process.env.SOPS_AGE_KEY_FILE = key;
    const recipient = /public key: (age1\S+)/.exec(fs.readFileSync(key, 'utf8'))[1];
    fs.outputFileSync(
      `${STORE}/.sops.yaml`,
      `creation_rules:\n  - path_regex: .*\\.enc\\.yaml$\n    encrypted_regex: '^(data|stringData)$'\n    age: ${recipient}\n`,
    );
    commands = [];
    const exec = shell.exec;
    vi.spyOn(shell, 'exec').mockImplementation((...args) => {
      commands.push(`${args[0]}`);
      return exec.apply(shell, args);
    });
    vi.spyOn(Underpost.wireguard, 'localRole').mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(cwd);
    fs.removeSync(root);
    if (keyFile === undefined) delete process.env.SOPS_AGE_KEY_FILE;
    else process.env.SOPS_AGE_KEY_FILE = keyFile;
  });

  it('seals a Secret without a namespace and decrypts it to its data', () => {
    const secret = Underpost.secret.reference('mongodb/credentials');
    const path = Underpost.secret.manifestPath(secret, 'production');
    Underpost.secret.seal({ path, name: secret.name, data: CREDENTIALS });
    const sealed = fs.readFileSync(path, 'utf8');
    expect(sealed).not.toMatch(/^\s+namespace:/m);
    expect(sealed).not.toContain("p'w ord");
    expect(() => Underpost.secret.assertManifest(path, { name: secret.name })).not.toThrow();
    expect(Underpost.secret.readData(secret, 'production')).toEqual(CREDENTIALS);
    expect(fs.readdirSync('/dev/shm').some((entry) => entry === `underpost-seal-${process.pid}`)).toBe(false);
    expect(commands.join('\n')).not.toContain("p'w ord");
  });

  it('moves the namespace-keyed store into an environment, verified and declared, once', () => {
    const originals = [legacy('mongodb-secret', CREDENTIALS), legacy('mongodb-keyfile', KEYFILE)];
    const result = Underpost.secret.migrateLegacyStore({ environment: 'production' });
    expect(result.moved).toEqual(['production/mongodb/keyfile', 'production/mongodb/credentials']);
    expect(result.declared).toEqual({ mongodb: 'sops' });
    expect(originals.every((path) => !fs.existsSync(path))).toBe(true);
    expect(result.archived.every((path) => fs.existsSync(path))).toBe(true);
    expect(Underpost.secret.readData(Underpost.secret.reference('mongodb/credentials'), 'production')).toEqual(
      CREDENTIALS,
    );
    expect(Underpost.namespace.secretSource({ resource: 'mongodb', environment: 'production' })).toBe('sops');
    expect(Underpost.namespace.secretSource({ resource: 'mongodb', environment: 'development' })).toBe('seed');
    expect(Underpost.secret.migrateLegacyStore({ environment: 'production' })).toMatchObject({ moved: [], kept: [] });
    expect(commands.join('\n')).not.toContain("p'w ord");
  });
});
