/**
 * Provides baremetal provisioning and configuration functionalities.
 * @module src/cli/baremetal.js
 * @namespace UnderpostBaremetal
 */

import { fileURLToPath } from 'url';
import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { openTerminal, pbcopy, shellExec } from '../server/process.js';
import dotenv from 'dotenv';
import { loggerFactory } from '../server/logger.js';
import { getLocalIPv4Address } from '../server/dns.js';
import fs from 'fs-extra';
import path from 'path';
import Downloader from '../server/downloader.js';
import UnderpostCloudInit from './cloud-init.js';
import UnderpostRepository from './repository.js';
import { newInstance, s4, timer } from '../client/components/core/CommonJs.js';
import { spawnSync } from 'child_process';

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
     * @method callback
     * @description Initiates a baremetal provisioning workflow based on the provided options.
     * This is the primary entry point for orchestrating baremetal operations.
     * It handles NFS root filesystem building, control server installation/uninstallation,
     * and system-level provisioning tasks like timezone and keyboard configuration.
     * @param {string} [workflowId='rpi4mb'] - Identifier for the specific workflow configuration to use.
     * @param {string} [ipAddress=getLocalIPv4Address()] - The IP address of the control server or the local machine.
     * @param {string} [hostname=workflowId] - The hostname of the target baremetal machine.
     * @param {string} [ipFileServer=getLocalIPv4Address()] - The IP address of the file server (NFS/TFTP).
     * @param {string} [ipConfig=''] - IP configuration string for the baremetal machine.
     * @param {string} [netmask=''] - Netmask of network
     * @param {string} [dnsServer=''] - DNS server IP address.
     * @param {object} [options] - An object containing boolean flags for various operations.
     * @param {boolean} [options.dev=false] - Development mode flag.
     * @param {boolean} [options.controlServerInstall=false] - Flag to install the control server (e.g., MAAS).
     * @param {boolean} [options.controlServerUninstall=false] - Flag to uninstall the control server.
     * @param {boolean} [options.controlServerRestart=false] - Flag to restart the control server.
     * @param {boolean} [options.controlServerDbInstall=false] - Flag to install the control server's database.
     * @param {boolean} [options.controlServerDbUninstall=false] - Flag to uninstall the control server's database.
     * @param {string} [options.mac=''] - MAC address of the baremetal machine.
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
     * @param {string} [options.isoUrl=''] - Uses a custom ISO URL for baremetal machine commissioning.
     * @param {boolean} [options.ubuntuToolsBuild=false] - Builds ubuntu tools for chroot environment.
     * @param {boolean} [options.ubuntuToolsTest=false] - Tests ubuntu tools in chroot environment.
     * @param {string} [options.bootcmd=''] - Comma-separated list of boot commands to execute.
     * @param {string} [options.runcmd=''] - Comma-separated list of run commands to execute.
     * @param {boolean} [options.nfsBuild=false] - Flag to build the NFS root filesystem.
     * @param {boolean} [options.nfsMount=false] - Flag to mount the NFS root filesystem.
     * @param {boolean} [options.nfsUnmount=false] - Flag to unmount the NFS root filesystem.
     * @param {boolean} [options.nfsSh=false] - Flag to chroot into the NFS environment for shell access.
     * @param {string} [options.logs=''] - Specifies which logs to display ('dhcp', 'cloud', 'machine', 'cloud-config').
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    async callback(
      workflowId,
      ipAddress,
      hostname,
      ipFileServer,
      ipConfig,
      netmask,
      dnsServer,
      options = {
        dev: false,
        controlServerInstall: false,
        controlServerUninstall: false,
        controlServerRestart: false,
        controlServerDbInstall: false,
        controlServerDbUninstall: false,
        mac: '',
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
        isoUrl: '',
        ubuntuToolsBuild: false,
        ubuntuToolsTest: false,
        bootcmd: '',
        runcmd: '',
        nfsBuild: false,
        nfsMount: false,
        nfsUnmount: false,
        nfsSh: false,
        logs: '',
      },
    ) {
      // Load environment variables from .env file, overriding existing ones if present.
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });

      // Determine the root path for npm and underpost.
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;

      // Set default values if not provided.
      workflowId = workflowId ? workflowId : 'rpi4mbarm64-iso-ram';
      hostname = hostname ? hostname : workflowId;
      ipAddress = ipAddress ? ipAddress : '192.168.1.191';
      ipFileServer = ipFileServer ? ipFileServer : getLocalIPv4Address();
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
      let macAddress = options.mac ? options.mac : '00:00:00:00:00:00';

      const workflowsConfig = UnderpostBaremetal.API.loadWorkflowsConfig();

      if (!workflowsConfig[workflowId]) {
        throw new Error(`Workflow configuration not found for ID: ${workflowId}`);
      }

      const tftpPrefix = workflowsConfig[workflowId].tftpPrefix || 'rpi4mb';
      // Define the debootstrap architecture.
      let debootstrapArch;

      // Set debootstrap architecture.
      if (workflowsConfig[workflowId].type === 'chroot') {
        const { architecture } = workflowsConfig[workflowId].debootstrap.image;
        debootstrapArch = architecture;
      }

      // Define the database provider ID.
      const dbProviderId = 'postgresql-17';

      // Define the NFS host path based on the environment variable and hostname.
      const nfsHostPath = `${process.env.NFS_EXPORT_PATH}/${hostname}`;

      // Define the TFTP root prefix path based
      const tftpRootPath = `${process.env.TFTP_ROOT}/${tftpPrefix}`;

      // Define the cloud-init directory path.
      const cloudInitDir = `${tftpRootPath}/cloud-init`;

      // Capture metadata for the callback execution, useful for logging and auditing.
      const callbackMetaData = {
        args: { workflowId, ipAddress, hostname, ipFileServer, ipConfig, netmask, dnsServer },
        options,
        runnerHost: { architecture: UnderpostBaremetal.API.getHostArch().alias, ip: getLocalIPv4Address() },
        nfsHostPath,
        tftpRootPath,
      };

      // Log the initiation of the baremetal callback with relevant metadata.
      logger.info('Baremetal callback', callbackMetaData);

      if (options.installPacker) {
        await UnderpostBaremetal.API.installPacker(underpostRoot);
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
          // Use UnderpostRepository to copy files from GitHub
          const result = await UnderpostRepository.API.copyGitUrlDirectoryRecursive({
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

          const workflows = UnderpostBaremetal.API.loadPackerMaasImageBuildWorkflows();
          workflows[workflowId] = workflowConfig;
          UnderpostBaremetal.API.writePackerMaasImageBuildWorkflows(workflows);

          logger.info('\nTemplate extracted successfully!');
          logger.info(`\nAdded configuration for ${workflowId} to engine/baremetal/packer-workflows.json`);
          logger.info('\nNext steps');
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

        const workflow = UnderpostBaremetal.API.loadPackerMaasImageBuildWorkflows()[workflowId];
        if (!workflow) {
          throw new Error(`Packer MAAS image build workflow not found: ${workflowId}`);
        }
        const packerDir = `${underpostRoot}/${workflow.dir}`;
        const tarballPath = `${packerDir}/${workflow.maas.content}`;

        // Build phase (skip if upload-only mode)
        if (options.packerMaasImageBuild) {
          if (shellExec('packer version', { silent: true }).code !== 0) {
            throw new Error('Packer is not installed. Please install Packer to proceed.');
          }

          // Check for QEMU support if building for a different architecture (validator bots case)
          UnderpostBaremetal.API.checkQemuCrossArchSupport(workflow);

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

      if (options.logs === 'cloud-init') {
        shellExec(`tail -f -n 900 ${nfsHostPath}/var/log/cloud-init.log`);
        return;
      }

      if (options.logs === 'cloud-init-machine') {
        shellExec(`tail -f -n 900 ${nfsHostPath}/var/log/cloud-init-output.log`);
        return;
      }

      if (options.logs === 'cloud-init-config') {
        shellExec(`cat ${cloudInitDir}/user-data`);
        shellExec(`cat ${cloudInitDir}/meta-data`);
        shellExec(`cat ${cloudInitDir}/vendor-data`);
        return;
      }

      // Handle NFS shell access option.
      if (options.nfsSh === true) {
        const workflowsConfig = UnderpostBaremetal.API.loadWorkflowsConfig();
        if (!workflowsConfig[workflowId]) {
          throw new Error(`Workflow configuration not found for ID: ${workflowId}`);
        }
        const { debootstrap } = workflowsConfig[workflowId];
        // Copy the chroot command to the clipboard for easy execution.
        if (debootstrap.image.architecture !== callbackMetaData.runnerHost.architecture)
          switch (debootstrap.image.architecture) {
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
        shellExec(`sudo snap stop maas.pebble || true`);
        shellExec(`sudo snap stop maas`);
        shellExec(`sudo snap remove maas --purge || true`);

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
        const { isMounted } = UnderpostBaremetal.API.nfsMountCallback({
          hostname,
          nfsHostPath,
          workflowId,
          mount: true,
        });
        logger.info('Is mount', isMounted);
        return;
      }

      // Handle NFS unmount operation.
      if (options.nfsUnmount === true) {
        const { isMounted } = UnderpostBaremetal.API.nfsMountCallback({
          hostname,
          nfsHostPath,
          workflowId,
          unmount: true,
        });
        logger.info('Is mount', isMounted);
        return;
      }

      // Handle NFS root filesystem build operation.
      if (options.nfsBuild === true) {
        const { isMounted } = UnderpostBaremetal.API.nfsMountCallback({
          hostname,
          nfsHostPath,
          workflowId,
          mount: true,
        });
        logger.info('Is mount', isMounted);

        // Clean and create the NFS host path.
        shellExec(`sudo rm -rf ${nfsHostPath}/*`);
        shellExec(`mkdir -p ${nfsHostPath}`);

        // Perform the first stage of debootstrap.
        {
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
        }

        // Create a podman container to extract QEMU static binaries.
        shellExec(`sudo podman create --name extract multiarch/qemu-user-static`);
        shellExec(`podman ps -a`); // List all podman containers for verification.

        // If cross-architecture, copy the QEMU static binary into the chroot.
        if (debootstrapArch !== callbackMetaData.runnerHost.architecture)
          UnderpostBaremetal.API.crossArchBinFactory({
            nfsHostPath,
            debootstrapArch,
          });

        // Clean up the temporary podman container.
        shellExec(`sudo podman rm extract`);
        shellExec(`podman ps -a`);
        shellExec(`file ${nfsHostPath}/bin/bash`); // Verify the bash executable in the chroot.

        // Perform the second stage of debootstrap within the chroot environment.
        UnderpostBaremetal.API.crossArchRunner({
          nfsHostPath,
          debootstrapArch,
          callbackMetaData,
          steps: [`/debootstrap/debootstrap --second-stage`],
        });
        return;
      }

      // Fetch boot resources and machines if commissioning or listing.

      let resources = JSON.parse(
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} boot-resources read`, {
          silent: true,
          stdout: true,
        }),
      ).map((o) => ({
        id: o.id,
        name: o.name,
        architecture: o.architecture,
      }));
      if (options.ls === true) {
        console.table(resources);
      }
      let machines = JSON.parse(
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} machines read`, {
          stdout: true,
          silent: true,
        }),
      ).map((m) => ({
        system_id: m.interface_set[0].system_id,
        mac_address: m.interface_set[0].mac_address,
        hostname: m.hostname,
        status_name: m.status_name,
      }));
      if (options.ls === true) {
        console.table(machines);
      }

      if (options.clearDiscovered) UnderpostBaremetal.API.removeDiscoveredMachines();

      // Handle remove existing machines from MAAS.
      if (options.removeMachines)
        machines = UnderpostBaremetal.API.removeMachines({
          machines: options.removeMachines === 'all' ? machines : options.removeMachines.split(','),
        });

      // Handle commissioning tasks (placeholder for future implementation).
      if (options.commission === true) {
        let { firmwares, networkInterfaceName, maas, menuentryStr, type } = workflowsConfig[workflowId];
        // Use commissioning config (Ubuntu ephemeral) for PXE boot resources
        const commissioningImage = maas.commissioning;
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
              const bootConfSrc = UnderpostBaremetal.API.bootConfFactory({
                workflowId,
                tftpIp: callbackMetaData.runnerHost.ip,
                tftpPrefixStr: hostname,
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
          const { kernelFilesPaths, resourcesPath } = UnderpostBaremetal.API.kernelFactory({
            resource,
            type,
            nfsHostPath,
            isoUrl: options.isoUrl || workflowsConfig[workflowId].isoUrl,
          });

          const { cmd } = UnderpostBaremetal.API.kernelCmdBootParamsFactory({
            ipClient: ipAddress,
            ipDhcpServer: callbackMetaData.runnerHost.ip,
            ipConfig,
            ipFileServer,
            netmask,
            hostname,
            dnsServer,
            networkInterfaceName,
            fileSystemUrl: kernelFilesPaths.isoUrl,
            type,
            cloudInit: options.cloudInit,
          });

          const grubCfg = UnderpostBaremetal.API.grubFactory({
            menuentryStr,
            kernelPath: `${hostname}/pxe/vmlinuz-efi`,
            initrdPath: `${hostname}/pxe/initrd.img`,
            cmd,
            tftpIp: callbackMetaData.runnerHost.ip,
          });
          shellExec(`mkdir -p ${tftpRootPath}/pxe/grub`);
          fs.writeFileSync(`${tftpRootPath}/pxe/grub/grub.cfg`, grubCfg, 'utf8');

          UnderpostBaremetal.API.updateKernelFiles({
            commissioningImage,
            resourcesPath,
            tftpRootPath,
            kernelFilesPaths,
          });
        }

        // Pass architecture from commissioning or deployment config
        const grubArch = maas.commissioning.architecture;
        UnderpostBaremetal.API.efiGrubModulesFactory({ image: { architecture: grubArch } });

        // Set ownership and permissions for TFTP root.
        shellExec(`sudo chown -R root:root ${process.env.TFTP_ROOT}`);
        shellExec(`sudo sudo chmod 755 ${process.env.TFTP_ROOT}`);

        UnderpostBaremetal.API.httpBootServerRunnerFactory();
      }

      if (options.cloudInit || options.cloudInitUpdate) {
        const { chronyc, networkInterfaceName } = workflowsConfig[workflowId];
        const { timezone, chronyConfPath } = chronyc;
        const authCredentials = UnderpostCloudInit.API.authCredentialsFactory();
        const { cloudConfigSrc } = UnderpostCloudInit.API.configFactory(
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
            runcmd: options.runcmd,
          },
          authCredentials,
        );

        shellExec(`mkdir -p ${cloudInitDir}`);
        fs.writeFileSync(`${cloudInitDir}/user-data`, `#cloud-config\n${cloudConfigSrc}`, 'utf8');
        fs.writeFileSync(`${cloudInitDir}/meta-data`, `instance-id: ${hostname}\nlocal-hostname: ${hostname}`, 'utf8');
        fs.writeFileSync(`${cloudInitDir}/vendor-data`, ``, 'utf8');

        logger.info(`Cloud-init files written to ${cloudInitDir}`);
        if (options.cloudInitUpdate) return;
      }

      if (workflowsConfig[workflowId].type === 'chroot') {
        if (options.ubuntuToolsBuild) {
          UnderpostCloudInit.API.buildTools({
            workflowId,
            nfsHostPath,
            hostname,
            callbackMetaData,
            dev: options.dev,
          });

          const { chronyc, keyboard } = workflowsConfig[workflowId];
          const { timezone, chronyConfPath } = chronyc;
          const systemProvisioning = 'ubuntu';

          UnderpostBaremetal.API.crossArchRunner({
            nfsHostPath,
            debootstrapArch,
            callbackMetaData,
            steps: [
              ...UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].base(),
              ...UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].user(),
              ...UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].timezone({
                timezone,
                chronyConfPath,
              }),
              ...UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].keyboard(keyboard.layout),
            ],
          });
        }

        if (options.ubuntuToolsTest)
          UnderpostBaremetal.API.crossArchRunner({
            nfsHostPath,
            debootstrapArch,
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

      shellExec(`${underpostRoot}/scripts/nat-iptables.sh`, { silent: true });
      // Rebuild NFS server configuration.
      if (workflowsConfig[workflowId].type === 'iso-nfs' || workflowsConfig[workflowId].type === 'chroot')
        UnderpostBaremetal.API.rebuildNfsServer({
          nfsHostPath,
        });

      // Final commissioning steps.
      if (options.commission === true) {
        const { type } = workflowsConfig[workflowId];

        if (type === 'chroot') {
          const { isMounted } = UnderpostBaremetal.API.nfsMountCallback({
            hostname,
            nfsHostPath,
            workflowId,
            mount: true,
          });
          logger.info('Is mount', isMounted);
          if (!isMounted) throw new Error('NFS root filesystem is not mounted');
        }

        const commissionMonitorPayload = {
          workflowId,
          macAddress,
          underpostRoot,
          maas: workflowsConfig[workflowId].maas,
          networkInterfaceName: workflowsConfig[workflowId].networkInterfaceName,
          ipAddress,
          hostname,
        };

        logger.info('Waiting for commissioning...', commissionMonitorPayload);

        await UnderpostBaremetal.API.commissionMonitor(commissionMonitorPayload);

        if (type === 'chroot' && options.cloudInit === true) {
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
     * @method downloadUbuntuLiveISO
     * @description Downloads Ubuntu live ISO and extracts casper boot files for live boot.
     * @param {object} params - Parameters for the method.
     * @param {object} params.resource - The MAAS boot resource object.
     * @param {string} params.architecture - The architecture (arm64 or amd64).
     * @param {string} params.nfsHostPath - The NFS host path to store the ISO and extracted files.
     * @returns {object} An object containing paths to the extracted kernel, initrd, and squashfs.
     * @memberof UnderpostBaremetal
     */
    downloadUbuntuLiveISO({ resource, architecture, nfsHostPath, isoUrl }) {
      const arch = architecture || resource.architecture.split('/')[0];
      const osName = resource.name.split('/')[1]; // e.g., "focal", "jammy", "noble"

      // Map Ubuntu codenames to versions - different versions available for different architectures
      // ARM64 ISOs are hosted on cdimage.ubuntu.com, AMD64 on releases.ubuntu.com
      const versionMap = {
        arm64: {
          focal: '20.04.5', // ARM64 focal only up to 20.04.5 on cdimage
          jammy: '22.04.5',
          noble: '24.04.3', // ubuntu-24.04.3-live-server-arm64+largemem.iso
          bionic: '18.04.6',
        },
        amd64: {
          focal: '20.04.6',
          jammy: '22.04.5',
          noble: '24.04.1',
          bionic: '18.04.6',
        },
      };

      shellExec(`mkdir -p ${nfsHostPath}/casper`);

      const version = (versionMap[arch] && versionMap[arch][osName]) || '20.04.5';
      const majorVersion = version.split('.').slice(0, 2).join('.');

      // Determine ISO filename and URL based on architecture
      // ARM64 ISOs are on cdimage.ubuntu.com, AMD64 on releases.ubuntu.com
      let isoFilename;
      if (arch === 'arm64') {
        isoFilename = `ubuntu-${version}-live-server-arm64${osName === 'noble' ? '+largemem' : ''}.iso`;
      } else {
        isoFilename = `ubuntu-${version}-live-server-amd64.iso`;
      }
      if (!isoUrl) isoUrl = `https://cdimage.ubuntu.com/releases/${majorVersion}/release/${isoFilename}`;
      else isoFilename = isoUrl.split('/').pop();

      const isoPath = `/var/tmp/ubuntu-live-iso/${isoFilename}`;
      const extractDir = `${nfsHostPath}/casper`;

      if (!fs.existsSync(isoPath)) {
        logger.info(`Downloading Ubuntu ${version} live ISO for ${arch}...`);
        logger.info(`URL: ${isoUrl}`);
        logger.info(`This may take a while (typically 1-2 GB)...`);
        shellExec(`wget --progress=bar:force -O ${isoPath} "${isoUrl}"`, { silent: false });
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

      // Mount ISO and extract casper files
      const mountPoint = `${nfsHostPath}/mnt-${osName}-${arch}`;
      shellExec(`mkdir -p ${mountPoint}`);

      // Ensure mount point is not already mounted
      shellExec(`sudo umount ${mountPoint} 2>/dev/null || true`, { silent: true });

      try {
        // Mount the ISO
        shellExec(`sudo mount -o loop,ro ${isoPath} ${mountPoint}`, { silent: false });
        // Verify mount succeeded by checking if casper directory exists
        if (!fs.existsSync(`${mountPoint}/casper`)) {
          throw new Error(`Failed to mount ISO or casper directory not found: ${isoPath}`);
        }
        logger.info(`Mounted ISO at ${mountPoint}`);

        // List casper directory to see what's available
        logger.info(`Checking casper directory contents...`);
        shellExec(`ls -la ${mountPoint}/casper/ 2>/dev/null || echo "casper directory not found"`, { silent: false });

        // Extract casper files
        shellExec(`sudo cp -a ${mountPoint}/casper/* ${extractDir}/`);
        shellExec(`sudo chown -R $(whoami):$(whoami) ${extractDir}`);
        logger.info(`Extracted casper files from ISO`);

        // Rename kernel and initrd to standard names if needed
        if (!fs.existsSync(`${extractDir}/vmlinuz`)) {
          const vmlinuz = shellExec(`ls ${extractDir}/vmlinuz* | head -1`, {
            silent: true,
            stdout: true,
          }).stdout.trim();
          if (vmlinuz) shellExec(`mv ${vmlinuz} ${extractDir}/vmlinuz`);
        }
        if (!fs.existsSync(`${extractDir}/initrd`)) {
          const initrd = shellExec(`ls ${extractDir}/initrd* | head -1`, { silent: true, stdout: true }).stdout.trim();
          if (initrd) shellExec(`mv ${initrd} ${extractDir}/initrd`);
        }
      } finally {
        // Unmount ISO
        shellExec(`sudo umount ${mountPoint}`, { silent: true });
        logger.info(`Unmounted ISO`);
        // Clean up temporary mount point
        shellExec(`rmdir ${mountPoint}`, { silent: true });
      }

      return {
        'vmlinuz-efi': `${extractDir}/vmlinuz`,
        'initrd.img': `${extractDir}/initrd`,
        isoUrl,
      };
    },

    /**
     * @method kernelFactory
     * @description Retrieves kernel, initrd, and root filesystem paths from a MAAS boot resource.
     * @param {object} params - Parameters for the method.
     * @param {object} params.resource - The MAAS boot resource object.
     * @param {boolean} params.useLiveIso - Whether to use Ubuntu live ISO instead of MAAS boot resources.
     * @param {string} params.nfsHostPath - The NFS host path for storing extracted files.
     * @returns {object} An object containing paths to the kernel, initrd, and root filesystem.
     * @memberof UnderpostBaremetal
     */
    kernelFactory({ resource, type, nfsHostPath, isoUrl }) {
      // For disk-based commissioning (casper), use Ubuntu live ISO files
      if (type === 'iso-ram' || type === 'iso-nfs') {
        logger.info('Using Ubuntu live ISO for casper boot (disk-based commissioning)');
        const arch = resource.architecture.split('/')[0];
        const kernelFilesPaths = UnderpostBaremetal.API.downloadUbuntuLiveISO({
          resource,
          architecture: arch,
          nfsHostPath,
          isoUrl,
        });
        const resourcesPath = `/var/snap/maas/common/maas/image-storage/bootloaders/uefi/${arch}`;
        return { kernelFilesPaths, resourcesPath };
      }

      const resourceData = JSON.parse(
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} boot-resource read ${resource.id}`, {
          stdout: true,
          silent: true,
          disableLog: true,
        }),
      );
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
          const tarList = shellExec(`tar -tf ${rootArchivePath}`, { silent: true }).stdout.split('\n');

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
     * @method removeDiscoveredMachines
     * @description Removes all machines in the 'discovered' status from MAAS.
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    removeDiscoveredMachines() {
      logger.info('Removing all discovered machines from MAAS...');
      shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} discoveries clear all=true`);
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
     * @method grubFactory
     * @description Generates the GRUB configuration file content.
     * @param {object} params - The parameters for generating the configuration.
     * @param {string} params.menuentryStr - The title of the menu entry.
     * @param {string} params.kernelPath - The path to the kernel file (relative to TFTP root).
     * @param {string} params.initrdPath - The path to the initrd file (relative to TFTP root).
     * @param {string} params.cmd - The kernel command line parameters.
     * @param {string} params.tftpIp - The IP address of the TFTP server.
     * @returns {string} The generated GRUB configuration content.
     * @memberof UnderpostBaremetal
     */
    grubFactory({ menuentryStr, kernelPath, initrdPath, cmd, tftpIp }) {
      return `
set default="0"
set timeout=10
insmod nfs
insmod gzio
insmod http
insmod tftp
set root=(tftp,${tftpIp})

menuentry '${menuentryStr}' {
    echo "Loading kernel..."
    linux /${kernelPath} ${cmd}
    echo "Loading initrd..."
    initrd /${initrdPath}
    echo "Booting..."
    boot
}
`;
    },

    /**
     * @method httpBootServerRunnerFactory
     * @description Starts a Python HTTP server to serve boot files (like squashfs) which are too large for TFTP.
     * It also configures iptables to allow access.
     * @memberof UnderpostBaremetal
     * @returns {void}
     */
    httpBootServerRunnerFactory() {
      // Start HTTP server to serve squashfs (TFTP is unreliable for large files like 400MB squashfs)
      // Kill any existing HTTP server on port 8888
      shellExec(`sudo pkill -f 'python3 -m http.server 8888' || true`, { silent: true });
      // Start Python HTTP server in background to serve TFTP root
      shellExec(
        `cd ${process.env.TFTP_ROOT} && nohup python3 -m http.server 8888 --bind 0.0.0.0 > /tmp/http-boot-server.log 2>&1 &`,
        { silent: true, async: true },
      );
      // Configure iptables to allow incoming LAN connections on port 8888
      shellExec(`sudo iptables -I INPUT 1 -p tcp -s 192.168.1.0/24 --dport 8888 -m conntrack --ctstate NEW -j ACCEPT`);
      // Option for any host:
      // sudo iptables -I INPUT 1 -p tcp --dport 8888 -m conntrack --ctstate NEW -j ACCEPT

      logger.info(`Started HTTP server on port 8888 serving ${process.env.TFTP_ROOT} for squashfs fetching`);
    },

    /**
     * @method updateKernelFiles
     * @description Copies EFI bootloaders, kernel, and initrd images to the TFTP root path.
     * It also handles decompression of the kernel if necessary for ARM64 compatibility.
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
          const fileType = shellExec(`file ${kernelDest}`, { silent: true }).stdout;
          if (fileType.includes('gzip compressed data')) {
            logger.info(`Decompressing kernel ${file} for ARM64 UEFI compatibility...`);
            shellExec(`sudo mv ${kernelDest} ${kernelDest}.gz`);
            shellExec(`sudo gunzip ${kernelDest}.gz`);
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
     * @param {string} options.type - The type of boot ('iso-ram', 'chroot', 'iso-nfs', etc.).
     * @param {boolean} options.cloudInit - Whether to include cloud-init parameters.
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
        type: '',
        cloudInit: false,
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
        type,
        cloudInit,
      } = options;

      const ipParam =
        `ip=${ipClient}:${ipFileServer}:${ipDhcpServer}:${netmask}:${hostname}` +
        `:${networkInterfaceName ? networkInterfaceName : 'eth0'}:${ipConfig}:${dnsServer}`;
      const nfsOptions = `${
        type === 'chroot'
          ? [
              'rw',
              'tcp',
              'nfsvers=3',
              'nolock',
              'vers=3',
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

      // https://manpages.ubuntu.com/manpages/noble/man7/casper.7.html
      const netBootParams = [`netboot=url`];
      if (fileSystemUrl) netBootParams.push(`url=${fileSystemUrl.replace('https', 'http')}`);
      const nfsParams = [`boot=casper`];
      const baseQemuNfsRootParams = [`root=/dev/nfs`];
      const qemuNfsRootParams = [
        `rootfstype=nfs`,
        `rootwait`,
        `fixrtc`,
        `initrd=initrd.img`,
        `netboot=nfs`,
        `init=/sbin/init`,
        // `systemd.mask=systemd-network-generator.service`,
        // `systemd.mask=systemd-networkd.service`,
        // `systemd.mask=systemd-fsck-root.service`,
        // `systemd.mask=systemd-udev-trigger.service`,
      ];

      const kernelParams = [
        `rw`,
        // `ro`,
        `ignore_uuid`,
        `ipv6.disable=1`,
        // `console=serial0,115200`,
        // `console=tty1`,
        // `casper-getty`,
        // `layerfs-path=filesystem.squashfs`,
        // `root=/dev/ram0`,
        // `toram`,
        // 'nomodeset',
        // `net.ifnames=0`, // only networkInterfaceName = eth0
        // `biosdevname=0`, // only networkInterfaceName = eth0
        // `editable_rootfs=tmpfs`,
        // `ramdisk_size=3550000`,
        // `cma=120M`,
        // `root=/dev/sda1`, // rpi4 usb port unit
        // `fixrtc`,
        // `overlayroot=tmpfs`,
        // `overlayroot_cfgdisk=disabled`,
        // `ds=nocloud-net;s=http://${ipHost}:8888/${hostname}/pxe/`,
      ];

      if (cloudInit) {
        kernelParams.push(`ds=nocloud-net;s=http://${ipFileServer}:8888/${hostname}/cloud-init/`);
      }

      let cmd = [];
      if (type === 'iso-ram') {
        cmd = [ipParam, ...netBootParams, ...kernelParams];
      } else if (type === 'chroot') {
        cmd = [...baseQemuNfsRootParams, nfsRootParam, ipParam, ...qemuNfsRootParams, ...kernelParams];
      } else if (type === 'iso-nfs') {
        cmd = [ipParam, nfsRootParam, ...nfsParams, ...kernelParams];
      } else {
        cmd = [ipParam, nfsRootParam, ...nfsParams, ...kernelParams];
      }

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
     * @param {object} params.maas - MAAS configuration details.
     * @param {string} params.networkInterfaceName - The name of the network interface.
     * @param {string} params.hostname - The desired hostname for the machine.
     * @param {string} params.ipAddress - The IP address of the machine (used if MAC is all zeros).
     * @param {string} params.workflowId - The workflow identifier for hostname prefixing.
     * @returns {Promise<void>} A promise that resolves when commissioning is initiated or after a delay.
     * @memberof UnderpostBaremetal
     */
    async commissionMonitor({ macAddress, maas, networkInterfaceName, hostname, ipAddress, workflowId }) {
      {
        // Query observed discoveries from MAAS.
        const discoveries = JSON.parse(
          shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} discoveries read`, {
            silent: true,
            stdout: true,
          }),
        );

        // Log discovered IPs for visibility.
        console.log(discoveries.map((d) => d.ip).join(' | '));

        // Iterate through discoveries to find a matching MAC address.
        for (const discovery of discoveries) {
          const machine = {
            architecture: (maas.commissioning?.architecture || 'arm64/generic').match('amd')
              ? 'amd64/generic'
              : 'arm64/generic',
            mac_address: discovery.mac_address,
            hostname: discovery.hostname
              ? discovery.hostname
              : discovery.mac_organization
                ? discovery.mac_organization
                : discovery.domain
                  ? discovery.domain
                  : `generic-host-${s4()}${s4()}`,
            power_type: 'manual',
            mac_addresses: discovery.mac_address,
            ip: discovery.ip,
          };
          machine.hostname = machine.hostname.replaceAll(' ', '').replaceAll('.', ''); // Sanitize hostname.

          console.log(
            'mac target:'.green + macAddress,
            'mac discovered:'.green + machine.mac_addresses,
            'ip target:'.green + ipAddress,
            'ip discovered:'.green + discovery.ip,
            'hostname:'.green + machine.hostname,
          );

          if (machine.mac_addresses === macAddress && (!ipAddress || discovery.ip === ipAddress))
            try {
              machine.hostname = `${hostname}`;
              machine.mac_address = macAddress;

              logger.info('Machine discovered! Creating in MAAS...', machine);

              // Create a new machine in MAAS.
              let newMachine = shellExec(
                `maas ${process.env.MAAS_ADMIN_USERNAME} machines create ${Object.keys(machine)
                  .map((k) => `${k}="${machine[k]}"`)
                  .join(' ')}`,
                {
                  silent: true,
                  stdout: true,
                },
              );
              newMachine = { discovery, machine: JSON.parse(newMachine) };
              logger.info('Machine created successfully:', newMachine.machine.system_id);

              for (const discoverInterfaceName of ['eth0' /* networkInterfaceName */]) {
                const jsonInterfaceData = shellExec(
                  `maas ${process.env.MAAS_ADMIN_USERNAME} interface read ${newMachine.machine.boot_interface.system_id} ${discoverInterfaceName}`,
                  {
                    silent: true,
                    stdout: true,
                  },
                );
                try {
                  const interfaceData = JSON.parse(jsonInterfaceData);
                  logger.info('Interface data:', { discoverInterfaceName, interfaceData });
                } catch (error) {
                  console.log(error);
                  logger.error(error, { discoverInterfaceName, jsonInterfaceData });
                }
              }
            } catch (error) {
              logger.error('Error during machine commissioning:', error);
              logger.error(error.stack);
            } finally {
              return;
            }
        }
        await timer(1000);
        await UnderpostBaremetal.API.commissionMonitor({
          networkInterfaceName,
          hostname,
          ipAddress,
          macAddress,
          maas,
          workflowId,
        });
      }
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
     * @memberof UnderpostBaremetal
     * @returns {Array<object>} An empty array after machines are removed.
     */
    removeMachines({ machines }) {
      for (const machine of machines) {
        // Handle both string system_ids and machine objects
        const systemId = typeof machine === 'string' ? machine : machine.system_id;
        logger.info(`Removing machine: ${systemId}`);
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} machine delete ${systemId}`);
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
      shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} discoveries clear all=true`);
      if (force === true) {
        shellExec(`maas ${process.env.MAAS_ADMIN_USERNAME} discoveries scan force=true`);
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
      await UnderpostBaremetal.API.macMonitor({ nfsHostPath });
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
    crossArchBinFactory({ nfsHostPath, debootstrapArch }) {
      switch (debootstrapArch) {
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
          logger.warn(`Unsupported debootstrap architecture: ${debootstrapArch}`);
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
    crossArchRunner({ nfsHostPath, debootstrapArch, callbackMetaData, steps }) {
      // Render the steps with logging for better visibility during execution.
      steps = UnderpostBaremetal.API.stepsRender(steps, false);

      let qemuCrossArchBash = '';
      // Determine if QEMU is needed for cross-architecture execution.
      if (debootstrapArch !== callbackMetaData.runnerHost.architecture)
        switch (debootstrapArch) {
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
     * @memberof UnderpostBaremetal
     * @returns {{isMounted: boolean}} An object indicating whether any NFS path is currently mounted.
     */
    nfsMountCallback({ hostname, nfsHostPath, workflowId, mount, unmount }) {
      // Mount binfmt_misc filesystem.
      if (mount) UnderpostBaremetal.API.mountBinfmtMisc();
      let isMounted = false;
      const mountCmds = [];
      const workflowsConfig = UnderpostBaremetal.API.loadWorkflowsConfig();
      if (!workflowsConfig[workflowId]) {
        throw new Error(`Workflow configuration not found for ID: ${workflowId}`);
      }
      if (workflowsConfig[workflowId].type === 'chroot') {
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
              if (!isMounted) isMounted = true; // Set overall mounted status.
              logger.warn('Nfs path already mounted', mountPath);
              if (unmount === true) {
                // Unmount if requested.
                mountCmds.push(`sudo umount ${hostMountPath}`);
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

        if (!isMounted) {
          // if all path unmounted, set ownership and permissions for the NFS host path.
          shellExec(`sudo chown -R $(whoami):$(whoami) ${nfsHostPath}`);
          shellExec(`sudo chmod -R 755 ${nfsHostPath}`);
        }
        for (const mountCmd of mountCmds) shellExec(mountCmd);
        if (mount) isMounted = true;
      }
      return { isMounted };
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
          // Configure APT sources for Ubuntu ports.
          `cat <<SOURCES | tee /etc/apt/sources.list
deb http://ports.ubuntu.com/ubuntu-ports noble main restricted universe multiverse
deb http://ports.ubuntu.com/ubuntu-ports noble-updates main restricted universe multiverse
deb http://ports.ubuntu.com/ubuntu-ports noble-security main restricted universe multiverse
SOURCES`,

          // Update package lists and perform a full system upgrade.
          `apt update -qq`,
          `apt -y full-upgrade`,
          // Install essential development and system utilities.
          `apt install -y build-essential xinput x11-xkb-utils usbutils uuid-runtime`,
          'apt install -y linux-image-generic',

          // Install cloud-init, systemd, SSH, sudo, locales, udev, and networking tools.
          `apt install -y systemd-sysv openssh-server sudo locales udev util-linux systemd-sysv iproute2 netplan.io ca-certificates curl wget chrony`,
          `ln -sf /lib/systemd/systemd /sbin/init`, // Ensure systemd is the init system.

          `apt-get update`,
          `DEBIAN_FRONTEND=noninteractive apt-get install -y apt-utils`, // Install apt-utils non-interactively.
          `DEBIAN_FRONTEND=noninteractive apt-get install -y tzdata kmod keyboard-configuration console-setup iputils-ping`, // Install timezone data, kernel modules, and network tools.
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

        if (shellExec('test -x /usr/local/bin/qemu-system-aarch64', { silent: true }).code === 0) {
          qemuAarch64Path = '/usr/local/bin/qemu-system-aarch64';
        } else if (shellExec('which qemu-system-aarch64', { silent: true }).code === 0) {
          qemuAarch64Path = shellExec('which qemu-system-aarch64', { silent: true }).stdout.trim();
        }

        if (!qemuAarch64Path) {
          throw new Error(
            'qemu-system-aarch64 is not installed. Please install it to build ARM64 images on x86_64 hosts.\n' +
              'Run: node bin baremetal --dev --install-packer',
          );
        }

        logger.info(`Found qemu-system-aarch64 at: ${qemuAarch64Path}`);

        // Verify that the installed qemu supports the 'virt' machine type (required for arm64)
        const machineHelp = shellExec(`${qemuAarch64Path} -machine help`, { silent: true }).stdout;
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

        if (shellExec('test -x /usr/local/bin/qemu-system-x86_64', { silent: true }).code === 0) {
          qemuX86Path = '/usr/local/bin/qemu-system-x86_64';
        } else if (shellExec('which qemu-system-x86_64', { silent: true }).code === 0) {
          qemuX86Path = shellExec('which qemu-system-x86_64', { silent: true }).stdout.trim();
        }

        if (!qemuX86Path) {
          throw new Error(
            'qemu-system-x86_64 is not installed. Please install it to build x86_64 images on aarch64 hosts.\n' +
              'Run: node bin baremetal --dev --install-packer',
          );
        }

        logger.info(`Found qemu-system-x86_64 at: ${qemuX86Path}`);

        // Verify that the installed qemu supports the 'pc' or 'q35' machine type (required for x86_64)
        const machineHelp = shellExec(`${qemuX86Path} -machine help`, { silent: true }).stdout;
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

MAC_ADDRESS=${macAddress}

# OTP MAC address override
#MAC_ADDRESS_OTP=0,1

# ─────────────────────────────────────────────────────────────
# Static IP configuration (bypasses DHCP completely)
# ─────────────────────────────────────────────────────────────
CLIENT_IP=${clientIp}
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
