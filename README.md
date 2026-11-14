<p align="center">
  <img src="https://underpost.net/apple-touch-icon-precomposed.png" alt="underpost engine core server"/>
</p>

<div align="center">

<h1>underpost</h1>

</div>

<!-- Tech stack -->
<div align="center">

<a target="_top" href='https://download.rockylinux.org/pub/rocky/9/'><img alt='rockylinux' src='https://img.shields.io/badge/Rocky Linux v9.8-100000?style=flat&logo=rockylinux&logoColor=white&labelColor=10b981&color=727273'/></a> <a target="_top" href='https://www.npmjs.com/package/npm?activeTab=versions'><img alt='npm' src='https://img.shields.io/badge/npm v11.6.2-100000?style=flat&logo=npm&logoColor=white&labelColor=CB3837&color=727273'/></a> <a target="_top" href='https://nodejs.org/download/release'><img alt='nodedotjs' src='https://img.shields.io/badge/node v24.15.0-100000?style=flat&logo=nodedotjs&logoColor=white&labelColor=5FA04E&color=727273'/></a> <a target="_top" href='https://pgp.mongodb.com/'><img alt='mongodb' src='https://img.shields.io/badge/mongodb_server v7.0-100000?style=flat&logo=mongodb&logoColor=white&labelColor=47A248&color=727273'/></a>

</div>

<!-- CI/CD and health -->
<div align="center">

