/**
 * Secrets module for managing the secrets of the application.
 * @module src/cli/secrets.js
 * @namespace UnderpostSecret
 */

import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import os from 'os';
import dotenv from 'dotenv';
import Underpost from '../index.js';
import { loadConf } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

// Git-tracked store of SOPS/Age encrypted Kubernetes Secret manifests, laid out as
// `<SOPS_SECRETS_DIR>/<namespace>/<name>.enc.yaml`. Lives inside the per-deploy private
// repo so encrypted manifests version alongside the conf they belong to. Only the
// ciphertext is committed; the Age private key never enters this tree.
const SOPS_SECRETS_DIR = './engine-private/secrets';
const SOPS_MANIFEST_EXT = '.enc.yaml';
// `creation_rules[].path_regex` is matched against the manifest path **relative to the directory
// holding .sops.yaml**, not the repo root. Since .sops.yaml lives at the store root, an
// `engine-private/secrets/` prefix here can never match — sops sees `<namespace>/<name>.enc.yaml`
// and reports "no matching creation rules found".
const SOPS_MANIFEST_PATH_REGEX = `.*${SOPS_MANIFEST_EXT.replace(/\./g, '\\.')}$`;
// Purged manifests are moved here rather than deleted, so an emergency purge stays
// reversible. Dot-prefixed so it is never mistaken for a namespace directory.
const SOPS_ARCHIVE_DIR = `${SOPS_SECRETS_DIR}/.archive`;
// Encrypting only the value tree under `data`/`stringData` keeps apiVersion/kind/metadata
// readable, so kubectl, kustomize, and code review still work on the encrypted file.
const SOPS_ENCRYPTED_REGEX = '^(data|stringData)$';
// Pinned SOPS/Age release binaries. Neither has an RHEL package, so both are installed
// from upstream static builds. Single source of truth for host provisioning: both
// `underpost secret --install-tools` and `underpost cluster --init-host` resolve here.
const SOPS_VERSION = 'v3.10.2';
const AGE_VERSION = 'v1.2.1';
// Origin seed paths: the plaintext credential files a secret is seeded from before SOPS/Age
// onboarding, and the path cluster init falls back to when no encrypted manifest exists.
// Keyed by Secret name, then by the Secret data key each file supplies — stated explicitly
// rather than derived from the filename, because `mongodb-keyfile` supplies a key of that same
// full name while `postgresql-password` supplies `password`.
// Mirrors the seed-fallback branches in UnderpostCluster.API.init() and
// MongoBootstrap.ensureMongoSecrets(); kept here so a purge can report whether the cluster
// still has a working seed path for that secret.
// Every Secret whose creation goes through `applyIfPresent` — i.e. the encrypted store is
// consulted first and the origin seed path is the fallback. Single source of truth for coverage
// reporting; keep in step with the call sites in UnderpostCluster.API.init(),
// MongoBootstrap.ensureMongoSecrets(), and UnderpostIPFS.applySecrets().
const MANAGED_SECRETS = [
  'postgres-secret',
  'mariadb-secret',
  'mysql-secret',
  'mongodb-secret',
  'mongodb-keyfile',
  'ipfs-cluster-secret',
];
const ORIGIN_SEED_SOURCES = {
  'mariadb-secret': {
    username: './engine-private/mariadb-username',
    password: './engine-private/mariadb-password',
  },
  'mysql-secret': {
    username: './engine-private/mysql-username',
    password: './engine-private/mysql-password',
  },
  'postgres-secret': { password: './engine-private/postgresql-password' },
  'mongodb-secret': {
    username: './engine-private/mongodb-username',
    password: './engine-private/mongodb-password',
  },
  // Shared replica-set auth keyfile, mounted as a volume rather than injected as env.
  'mongodb-keyfile': { 'mongodb-keyfile': './engine-private/mongodb-keyfile' },
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
const isReservedEnvKey = (key) =>
  RESERVED_ENV_KEYS.has(key) || RESERVED_ENV_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));

