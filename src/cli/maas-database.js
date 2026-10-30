/**
 * The PostgreSQL database of the MAAS control server.
 *
 * PostgreSQL runs on the control host itself: PGDG packages, the `postgresql-17` systemd service,
 * and the data directory under `/var/lib/pgsql/17`. It is never a cluster workload; the PostgreSQL
 * StatefulSet of `underpost cluster --postgresql` is a separate service.
 *
 * Every operation reads the host state first and changes only what differs. SQL reaches `psql` on
 * stdin from a private temporary file, so a password never appears in process arguments or logs.
 * The MAAS role owns its database and holds no other privilege: the database owner is what MAAS
 * needs to run its migrations.
 * @module src/cli/maas-database.js
 * @namespace MaasDatabaseProvider
 */

import crypto from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import fs from 'fs-extra';
import { loggerFactory } from '../server/ops/logger.js';
import { shellArgumentFactory, shellExec } from '../server/runtime/process.js';

const logger = loggerFactory(import.meta);

const POSTGRESQL_VERSION = 17;
const SERVICE = `postgresql-${POSTGRESQL_VERSION}`;
const PACKAGES = ['', '-server', '-contrib'].map((suffix) => `postgresql${POSTGRESQL_VERSION}${suffix}`);
const PGDG_REPOSITORY_PACKAGE = 'pgdg-redhat-repo';
const PGDG_REPOSITORY_RPM =
  'https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm';
const DATA_ROOT = `/var/lib/pgsql/${POSTGRESQL_VERSION}`;
const LOG_ROOT = '/var/log/pgsql';
const SETUP = `/usr/pgsql-${POSTGRESQL_VERSION}/bin/postgresql-${POSTGRESQL_VERSION}-setup`;
const SYSTEM_DATABASES = ['postgres', 'template0', 'template1'];
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
/** Role attributes of the MAAS role, as `pg_roles` columns and their required value. */
const ROLE_ATTRIBUTES = {
  rolcanlogin: true,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
};
const ROLE_OPTIONS = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION';

const identifierFactory = (value, label) => {
  if (!IDENTIFIER.test(`${value ?? ''}`)) throw new Error(`Invalid PostgreSQL ${label}: "${value}"`);
  return value;
};
const quoteIdentifier = (value) => `"${value}"`;
const quoteLiteral = (value) => `'${`${value}`.replaceAll("'", "''")}'`;

/**
 * @class MaasDatabaseProvider
 * @description Installs, configures, inspects and removes the MAAS PostgreSQL database of this host.
 * @memberof MaasDatabaseProvider
 */
class MaasDatabaseProvider {
  /**
   * @param {object} [options]
   * @param {boolean} [options.dryRun] - Reads host state, and reports each change instead of making it.
   */
  constructor({ dryRun = false } = {}) {
    this.dryRun = dryRun;
  }

  /**
   * The MAAS database credentials of the host configuration.
   * @param {NodeJS.ProcessEnv} [env]
   * @returns {{name: string, user: string, password: string}} Validated credentials.
   */
  static credentials(env = process.env) {
    if (!env.DB_PG_MAAS_PASS) throw new Error('DB_PG_MAAS_PASS is not set in the host configuration');
    return {
      name: identifierFactory(env.DB_PG_MAAS_NAME, 'database name'),
      user: identifierFactory(env.DB_PG_MAAS_USER, 'role name'),
      password: env.DB_PG_MAAS_PASS,
    };
  }

  probe(cmd) {
    return shellExec(cmd, { silent: true, silentOnError: true, disableLog: true }).code === 0;
  }

  change(description, cmd) {
    if (this.dryRun) logger.info(`[dry-run] ${description}`);
    else shellExec(cmd);
    return description;
  }

