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
  test/                   Contract tests (Mocha + ethers v6)
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

| Token ID         | Semantic                                         | Supply                               | Managed By     |
| ---------------- | ------------------------------------------------ | ------------------------------------ | -------------- |
| `0` (CRYPTOKOYN) | Fungible in-game currency (CKY)                  | 10,000,000 × 10^18                   | cryptokoyn.net |
| `≥ 1`            | Object Layer item (weapon, skin, resource, etc.) | 1 = non-fungible; >1 = semi-fungible | itemledger.com |

### Token ID Derivation

Token IDs ≥ 1 use a deterministic namespace-scoped derivation:

```solidity
// computeTokenId(itemId) = uint256(keccak256(abi.encodePacked(namespace, itemId)))
// namespace = "cyberia.object-layer:"
uint256 tokenId = uint256(keccak256(abi.encodePacked("cyberia.object-layer:", itemId)));
```

This guarantees:

- The same `itemId` always produces the same `tokenId`.
- Token IDs are collision-resistant across different item namespaces.
- Any party can independently verify a `tokenId` from an `itemId`.

### Key State Variables

```solidity
uint256 public constant CRYPTOKOYN = 0;
uint256 public constant INITIAL_CRYPTOKOYN_SUPPLY = 10_000_000 * 1e18;

mapping(uint256 => string) private _tokenCIDs;      // tokenId → canonical IPFS CID
mapping(uint256 => string) private _itemIds;         // tokenId → itemId string
mapping(bytes32 => uint256) private _itemIdToTokenId; // keccak256(itemId) → tokenId
```

### Events

| Event                                                                | Description                       |
| -------------------------------------------------------------------- | --------------------------------- |
| `ObjectLayerRegistered(tokenId, itemId, metadataCid, initialSupply)` | New item type registered on-chain |
| `MetadataUpdated(tokenId, metadataCid)`                              | Item metadata CID updated         |
| `TransferSingle(operator, from, to, id, value)`                      | Single token transfer             |
| `TransferBatch(operator, from, to, ids, values)`                     | Batch token transfer              |
| `Paused(account)`                                                    | All transfers frozen              |
| `Unpaused(account)`                                                  | Transfers resumed                 |

### Key Functions

| Function                                                     | Access      | Description                               |
| ------------------------------------------------------------ | ----------- | ----------------------------------------- |
| `registerObjectLayer(to, itemId, metadataCid, supply, data)` | `onlyOwner` | Register a new item + mint initial supply |
| `batchRegisterObjectLayers(to, items[])`                     | `onlyOwner` | Batch registration + mint                 |
| `mint(to, tokenId, amount, data)`                            | `onlyOwner` | Mint additional supply for existing token |
| `mintBatch(to, ids[], amounts[], data)`                      | `onlyOwner` | Batch mint                                |
| `burn(from, tokenId, amount)`                                | holder      | Burn tokens                               |
| `burnBatch(from, ids[], amounts[])`                          | holder      | Batch burn                                |
| `setTokenMetadataCID(tokenId, metadataCid)`                  | `onlyOwner` | Update IPFS metadata CID                  |
| `pause()` / `unpause()`                                      | `onlyOwner` | Emergency transfer freeze                 |
| `computeTokenId(itemId)`                                     | pure        | Deterministic token ID computation        |
| `getItemId(tokenId)`                                         | view        | Reverse lookup tokenId → itemId           |
| `getTokenCID(tokenId)`                                       | view        | Get canonical IPFS CID for token          |

### URI Resolution

```solidity
// uri(tokenId) returns: {baseTokenURI}{_tokenCIDs[tokenId]}
// e.g.: "ipfs://bafkrei...json"
// The returned URI resolves to the full ObjectLayer data JSON (AtomicPrefab)
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

```bash
cd hardhat
npx hardhat test

# With gas report
REPORT_GAS=true npx hardhat test
```

Tests use **Mocha + ethers v6** via `@nomicfoundation/hardhat-toolbox-mocha-ethers`. The `hardhat` in-process network simulates Besu behavior.

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
# Register a non-fungible unique item (uses canonical CID from MongoDB)
cyberia chain register --item-id legendary-hatchet --from-db --supply 1

# Register semi-fungible stackable resource
cyberia chain register --item-id gold-ore --from-db --supply 1000000

# Manual CID override
cyberia chain register --item-id legendary-hatchet --metadata-cid bafkrei... --supply 1

# Batch-register multiple items
cyberia chain batch-register --from-db --items '[{"itemId":"wood","supply":500000},{"itemId":"stone","supply":500000}]'

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