/**
 * @class UnderpostSecret
 * @description Manages the secrets of the application.
 * @memberof UnderpostSecret
 */
class UnderpostSecret {
  static API = {
    /**
     * @method underpost
     * @description Manages the secrets of the application.
     * @memberof UnderpostSecret
     */
    underpost: {
      /**
       * @method createFromEnvFile
       * @description Reads application secrets from a .env file and writes them to the underpost .env file. Used for local development and testing.
       * @param {string} envPath - The path to the .env file to read secrets from. Defaults to './.env'.
       * @memberof UnderpostSecret
       */
      createFromEnvFile(envPath = './.env') {
        Underpost.env.clean();
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          Underpost.env.set(key, envObj[key]);
        }
      },
      /**
       * @method createFromContainerEnv
       * @description Reads application secrets from process.env (injected via envFrom: secretRef)
       *  and writes them to the underpost .env file, filtering out known system and
       *  Kubernetes-injected environment variables. Replaces the fragile shell-based
       *  `printenv | grep -vE` pattern with a maintainable Node.js blocklist.
       * @memberof UnderpostSecret
       */
      createFromContainerEnv() {
        Underpost.env.clean();
        for (const [key, value] of Object.entries(process.env)) {
          if (isReservedEnvKey(key)) continue;
          Underpost.env.set(key, value);
        }
      },
    },

