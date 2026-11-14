'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import Underpost from '../../../../src/index.js';
import UnderpostBaremetal from '../../../../src/cli/baremetal.js';
import UnderpostRepository from '../../../../src/cli/repository.js';
import UnderpostState from '../../../../src/cli/state.js';
import { shellHarness } from '../../../support/shell-harness.js';
import { scopeValuesFactory } from '../../../../src/server/runtime/config-scope.js';

const sops = () => Underpost.secret;
const CRON_ID_PATH = './engine-private/deploy/dd.cron';
const SECRETS_DIR = './engine-private/secrets';
const RECIPIENT = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p';
// The key path is resolved from the environment exactly as sops resolves it, so
// a host that already exports one would otherwise decide where these cases look.
const KEY_FILE = '/tmp/underpost-secret-fixture/keys.txt';

const pinKeyFile = () => {
  const previous = process.env.SOPS_AGE_KEY_FILE;
  process.env.SOPS_AGE_KEY_FILE = KEY_FILE;
  return () => {
    if (previous === undefined) delete process.env.SOPS_AGE_KEY_FILE;
    else process.env.SOPS_AGE_KEY_FILE = previous;
  };
};

// The store, the key file and the cron deploy env all live under paths this
// checkout may or may not carry, and every apply reaches a live cluster. The
// suite fixes both boundaries so what is asserted is the command vector and the
// files a run would write.
const secretFixture = (files = {}) => {
  const table = new Map(Object.entries(files));
  const written = new Map();
  const removed = [];
  const keys = () => [...table.keys(), ...written.keys()];

  vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    if (removed.includes(key)) return false;
    return table.has(key) || written.has(key) || keys().some((entry) => entry.startsWith(`${key}/`));
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    if (written.has(key)) return written.get(key);
    if (table.has(key)) return table.get(key);
    throw Object.assign(new Error(`ENOENT: ${key}`), { code: 'ENOENT' });
  });
  vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));
  vi.spyOn(fs, 'outputFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));
  vi.spyOn(fs, 'removeSync').mockImplementation((filePath) => {
    written.delete(`${filePath}`);
    removed.push(`${filePath}`);
  });
  vi.spyOn(fs, 'ensureDirSync').mockImplementation(() => undefined);
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  vi.spyOn(fs, 'mkdtempSync').mockImplementation((prefix) => `${prefix}fixture`);
  vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);
  vi.spyOn(fs, 'moveSync').mockImplementation((src, dest) => {
    written.set(`${dest}`, written.get(`${src}`) ?? table.get(`${src}`) ?? '');
    written.delete(`${src}`);
  });
  const isDirectory = (path) =>
    !removed.includes(path) &&
    !table.has(path) &&
    !written.has(path) &&
    keys().some((entry) => entry.startsWith(`${path}/`));
  vi.spyOn(fs, 'statSync').mockImplementation((filePath) => ({
    mode: 0o600,
    isDirectory: () => isDirectory(`${filePath}`),
  }));
  vi.spyOn(fs, 'readdirSync').mockImplementation((dir) => [
    ...new Set(
      keys()
        .filter((filePath) => filePath.startsWith(`${dir}/`) && !removed.includes(filePath))
        .map((filePath) => filePath.slice(`${dir}/`.length).split('/')[0]),
    ),
  ]);
  return { table, written, removed };
};

const encryptedManifest = ({ name, namespace, recipients = [RECIPIENT] }) =>
  [
    'apiVersion: v1',
    'kind: Secret',
    'metadata:',
    `    name: ${name}`,
    ...(namespace ? [`    namespace: ${namespace}`] : []),
    'type: Opaque',
    'stringData:',
    '    password: ENC[AES256_GCM,data:Lm8xQ2vT,iv:3fB7,tag:2cF5,type:str]',
    'sops:',
    '    age:',
    ...recipients.flatMap((recipient) => [`        - recipient: ${recipient}`, '          enc: |', '            key']),
    '    encrypted_regex: ^(data|stringData)$',
    '    version: 3.10.2',
    '',
  ].join('\n');

describe('grafana administrator credentials', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the administrator out of the cron deploy environment', () => {
    secretFixture({
      [CRON_ID_PATH]: 'dd-cron',
      './engine-private/conf/dd-cron/.env.production':
        'GF_SECURITY_ADMIN_USER=admin\nGF_SECURITY_ADMIN_PASSWORD=secret\nGF_SECURITY_ADMIN_EMAIL=ops@fixture.test\n',
    });
    expect(Underpost.host.grafanaAdmin()).to.include({
      username: 'admin',
      password: 'secret',
      email: 'ops@fixture.test',
    });
  });

  it('reads the development environment when asked', () => {
    secretFixture({
      [CRON_ID_PATH]: 'dd-cron',
      './engine-private/conf/dd-cron/.env.development': 'GF_SECURITY_ADMIN_USER=dev\nGF_SECURITY_ADMIN_PASSWORD=p\n',
    });
    expect(Underpost.host.grafanaAdmin({ dev: true }).username).to.equal('dev');
  });

  it('names the missing keys and the file they belong in', () => {
    secretFixture({ [CRON_ID_PATH]: 'dd-cron' });
    expect(() => Underpost.host.grafanaAdmin()).to.throw('GF_SECURITY_ADMIN_USER, GF_SECURITY_ADMIN_PASSWORD');
  });

  it('reports the empty credentials when they are not required', () => {
    secretFixture({});
    expect(Underpost.host.grafanaAdmin({ required: false })).to.include({ username: '', password: '' });
  });
});

