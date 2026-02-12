/**
 * Provides baremetal provisioning and configuration functionalities.
 * @module src/cli/baremetal.js
 * @namespace UnderpostBaremetal
 */

import { fileURLToPath } from 'url';
import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { openTerminal, pbcopy, shellExec } from '../server/process.js';
import dotenv from 'dotenv';
import { loggerFactory, loggerMiddleware } from '../server/logger.js';
import fs from 'fs-extra';
import path from 'path';
import Downloader from '../server/downloader.js';
import { newInstance, range, s4, timer } from '../client/components/core/CommonJs.js';
import { spawnSync } from 'child_process';
import Underpost from '../index.js';
import express from 'express';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostBaremetal
 * @description Manages baremetal provisioning and configuration tasks.
 * This class provides a set of static methods to automate various
 * infrastructure operations, including NFS management, control server setup,
 * and system provisioning for different architectures.
 */
class UnderpostBaremetal {
  static API = {
    /**
     * @method callback
     * @description Initiates a baremetal provisioning workflow based on the provided options.
     * This is the primary entry point for orchestrating baremetal operations.
     * It handles NFS root filesystem building, control server installation/uninstallation,
     * and system-level provisioning tasks like timezone and keyboard configuration.
     * @param {string} [workflowId='rpi4mb'] - Identifier for the specific workflow configuration to use.
     * @param {object} [options] - An object containing boolean flags for various operations.
     * @param {string} [options.ipAddress=getLocalIPv4Address()] - The IP address of the control server or the local machine.
     * @param {string} [options.hostname=workflowId] - The hostname of the target baremetal machine.
     * @param {string} [options.ipFileServer=getLocalIPv4Address()] - The IP address of the file server (NFS/TFTP).
     * @param {string} [options.ipConfig=''] - IP configuration string for the baremetal machine.
     * @param {string} [options.netmask=''] - Netmask of network
     * @param {string} [options.dnsServer=''] - DNS server IP address.
     * @param {boolean} [options.dev=false] - Development mode flag.
     * @param {boolean} [options.controlServerInstall=false] - Flag to install the control server (e.g., MAAS).
     * @param {boolean} [options.controlServerUninstall=false] - Flag to uninstall the control server.
     * @param {boolean} [options.controlServerRestart=false] - Flag to restart the control server.
     * @param {boolean} [options.controlServerDbInstall=false] - Flag to install the control server's database.
     * @param {boolean} [options.createMachine=false] - Flag to create a machine in MAAS.
     * @param {boolean} [options.controlServerDbUninstall=false] - Flag to uninstall the control server's database.
     * @param {string} [options.mac=''] - MAC address of the baremetal machine.
     * @param {boolean} [options.ipxe=false] - Flag to use iPXE for booting.
     * @param {boolean} [options.ipxeRebuild=false] - Flag to rebuild the iPXE binary with embedded script.
     * @param {string} [options.ipxeBuildIso=''] - Builds a standalone iPXE ISO with embedded script for the specified workflow ID.
     * @param {boolean} [options.installPacker=false] - Flag to install Packer CLI.
     * @param {string} [options.packerMaasImageTemplate] - Template path from canonical/packer-maas to extract (requires workflow-id).
     * @param {string} [options.packerWorkflowId] - Workflow ID for Packer MAAS image operations (used with --packer-maas-image-build or --packer-maas-image-upload).
     * @param {boolean} [options.packerMaasImageBuild=false] - Flag to build a Packer MAAS image for the workflow specified by packerWorkflowId.
     * @param {boolean} [options.packerMaasImageUpload=false] - Flag to upload a Packer MAAS image artifact without rebuilding for the workflow specified by packerWorkflowId.
     * @param {boolean} [options.packerMaasImageCached=false] - Flag to use cached artifacts when building the Packer MAAS image.
     * @param {string} [options.removeMachines=''] - Comma-separated list of machine system IDs or '*' to remove existing machines from MAAS before commissioning.
     * @param {boolean} [options.clearDiscovered=false] - Flag to clear discovered machines from MAAS before commissioning.
     * @param {boolean} [options.cloudInitUpdate=false] - Flag to update cloud-init configuration on the baremetal machine.
     * @param {boolean} [options.commission=false] - Flag to commission the baremetal machine.
     * @param {number} [options.bootstrapHttpServerPort=8888] - Port for the bootstrap HTTP server.
     * @param {string} [options.bootstrapHttpServerPath='./public/localhost'] - Path for the bootstrap HTTP server files.
     * @param {string} [options.isoUrl=''] - Uses a custom ISO URL for baremetal machine commissioning.
     * @param {boolean} [options.ubuntuToolsBuild=false] - Builds ubuntu tools for chroot environment.
     * @param {boolean} [options.ubuntuToolsTest=false] - Tests ubuntu tools in chroot environment.
     * @param {boolean} [options.rockyToolsBuild=false] - Builds rocky linux tools for chroot environment.
     * @param {boolean} [options.rockyToolsTest=false] - Tests rocky linux tools in chroot environment.
     * @param {string} [options.bootcmd=''] - Comma-separated list of boot commands to execute.
     * @param {string} [options.runcmd=''] - Comma-separated list of run commands to execute.
     * @param {boolean} [options.nfsBuild=false] - Flag to build the NFS root filesystem.
     * @param {boolean} [options.nfsBuildServer=false] - Flag to build the NFS server components.
     * @param {boolean} [options.nfsMount=false] - Flag to mount the NFS root filesystem.
     * @param {boolean} [options.nfsUnmount=false] - Flag to unmount the NFS root filesystem.
     * @param {boolean} [options.nfsSh=false] - Flag to chroot into the NFS environment for shell access.
     * @param {string} [options.logs=''] - Specifies which logs to display ('dhcp', 'cloud', 'machine', 'cloud-config').
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    async callback(
      workflowId,
      options = {
        ipAddress: undefined,
        hostname: undefined,
        ipFileServer: undefined,
        ipConfig: undefined,
        netmask: undefined,
        dnsServer: undefined,
        dev: false,
        controlServerInstall: false,
        controlServerUninstall: false,
        controlServerRestart: false,
        controlServerDbInstall: false,
        controlServerDbUninstall: false,
        createMachine: false,
        mac: '',
        ipxe: false,
        ipxeRebuild: false,
        ipxeBuildIso: '',
        installPacker: false,
        packerMaasImageTemplate: false,
        packerWorkflowId: '',
        packerMaasImageBuild: false,
        packerMaasImageUpload: false,
        packerMaasImageCached: false,
        removeMachines: '',
        clearDiscovered: false,
        cloudInitUpdate: false,
        cloudInit: false,
        commission: false,
        bootstrapHttpServerPort: 8888,
        bootstrapHttpServerPath: './public/localhost',
        isoUrl: '',
        ubuntuToolsBuild: false,
        ubuntuToolsTest: false,
        rockyToolsBuild: false,
        rockyToolsTest: false,
        bootcmd: '',
        runcmd: '',
        nfsBuild: false,
        nfsBuildServer: false,
        nfsMount: false,
        nfsUnmount: false,
        nfsSh: false,
        logs: '',
      },
    ) {
      let { ipAddress, hostname, ipFileServer, ipConfig, netmask, dnsServer } = options;

      // Load environment variables from .env file, overriding existing ones if present.
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });

      // Determine the root path for npm and underpost.
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;

      // Set default values if not provided.
      workflowId = workflowId ? workflowId : 'rpi4mbarm64-iso-ram';
      hostname = hostname ? hostname : workflowId;
      ipAddress = ipAddress ? ipAddress : '192.168.1.191';
      ipFileServer = ipFileServer ? ipFileServer : Underpost.dns.getLocalIPv4Address();
      netmask = netmask ? netmask : '255.255.255.0';
      dnsServer = dnsServer ? dnsServer : '8.8.8.8';

      // IpConfig options:
      // dhcp - DHCP configuration
      // dhpc6 - DHCP IPv6 configuration
      // auto6 - automatic IPv6 configuration
      // on, any - any protocol available in the kernel (default)
      // none, off - no autoconfiguration, static network configuration
      ipConfig = ipConfig ? ipConfig : 'none';

      // Set default MAC address
      let macAddress = Underpost.baremetal.macAddressFactory(options).mac;
      const workflowsConfig = Underpost.baremetal.loadWorkflowsConfig();

      if (!workflowsConfig[workflowId]) {
        throw new Error(`Workflow configuration not found for ID: ${workflowId}`);
      }

      const tftpPrefix = workflowsConfig[workflowId].tftpPrefix || 'rpi4mb';
      // Define the bootstrap architecture.
      let bootstrapArch;

      // Set bootstrap architecture.
      if (workflowsConfig[workflowId].type === 'chroot-debootstrap') {
        const { architecture } = workflowsConfig[workflowId].debootstrap.image;
        bootstrapArch = architecture;
      } else if (workflowsConfig[workflowId].type === 'chroot-container') {
        const { architecture } = workflowsConfig[workflowId].container;
        bootstrapArch = architecture;
      }

      // Define the database provider ID.
      const dbProviderId = 'postgresql-17';

      // Define the NFS host path based on the environment variable and hostname.
      const nfsHostPath = `${process.env.NFS_EXPORT_PATH}/${hostname}`;

      // Define the TFTP root prefix path based
      const tftpRootPath = `${process.env.TFTP_ROOT}/${tftpPrefix}`;

      if (options.ipxeBuildIso) {
        let machine = null;

        if (options.cloudInit) {
          // Search for an existing machine by hostname to extract system_id for cloud-init
          const [searchMachine] = Underpost.baremetal.maasCliExec(`machines read hostname=${hostname}`);

          if (searchMachine) {
            logger.info(`Found existing machine ${hostname} with system_id ${searchMachine.system_id}`);
            machine = searchMachine;
          } else {
            // Machine does not exist, create it to obtain a system_id
            logger.info(`Machine ${hostname} not found, creating new machine for cloud-init system_id...`);
            machine = Underpost.baremetal.machineFactory({
              hostname,
              ipAddress,
              macAddress,
              architecture: workflowsConfig[workflowId].architecture,
            }).machine;
            logger.info(`✓ Machine created with system_id ${machine.system_id}`);
          }
        }

        await Underpost.baremetal.ipxeBuildIso({
          workflowId,
          isoOutputPath: options.ipxeBuildIso,
          tftpPrefix,
          ipFileServer,
          ipAddress,
          ipConfig,
          netmask,
          dnsServer,
          macAddress,
          cloudInit: options.cloudInit,
          machine,
          dev: options.dev,
          bootstrapHttpServerPort: options.bootstrapHttpServerPort,
        });
        return;
      }

      // Define the iPXE cache directory to preserve builds across tftproot cleanups
      const ipxeCacheDir = `/tmp/ipxe-cache/${tftpPrefix}`;

      // Define the bootstrap HTTP server path.
      const bootstrapHttpServerPath = options.bootstrapHttpServerPath
        ? options.bootstrapHttpServerPath
        : `/tmp/bootstrap-http-server/${workflowId}`;

      // Capture metadata for the callback execution, useful for logging and auditing.
      const callbackMetaData = {
        args: { workflowId, ipAddress, hostname, ipFileServer, ipConfig, netmask, dnsServer },
        options,
        runnerHost: { architecture: Underpost.baremetal.getHostArch().alias, ip: Underpost.dns.getLocalIPv4Address() },
        nfsHostPath,
        tftpRootPath,
        bootstrapHttpServerPath,
      };

      // Log the initiation of the baremetal callback with relevant metadata.
      logger.info('Baremetal callback', callbackMetaData);

      // Create a new machine in MAAS if the option is set.
      let machine;
      if (options.createMachine === true) {
        const [searhMachine] = Underpost.baremetal.maasCliExec(`machines read hostname=${hostname}`);

        if (searhMachine) {
          // Check if existing machine's MAC matches the specified MAC
          const existingMac = searhMachine.boot_interface?.mac_address || searhMachine.mac_address;

          // If using hardware MAC (macAddress is null), skip MAC validation and use existing machine
          if (macAddress === null) {
            logger.info(`Using hardware MAC mode - keeping existing machine ${hostname} with MAC ${existingMac}`);
            machine = searhMachine;
          } else if (existingMac && existingMac !== macAddress) {
            logger.warn(`⚠ Machine ${hostname} exists with MAC ${existingMac}, but --mac specified ${macAddress}`);
            logger.info(`Deleting existing machine ${searhMachine.system_id} to recreate with correct MAC...`);

            // Delete the existing machine
            Underpost.baremetal.maasCliExec(`machine delete ${searhMachine.system_id}`);

            // Create new machine with correct MAC
            machine = Underpost.baremetal.machineFactory({
              hostname,
              ipAddress,
              macAddress,
              architecture: workflowsConfig[workflowId].architecture,
            }).machine;

            logger.info(`✓ Machine recreated with MAC ${macAddress}`);
          } else {
            logger.info(`Using existing machine ${hostname} with MAC ${existingMac}`);
            machine = searhMachine;
          }
        } else {
          // No existing machine found, create new one
          // For hardware MAC mode (macAddress is null), we'll create machine after discovery
          if (macAddress === null) {
            logger.info(`Hardware MAC mode - machine will be created after discovery`);
            machine = null;
          } else {
            machine = Underpost.baremetal.machineFactory({
              hostname,
              ipAddress,
              macAddress,
              architecture: workflowsConfig[workflowId].architecture,
            }).machine;
          }
        }
      }

      if (options.installPacker) {
        await Underpost.baremetal.installPacker(underpostRoot);
        return;
      }

      if (options.packerMaasImageTemplate) {
        workflowId = options.packerWorkflowId;
        if (!workflowId) {
          throw new Error('--packer-workflow-id is required when using --packer-maas-image-template');
        }

        const templatePath = options.packerMaasImageTemplate;
        const targetDir = `${underpostRoot}/packer/images/${workflowId}`;

        logger.info(`Creating new Packer MAAS image template for workflow: ${workflowId}`);
        logger.info(`Template path: ${templatePath}`);
        logger.info(`Target directory: ${targetDir}`);

        try {
          // Use Underpost.repo to copy files from GitHub
          const result = await Underpost.repo.copyGitUrlDirectoryRecursive({
            gitUrl: 'https://github.com/canonical/packer-maas',
            directoryPath: templatePath,
            targetPath: targetDir,
            branch: 'main',
            overwrite: false,
          });

          logger.info(`\nSuccessfully copied ${result.filesCount} files`);

          // Create empty workflow configuration entry
          const workflowConfig = {
            dir: `packer/images/${workflowId}`,
            maas: {
              name: `custom/${workflowId.toLowerCase()}`,
              title: `${workflowId} Custom`,
              architecture: 'amd64/generic',
              base_image: 'ubuntu/22.04',
              filetype: 'tgz',
              content: `${workflowId.toLowerCase()}.tar.gz`,
            },
          };

          const workflows = Underpost.baremetal.loadPackerMaasImageBuildWorkflows();
          workflows[workflowId] = workflowConfig;
          Underpost.baremetal.writePackerMaasImageBuildWorkflows(workflows);

          logger.info('Template extracted successfully!');
          logger.info(`Added configuration for ${workflowId} to engine/baremetal/packer-workflows.json`);
          logger.info('Next steps');
          logger.info(`1. Review and customize the Packer template files in: ${targetDir}`);
          logger.info(`2. Review the workflow configuration in engine/baremetal/packer-workflows.json`);
          logger.info(
            `3. Build the image with: underpost baremetal --packer-workflow-id ${workflowId} --packer-maas-image-build`,
          );
        } catch (error) {
          throw new Error(`Failed to extract template: ${error.message}`);
        }

        return;
      }

      if (options.packerMaasImageBuild || options.packerMaasImageUpload) {
        // Use the workflow ID from --packer-workflow-id option
        if (!options.packerWorkflowId) {
          throw new Error('Workflow ID is required. Please specify using --packer-workflow-id <workflow-id>');
        }

        workflowId = options.packerWorkflowId;

        const workflow = Underpost.baremetal.loadPackerMaasImageBuildWorkflows()[workflowId];
        if (!workflow) {
          throw new Error(`Packer MAAS image build workflow not found: ${workflowId}`);
        }
        const packerDir = `${underpostRoot}/${workflow.dir}`;
        const tarballPath = `${packerDir}/${workflow.maas.content}`;

        // Build phase (skip if upload-only mode)
        if (options.packerMaasImageBuild) {
          if (shellExec('packer version').code !== 0) {
            throw new Error('Packer is not installed. Please install Packer to proceed.');
          }

          // Check for QEMU support if building for a different architecture (validator bots case)
          Underpost.baremetal.checkQemuCrossArchSupport(workflow);

          logger.info(`Building Packer image for ${workflowId} in ${packerDir}...`);

          // Only remove artifacts if not using cached mode
          if (!options.packerMaasImageCached) {
            const artifacts = [
              'output-rocky9',
              'packer_cache',
              'x86_64_VARS.fd',
              'aarch64_VARS.fd',
              workflow.maas.content,
            ];
            shellExec(`cd packer/images/${workflowId}
rm -rf ${artifacts.join(' ')}`);
            logger.info('Removed previous build artifacts');
          } else {
            logger.info('Cached mode: Keeping existing artifacts for incremental build');
          }
          shellExec(`chmod +x ${underpostRoot}/scripts/packer-init-vars-file.sh`);
          shellExec(`${underpostRoot}/scripts/packer-init-vars-file.sh`);

          const init = spawnSync('packer', ['init', '.'], { stdio: 'inherit', cwd: packerDir });
          if (init.status !== 0) {
            throw new Error('Packer init failed');
          }

          const isArm = process.arch === 'arm64';
          // Add /usr/local/bin to PATH so Packer can find compiled QEMU binaries
          const packerEnv = {
            ...process.env,
            PACKER_LOG: '1',
            PATH: `/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}`,
          };
          const build = spawnSync('packer', ['build', '-var', `host_is_arm=${isArm}`, '.'], {
            stdio: 'inherit',
            cwd: packerDir,
            env: packerEnv,
          });

          if (build.status !== 0) {
            throw new Error('Packer build failed');
          }
        } else {
          // Upload-only mode: verify tarball exists
          logger.info(`Upload-only mode: checking for existing build artifact...`);
          if (!fs.existsSync(tarballPath)) {
            throw new Error(
              `Build artifact not found: ${tarballPath}\n` +
                `Please build first with: --packer-workflow-id ${workflowId} --packer-maas-image-build`,
            );
          }
          const stats = fs.statSync(tarballPath);
          logger.info(`Found existing artifact: ${tarballPath} (${(stats.size / 1024 / 1024 / 1024).toFixed(2)} GB)`);
        }

        logger.info(`Uploading image to MAAS...`);

        // Detect MAAS profile from 'maas list' output
        let maasProfile = process.env.MAAS_ADMIN_USERNAME;
        if (!maasProfile) {
          const profileList = shellExec('maas list', { silent: true, stdout: true });
          if (profileList) {
            const firstLine = profileList.trim().split('\n')[0];
            const match = firstLine.match(/^(\S+)\s+http/);
            if (match) {
              maasProfile = match[1];
              logger.info(`Detected MAAS profile: ${maasProfile}`);
            }
          }
        }

        if (!maasProfile) {
          throw new Error(
            'MAAS profile not found. Please run "maas login" first or set MAAS_ADMIN_USERNAME environment variable.',
          );
        }

        // Use the upload script to avoid MAAS CLI bugs
        const uploadScript = `${underpostRoot}/scripts/maas-upload-boot-resource.sh`;
        const uploadCmd = `${uploadScript} ${maasProfile} "${workflow.maas.name}" "${workflow.maas.title}" "${workflow.maas.architecture}" "${workflow.maas.base_image}" "${workflow.maas.filetype}" "${tarballPath}"`;

        logger.info(`Uploading to MAAS using: ${uploadScript}`);
        const uploadResult = shellExec(uploadCmd);
        if (uploadResult.code !== 0) {
          logger.error(`Upload failed with exit code: ${uploadResult.code}`);
          if (uploadResult.stdout) {
            logger.error(`Upload output:\n${uploadResult.stdout}`);
          }
          if (uploadResult.stderr) {
            logger.error(`Upload error output:\n${uploadResult.stderr}`);
          }
          throw new Error('MAAS upload failed - see output above for details');
        }
        logger.info(`Successfully uploaded ${workflow.maas.name} to MAAS!`);
        return;
      }

      // Handle various log display options.
      if (options.logs === 'dhcp') {
        shellExec(`journalctl -f -t dhcpd -u snap.maas.pebble.service`);
        return;
      }

      if (options.logs === 'dhcp-lease') {
        shellExec(`cat /var/snap/maas/common/maas/dhcp/dhcpd.leases`);
        shellExec(`cat /var/snap/maas/common/maas/dhcp/dhcpd.pid`);
        return;
      }

      if (options.logs === 'dhcp-lan') {
        shellExec(`sudo tcpdump -l -n -i any -s0 -vv 'udp and (port 67 or 68)'`);
        return;
      }

      if (options.logs === 'cloud-init') {
        shellExec(`tail -f -n 900 ${nfsHostPath}/var/log/cloud-init.log`);
        return;
      }

      if (options.logs === 'cloud-init-machine') {
        shellExec(`tail -f -n 900 ${nfsHostPath}/var/log/cloud-init-output.log`);
        return;
      }

      if (options.logs === 'cloud-init-config') {
        shellExec(`cat ${bootstrapHttpServerPath}/${hostname}/cloud-init/user-data`);
        shellExec(`cat ${bootstrapHttpServerPath}/${hostname}/cloud-init/meta-data`);
        shellExec(`cat ${bootstrapHttpServerPath}/${hostname}/cloud-init/vendor-data`);
        return;
      }

      // Handle NFS shell access option.
      if (options.nfsSh === true) {
        // Copy the chroot command to the clipboard for easy execution.
        if (bootstrapArch && bootstrapArch !== callbackMetaData.runnerHost.architecture)
          switch (bootstrapArch) {
            case 'arm64':
              pbcopy(`sudo chroot ${nfsHostPath} /usr/bin/qemu-aarch64-static /bin/bash`);
              break;

            case 'amd64':
              pbcopy(`sudo chroot ${nfsHostPath} /usr/bin/qemu-x86_64-static /bin/bash`);
              break;

            default:
              break;
          }
        else pbcopy(`sudo chroot ${nfsHostPath} /bin/bash`);

        return; // Exit early as this is a specific interactive operation.
      }

      // Handle control server installation.
      if (options.controlServerInstall === true) {
        // Ensure scripts are executable and then run them.
        shellExec(`chmod +x ${underpostRoot}/scripts/maas-setup.sh`);
        shellExec(`chmod +x ${underpostRoot}/scripts/nat-iptables.sh`);
        shellExec(`${underpostRoot}/scripts/maas-setup.sh`);
        return;
      }

      // Handle control server uninstallation.
      if (options.controlServerUninstall === true) {
        // Stop and remove MAAS services, handling potential errors gracefully.
        shellExec(`sudo snap stop maas.pebble`);
        shellExec(`sudo snap stop maas`);
        shellExec(`sudo snap remove maas --purge`);

        // Remove residual snap data to ensure a clean uninstall.
        shellExec(`sudo rm -rf /var/snap/maas`);
        shellExec(`sudo rm -rf ~/snap/maas`);

        // Remove MAAS configuration and data directories.
        shellExec(`sudo rm -rf /etc/maas`);
        shellExec(`sudo rm -rf /var/lib/maas`);
        shellExec(`sudo rm -rf /var/log/maas`);
        return;
      }

      // Handle control server restart.
      if (options.controlServerRestart === true) {
        shellExec(`sudo snap restart maas`);
        return;
      }

      // Handle control server database installation.
      if (options.controlServerDbInstall === true) {
        // Deploy the database provider and manage MAAS database.
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} install`);
        shellExec(
          `node ${underpostRoot}/bin/deploy pg-drop-db ${process.env.DB_PG_MAAS_NAME} ${process.env.DB_PG_MAAS_USER}`,
        );
        shellExec(`node ${underpostRoot}/bin/deploy maas-db`);
        return;
      }

      // Handle control server database uninstallation.
      if (options.controlServerDbUninstall === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} uninstall`);
        return;
      }

      // Handle NFS mount operation.
      if (options.nfsMount === true) {
        await Underpost.baremetal.nfsMountCallback({
          hostname,
          nfsHostPath,
          workflowId,
          mount: true,
        });
        return;
      }

      // Handle NFS unmount operation.
      if (options.nfsUnmount === true) {
        await Underpost.baremetal.nfsMountCallback({
          hostname,
          nfsHostPath,
          workflowId,
          unmount: true,
        });
        return;
      }

      // Handle NFS root filesystem build operation.
      if (options.nfsBuild === true) {
        await Underpost.baremetal.nfsMountCallback({
          hostname,
          nfsHostPath,
          workflowId,
          unmount: true,
        });

        // Clean and create the NFS host path.
        shellExec(`sudo rm -rf ${nfsHostPath}/*`);
        shellExec(`mkdir -p ${nfsHostPath}`);

        // Perform the first stage of debootstrap.
        if (workflowsConfig[workflowId].type === 'chroot-debootstrap') {
          const { architecture, name } = workflowsConfig[workflowId].debootstrap.image;
          shellExec(
            [
              `sudo debootstrap`,
              `--arch=${architecture}`,
              `--variant=minbase`,
              `--foreign`, // Indicates a two-stage debootstrap.
              name,
              nfsHostPath,
              `http://ports.ubuntu.com/ubuntu-ports/`,
            ].join(' '),
          );
        } else if (workflowsConfig[workflowId].type === 'chroot-container') {
          const { image } = workflowsConfig[workflowId].container;
          shellExec(`sudo podman pull --arch=${bootstrapArch} ${image}`);
          shellExec(`sudo podman create --arch=${bootstrapArch} --name chroot-source ${image}`);
          shellExec(`sudo podman export chroot-source | sudo tar -x -C ${nfsHostPath}`);
          shellExec(`sudo podman rm chroot-source`);
        }

        // Create a podman container to extract QEMU static binaries.
        shellExec(`sudo podman create --name extract multiarch/qemu-user-static`);
        shellExec(`podman ps -a`); // List all podman containers for verification.

        // If cross-architecture, copy the QEMU static binary into the chroot.
        if (bootstrapArch !== callbackMetaData.runnerHost.architecture)
          Underpost.baremetal.crossArchBinFactory({
            nfsHostPath,
            bootstrapArch,
          });

        // Clean up the temporary podman container.
        shellExec(`sudo podman rm extract`);
        shellExec(`podman ps -a`);
        shellExec(`file ${nfsHostPath}/bin/bash`); // Verify the bash executable in the chroot.

        // Mount necessary filesystems and register binfmt for the second stage.
        await Underpost.baremetal.nfsMountCallback({
          hostname,
          nfsHostPath,
          workflowId,
          mount: true,
        });

        // Perform the second stage of debootstrap within the chroot environment.
        if (workflowsConfig[workflowId].type === 'chroot-debootstrap') {
          Underpost.baremetal.crossArchRunner({
            nfsHostPath,
            bootstrapArch,
            callbackMetaData,
            steps: [`/debootstrap/debootstrap --second-stage`],
          });
        } else if (
          workflowsConfig[workflowId].type === 'chroot-container' &&
          workflowsConfig[workflowId].osIdLike.match('rhel')
        ) {
          // Copy resolv.conf to allow network access inside chroot
          shellExec(`sudo cp /etc/resolv.conf ${nfsHostPath}/etc/resolv.conf`);

          // Consolidate all package installations into one step to avoid redundancy
          const { packages } = workflowsConfig[workflowId].container;
          const basePackages = [
            'findutils',
            'systemd',
            'sudo',
            'dracut',
            'dracut-network',
            'dracut-config-generic',
            'nfs-utils',
            'file',
            'binutils',
            'kernel-modules-core',
            'NetworkManager',
            'dhclient',
            'iputils',
          ];
          const allPackages = packages && packages.length > 0 ? [...basePackages, ...packages] : basePackages;

          Underpost.baremetal.crossArchRunner({
            nfsHostPath,
            bootstrapArch,
            callbackMetaData,
            steps: [
              `dnf install -y --allowerasing ${allPackages.join(' ')} 2>/dev/null || yum install -y --allowerasing ${allPackages.join(' ')} 2>/dev/null || echo "Package install completed"`,
              `dnf clean all`,
              `echo "=== Installed packages verification ==="`,
              `rpm -qa | grep -E "dracut|kernel|nfs" | sort`,
              `echo "=== Boot directory contents ==="`,
              `ls -la /boot /lib/modules/*/`,
              // Search for bootable kernel in order of preference:
              // 1. Raw ARM64 Image file (preferred for GRUB)
              // 2. vmlinuz or vmlinux (may be PE32+ on Rocky Linux)
              `echo "Searching for bootable kernel..."`,
              `KERNEL_FILE=""`,
              // First try to find raw Image file
              `if [ -f /boot/Image ]; then KERNEL_FILE=/boot/Image; echo "Found raw ARM64 Image: $KERNEL_FILE"; fi`,
              `if [ -z "$KERNEL_FILE" ]; then KERNEL_FILE=$(find /lib/modules -name "Image" -o -name "Image.gz" 2>/dev/null | head -n 1); test -n "$KERNEL_FILE" && echo "Found kernel Image in modules: $KERNEL_FILE"; fi`,
              // Fallback to vmlinuz
              `if [ -z "$KERNEL_FILE" ]; then KERNEL_FILE=$(find /boot -name "vmlinuz-*" 2>/dev/null | head -n 1); test -n "$KERNEL_FILE" && echo "Found vmlinuz: $KERNEL_FILE"; fi`,
              `if [ -z "$KERNEL_FILE" ]; then KERNEL_FILE=$(find /lib/modules -name "vmlinuz" 2>/dev/null | head -n 1); test -n "$KERNEL_FILE" && echo "Found vmlinuz in modules: $KERNEL_FILE"; fi`,
              // Last resort: any vmlinux
              `if [ -z "$KERNEL_FILE" ]; then KERNEL_FILE=$(find /lib/modules -name "vmlinux" 2>/dev/null | head -n 1); test -n "$KERNEL_FILE" && echo "Found vmlinux: $KERNEL_FILE"; fi`,
              `if [ -z "$KERNEL_FILE" ]; then echo "ERROR: No kernel found!"; exit 1; fi`,
              // Copy and check kernel type
              `cp "$KERNEL_FILE" /boot/vmlinuz-efi.tmp`,
              // Decompress if gzipped
              `if file /boot/vmlinuz-efi.tmp | grep -q gzip; then echo "Decompressing gzipped kernel..."; gunzip -c /boot/vmlinuz-efi.tmp > /boot/vmlinuz-efi && rm /boot/vmlinuz-efi.tmp; else mv /boot/vmlinuz-efi.tmp /boot/vmlinuz-efi; fi`,
              `KERNEL_TYPE=$(file /boot/vmlinuz-efi 2>/dev/null)`,
              `echo "Final kernel file type: $KERNEL_TYPE"`,
              // Handle PE32+ if still present - use kernel directly without extraction since iPXE can boot it
              `case "$KERNEL_TYPE" in *PE32+*|*EFI*application*) echo "WARNING: Kernel is PE32+ EFI executable"; echo "GRUB may fail to boot this - recommend using iPXE chainload or installing kernel-core package"; echo "Keeping PE32+ kernel as-is for now..."; ;; *ARM64*|*aarch64*|*Image*|*data*) echo "Kernel appears to be raw ARM64 format - suitable for GRUB"; ;; *) echo "Unknown kernel format - attempting to use anyway"; ;; esac`,
              // Get kernel version for initramfs rebuild
              `KVER=$(basename $(dirname "$KERNEL_FILE"))`,
              `echo "Kernel version: $KVER"`,
              // Rebuild initramfs with NFS and network support
              `echo "Rebuilding initramfs with NFS and network support..."`,
              `echo "Available dracut modules:"`,
              `dracut --list-modules 2>/dev/null | grep -E "network|nfs" || echo "No network modules listed"`,
              // Use network-manager module (it's available in Rocky 9) for better compatibility
              `dracut --force --add "nfs network base" --add-drivers "nfs sunrpc" --kver "$KVER" /boot/initrd.img "$KVER" 2>&1 || echo "Initramfs rebuild failed"`,
              // Fallback: if rebuild fails, use existing initramfs
              `if [ ! -f /boot/initrd.img ]; then echo "Initramfs rebuild failed, using existing..."; INITRD=$(find /boot -name "initramfs-$KVER.img" 2>/dev/null | head -n 1); if [ -z "$INITRD" ]; then INITRD=$(find /boot -name "initramfs*.img" 2>/dev/null | grep -v kdump | head -n 1); fi; if [ -n "$INITRD" ]; then cp "$INITRD" /boot/initrd.img; echo "Copied existing initramfs: $INITRD"; else echo "ERROR: No initramfs found!"; fi; fi`,
              `echo "=== Final boot files ==="`,
              `ls -lh /boot/vmlinuz-efi /boot/initrd.img`,
              `file /boot/vmlinuz-efi`,
              `file /boot/initrd.img`,
              `echo "=== Setting root password ==="`,
              `echo "root:root" | chpasswd`,
            ],
          });
        } else {
          throw new Error(
            `Unsupported workflow type for NFS build: ${workflowsConfig[workflowId].type} and like os ID ${workflowsConfig[workflowId].osIdLike}`,
          );
        }
      }

      // Fetch boot resources and machines if commissioning or listing.

      let resources = Underpost.baremetal.maasCliExec(`boot-resources read`).map((o) => ({
        id: o.id,
        name: o.name,
        architecture: o.architecture,
      }));
      if (options.ls === true) {
        console.table(resources);
      }
      let machines = Underpost.baremetal.maasCliExec(`machines read`).map((m) => ({
        system_id: m.interface_set[0].system_id,
        mac_address: m.interface_set[0].mac_address,
        hostname: m.hostname,
        status_name: m.status_name,
      }));
      if (options.ls === true) {
        console.table(machines);
      }

      if (options.clearDiscovered) Underpost.baremetal.removeDiscoveredMachines();

      // Handle remove existing machines from MAAS.
      if (options.removeMachines)
        machines = Underpost.baremetal.removeMachines({
          machines: options.removeMachines === 'all' ? machines : options.removeMachines.split(','),
          ignore: machine ? [machine.system_id] : [],
        });

      if (workflowsConfig[workflowId].type === 'chroot-debootstrap') {
        if (options.ubuntuToolsBuild) {
          Underpost.cloudInit.buildTools({
            workflowId,
            nfsHostPath,
            hostname,
            callbackMetaData,
            dev: options.dev,
          });

          const { chronyc, keyboard } = workflowsConfig[workflowId];
          const { timezone, chronyConfPath } = chronyc;
          const systemProvisioning = 'ubuntu';

          Underpost.baremetal.crossArchRunner({
            nfsHostPath,
            bootstrapArch,
            callbackMetaData,
            steps: [
              ...Underpost.baremetal.systemProvisioningFactory[systemProvisioning].base(),
              ...Underpost.baremetal.systemProvisioningFactory[systemProvisioning].user(),
              ...Underpost.baremetal.systemProvisioningFactory[systemProvisioning].timezone({
                timezone,
                chronyConfPath,
              }),
              ...Underpost.baremetal.systemProvisioningFactory[systemProvisioning].keyboard(keyboard.layout),
            ],
          });
        }

        if (options.ubuntuToolsTest)
          Underpost.baremetal.crossArchRunner({
            nfsHostPath,
            bootstrapArch,
            callbackMetaData,
            steps: [
              `chmod +x /underpost/date.sh`,
              `chmod +x /underpost/keyboard.sh`,
              `chmod +x /underpost/dns.sh`,
              `chmod +x /underpost/help.sh`,
              `chmod +x /underpost/host.sh`,
              `chmod +x /underpost/test.sh`,
              `chmod +x /underpost/start.sh`,
              `chmod +x /underpost/reset.sh`,
              `chmod +x /underpost/shutdown.sh`,
              `chmod +x /underpost/device_scan.sh`,
              `chmod +x /underpost/mac.sh`,
              `chmod +x /underpost/enlistment.sh`,
              `sudo chmod 700 ~/.ssh/`, // Set secure permissions for .ssh directory.
              `sudo chmod 600 ~/.ssh/authorized_keys`, // Set secure permissions for authorized_keys.
              `sudo chmod 644 ~/.ssh/known_hosts`, // Set permissions for known_hosts.
              `sudo chmod 600 ~/.ssh/id_rsa`, // Set secure permissions for private key.
              `sudo chmod 600 /etc/ssh/ssh_host_ed25519_key`, // Set secure permissions for host key.
              `chown -R root:root ~/.ssh`, // Ensure root owns the .ssh directory.
              `/underpost/test.sh`,
            ],
          });
      }

      if (
        workflowsConfig[workflowId].type === 'chroot-container' &&
        workflowsConfig[workflowId].osIdLike.match('rhel')
      ) {
        if (options.rockyToolsBuild) {
          const { chronyc, keyboard } = workflowsConfig[workflowId];
          const { timezone } = chronyc;
          const systemProvisioning = 'rocky';

          Underpost.baremetal.crossArchRunner({
            nfsHostPath,
            bootstrapArch,
            callbackMetaData,
            steps: [
              ...Underpost.baremetal.systemProvisioningFactory[systemProvisioning].base(),
              ...Underpost.baremetal.systemProvisioningFactory[systemProvisioning].user(),
              ...Underpost.baremetal.systemProvisioningFactory[systemProvisioning].timezone({
                timezone,
                chronyConfPath: chronyc.chronyConfPath,
              }),
              ...Underpost.baremetal.systemProvisioningFactory[systemProvisioning].keyboard(keyboard.layout),
            ],
          });
        }

        if (options.rockyToolsTest)
          Underpost.baremetal.crossArchRunner({
            nfsHostPath,
            bootstrapArch,
            callbackMetaData,
            steps: [
              `node --version`,
              `npm --version`,
              `underpost --version`,
              `timedatectl status`,
              `localectl status`,
              `id root`,
              `ls -la /home/root/.ssh/`,
              `cat /home/root/.ssh/authorized_keys`,
              'underpost test',
            ],
          });
      }

      const authCredentials =
        options.commission || options.cloudInit || options.cloudInitUpdate
          ? Underpost.baremetal.maasAuthCredentialsFactory()
          : { consumer_key: '', consumer_secret: '', token_key: '', token_secret: '' };

      if (options.cloudInit || options.cloudInitUpdate) {
        const { chronyc, networkInterfaceName } = workflowsConfig[workflowId];
        const { timezone, chronyConfPath } = chronyc;

        let write_files = [];
        let runcmd = options.runcmd;

        if (machine && options.commission) {
          write_files = Underpost.baremetal.commissioningWriteFilesFactory({
            machine,
            authCredentials,
            runnerHostIp: callbackMetaData.runnerHost.ip,
          });
          runcmd = '/usr/local/bin/underpost-enlist.sh';
        }

        const { cloudConfigSrc } = Underpost.cloudInit.configFactory(
          {
            controlServerIp: callbackMetaData.runnerHost.ip,
            hostname,
            commissioningDeviceIp: ipAddress,
            gatewayip: callbackMetaData.runnerHost.ip,
            mac: macAddress,
            timezone,
            chronyConfPath,
            networkInterfaceName,
            ubuntuToolsBuild: options.ubuntuToolsBuild,
            bootcmd: options.bootcmd,
            runcmd,
            write_files,
          },
          authCredentials,
        );
        Underpost.baremetal.httpBootstrapServerStaticFactory({
          bootstrapHttpServerPath,
          hostname,
          cloudConfigSrc,
          isoUrl: workflowsConfig[workflowId].isoUrl,
        });
      }

      // Rebuild NFS server configuration.
      if (
        (options.nfsBuildServer === true || options.commission === true) &&
        (workflowsConfig[workflowId].type === 'iso-nfs' ||
          workflowsConfig[workflowId].type === 'chroot-debootstrap' ||
          workflowsConfig[workflowId].type === 'chroot-container')
      ) {
        shellExec(`${underpostRoot}/scripts/nat-iptables.sh`);
        Underpost.baremetal.rebuildNfsServer({
          nfsHostPath,
        });
      }
      // Handle commissioning tasks
      if (options.commission === true) {
        let { firmwares, networkInterfaceName, maas, menuentryStr, type } = workflowsConfig[workflowId];

        // Use commissioning config (Ubuntu ephemeral) for PXE boot resources
        const commissioningImage = maas?.commissioning || {
          architecture: 'arm64/generic',
          name: 'ubuntu/noble',
        };
        const resource = resources.find(
          (o) => o.architecture === commissioningImage.architecture && o.name === commissioningImage.name,
        );
        logger.info('Commissioning resource', resource);

        if (type === 'iso-nfs') {
          // Prepare NFS casper path if using NFS boot.
          shellExec(`sudo rm -rf ${nfsHostPath}`);
          shellExec(`mkdir -p ${nfsHostPath}/casper`);
        }

        // Clean and create TFTP root path.
        shellExec(`sudo rm -rf ${tftpRootPath}`);
        shellExec(`mkdir -p ${tftpRootPath}/pxe`);

        // Restore iPXE build from cache if available and not forcing rebuild
        if (fs.existsSync(`${ipxeCacheDir}/ipxe.efi`) && !options.ipxeRebuild) {
          shellExec(`cp ${ipxeCacheDir}/ipxe.efi ${tftpRootPath}/ipxe.efi`);
        }

        // Process firmwares for TFTP.
        for (const firmware of firmwares) {
          const { url, gateway, subnet } = firmware;
          if (url.match('.zip')) {
            const name = url.split('/').pop().replace('.zip', '');
            const path = `../${name}`;
            if (!fs.existsSync(path)) {
              await Downloader.downloadFile(url, `../${name}.zip`); // Download firmware if not exists.
              shellExec(`cd .. && mkdir ${name} && cd ${name} && unzip ../${name}.zip`); // Unzip firmware.
            }
            shellExec(`sudo cp -a ${path}/* ${tftpRootPath}`); // Copy firmware files to TFTP root.

            if (gateway && subnet) {
              const bootConfSrc = Underpost.baremetal.bootConfFactory({
                workflowId,
                tftpIp: callbackMetaData.runnerHost.ip,
                tftpPrefixStr: tftpPrefix,
                macAddress,
                clientIp: ipAddress,
                subnet,
                gateway,
              });
              if (bootConfSrc) fs.writeFileSync(`${tftpRootPath}/boot_${name}.conf`, bootConfSrc, 'utf8');
            }
          }
        }

        // Configure GRUB for PXE boot.
        {
          // Fetch kernel and initrd paths from MAAS boot resource.
          // Both NFS and disk-based commissioning use MAAS boot resources.
          let kernelFilesPaths, resourcesPath;
          if (workflowsConfig[workflowId].type === 'chroot-container') {
            const arch = commissioningImage.architecture.split('/')[0];
            resourcesPath = `/var/snap/maas/common/maas/image-storage/bootloaders/uefi/${arch}`;
            kernelFilesPaths = {
              'vmlinuz-efi': `${nfsHostPath}/boot/vmlinuz-efi`,
              'initrd.img': `${nfsHostPath}/boot/initrd.img`,
            };
          } else {
            const kf = Underpost.baremetal.kernelFactory({
              resource,
              type,
              nfsHostPath,
              isoUrl: options.isoUrl || workflowsConfig[workflowId].isoUrl,
              workflowId,
            });
            kernelFilesPaths = kf.kernelFilesPaths;
            resourcesPath = kf.resourcesPath;
          }

          const { cmd } = Underpost.baremetal.kernelCmdBootParamsFactory({
            ipClient: ipAddress,
            ipDhcpServer: callbackMetaData.runnerHost.ip,
            ipConfig,
            ipFileServer,
            netmask,
            hostname,
            dnsServer,
            networkInterfaceName,
            fileSystemUrl:
              type === 'iso-ram'
                ? `http://${callbackMetaData.runnerHost.ip}:${Underpost.baremetal.bootstrapHttpServerPortFactory({ port: options.bootstrapHttpServerPort, workflowId, workflowsConfig })}/${hostname}/${kernelFilesPaths.isoUrl.split('/').pop()}`
                : kernelFilesPaths.isoUrl,
            bootstrapHttpServerPort: Underpost.baremetal.bootstrapHttpServerPortFactory({
              port: options.bootstrapHttpServerPort,
              workflowId,
              workflowsConfig,
            }),
            type,
            macAddress,
            cloudInit: options.cloudInit,
            machine,
            dev: options.dev,
            osIdLike: workflowsConfig[workflowId].osIdLike || '',
            authCredentials,
          });

          // Check if iPXE mode is enabled AND the iPXE EFI binary exists
          let useIpxe = options.ipxe;
          if (options.ipxe) {
            const arch = commissioningImage.architecture.split('/')[0];
            const ipxeScript = Underpost.baremetal.ipxeScriptFactory({
              maasIp: callbackMetaData.runnerHost.ip,
              macAddress,
              architecture: arch,
              tftpPrefix,
              kernelCmd: cmd,
            });
            fs.writeFileSync(`${tftpRootPath}/stable-id.ipxe`, ipxeScript, 'utf8');

            // Create embedded boot script that does DHCP and chains to the main script
            const embeddedScript = Underpost.baremetal.ipxeEmbeddedScriptFactory({
              tftpServer: callbackMetaData.runnerHost.ip,
              scriptPath: `/${tftpPrefix}/stable-id.ipxe`,
              macAddress: macAddress,
            });
            fs.writeFileSync(`${tftpRootPath}/boot.ipxe`, embeddedScript, 'utf8');

            logger.info('✓ iPXE script generated for MAAS commissioning', {
              registeredMAC: macAddress,
              path: `${tftpRootPath}/stable-id.ipxe`,
              embeddedPath: `${tftpRootPath}/boot.ipxe`,
            });

            Underpost.baremetal.ipxeEfiFactory({
              tftpRootPath,
              ipxeCacheDir,
              arch,
              underpostRoot,
              embeddedScriptPath: `${tftpRootPath}/boot.ipxe`,
              forceRebuild: options.ipxeRebuild,
            });
          }

          const { grubCfgSrc } = Underpost.baremetal.grubFactory({
            menuentryStr,
            kernelPath: `/${tftpPrefix}/pxe/vmlinuz-efi`,
            initrdPath: `/${tftpPrefix}/pxe/initrd.img`,
            cmd,
            tftpIp: callbackMetaData.runnerHost.ip,
            ipxe: useIpxe,
            ipxePath: `/${tftpPrefix}/ipxe.efi`,
          });
          Underpost.baremetal.writeGrubConfigToFile({
            grubCfgSrc: machine ? grubCfgSrc.replaceAll('system-id', machine.system_id) : grubCfgSrc,
          });
          if (machine) {
            logger.info('✓ GRUB config written with system_id', { system_id: machine.system_id });
          }
          Underpost.baremetal.updateKernelFiles({
            commissioningImage,
            resourcesPath,
            tftpRootPath,
            kernelFilesPaths,
          });
        }

        // Pass architecture from commissioning or deployment config
        const grubArch = commissioningImage.architecture;
        Underpost.baremetal.efiGrubModulesFactory({ image: { architecture: grubArch } });

        // Set ownership and permissions for TFTP root.
        shellExec(`sudo chown -R $(whoami):$(whoami) ${process.env.TFTP_ROOT}`);
        shellExec(`sudo sudo chmod 755 ${process.env.TFTP_ROOT}`);

        Underpost.baremetal.httpBootstrapServerRunnerFactory({
          hostname,
          bootstrapHttpServerPath,
          bootstrapHttpServerPort: Underpost.baremetal.bootstrapHttpServerPortFactory({
            port: options.bootstrapHttpServerPort,
            workflowId,
            workflowsConfig,
          }),
        });

        if (type === 'chroot-debootstrap' || type === 'chroot-container')
          await Underpost.baremetal.nfsMountCallback({
            hostname,
            nfsHostPath,
            workflowId,
            mount: true,
          });

        const commissionMonitorPayload = {
          macAddress,
          ipAddress,
          hostname,
          architecture: Underpost.baremetal.fallbackArchitecture(workflowsConfig[workflowId]),
          machine,
        };
        logger.info('Waiting for commissioning...', {
          ...commissionMonitorPayload,
          machine: machine ? machine.system_id : null,
        });

        const { discovery, machine: discoveredMachine } =
          await Underpost.baremetal.commissionMonitor(commissionMonitorPayload);
        if (discoveredMachine) machine = discoveredMachine;

        if (machine) {
          const write_files = Underpost.baremetal.commissioningWriteFilesFactory({
            machine,
            authCredentials,
            runnerHostIp: callbackMetaData.runnerHost.ip,
          });

          const { cloudConfigSrc } = Underpost.cloudInit.configFactory(
            {
              controlServerIp: callbackMetaData.runnerHost.ip,
              hostname,
              commissioningDeviceIp: ipAddress,
              gatewayip: callbackMetaData.runnerHost.ip,
              mac: macAddress,
              timezone: workflowsConfig[workflowId].chronyc.timezone,
              chronyConfPath: workflowsConfig[workflowId].chronyc.chronyConfPath,
              networkInterfaceName: workflowsConfig[workflowId].networkInterfaceName,
              ubuntuToolsBuild: options.ubuntuToolsBuild,
              bootcmd: options.bootcmd,
              runcmd: '/usr/local/bin/underpost-enlist.sh',
              write_files,
            },
            authCredentials,
          );

          Underpost.baremetal.httpBootstrapServerStaticFactory({
            bootstrapHttpServerPath,
            hostname,
            cloudConfigSrc,
            isoUrl: workflowsConfig[workflowId].isoUrl,
          });
        }

        if ((type === 'chroot-debootstrap' || type === 'chroot-container') && options.cloudInit === true) {
          openTerminal(`node ${underpostRoot}/bin baremetal ${workflowId} ${ipAddress} ${hostname} --logs cloud-init`);
          openTerminal(
            `node ${underpostRoot}/bin baremetal ${workflowId} ${ipAddress} ${hostname} --logs cloud-init-machine`,
          );
          shellExec(
            `node ${underpostRoot}/bin baremetal ${workflowId} ${ipAddress} ${hostname} --logs cloud-init-config`,
          );
        }
      }
    },

    /**
     * @method installPacker
     * @description Installs Packer CLI.
     * @memberof UnderpostBaremetal
     * @returns {Promise<void>}
     */
    async installPacker(underpostRoot) {
      const scriptPath = `${underpostRoot}/scripts/packer-setup.sh`;
      logger.info(`Installing Packer using script: ${scriptPath}`);
      shellExec(`sudo chmod +x ${scriptPath}`);
      shellExec(`sudo ${scriptPath}`);
    },

    /**
     * @method ipxeBuildIso
     * @description Builds a UEFI-bootable iPXE ISO with an embedded bridge script.
     * @param {object} params
     * @param {string} params.workflowId - The workflow identifier (e.g., 'hp-envy-iso-ram').
     * @param {string} params.isoOutputPath - Output path for the generated ISO file.
     * @param {string} params.tftpPrefix - TFTP prefix directory (e.g., 'envy').
     * @param {string} params.ipFileServer - IP address of the TFTP/file server to chain to.
     * @param {string} [params.ipAddress='192.168.1.191'] - The IP address of the client machine.
     * @param {string} [params.ipConfig='none'] - IP configuration method (e.g., 'dhcp', 'none').
     * @param {string} [params.netmask='255.255.255.0'] - The network mask.
     * @param {string} [params.dnsServer='8.8.8.8'] - The DNS server address.
     * @param {string} [params.macAddress=''] - The MAC address of the client machine.
     * @param {boolean} [params.cloudInit=false] - Flag to enable cloud-init.
     * @param {object} [params.machine=null] - The machine object containing system_id for cloud-init.
     * @param {boolean} [params.dev=false] - Development mode flag to determine paths.
     * @param {number} [params.bootstrapHttpServerPort=8888] - Port for the bootstrap HTTP server used in ISO RAM workflows.
     * @memberof UnderpostBaremetal
     * @returns {Promise<void>}
     */
    async ipxeBuildIso({
      workflowId,
      isoOutputPath,
      tftpPrefix,
      ipFileServer,
      ipAddress,
      ipConfig,
      netmask,
      dnsServer,
      macAddress,
      cloudInit,
      machine,
      dev,
      bootstrapHttpServerPort,
    }) {
      const outputPath = !isoOutputPath || isoOutputPath === '.' ? `./ipxe-${workflowId}.iso` : isoOutputPath;
      if (fs.existsSync(outputPath)) fs.removeSync(outputPath);
      shellExec(`mkdir -p $(dirname ${outputPath})`);

      const workflowsConfig = Underpost.baremetal.loadWorkflowsConfig();
      if (!workflowsConfig[workflowId]) {
        throw new Error(`Workflow configuration not found for ID: ${workflowId}`);
      }

      const authCredentials = cloudInit
        ? Underpost.baremetal.maasAuthCredentialsFactory()
        : { consumer_key: '', consumer_secret: '', token_key: '', token_secret: '' };

      const { cmd } = Underpost.baremetal.kernelCmdBootParamsFactory({
        ipClient: ipAddress,
        ipDhcpServer: ipFileServer,
        ipFileServer,
        ipConfig,
        netmask,
        hostname: workflowId,
        dnsServer,
        fileSystemUrl:
          dev && workflowsConfig[workflowId].type === 'iso-ram'
            ? `http://${ipFileServer}:${Underpost.baremetal.bootstrapHttpServerPortFactory({ port: bootstrapHttpServerPort, workflowId, workflowsConfig })}/${workflowId}/${workflowsConfig[workflowId].isoUrl.split('/').pop()}`
            : workflowsConfig[workflowId].isoUrl,
        type: workflowsConfig[workflowId].type,
        macAddress,
        cloudInit,
        machine,
        osIdLike: workflowsConfig[workflowId].osIdLike,
        networkInterfaceName: workflowsConfig[workflowId].networkInterfaceName,
        authCredentials,
        bootstrapHttpServerPort: Underpost.baremetal.bootstrapHttpServerPortFactory({
          port: bootstrapHttpServerPort,
          workflowId,
          workflowsConfig,
        }),
        dev,
      });

      const ipxeSrcDir = '/home/dd/ipxe/src';
      const embedScriptName = `embed_${workflowId}.ipxe`;
      const embedScriptPath = path.join(ipxeSrcDir, embedScriptName);

      const embedScriptContent = `#!ipxe
dhcp
set server_ip ${ipFileServer}
set tftp_prefix ${tftpPrefix}
kernel tftp://\${server_ip}/\${tftp_prefix}/pxe/vmlinuz-efi ${cmd}
initrd tftp://\${server_ip}/\${tftp_prefix}/pxe/initrd.img
boot || shell
`;

      fs.writeFileSync(embedScriptPath, embedScriptContent);
      logger.info(`Created embedded script at ${embedScriptPath}`);

      // Determine target architecture
      let targetArch = 'x86_64'; // Default to x86_64
      if (
        workflowsConfig[workflowId].architecture === 'arm64' ||
        workflowsConfig[workflowId].architecture === 'aarch64'
      ) {
        targetArch = 'arm64';
      }

      // Determine host architecture
      const hostArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';

      let crossCompile = '';
      if (hostArch === 'x86_64' && targetArch === 'arm64') {
        crossCompile = 'CROSS_COMPILE=aarch64-linux-gnu-';
      } else if (hostArch === 'arm64' && targetArch === 'x86_64') {
        crossCompile = 'CROSS_COMPILE=x86_64-linux-gnu-';
      }

      const platformDir = targetArch === 'arm64' ? 'bin-arm64-efi' : 'bin-x86_64-efi';
      const makeTarget = `${platformDir}/ipxe.iso`;

      logger.info(
        `Building iPXE ISO for ${targetArch} on ${hostArch}: make ${makeTarget} ${crossCompile} EMBED=${embedScriptName}`,
      );

      const buildCmd = `cd ${ipxeSrcDir} && make ${makeTarget} ${crossCompile} EMBED=${embedScriptName}`;
      shellExec(buildCmd);

      const builtIsoPath = path.join(ipxeSrcDir, makeTarget);
      if (fs.existsSync(builtIsoPath)) {
        fs.copySync(builtIsoPath, outputPath);
        logger.info(`ISO successfully built and copied to ${outputPath}`);
      } else {
        logger.error(`Failed to build ISO at ${builtIsoPath}`);
      }
    },

    /**
     * @method fallbackArchitecture
     * @description Determines the architecture to use for boot resources, with a fallback mechanism.
     * @param {object} workflowsConfig - The configuration object for the current workflow.
     * @returns {string} The architecture string (e.g., 'arm64', 'amd64') to use for boot resources.
     * @memberof UnderpostBaremetal
     */
    fallbackArchitecture(workflowsConfig) {
      return (
        workflowsConfig.architecture ||
        workflowsConfig.maas?.commissioning?.architecture ||
        workflowsConfig.container?.architecture ||
        workflowsConfig.debootstrap?.image?.architecture
      );
    },

    /**
     * @method macAddressFactory
     * @description Generates or returns a MAC address based on options.
     * @param {object} options - Options for MAC address generation.
     * @param {string} options.mac - 'random' for random MAC, 'hardware' to use device's actual MAC, specific MAC string, or empty for default.
     * @returns {object} Object with mac property - null for 'hardware', generated/specified MAC otherwise.
     * @memberof UnderpostBaremetal
     */
    macAddressFactory(options = { mac: '' }) {
      const len = 6;
      const defaultMac = range(1, len)
        .map(() => '00')
        .join(':');
      if (options) {
        if (!options.mac) options.mac = defaultMac;
        if (options.mac === 'hardware') {
          // Return null to indicate hardware MAC should be used (no spoofing)
          options.mac = null;
        } else if (options.mac === 'random') {
          options.mac = range(1, len)
            .map(() => s4().toLowerCase().substring(0, 2))
            .join(':');
        }
      } else options = { mac: defaultMac };
      return options;
    },

    /**
     * @method downloadISO
     * @description Downloads a generic ISO and extracts kernel boot files.
     * @param {object} params - Parameters for the method.
     * @param {object} params.resource - The MAAS boot resource object.
     * @param {string} params.architecture - The architecture (arm64 or amd64).
     * @param {string} params.nfsHostPath - The NFS host path to store the ISO and extracted files.
     * @param {string} params.isoUrl - The full URL to the ISO file to download.
     * @param {string} params.osIdLike - OS family identifier (e.g., 'debian ubuntu' or 'rhel centos fedora').
     * @returns {object} An object containing paths to the extracted kernel, initrd, and optionally squashfs.
     * @memberof UnderpostBaremetal
     */
    downloadISO({ resource, architecture, nfsHostPath, isoUrl, osIdLike }) {
      const arch = architecture || resource.architecture.split('/')[0];

      // Validate that isoUrl is provided
      if (!isoUrl) {
        throw new Error('isoUrl parameter is required. Please specify the full ISO URL in the workflow configuration.');
      }

      // Extract ISO filename from URL
      const isoFilename = isoUrl.split('/').pop();

      // Determine OS family from osIdLike
      const isDebianBased = osIdLike && osIdLike.match(/debian|ubuntu/i);
      const isRhelBased = osIdLike && osIdLike.match(/rhel|centos|fedora|alma|rocky/i);

      // Set extraction directory based on OS family
      const extractDirName = isDebianBased ? 'casper' : 'iso-extract';
      shellExec(`mkdir -p ${nfsHostPath}/${extractDirName}`);

      const isoPath = `/var/tmp/live-iso/${isoFilename}`;
      const extractDir = `${nfsHostPath}/${extractDirName}`;

      if (!fs.existsSync(isoPath)) {
        logger.info(`Downloading ISO for ${arch}...`);
        logger.info(`URL: ${isoUrl}`);
        shellExec(`mkdir -p /var/tmp/live-iso`);
        shellExec(`wget --progress=bar:force -O ${isoPath} "${isoUrl}"`);
        // Verify download by checking file existence and size (not exit code, which can be unreliable)
        if (!fs.existsSync(isoPath)) {
          throw new Error(`Failed to download ISO from ${isoUrl} - file not created`);
        }
        const stats = fs.statSync(isoPath);
        if (stats.size < 100 * 1024 * 1024) {
          shellExec(`rm -f ${isoPath}`);
          throw new Error(`Downloaded ISO is too small (${stats.size} bytes), download may have failed`);
        }
        logger.info(`Downloaded ISO to ${isoPath} (${(stats.size / 1024 / 1024 / 1024).toFixed(2)} GB)`);
      }

      // Mount ISO and extract boot files
      const mountPoint = `${nfsHostPath}/mnt-iso-${arch}`;
      shellExec(`mkdir -p ${mountPoint}`);

      // Ensure mount point is not already mounted
      shellExec(`sudo umount ${mountPoint} 2>/dev/null`);

      try {
        // Mount the ISO
        shellExec(`sudo mount -o loop,ro ${isoPath} ${mountPoint}`, { silent: false });
        logger.info(`Mounted ISO at ${mountPoint}`);

        // Distribution-specific extraction logic
        if (isDebianBased) {
          // Ubuntu/Debian: Extract from casper directory
          if (!fs.existsSync(`${mountPoint}/casper`)) {
            throw new Error(`Failed to mount ISO or casper directory not found: ${isoPath}`);
          }
          logger.info(`Checking casper directory contents...`);
          shellExec(`ls -la ${mountPoint}/casper/ 2>/dev/null || echo "casper directory not found"`);
          shellExec(`sudo cp -a ${mountPoint}/casper/* ${extractDir}/`);
        }
      } finally {
        shellExec(`ls -la ${mountPoint}/`);

        shellExec(`sudo chown -R $(whoami):$(whoami) ${extractDir}`);
        // Unmount ISO
        shellExec(`sudo umount ${mountPoint}`);
        logger.info(`Unmounted ISO`);
        // Clean up temporary mount point
        shellExec(`rmdir ${mountPoint}`);
      }

      return {
        'vmlinuz-efi': `${extractDir}/vmlinuz`,
        'initrd.img': `${extractDir}/initrd`,
        isoUrl,
      };
    },

    /**
     * @method machineFactory
     * @description Creates a new machine in MAAS with specified options.
     * @param {object} options - Options for creating the machine.
     * @param {string} options.macAddress - The MAC address of the machine.
     * @param {string} options.hostname - The hostname for the machine.
     * @param {string} options.ipAddress - The IP address for the machine.
     * @param {string} options.architecture - The architecture for the machine (default is 'arm64').
     * @param {string} options.powerType - The power type for the machine (default is 'manual').
     * @returns {object} An object containing the created machine details.
     * @memberof UnderpostBaremetal
     */
    machineFactory(
      options = {
        macAddress: '',
        hostname: '',
        ipAddress: '',
        architecture: 'arm64',
        powerType: 'manual',
      },
    ) {
      if (!options.powerType) options.powerType = 'manual';
      const payload = {
        architecture: options.architecture.match('arm') ? 'arm64/generic' : 'amd64/generic',
        mac_address: options.macAddress,
        mac_addresses: options.macAddress,
        hostname: options.hostname,
        power_type: options.powerType,
        ip: options.ipAddress,
      };
      logger.info('Creating MAAS machine', payload);
      const machine = Underpost.baremetal.maasCliExec(
        `machines create ${Object.keys(payload)
          .map((k) => `${k}="${payload[k]}"`)
          .join(' ')}`,
      );
      try {
        return { machine };
      } catch (error) {
        console.log(error);
        logger.error(error);
        throw new Error(`Failed to create MAAS machine. Output:\n${machine}`);
      }
    },

    /**
     * @method kernelFactory
     * @description Retrieves kernel, initrd, and root filesystem paths from a MAAS boot resource.
     * @param {object} params - Parameters for the method.
     * @param {object} params.resource - The MAAS boot resource object.
     * @param {string} params.type - The type of boot (e.g., 'iso-ram', 'iso-nfs', etc.).
     * @param {string} params.nfsHostPath - The NFS host path (used for ISO types).
     * @param {string} params.isoUrl - The ISO URL (used for ISO types).
     * @param {string} params.workflowId - The workflow identifier.
     * @returns {object} An object containing paths to the kernel, initrd, and root filesystem.
     * @memberof UnderpostBaremetal
     */
    kernelFactory({ resource, type, nfsHostPath, isoUrl, workflowId }) {
      // For disk-based commissioning (casper/iso), use live ISO files
      if (type === 'iso-ram' || type === 'iso-nfs') {
        logger.info('Using live ISO for boot (disk-based commissioning)');
        const arch = resource.architecture.split('/')[0];
        const workflowsConfig = Underpost.baremetal.loadWorkflowsConfig();
        const kernelFilesPaths = Underpost.baremetal.downloadISO({
          resource,
          architecture: arch,
          nfsHostPath,
          isoUrl,
          osIdLike: workflowsConfig[workflowId].osIdLike || '',
        });
        const resourcesPath = `/var/snap/maas/common/maas/image-storage/bootloaders/uefi/${arch}`;
        return { kernelFilesPaths, resourcesPath };
      }

      const resourceData = Underpost.baremetal.maasCliExec(`boot-resource read ${resource.id}`);
      let kernelFilesPaths = {};
      const bootFiles = resourceData.sets[Object.keys(resourceData.sets)[0]].files;
      const arch = resource.architecture.split('/')[0];
      const resourcesPath = `/var/snap/maas/common/maas/image-storage/bootloaders/uefi/${arch}`;
      const kernelPath = `/var/snap/maas/common/maas/image-storage`;

      logger.info('Available boot files', Object.keys(bootFiles));
      logger.info('Boot files info', {
        id: resourceData.id,
        type: resourceData.type,
        name: resourceData.name,
        architecture: resourceData.architecture,
        bootFiles,
        arch,
        resourcesPath,
        kernelPath,
      });

      // Try standard synced image structure (Ubuntu, CentOS from MAAS repos)
      const _suffix = resource.architecture.match('xgene') ? '.xgene' : '';
      if (bootFiles['boot-kernel' + _suffix] && bootFiles['boot-initrd' + _suffix] && bootFiles['squashfs']) {
        kernelFilesPaths = {
          'vmlinuz-efi': `${kernelPath}/${bootFiles['boot-kernel' + _suffix].filename_on_disk}`,
          'initrd.img': `${kernelPath}/${bootFiles['boot-initrd' + _suffix].filename_on_disk}`,
          squashfs: `${kernelPath}/${bootFiles['squashfs'].filename_on_disk}`,
        };
      }
      // Try uploaded image structure (Packer-built images, custom uploads)
      else if (bootFiles['boot-kernel'] && bootFiles['boot-initrd'] && bootFiles['root-tgz']) {
        kernelFilesPaths = {
          'vmlinuz-efi': `${kernelPath}/${bootFiles['boot-kernel'].filename_on_disk}`,
          'initrd.img': `${kernelPath}/${bootFiles['boot-initrd'].filename_on_disk}`,
          squashfs: `${kernelPath}/${bootFiles['root-tgz'].filename_on_disk}`,
        };
      }
      // Try alternative uploaded structure with root-image-xz
      else if (bootFiles['boot-kernel'] && bootFiles['boot-initrd'] && bootFiles['root-image-xz']) {
        kernelFilesPaths = {
          'vmlinuz-efi': `${kernelPath}/${bootFiles['boot-kernel'].filename_on_disk}`,
          'initrd.img': `${kernelPath}/${bootFiles['boot-initrd'].filename_on_disk}`,
          squashfs: `${kernelPath}/${bootFiles['root-image-xz'].filename_on_disk}`,
        };
      }
      // Fallback: try to find any kernel, initrd, and root image
      else {
        logger.warn('Non-standard boot file structure detected. Available files', Object.keys(bootFiles));

        const rootArchiveKey = Object.keys(bootFiles).find(
          (k) => k.includes('root') && (k.includes('tgz') || k.includes('tar.gz')),
        );
        const explicitKernel = Object.keys(bootFiles).find((k) => k.includes('kernel'));
        const explicitInitrd = Object.keys(bootFiles).find((k) => k.includes('initrd'));

        if (rootArchiveKey && (!explicitKernel || !explicitInitrd)) {
          logger.info(`Root archive found (${rootArchiveKey}) and missing kernel/initrd. Attempting to extract.`);
          const rootArchivePath = `${kernelPath}/${bootFiles[rootArchiveKey].filename_on_disk}`;
          const tempExtractDir = `/tmp/maas-extract-${resource.id}`;
          shellExec(`mkdir -p ${tempExtractDir}`);

          // List files in archive to find kernel and initrd
          const tarList = shellExec(`tar -tf ${rootArchivePath}`).stdout.split('\n');

          // Look for boot/vmlinuz* and boot/initrd* (handling potential leading ./)
          // Skip rescue, kdump, and other special images
          const vmlinuzPaths = tarList.filter(
            (f) => f.match(/(\.\/)?boot\/vmlinuz-[0-9]/) && !f.includes('rescue') && !f.includes('kdump'),
          );
          const initrdPaths = tarList.filter(
            (f) =>
              f.match(/(\.\/)?boot\/(initrd|initramfs)-[0-9]/) &&
              !f.includes('rescue') &&
              !f.includes('kdump') &&
              f.includes('.img'),
          );

          logger.info(`Found kernel candidates:`, { vmlinuzPaths, initrdPaths });

          // Try to match kernel and initrd by version number
          let vmlinuzPath = null;
          let initrdPath = null;

          if (vmlinuzPaths.length > 0 && initrdPaths.length > 0) {
            // Extract version from kernel filename (e.g., "5.14.0-611.11.1.el9_7.aarch64")
            for (const kernelPath of vmlinuzPaths.sort().reverse()) {
              const kernelVersion = kernelPath.match(/vmlinuz-(.+)$/)?.[1];
              if (kernelVersion) {
                // Look for matching initrd
                const matchingInitrd = initrdPaths.find((p) => p.includes(kernelVersion));
                if (matchingInitrd) {
                  vmlinuzPath = kernelPath;
                  initrdPath = matchingInitrd;
                  logger.info(`Matched kernel and initrd by version: ${kernelVersion}`);
                  break;
                }
              }
            }
          }

          // Fallback: use newest versions if no match found
          if (!vmlinuzPath && vmlinuzPaths.length > 0) {
            vmlinuzPath = vmlinuzPaths.sort().pop();
          }
          if (!initrdPath && initrdPaths.length > 0) {
            initrdPath = initrdPaths.sort().pop();
          }

          logger.info(`Selected kernel: ${vmlinuzPath}, initrd: ${initrdPath}`);

          if (vmlinuzPath && initrdPath) {
            // Extract specific files
            // Extract all files in boot/ to ensure symlinks resolve
            shellExec(`tar -xf ${rootArchivePath} -C ${tempExtractDir} --wildcards '*boot/*'`);

            kernelFilesPaths = {
              'vmlinuz-efi': `${tempExtractDir}/${vmlinuzPath}`,
              'initrd.img': `${tempExtractDir}/${initrdPath}`,
              squashfs: rootArchivePath,
            };
            logger.info('Extracted kernel and initrd from root archive.');
          } else {
            logger.error(
              `Failed to find kernel/initrd in archive. Contents of boot/ directory:`,
              tarList.filter((f) => f.includes('boot/')),
            );
            throw new Error(`Could not find kernel or initrd in ${rootArchiveKey}`);
          }
        } else {
          const kernelFile = Object.keys(bootFiles).find((k) => k.includes('kernel')) || Object.keys(bootFiles)[0];
          const initrdFile = Object.keys(bootFiles).find((k) => k.includes('initrd')) || Object.keys(bootFiles)[1];
          const rootFile =
            Object.keys(bootFiles).find(
              (k) => k.includes('root') || k.includes('squashfs') || k.includes('tgz') || k.includes('xz'),
            ) || Object.keys(bootFiles)[2];

          if (kernelFile && initrdFile && rootFile) {
            kernelFilesPaths = {
              'vmlinuz-efi': `${kernelPath}/${bootFiles[kernelFile].filename_on_disk}`,
              'initrd.img': `${kernelPath}/${bootFiles[initrdFile].filename_on_disk}`,
              squashfs: `${kernelPath}/${bootFiles[rootFile].filename_on_disk}`,
            };
            logger.info('Using detected files', { kernel: kernelFile, initrd: initrdFile, root: rootFile });
          } else {
            throw new Error(`Cannot identify boot files. Available: ${Object.keys(bootFiles).join(', ')}`);
          }
        }
      }
      return {
        resource,
        bootFiles,
        arch,
        resourcesPath,
        kernelPath,
        resourceData,
        kernelFilesPaths,
      };
    },

    /**
     * @method writeGrubConfigToFile
     * @description Writes the GRUB configuration content to the grub.cfg file in the TFTP root.
     * @param {object} params - Parameters for the method.
     * @param {string} params.grubCfgSrc - The GRUB configuration content to write.
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    writeGrubConfigToFile({ grubCfgSrc = '' }) {
      shellExec(`mkdir -p ${process.env.TFTP_ROOT}/grub`, {
        disableLog: true,
      });
      return fs.writeFileSync(`${process.env.TFTP_ROOT}/grub/grub.cfg`, grubCfgSrc, 'utf8');
    },

    /**
     * @method getGrubConfigFromFile
     * @description Reads the GRUB configuration content from the grub.cfg file in the TFTP root.
     * @memberof UnderpostBaremetal
     * @returns {string} The GRUB configuration content.
     */
    getGrubConfigFromFile() {
      const grubCfgPath = `${process.env.TFTP_ROOT}/grub/grub.cfg`;
      const grubCfgSrc = fs.readFileSync(grubCfgPath, 'utf8');
      return { grubCfgPath, grubCfgSrc };
    },

    /**
     * @method removeDiscoveredMachines
     * @description Removes all machines in the 'discovered' status from MAAS.
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    removeDiscoveredMachines() {
      logger.info('Removing all discovered machines from MAAS...');
      Underpost.baremetal.maasCliExec(`discoveries clear all=true`);
    },

    /**
     * @method efiGrubModulesFactory
     * @description Copies the appropriate EFI GRUB modules to the TFTP root based on the image architecture.
     * @param {object} options - Options for determining which GRUB modules to copy.
     * @param {object} options.image - Image configuration object.
     * @param {string} options.image.architecture - The architecture of the image ('amd64' or 'arm64').
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    efiGrubModulesFactory(options = { image: { architecture: 'amd64' } }) {
      if (options.image.architecture.match('arm64')) {
        // Copy ARM64 EFI GRUB modules.
        const arm64EfiPath = `${process.env.TFTP_ROOT}/grub/arm64-efi`;
        if (fs.existsSync(arm64EfiPath)) shellExec(`sudo rm -rf ${arm64EfiPath}`);
        shellExec(`sudo cp -a /usr/lib/grub/arm64-efi ${arm64EfiPath}`);
      } else {
        // Copy AMD64 EFI GRUB modules.
        const amd64EfiPath = `${process.env.TFTP_ROOT}/grub/x86_64-efi`;
        if (fs.existsSync(amd64EfiPath)) shellExec(`sudo rm -rf ${amd64EfiPath}`);
        shellExec(`sudo cp -a /usr/lib/grub/x86_64-efi ${amd64EfiPath}`);
      }
    },

    /**
     * @method ipxeEmbeddedScriptFactory
     * @description Generates the embedded iPXE boot script that performs DHCP and chains to the main script.
     * This script is embedded into the iPXE binary or loaded first by GRUB.
     * Supports MAC address spoofing for baremetal commissioning workflows.
     * @param {object} params - The parameters for generating the script.
     * @param {string} params.tftpServer - The IP address of the TFTP server.
     * @param {string} params.scriptPath - The path to the main iPXE script on TFTP server.
     * @param {string} [params.macAddress] - Optional MAC address to spoof for MAAS registration.
     * @returns {string} The embedded iPXE script content.
     * @memberof UnderpostBaremetal
     */
    ipxeEmbeddedScriptFactory({ tftpServer, scriptPath, macAddress = null }) {
      const macSpoofingBlock =
        macAddress && macAddress !== '00:00:00:00:00:00'
          ? `
# MAC Address Information
echo ========================================
echo Target MAC for MAAS: ${macAddress}
echo Hardware MAC: \${net0/mac}
echo ========================================
echo NOTE: iPXE MAC spoofing does NOT persist to kernel
echo The kernel will receive MAC via ifname= parameter
echo ========================================
`
          : `
# Using hardware MAC address
echo ========================================
echo Using device hardware MAC address
echo Hardware MAC: \${net0/mac}
echo MAC spoofing disabled - device uses actual MAC
echo ========================================
`;

      return `#!ipxe
# Embedded iPXE Boot Script
# This script performs DHCP configuration and chains to the main boot script

echo ========================================
echo iPXE Embedded Boot Loader
echo ========================================
echo TFTP Server: ${tftpServer}
echo Script Path: ${scriptPath}
echo ========================================

${macSpoofingBlock}

# Show network interface info before DHCP
echo Network Interface Info (before DHCP):
echo Interface: net0
echo MAC: \${net0/mac}
ifstat

# Perform DHCP to get network configuration
echo ========================================
echo Performing DHCP configuration...
echo ========================================
dhcp net0 || goto dhcp_retry

echo DHCP configuration successful
echo IP Address: \${net0/ip}
echo Netmask: \${net0/netmask}
echo Gateway: \${net0/gateway}
echo DNS: \${net0/dns}
echo TFTP Server: \${next-server}
echo MAC used by DHCP: \${net0/mac}

# Chain to the main iPXE script
echo ========================================
echo Chainloading main boot script...
echo Script: tftp://${tftpServer}${scriptPath}
echo ========================================
chain tftp://${tftpServer}${scriptPath} || goto chain_failed

:dhcp_retry
echo DHCP failed, retrying in 5 seconds...
sleep 5
dhcp net0 || goto dhcp_retry
goto dhcp_success

:dhcp_success
echo DHCP retry successful
echo IP Address: \${net0/ip}
echo MAC: \${net0/mac}
chain tftp://${tftpServer}${scriptPath} || goto chain_failed

:chain_failed
echo ========================================
echo ERROR: Failed to chain to main script
echo TFTP Server: ${tftpServer}
echo Script Path: ${scriptPath}
echo ========================================
echo Retrying in 10 seconds...
sleep 10
chain tftp://${tftpServer}${scriptPath} || goto shell_debug

:shell_debug
echo Dropping to iPXE shell for manual debugging
echo Try: chain tftp://${tftpServer}${scriptPath}
shell
`;
    },

    /**
     * @method ipxeScriptFactory
     * @description Generates the iPXE script content for stable identity.
     * This iPXE script uses directly boots kernel/initrd via TFTP.
     * @param {object} params - The parameters for generating the script.
     * @param {string} params.maasIp - The IP address of the MAAS server.
     * @param {string} [params.macAddress] - The MAC address registered in MAAS (for display only).
     * @param {string} params.architecture - The architecture (arm64/amd64).
     * @param {string} params.tftpPrefix - The TFTP prefix path (e.g., 'rpi4mb').
     * @param {string} params.kernelCmd - The kernel command line parameters.
     * @returns {string} The iPXE script content.
     * @memberof UnderpostBaremetal
     */
    ipxeScriptFactory({ maasIp, macAddress, architecture, tftpPrefix, kernelCmd }) {
      const macInfo =
        macAddress && macAddress !== '00:00:00:00:00:00'
          ? `echo Registered MAC: ${macAddress}`
          : `echo Using hardware MAC address`;

      // Construct the full TFTP paths for kernel and initrd
      const kernelPath = `${tftpPrefix}/pxe/vmlinuz-efi`;
      const initrdPath = `${tftpPrefix}/pxe/initrd.img`;
      const grubBootloader = architecture === 'arm64' ? 'grubaa64.efi' : 'grubx64.efi';
      const grubPath = `${tftpPrefix}/pxe/${grubBootloader}`;

      return `#!ipxe
echo ========================================
echo iPXE Network Boot
echo ========================================
echo MAAS Server: ${maasIp}
echo Architecture: ${architecture}
${macInfo}
echo ========================================

# Show current network configuration
echo Current Network Configuration:
ifstat

# Display MAC address information
echo MAC Address: \${net0/mac}
echo IP Address: \${net0/ip}
echo Gateway: \${net0/gateway}
echo DNS: \${net0/dns}
${macAddress && macAddress !== '00:00:00:00:00:00' ? `echo Target MAC for kernel: ${macAddress}` : ''}

# Direct kernel/initrd boot via TFTP
# Modern simplified approach: Direct kernel/initrd boot via TFTP
echo ========================================
echo Loading kernel and initrd via TFTP...
echo Kernel: tftp://${maasIp}/${kernelPath}
echo Initrd: tftp://${maasIp}/${initrdPath}
${macAddress && macAddress !== '00:00:00:00:00:00' ? `echo Kernel will use MAC: ${macAddress} (via ifname parameter)` : 'echo Kernel will use hardware MAC'}
echo ========================================

# Load kernel via TFTP
kernel tftp://${maasIp}/${kernelPath} ${kernelCmd || 'console=ttyS0,115200'} || goto grub_fallback
echo Kernel loaded successfully

# Load initrd via TFTP
initrd tftp://${maasIp}/${initrdPath} || goto grub_fallback
echo Initrd loaded successfully

# Boot the kernel
echo Booting kernel...
boot

:grub_fallback
echo ========================================
echo Direct kernel boot failed, falling back to GRUB chainload...
echo TFTP Path: tftp://${maasIp}/${grubPath}
echo ========================================

# Fallback: Chain to GRUB via TFTP (avoids malformed HTTP bootloader issues)
chain tftp://${maasIp}/${grubPath} || goto http_fallback

:http_fallback
echo TFTP GRUB chainload failed, trying HTTP fallback...
echo ========================================

# Fallback: Try MAAS HTTP bootloader (may have certificate issues)
set boot-url http://${maasIp}:5248/images/bootloader
echo Boot URL: \${boot-url}
chain \${boot-url}/uefi/${architecture}/${grubBootloader === 'grubaa64.efi' ? 'bootaa64.efi' : 'bootx64.efi'} || goto error

:error
echo ========================================
echo ERROR: All boot methods failed
echo ========================================
echo MAAS IP: ${maasIp}
echo Architecture: ${architecture}
echo MAC: \${net0/mac}
echo IP: \${net0/ip}
echo ========================================
echo Retrying GRUB TFTP in 10 seconds...
sleep 10
chain tftp://${maasIp}/${grubPath} || goto shell_debug

:shell_debug
echo Dropping to iPXE shell for manual intervention
shell
`;
    },

    /**
     * @method ipxeEfiFactory
     * @description Manages iPXE EFI binary build with cache support.
     * Checks cache, builds only if needed, saves to cache after build.
     * @param {object} params - The parameters for iPXE build.
     * @param {string} params.tftpRootPath - TFTP root directory path.
     * @param {string} params.ipxeCacheDir - iPXE cache directory path.
     * @param {string} params.arch - Target architecture (arm64/amd64).
     * @param {string} params.underpostRoot - Underpost root directory.
     * @param {string} [params.embeddedScriptPath] - Path to embedded boot script.
     * @param {boolean} [params.forceRebuild=false] - Force rebuild regardless of cache.
     * @returns {void}
     * @memberof UnderpostBaremetal
     */
    ipxeEfiFactory({ tftpRootPath, ipxeCacheDir, arch, underpostRoot, embeddedScriptPath, forceRebuild = false }) {
      const shouldRebuild =
        forceRebuild || (!fs.existsSync(`${tftpRootPath}/ipxe.efi`) && !fs.existsSync(`${ipxeCacheDir}/ipxe.efi`));

      if (!shouldRebuild) return;

      if (embeddedScriptPath && fs.existsSync(embeddedScriptPath)) {
        logger.info('Rebuilding iPXE with embedded boot script...', {
          embeddedScriptPath,
          forced: forceRebuild,
        });
        shellExec(
          `${underpostRoot}/scripts/ipxe-setup.sh ${tftpRootPath} --target-arch ${arch} --embed-script ${embeddedScriptPath} --rebuild`,
        );
      } else if (shouldRebuild) {
        shellExec(`${underpostRoot}/scripts/ipxe-setup.sh ${tftpRootPath} --target-arch ${arch}`);
      }

      shellExec(`mkdir -p ${ipxeCacheDir}`);
      shellExec(`cp ${tftpRootPath}/ipxe.efi ${ipxeCacheDir}/ipxe.efi`);
    },

    /**
     * @method grubFactory
     * @description Generates the GRUB configuration file content.
     * @param {object} params - The parameters for generating the configuration.
     * @param {string} params.menuentryStr - The title of the menu entry.
     * @param {string} params.kernelPath - The path to the kernel file (relative to TFTP root).
     * @param {string} params.initrdPath - The path to the initrd file (relative to TFTP root).
     * @param {string} params.cmd - The kernel command line parameters.
     * @param {string} params.tftpIp - The IP address of the TFTP server.
     * @param {boolean} [params.ipxe] - Flag to enable iPXE chainloading.
     * @param {string} [params.ipxePath] - The path to the iPXE binary.
     * @returns {object} An object containing 'grubCfgSrc' the GRUB configuration source string.
     * @memberof UnderpostBaremetal
     */
    grubFactory({ menuentryStr, kernelPath, initrdPath, cmd, tftpIp, ipxe, ipxePath }) {
      if (ipxe) {
        return {
          grubCfgSrc: `
  set default="0"
  set timeout=10
  insmod tftp
  set root=(tftp,${tftpIp})

  menuentry 'iPXE ${menuentryStr}' {
      echo "Loading iPXE with embedded script..."
      echo "[INFO] TFTP Server: ${tftpIp}"
      echo "[INFO] iPXE Binary: ${ipxePath}"
      echo "[INFO] iPXE will execute embedded script (dhcp + chain)"
      chainloader ${ipxePath}
      boot
  }
  `,
        };
      }
      return {
        grubCfgSrc: `
  set default="0"
  set timeout=10
  insmod nfs
  insmod gzio
  insmod http
  insmod tftp
  set root=(tftp,${tftpIp})

  menuentry '${menuentryStr}' {
      echo "${menuentryStr}"
      echo " ${Underpost.version}"
      echo "Date: ${new Date().toISOString()}"
      ${cmd.match('/MAAS/metadata/by-id/') ? `echo "System ID: ${cmd.split('/MAAS/metadata/by-id/')[1].split('/')[0]}"` : ''}
      echo "TFTP server: ${tftpIp}"
      echo "Kernel path: ${kernelPath}"
      echo "Initrd path: ${initrdPath}"
      echo "Starting boot process..."
      echo "Loading kernel..."
      linux /${kernelPath} ${cmd}
      echo "Loading initrd..."
      initrd /${initrdPath}
      echo "Booting..."
      boot
  }
  `,
      };
    },

    /**
     * @method bootstrapHttpServerPortFactory
     * @description Determines the bootstrap HTTP server port.
     * @param {object} params - Parameters for determining the port.
     * @param {number} [params.port] - The port passed via options.
     * @param {string} params.workflowId - The workflow identifier.
     * @param {object} params.workflowsConfig - The loaded workflows configuration.
     * @returns {number} The determined port number.
     * @memberof UnderpostBaremetal
     */
    bootstrapHttpServerPortFactory({ port, workflowId, workflowsConfig }) {
      return port || workflowsConfig[workflowId]?.bootstrapHttpServerPort || 8888;
    },

    /**
     * @method commissioningWriteFilesFactory
     * @description Generates the write_files configuration for the commissioning script.
     * @param {object} params
     * @param {object} params.machine - The machine object.
     * @param {object} params.authCredentials - MAAS authentication credentials.
     * @param {string} params.runnerHostIp - The IP address of the runner host.
     * @memberof UnderpostBaremetal
     * @returns {Array} The write_files array.
     */
    commissioningWriteFilesFactory({ machine, authCredentials, runnerHostIp }) {
      const { consumer_key, token_key, token_secret } = authCredentials;
      return [
        {
          path: '/usr/local/bin/underpost-enlist.sh',
          permissions: '0755',
          owner: 'root:root',
          content: `#!/bin/bash
# set -euo pipefail
CONSUMER_KEY="${consumer_key}"
TOKEN_KEY="${token_key}"
TOKEN_SECRET="${token_secret}"
LOG_FILE="/var/log/underpost-enlistment.log"
RESPONSE_FILE="/tmp/maas_response.txt"
STATUS_FILE="/tmp/maas_status.txt"

echo "Starting MAAS Commissioning Request..." | tee -a "$LOG_FILE"

curl -X POST \\
  --location --verbose \\
  --header "Authorization: OAuth oauth_version=\\"1.0\\", oauth_signature_method=\\"PLAINTEXT\\", oauth_consumer_key=\\"$CONSUMER_KEY\\", oauth_token=\\"$TOKEN_KEY\\", oauth_signature=\\"&$TOKEN_SECRET\\", oauth_nonce=\\"$(uuidgen)\\", oauth_timestamp=\\"$(date +%s)\\"" \\
  -F "enable_ssh=1" \\
  http://${runnerHostIp}:5240/MAAS/api/2.0/machines/${machine.system_id}/op-commission \\
  --output "$RESPONSE_FILE" --write-out "%{http_code}" > "$STATUS_FILE" 2>> "$LOG_FILE"

HTTP_STATUS=$(cat "$STATUS_FILE")

echo "HTTP Status: $HTTP_STATUS" | tee -a "$LOG_FILE"
echo "Response Body:" | tee -a "$LOG_FILE"
cat "$RESPONSE_FILE" | tee -a "$LOG_FILE"

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "Commissioning requested successfully. Rebooting to start commissioning..." | tee -a "$LOG_FILE"
  reboot
else
  echo "ERROR: MAAS commissioning failed with status $HTTP_STATUS" | tee -a "$LOG_FILE"
  exit 0
fi
`,
        },
      ];
    },

    /**
     * @method httpBootstrapServerStaticFactory
     * @description Creates static files for the bootstrap HTTP server including cloud-init configuration.
     * @param {object} params - Parameters for creating static files.
     * @param {string} params.bootstrapHttpServerPath - The path where static files will be created.
     * @param {string} params.hostname - The hostname of the client machine.
     * @param {string} params.cloudConfigSrc - The cloud-init configuration YAML source.
     * @param {object} [params.metadata] - Optional metadata to include in meta-data file.
     * @param {string} [params.vendorData] - Optional vendor-data content (default: empty string).
     * @param {string} [params.isoUrl] - Optional ISO URL to cache and serve.
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    httpBootstrapServerStaticFactory({
      bootstrapHttpServerPath,
      hostname,
      cloudConfigSrc,
      metadata = {},
      vendorData = '',
      isoUrl = '',
    }) {
      // Create directory structure
      shellExec(`mkdir -p ${bootstrapHttpServerPath}/${hostname}/cloud-init`);

      // Write user-data file
      fs.writeFileSync(`${bootstrapHttpServerPath}/${hostname}/cloud-init/user-data`, cloudConfigSrc, 'utf8');

      // Write meta-data file
      const metaDataContent = `instance-id: ${metadata.instanceId || hostname}\nlocal-hostname: ${metadata.localHostname || hostname}`;
      fs.writeFileSync(`${bootstrapHttpServerPath}/${hostname}/cloud-init/meta-data`, metaDataContent, 'utf8');

      // Write vendor-data file
      fs.writeFileSync(`${bootstrapHttpServerPath}/${hostname}/cloud-init/vendor-data`, vendorData, 'utf8');

      logger.info(`Cloud-init files written to ${bootstrapHttpServerPath}/${hostname}/cloud-init`);

      if (isoUrl) {
        const isoFilename = isoUrl.split('/').pop();
        const isoCacheDir = `/var/tmp/live-iso`;
        const isoCachePath = `${isoCacheDir}/${isoFilename}`;
        const isoDestPath = `${bootstrapHttpServerPath}/${hostname}/${isoFilename}`;

        if (!fs.existsSync(isoCachePath)) {
          logger.info(`Downloading ISO to cache: ${isoUrl}`);
          shellExec(`mkdir -p ${isoCacheDir}`);
          shellExec(`wget --progress=bar:force -O ${isoCachePath} "${isoUrl}"`);
        }

        logger.info(`Copying ISO to bootstrap server: ${isoDestPath}`);
        shellExec(`cp ${isoCachePath} ${isoDestPath}`);
      }
    },

    /**
     * @method httpBootstrapServerRunnerFactory
     * @description Starts a simple HTTP server to serve boot files for network booting.
     * @param {object} options - Options for the HTTP server.
     * @param {string} hostname - The hostname of the client machine.
     * @param {string} options.bootstrapHttpServerPath - The path to serve files from (default: './public/localhost').
     * @param {number} options.bootstrapHttpServerPort - The port on which to start the HTTP server (default: 8888).
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    httpBootstrapServerRunnerFactory(
      options = { hostname: 'localhost', bootstrapHttpServerPath: './public/localhost', bootstrapHttpServerPort: 8888 },
    ) {
      const port = options.bootstrapHttpServerPort || 8888;
      const bootstrapHttpServerPath = options.bootstrapHttpServerPath || './public/localhost';
      const hostname = options.hostname || 'localhost';

      shellExec(`mkdir -p ${bootstrapHttpServerPath}/${hostname}/cloud-init`);
      shellExec(`node bin run kill ${port}`);

      const app = express();

      app.use(loggerMiddleware(import.meta, 'debug', () => false));

      app.use('/', express.static(bootstrapHttpServerPath));

      app.listen(port, () => {
        logger.info(`Static file server running on port ${port}`);
      });

      // Configure iptables to allow incoming LAN connections
      shellExec(
        `sudo iptables -I INPUT 1 -p tcp -s 192.168.1.0/24 --dport ${port} -m conntrack --ctstate NEW -j ACCEPT`,
      );
      // Option for any host:
      // sudo iptables -I INPUT 1 -p tcp --dport ${port} -m conntrack --ctstate NEW -j ACCEPT
      shellExec(`sudo chown -R $(whoami):$(whoami) ${bootstrapHttpServerPath}`);
      shellExec(`sudo sudo chmod 755 ${bootstrapHttpServerPath}`);

      logger.info(`Started Bootstrap Http Server on port ${port}`);
    },

    /**
     * @method updateKernelFiles
     * @description Copies EFI bootloaders, kernel, and initrd images to the TFTP root path.
     * It also handles decompression of the kernel if necessary for ARM64 compatibility,
     * and extracts raw kernel images from PE32+ EFI wrappers (common in Rocky Linux ARM64).
     * @param {object} params - The parameters for the function.
     * @param {object} params.commissioningImage - The commissioning image configuration.
     * @param {string} params.resourcesPath - The path where resources are located.
     * @param {string} params.tftpRootPath - The TFTP root path.
     * @param {object} params.kernelFilesPaths - Paths to kernel files.
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    updateKernelFiles({ commissioningImage, resourcesPath, tftpRootPath, kernelFilesPaths }) {
      // Copy EFI bootloaders to TFTP path.
      const efiFiles = commissioningImage.architecture.match('arm64')
        ? ['bootaa64.efi', 'grubaa64.efi']
        : ['bootx64.efi', 'grubx64.efi'];
      for (const file of efiFiles) {
        shellExec(`sudo cp -a ${resourcesPath}/${file} ${tftpRootPath}/pxe/${file}`);
      }
      // Copy kernel and initrd images to TFTP path.
      for (const file of Object.keys(kernelFilesPaths)) {
        if (file == 'isoUrl') continue; // Skip URL entries
        shellExec(`sudo cp -a ${kernelFilesPaths[file]} ${tftpRootPath}/pxe/${file}`);
        // If the file is a kernel (vmlinuz-efi) and is gzipped, unzip it for GRUB compatibility on ARM64.
        // GRUB on ARM64 often crashes with synchronous exception (0x200) if handling large compressed kernels directly.
        if (file === 'vmlinuz-efi') {
          const kernelDest = `${tftpRootPath}/pxe/${file}`;
          const fileType = shellExec(`file ${kernelDest}`).stdout;

          // Handle gzip compressed kernels
          if (fileType.includes('gzip compressed data')) {
            logger.info(`Decompressing kernel ${file} for ARM64 UEFI compatibility...`);
            shellExec(`sudo mv ${kernelDest} ${kernelDest}.gz`);
            shellExec(`sudo gunzip ${kernelDest}.gz`);
          }

          // Handle PE32+ EFI wrapped kernels (common in Rocky Linux ARM64)
          // Rocky Linux ARM64 kernels are distributed as PE32+ EFI executables, which
          // are bootable directly via UEFI firmware. However, GRUB's 'linux' command
          // expects a raw ARM64 Linux kernel Image format, not a PE32+ wrapper.
          if (fileType.includes('PE32+') || fileType.includes('EFI application')) {
            logger.warn('Detected PE32+ EFI wrapped kernel. Need to extract raw kernel image for GRUB.');
          }
        }
      }
    },

    /**
     * @method kernelCmdBootParamsFactory
     * @description Constructs kernel command line parameters for NFS booting.
     * @param {object} options - Options for constructing the command line.
     * @param {string} options.ipClient - The IP address of the client.
     * @param {string} options.ipDhcpServer - The IP address of the DHCP server.
     * @param {string} options.ipFileServer - The IP address of the file server.
     * @param {string} options.ipConfig - The IP configuration method (e.g., 'dhcp').
     * @param {string} options.netmask - The network mask.
     * @param {string} options.hostname - The hostname of the client.
     * @param {string} options.dnsServer - The DNS server address.
     * @param {string} options.networkInterfaceName - The name of the network interface.
     * @param {string} options.fileSystemUrl - The URL of the root filesystem.
     * @param {number} options.bootstrapHttpServerPort - The port of the bootstrap HTTP server.
     * @param {string} options.type - The type of boot ('iso-ram', 'chroot-debootstrap', 'chroot-container', 'iso-nfs', etc.).
     * @param {string} options.macAddress - The MAC address of the client.
     * @param {boolean} options.cloudInit - Whether to include cloud-init parameters.
     * @param {object} options.machine - The machine object containing system_id.
     * @param {string} options.machine.system_id - The system ID of the machine (for MAAS metadata).
     * @param {boolean} [options.dev=false] - Whether to enable dev mode with dracut debugging parameters.
     * @param {string} [options.osIdLike=''] - OS family identifier (e.g., 'rhel centos fedora' or 'debian ubuntu').
     * @param {object} options.authCredentials - Authentication credentials for fetching files (if needed).
     * @param {string} options.authCredentials.consumer_key - Consumer key for authentication.
     * @param {string} options.authCredentials.consumer_secret - Consumer secret for authentication.
     * @param {string} options.authCredentials.token_key - Token key for authentication.
     * @param {string} options.authCredentials.token_secret - Token secret for authentication.
     * @returns {object} An object containing the constructed command line string.
     * @memberof UnderpostBaremetal
     */
    kernelCmdBootParamsFactory(
      options = {
        ipClient: '',
        ipDhcpServer: '',
        ipFileServer: '',
        ipConfig: '',
        netmask: '',
        hostname: '',
        dnsServer: '',
        networkInterfaceName: '',
        fileSystemUrl: '',
        bootstrapHttpServerPort: 8888,
        type: '',
        macAddress: '',
        cloudInit: false,
        machine: { system_id: '' },
        dev: false,
        osIdLike: '',
        authCredentials: { consumer_key: '', consumer_secret: '', token_key: '', token_secret: '' },
      },
    ) {
      // Construct kernel command line arguments for NFS boot.
      const {
        ipClient,
        ipDhcpServer,
        ipFileServer,
        ipConfig,
        netmask,
        hostname,
        dnsServer,
        networkInterfaceName,
        fileSystemUrl,
        bootstrapHttpServerPort,
        type,
        macAddress,
        cloudInit,
        osIdLike,
      } = options;

      const ipParam =
        `ip=${ipClient}:${ipFileServer}:${ipDhcpServer}:${netmask}:${hostname}` +
        `:${networkInterfaceName ? networkInterfaceName : 'eth0'}:${ipConfig}:${dnsServer}`;

      const nfsOptions = `${
        type === 'chroot-debootstrap' || type === 'chroot-container'
          ? [
              'tcp',
              'nfsvers=3',
              'nolock',
              // 'protocol=tcp',
              // 'hard=true',
              'port=2049',
              // 'sec=none',
              'hard',
              'intr',
              'rsize=32768',
              'wsize=32768',
              'acregmin=0',
              'acregmax=0',
              'acdirmin=0',
              'acdirmax=0',
              'noac',
              // 'nodev',
              // 'nosuid',
            ]
          : []
      }`;

      const nfsRootParam = `nfsroot=${ipFileServer}:${process.env.NFS_EXPORT_PATH}/${hostname}${nfsOptions ? `,${nfsOptions}` : ''}`;

      const permissionsParams = [
        `rw`,
        // `ro`
      ];

      const kernelParams = [
        ...permissionsParams,
        `ignore_uuid`,
        `rootwait`,
        `ipv6.disable=1`,
        `fixrtc`,
        // `console=serial0,115200`,
        // `console=tty1`,
        // `layerfs-path=filesystem.squashfs`,
        // `root=/dev/ram0`,
        // `toram`,
        'nomodeset',
        `editable_rootfs=tmpfs`,
        // `ramdisk_size=3550000`,
        // `root=/dev/sda1`, // rpi4 usb port unit
        'apparmor=0', // Disable AppArmor security
        ...(networkInterfaceName === 'eth0'
          ? [
              'net.ifnames=0', // Disable predictable network interface names
              'biosdevname=0', // Disable BIOS device naming
            ]
          : []),
      ];

      const performanceParams = [
        // --- Boot Automation & Stability ---
        'auto=true', // Enable automated installation/configuration
        'noeject', // Do not attempt to eject boot media on reboot
        `casper-getty`, // Enable console login for live sessions
        'nowatchdog', // Disable watchdog timers to prevent unexpected reboots
        'noprompt', // Don't wait for "Press Enter" during boot/reboot

        // --- CPU & System Performance ---
        'mitigations=off', // Disable CPU security mitigations for maximum speed
        'clocksource=tsc', // Use fastest available hardware clock
        'tsc=reliable', // Trust CPU clock without extra verification
        'hpet=disable', // Disable legacy slow timer
        'nohz=on', // Reduce overhead by disabling timer ticks on idle CPUs

        // --- Memory & Hardware Optimization ---
        'cma=40M', // Reserve contiguous RAM for RPi hardware/video
        'zswap.enabled=1', // Use compressed RAM cache (vital for NFS/SD)
        'zswap.compressor=zstd', // Best balance of speed and compression
        'zswap.max_pool_percent=30', // Use max 30% of RAM as compressed storage
        'zswap.zpool=zsmalloc', // Efficient memory management for zswap
        'fsck.mode=skip', // Skip disk checks to accelerate boot
        'max_loop=255', // Ensure enough loop devices for squashfs/snaps

        // --- Immutable Filesystem ---
        'overlayroot=tmpfs', // Run entire OS in RAM to protect storage
        'overlayroot_cfgdisk=disabled', // Ignore external overlay configurations
      ];

      let cmd = [];
      if (type === 'iso-ram') {
        const netBootParams = [`netboot=url`];
        if (fileSystemUrl) netBootParams.push(`url=${fileSystemUrl.replace('https', 'http')}`);
        cmd = [ipParam, `boot=casper`, 'toram', ...netBootParams, ...kernelParams, ...performanceParams];
      } else if (type === 'chroot-debootstrap' || type === 'chroot-container') {
        let qemuNfsRootParams = [`root=/dev/nfs`, `rootfstype=nfs`];
        cmd = [ipParam, ...qemuNfsRootParams, nfsRootParam, ...kernelParams];
      } else {
        // 'iso-nfs'
        cmd = [ipParam, `netboot=nfs`, nfsRootParam, ...kernelParams, ...performanceParams];
        // cmd.push(`ifname=${networkInterfaceName}:${macAddress}`);
      }

      // Determine OS family from osIdLike configuration
      const isRhelBased = osIdLike && osIdLike.match(/rhel|centos|fedora|alma|rocky/i);
      const isDebianBased = osIdLike && osIdLike.match(/debian|ubuntu/i);

      // Add RHEL/Rocky/Fedora based images specific parameters
      if (isRhelBased) {
        cmd = cmd.concat([`rd.neednet=1`, `rd.timeout=180`, `selinux=0`, `enforcing=0`]);
        if (options.dev) cmd = cmd.concat([`rd.shell`, `rd.debug`]);
      }
      // Add Debian/Ubuntu based images specific parameters
      else if (isDebianBased) {
        cmd = cmd.concat([`initrd=initrd.img`, `init=/sbin/init`]);
        if (options.dev) cmd = cmd.concat([`debug`, `ignore_loglevel`]);
      }

      if (cloudInit) cmd = Underpost.cloudInit.kernelParamsFactory(macAddress, cmd, options);
      // cmd.push('---');
      const cmdStr = cmd.join(' ');
      logger.info('Constructed kernel command line');
      console.log(newInstance(cmdStr).bgRed.bold.black);
      return { cmd: cmdStr };
    },

    /**
     * @method commissionMonitor
     * @description Monitors the MAAS discoveries and initiates machine creation and commissioning
     * once a matching MAC address is found. It also opens terminal windows for live logs.
     * @param {object} params - The parameters for the function.
     * @param {string} params.macAddress - The MAC address to monitor for.
     * @param {string} params.ipAddress - The IP address of the machine (used if MAC is all zeros).
     * @param {string} [params.hostname] - The hostname for the machine (optional).
     * @param {string} [params.architecture] - The architecture of the machine (optional).
     * @param {object} [params.machine] - Existing machine payload to use (optional).
     * @returns {Promise<void>} A promise object with machine and discovery details.
     * @memberof UnderpostBaremetal
     */
    async commissionMonitor({ macAddress, ipAddress, hostname, architecture, machine }) {
      {
        // Query observed discoveries from MAAS.
        const discoveries = Underpost.baremetal.maasCliExec(`discoveries read`);

        for (const discovery of discoveries) {
          const discoverHostname = discovery.hostname
            ? discovery.hostname
            : discovery.mac_organization
              ? discovery.mac_organization
              : discovery.domain
                ? discovery.domain
                : `generic-host-${s4()}${s4()}`;

          console.log(discoverHostname.bgBlue.bold.white);
          console.log('ip target:'.green + ipAddress, 'ip discovered:'.green + discovery.ip);
          console.log('mac target:'.green + macAddress, 'mac discovered:'.green + discovery.mac_address);

          if (discovery.ip === ipAddress) {
            logger.info('Machine discovered!', discovery);
            if (!machine) {
              // Check if a machine with the discovered MAC already exists to avoid conflicts
              const [existingMachine] =
                Underpost.baremetal.maasCliExec(`machines read mac_address=${discovery.mac_address}`) || [];

              if (existingMachine) {
                logger.warn(
                  `Machine ${existingMachine.hostname} (${existingMachine.system_id}) already exists with MAC ${discovery.mac_address}`,
                );
                logger.info(
                  `Deleting existing machine ${existingMachine.system_id} to create new machine ${hostname}...`,
                );
                Underpost.baremetal.maasCliExec(`machine delete ${existingMachine.system_id}`);
              }

              logger.info('Creating new machine with discovered hardware MAC...', {
                discoveredMAC: discovery.mac_address,
                ipAddress,
                hostname,
              });
              machine = Underpost.baremetal.machineFactory({
                ipAddress,
                macAddress: discovery.mac_address,
                hostname,
                architecture,
              }).machine;

              if (machine && machine.system_id) {
                console.log('New machine system id:', machine.system_id.bgYellow.bold.black);
                Underpost.baremetal.writeGrubConfigToFile({
                  grubCfgSrc: Underpost.baremetal
                    .getGrubConfigFromFile()
                    .grubCfgSrc.replaceAll('system-id', machine.system_id),
                });
              } else {
                logger.error('Failed to create machine or obtain system_id', machine);
                throw new Error('Machine creation failed');
              }
            } else {
              const systemId = machine.system_id;
              console.log('Using pre-registered machine system_id:', systemId.bgYellow.bold.black);

              // Update the boot interface MAC if hardware MAC differs from pre-registered MAC
              // This handles both hardware mode (macAddress is null) and MAC mismatch scenarios
              if (macAddress === null || macAddress !== discovery.mac_address) {
                logger.info('Updating machine interface with discovered hardware MAC...', {
                  preRegisteredMAC: macAddress || 'none (hardware mode)',
                  discoveredMAC: discovery.mac_address,
                });

                // Check current machine status before attempting state transitions
                const currentMachine = Underpost.baremetal.maasCliExec(`machine read ${systemId}`);
                const currentStatus = currentMachine ? currentMachine.status_name : 'Unknown';
                logger.info('Current machine status before interface update:', { systemId, status: currentStatus });

                // Only mark-broken if the machine is in a state that supports it (e.g. Ready, New, Allocated)
                // Machines already in Broken state don't need to be marked broken again
                if (currentStatus !== 'Broken') {
                  try {
                    Underpost.baremetal.maasCliExec(`machine mark-broken ${systemId}`);
                    logger.info('Machine marked as broken successfully');
                  } catch (markBrokenError) {
                    logger.warn('Failed to mark machine as broken, attempting interface update anyway...', {
                      error: markBrokenError.message,
                      currentStatus,
                    });
                  }
                } else {
                  logger.info('Machine is already in Broken state, skipping mark-broken');
                }

                Underpost.baremetal.maasCliExec(
                  `interface update ${systemId} ${machine.boot_interface.id}` + ` mac_address=${discovery.mac_address}`,
                );

                // Re-check status before mark-fixed — only attempt if actually Broken
                const updatedMachine = Underpost.baremetal.maasCliExec(`machine read ${systemId}`);
                const updatedStatus = updatedMachine ? updatedMachine.status_name : 'Unknown';

                if (updatedStatus === 'Broken') {
                  try {
                    Underpost.baremetal.maasCliExec(`machine mark-fixed ${systemId}`);
                    logger.info('Machine marked as fixed successfully');
                  } catch (markFixedError) {
                    logger.warn('Failed to mark machine as fixed:', { error: markFixedError.message });
                  }
                } else {
                  logger.info('Machine is not in Broken state, skipping mark-fixed', { status: updatedStatus });
                }

                logger.info('✓ Machine interface MAC address updated successfully');

                // commissioning_scripts=90-verify-user.sh
              }
              logger.info('Machine resource uri', machine.resource_uri);
              for (const iface of machine.interface_set)
                logger.info('Interface info', {
                  name: iface.name,
                  mac_address: iface.mac_address,
                  resource_uri: iface.resource_uri,
                });
            }

            return { discovery, machine };
          }
        }
        await timer(1000);
        return await Underpost.baremetal.commissionMonitor({
          macAddress,
          ipAddress,
          hostname,
          architecture,
          machine,
        });
      }
    },

    /**
     * @method maasCliExec
     * @description Executes a MAAS CLI command and returns the parsed JSON output.
     * This method abstracts the execution of MAAS CLI commands, ensuring that the output is captured and parsed correctly.
     * @param {string} cmd - The MAAS CLI command to execute (e.g., 'machines read').
     * @returns {object|null} The parsed JSON output from the MAAS CLI command, or null if there is no output.
     * @memberof UnderpostBaremetal
     */
    maasCliExec(cmd) {
      const output = shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} ${cmd}`, {
        stdout: true,
        silent: true,
      }).trim();
      try {
        return output ? JSON.parse(output) : null;
      } catch (error) {
        console.log('output', output);
        logger.error(error);
        throw error;
      }
    },

    /**
     * @method maasAuthCredentialsFactory
     * @description Retrieves MAAS API key credentials from the MAAS CLI.
     * This method parses the output of `maas apikey` to extract the consumer key,
     * consumer secret, token key, and token secret.
     * @returns {object} An object containing the MAAS authentication credentials.
     * @memberof UnderpostBaremetal
     * @throws {Error} If the MAAS API key format is invalid.
     */
    maasAuthCredentialsFactory() {
      // Expected formats:
      // <consumer_key>:<consumer_token>:<secret> (older format)
      // <consumer_key>:<consumer_secret>:<token_key>:<token_secret> (newer format)
      // Commands used to generate API keys:
      // maas apikey --with-names --username ${process.env.MAAS_ADMIN_USERNAME}
      // maas ${process.env.MAAS_ADMIN_USERNAME} account create-authorisation-token
      // maas apikey --generate --username ${process.env.MAAS_ADMIN_USERNAME}
      // Reference: https://github.com/CanonicalLtd/maas-docs/issues/647

      const parts = shellExec(`maas apikey --with-names --username ${process.env.MAAS_ADMIN_USERNAME}`, {
        stdout: true,
      })
        .trim()
        .split(`\n`)[0] // Take only the first line of output.
        .split(':'); // Split by colon to get individual parts.

      let consumer_key, consumer_secret, token_key, token_secret;

      // Determine the format of the API key and assign parts accordingly.
      if (parts.length === 4) {
        [consumer_key, consumer_secret, token_key, token_secret] = parts;
      } else if (parts.length === 3) {
        // Handle older 3-part format, setting consumer_secret as empty.
        [consumer_key, token_key, token_secret] = parts;
        consumer_secret = '';
        token_secret = token_secret.split(' MAAS consumer')[0].trim(); // Clean up token secret.
      } else {
        // Throw an error if the format is not recognized.
        throw new Error('Invalid token format');
      }

      logger.info('Maas api token generated', { consumer_key, consumer_secret, token_key, token_secret });
      return { consumer_key, consumer_secret, token_key, token_secret };
    },

    /**
     * @method mountBinfmtMisc
     * @description Mounts the binfmt_misc filesystem to enable QEMU user-static binfmt support.
     * This is necessary for cross-architecture execution within a chroot environment.
     * @param {object} params - The parameters for the function.
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    mountBinfmtMisc() {
      // Install necessary packages for debootstrap and QEMU.
      shellExec(`sudo dnf install -y iptables-legacy`);
      shellExec(`sudo dnf install -y debootstrap`);
      shellExec(`sudo dnf install -y kernel-modules-extra-$(uname -r)`);
      // Reset QEMU user-static binfmt for proper cross-architecture execution.
      shellExec(`sudo podman run --rm --privileged docker.io/multiarch/qemu-user-static:latest --reset -p yes`);
      // Mount binfmt_misc filesystem.
      shellExec(`sudo modprobe binfmt_misc`);
      shellExec(`sudo mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc`);
    },

    /**
     * @method removeMachines
     * @description Deletes all specified machines from MAAS.
     * @param {object} params - The parameters for the function.
     * @param {Array<object>} params.machines - An array of machine objects, each with a `system_id`.
     * @param {Array<string>} [params.ignore] - An optional array of system IDs to ignore during deletion.
     * @memberof UnderpostBaremetal
     * @returns {Array<object>} An empty array after machines are removed.
     */
    removeMachines({ machines, ignore }) {
      for (const machine of machines) {
        // Handle both string system_ids and machine objects
        const systemId = typeof machine === 'string' ? machine : machine.system_id;
        if (ignore && ignore.find((mId) => mId === systemId)) continue;
        logger.info(`Removing machine: ${systemId}`);
        Underpost.baremetal.maasCliExec(`machine delete ${systemId}`);
      }
      return [];
    },

    /**
     * @method clearDiscoveries
     * @description Clears all observed discoveries in MAAS and optionally forces a new scan.
     * @param {object} params - The parameters for the function.
     * @param {boolean} params.force - If true, forces a new discovery scan after clearing.
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    clearDiscoveries({ force }) {
      Underpost.baremetal.maasCliExec(`discoveries clear all=true`);
      if (force === true) {
        Underpost.baremetal.maasCliExec(`discoveries scan force=true`);
      }
    },

    /**
     * @method macMonitor
     * @description Monitors for the presence of a MAC address file in the NFS host path.
     * This is used to wait for the target machine to report its MAC address.
     * @param {object} params - The parameters for the function.
     * @param {string} params.nfsHostPath - The NFS host path where the MAC file is expected.
     * @memberof UnderpostBaremetal
     * @returns {Promise<void>} A promise that resolves when the MAC file is found or after a delay.
     */
    async macMonitor({ nfsHostPath }) {
      if (fs.existsSync(`${nfsHostPath}/underpost/mac`)) {
        const mac = fs.readFileSync(`${nfsHostPath}/underpost/mac`, 'utf8').trim();
        logger.info('Commissioning MAC', mac);
        return;
      }
      await timer(1000);
      await Underpost.baremetal.macMonitor({ nfsHostPath });
    },

    /**
     * @method crossArchBinFactory
     * @description Copies the appropriate QEMU static binary into the NFS root filesystem
     * for cross-architecture execution within a chroot environment.
     * @param {object} params - The parameters for the function.
     * @param {string} params.nfsHostPath - The path to the NFS root filesystem on the host.
     * @memberof UnderpostBaremetal
     * @param {'arm64'|'amd64'} params.debootstrapArch - The target architecture of the debootstrap environment.
     * @returns {void}
     */
    crossArchBinFactory({ nfsHostPath, bootstrapArch }) {
      switch (bootstrapArch) {
        case 'arm64':
          // Copy QEMU static binary for ARM64.
          shellExec(`sudo podman cp extract:/usr/bin/qemu-aarch64-static ${nfsHostPath}/usr/bin/`);
          break;
        case 'amd64':
          // Copy QEMU static binary for AMD64.
          shellExec(`sudo podman cp extract:/usr/bin/qemu-x86_64-static ${nfsHostPath}/usr/bin/`);
          break;
        default:
          // Log a warning or throw an error for unsupported architectures.
          logger.warn(`Unsupported bootstrap architecture: ${bootstrapArch}`);
          break;
      }
      // Install GRUB EFI modules for both architectures to ensure compatibility.
      shellExec(`sudo dnf install -y grub2-efi-aa64-modules`);
      shellExec(`sudo dnf install -y grub2-efi-x64-modules`);
    },

    /**
     * @method crossArchRunner
     * @description Executes a series of shell commands within a chroot environment,
     * optionally using QEMU for cross-architecture execution.
     * @param {object} params - The parameters for the function.
     * @param {string} params.nfsHostPath - The path to the NFS root filesystem on the host.
     * @param {'arm64'|'amd64'} params.debootstrapArch - The target architecture of the debootstrap environment.
     * @param {object} params.callbackMetaData - Metadata about the callback, including runner host architecture.
     * @memberof UnderpostBaremetal
     * @param {string[]} params.steps - An array of shell commands to execute.
     * @returns {void}
     */
    crossArchRunner({ nfsHostPath, bootstrapArch, callbackMetaData, steps }) {
      // Render the steps with logging for better visibility during execution.
      steps = Underpost.baremetal.stepsRender(steps, false);

      let qemuCrossArchBash = '';
      // Determine if QEMU is needed for cross-architecture execution.
      if (bootstrapArch !== callbackMetaData.runnerHost.architecture)
        switch (bootstrapArch) {
          case 'arm64':
            qemuCrossArchBash = '/usr/bin/qemu-aarch64-static ';
            break;
          case 'amd64':
            qemuCrossArchBash = '/usr/bin/qemu-x86_64-static ';
            break;
          default:
            // No QEMU prefix for unsupported or native architectures.
            break;
        }

      // Execute the commands within the chroot environment using a heredoc.
      shellExec(`sudo chroot ${nfsHostPath} ${qemuCrossArchBash}/bin/bash <<'EOF'
