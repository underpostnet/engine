# Hardhat Module

**Path:** `hardhat/`

---

## Overview

The Hardhat module is the smart contract development, testing, and deployment environment for the **ObjectLayerToken** ERC-1155 contract — the on-chain economic reality layer of the Object Layer Protocol. It targets Hyperledger Besu private networks (IBFT2/QBFT) running on Kubernetes.

---

## Directory Structure

```
hardhat/
  hardhat.config.js       Main Hardhat configuration
  package.json
  contracts/
    ObjectLayerToken.sol  ERC-1155 multi-token contract
  scripts/
    deployObjectLayerToken.js  Deployment script
  test/                   Contract tests (node:test + viem)
  deployments/            Deployment artifacts (auto-generated)
  ignition/               Hardhat Ignition modules (optional)
  networks/               Network-specific genesis configs
```

---

## ObjectLayerToken Contract

### Inheritance Chain

```
ObjectLayerToken
  └─ ERC1155         (OpenZeppelin 5.x — core multi-token standard)
  └─ ERC1155Burnable (holders can burn their tokens)
  └─ ERC1155Pausable (owner can freeze all transfers)
  └─ ERC1155Supply   (on-chain total supply per token ID)
  └─ Ownable         (mint, register, pause restricted to owner)
```

### Token ID Semantics

| Token ID         | Semantic                                               | Supply                               | Managed By     |
| ---------------- | ------------------------------------------------------ | ------------------------------------ | -------------- |
| `0` (CRYPTOKOYN) | Fungible in-game currency (CKY)                        | 10,000,000 × 10^18                   | cryptokoyn.net |
| `≠ 0`            | Registered Object Layer (weapon, skin, resource, etc.) | 1 = non-fungible; >1 = semi-fungible | itemledger.com |

### Token ID Derivation

A token id is the canonical content digest, never an item label and never the text of a CID:

```solidity
// computeTokenId(contentHash) = uint256(contentHash)
// contentHash = sha2-256(canonical Object Layer bytes), the digest the Object Layer CID carries
uint256 tokenId = uint256(contentHash);
```

This guarantees:

- The same canonical content always produces the same `tokenId`.
- Two definitions with different content get different token ids, whatever `itemId` they share.
- Any party can verify a `tokenId` from the canonical bytes, on-chain (`computeTokenId`) or
  off-chain (`objectLayerTokenId()` in `src/api/item-ledger/item-ledger.model.js`).
- The `tokenId` is not the CID: `getObjectLayerCid(tokenId)` computes the CID (CIDv1, raw,
  sha2-256, base32) from the digest.
- `test/support/object-layer-identity-vectors.json` pins the derivation across Solidity and JavaScript.

### Key State Variables

```solidity
uint256 public constant CRYPTOKOYN = 0;
uint256 public constant INITIAL_CRYPTOKOYN_SUPPLY = 10_000_000 * 1e18;

mapping(uint256 => bool) private _registered; // token ids registered as Object Layers
```

### Events

| Event                                                                        | Description                      |
| ---------------------------------------------------------------------------- | -------------------------------- |
| `ObjectLayerRegistered(tokenId, contentHash, objectLayerCid, initialSupply)` | Object Layer registered on-chain |
| `TransferSingle(operator, from, to, id, value)`                              | Single token transfer            |
| `TransferBatch(operator, from, to, ids, values)`                             | Batch token transfer             |
| `Paused(account)`                                                            | All transfers frozen             |
| `Unpaused(account)`                                                          | Transfers resumed                |

### Key Functions

| Function                                                           | Access      | Description                                         |
| ------------------------------------------------------------------ | ----------- | --------------------------------------------------- |
| `registerObjectLayer(to, contentHash, supply, data)`               | `onlyOwner` | Register an Object Layer + mint initial supply      |
| `batchRegisterObjectLayers(to, contentHashes[], supplies[], data)` | `onlyOwner` | Batch registration + mint                           |
| `mint(to, tokenId, amount, data)`                                  | `onlyOwner` | Mint additional supply of CKY or a registered token |
| `mintBatch(to, ids[], amounts[], data)`                            | `onlyOwner` | Batch mint                                          |
| `burn(from, tokenId, amount)`                                      | holder      | Burn tokens                                         |
| `burnBatch(from, ids[], amounts[])`                                | holder      | Batch burn                                          |
| `pause()` / `unpause()`                                            | `onlyOwner` | Emergency transfer freeze                           |
| `setBaseURI(uri)`                                                  | `onlyOwner` | Gateway prefix of `uri()`: the one mutable value    |
| `computeTokenId(contentHash)`                                      | pure        | Token ID of a canonical content digest              |
| `contentHashOf(tokenId)`                                           | pure        | The digest a token ID is                            |
| `getObjectLayerCid(tokenId)`                                       | view        | Resolve tokenId → Object Layer CID                  |
| `isRegistered(tokenId)`                                            | view        | Whether a token id is a registered Object Layer     |

