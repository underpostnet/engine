### ENGINE

Container App and DevOps CI/CD Tools.

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
docker run --name engine-instance -p 41061:3001 engine
```

Generate docs

```bash
npm run docs
```
