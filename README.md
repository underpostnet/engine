<a href='https://www.npmjs.com/package/npm/v/10.2.3' target="_blank"><img alt='npm' src='https://img.shields.io/badge/npm_>= v10.2.3-100000?style=flat&logo=npm&logoColor=white&labelColor=1F1F1F&color=04BA01'/></a><a href='https://nodejs.org/download/release/v21.2.0/' target="_blank"><img alt='javascript' src='https://img.shields.io/badge/node_>= v21.2.0-100000?style=flat&logo=javascript&logoColor=white&labelColor=1F1F1F&color=04BA01'/></a><a href='https://pgp.mongodb.com/' target="_blank"><img alt='mongodb' src='https://img.shields.io/badge/mongodb_server >= v7.0-100000?style=flat&logo=mongodb&logoColor=white&labelColor=1F1F1F&color=04BA01'/></a><a href='https://socket.io/docs/v4/changelog/4.7.2' target="_blank"><img alt='socket.io' src='https://img.shields.io/badge/socket.io >= v4.7.2-100000?style=flat&logo=socket.io&logoColor=white&labelColor=1F1F1F&color=04BA01'/></a>

[![Node.js CI](https://github.com/underpostnet/engine/actions/workflows/docker-image.yml/badge.svg?branch=master)](https://github.com/underpostnet/engine/actions/workflows/docker-image.yml) [![Test](https://github.com/underpostnet/engine/actions/workflows/coverall.yml/badge.svg?branch=master)](https://github.com/underpostnet/engine/actions/workflows/coverall.yml) [![Coverage Status](https://coveralls.io/repos/github/underpostnet/engine/badge.svg?branch=master)](https://coveralls.io/github/underpostnet/engine?branch=master)

#### Installation

```bash
npm run install-global

npm install
```

#### Usage

Run dev

```bash
npm run dev
```

Run on `pm2`

```bash
npm run pm2
```

Run on `docker-compose`

```bash
npm run start:docker
```

Run on `docker`

```bash
# build image
docker build . -t engine

# run image
docker run --name engine-instance -p 41061:3001 -p 41062:3002 engine
```
