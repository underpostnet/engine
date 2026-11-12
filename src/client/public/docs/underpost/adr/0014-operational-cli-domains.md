# ADR 0014 — Operational CLI domains

## Status

Accepted. [ADR 0015](0015-tls-lifecycle-and-the-acme-issuer.md) records the TLS lifecycle and the ACME
issuer.

## Context

`node bin deploy` owned unrelated lifecycles: the workloads and their routes, and also the cert-manager
Certificates, the cluster-scoped ClusterIssuer and the self-signed TLS Secrets. A deploy of one
application rewrote the issuer of every application. `--cert-hosts` took another path when it got a
deployment, so a certificate-only change needed `--disable-update-*` flags to skip deployment work. The
routing discovery ran in `deploy`, in `namespace` and in `run`, each with its own lookups. After the
production namespace migration, the TLS Secrets of LAMPP were in their namespace without the
Certificates that renew them, and only a new deploy with `--cert --cert-hosts` created them.

## Decisions

1. **One owner for each lifecycle.** Each command domain owns one set of resources, and every other
   domain reaches them only through its API:

   | Domain      | Owns                                                                                         | Owns no                      |
   | ----------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
   | `cluster`   | Kubernetes, the CNI, storage, the Gateway API, Contour and the cert-manager installation     | per-host certificate         |
   | `deploy`    | workloads, Services, volumes, builds, rollouts, traffic, and the paths of its routes         | routing manifest, TLS object |
   | `site`      | the declared sites: hosts, clients, paths and APIs                                           | TLS Secret                   |
   | `ingress`   | the routing provider, every routing manifest, host ownership, published paths, stale routing | certificate issuance         |
   | `monitor`   | the observability stack, Grafana, external probes and alerting                               | route of its own             |
   | `tls`       | the TLS mode, ACME issuers, Certificates, TLS Secrets, challenges, renewal, self-signed      | workload, SOPS credential    |
   | `secret`    | the SOPS/Age store of workload credentials and their Kubernetes Secrets                      | certificate                  |
   | `namespace` | placement, inventory, placement audit and migration, and their orchestration                 | its own TLS or routing check |

2. **`deploy` creates no certificate.** It assembles the paths of each host and calls the `ingress`
   renderers, which render the Gateway listeners and the HTTPProxy virtual hosts with the TLS policy of the
   environment, never with a flag. After it publishes the routes of a
   deployment, it reads the TLS Secrets and Certificates of its namespace and names
   `node bin tls reconcile` when one is missing. `--cert`, `--cert-hosts`, `--self-signed` and the
   production `secret.yaml` are gone.
3. **`ingress` is the routing inventory.** `hosts`, `owner` and `select` read the hosts each deployment
   declares from its configuration: the hosts of `conf.server.json`, its `www` and redirect hosts
   included, and the hosts of `conf.instances.json`. That inventory is the one desired-state record of
   host ownership; no live object decides an owner. `deploy` refuses a host another deployment declares
   before it changes anything (`assertOwnership`), `ingress audit` reports it (`host-duplicate`), and a
   published path takes the one owner of its host. `consumer` names the Gateway or HTTPProxy that serves
   a host: the live one where the deployment runs, else the one of its placement. `plan`, `status`,
   `audit` and `reconcile` hold the stale-routing rules of the namespace repair.
4. **`ingress` renders every routing object.** The GatewayClass, the Gateways, the HTTPRoutes, the
   HTTPProxies, the ReferenceGrants and the Envoy Gateway policies come from `Underpost.ingress`. `deploy`,
   `run`, `cluster` and the instance builder call those renderers.
5. **The routing provider is a property of the environment.** `environments.<env>.routing.provider` is
   `gateway-api` or `contour`. Every command reads it; no flag selects it, and a command that renders
   routing refuses an environment without it. `cluster --gateway-api` and `cluster --contour` install
   components; they choose no provider. Both data planes can run in one cluster; a host has one owner, the
   deployment that declares it, and one provider, the one of its environment. The shared edge forwards each
   host to the data plane that serves it, the provider of its environment first (decision 6): it decides
   no owner.
