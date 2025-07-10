import { getNpmRootPath } from '../server/conf.js';
import { getLocalIPv4Address } from '../server/dns.js';
import { pbcopy, shellExec } from '../server/process.js';
import fs from 'fs-extra';

/**
 * @class UnderpostLxd
 * @description Provides a set of static methods to interact with LXD,
 * encapsulating common LXD operations for VM management and network testing.
 */
class UnderpostLxd {
  static API = {
    /**
     * @method callback
     * @description Main entry point for LXD operations based on provided options.
     * @param {object} options - Configuration options for LXD operations.
     * @param {boolean} [options.init=false] - Initialize LXD.
     * @param {boolean} [options.reset=false] - Reset LXD installation.
     * @param {boolean} [options.dev=false] - Run in development mode (adjusts paths).
     * @param {boolean} [options.install=false] - Install LXD snap.
     * @param {boolean} [options.createVirtualNetwork=false] - Create default LXD bridge network (lxdbr0).
     * @param {boolean} [options.createAdminProfile=false] - Create admin-profile for VMs.
     * @param {boolean} [options.control=false] - Flag for control plane VM initialization.
     * @param {boolean} [options.worker=false] - Flag for worker node VM initialization.
     * @param {boolean} [options.k3s=false] - Flag to indicate K3s cluster type for VM initialization.
     * @param {string} [options.initVm=''] - Initialize a specific VM.
     * @param {string} [options.createVm=''] - Create a new VM with the given name.
     * @param {string} [options.infoVm=''] - Display information about a specific VM.
     * @param {string} [options.rootSize=''] - Root disk size for new VMs (e.g., '32GiB').
     * @param {string} [options.joinNode=''] - Join a worker node to a control plane (format: 'workerName,controlName').
     * @param {string} [options.expose=''] - Expose ports from a VM to the host (format: 'vmName:port1,port2').
     * @param {string} [options.deleteExpose=''] - Delete exposed ports from a VM (format: 'vmName:port1,port2').
     * @param {string} [options.test=''] - Test health, status and network connectivity for a VM.
     * @param {string} [options.autoExposeK8sPorts=''] - Automatically expose common Kubernetes ports for the VM.
     */
    async callback(
      options = {
        init: false,
        reset: false,
        dev: false,
        install: false,
        createVirtualNetwork: false,
        createAdminProfile: false,
        control: false,
        worker: false,
        k3s: false, // New k3s option
        initVm: '',
        createVm: '',
        infoVm: '',
        rootSize: '',
        joinNode: '',
        expose: '',
        deleteExpose: '',
        test: '',
        autoExposeK8sPorts: '',
      },
    ) {
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      if (options.reset === true) {
        shellExec(`sudo systemctl stop snap.lxd.daemon || true`);
        shellExec(`sudo snap remove lxd --purge || true`);
      }
      if (options.install === true) shellExec(`sudo snap install lxd`);
      if (options.init === true) {
        shellExec(`sudo systemctl start snap.lxd.daemon`);
        shellExec(`sudo systemctl status snap.lxd.daemon`);
        const lxdPressedContent = fs
          .readFileSync(`${underpostRoot}/manifests/lxd/lxd-preseed.yaml`, 'utf8')
          .replaceAll(`127.0.0.1`, getLocalIPv4Address());
        shellExec(`echo "${lxdPressedContent}" | lxd init --preseed`);
        shellExec(`lxc cluster list`);
      }
      if (options.createVirtualNetwork === true) {
        shellExec(`lxc network create lxdbr0 \
ipv4.address=10.250.250.1/24 \
ipv4.nat=true \
ipv4.dhcp=true \
ipv6.address=none`);
      }
      if (options.createAdminProfile === true) {
        pbcopy(`lxc profile create admin-profile`);
        shellExec(`cat ${underpostRoot}/manifests/lxd/lxd-admin-profile.yaml | lxc profile edit admin-profile`);
        shellExec(`lxc profile show admin-profile`);
      }
      if (options.createVm && typeof options.createVm === 'string') {
        pbcopy(
          `lxc launch images:rockylinux/9 ${
            options.createVm
          } --vm --target lxd-node1 -c limits.cpu=2 -c limits.memory=4GB --profile admin-profile -d root,size=${
            options.rootSize && typeof options.rootSize === 'string' ? options.rootSize + 'GiB' : '32GiB'
          }`,
        );
      }
      if (options.initVm && typeof options.initVm === 'string') {
        let flag = '';
        if (options.control === true) {
          if (options.k3s === true) {
            // New K3s flag for control plane
            flag = ' -s -- --k3s';
          } else {
            // Default to kubeadm if not K3s
            flag = ' -s -- --kubeadm';
          }
          shellExec(`lxc exec ${options.initVm} -- bash -c 'mkdir -p /home/dd/engine'`);
          shellExec(`lxc file push /home/dd/engine/engine-private ${options.initVm}/home/dd/engine --recursive`);
          shellExec(`lxc file push /home/dd/engine/manifests ${options.initVm}/home/dd/engine --recursive`);
        } else if (options.worker == true) {
          if (options.k3s === true) {
            // New K3s flag for worker
            flag = ' -s -- --worker --k3s';
          } else {
            // Default to kubeadm worker
            flag = ' -s -- --worker';
          }
        }
        console.log(`Executing underpost-setup.sh on VM: ${options.initVm}`);
        shellExec(`cat ${underpostRoot}/manifests/lxd/underpost-setup.sh | lxc exec ${options.initVm} -- bash${flag}`);
        console.log(`underpost-setup.sh execution completed on VM: ${options.initVm}`);
      }
      // --- Automatic Kubernetes Port Exposure ---
      if (options.autoExposeK8sPorts && typeof options.autoExposeK8sPorts === 'string') {
        console.log(`Automatically exposing Kubernetes ports for VM: ${options.autoExposeK8sPorts}`);
        const vmName = options.autoExposeK8sPorts;
        const hostIp = getLocalIPv4Address();
        let vmIp = '';
        let retries = 0;
        const maxRetries = 10;
        const delayMs = 5000; // 5 seconds

        // Wait for VM to get an IP address
        while (!vmIp && retries < maxRetries) {
          try {
            console.log(`Attempting to get IPv4 address for ${vmName} (Attempt ${retries + 1}/${maxRetries})...`);
            vmIp = shellExec(
              `lxc list ${vmName} --format json | jq -r '.[0].state.network.enp5s0.addresses[] | select(.family=="inet") | .address'`,
              { stdout: true },
            ).trim();
            if (vmIp) {
              console.log(`IPv4 address found for ${vmName}: ${vmIp}`);
            } else {
              console.log(`IPv4 address not yet available for ${vmName}. Retrying in ${delayMs / 1000} seconds...`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          } catch (error) {
            console.error(`Error getting IPv4 address for exposure: ${error.message}`);
            console.log(`Retrying in ${delayMs / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          retries++;
        }

        if (!vmIp) {
          console.error(`Failed to get VM IP for ${vmName} after ${maxRetries} attempts. Cannot expose ports.`);
          return;
        }

        let portsToExpose = [];
        if (options.control === true) {
          // Kubernetes API Server (Kubeadm and K3s both use 6443 by default)
          portsToExpose.push('6443');
          // Standard HTTP/HTTPS for Ingress if deployed
          portsToExpose.push('80');
          portsToExpose.push('443');
        }
        // Add common NodePorts if needed, or rely on explicit 'expose'
        portsToExpose.push('30000'); // Example NodePort
        portsToExpose.push('30001'); // Example NodePort
        portsToExpose.push('30002'); // Example NodePort

        const protocols = ['tcp']; // Most K8s services are TCP, UDP for some like DNS

        for (const port of portsToExpose) {
          for (const protocol of protocols) {
            const deviceName = `${vmName}-${protocol}-port-${port}`;
            try {
              // Remove existing device first to avoid conflicts if re-running
              shellExec(`lxc config device remove ${vmName} ${deviceName} || true`);
              shellExec(
                `lxc config device add ${vmName} ${deviceName} proxy listen=${protocol}:${hostIp}:${port} connect=${protocol}:${vmIp}:${port} nat=true`,
              );
              console.log(`Exposed ${protocol}:${hostIp}:${port} -> ${vmIp}:${port} for ${vmName}`);
            } catch (error) {
              console.error(`Failed to expose port ${port} for ${vmName}: ${error.message}`);
            }
          }
        }
      }
      if (options.joinNode && typeof options.joinNode === 'string') {
        const [workerNode, controlNode] = options.joinNode.split(',');
        // Determine if it's a Kubeadm or K3s join
        const isK3sJoin = options.k3s === true;

        if (isK3sJoin) {
          console.log(`Attempting to join K3s worker node ${workerNode} to control plane ${controlNode}`);
          // Get K3s token from control plane
          const k3sToken = shellExec(
            `lxc exec ${controlNode} -- bash -c 'sudo cat /var/lib/rancher/k3s/server/node-token'`,
            { stdout: true },
          ).trim();
          // Get control plane IP
          const controlPlaneIp = shellExec(
            `lxc list ${controlNode} --format json | jq -r '.[0].state.network.enp5s0.addresses[] | select(.family=="inet") | .address'`,
            { stdout: true },
          ).trim();

          if (!k3sToken || !controlPlaneIp) {
            console.error(`Failed to get K3s token or control plane IP. Cannot join worker.`);
            return;
          }
          const k3sJoinCommand = `K3S_URL=https://${controlPlaneIp}:6443 K3S_TOKEN=${k3sToken} curl -sfL https://get.k3s.io | sh -`;
          shellExec(`lxc exec ${workerNode} -- bash -c '${k3sJoinCommand}'`);
          console.log(`K3s worker node ${workerNode} join command executed.`);
        } else {
          // Kubeadm join
          console.log(`Attempting to join Kubeadm worker node ${workerNode} to control plane ${controlNode}`);
          const token = shellExec(
            `echo "$(lxc exec ${controlNode} -- bash -c 'sudo kubeadm token create --print-join-command')"`,
            { stdout: true },
          );
          shellExec(`lxc exec ${workerNode} -- bash -c '${token}'`);
          console.log(`Kubeadm worker node ${workerNode} join command executed.`);
        }
      }
      if (options.infoVm && typeof options.infoVm === 'string') {
        shellExec(`lxc config show ${options.infoVm}`);
        shellExec(`lxc info --show-log ${options.infoVm}`);
        shellExec(`lxc info ${options.infoVm}`);
        shellExec(`lxc list ${options.infoVm}`);
      }
      if (options.expose && typeof options.expose === 'string') {
        const [vmName, ports] = options.expose.split(':');
        console.log({ vmName, ports });
        const protocols = ['tcp']; // udp
        const hostIp = getLocalIPv4Address();
        const vmIp = shellExec(
          `lxc list ${vmName} --format json | jq -r '.[0].state.network.enp5s0.addresses[] | select(.family=="inet") | .address'`,
          { stdout: true },
        ).trim();
        if (!vmIp) {
          console.error(`Could not get VM IP for ${vmName}. Cannot expose ports.`);
          return;
        }
        for (const port of ports.split(',')) {
          for (const protocol of protocols) {
            const deviceName = `${vmName}-${protocol}-port-${port}`;
            shellExec(`lxc config device remove ${vmName} ${deviceName} || true`); // Use || true to prevent error if device doesn't exist
            shellExec(
              `lxc config device add ${vmName} ${deviceName} proxy listen=${protocol}:${hostIp}:${port} connect=${protocol}:${vmIp}:${port} nat=true`,
            );
            console.log(`Manually exposed ${protocol}:${hostIp}:${port} -> ${vmIp}:${port} for ${vmName}`);
          }
        }
      }
      if (options.deleteExpose && typeof options.deleteExpose === 'string') {
        const [controlNode, ports] = options.deleteExpose.split(':');
        console.log({ controlNode, ports });
        const protocols = ['tcp']; // udp
        for (const port of ports.split(',')) {
          for (const protocol of protocols) {
            shellExec(`lxc config device remove ${controlNode} ${controlNode}-${protocol}-port-${port}`);
          }
        }
      }

      // New 'test' option implementation
      if (options.test && typeof options.test === 'string') {
        const vmName = options.test;
        console.log(`Starting comprehensive test for VM: ${vmName}`);

        // 1. Monitor for IPv4 address
        let vmIp = '';
        let retries = 0;
        const maxRetries = 10;
        const delayMs = 5000; // 5 seconds

        while (!vmIp && retries < maxRetries) {
          try {
            console.log(`Attempting to get IPv4 address for ${vmName} (Attempt ${retries + 1}/${maxRetries})...`);
            vmIp = shellExec(
              `lxc list ${vmName} --format json | jq -r '.[0].state.network.enp5s0.addresses[] | select(.family=="inet") | .address'`,
              { stdout: true },
            ).trim();
            if (vmIp) {
              console.log(`IPv4 address found for ${vmName}: ${vmIp}`);
            } else {
              console.log(`IPv4 address not yet available for ${vmName}. Retrying in ${delayMs / 1000} seconds...`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          } catch (error) {
            console.error(`Error getting IPv4 address: ${error.message}`);
            console.log(`Retrying in ${delayMs / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          retries++;
        }

        if (!vmIp) {
          console.error(`Failed to get IPv4 address for ${vmName} after ${maxRetries} attempts. Aborting tests.`);
          return;
        }

        // 2. Iteratively check connection to google.com
        let connectedToGoogle = false;
        retries = 0;
        while (!connectedToGoogle && retries < maxRetries) {
          try {
            console.log(`Checking connectivity to google.com from ${vmName} (Attempt ${retries + 1}/${maxRetries})...`);
            const curlOutput = shellExec(
              `lxc exec ${vmName} -- bash -c 'curl -s -o /dev/null -w "%{http_code}" http://google.com'`,
              { stdout: true },
            );
            if (curlOutput.startsWith('2') || curlOutput.startsWith('3')) {
              console.log(`Successfully connected to google.com from ${vmName}.`);
              connectedToGoogle = true;
            } else {
              console.log(`Connectivity to google.com not yet verified. Retrying in ${delayMs / 1000} seconds...`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          } catch (error) {
            console.error(`Error checking connectivity to google.com: ${error.message}`);
            console.log(`Retrying in ${delayMs / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          retries++;
        }

        if (!connectedToGoogle) {
          console.error(
            `Failed to connect to google.com from ${vmName} after ${maxRetries} attempts. Aborting further tests.`,
          );
          return;
        }

        // 3. Check other connectivity, network, and VM health parameters
        console.log(`\n--- Comprehensive Health Report for ${vmName} ---`);

        // VM Status
        console.log('\n--- VM Status ---');
        try {
          const vmStatus = shellExec(`lxc list ${vmName} --format json`, { stdout: true, silent: true });
          console.log(JSON.stringify(JSON.parse(vmStatus), null, 2));
        } catch (error) {
          console.error(`Error getting VM status: ${error.message}`);
        }

        // CPU Usage
        console.log('\n--- CPU Usage ---');
        try {
          const cpuUsage = shellExec(`lxc exec ${vmName} -- bash -c 'top -bn1 | grep "Cpu(s)"'`, { stdout: true });
          console.log(cpuUsage.trim());
        } catch (error) {
          console.error(`Error getting CPU usage: ${error.message}`);
        }

        // Memory Usage
        console.log('\n--- Memory Usage ---');
        try {
          const memoryUsage = shellExec(`lxc exec ${vmName} -- bash -c 'free -m'`, { stdout: true });
          console.log(memoryUsage.trim());
        } catch (error) {
          console.error(`Error getting memory usage: ${error.message}`);
        }

        // Disk Usage
        console.log('\n--- Disk Usage (Root Partition) ---');
        try {
          const diskUsage = shellExec(`lxc exec ${vmName} -- bash -c 'df -h /'`, { stdout: true });
          console.log(diskUsage.trim());
        } catch (error) {
          console.error(`Error getting disk usage: ${error.message}`);
        }

        // Network Interface Status
        console.log('\n--- Network Interface Status (ip a) ---');
        try {
          const ipA = shellExec(`lxc exec ${vmName} -- bash -c 'ip a'`, { stdout: true });
          console.log(ipA.trim());
        } catch (error) {
          console.error(`Error getting network interface status: ${error.message}`);
        }

        // DNS Resolution (resolv.conf)
        console.log('\n--- DNS Configuration (/etc/resolv.conf) ---');
        try {
          const resolvConf = shellExec(`lxc exec ${vmName} -- bash -c 'cat /etc/resolv.conf'`, { stdout: true });
          console.log(resolvConf.trim());
        } catch (error) {
          console.error(`Error getting DNS configuration: ${error.message}`);
        }

        console.log(`\nComprehensive test for VM: ${vmName} completed.`);
      }
    },
  };
}

export default UnderpostLxd;
