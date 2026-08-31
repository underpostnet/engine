/**
 * MongoDB Replica Set Bootstrap Module
 * @module src/db/mongo/MongoBootstrap
 * @namespace MongoBootstrap
 * @description Centralized logic for bootstrapping a MongoDB replica set inside Kubernetes.
 * Provides class-based static methods for initializing MongoDB clusters across all
 * cluster types (Kind, Kubeadm, K3s), managing replica set configuration, and
 * detecting the primary pod.
 */

import fs from 'fs-extra';
import { loggerFactory } from '../../server/ops/logger.js';
import { shellExec } from '../../server/runtime/process.js';
import { crictlCommandFactory } from '../../server/ops/cri.js';
import { ensureContainerStorage } from '../../server/security/container-storage.js';
import { resolveReplicaCount } from '../../server/runtime/conf.js';
// Cyclic by construction (index -> cluster -> MongoBootstrap -> index), same as cluster.js.
// Safe because the binding is only dereferenced inside method bodies, never at module scope.
import Underpost from '../../index.js';
import {
  MONGODB_DATA_ROOT,
  MONGODB_DEFAULT_AUTH_SOURCE,
  MONGODB_DEFAULT_PORT,
  MONGODB_DEFAULT_REPLICA_COUNT,
  MONGODB_DEFAULT_REPLICA_SET,
  MONGODB_SERVICE_NAME,
  MONGODB_STATEFULSET_NAME,
  MONGODB_STORAGE_CLASS_NAME,
  MONGODB_STORAGE_CLASS_PROVISIONER,
  resolveMongoReplicaHosts,
} from './MongooseDB.js';

const logger = loggerFactory(import.meta);

const MONGODB_PRIMARY_PROBE_URI =
  `mongodb://127.0.0.1:${MONGODB_DEFAULT_PORT}/${MONGODB_DEFAULT_AUTH_SOURCE}` +
  `?directConnection=true&serverSelectionTimeoutMS=8000&connectTimeoutMS=8000&socketTimeoutMS=15000`;

const MONGODB_PRIMARY_PROBE_TIMEOUT_SECONDS = 45;

const MONGODB_PRIMARY_EVAL = {
  hello: 'db.hello().primary',
  isMaster: 'rs.isMaster().primary',
  rsStatus: 'rs.status().members.filter(m=>m.stateStr=="PRIMARY").map(m=>m.name)[0]',
};

// Rejected verbatim probe results: a shell that answered but knows no primary.
const MONGODB_EMPTY_PRIMARY_TOKENS = ['null', 'undefined', '[]', '[ ]', 'false', ''];

/**
 * Extracts a pod name from a primary-host probe result.
 *
 * Normalises the two shapes the shells emit — a bare `host:port` string from
 * `hello`, a quoted element from the `rs.status()` projection — and ignores any
 * banner or warning lines printed alongside them.
 *
 * @param {string} output - Raw probe stdout.
 * @returns {string|null} Pod name (`mongodb-0`), or null when no host was reported.
 * @memberof MongoBootstrap
 */