${steps}
EOF`);
    },

    /**
     * @method stepsRender
     * @description Renders an array of shell commands into a formatted string,
     * optionally including YAML-style formatting and execution logging.
     * This helps in visualizing and debugging the execution flow of provisioning steps.
     * @param {string[]} [steps=[]] - An array of shell commands.
     * @param {boolean} [yaml=true] - If true, formats the output as YAML list items.
     * @memberof UnderpostBaremetal
     * @returns {string} The formatted string of commands.
     */
    stepsRender(steps = [], yaml = true) {
      return steps
        .map(
          (step, i, a) =>
            // Add a timestamp and step counter for better logging and traceability.
            (yaml ? '  - ' : '') +
            'echo "' +
            (yaml ? '\\' : '') +
            '$(date) | ' +
            (i + 1) +
            '/' +
            a.length +
            ' - ' +
            step.split('\n')[0] +
            '"' +
            `\n` +
            `${yaml ? '  - ' : ''}${step}`,
        )
        .join('\n');
    },

    /**
     * @method nfsMountCallback
     * @description Manages NFS mounts and unmounts for the baremetal provisioning process.
     * It checks the mount status and performs mount/unmount operations as requested.
     * @param {object} params - The parameters for the function.
     * @param {string} params.hostname - The hostname of the target machine.
     * @param {string} params.nfsHostPath - The NFS host path for the target machine.
     * @param {string} params.workflowId - The identifier for the workflow configuration.
     * @param {boolean} [params.mount] - If true, attempts to mount the NFS paths.
     * @param {boolean} [params.unmount] - If true, attempts to unmount the NFS paths.
     * @param {number} [currentRecall=0] - The current recall attempt count for retries.
     * @param {number} [maxRecalls=5] - The maximum number of recall attempts allowed.
     * @memberof UnderpostBaremetal
     * @returns {Promise<void>} A promise that resolves when the mount/unmount operations are complete.
     */
    async nfsMountCallback({ hostname, nfsHostPath, workflowId, mount, unmount }, currentRecall = 0, maxRecalls = 5) {
      // Mount binfmt_misc filesystem.
      if (mount) Underpost.baremetal.mountBinfmtMisc();
      const unMountCmds = [];
      const mountCmds = [];
      const workflowsConfig = Underpost.baremetal.loadWorkflowsConfig();
      let recall = false;
      if (!workflowsConfig[workflowId]) {
        throw new Error(`Workflow configuration not found for ID: ${workflowId}`);
      }
      if (
        workflowsConfig[workflowId].type === 'chroot-debootstrap' ||
        workflowsConfig[workflowId].type === 'chroot-container'
      ) {
        const mounts = {
          bind: ['/proc', '/sys', '/run'],
          rbind: ['/dev'],
        };

        for (const mountCmd of Object.keys(mounts)) {
          for (const mountPath of mounts[mountCmd]) {
            const hostMountPath = `${process.env.NFS_EXPORT_PATH}/${hostname}${mountPath}`;
            // Check if the path is already mounted using `mountpoint` command.
            const isPathMounted = !shellExec(`mountpoint ${hostMountPath}`, { silent: true, stdout: true }).match(
              'not a mountpoint',
            );

            if (isPathMounted) {
              logger.warn('Nfs path already mounted', mountPath);
              if (unmount === true) {
                // Unmount if requested.
                unMountCmds.push(`sudo umount -Rfl ${hostMountPath}`);
                if (!recall) recall = true;
              }
            } else {
              if (mount === true) {
                // Mount if requested and not already mounted.
                mountCmds.push(`sudo mount --${mountCmd} ${mountPath} ${hostMountPath}`);
              } else {
                logger.warn('Nfs path not mounted', mountPath);
              }
            }
          }
        }
        for (const unMountCmd of unMountCmds) shellExec(unMountCmd);
        if (recall) {
          if (currentRecall >= maxRecalls) {
            throw new Error(
              `Maximum recall attempts (${maxRecalls}) reached for nfsMountCallback. Hostname: ${hostname}`,
            );
          }
          logger.info(`nfsMountCallback recall attempt ${currentRecall + 1}/${maxRecalls} for hostname: ${hostname}`);
          await timer(1000);
          return await Underpost.baremetal.nfsMountCallback(
            { hostname, nfsHostPath, workflowId, mount, unmount },
            currentRecall + 1,
            maxRecalls,
          );
        }
        if (mountCmds.length > 0) {
          shellExec(`sudo chown -R $(whoami):$(whoami) ${nfsHostPath}`);
          shellExec(`sudo chmod -R 755 ${nfsHostPath}`);
          for (const mountCmd of mountCmds) shellExec(mountCmd);
        }
      }
    },

    /**
     * @method getHostArch
     * @description Determines the architecture of the host machine.
     * This is crucial for cross-compilation and selecting the correct QEMU binaries.
     * @memberof UnderpostBaremetal
     * @returns {{alias: 'amd64'|'arm64', name: 'x86_64'|'aarch64'}} The host architecture.
     * @throws {Error} If the host architecture is unsupported.
     */
    getHostArch() {
      // `uname -m` returns e.g. 'x86_64' or 'aarch64'
      const machine = shellExec('uname -m', { stdout: true, silent: true }).trim();
      if (machine === 'x86_64') return { alias: 'amd64', name: 'x86_64' };
      if (machine === 'aarch64') return { alias: 'arm64', name: 'aarch64' };
      throw new Error(`Unsupported host architecture: ${machine}`);
    },

    /**
     * @property {object} systemProvisioningFactory
     * @description A factory object containing functions for system provisioning based on OS type.
     * Each OS type (e.g., 'ubuntu') provides methods for base system setup, user creation,
     * timezone configuration, and keyboard layout settings.     *
     * @memberof UnderpostBaremetal
     * @namespace UnderpostBaremetal.systemProvisioningFactory
     */
    systemProvisioningFactory: {
      /**
       * @property {object} ubuntu
       * @description Provisioning steps for Ubuntu-based systems.
       * @memberof UnderpostBaremetal.systemProvisioningFactory
       * @namespace UnderpostBaremetal.systemProvisioningFactory.ubuntu
       */
      ubuntu: {
        /**
         * @method base
         * @description Generates shell commands for basic Ubuntu system provisioning.
         * This includes updating package lists, installing essential build tools,
         * kernel modules, cloud-init, SSH server, and other core utilities.
         * @param {object} params - The parameters for the function.
         * @memberof UnderpostBaremetal.systemProvisioningFactory.ubuntu
         * @returns {string[]} An array of shell commands.
         */
        base: () => [
          // Configure APT sources for Ubuntu ports
          `cat <<SOURCES | tee /etc/apt/sources.list
