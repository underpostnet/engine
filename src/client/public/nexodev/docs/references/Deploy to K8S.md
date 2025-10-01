# Guide: Creating and Deploying a New Service to Kubernetes

This guide walks you through the process of creating a new deployment ID with cluster-specific files and deploying its development version to a Kubernetes cluster using the `underpost` CLI.

## Prerequisites

1.  `underpost` CLI is installed globally.
2.  You have a running Kubernetes cluster (`kind`, `kubeadm`, `k3s`, etc.).
3.  Your `kubectl` is configured to connect to the cluster.
4.  The Underpost cluster components (like Contour for ingress) are set up. You can do this with `underpost cluster --contour`.

## Step 1: Create a New Deployment ID with Cluster Files

First, we'll create a new deployment ID. This will generate the necessary configuration files, including Kubernetes manifests for the cluster.

Let's say we want to create a new service called `my-new-service`.

Run the following command:

```bash
underpost new --deploy-id --cluster my-new-service
```

### What this command does:

- `underpost new my-new-service`: Specifies the name of our new deployment.
- `--deploy-id`: This flag tells `underpost` to create a new set of configuration files for a deployment ID, rather than a full project structure. It will create a directory under `engine-private/conf/dd-my-new-service`.
- `--cluster`: This is the key option for Kubernetes. It:
  - Creates Kubernetes-related files (like CI/CD workflows).
  - Adds the new deployment ID (`dd-my-new-service`) to the router list in `engine-private/deploy/dd.router`.
  - Runs a synchronization process to prepare the cluster configurations.

After this command completes, you will have a new configuration set for `dd-my-new-service` ready for deployment.

## Step 2: Build Kubernetes Manifests

Before deploying, you need to generate the Kubernetes YAML manifests (Deployment, Service, HTTPProxy, etc.) for your new service.

```bash
underpost deploy --build-manifest dd-my-new-service development
```

- `underpost deploy dd-my-new-service`: Specifies the deployment to act on.
- `development`: Specifies the environment. Manifests will be generated for the development environment.
- `--build-manifest`: This flag triggers the creation of `deployment.yaml` and `proxy.yaml` inside `manifests/deployment/dd-my-new-service-development/`.

## Step 3: Deploy to Kubernetes

Now that the manifests are ready, you can apply them to your Kubernetes cluster.

```bash
underpost deploy dd-my-new-service development
```

This command will:

- Apply the `deployment.yaml` to create the Deployment and Service for `dd-my-new-service`.
- Apply the `proxy.yaml` to create the `HTTPProxy` ingress resource, making your service accessible through the cluster's ingress controller.

Your new service is now deployed to the Kubernetes cluster in the `development` environment. You can verify its status using `kubectl get pods,svc,httpproxy`.