const parsePrimaryHost = (output) => {
  if (!output) return null;
  const lines = `${output}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.reverse()) {
    const quoted = line.match(/['"]([^'"]+)['"]/);
    const candidate = (quoted ? quoted[1] : line).trim();
    if (MONGODB_EMPTY_PRIMARY_TOKENS.includes(candidate.toLowerCase())) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(:\d+)?$/.test(candidate)) continue;
    return candidate.split(':')[0].split('.')[0];
  }
  return null;
};

/**
 * Extracts the two replica set identities from a heartbeat rejection.
 *
 * mongod reports `Our replica set ID did not match that of our request target` when two
 * members carry different set IDs — the signature of one member having been re-initiated on
 * an empty volume while the others kept the original set.
 *
 * @param {string} output - Combined stdout/stderr of a mongosh bootstrap attempt.
 * @returns {{selfSetId: string, target: string, targetSetId: string}|null} Parsed identities, or null.
 * @memberof MongoBootstrap
 */
const parseDivergentSetIds = (output) => {
  const match = `${output || ''}`.match(
    /replSetId:\s*([0-9a-f]+),\s*requestTarget:\s*([^,]+),\s*requestTargetReplSetId:\s*([0-9a-f]+)/,
  );
  if (!match) return null;
  return { selfSetId: match[1], target: match[2].trim(), targetSetId: match[3] };
};

// Teardown sweeps ordinals rather than a live replica count: the deployed count is not knowable
// during a reset, and a member left behind from a larger previous deployment keeps its volume and
// stale replica-set config, which a later deploy then trips over.
const MONGODB_ORDINAL_SWEEP = 10;

/**
 * @typedef {Object} MongoBootstrapOptions
 * @property {string} [namespace='default'] - Kubernetes namespace.
 * @property {number} [replicaCount=3] - Number of replica set members.
 * @property {string} [hostList=''] - Explicit host list override (comma-separated or empty for StatefulSet defaults).
 * @property {boolean} [pullImage=false] - Whether to pull the mongo image before deploy.
 * @property {boolean} [reset=false] - Whether to clean all persistent data before init.
 * @property {string} [clusterType='kind'] - One of 'kind', 'kubeadm', 'k3s'.
 * @property {string} underpostRoot - Path to the underpost root (manifests location).
 */

/**
 * @class MongoBootstrap
 * @memberof MongoBootstrap
 * @description Manages the lifecycle of a MongoDB replica set in Kubernetes.
 * Provides static methods for initializing, configuring, and querying the
 * replica set status. Handles secrets, storage, pod readiness, and mongosh
 * orchestration in an idempotent manner.
 */
class MongoBootstrap {
  /**
   * Reads a credential file and returns its trimmed contents.
   * @param {string} filePath - Absolute path to the credential file.
   * @returns {string} Trimmed credential value (empty string on error).
   */
  static readCredential(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').replace(/\r?\n/g, '').trim();
    } catch {
      logger.warn(`Cannot read credential file: ${filePath}`);
      return '';
    }
  }

  /**
   * Builds a mongosh script that handles all replica set bootstrapping states:
   * pristine volumes, pre-existing auth, reconfiguration, and idempotent no-ops.
   * @param {object} param0
   * @param {string} param0.replicaSetName - Replica set name (e.g. 'rs0').
   * @param {number} param0.replicaCount - Desired replica count.
   * @param {string} param0.statefulSetName - StatefulSet name (e.g. 'mongodb').
   * @param {string} param0.serviceName - Headless service name.
   * @param {string[]} param0.desiredHosts - Desired host:port entries for members.
   * @param {string} param0.rootUser - Admin username.
   * @param {string} param0.rootPassword - Admin password.
   * @returns {string} A single mongosh-evaluable JavaScript string.
   */
  static buildMongoshInitScript({
    replicaSetName,
    replicaCount,
    statefulSetName,
    serviceName,
    desiredHosts,
    rootUser,
    rootPassword,
  }) {
    const mePort = MONGODB_DEFAULT_PORT;
    const defaultShortHosts = Array.from(
      { length: replicaCount },
      (_, i) => `${statefulSetName}-${i}.${serviceName}:${mePort}`,
    );
    const hosts = desiredHosts.length > 0 ? desiredHosts : defaultShortHosts.slice(0, replicaCount);
    const desiredConfig = {
      _id: replicaSetName,
      members: hosts.map((host, index) => ({ _id: index, host })),
    };

    return [
      `const desiredConfig = ${JSON.stringify(desiredConfig)};`,
      // Single-member bootstrap and recovery configs name this node by the same host it
      // advertises in the final config, never `localhost`. A client that connects while the
      // set is still one member long copies that member into its topology, and inside any
      // other pod `localhost:27017` is that pod itself — the client then sits on an
      // unreachable member and never recovers.
      `const selfHost = desiredConfig.members[0].host;`,
      `const rootUser = ${JSON.stringify(rootUser)};`,
      `const rootPassword = ${JSON.stringify(rootPassword)};`,

      // Wait for a writable primary, polling up to 30s
      `const waitPrimary = () => {`,
      `  for (let i = 0; i < 30; i++) {`,
      `    const h = db.hello ? db.hello() : db.isMaster();`,
      `    if (h.isWritablePrimary || h.ismaster) return;`,
      `    sleep(1000);`,
      `  }`,
      `  throw new Error("Timed out waiting for writable primary");`,
      `};`,

      // Ensure the root user exists (idempotent)
      `const ensureRootUser = () => {`,
      `  if (!rootUser || !rootPassword) return;`,
      `  const adminDb = db.getSiblingDB("admin");`,
      `  try {`,
      `    adminDb.createUser({ user: rootUser, pwd: rootPassword, roles: [{ role: "root", db: "admin" }] });`,
      `    print("SUCCESS_USER_BOOTSTRAPPED");`,
      `  } catch(e) {`,
      `    const s = String(e);`,
      `    if (s.includes("already exists") || s.includes("DuplicateKey")) { print("SUCCESS_USER_EXISTS"); }`,
      `    else if (s.includes("requires authentication") || s.includes("Unauthorized") || s.includes("not authorized")) { print("SUCCESS_USER_GUARDED"); }`,
      `    else throw e;`,
      `  }`,
      `};`,

      // Authenticate and apply desired replica config
      `const ensureAdminAuth = () => {`,
      `  if (!rootUser || !rootPassword) return true;`,
      `  try {`,
      `    const status = db.runCommand({ connectionStatus: 1 });`,
      `    const users = status && status.authInfo && status.authInfo.authenticatedUsers ? status.authInfo.authenticatedUsers : [];`,
      `    if (users.length > 0) return true;`,
      `  } catch (e) {}`,
      `  const ok = db.getSiblingDB("admin").auth(rootUser, rootPassword);`,
      `  if (ok !== 1 && ok !== true) {`,
      `    print("SUCCESS_USER_BOOTSTRAPPED_NO_RECONFIG");`,
      `    return false;`,
      `  }`,
      `  return true;`,
      `};`,

      // Recovery for a node holding a config it is not a member of. A forced
      // reconfig is the only way out: it is accepted on a non-primary node,
      // which an ordinary reconfig is not. Auth is best-effort — when the set
      // already has users the unauthenticated pass fails here and the caller's
      // authenticated pass performs the recovery.
      //
      // The recovery config has ONE member. Forcing the full member list back
      // in place leaves the node needing a majority of the others to elect it,
      // and they are typically holding their own stale configs from the same
      // dead cluster, so no election ever completes. A single-member set needs
      // only its own vote and becomes writable at once; reconfigure() then
      // widens it — the same two-step the pristine path takes after rs.initiate.
      `const currentConfigVersion = () => { try { return rs.conf().version || 0; } catch(e) { return 0; } };`,
      `const forceReconfig = () => {`,
      `  try { ensureAdminAuth(); } catch(e) {}`,
      `  const soloConfig = {`,
      `    _id: desiredConfig._id,`,
      `    version: currentConfigVersion() + 1,`,
      `    members: [{ _id: 0, host: selfHost }],`,
      `  };`,
      `  rs.reconfig(soloConfig, { force: true });`,
      `  print("SUCCESS_FORCE_RECONFIGURED");`,
      `};`,

      `const reconfigure = () => {`,
      `  if (!ensureAdminAuth()) return false;`,
      `  const cur = rs.conf();`,
      `  const curHosts = cur.members.map(m => m.host).sort().join(",");`,
      `  const nextHosts = desiredConfig.members.map(m => m.host).sort().join(",");`,
      `  if (curHosts !== nextHosts || cur._id !== desiredConfig._id) {`,
      // Not forced: this runs on a node waitPrimary() just confirmed is writable, so an
      // ordinary reconfig applies and bumps the version by one. A forced reconfig instead
      // jumps the config version and election id by a random amount, and drivers that
      // recorded the higher values reject the legitimate primary as stale for the rest of
      // the process lifetime — pods come back as `ReplicaSetNoPrimary` and stay there.
      `    rs.reconfig({...desiredConfig, version: (cur.version || 1) + 1});`,
      `    print("SUCCESS_RECONFIGURED");`,
      `  } else {`,
      `    print("SUCCESS_ALREADY_MATCHES");`,
      `  }`,
      `  return true;`,
      `};`,

      // Classify before acting. Three distinct states reach this script:
      //   pristine — no config yet (fresh volume)
      //   orphaned — a config exists but this node is not a member of it, which
      //              is what a volume retained from an earlier cluster leaves
      //              behind; mongod parks in REMOVED and never elects itself
      //   live     — a usable config, or one hidden behind auth
      // The distinction matters for ordering: an orphaned node must be force
      // reconfigured BEFORE waiting for a primary, because it can never become
      // writable on its own. Waiting first is an unconditional timeout.
      `const matchesAny = (msg, list) => list.some(s => msg.includes(s));`,
      `let state = "live";`,
      `try {`,
      `  const s = rs.status();`,
      `  if (!s || s.ok !== 1) state = "pristine";`,
      `} catch(e) {`,
      `  const msg = String(e);`,
      `  const ORPHANED = ["not a member of it", "InvalidReplicaSetConfig", "maps to this node"];`,
      `  if (matchesAny(msg, ORPHANED)) state = "orphaned";`,
      `  else if (matchesAny(msg, ["NotYetInitialized", "no replset config"])) state = "pristine";`,
      `  else if (matchesAny(msg, ["requires authentication", "Unauthorized", "not authorized"])) state = "live";`,
      `  else throw e;`,
      `}`,
      `print("REPLSET_STATE_" + state.toUpperCase());`,

      `if (state === "pristine") {`,
      `  try {`,
      `    rs.initiate({ _id: desiredConfig._id, members: [{ _id: 0, host: selfHost }] });`,
      `  } catch(e) {`,
      `    const msg = String(e);`,
      `    if (!msg.includes("already initialized") && !msg.includes("AlreadyInitialized")) throw e;`,
      `  }`,
      `} else if (state === "orphaned") {`,
      `  forceReconfig();`,
      `}`,

      // Wait for primary, create user, then reconfig to full host list
      `waitPrimary();`,
      `ensureRootUser();`,
      `reconfigure();`,
      `quit(0);`,
    ].join('\n');
  }

  /**
   * Checks that Kind cluster nodes have the required /data/mongodb mount.
   * @param {string[]} kindNodes - List of Kind node names.
   * @returns {string[]} List of node names missing the mount (empty if all ok).
   */
  static findNodesMissingMongoMount(kindNodes) {
    return kindNodes.filter((node) => {
      const inspect = shellExec(
        `sudo docker inspect ${node} --format '{{range .Mounts}}{{if eq .Destination "${MONGODB_DATA_ROOT}"}}yes{{end}}{{end}}'`,
        { stdout: true, silent: true, silentOnError: true },
      );
      return !inspect.trim().includes('yes');
    });
  }

  /**
   * Cleans hostPath directories inside Kind node containers.
   * @param {number} [replicaCount=3] - Number of replica ordinal directories.
   */
  static cleanKindMongoHostPaths(replicaCount = 3) {
    const raw = shellExec('kind get nodes', { stdout: true, silent: true, silentOnError: true });
    const nodes = raw
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);
    if (nodes.length === 0) {
      logger.info('No Kind nodes detected for hostPath cleanup.');
      return;
    }
    const basePath = MONGODB_DATA_ROOT;
    for (const node of nodes) {
      const prepareCmd = Array.from(
        { length: replicaCount },
        (_, i) => `mkdir -p ${basePath}/v${i}; rm -rf ${basePath}/v${i}/*;`,
      ).join(' ');
      shellExec(`sudo docker exec ${node} sh -lc 'mkdir -p ${basePath}; ${prepareCmd}'`, { silentOnError: true });
    }
  }

  /**
   * Cleans MongoDB data subdirectories inside each Kind node via docker exec.
   *
   * nsenter-based remounting is unreliable here: inside the Kind node's mount namespace
   * /proc/1 refers to the Kind node's own PID 1 (not the host init), so any bind-mount
   * source built from /proc/1/root is circular and still resolves through the stale bind.
   *
   * Using docker exec is correct: it operates through the same namespace view that kubelet
   * uses when binding hostPath PVs into pods, so cleaning here guarantees the pod sees
   * an empty /data/db regardless of bind-mount staleness.
   *
   * @param {string[]} kindNodes - List of Kind node container names.
   * @param {number} [replicaCount=3] - Number of replica ordinal directories to clean. Must track
   *   the deployed replica count, or members above the third start on stale data.
   * @param {string} [basePath='/data/mongodb'] - The base path containing the v<ordinal> subdirs.
   */
  static remountKindMongoVolume(kindNodes, replicaCount = MONGODB_DEFAULT_REPLICA_COUNT, basePath = MONGODB_DATA_ROOT) {
    for (const node of kindNodes) {
      logger.info(`Cleaning MongoDB data dirs inside Kind node '${node}'...`);
      for (let i = 0; i < replicaCount; i++) {
        const dir = `${basePath}/v${i}`;
        // Ensure directory exists, wipe all contents (including hidden files), set open permissions
        // so the pod's initContainer chown can run without issues.
        shellExec(
          `sudo docker exec ${node} sh -c 'mkdir -p ${dir} && find ${dir} -mindepth 1 -delete && chmod 755 ${dir}'`,
          { silentOnError: true },
        );
        logger.info(`Cleaned ${dir} in Kind node '${node}'`);
      }
    }
  }

  /**
   * Reads MongoDB root credentials from their origin seed files.
   * Paths come from the workload secret domain, so this never spells out a credential path.
   * @returns {{ username: string, password: string }}
   */
  static readMongoCredentials() {
    const sources = Underpost.secret.seedSources('mongodb-secret');
    return {
      username: MongoBootstrap.readCredential(sources.username),
      password: MongoBootstrap.readCredential(sources.password),
    };
  }

  /**
   * Creates or updates Kubernetes secrets required by the MongoDB statefulset.
   *
   * Prefers the SOPS/Age encrypted store, exactly like the MariaDB/MySQL/PostgreSQL branches of
   * cluster init: when `engine-private/secrets/<ns>/<name>.enc.yaml` exists it is decrypted
   * straight into `kubectl apply`, and only otherwise is the secret seeded from its plaintext
   * origin seed file.
   *
   * The seed path uses `--from-literal`, which places the credential in the command string and so
   * in the process table and the command log; `disableLog` keeps it out of the log at least. The
   * encrypted path has no such exposure — the value only ever crosses an anonymous pipe.
   * @param {string} namespace - Target namespace.
   */
  static ensureMongoSecrets(namespace) {
    const keyfilePath = Underpost.secret.seedSources('mongodb-keyfile')['mongodb-keyfile'];
    if (!Underpost.secret.applyIfPresent('mongodb-keyfile', namespace)) {
      const keyfile = MongoBootstrap.readCredential(keyfilePath);
      shellExec(
        `sudo kubectl create secret generic mongodb-keyfile` +
          ` --from-literal=mongodb-keyfile="${keyfile.replace(/'/g, "'\\''")}"` +
          ` --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
        { disableLog: true },
      );
      logger.info(`Seeded mongodb-keyfile from ${keyfilePath}`);
    }

    if (!Underpost.secret.applyIfPresent('mongodb-secret', namespace)) {
      const { username, password } = MongoBootstrap.readMongoCredentials();
      shellExec(
        `sudo kubectl create secret generic mongodb-secret` +
          ` --from-literal=username="${username}" --from-literal=password="${password}"` +
          ` --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
        { disableLog: true },
      );
      logger.info('Seeded mongodb-secret from origin seed files');
    }
  }

  /**
   * Creates the replica data directories and gives the tree the shared container label.
   *
   * The PVs are `hostPath` with `type: DirectoryOrCreate`, so kubelet will happily create a
   * missing member directory — with whatever context its parent carries. `/data` has no mapping
   * in the base RHEL policy, so that context is `default_t`, which `container_t` cannot write:
   * mongod's checkpointer and `ftdc` writer then fail on every `WiredTiger.turtle.set` rename and
   * `metrics.interim.temp` create. Registering the mapping and restoring the tree here makes the
   * label a property of the directory rather than of whoever happened to create it, and it
   * survives a policy update or a full relabel.
   *
   * Only the directories are created; ownership and mode are left to the StatefulSet's
   * `data-dir-permissions` init container, which is the single owner of that concern.
   * @param {number} replicaCount - Number of member directories to prepare.
   * @param {{execute?: Function}} [options] - Command executor, injectable for tests.
   * @returns {string[]} Prepared paths.
   * @memberof MongoBootstrap
   */
  static prepareReplicaDataRoot(replicaCount, { execute = shellExec } = {}) {
    const paths = [
      MONGODB_DATA_ROOT,
      ...Array.from({ length: Math.max(0, Number(replicaCount) || 0) }, (_, i) => `${MONGODB_DATA_ROOT}/v${i}`),
    ];
    ensureContainerStorage(paths, { execute });
    return paths;
  }

  /**
   * Renders one hostPath PersistentVolume per replica, each pre-bound to that member's claim.
   *
   * The volume set is a function of the replica count, so it is generated rather than read from a
   * fixed manifest — a static file can only describe a fixed number, and any `--replicas` above
   * it leaves the surplus members unbindable.
   * @param {number} replicaCount - Number of members to provision volumes for.
   * @param {string} namespace - Namespace the claims live in.
   * @returns {string} Multi-document PersistentVolume YAML.
   */
  static buildReplicaVolumeManifest(replicaCount, namespace) {
    return Array.from({ length: replicaCount }, (_, i) =>
      [
        'apiVersion: v1',
        'kind: PersistentVolume',
        'metadata:',
        `  name: ${MONGODB_STATEFULSET_NAME}-pv-${i}`,
        '  labels:',
        `    app: ${MONGODB_STATEFULSET_NAME}`,
        'spec:',
        '  capacity:',
        '    storage: 5Gi',
        '  accessModes:',
        '    - ReadWriteOnce',
        '  persistentVolumeReclaimPolicy: Retain',
        `  storageClassName: ${MONGODB_STORAGE_CLASS_NAME}`,
        // claimRef pins each volume to exactly one member, so ordinals can never cross-bind and
        // land two mongod processes on one data directory.
        '  claimRef:',
        `    namespace: ${namespace}`,
        `    name: ${MONGODB_STATEFULSET_NAME}-storage-${MONGODB_STATEFULSET_NAME}-${i}`,
        '  hostPath:',
        `    path: ${MONGODB_DATA_ROOT}/v${i}`,
        '    type: DirectoryOrCreate',
      ].join('\n'),
    ).join('\n---\n');
  }

  /**
   * Applies the generated replica volumes, and removes any volume left over from a larger previous
   * replica count so a scale-down does not strand a PV bound to a claim that no longer exists.
   * @param {string} namespace - Target namespace.
   * @param {number} replicaCount - Number of members to provision volumes for.
   */
  static applyReplicaVolumes(namespace, replicaCount) {
    const manifest = MongoBootstrap.buildReplicaVolumeManifest(replicaCount, namespace);
    shellExec(`kubectl apply -f - <<'UNDERPOST_MONGO_PV_EOF'\n${manifest}\nUNDERPOST_MONGO_PV_EOF`);
    logger.info(`Applied ${replicaCount} MongoDB replica volume(s)`);

    const stale = shellExec(`kubectl get pv -l app=${MONGODB_STATEFULSET_NAME} -o name 2>/dev/null || true`, {
      stdout: true,
      silent: true,
      silentOnError: true,
    })
      .split('\n')
      .map((name) => name.replace('persistentvolume/', '').trim())
      .filter((name) => {
        const ordinal = name.startsWith(`${MONGODB_STATEFULSET_NAME}-pv-`)
          ? Number(name.slice(`${MONGODB_STATEFULSET_NAME}-pv-`.length))
          : NaN;
        return Number.isInteger(ordinal) && ordinal >= replicaCount;
      });
    for (const name of stale) {
      shellExec(`kubectl delete pv ${name} --ignore-not-found`);
      logger.info(`Removed stale replica volume ${name} (beyond replica count ${replicaCount})`);
    }
  }

  /**
   * Reads the claim-to-volume-to-path mapping for every replica and logs it. Non-throwing, so it
   * can enrich a failure path without masking the original error.
   * @param {string} namespace - Target namespace.
   * @param {number} replicaCount - Expected number of members.
   * @returns {Array<{claim: string, volume: string, path: string}>} Bindings in ordinal order.
   */
  static reportReplicaVolumeBindings(namespace, replicaCount) {
    const bindings = [];
    for (let i = 0; i < replicaCount; i++) {
      const claim = `${MONGODB_STATEFULSET_NAME}-storage-${MONGODB_STATEFULSET_NAME}-${i}`;
      const volume = shellExec(
        `kubectl get pvc ${claim} -n ${namespace} -o jsonpath='{.spec.volumeName}' 2>/dev/null || true`,
        { stdout: true, silent: true, silentOnError: true },
      ).trim();
      const path = volume
        ? shellExec(`kubectl get pv ${volume} -o jsonpath='{.spec.hostPath.path}' 2>/dev/null || true`, {
            stdout: true,
            silent: true,
            silentOnError: true,
          }).trim()
        : '';
      bindings.push({ claim, volume, path });
    }
    logger.info('MongoDB replica volume bindings', bindings);
    return bindings;
  }

  /**
   * Verifies every replica PVC bound to its own distinct hostPath.
   *
   * Two members sharing one directory is unrecoverable at the mongod level — the second dies on
   * `WiredTiger.lock: fcntl: Resource temporarily unavailable` after the readiness wait has
   * already burned its timeout, and the real cause (a volume binding, not MongoDB) is invisible
   * in the pod logs. Checking the binding directly turns that into an immediate, named failure.
   * @param {string} namespace - Target namespace.
   * @param {number} replicaCount - Expected number of members.
   * @throws {Error} When a claim is unbound, or two claims share a backing path.
   */
  static assertReplicaVolumeBindings(namespace, replicaCount) {
    const bindings = MongoBootstrap.reportReplicaVolumeBindings(namespace, replicaCount);

    const unbound = bindings.filter((binding) => !binding.volume);
    if (unbound.length > 0)
      throw new Error(
        `MongoDB claims are not bound to a PersistentVolume: ${unbound.map((b) => b.claim).join(', ')}. ` +
          `Expected one volume per replica (${replicaCount} total); check that the generated PVs applied ` +
          `and that each claimRef matches.`,
      );

    // Only hostPath-backed volumes expose a path to compare; a dynamically provisioned volume
    // reports none, which is itself worth surfacing since these PVs are meant to be static.
    const byPath = bindings.reduce((acc, binding) => {
      if (binding.path) (acc[binding.path] = acc[binding.path] || []).push(binding.claim);
      return acc;
    }, {});
    const shared = Object.entries(byPath).filter(([, claims]) => claims.length > 1);
    if (shared.length > 0)
      throw new Error(
        `MongoDB members would share a data directory, which mongod cannot survive: ` +
          shared.map(([path, claims]) => `${path} <- ${claims.join(' + ')}`).join('; ') +
          `. Delete the claims and PVs, then redeploy: ` +
          `kubectl delete pvc -n ${namespace} -l app=mongodb; kubectl delete pv -l app=mongodb`,
      );
  }

  /**
   * Full MongoDB replica set initialization.
   *
   * Handles secret creation, PVC/hostPath cleanup, statefulset rollout, pod readiness
   * wait, and idempotent replica set bootstrapping via mongosh.
   *
   * @param {MongoBootstrapOptions} options - Bootstrap configuration.
   * @returns {Promise<void>}
   */
  static async initReplicaSet(options) {
    const {
      namespace = 'default',
      replicaCount = MONGODB_DEFAULT_REPLICA_COUNT,
      hostList = '',
      pullImage = false,
      reset = false,
      clusterType = 'kind',
      underpostRoot,
    } = options;

    // No upward clamp: an explicit `--replicas 2` must deploy two members, not be silently
    // raised to the default.
    const effectiveReplicaCount = resolveReplicaCount(replicaCount, MONGODB_DEFAULT_REPLICA_COUNT);
    if (effectiveReplicaCount % 2 === 0)
      logger.warn(
        `Deploying ${effectiveReplicaCount} MongoDB members. An even-sized replica set has no ` +
          `majority when one member is down, so the set becomes read-only on a single failure. ` +
          `Odd counts (3, 5) are recommended.`,
      );
    const { username: mongoRootUsername, password: mongoRootPassword } = MongoBootstrap.readMongoCredentials();
    const mongoReplicaHosts = resolveMongoReplicaHosts({
      hostList,
      replicaCount: effectiveReplicaCount,
    });
    const useExplicitHosts = !!hostList.trim();

    // Kind-specific mount checks
    const isKind = clusterType === 'kind' || !clusterType;
    let kindNodes = [];
    if (isKind) {
      const kindNodesRaw = shellExec('kind get nodes', { stdout: true, silent: true, silentOnError: true });
      kindNodes = kindNodesRaw
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean);
      if (kindNodes.length > 0) {
        const missingMounts = MongoBootstrap.findNodesMissingMongoMount(kindNodes);
        if (missingMounts.length > 0) {
          throw new Error(
            `Kind cluster is missing required mount '/data/mongodb' on nodes: ${missingMounts.join(', ')}. ` +
              `Run with --reset or manually add the mount to kind-config.yaml.`,
          );
        }
      }
    }

    // Pull image if requested (cluster-type aware)
    if (pullImage) {
      if (isKind) {
        const tarPath = `/tmp/kind-image-mongo-latest.tar`;
        shellExec('docker pull mongo:latest');
        shellExec(`docker save mongo:latest -o ${tarPath}`);
        const nodes = shellExec('kind get nodes', { stdout: true, silent: true }).trim().split('\n').filter(Boolean);
        for (const node of nodes) {
          shellExec(`cat ${tarPath} | docker exec -i ${node} ctr --namespace=k8s.io images import -`);
        }
        shellExec(`rm -f ${tarPath}`);
      } else {
        shellExec(crictlCommandFactory('pull mongo:latest', { k3s: clusterType === 'k3s' }));
      }
    }

    // Secrets
    MongoBootstrap.ensureMongoSecrets(namespace);

    // Tear down existing statefulset
    shellExec(`kubectl delete statefulset ${MONGODB_STATEFULSET_NAME} -n ${namespace} --ignore-not-found`);
    shellExec(`kubectl wait --for=delete pod -l app=mongodb -n ${namespace} --timeout=180s`, { silentOnError: true });

    // Clean data if reset or kind
    if (reset || isKind) {
      // Delete the StatefulSet's PVCs by name. A label selector cannot reach them: the
      // `volumeClaimTemplates` entry carries no labels, so `-l app=mongodb` matches nothing and
      // silently leaves the previous run's PVCs Bound. With `persistentVolumeReclaimPolicy:
      // Retain` those stale claims keep their old PVs, so the freshly created `mongodb-pv-N`
      // (whose `claimRef` names the same PVCs) never binds and pods mount the previous volumes —
      // which is how two members end up on one hostPath and mongod dies on the WiredTiger lock.
      for (let i = 0; i < MONGODB_ORDINAL_SWEEP; i++)
        shellExec(
          `kubectl delete pvc ${MONGODB_STATEFULSET_NAME}-storage-${MONGODB_STATEFULSET_NAME}-${i} -n ${namespace} --ignore-not-found`,
        );
      shellExec(`kubectl delete pvc -l app=mongodb -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pvc mongodb-pvc -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pv -l app=mongodb --ignore-not-found`);
      shellExec(`kubectl delete pv mongodb-pv --ignore-not-found`);

      // The data itself, for every cluster type. The PVs are hostPath with
      // `persistentVolumeReclaimPolicy: Retain`, so deleting the objects frees
      // nothing: the next run re-binds the same directories and mongod boots
      // with the previous cluster's replica set config, ending up outside it.
      // Only this node's copy is removed — on a multi-node cluster, wipe the
      // other nodes' /data/mongodb before rebuilding there.
      logger.info('Removing retained MongoDB hostPath data', {
        path: MONGODB_DATA_ROOT,
        replicas: effectiveReplicaCount,
      });
      shellExec(`sudo mkdir -p ${MONGODB_DATA_ROOT}`);
      for (let i = 0; i < effectiveReplicaCount; i++) {
        shellExec(`sudo rm -rf ${MONGODB_DATA_ROOT}/v${i}`);
      }
      // A directory recreated after a wipe inherits its parent's context, and the WiredTiger
      // files mongod then creates inherit that in turn — so recreate and relabel here, before the
      // Kind remount below binds these inodes into the node containers.
      MongoBootstrap.prepareReplicaDataRoot(effectiveReplicaCount);
      // Fix any stale bind mounts caused by prior deletion of /data/mongodb on the host
      if (isKind) MongoBootstrap.remountKindMongoVolume(kindNodes, effectiveReplicaCount);
    }

    // Apply manifests
    // A StorageClass `provisioner` is immutable, so a plain apply fails against a class created
    // with a different one. Clusters provisioned before the switch to `kubernetes.io/no-provisioner`
    // carry the dynamic `rancher.io/local-path`; recreate in that case. Deleting the class is safe
    // — bound PVs and PVCs reference it by name only and are untouched.
    const storageClassProvisioner = shellExec(
      `kubectl get storageclass ${MONGODB_STORAGE_CLASS_NAME} -o jsonpath='{.provisioner}' 2>/dev/null || true`,
      { stdout: true, silent: true, silentOnError: true },
    ).trim();
    if (storageClassProvisioner && storageClassProvisioner !== MONGODB_STORAGE_CLASS_PROVISIONER) {
      logger.warn(
        `StorageClass ${MONGODB_STORAGE_CLASS_NAME} uses provisioner '${storageClassProvisioner}'; recreating as ` +
          `'${MONGODB_STORAGE_CLASS_PROVISIONER}' so the static replica PVs bind deterministically.`,
      );
      shellExec(`kubectl delete storageclass ${MONGODB_STORAGE_CLASS_NAME} --ignore-not-found`);
    }
    shellExec(`kubectl apply -f ${underpostRoot}/manifests/mongodb/storage-class.yaml -n ${namespace}`);
    // Unconditional, not only on the reset path: an existing cluster's member directories were
    // created before the mapping existed (or by kubelet's `DirectoryOrCreate`), so they carry the
    // policy default until this runs. Idempotent, and it never touches the data itself.
    MongoBootstrap.prepareReplicaDataRoot(effectiveReplicaCount);
    // One PV per member, generated from the effective replica count. A static manifest can only
    // ever describe a fixed number, so any `--replicas` above it leaves the extra members with no
    // volume to bind and the StatefulSet stalls forever on Pending.
    MongoBootstrap.applyReplicaVolumes(namespace, effectiveReplicaCount);
    shellExec(`kubectl apply -k ${underpostRoot}/manifests/mongodb -n ${namespace}`);
    shellExec(
      `kubectl scale statefulset/${MONGODB_STATEFULSET_NAME} --replicas=${effectiveReplicaCount} -n ${namespace}`,
    );

    // Wait for all pods
    const failedPods = await Underpost.kubectl.waitForPodsReady({
      namespace,
      podNames: Array.from({ length: effectiveReplicaCount }, (_, i) => `${MONGODB_STATEFULSET_NAME}-${i}`),
    });
    if (failedPods.length > 0) {
      // Surface the volume topology before failing: a stalled rollout is far more often a binding
      // problem than a MongoDB one, and the mapping names it immediately.
      MongoBootstrap.reportReplicaVolumeBindings(namespace, effectiveReplicaCount);
      throw new Error(
        `MongoDB replica pods did not reach Running state in time: ${failedPods.join(', ')}. ` +
          `Ensure podManagementPolicy is set to OrderedReady in statefulset.yaml.`,
      );
    }

    MongoBootstrap.assertReplicaVolumeBindings(namespace, effectiveReplicaCount);

    // Build the bootstrap script
    const defaultHosts = Array.from(
      { length: effectiveReplicaCount },
      (_, i) => `${MONGODB_STATEFULSET_NAME}-${i}.${MONGODB_SERVICE_NAME}:${MONGODB_DEFAULT_PORT}`,
    );
    const desiredHosts = useExplicitHosts ? mongoReplicaHosts : defaultHosts;

    const initScript = MongoBootstrap.buildMongoshInitScript({
      replicaSetName: MONGODB_DEFAULT_REPLICA_SET,
      replicaCount: effectiveReplicaCount,
      statefulSetName: MONGODB_STATEFULSET_NAME,
      serviceName: MONGODB_SERVICE_NAME,
      desiredHosts,
      rootUser: mongoRootUsername,
      rootPassword: mongoRootPassword,
    });
    const inlineInitScript = initScript.replace(/\r?\n/g, ' ');

    // Execute init with retry
    const execMongoCmd = (auth = false) => {
      const pod0 = `${MONGODB_STATEFULSET_NAME}-0`;
      if (auth && mongoRootUsername && mongoRootPassword) {
        return shellExec(
          `sudo kubectl exec -i ${pod0} -n ${namespace} -- bash -lc ` +
            `'mongosh --quiet --host localhost --authenticationDatabase admin ` +
            `-u ${JSON.stringify(mongoRootUsername)} -p ${JSON.stringify(mongoRootPassword)} ` +
            `--eval ${JSON.stringify(inlineInitScript)}'`,
          { silentOnError: true },
        );
      }
      return shellExec(
        `sudo kubectl exec -i ${pod0} -n ${namespace} -- bash -lc ` +
          `'mongosh --quiet --host localhost --eval ${JSON.stringify(inlineInitScript)}'`,
        { silentOnError: true },
      );
    };

    // Two members holding different replica set IDs cannot be merged — every heartbeat
    // between them is rejected — so retrying only repeats the same failure. Diagnose it once
    // and stop: choosing which identity survives means discarding the other member's data,
    // which is never safe to decide automatically.
    const assertSetIdentityMatch = (result) => {
      const divergent = parseDivergentSetIds(`${result.stdout || ''}${result.stderr || ''}`);
      if (!divergent) return;
      throw new Error(
        `MongoDB members belong to different replica sets: ${MONGODB_STATEFULSET_NAME}-0 holds replSetId ` +
          `${divergent.selfSetId}, ${divergent.target} holds ${divergent.targetSetId}. A set cannot merge two ` +
          `identities. Find which volume under ${MONGODB_DATA_ROOT} holds the data to keep, back it up, then ` +
          `wipe the other members' volumes so they resync from the survivor.`,
      );
    };

    let success = false;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const noAuthResult = execMongoCmd(false);
      assertSetIdentityMatch(noAuthResult);

      if (noAuthResult.code === 0 && !(mongoRootUsername && mongoRootPassword)) {
        success = true;
        break;
      }

      const authResult = execMongoCmd(true);
      assertSetIdentityMatch(authResult);
      if (authResult.code === 0) {
        success = true;
        break;
      }
      logger.warn(
        noAuthResult.code === 0
          ? 'No-auth bootstrap succeeded but auth verify failed, retrying...'
          : 'Both bootstrap paths failed, retrying...',
        { attempt },
      );

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (!success) {
      throw new Error(
        'MongoDB replica set initialization failed after max retries. ' + 'Check pod logs for mongodb-0 to diagnose.',
      );
    }

    logger.info('MongoDB replica set initialized successfully.');
  }

  /**
   * Performs a targeted, hard cleanup of only MongoDB-related Kubernetes resources
   * and artifacts (StatefulSet, PVCs/PVs, Secrets, ConfigMaps, caches, YAML manifests, and
   * hostPath data) without restarting the whole node or touching unrelated cluster resources.
   * @param {object} [options] - Configuration options for the MongoDB reset.
   * @param {string} [options.namespace='default'] - Kubernetes namespace.
   * @param {string} [options.clusterType='kind'] - The type of cluster: 'kind', 'kubeadm', or 'k3s'.
   * @param {string} [options.underpostRoot] - The root path of the underpost project (manifests location).
   * @memberof MongoBootstrap
   */
  static async reset(options = { namespace: 'default', clusterType: 'kind', underpostRoot: '.' }) {
    const { namespace = 'default', clusterType = 'kind', underpostRoot } = options;
    const isKind = clusterType === 'kind' || !clusterType;
    logger.info(`Starting MongoDB-only reset in namespace '${namespace}' (cluster type: ${clusterType})...`);

    try {
      // Phase 1: Delete MongoDB StatefulSet and Deployment (both current and legacy mongodb-4.4)
      logger.info('Phase 1/6: Deleting MongoDB workloads...');
      shellExec(`kubectl delete statefulset mongodb -n ${namespace} --ignore-not-found --wait=false`);
      shellExec(`kubectl delete deployment mongodb-deployment -n ${namespace} --ignore-not-found --wait=false`);

      // Phase 2: Delete MongoDB headless service (will be recreated on redeploy)
      logger.info('Phase 2/6: Deleting MongoDB Services and ConfigMaps...');
      shellExec(`kubectl delete service mongodb-service -n ${namespace} --ignore-not-found`);

      // Phase 3: Delete MongoDB Secrets
      logger.info('Phase 3/6: Deleting MongoDB Secrets...');
      shellExec(`kubectl delete secret mongodb-secret -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete secret mongodb-keyfile -n ${namespace} --ignore-not-found`);

      // Phase 4: Delete MongoDB PVCs and PVs (both current and legacy mongodb-4.4)
      logger.info('Phase 4/6: Deleting MongoDB PersistentVolumeClaims and PersistentVolumes...');
      // Delete PVCs from volumeClaimTemplates
      for (let i = 0; i < MONGODB_ORDINAL_SWEEP; i++) {
        shellExec(`kubectl delete pvc mongodb-storage-mongodb-${i} -n ${namespace} --ignore-not-found`);
      }
      shellExec(`kubectl delete pvc mongodb-pvc -n ${namespace} --ignore-not-found`);
      for (let i = 0; i < MONGODB_ORDINAL_SWEEP; i++)
        shellExec(`kubectl delete pv ${MONGODB_STATEFULSET_NAME}-pv-${i} --ignore-not-found`);
      shellExec(`kubectl delete pv mongodb-pv --ignore-not-found`);
      // Also catch any remaining PVs with the app=mongodb label
      shellExec(`kubectl delete pv -l app=mongodb --ignore-not-found`);
      // Wait for PVs to be fully deleted to avoid "object modified" conflict on re-apply
      shellExec(`kubectl wait --for=delete pv mongodb-pv-0 mongodb-pv-1 mongodb-pv-2 mongodb-pv --timeout=180s`, {
        silentOnError: true,
      });

      // Delete MongoDB StorageClass
      shellExec(`kubectl delete storageclass mongodb-storage-class --ignore-not-found`);

      // Phase 5: Clean up hostPath data
      // IMPORTANT: Do NOT remove /data/mongodb itself — it is bind-mounted into Kind node
      // containers by inode. Removing it makes the bind mount stale; only clear subdirs.
      logger.info('Phase 5/6: Cleaning up MongoDB hostPath data...');
      shellExec(`sudo mkdir -p ${MONGODB_DATA_ROOT}`);
      for (let i = 0; i < MONGODB_ORDINAL_SWEEP; i++) {
        shellExec(`sudo rm -rf ${MONGODB_DATA_ROOT}/v${i}`);
      }
      MongoBootstrap.prepareReplicaDataRoot(MONGODB_ORDINAL_SWEEP);
      // For Kind: repair any stale bind mounts via nsenter (overmounts with current host inode)
      if (isKind) {
        const nodesRaw = shellExec('kind get nodes', { stdout: true, silent: true, silentOnError: true });
        const kindResetNodes = nodesRaw
          .split('\n')
          .map((n) => n.trim())
          .filter(Boolean);
        MongoBootstrap.remountKindMongoVolume(kindResetNodes);
      }

      // Phase 6: Wait for pod deletion to complete
      logger.info('Phase 6/6: Waiting for MongoDB pods to terminate...');
      shellExec(`kubectl wait --for=delete pod -l app=mongodb -n ${namespace} --timeout=120s`, { silentOnError: true });

      logger.info('MongoDB reset completed successfully. Ready for fresh MongoDB deployment.');
    } catch (error) {
      logger.error(`Error during MongoDB reset: ${error.message}`);
      console.error(error);
    }
  }

  /**
   * Gets the primary MongoDB pod name from replica set status.
   *
   * Probing is bounded on every axis, because an unbounded probe is what makes the
   * backup pipeline stall: the driver connects `directConnection` so it never tries
   * to reach sibling members by DNS, each shell call carries explicit server-selection
   * timeouts, and the whole `kubectl exec` is wrapped in a wall-clock budget. The
   * cheapest probe (`hello`, which the server answers before authentication) runs
   * first, so a healthy replica set resolves without credentials at all.
   *
   * @param {object} [options] - Query options.
   * @param {string} [options.namespace='default'] - Kubernetes namespace.
   * @param {string} [options.podName='mongodb-0'] - Preferred MongoDB pod to query first.
   * @param {string} [options.username] - MongoDB admin username.
   * @param {string} [options.password] - MongoDB admin password.
   * @param {string} [options.authDatabase='admin'] - Auth database.
   * @param {boolean} [options.disableAuth=false] - Whether to disable auth in the query (for testing).
   * @param {number} [options.probeTimeoutSeconds=45] - Wall-clock budget per shell probe.
   * @returns {string|null} Primary pod name, or null if not found.
   */
  static getPrimaryPodName(options = {}) {
    const {
      namespace = 'default',
      podName = 'mongodb-0',
      username,
      password,
      authDatabase = 'admin',
      disableAuth = false,
      probeTimeoutSeconds = MONGODB_PRIMARY_PROBE_TIMEOUT_SECONDS,
    } = options;

    const readTrimmedFile = (filePath) => {
      try {
        if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8').trim();
      } catch {
        /* ignore */
      }
      return '';
    };

    const mongoUser =
      username ||
      process.env.MONGODB_USERNAME ||
      process.env.DB_USER ||
      readTrimmedFile(Underpost.secret.seedSources('mongodb-secret').username);
    const mongoPass =
      password ||
      process.env.MONGODB_PASSWORD ||
      process.env.DB_PASSWORD ||
      readTrimmedFile(Underpost.secret.seedSources('mongodb-secret').password);

    const candidates = MongoBootstrap.resolvePrimaryProbeCandidates({ namespace, podName });
    const probes = MongoBootstrap.primaryProbeFactory({
      disableAuth,
      username: mongoUser,
      password: mongoPass,
      authDatabase,
    });

    for (const candidate of candidates) {
      if (!Underpost.kubectl.ensureExecReady({ podName: candidate, namespace })) continue;

      for (const probe of probes) {
        const output = shellExec(
          `timeout --kill-after=10s ${probeTimeoutSeconds}s ` +
            `sudo kubectl exec -n ${namespace} -i ${candidate} -- ${probe.command}`,
          { stdout: true, silent: true, silentOnError: true, disableLog: true },
        );
        const primary = parsePrimaryHost(output);
        if (primary) {
          logger.info('Found MongoDB primary pod', { primary, probedFrom: candidate, probe: probe.id });
          return primary;
        }
      }

      logger.warn('MongoDB pod answered no primary', { podName: candidate, namespace });
    }

    logger.warn('No MongoDB primary pod found.', { namespace, candidates });
    return null;
  }

  /**
   * Resolves which pods to interrogate for the replica-set primary, preferred pod first.
   *
   * Any reachable member knows who the primary is, so a member that is mid-restart
   * must not end the search — the caller would otherwise fall back to a pod that is
   * merely first in the list rather than the one accepting writes.
   *
   * @param {object} params
   * @param {string} params.namespace - Kubernetes namespace.
   * @param {string} params.podName - Preferred pod to probe first.
   * @returns {string[]} Ordered, de-duplicated pod names.
   */
  static resolvePrimaryProbeCandidates({ namespace, podName }) {
    const candidates = podName ? [podName] : [];
    try {
      for (const pod of Underpost.kubectl.get(MONGODB_STATEFULSET_NAME, 'pods', namespace)) {
        if (!pod.NAME || pod.STATUS !== 'Running') continue;
        if (!candidates.includes(pod.NAME)) candidates.push(pod.NAME);
      }
    } catch (error) {
      logger.warn('Could not list MongoDB pods, probing the requested pod only', {
        namespace,
        error: error.message,
      });
    }
    return candidates;
  }

  /**
   * Builds the ordered probe list used to resolve the replica-set primary.
   * @param {object} params
   * @param {boolean} params.disableAuth - Legacy `mongo` shell without credentials.
   * @param {string} params.username - MongoDB username, when available.
   * @param {string} params.password - MongoDB password, when available.
   * @param {string} params.authDatabase - Auth database for credentialed probes.
   * @returns {Array<{id: string, command: string}>} Probes in cheapest-first order.
   */
  static primaryProbeFactory({ disableAuth, username, password, authDatabase }) {
    if (disableAuth)
      return [
        { id: 'legacy-isMaster', command: `mongo --quiet --eval '${MONGODB_PRIMARY_EVAL.isMaster}'` },
        { id: 'legacy-rs-status', command: `mongo --quiet --eval '${MONGODB_PRIMARY_EVAL.rsStatus}'` },
      ];

    const shell = `mongosh ${JSON.stringify(MONGODB_PRIMARY_PROBE_URI)} --quiet`;
    const authFlags =
      username && password
        ? ` --authenticationDatabase ${JSON.stringify(authDatabase)} -u ${JSON.stringify(username)} -p ${JSON.stringify(password)}`
        : '';

    // `hello` is answered before authentication, so it resolves the primary even when
    // the credentials at hand are an app user without cluster-monitor rights.
    const probes = [{ id: 'hello', command: `${shell} --eval '${MONGODB_PRIMARY_EVAL.hello}'` }];
    if (authFlags) {
      probes.push({ id: 'hello-auth', command: `${shell}${authFlags} --eval '${MONGODB_PRIMARY_EVAL.hello}'` });
      probes.push({ id: 'rs-status-auth', command: `${shell}${authFlags} --eval '${MONGODB_PRIMARY_EVAL.rsStatus}'` });
    }
    probes.push({ id: 'rs-status', command: `${shell} --eval '${MONGODB_PRIMARY_EVAL.rsStatus}'` });
    return probes;
  }
}

export { MongoBootstrap, parsePrimaryHost, parseDivergentSetIds, MONGODB_PRIMARY_PROBE_URI };
