'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import crypto from 'node:crypto';
import Underpost from '../../../../src/index.js';
import { classifyCommand, EXECUTION_PROFILES } from '../../../../src/server/build/execution.js';
import { resolveDeployList } from '../../../../src/server/network/router.js';

const sops = () => Underpost.secret;
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

    it('maps Grafana credentials to the dedicated Secret keys', () => {
      expect(sops().managedSecrets()).to.include('grafana-admin');
      expect(sops().seedEnvKeys('grafana-admin')).to.deep.equal({
        'admin-user': 'GF_SECURITY_ADMIN_USER',
        'admin-password': 'GF_SECURITY_ADMIN_PASSWORD',
      });
    });
  });

  describe('presence detection and origin seed fallback', () => {
    const storeRoot = './engine-private/secrets';
    let createdStoreRoot = false;

    beforeAll(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(TEST_DIR);
      fs.writeFileSync(`${TEST_DIR}/fixture-secret.enc.yaml`, encryptedFixture, 'utf8');
    });

    afterAll(() => {
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
      expect(() => sops().applyStore('namespace-without-a-store')).to.throw(/No encrypted secrets for namespace/);
    });
  });

  describe('cluster initialization wiring', () => {
    const clusterSource = fs.readFileSync(new URL('../../../../src/cli/cluster.js', import.meta.url), 'utf8');

    for (const [flag, secretName] of [
      ['mariadb', 'mariadb-secret'],
      ['mysql', 'mysql-secret'],
      ['postgresql', 'postgres-secret'],
    ]) {
      it(`prefers the encrypted store for ${secretName} and keeps the origin seed path`, () => {
        const start = clusterSource.indexOf(`if (options.${flag}) {`);
        expect(start, `options.${flag} branch not found`).to.be.greaterThan(-1);
        const branch = clusterSource.slice(start, start + 1200);
        expect(branch).to.include(`Underpost.secret.applyIfPresent('${secretName}', options.namespace)`);
        // The origin seed projection must stay guarded by the negated store lookup, never run
        // unconditionally alongside the decrypted apply. Its paths come from the workload
        // domain, so the branch names no credential path of its own.
        expect(branch).to.match(
          new RegExp(
            `if \\(!Underpost\\.secret\\.applyIfPresent\\('${secretName}'[\\s\\S]{0,120}` +
              `Underpost\\.secret\\.applyFromOriginSeed\\('${secretName}'`,
          ),
        );
        expect(branch).to.not.include('engine-private/');
      });
    }

    it('delegates host tooling install to UnderpostSecret instead of duplicating it', () => {
      expect(clusterSource).to.include('Underpost.secret.installTooling()');
      // The binary install logic must live in exactly one place.
      expect(clusterSource).to.not.include('releases/download/${SOPS_VERSION}');
      expect(clusterSource).to.not.include('const SOPS_VERSION');
      expect(clusterSource).to.not.include('const AGE_VERSION');
    });

    it('pins the sops and age versions in the secrets module', () => {
      const secretsSource = fs.readFileSync(new URL('../../../../src/cli/secrets.js', import.meta.url), 'utf8');
      expect(secretsSource).to.match(/const SOPS_VERSION = 'v\d+\.\d+\.\d+';/);
      expect(secretsSource).to.match(/const AGE_VERSION = 'v\d+\.\d+\.\d+';/);
    });
  });

  describe('decrypt-to-apply pipeline', () => {
    const secretsSource = fs.readFileSync(new URL('../../../../src/cli/secrets.js', import.meta.url), 'utf8');

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
      const start = secretsSource.indexOf('    rotateRecipient(recipient, options = {}) {');
      expect(start, 'rotate() not found').to.be.greaterThan(-1);
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body).to.include('set -o pipefail');
      expect(body).to.include('sops --config');
      expect(body).to.include('updatekeys --yes');
      expect(body).to.include('disableLog: true');
    });
  });

  describe('GIT_AUTH_TOKEN rotation', () => {
    const secretsSource = fs.readFileSync(new URL('../../../../src/cli/secrets.js', import.meta.url), 'utf8');
    const saved = {};

    // `instanceRepos` reads `./engine-private/conf/<deployId>/conf.instances.json`, and
    // engine-private is a private repository absent from a CI checkout. A real deploy's
    // instances are therefore fixture data here: the deploy gets its own directory, that
    // directory is removed whole afterwards, and an existing one is never touched.
    const FIXTURE_DEPLOY = 'dd-fixture-sops';
    const FIXTURE_CONF_DIR = `./engine-private/conf/${FIXTURE_DEPLOY}`;
    const FIXTURE_INSTANCE_REPOS = ['underpostnet/fixture-sops-server', 'underpostnet/fixture-sops-client'];

    beforeAll(() => {
      if (fs.existsSync(FIXTURE_CONF_DIR))
        throw new Error(`Refusing to write fixtures into an existing deploy: ${FIXTURE_CONF_DIR}`);
      fs.outputJsonSync(`${FIXTURE_CONF_DIR}/conf.instances.json`, [
        { id: 'fixture-server', metadata: { repository: FIXTURE_INSTANCE_REPOS[0] } },
        { id: 'fixture-client', metadata: { repository: FIXTURE_INSTANCE_REPOS[1] } },
        { id: 'fixture-page' },
      ]);
    });

    afterAll(() => {
      fs.removeSync(FIXTURE_CONF_DIR);
    });

    beforeEach(() => {
      for (const key of ['ENGINE_SRC_REPO', 'ENGINE_SRC_PRIVATE_REPO', 'GITHUB_USERNAME', 'GIT_AUTH_TOKEN'])
        saved[key] = process.env[key];
      for (const key of Object.keys(saved)) delete process.env[key];
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    });

    it('targets the private conf repo, both engine sources and the package mirror of a deploy', () => {
      // Same naming `deploy_id_from_repo` resolves in deploy/lib/host.sh, reached through the
      // repository domain rather than re-derived here. dd-core declares no instances, so this is
      // the naming-derived set on its own.
      expect(sops().gitAuthTokenTargets({ deployId: 'dd-core', owner: 'acme' })).to.deep.equal([
        'acme/engine-core-private',
        'acme/engine-core',
        'acme/engine-test-core',
        'acme/engine-ghpkg-core',
      ]);
    });

    it('keeps an instance repository under the owner it declares, not the derived one', () => {
      // metadata.repository is an explicit slug, so it outranks the --args owner used for naming.
      expect(sops().gitAuthTokenTargets({ deployId: FIXTURE_DEPLOY, owner: 'acme' })).to.include(
        FIXTURE_INSTANCE_REPOS[0],
      );
    });

    it('includes the ghpkg package mirror the engine repository publishes into', () => {
      // .github/workflows/ghpkg.ci.yml builds engine-ghpkg-<conf_id>, whose own workflows read
      // the same token; the monorepo has no ghpkg of its own.
      expect(sops().gitAuthTokenTargets({ deployId: 'dd-cyberia', owner: 'acme' })).to.include(
        'acme/engine-ghpkg-cyberia',
      );
      expect(sops().gitAuthTokenTargets({ owner: 'acme' })).to.not.include('acme/engine-ghpkg');
    });

    it("includes every repository the deploy's instances are built from", () => {
      // dd-cyberia builds from cyberia-server and cyberia-client; rotating only the engine repos
      // would leave half the deploy on the previous token.
      const declared = Underpost.repo.instanceRepos(FIXTURE_DEPLOY);
      expect(declared, `${FIXTURE_DEPLOY} declares no instance repositories`).to.deep.equal(FIXTURE_INSTANCE_REPOS);
      expect(sops().gitAuthTokenTargets({ deployId: FIXTURE_DEPLOY })).to.include.members(declared);
    });

    it('contributes nothing for a deploy that declares no instances', () => {
      expect(Underpost.repo.instanceRepos('dd-core')).to.deep.equal([]);
      expect(Underpost.repo.instanceRepos('')).to.deep.equal([]);
    });

    it('resolves the `template` meta id to the template lineage, not through conf-id naming', () => {
      expect(sops().gitAuthTokenTargets({ deployId: 'template', owner: 'acme' })).to.deep.equal([
        'acme/pwa-microservices-template',
        'acme/pwa-microservices-template-ghpkg',
        'acme/engine',
      ]);
    });

    it('resolves the same targets from every reference that names the deploy', () => {
      const expected = [
        'acme/engine-lampp-private',
        'acme/engine-lampp',
        'acme/engine-test-lampp',
        'acme/engine-ghpkg-lampp',
      ];
      for (const reference of ['dd-lampp', 'engine-lampp', 'engine-test-lampp', 'engine-lampp-private'])
        expect(sops().gitAuthTokenTargets({ deployId: reference, owner: 'acme' }), reference).to.deep.equal(expected);
    });

    it('falls back to the monorepo pair, deduplicated, when no deploy is named', () => {
      expect(sops().gitAuthTokenTargets({ owner: 'acme' })).to.deep.equal(['acme/engine-private', 'acme/engine']);
    });

    it('takes the deploy and owner from the deploy environment when none is passed', () => {
      process.env.ENGINE_SRC_REPO = 'acme/engine-test-fixture-sops';
      process.env.ENGINE_SRC_PRIVATE_REPO = 'acme/engine-private';
      expect(sops().gitAuthTokenTargets({})).to.deep.equal([
        'acme/engine-fixture-sops-private',
        'acme/engine-fixture-sops',
        'acme/engine-test-fixture-sops',
        'acme/engine-ghpkg-fixture-sops',
        ...FIXTURE_INSTANCE_REPOS,
        'acme/engine-private',
      ]);
    });

    it('fans `dd` out across the route table, one triple per deploy, deduplicated', () => {
      // `dd` is the meta id every runner reads as "all of dd.routes"; the rotation must cover the
      // same fleet the cluster deploys, resolved through the one reader rather than a second parse.
      const routed = resolveDeployList('dd');
      const targets = sops().gitAuthTokenTargets({ deployId: 'dd', owner: 'acme' });
      expect(routed.length, 'no deploy routes to fan out over').to.be.greaterThan(0);
      expect(targets).to.have.lengthOf(new Set(targets).size);
      for (const deployId of routed) {
        const confId = Underpost.repo.confIdFactory(deployId);
        expect(targets, deployId).to.include.members([
          `acme/engine-${confId}-private`,
          `acme/engine-${confId}`,
          `acme/engine-test-${confId}`,
        ]);
      }
    });

    it('accepts an explicit multi-deploy list, in route-table order', () => {
      expect(sops().gitAuthTokenTargets({ deployId: `${FIXTURE_DEPLOY}|dd-lampp`, owner: 'acme' })).to.deep.equal([
        'acme/engine-fixture-sops-private',
        'acme/engine-fixture-sops',
        'acme/engine-test-fixture-sops',
        'acme/engine-ghpkg-fixture-sops',
        ...FIXTURE_INSTANCE_REPOS,
        'acme/engine-lampp-private',
        'acme/engine-lampp',
        'acme/engine-test-lampp',
        'acme/engine-ghpkg-lampp',
      ]);
    });

    it('unions repositories two deploys share instead of rotating them twice', () => {
      process.env.ENGINE_SRC_PRIVATE_REPO = 'acme/engine-private';
      const targets = sops().gitAuthTokenTargets({ deployId: `${FIXTURE_DEPLOY}|dd-lampp`, owner: 'acme' });
      expect(targets.filter((slug) => slug === 'acme/engine-private')).to.have.lengthOf(1);
    });

    it('separates extra targets on characters --args does not split on', () => {
      const targets = sops().gitAuthTokenTargets({ owner: 'acme', repos: 'other/one|other/two;other/three' });
      expect(targets).to.include.members(['other/one', 'other/two', 'other/three']);
    });

    it('drops an unresolvable extra target instead of failing the whole rotation', () => {
      const targets = sops().gitAuthTokenTargets({ owner: 'acme', repos: 'not-a-slug|other/one' });
      expect(targets).to.include('other/one');
      expect(targets).to.not.include('not-a-slug');
    });

    it('reports the plan without contacting GitHub or writing anything on a dry run', () => {
      // Same reasoning as the 'GIT_AUTH_TOKEN token sources' dry-run test: the reported fields
      // don't depend on gh reachability, so probing is stubbed to keep this test from reaching the
      // real GitHub API through whatever `gh` session happens to be authenticated on this machine.
      const hasBinary = vi.spyOn(sops(), 'hasBinary').mockReturnValue(false);
      try {
        const report = sops().rotateGitAuthToken({ deployId: FIXTURE_DEPLOY, owner: 'acme', dryRun: true });
        expect(report.targets).to.have.lengthOf(4 + FIXTURE_INSTANCE_REPOS.length);
        expect(report.rotated).to.deep.equal([]);
        expect(report.manifest).to.equal('');
        expect(report.tokenSource).to.equal('');
      } finally {
        hasBinary.mockRestore();
      }
    });

    it('takes a piped token, ahead of an inherited environment holding the outgoing one', () => {
      const start = secretsSource.indexOf('    stageGitAuthToken(stagePath, options = {}) {');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body).to.include('stdinIsRedirected()');
      expect(body).to.include("fs.readFileSync(0, 'utf8')");
      expect(body.indexOf("source = 'piped stdin'")).to.be.lessThan(body.indexOf('} else if (inherited) {'));
    });

    it('reads stdin only when it is piped or redirected, never a terminal or /dev/null', () => {
      // fstat rather than isTTY: `< /dev/null` is not a TTY either, and reading it would strand
      // the rotation on an empty token instead of falling through to the next source.
      expect(secretsSource).to.include('stat.isFIFO() || stat.isFile()');
    });

    it('names piped stdin as the planned source without consuming it', () => {
      expect(sops().plannedTokenSource({ token: 'ghp_explicit' })).to.equal('--args token');
      expect(sops().plannedTokenSource({})).to.be.a('string').and.not.equal('');
    });

    it('treats `gh auth status` as advisory, gating on target reachability instead', () => {
      // A logged-in account whose token merely lacks an optional scope still exits non-zero here,
      // so making it the gate blocks a rotation that would have worked.
      const start = secretsSource.indexOf('    rotateGitAuthToken(options = {}) {');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body).to.include('if (!ghAuthenticated)');
      expect(body).to.not.match(/if \(!ghAuthenticated\)\s*\n?\s*throw/);
      expect(body).to.include('probed.reachable.length === 0');
    });

    it('surfaces what gh actually reported instead of a bare "not authenticated"', () => {
      expect(secretsSource).to.include('gh auth status 2>&1');
      expect(secretsSource).to.include('${ghAuthOutput}');
    });

    it('names a shadowing GH_TOKEN/GITHUB_TOKEN as the likely cause of a dead credential', () => {
      // gh prefers these over the stored login, and `host load` exports GITHUB_TOKEN on every
      // engine node — so a stale one turns a working `gh auth login` into 15 unreachable targets.
      expect(secretsSource).to.include("['GH_TOKEN', 'GITHUB_TOKEN'].filter(");
      expect(secretsSource).to.include('is set here, and gh uses it in preference to the account');
    });

    it('probes before staging the token, so an unreachable set never prompts for one', () => {
      const start = secretsSource.indexOf('    rotateGitAuthToken(options = {}) {');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body.indexOf('probeGitAuthTokenTargets(targets)')).to.be.lessThan(
        body.indexOf('stageGitAuthToken(stagePath, options)'),
      );
    });

    it('hands the token to gh on stdin, never as a command argument', () => {
      // A token in the command string is a token in the process table and in the command log.
      expect(secretsSource).to.include('gh secret set ${GIT_AUTH_TOKEN_KEY} --repo "${repo}" < "${stagePath}"');
      expect(secretsSource).to.not.include('gh secret set ${GIT_AUTH_TOKEN_KEY} --body');
    });

    it('runs the gh write under pipefail with the command kept out of the log', () => {
      const start = secretsSource.indexOf('    rotateGitAuthToken(options = {}) {');
      expect(start, 'rotateGitAuthToken() not found').to.be.greaterThan(-1);
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body).to.include("bash -c 'set -o pipefail; gh secret set");
      expect(body).to.include('disableLog: true');
      expect(body).to.include('shred -u "${stagePath}"');
    });

    it('stages the token on tmpfs at mode 600 rather than through a shell heredoc', () => {
      expect(secretsSource).to.include("const GIT_AUTH_TOKEN_STAGE_DIR = '/dev/shm/underpost-git-auth';");
      const start = secretsSource.indexOf('    stageGitAuthToken(stagePath, options = {}) {');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body).to.include('writeStageFileSync(stagePath');
      // GITHUB_TOKEN is what gh authenticates with — on a rotation that is the outgoing token.
      expect(body).to.not.include('process.env.GITHUB_TOKEN');
    });

    it('replaces the stored manifest through the validating atomic encrypt path', () => {
      const start = secretsSource.indexOf("    writeGitAuthTokenManifest(token, namespace = 'default') {");
      expect(start, 'writeGitAuthTokenManifest() not found').to.be.greaterThan(-1);
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body).to.include('Underpost.secret.encrypt(plaintextPath, namespace, { force: true })');
    });

    it('classifies gh as a network effect so a rotation cannot run under a hermetic profile', () => {
      expect(classifyCommand('gh secret set GIT_AUTH_TOKEN --repo acme/engine')).to.equal('net');
      expect(EXECUTION_PROFILES.HERMETIC_BUILD.permits).to.not.include('net');
    });

    it('rejects a credential the verb does not rotate, and a rotation with no target', () => {
      expect(() => sops().rotate({ args: { secret: 'AWS_SECRET_ACCESS_KEY' } })).to.throw(
        /GIT_AUTH_TOKEN is the only one it rotates/,
      );
      expect(() => sops().rotate({ args: {} })).to.throw(/rotate requires a target/);
    });
  });

  describe('GIT_AUTH_TOKEN token sources', () => {
    const saved = {};

    beforeEach(() => {
      saved.env = process.env.GIT_AUTH_TOKEN;
      delete process.env.GIT_AUTH_TOKEN;
    });

    afterEach(() => {
      if (saved.env === undefined) delete process.env.GIT_AUTH_TOKEN;
      else process.env.GIT_AUTH_TOKEN = saved.env;
    });

    it('prefers an explicit token over every implicit source', () => {
      process.env.GIT_AUTH_TOKEN = 'ghp_fromEnvironment';
      expect(sops().plannedTokenSource({ token: 'ghp_explicit' })).to.equal('--args token');
    });

    it('falls back through the environment to a prompt', () => {
      process.env.GIT_AUTH_TOKEN = 'ghp_fromEnvironment';
      expect(sops().plannedTokenSource({})).to.equal('GIT_AUTH_TOKEN environment');
      delete process.env.GIT_AUTH_TOKEN;
      expect(sops().plannedTokenSource({})).to.match(/interactive prompt|unavailable/);
    });

    it('does not prompt or write on a dry run', () => {
      // Report fields under dryRun are independent of gh reachability (see rotateGitAuthToken's
      // early return), so probing is stubbed out here rather than left to whatever `gh` happens to
      // be installed and authenticated as on the machine running the suite — otherwise this reaches
      // the real GitHub API for a probe of the fictitious 'acme/dd-cyberia' target.
      const hasBinary = vi.spyOn(sops(), 'hasBinary').mockReturnValue(false);
      try {
        const report = sops().rotateGitAuthToken({ deployId: 'dd-cyberia', owner: 'acme', dryRun: true });
        expect(report.tokenSource).to.equal('');
        expect(report.rotated).to.deep.equal([]);
        expect(report.manifest).to.equal('');
      } finally {
        hasBinary.mockRestore();
      }
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

    beforeAll(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(storeRoot);
      if (fs.existsSync(confPath)) savedConf = fs.readFileSync(confPath, 'utf8');
    });

    afterAll(() => {
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
      expect(() => sops().rotateRecipient('/etc/passwd')).to.throw(/not a valid Age public recipient/i);
      expect(() => sops().rotateRecipient('')).to.throw(/requires --args recipient/);
    });
  });

  describe('emergency purge', () => {
    it('archives rather than deletes unless forced', () => {
      const secretsSource = fs.readFileSync(new URL('../../../../src/cli/secrets.js', import.meta.url), 'utf8');
      const start = secretsSource.indexOf('    purge(name, options = {}) {');
      expect(start, 'purge() not found').to.be.greaterThan(-1);
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
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
    const cliSource = fs.readFileSync(new URL('../../../../src/cli/index.js', import.meta.url), 'utf8');
    const domainsSource = fs.readFileSync(new URL('../../../../src/cli/domains.js', import.meta.url), 'utf8');

    it('registers all three domains from the one shared factory', () => {
      // Symmetry is structural: there is no per-domain option or action registration to drift.
      for (const name of ["name: 'secret'", "name: 'host'", "name: 'app'"]) expect(cliSource, name).to.include(name);
      expect(cliSource).to.include('registerDomainCommand(program, domain)');
      expect(cliSource.match(/registerDomainCommand\(/g)).to.have.lengthOf(1);
    });

    it('declares the canonical action and option sets exactly once', () => {
      expect(domainsSource.match(/const DOMAIN_ACTIONS = \[/g)).to.have.lengthOf(1);
      expect(domainsSource.match(/const DOMAIN_OPTIONS = \[/g)).to.have.lengthOf(1);
      for (const action of ['setup', 'load', 'publish', 'apply', 'status', 'rotate', 'clean'])
        expect(domainsSource, action).to.include(`name: '${action}'`);
      for (const flag of ['--env <env>', '--namespace <namespace>', '--args <key=value-list>', '--dry-run', '--force'])
        expect(domainsSource, flag).to.include(flag);
    });

    it('keeps every legacy single-purpose flag out of the domain surface', () => {
      for (const legacy of [
        '--install-tools',
        '--recipient',
        '--prune-recipients',
        '--purge',
        '--setup',
        '--status',
        '--create-from-env',
        '--from-cron-env',
        '--underpost-config',
        '--global-clean',
      ])
        expect(domainsSource, legacy).to.not.include(legacy);
    });

    it('rejects an action outside the canonical set instead of silently doing nothing', () => {
      expect(domainsSource).to.include('Unknown ${name} action');
      expect(domainsSource).to.include("does not implement the '${action}' action");
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

    beforeAll(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(dir);
    });

    afterAll(() => {
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

    beforeAll(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(dir);
      fs.writeFileSync(`${dir}/mariadb-secret.enc.yaml`, sealedTo('mariadb-secret', FOREIGN), 'utf8');
      fs.writeFileSync(keyPath, '# no identity here\n', 'utf8');
      fs.chmodSync(keyPath, 0o600);
      process.env.SOPS_AGE_KEY_FILE = keyPath;
    });

    afterAll(() => {
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
      expect(error.message).to.include('underpost secret rotate --args recipient=');
      expect(error.message).to.include('underpost secret setup --force');
    });

    it('raises the adoption error before any manifest reaches kubectl', () => {
      expect(() => sops().applyStore(NS)).to.throw(/sealed to Age recipients this host does not hold/);
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

    beforeAll(() => {
      createdStoreRoot = !fs.existsSync(storeRoot);
      fs.ensureDirSync(storeRoot);
      if (fs.existsSync(confPath)) savedConf = fs.readFileSync(confPath, 'utf8');
    });

    afterAll(() => {
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
      const secretsSource = fs.readFileSync(new URL('../../../../src/cli/secrets.js', import.meta.url), 'utf8');
      const start = secretsSource.indexOf('    init() {');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body).to.include('ensureCreationRecipient(recipient)');
    });
  });

  describe('secret --setup onboarding reports', () => {
    const secretsSource = fs.readFileSync(new URL('../../../../src/cli/secrets.js', import.meta.url), 'utf8');
    const start = secretsSource.indexOf("    setupStore(names = '', options = {}) {");
    const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));

    it('does not report a manifest it cannot decrypt as onboarded', () => {
      expect(start, 'secret --setup implementation not found').to.be.greaterThan(-1);
      expect(body).to.include('Underpost.secret.decryptable(');
      expect(body).to.include('sealed to an Age recipient this host does not hold');
    });

    it('warns when --force replaces a stored credential with a generated one', () => {
      expect(body).to.include('generated while replacing the stored manifest');
    });

    it('validates and applies only the explicitly requested manifests', () => {
      expect(body).to.include('applySelected(secretNames, namespace');
      expect(body).to.not.include('sops.apply(namespace');
    });
  });

  describe('rotation safeguards', () => {
    const secretsSource = fs.readFileSync(new URL('../../../../src/cli/secrets.js', import.meta.url), 'utf8');

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
      const start = secretsSource.indexOf('    rotateRecipient(recipient, options = {}) {');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
      expect(body).to.include('assertDecryptable(manifests)');
      expect(body.indexOf('assertDecryptable(manifests)')).to.be.lessThan(body.indexOf('if (options.dryRun)'));
    });
  });

  describe('encrypt write safety', () => {
    const secretsSource = fs.readFileSync(new URL('../../../../src/cli/secrets.js', import.meta.url), 'utf8');

    it('stages and moves rather than redirecting straight onto the target', () => {
      const start = secretsSource.indexOf('    encrypt(plaintextPath, namespace');
      const body = secretsSource.slice(start, secretsSource.indexOf('\n    /**', start));
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
