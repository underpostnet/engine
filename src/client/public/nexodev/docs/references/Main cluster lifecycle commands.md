# Main Cluster Lifecycle Commands

This guide provides detailed information on using the main cluster lifecycle commands available in the Underpost engine. These commands help manage cluster deployment, configuration, and maintenance operations.

## Table of Contents

1. [cluster-build](#cluster-build)
2. [template-deploy](#template-deploy)
3. [ssh-deploy](#ssh-deploy)
4. [cluster](#cluster)
5. [dd-container](#dd-container)
6. [image](#image)
7. [update-default-conf](#update-default-conf)
8. [promote](#promote)

---

## cluster-build

**Command:** `node bin run cluster-build [path] [options]`

**Description:** Builds the cluster by cleaning, deploying templates, and updating configurations. This is a comprehensive build process that prepares the entire cluster environment.

### Usage
```bash
node bin run cluster-build
node bin run cluster-build cmt
node bin run cluster-build --node-name worker-01
```

### Parameters
- `path` (optional): 
  - `cmt` - Commits changes to both engine and engine-private repositories with build tags

### Options
- `--node-name <name>` - Specify the target node name for deployment

### Process Flow
1. Runs `node bin run clean` to clean the environment
2. Executes sync-replica template-deploy in dev mode
3. Executes sync-replica template-deploy in production mode
4. Runs `node bin env clean` to clean environment variables
5. Updates default configurations for all deployments listed in `./engine-private/deploy/dd.router`
6. If `cmt` path is specified, commits changes to git repositories

---

## template-deploy

**Command:** `node bin run template-deploy [path] [options]`

**Description:** Cleans up, pushes `engine-private` and `engine` repositories with a commit tag for CI package deployment of PWA microservices template.

### Usage
```bash
node bin run template-deploy
node bin run template-deploy --dev
node bin run template-deploy --force
node bin run template-deploy sync-replica --dev
```

### Parameters
- `path` (optional): Additional identifier for the commit message (e.g., `sync-replica`)

### Options
- `--dev` - Use development mode (uses `node bin` instead of `underpost`)
- `--force` - Force push to repositories (adds `-f` flag)

### Process Flow
1. Runs clean command
2. Pushes `engine-private` repository to GitHub
3. Resets git state in `/home/dd/engine`
4. Creates empty commit with CI tag
5. Pushes `engine` repository to GitHub

### Environment Variables
- `GITHUB_USERNAME` - Your GitHub username for repository operations

---

## ssh-deploy

**Command:** `node bin run ssh-deploy <path> [options]`

**Description:** Deploys via SSH by creating a commit and pushing to the engine repository with SSH deployment tags.

### Usage
```bash
node bin run ssh-deploy engine-core
node bin run ssh-deploy sync-engine-core --dev
node bin run ssh-deploy deploy-target --force
```

### Parameters
- `path` (required): Deployment target identifier (e.g., `engine-core`, `sync-engine-core`)

### Options
- `--dev` - Use development mode commands
- `--force` - Force push to repository

### Process Flow
1. Initializes action logging
2. Resets git state
3. Creates empty commit with SSH deployment tag
4. Pushes changes to GitHub repository

---

## cluster

**Command:** `node bin run cluster [path] [options]`

**Description:** Complete cluster initialization and deployment process. Sets up Kubernetes cluster, pulls images, deploys databases, and deploys all services.

### Usage
```bash
node bin run cluster
node bin run cluster lampp,deploy1+deploy2+deploy3
node bin run cluster --dev
node bin run cluster mysql,api+frontend --dev
```

### Parameters
- `path` (optional): Format `<runtime-image>,<deploy-list>`
  - `runtime-image`: Runtime environment (`lampp`, `mysql`, etc.) - defaults to `lampp`
  - `deploy-list`: Plus-separated list of deployment IDs - defaults to contents of `./engine-private/deploy/dd.router`

### Options
- `--dev` - Use development environment
- All standard options from `DEFAULT_OPTION` are available

### Process Flow
1. **Cluster Reset**: Resets the cluster configuration
2. **Kubeadm Setup**: Initializes Kubernetes with kubeadm
3. **Image Pulling**: Pulls base Docker images for specified runtime
4. **Database Deployment**: 
   - Deploys MongoDB
   - Deploys MariaDB (if runtime is `lampp`)
   - Imports database data for each deployment
5. **Cache Deployment**: Deploys Valkey (Redis alternative)
6. **Ingress Setup**: Deploys Contour ingress controller
7. **Certificate Management**: Deploys cert-manager (production only)
8. **Service Deployment**: Deploys all specified services with appropriate configurations

### Environment Differences
- **Development**: Uses `--etc-hosts` flag for local DNS resolution
- **Production**: Uses `--cert` flag for SSL certificate management

---

## dd-container

**Command:** `node bin run dd-container [path] [options]`

**Description:** Creates and manages a development container within the Kubernetes cluster for testing and development purposes.

### Usage
```bash
node bin run dd-container
node bin run dd-container "npm test"
node bin run dd-container --pod-name my-dev-pod
node bin run dd-container --image-name custom-image:latest --dev
```

### Parameters
- `path` (optional): Command to execute inside the container - defaults to `cd /home/dd/engine && npm install && npm run test`

### Options
- `--pod-name <name>` - Custom pod name (default: `underpost-dev-container`)
- `--image-name <name>` - Specific Docker image to use
- `--node-name <name>` - Target specific Kubernetes node
- `--claim-name <name>` - Persistent volume claim name (default: `pvc-dd`)
- `--volume-host-path <path>` - Host path for volume mounting (default: `/home/dd`)
- `--dev` - Use development mode with Kind cluster
- All volume and container options from `DEFAULT_OPTION`

### Process Flow
1. **Image Detection**: Automatically detects current Underpost image if not specified
2. **Volume Setup**: 
   - For Kind: Creates and mounts host directories
   - For Kubeadm: Applies persistent volume claims
3. **Container Creation**: Deploys job pod with specified configuration
4. **Execution**: Runs the provided command or default test sequence

---

## image

**Command:** `node bin image [options]`

**Description:** Pulls required Underpost Dockerfile base images and optionally loads them into Kubernetes clusters.

### Usage
```bash
node bin image --pull-base
node bin image --pull-base --path /home/dd/engine/src/runtime/lampp
node bin image --pull-base --kind --dev
node bin image --pull-base --kubeadm --version 1.2.3
```

### Options
- `--path <path>` - Specific path to Dockerfile directory
- `--kind` - Import pulled images into Kind cluster
- `--kubeadm` - Import pulled images into Kubeadm cluster  
- `--k3s` - Load images into K3s cluster
- `--version <version>` - Set custom version for base images
- `--dev` - Use development mode

### Use Cases
- Preparing cluster with required base images
- Loading images into different cluster types
- Version-specific image management

---

## update-default-conf

**Command:** `node bin/deploy update-default-conf <deploy-id>`

**Description:** Updates the default configuration files for a specific deployment or creates specialized configurations.

### Usage
```bash
node bin/deploy update-default-conf my-deployment
node bin/deploy update-default-conf dd-github-pages
node bin/deploy update-default-conf template
```

### Parameters
- `deploy-id` (required): Deployment identifier or special configuration name

### Special Configurations

#### `dd-github-pages`
Creates configuration for GitHub Pages deployment:
- Host: `{GITHUB_USERNAME}.github.io`
- Path: `/pwa-microservices-template-ghpkg`
- API proxy to `www.nexodev.org`

#### `template`
Creates template configuration for cluster deployment:
- Configures Valkey (Redis) connection to cluster service
- Sets MongoDB connection to cluster service
- Host: `default.net`, Path: `/`

#### Custom Deployment ID
For existing deployments in `./engine-private/conf/{deploy-id}`:
- Loads client, server, and SSR configurations
- Merges with default database and mailer settings
- Removes WordPress-specific configurations
- Creates deployment-specific configuration file

### Process Flow
1. Loads base default configuration
2. Applies deployment-specific modifications
3. Updates `conf.js` or creates `conf.{deploy-id}.js`
4. Formats output with Prettier

### Environment Variables
- `GITHUB_USERNAME` - Required for GitHub Pages configuration

---

## promote

**Command:** `node bin run promote <deploy-config> [options]`

**Description:** Promotes deployments using blue-green deployment strategy by switching traffic between blue and green environments.

### Usage
```bash
node bin run promote my-app,production,2
node bin run promote dd,production,1
node bin run promote api-service
node bin run promote frontend,development
```

### Parameters
- `deploy-config`: Comma-separated configuration string
  - Format: `<deploy-id>,<environment>,<replicas>`
  - `deploy-id`: Deployment identifier or `dd` for all deployments in router
  - `environment`: Target environment (default: `production`)
  - `replicas`: Number of replicas (default: `1`)

### Options
- All standard options from `DEFAULT_OPTION` are available

### Examples

#### Promote Single Deployment
```bash
# Promote 'api' to production with 3 replicas
node bin run promote api,production,3

# Promote 'frontend' to development (default 1 replica)  
node bin run promote frontend,development
```

#### Promote All Deployments
```bash
# Promote all deployments listed in dd.router
node bin run promote dd

# Promote all with specific environment and replicas
node bin run promote dd,production,2
```

### Process Flow
1. **Parse Configuration**: Extracts deployment ID, environment, and replica count
2. **Traffic Detection**: Determines current traffic routing (blue/green)
3. **Traffic Switch**: Switches to opposite environment (blue ↔ green)
4. **Batch Processing**: For `dd` option, processes all deployments in router file

### Blue-Green Deployment
- **Current Traffic**: Automatically detects whether traffic is on blue or green
- **Target Traffic**: Switches to the opposite environment
- **Zero Downtime**: Ensures continuous service during promotion

---

## Common Options Reference

Most commands support these common options through `DEFAULT_OPTION`:

### Cluster Options
- `--dev` - Use development mode
- `--k3s` - Target K3s cluster
- `--kubeadm` - Target Kubeadm cluster
- `--force` - Force operations (bypass confirmations)
- `--reset` - Reset cluster state

### Container Options
- `--pod-name <name>` - Custom pod name
- `--node-name <name>` - Target specific node
- `--image-name <name>` - Specific Docker image
- `--container-name <name>` - Custom container name
- `--namespace <name>` - Kubernetes namespace

### Volume Options
- `--volume-host-path <path>` - Host directory path
- `--volume-mount-path <path>` - Container mount path
- `--claim-name <name>` - PVC name

### Runtime Options
- `--replicas <count>` - Number of replicas
- `--port <number>` - Port configuration
- `--tls` - Enable TLS
- `--host-network` - Use host networking

## Environment Setup

Before using these commands, ensure:

1. **Environment Variables**:
   ```bash
   export GITHUB_USERNAME=your-github-username
   ```

2. **Directory Structure**:
   - `/home/dd/engine` - Main engine directory
   - `./engine-private/` - Private configuration repository
   - `./engine-private/deploy/dd.router` - Deployment router configuration

3. **Cluster Access**:
   - Kubernetes cluster running (Kind/Kubeadm/K3s)
   - `kubectl` configured and accessible
   - Docker available for image operations

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure proper file permissions and Docker access
2. **Cluster Connection**: Verify kubectl context and cluster accessibility  
3. **Missing Dependencies**: Check that all required base images are available
4. **Configuration Errors**: Validate deployment router and configuration files

### Debug Commands
```bash
# Check cluster status
kubectl get nodes
kubectl get pods --all-namespaces

# Verify images
docker images | grep underpost

# Check configuration files
cat ./engine-private/deploy/dd.router
ls -la ./engine-private/conf/
```

For additional support, refer to the other documentation files or check the command implementations in the source code.
