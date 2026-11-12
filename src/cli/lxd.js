/**
 * LXD module for managing LXD virtual machines as K3s nodes.
 * @module src/cli/lxd.js
 * @namespace UnderpostLxd
 *
 */

import { getNpmRootPath } from '../server/runtime/environment.js';
import { pbcopy, runCommand, shellArgumentFactory, shellExec, sleepSync } from '../server/runtime/process.js';
import { controlHostService, ensureIptablesRule } from '../server/ops/host-tooling.js';
import walk from 'ignore-walk';
import fs from 'fs-extra';
import nodePath from 'node:path';
import os from 'node:os';
import { loggerFactory } from '../server/ops/logger.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

const ENGINE_ROOT_IN_VM = '/home/dd/engine';
const ENGINE_ROOT_ON_HOST = '/home/dd/engine';
const ADMIN_PROFILE = 'admin-profile';
const BRIDGE_NETWORK = 'lxdbr0';
const BRIDGE_SUBNET_PREFIX = '10.250.250';

/** The LXD daemon command. The secure_path of sudo does not hold /snap/bin. */
const LXD_DAEMON = '/snap/bin/lxd';

/** What `lxc` prints when the LXD socket refuses the user. */
const LXD_SOCKET_DENIED = /unix\.socket.*permission denied|connect: permission denied/i;

/**
 * Checks the name of an LXD project, instance, profile, network or device before it reaches a command.
 * @param {*} value
 * @param {string} kind - What the name names, for the error.
 * @returns {string}
 */
const lxdName = (value, kind) => {
  const name = `${value ?? ''}`.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(name)) throw new Error(`Invalid LXD ${kind} name: '${name}'`);
  return name;
};

/**
 * Checks a TCP port given on the command line.
 * @param {*} value
 * @returns {string}
 */
const tcpPort = (value) => {
  const port = `${value ?? ''}`.trim();
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error(`Invalid port: '${port}'`);
  return port;
};

class UnderpostLxd {
  static _project = '';

  /**
   * The `lxc` client of a project.
   * @param {string} [project] - The selected project by default; '' for the current project of the client.
   * @returns {string}
   */
  static _lxcCmd(project = UnderpostLxd._project) {
    return project ? `lxc --project ${project}` : 'lxc';
  }

  /**
   * One `lxc` command line, each argument quoted.
   * @param {string[]} args
   * @param {string} [project] - See {@link UnderpostLxd._lxcCmd}.
   * @returns {string}
   */
  static _lxcLine(args, project = UnderpostLxd._project) {
    return [UnderpostLxd._lxcCmd(project), ...args.map(shellArgumentFactory)].join(' ');
  }

  /**
   * The error of a command the LXD socket refused: the user is not authorized, and `lxc` never elevates.
   * @param {Error} error
   * @returns {Error} The error itself when the socket did not refuse.
   */
  static _accessError(error) {
    if (!LXD_SOCKET_DENIED.test(`${error?.stderr ?? ''}`)) return error;
    return Object.assign(
      new Error(
        `${os.userInfo().username} may not use the LXD daemon. LXD authorizes the clients of its socket, and this ` +
          'command does not run lxc as root: run it as a user that LXD authorizes.',
      ),
      { expected: true, cause: error },
    );
  }

  /**
   * Runs a command line that reaches LXD as the invoking user.
   * @param {string} command
   * @param {object} [options] - {@link shellExec} options.
   * @returns {*}
   */
  static _run(command, options = {}) {
    try {
      return shellExec(command, options);
    } catch (error) {
      throw UnderpostLxd._accessError(error);
    }
  }

  /**
   * Runs one `lxc` command as the invoking user: LXD authorizes it with the client configuration of that user.
   * @param {string[]} args
   * @param {object} [options] - {@link shellExec} options, and:
   * @param {string} [options.project] - See {@link UnderpostLxd._lxcCmd}.
   * @param {string} [options.stdin] - A file that becomes the standard input.
   * @returns {*}
   */
  static _lxc(args, { project = UnderpostLxd._project, stdin = '', ...options } = {}) {
    return UnderpostLxd._run(
      `${UnderpostLxd._lxcLine(args, project)}${stdin ? ` < ${shellArgumentFactory(stdin)}` : ''}`,
      options,
    );
  }

  /**
   * The instance of a VM as `lxc list` reports it.
   * @param {string} vmName
   * @param {string} [project] - See {@link UnderpostLxd._lxcCmd}.
   * @returns {object|null} null when the VM does not exist.
   */
  static _instance(vmName, project = UnderpostLxd._project) {
    const list = JSON.parse(
      UnderpostLxd._lxc(['list', vmName, '--format', 'json'], { project, stdout: true, silent: true }).trim() || '[]',
    );
    return (Array.isArray(list) && list.find((instance) => instance?.name === vmName)) || null;
  }

  /**
   * Runs `scripts/k3s-node-setup.sh` as root inside a VM. The role arguments may carry the join token, so the
   * command line stays out of the log.
   * @param {string} vmName
   * @param {string} scriptPath
   * @param {string[]} roleArgs
   */
  static _setupK3sNode(vmName, scriptPath, roleArgs) {
    UnderpostLxd._lxc(['exec', vmName, '--', 'bash', '-s', '--', `--engine-root=${ENGINE_ROOT_IN_VM}`, ...roleArgs], {
      stdin: scriptPath,
      disableLog: true,
    });
  }

