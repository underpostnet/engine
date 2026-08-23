# Deploy Custom Instance to Kubernetes

## Overview

This guide covers how to deploy custom application instances to Kubernetes using the Underpost CLI. The `run instance` command allows you to deploy containerized applications with custom configurations, manage traffic routing, and perform blue-green deployments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration File Structure](#configuration-file-structure)
- [Path-based multi-instance deployments](#path-based-multi-instance-deployments)
- [Core Commands](#core-commands)
- [Deployment Workflow](#deployment-workflow)
- [Advanced Usage](#advanced-usage)
- [Traffic Management](#traffic-management)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Kubernetes cluster (Kind, Kubeadm, or K3s)
- Underpost CLI installed (`npm install -g underpost`)
- Docker or Podman for image management
- Valid configuration file at `./engine-private/conf/<deploy-id>/conf.instances.json`

## Configuration File Structure

Create a configuration file at `./engine-private/conf/<deploy-id>/conf.instances.json`:

```json
[
  {
    "id": "app-instance-1",
    "runtime": "my-runtime",
    "host": "myapp.example.com",
    "path": "/",
    "image": "underpost/underpost-engine:latest",
    "fromPort": 8080,
    "toPort": 8080,
    "cmd": {
      "development": [
        "underpost config set container-status dd-myapp-app-instance-1-development-initializing-deployment",
        "node server.js"
      ],
      "production": [
        "underpost config set container-status dd-myapp-app-instance-1-production-initializing-deployment",
        "node server.js"
      ]
    },
    "volumes": [
      {
        "volumeMountPath": "/app/data",
        "claimName": "app-data-pvc"
      }
    ],
    "metadata": {
      "description": "Primary application instance"
    }
  }
]
```

### Configuration Parameters

| Parameter        | Type   | Description                                                                                                                                                                                                                             |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string | Unique identifier for the instance                                                                                                                                                                                                      |
| `runtime`        | string | (Optional) Dockerfile source dir under `src/runtime/<runtime>/Dockerfile` used by `instance-build-manifest`. Omit when the image is pre-built/pulled.                                                                                   |
| `host`           | string | Domain name for the instance                                                                                                                                                                                                            |
| `path`           | string | URL path prefix (default: `/`)                                                                                                                                                                                                          |
| `image`          | string | Docker image to deploy (optional, defaults to `underpost/underpost-engine`)                                                                                                                                                             |
| `fromPort`       | number | Container port to expose (production)                                                                                                                                                                                                   |
| `toPort`         | number | Target port mapping (production)                                                                                                                                                                                                        |
| `fromDebugPort`  | number | Container port to expose in development/`--dev` mode (optional, falls back to `fromPort`)                                                                                                                                               |
| `toDebugPort`    | number | Target port mapping in development/`--dev` mode (optional, falls back to `toPort`)                                                                                                                                                      |
| `cmd`            | object | `{development: string[], production: string[]}` — array of shell commands joined by the runner. Supports the `{{grpc-service-dns}}` template.                                                                                           |
| `lifecycle`      | object | K8S `lifecycle` hooks (`postStart`, `preStop`) plus the per-instance `imagePullPolicy` extension (see [imagePullPolicy](#imagepullpolicy--per-instance-override-extension)). May be env-scoped (`{development, production}`) or shared. |
| `readinessProbe` | object | K8S `readinessProbe` — see [Lifecycle, readiness, and liveness](#lifecycle-readiness-and-liveness--moving-status-hooks-out-of-cmd). May be env-scoped.                                                                                  |
| `livenessProbe`  | object | K8S `livenessProbe`. May be env-scoped.                                                                                                                                                                                                 |
| `volumes`        | array  | Volume mount configurations                                                                                                                                                                                                             |
| `metadata`       | object | Additional metadata                                                                                                                                                                                                                     |

### `cmd` conventions

`cmd[env]` is an array of shell strings. The runner joins them with `&&` and executes the result as the container's command. Two conventions every instance should follow:

1. **Container-status lifecycle**. Stamp `initializing` and `stopping` from `lifecycle.postStart.exec` / `lifecycle.preStop.exec` hooks (see the next subsection) — never inside the `cmd` chain. The `running` state is owned by Kubernetes: when the `readinessProbe` succeeds the pod's `status.conditions[Ready]` flips to True, and the orchestrator reads that condition directly. The runtime process must never shell out to a wrapper command after starting; if it cannot bind its listening socket it must exit non-zero, which surfaces as CrashLoopBackOff.

2. **Image-baked CLI**. The runtime image must already include the `underpost` CLI; do **not** `npm install -g underpost` in `cmd`. That step belongs in the Dockerfile (see `src/runtime/cyberia-server/Dockerfile` and `src/runtime/cyberia-client/Dockerfile` for the `ARG UNDERPOST_VERSION` + `npm install -g` pattern).

### `runtime` field and Dockerfile resolution

When you set `runtime: "<name>"`, `underpost run instance-build-manifest` copies a Dockerfile from `src/runtime/<name>/` into the generated manifest directory. Dev/prod selection:

| Mode                 | Lookup order                    | Fallback                                      |
| -------------------- | ------------------------------- | --------------------------------------------- |
| `--dev`              | `Dockerfile.dev` → `Dockerfile` | Warns and uses `Dockerfile` if `.dev` missing |
| production (default) | `Dockerfile`                    | —                                             |

`Dockerfile.dev` is a **full Dockerfile, not an overlay** — each runtime owns the contract between its dev and prod images. Reference dev variants for the Cyberia stack:

- `src/runtime/cyberia-server/Dockerfile.dev` — Go build with `-gcflags="all=-N -l"` (no inlining/opt), runtime image keeps `procps-ng`, `strace`, `lsof`, `vim-minimal` for live inspection.
- `src/runtime/cyberia-client/Dockerfile.dev` — Emscripten build with `BUILD_MODE=DEBUG` (DWARF symbols, asserts), default `CYBERIA_PORT=8082` + `CYBERIA_MODE=development`.

Every runtime Dockerfile must:

- Multi-stage build (builder → runtime).
- Install `underpost@<image-tag-version>` in the runtime stage (so `cmd` skips the slow install at every pod boot).
- Expose the port that `fromPort` references.
- Ship a useful default `ENTRYPOINT` / `CMD` for `docker run` direct invocations; K8S deploys override this with `cmd[env]`.

### Lifecycle, readiness, and liveness — moving status hooks out of `cmd`

An instance config may declare K8S-native lifecycle hooks and probes. These splice directly into the container spec generated by `instance-build-manifest` / `instance`, **replacing the anti-pattern of chaining `underpost config set container-status …` calls inside the shell `cmd` string**.

```jsonc
{
  "id": "mmo-server",
  "runtime": "cyberia-server",
  "image": "underpost/cyberia-server:v3.3.0",
  "fromPort": 8081,
  "toPort": 8081,
  "cmd": {
    "production": [
      "set -a && . /env/production.env && set +a && export ENGINE_GRPC_ADDRESS={{grpc-service-dns}} && exec /home/dd/engine/cyberia-server/server",
    ],
  },
  "lifecycle": {
    "production": {
      "postStart": {
        "exec": {
          "command": [
            "sh",
            "-c",
            "underpost config set container-status dd-cyberia-mmo-server-production-initializing-deployment || true",
          ],
        },
      },
      "preStop": {
        "exec": {
          "command": [
            "sh",
            "-c",
            "underpost config set container-status dd-cyberia-mmo-server-production-stopping-deployment || true",
          ],
        },
      },
    },
  },
  "readinessProbe": {
    "tcpSocket": { "port": 8081 },
    "initialDelaySeconds": 3,
    "periodSeconds": 5,
    "timeoutSeconds": 3,
    "failureThreshold": 6,
  },
  "livenessProbe": {
    "tcpSocket": { "port": 8081 },
    "initialDelaySeconds": 30,
    "periodSeconds": 20,
    "failureThreshold": 3,
  },
}
```

Status transitions explained:

| Status                    | Stamped by                                                                         | Trigger                                                         |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `initializing-deployment` | `lifecycle.postStart.exec` — K8S runs this immediately after the container starts. | Pod boot.                                                       |
| `running-deployment`      | Kubernetes `readinessProbe` (TCP socket) passes — kubelet sets `Ready: True`.      | Successful socket bind; a crashing runtime never reaches Ready. |
| `stopping-deployment`     | `lifecycle.preStop.exec` — K8S runs this before sending SIGTERM.                   | Pod termination (scale-down, rolling update, eviction).         |

K8S marks the pod **Ready** only when `readinessProbe` succeeds (TCP socket on the listening port). A runtime that crashes on startup exits non-zero, kubelet surfaces a CrashLoopBackOff, and the pod's Ready condition stays False — the orchestrator gate never opens.

#### How the monitor observes instances

`underpost run instance` drives `monitorReadyRunner` in **kubernetes-gate + exec-transport** mode (`{ readyGate: 'kubernetes', statusTransport: 'exec' }`), which matches this lifecycle exactly:

- **Running signal = K8s Ready.** Success is declared when every pod's `readinessProbe` passes — the instance runtime never stamps `running-deployment`, so the monitor does not wait for it.
- **Status read = `kubectl exec … underpost config get container-status`.** Instances have no `/_internal/status` HTTP endpoint (that belongs to `underpost start` runtimes only), so the monitor reads the env-file value the `lifecycle` hooks stamp. It is used for fast `error` fast-fail and for the display column, not as the readiness gate.
- **Crash detection = pod state.** A crashing binary surfaces as `CrashLoopBackOff`/`Error` and the monitor fails immediately.

By contrast, `underpost start` deploys (the engine itself, `dd-*` with `conf.server.json`) run in the default **runtime-gate + http-transport** mode: they serve `/_internal/status`, their HTTP `readinessProbe` (`/_internal/ready`) gates K8s Ready on `running-deployment`, and `buildManifest` injects `UNDERPOST_INTERNAL_PORT` so the endpoint, the probes, and the monitor's port-forward target all agree.

Each block (`lifecycle`, `readinessProbe`, `livenessProbe`) may be either a single object (shared across envs) or `{ development: {...}, production: {...} }` for env-scoped values — useful when dev runs on a different port than prod.

### `imagePullPolicy` — per-instance override (extension)

The `instance` and `instance-build-manifest` runners recognise a non-standard `imagePullPolicy` key placed **inside the env-scoped `lifecycle` block**, alongside `postStart`/`preStop`. The runner extracts it onto the container spec (where K8S expects it) and strips it from the lifecycle hash before rendering the manifest, so the generated `deployment.yaml` is valid K8S regardless of how the conf is shaped.

```jsonc
{
  "id": "mmo-server",
  "image": "underpost/cyberia-server:v3.3.0",
  "lifecycle": {
    "development": {
      "imagePullPolicy": "Always",
      "postStart": {
        "exec": { "command": ["sh", "-c", "underpost config set container-status …-initializing-deployment || true"] },
      },
      "preStop": {
        "exec": { "command": ["sh", "-c", "underpost config set container-status …-stopping-deployment || true"] },
      },
    },
    "production": {
      "imagePullPolicy": "Always",
      "postStart": {
        "exec": { "command": ["sh", "-c", "underpost config set container-status …-initializing-deployment || true"] },
      },
      "preStop": {
        "exec": { "command": ["sh", "-c", "underpost config set container-status …-stopping-deployment || true"] },
      },
    },
  },
}
```

This compiles to the following container snippet in the rendered manifest:

```yaml
- name: dd-cyberia-mmo-server-production-blue
  image: underpost/cyberia-server:v3.3.0
  imagePullPolicy: Always
  …
  lifecycle:
    postStart: { exec: { command: ["sh", "-c", "underpost config set container-status …-initializing-deployment || true"] } }
    preStop:   { exec: { command: ["sh", "-c", "underpost config set container-status …-stopping-deployment || true"] } }
```

Resolution rules:

| Source                                                     | Wins                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--image-pull-policy <policy>` CLI flag on `run instance`  | Highest — overrides the conf value.                                                                                        |
| `lifecycle.<env>.imagePullPolicy` in `conf.instances.json` | Used when the CLI flag is omitted.                                                                                         |
| _(none)_                                                   | Falls back to `Never` for `localhost/…` images and `IfNotPresent` for every other image — preserving the existing default. |

Use `Always` when the image tag is mutable (e.g. `:latest` or a moving CI tag) so kubelet re-pulls on every pod rollout. Use `IfNotPresent` for immutable, version-pinned tags (recommended default for production). Use `Never` for images already side-loaded into the node (`kind load docker-image …` or `crictl load`).

> The `imagePullPolicy` key is **only** recognised inside the lifecycle block by the instance runners — it is not part of the K8S `lifecycle` schema, and putting it anywhere else in the instance config has no effect. The same `--image-pull-policy` flag is accepted by `node bin run sync` and `node bin deploy --build-manifest` for non-instance deploys (see Main cluster lifecycle commands → Sync).

## Path-based multi-instance deployments

Any instance entry can act as a **template** that expands into one deployment per
declared variant, with the variant selected by URL path rather than by a separate
image or hostname. Adding a variant is a config edit — no new build, image, or
DNS record. Nothing in the mechanism is application-specific: the runners never
know what a variant _means_. Project-specific environment behavior is handled by
an env builder registered with the generic dispatch hook.

`conf.instances.json` stays a **plain array** of instance entries. An entry opts
into multi-instance by declaring its own `multiInstance` block — there is no
deploy-wide wrapper. The block is self-contained: it carries the variant set
and the prefix-strip flag (`stripPathPrefix`). Runtime configuration does not
belong in this topology file.

```jsonc
[
  {
    "id": "mmo-server",
    // …
    "multiInstance": {
      "stripPathPrefix": true,
      "variants": ["/", "/FOREST", "/TEST"],
    },
  },
  {
    "id": "mmo-client",
    // …
    "multiInstance": {
      "stripPathPrefix": false,
      "variants": ["/", "/FOREST", "/TEST"],
    },
  },
]
```

An entry with no `multiInstance` block is deployed as-is (single instance). Each
multi-instance entry declares its own variant set; when several entries take part
(server + client), keep their `variants` in sync — routing derives the topology
from the first entry that declares one.

| Key               | Meaning                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `variants[]`      | URL path string. `/` is the default; `/FOREST` derives code `FOREST`, lowercase slug `/forest`, and path `/FOREST`.                        |
| `stripPathPrefix` | Emit a `replacePrefix` rewrite so the backend receives `/` and stays instance-agnostic. Use it for runtimes that serve routes at the root. |

The root variant is normalized first and keeps the template workload, PVC, and
env-directory id. If `variants` omits `/`, it is inserted automatically. An
entry with no usable multi-instance variants follows the ordinary single-instance
build and defaults a missing `path` to `/`.

`CONTAINER_DEPLOY_ID` is always derived and written for you — it never needs declaring.

### Canonical env files and project builders

Keep the complete runtime configuration in the template instance's canonical
files, one file per environment:

```
engine-private/conf/<deploy-id>/instances/<template-id>/env/development.env
engine-private/conf/<deploy-id>/instances/<template-id>/env/production.env
```

Canonical files use ordinary dotenv syntax. They contain complete default values
and operator-owned secrets, with no templating annotations:

```dotenv
# mmo-server/env/production.env
INSTANCE_CODE=amethyst-strata-expansion
CYBERIA_BASE_PATH=/
ENGINE_API_BASE_URL=https://www.cyberiaonline.com
CYBERIA_SERVER_API_KEY=<operator-owned-secret>
```

```dotenv
# mmo-client/env/production.env
CYBERIA_INSTANCE_CODE=amethyst-strata-expansion
CYBERIA_DEFAULT_INSTANCE=amethyst-strata-expansion
CYBERIA_BASE_PATH=/
CYBERIA_WS_ORIGIN=wss://server.cyberiaonline.com
CYBERIA_ENGINE_API_ORIGIN=https://www.cyberiaonline.com
```

The generic `dispatchBuildInstanceEnv` hook in `src/server/runtime/conf.js` selects a
builder by deploy id. Cyberia registers `buildCyberiaMmoInstanceEnv` from
`src/projects/cyberia/instance-data.js`. The generic root variant has an empty
code and slug; Cyberia maps it to `DEFAULT_INSTANCE_CODE` from
`SharedDefaultsCyberia.js` while keeping path `/`. Non-root variants derive their
literal code and base path. Origins, API keys, and other operator values remain
unchanged, and separate canonical files continue to provide environment-specific
values.

Do not add an `env` object to `multiInstance`. It is rejected so configuration
and secrets cannot drift into topology JSON. Add application-specific derived
fields to the project builder and register it with the dispatcher instead.

### What expansion produces

`mmo-server` + the three variants above yields `mmo-server`, `mmo-server-forest`
and `mmo-server-test`. The template id token is replaced throughout each entry,
so the env file path, volume mount and `container-status` strings all follow:

```
dd-cyberia-mmo-server-forest-production-blue
  env    engine-private/conf/dd-cyberia/instances/mmo-server-forest/env/production.env
  code   INSTANCE_CODE=FOREST
```

Each per-instance env file is built from the canonical template file, so
operator-owned keys (API keys, memory limits) are inherited and only fields owned
by the project builder are rewritten. All instances keep pointing at the
**shared** parent gRPC service — content is authored once and served to every
variant.

### Routing

One Contour `HTTPProxy` is named per host, so all instances sharing a host are
rendered into a single object with routes ordered longest-prefix first. Promoting
one instance preserves its siblings' routes rather than replacing them.

```yaml
routes:
  - conditions: [{ prefix: /FOREST }] # rewritten to / when stripPathPrefix
  - conditions: [{ prefix: /TEST }]
  - conditions: [{ prefix: / }] # default variant, matched last
```

#### Each variant sub-path is its own deployment

The host object is shared, but the deployments behind it are not: every variant
is a separate Deployment and Service, promoted on its own colour. Because the
shared object is rewritten whole on each promote, the render is **not** limited to
what `conf.instances.json` currently declares — a variant removed from the
`variants` list while its workload is still running keeps its route, and only
loses it once its Deployment is gone.

The descriptors that make this possible are recorded per host next to the
generated Nginx block, as `<host>.instances.json` under
`engine-private/conf/<deploy-id>/build/<env>/gateway-conf.d/`. It is written on
every promote. Use a concrete instance id to scope a deploy; the root variant is
always retained by topology normalization.

### Targeting

Targeting a **template id** acts on the whole family; targeting a concrete id
acts on one instance:

```bash
# All variants
node bin run instance-build-manifest 'dd-cyberia,mmo-server,./cyberia-server' --kubeadm

# Just one
node bin run instance-build-manifest 'dd-cyberia,mmo-server-forest,./cyberia-server' --kubeadm
```

Only the instance whose id matches the template verbatim publishes its artifacts
to the project root, so the repo keeps one canonical `Dockerfile` /
`deployment.yaml` pair.

### Client-side instance resolution

The client ships **one** WASM binary for every variant. `runtime_config_init()`
reads the first path segment of `window.location.pathname`, falling back to
`window.CYBERIA_DEFAULT_INSTANCE`, and composes
`<CYBERIA_WS_ORIGIN>/<instance>/ws`. `docker-driver.py` injects those globals
into `index.html` from the deployment env and strips the leading instance
segment when resolving files, so the flat bundle is served under every path
while the browser URL — the source of the instance code — is preserved.

## Core Commands

### 1. Deploy Instance

Deploy a custom instance to Kubernetes:

```bash
# Development mode (using Kind cluster)
node bin run --dev instance <deploy-id>,<instance-id>[,<replicas>]

# Production mode (using Kubeadm cluster)
underpost run instance <deploy-id>,<instance-id>[,<replicas>]

# With specific options
underpost run --namespace production --node-name worker-01 instance myapp,app-1,3
```

**Example:**

```bash
# Deploy instance 'api-v1' from 'myapp' deployment with 2 replicas
underpost run instance myapp,api-v1,2
```

A direct `run instance` resolves the next blue/green colour before creating anything. When the selected entries declare `customStatusPages`, it first copies those project-owned documents into `underpost-gateway`, installs the Nginx host block, and routes the hostname to that exact target colour while its Service is absent. It then verifies over the gateway that the unavailable upstream keeps a 502/503/504 status and returns the configured custom document byte-for-byte. Only after the probe passes does it render and apply `deployment.yaml`. The route remains on that colour, so the fallback automatically becomes live application traffic when Kubernetes marks the pod Ready; no second colour toggle occurs.

#### As part of a full cluster bring-up

`run cluster` takes the same instance ids as an optional third path segment and deploys them itself, so a whole environment comes up in one command:

```bash
node bin run cluster 'express,dd-cyberia,mmo-server' --dev
```

Each id is resolved against every deploy in the list and runs only where that deploy's `conf.instances.json` declares it. Instances start after their deploy's default workload has rolled out, and their hosts are folded into the run's existing TLS and `/etc/hosts` pass — self-signed in development, cert-manager in production. See [Main cluster lifecycle commands → Custom instances](<./Main cluster lifecycle commands.md>).

### 2. Promote Instance (Blue-Green Deployment)

Switch traffic from one deployment version to another:

```bash
# Development mode
node bin run --dev instance-promote <deploy-id>,<instance-id>

# Production mode with TLS
underpost run --tls --namespace production instance-promote myapp,api-v1
```

**What it does:**

- Detects current traffic routing (blue or green)
- Switches to the alternate version
- Updates HTTPProxy configuration
- Manages TLS certificates if `--tls` is specified

### 3. Get Traffic Colours

Show the live blue/green colour of every routable deployment — both the default
PWA workload and each custom instance — as a table:

```bash
# Every host of every deploy, both environments
underpost run get-traffic

# Narrow to a comma-separated host list
underpost run --namespace production get-traffic myapp.example.com,api.example.com

# Narrow to development
underpost run --dev get-traffic
```

```
HOST                      PATH     KIND      CURRENT                                                                    OPPOSITE
server.cyberiaonline.com  /        instance  dd-cyberia-mmo-server-development-green 1/1 ready serving                  dd-cyberia-mmo-server-development-blue 0/1 not-ready
server.cyberiaonline.com  /FOREST  instance  dd-cyberia-mmo-server-forest-development-blue 1/1 ready serving            dd-cyberia-mmo-server-forest-development-green - missing
underpost.net             /        pwa       dd-cyberia-development-blue 1/1 ready serving                              dd-cyberia-development-green 1/1 ready
```

Only deployments that actually exist in the namespace are listed, so the table
reports what is running rather than what the conf declares. Both environments are
scanned for the same reason — reporting a single environment chosen by a flag
would show a `development` cluster as entirely unrouted.

`CURRENT` is the deployment receiving traffic and includes its replica readiness
plus the stable Service's `serving` state. `OPPOSITE` always shows the other
colour: its readiness when running, or the expected Deployment name followed by
`missing` when absent. A route still naming a colour whose workload is gone reads
as `missing not-serving`. The environment remains visible
inside each Deployment name, so a separate `ENV` column is unnecessary. Variants
on a shared host are read individually, which is why `/` and `/FOREST` above can
sit on different colours.

### 4. List Deployments

Display all deployments:

```bash
underpost run ls-deployments

# Filter by name
underpost run ls-deployments myapp
```

### 5. List Loaded Images

View images loaded in the cluster:

```bash
# Default node (kind-worker)
underpost image --ls

# Specific node
underpost image --node-name worker-01 --ls

# Detailed specification
underpost image --ls --spec
```

## Deployment Workflow

### Complete Deployment Process

```bash
# 1. Pull/build the container image
docker pull underpost/underpost-engine:latest

# Load image into Kind cluster (development)
kind load docker-image underpost/underpost-engine:latest

# Or load into Kubeadm node (production)
underpost run --node-name worker-01 instance myapp,api-v1

# 2. Deploy the instance
underpost run --namespace production instance myapp,api-v1,3

# 3. Verify deployment
underpost run ls-deployments myapp-api-v1

# 4. Expose service with /etc/hosts configuration
underpost run --etc-hosts instance myapp,api-v1

# 5. Test and promote when ready
underpost run --tls instance-promote myapp,api-v1
```

## Advanced Usage

### Deploy with Custom Node

```bash
underpost run --node-name worker-02 instance myapp,api-v1,2
```

### Deploy with TLS/SSL

```bash
underpost run --tls --namespace production instance myapp,api-v1
```

### Deploy with Custom Namespace

```bash
underpost run --namespace staging instance myapp,api-v1
```

### Deploy with /etc/hosts Configuration

Automatically configure local DNS entries for development:

```bash
underpost run --dev --etc-hosts instance myapp,api-v1
```

### Expose Services

Deploy and expose the service simultaneously:

```bash
# Deploy first
underpost run instance myapp,api-v1,2

# Then expose
underpost run --expose instance myapp,api-v1
```

### Using Custom Images

Specify a custom image in your configuration:

```json
{
  "id": "custom-app",
  "image": "localhost/maven-dev-container-app:latest",
  "host": "app.local.dev",
  ...
}
```

Or use the default Underpost engine image:

```json
{
  "id": "custom-app",
  "image": "underpost/underpost-engine:1.0.0",
  ...
}
```

### Volume Configuration

Configure persistent volumes:

```json
{
  "volumes": [
    {
      "volumeMountPath": "/app/data",
      "claimName": "app-data-pvc"
    },
    {
      "volumeMountPath": "/app/config",
      "claimName": "app-config-pvc"
    }
  ]
}
```

## Traffic Management

### Blue-Green Deployment Strategy

The instance deployment uses a blue-green strategy:

1. **Initial Deployment**: Traffic goes to `blue` version
2. **Deploy New Version**: New pods created as `green` version
3. **Promote**: Switch traffic from `blue` to `green`
4. **Rollback**: Switch back to `blue` if needed

```bash
# Deploy initial version (creates 'blue')
underpost run instance myapp,api-v1

# Deploy updated version (creates 'green')
underpost run instance myapp,api-v1

# Promote to green
underpost run instance-promote myapp,api-v1

# Rollback to blue (promote again toggles back)
underpost run instance-promote myapp,api-v1
```

### Traffic Routing

The system automatically:

- Detects current active version (blue/green)
- Creates new pods with alternate version tag
- Updates HTTPProxy to route traffic
- Maintains zero-downtime deployments

The swap order is what makes it zero-downtime, and it holds in both directions:

- The live colour keeps serving for the whole image pull and rollout. Traffic is
  moved only after the target colour reports a ready endpoint.
- The route object is replaced in place, never deleted first, so the hostname is
  never briefly unrouted.
- The no-backend fallback checkpoint — which publishes the route before any
  workload exists, to prove the configured status page is what clients get — runs
  only when nothing is serving the host yet. On a re-deploy it is skipped, because
  proving a fallback there would mean taking a healthy host down to do it.

### Stopping a colour

`run stop` deletes colour-suffixed Deployments and their Services. It never
touches routing, so it is the way to reclaim the inactive half of a blue/green
pair. There are four ways to say what to stop, in precedence order:

```bash
# 1. Literal — exactly this Deployment and its Service. Every flag is ignored.
node bin run stop dd-cyberia-mmo-server-forest-development-blue

# 2. The deploy's PWA workload, inactive colour
node bin run stop --deploy-id dd-cyberia

# 3. ...plus every variant of each instance family, inactive colour
node bin run stop --deploy-id dd-cyberia --instance-id mmo-client,mmo-server

# 4. Explicit colours — both, wherever they exist
node bin run stop --deploy-id dd-cyberia --instance-id mmo-server --traffic blue,green
```

| Input                           | Stops                                                                |
| ------------------------------- | -------------------------------------------------------------------- |
| literal path                    | only the named Deployments; nothing is derived                       |
| `--deploy-id`                   | that deploy's PWA workload                                           |
| `--deploy-id` + `--instance-id` | the PWA workload **and** every variant of each instance family       |
| `--traffic blue,green`          | those colours instead of the inactive one, for every selected target |
| `--instance-id` alone           | refused — an instance id is only unique inside a deploy              |

Without `--traffic`, each target resolves to the blue/green partner of whatever
**it** is serving, read per target: a shared host can legitimately have `/` on
green and `/FOREST` on blue, so one answer would be wrong for the other. That
colour is read from the routing stack in use (HTTPRoute, or HTTPProxy under
`--disable-gateway-api`).

Naming the serving colour with `--traffic` is allowed and warned about — the
routes stay published and will have no backend until something is deployed
behind them. A target that is already gone is reported as absent, not an error.

## Command Options Reference

### Common Options

| Option               | Description                               |
| -------------------- | ----------------------------------------- |
| `--dev`              | Use development mode (Kind cluster)       |
| `--namespace <ns>`   | Kubernetes namespace (default: `default`) |
| `--node-name <name>` | Deploy to specific node                   |
| `--tls`              | Enable TLS/SSL certificates               |
| `--etc-hosts`        | Update /etc/hosts for local DNS           |
| `--expose`           | Expose service externally                 |
| `--replicas <n>`     | Number of pod replicas                    |
| `--force`            | Force operation, override warnings        |

### Run Command Specific Options

| Option                       | Description                |
| ---------------------------- | -------------------------- |
| `--pod-name <name>`          | Custom pod name            |
| `--image-name <image>`       | Override image from config |
| `--volume-host-path <path>`  | Host path for volume       |
| `--volume-mount-path <path>` | Container mount path       |
| `--claim-name <name>`        | PVC claim name             |

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n production | grep myapp

# View logs
kubectl logs -f myapp-api-v1-production-blue-xxxxx -n production
```

### Debug Deployment

```bash
# Check deployment details
kubectl describe deployment myapp-api-v1-production-blue -n production

# Check service
kubectl get svc myapp-api-v1-production-blue-service -n production

# Check the published traffic colour
underpost run get-traffic myapp.example.com
```

### Image Not Found

```bash
# List loaded images
underpost image --node-name worker-01 --ls

# Load image manually
kind load docker-image my-custom-image:latest

# Or for Kubeadm
docker save my-custom-image:latest -o /tmp/image.tar
scp /tmp/image.tar worker-01:/tmp/
ssh worker-01 'sudo crictl load -i /tmp/image.tar'
```

### Configuration Errors

```bash
# Validate JSON configuration
cat ./engine-private/conf/myapp/conf.instances.json | jq .

# Check for required fields
jq '.[].id' ./engine-private/conf/myapp/conf.instances.json
```

### Network Issues

```bash
# Test /etc/hosts configuration
underpost run dev-hosts-expose myapp

# Restore original /etc/hosts
underpost run dev-hosts-restore
```

### Pod Not Starting

```bash
# Check events
kubectl get events -n production --sort-by='.lastTimestamp'

# Describe pod
kubectl describe pod <pod-name> -n production

# Check resource constraints
kubectl top pods -n production
```

## Related Commands

### Development Cluster Setup

```bash
# Setup complete dev cluster
underpost run --dev dev-cluster

# With service exposure
underpost run --dev --expose dev-cluster
```

### Deploy Job (One-off Tasks)

```bash
# Run one-time job
underpost run deploy-job '' --pod-name my-job --args "echo Hello,date"
```

### Container Development

```bash
# Start development container
underpost run --dev dd-container
```

### Cleanup

```bash
# Remove deployment
kubectl delete deployment myapp-api-v1-production-blue -n production

# Remove service
kubectl delete svc myapp-api-v1-production-blue-service -n production

# Remove HTTPProxy
kubectl delete HTTPProxy myapp.example.com -n production
```

## Example: Complete Custom Instance Deployment

### 1. Create Configuration

**File:** `./engine-private/conf/mywebapp/conf.instances.json`

```json
[
  {
    "id": "frontend",
    "host": "app.mycompany.com",
    "path": "/",
    "image": "mycompany/webapp-frontend:v1.2.0",
    "fromPort": 3000,
    "toPort": 3000,
    "cmd": {
      "development": [
        "underpost config set container-status dd-mywebapp-frontend-development-initializing-deployment",
        "exec node server.js"
      ],
      "production": [
        "underpost config set container-status dd-mywebapp-frontend-production-initializing-deployment",
        "node server.js"
      ]
    },
    "volumes": [
      {
        "volumeMountPath": "/app/uploads",
        "claimName": "webapp-uploads-pvc"
      }
    ],
    "metadata": {
      "team": "frontend",
      "version": "1.2.0"
    }
  },
  {
    "id": "api",
    "host": "api.mycompany.com",
    "path": "/api",
    "image": "mycompany/webapp-api:v2.1.0",
    "fromPort": 8080,
    "toPort": 8080,
    "cmd": {
      "development": [
        "underpost config set container-status dd-mywebapp-api-development-initializing-deployment",
        "set -a && . /var/run/secrets/mywebapp/api/development.env && set +a && export ENGINE_GRPC_ADDRESS={{grpc-service-dns}} && node dist/main.js"
      ],
      "production": [
        "underpost config set container-status dd-mywebapp-api-production-initializing-deployment",
        "set -a && . /var/run/secrets/mywebapp/api/production.env && set +a && export ENGINE_GRPC_ADDRESS={{grpc-service-dns}} && node dist/main.js"
      ]
    },
    "volumes": [],
    "metadata": {
      "team": "backend",
      "version": "2.1.0"
    }
  }
]
```

### 2. Deploy Instances

```bash
# Deploy frontend
underpost run --namespace production instance mywebapp,frontend,3

# Deploy API
underpost run --namespace production instance mywebapp,api,5
```

### 3. Configure TLS

```bash
# Promote with TLS certificates
underpost run --tls --namespace production instance-promote mywebapp,frontend
underpost run --tls --namespace production instance-promote mywebapp,api
```

### 4. Verify

```bash
# Check deployments
underpost run ls-deployments mywebapp

# Check the published traffic colours
underpost run get-traffic app.mycompany.com,api.mycompany.com

# Test endpoints
curl https://app.mycompany.com
curl https://api.mycompany.com/api/health
```

## Reference: Cyberia MMO instances

The Cyberia MMO ships two instances out of the box under deploy id `dd-cyberia`. They illustrate every pattern the runner expects from third-party instance configs.

**File:** `./engine-private/conf/dd-cyberia/conf.instances.json`

- **`mmo-server`** — `runtime: "cyberia-server"` (Dockerfile at `src/runtime/cyberia-server/Dockerfile`). The Go binary `/home/dd/engine/cyberia-server/server` is the long-running process. `cmd[env]` sources a deployment-secret env file from the `instance-cyberia-server` PVC, exports the runner-resolved `ENGINE_GRPC_ADDRESS` from the `{{grpc-service-dns}}` template, then exec's the binary. Readiness is observed by Kubernetes through the `readinessProbe` (TCP socket on port 8081).

- **`mmo-client`** — `runtime: "cyberia-client"` (Dockerfile at `src/runtime/cyberia-client/Dockerfile`). The Python static-file server `server.py` serves the pre-built WASM bundle from `bin/`. Development uses `8082` (debug port); production uses `8081`. Its canonical env files provide the client build/runtime origins and annotated instance code/base path; it needs no gRPC wiring.

Both Dockerfiles install `underpost@${UNDERPOST_VERSION}` at build time (`ARG UNDERPOST_VERSION=3.3.0`), so the `cmd` entries can call `underpost config set container-status …` without paying an `npm install -g` cost on every pod boot. The two CI workflows that publish these images forward `UNDERPOST_VERSION` as a build-arg to keep the in-image CLI aligned with the image tag.

Both instances also set `lifecycle.<env>.imagePullPolicy: "Always"` so kubelet re-pulls the published image on every rollout — the CI tags (`v3.3.0`, `v3.3.0`, …) move forward only through coordinated bumps, but the registry image itself can be republished under the same tag during incident response, and `Always` ensures the cluster picks that up. See [imagePullPolicy — per-instance override](#imagepullpolicy--per-instance-override-extension).

## Best Practices

1. **Version Control**: Keep configuration files in version control
2. **Image Tags**: Use specific image tags, avoid `latest` in production
3. **Resource Limits**: Define resource requests/limits in deployments
4. **Health Checks**: Implement readiness and liveness probes
5. **Secrets**: Use Kubernetes secrets for sensitive data
6. **Namespaces**: Separate environments using namespaces
7. **Monitoring**: Set up logging and monitoring for instances
8. **Blue-Green**: Always test new versions before promoting
9. **Backups**: Maintain backups of persistent volumes
10. **Documentation**: Document instance configurations and deployment procedures

<!--
## See Also

- Cluster Management
- Deploy Command Reference
- Volume Management
- SSL/TLS Configuration
-->
