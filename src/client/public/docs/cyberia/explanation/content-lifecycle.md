# The content lifecycle

A content lifecycle is one cycle of content maintenance and release for a deployment. It starts
with an infrastructure backup and ends when every game server serves the new release. The cycle
crosses several hosts. Each host runs only the stages it may run, and the cycle records what each
one proved, and for which target. [ADR 0007](../../underpost/adr/0007-cyberia-content-lifecycle-orchestration.md)
records the decisions;
[ADR 0009](../../underpost/adr/0009-cyberia-development-sandbox-and-lifecycle-monitor.md) adds the
execution targets, the Development Sandbox and the monitor.

## Stages

The stages run in this order. Each one depends on the one before it. The target column names the
kind of [execution target](#execution-targets) a stage completes for.

| Stage                   | Target     | Context                                      | Recorded by                                  | Proof                                                                                                            |
| ----------------------- | ---------- | -------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `preflight`             | deployment | any                                          | `content lifecycle doctor <cycle-id>`        | The node, the environment, the contexts, the checkouts and the artifact                                          |
| `infrastructure-backup` | deployment | `infrastructure-control`                     | `content lifecycle verify`                   | A disaster-recovery backup since the cycle started, with a passing restore drill                                 |
| `baseline-capture`      | deployment | `production-deployment`                      | `content baseline capture --cycle`           | An available content baseline of the active release                                                              |
| `baseline-verify`       | deployment | `production-deployment`                      | `content baseline verify --cycle`            | A passing deep verification of that baseline                                                                     |
| `baseline-restore`      | sandbox    | `content-development`                        | `content baseline restore --cycle --dev`     | The restored release database, its Files and its ledger row, read back                                           |
| `source-export`         | source     | `content-development` and `source-authoring` | `content source export-live --apply --cycle` | The files written into `cyberia-content` and the digest of the source tree                                       |
| `workspace-reset`       | sandbox    | `content-development`                        | `content workspace reset --cycle --dev`      | The artifact is the build of the committed export; what the reset dropped and imported, read back                |
| `source-review`         | source     | `source-authoring`                           | `content lifecycle verify`                   | A committed `cyberia-content` with nothing left to commit, whose release worlds bind each item to one definition |
| `source-release`        | source     | `source-authoring`                           | `content lifecycle verify`                   | The deployment lock pins the reviewed revision, committed, and the origin of the deployment holds it             |
| `production-deploy`     | deployment | `production-deployment`                      | `content lifecycle verify`                   | The active release serves the locked content digest and passed validation                                        |
| `runtime-verify`        | deployment | `production-deployment`                      | `content lifecycle verify`                   | Every ready game server reports the release the cycle deployed                                                   |

The export reads the baseline only, so it runs before the reset. The reset loads the artifact built
from the committed export, and the Studio edits start from it. A cycle stores this order when it
starts. A cycle that started under another order is `superseded`: it takes no more operations, and
the operator cancels it and starts a new one.

A stage completes only when its proof is found. A command that exits 0 does not complete a stage:
the command records what it produced, and a verifier reads the record its owner keeps. A backup is
an Underpost record, a baseline and a release are Cyberia records, and a lock is a commit of
`cyberia-deployment`. The cycle keeps their ids, never a copy.

## Execution targets

A stage runs against one execution target, and its completion belongs to that target only:

| Kind         | One target per                                | Id                                     | Fingerprint                                                                    |
| ------------ | --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| `deployment` | Deployment and environment of the cycle       | `deployment:<deploy-id>/<environment>` | The deploy id and the environment                                              |
| `sandbox`    | Development Sandbox of one workstation        | `sandbox:<peer-id>/<sandbox-id>`       | The sandbox fingerprint, the deploy, the replica set id and the database names |
| `source`     | `cyberia-content` checkout of one workstation | `source:<peer-id><checkout path>`      | The path, the remote, the branch and the git directory of the checkout         |

The cycle keeps one execution per stage and target: its state, its attempts, its evidence and the
execution of the stage before it that it was recorded against. The journal keeps every attempt. A
restore on workstation A completes `baseline-restore` for the sandbox of A only. On workstation B,
the same stage stays `pending` until B restores into its own sandbox.

The id of a target stays the same when its target is recreated; the fingerprint does not. Underpost
builds the sandbox fingerprint from the Kind cluster: a recreated cluster has a new `kube-system`
namespace, so its sandbox has a new fingerprint and inherits no restore. The `<peer-id>` of a
workstation target is its WireGuard peer: a share accepts only the targets of the peer it serves.

A host evaluates the cycle against the targets it observes now. It observes a kind of target only
when it runs a stage of that kind: a control node with a `cyberia-content` checkout observes no
source target. A stage of a kind the host does not observe shows the newest current execution of
another host, with its target. Where the host observes
the target, a stage also checks its evidence against the target again: a dropped release database
makes `baseline-restore` stale, and a commit after the review makes `source-review` stale.

A stage with side effects runs once per target and input. To run a restore or a reset again for a
target it is complete for, pass `--new-attempt`: the journal records a new attempt.

### Stale stages

Each execution is recorded against the evidence of the execution of the stage before it. When that
execution records new evidence, or its target changes, every execution recorded after it turns
`stale` and must run again. For example, a new commit in `cyberia-content` after the source release
makes `source-review` stale, and `source-release` and the stages after it with it.

A stage has one of these states for a target: `pending`, `completed`, `stale`, `failed` or
`blocked`. The cycle is `in-progress` until `runtime-verify` is `completed` through its whole chain,
then `completed`. A cancelled cycle takes no stage and no operation.

## Hosts and contexts

A context is a responsibility in a cycle. It is not a node role: the role is the machine, the
context is its work in a cycle. A host takes a context from the Underpost role of its WireGuard node
document, a capability of that role, the environment the command targets and its checkouts. This is
the stage execution policy, `CONTEXT_POLICY` of `content-lifecycle.js`:

| Context                  | Role          | The role must hold          | The command needs                     |
| ------------------------ | ------------- | --------------------------- | ------------------------------------- |
| `infrastructure-control` | `control`     | `kubernetes-administration` |                                       |
| `production-deployment`  | `control`     | `kubernetes-administration` | The production environment            |
| `content-development`    | `workstation` | `wireguard-spoke`           | The development environment (`--dev`) |
| `source-authoring`       | `workstation` | `wireguard-spoke`           | A `cyberia-content` checkout          |

A hub and a worker take no context. A host with no node document takes none. `--dev` selects the
development environment; it never grants a context. A `content-development` stage also needs a
Development Sandbox session of the host that serves the development database: see
[The Development Sandbox](#the-development-sandbox). So a control node never resets a development
workspace, and a Kubernetes node never authors content. A command that notes an operation in a cycle
needs a host that takes a context in it. A
[workstation](../../nexodev/how-to/run-the-edge-hub.md#workstation-peers) is a WireGuard peer that a
person operates: it is not a Kubernetes node, and the fleet never syncs or repairs it.

## The journal

Every command that takes `--cycle <cycle-id>` appends an event to the journal of the cycle: the
operation, the stage, the actor, the node, the context, the environment, the command, the attempt,
the input it ran against, a result summary and the error. A refused command appends a `blocked`
event. No event changes after it is written.

The cycle is the projection of its journal: the state of each stage, the ids it keeps and its
status. A rerun of a stage with the same input and the same evidence appends nothing, so a command
that stopped part way is safe to run again.

Operations outside the stages, such as `content import`, `content saga sync` or `release build`,
append an event too. An import also adds the sagas and worlds it wrote to the scope of the cycle.

## Storage

The cycle and its journal live in the Cyberia runtime database of the deployment, beside the
release ledger and the server registry. No workspace drop or reset, import, release build,
promotion or rollback writes them, and the infrastructure backup of the deployment holds them.
Only the nodes of the cluster reach that database:

- A pod reaches it by the member names of the replica set.
- The control node, outside the cluster, reaches the primary through a forward that each command
  opens and closes.
- A workstation never reaches it. `content lifecycle share <cycle-id> --peer-id <peer-id>` on the
  control node opens one cycle to one workstation peer: an HTTP service on the WireGuard address of
  the control node, at the workstation port `7735`. The workstation sets `CYBERIA_LIFECYCLE_SHARE` to
  the value that the share prints. Each request must come from the tunnel address of that peer and
  carry the token of the share. The share takes the node of the caller from the topology, records
  only the stages of its role, and only for the targets of that peer; a refused stage attempt stays
  in the journal as `stage.refused`.

A share lives at most `--hours` (8 by default, 24 at most). Its service renews a lease on the cycle
every 30 seconds; a share whose lease lapses is `expired`, so a crash or a lost tunnel ends it
without a close. `content lifecycle revoke-share` ends it at once. The journal records
`lifecycle.share.open`, `.close`, `.expire` and `.revoke`, and each event a share records names the
share. The cycle keeps the sha256 of the token, never the token. The value of the share is a URL
whose user part is the token, so log redaction treats it as a credential.

## The Development Sandbox

A workstation writes development data only to a Development Sandbox: an isolated Kind cluster with
MongoDB and Valkey, exposed on `127.0.0.1` by one `underpost sandbox up` session
([Run a Development Sandbox](../../nexodev/how-to/run-a-development-sandbox.md)). A restore, a
workspace reset or drop and a source export with `--dev` resolve their target from the development
database of the deploy: a live session of this host must forward its MongoDB on that address. A
listening port alone is never proof: a port that no session holds may be a forward to production. A
restore, and a development drop or reset in a cycle, also refuse the replica set the baseline came
from.

## Exit codes

| Code | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `0`  | The command succeeded                                                             |
| `1`  | The command failed                                                                |
| `3`  | A precondition blocked the command: the host, an earlier stage, or a closed cycle |

## The Content Lifecycle Monitor

The Studio view **Cyberia Content Lifecycle** reads the cycles where its engine reads them, and the
engine names the source:

| Engine                                   | Source                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| A production container or a control node | The central cycles in the runtime database of the deploy   |
| An engine with `CYBERIA_LIFECYCLE_SHARE` | The one shared cycle, read by the engine through the share |
| Any other engine                         | Its development database: rehearsal cycles only            |

The browser never calls the share and never sees its value: the engine holds it. An engine outside a
container also shows its Development Sandbox apart from the cycle: the target, the session, a check
of each service, the restored releases, the workspace, the content artifact and the
`cyberia-content` checkout. A share that is expired, revoked, closed, refused or unreachable, or a
tunnel that is down, shows as such, never as an empty list.

The developer view leads with the next action, its target, its commands and the editors of the cycle
scope. The operator view adds the node of each stage, the evidence of each execution, the shares and
the result of each event. The view reads only; every change comes from the CLI on the host the stage
needs.
