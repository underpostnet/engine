/**
 * LXD module for managing LXD virtual machines as K3s nodes.
 * @module src/cli/lxd.js
 * @namespace UnderpostLxd
 *
 */

import { getNpmRootPath } from '../server/conf.js';
import { pbcopy, shellExec } from '../server/process.js';
import walk from 'ignore-walk';
import fs from 'fs-extra';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

const ENGINE_ROOT_IN_VM = '/home/dd/engine';
const ENGINE_ROOT_ON_HOST = '/home/dd/engine';
const ADMIN_PROFILE = 'admin-profile';
const BRIDGE_NETWORK = 'lxdbr0';
const BRIDGE_SUBNET_PREFIX = '10.250.250';

class UnderpostLxd {
  static _project = '';

  static _lxcCmd() {
    return UnderpostLxd._project ? `lxc --project ${UnderpostLxd._project}` : 'lxc';
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
      const currentVmId = vmId ? String(vmId).trim() : '';
      const vmCreate = options.vmCreate === true;
      const vmDelete = options.vmDelete === true;
      const vmInfo = options.vmInfo === true;
      const vmInit = options.vmInit === true;
      const vmTest = options.vmTest === true;
      const vmSyncEngine = options.vmSyncEngine === true;
      UnderpostLxd._project = options.maasProject ? String(options.maasProject).trim() : '';

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
          shellExec(`sudo snap install lxd`);
        }
      }

      // =====================================================================
      // INIT (LXD preseed)
      // =====================================================================
      if (options.init === true) {
        shellExec(`sudo systemctl start snap.lxd.daemon`);
        shellExec(`sudo systemctl status snap.lxd.daemon`);
        if (UnderpostLxd._lxdInitialized()) {
          logger.info('LXD is already initialized (storage pool present); skipping preseed.');
        } else {
          const lxdPreseedContent = fs
            .readFileSync(`${underpostRoot}/manifests/lxd/lxd-preseed.yaml`, 'utf8')
            .replaceAll(`127.0.0.1`, Underpost.dns.getLocalIPv4Address());
          shellExec(`echo "${lxdPreseedContent}" | lxd init --preseed`);
        }
        shellExec(`${UnderpostLxd._lxcCmd()} cluster list`);
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
          for (const [key, value] of Object.entries(bridgeSettings)) {
            shellExec(`${UnderpostLxd._lxcCmd()} network set ${BRIDGE_NETWORK} ${key} "${value}"`);
          }
        } else {
          const inlineConfig = Object.entries(bridgeSettings)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
          shellExec(`${UnderpostLxd._lxcCmd()} network create ${BRIDGE_NETWORK} ${inlineConfig}`);
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
          shellExec(
            `cat ${underpostRoot}/manifests/lxd/lxd-admin-profile.yaml | ${UnderpostLxd._lxcCmd()} profile edit ${ADMIN_PROFILE}`,
          );
          shellExec(`${UnderpostLxd._lxcCmd()} profile show ${ADMIN_PROFILE}`);
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
        const rawState = shellExec(`lxc list ${currentVmId} --format json`, { stdout: true }).trim();
        const arr = JSON.parse(rawState || '[]');
        const inst = Array.isArray(arr) ? arr.find((i) => i?.name === currentVmId) : null;
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
        const targetProfilesRaw = shellExec(`${UnderpostLxd._lxcCmd()} profile list --format json`, {
          stdout: true,
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
          shellExec(
            `lxc --project default profile show ${profileName} | ${UnderpostLxd._lxcCmd()} profile edit ${profileName}`,
          );
          logger.info(`  Profile '${profileName}' synced.`);
        }

        if (inst.status === 'Running' || inst.status === 'Frozen') {
          logger.info(`Stopping VM '${currentVmId}' before cross-project move...`);
          shellExec(`lxc stop ${currentVmId} --timeout 60`);
        }
        logger.info(`Moving VM '${currentVmId}' to project '${UnderpostLxd._project}'...`);
        shellExec(`lxc move ${currentVmId} ${currentVmId} --target-project ${UnderpostLxd._project}`);
        logger.info(`VM '${currentVmId}' is now in project '${UnderpostLxd._project}'. Starting...`);
        shellExec(`${UnderpostLxd._lxcCmd()} start ${currentVmId}`);
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
        shellExec(
          `cat ${lxdSetupPath} | ${UnderpostLxd._lxcCmd()} exec ${vmName} --env LXD_FALLBACK_IPV4_CIDR=${fallbackIp}/24 --env LXD_NODE_NAME=${vmName} -- bash`,
        );

        logger.info(`[${vmName}] Step 2/3: Bootstrapping engine source into VM...`);
        await UnderpostLxd._bootstrapEngineSource(vmName);

        // Step 3: K3s role setup, driven by the local engine source.
        logger.info(`[${vmName}] Step 3/3: K3s role setup...`);
        const baseArgs = `--engine-root=${ENGINE_ROOT_IN_VM}`;
        if (options.worker === true) {
          if (!options.joinNode) {
            throw new Error(
              `--vm-init --worker requires --join-node <controlVmName>. A worker is meaningless without a control plane to join; the script would only fail after npm install completes.`,
            );
          }
          const controlNode = options.joinNode.includes(',') ? options.joinNode.split(',').pop() : options.joinNode;
          const { ip: controlPlaneIp, token: k3sToken } = UnderpostLxd._readControlPlaneJoinInfo(controlNode);
          logger.info(`[${vmName}] Joining control plane ${controlNode} (${controlPlaneIp})`);
          shellExec(
            `cat ${k3sSetupPath} | ${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -s -- ${baseArgs} --worker --control-ip=${controlPlaneIp} --token=${k3sToken}`,
          );
          UnderpostLxd._labelWorkerNodeRole(controlNode, vmName);
        } else {
          shellExec(
            `cat ${k3sSetupPath} | ${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -s -- ${baseArgs} --control`,
          );
        }
        logger.info(`[${vmName}] Init complete. Engine mirrored at ${ENGINE_ROOT_IN_VM}.`);
      }

      // =====================================================================
      // STANDALONE JOIN
      // =====================================================================
      if (options.joinNode && !vmInit) {
        const [workerNode, controlNode] = options.joinNode.split(',');
        if (!workerNode || !controlNode) {
          throw new Error(`--join-node standalone requires 'workerName,controlName' format.`);
        }
        if (!UnderpostLxd._vmExists(workerNode)) {
          throw new Error(`Worker VM '${workerNode}' does not exist.`);
        }
        const { ip: controlPlaneIp, token: k3sToken } = UnderpostLxd._readControlPlaneJoinInfo(controlNode);
        const k3sSetupPath = `${underpostRoot}/scripts/k3s-node-setup.sh`;
        logger.info(`Joining K3s worker ${workerNode} to control plane ${controlNode} (${controlPlaneIp})`);
        shellExec(
          `cat ${k3sSetupPath} | ${UnderpostLxd._lxcCmd()} exec ${workerNode} -- bash -s -- --engine-root=${ENGINE_ROOT_IN_VM} --worker --control-ip=${controlPlaneIp} --token=${k3sToken}`,
        );
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
        shellExec(`${UnderpostLxd._lxcCmd()} config show ${vmName}`);
        shellExec(`${UnderpostLxd._lxcCmd()} info --show-log ${vmName}`);
        shellExec(`${UnderpostLxd._lxcCmd()} info ${vmName}`);
        shellExec(`${UnderpostLxd._lxcCmd()} list ${vmName}`);
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
        const [vmName, ports] = options.expose.split(':');
        const protocols = ['tcp'];
        const hostIp = Underpost.dns.getLocalIPv4Address();
        const exposedHostPorts = ports
          .split(',')
          .map((port) => port.trim())
          .filter((port) => port.length > 0);
        const vmIp = UnderpostLxd._vmIpv4(vmName);
        if (!vmIp) {
          throw new Error(`Could not resolve VM IP for ${vmName}. Cannot expose ports.`);
        }
        UnderpostLxd._ensureNicStaticIpv4(vmName, vmIp);
        for (const port of exposedHostPorts) {
          const connectPort = options.nodePort ? options.nodePort : port;
          for (const protocol of protocols) {
            const deviceName = `${vmName}-${protocol}-port-${port}`;
            if (UnderpostLxd._vmHasDevice(vmName, deviceName)) {
              shellExec(`${UnderpostLxd._lxcCmd()} config device remove ${vmName} ${deviceName}`);
            }
            shellExec(
              `${UnderpostLxd._lxcCmd()} config device add ${vmName} ${deviceName} proxy listen=${protocol}:${hostIp}:${port} connect=${protocol}:${vmIp}:${connectPort} nat=true`,
            );
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
        const [vmName, ports] = options.deleteExpose.split(':');
        const protocols = ['tcp'];
        for (const port of ports.split(',')) {
          for (const protocol of protocols) {
            const deviceName = `${vmName}-${protocol}-port-${port}`;
            if (UnderpostLxd._vmHasDevice(vmName, deviceName)) {
              shellExec(`${UnderpostLxd._lxcCmd()} config device remove ${vmName} ${deviceName}`);
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
        const httpStatus = shellExec(
          `${UnderpostLxd._lxcCmd()} exec ${vmName} -- curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://google.com`,
          { stdout: true },
        ).trim();
        logger.info(`VM ${vmName} HTTP connectivity: ${httpStatus}`);
        logger.info(`Health report for VM: ${vmName}`);
        shellExec(`${UnderpostLxd._lxcCmd()} list ${vmName} --format json`);
        shellExec(`${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c 'top -bn1 | grep "Cpu(s)"'`);
        shellExec(`${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c 'free -m'`);
        shellExec(`${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c 'df -h /'`);
        shellExec(`${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c 'ip a'`);
        shellExec(`${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c 'cat /etc/resolv.conf'`);
        shellExec(`${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c 'sudo k3s kubectl get nodes'`);
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
    const raw = shellExec(
      `${UnderpostLxd._lxcCmd()} list --format json | jq -r '.[] | select(.type=="virtual-machine") | .name // empty'`,
      {
        stdout: true,
      },
    ).trim();
    if (!raw) return [];
    return raw.split('\n').filter((n) => n.length > 0);
  }

  /**
   * Returns the named VM's status string (e.g. 'Running', 'Stopped', 'Frozen')
   * or `null` if the VM does not exist. Never throws on absence.
   * @param {string} vmName
   * @returns {string|null}
   * @private
   */
  static _vmState(vmName) {
    const raw = shellExec(`${UnderpostLxd._lxcCmd()} list ${vmName} --format json`, { stdout: true }).trim();
    if (!raw) return null;
    const arr = JSON.parse(raw);
    const inst = Array.isArray(arr) ? arr.find((i) => i?.name === vmName) : null;
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
    const defaultRoute = shellExec(`${UnderpostLxd._lxcCmd()} exec ${vmName} -- ip -4 -o route show default`, {
      stdout: true,
    }).trim();
    const defaultRouteTokens = defaultRoute ? defaultRoute.split(/\s+/) : [];
    const devIndex = defaultRouteTokens.indexOf('dev');
    const defaultIface = devIndex >= 0 ? defaultRouteTokens[devIndex + 1] || '' : '';

    if (defaultIface) {
      const defaultIfaceAddr = shellExec(
        `${UnderpostLxd._lxcCmd()} exec ${vmName} -- ip -4 -o addr show dev ${defaultIface} scope global`,
        {
          stdout: true,
        },
      ).trim();
      const routeScopedIp = defaultIfaceAddr.match(/\binet\s+([0-9.]+)\//)?.[1] || '';
      if (routeScopedIp) return routeScopedIp;
    }

    return shellExec(
      `${UnderpostLxd._lxcCmd()} list ${vmName} --format json | jq -r '[.[0].state.network | to_entries[] | select(.key!="lo") | .value.addresses[]? | select(.family=="inet" and .scope=="global") | .address | select(test("^10\\.42\\.|^10\\.43\\.|^169\\.254\\.") | not)] | .[0] // empty'`,
      { stdout: true },
    ).trim();
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
    const raw = shellExec(`${UnderpostLxd._lxcCmd()} list ${vmName} --format json`, { stdout: true }).trim();
    const arr = JSON.parse(raw || '[]');
    const inst = Array.isArray(arr) ? arr.find((i) => i?.name === vmName) : null;
    const instanceDevices = inst?.devices || {};
    const currentStatic = instanceDevices[nic]?.['ipv4.address'] || '';
    const hasLocalNic = !!instanceDevices[nic];
    const verb = hasLocalNic ? 'set' : 'override';
    if (currentStatic !== vmIp) {
      shellExec(
        `${UnderpostLxd._lxcCmd()} config device ${verb} ${vmName} ${nic} ipv4.address=${vmIp} security.ipv4_filtering=true`,
      );
      logger.info(`  Pinned ${vmName} NIC ${nic} to static ${vmIp} (required for NAT proxy on VMs).`);
    } else {
      shellExec(`${UnderpostLxd._lxcCmd()} config device set ${vmName} ${nic} security.ipv4_filtering=true`, {
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
    if (!UnderpostLxd._vmExists(vmName)) return false;
    const raw = shellExec(`${UnderpostLxd._lxcCmd()} list ${vmName} --format json`, { stdout: true }).trim();
    const arr = JSON.parse(raw || '[]');
    const inst = Array.isArray(arr) ? arr.find((i) => i?.name === vmName) : null;
    if (!inst) return false;
    return Object.prototype.hasOwnProperty.call(inst.expanded_devices || {}, deviceName);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   * @private
   */
  static _profileExists(name) {
    const raw = shellExec(`${UnderpostLxd._lxcCmd()} profile list --format json`, { stdout: true }).trim();
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) && arr.some((p) => p?.name === name);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   * @private
   */
  static _networkExists(name) {
    const raw = shellExec(`${UnderpostLxd._lxcCmd()} network list --format json`, { stdout: true }).trim();
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
    const raw = shellExec(`${UnderpostLxd._lxcCmd()} storage list --format json`, {
      stdout: true,
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
   * outbound traffic isn't dropped by the host firewall. Idempotent and
   * resilient: re-adding an already-trusted interface is a no-op, and hosts
   * without firewalld are skipped rather than aborting bridge creation.
   * @param {string} bridge
   * @private
   */
  static _ensureBridgeInTrustedZone(bridge) {
    const hasFirewalld = shellExec(`command -v firewall-cmd`, { stdout: true, silentOnError: true }).trim();
    if (!hasFirewalld) {
      logger.info(`firewall-cmd not found; skipping trusted-zone binding for ${bridge}.`);
      return;
    }
    shellExec(`sudo firewall-cmd --permanent --zone=trusted --add-interface=${bridge}`, { silentOnError: true });
    shellExec(`sudo firewall-cmd --reload`, { silentOnError: true });
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
    const hasIptables = shellExec(`command -v iptables`, { stdout: true, silentOnError: true }).trim();
    if (!hasIptables) {
      logger.info(`iptables not found; skipping FORWARD accept rules for ${bridge}.`);
      return;
    }
    for (const dir of ['-i', '-o']) {
      const present = shellExec(`sudo iptables -C FORWARD ${dir} ${bridge} -j ACCEPT`, { silentOnError: true });
      if (present.code !== 0) {
        shellExec(`sudo iptables -I FORWARD 1 ${dir} ${bridge} -j ACCEPT`);
      }
    }
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
   * Single-quotes a shell argument for safe `bash -lc '...'` usage.
   * @param {string} value
   * @returns {string}
   * @private
   */
  static _shellSingleQuote(value) {
    return `'${`${value}`.replace(/'/g, `'\\''`)}'`;
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
    const lxcExecCmd = `${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -lc ${UnderpostLxd._shellSingleQuote(runtimeBootstrap)}`;
    return shellExec(timeoutSeconds > 0 ? `timeout ${timeoutSeconds} ${lxcExecCmd}` : lxcExecCmd);
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
    const token = shellExec(
      `${UnderpostLxd._lxcCmd()} exec ${controlNode} -- bash -c 'sudo cat /var/lib/rancher/k3s/server/node-token'`,
      {
        stdout: true,
      },
    ).trim();
    const ip = UnderpostLxd._vmIpv4(controlNode);
    if (!ip || !token) {
      throw new Error(`Could not read join info from control node '${controlNode}' (ip='${ip}', token='${token}').`);
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
    shellExec(
      `${UnderpostLxd._lxcCmd()} exec ${controlNode} -- bash -c 'for i in $(seq 1 30); do if sudo k3s kubectl get node ${workerName} >/dev/null 2>&1; then sudo k3s kubectl label node ${workerName} node-role.kubernetes.io/worker=worker --overwrite && exit 0; fi; sleep 2; done; echo "WARN: worker ${workerName} did not register within 60s; role label not applied." >&2'`,
    );
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
    const raw = shellExec(`${UnderpostLxd._lxcCmd()} list ${vmName} --format json`, { stdout: true }).trim();
    const arr = JSON.parse(raw || '[]');
    const inst = Array.isArray(arr) ? arr.find((i) => i?.name === vmName) : null;
    const expandedDevices = inst?.expanded_devices || {};
    const proxyNames = Object.entries(expandedDevices)
      .filter(([, dev]) => dev?.type === 'proxy')
      .map(([name]) => name);
    if (proxyNames.length === 0) {
      logger.info(`  No proxy devices found on ${vmName}.`);
      return;
    }
    for (const name of proxyNames) {
      logger.info(`    Removing device: ${name}`);
      shellExec(`${UnderpostLxd._lxcCmd()} config device remove ${vmName} ${name}`);
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
    const probeOut = shellExec(`${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c '${probe}'`, {
      stdout: true,
    }).trim();
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
      shellExec(`${UnderpostLxd._lxcCmd()} stop ${vmName} --timeout 60`);
    }
    logger.info(`  Deleting VM: ${vmName}`);
    shellExec(`${UnderpostLxd._lxcCmd()} delete ${vmName}`);
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
        shellExec(`${UnderpostLxd._lxcCmd()} stop ${vmName} --timeout 60`);
      } else if (state !== null) {
        logger.info(`  VM ${vmName} already in state: ${state}`);
      }
    }

    logger.info('Phase 3/4: Deleting all VMs...');
    for (const vmName of vmList) {
      if (UnderpostLxd._vmExists(vmName)) {
        logger.info(`  Deleting VM: ${vmName}`);
        shellExec(`${UnderpostLxd._lxcCmd()} delete ${vmName}`);
      }
    }

    logger.info(`Phase 4/4: Removing ${ADMIN_PROFILE} and ${BRIDGE_NETWORK} if present...`);
    if (UnderpostLxd._profileExists(ADMIN_PROFILE)) {
      shellExec(`${UnderpostLxd._lxcCmd()} profile delete ${ADMIN_PROFILE}`);
    }
    if (UnderpostLxd._networkExists(BRIDGE_NETWORK)) {
      shellExec(`${UnderpostLxd._lxcCmd()} network delete ${BRIDGE_NETWORK}`);
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
    // `lxd` lives at /snap/bin/lxd which is not in sudo's secure_path on most
    // distros. Forward PATH explicitly so sudo can resolve the binary.
    shellExec(`sudo env PATH="$PATH:/snap/bin" lxd shutdown --timeout 60`);
    logger.info('Phase 3/3: Removing LXD snap and ALL its data (instances, storage pools)...');
    shellExec(`sudo snap remove lxd --purge`);
    logger.info('=== LXD PURGE COMPLETE ===');
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
        shellExec(`${UnderpostLxd._lxcCmd()} stop ${vmName} --timeout 60`);
      } else {
        logger.info(`  VM ${vmName} already in state: ${state}`);
      }
    }
    if (UnderpostLxd._snapInstalled('lxd')) {
      logger.info('Asking LXD daemon to shut down cleanly (timeout 60s)...');
      // sudo's secure_path excludes /snap/bin on most distros — forward PATH.
      shellExec(`sudo env PATH="$PATH:/snap/bin" lxd shutdown --timeout 60`);
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
    shellExec(`sudo snap start lxd`);

    // Wait for the daemon's REST socket to be responsive before issuing
    // instance commands. `lxc info` (no args) is the cheapest readiness probe.
    logger.info('Waiting for LXD daemon to become responsive...');
    let ready = false;
    for (let i = 0; i < 15; i++) {
      try {
        shellExec(`lxc info`, { stdout: true });
        ready = true;
        break;
      } catch (err) {
        if (i === 0) logger.info(`  (daemon not ready yet: ${err.message.split('\n')[0]})`);
      }
      shellExec(`sleep 2`);
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
        shellExec(`${UnderpostLxd._lxcCmd()} start ${vmName}`);
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

    const includesFile = `/tmp/lxd-push-${vmName}-${Date.now()}.txt`;
    const files = await new Promise((resolve, reject) =>
      walk(
        { path: ENGINE_ROOT_ON_HOST, ignoreFiles: ['.gitignore'], includeEmpty: false, follow: false },
        (err, result) => (err ? reject(err) : resolve(result)),
      ),
    );
    fs.writeFileSync(includesFile, files.join('\n'));

    shellExec(
      `${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c 'mkdir -p ${ENGINE_ROOT_IN_VM} && find ${ENGINE_ROOT_IN_VM} -mindepth 1 -delete'`,
    );
    shellExec(
      `tar -C ${ENGINE_ROOT_ON_HOST} -cf - --files-from=${includesFile} | ${UnderpostLxd._lxcCmd()} exec ${vmName} -- tar -C ${ENGINE_ROOT_IN_VM} -xf -`,
    );
    fs.removeSync(includesFile);

    const privateSrcPath = `${ENGINE_ROOT_ON_HOST}/engine-private`;
    if (fs.existsSync(privateSrcPath)) {
      const privateFiles = await new Promise((resolve, reject) =>
        walk(
          { path: privateSrcPath, ignoreFiles: ['.gitignore'], includeEmpty: false, follow: false },
          (err, result) => (err ? reject(err) : resolve(result)),
        ),
      );
      const privateIncludes = `/tmp/lxd-push-${vmName}-private-${Date.now()}.txt`;
      fs.writeFileSync(privateIncludes, privateFiles.join('\n'));
      shellExec(
        `${UnderpostLxd._lxcCmd()} exec ${vmName} -- bash -c 'mkdir -p ${ENGINE_ROOT_IN_VM}/engine-private && find ${ENGINE_ROOT_IN_VM}/engine-private -mindepth 1 -delete'`,
      );
      shellExec(
        `tar -C ${privateSrcPath} -cf - --files-from=${privateIncludes} | ${UnderpostLxd._lxcCmd()} exec ${vmName} -- tar -C ${ENGINE_ROOT_IN_VM}/engine-private -xf -`,
      );
      fs.removeSync(privateIncludes);
    }

    logger.info(`  Engine source mirrored into ${vmName}:${ENGINE_ROOT_IN_VM}`);
  }
}

export default UnderpostLxd;
