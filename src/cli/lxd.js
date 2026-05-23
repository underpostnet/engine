/**
 * LXD module for managing LXD virtual machines as K3s nodes.
 * @module src/cli/lxd.js
 * @namespace UnderpostLxd
 *
 * ### Proxy Device Safety
 *
 * Proxy devices (created by `--expose`) attach LXD proxy devices to VMs. If you
 * stop + delete a VM without removing proxy devices first, LXD may crash or
 * leave stale NAT rules in iptables. Both `_safeDeleteVm()` and reset() now
 * enumerate and remove proxy devices before stopping/deleting VMs.
 *
 * ### Idempotency
 *
 * Every destructive operation (deleteVm, reset) is safe to re-run. If a VM is
 * already gone, proxy device removal is silently skipped. If the LXD snap is
 * already removed, reset continues gracefully.
 *
 * ### Lifecycle
 *
 * - `--reset` is the only complete teardown path: cleans ALL VMs, profiles,
 *   networks, and finally the LXD snap itself.
 * - `--delete-vm` is a single-VM teardown that removes proxy devices first.
 * - `--init-vm` handles OS + K3s setup. Engine replication is a separate step
 *   via `--bootstrap-engine`.
 * - `--bootstrap-engine` replicates /home/dd/engine into the VM after init.
 */

import { getNpmRootPath } from '../server/conf.js';
import { pbcopy, shellExec } from '../server/process.js';
import walk from 'ignore-walk';
import fs from 'fs-extra';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