6. **A provider change moves each host in stages.** The route of the new provider is published beside the
   old one. A host is served once its new route serves it: an HTTPRoute accepted by a programmed Gateway,
   or a valid HTTPProxy. Until then the old route stays, the shared edge keeps sending the host to the old
   data plane, and `ingress audit` reports `provider-transition`. Once it serves, the edge sends the host to
   the new data plane, the deploy removes the old route, and `ingress reconcile` removes any left
   (`provider-conflict`); a route that also serves a host that has not moved stays.
7. **A platform component publishes a path through `ingress`.** `ingress.publishPath` attaches an
   HTTPRoute to the Gateway of the deployment that declares the host, from the host inventory, with the
   ownership labels of that deployment. `monitor --grafana-host` calls it; `monitor` reads no Gateway to
   find an owner.
8. **The dependency direction.** `namespace` calls `tls` and `ingress`; `tls` calls `ingress` for the
   consumer and the provider; `ingress` and `tls` call `namespace` for the placement and the target
   (`Underpost.namespace.target`). No domain resolves a host owner, a provider or a context itself.
9. **`namespace` orchestrates.** Its audit reads the cluster once and lists the findings the `tls` and
   `ingress` planners compute from that observation; its repair applies their steps, the TLS first; a
   migration unit prepares its TLS through `tls`. Each finding has one implementation.
10. **One selector pattern.** `node bin <domain> <operation> --env <env> [--deploy-id <ids>] [--host <hosts>]
[--all] [--dry-run | --apply] [--json]`; `--context` and `--current-context` are options of every command. A host resolves exactly one owner; with
    `--deploy-id`, the host must belong to it. A change needs `--env` and a selector or `--all`, is a
    server dry run unless `--apply`, and names its context and environment before it starts. An audit
    reads only and exits 3 on an error.

## Alternatives considered

- **Deprecated `--cert` flags for one release.** A deprecated flag still runs the deploy that carries it.
  Rejected for one removal, with the deploy scripts changed in the same release.
- **The TLS mode in `conf.server.json`.** It describes the application, not the cluster. Rejected for
  `environments.<env>.tls` of `conf.cluster.json`, beside the context and the placement.
- **The routing rules inside `namespace`.** The routing has its own status, audit and reconcile without
  a migration. Rejected for the `ingress` domain.
- **A `node` command for the node operations.** The operations are the node groups of a placement: they
  stay `namespace nodes` until node lifecycle operations exist.
- **A routing provider flag kept for a migration.** `deploy --build-manifest` renders both manifest sets,
  and a provider change is one configuration edit followed by a deploy. Rejected: no override exists.
- **A fixed preference for one data plane while a host has two routes.** A host moving to a route that
  its controller has not accepted yet would answer 404. Rejected for decision 6.

## Consequences

- The deploy scripts apply the workloads, promote, then run `node bin tls reconcile --deploy-id <id>`.
- `run cluster` runs one TLS reconcile after the ingress tier; `run promote` and `run instance-promote`
  create no Certificate.
- `Underpost.tls` is the TLS domain. The HTTPS server of the runtime imports its helpers from
  `src/server/network/tls.js`.
- `src/cli/namespace-routing.js` is split between `src/cli/tls.js` and `src/cli/ingress.js`.
- `--gateway-api` of `deploy` and `run`, and `--disable-gateway-api`, are gone. The deploy scripts pass
  neither.
- `ingress audit` separates an object that exists from one the controller accepts and programs: each host
  has a state (`unrouted`, `no-listener`, `no-route`, `not-accepted`, `not-programmed`, `programmed`, or
  `valid` and `invalid` for an HTTPProxy). Whether a host answers from the internet is the probe of
  `monitor`.

## Design decisions

- `namespace nodes`, `nodes audit` and `nodes identify` stay in `namespace`, and `run node-move` in `run`;
  no `node` command exists for symmetry. Each uses the cluster target, and `node-move` the storage planner
  of [ADR 0011](0011-cluster-topology-and-node-group-scheduling.md).
- The host inventory names the deployment of each host, not its instance or its paths, until an operation
  needs them. A path a platform component publishes (`monitor --grafana-host`) is a path of that host, not
  a second owner.

## Known limitations

- The shared edge (`underpost-ingress`) runs on one node, on its host network: that node is a single point
  of failure of every public host, and no failover exists.

## Verification pending

- A provider transition on a real cluster, in both directions.
- `run ingress-refresh` onto a replacement node: the status documents, host files and host table reach it
  before traffic moves.

## Deferred work

- A separate `node` command, if an operation needs one.
