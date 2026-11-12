# ADR 0013 — Command execution and privileges

## Status

Accepted. It takes the execution decisions out of [ADR 0010](0010-namespace-placement.md). Amended on
2026-11-10: one privileged executor, native host file operations, the host tooling table, the LXD client and
the bare-metal provisioning.

## Context

The CLI ran `kubectl` with and without `sudo`. `sudo` resets the environment, so the two forms read two
kubeconfigs. Routine file operations ran as shell commands, often through `sudo`, and nothing checked
where a module elevated. Command factories embedded `sudo`, so a module that called one elevated without
a reason. The host installed its tools from unpinned scripts, and an install could fail and report success.

## Decisions

1. **One privilege boundary.** `src/server/runtime/process.js` is the only module that elevates. A command
   runs as the invoking user. A host operation that needs root passes `privileged: '<reason>'` to
   `shellExec` or `runCommand`:
   - In a root process, the command runs as it is. Nothing calls `sudo` again.
   - On an interactive terminal outside CI, `sudo` can ask for the password of the user.
   - In CI, over SSH without a terminal and in every other session, `sudo -n` refuses instead of asking.
   - `sudo` keeps the cluster target and the kubeconfig of the invoking user (`KUBECONFIG`, else
     `~/.kube/config`). Root never reads its own kubeconfig.
   - A refusal names the reason and the remedy: `sudo` cannot ask, `sudo` refuses the user, or `sudo` is
     not installed. Underpost stores and passes no password.
2. **Native file operations.** A file operation uses the file system API with an explicit path; no module
   runs `rm`, `cp`, `mv`, `mkdir`, `chmod`, `chown` or `ln` in a shell. A protected host path uses the
   privileged file operations of the boundary: `writeHostFile`, `installHostFile`, `removeHostPath`,
   `makeHostDirectory`, `linkHostPath`, `chownHostPath` and `moveHostPath`. In a root process they use the
   file system API. Otherwise they run `install`, `rm`, `ln`, `find … chown` or `mv` through `sudo`. The
   execution profile gates both forms as host writes.
   - A recursive operation stops before it changes anything when its target is not absolute, is a system
     tree (`/`, `/etc`, `/usr`, `/var/lib` and the like), or leaves the root that `within` names.
   - A removal never follows a link: it removes the link, and it refuses to empty one. Emptying a directory
     removes its hidden entries too.
   - An ownership change stays on the file system of its target, so a mount below it keeps its owner.
   - A tree a command writes with the file system API belongs to the user of the process: the TFTP root,
     the bootstrap HTTP root and the NFS root of the bare-metal commands. In a root process that user is
     root, so the ownership does not change.
3. **One subprocess boundary.** The boundary applies the execution profile and the cluster target
   ([ADR 0010](0010-namespace-placement.md), decision 7) to every command before it runs.
   `src/server/build/execution.js` decides and never executes. A privileged command is at least a host
   write, so a hermetic build elides it. A caller declares what a command needs (`privileged`), never how
   it elevates or which cluster it reaches.
4. **Root is not Kubernetes RBAC.** A Kubernetes API operation uses the kubeconfig and the RBAC of the
   invoking user, never `sudo`. The boundary refuses a privileged `kubectl` or `helm`. The one exception is
   `kubectl port-forward` to a host port below 1024: it needs root to bind the port, and it keeps the
   kubeconfig of the user.
5. **LXD authorizes its clients.** `lxc` runs as the invoking user, with the client configuration, the
   remotes and the project of that user; the boundary refuses a privileged `lxc`. When the LXD socket
   refuses the user, the error says so, and the command never retries as root. The snap, the daemon
   (`/snap/bin/lxd shutdown`), its systemd unit and the firewall of the bridge are host changes. Access to
   the local LXD socket, and so membership of the `lxd` group, is root-equivalent: Underpost adds no user
   to that group. `lxc exec` runs as root in the guest, so a guest command carries no `sudo`.
6. **Factories render, callers execute.** A command factory (`selinux.js`, `container-storage.js`,
   `cri.js`) renders root commands without `sudo` and names the reason. Its runner gives the reason to the
   executor of the caller with each command, or it exports the reason (`CRICTL_PRIVILEGE`). A command
   rendered for another host (a cloud-init file, an image chroot, an SSH session) elevates on that host.