class UnderpostLxd {
  static API = {
    /**
     * @method callback
     * @description Main entry point for all LXD CLI operations.
     * @param {object} options
     * @param {boolean} [options.init=false] - Initialize LXD via preseed.
     * @param {boolean} [options.reset=false] - Complete safe reset: cleans all VMs
     *   (proxy devices removed first), profiles, networks, then removes LXD snap.
     * @param {boolean} [options.dev=false] - Use local paths instead of npm global.
     * @param {boolean} [options.install=false] - Install LXD snap.
     * @param {boolean} [options.createVirtualNetwork=false] - Create lxdbr0 bridge network.
     * @param {string} [options.ipv4Address='10.250.250.1/24'] - IPv4 address/CIDR for lxdbr0.
     * @param {boolean} [options.createAdminProfile=false] - Create admin-profile for VMs.
     * @param {boolean} [options.control=false] - Initialize VM as K3s control plane.
     * @param {boolean} [options.worker=false] - Initialize VM as K3s worker.
     * @param {string} [options.initVm=''] - VM name to initialize as K3s node.
     * @param {string} [options.deleteVm=''] - VM name to safely stop and delete
     *   (removes proxy devices first).
     * @param {string} [options.createVm=''] - VM name to create (copies command to clipboard).
     * @param {string} [options.infoVm=''] - VM name to inspect.
     * @param {string} [options.rootSize=''] - Root disk size in GiB for new VMs.
     * @param {string} [options.joinNode=''] - Join format: 'workerName,controlName'.
     * @param {string} [options.expose=''] - Expose VM ports to host: 'vmName:port1,port2'.
     * @param {string} [options.deleteExpose=''] - Remove exposed ports: 'vmName:port1,port2'.
     * @param {string} [options.test=''] - VM name for connectivity and health checks.
     * @param {string} [options.bootstrapEngine=''] - VM name to replicate /home/dd/engine into.
     * @memberof UnderpostLxd
     */
    async callback(
      options = {
        init: false,
        reset: false,
        dev: false,
        install: false,
        createVirtualNetwork: false,
        ipv4Address: '10.250.250.1/24',
        createAdminProfile: false,
        control: false,
        worker: false,
        initVm: '',
        deleteVm: '',
        createVm: '',
        infoVm: '',
        rootSize: '',
        joinNode: '',
        expose: '',
        deleteExpose: '',
        test: '',
        bootstrapEngine: '',
      },
    ) {
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;

      // =====================================================================
      // RESET: Complete, safe teardown of all LXD state
      // =====================================================================
      if (options.reset === true) {
        logger.info('=== SAFE LXD RESET ===');
        logger.info('Phase 1/5: Enumerating all VMs and removing proxy devices...');
        const vmList = UnderpostLxd._listVms();
        for (const vmName of vmList) {
          UnderpostLxd._removeProxyDevices(vmName);
        }

        logger.info('Phase 2/5: Stopping all VMs gracefully...');
        for (const vmName of vmList) {
          logger.info(`  Stopping VM: ${vmName}`);
          shellExec(`lxc stop ${vmName} --timeout 30 2>/dev/null || true`, { silent: true, silentOnError: true });
        }

        logger.info('Phase 3/5: Deleting all VMs...');
        for (const vmName of vmList) {
          logger.info(`  Deleting VM: ${vmName}`);
          shellExec(`lxc delete ${vmName} --force 2>/dev/null || true`, { silent: true, silentOnError: true });
        }

        logger.info('Phase 4/5: Removing admin-profile and network...');
        shellExec(`lxc profile delete admin-profile 2>/dev/null || true`, { silent: true, silentOnError: true });
        shellExec(`lxc network delete lxdbr0 2>/dev/null || true`, { silent: true, silentOnError: true });

        logger.info('Phase 5/5: Stopping LXD snap daemon and purging snap...');
        shellExec(`sudo systemctl stop snap.lxd.daemon 2>/dev/null || true`, { silent: true, silentOnError: true });
        shellExec(`sudo snap remove lxd --purge 2>/dev/null || true`, { silent: true, silentOnError: true });

        logger.info('=== LXD RESET COMPLETE ===');
        logger.info('All VMs, proxy devices, profiles, networks, and the LXD snap have been removed.');
        return;
      }

      // =====================================================================
      // INSTALL
      // =====================================================================
      if (options.install === true) {
        shellExec(`sudo snap install lxd`);
      }

      // =====================================================================
      // INIT (LXD preseed)
      // =====================================================================
      if (options.init === true) {
        shellExec(`sudo systemctl start snap.lxd.daemon`);
        shellExec(`sudo systemctl status snap.lxd.daemon`);
        const lxdPreseedContent = fs
          .readFileSync(`${underpostRoot}/manifests/lxd/lxd-preseed.yaml`, 'utf8')
          .replaceAll(`127.0.0.1`, Underpost.dns.getLocalIPv4Address());
        shellExec(`echo "${lxdPreseedContent}" | lxd init --preseed`);
        shellExec(`lxc cluster list`);
      }

      // =====================================================================
      // CREATE VIRTUAL NETWORK
      // =====================================================================
      if (options.createVirtualNetwork === true) {
        const ipv4Address = options.ipv4Address ? options.ipv4Address : '10.250.250.1/24';
        shellExec(`lxc network create lxdbr0 \
ipv4.address=${ipv4Address} \
ipv4.nat=true \
ipv4.dhcp=true \
ipv6.address=none`);
      }

      // =====================================================================
      // CREATE ADMIN PROFILE
      // =====================================================================
      if (options.createAdminProfile === true) {
        const existingProfiles = await new Promise((resolve) => {
          shellExec(`lxc profile show admin-profile`, {
            silent: true,
            callback: (...args) => resolve(JSON.stringify(args)),
          });
        });
        if (existingProfiles.toLowerCase().match('error')) {
          logger.warn('Profile does not exist. Use the following command to create it:');
          pbcopy(`lxc profile create admin-profile`);
        } else {
          shellExec(`cat ${underpostRoot}/manifests/lxd/lxd-admin-profile.yaml | lxc profile edit admin-profile`);
          shellExec(`lxc profile show admin-profile`);
        }
      }

      // =====================================================================
      // DELETE VM (safe: removes proxy devices first)
      // =====================================================================
      if (options.deleteVm) {
        const vmName = options.deleteVm;
        UnderpostLxd._safeDeleteVm(vmName);
      }

      // =====================================================================
      // CREATE VM (copy launch command to clipboard)
      // =====================================================================
      if (options.createVm) {
        pbcopy(
          `lxc launch images:rockylinux/9 ${options.createVm
          } --vm --target lxd-node1 -c limits.cpu=2 -c limits.memory=4GB --profile admin-profile -d root,size=${options.rootSize ? options.rootSize + 'GiB' : '32GiB'
          }`,
        );
      }

      // =====================================================================
      // INIT VM (OS setup + K3s role, no engine push)
      // =====================================================================
      if (options.initVm) {
        const vmName = options.initVm;
        const lxdSetupPath = `${underpostRoot}/scripts/lxd-vm-setup.sh`;
        const k3sSetupPath = `${underpostRoot}/scripts/k3s-node-setup.sh`;

        // Step 1: OS base setup (disk, packages, kernel modules)
        shellExec(`cat ${lxdSetupPath} | lxc exec ${vmName} -- bash`);

        // Step 2: K3s role setup (installs Node, npm deps, then k3s via underpost CLI)
        // Engine source replication is a separate step via --bootstrap-engine.
        if (options.worker === true) {
          if (options.joinNode) {
            const controlNode = options.joinNode.includes(',') ? options.joinNode.split(',').pop() : options.joinNode;
            const k3sToken = shellExec(
              `lxc exec ${controlNode} -- bash -c 'sudo cat /var/lib/rancher/k3s/server/node-token'`,
              { stdout: true },
            ).trim();
            const controlPlaneIp = shellExec(
              `lxc list ${controlNode} --format json | jq -r '.[0].state.network.enp5s0.addresses[] | select(.family=="inet") | .address'`,
              { stdout: true },
            ).trim();
            logger.info(`Initializing worker ${vmName} and joining control plane ${controlNode} (${controlPlaneIp})`);
            shellExec(
              `cat ${k3sSetupPath} | lxc exec ${vmName} -- bash -s -- --worker --control-ip=${controlPlaneIp} --token=${k3sToken}`,
            );
          } else {
            shellExec(`cat ${k3sSetupPath} | lxc exec ${vmName} -- bash -s -- --worker`);
          }
        } else {
          shellExec(`cat ${k3sSetupPath} | lxc exec ${vmName} -- bash -s -- --control`);
        }
      }

      // =====================================================================
      // BOOTSTRAP ENGINE: Replicate /home/dd/engine into a VM
      // =====================================================================
      if (options.bootstrapEngine) {
        const vmName = options.bootstrapEngine;
        logger.info(`Bootstrapping engine source into VM: ${vmName}...`);

        const includesFile = `/tmp/lxd-push-${vmName}-${Date.now()}.txt`;
        const srcPath = `/home/dd/engine`;
        const files = await new Promise((resolve) =>
          walk({ path: srcPath, ignoreFiles: ['.gitignore'], includeEmpty: false, follow: false }, (_, result) =>
            resolve(result),
          ),
        );
        fs.writeFileSync(includesFile, files.join('\n'));
        shellExec(`lxc exec ${vmName} -- bash -c 'rm -rf /home/dd/engine && mkdir -p /home/dd/engine'`);
        shellExec(`tar -C ${srcPath} -cf - --files-from=${includesFile} | lxc exec ${vmName} -- tar -C /home/dd/engine -xf -`);
        fs.removeSync(includesFile);

        // Also push engine-private if it exists
        const privateSrcPath = `/home/dd/engine/engine-private`;
        if (fs.existsSync(privateSrcPath)) {
          const privateFiles = await new Promise((resolve) =>
            walk(
              {
                path: privateSrcPath,
                ignoreFiles: ['/home/dd/engine/.gitignore', '.gitignore'],
                includeEmpty: false,
                follow: false,
              },
              (_, result) => resolve(result),
            ),
          );
          const privateIncludes = `/tmp/lxd-push-${vmName}-private-${Date.now()}.txt`;
          fs.writeFileSync(privateIncludes, privateFiles.join('\n'));
          shellExec(`lxc exec ${vmName} -- bash -c 'rm -rf /home/dd/engine/engine-private && mkdir -p /home/dd/engine/engine-private'`);
          shellExec(`tar -C ${privateSrcPath} -cf - --files-from=${privateIncludes} | lxc exec ${vmName} -- tar -C /home/dd/engine/engine-private -xf -`);
          fs.removeSync(privateIncludes);
        }

        logger.info(`Engine source bootstrapped into ${vmName}:/home/dd/engine`);
      }

      // =====================================================================
      // STANDALONE JOIN
      // =====================================================================
      if (options.joinNode && !options.initVm) {
        const [workerNode, controlNode] = options.joinNode.split(',');
        const k3sToken = shellExec(
          `lxc exec ${controlNode} -- bash -c 'sudo cat /var/lib/rancher/k3s/server/node-token'`,
          { stdout: true },
        ).trim();
        const controlPlaneIp = shellExec(
          `lxc list ${controlNode} --format json | jq -r '.[0].state.network.enp5s0.addresses[] | select(.family=="inet") | .address'`,
          { stdout: true },
        ).trim();
        logger.info(`Joining K3s worker ${workerNode} to control plane ${controlNode} (${controlPlaneIp})`);
        shellExec(
          `lxc exec ${workerNode} -- bash -c 'K3S_URL=https://${controlPlaneIp}:6443 K3S_TOKEN=${k3sToken} curl -sfL https://get.k3s.io | sh -s - agent'`,
        );
        logger.info(`Worker ${workerNode} joined successfully.`);
      }

      // =====================================================================
      // INFO VM
      // =====================================================================
      if (options.infoVm) {
        shellExec(`lxc config show ${options.infoVm}`);
        shellExec(`lxc info --show-log ${options.infoVm}`);
        shellExec(`lxc info ${options.infoVm}`);
        shellExec(`lxc list ${options.infoVm}`);
      }

      // =====================================================================
      // EXPOSE (proxy host ports to VM)
      // =====================================================================
      if (options.expose) {
        const [vmName, ports] = options.expose.split(':');
        const protocols = ['tcp'];
        const hostIp = Underpost.dns.getLocalIPv4Address();
        const vmIp = shellExec(
          `lxc list ${vmName} --format json | jq -r '.[0].state.network.enp5s0.addresses[] | select(.family=="inet") | .address'`,
          { stdout: true },
        ).trim();
        if (!vmIp) {
          logger.error(`Could not get VM IP for ${vmName}. Cannot expose ports.`);
          return;
        }
        for (const port of ports.split(',')) {
          for (const protocol of protocols) {
            const deviceName = `${vmName}-${protocol}-port-${port}`;
            shellExec(`lxc config device remove ${vmName} ${deviceName}`);
            shellExec(
              `lxc config device add ${vmName} ${deviceName} proxy listen=${protocol}:${hostIp}:${port} connect=${protocol}:${vmIp}:${port} nat=true`,
            );
            logger.info(`Exposed ${protocol}:${hostIp}:${port} -> ${vmIp}:${port} on ${vmName}`);
          }
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
            shellExec(`lxc config device remove ${vmName} ${vmName}-${protocol}-port-${port}`);
          }
        }
      }

      // =====================================================================
      // TEST (connectivity and health checks)
      // =====================================================================
      if (options.test) {
        const vmName = options.test;
        const vmIp = shellExec(
          `lxc list ${vmName} --format json | jq -r '.[0].state.network.enp5s0.addresses[] | select(.family=="inet") | .address'`,
          { stdout: true },
        ).trim();
        logger.info(`VM ${vmName} IPv4: ${vmIp || 'none'}`);
        const httpStatus = shellExec(
          `lxc exec ${vmName} -- curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://google.com`,
          { stdout: true },
        ).trim();
        logger.info(`VM ${vmName} HTTP connectivity: ${httpStatus}`);
        logger.info(`Health report for VM: ${vmName}`);
        shellExec(`lxc list ${vmName} --format json`);
        shellExec(`lxc exec ${vmName} -- bash -c 'top -bn1 | grep "Cpu(s)"'`);
        shellExec(`lxc exec ${vmName} -- bash -c 'free -m'`);
        shellExec(`lxc exec ${vmName} -- bash -c 'df -h /'`);
        shellExec(`lxc exec ${vmName} -- bash -c 'ip a'`);
        shellExec(`lxc exec ${vmName} -- bash -c 'cat /etc/resolv.conf'`);
        shellExec(`lxc exec ${vmName} -- bash -c 'sudo k3s kubectl get nodes'`);
      }
    },
  };

  // =====================================================================
  // PRIVATE HELPERS
  // =====================================================================

  /**
   * Lists all LXD VM (virtual-machine) instance names.
   * @returns {string[]} Array of VM names.
   * @private
   */
  static _listVms() {
    const raw = shellExec(
      `lxc list --format json | jq -r '.[] | select(.type=="virtual-machine") | .name // empty' 2>/dev/null || true`,
      { stdout: true, silent: true, silentOnError: true },
    ).trim();
    if (!raw) return [];
    return raw.split('\n').filter((n) => n.length > 0);
  }

  /**
   * Enumerates and removes all proxy devices attached to a VM.
   * Proxy devices are named with the pattern <vmName>-<protocol>-port-<port>.
   * Fails silently if the VM or device is already gone (idempotent).
   * @param {string} vmName - The VM name to clean proxy devices from.
   * @private
   */
  static _removeProxyDevices(vmName) {
    logger.info(`  Removing proxy devices from ${vmName}...`);
    const devicesRaw = shellExec(
      `lxc config device list ${vmName} 2>/dev/null | grep -E "^${vmName}-tcp-port-" || true`,
      { stdout: true, silent: true, silentOnError: true },
    ).trim();
    if (!devicesRaw) {
      logger.info(`  No proxy devices found on ${vmName}.`);
      return;
    }
    for (const deviceName of devicesRaw.split('\n')) {
      const name = deviceName.trim();
      if (!name) continue;
      logger.info(`    Removing device: ${name}`);
      shellExec(`lxc config device remove ${vmName} ${name} 2>/dev/null || true`, {
        silent: true,
        silentOnError: true,
      });
    }
  }

  /**
   * Safely deletes a single VM: removes proxy devices first, then stops and deletes.
   * Idempotent: safe to re-run if VM is already gone.
   * @param {string} vmName - The VM name to delete.
   * @private
   */
  static _safeDeleteVm(vmName) {
    logger.info(`Safely deleting VM: ${vmName}`);
    UnderpostLxd._removeProxyDevices(vmName);
    logger.info(`  Stopping VM: ${vmName}`);
    shellExec(`lxc stop ${vmName} --timeout 30 2>/dev/null || true`, { silent: true, silentOnError: true });
    logger.info(`  Deleting VM: ${vmName}`);
    shellExec(`lxc delete ${vmName} --force 2>/dev/null || true`, { silent: true, silentOnError: true });
    logger.info(`VM ${vmName} safely deleted.`);
  }
}

export default UnderpostLxd;