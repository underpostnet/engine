# ADR 0007 — Cyberia content lifecycle orchestration

## Status

Accepted. Builds on [ADR 0003](0003-content-releases-over-database-drops.md),
[ADR 0004](0004-source-releases.md) and [ADR 0005](0005-one-content-data-source.md). Decisions 3 and
4 and the share are amended by [ADR 0008](0008-workstation-and-management-plane-node-roles.md).
Stage completion and the share are amended by
[ADR 0009](0009-cyberia-development-sandbox-and-lifecycle-monitor.md).

## Context

One content maintenance cycle crosses several hosts and several owners. The production control node
backs up the infrastructure, captures a content baseline and deploys. A development host restores
the baseline, resets its workspace, exports the live content and authors the source. The source
repositories build, lock and publish the release that production then serves.

Each step was an independent command. Nothing connected them: the operator carried the backup id,
the baseline id and the revisions from one host to the next by hand. A command that exited 0 was
taken as a completed step, but no step checked the one before it. A workspace reset could drop the
only trace of the work. Former command names ran through an alias layer, so one operation had
several names in scripts and runbooks.

## Decisions

1. **Two content namespaces.** `cyberia content` holds the content data and its operations;
   `cyberia instance` holds the runtime worlds. The workspace commands live in `content workspace`,
   the source reconciliation in `content source`, the cycle in `content lifecycle`. `cyberia release`
   stays the release of the source repositories. Each command has one name, and the command registry
   is the only source of its help and of the CLI reference.
2. **A node-aware aggregate and an append-only journal.** `CyberiaContentLifecycle` is one cycle: its
   scope, the state of each stage, and the ids of the records it produced. `CyberiaContentLifecycleEvent`
   records each operation a host runs for the cycle: actor, node, context, environment, command,
   attempt, input fingerprint, result and error. The model refuses every update of an event. The
   cycle is a projection of its journal, written with a revision guard. Both live in the Cyberia
   runtime database, beside the release ledger and the server registry. No workspace drop, import,
   release build, promotion or rollback writes them, and the infrastructure backup holds them.
3. **The WireGuard identity is the node identity.** A host reads its node document
   (`engine-private/deploy/nodes/<node>.json`) and its tunnel health through the Underpost WireGuard
   module. The capabilities of its role come from the Underpost capability table. Cyberia never
   changes the topology.
4. **Contexts are not roles.** A cycle needs four execution contexts: `infrastructure-control`,
   `production-deployment`, `content-development` and `source-authoring`. A host takes a context from
   its role, a capability of that role, the environment the command targets and its checkouts.
   `--dev` selects an environment; it never grants a context. A host with no node document takes
   none.
5. **Underpost keeps the infrastructure operations.** `node bin db --export`, `--verify` and
   `--restore-test` stay Underpost commands. The cycle reads their receipts, the backup manifest and
   its verifications in the object store, and never runs them. Underpost has no Cyberia dependency.
6. **Cyberia owns the lifecycle semantics.** The stage table, the context policy and the stage
   verifiers are Cyberia modules (`src/projects/cyberia/content/content-lifecycle.js` and
   `content-lifecycle-stages.js`). They decide what a stage needs and what proves it.
7. **The domains keep their records.** A backup, a baseline, a saga, a world, an Object Layer
   definition, a source lock and a content release stay with their owners. A cycle keeps their ids and
   a small evidence summary. A stage completes only when its verifier reads the owner's record and
   finds the postcondition, never on an exit code.
8. **One durable cycle id correlates every operation.** A cycle id is
   `<deploy-id>-<yyyymmddhhmm>-<hex6>`. Each participating command takes `--cycle <cycle-id>` and
   appends its event, also when a precondition refuses it. A stage is recorded against the evidence
   of the stage before it: new evidence upstream makes every later stage stale. An event with the
   same stage, input and evidence is not appended twice, so a rerun after an interruption is safe.
9. **Source release and content release stay distinct.** The source release pins exact repository
   revisions and the content artifact digest in the deployment lock. The content release builds that
   artifact into its own database and promotes it. The cycle records them as separate stages and
   links them by the locked content digest.
10. **A live change is discarded only by name.** A promotion that stops serving live changes needs the
    id of the active release and a reason. The release ledger records both with the changes.

The cycle names the next stage, the context it needs and its commands. It never runs a stage on
another host: `content lifecycle handoff` gives the operator of the next host what to run.

## Alternatives considered

- **Independent commands, no orchestrator.** Simple, but no record connects the steps, a step never
  checks the one before it, and a reset loses the context. Rejected.
- **One deployment script for the whole cycle.** No single host holds every context: production
  control and development authoring are different hosts with different credentials. A script cannot
  pause for a review for days, and a failure in the middle restarts it. Rejected.
- **The whole workflow in Underpost.** Underpost would have to know baselines, sagas and content
  releases. That inverts the dependency between the platform and the product. Rejected.
- **A generic distributed workflow engine.** A new service with workers on every host and network
  reach to production, for stages that are operator handoffs, not machine tasks. Rejected while the
  cycle has one operator per stage.

## Consequences

- The control node reads and writes the runtime database of the deployment through a forward to the
  primary. A workstation reads one cycle and records its stages through the share that the control
  node opens for its peer; it never reaches that database. The journal records each share. A host
  that reaches neither cannot take part.
- The journal grows with each operation. It has no prune; a later retention rule may add one.
- A command without `--cycle` works as before and records nothing.
- The Studio shows cycles and journals read-only. Changes come from the CLI on the right host.
- This decision does not schedule stages, run stages remotely, span deployments, or add approvals
  beyond the reviewed source commit.

## Migration and compatibility

The alias layer is removed: a former command name now fails as an unknown command. That covers
`ol`, `audio`, `catalog`, `map-registry`, `population`, `content-release`, `content-baseline`,
`client-hints` and `instance <code>`, and the forms below. Every controlled caller uses the
canonical form: the deploy scripts, the compose content job, the release Jobs, the tests and the
documentation.

| Former form                           | Canonical form                                          |
| ------------------------------------- | ------------------------------------------------------- |
| `run-workflow import-content`         | `content workspace import`                              |
| `run-workflow import-content --clean` | `content workspace reset`: drops, then imports          |
| `run-workflow drop-db`                | `content workspace drop`                                |
| `content release export-live`         | `content source export-live`                            |
| `--discard-live-changes`              | `--discard-live-changes <id> --discard-reason <reason>` |
| `DISCARD_LIVE_CHANGES=1` (deploy)     | `DISCARD_LIVE_CHANGES=<id> DISCARD_REASON=<reason>`     |

External scripts that use a former form must change to the canonical form.
