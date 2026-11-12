# ADR 0011 — Cluster topology and node-group scheduling

## Status

Accepted. Profiles and their resolution are in [ADR 0010](0010-namespace-placement.md); the node roles
of the fleet are in [ADR 0008](0008-workstation-and-management-plane-node-roles.md).

## Context

A cluster of Underpost has one control-plane node, one or more application workers, and later storage
or other nodes. Each environment of each cluster has its own machines, while many clusters share one
placement profile. Two earlier forms did not fit:

- An earlier `conf.cluster.json` named Kubernetes nodes in the placement, so the placement served one
  cluster only.
- A later one bound each node role to one node record, so a group of workers was not possible.

The private node registry already knows each machine: its host, its peer and its connection.

## Decisions

1. **Node groups per environment.** A scheduling rule of a profile names a node group, never a machine.
   `environments.<env>.nodes.groups.<group>` lists the node records of the group: any number, and a
   record can be a member of more than one group. A group name is a free DNS label: `control`,
   `workers`, `storage` or any other need no change of Underpost.
2. **The node registry owns the machine.** `engine-private/deploy/nodes/<record>.json` holds the host,
   the peer and the Kubernetes node of a machine (`kubernetesNodeName`). The `role` of a record stays the
   fleet role of ADR 0008: it never makes a record a member of a group.
3. **Kubernetes node identity.** `namespace nodes identify <record> --kubernetes-node <node>` records the
   node of a record, after a check that the cluster has it when the cluster answers. A capture and
   `namespace nodes audit` report the live nodes no record names, and the record that can name each.
   Nothing writes an observed name into a record.
4. **One resolution chain.** The node of a resource comes from the command option, else from the rule of
   its category (the overrides, else the profile), its group, the records of the group and their
   Kubernetes nodes. A group without a member, a missing record, a record without a Kubernetes node, or
   two records with one node refuse, and the message names the fix. Nothing takes the hostname, an
   address or the node of a source pod in their place.
5. **Three modes.** `required` renders a required node affinity on the `kubernetes.io/hostname` label
   of each node of the group, with the operator `In`; `preferred` renders the same term as a preferred
   affinity; `scheduler` renders nothing. The scheduler chooses among the nodes of the group. The label
   is the one the node carries. A toleration of the control-plane taint is added when a node of the group
   carries it, and no other.
6. **Native scheduling stays native.** A DaemonSet keeps its own placement: `node-exporter` runs on every
   eligible node. Upstream components keep the scheduling of their installers. Underpost labels no node.
7. **One node where state is local.** A node group is a scheduling rule, not storage replication. The
   Underpost ingress listens on the host network; the gateway, Grafana and the operational CronJobs keep
   state on a host path; a MongoDB reset wipes the host it runs on. Each refuses a group of more than one
   node, unless its command option names the node. MongoDB, MariaDB, MySQL and PostgreSQL keep their data
   on a static host path volume without node affinity (`hostPathData`): their scheduling refuses a group
   of more than one node, because a member placed on another node starts on an empty directory. A
   datastore on the `local-path` provisioner binds its volume to the node of its first pod, so a group of
   several nodes is safe for it. The safe models are one local volume pinned to its node, shared storage
   with the access mode the workload needs, or one volume per replica where the application supports it.
8. **A workload volume on one node.** A hostPath volume of a workload (`conf.volume.json`) holds what its
   pods write on one node, and its PersistentVolume pins the pods to that node. Its manifest refuses a
   group of more than one node before any data ships. A remote node receives the data through the peer
   connection of its record: the management host of `conf.wireguard.json` and the SSH user of
   `conf.users.json`; a user other than root writes through `sudo`. `--ssh-key-path` replaces only the
   key of that connection, never its user or its host, and the deploy logs each replacement.
9. **One storage planner for every move.** `src/server/runtime/storage-placement.js` reads where the data
   of a controller lives: each host path volume of its pod template on the nodes its pods run on, and each
   claim bound to a host path or local volume on the nodes of its node affinity, the claim of each
   StatefulSet ordinal included. A node that does not hold that data refuses the move, and so does a
   topology Underpost cannot read, a host path no live pod locates, and a StatefulSet whose ordinals share
   a written volume of its pod template. A volume without a host path is attachable storage and moves.
   Underpost moves no data between nodes.
10. **`run node-move` keeps the scheduling it does not own.** It resolves the cluster through the target,
    refuses a node that is not Ready, is cordoned, has a taint the pods do not tolerate, or that a
    nodeSelector key or the required node affinity it does not set excludes, and asks the storage planner.
    It sets its nodeSelector keys with a merge patch and records them in the
    `underpost.net/node-placement` annotation; `--remove` removes only those keys, each after a test of its
    value. It waits for the rollout and fails when a pod runs elsewhere or stays Pending. It moves
    Deployments, StatefulSets, DaemonSets and the pod template of CronJobs, and refuses any other kind.
11. **Visibility.** `namespace nodes` lists each group with its records, Kubernetes nodes, peer
    connections and live node states. `namespace resolve <resource>` prints the profile, the group, the
    records, the nodes, what the latest capture observes and the migration. `namespace env` exports
    `UNDERPOST_NODES_<CATEGORY>`, and a deploy script waits until one node of the group is Ready.

## Alternatives considered

- **Node names in the placement.** A placement that names machines serves one cluster only.
  Rejected for node groups.
- **One record per role.** One worker per environment. Rejected for groups of any size.
- **A fixed enum of node types.** Each new kind of node would change the schema. Rejected for free group
  names.
- **Labels on the nodes.** A label is a second source of membership that the cluster holds and Underpost
  must keep in step. Rejected for affinity on the hostname label.
- **`spec.nodeName`.** It bypasses the scheduler and its checks. Rejected.
- **The record role as membership.** The fleet role is a trust boundary of a host, not a placement.
  Rejected.
- **The InternalIP and a key flag for remote volumes.** The cluster address is not the management
  address, and a key path is a second credential source. Rejected for the peer connection.

## Consequences

- `wireguard --node-config --kubernetes-node-name` is gone: the WireGuard command owns connectivity only.
- `namespace nodes`, `namespace nodes audit` (exit 3 on an error) and `namespace nodes identify` exist.
- The dashboards group each node by the Kubernetes node its record names.
- A live workload placed on nodes loses its hostname node selector and takes the node affinity.
- `UNDERPOST_NODE_<CATEGORY>` is `UNDERPOST_NODES_<CATEGORY>`, separated by spaces.
- The migration names the nodes of the data of each claim from the same planner records
  ([ADR 0012](0012-resource-migration-and-recreation.md)).
- A single-node group is an availability boundary: the node, its host paths and the Underpost ingress on
  its host network fail together. No group is shared or highly available storage.

## Verification

Before multi-node placement is ready for production, a disposable cluster with the production
distribution, storage provisioner, Gateway controller, cert-manager, node labels, taints and reclaim
policies runs: a workload group of two nodes, a datastore group of one node, a migration of one datastore,
a pod rescheduled to its other node, a `node-move` of a local volume to another node (refused), and the
refusals of decisions 7, 8 and 9. The tests read a fake cluster until then.

## Operational constraints

- A workload whose data lives on a node, a host path or a local volume, moves to no node that does not
  hold that data: `run node-move` refuses it, and Underpost moves no data between nodes.

## Known limitations

- Underpost has no shared storage: a datastore of several nodes needs one outside it.

## Verification pending

- The verification above, on a disposable multi-node cluster: the tests read a fake cluster until then.

[Place resources in namespaces](../../nexodev/how-to/place-resources-in-namespaces.md) has the steps.