[![Node.js CI](https://img.shields.io/github/actions/workflow/status/underpostnet/engine/docker-image.ci.yml?branch=master&label=Node.js%20CI)](https://github.com/underpostnet/engine/actions/workflows/docker-image.ci.yml) [![Test](https://img.shields.io/github/actions/workflow/status/underpostnet/engine/coverall.ci.yml?branch=master&label=Test)](https://github.com/underpostnet/engine/actions/workflows/coverall.ci.yml) [![Coverage Status](https://coveralls.io/repos/github/underpostnet/engine/badge.svg?branch=master)](https://coveralls.io/github/underpostnet/engine?branch=master) [![Socket Badge](https://badge.socket.dev/npm/package/underpost/v4.5.0)](https://socket.dev/npm/package/underpost/overview/4.5.0)

</div>

<!-- Distribution and package -->
<div align="center">

[![Version](https://img.shields.io/npm/v/underpost.svg)](https://www.npmjs.com/package/underpost) [![Downloads](https://img.shields.io/npm/dm/underpost.svg)](https://www.npmjs.com/package/underpost) [![jsDelivr](https://data.jsdelivr.com/v1/package/npm/underpost/badge)](https://www.jsdelivr.com/package/npm/underpost) [![License](https://img.shields.io/npm/l/underpost.svg)](https://www.npmjs.com/package/underpost)

</div>

<!-- template-title -->

## Underpost Platform

**Underpost** is an platform for application delivery, from infrastructure to runtime. The `underpost` npm package is its CLI toolchain surface.

The project covers:

- **Bare metal provisioning** on Rocky Linux 9.
- **Kubernetes / K3s / kubeadm / LXD** workflows for production, edge, and isolated workloads.
- **GitHub OSS repository flow** — clone, pull, push, commit, release, and CI integrations as first-class CLI subcommands.
- **CI/CD orchestration** — GitHub Actions integrations, container builds, multi-environment deployments.
- **Static build + PWA delivery** — every deploy ships as an installable Progressive Web App with Workbox-based offline support.
- **Cloudinary-backed static asset flow** for image/asset delivery.
- **ERP/CRM-style PWA base applications** as the default workload.
- **Cyberia** — a dedicated MMO extension built on top of the platform, with its own content backend (`engine-cyberia`), authoritative simulation runtime (`cyberia-server`), and presentation runtime (`cyberia-client`).

<a target="_top" href="Https://github.com/underpostnet/engine/blob/master/src/client/public/docs/underpost/overview/index.md">See Detailed platform doc.</a>

### Architectural roles (Cyberia stack)

When the platform is hosting the Cyberia MMO extension, three independent runtime processes participate. Their boundaries are non-overlapping.

| Process                              | Role                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **engine-cyberia** (Node.js)         | Content authority: maps, object layers, atlas/asset metadata, world configuration, persistence, validation, gRPC + REST data services, editor backend, asset distribution. |
| **cyberia-server** (Go)              | Authoritative simulation runtime: tick advancement, AOI replication, input command processing, snapshot generation.                                                        |
| **cyberia-client** (C → WebAssembly) | Presentation runtime: rendering, UI, input capture, prediction, reconciliation, interpolation, client-side presentation defaults.                                          |

The ecosystem is **playable only when all three are running and healthy**. Each service is supervised independently and owns its own monitor/reconnector. If any one is unhealthy, the game enters standby and resumes automatically once all three are healthy again.

<a target="_top" href="https://github.com/underpostnet/engine-cyberia/blob/master/src/client/public/docs/cyberia/explanation/architecture.md">See detailed Cyberia architecture.</a>

## Create a new project

```bash
npm install -g underpost
```

```bash
underpost new app-name
```

After template installation, the server will be running on <a target="_top" href="http://localhost:4001">http://localhost:4001</a>

## Usage

```bash
cd app-name
```

Build client bundle

```bash
npm run build
```

Run dev client server

```bash
npm run dev
```

<a target="_top" href="https://www.nexodev.org/docs?cid=src">See Docs.</a>

<!-- cli-index-start -->
## Underpost CLI

> underpost ci/cd cli v4.5.0

**Usage:** `underpost [options] [command]`

### Global options

| Option | Description |
| --- | --- |
| `-V, --version` | output the version number |
| `--profile <profile>` | Execution profile. One of: LIVE_CLUSTER, HERMETIC_BUILD, OFFLINE_DRY_RUN. LIVE_CLUSTER Full access: cluster and host mutation permitted. HERMETIC_BUILD Build outputs only: no cluster, host or network side effects. OFFLINE_DRY_RUN Nothing executes; every command is reported as intent. |
| `--context <context>` | The kubeconfig context this command and each command it starts reach, instead of environments.<env>.context of conf.cluster.json. No kubeconfig changes. |
| `--current-context` | Reach the current kubeconfig context when conf.cluster.json names no context for the environment. The first change verifies the cluster against environments.<env>.cluster and prints it. |
| `-h, --help` | display help for command |

### Commands

| Command | Description |
| --- | --- |
| [`new`](CLI-HELP.md#underpost-new) | Initializes a new Underpost project, service, or configuration. |
| [`site`](CLI-HELP.md#underpost-site) | Provisions sites in the configuration of a deployment: clients, host/path routes, and the existing APIs and components they use. Each operation prints its change plan and applies it as one change set. |
| [`client`](CLI-HELP.md#underpost-client) | Builds client assets, single replicas, and/or syncs environment ports. |
| [`start`](CLI-HELP.md#underpost-start) | Initiates application servers, build pipelines, or other defined services based on the deployment ID. |
| [`clone`](CLI-HELP.md#underpost-clone) | Clones a repository into a directory that does not exist or is empty. |
| [`fetch`](CLI-HELP.md#underpost-fetch) | Updates the remote-tracking refs of a repository; the working tree and the branches stay. |
| [`pull`](CLI-HELP.md#underpost-pull) | Fast-forwards the current branch to a remote branch. Never merges, rebases or replaces: a diverged history fails and nothing changes. |
| [`push`](CLI-HELP.md#underpost-push) | Publishes HEAD to a branch of a remote and logs the published commit. |
| [`sync`](CLI-HELP.md#underpost-sync) | Replaces a managed checkout with the tip of a repository branch: origin is repointed, local commits of the branch, tracked changes and untracked files are discarded, ignored files stay. For deploy checkouts, never for working repositories. |
| [`discard`](CLI-HELP.md#underpost-discard) | Lists the staged, unstaged and untracked changes under each path, with its repository root, and with --force discards them. |
| [`init`](CLI-HELP.md#underpost-init) | Initializes a repository, or keeps the one there, with the commit identity of GITHUB_USERNAME and GITHUB_EMAIL. |
| [`status`](CLI-HELP.md#underpost-status) | Reads the state of a repository; nothing changes. One query per call; the short status without one. |
| [`cmt`](CLI-HELP.md#underpost-cmt) | Commits the staged changes with a Conventional Commit message: type(scope): description. |
| [`merge-dependabot`](CLI-HELP.md#underpost-merge-dependabot) | Fetches origin and merges each origin/dependabot/* branch into the base branch, one at a time, and prints ok or failed for each. Local changes are stashed and come back, with the branch you were on; nothing is pushed. |
| [`github`](CLI-HELP.md#underpost-github) | GitHub automation: workflows and repository metadata. |
| [`static`](CLI-HELP.md#underpost-static) | Manages static build of page, bundles, and documentation with comprehensive customization options. |
| [`root`](CLI-HELP.md#underpost-root) | Displays the root path of the npm installation. |
| [`ip`](CLI-HELP.md#underpost-ip) | Displays the current public machine IP addresses. |
| [`cluster`](CLI-HELP.md#underpost-cluster) | Manages Kubernetes clusters, defaulting to Kind cluster initialization. |
| [`deploy`](CLI-HELP.md#underpost-deploy) | Manages application deployments, defaulting to deploying development pods. |
| [`secret`](CLI-HELP.md#underpost-secret) | Workload secret store: SOPS/Age encrypted credentials projected as Kubernetes Secrets. |
| [`host`](CLI-HELP.md#underpost-host) | Host configuration: the node-level operational environment shared by the cluster. |
| [`app`](CLI-HELP.md#underpost-app) | Application environment: one deployment's runtime configuration. |
| [`state`](CLI-HELP.md#underpost-state) | Runtime state: live container execution state, health and metrics, exported off-cluster. |
| [`image`](CLI-HELP.md#underpost-image) | Manages Docker images, including building, saving, and loading into Kubernetes clusters. |
| [`install`](CLI-HELP.md#underpost-install) | Quickly imports Underpost npm dependencies by copying them. |
| [`db`](CLI-HELP.md#underpost-db) | Manages MariaDB and MongoDB databases: sealed backups in the object store, restores, verification and restore drills, retention, statistics, and collection operations. |
| [`metadata`](CLI-HELP.md#underpost-metadata) | Manages cluster metadata operations, including import and export. |
| [`cron`](CLI-HELP.md#underpost-cron) | Manages cron jobs: execute jobs directly or generate and apply K8s CronJob manifests. |
| [`fs`](CLI-HELP.md#underpost-fs) | Uploads, pulls, or deletes Cloudinary assets and synchronizes the selected storage manifest. |
| [`monitor`](CLI-HELP.md#underpost-monitor) | Manages health server monitoring, the cluster observability stack, and host dashboards. |
| [`event`](CLI-HELP.md#underpost-event) | Dispatches operational events and provisions the monitoring rules that trigger them. |
| [`ssh`](CLI-HELP.md#underpost-ssh) | Manages cluster scoped SSH credentials and sessions for remote access to cluster nodes or services. Users are registered in engine-private/deploy/conf.users.json and keys are stored in engine-private/deploy/users/<user>. |
| [`wireguard`](CLI-HELP.md#underpost-wireguard) | Manages the WireGuard L3 hub-and-spoke transport and the HAProxy edge gateway in front of it. |
| [`haproxy`](CLI-HELP.md#underpost-haproxy) | Manages the HAProxy edge gateway over the WireGuard transport (same subsystem as `underpost wireguard`). |
| [`vultr`](CLI-HELP.md#underpost-vultr) | Meters the edge VPS bandwidth against its Vultr plan quota and blocks egress before overage accrues. |
| [`sandbox`](CLI-HELP.md#underpost-sandbox) | The Development Sandbox: a local Kind cluster with MongoDB and Valkey, exposed on 127.0.0.1. It never resets a cluster, a database or a volume, and never stops a process it did not start. |
| [`namespace`](CLI-HELP.md#underpost-namespace) | Kubernetes placement from engine-private/deploy/conf.cluster.json: the context, the DNS domain and the namespace of each resource, the live cluster against it, and its migration. Capture is not a backup. Only migrate moves a resource: it deletes the source installation, installs it again in its destination and restarts its consumers, one unit at a time; until a unit is ready in its destination every command reaches its source. Nothing here deletes a namespace or rewrites an environment file. |
| [`tls`](CLI-HELP.md#underpost-tls) | TLS lifecycle: the ACME ClusterIssuer, the cert-manager Certificates, the TLS Secrets and self-signed TLS of the hosts the deployments declare. environments.<env>.tls of conf.cluster.json sets the mode. It never deletes a Certificate or a TLS Secret to renew it, and never changes a workload. |
| [`ingress`](CLI-HELP.md#underpost-ingress) | Routing: which deployment declares each host, the Gateway or HTTPProxy that serves it, and the routing objects a deployment leaves where it no longer runs. It never removes a shared object or one it cannot prove it owns. |
| [`run`](CLI-HELP.md#underpost-run) | Runs specified scripts using various runners. |
| [`test`](CLI-HELP.md#underpost-test) | Runs the test projects locally, inside deployment pods, or as a cluster Job with Allure reporting. |
| [`docker-compose`](CLI-HELP.md#underpost-docker-compose) | General-purpose Docker Compose development pipeline (mirrors the Kubernetes dev stack). |
| [`lxd`](CLI-HELP.md#underpost-lxd) | Manages LXD virtual machines as K3s nodes (control plane or workers). |
| [`baremetal`](CLI-HELP.md#underpost-baremetal) | Manages baremetal server operations, including installation, database setup, commissioning, and user management. |
| [`package`](CLI-HELP.md#underpost-package) | Generates the package manifests a deploy id owns, from the engine manifest and the deploy's product catalog, and installs the dependencies that catalog pins. |
| [`socketsecurity`](CLI-HELP.md#underpost-socketsecurity) | Security audit through the Socket.dev free plan: dependency security (advisories, supply chain alerts, free security patches in .socket/manifest.json) and source code risk (alerts on this project's own code). |
| [`graphify`](CLI-HELP.md#underpost-graphify) | Builds the code graph of this checkout with the pinned Graphify release, code only. It commits GRAPH_REPORT.md and its stamp in docs/graphify-out. |
| [`release`](CLI-HELP.md#underpost-release) | Release orchestrator for building new versions and deploying releases of the Underpost CLI. |
| [`source-release`](CLI-HELP.md#underpost-source-release) | Source channels, the Release Job and the release store. |

<!-- cli-index-end -->
