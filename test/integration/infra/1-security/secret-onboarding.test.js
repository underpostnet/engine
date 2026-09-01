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
  vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);
  vi.spyOn(fs, 'moveSync').mockImplementation((src, dest) => {
    written.set(`${dest}`, written.get(`${src}`) ?? table.get(`${src}`) ?? '');
    written.delete(`${src}`);
  });
  vi.spyOn(fs, 'statSync').mockReturnValue({ mode: 0o600 });
  vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
    keys()
      .filter((filePath) => filePath.startsWith(`${dir}/`))
      .map((filePath) => filePath.slice(`${dir}/`.length))
      .filter((name) => !name.includes('/')),
  );
  return { table, written, removed };
};

const encryptedManifest = ({ name, namespace = 'default', recipients = [RECIPIENT] }) =>
  [
    'apiVersion: v1',
    'kind: Secret',
    'metadata:',
    `    name: ${name}`,
    `    namespace: ${namespace}`,
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
        if (command.includes('ln -sf /usr/local/bin/age-keygen')) installed = true;
        return false;
      },
    });

    expect(sops().installTooling()).to.deep.equal({ sops: true, age: true });
    expect(harness.ran('getsops/sops/releases/download')).to.equal(true);
    expect(harness.ran('FiloSottile/age/releases/download')).to.equal(true);
    expect(harness.ran('install -m 0755 /tmp/sops /usr/local/bin/sops')).to.equal(true);
    expect(harness.ran('rm -rf /tmp/age /tmp/age.tar.gz')).to.equal(true);
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

