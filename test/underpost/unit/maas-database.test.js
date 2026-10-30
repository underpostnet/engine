'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import shell from 'shelljs';
import { MaasDatabaseProvider } from '../../../src/cli/maas-database.js';

const CREDENTIALS = { name: 'maas', user: 'maas', password: "pa'ss" };

// A host whose PostgreSQL state the probes and queries read. SQL arrives on stdin from a file.
const fakeHost = (state = {}) => {
  const host = {
    repository: false,
    installed: false,
    initialized: false,
    enabled: false,
    active: false,
    role: '',
    owner: '',
    databases: 'postgres|postgres\nmaas|maas',
    ...state,
  };
  const commands = [];
  const sql = [];
  const result = (code, stdout = '') => ({ code, stdout, stderr: '', toString: () => stdout });
  vi.spyOn(shell, 'exec').mockImplementation((command) => {
    commands.push(command);
    if (command.includes(' psql ')) {
      const file = command.match(/< '([^']+)'$/)[1];
      const text = fs.readFileSync(file, 'utf8');
      expect(fs.statSync(file).mode & 0o777).to.equal(0o600);
      sql.push(text);
      if (text.includes('FROM pg_roles')) return result(0, host.role);
      if (text.includes('WHERE datname')) return result(0, host.owner);
      if (text.includes('NOT datistemplate')) return result(0, host.databases);
      if (text.includes('FROM pg_tables')) return result(0, 'public|maasserver_node');
      return result(0);
    }
    if (command.startsWith('rpm -q pgdg')) return result(host.repository ? 0 : 1);
    if (command.startsWith('rpm -q')) return result(host.installed ? 0 : 1);
    if (command.startsWith('sudo test -f')) return result(host.initialized ? 0 : 1);
    if (command.startsWith('systemctl is-enabled')) return result(host.enabled ? 0 : 1);
    if (command.startsWith('systemctl is-active')) return result(host.active ? 0 : 1);
    return result(0);
  });
  const writes = () => commands.filter((command) => !/^(rpm -q|sudo test -f|systemctl is-)/.test(command));
  return { commands, sql, writes };
};

const READY = { repository: true, installed: true, initialized: true, enabled: true, active: true };

