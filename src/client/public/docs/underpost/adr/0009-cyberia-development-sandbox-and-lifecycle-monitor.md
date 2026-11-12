# ADR 0009 — Cyberia Development Sandbox and lifecycle monitor

## Status

Accepted. Builds on [ADR 0007](0007-cyberia-content-lifecycle-orchestration.md) and
[ADR 0008](0008-workstation-and-management-plane-node-roles.md). Replaces the `dev-cluster` and
`ipfs-expose` runners, the one completion of each stage per cycle, and the share without a lease.

## Context

A workstation runs the development stages of a content cycle against a local Kind cluster. Before
this decision, nothing named that cluster:

- `node bin run dev-cluster --expose --dev --kind` and `node bin run ipfs-expose` started
  `kubectl port-forward` children in the current kubeconfig context. On a host whose context pointed
  at production, `127.0.0.1:27017` was the production primary. `dev-cluster` without `--expose`
  reset the whole cluster, and `--remove` killed whatever process held the ports.
- A development stage checked only that the database was not the replica set of the baseline. It did
  not know which cluster, which database or which host it wrote to.
- A stage completed once per cycle. A restore on one workstation made every workstation look
  restored, and a recreated cluster kept the restore of the cluster it replaced.
- The share had no expiry. A crash left no end in the journal, and the token went through stdout in
  a form log redaction did not recognize.
- The Studio view read the database of its own engine. On a workstation that database holds no
  production cycle, so the view showed an empty list where a shared cycle existed.

## Terms

| Term                | Meaning                                                                  | Example                                |
| ------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| Node role           | The infrastructure identity of a host                                    | `workstation`                          |
| WireGuard peer      | The private network identity of a host                                   | `homelab-a-asus-a15`                   |
| Development Sandbox | An isolated development cluster a workstation hosts, with its services   | the Kind cluster `kind`                |
| Cluster provider    | The technology that hosts a sandbox                                      | `kind`                                 |
| Kubernetes context  | The kubeconfig context of a sandbox                                      | `kind-kind`                            |
| Execution target    | What a stage completes for: a deployment, a sandbox or a source checkout | `sandbox:homelab-a-asus-a15/kind`      |
| Target fingerprint  | The digest of one incarnation of a target                                | `sha256:…`                             |
| Data target         | The database a development command writes                                | the replica set of the sandbox MongoDB |

## Decisions

1. **`workstation` stays the Underpost role.** A sandbox is not a role, not a WireGuard peer and not
   a fleet member. `kind` is not in `NODE_ROLES`, and no Kind node gets a peer. A fleet node (`hub`,
   `control`, `worker`) runs no sandbox: `underpost sandbox up` refuses it. A host with no node
   document may run one.
2. **Kind is a provider of the sandbox.** Underpost owns the sandbox in `src/cli/sandbox.js`:
   `underpost sandbox up | status | down`. The provider table holds Kind only; another provider adds
   a row, and no product changes. The sandbox id is the name of its Kind cluster, `kind` by default,
   the cluster `underpost cluster` creates. A product name in the id would put a product in the
   platform.
3. **The identity of a sandbox comes from the cluster.** `resolve` reads Kind, the kubeconfig and the
   cluster: the context, its API server (it must be on loopback), the uid of `kube-system` and of the
   namespace, and the node document of the host. The fingerprint is the sha256 of these facts. A
   recreated cluster has new uids, so it has a new fingerprint under the same names. No caller
   supplies the identity.
4. **One session holds the forwards.** `up` creates the default cluster when it is missing and
   provisions MongoDB and Valkey (IPFS with `--ipfs`) only when the cluster lacks them, through
   `underpost cluster`. It never resets a cluster, a database or a volume. Each forward is pinned to
   the sandbox context and binds `127.0.0.1`. A host lock gives one session per sandbox; a port in use
   refuses the session, and the sandbox never stops a process it did not start. The session checks
   each service with its own protocol, opens again a forward that exits or fails two checks, follows
   a MongoDB election, and ends when the cluster identity changes. Every forward stops with the
   session process, also on SIGKILL. `run dev` and `run metadata` open the same session in process.
5. **The current context must be the sandbox.** Provisioning and the MongoDB primary lookup use the
   current context, so `up` refuses another one. `--dev` still selects the development configuration
   of a product; it never selects a cluster. `run dev` refuses `--kubeadm` and `--k3s`.
