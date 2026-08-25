/**
 * IPFS Cluster module for managing ipfs-cluster StatefulSet deployment on Kubernetes.
 * @module src/cli/ipfs.js
 * @namespace UnderpostIPFS
 */

import { loggerFactory } from '../server/ops/logger.js';
import { shellExec } from '../server/runtime/process.js';
import { resolveReplicaCount } from '../server/runtime/conf.js';
import fs from 'fs-extra';
import dir from 'node:path';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

// The managed secret this module owns; its origin, its encrypted manifest and its Kubernetes
// projection all resolve from this one name.
const IPFS_SECRET_NAME = 'ipfs-cluster-secret';

const IPFS_DEFAULT_REPLICA_COUNT = 3;

/**
 * @class UnderpostIPFS
 * @description Manages deployment of an ipfs-cluster StatefulSet on Kubernetes.
 * Credentials (cluster secret + peer identity) are generated once and persisted
 * to engine-private/ so the cluster identity survives redeployments.
 * @memberof UnderpostIPFS
 */
class UnderpostIPFS {
  static API = {
    /**
     * @method resolveCredentials
     * @description Resolves the IPFS cluster origin credentials, generating them when absent
     * (hex cluster secret + peer identity via ipfs-cluster-service init) and persisting them
     * with mode 0o600.
     *
     * Paths come from the workload secret domain, so this module names no credential path of its
     * own and the pair sits in the deploy secret area with every other origin credential.
     *
     * Idempotent and self-healing: an existing pair is reused untouched, and a missing or
     * unreadable one is regenerated. Both files are always rewritten together — the peer id and
     * the private key are two halves of one identity, so reusing one with a freshly minted other
     * would advertise a peer id that does not match the key.
     * @returns {{ CLUSTER_SECRET: string, IDENTITY_JSON: { id: string, private_key: string }, generated: boolean }}
     * @memberof UnderpostIPFS
     */
    resolveCredentials() {
      const sources = Underpost.secret.seedSources(IPFS_SECRET_NAME);
      const secretPath = sources['cluster-secret'];
      const identityPath = sources['bootstrap-peer-priv-key'];
      const privateDir = dir.dirname(secretPath);

      if (fs.existsSync(secretPath) && fs.existsSync(identityPath)) {
        try {
          const CLUSTER_SECRET = fs.readFileSync(secretPath, 'utf8').trim();
          const IDENTITY_JSON = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
          if (CLUSTER_SECRET && IDENTITY_JSON?.id && IDENTITY_JSON?.private_key) {
            logger.info('Reusing existing IPFS cluster credentials', { secretPath, identityPath });
            return { CLUSTER_SECRET, IDENTITY_JSON, generated: false };
          }
          logger.warn('Existing IPFS cluster credentials are incomplete; regenerating');
        } catch (error) {
          logger.warn(`Existing IPFS cluster credentials are unreadable (${error.message}); regenerating`);
        }
      }

      logger.info('Generating new IPFS cluster credentials', { secretPath, identityPath });

      // ipfs-cluster-service requires CLUSTER_SECRET as a 64-char hex string.
      // base64 (openssl rand -base64 32) contains '/', '+', '=' which are invalid hex bytes.
      const CLUSTER_SECRET = shellExec("od -vN 32 -An -tx1 /dev/urandom | tr -d ' \\n'", {
        stdout: true,
      }).trim();

      const tmpDir = '/tmp/ipfs-cluster-identity';
      shellExec(`rm -rf ${tmpDir} && mkdir -p ${tmpDir}`);
      shellExec(`docker run --rm -v ${tmpDir}:/data/ipfs-cluster ipfs/ipfs-cluster init -f`);
      const IDENTITY_JSON = JSON.parse(shellExec(`cat ${tmpDir}/identity.json`, { stdout: true }).trim());
      shellExec(`rm -rf ${tmpDir}`);

      fs.ensureDirSync(privateDir);
      fs.writeFileSync(secretPath, CLUSTER_SECRET, { mode: 0o600 });
      fs.writeFileSync(identityPath, JSON.stringify(IDENTITY_JSON, null, 2), { mode: 0o600 });

      logger.info(`IPFS cluster credentials saved (peer ID: ${IDENTITY_JSON.id})`);

      return { CLUSTER_SECRET, IDENTITY_JSON, generated: true };
    },

    /**
     * @method storeCredentials
     * @description Encrypts the current IPFS credentials into the SOPS store, replacing whatever
     * is there. Called after a regeneration so the encrypted Secret cannot drift from the peer id
     * the `env-config` ConfigMap advertises — the id lives only in the local identity file, so a
     * stale manifest would pair someone else's private key with the new id and the cluster would
     * never form.
     * @param {{ CLUSTER_SECRET: string, IDENTITY_JSON: { private_key: string } }} credentials
     * @param {object} options
     * @param {string} options.namespace - Kubernetes namespace.
     * @memberof UnderpostIPFS
     */
    storeCredentials({ CLUSTER_SECRET, IDENTITY_JSON }, options) {
      const stageDir = '/dev/shm/underpost-secrets';
      const stagePath = `${stageDir}/ipfs-cluster-secret.yaml`;
      fs.ensureDirSync(stageDir);
      fs.chmodSync(stageDir, 0o700);
      try {
        fs.outputFileSync(
          stagePath,
          [
            'apiVersion: v1',
            'kind: Secret',
            'metadata:',
            '  name: ipfs-cluster-secret',
            `  namespace: ${options.namespace}`,
            '  labels:',
            '    app.kubernetes.io/managed-by: underpost',
            'type: Opaque',
            'stringData:',
            `  cluster-secret: '${CLUSTER_SECRET.replace(/'/g, "''")}'`,
            `  bootstrap-peer-priv-key: '${IDENTITY_JSON.private_key.replace(/'/g, "''")}'`,
            '',
          ].join('\n'),
          'utf8',
        );
        fs.chmodSync(stagePath, 0o600);
        // encrypt() stages, validates, moves into place, and shreds the plaintext source.
        Underpost.secret.encrypt(stagePath, options.namespace, { force: true });
        logger.info('Re-encrypted regenerated IPFS credentials into the SOPS store');
      } finally {
        fs.removeSync(stageDir);
      }
    },

    /**
     * @method teardown
     * @description Deletes the existing ipfs-cluster StatefulSet, its Kubernetes Secret,
     * env ConfigMap, and all PVCs so the next deployment initialises a clean data volume
     * (ensuring the correct datastore profile is applied by the init container).
     * @param {object} options
     * @param {string} options.namespace - Kubernetes namespace.
     * @param {number} ipfsReplicas - Number of replicas whose PVCs must be removed.
     * @memberof UnderpostIPFS
     */
    teardown(options, ipfsReplicas) {
      logger.info(`Tearing down existing ipfs-cluster deployment in namespace '${options.namespace}'`);
      shellExec(`kubectl delete statefulset ipfs-cluster -n ${options.namespace} --ignore-not-found`);
      shellExec(`kubectl delete secret ipfs-cluster-secret -n ${options.namespace} --ignore-not-found`);
      shellExec(`kubectl delete configmap env-config -n ${options.namespace} --ignore-not-found`);
      for (let i = 0; i < ipfsReplicas; i++) {
        shellExec(
          `kubectl delete pvc cluster-storage-ipfs-cluster-${i} ipfs-storage-ipfs-cluster-${i} -n ${options.namespace} --ignore-not-found`,
        );
      }
    },

    /**
     * @method applySecrets
     * @description Creates (or idempotently updates) the Kubernetes Secret and env ConfigMap
     * that the StatefulSet pods read at startup.
     * - Secret `ipfs-cluster-secret`: cluster-secret + bootstrap-peer-priv-key, projected by the
     *   secret domain from the encrypted store or, failing that, from the origin credentials
     * - ConfigMap `env-config`: bootstrap-peer-id + CLUSTER_SVC_NAME
     * @param {{ IDENTITY_JSON: { id: string } }} credentials - Only the public peer id is read here; the Secret keys are projected by the secret domain.
     * @param {object} options
     * @param {string} options.namespace - Kubernetes namespace.
     * @memberof UnderpostIPFS
     */
    applySecrets({ IDENTITY_JSON }, options) {
      logger.info('Applying IPFS cluster Kubernetes Secret and env ConfigMap');

      // Encrypted store first; the origin projection runs only when no manifest is stored. Both
      // paths keep the credentials out of the command string — the store streams a decrypt into
      // kubectl, and the origin projection stages the values on tmpfs.
      if (!Underpost.secret.applyIfPresent(IPFS_SECRET_NAME, options.namespace))
        Underpost.secret.applyFromOriginSeed(IPFS_SECRET_NAME, options.namespace);

      shellExec(
        `kubectl create configmap env-config \
--from-literal=bootstrap-peer-id=${IDENTITY_JSON.id} \
--from-literal=CLUSTER_SVC_NAME=ipfs-cluster \
--dry-run=client -o yaml | kubectl apply -f - -n ${options.namespace}`,
      );
    },

    /**
     * @method applyManifests
     * @description Applies host-level sysctl tuning (Kind clusters only), the storage class,
     * the kustomize manifests, and scales the StatefulSet to the requested replica count.
     * @param {object} options
     * @param {string} options.namespace - Kubernetes namespace.
     * @param {boolean} [options.kubeadm] - Whether the cluster is Kubeadm-based.
     * @param {boolean} [options.k3s] - Whether the cluster is K3s-based.
     * @param {string} underpostRoot - Absolute path to the underpost project root.
     * @param {number} ipfsReplicas - Desired replica count.
     * @memberof UnderpostIPFS
     */
    applyManifests(options, underpostRoot, ipfsReplicas) {
      // Apply UDP buffer sysctl on every Kind node so QUIC (used by IPFS) can reach the
      // recommended 7.5 MB buffer size. Kind nodes are containers and do NOT inherit the
      // host sysctl values, so this must be set via docker exec on each node directly.
      shellExec(
        `sudo sysctl -w net.core.rmem_max=7500000
sudo sysctl -w net.core.wmem_max=7500000`,
      );

      shellExec(`kubectl apply -f ${underpostRoot}/manifests/ipfs/storage-class.yaml`);
      shellExec(`kubectl apply -k ${underpostRoot}/manifests/ipfs -n ${options.namespace}`);

      // statefulset.yaml hardcodes replicas: 3 as the ceiling; scale down here if needed.
      shellExec(`kubectl scale statefulset ipfs-cluster --replicas=${ipfsReplicas} -n ${options.namespace}`);
    },

    /**
     * @method deploy
     * @description Full orchestration of the ipfs-cluster StatefulSet deployment:
     * optionally pulls images, resolves or generates credentials, tears down any existing
     * deployment, applies secrets, applies manifests, and waits for all pods to be Running.
     * @param {object} options - Cluster init options forwarded from UnderpostCluster.API.init.
     * @param {string} options.namespace - Kubernetes namespace.
     * @param {boolean} [options.pullImage] - Whether to pull container images first.
     * @param {boolean} [options.kubeadm] - Whether the cluster is Kubeadm-based.
     * @param {boolean} [options.k3s] - Whether the cluster is K3s-based.
     * @param {string|number} [options.replicas] - Override replica count (defaults to 3).
     * @param {string} underpostRoot - Absolute path to the underpost project root.
     * @memberof UnderpostIPFS
     */
    async deploy(options, underpostRoot) {
      if (options.pullImage === true) {
        Underpost.cluster.pullImage('ipfs/kubo:latest', options);
        Underpost.cluster.pullImage('ipfs/ipfs-cluster:latest', options);
      }

      const credentials = Underpost.ipfs.resolveCredentials();

      // `env-config` advertises `bootstrap-peer-id` from the local identity file — the peer id is
      // not carried in the Secret. So a regeneration invalidates any stored manifest: it would
      // pair the previous private key with the new id and the cluster would never form. Re-encrypt
      // the fresh pair so the store and the ConfigMap stay one identity.
      if (credentials.generated && Underpost.secret.has(IPFS_SECRET_NAME, options.namespace))
        Underpost.ipfs.storeCredentials(credentials, options);

      const ipfsReplicas = resolveReplicaCount(options.replicas, IPFS_DEFAULT_REPLICA_COUNT);

      Underpost.ipfs.teardown(options, ipfsReplicas);
      Underpost.ipfs.applySecrets(credentials, options);
      Underpost.ipfs.applyManifests(options, underpostRoot, ipfsReplicas);

      logger.info(`Waiting for ${ipfsReplicas} ipfs-cluster pod(s) to reach Running state`);
      for (let i = 0; i < ipfsReplicas; i++) {
        await Underpost.test.statusMonitor(`ipfs-cluster-${i}`, 'Running', 'pods', 1000, 60 * 15);
      }
    },
  };
}

export default UnderpostIPFS;
