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

<a target="_top" href='https://www.npmjs.com/package/npm/v/11.1.0'><img alt='npm' src='https://img.shields.io/badge/npm v11.1.0-100000?style=flat&logo=npm&logoColor=white&labelColor=CB3837&color=727273'/></a> <a target="_top" href='https://nodejs.org/download/release/v22.9.0/'><img alt='nodedotjs' src='https://img.shields.io/badge/node v23.8.0-100000?style=flat&logo=nodedotjs&logoColor=white&labelColor=5FA04E&color=727273'/></a> <a target="_top" href='https://pgp.mongodb.com/'><img alt='mongodb' src='https://img.shields.io/badge/mongodb_server v7.0-100000?style=flat&logo=mongodb&logoColor=white&labelColor=47A248&color=727273'/></a>

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

## underpost ci/cd cli v2.8.781

### Usage: `underpost [options] [command]`
  ```
 Options:
  -V, --version                                              output the version number
  -h, --help                                                 display help for command

Commands:
  new <app-name>                                             Create a new project
  start [options] <deploy-id> [env]                          Start up server, build pipelines, or services
  clone [options] <uri>                                      Clone github repository
  pull [options] <path> <uri>                                Pull github repository
  cmt [options] <path> <commit-type> [module-tag] [message]  Commit github repository
  push [options] <path> <uri>                                Push github repository
  env <deploy-id> [env]                                      Set environment variables files and conf related to <deploy-id>
  config <operator> [key] [value]                            Manage configuration, operators
  root                                                       Get npm root path
  cluster [options] [pod-name]                               Manage cluster, for default initialization base kind cluster
  deploy [options] [deploy-list] [env]                       Manage deployment, for default deploy development pods
  secret [options] <platform>                                Manage secrets
  dockerfile-image-build [options]                           Build image from Dockerfile
  dockerfile-pull-base-images [options]                      Pull underpost dockerfile images requirements
  install                                                    Fast import underpost npm dependencies
  db [options] <deploy-list>                                 Manage databases
  script [options] <operator> <script-name> [script-value]   Supports a number of built-in underpost global scripts and their preset life cycle events as well as arbitrary scripts
  cron [options] [deploy-list] [job-list]                    Cron jobs management
  fs [options] [path]                                        File storage management, for default upload file
  test [options] [deploy-list]                               Manage Test, for default run current underpost default test
  monitor [options] <deploy-id> [env]                        Monitor health server management
  lxd [options]                                              Lxd management
  help [command]                                             display help for command
 
```
      
<a target="_top" href="https://github.com/underpostnet/pwa-microservices-template/blob/master/cli.md">See complete CLI Docs here.</a>
      
