# Economy federation boundary

Cyberia runs one economy authority per deploy. Several worlds can share a wallet, a marketplace or
a world drop only under that one authority. This page states what one authority guarantees today,
what never crosses to another host, and the contract a future federation of hosts needs. No
cross-host transfer exists yet.

---

## One authority

An authority is one deploy: its engine, its MongoDB and the game servers it registers. Its identity
is the deploy id (`DEPLOY_ID`), which does not change with a public URL.

| Asset                  | Owner                                | Scope                        |
| ---------------------- | ------------------------------------ | ---------------------------- |
| Economy profile        | The content of the authority         | The worlds that name it      |
| Wallet and owned items | The universe profile of the player   | The worlds of one universe   |
| World drop             | The `CyberiaWorldDrop` record        | One world                    |
| Market listing         | The market of the authority          | One world, or one universe   |
| Item definition        | The canonical CID that `olCid` names | Everywhere, as identity only |

Every change of these assets commits in one MongoDB transaction of the authority. That transaction
is atomic for the authority only.

## What never crosses

- No host writes the database of another host.
- An economy code names a profile inside its authority only. `standard` on two hosts is two
  profiles. A remote reference always carries its authority: `authorityId/code@revision`.
- A market code names a profile inside its authority only. A market is the profile in one scope
  key, so its reference is `authorityId/scope:scopeKey/code`: `wods` in two universes of one host is
  two markets, and `wods` on two hosts shares nothing
  ([market identity](off-chain-economy.md#market-identity)).
- A revision names the configuration a world saw. It proves no trust and no compatibility.
- A reachable URL proves no ownership and no permission.
- An equal CID proves an equal definition. It grants no permission, no policy and no market
  acceptance on another host.
- No setting turns remote transfer on for every item or market.

A world of another authority has its own accounts and profiles. No coin and no item crosses to it,
and no travel route leads to it.

## Contract of a future federation

A cross-host operation needs every element below before it can run. Each local step stays atomic;
the whole operation is a saga, never one atomic transaction.

| Element           | Requirement                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| Identity          | A stable authority id and a public key per authority                        |
| References        | Qualified economy and market references: authority, code, revision          |
| Discovery         | A versioned protocol, and the capabilities each authority offers            |
| Allowlists        | The remote operations and the items each side accepts, stated per partner   |
| Request security  | Signed requests, authorization, rate limits, timeouts and replay protection |
| Item identity     | The canonical CID, and an explicit acceptance rule at the destination       |
| Ownership         | Per operation: the owner of the item, of each balance, and the settler      |
| Idempotency       | One operation id per transfer, bound to a request fingerprint               |
| Reservation       | Escrow of the item or the coins on the source until settlement ends         |
| Settlement states | `reserved`, `sent`, `accepted`, `settled`, `compensated`, `failed`          |
| Recovery          | Retry, reconciliation of uncertain outcomes, and compensation rules         |

The source authority reserves the asset first, and releases it only by settlement or compensation.
An uncertain outcome keeps the reservation until reconciliation resolves it. Expired idempotency
records never make an old operation valid again.
