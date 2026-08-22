# Monitor cluster Guide

Quick reference for the `underpost monitor` command — run health checks, wait for readiness, optionally perform automated recovery (restart/switch traffic) for deployments, and provision the cluster observability stack.

`monitor` covers two scopes. The health-check loop below is **per deploy**: it polls one deployment's hosts and switches traffic when they stop answering. The `--observability` and `--sync-prom` flags act on the **cluster-scoped** Prometheus/Alertmanager/Blackbox/Grafana stack, where `deploy-id` selects which deploys are scraped rather than which stack to act on — see [Observability and Events](<./Observability and Events.md>).

## Usage

```
node bin monitor [deploy-id] [env] [options]
# or
underpost monitor [deploy-id] [env] [options]
```

`deploy-id` defaults to `dd`, every deploy listed in `./engine-private/deploy/dd.routes`.

## Main options

- `--now` — run an immediate health check.
- `--single` — run once and exit (use with `--now` for one-off checks).
- `--ms-interval <ms>` — set monitoring interval in milliseconds (default ≈ 60250ms).
- `--replicas <n>` — set number of replicas (default: 1).
- `--type <type>` — e.g., `blue-green`; enables traffic switching and restart behavior on sustained failures.
- `--sync` — sync current traffic/proxy state before monitoring.
- `--namespace <name>` — Kubernetes namespace (default: `default`).
- `--ready-deployment` — wait until specified versions are ready (use with `--versions`).
- `--versions <v1,v2>` — comma-separated versions to monitor in ready-deployment mode.
- `--promote` — promote the monitored version after it becomes ready.
- `--timeout-response`, `--timeout-idle`, `--retry-count`, `--retry-per-try-timeout` — HTTP proxy timeouts/retries.
- `--disable-private-conf-update` — prevent private configuration updates during execution.

## Observability stack options

- `--observability` — deploy or converge Prometheus, Alertmanager, the Blackbox Exporter and Grafana, installing the Gateway API control plane when its metrics source is missing.
- `--sync-prom` — regenerate the scrape configuration, alert rules and Alertmanager route from the live deploy configuration and event registry, then reload the running components in place.
- `--events <ids>` — comma-separated event ids to provision (default: every registered event).
- `--webhook-url <url>` — URL Alertmanager delivers events to (default: the node's InternalIP on port 39099).
- `--extra-targets <targets>` — comma-separated additional `host:port` scrape targets.
- `--node-name <node>` — pin every deployed workload to this node via a `kubernetes.io/hostname` nodeSelector.
- `--kubeadm` / `--kind` / `--k3s` — cluster runtime, used to resolve node and host addresses (default: Kind under `--dev`, kubeadm otherwise).
- `--grafana-host <host>` — publish Grafana at `https://<host>/grafana` through the Gateway that already serves that hostname.
- `--node-port` — publish Grafana on the node's LAN address (port 32300).
- `--expose-grafana` — republish Grafana with the two flags above without redeploying the stack.
- `--webhook-token` — print the shared event webhook token, to persist as `UNDERPOST_EVENT_TOKEN` in the cron deploy env.

## Host and cluster tooling options

- `--metrics-server` — install the Kubernetes metrics-server (the resource API `kubectl top` and the HPA read). Skipped on K3s, which bundles its own, unless `--force`.
- `--cockpit` — install and enable the Cockpit KVM dashboard on this host (port 9090) and open its firewall service.
- `--cockpit-stop` — stop and disable it, and close the firewall service. `libvirtd` is left running.

## Examples

```
node bin monitor my-service                       # monitor in development (default)
node bin monitor my-service production --now --single
node bin monitor my-service production --ms-interval 30000 --replicas 3
node bin monitor my-service production --type blue-green --sync
node bin monitor my-service production --ready-deployment --versions v1.2.0 --promote
node bin monitor dd                                # monitor all deploy-ids listed in ./engine-private/deploy/dd.routes

node bin monitor --observability                  # deploy/converge the cluster observability stack
node bin monitor --sync-prom                      # refresh scrape config + alert rules, reload in place
node bin monitor dd-cyberia --observability       # scrape only this deploy's runtimes
node bin monitor --observability --node-name node-01 --k3s
node bin monitor --metrics-server                 # kubectl top / HPA resource API
node bin monitor --cockpit                        # Cockpit KVM dashboard on this host

node bin monitor --observability --node-port      # Grafana on the LAN at http://<node-ip>:32300
node bin monitor --expose-grafana --grafana-host www.nexodev.org   # https://www.nexodev.org/grafana
```

## Notes

- Passing `dd` runs monitoring for all deploy-ids listed in `./engine-private/deploy/dd.routes` (if present).
- For `blue-green` type, sustained failures trigger proxy/ConfigMap updates, a rollout restart of the affected deployment, and a traffic switch automatically.
- The observability, `--metrics-server` and Cockpit flags are cluster- or host-scoped and skip the per-deploy health loop entirely; scrape targets are derived from each deploy's `conf.server.json`, and probes and alert rules from the event registry. See [Observability and Events](<./Observability and Events.md>).
- With no `deploy-id`, or with `dd`, the scrape set is the cron deploy from `engine-private/deploy/dd.cron` plus every deploy in `engine-private/deploy/dd.routes`.
- See `node bin monitor --help` or `underpost monitor --help` for full option details.
