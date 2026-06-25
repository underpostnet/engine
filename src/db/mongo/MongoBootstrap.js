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
import { loggerFactory } from '../../server/logger.js';
import { shellExec } from '../../server/process.js';
import {
  MONGODB_DEFAULT_REPLICA_COUNT,
  MONGODB_DEFAULT_REPLICA_SET,
  MONGODB_SERVICE_NAME,
  MONGODB_STATEFULSET_NAME,
  resolveMongoReplicaHosts,
} from './MongooseDB.js';

const logger = loggerFactory(import.meta);

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
    const mePort = '27017';
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
      `const mePort = "27017";`,
      `const desiredConfig = ${JSON.stringify(desiredConfig)};`,
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

      `const reconfigure = () => {`,
      `  if (!ensureAdminAuth()) return false;`,
      `  const cur = rs.conf();`,
      `  const curHosts = cur.members.map(m => m.host).sort().join(",");`,
      `  const nextHosts = desiredConfig.members.map(m => m.host).sort().join(",");`,
      `  if (curHosts !== nextHosts || cur._id !== desiredConfig._id) {`,
      `    rs.reconfig({...desiredConfig, version: (cur.version || 1) + 1}, { force: true });`,
      `    print("SUCCESS_RECONFIGURED");`,
      `  } else {`,
      `    print("SUCCESS_ALREADY_MATCHES");`,
      `  }`,
      `  return true;`,
      `};`,

      // Determine if replica set is already initialized
      `let initialized = false;`,
      `try {`,
      `  const s = rs.status();`,
      `  if (s && s.ok === 1) initialized = true;`,
      `} catch(e) {`,
      `  const msg = String(e);`,
      `  if (msg.includes("requires authentication") || msg.includes("Unauthorized") || msg.includes("not authorized")) {`,
      `    initialized = true;`,
      `  } else if (!msg.includes("NotYetInitialized") && !msg.includes("no replset config") && !msg.includes("maps to this node")) {`,
      `    throw e;`,
      `  }`,
      `}`,

      // Not initialized: bootstrap via localhost
      `if (!initialized) {`,
      `  try {`,
      `    rs.initiate({ _id: desiredConfig._id, members: [{ _id: 0, host: "localhost:" + mePort }] });`,
      `  } catch(e) {`,
      `    const msg = String(e);`,
      `    if (!msg.includes("already initialized") && !msg.includes("AlreadyInitialized")) throw e;`,
      `  }`,
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
        `sudo docker inspect ${node} --format '{{range .Mounts}}{{if eq .Destination "/data/mongodb"}}yes{{end}}{{end}}'`,
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
    const basePath = '/data/mongodb';
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
   * @param {string} [basePath='/data/mongodb'] - The base path containing v0/v1/v2 subdirs.
   */
  static remountKindMongoVolume(kindNodes, basePath = '/data/mongodb') {
    for (const node of kindNodes) {
      logger.info(`Cleaning MongoDB data dirs inside Kind node '${node}'...`);
      for (let i = 0; i < 3; i++) {
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
   * Reads MongoDB root credentials from engine-private.
   * @param {string} enginePrivateRoot - Path to the engine-private directory.
   * @returns {{ username: string, password: string }}
   */
  static readMongoCredentials(enginePrivateRoot) {
    return {
      username: MongoBootstrap.readCredential(`${enginePrivateRoot}/mongodb-username`),
      password: MongoBootstrap.readCredential(`${enginePrivateRoot}/mongodb-password`),
    };
  }

  /**
   * Creates or updates Kubernetes secrets required by the MongoDB statefulset.
   * @param {string} namespace - Target namespace.
   * @param {string} enginePrivateRoot - Path to engine-private directory.
   */
  static ensureMongoSecrets(namespace, enginePrivateRoot) {
    const keyfile = MongoBootstrap.readCredential(`${enginePrivateRoot}/mongodb-keyfile`);
    const { username, password } = MongoBootstrap.readMongoCredentials(enginePrivateRoot);

    shellExec(
      `sudo kubectl create secret generic mongodb-keyfile` +
        ` --from-literal=mongodb-keyfile="${keyfile.replace(/'/g, "'\\''")}"` +
        ` --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
    );
    shellExec(
      `sudo kubectl create secret generic mongodb-secret` +
        ` --from-literal=username="${username}" --from-literal=password="${password}"` +
        ` --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
    );
  }

  /**
   * Waits for all MongoDB statefulset pods to reach Running state.
   * @param {string} namespace - Target namespace.
   * @param {number} replicaCount - Expected number of pods.
   * @returns {Promise<number>} Number of pods that failed to become ready (0 = all good).
   */
  static async waitForPods(namespace, replicaCount) {
    let failedCount = 0;
    for (let i = 0; i < replicaCount; i++) {
      const podName = `${MONGODB_STATEFULSET_NAME}-${i}`;
      const result = shellExec(`kubectl wait --for=condition=Ready pod/${podName} -n ${namespace} --timeout=60s`);
      if (result.code !== 0) {
        logger.error(`Pod ${podName} did not become ready`);
        failedCount++;
      }
    }
    return failedCount;
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

    const enginePrivateRoot = `${process.cwd()}/engine-private`;
    const effectiveReplicaCount = Math.max(Number(replicaCount) || MONGODB_DEFAULT_REPLICA_COUNT, 3);
    const mongoRootUsername = MongoBootstrap.readCredential(`${enginePrivateRoot}/mongodb-username`);
    const mongoRootPassword = MongoBootstrap.readCredential(`${enginePrivateRoot}/mongodb-password`);
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
        const criSock =
          shellExec('test -S /var/run/crio/crio.sock && echo crio || echo containerd', {
            stdout: true,
            silent: true,
          }).trim() === 'crio'
            ? 'unix:///var/run/crio/crio.sock'
            : 'unix:///run/containerd/containerd.sock';
        shellExec(
          `sudo env PATH="$PATH:/usr/local/bin:/usr/bin" crictl --runtime-endpoint ${criSock} pull mongo:latest`,
        );
      }
    }

    // Secrets
    MongoBootstrap.ensureMongoSecrets(namespace, enginePrivateRoot);

    // Tear down existing statefulset
    shellExec(`kubectl delete statefulset ${MONGODB_STATEFULSET_NAME} -n ${namespace} --ignore-not-found`);
    shellExec(`kubectl wait --for=delete pod -l app=mongodb -n ${namespace} --timeout=180s`, { silentOnError: true });

    // Clean data if reset or kind
    if (reset || isKind) {
      shellExec(`kubectl delete pvc -l app=mongodb -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pvc mongodb-pvc -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pv -l app=mongodb --ignore-not-found`);
      shellExec(`kubectl delete pv mongodb-pv --ignore-not-found`);

      if (isKind) {
        shellExec('sudo mkdir -p /data/mongodb');
        for (let i = 0; i < effectiveReplicaCount; i++) {
          shellExec(`sudo rm -rf /data/mongodb/v${i}`);
          shellExec(`sudo mkdir -p /data/mongodb/v${i}`);
        }
        // Fix any stale bind mounts caused by prior deletion of /data/mongodb on the host
        MongoBootstrap.remountKindMongoVolume(kindNodes);
      }
    }

    // Apply manifests
    shellExec(`kubectl apply -f ${underpostRoot}/manifests/mongodb/storage-class.yaml -n ${namespace}`);
    shellExec(`kubectl apply -k ${underpostRoot}/manifests/mongodb -n ${namespace}`);
    shellExec(
      `kubectl scale statefulset/${MONGODB_STATEFULSET_NAME} --replicas=${effectiveReplicaCount} -n ${namespace}`,
    );

    // Wait for all pods
    const failedCount = await MongoBootstrap.waitForPods(namespace, effectiveReplicaCount);
    if (failedCount > 0) {
      throw new Error(
        `MongoDB replica pods did not reach Running state in time. ` +
          `Ensure podManagementPolicy is set to OrderedReady in statefulset.yaml.`,
      );
    }

    // Build the bootstrap script
    const defaultHosts = Array.from(
      { length: effectiveReplicaCount },
      (_, i) => `${MONGODB_STATEFULSET_NAME}-${i}.${MONGODB_SERVICE_NAME}:27017`,
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

    let success = false;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const noAuthResult = execMongoCmd(false);
      if (noAuthResult.code === 0) {
        if (mongoRootUsername && mongoRootPassword) {
          const authResult = execMongoCmd(true);
          if (authResult.code === 0) {
            success = true;
            break;
          }
          logger.warn('No-auth bootstrap succeeded but auth verify failed, retrying...', { attempt });
        } else {
          success = true;
          break;
        }
      } else {
        const authResult = execMongoCmd(true);
        if (authResult.code === 0) {
          success = true;
          break;
        }
        logger.warn('Both bootstrap paths failed, retrying...', { attempt });
      }

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
      for (let i = 0; i < 10; i++) {
        shellExec(`kubectl delete pvc mongodb-storage-mongodb-${i} -n ${namespace} --ignore-not-found`);
      }
      shellExec(`kubectl delete pvc mongodb-pvc -n ${namespace} --ignore-not-found`);
      shellExec(`kubectl delete pv mongodb-pv-0 --ignore-not-found`);
      shellExec(`kubectl delete pv mongodb-pv-1 --ignore-not-found`);
      shellExec(`kubectl delete pv mongodb-pv-2 --ignore-not-found`);
      shellExec(`kubectl delete pv mongodb-pv --ignore-not-found`);
      // Also catch any remaining PVs with the app=mongodb label
      shellExec(`kubectl delete pv -l app=mongodb --ignore-not-found`);
      // Wait for PVs to be fully deleted to avoid "object modified" conflict on re-apply
      shellExec(`kubectl wait --for=delete pv mongodb-pv-0 mongodb-pv-1 mongodb-pv-2 mongodb-pv --timeout=60s`, {
        silentOnError: true,
      });

      // Delete MongoDB StorageClass
      shellExec(`kubectl delete storageclass mongodb-storage-class --ignore-not-found`);

      // Phase 5: Clean up hostPath data
      // IMPORTANT: Do NOT remove /data/mongodb itself — it is bind-mounted into Kind node
      // containers by inode. Removing it makes the bind mount stale; only clear subdirs.
      logger.info('Phase 5/6: Cleaning up MongoDB hostPath data...');
      shellExec(`sudo mkdir -p /data/mongodb`);
      for (let i = 0; i < 3; i++) {
        shellExec(`sudo rm -rf /data/mongodb/v${i}`);
        shellExec(`sudo mkdir -p /data/mongodb/v${i}`);
      }
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
   * @param {object} [options] - Query options.
   * @param {string} [options.namespace='default'] - Kubernetes namespace.
   * @param {string} [options.podName='mongodb-0'] - Any MongoDB pod to query.
   * @param {string} [options.username] - MongoDB admin username.
   * @param {string} [options.password] - MongoDB admin password.
   * @param {string} [options.authDatabase='admin'] - Auth database.
   * @param {boolean} [options.disableAuth=false] - Whether to disable auth in the query (for testing).
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
      readTrimmedFile('./engine-private/mongodb-username');
    const mongoPass =
      password ||
      process.env.MONGODB_PASSWORD ||
      process.env.DB_PASSWORD ||
      readTrimmedFile('./engine-private/mongodb-password');

    // Ensure the pod is ready before querying
    shellExec(`kubectl wait --for=condition=Ready pod/${podName} -n ${namespace} --timeout=60s`);

    const evalExpr = 'rs.status().members.filter(m=>m.stateStr=="PRIMARY").map(m=>m.name)';

    const cli = disableAuth ? 'mongo' : 'mongosh';

    let output = shellExec(`sudo kubectl exec -n ${namespace} -i ${podName} -- ${cli} --quiet --eval '${evalExpr}'`, {
      stdout: true,
      silent: true,
      silentOnError: true,
    });

    if (!disableAuth && (!output || output.trim() === '') && mongoUser && mongoPass) {
      output = shellExec(
        `sudo kubectl exec -n ${namespace} -i ${podName} -- mongosh --quiet ` +
          `--authenticationDatabase ${JSON.stringify(authDatabase)} ` +
          `-u ${JSON.stringify(mongoUser)} -p ${JSON.stringify(mongoPass)} --eval '${evalExpr}'`,
        { stdout: true, silent: true, silentOnError: true },
      );
    }

    if (!output || output.trim() === '') {
      logger.warn('No MongoDB primary pod found.');
      return null;
    }

    const match = output.match(/['"]([^'"]+)['"]/);
    if (match && match[1]) {
      const primary = match[1].split(':')[0].split('.')[0];
      logger.info('Found MongoDB primary pod', { primary });
      return primary;
    }
    return null;
  }
}

export { MongoBootstrap };
