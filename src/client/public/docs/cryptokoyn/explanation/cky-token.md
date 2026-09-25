# The CKY token

CKY is token id 0 of one ERC-1155 contract that also carries every registered Object Layer.
This is what that means for the currency domain, and what it depends on before any balance
can be read.

## Architecture

```
wallet (external or embedded)          the key, in the browser
  │  EIP-1193 / EIP-6963  ·  BIP-39 / BIP-32 / BIP-44
  ▼
cryptokoyn.net client                  provider choice, vault, sign-in
  │  POST /api/v1/wallet-account/challenge   → ERC-4361 message + single-use nonce
  │  POST /api/v1/wallet-account/sign-in     → signature verified, session token issued
  ▼
engine (cryptokoyn.net host)           src/api/wallet-account, src/server/security/siwe.js
  │  WalletAccount: accountId, address, chainId, walletType, providerType, derivationPath
  ▼
MongoDB (cryptokoyn.net)               public account metadata only

                 ─── Phase 3, not wired yet ───
ObjectLayerToken (ERC-1155) on Hyperledger Besu, chainId 777771, gasPrice 0
  token id 0 = CKY, 10,000,000 × 10^18 initial supply
  token ids ≥ 1 = registered Object Layers, id = uint256(contentHash)
```

One contract carries both: CKY is token id 0 and every registered Object Layer is a token id
derived from its content digest. That is why the currency domain and the asset registry share a
chain and never share a database. [ItemLedger](../../item-ledger/overview/index.md) holds the
registry side; [the Hardhat module](../../item-ledger/reference/object-layer-token-contract.md) holds the contract, its
networks and its deployment artifact.

### Contract facts this domain depends on

| Fact            | Value                                           |
| --------------- | ----------------------------------------------- |
| Token id of CKY | `0` (`uint256 public constant CRYPTOKOYN = 0`)  |
| Initial supply  | `10_000_000 * 1e18`                             |
| Decimals        | 18                                              |
| Balance read    | `balanceOf(address, 0)`                         |
| Transfer        | `safeTransferFrom` / `safeBatchTransferFrom`    |
| Mint and burn   | `mint` is `onlyOwner`; a holder burns their own |
| Emergency stop  | `pause()` / `unpause()`, owner only             |

Until a deployment artifact exists for a network
(`hardhat/deployments/<network>-ObjectLayerToken.json`), every one of those reads is unavailable,
and the domain reports that instead of guessing.

## Operations

The chain toolchain lives in the Cyberia CLI, because Cyberia ships the chain
([CLI reference](../../cyberia/reference/cyberia-cli.md)):

```bash
cyberia chain deploy --network besu-k8s          # deploy ObjectLayerToken, mint 10M CKY
cyberia chain balance --address 0x… --token-id 0 # a CKY balance, read from chain
cyberia chain transfer --token-id 0 --from 0x… --to 0x… --amount 100
cyberia chain status --network besu-k8s          # contract, supply and deployment artifact
cyberia chain key-gen                            # an operator key, never a player key
```

Three key sets never mix: the player key stays in the browser, the relayer key pays gas, and the
validator/deployer key belongs to the chain operator.
