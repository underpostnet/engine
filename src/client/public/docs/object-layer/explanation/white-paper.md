---
title: Object Layer Protocol White Paper
order: 1
---

<p align="center">
  <img src="https://objectlayer.org/android-chrome-256x256.png" alt="Object Layer Protocol" width="128">
</p>

<div align="center">

# Object Layer Protocol

### Semantic Identity and Interoperability for Composable Digital Objects

**Version:** 3.4.5 Draft  
**Status:** Technical Proposal  
**Authors:** Underpost Engineering

</div>

---

## Abstract

The **Object Layer Protocol (OLP)** defines a runtime-agnostic model for digital objects that can be **identified, described, rendered, composed, and independently integrated across applications**.

The protocol separates **object definition** from **ownership** and **runtime state**. A canonical object definition, called an **AtomicPrefab**, contains the semantic and presentational information required to understand an object. Its canonical bytes are content-addressed to produce a stable Object Layer identity (`olCid` / CID).

Ownership, balances, transfer history, and other mutable economic state are deliberately external to the canonical object definition. This permits the same Object Layer identity to be bound to different ledgers, markets, or applications without changing the object itself.

The protocol is designed for decentralized and interoperable systems. A reference implementation is provided by **Cyberia**, where Object Layers are used as composable game entities, but Cyberia is an implementation example rather than a protocol dependency.

---

## 1. Problem

Digital assets are commonly split across unrelated systems:

- a database defines their semantics;
- an application defines their behavior;
- an image service defines their appearance;
- a token contract defines ownership;
- each runtime invents its own identifiers and metadata model.

This creates integration boundaries where an application can own or display an asset without possessing a portable description of what that asset actually is.

The protocol addresses five related problems:

1. **Semantic identity** - an object needs a stable identity independent of a display name or database record.
2. **Content integrity** - the identity must be derived from canonical content.
3. **Composability** - independently defined objects must be stackable into larger entities.
4. **Runtime independence** - semantic object definitions should not depend on one particular engine.
5. **Economic separation** - ownership and mutable ledger state should not alter canonical object identity.

---

## 2. Design Goals

The Object Layer Protocol is designed around the following principles.

### 2.1 Content-addressed identity

An Object Layer is identified by its canonical content, not by a mutable database identifier.

### 2.2 Semantic completeness

An Object Layer contains enough information for a compatible runtime to understand the object without relying on an application-specific name alone.

### 2.3 Composition

A larger digital entity may be represented as an ordered stack of Object Layers.

### 2.4 Separation of concerns

Canonical object content, rendering references, runtime state, and economic ownership are separate concerns.

### 2.5 Interoperability

Any implementation that understands the protocol and the relevant semantic profile can resolve and use the same Object Layer definition.

### 2.6 Decentralization

The protocol is designed so identity and content integrity do not depend on one central application database. Storage and ownership can be supplied by independent infrastructure.

---

## 3. Object Layer Model

### 3.1 AtomicPrefab

The protocol atom is the **AtomicPrefab**: a canonical, immutable definition of one Object Layer.

A minimal representation is:

```json
{
  "schemaVersion": 1,
  "profile": {
    "id": "example",
    "version": 1
  },
  "data": {
    "item": {
      "id": "hatchet",
      "type": "weapon",
      "description": "A rusted hatchet"
    },
    "stats": {
      "effect": 7,
      "resistance": 8
    },
    "render": {
      "cid": "bafkrei..."
    }
  }
}
```

The exact vocabulary of `stats`, `item.type`, and other profile-defined fields is delegated to a **semantic profile**.

The Object Layer Protocol therefore standardizes the object boundary and identity model without forcing every runtime to use the same gameplay vocabulary.

### 3.2 Three Canonical Content Dimensions

An AtomicPrefab can contain three primary content dimensions:

| Dimension          | Purpose                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| **Semantic**       | Identifiers, type information, descriptions and profile-specific meaning |
| **Mechanical**     | Structured attributes interpreted by a semantic profile                  |
| **Presentational** | References required to render the object                                 |

These dimensions are part of the canonical object definition when present.

**Ownership is not one of these dimensions.**

Ownership, balances, transfer history and registry state are external mutable state bound to the Object Layer identity.

---

## 4. Canonical Identity

Canonical serialization is required before hashing.

The reference model uses:

```text
AtomicPrefab
    ↓
RFC 8785 JSON Canonicalization Scheme
    ↓
canonical bytes
    ↓
SHA-256
    ↓
contentHash
    ↓
CIDv1
    ↓
olCid
```

RFC 8785 defines deterministic JSON canonicalization so cryptographic operations can operate on an invariant representation of JSON data. [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html)

The protocol identity therefore does not depend on:

- database IDs;
- display names;
- owner addresses;
- balances;
- transfer history;
- token IDs;
- contract addresses.

A change to canonical content creates a different Object Layer identity.

