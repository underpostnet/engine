// hardhat.config.js
// Hardhat configuration for the Cyberia Online Object Layer ERC-1155 ecosystem.
// Supports deployment to Hyperledger Besu (IBFT2/QBFT) private networks
// running on kubeadm-managed Kubernetes clusters (manifests/besu/).
//
// Compatible with: Hardhat 3.x + Ethers v6 + hardhat-toolbox-mocha-ethers

import { defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
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
const config = defineConfig({
  plugins: [hardhatToolboxMochaEthers],

  // ── Solidity ────────────────────────────────────────────────────────────────
  solidity: {
    version: '0.8.27',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'cancun',
    },
  },

  // ── Networks ────────────────────────────────────────────────────────────
  //
  // Hyperledger Besu private networks use IBFT2 or QBFT consensus.
  // The RPC endpoints below correspond to the Kubernetes services defined in
  // manifests/besu/ (deployed via `underpost cluster --besu` or `cyberia chain deploy`).
  //
  // Default to 'hardhat' for local testing; use 'besu-k8s' for kubeadm cluster deployments.
  defaultNetwork: 'hardhat',

  networks: {
    // Local Hardhat in-process network (for testing)
    hardhat: {
      type: 'edr-simulated',
    },

    // ── Besu IBFT2 – direct RPC (e.g. port-forward or in-cluster access) ───
    // Connects to the first validator JSON-RPC endpoint directly.
    'besu-ibft2': {
      type: 'http',
      url: process.env.BESU_IBFT2_RPC_URL || 'http://127.0.0.1:8545',
      accounts: [coinbaseKey],
      chainId: parseInt(process.env.BESU_IBFT2_CHAIN_ID || '777771', 10),
      // Besu-specific: gas price is typically 0 on private permissioned networks
      gasPrice: 0,
      // Timeout for JSON-RPC requests (Besu can be slow on first blocks)
      timeout: 120000,
    },

    // ── Besu QBFT – direct RPC (e.g. port-forward or in-cluster access) ────
    'besu-qbft': {
      type: 'http',
      url: process.env.BESU_QBFT_RPC_URL || 'http://127.0.0.1:8545',
      accounts: [coinbaseKey],
      chainId: parseInt(process.env.BESU_QBFT_CHAIN_ID || '777771', 10),
      gasPrice: 0,
      timeout: 120000,
    },

    // ── Besu – kubeadm cluster (NodePort) ───────────────────────────────────
    // Use when deploying from outside the kubeadm cluster via the NodePort
    // service (besu-rpc-nodeport → 30545) defined in manifests/besu/.
    // This is the recommended network for the Cyberia Object Layer ecosystem.
    'besu-k8s': {
      type: 'http',
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

  // ── Mocha (test runner) ─────────────────────────────────────────────────────
  mocha: {
    timeout: 60000,
  },
});

export default config;