  static API = {
    /**
     * @method callback
     * @description Main entry point for all LXD CLI operations.
     * @param {string} [vmId=''] - Positional VM identifier for boolean
     *   vm lifecycle flags.
     * @param {object} options
     * @param {boolean} [options.init=false] - Initialize LXD via preseed.
     * @param {boolean} [options.reset=false] - Host-safe teardown of VMs, proxy
     *   devices, admin-profile, and lxdbr0. Does NOT touch the LXD snap or
     *   storage pools.
     * @param {boolean} [options.purge=false] - Gracefully shut the LXD daemon
     *   down (60s timeout) and remove the LXD snap. Combine with `--reset` to
     *   wipe per-VM state first. Without `--reset`, snap removal alone wipes
     *   everything.
     * @param {boolean} [options.shutdown=false] - Pre-host-reboot procedure:
     *   gracefully stop every VM and the LXD daemon. Run before `reboot` /
     *   `poweroff` to keep the host bootable.
     * @param {boolean} [options.restore=false] - Symmetric to `--shutdown`:
     *   starts the LXD daemon (`snap start lxd`), waits for it to become
     *   responsive, then starts every VM that exists. VMs created with
     *   `admin-profile` have `boot.autostart=false`, so this is the explicit
     *   "bring the lab back online" command.
     * @param {boolean} [options.dev=false] - Use local paths instead of npm global.
     * @param {boolean} [options.install=false] - Install LXD snap.
     * @param {boolean} [options.createVirtualNetwork=false] - Create lxdbr0 as a LXD-managed
     *   bridge with NAT, but with DHCP/DNS off and dnsmasq neutralized (raw.dnsmasq=port=0) so
     *   it coexists with MAAS. The managed subnet enables static NIC IPs for `--expose` proxies.
     * @param {string} [options.ipv4Address='10.250.250.1/24'] - Managed gateway address/CIDR
     *   for lxdbr0 (LXD assigns this to the bridge and masquerades VM egress).
     * @param {boolean} [options.createAdminProfile=false] - Create admin-profile for VMs.
     * @param {boolean} [options.control=false] - Initialize VM as K3s control plane.
     * @param {boolean} [options.worker=false] - Initialize VM as K3s worker.
     * @param {boolean} [options.vmInit=false] - Bring the VM identified by
     *   `vmId` up as a K3s node end-to-end.
     * @param {boolean} [options.vmDelete=false] - Safely stop and delete the
     *   VM identified by `vmId`.
     * @param {boolean} [options.vmCreate=false] - Surface the launch command
     *   for the VM identified by `vmId`.
     * @param {boolean} [options.vmInfo=false] - Inspect the VM identified by
     *   `vmId`.
     * @param {string} [options.rootSize=''] - Root disk size in GiB for new VMs.
     * @param {string} [options.joinNode=''] - Join format: 'workerName,controlName'.
     * @param {string} [options.expose=''] - Expose VM ports to host: 'vmName:port1,port2'.
     * @param {string} [options.nodePort=''] - Custom VM-side (connect) port for `--expose`. When set, the
     *   host listens on each requested port but the proxy connects to this port inside the VM (e.g. expose
     *   host 27017 → VM NodePort 32017). Defaults to the same port on both sides.
     * @param {string} [options.deleteExpose=''] - Remove exposed ports: 'vmName:port1,port2'.
     * @param {boolean} [options.vmTest=false] - Run connectivity and health
     *   checks on the VM identified by `vmId`.
     * @param {boolean} [options.vmSyncEngine=false] - Re-copy the host engine
     *   source into the VM identified by `vmId`, overriding whatever is
     *   currently there. Equivalent to step 2 of `--vm-init` in isolation.
     * @param {boolean} [options.copy=false] - For two-phase flows that surface a
     *   command for the user to execute (e.g. `--create-admin-profile` phase 1):
     *   when set, copy the command to the clipboard. When unset, print it to
     *   the terminal so the user can read it directly.
     * @param {string} [options.maasProject=''] - LXD project managed by MAAS
     *   (e.g. 'k3s-cluster'). When set, all lxc commands target this project so
     *   MAAS can enumerate the VMs in its machines UI.
     * @param {boolean} [options.moveToProject=false] - Stop the VM identified
     *   by `vmId`, move it from the default project to `maasProject`, then start
     *   it so MAAS picks it up. Requires `--maas-project`.
     * @memberof UnderpostLxd
     */
    async callback(
      vmId = '',
      options = {
        init: false,
        reset: false,
        purge: false,
        shutdown: false,
        restore: false,
        dev: false,
        install: false,
        createVirtualNetwork: false,
        ipv4Address: '10.250.250.1/24',
        createAdminProfile: false,
        control: false,
        worker: false,
        vmInit: false,
        vmDelete: false,
        vmCreate: false,
        vmInfo: false,
        rootSize: '',
        joinNode: '',
        expose: '',
        nodePort: '',
        deleteExpose: '',
        vmTest: false,
        vmSyncEngine: false,
        copy: false,
        maasProject: '',
        moveToProject: false,
      },
    ) {
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      const currentVmId = vmId ? lxdName(vmId, 'instance') : '';
      const vmCreate = options.vmCreate === true;
      const vmDelete = options.vmDelete === true;
      const vmInfo = options.vmInfo === true;
      const vmInit = options.vmInit === true;
      const vmTest = options.vmTest === true;
      const vmSyncEngine = options.vmSyncEngine === true;
      UnderpostLxd._project = options.maasProject ? lxdName(options.maasProject, 'project') : '';

      // =====================================================================
      // SHUTDOWN: graceful pre-host-reboot procedure
      // =====================================================================
      if (options.shutdown === true) {
        UnderpostLxd._gracefulShutdownAll();
        return;
      }

      // =====================================================================
      // RESTORE: symmetric counterpart to --shutdown
      // =====================================================================
      if (options.restore === true) {
        UnderpostLxd._restoreAll();
        return;
      }

      // =====================================================================
      // RESET / PURGE: host-safe teardown variants
      //   --reset       wipes VMs, proxy devices, admin-profile, lxdbr0
      //   --purge       gracefully stops the daemon, then snap remove --purge
      //   --reset --purge   both, in order
      // =====================================================================
      if (options.reset === true) {
        UnderpostLxd._safeReset();
      }
      if (options.purge === true) {
        UnderpostLxd._safePurge();
      }
      if (options.reset === true || options.purge === true) return;

      // =====================================================================
      // INSTALL (idempotent: skip if already installed)
      // =====================================================================
      if (options.install === true) {
        if (UnderpostLxd._snapInstalled('lxd')) {
          logger.info('LXD snap is already installed; skipping.');
        } else {
          shellExec('snap install lxd', { privileged: 'installs the LXD snap' });
        }
      }

      // =====================================================================
      // INIT (LXD preseed)
      // =====================================================================
      if (options.init === true) {
        controlHostService('start', 'snap.lxd.daemon');
        shellExec('systemctl status snap.lxd.daemon');
        if (UnderpostLxd._lxdInitialized()) {
          logger.info('LXD is already initialized (storage pool present); skipping preseed.');
        } else {
          const input = fs
            .readFileSync(`${underpostRoot}/manifests/lxd/lxd-preseed.yaml`, 'utf8')
            .replaceAll(`127.0.0.1`, Underpost.dns.getLocalIPv4Address());
          await runCommand('lxd', ['init', '--preseed'], { input }).catch((error) => {
            throw UnderpostLxd._accessError(error);
          });
        }
        UnderpostLxd._lxc(['cluster', 'list']);
      }

      // =====================================================================
      // CREATE VIRTUAL NETWORK
      //
      // LXD-managed bridge so its native features work — the host is the
      // gateway (10.250.250.1), LXD masquerades VM egress (`ipv4.nat`), and the
      // managed subnet lets instance NICs carry a static `ipv4.address`, which
      // NAT-mode proxy devices (`--expose`) require.
      //
      // MAAS harmony: LXD spawns a dnsmasq for any managed subnet, and on this
      // host that dnsmasq cannot bind :53/:67 (MAAS's named/dhcpd already own
      // them), so a default managed bridge dies with "Address already in use".
      // We neutralize dnsmasq instead of dropping the subnet:
      //   - ipv4.dhcp=false  → no DHCP, no :67 bind (MAAS owns DHCP).
      //   - dns.mode=none + raw.dnsmasq=port=0 → no DNS, no :53 bind. dns.mode
      //     alone does not force port=0 in dnsmasq, hence the explicit raw line.
      // dnsmasq then starts but opens no listening sockets — no collision.
      //
      // Settings are applied inline at create time so dnsmasq is neutralized on
      // its first spawn (not after a racing default-config start). Idempotent:
      // reconcile when the network already exists.
      // =====================================================================
      if (options.createVirtualNetwork === true) {
        const gatewayCidr = options.ipv4Address ? options.ipv4Address : '10.250.250.1/24';
        // Order matters for the reconcile path: neutralize dnsmasq (no DHCP, no
        // DNS listener) BEFORE assigning ipv4.address, or setting the subnet on
        // an existing bridge spawns a default dnsmasq that collides with MAAS
        // before raw.dnsmasq lands. On a fresh inline create this is atomic.
        const bridgeSettings = {
          'ipv4.dhcp': 'false',
          'dns.mode': 'none',
          'raw.dnsmasq': 'port=0',
          'ipv6.address': 'none',
          'ipv4.address': gatewayCidr,
          'ipv4.nat': 'true',
          'ipv4.firewall': 'true',
        };

        if (UnderpostLxd._networkExists(BRIDGE_NETWORK)) {
          logger.info(`Network '${BRIDGE_NETWORK}' already exists; reconciling managed bridge settings.`);
          for (const [key, value] of Object.entries(bridgeSettings))
            UnderpostLxd._lxc(['network', 'set', BRIDGE_NETWORK, key, value]);
        } else {
          UnderpostLxd._lxc([
            'network',
            'create',
            BRIDGE_NETWORK,
            ...Object.entries(bridgeSettings).map(([key, value]) => `${key}=${value}`),
          ]);
        }

        UnderpostLxd._ensureBridgeInTrustedZone(BRIDGE_NETWORK);
        UnderpostLxd._ensureBridgeForwardingAccept(BRIDGE_NETWORK);
      }

      // =====================================================================
      // CREATE ADMIN PROFILE (two-phase to sidestep `lxc profile create` hangs)
      //
      // Phase 1 (profile absent): copy `lxc profile create admin-profile` to
      //   the clipboard and exit. The user runs it themselves in their shell.
      // Phase 2 (profile present): load the YAML into the existing profile.
      //
      // Driven by an explicit pre-condition check; no shell command runs that
      // could hang waiting on stdin/tty.
      // =====================================================================
      if (options.createAdminProfile === true) {
        if (!UnderpostLxd._profileExists(ADMIN_PROFILE)) {
          const createCmd = `lxc profile create ${ADMIN_PROFILE}`;
          if (options.copy === true) {
            logger.warn(
              `Profile '${ADMIN_PROFILE}' does not exist. The create command has been copied to your clipboard — run it, then re-run this command to load the YAML.`,
            );
            pbcopy(createCmd);
          } else {
            logger.warn(
              `Profile '${ADMIN_PROFILE}' does not exist. Run the command below in your shell, then re-run this command to load the YAML. (Pass --copy to put it on the clipboard instead.)`,
            );
            console.log(`\n  ${createCmd}\n`);
          }
        } else {
          UnderpostLxd._lxc(['profile', 'edit', ADMIN_PROFILE], {
            stdin: `${underpostRoot}/manifests/lxd/lxd-admin-profile.yaml`,
          });
          UnderpostLxd._lxc(['profile', 'show', ADMIN_PROFILE]);
        }
      }

      // =====================================================================
      // DELETE VM (idempotent via pre-condition checks; no silent errors)
      // =====================================================================
      if (vmDelete) {
        if (!currentVmId) {
          throw new Error(`--vm-delete requires the [vm-id] command argument.`);
        }
        UnderpostLxd._safeDeleteVm(currentVmId);
      }

      // =====================================================================
      // MOVE VM TO PROJECT (stop + cross-project move + start for MAAS)
      // =====================================================================
      if (options.moveToProject === true) {
        if (!currentVmId) {
          throw new Error(`--move-to-project requires the [vm-id] command argument.`);
        }
        if (!UnderpostLxd._project) {
          throw new Error(`--move-to-project requires --maas-project <projectName>.`);
        }
        const inst = UnderpostLxd._instance(currentVmId, '');
        if (!inst) throw new Error(`VM '${currentVmId}' not found in the default project.`);

        // Ensure every profile the VM references exists in the target project.
        // `lxc move` across projects fails with "Profile not found" if the
        // target project does not have the same profiles as the source.
        //
        // Two-phase pattern (mirrors --create-admin-profile): `lxc profile create`
        // can hang waiting on stdin/tty, so we NEVER run it programmatically.
        //   Phase 1 (profile absent in target): surface the create command and exit.
        //   Phase 2 (profile present in target): sync the YAML from the default project.
        const vmProfiles = Array.isArray(inst.profiles) ? inst.profiles : [];
        const targetProfilesRaw = UnderpostLxd._lxc(['profile', 'list', '--format', 'json'], {
          stdout: true,
          silent: true,
        }).trim();
        const targetProfiles = JSON.parse(targetProfilesRaw || '[]');
        const targetProfileNames = Array.isArray(targetProfiles) ? targetProfiles.map((p) => p?.name) : [];
        for (const profileName of vmProfiles) {
          if (profileName === 'default') continue; // every project already has 'default'
          if (!targetProfileNames.includes(profileName)) {
            const createCmd = `lxc --project ${UnderpostLxd._project} profile create ${profileName}`;
            if (options.copy === true) {
              logger.warn(
                `Profile '${profileName}' not found in project '${UnderpostLxd._project}'. The create command has been copied to your clipboard — run it, then re-run --move-to-project.`,
              );
              pbcopy(createCmd);
            } else {
              logger.warn(
                `Profile '${profileName}' not found in project '${UnderpostLxd._project}'. Run the command below in your shell, then re-run --move-to-project. (Pass --copy to put it on the clipboard instead.)`,
              );
              console.log(`\n  ${createCmd}\n`);
            }
            return;
          }
          // Phase 2: profile exists in target — sync YAML from default project.
          // Explicitly use --project default on the source side so the read is
          // unambiguous regardless of any active project context.
          logger.info(`Syncing profile '${profileName}' YAML into project '${UnderpostLxd._project}'...`);
          UnderpostLxd._run(
            `set -o pipefail; ${UnderpostLxd._lxcLine(['profile', 'show', profileName], 'default')} | ${UnderpostLxd._lxcLine(['profile', 'edit', profileName])}`,
          );
          logger.info(`  Profile '${profileName}' synced.`);
        }

        if (inst.status === 'Running' || inst.status === 'Frozen') {
          logger.info(`Stopping VM '${currentVmId}' before cross-project move...`);
          UnderpostLxd._lxc(['stop', currentVmId, '--timeout', '60'], { project: '' });
        }
        logger.info(`Moving VM '${currentVmId}' to project '${UnderpostLxd._project}'...`);
        UnderpostLxd._lxc(['move', currentVmId, currentVmId, '--target-project', UnderpostLxd._project], {
          project: '',
        });
        logger.info(`VM '${currentVmId}' is now in project '${UnderpostLxd._project}'. Starting...`);
        UnderpostLxd._lxc(['start', currentVmId]);
        logger.info(`VM '${currentVmId}' started in project '${UnderpostLxd._project}'.`);
        return;
      }

      // =====================================================================
      // CREATE VM (surface the launch command for the user to run)
      //
      // Default: print to terminal. With `--copy`: copy to clipboard.
      // Same two-phase pattern as `--create-admin-profile`: the CLI never runs
      // `lxc launch` itself (it can hang on first image fetch or AppArmor
      // negotiation in some snap setups), so the user always invokes it.
      // =====================================================================
      if (vmCreate) {
        if (!currentVmId) {
          throw new Error(`--vm-create requires the [vm-id] command argument.`);
        }
        const vmName = currentVmId;
        if (options.rootSize && !/^\d+$/.test(`${options.rootSize}`))
          throw new Error(`--root-size takes a whole number of GiB, not '${options.rootSize}'`);
        const launchCmd = `${UnderpostLxd._lxcCmd()} launch images:rockylinux/9 ${
          vmName
        } --vm --target lxd-node1 -c limits.cpu=2 -c limits.memory=4GB --profile ${ADMIN_PROFILE} -d root,size=${
          options.rootSize ? options.rootSize + 'GiB' : '32GiB'
        }`;
        if (options.copy === true) {
          logger.info(`Launch command for VM '${vmName}' copied to clipboard. Run it in your shell.`);
          pbcopy(launchCmd);
        } else {
          logger.info(
            `Run the launch command below in your shell to create VM '${vmName}'. (Pass --copy to put it on the clipboard instead.)`,
          );
          console.log(`\n  ${launchCmd}\n`);
        }
      }

      // =====================================================================
      // INIT VM (OS setup + engine bootstrap + K3s role)
      // =====================================================================
      if (vmInit) {
        if (!currentVmId) {
          throw new Error(`--vm-init requires the [vm-id] command argument.`);
        }
        const vmName = currentVmId;
        if (!UnderpostLxd._vmExists(vmName)) {
          throw new Error(`VM '${vmName}' does not exist. Create it first with 'underpost lxd ${vmName} --vm-create'.`);
        }
        const lxdSetupPath = `${underpostRoot}/scripts/lxd-vm-setup.sh`;
        const k3sSetupPath = `${underpostRoot}/scripts/k3s-node-setup.sh`;

        const fallbackIp = UnderpostLxd._allocateFallbackIp(vmName);
        logger.info(`[${vmName}] Step 1/3: OS base setup (DHCP fallback IP: ${fallbackIp}/24)...`);
        UnderpostLxd._lxc(
          [
            'exec',
            vmName,
            '--env',
            `LXD_FALLBACK_IPV4_CIDR=${fallbackIp}/24`,
            '--env',
            `LXD_NODE_NAME=${vmName}`,
            '--',
            'bash',
          ],
          { stdin: lxdSetupPath },
        );

        logger.info(`[${vmName}] Step 2/3: Bootstrapping engine source into VM...`);
        await UnderpostLxd._bootstrapEngineSource(vmName);

        // Step 3: K3s role setup, driven by the local engine source.
        logger.info(`[${vmName}] Step 3/3: K3s role setup...`);
        if (options.worker === true) {
          if (!options.joinNode) {
            throw new Error(
              `--vm-init --worker requires --join-node <controlVmName>. A worker is meaningless without a control plane to join; the script would only fail after npm install completes.`,
            );
          }
          const controlNode = lxdName(options.joinNode.split(',').pop(), 'instance');
          const { ip: controlPlaneIp, token: k3sToken } = UnderpostLxd._readControlPlaneJoinInfo(controlNode);
          logger.info(`[${vmName}] Joining control plane ${controlNode} (${controlPlaneIp})`);
          UnderpostLxd._setupK3sNode(vmName, k3sSetupPath, [
            '--worker',
            `--control-ip=${controlPlaneIp}`,
            `--token=${k3sToken}`,
          ]);
          UnderpostLxd._labelWorkerNodeRole(controlNode, vmName);
        } else {
          UnderpostLxd._setupK3sNode(vmName, k3sSetupPath, ['--control']);
        }
        logger.info(`[${vmName}] Init complete. Engine mirrored at ${ENGINE_ROOT_IN_VM}.`);
      }

      // =====================================================================
      // STANDALONE JOIN
      // =====================================================================
      if (options.joinNode && !vmInit) {
        const [workerNode, controlNode] = options.joinNode.split(',').map((name) => name && lxdName(name, 'instance'));
        if (!workerNode || !controlNode) {
          throw new Error(`--join-node standalone requires 'workerName,controlName' format.`);
        }
        if (!UnderpostLxd._vmExists(workerNode)) {
          throw new Error(`Worker VM '${workerNode}' does not exist.`);
        }
        const { ip: controlPlaneIp, token: k3sToken } = UnderpostLxd._readControlPlaneJoinInfo(controlNode);
        const k3sSetupPath = `${underpostRoot}/scripts/k3s-node-setup.sh`;
        logger.info(`Joining K3s worker ${workerNode} to control plane ${controlNode} (${controlPlaneIp})`);
        UnderpostLxd._setupK3sNode(workerNode, k3sSetupPath, [
          '--worker',
          `--control-ip=${controlPlaneIp}`,
          `--token=${k3sToken}`,
        ]);
        UnderpostLxd._labelWorkerNodeRole(controlNode, workerNode);
        logger.info(`Worker ${workerNode} joined successfully.`);
      }

      // =====================================================================
      // INFO VM
      // =====================================================================
      if (vmInfo) {
        if (!currentVmId) {
          throw new Error(`--vm-info requires the [vm-id] command argument.`);
        }
        const vmName = currentVmId;
        UnderpostLxd._lxc(['config', 'show', vmName]);
        UnderpostLxd._lxc(['info', '--show-log', vmName]);
        UnderpostLxd._lxc(['info', vmName]);
        UnderpostLxd._lxc(['list', vmName]);
      }

      // =====================================================================
      // EXPOSE (host LAN port -> VM NodePort via LXD NAT-mode proxy device)
      //
      // NAT-mode proxy on a VM requires the host to be the gateway (it is) and a
      // static ipv4.address on the instance NIC. _ensureNicStaticIpv4 pins that
      // (with security.ipv4_filtering so it's accepted on the DHCP-less bridge),
      // then the proxy device forwards listen=host -> connect=VM, preserving the
      // client address via NAT. When exposing known service ports (MongoDB 27017,
      // Valkey 6379), also persist the host-side runtime env so `node src/server`
      // on the physical host dials the LXD proxy instead of localhost defaults.
      // =====================================================================
      if (options.expose) {
        const [exposedVm, ports = ''] = options.expose.split(':');
        const vmName = lxdName(exposedVm, 'instance');
        const protocols = ['tcp'];
        const hostIp = Underpost.dns.getLocalIPv4Address();
        const exposedHostPorts = ports
          .split(',')
          .filter((port) => port.trim().length > 0)
          .map(tcpPort);
        const vmIp = UnderpostLxd._vmIpv4(vmName);
        if (!vmIp) {
          throw new Error(`Could not resolve VM IP for ${vmName}. Cannot expose ports.`);
        }
        UnderpostLxd._ensureNicStaticIpv4(vmName, vmIp);
        for (const port of exposedHostPorts) {
          const connectPort = options.nodePort ? tcpPort(options.nodePort) : port;
          for (const protocol of protocols) {
            const deviceName = `${vmName}-${protocol}-port-${port}`;
            if (UnderpostLxd._vmHasDevice(vmName, deviceName))
              UnderpostLxd._lxc(['config', 'device', 'remove', vmName, deviceName]);
            UnderpostLxd._lxc([
              'config',
              'device',
              'add',
              vmName,
              deviceName,
              'proxy',
              `listen=${protocol}:${hostIp}:${port}`,
              `connect=${protocol}:${vmIp}:${connectPort}`,
              'nat=true',
            ]);
            logger.info(`Exposed ${protocol}:${hostIp}:${port} -> ${vmIp}:${connectPort} on ${vmName}`);
          }
        }
        if (exposedHostPorts.includes('27017') || exposedHostPorts.includes('6379')) {
          Underpost.cluster.syncServiceConnectionEnv({
            serviceHost: hostIp,
            mongodb: exposedHostPorts.includes('27017'),
            valkey: exposedHostPorts.includes('6379'),
            options,
          });
        }
      }

      // =====================================================================
      // DELETE EXPOSE
      // =====================================================================
      if (options.deleteExpose) {
        const [exposedVm, ports = ''] = options.deleteExpose.split(':');
        const vmName = lxdName(exposedVm, 'instance');
        const protocols = ['tcp'];
        for (const port of ports.split(',').map(tcpPort)) {
          for (const protocol of protocols) {
            const deviceName = `${vmName}-${protocol}-port-${port}`;
            if (UnderpostLxd._vmHasDevice(vmName, deviceName)) {
              UnderpostLxd._lxc(['config', 'device', 'remove', vmName, deviceName]);
            } else {
              logger.info(`Device ${deviceName} not present on ${vmName}; skipping.`);
            }
          }
        }
      }

      // =====================================================================
      // SYNC ENGINE (re-copy host engine source into VM)
      // =====================================================================
      if (vmSyncEngine) {
        if (!currentVmId) {
          throw new Error(`--vm-sync-engine requires the [vm-id] command argument.`);
        }
        const vmName = currentVmId;
        if (!UnderpostLxd._vmExists(vmName)) {
          throw new Error(`VM '${vmName}' does not exist.`);
        }
        logger.info(`[${vmName}] Syncing engine source from host...`);
        await UnderpostLxd._bootstrapEngineSource(vmName);
        UnderpostLxd._execVmNodeCommand(vmName, `cd ${ENGINE_ROOT_IN_VM} && npm install`, { requireNpm: true });
        logger.info(`[${vmName}] Engine source sync complete.`);
        return;
      }

      // =====================================================================
      // TEST (connectivity and health checks)
      // =====================================================================
      if (vmTest) {
        if (!currentVmId) {
          throw new Error(`--vm-test requires the [vm-id] command argument.`);
        }
        const vmName = currentVmId;
        const vmIp = UnderpostLxd._vmIpv4(vmName);
        logger.info(`VM ${vmName} IPv4: ${vmIp || 'none'}`);
        const httpStatus = UnderpostLxd._lxc(
          [
            'exec',
            vmName,
            '--',
            'curl',
            '-s',
            '-o',
            '/dev/null',
            '-w',
            '%{http_code}',
            '--max-time',
            '5',
            'http://google.com',
          ],
          { stdout: true },
        ).trim();
        logger.info(`VM ${vmName} HTTP connectivity: ${httpStatus}`);
        logger.info(`Health report for VM: ${vmName}`);
        UnderpostLxd._lxc(['list', vmName, '--format', 'json']);
        // `lxc exec` runs as root in the guest.
        for (const check of [
          ['bash', '-c', 'top -bn1 | grep "Cpu(s)"'],
          ['free', '-m'],
          ['df', '-h', '/'],
          ['ip', 'a'],
          ['cat', '/etc/resolv.conf'],
          ['k3s', 'kubectl', 'get', 'nodes'],
        ])
          UnderpostLxd._lxc(['exec', vmName, '--', ...check]);
      }
    },
  };

