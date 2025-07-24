import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';
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
      },
    ) {
      dotenv.config({ path: `${getUnderpostRootPath()}/.env`, override: true });
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      const dbProviderId = 'postgresql-17';
      const nfsHostPath = `${process.env.NFS_EXPORT_PATH}/${hostname}`;

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

        {
          let cmd;
          switch (workflowId) {
            case 'rpi4mb':
              cmd = [
                `sudo debootstrap`,
                `--arch=arm64`,
                `--variant=minbase`,
                `--foreign`, // arm64 on amd64
                [`noble`, `jammy`][0],
                nfsHostPath,
                `http://ports.ubuntu.com/ubuntu-ports/`,
              ];
              break;

            default:
              break;
          }
          shellExec(cmd.join(' '));
        }

        shellExec(`sudo podman create --name extract multiarch/qemu-user-static`);
        shellExec(`podman ps -a`);

        switch (workflowId) {
          case 'rpi4mb':
            shellExec(`sudo podman cp extract:/usr/bin/qemu-aarch64-static ${nfsHostPath}/usr/bin/`);
            break;

          default:
            break;
        }

        shellExec(`sudo podman rm extract`);
        shellExec(`podman ps -a`);
        shellExec(`file ${nfsHostPath}/bin/bash`); // expected: current arch executable identifier

        switch (workflowId) {
          case 'rpi4mb':
            shellExec(`sudo chroot ${nfsHostPath} /usr/bin/qemu-aarch64-static /bin/bash <<'EOF'
/debootstrap/debootstrap --second-stage
EOF`);
            break;

          default:
            break;
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
            }
          }
        }
      }
      return { isMounted };
    },

    workflowsConfig: {
      rpi4mb: {
        architecture: 'arm64/ga-24.04',
        nfs: {
          mounts: {
            bind: ['/proc', '/sys', '/run'],
            rbind: ['/dev', '/dev/pts'],
          },
        },
      },
    },
  };
}

export default UnderpostBaremetal;