### URI Resolution

```solidity
// uri(tokenId) returns: {baseTokenURI}{cid computed from bytes32(tokenId)}
// e.g.: "ipfs://bafkrei..."
// The returned URI resolves to the canonical Object Layer payload (AtomicPrefab).
// A registered token id never resolves to different content.
```

---

## Networks

### Network Configuration (`hardhat.config.js`)

| Network      | URL                                             | Chain ID | Use Case              |
| ------------ | ----------------------------------------------- | -------- | --------------------- |
| `hardhat`    | in-process                                      | -        | Local testing         |
| `besu-ibft2` | `BESU_IBFT2_RPC_URL` or `http://127.0.0.1:8545` | 777771   | Direct Besu IBFT2 RPC |
| `besu-qbft`  | `BESU_QBFT_RPC_URL` or `http://127.0.0.1:8545`  | 777771   | Direct Besu QBFT RPC  |
| `besu-k8s`   | `BESU_K8S_RPC_URL` or `http://127.0.0.1:30545`  | 777771   | Kubernetes NodePort   |

All Besu networks: `gasPrice: 0` (permissioned network, gasless model).

### Coinbase Key Management

The deployment uses a coinbase private key read from `engine-private/eth-networks/besu/coinbase`:

```javascript
const coinbaseKey = readPrivateKey('../engine-private/eth-networks/besu/coinbase');
```

If the key file does not exist, the config falls back to a dummy key (safe for compilation-only workflows).

---

## Deployment

### Prerequisites

```bash
cd hardhat
npm install
```

### Compile Contracts

```bash
npx hardhat compile
# Artifacts written to hardhat/artifacts/
```

### Deploy to Besu

```bash
# Deploy to IBFT2 network
npx hardhat run scripts/deployObjectLayerToken.js --network besu-ibft2

# Deploy to QBFT network
npx hardhat run scripts/deployObjectLayerToken.js --network besu-qbft

# Deploy to Kubernetes cluster (via NodePort :30545)
npx hardhat run scripts/deployObjectLayerToken.js --network besu-k8s
```

**Deployment script actions:**

1. Connect to Besu RPC using the coinbase secp256k1 key.
2. Deploy `ObjectLayerToken` contract.
3. Mint `INITIAL_CRYPTOKOYN_SUPPLY` (10M CKY) to the deployer address.
4. Verify initial state: total supply, deployer balance.
5. Write deployment artifact to `hardhat/deployments/{network}/ObjectLayerToken.json`.

**Deployment artifact structure:**

```json
{
  "address": "0x...",
  "abi": [...],
  "txHash": "0x...",
  "blockNumber": 42,
  "deployer": "0x...",
  "network": "besu-ibft2",
  "chainId": 777771,
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

The artifact is consumed by:

- `bin/cyberia.js` CLI (`cyberia chain` subcommands).
- Engine gRPC server for contract address resolution.
- itemledger.com and cryptokoyn.net API servers.

---

## Running Tests

Contract tests are the `item-ledger:contract` project of the platform runner, so they run
alongside every other suite and report to the same dashboard:

```bash
underpost test item-ledger:contract             # this project only
underpost test item-ledger:contract --allure    # also write results for the dashboard
underpost test item-ledger:contract --grep Burning
underpost test                                  # every project, contracts last
```

Hardhat's own tasks stay available for contract-only work:

```bash
cd hardhat
npm test                             # hardhat test
npm run coverage                     # Solidity line/statement coverage
REPORT_GAS=true npm test
```

Tests use **node:test + viem** via `@nomicfoundation/hardhat-toolbox-viem`. The
`hardhat` in-process network simulates Besu behavior.

The project runs the suites on Node's test runner rather than through `hardhat
test`: Hardhat pins its own reporter, and Node's can emit the JUnit results the
Allure dashboard ingests while still printing a readable run. Compilation still
goes through `hardhat build` first, so artifacts and the EVM are identical.

---

## Cyberia CLI Integration

The Cyberia CLI (`bin/cyberia.js`) exposes the full Besu chain and contract lifecycle:

### Key Management

```bash
# Generate new Ethereum secp256k1 key pair
cyberia chain key-gen
# Save key pair to default paths
cyberia chain key-gen --save

