# Object Layer API

The cross-domain contract of the Object Layer domain. The machine-readable contract is the
OpenAPI document the deploy publishes; this states which question each route answers.

## Cross-domain contracts

No domain reads another domain's database. `src/server/domain/domain-client.js` is the one
transport: `<origin>/api/v1/<api>/…`, 5 s timeout, two retries of transient failures only, a 30 s
read cache, `null` for a missing resource, and `DOMAIN_API_SERVICE_KEY` on writes (never retried).
Origins come from `OBJECT_LAYER_API_ORIGIN`, `ITEM_LEDGER_API_ORIGIN` and `CYBERIA_API_ORIGIN`. When
one is not set, the client reaches the owner host of the same deploy on its local port.

Every first-party API, browser and cross-domain alike, lives under one versioned contract:
`/api/v1/<api>`. `DOMAIN_API_VERSION` in `src/server/domain/api-contract.js` is its only
authority. No configuration sets the path or the version, and no unversioned path exists.

| question                                        | contract                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CID → canonical Object Layer                    | `GET /api/v1/object-layer/:cid`                                                                             |
| publish a definition                            | `POST /api/v1/object-layer/canonical` with the service key; the authority only, a consumer refuses it       |
| archive a definition, or offer it again         | `PUT /api/v1/object-layer/lifecycle/:cid` `{ archived }`; its owner or an admin, at the authority           |
| remove a draft or a cache copy                  | `DELETE /api/v1/object-layer/:id`; its owner or an admin. A published definition is archived, never deleted |
| remove every record of a definition on one host | `DELETE /api/v1/object-layer/purge/:cid` with body `{ cid }`; an admin. See Purge                           |
| CID → registrations                             | `GET /api/v1/item-ledger/cid/:cid`                                                                          |
| qualified token → asset                         | `GET /api/v1/item-ledger/asset/:chainId/:contractAddress/:tokenId`                                          |
| token → supply                                  | `GET /api/v1/item-ledger-balance/supply/:chainId/:contractAddress/:tokenId`                                 |
| token → owners                                  | `GET /api/v1/item-ledger-balance/token/:chainId/:contractAddress/:tokenId`                                  |
| token → provenance                              | `GET /api/v1/item-ledger-transfer/token/:chainId/:contractAddress/:tokenId`                                 |
| Cyberia content → Object Layers                 | pinned `objectLayerCid` in the content, and `GET /api/v1/cyberia-item-catalog/:itemId` for the alias        |