describe('encrypted manifest lifecycle', () => {
  let harness;
  let restoreKeyFile;

  beforeEach(() => {
    harness = shellHarness([
      { match: 'command -v', code: 0, stdout: 'exists\n' },
      { match: 'age-keygen -y', code: 0, stdout: `${RECIPIENT}\n` },
    ]);
    restoreKeyFile = pinKeyFile();
  });

  afterEach(() => {
    restoreKeyFile();
    harness.restore();
    vi.restoreAllMocks();
  });

  const storeFixture = (files = {}) =>
    secretFixture({
      [`${SECRETS_DIR}/.sops.yaml`]: `creation_rules:\n  - path_regex: .*\\.enc\\.yaml$\n    age: ${RECIPIENT}\n`,
      [KEY_FILE]: `# public key: ${RECIPIENT}\nAGE-SECRET-KEY-FIXTURE\n`,
      ...files,
    });

  it('reads the recipients a manifest is sealed to without any private key', () => {
    const other = 'age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn';
    storeFixture({
      [`${SECRETS_DIR}/default/app.enc.yaml`]: encryptedManifest({ name: 'app', recipients: [RECIPIENT, other] }),
    });
    expect(sops().manifestRecipients(`${SECRETS_DIR}/default/app.enc.yaml`)).to.deep.equal([RECIPIENT, other]);
  });

  it('refuses to encrypt a manifest that is not there', () => {
    storeFixture();
    expect(() => sops().encrypt('/dev/shm/absent.yaml')).to.throw('Plaintext manifest not found');
  });

  it('refuses to encrypt without creation rules', () => {
    secretFixture({ '/dev/shm/app.yaml': 'kind: Secret\n' });
    expect(() => sops().encrypt('/dev/shm/app.yaml')).to.throw('Missing creation rules');
  });

  // Re-encrypting would double-wrap it, and the result decrypts to ciphertext.
  it('refuses to re-encrypt a manifest that already carries sops metadata', () => {
    storeFixture({ '/dev/shm/app.yaml': encryptedManifest({ name: 'app' }) });
    expect(() => sops().encrypt('/dev/shm/app.yaml')).to.throw('already carries sops metadata');
  });

  it('refuses to replace a stored manifest without --force', () => {
    storeFixture({
      '/dev/shm/app.yaml': 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: app\n',
      [`${SECRETS_DIR}/default/app.enc.yaml`]: encryptedManifest({ name: 'app' }),
    });
    expect(() => sops().encrypt('/dev/shm/app.yaml')).to.throw('pass --force to replace');
  });

  // A bare `sops … > out` truncates the destination before sops runs, so a
  // failed encrypt would destroy the manifest already there.
  it('encrypts through a staged file and shreds the plaintext source', () => {
    const { written } = storeFixture({ '/dev/shm/app.yaml': 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: app\n' });
    harness.route({
      match: 'sops --config',
      code: 0,
      stdout: '',
    });
    // The staged file is what `assertManifest` reads back.
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));
    written.set(`${SECRETS_DIR}/default/app.enc.yaml.staged`, encryptedManifest({ name: 'app' }));

    expect(sops().encrypt('/dev/shm/app.yaml')).to.equal(`${SECRETS_DIR}/default/app.enc.yaml`);
    expect(harness.ran('--filename-override "./engine-private/secrets/default/app.enc.yaml"')).to.equal(true);
    expect(harness.ran('shred -u "/dev/shm/app.yaml"')).to.equal(true);
    expect(written.get(`${SECRETS_DIR}/default/app.enc.yaml`)).to.include('sops:');
  });

  it('applies only the requested manifests', () => {
    storeFixture({
      [`${SECRETS_DIR}/default/app.enc.yaml`]: encryptedManifest({ name: 'app' }),
      [`${SECRETS_DIR}/default/other.enc.yaml`]: encryptedManifest({ name: 'other' }),
    });
    expect(sops().applySelected(['app'], 'default')).to.equal(1);
    expect(harness.ran('sops --decrypt "./engine-private/secrets/default/app.enc.yaml"')).to.equal(true);
    expect(harness.ran('other.enc.yaml')).to.equal(false);
  });

  it('refuses a selection matching nothing stored', () => {
    storeFixture();
    expect(() => sops().applySelected(['absent'], 'default')).to.throw('No requested encrypted secrets');
  });

  // Applying in one pass means manifest N failing leaves 1..N-1 already live.
  it('server-dry-runs every manifest before the first mutation', () => {
    storeFixture({
      [`${SECRETS_DIR}/default/a.enc.yaml`]: encryptedManifest({ name: 'a' }),
      [`${SECRETS_DIR}/default/b.enc.yaml`]: encryptedManifest({ name: 'b' }),
    });
    expect(sops().applyStore('default')).to.equal(2);
    const firstMutation = harness.calls.findIndex(
      (command) => command.includes('kubectl apply -f -') && !command.includes('--dry-run=server'),
    );
    const dryRuns = harness.calls
      .slice(0, firstMutation)
      .filter((command) => command.includes('--dry-run=server')).length;
    expect(dryRuns).to.equal(2);
  });

  it('refuses to apply a namespace the store does not carry', () => {
    storeFixture();
    expect(() => sops().applyStore('absent')).to.throw('No encrypted secrets for namespace');
  });

  it('refuses to apply a namespace directory holding no manifests', () => {
    storeFixture({ [`${SECRETS_DIR}/default/README.md`]: 'notes\n' });
    expect(() => sops().applyStore('default')).to.throw('No *.enc.yaml manifests');
  });

  it('decrypts one secret through an anonymous pipe and returns it in memory', () => {
    storeFixture({ [`${SECRETS_DIR}/default/app.enc.yaml`]: encryptedManifest({ name: 'app' }) });
    harness.route({
      match: 'kubectl create --dry-run=client',
      code: 0,
      stdout: JSON.stringify({
        data: { password: Buffer.from('s3cr3t').toString('base64') },
        stringData: { username: 'admin' },
      }),
    });
    expect(sops().readData('app')).to.deep.equal({ password: 's3cr3t', username: 'admin' });
  });

  it('applies a stored secret and reports that it did', () => {
    storeFixture({ [`${SECRETS_DIR}/default/app.enc.yaml`]: encryptedManifest({ name: 'app' }) });
    expect(sops().applyIfPresent('app')).to.equal(true);
    expect(harness.ran('kubectl apply -f -')).to.equal(true);
  });

  // A manifest that is absent means the cluster is not onboarded yet; one that
  // exists but is corrupt must not slide back to the origin seed path.
  it('reports an absent manifest rather than applying anything', () => {
    storeFixture();
    expect(sops().applyIfPresent('app')).to.equal(false);
    expect(harness.ran('kubectl apply')).to.equal(false);
  });

  it('lists every stored manifest with its recipients', () => {
    storeFixture({ [`${SECRETS_DIR}/default/app.enc.yaml`]: encryptedManifest({ name: 'app' }) });
    expect(() => sops().list()).not.to.throw();
    vi.restoreAllMocks();
    secretFixture({});
    expect(() => sops().list()).not.to.throw();
  });
});

