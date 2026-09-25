# Wallet integration

A wallet is external or embedded, and both answer the same capability set, so no domain code
knows which one signs. This is that contract, the custody rules it keeps, and the identity a
signature establishes.

## Wallet integration

A wallet is external or embedded. Both answer the same capability set, so no domain code knows
which one signs (`src/client/components/wallet/WalletProvider.js`).

| Layer                | Standard                                      | Component                                           |
| -------------------- | --------------------------------------------- | --------------------------------------------------- |
| Provider abstraction | capability set, not vendor checks             | `WalletProvider.js`                                 |
| External wallets     | EIP-1193 + EIP-6963 discovery                 | `discoverExternalWallets`, `externalWalletProvider` |
| Embedded wallet      | BIP-39 / BIP-32 / BIP-44 (`m/44'/60'/0'/0/x`) | `EmbeddedWallet.js`                                 |
| Vault                | Web3 Secret Storage keystore in IndexedDB     | `EmbeddedWallet.save` / `unlock` / `exportKeystore` |
| Sign-in              | ERC-4361 (SIWE)                               | `src/server/security/siwe.js`                       |
| Action signing       | EIP-712 typed data with a deadline            | `src/server/security/typed-data.js`                 |
| Account record       | CAIP-10 public metadata                       | `src/api/wallet-account/`                           |
| View                 | provider choice, sign-in, vault               | `WalletView.js`                                     |

### Key custody

1. The private key, mnemonic, seed and keystore passphrase never leave the browser.
2. No domain database stores `privateKey`, `mnemonic`, `seed`, `keystore`, `jwk` or a recovery
   phrase. The `WalletAccount` model rejects those fields on write.
3. The vault holds the keystore encrypted at rest. Decrypted key material lives in memory only
   while the wallet is unlocked, and locking clears the signer.
4. A signature authenticates once. The server then issues a session token, and no request replays
   a signature as a credential.
5. Browser encryption is not hardware-wallet security. A player who holds value should use an
   external wallet.
6. Keystore export and import are the recovery path. The server cannot provide one.

### Identity

| Identity    | Names                 | Computed from                         |
| ----------- | --------------------- | ------------------------------------- |
| `address`   | one player            | a secp256k1 key pair                  |
| `accountId` | one account, portably | CAIP-10 `eip155:<chainId>:<address>`  |
| `tokenId`   | one asset type        | `uint256(contentHash)`                |
| `olCid`     | one definition        | CIDv1 raw sha2-256 of canonical bytes |

The address is the account. The session token is not an identity, and a signature is not a
credential.
