/**
 * Cloud-init module for managing the generation and deployment of cloud-init configuration files
 * and associated scripts for baremetal provisioning.
 * @module src/cli/cloud-init.js
 * @namespace UnderpostCloudInit
 */

import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import { loggerFactory } from '../server/logger.js';
import { getNpmRootPath } from '../server/conf.js';
import Underpost from '../index.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostCloudInit
 * @description Manages the generation and deployment of cloud-init configuration files
 * and associated scripts for baremetal provisioning. This class provides methods
 * to build various shell scripts and a cloud-init configuration file tailored
 * for MAAS (Metal as a Service) integration.
 * @memberof UnderpostCloudInit
 */
class UnderpostCloudInit {
  static API = {
    /**
     * @method buildTools
     * @description Builds and writes various shell scripts and configuration files
     * to the NFS host path, which are then used by the target baremetal machine
     * during the cloud-init process.
     * @param {object} params - The parameters for building the tools.
     * @param {string} params.workflowId - The identifier for the specific workflow configuration.
     * @param {string} params.nfsHostPath - The base path on the NFS host where tools will be written.
     * @param {string} params.hostname - The hostname of the target baremetal machine.
     * @param {object} params.callbackMetaData - Metadata about the callback, used for dynamic configuration.
     * @param {boolean} params.dev - Development mode flag.
     * @returns {void}
     * @memberof UnderpostCloudInit
     */
    buildTools({ workflowId, nfsHostPath, hostname, callbackMetaData, dev }) {
      // Destructure workflow configuration for easier access.
      const { chronyc, networkInterfaceName, debootstrap, keyboard } =
        Underpost.baremetal.loadWorkflowsConfig()[workflowId];
      const { timezone, chronyConfPath } = chronyc;
      // Define the specific directory for underpost tools within the NFS host path.
      const nfsHostToolsPath = `${nfsHostPath}/underpost`;

      // Determine the root path for npm and underpost based on development mode.
      const npmRoot = getNpmRootPath();
      const underpostRoot = dev === true ? '.' : `${npmRoot}/underpost`;
      const systemProvisioning = 'ubuntu';
      // Use a switch statement to handle different system provisioning types.
      switch (systemProvisioning) {
        case 'ubuntu': {
          // Ensure the target directory for tools is clean and exists.
          if (fs.existsSync(`${nfsHostToolsPath}`)) fs.removeSync(`${nfsHostToolsPath}`);
          fs.mkdirSync(`${nfsHostToolsPath}`, { recursive: true });

          // Build and write the date configuration script.
          logger.info('Build', `${nfsHostToolsPath}/date.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/date.sh`,
            Underpost.baremetal.stepsRender(
              Underpost.baremetal.systemProvisioningFactory[systemProvisioning].timezone({
                timezone,
                chronyConfPath,
              }),
              false,
            ),
            'utf8',
          );

          // Build and write the keyboard configuration script.
          logger.info('Build', `${nfsHostToolsPath}/keyboard.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/keyboard.sh`,
            Underpost.baremetal.stepsRender(
              Underpost.baremetal.systemProvisioningFactory[systemProvisioning].keyboard(keyboard.layout),
              false,
            ),
            'utf8',
          );

          // Build and write the hosts file configuration script.
          logger.info('Build', `${nfsHostToolsPath}/host.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/host.sh`,
            `echo -e "127.0.0.1   localhost\n127.0.1.1   ${hostname}" | tee -a /etc/hosts`,
            'utf8',
          );

          // Build and write the DNS configuration script.
          logger.info('Build', `${nfsHostToolsPath}/dns.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/dns.sh`,
            `rm /etc/resolv.conf
echo 'nameserver 8.8.8.8' > /run/systemd/resolve/stub-resolv.conf
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf`,
            'utf8',
          );

          // Build and write the main startup script for cloud-init.
          logger.info('Build', `${nfsHostToolsPath}/start.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/start.sh`,
            `#!/bin/bash
set -x
# sudo cloud-init --all-stages
${Underpost.baremetal.stepsRender(
  [
    `/underpost/date.sh`,
    `sleep 3`,
    `/underpost/reset.sh`,
    `sleep 3`,
    `cloud-init init --local`,
    `sleep 3`,
    `cloud-init init`,
    `sleep 3`,
    `cloud-init modules --mode=config`,
    `sleep 3`,
    `cloud-init modules --mode=final`,
  ],
  false,
)}`,
            'utf8',
          );

          // Build and write the cloud-init reset script.
          logger.info('Build', `${nfsHostToolsPath}/reset.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/reset.sh`,
            `sudo cloud-init clean --seed --configs all --machine-id # --logs
sudo rm -rf /var/lib/cloud/*
echo '' > /var/log/cloud-init.log
echo '' > /var/log/cloud-init-output.log`,
            'utf8',
          );

          // Build and write the cloud-init help script.
          logger.info('Build', `${nfsHostToolsPath}/help.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/help.sh`,
            `echo "=== Cloud init utils ==="
echo "sudo cloud-init --all-stages"
echo "sudo cloud-init clean --logs --seed --configs all --machine-id --reboot"
echo "sudo cloud-init init --local"
echo "sudo cloud-init init"
echo "sudo cloud-init modules --mode=config"
echo "sudo cloud-init modules --mode=final"`,
            'utf8',
          );

          // Build and write the test script for verifying configuration.
          logger.info('Build', `${nfsHostToolsPath}/test.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/test.sh`,
            `echo -e "\necho -e "\n=== Registered users ==="
cut -d: -f1 /etc/passwd
=== Current date/time ==="
date '+%Y-%m-%d %H:%M:%S'
echo -e "\n=== Timezone Configuration ==="
timedatectl status
echo -e "\n=== Chrony Synchronization Status ==="
chronyc tracking
echo -e "\n=== Chrony Sources ==="
chronyc sources
echo -e "\n=== Keyboard layout ==="
cat /etc/default/keyboard`,
            'utf8',
          );

          // Build and write the shutdown script.
          logger.info('Build', `${nfsHostToolsPath}/shutdown.sh`);
          fs.writeFileSync(`${nfsHostToolsPath}/shutdown.sh`, `sudo shutdown -h now`, 'utf8');

          // Build and write the MAC address retrieval script.
          logger.info('Build', `${nfsHostToolsPath}/mac.sh`);
          fs.writeFileSync(
            `${nfsHostToolsPath}/mac.sh`,
            `echo "$(cat /sys/class/net/${networkInterfaceName}/address)" > /underpost/mac`,
            'utf8',
          );

          // Copy the device scan script from manifests.
          logger.info('Build', `${nfsHostToolsPath}/device_scan.sh`);
          fs.copySync(`${underpostRoot}/scripts/device-scan.sh`, `${nfsHostToolsPath}/device_scan.sh`);

          // Import SSH keys for root user.
          logger.info('Import ssh keys');
          shellExec(`sudo rm -rf ${nfsHostPath}/root/.ssh`);
          shellExec(`sudo rm -rf ${nfsHostPath}/home/root/.ssh`); // Ensure home root .ssh is also clean.
          logger.info('Copy', `/root/.ssh -> ${nfsHostPath}/root/.ssh`);
          fs.copySync(`/root/.ssh`, `${nfsHostPath}/root/.ssh`);

          break;
        }
        default:
          // Throw an error if an unsupported system provisioning type is provided.
          throw new Error('Invalid system provisioning: ' + systemProvisioning);
      }
    },

    /**
     * @method configFactory
     * @description Generates the cloud-init configuration file
     * for MAAS integration. This configuration includes hostname, network settings,
     * user accounts, SSH keys, timezone, NTP, and various cloud-init modules.
     * @param {object} params - The parameters for generating the configuration.
     * @param {string} params.controlServerIp - The IP address of the MAAS control server.
     * @param {string} params.hostname - The hostname of the target baremetal machine.
     * @param {string} params.commissioningDeviceIp - The IP address to assign to the commissioning device.
     * @param {string} params.gatewayip - The gateway IP address for the network.
     * @param {string} params.mac - The MAC address of the network interface.
     * @param {string} params.timezone - The timezone to set for the machine.
     * @param {string} params.chronyConfPath - The path to the Chrony configuration file.
     * @param {string} params.networkInterfaceName - The name of the primary network interface.
     * @param {boolean} params.ubuntuToolsBuild - Flag to determine if Ubuntu tools should be built.
     * @param {string} [params.bootcmd] - Optional custom commands to run during boot.
     * @param {string} [params.runcmd] - Optional custom commands to run during first boot.
     * @param {object} [params.write_files] - Optional array of files to write during cloud-init, each with path, permissions, owner, and content.
     * @param {string} [params.write_files[].path] - The file path where the content will be written on the target machine.
     * @param {string} [params.write_files[].permissions] - The file permissions to set for the written file (e.g., '0644').
     * @param {string} [params.write_files[].owner] - The owner of the written file (e.g., 'root:root').
     * @param {string} [params.write_files[].content] - The content to write into the file.
     * @param {boolean} [params.write_files[].defer] - Whether to defer writing the file until the 'final' stage of cloud-init.
     * @param {object} [authCredentials={}] - Optional MAAS authentication credentials.
     * @returns {object} The generated cloud-init configuration content.
     * @memberof UnderpostCloudInit
     */
    configFactory(
      {
        controlServerIp,
        hostname,
        commissioningDeviceIp,
        gatewayip,
        mac,
        timezone,
        chronyConfPath,
        networkInterfaceName,
        ubuntuToolsBuild,
        bootcmd: bootcmdParam,
        runcmd: runcmdParam,
        write_files = [
          {
            path: '',
            permissions: '',
            owner: '',
            content: '',
            defer: false,
          },
        ],
      },
      authCredentials = { consumer_key: '', consumer_secret: '', token_key: '', token_secret: '' },
    ) {
      const { consumer_key, consumer_secret, token_key, token_secret } = authCredentials;

      let bootcmd = [
        'echo "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"',
        'echo "Init bootcmd"',
        'echo "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"',
      ];

      if (ubuntuToolsBuild) {
        bootcmd = [
          ...bootcmd,
          ...Underpost.baremetal
            .stepsRender([`/underpost/dns.sh`, `/underpost/host.sh`, `/underpost/mac.sh`, `cat /underpost/mac`], false)
            .split('\n'),
        ];
      }

      if (bootcmdParam) {
        bootcmd = [...bootcmd, ...bootcmdParam.split(',')];
      }

      let runcmd = [
        'echo "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"',
        'echo "Init runcmd"',
        'systemctl enable --now ssh',
        'echo "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"',
      ];

      if (runcmdParam) {
        runcmd = [...runcmd, ...runcmdParam.split(',')];
      }

      const cloudConfigSrc = Underpost.cloudInit.generateCloudConfig({
        hostname,
        fqdn: `${hostname}.maas`,
        datasource_list: ['MAAS'],
        datasource: {
          MAAS: {
            metadata_url: `http://${controlServerIp}:5240/MAAS/metadata/`,
            ...(authCredentials?.consumer_key
              ? {
                  consumer_key,
                  consumer_secret,
                  token_key,
                  token_secret,
                }
              : {}),
          },
        },
        users: [
          {
            name: process.env.MAAS_ADMIN_USERNAME,
            sudo: ['ALL=(ALL) NOPASSWD:ALL'],
            shell: '/bin/bash',
            lock_passwd: true,
            groups: 'sudo,users,admin,wheel,lxd',
            // plain_text_passwd: process.env.MAAS_ADMIN_USERNAME,
            ssh_authorized_keys: [fs.readFileSync(`/home/dd/engine/engine-private/deploy/id_rsa.pub`, 'utf8')],
          },
        ],
        disable_root: true,
        ssh_pwauth: false,
        timezone,
        ntp: {
          enabled: true,
          servers: [process.env.MAAS_NTP_SERVER],
          ntp_client: 'chrony',
          config: { confpath: chronyConfPath },
        },
        package_update: true,
        package_upgrade: true,
        packages: [
          'git',
          'htop',
          'curl',
          'wget',
          'chrony',
          'lldpd',
          'lshw',
          'smartmontools',
          'net-tools',
          'util-linux',
          'openssh-server',
        ],
        resize_rootfs: false,
        growpart: { mode: 'off' },
        network: {
          version: 2,
          ethernets: {
            [networkInterfaceName]: {
              match: { macaddress: mac },
              mtu: 1500,
              'set-name': networkInterfaceName,
              dhcp4: false,
              addresses: [`${commissioningDeviceIp}/24`],
              routes: [{ to: 'default', via: gatewayip }],
              nameservers: { addresses: [process.env.MAAS_DNS] },
            },
          },
        },
        final_message: '====== Cloud init finished ======',
        bootcmd,
        runcmd,
        write_files,
        preserve_hostname: false,
        cloud_init_modules: [
          // minimal for commissioning
          'bootcmd', // run very early commands (useful to inject things)
          'write-files', // write files (commissioning scripts, helpers)
          'set_hostname',
          'update_hostname',
          'update_etc_hosts',
          'ca-certs',
          'rsyslog', // remote logging for diagnosis
          'ssh', // enable/configure SSH for temporary access

          // optional modules (commented out by default)
          'migrator',
          'seed_random',
          'growpart',
          'resizefs',
          'users-groups',
        ],
        cloud_config_modules: [
          // minimal so MAAS can run commissioning scripts
          'runcmd', // commissioning / final script execution
          'mounts', // mount devices during commissioning if needed
          'ntp', // optional — enable if you want time sync

          // typically not required for basic commissioning (commented)
          'emit_upstart',
          'disk_setup',
          'ssh-import-id',
          'locale',
          'set-passwords',
          'grub-dpkg',
          'apt-pipelining',
          'apt-configure',
          'package-update-upgrade-install', // heavy; do NOT enable by default
          'landscape',
          'timezone',
          'puppet',
          'chef',
          'salt-minion',
          'mcollective',
          'disable-ec2-metadata',
          'byobu',
          'ssh-import-id', // duplicate in original list
        ],
        cloud_final_modules: [
          // minimal suggestions so final scripts run and node reports status
          'scripts-per-boot', // scripts to run each boot (useful for testing)
          'final-message', // useful for logs/reporting

          // optional / commented
          'rightscale_userdata',
          'scripts-vendor',
          'scripts-per-once',
          'scripts-user',
          'ssh-authkey-fingerprints',
          'keys-to-console',
          'power-state-change', // use carefully (can poweroff/reboot)
        ],
      });

      return { cloudConfigSrc };
    },

    /**
     * @method generateCloudConfig
     * @description Generates a generic cloud-init configuration string.
     * @param {object} config - Configuration object.
     * @returns {string} Cloud-init YAML content.
     * @memberof UnderpostCloudInit
     */
    generateCloudConfig(config) {
      const {
        hostname,
        fqdn,
        prefer_fqdn_over_hostname,
        datasource_list,
        datasource,
        users,
        timezone,
        ntp,
        keyboard,
        ssh,
        ssh_pwauth,
        package_update,
        package_upgrade,
        package_reboot_if_required,
        packages,
        resize_rootfs,
        growpart,
        network,
        runcmd,
        write_files,
        final_message,
        bootcmd,
        disable_root,
        preserve_hostname,
        cloud_init_modules,
        cloud_config_modules,
        cloud_final_modules,
      } = config;

      const yaml = [];
      yaml.push('#cloud-config');
      if (hostname) yaml.push(`hostname: ${hostname}`);
      if (fqdn) yaml.push(`fqdn: ${fqdn}`);
      if (prefer_fqdn_over_hostname) yaml.push(`prefer_fqdn_over_hostname: ${prefer_fqdn_over_hostname}`);

      if (datasource_list) yaml.push(`datasource_list: ${JSON.stringify(datasource_list)}`);
      if (datasource) {
        yaml.push('datasource:');
        for (const [key, value] of Object.entries(datasource)) {
          yaml.push(`  ${key}:`);
          for (const [k, v] of Object.entries(value)) {
            yaml.push(`    ${k}: ${v}`);
          }
        }
      }

      if (users) {
        yaml.push('users:');
        users.forEach((user) => {
          yaml.push(`- name: ${user.name}`);
          if (user.sudo) yaml.push(`  sudo: ${JSON.stringify(user.sudo)}`);
          if (user.shell) yaml.push(`  shell: ${user.shell}`);
          if (user.lock_passwd !== undefined) yaml.push(`  lock_passwd: ${user.lock_passwd}`);
          if (user.groups) yaml.push(`  groups: ${user.groups}`);
          if (user.plain_text_passwd) yaml.push(`  plain_text_passwd: '${user.plain_text_passwd}'`);
          if (user.ssh_authorized_keys) {
            yaml.push(`  ssh_authorized_keys:`);
            user.ssh_authorized_keys.forEach((key) => yaml.push(`    - ${key}`));
          }
        });
      }

      if (timezone) yaml.push(`timezone: ${timezone}`);

      if (ntp) {
        yaml.push('ntp:');
        if (ntp.enabled !== undefined) yaml.push(`  enabled: ${ntp.enabled}`);
        if (ntp.servers) {
          yaml.push('  servers:');
          ntp.servers.forEach((s) => yaml.push(`    - ${s}`));
        }
        if (ntp.ntp_client) yaml.push(`  ntp_client: ${ntp.ntp_client}`);
        if (ntp.config) {
          yaml.push('  config:');
          if (ntp.config.confpath) yaml.push(`    confpath: ${ntp.config.confpath}`);
        }
      }

      if (keyboard) {
        yaml.push('keyboard:');
        if (keyboard.layout) yaml.push(`  layout: ${keyboard.layout}`);
      }

      if (ssh) {
        yaml.push('ssh:');
        if (ssh['install-server'] !== undefined) yaml.push(`  install-server: ${ssh['install-server']}`);
        if (ssh['allow-pw'] !== undefined) yaml.push(`  allow-pw: ${ssh['allow-pw']}`);
      }
      if (ssh_pwauth !== undefined) yaml.push(`ssh_pwauth: ${ssh_pwauth}`);

      if (package_update !== undefined) yaml.push(`package_update: ${package_update}`);
      if (package_upgrade !== undefined) yaml.push(`package_upgrade: ${package_upgrade}`);
      if (package_reboot_if_required !== undefined)
        yaml.push(`package_reboot_if_required: ${package_reboot_if_required}`);

      if (packages) {
        yaml.push('packages:');
        packages.forEach((p) => yaml.push(`  - ${p}`));
      }

      if (resize_rootfs !== undefined) yaml.push(`resize_rootfs: ${resize_rootfs}`);
      if (growpart) {
        yaml.push('growpart:');
        if (growpart.mode) yaml.push(`  mode: "${growpart.mode}"`);
      }

      if (network) {
        yaml.push('network:');
        yaml.push(`  version: ${network.version}`);
        if (network.ethernets) {
          yaml.push('  ethernets:');
          for (const [iface, conf] of Object.entries(network.ethernets)) {
            yaml.push(`    ${iface}:`);
            if (conf.match) {
              yaml.push('      match:');
              if (conf.match.macaddress) yaml.push(`        macaddress: "${conf.match.macaddress}"`);
            }
            if (conf.mtu) yaml.push(`      mtu: ${conf.mtu}`);
            if (conf['set-name']) yaml.push(`      set-name: ${conf['set-name']}`);
            if (conf.dhcp4 !== undefined) yaml.push(`      dhcp4: ${conf.dhcp4}`);
            if (conf.addresses) {
              yaml.push('      addresses:');
              conf.addresses.forEach((a) => yaml.push(`        - ${a}`));
            }
            if (conf.routes) {
              yaml.push('      routes:');
              conf.routes.forEach((r) => {
                yaml.push(`        - to: ${r.to}`);
                yaml.push(`          via: ${r.via}`);
              });
            }
            if (conf.nameservers) {
              yaml.push('      nameservers:');
              if (conf.nameservers.addresses) {
                yaml.push('        addresses:');
                conf.nameservers.addresses.forEach((a) => yaml.push(`          - ${a}`));
              }
            }
          }
        }
      }

      if (runcmd) {
        yaml.push('runcmd:');
        runcmd.forEach((cmd) => yaml.push(`  - ${cmd}`));
      }

      if (write_files) {
        yaml.push('write_files:');
        write_files.forEach((file) => {
          yaml.push(`  - path: ${file.path}`);
          if (file.encoding) yaml.push(`    encoding: ${file.encoding}`);
          if (file.owner) yaml.push(`    owner: ${file.owner}`);
          if (file.permissions) yaml.push(`    permissions: '${file.permissions}'`);
          if (file.defer) yaml.push(`    defer: ${file.defer}`);
          if (file.content) {
            yaml.push(`    content: |`);
            file.content.split('\n').forEach((line) => yaml.push(`      ${line}`));
          }
        });
      }

      if (final_message) yaml.push(`final_message: "${final_message}"`);

      if (bootcmd) {
        yaml.push('bootcmd:');
        bootcmd.forEach((cmd) => yaml.push(`  - ${cmd}`));
      }

      if (disable_root !== undefined) yaml.push(`disable_root: ${disable_root}`);
      if (preserve_hostname !== undefined) yaml.push(`preserve_hostname: ${preserve_hostname}`);

      if (cloud_init_modules) {
        yaml.push('cloud_init_modules:');
        cloud_init_modules.forEach((m) => yaml.push(`  - ${m}`));
      }
      if (cloud_config_modules) {
        yaml.push('cloud_config_modules:');
        cloud_config_modules.forEach((m) => yaml.push(`  - ${m}`));
      }
      if (cloud_final_modules) {
        yaml.push('cloud_final_modules:');
        cloud_final_modules.forEach((m) => yaml.push(`  - ${m}`));
      }

      return yaml.join('\n');
    },

    /**
     * @method httpServerStaticFactory
     * @description Writes cloud-init files (user-data, meta-data, vendor-data) to the bootstrap HTTP server path.
     * @param {object} params
     * @param {string} params.bootstrapHttpServerPath
     * @param {string} params.hostname
     * @param {string} params.cloudConfigSrc
     * @param {string} [params.vendorData='']
     * @memberof UnderpostCloudInit
     * @returns {void}
     */
    httpServerStaticFactory({ bootstrapHttpServerPath, hostname, cloudConfigSrc, vendorData = '' }) {
      if (!cloudConfigSrc) return;
      const dir = `${bootstrapHttpServerPath}/${hostname}/cloud-init`;
      shellExec(`mkdir -p ${dir}`);
      fs.writeFileSync(`${dir}/user-data`, cloudConfigSrc, 'utf8');
      fs.writeFileSync(`${dir}/meta-data`, `instance-id: ${hostname}\nlocal-hostname: ${hostname}`, 'utf8');
      fs.writeFileSync(`${dir}/vendor-data`, vendorData, 'utf8');
      logger.info(`Cloud-init files written to ${dir}`);
    },

    /**
     * @method kernelParamsFactory
     * @description Generates the kernel parameters for the target machine's bootloader configuration,
     * including the necessary parameters to enable cloud-init with a specific configuration URL and logging settings.
     * @param {array} cmd - The existing array of kernel parameters to which cloud-init parameters will be appended.
     * @param {object} options - Options for generating kernel parameters.
     * @param {string} options.ipDhcpServer - The IP address of the DHCP server.
     * @param {object} [options.machine] - The machine information, including system_id for constructing the cloud-init configuration URL.
     * @param {string} [options.machine.system_id] - The unique identifier of the machine, used to fetch the correct cloud-init preseed configuration from MAAS.
     * @return {array} The modified array of kernel parameters with cloud-init parameters included.
     * @memberof UnderpostCloudInit
     */
    kernelParamsFactory(
      macAddress,
      cmd = [],
      options = {
        ipDhcpServer: '',
        bootstrapHttpServerPort: 8888,
        hostname: '',
        machine: {
          system_id: '',
        },
        authCredentials: { consumer_key: '', consumer_secret: '', token_key: '', token_secret: '' },
      },
    ) {
      const { ipDhcpServer, bootstrapHttpServerPort, hostname } = options;
      const cloudConfigUrl = `http://${ipDhcpServer}:${bootstrapHttpServerPort}/${hostname}/cloud-init/user-data`;
      return cmd.concat([`cloud-config-url=${cloudConfigUrl}`]);
    },
  };
}

export default UnderpostCloudInit;
