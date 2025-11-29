# Deploy Custom Instance to Kubernetes

## Overview

This guide covers how to deploy custom application instances to Kubernetes using the Underpost CLI. The `run instance` command allows you to deploy containerized applications with custom configurations, manage traffic routing, and perform blue-green deployments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration File Structure](#configuration-file-structure)
- [Core Commands](#core-commands)
- [Deployment Workflow](#deployment-workflow)
- [Advanced Usage](#advanced-usage)
- [Traffic Management](#traffic-management)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Kubernetes cluster (Kind, Kubeadm, or K3s)
- Underpost CLI installed (`npm install -g underpost`)
- Docker or Podman for image management
- Valid configuration file at `./engine-private/conf/<deploy-id>/conf.instances.json`

## Configuration File Structure

Create a configuration file at `./engine-private/conf/<deploy-id>/conf.instances.json`:

```json
[
  {
    "id": "app-instance-1",
    "host": "myapp.example.com",
    "path": "/",
    "image": "underpost/underpost-engine:latest",
    "fromPort": 8080,
    "toPort": 8080,
    "cmd": {
      "development": "npm run dev",
      "production": "npm start"
    },
    "volumes": [
      {
        "volumeMountPath": "/app/data",
        "claimName": "app-data-pvc"
      }
    ],
    "metadata": {
      "description": "Primary application instance"
    }
  }
]
```

### Configuration Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique identifier for the instance |
| `host` | string | Domain name for the instance |
| `path` | string | URL path prefix (default: `/`) |
| `image` | string | Docker image to deploy (optional, defaults to `underpost/underpost-engine`) |
| `fromPort` | number | Container port to expose |
| `toPort` | number | Target port mapping |
| `cmd` | object | Commands for different environments |
| `volumes` | array | Volume mount configurations |
| `metadata` | object | Additional metadata |

## Core Commands

### 1. Deploy Instance

Deploy a custom instance to Kubernetes:

```bash
# Development mode (using Kind cluster)
node bin run --dev instance <deploy-id>,<instance-id>[,<replicas>]

# Production mode (using Kubeadm cluster)
underpost run instance <deploy-id>,<instance-id>[,<replicas>]

# With specific options
underpost run --namespace production --node-name worker-01 instance myapp,app-1,3
```

**Example:**
```bash
# Deploy instance 'api-v1' from 'myapp' deployment with 2 replicas
underpost run instance myapp,api-v1,2
```

### 2. Promote Instance (Blue-Green Deployment)

Switch traffic from one deployment version to another:

```bash
# Development mode
node bin run --dev instance-promote <deploy-id>,<instance-id>

# Production mode with TLS
underpost run --tls --namespace production instance-promote myapp,api-v1
```

**What it does:**
- Detects current traffic routing (blue or green)
- Switches to the alternate version
- Updates HTTPProxy configuration
- Manages TLS certificates if `--tls` is specified

### 3. Get Proxy Configuration

View the current HTTPProxy configuration:

```bash
# View all proxies
underpost run get-proxy

# View specific proxy
underpost run --namespace production get-proxy myapp.example.com
```

### 4. List Deployments

Display all deployments:

```bash
underpost run ls-deployments

# Filter by name
underpost run ls-deployments myapp
```

### 5. List Loaded Images

View images loaded in the cluster:

```bash
# Default node (kind-worker)
underpost run ls-images

# Specific node
underpost run --node-name worker-01 ls-images

# Detailed specification
underpost run ls-images spec
```

## Deployment Workflow

### Complete Deployment Process

```bash
# 1. Pull/build the container image
docker pull underpost/underpost-engine:latest

# Load image into Kind cluster (development)
kind load docker-image underpost/underpost-engine:latest

# Or load into Kubeadm node (production)
underpost run --node-name worker-01 instance myapp,api-v1

# 2. Deploy the instance
underpost run --namespace production instance myapp,api-v1,3

# 3. Verify deployment
underpost run ls-deployments myapp-api-v1

# 4. Expose service with /etc/hosts configuration
underpost run --etc-hosts instance myapp,api-v1

# 5. Test and promote when ready
underpost run --tls instance-promote myapp,api-v1
```

## Advanced Usage

### Deploy with Custom Node

```bash
underpost run --node-name worker-02 instance myapp,api-v1,2
```

### Deploy with TLS/SSL

```bash
underpost run --tls --namespace production instance myapp,api-v1
```

### Deploy with Custom Namespace

```bash
underpost run --namespace staging instance myapp,api-v1
```

### Deploy with /etc/hosts Configuration

Automatically configure local DNS entries for development:

```bash
underpost run --dev --etc-hosts instance myapp,api-v1
```

### Expose Services

Deploy and expose the service simultaneously:

```bash
# Deploy first
underpost run instance myapp,api-v1,2

# Then expose
underpost run --expose instance myapp,api-v1
```

### Using Custom Images

Specify a custom image in your configuration:

```json
{
  "id": "custom-app",
  "image": "localhost/maven-dev-container-app:latest",
  "host": "app.local.dev",
  ...
}
```

Or use the default Underpost engine image:
```json
{
  "id": "custom-app",
  "image": "underpost/underpost-engine:1.0.0",
  ...
}
```

### Volume Configuration

Configure persistent volumes:

```json
{
  "volumes": [
    {
      "volumeMountPath": "/app/data",
      "claimName": "app-data-pvc"
    },
    {
      "volumeMountPath": "/app/config",
      "claimName": "app-config-pvc"
    }
  ]
}
```

## Traffic Management

### Blue-Green Deployment Strategy

The instance deployment uses a blue-green strategy:

1. **Initial Deployment**: Traffic goes to `blue` version
2. **Deploy New Version**: New pods created as `green` version
3. **Promote**: Switch traffic from `blue` to `green`
4. **Rollback**: Switch back to `blue` if needed

```bash
# Deploy initial version (creates 'blue')
underpost run instance myapp,api-v1

# Deploy updated version (creates 'green')
underpost run instance myapp,api-v1

# Promote to green
underpost run instance-promote myapp,api-v1

# Rollback to blue (promote again toggles back)
underpost run instance-promote myapp,api-v1
```

### Traffic Routing

The system automatically:
- Detects current active version (blue/green)
- Creates new pods with alternate version tag
- Updates HTTPProxy to route traffic
- Maintains zero-downtime deployments

## Command Options Reference

### Common Options

| Option | Description |
|--------|-------------|
| `--dev` | Use development mode (Kind cluster) |
| `--namespace <ns>` | Kubernetes namespace (default: `default`) |
| `--node-name <name>` | Deploy to specific node |
| `--tls` | Enable TLS/SSL certificates |
| `--etc-hosts` | Update /etc/hosts for local DNS |
| `--expose` | Expose service externally |
| `--replicas <n>` | Number of pod replicas |
| `--force` | Force operation, override warnings |

### Run Command Specific Options

| Option | Description |
|--------|-------------|
| `--pod-name <name>` | Custom pod name |
| `--image-name <image>` | Override image from config |
| `--volume-host-path <path>` | Host path for volume |
| `--volume-mount-path <path>` | Container mount path |
| `--claim-name <name>` | PVC claim name |

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n production | grep myapp

# View logs
kubectl logs -f myapp-api-v1-production-blue-xxxxx -n production
```

### Debug Deployment

```bash
# Check deployment details
kubectl describe deployment myapp-api-v1-production-blue -n production

# Check service
kubectl get svc myapp-api-v1-production-blue-service -n production

# Check HTTPProxy
underpost run get-proxy myapp.example.com
```

### Image Not Found

```bash
# List loaded images
underpost run --node-name worker-01 ls-images

# Load image manually
kind load docker-image my-custom-image:latest

# Or for Kubeadm
docker save my-custom-image:latest -o /tmp/image.tar
scp /tmp/image.tar worker-01:/tmp/
ssh worker-01 'sudo crictl load -i /tmp/image.tar'
```

### Configuration Errors

```bash
# Validate JSON configuration
cat ./engine-private/conf/myapp/conf.instances.json | jq .

# Check for required fields
jq '.[].id' ./engine-private/conf/myapp/conf.instances.json
```

### Network Issues

```bash
# Test /etc/hosts configuration
underpost run dev-hosts-expose myapp

# Restore original /etc/hosts
underpost run dev-hosts-restore
```

### Pod Not Starting

```bash
# Check events
kubectl get events -n production --sort-by='.lastTimestamp'

# Describe pod
kubectl describe pod <pod-name> -n production

# Check resource constraints
kubectl top pods -n production
```

## Related Commands

### Development Cluster Setup

```bash
# Setup complete dev cluster
underpost run --dev dev-cluster

# With service exposure
underpost run --dev --expose dev-cluster
```

### Deploy Job (One-off Tasks)

```bash
# Run one-time job
underpost run deploy-job '' --pod-name my-job --args "echo Hello,date"
```

### Container Development

```bash
# Start development container
underpost run --dev dd-container
```

### Cleanup

```bash
# Remove deployment
kubectl delete deployment myapp-api-v1-production-blue -n production

# Remove service
kubectl delete svc myapp-api-v1-production-blue-service -n production

# Remove HTTPProxy
kubectl delete HTTPProxy myapp.example.com -n production
```

## Example: Complete Custom Instance Deployment

### 1. Create Configuration

**File:** `./engine-private/conf/mywebapp/conf.instances.json`

```json
[
  {
    "id": "frontend",
    "host": "app.mycompany.com",
    "path": "/",
    "image": "mycompany/webapp-frontend:v1.2.0",
    "fromPort": 3000,
    "toPort": 3000,
    "cmd": {
      "development": "npm run dev",
      "production": "node server.js"
    },
    "volumes": [
      {
        "volumeMountPath": "/app/uploads",
        "claimName": "webapp-uploads-pvc"
      }
    ],
    "metadata": {
      "team": "frontend",
      "version": "1.2.0"
    }
  },
  {
    "id": "api",
    "host": "api.mycompany.com",
    "path": "/api",
    "image": "mycompany/webapp-api:v2.1.0",
    "fromPort": 8080,
    "toPort": 8080,
    "cmd": {
      "development": "npm run dev",
      "production": "node dist/main.js"
    },
    "volumes": [],
    "metadata": {
      "team": "backend",
      "version": "2.1.0"
    }
  }
]
```

### 2. Deploy Instances

```bash
# Deploy frontend
underpost run --namespace production instance mywebapp,frontend,3

# Deploy API
underpost run --namespace production instance mywebapp,api,5
```

### 3. Configure TLS

```bash
# Promote with TLS certificates
underpost run --tls --namespace production instance-promote mywebapp,frontend
underpost run --tls --namespace production instance-promote mywebapp,api
```

### 4. Verify

```bash
# Check deployments
underpost run ls-deployments mywebapp

# Check proxies
underpost run get-proxy app.mycompany.com
underpost run get-proxy api.mycompany.com

# Test endpoints
curl https://app.mycompany.com
curl https://api.mycompany.com/api/health
```

## Best Practices

1. **Version Control**: Keep configuration files in version control
2. **Image Tags**: Use specific image tags, avoid `latest` in production
3. **Resource Limits**: Define resource requests/limits in deployments
4. **Health Checks**: Implement readiness and liveness probes
5. **Secrets**: Use Kubernetes secrets for sensitive data
6. **Namespaces**: Separate environments using namespaces
7. **Monitoring**: Set up logging and monitoring for instances
8. **Blue-Green**: Always test new versions before promoting
9. **Backups**: Maintain backups of persistent volumes
10. **Documentation**: Document instance configurations and deployment procedures

<!--
## See Also

- [Cluster Management](./cluster-management.md)
- [Deploy Command Reference](./deploy-reference.md)
- [Volume Management](./volume-management.md)
- [SSL/TLS Configuration](./tls-configuration.md)
-->
