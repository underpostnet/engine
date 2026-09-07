/**
 * Mongo Express Deployment Module
 * @module src/db/mongo/MongoExpress
 * @namespace MongoExpress
 * @description Deploys the mongo-express web client used to inspect the cluster's MongoDB
 * StatefulSet collections. The workload is a plain Deployment plus a ClusterIP Service, so the
 * same manifests converge identically under Kind, Kubeadm and K3s; the only runtime-dependent
 * decision is whether the deployed mongod enforces authentication, which selects the overlay.
 */

import { loggerFactory } from '../../server/ops/logger.js';
import { shellExec } from '../../server/runtime/process.js';
// Cyclic by construction (index -> cluster -> MongoExpress -> index), same as MongoBootstrap.js.
// Safe because the binding is only dereferenced inside method bodies, never at module scope.
import Underpost from '../../index.js';
import { MONGODB_DEFAULT_PORT, MONGODB_SERVICE_NAME, MONGODB_STATEFULSET_NAME } from './MongooseDB.js';

const logger = loggerFactory(import.meta);

const MONGO_EXPRESS_NAME = 'mongo-express';
const MONGO_EXPRESS_SERVICE_NAME = 'mongo-express-service';
const MONGO_EXPRESS_IMAGE = 'mongo-express:1.0.2';
const MONGO_EXPRESS_PORT = 8081;
const MONGO_EXPRESS_NODE_PORT = 32081;
const MONGO_EXPRESS_BASE_URL = '/mongo/';
// The UI reads the root credentials and gates its own session with the same pair, so it consumes
// the StatefulSet's secret rather than owning a second credential of its own.
const MONGO_EXPRESS_SECRET_NAME = 'mongodb-secret';
const MONGO_EXPRESS_MANIFEST_DIR = 'manifests/deployment/mongo-express';
const MONGO_EXPRESS_NO_AUTH_MANIFEST_DIR = 'manifests/deployment/mongo-express-no-auth';

// Literal and unescaped: kubectl's jsonpath quotes carry escape sequences of their own, and no
// mongod argument contains a pipe.
const MONGOD_ARGS_FIELD_SEPARATOR = '|';

/**
 * Parses the mongod argument vector reported by `kubectl -o jsonpath` for the StatefulSet.
 * @param {string} raw - Raw jsonpath stdout: the StatefulSet name, then one field per argument.
 * @returns {Array<string>|null} Argument vector, or null when no StatefulSet was reported.
 * @memberof MongoExpress
 */
const parseMongodArgs = (raw) => {
  const value = `${raw || ''}`;
  if (!value.trim()) return null;
  const [, ...args] = value.split(MONGOD_ARGS_FIELD_SEPARATOR);
  return args.map((arg) => arg.trim()).filter(Boolean);
};

/**
 * Decides whether mongo-express must authenticate against the deployed mongod.
 *
 * The deployed StatefulSet is the authority: `manifests/mongodb` starts mongod with `--auth` and
 * `manifests/mongodb-4.4` does not, and either can be the one running regardless of which flag
 * this invocation carries. The flags only answer for a cluster with no StatefulSet deployed yet,
 * where `--mongodb` (the auth-enabled manifest set) is the default the platform installs.
 * @param {object} [params={}] - Resolution inputs.
 * @param {Array<string>|null} [params.args=null] - mongod argument vector, or null when undeployed.
 * @param {object} [params.options={}] - Cluster options (`mongodb`, `mongodb4`).
 * @returns {boolean} True when the admin credential pair must be projected.
 * @memberof MongoExpress
 */
const mongoAuthEnabledFactory = ({ args = null, options = {} } = {}) => {
  if (Array.isArray(args)) return args.includes('--auth');
  return options.mongodb4 !== true;
};

/**
 * Resolves the kustomization root the auth mode selects.
 * @param {object} [params={}] - Path inputs.
 * @param {string} [params.underpostRoot='.'] - Repository root holding `manifests/`.
 * @param {boolean} [params.authEnabled=true] - Whether mongod enforces authentication.
 * @returns {string} Kustomization directory path.
 * @memberof MongoExpress
 */
const mongoExpressManifestPathFactory = ({ underpostRoot = '.', authEnabled = true } = {}) =>
  `${underpostRoot}/${authEnabled ? MONGO_EXPRESS_MANIFEST_DIR : MONGO_EXPRESS_NO_AUTH_MANIFEST_DIR}`;

/**
 * Resolves the opt-in NodePort Service manifest path. It lives in the base directory and is left
 * out of both kustomizations: exposing an admin UI on the node network is a caller's decision.
 * @param {object} [params={}] - Path inputs.
 * @param {string} [params.underpostRoot='.'] - Repository root holding `manifests/`.
 * @returns {string} NodePort manifest path.
 * @memberof MongoExpress
 */
const mongoExpressNodePortManifestFactory = ({ underpostRoot = '.' } = {}) =>
  `${underpostRoot}/${MONGO_EXPRESS_MANIFEST_DIR}/mongo-express-nodeport.yaml`;

/**
 * @class MongoExpress
 * @description Static deployment surface for the mongo-express admin client.
 * @memberof MongoExpress
 */