describe('MAAS database provider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('installs only what the host lacks, on the host and never through the cluster', () => {
    const fresh = fakeHost();
    expect(new MaasDatabaseProvider().install()).to.have.length(5);
    expect(fresh.writes()).to.deep.equal([
      'sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm',
      'sudo dnf -qy module disable postgresql && sudo dnf install -y postgresql17 postgresql17-server postgresql17-contrib',
      'sudo /usr/pgsql-17/bin/postgresql-17-setup initdb',
      'sudo systemctl enable postgresql-17',
      'sudo systemctl start postgresql-17',
    ]);
    vi.restoreAllMocks();

    const ready = fakeHost(READY);
    expect(new MaasDatabaseProvider().install()).to.deep.equal([]);
    expect(ready.writes()).to.deep.equal([]);
    expect(ready.commands.some((command) => command.includes('kubectl'))).to.equal(false);
  });

  it('creates a login role without privileges that owns the database, with the password only on stdin', () => {
    const host = fakeHost(READY);
    expect(new MaasDatabaseProvider().configure(CREDENTIALS)).to.deep.equal([
      'create role maas',
      'create database maas owned by maas',
    ]);
    expect(host.sql).to.include(
      `CREATE ROLE "maas" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD 'pa''ss';`,
    );
    expect(host.sql).to.include('CREATE DATABASE "maas" OWNER "maas";');
    expect(host.commands.some((command) => command.includes('pa'))).to.equal(false);
    for (const command of host.commands.filter((entry) => entry.includes(' psql ')))
      expect(fs.existsSync(command.match(/< '([^']+)'$/)[1])).to.equal(false);
  });

  it('reconciles a privileged role and a database another role owns', () => {
    const host = fakeHost({ ...READY, role: 't|t|t|t|t', owner: 'postgres' });
    expect(new MaasDatabaseProvider().configure(CREDENTIALS)).to.deep.equal([
      'set the password of role maas and reset rolsuper, rolcreatedb, rolcreaterole, rolreplication',
      'change the owner of database maas from postgres to maas',
    ]);
    expect(host.sql.some((text) => text.startsWith('ALTER ROLE "maas" WITH LOGIN NOSUPERUSER'))).to.equal(true);
    expect(host.sql).to.include('ALTER DATABASE "maas" OWNER TO "maas";');
  });

  it('reads the host and changes nothing on a dry run', () => {
    const host = fakeHost({ active: true });
    const provider = new MaasDatabaseProvider({ dryRun: true });
    expect(provider.install()).to.have.length(4);
    expect(provider.configure(CREDENTIALS)).to.deep.equal(['create role maas', 'create database maas owned by maas']);
    expect(host.writes().filter((command) => !command.includes(' psql '))).to.deep.equal([]);
    expect(host.sql.some((text) => /^(CREATE|ALTER)/.test(text))).to.equal(false);
  });

  it('lists databases and tables', () => {
    fakeHost(READY);
    const provider = new MaasDatabaseProvider();
    expect(provider.databases()).to.deep.equal([
      { name: 'postgres', owner: 'postgres' },
      { name: 'maas', owner: 'maas' },
    ]);
    expect(provider.tables('maas')).to.deep.equal([{ schema: 'public', table: 'maasserver_node' }]);
    expect(() => provider.tables('maas; drop')).to.throw('Invalid PostgreSQL database name');
  });

  it('drops the MAAS database and role only when the confirmation names it', () => {
    const host = fakeHost(READY);
    const provider = new MaasDatabaseProvider();
    expect(() => provider.drop(CREDENTIALS, 'postgres')).to.throw('Refused');
    expect(host.sql).to.deep.equal([]);
    provider.drop(CREDENTIALS, 'maas');
    expect(host.sql).to.deep.equal(['DROP DATABASE IF EXISTS "maas" WITH (FORCE);', 'DROP ROLE IF EXISTS "maas";']);
  });

  it('keeps the data on uninstall, and purges it only when the server holds no other database', () => {
    const kept = fakeHost(READY);
    new MaasDatabaseProvider().uninstall(CREDENTIALS);
    expect(kept.writes()).to.deep.equal([
      'sudo systemctl stop postgresql-17',
      'sudo systemctl disable postgresql-17',
      'sudo dnf remove -y postgresql17 postgresql17-server postgresql17-contrib',
      'sudo dnf remove -y pgdg-redhat-repo',
    ]);
    vi.restoreAllMocks();

    fakeHost({ ...READY, databases: 'postgres|postgres\nmaas|maas\nbilling|app' });
    expect(() => new MaasDatabaseProvider().uninstall(CREDENTIALS, { purgeData: true })).to.throw(
      'the server holds other databases: billing',
    );
    vi.restoreAllMocks();

    const purged = fakeHost(READY);
    new MaasDatabaseProvider().uninstall(CREDENTIALS, { purgeData: true });
    expect(purged.writes().at(-1)).to.equal('sudo rm -rf /var/lib/pgsql/17 /var/log/pgsql');
  });

  it('validates the credentials of the host configuration', () => {
    expect(
      MaasDatabaseProvider.credentials({ DB_PG_MAAS_NAME: 'maas', DB_PG_MAAS_USER: 'maas', DB_PG_MAAS_PASS: 'x' }),
    ).to.deep.equal({ name: 'maas', user: 'maas', password: 'x' });
    expect(() => MaasDatabaseProvider.credentials({ DB_PG_MAAS_NAME: 'maas', DB_PG_MAAS_USER: 'maas' })).to.throw(
      'DB_PG_MAAS_PASS',
    );
    expect(() =>
      MaasDatabaseProvider.credentials({ DB_PG_MAAS_NAME: 'ma"as', DB_PG_MAAS_USER: 'maas', DB_PG_MAAS_PASS: 'x' }),
    ).to.throw('Invalid PostgreSQL database name');
  });
});
