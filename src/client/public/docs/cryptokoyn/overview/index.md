---
title: CryptoKoyn
domain: CryptoKoyn
identity: CKY finance hub
maturity: Pre-Alpha
order: 4
---

# CryptoKoyn

CryptoKoyn (CKY) is the fungible currency of the platform, and `cryptokoyn.net` is the domain
that serves it. It answers what a player holds, how value enters and leaves the economy, and how
an address proves it is the holder.

## Purpose

CKY is the settlement currency the rest of the ecosystem prices work in. The domain serves the
wallet surface today and the currency itself once a contract is deployed.

## Responsibilities

| cryptokoyn.net owns                                         | cryptokoyn.net does not own                            |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| CKY: token id 0 of `ObjectLayerToken`                       | Token ids ≥ 1 — those are ItemLedger's                 |
| The wallet UI: provider choice, sign-in, the embedded vault | The player's keys — they never leave the browser       |
| The public account record (CAIP-10 metadata)                | Any secret material                                    |
| CKY supply, staking, governance and fiat bridges (Phase 3)  | Object Layer definitions — those are objectlayer.org's |
| Nothing of the game simulation                              | Progress, inventory and quests — those are Cyberia's   |

The domain serves `core`, `file`, `user`, `document` and `wallet-account`. It reads no other
domain's database, and no other domain reads its own.

## Boundaries

CKY is token id 0 of the shared `ObjectLayerToken` contract; every token id above zero is an
ItemLedger asset. The coin balance Cyberia runs off-chain is progress state, not CKY: the two
never mix.

## Current state — pre Open Alpha

**This domain is a foundation, not a finished product.** It stands by while the platform runs
pre Open Alpha and Open Alpha, and it will stay standing by until Phase 3 of the
[roadmap](../../cyberia/explanation/roadmap.md) opens on-chain ownership.

What that means, exactly:

| Part                                           | State                                             | Where it lives                                             |
| ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Wallet identity and sign-in                    | Working                                           | `src/client/components/wallet/`, `src/api/wallet-account/` |
| Account record (CAIP-10)                       | Working                                           | `src/api/wallet-account/wallet-account.model.js`           |
| `ObjectLayerToken` contract                    | Written, tested, not deployed to a public network | `hardhat/contracts/ObjectLayerToken.sol`                   |
| CKY balance, staking, governance, fiat bridges | Not implemented                                   | Phase 3                                                    |
| Marketplace and analytics                      | Not implemented                                   | Phase 3                                                    |

No CKY balance is authoritative before a contract is deployed and indexed. In Open Alpha the
domain holds no currency state at all: it serves the wallet, the account record and this
document. An empty holding is a valid state, and the client says so rather than showing a zero it
cannot prove.

The off-chain economy Cyberia runs in the meantime — coin balance, fountain and sink — is Cyberia
state in Cyberia's database, not CKY. [Off-chain economy](../../cyberia/explanation/off-chain-economy.md)
holds that model. The two never mix: a coin balance is progress, a CKY balance is ownership.

## Main components

| Component          | What it is                                           |
| ------------------ | ---------------------------------------------------- |
| Wallet surface     | Provider choice, SIWE sign-in and the embedded vault |
| `WalletAccount`    | The public CAIP-10 account record                    |
| `ObjectLayerToken` | The ERC-1155 contract that carries CKY as token id 0 |

## Documentation map

| Category    | What it holds                                                  |
| ----------- | -------------------------------------------------------------- |
| Explanation | The CKY token, wallet integration and the decisions still open |
