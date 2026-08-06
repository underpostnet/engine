'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import Underpost from '../src/index.js';

const sops = () => Underpost.secret.sops;
// Unique namespace so the fixture can never collide with (or clean up) a real
// encrypted store under the gitignored engine-private tree.
const TEST_NAMESPACE = 'sops-store-test-ns';
const TEST_DIR = `./engine-private/secrets/${TEST_NAMESPACE}`;

const encryptedFixture = `apiVersion: v1
kind: Secret
metadata:
    name: fixture-secret
    namespace: ${TEST_NAMESPACE}
type: Opaque
stringData:
    password: ENC[AES256_GCM,data:Lm8xQ2vT,iv:3fB7yU1jH6sD0gW2cN8mZ4kP5qX9tA7rE1vL3oI6uY0=,tag:2cF5nQ8sW1zA4dG7jL0mB==,type:str]
sops:
    age:
        - recipient: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
          enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
            YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IFgyNTUxOSBqTndTOFRIRGxZUmZZNXFy
            -----END AGE ENCRYPTED FILE-----
        - recipient: age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn
          enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
            YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IFgyNTUxOSBwUXcyVGtMOXZSN21OY0Zq
            -----END AGE ENCRYPTED FILE-----
    encrypted_regex: ^(data|stringData)$
    version: 3.10.2
`;

