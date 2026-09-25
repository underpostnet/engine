# Canonical identity

A definition is named by its content. This is the payload that content is, and the pipeline
that turns it into an identity.

## Canonical payload (AtomicPrefab)

```json
{
  "schemaVersion": 1,
  "profile": { "id": "cyberia", "version": 2 },
  "data": {
    "item": { "id": "hatchet", "type": "weapon", "description": "A rusted hatchet", "activable": true },
    "stats": { "effect": 5, "resistance": 0 },
    "render": { "cid": "bafkrei…", "metadataCid": "bafkrei…" }
  }
}
```

- `profile` names the contract that gives `data.stats` and `data.item.type` their vocabulary.
  The protocol stores the reference; a runtime defines the profile. Cyberia's is
  `CyberiaObjectLayerProfile` (`src/client/components/cyberia/ObjectLayerProfileCyberia.js`).
- `data.item` names and describes the object. `item.id` is a label.
- `data.stats` is the mechanical block: a plain object of integers. The protocol fixes its
  shape only.
- `data.render` is the [render contract](render-contract.md): the canonical render CID and the
  canonical metadata CID.

Nothing else is canonical. No owner, balance, token id, contract, chain, transfer, registration
or storage state enters the hashed bytes.

`canonicalObjectLayer()` in `src/client/components/object-layer/ObjectLayerProtocol.js` builds
the payload. `canonicalJsonBytes()` in `src/api/object-layer/object-layer.identity.js` turns it
into bytes. The same function makes the bytes of the render metadata, and a pin stores the exact
bytes it returns: there is one serialization path. Canonical bytes serve identity only: a store
that checks whether a materialization it holds (an editor source, an atlas) equals a new one
compares values, never bytes.

## Canonical domain

Schema version 1 accepts objects, arrays, strings of well-formed Unicode, booleans, `null`, and
integers within ±(2^53 − 1). `data.stats` is an object of such integers.

A value outside the domain is refused before the hash, never converted: `NaN`, `Infinity`,
`-Infinity`, a decimal, an integer above the range, a lone surrogate, `undefined`, and any value
that is not plain JSON data. JSON text that feeds an identity (a request body of the Object Layer
API, a backup, an asset `metadata.json`, render metadata read from IPFS) is read with
`parseIdentityJson()`, which also refuses an object that repeats a property name.

## Identity pipeline

```
canonicalBytes = RFC 8785 JCS(canonicalObjectLayer(definition)), UTF-8     ≤ 262144 bytes
contentHash    = sha2-256(canonicalBytes)                                  hex, 64 characters
cid            = 'b' + base32lower(0x01 0x55 0x12 0x20 ‖ sha2-256 digest)  CIDv1, raw, sha2-256
tokenId        = uint256(sha2-256 digest)                                  decimal
```

The protocol fixes every parameter:

| parameter       | value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| serialization   | RFC 8785 JSON Canonicalization Scheme (JCS), UTF-8                               |
| maximum payload | 262144 bytes (`MAX_CANONICAL_BYTES`); a larger payload is refused, never chunked |
| digest          | sha2-256                                                                         |
| CID version     | 1                                                                                |
| multicodec      | raw, `0x55`                                                                      |
| multihash       | sha2-256, `0x12`, 32 bytes                                                       |
| multibase       | base32 lower, prefix `b`                                                         |
| pin             | `add?pin=true&cid-version=1`, raw leaves, one block                              |

The standard is RFC 8785; the JavaScript library that implements it is not part of the protocol.
The codec does not define the bytes: the bytes are RFC 8785 JSON, and `raw` addresses them as one
block.

The size limit is what makes the one-block form exact: above it Kubo would build a DAG with
another CID. Such a payload is refused rather than published under an identity the protocol cannot
reproduce.

The identity is known before any pin and before any registration. A pin that answers another
CID is refused and the definition stays `published: false`; `published` is storage state, not
content, so it never enters the identity. There is no `sha256:` placeholder anywhere: a
definition is either published under its real CID or marked unpublished.

`test/support/object-layer-identity-vectors.json` holds vectors computed by an independent
implementation. Its `derivation` states every step, so an implementation in another language
reproduces the bytes, the digest, the CID and the token id without Node.js. The JavaScript module
and the Solidity contract are checked against the vectors. The Go server and the C client carry
the `cid` and compute no identity.

## Root identity and child references

The Object Layer CID identifies one block: the canonical bytes of the definition. Those bytes
contain two child references, `data.render.cid` and `data.render.metadataCid`, each the CID of a
block of its own. The Object Layer CID is therefore the application-level root identity of the
definition: its digest covers the child CID strings, and each child CID covers the bytes it
names. A CID string itself contains no other CID.

Two content-addressed objects give the identity, in this order:

```
render metadata → RFC 8785 JCS → UTF-8 → sha2-256 → metadataCid
primary PNG     →                         sha2-256 → cid
definition with data.render { cid, metadataCid } → RFC 8785 JCS → UTF-8 → sha2-256 → Object Layer CID
```

A change to the render metadata changes its bytes, its CID, the definition bytes, the Object Layer
CID and the token id. The graph is acyclic: no child depends on the definition, and no payload
contains its own CID.

Schema version 1 is not an IPLD Merkle-DAG. The child references are strings, not typed IPLD
links, so IPFS neither follows nor recursively pins them, and the definition is neither DAG-JSON
nor DAG-CBOR. A render manifest between the definition and its render is not part of the
protocol: the render and its metadata already have their own identities, and nothing uses the
pair apart from its definition.

Rules:

1. Same canonical content → same identity.
2. Different canonical content → different identity, whatever `itemId` they share.
3. Identity never depends on ownership, registration, contract address, token id or chain.
4. The hashed bytes carry no `cid`: there is no circular dependency.
5. A stored definition is immutable. Changed content is a new definition with a new identity.
6. `tokenId` is the digest, not the CID text: another textual form of the same content (upper
   case, base16 multibase, padded) is not a canonical CID and is refused as an input.
7. Content identity includes the profile: the same fields under another profile version are
   another definition.

## Protocol boundary

The `json` multicodec, DAG-JSON, DAG-CBOR, typed IPLD links and graph traversal are outside
schema version 1. Adopting one is a protocol decision and a new schema version: a codec change
changes every CID text, and links or another encoding change the bytes, every CID and every token
id.
