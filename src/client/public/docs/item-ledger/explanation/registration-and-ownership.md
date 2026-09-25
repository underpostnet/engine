# Registration and ownership

What a registration binds, how a token id is derived from canonical content, and how
ownership is projected from the chain.

## Registration binding

One record binds one canonical Object Layer to one token type
(`src/api/item-ledger/item-ledger.model.js`):

```json
{
  "objectLayerCid": "bafkrei…",
  "itemId": "hatchet",
  "chainId": 777771,
  "contractAddress": "0x…",
  "tokenId": "9713…",
  "standard": "ERC1155",
  "txHash": "0x…",
  "blockNumber": 12
}
```

- `chainId + contractAddress + tokenId` is the fully qualified on-chain asset identity.
- `objectLayerCid` is the definition the token type represents.
- `itemId` is a label copied for discovery. Two definitions that share a label register as two
  token types. The label is not a uniqueness constraint.
- A definition binds at most once per contract.

## Token id derivation

```
tokenId = uint256(contentHash)          contentHash = sha2-256(canonical Object Layer bytes)
```

The token id is the canonical digest itself, the digest the Object Layer CID carries. No
label, owner, contract, chain or textual encoding takes part. `objectLayerTokenId(cid)`
computes it off-chain from the CID's digest; `ObjectLayerToken.computeTokenId(bytes32)` is the
same cast on-chain; `objectLayerCidOfTokenId(tokenId)` and `getObjectLayerCid(tokenId)` give
the CID back. `test/support/object-layer-identity-vectors.json` holds the cross-language
vectors both sides are tested against.

Token id `0` is CryptoKoyn (CKY), the fungible currency. It is outside the Object Layer
registry: a zero content hash is refused.

## Ownership projection

Ownership is chain state. The indexer (`src/api/item-ledger/item-ledger.indexer.js`) projects
it into three collections so the explorer never reads `balanceOf` per request:

| Collection             | Row                                                                                                                                               | Key                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `ItemLedgerTransfer`   | One `TransferSingle` leg or one id of a `TransferBatch`: from, to, value, block, tx, log index. Mints come from the zero address, burns go to it. | `chainId + contractAddress + txHash + logIndex + batchIndex` |
| `ItemLedgerBalance`    | What one address holds of one token type                                                                                                          | `chainId + contractAddress + tokenId + ownerAddress`         |
| `ItemLedgerCheckpoint` | Last block fully projected for one contract                                                                                                       | `chainId + contractAddress`                                  |

`ObjectLayerRegistered` events write the registration binding, after checking that the CID
the event names is the content of its token id.

The indexer is:

- **idempotent** — a leg is recorded once (unique key) and applied to the balances once
  (`applied` flag); replaying a block range changes nothing;
- **restartable** — a run resumes after the checkpoint and first applies any leg it recorded
  but did not apply; on a replica set the balance move and the flag land in one transaction;
- **finality aware** — `--confirmations` keeps the projection behind the head; Besu IBFT2/QBFT
  finalize every block, so the default is 0;
- **reconcilable** — `chain reconcile` rereads every projected balance from the contract and
  corrects drift.
