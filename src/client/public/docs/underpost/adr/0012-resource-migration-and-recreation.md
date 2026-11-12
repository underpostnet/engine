# ADR 0012 — Resource migration and recreation

## Status

Accepted. The placement a migration reaches is in [ADR 0010](0010-namespace-placement.md), and its
nodes in [ADR 0011](0011-cluster-topology-and-node-group-scheduling.md).

## Context

A live cluster that ran everything in `default` had no way to record what ran, to adopt it, or to move
a resource safely. A `cron --apply` into a new namespace left the old CronJob active, so a schedule ran
twice. A StatefulSet keeps its volumes in its namespace, so no field change moves it.

## Decisions

1. **Observed, configured and target placements.** One read-only observation of the cluster feeds
   `status`, `audit`, `capture`, `adopt`, `repair` and each migration step, and one comparison gives the
   state of each resource, node and endpoint. A capture saves the observation in
   `engine-private/deploy/captures/<env>/`: the cluster identity is the UID of `kube-system`; it keeps the
   keys of a Secret or a ConfigMap, never a value, and the nodes each controller runs on. A capture is not
   a backup, and it writes no configuration.
2. **Adoption writes configuration only.** `namespace adopt` turns a capture into the overrides of the
   profile of its environment: the namespace where each resource runs, the captured context and domain.
   A new section takes the legacy profile. It keeps the profile, the scheduling and the node groups,
   omits an optional resource that does not run, refuses to guess a resource that runs in two namespaces,
   backs up the file and writes it atomically.
3. **Migrations are plans of units, executed by the CLI.** `namespace plan` stores the units from a
   capture to a target (a profile, or the configuration as it is) in
   `engine-private/deploy/migrations/<id>/`, with the cluster identity and the checksum of the
   configuration: one unit per workload group (a deployment with its instances) and one per other
   resource that Underpost installs, in dependency order: datastores, workloads, releases, operations,
   observability, platform. A profile target keeps the node groups and the scheduling overrides of the
   environment. `namespace migrate` revalidates both, derives the status of each unit from the live
   cluster, executes its operations through the Underpost commands, and journals each operation and
   check. A full run stops at the first unit that does not complete.
4. **The cluster of the plan.** A migration reaches the context of its plan and checks the cluster
   identity before each run. `cron --apply` keeps a new copy suspended while another namespace runs its
   schedule.
5. **Placement follows a migration.** The resolver returns the effective placement: the unit that moves
   a resource places it in its source until its destination is ready and in its destination after it; a
   deployment of the workloads resolves to the unit of its group. The configuration stays the desired
   placement: it can name the target from the start, and a migration writes it when the last unit of a
   resource completes. When a datastore is placed in its destination, the migration projects and
   restarts each consumer.
6. **One strategy: recreate.** A unit first prepares its destination: the namespace, the Secrets of its
   resource from the source its environment declares, and the TLS of the hosts of its Gateways through
   the TLS domain ([ADR 0015](0015-tls-lifecycle-and-the-acme-issuer.md)): each valid TLS Secret and the
   Certificate that renews it. A TLS Secret placed without its Certificate fails the step, before
   anything is deleted. A missing or foreign-sealed stored Secret blocks the unit before this step. The unit then deletes its source
   installation, installs it again in its destination with the command the catalog names for its
   resource, waits until it is ready, places it there, restarts its consumers and verifies that no source
   object remains. It backs up, copies, snapshots and restores no data: `node bin db` and the cron backup
   jobs back up, and they stay outside the migration. Host ports, host network and volumes change only the
   order: the source goes first. An upstream resource is not a unit.
7. **Nodes before deletion.** A unit installs on the nodes of its target group, never on the node of its
   source. Before it deletes anything, it is blocked when its group has no node, when the cluster lacks a
   node of the group, when no node of the group is Ready, schedulable and free of a taint nothing
   tolerates, or when the peer connection of a remote node that receives volume data refuses a command.
8. **Exact ownership, one confirmation.** The plan names the source objects of each unit: its
   controllers, the Services that select them or that its resource names, its Gateways and their routes,
   and the Secrets, ConfigMaps, ServiceAccounts, RoleBindings, claims and volumes its controllers use. An
   object that a controller outside the unit also uses stays until the last unit that uses it goes. A run
   deletes only planned objects that still exist, and a controller the plan does not name blocks the
   unit. A unit that deletes a claim or a volume, or whose installer discards its data (`reset`,
   `memory`), runs only with `--confirm-destructive`, which overrides no check.
