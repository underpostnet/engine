/**
 * LXD module for managing LXD virtual machines as K3s nodes.
 * @module src/cli/lxd.js
 * @namespace UnderpostLxd
 */

import { getNpmRootPath } from '../server/conf.js';
import { pbcopy, shellExec } from '../server/process.js';
import walk from 'ignore-walk';
import fs from 'fs-extra';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostLxd
 * @description Provides a set of static methods to interact with LXD,
 * encapsulating common LXD operations for VM management and network testing.
 * @memberof UnderpostLxd
 */
class UnderpostLxd {
  static API = {
    /**
     * @method callback
     * @description Main entry point for LXD VM operations. Each VM is a K3s node (control or worker).
     * @param {object} options
     * @param {boolean} [options.init=false] - Initialize LXD via preseed.
     * @param {boolean} [options.reset=false] - Remove LXD snap and purge data.
     * @param {boolean} [options.dev=false] - Use local paths instead of npm global.
     * @param {boolean} [options.install=false] - Install LXD snap.
     * @param {boolean} [options.createVirtualNetwork=false] - Create lxdbr0 bridge network.
     * @param {string} [options.ipv4Address='10.250.250.1/24'] - IPv4 address/CIDR for the lxdbr0 bridge network.
     * @param {boolean} [options.createAdminProfile=false] - Create admin-profile for VMs.
     * @param {boolean} [options.control=false] - Initialize VM as K3s control plane node.
     * @param {boolean} [options.worker=false] - Initialize VM as K3s worker node.
     * @param {string} [options.initVm=''] - VM name to initialize as a K3s node.
     * @param {string} [options.deleteVm=''] - VM name to stop and delete.
     * @param {string} [options.createVm=''] - VM name to create (copies launch command to clipboard).
     * @param {string} [options.infoVm=''] - VM name to inspect.
     * @param {string} [options.rootSize=''] - Root disk size in GiB for new VMs (e.g. '32').
     * @param {string} [options.joinNode=''] - Join format: 'workerName,controlName' (standalone join). When used with --init-vm --worker, just the control node name.
     * @param {string} [options.expose=''] - Expose VM ports to host: 'vmName:port1,port2'.
     * @param {string} [options.deleteExpose=''] - Remove exposed ports: 'vmName:port1,port2'.
     * @param {string} [options.test=''] - VM name to run connectivity and health checks on.
     * @param {string} [options.workflowId=''] - Workflow ID for runWorkflow.
     * @param {string} [options.vmId=''] - VM name for workflow execution.
     * @param {string} [options.deployId=''] - Deployment ID for workflow context.
     * @param {string} [options.namespace=''] - Kubernetes namespace context.
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
        workflowId: '',
        vmId: '',
        deployId: '',
        namespace: '',
      },
    ) {
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;

      if (options.reset === true) {
        shellExec(`sudo systemctl stop snap.lxd.daemon`);
        shellExec(`sudo snap remove lxd --purge`);
      }

      if (options.install === true) shellExec(`sudo snap install lxd`);

      if (options.init === true) {
        shellExec(`sudo systemctl start snap.lxd.daemon`);
        shellExec(`sudo systemctl status snap.lxd.daemon`);
        const lxdPreseedContent = fs
          .readFileSync(`${underpostRoot}/manifests/lxd/lxd-preseed.yaml`, 'utf8')
          .replaceAll(`127.0.0.1`, Underpost.dns.getLocalIPv4Address());
        shellExec(`echo "${lxdPreseedContent}" | lxd init --preseed`);
        shellExec(`lxc cluster list`);
      }

      if (options.createVirtualNetwork === true) {
        const ipv4Address = options.ipv4Address ? options.ipv4Address : '10.250.250.1/24';
        shellExec(`lxc network create lxdbr0 \
ipv4.address=${ipv4Address} \
ipv4.nat=true \
ipv4.dhcp=true \
ipv6.address=none`);
      }

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

      if (options.deleteVm) {
        const vmName = options.deleteVm;
        logger.info(`Stopping VM: ${vmName}`);
        shellExec(`lxc stop ${vmName} --force`);
        logger.info(`Deleting VM: ${vmName}`);
        shellExec(`lxc delete ${vmName}`);
        logger.info(`VM ${vmName} deleted.`);
      }

      if (options.createVm) {
        pbcopy(
          `lxc launch images:rockylinux/9 ${
            options.createVm
          } --vm --target lxd-node1 -c limits.cpu=2 -c limits.memory=4GB --profile admin-profile -d root,size=${
            options.rootSize ? options.rootSize + 'GiB' : '32GiB'
          }`,
        );
      }

      if (options.initVm) {
        const vmName = options.initVm;
        const lxdSetupPath = `${underpostRoot}/scripts/lxd-vm-setup.sh`;
        const k3sSetupPath = `${underpostRoot}/scripts/k3s-node-setup.sh`;

        // Step 1: OS base setup (disk, packages, kernel modules)
        shellExec(`cat ${lxdSetupPath} | lxc exec ${vmName} -- bash`);

        // Step 2: Push engine source from host to VM
        await Underpost.lxd.runWorkflow({ workflowId: 'engine', vmName, dev: options.dev });

        // Step 3: K3s role setup (installs Node, npm deps, then k3s via node bin --dev)
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

      if (options.workflowId) {
        await Underpost.lxd.runWorkflow({
          workflowId: options.workflowId,
          vmName: options.vmId,
          deployId: options.deployId,
          dev: options.dev,
        });
      }

      // Standalone join: --join-node workerName,controlName (without --init-vm)
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

      if (options.infoVm) {
        shellExec(`lxc config show ${options.infoVm}`);
        shellExec(`lxc info --show-log ${options.infoVm}`);
        shellExec(`lxc info ${options.infoVm}`);
        shellExec(`lxc list ${options.infoVm}`);
      }

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

      if (options.deleteExpose) {
        const [vmName, ports] = options.deleteExpose.split(':');
        const protocols = ['tcp'];
        for (const port of ports.split(',')) {
          for (const protocol of protocols) {
            shellExec(`lxc config device remove ${vmName} ${vmName}-${protocol}-port-${port}`);
          }
        }
      }

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

    /**
     * @method pushDirectory
     * @description Pushes a host directory into a VM using ignore-walk (respecting .gitignore)
     * and a tar pipe. Skips gitignored paths (e.g. node_modules, .git, build artifacts).
     * @param {object} params
     * @param {string} params.srcPath - Absolute path of the source directory on the host.
     * @param {string} params.vmName - Target LXD VM name.
     * @param {string} params.destPath - Absolute path of the destination directory inside the VM.
     * @param {string[]} [params.ignoreFiles=['.gitignore']] - Ignore-file names to respect during walk.
     * @returns {Promise<void>}
     * @memberof UnderpostLxd
     */
    async pushDirectory({ srcPath, vmName, destPath, ignoreFiles }) {
      const includesFile = `/tmp/lxd-push-${vmName}-${Date.now()}.txt`;
      if (!ignoreFiles) ignoreFiles = ['.gitignore'];
      // Collect non-ignored files via ignore-walk
      const files = await new Promise((resolve) =>
        walk(
          {
            path: srcPath,
            ignoreFiles,
            includeEmpty: false,
            follow: false,
          },
          (_, result) => resolve(result),
        ),
      );

      // Write relative paths (one per line) to a temp includes file
      fs.writeFileSync(includesFile, files.join('\n'));
      logger.info(`lxd pushDirectory: ${files.length} files collected`, { srcPath, vmName, destPath, includesFile });

      // Reset destination directory inside the VM
      shellExec(`lxc exec ${vmName} -- bash -c 'rm -rf ${destPath} && mkdir -p ${destPath}'`);

      // Stream tar archive from host into VM
      shellExec(
        `tar -C ${srcPath} -cf - --files-from=${includesFile} | lxc exec ${vmName} -- tar -C ${destPath} -xf -`,
      );

      // Clean up temp includes file
      fs.removeSync(includesFile);
    },

    /**
     * @method runWorkflow
     * @description Executes predefined workflows on LXD VMs.
     * @param {object} params
     * @param {string} params.workflowId - Workflow ID to execute.
     * @param {string} params.vmName - Target VM name.
     * @param {string} [params.deployId] - Deployment identifier.
     * @param {boolean} [params.dev=false] - Use local paths.
     * @memberof UnderpostLxd
     */
    async runWorkflow({ workflowId, vmName, deployId, dev }) {
      switch (workflowId) {
        case 'engine': {
          await Underpost.lxd.pushDirectory({
            srcPath: `/home/dd/engine`,
            vmName,
            destPath: `/home/dd/engine`,
          });
          await Underpost.lxd.pushDirectory({
            srcPath: `/home/dd/engine/engine-private`,
            vmName,
            destPath: `/home/dd/engine/engine-private`,
            ignoreFiles: ['/home/dd/engine/.gitignore', '.gitignore'],
          });
          break;
        }
        case 'engine-recursive-push': {
          const enginePath = '/home/dd/engine';
          shellExec(`lxc exec ${vmName} -- bash -c 'rm -rf ${enginePath}'`);
          shellExec(`lxc exec ${vmName} -- bash -c 'mkdir -p /home/dd'`);
          shellExec(`lxc file push ${enginePath} ${vmName}/home/dd --recursive`);
          break;
        }
        case 'dev-reset': {
          shellExec(
            `lxc exec ${vmName} -- bash -lc 'cd /home/dd/engine && node bin cluster --dev --reset && node bin cluster --dev --k3s'`,
          );
          break;
        }
      }
    },
  };
}

export default UnderpostLxd;
