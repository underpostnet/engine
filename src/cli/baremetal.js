import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { pbcopy, shellExec } from '../server/process.js';
import dotenv from 'dotenv';
import { loggerFactory } from '../server/logger.js';
import { getLocalIPv4Address } from '../server/dns.js';

const logger = loggerFactory(import.meta);

class UnderpostBaremetal {
  static API = {
    callback(
      workflowId,
      hostname,
      ipAddress,
      options = {
        dev: false,
        controlServerInstall: false,
        controlServerUninstall: false,
        controlServerDbInstall: false,
        controlServerDbUninstall: false,
        commission: false,
        nfsBuild: false,
        nfsUnmount: false,
        nfsSh: false,
      },
    ) {
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      workflowId = workflowId ?? 'rpi4mb';
      hostname = hostname ?? workflowId;
      ipAddress = ipAddress ?? getLocalIPv4Address();

      const dbProviderId = 'postgresql-17';

      const callbackMetaData = {
        args: { hostname, ipAddress, workflowId },
        options,
        runnerHost: { architecture: UnderpostBaremetal.API.getHostArch() },
      };

      logger.info('Baremetal callback', callbackMetaData);

      const nfsHostPath = `${process.env.NFS_EXPORT_PATH}/${hostname}`;

      if (options.nfsSh === true) {
        pbcopy(`sudo chroot ${nfsHostPath} /usr/bin/qemu-aarch64-static /bin/bash`);
        return;
      }

      if (options.controlServerInstall === true) {
        shellExec(`chmod +x ${underpostRoot}/manifests/maas/maas-setup.sh`);
        shellExec(`chmod +x ${underpostRoot}/manifests/maas/nat-iptables.sh`);
        shellExec(`${underpostRoot}/manifests/maas/maas-setup.sh`);
        shellExec(`${underpostRoot}/manifests/maas/nat-iptables.sh`);
      }

      if (options.controlServerUninstall === true) {
        // Stop MAAS services
        shellExec(`sudo snap stop maas.pebble || true`);
        shellExec(`sudo snap stop maas`);
        shellExec(`sudo snap remove maas --purge || true`);

        // Remove Snap residual data
        shellExec(`sudo rm -rf /var/snap/maas`);
        shellExec(`sudo rm -rf ~/snap/maas`);

        // Remove MAAS config and data directories
        shellExec(`sudo rm -rf /etc/maas`);
        shellExec(`sudo rm -rf /var/lib/maas`);
        shellExec(`sudo rm -rf /var/log/maas`);
      }

      if (options.controlServerDbInstall === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} install`);
        shellExec(
          `node ${underpostRoot}/bin/deploy pg-drop-db ${process.env.DB_PG_MAAS_NAME} ${process.env.DB_PG_MAAS_USER}`,
        );
        shellExec(`node ${underpostRoot}/bin/deploy maas db`);
      }
      if (options.controlServerDbUninstall === true) {
        shellExec(`node ${underpostRoot}/bin/deploy ${dbProviderId} uninstall`);
      }

      if (options.nfsUnmount === true) {
        UnderpostBaremetal.API.nfsMountCallback({ hostname, workflowId, unmount: true });
      }

      if (options.nfsBuild === true) {
        const { isMounted } = UnderpostBaremetal.API.nfsMountCallback({ hostname, workflowId });
        if (isMounted) {
          logger.warn('NFS root filesystem is mounted, skipping build.');
          return;
        }
        logger.info('NFS root filesystem is not mounted, building...');

        shellExec(`sudo dnf install -y iptables-legacy`);
        shellExec(`sudo dnf install -y debootstrap`);
        shellExec(`sudo dnf install kernel-modules-extra-$(uname -r)`);
        shellExec(`sudo podman run --rm --privileged multiarch/qemu-user-static --reset -p yes`);
        shellExec(`sudo modprobe binfmt_misc`);
        shellExec(`sudo mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc`);
        shellExec(`sudo rm -rf ${nfsHostPath}/*`);
        shellExec(`mkdir -p ${nfsHostPath}`);
        shellExec(`sudo chown -R root:root ${nfsHostPath}`);

        let debootstrapArch;

        {
          const { architecture, name } = UnderpostBaremetal.API.workflowsConfig[workflowId].debootstrap.image;

          debootstrapArch = architecture;

          shellExec(
            [
              `sudo debootstrap`,
              `--arch=${architecture}`,
              `--variant=minbase`,
              `--foreign`,
              name,
              nfsHostPath,
              `http://ports.ubuntu.com/ubuntu-ports/`,
            ].join(' '),
          );
        }

        shellExec(`sudo podman create --name extract multiarch/qemu-user-static`);
        shellExec(`podman ps -a`);

        if (debootstrapArch !== callbackMetaData.runnerHost.architecture)
          UnderpostBaremetal.API.crossArchBinFactory({
            nfsHostPath,
            debootstrapArch,
          });

        shellExec(`sudo podman rm extract`);
        shellExec(`podman ps -a`);
        shellExec(`file ${nfsHostPath}/bin/bash`); // expected: current arch executable identifier

        UnderpostBaremetal.API.crossArchRunner({
          nfsHostPath,
          debootstrapArch,
          callbackMetaData,
          steps: [`/debootstrap/debootstrap --second-stage`],
        });

        if (!isMounted) {
          UnderpostBaremetal.API.nfsMountCallback({ hostname, workflowId, mount: true });
        }

        {
          const { systemProvisioning, kernelLibVersion, chronyc } = UnderpostBaremetal.API.workflowsConfig[workflowId];
          const { timezone, chronyConfPath } = chronyc;

          UnderpostBaremetal.API.crossArchRunner({
            nfsHostPath,
            debootstrapArch,
            callbackMetaData,
            steps: [
              ...UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].base({
                kernelLibVersion,
              }),
              ...UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].user(),
              ...UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].timezone({
                timezone,
                chronyConfPath,
              }),
              ...UnderpostBaremetal.API.systemProvisioningFactory[systemProvisioning].keyboard(),
            ],
          });
        }
      }

      if (options.commission === true) {
      }
    },

    crossArchBinFactory({ nfsHostPath, debootstrapArch }) {
      switch (debootstrapArch) {
        case 'arm64':
          shellExec(`sudo podman cp extract:/usr/bin/qemu-aarch64-static ${nfsHostPath}/usr/bin/`);
          break;

        case 'amd64':
          shellExec(`sudo podman cp extract:/usr/bin/qemu-x86_64-static ${nfsHostPath}/usr/bin/`);
          break;

        default:
          break;
      }
    },

    crossArchRunner({ nfsHostPath, debootstrapArch, callbackMetaData, steps }) {
      steps = UnderpostBaremetal.API.stepsRender(steps, false);

      let qemuCrossArchBash = '';
      if (debootstrapArch !== callbackMetaData.runnerHost.architecture)
        switch (debootstrapArch) {
          case 'arm64':
            qemuCrossArchBash = '/usr/bin/qemu-aarch64-static ';
            break;

          case 'amd64':
            qemuCrossArchBash = '/usr/bin/qemu-x86_64-static ';
            break;

          default:
            break;
        }
      shellExec(`sudo chroot ${nfsHostPath} ${qemuCrossArchBash}/bin/bash <<'EOF'
${steps}
EOF`);
    },

    stepsRender(steps = [], yaml = true) {
      return steps
        .map(
          (step, i, a) =>
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

    nfsMountCallback({ hostname, workflowId, mount, unmount }) {
      let isMounted = false;
      for (const mountCmd of Object.keys(UnderpostBaremetal.API.workflowsConfig[workflowId].nfs.mounts)) {
        for (const mountPath of UnderpostBaremetal.API.workflowsConfig[workflowId].nfs.mounts[mountCmd]) {
          const hostMountPath = `${process.env.NFS_EXPORT_PATH}/${hostname}${mountPath}`;
          const isPathMounted = !shellExec(`mountpoint ${hostMountPath}`, { silent: true, stdout: true }).match(
            'not a mountpoint',
          );

          if (isPathMounted) {
            if (!isMounted) isMounted = true;
            logger.warn('Nfs path already mounted', mountPath);
            if (unmount === true) {
              shellExec(`sudo umount ${hostMountPath}`);
            }
          } else {
            if (mount === true) {
              shellExec(`sudo mount --${mountCmd} ${mountPath} ${hostMountPath}`);
            } else {
              logger.warn('Nfs path not mounted', mountPath);
            }
          }
        }
      }
      return { isMounted };
    },

    getHostArch() {
      // `uname -m` returns e.g. 'x86_64' or 'aarch64'
      const machine = shellExec('uname -m', { stdout: true }).trim();
      if (machine === 'x86_64') return 'amd64';
      if (machine === 'aarch64') return 'arm64';
      throw new Error(`Unsupported host architecture: ${machine}`);
    },

    systemProvisioningFactory: {
      ubuntu: {
        base: ({ kernelLibVersion }) => [
          `cat <<EOF | tee /etc/apt/sources.list
deb http://ports.ubuntu.com/ubuntu-ports noble main restricted universe multiverse
deb http://ports.ubuntu.com/ubuntu-ports noble-updates main restricted universe multiverse
deb http://ports.ubuntu.com/ubuntu-ports noble-security main restricted universe multiverse
EOF`,

          `apt update -qq`,
          `apt -y full-upgrade`,
          `apt install -y build-essential xinput x11-xkb-utils usbutils`,
          'apt install -y linux-image-generic',
          `apt install -y linux-modules-${kernelLibVersion} linux-modules-extra-${kernelLibVersion}`,

          `depmod -a ${kernelLibVersion}`,
          // `apt install -y cloud-init=25.1.2-0ubuntu0~24.04.1`,
          `apt install -y cloud-init systemd-sysv openssh-server sudo locales udev util-linux systemd-sysv iproute2 netplan.io ca-certificates curl wget chrony`,
          `ln -sf /lib/systemd/systemd /sbin/init`,

          `apt-get update`,
          `DEBIAN_FRONTEND=noninteractive apt-get install -y apt-utils`,
          `DEBIAN_FRONTEND=noninteractive apt-get install -y tzdata kmod keyboard-configuration console-setup iputils-ping`,
        ],
        user: () => [
          `useradd -m -s /bin/bash -G sudo root`,
          `echo 'root:root' | chpasswd`,
          `mkdir -p /home/root/.ssh`,
          `echo '${fs.readFileSync(
            `/home/dd/engine/engine-private/deploy/id_rsa.pub`,
            'utf8',
          )}' > /home/root/.ssh/authorized_keys`,
          `chown -R root /home/root/.ssh`,
          `chmod 700 /home/root/.ssh`,
          `chmod 600 /home/root/.ssh/authorized_keys`,
        ],
        timezone: ({ timezone, chronyConfPath }, alias = 'chrony') => [
          `export DEBIAN_FRONTEND=noninteractive`,
          `ln -fs /usr/share/zoneinfo/${timezone} /etc/localtime`,
          `sudo dpkg-reconfigure --frontend noninteractive tzdata`,

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
' > ${chronyConfPath} `,
          `systemctl stop ${alias}`,

          // `${alias}d -q 'server ntp.ubuntu.com iburst'`,
          // `${alias}d -q 'server 0.europe.pool.ntp.org iburst'`,

          `sudo systemctl enable --now ${alias}`,
          `sudo systemctl restart ${alias}`,
          `sudo systemctl status ${alias}`,

          `chronyc sources`,
          `chronyc tracking`,

          `chronyc sourcestats -v`,
          `timedatectl status`,
        ],
        keyboard: () => [
          `sudo locale-gen en_US.UTF-8`,
          `sudo update-locale LANG=en_US.UTF-8`,
          `sudo sed -i 's/XKBLAYOUT="us"/XKBLAYOUT="es"/' /etc/default/keyboard`,
          `sudo dpkg-reconfigure --frontend noninteractive keyboard-configuration`,
          `sudo systemctl restart keyboard-setup.service`,
        ],
      },
    },

    workflowsConfig: {
      rpi4mb: {
        systemProvisioning: 'ubuntu',
        kernelLibVersion: `6.8.0-41-generic`,
        chronyc: {
          timezone: 'America/New_York',
          chronyConfPath: `/etc/chrony/chrony.conf`,
        },
        debootstrap: {
          image: {
            architecture: 'arm64',
            name: 'noble',
          },
        },
        maas: {
          image: {
            architecture: 'arm64/ga-24.04',
            name: 'ubuntu/noble',
          },
        },
        nfs: {
          mounts: {
            bind: ['/proc', '/sys', '/run'],
            rbind: ['/dev'],
          },
        },
      },
    },
  };
}

export default UnderpostBaremetal;
