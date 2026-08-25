/**
 * Secrets module for managing the secrets of the application.
 * @module src/cli/secrets.js
 * @namespace UnderpostSecret
 */

import { shellExec } from '../server/runtime/process.js';
import { generateRandomPasswordSelection } from '../client/components/core/CommonJs.js';
import fs from 'fs-extra';
import os from 'os';
import dotenv from 'dotenv';
import Underpost from '../index.js';
import { domainContextFactory } from './domains.js';
import { loggerFactory } from '../server/ops/logger.js';

const logger = loggerFactory(import.meta);

const SOPS_SECRETS_DIR = './engine-private/secrets';
const SOPS_MANIFEST_EXT = '.enc.yaml';
const SOPS_MANIFEST_PATH_REGEX = `.*${SOPS_MANIFEST_EXT.replace(/\./g, '\\.')}$`;
const SOPS_STAGE_DIR = './engine-private/secrets/.stage';
const SOPS_ARCHIVE_DIR = `${SOPS_SECRETS_DIR}/.archive`;
const SOPS_ENCRYPTED_REGEX = '^(data|stringData)$';
const SOPS_VERSION = 'v3.10.2';
const AGE_VERSION = 'v1.2.1';
const MANAGED_SECRETS = [
  'postgres-secret',
  'mariadb-secret',
  'mysql-secret',
  'mongodb-secret',
  'mongodb-keyfile',
  'ipfs-cluster-secret',
  'grafana-admin',
];
// Origin credentials for the workload secret system, the first link in
// `origin secret -> SOPS/Age -> Kubernetes Secret -> workload`. They live in the deploy
// secret area alongside the other deploy-scoped material (SSH keys, node and route lists).
const DEPLOY_SECRET_DIR = './engine-private/deploy';
const LEGACY_SEED_DIR = './engine-private';
// A data key maps either to a whole file, or to `{ file, json }` when the credential is one
// field of a structured origin — the IPFS peer private key lives inside the identity document
// next to the peer id, which is public and belongs in a ConfigMap rather than a Secret.
const ORIGIN_SEED_FILES = {
  'mariadb-secret': { username: 'mariadb-username', password: 'mariadb-password' },
  'mysql-secret': { username: 'mysql-username', password: 'mysql-password' },
  'postgres-secret': { password: 'postgresql-password' },
  'mongodb-secret': { username: 'mongodb-username', password: 'mongodb-password' },
  // Shared replica-set auth keyfile, mounted as a volume rather than injected as env.
  'mongodb-keyfile': { 'mongodb-keyfile': 'mongodb-keyfile' },
  'ipfs-cluster-secret': {
    'cluster-secret': 'ipfs-cluster-secret',
    'bootstrap-peer-priv-key': { file: 'ipfs-cluster-identity.json', json: 'private_key' },
  },
};

/** Normalizes a registry entry to `{ file, json }`. */
const seedDescriptor = (entry) => (typeof entry === 'string' ? { file: entry, json: '' } : { json: '', ...entry });

/**
 * Resolves an origin seed file, preferring the deploy secret area and falling back to the
 * pre-move location.
 *
 * The fallback is what keeps `--setup` idempotent on a host onboarded before the move: without
 * it the existing credential would look absent and a second one would be generated, encrypted
 * and applied over the password the running data tier is already using.
 * @param {string} fileName - Seed file basename.
 * @returns {string} Path to read the origin credential from.
 * @memberof UnderpostSecret
 */
const originSeedPath = (fileName) => {
  const current = `${DEPLOY_SECRET_DIR}/${fileName}`;
  if (fs.existsSync(current)) return current;
  const legacy = `${LEGACY_SEED_DIR}/${fileName}`;
  return fs.existsSync(legacy) ? legacy : current;
};
const SECRET_ENV_KEYS = {
  'grafana-admin': {
    'admin-user': 'GF_SECURITY_ADMIN_USER',
    'admin-password': 'GF_SECURITY_ADMIN_PASSWORD',
  },
};

// Shell/runtime-critical and Kubernetes-injected env keys that must never be persisted as
// application secrets nor injected into a pod via `envFrom`. An injected PATH (or HOME, etc.)
// overrides the container image's own and breaks coreutils/sudo resolution inside the pod
// ("rm: command not found"). Single source of truth for both container-env capture and the
// `underpost-config` secret built from an env file.
const RESERVED_ENV_KEYS = new Set([
  'HOME',
  'HOSTNAME',
  'PATH',
  'TERM',
  'SHLVL',
  'PWD',
  '_',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'container',
  'SHELL',
  'USER',
  'LOGNAME',
  'MAIL',
  'OLDPWD',
  'LESSOPEN',
  'LESSCLOSE',
  'LS_COLORS',
  'DISPLAY',
  'COLORTERM',
  'EDITOR',
  'VISUAL',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'SSH_AUTH_SOCK',
  'SSH_CLIENT',
  'SSH_CONNECTION',
  'SSH_TTY',
  'XDG_SESSION_ID',
  'XDG_RUNTIME_DIR',
  'XDG_DATA_DIRS',
  'XDG_CONFIG_DIRS',
  'DBUS_SESSION_BUS_ADDRESS',
  'GPG_AGENT_INFO',
  'WINDOWID',
  'DESKTOP_SESSION',
  'SESSION_MANAGER',
  'XAUTHORITY',
  'WAYLAND_DISPLAY',
  'which_declare',
]);
const RESERVED_ENV_KEY_PREFIXES = ['KUBERNETES_', 'npm_', 'NODE_'];
// `NODE_` covers the image's own NODE_VERSION/NODE_OPTIONS, but NODE_ENV is the deployment
// environment itself: the value `underpost-config` exists to carry onto the node, and the one
// `loadConf` reads to pick conf.*.json and .env.<env>. Stripping it made every deploy fall back
// to `development` regardless of the requested environment.
const PRESERVED_ENV_KEYS = new Set(['NODE_ENV']);
const isReservedEnvKey = (key) =>
  !PRESERVED_ENV_KEYS.has(key) &&
  (RESERVED_ENV_KEYS.has(key) || RESERVED_ENV_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)));

// Secrets `--setup` onboards when no explicit list is passed: the full self-hosted data tier.
// `mongodb-keyfile` is listed alongside `mongodb-secret` because the MongoDB StatefulSet mounts
// it as a volume for intra-replica-set auth and will not start without it, so onboarding the
// credentials alone would leave Mongo broken.
const SOPS_SETUP_DEFAULT_SECRETS = ['postgres-secret', 'mariadb-secret', 'mongodb-secret', 'mongodb-keyfile'];

/**
 * Produces a value for a Secret data key that has no origin seed file and no `--args` override.
 * Key-aware because the data tier does not want one shape of secret: a replica-set keyfile is a
 * long base64 blob, a username is an identifier, and everything else is a password.
 * @param {string} key - Secret data key (e.g. 'password', 'username', 'mongodb-keyfile').
 * @returns {string} Generated value.
 * @memberof UnderpostSecret
 */
const generateSeedValue = (key) => {
  if (key === 'username' || key === 'admin-user') return 'admin';
  // MongoDB keyfile: 6-1024 base64 characters shared by every replica-set member. Newlines are
  // stripped so the value round-trips identically through YAML and through
  // MongoBootstrap.readCredential, which strips them too.
  if (key === 'mongodb-keyfile')
    return shellExec(`openssl rand -base64 756`, { stdout: true, silent: true, disableLog: true }).replace(
      /\r?\n/g,
      '',
    );
  return generateRandomPasswordSelection(24);
};

/**
 * @class UnderpostSecret
 * @description Manages the secrets of the application.
 * @memberof UnderpostSecret
 */
