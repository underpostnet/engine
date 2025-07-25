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

        if (architecture !== callbackMetaData.runnerHost.architecture)
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

        shellExec(`sudo podman rm extract`);
        shellExec(`podman ps -a`);
        shellExec(`file ${nfsHostPath}/bin/bash`); // expected: current arch executable identifier

        if (architecture !== callbackMetaData.runnerHost.architecture)
          switch (debootstrapArch) {
            case 'arm64':
              shellExec(`sudo chroot ${nfsHostPath} /usr/bin/qemu-aarch64-static /bin/bash <<'EOF'
/debootstrap/debootstrap --second-stage
EOF`);
              break;

            default:
              break;
          }
        else {
          shellExec(`sudo chroot ${nfsHostPath} /bin/bash <<'EOF'
/debootstrap/debootstrap --second-stage
EOF`);
        }
        if (!isMounted) {
          UnderpostBaremetal.API.nfsMountCallback({ hostname, workflowId, mount: true });
        }
      }

      if (options.commission === true) {
      }
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

    workflowsConfig: {
      rpi4mb: {
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
