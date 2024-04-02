[![Node.js CI](https://github.com/underpostnet/engine/actions/workflows/docker-image.yml/badge.svg?branch=master)](https://github.com/underpostnet/engine/actions/workflows/docker-image.yml) [![Test](https://github.com/underpostnet/engine/actions/workflows/coverall.yml/badge.svg?branch=master)](https://github.com/underpostnet/engine/actions/workflows/coverall.yml) [![Coverage Status](https://coveralls.io/repos/github/underpostnet/engine/badge.svg?branch=master)](https://coveralls.io/github/underpostnet/engine?branch=master)

#### Installation

```bash
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
