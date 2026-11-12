# Place resources in namespaces

Underpost places each resource it deploys in a Kubernetes namespace and on a group of nodes. A
placement profile names the namespace of each resource and the node group of each category.
`engine-private/deploy/conf.cluster.json` selects a profile for each environment and lists the machines
of each node group. Every command and every deploy script reads them through one resolver.
[ADR 0010](../../underpost/adr/0010-namespace-placement.md) records the placement decisions,
[ADR 0011](../../underpost/adr/0011-cluster-topology-and-node-group-scheduling.md) the node groups and
[ADR 0012](../../underpost/adr/0012-resource-migration-and-recreation.md) the migrations.

## The placed resources

The legacy profile places each resource where Underpost has always placed it, and the recommended
profile where a new cluster places it. Underpost creates and labels the namespaces it owns. An upstream
installer owns its own namespace, and Underpost never moves what it installs.

| Resource           | Role          | Legacy                 | Recommended               | Owner     | Workloads                                     |
| ------------------ | ------------- | ---------------------- | ------------------------- | --------- | --------------------------------------------- |
| `workloads`        | workload      | `default`              | `underpost-workloads`     | Underpost | The `dd-*` Deployments, Services and routes   |
| `releases`         | release       | `default`              | `underpost-releases`      | Underpost | Content release and runtime index Jobs        |
| `platform`         | platform      | `default`              | `underpost-platform`      | Underpost | `underpost-gateway`, `underpost-ingress`      |
| `operations`       | operations    | `default`              | `underpost-operations`    | Underpost | The CronJobs labeled `managed-by: underpost`  |
| `observability`    | observability | `default`              | `underpost-observability` | Underpost | Prometheus, Grafana, Alertmanager, exporters  |
| `mongodb`          | datastore     | `default`              | `underpost-data`          | Underpost | StatefulSet `mongodb`, `mongodb-service`      |
| `mariadb`          | datastore     | `default`              | `underpost-data`          | Underpost | StatefulSet `mariadb-statefulset`, `mariadb`  |
| `mysql`            | datastore     | `default`              | `underpost-data`          | Underpost | StatefulSet `mysql`                           |
| `postgresql`       | datastore     | `default`              | `underpost-data`          | Underpost | StatefulSet `postgres`                        |
| `valkey`           | datastore     | `default`              | `underpost-data`          | Underpost | StatefulSet and Service `valkey-service`      |
| `ipfs`             | datastore     | `default`              | `underpost-data`          | Underpost | StatefulSet and Service `ipfs-cluster`        |
| `kafka`            | datastore     | `kafka`                | fixed                     | Underpost | Its manifest names the namespace of its peers |
| `contour`          | addon         | `projectcontour`       | fixed                     | upstream  | Project Contour and its Envoy                 |
| `envoyGateway`     | addon         | `envoy-gateway-system` | `envoy-gateway-system`    | upstream  | Envoy Gateway                                 |
| `certManager`      | addon         | `cert-manager`         | `cert-manager`            | upstream  | cert-manager                                  |
| `calico`           | system        | `calico-system`        | fixed                     | upstream  | Calico                                        |
| `calicoApiserver`  | system        | `calico-apiserver`     | fixed                     | upstream  | The Calico API server                         |
| `tigeraOperator`   | system        | `tigera-operator`      | fixed                     | upstream  | The Tigera operator                           |
| `coreDns`          | system        | `kube-system`          | fixed                     | upstream  | CoreDNS                                       |
| `localPathStorage` | system        | `local-path-storage`   | fixed                     | upstream  | The Local Path Provisioner                    |

The catalog also names the cluster-scoped objects of each resource: the storage classes, the gateway
PersistentVolume, the Prometheus ClusterRole and its binding, and the ClusterIssuer. Every resource but
the workloads is optional: its namespace is necessary only while it runs. Underpost never creates the
namespace of a datastore it does not install.

