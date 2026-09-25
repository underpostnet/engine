# Open decisions

Each of these blocks part of on-chain CKY. None is decided by the code today, and the domain
keeps its current shape until they are.

## Decisions this domain still needs

These are open, and each one blocks part of Phase 3. None of them is decided by the code today.

| Decision                 | Question                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| Distribution             | How the 90% airdrop and mint pool is released over time, and what a player must do to earn from it |
| Minting fee              | What a player pays in CKY to bring an off-chain item on chain, and how that sink is priced         |
| Staking and voting power | Whether voting power is a staked balance or a separate record, and how it unstakes                 |
| Governance scope         | Which parameters a vote may change, and which stay with the operator                               |
| Fiat bridge              | Whether the domain runs an on-ramp at all before mainnet, and who takes custody if it does         |
| Relayer policy           | Which actions the relayer pays for, and its rate limit per account                                 |
| Mainnet path             | Whether CKY bridges to Ethereum or an L2, and what happens to the Besu supply if it does           |
| Key recovery             | What the platform offers a player who loses an embedded vault — today, nothing but their export    |

Until each is decided, the domain keeps its current shape: the wallet works, the account record
is public metadata, and nothing claims a balance the chain has not confirmed.
