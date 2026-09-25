# ItemLedger API

The REST surface of the ItemLedger domain. The machine-readable contract is the OpenAPI
document the deploy publishes; this describes what each route answers.

## REST

| Route                                                                     | Role                              |
| ------------------------------------------------------------------------- | --------------------------------- |
| `GET /item-ledger`                                                        | Paginated bindings                |
| `GET /item-ledger/cid/:cid`                                               | Every binding of one Object Layer |
| `GET /item-ledger/token/:chainId/:contractAddress/:tokenId`               | One token type                    |
| `GET /item-ledger/token-id/:cid`                                          | The token id a CID derives to     |
| `POST /item-ledger` (admin)                                               | Records a binding                 |
| `DELETE /item-ledger/:id` (admin)                                         | Removes a binding                 |
| `GET /item-ledger-balance/token/:chainId/:contractAddress/:tokenId`       | Holders of one token type         |
| `GET /item-ledger-balance/owner/:chainId/:contractAddress/:ownerAddress`  | What one address holds            |
| `GET /item-ledger-balance/supply/:chainId/:contractAddress/:tokenId`      | Projected supply and holder count |
| `GET /item-ledger-transfer/token/:chainId/:contractAddress/:tokenId`      | Provenance of one token type      |
| `GET /item-ledger-transfer/owner/:chainId/:contractAddress/:ownerAddress` | Legs one address sent or received |
| `GET /item-ledger-transfer/tx/:chainId/:contractAddress/:txHash`          | Legs of one transaction           |
| `GET /item-ledger-checkpoint/:chainId/:contractAddress`                   | How far the projection reaches    |