deb http://ports.ubuntu.com/ubuntu-ports noble main restricted universe multiverse
deb http://ports.ubuntu.com/ubuntu-ports noble-updates main restricted universe multiverse
deb http://ports.ubuntu.com/ubuntu-ports noble-security main restricted universe multiverse
SOURCES`,

          // Update package lists and perform a full system upgrade
          `apt update -qq`,
          `apt -y full-upgrade`,

          // Install all essential packages in one consolidated step
          `DEBIAN_FRONTEND=noninteractive apt install -y build-essential xinput x11-xkb-utils usbutils uuid-runtime linux-image-generic systemd-sysv openssh-server sudo locales udev util-linux iproute2 netplan.io ca-certificates curl wget chrony apt-utils tzdata kmod keyboard-configuration console-setup iputils-ping`,

          // Ensure systemd is the init system
          `ln -sf /lib/systemd/systemd /sbin/init`,

          // Clean up
          `apt-get clean`,
        ],
        /**
         * @method user
         * @description Generates shell commands for creating a root user and configuring SSH access.
         * This is a critical security step for initial access to the provisioned system.
         * @memberof UnderpostBaremetal.systemProvisioningFactory.ubuntu
         * @returns {string[]} An array of shell commands.
         */
        user: () => [
          `useradd -m -s /bin/bash -G sudo root`, // Create a root user with bash shell and sudo privileges.
          `echo 'root:root' | chpasswd`, // Set a default password for the root user (consider more secure methods for production).
          `mkdir -p /home/root/.ssh`, // Create .ssh directory for authorized keys.
          // Add the public SSH key to authorized_keys for passwordless login.
          `echo '${fs.readFileSync(
            `/home/dd/engine/engine-private/deploy/id_rsa.pub`,
            'utf8',
          )}' > /home/root/.ssh/authorized_keys`,
          `chown -R root /home/root/.ssh`, // Set ownership for security.
          `chmod 700 /home/root/.ssh`, // Set permissions for the .ssh directory.
          `chmod 600 /home/root/.ssh/authorized_keys`, // Set permissions for authorized_keys.
        ],
        /**
         * @method timezone
         * @description Generates shell commands for configuring the system timezone and Chrony (NTP client).
         * Accurate time synchronization is essential for logging, security, and distributed systems.
         * @param {object} params - The parameters for the function.
         * @param {string} params.timezone - The timezone string (e.g., 'America/New_York').
         * @param {string} params.chronyConfPath - The path to the Chrony configuration file.
         * @param {string} [alias='chrony'] - The alias for the chrony service.
         * @memberof UnderpostBaremetal.systemProvisioningFactory.ubuntu
         * @returns {string[]} An array of shell commands.
         */
        timezone: ({ timezone, chronyConfPath }, alias = 'chrony') => [
          `export DEBIAN_FRONTEND=noninteractive`, // Set non-interactive mode for Debian packages.
          `ln -fs /usr/share/zoneinfo/${timezone} /etc/localtime`, // Symlink timezone.
          `sudo dpkg-reconfigure --frontend noninteractive tzdata`, // Reconfigure timezone data.
          `sudo timedatectl set-timezone ${timezone}`, // Set timezone using timedatectl.
          `sudo timedatectl set-ntp true`, // Enable NTP synchronization.

          // Write the Chrony configuration file.
          `echo '
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
# pool 2.pool.ntp.org iburst
server ${process.env.MAAS_NTP_SERVER} iburst

# Record the rate at which the system clock gains/losses time.
driftfile /var/lib/chrony/drift

# Allow the system clock to be stepped in the first three updates
# if its offset is larger than 1 second.
makestep 1.0 3

# Enable kernel synchronization of the real-time clock (RTC).
rtcsync

# Enable hardware timestamping on all interfaces that support it.
#hwtimestamp *

# Increase the minimum number of selectable sources required to adjust
# the system clock.
#minsources 2

# Allow NTP client access from local network.
#allow 192.168.0.0/16

# Serve time even if not synchronized to a time source.
#local stratum 10

# Specify file containing keys for NTP authentication.
keyfile /etc/chrony.keys

# Get TAI-UTC offset and leap seconds from the system tz database.
leapsectz right/UTC

# Specify directory for log files.
logdir /var/log/chrony

# Select which information is logged.
#log measurements statistics tracking
' > ${chronyConfPath}`,
          `systemctl stop ${alias}`, // Stop Chrony service before reconfiguring.

          // Enable, restart, and check status of Chrony service.
          `sudo systemctl enable --now ${alias}`,
          `sudo systemctl restart ${alias}`,

          // Wait for chrony to synchronize
          `echo "Waiting for chrony to synchronize..."`,
          `for i in {1..30}; do chronyc tracking | grep -q "Leap status     : Normal" && break || sleep 2; done`,

          `sudo systemctl status ${alias}`,

          // Verify Chrony synchronization.
          `chronyc sources`,
          `chronyc tracking`,

          `chronyc sourcestats -v`, // Display source statistics.
          `timedatectl status`, // Display current time and date settings.
        ],
        /**
         * @method keyboard
         * @description Generates shell commands for configuring the keyboard layout.
         * This ensures correct input behavior on the provisioned system.
         * @param {string} [keyCode='en'] - The keyboard layout code (e.g., 'en', 'es').
         * @memberof UnderpostBaremetal.systemProvisioningFactory.ubuntu
         * @returns {string[]} An array of shell commands.
         */
        keyboard: (keyCode = 'en') => [
          `sudo locale-gen en_US.UTF-8`,
          `sudo update-locale LANG=en_US.UTF-8`,
          `sudo sed -i 's/XKBLAYOUT="us"/XKBLAYOUT="${keyCode}"/' /etc/default/keyboard`,
          `sudo dpkg-reconfigure --frontend noninteractive keyboard-configuration`,
          `sudo systemctl restart keyboard-setup.service`,
        ],
      },
      /**
       * @property {object} rocky
       * @description Provisioning steps for Rocky Linux-based systems.
       * @memberof UnderpostBaremetal.systemProvisioningFactory
       * @namespace UnderpostBaremetal.systemProvisioningFactory.rocky
       */
      rocky: {
        /**
         * @method base
         * @description Generates shell commands for basic Rocky Linux system provisioning.
         * This includes installing Node.js, npm, and underpost CLI tools.
         * @param {object} params - The parameters for the function.
         * @memberof UnderpostBaremetal.systemProvisioningFactory.rocky
         * @returns {string[]} An array of shell commands.
         */
        base: () => [
          // Update system and install EPEL repository
          `dnf -y update`,
          `dnf -y install epel-release`,

          // Install essential system tools (avoiding duplicates from container packages)
          `dnf -y install --allowerasing bzip2 openssh-server nano vim-enhanced less openssl-devel git gnupg2 libnsl perl`,
          `dnf clean all`,

          // Install Node.js
          `curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -`,
          `dnf install -y nodejs`,
          `dnf clean all`,

          // Verify Node.js and npm versions
          `node --version`,
          `npm --version`,

          // Install underpost ci/cd cli
          `npm install -g underpost`,
          `underpost --version`,
        ],
        /**
         * @method user
         * @description Generates shell commands for creating a root user and configuring SSH access on Rocky Linux.
         * This is a critical security step for initial access to the provisioned system.
         * @memberof UnderpostBaremetal.systemProvisioningFactory.rocky
         * @returns {string[]} An array of shell commands.
         */
        user: () => [
          `useradd -m -s /bin/bash -G wheel root`, // Create a root user with bash shell and wheel group (sudo on RHEL)
          `echo 'root:root' | chpasswd`, // Set a default password for the root user
          `mkdir -p /home/root/.ssh`, // Create .ssh directory for authorized keys
          // Add the public SSH key to authorized_keys for passwordless login
          `echo '${fs.readFileSync(
            `/home/dd/engine/engine-private/deploy/id_rsa.pub`,
            'utf8',
          )}' > /home/root/.ssh/authorized_keys`,
          `chown -R root:root /home/root/.ssh`, // Set ownership for security
          `chmod 700 /home/root/.ssh`, // Set permissions for the .ssh directory
          `chmod 600 /home/root/.ssh/authorized_keys`, // Set permissions for authorized_keys
        ],
        /**
         * @method timezone
         * @description Generates shell commands for configuring the system timezone on Rocky Linux.
         * @param {object} params - The parameters for the function.
         * @param {string} params.timezone - The timezone string (e.g., 'America/Santiago').
         * @param {string} params.chronyConfPath - The path to the Chrony configuration file (optional).
         * @memberof UnderpostBaremetal.systemProvisioningFactory.rocky
         * @returns {string[]} An array of shell commands.
         */
        timezone: ({ timezone, chronyConfPath = '/etc/chrony.conf' }) => [
          // Set system timezone using both methods (for chroot and running system)
          `ln -sf /usr/share/zoneinfo/${timezone} /etc/localtime`,
          `echo '${timezone}' > /etc/timezone`,
          `timedatectl set-timezone ${timezone} 2>/dev/null`,

          // Configure chrony with local NTP server and common NTP pools
          `echo '# Local NTP server' > ${chronyConfPath}`,
          `echo 'server 192.168.1.1 iburst prefer' >> ${chronyConfPath}`,
          `echo '' >> ${chronyConfPath}`,
          `echo '# Fallback public NTP servers' >> ${chronyConfPath}`,
          `echo 'server 0.pool.ntp.org iburst' >> ${chronyConfPath}`,
          `echo 'server 1.pool.ntp.org iburst' >> ${chronyConfPath}`,
          `echo 'server 2.pool.ntp.org iburst' >> ${chronyConfPath}`,
          `echo 'server 3.pool.ntp.org iburst' >> ${chronyConfPath}`,
          `echo '' >> ${chronyConfPath}`,
          `echo '# Configuration' >> ${chronyConfPath}`,
          `echo 'driftfile /var/lib/chrony/drift' >> ${chronyConfPath}`,
          `echo 'makestep 1.0 3' >> ${chronyConfPath}`,
          `echo 'rtcsync' >> ${chronyConfPath}`,
          `echo 'logdir /var/log/chrony' >> ${chronyConfPath}`,

          // Enable chronyd to start on boot
          `systemctl enable chronyd 2>/dev/null`,

          // Create systemd link for boot (works in chroot)
          `mkdir -p /etc/systemd/system/multi-user.target.wants`,
          `ln -sf /usr/lib/systemd/system/chronyd.service /etc/systemd/system/multi-user.target.wants/chronyd.service 2>/dev/null`,

          // Start chronyd if systemd is running
          `systemctl start chronyd 2>/dev/null`,

          // Restart chronyd to apply configuration
          `systemctl restart chronyd 2>/dev/null`,

          // Force immediate time synchronization (only if chronyd is running)
          `chronyc makestep 2>/dev/null`,

          // Verify timezone configuration
          `ls -l /etc/localtime`,
          `cat /etc/timezone || echo 'No /etc/timezone file'`,
          `timedatectl status 2>/dev/null || echo 'Timezone set to ${timezone} (timedatectl not available in chroot)'`,
          `chronyc tracking 2>/dev/null || echo 'Chrony configured but not running (will start on boot)'`,
        ],
        /**
         * @method keyboard
         * @description Generates shell commands for configuring the keyboard layout on Rocky Linux.
         * This uses localectl to set the keyboard layout for both console and X11.
         * @param {string} [keyCode='us'] - The keyboard layout code (e.g., 'us', 'es').
         * @memberof UnderpostBaremetal.systemProvisioningFactory.rocky
         * @returns {string[]} An array of shell commands.
         */
        keyboard: (keyCode = 'us') => [
          // Configure vconsole.conf for console keyboard layout (persistent)
          `echo 'KEYMAP=${keyCode}' > /etc/vconsole.conf`,
          `echo 'FONT=latarcyrheb-sun16' >> /etc/vconsole.conf`,

          // Configure locale.conf for system locale
          `echo 'LANG=en_US.UTF-8' > /etc/locale.conf`,
          `echo 'LC_ALL=en_US.UTF-8' >> /etc/locale.conf`,

          // Set keyboard layout using localectl (works if systemd is running)
          `localectl set-locale LANG=en_US.UTF-8 2>/dev/null`,
          `localectl set-keymap ${keyCode} 2>/dev/null`,
          `localectl set-x11-keymap ${keyCode} 2>/dev/null`,

          // Configure X11 keyboard layout file directly
          `mkdir -p /etc/X11/xorg.conf.d`,
          `echo 'Section "InputClass"' > /etc/X11/xorg.conf.d/00-keyboard.conf`,
          `echo '    Identifier "system-keyboard"' >> /etc/X11/xorg.conf.d/00-keyboard.conf`,
          `echo '    MatchIsKeyboard "on"' >> /etc/X11/xorg.conf.d/00-keyboard.conf`,
          `echo '    Option "XkbLayout" "${keyCode}"' >> /etc/X11/xorg.conf.d/00-keyboard.conf`,
          `echo 'EndSection' >> /etc/X11/xorg.conf.d/00-keyboard.conf`,

          // Load the keymap immediately (if not in chroot)
          `loadkeys ${keyCode} 2>/dev/null || echo 'Keymap ${keyCode} configured (loadkeys not available in chroot)'`,

          // Verify configuration
          `echo 'Keyboard configuration files:'`,
          `cat /etc/vconsole.conf`,
          `cat /etc/locale.conf`,
          `cat /etc/X11/xorg.conf.d/00-keyboard.conf 2>/dev/null || echo 'X11 config created'`,
          `localectl status 2>/dev/null || echo 'Keyboard layout set to ${keyCode} (localectl not available in chroot)'`,
        ],
      },
    },

    /**
     * @method rebuildNfsServer
     * @description Configures and restarts the NFS server to export the specified path.
     * This is crucial for allowing baremetal machines to boot via NFS.
     * @param {object} params - The parameters for the function.
     * @param {string} params.nfsHostPath - The path to the NFS server export.
     * @memberof UnderpostBaremetal
     * @param {string} [params.subnet='192.168.1.0/24'] - The subnet allowed to access the NFS export.
     * @returns {void}
     */
    rebuildNfsServer({ nfsHostPath, subnet }) {
      if (!subnet) subnet = '192.168.1.0/24'; // Default subnet if not provided.
      // Write the NFS exports configuration to /etc/exports.
      fs.writeFileSync(
        `/etc/exports`,
        `${nfsHostPath} ${subnet}(${[
          'rw', // Read-write access.
          // 'all_squash', // Squash all client UIDs/GIDs to anonymous.
          'sync', // Synchronous writes.
          'no_root_squash', // Do not squash root user.
          'no_subtree_check', // Disable subtree checking.
          'insecure', // Allow connections from non-privileged ports.
        ]})`,
        'utf8',
      );

      logger.info('Writing NFS server configuration to /etc/nfs.conf...');
      // Write NFS daemon configuration, including port settings.
      fs.writeFileSync(
        `/etc/nfs.conf`,
        `[mountd]
port = 20048

[statd]
port = 32765
outgoing-port = 32765

[nfsd]
# Enable RDMA support if desired and hardware supports it.
rdma=y
rdma-port=20049

[lockd]
port = 32766
udp-port = 32766
`,
        'utf8',
      );
      logger.info('NFS configuration written.');

      logger.info('Reloading NFS exports...');
      shellExec(`sudo exportfs -rav`);

      // Display the currently active NFS exports for verification.
      logger.info('Displaying active NFS exports');
      shellExec(`sudo exportfs -s`);

      // Restart the nfs-server service to apply all configuration changes,
      // including port settings from /etc/nfs.conf and export changes.
      logger.info('Restarting nfs-server service...');
      shellExec(`sudo systemctl restart nfs-server`);
      logger.info('NFS server restarted.');
    },

    /**
     * @method checkQemuCrossArchSupport
     * @description Checks for QEMU support when building for a different architecture.
     * This is essential for validator bots that need to build images for architectures
     * different from the host system (e.g., building arm64 on x86_64 or vice versa).
     * @param {object} workflow - The workflow configuration object.
     * @param {object} workflow.maas - The MAAS configuration.
     * @param {string} workflow.maas.architecture - Target architecture (e.g., 'arm64/generic', 'amd64/generic').
     * @memberof UnderpostBaremetal
     * @throws {Error} If QEMU is not installed or doesn't support required machine types.
     * @returns {void}
     */
    checkQemuCrossArchSupport(workflow) {
      // Check for QEMU support if building for a different architecture (validator bots case)
      if (workflow.maas.architecture.startsWith('arm64') && process.arch !== 'arm64') {
        // Building arm64/aarch64 on x86_64 host
        // Check both /usr/local/bin (compiled) and system paths
        let qemuAarch64Path = null;

        if (shellExec('test -x /usr/local/bin/qemu-system-aarch64').code === 0) {
          qemuAarch64Path = '/usr/local/bin/qemu-system-aarch64';
        } else if (shellExec('which qemu-system-aarch64').code === 0) {
          qemuAarch64Path = shellExec('which qemu-system-aarch64').stdout.trim();
        }

        if (!qemuAarch64Path) {
          throw new Error(
            'qemu-system-aarch64 is not installed. Please install it to build ARM64 images on x86_64 hosts.\n' +
              'Run: node bin baremetal --dev --install-packer',
          );
        }

        logger.info(`Found qemu-system-aarch64 at: ${qemuAarch64Path}`);

        // Verify that the installed qemu supports the 'virt' machine type (required for arm64)
        const machineHelp = shellExec(`${qemuAarch64Path} -machine help`).stdout;
        if (!machineHelp.includes('virt')) {
          throw new Error(
            'The installed qemu-system-aarch64 does not support the "virt" machine type.\n' +
              'This usually happens if qemu-system-aarch64 is a symlink to qemu-kvm on x86_64.\n' +
              'Run: node bin baremetal --dev --install-packer',
          );
        }
      } else if (workflow.maas.architecture.startsWith('amd64') && process.arch !== 'x64') {
        // Building amd64/x86_64 on aarch64 host
        // Check both /usr/local/bin (compiled) and system paths
        let qemuX86Path = null;

        if (shellExec('test -x /usr/local/bin/qemu-system-x86_64').code === 0) {
          qemuX86Path = '/usr/local/bin/qemu-system-x86_64';
        } else if (shellExec('which qemu-system-x86_64').code === 0) {
          qemuX86Path = shellExec('which qemu-system-x86_64').stdout.trim();
        }

        if (!qemuX86Path) {
          throw new Error(
            'qemu-system-x86_64 is not installed. Please install it to build x86_64 images on aarch64 hosts.\n' +
              'Run: node bin baremetal --dev --install-packer',
          );
        }

        logger.info(`Found qemu-system-x86_64 at: ${qemuX86Path}`);

        // Verify that the installed qemu supports the 'pc' or 'q35' machine type (required for x86_64)
        const machineHelp = shellExec(`${qemuX86Path} -machine help`).stdout;
        if (!machineHelp.includes('pc') && !machineHelp.includes('q35')) {
          throw new Error(
            'The installed qemu-system-x86_64 does not support the "pc" or "q35" machine type.\n' +
              'Run: node bin baremetal --dev --install-packer',
          );
        }
      }
    },

    /**
     * @method bootConfFactory
     * @description Generates the boot configuration file for specific workflows,
     * primarily for Raspberry Pi 4 Model B. This configuration includes TFTP settings,
     * MAC address override, and static IP configuration.
     * @param {object} params - The parameters for the function.
     * @param {string} params.workflowId - The identifier for the specific workflow.
     * @param {string} params.tftpIp - The IP address of the TFTP server.
     * @param {string} params.tftpPrefixStr - The TFTP prefix string for boot files.
     * @param {string} params.macAddress - The MAC address to be set for the device.
     * @param {string} params.clientIp - The static IP address for the client device.
     * @param {string} params.subnet - The subnet mask for the client device.
     * @param {string} params.gateway - The gateway IP address for the client device.
     * @memberof UnderpostBaremetal
     * @returns {string} The generated boot configuration content.
     * @throws {Error} If an invalid workflow ID is provided.
     */
    bootConfFactory({ workflowId, tftpIp, tftpPrefixStr, macAddress, clientIp, subnet, gateway }) {
      if (workflowId.startsWith('rpi4mb')) {
        // Instructions: Flash sd with Raspberry Pi OS lite and update:
        // EEPROM (Electrically Erasable Programmable Read-Only Memory) like microcontrollers
        // sudo rpi-eeprom-config --apply /boot/firmware/boot.conf
        // sudo reboot
        // vcgencmd bootloader_config
        // shutdown -h now
        return `[all]
BOOT_UART=0
WAKE_ON_GPIO=1
POWER_OFF_ON_HALT=0
ENABLE_SELF_UPDATE=1
DISABLE_HDMI=0
NET_INSTALL_ENABLED=1
DHCP_TIMEOUT=45000
DHCP_REQ_TIMEOUT=4000
TFTP_FILE_TIMEOUT=30000
BOOT_ORDER=0x21

# ─────────────────────────────────────────────────────────────
# TFTP configuration
# ─────────────────────────────────────────────────────────────

# Custom TFTP prefix string (e.g., based on MAC address, no colons)
#TFTP_PREFIX_STR=AA-BB-CC-DD-EE-FF/

# Optional PXE Option43 override (leave commented if unused)
#PXE_OPTION43="Raspberry Pi Boot"

# DHCP client GUID (Option 97); 0x34695052 is the FourCC for Raspberry Pi 4
#DHCP_OPTION97=0x34695052

TFTP_IP=${tftpIp}
TFTP_PREFIX=1
TFTP_PREFIX_STR=${tftpPrefixStr}/

# ─────────────────────────────────────────────────────────────
# Manually override Ethernet MAC address
# ─────────────────────────────────────────────────────────────

#MAC_ADDRESS=${macAddress}

# OTP MAC address override
#MAC_ADDRESS_OTP=0,1

# ─────────────────────────────────────────────────────────────
# Static IP configuration (bypasses DHCP completely)
# ─────────────────────────────────────────────────────────────
#CLIENT_IP=${clientIp}
SUBNET=${subnet}
GATEWAY=${gateway}`;
      } else logger.warn(`No boot configuration factory defined for workflow ID: ${workflowId}`);
    },

    /**
     * @method loadWorkflowsConfig
     * @description Loads the commission workflows configuration from commission-workflows.json.
     * Each workflow defines specific parameters like system provisioning type,
     * kernel version, Chrony settings, debootstrap image details, and NFS mounts.     *
     * @memberof UnderpostBaremetal
     */
    loadWorkflowsConfig() {
      if (this._workflowsConfig) return this._workflowsConfig;
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const configPath = path.resolve(__dirname, '../../baremetal/commission-workflows.json');
      this._workflowsConfig = fs.readJsonSync(configPath);
      return this._workflowsConfig;
    },

    /**
     * @property {object} packerMaasImageBuildWorkflows
     * @description Configuration for PACKe mass image workflows.
     * @memberof UnderpostBaremetal
     */
    loadPackerMaasImageBuildWorkflows() {
      if (this._packerMaasImageBuildWorkflows) return this._packerMaasImageBuildWorkflows;
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const configPath = path.resolve(__dirname, '../../baremetal/packer-workflows.json');
      this._packerMaasImageBuildWorkflows = fs.readJsonSync(configPath);
      return this._packerMaasImageBuildWorkflows;
    },

    /**
     * Write Packer MAAS image build workflows configuration to file
     * @param {object} workflows - The workflows configuration object
     * @description Writes the Packer MAAS image build workflows to packer-workflows.json
     * @memberof UnderpostBaremetal
     */
    writePackerMaasImageBuildWorkflows(workflows) {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const configPath = path.resolve(__dirname, '../../baremetal/packer-workflows.json');
      fs.writeJsonSync(configPath, workflows, { spaces: 2 });
      this._packerMaasImageBuildWorkflows = workflows;
      return configPath;
    },
  };
}

export default UnderpostBaremetal;
