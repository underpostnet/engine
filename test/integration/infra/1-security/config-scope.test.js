'use strict';

/**
 * @module config-scope.test
 * @description Proves that a credential cannot cross the scope that owns it.
 *
 * The assertions here are mostly about absence, which is the half that matters: a projection that
 * carries too much still passes every test written about what it carries. Each case names a real
 * credential family and asserts the cron workloads cannot see it.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';
import UnderpostCron, { cronJobYamlFactory, engineMirrorContentsFactory } from '../../../../src/server/ops/cron.js';
import UnderpostSecret from '../../../../src/cli/secrets.js';
import UnderpostHost from '../../../../src/cli/host.js';
import {
  CONFIG_OWNERSHIP,
  CONFIG_SCOPES,
  SCOPE_ENTITLEMENTS,
  classifyConfigKeys,
  configOwnershipFactory,
  configRejectionFactory,
  scopeReceivesKey,
  scopeValuesFactory,
} from '../../../../src/server/runtime/config-scope.js';

// One representative credential per foreign scope, with the value a leak would expose.
const FOREIGN_CREDENTIALS = {
  DB_PASSWORD: 'app-database-secret',
  JWT_SECRET: 'app-session-secret',
  CLOUDINARY_API_SECRET: 'app-integration-secret',
  MARIADB_PASSWORD: 'app-mariadb-secret',
  WP_ADMIN_PASSWORD_SITE: 'app-wordpress-secret',
  MAAS_API_KEY: 'baremetal-maas-secret',
  DB_PG_MAAS_PASS: 'baremetal-postgres-secret',
  NPM_TOKEN: 'publishing-npm-secret',
  DOCKER_HUB_ACCESS_TOKEN: 'publishing-registry-secret',
  POSTMAN_PASSWORD: 'publishing-postman-secret',
  GF_SECURITY_ADMIN_PASSWORD: 'host-grafana-secret',
  CLUSTER_MAILER_SMTP_AUTH_PASS: 'host-mailer-secret',
  UNDERPOST_EVENT_TOKEN: 'host-dispatcher-secret',
};

const CRON_CREDENTIALS = {
  VULTR_API_KEY: 'cron-vultr',
  DDNS_API_KEY: 'cron-ddns',
  GITHUB_TOKEN: 'cron-github',
  DEFAULT_SSH_HOST: '10.0.0.1',
  FORWARD_PROXY_API_KEY: 'cron-proxy',
};

// Entitled to no scope: consumed by nothing in a pod, and a projected key path would shadow the
// Secret volume that holds the actual credential.
const UNCONSUMED_BY_CRON = {
  DEFAULT_SSH_KEY_PATH: '/home/dd/engine/engine-private/deploy/id_rsa',
  VULTR_SSH_KEY_PATH: '/home/dd/engine/engine-private/deploy/id_rsa',
  GITHUB_BACKUP_REPO: 'owner/backups',
};

describe('configuration scope ownership', () => {
  it('places every key of the live host source, or names the ones it cannot', () => {
    // Fail-closed is the whole contract: an unplaced key is reported for a decision rather than
    // defaulted into a scope, because both wrong answers are silent.
    const source = './engine-private/conf/dd-cron/.env.production';
    if (!fs.existsSync(source)) return;
    const values = Object.fromEntries(
      fs
        .readFileSync(source, 'utf8')
        .split('\n')
        .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
        .filter(Boolean)
        .map((key) => [key, '']),
    );
    expect(classifyConfigKeys(values).unclassified).to.deep.equal([]);
  });

  it('gives every key exactly one owner', () => {
    for (const key of [...Object.keys(FOREIGN_CREDENTIALS), ...Object.keys(CRON_CREDENTIALS)]) {
      const ownership = configOwnershipFactory(key);
      expect(ownership, key).to.not.equal(null);
      expect(Object.keys(CONFIG_SCOPES), key).to.include(ownership.owner);
    }
  });

  it('reports an unknown key rather than placing it', () => {
    expect(configOwnershipFactory('SOME_NEW_CREDENTIAL')).to.equal(null);
    expect(classifyConfigKeys({ SOME_NEW_CREDENTIAL: 'x' }).unclassified).to.deep.equal(['SOME_NEW_CREDENTIAL']);
    expect(scopeReceivesKey('SOME_NEW_CREDENTIAL', 'cron')).to.equal(false);
  });

  it('projects only by an explicit rule, never by inheritance', () => {
    // A projection is an edit to the ownership table, so it is reviewable.
    expect(configOwnershipFactory('GITHUB_TOKEN')).to.deep.equal({ owner: 'host', projectedTo: ['cron'] });
    expect(configOwnershipFactory('GF_SECURITY_ADMIN_PASSWORD')).to.deep.equal({ owner: 'host', projectedTo: [] });
    // Both are host-owned; only one reaches cron.
    expect(scopeReceivesKey('GITHUB_TOKEN', 'cron')).to.equal(true);
    expect(scopeReceivesKey('GF_SECURITY_ADMIN_PASSWORD', 'cron')).to.equal(false);
  });

  it('names a rejection without disclosing the value behind it', () => {
    const line = configRejectionFactory({
      domain: 'cron',
      deployId: 'dd-cron',
      env: 'production',
      key: 'MAAS_API_KEY',
      reason: 'key belongs to baremetal scope',
    });
    expect(line).to.equal(
      'configuration source rejected: domain=cron deploy=dd-cron env=production key=MAAS_API_KEY ' +
        'reason=key belongs to baremetal scope',
    );
    expect(line).to.not.include('baremetal-maas-secret');
  });

  it('orders the ownership table so a narrower rule is never shadowed', () => {
    for (const [index, rule] of CONFIG_OWNERSHIP.entries()) {
      const shadowed = CONFIG_OWNERSHIP.slice(0, index).find((earlier) => earlier.match.source === rule.match.source);
      expect(shadowed, rule.match.source).to.equal(undefined);
    }
  });
});

describe('cron cannot see what it does not own', () => {
  const environment = { ...FOREIGN_CREDENTIALS, ...UNCONSUMED_BY_CRON, ...CRON_CREDENTIALS };

  it('entitles cron to its own scope and to nothing else', () => {
    const entitled = scopeValuesFactory(environment, 'cron');
    for (const key of Object.keys(CRON_CREDENTIALS)) expect(entitled, key).to.have.property(key);
    for (const key of Object.keys(FOREIGN_CREDENTIALS)) expect(entitled, key).to.not.have.property(key);
    for (const key of Object.keys(UNCONSUMED_BY_CRON)) expect(entitled, key).to.not.have.property(key);
  });

  it('keeps every foreign credential out of the projected Secret, by value as well as by key', () => {
    const previous = { ...process.env };
    try {
      Object.assign(process.env, environment);
      const projected = UnderpostSecret.API.seedEnvKeys('underpost-cron-env');
      const rendered = JSON.stringify(projected);
      for (const [key, value] of Object.entries({ ...FOREIGN_CREDENTIALS, ...UNCONSUMED_BY_CRON })) {
        expect(projected, key).to.not.have.property(key);
        expect(rendered, value).to.not.include(value);
      }
      for (const key of Object.keys(CRON_CREDENTIALS)) expect(projected, key).to.have.property(key);
    } finally {
      for (const key of Object.keys(environment)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });

  it('mirrors no deployment environment file into the shared tree', () => {
    // The mirror carries the shared container label, so a single `.env.*` rule there hands every
    // deployment's credentials to every container on the node.
    const rules = engineMirrorContentsFactory();
    expect(rules.at(-1)).to.equal('--exclude=*');
    expect(rules.some((rule) => rule.includes('.env'))).to.equal(false);
    for (const environmentName of ['production', 'development', 'test'])
      expect(rules.join(' '), environmentName).to.not.include(`.env.${environmentName}`);
  });

  it('mirrors the configuration documents, which hold references rather than values', () => {
    const rules = engineMirrorContentsFactory();
    expect(rules).to.include('--include=/engine-private/conf/*/conf.*.json');
    expect(rules).to.include('--include=/engine-private/deploy/dd.cron');
    expect(rules).to.include('--include=/engine-private/deploy/dd.routes');
  });

  it('takes no environment from a file at runtime, so a mirrored one cannot be reintroduced', () => {
    const manifest = cronJobYamlFactory({
      name: 'dd-cron-vultr',
      expression: '*/30 * * * *',
      deployList: 'dd-cron',
      jobList: 'vultr',
      kubeadm: true,
    });
    expect(manifest).to.not.include('app load');
    expect(manifest).to.include('node bin cron dd-cron vultr');
    expect(manifest).to.include('secretRef:');
    expect(manifest).to.include('name: underpost-cron-env');
  });

  it('renders the resolved environment into the manifest, where it wins over the projection', () => {
    const render = (dev) =>
      cronJobYamlFactory({ name: 'x', expression: '* * * * *', deployList: 'dd-cron', jobList: 'vultr', dev });
    expect(render(false)).to.include('- name: NODE_ENV\n                  value: production');
    expect(render(true)).to.include('- name: NODE_ENV\n                  value: development');
  });

  it('exposes the job handlers it is meant to, unchanged by the scoping', () => {
    expect(Object.keys(UnderpostCron.JOB).sort()).to.deep.equal(['backup', 'dns', 'vultr']);
  });
});

