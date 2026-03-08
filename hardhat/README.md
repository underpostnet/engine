# Cyberia Hardhat Module

Hardhat project for the **Cyberia Online Object Layer Token** (ERC-1155) ecosystem deployed on **Hyperledger Besu** (IBFT2/QBFT) private networks.

This module contains the Solidity smart contract, deployment scripts, tests, and network configuration for the unified `ObjectLayerToken` contract that manages the entire Cyberia token economy:

| Token Type | Token ID | Supply | Description |
|---|---|---|---|
| **Fungible (CKY)** | `0` | 10,000,000 × 10¹⁸ | CryptoKoyn — in-game currency managed via cryptokoyn.net |
| **Semi-fungible** | `computeTokenId(itemId)` | > 1 | Stackable resources (wood, stone, potions) via itemledger.com |
| **Non-fungible** | `computeTokenId(itemId)` | = 1 | Unique items (legendary weapons, skins) via itemledger.com |

See [WHITE-PAPER.md](./WHITE-PAPER.md) for the full protocol specification.

---

## Project Structure

```
hardhat/
├── contracts/
│   └── ObjectLayerToken.sol      # Unified ERC-1155 multi-token contract
├── scripts/
│   └── deployObjectLayerToken.js # Deployment script (ESM)
├── test/
│   └── ObjectLayerToken.js       # Comprehensive test suite
├── deployments/                  # JSON deployment artifacts (per-network)
├── networks/
│   └── besu-object-layer.network.json  # Besu genesis & network config
├── ignition/
│   └── modules/
│       └── ObjectLayerToken.js   # Hardhat Ignition module (alternative deploy)
├── hardhat.config.js             # Hardhat configuration (ESM)
└── package.json
```

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** or **yarn**
- For on-chain deployment: a running Hyperledger Besu network (IBFT2/QBFT)

Install dependencies:

```bash
cd hardhat
npm install
```

---

## 1. Ethereum Key Management

The Cyberia ecosystem uses **secp256k1 key pairs** as universal identity. The Cyberia CLI provides a key generation command:

### Generate a new key pair (console only)

```bash
# Print a new Ethereum key pair to the console without saving
cyberia chain key-gen

# Output:
#   Address    : 0x71C7656EC7ab88b098defB751B7401B5f6d8976F
#   Private Key: 0x4c0883a69102937d6231471b5dbb...
#   Public Key : 0x04b9e72dfd423bcf95b3...
#   Mnemonic   : word1 word2 word3 ...
```

### Generate and save to default paths

```bash
cyberia chain key-gen --save
```

This writes two separate files:

**Private data** → `./engine-private/eth-networks/besu/<address>.key.json`

```json
{
  "address": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  "privateKey": "0x4c0883a69102937d6231471b5dbb...",
  "mnemonic": "word1 word2 word3 ..."
}
```

**Public data** → `./hardhat/deployments/<address>.pub.json`

```json
{
  "address": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  "publicKey": "0x04b9e72dfd423bcf95b3..."
}
```

> **⚠ Security:** Private key files are stored under `./engine-private/` which should never be committed to version control. The coinbase deployer key is read from `engine-private/eth-networks/besu/coinbase` — a file outside the repository.

### Generate with custom paths

Override either or both default output paths:

```bash
# Custom private key path only
cyberia chain key-gen --private-path ./my-secrets/deployer.key.json

# Custom public key path only
cyberia chain key-gen --public-path ./public/deployer.pub.json

# Both custom paths
cyberia chain key-gen \
  --private-path ./my-secrets/deployer.key.json \
  --public-path ./public/deployer.pub.json
```

Providing `--private-path` or `--public-path` implies `--save` automatically.

### Use an existing key for deployment

Set the coinbase private key file that `hardhat.config.js` reads:

```bash
mkdir -p ./engine-private/eth-networks/besu
echo "0xYOUR_PRIVATE_KEY_HEX" > ./engine-private/eth-networks/besu/coinbase
```

