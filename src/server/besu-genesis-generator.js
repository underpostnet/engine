/**
 * Dynamic Hyperledger Besu IBFT2 genesis and Kubernetes manifest generator
 * for the Cyberia Online Object Layer ERC-1155 ecosystem.
 *
 * Generates fresh secp256k1 validator keys, computes public keys, enode URLs,
 * IBFT2 extraData, genesis.json, and all K8s manifests required to deploy a
 * new Besu chain instance to a kubeadm cluster.
 *
 * This eliminates hardcoded keys/hashes in manifests/besu/ and ensures every
 * new deployment gets a clean, unique chain identity.
 *
 * @module src/server/besu-genesis-generator
 * @namespace BesuGenesisGenerator
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { keccak256 as ethersKeccak256 } from 'ethers';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';

const logger = loggerFactory(import.meta);

// ---------------------------------------------------------------------------
// secp256k1 key utilities (Node.js native crypto — no ethers dependency)
// ---------------------------------------------------------------------------

/**
 * Generate a random secp256k1 private key (32 bytes hex, no 0x prefix).
 * @returns {string} 64-char lowercase hex private key.
 * @memberof BesuGenesisGenerator
 */
function generatePrivateKey() {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.generateKeys();
  return ecdh.getPrivateKey('hex').padStart(64, '0');
}

/**
 * Derive the uncompressed public key (sans 04 prefix) from a private key.
 * Besu node public keys are 128-char hex (64 bytes) — the x‖y coordinates.
 * @param {string} privateKeyHex - 64-char hex private key (no 0x).
 * @returns {string} 128-char lowercase hex public key.
 * @memberof BesuGenesisGenerator
 */
function derivePublicKey(privateKeyHex) {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(Buffer.from(privateKeyHex, 'hex'));
  // getPublicKey returns 65 bytes (04 || x || y); strip the 04 prefix
  const uncompressed = ecdh.getPublicKey('hex');
  // uncompressed starts with '04' (1 byte tag)
  return uncompressed.slice(2);
}

/**
 * Derive the Ethereum address from an uncompressed secp256k1 public key.
 *
 * The address is the last 20 bytes of the Keccak-256 hash of the raw
 * (uncompressed, sans 04 prefix) public key bytes:
 *   `address = keccak256(pubKeyBytes)[12..31]`
 *
 * **Important:** Ethereum uses the *original* Keccak-256 (the pre-NIST
 * submission), NOT NIST SHA3-256.  NIST added different domain-separation
 * padding when standardising SHA-3, so `crypto.createHash('sha3-256')`
 * produces **wrong** addresses.  We use `ethers.keccak256` which bundles
 * a correct Keccak-256 implementation.
 *
 * @param {string} publicKeyHex - 128-char hex public key (no 0x prefix).
 * @returns {string} 40-char lowercase hex Ethereum address (no 0x prefix).
 * @memberof BesuGenesisGenerator
 */
function publicKeyToAddress(publicKeyHex) {
  // Ethereum addresses are derived using Keccak-256 (the original Keccak submission),
  // NOT NIST SHA3-256.  NIST SHA3-256 added different domain-separation padding,
  // so crypto.createHash('sha3-256') produces WRONG addresses.
  //
  // Node.js's OpenSSL does not expose the original Keccak-256, so we use ethers
  // which bundles a correct implementation.
  //
  // ethersKeccak256 expects a 0x-prefixed hex string or Uint8Array and returns
  // a 0x-prefixed 64-char hex hash.  The Ethereum address is the last 20 bytes.
  const hash = ethersKeccak256(Buffer.from(publicKeyHex, 'hex')); // 0x-prefixed 64-char hex
  return hash.slice(26); // skip '0x' + first 24 hex chars → last 40 hex chars (20 bytes)
}

// ---------------------------------------------------------------------------
// RLP encoding helpers (minimal, sufficient for IBFT2 extraData)
// ---------------------------------------------------------------------------

/**
 * RLP-encode a single Buffer item.
 * @param {Buffer} buf
 * @returns {Buffer}
 * @memberof BesuGenesisGenerator
 */
function rlpEncodeItem(buf) {
  if (buf.length === 1 && buf[0] < 0x80) {
    return buf;
  }
  if (buf.length <= 55) {
    return Buffer.concat([Buffer.from([0x80 + buf.length]), buf]);
  }
  const lenBytes = encodeLength(buf.length);
  return Buffer.concat([Buffer.from([0xb7 + lenBytes.length]), lenBytes, buf]);
}

/**
 * RLP-encode a list of already-encoded items.
 * @param {Buffer[]} items - Array of RLP-encoded items.
 * @returns {Buffer}
 * @memberof BesuGenesisGenerator
 */
function rlpEncodeList(items) {
  const payload = Buffer.concat(items);
  if (payload.length <= 55) {
    return Buffer.concat([Buffer.from([0xc0 + payload.length]), payload]);
  }
  const lenBytes = encodeLength(payload.length);
  return Buffer.concat([Buffer.from([0xf7 + lenBytes.length]), lenBytes, payload]);
}

/**
 * Encode a length as big-endian bytes (no leading zeroes).
 * @param {number} len
 * @returns {Buffer}
 * @memberof BesuGenesisGenerator
 */
function encodeLength(len) {
  const hex = len.toString(16);
  const padded = hex.length % 2 === 0 ? hex : '0' + hex;
  return Buffer.from(padded, 'hex');
}

// ---------------------------------------------------------------------------
// IBFT2 Extra Data
// ---------------------------------------------------------------------------

/**
 * Compute the IBFT2 extraData field for the genesis block.
 *
 * IBFT2 extraData = RLP([
 *   32-byte vanity,
 *   [ ...validator addresses (each 20 bytes) ],
 *   vote (empty bytes),
 *   round (4-byte big-endian int, 0 for genesis),
 *   seals (empty list)
 * ])
 *
 * Besu's IbftExtraDataCodec.decodeRaw() calls readInt() on the round field,
 * which expects exactly 4 bytes.  Encoding round as empty bytes (0x80) causes:
 *   RLPException: Cannot read a 4-byte int, expecting 4 bytes but current element is 0 bytes long
 *
 * @param {string[]} validatorAddresses - Array of 40-char hex addresses (no 0x).
 * @returns {string} hex string with 0x prefix.
 * @memberof BesuGenesisGenerator
 */
function computeIbft2ExtraData(validatorAddresses) {
  // 32-byte zero vanity
  const vanity = rlpEncodeItem(Buffer.alloc(32, 0));

  // Validator list
  const validators = rlpEncodeList(validatorAddresses.map((addr) => rlpEncodeItem(Buffer.from(addr, 'hex'))));

  // Vote (empty bytes)
  const vote = rlpEncodeItem(Buffer.alloc(0));

  // Round — must be a 4-byte big-endian integer (0 for genesis block).
  // Besu's IbftExtraDataCodec calls readInt() which demands exactly 4 bytes.
  const round = rlpEncodeItem(Buffer.from([0x00, 0x00, 0x00, 0x00]));

  // Seals (empty list)
  const seals = rlpEncodeList([]);

  const extraData = rlpEncodeList([vanity, validators, vote, round, seals]);
  return '0x' + extraData.toString('hex');
}