describe('secret onboarding', () => {
  let harness;
  let restoreKeyFile;

  beforeEach(() => {
    harness = shellHarness([
      { match: 'command -v', code: 0, stdout: 'exists\n' },
      { match: 'age-keygen -y', code: 0, stdout: `${RECIPIENT}\n` },
    ]);
    restoreKeyFile = pinKeyFile();
    vi.spyOn(UnderpostBaremetal.API, 'getHostArch').mockReturnValue({ arch: 'x86_64', alias: 'amd64' });
    vi.spyOn(sops(), 'init').mockReturnValue(undefined);
    vi.spyOn(sops(), 'applySelected').mockReturnValue(1);
  });

  afterEach(() => {
    restoreKeyFile();
    harness.restore();
    vi.restoreAllMocks();
  });

  const onboardFixture = (files = {}) =>
    secretFixture({
      [`${SECRETS_DIR}/.sops.yaml`]: `creation_rules:\n  - path_regex: .*\\.enc\\.yaml$\n    age: ${RECIPIENT}\n`,
      [KEY_FILE]: `# public key: ${RECIPIENT}\nAGE-SECRET-KEY-FIXTURE\n`,
      [CRON_ID_PATH]: 'dd-cron',
      ...files,
    });

  const stageEncrypted = (written, name, namespace = 'default') =>
    harness.route({
      match: (command) => {
        if (command.includes(`--filename-override "${SECRETS_DIR}/${namespace}/${name}.enc.yaml"`))
          written.set(`${SECRETS_DIR}/${namespace}/${name}.enc.yaml.staged`, encryptedManifest({ name, namespace }));
        return false;
      },
    });

  it('pins the resolved key path so a non-interactive run can decrypt', () => {
    const { written } = onboardFixture();
    stageEncrypted(written, 'postgres-secret');
    sops().setupStore('postgres-secret', {});
    expect(harness.ran(KEY_FILE)).to.equal(true);
    expect(harness.ran('/etc/profile.d/underpost-sops.sh')).to.equal(true);
    expect(harness.ran('chmod 644 /etc/profile.d/underpost-sops.sh')).to.equal(true);
  });

  it('seeds a data key from its origin seed file', () => {
    const { written } = onboardFixture({ './engine-private/mariadb-password': ' fromSeedFile \n' });
    stageEncrypted(written, 'mariadb-secret');
    sops().setupStore('mariadb-secret', {});
    expect(written.get('/dev/shm/underpost-secrets/mariadb-secret.yaml')).to.include("password: 'fromSeedFile'");
  });

  it('takes a data key from --args when nothing seeded it', () => {
    const { written } = onboardFixture();
    stageEncrypted(written, 'postgres-secret');
    sops().setupStore('postgres-secret', { args: 'password=fromArgs,ignored' });
    expect(written.get('/dev/shm/underpost-secrets/postgres-secret.yaml')).to.include("password: 'fromArgs'");
  });

  it('generates a value when nothing else supplies one', () => {
    const { written } = onboardFixture();
    stageEncrypted(written, 'postgres-secret');
    sops().setupStore('postgres-secret', {});
    const manifest = written.get('/dev/shm/underpost-secrets/postgres-secret.yaml');
    expect(manifest).to.include('kind: Secret');
    expect(manifest).to.match(/password: '.+'/);
  });

  it('leaves an already onboarded secret alone', () => {
    onboardFixture({
      [`${SECRETS_DIR}/default/postgres-secret.enc.yaml`]: encryptedManifest({ name: 'postgres-secret' }),
    });
    sops().setupStore('postgres-secret', {});
    expect(harness.ran('--filename-override')).to.equal(false);
  });

  // A stored manifest this host cannot open is present but unusable here, so
  // reporting it as onboarded would send the operator on to a failing apply.
  it('reports a stored manifest sealed to a recipient this host does not hold', () => {
    onboardFixture({
      [`${SECRETS_DIR}/default/postgres-secret.enc.yaml`]: encryptedManifest({
        name: 'postgres-secret',
        recipients: ['age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn'],
      }),
    });
    sops().setupStore('postgres-secret', {});
    expect(harness.ran('--filename-override')).to.equal(false);
  });

  it('replaces a stored manifest under --force', () => {
    const { written } = onboardFixture({
      [`${SECRETS_DIR}/default/postgres-secret.enc.yaml`]: encryptedManifest({ name: 'postgres-secret' }),
    });
    stageEncrypted(written, 'postgres-secret');
    sops().setupStore('postgres-secret', { force: true });
    expect(harness.ran('--filename-override')).to.equal(true);
  });

  it('validates without touching the cluster under --dry-run', () => {
    const { written } = onboardFixture();
    stageEncrypted(written, 'postgres-secret');
    const applySelected = vi.spyOn(sops(), 'applySelected').mockReturnValue(1);
    sops().setupStore('postgres-secret', { dryRun: true });
    expect(applySelected.mock.calls.length).to.equal(1);
    expect(applySelected.mock.calls[0][2]).to.deep.equal({ dryRun: true });
  });

  it('onboards the whole data tier by default', () => {
    const { written } = onboardFixture();
    for (const name of ['postgres-secret', 'mariadb-secret', 'mongodb-secret', 'mongodb-keyfile'])
      stageEncrypted(written, name, 'ops');
    sops().setupStore('', { namespace: 'ops' });
    expect(harness.count('--filename-override')).to.equal(4);
    expect(harness.ran('/ops/mongodb-keyfile.enc.yaml')).to.equal(true);
  });

  it('removes the shared-memory staging directory even when a step throws', () => {
    const { removed } = onboardFixture();
    harness.route({ match: 'sops --config', throws: new Error('sops refused') });
    expect(() => sops().setupStore('postgres-secret', {})).to.throw('sops refused');
    expect(removed).to.include('/dev/shm/underpost-secrets');
  });
});