describe('host configuration store', () => {
  let cleaned;
  let set;

  beforeEach(() => {
    cleaned = vi.spyOn(Underpost.host.store, 'clean').mockImplementation(() => undefined);
    set = vi.spyOn(Underpost.host.store, 'set').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('replaces the store with the cron deploy host configuration', () => {
    secretFixture({ [CRON_ID_PATH]: 'dd-cron', './engine-private/conf/dd-cron/.env.production': 'A=1\nB=2\n' });
    const result = Underpost.host.load();
    expect(cleaned.mock.calls.length).to.equal(1);
    expect(set.mock.calls.map(([key, value]) => `${key}=${value}`)).to.deep.equal(['A=1', 'B=2']);
    expect(result).to.deep.equal({ source: './engine-private/conf/dd-cron/.env.production', keys: 2 });
  });

  it('targets an environment through the shared --env selector', () => {
    secretFixture({ './engine-private/conf/dd-cron/.env.development': 'A=dev\n' });
    expect(Underpost.host.load({ env: 'development' }).source).to.equal(
      './engine-private/conf/dd-cron/.env.development',
    );
    expect(set.mock.calls[0][1]).to.equal('dev');
  });

  it('is idempotent: repeating the load rebuilds the store rather than accumulating', () => {
    secretFixture({ './engine-private/conf/dd-cron/.env.production': 'A=1\n' });
    const first = Underpost.host.load();
    const second = Underpost.host.load();
    expect(second).to.deep.equal(first);
    expect(cleaned.mock.calls.length).to.equal(2);
  });

  it('changes nothing under the shared --dry-run flag', () => {
    secretFixture({ './engine-private/conf/dd-cron/.env.production': 'A=1\n' });
    const result = Underpost.host.load({ dryRun: true });
    expect(result.keys).to.equal(1);
    expect(cleaned.mock.calls.length).to.equal(0);
    expect(set.mock.calls.length).to.equal(0);
  });

  // Inside a workload container `engine-private` is not cloned yet, so the same host
  // configuration arrives as the injected container environment instead of a file. The
  // process environment there also carries the runtime's own PATH and the Kubernetes vars.
  it('falls back to the injected container environment when no host config file exists', () => {
    secretFixture({});
    const previous = { ...process.env };
    process.env.FIXTURE_SECRET_KEY = 'value';
    process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
    try {
      expect(Underpost.host.load().source).to.equal('container-env');
      const captured = Object.fromEntries(set.mock.calls);
      expect(captured.FIXTURE_SECRET_KEY).to.equal('value');
      expect(captured).not.to.have.property('PATH');
      expect(captured).not.to.have.property('HOME');
      expect(captured).not.to.have.property('KUBERNETES_SERVICE_HOST');
    } finally {
      process.env = previous;
    }
  });
});

describe('application deployment environment', () => {
  let cleaned;
  let set;

  beforeEach(() => {
    cleaned = vi.spyOn(Underpost.host.store, 'clean').mockImplementation(() => undefined);
    set = vi.spyOn(Underpost.host.store, 'set').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('selects a deployment env file from the environment selector alone', () => {
    secretFixture({ './engine-private/conf/dd-core/.env.development': 'A=1\n' });
    expect(Underpost.app.envPath({ env: 'development', args: { 'deploy-id': 'dd-core' } })).to.equal(
      './engine-private/conf/dd-core/.env.development',
    );
  });

  it('prefers a sub-configuration variant only when that file exists', () => {
    secretFixture({
      './engine-private/conf/dd-core/.env.development': 'A=1\n',
      './engine-private/conf/dd-core/.env.development.nexodev-dev-api': 'A=2\n',
    });
    expect(
      Underpost.app.envPath({ env: 'development', args: { 'deploy-id': 'dd-core', 'sub-conf': 'nexodev-dev-api' } }),
    ).to.equal('./engine-private/conf/dd-core/.env.development.nexodev-dev-api');

    secretFixture({ './engine-private/conf/dd-core/.env.development': 'A=1\n' });
    expect(
      Underpost.app.envPath({ env: 'development', args: { 'deploy-id': 'dd-core', 'sub-conf': 'absent' } }),
    ).to.equal('./engine-private/conf/dd-core/.env.development');
  });

  it('is deterministic: the same selector resolves the same file every time', () => {
    secretFixture({ './engine-private/conf/dd-core/.env.production': 'A=1\n' });
    const context = { env: 'production', args: { 'deploy-id': 'dd-core' }, dryRun: true };
    const first = Underpost.app.load(context);
    const second = Underpost.app.load(context);
    expect(second).to.deep.equal(first);
    expect(first.source).to.equal('./engine-private/conf/dd-core/.env.production');
  });

  it('materializes the working tree and leaves the host configuration store alone', () => {
    // Regression: `app load` used to rebuild the host configuration store, which is host-scoped.
    // Running it after `host load` erased the node's own configuration, container-status included.
    const appSource = fs.readFileSync(new URL('../../../../src/cli/app.js', import.meta.url), 'utf8');
    const loadBody = appSource.slice(
      appSource.indexOf('    load(context = {}) {'),
      appSource.indexOf('    publish(context = {}) {'),
    );
    expect(loadBody).to.include('loadConf(deployId');
    expect(loadBody).to.not.include('Underpost.host.store.clean()');
    expect(loadBody).to.not.include('Underpost.host.store.set(');
  });

  it('names the missing file instead of silently loading nothing', () => {
    secretFixture({});
    expect(() => Underpost.app.load({ env: 'production', args: { 'deploy-id': 'dd-core' } })).to.throw(
      'deployment environment not found',
    );
  });

  it('resolves the deployment id from context when none is given', () => {
    secretFixture({});
    const previous = process.env.DEPLOY_ID;
    process.env.DEPLOY_ID = 'dd-from-context';
    try {
      expect(Underpost.app.deployId()).to.equal('dd-from-context');
      expect(Underpost.app.envPath({ env: 'development' })).to.equal(
        './engine-private/conf/dd-from-context/.env.development',
      );
    } finally {
      if (previous === undefined) delete process.env.DEPLOY_ID;
      else process.env.DEPLOY_ID = previous;
    }
  });
});

describe('underpost-config secret', () => {
  afterEach(() => vi.restoreAllMocks());

  it('strips the keys that would override the image own runtime', () => {
    const sanitized = Underpost.host.sanitizeEnvFile(
      ['# comment', '', 'PATH=/usr/bin', 'HOME=/root', 'NODE_ENV=production', 'APP_SECRET=value', 'malformed'].join(
        '\n',
      ),
    );
    expect(sanitized.split('\n')).to.deep.equal([
      '# comment',
      '',
      'NODE_ENV=production',
      'APP_SECRET=value',
      'malformed',
    ]);
  });

  it('resolves the env file the cron deploy publishes', () => {
    secretFixture({ [CRON_ID_PATH]: 'dd-fixture-cron' });
    expect(Underpost.host.envPath('production')).to.equal('./engine-private/conf/dd-fixture-cron/.env.production');
  });

  it('republishes the secret from a sanitized copy staged on tmpfs, then removes it', () => {
    // Staged off tmpfs rather than beside the source: the source composes from one file per
    // scope once the migration has run, and there is no longer one file to stage next to.
    const harness = shellHarness();
    const stagedPath = '/dev/shm/underpost-host-apply/ops.env';
    const { written, removed } = secretFixture({
      [CRON_ID_PATH]: 'dd-cron',
      './engine-private/conf/dd-cron/.env.production': 'PATH=/usr/bin\nAPP_SECRET=value\n',
    });
    try {
      Underpost.host.apply({ env: 'production', namespace: 'ops' });
      expect(harness.ran('kubectl delete secret underpost-config -n ops --ignore-not-found')).to.equal(true);
      expect(harness.ran(`--from-env-file=${stagedPath}`)).to.equal(true);
      expect(removed).to.include(stagedPath);
      expect(written.has(stagedPath)).to.equal(false);
    } finally {
      harness.restore();
    }
  });

  it('names the env file it could not find', () => {
    secretFixture({ [CRON_ID_PATH]: 'dd-cron' });
    expect(() => Underpost.host.apply()).to.throw('configuration source not found');
  });

  it('clears the host configuration store and leaves container state untouched', () => {
    // Container runtime state has its own store, so the clean needs no carve-out for it.
    const clean = vi.spyOn(Underpost.host.store, 'clean').mockImplementation(() => undefined);
    const stateClean = vi.spyOn(UnderpostState.API, 'clean').mockImplementation(() => undefined);
    vi.spyOn(UnderpostRepository.API, 'cleanupPrivateEngineRepo').mockImplementation(() => undefined);
    Underpost.host.clean({ args: {} });
    expect(clean.mock.calls.length).to.equal(1);
    expect(clean.mock.calls[0][0]).to.equal(undefined);
    expect(stateClean.mock.calls.length).to.equal(0);
  });
});

describe('host tooling', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
    vi.spyOn(UnderpostBaremetal.API, 'getHostArch').mockReturnValue({ arch: 'x86_64', alias: 'amd64' });
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  it('reports a binary on PATH', () => {
    harness.route({ match: 'command -v', code: 0, stdout: 'missing\n' });
    harness.route({ match: 'command -v sops ', code: 0, stdout: 'exists\n' });
    expect(sops().hasBinary('sops')).to.equal(true);
    expect(sops().hasBinary('age')).to.equal(false);
  });

  // An opaque shell exit code mid-apply is what this replaces.
  it('names the missing binary and the command that installs it', () => {
    harness.route({ match: 'command -v', code: 0, stdout: 'missing\n' });
    expect(() => sops().assertTooling(['sops'])).to.throw('underpost secret --install-tools');
  });

  it('installs both binaries from their pinned upstream builds', () => {
    harness.route({ match: 'command -v', code: 0, stdout: 'missing\n' });
    // The post-install assertion reads them back as present.
    let installed = false;
    harness.route({
      match: (command) => command.includes('command -v') && installed,
      code: 0,
      stdout: 'exists\n',
    });
    harness.route({
      match: (command) => {
        if (command.includes("ln -sfn -- '/usr/local/bin/age-keygen'")) installed = true;
        return false;
      },
    });

    expect(sops().installTooling()).to.deep.equal({ sops: true, age: true });
    expect(harness.ran('getsops/sops/releases/download')).to.equal(true);
    expect(harness.ran('FiloSottile/age/releases/download')).to.equal(true);
    // Each binary installs for every user from a private scratch directory, never a fixed /tmp path.
    expect(
      harness.ran(/install -D -m 0755 -o root -g root '.*underpost-tooling-\w+\/sops' '\/usr\/local\/bin\/sops'/),
    ).to.equal(true);
    expect(harness.ran(/FiloSottile.*\| tar -xzf - -C .*underpost-tooling-/)).to.equal(true);
    expect(harness.ran('/tmp/sops')).to.equal(false);
  });

  it('installs nothing on a host that already has both', () => {
    harness.route({ match: 'command -v', code: 0, stdout: 'exists\n' });
    expect(sops().installTooling()).to.deep.equal({ sops: false, age: false });
    expect(harness.ran('curl')).to.equal(false);
  });

  it('fails loudly when an install left a binary unresolvable', () => {
    harness.route({ match: 'command -v', code: 0, stdout: 'missing\n' });
    expect(() => sops().installTooling()).to.throw('not found in PATH');
  });
});

const RULES = `creation_rules:\n  - path_regex: .*\\.enc\\.yaml$\n    age: ${RECIPIENT}\n`;
const KEY = `# public key: ${RECIPIENT}\nAGE-SECRET-KEY-FIXTURE\n`;
const stored = (scope, resource, id) => `${SECRETS_DIR}/${scope}/${resource}/${id}.enc.yaml`;
const SEAL_DIR = `/dev/shm/underpost-seal-${process.pid}`;

/** The secret source each resource takes, as conf.cluster.json would declare it; `seed` otherwise. */
const declare = (sources = {}) =>
  vi.spyOn(Underpost.namespace, 'secretSource').mockImplementation(({ resource }) => sources[resource] ?? 'seed');

/** A shell where sops, age and the key file exist; the node holds no role unless a case gives it one. */
const storeShell = () => {
  const harness = shellHarness([
    { match: 'command -v', code: 0, stdout: 'exists\n' },
    { match: 'age-keygen -y', code: 0, stdout: `${RECIPIENT}\n` },
  ]);
  vi.spyOn(Underpost.wireguard, 'localRole').mockReturnValue('');
  return harness;
};

/** Answers the decrypt of each manifest with its data, as `sops --output-type json` prints it. */
const decrypting = (harness, table) =>
  harness.route({
    match: (command) => command.includes('sops --decrypt --output-type json'),
    get stdout() {
      const path = Object.keys(table).find((key) => harness.calls.at(-1).includes(`"${key}"`));
      return JSON.stringify({ kind: 'Secret', stringData: table[path] });
    },
  });

/** Writes the staged encrypted output of each encrypt, as sops would. */
const sealing = (harness, written) =>
  harness.route({
    match: (command) => {
      const [, path] = /--filename-override "([^"]+)"/.exec(command) ?? [];
      if (path) {
        const name = /^\s+name: (\S+)/m.exec(
          [...written.values()].findLast((value) => value.includes('kind: Secret')),
        )?.[1];
        written.set(`${path}.staged`, encryptedManifest({ name }));
      }
      return false;
    },
  });

describe('the encrypted store', () => {
  let harness;
  let restoreKeyFile;

  beforeEach(() => {
    harness = storeShell();
    restoreKeyFile = pinKeyFile();
  });

  afterEach(() => {
    restoreKeyFile();
    harness.restore();
    vi.restoreAllMocks();
  });

  const storeFixture = (files = {}) =>
    secretFixture({ [`${SECRETS_DIR}/.sops.yaml`]: RULES, [KEY_FILE]: KEY, ...files });

  it('keys a manifest by environment, resource and id, never by namespace', () => {
    declare({ mariadb: 'shared' });
    const mongodb = sops().reference('mongodb/credentials');
    expect(mongodb).to.deep.equal({ resource: 'mongodb', id: 'credentials', name: 'mongodb-secret' });
    expect(sops().manifestPath(mongodb, 'production')).to.equal(stored('production', 'mongodb', 'credentials'));
    expect(sops().manifestPath(mongodb, 'development')).to.equal(stored('development', 'mongodb', 'credentials'));
    expect(sops().manifestPath(sops().reference('mariadb/credentials'), 'test')).to.equal(
      stored('shared', 'mariadb', 'credentials'),
    );
    expect(() => sops().reference('mongodb-secret')).to.throw('names no Secret of the catalog');
  });

  it('reads the recipients a manifest is sealed to without any private key', () => {
    const other = 'age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn';
    const path = stored('production', 'mongodb', 'credentials');
    storeFixture({ [path]: encryptedManifest({ name: 'mongodb-secret', recipients: [RECIPIENT, other] }) });
    expect(sops().manifestRecipients(path)).to.deep.equal([RECIPIENT, other]);
  });

  it('refuses to encrypt a missing manifest, without creation rules, twice, or with a namespace', () => {
    const out = stored('production', 'mongodb', 'credentials');
    const name = 'mongodb-secret';
    storeFixture({
      '/dev/shm/sealed.yaml': encryptedManifest({ name }),
      '/dev/shm/placed.yaml': `apiVersion: v1\nkind: Secret\nmetadata:\n  name: ${name}\n  namespace: default\n`,
    });
    expect(() => sops().encrypt('/dev/shm/absent.yaml', out, { name })).to.throw('Plaintext manifest not found');
    expect(() => sops().encrypt('/dev/shm/sealed.yaml', out, { name })).to.throw('already carries sops metadata');
    expect(() => sops().encrypt('/dev/shm/placed.yaml', out, { name })).to.throw('names the namespace default');
    // A store without its creation rules; the shell harness still answers.
    secretFixture({ '/dev/shm/app.yaml': 'kind: Secret\n' });
    expect(() => sops().encrypt('/dev/shm/app.yaml', out, { name })).to.throw('Missing creation rules');
  });

  it('refuses to replace a stored manifest without --force', () => {
    const out = stored('production', 'mongodb', 'credentials');
    storeFixture({
      '/dev/shm/app.yaml': 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: mongodb-secret\n',
      [out]: encryptedManifest({ name: 'mongodb-secret' }),
    });
    expect(() => sops().encrypt('/dev/shm/app.yaml', out, { name: 'mongodb-secret' })).to.throw(
      'pass --force to replace',
    );
  });

  // A bare `sops … > out` truncates the destination before sops runs.
  it('seals data through a staged file on tmpfs, without a namespace, and shreds the plaintext', () => {
    const out = stored('production', 'mongodb', 'credentials');
    const { written, removed } = storeFixture();
    sealing(harness, written);
    expect(sops().seal({ path: out, name: 'mongodb-secret', data: { password: "it's" } })).to.equal(out);
    const plaintext = written.get(`${SEAL_DIR}/mongodb-secret.yaml`);
    expect(plaintext).to.include("password: 'it''s'");
    expect(plaintext).to.not.include('namespace:');
    expect(harness.ran(`--filename-override "${out}"`)).to.equal(true);
    expect(harness.ran(`shred -u "${SEAL_DIR}/mongodb-secret.yaml"`)).to.equal(true);
    expect(written.get(out)).to.include('sops:');
    expect(removed).to.include(SEAL_DIR);
    expect(harness.calls.join('\n')).to.not.include("it's");
  });

  it('refuses a stored manifest that names a namespace', () => {
    const path = stored('production', 'mongodb', 'credentials');
    storeFixture({ [path]: encryptedManifest({ name: 'mongodb-secret', namespace: 'default' }) });
    expect(() => sops().assertManifest(path, { name: 'mongodb-secret' })).to.throw('names the namespace default');
  });

  // Applying in one pass means manifest N failing leaves 1..N-1 already live.
  it('applies one logical Secret into the namespace each placement names, dry-running every one first', () => {
    declare({ mongodb: 'sops' });
    storeFixture({
      [stored('production', 'mongodb', 'credentials')]: encryptedManifest({ name: 'mongodb-secret' }),
      [stored('production', 'mongodb', 'keyfile')]: encryptedManifest({ name: 'mongodb-keyfile' }),
    });
    const placement = vi.spyOn(Underpost.namespace, 'of').mockReturnValue('underpost-data');
    expect(sops().applyStore({ environment: 'production' })).to.equal(2);
    const applies = harness.calls.filter((command) => command.includes('kubectl apply -f -'));
    expect(applies.map((command) => command.includes('--dry-run=server'))).to.deep.equal([true, true, false, false]);
    expect(applies.every((command) => command.includes('-n "underpost-data"'))).to.equal(true);
    harness.calls.length = 0;
    placement.mockReturnValue('dd-data');
    sops().applyStore({ environment: 'production', secrets: [sops().reference('mongodb/keyfile')] });
    expect(harness.ran('sops --decrypt "./engine-private/secrets/production/mongodb/keyfile.enc.yaml"')).to.equal(true);
    expect(harness.ran('-n "dd-data"')).to.equal(true);
  });

  it('stops before any change when a stored resource lacks a manifest', () => {
    declare({ mongodb: 'sops' });
    storeFixture({ [stored('production', 'mongodb', 'credentials')]: encryptedManifest({ name: 'mongodb-secret' }) });
    expect(() => sops().applyStore({ environment: 'production' })).to.throw(
      'the store of production lacks production/mongodb/keyfile, and no Secret changed',
    );
    expect(harness.ran('kubectl apply')).to.equal(false);
  });

  it('provides each resource from its declared source, and never seeds a stored one', () => {
    declare({ mongodb: 'sops', mariadb: 'seed', postgresql: 'unmanaged' });
    storeFixture({ [stored('production', 'mongodb', 'credentials')]: encryptedManifest({ name: 'mongodb-secret' }) });
    const seeded = vi.spyOn(sops(), 'applyFromOriginSeed').mockReturnValue(true);
    expect(sops().provide({ resource: 'mariadb', namespace: 'db', options: { env: 'production' } })).to.deep.equal({
      source: 'seed',
      namespace: 'db',
      secrets: ['mariadb-secret'],
    });
    expect(seeded.mock.calls).to.deep.equal([['mariadb-secret', 'db', 'production']]);
    expect(sops().provide({ resource: 'postgresql', namespace: 'db' }).source).to.equal('unmanaged');
    expect(() => sops().provide({ resource: 'mongodb', namespace: 'db' })).to.throw('lacks production/mongodb/keyfile');
    expect(seeded.mock.calls.length).to.equal(1);
    expect(harness.ran('kubectl')).to.equal(false);
  });

  it('isolates the credentials of each environment', () => {
    declare({ mongodb: 'sops' });
    storeFixture({
      [stored('development', 'mongodb', 'credentials')]: encryptedManifest({ name: 'mongodb-secret' }),
      [stored('development', 'mongodb', 'keyfile')]: encryptedManifest({ name: 'mongodb-keyfile' }),
    });
    expect(sops().applyStore({ environment: 'development', namespace: 'default' })).to.equal(2);
    expect(() => sops().applyStore({ environment: 'production', namespace: 'default' })).to.throw(
      'lacks production/mongodb/credentials, production/mongodb/keyfile',
    );
  });

  it('refuses a role without secret administration on the production cluster only', () => {
    declare({ mongodb: 'sops' });
    storeFixture({
      [stored('production', 'mongodb', 'credentials')]: encryptedManifest({ name: 'mongodb-secret' }),
      [stored('production', 'mongodb', 'keyfile')]: encryptedManifest({ name: 'mongodb-keyfile' }),
      [stored('development', 'mongodb', 'credentials')]: encryptedManifest({ name: 'mongodb-secret' }),
      [stored('development', 'mongodb', 'keyfile')]: encryptedManifest({ name: 'mongodb-keyfile' }),
    });
    Underpost.wireguard.localRole.mockReturnValue('worker');
    expect(() => sops().applyStore({ environment: 'production', namespace: 'default' })).to.throw(
      "requires 'cluster-secret-administration', which the 'worker' role does not hold",
    );
    expect(sops().applyStore({ environment: 'development', namespace: 'default' })).to.equal(2);
  });

  it('decrypts one Secret into memory through sops alone', () => {
    declare({ mongodb: 'sops' });
    const path = stored('production', 'mongodb', 'credentials');
    storeFixture({ [path]: encryptedManifest({ name: 'mongodb-secret' }) });
    harness.route({
      match: 'sops --decrypt --output-type json',
      stdout: JSON.stringify({
        data: { password: Buffer.from('s3cr3t').toString('base64') },
        stringData: { username: 'admin' },
      }),
    });
    expect(sops().readData(sops().reference('mongodb/credentials'), 'production')).to.deep.equal({
      password: 's3cr3t',
      username: 'admin',
    });
    expect(harness.ran('kubectl')).to.equal(false);
  });

  it('lists the manifests of every scope, and none of the archive', () => {
    storeFixture({
      [stored('production', 'mongodb', 'credentials')]: encryptedManifest({ name: 'mongodb-secret' }),
      [stored('external', 'github', 'git-auth-token')]: encryptedManifest({ name: 'git-auth-token' }),
      [`${SECRETS_DIR}/.archive/legacy/default/mongodb-secret.x.enc.yaml`]: encryptedManifest({
        name: 'mongodb-secret',
      }),
    });
    expect(
      sops()
        .manifests()
        .map(({ scope, owner, id }) => `${scope}/${owner}/${id}`),
    ).to.deep.equal(['production/mongodb/credentials', 'external/github/git-auth-token']);
    expect(() => sops().list()).not.to.throw();
  });
});

describe('secret onboarding', () => {
  let harness;
  let restoreKeyFile;
  let declared;
  let applied;

  beforeEach(() => {
    harness = storeShell();
    restoreKeyFile = pinKeyFile();
    vi.spyOn(UnderpostBaremetal.API, 'getHostArch').mockReturnValue({ arch: 'x86_64', alias: 'amd64' });
    vi.spyOn(sops(), 'init').mockReturnValue(undefined);
    applied = vi.spyOn(sops(), 'applyStore').mockReturnValue(1);
    declared = vi.spyOn(Underpost.namespace, 'declareSecretSources').mockReturnValue('backup');
  });

  afterEach(() => {
    restoreKeyFile();
    harness.restore();
    vi.restoreAllMocks();
  });

  const onboardFixture = (files = {}) => {
    const fixture = secretFixture({
      [`${SECRETS_DIR}/.sops.yaml`]: RULES,
      [KEY_FILE]: KEY,
      [CRON_ID_PATH]: 'dd-cron',
      ...files,
    });
    sealing(harness, fixture.written);
    return fixture;
  };

  it('pins the resolved key path so a non-interactive run can decrypt', () => {
    const { written } = onboardFixture();
    sops().setupStore('postgresql/credentials', {});
    const [, profile] = [...written].find(([path]) => path.includes('underpost-host-file-'));
    expect(profile).to.include(KEY_FILE);
    expect(harness.ran(/install -D -m 0644 .* .*\/etc\/profile\.d\/underpost-sops\.sh/)).to.equal(true);
  });

  it('takes a data key from its origin seed', () => {
    const { written } = onboardFixture({ './engine-private/mariadb-password': ' fromSeedFile \n' });
    sops().setupStore('mariadb/credentials', {});
    expect(written.get(`${SEAL_DIR}/mariadb-secret.yaml`)).to.include("password: 'fromSeedFile'");
  });

  it('takes a data key from --args when nothing seeded it', () => {
    const { written } = onboardFixture();
    sops().setupStore('postgresql/credentials', { args: ['password=fromArgs'] });
    expect(written.get(`${SEAL_DIR}/postgres-secret.yaml`)).to.include("password: 'fromArgs'");
  });

  it('generates a value when nothing else supplies one', () => {
    const { written } = onboardFixture();
    sops().setupStore('postgresql/credentials', {});
    expect(written.get(`${SEAL_DIR}/postgres-secret.yaml`)).to.match(/password: '.+'/);
  });

  it('keeps a stored manifest, readable or not, and replaces it under --force', () => {
    onboardFixture({
      [stored('production', 'postgresql', 'credentials')]: encryptedManifest({
        name: 'postgres-secret',
        recipients: ['age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn'],
      }),
    });
    sops().setupStore('postgresql/credentials', {});
    expect(harness.ran('--filename-override')).to.equal(false);
    sops().setupStore('postgresql/credentials', { force: true });
    expect(harness.ran('--filename-override')).to.equal(true);
  });

  it('onboards the data tier of an environment, then declares and applies it', () => {
    onboardFixture();
    expect(sops().setupStore('', { environment: 'production' })).to.deep.equal({
      secrets: ['postgresql/credentials', 'mariadb/credentials', 'mongodb/credentials', 'mongodb/keyfile'],
      declared: { postgresql: 'sops', mariadb: 'sops', mongodb: 'sops' },
    });
    expect(harness.count('--filename-override')).to.equal(4);
    expect(harness.ran(`"${stored('production', 'mongodb', 'keyfile')}"`)).to.equal(true);
    expect(declared.mock.calls).to.deep.equal([
      [{ environment: 'production', sources: { postgresql: 'sops', mariadb: 'sops', mongodb: 'sops' } }],
    ]);
    expect(applied.mock.calls[0][0].secrets.map(({ path }) => path)).to.include(
      stored('production', 'mongodb', 'keyfile'),
    );
  });

  it('stores shared Secrets in the shared scope and declares them shared', () => {
    onboardFixture();
    sops().setupStore('mariadb/credentials', { environment: 'test', shared: true });
    expect(harness.ran(`"${stored('shared', 'mariadb', 'credentials')}"`)).to.equal(true);
    expect(declared.mock.calls[0][0]).to.deep.equal({ environment: 'test', sources: { mariadb: 'shared' } });
  });

  it('refuses half a resource: it takes all its Secrets from one source', () => {
    onboardFixture();
    expect(() => sops().setupStore('mongodb/credentials', {})).to.throw('name mongodb/keyfile too');
    expect(harness.ran('--filename-override')).to.equal(false);
  });

  it('validates without changing the configuration or the cluster under --dry-run', () => {
    onboardFixture();
    sops().setupStore('postgresql/credentials', { dryRun: true });
    expect(applied.mock.calls.map(([params]) => params.dryRun)).to.deep.equal([true]);
    expect(declared.mock.calls).to.deep.equal([]);
  });

  it('removes the shared-memory staging directory even when a step throws', () => {
    const { removed } = onboardFixture();
    harness.route({ match: 'sops --config', throws: new Error('sops refused') });
    expect(() => sops().setupStore('postgresql/credentials', {})).to.throw('sops refused');
    expect(removed).to.include(SEAL_DIR);
  });
});

describe('the namespace-keyed store', () => {
  let harness;
  let restoreKeyFile;
  let declared;

  beforeEach(() => {
    harness = storeShell();
    restoreKeyFile = pinKeyFile();
    declared = vi.spyOn(Underpost.namespace, 'declareSecretSources').mockReturnValue('backup');
  });

  afterEach(() => {
    restoreKeyFile();
    harness.restore();
    vi.restoreAllMocks();
  });

  const legacy = (name) => `${SECRETS_DIR}/default/${name}.enc.yaml`;
  const DATA = {
    [legacy('mongodb-secret')]: { username: 'root', password: 'pw' },
    [legacy('mongodb-keyfile')]: { 'mongodb-keyfile': 'key' },
    [legacy('grafana-admin')]: { 'admin-user': 'admin', 'admin-password': 'gpw' },
  };
  const legacyFixture = (extra = {}) => {
    const fixture = secretFixture({
      [`${SECRETS_DIR}/.sops.yaml`]: RULES,
      [KEY_FILE]: KEY,
      ...Object.fromEntries(
        Object.keys(DATA).map((path) => [
          path,
          encryptedManifest({ name: path.split('/').pop().slice(0, -9), namespace: 'default' }),
        ]),
      ),
      ...extra,
    });
    sealing(harness, fixture.written);
    return fixture;
  };

  it('plans the move without writing on a dry run', () => {
    const { written } = legacyFixture();
    expect(sops().migrateLegacyStore({ environment: 'production', dryRun: true }).moved).to.deep.equal([]);
    expect([...written.keys()]).to.deep.equal([]);
    expect(declared.mock.calls).to.deep.equal([]);
  });

  it('moves each manifest without its namespace, verifies it, archives the original and declares the resources', () => {
    const { written } = legacyFixture();
    decrypting(harness, {
      ...DATA,
      [stored('production', 'mongodb', 'credentials')]: DATA[legacy('mongodb-secret')],
      [stored('production', 'mongodb', 'keyfile')]: DATA[legacy('mongodb-keyfile')],
      [stored('production', 'observability', 'grafana-admin')]: DATA[legacy('grafana-admin')],
    });
    const result = sops().migrateLegacyStore({ environment: 'production' });
    expect(result.moved).to.deep.equal([
      'production/observability/grafana-admin',
      'production/mongodb/keyfile',
      'production/mongodb/credentials',
    ]);
    expect(written.get(`${SEAL_DIR}/mongodb-secret.yaml`) ?? '').to.not.include('namespace');
    expect(
      [...written.keys()].filter((path) => path.startsWith(`${SECRETS_DIR}/.archive/legacy/default/`)),
    ).to.have.length(3);
    expect(declared.mock.calls).to.deep.equal([
      [{ environment: 'production', sources: { observability: 'sops', mongodb: 'sops' } }],
    ]);
    expect(harness.calls.join('\n')).to.not.include('gpw');
  });

  it('refuses a name the catalog does not know, or one Secret in two namespaces, before it writes', () => {
    const { written } = legacyFixture({
      [`${SECRETS_DIR}/default/unknown-secret.enc.yaml`]: encryptedManifest({ name: 'unknown-secret' }),
      [`${SECRETS_DIR}/ops/mongodb-secret.enc.yaml`]: encryptedManifest({ name: 'mongodb-secret' }),
    });
    expect(() => sops().migrateLegacyStore({ environment: 'production' })).to.throw(
      'default/unknown-secret names no Secret of the catalog; mongodb-secret is stored in more than one namespace',
    );
    expect([...written.keys()]).to.deep.equal([]);
  });

  it('keeps the original when the new manifest does not hold its data', () => {
    const { written } = legacyFixture();
    decrypting(harness, {
      ...DATA,
      [stored('production', 'observability', 'grafana-admin')]: { 'admin-user': 'other' },
    });
    expect(() => sops().migrateLegacyStore({ environment: 'production' })).to.throw(
      'production/observability/grafana-admin does not hold the data of default/grafana-admin',
    );
    expect([...written.keys()].some((path) => path.includes('.archive'))).to.equal(false);
    expect(declared.mock.calls).to.deep.equal([]);
  });
});

describe('secret status report', () => {
  let harness;
  let restoreKeyFile;

  beforeEach(() => {
    harness = storeShell();
    restoreKeyFile = pinKeyFile();
  });

  afterEach(() => {
    restoreKeyFile();
    harness.restore();
    vi.restoreAllMocks();
  });

  const statusFixture = (files = {}) =>
    secretFixture({ [`${SECRETS_DIR}/.sops.yaml`]: RULES, [KEY_FILE]: KEY, ...files });
  const live = (name) =>
    harness.route({
      match: `kubectl get secret ${name} `,
      stdout: JSON.stringify({ data: {}, metadata: { resourceVersion: '1' } }),
    });

  it('reports the source, namespace, manifest and drift of each Secret', () => {
    declare({ postgresql: 'sops', mariadb: 'sops' });
    statusFixture({
      [stored('production', 'postgresql', 'credentials')]: encryptedManifest({ name: 'postgres-secret' }),
    });
    live('postgres-secret');
    harness.route({ match: 'kubectl diff', code: 1 });
    const rows = sops().statusReport('', { environment: 'production' });
    expect(rows.find(({ secret }) => secret === 'postgresql/credentials')).to.deep.equal({
      secret: 'postgresql/credentials',
      name: 'postgres-secret',
      source: 'sops',
      namespace: 'default',
      manifest: 'production/postgresql/credentials',
      decryptable: true,
      live: true,
      sync: 'DRIFT',
    });
    expect(rows.find(({ secret }) => secret === 'mariadb/credentials').sync).to.equal('MISSING MANIFEST');
    expect(rows.find(({ secret }) => secret === 'mongodb/credentials').source).to.equal('seed');
    // Its stdout would hold the decrypted values, so drift is decided by the exit code alone.
    expect(harness.calls.find((command) => command.includes('kubectl diff'))).to.include('>/dev/null 2>&1');
  });

  it('narrows the Secrets by a partial reference or name', () => {
    statusFixture();
    expect(
      sops()
        .statusReport('mongo', {})
        .map(({ secret }) => secret),
    ).to.deep.equal(['mongodb/credentials', 'mongodb/keyfile']);
    expect(sops().statusReport('not-a-secret', {})).to.deep.equal([]);
  });

  it('names a namespace-keyed store that waits for its move', () => {
    statusFixture({
      [`${SECRETS_DIR}/default/mongodb-secret.enc.yaml`]: encryptedManifest({ name: 'mongodb-secret' }),
    });
    expect(sops().legacyManifests()).to.deep.equal([
      { namespace: 'default', name: 'mongodb-secret', path: `${SECRETS_DIR}/default/mongodb-secret.enc.yaml` },
    ]);
    expect(() => sops().statusReport('', {})).not.to.throw();
  });

  it('reports a host with no tooling and no key at all', () => {
    secretFixture({});
    harness.route({ match: 'command -v', code: 0, stdout: 'missing\n' });
    expect(() => sops().statusReport('', {})).not.to.throw();
  });

  // The cron workloads used to read these values by bind-mounting the directory that holds the
  // operator's global `.env` — a home-directory tree no unprivileged container can read under
  // SELinux. Projecting them as a Secret is what replaced that mount, so the environment path has
  // to work even on a host that keeps no seed file for them.
  describe('environment-seeded workload secrets', () => {
    // The connection, not the key: the key path names a host location and would shadow the Secret
    // volume a pod actually reads, so it is entitled to no scope.
    const CRON_ENV_VARS = [
      'GITHUB_TOKEN',
      'GITHUB_USERNAME',
      'DEFAULT_SSH_USER',
      'DEFAULT_SSH_HOST',
      'DEFAULT_SSH_PORT',
    ];
    const CRON_UNENTITLED = ['DEFAULT_SSH_KEY_PATH', 'VULTR_SSH_KEY_PATH'];

    // Every cron-entitled variable is pinned, not just the ones a case sets: the key set is derived
    // from the live environment, and the host running the suite exports its own connection.
    const withEnv = (values, run) => {
      const entitled = Object.keys(scopeValuesFactory(process.env, 'cron'));
      const cleared = Object.fromEntries([...CRON_ENV_VARS, ...entitled].map((key) => [key, undefined]));
      const pinned = { ...cleared, ...values };
      const previous = {};
      for (const [key, value] of Object.entries(pinned)) {
        previous[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      try {
        return run();
      } finally {
        for (const [key, value] of Object.entries(previous))
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
      }
    };

    it('maps what the cron scope entitles the pods to, derived rather than listed', () => {
      // The key set is the `cron` scope of whatever the host source carries, so it cannot drift
      // from the ownership table the way a hand-written list does.
      const set = Object.fromEntries([...CRON_ENV_VARS, ...CRON_UNENTITLED].map((key) => [key, 'set']));
      withEnv(set, () => {
        const mapped = Object.keys(sops().seedEnvKeys('underpost-cron-env'));
        expect(mapped.sort()).to.include.members(CRON_ENV_VARS.slice().sort());
        for (const key of CRON_UNENTITLED) expect(mapped, key).to.not.include(key);
      });
      for (const key of CRON_UNENTITLED) delete process.env[key];
    });

    it('never maps a key another scope owns, whatever the host environment carries', () => {
      const foreign = {
        DB_PASSWORD: 'app-secret',
        JWT_SECRET: 'app-secret',
        MAAS_API_KEY: 'baremetal-secret',
        NPM_TOKEN: 'publishing-secret',
        GF_SECURITY_ADMIN_PASSWORD: 'host-only-secret',
      };
      withEnv({ GITHUB_TOKEN: 'token-value', ...foreign }, () => {
        const mapped = sops().seedEnvKeys('underpost-cron-env');
        const values = sops().seedEnvValues('underpost-cron-env');
        for (const key of Object.keys(foreign)) {
          expect(mapped, key).to.not.have.property(key);
          expect(values, key).to.not.have.property(key);
        }
        expect(values).to.have.property('GITHUB_TOKEN', 'token-value');
      });
      for (const key of Object.keys(foreign)) delete process.env[key];
    });

    it('reads the values out of the environment when no seed file exists', () => {
      withEnv({ GITHUB_TOKEN: 'token-value', DEFAULT_SSH_HOST: '10.0.0.4' }, () => {
        const values = sops().seedEnvValues('underpost-cron-env');
        expect(values).to.include({ GITHUB_TOKEN: 'token-value', DEFAULT_SSH_HOST: '10.0.0.4' });
      });
    });

    it('treats an unset or empty variable as absent rather than projecting a blank credential', () => {
      // The cron deploy env declares DEFAULT_SSH_* with empty values; projecting those would give
      // the pod a configured-looking connection with nothing behind it.
      withEnv({ GITHUB_TOKEN: 'token-value', GITHUB_USERNAME: '', DEFAULT_SSH_KEY_PATH: '' }, () => {
        const values = sops().seedEnvValues('underpost-cron-env');
        expect(values).to.have.property('GITHUB_TOKEN', 'token-value');
        expect(values).to.not.have.property('GITHUB_USERNAME');
        expect(values).to.not.have.property('DEFAULT_SSH_KEY_PATH');
      });
    });

    it('projects the Secret from the environment, staged on tmpfs and never as a literal', () => {
      secretFixture({});
      withEnv({ GITHUB_TOKEN: 'token-value', GITHUB_USERNAME: 'octocat', DEFAULT_SSH_HOST: '10.0.0.4' }, () => {
        expect(sops().applyFromOriginSeed('underpost-cron-env', 'default')).to.equal(true);
      });
      const create = harness.calls.find((command) => command.includes('kubectl create secret generic'));
      expect(create).to.include('--from-file=GITHUB_TOKEN=/dev/shm/');
      expect(create).to.include('--from-file=GITHUB_USERNAME=/dev/shm/');
      expect(create).to.include('--from-file=DEFAULT_SSH_HOST=/dev/shm/');
      expect(create).to.not.include('token-value');
      expect(create).to.not.include('--from-literal');
    });

    it('projects the keys the host does set and omits the rest, rather than refusing outright', () => {
      // Environment-mapped keys are ambient, not a contract: a partial set still deploys. Only a
      // half-present set of file-mapped keys (a database credential) is an error.
      secretFixture({});
      withEnv({ GITHUB_TOKEN: 'token-value' }, () => {
        expect(sops().applyFromOriginSeed('underpost-cron-env', 'default')).to.equal(true);
      });
      const create = harness.calls.find((command) => command.includes('kubectl create secret generic'));
      expect(create).to.include('--from-file=GITHUB_TOKEN=');
      expect(create).to.not.include('DEFAULT_SSH_HOST');
      expect(create).to.not.include('GITHUB_USERNAME');
    });

    it('projects nothing, rather than a partial Secret, when neither seed nor environment has it', () => {
      secretFixture({});
      withEnv({ GITHUB_TOKEN: undefined, GITHUB_USERNAME: undefined }, () => {
        expect(sops().applyFromOriginSeed('underpost-cron-env', 'default')).to.equal(false);
      });
      expect(harness.calls.some((command) => command.includes('kubectl create secret generic'))).to.equal(false);
    });

    it('leaves the grafana credentials on their own resolver', () => {
      expect(sops().seedEnvKeys('grafana-admin')).to.have.keys(['admin-user', 'admin-password']);
    });

    // The other half of removing the mount: the Secret puts the values in the pod's environment,
    // and this is what lets `underpost host get` — which reads a file store next to the global
    // installation — resolve them there.
    it('resolves a host store key from the environment when the store file is absent', () => {
      secretFixture({});
      withEnv({ DEFAULT_SSH_KEY_PATH: '/home/dd/engine/engine-private/deploy/id_rsa' }, () => {
        expect(Underpost.host.get('DEFAULT_SSH_KEY_PATH', undefined, { disableLog: true })).to.equal(
          '/home/dd/engine/engine-private/deploy/id_rsa',
        );
      });
    });

    it('keeps the store file authoritative over the environment', () => {
      secretFixture({ [Underpost.host.store.path()]: 'DEFAULT_SSH_HOST=from-file\n' });
      // `read()` gates on statSync().isFile(); the shared fixture models only the path table.
      vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
      withEnv({ DEFAULT_SSH_HOST: 'from-env' }, () => {
        expect(Underpost.host.get('DEFAULT_SSH_HOST', undefined, { disableLog: true })).to.equal('from-file');
      });
    });
  });
});

// The connection key is the one credential a workload cannot take as an environment variable:
// ssh authenticates with a file. One resolver answers where that file is, so a pod and the host
// CLI reach different keys through the same call rather than through a flag either side sets.
describe('ssh key resolution', () => {
  const SECRET_KEY_PATH = '/etc/underpost/secrets/ssh/id_rsa';
  let mounted;

  beforeEach(() => {
    mounted = false;
    delete process.env.DEFAULT_SSH_KEY_PATH;
    vi.spyOn(fs, 'existsSync').mockImplementation((path) => (`${path}` === SECRET_KEY_PATH ? mounted : false));
  });
  afterEach(() => {
    delete process.env.DEFAULT_SSH_KEY_PATH;
    vi.restoreAllMocks();
  });

  it('takes the checkout key on a host with no mount and no configured path', () => {
    expect(Underpost.ssh.keyPathFactory()).to.equal('./engine-private/deploy/id_rsa');
  });

  it('takes the projected Secret inside a pod, where the checkout key does not exist', () => {
    mounted = true;
    expect(Underpost.ssh.keyPathFactory()).to.equal(SECRET_KEY_PATH);
  });

  it('lets an explicit path win over the mount, so a caller can still name a key', () => {
    mounted = true;
    expect(Underpost.ssh.keyPathFactory('/tmp/other-key')).to.equal('/tmp/other-key');
  });

  // Regression: resolving the key from the ambient DEFAULT_SSH_KEY_PATH sent every node of a
  // fleet sync the same key. On a host the key is per target — the hub answers to root's, the LAN
  // nodes to another account's — and only the caller knows which, so an explicit path always wins.
  it('never overrides a caller path, which is how a fleet reaches each node with its own key', () => {
    process.env.DEFAULT_SSH_KEY_PATH = '/ambient/key';
    mounted = true;
    expect(Underpost.ssh.keyPathFactory('/hub/root-key')).to.equal('/hub/root-key');
    mounted = false;
    expect(Underpost.ssh.keyPathFactory('/hub/root-key')).to.equal('/hub/root-key');
    // The ambient value is not a source: it names one key for a fleet that has several.
    expect(Underpost.ssh.keyPathFactory()).to.equal('./engine-private/deploy/id_rsa');
  });
});