// ---------------------------------------------------------------------------
// Validator node key set
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ValidatorKeySet
 * @property {number} index - 1-based validator index.
 * @property {string} privateKey - 64-char hex private key.
 * @property {string} publicKey - 128-char hex public key.
 * @property {string} address - 40-char hex Ethereum address.
 * @property {string} enodeDns - Full enode URL with K8s DNS hostname.
 * @memberof BesuGenesisGenerator
 */

/**
 * Generate a complete set of validator keys.
 * @param {number} count - Number of validators (default 4).
 * @param {string} namespace - K8s namespace (default 'besu').
 * @returns {ValidatorKeySet[]}
 * @memberof BesuGenesisGenerator
 */
function generateValidatorKeys(count = 4, namespace = 'besu') {
  const validators = [];
  for (let i = 1; i <= count; i++) {
    const privateKey = generatePrivateKey();
    const publicKey = derivePublicKey(privateKey);
    const address = publicKeyToAddress(publicKey);
    const dnsHost = `validator${i}-0.besu-validator${i}.${namespace}.svc.cluster.local`;
    const enodeDns = `enode://${publicKey}@${dnsHost}:30303`;
    validators.push({
      index: i,
      privateKey,
      publicKey,
      address,
      enodeDns,
    });
  }
  return validators;
}

// ---------------------------------------------------------------------------
// Genesis JSON
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GenesisOptions
 * @property {number} [chainId=777771] - Chain ID for the network.
 * @property {number} [blockPeriodSeconds=5] - IBFT2 block period.
 * @property {number} [epochLength=30000] - IBFT2 epoch length.
 * @property {number} [requestTimeoutSeconds=10] - IBFT2 request timeout.
 * @property {string} [coinbaseAddress] - Coinbase/deployer address (40-char hex, no 0x).
 * @property {string} [coinbaseBalance] - Hex balance string for coinbase (with 0x).
 * @property {Object<string,string>} [additionalAlloc] - Extra alloc entries {address: balance}.
 * @property {string} [gasLimit] - Hex gas limit (with 0x).
 * @memberof BesuGenesisGenerator
 */

/**
 * Build the genesis.json content for a Besu IBFT2 network.
 * @param {ValidatorKeySet[]} validators
 * @param {GenesisOptions} [opts]
 * @returns {Object} genesis JSON object.
 * @memberof BesuGenesisGenerator
 */
function buildGenesis(validators, opts = {}) {
  const {
    chainId = 777771,
    blockPeriodSeconds = 5,
    epochLength = 30000,
    requestTimeoutSeconds = 10,
    coinbaseAddress = '',
    coinbaseBalance = '0x200000000000000000000000000000000000000000000000000000000000000',
    additionalAlloc = {},
    gasLimit = '0x1fffffffffffff',
  } = opts;

  const addresses = validators.map((v) => v.address);
  const extraData = computeIbft2ExtraData(addresses);

  const alloc = {};

  // Coinbase / deployer account
  if (coinbaseAddress) {
    const cleanAddr = coinbaseAddress.replace(/^0x/, '');
    alloc[cleanAddr] = {
      comment: 'Coinbase / deployer account - receives initial ETH for gas on Cyberia private network',
      balance: coinbaseBalance,
    };
  }

  // Dev/test accounts (standard Besu dev accounts)
  const devAccounts = {
    fe3b557e8fb62b89f4916b721be55ceb828dbd73: {
      comment: 'Dev/test account 1',
      balance: '0xad78ebc5ac6200000',
    },
    '627306090abaB3A6e1400e9345bC60c78a8BEf57': {
      comment: 'Dev/test account 2',
      balance: '90000000000000000000000',
    },
    f17f52151EbEF6C7334FAD080c5704D77216b732: {
      comment: 'Dev/test account 3',
      balance: '90000000000000000000000',
    },
  };
  Object.assign(alloc, devAccounts);

  // Additional allocations
  for (const [addr, balance] of Object.entries(additionalAlloc)) {
    alloc[addr.replace(/^0x/, '')] = { balance };
  }

  const timestamp = '0x' + Math.floor(Date.now() / 1000).toString(16);

  return {
    config: {
      chainId,
      berlinBlock: 0,
      londonBlock: 0,
      shanghaiTime: 0,
      ibft2: {
        blockperiodseconds: blockPeriodSeconds,
        epochlength: epochLength,
        requesttimeoutseconds: requestTimeoutSeconds,
      },
    },
    nonce: '0x0',
    timestamp,
    extraData,
    gasLimit,
    difficulty: '0x1',
    mixHash: '0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365',
    coinbase: coinbaseAddress
      ? `0x${coinbaseAddress.replace(/^0x/, '')}`
      : '0x0000000000000000000000000000000000000000',
    number: '0x0',
    gasUsed: '0x0',
    parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    alloc,
  };
}

// ---------------------------------------------------------------------------
// Kubernetes manifest generators
// ---------------------------------------------------------------------------

