# ADR 0010 — Kubernetes resource placement and profiles

## Status

Accepted. [ADR 0011](0011-cluster-topology-and-node-group-scheduling.md) owns the nodes,
[ADR 0012](0012-resource-migration-and-recreation.md) the migration of a placement,
[ADR 0013](0013-command-execution-and-privileges.md) the execution of commands, and
[ADR 0015](0015-tls-lifecycle-and-the-acme-issuer.md) the TLS of the hosts.

## Context

Underpost read one `options.namespace` for every resource, and each module repeated the fallback
`'default'`. A datastore could not run apart from the workloads, and nothing reported where each
resource ran. More defects shared the cause:

- Each `kubectl` used the current context of the operator. `cluster --ns-use` changed that context, and
  `cluster --chown` overwrote `~/.kube/config` and lost every other context.
- In-cluster hosts were short Service names, and `svc.cluster.local` was a literal in many modules.
- Deploy scripts named the namespace `default` themselves, and the Secret of a release Job went to
  the workloads namespace.
- An earlier configuration copied the recommended profile into each private file, so a package
  update could not change it, and two clusters could not share it.

## Decisions

1. **Placement profiles.** A profile names the namespace of every configurable resource and the rule of
   every scheduling category ([ADR 0011](0011-cluster-topology-and-node-group-scheduling.md)). It names
   no machine, peer, address, credential or context. Underpost ships `recommended` and `legacy` in
   `underpost.cluster.config.js`, beside `underpost.config.js`; the package and the base template carry
   both, and a package release versions them. An administrator keeps custom
   profiles in `engine-private/deploy/profiles/`, one complete `<id>.json` each. A custom profile with
   the id of a built-in one refuses. A profile has no inheritance: it holds its whole definition.
2. **One configuration per cluster host.** `engine-private/deploy/conf.cluster.json` holds, for each
   environment (`production`, `development`, `test`), the kubeconfig `context`, the cluster DNS
   `clusterDomain`, the `profile` it selects, its `overrides` (namespaces or scheduling rules), its
   node groups, its `routing` provider, its `tls` policy and its `cluster` identity: the `fingerprint`
   (the UID of `kube-system`) and, when every client reaches it through known endpoints, the API
   `servers`. One parser validates every section. `null`, or no key, leaves `context`, `cluster`, `routing`
   or `tls` not configured: an environment without a cluster yet. Any other value must be valid, an empty
   string is no value, and an error names the JSON path. A command in an environment without a context, a
   change without `routing` or `tls`, and a change in production without `cluster` are refused before they
   run, and the message names the key and the command that fills it. `namespace adopt` writes the context
   and the identity a capture observes; `namespace target` prints them. It references a profile and never
   copies one. It is host configuration:
   `conf.server.json` keeps the application configuration, and the sync of a deployment repository never
   copies it.
3. **Independent environments.** No section inherits from another. An environment the file lacks takes
   the legacy profile, where each resource has always run, so `development` never resolves to production
   infrastructure.
4. **Generation.** `new --cluster` writes a configuration on the recommended profile, and
   `new --cluster --placement legacy` one on the legacy profile to adopt a cluster. Production lists each
   node group of the profile without a member; development and test leave every category to the
   scheduler. Each environment names its `routing` and `tls`, and `context` and `cluster` are `null` until
   an adoption writes them. A rerun keeps an existing file and refuses an invalid or older one. The package
   and the base template carry the same generator, so both write this file.
5. **One resource catalog.** `NAMESPACE_RESOURCES` in `src/cli/namespace.js` names each resource: its
   role (workload, release, platform, operations, observability, datastore, addon, system), whether it
   is optional, the namespace its manifest fixes, the controllers, Services and cluster-scoped objects
   that identify it, and the endpoint keys and database providers that address it. Underpost owns the
   namespaces of every role but addon and system.
6. **One resolver.** `Underpost.namespace.resolve` returns the namespace, the Services, the context, the
   cluster domain, the environment and the source of the value. Precedence: the resource option, the
   legacy `--namespace` (the workloads only), the migration that moves the resource
   ([ADR 0012](0012-resource-migration-and-recreation.md)), the overrides, the profile. The source names
   the option, the plan, the override key or the profile key. An entry point never writes a resolved value
   back into `options.namespace`; it carries the environment in `options.env`.
