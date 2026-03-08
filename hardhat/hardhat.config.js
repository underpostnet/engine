// hardhat.config.js
// Hardhat configuration for the Cyberia Online Object Layer ERC-1155 ecosystem.
// Supports deployment to Hyperledger Besu (IBFT2/QBFT) private networks.
//
// Compatible with: Hardhat 2.28.x (hh2 LTS) + Ethers v6 + hardhat-toolbox 6.x

import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import '@nomicfoundation/hardhat-ignition-ethers';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────────────────────
// Helper: safely read a private key file, falling back to a dummy key for
// compilation-only workflows (tests on hardhat network, etc.).
// ──────────────────────────────────────────────────────────────────────────────
const DUMMY_PRIVATE_KEY = '0x' + 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function readPrivateKey(relPath) {
  try {
    const abs = path.resolve(__dirname, relPath);
    if (fs.existsSync(abs)) {
      const raw = fs.readFileSync(abs, 'utf8').trim();
      return raw.startsWith('0x') ? raw : `0x${raw}`;
    }
  } catch (_) {
    // fall through
  }
  return DUMMY_PRIVATE_KEY;
}

// Read the coinbase private key used for Besu network deployments
const coinbaseKey = readPrivateKey('../engine-private/eth-networks/besu/coinbase');

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  // ── Solidity ────────────────────────────────────────────────────────────────
  solidity: {
    version: '0.8.27',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'shanghai',
    },
  },

  // ── Networks ────────────────────────────────────────────────────────────────
  //
  // Hyperledger Besu private networks use IBFT2 or QBFT consensus.
  // The RPC endpoints below correspond to the Kubernetes services defined in
  // quorum-kubernetes/playground/kubectl/quorum-besu/ibft2/.
  //
  defaultNetwork: 'hardhat',

  networks: {
    // Local Hardhat in-process network (for testing)
    hardhat: {},

    // ── Besu IBFT2 – local development (minikube / docker-compose) ──────────
    // Connects to the first validator JSON-RPC endpoint.
    'besu-ibft2': {
      url: process.env.BESU_IBFT2_RPC_URL || 'http://127.0.0.1:8545',
      accounts: [coinbaseKey],
      chainId: parseInt(process.env.BESU_IBFT2_CHAIN_ID || '777771', 10),
      // Besu-specific: gas price is typically 0 on private permissioned networks
      gasPrice: 0,
      // Timeout for JSON-RPC requests (Besu can be slow on first blocks)
      timeout: 120000,
    },

    // ── Besu QBFT – local development (minikube / docker-compose) ───────────
    'besu-qbft': {
      url: process.env.BESU_QBFT_RPC_URL || 'http://127.0.0.1:8545',
      accounts: [coinbaseKey],
      chainId: parseInt(process.env.BESU_QBFT_CHAIN_ID || '777771', 10),
      gasPrice: 0,
      timeout: 120000,
    },

    // ── Besu – Kubernetes cluster (NodePort or LoadBalancer) ─────────────────
    // Use when deploying from outside the k8s cluster via a NodePort or ingress.
    'besu-k8s': {
      url: process.env.BESU_K8S_RPC_URL || 'http://127.0.0.1:30545',
      accounts: [coinbaseKey],
      chainId: parseInt(process.env.BESU_K8S_CHAIN_ID || '777771', 10),
      gasPrice: 0,
      timeout: 180000,
    },
  },

  // ── Paths ───────────────────────────────────────────────────────────────────
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },

  // ── Gas Reporter ────────────────────────────────────────────────────────────
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
    outputFile: process.env.GAS_REPORT_FILE || undefined,
    noColors: !!process.env.GAS_REPORT_FILE,
  },

  // ── TypeChain ───────────────────────────────────────────────────────────────
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },

  // ── Mocha (test runner) ─────────────────────────────────────────────────────
  mocha: {
    timeout: 60000,
  },
};

export default config;