Each resource Underpost installs can move: a migration recreates it in its new namespace.
[Plan and run a migration](#plan-and-run-a-migration) describes it.

## The four sources of a placement

| Source       | Where                                                                                          | What it holds                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Profile      | `underpost.cluster.config.js` → `profiles.<id>`, or `engine-private/deploy/profiles/<id>.json` | A namespace per resource and a node group per category. No machine.                 |
| Environment  | `conf.cluster.json` → `environments.<env>`                                                     | Its context, its domain, its profile, its overrides, the members of its node groups |
| Node record  | `engine-private/deploy/nodes/<record>.json`                                                    | The host, the peer and the Kubernetes node of one machine                           |
| Live cluster | `engine-private/deploy/captures/<env>/*.json`                                                  | What the cluster runs, read-only                                                    |

A profile says where a resource belongs. An environment says which machines form each node group. A
node record says which Kubernetes node a machine is. A capture says what runs now. No source repeats
another.

## Profiles

Underpost ships two profiles in `underpost.cluster.config.js`, the cluster configuration beside
`underpost.config.js`: `recommended`, one namespace per responsibility, and `legacy`, every resource where
it has always run. Both files are part of the package and of the base template, and a package update
replaces them.

```bash
node bin namespace profile list
node bin namespace profile show recommended
```

```js
const config = {
  profiles: {
    recommended: {
      namespaces: {
        workloads: 'underpost-workloads',
        releases: 'underpost-releases',
        platform: 'underpost-platform',
        operations: 'underpost-operations',
        observability: 'underpost-observability',
        datastores: { mongodb: 'underpost-data', valkey: 'underpost-data', ipfs: 'underpost-data' /* ... */ },
        addons: { envoyGateway: 'envoy-gateway-system', certManager: 'cert-manager' },
      },
      scheduling: {
        workloads: { group: 'workers', mode: 'required' },
        datastores: { group: 'control', mode: 'required' },
        releases: { group: 'control', mode: 'required' },
        operations: { group: 'control', mode: 'required' },
        observability: { group: 'control', mode: 'required' },
        platform: { group: 'control', mode: 'required' },
      },
    },
    legacy: {/* ... */},
  },
};

export default config;
```

A custom profile is a file of `engine-private/deploy/profiles/`, named `<id>.json`, with the shape of a
built-in profile: `namespaces` and `scheduling`. Its file name is its id. Copy a built-in profile and change
its namespaces or rules. Rules for every custom profile:

- It names every configurable resource and every category: a profile has no fallback and no
  inheritance.
- Its file name is not the id of a built-in profile.
- It names no machine, peer, address, credential or context.
- A group name is a free DNS label: `storage`, `gpu` or any other needs no change of Underpost.

## Configure an environment

Generate the configuration once:

```bash
node bin new --cluster                        # a new cluster: the recommended profile
node bin new --cluster --placement legacy     # an existing cluster: every resource where it runs today
```

Without the file, a cluster command that names no context stops, and its message names
`node bin new --cluster`. A rerun keeps the file.
An invalid file stops the rerun before it writes a file. The file references a profile and never
copies it. Each generated environment names its `routing` and `tls`, and has `"context": null` and
`"cluster": null` until you adopt its cluster (see [Adopt a captured cluster](#adopt-a-captured-cluster)). A
generated production section lists the node groups of the profile without a member: list the node records
before you deploy (see [Schedule resources on node groups](#schedule-resources-on-node-groups)).

```json
{
  "environments": {
    "production": {
      "context": "kubernetes-admin@kubernetes",
      "cluster": { "fingerprint": "16e54db1-fe40-48e2-995f-39158d9ae4d1" },
      "clusterDomain": "cluster.local",
      "profile": "recommended",
      "routing": { "provider": "gateway-api" },
      "tls": { "mode": "cert-manager", "issuer": "letsencrypt-prod" },
      "nodes": {
        "groups": {
          "control": ["localhost.localdomain"],
          "workers": ["hp-envy-iso-ram-rocky9", "worker-02"]
        }
      },
      "overrides": { "namespaces": { "datastores": { "valkey": "dd-cache" } } }
    },
    "development": {
      "context": null,
      "cluster": null,
      "profile": "recommended",
      "routing": { "provider": "gateway-api" },
      "tls": { "mode": "self-signed" },
      "overrides": { "scheduling": { "workloads": { "mode": "scheduler" }, "datastores": { "mode": "scheduler" } } }
    }
  }
}
```

- `profile` is required: a built-in or a custom profile id.
- `overrides` changes the `namespaces` or the `scheduling` rules of the profile for that environment
  only. Keep it small: a large override is a custom profile.
- `nodes.groups` lists the node records of each group of the environment (see below).
- `context` is the kubeconfig context of the environment, and `cluster` the identity of its cluster:
  `fingerprint` (the UID of `kube-system`) and, optionally, the API `servers`. `null` means not configured:
  a command in that environment needs `--context` or `--current-context`. An empty string is refused. See
  [The context of a command](#the-context-of-a-command).
- `routing` is `{"provider": "gateway-api"}` or `{"provider": "contour"}`, and `tls` is
  `{"mode": "cert-manager", "issuer": "<ClusterIssuer>"}`, `{"mode": "self-signed"}` or `{"mode": "none"}`.
  `null` means not configured: a change in that environment is refused. Every environment that deploys
  needs both.
- `clusterDomain` is the DNS domain of the cluster, `cluster.local` by default. Every cluster DNS name
  Underpost builds ends with it.
- Each environment is independent: no section reads another. An environment the file lacks takes the
  legacy profile.
- A namespace is a lowercase DNS label of at most 63 characters. An unknown key, a
  resource in the wrong group, or a fixed resource refuses the file, and the message names the key.
- The file holds no credential, address or peer. The sync of a deployment repository never copies it,
  nor its backups, captures or migration plans.

A command resolves the namespace of a resource in this order:

1. Its own option: `--namespace-mongodb`, `--namespace-platform`, and so on.
2. The legacy `--namespace`. It places the workloads only.
3. The migration that moves it: its source until its destination is ready, then its destination. See
   [Plan and run a migration](#plan-and-run-a-migration).
4. The overrides of the environment: the `[env]` argument, `--env`, else `--dev` selects it.
5. The profile of the environment.

```bash
node bin namespace resolve                         # every resource, its namespace, its nodes and their sources
node bin namespace resolve mongodb --env production   # one resource: profile, group, records, nodes, capture, migration
node bin namespace resolve workloads --deploy-id dd-core   # one deployment, which a migration moves with its group
```

The source of each answer names the option or the key, for example
`environments.production.overrides.namespaces.datastores.valkey` or
`the recommended profile: namespaces.datastores.mongodb`. For one resource:

```text
mongodb (production)
  profile           recommended
  namespace         underpost-data (the recommended profile: namespaces.datastores.mongodb)
  node group        control, required (the recommended profile: scheduling.datastores)
  group members     ./engine-private/deploy/nodes/localhost.localdomain.json
  Kubernetes nodes  localhost.localdomain
  observed          StatefulSet/default/mongodb on hp-envy-iso-ram-rocky9, localhost.localdomain (capture 20261109T...)
  migration         plan 20261109T...: datastores/mongodb default → underpost-data, runs in its source
```

## Schedule resources on node groups

The scheduling of a profile maps each category of resources to a node group and a mode. The categories
are `workloads` (every deployment and its instances), `datastores` (every datastore), `releases`,
`operations`, `observability` and `platform`.

| Mode        | Pods run                                             | Rendered as                                                       |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `required`  | Only on the nodes of the group                       | A required node affinity: `kubernetes.io/hostname` `In` the nodes |
| `preferred` | On the nodes of the group first, else on other nodes | A preferred node affinity with the same term                      |
| `scheduler` | Where the Kubernetes scheduler chooses               | Nothing                                                           |

An environment lists the node records of each group in `nodes.groups`. A record is the file name of
`engine-private/deploy/nodes/<record>.json`, not a Kubernetes node, an address or a peer. A group can
hold any number of records, and a record can be a member of more than one group. The `role` of a record
is its fleet role ([ADR 0008](../../underpost/adr/0008-workstation-and-management-plane-node-roles.md)):
it never makes it a member of a group.

Record the Kubernetes node of each record once, after a check against the cluster:

```bash
node bin namespace nodes identify hp-envy-iso-ram-rocky9 --kubernetes-node hp-envy-iso-ram-rocky9          # preview
node bin namespace nodes identify hp-envy-iso-ram-rocky9 --kubernetes-node hp-envy-iso-ram-rocky9 --apply  # write
node bin namespace nodes --env production         # each group: records, Kubernetes nodes, peers, node states
node bin namespace nodes audit --env production   # what is wrong, and the record that can name each live node
```

A command resolves the nodes of a resource in this order:

1. Its own option: `--node` for `deploy`, `--node-name` for `cluster`, `cron`, `monitor` and `run`,
   `--ingress-node` for the Underpost ingress.
2. The rule of its category: the overrides, else the profile.
3. The members of its group: `environments.<env>.nodes.groups.<group>`.
4. The `kubernetesNodeName` of each member.

A group without a member, a missing record, a record without a Kubernetes node, and two records with one
node each refuse, and the message names the command that fixes it. No command takes the hostname, an
address or the node of a source pod in their place.

Each installer renders the affinity into the pod template it submits, on the `kubernetes.io/hostname`
label each node carries, and a toleration of the `node-role.kubernetes.io/control-plane` taint when a node
of the group carries it. No other taint is tolerated. Upstream components keep the scheduling of their
installers. A DaemonSet such as `node-exporter` keeps its own placement: it runs on every eligible node.

A node group is a scheduling rule, not storage replication. Some resources keep their state on one host,
and refuse a group of more than one node unless the option of their command names the node: the Underpost
ingress (host network), the gateway, Grafana, the operational CronJobs (they mount the checkout of their
node), and a MongoDB reset (it wipes the host it runs on). MongoDB, MariaDB, MySQL and PostgreSQL keep
their data on a host path volume without node affinity, and refuse a group of more than one node: a member
placed on another node would start on an empty directory. A datastore on the `local-path` provisioner,
such as IPFS Cluster, binds its volume to the node of its first pod, and takes a group of several nodes.

The hostPath volume of a workload (`conf.volume.json`) holds what its pods write on one node, and its
PersistentVolume pins the pods to it. Its manifest refuses a group of more than one node before any data
ships. The deploy writes on this machine itself, and ships to a remote node through the peer of its
record: the management host of `conf.wireguard.json` and its SSH user in `conf.users.json`. A user other
than root writes through `sudo`. `--ssh-key-path` replaces only the key of that peer, never its user, and
the deploy logs it. Where the scheduler places the workloads, the volume goes to this host (`kind-worker`
on kind).

```bash
node bin namespace env --env production   # UNDERPOST_NODES_<CATEGORY>='<node> <node>' for each category with a group
```

The deploy scripts read `UNDERPOST_NODES_<CATEGORY>` from `cluster_placement`, and wait until one node of
the workloads is Ready; no script names a node.

Two clusters can share one profile with their own machines: each environment lists its own records.

```json
{ "profile": "recommended", "nodes": { "groups": { "control": ["lab-control"], "workers": ["lab-w1", "lab-w2"] } } }
{ "profile": "recommended", "nodes": { "groups": { "control": ["edge-control"], "workers": ["edge-w1"] } } }
```

A future storage group needs a custom profile whose `datastores` rule names it, and its members:

```json
{
  "profile": "storage-split",
  "nodes": { "groups": { "control": ["control-1"], "workers": ["worker-1"], "storage": ["nas-1", "nas-2"] } }
}
```

Underpost provisions no storage for it: a group only places pods.

A placement that puts every datastore and the platform on one control-plane node makes that node a
single failure domain, and their pods share its capacity with the Kubernetes control plane. Three MongoDB
replicas on one node give no node-level high availability.

## The context of a command

Before each command, the CLI resolves its cluster target once: the environment, the context and where
the context comes from, the kubeconfig files, the declared cluster identity, the Kubernetes distribution
the command names, the execution profile and a digest of the section of the environment. Every command
it starts inherits that target. The first that applies wins:

1. A context a migration plan, a new cluster or the sandbox names.
2. The target of the command that started this one, for the same environment. A child that names
   another `--context` is refused.
3. `--context <name>`, an option of every command.
4. `--current-context`, an option of every command.
5. The service account, inside a container.
6. `environments.<env>.context` of `conf.cluster.json`.

No environment falls back to the current context. A section whose `context` is `null`, or missing, does
not identify a cluster: every `kubectl` and Helm command of the command is refused before it runs, unless
it names its own `--context` or `--kubeconfig`. The refusal names the key and the fix:
`node bin namespace capture --env <env> --context <context>`, then
`node bin namespace adopt --env <env> --write-config` writes the captured context and identity into the
section, and keeps every other field.

A command also refuses `--context` with `--current-context`, `--dev` with another `--env`, and two of
`--kind`, `--kubeadm` and `--k3s`. A command that only reads local files needs no context.

A change needs more than a context. Each environment declares its `routing` and its `tls`, and production
its `cluster` identity: the `fingerprint`, the UID of `kube-system`, and, when every client reaches the
API server through one address, its `servers`:

```json
"production": {
  "context": "kubernetes-admin@kubernetes",
  "cluster": { "fingerprint": "3f2a1b0c-5d4e-4f60-8a7b-9c0d1e2f3a4b", "servers": ["https://192.168.1.85:6443"] },
  "routing": { "provider": "gateway-api" },
  "tls": { "mode": "cert-manager", "issuer": "letsencrypt-prod" }
}
```

`node bin namespace target --env production` prints the target, what its context reaches, the value to
declare and what refuses a change (exit 3). `namespace adopt --write-config` writes the identity a
capture observes. Leave `servers` out when the nodes and your workstation reach the API server through
different addresses.

For a context, the CLI lists a file that sets only `current-context` ahead of your kubeconfig files in
`KUBECONFIG`, for that command and every command it starts. Your kubeconfig and its current context stay
as they are, and `kubectl` runs as you. The first change of a command, and every cluster command under
`--context` or `--current-context`, verifies the cluster against the declared identity, refuses another
one before anything runs, and prints the target once:

```text
Environment  production
Context      kubernetes-admin@kubernetes (environments.production.context)
Cluster      https://192.168.1.85:6443 (kube-system 3f2a1b0c-5d4e-4f60-8a7b-9c0d1e2f3a4b), verified
Profile      LIVE_CLUSTER
```

`migrate` reaches the context its plan recorded, and checks the cluster identity. Without a context,
`app apply` checks the production endpoints against the placement only.

A deploy script reads the placement once, after the host is prepared:

```bash
cluster_placement                 # deploy/lib/host.sh: runs node bin namespace env --env $DEPLOY_ENV
cluster_kubectl get deployments -n "$UNDERPOST_NAMESPACE_WORKLOADS"
```

`node bin namespace env` prints one line of shell assignments: `UNDERPOST_KUBECONFIG`,
`UNDERPOST_CONTEXT`, `UNDERPOST_CLUSTER_DOMAIN` and `UNDERPOST_NAMESPACE_<RESOURCE>` for each resource.
No deploy script names a namespace or a context.

## Three placements

The namespace commands compare three placements:

- **Observed**: where each resource runs now. Every command that reads the cluster observes it, and
  `capture` saves it.
- **Desired**: what `conf.cluster.json` names.
- **Effective**: where every command reaches a resource now. It is the desired placement, except
  while a migration moves the resource: then it is its source until its destination is ready, and its
  destination after it. A deployment of the workloads has its own effective placement.

`adopt` makes the desired placement equal to the observed one. `migrate` recreates resources one unit
at a time. The desired placement can name the target from the start, for example a recommended file that
a deployment repository keeps: commands, deploys, `node bin db` and the scheduled backups still reach
each resource where it runs. A migration writes the configuration only when the last unit of a
resource completes. `node bin namespace resolve` prints the effective and the desired namespace of each
resource, and the migration unit that places it.

## Read the state of a cluster

```bash
node bin namespace status --env production
node bin namespace audit --env production
```

`status` prints the context, the cluster identity and version, the configuration section, the count
of each resource, node and endpoint state, the missing namespaces, the optional resources that do not
run, the migration in progress, the blockers, and the next command to run. `audit` prints each
namespace, resource with its node state, endpoint and finding. Both read only. `audit` exits `3` when it
finds an error.

| Resource state         | Meaning                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `placed`               | It runs only in the namespace of the placement                    |
| `pending-migration`    | It runs only in another namespace                                 |
| `destination-prepared` | It runs in the namespace of the placement and in another one      |
| `duplicate`            | An Underpost CronJob runs active in two namespaces: it runs twice |
| `not-deployed`         | It does not run                                                   |
| `fixed`                | Its manifest or its installer names its namespace                 |

| Node state          | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `placed`            | Every pod runs on a node of its group, or anywhere for a preferred group   |
| `node-mismatch`     | A pod runs off its required group: a recreation, or a migration, moves it  |
| `node-missing`      | The cluster has no node of a member of the group                           |
| `node-not-ready`    | No node of the group is Ready                                              |
| `scheduler-pending` | The scheduler cannot place a pod; the finding names the node               |
| `unbound`           | The group of the resource resolves to no node; the finding names the fix   |
| `daemonset`         | Only a DaemonSet runs the resource: it places a pod on every eligible node |

| Finding                    | Severity | Meaning                                                            |
| -------------------------- | -------- | ------------------------------------------------------------------ |
| `cluster`                  | error    | The cluster does not answer, or its production context is not set  |
| `context-missing`          | error    | The kubeconfig has no context the placement names                  |
| `duplicate`                | error    | A schedule runs in two namespaces                                  |
| `missing-service`          | error    | A resource runs in its namespace without one of its Services       |
| `unbound`                  | error    | See the node states                                                |
| `node-missing`             | error    | See the node states                                                |
| `node-not-ready`           | error    | See the node states                                                |
| `scheduler-pending`        | error    | See the node states                                                |
| `node-mismatch`            | warning  | See the node states                                                |
| `namespace-terminating`    | error    | A placed namespace is being deleted                                |
| `endpoint-stale`           | error    | See the endpoint states                                            |
| `endpoint-missing-service` | error    | See the endpoint states                                            |
| `gateway-stale`            | error    | An owned Gateway stays where its deployment no longer runs         |
| `gateway-not-programmed`   | error    | The Gateway class does not program a Gateway                       |
| `listener-conflicted`      | error    | A listener conflicts with a listener of another Gateway            |
| `listener-unresolved`      | error    | A listener does not resolve its TLS Secret                         |
| `gateway-not-accepted`     | error    | The controller does not accept a Gateway                           |
| `listener-not-accepted`    | error    | The controller does not accept a listener                          |
| `route-backend-missing`    | error    | A route sends requests to a Service that does not exist            |
| `proxy-invalid`            | error    | Contour marks an HTTPProxy invalid                                 |
| `policy-section-missing`   | error    | A policy targets a listener its Gateway does not have              |
| `environment-incomplete`   | error    | The environment names no routing provider or no TLS policy         |
| `pending-migration`        | warning  | A resource runs in another namespace than the placement            |
| `destination-prepared`     | warning  | A resource runs in the placement and still in its source           |
| `endpoint-unknown`         | warning  | See the endpoint states                                            |
| `namespace-missing`        | warning  | A namespace Underpost owns does not exist: `reconcile` creates it  |
| `namespace-unlabeled`      | warning  | An owned namespace has no `app.kubernetes.io/managed-by` label     |
| `context-unset`            | warning  | The placement names no context: kubectl uses the current one       |
| `gateway-class-mismatch`   | warning  | A labeled Gateway has another GatewayClass than the configured one |
| `route-unresolved`         | warning  | A Gateway does not accept a route, or the route names no backend   |
| `routing-stale`            | warning  | A route or policy names a deleted Gateway that serves elsewhere    |
| `routing-unowned`          | warning  | An unlabeled Gateway collides with an owned one, with other hosts  |
| `routing-orphaned`         | warning  | A route or policy of a stale Gateway that Underpost does not own   |
| `routing-dangling`         | warning  | A route or policy attaches to no live Gateway                      |

The routing findings come from `node bin ingress audit`, which owns them. The audit also lists the findings
of the TLS of each host (`tls-*`, `certificate-*`, `issuer-*`, `acme-*`, `cert-manager-*`). `node bin tls
audit` owns them: [Manage TLS certificates](manage-tls-certificates.md) lists each
one. A deployment no routing object serves is not a placement finding, so `tls-unrouted` is left out.

A deploy reports the `gateway-stale`, `routing-stale`, `routing-orphaned` and `routing-unowned` findings
of its deployment as a warning, with the `node bin ingress reconcile` command that removes them. A stale
Gateway with the same hosts conflicts with each listener of the new Gateway, and each host answers 404.

## Check the endpoints of a deployment

The pods of a deployment read its container environment: the env file of the environment, its OCI
overlay (`.env.<env>.oci`), and the endpoint layer of Underpost. The workloads read it from their
Secret, and the release Jobs from the `data-release` Secret. A pod also writes the env file and its
overlay from its configuration checkout. That checkout holds no placement, so the endpoint values of
the Secret win over the files.

The endpoint layer sets each host of `DB_HOST`, `VALKEY_HOST`, `MARIADB_HOST` and `IPFS_*_URL` that
names the Service of its resource to the fully qualified name of that Service in its effective
namespace: `<member>.<service>.<namespace>.svc.<cluster-domain>`. It keeps the credential, every
replica set member, the ports, the database and the query options. It leaves an external host, an
IP address and any other key as they are. So no environment file names a namespace: the same file
works before, during and after a migration, and Underpost never rewrites it.

```text
.env.production.oci   DB_HOST=mongodb://app:***@mongodb-0.mongodb-service.underpost-data.svc.cluster.local:27017/app?replicaSet=rs0
MongoDB runs in default until it is ready in underpost-data; the Secret carries
                      DB_HOST=mongodb://app:***@mongodb-0.mongodb-service.default.svc.cluster.local:27017/app?replicaSet=rs0
```

Each endpoint has a state against the Services of the live cluster:

| State             | Severity | Meaning                                                                                                |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `placed`          |          | The pods reach the Service where it runs                                                               |
| `missing-service` | error    | The effective namespace holds no such Service                                                          |
| `stale`           | error    | A literal database host of `conf.server.json`, which Underpost cannot project, names another namespace |
| `external`        |          | A domain name outside the cluster                                                                      |
| `unknown`         | warning  | An IP address, a single label, or a cluster name the catalog does not place                            |

Without the cluster, nothing is checked against it, and every entry says so. Each endpoint is one
entry with the deployments and files that read it.

`app apply` projects the effective environment, logs each endpoint the layer changes (hosts only),
and checks it against the live Services when the cluster answers. An error stops it unless `--force`.
`app load` on a workstation reads the env file without its overlay or the layer: a host process
reaches the Development Sandbox through `127.0.0.1`.

## Capture the live cluster

```bash
node bin namespace capture --env production
```

A capture is a read-only, versioned record of the cluster:
`engine-private/deploy/captures/<env>/<id>.json`, mode `0600`, ignored by git. Each read names the
configured context. It records the context, the cluster identity (the UID of `kube-system`), the API
server, the Kubernetes version and the cluster DNS domain; the namespaces; the controllers with their
labels, replicas, schedules, ServiceAccounts and the Secrets, ConfigMaps and claims they use; the
Services and their selectors; the claims, volumes, storage classes and snapshots; the
ServiceAccounts, Roles, RoleBindings, NetworkPolicies and ResourceQuotas; the Gateways, HTTPRoutes,
ReferenceGrants, HTTPProxies, Ingresses and Certificates; the nodes with their roles, readiness and
taints, and the nodes the pods of each controller run on; the cluster DNS names that the controllers
and ConfigMaps hold; and the dependencies between these objects. Its output names, for each node, the
record that names it, or a record that can: `namespace nodes identify` records it.

It keeps the keys of a Secret or a ConfigMap, never a value, and no annotation. It creates no
namespace, labels nothing, restarts nothing, changes no kubeconfig and writes no configuration or node
record.

**A capture is not a backup.** It holds no data, no Secret and no manifest to restore. `node bin db`
backs up the databases.

## Adopt a captured cluster

```bash
node bin namespace adopt --env production                      # preview
node bin namespace adopt --env production --write-config       # write
```

Adoption turns a capture (`--capture <id>`, `latest` by default) into the configuration section of
its environment: the namespace where each resource runs, as overrides of its profile, the context of
the capture and its cluster domain. It changes only `conf.cluster.json`: no workload, no namespace and
no environment file. It keeps the profile, the scheduling and the node groups; a new section takes the
legacy profile. An override equal to the profile goes.

- An optional resource that does not run stays out of the section: it keeps its profile.
- A resource that runs in two namespaces is ambiguous. Name its namespace with
  `--map <resource>=<namespace>`; without it, `--write-config` refuses.
- `--write-config` keeps the other sections, saves the previous file as
  `conf.cluster.json.<time>.bak` (mode `0600`), and replaces the file atomically.

For example, a cluster that runs everything in `default`, with a CronJob copy in
`underpost-operations` from an earlier `cron --apply`:

```text
$ node bin namespace adopt --env production
Placement of production the capture observes:
  context                                  - → kubernetes-admin@kubernetes
  namespaces.workloads                     underpost-workloads → default
  namespaces.datastores.mongodb            underpost-data → default
  ...
Not deployed, left out: mysql, postgresql
Ambiguous: operations runs in default, underpost-operations: name one with --map operations=<namespace>
Preview only: add --write-config to write it. No workload changes either way.
```

After the write, the audit reports no `pending-migration`: the configuration names where everything
runs, and the endpoint layer follows it. No environment file changes.

## Reconcile and repair

```bash
node bin namespace reconcile --env production             # a server dry run
node bin namespace reconcile --env production --apply     # create and label, then verify
node bin namespace repair --env production                # a server dry run
node bin namespace repair --env production --apply
```

`reconcile` creates each missing namespace Underpost owns and labels each one that lacks its label,
with server-side apply under the field manager `underpost`. It never forces a field another manager
owns, and it skips the Kubernetes and upstream namespaces. A second run plans nothing. Its output
names what it never changes: workloads, data, endpoints and volumes.

`repair` does what `reconcile` does, and suspends each Underpost CronJob that runs active outside the
operations namespace while its copy there runs, so one copy owns each schedule. It also repairs the TLS
of each host with `node bin tls reconcile`, and the routing of each deployment with
`node bin ingress reconcile`: it runs the plan of each domain, it implements none.

Every Gateway, route, policy and Certificate that `node bin deploy` creates carries two labels:
`app.kubernetes.io/managed-by: underpost` and `deploy-id: <deploy-id>-<env>`. `repair` changes only
what a deployment of the route table owns. An object is the deployment's when:

- its labels name the deployment, or
- it has no labels and copies the routing of the deployment's labeled Gateway: it names that Gateway,
  and that Gateway serves each of its hosts. A policy names no host: its name starts with the name of
  the Gateway, as `node bin deploy` names it.

Then `repair` does these steps:

1. The TLS of each host goes where the Gateway that serves it runs: the Gateway of its deployment in the
   namespace where the deployment runs. A valid TLS Secret in another namespace is copied, after a check
   that its certificate covers the host and matches its key; a valid Secret in place stays. Each Secret
   gets the cert-manager Certificate that renews it, made from the host, never copied. A Secret without
   a Certificate is an error (`tls-unrenewed`), so a repair never ends with a TLS Secret that nothing
   renews.
2. `repair` waits until each Certificate it creates is Ready.
3. A Gateway is stale when it stays in a namespace where its owner runs no workload, while a Gateway of
   the same name serves the deployment elsewhere. The two collide on their listeners. `repair` removes
   the stale Gateway with the owned routes and policies that attach only to it. An owned route that
   also attaches to another Gateway stays, and `repair` detaches it from the stale one. When the stale
   Gateway is already deleted, `repair` removes the owned routes and policies that still name it.
4. `repair` removes each Certificate of a host whose Ready Certificate replaces it where the host is
   served, with `--cascade=orphan`. Its Secret stays: a private key is data. A Certificate whose
   replacement is not Ready stays too.

`repair` never deletes an object that the deployment does not own. It names each one, with the command
that removes it: `routing-unowned`, `routing-orphaned` and `routing-dangling`. Run that command when
nothing else uses the object. A deployment the route table does not list owns nothing `repair` removes.

Every kubectl call of a repair uses the context of the environment. After it applies, `repair` reads the
cluster again and prints what is left: each blocker, each TLS and routing error, and each Certificate
that is not Ready.

To label the routing objects of a cluster that runs from before the labels, deploy each deployment again:
`node bin deploy` applies its Gateway and routes with them, and `node bin tls reconcile` its Certificates.

`cron --apply` never makes a duplicate: while another namespace runs a schedule, its new copy stays
suspended.

## Plan and run a migration

**A migration can destroy data.** It deletes each source installation, then installs it again in its
destination. Underpost does not back up, copy or restore data. Back up the data you need with
`node bin db` before you start. The plan names what happens to the data of each claim (see below).

```bash
node bin namespace capture --env production
node bin namespace plan --env production --target recommended
node bin namespace migrate --env production --list           # the units in execution order, offline
node bin namespace migrate --env production --status         # what each unit deletes, keeps and installs; the journal
node bin namespace migrate --env production                  # a dry run of every unit against the live cluster
node bin namespace migrate --env production --resource workloads/dd-core --apply
node bin namespace migrate --env production --resource datastores/mongodb --apply --confirm-destructive
node bin namespace migrate --env production --apply --confirm-destructive   # every unit, in order
node bin namespace migrate --env production --verify
node bin namespace migrate --env production --resume --apply --confirm-destructive
```

A plan compares the latest capture (or `--capture <id>`) with a target: a profile (`recommended`,
`legacy` or a custom one), or `configured`, the configuration as it is. A profile target keeps the
node groups and the scheduling overrides of the environment, and drops its namespace overrides. It holds one unit per resource that Underpost installs and that runs outside its target,
and one unit per workload group: a deployment of the route table with its instances, whose routes
attach to its Gateway. An upstream resource is not a unit: the plan names it as a warning. The plan is
stored in `engine-private/deploy/migrations/<id>/`: `plan.json` holds the cluster identity and context,
the capture, the checksum of `conf.cluster.json`, the target section and the units; `state.json` holds
the status and the journal of each unit. Both are mode `0600` and ignored by git.

A full run executes the units in dependency order, and stops at the first unit that does not complete:

| Order | Units                   | Install command                                                                                                                                            |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `datastores/<id>`       | `node bin cluster --<id>`. For MongoDB, `--mongodb --reset-mongodb`: a new replica set on empty volumes, with the destination names                        |
| 2     | `workloads/<deploy-id>` | `node bin deploy --build-manifest`, then `node bin deploy` in the serving colour, then `node bin run instance --traffic <colour>` for each instance family |
| 3     | `releases`              | None: the next release Job runs in the destination                                                                                                         |
| 4     | `operations`            | `node bin cron --apply`                                                                                                                                    |
| 5     | `observability`         | `node bin cluster --grafana`                                                                                                                               |
| 6     | `platform`              | `node bin cluster --gateway-api`: the gateway, and the ingress when both routing stacks run                                                                |

Each install command also names the cluster type, the replicas of the source and
`--namespace-<resource> <destination>`. It names no node: the installer takes the nodes of the target
group, never the node of the source. The plan prints its profile, each command exactly, and for each
unit the nodes its pods run on, the target nodes, and where they come from:

```text
Environment production · target recommended · profile recommended · context kubernetes-admin@kubernetes · ...
datastores/mongodb  pending  default → underpost-data  destructive
   node: hp-envy-iso-ram-rocky9, localhost.localdomain → localhost.localdomain (control, required)
   node group: control from the recommended profile: scheduling.datastores; environments.production.nodes.groups.control → ./engine-private/deploy/nodes/localhost.localdomain.json → localhost.localdomain
```

A unit goes through these statuses. Each run reads the live cluster and continues from what it finds:

| Status                   | What the unit does                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `pending`                | Nothing ran                                                                                                                      |
| `preparing-destination`  | Creates the destination namespace, provides the Secrets of its resource, and prepares the TLS of the hosts of its Gateways       |
| `deleting-source`        | Deletes its controllers and waits for their pods; blocked while a Job that reaches the unit runs                                 |
| `cleaning-source`        | Deletes its other source objects: routes, policies, Gateways, Services, Certificates, Secrets, ConfigMaps, RBAC, claims, volumes |
| `installing-destination` | Runs its install command                                                                                                         |
| `waiting-ready`          | Waits for the rollout of each controller its install creates                                                                     |
| `updating-endpoints`     | Checks that every destination pod runs on its group, then places the resource: commands and endpoints follow                     |
| `restarting-consumers`   | A datastore: `app apply` and a restart of each workload that names its endpoint. The platform: republishes routes                |
| `completed`              | The destination is ready and no source object of the unit remains                                                                |
| `blocked`                | A check stops the unit: the reason names it                                                                                      |
| `failed`                 | An operation failed: the journal holds its message                                                                               |

The preparation of a unit runs `node bin tls` for the hosts of its Gateways. It copies each valid TLS
Secret the destination lacks and creates the Certificate of each Secret placed there. It stops the unit
before anything is deleted when a Secret is placed without its Certificate. The install of a workload unit
ends with `node bin tls reconcile` for its deployment: the issuer then lists the Gateway the deploy
recreated, and each host whose Secret was not valid gets a new certificate.

The plan names the exact source objects of each unit: its controllers, the Services that select them
or that its resource names, its Gateways with the routes that reach them and the policies that target
them, the Certificates of their TLS Secrets, and the Secrets, ConfigMaps,
ServiceAccounts with their RoleBindings, claims and volumes its controllers use. An object that a
controller or a Gateway outside the unit also uses is shared: it stays until the last unit that uses
it goes. A unit never deletes a namespace, a StorageClass, another cluster-scoped object than its own
volumes, or an upstream object. A volume is its own only while its claim is in a source namespace: the
volume an install recreates with the same name stays.

The plan names what the installer does with the data of each unit, what the data of each claim it
deletes becomes, and the CronJobs whose Jobs block it:

```text
   data: its installer empties the host paths it mounts: the destination starts empty
   data: default/mongodb-storage-mongodb-0 → PersistentVolume/mongodb-pv-0 (Retain, node-a:/data/mongodb/v0): the claim and the volume objects are deleted; data discard: its installer (cluster --mongodb --reset-mongodb) empties /data/mongodb/v0 on node-a
   schedule: CronJob/underpost-operations/dd-cron-backup "0 1 * * *": a Job of it blocks the unit while it runs
```

The data lifecycle of each installer is in
[ADR 0012, decision 9](../../underpost/adr/0012-resource-migration-and-recreation.md): MongoDB `reset`,
MariaDB, IPFS and the monitoring stack `fresh`, Valkey `memory`, the workloads and the platform `reuse`.
MySQL and PostgreSQL have none: their units are blocked. The unit deletes the claim and the volume objects,
and the outcome says what the data becomes:

| Outcome             | When                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `reuse`             | The installer mounts the same host path on the same nodes again: the destination starts with the data |
| `retain-unattached` | The volume is `Retain` and nothing mounts the data again: reclaim or remove it yourself               |
| `discard`           | A provisioner deletes a `Delete` volume, or the installer empties the path (`--reset-mongodb`)        |
| `unknown`           | No lifecycle, another reclaim policy, or a node Underpost cannot name: the unit is blocked            |
| `none`              | The claim holds no volume                                                                             |

Underpost deletes no host directory, and backs up, copies, snapshots or restores no data. Deleting a claim
of a `Retain` volume deletes no data: it stays on its host path until you reclaim it.

After each unit, the run reports its cleanup:

```text
datastores/mongodb: completed
  Source namespace cleanup:
    Managed resources found: 5
    Managed resources remaining: 0
    Shared resources preserved: 0
    Data kept on the storage backend: 0
```

The rules of every run:

- A run without `--apply` names the next operation of each unit and changes nothing.
- Before a destructive unit, you back up its datastore (`node bin db`, or a cron backup), stop each writer
  and consumer outside Kubernetes, and choose a window outside the schedules its plan names. A migration
  suspends no CronJob.
- Before a unit deletes anything, each active Job of the CronJobs its plan names blocks it, and so does an
  active release Job for MongoDB and MariaDB. A DNS or Vultr Job blocks no unit.
- A unit deletes no claim while a pod still mounts it, and no source object that was created again after
  the plan (another UID). Capture and plan again.
- A plan whose file changed after planning is refused. Its directory stays as its record.
- A unit that deletes a claim or a volume, or whose installer discards its data (MongoDB, Valkey), runs
  only with `--confirm-destructive`. It never overrides a check of the cluster, the configuration or the
  ownership.
- A run reaches the context of its plan, and refuses another cluster than the cluster of the plan or a
  `conf.cluster.json` that changed outside the plan. Then capture and plan again.
- A unit whose group resolves to no node is blocked: the plan names the fix. A workload install ships
  volume data to each remote node of its group through the peer of its record. Before it deletes
  anything, each run checks that each peer runs a command over SSH, through `sudo -n` for a user other
  than root. A peer that does not answer blocks the unit.
- The MongoDB installer wipes the data of the host it runs on, and refuses a reset when the scheduling
  places the members on another node: run the migration on that node.
- A resource whose environment stores its Secrets (`sops` or `shared`) needs each manifest, and a key of
  this host that opens it. A missing or foreign-sealed manifest blocks the unit before it changes
  anything. See [Secret sources](./manage-secrets-with-sops.md#secret-sources).
- A node of the group that the cluster lacks blocks its units before they delete anything, and so does a
  group where no node is Ready, schedulable and free of a taint nothing tolerates. A destination pod the
  scheduler cannot place keeps its unit at `waiting-ready` with the message of the scheduler.
- A controller that runs in the source of a unit and that the plan does not name blocks the unit.
  Capture and plan again.
- One plan runs at a time in a cluster: a run that changes it holds the Lease
  `kube-system/underpost-namespace-migration`, and another plan, from any host, is refused. After an
  interruption, `--resume` of the same plan on the same host takes it again. If no process runs the plan
  that holds it, remove it: `kubectl delete lease underpost-namespace-migration -n kube-system`.
- A run never deletes an object twice: `--resume` continues each unit from what the cluster holds.
- A deletion that does not end within its timeout fails the unit. Underpost never removes a finalizer.
- A unit is down from its deletion until its destination is ready. Its consumers fail until they
  restart. A scheduled job that starts meanwhile can fail, or back up an empty datastore.
- A recreation cannot be undone. A plan back to the previous placement recreates each unit again.
- The configuration changes when the last unit of a resource completes. No run rewrites an
  environment file, forces a field or writes a Secret value into a log.
- A sync resets `engine-private` to its remote, and so the `conf.cluster.json` of the node. Push the
  configuration from the node that runs the plan before the next sync. The plan and its journal stay:
  `engine-private` ignores them.

### Example: move a cluster that runs in default to the recommended placement

The configuration names the recommended placement, and everything runs in `default`.

1. List the node records of each group of production: see
   [Schedule resources on node groups](#schedule-resources-on-node-groups).
2. `node bin namespace capture --env production --current-context`
3. `node bin namespace plan --env production --target recommended`, then `migrate --list` and
   `migrate --status`: read the nodes of each unit and what it deletes and keeps.
4. Back up the data you need.
5. `node bin namespace migrate --env production --apply --confirm-destructive`: the datastores, the
   deployments, the operations, observability and the platform, in that order.
6. `node bin namespace migrate --env production --verify`: each unit is `completed`, and no source
   object remains. `node bin namespace audit --env production` reports each node state `placed`.
7. Commit and push `engine-private/deploy/conf.cluster.json` from the node that ran the plan.

## Security and isolation

A namespace is a scope for names and policies, not a security boundary by itself. Add these controls:

- RBAC: give each ServiceAccount the verbs it needs, in its own namespace. The release Jobs read only
  their Secret, and the CronJobs reach the host over SSH: both run with the default ServiceAccount of
  their namespace, which calls no Kubernetes API.
- Secrets: a pod reads only the Secrets of its own namespace. `app apply` projects each scope into
  the namespace of its consumers. The store keys each workload Secret by its environment and its
  resource, never by its namespace, so a migration provides it in the destination from the same
  manifest.
- NetworkPolicies: allow the workloads, the release Jobs and the operations to reach the datastore
  ports, and deny the rest.
- Pod Security Admission: label each namespace with the level its pods meet.
- ResourceQuotas and LimitRanges: bound each namespace.
- Storage: a hostPath volume gives a pod the files of its node; keep them to the datastores and the
  gateway.
- DNS: a short Service name resolves only in its own namespace; use the names the audit names.