describe('secret status report', () => {
  let harness;
  let restoreKeyFile;

  beforeEach(() => {
    harness = shellHarness([
      { match: 'command -v', code: 0, stdout: 'exists\n' },
      { match: 'age-keygen -y', code: 0, stdout: `${RECIPIENT}\n` },
    ]);
    restoreKeyFile = pinKeyFile();
  });

  afterEach(() => {
    restoreKeyFile();
    harness.restore();
    vi.restoreAllMocks();
  });

  const statusFixture = (files = {}) =>
    secretFixture({
      [`${SECRETS_DIR}/.sops.yaml`]: `creation_rules:\n  - path_regex: .*\\.enc\\.yaml$\n    age: ${RECIPIENT}\n`,
      [KEY_FILE]: `# public key: ${RECIPIENT}\nAGE-SECRET-KEY-FIXTURE\n`,
      ...files,
    });

  it('reports tooling, key, rules, store and coverage', () => {
    statusFixture({
      [`${SECRETS_DIR}/default/postgres-secret.enc.yaml`]: encryptedManifest({ name: 'postgres-secret' }),
      './engine-private/mariadb-username': 'root\n',
      './engine-private/mariadb-password': 'pw\n',
    });
    harness.route({ match: 'kubectl get secret', code: 0, stdout: 'secret/postgres-secret\n' });
    harness.route({ match: 'kubectl diff', code: 0 });
    expect(() => sops().statusReport('', {})).not.to.throw();
    expect(harness.ran('kubectl diff -f -')).to.equal(true);
  });

  // Its stdout would contain the decrypted values, so drift is decided by the
  // exit code alone.
  it('reports drift from the diff exit code without capturing its output', () => {
    statusFixture({
      [`${SECRETS_DIR}/default/postgres-secret.enc.yaml`]: encryptedManifest({ name: 'postgres-secret' }),
    });
    harness.route({ match: 'kubectl get secret', code: 0, stdout: 'secret/postgres-secret\n' });
    harness.route({ match: 'kubectl diff', code: 1 });
    sops().statusReport('', {});
    const diff = harness.calls.find((command) => command.includes('kubectl diff'));
    expect(diff).to.include('>/dev/null 2>&1');
  });

  it('narrows both the store listing and the coverage table by a partial key', () => {
    statusFixture({
      [`${SECRETS_DIR}/default/mongodb-secret.enc.yaml`]: encryptedManifest({ name: 'mongodb-secret' }),
      [`${SECRETS_DIR}/default/postgres-secret.enc.yaml`]: encryptedManifest({ name: 'postgres-secret' }),
    });
    sops().statusReport('mongo', {});
    expect(harness.calls.some((command) => command.includes('mongodb-secret'))).to.equal(true);
    expect(harness.calls.some((command) => command.includes('postgres-secret'))).to.equal(false);
  });

  it('reports an empty store and a filter matching no managed secret', () => {
    statusFixture();
    expect(() => sops().statusReport('not-a-managed-key', {})).not.to.throw();
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