  psql(sql, { database = 'postgres', description = '' } = {}) {
    if (description && this.dryRun) {
      logger.info(`[dry-run] ${description}`);
      return '';
    }
    const file = nodePath.join(os.tmpdir(), `underpost-maas-db-${process.pid}-${crypto.randomUUID()}.sql`);
    fs.writeFileSync(file, sql, { mode: 0o600 });
    try {
      return `${shellExec(
        `sudo -u postgres psql -X -q -At -v ON_ERROR_STOP=1 -d ${identifierFactory(database, 'database name')} < ${shellArgumentFactory(file)}`,
        { stdout: true, silent: true, disableLog: true },
      )}`.trim();
    } finally {
      fs.removeSync(file);
    }
  }

  /**
   * The state of the host installation, and of the MAAS role and database when the server runs.
   * @param {{name: string, user: string}} [credentials]
   * @returns {object} The state.
   */
  status({ name, user } = {}) {
    const state = {
      repository: this.probe(`rpm -q ${PGDG_REPOSITORY_PACKAGE}`),
      installed: this.probe(`rpm -q ${PACKAGES.join(' ')}`),
      initialized: this.probe(`sudo test -f ${DATA_ROOT}/data/PG_VERSION`),
      enabled: this.probe(`systemctl is-enabled --quiet ${SERVICE}`),
      active: this.probe(`systemctl is-active --quiet ${SERVICE}`),
    };
    if (!state.active || !name) return state;
    const [attributes] = this.psql(
      `SELECT ${Object.keys(ROLE_ATTRIBUTES).join(', ')} FROM pg_roles WHERE rolname = ${quoteLiteral(user)};`,
    ).split('\n');
    state.role = attributes
      ? Object.fromEntries(
          Object.keys(ROLE_ATTRIBUTES).map((key, index) => [key, attributes.split('|')[index] === 't']),
        )
      : null;
    state.owner =
      this.psql(`SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = ${quoteLiteral(name)};`) || null;
    return state;
  }

  /**
   * Installs the PGDG repository and the PostgreSQL packages, initializes the data directory, and
   * enables and starts the service. Each step runs only when the host lacks its result.
   * @returns {string[]} The changes made.
   */
  install() {
    const state = this.status();
    const changes = [];
    if (!state.repository)
      changes.push(this.change('install the PGDG repository', `sudo dnf install -y ${PGDG_REPOSITORY_RPM}`));
    if (!state.installed)
      changes.push(
        this.change(
          `install ${PACKAGES.join(', ')}`,
          `sudo dnf -qy module disable postgresql && sudo dnf install -y ${PACKAGES.join(' ')}`,
        ),
      );
    if (!state.initialized) changes.push(this.change('initialize the data directory', `sudo ${SETUP} initdb`));
    if (!state.enabled) changes.push(this.change(`enable ${SERVICE}`, `sudo systemctl enable ${SERVICE}`));
    if (!state.active) changes.push(this.change(`start ${SERVICE}`, `sudo systemctl start ${SERVICE}`));
    return changes;
  }

  /**
   * Reconciles the MAAS role and database: the role exists with its password and the attributes of
   * {@link ROLE_ATTRIBUTES}, and owns the database.
   * @param {{name: string, user: string, password: string}} credentials
   * @returns {string[]} The changes made.
   */
  configure({ name, user, password }) {
    const state = this.status({ name, user });
    if (!state.active && !this.dryRun) throw new Error(`${SERVICE} is not running`);
    const changes = [];
    const drift = Object.entries(ROLE_ATTRIBUTES).filter(([key, value]) => state.role && state.role[key] !== value);
    const roleSql = `${state.role ? 'ALTER' : 'CREATE'} ROLE ${quoteIdentifier(user)} WITH ${ROLE_OPTIONS} PASSWORD ${quoteLiteral(password)};`;
    const roleChange = state.role
      ? `set the password of role ${user}${drift.length ? ` and reset ${drift.map(([key]) => key).join(', ')}` : ''}`
      : `create role ${user}`;
    this.psql(roleSql, { description: roleChange });
    changes.push(roleChange);
    if (!state.owner) {
      const description = `create database ${name} owned by ${user}`;
      this.psql(`CREATE DATABASE ${quoteIdentifier(name)} OWNER ${quoteIdentifier(user)};`, { description });
      changes.push(description);
    } else if (state.owner !== user) {
      const description = `change the owner of database ${name} from ${state.owner} to ${user}`;
      this.psql(`ALTER DATABASE ${quoteIdentifier(name)} OWNER TO ${quoteIdentifier(user)};`, { description });
      changes.push(description);
    }
    return changes;
  }