class MongoExpress {
  /**
   * Reads the mongod argument vector from the deployed MongoDB StatefulSet.
   *
   * The projection leads with the StatefulSet name so a deployed server that declares no arguments
   * stays distinguishable from no server at all — one is mongod on its defaults, the other is a
   * cluster with no data tier yet, and both would otherwise reduce to empty output.
   * @param {string} [namespace='default'] - Namespace holding the StatefulSet.
   * @returns {Array<string>|null} Argument vector, or null when no StatefulSet is deployed.
   * @memberof MongoExpress
   */
  static readMongodArgs(namespace = 'default') {
    const raw = shellExec(
      `kubectl get statefulset ${MONGODB_STATEFULSET_NAME} -n ${namespace} --ignore-not-found -o jsonpath=` +
        `'{.metadata.name}{"${MONGOD_ARGS_FIELD_SEPARATOR}"}` +
        `{range .spec.template.spec.containers[?(@.name=="${MONGODB_STATEFULSET_NAME}")].args[*]}` +
        `{@}{"${MONGOD_ARGS_FIELD_SEPARATOR}"}{end}'`,
      { stdout: true, silent: true, silentOnError: true },
    );
    return parseMongodArgs(raw);
  }

  /**
   * Deploys mongo-express and, once it is Ready, applies the exposure and placement the caller
   * asked for. Cluster-type agnostic by construction: only the image pull differs between Kind
   * (loaded into the node's image store) and Kubeadm/K3s (pulled through the CRI).
   * @param {object} [params={}] - Deployment parameters.
   * @param {string} [params.namespace='default'] - Target namespace.
   * @param {string} [params.underpostRoot='.'] - Repository root holding `manifests/`.
   * @param {object} [params.options={}] - Cluster options (`pullImage`, `nodePort`, `nodeName`, `mongodb4`).
   * @returns {Promise<boolean>} Whether the deployment reported Ready.
   * @memberof MongoExpress
   */
  static async deploy({ namespace = 'default', underpostRoot = '.', options = {} } = {}) {
    // Secret before workload: the Deployment's secretKeyRef must resolve at pod admission, and
    // the encrypted store stays the source of truth wherever a manifest exists.
    if (!Underpost.secret.applyIfPresent(MONGO_EXPRESS_SECRET_NAME, namespace))
      Underpost.secret.applyFromOriginSeed(MONGO_EXPRESS_SECRET_NAME, namespace);

    if (options.pullImage) Underpost.cluster.pullImage(MONGO_EXPRESS_IMAGE, options);

    const args = MongoExpress.readMongodArgs(namespace);
    const authEnabled = mongoAuthEnabledFactory({ args, options });
    const manifestPath = mongoExpressManifestPathFactory({ underpostRoot, authEnabled });
    logger.info('Deploying mongo-express', {
      namespace,
      authEnabled,
      manifestPath,
      mongodb: args ? 'deployed' : 'not deployed',
    });
    shellExec(`kubectl apply -k ${manifestPath} -n ${namespace}`);

    const ready = await Underpost.test.statusMonitor(MONGO_EXPRESS_NAME, 'Running', 'pods', 1000, 60 * 10);
    if (!ready) {
      logger.error('mongo-express did not report Running', { namespace });
      return false;
    }

    if (options.nodePort)
      shellExec(`kubectl apply -f ${mongoExpressNodePortManifestFactory({ underpostRoot })} -n ${namespace}`);
    if (options.nodeName)
      Underpost.cluster.pinToNode({
        kind: 'deployment',
        name: MONGO_EXPRESS_NAME,
        namespace,
        node: options.nodeName,
      });

    logger.info('mongo-express ready', {
      server: `${MONGODB_STATEFULSET_NAME}-0.${MONGODB_SERVICE_NAME}:${MONGODB_DEFAULT_PORT}`,
      basicAuth: `secret/${MONGO_EXPRESS_SECRET_NAME}`,
      clusterIp: `${MONGO_EXPRESS_SERVICE_NAME}:${MONGO_EXPRESS_PORT}${MONGO_EXPRESS_BASE_URL}`,
      nodePort: options.nodePort ? `<node>:${MONGO_EXPRESS_NODE_PORT}${MONGO_EXPRESS_BASE_URL}` : null,
      portForward: `kubectl port-forward -n ${namespace} svc/${MONGO_EXPRESS_SERVICE_NAME} ${MONGO_EXPRESS_PORT}:${MONGO_EXPRESS_PORT}`,
    });
    return true;
  }
}

export {
  MONGO_EXPRESS_BASE_URL,
  MONGO_EXPRESS_IMAGE,
  MONGO_EXPRESS_NAME,
  MONGO_EXPRESS_NODE_PORT,
  MONGO_EXPRESS_PORT,
  MONGO_EXPRESS_SECRET_NAME,
  MONGO_EXPRESS_SERVICE_NAME,
  MongoExpress,
  mongoAuthEnabledFactory,
  mongoExpressManifestPathFactory,
  mongoExpressNodePortManifestFactory,
  parseMongodArgs,
};
export default MongoExpress;