/**
 * Generate the namespace YAML.
 * @param {string} namespace
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateNamespaceYaml(namespace = 'besu') {
  return `---
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    app.kubernetes.io/part-of: cyberia-besu
    app.kubernetes.io/managed-by: underpost
`;
}

/**
 * Generate the genesis ConfigMap YAML.
 * @param {Object} genesis - The genesis JSON object.
 * @param {string} namespace
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateGenesisConfigMapYaml(genesis, namespace = 'besu') {
  const genesisStr = JSON.stringify(genesis, null, 2).replace(/^/gm, '    ').trimStart();
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: besu-genesis-configmap
  labels:
    app.kubernetes.io/name: besu
    app.kubernetes.io/component: genesis
    app.kubernetes.io/part-of: cyberia-besu
  namespace: ${namespace}
data:
  genesis.json: |-
    ${genesisStr}
`;
}

/**
 * Generate the validators public key ConfigMap YAML.
 * @param {ValidatorKeySet[]} validators
 * @param {string} namespace
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateValidatorsConfigMapYaml(validators, namespace = 'besu') {
  const entries = validators.map((v) => `  validator${v.index}PubKey: "${v.publicKey}"`).join('\n');
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: besu-validators-configmap
  labels:
    app.kubernetes.io/name: besu
    app.kubernetes.io/component: validators-config
    app.kubernetes.io/part-of: cyberia-besu
  namespace: ${namespace}
data:
${entries}
`;
}

/**
 * Generate the TOML config ConfigMap YAML with dynamic static-nodes.
 * @param {ValidatorKeySet[]} validators
 * @param {string} namespace
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateConfigTomlConfigMapYaml(validators, namespace = 'besu') {
  const staticNodes = validators.map((v) => {
    const dnsHost = `validator${v.index}-0.besu-validator${v.index}.${namespace}.svc.cluster.local`;
    return `      "${`enode://${v.publicKey}@${dnsHost}:30303`}"`;
  });
  const staticNodesJson = `[\n${staticNodes.join(',\n')}\n    ]`;

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: besu-config-toml-configmap
  labels:
    app: besu-config-toml-configmap
  namespace: ${namespace}
data:
  static-nodes.json: |-
    ${staticNodesJson}

  config.toml: |-
    # Hyperledger Besu IBFT2 configuration for Cyberia Online Object Layer ecosystem.
    # Designed for kubeadm-managed Kubernetes clusters.
    #
    # This configuration provides the foundation for the ERC-1155 ObjectLayerToken
    # contract deployment and interaction on a private permissioned network.

    # Node Information
    data-path="/data"
    genesis-file="/etc/genesis/genesis.json"
    static-nodes-file="/etc/besu/static-nodes.json"

    logging="INFO"

    # Gas - private permissioned network uses zero gas price
    min-gas-price=0

    # P2P network
    p2p-enabled=true
    discovery-enabled=true
    p2p-port=30303
    max-peers=25
    host-allowlist=["*"]

    # Sync — private IBFT2 networks have fewer peers than the default min (5).
    # Without this, FullSyncTargetManager blocks forever with
    # "Waiting for 5 peers minimum" when the network has only 4 validators.
    sync-min-peers=1

    # JSON-RPC
    rpc-http-enabled=true
    rpc-http-host="0.0.0.0"
    rpc-http-port=8545
    rpc-http-api=["DEBUG","ETH","ADMIN","WEB3","IBFT","NET","TXPOOL","MINER"]
    rpc-http-cors-origins=["*"]
    rpc-http-authentication-enabled=false

    # WebSockets API
    rpc-ws-enabled=true
    rpc-ws-host="0.0.0.0"
    rpc-ws-port=8546
    rpc-ws-api=["DEBUG","ETH","ADMIN","WEB3","IBFT","NET","TXPOOL","MINER"]
    rpc-ws-authentication-enabled=false

    # GRAPHQL-RPC
    graphql-http-enabled=false
    graphql-http-host="0.0.0.0"
    graphql-http-port=8547
    graphql-http-cors-origins=["*"]

    # Metrics - compatible with Prometheus/Grafana monitoring on kubeadm cluster
    metrics-enabled=true
    metrics-host="0.0.0.0"
    metrics-port=9545
`;
}

/**
 * Generate the node permissions ConfigMap YAML.
 * @param {ValidatorKeySet[]} validators
 * @param {string} namespace
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateNodePermissionsConfigMapYaml(validators, namespace = 'besu') {
  const entries = validators.map((v) => {
    const dnsHost = `validator${v.index}-0.besu-validator${v.index}.${namespace}.svc.cluster.local`;
    return `      "enode://${v.publicKey}@${dnsHost}:30303"`;
  });
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: besu-node-permissions-configmap
  labels:
    app: besu-node-permissions-configmap
  namespace: ${namespace}
data:
  nodes-allowlist.yml: |-
    nodes-allowlist=[

${entries.join(',\n')}

    ]
`;
}

/**
 * Generate the secrets YAML for all validator node keys.
 * @param {ValidatorKeySet[]} validators
 * @param {string} namespace
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateSecretsYaml(validators, namespace = 'besu') {
  const header = `# Hyperledger Besu validator node key secrets for Cyberia Online Object Layer ecosystem.
# Deployed on kubeadm-managed Kubernetes clusters.
#
# Each validator requires a unique secp256k1 private key (nodekey) that corresponds
# to the public keys declared in besu-validators-configmap.yaml and referenced in
# the genesis extraData field (IBFT2 validator set).
#
# These keys were dynamically generated by besu-genesis-generator.js.
# In production, consider using sealed-secrets or an external secrets manager.`;

  const secrets = validators.map(
    (v) => `---
apiVersion: v1
kind: Secret
metadata:
  name: besu-validator${v.index}-key
  labels:
    app.kubernetes.io/name: besu
    app.kubernetes.io/component: validator${v.index}
    app.kubernetes.io/part-of: cyberia-besu
  namespace: ${namespace}
type: Opaque
stringData:
  nodekey: |-
    ${v.privateKey}`,
  );

  return header + '\n' + secrets.join('\n');
}

/**
 * Generate services YAML for all validators + NodePort RPC gateway.
 * @param {ValidatorKeySet[]} validators
 * @param {string} namespace
 * @param {number} [nodePortRpc=30545] - NodePort for external JSON-RPC.
 * @param {number} [nodePortWs=30546] - NodePort for external WebSocket.
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateServicesYaml(validators, namespace = 'besu', nodePortRpc = 30545, nodePortWs = 30546) {
  const header = `# Besu validator and RPC services for kubeadm cluster.
# Provides ClusterIP services for inter-node communication and a NodePort
# service on validator1 for external Hardhat/ethers.js access from outside
# the cluster (e.g. cyberia CLI, deploy scripts).
#
# Compatible with: kubeadm + Calico CNI
# Part of: Cyberia Online Object Layer ERC-1155 ecosystem`;

  const clusterIpServices = validators.map(
    (v) => `
---
apiVersion: v1
kind: Service
metadata:
  name: besu-validator${v.index}
  labels:
    app: validator${v.index}
    app.kubernetes.io/name: besu
    app.kubernetes.io/component: validator
    app.kubernetes.io/part-of: cyberia-besu
  namespace: ${namespace}
spec:
  # Headless service (clusterIP: None) is required for StatefulSet pod-specific
  # DNS entries like validator1-0.besu-validator1.besu.svc.cluster.local to resolve.
  # Without this, enode URLs in --bootnodes and static-nodes.json won't work
  # because K8s only creates per-pod DNS records for headless services.
  clusterIP: None
  type: ClusterIP
  # Required for IBFT2 bootstrap: init containers in validators 2-4 must reach
  # validator1 before it passes readiness probes (which require quorum).
  # Without this, K8s removes the pod from endpoints when not-ready, causing a
  # deadlock where validator1 can never get peers.
  publishNotReadyAddresses: true
  selector:
    app: validator${v.index}
  ports:
    - port: 30303
      targetPort: 30303
      protocol: UDP
      name: discovery
    - port: 30303
      targetPort: 30303
      protocol: TCP
      name: rlpx
    - port: 8545
      targetPort: 8545
      protocol: TCP
      name: json-rpc
    - port: 8546
      targetPort: 8546
      protocol: TCP
      name: ws${
        v.index === 1
          ? `
    - port: 8547
      targetPort: 8547
      protocol: TCP
      name: graphql`
          : ''
      }
    - port: 9545
      targetPort: 9545
      protocol: TCP
      name: metrics`,
  );

  const nodePortService = `
---
# NodePort service exposing validator1 JSON-RPC for external Hardhat access.
# Maps internal port 8545 -> NodePort ${nodePortRpc} so that hardhat.config.js
# network "besu-k8s" (url: http://<node-ip>:${nodePortRpc}) can reach the chain
# from outside the kubeadm cluster.
#
# WebSocket is also exposed on NodePort ${nodePortWs} for subscription-based workflows.
apiVersion: v1
kind: Service
metadata:
  name: besu-rpc-nodeport
  labels:
    app: validator1
    app.kubernetes.io/name: besu
    app.kubernetes.io/component: rpc-gateway
    app.kubernetes.io/part-of: cyberia-besu
  namespace: ${namespace}
spec:
  type: NodePort
  selector:
    app: validator1
  ports:
    - port: 8545
      targetPort: 8545
      nodePort: ${nodePortRpc}
      protocol: TCP
      name: json-rpc
    - port: 8546
      targetPort: 8546
      nodePort: ${nodePortWs}
      protocol: TCP
      name: ws`;

  return header + clusterIpServices.join('') + nodePortService + '\n';
}

/**
 * Generate a single validator StatefulSet block (ServiceAccount, Role, RoleBinding, StatefulSet).
 * @param {ValidatorKeySet} validator
 * @param {ValidatorKeySet[]} allValidators - All validators (for bootnode references).
 * @param {string} namespace
 * @param {string} besuImage
 * @param {string} curlImage
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateValidatorStatefulSetYaml(
  validator,
  allValidators,
  namespace = 'besu',
  besuImage = 'hyperledger/besu:24.12.1',
  curlImage = 'curlimages/curl:8.11.1',
) {
  const i = validator.index;
  const name = `validator${i}`;

  // Bootnode references: validator1 and validator2 (or just validator1 if only 1)
  const bootnodeIndices = allValidators.length >= 2 ? [1, 2] : [1];
  const bootnodeArgs = bootnodeIndices
    .map(
      (bi) =>
        `enode://\${VALIDATOR${bi}_PUBKEY}@validator${bi}-0.besu-validator${bi}.${namespace}.svc.cluster.local:30303`,
    )
    .join(',');

  // Environment variables for bootnode public keys
  const bootnodeEnvVars = bootnodeIndices
    .map(
      (bi) => `            - name: VALIDATOR${bi}_PUBKEY
              valueFrom:
                configMapKeyRef:
                  name: besu-validators-configmap
                  key: validator${bi}PubKey`,
    )
    .join('\n');

  // Init container (wait for validator1) — only for validators 2+
  const initContainer =
    i > 1
      ? `
      initContainers:
        - name: wait-for-validator1
          image: ${curlImage}
          command:
            - sh
            - -c
            - |
              echo "Waiting for validator1 JSON-RPC to be available..."
              until curl -sf -X POST --connect-timeout 3 \\
                -H 'Content-Type: application/json' \\
                -d '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' \\
                http://besu-validator1.${namespace}.svc.cluster.local:8545; do
                echo "validator1 not ready yet, retrying in 5s..."
                sleep 5
              done
              echo "validator1 is available."`
      : '';

  // Validator1 gets graphql port, others don't
  const graphqlPort =
    i === 1
      ? `
            - containerPort: 8547
              name: graphql
              protocol: TCP`
      : '';

  return `
# ${'='.repeat(77)}
# Validator ${i}${i === 1 ? ' - Primary RPC endpoint for Hardhat / ObjectLayerToken deploys' : ''}
# ${'='.repeat(77)}
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${name}-sa
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: besu
    app.kubernetes.io/component: ${name}
    app.kubernetes.io/part-of: cyberia-besu

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${name}-key-read-role
  namespace: ${namespace}
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: [besu-${name}-key]
    verbs: ["get"]
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["get", "list"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${name}-rb
  namespace: ${namespace}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${name}-key-read-role
subjects:
  - kind: ServiceAccount
    name: ${name}-sa
    namespace: ${namespace}

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${name}
  labels:
    app: ${name}
    app.kubernetes.io/name: besu
    app.kubernetes.io/component: ${name}
    app.kubernetes.io/part-of: cyberia-besu
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${name}
  serviceName: besu-${name}
  template:
    metadata:
      labels:
        app: ${name}
        app.kubernetes.io/name: besu
        app.kubernetes.io/component: ${name}
        app.kubernetes.io/part-of: cyberia-besu
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9545"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: ${name}-sa${initContainer}
      containers:
        - name: ${name}
          image: ${besuImage}
          imagePullPolicy: IfNotPresent
          resources:
            requests:
              cpu: 100m
              memory: 1024Mi
            limits:
              cpu: 500m
              memory: 2048Mi
          env:
            - name: POD_IP
              valueFrom:
                fieldRef:
                  fieldPath: status.podIP
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: BESU_P2P_HOST
              valueFrom:
                fieldRef:
                  fieldPath: status.podIP
${bootnodeEnvVars}
          volumeMounts:
            - name: key
              mountPath: /secrets
              readOnly: true
            - name: genesis-config
              mountPath: /etc/genesis
              readOnly: true
            - name: config-toml
              mountPath: /etc/besu
              readOnly: true
            - name: node-permissions
              mountPath: /etc/permissions
            - name: data
              mountPath: /data
          ports:
            - containerPort: 8545
              name: json-rpc
              protocol: TCP
            - containerPort: 8546
              name: ws
              protocol: TCP${graphqlPort}
            - containerPort: 30303
              name: rlpx
              protocol: TCP
            - containerPort: 30303
              name: discovery
              protocol: UDP
            - containerPort: 9545
              name: metrics
              protocol: TCP
          command:
            - /bin/sh
            - -c
          args:
            - |
              exec /opt/besu/bin/besu \\
                --node-private-key-file=/secrets/nodekey \\
                --config-file=/etc/besu/config.toml \\
                --Xdns-enabled=true --Xdns-update-enabled=true \\
                --bootnodes=${bootnodeArgs}
          livenessProbe:
            httpGet:
              path: /liveness
              port: 8545
            initialDelaySeconds: 60
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /readiness
              port: 8545
            initialDelaySeconds: 30
            periodSeconds: 15
      volumes:
        - name: key
          secret:
            secretName: besu-${name}-key
        - name: genesis-config
          configMap:
            name: besu-genesis-configmap
        - name: config-toml
          configMap:
            name: besu-config-toml-configmap
        - name: node-permissions
          configMap:
            name: besu-node-permissions-configmap
        - name: data
          emptyDir:
            sizeLimit: 2Gi`;
}

/**
 * Generate the complete validators YAML (all validator StatefulSets).
 * @param {ValidatorKeySet[]} validators
 * @param {string} namespace
 * @param {string} besuImage
 * @param {string} curlImage
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateValidatorsYaml(
  validators,
  namespace = 'besu',
  besuImage = 'hyperledger/besu:24.12.1',
  curlImage = 'curlimages/curl:8.11.1',
) {
  const header = `# Hyperledger Besu IBFT2 Validator StatefulSets for Cyberia Online Object Layer ecosystem.
# Designed for kubeadm-managed Kubernetes clusters with Calico CNI.
#
# Deploys ${validators.length} IBFT2 validators as StatefulSets with:
#   - RBAC for secret access
#   - Prometheus metrics scraping annotations
#   - DNS-based peer discovery (Xdns-enabled)
#   - Zero gas price for private permissioned network
#   - Shared genesis, config, and permissions via ConfigMaps
#
# The validator1 node serves as the primary JSON-RPC endpoint for
# Hardhat contract deployments (ObjectLayerToken ERC-1155).
#
# Compatible with: kubeadm + Calico CNI + local-path-provisioner
# Part of: Cyberia Online Object Layer ERC-1155 ecosystem
#
# Generated dynamically by besu-genesis-generator.js — do not edit manually.`;

  const statefulSets = validators.map((v) =>
    generateValidatorStatefulSetYaml(v, validators, namespace, besuImage, curlImage),
  );

  return header + '\n' + statefulSets.join('\n') + '\n';
}

/**
 * Generate the kustomization.yaml.
 * @param {string} namespace
 * @returns {string}
 * @memberof BesuGenesisGenerator
 */