  // =====================================================================
  // PRIVATE HELPERS — lookups that legitimately tolerate "absent" return
  // values do so via list-style commands that always exit 0, not by
  // suppressing error signals from destructive commands.
  // =====================================================================

  /**
   * Lists all LXD VM (virtual-machine) instance names. Returns [] when no VMs.
   * `lxc list --format json` always exits 0; an empty cluster yields `[]`.
   * @returns {string[]}
   * @private
   */
  static _listVms() {
    const list = JSON.parse(
      UnderpostLxd._lxc(['list', '--format', 'json'], { stdout: true, silent: true }).trim() || '[]',
    );
    return list.filter((instance) => instance?.type === 'virtual-machine' && instance.name).map(({ name }) => name);
  }

  /**
   * Returns the named VM's status string (e.g. 'Running', 'Stopped', 'Frozen')
   * or `null` if the VM does not exist. Never throws on absence.
   * @param {string} vmName
   * @returns {string|null}
   * @private
   */
  static _vmState(vmName) {
    const inst = UnderpostLxd._instance(vmName);
    return inst ? inst.status || 'Unknown' : null;
  }

  /**
   * @param {string} vmName
   * @returns {boolean}
   * @private
   */
  static _vmExists(vmName) {
    return UnderpostLxd._vmState(vmName) !== null;
  }