  /**
   * @returns {Array<{name: string, owner: string}>} The databases of the server, templates excluded.
   */
  databases() {
    return this.psql('SELECT datname, pg_get_userbyid(datdba) FROM pg_database WHERE NOT datistemplate ORDER BY 1;')
      .split('\n')
      .filter(Boolean)
      .map((row) => row.split('|'))
      .map(([name, owner]) => ({ name, owner }));
  }

  /**
   * @param {string} database - Database name.
   * @returns {Array<{schema: string, table: string}>} The tables of the database, system schemas excluded.
   */
  tables(database) {
    return this.psql(
      "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2;",
      { database },
    )
      .split('\n')
      .filter(Boolean)
      .map((row) => row.split('|'))
      .map(([schema, table]) => ({ schema, table }));
  }

  /**
   * Drops the MAAS database and role. The confirmation must name the MAAS database.
   * @param {{name: string, user: string}} credentials
   * @param {string} confirmation - Database name the operator typed.
   * @returns {string[]} The changes made.
   */
  drop({ name, user }, confirmation) {
    if (confirmation !== name)
      throw new Error(`Refused: the confirmation "${confirmation}" does not name the MAAS database "${name}"`);
    const changes = [`drop database ${name}`, `drop role ${user}`];
    this.psql(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE);`, { description: changes[0] });
    this.psql(`DROP ROLE IF EXISTS ${quoteIdentifier(user)};`, { description: changes[1] });
    return changes;
  }

  /**
   * Stops the service and removes the packages and the PGDG repository. The data directory stays
   * unless `purgeData`, which also requires the server to hold no database but the MAAS database.
   * @param {{name: string}} credentials
   * @param {object} [options]
   * @param {boolean} [options.purgeData] - Deletes the data and log directories.
   * @returns {string[]} The changes made.
   */
  uninstall({ name }, { purgeData = false } = {}) {
    const state = this.status();
    if (purgeData) {
      if (!state.active) throw new Error(`Refused: ${SERVICE} must run so its databases can be checked before a purge`);
      const others = this.databases()
        .map((database) => database.name)
        .filter((database) => !SYSTEM_DATABASES.includes(database) && database !== name);
      if (others.length) throw new Error(`Refused: the server holds other databases: ${others.join(', ')}`);
    }
    const changes = [];
    if (state.active) changes.push(this.change(`stop ${SERVICE}`, `sudo systemctl stop ${SERVICE}`));
    if (state.enabled) changes.push(this.change(`disable ${SERVICE}`, `sudo systemctl disable ${SERVICE}`));
    if (state.installed)
      changes.push(this.change(`remove ${PACKAGES.join(', ')}`, `sudo dnf remove -y ${PACKAGES.join(' ')}`));
    if (state.repository)
      changes.push(this.change('remove the PGDG repository', `sudo dnf remove -y ${PGDG_REPOSITORY_PACKAGE}`));
    if (purgeData)
      changes.push(this.change(`delete ${DATA_ROOT} and ${LOG_ROOT}`, `sudo rm -rf ${DATA_ROOT} ${LOG_ROOT}`));
    else if (state.initialized) logger.info(`Data directory kept: ${DATA_ROOT}`);
    return changes;
  }
}

export { MaasDatabaseProvider };