7. **One cluster target per process.** Before each command, `Underpost.namespace.target` resolves an
   immutable target: the environment, the context and its source, the kubeconfig files, the declared
   cluster identity, the Kubernetes distribution the command names, the execution profile, a digest of
   the section of the environment, the blockers of a change and the refusal of the target. The first that
   applies wins: a context a plan, a new cluster or the sandbox names; the target of the command that
   started this process for the same environment; `--context`; `--current-context`; the service account
   inside a container; `environments.<env>.context`. No environment falls back to the current context: a
   target without a context is refused. A child command that names another `--context` than the target
   it inherits is refused, and so are `--context` with `--current-context`, `--dev` with another `--env`,
   and two of `--kind`, `--kubeadm` and `--k3s` (`image` loads one archive into each runtime it names).
   The target rides on `UNDERPOST_CLUSTER_TARGET` into each process the command starts, and `sudo` keeps
   it. For a context, the CLI lists a file that sets only `current-context` ahead of the kubeconfig files
   in `KUBECONFIG`: every `kubectl` and Helm command reaches it, and no kubeconfig changes.
   The subprocess boundary enforces the target, as it enforces the execution profile: a refused target
   refuses each `kubectl` and Helm command that names no `--context` or `--kubeconfig`, a target with
   blockers refuses each change through it, and the first change through it, and every cluster command
   under `--context` or `--current-context`, verifies the cluster: the fingerprint, and the API server
   when `servers` lists any, must be the declared ones. It verifies once per process tree and context, then
   prints the environment, the context and its source, the API server, the fingerprint and the execution
   profile. A container is the cluster of its service account: it declares nothing and verifies nothing.
   `HERMETIC_BUILD` and `OFFLINE_DRY_RUN` elide each cluster command before the target applies, so a
   local build needs no context.
8. **One DNS rule.** `serviceDnsName` in `src/server/network/service-dns.js` builds
   `[<member>.]<service>.<namespace>.svc.<cluster domain>[:<port>]` for every module. `serviceHost` gives
   the short name only where the workloads and the release Jobs share the namespace of the Service.
9. **Cross-namespace routes.** The Gateway admits routes of its own namespace, so the HTTPRoutes stay
   beside it, with the workloads. A route to the gateway in the platform namespace, or to Grafana in the
   observability namespace, names that namespace, and a ReferenceGrant there admits it.
10. **The endpoint layer.** `app apply` projects the env file, its OCI overlay and an endpoint layer:
    each host of a catalog endpoint key that names the Service of its resource becomes its fully
    qualified name in the effective namespace, with its credential, members, ports and options. The audit
    gives each endpoint a state (`placed`, `missing-service`, `stale`, `external`, `unknown`) against the
    live Services, with the deployments and files that read it. No environment file names a namespace,
    and Underpost never rewrites one. A pod writes its environment from its configuration checkout,
    which holds no placement: the endpoint values of its Secret win over the files.
11. **Secrets go where their consumers run.** `app apply --args scope=data-release` projects into the
    namespace of the release Jobs. A command that deploys an optional resource creates its namespace when
    it is missing. The catalog names the Secrets of each resource as `<resource>/<id>`. The encrypted
    store keys each one by its environment and that reference, and no manifest names a namespace: the
    resolver names it at apply time, so a migration changes no stored file. Each environment declares
    the source of each resource in `environments.<env>.secrets`: `sops`, `shared`, `seed` (the default)
    or `unmanaged`. A stored resource never falls back to its seed files.
12. **Read-only audit, non-destructive reconciliation.** `namespace audit` and `namespace status` change
    nothing. `namespace reconcile` creates and labels only the namespaces Underpost owns, with
    server-side apply under the field manager `underpost`, as a server dry run unless `--apply`, and
    verifies the result. `namespace repair` also suspends an Underpost CronJob that runs outside the
    operations namespace while its copy there runs. It also runs the TLS and routing reconciliation of
    the `tls` and `ingress` domains ([ADR 0014](0014-operational-cli-domains.md)): each TLS Secret goes,
    with the Certificate that renews it, to the namespace of the Gateway that serves its host, after a
    check that it covers the host. Ownership is a label, never a name alone: `node bin deploy` labels each
    Gateway, route and policy, and `node bin tls` each Certificate, with `managed-by: underpost` and
    `deploy-id: <deploy-id>-<env>`. An
    unlabeled object is the deployment's only when it copies the routing of the labeled Gateway: it
    names that Gateway, and that Gateway serves each of its hosts. An owned Gateway that stays where its
    deployment no longer runs goes, with the owned routes and policies that attach only to it, because
    its listeners collide with the live one; when that Gateway is already gone, its owned routes and
    policies go. A Certificate that a Ready Certificate replaces goes with `--cascade=orphan`, and its
    Secret stays. Any other object is reported with the command that removes it, never removed. Repair runs
    every kubectl in the context of the environment, reads the cluster again after it applies, and
    deletes no workload, data or volume.