function generateKustomizationYaml(namespace = 'besu') {
  return `# Kustomization for Hyperledger Besu IBFT2 chain deployment on kubeadm clusters.
# Part of: Cyberia Online Object Layer ERC-1155 ecosystem
#
# Usage:
#   kubectl apply -k manifests/besu
#
# This deploys a 4-validator IBFT2 Besu network with:
#   - Dedicated '${namespace}' namespace
#   - ConfigMaps for genesis, TOML config, validators, and node permissions
#   - Secrets for validator node keys
#   - ClusterIP services for inter-node communication
#   - NodePort service (30545) for external Hardhat/ethers.js RPC access
#   - StatefulSets for all 4 validators with health probes and Prometheus annotations
#
# Compatible with: kubeadm + Calico CNI + local-path-provisioner
#
# Generated dynamically by besu-genesis-generator.js

apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: ${namespace}

commonLabels:
  app.kubernetes.io/managed-by: underpost
  app.kubernetes.io/part-of: cyberia-besu

resources:
  - namespace.yaml
  - besu-genesis-configmap.yaml
  - besu-config-toml-configmap.yaml
  - besu-validators-configmap.yaml
  - besu-node-permissions-configmap.yaml
  - besu-secrets.yaml
  - besu-services.yaml
  - besu-validators.yaml
`;
}

