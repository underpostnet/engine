# LXD Management

Minimalist reference for managing LXD virtual machines as K3s Kubernetes nodes using the Underpost CLI.

---

## Table of Contents

1. [Command](#command)
2. [Quick Start](#quick-start)
3. [Host Setup](#host-setup)
4. [Virtual Machine Lifecycle](#virtual-machine-lifecycle)
5. [K3s Node Initialization](#k3s-node-initialization)
6. [Networking](#networking)
7. [Workflows](#workflows)
8. [Options Reference](#options-reference)

---

## Command

```bash
underpost lxd [options]
node bin run lxd [options]    # dev mode (--dev)
```

---

## Quick Start

```bash
# 1. Install LXD and initialize
underpost lxd --install
underpost lxd --init

# 2. Create virtual network and admin profile
underpost lxd --create-virtual-network
underpost lxd --create-admin-profile

# 3. Create and initialize a control plane VM
underpost lxd --create-vm k3s-control
underpost lxd --init-vm k3s-control --control

# 4. Create and join a worker VM
underpost lxd --create-vm k3s-worker
underpost lxd --init-vm k3s-worker --worker --join-node k3s-control

# 5. Expose ports from control plane
underpost lxd --expose k3s-control:80,443
```

---

## Host Setup

### Install LXD

```bash
underpost lxd --install
```

Installs the LXD snap package on the host machine.

### Initialize LXD

```bash
underpost lxd --init
```

Initializes LXD using a preseed configuration, setting up storage pools and default settings.

### Reset LXD

```bash
underpost lxd --reset
```

Removes the LXD snap and purges all data. **Warning:** This deletes all VMs and storage.

### Create Virtual Network

```bash
underpost lxd --create-virtual-network
underpost lxd --create-virtual-network --ipv4-address 10.250.250.1/24
```

Creates the `lxdbr0` bridge network used by VMs. The default IPv4 CIDR is `10.250.250.1/24`.

### Create Admin Profile

```bash
underpost lxd --create-admin-profile
```

Creates the `admin-profile` LXC profile used for VM management, with appropriate resource limits and device mappings.

---

## Virtual Machine Lifecycle

### Create VM

```bash
underpost lxd --create-vm k3s-control
underpost lxd --create-vm k3s-worker --root-size 64
```

Copies the LXC launch command for a new VM to the clipboard. Use `--root-size <gb>` to set the root disk size in GiB (default: 32).

### Delete VM

```bash
underpost lxd --delete-vm k3s-worker
```

Stops and deletes the specified VM.

### VM Info

```bash
underpost lxd --info-vm k3s-control
```

Displays full configuration and status for the specified VM.

### Test VM

```bash
underpost lxd --test k3s-control
```

Runs connectivity and health checks on the specified VM.

---

## K3s Node Initialization

### Control Plane Node

```bash
underpost lxd --init-vm k3s-control --control
```

Runs `k3s-node-setup.sh` on the specified VM and initializes it as a K3s control plane node.

### Worker Node

```bash
underpost lxd --init-vm k3s-worker --worker
underpost lxd --init-vm k3s-worker --worker --join-node k3s-control
```

Initializes the VM as a K3s worker node. When `--join-node` specifies the control node name, the worker automatically joins the control plane.

### Join Existing Worker

```bash
underpost lxd --join-node k3s-worker,k3s-control
```

Standalone format: join a named worker to a named control plane.

---

## Networking

### Expose Ports

```bash
underpost lxd --expose k3s-control:80,443
underpost lxd --expose k3s-control:6443
```

Proxies host ports to the specified VM. Useful for exposing HTTP/HTTPS and the K3s API server.

### Remove Exposed Ports

```bash
underpost lxd --delete-expose k3s-control:80,443
```

Removes previously proxied ports from a VM.

---

## Workflows

### Execute Workflow

```bash
underpost lxd --workflow-id my-workflow --vm-id k3s-control
underpost lxd --workflow-id my-workflow --vm-id k3s-worker --deploy-id dd-core --namespace production
```

Runs a named workflow on the target VM with optional deploy ID and namespace context.

---

## Options Reference

| Option                       | Description                                                                         | Default           |
| ---------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| `--init`                     | Initialize LXD via preseed                                                          | -                 |
| `--reset`                    | Remove LXD snap and purge all data                                                  | -                 |
| `--install`                  | Install the LXD snap                                                                | -                 |
| `--dev`                      | Use local paths instead of global npm installation                                  | -                 |
| `--create-virtual-network`   | Create the `lxdbr0` bridge network                                                  | -                 |
| `--ipv4-address <cidr>`      | IPv4 address/CIDR for the bridge network                                            | `10.250.250.1/24` |
| `--create-admin-profile`     | Create the `admin-profile` for VM management                                        | -                 |
| `--control`                  | Initialize target VM as K3s control plane node                                      | -                 |
| `--worker`                   | Initialize target VM as K3s worker node                                             | -                 |
| `--create-vm <vm-name>`      | Copy LXC launch command for a new VM to clipboard                                   | -                 |
| `--delete-vm <vm-name>`      | Stop and delete the specified VM                                                    | -                 |
| `--init-vm <vm-name>`        | Run k3s-node-setup.sh on the VM (use with `--control` or `--worker`)                | -                 |
| `--info-vm <vm-name>`        | Display full VM configuration and status                                            | -                 |
| `--test <vm-name>`           | Run connectivity and health checks                                                  | -                 |
| `--root-size <gb>`           | Root disk size in GiB for `--create-vm`                                             | `32`              |
| `--join-node <nodes>`        | Join K3s worker to control plane. Formats: `workerName,controlName` or control name | -                 |
| `--expose <vm-name:ports>`   | Proxy host ports to VM (e.g., `k3s-control:80,443`)                                 | -                 |
| `--delete-expose <vm:ports>` | Remove proxied ports from VM                                                        | -                 |
| `--workflow-id <id>`         | Workflow ID to execute                                                              | -                 |
| `--vm-id <vm-name>`          | Target VM name for workflow execution                                               | -                 |
| `--deploy-id <deploy-id>`    | Deployment ID context for workflow execution                                        | -                 |
| `--namespace <namespace>`    | Kubernetes namespace context                                                        | `default`         |