7. **One privilege for each script.** A script the CLI runs as root (`maas-setup.sh`,
   `maas-nat-firewalld.sh`, `packer-setup.sh`, and the LXD guest scripts) checks that it runs as root and
   embeds no `sudo`. A script that builds as the invoking user (`ipxe-setup.sh`) installs nothing: the CLI
   installs its packages through the boundary first. A command shown to the operator, such as the
   `sudo chroot` the clipboard receives, keeps its `sudo`.
8. **One host tooling table.** `src/server/ops/host-tooling.js` holds the repositories, packages,
   services, files and release binaries of a Kubernetes host, and the cluster runtimes that use each tool.
   `cluster --init-host` installs the tools of the runtime that `--kubeadm` or `--k3s` names, or of every
   runtime. `cluster --uninstall-host` removes them from the same table. A release binary has a pinned
   version and a pinned SHA-256 for each architecture. The install fails when a download does not match
   its pin, or when the installed binary does not report its version.
9. **Static audit.** `test/underpost/audit/execution-hygiene.test.js` fails on:
   - `sudo kubectl`, a `cluster.local` literal outside `service-dns.js`, a default namespace in a command
     or fallback, and a deploy script that calls `kubectl` or passes `--namespace` itself;
   - an embedded `sudo` outside the boundary and the listed host administration modules, apart from an
     operator instruction for the clipboard;
   - a privileged command without a reason, and a privileged `lxc`, `kubectl` or `helm` other than a
     port-forward;
   - a module outside the listed ones that starts a process itself;
   - a script of the bare-metal and LXD commands that embeds `sudo`, or a root script without its check;
   - a shell file operation in any module.

   Each listed host administration module must still embed `sudo`, so the list shrinks as modules
   migrate.

## Alternatives considered

- **`sudo` wherever a command fails.** Each call site would decide its own privilege. Rejected for one
  option with a reason.
- **A privilege mode in `conf.cluster.json`.** The effective user of the process already decides it.
  Rejected.
- **Membership of the `docker` group.** The group grants root-equivalent access to the host. Rejected:
  Docker commands use the boundary with the reason `reaches the rootful Docker daemon`.
- **`sudo lxc` when the LXD socket refuses the user.** It would run the client with the configuration and
  the project of root. Rejected: the error names the missing authorization.

## Consequences

- A check that needs root on another host, such as the write access of a peer connection, lives in a host
  administration module and is called from elsewhere.
- Ownership of data is independent of the process that creates it. Root creates and mounts protected
  storage. A data directory gets its owner, group and mode from the workload that uses it.
- Rootless and rootful Podman have separate storage and runtime contexts. The image store of the cluster
  and the NFS root build use the storage of root, every stage of a build the same one.
- The MAAS CLI uses the profile that the control server setup logs in as root, so its commands are
  privileged.

## Least-privilege path

1. Each embedded `sudo` of a host administration module becomes the `privileged` option with its reason,
   module by module, each with a test of its commands. Done: `cluster.js`, `docker-compose.js`,
   `selinux.js`, `container-storage.js`, `cri.js`, `baremetal.js`, `lxd.js` and `wp.js`.
2. The audit then refuses an embedded `sudo` in every module.
3. The checkout, the release store and the container runtime move to an Underpost service user on the
   nodes; the deploy scripts run as that user.

## Known limitations

- The deploy scripts run the CLI as root (`sudo -n -- /bin/bash -lc`): the checkout, the release store and
  the container runtime belong to root on the nodes. Moving that boundary is a host migration.
- The listed host administration modules embed about 230 `sudo` commands. `maas-database.js`, which the
  bare-metal command delegates to, keeps its own.
- The scripts under `scripts/` that the bare-metal and LXD commands do not run still embed their own `sudo`.
- The bare-metal NFS mount gives the NFS root to the user of the process with mode 0755 on every file, as
  it did before this boundary; a root process keeps root as the owner.

## Deferred work

- Step 1 of the least-privilege path for `wireguard.js`, `dns.js`, `ssh.js`, `run.js`, `image.js`,
  `system.js`, `maas-database.js`, `cloud-init.js`, `systemd.js`, `event.js`, `monitor.js`, `monitoring.js`
  and `lampp.js`.
- Multi-user LXD administration through the authorization and the project scoping of LXD.
- One host configuration value for `/home/dd/engine` and `/home/dd`, the engine paths on nodes and in
  images, in place of about 40 literals.