// Proves the finalized policy: ownership may be a family pattern, but what a workload may *read*
// is an exact list. Without this, the next credential added to an owned family arrives in a pod
// unreviewed, which is the failure mode the entitlement table exists to prevent.
describe('scope entitlement is explicit, not inferred from naming', () => {
  it('refuses a new member of an owned family, however it is named', () => {
    for (const key of ['GITHUB_NEW_SENSITIVE_TOKEN', 'VULTR_NEW_SECRET', 'DDNS_NEW_SECRET']) {
      expect(configOwnershipFactory(key), key).to.not.equal(null);
      expect(scopeReceivesKey(key, 'cron'), key).to.equal(false);
    }
    // The named members it replaces stay entitled, so the narrowing is a policy and not an outage.
    for (const key of ['GITHUB_TOKEN', 'VULTR_API_KEY', 'DDNS_API_KEY'])
      expect(scopeReceivesKey(key, 'cron'), key).to.equal(true);
  });

  it('projects nothing a workload does not consume', () => {
    // Regression: projecting a key path made the SSH resolver prefer a host path that does not
    // exist in a pod over the Secret volume that holds the actual key.
    for (const key of ['DEFAULT_SSH_KEY_PATH', 'VULTR_SSH_KEY_PATH', 'GITHUB_BACKUP_REPO', 'GITHUB_DNS_REPO'])
      expect(scopeReceivesKey(key, 'cron'), key).to.equal(false);
  });

  it('names every entitled key in the table, so the policy reads without inference', () => {
    for (const key of SCOPE_ENTITLEMENTS.cron) expect(configOwnershipFactory(key), key).to.not.equal(null);
    expect(
      Object.keys(scopeValuesFactory(Object.fromEntries(SCOPE_ENTITLEMENTS.cron.map((k) => [k, 'v'])), 'cron')),
    ).to.have.lengthOf(SCOPE_ENTITLEMENTS.cron.length);
  });
});

