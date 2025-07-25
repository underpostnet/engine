<p align="center">
  <img src="https://underpost.net/assets/splash/apple-touch-icon-precomposed.png" alt="underpost engine core server"/>
</p>

<div align="center">

### underpost.net

</div>

<div align="center">

core server

</div>

<div align="center">

<a target="_top" href='https://rockylinux.org/download'><img alt='rockylinux' src='https://img.shields.io/badge/Rocky Linux v9.6-100000?style=flat&logo=rockylinux&logoColor=white&labelColor=10b981&color=727273'/></a> <a target="_top" href='https://www.npmjs.com/package/npm/v/11.1.0'><img alt='npm' src='https://img.shields.io/badge/npm v11.1.0-100000?style=flat&logo=npm&logoColor=white&labelColor=CB3837&color=727273'/></a> <a target="_top" href='https://nodejs.org/download/release/v22.9.0/'><img alt='nodedotjs' src='https://img.shields.io/badge/node v23.8.0-100000?style=flat&logo=nodedotjs&logoColor=white&labelColor=5FA04E&color=727273'/></a> <a target="_top" href='https://pgp.mongodb.com/'><img alt='mongodb' src='https://img.shields.io/badge/mongodb_server v7.0-100000?style=flat&logo=mongodb&logoColor=white&labelColor=47A248&color=727273'/></a>

</div>

<div align="center">

[![Node.js CI](https://github.com/underpostnet/engine/actions/workflows/docker-image.yml/badge.svg?branch=master)](https://github.com/underpostnet/engine/actions/workflows/docker-image.yml) [![Test](https://github.com/underpostnet/engine/actions/workflows/coverall.yml/badge.svg?branch=master)](https://github.com/underpostnet/engine/actions/workflows/coverall.yml) [![Downloads](https://img.shields.io/npm/dm/underpost.svg)](https://www.npmjs.com/package/underpost) [![Coverage Status](https://coveralls.io/repos/github/underpostnet/engine/badge.svg?branch=master)](https://coveralls.io/github/underpostnet/engine?branch=master) [![Version](https://img.shields.io/npm/v/underpost.svg)](https://www.npmjs.org/package/underpost) [![License](https://img.shields.io/npm/l/underpost.svg)](https://www.npmjs.com/package/underpost)

</div>

<div align="center">

Develop, build, deploy, test, monitor, and manage multiple runtime applications on virtual machines or container instances.

</div>

## Create a new project

```bash
npm install -g underpost
```

```bash
underpost new app-name
```

After template installation, the server will be running on <a target="_top" href="http://localhost:4001">http://localhost:4001</a>

Package repo and usage info: <a target="_top" href="https://github.com/underpostnet/pwa-microservices-template/blob/master/README.md">pwa-microservices-template</a>

## underpost ci/cd cli v2.8.819

### Usage: `underpost [options] [command]`
  ```
 Options:
  -V, --version                                              output the version number
  -h, --help                                                 display help for command

Commands:
  new <app-name>                                             Initializes a new Underpost project with a predefined structure.
  start [options] <deploy-id> [env]                          Initiates application servers, build pipelines, or other defined services based on the deployment ID.
  clone [options] <uri>                                      Clones a specified GitHub repository into the current directory.
  pull [options] <path> <uri>                                Pulls the latest changes from a specified GitHub repository.
  cmt [options] <path> <commit-type> [module-tag] [message]  Manages commits to a GitHub repository, supporting various commit types and options.
  push [options] <path> <uri>                                Pushes committed changes from a local repository to a remote GitHub repository.
  env <deploy-id> [env]                                      Sets environment variables and configurations related to a specific deployment ID.
  config [options] <operator> [key] [value]                  Manages Underpost configurations using various operators.
  root                                                       Displays the root path of the npm installation.
  cluster [options] [pod-name]                               Manages Kubernetes clusters, defaulting to Kind cluster initialization.
  deploy [options] [deploy-list] [env]                       Manages application deployments, defaulting to deploying development pods.
  secret [options] <platform>                                Manages secrets for various platforms.
  dockerfile-image-build [options]                           Builds a Docker image from a specified Dockerfile with various options for naming, saving, and loading.
  dockerfile-pull-base-images [options]                      Pulls required Underpost Dockerfile base images and optionally loads them into clusters.
  install                                                    Quickly imports Underpost npm dependencies by copying them.
  db [options] <deploy-list>                                 Manages database operations, including import, export, and collection management.
  script [options] <operator> <script-name> [script-value]   Supports a variety of built-in Underpost global scripts, their preset lifecycle events, and arbitrary custom scripts.
  cron [options] [deploy-list] [job-list]                    Manages cron jobs, including initialization, execution, and configuration updates.
  fs [options] [path]                                        Manages file storage, defaulting to file upload operations.
  test [options] [deploy-list]                               Manages and runs tests, defaulting to the current Underpost default test suite.
  monitor [options] <deploy-id> [env]                        Manages health server monitoring for specified deployments.
  lxd [options]                                              Manages LXD containers and virtual machines.
  baremetal [options] [workflow-id] [hostname] [ip-address]  Manages baremetal server operations, including installation, database setup, commissioning, and user management.
  help [command]                                             display help for command
 
```
      
<a target="_top" href="https://github.com/underpostnet/pwa-microservices-template/blob/master/cli.md">See complete CLI Docs here.</a>
      
