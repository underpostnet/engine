# Monitor cluster Guide

Quick reference for the `underpost monitor` command — run health checks, wait for readiness, and optionally perform automated recovery (restart/switch traffic) for deployments.

## Usage
```
node bin monitor <deploy-id> [env] [options]
# or
underpost monitor <deploy-id> [env] [options]
```

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

## Examples
```
node bin monitor my-service                       # monitor in development (default)
node bin monitor my-service production --now --single
node bin monitor my-service production --ms-interval 30000 --replicas 3
node bin monitor my-service production --type blue-green --sync
node bin monitor my-service production --ready-deployment --versions v1.2.0 --promote
node bin monitor dd                                # monitor all deploy-ids listed in ./engine-private/deploy/dd.router
```

## Notes
- Passing `dd` runs monitoring for all deploy-ids listed in `./engine-private/deploy/dd.router` (if present).
- For `blue-green` type, sustained failures trigger proxy/ConfigMap updates, a rollout restart of the affected deployment, and a traffic switch automatically.
- See `node bin monitor --help` or `underpost monitor --help` for full option details.