---

## 2. Compile & Test

```bash
# Compile Solidity contracts
cyberia chain compile
# or directly:
npx hardhat compile

# Run the full test suite (local Hardhat network)
cyberia chain test
# or directly:
npx hardhat test test/ObjectLayerToken.js

# Generate coverage report
npx hardhat coverage
```

---

## 3. Deploy Besu Network & Contract

### Deploy the Besu blockchain (Kubernetes)

```bash
# Deploy IBFT2 consensus network
cyberia chain deploy
# or with QBFT consensus
cyberia chain deploy --consensus qbft

# Remove the network
cyberia chain remove
```

### Deploy the ObjectLayerToken contract

The contract deploys with:
- 10,000,000 CKY (token ID 0) minted to the deployer
- Base IPFS URI `ipfs://` for metadata resolution

```bash
# Deploy to local Besu IBFT2
cyberia chain deploy-contract --network besu-ibft2

# Deploy to Besu QBFT
cyberia chain deploy-contract --network besu-qbft

# Deploy to Kubernetes-exposed Besu
cyberia chain deploy-contract --network besu-k8s

# Deploy to local Hardhat network (for testing)
npx hardhat run scripts/deployObjectLayerToken.js --network hardhat
```

A deployment artifact is written to `deployments/<network>-ObjectLayerToken.json`:

```json
{
  "network": "besu-ibft2",
  "chainId": "777771",
  "contract": "ObjectLayerToken",
  "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "baseURI": "ipfs://",
  "cryptokoynTokenId": "0",
  "initialCryptokoynSupply": "10000000000000000000000000",
  "timestamp": "2026-03-08T01:11:37.978Z"
}
```

### Check chain status

```bash
cyberia chain status --network besu-ibft2
```

---

## 4. Fungible Token: CryptoKoyn (CKY)

CKY is token ID `0` — the fungible in-game currency with 18-decimal precision, managed via **cryptokoyn.net**.

### Query CKY balance

```bash
cyberia chain balance --address 0xYourAddress --token-id 0 --network besu-ibft2
```

### Mint additional CKY

```bash
# Mint 1000 CKY (with 18 decimals: 1000 * 10^18)
cyberia chain mint \
  --token-id 0 \
  --to 0xPlayerAddress \
  --amount 1000000000000000000000 \
  --network besu-ibft2
```

### Transfer CKY

```bash
cyberia chain transfer \
  --from 0xDeployerAddress \
  --to 0xPlayerAddress \
  --token-id 0 \
  --amount 500000000000000000000 \
  --network besu-ibft2
```

### Burn CKY (reduce circulating supply)

```bash
cyberia chain burn \
  --address 0xHolderAddress \
  --token-id 0 \
  --amount 100000000000000000000 \
  --network besu-ibft2
```

---

## 5. Semi-Fungible Tokens: Stackable Resources

Semi-fungible tokens have supply > 1 and represent stackable in-game resources (wood, stone, gold ore, health potions). Managed via **itemledger.com**.

### Register a semi-fungible resource

```bash
# Register "gold-ore" with initial supply of 1,000,000 units
cyberia chain register \
  --item-id gold-ore \
  --metadata-cid bafkreigold0remetadata... \
  --supply 1000000 \
  --network besu-ibft2
```

### Batch-register multiple resources

```bash
cyberia chain batch-register \
  --items '[
    {"itemId": "wood", "cid": "bafkreiwood...", "supply": 500000},
    {"itemId": "stone", "cid": "bafkreistone...", "supply": 500000},
    {"itemId": "health-potion", "cid": "bafkreihp...", "supply": 100000}
  ]' \
  --network besu-ibft2
```

### Mint more of an existing resource

```bash
# Get the token ID first (deterministic from keccak256)
# Then mint additional supply
cyberia chain mint \
  --token-id <tokenId-of-gold-ore> \
  --to 0xPlayerAddress \
  --amount 500 \
  --network besu-ibft2
```

