# Observability and Events

Prometheus, Alertmanager, the Blackbox Exporter and Grafana, provisioned as one stack, plus the event dispatcher that turns an alert into a remediation.

Nothing in this stack is hand-configured. Scrape targets are derived from the same `conf.server.json` each runtime binds, and probe targets, alert rules and the Alertmanager route are derived from the event registry that also holds the remediation handlers. Who hears the outcome is declared separately, in `engine-private/deploy/conf.event.json`. A probe nothing can act on, a handler nothing can trigger, and a remediation nobody is told about are therefore all unrepresentable.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Lifecycle](#lifecycle)
3. [Components](#components)
4. [Deploying the stack](#deploying-the-stack)
5. [Resyncing an existing hub + cluster](#resyncing-an-existing-hub--cluster)
6. [What Prometheus scrapes](#what-prometheus-scrapes)
7. [Events](#events)
8. [The event dispatcher](#the-event-dispatcher)
9. [Probe scheduling](#probe-scheduling)
10. [Host metrics](#host-metrics)
11. [Notifications](#notifications)
12. [End-to-end rehearsal](#end-to-end-rehearsal)
13. [Adding an event](#adding-an-event)
14. [Grafana dashboards](#grafana-dashboards)
15. [Grafana administrator credentials](#grafana-administrator-credentials)
16. [Reaching Grafana from a browser](#reaching-grafana-from-a-browser)
17. [Cluster prerequisites](#cluster-prerequisites)
18. [Cluster runtimes and node placement](#cluster-runtimes-and-node-placement)
19. [Recovering Grafana](#recovering-grafana)
20. [metrics-server](#metrics-server)
21. [Cockpit KVM dashboard](#cockpit-kvm-dashboard)
22. [Options](#options)
23. [See also](#see-also)

---

## Architecture

Five responsibilities, each owned by exactly one place. Nothing detects and acts; nothing routes and communicates.

| Responsibility  | Owner                      | Holds                                                       |
| --------------- | -------------------------- | ----------------------------------------------------------- |
| **semantics**   | `src/cli/event.js`         | What an event means, who it affects, and how it is repaired |
| **rendering**   | `src/server/monitoring.js` | Configuration and manifests, as pure functions              |
| **detect**      | Prometheus + Blackbox      | Probes the subject and evaluates the rule                   |
| **route**       | Alertmanager               | Groups a firing alert and delivers it to the dispatcher     |
| **act**         | the event handler          | Runs the remediation on the resolved subject                |
| **communicate** | `conf.event.json`          | The providers and subscribers each event's outcome reaches  |

`monitoring.js` never decides anything — it takes probes, rules and targets and renders YAML. `event.js` never renders YAML — it declares probes, a rule and a handler, and the render layer turns those into scrape config, alert rules and a route. Neither holds a recipient: an event's behaviour is code, its audience is deployment data. This is why adding an event is one object rather than an edit in four files, and why no generated file can describe a probe that has no handler.

The registries stay separate too:

```
conf.wireguard.json      topology + public keys        (never credentials)
deploy/nodes/*.json      node roles + peer membership, named by hostname
conf.users.json          accounts + hosts[] + keys     (the credential store)
dd.routes                the deploys this engine serves
event registry           probes + alert rule + handler (never secrets)
conf.event.json          notification providers + subscribers per event
```

Remediation joins node membership to topology, then joins the resulting management host to `conf.users.json`. A Prometheus rule, an Alertmanager route and an event definition name a peer id; none carries credentials.

---

## Lifecycle

```
                      DETECT                             ROUTE
   ┌──────────────────────────────────────┐   ┌────────────────────────┐
   │                                      │   │                        │
   │  ┌────────────┐    probe_success     │   │                        │
   │  │  Blackbox  │◄───── /probe ────────┼───┤                        │
   │  │  Exporter  │  icmp / tcp / http   │   │                        │
   │  └─────┬──────┘                      │   │                        │
   │        │ probes the subject          │   │                        │
   │        ▼                             │   │                        │
   │   ╔═════════╗   ╔═════════╗          │   │                        │
   │   ║   hub   ║   ║ spoke N ║          │   │                        │
   │   ║ 10.0.0.1║   ║10.0.0.N ║          │   │                        │
   │   ╚═════════╝   ╚═════════╝          │   │                        │
   │                                      │   │                        │
   │  ┌────────────┐                      │   │  ┌──────────────────┐  │
   │  │ Prometheus │── alert fires ───────┼──►│  │   Alertmanager   │  │
   │  │            │  probe_success == 0  │   │  │                  │  │
   │  │  rules:    │  for 2m              │   │  │ group_by:        │  │
   │  │  underpost_│                      │   │  │  alertname       │  │
   │  │  event=... │                      │   │  │  underpost_event │  │
   │  └────────────┘                      │   │  │  underpost_spoke │  │
   │                                      │   │  └────────┬─────────┘  │
   └──────────────────────────────────────┘   └───────────┼────────────┘
                  ▲                                       │
                  │ generated from                        │ POST /event
                  │ the event registry                    │ Bearer <token>
                  │                                       ▼
   ┌──────────────┴───────────────┐        ┌────────────────────────────┐
   │  src/server/monitoring.js    │        │  underpost-event.service   │
   │  ── rendering ──             │        │   ── dispatcher ──         │
   │  prometheus.yml              │        │                            │
   │  rules yml                   │        │  1. verify bearer token    │
   │  alertmanager.yml            │        │  2. reply 202 immediately  │
   │  blackbox.yml                │        │  3. firing only, never     │
   │  grafana provisioning        │        │     on resolution          │
   └──────────────┬───────────────┘        │  4. cooldown per subject   │
                  │                        │  5. dispatch async         │
                  │ reads                  └─────────────┬──────────────┘
                  ▼                                      │
   ┌──────────────────────────────┐                      │ underpost_event
   │  src/cli/event.js            │                      │ underpost_spoke
   │  ── semantics ──             │                      ▼
   │                              │        ┌────────────────────────────┐
   │  EVENTS = {                  │        │           ACT              │
   │   wireguard-server-down: {   │        │                            │
   │     probes, alert, handler   │        │  hub → external SSH        │
   │   },                         │        │    wireguard --restart     │
   │   wireguard-spoke-down: {    │        │    → health check          │
   │     probes, alert, handler   │        │                            │
   │   },                         │        │  local spoke → local       │
   │  }                           │        │  worker → LAN SSH          │
   └──────────────┬───────────────┘        │    wireguard --restart     │
                  │                        │    → health check          │
                  │ spoke id                │                           │
                  ▼                        └─────────────┬──────────────┘
   ┌──────────────────────────────┐                      │
   │  topology + nodes + identity │                      ▼
   │   peer → tunnel + management │        ┌────────────────────────────┐
   │  conf.users.json             │        │        COMMUNICATE         │
   │   host → user → key path     │        │                            │
   └──────────────────────────────┘        │  every route conf.event    │
        the join happens only here          │  .json declares, naming:   │
        — never in a rendered file          │   event / role / spoke     │
                                            │   address / condition      │
                                            │   commands / outcome       │
                                            │   health / timestamp       │
                                            └────────────────────────────┘
```

Read left to right: **detect** produces a labelled alert, **route** delivers it to one dispatcher, **act** repairs the subject the labels name, **communicate** reports what happened. The loop stops there — a resolution is never delivered, so recovery never triggers another repair.

---

## Components

| Component         | Service                   | Port  | Purpose                                            |
| ----------------- | ------------------------- | ----- | -------------------------------------------------- |
| Prometheus        | `prometheus`              | 9090  | Scrapes runtimes, the Envoy data plane, and probes |
| Alertmanager      | `alertmanager`            | 9093  | Routes labelled alerts to the event dispatcher     |
| Blackbox Exporter | `blackbox-exporter`       | 9115  | ICMP / TCP / HTTP probes on behalf of Prometheus   |
| Grafana           | `grafana`                 | 3000  | Provisioned datasource and dashboards              |
| Event dispatcher  | `underpost-event.service` | 39099 | Receives the webhook and runs the remediation      |

The dispatcher runs on the selected control-plane host, not in a pod. It repairs that control plane locally, workers through LAN management addresses, and the hub through its static public endpoint.

Port `39099` is dedicated to the dispatcher. Calico Felix owns host port `9099` on kubeadm installations, so it must not be killed or reused. Re-running `event --service` reads the previously installed unit, closes its old firewalld port, writes the current port, resets any failed systemd state, and starts the converged unit.

Workload manifests live in `manifests/prometheus/`, `manifests/alertmanager/`, `manifests/blackbox-exporter/` and `manifests/grafana/`. Everything those pods mount — `prometheus.yml`, the alert rules, `alertmanager.yml`, `blackbox.yml`, the Grafana datasource, dashboard provider and dashboards — is generated by `src/server/monitoring.js` and applied by `src/cli/monitor.js`. Plain manifests, no CRDs and no operator: the stack has one replica of each component and nothing here needs the Prometheus Operator's `ServiceMonitor` indirection.

---

## Deploying the stack

```bash
# Full install / converge (idempotent)
node bin monitor --observability

# Same thing through the cluster command
node bin cluster --prom
node bin cluster --grafana

# Pin every stack workload to one node
node bin monitor --observability --node-name kind-worker

# Cluster runtime, when it cannot be inferred (defaults: --dev is Kind, otherwise kubeadm)
node bin monitor --observability --k3s

# Only refresh configuration and reload the running components in place
node bin monitor --sync-prom

# Scope the scrape targets to specific deploys
node bin monitor dd-cyberia --observability
node bin monitor dd-core,dd-cyberia --sync-prom
```

`--grafana` and `--prom` converge the same one stack — the alert rules and probes are useless without Alertmanager and the Blackbox Exporter, so all four are deployed together.

Workload manifests are always read from `./manifests` in the engine checkout, never from the globally installed package: they ship with the repository, and resolving them out of `node_modules/underpost` applies whatever an older global install happens to carry — or fails outright when it carries nothing.

Configuration is applied before the workloads, because a pod admitted ahead of the ConfigMap it mounts stays pending until kubelet re-resolves the volume. Grafana's node selector and browser origin are added to the Deployment before it is first applied, so a `WaitForFirstConsumer` PVC cannot bind on one node before `--node-name` moves the pod to another. A reload waits for the new file to actually reach the pod (kubelet projects a ConfigMap on its own schedule, up to a minute), then sends `SIGHUP`. The Prometheus TSDB is an `emptyDir`, so reloading in place rather than restarting is what keeps the samples collected so far.

---

## Resyncing an existing hub + cluster

The observability workloads and dispatcher belong to the cluster. The dispatcher runs as a host service on the selected control plane, while the VPS runs only the WireGuard hub and edge services.

| Machine                   | Runs                                               | Repair path                                      |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| **Cluster control plane** | monitoring workloads and `underpost-event.service` | local control plane, LAN workers, public VPS SSH |
| **VPS / WireGuard hub**   | WireGuard, HAProxy, forward proxy                  | target of external SSH remediation               |

Alertmanager reaches the dispatcher at the selected Kubernetes node's InternalIP. The dispatcher remains running when `wg0` fails; it is intentionally independent of `wg-quick@wg0`.

### Where the two events get deployed

Both events are provisioned and received on the control plane. "Deploying an event" writes probes, rules, and the Alertmanager route; `event --service` installs the host receiver that executes them.

There is nothing to deploy per event by hand: `monitor --observability` provisions **every registered event**, because the registry is what it renders from. `event <id> --deploy` exists to re-provision one event without touching the rest, and it lands in the same code path.

| Command                               | Where         | Provisions                         |
| ------------------------------------- | ------------- | ---------------------------------- |
| `monitor --observability`             | cluster       | both events + the whole stack      |
| `monitor --sync-prom`                 | cluster       | both events, config only           |
| `event wireguard-spoke-down --deploy` | cluster       | that one event's probes/rule/route |
| `event --service`                     | control plane | the receiver that acts on them     |

The local spoke is tested by probing the hub tunnel address. Other registered peers are tested at their tunnel addresses. This avoids the previous self-probe of the control plane's own `10.0.0.x`, which stays reachable locally even when the tunnel is disconnected.

### 0. The shared token, once

Alertmanager and the control-plane receiver both read `UNDERPOST_EVENT_TOKEN`. Keep it in the cron deploy environment so service restarts and monitoring convergence resolve the same value.

```bash
# On either machine: mint or read the token
node bin monitor --webhook-token

# Persist it in the cron deploy env, then commit engine-private so both sides get it
echo "UNDERPOST_EVENT_TOKEN=<token>" >> engine-private/conf/dd-cron/.env.production
cd engine-private && git add . && git commit -m "event: shared webhook token" && git push
```

If monitoring and the service start from different environments without this shared value, Alertmanager receives `401` and nothing is remediated.

### 1. Remove the old receiver from the VPS

```bash
cd /home/dd/engine
git pull
node bin event --service-stop
node bin event --service-status
```

The VPS must retain its engine checkout and the `root@<public-ip>` SSH registration is stored on the control plane, not on the VPS.

### 2. Configure and start the control-plane receiver

```bash
cd /home/dd/engine
git pull && cd engine-private && git pull && cd ..
npm install

# The topology hub key identifies the VPS management target. Read the actual sshd
# port on the VPS with: sudo sshd -T | awk '$1 == "port" { print $2 }'
node bin ssh --user root --host 64.176.25.136 --port <vps-sshd-port> --user-add

# Register stable management paths for non-local peers. The local spoke is
# repaired directly and needs no SSH hop.
node bin wireguard --build-conf --hub-host 64.176.25.136 \
  --peer-add homelab-a-hp-envy-iso-ram-rocky9 \
  --peer-ip 10.0.0.3 \
  --public-key '<worker-wireguard-public-key>' \
  --management-host 192.168.1.191

node bin event --list       # every repair must resolve; each failure now includes its reason
node bin event --service    # refuses installation while any repair is unresolved

node bin monitor --observability --kubeadm --node-name localhost.localdomain --node-port
```

This host's document must be `role: control`, reference `peerId: homelab-a`, and select hub `64.176.25.136`. The static hub key is joined directly against `conf.users.json`; a tunnel address is never used as an SSH remediation target.

The VPS sshd port must not equal the topology's `sshForwardPort`. In this topology, public port `2222` forwards to `10.0.0.2:22`, so registering `root@64.176.25.136:2222` would target the spoke instead of the VPS. `event --list` rejects that collision before monitoring is provisioned.

The generated systemd unit uses the same Node installation and working directory as the provisioning command, so it resolves the same engine checkout — and therefore the same node document and topology — as the interactive CLI.

`--list` is the gate. The expected paths are:

```text
repair hub                                      via root@64.176.25.136:<vps-sshd-port>
repair homelab-a                                via local
repair homelab-a-hp-envy-iso-ram-rocky9         via admin@192.168.1.191:22
```

### 3. Verify

```bash
# The four workloads
kubectl get pods -n default -l 'app in (prometheus,alertmanager,blackbox-exporter,grafana)'

# The generated probes and rules, as applied
kubectl get configmap prometheus-config -o jsonpath='{.data.prometheus\.yml}' | grep -A6 blackbox-icmp
kubectl get configmap prometheus-rules  -o jsonpath='{.data.underpost-events\.yml}'

# The route Alertmanager will deliver to — should be the control-plane InternalIP
kubectl get configmap alertmanager-config -o jsonpath='{.data.alertmanager\.yml}' | grep url:

# Both events are present, one rule each
kubectl get configmap prometheus-rules -o jsonpath='{.data.underpost-events\.yml}' | grep 'alert:'
```

Then on the **control plane**, rehearse both remediations without touching anything:

```bash
node bin event wireguard-server-down --dry-run --no-notify
node bin event wireguard-spoke-down  --dry-run --no-notify
```

### 4. Re-running after any change

Adding a deploy to `dd.routes`, registering a spoke with `--peer-add`, or changing a host in `conf.server.json` all change what should be probed. Re-render and reload in place — no pod restart, no lost history:

```bash
node bin monitor --sync-prom              # on the cluster: re-render every event
node bin event wireguard-spoke-down --deploy   # or just one of them
```

The dispatcher reads the selected host identity, tracked node collection, topology and SSH registry at dispatch time. After changing topology or node membership, run `monitor --sync-prom`; re-run `event --service` only when its unit or listening port changes.

---

## What Prometheus scrapes

| Job                     | Source                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `prometheus`            | Itself                                                                              |
| `envoy-gateway`         | Envoy Gateway data plane pods, port 19001, `/stats/prometheus`                      |
| `underpost-express[-n]` | Every `nodejs` host/path in each deploy's `conf.server.json`, at its own `/metrics` |
| `underpost-extra`       | `--extra-targets` `host:port` entries                                               |
| `blackbox-<module>`     | Event probes, relabelled through the Blackbox Exporter                              |

The Express job comes from `appScrapeEntriesFactory`, which selects only paths with `runtime: nodejs` and no `redirect` — those are the ones `ExpressService.createApp` gives a `prom-client` registry to. A path serving `lampp`, `wp`, or a redirect has no registry, and scraping it would leave a permanently-down target that makes the stack's own health unreadable. Each distinct metrics path gets its own job, so `/` and `/api` on the same host are both scraped correctly. The route itself comes from `metricsPathFactory`, shared with the Express runtime, so a target cannot point at a path the server does not serve.

Envoy is **discovered**, not named: Envoy Gateway provisions its own Deployment per GatewayClass with a generated name, so a static target would break on every GatewayClass change. Pod discovery is why the Prometheus ServiceAccount carries a `ClusterRole`; the `ClusterRoleBinding` is generated rather than committed because it names its ServiceAccount's namespace in the document body, where `kubectl -n` does not reach.

---

## Events

An event is one object in the registry at `src/cli/event.js` holding its probes, its alerting rule and its handler.

| Event                           | Role    | Probe                                                             | Fires after | Remediation                                                      |
| ------------------------------- | ------- | ----------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| `wireguard-spoke-down`          | spoke   | hub tunnel for local spoke; tunnel address for workers            | 2m          | restart + verified handshake locally or through LAN SSH          |
| `wireguard-server-down`         | hub     | hub tunnel, delayed behind local-spoke remediation                | 5m          | restart + health check through the hub's external registered SSH |
| `public-ingress-down`           | ingress | every published host, from the same conf the traffic report reads | 10m         | unblock ingress + rebuild the tunnel on the hub, then re-probe   |
| `node-cpu-limit-exceeded`       | node    | none — reads scraped host metrics                                 | 5m          | captures the top CPU consumers on the node the alert names       |
| `node-memory-limit-exceeded`    | node    | none — reads scraped host metrics                                 | 3m          | captures the top memory consumers                                |
| `hub-bandwidth-limit-exceeded`  | hub     | none — reads the quota the Vultr cron publishes                   | 15m         | reports the traffic breakdown                                    |
| `node-disk-limit-exceeded`      | node    | none — reads scraped host metrics                                 | 5m          | reports what is filling the root filesystem                      |
| `node-network-traffic-exceeded` | node    | none — reads scraped host metrics                                 | 2m          | reports the sockets carrying the burst                           |

The two-minute spoke rule runs first. If restarting the selected control node restores the tunnel, the five-minute hub rule never fires. If it remains down, hub repair uses the static topology key and does not depend on the failed tunnel.

**Both probe across the tunnel, not at the interface.** ICMP to a tunnel address only succeeds if WireGuard is actually carrying traffic — a local interface that exists but forwards nothing fails the probe, which is the point. Probing the hub's public endpoint instead would be answered by any running VPS whether or not WireGuard is up.

**`public-ingress-down` classifies before it acts.** Every published host answering `200` at the end of its redirect chain is not an event and reaches nobody — alerting on a healthy check is how an inbox stops being read. Some hosts failing is a per-host fault the edge cannot repair, so it is announced and left alone. Every host failing is an edge outage: ingress is unblocked and the tunnel rebuilt on the hub, in that order — a blocked edge would make the rebuild look successful while nothing could still reach it — and the same probe then decides whether the cluster recovered.

The probe is the one the traffic report uses, so `node bin run get-traffic` and this event can never disagree about what "reachable" means. The final code of the chain is the answer: a `301` that never lands on a `200` is a broken route, not a served one.

**Both WireGuard events fan out.** `wireguard-spoke-down` covers every peer of this node's hub; the control plane's own address is never probed directly because a local `10.0.0.x` remains reachable when its tunnel has no handshake, so its probe targets `10.0.0.1` while worker peers retain their own tunnel targets. `wireguard-server-down` covers every hub in `conf.wireguard.json`. Each series carries `underpost_spoke` or `underpost_hub`, the handler reads that label back to know which subject to repair, and cooldown is maintained independently per subject.

Every rule carries `underpost_event`. That label is the contract: Alertmanager's route matches on its presence, and the dispatcher reads it to select a handler. A rule without it lands in the null receiver rather than an inbox.

### Remediation identity

Repairing a spoke means reaching that spoke, which needs a credential the event registry must never hold. The dispatcher resolves one chain, in one place:

```
peer whose managementHost is this machine → local process
any other peer → node role → managementHost → SSH user + key
registered hub static IP → SSH user + key
```

Local execution is settled against this host's own interface addresses, never against the node document's name: a default hostname like `localhost.localdomain` names more than one machine, and a repair run on the wrong one is worse than no repair. An unmatched address resolves to SSH, so the check can only fail towards a remote hop.

`conf.wireguard.json` stores deployment topology. `deploy/nodes/*.json` maps peers to `control` or `worker`, each document named after the host it describes, so the current machine resolves by hostname. `conf.users.json` owns accounts, ports and key paths. Host joins are exact and have no fallback account.

The hub's `sshForward` port is not its management port. For example, `:2222 -> 10.0.0.2:22` reaches the control node. If that port is registered for the VPS, the identity guard refuses remediation because it reached `control` instead of `hub`.

One operator account normally reaches every spoke, so the registry records a **list of connections per account** rather than one host per account, and remediation resolves by host:

```bash
node bin ssh --user admin --host 192.168.1.85 --user-add
node bin ssh --user admin --host 192.168.1.191 --user-add
node bin ssh --user root --host 64.176.25.136 --port <vps-sshd-port> --user-add
```

The two `admin` calls extend the same account; the second does not replace the first. See [SSH Management](<./SSH Management.md>) for the record shape.

```bash
# Inspect the registry: resolved probe targets and the identity each repair runs as
node bin event --list

# Provision one event's probes, rule and route
node bin event wireguard-server-down --deploy
node bin event wireguard-spoke-down --deploy

# Run a remediation by hand
node bin event wireguard-server-down
node bin event wireguard-spoke-down --spoke homelab-a
node bin event wireguard-spoke-down --nodes hp-envy-iso-ram-rocky9,localhost.localdomain
node bin event wireguard-server-down --nodes vultr
node bin event wireguard-spoke-down --dry-run     # rehearse every registered spoke
node bin event wireguard-spoke-down --no-notify

# Rehearse the whole loop against the live edge: break, detect, repair, notify
node bin event wireguard-server-down --e2e-test
```

`--list` prints, per event, the alert expression, every resolved probe target, and the account each repair would run as:

```
wireguard-spoke-down  [spoke] — A registered WireGuard spoke fell off the hub tunnel.
  alert    UnderpostWireguardSpokeDown  probe_success{underpost_event="wireguard-spoke-down"} == 0  for 2m
  probe    icmp         10.0.0.1
  probe    icmp         10.0.0.3
  repair   homelab-a    10.0.0.2 via local
  repair   worker-a     10.0.0.3 via admin@192.168.1.191:22
  notify   default-cluster-mailer-provider  smtp (env) -> ops@example.com
```

A `repair … via unresolved` row is the spoke that would be refused at dispatch time — visible before an outage rather than during one.

`--deploy` lands in the same `syncObservability` path as `monitor --observability` and `monitor --sync-prom`, so the scrape config, the rules and the route can never be generated by two implementations that disagree.

### The cluster is the state

The ConfigMaps are rendered whole, so publishing one event means rendering every event that must stay published with it. `--deploy` therefore reads back what is already running before it renders:

```bash
node bin event public-ingress-down --deploy     # merge it into the deployed set
node bin event public-ingress-down --undeploy   # withdraw it, leaving the rest
```

The deployed set is extracted from the live `prometheus-rules` and `prometheus-config` ConfigMaps, whose every probe group and rule already carries an `underpost_event` label. There is no local file recording what should be running — such a file is wrong the moment anyone applies anything by hand, while the objects themselves cannot be.

Two consequences worth knowing. An id the cluster runs that the registry no longer declares is **dropped** from the render rather than failing the publish of everything else; `--list` names it so it can be withdrawn deliberately. And withdrawing the last event renders _no_ events — an empty selection is taken literally, where an empty `--events` on a full convergence still means "all".

`monitor --observability` and `--sync-prom` are unchanged: they converge every declared event, which is what a full sync is for.

`--list` compares the two sides:

| Status        | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `DEPLOYED`    | declared in the registry and running in the cluster                        |
| `PENDING`     | declared, not yet published                                                |
| `OUT_OF_SYNC` | running in the cluster, no longer declared — withdraw it with `--undeploy` |

---

## The event dispatcher

```bash
node bin event --service                       # supervised systemd unit (how it should run)
node bin event --serve                         # foreground, for a one-off test
node bin event --serve --port 39099 --cooldown-ms 300000
```

The receiver answers `202` before dispatching. Remediation can take minutes, while Alertmanager retries any delivery it does not see accepted. A five-minute cooldown is keyed by event and subject, so duplicates for one spoke are suppressed without blocking another spoke.

Alertmanager never sends resolution notices to it. The dispatcher acts, and a resolution notice would ask it to act again on a condition that has already cleared.

**Authentication.** The webhook triggers root-equivalent remediation on the edge, so it is never provisioned without a bearer token. The token is minted on first provisioning into the underpost root env store (`UNDERPOST_EVENT_TOKEN`) — the same store `sshRemoteRunner` reads its SSH credentials from — and projected into the cluster as the `alertmanager-webhook` Secret, which Alertmanager reads with `credentials_file`. It is a Secret rather than a field in the ConfigMap so it never appears in a `kubectl get -o yaml` dump.

**Notification.** After each dispatch the outcome goes to every route the event declares in [`conf.event.json`](#notifications). A failing handler is reported through those routes rather than thrown — an unhandled rejection in the receiver would silence every later alert.

### Running it as a service

`--service` is accepted only when the selected WireGuard node role is `control`. It renders `/etc/systemd/system/underpost-event.service`, opens the authenticated receiver port in firewalld, and enables the unit under `multi-user.target`. The unit depends only on `network-online.target`, so it remains available while repairing `wg0`.

```bash
node bin event --service          # install, enable, start
node bin event --service-status   # active / enabled, and the journalctl command
node bin event --service-stop     # disable and remove the unit
node bin event --service --dry-run
journalctl -u underpost-event -f
```

The install is convergent — the unit is rewritten only when it differs, and restarted only when it was — so re-running after a `git pull` costs nothing. Monitoring sync uses the same remediation preflight and refuses to publish a rule that has no executable repair route.

Before writing the unit, `--service` probes which Node binary a unit can actually execute, using a transient `systemd-run`. A binary under `/root` or `/home` is tried last: systemd refuses to execute one on an SELinux host, and the failure surfaces only as `203/EXEC` in the journal.

After starting, it requires the unit to remain active beyond a full restart interval before reporting success. `systemctl restart` returns before a crash loop becomes visible, so an immediate `active` result is not sufficient.

#### When it does not start

The report names the likely cause and prints the journal tail:

| Symptom                             | Cause                                                                                                    | Fix                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `active: activating`, never settles | Crash-looping under `Restart=always`                                                                     | Read the journal tail the command prints                                      |
| `EADDRINUSE` in the journal         | A foreground `--serve` still holds the port                                                              | Stop it, or install on another `--port`                                       |
| `203/EXEC` in the journal           | The checkout or the Node binary is under `/home` or `/root`, which a unit cannot read on an SELinux host | Move the checkout (e.g. `/opt/underpost/engine`), or install Node system-wide |

If local port `9090` is already occupied by Cockpit, use a different local side for Prometheus inspection:

```bash
kubectl port-forward svc/prometheus -n default 19090:9090
curl -fsS http://127.0.0.1:19090/api/v1/alerts
```

The exact probe the service would run is printed with the failure, so it can be reproduced by hand:

```bash
sudo systemd-run --quiet --collect --wait --property=Type=oneshot \
  --property=WorkingDirectory=/home/dd/engine /usr/bin/node /home/dd/engine/bin --version
```

---

## Probe scheduling

Each event declares its cadence in `conf.event.json` — how often its probes run, and how long the condition must hold before the alert fires:

```json
{
  "events": {
    "public-ingress-down": { "probeInterval": "10m", "alertFor": "10m" },
    "node-cpu-limit-exceeded": { "probeInterval": "1m", "alertFor": "5m", "threshold": 85 }
  }
}
```

A rule that compares against a number declares it as `threshold`, and the registry writes `<threshold>` where it belongs. Tuning when an alert fires is then a configuration change, and the same gate refuses a rule whose threshold the contract never declared.

`probeInterval` becomes the job's `scrape_interval`, so probes are grouped by module **and** period: a tunnel ping every `30s` and a fan-out over every published host every `10m` do not have to share a cadence, and adding a cheap event never slows an expensive one. `alertFor` becomes the rule's `for`. Prometheus stays the only scheduler — these tell it the period and the window, nothing else runs a timer.

Both are contract data, not registry data, because they are tuned per deployment. The registry declares _what_ is probed and _what_ fires; the contract declares _how often_ and _for how long_. Neither number appears in `src/cli/event.js`, so there is no second answer to drift from — an event definition carries no `for`, and the rule renderer emits nothing for an event that has not declared one.

An undeclared cadence is refused where rules are published, alongside the repair and notification gates:

```
[event] undeclared in ./engine-private/deploy/conf.event.json:
- public-ingress-down: alertFor
```

| Event                   | `probeInterval` | `alertFor` |
| ----------------------- | --------------- | ---------- |
| `wireguard-spoke-down`  | `30s`           | `2m`       |
| `wireguard-server-down` | `30s`           | `5m`       |
| `public-ingress-down`   | `10m`           | `10m`      |

---

## Host metrics

Node Exporter runs as a DaemonSet with `hostNetwork` and `hostPID`, so what it reports is the machine rather than the pod: CPU, memory, filesystem and interface counters for the nodes the workloads run on. The root filesystem is mounted read-only — a collector must never write to what it measures.

Prometheus discovers cluster nodes and scrapes each at its own InternalIP. The hub is a VPS, not a cluster node, so discovery cannot see it; it is scraped statically at the tunnel address the WireGuard events already probe, and its series carry `underpost_role: hub`.

**The Vultr quota is published, not polled.** The API is rate limited and needs a credential, neither of which belongs on an alert evaluation path, so the bandwidth guard — which already holds the numbers — writes them where the collector picks them up:

```
/var/lib/node_exporter/textfile/vultr_bandwidth.prom
  vultr_bandwidth_used_bytes
  vultr_bandwidth_limit_bytes
```

It renames the file into place, because the collector may read it mid-write, and mirrors both values into the root env store as `VULTR_BANDWIDTH_USAGE_BYTES` and `VULTR_BANDWIDTH_LIMIT_BYTES` for anything that reads configuration rather than metrics.

Threshold events declare no probe: their rules read these series, so `--list` reports no probe row for them and the "no resolvable probe targets" warning applies only to rules that actually read `probe_success`.

Their handlers do not remediate. A threshold crossing says a machine is under pressure, not what to do about it, so each gathers the evidence an operator would collect by hand — `ps aux --sort=-%cpu`, `df -h`, `ss -tunp` — on the node the alert's `instance` label names, and reports it.

---

## Notifications

Detection and remediation are behaviour and live in code. Who hears about them is deployment data and lives in `engine-private/deploy/conf.event.json`, so adding a subscriber or repointing a transport is a configuration change and nothing else — no recipient address or credential enters the event registry, a rendered ConfigMap, or this repository.

```json
{
  "notification-providers": {
    "default-cluster-mailer-provider": {
      "type": "mailer",
      "mailer": {
        "sender": {
          "email": "env:CLUSTER_MAILER_SENDER_EMAIL",
          "name": "env:CLUSTER_MAILER_SENDER_NAME:Underpost"
        },
        "transport": {
          "host": "env:CLUSTER_MAILER_SMTP_HOST",
          "port": "env:CLUSTER_MAILER_SMTP_PORT:int:587",
          "secure": "env:CLUSTER_MAILER_SMTP_SECURE:bool:false",
          "auth": {
            "user": "env:CLUSTER_MAILER_SMTP_AUTH_USER",
            "pass": "env:CLUSTER_MAILER_SMTP_AUTH_PASS"
          }
        }
      }
    }
  },
  "events": {
    "wireguard-server-down": {
      "notifications": [
        {
          "notification-provider-id": "default-cluster-mailer-provider",
          "payload": { "subscribers": [{ "email": "ops@example.com", "name": "Ops" }] }
        }
      ]
    }
  }
}
```

A **provider** is a transport plus the identity it sends as; a **notification** binds one event to one provider and its subscribers. Providers are named once and referenced by id, so several events reach the same inbox without repeating a transport, and one event can fan out to several providers.

Credentials never appear in the file. Every value may be an `env:` reference resolved at dispatch time from the cron deploy environment `loadCronDeployEnv()` loads — the same resolution `conf.server.json` uses, including its `int:` and `bool:` typed defaults. The file is structure; the environment is secrets.

`mailer` is the only provider type today. A type is one entry in `NOTIFICATION_PROVIDER_TYPES` in `src/server/event-notification.js`, holding how a route is described and how one notification is delivered; adding a transport does not touch the dispatcher.

Routes are validated where rules are published, not where they fire:

```bash
node bin event --list      # prints each event's notify routes, or the reason one is unresolved
node bin event --service   # refuses installation while any repair or notify route is unresolved
```

`monitor --observability` and `--sync-prom` pass the same gate. A rule with no repair route repeats an outage; a rule with no notification route repairs it silently, so a recurring fault is never escalated; a rule with no declared cadence runs at a period and a window nobody chose. All three are refused together.

The message itself is plain text, rendered from the handler result — event, role, subject, condition, commands attempted, outcome, health and timestamp. It is deliberately not rendered through the SSR mailer templates: alerting must not depend on a client build being present on the host that dispatches it.

### Intercepting what is sent

`MailerProvider.use(middleware)` wraps every send in the engine, in registration order, with `({ id, sendOptions, sender }, next)`. A middleware that never calls `next` suppresses the delivery.

`mailerInterceptorFactory()` in `src/mailer/MailerInterceptor.js` is the general-purpose recorder built on it: it captures each message and whether the transport accepted it, offers `waitFor(predicate)`, and unregisters with `close()`. `suppress: true` records without delivering. This is what makes "was the mail actually sent?" an assertion rather than an inbox check — the end-to-end rehearsal below uses it, and so can any other caller that needs to audit or hold outbound mail.

---

## End-to-end rehearsal

```bash
node bin event public-ingress-down    --e2e-test                 # block the edge ports, repair, re-probe
node bin event wireguard-server-down --e2e-test                 # every registered hub
node bin event wireguard-server-down --e2e-test --nodes vultr   # that hub alone
node bin event wireguard-spoke-down  --e2e-test                 # every peer of this node's hub
node bin event wireguard-spoke-down  --e2e-test --nodes hp-envy-iso-ram-rocky9,localhost.localdomain
```

**Every subject the event covers is rehearsed**, one at a time, each restored before the next is touched — the same set `--list` prints, so a rehearsal cannot cover less than what is deployed. `--nodes` narrows that to a comma-separated list of node documents (`deploy/nodes/<node-name>.json`, the same names `kubectl get nodes` reports); `--spoke` narrows the spoke event by topology peer id instead. A name that exists but carries the wrong role is refused — `--nodes vultr` on the spoke event names a hub, not a peer. Both selectors resolve in one place, so a hand-run repair and a rehearsal always mean the same thing by them.

`--dry-run` rehearses the _commands_. `--e2e-test` rehearses the _system_: it breaks the real subject, waits for the Blackbox Exporter to actually stop seeing it, runs the production remediation, waits for the subject to come back, and confirms the notification left the transport. Every step is a real component — a rehearsal that stubs detection or delivery proves only that the stubs agree with each other.

| Step       | What runs                                                                 | Passes when                                    |
| ---------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| `baseline` | `/probe` on the Blackbox Exporter, before anything is touched             | Every probe reports `probe_success 1`          |
| `arrange`  | The scenario stops WireGuard on the subject, over its own repair identity | The command succeeds                           |
| `detect`   | `/probe` on the Blackbox Exporter, polled                                 | Every probe reports `probe_success 0`          |
| `act`      | `Underpost.event.dispatch` — the same path the webhook takes              | The handler reports `ok`                       |
| `recover`  | The same probes, polled again                                             | Every probe reports `probe_success 1`          |
| `notify`   | The mailer interceptor                                                    | The notification was accepted by the transport |

Nothing is broken until `baseline` passes: what a probe reports is evidence only if it was answering to begin with, and a subject that is already down would make detection pass vacuously and recovery impossible. A probe that cannot be _read_ is never counted as a subject that is down — an unreachable exporter is reported as itself, naming the transport error, because the two need opposite responses from whoever reads the line.

Probes are read where detection reads them — through the API server's service proxy on the node hosting the stack, resolved from `deploy/nodes` and reached with its registered SSH account. A rehearsal therefore runs from any machine holding the deploy configuration and the SSH registry, not only from the control plane, and needs no local kubeconfig or port-forward.

The exporter is read directly rather than through Prometheus' `for:` window, so a rehearsal is bounded by how long a host takes to drop and come back, not by how long an alert takes to fire. It is read through one `kubectl port-forward` to the exporter Service, held open for the whole wait.

**It is destructive by design and self-healing by construction.** The subject really goes down. The remediation is what should bring it back; when it does not — including when the run fails or is aborted — the scenario's `restore` runs in a `finally`, so a rehearsal cannot leave the edge down. `--e2e-test` is refused together with `--dry-run` (nothing would be repaired) and with `--no-notify` (nothing would be verified).

### Scenario modules

The registry describes production behaviour, and nothing in it should be able to take a host down, so scenarios live beside the tests. `node bin event <event-id> --e2e-test` loads `test/e2e/event-e2e-<event-id>.js` and expects one default export:

```js
export default {
  description: 'One line, printed when the rehearsal starts.',
  // One entry per subject, narrowed by the selector the caller passed:
  // what to probe, what to dispatch, and where to act.
  async subjects({ eventId, definition, options, namespace }) {
    return Underpost.event.subjectSelection('hub', options).map((hubHost) => {
      const target = Underpost.event.hubTarget(hubHost);
      return {
        label: `hub ${target.nodeName}`,
        probes: [{ module: 'icmp', target: target.address }],
        dispatchOptions: { nodes: target.nodeName },
        remote: { user: target.user, host: target.host },
      };
    });
  },
  async break(context, subject) {
    /* induce the real fault */
  },
  async restore(context, subject) {
    /* return the subject to service */
  },
};
```

`subjectSelection(role, options)` is what makes the default set and the `--nodes` / `--spoke` narrowing identical to the dispatcher's; a scenario that enumerated subjects itself could rehearse a set the event does not actually cover.

`public-ingress-down` blocks the hub's published ports (`80,443`) rather than all inbound traffic. Remediation reaches the hub over SSH, so a total ingress block would drop the very connection that repairs it and leave the edge recoverable only from the provider console; the scoped block reproduces the same observable outage — every host down — while `--unblock-all-ingress`, which the handler runs, clears it along with any other ingress rule.

Every shipped scenario breaks its subject through the **same identity chain the remediation resolves** — locally for the selected control node, LAN SSH for a worker, the hub's registered external SSH for the VPS. A subject that can be broken but not repaired therefore fails the rehearsal rather than an outage. They are run by `node bin event`, not by `underpost test`: the scenarios live in `test/e2e/` and no tier collects them.

---

## Adding an event

Add one object to `EVENTS` in `src/cli/event.js`:

```js
'my-event': {
  role: 'hub',
  description: 'What went wrong, in one line.',
  alert: {
    name: 'UnderpostMyEvent',
    expr: 'probe_success{underpost_event="my-event"} == 0',
    for: '2m',
    severity: 'critical',
    summary: 'Short title ({{ $labels.instance }})',
    description: 'What the handler is about to do.',
  },
  probes: () => [{ module: 'tcp_connect', targets: ['10.0.0.1:443'], labels: { underpost_role: 'hub' } }],
  remediation: () => [Underpost.event.hubTarget()],
  handler: async (options, alerts) => ({
    ok: true,
    role: 'hub',
    condition: 'what the probe observed',
    targets: [{ role: 'hub', address: '10.0.0.1', via: 'root@203.0.113.10:22', commands: ['node bin ...'], ok: true, output: '' }],
  }),
},
```

`probes` and `remediation` are functions, not values: both join the selected identity, node collection and topology at call time. Modules are `icmp`, `tcp_connect` and `http_2xx`.

Then declare who hears it, in `conf.event.json` under `events.my-event.notifications` — without a route, `--list`, `event --service` and `monitor --sync-prom` all refuse to publish the rule. Optionally add `test/e2e/event-e2e-my-event.js` to make the whole loop rehearsable.

An event that fans out over many subjects emits one probe per subject with a distinguishing label, and the handler reads that label back off `alerts` to know which subject to act on. `remediation()` is what `--list` prints, so it should resolve the same identities the handler will use. The handler returns `{ ok, role, condition, targets[], health }`; the notification is rendered from that, which is what makes an alert say _which_ subject failed. Then re-provision:

```bash
node bin event my-event --deploy
node bin event my-event --e2e-test   # when a scenario exists
```

---

## Grafana dashboards

Two dashboards are provisioned into the `Underpost` folder, with the Prometheus datasource wired to the in-cluster Service.

**Underpost · Envoy Gateway** — data plane uptime, allocated memory, active downstream connections, request rate, 5xx rate, and downstream throughput.

Downstream 5xx is read as `envoy_http_downstream_rq_xx{envoy_response_code_class="5"}`. Envoy exposes response classes as one labelled family, not as a `..._rq_5xx` series, so selecting the label is what actually yields the 5xx rate.

**Underpost · Events and Probes** — probe success and duration by event, Express request rate, and target availability.

**Underpost · Node Metrics** — CPU and memory percentage per node, RX/TX throughput on `wg0` and whatever a host calls its own NIC, root filesystem usage with disk I/O rates, and the hub's monthly bandwidth against its quota over time. Every panel groups by `instance`, which is the same address the node events resolve a target from, so a spike names a machine an operator can reach, and every legend carries the `underpost_role` — `hub`, `control` or `worker` — that Prometheus relabels on from the node registry.

The hub appears in all four hardware panels once its collector is provisioned with `wireguard --node-exporter`; see [Host metrics outside the cluster](<./Edge Hub WireGuard and HAProxy.md#host-metrics-outside-the-cluster>).

Dashboards are file-provisioned and re-read every 30 seconds, so a dashboard change lands without a restart. Datasources are provisioned at start only, which is why a sync rolls Grafana and not the other three components.

To open them in a browser, see [Reaching Grafana from a browser](#reaching-grafana-from-a-browser).

---

## Grafana administrator credentials

The cron deploy environment supplies the credential source:

```dotenv
GF_SECURITY_ADMIN_USER=<admin-login>
GF_SECURITY_ADMIN_PASSWORD=<admin-password>
GF_SECURITY_ADMIN_EMAIL=<admin-email>
```

Provisioning creates `secret/grafana-admin` with `admin-user` and `admin-password`. The generated Deployment reads both through `secretKeyRef`; the password is never rendered into a Deployment or ConfigMap, and secret-bearing apply commands are not logged. `GF_SECURITY_ADMIN_EMAIL` is not injected as a Grafana environment setting. When present, the convergence step updates the existing administrator profile through Grafana's user API after Grafana is ready.

For an encrypted source of truth, onboard the two credential values from the cron environment into SOPS/Age once:

```bash
node bin secret --setup grafana-admin --namespace default
```

After changing the cron values, either replace the encrypted manifest and converge, or use the cron environment directly when no encrypted manifest exists:

```bash
# SOPS-backed credential rotation
node bin secret --setup grafana-admin --namespace default --force
node bin monitor --sync-prom --kubeadm --namespace default

# Full stack convergence also performs the same credential sync
node bin monitor --observability --kubeadm \
  --node-name localhost.localdomain --node-port
```

`--sync-prom` applies the Secret, changes only Grafana's pod-template Secret version, waits for its `Recreate` rollout, then converges the administrator login, email, password, and server-admin permission stored in the existing PVC. Repeating it with unchanged values is idempotent and does not recreate the PVC, Service, dashboards, or the other monitoring workloads.

Reconciliation logs only its source, Secret resource version, login candidates, HTTP status codes, and completed stages. It never logs either password. If an existing PVC rejects the requested password, the Grafana CLI reset uses the container's configured home, config, and data paths before the user API is retried.

Verify references and lifecycle without printing the Secret data:

```bash
kubectl get secret grafana-admin -n default -o name
kubectl get deployment grafana -n default \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="grafana")].env[*]}{.name}{" -> "}{.valueFrom.secretKeyRef.name}{"/"}{.valueFrom.secretKeyRef.key}{"\n"}{end}'
```

---

## Reaching Grafana from a browser

The Grafana Service is `ClusterIP`. That is what Prometheus' provisioned datasource and the edge route resolve, and it deliberately publishes nothing: a `LoadBalancer` Service on a kubeadm or K3s cluster with no cloud controller sits at `<pending>` forever, looking configured and reaching nobody.

Browser access is a separate, explicit decision, and there are two — either or both.

### LAN: NodePort

```bash
node bin monitor --observability --node-port
# or, without redeploying the stack:
node bin monitor --expose-grafana --node-port
```

Publishes `grafana-nodeport` on **32300** across every node. With a two-node cluster:

```
http://192.168.1.85:32300      # control plane
http://192.168.1.191:32300     # worker — a NodePort answers on every node
```

No DNS and no certificate. Good for an operator on the same network; not something to expose to the internet.

### Public: sub-path on an existing host

```bash
node bin monitor --observability --grafana-host www.nexodev.org
# or, without redeploying the stack:
node bin monitor --expose-grafana --grafana-host www.nexodev.org
```

Attaches an `HTTPRoute` at `PathPrefix /grafana` to the Gateway that **already terminates TLS for that hostname**, so the dashboards ride the certificate cert-manager issued for the site rather than needing one of their own:

```
https://www.nexodev.org/grafana
```

The hostname is resolved against the live Gateways, not guessed. A host no Gateway serves is refused up front — a route attached to a Gateway that does not list its hostname is accepted by Kubernetes and then never matched, which surfaces only as a bare 404 with nothing logged.

The route carries **no rewrite**. Grafana is told to serve from the sub-path, so it expects to receive `/grafana/...`; stripping the prefix would break every asset URL it generates.

### Why the URL is set at exposure time

Grafana builds every asset link, redirect and OAuth callback from `root_url`. The two exposures need opposite answers — sub-path behind the edge, root on a NodePort — so `GF_SERVER_ROOT_URL` and `GF_SERVER_SERVE_FROM_SUB_PATH` are absent from the manifest and set from the resolved exposure instead:

| Exposure                | `root_url`                | `serve_from_sub_path` |
| ----------------------- | ------------------------- | --------------------- |
| `--grafana-host <host>` | `https://<host>/grafana/` | `true`                |
| `--node-port`           | `http://<node-ip>:32300/` | `false`               |
| neither                 | `http://localhost:3000/`  | `false`               |

The last row is the `kubectl port-forward` case, which stays available regardless:

```bash
kubectl port-forward svc/grafana 3000:3000 -n default
```

Re-running with different flags converges Grafana onto the new answer, and dropping `--grafana-host` removes the route.

---

## Cluster prerequisites

`--observability` verifies what the stack depends on before applying anything:

- **Cluster DNS (CoreDNS / kube-dns)** is verified, not installed. Every component is addressed by a `svc.cluster.local` name, so without it the stack comes up green and scrapes nothing. It belongs to the cluster runtime (kubeadm, K3s, Kind), so a missing one is reported and the run stops.
- **The Gateway API control plane** is installed when absent, by running `cluster --gateway-api` — the same Helm-based install that would otherwise be run by hand. Without it the `envoy-gateway` job discovers no targets.
- **The local-path provisioner** is verified and installed when absent, then awaited before Grafana is created. Its `rancher.io/local-path` controller is what binds `grafana-pvc`; a StorageClass alone cannot provision a volume.

---

## Cluster runtimes and node placement

The stack runs unchanged on kubeadm, Kind and K3s. Two things differ between them, and both are resolved rather than assumed.

**The host address Alertmanager delivers to.** The event dispatcher runs on the machine, not in a pod. On kubeadm and K3s the kubelet runs on that same machine, so the node's `InternalIP` _is_ the host. On Kind each node is a Docker container on its own bridge — its `InternalIP` is the container, and a webhook sent there never reaches the dispatcher — so the bridge gateway is used instead. Pass `--webhook-url` to override the resolution entirely.

The cluster runtime is inferred from `--kubeadm` / `--kind` / `--k3s`, defaulting to Kind under `--dev` and kubeadm otherwise.

**Where the workloads land.** `--node-name` strictly pins all four Deployments:

```bash
node bin monitor --observability --node-name kind-worker
node bin monitor --observability --k3s --node-name node-01
```

Grafana's PVC is provisioned by local-path (built into Kind and K3s, ensured by this command on kubeadm). When an existing PVC belongs to another node, the command deletes the Grafana Deployment or StatefulSet, its Services and route, then changes the PV reclaim policy to `Delete` and removes the PVC and PV. It waits for every deletion before creating fresh storage and a Deployment whose node selector names the requested node. This relocation permanently deletes the existing Grafana database and UI-managed state; provisioned dashboards are recreated from the ConfigMaps.

`--node-name` also selects the address reported for `--node-port`.

Grafana rolls with `Recreate` so two Grafana processes never write its local data directory concurrently. The initial Deployment already contains its node pin and URL model; republishing an existing Deployment applies those same fields in one patch.

The same flag is available on `cluster` (where it replaced `--node-selector`) and on `--metrics-server`.

---

## Recovering Grafana

The deploy command now fails if any component misses its rollout deadline and prints the pod description; it does not report “stack deployed” after a timeout. Start recovery by pulling the fix and converging the stack again:

```bash
node bin monitor --observability --kubeadm --node-name localhost.localdomain --node-port
```

If `grafana-pvc` belongs to another node, this command intentionally deletes its data and recreates Grafana on `localhost.localdomain`. It ensures the local-path controller is ready and applies placement before Kubernetes creates the replacement pod.

Confirm the new placement and volume:

```bash
kubectl get pods -n default -l 'app in (prometheus,alertmanager,blackbox-exporter,grafana)' -o wide
kubectl get pvc grafana-pvc -n default -o wide
```

For any other `Pending` reason, read the scheduler event attached to the pod:

```bash
kubectl get pods -n default -l app=grafana -o wide
kubectl describe pods -n default -l app=grafana
kubectl get pvc grafana-pvc -n default
kubectl get deployment -A | grep local-path-provisioner
```

`pod has unbound immediate PersistentVolumeClaims` means the provisioner is absent or unhealthy; re-running the command above repairs that prerequisite. `Insufficient cpu` or `Insufficient memory` requires freeing capacity or choosing a node with enough capacity.

---

## metrics-server

```bash
node bin monitor --metrics-server
node bin monitor --metrics-server --node-name node-01
node bin monitor --metrics-server --k3s --force
```

A different concern from this stack: metrics-server backs the resource API that `kubectl top` and the HorizontalPodAutoscaler read, and keeps no history. Prometheus keeps history and answers queries. Neither substitutes for the other.

`--kubelet-insecure-tls` is appended on kubeadm and Kind, whose kubelets serve a self-signed certificate that metrics-server would otherwise reject with an x509 error on every node. The patch is applied only when the flag is absent, so a re-run does not append a duplicate. K3s bundles its own metrics-server already wired to its kubelets; installing this one there would leave two Deployments contending for the same APIService, so it is skipped unless `--force` is passed.

---

## Cockpit KVM dashboard

The web console for the libvirt guests the baremetal and LXD flows provision, served on host port 9090.

```bash
node bin monitor --cockpit        # install, enable, open the firewall service
node bin monitor --cockpit-stop   # stop, disable, close the firewall service
```

Installs `cockpit`, `cockpit-machines` and `libvirt` via dnf, enables `cockpit.socket` and `libvirtd`, and re-declares the `cockpit` firewalld service — removed then added, because a permanent rule from an earlier release may name a different zone and re-adding over it would leave both in place. Each step is guarded on the tool actually being present, so a host without firewalld is configured and warned about rather than failed.

`--cockpit-stop` reverses only what was opened. `libvirtd` is left running: it hosts the guests themselves, and this command manages the console in front of them, not the hypervisor.

Cockpit and Prometheus both default to port 9090. They do not collide — Prometheus is a ClusterIP Service inside the cluster while Cockpit binds the host — but a NodePort exposing Prometheus on the host must not use 9090 on a node that also runs this dashboard.

---

## Options

### `node bin monitor [deploy-id] [env]`

| Option                           | Description                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| `--observability`                | Deploy or converge the whole stack                                          |
| `--sync-prom`                    | Regenerate configuration and reload the running components in place         |
| `--events <ids>`                 | Comma-separated event ids to provision (default: every registered event)    |
| `--webhook-url <url>`            | URL Alertmanager delivers to (default: the node's InternalIP on port 39099) |
| `--extra-targets <t>`            | Comma-separated additional `host:port` targets scraped at `/metrics`        |
| `--namespace <name>`             | Namespace holding the stack (default: `default`)                            |
| `--node-name <node>`             | Pin every workload; moving Grafana deletes and recreates its local storage  |
| `--grafana-host <h>`             | Publish Grafana at `https://<h>/grafana` through that host's Gateway        |
| `--node-port`                    | Publish Grafana on the node's LAN address (32300)                           |
| `--expose-grafana`               | Republish Grafana without redeploying the stack                             |
| `--webhook-token`                | Print the shared event webhook token                                        |
| `--kubeadm` / `--kind` / `--k3s` | Cluster runtime, for node and host address resolution                       |
| `--metrics-server`               | Install the Kubernetes metrics-server                                       |
| `--cockpit` / `--cockpit-stop`   | Install/enable or stop the Cockpit KVM dashboard on this host               |
| `--force`                        | Confirm an install that replaces a bundled component                        |

`deploy-id` selects which deploys are scraped, not which stack to act on — the stack is cluster-scoped. Left empty or set to `dd`, it resolves to the cron deploy named by `engine-private/deploy/dd.cron` **plus** every deploy in `engine-private/deploy/dd.routes` — exactly the set `loadCronDeployEnv()` loads. `dd.routes` alone would leave the cron deploy, the one that runs the backups, the DNS records and the bandwidth guard, as the single unmonitored runtime on the cluster.

### `node bin event [event-id]`

| Option                | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `--deploy`            | Merge the event into the cluster's deployed set and republish            |
| `--undeploy`          | Remove the event from the deployed set and republish without it          |
| `--serve`             | Run the webhook receiver in the foreground (ends with the session)       |
| `--service`           | Install and start the receiver as the `underpost-event` systemd unit     |
| `--service-status`    | Report whether that unit is active and enabled                           |
| `--service-stop`      | Stop, disable and remove that unit                                       |
| `--list`              | List registered events with their resolved probe targets                 |
| `--port <port>`       | Listening port for `--serve` (default: `39099`)                          |
| `--cooldown-ms <ms>`  | Minimum interval between two dispatches of one event (default: `300000`) |
| `--spoke <id>`        | Spoke to remediate by hand, by topology peer id                          |
| `--nodes <names>`     | Comma-separated node documents to act on; empty covers every one         |
| `--webhook-url <url>` | URL written into the generated route with `--deploy`                     |
| `--dry-run`           | Report the remediation without running it                                |
| `--no-notify`         | Skip the notifications the event declares                                |
| `--e2e-test`          | Rehearse the event against the live edge, notification included          |

---

## See also

- [Monitor cluster](<./Monitor cluster.md>) — per-deploy health monitoring and readiness gating
- [Edge Hub WireGuard and HAProxy](<./Edge Hub WireGuard and HAProxy.md>) — the transport the two WireGuard events repair
- [Main cluster lifecycle commands](<./Main cluster lifecycle commands.md>)
