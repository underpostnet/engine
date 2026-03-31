# Cyberia gRPC Data Pipeline

Internal gRPC server that exposes read-only RPCs over MongoDB data for the Go game server (`cyberia-server`).

## Architecture

```
┌──────────────────────┐         gRPC (50051)         ┌───────────────────────┐
│   Node.js Engine     │ ◄─────────────────────────── │   Go Game Server      │
│   (MongoDB + Express)│                              │   (cyberia-server)    │
│                      │  GetFullInstance              │                      │
│   cyberia-grpc-      │  GetObjectLayerBatch          │   grpcclient/         │
│   server.js          │  GetAtlasSpriteSheetBatch      │   world_builder.go    │
│                      │  GetMapData                   │                      │
│                      │  Ping                         │                      │
└──────────────────────┘                              └───────────────────────┘
```

## Configuration

Add `grpc` to the host conf in `conf.dd-cyberia.js`:

```js
'www.cyberiaonline.com': {
  '/': {
    db: { provider: 'mongoose', host: 'env:DB_HOST', name: 'env:DB_NAME_CYBERIA' },
    grpc: { port: 50051 },
    // ...
  },
},
```

The gRPC server starts automatically after `DataBaseProvider.load()` when the `grpc` key is present.

### mTLS (optional)

For production environments with network-separated services:

```js
grpc: {
  port: 50051,
  tls: {
    caPath: '/path/to/ca.pem',
    certPath: '/path/to/server-cert.pem',
    keyPath: '/path/to/server-key.pem',
  },
},
```

The Go client (`cyberia-server/src/grpcclient/client.go`) supports the same mTLS config via `CACertPath`, `ClientCertPath`, `ClientKeyPath`.

## Auth

No application-level auth is required. This is a **private cluster-internal** channel:

- Both services run on the same host or within a trusted network
- The Go server is the only consumer — it dials `localhost:50051` by default
- mTLS provides mutual authentication when services are network-separated
- No user credentials or tokens flow over this channel — it's a data relay, not a user-facing API

## Usage

```js
import { GrpcServer } from './grpc-server.js';

// Start (called automatically by Express lifecycle when grpc conf is present)
await GrpcServer.start({
  host: 'www.cyberiaonline.com',
  path: '/',
  port: 50051,
});

// Stop
await GrpcServer.stop();
```

## Proto

Service definition: [`cyberia-server/proto/cyberia.proto`](../../../cyberia-server/proto/cyberia.proto)

## Runtime Modes

The gRPC server starts in **all** engine runtime modes that load `conf.server.json`:

| npm script               | NODE_ENV    | gRPC starts? | Notes                               |
| ------------------------ | ----------- | ------------ | ----------------------------------- |
| `npm start`              | _(none)_    | Yes          | Production entry point              |
| `npm run dev`            | development | Yes          | Nodemon auto-restart                |
| `npm run dev:container`  | development | Yes          | Docker development                  |
| `npm run prod:container` | production  | Yes          | Docker production                   |
| `npm run dev:api`        | development | **No**       | API-only mode, no Express lifecycle |

### Development (insecure)

Both sides default to insecure when no TLS paths are set:

- **Engine (Node.js)**: `grpc: { port: 50051 }` → `ServerCredentials.createInsecure()`
- **Go server**: `ENGINE_GRPC_ADDRESS=localhost:50051` → `insecure.NewCredentials()`

### Production (mTLS)

When services are network-separated, enable mutual TLS:

**Engine conf** (`conf.server.json` / `conf.dd-cyberia.js`):

```js
grpc: {
  port: 50051,
  tls: {
    caPath: '/path/to/ca.pem',
    certPath: '/path/to/server-cert.pem',
    keyPath: '/path/to/server-key.pem',
  },
},
```

**Go server env**:

```sh
ENGINE_GRPC_ADDRESS=engine-host:50051
ENGINE_GRPC_CA_CERT=/path/to/ca.pem
ENGINE_GRPC_CLIENT_CERT=/path/to/client-cert.pem
ENGINE_GRPC_CLIENT_KEY=/path/to/client-key.pem
```

## Environment Variables (Go side)

| Variable                  | Default           | Description                                  |
| ------------------------- | ----------------- | -------------------------------------------- |
| `ENGINE_GRPC_ADDRESS`     | `localhost:50051` | Engine gRPC server address                   |
| `ENGINE_GRPC_CA_CERT`     | _(empty)_         | CA certificate for TLS verification          |
| `ENGINE_GRPC_CLIENT_CERT` | _(empty)_         | Client certificate for mTLS                  |
| `ENGINE_GRPC_CLIENT_KEY`  | _(empty)_         | Client private key for mTLS                  |
| `INSTANCE_CODE`           | _(required)_      | Instance code to load on startup             |
| `ENGINE_API_BASE_URL`     | _(required)_      | Engine HTTP base URL for binary blob fetches |