    /**
     * @method sops
     * @description Git-native encrypted secret management backed by Mozilla SOPS and Age, for
     * fully self-hosted clusters with no cloud KMS or external secret store. Encrypted manifests
     * live in `engine-private/secrets/<namespace>/<name>.enc.yaml` and are safe to commit; the Age
     * private key stays at `~/.config/sops/age/keys.txt` (or `$SOPS_AGE_KEY_FILE`) and is never
     * committed, rendered into a manifest, or shipped into a container. Decryption is always
     * streamed straight into `kubectl apply -f -`, so plaintext never reaches persistent storage.
     * @memberof UnderpostSecret
     */
    sops: {
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
        const keyFile = Underpost.secret.sops.keyFile();
        if (!fs.existsSync(keyFile)) {
          const alternatives = Underpost.secret.sops
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
        return { ...(ORIGIN_SEED_SOURCES[name] || {}) };
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
        return fs.existsSync(Underpost.secret.sops.manifestPath(name, namespace));
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
        const meta = Underpost.secret.sops.manifestMeta(manifestPath);
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
       * @method recipient
       * @description Derives the Age public recipient from the private key. The reverse is not
       * possible, so this is safe to log and to commit into `.sops.yaml`.
       * @returns {string} The `age1…` public recipient.
       * @memberof UnderpostSecret
       */
      recipient() {
        const keyFile = Underpost.secret.sops.keyFile();
        if (!fs.existsSync(keyFile)) throw new Error(`Age private key not found: ${keyFile}`);
        return shellExec(`age-keygen -y "${keyFile}"`, { stdout: true, silent: true, disableLog: true }).trim();
      },

      /**
       * @method init
       * @description Generates the Age keypair and the `.sops.yaml` creation rule when absent.
       * Idempotent, and never overwrites an existing key: regenerating would orphan every manifest
       * already encrypted to the previous recipient, with no way to recover them.
       * @memberof UnderpostSecret
       */
      init() {
        Underpost.secret.sops.assertTooling(['age-keygen', 'sops']);
        const keyFile = Underpost.secret.sops.keyFile();
        if (fs.existsSync(keyFile)) logger.info(`Age key already present; reusing ${keyFile}`);
        else {
          fs.ensureDirSync(keyFile.slice(0, keyFile.lastIndexOf('/')));
          shellExec(`umask 077 && age-keygen -o "${keyFile}"`);
        }
        shellExec(`chmod 600 "${keyFile}"`);

        const recipient = Underpost.secret.sops.recipient();
        const sopsConfPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
        if (fs.existsSync(sopsConfPath)) {
          logger.info(`Creation rules already present; leaving ${sopsConfPath} intact`);
          Underpost.secret.sops.repairCreationRules();
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
        Underpost.secret.sops.assertTooling(['sops']);
        if (!plaintextPath || !fs.existsSync(plaintextPath))
          throw new Error(`Plaintext manifest not found: ${plaintextPath}`);
        const sopsConfPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
        if (!fs.existsSync(sopsConfPath))
          throw new Error(`Missing creation rules: ${sopsConfPath} (run: underpost secret sops --init)`);

        const sourceMeta = Underpost.secret.sops.manifestMeta(plaintextPath);
        if (sourceMeta.encrypted)
          throw new Error(
            `${plaintextPath} already carries sops metadata. Re-encrypting would double-wrap it; ` +
              `edit it in place with: sops ${plaintextPath}`,
          );

        const name = plaintextPath
          .split('/')
          .pop()
          .replace(/\.ya?ml$/, '');
        const outPath = Underpost.secret.sops.manifestPath(name, namespace);
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
          Underpost.secret.sops.assertManifest(stagePath, { name });
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
      apply(namespace = 'default', options = {}) {
        const dir = `${SOPS_SECRETS_DIR}/${namespace}`;
        if (!fs.existsSync(dir)) throw new Error(`No encrypted secrets for namespace: ${namespace}`);
        const manifests = Underpost.secret.sops.manifests(namespace);
        if (manifests.length === 0) throw new Error(`No *${SOPS_MANIFEST_EXT} manifests under ${dir}`);

        // Validate-then-commit. Applying in a single pass means manifest N failing to decrypt
        // leaves 1..N-1 already live — a half-rotated namespace nobody asked for. The envelope
        // check plus a server dry run of every manifest catches wrong-key, malformed-YAML, schema
        // and RBAC failures before the first mutation.
        for (const manifest of manifests)
          Underpost.secret.sops.assertManifest(manifest.path, { name: manifest.name, namespace });
        if (!options.dryRun)
          for (const manifest of manifests)
            Underpost.secret.sops.applyManifest(manifest.path, namespace, { ...options, dryRun: true, quiet: true });

        for (const manifest of manifests) Underpost.secret.sops.applyManifest(manifest.path, namespace, options);
        logger.info(`${options.dryRun ? 'Validated' : 'Applied'} ${manifests.length} manifest(s) in ns/${namespace}`);
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
        Underpost.secret.sops.assertTooling(['sops']);
        // Envelope first: it needs no private key, so a malformed or unencrypted store is reported
        // as such even on a host whose key is missing or wrongly permissioned.
        Underpost.secret.sops.assertManifest(manifestPath, { name: options.expectName, namespace });
        const keyFile = Underpost.secret.sops.assertKeyFile();
        const dryRun = options.dryRun ? ' --dry-run=server' : '';
        shellExec(
          `bash -c 'set -o pipefail; SOPS_AGE_KEY_FILE="${keyFile}" sops --decrypt "${manifestPath}" ` +
            `| kubectl apply -f -${dryRun} -n "${namespace}"'`,
          { disableLog: true },
        );
        if (!options.quiet) logger.info(`${options.dryRun ? 'Dry-run' : 'Applied'} ${manifestPath} -> ns/${namespace}`);
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
        if (!Underpost.secret.sops.has(name, namespace)) return false;
        Underpost.secret.sops.applyManifest(Underpost.secret.sops.manifestPath(name, namespace), namespace, {
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
        const manifests = Underpost.secret.sops.manifests();
        if (manifests.length === 0) return logger.warn(`No encrypted manifests under ${SOPS_SECRETS_DIR}`);
        for (const manifest of manifests) {
          const recipients = Underpost.secret.sops.manifestRecipients(manifest.path);
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
      rotate(recipient, options = {}) {
        Underpost.secret.sops.assertTooling(['sops']);
        if (!recipient) throw new Error('Rotation requires --recipient <age-public-key>');
        if (!/^age1[0-9a-z]{20,}$/.test(recipient))
          throw new Error(`Not a valid Age public recipient: ${recipient} (expected age1…)`);

        const keyFile = Underpost.secret.sops.assertKeyFile();

        const confPath = `${SOPS_SECRETS_DIR}/.sops.yaml`;
        if (!fs.existsSync(confPath))
          throw new Error(`Missing creation rules: ${confPath} (run: underpost secret sops --init)`);

        const keep = (
          Array.isArray(options.keepRecipients) ? options.keepRecipients : `${options.keepRecipients || ''}`.split(',')
        )
          .map((value) => value.trim())
          .filter(Boolean);
        const current = Underpost.secret.sops.creationRecipients();
        const next = options.pruneRecipients
          ? [...new Set([recipient, ...keep])]
          : [...new Set([...current, recipient])];
        const revoked = current.filter((existing) => !next.includes(existing));
        const manifests = Underpost.secret.sops.manifests();

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

        Underpost.secret.sops.writeCreationRecipients(next);
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
          const sealed = Underpost.secret.sops.manifestRecipients(manifest.path);
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
        const manifestPath = Underpost.secret.sops.manifestPath(name, namespace);
        const seedSources = Object.values(Underpost.secret.sops.seedSources(name));
        const seedFallback = seedSources.length > 0 && seedSources.every((source) => fs.existsSync(source));

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
          if (!Underpost.secret.sops.hasBinary(bin))
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

        if (Underpost.secret.sops.hasBinary('sops')) logger.info('SOPS is already installed; skipping.');
        else {
          shellExec(
            `curl -fsSL -o /tmp/sops https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.${archData.alias}`,
          );
          shellExec(`sudo install -m 0755 /tmp/sops /usr/local/bin/sops`);
          shellExec(`sudo ln -sf /usr/local/bin/sops /bin/sops`);
          shellExec(`sudo rm -f /tmp/sops`);
          installed.sops = true;
        }

        if (Underpost.secret.sops.hasBinary('age-keygen')) logger.info('Age is already installed; skipping.');
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

        Underpost.secret.sops.assertTooling(['sops', 'age', 'age-keygen']);
        logger.info('SOPS and Age tooling ready.', installed);
        return installed;
      },
    },

    /**
     * @method sanitizeSecretEnvFile
     * @description Strips shell/runtime-critical and Kubernetes-injected keys (PATH, HOME, …) from
     * raw `.env` file content so the resulting `underpost-config` secret can be safely injected via
     * `envFrom` without clobbering the container image's own PATH. Blank lines and comments are
     * preserved. Uses the same {@link RESERVED_ENV_KEYS} blocklist as container-env capture.
     * @param {string} envFileContent - Raw contents of a `.env.<env>` file.
     * @returns {string} Filtered env-file content.
     * @memberof UnderpostSecret
     */
    sanitizeSecretEnvFile(envFileContent) {
      return envFileContent
        .split('\n')
        .filter((line) => {
          const trimmed = line.trimStart();
          if (!trimmed || trimmed.startsWith('#')) return true;
          const key = line.slice(0, line.indexOf('=')).trim();
          return !key || !isReservedEnvKey(key);
        })
        .join('\n');
    },

    /**
     * Removes all filesystem traces of secrets after deployment startup.
     * Centralizes the defense-in-depth cleanup performed
     * @param {object} options - Options for cleaning the environment.
     * @param {Array<string>} [options.keepKeys=[]] - List of keys to keep in the environment file. If provided, only these keys will be retained.
     * @memberof UnderpostSecret
     */
    globalSecretClean(options = { keepKeys: [] }) {
      const { keepKeys } = options;
      loadConf('clean');
      Underpost.repo.cleanupPrivateEngineRepo();
      Underpost.env.clean({
        keepKeys: keepKeys.length > 0 ? keepKeys : ['container-status', 'start-container-status'],
      });
    },
  };
}

export default UnderpostSecret;