### Burn resources (crafting cost)

```bash
# Player burns 25 wood for crafting
cyberia chain burn \
  --address 0xPlayerAddress \
  --token-id <tokenId-of-wood> \
  --amount 25 \
  --network besu-ibft2
```

---

## 6. Non-Fungible Tokens: Unique Items

Non-fungible tokens have supply = 1 and represent unique items (legendary weapons, character skins). Managed via **itemledger.com**.

### Register a non-fungible unique item

```bash
# Register a legendary hatchet (supply = 1, unique)
cyberia chain register \
  --item-id legendary-hatchet \
  --metadata-cid bafkreihatchetmeta... \
  --supply 1 \
  --network besu-ibft2
```

### Transfer a unique item (quest reward / trade)

```bash
cyberia chain transfer \
  --from 0xServerRelayer \
  --to 0xPlayerAddress \
  --token-id <tokenId-of-legendary-hatchet> \
  --amount 1 \
  --network besu-ibft2
```

### Burn a unique item (destroy)

```bash
cyberia chain burn \
  --address 0xPlayerAddress \
  --token-id <tokenId-of-legendary-hatchet> \
  --amount 1 \
  --network besu-ibft2
```

---

## 7. Object Layer Ecosystem Integration

Each on-chain token corresponds to an off-chain **Object Layer** document with four semantic realities:

```
AtomicPrefab = {
  data: {
    stats:  { effect, resistance, agility, range, intelligence, utility },  // Mechanical
    item:   { id, type, description, activable },                           // Experiential (UX)
    ledger: { type: "ERC1155", address: "0x...", tokenId: "uint256" },      // Economic
    render: { cid: "bafk...atlas.png", metadataCid: "bafk...meta" }        // Presentational
  }
}
```

**Full lifecycle:** Register → Mint → Transfer → Burn

1. **Game server** creates the Object Layer (stats, item, render) and pins assets to IPFS
2. **Server relayer** calls `registerObjectLayer()` on Besu — assigns deterministic token ID
3. **MongoDB** is updated with `ledger: { type: "ERC1155", address, tokenId }`
4. **itemledger.com** indexes the new item via `ObjectLayerRegistered` event
5. **Players** trade via `safeTransferFrom`, craft via burn + mint, and earn via minting

### Token ID computation

Token IDs are deterministic from item identifiers:

```
tokenId = uint256(keccak256("cyberia.object-layer:" + itemId))
```

This ensures the same item ID always maps to the same token ID across all services.

---

## 8. Governance

### Emergency pause (freeze all transfers)

```bash
cyberia chain pause --network besu-ibft2
```

### Resume transfers

```bash
cyberia chain unpause --network besu-ibft2
```

---

## Network Configuration

| Network | RPC URL | Chain ID | Description |
|---|---|---|---|
| `hardhat` | in-process | 31337 | Local testing (default) |
| `besu-ibft2` | `http://127.0.0.1:8545` | 777771 | Local Besu IBFT2 |
| `besu-qbft` | `http://127.0.0.1:8545` | 777771 | Local Besu QBFT |
| `besu-k8s` | `http://127.0.0.1:30545` | 777771 | Kubernetes NodePort |

Override RPC URLs via environment variables:

```bash
export BESU_IBFT2_RPC_URL=http://10.0.0.5:8545
export BESU_IBFT2_CHAIN_ID=777771
```

---

## References

- [WHITE-PAPER.md](./WHITE-PAPER.md) — Full Object Layer Token protocol specification
- [OpenZeppelin ERC-1155](https://docs.openzeppelin.com/contracts/5.x/erc1155)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Hyperledger Besu](https://besu.hyperledger.org/)
- [EIP-1155: Multi Token Standard](https://eips.ethereum.org/EIPS/eip-1155)
- [EIP-712: Typed Structured Data Signing](https://eips.ethereum.org/EIPS/eip-712)