// ---------------------------------------------------------------------------
// Network config JSON (for hardhat integration)
// ---------------------------------------------------------------------------

/**
 * Generate the besu-object-layer.network.json for the hardhat/networks/ directory.
 * @param {ValidatorKeySet[]} validators
 * @param {Object} genesis
 * @param {GenesisOptions} [opts]
 * @returns {Object}
 * @memberof BesuGenesisGenerator
 */
function buildNetworkConfigJson(validators, genesis, opts = {}) {
  const chainId = opts.chainId || 777771;
  return {
    genesis: genesis,
    blockchain: {
      nodes: {
        generate: true,
        count: validators.length,
      },
    },
    network: {
      name: 'cyberia-besu',
      description:
        'Hyperledger Besu IBFT2 private network for Cyberia Online Object Layer ERC-1155 ecosystem on kubeadm cluster',
      consensus: 'IBFT2',
      chainId,
      clusterType: 'kubeadm',
      contracts: {
        ObjectLayerToken: {
          standard: 'ERC-1155',
          description:
            'Unified multi-token contract: fungible CryptoKoyn (token ID 0) + semi/non-fungible Object Layer items (token ID >= 1)',
          tokenIdScheme: "keccak256(abi.encodePacked('cyberia.object-layer:', itemId))",
          fungibleTokens: {
            CRYPTOKOYN: {
              tokenId: 0,
              symbol: 'CKY',
              decimals: 18,
              initialSupply: '10000000000000000000000000',
            },
          },
        },
      },
      rpc: {
        'besu-ibft2': {
          description: 'Direct RPC access (e.g. kubectl port-forward or in-cluster)',
          url: 'http://127.0.0.1:8545',
          chainId,
          gasPrice: 0,
        },
        'besu-k8s': {
          description: 'kubeadm cluster NodePort access via besu-rpc-nodeport service (30545)',
          url: 'http://127.0.0.1:30545',
          chainId,
          gasPrice: 0,
        },
      },
      kubernetes: {
        clusterType: 'kubeadm',
        manifests: 'manifests/besu/',
        namespace: 'besu',
        validators: validators.length,
        image: 'hyperledger/besu:24.12.1',
        services: {
          clusterIP: validators.map((v) => `besu-validator${v.index}`),
          nodePort: {
            name: 'besu-rpc-nodeport',
            jsonRpc: 30545,
            ws: 30546,
          },
        },
        monitoring: {
          prometheus: true,
          metricsPort: 9545,
          grafana: true,
        },
      },
    },
    validators: validators.map((v) => ({
      index: v.index,
      publicKey: v.publicKey,
      address: v.address,
      enode: v.enodeDns,
    })),
    generated: new Date().toISOString(),
    generatorVersion: '1.0.0',
  };
}

// ---------------------------------------------------------------------------
// High-level orchestration
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GenerateBesuManifestsOptions
 * @property {string} [outputDir='./manifests/besu'] - Where to write the manifests.
 * @property {string} [networkConfigDir='./hardhat/networks'] - Where to write the network config JSON.
 * @property {number} [validatorCount=4] - Number of IBFT2 validators.
 * @property {string} [namespace='besu'] - Kubernetes namespace.
 * @property {number} [chainId=777771] - Chain ID.
 * @property {number} [blockPeriodSeconds=5] - IBFT2 block period.
 * @property {number} [epochLength=30000] - IBFT2 epoch length.
 * @property {number} [requestTimeoutSeconds=10] - IBFT2 request timeout.
 * @property {string} [coinbaseAddress=''] - Coinbase deployer address (reads from engine-private if empty).
 * @property {string} [coinbaseBalance] - Hex balance for coinbase.
 * @property {string} [besuImage='hyperledger/besu:24.12.1'] - Besu Docker image.
 * @property {string} [curlImage='curlimages/curl:8.11.1'] - Curl init container image.
 * @property {number} [nodePortRpc=30545] - NodePort for external RPC.
 * @property {number} [nodePortWs=30546] - NodePort for external WS.
 * @property {string} [gasLimit='0x1fffffffffffff'] - Genesis gas limit.
 * @property {boolean} [savePrivateKeys=true] - Also save validator private keys to engine-private.
 * @property {string} [privateKeysDir='./engine-private/eth-networks/besu/validators'] - Private keys output dir.
 * @memberof BesuGenesisGenerator
 */

/**
 * Generate all Besu K8s manifests and network config from scratch.
 *
 * This is the main entry point: it creates fresh validator keys, computes all
 * derived data (public keys, addresses, extraData, enode URLs), and writes
 * every manifest file and the network config JSON.
 *
 * @param {GenerateBesuManifestsOptions} [opts]
 * @returns {Promise<{validators: ValidatorKeySet[], genesis: Object, manifestsPath: string}>}
 * @memberof BesuGenesisGenerator
 */
