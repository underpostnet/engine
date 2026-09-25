# Register an asset on chain

Registration runs from the Cyberia CLI, because Cyberia ships the chain toolchain. Each
command names one definition; an unbound label is an error, never a guess.

## CLI

The chain commands live in the Cyberia CLI because Cyberia ships the chain:

```
cyberia chain register --cid <olCid> --supply 1
cyberia chain register --item-id hatchet --from-db      # the definition Cyberia's catalog binds to the label
cyberia chain batch-register --items '[{"cid":"bafkrei…","supply":1}]'
cyberia chain bind --cid <olCid>                          # index an existing registration, no transaction
cyberia chain index --network besu-k8s [--follow 5000]    # project events into the ItemLedger collections
cyberia chain reconcile --network besu-k8s                # correct projected balances against the chain
cyberia chain balance --address 0x… --token-id <tokenId>  # one balance read from the chain
```

`--item-id` resolves through the Cyberia item catalog to one explicit definition; an unbound
label is an error, never a guess.