class UnderpostSecret {
  static API = {
    // ── canonical domain actions ──────────────────────────────────────────────────────────
    // The seven verbs every domain implements, taking the same normalized context. Everything
    // below them in this file is implementation the CLI no longer reaches directly: tooling
    // install and key generation are automated inside `setup`, and the per-secret operations
    // are addressed through `--args` rather than through flags of their own.

    /**
     * Onboards the workload secret store end to end: installs the SOPS and Age binaries,
     * generates the key and creation rules, encrypts the managed Secrets into the Git-tracked
     * store, then validates and applies them.
     *
     * Every step is idempotent. Notably it never regenerates a credential that already exists —
     * an origin seed file is read through rather than replaced, so re-running this on a live
     * cluster cannot rotate the password the data tier is running on.
     * @param {object} context - Normalized domain context. `--args names=a,b` narrows the set.
     * @returns {*} The onboarding report.
     * @memberof UnderpostSecret
     */
    setup(context = {}) {
      context = domainContextFactory(context);
      return Underpost.secret.setupStore(`${context.args.names ?? ''}`, {
        namespace: context.namespace,
        dryRun: context.dryRun,
        force: context.force,
        args: Object.entries(context.args)
          .filter(([key]) => !['names', 'keys'].includes(key))
          .map(([key, value]) => `${key}=${value}`),
      });
    },

    /**
     * Loads decrypted secret values into the underpost root env store, so a local runtime can
     * read a workload credential without a plaintext file ever touching disk.
     *
     * The local-development half of the propagation contract: production workloads receive these
     * same values through `envFrom` off the Secret `apply` projects, and `npm run dev` receives
     * them here. `--args names=` narrows to one secret.
     * @param {object} context - Normalized domain context.
     * @returns {{loaded: Array<string>, keys: number}} Which secrets were loaded, and how many keys.
     * @memberof UnderpostSecret
     */
    load(context = {}) {
      context = domainContextFactory(context);
      const requested = `${context.args.names ?? ''}`.split(/[,\s]+/).filter(Boolean);
      const names = (requested.length > 0 ? requested : Underpost.secret.managedSecrets()).filter((name) =>
        Underpost.secret.has(name, context.namespace),
      );
      const values = {};
      for (const name of names)
        for (const [key, value] of Object.entries(Underpost.secret.readData(name, context.namespace) ?? {}))
          values[`${name.replace(/-/g, '_').toUpperCase()}_${key.replace(/-/g, '_').toUpperCase()}`] = value;
      if (context.dryRun) {
        logger.info('[dry-run] secret load would populate the root env store', {
          loaded: names,
          keys: Object.keys(values).length,
        });
        return { loaded: names, keys: Object.keys(values).length };
      }
      for (const [key, value] of Object.entries(values)) Underpost.env.set(key, value);
      logger.info('Workload secrets loaded', { loaded: names, keys: Object.keys(values).length });
      return { loaded: names, keys: Object.keys(values).length };
    },

    /**
     * Writes a plaintext Secret manifest into the encrypted store and shreds the source, making
     * SOPS/Age the durable record for it.
     * @param {object} context - Normalized domain context. Requires `--args path=<plaintext.yaml>`.
     * @returns {*} The encryption result.
     * @memberof UnderpostSecret
     */
    publish(context = {}) {
      context = domainContextFactory(context);
      const path = `${context.args.path ?? ''}`.trim();
      if (!path) throw new Error('[secret] publish requires --args path=<plaintext-manifest>');
      return Underpost.secret.encrypt(path, context.namespace, context);
    },

    /**
     * Projects the encrypted store into the cluster: decrypts stored manifests and streams them
     * straight into `kubectl apply`, so plaintext never reaches persistent storage.
     * Idempotent — re-applying converges on the stored values.
     * @param {object} context - Normalized domain context. `--args names=a,b` narrows the set.
     * @returns {*} The apply result.
     * @memberof UnderpostSecret
     */
    apply(context = {}) {
      context = domainContextFactory(context);
      const names = `${context.args.names ?? ''}`.trim();
      if (names) return Underpost.secret.applySelected(names, context.namespace, { dryRun: context.dryRun });
      return Underpost.secret.applyStore(context.namespace, { dryRun: context.dryRun });
    },

    /**
     * Read-only report of the store: tooling, key and recipients, creation rules, stored
     * manifests with decryptability and cluster drift.
     * @param {object} context - Normalized domain context. `--args keys=mongo` narrows by substring.
     * @returns {*} The status report.
     * @memberof UnderpostSecret
     */
    status(context = {}) {
      context = domainContextFactory(context);
      return Underpost.secret.statusReport(`${context.args.keys ?? ''}`, { namespace: context.namespace });
    },

    /**
     * Re-keys every stored manifest onto a new Age recipient. Secret values are unchanged, so no
     * workload restart is needed — this rotates the encryption identity, not the credential.
     * @param {object} context - Normalized domain context. Requires `--args recipient=age1...`;
     *   `prune=true` revokes previous recipients and `keep=` retains named ones.
     * @returns {*} The rotation result.
     * @memberof UnderpostSecret
     */
    rotate(context = {}) {
      context = domainContextFactory(context);
      const recipient = `${context.args.recipient ?? ''}`.trim();
      if (!recipient) throw new Error('[secret] rotate requires --args recipient=<age-public-key>');
      return Underpost.secret.rotateRecipient(recipient, {
        namespace: context.namespace,
        dryRun: context.dryRun,
        force: context.force,
        pruneRecipients: context.args.prune === true || context.args.prune === 'true',
        keepRecipients: `${context.args.keep ?? ''}`,
      });
    },

    /**
     * Withdraws local plaintext traces of workload secrets. The Age private key is kept: the node
     * needs it to re-apply the store on restart. `--args names=` with `--force` additionally
     * purges those secrets from the cluster and takes their manifests out of the store.
     * @param {object} context - Normalized domain context.
     * @returns {{staged: number, purged: Array<string>}} What was withdrawn.
     * @memberof UnderpostSecret
     */
    clean(context = {}) {
      context = domainContextFactory(context);
      const purge = `${context.args.names ?? ''}`.split(/[,\s]+/).filter(Boolean);
      if (purge.length > 0 && !context.force)
        throw new Error('[secret] clean --args names=<secret> removes cluster state; re-run with --force');
      const staged = fs.existsSync(SOPS_STAGE_DIR) ? fs.readdirSync(SOPS_STAGE_DIR).length : 0;
      if (context.dryRun) {
        logger.info('[dry-run] secret clean would withdraw', { staged, purge });
        return { staged, purged: purge };
      }
      if (fs.existsSync(SOPS_STAGE_DIR)) fs.removeSync(SOPS_STAGE_DIR);
      for (const name of purge) Underpost.secret.purge(name, { ...context, namespace: context.namespace });
      logger.info('Workload secret traces withdrawn', { staged, purged: purge });
      return { staged, purged: purge };
    },

    /**
     * @method store
     * @description Git-native encrypted credential management backed by Mozilla SOPS and Age, for
     * fully self-hosted clusters with no cloud KMS or external secret store. Encrypted manifests
     * live in `engine-private/secrets/<namespace>/<name>.enc.yaml` and are safe to commit; the Age
     * private key stays at `~/.config/sops/age/keys.txt` (or `$SOPS_AGE_KEY_FILE`) and is never
     * committed, rendered into a manifest, or shipped into a container. Decryption is always
     * streamed straight into `kubectl apply -f -`, so plaintext never reaches persistent storage.
     * @memberof UnderpostSecret
     */
    /**
     * @method setup
     * @description End-to-end SOPS/Age onboarding for a host: installs tooling, generates the Age
     * keypair and creation rules, pins the key path for non-interactive runs, encrypts the
     * requested Secrets into the Git-tracked store, then validates and applies them.
     *
     * Every step is idempotent and re-runnable. Notably it delegates key generation to
     * `secret sops --init` rather than calling `age-keygen` directly: a bare `age-keygen -o`
     * overwrites an existing key, which would orphan every manifest already encrypted to the
     * previous recipient with no way to recover them.
     *
     * On a host that pulled a store created elsewhere, the freshly generated key is not a recipient
     * of the inherited manifests. `init()` registers this host in the creation rules so what it
     * encrypts from here on stays readable, but existing manifests can only be re-keyed from a host
     * that still holds a decrypting key. That case is reported per secret and then raised by the
     * apply pre-flight with the available remedies, rather than surfacing as a sops decrypt error.
     *
     * Onboards the whole self-hosted data tier by default — PostgreSQL, MariaDB, and MongoDB
     * (`postgres-secret`, `mariadb-secret`, `mongodb-secret`, `mongodb-keyfile`). The MongoDB
     * keyfile is included because the StatefulSet mounts it for intra-replica-set auth and will
     * not start without it. Pass an explicit comma-separated list to narrow the set.
     *
     * Secret values are resolved per data key, in order:
     *   1. the origin seed file, when one exists (`engine-private/postgresql-password`) — this is
     *      the real onboarding path, carrying the credential the cluster already runs on;
     *   2. `--args` as `key=value` pairs, for a value supplied by the operator;
     *   3. a freshly generated value: a base64 keyfile for `mongodb-keyfile`, `admin` for a
     *      `username`, otherwise a 24-character secure password.
     *
     * Plaintext manifests are written by Node under `/dev/shm` at mode 600 and shredded by
     * `encrypt()`. They are never emitted through a shell heredoc, which would place the
     * credential in the command string and therefore in the process table and the command log.
     *
     * Usage:
     *   underpost secret --setup                                   # postgres + mariadb + mongo
     *   underpost secret --setup mongodb-secret,mongodb-keyfile --namespace prod
     *   underpost secret --setup postgres-secret --args "password=s3cr3t"
     *   underpost secret --setup --dry-run                         # stop before mutating cluster
     *   underpost secret --setup --force                           # replace stored manifests
     * @param {string} names - Comma-separated Secret names to onboard. Defaults to the full data
     *   tier: postgres-secret, mariadb-secret, mongodb-secret, mongodb-keyfile.
     * @param {object} options - Onboarding options
     * @param {string} options.namespace - Target namespace for the store and the apply (default: 'default').
     * @param {string} options.args - Comma-separated `key=value` overrides for Secret data keys.
     * @param {boolean} options.dryRun - Validate and server-dry-run only; never apply.
     * @param {boolean} options.force - Replace encrypted manifests that already exist.
     * @memberof UnderpostSecret
     */
    setupStore(names = '', options = {}) {
      const namespace = options.namespace || 'default';
      const secretNames = (names || SOPS_SETUP_DEFAULT_SECRETS.join(','))
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

      // `--args key=value,key2=value2` overrides, applied to any secret that declares that key.
      const overrides = `${options.args || ''}`.split(',').reduce((acc, pair) => {
        const separator = pair.indexOf('=');
        if (separator > 0) acc[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
        return acc;
      }, {});

      logger.info('[secret --setup]', { secretNames, namespace, dryRun: !!options.dryRun, force: !!options.force });

      // 1. Host tooling, then keypair + creation rules. Both no-op when already present.
      Underpost.secret.installTooling();
      Underpost.secret.init();

      // 2. Pin the resolved key path for non-interactive runs (systemd units, CronJobs, sudo).
      //    Written with the concrete path rather than a guessed default, because `sudo` resets
      //    HOME and a wrong guess surfaces later as an opaque decrypt failure.
      const keyFile = Underpost.secret.keyFile();
      shellExec(
        `sudo tee /etc/profile.d/underpost-sops.sh >/dev/null <<'UNDERPOST_SOPS_ENV_EOF'
export SOPS_AGE_KEY_FILE="\${SOPS_AGE_KEY_FILE:-${keyFile}}"
UNDERPOST_SOPS_ENV_EOF`,
      );
      shellExec(`sudo chmod 644 /etc/profile.d/underpost-sops.sh`);

      // 3. Build and encrypt each requested Secret.
      const stageDir = '/dev/shm/underpost-secrets';
      const held = Underpost.secret.localRecipients();
      fs.ensureDirSync(stageDir);
      fs.chmodSync(stageDir, 0o700);
      try {
        for (const name of secretNames) {
          const stored = Underpost.secret.has(name, namespace);
          if (stored && !options.force) {
            // A stored manifest this host cannot open is present but unusable here, so reporting it
            // as onboarded would send the operator on to an apply that is guaranteed to fail.
            if (Underpost.secret.decryptable(Underpost.secret.manifestPath(name, namespace), held))
              logger.info(`${name} is already onboarded in ns/${namespace}; skipping (use --force to replace)`);
            else
              logger.warn(
                `${name} is stored in ns/${namespace} but is sealed to an Age recipient this host does not hold; ` +
                  `skipping. Adopt the store's key, re-key it from a host that holds one, or re-onboard from the ` +
                  `origin seed files with --force.`,
              );
            continue;
          }

          // Data keys come from the secret's origin seed contract, so an onboarded manifest
          // carries exactly the keys the workload's secretKeyRef already expects.
          const seedSources = Underpost.secret.seedSources(name);
          const envKeys = Underpost.secret.seedEnvKeys(name);
          const envValues = Underpost.secret.seedEnvValues(name, options);
          const mappedKeys = [...new Set([...Object.keys(seedSources), ...Object.keys(envKeys)])];
          const dataKeys = mappedKeys.length > 0 ? mappedKeys : ['password'];
          const stringData = {};
          for (const key of dataKeys) {
            const seedPath = seedSources[key];
            if (seedPath && fs.existsSync(seedPath)) {
              stringData[key] = fs.readFileSync(seedPath, 'utf8').trim();
              logger.info(`${name}.${key} seeded from ${seedPath}`);
            } else if (envValues[key] !== undefined) {
              stringData[key] = envValues[key];
              logger.info(`${name}.${key} seeded from the cron deploy environment`);
            } else if (overrides[key] !== undefined) {
              stringData[key] = overrides[key];
              logger.info(`${name}.${key} taken from --args`);
            } else {
              stringData[key] = generateSeedValue(key);
              // Replacing a stored manifest with a value nothing seeded means the credential the
              // running datastore still authenticates against is being thrown away.
              if (stored)
                logger.warn(
                  `${name}.${key} generated while replacing the stored manifest — no seed file at ` +
                    `${seedPath || '(unmapped)'} and no --args override. The running datastore keeps its old ` +
                    `credential until this value is applied to it; pass --args "${key}=<value>" to keep the ` +
                    `existing one.`,
                );
              else logger.info(`${name}.${key} generated`);
            }
          }

          const stagePath = `${stageDir}/${name}.yaml`;
          fs.outputFileSync(
            stagePath,
            [
              'apiVersion: v1',
              'kind: Secret',
              'metadata:',
              `  name: ${name}`,
              `  namespace: ${namespace}`,
              '  labels:',
              '    app.kubernetes.io/managed-by: underpost',
              'type: Opaque',
              'stringData:',
              // Single-quoted YAML scalars with doubled internal quotes: values are generated or
              // operator-supplied and may contain characters YAML would otherwise interpret.
              ...Object.entries(stringData).map(([key, value]) => `  ${key}: '${`${value}`.replace(/'/g, "''")}'`),
              '',
            ].join('\n'),
            'utf8',
          );
          fs.chmodSync(stagePath, 0o600);
          // encrypt() stages, validates, moves into place, and shreds the plaintext source.
          Underpost.secret.encrypt(stagePath, namespace, options);
        }
      } finally {
        // Defense in depth: encrypt() shreds each source, but a throw mid-loop must not leave a
        // plaintext manifest sitting in shared memory.
        fs.removeSync(stageDir);
      }

      Underpost.secret.list();

      // 4. Validate only the requested manifests, then apply unless this is a dry run.
      Underpost.secret.applySelected(secretNames, namespace, { dryRun: true });
      if (options.dryRun) return logger.info('--dry-run: validated only, cluster left unchanged');
      Underpost.secret.applySelected(secretNames, namespace);
    },
    /**
     * @method status
     * @description Reports the live state of the SOPS/Age secret system: host tooling, the Age
     * key and its recipient, the committed creation rules, every stored manifest with whether the
     * local key can open it and whether the cluster still matches, and which managed Secrets are
     * onboarded versus still seeding from their origin path.
     *
     * Read-only and safe to run anywhere. Decryption happens only for the drift check, only for
     * manifests the local key is a recipient of, and only into `kubectl diff` with its output
     * discarded — no secret value is ever printed or written to disk.
     *
     * Usage:
     *   underpost secret --status                                   # every managed key, ns default
     *   underpost secret --status mongo                             # partial match: both mongo keys
     *   underpost secret --status --namespace prod                  # every managed key in ns prod
     * @param {string} filter - Comma-separated managed Secret keys to report on; empty reports all.
     *   Matched as case-insensitive substrings (`mongo` selects mongodb-secret and mongodb-keyfile).
     *   Filters both the stored-manifest listing and the coverage table.
     * @param {object} options - Reporting options
     * @param {string} options.namespace - Namespace to inspect (default: 'default').
     * @memberof UnderpostSecret
     */
    statusReport(filter = '', options = {}) {
      const sops = Underpost.secret;
      // `--namespace` selects the namespace; `path` narrows which managed
      // Secret keys to report on, so the two axes stay independent.
      const namespace = options.namespace || 'default';
      const manageSecretKeyFilter = `${filter || ''}`
        .split(',')
        .map((key) => key.trim().toLowerCase())
        .filter(Boolean);
      // Partial, case-insensitive substring match, so `mongo` reaches both `mongodb-secret` and
      // `mongodb-keyfile` without having to spell either out.
      const matchesKeyFilter = (name) =>
        manageSecretKeyFilter.length === 0 || manageSecretKeyFilter.some((key) => name.toLowerCase().includes(key));
      const mark = (ok) => (ok ? 'yes' : 'no');

      // ── Tooling ────────────────────────────────────────────────────────────
      const version = (bin, flag) =>
        sops.hasBinary(bin)
          ? shellExec(`${bin} ${flag} 2>/dev/null | head -1`, { stdout: true, silent: true, disableLog: true }).trim()
          : '(not installed)';
      logger.info(
        '[secret --status] Tooling\n' +
          `  sops        ${version('sops', '--version')}\n` +
          `  age         ${version('age', '--version')}\n` +
          `  age-keygen  ${sops.hasBinary('age-keygen') ? 'installed' : '(not installed)'}`,
      );

      // ── Age key ────────────────────────────────────────────────────────────
      const keyFile = sops.keyFile();
      const keyExists = fs.existsSync(keyFile);
      // A key file may hold several identities — that is how a host joins a store it did not
      // create — so every check below works against the whole held set, not one recipient.
      const held = sops.localRecipients();
      const keyMode = keyExists ? (fs.statSync(keyFile).mode & 0o777).toString(8) : '';
      logger.info(
        '[secret --status] Age key\n' +
          `  path        ${keyFile}\n` +
          `  present     ${mark(keyExists)}${keyExists ? `  (mode ${keyMode}${keyMode === '600' || keyMode === '400' ? '' : ' — INSECURE, run chmod 600'})` : ''}\n` +
          `  recipients  ${held.join(', ') || (keyExists ? '(none — unreadable key file)' : '(none)')}` +
          (keyExists ? '' : `\n  searched    ${sops.keyFileCandidates().join(', ')}`),
      );

      // ── Creation rules ─────────────────────────────────────────────────────
      const confPath = './engine-private/secrets/.sops.yaml';
      const ruleRecipients = sops.creationRecipients();
      logger.info(
        '[secret --status] Creation rules\n' +
          `  config      ${confPath} ${fs.existsSync(confPath) ? '' : '(missing — run: underpost secret sops --init)'}\n` +
          `  recipients  ${ruleRecipients.length > 0 ? ruleRecipients.join(', ') : '(none)'}\n` +
          `  local key listed  ${mark(held.some((recipient) => ruleRecipients.includes(recipient)))}`,
      );

      // ── Stored manifests ───────────────────────────────────────────────────
      const manifests = sops.manifests(namespace).filter((manifest) => matchesKeyFilter(manifest.name));
      const onboarded = new Set();
      if (manifests.length === 0)
        logger.warn(
          `[secret --status] Store\n  no encrypted manifests in ns/${namespace}` +
            (manageSecretKeyFilter.length > 0 ? ` matching ${manageSecretKeyFilter.join(', ')}` : ''),
        );
      else {
        const rows = manifests.map((manifest) => {
          onboarded.add(manifest.name);
          const recipients = sops.manifestRecipients(manifest.path);
          const decryptable = sops.decryptable(manifest.path, held);
          const live = shellExec(
            `kubectl get secret ${manifest.name} -n ${manifest.namespace} --ignore-not-found -o name 2>/dev/null || true`,
            { stdout: true, silent: true, silentOnError: true, disableLog: true },
          ).trim();
          // Drift is decided by kubectl's exit code; its stdout would contain the decrypted
          // values, so it is discarded rather than captured.
          let sync = 'n/a';
          if (live && decryptable) {
            const result = shellExec(
              `bash -c 'set -o pipefail; SOPS_AGE_KEY_FILE="${keyFile}" sops --decrypt "${manifest.path}" ` +
                `| kubectl diff -f - -n "${manifest.namespace}" >/dev/null 2>&1'`,
              { silentOnError: true, disableLog: true, stdout: false },
            );
            sync = result.code === 0 ? 'in-sync' : result.code === 1 ? 'DRIFT' : 'error';
          } else if (!live) sync = 'not applied';
          else if (!decryptable) sync = 'no local key';
          return (
            `  ${`${manifest.namespace}/${manifest.name}`.padEnd(34)} ` +
            `recipients=${String(recipients.length).padEnd(3)} ` +
            `decryptable=${mark(decryptable).padEnd(4)} ` +
            `live=${mark(!!live).padEnd(4)} ` +
            `${sync}`
          );
        });
        logger.info(`[secret --status] Store — ns/${namespace} (${manifests.length} manifest(s))\n` + rows.join('\n'));
      }

      // ── Coverage ───────────────────────────────────────────────────────────
      const coverage = sops
        .managedSecrets()
        .filter(matchesKeyFilter)
        .map((name) => {
          const seeds = Object.values(sops.seedSources(name));
          const seedPresent = seeds.length > 0 && seeds.every((seed) => fs.existsSync(seed));
          const envKeys = Object.keys(sops.seedEnvKeys(name));
          const envValues = sops.seedEnvValues(name);
          const envPresent = envKeys.length > 0 && envKeys.every((key) => envValues[key] !== undefined);
          let source = 'unmapped';
          if (onboarded.has(name)) source = 'sops';
          else if (seedPresent) source = 'origin seed';
          else if (envPresent) source = 'cron env';
          else if (seeds.length || envKeys.length) source = 'MISSING';
          return `  ${name.padEnd(24)} ${source.padEnd(12)} ${
            seeds.length ? `seed=${mark(seedPresent)}` : envKeys.length ? `env=${mark(envPresent)}` : ''
          }`;
        });
      if (coverage.length === 0)
        logger.warn(
          `[secret --status] Coverage\n  no managed Secret matches ${manageSecretKeyFilter.join(', ')}\n` +
            `  known keys: ${sops.managedSecrets().join(', ')}`,
        );
      else
        logger.info(
          '[secret --status] Coverage (which source each managed Secret deploys from)\n' + coverage.join('\n'),
        );
    },
    /**
     * @method keyFileCandidates
     * @description Ordered paths the Age private key is looked for, matching what sops itself
     * resolves. Surfaced separately so a "key not found" error can name every location tried —
     * the identity-context trap is a key generated as an unprivileged user but read back under
     * `sudo`, where `os.homedir()` points at root's home instead.
     * @returns {Array<string>} Candidate paths, highest precedence first.
     * @memberof UnderpostSecret
     */
    keyFileCandidates() {
      const candidates = [];
      if (process.env.SOPS_AGE_KEY_FILE) candidates.push(process.env.SOPS_AGE_KEY_FILE);
      if (process.env.XDG_CONFIG_HOME) candidates.push(`${process.env.XDG_CONFIG_HOME}/sops/age/keys.txt`);
      candidates.push(`${os.homedir()}/.config/sops/age/keys.txt`);
      // Under `sudo`, the invoking user's key is the one the operator actually generated.
      // Offered as a diagnostic hint only — never resolved implicitly, since silently reading a
      // different user's private key would make the effective identity non-obvious.
      if (process.env.SUDO_USER) candidates.push(`/home/${process.env.SUDO_USER}/.config/sops/age/keys.txt`);
      return [...new Set(candidates)];
    },

    /**
     * @method keyFile
     * @description Resolves the Age private key path. Honors `SOPS_AGE_KEY_FILE` then
     * `XDG_CONFIG_HOME`, matching sops' own resolution so key location has a single source of
     * truth. Deliberately resolves a *path*, never key material — `SOPS_AGE_KEY` would expose the
     * private key in `/proc/<pid>/environ` and in any process listing.
     * @returns {string} Path to the Age private key file (may not exist yet).
     * @memberof UnderpostSecret
     */
    keyFile() {
      if (process.env.SOPS_AGE_KEY_FILE) return process.env.SOPS_AGE_KEY_FILE;
      if (process.env.XDG_CONFIG_HOME) return `${process.env.XDG_CONFIG_HOME}/sops/age/keys.txt`;
      return `${os.homedir()}/.config/sops/age/keys.txt`;
    },

    /**
     * @method assertKeyFile
     * @description Resolves the Age private key and refuses to proceed unless it exists and is
     * unreadable by group/other. A key at mode 0644 is a disclosed key, so this fails closed
     * rather than warning. When the resolved path is missing it names every candidate checked,
     * including the invoking user's home under `sudo`, so the identity mismatch is diagnosable
     * instead of presenting as a decrypt failure.
     * @returns {string} Verified key file path.
     * @memberof UnderpostSecret
     */
    assertKeyFile() {
      const keyFile = Underpost.secret.keyFile();
      if (!fs.existsSync(keyFile)) {
        const alternatives = Underpost.secret
          .keyFileCandidates()
          .filter((candidate) => candidate !== keyFile && fs.existsSync(candidate));
        throw new Error(
          `Age private key not found: ${keyFile} (running as uid ${process.getuid?.() ?? '?'})` +
            (alternatives.length
              ? `. A key does exist at ${alternatives.join(', ')} — re-run with ` +
                `SOPS_AGE_KEY_FILE=<path>, or copy it to ${keyFile}.`
              : `. Run: underpost secret sops --init`),
        );
      }
      const mode = fs.statSync(keyFile).mode & 0o777;
      if (mode & 0o077)
        throw new Error(
          `Age private key ${keyFile} is group/world accessible (mode ${mode.toString(8)}). ` +
            `Run: chmod 600 ${keyFile}`,
        );
      return keyFile;
    },

    /**
     * @method managedSecrets
     * @description Names of every Secret wired to prefer the encrypted store, with the origin
     * seed path as fallback. Used for coverage reporting.
     * @returns {Array<string>} Managed Secret names.
     * @memberof UnderpostSecret
     */
    managedSecrets() {
      return [...MANAGED_SECRETS];
    },

    /**
     * @method seedSources
     * @description Origin seed files a secret can be onboarded from, as `{ dataKey: path }`.
     * The mapping is the contract between the plaintext seeding in cluster init
     * (`--from-file=<key>=<path>`) and the keys a workload's `secretKeyRef` expects, so an
     * onboarded manifest carries exactly the keys the workload already reads.
     * @param {string} name - Secret name (e.g. 'postgres-secret').
     * @returns {Object<string, string>} Data key to seed file path; empty for unknown secrets.
     * @memberof UnderpostSecret
     */
    seedSources(name) {
      return Object.fromEntries(
        Object.entries(ORIGIN_SEED_FILES[name] || {}).map(([dataKey, entry]) => [
          dataKey,
          originSeedPath(seedDescriptor(entry).file),
        ]),
      );
    },

    /**
     * @method seedValues
     * @description Reads a secret's origin credentials as `{ dataKey: value }`, extracting the
     * named field where the origin is a structured document rather than a bare credential file.
     * Returns only the keys whose origin file is present, so callers can distinguish a partial
     * origin from an absent one.
     * @param {string} name - Managed secret name.
     * @returns {Object<string, string>} Data key to credential value.
     * @memberof UnderpostSecret
     */
    seedValues(name) {
      const values = {};
      for (const [dataKey, entry] of Object.entries(ORIGIN_SEED_FILES[name] || {})) {
        const { file, json } = seedDescriptor(entry);
        const path = originSeedPath(file);
        if (!fs.existsSync(path)) continue;
        const raw = fs.readFileSync(path, 'utf8');
        if (!json) {
          values[dataKey] = raw.trim();
          continue;
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          throw new Error(`[${name}] origin ${path} is not valid JSON: ${error.message}`);
        }
        if (parsed?.[json] === undefined) throw new Error(`[${name}] origin ${path} has no '${json}' field`);
        values[dataKey] = `${parsed[json]}`;
      }
      return values;
    },

    /** Environment keys that seed a managed Secret. */
    seedEnvKeys(name) {
      return { ...(SECRET_ENV_KEYS[name] || {}) };
    },

    /** Resolves present environment-backed seed values without logging them. */
    seedEnvValues(name, options = {}) {
      if (name !== 'grafana-admin') return {};
      const credentials = Underpost.host.grafanaAdmin({ ...options, required: false });
      return {
        ...(credentials.username ? { 'admin-user': credentials.username } : {}),
        ...(credentials.password ? { 'admin-password': credentials.password } : {}),
      };
    },

    /**
     * @method applyFromOriginSeed
     * @description Projects a workload secret straight from its origin seed files into a
     * Kubernetes Secret, for a cluster whose credentials are not onboarded into the encrypted
     * store yet.
     *
     * The fallback half of `applyIfPresent(name) || applyFromOriginSeed(name)`: SOPS/Age stays
     * the source of truth wherever a manifest exists, and this keeps a not-yet-onboarded
     * cluster deploying exactly as before. Paths come from {@link UnderpostSecret.workload.seedSources},
     * so callers never spell out a credential path of their own.
     *
     * Idempotent: `--dry-run=client | kubectl apply` converges on the seed contents.
     * @param {string} name - Managed secret name (e.g. 'postgres-secret').
     * @param {string} [namespace='default'] - Target namespace.
     * @returns {boolean} True when the Secret was applied; false when no seed file is present.
     * @memberof UnderpostSecret
     */
    applyFromOriginSeed(name, namespace = 'default') {
      const sources = Underpost.secret.seedSources(name);
      const dataKeys = Object.keys(sources);
      if (dataKeys.length === 0) {
        logger.warn('No origin seed registered for secret; nothing to project', { name });
        return false;
      }
      const values = Underpost.secret.seedValues(name);
      const missing = dataKeys.filter((key) => values[key] === undefined);
      if (missing.length === dataKeys.length) {
        logger.warn('No origin seed files present for secret; nothing to project', { name, sources });
        return false;
      }
      if (missing.length > 0)
        throw new Error(`[${name}] incomplete origin seed: ${missing.map((key) => sources[key]).join(', ')} missing`);
      // Values are staged on tmpfs and projected with `--from-file` rather than passed as
      // `--from-literal`: a literal puts the credential in the command string, where it is
      // visible in the process table for the life of the call.
      const stageDir = `/dev/shm/underpost-origin-seed-${name}`;
      try {
        fs.ensureDirSync(stageDir);
        fs.chmodSync(stageDir, 0o700);
        const fromFile = dataKeys
          .map((key) => {
            const stagePath = `${stageDir}/${key}`;
            fs.writeFileSync(stagePath, values[key]);
            fs.chmodSync(stagePath, 0o600);
            return `--from-file=${key}=${stagePath}`;
          })
          .join(' ');
        shellExec(
          `sudo kubectl create secret generic ${name} ${fromFile} --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
        );
      } finally {
        fs.removeSync(stageDir);
      }
      logger.info('Workload secret projected from origin seed', { name, namespace, keys: dataKeys });
      return true;
    },

    /**
     * @method manifestPath
     * @description Builds the canonical store path for an encrypted Secret manifest.
     * @param {string} name - Secret name (e.g. 'postgres-secret').
     * @param {string} [namespace='default'] - Kubernetes namespace.
     * @returns {string} Path to the `.enc.yaml` manifest.
     * @memberof UnderpostSecret
     */
    manifestPath(name, namespace = 'default') {
      return `${SOPS_SECRETS_DIR}/${namespace}/${name}${SOPS_MANIFEST_EXT}`;
    },

    /**
     * @method has
     * @description Reports whether an encrypted manifest exists for a secret. Lets callers
     * prefer the SOPS store while keeping the origin seed path for clusters not yet onboarded.
     * Existence only — integrity is {@link assertManifest}'s job, so a corrupt manifest is a
     * hard failure rather than a silent slide back to the seed path.
     * @param {string} name - Secret name.
     * @param {string} [namespace='default'] - Kubernetes namespace.
     * @returns {boolean} True when the encrypted manifest is present.
     * @memberof UnderpostSecret
     */
    has(name, namespace = 'default') {
      return fs.existsSync(Underpost.secret.manifestPath(name, namespace));
    },

    /**
     * @method manifestMeta
     * @description Reads the unencrypted envelope of a stored manifest: `kind`, `metadata.name`,
     * `metadata.namespace`, and whether a `sops:` block is present. `encrypted_regex` leaves all
     * of this in plaintext by design, so the check needs no private key and can run before any
     * decrypt is attempted.
     * @param {string} manifestPath - Path to the `.enc.yaml` manifest.
     * @returns {{kind: string, name: string, namespace: string, encrypted: boolean}} Envelope facts.
     * @memberof UnderpostSecret
     */
    manifestMeta(manifestPath) {
      const content = fs.readFileSync(manifestPath, 'utf8');
      const field = (pattern) => (content.match(pattern) || [])[1] || '';
      return {
        kind: field(/^kind:\s*(\S+)/m),
        name: field(/^\s{2,}name:\s*(\S+)/m),
        namespace: field(/^\s{2,}namespace:\s*(\S+)/m),
        encrypted: /^sops:/m.test(content) && /ENC\[AES256_GCM/.test(content),
      };
    },

    /**
     * @method assertManifest
     * @description Fails closed on a manifest that exists but is not what the caller asked for.
     * Guards three silent-failure modes that a plain existence check misses: a plaintext file
     * that was never encrypted (credential disclosure in Git), a non-Secret resource, and a
     * name/namespace mismatch — the last of which would otherwise apply cleanly while leaving
     * the workload's `secretKeyRef` permanently unresolvable.
     * @param {string} manifestPath - Path to the `.enc.yaml` manifest.
     * @param {object} [expect={}] - Expected envelope.
     * @param {string} [expect.name] - Required `metadata.name`.
     * @param {string} [expect.namespace] - Required `metadata.namespace` when the manifest sets one.
     * @memberof UnderpostSecret
     */
    assertManifest(manifestPath, expect = {}) {
      if (!fs.existsSync(manifestPath)) throw new Error(`Encrypted manifest not found: ${manifestPath}`);
      const meta = Underpost.secret.manifestMeta(manifestPath);
      if (!meta.encrypted)
        throw new Error(
          `${manifestPath} carries no sops metadata — it is not encrypted. Refusing to apply; ` +
            `treat any credential in it as disclosed and rotate it.`,
        );
      if (meta.kind && meta.kind !== 'Secret') throw new Error(`${manifestPath} is a ${meta.kind}, not a Secret`);
      if (expect.name && meta.name && meta.name !== expect.name)
        throw new Error(
          `${manifestPath} declares metadata.name "${meta.name}" but is stored as "${expect.name}". ` +
            `Applying it would leave secretKeyRef "${expect.name}" unresolved.`,
        );
      if (expect.namespace && meta.namespace && meta.namespace !== expect.namespace)
        throw new Error(
          `${manifestPath} declares metadata.namespace "${meta.namespace}" but is being applied to ` +
            `"${expect.namespace}".`,
        );
    },

    /**
     * @method localRecipients
     * @description Every Age recipient this host holds a private key for. A key file may carry
     * more than one identity — that is exactly how a host joins a store it did not create, by
     * appending the origin host's key alongside its own — so this returns all of them rather
     * than assuming one. Never throws: an absent or unreadable key file is a legitimate state
     * for a host that has not been onboarded yet, reported as an empty set.
     * @returns {Array<string>} The `age1…` recipients derived from the local key file.
     * @memberof UnderpostSecret
     */
    localRecipients() {
      const keyFile = Underpost.secret.keyFile();
      if (!fs.existsSync(keyFile)) return [];
      const output = shellExec(`age-keygen -y "${keyFile}"`, {
        stdout: true,
        silent: true,
        silentOnError: true,
        disableLog: true,
      });
      return [...new Set(`${output || ''}`.match(/age1[0-9a-z]+/g) || [])];
    },

    /**
     * @method recipient
     * @description Derives the primary Age public recipient from the private key — the one new
     * manifests are encrypted to. The reverse is not possible, so this is safe to log and to
     * commit into `.sops.yaml`.
     * @returns {string} The `age1…` public recipient.
     * @memberof UnderpostSecret
     */
    recipient() {
      const keyFile = Underpost.secret.keyFile();
      if (!fs.existsSync(keyFile)) throw new Error(`Age private key not found: ${keyFile}`);
      const recipients = Underpost.secret.localRecipients();
      if (recipients.length === 0)
        throw new Error(`No Age identity could be read from ${keyFile}. Run: underpost secret sops --init`);
      return recipients[0];
    },

    /**
     * @method decryptable
     * @description Reports whether the local key can open a stored manifest, by set-intersecting
     * the manifest's plaintext `sops:` recipients with the identities this host holds. Needs no
     * decrypt attempt and no private key material, so it is safe to call as a pre-flight on every
     * manifest before the first mutation.
     * @param {string} manifestPath - Path to the `.enc.yaml` manifest.
     * @param {Array<string>} [held] - Locally held recipients; resolved from the key file when omitted.
     * @returns {boolean} True when at least one recipient of the manifest is held locally.
     * @memberof UnderpostSecret
     */
    decryptable(manifestPath, held = Underpost.secret.localRecipients()) {
      if (held.length === 0) return false;
      return Underpost.secret.manifestRecipients(manifestPath).some((recipient) => held.includes(recipient));
    },

    /**
     * @method assertDecryptable
     * @description Fails closed, and legibly, on the store-adoption trap: a host that pulled an
     * encrypted store created elsewhere holds a key that is not among the manifests' recipients.
     * sops reports that as "no identity matched any of the recipients" from inside a decrypt
     * pipe, which names neither the manifest nor a way out; this raises first, listing every
     * unreadable manifest, the recipients it is sealed to, the identities this host actually
     * holds, and the three ways to resolve it.
     * @param {Array<{namespace: string, name: string, path: string}>} manifests - Manifests to check.
     * @memberof UnderpostSecret
     */
    assertDecryptable(manifests) {
      const held = Underpost.secret.localRecipients();
      const unreadable = manifests.filter((manifest) => !Underpost.secret.decryptable(manifest.path, held));
      if (unreadable.length === 0) return;
      const local =
        held.length > 0 ? held.join(', ') : `(none — no readable Age identity at ${Underpost.secret.keyFile()})`;
      throw new Error(
        `${unreadable.length} encrypted manifest(s) are sealed to Age recipients this host does not hold, ` +
          `so they cannot be decrypted here:\n` +
          unreadable
            .map(
              (manifest) =>
                `  ${manifest.namespace}/${manifest.name} -> ` +
                `${Underpost.secret.manifestRecipients(manifest.path).join(', ') || 'no age recipients'}`,
            )
            .join('\n') +
          `\n  this host holds: ${local}\n` +
          `Resolve with exactly one of:\n` +
          `  1. Install the key that already opens them — append the origin host's ` +
          `${Underpost.secret.keyFile()} to this host's own (one file may hold several identities), ` +
          `chmod 600 it, then re-run.\n` +
          `  2. Re-key the store from a host that still holds that key: ` +
          `underpost secret sops --rotate --recipient <this host's recipient>, commit engine-private/secrets, ` +
          `pull here, then re-run.\n` +
          `  3. Re-onboard from this host's origin seed files, replacing the stored manifests: ` +
          `underpost secret --setup --force. Valid only when those seed files carry the credentials the ` +
          `cluster already runs on — any regenerated value must also be applied to the running datastore.`,
      );
    },

    /**
     * @method init
     * @description Generates the Age keypair and the `.sops.yaml` creation rule when absent.
     * Idempotent, and never overwrites an existing key: regenerating would orphan every manifest
     * already encrypted to the previous recipient, with no way to recover them.
     * @memberof UnderpostSecret
     */
    init() {
      Underpost.secret.assertTooling(['age-keygen', 'sops']);
      const keyFile = Underpost.secret.keyFile();
      if (fs.existsSync(keyFile)) logger.info(`Age key already present; reusing ${keyFile}`);
      else {
        fs.ensureDirSync(keyFile.slice(0, keyFile.lastIndexOf('/')));
        shellExec(`umask 077 && age-keygen -o "${keyFile}"`);
      }
      shellExec(`chmod 600 "${keyFile}"`);

      const recipient = Underpost.secret.recipient();
      const sopsConfPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
      if (fs.existsSync(sopsConfPath)) {
        logger.info(`Creation rules already present; leaving ${sopsConfPath} intact`);
        Underpost.secret.repairCreationRules();
        Underpost.secret.ensureCreationRecipient(recipient);
      } else {
        fs.outputFileSync(
          sopsConfPath,
          [
            'creation_rules:',
            `  - path_regex: ${SOPS_MANIFEST_PATH_REGEX}`,
            `    encrypted_regex: '${SOPS_ENCRYPTED_REGEX}'`,
            `    age: ${recipient}`,
            '',
          ].join('\n'),
          'utf8',
        );
        logger.info(`Created ${sopsConfPath}`);
      }
      logger.info(`Age recipient: ${recipient}`);
      logger.warn(`Back up ${keyFile} offline. Without it every encrypted manifest is unrecoverable.`);
    },

    /**
     * @method ensureCreationRecipient
     * @description Registers this host's recipient in an inherited `.sops.yaml` so anything it
     * encrypts from now on, it can also decrypt. Without this, a host that pulled a store created
     * elsewhere encrypts to the *other* host's recipient only, producing manifests it cannot read
     * back — a failure that surfaces later as an opaque decrypt error rather than at write time.
     *
     * Strictly additive: no existing recipient loses access, and existing manifests are left
     * untouched, since re-keying them requires a private key that can still decrypt (see
     * {@link rotate}). Left alone when the rule lists no `age:` recipients at all, which means a
     * deliberately non-Age rule rather than a store this host should join.
     * @param {string} recipient - This host's `age1…` public recipient.
     * @returns {boolean} True when the creation rule was rewritten.
     * @memberof UnderpostSecret
     */
    ensureCreationRecipient(recipient) {
      const confPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
      if (!fs.existsSync(confPath) || !recipient) return false;
      const current = Underpost.secret.creationRecipients();
      if (current.includes(recipient)) return false;
      if (current.length === 0) {
        logger.warn(
          `${confPath} declares no age recipients; leaving it untouched. Add ${recipient} manually if this ` +
            `host is meant to encrypt into this store.`,
        );
        return false;
      }
      Underpost.secret.writeCreationRecipients([...current, recipient]);
      logger.warn(
        `Registered this host's recipient in ${confPath} so manifests it encrypts stay readable here. ` +
          `Existing manifests are NOT re-keyed by this — run \`underpost secret sops --rotate --recipient ` +
          `${recipient}\` from a host that can still decrypt them, then commit ${SOPS_SECRETS_DIR}.`,
        { added: recipient, recipients: [...current, recipient] },
      );
      return true;
    },

    /**
     * @method repairCreationRules
     * @description Rewrites a `path_regex` that can never match, in place, preserving recipients
     * and every other setting. Configs written before the relative-path semantics were understood
     * carry an `engine-private/secrets/` prefix; because sops matches relative to the directory
     * holding `.sops.yaml`, that rule matches nothing and every encrypt fails with
     * "no matching creation rules found". Repairs only that known-broken form, so a deliberately
     * customized rule is left alone.
     * @returns {boolean} True when the file was rewritten.
     * @memberof UnderpostSecret
     */
    repairCreationRules() {
      const confPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
      if (!fs.existsSync(confPath)) return false;
      const lines = fs.readFileSync(confPath, 'utf8').split('\n');
      // The rule is the first key of a YAML list item, so the line carries a `- ` marker that
      // has to be preserved: `  - path_regex: …`.
      const brokenRule = /^(\s*(?:-\s*)?)path_regex:\s*.*engine-private\/secrets\//;
      const index = lines.findIndex((line) => brokenRule.test(line));
      if (index === -1) return false;
      const prefix = lines[index].match(brokenRule)[1];
      const previous = lines[index].trim();
      lines[index] = `${prefix}path_regex: ${SOPS_MANIFEST_PATH_REGEX}`;
      fs.writeFileSync(confPath, lines.join('\n'), 'utf8');
      logger.warn(
        `Repaired an unmatchable creation rule in ${confPath}: sops matches path_regex relative to ` +
          `that file's own directory, so the store prefix never matched.`,
        { from: previous, to: `path_regex: ${SOPS_MANIFEST_PATH_REGEX}` },
      );
      return true;
    },

    /**
     * @method encrypt
     * @description Encrypts a plaintext Secret manifest into the Git-tracked store and shreds the
     * source. Recipients resolve from the committed `.sops.yaml`, so a manifest cannot be
     * encrypted to an unlisted key. Author the plaintext under `/dev/shm` so it never touches
     * persistent storage.
     * Written via a staged temp file and moved into place only after the output validates. A
     * bare `sops … > out` redirect has the shell truncate `out` before sops runs, so a failed
     * encrypt would destroy an existing manifest and leave a zero-byte file in its place.
     * @param {string} plaintextPath - Path to the plaintext Secret manifest.
     * @param {string} [namespace='default'] - Target namespace directory in the store.
     * @param {object} [options={}] - Encryption options.
     * @param {boolean} [options.force=false] - Replace an existing manifest at the target path.
     * @returns {string} Path of the written encrypted manifest.
     * @memberof UnderpostSecret
     */
    encrypt(plaintextPath, namespace = 'default', options = {}) {
      Underpost.secret.assertTooling(['sops']);
      if (!plaintextPath || !fs.existsSync(plaintextPath))
        throw new Error(`Plaintext manifest not found: ${plaintextPath}`);
      const sopsConfPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
      if (!fs.existsSync(sopsConfPath))
        throw new Error(`Missing creation rules: ${sopsConfPath} (run: underpost secret sops --init)`);

      const sourceMeta = Underpost.secret.manifestMeta(plaintextPath);
      if (sourceMeta.encrypted)
        throw new Error(
          `${plaintextPath} already carries sops metadata. Re-encrypting would double-wrap it; ` +
            `edit it in place with: sops ${plaintextPath}`,
        );

      const name = plaintextPath
        .split('/')
        .pop()
        .replace(/\.ya?ml$/, '');
      const outPath = Underpost.secret.manifestPath(name, namespace);
      if (fs.existsSync(outPath) && !options.force)
        throw new Error(`${outPath} already exists. Edit it with \`sops ${outPath}\`, or pass --force to replace.`);
      fs.ensureDirSync(`${SOPS_SECRETS_DIR}/${namespace}`);

      // Encrypt to a temp file and move into place only on success. A bare `sops … > out` has the
      // shell truncate `out` before sops runs, so a failed encrypt destroys the manifest that was
      // already there and leaves an empty file the apply path would happily skip over.
      const stagePath = `${outPath}.staged`;
      try {
        // `--filename-override` makes sops match creation_rules against the destination path
        // rather than the tmpfs source. Without it the rule never matches, because the plaintext
        // deliberately lives outside the store (in /dev/shm) and is not named `*.enc.yaml`.
        shellExec(
          `sops --config "${sopsConfPath}" --filename-override "${outPath}" ` +
            `--encrypt "${plaintextPath}" > "${stagePath}"`,
        );
        Underpost.secret.assertManifest(stagePath, { name });
        // Sealing to a recipient held elsewhere is legitimate (encrypting *for* another host),
        // so this warns rather than fails — but it is also the shape of the store-adoption trap,
        // where it would otherwise only surface at the next apply.
        if (!Underpost.secret.decryptable(stagePath))
          logger.warn(
            `${outPath} is sealed to ${Underpost.secret.manifestRecipients(stagePath).join(', ')}, none of ` +
              `which this host holds a private key for — it cannot be decrypted here. Add this host's recipient ` +
              `to ${sopsConfPath} and re-encrypt if that is not intended.`,
          );
        fs.moveSync(stagePath, outPath, { overwrite: true });
      } finally {
        fs.removeSync(stagePath);
      }

      shellExec(`shred -u "${plaintextPath}" 2>/dev/null || rm -f "${plaintextPath}"`, { silentOnError: true });
      logger.info(`Encrypted -> ${outPath}`);
      return outPath;
    },

    /**
     * @method apply
     * @description Decrypts every encrypted manifest for a namespace and streams each one
     * directly into `kubectl apply -f -`. Plaintext exists only in an anonymous kernel pipe.
     * @param {string} [namespace='default'] - Target namespace.
     * @param {object} [options={}] - Apply options.
     * @param {boolean} [options.dryRun=false] - Perform a server-side dry run instead of applying.
     * @returns {number} Count of manifests applied.
     * @memberof UnderpostSecret
     */
    applyStore(namespace = 'default', options = {}) {
      const dir = `${SOPS_SECRETS_DIR}/${namespace}`;
      if (!fs.existsSync(dir)) throw new Error(`No encrypted secrets for namespace: ${namespace}`);
      const manifests = Underpost.secret.manifests(namespace);
      if (manifests.length === 0) throw new Error(`No *${SOPS_MANIFEST_EXT} manifests under ${dir}`);

      // Validate-then-commit. Applying in a single pass means manifest N failing to decrypt
      // leaves 1..N-1 already live — a half-rotated namespace nobody asked for. The envelope
      // check plus a server dry run of every manifest catches wrong-key, malformed-YAML, schema
      // and RBAC failures before the first mutation.
      for (const manifest of manifests)
        Underpost.secret.assertManifest(manifest.path, { name: manifest.name, namespace });
      Underpost.secret.assertDecryptable(manifests);
      if (!options.dryRun)
        for (const manifest of manifests)
          Underpost.secret.applyManifest(manifest.path, namespace, {
            ...options,
            dryRun: true,
            quiet: true,
          });

      for (const manifest of manifests) Underpost.secret.applyManifest(manifest.path, namespace, options);
      logger.info(`${options.dryRun ? 'Validated' : 'Applied'} ${manifests.length} manifest(s) in ns/${namespace}`);
      return manifests.length;
    },

    /** Applies a named subset without requiring access to unrelated manifests in the namespace. */
    applySelected(names, namespace = 'default', options = {}) {
      const manifests = [...new Set(names)]
        .filter((name) => Underpost.secret.has(name, namespace))
        .map((name) => ({
          name,
          namespace,
          path: Underpost.secret.manifestPath(name, namespace),
        }));
      if (manifests.length === 0) throw new Error(`No requested encrypted secrets for namespace: ${namespace}`);
      for (const manifest of manifests)
        Underpost.secret.assertManifest(manifest.path, { name: manifest.name, namespace });
      Underpost.secret.assertDecryptable(manifests);
      for (const manifest of manifests)
        Underpost.secret.applyManifest(manifest.path, namespace, {
          ...options,
          expectName: manifest.name,
          quiet: true,
        });
      logger.info(
        `${options.dryRun ? 'Validated' : 'Applied'} ${manifests.length} selected manifest(s) in ns/${namespace}`,
      );
      return manifests.length;
    },

    /**
     * @method applyManifest
     * @description Streams one encrypted manifest through `sops --decrypt` into `kubectl apply`.
     * Runs under an explicit `bash -c` with `pipefail`, which is load-bearing: without it a sops
     * failure yields an empty stream and `kubectl apply -f -` exits 0, silently applying nothing.
     * `disableLog` keeps the command (and therefore the key path) out of the log stream.
     * @param {string} manifestPath - Path to the `.enc.yaml` manifest.
     * @param {string} [namespace='default'] - Target namespace.
     * @param {object} [options={}] - Apply options.
     * @param {boolean} [options.dryRun=false] - Perform a server-side dry run instead of applying.
     * @param {string} [options.expectName] - Require this `metadata.name` in the manifest envelope.
     * @param {boolean} [options.quiet=false] - Suppress the per-manifest log line.
     * @memberof UnderpostSecret
     */
    applyManifest(manifestPath, namespace = 'default', options = {}) {
      // Envelope first: it needs no private key, so a malformed or unencrypted store is reported
      // as such even on a host whose key is missing or wrongly permissioned.
      Underpost.secret.assertManifest(manifestPath, { name: options.expectName, namespace });
      // Recipient set next: a manifest sealed to a key this host does not hold fails inside the
      // decrypt pipe with an error that names neither the file nor a remedy.
      Underpost.secret.assertDecryptable([
        { namespace, name: options.expectName || manifestPath.split('/').pop(), path: manifestPath },
      ]);
      Underpost.secret.assertTooling(['sops']);
      const keyFile = Underpost.secret.assertKeyFile();
      const dryRun = options.dryRun ? ' --dry-run=server' : '';
      shellExec(
        `bash -c 'set -o pipefail; SOPS_AGE_KEY_FILE="${keyFile}" sops --decrypt "${manifestPath}" ` +
          `| kubectl apply -f -${dryRun} -n "${namespace}"'`,
        { disableLog: true },
      );
      if (!options.quiet) logger.info(`${options.dryRun ? 'Dry-run' : 'Applied'} ${manifestPath} -> ns/${namespace}`);
    },

    /** Decrypts one stored Secret through an anonymous pipe and returns its data in memory. */
    readData(name, namespace = 'default') {
      const manifestPath = Underpost.secret.manifestPath(name, namespace);
      Underpost.secret.assertManifest(manifestPath, { name, namespace });
      Underpost.secret.assertDecryptable([{ namespace, name, path: manifestPath }]);
      Underpost.secret.assertTooling(['sops']);
      const keyFile = Underpost.secret.assertKeyFile();
      const source = shellExec(
        `bash -c 'set -o pipefail; SOPS_AGE_KEY_FILE="${keyFile}" sops --decrypt "${manifestPath}" ` +
          `| kubectl create --dry-run=client -f - -o json'`,
        { stdout: true, silent: true, disableLog: true },
      );
      const secret = JSON.parse(source);
      const data = Object.fromEntries(
        Object.entries(secret.data || {}).map(([key, value]) => [
          key,
          Buffer.from(`${value}`, 'base64').toString('utf8'),
        ]),
      );
      return { ...data, ...(secret.stringData || {}) };
    },

    /**
     * @method applyIfPresent
     * @description Applies a secret from the SOPS store when an encrypted manifest exists,
     * reporting whether it did. Single decision point for callers that keep an origin seed path
     * for clusters not yet onboarded to the encrypted store.
     *
     * Falls back to the seed path only when the manifest is *absent*. A manifest that exists but
     * is corrupt, unencrypted, or names a different Secret raises instead: sliding back to the
     * seed path there would mask a tampered store and silently deploy stale credentials the
     * operator believes were replaced.
     * @param {string} name - Secret name.
     * @param {string} [namespace='default'] - Kubernetes namespace.
     * @param {object} [options={}] - Apply options forwarded to {@link applyManifest}.
     * @returns {boolean} True when the encrypted manifest was applied.
     * @memberof UnderpostSecret
     */
    applyIfPresent(name, namespace = 'default', options = {}) {
      if (!Underpost.secret.has(name, namespace)) return false;
      Underpost.secret.applyManifest(Underpost.secret.manifestPath(name, namespace), namespace, {
        ...options,
        expectName: name,
      });
      return true;
    },

    /**
     * @method list
     * @description Lists encrypted manifests with their Age recipients. Reads only the plaintext
     * `sops:` metadata block, so no private key is required and this is safe to run anywhere.
     * @memberof UnderpostSecret
     */
    list() {
      const manifests = Underpost.secret.manifests();
      if (manifests.length === 0) return logger.warn(`No encrypted manifests under ${SOPS_SECRETS_DIR}`);
      for (const manifest of manifests) {
        const recipients = Underpost.secret.manifestRecipients(manifest.path);
        console.log(
          `${manifest.namespace}/${manifest.name}${SOPS_MANIFEST_EXT}  ->  ${
            recipients.join(', ') || 'no age recipients'
          }`,
        );
      }
    },

    /**
     * @method manifestRecipients
     * @description Extracts the Age recipients an encrypted manifest is sealed to, from its
     * plaintext `sops:` metadata block. Requires no private key.
     * @param {string} manifestPath - Path to the `.enc.yaml` manifest.
     * @returns {Array<string>} Recipients that can decrypt the manifest.
     * @memberof UnderpostSecret
     */
    manifestRecipients(manifestPath) {
      const content = fs.readFileSync(manifestPath, 'utf8');
      return [...content.matchAll(/recipient:\s*(age1\S+)/g)].map((match) => match[1]);
    },

    /**
     * @method rotate
     * @description Re-keys every encrypted manifest onto a new Age recipient after key
     * compromise or scheduled rotation. Secret *values* are untouched: `sops updatekeys` only
     * re-wraps each file's data key, so no workload restart is needed. Requires a private key
     * that can still decrypt, so rotation must run before the outgoing key is destroyed.
     *
     * Additive by default (the outgoing recipient keeps working, which is what a scheduled
     * rotation wants). `options.pruneRecipients` makes the new recipient the only one, which is
     * what a compromise wants — and which also revokes every *other* operator and CI/CD key in
     * the rule, so it additionally requires `options.force` after showing exactly what is lost.
     * @param {string} recipient - Incoming `age1…` public recipient.
     * @param {object} [options={}] - Rotation options.
     * @param {boolean} [options.pruneRecipients=false] - Drop all existing recipients.
     * @param {Array<string>|string} [options.keepRecipients] - Recipients to retain while pruning
     *   (e.g. the CI/CD key), as an array or comma-separated list.
     * @param {boolean} [options.force=false] - Confirm an irreversible prune.
     * @param {boolean} [options.dryRun=false] - Report the plan without rewriting anything.
     * @returns {{recipients: Array<string>, revoked: Array<string>, rekeyed: number}} Outcome.
     * @memberof UnderpostSecret
     */
    rotateRecipient(recipient, options = {}) {
      if (!recipient) throw new Error('Rotation requires --recipient <age-public-key>');
      if (!/^age1[0-9a-z]{20,}$/.test(recipient))
        throw new Error(`Not a valid Age public recipient: ${recipient} (expected age1…)`);

      Underpost.secret.assertTooling(['sops']);
      const keyFile = Underpost.secret.assertKeyFile();

      const confPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
      if (!fs.existsSync(confPath))
        throw new Error(`Missing creation rules: ${confPath} (run: underpost secret sops --init)`);

      const keep = (
        Array.isArray(options.keepRecipients) ? options.keepRecipients : `${options.keepRecipients || ''}`.split(',')
      )
        .map((value) => value.trim())
        .filter(Boolean);
      const current = Underpost.secret.creationRecipients();
      const next = options.pruneRecipients ? [...new Set([recipient, ...keep])] : [...new Set([...current, recipient])];
      const revoked = current.filter((existing) => !next.includes(existing));
      const manifests = Underpost.secret.manifests();
      // `updatekeys` re-wraps each data key, which means decrypting it first. A host that cannot
      // read the store cannot rotate it, dry run included — reporting a plan that can never run
      // is what sends an operator down the wrong remedy.
      Underpost.secret.assertDecryptable(manifests);

      if (options.dryRun) {
        logger.info('Rotation plan (dry run)', { from: current, to: next, revoked, manifests: manifests.length });
        if (revoked.length)
          logger.warn(
            `${revoked.length} recipient(s) would permanently lose access. Confirm none is a CI/CD or ` +
              `co-operator key before re-running with --force.`,
            { revoked },
          );
        return { recipients: next, revoked, rekeyed: 0 };
      }

      // A prune revokes every recipient not explicitly retained — including CI/CD keys the
      // operator may not have in mind. Irreversible for anyone holding only a revoked key, so it
      // is gated behind an explicit confirmation that has to be made after seeing the list.
      if (revoked.length && !options.force)
        throw new Error(
          `Refusing to revoke ${revoked.length} recipient(s) without --force: ${revoked.join(', ')}. ` +
            `Review with --dry-run, retain any CI/CD key via --keep-recipients <age1…>, then re-run with --force.`,
        );

      Underpost.secret.writeCreationRecipients(next);
      for (const manifest of manifests) {
        // `updatekeys` decrypts the data key with a held private key and re-wraps it for the
        // recipients now in `.sops.yaml`. disableLog keeps the key path out of the log stream.
        shellExec(
          `bash -c 'set -o pipefail; SOPS_AGE_KEY_FILE="${keyFile}" ` +
            `sops --config "${confPath}" updatekeys --yes "${manifest.path}"'`,
          { disableLog: true, silent: true },
        );
        // updatekeys is a no-op when it decides nothing changed, and its exit code does not
        // distinguish that from a successful re-key. Confirm against the file itself, so a
        // rotation can never be reported as done while a manifest stays on the old recipient.
        const sealed = Underpost.secret.manifestRecipients(manifest.path);
        if (!sealed.includes(recipient))
          throw new Error(
            `${manifest.path} is still sealed to ${sealed.join(', ') || 'no recipients'} after updatekeys; ` +
              `expected ${recipient}. Rotation aborted with the store partially re-keyed — re-run once resolved.`,
          );
        logger.info(`Re-keyed ${manifest.namespace}/${manifest.name}`);
      }

      logger.info(`Rotated ${manifests.length} manifest(s)`, { recipients: next, revoked });
      if (revoked.length)
        logger.warn(
          `Revoked ${revoked.length} recipient(s); those keys can no longer decrypt any manifest. ` +
            `Every host applying these secrets now needs a private key for one of: ${next.join(', ')}.`,
          { revoked },
        );
      return { recipients: next, revoked, rekeyed: manifests.length };
    },

    /**
     * @method purge
     * @description Emergency removal of one secret: deletes the live Kubernetes Secret and takes
     * its encrypted manifest out of the store. The manifest is archived rather than deleted so
     * the purge stays reversible; `options.force` deletes it outright.
     *
     * Removing the manifest is what re-arms the origin seed path — with no `.enc.yaml`,
     * `applyIfPresent` returns false and cluster init seeds the secret from the plaintext
     * credential files instead. Whether that seed path is actually available is reported, not
     * assumed: purging a secret whose seed files are gone leaves workloads with an unresolvable
     * `secretKeyRef`, so the gap is surfaced at purge time rather than at the next deploy.
     * @param {string} name - Secret name (e.g. 'postgres-secret').
     * @param {object} [options={}] - Purge options.
     * @param {string} [options.namespace='default'] - Namespace of the live Secret.
     * @param {boolean} [options.force=false] - Delete the manifest instead of archiving it.
     * @param {boolean} [options.dryRun=false] - Report what would happen without changing anything.
     * @returns {{deleted: boolean, archived: string, seedFallback: boolean}} Purge outcome.
     * @memberof UnderpostSecret
     */
    purge(name, options = {}) {
      if (!name) throw new Error('Purge requires a secret name');
      const namespace = options.namespace || 'default';
      const manifestPath = Underpost.secret.manifestPath(name, namespace);
      const seedSources = Object.values(Underpost.secret.seedSources(name));
      const envKeys = Object.keys(Underpost.secret.seedEnvKeys(name));
      const envValues = Underpost.secret.seedEnvValues(name);
      const seedFallback =
        (seedSources.length > 0 && seedSources.every((source) => fs.existsSync(source))) ||
        (envKeys.length > 0 && envKeys.every((key) => envValues[key] !== undefined));

      if (options.dryRun) {
        logger.info('Purge plan (dry run)', {
          secret: `${namespace}/${name}`,
          manifest: fs.existsSync(manifestPath) ? manifestPath : 'absent',
          disposition: options.force ? 'delete' : 'archive',
          seedFallbackAvailable: seedFallback,
        });
        return { deleted: false, archived: '', seedFallback };
      }

      shellExec(`kubectl delete secret ${name} -n ${namespace} --ignore-not-found`);

      let archived = '';
      if (!fs.existsSync(manifestPath)) logger.warn(`No encrypted manifest to remove at ${manifestPath}`);
      else if (options.force) {
        fs.removeSync(manifestPath);
        logger.warn(`Deleted ${manifestPath}`);
      } else {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        archived = `${SOPS_ARCHIVE_DIR}/${namespace}/${name}.${stamp}${SOPS_MANIFEST_EXT}`;
        fs.ensureDirSync(`${SOPS_ARCHIVE_DIR}/${namespace}`);
        fs.moveSync(manifestPath, archived);
        logger.info(`Archived ${manifestPath} -> ${archived}`);
      }

      if (seedFallback)
        logger.info(`Origin seed path is available for ${name}; cluster init will seed from it.`, {
          sources: seedSources,
        });
      else if (seedSources.length > 0)
        logger.warn(
          `No origin seed path for ${name}. Re-encrypt a manifest or create the secret manually ` +
            `before redeploying workloads that mount it.`,
          { expected: seedSources },
        );

      return { deleted: true, archived, seedFallback };
    },

    /**
     * @method manifests
     * @description Enumerates every encrypted manifest in the store, or in one namespace.
     * Dot-prefixed entries (`.archive`, `.sops.yaml`) are never treated as namespaces.
     * @param {string} [namespace] - Restrict to one namespace; omit for the whole store.
     * @returns {Array<{namespace: string, name: string, path: string}>} Manifest descriptors, sorted.
     * @memberof UnderpostSecret
     */
    manifests(namespace) {
      if (!fs.existsSync(SOPS_SECRETS_DIR)) return [];
      const namespaces = namespace
        ? [namespace]
        : fs
            .readdirSync(SOPS_SECRETS_DIR)
            .filter((entry) => !entry.startsWith('.') && fs.statSync(`${SOPS_SECRETS_DIR}/${entry}`).isDirectory())
            .sort();
      const found = [];
      for (const ns of namespaces) {
        const dir = `${SOPS_SECRETS_DIR}/${ns}`;
        if (!fs.existsSync(dir)) continue;
        for (const file of fs
          .readdirSync(dir)
          .filter((entry) => entry.endsWith(SOPS_MANIFEST_EXT))
          .sort())
          found.push({ namespace: ns, name: file.slice(0, -SOPS_MANIFEST_EXT.length), path: `${dir}/${file}` });
      }
      return found;
    },

    /**
     * @method creationRecipients
     * @description Reads the Age recipients from the committed `.sops.yaml` creation rule,
     * accepting both the single-line (`age: k1,k2`) and folded (`age: >-`) forms sops permits.
     * @returns {Array<string>} Recipients currently configured for encryption.
     * @memberof UnderpostSecret
     */
    creationRecipients() {
      const confPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
      if (!fs.existsSync(confPath)) return [];
      const lines = fs.readFileSync(confPath, 'utf8').split('\n');
      const index = lines.findIndex((line) => /^\s*age:/.test(line));
      if (index === -1) return [];
      const indent = lines[index].match(/^\s*/)[0].length;
      const chunk = [lines[index].replace(/^\s*age:\s*>?-?\s*/, '')];
      for (let i = index + 1; i < lines.length; i++) {
        if (!lines[i].trim()) break;
        if (lines[i].match(/^\s*/)[0].length <= indent) break;
        chunk.push(lines[i].trim());
      }
      return chunk
        .join(',')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    },

    /**
     * @method writeCreationRecipients
     * @description Rewrites the `age:` recipients of the `.sops.yaml` creation rule in place,
     * collapsing any folded form to a single canonical line. Line-scoped on purpose: a YAML
     * round-trip would strip the comments operators keep in this file.
     * @param {Array<string>} recipients - Recipients to encrypt to from now on.
     * @memberof UnderpostSecret
     */
    writeCreationRecipients(recipients) {
      const confPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
      if (!fs.existsSync(confPath))
        throw new Error(`Missing creation rules: ${confPath} (run: underpost secret sops --init)`);
      const lines = fs.readFileSync(confPath, 'utf8').split('\n');
      const index = lines.findIndex((line) => /^\s*age:/.test(line));
      if (index === -1) throw new Error(`No 'age:' recipients entry in ${confPath}`);
      const indent = lines[index].match(/^\s*/)[0];
      let end = index + 1;
      while (end < lines.length && lines[end].trim() && lines[end].match(/^\s*/)[0].length > indent.length) end++;
      lines.splice(index, end - index, `${indent}age: ${recipients.join(',')}`);
      fs.writeFileSync(confPath, lines.join('\n'), 'utf8');
    },

    /**
     * @method hasBinary
     * @description Reports whether a binary resolves on PATH. Single probe reused by
     * {@link assertTooling} and {@link installTooling} so both agree on what "installed" means.
     * @param {string} bin - Binary name.
     * @returns {boolean} True when the binary is on PATH.
     * @memberof UnderpostSecret
     */
    hasBinary(bin) {
      return (
        shellExec(`command -v ${bin} >/dev/null 2>&1 && echo exists || echo missing`, {
          stdout: true,
          silent: true,
          disableLog: true,
        }).trim() === 'exists'
      );
    },

    /**
     * @method assertTooling
     * @description Fails fast with an actionable message when a required binary is missing,
     * rather than surfacing an opaque shell exit code mid-apply.
     * @param {Array<string>} bins - Binaries that must resolve on PATH.
     * @memberof UnderpostSecret
     */
    assertTooling(bins) {
      for (const bin of bins)
        if (!Underpost.secret.hasBinary(bin))
          throw new Error(`${bin} not found in PATH (install via: underpost secret --install-tools)`);
    },

    /**
     * @method installTooling
     * @description Installs the `sops` and `age` host binaries from their pinned upstream static
     * builds. Idempotent: an already-resolvable binary is left untouched, so this is safe to
     * re-run and safe to call from both the secrets CLI and cluster host initialization.
     * Verifies both binaries resolve before returning, so a partial install fails loudly here
     * rather than mid-decrypt.
     * @returns {{sops: boolean, age: boolean}} Which binaries this run actually installed.
     * @memberof UnderpostSecret
     */
    installTooling() {
      const archData = Underpost.baremetal.getHostArch();
      logger.info('Installing SOPS and Age host tooling...', { ...archData, SOPS_VERSION, AGE_VERSION });
      const installed = { sops: false, age: false };

      if (Underpost.secret.hasBinary('sops')) logger.info('SOPS is already installed; skipping.');
      else {
        shellExec(
          `curl -fsSL -o /tmp/sops https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.${archData.alias}`,
        );
        shellExec(`sudo install -m 0755 /tmp/sops /usr/local/bin/sops`);
        shellExec(`sudo ln -sf /usr/local/bin/sops /bin/sops`);
        shellExec(`sudo rm -f /tmp/sops`);
        installed.sops = true;
      }

      if (Underpost.secret.hasBinary('age-keygen')) logger.info('Age is already installed; skipping.');
      else {
        shellExec(
          `curl -fsSL -o /tmp/age.tar.gz https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/age-${AGE_VERSION}-linux-${archData.alias}.tar.gz`,
        );
        shellExec(`tar -xzf /tmp/age.tar.gz -C /tmp`);
        shellExec(`sudo install -m 0755 /tmp/age/age /usr/local/bin/age`);
        shellExec(`sudo install -m 0755 /tmp/age/age-keygen /usr/local/bin/age-keygen`);
        shellExec(`sudo ln -sf /usr/local/bin/age /bin/age`);
        shellExec(`sudo ln -sf /usr/local/bin/age-keygen /bin/age-keygen`);
        shellExec(`sudo rm -rf /tmp/age /tmp/age.tar.gz`);
        installed.age = true;
      }

      Underpost.secret.assertTooling(['sops', 'age', 'age-keygen']);
      logger.info('SOPS and Age tooling ready.', { installedThisRun: installed });
      return installed;
    },
  };
}

export default UnderpostSecret;