9. **The data lifecycle of each installer.** The catalog declares what the installer of each resource does
   with its data in another namespace (`data` of `NAMESPACE_RESOURCES`, read from the installer and its
   manifests):

   | Resource      | Lifecycle | What the installer does                                                                                     |
   | ------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
   | MongoDB       | `reset`   | `cluster --mongodb --reset-mongodb` empties `/data/mongodb/v<n>` of this host and renders its volumes again |
   | MariaDB       | `fresh`   | Its StatefulSet claims a new local-path volume (`Retain`) from its claim template                           |
   | IPFS Cluster  | `fresh`   | Its StatefulSet claims new local-path volumes (`Retain`) from its claim templates                           |
   | Valkey        | `memory`  | It mounts no volume: its data goes with its pods                                                            |
   | Workloads     | `reuse`   | `deploy` renders each host path volume again for its new claim and copies its files over it                 |
   | Platform      | `reuse`   | `cluster --gateway-api` binds `pv-underpost-gateway` and its host path to the new claim                     |
   | Observability | `fresh`   | Grafana claims a new local-path volume; the Prometheus data is an `emptyDir`                                |
   | MySQL         | none      | `manifests/mysql` binds its only volume to `mysql-pv-claim`, never to the claim of its StatefulSet          |
   | PostgreSQL    | none      | `manifests/postgresql/pv.yaml` binds its volume to a claim of the namespace `default` only                  |

   A resource without a lifecycle cannot move: the planner refuses to delete its claims.

10. **Exact data outcomes.** A unit deletes the claim and the volume objects of its source; the plan names,
    for each claim, its volume, its reclaim policy, the nodes and host path of its data, and what the data
    becomes, from the lifecycle of the installer and the nodes of the destination:
    - `reuse`: the installer mounts the same host path on the same nodes again (`reuse`): the destination
      starts with this data.
    - `retain-unattached`: the volume is `Retain`, and nothing mounts the data again: the installer
      provisions a new volume (`fresh`), or the destination runs on other nodes. An operator reclaims or
      removes it; Underpost deletes no host directory.
    - `discard`: a provisioner deletes the data with a `Delete` volume, or the installer empties its host
      path on the same nodes (`reset`).
    - `unknown`: no lifecycle, a reclaim policy other than `Retain` and `Delete`, a `Delete` volume without a
      provisioner, a host path whose node or destination node nothing names, or a node topology Underpost
      cannot read. The unit is blocked.
    - `none`: the claim is bound to no volume.

    A host path volume without node affinity holds its data on the node of the pod that mounts its claim.
    Deleting a `Retain` claim deletes no data: the plan never names that `discard`.

11. **The operator owns the maintenance window.** A migration suspends no CronJob. The plan names the
    Underpost CronJobs whose Jobs reach each unit, with their schedules: the CronJobs the unit deletes, and,
    for a resource with database providers (MongoDB, MariaDB), the cron jobs that read or write the
    datastores (`backup`). Before a unit deletes anything, each active Job of those CronJobs, and for such a
    resource each active release Job, blocks it. A DNS or Vultr Job blocks no unit. The unit deletes its
    source controllers with foreground deletion, so their pods are gone first, and it deletes no claim while
    a pod still mounts it.
12. **A plan matches the cluster it was made from.** The plan records the UID of each object it deletes and
    an integrity digest of itself. A run refuses a plan whose file changed after planning, and blocks a unit
    whose source object has another UID than the plan names: something created it again, and the unit
    deletes no object the plan did not observe. Capture and plan again.
13. **One plan at a time in a cluster.** A run that changes the cluster holds the Lease
    `kube-system/underpost-namespace-migration`, whose holder names the host and the plan, and gives it back
    when it ends. Another plan, from any host, is refused while the Lease is held. The same plan on the same
    host takes it again after an interrupted run. The host lock still serializes the processes of one plan on
    one host. A dry run and `--verify` take no Lease.

## Alternatives considered

