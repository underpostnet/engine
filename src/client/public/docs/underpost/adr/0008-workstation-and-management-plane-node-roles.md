# ADR 0008 — Workstation and management-plane node roles

## Status

Accepted. Amends decisions 3 and 4 of [ADR 0007](0007-cyberia-content-lifecycle-orchestration.md)
and replaces its lifecycle share.

## Context

The WireGuard topology of Underpost has three node roles. The `hub` is the public edge: HAProxy, the
forward proxy and the tunnel hub. The `control` node is the Kubernetes control plane and the only
cluster administrator. A `worker` is a Kubernetes node. Each role takes its capabilities from one
table, `src/server/network/node-capability.js`.

The Cyberia content lifecycle needs a fourth machine: a computer that a person operates to restore a
baseline, reset a development workspace, export live content and author the source. That machine
needs the private network to reach the control node. It needs no cluster membership.

Before this decision, the machine had no Underpost identity:

- A Cyberia variable, `CYBERIA_LIFECYCLE_CONTEXTS`, gave a host with no node document its authoring
  contexts. A product variable stood in for infrastructure identity.
- Control and worker nodes took the authoring contexts too, so a control node could reset a
  development workspace with `--dev`.
- The tunnel trusted every peer. Each spoke put `wg0` in the firewalld `trusted` zone, and the hub
  forwarded all traffic between peers. A new peer reached every port of every node: the Kubernetes
  API, the kubelet, SSH and MongoDB.
- The fleet sync, the spoke probe and the SSH repair took every peer as a fleet node. A sync replaces
  the checkout of its target.
- The lifecycle share forwarded the MongoDB primary to the WireGuard network. The development host
  then held production database credentials and could write any field of any cycle.

## Terms

| Term                               | Meaning                                                      | Example                                        |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Node role                          | The infrastructure function and trust boundary of a host     | `hub`, `control`, `worker`, `workstation`      |
| Capability                         | One infrastructure operation that a role may do              | `wireguard-spoke`, `kubernetes-administration` |
| Environment                        | The target of one command                                    | `development`, `production`                    |
| Execution context                  | A product responsibility in one workflow                     | `content-development`, `production-deployment` |
| Actor                              | The person or service that runs a command                    | `operator@laptop`                              |
| Kubernetes control plane           | The Kubernetes API and its management components             | kube-apiserver on the `control` node           |
| Infrastructure management plane    | The hosts and services that provision infrastructure         | the bare-metal provisioning controller         |
| Bare-metal provisioning controller | The MAAS region and rack controller of `underpost baremetal` | `snap.maas` and PostgreSQL 17 on the LAN host  |
| Developer workstation              | A computer that a person operates to author content          | a laptop enrolled as `workstation`             |

## Decisions

1. **A fourth role, `workstation`.** It is a machine class, not an environment: one workstation
   works with development and production artifacts and keeps its role. `development` names an
   environment, `developer` names an actor, and `incubation` names no infrastructure function. An
   unattended job executor is a different class: it needs its own profile, not this role.
2. **A workstation is a WireGuard peer, not a Kubernetes node.** It holds `host-configuration` and
   `wireguard-spoke` only. It holds no `kubernetes-node`, no cluster administration, no
   `event-service`, no edge capability, no `node-metrics` and no `baremetal-provisioning`.
3. **Fleet membership is a capability.** `fleet-member` (hub, control, worker) means that the fleet
   syncs the checkout, probes the tunnel and repairs it over SSH. A workstation is not a fleet member:
   its operator owns its checkout, and an offline laptop is not an incident. The cluster node list
   holds the roles with `kubernetes-node` only.
4. **Fail closed.** An unknown role holds no capability. `--node-config` refuses a role outside the
   table. The hub restricts a peer that no node document names.
5. **The node document keeps its peer.** `--node-config` refuses to move an existing document to
   another peer or hub. The hostname selects the document, so a second machine with the same hostname
   needs its own hostname. `--wireguard-setup` refuses a document whose peer is registered at the
   management address of another machine, so that machine cannot write its key over the key of the
   peer.
6. **Least privilege on the tunnel.** The hub applies one packet filter to each peer outside the
   fleet: it opens only TCP `7735`, the workstation port, on fleet peers, and it accepts no new
   connection to that peer. The workstation keeps its tunnel in the default firewall zone, routes no
   pod traffic and enables no IP forwarding. A workstation peer claims only its own `/32`: it is
   never the default peer and routes no host and no instance. WireGuard binds the source address of
   each packet to the key of its peer, so the hub filter applies to the peer, not to an address that
   a host can choose.
