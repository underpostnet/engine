# Main Cluster Lifecycle Commands

Minimalist reference for Underpost engine cluster lifecycle commands.

---

## Table of Contents

1. [Deploy ID Convention](#deploy-id-convention)
2. [Credential Security](#credential-security)
3. [New](#new)
4. [Env](#env)
5. [Development Server](#development-server)
6. [Cluster Build](#cluster-build)
7. [Template Deploy](#template-deploy)
8. [Node Source Pull](#node-source-pull)
9. [SSH Deploy](#ssh-deploy)
10. [Cluster](#cluster)
11. [DD Container](#dd-container)
12. [Image](#image)
13. [Default Configuration](#default-configuration)
14. [Promote](#promote)
15. [Cron](#cron)
16. [Sync](#sync)
17. [Deploy Job](#deploy-job)
18. [Node Move](#node-move)
19. [Observability and Events](#observability-and-events)
20. [Baremetal Node Commissioning & Join](#baremetal-node-commissioning--join)

---

## Deploy ID Convention

The project uses two correlated naming patterns for identifying deployments and their associated repositories:

| Pattern       | Format             | Example                                         | Usage                                                                           |
| ------------- | ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| **Deploy ID** | `dd-<conf-id>`     | `dd-core`, `dd-cyberia`, `dd-lampp`             | Configuration directories, `dd.routes`, deploy/sync/promote commands, env files |
| **Repo Name** | `engine-<conf-id>` | `engine-core`, `engine-cyberia`, `engine-lampp` | GitHub repositories, CI/CD workflows, template-deploy, ssh-deploy commit tags   |

The `<conf-id>` suffix (e.g. `core`, `cyberia`, `lampp`, `test`) is the shared identifier that links both patterns:

- **Deploy ID** `dd-<conf-id>` → config stored at `./engine-private/conf/dd-<conf-id>/`
- **Repo Name** `engine-<conf-id>` → public repo, derived as `engine-${deployId.split('dd-')[1]}`
- **Private Repo** `engine-<conf-id>-private` → private configuration repo
- **Cron Backups Repo** `engine-<conf-id>-cron-backups` → cron backup repo
- **Conf file** `conf.dd-<conf-id>.js` → deployment configuration module

When a deploy ID is provided without the `dd-` prefix, the engine normalizes it automatically: `my-app` → `dd-my-app`. However, examples in this reference use the full `dd-<conf-id>` format for clarity.

Use `dd-<conf-id>` for all deploy/cluster/configuration commands. Use `engine-<conf-id>` for repository-level operations (template-deploy paths, ssh-deploy targets, CI/CD workflow files).

---

## Credential Security

Configuration files in `./engine-private/conf/dd-<conf-id>/` use `env:` reference pointers for sensitive values instead of plaintext secrets:

```json
{
  "db": {
    "password": "env:MARIADB_PASSWORD"
  }
}
```

Actual secret values are stored in per-deploy `.env.*` files (`./engine-private/conf/dd-<conf-id>/.env.production`, `.env.development`, `.env.test`). At runtime, the engine's `resolveConfSecrets()` function replaces `"env:VAR_NAME"` with the corresponding `process.env.VAR_NAME` value. Generated `conf.dd-*.js` manifests emit `process.env.VAR || ''` expressions — no plaintext secret is ever written to source-controlled JS files.

LAMPP deploy (`dd-lampp`) clients are `null` in the public project configuration, so no client bundle is built for it.

### Repository-backed document roots

A `conf.server.json` route whose runtime serves files from a checkout declares the source repository alongside its document root, so provisioning is part of the runtime rather than an out-of-band script:

```json
{
  "www.example.com": {
    "/": {
      "runtime": "lampp",
      "directory": "/home/dd/netlify_example",
      "repository": "env:LAMPP_REPOSITORY_EXAMPLE"
    }
  }
}
```

The `env:` pointer resolves from the deploy's `.env.<env>`, keeping repository URLs and their tokens out of source control. One deploy id can back as many repositories as it has routes — each route provisions its own document root independently.

`lampp` clones the repository straight into `directory`; `wp` resolves its own site root under `/opt/lampp/htdocs/wp/<host>` and falls back to a fresh WordPress install when the remote is unreachable or the checkout has no `wp-config.php`. Both go through `UnderpostRepository.provisionSiteRoot`, which clones only when the directory is absent, so a restart never re-clones a provisioned host. The checkout keeps its `.git`, which is what lets `node bin db --backup` commit and push a site back to its repository; the generated vhost denies `.git` over HTTP.

### OCI runtime overlay

Values that only hold when a deployment runs as a container image — cluster-internal service names, in-cluster database endpoints — live in a sibling overlay file rather than in the base env file:

```
./engine-private/conf/dd-<conf-id>/.env.<env>          # host-scoped base
./engine-private/conf/dd-<conf-id>/.env.<env>.oci      # container-scoped overrides
```

The overlay declares only the keys it changes; every other key keeps the base value. It is applied automatically when the reader is a container runtime:

| Caller                                        | Overlay applied                                    |
| --------------------------------------------- | -------------------------------------------------- |
| `node bin app load`                           | Only when the process is inside a container        |
| `node bin app apply`                          | Always — the Secret is consumed by container pods  |
| `node bin app status`                         | Reports the overlay path under `ociOverlay`        |

Detection is Kubernetes service injection (`KUBERNETES_SERVICE_HOST`) or Docker's `/.dockerenv` marker, the same check `underpost state` uses. On a developer host the base file is read untouched, so a local run keeps its `127.0.0.1` endpoints while the same deploy id resolves cluster endpoints inside a pod.

Example — `./engine-private/conf/dd-core/.env.production.oci`:

```dotenv
VALKEY_HOST=valkey-service.default.svc.cluster.local
VALKEY_PORT=6379
DB_HOST=mongodb://mongodb-0.mongodb-service:27017,mongodb-1.mongodb-service:27017,mongodb-2.mongodb-service:27017
DB_REPLICA_SET=rs0
DB_AUTH_SOURCE=admin
```

Overlays are mirrored into the deploy's private configuration repository along with the rest of `conf/dd-<conf-id>/`, so no extra sync step is needed.

> **⚠️ Important:** Ensure `.env.*` files and `engine-private/` are listed in `.gitignore` and never committed to public repositories.

---

## New

**Command:** `node bin new [app-name] [options]`

Creates deployment configurations, cluster files, and project scaffolding.

```bash
node bin new --deploy-id dd-my-app
node bin new --deploy-id dd-my-app --cluster
node bin new --default-conf --deploy-id dd-my-app
node bin new --sub-conf client my-service
node bin new --deploy-id dd-my-app --build
node bin new --deploy-id dd-my-app --purge
```

| Option                    | Description                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--deploy-id <id>`        | Create deployment ID configuration and env files (format: `dd-<conf-id>`)                                                   |
| `--cluster`               | Create cluster files and sync (requires `--deploy-id`)                                                                      |
| `--sub-conf <type>`       | Create sub-configuration files (`client`, `server`)                                                                         |
| `--build`                 | Build deployment to pwa-microservices-template                                                                              |
| `--build-repos`           | Create deployment ID repositories (`engine-<conf-id>`, `engine-<conf-id>-private`, `engine-<conf-id>-cron-backups`)         |
| `--clean-template`        | Clean the build directory                                                                                                   |
| `--sync-conf`             | Sync configuration to private repositories                                                                                  |
| `--sync-start`            | Sync start scripts in deploy ID `package.json` with root `package.json` (use `dd` as `--deploy-id` to sync all `dd.routes`) |
| `--purge`                 | Remove deploy ID and all related files                                                                                      |
| `--dev`                   | Development CLI context                                                                                                     |
| `--default-conf`          | Create default deploy ID configuration                                                                                      |
| `--conf-workflow-id <id>` | Custom configuration workflow ID                                                                                            |

When `--deploy-id dd-my-app` is used with `--cluster`, the engine creates:

- Config directory: `./engine-private/conf/dd-my-app/`
- CI workflow: `.github/workflows/engine-my-app.ci.yml`
- CD workflow: `.github/workflows/engine-my-app.cd.yml`
- Appends `dd-my-app` to `./engine-private/deploy/dd.routes`

When `--build-repos` is used, the engine creates three repositories:

- `engine-my-app` (public deployment repo)
- `engine-my-app-private` (private configuration repo)
- `engine-my-app-cron-backups` (cron backup repo)

---

## App environment

**Command:** `node bin app <action> [--env <env>] [--args <key=value-list>]`

The `app` domain owns a deployment's runtime environment. It carries the same seven actions and
the same five flags as `secret` and `host`; the deployment id is resolved from the repository
context, so only the environment selector is normally passed.

```bash
node bin app load --env development
node bin app load --env production
node bin app load --env development --args deploy-id=dd-core
node bin app load --env development --args deploy-id=dd-core,sub-conf=nexodev-dev-api
node bin app status
node bin app clean
```

| Flag                    | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| `--env <env>`           | `production`, `development` or `test`. Defaults to `production`                  |
| `--args deploy-id=<id>` | Overrides the deployment id resolved from the repository context                 |
| `--args sub-conf=<name>`| Selects `.env.<env>.<name>` when that file exists                                |

Inside a container, `app load` additionally applies the deploy's `.env.<env>.oci` overlay on top of
the resolved file — see [OCI runtime overlay](#oci-runtime-overlay).

`app load` reads `./engine-private/conf/dd-<conf-id>/` and materializes the working tree:

- `.env.production`, `.env.development`, `.env.test` → project root
- `.env` → project root (from the selected environment's file)
- `package.json` → updated with the deploy's start script
- the in-process `Config.default` the runtime reads

It deliberately does not write the host configuration store — that store is host-scoped and holds
the node's own configuration, which `node bin host load` owns.

`app clean` removes the root `.env` files it materialized.

---

## Development Server

**Command:** `npm run dev [deploy-id] [sub-conf]`

Starts the server in development mode with hot-reload via nodemon.

```bash
npm run dev dd-core
npm run dev dd-core nexodev
npm run dev dd-core healthcare
npm run dev dd-core bymyelectrics
npm run dev dd-core vitaintegral
```

| Argument    | Description                                                               |
| ----------- | ------------------------------------------------------------------------- |
| `deploy-id` | The deployment ID (format: `dd-<conf-id>`)                                |
| `sub-conf`  | Optional: Sub-configuration to filter server hosts for faster development |

The `sub-conf` argument filters the server to only build and run hosts defined in the corresponding `conf.server.dev.<sub-conf>.json` file. Without it, all hosts in `conf.server.json` are built.

### Sub-Configuration Files

Dev sub-configurations are stored at `./engine-private/conf/dd-<conf-id>/conf.server.dev.<sub-conf>.json` and contain a subset of hosts from the full `conf.server.json`. For example:

- `conf.server.json` — full config (all hosts: dogmadual.com, nexodev.org, healthcare.nexodev.org, ...)
- `conf.server.dev.nexodev.json` — only `www.nexodev.org`
- `conf.server.dev.healthcare.json` — only `healthcare.nexodev.org`

To create a new sub-configuration:

```bash
node bin new --sub-conf server <sub-conf-name>
```

This creates a copy of `conf.server.json` as `conf.server.dev.<sub-conf-name>.json` that can be trimmed to the desired hosts.

A sub-conf named on the command line is carried as an argument all the way into the build — `node bin client <deploy-id> <sub-conf>` passes it to every `readConfJson()` the build performs — and is honored whatever the ambient environment is. Naming it is a request, not a hint.

Where no sub-conf is named, `getConfFilePath()` falls back to the `DEPLOY_SUB_CONF` environment variable that `loadConf()` exports, so downstream consumers (server runtimes, API servers) inherit the same filtered configuration. That inherited form stays development-only: a production deploy that merely carries `DEPLOY_SUB_CONF` keeps reading `conf.server.json`.

### Additional Development Scripts

The following npm scripts provide alternative development modes:

```bash
# Run development server inside a container (no hot-reload)
npm run dev:container

# Run production server inside a container
npm run prod:container

# Run development proxy server
npm run dev:proxy
```

| Script           | Description                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `dev:container`  | Starts the server in development mode without nodemon (`NODE_ENV=development node src/server`)  |
| `prod:container` | Starts the server in production mode inside a container (`NODE_ENV=production node src/server`) |
| `dev:proxy`      | Starts an Express proxy server for development (`NODE_ENV=development node src/proxy proxy`)    |

For split local development, `npm run dev:api` and `npm run dev:client` start the API and client as
separate processes.

---

## Cluster Build

**Command:** `node bin run cluster-build [path] [options]`

Full cluster build: clean → template-deploy → env clean → update default configs for all deployments in `dd.routes`.

```bash
node bin run cluster-build
node bin run cluster-build cmt
node bin run cluster-build --node-name worker-01
```

- `path=cmt` commits changes to engine and engine-private repositories.
- `--node-name <name>` targets a specific node.

---

## Template Deploy

**Command:** `node bin run template-deploy [path] [options]`

Pushes `engine-private` and `engine` repositories with CI commit tags for PWA microservices template deployment. The optional `path` argument uses the `engine-<conf-id>` repo name pattern prefixed with `sync-`.

```bash
node bin run template-deploy
node bin run template-deploy --dev
node bin run template-deploy --force
node bin run template-deploy sync-engine-core --dev
node bin run template-deploy sync-engine-cyberia --dev
```

When a `sync-engine-<conf-id>` path is provided, the commit tag becomes `ci package-pwa-microservices-template-sync-engine-<conf-id>`, targeting a specific deployment sync in the CI pipeline.

| Option    | Description      |
| --------- | ---------------- |
| `--dev`   | Development mode |
| `--force` | Force push       |

---

## Node Source Pull

**Command:** `node bin run pull [source-repo]`

Brings a node's engine checkout and its private configuration to the tip of their repositories, at `/home/dd/engine` and `/home/dd/engine/engine-private`. This is the first step every deploy script runs, through `prepare_host` in `deploy/lib/host.sh`.

```bash
node bin run pull
node bin run pull underpostnet/engine-lampp
node bin run pull underpostnet/engine-test-lampp
```

Only the source repository is named. The private configuration repository is derived from the conf id the two share, so the pair can never drift apart:

| `source-repo`                    | Engine checkout                  | Private configuration            |
| -------------------------------- | -------------------------------- | -------------------------------- |
| *(omitted)*                      | `<owner>/engine`                 | `<owner>/engine-private`         |
| `underpostnet/engine-lampp`      | `underpostnet/engine-lampp`      | `underpostnet/engine-lampp-private` |
| `underpostnet/engine-test-lampp` | `underpostnet/engine-test-lampp` | `underpostnet/engine-lampp-private` |

The owner is taken from the reference, which may be an `owner/repo` slug or a full clone URL.

Both checkouts are **replaced**, not merged — the same `underpost cmt --switch-repo` route the fleet sync takes, so a node reached by `run pull` and a node reached by `underpost edge --sync` land on the same commit by the same operation. A node that moved onto a test source repo comes back without being reprovisioned, and one that drifted onto commits of its own is brought back rather than refused by a fast-forward pull.

| Option                     | Description                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `--repo-engine-private <repo>` | Private configuration repository to check out, as `owner/repo` or a clone URL. Overrides the derivation above. |

`--repo-engine-private` is for a conf repository the pairing cannot name — one whose name does not follow `engine-<conf-id>-private`, or one that lives under a different owner:

```bash
node bin run pull underpostnet/engine-test-lampp --repo-engine-private underpostnet/engine-core-private
```

`underpost edge --sync` takes the same two flags, `--repo-engine` and `--repo-engine-private`, and resolves the pair identically.

### Selecting the source in a deploy script

`deploy/lib/host.sh` exposes `ENGINE_SRC_REPO` and `ENGINE_SRC_PRIVATE_REPO` for this. Set them before calling `prepare_host`, or pass them as its second and third arguments:

```bash
ENGINE_SRC_REPO=underpostnet/engine-test-lampp
ENGINE_SRC_PRIVATE_REPO=underpostnet/engine-core-private
prepare_host "$ENGINE_ROOT"

# or, per call
prepare_host "$ENGINE_ROOT" underpostnet/engine-test-lampp underpostnet/engine-core-private
```

Both are resolved in one order, most specific first:

1. the environment, as above — a deploy script naming the source it prepares for;
2. the node's own host configuration store, which is where `underpost wireguard --sync` records the pair it moved the node onto;
3. nothing — `run pull` derives the pair itself, which is the monorepo when no account names another.

Step 2 is what keeps a switch from being undone: a node synced onto a product source prepares itself from that source on its next `prepare_host`, instead of being pulled back to a repository named in a script. `host.sh` names no repository of its own for that reason. The store is read directly rather than through `underpost host get`, because this is the file that resolves the manifest making that CLI runnable.

Both keys are listed in `.env.example`.

---

## SSH Deploy

**Command:** `node bin run ssh-deploy <path> [options]`

Deploys via SSH using commit tags pushed to the engine repository. The `path` argument uses the `engine-<conf-id>` repo name pattern. The commit tag format is `cd ssh-<path>`.

```bash
node bin run ssh-deploy engine-core
node bin run ssh-deploy engine-cyberia
node bin run ssh-deploy sync-engine-core --dev
node bin run ssh-deploy sync-engine-cyberia --force
```

| Option    | Description      |
| --------- | ---------------- |
| `--dev`   | Development mode |
| `--force` | Force push       |

---

## Cluster

**Command:** `node bin run cluster [options]`

Complete cluster initialization: reset → setup → pull images → deploy databases → deploy cache → ingress → certs → services. The runner uses `kubeadm` by default or `k3s` when `--k3s` is specified.

```bash
node bin run cluster
node bin run cluster --deploy-id dd-core,dd-cyberia
node bin run cluster --runtime-image lampp --deploy-id dd-core,dd-cyberia,dd-lampp
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server --dev
node bin run cluster --dev
node bin run cluster --k3s
```

**Inputs are flags:** `--runtime-image` defaults to `express` (valid values: `express`, `lampp`), `--deploy-id` takes a comma-separated list of `dd-<conf-id>` ids or the `dd` meta id and defaults to the `dd.routes` contents. When the runtime image is `lampp`, a MariaDB statefulset is additionally deployed alongside MongoDB. `--instance-id` names custom instances to deploy — see [Custom instances](#custom-instances).

| Option                  | Description                                                                    |
| ----------------------- | ------------------------------------------------------------------------------ |
| `--dev`                 | Development environment (self-signed TLS + `/etc/hosts` mapping)               |
| `--namespace <name>`    | Kubernetes namespace (default: `default`)                                      |
| `--kubeadm`             | Kubeadm cluster (default)                                                      |
| `--k3s`                 | K3s cluster                                                                    |
| `--gateway-class <n>`   | GatewayClass to provision (default: `eg`)                                      |
| `--disable-gateway-api` | Fall back to the Contour HTTPProxy stack (Gateway API + HTTP/3 is the default) |
| `--disable-http3`       | Omit the QUIC/HTTP3 listener config and the `Alt-Svc` header                   |

On RHEL and Rocky Linux, host configuration keeps SELinux in Enforcing mode. Kubeadm enables containerd SELinux labeling, while K3s installs its policy package and starts with `--selinux`. Because the kubeadm control-plane static pods and tigera-operator are unprivileged (`container_t`), `/etc/kubernetes`, `/var/lib/etcd`, and `/var/lib/calico` get a persistent `container_file_t` mapping before `kubeadm init`; without it the API server, scheduler, controller-manager, and etcd crash-loop on AVC denials reading `pki/sa.key` and the component kubeconfigs, and the Calico rollout stalls on `/var/lib/calico/mtu`. K3s relabels its own trees (`/var/lib/rancher`, `/etc/rancher`, `/var/lib/kubelet`, `/var/lib/cni`) after the installer drops the `k3s-selinux` policy module, and both confined runtimes share the hostPath PV roots (`/data`, `/opt/local-path-provisioner`) with `container_file_t` so unprivileged pods can use their volumes. Kind needs none of this: Docker runs without `--selinux-enabled`, so its node containers are never confined. A node found with SELinux Disabled (some LXD guest images ship that way) has an unlabeled filesystem, so `/.autorelabel` is scheduled instead of flipping it straight to Enforcing — the switch completes on the next boot. Diagnose deployment denials with:

```bash
sudo scripts/audit-selinux.sh --since boot
sudo ausearch -m AVC,USER_AVC,SELINUX_ERR -ts recent -i
```

### What `--dev` sets up on its own

The dev cluster is a single command — there are no extra flags to remember, because everything the browser needs is derived from `conf.server.json` and applied by the runner itself:

```bash
node bin run cluster --deploy-id dd-cyberia --dev
```

- **Gateway API + Envoy Gateway** is the default routing stack. `--disable-gateway-api` is the only way back to Contour.
- **HTTP/3 (QUIC) is on by default**, alongside HTTP/2 and HTTP/1.1. Each route advertises it with `Alt-Svc: h3=":443"`, and one `ClientTrafficPolicy` targets every hostname-scoped HTTPS listener in the merged data plane. QUIC has no cleartext transport, so this only exists where TLS does.
- **TLS is self-signed and locally trusted.** Every host in the deploy's `conf.server.json` gets a certificate from `scripts/ssl.sh` (mkcert, which installs its root CA into the system and NSS trust stores) and a `kubernetes.io/tls` secret named after the host.
- **`/etc/hosts` is mapped** for those same hosts in a single rewrite, so `https://www.cyberiaonline.com` resolves to the local data plane. In development Envoy binds 80/443 on the host network, so no port-forward is involved.
- **The gateway static tier is seeded** with each deploy's status pages and intercepted contexts before the routes are applied. See [Gateway infrastructure service](#gateway-infrastructure-service).

The runner now has an explicit no-backend checkpoint before any application Deployment YAML is applied:

1. Wait for the shared `underpost-gateway` Deployment.
2. Build SSR documents on the host, place every configured PWA context and instance status page, and fail if any declared asset is missing.
3. Install and validate the Nginx host blocks, then apply parent and selected-instance Gateway/HTTPRoute objects with application Services deliberately absent.
4. Run `gateway-status`, then request every configured fallback over HTTPS. The response must keep a 502/503/504 status and its body hash must match the configured maintenance/custom-status document.
5. Only after that checkpoint passes, apply workload manifests with `--disable-update-proxy`; instance pods still wait for the parent gRPC workload to become Ready.

The runner calls `run gateway-status` again at the end, so the workflow verifies both the deliberate fallback state and the completed runtime state.

### Gateway infrastructure service

`underpost-gateway` is the cluster's single edge utility layer, installed with the Gateway API control plane and shared by every deploy. One Nginx deployment owns:

- status pages (40x) and maintenance pages (50x)
- intercepted static contexts (`/offline`, `/maintenance`)
- shared edge resources and future edge-only contexts
- reverse proxying the workloads whose errors it intercepts

There is never one Nginx per application. Application runtimes — `engine-cyberia`, `cyberia-server`, `cyberia-client` — stay completely agnostic: they return a standard status code or become unreachable, and nothing about status page delivery lives in them.

Documents live in a hostPath volume under:

```
<root>/<host>/<sub-path>/status-pages/<status>/index.html
<root>/<host>/<sub-path>/<context>/index.html
<root>/conf.d/<host>.conf                            generated server blocks
```

`<sub-path>` is the proxy sub-path with `/` written as `root`, so `www.cyberiaonline.com` + `/` + 404 becomes `www.cyberiaonline.com/root/status-pages/404/index.html`.

**Why Nginx is in the request path.** Envoy cannot re-dispatch a request to another cluster once the upstream has answered, and its only body-substitution mechanisms inline a body capped at 4096 bytes. Nginx `proxy_intercept_errors` satisfies all three constraints at once: the client's URI is unchanged, the upstream's status code is preserved, and the document is read from disk so its size is unbounded. Each deploy contributes its own `conf.d/<host>.conf` — the workload is shared, so one deploy must never rewrite another's routing — and the block is validated with `nginx -t` in the pod before a reload, which is skipped outright if it does not parse.

Upstreams are dialled through a variable so a redeployed Service is re-resolved; that needs a `resolver`, whose address is read from the live `kube-dns` Service because nginx cannot resolve the name of its own resolver.

Documents are placed twice per deploy:

| When                                                          | Source                              | Why                                                                                  |
| ------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| After the host client build, before any workload YAML is used | checkout `public/` + instance repos | Makes every declared route testable during the intentional no-backend checkpoint     |
| After the deployment is Ready                                 | the running workload                | Several clients are built from private sources cloned into the container at start-up |

The first pass is mandatory: any configured document missing from both its expected source and the static tree aborts cluster startup before routes or workloads advance. Instance `customStatusPages[].hostPath` resolves against that instance project's checkout (`./cyberia-server/public/404/index.html`), one document per variant.

A host whose document is in none of them falls through to the shared default page, which answers **404** and is sent `Cache-Control: no-store` — so a fallback is never stored by the PWA service worker and never outlives the moment the real document lands.

> The manifests reach `kubectl` through a **quoted** heredoc. Every value is already substituted before the string is built, so anything the shell would expand there is content — and `nginx.conf` is nothing but content the shell recognises. An unquoted delimiter turns `try_files $uri $uri/index.html` into `try_files /index.html`, which matches nothing, and every host's status page is answered by the shared default.

### Routing stack defaults

The Gateway API stack with QUIC/HTTP3 is the default for **every** runner that touches routing — `run cluster`, `run sync`, `run instance`, `run instance-promote`, `run promote`, `run stop` and `run get-traffic` — in both `development` and `production`. Each resolves it from one place, so no runner can act on a different stack than the one that deployed the routes. `--disable-gateway-api` is forwarded to spawned commands alongside the other gateway flags, so a legacy Contour workflow stays on HTTPProxy end to end instead of reverting to the default in a child process:

| Flags                                 | Stack                       | HTTP/3 |
| ------------------------------------- | --------------------------- | ------ |
| _(none)_                              | Gateway API + HTTPRoute     | on     |
| `--gateway-api`                       | Gateway API + HTTPRoute     | on     |
| `--disable-http3`                     | Gateway API + HTTPRoute     | off    |
| `--disable-gateway-api`               | Contour HTTPProxy           | n/a    |
| `--gateway-api --disable-gateway-api` | Gateway API (explicit wins) | on     |

QUIC only exists where TLS does, so `--dev` without `--self-signed` yields an HTTP-only listener and no HTTP/3.

**Traffic colour detection.** `getCurrentTraffic` reads the blue/green colour from whichever object carries it: the `HTTPRoute` backendRef, the `HTTPProxy` service, or — for a host whose errors the gateway intercepts — the `conf.d/<host>.conf` server block, because that host's route points at `underpost-gateway-service` and holds no colour of its own. All three are read on every call, so a blue/green promotion behaves identically in either stack and whether or not the host is intercepted. When the selected kind names no colour, the other kind is probed before concluding there is none — which kind describes a host is a property of the cluster, not of the flags used to ask.

### Running both stacks at once

Installing one stack no longer breaks the other. `--contour` on a cluster that already runs Envoy Gateway, and `--gateway-api` on a cluster that already runs Contour, both converge on the same layout — **order does not matter**:

```
                 :80 / :443 / :443-udp  (host network)
                              │
                     underpost-ingress  (nginx)
                     │                      │
       Host header ──┤ :80  L7              │ :443  L4, SNI
                     │                      │
          ┌──────────┴────────┐   ┌─────────┴─────────┐
          │ envoy             │   │ envoy-eg-<hash>   │
          │ projectcontour    │   │ envoy-gateway-sys │
          │ HTTPProxy hosts   │   │ HTTPRoute hosts   │
          └───────────────────┘   └───────────────────┘
```

`underpost-ingress` owns the node's ports and hands each connection to the data plane that has a route object for that hostname. Both data planes are moved off the host: Contour's `hostPort` claim is released (the DaemonSet is patched, not deleted, so it keeps serving through its ClusterIP), and the Envoy Gateway `EnvoyProxy` is re-applied without `hostNetwork`. Neither is uninstalled, and neither has to be.

Application placement and edge placement are independent. `run instance --node-name worker-01` and `deploy --node worker-01` move only that application; route publication preserves the node already running `underpost-ingress`. To explicitly recover or relocate the public listener, use `node bin run ingress-refresh <public-node> --kubeadm` (or `--ingress-node <public-node>`). The command waits for the replacement ingress to become Ready before migration may delete the old route kind. Its Nginx image uses `IfNotPresent`, so restarting on an edge node with the image cached does not require Docker Hub access.

It is a distinct workload from `underpost-gateway`, and the two sit on opposite sides of the data plane: `underpost-ingress` is in front of Contour and Envoy Gateway, while `underpost-gateway` is a backend they route to for status pages and intercepted contexts.

Why the split by port:

- **`:80` is proxied at L7.** A plaintext request carries a readable `Host`, and the backends answer it with their own redirect or content.
- **`:443` is forwarded at L4 by SNI** (`ssl_preread`). Terminating TLS at `underpost-ingress` would mean holding every host's certificate and re-negotiating ALPN; passing the bytes through keeps certificates, HTTP/2 and mTLS exactly where they already work.
- **`:443/udp` goes entirely to the Gateway API data plane.** QUIC cannot be routed by hostname — `ssl_preread` is TCP-only and a QUIC Initial carries its SNI inside an encrypted frame. Only Envoy Gateway serves HTTP/3 here and only it advertises `Alt-Svc`, so this is not a restriction in practice: a client that tries QUIC against a Contour host gets no answer and falls back to TCP.

A hostname that has **both** an `HTTPProxy` and an `HTTPRoute` is a leftover from switching stacks, not a valid state. The Gateway API route wins and the duplicate is logged so it can be removed — nothing deletes the other kind's objects automatically.

Single-stack installs are unchanged: with only one data plane present the old behaviour applies, and Contour keeps its `hostPort` claim.

### Custom instances

`--instance-id` names instances from `engine-private/conf/<deploy-id>/conf.instances.json`:

```bash
# One instance of one deploy
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server --dev

# Several, across several deploys
node bin run cluster --deploy-id dd-cyberia,dd-core --instance-id mmo-server,mmo-client,worker --dev

# A single variant rather than the whole family
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server-forest --dev
```

An instance belongs to a deploy through that deploy's own `conf.instances.json` — nothing else relates the two. Each requested id is resolved against every deploy in the list, and only runs where it is declared; an id no deploy declares is reported as a warning rather than silently skipped. Naming a template id (`mmo-server`) selects its whole variant family, exactly as `run instance` resolves it.

**Ordering.** Instance static documents, Nginx host blocks and HTTPRoutes are bootstrapped before any application pod, so the instance hostname already returns its configured document while its Service does not exist. The instance pod itself is still deployed _after_ its parent workload is Ready: it reads world configuration over the parent's gRPC ClusterIP at boot. Each id is then handed to [`run instance`](#cluster) whole, which owns variant expansion, the new blue/green colour, the readiness gate and the final atomic promotion; the pre-existing route keeps serving fallback until that promotion.

**Environment.** Instance hosts share the deploy's environment rather than getting a parallel one:

| Environment | TLS                                                          | Hosts                                     |
| ----------- | ------------------------------------------------------------ | ----------------------------------------- |
| `--dev`     | self-signed secret per instance host (same `scripts/ssl.sh`) | written into the single `/etc/hosts` pass |
| production  | cert-manager `Certificate` per instance host                 | resolved by real DNS                      |

`/etc/hosts` is rewritten wholesale, so instance hosts are resolved _before_ any deploy runs and written together with the deploy hosts in one pass — the runner never passes `--etc-hosts` down to `run instance`, which would rewrite the file with only its own hosts.

Instance status pages declared under `customStatusPages` are placed by the cluster's first static sync, resolved relative to the instance project directory. An instance without a separate PWA `maintenanceDefault` view reuses its first declared custom status document for unavailable-upstream responses: Nginx substitutes that body while preserving the original 502/503/504 code.

---

## DD Container

**Command:** `node bin run dd-container [path] [options]`

Creates a development container in the cluster for testing.

```bash
node bin run dd-container
node bin run dd-container "npm test"
node bin run dd-container --pod-name my-dev-pod
node bin run dd-container --image-name custom-image:latest --dev
node bin run dd-container --host-network
```

| Option                       | Description                                   |
| ---------------------------- | --------------------------------------------- |
| `--pod-name <name>`          | Pod name (default: `underpost-dev-container`) |
| `--image-name <name>`        | Docker image                                  |
| `--node-name <name>`         | Target node                                   |
| `--claim-name <name>`        | PVC name (default: `pvc-dd`)                  |
| `--volume-host-path <path>`  | Host path (default: `/home/dd`)               |
| `--volume-mount-path <path>` | Container mount path                          |
| `--host-network`             | Use host networking                           |
| `--dev`                      | Development mode (Kind cluster)               |

---

## Image

**Command:** `node bin image [options]`

Manages Docker images: pull base images, build custom images, save/load into clusters, list, and remove.

```bash
node bin image --pull-base
node bin image --pull-base --path /home/dd/engine/src/runtime/lampp
node bin image --pull-base --kind --dev
node bin image --pull-base --kubeadm
node bin image --build --path ./src/runtime/express --image-name my-app:latest --podman-save --kubeadm
node bin image --ls
node bin image --rm my-image-id
node bin image --spec --namespace default
node bin image --pull-dockerhub underpost --kind
```

| Option                           | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| `--pull-base`                    | Pull base images and build `rockylinux9-underpost` image       |
| `--build`                        | Build a Docker image using Podman                              |
| `--ls`                           | List all available Underpost Dockerfile images                 |
| `--rm <image-id>`                | Remove specified image                                         |
| `--spec`                         | Get cached list of container images used by all pods           |
| `--path <path>`                  | Dockerfile directory                                           |
| `--image-name <name>`            | Custom image name                                              |
| `--image-out-path <path>`        | Output path for tar image archive                              |
| `--dockerfile-name <name>`       | Custom Dockerfile name                                         |
| `--podman-save`                  | Export built image as tar file using Podman                    |
| `--pull-dockerhub <image>`       | Pull a Docker Hub image (use `underpost` for the engine image) |
| `--kind` / `--kubeadm` / `--k3s` | Load image into cluster                                        |
| `--node-name <name>`             | Target node for kubeadm/k3s                                    |
| `--namespace <name>`             | Kubernetes namespace (default: `default`)                      |
| `--reset`                        | Build without cache                                            |
| `--dev`                          | Development mode                                               |

---

## Default Configuration

**Command:** `node bin new --default-conf --deploy-id <deploy-id>`

Creates or updates default configuration files for a deployment. Reads from `./engine-private/conf/dd-<conf-id>/` (including `conf.server.json`, `conf.client.json`, `conf.ssr.json`) and writes the resolved config to `conf.dd-<conf-id>.js`.

During generation, `env:` references from `conf.server.json` are preserved as plain `'env:KEY'` strings in the generated `conf.dd-*.js` file. At runtime, `resolveConfSecrets()` in `conf.js` resolves these strings to `process.env.KEY` values when configurations are loaded via `loadConf()` or `loadConfServerJson()`. Private deployment-only fields (`git`, `directory`) are stripped from the public manifest.

```bash
node bin new --default-conf --deploy-id dd-core
node bin new --default-conf --deploy-id dd-cyberia
node bin new --default-conf --deploy-id dd-my-app
```

Special workflow IDs (via `--conf-workflow-id`) bypass the `dd-<conf-id>` convention:

```bash
node bin new --default-conf --conf-workflow-id dd-github-pages
node bin new --default-conf --conf-workflow-id template
```

- `dd-github-pages` — GitHub Pages configuration (sets host to `<username>.github.io`)
- `template` — cluster template with Valkey/MongoDB defaults

---

## Promote

**Command:** `node bin run promote <deploy-config> [options]`

Blue-green deployment promotion — switches traffic between blue and green environments.

```bash
node bin run promote dd-core,production,2
node bin run promote dd,production,1
node bin run promote dd-cyberia
node bin run promote dd-my-app,development
```

**Config format:** `<deploy-id>,<environment>,<replicas>` — environment defaults to `production`, replicas to `1`. Deploy IDs use the `dd-<conf-id>` format. Use `dd` as deploy-id to promote all deployments listed in `dd.routes`.

---

## Cron

**Command:** `underpost cron [deploy-list] [job-list] [options]` / `node bin cron [deploy-list] [job-list] [options]`

Manages cron jobs: execute directly, generate K8s CronJob manifests, or setup a deploy-id's start script.

### DD Cron File

The file `./engine-private/deploy/dd.cron` stores the default cron deploy-id (e.g. `dd-cron`). This deploy-id maps to a configuration directory at `./engine-private/conf/dd-<conf-id>/` containing a `conf.cron.json` file that defines scheduled jobs.

### Cron Command Cycle

1. **Resolve deploy-id** — first entry of the `deploy-list` argument if provided, otherwise reads `./engine-private/deploy/dd.cron`
2. **Read conf.cron.json** — loads job definitions from `./engine-private/conf/dd-<conf-id>/conf.cron.json`, narrowed to the `job-list` argument when one is given
3. **Setup deploy start** — updates `package.json` start script and generates K8s CronJob YAML manifests into `./manifests/cronjobs/dd-<conf-id>/`
4. **Apply to cluster** — deletes the targeted CronJobs, ensures the container image is loaded on the cluster, syncs engine to kind-worker if using `--kind`, then runs `kubectl apply -f` on each generated manifest
5. **Create immediate jobs** — when `--create-job-now` is set, creates a one-off Job from each targeted CronJob via `kubectl create job <name>-now --from=cronjob/<name>`, always after the apply step. A CronJob missing from the cluster is warned and skipped

### Usage

```bash
# Direct execution — run jobs immediately
underpost cron dd-cron dns
underpost cron dd-cron backup --git
underpost cron dd-cron dns,backup
node bin cron dd-cron dns --dev

# Generate K8s CronJob manifests
node bin cron --generate-k8s-cronjobs --dev
node bin cron --generate-k8s-cronjobs --namespace production --dev

# Generate + apply to cluster (--apply alone implies manifest mode; it never runs a job)
node bin cron --generate-k8s-cronjobs --apply --kind --dev
node bin cron --apply --kubeadm
node bin cron --generate-k8s-cronjobs --apply --k3s --image custom:latest

# Apply one job of one deploy-id, leaving the other CronJobs untouched
node bin cron dd-cron vultr --apply --kubeadm

# Apply + create immediate jobs — the work runs in a cluster pod, not in this shell
node bin cron --generate-k8s-cronjobs --apply --create-job-now --kind --dev

# Run an already-published CronJob now, without republishing it
node bin cron dd-cron vultr --create-job-now --kubeadm

# Pin the CronJob pods to the node that carries the /home/dd/engine hostPath
node bin cron dd-cron --setup-start --apply --kubeadm --node-name localhost.localdomain

# Setup deploy start (update package.json + generate manifests)
# --setup-start is a flag; the deploy-id is the deploy-list argument
node bin cron --setup-start
node bin cron dd-cron --setup-start --git --apply
node bin cron dd-my-app --setup-start --namespace staging

# Dry run
node bin cron dd-cron dns --dry-run
underpost cron dd-cron backup --git

# Pre-script commands
node bin cron --generate-k8s-cronjobs --apply --cmd "cd /home/dd/engine && node bin app load --env production --args deploy-id=dd-core" --kind --dev
```

### Options

| Option               | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `--dev`              | Development mode (`node bin` instead of `underpost`)    |
| `--kind`             | Kind cluster context                                    |
| `--k3s`              | K3s cluster context                                     |
| `--kubeadm`          | Kubeadm cluster context                                 |
| `--git`              | Pass `--git` flag to job execution                      |
| `--namespace <name>` | Kubernetes namespace (default: `default`)               |
| `--image <name>`     | Custom container image                                  |
| `--node-name <node>` | Pin CronJob pods to one node (`kubernetes.io/hostname`) |
| `--cmd <command>`    | Pre-script commands before cron execution               |
| `--create-job-now`   | Run each CronJob now as a cluster Job (after `--apply`) |
| `--dry-run`          | Preview jobs without executing                          |
| `--apply`            | Generate and apply manifests via `kubectl`              |
| `--setup-start`      | Update `package.json` start script, then generate+apply |

### Available Job Types

| Job ID   | Description        | Deploy ID Source             |
| -------- | ------------------ | ---------------------------- |
| `dns`    | DNS record updates | `dd.cron`                    |
| `backup` | Database backups   | `dd.routes` (all deploy-ids) |

### Conf Cron JSON Format

Located at `./engine-private/conf/dd-<conf-id>/conf.cron.json`:

```json
{
  "jobs": {
    "dns": {
      "enabled": true,
      "expression": "*/5 * * * *"
    },
    "backup": {
      "enabled": true,
      "expression": "0 0 * * *"
    }
  }
}
```

Each enabled job generates a Kubernetes CronJob YAML manifest at `./manifests/cronjobs/dd-<conf-id>/dd-<conf-id>-<job>.yaml`.

### Cron Integration With Sync

The `sync` command automatically triggers cron setup when `--deploy-id-cron-jobs` is not set to `none`:

```bash
node bin run sync --deploy-id dd-my-app --dev --kind --create-job-now
```

This runs `node bin cron <cron-deploy-id> --setup-start --git --apply` with the resolved cluster flags, applying cron manifests as part of the full deployment sync cycle.

The cron deploy-id is independent of the deploy-id being synced: `--deploy-id-cron-jobs <id>` when given, otherwise `cronDeployIdResolve()` (`engine-private/deploy/dd.cron`) — the same helper `cron --setup-start` falls back to on its own, so both paths resolve identically.

---

## Sync

**Command:** `node bin run sync --deploy-id <deploy-id> [options]`

Synchronizes deployment replicas, configurations, and traffic across the cluster. Reads deployment IDs from `./engine-private/deploy/dd.routes`, validates version states, updates cron jobs, and handles blue-green traffic switching.

```bash
node bin run sync --deploy-id dd-core --dev --kind
node bin run sync --deploy-id dd-core --kubeadm
node bin run sync --deploy-id dd --dev --kind --create-job-now
node bin run sync --deploy-id dd-my-app --dev --kind --deploy-id-cron-jobs dd-cron
node bin run sync --deploy-id dd-my-app --k3s --namespace production
node bin run sync --deploy-id dd-core --kubeadm --image-pull-policy Always
node bin run sync --deploy-id dd-lampp --replicas 2 --image underpost/wp:v3.3.0 --kubeadm
```

On a **first bring-up**, before `sync` applies the target colour's `deployment.yaml`, it enforces the same no-backend checkpoint as `run cluster`: it builds (or reuses, with `--skip-full-build`) configured SSR assets, syncs them into `underpost-gateway`, applies only the target-colour Gateway/HTTPRoute configuration, and requests every `maintenanceDefault` fallback. Each response must preserve a 502/503/504 status and exactly match the configured document. Only then does sync execute its existing `--disable-update-proxy` workload apply, readiness monitor and final traffic reconciliation.

On a **re-deploy the checkpoint is skipped**, and `sync` logs `Live colour serving; holding traffic until the target colour is Ready`. Publishing a route to a colour that has no workload yet is what proves the fallback, so running it against a host that is already serving would take that host down for the whole image pull and rollout. A colour counts as serving only when it is both routed and still has a ready endpoint — a route naming a colour whose workload is gone is a dead route, not traffic, and the checkpoint still runs. This is the same gate `run instance` uses, from one shared predicate.

The re-deploy ordering is therefore:

1. Manifests and SSR assets are rebuilt; the live colour keeps every request.
2. The target colour's workload is applied with `--disable-update-proxy`, so routes are untouched while it rolls out.
3. Readiness is monitored on the target colour.
4. `switchTraffic` regenerates the routes against the target colour and applies them in place — the single, atomic hand-over.

Passing `dd` as the deploy-id syncs all deployments listed in `./engine-private/deploy/dd.routes`.

| Option                              | Description                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dev`                             | Development mode (uses Kind cluster and `--etc-hosts`)                                                                                                                                                                                                                    |
| `--kind` / `--kubeadm` / `--k3s`    | Cluster type                                                                                                                                                                                                                                                              |
| `--namespace <name>`                | Kubernetes namespace (default: `default`)                                                                                                                                                                                                                                 |
| `--replicas <n>`                    | Number of replicas                                                                                                                                                                                                                                                        |
| `--deploy-id-cron-jobs <deploy-id>` | Cron deploy-id to set up (defaults to `dd.cron`; `none` skips cron setup)                                                                                                                                                                                                 |
| `--cmd-cron-jobs <cmd>`             | Pre-script commands before cron execution (accepted, not yet forwarded)                                                                                                                                                                                                   |
| `--create-job-now`                  | Create immediate Job from each CronJob after applying                                                                                                                                                                                                                     |
| `--timezone <tz>`                   | Set timezone for the deployment                                                                                                                                                                                                                                           |
| `--disable-private-conf-update`     | Prevent private configuration updates during execution                                                                                                                                                                                                                    |
| `--image-pull-policy <policy>`      | Override container `imagePullPolicy` in the generated `deployment.yaml` (`Always`, `IfNotPresent`, `Never`). Defaults to `Never` for `localhost/` images and `IfNotPresent` otherwise. Forwarded to `deploy --build-manifest` and the subsequent `switchTraffic` rebuild. |

---

## Deploy Job

**Command:** `node bin run deploy-job <name> [options]`

Deploys a Kubernetes Job resource with configurable container settings, volumes, and resource limits.

```bash
node bin run deploy-job my-job --image-name my-app:latest --namespace default
node bin run deploy-job my-job --image-name my-app:v1 --tty --stdin --restart-policy Never
node bin run deploy-job my-job --image-name my-app:v1 --requests-memory 256Mi --limits-memory 512Mi
node bin run deploy-job my-job --image-name my-app:v1 --host-aliases "127.0.0.1=foo.local,bar.local;10.1.2.3=baz.remote"
```

| Option                         | Description                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `--image-name <name>`          | Docker image for the Job                                                                                       |
| `--namespace <name>`           | Kubernetes namespace (default: `default`)                                                                      |
| `--node-name <name>`           | Target node                                                                                                    |
| `--tty`                        | Enables TTY for the container                                                                                  |
| `--stdin`                      | Keeps STDIN open                                                                                               |
| `--restart-policy <policy>`    | Job restart policy (e.g., `Never`, `OnFailure`)                                                                |
| `--runtime-class-name <name>`  | Runtime class name                                                                                             |
| `--image-pull-policy <policy>` | Image pull policy (e.g., `Always`, `IfNotPresent`)                                                             |
| `--api-version <version>`      | Kubernetes API version for the manifest                                                                        |
| `--labels <labels>`            | Comma-separated key-value pairs (e.g., `app=my-app,env=prod`)                                                  |
| `--claim-name <name>`          | PVC claim name for volume mounting                                                                             |
| `--volume-host-path <path>`    | Host path for volume                                                                                           |
| `--volume-mount-path <path>`   | Container mount path                                                                                           |
| `--requests-memory <mem>`      | Memory request (e.g., `256Mi`)                                                                                 |
| `--requests-cpu <cpu>`         | CPU request (e.g., `250m`)                                                                                     |
| `--limits-memory <mem>`        | Memory limit (e.g., `512Mi`)                                                                                   |
| `--limits-cpu <cpu>`           | CPU limit (e.g., `500m`)                                                                                       |
| `--resource-template-id <id>`  | Predefined resource template ID                                                                                |
| `--host-aliases <aliases>`     | Pod `/etc/hosts` entries. Format: semicolons separate entries, `=` separates IP from comma-separated hostnames |
| `--cmd <cmd>`                  | Comma-separated list of commands to execute                                                                    |

---

## Node Move

**Command:** `node bin run node-move [resource] [options]`

Abstract, kind-agnostic runner that relocates any schedulable Kubernetes workload onto a target node by patching its pod-template `nodeSelector` and rolling it out. It resolves the resource kind dynamically, so the same command handles `deployment`, `statefulset`, `daemonset`, `replicaset`, `job`, `cronjob`, and `replicationcontroller` without bespoke logic.

```bash
# Move a single deployment to a node (built-in hostname label, no node mutation)
node bin run node-move deployment/dd-cyberia-production-blue --node-name machine-node-hostname

# Move every StatefulSet in a namespace — preview the kubectl commands only
node bin run node-move statefulset --node-name machine-node-hostname --dry-run

# Move all movable workloads (deployment + statefulset + daemonset) in the namespace
node bin run node-move --node-name machine-node-hostname

# Label-pool style: label the target node and select by that label (reusable pools)
node bin run node-move deployment/dd-core-production-blue --node-name machine-node-hostname --labels workload=worker2

# Undo placement — clear the nodeSelector so the scheduler is free again
node bin run node-move deployment/dd-cyberia-production-blue --remove
```

**Resource selector (`path`):**

| Form            | Selects                                                           |
| --------------- | ----------------------------------------------------------------- |
| `<kind>/<name>` | A single resource (e.g. `deployment/dd-core-production-blue`)     |
| `<kind>`        | Every resource of that kind in the namespace (e.g. `statefulset`) |
| _(empty)_       | All movable workloads (deployment + statefulset + daemonset)      |

| Option               | Description                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--node-name <node>` | Target node (required unless `--remove`). Verified to exist before patching.                                                                                  |
| `--namespace <name>` | Namespace to operate in (default: `default`).                                                                                                                 |
| `--labels <k=v,...>` | Label the target node with these pairs and use them as the `nodeSelector` (reusable pool). Default placement is the built-in `kubernetes.io/hostname=<node>`. |
| `--dry-run`          | Print the exact `kubectl patch` command without applying it.                                                                                                  |
| `--remove`           | Clear the `nodeSelector` (unpin placement) instead of moving.                                                                                                 |

**Mechanics:** for templated controllers it applies `kubectl patch <kind> <name> --type=merge -p '{"spec":{"template":{"spec":{"nodeSelector":{…}}}}}'` (CronJobs use `spec.jobTemplate…`). Changing the pod template starts the controller rollout itself; no second `rollout restart` is issued.

> **⚠️ Caveats:**
>
> - **Services, ConfigMaps, and bare Pods are skipped with a warning** — they are not schedulable controllers (a Service has no node placement). Move the owning controller instead.
> - **StatefulSets bound to node-local storage** (e.g. `local-path-provisioner` PVs for `mongodb`, `mariadb`, `valkey`, `ipfs-cluster`) may stay `Pending` after a move because the PV is pinned to the original node's disk — moving the pod does not move the data. Stateless Deployments are the safe ones to relocate.

---

## Observability and Events

**Commands:** `node bin monitor --observability`, `node bin event [event-id] [options]`

One cluster-scoped stack — Prometheus, Alertmanager, the Blackbox Exporter and Grafana — provisioned entirely from configuration that already exists. Scrape targets come from each deploy's `conf.server.json`; probe targets, alert rules and the Alertmanager route come from the event registry in `src/cli/event.js`, which also holds the remediation handler each alert triggers.

Two WireGuard events ship with it: `wireguard-server-down` (one probe per registered hub, each repaired through the hub's external SSH endpoint so the failed tunnel is not in the repair path) and `wireguard-spoke-down` (one probe per peer of this node's hub, each repaired locally or over its own LAN SSH). Both also carry the notification routes declared in `engine-private/deploy/conf.event.json`.

```bash
# Deploy or converge the whole stack (idempotent)
node bin monitor --observability

# Refresh scrape config + alert rules and reload the running components in place
node bin monitor --sync-prom

# Same stack, through the cluster command
node bin cluster --prom
node bin cluster --grafana

# Pin every stack workload to one node, and name the cluster runtime
node bin monitor --observability --node-name kind-worker --kind
node bin monitor --observability --k3s

# Kubernetes metrics-server (kubectl top / HPA); bundled on K3s, so skipped there
node bin monitor --metrics-server

# Cockpit KVM dashboard on this host (port 9090)
node bin monitor --cockpit
node bin monitor --cockpit-stop

# Events
node bin event --list
node bin event wireguard-server-down --deploy   # provision its probes, rule and route
node bin event wireguard-spoke-down --dry-run  # rehearse the repair of every registered spoke
node bin event wireguard-spoke-down --e2e-test # break, detect, repair and verify the notification for real
node bin event wireguard-server-down --e2e-test --nodes vultr
node bin event --serve                      # run the Alertmanager webhook receiver on this node
```

| Piece                  | Where it runs                                                      |
| ---------------------- | ------------------------------------------------------------------ |
| Prometheus 9090        | Cluster — scrapes runtimes, Envoy 19001, probes                    |
| Alertmanager 9093      | Cluster — routes `underpost_event` alerts                          |
| Blackbox Exporter 9115 | Cluster — ICMP / TCP / HTTP probes                                 |
| Grafana 3000           | Cluster — provisioned datasource and dashboards                    |
| Event dispatcher 39099 | Host — remediation needs the engine checkout and the SSH key store |

Only `nodejs` paths are scraped: they are the ones that serve a `prom-client` registry. Which deploys those come from defaults to the cron deploy in `dd.cron` **plus** every deploy in `dd.routes` — the set `loadCronDeployEnv()` loads — so the cron deploy is not the one unmonitored runtime on the cluster. The Envoy data plane is discovered by pod label rather than named, because Envoy Gateway generates its Deployment name per GatewayClass. The webhook always carries a bearer token, minted on first provisioning into the host configuration store and projected into the cluster as the `alertmanager-webhook` Secret.

The stack runs on kubeadm, Kind and K3s. The one runtime-dependent value is the host address Alertmanager delivers to: on kubeadm and K3s the node's `InternalIP` is the machine, while on Kind it is a Docker container, so the bridge gateway is used instead.

Full reference: [Observability and Events](<./Observability and Events.md>).

---

## Baremetal Node Commissioning & Join

**Command:** `node bin baremetal <workflow-id> [options]`

Provisions a physical machine through MAAS commissioning, installs the OS, and dispatches a workflow-configured post-install infra setup. The infra setup type is read from the `infraSetup` attribute in `baremetal/commission-workflows.json` (first supported value: `underpost-kubeadm-contour`, which runs `scripts/kubeadm-node-setup.sh`).

The post-install role is selected with `--worker` (join an existing cluster) or omitted (initialize a control-plane). Two resume flags skip earlier phases so an already-installed node can be (re)driven into the cluster without re-imaging.

```bash
# Full worker flow: OS already deployed → run host prereqs + engine setup + join
node bin baremetal machine-node-hostname --dev --worker \
  --control 192.168.1.85 --deploy-id dd-core --user admin \
  --engine-repo https://github.com/underpostnet/engine.git \
  --engine-private-repo https://github.com/underpostnet/engine-private.git \
  --resume-infra-setup

# Fast re-join only: node already has engine + Node.js + CRI-O + kubelet + kubeadm
node bin baremetal machine-node-hostname --dev --worker \
  --control 192.168.1.85 --deploy-id dd-core --user admin --resume-join
```

| Option                        | Description                                                                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--worker`                    | Post-install role: join the node as a Kubernetes worker (requires `--control <ip>`). Without it the node is set up as a control-plane.                                                                                                                                                   |
| `--control <ip>`              | Control-plane IP the worker joins. The retrieved join command's endpoint host is auto-mapped to this IP on the worker so it never dials `localhost.localdomain`.                                                                                                                         |
| `--deploy-id <id>` / `--user` | `--user` resolves the cluster scoped SSH key for orchestration (`engine-private/deploy/users/<user>/id_rsa`, or `engine-private/deploy/id_rsa` for root) and the login user on an existing control-plane; `--deploy-id` only selects the private engine repo. Mirrors the `ssh` command. |
| `--engine-repo <url>`         | Engine repo cloned + normalized to `/home/dd/engine` on the node (default: `<GITHUB_USERNAME>/engine`).                                                                                                                                                                                  |
| `--engine-private-repo <url>` | Private repo cloned + normalized to `/home/dd/engine/engine-private` on the node (default: `<GITHUB_USERNAME>/engine-<id>-private`).                                                                                                                                                     |
| `--resume-infra-setup`        | Skip commissioning + OS install + bootstrapping; resume only the SSH-based infra setup (kubeadm join/init) on a reachable, already-installed node.                                                                                                                                       |
| `--resume-join`               | Skip everything except the kubeadm join — assumes engine, Node.js, CRI-O, kubelet, and kubeadm are already installed. Retrieves a fresh token and joins directly.                                                                                                                        |

The join command is retrieved live from the control-plane over SSH (`kubeadm token create --print-join-command`) — no manual token paste. A failed `kubeadm join` aborts with a non-zero exit (no false-positive success).

Rocky bare-metal images persist `SELINUX=enforcing`, restore SSH and sudoers contexts in the install root, and request a complete first-boot relabel. The initial boot can take longer and may reboot once before SSH becomes reachable. Custom SSH ports are registered as `ssh_port_t` before `sshd` starts. Node.js is installed system-wide; an NVM binary below `/root` or `/home` is not used by systemd services.

---

## Common Options

| Option                           | Scope     | Description                                         |
| -------------------------------- | --------- | --------------------------------------------------- |
| `--dev`                          | All       | Development mode                                    |
| `--kind` / `--kubeadm` / `--k3s` | Cluster   | Cluster type                                        |
| `--namespace <name>`             | Cluster   | Kubernetes namespace                                |
| `--node-name <name>`             | Cluster   | Target node                                         |
| `--labels <k=v,...>`             | Cluster   | Node/workload labels (node-move, deploy-job)        |
| `--dry-run`                      | Cluster   | Preview commands without applying                   |
| `--remove`                       | Cluster   | Clear/teardown resources or placement               |
| `--worker` / `--control <ip>`    | Baremetal | Post-install role + control-plane IP                |
| `--resume-join`                  | Baremetal | Skip setup; run only kubeadm join                   |
| `--replicas <n>`                 | Deploy    | Replica count                                       |
| `--force`                        | Git       | Force push                                          |
| `--pod-name <name>`              | Container | Pod name                                            |
| `--image-name <name>`            | Container | Docker image                                        |
| `--volume-host-path <path>`      | Container | Host directory                                      |
| `--volume-mount-path <path>`     | Container | Container mount path                                |
| `--claim-name <name>`            | Container | PVC name                                            |
| `--host-network`                 | Container | Use host networking                                 |
| `--tls`                          | Deploy    | Enable TLS                                          |
| `run status [deploy-list]`       | Run       | Inspect production status (`--dev` for development) |
| `run expose <partial-name>`      | Run       | Expose matching Services, falling back to Pods      |
| `--etc-hosts`                    | Deploy    | Modify /etc/hosts for local DNS                     |
| `--build`                        | Build     | Trigger build                                       |
| `--reset`                        | Cluster   | Reset cluster state                                 |

## Prerequisites

- Kubernetes cluster running (Kind/Kubeadm/K3s)
- `kubectl` configured
- Docker available
- `GITHUB_USERNAME` environment variable set
- `./engine-private/deploy/dd.routes` populated with deploy-ids (format: `dd-<conf-id>,dd-<conf-id>,...`)
- `./engine-private/deploy/dd.cron` populated with cron deploy-id (format: `dd-<conf-id>`)
- Per-deploy `.env.*` files in `./engine-private/conf/dd-<conf-id>/` with required secret values (see [Credential Security](#credential-security))

---

## Image build dev/prod variants

When an instance config (`conf.instances.json`) declares `runtime: "<name>"`, `node bin run instance-build-manifest` copies a Dockerfile from `src/runtime/<name>/`:

- **production (default):** uses `src/runtime/<name>/Dockerfile`.
- **`--dev`:** prefers `src/runtime/<name>/Dockerfile.dev`, falls back to `Dockerfile` if the dev variant is absent (with a warning).

`Dockerfile.dev` is a full Dockerfile — not an overlay. Each runtime owns the contract between its dev image and its prod image (debug build flags, extra tooling, default ports, etc.). The Cyberia stack ships two reference variants:

| Runtime          | Dev variant tweaks                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `cyberia-server` | Go build with `-gcflags="all=-N -l"` (debugger-friendly), runtime image keeps `procps-ng`, `strace`, `lsof`, `vim-minimal`      |
| `cyberia-client` | Emscripten WASM build with `BUILD_MODE=DEBUG` (DWARF symbols, asserts), default `CYBERIA_PORT=8082`, `CYBERIA_MODE=development` |

See Deploy custom instance to K8S for the full contract.

---

## Process execution model (`shellExec` / `shellCd`)

The CLI executes shell commands through `src/server/runtime/process.js`. The module ships a backward-compatible, hardened wrapper around `shelljs.exec` plus a process-wide signal-forwarding controller. Code paths that need deterministic CI behavior should opt into the strict modes.

### `shellExec(cmd, options)`

```js
import { shellExec, ShellExecError } from '../server/runtime/process.js';

// 1. Default: FAIL-FAST. A non-zero exit throws ShellExecError carrying
//    cmd, code, stdout, stderr. The uncaught throw propagates to the
//    workflow step, which exits non-zero. This is the right behaviour
//    for the vast majority of call sites — kubectl, git, docker, npm,
//    go, ssh — where a silent failure would corrupt later steps.
shellExec('kubectl apply -f deploy.yaml');

// 2. Hermetic cwd: runs the command in the given directory without
//    mutating the shelljs/global cwd. Snapshot + restore.
shellExec('npm ci', { cwd: '/home/dd/engine' });

// 3. silentOnError: opt-out of the fail-fast default. Use ONLY for
//    existence checks and other places where a non-zero exit is a
//    valid answer (not an error). The returned ShellString has the
//    usual .code/.stdout/.stderr; the caller decides what to do.
const packerCheck = shellExec('packer version', { silentOnError: true });
if (packerCheck.code !== 0) {
  throw new Error('Packer not installed — install it before running this command.');
}
```

| Option              | Type     | Behaviour                                                                                                                                                                               |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `silent`            | boolean  | Suppress child stdout/stderr to the parent terminal.                                                                                                                                    |
| `async`             | boolean  | Run asynchronously. Use with a `callback`.                                                                                                                                              |
| `stdout`            | boolean  | Return the captured stdout string instead of the `ShellString` result object.                                                                                                           |
| `disableLog`        | boolean  | Skip the `[process] cmd …` info log line.                                                                                                                                               |
| `callback`          | function | Async callback `(code, stdout, stderr) => void` when `async: true`. Bypasses fail-fast — the callback owns its own error handling.                                                      |
| **`silentOnError`** | boolean  | Opt OUT of the fail-fast default. Non-zero exit returns the `ShellString` instead of throwing. Use for existence checks (`test`, `which`, `kubectl get` when missing is a valid state). |
| **`cwd`**           | string   | Run the command in this directory. Snapshot + restore — does NOT leak into the process.                                                                                                 |

### `ShellExecError`

Subclass of `Error` with `cmd`, `code`, `stdout`, `stderr` fields. Catch it in CI orchestration paths to map shell failures onto structured workflow output. Re-throw to abort the parent step.

### Signal propagation

`ProcessController.init()` (called from the engine bootstrap) registers handlers for `SIGINT`, `SIGTERM`, `SIGHUP`, and the other signals listed in `ProcessController.SIG`. On a terminating signal it:

1. Forwards `SIGTERM` to every tracked child process (`ProcessController.children`).
2. Waits 5 seconds for clean exit, then escalates to `SIGKILL`.
3. On `SIGINT` (Ctrl+C), the parent itself exits with code 130 after a 200ms grace window — long enough for children to start cleanup, short enough that interactive shells feel responsive.

This is the K8S-friendly model: pods receive `SIGTERM` from kubelet on shutdown and have `terminationGracePeriodSeconds` (default 30s) to exit cleanly. The parent process now propagates that signal to every shellExec'd child so cleanup hooks fire reliably.

### `shellCd`

`shellCd(path)` mutates the shelljs global cwd. Prefer `shellExec(cmd, { cwd })` for one-shot directory-scoped commands; reserve `shellCd` for the outermost driver where the cwd is intentionally persistent across many calls. Two concurrent `shellExec` calls each passing different `cwd` options are safe; two concurrent flows that interleave `shellCd` plus bare `shellExec` will race.

### Usage guidance

- **Default (fail-fast):** just call `shellExec(cmd)` — non-zero exits throw and the failure propagates to the workflow.
- **Existence checks:** add `silentOnError: true` and inspect `result.code`. Examples in the codebase: `Underpost.kubectl.get` (no pods is OK), `getCurrentTraffic` (no HTTPProxy yet is OK), `packer version` (binary missing → throw a friendly error), `test -x …` and `which …` probes.
- **Async path:** `callback: fn` already owns its error handling; the fail-fast throw does not apply when a callback is provided.

---

## Runtime lifecycle ownership (Cyberia)

Runtime processes own their own lifecycle. **No process orchestrated by `underpost` accepts an executable shell command as a runtime argument.**

### Lifecycle event model

| Event                 | Where it happens                                      | What observes it                                                                                        |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **start**             | Container starts                                      | `lifecycle.postStart.exec` (K8S native) — stamps `…-initializing-deployment`                            |
| **runtime ready**     | Listening socket binds inside the runtime process     | `readinessProbe` (TCP socket) in the deployment YAML — K8S marks pod `Ready: True`                      |
| **runtime crash**     | Runtime exits non-zero or panics                      | K8S CrashLoopBackOff. The pod's Ready condition stays `False`; the orchestrator never marks it running. |
| **terminate**         | K8S sends SIGTERM (scale-down, rolling update, evict) | `lifecycle.preStop.exec` (K8S native) — stamps `…-stopping-deployment`                                  |
| **orchestrator gate** | `Underpost.monitor.checkDeploymentReadyStatus`        | Reads `status.conditions[type=Ready].status == "True"` via `kubectl get pod -o json`                    |

The result:

- A crashed runtime exits non-zero → kubelet CrashLoopBackOff → `Ready` stays `False` → orchestrator gate never opens.
- The orchestrator queries kubelet via `kubectl get pod -o json` — the authoritative source of pod readiness.

---

## GitHub Actions failure propagation

CD workflows that run remote shell commands over SSH (`appleboy/ssh-action`) use `script: |` blocks. Every such block now starts with:

```yaml
script: |
  set -e
  set -o pipefail
  …
```

- `set -e` aborts the script on the first non-zero exit.
- `set -o pipefail` makes the exit status of a pipeline the rightmost non-zero command's exit status — without it, `cmd | tee file` always exits 0 even when `cmd` failed.

Wrapping pattern inside these scripts:

```bash
sudo -n -- /bin/bash -lc "node bin run sync --kubeadm --deploy-id dd-cyberia"
```

`bash -lc "cmd"` exits with `cmd`'s exit code; `sudo -n --` preserves that exit; the outer `set -e` aborts the script. Three layers all forwarding the same code. The Node link in the chain is automatic now: `shellExec` is fail-fast by default, so any subprocess non-zero throws `ShellExecError`. Uncaught, that becomes a non-zero `process.exit` — observable by the SSH wrapper, observable by GitHub Actions.

The end-to-end chain:

```
shell command in pod / VM
    ↓ (non-zero exit)
shellExec(cmd)   // fail-fast by default
    ↓ (throws ShellExecError)
node bin run … (uncaught)
    ↓ (process.exit non-zero)
bash -lc "node bin run …"
    ↓ (exits non-zero)
sudo -n -- bash -lc
    ↓ (exits non-zero)
set -e in SSH script
    ↓ (script aborts non-zero)
appleboy/ssh-action
    ↓ (action step fails)
GitHub Actions job
    ↓ (workflow step fails)
```

If any single link drops the exit code, the chain fails silently above it. The hardened `shellExec` closes the bottom link; `set -e` + `set -o pipefail` closes the script link. Audit checklist for new CI flows:

- [ ] Every `script: |` starts with `set -e` and `set -o pipefail`.
- [ ] Every `shellExec` in deploy / CI paths uses the fail-fast default. Reserve `silentOnError: true` for explicit existence checks.
- [ ] Every long-running runtime exits non-zero on startup failure (no silent recoveries).
- [ ] Every K8S deployment has a `readinessProbe` so kubelet observes runtime readiness; never rely on in-container shell hooks for the orchestrator's "running" signal.
