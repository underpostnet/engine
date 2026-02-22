/**
 * IPFS Cluster module for managing ipfs-cluster StatefulSet deployment on Kubernetes.
 * @module src/cli/ipfs.js
 * @namespace UnderpostIPFS
 */

import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

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
     * @description Resolves the IPFS cluster credentials from engine-private/ if they
     * already exist, otherwise generates new ones (hex cluster secret + peer identity
     * via ipfs-cluster-service init) and persists them with mode 0o600.
     * @param {string} privateDir - Absolute path to the engine-private directory.
     * @returns {{ CLUSTER_SECRET: string, IDENTITY_JSON: { id: string, private_key: string } }}
     * @memberof UnderpostIPFS
     */
    resolveCredentials(privateDir) {
      const secretPath = `${privateDir}/ipfs-cluster-secret`;
      const identityPath = `${privateDir}/ipfs-cluster-identity.json`;

      if (fs.existsSync(secretPath) && fs.existsSync(identityPath)) {
        logger.info('Reusing existing IPFS cluster credentials from engine-private/');
        return {
          CLUSTER_SECRET: fs.readFileSync(secretPath, 'utf8').trim(),
          IDENTITY_JSON: JSON.parse(fs.readFileSync(identityPath, 'utf8')),
        };
      }

      logger.info('Generating new IPFS cluster credentials and persisting to engine-private/');

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

      return { CLUSTER_SECRET, IDENTITY_JSON };
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
     * - Secret `ipfs-cluster-secret`: cluster-secret + bootstrap-peer-priv-key
     * - ConfigMap `env-config`: bootstrap-peer-id + CLUSTER_SVC_NAME
     * @param {{ CLUSTER_SECRET: string, IDENTITY_JSON: { id: string, private_key: string } }} credentials
     * @param {object} options
     * @param {string} options.namespace - Kubernetes namespace.
     * @memberof UnderpostIPFS
     */
    applySecrets({ CLUSTER_SECRET, IDENTITY_JSON }, options) {
      logger.info('Applying IPFS cluster Kubernetes Secret and env ConfigMap');

      shellExec(
        `kubectl create secret generic ipfs-cluster-secret \
--from-literal=cluster-secret=${CLUSTER_SECRET} \
--from-literal=bootstrap-peer-priv-key=${IDENTITY_JSON.private_key} \
--dry-run=client -o yaml | kubectl apply -f - -n ${options.namespace}`,
      );

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
      if (!options.kubeadm && !options.k3s) {
        logger.info('Applying UDP buffer sysctl on Kind nodes');
        shellExec(
          `for node in $(kind get nodes); do docker exec $node sysctl -w net.core.rmem_max=7500000 net.core.wmem_max=7500000; done`,
        );
      }

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

      const credentials = Underpost.ipfs.resolveCredentials(`${underpostRoot}/engine-private`);

      const ipfsReplicas = options.replicas ? parseInt(options.replicas) : 3;

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