CIDv1 provides a self-describing content address whose multihash contains the content digest. The reference implementation uses SHA-256 for Object Layer canonical bytes. [IPFS CID specification](https://github.com/ipfs/specs/blob/main/src/cid.md)

---

## 5. Semantic Profiles

The Object Layer Protocol defines the container and identity model. A **profile** defines how an implementation interprets domain-specific fields.

```json
{
  "profile": {
    "id": "cyberia",
    "version": 2
  }
}
```

A profile may define:

- attribute names and types;
- valid ranges;
- item categories;
- activation rules;
- runtime interpretation;
- compatibility requirements.

This enables multiple runtimes to use the same Object Layer identity while applying different domain profiles, provided those profiles are compatible with the object's declared schema.

A profile MUST NOT redefine the Object Layer's canonical identity rules.

---

## 6. Composition

Object Layers are independently addressable units that can be composed into larger entities.

Conceptually:

```text
Entity
 |
 +-- Object Layer A  (base)
 +-- Object Layer B  (equipment)
 +-- Object Layer C  (equipment)
 +-- Object Layer D  (effect)
```

The composition identifies the ordered layers and their runtime state.

The individual Object Layers remain independently resolvable and independently addressable.

This separation allows:

- one layer to be reused by many entities;
- one layer to have independent ownership;
- runtimes to compose layers without duplicating their canonical definitions;
- different applications to interpret the same definitions through compatible profiles.

---

## 7. Storage and Resolution

The protocol does not require one specific storage network.

A compatible deployment may use:

- IPFS or another content-addressed store;
- HTTP distribution;
- local content caches;
- replicated registries;
- archival storage.

IPFS is a natural reference transport because CID identifies content by a multihash rather than by the location of a particular server. [IPFS CID specification](https://github.com/ipfs/specs/blob/main/src/cid.md)

A registry may provide indexing and caching, but the registry is not the canonical identity of the Object Layer.

A resolver SHOULD therefore support:

```text
olCid
  ↓
canonical object definition
  ↓
profile-aware consumer
```

---

## 8. Ownership and the Object Layer Token

The protocol deliberately separates **identity** from **ownership**.

A ledger may bind an Object Layer identity to a token representation:

```json
{
  "objectLayerCid": "bafkrei...",
  "chainId": 777771,
  "contractAddress": "0x...",
  "tokenId": "..."
}
```

This binding is an integration layer, not part of the canonical AtomicPrefab.

A reference Ethereum-compatible implementation may map:

```text
tokenId = uint256(contentHash)
```

when the content hash is a 32-byte SHA-256 digest.

That convention is an implementation policy, not a requirement that the Object Layer Protocol itself depend on ERC-1155 or any specific blockchain.

ERC-1155 can represent multiple token types and supplies, making it suitable for a reference ownership layer, while ownership remains mutable ledger state outside the canonical object definition. [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155)

---

## 9. Registry Integration

The protocol can be integrated with a registry such as **ItemLedger**, which the
[ItemLedger White Paper](../../item-ledger/explanation/white-paper.md) defines.

The responsibilities are intentionally separated:

```text
Object Layer Protocol
    ├── canonical schema
    ├── canonicalization
    ├── content identity
    └── object resolution

ItemLedger
    ├── object registration
    ├── token binding
    ├── ownership projections
    ├── provenance indexing
    └── discovery
```

The registry MAY cache or index an Object Layer, but changing registry state MUST NOT change the Object Layer's canonical identity.

This permits multiple registries or ownership systems to reference the same Object Layer.

---

## 10. Identity and Wallet Integration

Wallets and accounts are part of the integration layer, not the Object Layer identity itself.

A reference implementation can use established Ethereum standards:

| Standard             | Role                               |
| -------------------- | ---------------------------------- |
| **EIP-1193**         | Wallet/provider interface          |
| **EIP-6963**         | Multi-provider discovery           |
| **ERC-4361 / SIWE**  | Off-chain account authentication   |
| **EIP-712**          | Structured action signing          |
| **CAIP-2 / CAIP-10** | Portable chain/account identifiers |

EIP-1193 defines a common Ethereum provider interface, while EIP-6963 defines discovery for multiple injected providers. [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963)

ERC-4361 defines a standardized message format for Ethereum account authentication with off-chain services. [ERC-4361](https://eips.ethereum.org/EIPS/eip-4361)

EIP-712 defines typed structured-data hashing and signing and provides domain separation for signed messages. It does not itself provide application-level replay protection; that must be implemented by the application protocol. [EIP-712](https://eips.ethereum.org/EIPS/eip-712)

The important separation is:

```text
Wallet key / account
        ↓
authorization and ownership

Object Layer CID
        ↓
semantic object identity
```

Neither identity should replace the other.

---

## 11. Reference Architecture

A compatible system can be organized as:

```text
                  ┌────────────────────────┐
                  │   Object Layer Client  │
                  └────────────┬───────────┘
                               │ olCid
                               ▼
                  ┌────────────────────────┐
                  │   Object Layer Resolver│
                  └────────────┬───────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │    AtomicPrefab        │
                  │  canonical definition  │
                  └──────┬─────────┬───────┘
                         │         │
                  profile│         │render
                         ▼         ▼
                 Semantic Runtime  Content Store
                         │
                         ▼
                  Composable Entity
                         │
                         └──────────────┐
                                        ▼
                              External Ownership
                              / Registry / Ledger
```

The runtime, registry, content store and ledger are replaceable integration components.

The Object Layer identity remains the shared interoperability boundary.

---

## 12. Cyberia as a Reference Implementation

**Cyberia is an example implementation of the Object Layer Protocol, not the protocol itself.**

Cyberia demonstrates:

- Object Layers as composable game objects;
- a Cyberia semantic profile for mechanics;
- Object Layer rendering;
- instance and entity composition;
- MongoDB as an operational data store;
- IPFS-backed content distribution;
- ItemLedger integration for ownership indexing;
- Ethereum-compatible wallet identity;
- a reference ERC-1155 token binding.

The protocol remains usable by another runtime that does not implement Cyberia gameplay, Cyberia entity rules, or the Cyberia economy.

A compatible runtime only needs to understand:

1. the Object Layer schema;
2. canonicalization and identity rules;
3. the referenced semantic profile;
4. the rendering/content references it consumes.

---

## 13. Conformance

A conforming implementation SHOULD be able to:

1. parse an AtomicPrefab according to its declared schema;
2. canonicalize the object deterministically;
3. reproduce its content hash and CID;
4. resolve the referenced Object Layer definition;
5. interpret the declared semantic profile;
6. preserve the distinction between object identity and external ownership;
7. compose multiple Object Layers without changing their individual identities.

An implementation MUST NOT include mutable ownership state in canonical object bytes when claiming the same Object Layer identity.

---

## 14. Security and Integrity

The protocol's integrity model relies on deterministic content identity.

Security considerations include:

- canonical serialization before hashing;
- cryptographic hash verification;
- validation of external content references;
- profile-version compatibility;
- separation of mutable ledger state from immutable object identity;
- authorization enforced by the external application/ledger;
- replay protection for signed application actions.

The protocol does not make claims that content is trustworthy merely because it is content-addressed. A CID provides integrity of the retrieved content relative to the identifier; applications still need policy for deciding which profiles, registries, issuers, and ownership records they trust.

---

## 15. Decentralization Objective

The long-term objective is a network where an Object Layer can be created once and used by many independent systems without requiring those systems to share one database, engine, or marketplace.

The intended direction is:

```text
Create
  ↓
Canonicalize
  ↓
Content-address
  ↓
Distribute
  ↓
Resolve
  ↓
Compose
  ↓
Use across runtimes
  ↓
Bind to independent ownership systems
```

No single runtime should be required to remain online for the Object Layer's identity to remain valid.

Applications may provide convenience services, caches, search, marketplaces, simulation, or authorization without becoming the owner of the protocol identity.

---

## 16. Future Interoperability

The protocol can evolve toward:

- cross-runtime object exchange;
- profile registries and compatibility declarations;
- multiple ledger bindings for the same Object Layer;
- richer composition graphs;
- decentralized indexing and discovery;
- verifiable provenance;
- additional content-addressing algorithms and storage systems;
- bridges between independent economic networks.

Protocol evolution SHOULD preserve canonical identity rules and explicit schema/profile versioning.

---

## 17. Summary

The Object Layer Protocol defines a common boundary between **what a digital object is** and **what applications do with it**.

Its core model is:

```text
AtomicPrefab
    ↓
Canonical Bytes
    ↓
contentHash / CID
    ↓
Object Layer Identity
    ↓
Profiles + Rendering + Composition
    ↓
Independent Runtime Integration
    ↓
Optional External Ownership / Ledger Binding
```

The protocol's central principle is:

> **The object definition is the interoperable identity; ownership and runtime state are integrations around that identity.**

Cyberia demonstrates this model in a concrete interactive environment. The protocol itself is intended to remain independent of Cyberia, independent of a specific runtime, and adaptable to multiple storage, registry, and ownership systems.

---

## References

- RFC 8288 - Web Linking: https://www.rfc-editor.org/rfc/rfc8288.html
- RFC 8785 - JSON Canonicalization Scheme: https://www.rfc-editor.org/rfc/rfc8785.html
- IPFS CID Specification: https://github.com/ipfs/specs/blob/main/src/cid.md
- EIP-1193 - Ethereum Provider JavaScript API: https://eips.ethereum.org/EIPS/eip-1193
- EIP-6963 - Multi Injected Provider Discovery: https://eips.ethereum.org/EIPS/eip-6963
- EIP-712 - Typed Structured Data Hashing and Signing: https://eips.ethereum.org/EIPS/eip-712
- ERC-4361 - Sign-In with Ethereum: https://eips.ethereum.org/EIPS/eip-4361
- ERC-1155 - Multi Token Standard: https://eips.ethereum.org/EIPS/eip-1155

---

<p align="center">

**Object Layer Protocol**  
`https://objectlayer.org`

</p>