6. **A development write needs the sandbox.** A Cyberia restore, workspace reset or drop and source
   export with `--dev` resolve their target from the development database of the deploy: a live
   session of this host must forward its MongoDB on that address. A listening port is never proof. The
   target adds the replica set id and the database names to the sandbox fingerprint. The refusal of
   the replica set of the baseline stays.
7. **Stages complete per execution target.** Each stage declares a target kind: `deployment`,
   `sandbox` or `source`. The cycle keeps one execution per stage and target, linked to the
   execution of the stage before it that it was recorded against. An execution is current while that
   link is current with the same evidence, and while its target, where the host observes it, keeps
   its fingerprint and still holds the evidence. A stage with side effects runs again for a target
   only with `--new-attempt`. The journal keeps each attempt with its target, fingerprint and input.
   Target ids start with the WireGuard peer of the host, and a share accepts only the targets of its
   peer.
8. **The source target is the checkout, not its revision.** The id is the peer and the path of the
   `cyberia-content` checkout; the fingerprint is its path, remote, branch and git directory. The
   revision changes between the export and the review, so it is evidence: `source-review` keeps it,
   and a later commit makes the review stale.
9. **The share has a bounded life.** A share lives `--hours` (8, at most 24), renews a lease on the
   cycle every 30 seconds and lapses 90 seconds after the last renewal. `revoke-share` ends it at
   once. The cycle keeps the sha256 of the token. The journal records the open, the close, the expiry
   and the revocation, and each event a share records names the share. The next command on the
   control node records a lapsed share as expired. The value of the share is a URL with the token as
   its user part: every log redaction rule treats it as a credential.
10. **`ContentLifecycleCyberia` is a read-only monitor.** The engine decides the source of the cycles
    on the server: a share when the engine holds one, the central runtime database in a container or
    on a node with `kubernetes-administration`, its own development database anywhere else. It never
    decides by `NODE_ENV` alone. A workstation engine reads the shared cycle through its share client,
    so the browser never calls the control node and never sees the token. Outside a container, the
    engine also reports its Development Sandbox apart from the cycle. The container uses its OCI
    environment and cluster-internal services; it reports no sandbox. A share that is expired,
    revoked, refused or unreachable, and a tunnel that is down, show as such, never as an empty list.

## Alternatives considered

- **Keep `dev-cluster --expose` and add checks to it.** The runner mixed reset, provisioning and
  forwarding behind flags, and its forwards had no owner. Rejected for one session command.
- **A product-named Kind cluster such as `cyberia-dev`.** The platform names its Kind nodes
  `kind-control-plane` and `kind-worker` in image loads and node lookups. A second name splits that,
  and a product name does not belong in the platform. Rejected.
- **A new target id for each incarnation.** The monitor would list dead clusters as completed
  targets. A stable id with a fingerprint shows one row that turns stale. Chosen.
- **Port offsets for parallel sandboxes.** Replica set clients resolve the member names of the set
  through `/etc/hosts` to one port. Rejected: one session exposes at a time; the model holds any
  number of sandboxes.
- **A listing grant for a workstation.** No workflow needs one yet. A share opens one cycle. Rejected
  until a workflow needs it.
- **The browser calls the share.** The token would reach the browser. Rejected for the server-side
  share client.

## Consequences

- `node bin run dev-cluster` and `node bin run ipfs-expose` are removed. `node bin sandbox up`
  replaces both.
- A development stage fails with exit code `3` when no sandbox session serves the development
  database.
- The cycle schema replaces `stages` with `executions` and adds `shares`. A cycle started before this
  change shows each stage as pending: cancel it and start a new cycle. Its journal stays.
- A share value from before this change is not a valid value: open a new share.
- The monitor shows the target of each stage, the executions of other targets, the shares and the
  sandbox.

## Migration

1. On the control node, cancel each open cycle with a reason, for example
   `cyberia content lifecycle cancel <cycle-id> --reason "per-target stages, ADR 0009"`.
2. On each workstation, stop any `run dev-cluster` or `run expose` forward, select the sandbox
   context, and run `node bin sandbox up`.
3. Start a new cycle and a new share.

[Run a Development Sandbox](../../nexodev/how-to/run-a-development-sandbox.md) has the sandbox steps.
[Run a content lifecycle](../../cyberia/how-to/run-a-content-lifecycle.md) has the workflow.
[The content lifecycle](../../cyberia/explanation/content-lifecycle.md) has the model.