describe('sops encrypted secret store', () => {
  describe('key file resolution', () => {
    const originalKeyFile = process.env.SOPS_AGE_KEY_FILE;

    afterEach(() => {
      if (originalKeyFile === undefined) delete process.env.SOPS_AGE_KEY_FILE;
      else process.env.SOPS_AGE_KEY_FILE = originalKeyFile;
    });

    it('honors SOPS_AGE_KEY_FILE so key location has a single source of truth', () => {
      process.env.SOPS_AGE_KEY_FILE = '/srv/keys/age.txt';
      expect(sops().keyFile()).to.equal('/srv/keys/age.txt');
    });

    it('falls back to the sops default key location', () => {
      delete process.env.SOPS_AGE_KEY_FILE;
      expect(sops().keyFile()).to.equal(`${os.homedir()}/.config/sops/age/keys.txt`);
    });
  });

  describe('store layout', () => {
    it('resolves a manifest to <store>/<namespace>/<name>.enc.yaml', () => {
      expect(sops().manifestPath('postgres-secret', 'default')).to.equal(
        './engine-private/secrets/default/postgres-secret.enc.yaml',
      );
    });

    it('defaults to the default namespace', () => {
      expect(sops().manifestPath('mariadb-secret')).to.equal(
        './engine-private/secrets/default/mariadb-secret.enc.yaml',
      );
    });
  });

  describe('presence detection and origin seed fallback', () => {
    const storeRoot = './engine-private/secrets';
    let createdStoreRoot = false;

    before(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(TEST_DIR);
      fs.writeFileSync(`${TEST_DIR}/fixture-secret.enc.yaml`, encryptedFixture, 'utf8');
    });

    after(() => {
      fs.removeSync(TEST_DIR);
      // Only reclaim the store root when this suite created it, so a real
      // encrypted store is never touched.
      if (createdStoreRoot && fs.existsSync(storeRoot) && fs.readdirSync(storeRoot).length === 0)
        fs.removeSync(storeRoot);
    });

    it('detects an encrypted manifest that exists', () => {
      expect(sops().has('fixture-secret', TEST_NAMESPACE)).to.equal(true);
    });

    it('reports no manifest for a secret not yet onboarded', () => {
      expect(sops().has('not-onboarded-secret', TEST_NAMESPACE)).to.equal(false);
    });

    it('reports no manifest for a namespace with no store', () => {
      expect(sops().has('fixture-secret', 'namespace-without-a-store')).to.equal(false);
    });

    it('declines to apply when no encrypted manifest exists, leaving the caller its origin seed path', () => {
      // Must return false rather than throw: this is the branch that keeps clusters
      // not yet onboarded to the encrypted store seeding from plaintext credentials.
      expect(sops().applyIfPresent('not-onboarded-secret', TEST_NAMESPACE)).to.equal(false);
    });

    it('lists recipients from the plaintext sops metadata block without a private key', () => {
      const lines = [];
      const originalLog = console.log;
      console.log = (line) => lines.push(line);
      try {
        sops().list();
      } finally {
        console.log = originalLog;
      }
      const entry = lines.find((line) => line.includes(`${TEST_NAMESPACE}/fixture-secret.enc.yaml`));
      expect(entry).to.be.a('string');
      expect(entry).to.include('age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p');
      expect(entry).to.include('age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn');
    });

    it('refuses to apply a namespace with no stored manifests', () => {
      expect(() => sops().apply('namespace-without-a-store')).to.throw(/No encrypted secrets for namespace/);
    });
  });

  describe('cluster initialization wiring', () => {
    const clusterSource = fs.readFileSync(new URL('../src/cli/cluster.js', import.meta.url), 'utf8');

    for (const [flag, secretName] of [
      ['mariadb', 'mariadb-secret'],
      ['mysql', 'mysql-secret'],
      ['postgresql', 'postgres-secret'],
    ]) {
      it(`prefers the encrypted store for ${secretName} and keeps the origin seed path`, () => {
        const start = clusterSource.indexOf(`if (options.${flag}) {`);
        expect(start, `options.${flag} branch not found`).to.be.greaterThan(-1);
        const branch = clusterSource.slice(start, start + 1200);
        expect(branch).to.include(`Underpost.secret.sops.applyIfPresent('${secretName}', options.namespace)`);
        expect(branch).to.include(`kubectl create secret generic ${secretName}`);
        // The origin seed creation must stay guarded by the negated store lookup,
        // never run unconditionally alongside the decrypted apply.
        expect(branch).to.match(
          new RegExp(
            `if \\(!Underpost\\.secret\\.sops\\.applyIfPresent\\('${secretName}'[\\s\\S]{0,80}kubectl create secret generic ${secretName}`,
          ),
        );
      });
    }

    it('delegates host tooling install to UnderpostSecret instead of duplicating it', () => {
      expect(clusterSource).to.include('Underpost.secret.sops.installTooling()');
      // The binary install logic must live in exactly one place.
      expect(clusterSource).to.not.include('releases/download/${SOPS_VERSION}');
      expect(clusterSource).to.not.include('const SOPS_VERSION');
      expect(clusterSource).to.not.include('const AGE_VERSION');
    });

    it('pins the sops and age versions in the secrets module', () => {
      const secretsSource = fs.readFileSync(new URL('../src/cli/secrets.js', import.meta.url), 'utf8');
      expect(secretsSource).to.match(/const SOPS_VERSION = 'v\d+\.\d+\.\d+';/);
      expect(secretsSource).to.match(/const AGE_VERSION = 'v\d+\.\d+\.\d+';/);
    });
  });

  describe('decrypt-to-apply pipeline', () => {
    const secretsSource = fs.readFileSync(new URL('../src/cli/secrets.js', import.meta.url), 'utf8');

    it('streams decrypted output into kubectl without writing plaintext to disk', () => {
      expect(secretsSource).to.include('sops --decrypt "${manifestPath}" ');
      expect(secretsSource).to.include('| kubectl apply -f -');
    });

    it('guards the decrypt pipe with pipefail so a decrypt failure cannot apply an empty stream', () => {
      expect(secretsSource).to.include("bash -c 'set -o pipefail;");
    });

    it('passes the age key as a file path, never as key material in the environment', () => {
      expect(secretsSource).to.include('SOPS_AGE_KEY_FILE=');
      expect(secretsSource).to.not.match(/SOPS_AGE_KEY=[^F]/);
    });

    it('re-keys under pipefail with logging suppressed', () => {
      const start = secretsSource.indexOf('      rotate(recipient, options = {}) {');
      expect(start, 'rotate() not found').to.be.greaterThan(-1);
      const body = secretsSource.slice(start, secretsSource.indexOf('\n      /**', start));
      expect(body).to.include('set -o pipefail');
      expect(body).to.include('sops --config');
      expect(body).to.include('updatekeys --yes');
      expect(body).to.include('disableLog: true');
    });
  });

  describe('creation-rule recipient parsing', () => {
    const storeRoot = './engine-private/secrets';
    const confPath = `${storeRoot}/.sops.yaml`;
    let createdStoreRoot = false;
    let savedConf = null;

    const rule = (ageValue) =>
      ['creation_rules:', '  - path_regex: engine-private/secrets/.*\\.enc\\.yaml$', `    age: ${ageValue}`, ''].join(
        '\n',
      );

    before(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(storeRoot);
      if (fs.existsSync(confPath)) savedConf = fs.readFileSync(confPath, 'utf8');
    });

    after(() => {
      if (savedConf !== null) fs.writeFileSync(confPath, savedConf, 'utf8');
      else fs.removeSync(confPath);
      if (createdStoreRoot && fs.existsSync(storeRoot) && fs.readdirSync(storeRoot).length === 0)
        fs.removeSync(storeRoot);
    });

    it('reads a single-line recipient list', () => {
      fs.writeFileSync(confPath, rule('age1aaa,age1bbb'), 'utf8');
      expect(sops().creationRecipients()).to.deep.equal(['age1aaa', 'age1bbb']);
    });

    it('reads the folded multi-line recipient form sops also accepts', () => {
      fs.writeFileSync(confPath, rule('>-\n      age1aaa,\n      age1bbb'), 'utf8');
      expect(sops().creationRecipients()).to.deep.equal(['age1aaa', 'age1bbb']);
    });

    it('collapses a folded list to one canonical line on write', () => {
      fs.writeFileSync(confPath, rule('>-\n      age1aaa,\n      age1bbb'), 'utf8');
      sops().writeCreationRecipients(['age1ccc']);
      const written = fs.readFileSync(confPath, 'utf8');
      expect(written).to.include('    age: age1ccc');
      expect(written).to.not.include('age1aaa');
      expect(written).to.include('creation_rules:');
      expect(sops().creationRecipients()).to.deep.equal(['age1ccc']);
    });

    it('rejects a recipient that is not an age public key', () => {
      fs.writeFileSync(confPath, rule('age1aaa'), 'utf8');
      expect(() => sops().rotate('/etc/passwd')).to.throw(/not a valid Age public recipient/i);
      expect(() => sops().rotate('')).to.throw(/requires --recipient/);
    });
  });

  describe('emergency purge', () => {
    it('archives rather than deletes unless forced', () => {
      const secretsSource = fs.readFileSync(new URL('../src/cli/secrets.js', import.meta.url), 'utf8');
      const start = secretsSource.indexOf('      purge(name, options = {}) {');
      expect(start, 'purge() not found').to.be.greaterThan(-1);
      const body = secretsSource.slice(start, secretsSource.indexOf('\n      /**', start));
      expect(body).to.include('kubectl delete secret ${name} -n ${namespace} --ignore-not-found');
      expect(body).to.include('options.force');
      expect(body).to.include('fs.moveSync');
    });

    it('reports the plan without mutating anything on a dry run', () => {
      const result = sops().purge('postgres-secret', { namespace: 'default', dryRun: true });
      expect(result).to.include({ deleted: false, archived: '' });
      expect(result.seedFallback).to.be.a('boolean');
    });

    it('requires a secret name', () => {
      expect(() => sops().purge('')).to.throw(/requires a secret name/);
    });
  });

  describe('CLI surface', () => {
    const cliSource = fs.readFileSync(new URL('../src/cli/index.js', import.meta.url), 'utf8');

    it('makes the platform argument optional so --install-tools needs no platform', () => {
      expect(cliSource).to.include("argument(\n    '[platform]'");
      expect(cliSource).to.include('if (options.installTools) return Underpost.secret.sops.installTooling();');
    });

    it('exposes the emergency flags', () => {
      for (const flag of ['--install-tools', '--rotate', '--recipient <age-public-key>', '--prune-recipients'])
        expect(cliSource).to.include(flag);
      expect(cliSource).to.include("'--purge <secret-name>'");
    });

    it('routes rotate and purge through the selected platform', () => {
      expect(cliSource).to.include('Underpost.secret[platform].rotate(options.recipient, options)');
      expect(cliSource).to.include('Underpost.secret[platform].purge(options.purge, options)');
    });
  });

  describe('fail-closed manifest validation', () => {
    const storeRoot = './engine-private/secrets';
    const NS = 'sops-validate-ns';
    const dir = `${storeRoot}/${NS}`;
    let createdStoreRoot = false;

    const encrypted = (name, namespace) =>
      [
        'apiVersion: v1',
        'kind: Secret',
        'metadata:',
        `    name: ${name}`,
        ...(namespace ? [`    namespace: ${namespace}`] : []),
        'type: Opaque',
        'stringData:',
        '    password: ENC[AES256_GCM,data:Lm8x,iv:3fB7,tag:2cF5,type:str]',
        'sops:',
        '    age:',
        '        - recipient: age1aaa',
        '',
      ].join('\n');

    before(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(dir);
    });

    after(() => {
      fs.removeSync(dir);
      if (createdStoreRoot && fs.existsSync(storeRoot) && fs.readdirSync(storeRoot).length === 0)
        fs.removeSync(storeRoot);
    });

    it('accepts a well-formed encrypted Secret', () => {
      const path = `${dir}/good.enc.yaml`;
      fs.writeFileSync(path, encrypted('good', NS), 'utf8');
      expect(() => sops().assertManifest(path, { name: 'good', namespace: NS })).to.not.throw();
    });

    it('refuses a manifest that was never encrypted', () => {
      const path = `${dir}/plain.enc.yaml`;
      fs.writeFileSync(path, 'kind: Secret\nmetadata:\n    name: plain\nstringData:\n    password: hunter2\n', 'utf8');
      expect(() => sops().assertManifest(path, { name: 'plain' })).to.throw(/not encrypted/);
    });

    it('refuses a non-Secret resource', () => {
      const path = `${dir}/cm.enc.yaml`;
      fs.writeFileSync(path, encrypted('cm', NS).replace('kind: Secret', 'kind: ConfigMap'), 'utf8');
      expect(() => sops().assertManifest(path, { name: 'cm' })).to.throw(/is a ConfigMap, not a Secret/);
    });

    it('refuses a manifest whose metadata.name does not match its filename', () => {
      const path = `${dir}/postgres-secret.enc.yaml`;
      fs.writeFileSync(path, encrypted('some-other-secret', NS), 'utf8');
      expect(() => sops().assertManifest(path, { name: 'postgres-secret' })).to.throw(/secretKeyRef .* unresolved/);
    });

    it('refuses a manifest targeting a different namespace', () => {
      const path = `${dir}/elsewhere.enc.yaml`;
      fs.writeFileSync(path, encrypted('elsewhere', 'other-ns'), 'utf8');
      expect(() => sops().assertManifest(path, { name: 'elsewhere', namespace: NS })).to.throw(/metadata.namespace/);
    });

    it('raises rather than seeding when a present manifest is invalid', () => {
      // The security-critical distinction: absent -> seed fallback, corrupt -> hard failure.
      const path = `${dir}/corrupt-secret.enc.yaml`;
      fs.writeFileSync(path, 'kind: Secret\nmetadata:\n    name: corrupt-secret\n', 'utf8');
      expect(() => sops().applyIfPresent('corrupt-secret', NS)).to.throw(/not encrypted/);
      expect(sops().applyIfPresent('absent-secret', NS)).to.equal(false);
    });
  });

  describe('key file identity context', () => {
    const originalKeyFile = process.env.SOPS_AGE_KEY_FILE;
    const originalSudoUser = process.env.SUDO_USER;
    const originalXdg = process.env.XDG_CONFIG_HOME;

    afterEach(() => {
      for (const [key, value] of [
        ['SOPS_AGE_KEY_FILE', originalKeyFile],
        ['SUDO_USER', originalSudoUser],
        ['XDG_CONFIG_HOME', originalXdg],
      ])
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    });

    it('prefers XDG_CONFIG_HOME over the home-relative default', () => {
      delete process.env.SOPS_AGE_KEY_FILE;
      process.env.XDG_CONFIG_HOME = '/srv/xdg';
      expect(sops().keyFile()).to.equal('/srv/xdg/sops/age/keys.txt');
    });

    it('lists the invoking user key path as a candidate under sudo', () => {
      delete process.env.SOPS_AGE_KEY_FILE;
      process.env.SUDO_USER = 'operator';
      expect(sops().keyFileCandidates()).to.include('/home/operator/.config/sops/age/keys.txt');
    });

    it('names the uid and every candidate when the key is missing', () => {
      process.env.SOPS_AGE_KEY_FILE = '/nonexistent/keys.txt';
      expect(() => sops().assertKeyFile()).to.throw(/Age private key not found.*uid/);
    });

    it('refuses a group- or world-readable private key', () => {
      const keyPath = `${os.tmpdir()}/underpost-age-test-key.txt`;
      fs.writeFileSync(keyPath, 'AGE-SECRET-KEY-1TEST\n', 'utf8');
      fs.chmodSync(keyPath, 0o644);
      process.env.SOPS_AGE_KEY_FILE = keyPath;
      try {
        expect(() => sops().assertKeyFile()).to.throw(/group\/world accessible/);
        fs.chmodSync(keyPath, 0o600);
        expect(sops().assertKeyFile()).to.equal(keyPath);
      } finally {
        fs.removeSync(keyPath);
      }
    });
  });

  describe('store adoption by a host that did not create it', () => {
    // The production trap: a host pulls engine-private, generates its own Age key, and every
    // inherited manifest is sealed to somebody else's recipient. sops reports that from inside a
    // decrypt pipe as "no identity matched any of the recipients", naming neither file nor remedy.
    const storeRoot = './engine-private/secrets';
    const NS = 'sops-adoption-ns';
    const dir = `${storeRoot}/${NS}`;
    const FOREIGN = 'age1mq5jhnym3w2cgexypl5law8my77uvqt2pxaxdqfs8gs0eqcltseq27nquw';
    const LOCAL = 'age1myykjrfvjg55hddhetqxs4kkpe9mzjd8yae87c8d2c335kghgquqsgrl8q';
    const originalKeyFile = process.env.SOPS_AGE_KEY_FILE;
    // A present, correctly permissioned key file carrying no usable identity: assertKeyFile passes,
    // so the adoption check is what the caller actually hits, exactly as on the production host.
    const keyPath = `${os.tmpdir()}/underpost-adoption-test-key.txt`;
    let createdStoreRoot = false;

    const sealedTo = (name, recipient) =>
      [
        'apiVersion: v1',
        'kind: Secret',
        'metadata:',
        `    name: ${name}`,
        `    namespace: ${NS}`,
        'type: Opaque',
        'stringData:',
        '    password: ENC[AES256_GCM,data:Lm8x,iv:3fB7,tag:2cF5,type:str]',
        'sops:',
        '    age:',
        `        - recipient: ${recipient}`,
        '',
      ].join('\n');

    before(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(dir);
      fs.writeFileSync(`${dir}/mariadb-secret.enc.yaml`, sealedTo('mariadb-secret', FOREIGN), 'utf8');
      fs.writeFileSync(keyPath, '# no identity here\n', 'utf8');
      fs.chmodSync(keyPath, 0o600);
      process.env.SOPS_AGE_KEY_FILE = keyPath;
    });

    after(() => {
      if (originalKeyFile === undefined) delete process.env.SOPS_AGE_KEY_FILE;
      else process.env.SOPS_AGE_KEY_FILE = originalKeyFile;
      fs.removeSync(keyPath);
      fs.removeSync(dir);
      if (createdStoreRoot && fs.existsSync(storeRoot) && fs.readdirSync(storeRoot).length === 0)
        fs.removeSync(storeRoot);
    });

    it('holds no recipients when the key file is absent or carries no identity', () => {
      expect(sops().localRecipients()).to.deep.equal([]);
      process.env.SOPS_AGE_KEY_FILE = '/nonexistent/underpost-adoption-test/keys.txt';
      try {
        expect(sops().localRecipients()).to.deep.equal([]);
      } finally {
        process.env.SOPS_AGE_KEY_FILE = keyPath;
      }
    });

    it('decides decryptability by recipient-set intersection, without a decrypt attempt', () => {
      const path = `${dir}/mariadb-secret.enc.yaml`;
      expect(sops().decryptable(path, [FOREIGN])).to.equal(true);
      expect(sops().decryptable(path, [LOCAL])).to.equal(false);
      expect(sops().decryptable(path, [LOCAL, FOREIGN])).to.equal(true);
      expect(sops().decryptable(path, [])).to.equal(false);
    });

    it('names the manifest, its recipients, and every remedy instead of failing inside sops', () => {
      let error;
      try {
        sops().assertDecryptable(sops().manifests(NS));
      } catch (thrown) {
        error = thrown;
      }
      expect(error, 'expected assertDecryptable to throw').to.be.an('error');
      expect(error.message).to.include(`${NS}/mariadb-secret`);
      expect(error.message).to.include(FOREIGN);
      expect(error.message).to.include('underpost secret sops --rotate');
      expect(error.message).to.include('underpost run sops-setup --force');
    });

    it('raises the adoption error before any manifest reaches kubectl', () => {
      expect(() => sops().apply(NS)).to.throw(/sealed to Age recipients this host does not hold/);
    });

    it('raises rather than sliding back to the origin seed path for a present-but-unreadable manifest', () => {
      expect(() => sops().applyIfPresent('mariadb-secret', NS)).to.throw(/does not hold/);
      expect(sops().applyIfPresent('absent-secret', NS)).to.equal(false);
    });
  });

  describe('creation-rule recipient registration', () => {
    const storeRoot = './engine-private/secrets';
    const confPath = `${storeRoot}/.sops.yaml`;
    const LOCAL = 'age1myykjrfvjg55hddhetqxs4kkpe9mzjd8yae87c8d2c335kghgquqsgrl8q';
    let createdStoreRoot = false;
    let savedConf = null;

    before(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(storeRoot);
      if (fs.existsSync(confPath)) savedConf = fs.readFileSync(confPath, 'utf8');
    });

    after(() => {
      if (savedConf !== null) fs.writeFileSync(confPath, savedConf, 'utf8');
      else fs.removeSync(confPath);
      if (createdStoreRoot && fs.existsSync(storeRoot) && fs.readdirSync(storeRoot).length === 0)
        fs.removeSync(storeRoot);
    });

    it('adds the local recipient to an inherited rule without revoking anyone', () => {
      fs.writeFileSync(
        confPath,
        ['creation_rules:', '  - path_regex: .*\\.enc\\.yaml$', '    age: age1foreign', ''].join('\n'),
        'utf8',
      );
      expect(sops().ensureCreationRecipient(LOCAL)).to.equal(true);
      expect(sops().creationRecipients()).to.deep.equal(['age1foreign', LOCAL]);
    });

    it('is a no-op once the recipient is listed', () => {
      expect(sops().ensureCreationRecipient(LOCAL)).to.equal(false);
      expect(sops().creationRecipients()).to.deep.equal(['age1foreign', LOCAL]);
    });

    it('leaves a rule that declares no age recipients alone', () => {
      fs.writeFileSync(
        confPath,
        ['creation_rules:', '  - path_regex: .*\\.enc\\.yaml$', '    pgp: ABCDEF', ''].join('\n'),
        'utf8',
      );
      expect(sops().ensureCreationRecipient(LOCAL)).to.equal(false);
      expect(fs.readFileSync(confPath, 'utf8')).to.include('pgp: ABCDEF');
    });

    it('registers the host during init so a pulled store cannot be encrypted to write-only', () => {
      const secretsSource = fs.readFileSync(new URL('../src/cli/secrets.js', import.meta.url), 'utf8');
      const start = secretsSource.indexOf('      init() {');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n      /**', start));
      expect(body).to.include('ensureCreationRecipient(recipient)');
    });
  });

  describe('sops-setup onboarding reports', () => {
    const runSource = fs.readFileSync(new URL('../src/cli/run.js', import.meta.url), 'utf8');
    const start = runSource.indexOf("    'sops-setup': (path = '', options = DEFAULT_OPTION) => {");
    const body = runSource.slice(start, runSource.indexOf('\n    /**', start));

    it('does not report a manifest it cannot decrypt as onboarded', () => {
      expect(start, 'sops-setup runner not found').to.be.greaterThan(-1);
      expect(body).to.include('Underpost.secret.sops.decryptable(');
      expect(body).to.include('sealed to an Age recipient this host does not hold');
    });

    it('warns when --force replaces a stored credential with a generated one', () => {
      expect(body).to.include('generated while replacing the stored manifest');
    });
  });

  describe('rotation safeguards', () => {
    const secretsSource = fs.readFileSync(new URL('../src/cli/secrets.js', import.meta.url), 'utf8');

    it('refuses to revoke recipients without an explicit confirmation', () => {
      expect(secretsSource).to.include('Refusing to revoke ');
      expect(secretsSource).to.include('!options.force');
    });

    it('verifies each manifest carries the new recipient after updatekeys', () => {
      expect(secretsSource).to.include('is still sealed to ');
    });

    it('supports retaining named recipients through a prune', () => {
      expect(secretsSource).to.include('options.keepRecipients');
    });

    it('refuses to plan a rotation the local key could never perform', () => {
      // updatekeys has to decrypt each data key first, so a host that cannot read the store cannot
      // rotate it — including on a dry run, where a reported plan would be pure misdirection.
      const start = secretsSource.indexOf('      rotate(recipient, options = {}) {');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n      /**', start));
      expect(body).to.include('assertDecryptable(manifests)');
      expect(body.indexOf('assertDecryptable(manifests)')).to.be.lessThan(body.indexOf('if (options.dryRun)'));
    });
  });

  describe('encrypt write safety', () => {
    const secretsSource = fs.readFileSync(new URL('../src/cli/secrets.js', import.meta.url), 'utf8');

    it('stages and moves rather than redirecting straight onto the target', () => {
      const start = secretsSource.indexOf('      encrypt(plaintextPath, namespace');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n      /**', start));
      expect(body).to.include('.staged');
      expect(body).to.include('fs.moveSync');
      expect(body).to.include('assertManifest');
    });

    it('refuses to double-encrypt an already-encrypted source', () => {
      expect(secretsSource).to.include('already carries sops metadata');
    });

    it('refuses to clobber an existing manifest without force', () => {
      expect(secretsSource).to.include('already exists. Edit it with');
    });
  });
});