# Set the coinbase deployer key from hex
cyberia chain set-coinbase --private-key 0xYOUR_PRIVATE_KEY_HEX
# Set from saved key file
cyberia chain set-coinbase --from-file ./engine-private/eth-networks/besu/<address>.key.json
```

### Network Lifecycle

```bash
# Deploy Besu network to Kubernetes
cyberia chain deploy
cyberia chain deploy --consensus qbft

# Remove Besu network
cyberia chain remove
```

### Contract Lifecycle

```bash
# Compile contracts
cyberia chain compile

# Deploy ObjectLayerToken (mints 10M CKY to deployer)
cyberia chain deploy-contract --network besu-ibft2

# Run contract tests
cyberia chain test
```

### Token Operations

```bash
# Register a canonical Object Layer by CID
cyberia chain register --cid bafkrei... --supply 1

# Register the current Cyberia definition of an item (resolves the CID from MongoDB)
cyberia chain register --item-id legendary-hatchet --from-db --supply 1

# Register a semi-fungible stackable resource
cyberia chain register --item-id gold-ore --from-db --supply 1000000

# Batch-register: CIDs, or Cyberia item ids resolved with --from-db
cyberia chain batch-register --from-db --items '[{"cid":"bafkrei...","supply":1},{"itemId":"stone","supply":500000}]'

# Index a registration that already exists on-chain (no transaction)
cyberia chain bind --cid bafkrei... --item-id stone

# Project every event into the ItemLedger ownership and provenance collections
cyberia chain index --network besu-k8s --follow 5000
cyberia chain reconcile --network besu-k8s

# Mint additional CKY
cyberia chain mint --token-id 0 --to 0xABCD...1234 --amount 1000000000000000000000

# Query balance
cyberia chain balance --address 0xABCD...1234 --token-id 0

# Transfer
cyberia chain transfer --from 0x... --to 0x... --token-id 0 --amount 1000

# Burn
cyberia chain burn --token-id 0 --amount 500 --address 0x...

# Status and governance
cyberia chain status
cyberia chain pause
cyberia chain unpause
```

---

## Environment Variables

| Variable              | Default                  | Description                         |
| --------------------- | ------------------------ | ----------------------------------- |
| `BESU_IBFT2_RPC_URL`  | `http://127.0.0.1:8545`  | Besu IBFT2 JSON-RPC URL             |
| `BESU_QBFT_RPC_URL`   | `http://127.0.0.1:8545`  | Besu QBFT JSON-RPC URL              |
| `BESU_K8S_RPC_URL`    | `http://127.0.0.1:30545` | Kubernetes NodePort RPC URL         |
| `BESU_IBFT2_CHAIN_ID` | `777771`                 | Chain ID override for IBFT2         |
| `REPORT_GAS`          | `false`                  | Enable gas usage reporting in tests |
| `GAS_REPORT_FILE`     | _(stdout)_               | Path for gas report output file     |

## Contract

`hardhat/contracts/ObjectLayerToken.sol` keeps one resolution relationship: token id →
Object Layer CID, computed from the digest, never stored, never changed.

| Function                                                           | Role                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| `computeTokenId(bytes32 contentHash)`                              | Token id of a definition                              |
| `contentHashOf(tokenId)`                                           | The digest a token id is                              |
| `registerObjectLayer(to, contentHash, supply, data)`               | Registers a definition and mints its initial supply   |
| `batchRegisterObjectLayers(to, contentHashes[], supplies[], data)` | Same, in one transaction                              |
| `getObjectLayerCid(tokenId)`                                       | The CID a registered token id represents              |
| `isRegistered(tokenId)`                                            | Whether a token id is a registered definition         |
| `mint`, `mintBatch`                                                | Additional supply of CKY or of registered token types |
| `uri(tokenId)`                                                     | `{baseURI}{objectLayerCid}`                           |
| `setBaseURI(uri)`                                                  | The one mutable value: the gateway prefix of `uri()`  |

A registered definition is immutable: the token id is its content. There is no metadata
update function and no metadata event.
