# Deploy to Kubernetes Guide

This guide walks you through the process of creating a new deployment ID with cluster-specific files and deploying services to a Kubernetes cluster using the `underpost` CLI.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Creating a New Deployment](#creating-a-new-deployment)
4. [Deploy Command Reference](#deploy-command-reference)
5. [Advanced Deployment Options](#advanced-deployment-options)
6. [Common Deployment Workflows](#common-deployment-workflows)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

1. `underpost` CLI is installed globally
2. Running Kubernetes cluster (`kind`, `kubeadm`, `k3s`, etc.)
3. `kubectl` is configured to connect to the cluster
4. Underpost cluster components are set up (Contour ingress, cert-manager for production)

```bash
# Set up cluster components
underpost cluster --contour
```

---

## Quick Start

### Create and Deploy a New Service

```bash
# 1. Create deployment configuration with cluster files
node bin new --deploy-id dd-my-new-service --cluster

# 2. Build Kubernetes manifests
node bin deploy dd-my-new-service development --build-manifest

# 3. Deploy to cluster
node bin deploy dd-my-new-service development
```

---

## Creating a New Deployment

### Step 1: Create Deployment ID with Cluster Files

Create a new deployment configuration with Kubernetes support:

```bash
node bin new --deploy-id dd-my-new-service --cluster
```

**What this does:**

- Creates `./engine-private/conf/dd-my-new-service/` directory
- Generates configuration files (client.js, server.js, ssr.js)
- Creates Kubernetes-related files (CI/CD workflows)
- Adds `dd-my-new-service` to `./engine-private/deploy/dd.router`
- Runs synchronization to prepare cluster configurations

### Step 2: Build Kubernetes Manifests

Generate the Kubernetes YAML manifests:

```bash
node bin deploy dd-my-new-service development --build-manifest
```

**Options:**

- `--build-manifest`: Creates `deployment.yaml` and `proxy.yaml`
- `--replicas <n>`: Number of replicas (default: 1)
- `--versions <list>`: Comma-separated versions (default: "blue,green")
- `--image <name>`: Custom Docker image
- `--namespace <ns>`: Target namespace (default: "default")

**Output location:** `manifests/deployment/dd-my-new-service-development/`

### Step 3: Deploy to Kubernetes

Apply the manifests to your cluster:

```bash
node bin deploy dd-my-new-service development
```

**What happens:**

- Applies `deployment.yaml` to create Deployment and Service
- Applies `proxy.yaml` to create HTTPProxy ingress resource
- Service becomes accessible through the cluster's ingress controller

**Verify deployment:**

```bash
kubectl get pods,svc,httpproxy -n default
kubectl get pods -l app=dd-my-new-service
```

---

## Deploy Command Reference

### Command Syntax

```bash
node bin deploy <deploy-list> <environment> [options]
```

### Arguments

- `<deploy-list>`: Comma-separated deployment IDs (e.g., `dd-app1,dd-app2`)
- `<environment>`: Target environment (`development`, `production`)

### Core Options

| Option                               | Description                                                                    | Default      | Example                         |
| ------------------------------------ | ------------------------------------------------------------------------------ | ------------ | ------------------------------- |
| `--build-manifest`                   | Build Kubernetes manifest files                                                | -            | `--build-manifest`              |
| `--replicas <n>`                     | Number of pod replicas                                                         | 1            | `--replicas 3`                  |
| `--versions <list>`                  | Deployment versions (blue/green)                                               | "blue,green" | `--versions blue,green`         |
| `--image <name>`                     | Docker image for deployment                                                    | -            | `--image myapp:v1.2.3`          |
| `--namespace <ns>`                   | Kubernetes namespace                                                           | "default"    | `--namespace production`        |
| `--timeout-response <duration>`      | Set HTTPProxy route `timeoutPolicy.response` (e.g., "1s", "300ms", "infinity") | -            | `--timeout-response 1s`         |
| `--timeout-idle <duration>`          | Set HTTPProxy route `timeoutPolicy.idle` (e.g., "10s", "infinity")             | -            | `--timeout-idle 10s`            |
| `--retry-count <count>`              | Set HTTPProxy route `retryPolicy.count` (integer)                              | -            | `--retry-count 3`               |
| `--retry-per-try-timeout <duration>` | Set HTTPProxy route `retryPolicy.perTryTimeout` (e.g., "150ms")                | -            | `--retry-per-try-timeout 150ms` |
| `--node <name>`                      | Target specific node                                                           | -            | `--node worker-01`              |

### Traffic & Routing Options

| Option                 | Description                                                            | Example              |
| ---------------------- | ---------------------------------------------------------------------- | -------------------- |
| `--traffic <versions>` | Set traffic routing (blue/green)                                       | `--traffic blue`     |
| `--gateway-api`        | Apply the Gateway API stack (Gateway + HTTPRoute) instead of HTTPProxy | `--gateway-api`      |
| `--gateway-class <n>`  | GatewayClass baked into generated Gateway manifests (default `eg`)     | `--gateway-class eg` |
| `--disable-http3`      | Omit the QUIC/HTTP3 listener config and the `Alt-Svc` advertisement    | `--disable-http3`    |
| `--quic-port <port>`   | UDP port advertised for QUIC/HTTP3 (default 443)                       | `--quic-port 443`    |
| `--sync-static`        | Place the edge-served SSR documents in the gateway static tier         | `--sync-static`      |

Both manifest sets are always generated by `--build-manifest`; `--gateway-api` selects which one is applied. HTTP/3 is enabled by default wherever the HTTPS listener exists — QUIC has no cleartext transport, so a deploy without TLS gets no QUIC either.

#### Edge-served status pages (`--sync-static`)

SSR views whose route is a bare status code (`/404`) and views flagged `offlineDefault` / `maintenanceDefault` are served by the `underpost-gateway` Nginx workload rather than by the application pods — a rendered page is far past the 4096-byte direct-response ceiling the gateway would otherwise have to carry, and exceeding it fails the whole route.

`--sync-static` places those documents in the static tier's hostPath volume. It prefers the running workload, because clients built from private sources only exist inside the container, and falls back to this checkout's `public/` tree — so the same command seeds the tree before the deployment exists and refreshes it once the deployment is Ready:

```bash
# Seed before the routes are applied
node bin deploy dd-cyberia development --sync-static --gateway-api --kubeadm

# Refresh from the container once it is Ready
kubectl rollout status deployment/dd-cyberia-development-blue -n default
node bin deploy dd-cyberia development --sync-static --gateway-api --kubeadm
```

Anything found in neither place falls through to the shared default page, which answers 404 and is never cached. `node bin run cluster --dev` runs both passes for you; see [Main cluster lifecycle commands](<./Main cluster lifecycle commands.md>).

### TLS/Certificate Options

| Option                 | Description                                                                           | Example                                          |
| ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `--cert`               | Enable TLS certificates (production only)                                             | `--cert`                                         |
| `--cert-hosts <hosts>` | Specific hosts for certificates                                                       | `--cert-hosts "api.example.com,app.example.com"` |
| `--self-signed`        | Use a pre-created self-signed TLS secret named after the host instead of cert-manager | `--self-signed`                                  |

### Update Control Options

| Option                              | Description              | Example                             |
| ----------------------------------- | ------------------------ | ----------------------------------- |
| `--disable-update-deployment`       | Skip deployment updates  | `--disable-update-deployment`       |
| `--disable-update-proxy`            | Skip proxy updates       | `--disable-update-proxy`            |
| `--disable-deployment-proxy`        | Disable proxy completely | `--disable-deployment-proxy`        |
| `--disable-update-volume`           | Skip volume updates      | `--disable-update-volume`           |
| `--disable-update-underpost-config` | Skip config updates      | `--disable-update-underpost-config` |

### Information & Utility Options

| Option          | Description                  | Example         |
| --------------- | ---------------------------- | --------------- |
| `--info-router` | Display router configuration | `--info-router` |
| `--sync`        | Synchronize configurations   | `--sync`        |

### Cleanup Options

| Option            | Description                    | Example           |
| ----------------- | ------------------------------ | ----------------- |
| `--remove`        | Remove deployment from cluster | `--remove`        |
| `--restore-hosts` | Restore /etc/hosts file        | `--restore-hosts` |

### Development Options

| Option                 | Description                                        | Example                   |
| ---------------------- | -------------------------------------------------- | ------------------------- |
| `--cmd <cmd>`          | Custom initialization command (comma-separated)    | `--cmd "npm run migrate"` |
| `--kubeadm`            | Kubeadm cluster context                            | `--kubeadm`               |
| `--etc-hosts`          | Add hosts to /etc/hosts                            | `--etc-hosts`             |

---

## Advanced Deployment Options

### Multi-Replica Deployment

Deploy with multiple replicas:

```bash
node bin deploy dd-api production \
  --replicas 3 \
  --build-manifest

node bin deploy dd-api production
```

### Blue-Green Deployment

Deploy both blue and green versions:

```bash
# Build manifests for both versions
node bin deploy dd-app production \
  --versions blue,green \
  --replicas 2 \
  --build-manifest

# Deploy both versions
node bin deploy dd-app production

# Switch traffic to green
node bin deploy dd-app production --traffic green
```

### Custom Image Deployment

Deploy with specific Docker image:

```bash
node bin deploy dd-service development \
  --image myregistry.io/myapp:v2.1.0 \
  --replicas 2 \
  --build-manifest

node bin deploy dd-service development
```

### Node-Specific Deployment

Deploy to specific Kubernetes node:

```bash
node bin deploy dd-database production \
  --node worker-03 \
  --replicas 1 \
  --build-manifest

node bin deploy dd-database production
```

### Production with TLS Certificates

Deploy with automatic TLS certificate management:

```bash
node bin deploy dd-api production \
  --cert \
  --replicas 3 \
  --build-manifest
```

### HTTPProxy Timeout & Retry Policies

You can configure per-route timeout and retry policies for the HTTPProxy resources generated by the `deploy` command using the following options:

- `--timeout-response <duration>`: Sets HTTPProxy route `timeoutPolicy.response` (e.g., `1s`, `300ms`, `infinity`). This is the time that spans from the end of the client request to the end of the upstream response. The string `infinity` or `0s` is treated as no timeout.
- `--timeout-idle <duration>`: Sets HTTPProxy route `timeoutPolicy.idle` (e.g., `10s`, `infinity`). This controls per-route idle timeout.
- `--retry-count <count>`: Sets HTTPProxy route `retryPolicy.count` (integer). Specifies the maximum number of retries.
- `--retry-per-try-timeout <duration>`: Sets HTTPProxy route `retryPolicy.perTryTimeout` (e.g., `150ms`). Specifies the timeout per retry attempt.

Example HTTPProxy manifest snippet:

```yaml
# httpproxy-response-timeout.yaml
apiVersion: projectcontour.io/v1
kind: HTTPProxy
metadata:
  name: response-timeout
  namespace: default
spec:
  virtualhost:
    fqdn: timeout.bar.com
  routes:
    - timeoutPolicy:
        response: 1s
        idle: 10s
      retryPolicy:
        count: 3
        perTryTimeout: 150ms
      services:
        - name: s1
          port: 80
```

To generate the proxy YAML with these settings when building manifests:

```bash
node bin deploy dd-my-new-service development --build-manifest --timeout-response 1s --timeout-idle 10s --retry-count 3 --retry-per-try-timeout 150ms
```

Then apply the manifests:

```bash
node bin deploy dd-my-new-service development
```

Notes:

- Durations follow the format used by Envoy (e.g., `300ms`, `5s`, `1m`, or `infinity`).
- `retryPolicy.perTryTimeout` is optional and may be ignored if it exceeds other request timeouts; consult Envoy/Contour docs for detailed behavior.

### Specific Hosts Certificates

Create certificates for specific hosts only:

```bash
# Create certificates without deploying
node bin deploy --cert-hosts "api.example.com,app.example.com" --namespace production

# Deploy with certificates for specific hosts
node bin deploy dd-app production \
  --cert \
  --cert-hosts "app.example.com" \
  --build-manifest

node bin deploy dd-app production
```

### Partial Updates

Update only specific components:

```bash
# Update deployment only (skip proxy)
node bin deploy dd-app development --disable-update-proxy

# Update proxy only (skip deployment)
node bin deploy dd-app development --disable-update-deployment

# Update without touching volumes
node bin deploy dd-app development --disable-update-volume
```

### Multi-Service Deployment

Deploy multiple services at once:

```bash
node bin deploy dd-api,dd-frontend,dd-worker production \
  --replicas 2 \
  --build-manifest

node bin deploy dd-api,dd-frontend,dd-worker production
```

### Development with Local DNS

Deploy in development with /etc/hosts configuration:

```bash
node bin deploy dd-app development \
  --etc-hosts \
  --replicas 1 \
  --build-manifest

node bin deploy dd-app development --etc-hosts
```

---

## Common Deployment Workflows

### Initial Deployment Workflow

```bash
# 1. Create deployment configuration
node bin new --deploy-id dd-my-service --cluster

# 2. Build manifests for development
node bin deploy dd-my-service development --build-manifest --replicas 1

# 3. Deploy to development
node bin deploy dd-my-service development

# 4. Verify deployment
kubectl get pods,svc,httpproxy -n default | grep my-service

# 5. Build manifests for production
node bin deploy dd-my-service production --build-manifest --replicas 3 --cert

# 6. Deploy to production
node bin deploy dd-my-service production
```

### Update Existing Deployment

```bash
# 1. Update manifests with new configuration
node bin deploy dd-app production --replicas 5 --build-manifest

# 2. Apply updates
node bin deploy dd-app production
```

### Blue-Green Deployment Workflow

```bash
# 1. Deploy blue version
node bin deploy dd-app production --traffic blue --build-manifest
node bin deploy dd-app production --traffic blue

# 2. Deploy green version (new)
node bin deploy dd-app production --traffic green --build-manifest
node bin deploy dd-app production

# 3. Test green version
# ... perform testing ...

# 4. Switch traffic to green
node bin deploy dd-app production --traffic green

# 5. Remove blue version if satisfied
# ... or keep for rollback capability
```

### Remove Deployment

```bash
# Remove deployment from cluster
node bin deploy dd-old-service production --remove

# Restore /etc/hosts if modified
node bin deploy dd-old-service production --restore-hosts
```

### Expose Service for Testing

```bash
# Match every Service containing "dd-api" and expose remote port 8080.
node bin run expose dd-api --dev --kind --expose-container-ports 8080 --expose-host-ports 8080

# Multiple literal partial names are comma-separated. If no Service matches,
# the runner falls back to matching Pod names and their declared container ports.
node bin run expose mongo,valkey --dev --kind --namespace default

# Two matched Services consume ports by the same index:
# mongo -> 27017:27017, valkey -> 6379:6379
node bin run expose mongo,valkey --dev --kind \
  --expose-container-ports 27017,6379 --expose-host-ports 27017,6379

# In another terminal, access the service
curl http://localhost:8080
```

---

## Troubleshooting

### Common Issues

#### Manifests Not Generated

**Problem:** `deployment.yaml` or `proxy.yaml` files missing.

**Solution:**

```bash
# Ensure --build-manifest flag is used
node bin deploy dd-app development --build-manifest

# Check manifest directory
ls -la manifests/deployment/dd-app-development/
```

#### Deployment Fails to Apply

**Problem:** kubectl apply errors.

**Solution:**

```bash
# Check kubectl access
kubectl get nodes

# Verify namespace exists
kubectl get namespaces

# Check for resource conflicts
kubectl get all -n default

# Review deployment YAML for errors
cat manifests/deployment/dd-app-development/deployment.yaml
```

#### Pods Not Starting

**Problem:** Pods stuck in pending or error state.

**Solution:**

```bash
# Check pod status
kubectl get pods -n default

# View pod details
kubectl describe pod <pod-name> -n default

# Check pod logs
kubectl logs <pod-name> -n default

# Verify image exists and is accessible
docker pull <image-name>
```

#### HTTPProxy Not Working

**Problem:** Ingress not routing traffic.

**Solution:**

```bash
# Verify Contour is running
kubectl get pods -n projectcontour

# Check HTTPProxy status
kubectl get httpproxy -n default
kubectl describe httpproxy <host> -n default

# Verify DNS or /etc/hosts configuration
cat /etc/hosts
```

#### Certificate Issues

**Problem:** TLS certificates not created.

**Solution:**

```bash
# Ensure cert-manager is installed (production)
kubectl get pods -n cert-manager

# Check certificate status
kubectl get certificate -n default
kubectl describe certificate <host> -n default

# Verify cert flag is used in production
node bin deploy dd-app production --cert --build-manifest
```

#### Volume Mount Failures

**Problem:** Persistent volumes not mounting.

**Solution:**

```bash
# Check PVC status
kubectl get pvc -n default

# Check PV status
kubectl get pv

# Verify volume directory exists on node
# For Kind: check Kind container
# For Kubeadm: check host filesystem
ls -la /home/dd/engine/volume/
```

### Debug Commands

```bash
# View router configuration
node bin deploy dd-app development --info-router

# Check production deployment status
node bin run status dd-app --namespace default --kubeadm

# Check development status (`dd` expands engine-private/deploy/dd.router)
node bin run status dd --dev --namespace default --kind

# View all resources for deployment
kubectl get all -l app=dd-app -n default

# Check events for errors
kubectl get events -n default --sort-by='.lastTimestamp'
```

### Verification Steps

After deployment, verify:

```bash
# 1. Pods are running
kubectl get pods -n default

# 2. Services are created
kubectl get svc -n default

# 3. HTTPProxy is configured
kubectl get httpproxy -n default

# 4. Ingress is accessible (if applicable)
curl -H "Host: <your-host>" http://<cluster-ip>

# 5. Check logs for errors
kubectl logs -l app=dd-app -n default --tail=50
```