  /**
   * Resolves the VM's primary IPv4, preferring the guest interface that owns
   * the default route. This avoids selecting K3s bridge/CNI addresses like
   * 10.42.0.1 after the control plane comes up.
   * @param {string} vmName
   * @returns {string}
   * @private
   */
  static _vmIpv4(vmName) {
    const defaultRoute = UnderpostLxd._lxc(['exec', vmName, '--', 'ip', '-4', '-o', 'route', 'show', 'default'], {
      stdout: true,
    }).trim();
    const defaultRouteTokens = defaultRoute ? defaultRoute.split(/\s+/) : [];
    const devIndex = defaultRouteTokens.indexOf('dev');
    const defaultIface = devIndex >= 0 ? defaultRouteTokens[devIndex + 1] || '' : '';

    if (defaultIface) {
      const defaultIfaceAddr = UnderpostLxd._lxc(
        ['exec', vmName, '--', 'ip', '-4', '-o', 'addr', 'show', 'dev', defaultIface, 'scope', 'global'],
        { stdout: true },
      ).trim();
      const routeScopedIp = defaultIfaceAddr.match(/\binet\s+([0-9.]+)\//)?.[1] || '';
      if (routeScopedIp) return routeScopedIp;
    }

    return (
      Object.entries(UnderpostLxd._instance(vmName)?.state?.network || {})
        .filter(([name]) => name !== 'lo')
        .flatMap(([, network]) => network.addresses || [])
        .find(
          ({ family, scope, address }) =>
            family === 'inet' && scope === 'global' && !/^10\.42\.|^10\.43\.|^169\.254\./.test(address),
        )?.address || ''
    );
  }

  /**
   * Pins the VM's lxdbr0 NIC to a static `ipv4.address` equal to `vmIp`, which
   * NAT-mode proxy devices require. `security.ipv4_filtering=true` is set in the
   * same call: lxdbr0 runs no DHCP, and LXD only permits a static NIC address
   * on a DHCP-less managed bridge when filtering is enabled (it also anti-spoofs
   * the VM to that IP). The eth0 NIC comes from admin-profile, so override it on
   * first touch and set thereafter. Same IP as the current lease -> no disruption.
   * @param {string} vmName
   * @param {string} vmIp
   * @private
   */
  static _ensureNicStaticIpv4(vmName, vmIp) {
    const nic = 'eth0';
    const instanceDevices = UnderpostLxd._instance(vmName)?.devices || {};
    const currentStatic = instanceDevices[nic]?.['ipv4.address'] || '';
    const hasLocalNic = !!instanceDevices[nic];
    const verb = hasLocalNic ? 'set' : 'override';
    if (currentStatic !== vmIp) {
      UnderpostLxd._lxc([
        'config',
        'device',
        verb,
        vmName,
        nic,
        `ipv4.address=${vmIp}`,
        'security.ipv4_filtering=true',
      ]);
      logger.info(`  Pinned ${vmName} NIC ${nic} to static ${vmIp} (required for NAT proxy on VMs).`);
    } else {
      UnderpostLxd._lxc(['config', 'device', 'set', vmName, nic, 'security.ipv4_filtering=true'], {
        silentOnError: true,
      });
      logger.info(`  NIC ${nic} on ${vmName} already pinned to static ${vmIp}.`);
    }
  }

  /**
   * Returns true if a named device is currently attached (expanded) to the VM.
   * @param {string} vmName
   * @param {string} deviceName
   * @returns {boolean}
   * @private
   */
  static _vmHasDevice(vmName, deviceName) {
    return Object.hasOwn(UnderpostLxd._instance(vmName)?.expanded_devices || {}, deviceName);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   * @private
   */
  static _profileExists(name) {
    const raw = UnderpostLxd._lxc(['profile', 'list', '--format', 'json'], { stdout: true, silent: true }).trim();
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) && arr.some((p) => p?.name === name);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   * @private
   */
  static _networkExists(name) {
    const raw = UnderpostLxd._lxc(['network', 'list', '--format', 'json'], { stdout: true, silent: true }).trim();
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) && arr.some((n) => n?.name === name);
  }

  /**
   * True once `lxd init --preseed` has bootstrapped this daemon. Detected by the
   * presence of any storage pool: the preseed creates `local`, and a fresh
   * daemon has none. `lxc storage list` exits 0 with `[]` before init, so this
   * never throws on a not-yet-initialized host.
   * @returns {boolean}
   * @private
   */
  static _lxdInitialized() {
    const raw = UnderpostLxd._lxc(['storage', 'list', '--format', 'json'], {
      stdout: true,
      silent: true,
      silentOnError: true,
    }).trim();
    if (!raw) return false;
    let arr;
    try {
      arr = JSON.parse(raw);
    } catch {
      return false;
    }
    return Array.isArray(arr) && arr.length > 0;
  }

  /**
   * Adds the bridge to the firewalld `trusted` zone so VM<->host and VM
   * outbound traffic isn't dropped by the host firewall. An interface the zone
   * already holds is a no-op, a host without firewalld is skipped with a
   * warning, and a failed change or reload fails.
   * @param {string} bridge
   * @private
   */
  static _ensureBridgeInTrustedZone(bridge) {
    if (shellExec('command -v firewall-cmd', { silent: true, silentOnError: true, disableLog: true }).code !== 0) {
      logger.warn(`firewall-cmd is not installed; ${bridge} is not bound to the trusted zone.`);
      return;
    }
    const privileged = `binds ${bridge} to the trusted firewalld zone`;
    const zone = `--permanent --zone=trusted`;
    const interfaceArg = shellArgumentFactory(bridge);
    if (
      shellExec(`firewall-cmd ${zone} --query-interface=${interfaceArg}`, {
        silent: true,
        silentOnError: true,
        privileged,
      }).code === 0
    )
      return;
    shellExec(`firewall-cmd ${zone} --add-interface=${interfaceArg}`, { privileged });
    shellExec('firewall-cmd --reload', { privileged });
  }

  /**
   * Explicitly accepts forwarded traffic to/from the plain bridge in the
   * iptables FORWARD chain. A LXD-managed bridge inserts these itself
   * (`ipv4.firewall=true`); a plain bridge does not, so on a host where Docker
   * has set the FORWARD policy to DROP, VM<->VM traffic on lxdbr0 (e.g. a k3s
   * worker dialing the control plane API) is silently dropped once br_netfilter
   * routes bridged frames through netfilter. Rules are prepended (position 1) so
   * they win over Docker's DROP, and guarded by `-C` so re-runs don't duplicate.
   * Not persisted across reboots/iptables flush by design — re-run
   * `--create-virtual-network`, consistent with the rest of this lab flow.
   * @param {string} bridge
   * @private
   */
  static _ensureBridgeForwardingAccept(bridge) {
    for (const dir of ['-i', '-o']) ensureIptablesRule('FORWARD', [dir, bridge, '-j', 'ACCEPT']);
    logger.info(`Ensured FORWARD ACCEPT for ${bridge} (counters Docker/default DROP for VM<->VM traffic).`);
  }

  /**
   * Returns true if a snap with the given name is installed. `snap list` exits
   * 0 with the full installed-snap table; we grep for an exact-name row.
   * @param {string} name
   * @returns {boolean}
   * @private
   */
  static _snapInstalled(name) {
    const raw = shellExec(`snap list`, { stdout: true });
    return raw.split('\n').some((line) => new RegExp(`^${name}\\s`).test(line));
  }

  /**
   * Runs a command inside a VM with Node/NPM restored from the NVM install
   * that k3s-node-setup.sh lays down. Non-login `bash -c` shells do not keep
   * that PATH, so resolve it explicitly here.
   * @param {string} vmName
   * @param {string} command
   * @param {object} [options]
   * @param {boolean} [options.requireNpm=false]
   * @param {number} [options.timeoutSeconds=0]
   * @private
   */
  static _execVmNodeCommand(vmName, command, options = { requireNpm: false, timeoutSeconds: 0 }) {
    const { requireNpm = false, timeoutSeconds = 0 } = options;
    const runtimeBootstrap = [
      'export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"',
      '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
      `if ! command -v node >/dev/null 2>&1${requireNpm ? ' || ! command -v npm >/dev/null 2>&1' : ''}; then latest_nvm_bin="$(ls -d "$NVM_DIR"/versions/node/*/bin 2>/dev/null | sort -V | tail -n 1)"; if [ -n "$latest_nvm_bin" ]; then export PATH="$latest_nvm_bin:$PATH"; fi; fi`,
      'command -v node >/dev/null 2>&1 || { echo "ERROR: node not found in PATH or NVM_DIR=$NVM_DIR" >&2; exit 127; }',
      requireNpm
        ? 'command -v npm >/dev/null 2>&1 || { echo "ERROR: npm not found in PATH or NVM_DIR=$NVM_DIR" >&2; exit 127; }'
        : '',
      command,
    ]
      .filter(Boolean)
      .join(' && ');
    const lxcExecCmd = UnderpostLxd._lxcLine(['exec', vmName, '--', 'bash', '-lc', runtimeBootstrap]);
    return UnderpostLxd._run(timeoutSeconds > 0 ? `timeout ${timeoutSeconds} ${lxcExecCmd}` : lxcExecCmd);
  }

  /**
   * Deterministic per-VM IPv4 in the lxdbr0 /24, used as the static fallback
   * inside lxd-vm-setup.sh when DHCP is unavailable. The previous shared
   * `10.250.250.100/24` fallback caused IP collisions across VMs and broke
   * worker→control K3s joins (the worker dialed its own NIC). Offset is the
   * sum of vmName char codes mod 253, +2 — avoids .0, .1 (gateway), .255.
   * @param {string} vmName
   * @returns {string}
   * @private
   */
  static _allocateFallbackIp(vmName) {
    let sum = 0;
    for (let i = 0; i < vmName.length; i++) sum += vmName.charCodeAt(i);
    return `${BRIDGE_SUBNET_PREFIX}.${(sum % 253) + 2}`;
  }

  /**
   * Reads the K3s join info (control plane IPv4 + node token) from the control
   * VM. The control must already be running — VMs created with `admin-profile`
   * have `boot.autostart=false`, so after a host reboot bring it up explicitly
   * ('lxc start <control>' or 'node bin lxd --restore') before joining a worker.
   * Throws if either value is missing — callers depend on both.
   * @param {string} controlNode
   * @returns {{ip: string, token: string}}
   * @private
   */
  static _readControlPlaneJoinInfo(controlNode) {
    const state = UnderpostLxd._vmState(controlNode);
    if (state === null) {
      throw new Error(`Control node VM '${controlNode}' does not exist.`);
    }
    if (state !== 'Running') {
      throw new Error(
        `Control node VM '${controlNode}' is ${state}. Start it first ('lxc start ${controlNode}' or 'node bin lxd --restore'), then re-run the worker join.`,
      );
    }
    // `lxc exec` runs as root in the guest, which owns the token.
    const token = UnderpostLxd._lxc(['exec', controlNode, '--', 'cat', '/var/lib/rancher/k3s/server/node-token'], {
      stdout: true,
      silent: true,
      disableLog: true,
    }).trim();
    const ip = UnderpostLxd._vmIpv4(controlNode);
    if (!ip || !token) {
      throw new Error(
        `Could not read join info from control node '${controlNode}' (ip='${ip}', token ${token ? 'read' : 'missing'}).`,
      );
    }
    return { ip, token };
  }

  /**
   * Applies the `node-role.kubernetes.io/worker` label to a freshly joined
   * worker. A K3s agent cannot self-apply `node-role.kubernetes.io/*` labels
   * (the NodeRestriction admission plugin rejects them), so the label must be
   * set from the control plane after the worker registers — otherwise the node
   * shows ROLES `<none>`. The K3s node name defaults to the VM hostname, which
   * LXD sets to the instance name, so `workerName` is the VM name. Waits up to
   * 60s for the node to appear before labeling.
   * @param {string} controlNode
   * @param {string} workerName
   * @private
   */
  static _labelWorkerNodeRole(controlNode, workerName) {
    logger.info(`Labeling worker '${workerName}' as node-role.kubernetes.io/worker (from control '${controlNode}')...`);
    UnderpostLxd._lxc([
      'exec',
      controlNode,
      '--',
      'bash',
      '-c',
      `for i in $(seq 1 30); do if k3s kubectl get node ${workerName} >/dev/null 2>&1; then k3s kubectl label node ${workerName} node-role.kubernetes.io/worker=worker --overwrite && exit 0; fi; sleep 2; done; echo "WARN: worker ${workerName} did not register within 60s; role label not applied." >&2`,
    ]);
  }

  /**
   * Enumerates and removes every device of `type: proxy` attached to a VM
   * (the `--expose` NAT proxy devices). Naming-agnostic. Skips if the VM is
   * already gone; otherwise every `lxc config device remove` propagates errors.
   * @param {string} vmName
   * @private
   */
  static _removeProxyDevices(vmName) {
    if (!UnderpostLxd._vmExists(vmName)) {
      logger.info(`  Skipping proxy cleanup: VM '${vmName}' is already gone.`);
      return;
    }
    logger.info(`  Removing proxy devices from ${vmName}...`);
    const expandedDevices = UnderpostLxd._instance(vmName)?.expanded_devices || {};
    const proxyNames = Object.entries(expandedDevices)
      .filter(([, dev]) => dev?.type === 'proxy')
      .map(([name]) => name);
    if (proxyNames.length === 0) {
      logger.info(`  No proxy devices found on ${vmName}.`);
      return;
    }
    for (const name of proxyNames) {
      logger.info(`    Removing device: ${name}`);
      UnderpostLxd._lxc(['config', 'device', 'remove', vmName, name]);
    }
  }

  /**
   * Delegates K3s teardown inside a running VM to the centralized
   * `safeResetK3s` in src/cli/cluster.js via `lxc exec`. No-op when K3s or the
   * engine mirror is missing. Bounded by `timeout 300`.
   * @param {string} vmName
   * @param {'drain'|'full'} resetMode - `drain` preserves K3s for next boot
   *   (`--shutdown`); `full` uninstalls (`--vm-delete` / `--reset` / `--purge`).
   * @private
   */
  static _resetK3sInVm(vmName, resetMode) {
    if (UnderpostLxd._vmState(vmName) !== 'Running') return;
    const m = resetMode === 'drain' ? 'drain' : 'full';
    const probe = `if test -x /usr/local/bin/k3s && test -d ${ENGINE_ROOT_IN_VM}/bin; then echo yes; else echo no; fi`;
    const probeOut = UnderpostLxd._lxc(['exec', vmName, '--', 'bash', '-c', probe], { stdout: true }).trim();
    if (probeOut !== 'yes') {
      logger.info(`  [${vmName}] No K3s+engine detected (probe=${probeOut}); skipping K3s reset.`);
      return;
    }
    logger.info(`  [${vmName}] Resetting K3s (resetMode=${m}) via 'node bin cluster --reset --k3s --reset-mode=${m}'`);
    UnderpostLxd._execVmNodeCommand(
      vmName,
      `cd ${ENGINE_ROOT_IN_VM} && node bin cluster --dev --reset --k3s --reset-mode=${m}`,
      { timeoutSeconds: 300 },
    );
  }

  /**
   * Safely deletes a single VM. Pre-conditions gate every step; absence is a
   * no-op, but unexpected failures propagate.
   *
   *   1. If VM is absent → log and return.
   *   2. Remove every proxy device (clears iptables NAT before the VM goes away).
   *   3. If state is Running/Frozen → graceful stop with 30 s timeout.
   *   4. Delete the VM.
   *
   * @param {string} vmName
   * @private
   */
  static _safeDeleteVm(vmName) {
    const state = UnderpostLxd._vmState(vmName);
    if (state === null) {
      logger.info(`VM '${vmName}' does not exist. Nothing to do.`);
      return;
    }
    logger.info(`Deleting VM '${vmName}' (current state: ${state})...`);
    UnderpostLxd._removeProxyDevices(vmName);
    if (state === 'Running' || state === 'Frozen') {
      UnderpostLxd._resetK3sInVm(vmName, 'full');
      logger.info(`  Stopping VM: ${vmName}`);
      UnderpostLxd._lxc(['stop', vmName, '--timeout', '60']);
    }
    logger.info(`  Deleting VM: ${vmName}`);
    UnderpostLxd._lxc(['delete', vmName]);
    logger.info(`VM ${vmName} deleted.`);
  }

  /**
   * Host-safe reset. Wipes per-VM state and the network/profile this CLI owns.
   * Leaves the LXD snap and storage pools intact so the host stays bootable
   * even if the daemon has internal issues. Use `--purge` for snap removal.
   *
   *   Phase 1: Remove proxy devices from every VM (clears iptables NAT rules).
   *   Phase 2: Stop running VMs gracefully (30 s timeout each).
   *   Phase 3: Delete every VM.
   *   Phase 4: Drop `admin-profile` and the `lxdbr0` network if they exist.
   *
   * @private
   */
  static _safeReset() {
    logger.info('=== LXD RESET (host-safe) ===');
    const vmList = UnderpostLxd._listVms();

    logger.info(`Phase 1/4: Removing proxy devices from ${vmList.length} VM(s)...`);
    for (const vmName of vmList) {
      UnderpostLxd._removeProxyDevices(vmName);
    }

    logger.info('Phase 2/4: Full K3s teardown + stopping running VMs gracefully...');
    for (const vmName of vmList) {
      const state = UnderpostLxd._vmState(vmName);
      if (state === 'Running' || state === 'Frozen') {
        UnderpostLxd._resetK3sInVm(vmName, 'full');
        logger.info(`  Stopping VM: ${vmName}`);
        UnderpostLxd._lxc(['stop', vmName, '--timeout', '60']);
      } else if (state !== null) {
        logger.info(`  VM ${vmName} already in state: ${state}`);
      }
    }

    logger.info('Phase 3/4: Deleting all VMs...');
    for (const vmName of vmList) {
      if (UnderpostLxd._vmExists(vmName)) {
        logger.info(`  Deleting VM: ${vmName}`);
        UnderpostLxd._lxc(['delete', vmName]);
      }
    }

    logger.info(`Phase 4/4: Removing ${ADMIN_PROFILE} and ${BRIDGE_NETWORK} if present...`);
    if (UnderpostLxd._profileExists(ADMIN_PROFILE)) {
      UnderpostLxd._lxc(['profile', 'delete', ADMIN_PROFILE]);
    }
    if (UnderpostLxd._networkExists(BRIDGE_NETWORK)) {
      UnderpostLxd._lxc(['network', 'delete', BRIDGE_NETWORK]);
    }

    logger.info('=== LXD RESET COMPLETE ===');
    logger.info('Snap and storage pools were NOT touched. Use --purge to remove the LXD snap.');
  }

  /**
   * Removes the LXD snap. ALWAYS preceded by `lxd shutdown --timeout 60` so
   * the daemon flushes the ZFS pool cleanly. Without that flush, removing the
   * snap while VMs are running and the pool is dirty has historically left the
   * host unbootable. This is the safe variant.
   *
   * @private
   */
  static _safePurge() {
    logger.info('=== LXD PURGE (DESTRUCTIVE) ===');
    if (!UnderpostLxd._snapInstalled('lxd')) {
      logger.info('LXD snap is not installed. Nothing to purge.');
      return;
    }
    // Drain K3s inside every VM before lxd shutdown so containerd unmounts
    // cleanly and the ZFS pool isn't dirty when the daemon flushes.
    const vmList = UnderpostLxd._listVms();
    if (vmList.length > 0) {
      logger.info(`Phase 1/3: Full K3s teardown inside ${vmList.length} VM(s)...`);
      for (const vmName of vmList) UnderpostLxd._resetK3sInVm(vmName, 'full');
    } else {
      logger.info('Phase 1/3: No VMs to process.');
    }
    logger.info('Phase 2/3: Asking LXD daemon to shut down cleanly (60s timeout)...');
    UnderpostLxd._shutdownDaemon();
    logger.info('Phase 3/3: Removing LXD snap and ALL its data (instances, storage pools)...');
    shellExec('snap remove lxd --purge', { privileged: 'removes the LXD snap and all its data' });
    logger.info('=== LXD PURGE COMPLETE ===');
  }

  /**
   * Asks the LXD daemon to shut down cleanly, so its storage pool is flushed.
   * @private
   */
  static _shutdownDaemon() {
    shellExec(`${LXD_DAEMON} shutdown --timeout 60`, { privileged: 'shuts the LXD daemon down cleanly' });
  }

  /**
   * Pre-host-reboot procedure. Gracefully stops every running VM, then asks
   * the LXD daemon to shut down. Run this before `reboot` / `poweroff` so the
   * storage pool is clean on next boot.
   *
   * @private
   */
  static _gracefulShutdownAll() {
    logger.info('=== LXD GRACEFUL SHUTDOWN (pre-host-reboot) ===');
    const vmList = UnderpostLxd._listVms();
    for (const vmName of vmList) {
      const state = UnderpostLxd._vmState(vmName);
      if (state === 'Running' || state === 'Frozen') {
        UnderpostLxd._resetK3sInVm(vmName, 'drain');
        logger.info(`  Stopping VM: ${vmName} (timeout 60s)`);
        UnderpostLxd._lxc(['stop', vmName, '--timeout', '60']);
      } else {
        logger.info(`  VM ${vmName} already in state: ${state}`);
      }
    }
    if (UnderpostLxd._snapInstalled('lxd')) {
      logger.info('Asking LXD daemon to shut down cleanly (timeout 60s)...');
      UnderpostLxd._shutdownDaemon();
    }
    logger.info('=== HOST IS SAFE TO REBOOT/POWEROFF ===');
  }

  /**
   * Symmetric counterpart to `_gracefulShutdownAll`. Brings the lab back up:
   *
   *   1. Start the LXD daemon via `snap start lxd` (idempotent).
   *   2. Wait up to 30 s for `lxc info` to respond, so we don't race the
   *      daemon's socket-bring-up.
   *   3. Start every VM that exists. Skips VMs that are already Running.
   *
   * VMs created with `admin-profile` have `boot.autostart=false` by design
   * (host-safety), so this command is how you explicitly bring them online.
   *
   * @private
   */
  static _restoreAll() {
    logger.info('=== LXD RESTORE (bring lab back up) ===');
    if (!UnderpostLxd._snapInstalled('lxd')) {
      throw new Error('LXD snap is not installed; nothing to restore.');
    }
    logger.info('Starting LXD daemon...');
    shellExec('snap start lxd', { privileged: 'starts the LXD daemon' });

    // Wait for the daemon's REST socket to be responsive before issuing
    // instance commands. `lxc info` (no args) is the cheapest readiness probe.
    logger.info('Waiting for LXD daemon to become responsive...');
    let ready = false;
    for (let i = 0; i < 15; i++) {
      try {
        UnderpostLxd._lxc(['info'], { stdout: true, silent: true });
        ready = true;
        break;
      } catch (err) {
        if (err.expected) throw err;
        if (i === 0) logger.info(`  (daemon not ready yet: ${err.message.split('\n')[0]})`);
      }
      sleepSync(2000);
    }
    if (!ready) {
      throw new Error('LXD daemon did not become responsive within 30s.');
    }
    logger.info('LXD daemon is responsive.');

    const vmList = UnderpostLxd._listVms();
    logger.info(`Starting ${vmList.length} VM(s)...`);
    for (const vmName of vmList) {
      const state = UnderpostLxd._vmState(vmName);
      if (state === 'Running') {
        logger.info(`  ${vmName} already running.`);
      } else {
        logger.info(`  Starting VM: ${vmName} (was: ${state})`);
        UnderpostLxd._lxc(['start', vmName]);
      }
    }
    logger.info('=== LXD RESTORE COMPLETE ===');
  }

  /**
   * Replicates `/home/dd/engine` on the host into the VM, respecting the
   * project `.gitignore`. If `engine-private/` exists on the host it is
   * pushed in a second pass (it is gitignored at the root by design).
   *
   * Idempotent: replaces only the contents of `ENGINE_ROOT_IN_VM`, not the
   * directory inode (avoids races with running watchers / shells inside the VM).
   *
   * @param {string} vmName
   * @private
   */
  static async _bootstrapEngineSource(vmName) {
    if (!UnderpostLxd._vmExists(vmName)) {
      throw new Error(`Cannot bootstrap engine into '${vmName}': VM does not exist.`);
    }
    if (!fs.existsSync(ENGINE_ROOT_ON_HOST)) {
      throw new Error(`Host engine source missing at ${ENGINE_ROOT_ON_HOST}.`);
    }

    const scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-lxd-push-'));
    const push = async (source, target) => {
      const files = await new Promise((resolve, reject) =>
        walk({ path: source, ignoreFiles: ['.gitignore'], includeEmpty: false, follow: false }, (err, result) =>
          err ? reject(err) : resolve(result),
        ),
      );
      const list = nodePath.join(scratch, 'files');
      fs.writeFileSync(list, files.join('\n'));
      UnderpostLxd._lxc([
        'exec',
        vmName,
        '--',
        'bash',
        '-c',
        `mkdir -p ${target} && find ${target} -mindepth 1 -delete`,
      ]);
      UnderpostLxd._run(
        `set -o pipefail; tar -C ${shellArgumentFactory(source)} -cf - --files-from=${shellArgumentFactory(list)} | ${UnderpostLxd._lxcLine(['exec', vmName, '--', 'tar', '-C', target, '-xf', '-'])}`,
      );
    };
    try {
      await push(ENGINE_ROOT_ON_HOST, ENGINE_ROOT_IN_VM);
      // engine-private is ignored by the root .gitignore, so it goes in a second pass.
      const privateSrcPath = `${ENGINE_ROOT_ON_HOST}/engine-private`;
      if (fs.existsSync(privateSrcPath)) await push(privateSrcPath, `${ENGINE_ROOT_IN_VM}/engine-private`);
    } finally {
      fs.removeSync(scratch);
    }

    logger.info(`  Engine source mirrored into ${vmName}:${ENGINE_ROOT_IN_VM}`);
  }
}

export default UnderpostLxd;