async function generateBesuManifests(opts = {}) {
  const {
    outputDir = './manifests/besu',
    networkConfigDir = './hardhat/networks',
    validatorCount = 4,
    namespace = 'besu',
    chainId = 777771,
    blockPeriodSeconds = 5,
    epochLength = 30000,
    requestTimeoutSeconds = 10,
    coinbaseAddress = '',
    coinbaseBalance = '0x200000000000000000000000000000000000000000000000000000000000000',
    besuImage = 'hyperledger/besu:24.12.1',
    curlImage = 'curlimages/curl:8.11.1',
    nodePortRpc = 30545,
    nodePortWs = 30546,
    gasLimit = '0x1fffffffffffff',
    savePrivateKeys = true,
    privateKeysDir = './engine-private/eth-networks/besu/validators',
  } = opts;

  logger.info(`Generating Besu IBFT2 manifests for ${validatorCount} validators...`);
  logger.info(`  Namespace: ${namespace}`);
  logger.info(`  Chain ID: ${chainId}`);
  logger.info(`  Output: ${outputDir}`);

  // 1. Generate validator keys
  const validators = generateValidatorKeys(validatorCount, namespace);

  for (const v of validators) {
    logger.info(`  Validator ${v.index}:`);
    logger.info(`    Public Key: ${v.publicKey.slice(0, 16)}...${v.publicKey.slice(-16)}`);
    logger.info(`    Address:    ${v.address}`);
  }

  // 2. Resolve coinbase address
  let resolvedCoinbase = coinbaseAddress.replace(/^0x/, '');
  if (!resolvedCoinbase) {
    // Try to read from engine-private coinbase file
    const coinbasePath = './engine-private/eth-networks/besu/coinbase';
    if (fs.existsSync(coinbasePath)) {
      try {
        const key = fs.readFileSync(coinbasePath, 'utf8').trim();
        const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
        // Derive address from coinbase private key
        const ecdh = crypto.createECDH('secp256k1');
        ecdh.setPrivateKey(Buffer.from(cleanKey, 'hex'));
        const pubKey = ecdh.getPublicKey('hex').slice(2);
        resolvedCoinbase = publicKeyToAddress(pubKey);
        logger.info(`  Coinbase address (from engine-private): ${resolvedCoinbase}`);
      } catch (e) {
        logger.warn(`  Could not derive coinbase address from private key: ${e.message}`);
        logger.warn(
          '  Using empty coinbase. Set --coinbase-address or create engine-private/eth-networks/besu/coinbase',
        );
      }
    } else {
      logger.warn('  No coinbase address provided and no coinbase key file found.');
      logger.warn('  Run "cyberia chain key-gen --save" and "cyberia chain set-coinbase" first.');
    }
  }

  // 3. Build genesis
  const genesisOpts = {
    chainId,
    blockPeriodSeconds,
    epochLength,
    requestTimeoutSeconds,
    coinbaseAddress: resolvedCoinbase,
    coinbaseBalance,
    gasLimit,
  };
  const genesis = buildGenesis(validators, genesisOpts);

  // 4. Generate all manifest files
  fs.ensureDirSync(outputDir);

  const files = {
    'namespace.yaml': generateNamespaceYaml(namespace),
    'besu-genesis-configmap.yaml': generateGenesisConfigMapYaml(genesis, namespace),
    'besu-config-toml-configmap.yaml': generateConfigTomlConfigMapYaml(validators, namespace),
    'besu-validators-configmap.yaml': generateValidatorsConfigMapYaml(validators, namespace),
    'besu-node-permissions-configmap.yaml': generateNodePermissionsConfigMapYaml(validators, namespace),
    'besu-secrets.yaml': generateSecretsYaml(validators, namespace),
    'besu-services.yaml': generateServicesYaml(validators, namespace, nodePortRpc, nodePortWs),
    'besu-validators.yaml': generateValidatorsYaml(validators, namespace, besuImage, curlImage),
    'kustomization.yaml': generateKustomizationYaml(namespace),
  };

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    logger.info(`  Wrote: ${filePath}`);
  }

  // 5. Write network config JSON
  if (networkConfigDir) {
    fs.ensureDirSync(networkConfigDir);
    const networkConfig = buildNetworkConfigJson(validators, genesis, { chainId });
    const networkConfigPath = path.join(networkConfigDir, 'besu-object-layer.network.json');
    fs.writeJsonSync(networkConfigPath, networkConfig, { spaces: 2 });
    logger.info(`  Wrote network config: ${networkConfigPath}`);
  }

  // 6. Optionally save private keys to engine-private for backup
  if (savePrivateKeys) {
    fs.ensureDirSync(privateKeysDir);
    for (const v of validators) {
      const keyPath = path.join(privateKeysDir, `validator${v.index}.key.json`);
      fs.writeJsonSync(
        keyPath,
        {
          index: v.index,
          privateKey: v.privateKey,
          publicKey: v.publicKey,
          address: v.address,
          enode: v.enodeDns,
          generated: new Date().toISOString(),
        },
        { spaces: 2 },
      );
    }
    logger.info(`  Validator private keys saved to: ${privateKeysDir}`);
    logger.warn('  Keep the engine-private/ directory secure!');
  }

  logger.info('Besu manifest generation complete.');
  logger.info(`  extraData: ${genesis.extraData.slice(0, 32)}...`);
  logger.info(`  Chain ID: ${chainId}`);
  logger.info(`  Validators: ${validatorCount}`);

  return { validators, genesis, manifestsPath: outputDir };
}

// ---------------------------------------------------------------------------
// Deploy / Remove orchestration
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} DeployBesuOptions
 * @property {boolean} [pullImage=false] - Pull Besu container images into containerd before deployment.
 * @property {number} [validators=4] - Number of IBFT2 validators.
 * @property {number} [chainId=777771] - Chain ID for the network.
 * @property {number} [blockPeriodSeconds=5] - IBFT2 block period.
 * @property {number} [epochLength=30000] - IBFT2 epoch length.
 * @property {string} [coinbaseAddress=''] - Coinbase deployer address.
 * @property {string} [besuImage='hyperledger/besu:24.12.1'] - Besu container image.
 * @property {string} [curlImage='curlimages/curl:8.11.1'] - Curl init container image.
 * @property {number} [nodePortRpc=30545] - NodePort for external JSON-RPC.
 * @property {number} [nodePortWs=30546] - NodePort for external WebSocket.
 * @property {string} [namespace='besu'] - Kubernetes namespace.
 * @property {boolean} [skipGenerate=false] - Skip manifest generation and use existing manifests as-is.
 * @property {boolean} [skipWait=false] - Skip waiting for validators to reach Running state.
 * @property {string} [manifestsPath='./manifests/besu'] - Path to write/read manifests.
 * @property {string} [networkConfigDir='./hardhat/networks'] - Path for Hardhat network config JSON.
 * @property {string} [privateKeysDir='./engine-private/eth-networks/besu/validators'] - Path for validator key backups.
 * @memberof BesuGenesisGenerator
 */

