# Baremetal Management

Minimalist reference for managing bare metal server operations using the Underpost CLI, including PXE/iPXE network booting, machine commissioning, NFS root filesystem provisioning, cloud-init configuration, and Packer image building.

---

## Table of Contents

1. [Command](#command)
2. [Quick Start](#quick-start)
3. [Control Server](#control-server)
4. [Machine Management](#machine-management)
5. [iPXE Boot](#ipxe-boot)
6. [Cloud-Init](#cloud-init)
7. [NFS Root Filesystem](#nfs-root-filesystem)
8. [Packer Image Building](#packer-image-building)
9. [Chroot Tools](#chroot-tools)
10. [Bootstrap HTTP Server](#bootstrap-http-server)
11. [Logs](#logs)
12. [Options Reference](#options-reference)

---

## Command

```bash
underpost baremetal [workflow-id] [options]
node bin baremetal [workflow-id] [options]    # dev mode (--dev)
```

| Argument      | Description                                 |
| ------------- | ------------------------------------------- |
| `workflow-id` | Optional: The workflow ID for the operation |

---

## Quick Start

```bash
# 1. Install and configure the control server
underpost baremetal --control-server-install --ip-address 192.168.1.10
underpost baremetal --control-server-db-install

# 2. Create a machine entry
underpost baremetal --create-machine --mac hardware --hostname my-server --ip-config 192.168.1.20

# 3. Commission the machine via iPXE boot
underpost baremetal my-workflow --commission --ipxe

# 4. List resources
underpost baremetal --ls
```

---

## Control Server

### Install

```bash
underpost baremetal --control-server-install --ip-address 192.168.1.10
underpost baremetal --control-server-install --ip-address 192.168.1.10 --ip-file-server 192.168.1.10
```

Installs the baremetal control server (DHCP, TFTP, HTTP services) on the specified IP address.

### Uninstall

```bash
underpost baremetal --control-server-uninstall
```

### Restart

```bash
underpost baremetal --control-server-restart
```

### Database Setup

```bash
underpost baremetal --control-server-db-install
underpost baremetal --control-server-db-uninstall
```

Installs or uninstalls the database backend for machine inventory and workflow tracking.

---

## Machine Management

### Create Machine Entry

```bash
underpost baremetal --create-machine --mac hardware --hostname my-server
underpost baremetal --create-machine --mac random --hostname test-server
underpost baremetal --create-machine --mac AA:BB:CC:DD:EE:FF --hostname prod-server --ip-config 192.168.1.20
```

Creates a new baremetal machine entry in the database.

| MAC Option  | Description                                   |
| ----------- | --------------------------------------------- |
| `hardware`  | Use device's actual MAC address (no spoofing) |
| `random`    | Generate a random MAC address                 |
| `<address>` | Specify a MAC address directly                |

### Remove Machines

```bash
underpost baremetal --remove-machines system-id-1,system-id-2
underpost baremetal --remove-machines all
```

Removes machines by comma-separated system IDs, or `all` to remove all machines.

### Clear Discovered Machines

```bash
underpost baremetal --clear-discovered
```

Clears all automatically discovered machines from the database.

### List Resources

```bash
underpost baremetal --ls
```

Lists available boot resources and registered machines.

---

## iPXE Boot

### Commission with iPXE

```bash
underpost baremetal my-workflow --commission --ipxe
underpost baremetal my-workflow --commission --ipxe --iso-url http://mirror.example.com/rocky.iso
```

Chainloads iPXE to normalize machine identity before commissioning. This ensures consistent network boot behavior across different NIC firmware.

### Rebuild iPXE Binary

```bash
underpost baremetal --ipxe-rebuild
```

Forces a rebuild of the iPXE binary with the embedded boot script.

### Build iPXE ISO

```bash
underpost baremetal --ipxe-build-iso /path/to/output.iso my-workflow
```

Builds a standalone iPXE ISO with an embedded script for the specified workflow ID. Useful for machines that cannot PXE boot from the network.

---

## Cloud-Init

### Configure Cloud-Init

```bash
underpost baremetal --cloud-init --hostname my-server
```

Sets kernel parameters and configures the necessary seed users on the HTTP server for cloud-init provisioning.

### Update Cloud-Init

```bash
underpost baremetal my-workflow --cloud-init-update
```

Updates cloud-init configuration for the specified workflow ID and architecture.

### Boot and Run Commands

```bash
underpost baremetal --cloud-init --bootcmd "cmd1,cmd2,cmd3"
underpost baremetal --cloud-init --runcmd "cmd1,cmd2"
```

Inject custom boot-time and run-time commands into the cloud-init configuration.

---

## NFS Root Filesystem

### Build NFS Root

```bash
underpost baremetal my-workflow --nfs-build
```

Builds an NFS root filesystem for the workflow's target architecture using QEMU emulation.

### Mount / Unmount

```bash
underpost baremetal my-workflow --nfs-mount
underpost baremetal my-workflow --nfs-unmount
```

### Build NFS Server

```bash
underpost baremetal my-workflow --nfs-build-server
```

Builds and configures the NFS server for the target architecture.

### Reset NFS Server

```bash
underpost baremetal my-workflow --nfs-reset
```

Resets the NFS server completely, closing all connections before reloading exports.

### QEMU Shell Access

```bash
underpost baremetal my-workflow --nfs-sh
```

Copies the QEMU emulation root entrypoint shell command to the clipboard for interactive debugging.

---

## Packer Image Building

### Install Packer

```bash
underpost baremetal --install-packer
```

### Create Image Template

```bash
underpost baremetal my-workflow --packer-maas-image-template /path/to/template
```

Creates a new image folder from a canonical/packer-maas template path for the specified workflow ID.

### Build Image

```bash
underpost baremetal --packer-maas-image-build --packer-workflow-id my-workflow
underpost baremetal --packer-maas-image-build --packer-workflow-id my-workflow --packer-maas-image-cached
```

Builds a MAAS-compatible image using Packer. Use `--packer-maas-image-cached` to continue from the last build without removing artifacts.

### Upload Image

```bash
underpost baremetal --packer-maas-image-upload --packer-workflow-id my-workflow
```

Uploads an already-built image artifact without rebuilding.

---

## Chroot Tools

### Ubuntu Tools

```bash
underpost baremetal --ubuntu-tools-build
underpost baremetal --ubuntu-tools-test
```

Builds and tests Ubuntu tools in a chroot environment.

### Rocky Linux Tools

```bash
underpost baremetal --rocky-tools-build
underpost baremetal --rocky-tools-test
```

Builds and tests Rocky Linux tools in a chroot environment.

---

## Bootstrap HTTP Server

```bash
underpost baremetal --bootstrap-http-server-run
underpost baremetal --bootstrap-http-server-run --bootstrap-http-server-path /custom/path --bootstrap-http-server-port 9090
```

Runs a temporary HTTP server for serving iPXE scripts, ISO images, or other boot resources during commissioning.

---

## Logs

```bash
underpost baremetal --logs dhcp
underpost baremetal --logs dhcp-lease
underpost baremetal --logs dhcp-lan
underpost baremetal --logs cloud-init
underpost baremetal --logs cloud-init-machine
underpost baremetal --logs cloud-init-config
```

| Log ID               | Description                   |
| -------------------- | ----------------------------- |
| `dhcp`               | DHCP server logs              |
| `dhcp-lease`         | DHCP lease information        |
| `dhcp-lan`           | DHCP LAN traffic logs         |
| `cloud-init`         | Cloud-init general logs       |
| `cloud-init-machine` | Cloud-init per-machine logs   |
| `cloud-init-config`  | Cloud-init configuration logs |

---

## Options Reference

### Network & Identity

| Option                    | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `--ip-address <ip>`       | IP address of the control server or local machine        |
| `--hostname <hostname>`   | Hostname of the target machine                           |
| `--ip-file-server <ip>`   | IP address of the file server (NFS/TFTP)                 |
| `--ip-config <ip-config>` | IP configuration string for the machine                  |
| `--netmask <netmask>`     | Netmask of network                                       |
| `--dns-server <dns>`      | DNS server IP address                                    |
| `--mac <mac>`             | MAC address: `random`, `hardware`, or a specific address |

### Control Server

| Option                          | Description                           |
| ------------------------------- | ------------------------------------- |
| `--control-server-install`      | Install the baremetal control server  |
| `--control-server-uninstall`    | Uninstall the control server          |
| `--control-server-restart`      | Restart the control server            |
| `--control-server-db-install`   | Install the control server database   |
| `--control-server-db-uninstall` | Uninstall the control server database |

### Machine Operations

| Option                    | Description                            |
| ------------------------- | -------------------------------------- |
| `--create-machine`        | Create a new machine entry             |
| `--remove-machines <ids>` | Remove machines by system IDs or `all` |
| `--clear-discovered`      | Clear all discovered machines          |
| `--commission`            | Commission a physical machine          |
| `--ls`                    | List boot resources and machines       |

### iPXE & Boot

| Option                        | Description                         |
| ----------------------------- | ----------------------------------- |
| `--ipxe`                      | Chainload iPXE before commissioning |
| `--ipxe-rebuild`              | Force rebuild of iPXE binary        |
| `--ipxe-build-iso <iso-path>` | Build standalone iPXE ISO           |
| `--iso-url <url>`             | Custom ISO URL for commissioning    |
| `--bootcmd <cmds>`            | Comma-separated boot commands       |
| `--runcmd <cmds>`             | Comma-separated run commands        |

### Cloud-Init & NFS

| Option                | Description                                   |
| --------------------- | --------------------------------------------- |
| `--cloud-init`        | Set kernel parameters and seed users          |
| `--cloud-init-update` | Update cloud-init for a workflow architecture |
| `--nfs-build`         | Build NFS root filesystem via QEMU            |
| `--nfs-mount`         | Mount NFS root filesystem                     |
| `--nfs-unmount`       | Unmount NFS root filesystem                   |
| `--nfs-build-server`  | Build NFS server for architecture             |
| `--nfs-reset`         | Reset NFS server and reload exports           |
| `--nfs-sh`            | Copy QEMU root shell command to clipboard     |

### Packer Images

| Option                                | Description                                    |
| ------------------------------------- | ---------------------------------------------- |
| `--install-packer`                    | Install Packer CLI                             |
| `--packer-maas-image-template <path>` | Create image folder from packer-maas template  |
| `--packer-workflow-id <id>`           | Workflow ID for Packer operations              |
| `--packer-maas-image-build`           | Build MAAS image using Packer                  |
| `--packer-maas-image-upload`          | Upload existing image artifact                 |
| `--packer-maas-image-cached`          | Continue last build without removing artifacts |

### HTTP Server & Tools

| Option                                | Description                         |
| ------------------------------------- | ----------------------------------- |
| `--bootstrap-http-server-run`         | Run temporary bootstrap HTTP server |
| `--bootstrap-http-server-path <path>` | Custom HTTP server root path        |
| `--bootstrap-http-server-port <port>` | Custom HTTP server port             |
| `--ubuntu-tools-build`                | Build Ubuntu chroot tools           |
| `--ubuntu-tools-test`                 | Test Ubuntu chroot tools            |
| `--rocky-tools-build`                 | Build Rocky Linux chroot tools      |
| `--rocky-tools-test`                  | Test Rocky Linux chroot tools       |

### General

| Option        | Description             |
| ------------- | ----------------------- |
| `--dev`       | Development mode        |
| `--logs <id>` | Display logs for log ID |
