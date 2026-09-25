# Wallet and Identity

Domain-neutral wallet, sign-in and action signing for every domain this engine serves. One player
address works across `objectlayer.org`, `itemledger.com`, `cryptokoyn.net` and
`cyberiaonline.com`. No domain holds player key material.

**Threat model summary:** the signing key stays in the browser. The server verifies signatures and
issues session tokens; it never receives a private key, a mnemonic, a seed or a keystore
passphrase. An embedded wallet encrypts its keystore at rest in IndexedDB, which protects a lost
device but not a compromised one.

---

## Table of Contents

- [Components](#components)
- [Identity model](#identity-model)
- [External wallets](#external-wallets)
- [Embedded wallet](#embedded-wallet)
- [Sign-in (ERC-4361)](#sign-in-erc-4361)
- [Action signing (EIP-712)](#action-signing-eip-712)
- [Account persistence](#account-persistence)
- [Key storage threat model](#key-storage-threat-model)
- [Operational key separation](#operational-key-separation)
- [Operational invariants](#operational-invariants)

---

## Components

| Path                                             | Role                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/client/components/wallet/WalletProvider.js` | Capability abstraction, EIP-1193 adapter, EIP-6963 discovery, CAIP-2 and CAIP-10 helpers |
| `src/client/components/wallet/EmbeddedWallet.js` | BIP-39/32/44 wallet, encrypted IndexedDB vault, keystore export and import               |
| `src/client/components/wallet/WalletView.js`     | Sign-in UI and session binding                                                           |
| `src/server/security/siwe.js`                    | ERC-4361 message build, parse and verify                                                 |
| `src/server/security/typed-data.js`              | EIP-712 domain, action types, recovery, ERC-1271 hook                                    |
| `src/api/wallet-account/`                        | CAIP-10 public account record and the sign-in endpoints                                  |
| `src/client/services/wallet-account/`            | Client calls for challenge, sign-in and read                                             |

A client enables the stack by listing the `wallet` components (`WalletProvider`, `EmbeddedWallet`,
`WalletView`) and the `wallet-account` service in its conf; `cryptokoyn` does. Every host serves the
`wallet-account` API. No domain code knows which wallet signs.

## Identity model

| value         | form                            | meaning                                      |
| ------------- | ------------------------------- | -------------------------------------------- |
| address       | `0x…` checksummed               | the player                                   |
| `chainId`     | CAIP-2 `eip155:<id>`            | the chain the account is named on            |
| `accountId`   | CAIP-10 `eip155:<id>:<address>` | the portable account name, unique per record |
| session token | server-issued                   | the credential later requests carry          |

The signature authenticates once. It is never the session token, and no request replays it as a
credential.

## External wallets

`discoverExternalWallets({ target, timeoutMs })` announces an EIP-6963 request and collects every
provider that answers, then falls back to `window.ethereum` when no provider announces.
`externalWalletProvider({ provider, info })` wraps one EIP-1193 provider and exposes the shared
capabilities: `requestAccounts`, `signMessage`, `signTypedData` and `sendTransaction`.

## Embedded wallet

`EmbeddedWallet` derives accounts on the Ethereum path `m/44'/60'/0'/0/x`. It is deterministic: the
same mnemonic and index always give the same address.

| Call                                                            | Effect                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `create({ accountIndex })`                                      | New BIP-39 mnemonic; returns the mnemonic, address and path. Nothing is stored |
| `restore({ mnemonic, accountIndex })`                           | Validates the phrase and derives the account                                   |
| `save({ mnemonic, passphrase, accountIndex })`                  | Encrypts a Web3 Secret Storage keystore into IndexedDB                         |
| `unlock({ passphrase })`                                        | Decrypts the keystore; the signer lives in memory only                         |
| `lock()`                                                        | Drops the in-memory signer                                                     |
| `exportKeystore()` / `importKeystore({ keystore, passphrase })` | Player-held backup and recovery                                                |
| `forget()`                                                      | Clears the vault                                                               |

`provider({ chainId })` returns the same capability surface as an external wallet, so sign-in and
action signing take one code path.

## Sign-in (ERC-4361)

```
client                          engine
  │ POST /wallet-account/challenge
  │─────────────────────────────▶ build the message, store the nonce with a TTL
  │◀───────────────────────────── { domain, uri, chainId, nonce, issuedAt, expirationTime, message }
  │ wallet signs the message
  │ POST /wallet-account/sign-in
  │─────────────────────────────▶ consume the nonce, check domain, uri, chainId, issuedAt,
  │                               expiry, then recover the address
  │◀───────────────────────────── { account, session }
```

The nonce is single use and lives in Valkey when it is enabled, otherwise in process memory. A
replayed message is refused because the challenge is already consumed. `session` is `null` when no
user is bound to the account yet.

## Action signing (EIP-712)

`typed-data.js` holds one domain builder and the action type sets (`ItemTransfer`, `CraftIntent`,
`MarketOrder`). Each payload carries a `deadline`, so one signature authorizes one action for a
bounded time. `verifyTypedAction` recovers the signer and, when a `contractVerifier` is supplied,
falls back to ERC-1271 for smart-contract accounts.

## Account persistence

`WalletAccount` stores public metadata only: `accountId`, `address`, `chainNamespace`, `chainId`,
`walletType`, `providerType`, `derivationPath`, `userId` and `lastSeenAt`. The schema is
`strict: 'throw'` and rejects `privateKey`, `mnemonic`, `seed`, `keystore`, `secret`, `jwk` and
`recoveryPhrase` before validation. `User.wallet.accountId` binds an account to a user.

## Key storage threat model

| Attack                             | Result                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Server or database breach          | No key material to steal. Accounts and session records only             |
| Network capture                    | The signature and message are public. The key never crosses the network |
| Stolen device, vault locked        | The attacker holds an encrypted keystore and needs the passphrase       |
| Compromised device, vault unlocked | The signer is in memory. The account is compromised                     |
| Malicious extension or page script | An external wallet still prompts; an unlocked embedded vault does not   |
| Lost passphrase                    | Only the exported keystore or the mnemonic recovers the account         |

Browser storage encryption is **not** hardware-wallet security. Tell players who hold value to use
an external or hardware wallet. The embedded wallet exists so a new player can start without one.

## Operational key separation

| Key set              | Holder                 | Purpose                                 | Migration target                     |
| -------------------- | ---------------------- | --------------------------------------- | ------------------------------------ |
| Player               | Player browser         | Sign-in and action signatures           | Stays with the player                |
| Relayer              | Engine service process | Pay gas, submit verified player intents | Kubernetes Secret, then Vault or KMS |
| Validator / deployer | Chain operator         | Produce blocks, deploy contracts        | HSM or an offline signer             |

The three sets never share a key. A relayer key submits only intents that already carry a valid
player signature. Relayer and validator secrets come from the environment, never from the repo,
and follow the `host` and `secret` configuration domains in
[SOPS + Age Secret Management](../how-to/manage-secrets-with-sops.md).

## Operational invariants

1. No database in any domain stores a private key, mnemonic, seed, keystore or recovery phrase.
2. No server process receives player key material, for any reason.
3. A signature never serves as a session token.
4. One EIP-712 signature authorizes one action, within its deadline.
5. A sign-in nonce is single use and expires.
6. External and embedded wallets expose one capability surface; callers do not branch on the type.
7. Player, relayer and validator keys stay separate.
