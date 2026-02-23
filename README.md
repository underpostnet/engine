<p align="center">
  <img src="https://underpost.net/assets/splash/apple-touch-icon-precomposed.png" alt="underpost engine core server"/>
</p>

<div align="center">

<h1>underpost</h1>

</div>

<div align="center">

<a target="_top" href='https://download.rockylinux.org/pub/rocky/9/'><img alt='rockylinux' src='https://img.shields.io/badge/Rocky Linux v9.6-100000?style=flat&logo=rockylinux&logoColor=white&labelColor=10b981&color=727273'/></a> <a target="_top" href='https://www.npmjs.com/package/npm?activeTab=versions'><img alt='npm' src='https://img.shields.io/badge/npm v11.6.2-100000?style=flat&logo=npm&logoColor=white&labelColor=CB3837&color=727273'/></a> <a target="_top" href='https://nodejs.org/download/release'><img alt='nodedotjs' src='https://img.shields.io/badge/node v24.10.0-100000?style=flat&logo=nodedotjs&logoColor=white&labelColor=5FA04E&color=727273'/></a> <a target="_top" href='https://pgp.mongodb.com/'><img alt='mongodb' src='https://img.shields.io/badge/mongodb_server v7.0-100000?style=flat&logo=mongodb&logoColor=white&labelColor=47A248&color=727273'/></a>

</div>

<div align="center">

[![Node.js CI](https://github.com/underpostnet/engine/actions/workflows/docker-image.ci.yml/badge.svg?branch=master)](https://github.com/underpostnet/engine/actions/workflows/docker-image.yml) [![Test](https://github.com/underpostnet/engine/actions/workflows/coverall.ci.yml/badge.svg?branch=master)](https://github.com/underpostnet/engine/actions/workflows/coverall.ci.yml) [![Downloads](https://img.shields.io/npm/dm/underpost.svg)](https://www.npmjs.com/package/underpost) [![Socket Badge](https://socket.dev/api/badge/npm/package/underpost/3.0.1)](https://socket.dev/npm/package/underpost/overview/3.0.1) [![Coverage Status](https://coveralls.io/repos/github/underpostnet/engine/badge.svg?branch=master)](https://coveralls.io/github/underpostnet/engine?branch=master) [![Version](https://img.shields.io/npm/v/underpost.svg)](https://www.npmjs.org/package/underpost) [![License](https://img.shields.io/npm/l/underpost.svg)](https://www.npmjs.com/package/underpost)

</div>

<div align="center">

<!-- template-title -->

<div style="font-size: 20px;"><em>End2end</em> continuous integration and continuous deployment cloud to applications federation tools. Develop, build, deploy, test, monitor, and manage multiple runtime applications on virtual machines or container instances.</div>

</div>

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

<a target="_top" href="https://www.nexodev.org/docs?cid=src">See Docs here.</a>

## underpost ci/cd cli v3.0.1

### Usage: `underpost [options] [command]`
  ```
 Options:
  -V, --version                                              output the version number
  -h, --help                                                 display help for command

Commands:
  new [options] [app-name]                                   Initializes a new Underpost project, service, or configuration.
  start [options] <deploy-id> [env]                          Initiates application servers, build pipelines, or other defined services based on the deployment ID.
  clone [options] <uri>                                      Clones a specified GitHub repository into the current directory.
  pull [options] <path> <uri>                                Pulls the latest changes from a specified GitHub repository.
  cmt [options] [path] [commit-type] [module-tag] [message]  Manages commits to a GitHub repository, supporting various commit types and options.
  push [options] <path> <uri>                                Pushes committed changes from a local repository to a remote GitHub repository.
  env [deploy-id] [env] [subConf]                            Sets environment variables and configurations related to a specific deployment ID.
  static [options]                                           Manages static build of page, bundles, and documentation with comprehensive customization options.
  config [options] <operator> [key] [value]                  Manages Underpost configurations using various operators.
  root                                                       Displays the root path of the npm installation.
  ip [options] [ips]                                         Displays the current public machine IP addresses.
  cluster [options] [pod-name]                               Manages Kubernetes clusters, defaulting to Kind cluster initialization.
  deploy [options] [deploy-list] [env]                       Manages application deployments, defaulting to deploying development pods.
  secret [options] <platform>                                Manages secrets for various platforms.
  image [options]                                            Manages Docker images, including building, saving, and loading into Kubernetes clusters.
  install                                                    Quickly imports Underpost npm dependencies by copying them.
  db [options] [deploy-list]                                 Manages database operations with support for MariaDB and MongoDB, including import/export, multi-pod targeting, and Git integration.
  metadata [options] [deploy-id] [host] [path]               Manages cluster metadata operations, including import and export.
  cron [options] [deploy-list] [job-list]                    Manages cron jobs: execute jobs directly or generate and apply K8s CronJob manifests.
  fs [options] [path]                                        Manages file storage, defaulting to file upload operations.
  test [options] [deploy-list]                               Manages and runs tests, defaulting to the current Underpost default test suite.
  monitor [options] <deploy-id> [env]                        Manages health server monitoring for specified deployments.
  ssh [options]                                              Manages SSH credentials and sessions for remote access to cluster nodes or services.
  run [options] <runner-id> [path]                           Runs specified scripts using various runners.
  lxd [options]                                              Manages LXD containers and virtual machines.
  baremetal [options] [workflow-id]                          Manages baremetal server operations, including installation, database setup, commissioning, and user management.
  help [command]                                             display help for command
 
```

<a target="_top" href="https://github.com/underpostnet/pwa-microservices-template/blob/master/CLI-HELP.md">See CLI Docs here.</a>
