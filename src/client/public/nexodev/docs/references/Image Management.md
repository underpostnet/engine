# Image Management Guide

## Overview

The Underpost Image CLI provides comprehensive Docker/Podman image management for Kubernetes deployments. This guide covers building custom images, pulling base images from Docker Hub, loading images into different cluster types (Kind, Kubeadm, K3s), and managing container images across your Kubernetes infrastructure.

## Table of Contents

- [Quick Start](#quick-start)
- [Command Syntax](#command-syntax)
- [Options Reference](#options-reference)
- [Building Images](#building-images)
- [Pulling Base Images](#pulling-base-images)
- [Docker Hub Integration](#docker-hub-integration)
- [Managing Images](#managing-images)
- [Cluster Types](#cluster-types)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Build and Load Image to Kind Cluster

```bash
# Build image and load into Kind cluster
node bin image --build --kind --path ./my-app --image-name my-app:1.0
```

### List Loaded Images

```bash
# List images in Kind cluster
node bin image --ls --kind

# List images in K3s cluster
node bin image --ls --k3s

# List images with detailed specifications
node bin image --ls --kind --spec
```

### Pull and Load Docker Hub Image

```bash
# Pull underpost image to Kind cluster
node bin image --pull-dockerhub underpost --kind

# Pull specific version
node bin image --pull-dockerhub nginx:1.21 --kubeadm
```

---

## Command Syntax

```bash
node bin image [options]
```

---

## Options Reference

### Core Operations

| Option | Description | Example |
|--------|-------------|---------|
| `--build` | Build Docker image using Podman | `--build` |
| `--ls` | List available images in cluster | `--ls` |
| `--rm <image-id>` | Remove specified image | `--rm my-app:1.0` |
| `--pull-base` | Pull base images and build rockylinux9-underpost | `--pull-base` |
| `--pull-dockerhub <image>` | Pull image from Docker Hub | `--pull-dockerhub nginx:latest` |

### Build Options

| Option | Description | Example |
|--------|-------------|---------|
| `--path [path]` | Path to Dockerfile directory | `--path ./my-app` |
| `--image-name [name]` | Custom name for the image | `--image-name my-app:1.0` |
| `--image-path [path]` | Output path for tar archive | `--image-path ./images` |
| `--dockerfile-name [name]` | Custom Dockerfile name | `--dockerfile-name Dockerfile.prod` |
| `--podman-save` | Save image as tar archive | `--podman-save` |
| `--reset` | Build without cache (fresh build) | `--reset` |
| `--secrets` | Include environment secrets in build | `--secrets` |
| `--secrets-path [path]` | Custom path to .env secrets file | `--secrets-path ./.env.prod` |

### Cluster Type Selection

| Option | Description | Example |
|--------|-------------|---------|
| `--kind` | Target Kind cluster | `--kind` |
| `--kubeadm` | Target Kubeadm cluster | `--kubeadm` |
| `--k3s` | Target K3s cluster | `--k3s` |

### Additional Options

| Option | Description | Example |
|--------|-------------|---------|
| `--namespace <name>` | Kubernetes namespace (default: "default") | `--namespace production` |
| `--node-name` | Node name for kubeadm/k3s operations | `--node-name worker-1` |
| `--spec` | Show detailed image specifications | `--spec` |
| `--dev` | Use development mode | `--dev` |

---

## Building Images

### Basic Build

Build a Docker image from the current directory:

```bash
node bin image --build --path . --image-name my-app:latest
```

### Build and Save as Tar

Build and export the image as a tar archive:

```bash
node bin image --build --podman-save --path ./app --image-name my-app:1.0 --image-path ./exports
```

This creates `./exports/my-app_1.0.tar`.

### Build and Load to Kind Cluster

Build and automatically load into Kind cluster:

```bash
node bin image --build --kind --path ./my-app --image-name my-app:latest
```

### Build and Load to Kubeadm Cluster

Build and load into Kubeadm cluster:

```bash
node bin image --build --kubeadm --podman-save --path ./my-app --image-name my-app:1.0
```

### Build and Load to K3s Cluster

Build and load into K3s cluster:

```bash
node bin image --build --k3s --podman-save --path ./my-app --image-name my-app:1.0
```

### Custom Dockerfile

Use a custom-named Dockerfile:

```bash
node bin image --build --dockerfile-name Dockerfile.production --path ./app --image-name my-app:prod
```

### No-Cache Build

Force a fresh build without using cache:

```bash
node bin image --build --reset --path ./my-app --image-name my-app:latest
```

### Build with Secrets

Include environment secrets during the build:

```bash
node bin image --build --secrets --path ./my-app --image-name my-app:1.0
```

With custom secrets path:

```bash
node bin image --build --secrets --secrets-path ./.env.production --path ./my-app --image-name my-app:1.0
```

---

## Pulling Base Images

### Pull Base Rocky Linux Image

Pull the base Rocky Linux 9 image and build the underpost base image:

```bash
# Pull and build for Kind
node bin image --pull-base --kind

# Pull and build for Kubeadm
node bin image --pull-base --kubeadm

# Pull and build for K3s
node bin image --pull-base --k3s
```

### Pull Base with Custom Path

```bash
node bin image --pull-base --kind --path /custom/path
```

### Pull Base with Custom Version

```bash
node bin image --pull-base --kind --version v2.0.1
```

---

## Docker Hub Integration

### Pull Official Underpost Image

Pull the official Underpost engine image:

```bash
# Pull latest version to Kind
node bin image --pull-dockerhub underpost --kind

# Pull to Kubeadm
node bin image --pull-dockerhub underpost --kubeadm

# Pull to K3s
node bin image --pull-dockerhub underpost --k3s
```

### Pull Specific Version

```bash
node bin image --pull-dockerhub underpost --version 1.0.0 --kind
```

### Pull Any Docker Hub Image

Pull any public Docker Hub image:

```bash
# Pull nginx
node bin image --pull-dockerhub nginx:1.21 --kind

# Pull redis
node bin image --pull-dockerhub redis:alpine --kubeadm

# Pull custom image
node bin image --pull-dockerhub myorg/myimage:v1.0 --k3s
```

---

## Managing Images

### List Images

List all images in the cluster:

```bash
# Kind cluster
node bin image --ls --kind

# Kubeadm cluster
node bin image --ls --kubeadm

# K3s cluster
node bin image --ls --k3s
```

### List with Specifications

Show detailed image information:

```bash
node bin image --ls --kind --spec
```

### List from Specific Node

For Kubeadm or K3s clusters, specify the node:

```bash
node bin image --ls --kubeadm --node-name worker-1
```

### List in Custom Namespace

```bash
node bin image --ls --kind --namespace production
```

### Remove Image

Remove a specific image from the cluster:

```bash
# Remove from Kind
node bin image --rm my-app:1.0 --kind

# Remove from Kubeadm
node bin image --rm my-app:1.0 --kubeadm

# Remove from K3s
node bin image --rm my-app:1.0 --k3s
```

---

## Cluster Types

### Kind Cluster

Kind (Kubernetes in Docker) loads images using Docker's image archive:

```bash
# Build and load
node bin image --build --kind --podman-save --path ./app --image-name my-app:1.0

# Pull from Docker Hub
node bin image --pull-dockerhub nginx:latest --kind

# List images
node bin image --ls --kind

# Remove image
node bin image --rm my-app:1.0 --kind
```

**How it works:** Images are loaded into both `kind-control-plane` and `kind-worker` nodes using `kind load image-archive`.

### Kubeadm Cluster

Kubeadm clusters use `crictl` and `ctr` for image management:

```bash
# Build and load
node bin image --build --kubeadm --podman-save --path ./app --image-name my-app:1.0

# Pull from Docker Hub
node bin image --pull-dockerhub nginx:latest --kubeadm

# List images
node bin image --ls --kubeadm

# Remove image
node bin image --rm my-app:1.0 --kubeadm
```

**How it works:** Images are imported using `ctr -n k8s.io images import` and removed with `crictl rmi`.

### K3s Cluster

K3s uses its own container runtime interface:

```bash
# Build and load
node bin image --build --k3s --podman-save --path ./app --image-name my-app:1.0

# Pull from Docker Hub
node bin image --pull-dockerhub redis:alpine --k3s

# List images
node bin image --ls --k3s

# Remove image
node bin image --rm my-app:1.0 --k3s
```

**How it works:** Images are imported using `k3s ctr images import` and removed with `k3s ctr images rm`.

---

## Best Practices

### 1. Use Specific Version Tags

Always tag your images with specific versions:

```bash
node bin image --build --kind --image-name my-app:1.0.0 --path ./app
```

Avoid using `latest` in production environments.

### 2. Save Images as Archives

For reproducibility and backup, save images as tar archives:

```bash
node bin image --build --podman-save --image-path ./image-backups --image-name my-app:1.0.0 --path ./app
```

### 3. Use No-Cache for Clean Builds

When debugging build issues or ensuring fresh dependencies:

```bash
node bin image --build --reset --kind --image-name my-app:debug --path ./app
```

### 4. Organize Images by Environment

Use different tags for different environments:

```bash
# Development
node bin image --build --kind --image-name my-app:dev --path ./app

# Staging
node bin image --build --kind --image-name my-app:staging-1.0 --path ./app

# Production
node bin image --build --kind --image-name my-app:prod-1.0 --path ./app
```

### 5. List Images Before Deployment

Verify images are loaded before deploying:

```bash
node bin image --ls --kind
```

### 6. Clean Up Unused Images

Regularly remove old images to save disk space:

```bash
node bin image --rm old-app:1.0.0 --kind
```

### 7. Use Secrets Safely

When building with secrets, ensure your `.env` file is properly protected:

```bash
# Use secrets with custom path
node bin image --build --secrets --secrets-path ./.env.build --image-name my-app:1.0 --path ./app
```

Never commit `.env` files to version control.

### 8. Verify Cluster Type

Always specify the correct cluster type to avoid loading images to the wrong cluster:

```bash
# Development (Kind)
node bin image --build --kind --image-name my-app:dev --path ./app

# Production (Kubeadm)
node bin image --build --kubeadm --image-name my-app:prod --path ./app
```

---

## Troubleshooting

### Common Issues

#### 1. "Image not found in cluster"

**Problem:** Image isn't available after building.

**Solutions:**
```bash
# Verify image was built correctly
podman images | grep my-app

# Rebuild with verbose output
node bin image --build --kind --podman-save --image-name my-app:1.0 --path ./app

# List images in cluster
node bin image --ls --kind
```

#### 2. "Failed to load image into cluster"

**Problem:** Image load operation failed.

**Solutions:**
```bash
# Ensure cluster is running
kubectl get nodes

# For Kind
docker ps | grep kind

# For K3s
sudo systemctl status k3s

# For Kubeadm
kubectl cluster-info

# Rebuild with fresh tar
node bin image --build --reset --kind --podman-save --image-name my-app:1.0 --path ./app
```

#### 3. "Build failed: Dockerfile not found"

**Problem:** Dockerfile doesn't exist at specified path.

**Solutions:**
```bash
# Verify Dockerfile exists
ls -la ./app/Dockerfile

# Use custom Dockerfile name
node bin image --build --dockerfile-name Dockerfile.custom --path ./app --image-name my-app:1.0

# Check current directory
pwd
```

#### 4. "Permission denied"

**Problem:** Insufficient permissions for Podman or cluster operations.

**Solutions:**
```bash
# Run with sudo if needed (operations already use sudo internally)
# Ensure your user is in docker group (for Kind)
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
```

#### 5. "No space left on device"

**Problem:** Disk is full from image builds.

**Solutions:**
```bash
# Clean up Podman images
podman system prune -a

# Remove unused Docker images (for Kind)
docker image prune -a

# Check disk space
df -h
```

#### 6. "Failed to pull base image"

**Problem:** Cannot pull image from Docker Hub.

**Solutions:**
```bash
# Check internet connection
ping docker.io

# Manually pull base image
sudo podman pull docker.io/library/rockylinux:9

# Try again with specific version
node bin image --pull-dockerhub nginx:1.21 --kind
```

#### 7. "Image has wrong architecture"

**Problem:** Image built for different CPU architecture.

**Solutions:**
```bash
# Verify system architecture
uname -m

# Build for specific platform (modify Dockerfile or use buildah)
# Ensure base images match your system architecture
```

---

## Workflow Examples

### Complete Development Workflow

```bash
# 1. Build development image
node bin image --build --kind --image-name my-app:dev --path ./app

# 2. Verify image is loaded
node bin image --ls --kind

# 3. Deploy to Kubernetes (covered in deployment guides)
# kubectl apply -f deployment.yaml

# 4. After testing, build versioned image
node bin image --build --kind --image-name my-app:1.0.0 --path ./app
```

### Production Deployment Workflow

```bash
# 1. Build production image with no cache
node bin image --build --reset --kubeadm --podman-save --image-name my-app:1.0.0 --path ./app

# 2. Save image archive for backup
node bin image --build --podman-save --image-path ./prod-images --image-name my-app:1.0.0 --path ./app

# 3. Load to production cluster
node bin image --build --kubeadm --podman-save --image-name my-app:1.0.0 --path ./app

# 4. Verify image in cluster
node bin image --ls --kubeadm

# 5. Deploy application
# kubectl apply -f production-deployment.yaml
```

### Multi-Cluster Deployment

```bash
# Build once
node bin image --build --podman-save --image-path ./images --image-name my-app:1.0.0 --path ./app

# Load to Kind (development)
node bin image --build --kind --podman-save --image-name my-app:1.0.0 --path ./app

# Load to K3s (staging)
node bin image --build --k3s --podman-save --image-name my-app:1.0.0 --path ./app

# Load to Kubeadm (production)
node bin image --build --kubeadm --podman-save --image-name my-app:1.0.0 --path ./app
```

---

## Quick Reference

### Essential Commands

```bash
# Build and load to Kind
node bin image --build --kind --image-name my-app:1.0 --path ./app

# Pull from Docker Hub
node bin image --pull-dockerhub nginx:latest --kind

# List images
node bin image --ls --kind

# Remove image
node bin image --rm my-app:1.0 --kind

# Pull base images
node bin image --pull-base --kind
```

### Build Options Quick Reference

```bash
# Basic build
--build --path ./app --image-name my-app:1.0

# With cluster load
--build --kind --path ./app --image-name my-app:1.0

# Save as archive
--build --podman-save --image-path ./exports --path ./app --image-name my-app:1.0

# Fresh build
--build --reset --kind --path ./app --image-name my-app:1.0

# With secrets
--build --secrets --kind --path ./app --image-name my-app:1.0

# Custom Dockerfile
--build --dockerfile-name Dockerfile.prod --kind --path ./app --image-name my-app:1.0
```

### Cluster Type Quick Reference

```bash
# Kind
--kind

# Kubeadm
--kubeadm

# K3s
--k3s
```

---

## Summary

The Underpost Image CLI provides a unified interface for managing Docker/Podman images across different Kubernetes cluster types. Key capabilities include:

- **Build custom images** with Podman
- **Pull images** from Docker Hub
- **Load images** into Kind, Kubeadm, or K3s clusters
- **List and manage** images across clusters
- **Save images** as tar archives for backup and distribution

For deployment workflows and Kubernetes integration, refer to the [Deploy to K8S Guide](./Deploy%20to%20K8S.md).