describe('the host domain has one durable source per scope', () => {
  // A migrated node has no `engine-private` checkout to assert against in every environment this
  // suite runs in (CI, a fresh clone), so the migrated state is a fixture rather than the real
  // filesystem — the deterministic path the project's testing guidance asks for, and immune to
  // whatever an operator has actually done to this box's private tree.
  const SCOPES_DIR = './engine-private/deploy/scopes';
  const LEGACY_SOURCE = './engine-private/conf/dd-cron/.env.production';

  const migratedNodeFixture = () => {
    const table = new Map([
      [`${SCOPES_DIR}/host.env.production`, 'GITHUB_TOKEN=host-github\n'],
      [`${SCOPES_DIR}/cron.env.production`, 'DDNS_API_KEY=cron-ddns\n'],
      [`${SCOPES_DIR}/app.env.production`, 'DB_PASSWORD=app-secret\n'],
    ]);
    const modes = new Map([...table.keys()].map((path) => [path, 0o600]));
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => table.has(`${filePath}`));
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      const key = `${filePath}`;
      if (!table.has(key)) throw Object.assign(new Error(`ENOENT: ${key}`), { code: 'ENOENT' });
      return table.get(key);
    });
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => {
      const key = `${filePath}`;
      table.set(key, `${value}`);
      if (!modes.has(key)) modes.set(key, 0o644);
    });
    vi.spyOn(fs, 'mkdirpSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'chmodSync').mockImplementation((filePath, mode) => modes.set(`${filePath}`, mode));
    vi.spyOn(fs, 'statSync').mockImplementation((filePath) => ({ mode: modes.get(`${filePath}`) ?? 0o644 }));
    vi.spyOn(fs, 'removeSync').mockImplementation((filePath) => table.delete(`${filePath}`));
    return { table, modes };
  };

  beforeEach(() => migratedNodeFixture());
  afterEach(() => vi.restoreAllMocks());

  it('reads the scoped sources and needs no unsplit file', () => {
    // The migration has run in this tree: the scoped sources answer for the whole environment and
    // the file they were split from is gone.
    expect(UnderpostHost.API.hasDualSource('production')).to.equal(false);
    expect(fs.existsSync(UnderpostHost.API.envPath('production'))).to.equal(false);
    expect(UnderpostHost.API.scopedSources('production').length).to.be.greaterThan(0);
    expect(Object.keys(UnderpostHost.API.read('production')).length).to.be.greaterThan(0);
    expect(UnderpostHost.API.sourceLabel('production')).to.include('/scopes/');
  });

  it('keeps every scoped source unreadable to anyone but its owner', () => {
    for (const { path } of UnderpostHost.API.scopedSources('production'))
      expect(fs.statSync(path).mode & 0o777, path).to.equal(0o600);
  });

  it('retires nothing while an unsplit source is unaccounted for, and is idempotent once it is', () => {
    expect(UnderpostHost.API.retireLegacySource({ env: 'production' })).to.include({ reason: 'already retired' });
  });

  // Regression: after retirement these read a file that no longer exists, so `host setup` — which
  // composes them — threw on every migrated node. The finished state of a migration is not a
  // broken configuration. Asserted on the two operations rather than through `setup`, whose
  // `load` rewrites the host store once per key and belongs to no timing budget here.
  it('reruns on a migrated node with the legacy source gone', () => {
    expect(fs.existsSync(LEGACY_SOURCE)).to.equal(false);
    expect(() => UnderpostHost.API.split({ env: 'production' })).to.not.throw();
    expect(UnderpostHost.API.split({ env: 'production' }).written).to.deep.equal([]);
    expect(UnderpostHost.API.verifySplit({ env: 'production' }).ok).to.equal(true);
    expect(UnderpostHost.API.hasDualSource('production')).to.equal(false);
  });

  it('keeps 0600 across a re-split', () => {
    UnderpostHost.API.split({ env: 'production' });
    for (const { path } of UnderpostHost.API.scopedSources('production'))
      expect(fs.statSync(path).mode & 0o777, path).to.equal(0o600);
  });

  it('refuses to place a key no scope claims rather than parking it somewhere', () => {
    expect(() => UnderpostHost.API.writeScopes({ TOTALLY_NEW_CREDENTIAL: 'x' }, { dryRun: true })).to.throw(
      'belong to no scope',
    );
  });
});