- **Automatic migration in `reconcile`.** A StatefulSet keeps its volumes in its namespace. Rejected for a
  planned migration.
- **A capture with full manifests.** It would copy Secret values and last-applied annotations into a file
  on a laptop. Rejected for keys and references only.
- **A capture that writes the configuration.** Observed state would overwrite a chosen profile or node
  group. Rejected: adoption writes namespaces only, on request.
- **Copy the live CronJob into the new namespace.** The generator owns the CronJob spec. Rejected for
  `cron --apply` into the destination, which stays suspended, and a handover.
- **The configuration as the only source while a migration runs.** A configuration that names the target
  sends deploys and backups to empty namespaces. Rejected for the effective placement of decision 5.
- **A generic volume handover.** A local volume has a node, and a released volume can stay unbound.
  Rejected.
- **An adapter per resource that keeps data or traffic.** Backup and restore per datastore, parallel
  copies, traffic switches and rollbacks cost one tested adapter per storage and per resource. Rejected
  for one destructive strategy: the operator accepts the downtime and the loss of data.
- **Suspend every Underpost CronJob while a unit deletes data.** It changed DNS, WireGuard and monitoring
  schedules that reach no datastore, and resumed them on behalf of the operator. Rejected for decision 11.
- **A data outcome inferred from the reclaim policy and the host path alone.** It named MariaDB data
  `keep-in-place`, while its claim template gives the destination a new volume. Rejected for the lifecycle
  each installer declares.
- **Migrations from the control node only.** The control node and the operator laptop share a host name, so
  no host check tells them apart. Rejected for the Lease of decision 13.
- **`kubectl delete all` or a namespace deletion.** `all` misses Secrets, ConfigMaps, claims and routes,
  and a namespace holds other resources. Rejected for the planned objects of each unit.
- **Printed commands for the operator.** Each copied command is a chance to diverge from the plan.
  Rejected: the CLI executes them and journals them.

## Consequences

- `migrate --step`, `backup-restore`, `handover`, `reinstall`, `--approve`, `--rollback` and
  `--ssh-key-path` are gone, and so are the `quiesce` and `resume` operations. A plan of another schema
  steers no placement, and `migrate` refuses it: capture and plan again.
- A capture has schema 3: the UID of each object, the nodes of each volume and the claims each pod
  mounts. A plan has schema 9: the node group, mode, records, Kubernetes nodes and observed nodes of each
  unit, the data lifecycle of its installer, the outcome of each claim, the CronJobs that block it, the UIDs
  of its objects and its integrity digest. A plan of another schema, or without its digest, is refused; its
  directory stays as its record.
- The audit reports `unbound`, `node-missing`, `node-not-ready` and `scheduler-pending` as errors, and
  `node-mismatch` as a warning; a pending migration and a missing namespace are warnings.

## Design decisions

- A migration backs up, copies, snapshots and restores no data (decisions 6 and 10). `node bin db` and the
  cron backup jobs back up, outside the migration.
- A migration suspends and resumes no schedule (decision 11).
- A capture is an inventory, not a backup (decision 1).
- A resource in its target namespace on the wrong node is no migration unit: the audit reports
  `node-mismatch`, and its installer recreates it on its nodes.

## Operational constraints

- Back up each datastore a destructive unit reaches first, with `node bin db` or a cron backup.
- Stop each writer and consumer outside Kubernetes before a destructive datastore unit.
- Run a unit outside the schedules its plan names, or suspend those CronJobs yourself and resume them after.
- A plan runs from the host that holds its directory: its journal is a file there.

## Known limitations

- No writer outside Kubernetes is detected.
- MySQL and PostgreSQL have no data lifecycle (decision 9): a plan blocks their units until their
  manifests bind a volume to a claim of any namespace.
- A Lease left by a process that stopped without its `finally` stays until the same plan runs again on the
  same host, or an operator deletes it.

## Verification pending

- A migration on a disposable cluster with the storage provisioner and the controller types of production,
  with the checksum of the data of each datastore before and after its unit:
  [Verify on a disposable cluster](../../nexodev/how-to/verify-on-a-disposable-cluster.md), steps 4 and 5.

[Place resources in namespaces](../../nexodev/how-to/place-resources-in-namespaces.md) has the steps.