/**
 * Deploys the Hyperledger Besu IBFT2 network to a kubeadm cluster using
 * dynamically generated manifests. This provides the blockchain layer
 * for the Cyberia Online Object Layer ERC-1155 ecosystem (ObjectLayerToken + CryptoKoyn).
 *
 * The deployment creates:
 *   - A dedicated 'besu' namespace
 *   - ConfigMaps for genesis (dynamic chainId), TOML config, validator keys, permissions
 *   - Secrets for N IBFT2 validator node keys (freshly generated secp256k1)
 *   - ClusterIP services for inter-validator communication
 *   - NodePort service (30545) for external Hardhat/ethers.js RPC access
 *   - N validator StatefulSets with health probes and Prometheus annotations
 *
 * After deployment, the Hardhat network "besu-k8s" (url: http://<node-ip>:30545) can
 * connect to the chain for ObjectLayerToken contract deployments.
 *
 * @param {DeployBesuOptions} [options]
 * @returns {Promise<{validators: ValidatorKeySet[], genesis: Object, manifestsPath: string} | undefined>}
 * @memberof BesuGenesisGenerator
 */
async function deployBesu(options = {}) {
  const {
    pullImage = false,
    validators: validatorCount = 4,
    chainId = 777771,
    blockPeriodSeconds = 5,
    epochLength = 30000,
    coinbaseAddress = '',
    besuImage = 'hyperledger/besu:24.12.1',
    curlImage = 'curlimages/curl:8.11.1',
    nodePortRpc = 30545,
    nodePortWs = 30546,
    namespace = 'besu',
    skipGenerate = false,
    skipWait = false,
    manifestsPath: besuManifestsPath = './manifests/besu',
    networkConfigDir = './hardhat/networks',
    privateKeysDir = './engine-private/eth-networks/besu/validators',
  } = options;

  let generateResult;

  // ── Step 0: Idempotency — detect existing deployment ───────────────────
  const existingNs = shellExec(
    `kubectl get namespace ${namespace} -o jsonpath='{.metadata.name}' 2>/dev/null || echo ""`,
    { stdout: true, silent: true },
  )
    .trim()
    .replace(/'/g, '');

  const existingKeysAvailable =
    fs.existsSync(privateKeysDir) && fs.readdirSync(privateKeysDir).some((f) => f.endsWith('.key.json'));

  if (existingNs === namespace && existingKeysAvailable && !skipGenerate) {
    // Cluster already has a besu namespace and we have saved keys — check if pods are healthy
    const runningPods = shellExec(
      `kubectl get pods -n ${namespace} --field-selector=status.phase=Running -o name 2>/dev/null | wc -l`,
      { stdout: true, silent: true },
    ).trim();

    const healthyCount = parseInt(runningPods, 10) || 0;

    if (healthyCount >= validatorCount) {
      logger.info(`Besu network already running in namespace '${namespace}' with ${healthyCount} healthy pod(s).`);
      logger.info('Deployment is already up-to-date. Use "chain remove" first to redeploy with fresh keys.');
      logger.info(`  Internal RPC: http://besu-validator1.${namespace}.svc.cluster.local:8545`);
      logger.info(`  External RPC (NodePort): http://<node-ip>:${nodePortRpc}`);
      return { alreadyRunning: true, namespace, validators: healthyCount };
    }

    // Namespace exists but pods aren't all healthy — tear down stale resources
    // and redeploy with existing keys if manifests are present
    logger.info(`Besu namespace '${namespace}' exists but only ${healthyCount}/${validatorCount} pods are healthy.`);
    logger.info('Cleaning up stale deployment before redeploying...');
    if (fs.existsSync(besuManifestsPath)) {
      shellExec(`kubectl delete -k ${besuManifestsPath} --ignore-not-found`);
    }
    shellExec(`kubectl delete namespace ${namespace} --ignore-not-found --wait=true`);
    // Brief pause to let namespace finalizers complete
    await new Promise((resolve) => setTimeout(resolve, 3000));
    logger.info('Stale resources cleaned up.');
  } else if (existingNs === namespace && !existingKeysAvailable && !skipGenerate) {
    // Namespace exists but no saved keys — clean slate needed
    logger.info(`Besu namespace '${namespace}' exists but no saved keys found. Cleaning up...`);
    if (fs.existsSync(besuManifestsPath)) {
      shellExec(`kubectl delete -k ${besuManifestsPath} --ignore-not-found`);
    }
    shellExec(`kubectl delete namespace ${namespace} --ignore-not-found --wait=true`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    logger.info('Stale resources cleaned up.');
  }

  // ── Step 1: Generate manifests (unless skipGenerate) ───────────────────
  if (!skipGenerate) {
    logger.info('Generating fresh Besu IBFT2 manifests with new validator keys...');
    try {
      generateResult = await generateBesuManifests({
        outputDir: besuManifestsPath,
        networkConfigDir,
        validatorCount,
        namespace,
        chainId,
        blockPeriodSeconds,
        epochLength,
        requestTimeoutSeconds: 10,
        coinbaseAddress,
        besuImage,
        curlImage,
        nodePortRpc,
        nodePortWs,
        savePrivateKeys: true,
        privateKeysDir,
      });
      logger.info(`Generated ${generateResult.validators.length} validator key sets.`);
      logger.info(`  extraData: ${generateResult.genesis.extraData.slice(0, 40)}...`);
    } catch (genErr) {
      logger.error(`Manifest generation failed: ${genErr.message}`);
      return;
    }
  } else {
    if (!fs.existsSync(besuManifestsPath)) {
      logger.error(`Besu manifests not found at: ${besuManifestsPath}`);
      logger.error('Run without --skip-generate to create them, or provide manifests manually.');
      return;
    }
    logger.info('Using existing manifests (--skip-generate).');
  }

  // ── Step 2: Pull container images if requested ─────────────────────────
  if (pullImage) {
    logger.info('Pulling Besu images via crictl...');
    shellExec(`sudo crictl pull ${besuImage}`);
    shellExec(`sudo crictl pull ${curlImage}`);
  }

  // ── Step 3: Apply all besu resources via kustomize ─────────────────────
  logger.info('Deploying Besu IBFT2 network to kubeadm cluster...');
  shellExec(`kubectl apply -k ${besuManifestsPath}`);

  // ── Step 4: Wait for validators to become ready ────────────────────────
  if (!skipWait) {
    logger.info('Waiting for Besu validator1 to become ready...');

    const maxAttempts = 120; // 10 minutes at 5s intervals
    let validator1Ready = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = shellExec(
        `kubectl get pod validator1-0 -n ${namespace} -o jsonpath='{.status.phase}' 2>/dev/null || echo "NotFound"`,
        { stdout: true, silent: true },
      )
        .trim()
        .replace(/'/g, '');
      if (status === 'Running') {
        // Also verify the container is not in CrashLoopBackOff
        const containerReady = shellExec(
          `kubectl get pod validator1-0 -n ${namespace} -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "false"`,
          { stdout: true, silent: true },
        )
          .trim()
          .replace(/'/g, '');
        if (containerReady === 'true') {
          validator1Ready = true;
          break;
        }
        // Pod phase is Running but container not ready — could be CrashLoopBackOff
        const waitingReason = shellExec(
          `kubectl get pod validator1-0 -n ${namespace} -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}' 2>/dev/null || echo ""`,
          { stdout: true, silent: true },
        )
          .trim()
          .replace(/'/g, '');
        if (waitingReason === 'CrashLoopBackOff') {
          logger.error('validator1-0 is in CrashLoopBackOff. Check logs: kubectl logs validator1-0 -n ' + namespace);
          return;
        }
      }
      if (attempt % 12 === 0) {
        logger.info(`  Still waiting for validator1-0... (status: ${status}, attempt ${attempt}/${maxAttempts})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    if (validator1Ready) {
      logger.info('Besu validator1 is running.');
    } else {
      logger.warn('Besu validator1 did not reach Running state within timeout.');
      logger.warn(`Check pod status manually: kubectl get pods -n ${namespace}`);
      logger.warn(`Check logs: kubectl logs validator1-0 -n ${namespace}`);
    }

    // Wait for remaining validators
    logger.info('Waiting for remaining Besu validators...');
    for (let vi = 2; vi <= validatorCount; vi++) {
      const podName = `validator${vi}-0`;
      let ready = false;
      for (let attempt = 1; attempt <= 60; attempt++) {
        const status = shellExec(
          `kubectl get pod ${podName} -n ${namespace} -o jsonpath='{.status.phase}' 2>/dev/null || echo "NotFound"`,
          { stdout: true, silent: true },
        )
          .trim()
          .replace(/'/g, '');
        if (status === 'Running') {
          const containerReady = shellExec(
            `kubectl get pod ${podName} -n ${namespace} -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "false"`,
            { stdout: true, silent: true },
          )
            .trim()
            .replace(/'/g, '');
          if (containerReady === 'true') {
            ready = true;
            break;
          }
          const waitingReason = shellExec(
            `kubectl get pod ${podName} -n ${namespace} -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}' 2>/dev/null || echo ""`,
            { stdout: true, silent: true },
          )
            .trim()
            .replace(/'/g, '');
          if (waitingReason === 'CrashLoopBackOff') {
            logger.error(`${podName} is in CrashLoopBackOff. Check logs: kubectl logs ${podName} -n ${namespace}`);
            break;
          }
        }
        if (attempt % 12 === 0) {
          logger.info(`  Still waiting for ${podName}... (status: ${status})`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      if (ready) {
        logger.info(`  ${podName} is running.`);
      } else {
        logger.warn(`  ${podName} did not reach Running state within timeout.`);
      }
    }
  }

  logger.info('');
  logger.info('Besu IBFT2 network deployment complete.');
  logger.info(`  Validators: ${validatorCount} (IBFT2 consensus)`);
  logger.info(`  Chain ID: ${chainId}`);
  logger.info(`  Namespace: ${namespace}`);
  logger.info(`  Internal RPC: http://besu-validator1.${namespace}.svc.cluster.local:8545`);
  logger.info(`  External RPC (NodePort): http://<node-ip>:${nodePortRpc}`);
  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Deploy ObjectLayerToken contract:');
  logger.info('     cyberia chain deploy-contract --network besu-k8s');
  logger.info('  2. Check chain status:');
  logger.info('     cyberia chain status --network besu-k8s');

  return generateResult;
}

/**
 * Removes the Hyperledger Besu IBFT2 network from the kubeadm cluster.
 * Deletes all resources in the 'besu' namespace created by deployBesu.
 *
 * @param {Object} [options]
 * @param {string} [options.namespace='besu'] - Kubernetes namespace.
 * @param {boolean} [options.cleanKeys=false] - Also remove generated validator keys from engine-private/.
 * @param {string} [options.manifestsPath='./manifests/besu'] - Path to the manifests directory.
 * @param {string} [options.privateKeysDir='./engine-private/eth-networks/besu/validators'] - Validator keys dir.
 * @param {boolean} [options.cleanManifests=false] - Also remove the generated manifests directory.
 * @memberof BesuGenesisGenerator
 */
function removeBesu(options = {}) {
  const {
    namespace = 'besu',
    cleanKeys = false,
    manifestsPath: besuManifestsPath = './manifests/besu',
    privateKeysDir = './engine-private/eth-networks/besu/validators',
    cleanManifests = false,
  } = options;

  logger.info('Removing Besu IBFT2 network from kubeadm cluster...');

  if (fs.existsSync(besuManifestsPath)) {
    shellExec(`kubectl delete -k ${besuManifestsPath} --ignore-not-found`);
  }

  // Also clean up any remaining resources in the besu namespace
  shellExec(`kubectl delete namespace ${namespace} --ignore-not-found`);

  if (cleanKeys) {
    if (fs.existsSync(privateKeysDir)) {
      fs.removeSync(privateKeysDir);
      logger.info(`Removed validator keys from: ${privateKeysDir}`);
    }
  }

  if (cleanManifests) {
    if (fs.existsSync(besuManifestsPath)) {
      fs.removeSync(besuManifestsPath);
      logger.info(`Removed generated manifests from: ${besuManifestsPath}`);
    }
  }

  logger.info('Besu network removed.');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Key utilities
  generatePrivateKey,
  derivePublicKey,
  publicKeyToAddress,

  // IBFT2 extraData
  computeIbft2ExtraData,

  // Key generation
  generateValidatorKeys,

  // Genesis
  buildGenesis,

  // Individual manifest generators
  generateNamespaceYaml,
  generateGenesisConfigMapYaml,
  generateValidatorsConfigMapYaml,
  generateConfigTomlConfigMapYaml,
  generateNodePermissionsConfigMapYaml,
  generateSecretsYaml,
  generateServicesYaml,
  generateValidatorsYaml,
  generateValidatorStatefulSetYaml,
  generateKustomizationYaml,

  // Network config
  buildNetworkConfigJson,

  // High-level orchestrator
  generateBesuManifests,

  // Deploy / Remove
  deployBesu,
  removeBesu,
};

export default {
  generatePrivateKey,
  derivePublicKey,
  publicKeyToAddress,
  computeIbft2ExtraData,
  generateValidatorKeys,
  buildGenesis,
  generateNamespaceYaml,
  generateGenesisConfigMapYaml,
  generateValidatorsConfigMapYaml,
  generateConfigTomlConfigMapYaml,
  generateNodePermissionsConfigMapYaml,
  generateSecretsYaml,
  generateServicesYaml,
  generateValidatorsYaml,
  generateValidatorStatefulSetYaml,
  generateKustomizationYaml,
  buildNetworkConfigJson,
  generateBesuManifests,
  deployBesu,
  removeBesu,
};
