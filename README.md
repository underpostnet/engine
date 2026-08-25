<p align="center">
  <img src="https://underpost.net/assets/splash/apple-touch-icon-precomposed.png" alt="underpost engine core server"/>
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

[![Node.js CI](https://img.shields.io/github/actions/workflow/status/underpostnet/engine/docker-image.ci.yml?branch=master&label=Node.js%20CI)](https://github.com/underpostnet/engine/actions/workflows/docker-image.ci.yml) [![Test](https://img.shields.io/github/actions/workflow/status/underpostnet/engine/coverall.ci.yml?branch=master&label=Test)](https://github.com/underpostnet/engine/actions/workflows/coverall.ci.yml) [![Coverage Status](https://coveralls.io/repos/github/underpostnet/engine/badge.svg?branch=master)](https://coveralls.io/github/underpostnet/engine?branch=master) [![Socket Badge](https://socket.dev/api/badge/npm/package/underpost/3.3.0)](https://socket.dev/npm/package/underpost/overview/3.3.0)

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

<a target="_top" href="Https://github.com/underpostnet/engine/blob/master/src/client/public/cyberia-docs/UNDERPOST-PLATFORM.md">See Detailed platform doc.</a>

### Architectural roles (Cyberia stack)

When the platform is hosting the Cyberia MMO extension, three independent runtime processes participate. Their boundaries are non-overlapping.

| Process                              | Role                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **engine-cyberia** (Node.js)         | Content authority: maps, object layers, atlas/asset metadata, world configuration, persistence, validation, gRPC + REST data services, editor backend, asset distribution. |
| **cyberia-server** (Go)              | Authoritative simulation runtime: tick advancement, AOI replication, input command processing, snapshot generation.                                                        |
| **cyberia-client** (C → WebAssembly) | Presentation runtime: rendering, UI, input capture, prediction, reconciliation, interpolation, client-side presentation defaults.                                          |

The ecosystem is **playable only when all three are running and healthy**. Each service is supervised independently and owns its own monitor/reconnector. If any one is unhealthy, the game enters standby and resumes automatically once all three are healthy again.

<a target="_top" href="https://github.com/underpostnet/engine-cyberia/blob/master/src/client/public/cyberia-docs/ARCHITECTURE.md">See detailed Cyberia architecture.</a>

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

> underpost ci/cd cli v3.3.0

**Usage:** `underpost [options] [command]`

### Global options

| Option | Description |
| --- | --- |
| `-V, --version` | output the version number |
| `-h, --help` | display help for command |

### Commands

| Command | Description |
| --- | --- |
| [`new`](CLI-HELP.md#underpost-new) | Initializes a new Underpost project, service, or configuration. |
| [`client`](CLI-HELP.md#underpost-client) | Builds client assets, single replicas, and/or syncs environment ports. |
| [`start`](CLI-HELP.md#underpost-start) | Initiates application servers, build pipelines, or other defined services based on the deployment ID. |
| [`clone`](CLI-HELP.md#underpost-clone) | Clones a specified GitHub repository into the current directory. |
| [`pull`](CLI-HELP.md#underpost-pull) | Pulls the latest changes from a specified GitHub repository. |
| [`cmt`](CLI-HELP.md#underpost-cmt) | Manages commits to a GitHub repository, supporting various commit types and options. |
| [`push`](CLI-HELP.md#underpost-push) | Pushes committed changes from a local repository to a remote GitHub repository. |
| [`env`](CLI-HELP.md#underpost-env) | Deprecated alias of `underpost app load`, kept for images that predate it. |
| [`static`](CLI-HELP.md#underpost-static) | Manages static build of page, bundles, and documentation with comprehensive customization options. |
| [`config`](CLI-HELP.md#underpost-config) | Reads and writes single keys of the underpost root env store (see `underpost host` for its lifecycle). |
| [`state`](CLI-HELP.md#underpost-state) | Reads and writes the container runtime state store used by the deployment lifecycle. |
| [`root`](CLI-HELP.md#underpost-root) | Displays the root path of the npm installation. |
| [`ip`](CLI-HELP.md#underpost-ip) | Displays the current public machine IP addresses. |
| [`cluster`](CLI-HELP.md#underpost-cluster) | Manages Kubernetes clusters, defaulting to Kind cluster initialization. |
| [`deploy`](CLI-HELP.md#underpost-deploy) | Manages application deployments, defaulting to deploying development pods. |
| [`secret`](CLI-HELP.md#underpost-secret) | Workload secret store: SOPS/Age encrypted credentials projected as Kubernetes Secrets. |
| [`host`](CLI-HELP.md#underpost-host) | Host configuration: the node-level operational environment shared by the cluster. |
| [`app`](CLI-HELP.md#underpost-app) | Application environment: one deployment's runtime configuration. |
| [`image`](CLI-HELP.md#underpost-image) | Manages Docker images, including building, saving, and loading into Kubernetes clusters. |
| [`install`](CLI-HELP.md#underpost-install) | Quickly imports Underpost npm dependencies by copying them. |
| [`db`](CLI-HELP.md#underpost-db) | Manages database operations with support for MariaDB and MongoDB, including import/export, multi-pod targeting, and Git integration. |
| [`metadata`](CLI-HELP.md#underpost-metadata) | Manages cluster metadata operations, including import and export. |
| [`cron`](CLI-HELP.md#underpost-cron) | Manages cron jobs: execute jobs directly or generate and apply K8s CronJob manifests. |
| [`fs`](CLI-HELP.md#underpost-fs) | Manages file storage, defaulting to file upload operations. |
| [`monitor`](CLI-HELP.md#underpost-monitor) | Manages health server monitoring, the cluster observability stack, and host dashboards. |
| [`event`](CLI-HELP.md#underpost-event) | Dispatches operational events and provisions the monitoring rules that trigger them. |
| [`ssh`](CLI-HELP.md#underpost-ssh) | Manages cluster scoped SSH credentials and sessions for remote access to cluster nodes or services. Users are registered in engine-private/deploy/conf.users.json and keys are stored in engine-private/deploy/users/<user>. |
| [`wireguard`](CLI-HELP.md#underpost-wireguard) | Manages the WireGuard L3 hub-and-spoke transport and the HAProxy edge gateway in front of it. |
| [`haproxy`](CLI-HELP.md#underpost-haproxy) | Manages the HAProxy edge gateway over the WireGuard transport (same subsystem as `underpost wireguard`). |
| [`vultr`](CLI-HELP.md#underpost-vultr) | Meters the edge VPS bandwidth against its Vultr plan quota and blocks egress before overage accrues. |
| [`run`](CLI-HELP.md#underpost-run) | Runs specified scripts using various runners. |
| [`test`](CLI-HELP.md#underpost-test) | Runs the test tiers locally, inside deployment pods, or as a cluster Job with Allure reporting. |
| [`docker-compose`](CLI-HELP.md#underpost-docker-compose) | General-purpose Docker Compose development pipeline (mirrors the Kubernetes dev stack). |
| [`lxd`](CLI-HELP.md#underpost-lxd) | Manages LXD virtual machines as K3s nodes (control plane or workers). |
| [`baremetal`](CLI-HELP.md#underpost-baremetal) | Manages baremetal server operations, including installation, database setup, commissioning, and user management. |
| [`release`](CLI-HELP.md#underpost-release) | Release orchestrator for building new versions and deploying releases of the Underpost CLI. |

<!-- cli-index-end -->

<a target="_top" href="https://github.com/underpostnet/pwa-microservices-template/blob/master/CLI-HELP.md">See CLI Docs.</a>