7. **Bare-metal provisioning stays on the control node.** The audit found the provisioning
   controller in `src/cli/baremetal.js` and `scripts/maas-setup.sh`: a MAAS region and rack controller
   (`snap install maas`, `maas init region+rack`) on the host that runs the command, with PostgreSQL
   17 on the same host (`src/cli/maas-database.js`). It is not a Kubernetes workload. It needs the host
   LAN for DHCP, TFTP and PXE, root on that host and the MAAS host keys; it needs no WireGuard peer and
   no Kubernetes access. The documentation places it on the control host. This is case A: the
   `control` role holds `baremetal-provisioning`, and `underpost baremetal` refuses a role without it.
   A host with no node document stays free, so a new LAN host can install the controller before it
   joins the fleet. No `management` role exists until a provisioning controller runs on a separate
   host. The audited control node has no MAAS installed.
8. **Cyberia derives its contexts from the Underpost role.** A Cyberia table, `CONTEXT_POLICY`, gives
   each context one role, a capability that role must hold, and an environment or checkout:

   | Context                  | Role          | Capability                  | Needs                        |
   | ------------------------ | ------------- | --------------------------- | ---------------------------- |
   | `infrastructure-control` | `control`     | `kubernetes-administration` |                              |
   | `production-deployment`  | `control`     | `kubernetes-administration` | the production environment   |
   | `content-development`    | `workstation` | `wireguard-spoke`           | the development environment  |
   | `source-authoring`       | `workstation` | `wireguard-spoke`           | a `cyberia-content` checkout |

   A worker and a hub take no context. `--dev` grants nothing. A host must hold a context to note an
   operation in a cycle. `CYBERIA_LIFECYCLE_CONTEXTS` is removed. Underpost keeps no Cyberia
   capability.

9. **The lifecycle share is an authenticated service, not a database forward.** `cyberia content
lifecycle share <cycle-id> --peer-id <peer-id>` runs on the control node. It resolves the peer
   from the topology, checks that its node document names a role that takes `content-development`
   on the same hub, and binds an HTTP service to the tunnel address of the control node at the
   workstation port. Each request must come from the tunnel address of that peer and carry the token
   of the share. The service takes the node of the caller from the topology, never from the request.
   It serves one cycle: it reads the cycle and its journal, records the stages of the workstation
   role, and notes its operations. It journals a refused stage attempt as `stage.refused` and leaves
   the stage as it is. The workstation holds no database credential of production. The share stops
   on Ctrl+C, on the loss of its tunnel address and on the end of the database forward; then no port
   listens.

## Alternatives considered

- **Use the role name `development`.** It mixes a machine with the target of a command. Rejected.
- **Map a workstation to `worker`.** It would give the workstation Kubernetes node runtime, the fleet
  sync and the repair, and give every worker the authoring stages. Rejected.
- **Keep `CYBERIA_LIFECYCLE_CONTEXTS`.** Any host could take authoring contexts by setting a variable.
  Infrastructure identity belongs to Underpost. Rejected.
- **Forward MongoDB with a narrow database user.** A MongoDB role limits collections, not cycles or
  stages: the workstation could still write a production stage of any cycle. It also needs a user
  in production for each share. Rejected for the authenticated service.
- **Add a `management` or `baremetal-controller` role now.** No separate provisioning host exists, and
  one service on the control node is not a machine class. Rejected until a separate host exists.
- **Filter on each spoke instead of the hub.** Every spoke routes the tunnel network through the hub,
  so the hub sees each packet between peers. A filter on each spoke needs the workstation list on
  every node. Rejected; the share also checks the source address of each request.

## Consequences

- A workstation enrolls as any peer: a unique hostname, its peer and node document on the sync
  source, a fleet rollout, then `--wireguard-setup` on the workstation.
- A new peer is restricted until the hub reads its node document. The hub applies the filter at
  `--wireguard-setup`, `--peer-add`, `--peer-remove` and each start of the tunnel. `--status` on the
  hub shows the policy of each peer.
- A development host must be enrolled as `workstation`. A worker and a control node no longer take
  the development stages.
- The hub drops all traffic of a workstation to another port, also to the Kubernetes API and SSH.
- `underpost baremetal` refuses every role but `control`.
- The share needs this engine on the control node and on the workstation.

## Migration and compatibility

1. Deploy this engine to the hub, then run `node bin wireguard --status` there and read
   `peerPolicies`: every fleet peer must show `fleet`.
2. Run `node bin wireguard --wireguard-setup` on the hub to apply the filter to the live tunnel.
3. Enroll each development host as a workstation peer.
4. Remove `CYBERIA_LIFECYCLE_CONTEXTS` and `CYBERIA_LIFECYCLE_MONGO_HOST` from every environment: the
   lifecycle reads neither.

[Run the edge hub](../../nexodev/how-to/run-the-edge-hub.md#workstation-peers) has the enrollment
steps. [Roll out a network change](../../nexodev/how-to/roll-out-a-network-change.md) has the order of
the rollout. [Run a content lifecycle](../../cyberia/how-to/run-a-content-lifecycle.md) has the share.