13. **Deploy scripts ask the CLI.** `namespace env` prints the pinned `KUBECONFIG`, the namespace of each
    resource and the nodes of each category; a refused target refuses it. Each step of a deploy script
    resolves the target from the configuration of its node. `cluster_placement` and `cluster_kubectl` in
    `deploy/lib/host.sh` read it. A command passes its namespace options to the commands it starts, and
    never the legacy `--namespace` as a substitute for one resource.
14. **No schema version.** `conf.cluster.json` and a custom profile hold no version field. Every command
    reads the one shape this document describes, and an unknown key refuses with the key named. Node
    checkouts switch with plain git before the node runs its CLI
    ([run the edge hub](../../nexodev/how-to/run-the-edge-hub.md)), so no CLI reads a configuration of
    another shape during a sync.

## Alternatives considered

- **Namespaces in `conf.server.json`.** It is per deploy and describes the application. Rejected.
- **Inheritance between environments.** A test section that falls back to production names would act
  on production. Rejected for independent sections.
- **The profile copied into the configuration.** A package update could not change it, and
  every private file repeated it. Rejected for a reference.
- **Profile inheritance or partial profiles.** A chain of profiles or a fallback per key hides where a
  value comes from. Rejected: a profile is complete, and overrides stay small.
- **`--context` on each `kubectl`.** About 400 call sites. Rejected for the pin, which also covers Helm and
  nested commands.
- **A context check in each domain.** Each domain refused production on its own, and every other command
  reached the current context. Rejected for decision 7: one resolver, one gate at the subprocess boundary.
- **The current context outside production.** A workstation holds several contexts, and any tool can
  change the current one, so a development command could reach production. Rejected: every environment
  names its context, and `--current-context` is an explicit, verified choice.
- **A context name as the identity of a cluster.** Two kubeconfigs can give one name to two clusters.
  Rejected for the fingerprint, and the API servers where they are fixed.
- **Routes in the namespace of each backend.** The Gateway would have to admit routes from every
  namespace. Rejected for a ReferenceGrant per backend namespace.
- **Rewrite the endpoints of the OCI overlays.** An overlay can name an external host on purpose.
  Rejected for the endpoint layer.
- **Secrets keyed by namespace.** A manifest per `<namespace>/<name>` moved with each migration, and a
  missing one fell back to plaintext seed files without a word. Rejected for decision 11.
- **Ownership by name.** A Gateway with the name of a deployment can belong to another tool. Rejected for
  the labels of decision 12. An unlabeled copy needs the name and the hosts the labeled Gateway serves.
- **A schema version with an upgrade command.** Every command refused a file of another version, so a node
  whose CLI and configuration came from different releases stopped, and a rerun stopped at the same step.
  Rejected for decision 14.

## Consequences

- `db --ns` is `--namespace`; `cluster --ns-use` is gone.
- `CONTENT_NAMESPACE` and `STATE_NAMESPACE` are gone from the deploy scripts.
- `app apply` is asynchronous, reads the live Services, and stops on an endpoint error unless `--force`.
- `cron` takes the `--namespace-<resource>` options, so every installer takes the namespace of its
  resource the same way.
- The catalog holds no namespace of a configurable resource; the release Jobs, the platform, the
  operations and the observability take theirs from the profile, never from the workloads.
- `namespace profile list` and `namespace profile show <profile>` print the profiles.
- A sync switches the engine and its private configuration together; no command upgrades the file.
- A backup manifest and the infrastructure backup stage of a content lifecycle record the context and the
  namespaces.
- With the legacy profile, the rendered manifests and routes are as they were.
- A store keyed by namespace moves once, with `secret setup --args store=legacy`.
- A routing object deployed before the labels stays out of repair until the next `node bin deploy`.

- Every environment needs `environments.<env>.context`, `routing` and `tls`, and production its
  `cluster`, before a command changes its cluster. `--current-context` replaces only the context. Deploy
  scripts pass neither flag.

[Place resources in namespaces](../../nexodev/how-to/place-resources-in-namespaces.md) has the steps.
