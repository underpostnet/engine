---
title: Ecosystem landscape
domain: Ecosystem
identity: How the six domains relate, what each owns, and which integrations are live
order: 0
---

# Ecosystem landscape

<div align="center">

<table>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://underpost.net">
        <img src="https://underpost.net/favicon.ico" width="28" alt="Underpost favicon" /><br/>
        <strong>Underpost</strong>
      </a>
      <br/><sub>Shared tooling, engineering notes and architecture.</sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://www.nexodev.org">
        <img src="https://www.nexodev.org/favicon.ico" width="28" alt="Nexodev favicon" /><br/>
        <strong>Nexodev</strong>
      </a>
      <br/><sub>ERP, CRM, DevOps and cloud services.</sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://objectlayer.org">
        <img src="https://objectlayer.org/favicon.ico" width="28" alt="Object Layer favicon" /><br/>
        <strong>Object Layer</strong>
      </a>
      <br/><sub>Canonical definitions and identity for digital objects.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%" valign="top">
      <a href="https://www.cyberiaonline.com">
        <img src="https://www.cyberiaonline.com/favicon.ico" width="28" alt="Cyberia favicon" /><br/>
        <strong>Cyberia</strong><br/>
      </a>
      <br/><sub>Persistent worlds, game runtime and creation tools.</sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://cryptokoyn.net">
        <img src="https://cryptokoyn.net/favicon.ico" width="28" alt="CryptoKoyn favicon" /><br/>
        <strong>CryptoKoyn</strong>
      </a>
      <br/><sub>Wallet identity and CKY finance.</sub>
    </td>
    <td align="center" width="33%" valign="top">
      <a href="https://itemledger.com">
        <img src="https://itemledger.com/favicon.ico" width="28" alt="ItemLedger favicon" /><br/>
        <strong>ItemLedger</strong>
      </a>
      <br/><sub>Digital assets, ownership and provenance.</sub>
    </td>
  </tr>
</table>
</div>

## The domains

The platform is six domains. Each one owns a body of content, a database and an API, and each
one is documented on its own terms. This states what every domain is, what it owns, how the
domains reach each other, and which of those integrations exist today.

| Domain                                               | Identity                                                                 | Maturity                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| [Object Layer](../../object-layer/overview/index.md) | Canonical global Object Layer registry and protocol                      | Open Alpha               |
| [ItemLedger](../../item-ledger/overview/index.md)    | On-chain Object Layer registry, ownership and provenance projections     | Pre-Alpha                |
| [Cyberia](../../cyberia/overview/index.md)           | Runtime, Game Studio, Cyberia Engine and Cyberia CLI                     | Open Alpha               |
| [CryptoKoyn](../../cryptokoyn/overview/index.md)     | CKY finance hub                                                          | Pre-Alpha                |
| [Nexodev](../../nexodev/overview/index.md)           | ERP/CRM, DevOps and cloud services on the shared Underpost CLI           | Active development       |
| [Underpost](../../underpost/overview/index.md)       | Engineering log, development journal, technical lab, engineering history | Engineering / continuous |

## What each domain owns

| Domain       | Owns                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Object Layer | The canonical payload and its schema, content identity, the definition lifecycle, canonical storage        |
| ItemLedger   | On-chain registration, the binding from a definition to a token type, ownership and provenance projections |
| Cyberia      | The game runtime, the Game Studio, the Cyberia Engine and CLI, world content and item bindings             |
| CryptoKoyn   | CKY — token id 0 — the wallet surface and the public account record                                        |
| Nexodev      | ERP and CRM products, DevOps and cloud service delivery, infrastructure procedure                          |
| Underpost    | The shared CLI, the engineering record, laboratory notes and architecture decisions                        |

No domain opens another domain's database. Every cross-domain read is an HTTP call to the owning
domain under `/api/v1/`, with a timeout, a bounded retry and a read cache.

## How the domains interact

```text
            Object Layer ──────────── canonical definitions, by content identity
                 │                         │
     consumes    │                         │ registers (future)
                 ▼                         ▼
             Cyberia                  ItemLedger ───── ownership and provenance
                 │                         │                  projections
                 │ settles in              │ shares one ERC-1155 contract
                 ▼                         ▼
            CryptoKoyn ──────── CKY, token id 0

        Nexodev and Underpost carry the platform every domain above runs on:
        Underpost owns the shared CLI and the engineering record;
        Nexodev delivers ERP/CRM, DevOps and cloud services with it.
```

| Integration                                       | State   | Where it is documented                                                                    |
| ------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| Cyberia consumes canonical Object Layers          | Current | [Cyberia domain boundaries](../../cyberia/explanation/domain-boundaries.md)               |
| Cyberia binds item labels to definitions          | Current | [Cyberia domain boundaries](../../cyberia/explanation/domain-boundaries.md)               |
| ItemLedger registers a definition on chain        | Future  | [Registration and ownership](../../item-ledger/explanation/registration-and-ownership.md) |
| ItemLedger projects ownership and provenance      | Future  | [Registration and ownership](../../item-ledger/explanation/registration-and-ownership.md) |
| CryptoKoyn serves CKY balances and finance        | Future  | [CryptoKoyn White Paper](../../cryptokoyn/explanation/white-paper.md)                     |
| Wallet sign-in across every domain                | Current | [Wallet integration](../../cryptokoyn/explanation/wallet-integration.md)                  |
| Nexodev operates the platform with the shared CLI | Current | [Underpost CLI reference](../../nexodev/reference/underpost-cli.md)                       |

## Identity across the ecosystem

Four identities exist. They never substitute for one another.

| Identity    | Names                       | Derived from                                  | Owner        |
| ----------- | --------------------------- | --------------------------------------------- | ------------ |
| `olCid`     | one immutable definition    | CIDv1 raw sha2-256 of the canonical payload   | Object Layer |
| `tokenId`   | one on-chain asset type     | `uint256(contentHash)`                        | ItemLedger   |
| `accountId` | one player account          | CAIP-10 `eip155:<chainId>:<address>`          | CryptoKoyn   |
| `itemId`    | a human label, never unique | authored, bound to one `olCid` by the catalog | Cyberia      |

## Maturity

Maturity is stated per domain and repeated in each domain's overview. A Pre-Alpha domain is not
production-ready: its contracts are written and tested, and nothing depends on them yet.

| Maturity                 | Meaning                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| Open Alpha               | Implemented and in use; the surface is stable enough to build on      |
| Pre-Alpha                | Written and tested, not deployed; no production traffic depends on it |
| Active development       | Delivered continuously against real work                              |
| Engineering / continuous | A running record rather than a released product                       |
