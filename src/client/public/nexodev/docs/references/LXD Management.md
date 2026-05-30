# LXD Management

Minimalist reference for managing LXD virtual machines as K3s Kubernetes nodes using the Underpost CLI.

---

## Table of Contents

1. [Command](#command)
2. [Quick Start](#quick-start)
3. [Host Safety](#host-safety)
4. [Host Setup](#host-setup)
5. [Virtual Machine Lifecycle](#virtual-machine-lifecycle)
6. [K3s Node Initialization](#k3s-node-initialization)
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

# 3. Create and initialize a control plane VM. --vm-init does OS base setup,
#    mirrors /home/dd/engine into the VM, and installs the K3s role in one step.
underpost lxd k3s-control --vm-create
underpost lxd k3s-control --vm-init --control

# 4. Create and join a worker VM (engine mirror is automatic here too).
underpost lxd k3s-worker --vm-create
underpost lxd k3s-worker --vm-init --worker --join-node k3s-control

# 5. Expose ports from control plane
underpost lxd --expose k3s-control:80,443

# 6. BEFORE any host reboot/poweroff: gracefully stop VMs and the LXD daemon.
underpost lxd --shutdown
```

---

## Host Safety

This section documents the safety model after a prior incident in which a forced power-off with a running LXD VM and mounted ZFS storage left the host unbootable (emergency mode, full OS reinstall required). The CLI is now structured to make that class of failure impossible to trigger from normal operation.

### Operating contract

1. **The host must stay bootable, always.** No CLI action will modify host configuration in a way that can block boot. `--reset` no longer touches the LXD snap or storage pools.
2. **Errors propagate.** There is no `silentOnError`, no `silent: true`, no `|| true` in any host-side code path. Where a command's exit code is genuinely ambiguous (e.g. `parted resizepart`), the rc is captured explicitly and **logged**, never swallowed.
3. **Pre-condition over recovery.** Destructive operations check that their target exists before acting. If a VM/profile/network is already gone, the step is a no-op with a log line. If the precondition passes and the command then fails, the error is raised.
4. **Graceful daemon stop before any snap removal.** `--purge` always runs `sudo lxd shutdown --timeout 60` before `snap remove lxd --purge` so the daemon flushes the ZFS pool cleanly. This is the documented LXD-safe sequence and prevents the dirty-pool-on-next-boot scenario.

### Pre-reboot procedure and post-boot restore

Before `reboot`, `poweroff`, `shutdown`, kernel update, or any other host-level event that powers the machine down, run:

```bash
underpost lxd --shutdown
```

This stops every running VM with a 60 s graceful timeout, then asks the LXD daemon to shut down cleanly (also with a 60 s timeout). Only after this completes is the host safe to power off. **Do not** rely on systemd alone to stop LXD during a reboot — if you have many or large VMs, the default timeouts can elapse while the daemon is still writing to the storage pool.

After the host comes back up, snap auto-starts the LXD daemon but does **not** auto-start any VMs (because the admin-profile sets `boot.autostart=false`). To bring the lab back online explicitly:

```bash
underpost lxd --restore
```

`--restore` runs `sudo snap start lxd`, waits up to 30 s for the daemon's REST socket to respond (`lxc info`), then `lxc start <vm>` for every VM. VMs already in `Running` state are skipped. This is the symmetric counterpart to `--shutdown`.

### Admin profile hardening

[`manifests/lxd/lxd-admin-profile.yaml`](../../../../../manifests/lxd/lxd-admin-profile.yaml) enforces two host-safety defaults on every VM created with this profile:

| Key                          | Value   | Why                                                                                                                                                                                                                 |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boot.autostart`             | `false` | LXD will not start any VM at daemon boot. A broken VM cannot block `snap.lxd.daemon` startup, so it cannot drag the host into emergency mode. The user explicitly brings VMs up after the host is verified healthy. |
| `boot.host_shutdown_timeout` | `60`    | Bounds how long the daemon waits for a VM to stop when the host is going down. Prevents an unresponsive VM from holding the host in indefinite shutdown.                                                            |

The profile attaches each VM to the managed `lxdbr0` bridge as `eth0`, but it does **not** pin a shared IPv4 reservation. Addressing comes from the bridge's DHCP/NAT service so multiple VMs can coexist without profile-level IP conflicts.

### `--reset` vs `--purge`

| Action    | Touches VMs / profile / network | Touches LXD snap & ZFS pool | Use when                                                                                          |
| --------- | ------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `--reset` | Yes                             | **No**                      | You want to wipe all VMs and rebuild the cluster while keeping LXD installed and the pool intact. |
| `--purge` | No (snap removal wipes them)    | Yes (after graceful stop)   | You are decommissioning LXD on this host entirely.                                                |
| Both      | Yes, in order                   | Yes                         | You want a clean teardown followed by full removal.                                               |

### Centralized K3s teardown on every destructive op

There is exactly **one** K3s teardown implementation in the repo: `safeResetK3s` in [`src/cli/cluster.js`](../../../../../src/cli/cluster.js). It runs in two contexts:

- **Physical host / bare-metal**: invoked directly as `node bin cluster --dev --reset --k3s [--reset-mode=…]`.
- **Inside an LXD VM**: invoked via `lxc exec <vm> -- bash -lc 'cd /home/dd/engine && node bin cluster --dev --reset --k3s --reset-mode=…'`, driven by `_resetK3sInVm` in [`src/cli/lxd.js`](../../../../../src/cli/lxd.js).

LXD's destructive ops never reimplement K3s teardown — they probe each VM for K3s + engine, then delegate to the centralized method via `lxc exec`. One implementation to keep correct, two ways to invoke it.

#### Two modes

| Mode    | What it does (in order)                                                                                                                                                                  | When to use                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `drain` | Stop `k3s` / `k3s-agent` systemd units → `/usr/local/bin/k3s-killall.sh` (unmount pod overlays, tear down flannel CNI). K3s **stays installed**; it comes back on next host/VM boot.     | Reversible operations. `--shutdown` uses this so `--restore` brings K3s back automatically.            |
| `full`  | Drain (as above) → `/usr/local/bin/k3s-uninstall.sh` (and `k3s-agent-uninstall.sh`) → remove `~/.kube`, `/etc/rancher/k3s`, leftover `flannel.1` / `cni0` → re-apply `configMinimalK3s`. | Destructive operations where the VM is going away or being wiped: `--vm-delete`, `--reset`, `--purge`. |

#### How each LXD op uses it

| Host action   | Per-VM teardown invoked                                                                                          | Why this mode                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--shutdown`  | `_resetK3sInVm(vm, 'drain')` for each running VM, then `lxc stop --timeout 60`, then `lxd shutdown --timeout 60` | Reversible — after `--restore`, K3s must come back on its own.                                                        |
| `--vm-delete` | `_resetK3sInVm(vm, 'full')`, then `lxc stop --timeout 60`, then `lxc delete`                                     | VM is being destroyed — full teardown ensures clean unmount and frees iptables NAT.                                   |
| `--reset`     | `_resetK3sInVm(vm, 'full')` for each VM, then stop + delete each, then drop profile + bridge network             | Every VM is being destroyed — same logic as `--vm-delete`, applied per-VM.                                            |
| `--purge`     | `_resetK3sInVm(vm, 'full')` for each running VM BEFORE `lxd shutdown`, then snap remove                          | Snap removal will wipe everything, but cleaning K3s first means the ZFS pool isn't dirty when `lxd shutdown` flushes. |

#### Existence probe

Before invoking the centralized teardown inside a VM, `_resetK3sInVm` runs a single guarded `lxc exec` probe:

```sh
if test -x /usr/local/bin/k3s && test -d /home/dd/engine/bin; then echo yes; else echo no; fi
```

If either the K3s binary or the engine source mirror is absent, the VM is skipped with a log line — there's nothing meaningful for the centralized path to act on, and the host op continues with the rest of its work. The probe's inner shell always exits 0, so there is no `silentOnError` and no try/catch around the shell.

#### Timeouts

The full `lxc exec` for the centralized reset is bounded by `timeout 300` on the host side. If a VM is unresponsive and the reset times out, the error propagates loudly — the destructive flow stops and the user is told which VM to investigate. There is no silent fallback to a forced stop. To force-delete a wedged VM, run `lxc delete --force <vm>` manually and accept that its on-disk state may be in whatever shape it was when it stalled.

#### Running the K3s teardown directly

You can invoke it without LXD at all — useful on bare-metal K3s nodes or for ad-hoc cleanup inside a VM:

```bash
# Full teardown (uninstall + cleanup):
node bin cluster --dev --reset --k3s
node bin cluster --dev --reset --k3s --reset-mode=full        # explicit

# Drain only (stop services, keep K3s installed):
node bin cluster --dev --reset --k3s --reset-mode=drain
```

`safeResetK3s` only touches what K3s actually owns. It does NOT stop Docker / standalone-containerd / standalone-kubelet / podman, and it does NOT modify host iptables beyond removing K3s-specific interfaces. It is safe to run inside an LXD VM where none of those packages exist.

### What you should never do

1. **Never `reboot` / `poweroff` the host while VMs are running.** Always `underpost lxd --shutdown` first.
2. **Never `snap remove lxd --purge` manually** while VMs are running. Use `underpost lxd --purge`; it runs `sudo lxd shutdown --timeout 60` first so the daemon flushes ZFS state.
3. **Never add LXD-managed paths (`/var/snap/lxd/...`, storage pool mount points) to `/etc/fstab`.** Snap manages those mounts. A stale fstab entry pointing at a path the snap no longer manages can block boot.
4. **Never enable `boot.autostart=true`** on a VM unless you have an external monitoring/recovery path. Autostart compounds VM failures into host-level boot failures.
5. **Never bind-mount host paths into a VM via `disk` profile devices** unless you accept that the host directory becomes a runtime dependency of the VM. The default `admin-profile` uses pool-backed storage only, not host bind mounts. Keep it that way.

### Recovery: host stuck in emergency mode

If despite this you ever boot into emergency mode:

```bash
# At the emergency-mode shell:
systemctl mask snap.lxd.daemon       # prevent LXD from starting
systemctl default                    # continue boot to multi-user.target

# Once back to a normal shell, inspect the storage pool BEFORE re-enabling LXD:
sudo zpool import                    # lists importable pools (read-only first if dirty)
sudo zpool import -F -R /mnt <pool>  # last-resort recovery, may roll back transactions

# When the pool is clean:
systemctl unmask snap.lxd.daemon
systemctl start snap.lxd.daemon
```

---

## Host Setup

### Install LXD

```bash
underpost lxd --install
```

Installs the LXD snap. Idempotent — skipped if already installed.

### Initialize LXD

```bash
underpost lxd --init
```

Initializes LXD using a preseed configuration, setting up storage pools and default settings.

### Reset LXD (host-safe)

```bash
underpost lxd --reset
```

Removes per-VM state managed by this CLI:

1. **Phase 1**: For every VM, enumerate every device of `type: proxy` and remove it. Clears iptables NAT before VMs go away.
2. **Phase 2**: Gracefully stop every running VM (30 s timeout each).
3. **Phase 3**: Delete every VM.
4. **Phase 4**: Drop `admin-profile` and `lxdbr0` if present.

The LXD snap and storage pools are **not** touched. Idempotent — re-running on a clean host is a no-op (every step pre-checks existence).

### Purge LXD (decommission)

```bash
underpost lxd --purge
underpost lxd --reset --purge       # wipe VMs first, then remove the snap
```

`--purge` is the opt-in destructive option:

1. Runs `sudo lxd shutdown --timeout 60` so the daemon flushes ZFS state cleanly.
2. Runs `sudo snap remove lxd --purge`.

This is the safe replacement for the prior aggressive teardown that previously corrupted the host.

### Create Virtual Network

```bash
underpost lxd --create-virtual-network
underpost lxd --create-virtual-network --ipv4-address 10.250.250.1/24
```

Creates the `lxdbr0` bridge network. Idempotent — skipped if `lxdbr0` already exists. Default IPv4 CIDR is `10.250.250.1/24`.

### Create Admin Profile (two-phase)

```bash
underpost lxd --create-admin-profile             # phase 1: prints the create cmd
# (run the printed `lxc profile create admin-profile` in your shell)
underpost lxd --create-admin-profile             # phase 2: loads the YAML

# Optional: put the phase-1 command on the clipboard instead of printing it.
underpost lxd --create-admin-profile --copy
```

`lxc profile create` can hang in some snap/AppArmor configurations when invoked from a non-interactive child process. To sidestep that class of failure entirely:

- **Phase 1** (profile absent): the CLI prints `lxc profile create admin-profile` to your terminal so you can read and run it directly. Pass `--copy` to put it on the clipboard instead.
- **Phase 2** (profile present): the CLI loads [`manifests/lxd/lxd-admin-profile.yaml`](../../../../../manifests/lxd/lxd-admin-profile.yaml) into the existing profile, which is where the host-safety hardening lives.

---

## Virtual Machine Lifecycle

### Create VM (two-phase)

```bash
underpost lxd k3s-control --vm-create                 # prints the launch cmd
underpost lxd k3s-worker --vm-create --root-size 64   # prints, custom disk size
underpost lxd k3s-control --vm-create --copy          # copies it to clipboard instead
# (run the printed/copied `lxc launch ...` command in your shell)
```

The CLI never runs `lxc launch` itself — it can hang on first image fetch or AppArmor negotiation in some snap setups. Instead, the CLI surfaces the exact launch command for you to run interactively:

- **Default**: prints the command to the terminal.
- **`--copy`**: copies the command to the clipboard.

Use the `[vm-id]` command argument to identify the target VM for the boolean lifecycle flags, and `--root-size <gb>` to set the root disk size in GiB (default: 32). The command always targets the `admin-profile` so the host-safety defaults are applied.

### Delete VM

```bash
underpost lxd k3s-worker --vm-delete
```

Safely stops and deletes the specified VM. The order is fixed and every step is gated on a pre-condition (no error suppression):

1. If the VM does not exist → log and return.
2. Remove every device of `type: proxy` attached to the VM.
3. If the VM is `Running` or `Frozen` → graceful stop with a 30 s timeout.
4. Delete the VM.

If any step fails after its precondition passes, the error is raised loudly. There is no `--force`; a stuck stop will surface, not be silently dropped.

### VM Info

```bash
underpost lxd k3s-control --vm-info
```

Displays full configuration and status for the specified VM.

### Test VM

```bash
underpost lxd k3s-control --vm-test
```

Runs connectivity and health checks on the specified VM.

---

## K3s Node Initialization

`--vm-init` is the single end-to-end entry point. It runs the following inside the VM identified by the `[vm-id]` command argument, in order:

1. [`scripts/lxd-vm-setup.sh`](../../../../../scripts/lxd-vm-setup.sh) — OS base setup (NIC + DHCP with static fallback, DNS, root resize, `tar`/`jq`/`curl`/`epel`, `br_netfilter`). Fails closed if outbound connectivity is unreachable.
   The Rocky bootstrap uses a MAC-based DHCP client ID so LXD managed bridge leases behave correctly, and only falls back to a manual IPv4 config if DHCP still does not settle.
2. Engine bootstrap — mirrors the host `/home/dd/engine` (and `engine-private/` if present) into the VM at `/home/dd/engine`. Respects `.gitignore`.
3. [`scripts/k3s-node-setup.sh`](../../../../../scripts/k3s-node-setup.sh) — installs Node.js via nvm and drives the K3s install **only** through `node bin ...` from the mirrored engine root. No global `underpost` is installed.

### Control Plane Node

```bash
underpost lxd k3s-control --vm-init --control
```

### Worker Node

```bash
underpost lxd k3s-worker --vm-init --worker
underpost lxd k3s-worker --vm-init --worker --join-node k3s-control
```

When `--join-node <control-name>` is provided, the worker reads the control plane's IP and node token over `lxc exec` and joins the cluster automatically.

### Join an Existing Worker

```bash
underpost lxd --join-node k3s-worker,k3s-control
```

Standalone join: runs the same `scripts/k3s-node-setup.sh --worker --control-ip=… --token=…` path that `--vm-init --worker` uses. One K3s install code path.

---

## Networking

### Expose Ports

```bash
underpost lxd --expose k3s-control:80,443
underpost lxd --expose k3s-control:6443
```

Proxies host ports to the VM. Before adding a device, the CLI checks whether one with the same name already exists; if it does it is removed first, then re-added. Both steps surface their errors loudly.

### Remove Exposed Ports

```bash
underpost lxd --delete-expose k3s-control:80,443
```

Removes the named proxy devices. If a device isn't present, the step is a no-op (logged); it is never silently retried.

---

## Options Reference

| Option                       | Description                                                                                                                                    | Default           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `--init`                     | Initialize LXD via preseed                                                                                                                     | -                 |
| `--reset`                    | **Host-safe reset**: remove proxy devices, stop/delete VMs, drop `admin-profile` and `lxdbr0`. Does NOT touch the LXD snap or storage pools.   | -                 |
| `--purge`                    | **Destructive**: gracefully shut LXD daemon (60s), then `snap remove lxd --purge`. Combine with `--reset` to wipe per-VM state first.          | -                 |
| `--shutdown`                 | **Pre-host-reboot procedure**: graceful stop of every VM and the LXD daemon. Run BEFORE any `reboot`/`poweroff`.                               | -                 |
| `--restore`                  | **Post-boot restore**: start LXD daemon, wait for it to be responsive, start every VM. Symmetric counterpart to `--shutdown`.                  | -                 |
| `--install`                  | Install the LXD snap (idempotent)                                                                                                              | -                 |
| `--dev`                      | Use local paths instead of global npm installation                                                                                             | -                 |
| `--create-virtual-network`   | Create the `lxdbr0` bridge network (idempotent)                                                                                                | -                 |
| `--ipv4-address <cidr>`      | IPv4 address/CIDR for the bridge network                                                                                                       | `10.250.250.1/24` |
| `--create-admin-profile`     | Create (or update) the `admin-profile`                                                                                                         | -                 |
| `--control`                  | Initialize target VM as K3s control plane node (use with `--vm-init`)                                                                          | -                 |
| `--worker`                   | Initialize target VM as K3s worker node (use with `--vm-init`)                                                                                 | -                 |
| `[vm-id]`                    | Shared VM identifier argument for `--vm-create`, `--vm-delete`, `--vm-init`, `--vm-info`, and `--vm-test`                                      | -                 |
| `--vm-create`                | Copy LXC launch command for the VM identified by the `[vm-id]` command argument                                                                | -                 |
| `--vm-delete`                | Stop and delete the VM identified by the `[vm-id]` command argument. Pre-condition checks gate every step; failures propagate.                 | -                 |
| `--vm-init`                  | OS base setup + mirror `/home/dd/engine` into the VM identified by the `[vm-id]` command argument + K3s role install (single end-to-end step). | -                 |
| `--vm-info`                  | Display full VM configuration and status for the VM identified by the `[vm-id]` command argument                                               | -                 |
| `--vm-test`                  | Run connectivity and health checks on the VM identified by the `[vm-id]` command argument                                                      | -                 |
| `--root-size <gb>`           | Root disk size in GiB for `--vm-create`                                                                                                        | `32`              |
| `--join-node <nodes>`        | Join K3s worker to control plane. Formats: `workerName,controlName` or just the control name                                                   | -                 |
| `--expose <vm-name:ports>`   | Proxy host ports to VM (e.g., `k3s-control:80,443`)                                                                                            | -                 |
| `--delete-expose <vm:ports>` | Remove proxied ports from a VM                                                                                                                 | -                 |
