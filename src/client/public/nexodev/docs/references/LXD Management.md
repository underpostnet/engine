# LXD Management

Minimalist reference for managing LXD virtual machines as K3s Kubernetes nodes using the Underpost CLI.

---

## Table of Contents

1. [Command](#command)
2. [Quick Start](#quick-start)
3. [Host Setup](#host-setup)
4. [Virtual Machine Lifecycle](#virtual-machine-lifecycle)
5. [K3s Node Initialization](#k3s-node-initialization)
6. [Engine Bootstrap](#engine-bootstrap)
7. [Networking](#networking)
8. [Options Reference](#options-reference)

---

## Command

```bash
underpost lxd [options]
node bin lxd [options]    # dev mode (--dev)
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

# 4. Optionally replicate engine source into the VM
underpost lxd --bootstrap-engine k3s-control

# 5. Create and join a worker VM
underpost lxd --create-vm k3s-worker
underpost lxd --init-vm k3s-worker --worker --join-node k3s-control

# 6. Expose ports from control plane
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

### Reset LXD (Safe, Complete Teardown)

```bash
underpost lxd --reset
```

Performs a complete, safe 5-phase teardown:

1. **Phase 1**: Enumerate all VMs and remove proxy devices (prevents LXD crash from stale iptables NAT rules)
2. **Phase 2**: Gracefully stop all VMs
3. **Phase 3**: Delete all VMs
4. **Phase 4**: Remove admin-profile and lxdbr0 bridge network
5. **Phase 5**: Stop LXD snap daemon and purge the snap completely

Safe to re-run if already clean (idempotent).

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

### Delete VM (Safe)

```bash
underpost lxd --delete-vm k3s-worker
```

Safely stops and deletes the specified VM. Before stopping, it:

1. Enumerates and removes all proxy devices attached to the VM
2. Stops the VM with a 30-second timeout
3. Deletes the VM

Safe to re-run if the VM is already gone (idempotent). Proxy device removal prevents LXD crashes from stale iptables NAT rules.

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

Runs OS base setup and `k3s-node-setup.sh` on the specified VM, then initializes it as a K3s control plane node.

**Note**: Engine source replication is no longer part of init. Use `--bootstrap-engine` as a separate step after init completes.

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

## Engine Bootstrap

### Replicate Engine Source into VM

```bash
underpost lxd --bootstrap-engine k3s-control
```

Replicates `/home/dd/engine` (and `engine-private` if present) from the host into the target VM.

This replaces the old `--workflow-id engine` path. Engine replication is a clean, explicit step that is decoupled from VM initialization. Run it after `--init-vm` completes.

---

## Networking

### Expose Ports

```bash
underpost lxd --expose k3s-control:80,443
underpost lxd --expose k3s-control:6443
```

Proxies host ports to the specified VM using LXD proxy devices. Useful for exposing HTTP/HTTPS and the K3s API server.

**Important**: Proxy devices are automatically cleaned up by `--delete-vm` and `--reset`. If you manually stop/delete a VM, remove its proxy devices first with `--delete-expose` to prevent LXD crashes or stale iptables NAT rules.

### Remove Exposed Ports

```bash
underpost lxd --delete-expose k3s-control:80,443
```

Removes previously proxied ports from a VM.

---

## Options Reference

| Option                       | Description                                                                                               | Default           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------- |
| `--init`                     | Initialize LXD via preseed                                                                                | -                 |
| `--reset`                    | **Safe 5-phase reset**: remove proxy devices, stop/delete all VMs, profiles, network, then purge LXD snap | -                 |
| `--install`                  | Install the LXD snap                                                                                      | -                 |
| `--dev`                      | Use local paths instead of global npm installation                                                        | -                 |
| `--create-virtual-network`   | Create the `lxdbr0` bridge network                                                                        | -                 |
| `--ipv4-address <cidr>`      | IPv4 address/CIDR for the bridge network                                                                  | `10.250.250.1/24` |
| `--create-admin-profile`     | Create the `admin-profile` for VM management                                                              | -                 |
| `--control`                  | Initialize target VM as K3s control plane node (use with `--init-vm`)                                     | -                 |
| `--worker`                   | Initialize target VM as K3s worker node (use with `--init-vm`)                                            | -                 |
| `--create-vm <vm-name>`      | Copy LXC launch command for a new VM to clipboard                                                         | -                 |
| `--delete-vm <vm-name>`      | **Safely** stop and delete VM (removes proxy devices first). Idempotent.                                  | -                 |
| `--init-vm <vm-name>`        | OS setup + K3s role installation. Engine replication is a separate step.                                  | -                 |
| `--bootstrap-engine <vname>` | Replicate `/home/dd/engine` (and `engine-private`) into the VM after init.                                | -                 |
| `--info-vm <vm-name>`        | Display full VM configuration and status                                                                  | -                 |
| `--test <vm-name>`           | Run connectivity and health checks                                                                        | -                 |
| `--root-size <gb>`           | Root disk size in GiB for `--create-vm`                                                                   | `32`              |
| `--join-node <nodes>`        | Join K3s worker to control plane. Formats: `workerName,controlName` or control name                       | -                 |
| `--expose <vm-name:ports>`   | Proxy host ports to VM (e.g., `k3s-control:80,443`)                                                       | -                 |
| `--delete-expose <vm:ports>` | Remove proxied ports from VM                                                                              | -                 |