## KubeAdm Production Deployment

### Cluster Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                        KubeAdm Cluster                              │
│                                                                     │
│  ┌─────────────┐     ┌──────────────────────────────────────────┐  │
│  │   Contour    │     │  dd-cyberia Pod (blue/green)             │  │
│  │   Envoy      │     │                                          │  │
│  │   (L7 proxy) │────▶│  Node.js Engine (:4005-4014)             │  │
│  │              │     │    ├─ Express (HTTP/WS)                  │  │
│  │  HTTPProxy:  │     │    ├─ gRPC server (:50051) ──────┐      │  │
│  │  *.cyberiaon │     │    └─ MongoDB, Valkey, Mailer     │      │  │
│  │  line.com    │     │                                    │      │  │
│  │              │     └────────────────────────────────────│──────┘  │
│  │              │                                          │         │
│  │              │     ┌────────────────────────────────────│──────┐  │
│  │              │     │  dd-cyberia-mmo-server Pod          │      │  │
│  │              │────▶│                                    ▼      │  │
│  │              │     │  Go game server (:8080) ◄── gRPC client  │  │
│  │              │     │    ├─ WebSocket game loop                 │  │
│  │              │     │    └─ REST API                            │  │
│  │              │     └──────────────────────────────────────────┘  │
│  │              │                                                   │
│  │              │     ┌──────────────────────────────────────────┐  │
│  │              │────▶│  dd-cyberia-mmo-client Pod               │  │
│  │              │     │  WASM client static server (:8081)       │  │
│  └─────────────┘     └──────────────────────────────────────────┘  │
│                                                                     │
│  cert-manager: LetsEncrypt certs for *.cyberiaonline.com            │
│  ConfigMap: underpost-config (.env.production)                      │
└─────────────────────────────────────────────────────────────────────┘
```

### TLS Certificate Lifecycle

Certificates are managed by **cert-manager** with a `letsencrypt-prod` ClusterIssuer (ACME HTTP-01 via Contour).

1. **Engine deploy** (`node bin deploy dd-cyberia production --cert`):
   - `buildCertManagerCertificate()` creates a cert-manager `Certificate` resource per host
   - cert-manager obtains LetsEncrypt certs, stores in K8s Secrets
   - `HTTPProxy.spec.virtualhost.tls.secretName` references the Secret
   - Contour/Envoy terminates TLS for all HTTPS traffic

2. **Instance deploy** (`node bin run instance --tls 'dd-cyberia,mmo-server'`):
   - `instance-promote` creates HTTPProxy for `server.cyberiaonline.com`
   - With `--tls`, also creates a cert-manager Certificate for the host
   - Same LetsEncrypt flow applies

### gRPC is Cluster-Internal (Not Exposed via Contour)

The gRPC channel between Engine and Go server is **never exposed through Contour/Envoy**:

- Port 50051 is **not** in the HTTPProxy routes (Contour is L7 HTTP only)
- Port 50051 is **not** in the K8s Services port range
- Both pods run on the same cluster — the Go server connects to the Engine pod's ClusterIP on port 50051
- **No TLS needed** for same-cluster gRPC — Kubernetes network is trusted
- mTLS is only needed if Engine and Go server run on different hosts/clusters

### Deployment Order

```
1. Engine (dd-cyberia)     ← gRPC server starts on :50051
2. Go server (mmo-server)  ← connects ENGINE_GRPC_ADDRESS=<engine-clusterIP>:50051
3. C client (mmo-client)   ← connects to Go WS, gets data from gRPC cache
```

## CD Workflows

All three repos use `workflow_dispatch` for manual triggers + commit-message triggers:

| Repo             | Trigger                              | Job                           |
| ---------------- | ------------------------------------ | ----------------------------- |
| `engine`         | `cd(ssh-engine-cyberia)` or dispatch | deploy, sync-and-deploy, init |
| `cyberia-server` | `cd(ssh-cyberia-server)` or dispatch | deploy                        |
| `cyberia-client` | `cd(ssh-cyberia-client)` or dispatch | deploy                        |

## Development Workflow

Run all three components locally:

```sh
# Terminal 1: Engine (Node.js + gRPC server on :50051)
cd /home/dd/engine
npm run dev  # or: NODE_ENV=development node src/server

# Terminal 2: Go game server
cd /home/dd/engine/cyberia-server
echo 'ENGINE_GRPC_ADDRESS=localhost:50051' > .env
echo 'INSTANCE_CODE=cyberia-main' >> .env
echo 'ENGINE_API_BASE_URL=https://www.cyberiaonline.com' >> .env
go run main.go

# Terminal 3: C/WASM client
cd /home/dd/engine/cyberia-client
source ~/.emsdk/emsdk_env.sh
make -f Web.mk clean && make -f Web.mk web
make -f Web.mk serve-development  # serves on :8082
```
